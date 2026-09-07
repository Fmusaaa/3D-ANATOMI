/**
 * Spike Fase 1 (PRD §14.3) — mengukur, bukan membangun.
 *
 * Membandingkan dua pendekatan render pada data Fase 0 yang SEBENARNYA
 * (2.234 struktur, 3.027.112 segitiga), untuk memutuskan D2 (§13):
 *
 *   A. shader custom + state texture   (§5.3)
 *   B. THREE.BatchedMesh bawaan        (§5.3.6)
 *
 * Diukur: FPS orbit, jumlah draw call, memori, waktu muat, jumlah panggilan
 * render saat idle.
 *
 * Ini kode sekali pakai untuk mengambil keputusan. Bukan basis renderer final.
 */

import * as THREE from 'three'
import {
  fetchBatch,
  fetchManifest,
  type AtlasBatch,
  type AtlasManifest,
} from '../viewer/loaders/AtlasLoader'
import {
  FRAGMENT_COLOR,
  FRAGMENT_DECLARATIONS,
  VERTEX_BODY,
  VERTEX_DECLARATIONS,
  VERTEX_NORMAL_BODY,
} from '../viewer/shaders/atlasChunks'

const DATA_URL = '/data'

interface Measurement {
  variant: string
  loadMs: number
  buildMs: number
  drawCalls: number
  triangles: number
  structures: number
  fpsMedian: number
  fpsP5: number
  frameMsMax: number
  jsHeapMB: number | null
  geometryMB: number
  idleRenders: number
}

const log = (msg: string): void => {
  const el = document.getElementById('log')
  if (el) el.textContent += msg + '\n'
  console.log(msg)
}

// --------------------------------------------------------------------------
// Palet per sistem (§8.1: warna punya makna, mendekati konvensi atlas anatomi)
// --------------------------------------------------------------------------

const SYSTEM_ORDER = [
  'systema_skeletale',
  'systema_articulare',
  'systema_musculare',
  'systema_nervosum',
  'systema_cardiovasculare',
  'systema_lymphoideum',
  'systema_respiratorium',
  'systema_digestorium',
  'systema_urinarium',
  'systema_genitale',
  'glandulae_endocrinae',
  'organa_sensuum',
  'integumentum_commune',
] as const

const SYSTEM_COLORS: Record<string, number> = {
  systema_skeletale: 0xe8dcc8,
  systema_articulare: 0xbcd4e6,
  systema_musculare: 0xa8433f,
  systema_nervosum: 0xe8c547,
  systema_cardiovasculare: 0xc0392b,
  systema_lymphoideum: 0x5fa85f,
  systema_respiratorium: 0x7fb3d5,
  systema_digestorium: 0xd8a25e,
  systema_urinarium: 0x9b7fc4,
  systema_genitale: 0xc98fb0,
  glandulae_endocrinae: 0x6ec6b8,
  organa_sensuum: 0xe0e0e0,
  integumentum_commune: 0xd9b39c,
}

