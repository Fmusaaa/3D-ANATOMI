/**
 * Isi tab Klinis (PRD §E9).
 *
 * Markdown dirender jadi elemen React, BUKAN lewat `dangerouslySetInnerHTML`:
 * isinya berasal dari berkas konten, dan subset yang dipakai (paragraf, daftar,
 * tebal, miring) cukup kecil untuk diurai sendiri tanpa membuka celah HTML.
 *
 * Setiap catatan menampilkan sumbernya, dan kalau diringkas oleh pihak lain
 * (mis. Claude dari slide kuliah), itu juga disebut terang — mahasiswa harus
 * tahu kapan perlu membuka slide aslinya.
 */

import { Fragment, type ReactNode } from 'react'
import type { ClinicalNote } from '@/content/clinical'

function inline(text: string): ReactNode[] {
  // **tebal** dulu, lalu *miring* di sisa teks.
  const out: ReactNode[] = []
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push(
        <strong key={`b${String(i)}`} className="font-semibold text-panel-fg">
          {part.slice(2, -2)}
        </strong>,
      )
      return
    }
    part.split(/(\*[^*]+\*)/g).forEach((sub, j) => {
      if (sub.startsWith('*') && sub.endsWith('*') && sub.length > 2) {
        out.push(<em key={`i${String(i)}-${String(j)}`}>{sub.slice(1, -1)}</em>)
      } else if (sub) {
        out.push(<Fragment key={`t${String(i)}-${String(j)}`}>{sub}</Fragment>)
      }
    })
  })
  return out
}

function Body({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/)
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '')
        const bullet = lines.every((l) => /^\s*-\s+/.test(l))
        const numbered = lines.every((l) => /^\s*\d+\.\s+/.test(l))
        if (bullet || numbered) {
          const items = lines.map((l) => l.replace(/^\s*(-|\d+\.)\s+/, ''))
          const ListTag = numbered ? 'ol' : 'ul'
          return (
            <ListTag
              key={bi}
              className={`space-y-1 pl-4 ${numbered ? 'list-decimal' : 'list-disc'}`}
            >
              {items.map((it, ii) => (
                <li key={ii}>{inline(it)}</li>
              ))}
            </ListTag>
          )
        }
        // Blok campuran (paragraf diikuti daftar tanpa baris kosong) dipecah per baris.
        return (
          <div key={bi} className="space-y-1">
            {lines.map((l, li) =>
              /^\s*(-|\d+\.)\s+/.test(l) ? (
                <p key={li} className="pl-3">
                  {'• '}
                  {inline(l.replace(/^\s*(-|\d+\.)\s+/, ''))}
                </p>
              ) : (
                <p key={li}>{inline(l)}</p>
              ),
            )}
          </div>
        )
      })}
    </>
  )
}

interface Props {
  notes: readonly ClinicalNote[]
}

export function ClinicalNotes({ notes }: Props) {
  if (notes.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-[13px] text-panel-muted">Belum ada catatan klinis untuk struktur ini</p>
        <p className="mx-auto mt-1.5 max-w-[240px] text-[11px] leading-relaxed text-panel-subtle">
          Catatan tanpa sumber ditolak validator dan tidak akan pernah tampil.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {notes.map((n) => (
        <article key={n.id} className="space-y-2">
          <h3 className="text-[13.5px] font-semibold text-panel-fg">{n.title}</h3>
          <div className="space-y-2 text-[12.5px] leading-relaxed text-panel-muted">
            <Body text={n.body} />
          </div>
          <p className="border-l-2 border-panel-border pl-2 text-[10.5px] leading-relaxed text-panel-subtle">
            Sumber:{' '}
            {n.sourceUrl ? (
              <a
                href={n.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-panel-link underline underline-offset-2"
              >
                {n.source}
              </a>
            ) : (
              n.source
            )}
            {n.compiledBy && (
              <span className="mt-0.5 block text-panel-warn">Diringkas oleh {n.compiledBy}.</span>
            )}
          </p>
        </article>
      ))}
    </div>
  )
}
