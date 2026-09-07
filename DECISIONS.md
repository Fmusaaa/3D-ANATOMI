# Catatan Deviasi & Keputusan

PRD §0: "Kalau ada konflik antara PRD dan kenyataan teknis di lapangan, kenyataan
menang — tapi update PRD-nya, jangan diam-diam menyimpang." File ini catatannya.

---

## D-001 — Versi toolchain lebih baru dari target PRD §5.1

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diterima

PRD §5.1 menargetkan Vite 6.x dan TypeScript 5.6+. Yang terpasang dari
`npm create vite@latest` per hari ini:

| Layer | Target PRD | Terpasang | Keputusan |
|---|---|---|---|
| Vite | 6.x | **8.2.2** | Pakai 8. Tidak ada fitur PRD yang bergantung ke API Vite 6. |
| TypeScript | 5.6+ | **6.0.2** | Memenuhi "5.6+". |
| React | 19.x | 19.2.8 | Sesuai. |
| Node | 22.13+ | 22.18.0 | Sesuai. |
| Tailwind | 4 | 4.x | Sesuai. |

**Konsekuensi TS 6:** opsi `baseUrl` sudah deprecated dan bikin `tsc -b` gagal.
Path alias `@/*` sekarang dideklarasikan lewat `paths` saja di
`tsconfig.app.json` (relatif ke file config). `baseUrl` tetap ada di
`tsconfig.json` root **khusus supaya CLI shadcn bisa resolve alias** — tanpa itu
shadcn menulis komponen ke direktori literal bernama `@/`.

## D-002 — ESLint 9, bukan 10

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diterima, tinjau ulang di F8

PRD §5.5 mewajibkan enforcement batas modul lewat `import/no-restricted-paths` —
rule dari `eslint-plugin-import`. Versi terbarunya (2.32.0) peer-dep-nya baru
sampai ESLint 9, sedangkan ESLint 10 sudah rilis dan npm menandai 9 sebagai
"no longer supported".

Keputusan: **tetap di ESLint 9** karena aturan batas modul itu P0 di PRD dan
enforcement-nya lebih penting daripada nomor versi linter. Tinjau ulang saat
`eslint-plugin-import` mendukung ESLint 10.

## D-003 — Scaffold Vite ship `oxlint`, diganti ESLint

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diterima

Template `react-ts` sekarang memasang `oxlint`, bukan ESLint. PRD §5.5 dan §14.1
secara eksplisit menyebut rule `import/no-restricted-paths`. `.oxlintrc.json`
dihapus dan diganti ESLint flat config.

Aturan batas modul sudah **diverifikasi menggigit** (bukan cuma dikonfigurasi):
file probe yang meng-import `react` dari `src/viewer/`, meng-import
`src/components` dari `src/viewer/`, dan meng-import `three` secara nilai dari
`src/components/` — ketiganya menghasilkan error. Probe dihapus setelah tes.

## D-004 — Python 3.13, bukan 3.11

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** ⚠️ risiko terbuka

PRD §5.1 menargetkan Python 3.11 untuk pipeline. Yang tersedia di mesin: 3.13.7.

`trimesh` dan `numpy` aman di 3.13. **`pymeshlab` yang berisiko** — wheel-nya
sering telat mendukung versi Python terbaru. `fast-simplification` juga perlu
dicek. Kalau `pip install` gagal di F0 langkah decimation, opsinya:
1. pakai `fast-simplification` saja (murni, tanpa pymeshlab), atau
2. pasang Python 3.11 berdampingan khusus untuk pipeline.

Belum diputuskan — baru relevan saat `03_decimate.py` (setelah data terunduh).

---

## Keputusan terbuka dari PRD §13 (belum jatuh tempo)

