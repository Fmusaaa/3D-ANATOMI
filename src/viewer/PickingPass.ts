/**
 * GPU picking (PRD §5.3.5).
 *
 * Raycast CPU ke 3 juta segitiga tidak mungkin. Sebagai gantinya: render satu
 * piksel di bawah kursor ke render target 1x1 dengan material yang menulis
 * `structureIdx` sebagai warna 24-bit, lalu baca balik.
 *
 * ⚠️ `readRenderTargetPixels` adalah **GPU stall sinkron**. Jangan pernah
 * dipanggil tiap frame. Pemanggil (AtlasRenderer) wajib men-throttle hover ke
 * <= 20 Hz dan MELEWATKANNYA sama sekali saat kamera bergerak (§E3 AC2).
 */

import * as THREE from 'three'

/** Nilai clear = putih; 0xFFFFFF jauh di atas 2.234 struktur, jadi aman. */
const NO_HIT = 0xffffff

export class PickingPass {
  private readonly target: THREE.WebGLRenderTarget
  private readonly pixel = new Uint8Array(4)
  private readonly prevClearColor = new THREE.Color()

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    })
  }

  /**
   * @param x,y koordinat piksel di dalam drawing buffer (bukan CSS px)
   * @returns structureIdx, atau null kalau tidak ada yang kena
   */
  pick(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    x: number,
    y: number,
    width: number,
    height: number,
  ): number | null {
    // Render HANYA piksel di bawah kursor: kamera dipersempit ke sub-window 1x1.
    camera.setViewOffset(width, height, x, y, 1, 1)

    const prevTarget = renderer.getRenderTarget()
    renderer.getClearColor(this.prevClearColor)
    const prevAlpha = renderer.getClearAlpha()

    renderer.setRenderTarget(this.target)
    renderer.setClearColor(NO_HIT, 1)
    renderer.clear(true, true, false)
    renderer.render(scene, camera)

    renderer.readRenderTargetPixels(this.target, 0, 0, 1, 1, this.pixel)

    renderer.setRenderTarget(prevTarget)
    renderer.setClearColor(this.prevClearColor, prevAlpha)
    camera.clearViewOffset()

    const idx =
      (this.pixel[0] ?? 0) + (this.pixel[1] ?? 0) * 256 + (this.pixel[2] ?? 0) * 65536
    return idx === NO_HIT ? null : idx
  }

  dispose(): void {
    this.target.dispose()
  }
}
