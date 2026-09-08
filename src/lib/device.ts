/**
 * Deteksi kemampuan perangkat & media query (PRD §E11).
 *
 * §E11 AC4 keras soal satu hal: kalau perangkatnya lemah dan kita menurunkan
 * kualitas, **beri tahu user** — jangan degradasi diam-diam. Modul ini
 * menyediakan datanya; UI yang menampilkannya.
 */

import { useCallback, useSyncExternalStore } from 'react'

/** §E11 AC1: di bawah ini layout berubah jadi drawer + bottom sheet. */
export const MOBILE_BREAKPOINT = 768

/**
 * `useSyncExternalStore` adalah API React untuk berlangganan sumber di luar
 * React — persis kasus media query. Versi useState+useEffect memanggil
 * setState sinkron di dalam effect dan memicu cascading render.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => {
        mq.removeEventListener('change', onChange)
      }
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  // Server tidak punya matchMedia; anggap desktop.
  const getServerSnapshot = useCallback(() => false, [])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`)
}

/** §E11 AC9. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

export interface DeviceCapability {
  /** navigator.deviceMemory dalam GB; null kalau browser tidak menyediakannya. */
  memoryGB: number | null
  cores: number | null
  /** Layar sentuh / pointer kasar. */
  coarsePointer: boolean
  /** Nama GPU dari WEBGL_debug_renderer_info, kalau diizinkan. */
  gpu: string | null
  /**
   * Perangkat dianggap terbatas: memori < 4 GB (§E11 AC4), atau inti sedikit,
   * atau GPU yang dikenal lemah.
   */
  limited: boolean
  /** Alasan yang bisa ditampilkan ke user — jangan degradasi diam-diam. */
  reasons: string[]
}

/**
 * `deviceMemory` belum ada di lib.dom TS, dan `hardwareConcurrency` sudah ada
 * sebagai wajib — jadi ini dibaca lewat tipe lepas, bukan meng-extend Navigator.
 */
interface NavigatorCaps {
  deviceMemory?: number
  hardwareConcurrency?: number
}

/**
 * Deteksi sekali saat startup. Tidak reaktif — kemampuan perangkat tidak
 * berubah di tengah sesi.
 */
export function detectCapability(gl: WebGL2RenderingContext | null): DeviceCapability {
  const nav = navigator as unknown as NavigatorCaps
  const memoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null
  const coarsePointer =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  let gpu: string | null = null
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number
    } | null
    if (ext) {
      const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as unknown
      gpu = typeof raw === 'string' ? raw : null
    }
  }

  const reasons: string[] = []
  if (memoryGB !== null && memoryGB < 4) reasons.push(`memori perangkat ${String(memoryGB)} GB`)
  if (cores !== null && cores <= 4) reasons.push(`${String(cores)} inti CPU`)
  // Adreno/Mali kelas bawah dan software renderer.
  if (gpu && /SwiftShader|llvmpipe|Software/i.test(gpu)) reasons.push('GPU perangkat lunak')

  return {
    memoryGB,
    cores,
    coarsePointer,
    gpu,
    limited: reasons.length > 0,
    reasons,
  }
}
