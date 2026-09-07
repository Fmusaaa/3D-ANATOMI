/**
 * Parser kontainer `.atlas` (PRD §6.3).
 *
 * Tata letak file (little-endian):
 *
 *   MAGIC      u8[8]   "ATLAS001"
 *   headerLen  u32
 *   header     utf8 JSON, panjang headerLen
 *   <padding sampai kelipatan 4>
 *   buffers    berurutan sesuai header, masing-masing 4-byte aligned
 *
 * `offset` tiap buffer relatif terhadap awal blok buffer, bukan awal file.
 *
 * File rusak ditolak dengan pesan yang menyebut apa yang salah (§11.1) —
 * bukan dibiarkan lewat lalu meledak sebagai geometri sampah di GPU.
 *
 * TIDAK boleh mengimpor react/store/komponen (§5.5). Modul ini three.js murni;
 * malah tidak butuh three sama sekali — keluarannya TypedArray polos.
 */

const MAGIC = 'ATLAS001'
const SUPPORTED_VERSION = 1

export type BufferType = 'i16' | 'i8' | 'u16' | 'u32'

export interface AtlasBufferDesc {
  offset: number
  byteLength: number
  type: BufferType
  components: number
}

export interface AtlasStructureDesc {
  idx: number
  fma: string
  fileId: string
  indexStart: number
  indexCount: number
  centroid: [number, number, number]
  bbox: [[number, number, number], [number, number, number]]
  meshQuality: number
}

export interface AtlasHeader {
  version: number
  systemId: string
  /** Dekuantisasi di shader: `p = position * quantScale + quantOffset`. */
  quantScale: [number, number, number]
  quantOffset: [number, number, number]
  vertexCount: number
  indexCount: number
  structures: AtlasStructureDesc[]
  buffers: Record<string, AtlasBufferDesc>
}

export interface AtlasBatch {
  header: AtlasHeader
  /** Int16 terkuantisasi — dekuantisasi terjadi di vertex shader. */
  position: Int16Array
  /** Oct-encoded, 2 komponen Int8. Dekode WAJIB pakai signNotZero (lihat catatan). */
  normal: Int8Array
  /** Index struktur GLOBAL, bukan per-batch (§5.3.1). */
  structureIdx: Uint16Array
  index: Uint16Array | Uint32Array
  byteLength: number
}

const BYTES_PER: Record<BufferType, number> = { i16: 2, i8: 1, u16: 2, u32: 4 }

function fail(source: string, reason: string): never {
  throw new Error(`AtlasLoader: ${source} — ${reason}`)
}