| # | Keputusan | Deadline | Status |
|---|---|---|---|
| D1 | Nama & domain proyek | Sebelum F1 | Default `corpus` dipakai di `package.json` |
| — | Target deploy | F9 | **Diputuskan: Vercel** (D-009) |
| D2 | `THREE.BatchedMesh` vs shader custom | F1 | **Diputuskan: shader custom** (D-013) |
| D5-a | index Uint16 vs Uint32 (§5.3.1) | F0 | **Diputuskan: Uint16** — hemat 17,3 MB (D-012) |
| D3 | FSRS vs SM-2 | F7 | Belum |
| D4 | Nomenklatur Latin: Z-Anatomy vs kurasi manual | Sebelum F5 | Belum |
| D5 | LOD dua tier atau satu | F1 | Belum |
| D6 | Lisensi konten terkurasi | F9 | Belum |
| D7 | Siapa penentu daftar "high-yield" | F0 | **Diputuskan: pakai default** — tanpa pembobotan (D-010) |
| — | Lisensi BodyParts3D (CC BY 4.0 vs CC BY-SA 2.1 JP) | F0, sebelum deploy | **Diverifikasi — dan ternyata BENAR-BENAR bertentangan.** Lihat D-005 |

## D-005 — Lisensi BodyParts3D: dua klaim resmi yang bertentangan

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** ⚠️ TERBUKA, blocker deploy publik

R1 di PRD menduga "sumber yang beredar menyebut dua hal berbeda". Verifikasi
langsung ke sumber resmi mengonfirmasi dugaan itu, dan konfliknya **bukan antara
klon komunitas vs repo referensi** seperti dugaan PRD — melainkan **di dalam
publikasi DBCLS sendiri**:

- `lic.html` resmi (diperbarui 2025-02-27) → **CC BY 4.0**
- `README_e.html` resmi (diperbarui 2025-02-25) → **CC BY 4.0**
- Header komentar di **2.234 dari 2.234** file `.obj` → **CC BY-SA 2.1 Japan**

Bukti diarsipkan di `docs/licenses/`. Analisis lengkap dan rekomendasi ada di
`ATTRIBUTION.md`.

Rekomendasi implementor: email DBCLS untuk penegasan tertulis; sampai ada
balasan, perlakukan data turunan sebagai CC BY-SA dan pisahkan repo data dari
repo kode. **Keputusan ada di product owner — belum diambil.**

## D-006 — Sumber geometri: pakai tree `isa` saja, bukan keduanya

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diusulkan, perlu konfirmasi

PRD §6.1 mendaftar kedua arsip mesh (`isa` 136 MB + `partof` 62 MB) seolah
keduanya sumber geometri. Pengukuran menunjukkan **set `partof` adalah subset
penuh dari `isa`**: 1.258 dari 1.258 file `FJ` di `partof` juga ada di `isa`,
nol yang eksklusif; `isa` punya 976 mesh tambahan.

Usulan: ambil geometri **hanya dari `isa`**, dan pakai file teks `partof_*`
hanya untuk hierarki/`systemId` (§6.2). Menghindari 976 struktur hilang sekaligus
mencegah duplikasi `structureIdx`.

## D-007 — systemId dari tree IS-A, regionId dari part-of (§6.2 dibalik)

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diterapkan, perlu konfirmasi

PRD §6.2 menginstruksikan "tentukan systemId tiap struktur dari hierarki
part-of". Diukur, itu tidak bisa dilakukan:

- tree part-of hanya merujuk **1.258 dari 2.234** mesh (cakupan 56,3%)
- **958** dari 1.258 itu jatuh di bawah lebih dari satu node teratas → ambigu
- 19 anak teratas "human body" **bukan** 15 sistem seperti dugaan §6.5;
  isinya campuran sumbu sistem (cardiovascular, nervous, …) dan sumbu regio
  (head, right upper limb, body proper, …)

Tree is-a merujuk seluruh 2.234 mesh dan mengklasifikasikan menurut TIPE organ
(bone organ, muscle organ, region of vascular tree organ …) — dan tipe itulah
yang sebenarnya memetakan ke "sistem".

