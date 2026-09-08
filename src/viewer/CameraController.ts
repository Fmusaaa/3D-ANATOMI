/**
 * Kontrol kamera: orbit/pan/zoom, preset view, fly-to (§E2).
 *
 * Semua state per-frame (posisi kamera, progres animasi) hidup di sini sebagai
 * field class — TIDAK pernah masuk React state (§5.2 aturan 2).
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ViewPreset } from './types'

/** §E2 AC5: transisi preset 400 ms, ease-out. */
const PRESET_MS = 400
/** §E5 AC7: fly-to ke struktur 600 ms. */
const FLYTO_MS = 600

/** ease-out cubic */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)

interface Anim {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  /** Jarak awal & akhir dipisah dari arah supaya interpolasinya sferis. */
  fromDist: number
  toDist: number
  start: number
  duration: number
}

export class CameraController {
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls

  private anim: Anim | null = null
  private home: { position: THREE.Vector3; target: THREE.Vector3 } | null = null
  private bounds = new THREE.Sphere(new THREE.Vector3(), 1)
  private reducedMotion = false

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    this.controls = new OrbitControls(this.camera, canvas)

    // §E2 AC2: damping aktif, deselerasi halus.
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.rotateSpeed = 0.85
    this.controls.zoomSpeed = 0.9
    this.controls.panSpeed = 0.8
    this.controls.screenSpacePanning = true

    // §E2 AC1 + §E11 AC2: satu jari orbit, dua jari pan + pinch zoom.
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }

    // §E11 AC9: hormati prefers-reduced-motion.
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.reducedMotion = mq.matches
      mq.addEventListener('change', (e) => {
        this.reducedMotion = e.matches
      })
    }
  }

  /**
   * Bingkai model dan tetapkan batas zoom (§E2 AC3, AC4).
   *
   * `bounds` dalam satuan meter, ruang dunia.
   */
  frame(bounds: THREE.Sphere): void {
    this.bounds = bounds.clone()

    const fitDist = bounds.radius / Math.sin((this.camera.fov * Math.PI) / 360)

    // AC4: jangan biarkan kamera menembus geometri sampai near-plane clipping
    // kelihatan aneh. AC3: cukup dekat untuk melihat satu vertebra (~40 mm).
    this.controls.minDistance = 0.03
    // AC3: zoom keluar = seluruh tubuh + margin 20%.
    this.controls.maxDistance = fitDist * 1.2

    // Near/far mengikuti skala model, bukan angka ajaib.
    this.camera.near = Math.max(0.001, this.controls.minDistance * 0.05)
    this.camera.far = fitDist * 8
    this.camera.updateProjectionMatrix()

    // Framing awal: anterior, sedikit lebih jauh dari fit supaya ada margin.
    const pos = new THREE.Vector3(0, bounds.center.y, bounds.center.z + fitDist * 1.05)
    this.camera.position.copy(pos)
    this.controls.target.copy(bounds.center)
    this.controls.update()

    this.home = { position: pos.clone(), target: bounds.center.clone() }
  }

  /** §E2 AC5. Arah dalam konvensi viewer: +Y superior, +Z anterior. */
  setPreset(preset: ViewPreset): void {
    const dir = new THREE.Vector3()
    switch (preset) {
      case 'anterior':
        dir.set(0, 0, 1)
        break
      case 'posterior':
        dir.set(0, 0, -1)
        break
      // Sisi KANAN pasien ada di X negatif (lihat 04_pack_batches.py), jadi
      // "lateral kanan" berarti kamera di -X.
      case 'lateral-dextra':
        dir.set(-1, 0, 0)
        break
      case 'lateral-sinistra':
        dir.set(1, 0, 0)
        break
      case 'superior':
        dir.set(0, 1, 0.001) // sedikit miring supaya `up` tidak degenerate
        break
      case 'inferior':
        dir.set(0, -1, 0.001)
        break
    }

    const dist = this.camera.position.distanceTo(this.controls.target)
    const target = this.bounds.center.clone()
    this.animateTo(target.clone().addScaledVector(dir, dist), target, PRESET_MS)
  }

  /** §E2 AC6. */
  resetView(): void {
    if (!this.home) return
    this.animateTo(this.home.position.clone(), this.home.target.clone(), PRESET_MS)
  }

  /** §E5 AC7: fly-to struktur, framing bbox + margin 40%. */
  flyTo(center: THREE.Vector3, radius: number): void {
    const dist = Math.max(
      this.controls.minDistance * 1.5,
      (radius * 1.4) / Math.sin((this.camera.fov * Math.PI) / 360),
    )
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    this.animateTo(center.clone().addScaledVector(dir, dist), center.clone(), FLYTO_MS)
  }

  private animateTo(toPos: THREE.Vector3, toTarget: THREE.Vector3, duration: number): void {
    if (this.reducedMotion || duration <= 0) {
      this.camera.position.copy(toPos)
      this.controls.target.copy(toTarget)
      this.controls.update()
      this.anim = null
      return
    }
    const fromTarget = this.controls.target.clone()
    this.anim = {
      fromPos: this.camera.position.clone(),
      toPos: toPos.clone(),
      fromTarget,
      toTarget: toTarget.clone(),
      fromDist: this.camera.position.distanceTo(fromTarget),
      toDist: toPos.distanceTo(toTarget),
      start: performance.now(),
      duration,
    }
  }

  get isAnimating(): boolean {
    return this.anim !== null
  }

  /**
   * Maju satu langkah. Mengembalikan true kalau ada yang berubah dan frame
   * berikutnya perlu digambar.
   */
  update(now: number): boolean {
    let changed = false

    if (this.anim) {
      const a = this.anim
      const t = Math.min(1, (now - a.start) / a.duration)
      const k = easeOut(t)

      const target = a.fromTarget.clone().lerp(a.toTarget, k)

      // §8.4: interpolasi yang MEMPERTAHANKAN jarak ke target (sferis), bukan
      // lerp linear yang bikin kamera "nyelam" menembus tubuh di tengah jalan.
      const fromDir = a.fromPos.clone().sub(a.fromTarget).normalize()
      const toDir = a.toPos.clone().sub(a.toTarget).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(fromDir, toDir)
      const dir = fromDir
        .clone()
        .applyQuaternion(new THREE.Quaternion().slerp(q, k))
        .normalize()
      const dist = a.fromDist + (a.toDist - a.fromDist) * k

      this.camera.position.copy(target).addScaledVector(dir, dist)
      this.controls.target.copy(target)
      changed = true

      if (t >= 1) this.anim = null
    }

    // OrbitControls mengembalikan true selama damping masih menggerakkan kamera.
    if (this.controls.update()) changed = true
    return changed
  }

  /** Snapshot untuk deep link (§E14 AC1). */
  getState(): { position: [number, number, number]; target: [number, number, number] } {
    const p = this.camera.position
    const t = this.controls.target
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] }
  }

  /**
   * Pulihkan framing dari deep link (§E14 AC3) — tanpa animasi.
   *
   * Membuka sebuah tautan harus mendarat langsung di tampilan yang dimaksud;
   * menerbangkan kamera dari posisi default justru bikin bingung dan bisa
   * berakhir di tempat lain kalau animasinya keburu diinterupsi.
   */
  setState(position: [number, number, number], target: [number, number, number]): void {
    this.anim = null
    this.camera.position.set(position[0], position[1], position[2])
    this.controls.target.set(target[0], target[1], target[2])
    this.controls.update()
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.controls.dispose()
  }
}