function paletteTexture(): THREE.DataTexture {
  const data = new Uint8Array(SYSTEM_ORDER.length * 4)
  SYSTEM_ORDER.forEach((id, i) => {
    const c = new THREE.Color(SYSTEM_COLORS[id] ?? 0x888888)
    data[i * 4 + 0] = Math.round(c.r * 255)
    data[i * 4 + 1] = Math.round(c.g * 255)
    data[i * 4 + 2] = Math.round(c.b * 255)
    data[i * 4 + 3] = 255
  })
  const tex = new THREE.DataTexture(data, SYSTEM_ORDER.length, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

// --------------------------------------------------------------------------
// State texture (§5.3.2)
// --------------------------------------------------------------------------

class StateTexture {
  readonly texture: THREE.DataTexture
  private readonly data: Float32Array
  readonly height: number

  constructor(count: number) {
    this.height = Math.max(1, Math.ceil(count / 256))
    this.data = new Float32Array(256 * this.height * 4)
    this.texture = new THREE.DataTexture(
      this.data,
      256,
      this.height,
      THREE.RGBAFormat,
      THREE.FloatType,
    )
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.needsUpdate = true
  }

  set(idx: number, visible: boolean, selectState: number, opacity: number, systemId: number): void {
    const o = idx * 4
    this.data[o] = visible ? 1 : 0
    this.data[o + 1] = selectState
    this.data[o + 2] = opacity
    this.data[o + 3] = systemId
  }

  flush(): void {
    this.texture.needsUpdate = true
  }

  get bytes(): number {
    return this.data.byteLength
  }
}

// --------------------------------------------------------------------------
// Varian A — shader custom + state texture
// --------------------------------------------------------------------------

function buildVariantA(
  batches: AtlasBatch[],
  stateTex: StateTexture,
  palette: THREE.DataTexture,
  passes: readonly ('opaque' | 'transparent')[],
): { group: THREE.Group; geometryBytes: number } {
  const group = new THREE.Group()
  let geometryBytes = 0

  for (const batch of batches) {
    const g = new THREE.BufferGeometry()
    // Int16 mentah; dekuantisasi terjadi di vertex shader (satu MAD).
    g.setAttribute('position', new THREE.Int16BufferAttribute(batch.position, 3))
    g.setAttribute('aOctNormal', new THREE.Int8BufferAttribute(batch.normal, 2))
    g.setAttribute('aStructureIdx', new THREE.Uint16BufferAttribute(batch.structureIdx, 1))
    g.setIndex(new THREE.BufferAttribute(batch.index, 1))

    geometryBytes +=
      batch.position.byteLength +
      batch.normal.byteLength +
      batch.structureIdx.byteLength +
      batch.index.byteLength

    for (const pass of passes) {
      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.72,
        metalness: 0.0,
        transparent: pass === 'transparent',
        depthWrite: pass === 'opaque',
      })
      mat.onBeforeCompile = (shader) => {
        shader.uniforms['uStateTex'] = { value: stateTex.texture }
        shader.uniforms['uStateTexHeight'] = { value: stateTex.height }
        shader.uniforms['uPaletteTex'] = { value: palette }
        shader.uniforms['uPaletteSize'] = { value: SYSTEM_ORDER.length }
        shader.uniforms['uOpaquePass'] = { value: pass === 'opaque' ? 1 : 0 }
        shader.uniforms['uQuantScale'] = { value: new THREE.Vector3(...batch.header.quantScale) }
        shader.uniforms['uQuantOffset'] = { value: new THREE.Vector3(...batch.header.quantOffset) }

        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
          .replace('#include <beginnormal_vertex>', VERTEX_NORMAL_BODY)
          .replace('#include <begin_vertex>', VERTEX_BODY)

        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>\n${FRAGMENT_COLOR}`,
          )
      }
      // Kunci cache program per pass supaya three tidak menyatukan keduanya.
      mat.customProgramCacheKey = () => `atlasA-${pass}-${batch.header.systemId}`

      const mesh = new THREE.Mesh(g, mat)
      mesh.frustumCulled = false // bbox tidak berarti: posisi terkuantisasi
      mesh.renderOrder = pass === 'opaque' ? 0 : 1
      group.add(mesh)
    }
  }

  return { group, geometryBytes }
}

// --------------------------------------------------------------------------
// Varian B — THREE.BatchedMesh
// --------------------------------------------------------------------------

function buildVariantB(batches: AtlasBatch[]): {
  mesh: THREE.BatchedMesh
  geometryBytes: number
  note: string
} {
  let totalVerts = 0
  let totalIdx = 0
  let totalStructures = 0
  for (const b of batches) {
    totalVerts += b.header.vertexCount
    totalIdx += b.header.indexCount
    totalStructures += b.header.structures.length
  }

  // BatchedMesh butuh geometri float32 terpisah per struktur; dia tidak bisa
  // memakai atribut Int16 terkuantisasi seperti varian A.
  const geometryBytes = totalVerts * (3 * 4 + 3 * 4) + totalIdx * 4

  const mesh = new THREE.BatchedMesh(
    totalStructures,
    totalVerts,
    totalIdx,
    new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.0 }),
  )
  mesh.frustumCulled = false

  const color = new THREE.Color()
  for (const batch of batches) {
    const qs = batch.header.quantScale
    const qo = batch.header.quantOffset
    const base = SYSTEM_COLORS[batch.header.systemId] ?? 0x888888

    for (const st of batch.header.structures) {
      // Ambil sub-mesh struktur ini dan remap ke index lokal.
      const idxSlice = batch.index.subarray(st.indexStart, st.indexStart + st.indexCount)
      const remap = new Map<number, number>()
      const localIdx = new Uint32Array(idxSlice.length)
      const pos: number[] = []
      const nrm: number[] = []

      for (let i = 0; i < idxSlice.length; i++) {
        const gi = idxSlice[i] as number
        let li = remap.get(gi)
        if (li === undefined) {
          li = remap.size
          remap.set(gi, li)
          pos.push(
            (batch.position[gi * 3] as number) * (qs[0]) + (qo[0]),
            (batch.position[gi * 3 + 1] as number) * (qs[1]) + (qo[1]),
            (batch.position[gi * 3 + 2] as number) * (qs[2]) + (qo[2]),
          )
          // Dekode oct (signNotZero) di CPU — BatchedMesh butuh normal float.
          const ex = (batch.normal[gi * 2] as number) / 127
          const ey = (batch.normal[gi * 2 + 1] as number) / 127
          let nx = ex
          let ny = ey
          const nz = 1 - Math.abs(ex) - Math.abs(ey)
          if (nz < 0) {
            const sx = ex >= 0 ? 1 : -1
            const sy = ey >= 0 ? 1 : -1
            nx = (1 - Math.abs(ey)) * sx
            ny = (1 - Math.abs(ex)) * sy
          }
          const len = Math.hypot(nx, ny, nz) || 1
          nrm.push(nx / len, ny / len, nz / len)
        }
        localIdx[i] = li
      }

      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
      g.setIndex(new THREE.BufferAttribute(localIdx, 1))

      const geoId = mesh.addGeometry(g, pos.length / 3, localIdx.length)
      const instId = mesh.addInstance(geoId)
      mesh.setColorAt(instId, color.setHex(base))
      g.dispose()
    }
  }

  return {
    mesh,
    geometryBytes,
    note: 'BatchedMesh menuntut geometri float32 per struktur; atribut Int16 terkuantisasi tidak terpakai.',
  }
}

// --------------------------------------------------------------------------
// Harness pengukuran
// --------------------------------------------------------------------------

interface PerfMemory {
  usedJSHeapSize: number
}

function heapMB(): number | null {
  const mem = (performance as unknown as { memory?: PerfMemory }).memory
  return mem ? +(mem.usedJSHeapSize / 1024 / 1024).toFixed(1) : null
}

async function measure(
  label: string,
  object: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  loadMs: number,
  buildMs: number,
  geometryBytes: number,
  stats: { triangles: number; structures: number },
): Promise<Measurement> {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0d0f12)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.0))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(1, 1.4, 1.2)
  scene.add(key)
  scene.add(object)

  const camera = new THREE.PerspectiveCamera(45, 1440 / 900, 0.01, 100)
  const box = new THREE.Box3().setFromObject(object)
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const dist = sphere.radius / Math.sin((camera.fov * Math.PI) / 360)
  camera.position.set(0, sphere.center.y, dist * 1.2)
  camera.lookAt(sphere.center)

  // Warm-up: kompilasi shader & upload GPU tidak boleh mencemari sampel FPS.
  renderer.render(scene, camera)
  await new Promise((r) => setTimeout(r, 300))

  // --- Idle: tanpa perubahan, tidak boleh ada render sama sekali (§E2 AC7) ---
  let idleRenders = 0
  const needsRender = false
  const idleStart = performance.now()
  await new Promise<void>((resolve) => {
    const done = setTimeout(resolve, 2500) // jaring pengaman kalau rAF ter-throttle
    const tick = (): void => {
      if (needsRender) {
        renderer.render(scene, camera)
        idleRenders++
      }
      if (performance.now() - idleStart < 1000) requestAnimationFrame(tick)
      else {
        clearTimeout(done)
        resolve()
      }
    }
    requestAnimationFrame(tick)
  })

  // --- Orbit: waktu GPU per frame ---
  //
  // ⚠️ Dua metode yang SALAH dan sudah dicoba:
  //
  //  1. requestAnimationFrame. Pane browser bisa tersembunyi, dan tab
  //     tersembunyi membuat rAF ter-throttle habis — sampelnya jadi sampah
  //     (percobaan pertama menghasilkan "Infinity"). rAF juga terkunci vsync,
  //     jadi kedua varian sama-sama mentok 60 dan bedanya tak terlihat.
  //  2. `gl.finish()` + jam dinding. Di ANGLE/D3D11 `finish()` ternyata tidak
  //     benar-benar menunggu GPU: hasilnya 0,4 ms untuk 6 juta segitiga
  //     (~15 Gtri/s), mustahil. Angka itu dibuang.
  //
  // Yang dipakai: EXT_disjoint_timer_query_webgl2 — nanodetik GPU sungguhan,
  // bebas vsync dan bebas visibilitas. Kalau ekstensi tidak ada, hasilnya
  // ditandai tidak sahih alih-alih dilaporkan seolah-olah valid.
  const FRAMES = 60
  const glCtx = renderer.getContext() as WebGL2RenderingContext

  const renderFrame = (i: number): void => {
    const angle = (i / FRAMES) * Math.PI * 2
    camera.position.set(
      Math.sin(angle) * dist * 1.2,
      sphere.center.y + Math.sin(angle * 0.5) * dist * 0.15,
      Math.cos(angle) * dist * 1.2,
    )
    camera.lookAt(sphere.center)
    renderer.render(scene, camera)
  }

  // Warm-up kedua: isi cache pipeline pada sudut pandang yang bervariasi.
  for (let i = 0; i < 10; i++) renderFrame(i)
  glCtx.finish()

  const timerExt = glCtx.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number
    GPU_DISJOINT_EXT: number
  } | null

  // ⚠️ Jangan menunggu di antara frame. Tab tersembunyi meng-clamp setTimeout
  // ke >= 1 detik, jadi polling per frame membuat harness menggantung menit-an
  // (dan itu memang terjadi). Terbitkan SEMUA query dulu, tunggu SEKALI, baru
  // panen hasilnya.
  const frames: number[] = []
  if (timerExt) {
    const queries: WebGLQuery[] = []
    for (let i = 0; i < FRAMES; i++) {
      const query = glCtx.createQuery()
      if (!query) break
      glCtx.beginQuery(timerExt.TIME_ELAPSED_EXT, query)
      renderFrame(i)
      glCtx.endQuery(timerExt.TIME_ELAPSED_EXT)
      queries.push(query)
    }
    glCtx.flush()

    // Tunggu sekali sampai query terakhir siap (maks ~5 detik).
    for (let spin = 0; spin < 10; spin++) {
      await new Promise((r) => setTimeout(r, 500))
      const lastQ = queries[queries.length - 1]
      if (lastQ && (glCtx.getQueryParameter(lastQ, glCtx.QUERY_RESULT_AVAILABLE) as boolean)) break
    }

    const disjoint = glCtx.getParameter(timerExt.GPU_DISJOINT_EXT) as boolean
    for (const q of queries) {
      if (
        !disjoint &&
        (glCtx.getQueryParameter(q, glCtx.QUERY_RESULT_AVAILABLE) as boolean)
      ) {
        frames.push((glCtx.getQueryParameter(q, glCtx.QUERY_RESULT) as number) / 1e6)
      }
      glCtx.deleteQuery(q)
    }
  }
  if (frames.length === 0) frames.push(Number.NaN) // ditandai tidak sahih di laporan

  const sorted = frames.slice().sort((a, b) => a - b)
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  const drawCalls = renderer.info.render.calls
  const triangles = renderer.info.render.triangles

  scene.remove(object)

  return {
    variant: label,
    loadMs: Math.round(loadMs),
    buildMs: Math.round(buildMs),
    drawCalls,
    triangles,
    structures: stats.structures,
    fpsMedian: +(1000 / at(0.5)).toFixed(1),
    fpsP5: +(1000 / at(0.95)).toFixed(1), // frame ke-95 terlama = FPS persentil 5
    frameMsMax: +at(0.999).toFixed(1),
    jsHeapMB: heapMB(),
    geometryMB: +(geometryBytes / 1024 / 1024).toFixed(1),
    idleRenders,
  }
}

// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1) // ukur pada 1x supaya angka bisa dibandingkan
  renderer.setSize(1440, 900, false)

  const gl = renderer.getContext()
  log(`WebGL2: ${renderer.capabilities.isWebGL2}`)
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  if (dbg) log(`GPU: ${String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))}`)
  log(`three: ${THREE.REVISION}`)

  log('\nmemuat manifest...')
  const t0 = performance.now()
  const manifest: AtlasManifest = await fetchManifest(DATA_URL)
  const batches = await Promise.all(manifest.batches.map((b) => fetchBatch(DATA_URL, b)))
  const loadMs = performance.now() - t0
  const structures = batches.reduce((n, b) => n + b.header.structures.length, 0)
  log(`  ${batches.length} batch, ${structures} struktur, ${manifest.triangleCount.toLocaleString('id')} segitiga`)
  log(`  muat+parse: ${loadMs.toFixed(0)} ms`)

  const results: Measurement[] = []

  // ---- Varian A ----
  log('\n[A] shader custom + state texture ...')
  const tA = performance.now()
  const stateTex = new StateTexture(manifest.structureCount)
  const sysIndex = new Map(SYSTEM_ORDER.map((s, i) => [s as string, i]))
  for (const b of batches) {
    const sid = sysIndex.get(b.header.systemId) ?? 0
    for (const st of b.header.structures) stateTex.set(st.idx, true, 0, 1, sid)
  }
  stateTex.flush()
  const palette = paletteTexture()
  const a = buildVariantA(batches, stateTex, palette, ['opaque', 'transparent'])
  const buildA = performance.now() - tA
  results.push(
    await measure('A: shader custom + state texture (2 pass)', a.group, renderer, loadMs, buildA, a.geometryBytes, {
      triangles: manifest.triangleCount,
      structures,
    }),
  )
  for (const child of a.group.children) {
    const mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = child as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material
    >
    mesh.geometry.dispose()
    mesh.material.dispose()
  }

  // ---- Varian A1: hanya pass opaque ----
  // Saat tidak ada struktur transparan, pass kedua tetap memproses SELURUH
  // vertex lalu men-discard tiap fragmen. Diukur terpisah supaya biayanya
  // kelihatan, bukan diasumsikan.
  log('[A1] shader custom, hanya pass opaque ...')
  const tA1 = performance.now()
  const a1 = buildVariantA(batches, stateTex, palette, ['opaque'])
  const buildA1 = performance.now() - tA1
  results.push(
    await measure('A1: shader custom (hanya pass opaque)', a1.group, renderer, loadMs, buildA1, a1.geometryBytes, {
      triangles: manifest.triangleCount,
      structures,
    }),
  )
  for (const child of a1.group.children) {
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>
    mesh.geometry.dispose()
    mesh.material.dispose()
  }

  // ---- Varian B ----
  log('[B] THREE.BatchedMesh ...')
  const tB = performance.now()
  let bResult: Measurement | null = null
  let bNote = ''
  try {
    const b = buildVariantB(batches)
    bNote = b.note
    const buildB = performance.now() - tB
    bResult = await measure('B: THREE.BatchedMesh', b.mesh, renderer, loadMs, buildB, b.geometryBytes, {
      triangles: manifest.triangleCount,
      structures,
    })
    results.push(bResult)
    b.mesh.dispose()
  } catch (e) {
    bNote = `GAGAL: ${e instanceof Error ? e.message : String(e)}`
    log(`  [B] gagal: ${bNote}`)
  }

  log('\n' + '='.repeat(64))
  for (const r of results) {
    log(`\n${r.variant}`)
    if (Number.isNaN(r.frameMsMax)) {
      log('  waktu GPU         : TIDAK SAHIH (timer query tak tersedia/disjoint)')
    } else {
      const med = 1000 / r.fpsMedian
      const p95 = 1000 / r.fpsP5
      log(`  GPU/frame median  : ${med.toFixed(2)} ms  (~${Math.round(1000 / med)} fps kalau GPU-bound)`)
      log(`  GPU/frame p95     : ${p95.toFixed(2)} ms  (~${Math.round(1000 / p95)} fps)`)
      log(`  GPU/frame terlama : ${r.frameMsMax} ms`)
    }
    log(`  draw call         : ${r.drawCalls}`)
    log(`  segitiga terrender: ${r.triangles.toLocaleString('id')}`)
    log(`  build             : ${r.buildMs} ms`)
    log(`  geometri GPU      : ${r.geometryMB} MB`)
    log(`  JS heap           : ${r.jsHeapMB ?? 'n/a'} MB`)
    log(`  render saat idle  : ${r.idleRenders}  ${r.idleRenders === 0 ? '(OK, §E2 AC7)' : '(GAGAL)'}`)
  }
  if (bNote) log(`\ncatatan B: ${bNote}`)

  ;(window as unknown as { __SPIKE__: Measurement[] }).__SPIKE__ = results
  log('\nSELESAI')
}

main().catch((e: unknown) => {
  log(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
})
