# Pipeline data BodyParts3D → aset web

Skrip offline (Python). **Tidak masuk bundle.** Jalankan sekali; hasilnya masuk
`public/data/`.

```bash
pip install -r scripts/requirements.txt
npm run data:download   # sekali saja — 200 MB dari DBCLS
npm run data:build      # 02 -> 03 -> 04 -> 05, ~3,5 menit
npm run test:data       # 3 test suite
```

---

## Format file sumber — TERVERIFIKASI, bukan tebakan

PRD §6.1 melarang mengasumsikan format file teks ini. Bagian ini ditulis setelah
mengunduh dan menginspeksi isi sebenarnya pada **7 September 2026**, dan
dikonfirmasi silang dengan `README_e.html` resmi DBCLS.

**Berlaku untuk semua 6 file teks:** encoding **UTF-8**, newline **LF**,
delimiter **TAB**, dan **baris pertama adalah header kolom** (harus di-skip saat
parsing).

### `isa_parts_list_e.txt` (125,1 KB, 2.906 baris) · `partof_parts_list_e.txt` (58,0 KB, 1.369 baris)

3 kolom: `concept id` ⇥ `representation id` ⇥ `en`

```
concept id	representation id	en
FMA3710	BP8338	vascular tree
FMA3736	BP10329	ascending aorta
```

`concept id` = FMA ID. `representation id` = ID representasi 3D (`BP####`).
⚠️ `representation id` **bukan** nama file mesh — lihat `element_parts` di bawah.

### `isa_element_parts.txt` (1,1 MB, 29.550 baris) · `partof_element_parts.txt` (635,9 KB, 17.944 baris)

3 kolom: `concept id` ⇥ `name` ⇥ `element file id`

```
concept id	name	element file id
FMA3710	vascular tree	FJ2925
FMA3710	vascular tree	FJ2933
```

**Ini jembatan konsep → mesh.** Relasi many-to-many: satu konsep bisa punya
banyak elemen, dan satu elemen bisa dipakai beberapa konsep.

⚠️ **Fakta struktural paling penting dari dataset ini:** hanya organ **ELEMENT**
yang punya polygon mesh. Organ **COMPOUND** didefinisikan sebagai gabungan
element dan **tidak punya file mesh sendiri**. File ini yang mendefinisikan
gabungan tersebut. Konsekuensinya: geometri di-index per `FJ####`, sedangkan
struktur yang ditampilkan ke user bisa berupa konsep COMPOUND yang memetakan ke
beberapa `FJ`.

### `isa_inclusion_relation_list.txt` (202,8 KB, 2.905 baris) · `partof_inclusion_relation_list.txt` (89,1 KB, 1.368 baris)

4 kolom: `parent id` ⇥ `parent name` ⇥ `child id` ⇥ `child name`

```
parent id	parent name	child id	child name
FMA3734	aorta	FMA3736	ascending aorta
```

Hierarki antar-konsep FMA. Keduanya ternyata **tree murni dengan satu root**
(tidak ada parent ganda): part-of berakar di `FMA20394` "human body", is-a di
`FMA62955` "anatomical entity".

⚠️ PRD §6.2 mengira tree **part-of** adalah sumber `systemId`. Terukur, itu
tidak jalan — cakupannya cuma 56,3% dan ambigu. Yang dipakai: **is-a untuk
`systemId`, part-of untuk `regionId`.** Alasan lengkap di D-007.

### Mesh OBJ

| Arsip | File `.obj` | Ukuran arsip |
|---|---|---|
| `isa_BP3D_4.0_obj_99.zip` | **2.234** | 136,3 MB |
| `partof_BP3D_4.0_obj_99.zip` | **1.258** | 61,9 MB |

⚠️ **Set `partof` adalah subset penuh dari `isa`** — 1.258 dari 1.258 `FJ` id-nya
ada di `isa`, dan tidak ada satu pun yang eksklusif. `isa` punya 976 mesh
tambahan.
**Konsekuensi: pakai `isa` sebagai satu-satunya sumber geometri.** Tabel teks
`partof_*` tetap dipakai, tapi hanya untuk `regionId`, bukan mesh. Ini menghemat
62 MB unduhan mesh yang redundan dan menghindari duplikasi `structureIdx`.

File dinamai per element file id: `FJ1252.obj`. Total terekstrak 664,9 MB.

Setiap file punya header komentar yang dapat di-parse:

```
#
# The license for this database is specified in the Creative Commons Attribution-Share Alike 2.1 Japan. ...
# http://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
#
#
# Compatibility version : 4.0
# File ID : FJ1252
# Representation ID : BP5633
# Build-up logic : FMA 3.0 is_a
# Concept ID : FMA59763
# English name : Gingiva of upper jaw
# Bounds(mm): (-35.461100,-181.682000,1461.347400)-(34.135000,-127.714200,1479.842700)
```