Maka sumbu dipisah: **systemId ← is-a** (cakupan 100%), **regionId ← part-of +
fallback geometris**. Hasil & validasi di `scripts/README.md`.

Konsekuensi untuk §6.5: taksonomi 15 sistem di PRD tidak semuanya terwujud.
Yang ada 13; `systema_articulare` dan `viscera`/`topographia` tidak berdiri
sendiri, dan endokrin/limfoid nyaris kosong di BP3D.

## D-008 — Unit struktur = mesh ELEMENT, bukan konsep FMA

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diterapkan

§5.3.1 menaruh satu `aStructureIdx` per vertex, jadi struktur wajib berupa
partisi geometri. Konsep FMA tidak memenuhi (many-to-many dengan mesh); mesh
ELEMENT memenuhi. Jadi: **2.234 struktur = 2.234 mesh**, dan 1.441 konsep
COMPOUND disimpan sebagai *grup* untuk tree & search.

## D-009 — Deploy Vercel; progres belajar TIDAK ikut sinkron

**Tanggal:** 7 September 2026 · **Fase:** F0 (dicatat awal) · **Status:** diputuskan sebagian

Product owner: aplikasi ini untuk dipakai sendiri, tapi harus bisa diakses dari
semua perangkat. Target deploy: **Vercel** (statis), sesuai §5.1.

⚠️ **Yang ini perlu diluruskan supaya tidak salah harap:** Vercel bikin
*aplikasinya* bisa dibuka dari mana saja, tapi **tidak** bikin progres belajar
ikut pindah. Vercel hosting statis — tidak menyimpan data per-user. Kartu SRS
tetap di IndexedDB browser masing-masing perangkat (§E10 AC10), jadi belajar di
laptop lalu buka di HP = dua progres terpisah.

Untuk alat spaced repetition ini merusak fungsi inti: kartu yang sudah dikuasai
di satu perangkat muncul lagi sebagai kartu baru di perangkat lain.

Pilihan (belum diputuskan, jatuh tempo F7):
1. terima terpecah + ekspor/impor JSON manual (sesuai PRD apa adanya)
2. belajar di satu perangkat saja; perangkat lain read-only — nol backend
3. sinkron lewat satu blob JSON di penyimpanan cloud — melanggar non-goal §4.2

Tidak memblokir F0–F6. Yang penting F7 dirancang sadar soal ini.

Catatan kapasitas: total aset < 60 MB (§5.4) perlu dicek terhadap batas
deployment Vercel di F9; §5.1 sudah menyiapkan opsi CDN eksternal kalau mepet.

## D-010 — Daftar high-yield: pakai default (tanpa pembobotan)

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diputuskan

D7 diputuskan "pakai default": `importance_multiplier = 1,0` untuk semua
struktur. `03_decimate.py` membaca `data_curated/high_yield.json` kalau file itu
ada; selama belum ada, semua struktur berbobot sama.

Ini aman karena total mentah 6,68 juta segitiga vs target ~3 juta hanya butuh
reduksi ~50% — longgar, jadi struktur halus tidak hancur walau tanpa
pembobotan. `base_tri` dicari otomatis lewat bisection, jadi begitu
`high_yield.json` diisi nanti, angkanya menyesuaikan sendiri tanpa perlu
mengubah kode.

⚠️ Konsekuensi: menambahkan daftar high-yield belakangan **mengharuskan
`03_decimate.py` dijalankan ulang** (dan 04 sesudahnya). Bukan masalah —
prosesnya menit, bukan jam.

## D-011 — Ambang meshQuality dipatok di persentil 5

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** ✅ DIPUTUSKAN — p5

§E10 AC13 mengecualikan struktur dengan `meshQuality < 0,4` dari soal
`name-to-structure`, dan §E3 AC4 menampilkan peringatan kalau `< 0,5`.

