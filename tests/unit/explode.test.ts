/**
 * §11.1 mewajibkan test layout explode: non-overlap, determinisme, dan
 * penanganan 0/1/1000 struktur.
 *
 * §E6 AC3 secara khusus menuntut non-overlap **diverifikasi secara analitis**,
 * bukan lewat mata — dan pada tiga aspect ratio: 16:9, 4:3, 9:16.
 */

import { describe, expect, it } from 'vitest'
import {
  computeExplodeLayout,
  gridShape,
  type ExplodeItem,
  type Vec3,
} from '../../src/viewer/ExplodeLayout'

const REGIONS = ['caput', 'thorax', 'abdomen', 'membrum_superius', 'membrum_inferius']
const SYSTEMS = ['systema_skeletale', 'systema_musculare', 'systema_cardiovasculare']

/** Deterministik: PRNG bersemai, supaya kegagalan bisa direproduksi. */
function makeItems(n: number, seed = 1): ExplodeItem[] {
  let s = seed
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  return Array.from({ length: n }, (_, i) => {
    const size = 0.005 + rnd() * 0.12
    const cx = (rnd() - 0.5) * 0.6
    const cy = (rnd() - 0.5) * 1.7
    const cz = (rnd() - 0.5) * 0.3
    const bbox: readonly [Vec3, Vec3] = [
      [cx - size / 2, cy - size / 2, cz - size / 2],
      [cx + size / 2, cy + size / 2, cz + size / 2],
    ]
    return {
      idx: i,
      bbox,
      region: REGIONS[i % REGIONS.length] as string,
      system: SYSTEMS[i % SYSTEMS.length] as string,
    }
  })
}

const ASPECTS: [string, number][] = [
  ['16:9', 16 / 9],
  ['4:3', 4 / 3],
  ['9:16', 9 / 16],
]

/**
 * Cek non-overlap secara ANALITIS.
 *
 * Setiap struktur dijamin muat dalam kubus `cell` yang berpusat di targetnya.
 * Dua AABB tidak bersinggungan kalau terpisah > cell pada minimal satu sumbu.
 */
function assertNoOverlap(
  targets: Map<number, Vec3>,
  cell: number,
): { pairs: number; minSeparation: number } {
  const list = [...targets.values()]
  let minSep = Number.POSITIVE_INFINITY
  let pairs = 0
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i] as Vec3
      const b = list[j] as Vec3
      // Jarak terbesar di antara ketiga sumbu; kalau > cell, tidak tumpang tindih.
      const sep = Math.max(
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
      )
      minSep = Math.min(minSep, sep)
      pairs++
      if (sep <= cell) {
        throw new Error(
          `AABB tumpang tindih: pusat ${JSON.stringify(a)} dan ${JSON.stringify(b)} ` +
            `hanya terpisah ${sep.toFixed(6)} m, sel ${cell.toFixed(6)} m`,
        )
      }
    }
  }
  return { pairs, minSeparation: minSep }
}

describe('§E6 AC3 — tidak ada tumpang tindih bounding box', () => {
  for (const [label, aspect] of ASPECTS) {
    it(`aspect ${label}: 400 struktur terpisah bersih`, () => {
      const items = makeItems(400)
      const layout = computeExplodeLayout(items, { aspect })
      const { pairs } = assertNoOverlap(layout.targets, layout.cell)
      expect(pairs).toBe((400 * 399) / 2)
      expect(layout.pitch).toBeGreaterThan(layout.cell)
    })
  }

  it('tetap bersih walau satu struktur jauh lebih besar dari sisanya', () => {
    // Kasus nyata: kulit ikut terlihat. Sel seragam harus mengikuti yang terbesar.
    const items = makeItems(120)
    items[0] = {
      idx: 9999,
      bbox: [
        [-0.35, -0.9, -0.15],
        [0.35, 0.9, 0.15],
      ],
      region: 'thorax',
      system: 'integumentum_commune',
    }
    const layout = computeExplodeLayout(items, { aspect: 16 / 9 })
    expect(layout.cell).toBeCloseTo(1.8, 5) // dimensi terbesar = tinggi kulit
    assertNoOverlap(layout.targets, layout.cell)
  })
})