Header ini menyediakan `Concept ID` (FMA), `English name`, dan **bounding box
siap pakai** — `03_decimate.py` tidak perlu menghitung bbox dari nol.

⚠️ Klaim lisensi di header bertentangan dengan halaman lisensi resmi. Lihat
[`ATTRIBUTION.md`](../ATTRIBUTION.md).

Geometri: `v` (posisi), `vn` (normal), `f` (face). Normal **tersedia**, tidak
perlu direkonstruksi.

---

## Fakta geometri terukur (isa, mentah, sebelum decimation)

| Metrik | Nilai |
|---|---|
| Total segitiga | **6.681.030** |
| Total vertex | **4.209.773** |
| Mesh dengan 0 segitiga | **0** |
| Bounding box X (lebar) | −334,1 .. 332,8 mm → **666,9 mm** |
| Bounding box Y (tebal) | −246,8 .. 45,2 mm → **292,0 mm** |
| Bounding box Z (tinggi) | −78,1 .. 1651,6 mm → **1729,7 mm** |

**Satuan milimeter. Sumbu Z ke atas. Origin tidak di pusat tubuh** (Z berjalan
0→1651, kira-kira dari telapak kaki ke ubun-ubun). `04_pack_batches.py` perlu
menerjemahkan ke konvensi viewer (three.js Y-up, model ter-center).

**Implikasi budget PRD §6.2:** target 2,5–3,5 juta segitiga berarti decimation
**~50%** dari 6,68 juta. Longgar — tidak perlu agresif, jadi struktur halus bisa
diselamatkan lewat `importance_multiplier`.

**Implikasi kuantisasi PRD §5.3.1:** dengan Int16 pada rentang terpanjang
(1729,7 mm), satu langkah = 1729,7 / 65.535 = **0,0264 mm**. Error round-trip
maksimum ≈ 0,013 mm — jauh di bawah ambang 0,5 mm di PRD §11.1. Kuantisasi Int16
aman, bahkan tanpa memecah skala per-batch.

---

## Status skrip

| Skrip | Status |
|---|---|
| `01_download.py` | ✅ selesai & terjalankan |
| `02_parse_ontology.py` | ✅ selesai & terjalankan — 2.234 struktur, 100% terklasifikasi |
| `03_decimate.py` | ✅ selesai & terjalankan — 6,68 jt → 3,03 jt segitiga |
| `04_pack_batches.py` | ✅ selesai — 33 batch, 18,9 MB Brotli |
| `05_validate.py` | ✅ selesai — 11 kasus rusak terbukti tertangkap |

### Catatan `04_pack_batches.py`

**Konversi koordinat.** BP3D: mm, Z-up, origin di telapak kaki, **anterior = −Y**
(terukur: corpus sterni Yc = −189,5 vs os sacrum Yc = −37,1). three.js: m, Y-up,
+Z ke penonton, ter-center.

    X' = X    Y' = Z    Z' = −Y    lalu /1000, lalu center

Determinan matriks itu **+1**, jadi handedness terjaga dan **winding face tidak
perlu dibalik**. Sisi kanan pasien ada di X negatif ("Right femur" Xc = −91),
sehingga dilihat dari +Z sisi kanan pasien muncul di kiri layar — konvensi
menghadap pasien.

**Ukuran batch — jawaban terukur untuk §5.3.1.** PRD mencatat index buffer justru
dominan dan menawarkan mitigasi (a): pecah batch < 65.536 vertex supaya index
muat Uint16. Terukur:

| | ukuran |
|---|---|
| index Uint32 | 34,6 MB |
| **index Uint16** | **17,3 MB** |
| atribut (10 B/vertex) | 14,5 MB |

Mitigasi (a) dipakai: **33 batch, semua index Uint16**. Draw call ~66 untuk 2
pass — di atas perkiraan §5.3.4 (~30), tapi jauh di bawah 2.234 yang dihindari.
`--max-verts 0` memberi satu batch per sistem (Uint32) sebagai pembanding.

**Hasil:**

| metrik | nilai | budget PRD |
|---|---|---|
| batch | 33 | — |
| segitiga | 3.027.112 | 2,5–3,5 jt ✅ |
| vertex | 1.516.021 | — |
| geometri mentah | 32,2 MB | — |
| **total Brotli** | **18,9 MB** | < 60 MB ✅ |
| payload awal (skeletal + kulit) | 2,2 MB | < 12 MB ✅ |
| error kuantisasi posisi | **0,0132 mm** | < 0,5 mm ✅ |
| error oct-encode normal | **0,948°** | — |

