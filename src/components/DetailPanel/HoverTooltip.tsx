/**
 * Tooltip nama saat hover (PRD §E3 AC1).
 *
 * Muncul dekat kursor. Posisi dijepit ke dalam viewport supaya tidak terpotong
 * di tepi layar.
 */

import type { StructureMeta } from '@/content/structures'
import { SYSTEM_LABEL } from '@/content/structures'
import { displayName, type LanguageCode, type Nomenclature } from '@/content/nomenclature'
import { StatusBadge } from '@/components/Nomenclature/NameBlock'

interface Props {
  structure: StructureMeta | null
  nomenclature: Nomenclature | null
  language: LanguageCode
  x: number
  y: number
}

export function HoverTooltip({ structure, nomenclature, language, x, y }: Props) {
  if (!structure) return null

  const sys = SYSTEM_LABEL[structure.system]
  const primary = displayName(nomenclature, structure.fma, structure.name.en, language)
  const left = Math.min(x + 14, (globalThis.innerWidth || 1200) - 260)
  const top = Math.min(y + 16, (globalThis.innerHeight || 800) - 70)

  return (
    <div
      role="status"
      className="pointer-events-none fixed z-30 max-w-[248px] rounded-md border border-white/12 bg-black/85 px-2.5 py-1.5 backdrop-blur"
      style={{ left, top }}
    >
      <p className="flex items-baseline gap-1.5">
        <span className="truncate text-[12px] leading-tight text-white/95">
          {primary.text || structure.name.en}
        </span>
        {primary.entry && <StatusBadge status={primary.entry.status} />}
      </p>
      {/* Baris kedua: nama Inggris kalau bahasa utamanya bukan Inggris. */}
      {language !== 'en' && primary.text && (
        <p className="truncate text-[10px] text-white/40">{structure.name.en}</p>
      )}
      {sys && <p className="truncate text-[10px] text-white/45">{sys.id}</p>}
    </div>
  )
}
