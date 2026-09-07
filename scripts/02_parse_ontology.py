#!/usr/bin/env python3
"""
02_parse_ontology.py — parse ontologi BodyParts3D → structures_raw.json (PRD §6.2).

Menghasilkan `data_interim/structures_raw.json`: satu entri per mesh ELEMENT,
plus daftar konsep COMPOUND sebagai grup.

--------------------------------------------------------------------------
KENAPA DESAIN INI BERBEDA DARI PRD §6.2
--------------------------------------------------------------------------
PRD §6.2 bilang "tentukan systemId tiap struktur dari hierarki part-of".
Diukur di Fase 0, itu tidak bisa dilakukan:

  * tree part-of hanya merujuk 1.258 dari 2.234 mesh  -> cakupan 56,3%
  * 958 dari 1.258 mesh itu jatuh di bawah LEBIH DARI SATU node teratas,
    jadi systemId-nya ambigu
  * 19 anak teratas "human body" bukan 15 sistem seperti dugaan §6.5 —
    isinya campuran sumbu sistem (cardiovascular, nervous, ...) DAN sumbu
    regio (head, right upper limb, body proper, ...)

Tree is-a sebaliknya merujuk seluruh 2.234 mesh, dan mengklasifikasikan tiap
konsep menurut TIPE jaringan/organ (bone organ, muscle organ, region of
vascular tree organ, ...). Tipe itulah yang sebenarnya memetakan ke "sistem".

Jadi pembagian tugasnya dibalik dan dipecah dua sumbu:

    systemId  <- tree IS-A     (tipe organ; cakupan 100%)
    regionId  <- tree PART-OF  (topografi) + fallback geometris dari bbox

Lihat DECISIONS.md D-007. Kalau ini ditolak, ubah RULES di bawah.

--------------------------------------------------------------------------
UNIT STRUKTUR
--------------------------------------------------------------------------
§5.3.1 menaruh satu `aStructureIdx` per VERTEX, jadi struktur wajib berupa
partisi geometri — tidak boleh tumpang tindih. Unit yang memenuhi itu adalah
mesh ELEMENT (`FJ####`), bukan konsep FMA: satu konsep COMPOUND bisa memuat
banyak elemen, dan satu elemen bisa dipakai banyak konsep.

Maka:
    struktur  = 1 mesh ELEMENT = 1 structureIdx   (2.234 buah)
    grup      = konsep FMA yang menunjuk >=1 elemen (untuk tree & search)

Identitas tiap elemen diambil dari header di dalam file .obj sendiri
(`# Concept ID :`, `# English name :`), bukan ditebak dari tabel.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Konsol Windows default cp1252 dan meledak pada karakter non-latin1.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data_raw"
EXTRACT_DIR = RAW_DIR / "extracted"
ISA_OBJ_DIR = EXTRACT_DIR / "isa_BP3D_4.0_obj_99" / "isa_BP3D_4.0_obj_99"
INTERIM_DIR = REPO_ROOT / "data_interim"
OUT_PATH = INTERIM_DIR / "structures_raw.json"

PARTOF_ROOT = "FMA20394"  # "human body"


# --------------------------------------------------------------------------
# Peta sistem: node IS-A -> systemId (nama Latin TA, PRD §6.5)
# --------------------------------------------------------------------------
# Dievaluasi BERURUTAN dari atas: aturan pertama yang cocok dengan salah satu
# leluhur is-a sebuah konsep menang. Urutan itu penting — misalnya
# "region of papillary muscle" harus kena kardiovaskular sebelum kena muscle.
#
# Angka di komentar = jumlah mesh di subtree node itu, terukur di F0.

RULES: list[tuple[str, list[str], str]] = [
    # (systemId, [FMA ancestor ids], catatan)
    ("systema_cardiovasculare", [
        "FMA50722",   # region of vascular tree organ (974)
        "FMA66332",   # zone of artery (10)
        "FMA7232",    # cusp of cardiac valve (6)
        "FMA67598",   # leaf of cardiac valve (5)
        "FMA86212",   # region of wall of heart (3)
        "FMA268955",  # region of papillary muscle (4) — otot, tapi jantung
        "FMA86565",   # region of papillary muscle of left ventricle (1)
        "FMA228642",  # vasculature of body
        "FMA7161",    # cardiovascular system
        "FMA63812",   # set of arteries (22)
        "FMA63814",   # set of veins (13)
        "FMA3726",    # anastomosis (8)
        "FMA49907",   # pulmonary venous tree organ (7)
        # Rongga jantung (immaterial anatomical entity, tidak kena aturan tipe)
        "FMA9465", "FMA9466", "FMA11359", "FMA9291",
    ], "pembuluh + jantung; harus dinilai sebelum aturan otot"),

    ("systema_nervosum", [
        "FMA256237",  # segment of neuraxis (46)
        "FMA11195",   # segment of neural tree organ (36)
        "FMA61284",   # neural tree organ (2)
        "FMA83153",   # organ component of neuraxis (4)
        "FMA242789",  # region of ventricular system of neuraxis (6)
        "FMA242193",  # region of cerebral cortex (2)
        "FMA242770",  # region of wall of ventricular system (2)
        "FMA71235",   # region of dura mater (1)
        "FMA84081",   # circumventricular organ of neuraxis (1) — pineal
        "FMA7157",    # nervous system
        "FMA83143",   # cell part cluster of neuraxis (42)
        "FMA83929",   # white matter of neuraxis (20)
        "FMA83465",   # segment of white matter of neuraxis (14)
        "FMA67242",   # gray matter of neuraxis (14)
        "FMA223151",  # internal gray matter component (12)
        "FMA83686",   # nucleus of neuraxis (10)
        "FMA83840",   # nucleus of brain (10)
        "FMA7041",    # short ciliary nerve
        "FMA83740",   # interpeduncular fossa
        "FMA75351",   # interventricular foramen
    ], "SSP + saraf perifer"),

    ("organa_sensuum", [
        "FMA265400",  # region of vascular layer of eyeball (6)
        "FMA225818",  # region of layer of wall of eyeball (4)
        "FMA58101",   # layer of wall of eyeball (4)
        "FMA58241",   # lens (2)
        "FMA58838",   # suspensory ligament of lens (2)
        "FMA82481",   # organ chamber -> chamber of eyeball (2)
        "FMA86195",   # segment of lacrimal duct (6)
        "FMA58828",   # right vitreous body
        "FMA58829",   # left vitreous body
        "FMA59102",   # right lacrimal gland
        "FMA59103",   # left lacrimal gland
        "FMA59541",   # right lacrimal lake
        "FMA59542",   # left lacrimal lake
        "FMA52781",   # external ear
    ], "mata & adneksa; sebelum aturan ligamentum/membran"),

    ("systema_respiratorium", [
        "FMA12224",   # segment of tracheobronchial tree (101)
        "FMA7158",    # respiratory system
        "FMA55250",   # conus elasticus (2)
        "FMA55244",   # vocal ligament (2)
        "FMA55233",   # cricothyroid ligament (1)
        "FMA55130",   # epiglottis
        # Kartilago & ligamen laring: tipe is-a-nya "cartilage/ligament organ",
        # jadi tanpa aturan eksplisit ini mereka jatuh ke systema_articulare.
        "FMA55099",   # cartilago thyroidea
        "FMA9615",    # cartilago cricoidea
        "FMA55113", "FMA55114",   # cartilago arytenoidea dextra/sinistra
        "FMA55115", "FMA55116",   # cartilago corniculata dextra/sinistra
        "FMA55117", "FMA55118",   # cartilago cuneiformis dextra/sinistra
        "FMA55227",   # lig. hyoepiglotticum
        "FMA55230",   # lig. thyroepiglotticum
        "FMA55138",   # lig. thyrohyoideum medianum
        "FMA55140", "FMA55141",   # lig. thyrohyoideum laterale dextrum/sinistrum
        # Hidung = jalan napas atas.
        "FMA59503",   # cartilago septi nasi
        "FMA59505", "FMA59506",   # cartilago alaris major dextra/sinistra
        "FMA59512", "FMA59513",   # cartilago nasi lateralis dextra/sinistra
    ], "jalan napas + laring"),

    ("systema_digestorium", [
        "FMA12516",   # tooth (28)
        "FMA14092",   # zone of small intestine (54)
        "FMA14540",   # segment of large intestine (4)
        "FMA71856",   # segment of biliary tree (13)
        "FMA15737",   # hepatovenous subsector (9)
        "FMA59762",   # gingiva (2)
        "FMA63103",   # pancreatic duct tree (1)
        "FMA63120",   # parenchyma of pancreas (1)
        "FMA7206",    # duodenum (1)
        "FMA7131",    # esophagus (1)
        "FMA7148",    # stomach (1)
        "FMA7202",    # gallbladder (1)
        "FMA14542",   # appendix (1)
        "FMA19754",   # region of peritoneum (3)
        "FMA7152",    # alimentary system
        "FMA7198", "FMA10419",              # pancreas, ductus pancreaticus
        "FMA13365",                          # lobus caudatus hepatis
        "FMA14668", "FMA14669", "FMA14670",  # ductus hepaticus communis/dexter/sinister
        "FMA14539",                          # ductus cysticus
        "FMA11338",                          # junctio ileocaecalis
        "FMA54640", "FMA59816",              # lingua, labium
        "FMA59802", "FMA59803",              # gl. submandibularis dextra/sinistra
        "FMA59804", "FMA59805",              # gl. sublingualis dextra/sinistra
    ], "saluran cerna + kelenjar terkait"),

    ("systema_urinarium", [
        "FMA9704",    # ureter (2)
        "FMA15900",   # urinary bladder (1)
        "FMA19667",   # urethra (1)
        "FMA7159",    # urinary system
        "FMA7204", "FMA7205",   # ren dexter/sinister
    ], ""),

    ("systema_genitale", [    ], ""),

    ("systema_genitale", [
        "FMA19386",   # seminal vesicle (2)
        "FMA7160",    # genital system
        "FMA9600",                  # prostata
        "FMA7211", "FMA7212",       # testis dexter/sinister
        "FMA18256", "FMA18257",     # epididymis dexter/sinister
        "FMA19235", "FMA19236",     # ductus deferens dexter/sinister
        "FMA19617", "FMA19618",     # corpus spongiosum / cavernosum penis
        "FMA18247",                 # glans penis
    ], "dataset hanya menyediakan subjek pria dewasa"),

    ("glandulae_endocrinae", [
        "FMA9668",    # endocrine system
        "FMA13889",                 # hypophysis
        "FMA15629", "FMA15630",     # gl. suprarenalis dextra/sinistra
    ], "cakupan tipis di BP3D"),

    ("systema_lymphoideum", [
        "FMA7196",                  # splen
        "FMA71194", "FMA71195",     # lobus thymi dexter/sinister
    ], "cakupan BP3D sangat tipis: hanya lien & thymus"),

    ("systema_skeletale", [
        "FMA5018",    # bone organ (203)
        "FMA10483",   # zone of bone organ (1)
        "FMA7487",    # corpus sterni
        "FMA7488",    # processus xiphoideus
    ], ""),

    ("systema_articulare", [
        "FMA55107",   # cartilage organ (37)
        "FMA7538",    # cartilage organ component -> costal cartilage (14)
        "FMA21496",   # ligament organ (13)
        "FMA86375",   # ligament organ component (7)
    ], "kartilago + ligamentum"),

    ("systema_musculare", [
        "FMA5022",    # muscle organ (323)
        "FMA10474",   # zone of muscle organ (38)
        "FMA9721",    # tendon (6)
        "FMA83563",   # subdivision of muscle layer (3)
        "FMA7482",    # musculoskeletal system
        "FMA85453",   # head of muscle organ (42) — caput m. gastrocnemii dll
        "FMA32558",   # musculature (18)
        "FMA50185",   # musculature of subdivision of trunk (8)
        "FMA49072",   # right common tendinous ring (anulus Zinn)
        "FMA49073",   # left common tendinous ring
        "FMA33581", "FMA33583",     # pars ascendens m. trapezii dextra/sinistra
        "FMA33586", "FMA33587",     # pars descendens m. trapezii dextra/sinistra
        "FMA11336",                 # linea alba
        "FMA55619", "FMA55620",     # raphe pterygomandibularis dextra/sinistra
        "FMA55077",                 # raphe pharyngis
        "FMA258847", "FMA264844",   # tendo calcaneus dexter/sinister (Achilles)
    ], "dinilai SETELAH kardiovaskular supaya m. papillaris tidak salah masuk"),

    ("integumentum_commune", [
        "FMA7163",    # skin (1)
        "FMA74657",   # integument
        "FMA72979",   # integumentary system
        "FMA57965",   # zone of investing fascia (2)
        "FMA79063",   # deep fascial system
        "FMA82500",   # membranous layer (2)
        "FMA7145",    # membrane organ (10)
        "FMA54237",   # supercilium
        "FMA54241",   # capilli
        "FMA54319",   # pubes
    ], "kulit + fascia"),
]

# Regio (PRD §6.5) <- node tree part-of. Dicek dari node TERDALAM ke atas,
# jadi entri paling spesifik menang.
REGION_FROM_PARTOF: dict[str, str] = {
    # caput
    "FMA7154": "caput",            # head
    "FMA24728": "caput",           # face
    "FMA54545": "caput",           # head proper
    # collum
    "FMA7155": "collum",           # neck
    "FMA24189": "collum",          # back of neck
    # truncus
    "FMA259209": "thorax",         # thoracic segment of trunk
    "FMA85008": "thorax",          # compartment of thorax
    "FMA259211": "abdomen",        # abdominal segment of trunk
    "FMA9579": "pelvis_perineum",  # perineum
    # membra
    "FMA7185": "membrum_superius",
    "FMA7186": "membrum_superius",
    "FMA7187": "membrum_inferius",
    "FMA7188": "membrum_inferius",
    "FMA7184": "membrum_inferius",
}

# --------------------------------------------------------------------------
# Landmark geometris — DIUKUR dari struktur nyata di dataset ini (satuan mm,
# Z-up, origin di telapak kaki). Bukan angka karangan; sumbernya di komentar.
# --------------------------------------------------------------------------
Z_CAPUT = 1445.0    # tepat di atas os hyoideum (Z atas 1440,9); larynx & epiglottis
                    # (Zc 1396-1423) jatuh ke collum, mandibula (Zc 1463,9) tetap caput
Z_COLLUM = 1330.0   # manubrium atas 1325,2 / clavicula 1332,0
Z_DIAPHRAGMA = 1150.0  # kubah diafragma; lien Zc=1086,7 & ren Zc=1019,0 ada DI BAWAHNYA
Z_THORAX = 1075.0   # vertebra T12 Zc=1075,8
Z_ABDOMEN = 925.0   # vertebra L5 Zc=929,7 (promontorium)
Z_PELVIS = 740.0    # tepi bawah os coxae (Z 752,2)
X_MEMBRUM_SUP = 140.0   # humerus Xc=190,5 vs clavicula Xc=77,5
X_MIDLINE = 35.0        # struktur midline perineum vs tungkai

# Viscera dinilai terhadap kubah diafragma, bukan T12: lien dan ren secara
# geometris "torakal" tapi secara anatomis abdominal.
VISCERAL_SYSTEMS = {
    "systema_digestorium",
    "systema_urinarium",
    "systema_lymphoideum",
    "glandulae_endocrinae",
    "systema_genitale",
}


# --------------------------------------------------------------------------
# IO
# --------------------------------------------------------------------------


def read_tsv(path: Path) -> tuple[list[str], list[list[str]]]:
    """Semua file teks BP3D: UTF-8, LF, TAB, baris pertama header (terverifikasi F0)."""
    with path.open(encoding="utf-8") as fh:
        header = next(fh).rstrip("\n").split("\t")
        rows = [ln.rstrip("\n").split("\t") for ln in fh if ln.strip()]
    bad = [i for i, r in enumerate(rows) if len(r) != len(header)]
    if bad:
        raise SystemExit(
            f"{path.name}: {len(bad)} baris punya jumlah kolom != {len(header)} "
            f"(pertama di baris {bad[0] + 2}). Format berubah — perbarui parser."
        )
    return header, rows


# Pola WAJIB dibatasi per baris ([^\r\n]*, bukan .+? dengan \s*).
# 17 file BP3D punya "# English name :" dan "# Concept ID :" KOSONG; dengan
# \s* yang bisa menelan newline, regex melompat ke baris berikutnya dan
# mengarang nilai dari "# Bounds(mm): ...". Bug ini sempat lolos ke data.
HEADER_RE = {
    "concept": re.compile(r"^# Concept ID[ \t]*:[ \t]*([^\r\n]*)", re.M),
    "name_en": re.compile(r"^# English name[ \t]*:[ \t]*([^\r\n]*)", re.M),
    "file_id": re.compile(r"^# File ID[ \t]*:[ \t]*([^\r\n]*)", re.M),
    "repr_id": re.compile(r"^# Representation ID[ \t]*:[ \t]*([^\r\n]*)", re.M),
    "bounds": re.compile(
        r"^# Bounds\(mm\):[ \t]*\(([-\d.,]+)\)-\(([-\d.,]+)\)", re.M
    ),
}


@dataclass
class Element:
    """Satu mesh ELEMENT = satu struktur = satu structureIdx."""

    file_id: str
    concept: str
    name_en: str
    repr_id: str
    bbox_min: list[float]
    bbox_max: list[float]
    triangles: int
    system: str = "non_classificatum"
    system_via: str = ""
    region: str = "non_classificatum"
    region_via: str = ""
    laterality: str | None = None
    groups: list[str] = field(default_factory=list)

    @property
    def centroid(self) -> list[float]:
        return [(a + b) / 2 for a, b in zip(self.bbox_min, self.bbox_max)]


def parse_obj_header(path: Path) -> Element:
    # Header ada di ~1 KB pertama; jangan baca 600 KB cuma untuk 12 baris.
    head = path.read_bytes()[:2048].decode("utf-8", "replace")

    def grab(key: str) -> str:
        m = HEADER_RE[key].search(head)
        if not m:
            raise SystemExit(f"{path.name}: header '# {key}' tidak ditemukan. Format .obj berubah.")
        return m.group(1).strip()

    mb = HEADER_RE["bounds"].search(head)
    if not mb:
        raise SystemExit(f"{path.name}: '# Bounds(mm)' tidak ditemukan.")
    lo = [float(x) for x in mb.group(1).split(",")]
    hi = [float(x) for x in mb.group(2).split(",")]

    # Jumlah segitiga butuh seluruh file; murah karena hanya menghitung baris.
    tri = path.read_bytes().count(b"\nf ")

    file_id = grab("file_id")
    if not file_id:
        raise SystemExit(f"{path.name}: '# File ID' kosong. Tidak bisa diidentifikasi.")

    return Element(
        file_id=file_id,
        concept=grab("concept"),
        name_en=grab("name_en"),
        repr_id=grab("repr_id"),
        bbox_min=lo,
        bbox_max=hi,
        triangles=tri,
    )


# --------------------------------------------------------------------------
# Klasifikasi
# --------------------------------------------------------------------------


def build_tree(rows: list[list[str]]) -> tuple[dict[str, str], dict[str, str]]:
    parent: dict[str, str] = {}
    names: dict[str, str] = {}
    for p, pn, c, cn in rows:
        parent[c] = p
        names.setdefault(p, pn)
        names.setdefault(c, cn)
    return parent, names


def ancestors(node: str, parent: dict[str, str]) -> list[str]:
    """Rantai leluhur termasuk node itu sendiri. Aman terhadap siklus."""
    chain, seen = [node], {node}
    cur = node
    while cur in parent:
        cur = parent[cur]
        if cur in seen:
            break
        seen.add(cur)
        chain.append(cur)
    return chain


def classify_system(concepts: list[str], isa_parent: dict[str, str]) -> tuple[str, str]:
    """systemId dari tipe is-a. Aturan pertama yang cocok menang."""
    anc: set[str] = set()
    for c in concepts:
        anc.update(ancestors(c, isa_parent))
    for system_id, nodes, _note in RULES:
        for n in nodes:
            if n in anc:
                return system_id, n
    return "non_classificatum", ""


LATERAL_RE = [
    (re.compile(r"\bright\b", re.I), "right"),
    (re.compile(r"\bleft\b", re.I), "left"),
]


def detect_laterality(name: str, centroid_x: float) -> str | None:
    for rx, side in LATERAL_RE:
        if rx.search(name):
            return side
    # Median: bbox terpusat di bidang midsagital.
    return "median" if abs(centroid_x) < 5.0 else None


def classify_region_geometric(el: Element) -> str:
    """
    Fallback saat tree part-of tidak mencakup struktur.

    ⚠️ Ini tebakan spasial, bukan fakta ontologis — hasilnya ditandai
    `regionVia: "geometris"` supaya konsumen data bisa memperlakukannya sebagai
    keyakinan rendah. Akurasi terukur pada set uji ada di scripts/README.md.
    """
    z = el.centroid[2]
    x = abs(el.centroid[0])

    # Tungkai bawah lebih dulu: rentang Z-nya tumpang tindih dengan pelvis.
    if z < Z_PELVIS:
        return "membrum_inferius" if x > X_MIDLINE else "pelvis_perineum"
    # Lengan: jauh dari midline pada ketinggian batang tubuh.
    if x > X_MEMBRUM_SUP and z > 900.0:
        return "membrum_superius"
    if z >= Z_CAPUT:
        return "caput"
    if z >= Z_COLLUM:
        return "collum"

    batas = Z_DIAPHRAGMA if el.system in VISCERAL_SYSTEMS else Z_THORAX
    if z >= batas:
        return "thorax"
    if z >= Z_ABDOMEN:
        return "abdomen"
    return "pelvis_perineum"


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0, help="hanya proses N mesh pertama (debug)")
    args = ap.parse_args()

    if not ISA_OBJ_DIR.is_dir():
        raise SystemExit(f"Tidak ada {ISA_OBJ_DIR}. Jalankan 01_download.py dulu.")

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)

    print("Membaca tabel ontologi...")
    _, isa_rel = read_tsv(RAW_DIR / "isa_inclusion_relation_list.txt")
    _, po_rel = read_tsv(RAW_DIR / "partof_inclusion_relation_list.txt")
    _, isa_ep = read_tsv(RAW_DIR / "isa_element_parts.txt")
    _, po_ep = read_tsv(RAW_DIR / "partof_element_parts.txt")
    _, isa_parts = read_tsv(RAW_DIR / "isa_parts_list_e.txt")

    isa_parent, isa_names = build_tree(isa_rel)
    po_parent, po_names = build_tree(po_rel)
    concept_name = {r[0]: r[2] for r in isa_parts}

    # elemen -> konsep yang memuatnya (dua arah, dua tree)
    fj_to_concepts: dict[str, set[str]] = collections.defaultdict(set)
    concept_to_fj: dict[str, set[str]] = collections.defaultdict(set)
    for cid, _nm, fid in isa_ep:
        fj_to_concepts[fid].add(cid)
        concept_to_fj[cid].add(fid)
    fj_to_po_concepts: dict[str, set[str]] = collections.defaultdict(set)
    for cid, _nm, fid in po_ep:
        fj_to_po_concepts[fid].add(cid)

    obj_files = sorted(ISA_OBJ_DIR.glob("*.obj"))
    if args.limit:
        obj_files = obj_files[: args.limit]
    print(f"Membaca header {len(obj_files)} mesh...")

    elements: list[Element] = []
    for i, p in enumerate(obj_files, 1):
        elements.append(parse_obj_header(p))
        if i % 500 == 0:
            print(f"  {i}/{len(obj_files)}")

    # Konsistensi: nama file harus sama dengan File ID di header.
    mismatch = [e.file_id for e, p in zip(elements, obj_files) if e.file_id != p.stem]
    if mismatch:
        raise SystemExit(f"{len(mismatch)} file .obj punya File ID != nama file, mis. {mismatch[:5]}")

    # Bounding box tubuh, untuk fallback regio.
    body = {
        "x_half": max(max(abs(e.bbox_min[0]), abs(e.bbox_max[0])) for e in elements),
        "z_min": min(e.bbox_min[2] for e in elements),
        "z_max": max(e.bbox_max[2] for e in elements),
    }

    # 17 file punya Concept ID & English name kosong di header. Pulihkan dari
    # tabel is-a: ambil konsep TERDALAM yang merujuk elemen itu. Jangan
    # mengarang — kalau tabel juga tidak punya, biarkan kosong dan laporkan.
    def isa_depth(c: str) -> int:
        d, seen, cur = 0, set(), c
        while cur in isa_parent and cur not in seen:
            seen.add(cur)
            cur = isa_parent[cur]
            d += 1
        return d

    recovered: list[str] = []
    still_unknown: list[str] = []
    for el in elements:
        if el.concept and el.name_en:
            continue
        cands = sorted(fj_to_concepts.get(el.file_id, set()), key=isa_depth, reverse=True)
        if cands:
            deepest = cands[0]
            el.concept = el.concept or deepest
            el.name_en = el.name_en or concept_name.get(deepest, isa_names.get(deepest, ""))
            recovered.append(el.file_id)
        if not el.concept or not el.name_en:
            still_unknown.append(el.file_id)
    if recovered:
        print(f"identitas dipulihkan dari tabel is-a untuk {len(recovered)} mesh "
              f"(header .obj kosong)")
    if still_unknown:
        print(f"⚠️  {len(still_unknown)} mesh tetap tanpa identitas: {still_unknown[:10]}")

    print("Mengklasifikasi...")
    for el in elements:
        concepts = sorted(fj_to_concepts.get(el.file_id, set()) | {el.concept})
        el.groups = [c for c in concepts if c != el.concept]

        el.system, node = classify_system(concepts, isa_parent)
        el.system_via = f"{node} ({isa_names.get(node, concept_name.get(node, '?'))})" if node else ""

        # Regio: part-of dulu (otoritatif), lalu geometri.
        region = None
        for c in sorted(fj_to_po_concepts.get(el.file_id, set())):
            for a in ancestors(c, po_parent):
                if a in REGION_FROM_PARTOF:
                    region = REGION_FROM_PARTOF[a]
                    break
            if region:
                break
        if region:
            # BP3D tidak punya node regio "pelvis": os coxae dan os sacrum
            # masuk "abdominal segment of trunk". Kita pisahkan di promontorium
            # (L5, Z=929,7) — batas anatomis abdomen/pelvis yang sebenarnya.
            if region == "abdomen" and el.centroid[2] < Z_ABDOMEN:
                region = "pelvis_perineum"
                el.region, el.region_via = region, "part-of+promontorium"
            else:
                el.region, el.region_via = region, "part-of"
        else:
            el.region, el.region_via = classify_region_geometric(el), "geometris"

        el.laterality = detect_laterality(el.name_en, el.centroid[0])

    # ---------------- laporan ----------------
    sys_count = collections.Counter(e.system for e in elements)
    reg_count = collections.Counter(e.region for e in elements)
    via_count = collections.Counter(e.region_via for e in elements)
    lat_count = collections.Counter(e.laterality or "(tidak diketahui)" for e in elements)
    unclassified = [e for e in elements if e.system == "non_classificatum"]

    print("\n" + "=" * 70)
    print(f"{len(elements)} struktur (mesh ELEMENT), {sum(e.triangles for e in elements):,} segitiga")
    print("=" * 70)
    print("\nsystemId (dari tree IS-A):")
    for s, n in sys_count.most_common():
        print(f"  {s:28s} {n:5d}  ({100 * n / len(elements):4.1f}%)")
    print("\nregionId:")
    for r, n in reg_count.most_common():
        print(f"  {r:28s} {n:5d}")
    print("\nsumber regio:", dict(via_count))
    print("lateralitas :", dict(lat_count))

    if unclassified:
        print(f"\n⚠️  {len(unclassified)} struktur TIDAK terklasifikasi sistemnya:")
        for e in unclassified[:20]:
            print(f"    {e.file_id}  {e.concept:12s} {e.name_en[:52]}")
        if len(unclassified) > 20:
            print(f"    ... dan {len(unclassified) - 20} lagi")
        print("    -> tambahkan node leluhurnya ke RULES, jangan dibiarkan.")

    groups = {
        cid: {
            "fma": cid,
            "name_en": concept_name.get(cid, isa_names.get(cid, "")),
            "elements": sorted(fjs),
        }
        for cid, fjs in concept_to_fj.items()
        if len(fjs) > 1
    }

    payload = {
        "schema": 1,
        "source": "BodyParts3D 4.0 (isa tree)",
        "note": (
            "structureIdx = index dalam array `structures` di bawah, urut menaik. "
            "Satuan mm, Z-up, origin di telapak kaki — konversi ke konvensi viewer "
            "dilakukan di 04_pack_batches.py."
        ),
        "body_bbox_mm": body,
        "structures": [
            {
                "idx": i,
                "fileId": e.file_id,
                "fma": e.concept,
                "reprId": e.repr_id,
                "name": {"en": e.name_en},
                "system": e.system,
                "systemVia": e.system_via,
                "region": e.region,
                "regionVia": e.region_via,
                "laterality": e.laterality,
                "bbox": [e.bbox_min, e.bbox_max],
                "centroid": [round(v, 4) for v in e.centroid],
                "triangles": e.triangles,
                "groups": e.groups,
            }
            for i, e in enumerate(elements)
        ],
        "groups": list(groups.values()),
    }
    OUT_PATH.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    size_mb = OUT_PATH.stat().st_size / 1024 / 1024
    print(f"\nDitulis: {OUT_PATH.relative_to(REPO_ROOT)}  ({size_mb:.1f} MB)")
    print(f"  struktur : {len(elements)}")
    print(f"  grup     : {len(groups)} konsep COMPOUND (>1 elemen)")

    return 1 if unclassified else 0


if __name__ == "__main__":
    sys.exit(main())
