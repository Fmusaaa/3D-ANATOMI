/**
 * Toggle bahasa utama (PRD §E7 AC1).
 *
 * Default Latin. §E7 AC3 penting untuk dipahami saat membaca ini: toggle ini
 * hanya mengubah TAMPILAN — pencarian selalu menelusuri semua bahasa apa pun
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
      aria-label="Bahasa nomenklatur"
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/70 p-1 backdrop-blur"
    >
      {ORDER.map((lang) => {
        const cov = coverage?.[lang]
        const title =
          lang === 'en'
            ? 'Nama Inggris dari FMA — selalu tersedia'
            : cov
              ? `${LANGUAGE_LABEL[lang]}: ${String(cov.total)} entri, ${String(cov.reviewed)} terverifikasi`
              : LANGUAGE_LABEL[lang]
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
                ? 'bg-white/90 text-black'
                : 'text-white/55 hover:bg-white/10 hover:text-white/90',
            )}
          >
            {SHORT[lang]}
          </button>
        )
      })}
    </div>
  )
}
