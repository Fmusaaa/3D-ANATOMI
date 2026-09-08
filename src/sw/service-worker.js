/**
 * Service worker Corpus (PRD §E12 — PWA / offline).
 *
 * Ditulis tangan, bukan lewat `vite-plugin-pwa`/workbox. Alasannya bukan
 * anti-dependency: kebijakan cache di sini justru KEBALIKAN dari default
 * `generateSW`. Default itu mem-precache seluruh aset build — di proyek ini
 * artinya menelan 32 MB geometri saat service worker dipasang, tanpa user
 * pernah memintanya. Untuk mahasiswa yang buka dari kuota HP, itu tidak bisa
 * diterima. Kebijakan yang benar cukup ~120 baris, jadi ditulis sendiri.
 *
 * Pembagiannya:
 *
 *   cangkang app (~1 MB)   precache saat install    kecil, syarat bisa jalan offline
 *   data/content (~0,9 MB) precache saat install    tanpa ini layar cuma kosong
 *   data/geometry (32 MB)  cache saat benar-benar dipakai
 *   navigasi               network-first
 *
 * Geometri TIDAK pernah diunduh diam-diam. Yang tersimpan hanyalah byte yang
 * memang sudah user unduh untuk dilihat — plus unduhan massal yang dia pilih
 * sendiri lewat panel Offline.
 *
 * Navigasi sengaja network-first: kalau cache-first, satu deploy rusak akan
 * mengunci user di build lama tanpa jalan keluar. Offline baru jatuh ke cache.
 */

const BUILD = '__BUILD__'
const DATA_VERSION = '__DATA_VERSION__'
const SHELL = __SHELL__
/**
 * manifest + content JSON. Dipisah dari SHELL karena harus masuk cache DATA,
 * bukan cache cangkang: handler `/data/` mencarinya di DATA_CACHE, dan kalau
 * disimpan di tempat yang salah pencarian meleset lalu jatuh ke jaringan —
 * yang saat offline berarti error, padahal filenya sudah ada. Lihat D-038.
 */
const DATA_SHELL = __DATA_SHELL__

const SHELL_CACHE = `corpus-shell-${BUILD}`
/**
 * Cache data TIDAK diberi versi build. Kalau ikut build, tiap deploy kecil
 * (ubah warna tombol) akan membuang 32 MB geometri yang sudah diunduh user.
 * Versinya ikut manifest data — berubah hanya kalau datanya memang berubah.
 */
const DATA_CACHE = `corpus-data-${DATA_VERSION}`

const isGeometry = (url) => url.pathname.startsWith('/data/geometry/')
const isData = (url) => url.pathname.startsWith('/data/')

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const [shell, data] = await Promise.all([
        caches.open(SHELL_CACHE),
        caches.open(DATA_CACHE),
      ])
      await Promise.all([shell.addAll(SHELL), data.addAll(DATA_SHELL)])
    })(),
  )
  // Tidak ada skipWaiting() otomatis: menukar bundle di bawah kaki tab yang
  // sedang jalan bisa menabrakkan lazy-chunk yang sudah tidak ada. Halaman
  // yang memutuskan, lewat pesan 'skip-waiting'.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const stale =
          (name.startsWith('corpus-shell-') && name !== SHELL_CACHE) ||
          (name.startsWith('corpus-data-') && name !== DATA_CACHE)
        if (stale) await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(SHELL_CACHE)
        return (await cache.match('/index.html', MATCH)) ?? Response.error()
      }),
    )
    return
  }

  if (isData(url)) {
    event.respondWith(isGeometry(url) ? cacheFirst(req, DATA_CACHE) : revalidate(req, DATA_CACHE))
    return
  }

  // Aset build ber-hash: isinya tidak pernah berubah untuk URL yang sama.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE))
  }
})

/**
 * ⚠️ `ignoreVary` WAJIB di setiap pencarian cache.
 *
 * Server statis (vite preview, dan banyak CDN) mengirim `Vary: Origin`.
 * Dengan header itu, `cache.match` menuntut header Origin permintaan sama
 * persis dengan saat disimpan. Vite menandai `<script type="module">` dan
 * `<link rel=stylesheet>` dengan atribut `crossorigin`, jadi permintaan asli
 * browser MEMBAWA Origin sementara `cache.addAll` di service worker tidak —
 * dan pencarian meleset.
 *
 * Akibatnya sangat menyesatkan: `fetch()` manual dari halaman tetap berhasil
 * (permintaan itu juga tanpa Origin), jadi cache tampak sehat. Yang gagal cuma
 * pemuatan js/css oleh parser HTML — offline, halaman jadi PUTIH TOTAL dengan
 * ERR_FAILED, tanpa satu pun exception JavaScript. Lihat D-038.
 */
