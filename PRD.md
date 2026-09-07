# PRD — Atlas Anatomi 3D (codename: `corpus`)

**Versi dokumen:** 1.0
**Tanggal:** 7 September 2026
**Author:** Musa (A11.2024.15980 — TI UDINUS / FK UNWAHAS)
**Status:** Draft untuk implementasi
**Audiens dokumen ini:** Claude Code (implementor) + lo sendiri (product owner)

---

## 0. Cara Pakai Dokumen Ini

Dokumen ini ditulis supaya bisa dipecah jadi task-task Claude Code. Aturan main:

- **Setiap fitur punya Acceptance Criteria (AC).** Jangan tandai task selesai kalau AC belum lulus.
- **Bagian §5 (Arsitektur Rendering) itu wajib dibaca sebelum nulis kode viewer.** Salah arsitektur di sini = rewrite total di fase 4.
- **Fase itu berurutan dan punya dependency.** Jangan loncat ke Fase 5 kalau Fase 2 belum stabil.
- Kalau ada konflik antara PRD dan kenyataan teknis di lapangan, kenyataan menang — tapi update PRD-nya, jangan diam-diam menyimpang.
- Tanda `⚠️` = keputusan yang gampang bikin proyek gagal kalau salah.
- Tanda `📌` = keputusan yang belum final, harus lo putusin sebelum fase terkait mulai.

---

## 1. Ringkasan Eksekutif

### 1.1 Apa yang dibangun

Web app 3D interaktif untuk eksplorasi anatomi manusia, berbasis dataset BodyParts3D (~2.200+ mesh, 15 sistem organ), yang berkembang dari **viewer** menjadi **alat belajar anatomi untuk mahasiswa kedokteran Indonesia**.

### 1.2 Kenapa dibangun

Referensi (ashemag/human-atlas) adalah viewer yang bagus secara teknis tapi berhenti sebagai viewer: bahasa Inggris, nomenklatur FMA mentah, tanpa konteks klinis, tanpa mode belajar. Anak FK Indonesia belajar anatomi pakai **Terminologia Anatomica (Latin)** dan diuji dengan **identifikasi struktur + korelasi klinis**, bukan dengan orbit-orbit doang.

Gap yang diisi:

| Kebutuhan anak FK | Human Atlas (referensi) | Corpus (proyek ini) |
|---|---|---|
| Nomenklatur Latin TA | ❌ nama Inggris FMA | ✅ Latin TA + Inggris + Indonesia |
| Latihan identifikasi struktur | ❌ | ✅ quiz mode + spaced repetition |
| Vaskularisasi / inervasi | ❌ | ✅ per-struktur, terkurasi |
| Korelasi klinis / PBL | ❌ | ✅ catatan klinis bersumber |
| Tracking progres belajar | ❌ | ✅ lokal (IndexedDB), exportable |
| Offline-capable | ❌ | ✅ PWA (fase akhir) |

### 1.3 Definisi sukses

**v1.0 dianggap sukses kalau:**

1. Bisa buka model lengkap 2.200+ struktur di laptop mid-range dan MacBook Air M4 pada ≥50 FPS saat orbit.
2. Klik struktur mana pun → nama Latin + Inggris + Indonesia muncul dalam <100 ms.
3. Minimal 300 struktur "high-yield" (yang keluar di ujian anatomi preklinik) punya terjemahan Indonesia yang **sudah direview manusia**, bukan hasil mesin mentah.
4. Mode quiz bisa dipakai untuk satu sesi belajar 20 menit tanpa bug yang memaksa reload.
5. Lo sendiri beneran pakai buat belajar minimal 3 kali sebelum ngaku ini "selesai". Kalau lo sendiri males pakai, produknya gagal.

### 1.4 Yang bukan target

- ❌ Bukan alat diagnostik atau referensi klinis. Semua konten klinis wajib bertuliskan disclaimer edukasi.
- ❌ Bukan pengganti Sobotta/Netter/Moore. Ini pelengkap spasial.
- ❌ Bukan platform multi-user dengan akun, kelas, atau leaderboard (v1 lokal-only).
- ❌ Bukan editor 3D. User tidak bisa memodifikasi mesh.
- ❌ Tidak menampilkan histologi, embriologi, atau pencitraan radiologi asli (CT/MRI) di v1.

---

## 2. Konteks & Analisis Referensi

### 2.1 Referensi utama

- Repo: `https://github.com/ashemag/human-atlas` (MIT)
- Demo: `https://human-atlas-seven.vercel.app/`

**Yang dicontek (dan alasannya):**

| Aspek | Keputusan | Alasan |
|---|---|---|
| Dataset BodyParts3D | ✅ pakai | Satu-satunya dataset anatomi lengkap, gratis, ber-ID ontologi (FMA), boleh redistribusi |
| Batched geometry + GPU texture untuk visibility/seleksi | ✅ pakai | 2.200 mesh = 2.200 draw call kalau naif. Ini satu-satunya cara realistis |
| GPU picking untuk seleksi | ✅ pakai | Raycast CPU ke 2.200 mesh tidak feasible |
| Exploded view | ✅ pakai | Fitur pedagogis kuat — lihat inventaris komponen satu sistem |
| Toggle per sistem + preset | ✅ pakai | Cara natural navigasi anatomi |
| Stack Vite + React + Three.js | ✅ pakai | Sesuai keputusan lo; ringan, kontrol penuh |
| shadcn/ui | ✅ pakai | Cepat, aksesibel, bisa di-restyle |

**Yang sengaja beda:**

| Aspek | Human Atlas | Corpus | Alasan |
|---|---|---|---|
| Bahasa | EN only | ID + Latin TA + EN | Target user anak FK Indonesia |
| Layer data | Geometri + nama | Geometri + nama + relasi anatomis + klinis | Nama doang gak ngajarin apa-apa |
| Interaksi | Eksplorasi bebas | Eksplorasi + latihan terstruktur | Belajar butuh recall aktif, bukan recognition pasif |
| Persistence | Stateless | IndexedDB (progres, SRS, bookmark) | Belajar itu longitudinal |
| WebMCP | Ada | 📌 opsional, prioritas rendah | Nice-to-have, bukan core |

### 2.2 Riset kompetitor (buat kalibrasi ekspektasi)

- **Complete Anatomy / Visible Body / BioDigital** — komersial, model jauh lebih halus (hasil scan + retopology manual), fitur lengkap. Kita **tidak** akan mengalahkan mereka secara kualitas mesh. Keunggulan kita: gratis, Bahasa Indonesia, terbuka, dan disesuaikan kurikulum lokal.
- **Z-Anatomy** — open-source berbasis Blender, mesh lebih rapi dari BP3D dan sudah ber-nomenklatur Latin TA. 📌 **Aksi:** sebelum Fase 1 selesai, evaluasi Z-Anatomy sebagai sumber nomenklatur Latin (bukan sumber mesh) — bisa hemat ratusan jam kurasi. Cek lisensinya (CC BY-SA) dan kompatibilitasnya.
- **Kenhub / TeachMeAnatomy** — 2D + teks, sangat kuat di konten. Kita tidak menyaingi kedalaman kontennya, kita nyediain dimensi spasialnya.

**Realitas yang harus diterima sejak awal:** mesh BodyParts3D itu hasil segmentasi dataset lama (2011), kualitasnya kasar di beberapa region (terutama struktur halus: nervus kecil, pembuluh distal, otot-otot kecil tangan/wajah). Beberapa mesh punya artefak geometris. **Ini bukan bug yang bisa lo fix — ini batas dataset.** Rencanakan UI yang jujur: tandai struktur dengan kualitas mesh rendah, dan jangan janjikan presisi yang gak ada.

---

## 3. User & Use Case

### 3.1 Persona

**P1 — Mahasiswa preklinik (primer, ini lo sendiri)**
Semester 1–4 FK. Lagi blok anatomi. Butuh: cari struktur X, lihat posisinya relatif ke struktur lain, hafal nama Latin-nya, latihan identifikasi sebelum ujian praktikum (responsi/OSPE).

**P2 — Mahasiswa yang lagi PBL (sekunder)**
Dapat kasus klinis, butuh tahu struktur apa yang terlibat, vaskularisasi & inervasinya, kenapa gejalanya begitu.

