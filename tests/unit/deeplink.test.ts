/**
 * §11.1 mewajibkan test round-trip untuk encoding/decoding deep-link URL.
 *
 * Yang diuji bukan cuma "bisa bolak-balik", tapi juga tiga hal yang gampang
 * merusak link diam-diam: batas panjang §E14 AC2, penolakan versi asing, dan
 * ketahanan terhadap hash yang rusak.
 */

import { describe, expect, it } from 'vitest'
import { decodeState, encodeState, type DeepLinkState } from '../../src/lib/deeplink'

const SYSTEMS = [
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

const base: DeepLinkState = {
  cameraPosition: [0.123, -0.456, 2.575],
  cameraTarget: [0, 0.02, -0.004],
  visibleSystems: [...SYSTEMS],
  opacities: {},
  selection: [],
  presetId: null,
  clip: null,
}

/** Kuantisasi 1 mm: bandingkan dengan toleransi, bukan kesamaan persis. */
const closeTo = (a: readonly number[], b: readonly number[]): void => {
  expect(a.length).toBe(b.length)
  a.forEach((v, i) => {
    expect(Math.abs(v - (b[i] as number))).toBeLessThanOrEqual(0.0005)
  })
}

describe('deeplink round-trip', () => {
  it('mengembalikan posisi kamera dalam toleransi 0,5 mm', () => {
    const out = decodeState(encodeState(base, SYSTEMS), SYSTEMS)
    expect(out).not.toBeNull()
    closeTo(out!.cameraPosition, base.cameraPosition)
    closeTo(out!.cameraTarget, base.cameraTarget)
  })

  it('mengembalikan koordinat negatif dengan benar', () => {
    const s: DeepLinkState = {
      ...base,
      cameraPosition: [-1.234, -0.001, -2.999],
      cameraTarget: [-0.5, 0, 0.5],
    }
    const out = decodeState(encodeState(s, SYSTEMS), SYSTEMS)
    closeTo(out!.cameraPosition, s.cameraPosition)
    closeTo(out!.cameraTarget, s.cameraTarget)
  })

  it('mengembalikan subset sistem yang terlihat', () => {
    const s: DeepLinkState = {
      ...base,
      visibleSystems: ['systema_skeletale', 'systema_cardiovasculare'],
    }
    const out = decodeState(encodeState(s, SYSTEMS), SYSTEMS)
    expect(out!.visibleSystems).toEqual(['systema_skeletale', 'systema_cardiovasculare'])
  })

  it('mengembalikan opacity per sistem', () => {
    const s: DeepLinkState = {
      ...base,
      opacities: { systema_skeletale: 0.12, systema_musculare: 0.5 },
    }
    const out = decodeState(encodeState(s, SYSTEMS), SYSTEMS)
    expect(out!.opacities['systema_skeletale']).toBeCloseTo(0.12, 2)
    expect(out!.opacities['systema_musculare']).toBeCloseTo(0.5, 2)
    expect(out!.opacities['systema_nervosum']).toBeUndefined()
  })

  it('mengembalikan seleksi dan preset', () => {
    const s: DeepLinkState = {
      ...base,
      selection: [0, 842, 2233],
      presetId: 'organ-dalam',
    }
    const out = decodeState(encodeState(s, SYSTEMS), SYSTEMS)
    expect(out!.selection).toEqual([0, 842, 2233])
    expect(out!.presetId).toBe('organ-dalam')
  })

  it('menghilangkan bagian default supaya URL awal pendek', () => {
    // Semua sistem terlihat, tanpa seleksi/opacity: hanya kamera yang ditulis.
    const encoded = encodeState(base, SYSTEMS)
    expect(encoded).not.toContain('v=')
    expect(encoded).not.toContain('o=')
    expect(encoded).not.toContain('s=')
  })
})

describe('§E14 AC2 — panjang URL < 500 karakter', () => {
  it('kasus terburuk yang realistis tetap jauh di bawah batas', () => {
    const worst: DeepLinkState = {
      cameraPosition: [-2.999, -2.999, -2.999],
      cameraTarget: [2.999, 2.999, 2.999],
      // separuh sistem mati, sisanya opacity aneh
      visibleSystems: SYSTEMS.filter((_, i) => i % 2 === 0),
      opacities: Object.fromEntries(SYSTEMS.map((s, i) => [s, (i + 1) / 20])),
      selection: [2233, 2232, 2231, 2230, 2229, 2228, 2227, 2226], // maks 8 (§E3 AC8)
      presetId: 'kardiovaskular',
      // §E13 ikut dihitung: bidang potong menambah panjang URL juga.
      clip: { axis: 'transverse', position: -0.987, flipped: true },
    }
    const encoded = encodeState(worst, SYSTEMS)
    expect(encoded.length).toBeLessThan(500)
    // Sanity: masih bisa dibaca balik.
    expect(decodeState(encoded, SYSTEMS)!.selection).toEqual(worst.selection)
  })
})

describe('penolakan input tidak sah', () => {
  it('menolak versi format yang tidak dikenal', () => {
    // Link dari versi masa depan tidak boleh di-restore jadi tampilan salah.
    expect(decodeState('#a2~c=0_0_0_0_0_0', SYSTEMS)).toBeNull()
    expect(decodeState('#xx~c=0_0_0_0_0_0', SYSTEMS)).toBeNull()
  })

  it('menolak hash kosong', () => {
    expect(decodeState('', SYSTEMS)).toBeNull()
    expect(decodeState('#', SYSTEMS)).toBeNull()
  })

  it('menolak kamera yang tidak lengkap atau rusak', () => {
    expect(decodeState('#a1~c=0_0_0', SYSTEMS)).toBeNull()
    expect(decodeState('#a1~c=0_0_0_0_0_zz!', SYSTEMS)).toBeNull()
    expect(decodeState('#a1~v=1', SYSTEMS)).toBeNull() // tanpa kamera
  })

  it('mengabaikan pasangan opacity yang rusak tanpa membuang seluruh state', () => {
    // Opacity ditulis base36: 0,3 -> 30 -> "u". Bukan desimal "30".
    const out = decodeState('#a1~c=0_0_0_0_0_0~o=zz!-50_1-u', SYSTEMS)
    expect(out).not.toBeNull()
    expect(out!.opacities['systema_articulare']).toBeCloseTo(0.3, 2)
  })

  it('opacity ditulis base36, dan encoder/decoder sepakat', () => {
    const s: DeepLinkState = { ...base, opacities: { systema_articulare: 0.3 } }
    expect(encodeState(s, SYSTEMS)).toContain('o=1-u')
  })
})

describe('§E13 — bidang potong ikut di deep link', () => {
  it('tautan tanpa `k` tidak memotong (tautan lama tetap sah)', () => {
    const encoded = encodeState(base, SYSTEMS)
    expect(encoded).not.toContain('k=')
    expect(decodeState(encoded, SYSTEMS)?.clip).toBeNull()
  })

  it.each([
    { axis: 'sagittal', position: 0, flipped: false },
    { axis: 'coronal', position: 0.42, flipped: true },
    { axis: 'transverse', position: -1, flipped: false },
  ] as const)('bolak-balik utuh: %o', (clip) => {
    const decoded = decodeState(encodeState({ ...base, clip }, SYSTEMS), SYSTEMS)
    expect(decoded?.clip?.axis).toBe(clip.axis)
    expect(decoded?.clip?.flipped).toBe(clip.flipped)
    expect(decoded?.clip?.position).toBeCloseTo(clip.position, 3)
  })

  it('sumbu tak dikenal tidak ditebak — lebih baik tidak memotong', () => {
    const rusak = encodeState({ ...base, clip: { axis: 'sagittal', position: 0.5, flipped: false } }, SYSTEMS)
      .replace('k=s_', 'k=q_')
    // Sisa state tetap terbaca; hanya bidang potongnya yang dibuang.
    const decoded = decodeState(rusak, SYSTEMS)
    expect(decoded).not.toBeNull()
    expect(decoded?.clip).toBeNull()
  })
})
