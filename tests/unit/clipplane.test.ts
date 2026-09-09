/**
 * Uji bidang potong anatomis (§E13).
 *
 * Ini bukan uji kosmetik. Tubuh manusia nyaris simetris kiri-kanan, jadi salah
 * tanda pada sumbu sagital menghasilkan gambar yang **terlihat benar** tapi
 * melabeli sisi kiri pasien sebagai "dextra". Kesalahan seperti itu tidak akan
 * tertangkap dengan melihat layar — hanya dengan menguji konvensinya.
 *
 * Konvensi yang diuji berasal dari `04_pack_batches.py` dan preset kamera
 * `lateral-dextra`: **sisi KANAN pasien ada di X negatif.**
 */

import { describe, expect, it } from 'vitest'
import { CLIP_AXIS_INDEX, CLIP_AXIS_VECTOR, planeFromSpec } from '@/viewer/ClipPlane'
import { keptSide, type ClipAxis, type ClipSpec } from '@/viewer/types'

/** Bounding box tubuh yang sengaja TIDAK simetris terhadap origin. */
const MIN = [-0.35, -0.9, -0.18] as const
const MAX = [0.35, 0.94, 0.22] as const

/** three membuang fragmen dengan `normal · p + constant < 0`. */
function dipertahankan(spec: ClipSpec, p: readonly [number, number, number]): boolean {
  const m = planeFromSpec(spec, MIN, MAX)
  return m.normal[0] * p[0] + m.normal[1] * p[1] + m.normal[2] * p[2] + m.constant >= 0
}

function tengah(axis: ClipAxis): number {
  const i = CLIP_AXIS_INDEX[axis]
  return (MIN[i] + MAX[i]) / 2
}

const SEMUA_SUMBU: ClipAxis[] = ['sagittal', 'coronal', 'transverse']

describe('planeFromSpec — geometri', () => {
  it.each(SEMUA_SUMBU)('posisi 0 mendarat di titik tengah bounding box: %s', (axis) => {
    // Bukan di origin: bounding box-nya sengaja tidak simetris, dan mengira
    // "tengah = 0" adalah asumsi yang akan diam-diam meleset.
    const m = planeFromSpec({ axis, position: 0, flipped: false }, MIN, MAX)
    expect(m.worldCoord).toBeCloseTo(tengah(axis), 6)
    expect(m.offsetMm).toBeCloseTo(0, 6)
  })

  it.each(SEMUA_SUMBU)('posisi ±1 mendarat tepat di tepi: %s', (axis) => {
    const i = CLIP_AXIS_INDEX[axis]
    expect(planeFromSpec({ axis, position: -1, flipped: false }, MIN, MAX).worldCoord).toBeCloseTo(MIN[i], 6)
    expect(planeFromSpec({ axis, position: 1, flipped: false }, MIN, MAX).worldCoord).toBeCloseTo(MAX[i], 6)
  })

  it('posisi di luar −1..1 di-clamp, bukan diekstrapolasi', () => {
    const jauh = planeFromSpec({ axis: 'sagittal', position: 9, flipped: false }, MIN, MAX)
    expect(jauh.worldCoord).toBeCloseTo(MAX[0], 6)
  })

  it.each(SEMUA_SUMBU)('normal selalu satuan: %s', (axis) => {
    for (const flipped of [false, true]) {
      const n = planeFromSpec({ axis, position: 0.3, flipped }, MIN, MAX).normal
      expect(Math.hypot(...n)).toBeCloseTo(1, 12)
    }
  })

  it.each(SEMUA_SUMBU)('flip menukar setengah-ruang yang dipertahankan: %s', (axis) => {
    const i = CLIP_AXIS_INDEX[axis]
    const spec: ClipSpec = { axis, position: 0, flipped: false }
    const mid = tengah(axis)

    const positif: [number, number, number] = [0, 0, 0]
    positif[i] = mid + 0.1
    const negatif: [number, number, number] = [0, 0, 0]
    negatif[i] = mid - 0.1

    expect(dipertahankan(spec, positif)).toBe(true)
    expect(dipertahankan(spec, negatif)).toBe(false)

    const dibalik: ClipSpec = { ...spec, flipped: true }
    expect(dipertahankan(dibalik, positif)).toBe(false)
    expect(dipertahankan(dibalik, negatif)).toBe(true)
  })

  it('offsetMm memakai milimeter bertanda dari titik tengah', () => {
    const m = planeFromSpec({ axis: 'transverse', position: 0.5, flipped: false }, MIN, MAX)
    const setengahTinggi = (MAX[1] - MIN[1]) / 2
    expect(m.offsetMm).toBeCloseTo(0.5 * setengahTinggi * 1000, 6)
  })

  it('flip tidak menggeser letak bidangnya, hanya sisi yang dibuang', () => {
    const a = planeFromSpec({ axis: 'coronal', position: 0.4, flipped: false }, MIN, MAX)
    const b = planeFromSpec({ axis: 'coronal', position: 0.4, flipped: true }, MIN, MAX)
    expect(b.worldCoord).toBeCloseTo(a.worldCoord, 12)
    expect(b.normal).toEqual(a.normal.map((v) => -v))
  })
})

describe('keptSide — konvensi anatomi', () => {
  /**
   * ⚠️ Ini uji yang paling penting di file ini.
   *
   * Sisi kanan pasien ada di X NEGATIF. Karena bidang tanpa flip
   * mempertahankan setengah-ruang +X, yang tersisa adalah sisi KIRI pasien.
   * Menukar kedua label ini menghasilkan gambar yang tetap masuk akal dan
   * tetap salah.
   */
  it('sagital tanpa flip menyisakan sisi KIRI pasien', () => {
    expect(keptSide({ axis: 'sagittal', position: 0, flipped: false })).toBe('sinistra')
    expect(keptSide({ axis: 'sagittal', position: 0, flipped: true })).toBe('dextra')
  })

  it('titik di sisi dextra memang terbuang saat label menyebut sinistra', () => {
    const spec: ClipSpec = { axis: 'sagittal', position: 0, flipped: false }
    expect(keptSide(spec)).toBe('sinistra')
    const mid = tengah('sagittal')
    // Kanan pasien = X negatif.
    expect(dipertahankan(spec, [mid - 0.2, 0, 0])).toBe(false)
    expect(dipertahankan(spec, [mid + 0.2, 0, 0])).toBe(true)
  })

  it('koronal: +Z anterior', () => {
    expect(keptSide({ axis: 'coronal', position: 0, flipped: false })).toBe('anterior')
    expect(CLIP_AXIS_VECTOR.coronal).toEqual([0, 0, 1])
  })

  it('transversal: +Y superior', () => {
    expect(keptSide({ axis: 'transverse', position: 0, flipped: false })).toBe('superior')
    expect(CLIP_AXIS_VECTOR.transverse).toEqual([0, 1, 0])
  })
})
