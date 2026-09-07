/**
 * Toolbar mengambang preset sudut pandang (§E2 AC5, AC6; §8.2).
 *
 * Presentasi murni: tidak menyentuh three.js, hanya memanggil callback
 * bertipe dari `@/viewer/types` (§5.5).
 */

import { Button } from '@/components/ui/button'
import { VIEW_PRESETS, VIEW_PRESET_LABELS, type ViewPreset } from '@/viewer/types'

interface Props {
  onPreset: (preset: ViewPreset) => void
  onReset: () => void
  disabled?: boolean | undefined
}

/** Label ringkas untuk layar sempit; nama penuh tetap di aria-label & title. */
const SHORT: Record<ViewPreset, string> = {
  anterior: 'Ant',
  posterior: 'Post',
  'lateral-dextra': 'Lat D',
  'lateral-sinistra': 'Lat S',
  superior: 'Sup',
  inferior: 'Inf',
}

export function ViewToolbar({ onPreset, onReset, disabled }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Sudut pandang"
      className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/70 p-1.5 backdrop-blur"
    >
      {VIEW_PRESETS.map((p) => (
        <Button
          key={p}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            onPreset(p)
          }}
          title={VIEW_PRESET_LABELS[p]}
          aria-label={VIEW_PRESET_LABELS[p]}
          // §E11 AC3: target sentuh ≥ 44×44 px.
          className="h-11 min-w-11 px-3 text-white/75 hover:bg-white/10 hover:text-white"
        >
          {SHORT[p]}
        </Button>
      ))}
      <div className="mx-1 h-6 w-px bg-white/10" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={onReset}
        title="Reset view"
        aria-label="Reset view"
        className="h-11 min-w-11 px-3 text-white/75 hover:bg-white/10 hover:text-white"
      >
        Reset
      </Button>
    </div>
  )
}