**P3 — Pengunjung umum / rekruter (tersier)**
Buka demo, orbit 30 detik, kagum, tutup. Ini yang bikin proyek ini juga berfungsi sebagai portfolio. Jangan korbankan P1 demi P3, tapi pastikan first impression-nya kuat.

### 3.2 User journey inti

**J1 — "Cari struktur"**
Buka app → ketik "nervus medianus" di search → hasil muncul (Latin + ID) → klik → kamera fly-to struktur → struktur ter-highlight, sisanya jadi transparan → panel detail muncul (nama, sistem, asal, perjalanan, inervasi, klinis).

**J2 — "Pelajari satu sistem"**
Pilih sistem "Systema skeletale" → sistem lain hilang → tekan "Explode" → semua tulang menyebar rapi → hover satu-satu buat lihat namanya → klik "Isolate" untuk fokus.

**J3 — "Latihan sebelum responsi"**
Masuk mode Quiz → pilih region (misal "Ekstremitas superior") → app menampilkan struktur ter-highlight tanpa label → user ketik/pilih namanya → feedback benar/salah → struktur yang salah masuk antrian SRS → sesi selesai, ringkasan muncul.

**J4 — "Nyambungin ke kasus"**
Baca skenario PBL "pasien tidak bisa oposisi ibu jari" → search "nervus medianus" → panel klinis: "lesi di carpal tunnel → atrofi thenar, tanda: ape hand" → lihat struktur yang dipersarafi ter-highlight di 3D.

---

## 4. Scope & Prioritisasi

Notasi: **P0** = tanpa ini produk gak jalan. **P1** = pembeda utama. **P2** = penting tapi bisa nyusul. **P3** = nice-to-have.

### 4.1 Epic dan prioritas

| ID | Epic | Prioritas | Fase |
|---|---|---|---|
| E1 | Pipeline data BodyParts3D → aset web | P0 | F0 |
| E2 | Renderer 3D batched + kontrol kamera | P0 | F1 |
| E3 | Seleksi struktur (GPU picking) + panel detail | P0 | F2 |
| E4 | Toggle sistem, isolate, transparansi | P0 | F2 |
| E5 | Search multibahasa | P0 | F3 |
| E6 | Exploded view | P1 | F4 |
| E7 | Layer nomenklatur (Latin TA / ID / EN) | P1 | F5 |
| E8 | Konten anatomis terstruktur (vaskularisasi, inervasi) | P1 | F6 |
| E9 | Korelasi klinis | P1 | F6 |
| E10 | Quiz mode + spaced repetition | P1 | F7 |
| E11 | Mobile & performa & aksesibilitas | P0 | F8 |
| E12 | PWA / offline | P2 | F9 |
| E13 | Cross-section / clipping plane | P2 | F9 |
| E14 | Share deep-link state (URL) | P2 | F3 |
| E15 | Anotasi & bookmark user | P3 | F9 |
| E16 | WebMCP tools | P3 | — |

### 4.2 Explicit non-goals v1

Ditulis eksplisit supaya Claude Code gak inisiatif ngerjain ini:

- Tidak ada backend, tidak ada auth, tidak ada database server.
- Tidak ada animasi fisiologis (jantung berdetak, paru mengembang).
- Tidak ada model perempuan / pediatrik (dataset gak nyediain).
- Tidak ada upload model user.
- Tidak ada AI chat di dalam app (v1).
- Tidak ada monetisasi.

---

## 5. Arsitektur Teknis

### 5.1 Stack

| Layer | Pilihan | Versi target | Catatan |
|---|---|---|---|
| Build | Vite | 6.x | `--host` untuk tes di HP |
| Bahasa | TypeScript | 5.6+ | `strict: true`, no `any` di kode 3D |
| UI | React | 19.x | |
| 3D | three.js | r170+ | **WebGL2 wajib** |
| 3D helper | `three/examples` OrbitControls, `three-mesh-bvh` (opsional) | | ⚠️ **Jangan pakai react-three-fiber untuk scene inti.** Lihat §5.2 |
| Styling | Tailwind CSS 4 + shadcn/ui | | |
| State | Zustand | 5.x | Store terpisah: `viewerStore`, `contentStore`, `studyStore` |
| Persistence | Dexie (IndexedDB) | 4.x | |
| Search | MiniSearch atau Fuse.js | | MiniSearch lebih cepat untuk 3.000+ entri multibahasa |
| i18n | `i18next` + `react-i18next` | | Hanya untuk UI string; nomenklatur anatomi punya sistem sendiri (§6.3) |
| Test unit | Vitest | | |
| Test e2e | Playwright | | Termasuk visual regression |
| Pipeline data | Python 3.11 + `trimesh` + `fast-simplification`/`pymeshlab` + `numpy` | | Skrip offline, tidak masuk bundle |
| Deploy | Vercel (static) | | Aset besar dari `/public` atau CDN eksternal |
| Node | 22.13+ | | |

### 5.2 ⚠️ Keputusan arsitektur paling penting: React tidak boleh menyentuh render loop

Ini penyebab nomor satu proyek 3D React jadi lambat. Aturan keras:

1. **Scene three.js hidup di luar React.** Satu class `AtlasRenderer` yang punya `renderer`, `scene`, `camera`, `controls`, dan semua GPU resources. React cuma mount canvas dan panggil `renderer.mount(canvasEl)`.
2. **State per-frame (posisi kamera, hover id, progres animasi explode) TIDAK boleh masuk React state.** Simpan di field class. Kalau butuh ditampilkan di UI, throttle dan push ke Zustand maksimal 10×/detik.
3. **React state hanya untuk state diskrit:** struktur yang dipilih, sistem yang aktif, query search, mode aplikasi. Perubahan ini memanggil method imperatif di `AtlasRenderer` (`setVisibility()`, `setSelection()`), bukan re-render scene.
4. **Render on-demand.** Jangan `requestAnimationFrame` terus-menerus. Render hanya kalau ada perubahan (`needsRender = true`) atau ada animasi aktif. Idle di 0 FPS = laptop gak panas, baterai MacBook awet. Ini fitur, bukan optimasi prematur.

> Kalau nanti lo pengen R3F, boleh untuk *overlay* (label HTML, gizmo), tapi mesh anatomi inti tetap imperatif.

### 5.3 Model rendering: batched geometry + GPU state texture

**Masalah:** 2.234 mesh terpisah = 2.234 draw call per frame. Di WebGL, ~1.000 draw call udah bikin frame time meledak. Tidak akan pernah 60 FPS.

**Solusi:** gabungkan semua mesh jadi sedikit `BufferGeometry` besar, dan kendalikan tiap struktur lewat **tekstur state yang dibaca di vertex shader**.

#### 5.3.1 Struktur geometri

Per **batch** (satu batch ≈ satu sistem organ, atau pecahan sistem kalau > ~4 juta segitiga):

```
BufferGeometry {
  position       : Int16Array  (quantized, di-dequantize di shader dgn uQuantScale/uQuantOffset)
  normal         : Int8Array   (oct-encoded, 2 komponen)
  aStructureIdx  : Uint16Array (index struktur GLOBAL, bukan per-batch)
  index          : Uint32Array
}
```

Vertex cost ≈ 10 byte (posisi 6 + normal 2 + index struktur 2). Index buffer 4 byte per index.
Untuk target ~3 juta segitiga (≈1,8 juta vertex): atribut ≈ 18 MB + index ≈ 36 MB = **~54 MB mentah**.
⚠️ Index buffer ternyata dominan. Dua mitigasi yang wajib dievaluasi di Fase 1:
(a) pecah batch sehingga tiap batch < 65.536 vertex → index `Uint16`, hemat setengah — tapi menambah draw call;
(b) optimasi urutan index (`meshoptimizer` vertex cache + fetch optimization) sebelum kompresi, yang bikin rasio Brotli jauh lebih baik.
Perkiraan setelah Brotli dengan (b): **~22–30 MB total**. Ukur beneran di F0, jangan percaya angka ini bulat-bulat.

#### 5.3.2 State texture

Dua `DataTexture`, keduanya `NearestFilter`, `RGBA`, `FloatType`, lebar 256, tinggi `ceil(N/256)`:

