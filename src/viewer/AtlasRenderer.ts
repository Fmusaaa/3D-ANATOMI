/**
 * AtlasRenderer — pemilik seluruh sumber daya GPU (§5.2).
 *
 * Hidup DI LUAR React. React hanya memanggil `mount(canvas)` lalu method
 * imperatif (`setVisibility`, `setPreset`, ...). Tidak ada satu pun impor
 * react/store/komponen di file ini — ditegakkan ESLint (§5.5).
 *
 * ATURAN RENDER ON-DEMAND (§5.2 aturan 4)
 * ---------------------------------------
 * Tidak ada rAF yang berjalan terus-menerus. Loop dijadwalkan hanya ketika
 * ada yang berubah, dan BERHENTI SENDIRI begitu damping selesai dan tidak ada
 * animasi. Idle = 0 panggilan render(), dan itu dibuktikan lewat penghitung
 * di dev overlay, bukan diklaim.
 */

import * as THREE from 'three'
import { BatchManager, systemIndex } from './BatchManager'
import { CameraController } from './CameraController'
import { PickingPass } from './PickingPass'
import { SelectState, StateTexture, type SelectStateValue } from './StateTexture'
import { VisibilityController, type SystemState } from './VisibilityController'
import { VISIBILITY_PRESETS } from './presets'
import { ViewerEmitter } from './events'
import { fetchBatch, fetchManifest, type AtlasManifest } from './loaders/AtlasLoader'
import type { ViewPreset, ViewerStats } from './types'

/** §E3 AC2: hover picking di-throttle <= 20 Hz. */
const HOVER_INTERVAL_MS = 50
/** §E3 AC8: multi-select maksimal 8 struktur. */
const MAX_SELECTION = 8
/** Gerakan pointer di bawah ambang ini masih dianggap klik, bukan drag. */
const CLICK_SLOP_PX = 4

/** Dev overlay di-push maksimal 10 Hz (§5.2 aturan 2). */
const STATS_INTERVAL_MS = 100

interface PerfMemory {
  usedJSHeapSize: number
}

export interface AtlasRendererOptions {
  /** Basis URL aset, mis. "/data". */
  dataUrl?: string
  /** Batasi devicePixelRatio; 2 sudah cukup, di atas itu sia-sia. */
  maxPixelRatio?: number
}

export class AtlasRenderer {
  readonly events = new ViewerEmitter()

  private renderer: THREE.WebGLRenderer | null = null
  private canvas: HTMLCanvasElement | null = null
  private readonly scene = new THREE.Scene()
  private camera: CameraController | null = null
  private batches: BatchManager | null = null
  private state: StateTexture | null = null
  private visibility: VisibilityController | null = null
  private picking: PickingPass | null = null

  // --- state seleksi: field class, bukan React state (§5.2) ---
  private hovered: number | null = null
  private selection: number[] = []
  private lastHoverAt = 0
  private cameraMoving = false
  private pointerDownPos: { x: number; y: number } | null = null
  private resizeObserver: ResizeObserver | null = null

  private readonly dataUrl: string
  private readonly maxPixelRatio: number

  // --- state per-frame: field class, TIDAK pernah masuk React (§5.2) ---
  private rafId: number | null = null
  private needsRender = false
  private disposed = false
  private totalRenders = 0
  /** Timestamp render dalam 1 detik terakhir — bukti idle = 0 render. */
  private renderTimes: number[] = []
  private lastFrameMs: number | null = null
  private lastStatsPush = 0
  private statsTimer: ReturnType<typeof setInterval> | null = null
  private structureCount = 0
  /** bbox per struktur (ruang dunia) untuk fly-to §E5 AC7. */
  private readonly structureBounds = new Map<number, THREE.Sphere>()
  /** structureIdx -> systemId, supaya auto-unhide tahu sistem mana. */
  private readonly systemOf = new Map<number, string>()

  constructor(options: AtlasRendererOptions = {}) {
    this.dataUrl = options.dataUrl ?? '/data'
    this.maxPixelRatio = options.maxPixelRatio ?? 2
    this.scene.background = new THREE.Color(0x0d0f12) // §8.1 gelap netral
  }

  // ------------------------------------------------------------------ mount

