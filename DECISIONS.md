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

## D-015 — Menyembunyikan sistem TIDAK mengurangi beban vertex

**Tanggal:** 7 September 2026 · **Fase:** F2 (E4) · **Status:** batasan arsitektur yang diterima

Konsekuensi langsung desain §5.3.3 yang dipilih di D-013: struktur yang
tersembunyi di-cull dengan **melempar vertex-nya ke luar clip space di vertex
shader**, bukan dengan membangun ulang index buffer.

Artinya: preset "Kerangka" hanya menampilkan 255 dari 2.234 struktur, tapi GPU
tetap memproses seluruh **3.027.112** segitiga — `renderer.info.render.triangles`
tetap menunjukkan angka penuh. Yang hemat adalah fragmen (tidak ada yang
di-raster), bukan vertex.

Diterima karena:
- terukur 0,7–1,2 ms per frame di laptop uji; jauh dari jadi hambatan
- alternatifnya (membangun ulang index buffer tiap toggle) melanggar §5.2
  "geometri tidak pernah dibangun ulang saat runtime" dan bikin toggle terasa
  berat, padahal §E4 AC2 minta toggle berlaku ≤ 1 frame

⚠️ **Perlu diukur ulang di HP mid-range (§E11).** Kalau di sana biaya vertex
jadi hambatan, mitigasinya: pisahkan draw call per sistem (sudah begitu — 33
batch) lalu lewati `mesh.visible = false` untuk batch yang seluruh strukturnya
tersembunyi. Itu perbaikan lokal di `BatchManager`, bukan perubahan arsitektur.

## D-016 — Bug akuntansi transparansi

**Tanggal:** 7 September 2026 · **Fase:** F2 (E4) · **Status:** diperbaiki

`StateTexture` menghitung struktur transparan hanya dari opacity < 0,99. Setelah
sebuah sistem di-fade-out sampai opacity 0 lalu disembunyikan, struktur itu
selamanya masuk hitungan transparan — pass transparan tidak pernah mati lagi.

Terlihat di dev overlay: preset "Kerangka" menunjukkan **66 draw call dan
6.054.224 segitiga** padahal tidak ada satu pun struktur transparan.

Perbaikan: struktur dihitung transparan hanya kalau **terlihat DAN** opacity
< 0,99. Setelah diperbaiki, preset yang sama menunjukkan 33 draw call dan
3.027.112 segitiga. Preset dengan ghost (mis. "Organ dalam") memang tetap 66 —
di situ transparansinya nyata.

## D-017 — Struktur ghost dikecualikan dari picking

**Tanggal:** 7 September 2026 · **Fase:** F2 (E3) · **Status:** diterapkan

§E3 AC10 hanya mewajibkan struktur `visible = false` tidak bisa ter-pick.
Ditambahkan satu aturan lagi: struktur dengan opacity < 0,25 juga dikecualikan.

Alasannya praktis. Ghost mode (§E4 AC4) memakai opacity 0,12 untuk konteks
spasial — biasanya rangka. Kalau rangka samar itu ikut ter-pick, ia akan
mencuri setiap klik yang ditujukan ke organ di belakangnya, dan preset
"Organ dalam" jadi tidak bisa dipakai sama sekali.

Terverifikasi: pada preset "Organ dalam", klik di dada mengembalikan
`Hepatovenous segment V`, bukan tulang rusuk yang ada di depannya.

Ambangnya (`MIN_PICK_OPACITY = 0.25`) ada di `BatchManager.ts` dan disaring di
dalam shader picking, bukan di CPU — jadi mustahil melenceng dari apa yang
benar-benar terlihat.

## D-018 — Catatan uji: pane browser tersembunyi mematikan rAF

**Tanggal:** 7 September 2026 · **Fase:** F2 · **Status:** catatan metodologi

Muncul untuk KETIGA kalinya (spike D-013, verifikasi F1, lalu E3): saat pane
browser tersembunyi, `requestAnimationFrame` dan `setTimeout` di-throttle habis.

Konsekuensi khusus untuk pengujian visibilitas: fade 180 ms tidak pernah
selesai, jadi `visible = false` tidak pernah benar-benar diterapkan dan §E3 AC10
tampak GAGAL padahal tidak. Gejalanya `visibility.isAnimating === true` yang
menggantung.

Cara menguji dengan benar tanpa pane terlihat: tuntaskan animasi secara manual
lebih dulu —

    a.visibility.update(performance.now() + 10000)
    a.state.flush()
    a.batches.syncTransparentPass()

Jangan simpulkan AC gagal sebelum memastikan `isAnimating === false`.

## D-019 — Konsep COMPOUND ikut diterbitkan untuk pencarian

**Tanggal:** 7 September 2026 · **Fase:** F3 (E5) · **Status:** diterapkan

§E5 AC1 menargetkan index ~3.400 konsep, sedangkan mesh ELEMENT hanya 2.234.
Selisihnya adalah konsep COMPOUND yang sebelumnya berhenti di
`data_interim/structures_raw.json` dan tidak pernah sampai ke web.

`04_pack_batches.py` sekarang menerbitkannya sebagai `groups` di
`content/structures.json`. Index pencarian jadi **3.675 entri**.

Ini bukan sekadar mengejar angka. Orang mencari "aorta" — yang di BP3D adalah
COMPOUND dari 5 elemen, bukan satu mesh. Tanpa `groups`, query itu hanya
menemukan "Abdominal aorta"/"Ascending aorta" dan tidak pernah konsep induknya.

`structures.json` naik dari 0,49 MB ke 0,71 MB (Brotli 0,03 -> 0,05 MB).
Total aset tetap 19,0 MB.

## D-020 — Batas nyata BodyParts3D untuk user journey PRD

**Tanggal:** 7 September 2026 · **Fase:** F3 · **Status:** ⚠️ temuan produk, perlu keputusan

Saat menguji pencarian, ketahuan bahwa **dataset tidak memuat saraf perifer
ekstremitas sama sekali**:

- `sciatic` -> **0 struktur, 0 grup**
- saraf bernama di seluruh dataset: **34**, dan semuanya kranial/orbital
  (n. ethmoidalis, frontalis, oculomotorius, lacrimalis, nasociliaris,
  ophthalmicus, ...)
- tidak ada n. medianus, n. ulnaris, n. radialis, n. ischiadicus

Ini menabrak user journey PRD sendiri:

- **J1** mencontohkan "cari `nervus medianus`" — tidak akan pernah ketemu
- **J4** membangun skenario PBL lesi n. medianus di carpal tunnel — tidak bisa
  ditampilkan di 3D

