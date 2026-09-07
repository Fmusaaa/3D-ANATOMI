/**
 * Membangun dan memiliki geometri GPU untuk semua batch (§5.3).
 *
 * Satu `BufferGeometry` per batch `.atlas`, dua material (opaque + transparan)
 * yang berbagi geometri itu. Atribut dipakai APA ADANYA dari file — Int16
 * terkuantisasi dan oct-normal Int8 — dekuantisasi terjadi di vertex shader.
 * Ini alasan utama D2 jatuh ke shader custom, bukan BatchedMesh (D-013).
 */

import * as THREE from 'three'
import {
  FRAGMENT_COLOR,
  FRAGMENT_DECLARATIONS,
  VERTEX_BODY,
  VERTEX_DECLARATIONS,
  VERTEX_NORMAL_BODY,
} from './shaders/atlasChunks'
import type { StateTexture } from './StateTexture'
import type { AtlasBatch } from './loaders/AtlasLoader'

/** Urutan menentukan index palet; state texture menyimpan index ini di channel A. */
export const SYSTEM_ORDER = [
  'systema_skeletale',
  'systema_articulare',
  'systema_musculare',
  'systema_nervosum',
  'systema_cardiovasculare',
  'systema_lymphoideum',
  'systema_respiratorium',
  'systema_digestorium',
  'systema_urinarium',
  'systema_genitale',
  'glandulae_endocrinae',
  'organa_sensuum',
  'integumentum_commune',
] as const

export type SystemId = (typeof SYSTEM_ORDER)[number]

/**
 * §8.1: warna punya makna. Mendekati konvensi atlas anatomi — arteri merah,
 * vena biru, saraf kuning, otot merah-cokelat, tulang gading, limfe hijau.
 * Bukan palet dekoratif.
 *
 * ⚠️ §E11 AC8: warna TIDAK boleh jadi satu-satunya pembeda. UI wajib selalu
 * menyertakan label teks.
 */
export const SYSTEM_COLORS: Record<SystemId, number> = {
  systema_skeletale: 0xe8dcc8,
  systema_articulare: 0xbcd4e6,
  systema_musculare: 0xa8433f,
  systema_nervosum: 0xe8c547,
  systema_cardiovasculare: 0xc0392b,
  systema_lymphoideum: 0x5fa85f,
  systema_respiratorium: 0x7fb3d5,
  systema_digestorium: 0xd8a25e,
  systema_urinarium: 0x9b7fc4,
  systema_genitale: 0xc98fb0,
  glandulae_endocrinae: 0x6ec6b8,
  organa_sensuum: 0xe0e0e0,
  integumentum_commune: 0xd9b39c,
}

export function systemIndex(id: string): number {
  const i = (SYSTEM_ORDER as readonly string[]).indexOf(id)
  return i < 0 ? 0 : i
}

