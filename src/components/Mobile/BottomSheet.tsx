/**
 * Bottom sheet 3 tahap untuk layar sempit (PRD §8.3, §E11 AC1).
 *
 * Tahap: peek 72 px / half / full — sesuai §8.3. Bisa di-drag, dan juga bisa
 * dipindah tahap lewat keyboard (§E11 AC6): panah atas/bawah saat handle
 * terfokus.
 */

import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type SheetStop = 'peek' | 'half' | 'full'

const STOPS: SheetStop[] = ['peek', 'half', 'full']

const PEEK_PX = 72

/**
 * Tinggi tiap tahap sebagai CSS, BUKAN piksel hasil `window.innerHeight`.
 *
 * `dvh` ada persis untuk kasus ini: di HP, bar URL yang muncul-hilang mengubah
 * tinggi viewport terus-menerus, jadi angka yang diukur JS langsung basi.
 * Versi pertama komponen ini menyimpan `vh` di state, dan akibatnya tinggi
 * sheet tidak pernah cocok dengan tahap yang sedang aktif.
 */
const STOP_CSS: Record<SheetStop, string> = {
  peek: `${String(PEEK_PX)}px`,
  half: '50dvh',
  full: '88dvh',
}

/** Hanya dipakai untuk memilih tahap terdekat saat drag dilepas. */
const STOP_FRACTION: Record<SheetStop, number> = { peek: 0, half: 0.5, full: 0.88 }

interface Props {
  open: boolean
  stop: SheetStop
  onStopChange: (stop: SheetStop) => void
  onClose: () => void
  label: string
  children: React.ReactNode
}

export function BottomSheet({ open, stop, onStopChange, onClose, label, children }: Props) {
  const [dragOffset, setDragOffset] = useState(0)
  // `dragging` harus state, bukan ref: nilainya dibaca saat render (untuk
  // mematikan transisi CSS), dan membaca ref saat render itu tidak sah.
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<number | null>(null)

  const height =
    dragOffset === 0
      ? STOP_CSS[stop]
      : `max(${String(PEEK_PX)}px, calc(${STOP_CSS[stop]} - ${String(Math.round(dragOffset))}px))`

  const settle = useCallback(
    (finalPx: number) => {
      // Berhenti di tahap TERDEKAT, bukan di posisi bebas — supaya sheet selalu
      // mendarat di tempat yang bisa diprediksi.
      const vh = window.innerHeight
      let best: SheetStop = 'peek'
      let bestDist = Number.POSITIVE_INFINITY
      for (const s of STOPS) {
        const target = s === 'peek' ? PEEK_PX : vh * STOP_FRACTION[s]
        const d = Math.abs(target - finalPx)
        if (d < bestDist) {
          bestDist = d
          best = s
        }
      }
      onStopChange(best)
      setDragOffset(0)
    },
    [onStopChange],
  )

  const onPointerDown = (e: React.PointerEvent): void => {
    dragStart.current = e.clientY
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (dragStart.current === null) return
    setDragOffset(e.clientY - dragStart.current)
  }
  const onPointerUp = (e: React.PointerEvent): void => {
    if (dragStart.current === null) return
    dragStart.current = null
    setDragging(false)
    settle(e.currentTarget.parentElement?.getBoundingClientRect().height ?? PEEK_PX)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const i = STOPS.indexOf(stop)
    if (e.key === 'ArrowUp' && i < STOPS.length - 1) {
      e.preventDefault()
      onStopChange(STOPS[i + 1] as SheetStop)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (i > 0) onStopChange(STOPS[i - 1] as SheetStop)
      else onClose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <section
      aria-label={label}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-white/12 bg-black/92 backdrop-blur"
      style={{ height, transition: dragging ? 'none' : 'height 180ms ease-out' }}
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${label} — tahap tampilan`}
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={STOPS.indexOf(stop)}
        aria-valuetext={stop}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span className={cn('h-1 w-10 rounded-full bg-white/25')} aria-hidden="true" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </section>
  )
}