Bukan bug pencarian, dan bukan sesuatu yang bisa diperbaiki dengan kode.
Ini batas dataset (§2.2 sudah memperingatkan mesh BP3D kasar di nervus kecil;
kenyataannya lebih keras — nervusnya tidak ada, bukan cuma kasar).

Pilihan (belum diputuskan, jatuh tempo sebelum F6):
1. terima, dan ubah contoh di PRD ke struktur yang benar-benar ada
2. cari sumber mesh tambahan untuk saraf perifer (mis. Z-Anatomy, D4) —
   menambah masalah lisensi dan registrasi koordinat
3. sediakan konten klinis untuk saraf tanpa geometri (teks saja, tanpa 3D)

Rekomendasi: opsi 1 untuk v1. Kekuatan dataset ini ada di kardiovaskular
(1.057 struktur), muskuloskeletal (646), dan viscera — arahkan fitur belajar
ke sana, dan jangan menjanjikan neuroanatomi perifer.

## D-021 — Bug index aktif tidak terjepit di daftar hasil

**Tanggal:** 7 September 2026 · **Fase:** F3 · **Status:** diperbaiki

Menyorot hasil ke-12 dengan mouse lalu mempersempit query sampai hasilnya
tinggal 3 membuat `hits[active]` menjadi `undefined`. Enter lalu diam total —
tanpa error, tanpa umpan balik. Dari sisi user terlihat seperti aplikasi hang.

Diperbaiki dengan menjepit index aktif ke panjang hasil saat ini
(`activeIndex`), bukan mengandalkan `setActive(0)` yang bisa didahului
`onMouseEnter`.

## D-022 — Hash URL ditulis dari aksi diskrit, bukan dari gerakan kamera

**Tanggal:** 7 September 2026 · **Fase:** F3 (E14) · **Status:** diterapkan

`location.hash` di-update saat terjadi aksi diskrit (pilih struktur, toggle
sistem, ganti preset, klik "Salin tautan") — **bukan** setiap frame kamera
bergerak.

Menulis hash 60x/detik saat orbit akan membanjiri riwayat browser dan membuat
tombol Back tidak terpakai. Posisi kamera tetap ikut terekam, karena dibaca
pada momen-momen diskrit itu. Konsekuensi jujurnya: orbit lalu langsung menyalin
tautan tetap benar (klik tombolnya sendiri memicu penulisan), tapi orbit lalu
menekan Back tidak mengembalikan sudut pandang sebelumnya.

Dipakai `history.replaceState`, bukan `pushState`: satu toggle sistem tidak
layak jadi entri riwayat tersendiri.

## D-023 — Sorotan preset diverifikasi terhadap state, bukan dipercaya dari URL

**Tanggal:** 7 September 2026 · **Fase:** F3 · **Status:** diperbaiki

Saat memulihkan deep link, `p=<preset>` sempat dipakai langsung untuk menyorot
tombol preset. Akibatnya tautan bisa menyorot "Semua" sementara yang benar-benar
tampil hanya organ dalam — tombolnya berbohong soal apa yang sedang dilihat.

Sekarang sorotan hanya diberikan kalau himpunan sistem yang dipulihkan
benar-benar cocok dengan definisi preset itu. Kalau tidak cocok, tidak ada yang
disorot. Bitmask sistem adalah sumber kebenaran; `p=` cuma petunjuk tampilan.

## D-024 — Clipboard bisa ditolak; URL selalu ada di address bar

**Tanggal:** 7 September 2026 · **Fase:** F3 · **Status:** diterapkan

`navigator.clipboard.writeText` bisa gagal (izin ditolak, konteks tidak aman,
browser lama). Terverifikasi gagal di lingkungan otomasi dengan
`NotAllowedError: Write permission denied`.

Karena `writeHash()` selalu memperbarui address bar lebih dulu, jalur mundurnya
nyata: toast mengarahkan user menyalin dari address bar, bukan sekadar
memberi tahu bahwa sesuatu gagal.

⚠️ **Jalur sukses tombol salin belum terverifikasi** — lingkungan uji memblokir
clipboard sepenuhnya. Perlu dicoba manual di browser biasa.

## D-025 — Nomenklatur diturunkan mekanis, SEMUANYA berstatus belum terverifikasi

**Tanggal:** 7 September 2026 · **Fase:** F5 (E7) · **Status:** infrastruktur selesai, konten menunggu review

PRD melarang menggenerasi konten massal dengan LLM lalu menerbitkannya, dan R5
menandai terjemahan salah sebagai risiko berdampak **sangat tinggi**. Jadi
pendekatan yang dipakai bukan "LLM menerjemahkan", melainkan **transformasi
deterministik yang bisa diaudit**:

- tabel kepala frasa dengan **genus** eksplisit (arteria f, nervus m, os n) —
  genus menentukan bentuk adjektiva yang mengikutinya
- aturan sufiks Inggris→Latin (-al → -alis, -ic → -icus/ica/icum, ...)
- daftar pengecualian eksplisit (pulmonary → pulmonalis, BUKAN pulmonarius)
- **kata di luar kamus membuat seluruh nama dilewati**, bukan diterjemahkan
  separuh

Hasil: **811 dari 2.851 konsep (28,4%)**. Sisanya sengaja dilewati.

### Dua kesalahan sistematis yang tertangkap saat audit

Ditemukan hanya karena contoh keluarannya benar-benar dibaca, bukan diasumsikan:

1. **Aturan `-ical` salah.** "cervical" jadi *cervica*, menghasilkan
   `arteria profunda cervica`. Seharusnya *cervicalis*.
2. **Urutan kata Inggris dipertahankan.** Menghasilkan
   `arteria superior epigastrica`, padahal TA menulis
   `arteria epigastrica superior` — adjektiva posisional berdiri SETELAH
   deskriptif.

Setelah diperbaiki: `arteria cervicalis profunda`, `arteria epigastrica
superior`, `vertebra thoracica nona`, `arteria femoralis sinistra`.

### Tingkat keyakinan dibedakan

