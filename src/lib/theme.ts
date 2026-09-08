/**
 * Tema terang/gelap (PRD §8.1 prinsip 2).
 *
 * §8.1: *"Gelap secara default. Latar gelap netral (#0d0f12) bikin jaringan
 * berwarna terang menonjol dan mengurangi kelelahan mata saat belajar malam.
 * Sediakan mode terang."*
 *
 * Tiga pilihan, bukan dua: `system` mengikuti setelan OS. Memaksa user memilih
 * manual padahal OS-nya sudah punya preferensi itu kerja tambahan tanpa alasan.
 */

import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'corpus.theme'

export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'Ikuti sistem',
  light: 'Terang',
  dark: 'Gelap',
}

function readStored(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'dark'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return choice
}

/** Warna latar kanvas 3D per tema — harus cocok dengan `--canvas-bg` di CSS. */
export const CANVAS_BG: Record<ResolvedTheme, number> = {
  dark: 0x0d0f12,
  light: 0xeef0f3,
}

export function useTheme(): {
  choice: ThemeChoice
  resolved: ResolvedTheme
  setChoice: (c: ThemeChoice) => void
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStored()))

  // Terapkan ke <html> dan simpan. Kelas `dark` adalah yang dibaca token CSS.
  useEffect(() => {
    const apply = (): void => {
      const next = resolveTheme(choice)
      setResolved(next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      // Beri tahu browser supaya scrollbar & form control ikut temanya.
      document.documentElement.style.colorScheme = next
    }
    apply()
    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch {
      // Mode privat bisa menolak localStorage; tema tetap jalan untuk sesi ini.
    }
    if (choice !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => {
      mq.removeEventListener('change', apply)
    }
  }, [choice])

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c)
  }, [])

  return { choice, resolved, setChoice }
}
