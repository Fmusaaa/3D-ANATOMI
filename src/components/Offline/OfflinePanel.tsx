/**
 * Panel "Simpan untuk offline" (PRD §E12).
 *
 * Dua hal yang panel ini harus jujur soal ukuran:
 *
 * 1. Angka MB di sini diambil dari `manifest.json` hasil pipeline, bukan dari
 *    Content-Length respons — server yang memakai chunked transfer tidak
 *    mengirimnya, dan membaca blob-nya berarti mendekode puluhan MB cuma
 *    untuk menampilkan sebuah angka.
 *
 * 2. `AtlasRenderer.load()` memuat SELURUH batch saat app dibuka. Jadi
 *    kunjungan pertama memang sudah mengunduh 32 MB, mau ada panel ini atau
 *    tidak. Tombol di sini bukan "unduh tambahan" — fungsinya melengkapi
 *    unduhan yang putus di tengah dan memberi jalan menghapusnya. Panel yang
 *    berpura-pura menawarkan pilihan yang sebenarnya sudah terjadi itu
 *    menyesatkan. Lihat D-039.
 *
 * Sistem diurut dari yang terbesar supaya jelas dari mana beratnya datang —
 * kardiovaskular sendirian hampir 40% dari total.
 */

import { useEffect, useMemo, useState } from 'react'
import { SYSTEM_LABEL } from '@/content/structures'
import { loadGeometryIndex, useOffline, type GeometryEntry } from '@/lib/offline'
import { cn } from '@/lib/utils'

const MB = 1024 * 1024

