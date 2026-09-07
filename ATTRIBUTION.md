# Atribusi & Lisensi

## Kode

MIT — lihat [`LICENSE`](LICENSE).

## Data anatomi — BodyParts3D

> BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under
> CC Attribution 4.0 International.

Sumber: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>
Versi: BP3D 4.0 (`isa_BP3D_4.0_obj_99.zip`, `partof_BP3D_4.0_obj_99.zip`),
diunduh 7 September 2026 dari alias `LATEST`.

**Sitasi wajib:**

> Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K.
> BodyParts3D: 3D structure database for anatomical concepts.
> *Nucleic Acids Research*. 2009;37(Database issue):D782–5.
> <https://academic.oup.com/nar/article/37/suppl_1/D782/1000752>

---

## ⚠️ Konflik lisensi yang belum terselesaikan (PRD §6.1, R1)

**Status: P0 — harus diputuskan sebelum deploy publik pertama.**

Verifikasi di Fase 0 (7 September 2026) menemukan **dua klaim lisensi yang
berbeda dari DBCLS sendiri**:

| Sumber | Klaim lisensi | Tanggal | Arsip lokal |
|---|---|---|---|
| Halaman lisensi resmi `bodyparts3d/lic.html` | **CC BY 4.0 International** | diperbarui 2025-02-27 | [`docs/licenses/bodyparts3d-lic-2026-09-07.html`](docs/licenses/bodyparts3d-lic-2026-09-07.html) |
| `README_e.html` resmi, bagian "3. License" | **CC BY 4.0 International** | diperbarui 2025-02-25 | [`docs/licenses/bodyparts3d-README_e-2026-09-07.html`](docs/licenses/bodyparts3d-README_e-2026-09-07.html) |
| Header komentar **di dalam file `.obj`** | **CC BY-SA 2.1 Japan** | teks dari build 2011 | 2.234 dari 2.234 file isa |

Contoh header mentah dari `FJ1252.obj`:

```
# The license for this database is specified in the Creative Commons
# Attribution-Share Alike 2.1 Japan. If you use data from this database, ...
# http://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
```

### Kenapa ini penting

**SA (ShareAlike) bersifat viral.** Kalau data ini CC BY-SA, maka karya turunan
yang memuat data tersebut — termasuk file `.atlas` yang kita hasilkan — harus
dilisensikan serupa. Kalau CC BY 4.0, cukup atribusi.

### Analisis

Argumen bahwa **CC BY 4.0 yang berlaku**:

1. Header `.obj` itu teks yang dibakar saat build 2011 dan tidak pernah
   di-regenerate; ia **menunjuk ke `lic.html`** sebagai sumber otoritatif — dan
   halaman itu hari ini berbunyi CC BY 4.0.
2. Halaman lisensi dan README resmi keduanya diperbarui Februari 2025, jauh
   setelah header dibuat, dan konsisten satu sama lain.
3. CC BY 4.0 lebih permisif; DBCLS tampak melonggarkan lisensi secara sengaja.

Argumen tandingan: header itu menyertai data yang benar-benar didistribusikan,
dan pembaca yang cuma memegang file `.obj` akan menyimpulkan BY-SA.

### Rekomendasi (belum diputuskan — perlu keputusan product owner)

1. **Kirim email konfirmasi ke DBCLS** lewat alamat di halaman lisensi, minta
   penegasan tertulis bahwa BP3D 4.0 berlisensi CC BY 4.0 dan header `.obj`
   sudah usang. Simpan balasannya di `docs/licenses/`.
2. **Sampai ada balasan, ambil sikap paling aman:** perlakukan data turunan
   (`.atlas`) sebagai **CC BY-SA**, dan **pisahkan repo kode (MIT) dari repo
   data** seperti mitigasi R1 di PRD. Kode tetap MIT tanpa terkontaminasi.
3. Atribusi tetap ditampilkan di footer setiap halaman dan halaman About,
   apa pun hasilnya.

---

## Konten terkurasi

Terjemahan Indonesia, relasi anatomis, dan catatan klinis yang ditulis untuk
proyek ini. 📌 Lisensi belum final (PRD §13 D6); rekomendasi PRD: CC BY-SA 4.0.

Setiap catatan klinis mencantumkan sumbernya masing-masing. Konten tanpa field
`source` ditolak validator dan tidak pernah tampil.

---

## Disclaimer

> Aplikasi ini dibuat untuk tujuan edukasi. Bukan alat diagnostik dan bukan
> acuan untuk praktik klinis. Model anatomi berbasis satu subjek pria dewasa dan
> tidak merepresentasikan variasi anatomis populasi.
