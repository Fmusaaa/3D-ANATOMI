import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { registerServiceWorker } from './lib/offline'
import './index.css'

// §8.1 gelap secara default. Dipasang di sini (sebelum React mount) supaya
// tidak ada kedipan terang di frame pertama; `useTheme` mengambil alih setelah
// mount dan menghormati pilihan tersimpan / setelan sistem.
try {
  const stored = localStorage.getItem('corpus.theme')
  const dark =
    stored === 'dark' ||
    stored === null ||
    (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
} catch {
  document.documentElement.classList.add('dark')
}

// §E12. No-op di dev: service worker yang meng-cache modul dev bertabrakan
// dengan HMR dan memunculkan "bug" yang sebenarnya cuma file basi.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
