/**
 * Panel kontrol visibilitas per sistem + preset (PRD §E4, §8.2).
 *
 * Presentasi murni — tidak menyentuh three.js. Semua aksi lewat callback
 * bertipe; status datang lewat `SystemState[]` (§5.5).
 */

import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { SystemState } from '@/viewer/types'

interface Props {
  systems: SystemState[]
  presets: readonly { id: string; label: string }[]
  activePreset: string | null
  onToggle: (systemId: string, visible: boolean) => void
  onOpacity: (systemId: string, opacity: number) => void
  onPreset: (presetId: string) => void
  /** `embedded` menghilangkan posisi absolut supaya muat di drawer (§E11 AC1). */
  variant?: 'floating' | 'embedded' | undefined
}

/**
 * Nama Latin TA + Indonesia. §E7 menjadikan Latin bahasa utama dengan
 * Indonesia sebagai subtitle — konvensi itu dimulai dari sini.
 *
 * ⚠️ §E11 AC8: warna sistem TIDAK boleh jadi satu-satunya pembeda, jadi tiap
 * baris selalu punya label teks, bukan cuma titik warna.
 */
const SYSTEM_LABELS: Record<string, { la: string; id: string }> = {
  systema_skeletale: { la: 'Systema skeletale', id: 'Rangka' },
  systema_articulare: { la: 'Systema articulare', id: 'Sendi & kartilago' },
  systema_musculare: { la: 'Systema musculare', id: 'Otot' },
  systema_nervosum: { la: 'Systema nervosum', id: 'Saraf' },
  systema_cardiovasculare: { la: 'Systema cardiovasculare', id: 'Jantung & pembuluh' },
  systema_lymphoideum: { la: 'Systema lymphoideum', id: 'Limfoid' },
  systema_respiratorium: { la: 'Systema respiratorium', id: 'Pernapasan' },
  systema_digestorium: { la: 'Systema digestorium', id: 'Pencernaan' },
  systema_urinarium: { la: 'Systema urinarium', id: 'Kemih' },
  systema_genitale: { la: 'Systema genitale', id: 'Genital' },
  glandulae_endocrinae: { la: 'Glandulae endocrinae', id: 'Endokrin' },
  organa_sensuum: { la: 'Organa sensuum', id: 'Organ indra' },
  integumentum_commune: { la: 'Integumentum commune', id: 'Kulit' },
}

const SYSTEM_SWATCH: Record<string, string> = {
  systema_skeletale: '#e8dcc8',
  systema_articulare: '#bcd4e6',
  systema_musculare: '#a8433f',
  systema_nervosum: '#e8c547',
  systema_cardiovasculare: '#c0392b',
  systema_lymphoideum: '#5fa85f',
  systema_respiratorium: '#7fb3d5',
  systema_digestorium: '#d8a25e',
  systema_urinarium: '#9b7fc4',
  systema_genitale: '#c98fb0',
  glandulae_endocrinae: '#6ec6b8',
  organa_sensuum: '#e0e0e0',
  integumentum_commune: '#d9b39c',
}

export function SystemTree({
  systems,
  presets,
  activePreset,
  onToggle,
  onOpacity,
  onPreset,
  variant = 'floating',
}: Props) {
  if (systems.length === 0) return null

  const embedded = variant === 'embedded'

  return (
    <aside
      className={cn(
        'flex flex-col gap-3 overflow-hidden',
        embedded
          ? 'h-full w-full'
          : 'pointer-events-auto absolute top-3 bottom-3 left-3 z-10 w-[272px] rounded-xl border border-white/10 bg-black/70 backdrop-blur',
      )}
    >
      <div className="shrink-0 px-3 pt-3">
        <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-white/45 uppercase">
          Preset
        </h2>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onPreset(p.id)
              }}
              aria-pressed={activePreset === p.id}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs transition-colors',
                activePreset === p.id
                  ? 'bg-white/90 font-medium text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/12 hover:text-white',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-white/45 uppercase">
          Sistem
        </h2>
        <ul className="space-y-2.5">
          {systems.map((s) => {
            const label = SYSTEM_LABELS[s.id] ?? { la: s.id, id: '' }
            const inputId = `sys-${s.id}`
            return (
              <li key={s.id}>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={inputId}
                    checked={s.visible}
                    onCheckedChange={(c) => {
                      onToggle(s.id, c === true)
                    }}
                    className="mt-0.5 border-white/25 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
                  />
                  <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer select-none">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-white/20"
                        style={{ background: SYSTEM_SWATCH[s.id] ?? '#888' }}
                      />
                      <span
                        className={cn(
                          'truncate text-[13px] leading-tight',
                          s.visible ? 'text-white/90' : 'text-white/35',
                        )}
                      >
                        {label.la}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-baseline gap-1.5 pl-4">
                      <span
                        className={cn(
                          'truncate text-[11px]',
                          s.visible ? 'text-white/45' : 'text-white/25',
                        )}
                      >
                        {label.id}
                      </span>
                      <span className="text-[10px] text-white/25 tabular-nums">
                        {s.count.toLocaleString('id')}
                      </span>
                      {s.ghosted && (
                        <span className="rounded bg-white/10 px-1 text-[9px] tracking-wide text-white/50 uppercase">
                          ghost
                        </span>
                      )}
                    </span>
                  </label>
                </div>

                {/* §E4 AC5: slider opacity global per sistem. */}
                <div className="mt-1.5 pl-6">
                  <Slider
                    value={[Math.round(s.opacity * 100)]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!s.visible}
                    onValueChange={(v) => {
                      onOpacity(s.id, (v[0] ?? 100) / 100)
                    }}
                    aria-label={`Opacity ${label.la}`}
                    className="[&_[data-slot=slider-range]]:bg-white/70 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-white/60 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-white/12"
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
