/**
 * Kontrol visibilitas & opacity per sistem (PRD §E4).
 *
 * §E4 AC7: **semua perubahan visibilitas beranimasi (fade 180 ms)**. Perubahan
 * mendadak bikin user kehilangan orientasi spasial — itu alasan pedagogis,
 * bukan hiasan.
 *
 * Animasi berjalan di atas state texture, jadi tidak ada geometri yang dibangun
 * ulang (§5.2). Menyembunyikan sistem = fade opacity ke 0 lalu set visible=false
 * supaya vertex-nya benar-benar ter-cull di shader dan tidak bisa ter-pick
 * (§E3 AC10).
 */

import { SelectState, type StateTexture } from './StateTexture'
import type { SystemState } from './types'

/** §E4 AC7 */
const FADE_MS = 180

/** Ghost mode §E4 AC4: konteks spasial tetap ada, tapi tidak menghalangi. */
export const GHOST_OPACITY = 0.12

export type { SystemState }

interface Track {
  idx: number
  from: number
  to: number
  /** Setelah fade selesai, struktur di-set invisible. */
  hideAtEnd: boolean
}

export class VisibilityController {
  private readonly state: StateTexture
  private readonly bySystem = new Map<string, number[]>()
  private readonly systems = new Map<string, SystemState>()

  private tracks: Track[] = []
  private animStart = 0
  private reducedMotion = false

  constructor(state: StateTexture) {
    this.state = state
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.reducedMotion = mq.matches
      mq.addEventListener('change', (e) => {
        this.reducedMotion = e.matches
      })
    }
  }

  register(systemId: string, structureIdx: number): void {
    let list = this.bySystem.get(systemId)
    if (!list) {
      list = []
      this.bySystem.set(systemId, list)
      this.systems.set(systemId, {
        id: systemId,
        count: 0,
        visible: true,
        opacity: 1,
        ghosted: false,
      })
    }
    list.push(structureIdx)
    const s = this.systems.get(systemId)
    if (s) s.count++
  }

  snapshot(): SystemState[] {
    return [...this.systems.values()].map((s) => ({ ...s }))
  }

  /**
   * Terapkan target untuk satu sistem. Mengembalikan true kalau ada yang
   * berubah (pemanggil perlu menjadwalkan frame).
   */
  setSystem(systemId: string, opts: { visible?: boolean; opacity?: number; ghosted?: boolean }): boolean {
    const s = this.systems.get(systemId)
    const list = this.bySystem.get(systemId)
    if (!s || !list) return false

    const nextVisible = opts.visible ?? s.visible
    const nextGhost = opts.ghosted ?? s.ghosted
    const nextOpacity = opts.opacity ?? (nextGhost ? GHOST_OPACITY : s.ghosted ? 1 : s.opacity)

    if (s.visible === nextVisible && s.opacity === nextOpacity && s.ghosted === nextGhost) {
      return false
    }

    s.visible = nextVisible
    s.opacity = nextOpacity
    s.ghosted = nextGhost

    const targetOpacity = nextVisible ? nextOpacity : 0
    for (const idx of list) {
      // Struktur yang sedang tersembunyi harus di-visible-kan LEBIH DULU,
      // kalau tidak fade-in-nya tidak akan terlihat sama sekali.
      if (nextVisible && !this.state.getVisible(idx)) {
        this.state.setVisible(idx, true)
        this.state.setOpacity(idx, 0)
      }
      this.state.setSelectState(idx, nextGhost ? SelectState.Dimmed : SelectState.Normal)
      this.queue(idx, targetOpacity, !nextVisible)
    }
    this.animStart = performance.now()
    return true
  }

  private queue(idx: number, to: number, hideAtEnd: boolean): void {
    const from = this.state.getOpacity(idx)
    const existing = this.tracks.findIndex((t) => t.idx === idx)
    const track: Track = { idx, from, to, hideAtEnd }
    if (existing >= 0) this.tracks[existing] = track
    else this.tracks.push(track)
  }

  get isAnimating(): boolean {
    return this.tracks.length > 0
  }

  /**
   * Maju satu langkah animasi. Mengembalikan true selama masih ada yang
   * beranimasi (frame berikutnya perlu digambar).
   */
  update(now: number): boolean {
    if (this.tracks.length === 0) return false

    const k = this.reducedMotion ? 1 : Math.min(1, (now - this.animStart) / FADE_MS)
    for (const t of this.tracks) {
      this.state.setOpacity(t.idx, t.from + (t.to - t.from) * k)
    }

    if (k >= 1) {
      for (const t of this.tracks) {
        if (t.hideAtEnd) this.state.setVisible(t.idx, false)
      }
      this.tracks = []
      return false
    }
    return true
  }
}