| Texture | Channel | Isi |
|---|---|---|
| `uStateTex` | R | `visible` (0/1) |
| | G | `selectState`: 0=normal, 1=hover, 2=selected, 3=dimmed, 4=quiz-target |
| | B | `opacity` (0..1) |
| | A | `systemId` (untuk pewarnaan per sistem) |
| `uXformTex` | RGB | offset translasi (explode) |
| | A | `scale` (untuk animasi pop-out saat hover) |

Update state = tulis ke `Float32Array` + `texture.needsUpdate = true`. Biaya: satu upload tekstur ~35 KB. Bisa dilakukan 60×/detik tanpa masalah. **Tidak ada rekonstruksi geometri sama sekali.**

#### 5.3.3 Shader

Vertex shader (via `onBeforeCompile` di `MeshStandardMaterial`, atau `ShaderMaterial` custom — pilih `onBeforeCompile` supaya dapat lighting PBR gratis):

```glsl
// pseudo
float idx = aStructureIdx;
vec2 uv = vec2(mod(idx, 256.0) + 0.5, floor(idx / 256.0) + 0.5) / vec2(256.0, uTexHeight);
vec4 state = texture2D(uStateTex, uv);
vec4 xform = texture2D(uXformTex, uv);

if (state.r < 0.5) {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // di luar clip space -> ter-cull
  return;
}
vec3 p = position * uQuantScale + uQuantOffset;
p = (p - xform.xyz_pivot) * xform.a + xform.xyz_pivot + xform.xyz; // explode + scale
vSelectState = state.g;
vOpacity     = state.b;
vSystemId    = state.a;
// ... lanjut transform normal
```

Fragment shader: tint warna berdasarkan `vSelectState` (hover = lighten, selected = warna aksen + rim light, dimmed = desaturasi + alpha turun) dan warna dasar berdasarkan `vSystemId` (lookup ke `uPaletteTex` 1D).

#### 5.3.4 Pass render

Dua draw call per batch:

1. **Opaque pass** — material `depthWrite: true`, `discard` kalau `vOpacity < 0.99`.
2. **Transparent pass** — `depthWrite: false`, `transparent: true`, `discard` kalau `vOpacity >= 0.99`, render setelah opaque, `side: DoubleSide` dimatikan untuk hemat.

Total draw call untuk seluruh tubuh: **~30** (15 sistem × 2 pass). Bandingkan dengan 2.234.

#### 5.3.5 GPU picking (seleksi)

Raycast CPU ke 3 juta segitiga = tidak mungkin (bahkan dengan BVH, memory-nya berat).

Cara yang dipakai:
1. `WebGLRenderTarget` ukuran **1×1**.
2. Saat perlu picking (mouse move di-throttle 30 Hz, atau klik), pakai `camera.setViewOffset(w, h, mouseX, mouseY, 1, 1)` supaya cuma piksel di bawah kursor yang di-render.
3. Render scene dengan `overrideMaterial = pickingMaterial`, yang menulis `aStructureIdx` sebagai warna 24-bit:
   `gl_FragColor = vec4(mod(idx,256.)/255., mod(floor(idx/256.),256.)/255., floor(idx/65536.)/255., 1.0);`
   Struktur invisible tetap ter-cull karena shader-nya sama.
4. `renderer.readRenderTargetPixels()` → decode → structure index.
5. `camera.clearViewOffset()`.

⚠️ `readRenderTargetPixels` itu **synchronous GPU stall**. Jangan panggil tiap frame. Aturan: hover picking di-throttle ke maks 20 Hz dan di-skip saat kamera lagi bergerak.

#### 5.3.6 Alternatif yang DITOLAK (jangan dicoba lagi, buang waktu)

| Pendekatan | Kenapa ditolak |
|---|---|
| Satu `THREE.Mesh` per struktur | 2.234 draw call. Mati. |
| `InstancedMesh` | Instancing butuh geometri identik. Tiap organ beda bentuk. Tidak berlaku. |
| `BatchedMesh` (three.js built-in) | Menarik, dan lebih idiomatis, tapi kontrol per-struktur-nya (visibility & transform) terbatas dan API-nya masih berubah. **📌 Boleh dievaluasi di Fase 1 sebagai pembanding — kalau ternyata memenuhi semua kebutuhan (visibility, per-struktur transform, custom shader), pakai itu dan sederhanakan §5.3.** Kalau tidak, pakai desain di atas. |
| Raycast CPU + `three-mesh-bvh` | Memory BVH untuk 3M tri terlalu besar untuk mobile |
| Render tiap organ ke tekstur terpisah | Tidak masuk akal untuk geometri 3D |

### 5.4 Level of detail & loading

- **Progressive loading per sistem.** Load dulu: skeletal + kulit (silhouette) → app interaktif. Sistem lain di-fetch di background sesuai urutan popularitas, atau on-demand saat sistem-nya di-toggle.
- **Dua tier LOD per struktur** (`lod0` full, `lod1` ~25% segitiga). Pakai lod1 saat: mode explode (banyak objek kecil di layar), device mobile, atau saat kamera bergerak cepat. 📌 Kalau ternyata frame budget cukup tanpa LOD, skip — jangan bikin kompleksitas yang gak kepakai.
- Budget payload: **initial interactive < 12 MB (Brotli)**, total semua sistem < 60 MB.

### 5.5 Struktur repo

```
corpus/
├── public/
│   └── data/
│       ├── manifest.json            # index semua batch + versi + hash
│       ├── geometry/
│       │   ├── skeletal.atlas       # binary container per sistem
│       │   ├── cardiovascular.atlas
│       │   └── ...
│       └── content/
│           ├── structures.json      # metadata inti semua struktur
│           ├── nomenclature.id.json # terjemahan Indonesia
│           ├── nomenclature.la.json # Latin TA
│           ├── relations.json       # vaskularisasi/inervasi/origo-insersio
│           ├── clinical/            # per-struktur, markdown
│           └── quiz/                # bank soal
├── scripts/                         # PIPELINE OFFLINE (Python) — tidak masuk bundle
│   ├── 01_download.py
│   ├── 02_parse_ontology.py
│   ├── 03_decimate.py
│   ├── 04_pack_batches.py
│   ├── 05_validate.py
│   └── requirements.txt
├── src/
│   ├── main.tsx
│   ├── app/                         # shell, routing, layout
│   ├── viewer/                      # === KODE THREE.JS, TANPA REACT ===
│   │   ├── AtlasRenderer.ts
│   │   ├── BatchManager.ts
│   │   ├── StateTexture.ts
│   │   ├── PickingPass.ts
│   │   ├── ExplodeLayout.ts
│   │   ├── CameraController.ts
│   │   ├── loaders/AtlasLoader.ts
│   │   └── shaders/
│   ├── components/                  # React + shadcn
│   │   ├── DetailPanel/
│   │   ├── SystemTree/
│   │   ├── SearchBar/
│   │   ├── Quiz/
│   │   └── ui/                      # shadcn generated
│   ├── stores/
│   ├── content/                     # loader & tipe untuk data konten
│   ├── study/                       # algoritma SRS, session engine
│   └── lib/
├── tests/
│   ├── unit/
│   └── e2e/
├── CLAUDE.md
├── PRD.md                           # dokumen ini
└── LICENSE / ATTRIBUTION.md
```

**Aturan batas modul (di-enforce lewat lint rule `import/no-restricted-paths`):**

- `src/viewer/**` **tidak boleh** meng-import apa pun dari `react`, `src/components/**`, atau `src/stores/**`.
- `src/components/**` **tidak boleh** meng-import `three` secara langsung (kecuali tipe).
- Komunikasi viewer → UI lewat event emitter tipe-aman, UI → viewer lewat method call.

---

## 6. Data

### 6.1 Sumber data geometri: BodyParts3D

**Unduhan** (dari `https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html`):

| File | Isi | Ukuran |
|---|---|---|
| `isa_BP3D_4.0_obj_99.zip` | Mesh OBJ, hierarki *is-a* | ~136 MB |
| `partof_BP3D_4.0_obj_99.zip` | Mesh OBJ, hierarki *part-of* | ~62 MB |
| `isa_parts_list_e.txt` | FMA ID ↔ nama Inggris | ~126 KB |
| `isa_element_parts.txt` | Konsep ↔ file elemen penyusunnya | ~1,1 MB |
| `isa_inclusion_relation_list.txt` | Hierarki is-a | ~203 KB |
| `partof_*` (3 file) | Setara, untuk hierarki part-of | |

