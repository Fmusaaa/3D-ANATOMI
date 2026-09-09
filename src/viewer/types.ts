/**
 * Tipe publik viewer.
 *
 * ⚠️ Ini SATU-SATUNYA modul viewer (bersama `events.ts`) yang boleh diimpor
 * `src/components/**` — dan hanya sebagai tipe. Lihat `eslint.config.js`.
 * Isinya harus bebas three.js supaya batas §5.5 tidak bocor lewat tipe.
 */

/** Preset sudut pandang (§E2 AC5). */
export type ViewPreset =
  | 'anterior'
  | 'posterior'
  | 'lateral-dextra'
  | 'lateral-sinistra'
  | 'superior'
  | 'inferior'

export const VIEW_PRESETS: readonly ViewPreset[] = [
  'anterior',
  'posterior',
  'lateral-dextra',
  'lateral-sinistra',
  'superior',
  'inferior',
]

export const VIEW_PRESET_LABELS: Record<ViewPreset, string> = {
  anterior: 'Anterior',
  posterior: 'Posterior',
  'lateral-dextra': 'Lateral kanan',
  'lateral-sinistra': 'Lateral kiri',
  superior: 'Superior',
  inferior: 'Inferior',
}

/**
 * Bidang potong anatomis (§E13).
 *
 * Tiga bidang baku anatomi, bukan sumbu sembarang — mahasiswa membaca potongan
 * dalam istilah ini, dan CT/MRI juga memakainya.
 */
export type ClipAxis = 'sagittal' | 'coronal' | 'transverse'

export interface ClipSpec {
  axis: ClipAxis
  /** −1..1 relatif terhadap bounding box: −1 tepi negatif, 0 tengah, +1 tepi positif. */
  position: number
  /** Balik sisi mana yang dipertahankan. */
  flipped: boolean
}

/**
 * Ketiga bahasa diisi lengkap, sederajat (D-027).
 *
 * Tidak ada yang boleh jatuh diam-diam ke bahasa lain: kalau `en` kosong dan
 * UI menampilkan Latin, user mengira itu istilah Inggris. Nama bidang anatomi
 * cukup sedikit untuk ditulis ketiganya di sini.
 */
export const CLIP_AXIS_LABEL: Record<ClipAxis, { la: string; id: string; en: string }> = {
  sagittal: { la: 'Planum sagittale', id: 'Bidang sagital', en: 'Sagittal plane' },
  coronal: { la: 'Planum coronale', id: 'Bidang koronal', en: 'Coronal plane' },
  transverse: { la: 'Planum transversale', id: 'Bidang transversal', en: 'Transverse plane' },
}

/**
 * Bentuk pendek untuk tombol sempit.
 *
 * D-027 mengizinkan ini: yang dilarang adalah menampilkan satu bahasa lebih
 * utama, bukan memendekkan. Nama penuh ketiga bahasa tetap ada di tooltip,
 * jadi tidak ada bahasa yang hilang.
 */
export const CLIP_AXIS_SHORT: Record<ClipAxis, { la: string; id: string; en: string }> = {
  sagittal: { la: 'Sagittale', id: 'Sagital', en: 'Sagittal' },
  coronal: { la: 'Coronale', id: 'Koronal', en: 'Coronal' },
  transverse: { la: 'Transversale', id: 'Transversal', en: 'Transverse' },
}

export type ClipSide = 'sinistra' | 'dextra' | 'anterior' | 'posterior' | 'superior' | 'inferior'

export const CLIP_SIDE_LABEL: Record<ClipSide, { la: string; id: string; en: string }> = {
  sinistra: { la: 'Sinistra', id: 'Kiri pasien', en: "Patient's left" },
  dextra: { la: 'Dextra', id: 'Kanan pasien', en: "Patient's right" },
  anterior: { la: 'Anterior', id: 'Depan', en: 'Anterior' },
  posterior: { la: 'Posterior', id: 'Belakang', en: 'Posterior' },
  superior: { la: 'Superior', id: 'Atas', en: 'Superior' },
  inferior: { la: 'Inferior', id: 'Bawah', en: 'Inferior' },
}

/**
 * Sisi tubuh yang tersisa setelah pemotongan.
 *
 * Menyebut sisi yang DIPERTAHANKAN, bukan yang dibuang — itu yang dilihat user
 * di layar. Ditaruh di `types.ts` karena UI perlu memanggilnya, dan §5.5 hanya
 * mengizinkan komponen menyentuh viewer lewat modul ini.
 *
 * ⚠️ Sisi KANAN pasien ada di X negatif (lihat `04_pack_batches.py` dan preset
 * `lateral-dextra`). Setengah-ruang +X karena itu adalah sisi KIRI.
 */
export function keptSide(spec: ClipSpec): ClipSide {
  switch (spec.axis) {
    case 'sagittal':
      return spec.flipped ? 'dextra' : 'sinistra'
    case 'coronal':
      return spec.flipped ? 'posterior' : 'anterior'
    case 'transverse':
      return spec.flipped ? 'inferior' : 'superior'
  }
}

/** Status satu sistem organ, untuk panel kontrol visibilitas (§E4). */
export interface SystemState {
  id: string
  count: number
  visible: boolean
  opacity: number
  ghosted: boolean
}

/** Status pemuatan aset, untuk skeleton/progress di UI (§8.4). */
export interface LoadProgress {
  loaded: number
  total: number
  /** systemId batch terakhir yang selesai dimuat. */
  lastSystem: string | null
}

/**
 * Statistik dev overlay — wajib ada sejak Fase 1 (§14.3).
 *
 * Di-push ke UI maksimal 10x/detik (§5.2 aturan 2); jangan pernah dibaca
 * per-frame dari React.
 */
export interface ViewerStats {
  /** FPS saat sedang merender. `null` kalau idle (tidak ada render sama sekali). */
  fps: number | null
  frameMs: number | null
  drawCalls: number
  triangles: number
  /** Jumlah struktur dengan visible = true. */
  visibleStructures: number
  totalStructures: number
  /**
   * Panggilan render() dalam 1 detik terakhir. Saat idle HARUS 0 —
   * ini bukti §E2 AC7, bukan klaim.
   */
  rendersLastSecond: number
  /** Total render sejak viewer dibuat. */
  totalRenders: number
  geometryMB: number
  jsHeapMB: number | null
  batches: number
  /** Pass transparan aktif? Kalau tidak, draw call separuh (lihat D-013). */
  transparentPass: boolean
}

/** Struktur yang sedang di-hover, plus posisi kursor untuk tooltip (§E3 AC1). */
export interface HoverInfo {
  idx: number
  clientX: number
  clientY: number
}

export interface ViewerHandle {
  setPreset(preset: ViewPreset): void
  resetView(): void
  dispose(): void
}
