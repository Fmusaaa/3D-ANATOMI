/**
 * Event emitter tipe-aman untuk jalur viewer -> UI (§5.5).
 *
 * Arah sebaliknya (UI -> viewer) TIDAK lewat sini: itu pakai method call
 * imperatif di `AtlasRenderer`. Emitter ini sengaja satu arah supaya tidak
 * pelan-pelan berubah jadi bus dua arah.
 *
 * Bebas three.js dan bebas React — boleh diimpor `src/components/**`.
 */

import type { HoverInfo, LoadProgress, SystemState, ViewerStats } from './types'

export interface ViewerEvents {
  /** Di-throttle maksimal 10 Hz (§5.2 aturan 2). Jangan pernah per-frame. */
  stats: ViewerStats
  progress: LoadProgress
  ready: { structures: number; triangles: number }
  /** Status visibilitas/opacity tiap sistem, setelah setiap perubahan. */
  systems: SystemState[]
  /**
   * Hover berubah. Sengaja di-emit HANYA saat structureIdx-nya berganti,
   * bukan tiap gerakan mouse — §5.2 melarang state per-frame masuk React.
   */
  hover: HoverInfo | null
  /** Seleksi berubah. Urutan = urutan klik (§E3 AC8, maks 8). */
  selection: number[]
  error: { message: string; cause?: unknown }
}

type Listener<K extends keyof ViewerEvents> = (payload: ViewerEvents[K]) => void

export class ViewerEmitter {
  private readonly listeners = new Map<keyof ViewerEvents, Set<Listener<never>>>()

  on<K extends keyof ViewerEvents>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(fn)
    return () => {
      set.delete(fn)
    }
  }

  emit<K extends keyof ViewerEvents>(event: K, payload: ViewerEvents[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of set) {
      // Listener yang melempar tidak boleh menjatuhkan render loop.
      try {
        ;(fn as Listener<K>)(payload)
      } catch (e) {
        console.error(`ViewerEmitter: listener "${String(event)}" melempar`, e)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