  mount(canvas: HTMLCanvasElement): void {
    if (this.renderer) throw new Error('AtlasRenderer: sudah ter-mount')
    this.canvas = canvas

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    if (!renderer.capabilities.isWebGL2) {
      this.events.emit('error', {
        message: 'WebGL2 tidak tersedia di browser ini. Atlas butuh WebGL2 (§5.1).',
      })
      renderer.dispose()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio))
    this.renderer = renderer

    this.camera = new CameraController(canvas)
    // Setiap gerakan kontrol menjadwalkan frame; tidak ada polling.
    this.camera.controls.addEventListener('change', this.requestRender)

    // Pencahayaan netral — tujuannya keterbacaan bentuk, bukan dramatis.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x384050, 2.0))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(1, 1.4, 1.2)
    this.scene.add(key)

    this.picking = new PickingPass()

    canvas.addEventListener('pointermove', this.handlePointerMove)
    canvas.addEventListener('pointerdown', this.handlePointerDown)
    canvas.addEventListener('pointerup', this.handlePointerUp)
    canvas.addEventListener('pointerleave', this.handlePointerLeave)
    window.addEventListener('keydown', this.handleKeyDown)

    this.resizeObserver = new ResizeObserver(this.handleResize)
    this.resizeObserver.observe(canvas)
    this.handleResize()