Setelah metrik diperbaiki dan diukur pada 2.234 struktur, sebarannya:
p1 = 0,630 · p5 = 0,691 · p50 = 0,843 · p95 ≈ 0,99.

**Kedua ambang itu mengecualikan NOL struktur**, jadi aturan integritas quiz
tidak berfungsi sama sekali. Angka 0,4/0,5 ditulis di PRD sebelum ada
pengukuran apa pun.

Pilihan:
1. patok ulang ke persentil — p5 = 0,691 (112 struktur) atau p10 = 0,750 (191)
2. regangkan skala metrik supaya tersebar 0–1 penuh
3. biarkan, terima bahwa aturan itu tidak pernah aktif (tidak disarankan —
   §E10 AC13 ada alasannya: tidak adil menyuruh mengklik mesh rusak)

**Diputuskan: opsi 1, ambang p5.** Diimplementasikan di `04_pack_batches.py`
sebagai `QUALITY_EXCLUDE_PERCENTILE = 5.0`, **dihitung dari sebaran nyata saat
pack**, bukan dihardcode — supaya tidak jadi angka ajaib yang basi kalau dataset
berubah. Nilainya ditulis ke `manifest.json` dan `structures.json` sebagai
`meshQualityExcludeBelow` (saat ini **0,691**, mengecualikan **112 struktur**).

`05_validate.py` gagal kalau ambang itu mengecualikan nol struktur — supaya
aturan §E10 AC13 tidak diam-diam mati lagi.

## D-012 — Index Uint16 lewat pemecahan batch (mitigasi §5.3.1 opsi a)

**Tanggal:** 7 September 2026 · **Fase:** F0 · **Status:** diterapkan

§5.3.1 mencatat index buffer justru dominan dan menawarkan dua mitigasi.
Terukur pada dataset final (1.516.021 vertex, 3.027.112 segitiga):

| | ukuran mentah |
|---|---|
| index Uint32 | 34,6 MB |
| index Uint16 | 17,3 MB |
| atribut | 14,5 MB |

Dipakai **opsi (a)**: batch dipecah maksimal 65.536 vertex → 33 batch, semua
index Uint16. Biayanya draw call naik ke ~66 (2 pass), di atas perkiraan
§5.3.4 (~30) tapi jauh di bawah 2.234 yang dihindari §5.3.

Opsi (b) (reorder `meshoptimizer` sebelum kompresi) **belum dicoba** — belum
perlu, karena total Brotli sudah 18,9 MB vs budget 60 MB. Kalau nanti draw call
jadi masalah di F1, opsi (b) + Uint32 + batch per sistem adalah jalur mundurnya.

Bandingkan sendiri dengan `python scripts/04_pack_batches.py --max-verts 0`.

## D-013 — D2: shader custom + state texture, bukan THREE.BatchedMesh

**Tanggal:** 7 September 2026 · **Fase:** F1 · **Status:** diputuskan dari pengukuran

§14.3 mewajibkan spike pengukuran sebelum menulis renderer. Diukur pada data
Fase 0 yang sebenarnya (33 batch, 2.234 struktur, 3.027.112 segitiga),
viewport 1440x900, tanpa antialias tambahan.

⚠️ **Mesin uji: laptop RTX 4050, BUKAN MacBook Air M4 dan bukan HP kelas
menengah.** Target §E11 (>=55 FPS di MacBook Air M4, >=30 FPS di HP mid-range)
**belum terverifikasi** dan tidak boleh diklaim dari angka ini.

| | A: shader custom (2 pass) | A1: shader custom (opaque saja) | B: BatchedMesh |
|---|---|---|---|
| GPU/frame median | 2,43 ms | **2,30 ms** | **0,82 ms** |
| GPU/frame p95 | **4,05 ms** | 6,14 ms | 9,64 ms |
| GPU/frame terburuk | **4,6 ms** | 7,2 ms | 10,8 ms |
| draw call | 66 | **33** | **1** |
| geometri GPU | **31,8 MB** | **31,8 MB** | 69,3 MB |
| JS heap | 91,2 MB | **83,0 MB** | 153,4 MB |
| waktu build | 47 ms | **8 ms** | 742 ms |
| idle render | 0 | 0 | 0 |

