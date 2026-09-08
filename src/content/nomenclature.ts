/**
 * Layer nomenklatur multibahasa (PRD §E7, skema §6.4).
 *
 * ⚠️ ATURAN KERAS §E7 AC4 / R5
 * ---------------------------
 * Entri berstatus `machine` atau `needs-review` BELUM diverifikasi manusia.
 * Keduanya:
 *   - wajib ditampilkan dengan badge peringatan
 *   - tidak boleh dipakai sebagai jawaban benar di quiz (§E10 AC14)
 *
 * `isTrustworthy()` di bawah adalah satu-satunya tempat aturan itu didefinisikan.
 * Jangan mengecek `status === 'reviewed'` tersebar di komponen — nanti ada yang
 * lupa, dan yang lupa itu berakhir jadi istilah salah di depan calon dokter.
 */

export type NomenclatureStatus = 'reviewed' | 'machine' | 'needs-review'
export type NomenclatureSource = 'TA98' | 'TA2' | 'FMA' | 'curated' | 'machine'

export interface NomenclatureEntry {
  fma: string
  term: string
  synonyms?: string[]
  source: NomenclatureSource
  status: NomenclatureStatus
  reviewedBy?: string
  reviewedAt?: string
}

export type LanguageCode = 'la' | 'id' | 'en'

export const LANGUAGE_LABEL: Record<LanguageCode, string> = {
  la: 'Latin (TA)',
  id: 'Indonesia',
  en: 'Inggris',
}

/** §E7 AC1: default Latin, dengan Indonesia sebagai subtitle. */
export const DEFAULT_LANGUAGE: LanguageCode = 'la'

export interface Nomenclature {
  la: Map<string, NomenclatureEntry>
  id: Map<string, NomenclatureEntry>
}

/**
 * SATU-SATUNYA definisi "boleh dipercaya".
 *
 * Dipakai UI untuk memutuskan badge, dan nanti oleh quiz untuk memutuskan
 * kelayakan soal.
 */
export function isTrustworthy(entry: NomenclatureEntry | undefined): boolean {
  return entry?.status === 'reviewed'
}

export function statusLabel(status: NomenclatureStatus): string {
  switch (status) {
    case 'reviewed':
      return 'terverifikasi'
    case 'needs-review':
      return 'perlu review'
    case 'machine':
      return 'otomatis'
  }
}

export function statusExplanation(status: NomenclatureStatus): string {
  switch (status) {
    case 'reviewed':
      return 'Istilah ini sudah diperiksa manusia terhadap Terminologia Anatomica.'
    case 'needs-review':
      return 'Diturunkan otomatis, dan urutan katanya masih tebakan karena ada lebih dari satu adjektiva. Jangan dipakai sebagai acuan sebelum diperiksa.'
    case 'machine':
      return 'Diturunkan otomatis dari nama Inggris FMA, belum diverifikasi manusia. Jangan dipakai sebagai acuan ujian.'
  }
}

interface RawFile {
  entries: NomenclatureEntry[]
}

async function loadOne(url: string): Promise<Map<string, NomenclatureEntry>> {
  const map = new Map<string, NomenclatureEntry>()
  const res = await fetch(url)
  // File nomenklatur boleh belum ada (Fase 5 dikurasi bertahap). Ketiadaannya
  // bukan error — UI menampilkannya sebagai "belum ada", bukan layar merah.
  if (!res.ok) return map
  const doc = (await res.json()) as RawFile
  for (const e of doc.entries) map.set(e.fma, e)
  return map
}

export async function loadNomenclature(baseUrl = '/data'): Promise<Nomenclature> {
  const [la, id] = await Promise.all([
    loadOne(`${baseUrl}/content/nomenclature.la.json`),
    loadOne(`${baseUrl}/content/nomenclature.id.json`),
  ])
  return { la, id }
}

export interface DisplayName {
  /** Teks yang ditampilkan. */
  text: string
  /** null kalau bahasa itu memang belum punya entri. */
  entry: NomenclatureEntry | null
  language: LanguageCode
}

/**
 * Nama untuk ditampilkan pada bahasa tertentu.
 *
 * TIDAK ada fallback diam-diam ke bahasa lain. Kalau Latin belum ada, yang
 * dikembalikan adalah ketiadaan — supaya UI bisa mengatakannya terus terang
 * alih-alih menampilkan nama Inggris yang menyamar jadi Latin (§8.1 prinsip 5).
 */
export function displayName(
  nomen: Nomenclature | null,
  fma: string,
  english: string,
  language: LanguageCode,
): DisplayName {
  if (language === 'en') return { text: english, entry: null, language: 'en' }
  const entry = nomen?.[language].get(fma)
  return {
    text: entry?.term ?? '',
    entry: entry ?? null,
    language,
  }
}
