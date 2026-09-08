/**
 * Drawer kiri untuk panel sistem di layar sempit (PRD §8.3, §E11 AC1).
 *
 * Fokus dikunci di dalam drawer selama terbuka, dan Escape menutupnya —
 * §E11 AC6 menuntut semua fungsi non-3D bisa diakses lewat keyboard, dan
 * drawer yang membiarkan fokus lolos ke kanvas di belakangnya melanggar itu.
 */

import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}

export function Drawer({ open, onClose, label, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      // Kunci fokus: Tab dari elemen terakhir kembali ke yang pertama.
      const items = [
        ...panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="pointer-events-auto absolute inset-0 z-30 bg-panel-inverse/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="pointer-events-auto absolute inset-y-0 left-0 z-40 flex w-[min(320px,86vw)] flex-col border-r border-panel-border bg-panel backdrop-blur"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-panel-border px-3 py-2">
          <h2 className="text-[13px] font-medium text-panel-fg">{label}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Tutup ${label}`}
            className="rounded px-2 py-1 text-panel-muted hover:bg-panel-soft-hover hover:text-panel-fg"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  )
}