**Performa bukan pembeda.** Ketiganya jauh di atas kebutuhan; bahkan frame
terburuk B (10,8 ms) masih setara ~92 fps. BatchedMesh menang di median tapi
kalah telak di ekor (p95 hampir 2,4x lebih lambat dari A) — dan ekor itulah
yang terasa sebagai stutter, bukan median.

**Yang menentukan adalah memori dan biaya muat:**

1. **Memori 2,2x lipat.** B butuh 69,3 MB geometri vs 31,8 MB, dan JS heap
   153 MB vs 83 MB. Di HP dengan `deviceMemory < 4` (§E11 AC4) selisih ini
   menentukan hidup-mati.
2. **BatchedMesh membatalkan seluruh desain kuantisasi §5.3.1/§6.3.** Dia
   menuntut geometri float32 terpisah per struktur, jadi atribut Int16 + oct
   normal Int8 yang susah payah dibuat di Fase 0 harus di-expand ke float di
   CPU. Akibatnya build 742 ms vs 8 ms — **90x lebih lambat**, dan itu masuk
   langsung ke metrik "waktu interaktif < 3,5 detik" (§E11).
3. **Keunggulan "idiomatis" B tidak bertahan.** Opacity per struktur,
   selectState, dan GPU picking tetap butuh shader custom. Begitu shader
   custom masuk, alasan memakai BatchedMesh habis — sementara biayanya tetap.

**Keputusan: pakai desain §5.3 (shader custom + state texture).** Ini juga
default D2 di PRD, sekarang dengan bukti, bukan asumsi.

**Catatan implementasi — pass transparan tidak boleh selalu menyala.** Varian A
merender 6.054.224 segitiga (2x) karena pass kedua tetap memproses seluruh
vertex lalu men-discard tiap fragmen. Saat tidak ada struktur transparan, pass
itu harus dilewati: A1 menunjukkan draw call turun 66 -> 33 dan heap 91 -> 83 MB.
Renderer final wajib melacak "ada struktur transparan?" dan melewati pass kedua
kalau tidak ada.

### Cara mengulang pengukuran

`npm run dev` lalu buka `/spike.html`. Hasil juga tersimpan di
`window.__SPIKE__`.

⚠️ **Metodologi — dua cara yang SALAH dan sudah terbukti salah:**

1. **requestAnimationFrame.** Tab tersembunyi meng-throttle rAF habis; sampel
   pertama menghasilkan FPS "Infinity". rAF juga terkunci vsync, jadi semua
   varian mentok 60 dan bedanya tak terlihat.
2. **`gl.finish()` + jam dinding.** Di ANGLE/D3D11 `finish()` tidak benar-benar
   menunggu GPU: hasilnya 0,40 ms untuk 6 juta segitiga (~15 Gtri/s), mustahil.

Yang dipakai: `EXT_disjoint_timer_query_webgl2` — nanodetik GPU sungguhan.
Semua query diterbitkan lebih dulu lalu dipanen sekali, karena tab tersembunyi
juga meng-clamp `setTimeout` ke >=1 detik.

## D-014 — Pass transparan dimatikan saat tidak ada struktur transparan

**Tanggal:** 7 September 2026 · **Fase:** F1 · **Status:** diterapkan

Tindak lanjut temuan D-013. `StateTexture` melacak berapa struktur yang
opacity-nya < 0,99, dan `BatchManager.syncTransparentPass()` menyalakan mesh
pass kedua hanya kalau jumlah itu > 0.

Terverifikasi di aplikasi: dengan semua struktur opaque, dev overlay menunjukkan
**33 draw call** (bukan 66) dan baris "pass transparan: mati".