⚠️ **Jangan asumsikan format kolom file teks ini.** Langkah pertama Fase 0 adalah download, `head -20` tiap file, dan **tulis parser berdasarkan isi sebenarnya**, bukan berdasarkan tebakan. Dokumentasikan format aslinya di `scripts/README.md`.

⚠️ **Lisensi wajib diverifikasi sendiri sebelum publish.** Sumber yang beredar menyebut dua hal berbeda: klon komunitas menyebut **CC BY-SA 2.1 Japan** (v3.0), sedangkan README repo referensi menyebut **CC BY 4.0** (v4.0). Perbedaan ini penting: **SA (ShareAlike) bersifat viral** — kalau datanya CC BY-SA, karya turunan yang mengandung data itu harus dilisensikan serupa. Buka halaman lisensi resmi (`https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html`), baca, screenshot, dan simpan di `ATTRIBUTION.md`. **Tugas ini P0 dan harus selesai sebelum deploy publik pertama.**

Atribusi minimal yang harus tampil di UI (footer + halaman About):
> Anatomical data: BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under [lisensi yang terverifikasi].

### 6.2 Pipeline data (offline, Python, dijalankan sekali)

```
[01_download]   unduh + verifikasi checksum + ekstrak → data_raw/
      ↓
[02_parse]      parse parts list & relation list
                → structures_raw.json  (fma_id, nama EN, parent, file mesh)
                → tentukan systemId tiap struktur dari hierarki part-of
      ↓
[03_decimate]   per file OBJ:
                - load (trimesh)
                - perbaiki: hapus vertex duplikat, hapus face degenerate,
                  perbaiki normal, hapus komponen terpisah < 0.1% volume
                - hitung triangle budget (lihat di bawah)
                - decimate quadric ke budget
                - hitung centroid, bbox, volume, kualitas mesh (skor 0-1)
                → data_interim/*.npz
      ↓
[04_pack]       gabung per sistem:
                - kuantisasi posisi ke Int16 (skala per-batch)
                - oct-encode normal ke Int8×2
                - assign global structureIndex
                - tulis .atlas + manifest.json
      ↓
[05_validate]   cek invariant (lihat §11.3), gagal = exit code non-zero
```

**Triangle budget per struktur** — jangan pakai rasio decimation seragam, struktur kecil bakal hancur:

```
budget = clamp(
  base_tri * (bbox_diagonal / body_diagonal) ** 0.5 * importance_multiplier,
  min = 200,
  max = 40_000
)
```
dengan `importance_multiplier` = 2,0 untuk struktur di daftar high-yield, 1,0 default, 0,5 untuk struktur yang jarang diajarkan. Target total: **2,5–3,5 juta segitiga untuk seluruh tubuh**.

### 6.3 Format kontainer geometri (`.atlas`)

Satu file per sistem. Little-endian.

```
MAGIC        u8[8]   "ATLAS001"
headerLen    u32
header       utf8 JSON, panjang headerLen
[buffers, berurutan sesuai header, masing-masing 4-byte aligned]
```

Header JSON:
```json
{
  "version": 1,
  "systemId": "skeletal",
  "quantScale": [0.0012, 0.0012, 0.0012],
  "quantOffset": [-0.42, -0.88, -0.19],
  "vertexCount": 412300,
  "indexCount": 1236900,
  "buffers": {
    "position":      { "offset": 0,       "byteLength": 2473800, "type": "i16", "components": 3 },
    "normal":        { "offset": 2473800, "byteLength": 824600,  "type": "i8",  "components": 2 },
    "structureIdx":  { "offset": 3298400, "byteLength": 824600,  "type": "u16", "components": 1 },
    "index":         { "offset": 4123000, "byteLength": 4947600, "type": "u32", "components": 1 }
  },
  "structures": [
    {
      "idx": 0,
      "fma": "FMA24474",
      "indexStart": 0,
      "indexCount": 8412,
      "centroid": [0.12, -0.31, 0.02],
      "bbox": [[..],[..]],
      "meshQuality": 0.86
    }
  ]
}
```

Kenapa format custom dan bukan glTF: butuh atribut per-vertex custom (`structureIdx`), butuh kontrol kuantisasi, dan tidak butuh material/animasi/scene graph glTF. Loader-nya < 100 baris. **Kalau nanti butuh interop (mis. ekspor ke Blender), tulis converter terpisah, jangan kompromikan format runtime.**

### 6.4 Skema konten

#### `structures.json` (inti, di-load selalu)
```ts
type Structure = {
  idx: number;              // global index, harus konsisten dengan .atlas
  fma: string;              // "FMA24474"
  system: SystemId;
  parent: string | null;    // fma id
  laterality: "left" | "right" | "median" | null;
  region: RegionId;         // "membrum_superius", "caput", "thorax", ...
  name: { en: string };     // dari BP3D, selalu ada
  highYield: boolean;       // masuk kurikulum preklinik inti?
  meshQuality: number;      // 0-1, dari pipeline
};
```

#### `nomenclature.<lang>.json` (dipisah supaya bisa lazy-load)
```ts
type NomenclatureEntry = {
  fma: string;
  term: string;                 // "Nervus medianus" / "Saraf medianus"
  synonyms?: string[];
  source: "TA98" | "TA2" | "FMA" | "curated" | "machine";
  status: "reviewed" | "machine" | "needs-review";
  reviewedBy?: string;
  reviewedAt?: string;          // ISO date
};
```

⚠️ **Aturan keras soal terjemahan:** entri dengan `status: "machine"` **wajib** ditampilkan dengan penanda visual ("terjemahan otomatis, belum diverifikasi") dan **tidak boleh dipakai sebagai jawaban benar di quiz mode.** Ini alat belajar untuk anak kedokteran — istilah anatomi yang salah bisa kebawa sampai ujian. Lebih baik nampilin nama Latin doang daripada nampilin terjemahan Indonesia yang salah dengan percaya diri.

#### `relations.json`
```ts
type Relation = {
  fma: string;
  arterialSupply?: string[];     // fma id[]
  venousDrainage?: string[];
  innervation?: string[];
  lymphaticDrainage?: string[];
  origin?: string[];             // untuk otot
  insertion?: string[];
  action?: string[];             // teks bebas
  articulatesWith?: string[];    // untuk tulang
  source: string;                // sitasi, WAJIB
};
```

#### `clinical/<fma>.md`
```markdown
---
fma: FMA24474
title: Fraktur collum femoris
tags: [trauma, geriatri, ortopedi]
relatedStructures: [FMA...]
source: "Moore KL, Clinically Oriented Anatomy, 8th ed., hlm. 512"
reviewed: false
---
Isi catatan klinis...
```

Wajib: field `source` tidak boleh kosong. Skrip validasi menolak file klinis tanpa sumber.

#### `quiz/<region>.json`
```ts
type QuizItem = {
  id: string;
  type: "identify" | "name-to-structure" | "mcq" | "relation";
  targetFma: string;
  prompt: { id: string; en?: string };
  choices?: string[];          // untuk mcq
  answerFma?: string;
  difficulty: 1 | 2 | 3;
  region: RegionId;
  system: SystemId;
};
```

Bank soal **type `identify` dan `name-to-structure` di-generate otomatis** dari `structures.json` + nomenclature (hanya untuk struktur dengan `status: reviewed`). Soal `mcq` dan `relation` dikurasi manual.

### 6.5 Taksonomi sistem & region

**Sistem** (15, mengikuti BP3D, nama Latin TA):
`systema skeletale`, `systema articulare`, `systema musculare`, `systema nervosum` (centrale + periphericum), `systema cardiovasculare`, `systema lymphoideum`, `systema respiratorium`, `systema digestorium`, `systema urinarium`, `systema genitale`, `glandulae endocrinae`, `organa sensuum`, `integumentum commune`, `viscera` (umum), `topographia` (region tubuh).

📌 Petakan ulang dari hierarki BP3D yang sebenarnya di Fase 0 — daftar di atas adalah ekspektasi, bukan fakta.

