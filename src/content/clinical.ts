/**
 * Catatan klinis (PRD §E9).
 *
 * Sumbernya `public/data/content/clinical/*.md`, dikompilasi `08_clinical.py`
 * ke `clinical.json`. Tiap catatan WAJIB punya `source` — validator menolak
 * yang kosong, dan UI menampilkan sumber itu di setiap catatan (§E9 AC4).
 *
 * Satu catatan bisa menunjuk beberapa FMA, dan FMA itu boleh berupa grup
 * COMPOUND (mis. "vertebral artery" yang menaungi kiri & kanan). Karena itu
 * pencocokan dilakukan per `structureIdx`: struktur kena catatan kalau FMA-nya
 * sendiri disebut, ATAU ia anggota grup yang disebut.
 */

import type { StructureIndex } from '@/content/structures'

export interface ClinicalNote {
  id: string
  fma: string[]
  title: string
  source: string
  sourceUrl?: string
  /** Siapa yang meringkas, kalau bukan penulis sumbernya. */
  compiledBy?: string
  /** Markdown sederhana: paragraf, daftar, **tebal**, *miring*. */
  body: string
}

interface RawFile {
  notes?: ClinicalNote[]
}

export async function loadClinical(baseUrl = '/data'): Promise<ClinicalNote[]> {
  const res = await fetch(`${baseUrl}/content/clinical.json`)
  if (!res.ok) return []
  const doc = (await res.json()) as RawFile
  // Pertahanan kedua setelah validator: catatan tanpa sumber tidak pernah tampil.
  return (doc.notes ?? []).filter((n) => n.source.trim() !== '' && n.fma.length > 0)
}

/** structureIdx -> catatan yang berlaku untuknya (langsung atau lewat grup). */
export function indexClinical(
  notes: readonly ClinicalNote[],
  structures: StructureIndex,
): Map<number, ClinicalNote[]> {
  const idxOfFma = new Map<string, number[]>()
  for (const s of structures.all) {
    const list = idxOfFma.get(s.fma) ?? []
    list.push(s.idx)
    idxOfFma.set(s.fma, list)
  }
  for (const g of structures.groups) {
    const list = idxOfFma.get(g.fma) ?? []
    list.push(...g.members)
    idxOfFma.set(g.fma, list)
  }

  const out = new Map<number, ClinicalNote[]>()
  for (const note of notes) {
    const targets = new Set<number>()
    for (const fma of note.fma) for (const idx of idxOfFma.get(fma) ?? []) targets.add(idx)
    for (const idx of targets) {
      const list = out.get(idx) ?? []
      list.push(note)
      out.set(idx, list)
    }
  }
  return out
}
