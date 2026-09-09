/**
 * Catatan pribadi & bookmark tampilan (PRD §E15).
 *
 * Dua hal yang menentukan bentuk modul ini:
 *
 * 1. **Catatan dikunci ke FMA ID, bukan `structureIdx`.** `idx` ditentukan
 *    urutan packing pipeline; membangun ulang data bisa menggesernya, dan
 *    catatan mahasiswa akan diam-diam menempel ke organ lain. FMA ID stabil
 *    lintas rilis dataset.
 *
 * 2. **Bookmark menyimpan deep link, bukan snapshot state sendiri.** §E14 sudah
 *    punya encoder yang lengkap (kamera, visibilitas, opacity, seleksi, preset,
 *    bidang potong). Format kedua yang harus ikut diperbarui tiap ada state
 *    baru adalah cara paling pasti untuk punya dua sumber kebenaran yang
 *    berbeda.
 *
 * ⚠️ Semuanya tersimpan **per-perangkat dan per-browser** (§4.2 melarang
 * backend di v1). Itu bertentangan dengan tujuan "bisa diakses dari mana saja",
 * jadi UI wajib mengatakannya dan menyediakan ekspor/impor sebagai jembatan
 * manual. Lihat D-009 dan D-043.
 */

import { useSyncExternalStore } from 'react'
import { STORE_BOOKMARKS, STORE_NOTES, dbClear, dbDelete, dbGetAll, dbPut } from '@/lib/db'

/** Catatan pribadi untuk satu struktur. */
export interface Note {
  /** FMA ID, mis. "FMA7163". Kunci primer. */
  fma: string
  text: string
  updatedAt: number
}

/** Tampilan tersimpan. `hash` adalah deep link §E14 tanpa tanda pagar. */
export interface Bookmark {
  id: string
  name: string
  hash: string
  createdAt: number
  /**
   * Sidik jari dataset saat bookmark dibuat (`<jumlahStruktur>-<jumlahSegitiga>`).
   *
   * Deep link menyimpan seleksi sebagai `structureIdx`. Kalau dataset dibangun
   * ulang, idx bisa bergeser dan bookmark lama akan menyorot struktur yang
   * salah — terlihat meyakinkan dan diam-diam keliru. Sidik jari ini tidak
   * mencegahnya, tapi membuatnya bisa DIBERITAHUKAN. Tidak sempurna: dataset
   * berbeda dengan jumlah yang kebetulan sama tidak akan tertangkap.
   */
  dataFingerprint: string
}

export const MAX_NOTE_CHARS = 4000
export const MAX_NAME_CHARS = 80
const MAX_HASH_CHARS = 600

const FMA_RE = /^FMA\d+$/

// ---------------------------------------------------------------------------
// Fungsi murni — inti yang diuji
// ---------------------------------------------------------------------------

/** Rapikan teks catatan. String kosong berarti "hapus catatannya". */
export function sanitizeNoteText(raw: string): string {
  // Normalisasi baris baru supaya catatan yang ditempel dari Word tidak
  // menyimpan \r\n yang nanti tampil sebagai baris kosong ganda.
  return raw.replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTE_CHARS)
}

export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_CHARS)
}

function isNote(v: unknown): v is Note {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o['fma'] === 'string' &&
    FMA_RE.test(o['fma']) &&
    typeof o['text'] === 'string' &&
    o['text'].trim().length > 0
  )
}

function isBookmark(v: unknown): v is Bookmark {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o['id'] === 'string' &&
    o['id'].length > 0 &&
    typeof o['name'] === 'string' &&
    typeof o['hash'] === 'string' &&
    o['hash'].length > 0 &&
    o['hash'].length <= MAX_HASH_CHARS
  )
}

export interface Backup {
  app: 'corpus'
  version: 1
  exportedAt: string
  notes: Note[]
  bookmarks: Bookmark[]
}

export function serializeBackup(notes: Note[], bookmarks: Bookmark[]): string {
  const backup: Backup = {
    app: 'corpus',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
    bookmarks,
  }
  return JSON.stringify(backup, null, 2)
}

export interface ParseResult {
  notes: Note[]
  bookmarks: Bookmark[]
  /** Jumlah entri yang dibuang karena bentuknya tidak sah. */
  dropped: number
  error: string | null
}

/**
 * Baca berkas cadangan. **Tidak pernah melempar.**
 *
 * Isinya berasal dari berkas yang dipilih user — bisa saja bukan cadangan
 * Corpus sama sekali. Entri yang bentuknya salah DIBUANG dan dihitung, bukan
 * diimpor setengah jadi: catatan dengan FMA ngawur akan menempel ke struktur
 * yang tidak ada dan tidak akan pernah terlihat lagi oleh pemiliknya.
 */
