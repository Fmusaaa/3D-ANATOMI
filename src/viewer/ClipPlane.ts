/**
 * Matematika bidang potong anatomis (PRD §E13).
 *
 * Seperti `ExplodeLayout`, modul ini **murni angka — tanpa three.js**. Itu yang
 * membuat konvensi arahnya bisa dibuktikan di unit test, bukan cuma dilihat
 * sekilas di layar. Salah tanda di sini berarti label "dextra" menampilkan sisi
 * kiri pasien: kesalahan anatomi yang tidak akan kelihatan tanpa diuji, karena
 * tubuh nyaris simetris.
 *
 * Konvensi sumbu dataset (`manifest.json`): Y-up, +Z anterior, model ter-center.
 * Sisi KANAN pasien ada di X negatif — dipakai juga oleh preset kamera
 * `lateral-dextra` di `CameraController`, dan berasal dari `04_pack_batches.py`.
 */

import type { ClipAxis, ClipSpec } from './types'

/** Normal satuan tiap bidang, mengarah ke sisi yang DIPERTAHANKAN saat `flipped = false`. */
export const CLIP_AXIS_VECTOR: Record<ClipAxis, readonly [number, number, number]> = {
  // Sagital memotong kiri/kanan -> normalnya sumbu X.
  sagittal: [1, 0, 0],
  // Koronal memotong depan/belakang -> sumbu Z (+Z anterior).
  coronal: [0, 0, 1],
  // Transversal memotong atas/bawah -> sumbu Y (+Y superior).
  transverse: [0, 1, 0],
}

/** Indeks komponen (0=x, 1=y, 2=z) sumbu normal tiap bidang. */
export const CLIP_AXIS_INDEX: Record<ClipAxis, 0 | 1 | 2> = {
  sagittal: 0,
  coronal: 2,
  transverse: 1,
}

export interface ClipPlaneMath {
  /** Normal satuan; setengah-ruang `normal · p + constant >= 0` yang dipertahankan. */
  normal: [number, number, number]
  constant: number
  /** Koordinat bidang di sumbu normalnya, ruang dunia (meter). */
  worldCoord: number
  /** Jarak dari titik tengah tubuh, milimeter. Negatif/positif ikut sumbu. */
  offsetMm: number
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
}

/**
 * Ubah spesifikasi bidang jadi setengah-ruang yang dipertahankan.
 *
 * `spec.position` bernilai −1..1 relatif terhadap bounding box pada sumbu
 * normal: −1 di tepi negatif, 0 tepat di tengah tubuh, +1 di tepi positif.
 * Memakai nilai relatif, bukan meter, supaya slider tetap benar walau
 * kumpulan struktur yang terlihat berubah ukuran.
 *
 * Konvensi three.js: fragmen dengan `normal · p + constant < 0` dibuang.
 */
export function planeFromSpec(
  spec: ClipSpec,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): ClipPlaneMath {
  const i = CLIP_AXIS_INDEX[spec.axis]
  const lo = min[i]
  const hi = max[i]
  const mid = (lo + hi) / 2
  const half = (hi - lo) / 2

  const coord = mid + clamp(spec.position, -1, 1) * half

  // `flipped` menukar sisi yang dipertahankan dengan membalik normalnya.
  const s = spec.flipped ? -1 : 1
  const axis = CLIP_AXIS_VECTOR[spec.axis]

  return {
    normal: [axis[0] * s, axis[1] * s, axis[2] * s],
    // normal · p + constant >= 0  <=>  s * (p_i - coord) >= 0
    constant: -coord * s,
    worldCoord: coord,
    offsetMm: (coord - mid) * 1000,
  }
}
