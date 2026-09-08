/**
 * Halaman "Kontribusi terjemahan" (PRD §E7 AC5).
 *
 * v1 sengaja tanpa backend (§4.2): koreksi dikirim lewat GitHub issue, dan
 * panel ini menyiapkan isinya supaya yang mengoreksi tidak perlu mengetik
 * ulang FMA ID atau istilah yang salah.
 *
 * Menampilkan antrian `needs-review` lebih dulu karena entri itulah yang
 * urutan katanya masih tebakan (lihat scripts/06_nomenclature.py).
 */

import { useMemo, useState } from 'react'
import {
  LANGUAGE_LABEL,
  statusExplanation,
  type LanguageCode,
  type Nomenclature,
  type NomenclatureEntry,
} from '@/content/nomenclature'
import { StatusBadge } from '@/components/Nomenclature/NameBlock'
import type { StructureIndex } from '@/content/structures'
import { cn } from '@/lib/utils'

const REPO_ISSUE_URL = 'https://github.com/FMUSA93/corpus/issues/new'

interface Props {
  nomenclature: Nomenclature | null
  index: StructureIndex | null
  onClose: () => void
}

interface Row {
  fma: string
  english: string
  entry: NomenclatureEntry
  lang: LanguageCode
}

function issueUrl(row: Row): string {
  const title = `Koreksi nomenklatur ${row.lang.toUpperCase()}: ${row.fma}`
  const body = [
    `**FMA ID:** ${row.fma}`,
    `**Nama Inggris (FMA):** ${row.english}`,
    `**Bahasa:** ${LANGUAGE_LABEL[row.lang]}`,
    `**Istilah saat ini:** ${row.entry.term}`,
    `**Status saat ini:** ${row.entry.status}`,
    '',
    '**Istilah yang benar:**',
    '',
    '',
    '**Sumber** (wajib — mis. Terminologia Anatomica, Sobotta, Moore):',
    '',
  ].join('\n')
  return `${REPO_ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

export function ContributionPanel({ nomenclature, index, onClose }: Props) {
  const [lang, setLang] = useState<'la' | 'id'>('la')
  const [query, setQuery] = useState('')

  const rows = useMemo<Row[]>(() => {
    if (!nomenclature || !index) return []
    const english = new Map<string, string>()
    for (const s of index.all) english.set(s.fma, s.name.en)
    for (const g of index.groups) if (!english.has(g.fma)) english.set(g.fma, g.name.en)

    const out: Row[] = []
    for (const [fma, entry] of nomenclature[lang]) {
      if (entry.status === 'reviewed') continue
      out.push({ fma, english: english.get(fma) ?? fma, entry, lang })
    }
    // `needs-review` lebih dulu: urutan katanya paling meragukan.
    out.sort((a, b) => {
      if (a.entry.status !== b.entry.status) return a.entry.status === 'needs-review' ? -1 : 1
      return a.english.localeCompare(b.english)
    })
    return out
  }, [nomenclature, index, lang])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows.slice(0, 200)
    return rows
      .filter(
        (r) =>
          r.english.toLowerCase().includes(q) ||
          r.entry.term.toLowerCase().includes(q) ||
          r.fma.toLowerCase().includes(q),
      )
      .slice(0, 200)
  }, [rows, query])

  const counts = useMemo(() => {
    const total = nomenclature?.[lang].size ?? 0
    let reviewed = 0
    let needs = 0
    for (const e of nomenclature?.[lang].values() ?? []) {
      if (e.status === 'reviewed') reviewed++
      else if (e.status === 'needs-review') needs++
    }
    return { total, reviewed, needs, machine: total - reviewed - needs }
  }, [nomenclature, lang])

  return (
    <div className="pointer-events-auto absolute inset-4 z-40 flex flex-col overflow-hidden rounded-xl border border-panel-border bg-panel backdrop-blur">
      <div className="flex items-start justify-between gap-3 border-b border-panel-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-panel-fg">Kontribusi terjemahan</h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-panel-subtle">
            Semua istilah di bawah diturunkan otomatis dari nama Inggris FMA dan{' '}
            <strong className="text-panel-muted">belum diperiksa manusia</strong>. Tidak
            satu pun dipakai sebagai jawaban benar di quiz. Koreksi dikirim lewat
            GitHub issue — v1 sengaja tanpa backend.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup halaman kontribusi"
          className="shrink-0 rounded px-2 py-1 text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-fg"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-panel-border px-5 py-3">
        <div className="flex gap-1">
          {(['la', 'id'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLang(l)
              }}
              className={cn(
                'rounded px-2.5 py-1 text-[12px]',
                lang === l ? 'bg-panel-inverse text-panel-inverse-fg' : 'bg-panel-soft text-panel-muted hover:bg-panel-soft-hover',
              )}
            >
              {LANGUAGE_LABEL[l]}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          placeholder="Saring…"
          aria-label="Saring daftar istilah"
          className="min-w-40 flex-1 rounded border border-panel-border bg-panel-soft px-2 py-1 text-[12px] text-panel-fg outline-none placeholder:text-panel-subtle"
        />
        <p className="text-[11px] text-panel-subtle tabular-nums">
          {counts.total.toLocaleString('id')} entri · {counts.needs.toLocaleString('id')} perlu
          review · <span className="text-panel-ok">{counts.reviewed}</span> terverifikasi
        </p>
      </div>

      {/* §E7 AC6: cakupan v1.0 menuntut status reviewed. Katakan apa adanya. */}
      {counts.reviewed === 0 && (
        <p className="border-b border-panel-warn-border bg-panel-warn-bg px-5 py-2.5 text-[11.5px] leading-relaxed text-panel-warn">
          Belum ada satu pun istilah yang terverifikasi. Target rilis v1.0 (§E7 AC6)
          adalah 100% struktur high-yield punya Latin TA dan ≥300 punya Indonesia
          berstatus <code>reviewed</code> — dan itu hanya bisa dicapai lewat review
          manusia, bukan oleh generator.
        </p>
      )}

      <ul className="min-h-0 flex-1 divide-y divide-panel-border overflow-y-auto">
        {filtered.map((r) => (
          <li key={`${r.lang}:${r.fma}`} className="flex items-start gap-3 px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1.5">
                <span className="truncate text-[13px] text-panel-fg italic">
                  {r.entry.term}
                </span>
                <StatusBadge status={r.entry.status} />
              </p>
              <p className="truncate text-[11px] text-panel-subtle">
                {r.english} · {r.fma}
              </p>
            </div>
            <a
              href={issueUrl(r)}
              target="_blank"
              rel="noreferrer noopener"
              title={statusExplanation(r.entry.status)}
              className="shrink-0 rounded border border-panel-border px-2 py-1 text-[11px] text-panel-link hover:bg-panel-soft-hover hover:opacity-80"
            >
              Koreksi
            </a>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-5 py-8 text-center text-[12px] text-panel-subtle">
            Tidak ada entri yang cocok.
          </li>
        )}
      </ul>
    </div>
  )
}
