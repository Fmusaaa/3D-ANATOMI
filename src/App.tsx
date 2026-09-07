import { AtlasViewer } from '@/app/AtlasViewer'

/**
 * §8.1 prinsip 1: 3D adalah pusatnya. Canvas mengambil ruang maksimal; panel
 * mengambang di atasnya, bukan memakan layout.
 *
 * Panel sistem & detail menyusul di Fase 2.
 */
function App() {
  return (
    <div className="h-dvh w-dvw overflow-hidden">
      <AtlasViewer />
    </div>
  )
}

export default App
