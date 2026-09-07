/**
 * Shell placeholder. Fase 0 = pipeline data saja (PRD §14.1).
 * Viewer 3D dibangun di Fase 1 — jangan tambah fitur di sini sebelum F0 lulus.
 */
function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Corpus</h1>
      <p className="text-muted-foreground max-w-prose text-sm">
        Atlas Anatomi 3D. Repo ter-scaffold; saat ini di Fase 0 (pipeline data).
        Viewer dibangun di Fase 1.
      </p>
      <footer className="text-muted-foreground/70 mt-8 max-w-prose text-xs">
        Data anatomi: BodyParts3D, © The Database Center for Life Science (DBCLS).
        Lisensi menunggu verifikasi (PRD §6.1). Aplikasi ini dibuat untuk tujuan
        edukasi — bukan alat diagnostik dan bukan acuan praktik klinis.
      </footer>
    </main>
  )
}

export default App
