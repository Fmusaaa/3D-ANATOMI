/**
 * Loader metadata struktur (`content/structures.json`, PRD §6.4).
 *
 * Dipisah dari `src/viewer/**` dengan sengaja: viewer hanya butuh geometri.
 * Nama, sistem, regio, dan kualitas mesh adalah urusan UI.
 */

export type Laterality = 'left' | 'right' | 'median' | null

export interface StructureMeta {
  idx: number
  fma: string
  fileId: string
  system: string
  region: string
  /** "part-of" (ontologis) atau "geometris" (tebakan spasial, keyakinan rendah). */
  regionVia: string
  laterality: Laterality
  name: { en: string }
  highYield: boolean
  meshQuality: number
}

export interface StructureIndex {
  byIdx: Map<number, StructureMeta>
  /** §E10 AC13: di bawah ambang ini mesh dianggap terlalu rusak untuk quiz klik. */
  meshQualityExcludeBelow: number
}

interface RawDoc {
  structures: StructureMeta[]
  meshQualityExcludeBelow: number
}

export async function loadStructures(baseUrl = '/data'): Promise<StructureIndex> {
  const res = await fetch(`${baseUrl}/content/structures.json`)
  if (!res.ok) throw new Error(`structures.json HTTP ${res.status}`)
  const doc = (await res.json()) as RawDoc
  const byIdx = new Map<number, StructureMeta>()
  for (const s of doc.structures) byIdx.set(s.idx, s)
  return { byIdx, meshQualityExcludeBelow: doc.meshQualityExcludeBelow }
}

export const SYSTEM_LABEL: Record<string, { la: string; id: string }> = {
  systema_skeletale: { la: 'Systema skeletale', id: 'Rangka' },
  systema_articulare: { la: 'Systema articulare', id: 'Sendi & kartilago' },
  systema_musculare: { la: 'Systema musculare', id: 'Otot' },
  systema_nervosum: { la: 'Systema nervosum', id: 'Saraf' },
  systema_cardiovasculare: { la: 'Systema cardiovasculare', id: 'Jantung & pembuluh' },
  systema_lymphoideum: { la: 'Systema lymphoideum', id: 'Limfoid' },
  systema_respiratorium: { la: 'Systema respiratorium', id: 'Pernapasan' },
  systema_digestorium: { la: 'Systema digestorium', id: 'Pencernaan' },
  systema_urinarium: { la: 'Systema urinarium', id: 'Kemih' },
  systema_genitale: { la: 'Systema genitale', id: 'Genital' },
  glandulae_endocrinae: { la: 'Glandulae endocrinae', id: 'Endokrin' },
  organa_sensuum: { la: 'Organa sensuum', id: 'Organ indra' },
  integumentum_commune: { la: 'Integumentum commune', id: 'Kulit' },
}

export const REGION_LABEL: Record<string, string> = {
  caput: 'Caput (kepala)',
  collum: 'Collum (leher)',
  thorax: 'Thorax (dada)',
  abdomen: 'Abdomen (perut)',
  pelvis_perineum: 'Pelvis & perineum',
  dorsum: 'Dorsum (punggung)',
  membrum_superius: 'Membrum superius (ekstremitas atas)',
  membrum_inferius: 'Membrum inferius (ekstremitas bawah)',
}

export const LATERALITY_LABEL: Record<string, string> = {
  left: 'Sinistra (kiri)',
  right: 'Dextra (kanan)',
  median: 'Mediana (garis tengah)',
}

/** Tautan ke sumber ontologi resmi, supaya FMA ID bisa diklik (§E3 AC4). */
export function fmaUrl(fma: string): string {
  return `https://bioportal.bioontology.org/ontologies/FMA?p=classes&conceptid=http%3A%2F%2Fpurl.org%2Fsig%2Font%2Ffma%2F${fma.toLowerCase()}`
}