export function parseBackup(raw: string): ParseResult {
  const kosong: ParseResult = { notes: [], bookmarks: [], dropped: 0, error: null }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ...kosong, error: 'Berkas ini bukan JSON yang sah.' }
  }
  if (typeof data !== 'object' || data === null) {
    return { ...kosong, error: 'Isi berkas bukan objek.' }
  }

  const o = data as Record<string, unknown>
  if (o['app'] !== 'corpus') {
    return { ...kosong, error: 'Berkas ini bukan cadangan Corpus.' }
  }
  if (o['version'] !== 1) {
    return {
      ...kosong,
      error: `Versi cadangan ${String(o['version'])} tidak dikenal — jangan ditebak isinya.`,
    }
  }

  const rawNotes = Array.isArray(o['notes']) ? (o['notes'] as unknown[]) : []
  const rawMarks = Array.isArray(o['bookmarks']) ? (o['bookmarks'] as unknown[]) : []

  const notes: Note[] = []
  const bookmarks: Bookmark[] = []
  let dropped = 0

  for (const n of rawNotes) {
    if (!isNote(n)) {
      dropped++
      continue
    }
    const text = sanitizeNoteText(n.text)
    if (!text) {
      dropped++
      continue
    }
    notes.push({
      fma: n.fma,
      text,
      updatedAt: typeof n.updatedAt === 'number' && n.updatedAt > 0 ? n.updatedAt : Date.now(),
    })
  }

  for (const b of rawMarks) {
    if (!isBookmark(b)) {
      dropped++
      continue
    }
    bookmarks.push({
      id: b.id,
      name: sanitizeName(b.name) || 'Tanpa nama',
      hash: b.hash,
      createdAt: typeof b.createdAt === 'number' && b.createdAt > 0 ? b.createdAt : Date.now(),
      dataFingerprint: typeof b.dataFingerprint === 'string' ? b.dataFingerprint : '',
    })
  }

  return { notes, bookmarks, dropped, error: null }
}

// ---------------------------------------------------------------------------
// Store modul (pola yang sama dengan lib/offline.ts)
// ---------------------------------------------------------------------------

interface StudyState {
  loaded: boolean
  notes: Map<string, Note>
  bookmarks: Bookmark[]
}

let snapshot: StudyState = { loaded: false, notes: new Map(), bookmarks: [] }
const listeners = new Set<() => void>()
let loading = false

function emit(patch: Partial<StudyState>): void {
  snapshot = { ...snapshot, ...patch }
  for (const fn of listeners) fn()
}

function getSnapshot(): StudyState {
  return snapshot
}

/** Bookmark terbaru di atas. */
function sortMarks(list: Bookmark[]): Bookmark[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

async function loadAll(): Promise<void> {
  if (loading || snapshot.loaded) return
  loading = true
  const [notes, marks] = await Promise.all([
    dbGetAll<Note>(STORE_NOTES),
    dbGetAll<Bookmark>(STORE_BOOKMARKS),
  ])
  emit({
    loaded: true,
    notes: new Map(notes.map((n) => [n.fma, n])),
    bookmarks: sortMarks(marks),
  })
  loading = false
}

function subscribe(fn: () => void): () => void {
  void loadAll()
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useStudyData(): StudyState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ---------------------------------------------------------------------------
// Mutasi
// ---------------------------------------------------------------------------

export async function saveNote(fma: string, raw: string): Promise<void> {
  const text = sanitizeNoteText(raw)
  const next = new Map(snapshot.notes)

  if (!text) {
    // Catatan kosong = dihapus. Menyimpan baris kosong cuma bikin daftar
    // catatan penuh entri yang tidak berisi apa-apa.
    next.delete(fma)
    emit({ notes: next })
    await dbDelete(STORE_NOTES, fma)
    return
  }

  const note: Note = { fma, text, updatedAt: Date.now() }
  next.set(fma, note)
  emit({ notes: next })
  await dbPut(STORE_NOTES, note)
}

export async function addBookmark(
  name: string,
  hash: string,
  dataFingerprint: string,
): Promise<Bookmark> {
  const mark: Bookmark = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `bm-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    name: sanitizeName(name) || 'Tanpa nama',
    hash: hash.replace(/^#/, ''),
    createdAt: Date.now(),
    dataFingerprint,
  }
  emit({ bookmarks: sortMarks([...snapshot.bookmarks, mark]) })
  await dbPut(STORE_BOOKMARKS, mark)
  return mark
}

export async function renameBookmark(id: string, name: string): Promise<void> {
  const mark = snapshot.bookmarks.find((b) => b.id === id)
  if (!mark) return
  const next: Bookmark = { ...mark, name: sanitizeName(name) || 'Tanpa nama' }
  emit({ bookmarks: sortMarks(snapshot.bookmarks.map((b) => (b.id === id ? next : b))) })
  await dbPut(STORE_BOOKMARKS, next)
}

export async function removeBookmark(id: string): Promise<void> {
  emit({ bookmarks: snapshot.bookmarks.filter((b) => b.id !== id) })
  await dbDelete(STORE_BOOKMARKS, id)
}

/** Impor menggabungkan, tidak menimpa: entri lokal yang lebih baru dipertahankan. */
export async function importBackup(result: ParseResult): Promise<{ notes: number; marks: number }> {
  const notes = new Map(snapshot.notes)
  let n = 0
  for (const note of result.notes) {
    const ada = notes.get(note.fma)
    // Menimpa catatan yang lebih baru dengan cadangan lama akan menghapus
    // kerja yang belum sempat diekspor. Yang terbaru menang.
    if (ada && ada.updatedAt >= note.updatedAt) continue
    notes.set(note.fma, note)
    await dbPut(STORE_NOTES, note)
    n++
  }

  const adaId = new Set(snapshot.bookmarks.map((b) => b.id))
  const tambahan = result.bookmarks.filter((b) => !adaId.has(b.id))
  for (const b of tambahan) await dbPut(STORE_BOOKMARKS, b)

  emit({ notes, bookmarks: sortMarks([...snapshot.bookmarks, ...tambahan]) })
  return { notes: n, marks: tambahan.length }
}

export async function clearAllStudyData(): Promise<void> {
  emit({ notes: new Map(), bookmarks: [] })
  await Promise.all([dbClear(STORE_NOTES), dbClear(STORE_BOOKMARKS)])
}
