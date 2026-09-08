import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const ROOT = import.meta.dirname

/**
 * Emit `sw.js` (PRD §E12).
 *
 * Daftar cangkang di-inject saat build karena nama aset ber-hash baru diketahui
 * di situ. Ditulis sebagai plugin 12 baris alih-alih menambah workbox: lihat
 * alasannya di `src/sw/service-worker.js` — kebijakan cache proyek ini justru
 * kebalikan dari default workbox.
 */
function serviceWorker(): Plugin {
  return {
    name: 'corpus-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const dataDir = path.join(ROOT, 'public', 'data')

      // Versi data ikut manifest, BUKAN ikut build: kalau ikut build, tiap
      // deploy kecil membuang 32 MB geometri yang sudah diunduh user.
      const manifestRaw = fs.readFileSync(path.join(dataDir, 'manifest.json'))
      const dataVersion = createHash('sha256').update(manifestRaw).digest('hex').slice(0, 12)

      const contentFiles = fs
        .readdirSync(path.join(dataDir, 'content'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => `/data/content/${f}`)

      const shell = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/icon.svg',
        '/icon-192.png',
        '/icon-512.png',
        ...Object.keys(bundle)
          .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
          .map((f) => `/${f}`),
      ]

      // Masuk cache DATA, bukan cache cangkang — di situlah handler `/data/`
      // mencarinya. Tanpa keduanya, app yang dibuka offline cuma layar kosong.
      const dataShell = ['/data/manifest.json', ...contentFiles]

      // Build id = hash dari daftar cangkang. Dua build dengan output identik
      // menghasilkan id yang sama, jadi cache tidak dibuang percuma.
      const build = createHash('sha256').update(shell.join('\n')).digest('hex').slice(0, 12)

      const source = fs
        .readFileSync(path.join(ROOT, 'src', 'sw', 'service-worker.js'), 'utf8')
        .replace('__SHELL__', JSON.stringify(shell))
        .replace('__DATA_SHELL__', JSON.stringify(dataShell))
        .replace('__BUILD__', build)
        .replace('__DATA_VERSION__', dataVersion)

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  build: {
    rollupOptions: {
      // spike.html hanya untuk pengukuran Fase 1; jangan ikut di build produksi.
      input: { main: 'index.html' },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(ROOT, './src'),
    },
  },
})