function readHeader(buf: ArrayBuffer, source: string): { header: AtlasHeader; bodyStart: number } {
  if (buf.byteLength < 12) fail(source, `file cuma ${buf.byteLength} byte, header minimum 12`)

  const magic = new TextDecoder('ascii').decode(new Uint8Array(buf, 0, 8))
  if (magic !== MAGIC) fail(source, `MAGIC "${magic}" bukan "${MAGIC}" — ini file .atlas?`)

  const headerLen = new DataView(buf).getUint32(8, true)
  if (12 + headerLen > buf.byteLength) {
    fail(source, `headerLen ${headerLen} melewati akhir file (${buf.byteLength} byte) — file terpotong`)
  }

  let header: AtlasHeader
  try {
    header = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buf, 12, headerLen))) as AtlasHeader
  } catch (e) {
    fail(source, `header JSON rusak: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (header.version !== SUPPORTED_VERSION) {
    fail(source, `versi format ${header.version}, loader ini cuma paham ${SUPPORTED_VERSION}`)
  }

  let bodyStart = 12 + headerLen
  bodyStart += (4 - (bodyStart % 4)) % 4
  return { header, bodyStart }
}

function slice(
  buf: ArrayBuffer,
  bodyStart: number,
  desc: AtlasBufferDesc | undefined,
  name: string,
  expectType: BufferType | BufferType[],
  source: string,
): { desc: AtlasBufferDesc; byteOffset: number } {
  if (!desc) fail(source, `buffer "${name}" tidak ada di header`)

  const allowed = Array.isArray(expectType) ? expectType : [expectType]
  if (!allowed.includes(desc.type)) {
    fail(source, `buffer "${name}" bertipe "${desc.type}", diharapkan ${allowed.join('/')}`)
  }
  const byteOffset = bodyStart + desc.offset
  if (byteOffset % 4 !== 0) fail(source, `buffer "${name}" tidak 4-byte aligned (offset ${byteOffset})`)
  if (byteOffset + desc.byteLength > buf.byteLength) {
    fail(source, `buffer "${name}" melewati akhir file — aset terpotong`)
  }
  if (desc.byteLength % BYTES_PER[desc.type] !== 0) {
    fail(source, `buffer "${name}" byteLength ${desc.byteLength} bukan kelipatan ${BYTES_PER[desc.type]}`)
  }
  return { desc, byteOffset }
}

export function parseAtlas(buf: ArrayBuffer, source = '<buffer>'): AtlasBatch {
  const { header, bodyStart } = readHeader(buf, source)
  const b = header.buffers ?? {}

  const pos = slice(buf, bodyStart, b['position'], 'position', 'i16', source)
  const nrm = slice(buf, bodyStart, b['normal'], 'normal', 'i8', source)
  const sid = slice(buf, bodyStart, b['structureIdx'], 'structureIdx', 'u16', source)
  const idx = slice(buf, bodyStart, b['index'], 'index', ['u16', 'u32'], source)

  const position = new Int16Array(buf, pos.byteOffset, pos.desc.byteLength / 2)
  const normal = new Int8Array(buf, nrm.byteOffset, nrm.desc.byteLength)
  const structureIdx = new Uint16Array(buf, sid.byteOffset, sid.desc.byteLength / 2)
  const index =
    idx.desc.type === 'u16'
      ? new Uint16Array(buf, idx.byteOffset, idx.desc.byteLength / 2)
      : new Uint32Array(buf, idx.byteOffset, idx.desc.byteLength / 4)

  // Invarian: hitungan di header harus cocok dengan ukuran buffer sebenarnya.
  if (position.length / 3 !== header.vertexCount) {
    fail(source, `vertexCount ${header.vertexCount} != buffer position (${position.length / 3})`)
  }
  if (normal.length / 2 !== header.vertexCount) {
    fail(source, `buffer normal punya ${normal.length / 2} entri, vertexCount ${header.vertexCount}`)
  }
  if (structureIdx.length !== header.vertexCount) {
    fail(source, `buffer structureIdx punya ${structureIdx.length} entri, vertexCount ${header.vertexCount}`)
  }
  if (index.length !== header.indexCount) {
    fail(source, `indexCount ${header.indexCount} != buffer index (${index.length})`)
  }
  if (index.length % 3 !== 0) fail(source, `indexCount ${index.length} bukan kelipatan 3`)
  if (idx.desc.type === 'u16' && header.vertexCount > 65536) {
    fail(source, `index Uint16 tapi ${header.vertexCount} vertex — overflow`)
  }

  return { header, position, normal, structureIdx, index, byteLength: buf.byteLength }
}

export interface AtlasManifestBatch {
  file: string
  systemId: string
  vertexCount: number
  indexCount: number
  triangleCount: number
  structureCount: number
  indexType: 'u16' | 'u32'
  bytes: number
  bytesBrotli: number
  sha256: string
}

export interface AtlasManifest {
  schema: number
  formatVersion: number
  units: string
  axes: string
  structureCount: number
  triangleCount: number
  vertexCount: number
  meshQualityExcludeBelow: number
  batches: AtlasManifestBatch[]
  content: Record<string, { file: string; bytes: number; bytesBrotli: number; sha256: string }>
}

export async function fetchManifest(baseUrl: string): Promise<AtlasManifest> {
  const res = await fetch(`${baseUrl}/manifest.json`)
  if (!res.ok) throw new Error(`AtlasLoader: manifest.json HTTP ${res.status}`)
  return (await res.json()) as AtlasManifest
}

export async function fetchBatch(baseUrl: string, entry: AtlasManifestBatch): Promise<AtlasBatch> {
  const res = await fetch(`${baseUrl}/${entry.file}`)
  if (!res.ok) throw new Error(`AtlasLoader: ${entry.file} HTTP ${res.status}`)
  return parseAtlas(await res.arrayBuffer(), entry.file)
}
