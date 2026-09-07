/**
 * Dev overlay — wajib ada sejak Fase 1 (§14.3): FPS, draw call, segitiga,
 * struktur terlihat, memori. "Tanpa ini kita buta soal performa."
 *
 * Komponen ini murni presentasi. Ia TIDAK boleh menyentuh three.js — hanya
 * menerima `ViewerStats` lewat props (§5.5).
 */

import { type ViewerStats } from '@/viewer/types'
import { cn } from '@/lib/utils'

interface Props {
  stats: ViewerStats | null
  onClose?: (() => void) | undefined
}

function Row({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  // `exactOptionalPropertyTypes` aktif: prop opsional harus eksplisit
  // menerima undefined kalau pemanggil boleh mengoper undefined.
  tone?: 'ok' | 'warn' | 'bad' | undefined
  hint?: string | undefined
}) {
  return (
    <div className="flex items-baseline justify-between gap-4" title={hint}>
      <span className="text-white/45">{label}</span>
      <span
        className={cn(
          'tabular-nums',
          tone === 'ok' && 'text-emerald-400',
          tone === 'warn' && 'text-amber-400',
          tone === 'bad' && 'text-red-400',
          !tone && 'text-white/85',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function DevOverlay({ stats, onClose }: Props) {
  if (!stats) return null

  const idle = stats.rendersLastSecond === 0

  return (
    <div className="pointer-events-auto absolute top-3 left-3 z-20 w-60 rounded-lg border border-white/10 bg-black/70 p-3 font-mono text-[11px] leading-5 backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-semibold tracking-wide text-white/70">DEV</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1 text-white/40 hover:text-white/80"
            aria-label="Tutup dev overlay"
          >
            ×
          </button>
        )}
      </div>

      {/* §E2 AC7 — ini buktinya, bukan klaim. Idle harus benar-benar 0. */}
      <Row
        label="render / 1 dtk"
        value={idle ? '0 (idle)' : String(stats.rendersLastSecond)}
        tone={idle ? 'ok' : undefined}
        hint="§E2 AC7: saat tidak ada interaksi & animasi, render() tidak dipanggil sama sekali"
      />
      <Row label="total render" value={stats.totalRenders.toLocaleString('id')} />
      <Row
        label="fps"
        value={idle || stats.fps === null ? '—' : String(stats.fps)}
        tone={idle || stats.fps === null ? undefined : stats.fps >= 55 ? 'ok' : 'warn'}
        hint="§E2 AC8 menargetkan ≥55 saat orbit"
      />
      <Row label="frame" value={stats.frameMs === null ? '—' : `${stats.frameMs} ms`} />

      <hr className="my-1.5 border-white/10" />

      <Row label="draw call" value={String(stats.drawCalls)} />
      <Row
        label="pass transparan"
        value={stats.transparentPass ? 'aktif' : 'mati'}
        tone={stats.transparentPass ? 'warn' : 'ok'}
        hint="D-013: pass transparan yang selalu menyala menggandakan vertex work"
      />
      <Row label="segitiga" value={stats.triangles.toLocaleString('id')} />
      <Row label="batch" value={String(stats.batches)} />
      <Row
        label="struktur"
        value={`${stats.visibleStructures.toLocaleString('id')} / ${stats.totalStructures.toLocaleString('id')}`}
      />

      <hr className="my-1.5 border-white/10" />

      <Row label="geometri" value={`${stats.geometryMB} MB`} />
      <Row
        label="JS heap"
        value={stats.jsHeapMB === null ? 'n/a' : `${stats.jsHeapMB} MB`}
        tone={stats.jsHeapMB !== null && stats.jsHeapMB > 500 ? 'bad' : undefined}
        hint="§E11 menargetkan < 500 MB"
      />
    </div>
  )
}
