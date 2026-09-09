/**
 * Tampilan tersimpan / bookmark (PRD §E15).
 *
 * Bookmark menyimpan **deep link §E14**, bukan format snapshot sendiri. Encoder
 * itu sudah mencakup kamera, visibilitas, opacity, seleksi, preset, dan bidang
 * potong; membuat format kedua berarti ada dua sumber kebenaran yang harus
 * diperbarui setiap kali ada state tampilan baru — dan yang satu pasti
 * ketinggalan.
 *
 * Ekspor/impor ada di sini karena inilah satu-satunya jembatan antar-perangkat
 * yang mungkin tanpa backend (§4.2). Tanpa itu, catatan mahasiswa yang belajar
 * di laptop dan mengulang di HP praktis tidak berguna. Lihat D-009 dan D-043.
 */

import { useRef, useState } from 'react'
import { dbUnavailableReason } from '@/lib/db'
import {
  MAX_NAME_CHARS,
  addBookmark,
  clearAllStudyData,
  importBackup,
  parseBackup,
  removeBookmark,
  renameBookmark,
  serializeBackup,
  useStudyData,
} from '@/study/annotations'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
  /** Deep link tampilan saat ini, tanpa tanda pagar. */
  currentHash: () => string
  /** Sidik jari dataset yang sedang dimuat, untuk menandai bookmark usang. */
  dataFingerprint: string
  onOpen: (hash: string) => void
}

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString('id', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function BookmarkPanel({ onClose, currentHash, dataFingerprint, onOpen }: Props) {
  const { notes, bookmarks, loaded } = useStudyData()
  const [nama, setNama] = useState('')
  const [pesan, setPesan] = useState<string | null>(null)
  const [ubahId, setUbahId] = useState<string | null>(null)
  /** Konfirmasi dua langkah untuk "Hapus semua" — aksi ini tidak bisa dibatalkan. */
  const [siapHapus, setSiapHapus] = useState(false)
  const [ubahNama, setUbahNama] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const alasanGagal = dbUnavailableReason()

  const simpan = (): void => {
    void addBookmark(nama, currentHash(), dataFingerprint).then(() => {
      setNama('')
      setPesan('Tampilan tersimpan.')
    })
  }

  const ekspor = (): void => {
    const isi = serializeBackup([...notes.values()], bookmarks)
    const url = URL.createObjectURL(new Blob([isi], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `corpus-catatan-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setPesan(`Diekspor: ${notes.size} catatan, ${bookmarks.length} tampilan.`)
  }

  const impor = (file: File): void => {
    void file.text().then((teks) => {
      const hasil = parseBackup(teks)
      if (hasil.error !== null) {
        setPesan(hasil.error)
        return
      }
      void importBackup(hasil).then(({ notes: n, marks: m }) => {
        const dibuang = hasil.dropped > 0 ? ` ${hasil.dropped} entri rusak dilewati.` : ''
        setPesan(`Diimpor: ${n} catatan, ${m} tampilan.${dibuang}`)
      })
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tampilan tersimpan"
      className="pointer-events-auto absolute inset-4 z-40 flex flex-col overflow-hidden rounded-xl border border-panel-border bg-panel backdrop-blur sm:inset-x-auto sm:left-1/2 sm:w-[min(560px,calc(100vw-2rem))] sm:-translate-x-1/2"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-panel-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-panel-fg">Tampilan tersimpan</h2>
          <p className="mt-0.5 text-[12px] text-panel-subtle tabular-nums">
            {bookmarks.length} tampilan · {notes.size} catatan
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel tampilan tersimpan"
          className="shrink-0 rounded px-2 py-1 text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-fg"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {alasanGagal !== null && (
          <p className="mb-3 rounded-md border border-panel-warn-border bg-panel-warn-bg p-3 text-[11.5px] leading-relaxed text-panel-warn">
            Penyimpanan lokal tidak tersedia ({alasanGagal}). Apa pun yang disimpan di
            sini akan hilang saat halaman ditutup.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nama}
            maxLength={MAX_NAME_CHARS}
            onChange={(e) => {
              setNama(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') simpan()
            }}
            placeholder="Nama tampilan ini…"
            aria-label="Nama tampilan yang akan disimpan"
            className="min-w-40 flex-1 rounded border border-panel-border bg-panel-soft px-2.5 py-1.5 text-[12.5px] text-panel-fg outline-none placeholder:text-panel-subtle"
          />
          <button
            type="button"
            onClick={simpan}
            className="rounded bg-panel-inverse px-3 py-1.5 text-[12.5px] font-medium text-panel-inverse-fg hover:opacity-90"
          >
            Simpan tampilan ini
          </button>
        </div>

        {pesan !== null && (
          <p className="mt-2 text-[11.5px] text-panel-ok" role="status">
            {pesan}
          </p>
        )}

        {loaded && bookmarks.length === 0 && (
          <p className="mt-4 text-[12px] leading-relaxed text-panel-subtle">
            Belum ada tampilan tersimpan. Atur sistem yang terlihat, sudut kamera, dan
            bidang potong sesuai yang mau kamu ulang — lalu simpan di sini.
          </p>
        )}

        <ul className="mt-3 divide-y divide-panel-border">
          {bookmarks.map((b) => {
            const usang = b.dataFingerprint !== '' && b.dataFingerprint !== dataFingerprint
            return (
              <li key={b.id} className="flex items-start gap-2 py-2">
                <div className="min-w-0 flex-1">
                  {ubahId === b.id ? (
                    <input
                      autoFocus
                      value={ubahNama}
                      maxLength={MAX_NAME_CHARS}
                      onChange={(e) => {
                        setUbahNama(e.target.value)
                      }}
                      onBlur={() => {
                        void renameBookmark(b.id, ubahNama)
                        setUbahId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setUbahId(null)
                      }}
                      aria-label="Ubah nama tampilan"
                      className="w-full rounded border border-panel-border bg-panel-soft px-2 py-1 text-[13px] text-panel-fg outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(b.hash)
                        onClose()
                      }}
                      className="block w-full truncate text-left text-[13px] text-panel-fg hover:text-panel-link"
                    >
                      {b.name}
                    </button>
                  )}
                  <p className="text-[11px] text-panel-subtle">{tanggal(b.createdAt)}</p>
                  {usang && (
                    /*
                      Deep link menyimpan seleksi sebagai structureIdx. Kalau
                      dataset dibangun ulang, idx bisa bergeser dan bookmark ini
                      akan menyorot struktur yang salah — meyakinkan dan keliru.
                    */
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-panel-warn">
                      Dibuat dengan versi dataset lain. Sudut kamera tetap benar, tapi
                      struktur yang tersorot mungkin bergeser.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUbahId(b.id)
                    setUbahNama(b.name)
                  }}
                  aria-label={`Ubah nama ${b.name}`}
                  className="shrink-0 rounded px-2 py-1 text-[11px] text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-fg"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void removeBookmark(b.id)
                  }}
                  aria-label={`Hapus ${b.name}`}
                  className="shrink-0 rounded px-2 py-1 text-[11px] text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-fg"
                >
                  Hapus
                </button>
              </li>
            )
          })}
        </ul>

        {/*
          §4.2 melarang backend, jadi ekspor/impor inilah satu-satunya cara
          memindahkan catatan antar-perangkat. Dinyatakan apa adanya, bukan
          disembunyikan sebagai "fitur lanjutan".
        */}
        <p className="mt-5 border-t border-panel-border pt-3 text-[11.5px] leading-relaxed text-panel-muted">
          Catatan dan tampilan tersimpan hanya di browser perangkat ini — tidak ada
          server, jadi tidak ikut berpindah sendiri. Ekspor berkas JSON-nya lalu impor
          di perangkat lain. Impor <strong>menggabungkan</strong>; catatan yang lebih
          baru tidak akan ditimpa versi lama.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-panel-border px-5 py-3">
        <button
          type="button"
          onClick={ekspor}
          disabled={notes.size === 0 && bookmarks.length === 0}
          className="rounded border border-panel-border px-3 py-1.5 text-[12.5px] text-panel-muted hover:bg-panel-soft-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ekspor
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded border border-panel-border px-3 py-1.5 text-[12.5px] text-panel-muted hover:bg-panel-soft-hover"
        >
          Impor
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) impor(f)
            // Kosongkan supaya memilih berkas yang sama dua kali tetap memicu.
            e.target.value = ''
          }}
        />
        {/*
          Dua langkah, bukan satu. Ini menghapus seluruh catatan mahasiswa dan
          tidak bisa dibatalkan — satu klik tak sengaja di sebelah "Impor"
          sudah cukup untuk menghabisi kerja berminggu-minggu.
        */}
        <button
          type="button"
          onClick={() => {
            if (!siapHapus) {
              setSiapHapus(true)
              return
            }
            void clearAllStudyData().then(() => {
              setSiapHapus(false)
              setPesan('Semua catatan dan tampilan dihapus.')
            })
          }}
          onBlur={() => {
            setSiapHapus(false)
          }}
          disabled={notes.size === 0 && bookmarks.length === 0}
          className={cn(
            'ml-auto rounded px-3 py-1.5 text-[12.5px]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            siapHapus
              ? 'border border-panel-warn-border bg-panel-warn-bg font-medium text-panel-warn'
              : 'text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-warn',
          )}
        >
          {siapHapus
            ? `Yakin? Hapus ${String(notes.size)} catatan + ${String(bookmarks.length)} tampilan`
            : 'Hapus semua'}
        </button>
      </div>
    </div>
  )
}
