/**
 * State texture per struktur (PRD §5.3.2).
 *
 * Semua perubahan tampilan — visibility, seleksi, opacity, pewarnaan sistem —
 * lewat sini. **Geometri tidak pernah dibangun ulang saat runtime** (§5.2).
 *
 * Tata letak: DataTexture RGBA float, lebar 256, tinggi ceil(N/256).
 *
 *   R  visible      0/1
 *   G  selectState  0=normal 1=hover 2=selected 3=dimmed 4=quiz-target
 *   B  opacity      0..1
 *   A  systemId     index ke palet
 *
 * Biaya update = satu upload tekstur (~35 KB untuk 2.234 struktur). Murah
 * untuk dilakukan 60x/detik.
 */

import * as THREE from 'three'

export const SelectState = {
  Normal: 0,
  Hover: 1,
  Selected: 2,
  Dimmed: 3,
  QuizTarget: 4,
} as const

export type SelectStateValue = (typeof SelectState)[keyof typeof SelectState]

const WIDTH = 256

export class StateTexture {
  readonly texture: THREE.DataTexture
  readonly height: number
  readonly count: number

  private readonly data: Float32Array
  private dirty = false
  /** Dilacak inkremental supaya dev overlay tidak perlu memindai N tiap frame. */
  private visibleCount = 0
  private transparentCount = 0

  constructor(count: number) {
    this.count = count
    this.height = Math.max(1, Math.ceil(count / WIDTH))
    this.data = new Float32Array(WIDTH * this.height * 4)
    this.texture = new THREE.DataTexture(
      this.data,
      WIDTH,
      this.height,
      THREE.RGBAFormat,
      THREE.FloatType,
    )
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
  }

  private assertIdx(idx: number): void {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.count) {
      throw new RangeError(`StateTexture: structureIdx ${idx} di luar 0..${this.count - 1}`)
    }
  }

  init(idx: number, systemId: number): void {
    this.assertIdx(idx)
    const o = idx * 4
    if (this.data[o] !== 1) this.visibleCount++
    this.data[o] = 1
    this.data[o + 1] = SelectState.Normal
    this.data[o + 2] = 1
    this.data[o + 3] = systemId
    this.dirty = true
  }

  setVisible(idx: number, visible: boolean): void {
    this.assertIdx(idx)
    const o = idx * 4
    const next = visible ? 1 : 0
    if (this.data[o] === next) return
    this.visibleCount += visible ? 1 : -1
    this.data[o] = next
    this.dirty = true
  }

  setSelectState(idx: number, state: SelectStateValue): void {
    this.assertIdx(idx)
    const o = idx * 4 + 1
    if (this.data[o] === state) return
    this.data[o] = state
    this.dirty = true
  }

  setOpacity(idx: number, opacity: number): void {
    this.assertIdx(idx)
    const o = idx * 4 + 2
    const next = Math.min(1, Math.max(0, opacity))
    const prev = this.data[o] ?? 1
    if (prev === next) return
    // Lacak berapa struktur yang benar-benar transparan, supaya renderer bisa
    // melewati pass transparan sepenuhnya kalau tidak ada (D-013).
    const wasTransparent = prev < 0.99
    const isTransparent = next < 0.99
    if (wasTransparent !== isTransparent) this.transparentCount += isTransparent ? 1 : -1
    this.data[o] = next
    this.dirty = true
  }

  getVisible(idx: number): boolean {
    this.assertIdx(idx)
    return this.data[idx * 4] === 1
  }

  /** Jumlah struktur terlihat — untuk dev overlay, tanpa memindai array. */
  get visible(): number {
    return this.visibleCount
  }

  /** Kalau 0, pass transparan boleh dilewati total (draw call separuh). */
  get transparent(): number {
    return this.transparentCount
  }

  get bytes(): number {
    return this.data.byteLength
  }

  /** Panggil sekali per frame setelah semua perubahan. Idempoten. */
  flush(): boolean {
    if (!this.dirty) return false
    this.texture.needsUpdate = true
    this.dirty = false
    return true
  }

  dispose(): void {
    this.texture.dispose()
  }
}
