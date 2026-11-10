# `data_curated/` — keputusan manusia

Folder ini **dilacak git** dan berisi hal-hal yang TIDAK bisa dihasilkan mesin.
Semua yang ada di `public/data/` adalah keluaran pipeline dan dibangun ulang
tiap `npm run data:build`; yang ada di sini adalah masukannya.

| Berkas | Isi | Dipakai oleh |
|---|---|---|
| `nomenclature_reviews.json` | Buku besar review nomenklatur: istilah Latin/Indonesia yang sudah diperiksa manusia, dengan nama reviewer, tanggal, dan sumber | `06_nomenclature.py` (overlay), validator |
| `nomenclature_draft.tsv` | Draf ~1.100 istilah Latin dari ingatan model bahasa. **Bukan review**: keluar sebagai `source: llm`, tetap berbadge (D-045) | `06_nomenclature.py` |
| `high_yield.json` | Daftar FMA struktur high-yield (D7). **Belum ada** — lihat `high_yield.example.json` | `03_decimate.py` (bobot), `07_review_nomenclature.py` (prioritas), quiz F7 |

## Mereview nomenklatur

Alurnya dirancang untuk ratusan entri, lewat spreadsheet:

```bash
# 1. ekspor lembar review (needs-review dulu, lalu machine, lalu tanpa entri)
python scripts/07_review_nomenclature.py sheet --lang la --out review-la.tsv

# 2. buka review-la.tsv di Excel / Google Sheets, isi kolom `decision`:
#      ok    istilah mesin sudah benar
#      fix   salah — tulis yang benar di `corrected_term`
#      skip  (atau kosong) belum diputuskan
#    kolom `source` boleh kosong (= curated) atau TA98 / TA2 / FMA

# 3. terapkan — nama reviewer WAJIB, masuk ke field reviewedBy
python scripts/07_review_nomenclature.py apply review-la.tsv --by "Nama Lengkap"

# 4. lihat cakupan vs §E7 AC6
python scripts/07_review_nomenclature.py status
```

`apply` menolak **seluruh** berkas kalau ada satu baris yang ambigu (`ok` tanpa
istilah, `fix` tanpa koreksi, FMA ganda, sumber tak dikenal). Mengimpor separuh
berarti kamu mengira 200 entri masuk padahal 180 — dan yang 20 tidak akan
pernah dicari lagi.

Untuk satu koreksi cepat tanpa sheet:

```bash
python scripts/07_review_nomenclature.py add --fma FMA8717 --lang la \
  --term "Arteria segmentalis basalis anterior" --source TA2 --by "Nama Lengkap"
```

## Yang TIDAK dilakukan alat ini

Ia tidak menebak dan tidak menyarankan terjemahan. Keputusannya milik reviewer;
alat ini hanya memastikan keputusan itu tercatat dengan nama, tanggal, dan
sumber — lalu **tidak pernah hilang** saat pipeline jalan.

⚠️ Jangan pernah mengedit `public/data/content/nomenclature.*.json` langsung.
Pipeline berikutnya menghapusnya tanpa jejak.
