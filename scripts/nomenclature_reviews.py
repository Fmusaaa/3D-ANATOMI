"""
Buku besar review nomenklatur (PRD §E7 AC6) — pustaka bersama 06 & 07.

Prinsip yang tidak boleh dilanggar:

  **Keputusan manusia hidup di `data_curated/nomenclature_reviews.json`,
  BUKAN di `public/data/content/nomenclature.*.json`.**

File `public/data/content/*` adalah KELUARAN pipeline dan dibangun ulang tiap
`npm run data:build`. Kalau reviewer mengedit file itu langsung, satu kali
regenerasi menghapus seluruh kerjanya tanpa jejak. Karena itu generator (06)
membaca buku besar ini dan menimpakannya di atas hasil mesin — entri `reviewed`
tidak pernah ditulis ulang oleh mesin.

Buku besar ini juga boleh berisi FMA yang mesin LEWATI (tidak punya entri
sama sekali): overlay MENAMBAHKAN entri baru, dan begitulah cakupan tumbuh
melewati 28% yang bisa dicapai aturan.

Format:

    {
      "schema": 1,
      "reviews": [
        {
          "fma": "FMA10014",
          "lang": "la",
          "term": "Vertebra thoracica IX",
          "source": "TA2",
          "reviewedBy": "Nama Reviewer",
          "reviewedAt": "2026-09-10",
          "note": "opsional"
        }
      ]
    }
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CURATED = REPO_ROOT / "data_curated"
REVIEWS = CURATED / "nomenclature_reviews.json"
HIGH_YIELD = CURATED / "high_yield.json"

LANGS = ("la", "id")
# Harus sama dengan `valid_source` di 05_validate.py. `machine` sengaja TIDAK
# ada di sini: entri hasil review tidak boleh mengaku bersumber mesin.
REVIEW_SOURCES = ("TA98", "TA2", "FMA", "curated")


@dataclass(frozen=True)
class Review:
    fma: str
    lang: str
    term: str
    source: str
    reviewed_by: str
    reviewed_at: str
    note: str = ""

    def to_json(self) -> dict:
        d = {
            "fma": self.fma,
            "lang": self.lang,
            "term": self.term,
            "source": self.source,
            "reviewedBy": self.reviewed_by,
            "reviewedAt": self.reviewed_at,
        }
        if self.note:
            d["note"] = self.note
        return d


def validate_review(r: Review) -> list[str]:
    """Kembalikan daftar alasan penolakan; kosong = sah."""
    problems: list[str] = []
    if not r.fma.startswith("FMA") or not r.fma[3:].isdigit():
        problems.append(f"FMA id tidak sah: {r.fma!r}")
    if r.lang not in LANGS:
        problems.append(f"lang harus salah satu dari {LANGS}, bukan {r.lang!r}")
    if not r.term.strip():
        problems.append("term kosong")
    if r.source not in REVIEW_SOURCES:
        problems.append(f"source harus salah satu dari {REVIEW_SOURCES}, bukan {r.source!r}")
    # Tanpa nama, klaim "terverifikasi" tidak bisa dipertanggungjawabkan —
    # validator 05 menolaknya juga, tapi lebih baik gagal di sini, lebih awal.
    if not r.reviewed_by.strip():
        problems.append("reviewedBy kosong")
    try:
        date.fromisoformat(r.reviewed_at)
    except ValueError:
        problems.append(f"reviewedAt bukan tanggal ISO: {r.reviewed_at!r}")
    return problems


def load_reviews(path: Path = REVIEWS) -> list[Review]:
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schema") != 1:
        raise ValueError(f"{path.name}: schema {doc.get('schema')!r} tidak dikenal")
    out: list[Review] = []
    for raw in doc.get("reviews", []):
        r = Review(
            fma=str(raw.get("fma", "")),
            lang=str(raw.get("lang", "")),
            term=str(raw.get("term", "")),
            source=str(raw.get("source", "")),
            reviewed_by=str(raw.get("reviewedBy", "")),
            reviewed_at=str(raw.get("reviewedAt", "")),
            note=str(raw.get("note", "")),
        )
        problems = validate_review(r)
        if problems:
            # Buku besar yang rusak tidak boleh dilewati diam-diam: satu entri
            # cacat berarti seseorang mengedit file ini dengan tangan dan salah.
            raise ValueError(f"{path.name}: review {r.fma}/{r.lang} tidak sah: {'; '.join(problems)}")
        out.append(r)
    return out


def save_reviews(reviews: list[Review], path: Path = REVIEWS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Diurutkan supaya diff git-nya bisa dibaca manusia.
    ordered = sorted(reviews, key=lambda r: (r.lang, int(r.fma[3:])))
    path.write_text(
        json.dumps(
            {
                "schema": 1,
                "note": (
                    "Buku besar review manusia. INILAH sumber kebenaran untuk status "
                    "`reviewed`; public/data/content/nomenclature.*.json hanya keluaran. "
                    "Ubah lewat scripts/07_review_nomenclature.py, atau edit tangan "
                    "dengan hati-hati — validator menolak entri tanpa reviewedBy."
                ),
                "reviews": [r.to_json() for r in ordered],
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )


def upsert_reviews(existing: list[Review], incoming: list[Review]) -> tuple[list[Review], int, int]:
    """Gabungkan; (fma, lang) yang sama ditimpa. Kembalikan (hasil, ditambah, ditimpa)."""
    by_key = {(r.fma, r.lang): r for r in existing}
    added = replaced = 0
    for r in incoming:
        key = (r.fma, r.lang)
        if key in by_key:
            replaced += 1
        else:
            added += 1
        by_key[key] = r
    return list(by_key.values()), added, replaced


def apply_reviews(entries: list[dict], lang: str, reviews: list[Review]) -> tuple[list[dict], int, int]:
    """
    Timpakan review ke daftar entri hasil mesin untuk satu bahasa.

    Entri yang ada diganti seluruhnya (term, status, source, reviewedBy);
    FMA yang belum punya entri DITAMBAHKAN. Kembalikan (entri, diganti, ditambah).
    """
    mine = {r.fma: r for r in reviews if r.lang == lang}
    out: list[dict] = []
    replaced = 0
    seen: set[str] = set()

    for e in entries:
        fma = e["fma"]
        seen.add(fma)
        r = mine.get(fma)
        if r is None:
            out.append(e)
            continue
        out.append(_entry_from_review(r))
        replaced += 1

    added = 0
    for fma, r in mine.items():
        if fma in seen:
            continue
        out.append(_entry_from_review(r))
        added += 1

    out.sort(key=lambda e: int(e["fma"][3:]))
    return out, replaced, added


def _entry_from_review(r: Review) -> dict:
    e = {
        "fma": r.fma,
        "term": r.term.strip(),
        "source": r.source,
        "status": "reviewed",
        "reviewedBy": r.reviewed_by.strip(),
        "reviewedAt": r.reviewed_at,
    }
    if r.note.strip():
        e["note"] = r.note.strip()
    return e


def load_high_yield(path: Path = HIGH_YIELD) -> set[str]:
    """Himpunan FMA high-yield, atau kosong kalau daftarnya belum dibuat (D-010)."""
    if not path.exists():
        return set()
    doc = json.loads(path.read_text(encoding="utf-8"))
    items = doc.get("fma", doc) if isinstance(doc, dict) else doc
    if isinstance(items, dict):
        return {k for k in items if str(k).startswith("FMA")}
    return {str(x) for x in items if str(x).startswith("FMA")}