- **`machine` (654)** — satu adjektiva, urutannya pasti
- **`needs-review` (157)** — lebih dari satu adjektiva deskriptif, urutannya
  tebakan (Inggris "dorsal scapular artery" vs TA "arteria scapularis
  dorsalis"). Halaman kontribusi menampilkan yang ini lebih dulu.

### ⚠️ §E7 AC6 TIDAK terpenuhi dan tidak bisa dipenuhi generator

AC6 menuntut status `reviewed`: 100% struktur high-yield punya Latin TA dan
≥300 punya Indonesia terverifikasi. Saat ini **0 entri terverifikasi**.

Itu bukan kekurangan implementasi — status `reviewed` hanya sah kalau ada
manusia yang memeriksanya. Validator bahkan menolak `reviewed` tanpa field
`reviewedBy`, supaya klaim itu selalu bisa dipertanggungjawabkan.

📌 **D4 di PRD §13 jadi relevan sekarang:** mengevaluasi Z-Anatomy (CC BY-SA)
sebagai sumber nomenklatur Latin bisa menghemat ratusan jam dibanding mereview
811 entri satu per satu. Keputusan itu jatuh temponya "sebelum F5" dan belum
diambil.

## D-026 — Cara Indonesia diturunkan: kepala frasa saja

**Tanggal:** 7 September 2026 · **Fase:** F5 · **Status:** diterapkan

Indonesia = kepala frasa di-Indonesiakan, modifier Latin dipertahankan:
"arteri femoralis sinistra", bukan "arteri paha kiri".

Itu konvensi yang benar-benar dipakai di pendidikan kedokteran Indonesia, dan
yang diuji di kampus. Menerjemahkan modifier ke bahasa Indonesia sehari-hari
justru menjauhkan dari istilah yang harus dihafal.

Tetap berstatus `machine` — pilihan kata kepala frasa pun perlu diperiksa
(mis. "nervus" vs "saraf", "kartilago" vs "tulang rawan" — keduanya dipakai).

## D-027 — Tiga bahasa sederajat; §E7 AC1 diubah

**Tanggal:** 7 September 2026 · **Fase:** F5 · **Status:** diputuskan product owner

§E7 AC1 semula: *"Default: Latin, dengan Indonesia sebagai subtitle."*

Product owner: **"semua bahasa dianggap sama, dan yang penting yang dimaksud
sama."** PRD §0 mengatur kenyataan menang tapi PRD-nya diupdate — ini
catatannya.

**Perubahan:** ketiga nama (Latin TA, Indonesia, Inggris FMA) ditampilkan
dengan bobot visual yang sama (15px) di panel detail. Tidak ada yang jadi judul
dan yang lain jadi subtitle.

**Alasannya bukan sekadar selera.** Yang mengikat ketiga nama itu adalah
**FMA ID**, bukan salah satu bahasa. Menaruh Latin di atas menyiratkan Latin
adalah bentuk "sebenarnya" dan yang lain turunannya — padahal ketiganya sama-sama
label untuk satu konsep yang sama. Untuk alat belajar, hierarki palsu itu
menyesatkan: mahasiswa yang diuji dalam bahasa Indonesia tidak sedang memakai
versi "kelas dua".

**Toggle LA/ID/EN tetap ada**, tapi maknanya berubah dari "bahasa utama" jadi
**"bahasa yang ditampilkan lebih dulu"**. Ia masih diperlukan untuk tempat yang
secara fisik hanya muat satu nama — tooltip hover dan satu baris hasil
pencarian.

**Yang TIDAK berubah:**
- §E7 AC3: pencarian tetap menelusuri semua bahasa apa pun pilihan toggle
- §E7 AC4: badge status tetap wajib di setiap bahasa yang belum terverifikasi
- Tidak ada fallback diam-diam antar-bahasa. Kalau Latin belum ada, tertulis
  "belum ada — perlu kurasi", bukan diisi nama Inggris yang menyamar.

**PRD perlu diupdate** di §E7 AC1 dan §8.2 (mockup panel detail menunjukkan
"Nervus medianus" besar dengan "Saraf median" kecil di bawahnya).

## D-028 — Layout explode memakai sel seragam supaya non-overlap bisa DIBUKTIKAN

**Tanggal:** 7 September 2026 · **Fase:** F4 (E6) · **Status:** diterapkan

§E6 AC3 menuntut tidak ada tumpang tindih bounding box, **diverifikasi secara
analitis di unit test, bukan lewat mata**. Itu menentukan pilihan algoritmanya.

Ukuran sel = dimensi bbox TERBESAR di antara struktur yang ikut, seragam untuk
semua. Dengan begitu non-overlap jadi teorema, bukan hasil uji coba: kalau
setiap struktur muat dalam kubus `cell` dan pusat sel berjarak minimal
`cell x (1 + padding)` pada salah satu sumbu, dua AABB mustahil bersinggungan.

Terbukti di `tests/unit/explode.test.ts` untuk 1.000 struktur pada aspect ratio
16:9, 4:3, dan 9:16 — 499.500 pasang diperiksa per aspect.

**Biayanya nyata dan diterima:** satu struktur raksasa memaksa seluruh grid
membesar. Dengan kulit ikut terlihat, sel jadi 1,8 m (tinggi tubuh) dan hasil
explode praktis tidak terbaca. Itu sebabnya §E6 AC8 memperingatkan di atas
1.200 struktur — explode memang dipakai setelah mengisolasi sistem.

Alternatif sel per-grup menghemat ruang tapi membuat non-overlap kembali jadi
sesuatu yang diuji-coba, bukan dibuktikan. Ditolak.

## D-029 — Batas zoom kamera harus mengikuti tampilan, bukan ukuran tubuh

**Tanggal:** 7 September 2026 · **Fase:** F4 · **Status:** diperbaiki

`maxDistance` dihitung dari bbox tubuh saat model dimuat (§E2 AC3: seluruh
tubuh + margin 20%). Exploded view jauh lebih besar dari itu.

Akibatnya: explode aktif, tapi user tidak bisa mundur cukup jauh untuk
melihatnya. Layar tampak hampir kosong — dan itu terbaca sebagai fitur rusak,
bukan sebagai batas zoom.

Terukur pada preset Kerangka (255 struktur): `maxDistance` 2,94 m sebelum
explode, **10,9 m** sesudahnya. Batasnya diinterpolasi mengikuti progres
explode, jadi saat kembali ke 0% batas zoom ikut mengetat lagi.

## D-030 — Regio per-struktur belum ada di header `.atlas`

**Tanggal:** 7 September 2026 · **Fase:** F4 · **Status:** ⚠️ pembatas kualitas

§E6 AC5 minta urutan penempatan mempertahankan hubungan anatomis:
regio -> sistem -> koordinat. `ExplodeLayout` sudah mengurutkan begitu dan
diuji, TAPI `regionId` per struktur hanya ada di `content/structures.json`,
sementara renderer membangun layout dari header `.atlas` yang cuma memuat
`systemId`.

Sementara ini `systemId` dipakai sebagai pengelompokan utama. Akibatnya
pengurutan explode benar per sistem, tapi belum mengelompokkan per regio —
tulang karpal tidak berkumpul terpisah dari tulang tarsal.

Perbaikannya kecil: tambahkan `region` ke entri struktur di header `.atlas`
(`04_pack_batches.py`), naikkan versi format, update loader dan validator.
Belum dikerjakan karena menyentuh format `.atlas` dan CLAUDE.md melarang itu
dilakukan tanpa menaikkan versi + update loader + validator sekaligus.

## D-031 — CSS tanpa `@layer` mengalahkan utility Tailwind

**Tanggal:** 7 September 2026 · **Fase:** F8 · **Status:** diperbaiki

Aturan target sentuh §E11 AC3 ditulis sebagai CSS biasa di akhir `index.css`,
di luar `@layer` apa pun. Isinya termasuk `button { position: relative }`.

**CSS tanpa layer menang atas CSS ber-layer, apa pun specificity-nya.** Jadi
`position: relative` itu menimpa `.absolute` milik Tailwind, dan SEMUA tombol
mengambang (search, Sistem, Salin tautan) kehilangan posisi absolutnya lalu
jatuh ke bawah viewport.

Gejalanya terlihat seperti bug layout mobile — padahal sebabnya urutan cascade,
dan hanya muncul di `pointer: coarse` sehingga tidak pernah terlihat di desktop.

Perbaikan: bungkus dalam `@layer base`, supaya utility Tailwind tetap menang.

## D-032 — Target sentuh diperbesar lewat zona, bukan lewat ukuran visual

**Tanggal:** 7 September 2026 · **Fase:** F8 · **Status:** diterapkan

§E11 AC3 menuntut target sentuh >= 44x44 px. Audit awal: **27 dari 34** elemen
interaktif di bawah itu.

Memaksa semua tombol jadi 44 px membuat UI desktop bengkak tanpa alasan — yang
dituju AC ini adalah "bisa ditekan jari". Jadi:

- hanya berlaku pada `@media (pointer: coarse)`
- zona ketuk diperbesar lewat pseudo-element, ukuran visual tombol tidak berubah

Terverifikasi di viewport 375x812: tombol "Sistem" visualnya 64x37 px, tapi
ketukan di 21 px atas/bawah/kiri dari pusatnya tetap mengenai tombol itu.

## D-033 — Tinggi bottom sheet memakai `dvh`, bukan `window.innerHeight`

**Tanggal:** 7 September 2026 · **Fase:** F8 · **Status:** diterapkan

Versi pertama menyimpan tinggi viewport di React state dan menghitung tinggi
tiap tahap dalam piksel. Itu kelas bug yang bisa dihindari sepenuhnya: di HP,
bar URL yang muncul-hilang mengubah tinggi viewport terus-menerus, sehingga
angka hasil pengukuran JS langsung basi.

`dvh` ada persis untuk ini. Tahapnya sekarang `72px` / `50dvh` / `88dvh`.

Terverifikasi di 375x812: peek 72, half 406, full 715 — cocok persis.

## D-034 — Perluasan D-018: transisi CSS juga BEKU di pane tersembunyi

**Tanggal:** 7 September 2026 · **Fase:** F8 · **Status:** catatan metodologi

D-018 mencatat rAF dan `setTimeout` ter-throttle saat pane browser tersembunyi.
Ternyata **transisi CSS juga**: `element.getAnimations()` menunjukkan
`CSSTransition` dengan `playState: "running"` tapi `currentTime: 0` yang tidak
pernah maju.

Akibatnya elemen membeku di nilai SEBELUM transisi, dan pengukuran tinggi
memberi angka yang salah secara konsisten — cukup meyakinkan untuk memancing
perburuan bug yang panjang ke arah yang salah.

Cara menguji dengan benar:

    el.getAnimations().forEach(a => a.finish())

lalu ukur. Atau matikan transisinya dulu. Jangan simpulkan ada bug layout
sebelum memastikan tidak ada transisi yang menggantung.

## D-035 — Warna UI dipindah ke token tema; mode terang jadi mungkin

**Tanggal:** 7 September 2026 · **Fase:** F9 · **Status:** diterapkan

§8.1 sejak awal menyebut *"Sediakan mode terang"*, tapi seluruh panel ditulis
dengan warna hardcoded (`bg-black/70`, `text-white/90`). Itu hanya benar di satu
tema, dan membuat mode terang mustahil ditambahkan tanpa menyentuh setiap file.

13 file dimigrasi ke token semantik (`bg-panel`, `text-panel-fg`,
`text-panel-muted`, `text-panel-subtle`, `--panel-warn`, `--panel-ok`,
`--panel-link`). Warna yang punya MAKNA — palet 13 sistem organ — sengaja
tidak diubah: itu konvensi atlas anatomi, bukan warna UI.

Latar kanvas 3D ikut tema lewat `AtlasRenderer.setBackground()`; warnanya wajib
cocok dengan `--canvas-bg` di CSS, kalau tidak akan ada garis beda warna di
tepi kanvas.

Tiga pilihan tema (terang / gelap / ikut sistem), default gelap sesuai §8.1.

## D-036 — Alpha token BUKAN pilihan estetis: 53 elemen gagal WCAG AA

**Tanggal:** 7 September 2026 · **Fase:** F9 · **Status:** diperbaiki

Nilai alpha token yang pertama dipilih karena "kelihatan enak" di mode gelap.
Diukur di mode terang: `--panel-fg-subtle` beralpha 0,42 menghasilkan rasio
kontras **2,77** — dan **53 elemen sekaligus gagal §E11 AC7 (WCAG AA 4,5:1)**.

Itu persis keluhan yang dilaporkan product owner: "ada beberapa yang nggak
kelihatan".

Setelah alpha dinaikkan (muted 0,74 / subtle 0,62 di terang; 0,72 / 0,54 di
gelap) dan warna semantik digelapkan untuk mode terang: **0 gagal di kedua
tema**, diukur pada seluruh teks yang tampil.

⚠️ Kalau menurunkan nilai alpha ini lagi, ukur ulang kontrasnya. Sudah dicatat
sebagai komentar di `index.css`.

## D-037 — Halaman About + atribusi footer (§12, P0)

**Tanggal:** 7 September 2026 · **Fase:** F9 · **Status:** diterapkan

§12 mewajibkan atribusi tampil di footer setiap halaman DAN di halaman About,
plus sitasi paper aslinya. Ini P0 dan gerbang sebelum deploy publik pertama.

Halaman About memuat: disclaimer, atribusi DBCLS lengkap, sitasi Mitsuhashi
et al. 2009, lisensi kode MIT — **dan konflik lisensi yang belum selesai,
apa adanya**. Menyembunyikannya sampai "nanti sudah jelas" berarti
mendistribusikan data dengan klaim lisensi yang belum tentu benar.

Juga memuat batas yang jujur: nomenklatur masih otomatis, saraf perifer tidak
ada di dataset, sebagian regio hasil tebakan spasial.

Atribusi footer disembunyikan di layar sempit (menutupi kanvas); di sana
atribusinya ada di halaman Tentang.

## D-038 — Service worker ditulis tangan, bukan workbox

**Tanggal:** 8 September 2026 · **Fase:** F9 · **Status:** diterapkan

Alasannya bukan anti-dependency. Default `generateSW` milik workbox adalah
mem-precache SELURUH aset build — di proyek ini artinya menelan 32 MB geometri
saat service worker dipasang, tanpa user pernah memintanya. Untuk mahasiswa
yang membuka dari kuota HP itu tidak bisa diterima, dan kebijakan yang benar
cukup ~160 baris.

Kebijakannya:

| Aset | Strategi | Alasan |
|---|---|---|
| cangkang app (~1 MB) | precache saat install | syarat minimum bisa jalan offline |
| `manifest.json` + content JSON (~0,9 MB) | precache, lalu stale-while-revalidate | tanpa ini offline cuma layar kosong |
| `geometry/*.atlas` (32 MB) | cache saat benar-benar dipakai + unduhan yang dipilih user | tidak pernah diunduh diam-diam |
| navigasi | network-first, fallback cache | cache-first mengunci user di build rusak tanpa jalan keluar |

Nama cache data **tidak** ikut build id, melainkan hash `manifest.json`. Kalau
ikut build, tiap deploy kecil (ubah warna tombol) akan membuang 32 MB yang
sudah diunduh user. Sudah diuji: setelah pembaruan, cache cangkang lama dibuang
dan 26 berkas geometri tetap utuh.

`skipWaiting()` tidak pernah otomatis. Menukar bundle di bawah tab yang sedang
jalan bisa mematahkan lazy-chunk yang sudah tidak ada di build baru — halaman
menampilkan tawaran "Muat ulang", user yang memutuskan.

### Dua jebakan yang cuma muncul saat benar-benar offline

**1. `Vary: Origin` membuat halaman PUTIH TOTAL.**

Server statis (vite preview, dan banyak CDN) mengirim `Vary: Origin`. Dengan
header itu `cache.match` menuntut header Origin permintaan sama persis dengan
saat disimpan. Vite menandai `<script type="module">` dan `<link rel=stylesheet>`
dengan atribut `crossorigin`, jadi permintaan asli browser MEMBAWA Origin
sementara `cache.addAll` di service worker tidak — pencarian meleset, jatuh ke
jaringan, dan offline itu berarti `ERR_FAILED`.

Yang membuat ini sulit dilihat: `fetch()` manual dari konsol tetap BERHASIL
(permintaan itu juga tanpa Origin), jadi cache tampak sehat. Yang gagal hanya
pemuatan js/css oleh parser HTML — **tanpa satu pun exception JavaScript**.
Perbaikannya `{ ignoreVary: true }` di setiap pencarian cache.

**2. File di cache yang benar, tapi dicari di cache yang salah.**

`manifest.json` dan content JSON sempat ikut di-precache ke cache *cangkang*,
padahal handler `/data/` mencarinya di cache *data*. Hasilnya: file ada, tapi
tidak ketemu, lalu jatuh ke jaringan. Online tidak terlihat sama sekali; offline
memunculkan "Gagal memuat atlas — Failed to fetch" padahal 33 berkas geometri
berhasil dimuat. Karena itu daftar precache dipisah jadi `SHELL` dan
`DATA_SHELL`.

Konsekuensi lain yang ikut diperbaiki: "Hapus data tersimpan" semula memanggil
`caches.delete(DATA_CACHE)` — yang ikut menghapus manifest + content, jadi
tombol itu diam-diam mematikan kemampuan offline app, bukan cuma mengosongkan
geometri. Sekarang hanya entri geometri yang dihapus.

**Pelajaran metodologi:** tiga bug di atas semuanya lolos dari pengujian online.
Satu-satunya yang menemukannya adalah mematikan server sungguhan lalu memuat
ulang. Untuk fitur offline, itu bukan uji tambahan — itu satu-satunya uji yang
berarti.

## D-039 — Atlas memuat SELURUH geometri saat dibuka

**Tanggal:** 8 September 2026 · **Fase:** F9 · **Status:** tercatat, belum diubah

Ditemukan saat menguji E12: `AtlasRenderer.load()` melakukan iterasi ke seluruh
33 batch di manifest dan memuat semuanya sebelum app bisa dipakai. Jadi
kunjungan pertama memang mengunduh 32 MB, ada tidaknya panel offline.

Ini mengubah arti fitur E12, dan panel-nya ditulis ulang supaya jujur: yang
dicegah kebijakan cache adalah unduhan KEDUA sebesar itu di latar belakang saat
service worker dipasang — bukan unduhan pertamanya. Panel yang berpura-pura
menawarkan pilihan yang sebenarnya sudah terjadi itu menyesatkan.

Konsekuensi yang belum diselesaikan: anggaran performa §11 menyebut FCP/TTI di
4G ter-throttle. 32 MB sebelum layar pertama hampir pasti melanggarnya. Yang
masuk akal adalah memuat sistem sesuai preset awal dulu, sisanya menyusul —
tapi itu perubahan pada jalur muat inti, bukan pekerjaan F9. Diserahkan sebagai
keputusan, bukan diam-diam diubah.

Catatan angka: 32,2 MB mentah, 18,9 MB kalau disajikan ter-brotli (sudah
dihitung pipeline di `bytesBrotli`). File di disk masih mentah dan Vercel tidak
otomatis mengompres `application/octet-stream`, jadi separuh penghematan itu
masih tergeletak — dicatat sebagai peluang terukur, bukan tebakan.

## D-040 — Konfigurasi deploy Vercel

**Tanggal:** 8 September 2026 · **Fase:** F9 · **Status:** diterapkan (belum di-deploy)

`vercel.json` menetapkan rewrite SPA dan header cache. Yang penting bukan
"tambah header supaya cepat", tapi memastikan tiap kelas aset punya umur yang
benar:

- `/assets/*` dan `/data/geometry/*` → `immutable, max-age=1 tahun`. Nama aset
  build ber-hash; geometri diberi versi lewat nama cache service worker.
- `/sw.js` dan `/index.html` → `max-age=0, must-revalidate`. Service worker yang
  ter-cache lama adalah cara paling umum membuat user terjebak di versi lama
  dan tidak bisa dipulihkan dari jarak jauh.
- `/data/manifest.json` dan content JSON → 5 menit.

⚠️ Deploy publik pertama masih tertahan D-005 (konflik lisensi BodyParts3D).
Konfigurasinya siap; keputusannya bukan keputusan teknis.

## D-041 — Potongan anatomis lewat clipping plane, bukan geometri baru

**Tanggal:** 9 September 2026 · **Fase:** F9 · **Status:** diterapkan

§E13 tidak punya AC rinci di PRD (cuma satu baris di tabel epik), jadi
kontraknya ditetapkan di sini.

**Tiga bidang baku anatomi, bukan sumbu XYZ.** Mahasiswa membaca potongan dalam
istilah sagital/koronal/transversal, dan CT/MRI memakai istilah yang sama.
Menyebutnya "sumbu X" memaksa penerjemahan di kepala tiap kali.

**Posisi ditampilkan dalam milimeter dari titik tengah tubuh**, bukan persen.
Persen tidak berarti apa-apa secara anatomi. Angkanya keluar benar sebagai efek
samping yang menyenangkan: setengah-lebar tubuh 334 mm, setengah-dalam 146 mm,
setengah-tinggi 865 mm — tinggi total 1,73 m, sosok dewasa yang wajar.

**Geometri tidak disentuh** (§5.2): pemotongan terjadi di fragment shader lewat
`renderer.clippingPlanes`. Idle tetap 0 render setelah fitur ini masuk —
diverifikasi, bukan diasumsikan.

### Dua hal yang wajib ikut, dan gampang terlupa

**1. Pass picking harus memakai bidang yang sama.** Material bawaan three
mendukung clipping otomatis; `ShaderMaterial` TIDAK — ia butuh `clipping: true`
plus chunk `clipping_planes_*` di GLSL-nya. Tanpa itu, mengklik permukaan
potongan akan memilih struktur yang sudah terpotong dan tidak terlihat: user
memilih sesuatu yang tidak ada di layar.

Dibuktikan dengan menyapu 10 titik klik yang sama sebelum dan sesudah memotong:

| x (px) | tanpa potongan | potongan sagital, sisi sinistra |
|---|---|---|
| 612 | Dextra (FMA8531) | tidak ada |
| 624 | Dextra (FMA8533) | tidak ada |
| 636 | Mediana (FMA13072) | tidak ada |
| 660 | Sinistra (FMA8534) | Sinistra (FMA8534) |
| 684 | Sinistra (FMA8472) | Sinistra (FMA8472) |

Nol struktur dextra bisa dipilih setelah dipotong; sisi yang bertahan memilih
persis struktur yang sama seperti sebelumnya. Setelah "Balik", hasilnya cermin
sempurna dari tabel di atas.

**2. `DoubleSide` selama memotong.** §5.3.4 memakai `FrontSide` demi hemat, tapi
mesh BodyParts3D adalah cangkang permukaan, bukan benda pejal. Dengan
`FrontSide`, bidang potong membuat organ tampak seperti lubang tembus — yang
terlihat justru latar di belakangnya. `side` bukan bagian dari versi material,
jadi three tidak otomatis mengompilasi ulang: `needsUpdate` wajib di-set sendiri.

### Batas yang dinyatakan terbuka di UI

Tidak ada tutup (cap) di permukaan potong, dan tidak akan ada selama datanya
cangkang permukaan. Yang terlihat adalah dinding dalam cangkang, bukan irisan
jaringan seperti CT. Ini ditulis di panelnya sendiri — menjanjikan "irisan
seperti CT" adalah janji yang tidak bisa ditepati dataset ini.

### Deep link

Field `k=<sumbu>_<posisi×1000>_<flip>` ditambahkan ke §E14. Versi format TETAP 1:
aturannya menaikkan versi kalau field berubah ARTI, dan menambah field opsional
tidak mengubah arti apa pun — tautan lama tanpa `k` tetap terbaca benar. Sumbu
yang tidak dikenal membuat bidang potongnya dibuang, bukan ditebak.

## D-042 — Sumbu lateral dikunci di level data, dan satu suite test ternyata mati

**Tanggal:** 9 September 2026 · **Fase:** F9 · **Status:** diperbaiki

`keptSide()` memetakan setengah-ruang +X ke "sinistra". Unit test TypeScript
hanya membuktikan pemetaan itu konsisten dengan dirinya sendiri — kalau konvensi
datanya ternyata kebalikan, seluruh rantainya tetap "lulus" sambil melabeli sisi
kiri pasien sebagai dextra.

Tubuh manusia nyaris simetris kiri-kanan, jadi kesalahan ini **tidak akan
terlihat di layar.** Karena itu `tests/data/test_laterality_axis.py` membandingkan
label lateralitas di ontologi dengan letak geometri sebenarnya di file `.atlas`:

    dextra   : 829/882 (94,0%) ada di X negatif
    sinistra : 842/862 (97,7%) ada di X positif
    median   : 152/152 dalam ±50 mm dari X=0

Sisa persennya adalah organ yang bbox-nya menyeberang mediana — wajar, ambangnya
90%. Struktur median yang semuanya rapat di X=0 sekaligus membuktikan model
ter-center, yang jadi syarat "0 mm" di slider berarti garis tengah sungguhan.

**Temuan sampingan:** `tests/data/test_validator.py` **crash di baris pertama**
sejak commit `3ba111f` (Fase 5) — `validate_quiz()` mendapat parameter `nomen`
baru dan pemanggilan di test tidak ikut diperbarui. Karena crash-nya di baseline,
SELURUH 11 kasus rusak di file itu tidak pernah dijalankan selama beberapa fase,
termasuk kasus "soal quiz menunjuk struktur tanpa nomenklatur `reviewed`" yang
justru menegakkan §E10 AC14. Sudah diperbaiki dan semua kasus kembali hijau.

Pelajarannya: `npm run validate` lulus bukan berarti validatornya teruji.
Menjalankan alatnya dan menguji alatnya adalah dua hal berbeda.

## D-043 — Catatan & bookmark: kunci FMA, bukan idx; deep link, bukan format baru

**Tanggal:** 9 September 2026 · **Fase:** F9 · **Status:** diterapkan

§E15 juga tanpa AC rinci di PRD. Dua keputusan bentuk yang menentukan sisanya:

**1. Catatan dikunci ke FMA ID, bukan `structureIdx`.** `idx` ditentukan urutan
packing pipeline. Membangun ulang data bisa menggesernya, dan catatan mahasiswa
akan diam-diam menempel ke organ yang berbeda — persis jenis kesalahan yang
tidak pernah kelihatan sampai terlambat. FMA ID stabil lintas rilis dataset.

**2. Bookmark menyimpan deep link §E14, bukan snapshot state sendiri.** Encoder
itu sudah mencakup kamera, visibilitas, opacity, seleksi, preset, dan bidang
potong. Format kedua berarti dua sumber kebenaran yang harus diperbarui tiap
kali ada state tampilan baru, dan yang satu pasti ketinggalan. Konsekuensinya
menyenangkan: bidang potong E13 ikut tersimpan di bookmark tanpa satu baris
kode tambahan.

Sisi buruknya jujur dicatat: deep link menyimpan seleksi sebagai `idx`. Karena
itu tiap bookmark membawa sidik jari dataset (`<struktur>-<segitiga>`), dan
bookmark dari dataset lain diberi peringatan — "sudut kamera tetap benar, tapi
struktur yang tersorot mungkin bergeser". Tidak sempurna (dataset berbeda
dengan jumlah kebetulan sama lolos), tapi jauh lebih baik daripada diam.

