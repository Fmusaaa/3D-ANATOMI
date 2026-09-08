/**
 * Halaman About + atribusi lisensi (PRD §12).
 *
 * §12 mewajibkan atribusi tampil di footer setiap halaman DAN di halaman About,
 * beserta sitasi paper aslinya. Ini P0 dan harus selesai sebelum deploy publik
 * pertama (§6.1).
 *
 * ⚠️ Konflik lisensi BodyParts3D yang ditemukan di Fase 0 ditampilkan APA
 * ADANYA di sini. Menyembunyikannya sampai "nanti sudah jelas" berarti
 * mendistribusikan data dengan klaim lisensi yang belum tentu benar.
 */

import { useEffect, useRef } from 'react'

export const ATTRIBUTION_SHORT =
  'BodyParts3D, © The Database Center for Life Science (DBCLS)'

export const DISCLAIMER =
  'Materi edukasi, bukan alat diagnostik dan bukan acuan praktik klinis. Model berbasis satu subjek pria dewasa dan tidak merepresentasikan variasi anatomis populasi.'

interface Props {
  onClose: () => void
  stats: { structures: number; triangles: number } | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-panel-border py-4 first:border-t-0">
      <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-panel-subtle uppercase">
        {title}
      </h3>
      <div className="space-y-2 text-[12.5px] leading-relaxed text-panel-muted">{children}</div>
    </section>
  )
}

export function AboutPanel({ onClose, stats }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Tentang Corpus"
      className="pointer-events-auto absolute inset-4 z-40 flex flex-col overflow-hidden rounded-xl border border-panel-border bg-panel backdrop-blur sm:inset-x-auto sm:left-1/2 sm:w-[min(680px,calc(100vw-2rem))] sm:-translate-x-1/2"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-panel-border px-5 py-4">
        <div>
          <h2 className="text-[16px] font-semibold text-panel-fg">Corpus — Atlas Anatomi 3D</h2>
          <p className="mt-0.5 text-[12px] text-panel-subtle">
            Alat belajar anatomi untuk mahasiswa kedokteran Indonesia
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup halaman tentang"
          className="shrink-0 rounded px-2 py-1 text-panel-subtle hover:bg-panel-soft-hover hover:text-panel-fg"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        <Section title="Disclaimer">
          <p className="rounded-md border border-panel-warn-border bg-panel-warn-bg p-3 text-panel-warn">
            {DISCLAIMER}
          </p>
        </Section>

        <Section title="Data anatomi">
          <p>
            {ATTRIBUTION_SHORT}. Dataset BodyParts3D 4.0, hierarki <em>is-a</em>.
            {stats && (
              <>
                {' '}
                {stats.structures.toLocaleString('id')} struktur,{' '}
                {stats.triangles.toLocaleString('id')} segitiga setelah decimation.
              </>
            )}
          </p>
          <p>
            Sitasi: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K.
            BodyParts3D: 3D structure database for anatomical concepts.{' '}
            <em>Nucleic Acids Research</em>. 2009;37(Database issue):D782–5.{' '}
            <a
              href="https://academic.oup.com/nar/article/37/suppl_1/D782/1000752"
              target="_blank"
              rel="noreferrer noopener"
              className="text-panel-link underline underline-offset-2 hover:opacity-80"
            >
              Baca paper
            </a>
          </p>
        </Section>

        {/*
          §6.1 / R1: konflik ini ditemukan saat verifikasi Fase 0 dan BELUM
          terselesaikan. Ditampilkan terbuka — mendistribusikan data dengan
          klaim lisensi yang belum pasti itu masalah nyata, bukan detail.
        */}
        <Section title="Status lisensi data — belum final">
          <p>
            Halaman lisensi resmi DBCLS menyebut <strong>CC BY 4.0</strong>, tetapi
            header di dalam <em>setiap</em> file mesh <code>.obj</code> (2.234 dari
            2.234) menyebut <strong>CC BY-SA 2.1 Japan</strong>. Keduanya terbitan
            DBCLS sendiri.
          </p>
          <p>
            Sampai ada penegasan tertulis dari DBCLS, data turunan di proyek ini
            diperlakukan sebagai <strong>CC BY-SA</strong> — sikap paling aman di
            bawah kedua tafsir. Kode proyek berlisensi MIT dan terpisah dari data.
          </p>
        </Section>

        <Section title="Batas yang perlu diketahui">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              Nomenklatur Latin TA dan Indonesia masih <strong>diturunkan otomatis</strong>{' '}
              dan belum diverifikasi manusia. Setiap istilah yang belum diperiksa diberi
              badge, dan tidak dipakai sebagai jawaban benar di quiz.
            </li>
            <li>
              Mesh BodyParts3D adalah hasil segmentasi dataset 2011. Struktur halus
              kasar, dan <strong>saraf perifer ekstremitas tidak ada sama sekali</strong> —
              tidak ada n. medianus, n. ulnaris, maupun n. ischiadicus.
            </li>
            <li>
              Regio sebagian struktur ditebak dari posisi spasial, bukan dari ontologi.
              Yang seperti itu ditandai “perkiraan spasial”.
            </li>
          </ul>
        </Section>

        <Section title="Lisensi kode">
          <p>
            MIT. Konten terkurasi (terjemahan, relasi, catatan klinis) direncanakan
            CC BY-SA 4.0.
          </p>
        </Section>
      </div>
    </div>
  )
}
