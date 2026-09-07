# Corpus — Atlas Anatomi 3D

Web app 3D interaktif untuk eksplorasi anatomi manusia berbasis dataset
BodyParts3D (~2.200+ mesh, 15 sistem organ). Target user: **mahasiswa kedokteran
Indonesia** — bukan viewer umum. Baca `PRD.md` untuk spesifikasi lengkap; file
ini cuma aturan main yang wajib diingat tiap sesi.

**Status saat ini: Fase 0 (pipeline data).** Belum ada kode viewer.

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

Pipeline Python jalan di `scripts/` — **skrip offline, tidak masuk bundle.**
Butuh venv sendiri: `pip install -r scripts/requirements.txt`.

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

## Kalau PRD dan kenyataan bentrok

Kenyataan menang — **tapi lapor dan update PRD-nya, jangan diam-diam menyimpang.**
Deviasi yang sudah tercatat ada di `DECISIONS.md`.