const MATCH = { ignoreVary: true }

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req, MATCH)
  if (hit) return hit
  const res = await fetch(req)
  // Response buram (opaque) tidak bisa diperiksa statusnya — jangan disimpan,
  // nanti error jaringan ikut ter-cache sebagai "berhasil".
  if (res.ok && res.type === 'basic') await cache.put(req, res.clone())
  return res
}

/** Sajikan dari cache, perbarui di latar. Untuk file kecil yang bisa berubah. */
async function revalidate(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req, MATCH)
  const network = fetch(req)
    .then(async (res) => {
      if (res.ok && res.type === 'basic') await cache.put(req, res.clone())
      return res
    })
    .catch(() => undefined)
  if (hit) return hit
  const res = await network
  return res ?? Response.error()
}

/** Dinaikkan halaman lewat pesan 'cancel-precache'; dibaca di tiap iterasi. */
let precacheCancelled = false

async function broadcast(message) {
  for (const client of await self.clients.matchAll()) client.postMessage(message)
}

/**
 * Unduhan massal geometri — HANYA dipanggil kalau user menekannya sendiri.
 *
 * Berjalan di service worker, bukan di halaman, supaya body respons langsung
 * mengalir ke cache tanpa pernah dimaterialkan jadi ArrayBuffer 12 MB di
 * memori tab. Sengaja berurutan: 33 fetch paralel di jaringan seluler justru
 * memperlambat semuanya dan bisa memicu timeout.
 */
async function precacheGeometry(urls) {
  precacheCancelled = false
  const cache = await caches.open(DATA_CACHE)
  let done = 0
  let failed = 0
  for (const url of urls) {
    if (precacheCancelled) break
    if (!(await cache.match(url, MATCH))) {
      try {
        const res = await fetch(url)
        if (res.ok && res.type === 'basic') await cache.put(url, res)
        else failed++
      } catch {
        // Jaringan putus di tengah bukan alasan membatalkan sisanya: yang
        // sudah tersimpan tetap berguna, dan user bisa mengulang nanti.
        failed++
      }
    }
    done++
    await broadcast({ type: 'precache-progress', done, failed, total: urls.length })
  }
  await broadcast({
    type: 'precache-done',
    done,
    failed,
    total: urls.length,
    cancelled: precacheCancelled,
  })
}

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  const reply = (payload) => {
    event.ports[0]?.postMessage(payload)
  }

  if (data.type === 'skip-waiting') {
    void self.skipWaiting()
    return
  }

  if (data.type === 'precache-geometry') {
    event.waitUntil(precacheGeometry(Array.isArray(data.urls) ? data.urls : []))
    return
  }

  if (data.type === 'cancel-precache') {
    precacheCancelled = true
    return
  }

  if (data.type === 'clear-data') {
    // Hanya geometri yang dibuang. `caches.delete(DATA_CACHE)` akan ikut
    // menghapus manifest + content JSON yang di-precache saat install —
    // menekan "hapus data tersimpan" jadi diam-diam mematikan kemampuan
    // offline app, bukan cuma mengosongkan geometri.
    event.waitUntil(
      (async () => {
        const cache = await caches.open(DATA_CACHE)
        let removed = 0
        for (const key of await cache.keys()) {
          if (isGeometry(new URL(key.url)) && (await cache.delete(key))) removed++
        }
        reply({ ok: true, removed })
      })(),
    )
    return
  }

  if (data.type === 'cache-stats') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(DATA_CACHE)
        const paths = []
        for (const key of await cache.keys()) {
          const url = new URL(key.url)
          if (isGeometry(url)) paths.push(url.pathname)
        }
        // Sengaja mengembalikan path, bukan jumlah byte: Content-Length tidak
        // selalu ada (server yang memakai chunked transfer tidak mengirimnya),
        // dan membaca blob-nya berarti mendekode puluhan MB cuma untuk sebuah
        // angka. Ukurannya dihitung halaman dari manifest — di situ eksak.
        reply({ paths, build: BUILD, dataVersion: DATA_VERSION })
      })(),
    )
  }
})
