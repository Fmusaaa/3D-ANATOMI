"""
Draf nomenklatur Latin hasil ingatan model bahasa (LLM) — pustaka untuk 06.

`data_curated/nomenclature_draft.tsv` berisi ~1.100 istilah Terminologia
Anatomica yang ditulis Claude dari ingatan, satu baris per nama Inggris FMA
yang sudah dinormalkan. Generator berbasis aturan hanya menjangkau 28% konsep
dan salah urutan kata di banyak tempat ("Arteria apicalis segmentalis");
draf ini menutup sebagian besar sisanya.

⚠️ INI BUKAN HASIL REVIEW. Setiap entri keluar dengan `source: "llm"` dan
status `machine` (atau `needs-review` kalau kolom `unsure` terisi). Artinya:
tetap berbadge di UI, tetap TIDAK boleh jadi jawaban benar di quiz, dan tetap
kalah oleh keputusan manusia di `nomenclature_reviews.json`. Ingatan model
bisa salah dengan sangat meyakinkan — itu sebabnya statusnya tidak dinaikkan.

Prioritas di 06:  review manusia  >  draf LLM  >  aturan.

Lateralitas tidak ditulis dua kali:
  * "Left X" / "Right X"   -> istilah dasar X + sinister/dexter mengikuti
                              genus kata kepala ("Arteria ... sinistra").
  * "... of left Y"        -> draf menulis bentuk kiri; bentuk kanan didapat
                              dengan menukar akar sinistr- menjadi dextr-.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DRAFT = REPO_ROOT / "data_curated" / "nomenclature_draft.tsv"

# Genus kata kepala Latin -> bentuk sinister/dexter yang cocok.
# Kata kepala yang tidak ada di sini TIDAK diberi lateralitas (lebih baik kosong
# daripada "Ren sinistra").
_M = ("sinister", "dexter")
_F = ("sinistra", "dextra")
_N = ("sinistrum", "dextrum")
_MPL = ("sinistri", "dextri")
_FPL = ("sinistrae", "dextrae")
_NPL = ("sinistra", "dextra")

HEAD_GENDER: dict[str, tuple[str, str]] = {
    **{w: _M for w in (
        "Musculus", "Ramus", "Nervus", "Gyrus", "Bronchus", "Ren", "Humerus", "Radius",
        "Talus", "Calcaneus", "Testis", "Ureter", "Ventriculus", "Thalamus", "Hippocampus",
        "Globus", "Nucleus", "Colliculus", "Lobus", "Lobulus", "Tractus", "Truncus", "Arcus",
        "Ductus", "Discus", "Dens", "Tendo", "Tarsus", "Lacertus", "Canaliculus", "Saccus",
        "Lacus", "Plexus", "Pedunculus", "Anulus", "Sinus", "Processus",
    )},
    **{w: _F for w in (
        "Arteria", "Vena", "Costa", "Phalanx", "Pars", "Glandula", "Cartilago", "Ulna",
        "Tibia", "Fibula", "Clavicula", "Scapula", "Patella", "Epididymis", "Vesicula",
        "Membrana", "Camera", "Lens", "Iris", "Cornea", "Sclera", "Choroidea", "Insula",
        "Capsula", "Stria", "Trochlea", "Zonula", "Concha", "Maxilla", "Auris", "Tunica",
        "Substantia", "Cavitas", "Cuspis", "Valvula", "Raphe", "Habenula",
    )},
    **{w: _N for w in (
        "Os", "Ligamentum", "Caput", "Ganglion", "Corpus", "Femur", "Putamen",
        "Retinaculum", "Rete", "Brachium", "Supercilium", "Segmentum",
    )},
    **{w: _MPL for w in ("Musculi", "Rami", "Nervi")},
    **{w: _FPL for w in ("Arteriae", "Venae", "Costae")},
    **{w: _NPL for w in ("Ossa",)},
}

# Kata kepala Latin -> padanan Indonesia, mengikuti konvensi 06 ("arteri
# femoralis"): kepala di-Indonesiakan, sisanya tetap Latin. Kata kepala di luar
# daftar ini TIDAK mendapat entri Indonesia — menyalin istilah Latin utuh lalu
# melabelinya "Indonesia" adalah bahasa yang menyamar (lihat CLAUDE.md).
HEAD_ID: dict[str, str] = {
    "Arteria": "Arteri", "Arteriae": "Arteri", "Vena": "Vena", "Venae": "Vena",
    "Musculus": "Otot", "Musculi": "Otot", "Os": "Tulang", "Ossa": "Tulang",
    "Cartilago": "Kartilago", "Costa": "Kosta", "Costae": "Kosta", "Dens": "Gigi",
    "Gyrus": "Girus", "Lobus": "Lobus", "Ventriculus": "Ventrikel",
    "Glandula": "Kelenjar", "Ductus": "Duktus", "Membrana": "Membran",
    "Nucleus": "Nukleus", "Arcus": "Arkus", "Discus": "Diskus", "Truncus": "Trunkus",
    "Phalanx": "Falang", "Corpus": "Korpus", "Colliculus": "Kolikulus",
    "Bronchus": "Bronkus", "Plexus": "Pleksus", "Tractus": "Traktus",
    "Commissura": "Komisura", "Capsula": "Kapsul", "Nervus": "Saraf",
}

_PREFIX = re.compile(r"^(Left|Right) (.+)$")
_HAS_LEFT = re.compile(r"\bleft\b", re.I)
_HAS_RIGHT = re.compile(r"\bright\b", re.I)


def normalize_key(name_en: str) -> tuple[str, str | None, bool]:
    """
    Nama Inggris FMA -> (kunci draf, sisi awalan, perlu-tukar-ke-kanan).

    Kunci draf selalu memakai "left" untuk lateralitas di dalam nama. Kalau
    nama aslinya memuat "right" di dalam, hasil Latin-nya ditukar ke dextr-.
    """
    side = None
    m = _PREFIX.match(name_en)
    rest = name_en
    if m:
        side, rest = m.group(1).lower(), m.group(2)
    swap = bool(_HAS_RIGHT.search(rest))
    if swap and _HAS_LEFT.search(rest):
        # Kiri DAN kanan di satu nama: menukar semuanya pasti salah. Lewati.
        return "", None, False
    key = re.sub(r"\b[Rr]ight\b", "left", rest).lower().strip()
    return key, side, swap


def to_dexter(latin: str) -> str:
    latin = re.sub(r"\bsinister\b", "dexter", latin)
    return re.sub(r"\bsinistr(ae|am|is|um|i|o|a)\b", r"dextr\1", latin)


def load_draft(path: Path = DRAFT) -> dict[str, tuple[str, bool, str]]:
    """kunci -> (latin, ragu, indonesia eksplisit atau '')."""
    if not path.exists():
        return {}
    out: dict[str, tuple[str, bool, str]] = {}
    with path.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            key = (row.get("key") or "").strip()
            latin = (row.get("latin") or "").strip()
            if not key or not latin:
                continue
            if key in out:
                raise ValueError(f"{path.name}: kunci ganda {key!r}")
            out[key] = (latin, bool((row.get("unsure") or "").strip()), (row.get("indonesia") or "").strip())
    return out


def resolve(name_en: str, draft: dict[str, tuple[str, bool, str]]) -> tuple[str, bool, str] | None:
    """Nama Inggris -> (latin, ragu, indonesia eksplisit) atau None kalau draf tidak punya."""
    key, side, swap = normalize_key(name_en)
    if not key or key not in draft:
        return None
    latin, unsure, idn = draft[key]
    if swap:
        if "sinist" not in latin:
            # Draf tidak menulis lateralitas untuk nama ini; menebaknya = salah.
            return None
        latin = to_dexter(latin)
    if side:
        forms = HEAD_GENDER.get(latin.split()[0])
        if forms is None:
            return None
        latin = f"{latin} {forms[0 if side == 'left' else 1]}"
        # Padanan Indonesia eksplisit ditulis untuk bentuk tanpa sisi.
        idn = f"{idn} {'kiri' if side == 'left' else 'kanan'}" if idn else ""
    return latin, unsure, idn


def indonesian_from_latin(latin: str, explicit: str) -> str | None:
    if explicit:
        return explicit
    words = latin.split()
    head = HEAD_ID.get(words[0])
    if head is None:
        return None
    return " ".join([head, *words[1:]])