function buildPalette(): THREE.DataTexture {
  const data = new Uint8Array(SYSTEM_ORDER.length * 4)
  SYSTEM_ORDER.forEach((id, i) => {
    const c = new THREE.Color(SYSTEM_COLORS[id])
    data[i * 4] = Math.round(c.r * 255)
    data[i * 4 + 1] = Math.round(c.g * 255)
    data[i * 4 + 2] = Math.round(c.b * 255)
    data[i * 4 + 3] = 255
  })
  const tex = new THREE.DataTexture(data, SYSTEM_ORDER.length, 1, THREE.RGBAFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

interface BatchEntry {
  systemId: string
  geometry: THREE.BufferGeometry
  opaque: THREE.Mesh
  transparent: THREE.Mesh
  triangles: number
  bytes: number
}

export class BatchManager {
  readonly group = new THREE.Group()
  readonly palette = buildPalette()

  private readonly entries: BatchEntry[] = []
  private readonly stateTex: StateTexture
  private transparentPassEnabled = false

  constructor(stateTex: StateTexture) {
    this.stateTex = stateTex
    this.group.name = 'atlas'
  }

  get batchCount(): number {
    return this.entries.length
  }

  get triangleCount(): number {
    return this.entries.reduce((n, e) => n + e.triangles, 0)
  }

  get geometryBytes(): number {
    return this.entries.reduce((n, e) => n + e.bytes, 0)
  }

  get transparentPass(): boolean {
    return this.transparentPassEnabled
  }

  add(batch: AtlasBatch): void {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Int16BufferAttribute(batch.position, 3))
    g.setAttribute('aOctNormal', new THREE.Int8BufferAttribute(batch.normal, 2))
    g.setAttribute('aStructureIdx', new THREE.Uint16BufferAttribute(batch.structureIdx, 1))
    g.setIndex(new THREE.BufferAttribute(batch.index, 1))

    const opaque = this.makeMesh(g, batch, 'opaque')
    const transparent = this.makeMesh(g, batch, 'transparent')
    transparent.visible = false // dinyalakan hanya kalau ada struktur transparan

    this.group.add(opaque, transparent)
    this.entries.push({
      systemId: batch.header.systemId,
      geometry: g,
      opaque,
      transparent,
      triangles: batch.header.indexCount / 3,
      bytes:
        batch.position.byteLength +
        batch.normal.byteLength +
        batch.structureIdx.byteLength +
        batch.index.byteLength,
    })
  }

  private makeMesh(
    geometry: THREE.BufferGeometry,
    batch: AtlasBatch,
    pass: 'opaque' | 'transparent',
  ): THREE.Mesh {
    const isOpaque = pass === 'opaque'
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.72,
      metalness: 0,
      transparent: !isOpaque,
      depthWrite: isOpaque,
      side: THREE.FrontSide, // §5.3.4: DoubleSide dimatikan untuk hemat
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms['uStateTex'] = { value: this.stateTex.texture }
      shader.uniforms['uStateTexHeight'] = { value: this.stateTex.height }
      shader.uniforms['uPaletteTex'] = { value: this.palette }
      shader.uniforms['uPaletteSize'] = { value: SYSTEM_ORDER.length }
      shader.uniforms['uOpaquePass'] = { value: isOpaque ? 1 : 0 }
      shader.uniforms['uQuantScale'] = { value: new THREE.Vector3(...batch.header.quantScale) }
      shader.uniforms['uQuantOffset'] = { value: new THREE.Vector3(...batch.header.quantOffset) }

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
        // ⚠️ objectNormal WAJIB dideklarasikan di beginnormal_vertex:
        // defaultnormal_vertex memakainya dan berjalan SEBELUM begin_vertex.
        .replace('#include <beginnormal_vertex>', VERTEX_NORMAL_BODY)
        .replace('#include <begin_vertex>', VERTEX_BODY)

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
    }
    // ⚠️ Kunci cache WAJIB unik per batch. Tiap batch punya quantScale/
    // quantOffset sendiri, dan three memanggil onBeforeCompile sekali per
    // kunci cache — kunci yang sama membuat batch berikutnya tidak pernah
    // mendapat uniform-nya.
    const cacheKey = `atlas-${pass}-${batch.header.systemId}-${String(this.entries.length)}`
    mat.customProgramCacheKey = () => cacheKey

    const mesh = new THREE.Mesh(geometry, mat)
    // Bounding box three tidak berarti: posisi masih terkuantisasi Int16 dan
    // baru jadi koordinat dunia di dalam shader.
    mesh.frustumCulled = false
    mesh.renderOrder = isOpaque ? 0 : 1
    mesh.matrixAutoUpdate = false
    return mesh
  }

  /**
   * Nyalakan pass transparan hanya kalau memang ada struktur transparan.
   *
   * D-013: pass kedua yang selalu menyala memproses SELURUH vertex lalu
   * men-discard tiap fragmen — draw call dan vertex work dua kali lipat tanpa
   * ada yang terlihat. Terukur: 66 -> 33 draw call, heap 91 -> 83 MB.
   *
   * Mengembalikan true kalau statusnya berubah (perlu render ulang).
   */
  syncTransparentPass(): boolean {
    const need = this.stateTex.transparent > 0
    if (need === this.transparentPassEnabled) return false
    this.transparentPassEnabled = need
    for (const e of this.entries) e.transparent.visible = need
    return true
  }

  dispose(): void {
    for (const e of this.entries) {
      e.geometry.dispose()
      ;(e.opaque.material as THREE.Material).dispose()
      ;(e.transparent.material as THREE.Material).dispose()
    }
    this.entries.length = 0
    this.group.clear()
    this.palette.dispose()
  }
}