    // Detak statistik yang TERPISAH dari render loop.
    //
    // Tanpa ini, dev overlay membeku di angka terakhir saat loop berhenti dan
    // terus memampangkan "render/1 dtk: 2" selamanya — justru menyembunyikan
    // bukti idle yang seharusnya ditunjukkan. Timer ini hanya meng-emit
    // statistik; ia TIDAK pernah memanggil render(), jadi §E2 AC7 tetap utuh.
    this.statsTimer = setInterval(() => {
      this.events.emit('stats', this.stats())
    }, STATS_INTERVAL_MS * 2)
  }

  private handleResize = (): void => {
    const canvas = this.canvas
    const renderer = this.renderer
    if (!canvas || !renderer || !this.camera) return
    const w = Math.max(1, canvas.clientWidth)
    const h = Math.max(1, canvas.clientHeight)
    renderer.setSize(w, h, false)
    this.camera.resize(w, h)
    this.requestRender()
  }

  // ------------------------------------------------------------------- load

  async load(): Promise<void> {
    if (!this.renderer) throw new Error('AtlasRenderer: mount() dulu sebelum load()')
    try {
      const manifest: AtlasManifest = await fetchManifest(this.dataUrl)
      this.structureCount = manifest.structureCount

      const state = new StateTexture(manifest.structureCount)
      const batches = new BatchManager(state)
      const visibility = new VisibilityController(state)
      this.state = state
      this.batches = batches
      this.visibility = visibility

      let loaded = 0
      // Serial, bukan Promise.all: progres jadi bermakna dan memori puncak
      // tidak melonjak menahan 33 ArrayBuffer sekaligus.
      for (const entry of manifest.batches) {
        if (this.disposed) return
        const batch = await fetchBatch(this.dataUrl, entry)
        const sysIdx = systemIndex(batch.header.systemId)
        for (const st of batch.header.structures) {
          state.init(st.idx, sysIdx)
          visibility.register(batch.header.systemId, st.idx)
          this.systemOf.set(st.idx, batch.header.systemId)
          const lo = new THREE.Vector3().fromArray(st.bbox[0])
          const hi = new THREE.Vector3().fromArray(st.bbox[1])
          this.structureBounds.set(
            st.idx,
            new THREE.Sphere(
              lo.clone().add(hi).multiplyScalar(0.5),
              Math.max(lo.distanceTo(hi) / 2, 1e-4),
            ),
          )
        }
        this.expandBounds(batch.header.structures)
        batches.add(batch)
        loaded++
        this.events.emit('progress', {
          loaded,
          total: manifest.batches.length,
          lastSystem: batch.header.systemId,
        })
        this.requestRender()
      }

      state.flush()
      batches.syncTransparentPass()
      this.scene.add(batches.group)

      const bounds = this.worldBox.isEmpty()
        ? new THREE.Sphere(new THREE.Vector3(), 1)
        : this.worldBox.getBoundingSphere(new THREE.Sphere())
      this.camera?.frame(bounds)

      this.events.emit('ready', {
        structures: manifest.structureCount,
        triangles: manifest.triangleCount,
      })
      this.events.emit('systems', visibility.snapshot())
      this.requestRender()
    } catch (e) {
      this.events.emit('error', {
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      })
    }
  }

  /**
   * bbox dunia diakumulasi dari bbox per struktur di header `.atlas`.
   *
   * `Box3.setFromObject` tidak bisa dipakai: atribut posisi masih Int16
   * terkuantisasi dan baru jadi koordinat dunia di dalam vertex shader.
   */
  private readonly worldBox = new THREE.Box3()

  private expandBounds(
    structures: readonly {
      bbox: [[number, number, number], [number, number, number]]
    }[],
  ): void {
    const v = new THREE.Vector3()
    for (const st of structures) {
      this.worldBox.expandByPoint(v.fromArray(st.bbox[0]))
      this.worldBox.expandByPoint(v.fromArray(st.bbox[1]))
    }
  }

  // ------------------------------------------------------- API imperatif UI

  // --- kontrol per sistem (§E4) ---

  /** Toggle satu sistem. Beranimasi 180 ms (§E4 AC7). */
  setSystemVisible(systemId: string, visible: boolean): void {
    if (this.visibility?.setSystem(systemId, { visible })) {
      this.events.emit('systems', this.visibility.snapshot())
      this.requestRender()
    }
  }

  /** §E4 AC5: slider opacity global per sistem. */
  setSystemOpacity(systemId: string, opacity: number): void {
    if (this.visibility?.setSystem(systemId, { opacity, ghosted: false })) {
      this.events.emit('systems', this.visibility.snapshot())
      this.requestRender()
    }
  }

  /**
   * §E4 AC6. Sistem yang tidak disebut preset disembunyikan; yang ada di
   * `ghost` tetap tampil samar sebagai konteks spasial (§E4 AC4).
   */
  applyPreset(presetId: string): void {
    const preset = VISIBILITY_PRESETS.find((p) => p.id === presetId)
    const vis = this.visibility
    if (!preset || !vis) return

    const show = new Set(preset.show)
    const ghost = new Set(preset.ghost ?? [])
    let changed = false
    for (const s of vis.snapshot()) {
      if (show.has(s.id)) {
        changed = vis.setSystem(s.id, { visible: true, opacity: 1, ghosted: false }) || changed
      } else if (ghost.has(s.id)) {
        changed = vis.setSystem(s.id, { visible: true, ghosted: true }) || changed
      } else {
        changed = vis.setSystem(s.id, { visible: false }) || changed
      }
    }
    if (changed) {
      this.events.emit('systems', vis.snapshot())
      this.requestRender()
    }
  }

  systems(): SystemState[] {
    return this.visibility?.snapshot() ?? []
  }

  setVisibility(idx: number, visible: boolean): void {
    this.state?.setVisible(idx, visible)
    this.requestRender()
  }

  setSelectState(idx: number, selectState: SelectStateValue): void {
    this.state?.setSelectState(idx, selectState)
    this.requestRender()
  }

  setOpacity(idx: number, opacity: number): void {
    this.state?.setOpacity(idx, opacity)
    this.requestRender()
  }

  setPreset(preset: ViewPreset): void {
    this.camera?.setPreset(preset)
    this.requestRender()
  }

  resetView(): void {
    this.camera?.resetView()
    this.requestRender()
  }

  // -------------------------------------------------------- seleksi & hover

  /**
   * Jalankan pass picking untuk satu titik di kanvas.
   *
   * WARNING: sinkron dan memaksa GPU stall. Pemanggil bertanggung jawab
   * menahan frekuensinya (§5.3.5).
   */
  private pickAt(clientX: number, clientY: number): number | null {
    const canvas = this.canvas
    const renderer = this.renderer
    const camera = this.camera
    const batches = this.batches
    const picking = this.picking
    if (!canvas || !renderer || !camera || !batches || !picking) return null

    const rect = canvas.getBoundingClientRect()
    const dpr = renderer.getPixelRatio()
    const x = Math.floor((clientX - rect.left) * dpr)
    const y = Math.floor((clientY - rect.top) * dpr)
    const w = Math.floor(rect.width * dpr)
    const h = Math.floor(rect.height * dpr)
    if (x < 0 || y < 0 || x >= w || y >= h) return null

    batches.setPickingMode(true)
    let idx: number | null = null
    try {
      idx = picking.pick(renderer, this.scene, camera.camera, x, y, w, h)
    } finally {
      // Wajib dikembalikan walau picking melempar; kalau tidak, scene
      // ketinggalan memakai material picking dan layar jadi warna index.
      batches.setPickingMode(false)
    }
    if (idx !== null && idx >= this.structureCount) return null
    return idx
  }

  private readonly handlePointerMove = (e: PointerEvent): void => {
    // §E3 AC2: skip TOTAL saat kamera bergerak. readRenderTargetPixels
    // menghentikan pipeline GPU; melakukannya saat orbit = frame drop terukur.
    if (this.cameraMoving) return
    const now = performance.now()
    if (now - this.lastHoverAt < HOVER_INTERVAL_MS) return
    this.lastHoverAt = now

    const idx = this.pickAt(e.clientX, e.clientY)
    if (idx === this.hovered) return
    this.setHover(idx, e.clientX, e.clientY)
  }

  private setHover(idx: number | null, clientX: number, clientY: number): void {
    const state = this.state
    if (!state) return

    if (this.hovered !== null && !this.selection.includes(this.hovered)) {
      state.setSelectState(this.hovered, SelectState.Normal)
    }
    this.hovered = idx
    if (idx !== null && !this.selection.includes(idx)) {
      state.setSelectState(idx, SelectState.Hover)
    }
    // §8.4: kursor jadi pointer hanya di atas struktur yang bisa dipilih.
    if (this.canvas) this.canvas.style.cursor = idx === null ? '' : 'pointer'
    this.events.emit('hover', idx === null ? null : { idx, clientX, clientY })
    this.requestRender()
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY }
  }

  private readonly handlePointerUp = (e: PointerEvent): void => {
    const down = this.pointerDownPos
    this.pointerDownPos = null
    if (!down || e.button !== 0) return
    // Drag untuk orbit tidak boleh dianggap klik seleksi.
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return

    const idx = this.pickAt(e.clientX, e.clientY)
    if (idx === null) {
      this.clearSelection() // §E3 AC9: klik area kosong -> deselect
      return
    }
    this.select(idx, e.shiftKey)
  }

  private readonly handlePointerLeave = (): void => {
    if (this.hovered !== null) this.setHover(null, 0, 0)
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    // §E3 AC7
    if (e.key === 'Escape' && this.selection.length > 0) this.clearSelection()
  }

  /** §E3 AC3 + AC8. Struktur lain TIDAK otomatis di-dim; itu aksi terpisah. */
  select(idx: number, additive = false): void {
    const state = this.state
    if (!state) return

    if (additive) {
      const at = this.selection.indexOf(idx)
      if (at >= 0) {
        this.selection.splice(at, 1)
        state.setSelectState(idx, SelectState.Normal)
      } else {
        if (this.selection.length >= MAX_SELECTION) {
          const dropped = this.selection.shift()
          if (dropped !== undefined) state.setSelectState(dropped, SelectState.Normal)
        }
        this.selection.push(idx)
        state.setSelectState(idx, SelectState.Selected)
      }
    } else {
      for (const prev of this.selection) state.setSelectState(prev, SelectState.Normal)
      this.selection = [idx]
      state.setSelectState(idx, SelectState.Selected)
    }

    this.events.emit('selection', [...this.selection])
    this.requestRender()
  }

  clearSelection(): void {
    if (this.selection.length === 0) return
    for (const idx of this.selection) this.state?.setSelectState(idx, SelectState.Normal)
    this.selection = []
    this.events.emit('selection', [])
    this.requestRender()
  }

  /**
   * §E5 AC7: fly-to struktur (600 ms), pilih strukturnya, dan **otomatis
   * tampilkan lagi kalau sistemnya sedang disembunyikan**.
   *
   * Tanpa auto-unhide, memilih hasil pencarian sambil memakai preset
   * "Kerangka" akan menerbangkan kamera ke tempat kosong — pengalaman yang
   * membingungkan dan persis yang dicegah AC7.
   *
   * @returns systemId yang baru ditampilkan, atau null kalau tidak perlu.
   */
  revealAndFlyTo(idx: number, additive = false): string | null {
    const bounds = this.structureBounds.get(idx)
    if (!bounds) return null

    let revealed: string | null = null
    const systemId = this.systemOf.get(idx)
    if (systemId && this.visibility) {
      const sys = this.visibility.snapshot().find((x) => x.id === systemId)
      if (sys && (!sys.visible || sys.ghosted)) {
        this.visibility.setSystem(systemId, { visible: true, opacity: 1, ghosted: false })
        this.events.emit('systems', this.visibility.snapshot())
        revealed = systemId
      }
    }

    this.select(idx, additive)
    this.camera?.flyTo(bounds.center, bounds.radius)
    this.requestRender()
    return revealed
  }

  // ------------------------------------------------------------ render loop

  /**
   * Tandai bahwa satu frame perlu digambar, lalu jadwalkan rAF kalau belum ada.
   *
   * Ini SATU-SATUNYA pintu masuk ke render loop. Tidak ada rAF permanen.
   */
  readonly requestRender = (): void => {
    if (this.disposed) return
    this.needsRender = true
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.frame)
  }

  private readonly frame = (now: number): void => {
    this.rafId = null
    if (this.disposed) return

    const renderer = this.renderer
    const camera = this.camera
    if (!renderer || !camera) return

    // Kamera bergerak sendiri (damping / animasi preset) -> perlu frame lagi.
    const cameraMoving = camera.update(now)
    this.cameraMoving = cameraMoving
    const fading = this.visibility?.update(now) ?? false
    if (this.state?.flush()) this.needsRender = true
    if (this.batches?.syncTransparentPass()) this.needsRender = true

    if (cameraMoving || fading || this.needsRender) {
      const t0 = performance.now()
      renderer.render(this.scene, camera.camera)
      this.lastFrameMs = performance.now() - t0
      this.totalRenders++
      this.renderTimes.push(now)
      this.needsRender = false
    }

    // Jadwalkan lagi HANYA selama kamera masih bergerak. Begitu damping
    // selesai, loop mati total dan idle benar-benar 0 render.
    if ((cameraMoving || fading) && this.rafId === null) {
      this.rafId = requestAnimationFrame(this.frame)
    }

    this.pushStats(now)
  }

  private pushStats(now: number): void {
    // Buang timestamp yang lebih tua dari 1 detik.
    const cutoff = now - 1000
    while (this.renderTimes.length > 0 && (this.renderTimes[0] as number) < cutoff) {
      this.renderTimes.shift()
    }
    if (now - this.lastStatsPush < STATS_INTERVAL_MS) return
    this.lastStatsPush = now
    this.events.emit('stats', this.stats())
  }

  /**
   * Snapshot statistik. Aman dipanggil dari UI kapan saja — termasuk saat loop
   * mati, yang justru kasus penting: di situlah `rendersLastSecond` harus 0.
   */
  stats(): ViewerStats {
    const info = this.renderer?.info.render
    const mem = (performance as unknown as { memory?: PerfMemory }).memory
    const now = performance.now()
    const cutoff = now - 1000
    const recent = this.renderTimes.filter((t) => t >= cutoff)

    return {
      fps: recent.length > 1 ? Math.round(recent.length) : null,
      frameMs: this.lastFrameMs === null ? null : +this.lastFrameMs.toFixed(2),
      drawCalls: info?.calls ?? 0,
      triangles: info?.triangles ?? 0,
      visibleStructures: this.state?.visible ?? 0,
      totalStructures: this.structureCount,
      rendersLastSecond: recent.length,
      totalRenders: this.totalRenders,
      geometryMB: +((this.batches?.geometryBytes ?? 0) / 1024 / 1024).toFixed(1),
      jsHeapMB: mem ? +(mem.usedJSHeapSize / 1024 / 1024).toFixed(1) : null,
      batches: this.batches?.batchCount ?? 0,
      transparentPass: this.batches?.transparentPass ?? false,
    }
  }

  // ---------------------------------------------------------------- dispose

  dispose(): void {
    this.disposed = true
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    if (this.statsTimer !== null) clearInterval(this.statsTimer)
    this.statsTimer = null
    this.canvas?.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas?.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas?.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas?.removeEventListener('pointerleave', this.handlePointerLeave)
    window.removeEventListener('keydown', this.handleKeyDown)
    this.picking?.dispose()
    this.resizeObserver?.disconnect()
    this.camera?.controls.removeEventListener('change', this.requestRender)
    this.camera?.dispose()
    this.batches?.dispose()
    this.state?.dispose()
    this.scene.clear()
    this.renderer?.dispose()
    this.renderer = null
    this.events.clear()
  }
}
