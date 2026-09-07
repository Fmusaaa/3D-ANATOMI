/**
 * Preset visibilitas (PRD §E4 AC6).
 *
 * Preset mengubah kombinasi visibility + opacity, bukan sekadar on/off.
 * Sistem di `ghost` tetap terlihat pada opacity rendah supaya konteks spasial
 * tidak hilang (§E4 AC4) — inilah yang bikin "lihat saraf" tetap bisa dibaca
 * posisinya terhadap rangka.
 */

export interface VisibilityPreset {
  id: string
  label: string
  /** Ditampilkan penuh. */
  show: readonly string[]
  /** Ditampilkan samar sebagai konteks. */
  ghost?: readonly string[]
}

const SKELETON = 'systema_skeletale'
const JOINTS = 'systema_articulare'

export const VISIBILITY_PRESETS: readonly VisibilityPreset[] = [
  {
    id: 'semua',
    label: 'Semua',
    show: [
      SKELETON, JOINTS, 'systema_musculare', 'systema_nervosum',
      'systema_cardiovasculare', 'systema_lymphoideum', 'systema_respiratorium',
      'systema_digestorium', 'systema_urinarium', 'systema_genitale',
      'glandulae_endocrinae', 'organa_sensuum', 'integumentum_commune',
    ],
  },
  { id: 'kerangka', label: 'Kerangka', show: [SKELETON, JOINTS] },
  {
    id: 'otot-kerangka',
    label: 'Otot & kerangka',
    show: [SKELETON, JOINTS, 'systema_musculare'],
  },
  {
    id: 'kardiovaskular',
    label: 'Kardiovaskular',
    show: ['systema_cardiovasculare'],
    ghost: [SKELETON],
  },
  {
    id: 'saraf',
    label: 'Saraf',
    show: ['systema_nervosum', 'organa_sensuum'],
    ghost: [SKELETON],
  },
  {
    id: 'organ-dalam',
    label: 'Organ dalam',
    show: [
      'systema_respiratorium', 'systema_digestorium', 'systema_urinarium',
      'systema_genitale', 'glandulae_endocrinae', 'systema_lymphoideum',
    ],
    ghost: [SKELETON],
  },
]
