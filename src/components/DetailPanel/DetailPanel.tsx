/**
 * Panel detail struktur terpilih (PRD §E3 AC4–AC6, §8.2).
 *
 * ⚠️ Prinsip §8.1 nomor 5 dijalankan harfiah di sini: **jangan sembunyikan
 * ketidakpastian**. Nomenklatur Latin dan Indonesia baru dikurasi di Fase 5,
 * jadi panel ini menampilkan ketiadaannya secara eksplisit — bukan diam-diam
 * memakai nama Inggris FMA seolah-olah itu istilah Latin TA.
 *
 * Tab yang datanya kosong tetap ditampilkan dengan empty state jujur
 * (§E3 AC5), bukan disembunyikan.
 */

import { useState } from 'react'
import {
  LATERALITY_LABEL,
  REGION_LABEL,
  SYSTEM_LABEL,
  fmaUrl,
  type StructureMeta,
} from '@/content/structures'
import { displayName, type LanguageCode, type Nomenclature } from '@/content/nomenclature'
import { NameBlock } from '@/components/Nomenclature/NameBlock'
import { cn } from '@/lib/utils'

type Tab = 'ikhtisar' | 'relasi' | 'klinis'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ikhtisar', label: 'Ikhtisar' },
  { id: 'relasi', label: 'Relasi' },
  { id: 'klinis', label: 'Klinis' },
]

interface Props {
  selected: StructureMeta[]
  qualityThreshold: number
  nomenclature: Nomenclature | null
  language: LanguageCode
  onClose: () => void
  onFocus: (idx: number) => void
  /** `embedded` menghilangkan posisi absolut supaya muat di bottom sheet. */
  variant?: 'floating' | 'embedded' | undefined
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[11px] text-panel-subtle">{label}</span>
      <span className="text-right text-[12px] text-panel-fg">{children}</span>
    </div>
  )
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-panel-subtle italic">{children}</span>
}