**Region** (untuk filter quiz, ini yang cocok dengan cara blok anatomi diajarkan):
`caput`, `collum`, `thorax`, `abdomen`, `pelvis_perineum`, `dorsum`, `membrum_superius`, `membrum_inferius`.

---

## 7. Spesifikasi Fitur & Acceptance Criteria

Format: **User story** → **AC** (harus objektif & bisa dites).

---

### E2 — Renderer & Kontrol Kamera (P0)

**Story:** Sebagai user, gw mau memutar, zoom, dan geser model tubuh dengan mulus supaya bisa melihat struktur dari sudut mana pun.

**AC:**
1. Orbit (drag kiri), pan (drag kanan / dua jari), zoom (scroll / pinch) berfungsi di desktop dan touch.
2. Damping aktif; berhenti drag → deselerasi halus, tidak ada jitter.
3. Zoom minimal cukup dekat untuk melihat detail vertebra tunggal; zoom maksimal seluruh tubuh + margin 20%.
4. Kamera tidak bisa masuk ke dalam geometri sampai near-plane clipping terlihat aneh (min distance dibatasi relatif ke target).
5. Tombol preset view: Anterior, Posterior, Lateral kanan, Lateral kiri, Superior, Inferior. Transisi animasi 400 ms, ease-out.
6. Tombol "Reset view" mengembalikan ke framing awal.
7. **Idle = 0 render.** Saat tidak ada interaksi dan tidak ada animasi, `renderer.render()` tidak dipanggil sama sekali. Diverifikasi dengan counter di dev overlay.
8. FPS ≥ 55 saat orbit terus-menerus dengan semua sistem terlihat, pada MacBook Air M4, viewport 1440×900.

---

### E3 — Seleksi Struktur & Panel Detail (P0)

**Story:** Gw klik struktur di layar, gw mau langsung tahu itu apa.

**AC:**
1. Hover → struktur di bawah kursor ter-highlight (lightening + outline) dalam ≤ 100 ms, dan tooltip nama muncul di dekat kursor.
2. Hover picking di-throttle ≤ 20 Hz dan **di-skip total saat kamera sedang bergerak**. Tidak boleh ada frame drop terukur akibat picking.
3. Klik → struktur jadi `selected`, warna aksen, struktur lain **tidak** otomatis di-dim (dim adalah aksi terpisah).
4. Panel detail muncul menampilkan: nama Latin (besar), nama Indonesia, nama Inggris, FMA ID (bisa diklik ke sumber), sistem, region, lateralitas, dan indikator kualitas mesh kalau < 0,5.
5. Panel detail punya tab: **Ikhtisar**, **Relasi** (vaskularisasi/inervasi/origo-insersio), **Klinis**. Tab yang datanya kosong ditampilkan dengan empty state jujur ("Belum ada data untuk struktur ini"), bukan disembunyikan diam-diam.
6. Di panel Relasi, tiap struktur terkait bisa diklik → langsung menyeleksi struktur itu di 3D.
7. `Esc` membatalkan seleksi.
8. Multi-select dengan `Shift+klik` (maks 8 struktur) — dipakai untuk membandingkan atau membangun "koleksi" belajar.
9. Klik area kosong → deselect.
10. Struktur yang `visible = false` tidak bisa ter-pick.

---

### E4 — Kontrol Visibilitas (P0)

**Story:** Gw mau melihat sistem otot saja, atau menyembunyikan kulit supaya organ dalam terlihat.

**AC:**
1. Panel pohon (tree) sistem: 15 sistem, tiap sistem bisa di-toggle, ada checkbox tri-state kalau sebagian anak-nya tersembunyi.
2. Toggle sistem berlaku ≤ 1 frame setelah klik (cuma update state texture, tidak ada reload).
3. **Isolate** pada struktur/sistem terpilih: sisanya visible = false. Ada tombol "Keluar dari isolate" yang jelas.
4. **Ghost mode**: sisanya tidak disembunyikan tapi opacity 0,12 + desaturasi, supaya konteks spasial tetap ada. Ini default yang lebih berguna daripada isolate keras.
5. Slider opacity global per sistem (0–100%).
6. Preset: "Kerangka", "Otot & kerangka", "Kardiovaskular", "Saraf", "Organ dalam", "Semua". Preset mengubah kombinasi visibility + opacity.
7. Semua perubahan visibilitas beranimasi (fade 180 ms) — perubahan mendadak bikin user kehilangan orientasi spasial.
8. State visibilitas ter-encode di URL (§E14).

---

### E5 — Pencarian (P0)

**Story:** Gw tahu namanya, gw mau langsung nemu barangnya.

**AC:**
1. Index pencarian mencakup: nama Latin, Indonesia, Inggris, sinonim, dan FMA ID. Total ~3.400+ konsep.
2. Toleran typo (fuzzy, edit distance 1–2), buta huruf besar/kecil, dan buta diakritik. Pencocokan prefiks: ketik `arteri` harus memunculkan `arteria`; ketik `m. biceps` harus memunculkan `musculus biceps brachii` (singkatan `m.`, `a.`, `v.`, `n.` di-expand saat indexing).
3. Hasil pertama muncul ≤ 80 ms setelah keystroke terakhir (debounce 120 ms).
4. Hasil menampilkan: nama Latin, nama Indonesia (dengan badge kalau `machine`), sistem, dan ikon "sudah terlihat / tersembunyi".
5. Navigasi keyboard penuh: `↑ ↓` pilih, `Enter` seleksi + fly-to, `Esc` tutup.
6. `Cmd/Ctrl + K` membuka search dari mana saja.
7. Memilih hasil → kamera **fly-to** struktur (animasi 600 ms, framing bbox + margin 40%), struktur ter-select, dan **otomatis di-unhide kalau sedang tersembunyi** (dengan toast "Systema musculare ditampilkan").
8. Kalau nol hasil, tampilkan saran ("Maksud lo: ...?") berbasis n-gram, bukan sekadar "tidak ditemukan".

---

### E6 — Exploded View (P1)

**Story:** Gw mau lihat semua tulang karpal terpisah satu-satu, karena numpuk gitu gak kelihatan.

**AC:**
1. Tombol/shortcut mengubah tampilan dari anatomis → tersebar, animasi 800 ms ease-in-out, **reversible** dan bisa di-scrub (slider 0–100%).
2. Hanya struktur `visible` yang ikut dalam layout. Menyembunyikan sistem lalu explode → layout dihitung ulang hanya untuk yang tersisa.
3. **Tidak ada overlap bounding-box** antar struktur pada explode 100%, diuji pada aspect ratio 16:9, 4:3, dan 9:16.
4. Layout deterministik (input sama → output sama) supaya bisa di-tes visual regression.
5. Urutan penempatan mempertahankan hubungan anatomis: proksimal→distal, superior→inferior. Bukan acak. Ini yang bikin explode punya nilai pedagogis, bukan cuma efek keren.
6. Saat explode aktif, hover/klik tetap berfungsi normal.
7. Explode dengan > 800 struktur terlihat tetap ≥ 30 FPS di MacBook Air M4.
8. Kalau jumlah struktur terlihat > 1.200, tampilkan peringatan dan tawarkan untuk memfilter dulu, jangan langsung bikin layar jadi bubur.

**Algoritma layout (rekomendasi):** urutkan berdasarkan region → sistem → koordinat anatomis; hitung ukuran sel = dimensi bbox terbesar dalam grup; susun dalam grid 3D yang rasionya menyesuaikan aspect ratio viewport; sisipkan padding 15%. Verifikasi non-overlap secara analitis di unit test, bukan lewat mata.

---

### E7 — Layer Nomenklatur (P1)

**Story:** Dosen gw nyebut "nervus ischiadicus", buku bahasa Inggris nyebut "sciatic nerve", gw butuh dua-duanya.

**AC:**
1. Toggle bahasa utama: **Latin (TA)** / **Indonesia** / **Inggris**. Default: Latin, dengan Indonesia sebagai subtitle.
2. Perubahan bahasa berlaku di: panel detail, tooltip, hasil search, quiz — semuanya, dalam satu render.
3. Search selalu mencari di **semua** bahasa terlepas dari bahasa tampilan.
4. Entri dengan `status: machine` selalu punya badge visual dan tooltip penjelas.
5. Ada halaman "Kontribusi terjemahan" yang menampilkan daftar istilah `needs-review` dan cara mengoreksinya (v1: link ke GitHub issue template; backend tidak dibangun).
6. Cakupan minimum untuk rilis v1.0: **100% struktur high-yield punya Latin TA**, **≥ 300 struktur high-yield punya Indonesia berstatus `reviewed`**.

