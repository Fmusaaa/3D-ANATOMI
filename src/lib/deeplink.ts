/**
 * Encoding state tampilan ke URL hash (PRD §E14).
 *
 * §E14 AC2 membatasi panjang URL < 500 karakter, jadi JSON mentah tidak boleh.
 * Semua angka dikuantisasi lalu ditulis base36.
 *
 * Format (versi 1):
 *
 *   #a1~c=<px>_<py>_<pz>_<tx>_<ty>_<tz>~v=<mask>~o=<i>-<op>_<i>-<op>~s=<idx>_<idx>~p=<preset>
 *
 *   c  posisi & target kamera, milimeter, base36 bertanda
 *   v  bitmask sistem yang terlihat (urutan SYSTEM_ORDER)
 *   o  opacity per sistem, hanya yang != 100
 *   s  structureIdx terpilih
 *   p  id preset visibilitas, kalau tampilannya persis sebuah preset
 *
 * Bagian yang nilainya default DIHILANGKAN, bukan ditulis kosong — URL untuk
 * tampilan awal jadi pendek.
 *
 * ⚠️ Menaikkan versi format WAJIB kalau field berubah arti. Decoder menolak
 * versi yang tidak dikenal dan mengembalikan null, supaya link lama tidak
 * di-restore jadi tampilan yang salah tanpa ada yang sadar.
 */

const VERSION = 1
const PREFIX = `a${String(VERSION)}`
const SEP = '~'
const SUB = '_'

export interface DeepLinkState {
  /** Meter, ruang dunia. */
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  /** systemId yang terlihat. */
  visibleSystems: string[]
  /** systemId -> opacity 0..1, hanya yang bukan 1. */
  opacities: Record<string, number>
  selection: number[]
  presetId: string | null
}

/** Base36 bertanda: -42 -> "-16". */
function enc(n: number): string {
  return Math.round(n).toString(36)
}

function dec(s: string): number | null {
  if (!/^-?[0-9a-z]+$/.test(s)) return null
  const n = parseInt(s, 36)
  return Number.isFinite(n) ? n : null
}

/** Meter -> milimeter bulat. Presisi 1 mm jauh lebih halus dari yang terlihat. */
const M_TO_MM = 1000

export function encodeState(state: DeepLinkState, systemOrder: readonly string[]): string {
  const parts: string[] = [PREFIX]

  const cam = [...state.cameraPosition, ...state.cameraTarget]
    .map((v) => enc(v * M_TO_MM))
    .join(SUB)
  parts.push(`c=${cam}`)

  // Bitmask: bit ke-i menyala kalau systemOrder[i] terlihat.
  let mask = 0
  systemOrder.forEach((id, i) => {
    if (state.visibleSystems.includes(id)) mask |= 1 << i
  })
  // Mask penuh = semua terlihat = default; tidak perlu ditulis.
  const full = (1 << systemOrder.length) - 1
  if (mask !== full) parts.push(`v=${mask.toString(36)}`)

  const ops = systemOrder
    .map((id, i) => [i, state.opacities[id]] as const)
    .filter((e): e is readonly [number, number] => e[1] !== undefined && e[1] !== 1)
    .map(([i, op]) => `${i.toString(36)}-${enc(op * 100)}`)
  if (ops.length > 0) parts.push(`o=${ops.join(SUB)}`)

  if (state.selection.length > 0) {
    parts.push(`s=${state.selection.map((i) => i.toString(36)).join(SUB)}`)
  }
  if (state.presetId) parts.push(`p=${state.presetId}`)

  return parts.join(SEP)
}

export function decodeState(
  hash: string,
  systemOrder: readonly string[],
): DeepLinkState | null {
  const raw = hash.replace(/^#/, '')
  if (!raw) return null

  const parts = raw.split(SEP)
  if (parts[0] !== PREFIX) return null // versi tak dikenal -> jangan tebak

  const field = new Map<string, string>()
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) field.set(p.slice(0, eq), p.slice(eq + 1))
  }

  const camRaw = field.get('c')
  if (!camRaw) return null
  const nums = camRaw.split(SUB).map(dec)
  if (nums.length !== 6 || nums.some((n) => n === null)) return null
  const [px, py, pz, tx, ty, tz] = nums as number[]

  const full = (1 << systemOrder.length) - 1
  const maskRaw = field.get('v')
  const mask = maskRaw === undefined ? full : (dec(maskRaw) ?? full)
  const visibleSystems = systemOrder.filter((_, i) => (mask & (1 << i)) !== 0)

  const opacities: Record<string, number> = {}
  const opRaw = field.get('o')
  if (opRaw) {
    for (const pair of opRaw.split(SUB)) {
      const [iRaw, opRawVal] = pair.split('-')
      if (iRaw === undefined || opRawVal === undefined) continue
      const i = dec(iRaw)
      const op = dec(opRawVal)
      const id = i === null ? undefined : systemOrder[i]
      if (id !== undefined && op !== null) opacities[id] = Math.min(1, Math.max(0, op / 100))
    }
  }

  const selRaw = field.get('s')
  const selection = selRaw
    ? selRaw
        .split(SUB)
        .map(dec)
        .filter((n): n is number => n !== null && n >= 0)
    : []

  return {
    cameraPosition: [
      (px as number) / M_TO_MM,
      (py as number) / M_TO_MM,
      (pz as number) / M_TO_MM,
    ],
    cameraTarget: [
      (tx as number) / M_TO_MM,
      (ty as number) / M_TO_MM,
      (tz as number) / M_TO_MM,
    ],
    visibleSystems: [...visibleSystems],
    opacities,
    selection,
    presetId: field.get('p') ?? null,
  }
}
