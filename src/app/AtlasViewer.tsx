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

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SYSTEM_LABEL,
  loadStructures,
  type StructureIndex,
  type StructureMeta,
} from '@/content/structures'
import { DetailPanel } from '@/components/DetailPanel/DetailPanel'
import { HoverTooltip } from '@/components/DetailPanel/HoverTooltip'
import {
  DEFAULT_LANGUAGE,
  loadNomenclature,
  type LanguageCode,
  type Nomenclature,
} from '@/content/nomenclature'
import { ContributionPanel } from '@/components/Nomenclature/ContributionPanel'
import { LanguageToggle } from '@/components/Nomenclature/LanguageToggle'
import { ExplodeControl } from '@/components/ExplodeControl/ExplodeControl'
import { DevOverlay } from '@/components/DevOverlay/DevOverlay'
import { SearchBar } from '@/components/SearchBar/SearchBar'
import { SystemTree } from '@/components/SystemTree/SystemTree'
import { ViewToolbar } from '@/components/ViewToolbar/ViewToolbar'
import { decodeState, encodeState } from '@/lib/deeplink'
import { AtlasRenderer, EXPLODE_WARN_THRESHOLD } from '@/viewer/AtlasRenderer'
import { SYSTEM_ORDER } from '@/viewer/BatchManager'
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
  /** Toast §E5 AC7: beri tahu kalau sebuah sistem otomatis ditampilkan lagi. */
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [nomenclature, setNomenclature] = useState<Nomenclature | null>(null)
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [showContrib, setShowContrib] = useState(false)
  const [explode, setExplode] = useState(0)
  /** Hash awal dibaca SEKALI, sebelum apa pun sempat menimpanya. */
  const initialHash = useRef(typeof window === 'undefined' ? '' : window.location.hash)

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
        // §E14 AC3: pulihkan state SETELAH geometri siap — sebelum itu
        // structureCount masih 0 dan seleksi akan ditolak diam-diam.
        const restored = decodeState(initialHash.current, SYSTEM_ORDER)
        if (restored) {
          renderer.restore(restored)
          // Sorot preset HANYA kalau himpunan sistem yang dipulihkan memang
          // cocok dengan definisinya. Tanpa cek ini, tautan bisa menyorot
          // "Semua" sementara yang tampil cuma organ dalam — tombolnya
          // berbohong soal apa yang sedang dilihat.
          const preset = VISIBILITY_PRESETS.find((x) => x.id === restored.presetId)
          const shown = new Set(restored.visibleSystems)
          const expected = new Set([...preset?.show ?? [], ...preset?.ghost ?? []])
          const cocok =
            preset !== undefined &&
            shown.size === expected.size &&
            [...shown].every((id) => expected.has(id))
          setActivePreset(cocok ? restored.presetId : null)
        }
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
    // Nomenklatur dimuat terpisah dan boleh gagal tanpa menjatuhkan app:
    // filenya memang dikurasi bertahap (§E7).
    void loadNomenclature('/data')
      .then(setNomenclature)
      .catch(() => {
        setNomenclature(null)
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
  /**
   * Scrub slider tidak beranimasi (animate=false): animasi 800 ms akan melawan
   * gerakan jari user dan terasa seperti lag.
   */
  const handleExplode = (v: number): void => {
    setExplode(v)
    rendererRef.current?.setExplode(v, false)
  }

  const handleVisibilityPreset = (presetId: string): void => {
    rendererRef.current?.applyPreset(presetId)
    setActivePreset(presetId)
  }

  /**
   * Tulis state ke URL hash.
   *
   * Dipanggil dari aksi diskrit (pilih struktur, toggle sistem, salin tautan),
   * BUKAN dari gerakan kamera per-frame — menulis `location.hash` 60x/detik
   * akan membanjiri riwayat browser dan bikin tombol Back tidak terpakai.
   * Posisi kamera ikut terbaca saat momen-momen itu terjadi.
   */
  const writeHash = useCallback((): string => {
    const r = rendererRef.current
    const cam = r?.cameraState()
    if (!r || !cam) return window.location.href
    const encoded = encodeState(
      {
        cameraPosition: cam.position,
        cameraTarget: cam.target,
        visibleSystems: systems.filter((x) => x.visible).map((x) => x.id),
        opacities: Object.fromEntries(
          systems.filter((x) => x.opacity !== 1).map((x) => [x.id, x.opacity]),
        ),
        selection: r.currentSelection(),
        presetId: activePreset,
      },
      SYSTEM_ORDER,
    )
    // replaceState, bukan pushState: tiap toggle tidak layak jadi entri riwayat.
    window.history.replaceState(null, '', `#${encoded}`)
    return `${window.location.origin}${window.location.pathname}#${encoded}`
  }, [systems, activePreset])

  useEffect(() => {
    if (ready) writeHash()
  }, [ready, writeHash, selection])

  const handleCopyLink = (): void => {
    const url = writeHash()
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
        }, 1800)
      })
      .catch(() => {
        // Clipboard bisa ditolak (izin, konteks tidak aman, browser lama).
        // URL-nya sendiri SUDAH ditulis ke address bar oleh writeHash(), jadi
        // arahkan ke sana alih-alih cuma bilang "gagal".
        setToast('Clipboard diblokir browser — salin URL dari address bar')
        setTimeout(() => {
          setToast(null)
        }, 4000)
      })
  }

  const coverage = nomenclature
    ? {
        la: {
          total: nomenclature.la.size,
          reviewed: [...nomenclature.la.values()].filter((e) => e.status === 'reviewed').length,
        },
        id: {
          total: nomenclature.id.size,
          reviewed: [...nomenclature.id.values()].filter((e) => e.status === 'reviewed').length,
        },
      }
    : undefined

  const hiddenSystems = new Set(systems.filter((x) => !x.visible).map((x) => x.id))
  const isHidden = (idx: number): boolean => {
    const m = index?.byIdx.get(idx)
    return m ? hiddenSystems.has(m.system) : false
  }

  const handleSearchPick = (idx: number): void => {
    const revealed = rendererRef.current?.revealAndFlyTo(idx) ?? null
    if (revealed) {
      const label = SYSTEM_LABEL[revealed]
      setToast(`${label?.la ?? revealed} ditampilkan`)
      setTimeout(() => {
        setToast(null)
      }, 3200)
    }
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

      {ready && index && (
        <SearchBar
          index={index}
          nomenclature={nomenclature}
          language={language}
          isHidden={isHidden}
          onPick={handleSearchPick}
        />
      )}

      {toast && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-white/15 bg-black/85 px-3.5 py-2 text-[12px] text-white/85 backdrop-blur"
        >
          {toast}
        </div>
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
          nomenclature={nomenclature}
          language={language}
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
        <HoverTooltip
          structure={hovered}
          nomenclature={nomenclature}
          language={language}
          x={hover.clientX}
          y={hover.clientY}
        />
      )}

      {ready && (
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2">
          <LanguageToggle value={language} onChange={setLanguage} coverage={coverage} />
          <button
            type="button"
            onClick={() => {
              setShowContrib(true)
            }}
            title="Daftar istilah yang perlu direview (§E7 AC5)"
            className="pointer-events-auto rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-[12px] text-white/60 backdrop-blur hover:text-white/95"
          >
            Kontribusi
          </button>
        </div>
      )}

      {ready && (
        <button
          type="button"
          onClick={handleCopyLink}
          title="Salin tautan tampilan ini"
          className="pointer-events-auto absolute top-16 right-3 z-20 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-[12px] text-white/60 backdrop-blur hover:text-white/95"
        >
          {copied ? 'Tersalin ✓' : 'Salin tautan'}
        </button>
      )}

      {ready && (
        <ExplodeControl
          value={explode}
          visibleCount={systems.reduce((n, x) => n + (x.visible ? x.count : 0), 0)}
          warnThreshold={EXPLODE_WARN_THRESHOLD}
          onChange={handleExplode}
        />
      )}

      {ready && <ViewToolbar onPreset={handlePreset} onReset={handleReset} />}

      {showContrib && (
        <ContributionPanel
          nomenclature={nomenclature}
          index={index}
          onClose={() => {
            setShowContrib(false)
          }}
        />
      )}

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
