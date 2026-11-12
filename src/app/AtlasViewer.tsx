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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { indexClinical, loadClinical, type ClinicalNote } from '@/content/clinical'
import { ContributionPanel } from '@/components/Nomenclature/ContributionPanel'
import { LanguageToggle } from '@/components/Nomenclature/LanguageToggle'
import { BottomSheet, type SheetStop } from '@/components/Mobile/BottomSheet'
import { Drawer } from '@/components/Mobile/Drawer'
import { detectCapability, useIsMobile, type DeviceCapability } from '@/lib/device'
import { AboutPanel, ATTRIBUTION_SHORT } from '@/components/About/AboutPanel'
import { OfflinePanel } from '@/components/Offline/OfflinePanel'
import { BookmarkPanel } from '@/components/Bookmarks/BookmarkPanel'
import { useOffline } from '@/lib/offline'
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle'
import { CANVAS_BG, useTheme } from '@/lib/theme'
import { ExplodeControl } from '@/components/ExplodeControl/ExplodeControl'
import { CrossSectionControl } from '@/components/CrossSection/CrossSectionControl'
import { DevOverlay } from '@/components/DevOverlay/DevOverlay'
import { SearchBar } from '@/components/SearchBar/SearchBar'
import { SystemTree } from '@/components/SystemTree/SystemTree'
import { ViewToolbar } from '@/components/ViewToolbar/ViewToolbar'
import { decodeState, encodeState } from '@/lib/deeplink'
import { AtlasRenderer, EXPLODE_WARN_THRESHOLD } from '@/viewer/AtlasRenderer'
import { SYSTEM_ORDER } from '@/viewer/BatchManager'
import { VISIBILITY_PRESETS } from '@/viewer/presets'
import type {
  ClipSpec,
  HoverInfo,
  LoadProgress,
  SystemState,
  ViewPreset,
  ViewerStats,
} from '@/viewer/types'

/**
 * Nama FMA yang menandai struktur vena. `sinus` hanya sinus coronarius: sinus
 * lain di dataset (sinus paranasal) bukan pembuluh dan ada di sistem lain.
 */
