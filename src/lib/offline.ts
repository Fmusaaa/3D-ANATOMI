/**
 * Registrasi service worker + status penyimpanan offline (PRD §E12).
 *
 * Service worker TIDAK mem-precache 32 MB geometri saat dipasang. Yang
 * tersimpan hanyalah byte yang memang sudah diunduh untuk ditampilkan, plus
 * pelengkap yang user pilih sendiri lewat panel Offline.
 *
 * Catatan jujur: `AtlasRenderer.load()` sekarang memuat seluruh batch saat app
 * dibuka, jadi kunjungan pertama tetap 32 MB. Yang dicegah kebijakan ini
 * adalah unduhan KEDUA sebesar itu di latar belakang saat service worker
 * dipasang — bukan unduhan pertamanya. Lihat D-039.
 *
 * Statusnya disimpan di store modul dan dibaca lewat `useSyncExternalStore`,
 * bukan `useState` + `useEffect`. Sumbernya memang eksternal (service worker,
 * event online/offline), dan pola ini menghindari setState di dalam efek —
 * sama seperti `useMediaQuery` di `device.ts`.
 */

import { useSyncExternalStore } from 'react'

export interface CacheStats {
  /** Path geometri yang benar-benar ada di cache. Ukurannya dihitung dari
   *  manifest oleh pemanggil — Content-Length tidak selalu dikirim server. */
  paths: string[]
  build: string
  dataVersion: string
}

export interface PrecacheProgress {
  done: number
  total: number
  failed: number
}

export interface GeometryEntry {
  file: string
  systemId: string
  bytes: number
  structureCount: number
}

export interface OfflineState {
  supported: boolean
  /** Service worker sudah mengendalikan halaman ini. */
  active: boolean
  updateReady: boolean
  online: boolean
  stats: CacheStats | null
  progress: PrecacheProgress | null
}

interface ManifestShape {
  batches?: GeometryEntry[]
}

const SW_URL = '/sw.js'

function swSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

function controller(): ServiceWorker | null {
  return swSupported() ? navigator.serviceWorker.controller : null
}

// ---------------------------------------------------------------------------
// Store modul
// ---------------------------------------------------------------------------

let registration: ServiceWorkerRegistration | null = null
let wired = false

let snapshot: OfflineState = {
  supported: swSupported(),
  active: controller() !== null,
  updateReady: false,
  online: typeof navigator === 'undefined' || navigator.onLine,
  stats: null,
  progress: null,
}

const listeners = new Set<() => void>()

function emit(patch: Partial<OfflineState>): void {
  // `useSyncExternalStore` membandingkan dengan Object.is — objek baru wajib.
  snapshot = { ...snapshot, ...patch }
  for (const fn of listeners) fn()
}

function getSnapshot(): OfflineState {
  return snapshot
}

/**
 * Pasang listener sekali saja, di luar React.
 *
 * Dipanggil dari `subscribe`, jadi biayanya baru muncul kalau ada komponen
 * yang benar-benar memakai statusnya.
 */
function ensureWired(): void {
  if (wired || typeof window === 'undefined') return
  wired = true

  const syncOnline = (): void => {
    emit({ online: navigator.onLine, active: controller() !== null })
  }
  window.addEventListener('online', syncOnline)
  window.addEventListener('offline', syncOnline)

  if (swSupported()) {
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string } & Partial<PrecacheProgress>
      if (data.type === 'precache-progress') {
        emit({
          progress: {
            done: data.done ?? 0,
            total: data.total ?? 0,
            failed: data.failed ?? 0,
          },
        })
      } else if (data.type === 'precache-done') {
        emit({ progress: null })
        void refreshStats()
      }
    })
  }

  void refreshStats()
}

function subscribe(fn: () => void): () => void {
  ensureWired()
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ---------------------------------------------------------------------------
// Registrasi
// ---------------------------------------------------------------------------

/**
 * Dipanggil sekali dari `main.tsx`, hanya di build produksi.
 *
 * Sengaja tidak aktif saat `npm run dev`: service worker yang meng-cache
 * modul dev akan bertabrakan dengan HMR dan memunculkan "bug" yang sebenarnya
 * cuma file basi. Untuk mengujinya: `npm run build && npm run preview`.
 */
export function registerServiceWorker(): void {
  if (!swSupported() || !import.meta.env.PROD) return

  // Ditangkap SEBELUM registrasi. `clients.claim()` di service worker baru
  // memicu `controllerchange` juga pada instalasi pertama; kalau itu ikut
  // memuat ulang, kunjungan pertama akan reload sendiri tanpa alasan.
  const hadController = controller() !== null

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      emit({ active: true })
      void refreshStats()
      return
    }
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((reg) => {
        registration = reg
        // Versi baru sudah menunggu sejak kunjungan sebelumnya.
        if (reg.waiting && controller()) emit({ updateReady: true })

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            // controller null = instalasi pertama, bukan pembaruan. Menyebutnya
            // "versi baru" di situ cuma membingungkan.
            if (installing.state === 'installed' && controller()) {
              emit({ updateReady: true })
            }
          })
        })
      })
      .catch(() => {
        // Registrasi gagal (mode privat, HTTP, kebijakan browser) bukan error
        // fatal — app tetap jalan penuh, cuma tanpa offline.
      })
  })
}

// ---------------------------------------------------------------------------
// Percakapan dengan service worker
// ---------------------------------------------------------------------------

/** Tanya service worker dan tunggu balasannya lewat MessageChannel. */
async function ask<T>(message: Record<string, unknown>, timeoutMs = 8000): Promise<T | null> {
  const worker = controller()
  if (!worker) return null
  return new Promise<T | null>((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => {
      resolve(null)
    }, timeoutMs)
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer)
      resolve(event.data as T)
    }
    worker.postMessage(message, [channel.port2])
  })
}

function tell(message: Record<string, unknown>): void {
  controller()?.postMessage(message)
}

export async function refreshStats(): Promise<void> {
  const stats = await ask<CacheStats>({ type: 'cache-stats' })
  emit({ active: controller() !== null, stats })
}

export function downloadGeometry(urls: string[]): void {
  emit({ progress: { done: 0, total: urls.length, failed: 0 } })
  tell({ type: 'precache-geometry', urls })
}

export function cancelDownload(): void {
  tell({ type: 'cancel-precache' })
  emit({ progress: null })
}

export async function clearOfflineData(): Promise<void> {
  await ask({ type: 'clear-data' })
  await refreshStats()
}

export function applyUpdate(): void {
  // Halaman memuat ulang sendiri lewat listener `controllerchange`.
  registration?.waiting?.postMessage({ type: 'skip-waiting' })
}

export async function loadGeometryIndex(baseUrl = '/data'): Promise<GeometryEntry[]> {
  const res = await fetch(`${baseUrl}/manifest.json`)
  if (!res.ok) return []
  const json = (await res.json()) as ManifestShape
  return json.batches ?? []
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOffline(): OfflineState & {
  refresh: () => Promise<void>
  download: (urls: string[]) => void
  cancel: () => void
  clearData: () => Promise<void>
  applyUpdate: () => void
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    ...state,
    refresh: refreshStats,
    download: downloadGeometry,
    cancel: cancelDownload,
    clearData: clearOfflineData,
    applyUpdate,
  }
}