### Editor catatan: `key`, bukan `useEffect`

Menyinkronkan draft dari store lewat `useEffect` **salah**, dan salahnya halus:
store berganti identitas setiap kali autosave menulis, jadi efeknya berjalan
lagi dan menimpa teks yang sedang diketik dengan versi yang baru saja disimpan.
Editor di-`key` per FMA supaya berpindah struktur me-remount komponen dan draft
diambil dari inisialisasi `useState`.

Penulisan saat unmount hanya terjadi kalau isinya BERUBAH. Menulis ulang isi
yang sama akan memajukan `updatedAt` tanpa ada suntingan — dan aturan
penggabungan impor ("yang terbaru menang") lalu membuat catatan lokal yang cuma
pernah DIBUKA mengalahkan versi yang sungguh-sungguh lebih baru.

### Impor tidak boleh mempercayai berkasnya

Isi berkas datang dari pilihan user dan bisa saja bukan cadangan Corpus.
`parseBackup` **tidak pernah melempar** — kalau ia melempar, tombol impor akan
menjatuhkan seluruh app hanya karena seseorang memilih berkas yang salah.
Entri yang bentuknya tidak sah dibuang dan DIHITUNG, bukan diimpor separuh:
catatan ber-FMA ngawur akan menempel ke struktur yang tidak ada dan tidak akan
pernah terlihat lagi oleh pemiliknya. Versi cadangan tak dikenal ditolak, bukan
ditebak isinya.