describe('§E6 AC4 — determinisme', () => {
  it('masukan sama menghasilkan keluaran identik', () => {
    const a = computeExplodeLayout(makeItems(250), { aspect: 16 / 9 })
    const b = computeExplodeLayout(makeItems(250), { aspect: 16 / 9 })
    expect([...a.targets.entries()]).toEqual([...b.targets.entries()])
  })

  it('urutan array masukan tidak mengubah hasil', () => {
    // Kalau hasilnya bergantung urutan masukan, visual regression test akan
    // gagal secara acak dan tidak ada yang tahu kenapa.
    const items = makeItems(180)
    const shuffled = [...items].reverse()
    const a = computeExplodeLayout(items, { aspect: 4 / 3 })
    const b = computeExplodeLayout(shuffled, { aspect: 4 / 3 })
    for (const [idx, pos] of a.targets) {
      expect(b.targets.get(idx)).toEqual(pos)
    }
  })
})

describe('§E6 AC5 — urutan mempertahankan hubungan anatomis', () => {
  it('caput ditempatkan sebelum membrum_inferius', () => {
    const items: ExplodeItem[] = [
      { idx: 1, bbox: [[0, 0, 0], [0.1, 0.1, 0.1]], region: 'membrum_inferius', system: 's' },
      { idx: 2, bbox: [[0, 0, 0], [0.1, 0.1, 0.1]], region: 'caput', system: 's' },
    ]
    const layout = computeExplodeLayout(items, { aspect: 1 })
    const caput = layout.targets.get(2) as Vec3
    const kaki = layout.targets.get(1) as Vec3
    // Sel pertama ada di kiri-atas; caput harus menempatinya.
    expect(caput[0]).toBeLessThanOrEqual(kaki[0])
  })

  it('dalam satu regio & sistem, yang lebih superior didahulukan', () => {
    const mk = (idx: number, y: number): ExplodeItem => ({
      idx,
      bbox: [[0, y - 0.01, 0], [0.02, y + 0.01, 0.02]],
      region: 'thorax',
      system: 'systema_skeletale',
    })
    const layout = computeExplodeLayout([mk(1, -0.5), mk(2, 0.5)], { aspect: 1 })
    const atas = layout.targets.get(2) as Vec3
    const bawah = layout.targets.get(1) as Vec3
    expect(atas[0]).toBeLessThanOrEqual(bawah[0])
  })
})

describe('§11.1 — kasus batas 0 / 1 / 1000', () => {
  it('0 struktur tidak melempar dan menghasilkan layout kosong', () => {
    const layout = computeExplodeLayout([], { aspect: 16 / 9 })
    expect(layout.targets.size).toBe(0)
    expect(layout.grid).toEqual({ cols: 0, rows: 0, layers: 0 })
  })

  it('1 struktur ditempatkan di origin', () => {
    const layout = computeExplodeLayout(makeItems(1), { aspect: 16 / 9 })
    expect(layout.targets.size).toBe(1)
    expect([...layout.targets.values()][0]).toEqual([0, 0, 0])
  })

  it('1000 struktur tetap bersih di tiga aspect ratio', () => {
    for (const [, aspect] of ASPECTS) {
      const layout = computeExplodeLayout(makeItems(1000), { aspect })
      expect(layout.targets.size).toBe(1000)
      assertNoOverlap(layout.targets, layout.cell)
    }
  })

  it('struktur berukuran nol tidak membuat semuanya menumpuk di satu titik', () => {
    // Mesh degenerate bisa punya bbox nol; pitch 0 akan menumpuk semuanya.
    const items: ExplodeItem[] = Array.from({ length: 5 }, (_, i) => ({
      idx: i,
      bbox: [[0, 0, 0], [0, 0, 0]],
      region: 'thorax',
      system: 's',
    }))
    const layout = computeExplodeLayout(items, { aspect: 1 })
    expect(layout.pitch).toBeGreaterThan(0)
    const uniq = new Set([...layout.targets.values()].map((v) => v.join(',')))
    expect(uniq.size).toBe(5)
  })
})

describe('bentuk grid mengikuti aspect ratio', () => {
  it('layar lebar menghasilkan kolom lebih banyak daripada baris', () => {
    const wide = gridShape(400, 16 / 9)
    expect(wide.cols).toBeGreaterThan(wide.rows)
  })

  it('layar tinggi menghasilkan baris lebih banyak daripada kolom', () => {
    const tall = gridShape(400, 9 / 16)
    expect(tall.rows).toBeGreaterThan(tall.cols)
  })

  it('aspect tidak sah tidak membuat grid rusak', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const g = gridShape(100, bad)
      expect(g.cols).toBeGreaterThan(0)
      expect(g.rows).toBeGreaterThan(0)
      expect(g.cols * g.rows * g.layers).toBeGreaterThanOrEqual(100)
    }
  })
})
