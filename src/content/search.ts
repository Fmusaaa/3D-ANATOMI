/**
 * Index pencarian multibahasa (PRD §E5).
 *
 * MiniSearch dipilih di §5.1 karena lebih cepat dari Fuse untuk 3.000+ entri.
 *
 * ⚠️ BATAS JUJUR SAAT INI: nomenklatur Latin TA dan Indonesia baru dikurasi di
 * Fase 5. Sampai itu ada, yang bisa diindeks hanyalah nama Inggris FMA dan
 * FMA ID. Jadi `arteria femoralis` TIDAK akan menemukan "Femoral artery" —
 * bukan karena search-nya lemah, tapi karena datanya memang belum ada.
 * Struktur index sudah menyediakan field `la` dan `id` supaya F5 tinggal
 * mengisi tanpa menyentuh kode ini.
 */

import MiniSearch, { type SearchResult } from 'minisearch'
import type { GroupMeta, StructureMeta } from './structures'

export type EntryKind = 'structure' | 'group'

export interface SearchEntry {
  /** `s:<idx>` untuk struktur, `g:<fma>` untuk konsep COMPOUND. */
  id: string
  kind: EntryKind
  /** structureIdx; untuk grup, elemen pertama sebagai target fly-to. */
  idx: number
  /** Semua structureIdx yang diwakili entri ini. */
  members: number[]
  fma: string
  en: string
  /** Latin TA — kosong sampai Fase 5. */
  la: string
  /** Indonesia — kosong sampai Fase 5. */
  id_: string
  system: string
  synonyms: string
}

/**
 * Singkatan anatomi yang lazim ditulis mahasiswa (§E5 AC2).
 *
 * Dipetakan ke Latin DAN Inggris sekaligus. Padanan Latin-nya belum berguna
 * sampai F5, tapi padanan Inggris membuat `a. femoralis` tetap menemukan
 * "Femoral artery" hari ini.
 */
const ABBREVIATIONS: Record<string, string[]> = {
  m: ['musculus', 'muscle'],
  mm: ['musculi', 'muscles'],
  a: ['arteria', 'artery'],
  aa: ['arteriae', 'arteries'],
  v: ['vena', 'vein'],
  vv: ['venae', 'veins'],
  n: ['nervus', 'nerve'],
  nn: ['nervi', 'nerves'],
  lig: ['ligamentum', 'ligament'],
  art: ['articulatio', 'joint'],
  gl: ['glandula', 'gland'],
  r: ['ramus', 'branch'],
  proc: ['processus', 'process'],
}

/** Buang diakritik + turunkan huruf besar (§E5 AC2: buta diakritik). */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Ubah `m. biceps` -> `musculus muscle biceps`.
 *
 * Menambahkan padanannya alih-alih mengganti, supaya query aslinya tetap bisa
 * cocok kalau ternyata memang ada istilah bernama "m".
 */
export function expandAbbreviations(query: string): string {
  const out: string[] = []
  for (const raw of fold(query).split(/\s+/)) {
    if (!raw) continue
    const bare = raw.replace(/\.$/, '')
    const expansion = ABBREVIATIONS[bare]
    if (expansion && raw.endsWith('.')) {
      out.push(...expansion)
    } else if (expansion && bare.length <= 2) {
      // `a femoralis` tanpa titik juga lazim ditulis.
      out.push(bare, ...expansion)
    } else {
      out.push(raw)
    }
  }
  return out.join(' ')
}

export interface SearchHit {
  entry: SearchEntry
  score: number
}

export class StructureSearch {
  private readonly mini: MiniSearch<SearchEntry>
  private readonly byId = new Map<string, SearchEntry>()
  readonly size: number

  constructor(structures: StructureMeta[], groups: GroupMeta[]) {
    const entries: SearchEntry[] = []

    for (const s of structures) {
      entries.push({
        id: `s:${String(s.idx)}`,
        kind: 'structure',
        idx: s.idx,
        members: [s.idx],
        fma: s.fma,
        en: s.name.en,
        la: '',
        id_: '',
        system: s.system,
        synonyms: '',
      })
    }

    for (const g of groups) {
      const first = g.members[0]
      if (first === undefined) continue
      entries.push({
        id: `g:${g.fma}`,
        kind: 'group',
        idx: first,
        members: g.members,
        fma: g.fma,
        en: g.name.en,
        la: '',
        id_: '',
        system: '',
        synonyms: '',
      })
    }

    for (const e of entries) this.byId.set(e.id, e)
    this.size = entries.length

    this.mini = new MiniSearch<SearchEntry>({
      idField: 'id',
      fields: ['en', 'la', 'id_', 'synonyms', 'fma'],
      storeFields: ['id'],
      processTerm: (term) => {
        const t = fold(term)
        return t.length > 1 || /\d/.test(t) ? t : null
      },
      tokenize: (text) => fold(text).split(/[\s,/()\-.]+/).filter(Boolean),
    })
    this.mini.addAll(entries)
  }

  /**
   * §E5 AC2: toleran typo (fuzzy), prefiks, buta huruf besar & diakritik.
   * §E5 AC8 ditangani pemanggil lewat `suggest()` kalau hasilnya nol.
   */
  search(query: string, limit = 20): SearchHit[] {
    const q = expandAbbreviations(query)
    if (!q.trim()) return []

    const raw: SearchResult[] = this.mini.search(q, {
      prefix: true,
      // Edit distance 1-2 tergantung panjang kata; kata pendek tidak difuzzy
      // supaya "vena" tidak berubah jadi "cena"/"venu" dan membanjiri hasil.
      fuzzy: (term) => (term.length <= 3 ? 0 : term.length <= 6 ? 0.2 : 0.3),
      combineWith: 'AND',
      boost: { en: 3, la: 3, id_: 2, fma: 1 },
    })

    const hits: SearchHit[] = []
    for (const r of raw) {
      const entry = this.byId.get(String(r.id))
      if (entry) hits.push({ entry, score: r.score })
      if (hits.length >= limit) break
    }

    // Kalau AND tidak memberi apa-apa, longgarkan ke OR sebelum menyerah.
    if (hits.length === 0) {
      for (const r of this.mini.search(q, { prefix: true, fuzzy: 0.3, combineWith: 'OR' })) {
        const entry = this.byId.get(String(r.id))
        if (entry) hits.push({ entry, score: r.score })
        if (hits.length >= limit) break
      }
    }
    return hits
  }

  /** §E5 AC8: "maksud lo ...?" alih-alih sekadar "tidak ditemukan". */
  suggest(query: string, limit = 5): string[] {
    const q = expandAbbreviations(query)
    if (!q.trim()) return []
    return this.mini
      .autoSuggest(q, { fuzzy: 0.4, prefix: true })
      .slice(0, limit)
      .map((s) => s.suggestion)
  }
}
