# Corpus — Atlas Anatomi 3D

Web app 3D interaktif untuk eksplorasi anatomi manusia, berbasis dataset
BodyParts3D. Dibangun sebagai alat belajar anatomi untuk mahasiswa kedokteran
Indonesia: nomenklatur Latin TA + Indonesia + Inggris, relasi anatomis, korelasi
klinis bersumber, dan mode latihan dengan spaced repetition.

**Status: Fase 0 (pipeline data).** Belum ada viewer.

- Spesifikasi lengkap: [`PRD.md`](PRD.md)
- Aturan kerja tiap sesi: [`CLAUDE.md`](CLAUDE.md)
- Format data sumber (terverifikasi): [`scripts/README.md`](scripts/README.md)
- Deviasi & keputusan: [`DECISIONS.md`](DECISIONS.md)
- Lisensi & atribusi: [`ATTRIBUTION.md`](ATTRIBUTION.md)

## Mulai

```bash
npm install
npm run dev
```

Pipeline data (Python, offline, sekali jalan):

```bash
pip install -r scripts/requirements.txt
npm run data:download
```

## Offline (PWA)

Service worker sengaja **tidak aktif di `npm run dev`** — cache-nya bertabrakan
dengan hot reload dan memunculkan "bug" yang sebenarnya cuma file basi. Untuk
mengujinya:

```bash
npm run build
npm run preview
```

⚠️ Uji offline yang sah hanya satu: **matikan servernya lalu muat ulang.**
Tiga bug service worker di proyek ini lolos dari seluruh pengujian saat server
masih hidup (lihat D-038 di `DECISIONS.md`).

Panel **Simpan untuk offline** menampilkan berapa MB yang sudah tersimpan per
sistem, melengkapi unduhan yang putus, dan menghapusnya. Geometri tidak pernah
di-precache diam-diam saat service worker dipasang.

## Deploy (Vercel)

`vercel.json` sudah berisi rewrite SPA dan header cache per kelas aset.

```bash
npx vercel deploy --prod
```

⚠️ Deploy publik pertama masih tertahan konflik lisensi BodyParts3D — lihat
`ATTRIBUTION.md` dan D-005.

## Lisensi

Kode MIT. Data anatomi BodyParts3D © DBCLS — lihat [`ATTRIBUTION.md`](ATTRIBUTION.md),
termasuk konflik lisensi yang belum terselesaikan dan wajib dibereskan sebelum
deploy publik.

> Aplikasi ini dibuat untuk tujuan edukasi. Bukan alat diagnostik dan bukan acuan
> untuk praktik klinis.