export function DetailPanel({
  selected,
  qualityThreshold,
  nomenclature,
  language,
  onClose,
  onFocus,
  variant = 'floating',
}: Props) {
  const [tab, setTab] = useState<Tab>('ikhtisar')
  if (selected.length === 0) return null

  const s = selected[selected.length - 1]
  if (!s) return null

  const sys = SYSTEM_LABEL[s.system] ?? { la: s.system, id: '' }
  const lowQuality = s.meshQuality < qualityThreshold

  return (
    <aside
      className={cn(
        'flex flex-col overflow-hidden',
        variant === 'embedded'
          ? 'h-full w-full'
          : 'pointer-events-auto absolute top-3 right-3 bottom-3 z-10 w-[336px] rounded-xl border border-panel-border bg-panel backdrop-blur',
      )}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0 space-y-2.5">
          {/*
            D-027: ketiga bahasa SEDERAJAT — tidak ada yang jadi judul dan
            yang lain jadi subtitle. Yang mengikat ketiganya adalah FMA ID,
            yang tampil di tab Ikhtisar sebagai jangkar konsepnya.

            Urutan mengikuti pilihan di toggle supaya yang paling sering
            dipakai ada di atas, tapi bobot visualnya sama.
          */}
          {[language, ...(['la', 'id', 'en'] as const).filter((l) => l !== language)].map(
            (l) => (
              <NameBlock
                key={l}
                name={displayName(nomenclature, s.fma, s.name.en, l)}
                english={s.name.en}
              />
            ),
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel detail"
          className="shrink-0 rounded px-1.5 py-0.5 text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-fg"
        >
          ×
        </button>
      </div>

      {selected.length > 1 && (
        <div className="mt-3 px-4">
          <p className="mb-1 text-[10px] tracking-widest text-panel-subtle uppercase">
            Terpilih ({selected.length}/8)
          </p>
          <div className="flex flex-wrap gap-1">
            {selected.map((x) => (
              <button
                key={x.idx}
                type="button"
                onClick={() => {
                  onFocus(x.idx)
                }}
                className={cn(
                  'max-w-full truncate rounded px-1.5 py-0.5 text-[11px]',
                  x.idx === s.idx
                    ? 'bg-panel-warn-bg text-panel-warn'
                    : 'bg-panel-soft text-panel-muted hover:bg-panel-soft-hover',
                )}
              >
                {x.name.en}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-1 border-b border-panel-border px-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
            }}
            aria-selected={tab === t.id}
            role="tab"
            className={cn(
              '-mb-px border-b-2 px-2.5 py-2 text-[12px]',
              tab === t.id
                ? 'border-panel-fg text-panel-fg'
                : 'border-transparent text-panel-subtle hover:text-panel-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'ikhtisar' && (
          <div className="divide-y divide-panel-border">
            <Field label="Sistem">
              {sys.la}
              <span className="block text-[11px] text-panel-subtle">{sys.id}</span>
            </Field>
            <Field label="Regio">
              {REGION_LABEL[s.region] ?? s.region}
              {s.regionVia === 'geometris' && (
                <span
                  className="mt-0.5 block text-[10px] text-panel-warn"
                  title="Regio ini ditebak dari posisi spasial, bukan dari ontologi BodyParts3D"
                >
                  perkiraan spasial
                </span>
              )}
            </Field>
            <Field label="Lateralitas">
              {s.laterality ? (
                (LATERALITY_LABEL[s.laterality] ?? s.laterality)
              ) : (
                <Missing>tidak ditentukan</Missing>
              )}
            </Field>
            <Field label="FMA ID">
              <a
                href={fmaUrl(s.fma)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-panel-link underline underline-offset-2 hover:opacity-80"
              >
                {s.fma}
              </a>
            </Field>
            <Field label="Mesh BP3D">
              <span className="font-mono text-[11px] text-panel-muted">{s.fileId}</span>
            </Field>
            <Field label="Kualitas mesh">
              <span className={lowQuality ? 'text-panel-warn' : 'text-panel-fg'}>
                {s.meshQuality.toFixed(2)}
              </span>
            </Field>
          </div>
        )}

        {tab === 'ikhtisar' && lowQuality && (
          /* §E3 AC4: indikator kualitas mesh rendah. Batas dataset, bukan bug. */
          <p className="mt-3 rounded-md border border-panel-warn-border bg-panel-warn-bg p-2.5 text-[11px] leading-relaxed text-panel-warn">
            Mesh struktur ini berada di 5% terbawah dataset BodyParts3D (ambang{' '}
            {qualityThreshold.toFixed(2)}). Bentuknya kasar atau terpecah, jadi
            jangan dijadikan acuan bentuk. Struktur ini juga dikecualikan dari soal
            identifikasi-klik.
          </p>
        )}

        {tab === 'relasi' && (
          <div className="py-6 text-center">
            <p className="text-[13px] text-panel-muted">Belum ada data relasi</p>
            <p className="mx-auto mt-1.5 max-w-[240px] text-[11px] leading-relaxed text-panel-subtle">
              Vaskularisasi, inervasi, dan origo/insersio dikurasi di Fase 6 —
              target ≥150 struktur, semuanya bersumber.
            </p>
          </div>
        )}

        {tab === 'klinis' && (
          <div className="py-6 text-center">
            <p className="text-[13px] text-panel-muted">Belum ada catatan klinis</p>
            <p className="mx-auto mt-1.5 max-w-[240px] text-[11px] leading-relaxed text-panel-subtle">
              Korelasi klinis dikurasi di Fase 6. Catatan tanpa sumber ditolak
              validator dan tidak akan pernah tampil.
            </p>
          </div>
        )}
      </div>

      <p className="shrink-0 border-t border-panel-border px-4 py-2 text-[10px] leading-relaxed text-panel-subtle">
        Materi edukasi, bukan acuan praktik klinis. Data: BodyParts3D © DBCLS.
      </p>
    </aside>
  )
}