const VENOUS_NAME = /\b(vein|veins|vena|venae|venous)\b|coronary sinus/i

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
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([])
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [showContrib, setShowContrib] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showOffline, setShowOffline] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const offline = useOffline()
  const [modelStats, setModelStats] = useState<{ structures: number; triangles: number } | null>(null)
  const [explode, setExplode] = useState(0)
  const [clip, setClip] = useState<ClipSpec | null>(null)
  /** mm dari titik tengah tubuh; dihitung viewer karena ia yang tahu bounding box. */
  const [clipOffsetMm, setClipOffsetMm] = useState<number | null>(null)
  const { choice: themeChoice, resolved: theme, setChoice: setTheme } = useTheme()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sheetStop, setSheetStop] = useState<SheetStop>('half')
  const [capability, setCapability] = useState<DeviceCapability | null>(null)
  const [capabilityDismissed, setCapabilityDismissed] = useState(false)
  /** Hash awal dibaca SEKALI, sebelum apa pun sempat menimpanya. */
  const initialHash = useRef(typeof window === 'undefined' ? '' : window.location.hash)

  /**
   * Pulihkan tampilan dari sebuah deep link (§E14 AC3, dipakai ulang oleh §E15).
   *
   * Dipakai dua kali: saat hash awal dibuka, dan saat sebuah bookmark diklik.
   * Bookmark memang menyimpan deep link, jadi membuka bookmark harus menempuh
   * jalur pemulihan yang SAMA — kalau tidak, akan ada dua definisi "membuka
   * tampilan tersimpan" yang lambat laun berbeda.
   */
  const applyDeepLinkTo = useCallback((renderer: AtlasRenderer, hash: string): void => {
    const restored = decodeState(hash, SYSTEM_ORDER)
    if (!restored) return

    renderer.restore(restored)

    // Sorot preset HANYA kalau himpunan sistem yang dipulihkan memang cocok
    // dengan definisinya. Tanpa cek ini, tautan bisa menyorot "Semua"
    // sementara yang tampil cuma organ dalam — tombolnya berbohong soal apa
    // yang sedang dilihat.
    const preset = VISIBILITY_PRESETS.find((x) => x.id === restored.presetId)
    const shown = new Set(restored.visibleSystems)
    const expected = new Set([...(preset?.show ?? []), ...(preset?.ghost ?? [])])
    const cocok =
      preset !== undefined &&
      shown.size === expected.size &&
      [...shown].every((id) => expected.has(id))

    setActivePreset(cocok ? restored.presetId : null)
    setClip(restored.clip)
    setClipOffsetMm(renderer.clipOffsetMm())
  }, [])

  // Vena biru, arteri merah (lihat AtlasRenderer.markVenous). Dijalankan sekali
  // begitu geometri DAN indeks nama sama-sama siap; urutannya tidak dijamin.
  useEffect(() => {
    const r = rendererRef.current
    if (!ready || !index || !r) return
    const venous = index.all
      .filter((st) => st.system === 'systema_cardiovasculare' && VENOUS_NAME.test(st.name.en))
      .map((st) => st.idx)
    r.markVenous(venous)
  }, [ready, index])

  /** Buka bookmark (§E15). */
  const handleOpenBookmark = useCallback(
    (hash: string): void => {
      const r = rendererRef.current
      if (!r) return
      applyDeepLinkTo(r, hash)
      window.history.replaceState(null, '', `#${hash}`)
    },
    [applyDeepLinkTo],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new AtlasRenderer({ dataUrl: '/data' })
    rendererRef.current = renderer

    const off = [
      renderer.events.on('stats', setStats),
      renderer.events.on('progress', setProgress),
      renderer.events.on('ready', (info) => {
        setReady(true)
        setProgress(null)
        setModelStats(info)
        // §E14 AC3: pulihkan state SETELAH geometri siap — sebelum itu
        // structureCount masih 0 dan seleksi akan ditolak diam-diam.
        applyDeepLinkTo(renderer, initialHash.current)
      }),
      renderer.events.on('systems', setSystems),
      renderer.events.on('hover', setHover),
      renderer.events.on('selection', (sel) => {
        setSelection(sel)
        if (sel.length > 0) setSheetStop((v) => (v === 'peek' ? 'half' : v))
      }),
      renderer.events.on('error', (e) => {
        setError(e.message)
      }),
    ]

    renderer.mount(canvas)
    // §E11 AC4: deteksi kemampuan perangkat sekali di awal. Kalau terbatas,
    // user diberi tahu — bukan didegradasi diam-diam.
    setCapability(detectCapability(canvas.getContext('webgl2')))
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
    // Catatan klinis juga boleh gagal: tab Klinis lalu jujur bilang kosong.
    void loadClinical('/data')
      .then(setClinicalNotes)
      .catch(() => {
        setClinicalNotes([])
      })

    return () => {
      for (const fn of off) fn()
      renderer.dispose()
      rendererRef.current = null
    }
    // `applyDeepLinkTo` adalah useCallback berdeps kosong — stabil, jadi
    // menambahkannya di sini tidak membuat viewer di-mount ulang.
  }, [applyDeepLinkTo])

  // Latar kanvas 3D ikut tema; tanpa ini kanvas tetap gelap di mode terang.
  useEffect(() => {
    rendererRef.current?.setBackground(CANVAS_BG[theme])
  }, [theme, ready])

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

  /**
   * §E13. Bidang potong bukan state per-frame: user menggeser slider, bukan
   * kamera. Cukup jadi state React biasa, dan offset mm-nya ditanyakan ke
   * viewer karena bounding box tubuh hidup di sana.
   */
  const handleClip = (spec: ClipSpec | null): void => {
    setClip(spec)
    const r = rendererRef.current
    r?.setClip(spec)
    setClipOffsetMm(r?.clipOffsetMm() ?? null)
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
        clip: r.clipSpec(),
      },
      SYSTEM_ORDER,
    )
    // replaceState, bukan pushState: tiap toggle tidak layak jadi entri riwayat.
    window.history.replaceState(null, '', `#${encoded}`)
    return `${window.location.origin}${window.location.pathname}#${encoded}`
  }, [systems, activePreset])

  // `clip` ada di sini, bukan di dependency writeHash: nilainya dibaca dari
  // renderer (`r.clipSpec()`), jadi ia bukan dependency callback-nya — yang
  // benar adalah "tulis ulang hash setiap bidang potong berubah".
  useEffect(() => {
    if (ready) writeHash()
  }, [ready, writeHash, selection, clip])

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

  const clinical = useMemo(
    () => (index ? indexClinical(clinicalNotes, index) : undefined),
    [clinicalNotes, index],
  )

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
    <div className="relative h-full w-full overflow-hidden bg-canvas">
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

      {showOverlay && !isMobile && (
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
          className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-panel-border bg-panel px-3.5 py-2 text-[12px] text-panel-fg backdrop-blur"
        >
          {toast}
        </div>
      )}

      {/* §E11 AC1: < 768 px -> tree jadi drawer, panel jadi bottom sheet. */}
      {ready && !isMobile && (
        <SystemTree
          systems={systems}
          presets={VISIBILITY_PRESETS}
          activePreset={activePreset}
          onToggle={handleToggle}
          onOpacity={handleOpacity}
          onPreset={handleVisibilityPreset}
        />
      )}

      {ready && isMobile && (
        <>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(true)
            }}
            aria-label="Buka panel sistem"
            aria-expanded={drawerOpen}
            className="pointer-events-auto absolute top-3 left-3 z-20 rounded-lg border border-panel-border bg-panel px-3 py-2 text-[13px] text-panel-fg backdrop-blur"
          >
            Sistem
          </button>
          <Drawer
            open={drawerOpen}
            label="Sistem & preset"
            onClose={() => {
              setDrawerOpen(false)
            }}
          >
            <SystemTree
              systems={systems}
              presets={VISIBILITY_PRESETS}
              activePreset={activePreset}
              onToggle={handleToggle}
              onOpacity={handleOpacity}
              onPreset={handleVisibilityPreset}
              variant="embedded"
            />
          </Drawer>
        </>
      )}

      {ready && index && !isMobile && (
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
          clinical={clinical}
        />
      )}

      {ready && index && isMobile && (
        <BottomSheet
          open={selected.length > 0}
          stop={sheetStop}
          onStopChange={setSheetStop}
          label="Detail struktur"
          onClose={() => {
            rendererRef.current?.clearSelection()
          }}
        >
          <DetailPanel
            selected={selected}
            qualityThreshold={index.meshQualityExcludeBelow}
            nomenclature={nomenclature}
            language={language}
            variant="embedded"
            onClose={() => {
              rendererRef.current?.clearSelection()
            }}
            onFocus={(idx) => {
              rendererRef.current?.select(idx)
            }}
            clinical={clinical}
          />
        </BottomSheet>
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
        /*
          Wajib flex-wrap: di 375 px baris ini meluap ke kiri dan memotong
          pemilih tema (§E11 AC1 — semua kontrol harus terjangkau di layar
          sempit, bukan cuma "ada di DOM").
        */
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-end gap-2">
          <ThemeToggle value={themeChoice} onChange={setTheme} />
          <LanguageToggle value={language} onChange={setLanguage} coverage={coverage} />
          <button
            type="button"
            onClick={() => {
              setShowContrib(true)
            }}
            title="Daftar istilah yang perlu direview (§E7 AC5)"
            className="pointer-events-auto rounded-lg border border-panel-border bg-panel px-3 py-2 text-[12px] text-panel-muted backdrop-blur hover:text-panel-fg"
          >
            Kontribusi
          </button>
          <button
            type="button"
            onClick={() => {
              setShowOffline(true)
            }}
            title={
              offline.online
                ? 'Simpan untuk offline (§E12)'
                : 'Sedang offline — hanya sistem tersimpan yang bisa dibuka'
            }
            aria-label="Simpan untuk offline"
            className="pointer-events-auto rounded-lg border border-panel-border bg-panel px-3 py-2 text-[12px] text-panel-muted backdrop-blur hover:text-panel-fg"
          >
            {/* Status offline TIDAK hanya dibedakan warna — §E11 AC8. */}
            <span aria-hidden="true">{offline.online ? '⤓' : '⚡'}</span>
            <span className="sr-only">
              {offline.online ? 'online' : 'offline'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowBookmarks(true)
            }}
            title="Tampilan tersimpan & catatan (§E15)"
            aria-label="Tampilan tersimpan"
            className="pointer-events-auto rounded-lg border border-panel-border bg-panel px-3 py-2 text-[12px] text-panel-muted backdrop-blur hover:text-panel-fg"
          >
            <span aria-hidden="true">☰</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAbout(true)
            }}
            className="pointer-events-auto rounded-lg border border-panel-border bg-panel px-3 py-2 text-[12px] text-panel-muted backdrop-blur hover:text-panel-fg"
          >
            Tentang
          </button>
          {/*
            Dulu tombol ini diposisikan absolut di `top-16`. Begitu baris di
            atasnya boleh membungkus, posisi tetap itu bertabrakan dengannya —
            separuh tombol "Tentang" jadi tidak bisa diklik di 375 px. Ikut
            membungkus adalah satu-satunya posisi yang tidak bisa tabrakan.
          */}
          <button
            type="button"
            onClick={handleCopyLink}
            title="Salin tautan tampilan ini"
            className="pointer-events-auto rounded-lg border border-panel-border bg-panel px-3 py-2 text-[12px] text-panel-muted backdrop-blur hover:text-panel-fg"
          >
            {copied ? 'Tersalin ✓' : 'Salin tautan'}
          </button>
        </div>
      )}

      {/*
        Satu kolom, bukan dua elemen dengan offset absolut masing-masing.
        Kontrol explode tumbuh saat peringatan "terlalu padat" muncul, dan
        kontrol potongan tumbuh saat aktif — offset tetap pasti bertabrakan
        cepat atau lambat.
      */}
      {ready && !isMobile && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
          <CrossSectionControl
            value={clip}
            offsetMm={clipOffsetMm}
            language={language}
            onChange={handleClip}
          />
          <ExplodeControl
            value={explode}
            visibleCount={systems.reduce((n, x) => n + (x.visible ? x.count : 0), 0)}
            warnThreshold={EXPLODE_WARN_THRESHOLD}
            onChange={handleExplode}
          />
        </div>
      )}

      {ready && <ViewToolbar onPreset={handlePreset} onReset={handleReset} />}

      {showBookmarks && (
        <BookmarkPanel
          currentHash={() => writeHash().split('#')[1] ?? ''}
          dataFingerprint={
            modelStats ? `${String(modelStats.structures)}-${String(modelStats.triangles)}` : ''
          }
          onOpen={handleOpenBookmark}
          onClose={() => {
            setShowBookmarks(false)
          }}
        />
      )}

      {showOffline && (
        <OfflinePanel
          onClose={() => {
            setShowOffline(false)
          }}
        />
      )}

      {/*
        §E12: pembaruan tidak pernah dipaksakan. Menukar bundle di bawah tab
        yang sedang dipakai bisa mematahkan lazy-chunk yang sudah tidak ada di
        build baru — user yang memutuskan kapan memuat ulang.
      */}
      {offline.updateReady && (
        <div
          role="status"
          className="pointer-events-auto absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-panel-border bg-panel px-4 py-2.5 text-[12.5px] text-panel-fg backdrop-blur"
        >
          <span>Versi baru sudah siap.</span>
          <button
            type="button"
            onClick={offline.applyUpdate}
            className="rounded bg-panel-inverse px-2.5 py-1 text-[12px] font-medium text-panel-inverse-fg hover:opacity-90"
          >
            Muat ulang
          </button>
        </div>
      )}

      {showAbout && (
        <AboutPanel
          stats={modelStats}
          onClose={() => {
            setShowAbout(false)
          }}
        />
      )}

      {/*
        §12: atribusi WAJIB tampil di footer SETIAP halaman, bukan cuma di
        halaman About. Disembunyikan di mobile karena menutupi kanvas; di sana
        atribusinya ada di halaman Tentang.
      */}
      {ready && !isMobile && (
        <p className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 hidden -translate-x-1/2 text-[10px] text-panel-subtle sm:block">
          {ATTRIBUTION_SHORT} · Materi edukasi, bukan acuan praktik klinis
        </p>
      )}

      {showContrib && (
        <ContributionPanel
          nomenclature={nomenclature}
          index={index}
          onClose={() => {
            setShowContrib(false)
          }}
        />
      )}

      {ready && capability?.limited && !capabilityDismissed && (
        <div
          role="status"
          className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 rounded-lg border border-panel-warn-border bg-panel-warn-bg p-3 text-[12px] leading-relaxed text-panel-warn backdrop-blur sm:inset-x-auto sm:right-3 sm:max-w-sm"
        >
          <p className="font-medium">Perangkat ini terbatas</p>
          <p className="mt-1 opacity-85">
            Terdeteksi {capability.reasons.join(' · ')}. Model penuh (3 juta
            segitiga) mungkin berat. Sembunyikan sistem yang tidak dipakai lewat
            panel Sistem untuk meringankan.
          </p>
          <button
            type="button"
            onClick={() => {
              setCapabilityDismissed(true)
            }}
            className="mt-2 rounded border border-panel-warn-border px-2 py-1 text-[11px] hover:bg-panel-soft-hover"
          >
            Mengerti
          </button>
        </div>
      )}

      {progress && !ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center">
          <div className="rounded-lg border border-panel-border bg-panel px-4 py-2 font-mono text-xs text-panel-muted backdrop-blur">
            Memuat {progress.loaded}/{progress.total} batch
            {progress.lastSystem ? ` — ${progress.lastSystem}` : ''}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-100 backdrop-blur">
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
