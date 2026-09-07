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
import { StateTexture, type SelectStateValue } from './StateTexture'
import { ViewerEmitter } from './events'
import { fetchBatch, fetchManifest, type AtlasManifest } from './loaders/AtlasLoader'
import type { ViewPreset, ViewerStats } from './types'

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
      this.state = state
      this.batches = batches

      let loaded = 0
      // Serial, bukan Promise.all: progres jadi bermakna dan memori puncak
      // tidak melonjak menahan 33 ArrayBuffer sekaligus.
      for (const entry of manifest.batches) {
        if (this.disposed) return
        const batch = await fetchBatch(this.dataUrl, entry)
        const sysIdx = systemIndex(batch.header.systemId)
        for (const st of batch.header.structures) state.init(st.idx, sysIdx)
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
    if (this.state?.flush()) this.needsRender = true
    if (this.batches?.syncTransparentPass()) this.needsRender = true

    if (cameraMoving || this.needsRender) {
      const t0 = performance.now()
      renderer.render(this.scene, camera.camera)
      this.lastFrameMs = performance.now() - t0
      this.totalRenders++
      this.renderTimes.push(now)
      this.needsRender = false
    }

    // Jadwalkan lagi HANYA selama kamera masih bergerak. Begitu damping
    // selesai, loop mati total dan idle benar-benar 0 render.
    if (cameraMoving && this.rafId === null) {
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
