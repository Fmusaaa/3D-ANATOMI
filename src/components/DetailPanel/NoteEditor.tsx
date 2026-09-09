/**
 * Catatan pribadi untuk satu struktur (PRD §E15).
 *
 * Autosave, bukan tombol "Simpan". Mahasiswa mengetik catatan sambil memutar
 * model dan mengklik struktur lain; tombol simpan yang terlewat berarti
 * catatan hilang tanpa peringatan.
 *
 * ⚠️ Editor-nya di-`key` per FMA, jadi berpindah struktur me-remount komponen
 * dan draft-nya diambil ulang dari store lewat inisialisasi `useState`. Cara
 * yang tampak lebih wajar — menyinkronkan draft di dalam `useEffect` — justru
 * salah: store berubah identitas tiap kali autosave menulis, jadi efeknya akan
 * menimpa teks yang sedang diketik dengan versi yang baru saja disimpan.
 *
 * ⚠️ Ditulis ke IndexedDB **perangkat ini saja**. Kalimat itu ada di UI, bukan
 * cuma di komentar — user yang mengira catatannya ikut ke HP akan kehilangan
 * kerjanya tanpa pernah diberi tahu. Lihat D-009.
 */

import { useEffect, useRef, useState } from 'react'
import { dbUnavailableReason } from '@/lib/db'
import { MAX_NOTE_CHARS, saveNote, sanitizeNoteText, useStudyData } from '@/study/annotations'

/** Jeda autosave: cukup lama untuk tidak menulis tiap ketukan, cukup pendek
 *  untuk selamat kalau tab ditutup mendadak. */
const SAVE_DELAY_MS = 600

interface Props {
  fma: string
  /** Nama struktur, dipakai di placeholder supaya jelas catatan ini milik siapa. */
  label: string
}

export function NoteEditor({ fma, label }: Props) {
  const { loaded } = useStudyData()

  if (!loaded) {
    return <p className="text-[12px] text-panel-subtle">Memuat catatan…</p>
  }
  // `key` inilah yang membuat perpindahan struktur me-remount editor.
  return <Editor key={fma} fma={fma} label={label} />
}

function Editor({ fma, label }: Props) {
  const { notes } = useStudyData()
  const [draft, setDraft] = useState(() => notes.get(fma)?.text ?? '')
  const [status, setStatus] = useState<'diam' | 'mengetik' | 'tersimpan'>('diam')

  const timer = useRef<number | undefined>(undefined)
  /**
   * Draft terakhir, dibaca saat unmount — state tidak bisa diandalkan di sana.
   *
   * Diperbarui di handler, BUKAN saat render: menyentuh ref selama render
   * melanggar aturan React (dan ditolak ESLint), karena render bisa dijalankan
   * ulang tanpa jadi commit.
   */
  const terakhir = useRef(draft)
  /** Isi saat editor dibuka, untuk membedakan "diedit" dari "cuma dilihat". */
  const awal = useRef(draft)

  const batal = (): void => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current)
      timer.current = undefined
    }
  }

  // Pindah struktur / panel ditutup: tuntaskan ketikan yang belum tersimpan.
  // Tanpa ini, mengklik struktur lain dalam 600 ms setelah mengetik akan
  // membuang kalimat terakhir tanpa jejak.
  useEffect(() => {
    return () => {
      batal()
      // Hanya tulis kalau memang berubah. Menulis ulang isi yang sama akan
      // memajukan `updatedAt` tanpa ada suntingan — dan aturan penggabungan
      // impor ("yang terbaru menang") lalu membuat catatan lokal yang cuma
      // pernah DIBUKA mengalahkan versi yang sungguh-sungguh lebih baru.
      if (terakhir.current !== awal.current) void saveNote(fma, terakhir.current)
    }
  }, [fma])

  const jadwalkan = (nilai: string): void => {
    batal()
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      void saveNote(fma, nilai).then(() => {
        awal.current = nilai
        setStatus('tersimpan')
      })
    }, SAVE_DELAY_MS)
  }

  const alasanGagal = dbUnavailableReason()
  const sisa = MAX_NOTE_CHARS - draft.length
  const kosong = sanitizeNoteText(draft) === ''

  return (
    <div className="flex flex-col gap-2">
      {alasanGagal !== null && (
        <p className="rounded-md border border-panel-warn-border bg-panel-warn-bg p-2.5 text-[11px] leading-relaxed text-panel-warn">
          Catatan tidak bisa disimpan di browser ini ({alasanGagal}). Apa yang kamu
          ketik di bawah akan hilang begitu halaman ditutup.
        </p>
      )}

      <textarea
        value={draft}
        maxLength={MAX_NOTE_CHARS}
        aria-label={`Catatan pribadi untuk ${label}`}
        placeholder={`Catatanmu tentang ${label}…`}
        onChange={(e) => {
          const nilai = e.target.value
          terakhir.current = nilai
          setDraft(nilai)
          setStatus('mengetik')
          jadwalkan(nilai)
        }}
        onBlur={() => {
          batal()
          if (terakhir.current === awal.current) return
          void saveNote(fma, terakhir.current).then(() => {
            awal.current = terakhir.current
            setStatus('tersimpan')
          })
        }}
        rows={7}
        className="w-full resize-y rounded-md border border-panel-border bg-panel-soft px-2.5 py-2 text-[12.5px] leading-relaxed text-panel-fg outline-none placeholder:text-panel-subtle focus:border-panel-fg/40"
      />

      <div className="flex items-center justify-between gap-3 text-[10.5px] text-panel-subtle">
        <span aria-live="polite">
          {status === 'mengetik' && 'Mengetik…'}
          {status === 'tersimpan' && (kosong ? 'Catatan dihapus' : 'Tersimpan di perangkat ini')}
          {status === 'diam' && (kosong ? 'Belum ada catatan' : 'Tersimpan di perangkat ini')}
        </span>
        {sisa < 300 && <span className="tabular-nums">{sisa} karakter tersisa</span>}
      </div>

      {/*
        §4.2 melarang backend di v1, jadi ini batas nyata — bukan detail teknis
        yang boleh disembunyikan.
      */}
      <p className="text-[10.5px] leading-relaxed text-panel-subtle">
        Catatan tersimpan di browser perangkat ini saja dan tidak ikut ke
        perangkat lain. Pakai Ekspor di panel Tampilan tersimpan untuk
        memindahkannya.
      </p>
    </div>
  )
}
