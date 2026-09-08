# Corpus — Atlas Anatomi 3D

Web app 3D interaktif untuk eksplorasi anatomi manusia berbasis dataset
BodyParts3D (~2.200+ mesh, 15 sistem organ). Target user: **mahasiswa kedokteran
Indonesia** — bukan viewer umum. Baca `PRD.md` untuk spesifikasi lengkap; file
ini cuma aturan main yang wajib diingat tiap sesi.

**Status saat ini: Fase 3 (pencarian).** Pipeline data selesai; renderer
menampilkan model lengkap dengan orbit, preset view, kontrol visibilitas per
sistem, GPU picking, panel detail, dan pencarian 3.675 konsep.

---

## Aturan arsitektur (jangan dilanggar)

Ini dari PRD §5.2 dan §5.5. Melanggar = rewrite total di fase 4.

- `src/viewer/**` = three.js murni. TIDAK boleh import `react`, `react-dom`,
  `zustand`, `@react-three/*`, `src/components/**`, atau `src/stores/**`.
- `src/components/**` TIDAK boleh import `three` secara nilai — `import type` saja.
- Komunikasi **viewer → UI** lewat event emitter tipe-aman; **UI → viewer** lewat
  method call imperatif (`setVisibility()`, `setSelection()`).
- State per-frame (posisi kamera, hover id, progres explode) tidak masuk React
  state. Simpan di field class `AtlasRenderer`. Kalau perlu ke UI: throttle maks
  10 Hz ke Zustand.
- React state hanya untuk state **diskrit**: struktur terpilih, sistem aktif,
  query search, mode aplikasi.
- **Render on-demand. Idle = 0 panggilan `render()`.** Bukan optimasi prematur —
  ini fitur (laptop gak panas, baterai awet). Wajib dibuktikan dengan counter di
  dev overlay sejak Fase 1.
- Geometri tidak pernah dibangun ulang saat runtime. Semua perubahan tampilan
  (visibility, seleksi, opacity, explode) lewat **state texture** (§5.3.2).
- `readRenderTargetPixels` = GPU stall sinkron. Hover picking throttle ≤ 20 Hz
  dan **di-skip total saat kamera bergerak**.

Batas modul di atas **ditegakkan ESLint**, bukan cuma niat — lihat
`eslint.config.js` (`import/no-restricted-paths` + `no-restricted-imports`).
`npm run lint` harus lulus sebelum commit.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server (`--host` aktif, buat tes di HP fisik) |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | ESLint — termasuk enforcement batas modul |
| `npm run typecheck` | TS strict, tanpa emit |
| `npm run data:download` | Unduh + verifikasi BodyParts3D ke `data_raw/` |
| `npm run data:build` | Pipeline Python penuh → `.atlas` + manifest |
| `npm run validate` | Validasi data (§11.3). Wajib lulus sebelum commit |
| `npm run test:data` | 3 suite test data |

Pipeline Python jalan di `scripts/` — **skrip offline, tidak masuk bundle.**
Butuh venv sendiri: `pip install -r scripts/requirements.txt`.

## Peta modul viewer

| File | Tanggung jawab |
|---|---|
| `AtlasRenderer.ts` | Pemilik renderer/scene/kamera. Render on-demand. Satu-satunya pintu masuk loop: `requestRender()` |
| `BatchManager.ts` | Geometri + material per batch. Palet sistem. Skip pass transparan |
| `StateTexture.ts` | State per struktur (visible/select/opacity/system) |
| `CameraController.ts` | OrbitControls, preset, fly-to sferis, batas zoom |
| `PickingPass.ts` | GPU picking 1x1. `readRenderTargetPixels` = stall sinkron |
| `VisibilityController.ts` | Visibilitas/opacity per sistem + fade 180 ms |
| `loaders/AtlasLoader.ts` | Parse `.atlas`, tolak file rusak dengan pesan jelas |
| `shaders/atlasChunks.ts` | Potongan GLSL. `octDecode` WAJIB pakai `signNotZero` |
| `types.ts`, `events.ts` | **Satu-satunya** yang boleh diimpor `src/components/**` |

