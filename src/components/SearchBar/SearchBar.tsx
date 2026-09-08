/**
 * Pencarian struktur (PRD §E5).
 *
 * Dibuka dengan Ctrl/Cmd+K dari mana saja (AC6). Navigasi keyboard penuh:
 * panah atas/bawah memilih, Enter menyeleksi + fly-to, Esc menutup (AC5).
 *
 * Presentasi murni — tidak menyentuh three.js. Index datang lewat props.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SYSTEM_LABEL, type StructureIndex } from '@/content/structures'
import { displayName, type LanguageCode, type Nomenclature } from '@/content/nomenclature'
import { StatusBadge } from '@/components/Nomenclature/NameBlock'
import { StructureSearch, type SearchHit } from '@/content/search'
import { cn } from '@/lib/utils'

/** §E5 AC3: debounce 120 ms. */
const DEBOUNCE_MS = 120
const MAX_RESULTS = 20

interface Props {
  index: StructureIndex
  nomenclature: Nomenclature | null
  language: LanguageCode
  /** structureIdx yang sedang tersembunyi, untuk ikon "terlihat/tersembunyi" (AC4). */
  isHidden: (idx: number) => boolean
  onPick: (idx: number) => void
}

export function SearchBar({ index, nomenclature, language, isHidden, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Index dibangun sekali; 3.675 entri.
  const search = useMemo(
    () => new StructureSearch(index.all, index.groups, nomenclature),
    [index, nomenclature],
  )

  // §E5 AC6: Cmd/Ctrl+K dari mana saja.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // §E5 AC3: debounce 120 ms.
  useEffect(() => {
    // Semua setState ditaruh DI DALAM timeout. Memanggilnya langsung di badan
    // effect memicu cascading render (dan ditolak lint react-hooks).
    const t = setTimeout(() => {
      if (!query.trim()) {
        setHits([])
        setSuggestions([])
        setElapsed(null)
        return
      }
      const t0 = performance.now()
      const r = search.search(query, MAX_RESULTS)
      setElapsed(performance.now() - t0)
      setHits(r)
      setActive(0)
      // §E5 AC8: kalau nol hasil, tawarkan saran, bukan jalan buntu.
      setSuggestions(r.length === 0 ? search.suggest(query) : [])
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
    }
  }, [query, search])

  // Jepit index aktif ke panjang hasil SAAT INI.
  //
  // Tanpa ini, menyorot hasil ke-12 lalu mempersempit query sampai hasilnya
  // tinggal 3 membuat `hits[active]` undefined — dan Enter diam saja tanpa
  // penjelasan apa pun. Terlihat seperti aplikasi hang.
  const activeIndex = hits.length === 0 ? 0 : Math.min(active, hits.length - 1)

  const choose = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return
      onPick(hit.entry.idx)
      setOpen(false)
      setQuery('')
    },
    [onPick],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(activeIndex + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(hits[activeIndex] ?? hits[0])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
        className="pointer-events-auto absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-[12px] text-white/50 backdrop-blur hover:text-white/80"
      >
        <span>Cari struktur…</span>
        <kbd className="rounded border border-white/15 px-1 font-mono text-[10px]">
          Ctrl K
        </kbd>
      </button>
    )
  }

  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 z-30 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-white/12 bg-black/88 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/10 px-3">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          onKeyDown={onKeyDown}
          placeholder="Nama struktur atau FMA ID…"
          aria-label="Cari struktur anatomi"
          className="w-full bg-transparent py-3 text-[14px] text-white outline-none placeholder:text-white/30"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false)
          }}
          aria-label="Tutup pencarian"
          className="shrink-0 rounded px-1.5 text-white/40 hover:text-white/90"
        >
          esc
        </button>
      </div>

      {hits.length > 0 && (
        <ul ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto py-1">
          {hits.map((h, i) => {
            const sys = SYSTEM_LABEL[h.entry.system]
            const primary = displayName(nomenclature, h.entry.fma, h.entry.en, language)
            const hidden = h.entry.members.every(isHidden)
            return (
              <li key={h.entry.id}>
                <button
                  type="button"
                  data-active={i === activeIndex}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => {
                    setActive(i)
                  }}
                  onClick={() => {
                    choose(h)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left',
                    i === activeIndex ? 'bg-white/12' : 'hover:bg-white/6',
                  )}
                >
                  <span
                    aria-hidden="true"
                    title={hidden ? 'Sedang tersembunyi' : 'Terlihat'}
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      hidden ? 'bg-white/20' : 'bg-emerald-400/80',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] text-white/90">
                        {primary.text || h.entry.en}
                      </span>
                      {primary.entry && <StatusBadge status={primary.entry.status} />}
                    </span>
                    {/* Nama Inggris tetap ditampilkan sebagai jangkar. */}
                    {language !== 'en' && primary.text && (
                      <span className="block truncate text-[10.5px] text-white/40">
                        {h.entry.en}
                      </span>
                    )}
                    <span className="block truncate text-[10.5px] text-white/35">
                      {h.entry.kind === 'group'
                        ? `konsep gabungan · ${String(h.entry.members.length)} mesh`
                        : (sys?.id ?? h.entry.system)}
                      {' · '}
                      {h.entry.fma}
                      {hidden ? ' · tersembunyi' : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {query.trim() && hits.length === 0 && (
        <div className="px-3 py-4">
          <p className="text-[13px] text-white/55">Tidak ada hasil untuk “{query}”</p>
          {suggestions.length > 0 && (
            <p className="mt-2 text-[12px] text-white/40">
              Maksud lo:{' '}
              {suggestions.map((sg, i) => (
                <span key={sg}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(sg)
                    }}
                    className="text-sky-300/90 underline underline-offset-2 hover:text-sky-200"
                  >
                    {sg}
                  </button>
                </span>
              ))}
              ?
            </p>
          )}
          {/*
            Jangan biarkan user menyimpulkan search-nya rusak padahal datanya
            yang belum ada (§8.1 prinsip 5).
          */}
          <p className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-white/30">
            Index saat ini hanya memuat nama Inggris FMA. Nomenklatur Latin TA
            dan Indonesia dikurasi di Fase 5 — sampai itu, cari pakai istilah
            Inggris (mis. “femoral artery”, bukan “arteria femoralis”).
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-[10px] text-white/30">
        <span>
          ↑↓ pilih · Enter buka · Esc tutup
        </span>
        <span className="tabular-nums">
          {elapsed !== null && `${String(hits.length)} hasil · ${elapsed.toFixed(1)} ms`}
          {elapsed === null && `${search.size.toLocaleString('id')} konsep terindeks`}
        </span>
      </div>
    </div>
  )
}