⚠️ **Dua bug encoding yang tertangkap saat pengukuran** (dan kenapa error
round-trip wajib diukur, bukan diasumsikan):

1. **`np.sign(0) == 0` merusak lipatan oktahedral.** Normal hemisfer bawah yang
   salah satu komponennya tepat nol ter-encode salah — `[0,0,-1]` identik dengan
   `[0,0,+1]`, error **180°**. Normal acak nyaris tak pernah kena (nol eksak itu
   measure-zero), tapi mesh anatomi penuh face datar sumbu-sejajar. Perbaikan:
   `signNotZero`, yang memetakan 0 ke +1. **Shader Fase 1 WAJIB memakai konvensi
   yang sama.**
2. **Normal nol-panjang** pada 2 dari 1,5 juta vertex (m. semispinalis capitis
   kiri & kanan) — normal face-nya saling meniadakan. Sisa error 90°. Perbaikan
   di `03_decimate.py`: fallback ke arah centroid→vertex.

### Catatan `05_validate.py`

Gerbang §11.3. `npm run validate`. Selain memeriksa data nyata, ada uji negatif
`tests/data/test_validator.py` yang menyalin `public/data`, **merusaknya dengan
11 cara berbeda**, dan memastikan validator menolak tiap kasus — sebab validator
yang cuma pernah bilang LULUS tidak membuktikan apa pun:

sha256 berubah · file terpotong · MAGIC salah · struktur hilang dari
structures.json · nama Inggris kosong · nama berisi teks header `.obj` ·
struktur 0 segitiga · aset lewat budget · catatan klinis tanpa `source` · soal
quiz menunjuk struktur tanpa nomenklatur `reviewed` · soal quiz menunjuk FMA
yang tidak ada.

File konten yang belum ada (nomenclature/clinical/quiz) dilewati dengan catatan,
bukan diloloskan diam-diam — aturannya langsung berlaku begitu file muncul.

### Catatan `03_decimate.py`

6.681.030 → **3.027.112 segitiga (45,3%)**, di dalam target PRD 2,5–3,5 juta.
2.234 file `.npz` di `data_interim/mesh/`, total **47,5 MB**. Waktu proses ~15 s
(multiproses).

`base_tri` **tidak dihardcode** — dicari lewat bisection supaya total mendarat
di target. Begitu `data_curated/high_yield.json` diisi nanti, angkanya
menyesuaikan sendiri; cukup jalankan ulang 03 (menit, bukan jam).

Dependensi: `numpy`, `trimesh`, `fast-simplification` — **semua terpasang di
Python 3.13 tanpa `pymeshlab`**, jadi risiko D-004 gugur.

#### Skor kualitas mesh

⚠️ Versi pertama metrik ini **salah** dan sempat lolos: skornya median 1,00
dengan nol struktur di bawah 0,5, padahal PRD R2 memprediksi mutu buruk dengan
probabilitas tinggi. Dua sebabnya:

1. **Dihitung setelah decimation** — jadi mengukur pilihan budget kita sendiri,
   bukan mutu dataset. Sekarang dihitung pada mesh sumber yang sudah
   dibersihkan, sebelum decimation.
2. **Fragmentasi diukur pakai rasio luas saja** — mesh dengan satu blob besar
   plus 562 serpihan tetap skor ~1,0. Sekarang jumlah komponen ikut dihitung.

Setelah diperbaiki, yang skornya terendah persis yang diperingatkan PRD R2:

| skor | struktur |
|---|---|
| 0,55 | Set of palmar interossei of right/left hand (29 komponen) |
| 0,56 | Medial branch of left/right pontine artery |
| 0,57 | Set of dorsal interossei of hand (126 komponen) |
| 0,60 | Fourth lumbrical of foot · Right lacrimal canaliculus |
| 0,62 | Short ciliary nerve · Obturator externus |

Yaitu: otot kecil tangan/kaki, pembuluh distal, saraf halus. Sebaran terukur:

| persentil | skor |
|---|---|
| p1 | 0,630 |
| p5 | 0,691 |
| p25 | 0,750 |
| p50 | 0,843 |
| p95 | ~0,99 |

📌 **Ambang 0,4 / 0,5 di §E10 AC13 tidak cocok dengan skala ini** — keduanya
mengecualikan **nol** struktur, jadi aturan integritas quiz itu tidak berfungsi.
Ambang tersebut ditulis di PRD sebelum ada pengukuran. Perlu diputuskan: patok
ulang ke persentil (p5 = 0,691 → 112 struktur; p10 = 0,750 → 191 struktur) atau
ubah skala metriknya. Lihat D-011.

441 dari 2.234 mesh punya lebih dari satu komponen terpisah; yang terparah
563 komponen. Komponen dengan volume < 0,1% dibuang saat pembersihan.