Diuji dengan berkas asing, berkas rusak, JSON bukan-objek, entri tanpa id/hash,
hash raksasa, dan field waktu ngawur — semuanya menghasilkan pesan, bukan
lemparan.

### Batas yang dinyatakan terbuka

Semua tersimpan **per-perangkat, per-browser** (§4.2 melarang backend di v1).
Itu bertentangan langsung dengan tujuan "bisa diakses dari mana saja", jadi
kalimatnya ada di UI — di editor catatan DAN di panel bookmark — bukan cuma di
komentar. Ekspor/impor JSON adalah jembatan manualnya; impor menggabungkan dan
tidak menimpa catatan yang lebih baru.

"Hapus semua" butuh dua klik. Aksi ini menghapus seluruh catatan mahasiswa dan
tidak bisa dibatalkan; satu klik tak sengaja di sebelah "Impor" sudah cukup
untuk menghabisi kerja berminggu-minggu.

`IndexedDB` bisa tidak tersedia (mode privat, kebijakan browser). Semua fungsi
`lib/db.ts` mengembalikan nilai kosong alih-alih melempar, dan UI mengatakannya
— fitur catatan yang diam-diam tidak menyimpan apa pun jauh lebih buruk
daripada fitur yang mengaku tidak bisa menyimpan.

