/**
 * Pemilih tema terang/gelap/ikut-sistem (PRD §8.1).
 *
 * Ikon murni dekoratif; labelnya ada di `aria-label` dan `title`, karena
 * §E11 AC8 melarang warna/bentuk jadi satu-satunya pembawa informasi.
 */

import { THEME_LABEL, type ThemeChoice } from '@/lib/theme'
import { cn } from '@/lib/utils'

const ORDER: ThemeChoice[] = ['light', 'dark', 'system']

const ICON: Record<ThemeChoice, string> = {
  light: '☀',
  dark: '☾',
  system: '◐',
}

interface Props {
  value: ThemeChoice
  onChange: (choice: ThemeChoice) => void
}

export function ThemeToggle({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Tema tampilan"
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-panel-border bg-panel p-1 backdrop-blur"
    >
      {ORDER.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={THEME_LABEL[c]}
          title={THEME_LABEL[c]}
          onClick={() => {
            onChange(c)
          }}
          className={cn(
            'rounded px-2 py-1 text-[13px] leading-none transition-colors',
            value === c
              ? 'bg-panel-inverse text-panel-inverse-fg'
              : 'text-panel-muted hover:bg-panel-soft-hover hover:text-panel-fg',
          )}
        >
          <span aria-hidden="true">{ICON[c]}</span>
        </button>
      ))}
    </div>
  )
}