### Catatan `02_parse_ontology.py`

Menghasilkan `data_interim/structures_raw.json` (2,3 MB): 2.234 struktur +
1.441 konsep COMPOUND sebagai grup.

**Unit struktur = mesh ELEMENT (`FJ####`), bukan konsep FMA.** §5.3.1 menaruh
satu `aStructureIdx` per vertex, jadi struktur wajib berupa partisi geometri.
Konsep FMA tidak memenuhi itu (satu konsep bisa memuat banyak elemen, satu
elemen dipakai banyak konsep), sedangkan elemen memenuhi. Konsep COMPOUND
disimpan terpisah sebagai grup untuk tree & search.

**systemId dari tree IS-A, bukan part-of** (alasan di D-007). Cakupan 100%:

| systemId | struktur | % |
|---|---:|---:|
| systema_cardiovasculare | 1.057 | 47,3 |
| systema_musculare | 440 | 19,7 |
| systema_skeletale | 206 | 9,2 |
| systema_nervosum | 147 | 6,6 |
| systema_digestorium | 134 | 6,0 |
| systema_respiratorium | 126 | 5,6 |
| systema_articulare | 49 | 2,2 |
| organa_sensuum | 33 | 1,5 |
| integumentum_commune | 18 | 0,8 |
| systema_genitale | 12 | 0,5 |
| systema_urinarium | 6 | 0,3 |
| glandulae_endocrinae | 3 | 0,1 |
| systema_lymphoideum | 3 | 0,1 |

⚠️ Dataset ini **sangat timpang**: hampir separuh struktur adalah pembuluh
darah, sementara sistem endokrin dan limfoid praktis kosong (hanya hypophysis,
gl. suprarenalis, lien, thymus). Jangan janjikan cakupan yang tidak ada —
ini batas BP3D, bukan bug. `systema_urinarium` hanya 6 struktur.

**regionId dari part-of + fallback geometris:**

| sumber | struktur | keandalan |
|---|---:|---|
| `part-of` | 864 | ontologis, tepercaya |
| `part-of+promontorium` | 11 | ontologis + 1 landmark |
| `geometris` | 1.359 | **tebakan spasial, keyakinan rendah** |

BP3D tidak punya node regio "pelvis" — os coxae & os sacrum masuk "abdominal
segment of trunk". Dipisah di promontorium (L5, Z = 929,7 mm).

Ambang geometris diturunkan dari **landmark terukur di dataset**, bukan angka
karangan: mandibula, os hyoideum, clavicula, vertebra T12 & L5, os coxae.
Viscera dinilai terhadap kubah diafragma (Z 1150) alih-alih T12 (Z 1075),
karena lien (Zc 1086,7) dan ren (Zc 1019,0) secara geometris "torakal" tapi
secara anatomis abdominal.

⚠️ **Bug yang sempat lolos:** 17 file `.obj` punya `# English name :` dan
`# Concept ID :` KOSONG. Regex awal memakai `\s*` yang ikut menelan newline,
sehingga melompat ke baris berikutnya dan memungut `# Bounds(mm): ...` sebagai
nama struktur. Pola sekarang dibatasi per baris (kelas karakter yang menolak
CR dan LF), dan identitas
ke-17 mesh itu dipulihkan dari tabel is-a (konsep terdalam yang merujuk elemen
tersebut) — mis. FJ1451 → `FMA9756 external intercostal muscle`. Ada invarian
regresi di test suite.

**Validasi:** `tests/data/test_classification.py` menguji 23 struktur yang
diketahui — saat ini **23/23 sistem dan 23/23 regio benar**, plus invarian
(structureIdx rapat 0..N-1, tidak ada mesh 0 segitiga, tidak ada
`non_classificatum`). Jalankan setiap kali RULES diubah.

⚠️ Lulus 23/23 pada set uji **bukan** berarti 2.234 struktur semuanya benar.
Yang bersumber `geometris` (61%) tetap keyakinan rendah dan sebaiknya
ditampilkan/di-filter dengan jujur di UI.

### Catatan `01_download.py`

- URL: `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/`.
  Tebakan awal `.../20110915/` (dari pola arsip) **404** — dikoreksi setelah
  membaca halaman unduhan resmi.
- DBCLS tidak mempublikasikan checksum resmi. Skrip menghitung SHA-256 sendiri
  dan menyimpannya di `data_raw/download_manifest.json` supaya unduhan
  berikutnya bisa dibandingkan (deteksi aset basi, PRD §11.3).
- Ukuran tiga file `part-of` di PRD §6.1 terlalu besar; nilai di skrip mengikuti
  README resmi (58 KB / 654 KB / 90 KB).
- Flag: `--inspect-only`, `--no-extract`, `--force`, `--only NAMA`.
