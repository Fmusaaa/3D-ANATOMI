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
