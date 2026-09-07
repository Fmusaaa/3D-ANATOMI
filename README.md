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

## Lisensi

Kode MIT. Data anatomi BodyParts3D © DBCLS — lihat [`ATTRIBUTION.md`](ATTRIBUTION.md),
termasuk konflik lisensi yang belum terselesaikan dan wajib dibereskan sebelum
deploy publik.

> Aplikasi ini dibuat untuk tujuan edukasi. Bukan alat diagnostik dan bukan acuan
> untuk praktik klinis.