## D-044 — Review nomenklatur: buku besar manusia yang ditimpakan generator

**Tanggal:** 10 September 2026 · **Fase:** F5 (kurasi) · **Status:** alat siap, isi 0

§E7 AC6 menuntut status `reviewed`, dan 0 dari 811 entri memilikinya. Alatnya
belum pernah ada — reviewer harus mengedit JSON keluaran pipeline dengan
tangan, yang dihapus oleh `npm run data:build` berikutnya. Itu bukan alur
kerja; itu jebakan.

**Keputusan manusia hidup di `data_curated/nomenclature_reviews.json`, dan
generator 06 menimpakannya di atas hasil mesin.** Entri `reviewed` tidak
pernah ditulis ulang mesin, dan FMA yang mesin lewati bisa ditambahkan dari
nol — itulah cara cakupan tumbuh melewati 28% yang bisa dicapai aturan.

Diuji: keluaran identik setelah regenerasi ganda, review bahasa `id` tidak
bocor ke keluaran `la`, dan buku besar yang cacat (tanpa `reviewedBy`) membuat
generator MELEDAK alih-alih diam-diam melewatinya.

### Alur spreadsheet, bukan satu-satu

`07_review_nomenclature.py sheet` mengekspor TSV yang dibuka di Excel/Sheets;
kolom `decision` diisi `ok`/`fix`/`skip`; `apply` menulisnya ke buku besar lalu
menjalankan 06. Diurut: high-yield (kalau daftarnya ada) → `needs-review` →
`machine` → tanpa entri.

