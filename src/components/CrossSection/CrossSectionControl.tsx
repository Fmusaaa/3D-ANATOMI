/**
 * Kontrol potongan anatomis (PRD §E13).
 *
 * Tiga bidang baku anatomi, bukan sumbu XYZ. Mahasiswa membaca potongan dalam
 * istilah sagital/koronal/transversal — dan CT/MRI juga memakainya, jadi
 * menyebutnya "sumbu X" akan memaksa penerjemahan di kepala tiap kali.
 *
 * Posisi ditampilkan dalam **milimeter dari garis tengah tubuh**, bukan persen.
 * Persen tidak berarti apa-apa secara anatomi; "32 mm dari mediana" berarti.
 *
 * ⚠️ Label sisi menyebut apa yang DIPERTAHANKAN, bukan yang dibuang. Sisi kanan
 * pasien ada di X negatif — konvensi itu hidup di `keptSide()` dan diuji, bukan
 * ditebak di komponen ini.
 */

import { Slider } from '@/components/ui/slider'
import type { LanguageCode } from '@/content/nomenclature'
import {
  CLIP_AXIS_LABEL,
  CLIP_AXIS_SHORT,
  CLIP_SIDE_LABEL,
  keptSide,
  type ClipAxis,
  type ClipSpec,
} from '@/viewer/types'
import { cn } from '@/lib/utils'

const AXES: ClipAxis[] = ['sagittal', 'coronal', 'transverse']

interface Props {
  value: ClipSpec | null
  /** mm dari titik tengah tubuh; null kalau tidak memotong. */
  offsetMm: number | null
  language: LanguageCode
  onChange: (spec: ClipSpec | null) => void
}

export function CrossSectionControl({ value, offsetMm, language, onChange }: Props) {
  const active = value !== null
  const side = value ? keptSide(value) : null

  return (
    <div className="pointer-events-auto w-full rounded-xl border border-panel-border bg-panel px-3 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 shrink-0 text-[11px] text-panel-subtle">Potongan</span>

        <button
          type="button"
          onClick={() => {
            onChange(null)
          }}
          className={cn(
            'shrink-0 rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
            !active
              ? 'bg-panel-inverse font-medium text-panel-inverse-fg'
              : 'bg-panel-soft text-panel-muted hover:bg-panel-soft-hover hover:text-panel-fg',
          )}
        >
          Mati
        </button>

        {AXES.map((axis) => {
          const label = CLIP_AXIS_LABEL[axis]
          const short = CLIP_AXIS_SHORT[axis]
          const on = value?.axis === axis
          return (
            <button
              key={axis}
              type="button"
              // Ganti bidang mempertahankan posisi & arah: menggeser slider ke
              // tengah lalu berpindah bidang adalah alur yang wajar, dan
              // me-reset diam-diam bikin kerja itu hilang.
              onClick={() => {
                onChange({
                  axis,
                  position: value?.position ?? 0,
                  flipped: value?.flipped ?? false,
                })
              }}
              // Bahasa yang tidak muat di tombol tetap terbaca di sini (D-027).
              title={`${label.la} · ${label.id} · ${label.en}`}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
                on
                  ? 'bg-panel-inverse font-medium text-panel-inverse-fg'
                  : 'bg-panel-soft text-panel-muted hover:bg-panel-soft-hover hover:text-panel-fg',
              )}
            >
              {short[language]}
            </button>
          )
        })}
      </div>

      {value && (
        <>
          <div className="mt-2 flex items-center gap-3">
            <Slider
              value={[Math.round(value.position * 100)]}
              min={-100}
              max={100}
              step={1}
              aria-label="Posisi bidang potong"
              onValueChange={(v) => {
                onChange({ ...value, position: (v[0] ?? 0) / 100 })
              }}
              className="flex-1 [&_[data-slot=slider-range]]:bg-panel-fg/70 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-panel-soft-hover"
            />
            <span className="w-16 shrink-0 text-right text-[11px] text-panel-muted tabular-nums">
              {offsetMm === null
                ? '—'
                : `${offsetMm > 0 ? '+' : ''}${offsetMm.toFixed(0)} mm`}
            </span>
            <button
              type="button"
              onClick={() => {
                onChange({ ...value, flipped: !value.flipped })
              }}
              title="Tukar sisi yang dipertahankan"
              className="shrink-0 rounded-md bg-panel-soft px-2.5 py-1.5 text-[12px] text-panel-muted hover:bg-panel-soft-hover hover:text-panel-fg"
            >
              Balik
            </button>
          </div>

          {side && (
            <p className="mt-1.5 text-[11px] text-panel-subtle">
              Yang ditampilkan:{' '}
              <span className="text-panel-muted">
                {CLIP_SIDE_LABEL[side].la} · {CLIP_SIDE_LABEL[side].id}
              </span>
            </p>
          )}

          {/*
            Batas dataset, bukan bug yang bisa di-fix. Mesh BodyParts3D adalah
            cangkang permukaan hasil segmentasi, bukan volume pejal — bidang
            potong menampilkan dinding dalam cangkang, dan tidak ada tutup
            (cap) di permukaan potongnya. Menjanjikan "irisan seperti CT" di
            sini adalah janji yang tidak bisa ditepati dataset ini.
          */}
          <p className="mt-1 text-[10.5px] leading-relaxed text-panel-subtle">
            Mesh BodyParts3D adalah cangkang permukaan, bukan volume pejal — yang
            terlihat di bidang potong adalah dinding dalamnya, bukan irisan
            jaringan seperti CT.
          </p>
        </>
      )}
    </div>
  )
}
