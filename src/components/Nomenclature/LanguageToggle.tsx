/**
 * Pilihan bahasa yang ditampilkan lebih dulu (PRD §E7 AC1, diubah oleh D-027).
 *
 * Ini BUKAN "bahasa utama". Ketiga bahasa sederajat; toggle ini hanya
 * menentukan urutan, dan mana yang muat di tempat sempit (tooltip, satu baris
 * hasil pencarian) yang secara fisik tidak bisa memuat tiga nama.
 *
 * §E7 AC3 tetap berlaku: pencarian selalu menelusuri semua bahasa, apa pun
 * pilihan di sini.
 */

import { LANGUAGE_LABEL, type LanguageCode } from '@/content/nomenclature'
import { cn } from '@/lib/utils'

const ORDER: LanguageCode[] = ['la', 'id', 'en']
const SHORT: Record<LanguageCode, string> = { la: 'LA', id: 'ID', en: 'EN' }

interface Props {
  value: LanguageCode
  onChange: (lang: LanguageCode) => void
  /** Jumlah entri terverifikasi per bahasa, untuk jujur soal cakupan. */
  coverage?: Partial<Record<LanguageCode, { total: number; reviewed: number }>> | undefined
}

export function LanguageToggle({ value, onChange, coverage }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Bahasa yang ditampilkan lebih dulu"
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-panel-border bg-panel p-1 backdrop-blur"
    >
      {ORDER.map((lang) => {
        const cov = coverage?.[lang]
        const title =
          lang === 'en'
            ? 'Tampilkan Inggris lebih dulu — nama FMA, selalu tersedia'
            : cov
              ? `Tampilkan ${LANGUAGE_LABEL[lang]} lebih dulu — ${String(cov.total)} entri, ${String(cov.reviewed)} terverifikasi`
              : `Tampilkan ${LANGUAGE_LABEL[lang]} lebih dulu`
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={value === lang}
            title={title}
            onClick={() => {
              onChange(lang)
            }}
            className={cn(
              'rounded px-2 py-1 text-[11px] font-medium transition-colors',
              value === lang
                ? 'bg-panel-inverse text-panel-inverse-fg'
                : 'text-panel-muted hover:bg-panel-soft-hover hover:text-panel-fg',
            )}
          >
            {SHORT[lang]}
          </button>
        )
      })}
    </div>
  )
}
