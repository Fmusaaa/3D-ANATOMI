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
    <div className="pointer-events-auto w-full rounded-xl border border-panel-border bg-panel px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onChange(active ? 0 : 1)
          }}
          className={cn(
            'shrink-0 rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
            active
              ? 'bg-panel-inverse font-medium text-panel-inverse-fg'
              : 'bg-panel-soft text-panel-muted hover:bg-panel-soft-hover hover:text-panel-fg',
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
          className="flex-1 [&_[data-slot=slider-range]]:bg-panel-fg/70 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-panel-soft-hover"
        />

        <span className="w-9 shrink-0 text-right text-[11px] text-panel-muted tabular-nums">
          {pct}%
        </span>
      </div>

      {/*
        §E6 AC8: jangan diam-diam bikin layar jadi bubur. Katakan angkanya dan
        sarankan memfilter dulu — tapi jangan blokir; ini alat belajar, bukan
        wizard.
      */}
      {tooMany && (
        <p className="mt-2 text-[11px] leading-relaxed text-panel-warn">
          {visibleCount.toLocaleString('id')} struktur terlihat. Di atas{' '}
          {warnThreshold.toLocaleString('id')}, hasil explode jadi terlalu padat
          untuk dibaca — sembunyikan sistem lain dulu lewat panel kiri.
        </p>
      )}
    </div>
  )
}