`src/app/AtlasViewer.tsx` adalah SATU-SATUNYA pemilik instance `AtlasRenderer`.
Diletakkan di `src/app/` karena §5.5 melarang `src/components/**` menyentuh
viewer di luar `types.ts`/`events.ts`.

## Jebakan yang sudah memakan waktu

- **`onBeforeCompile` + `customProgramCacheKey`**: kunci cache WAJIB unik per
  batch. Kunci yang sama membuat three memanggil `onBeforeCompile` sekali saja,
  jadi batch berikutnya tidak pernah mendapat `quantScale`/`quantOffset`-nya.
- **`objectNormal` harus dideklarasikan di `beginnormal_vertex`**, bukan
  `begin_vertex`. `defaultnormal_vertex` memakainya dan berjalan lebih dulu.
- **Cache Vite basi** setelah menambah dependensi 3D bisa menyajikan modul lama
  dan memunculkan error shader yang sudah diperbaiki. `rm -rf node_modules/.vite`.
- **Statistik dev overlay tidak boleh hanya di-push dari render loop.** Kalau
  loop berhenti, angkanya membeku dan justru menyembunyikan bukti idle. Ada
  detak `setInterval` terpisah yang hanya meng-emit, tidak pernah merender.
- **`scene.overrideMaterial` tidak bisa dipakai untuk picking.** Tiap batch
  punya `quantScale` sendiri; `BatchManager.setPickingMode()` menukar material
  per mesh.
- **Pane browser tersembunyi mematikan rAF dan meng-clamp `setTimeout`.** Fade
  visibilitas jadi menggantung dan AC terlihat gagal padahal tidak. Lihat D-018
  untuk cara menguji yang benar.

## Jangan

- Jangan tambah dependency 3D baru tanpa nanya.
- Jangan ubah format `.atlas` tanpa menaikkan versi + update loader + validator.
- Jangan tampilkan terjemahan berstatus `machine` tanpa badge peringatan, dan
  jangan pernah pakai sebagai jawaban benar di quiz.
- Jangan pakai konten klinis tanpa field `source` — validator menolaknya.
- Jangan generate konten klinis massal dengan LLM lalu terbitkan. User-nya calon
  dokter. 40 catatan yang benar > 400 yang mungkin salah.
- Jangan kerjakan hal di luar fase yang sedang berjalan (§4.2 non-goals:
  tidak ada backend, auth, animasi fisiologis, AI chat, monetisasi).
- Jangan pakai `react-three-fiber` untuk scene inti. Overlay HTML boleh.
- Jangan pakai `OutlinePass` post-processing untuk outline seleksi — pakai
  rim-light di shader (post-processing mahal di mobile).

## Konteks penting

Ketepatan istilah anatomi lebih penting daripada kelengkapan fitur. Kalau ragu
antara "tampilkan info yang mungkin salah" dan "tampilkan kosong dengan jujur",
**pilih yang kedua**.

Mesh BodyParts3D itu hasil segmentasi dataset 2011 — kasar di struktur halus
(nervus kecil, pembuluh distal, otot tangan/wajah). Ini batas dataset, bukan bug
yang bisa di-fix. Tandai `meshQuality` rendah di UI; jangan janjikan presisi yang
gak ada.

⚠️ **Saraf perifer ekstremitas TIDAK ADA di dataset** — bukan cuma kasar. Nol
hasil untuk `sciatic`; hanya 34 saraf bernama, semuanya kranial/orbital. User
journey J1 & J4 di PRD memakai n. medianus sebagai contoh dan **tidak bisa
diwujudkan**. Lihat D-020. Kekuatan dataset ada di kardiovaskular (1.057),
muskuloskeletal (646), dan viscera.

## Kalau PRD dan kenyataan bentrok

Kenyataan menang — **tapi lapor dan update PRD-nya, jangan diam-diam menyimpang.**
Deviasi yang sudah tercatat ada di `DECISIONS.md`.