---

### E8/E9 — Konten Anatomis & Klinis (P1)

**Story:** Gw klik arteri, gw mau tahu dia mendarahi apa, dan apa yang terjadi kalau dia tersumbat.

**AC:**
1. Tab Relasi menampilkan vaskularisasi, drainase vena, inervasi, dan (untuk otot) origo/insersio/aksi — semuanya sebagai chip yang bisa diklik untuk menyeleksi struktur terkait.
2. Klik chip relasi → struktur target ter-highlight dengan warna sekunder **tanpa** mengganti seleksi utama (jadi bisa lihat "arteri ini → otot-otot ini" bersamaan).
3. Tab Klinis merender markdown, menampilkan sumber di bagian bawah, dan **selalu** menampilkan disclaimer: "Materi edukasi, bukan acuan praktik klinis."
4. Konten tanpa `source` tidak akan pernah tampil (di-filter saat build, dan validator gagal).
5. Cakupan v1.0: relasi untuk **≥ 150 struktur** (fokus: arteri besar, saraf perifer utama, otot ekstremitas), catatan klinis untuk **≥ 40 topik**.
6. ⚠️ **Batas jujur:** jangan generate konten klinis massal dengan LLM lalu terbitkan. Untuk tiap catatan klinis, sumbernya harus buku/jurnal yang beneran lo cek. Lebih baik 40 catatan yang benar daripada 400 yang mungkin salah — user-nya calon dokter.

---

### E10 — Mode Belajar (P1)

**Story:** Gw mau latihan identifikasi struktur berulang-ulang sampai nempel, dan sistemnya tahu mana yang gw sering lupa.

**AC:**

**Sesi quiz:**
1. User memilih scope: region, sistem, "struktur high-yield", atau "yang gw salah kemarin".
2. Tipe soal `identify`: satu struktur ter-highlight, sisanya ghost, user mengetik namanya (dengan autocomplete off) atau memilih dari 4 opsi (mode mudah).
3. Tipe soal `name-to-structure`: nama ditampilkan, user harus mengklik struktur yang benar di 3D. Toleransi: klik pada struktur anak dari target dianggap benar sebagian (skor 0,5) dengan penjelasan.
4. Feedback instan: benar → hijau + nama lengkap dalam 3 bahasa; salah → merah, jawaban benar di-highlight, jawaban user di-highlight beda warna, dengan penjelasan singkat "yang lo klik adalah X, yang dicari Y".
5. Sesi punya panjang tetap (10/20/40 soal) dan bisa dijeda.
6. Ringkasan akhir sesi: skor, waktu rata-rata per soal, daftar yang salah, tombol "ulangi yang salah".

**Spaced repetition:**
7. Pakai **FSRS** (atau SM-2 kalau FSRS terlalu rumit — 📌 putuskan di awal Fase 7; SM-2 cukup dan jauh lebih simpel).
8. Setiap struktur yang pernah diuji punya kartu dengan `due`, `stability`, `difficulty`, `lapses`.
9. Layar beranda menampilkan "X kartu jatuh tempo hari ini".
10. Data tersimpan di IndexedDB. **Wajib ada Export/Import JSON** — ini satu-satunya cara user gak kehilangan progres kalau clear browser data. Tanpa backend, ini bukan fitur opsional.
11. Peringatan jujur di UI saat pertama kali menyimpan progres: "Progres disimpan di browser ini saja. Ekspor secara berkala."
12. Statistik: retensi per region, streak harian, jumlah struktur yang "dikuasai" (stability > 30 hari).

**Aturan integritas soal:**
13. Struktur dengan `meshQuality < 0.4` **dikecualikan** dari tipe soal `name-to-structure` (gak fair nyuruh klik mesh yang bentuknya rusak).
14. Struktur tanpa nomenklatur `reviewed` **dikecualikan** dari semua tipe soal.

---

### E11 — Mobile, Performa, Aksesibilitas (P0)

**AC mobile:**
1. Layout responsif: < 768 px → panel jadi bottom sheet yang bisa di-drag, tree jadi drawer.
2. Gestur: satu jari orbit, dua jari pan + pinch zoom, tap select, long-press isolate.
3. Target sentuh ≥ 44×44 px.
4. Di device dengan `deviceMemory < 4` atau GPU lemah: otomatis pakai LOD1, batasi jumlah sistem aktif bersamaan, dan tampilkan info (bukan sekadar diam-diam degradasi).
5. Diuji di HP asli, bukan cuma device emulation Chrome. ⚠️ Referensi (human-atlas) mengakui belum menguji di device fisik — jangan ulangi kelalaian itu.

**AC performa (target keras):**

| Metrik | Target | Diukur di |
|---|---|---|
| First Contentful Paint | < 1,5 s | 4G throttled, Lighthouse |
| Interaktif (bisa orbit) | < 3,5 s | 4G throttled |
| Payload awal (Brotli) | < 12 MB | Network tab |
| FPS orbit, semua sistem | ≥ 55 | MacBook Air M4 |
| FPS orbit, semua sistem | ≥ 30 | HP mid-range (mis. Snapdragon 7-series) |
| FPS explode 800 struktur | ≥ 30 | MacBook Air M4 |
| Latensi hover→highlight | < 100 ms | performance.now() |
| Memory JS heap | < 500 MB | Chrome DevTools |
| Bundle JS (gzip, tanpa data) | < 350 KB | rollup-plugin-visualizer |

**AC aksesibilitas:**
6. Semua fungsi non-3D dapat diakses via keyboard.
7. Kontras teks memenuhi WCAG AA (4.5:1).
8. Skema warna sistem **tidak boleh** jadi satu-satunya pembeda — selalu ada label. Uji dengan simulasi deuteranopia.
9. Ada mode "kurangi gerakan" yang mematikan animasi fly-to & explode (`prefers-reduced-motion`).
10. Canvas 3D punya deskripsi teks alternatif dan panel struktur dapat dinavigasi lewat tree keyboard sebagai jalur non-visual.

---

### E14 — Deep Link (P2)

**AC:**
1. State ter-encode di URL hash: struktur terpilih, sistem aktif, mode (normal/explode/isolate), posisi kamera (terkuantisasi), bahasa.
2. URL panjangnya < 500 karakter (pakai encoding ringkas, bukan JSON mentah).
3. Membuka URL → state ter-restore persis, termasuk framing kamera.
4. Tombol "Salin tautan tampilan ini".

---

## 8. Desain UI/UX

### 8.1 Prinsip

