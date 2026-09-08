/**
 * Layout exploded view (PRD §E6).
 *
 * Modul ini sengaja **murni angka** — tanpa three.js, tanpa state, tanpa efek
 * samping. Itu yang membuat §E6 AC3 (non-overlap) dan AC4 (determinisme) bisa
 * dibuktikan di unit test alih-alih dinilai lewat mata (§11.1).
 *
 * ALGORITMA (mengikuti rekomendasi §E6)
 * -------------------------------------
 * 1. Urutkan: regio -> sistem -> koordinat anatomis (superior->inferior,
 *    lalu proksimal->distal). §E6 AC5 — inilah yang bikin explode punya nilai
 *    pedagogis, bukan sekadar efek keren.
 * 2. Ukuran sel = dimensi bbox TERBESAR di antara struktur yang ikut, seragam.
 * 3. Susun di grid 3D yang rasionya menyesuaikan aspect ratio viewport.
 * 4. Sisipkan padding 15%.
 *
 * KENAPA SEL SERAGAM
 * ------------------
 * Sel seragam membuat non-overlap bisa dibuktikan, bukan diuji-coba: kalau
 * setiap struktur muat dalam kubus berukuran `cell` dan pusat sel berjarak
 * minimal `cell * (1 + padding)` di salah satu sumbu, dua AABB mustahil
 * bersinggungan. Titik.
 *
 * Biayanya nyata dan diterima: satu struktur raksasa (mis. kulit) memaksa
 * seluruh grid membesar. Itu sebabnya §E6 AC8 memperingatkan saat struktur
 * terlalu banyak — explode memang dipakai setelah mengisolasi sistem.
 */

export type Vec3 = readonly [number, number, number]

export interface ExplodeItem {
  idx: number
  /** bbox dunia [min, max], satuan meter. */
  bbox: readonly [Vec3, Vec3]
  region: string
  system: string
}

export interface ExplodeOptions {
  /** width / height viewport. Menentukan rasio grid. */
  aspect: number
  /** Fraksi jarak antar-sel di atas ukuran sel. Default 0,15 (§E6). */
  padding?: number
}

export interface ExplodeLayout {
  /** structureIdx -> pusat tujuan di ruang dunia. */
  targets: Map<number, Vec3>
  /** Panjang sisi kubus sel (meter). */
  cell: number
  /** Jarak antar pusat sel (meter) = cell * (1 + padding). */
  pitch: number
  grid: { cols: number; rows: number; layers: number }
}

/**
 * Urutan regio dari superior ke inferior.
 *
 * §E6 AC5 minta urutan mempertahankan hubungan anatomis. Daftar ini adalah
 * definisi "superior->inferior" itu; jangan diacak.
 */
const REGION_ORDER = [
  'caput',
  'collum',
  'thorax',
  'abdomen',
  'pelvis_perineum',
  'dorsum',
  'membrum_superius',
  'membrum_inferius',
] as const

const regionRank = (r: string): number => {
  const i = (REGION_ORDER as readonly string[]).indexOf(r)
  return i < 0 ? REGION_ORDER.length : i
}

function extent(bbox: readonly [Vec3, Vec3]): Vec3 {
  return [bbox[1][0] - bbox[0][0], bbox[1][1] - bbox[0][1], bbox[1][2] - bbox[0][2]]
}

function center(bbox: readonly [Vec3, Vec3]): Vec3 {
  return [
    (bbox[0][0] + bbox[1][0]) / 2,
    (bbox[0][1] + bbox[1][1]) / 2,
    (bbox[0][2] + bbox[1][2]) / 2,
  ]
}

/**
 * Bentuk grid 3D yang mendekati aspect ratio viewport.
 *
 * Deterministik: hanya bergantung `n` dan `aspect`, tanpa nilai acak.
 */
export function gridShape(n: number, aspect: number): { cols: number; rows: number; layers: number } {
  if (n <= 0) return { cols: 0, rows: 0, layers: 0 }
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1

  // Kedalaman ditekan: layar itu 2D, menumpuk terlalu dalam bikin struktur
  // belakang tidak terbaca.
  const layers = Math.max(1, Math.round(Math.cbrt(n) / 1.6))
  const perLayer = Math.ceil(n / layers)
  const cols = Math.max(1, Math.round(Math.sqrt(perLayer * a)))
  const rows = Math.max(1, Math.ceil(perLayer / cols))
  return { cols, rows, layers }
}

/**
 * Hitung posisi tujuan tiap struktur.
 *
 * Deterministik (§E6 AC4): masukan sama -> keluaran sama, persis. Pengurutan
 * memakai `idx` sebagai pemutus seri terakhir supaya tidak bergantung pada
 * urutan array masukan.
 */
export function computeExplodeLayout(
  items: readonly ExplodeItem[],
  options: ExplodeOptions,
): ExplodeLayout {
  const padding = options.padding ?? 0.15

  if (items.length === 0) {
    return {
      targets: new Map(),
      cell: 0,
      pitch: 0,
      grid: { cols: 0, rows: 0, layers: 0 },
    }
  }

  // --- 1. urutan anatomis ---
  const sorted = [...items].sort((a, b) => {
    const ra = regionRank(a.region)
    const rb = regionRank(b.region)
    if (ra !== rb) return ra - rb
    if (a.system !== b.system) return a.system < b.system ? -1 : 1
    // superior -> inferior: Y menurun
    const ay = center(a.bbox)[1]
    const by = center(b.bbox)[1]
    if (ay !== by) return by - ay
    // proksimal -> distal: menjauh dari bidang midsagital
    const ax = Math.abs(center(a.bbox)[0])
    const bx = Math.abs(center(b.bbox)[0])
    if (ax !== bx) return ax - bx
    return a.idx - b.idx // pemutus seri: hasil tidak bergantung urutan masukan
  })

  // --- 2. sel seragam ---
  let cell = 0
  for (const it of items) {
    const e = extent(it.bbox)
    cell = Math.max(cell, e[0], e[1], e[2])
  }
  // Struktur berukuran nol (mesh degenerate) tidak boleh membuat pitch 0,
  // karena itu akan menumpuk semuanya di satu titik.
  if (!(cell > 0)) cell = 1e-3
  const pitch = cell * (1 + padding)

  // --- 3. grid ---
  const grid = gridShape(sorted.length, options.aspect)
  const { cols, rows, layers } = grid

  // Pusatkan grid di origin supaya kamera tidak perlu di-reframe.
  const x0 = (-(cols - 1) * pitch) / 2
  const y0 = ((rows - 1) * pitch) / 2 // baris pertama di ATAS
  const z0 = (-(layers - 1) * pitch) / 2

  const targets = new Map<number, Vec3>()
  sorted.forEach((it, i) => {
    const layer = Math.floor(i / (cols * rows))
    const withinLayer = i % (cols * rows)
    const row = Math.floor(withinLayer / cols)
    const col = withinLayer % cols
    targets.set(it.idx, [x0 + col * pitch, y0 - row * pitch, z0 + layer * pitch])
  })

  return { targets, cell, pitch, grid }
}