function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`
}

function label(systemId: string): { la: string; id: string } {
  return SYSTEM_LABEL[systemId] ?? { la: systemId, id: '' }
}

interface SystemRow {
  systemId: string
  bytes: number
  structures: number
  urls: string[]
  /** Berapa berkas sistem ini yang sudah ada di cache. */
  storedFiles: number
  storedBytes: number
}

interface Props {
  onClose: () => void
}

export function OfflinePanel({ onClose }: Props) {
  const offline = useOffline()
  const [batches, setBatches] = useState<GeometryEntry[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = offline.refresh

  useEffect(() => {
    void loadGeometryIndex().then(setBatches)
    // Statistik cache di store diambil sekali saat service worker mengambil
    // alih halaman — saat itu geometri belum selesai diunduh. Tanpa penyegaran
    // di sini panel selalu melaporkan "0 MB tersimpan" padahal tidak.
    void refresh()
  }, [refresh])

  const stored = useMemo(() => new Set(offline.stats?.paths ?? []), [offline.stats])

  const rows = useMemo<SystemRow[]>(() => {
    const map = new Map<string, SystemRow>()
    for (const b of batches) {
      const url = `/data/${b.file}`
      const row = map.get(b.systemId) ?? {
        systemId: b.systemId,
        bytes: 0,
        structures: 0,
        urls: [],
        storedFiles: 0,
        storedBytes: 0,
      }
      row.bytes += b.bytes
      row.structures += b.structureCount
      row.urls.push(url)
      if (stored.has(url)) {
        row.storedFiles++
        row.storedBytes += b.bytes
      }
      map.set(b.systemId, row)
    }
    return [...map.values()].sort((a, b) => b.bytes - a.bytes)
  }, [batches, stored])

  const total = rows.reduce((n, r) => n + r.bytes, 0)
  const storedBytes = rows.reduce((n, r) => n + r.storedBytes, 0)
  const missing = rows.flatMap((r) => r.urls.filter((u) => !stored.has(u)))
  const missingBytes = total - storedBytes
  const complete = batches.length > 0 && missing.length === 0
  const progress = offline.progress

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simpan untuk offline"
      className="pointer-events-auto absolute inset-4 z-40 flex flex-col overflow-hidden rounded-xl border border-panel-border bg-panel backdrop-blur sm:inset-x-auto sm:left-1/2 sm:w-[min(560px,calc(100vw-2rem))] sm:-translate-x-1/2"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-panel-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-panel-fg">Simpan untuk offline</h2>
          <p className="mt-0.5 text-[12px] text-panel-subtle tabular-nums">
            {offline.online ? 'Sedang online' : 'Sedang offline'}
            {offline.active && batches.length > 0 && (
              <> · {mb(storedBytes)} dari {mb(total)} tersimpan</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel offline"
          className="shrink-0 rounded px-2 py-1 text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-fg"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!offline.supported && (
          <p className="rounded-md border border-panel-warn-border bg-panel-warn-bg p-3 text-[12px] leading-relaxed text-panel-warn">
            Browser ini tidak mendukung service worker, jadi mode offline tidak tersedia.
            Semua fitur lain tetap jalan.
          </p>
        )}

        {offline.supported && !offline.active && (
          <p className="rounded-md border border-panel-border bg-panel-soft p-3 text-[12px] leading-relaxed text-panel-muted">
            Mode offline hanya aktif di build produksi — saat <code>npm run dev</code> sengaja
            dimatikan supaya cache tidak bertabrakan dengan hot reload. Untuk mengujinya
            jalankan build lalu preview, atau buka versi yang sudah di-deploy.
          </p>
        )}

        {/*
          Kalimat ini sengaja tidak menjual. Atlas memuat seluruh geometri saat
          dibuka, jadi menyebut panel ini "hemat kuota" itu bohong.
        */}
        <p className="mt-3 text-[12.5px] leading-relaxed text-panel-muted">
          Membuka atlas sekali sudah mengunduh seluruh geometri —{' '}
          <strong className="text-panel-fg">{mb(total)}</strong>. Yang disimpan di sini
          adalah byte yang sama, supaya atlas tetap bisa dibuka tanpa internet dan tidak
          perlu diunduh ulang.
        </p>

        {complete && !progress && (
          <p className="mt-3 rounded-md border border-panel-ok-border bg-panel-ok-bg p-3 text-[12px] leading-relaxed text-panel-ok">
            Semua {rows.length} sistem sudah tersimpan. Atlas bisa dibuka penuh tanpa
            koneksi.
          </p>
        )}

        {progress && (
          <div className="mt-3 rounded-md border border-panel-border bg-panel-soft p-3">
            <div className="flex items-center justify-between gap-3 text-[12px] text-panel-muted">
              <span className="tabular-nums">
                Mengunduh {progress.done} / {progress.total} berkas
                {progress.failed > 0 && ` · ${progress.failed} gagal`}
              </span>
              <button
                type="button"
                onClick={offline.cancel}
                className="shrink-0 rounded px-2 py-0.5 text-[11px] text-panel-link hover:bg-panel-soft-hover"
              >
                Batalkan
              </button>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-soft-hover">
              <div
                className="h-full rounded-full bg-panel-link transition-[width] duration-200"
                style={{
                  width: `${((progress.done / Math.max(1, progress.total)) * 100).toFixed(1)}%`,
                }}
              />
            </div>
          </div>
        )}

        <ul className="mt-4 divide-y divide-panel-border">
          {rows.map((r) => {
            const done = r.storedFiles === r.urls.length
            return (
              <li key={r.systemId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  {/* Dua bahasa sederajat (D-027), sama seperti SystemTree. */}
                  <p className="truncate text-[13px] text-panel-fg">
                    {label(r.systemId).la}
                    <span className="text-panel-muted"> · {label(r.systemId).id}</span>
                  </p>
                  <p className="text-[11px] text-panel-subtle tabular-nums">
                    {mb(r.bytes)} · {r.structures.toLocaleString('id')} struktur
                    {r.storedFiles > 0 && !done && ` · ${r.storedFiles}/${r.urls.length} tersimpan`}
                  </p>
                </div>
                {done ? (
                  // Status TIDAK hanya dibedakan warna — §E11 AC8.
                  <span className="shrink-0 text-[11.5px] text-panel-ok">Tersimpan ✓</span>
                ) : (
                  <button
                    type="button"
                    disabled={!offline.active || progress !== null}
                    onClick={() => {
                      offline.download(r.urls.filter((u) => !stored.has(u)))
                    }}
                    className={cn(
                      'shrink-0 rounded border border-panel-border px-2.5 py-1 text-[11.5px]',
                      offline.active && !progress
                        ? 'text-panel-link hover:bg-panel-soft-hover'
                        : 'cursor-not-allowed text-panel-subtle opacity-60',
                    )}
                  >
                    Simpan
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-panel-border px-5 py-3">
        <button
          type="button"
          disabled={!offline.active || progress !== null || missing.length === 0}
          onClick={() => {
            offline.download(missing)
          }}
          className={cn(
            'rounded px-3 py-1.5 text-[12.5px] font-medium',
            offline.active && !progress && missing.length > 0
              ? 'bg-panel-inverse text-panel-inverse-fg hover:opacity-90'
              : 'cursor-not-allowed bg-panel-soft text-panel-subtle',
          )}
        >
          {missing.length === 0
            ? 'Semua sudah tersimpan'
            : `Simpan sisanya (${mb(missingBytes)})`}
        </button>
        <button
          type="button"
          disabled={!offline.active || busy || stored.size === 0}
          onClick={() => {
            setBusy(true)
            void offline.clearData().finally(() => {
              setBusy(false)
            })
          }}
          className="rounded border border-panel-border px-3 py-1.5 text-[12.5px] text-panel-muted hover:bg-panel-soft-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Menghapus…' : `Hapus data tersimpan${stored.size > 0 ? ` (${mb(storedBytes)})` : ''}`}
        </button>
      </div>
    </div>
  )
}