1. **3D adalah pusatnya.** Canvas mengambil ruang maksimal. Panel mengambang di atasnya, bukan memakan layout.
2. **Gelap secara default.** Latar gelap netral (#0d0f12) bikin jaringan berwarna terang menonjol dan mengurangi kelelahan mata saat belajar malam. Sediakan mode terang.
3. **Warna punya makna.** Palet per sistem konsisten dan mendekati konvensi atlas anatomi: arteri merah, vena biru, saraf kuning, otot merah-cokelat, tulang gading, limfe hijau. Jangan pakai palet dekoratif.
4. **Tidak ada dead-end.** Tiap panel kosong menjelaskan kenapa kosong dan apa yang bisa dilakukan.
5. **Jangan sembunyikan ketidakpastian.** Terjemahan mesin, mesh rusak, konten tanpa sumber — semuanya ditandai.

### 8.2 Layout desktop

```
┌──────────────────────────────────────────────────────────────┐
│  Corpus    [⌘K Cari...]              [Latin▾] [☾] [Belajar]  │  56px
├────────────┬─────────────────────────────────┬───────────────┤
│            │                                 │               │
│  SISTEM    │                                 │  DETAIL       │
│  ☑ Skeletal│           CANVAS 3D             │  ─────────    │
│  ☑ Muscular│                                 │  Nervus       │
│  ☐ Nervous │                                 │  medianus     │
│  ...       │                                 │  Saraf median │
│            │                                 │               │
│  PRESET    │                                 │  [Ikhtisar]   │
│  ...       │                                 │  [Relasi]     │
│            │      ┌───────────────────┐      │  [Klinis]     │
│            │      │ ◀ Explode ──●── ▶ │      │               │
│  280px     │      └───────────────────┘      │  340px        │
└────────────┴─────────────────────────────────┴───────────────┘
                 [Anterior][Lateral][Superior][Reset]  ← toolbar mengambang
```

Panel kiri & kanan bisa di-collapse. Saat quiz aktif, panel kanan diganti panel quiz, panel kiri di-collapse otomatis.

### 8.3 Layout mobile

Canvas penuh layar. Bar atas: search + menu. Bottom sheet 3 tahap (peek 72 px / half / full) berisi detail struktur. Kontrol sistem di drawer kiri. Toolbar view jadi FAB yang mengembang.

### 8.4 Detail interaksi yang gampang dilupakan

- **Loading state:** saat sistem baru di-fetch, tampilkan skeleton di posisi anatomisnya (wireframe bbox), bukan spinner di tengah layar.
- **Kursor:** berubah jadi pointer hanya saat di atas struktur yang bisa dipilih.
- **Outline seleksi:** pakai teknik rim-light di shader, bukan `OutlinePass` post-processing (post-processing = extra full-screen pass, mahal di mobile).
- **Fly-to:** interpolasi posisi kamera pakai kurva yang mempertahankan jarak ke target (spherical lerp), bukan lerp linear yang bikin kamera "nyelam" ke dalam tubuh.
- **Undo:** minimal untuk aksi visibilitas (`Cmd+Z` mengembalikan toggle terakhir). User sering gak sengaja menyembunyikan yang lagi dilihat.

---

## 9. Roadmap Implementasi

Tiap fase punya **exit criteria**. Jangan lanjut sebelum lulus. Estimasi jam adalah waktu kerja fokus, bukan waktu kalender.

| Fase | Nama | Epic | Estimasi | Exit criteria |
|---|---|---|---|---|
| **F0** | Pipeline data | E1 | 16–24 j | `npm run data:build` menghasilkan `.atlas` + manifest yang lulus `05_validate.py`; total < 60 MB; semua struktur punya nama EN |
| **F1** | Renderer inti | E2 | 20–30 j | Model lengkap tampil, orbit ≥ 55 FPS, idle 0 render, dev overlay menampilkan draw call & FPS |
| **F2** | Seleksi & visibilitas | E3, E4 | 16–24 j | Klik → panel detail; toggle sistem; ghost mode; semua AC E3 & E4 lulus |
| **F3** | Search & deep link | E5, E14 | 10–14 j | Search 3.400 entri < 80 ms; URL restore state |
| **F4** | Exploded view | E6 | 14–20 j | Non-overlap terverifikasi unit test di 3 aspect ratio; ≥ 30 FPS @ 800 struktur |
| **F5** | Nomenklatur | E7 | 12–20 j + kurasi | 100% high-yield punya Latin; ≥ 300 punya ID `reviewed` |
| **F6** | Konten anatomis & klinis | E8, E9 | 20–40 j (dominan kurasi) | ≥ 150 relasi, ≥ 40 catatan klinis, semua bersumber |
| **F7** | Mode belajar | E10 | 24–32 j | Sesi 20 soal tanpa bug; SRS persist & export/import jalan |
| **F8** | Mobile, perf, a11y | E11 | 16–24 j | Semua target tabel performa terpenuhi; diuji di HP fisik; Lighthouse a11y ≥ 95 |
| **F9** | Polish & rilis | E12, E13, E15 | 12–20 j | PWA offline, halaman About + atribusi lisensi terverifikasi, deploy Vercel |

**Total estimasi: 160–250 jam.** Itu 4–6 bulan kalau lo kerjain 10 jam/minggu di sela kuliah dua jurusan. Rencanakan dengan angka itu, jangan dengan optimisme.

### 9.1 Titik "bisa dipamerin"

- **Setelah F3** proyek ini sudah layak masuk portfolio dan sudah berguna buat lo sendiri.
- **Setelah F5** ini jadi produk yang beda dari referensi.
- **Setelah F7** ini jadi produk yang orang lain mau pakai.

Kalau waktu mepet, **F0→F3 lalu F5** adalah jalur nilai tertinggi. F4 (explode) itu keren tapi bukan yang bikin lo lulus ujian anatomi.

---

## 10. Risiko

| # | Risiko | Dampak | Prob. | Mitigasi |
|---|---|---|---|---|
| R1 | Lisensi BP3D ternyata CC BY-SA (viral) | Tinggi | Sedang | Verifikasi di F0 **sebelum** nulis kode. Kalau SA: lisensikan data turunan sebagai CC BY-SA dan pisahkan repo kode (MIT) dari repo data. Bukan blocker, tapi harus diputuskan di awal |
| R2 | Kualitas mesh BP3D terlalu buruk untuk struktur halus | Sedang | **Tinggi** | Terima. Tandai `meshQuality` rendah di UI, kecualikan dari quiz klik. Fokus fitur belajar ke struktur besar/sedang |
| R3 | Performa tidak tercapai di HP kelas menengah | Tinggi | Sedang | Ukur di F1 dengan model penuh, bukan di akhir. Kalau gagal di F1, potong scope (sistem lebih sedikit di mobile) sebelum kadung bangun 5 fase di atas fondasi yang salah |
| R4 | Kurasi konten (F5, F6) memakan waktu jauh lebih besar dari estimasi | Tinggi | **Tinggi** | Ini risiko terbesar proyek ini. Bukan masalah teknis. Mitigasi: batasi ke daftar high-yield yang eksplisit (bikin daftarnya di F0), kerjakan sambil belajar untuk ujian (double-duty), dan terima bahwa cakupan parsial yang jujur > cakupan penuh yang salah |
| R5 | Terjemahan Indonesia salah dan menyesatkan calon dokter | **Sangat tinggi** | Sedang | Sistem status `machine`/`reviewed` yang di-enforce di kode, bukan cuma niat. Quiz hanya pakai `reviewed`. Badge visual permanen |
| R6 | Scope creep ke fitur yang keren tapi gak dipakai | Sedang | Tinggi | §4.2 non-goals eksplisit. Setiap fitur baru harus lewat pertanyaan: "apakah ini bikin gw lebih siap ujian anatomi?" |
| R7 | Proyek mangkrak karena beban kuliah dua jurusan | Tinggi | Sedang | Fase dirancang supaya tiap fase menghasilkan sesuatu yang berdiri sendiri. F3 sudah usable. Tidak ada fase yang meninggalkan app dalam keadaan rusak |
| R8 | `readRenderTargetPixels` bikin stutter di GPU tertentu | Sedang | Sedang | Throttle + skip saat kamera bergerak (sudah di AC). Kalau masih parah, fallback ke picking hanya saat klik (tanpa hover highlight) di device lemah |

---

## 11. Kualitas & Pengujian

### 11.1 Unit test (Vitest)

Wajib ada untuk:
- Layout explode: non-overlap, determinisme, penanganan 0/1/1000 struktur.
- Encoding/decoding deep-link URL: round-trip.
- Algoritma SRS: penjadwalan, interval, kasus batas (lapse, kartu baru).
- Parser `.atlas`: header, offset, alignment, file korup ditolak dengan pesan jelas.
- Kuantisasi posisi: round-trip error < 0,5 mm pada skala tubuh manusia.
- Encoding structure index ke warna picking dan sebaliknya, untuk semua index 0..65535.

### 11.2 E2E (Playwright)

- Load app → orbit → klik struktur → panel detail benar.
- Search "nervus medianus" → Enter → struktur terpilih.
- Toggle sistem → screenshot → bandingkan baseline.
- Explode 0% → 100% → screenshot di 3 viewport.
- Jalankan sesi quiz 5 soal sampai ringkasan.
- Export progres → clear IndexedDB → import → progres kembali.

### 11.3 Validasi data (`05_validate.py`, jalan di CI)

Gagal build kalau:
- Ada struktur di `.atlas` tanpa entri di `structures.json`, atau sebaliknya.
- Ada `structureIdx` di geometri yang di luar rentang.
- Ada mesh dengan 0 segitiga.
- Ada file klinis tanpa `source`.
- Ada entri quiz yang menunjuk FMA yang tidak ada, atau menunjuk struktur tanpa nomenklatur `reviewed`.
- Total ukuran aset melebihi budget.
- Hash manifest tidak cocok dengan isi file (deteksi aset basi).

### 11.4 Regresi performa

Skrip `npm run perf` menjalankan Playwright + Chrome tracing untuk mengukur FPS orbit dan waktu interaktif, lalu membandingkan dengan baseline di `perf-baseline.json`. Turun > 10% = gagal CI. Tanpa ini, performa akan pelan-pelan busuk tanpa ada yang sadar.

---

## 12. Lisensi & Atribusi

- **Kode:** MIT.
- **Data anatomi:** mengikuti lisensi BodyParts3D — **wajib diverifikasi di F0** (§6.1). Atribusi tampil di footer setiap halaman dan di halaman About.
- **Konten terkurasi (terjemahan, relasi, catatan klinis):** 📌 rekomendasi CC BY-SA 4.0, supaya kontribusi komunitas mahasiswa lain bisa balik ke proyek.
- **Sitasi wajib** untuk BodyParts3D: sitasi paper aslinya (Mitsuhashi N, et al. *Nucleic Acids Research*, 2009) + DOI arsip data.
- Semua konten klinis mencantumkan sumbernya masing-masing.

**Disclaimer wajib (footer + About + tiap tab Klinis):**
> Aplikasi ini dibuat untuk tujuan edukasi. Bukan alat diagnostik dan bukan acuan untuk praktik klinis. Model anatomi berbasis satu subjek pria dewasa dan tidak merepresentasikan variasi anatomis populasi.

---

## 13. Keputusan yang Masih Terbuka (📌 putuskan sebelum fase terkait)

| # | Keputusan | Deadline | Default kalau lo gak mutusin |
|---|---|---|---|
| D1 | Nama & domain proyek | Sebelum F1 | `corpus` |
| D2 | Pakai `THREE.BatchedMesh` atau shader custom | F1 | Shader custom (§5.3) |
| D3 | FSRS atau SM-2 | F7 | SM-2 |
| D4 | Ambil nomenklatur Latin dari Z-Anatomy atau kurasi manual | Sebelum F5 | Evaluasi Z-Anatomy dulu, hemat ratusan jam |
| D5 | Pakai LOD dua tier atau satu | F1 (setelah ukur) | Satu tier kalau target FPS tercapai |
| D6 | Lisensi konten terkurasi | F9 | CC BY-SA 4.0 |
| D7 | Daftar struktur "high-yield" — siapa yang menentukan | F0 | Silabus blok anatomi FK UNWAHAS + Sobotta |

---

## 14. Lampiran A — Prompt Pembuka untuk Claude Code

Karena lo minta PRD-nya aja, prompt-nya gw ringkas jadi satu prompt pembuka + pola per fase. Taruh PRD ini di root repo sebagai `PRD.md`.

### A.1 Prompt sesi pertama

```
Gw mau bangun proyek di PRD.md (baca dulu seluruhnya sebelum ngapa-ngapain).

Sesi ini HANYA Fase 0 (pipeline data). Jangan sentuh kode aplikasi React/Three.js sama sekali.

Urutan kerja:
1. Baca PRD.md, terutama §6 (Data) dan §5.5 (struktur repo).
2. Tulis CLAUDE.md berisi: ringkasan proyek, aturan arsitektur dari §5.2 dan
   batas modul dari §5.5, perintah-perintah penting, dan hal yang TIDAK boleh
   dilakukan. Buat padat — ini dibaca tiap sesi.
3. Setup repo: Vite + React + TS strict + Tailwind + shadcn, eslint dengan
   rule import/no-restricted-paths sesuai §5.5.
4. Bikin scripts/01_download.py. Jalankan. Setelah data ke-download,
   INSPEKSI file teksnya (head -20) dan LAPORKAN format sebenarnya ke gw
   sebelum nulis parser. Jangan tebak formatnya.
5. Stop di situ, tunggu konfirmasi gw.

Aturan sesi:
- Kalau ada yang ambigu di PRD, tanya. Jangan asumsi.
- Kalau kenyataan teknis beda dari PRD, kasih tahu gw dan usulkan perubahan
  PRD-nya, jangan diam-diam menyimpang.
- Jangan bikin fitur yang gak diminta di fase ini.
```

### A.2 Pola prompt tiap fase berikutnya

```
Lanjut ke Fase <N> (<nama>) di PRD.md.

Sebelum mulai:
- Baca ulang §<bagian relevan> dan acceptance criteria epic <E?>.
- Konfirmasi ke gw: exit criteria fase sebelumnya udah kelewat semua? Kalau
  ada yang belum, beresin dulu.

Selama kerja:
- Kerjakan AC satu per satu, urut. Setelah tiap AC, sebutkan AC mana yang
  baru lulus dan gimana lo verifikasinya.
- Tulis test-nya bareng kodenya, bukan belakangan.
- Jangan refactor bagian di luar scope fase ini tanpa nanya.

Selesai fase:
- Jalankan seluruh test + perf check.
- Laporkan AC mana yang lulus, mana yang belum, dan kenapa.
- Update CLAUDE.md kalau ada keputusan arsitektur baru.
```

### A.3 Prompt khusus Fase 1 (yang paling rawan)

```
Fase 1: renderer inti. Ini fase paling menentukan — arsitektur di §5.2 dan
§5.3 tidak boleh dikompromikan demi kecepatan bikin.

Sebelum nulis kode: bikin spike kecil dulu untuk mengukur, dengan data
asli hasil Fase 0:
  (a) shader custom + state texture (§5.3), dan
  (b) THREE.BatchedMesh bawaan three.js.
Ukur FPS orbit, jumlah draw call, dan memory untuk keduanya. Laporkan
angkanya. Baru setelah itu kita putuskan D2 di §13.

Hard requirement yang gak boleh dilanggar:
- src/viewer/** tidak import react.
- Idle = 0 panggilan render(). Buktikan dengan counter di dev overlay.
- Dev overlay wajib ada sejak fase ini: FPS, draw call, jumlah segitiga,
  jumlah struktur terlihat, memory. Tanpa ini kita buta soal performa.
```

---

## 15. Lampiran B — Isi `CLAUDE.md` yang disarankan

```markdown
# Corpus — Atlas Anatomi 3D

Baca PRD.md untuk spesifikasi lengkap. File ini cuma aturan main yang wajib
diingat tiap sesi.

## Aturan arsitektur (jangan dilanggar)
- src/viewer/** = three.js murni. TIDAK boleh import react, komponen, atau store.
- src/components/** TIDAK boleh import three (kecuali `import type`).
- State per-frame tidak masuk React state. Throttle maks 10 Hz kalau perlu ke UI.
- Render on-demand. Idle = 0 render.
- Geometri tidak pernah dibangun ulang saat runtime. Semua perubahan tampilan
  lewat state texture.

## Perintah
- `npm run dev` — dev server
- `npm run data:build` — jalankan pipeline Python (butuh data_raw/)
- `npm run validate` — validasi data, wajib lulus sebelum commit
- `npm run test` / `npm run test:e2e` / `npm run perf`

## Jangan
- Jangan tambah dependency 3D baru tanpa nanya.
- Jangan ubah format .atlas tanpa menaikkan versi + update loader + validator.
- Jangan tampilkan terjemahan berstatus `machine` tanpa badge peringatan.
- Jangan pakai konten klinis tanpa field `source`.
- Jangan kerjakan hal di luar fase yang sedang berjalan.

## Konteks penting
Target user: mahasiswa kedokteran Indonesia. Ketepatan istilah anatomi lebih
penting daripada kelengkapan fitur. Kalau ragu antara "tampilkan info yang
mungkin salah" dan "tampilkan kosong dengan jujur", pilih yang kedua.
```

---

## 16. Referensi

- ashemag/human-atlas — https://github.com/ashemag/human-atlas
- Demo referensi — https://human-atlas-seven.vercel.app/
- BodyParts3D download — https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- BodyParts3D README resmi — https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html
- Klon komunitas + catatan lisensi — https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
- Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Res.* 2009;37(Database issue):D782-5. — https://academic.oup.com/nar/article/37/suppl_1/D782/1000752
- Anatomography — https://en.wikipedia.org/wiki/Anatomography