`apply` menolak **seluruh berkas** kalau satu baris ambigu. Mengimpor separuh
berarti reviewer mengira 200 entri masuk padahal 180 — dan yang 20 tidak akan
pernah dicari lagi. Nama reviewer wajib (`--by`), masuk ke `reviewedBy`.

Rantai penuh diverifikasi dengan tiga review sementara: sheet → apply → buku
besar → 06 → validator LULUS (3 reviewed, 154 needs-review) → app menampilkan
"3 terverifikasi", peringatan nol hilang, dan entri reviewed keluar dari
antrian koreksi. Lalu ketiganya DIHAPUS — itu uji, bukan keputusan.

### Yang alat ini sengaja tidak lakukan

Ia tidak menebak dan tidak menyarankan terjemahan. CLAUDE.md: *"User-nya calon
dokter. 40 catatan yang benar > 400 yang mungkin salah."* Keputusannya milik
reviewer; alat hanya memastikan keputusan itu tercatat dengan nama, tanggal,
sumber — dan tidak pernah hilang.

### Temuan: daftar high-yield tidak ada

`highYield` bernilai `false` untuk seluruh 2.234 struktur (D-010: D7 diputuskan
"pakai default"). Konsekuensinya lebih besar dari yang tercatat waktu itu:

- target Latin di §E7 AC6 ("100% high-yield") **tidak bisa diukur** — himpunannya kosong;
- antrian review tidak punya prioritas yang bermakna secara pedagogis;
- filter quiz "struktur high-yield" (§E10 AC1) akan kosong.

