/**
 * Menampilkan satu nama beserta status verifikasinya (PRD §E7 AC4).
 *
 * Komponen ini adalah alasan aturan §E7 AC4 bisa ditegakkan konsisten: setiap
 * tempat yang menampilkan nomenklatur memakainya, jadi tidak ada jalur yang
 * lupa memasang badge.
 */

import {
  LANGUAGE_LABEL,
  statusExplanation,
  statusLabel,
  type DisplayName,
} from '@/content/nomenclature'
import { cn } from '@/lib/utils'

export function StatusBadge({
  status,
  className,
}: {
  status: 'reviewed' | 'machine' | 'needs-review'
  className?: string | undefined
}) {
  if (status === 'reviewed') return null // yang tepercaya tidak perlu penanda
  return (
    <span
      title={statusExplanation(status)}
      className={cn(
        'shrink-0 rounded px-1 py-px text-[9px] tracking-wide uppercase',
        status === 'needs-review'
          ? 'bg-red-400/15 text-red-300/90'
          : 'bg-amber-400/15 text-amber-300/90',
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  )
}

interface Props {
  name: DisplayName
  /** Nama Inggris FMA, dipakai kalau bahasa tampilannya `en`. */
  english: string
}

/**
 * Ketiga bahasa ditampilkan SEDERAJAT.
 *
 * §E7 AC1 semula menetapkan Latin sebagai bahasa utama dengan Indonesia
 * sebagai subtitle. Diubah atas keputusan product owner (D-027): ketiganya
 * menunjuk konsep yang sama — yang mengikat mereka adalah FMA ID, bukan
 * salah satu bahasa. Menaruh satu di atas yang lain menyiratkan hierarki
 * kebenaran yang tidak ada.
 */
export function NameBlock({ name, english }: Props) {
  const label = LANGUAGE_LABEL[name.language]
  const text = name.language === 'en' ? english : name.text

  return (
    <div>
      <p className="text-[10px] tracking-widest text-white/35 uppercase">{label}</p>
      {text ? (
        <p className="flex flex-wrap items-baseline gap-1.5">
          <span
            className={cn(
              'text-[15px] leading-tight font-medium text-white/95',
              // Nama yang belum diverifikasi ditulis miring — pembeda yang
              // tetap terbaca walau badge-nya terlewat.
              name.entry && name.entry.status !== 'reviewed' && 'italic',
            )}
          >
            {text}
          </span>
          {name.entry && <StatusBadge status={name.entry.status} />}
        </p>
      ) : (
        /*
          Jangan pernah jatuh diam-diam ke bahasa lain. Kalau Latin belum ada,
          katakan belum ada — menampilkan nama Inggris di slot "Latin (TA)"
          akan membuat user menghafal istilah yang salah.
        */
        <p className="text-[12px] text-white/30 italic">belum ada — perlu kurasi</p>
      )}
    </div>
  )
}
