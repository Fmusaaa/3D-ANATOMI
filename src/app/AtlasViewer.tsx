/**
 * Jembatan React <-> viewer.
 *
 * Ini SATU-SATUNYA tempat yang memiliki instance `AtlasRenderer`. Diletakkan
 * di `src/app/`, bukan `src/components/`, karena §5.5 melarang komponen
 * menyentuh viewer di luar `types.ts`/`events.ts`.
 *
 * React di sini hanya: mount canvas, teruskan aksi diskrit, dan menerima
 * statistik yang sudah di-throttle 10 Hz oleh renderer (§5.2). Tidak ada
 * state per-frame yang masuk React.
 */

import { useEffect, useRef, useState } from 'react'
import { loadStructures, type StructureIndex, type StructureMeta } from '@/content/structures'
import { DetailPanel } from '@/components/DetailPanel/DetailPanel'
import { HoverTooltip } from '@/components/DetailPanel/HoverTooltip'
import { DevOverlay } from '@/components/DevOverlay/DevOverlay'
import { SystemTree } from '@/components/SystemTree/SystemTree'
import { ViewToolbar } from '@/components/ViewToolbar/ViewToolbar'
import { AtlasRenderer } from '@/viewer/AtlasRenderer'
import { VISIBILITY_PRESETS } from '@/viewer/presets'
import type {
  HoverInfo,
  LoadProgress,
  SystemState,
  ViewPreset,
  ViewerStats,
} from '@/viewer/types'

export function AtlasViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<AtlasRenderer | null>(null)

  const [stats, setStats] = useState<ViewerStats | null>(null)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [systems, setSystems] = useState<SystemState[]>([])
  const [activePreset, setActivePreset] = useState<string | null>('semua')
  const [index, setIndex] = useState<StructureIndex | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [selection, setSelection] = useState<number[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new AtlasRenderer({ dataUrl: '/data' })
    rendererRef.current = renderer

    const off = [
      renderer.events.on('stats', setStats),
      renderer.events.on('progress', setProgress),
      renderer.events.on('ready', () => {
        setReady(true)
        setProgress(null)
      }),
      renderer.events.on('systems', setSystems),
      renderer.events.on('hover', setHover),
      renderer.events.on('selection', setSelection),
      renderer.events.on('error', (e) => {
        setError(e.message)
      }),
    ]

    renderer.mount(canvas)
    // Handle dev-only: dipakai untuk debugging manual dan nanti untuk e2e
    // Playwright (§11.2). Tidak ikut di build produksi.
    if (import.meta.env.DEV) {
      ;(globalThis as unknown as { __ATLAS__?: AtlasRenderer }).__ATLAS__ = renderer
    }
    void renderer.load()
    // Metadata nama/sistem/regio dimuat paralel dengan geometri; keduanya
    // tidak saling menunggu.
    void loadStructures('/data')
      .then(setIndex)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      for (const fn of off) fn()
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  const handlePreset = (p: ViewPreset): void => {
    rendererRef.current?.setPreset(p)
  }
  const handleReset = (): void => {
    rendererRef.current?.resetView()
  }
  const handleToggle = (systemId: string, visible: boolean): void => {
    rendererRef.current?.setSystemVisible(systemId, visible)
    setActivePreset(null) // toggle manual = tidak lagi persis sebuah preset
  }
  const handleOpacity = (systemId: string, opacity: number): void => {
    rendererRef.current?.setSystemOpacity(systemId, opacity)
    setActivePreset(null)
  }
  const handleVisibilityPreset = (presetId: string): void => {
    rendererRef.current?.applyPreset(presetId)
    setActivePreset(presetId)
  }

  const hovered = hover && index ? (index.byIdx.get(hover.idx) ?? null) : null
  const selected: StructureMeta[] = index
    ? selection.flatMap((i) => {
        const m = index.byIdx.get(i)
        return m ? [m] : []
      })
    : []

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d0f12]">
      {/*
        §E11 AC10: canvas 3D punya deskripsi teks alternatif. Jalur non-visual
        (tree struktur yang bisa dinavigasi keyboard) menyusul di Fase 2.
      */}
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-label="Model 3D anatomi manusia. Seret untuk memutar, gulir untuk memperbesar."
        role="img"
      />

      {showOverlay && (
        <DevOverlay
          stats={stats}
          onClose={() => {
            setShowOverlay(false)
          }}
        />
      )}

      {ready && (
        <SystemTree
          systems={systems}
          presets={VISIBILITY_PRESETS}
          activePreset={activePreset}
          onToggle={handleToggle}
          onOpacity={handleOpacity}
          onPreset={handleVisibilityPreset}
        />
      )}

      {ready && index && (
        <DetailPanel
          selected={selected}
          qualityThreshold={index.meshQualityExcludeBelow}
          onClose={() => {
            rendererRef.current?.clearSelection()
          }}
          onFocus={(idx) => {
            rendererRef.current?.select(idx)
          }}
        />
      )}

      {/* Tooltip disembunyikan saat panel detail terbuka supaya tidak menumpuk. */}
      {hover && selected.length === 0 && (
        <HoverTooltip structure={hovered} x={hover.clientX} y={hover.clientY} />
      )}

      {ready && <ViewToolbar onPreset={handlePreset} onReset={handleReset} />}

      {progress && !ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center">
          <div className="rounded-lg border border-white/10 bg-black/70 px-4 py-2 font-mono text-xs text-white/70 backdrop-blur">
            Memuat {progress.loaded}/{progress.total} batch
            {progress.lastSystem ? ` — ${progress.lastSystem}` : ''}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-red-500/30 bg-red-950/60 p-4 text-sm text-red-100 backdrop-blur">
            <p className="mb-1 font-semibold">Gagal memuat atlas</p>
            <p className="font-mono text-xs break-words opacity-90">{error}</p>
            <p className="mt-2 text-xs opacity-70">
              Kalau aset belum dibangun, jalankan <code>npm run data:build</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
