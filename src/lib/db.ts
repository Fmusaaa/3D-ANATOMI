/**
 * Pembungkus IndexedDB seperlunya (PRD §5.1 baris "Persistence").
 *
 * PRD memilih IndexedDB, bukan localStorage, karena catatan mahasiswa bisa
 * panjang dan localStorage sinkron serta terbatas ~5 MB. Fase 7 (progres, SRS)
 * akan menumpang store yang sama, jadi bentuknya sengaja generik — tapi TIDAK
 * ada satu pun object store yang dibuat di sini untuk fitur yang belum ada.
 *
 * ⚠️ IndexedDB bisa TIDAK tersedia: mode privat, kebijakan browser, atau kuota
 * habis. Semua fungsi di sini mengembalikan nilai kosong alih-alih melempar,
 * dan `dbUnavailableReason()` memberi tahu UI supaya bisa berkata jujur —
 * fitur catatan yang diam-diam tidak menyimpan apa pun jauh lebih buruk
 * daripada fitur yang bilang "tidak bisa menyimpan di browser ini".
 */

const DB_NAME = 'corpus'
const DB_VERSION = 1

export const STORE_NOTES = 'notes'
export const STORE_BOOKMARKS = 'bookmarks'

let dbPromise: Promise<IDBDatabase | null> | null = null
let unavailable: string | null = null

export function dbUnavailableReason(): string | null {
  return unavailable
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      unavailable = 'Browser ini tidak menyediakan IndexedDB.'
      resolve(null)
      return
    }

    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      // Firefox mode privat melempar di sini, bukan lewat onerror.
      unavailable = 'Penyimpanan lokal diblokir (mode privat?).'
      resolve(null)
      return
    }

    req.onupgradeneeded = () => {
      const db = req.result
      // Catatan dikunci ke FMA ID, BUKAN structureIdx: idx ditentukan pipeline
      // dan bisa bergeser kalau data dibangun ulang — catatan mahasiswa bisa
      // diam-diam menempel ke organ yang berbeda. FMA ID stabil.
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        db.createObjectStore(STORE_NOTES, { keyPath: 'fma' })
      }
      if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
        db.createObjectStore(STORE_BOOKMARKS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => {
      resolve(req.result)
    }
    req.onerror = () => {
      unavailable = req.error?.message ?? 'Tidak bisa membuka penyimpanan lokal.'
      resolve(null)
    }
    // Tab lain memegang versi lama dan memblokir upgrade.
    req.onblocked = () => {
      unavailable = 'Tab lain sedang memakai versi database yang berbeda.'
      resolve(null)
    }
  })

  return dbPromise
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
  fallback: T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve) => {
        if (!db) {
          resolve(fallback)
          return
        }
        try {
          const tx = db.transaction(store, mode)
          const req = fn(tx.objectStore(store))
          req.onsuccess = () => {
            resolve(req.result)
          }
          req.onerror = () => {
            unavailable = req.error?.message ?? 'Penulisan ke penyimpanan lokal gagal.'
            resolve(fallback)
          }
        } catch (err) {
          unavailable = err instanceof Error ? err.message : String(err)
          resolve(fallback)
        }
      }),
  )
}

export function dbGetAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>, [])
}

export function dbPut<T>(store: string, value: T): Promise<boolean> {
  // `null` sebagai fallback, bukan `undefined`: IDBValidKey tidak pernah null,
  // jadi null adalah penanda gagal yang tidak bisa bentrok dengan kunci sah.
  return run<IDBValidKey | null>(
    store,
    'readwrite',
    (s) => s.put(value) as IDBRequest<IDBValidKey | null>,
    null,
  ).then((k) => k !== null)
}

export function dbDelete(store: string, key: IDBValidKey): Promise<void> {
  return run<undefined>(store, 'readwrite', (s) => s.delete(key), undefined).then(() => undefined)
}

export function dbClear(store: string): Promise<void> {
  return run<undefined>(store, 'readwrite', (s) => s.clear(), undefined).then(() => undefined)
}