`data_curated/high_yield.example.json` menunjukkan formatnya. Isinya butuh
silabus dan Sobotta — pengetahuan domain product owner, bukan sesuatu yang
boleh saya karang.

## D-045 — Draf nomenklatur dari ingatan model bahasa (source `llm`)

**Tanggal:** 10 November 2026 · **Fase:** F5 · **Status:** diterapkan · **Atas permintaan product owner**

Product owner meminta kekosongan nomenklatur diisi dari pengetahuan Claude.
Hasilnya `data_curated/nomenclature_draft.tsv`: 1.130 istilah Latin TA untuk
nama Inggris FMA yang dinormalkan, ditimpakan generator di atas hasil aturan.

    Latin      811 -> 2.262 dari 2.851 konsep (28,4% -> 79,3%)
    Indonesia  811 -> 1.879               (28,4% -> 65,9%)
    struktur ber-mesh yang punya Latin: 1.531 dari 1.658

**Ini bukan review, dan statusnya tidak pura-pura.** Setiap entri keluar dengan
`source: "llm"` dan status `machine` (128 baris yang saya sendiri ragu:
`needs-review`). Tetap berbadge "otomatis", tetap tidak boleh jadi jawaban
benar quiz, tetap kalah oleh `nomenclature_reviews.json`. Validator menolak
entri `llm` yang berstatus `reviewed`. Ingatan model bisa salah dengan sangat
meyakinkan; yang berubah adalah titik berangkat reviewer, bukan beban buktinya.

Prioritas di 06: review manusia > draf LLM > aturan. Draf menang atas aturan
karena urutan kata hasil aturan sering salah ("Arteria apicalis segmentalis").

Kiri/kanan tidak ditulis dua kali. "Left X" = istilah dasar + sinister/dexter
menurut genus kata kepala; "… of left Y" ditulis bentuk kirinya dan bentuk
kanan didapat dengan menukar akar sinistr- ke dextr-. Kata kepala tanpa genus
terdaftar tidak diberi sisi sama sekali, dan nama yang memuat kiri DAN kanan
dilewati — keduanya lebih baik kosong daripada salah.

Yang sengaja TIDAK diisi: 589 konsep sisanya hampir semuanya kelas ontologi
FMA ("zone of muscle organ", "subdivision of …", "trunk of branch of …") yang
memang tidak punya istilah TA. Juga tidak diisi: catatan klinis (aturan
proyek melarang konten klinis massal dari LLM) dan daftar high-yield (butuh
pipeline dijalankan ulang; ditunda sampai sesudah deploy).

## D-046 — Deploy untuk belajar pribadi; aset data masuk git

**Tanggal:** 10 November 2026 · **Fase:** F9 · **Status:** diputuskan product owner

Product owner memutuskan deploy sekarang untuk pembelajaran pribadi tanpa
menunggu penegasan lisensi dari DBCLS (D-005). Halaman Tentang tetap memuat
atribusi dan konflik lisensinya apa adanya.

Konsekuensi teknis: Vercel membangun dari GitHub, dan build tidak bisa
menjalankan pipeline Python (butuh ~1 GB data mentah). Maka 33 berkas `.atlas`
(33 MB), `manifest.json`, dan `structures.json` dikeluarkan dari `.gitignore`
dan di-commit. `data_raw/` dan `data_interim/` tetap diabaikan.

⚠️ Repo `Fmusaaa/3D-ANATOMI` bersifat PUBLIK, jadi data turunan BodyParts3D
ikut terbuka di GitHub, bukan hanya di situs hasil deploy.

## D-047 — Vena biru, arteri merah

**Tanggal:** 12 November 2026 · **Fase:** F9 · **Status:** diterapkan · **Atas permintaan product owner**

Sistem kardiovaskular semula satu warna. Sekarang 395 struktur vena (nama FMA
memuat vein/vena/venous, plus sinus coronarius) diwarnai biru `#3b6fc4` lewat
slot palet ke-14; 638 arteri dan struktur jantung tetap merah. Tidak ada
geometri yang dibangun ulang: hanya channel A state texture yang diganti
(`AtlasRenderer.markVenous`). Viewer menolak mewarnai struktur di luar sistem
kardiovaskular, supaya salah klasifikasi nama tidak membuat tulang jadi biru.
Swatch di panel sistem dibelah dua dan diberi teks "arteri merah · vena biru"
(§E11 AC8: warna bukan satu-satunya pembeda).

## D-048 — Catatan klinis dari materi kuliah product owner

**Tanggal:** 12 November 2026 · **Fase:** F6 · **Status:** diterapkan · **Atas permintaan product owner**

22 catatan klinis untuk 36 FMA, diringkas Claude dari empat materi kuliah FK
UNWAHAS di Google Drive product owner (scalp/cranium/columna vertebralis,
truncus cerebri/cerebellum/medulla spinalis, cerebral blood flow & CSF, soal
cavitas abdominis). Ini BUKAN generate massal dari ingatan model: tiap
catatan hanya memuat klaim yang ada di slide sumbernya, menyebut judul kuliah
dan dosennya, menautkan berkas aslinya, dan menyatakan terang bahwa ia
diringkas Claude dan belum diperiksa manusia.

Format: `public/data/content/clinical/*.md` (front-matter `fma` boleh berisi
beberapa id) dikompilasi `08_clinical.py` ke `clinical.json`. Validator
menolak catatan tanpa `source`, FMA yang tidak ada, dan `clinical.json` yang
tidak sinkron dengan berkas `.md`. Catatan yang menunjuk grup FMA (mis.
"vertebral artery") berlaku untuk anggotanya (kiri dan kanan).

## D-049 — Yang diminta tapi tidak bisa diberikan dataset ini

**Tanggal:** 12 November 2026 · **Status:** batas dataset, dicatat terbuka

- **Lapisan otot dinding perut** (rectus abdominis, obliquus internus,
  transversus abdominis, vagina musculi recti): BodyParts3D hanya punya
  **m. obliquus externus** dan **linea alba**. Lapisan di bawahnya tidak ada,
  jadi tampilan berlapis seperti gambar referensi tidak bisa dibuat dari data
  ini.
- **Ligamen dan tendon**: hanya 18 ligamen (mayoritas laring dan mata) dan
  ~6 tendon/retinakulum (a.l. tendo calcaneus, retinaculum flexorum). Tidak
  ada ligamen sendi besar (lutut, bahu, panggul) maupun ligamen vertebra.
- **A. meningea media, hati utuh, medula spinalis**: tidak ada sebagai mesh.

Menambah salah satunya butuh dataset lain (mis. Z-Anatomy, CC BY-SA, punya
ligamen dan lapisan otot jauh lebih lengkap) — keputusan product owner.
