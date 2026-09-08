/**
 * Kontrol exploded view (PRD §E6 AC1, AC8; §8.2 toolbar mengambang).
 *
 * Slider 0–100% supaya bisa di-scrub, bukan cuma tombol on/off — melihat
 * struktur bergerak keluar dari posisi anatomisnya secara bertahap itulah yang
 * bikin explode punya nilai pedagogis.
 */

import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface Props {
  /** 0..1 */
  value: number
  visibleCount: number
  warnThreshold: number
  onChange: (value: number) => void
  /** Scrub selesai (pointer dilepas) — dipakai untuk menghentikan mode scrub. */
  onCommit?: (value: number) => void
}

export function ExplodeControl({
  value,
  visibleCount,
  warnThreshold,
  onChange,
  onCommit,
}: Props) {
  const pct = Math.round(value * 100)
  const tooMany = visibleCount > warnThreshold
  const active = value > 0

  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-20 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onChange(active ? 0 : 1)
          }}
          className={cn(
            'shrink-0 rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
            active
              ? 'bg-white/90 font-medium text-black'
              : 'bg-white/8 text-white/70 hover:bg-white/15 hover:text-white',
          )}
        >
          Explode
        </button>

        <Slider
          value={[pct]}
          min={0}
          max={100}
          step={1}
          aria-label="Progres exploded view"
          onValueChange={(v) => {
            onChange((v[0] ?? 0) / 100)
          }}
          onValueCommit={(v) => {
            onCommit?.((v[0] ?? 0) / 100)
          }}
          className="flex-1 [&_[data-slot=slider-range]]:bg-white/80 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-white/12"
        />

        <span className="w-9 shrink-0 text-right text-[11px] text-white/50 tabular-nums">
          {pct}%
        </span>
      </div>

      {/*
        §E6 AC8: jangan diam-diam bikin layar jadi bubur. Katakan angkanya dan
        sarankan memfilter dulu — tapi jangan blokir; ini alat belajar, bukan
        wizard.
      */}
      {tooMany && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
          {visibleCount.toLocaleString('id')} struktur terlihat. Di atas{' '}
          {warnThreshold.toLocaleString('id')}, hasil explode jadi terlalu padat
          untuk dibaca — sembunyikan sistem lain dulu lewat panel kiri.
        </p>
      )}
    </div>
  )
}
