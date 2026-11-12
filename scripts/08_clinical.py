#!/usr/bin/env python3
"""
08_clinical.py — kompilasi catatan klinis (PRD §E9) ke satu JSON untuk app.

Sumber kebenaran: `public/data/content/clinical/*.md`, satu catatan per file:

    ---
    fma: FMA62004, FMA50518          # satu atau lebih FMA, dipisah koma
    title: Sindrom Wallenberg
    source: Judul kuliah — dosen     # WAJIB (§E9 AC4); validator menolak yang kosong
    sourceUrl: https://...           # opsional
    compiledBy: ...                  # siapa yang meringkas, kalau bukan penulis sumber
    ---
    Isi markdown sederhana: paragraf, **tebal**, *miring*, daftar "- " dan "1. ".

Keluaran: `public/data/content/clinical.json`. Browser tidak bisa me-list
direktori, jadi app membaca satu file ini; service worker ikut mem-precache-nya
karena ia JSON di folder content.

Jalankan ulang setiap kali ada .md yang ditambah atau diubah.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT = REPO_ROOT / "public" / "data" / "content"
SRC = CONTENT / "clinical"
OUT = CONTENT / "clinical.json"


def parse(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError(f"{path.name}: tanpa front-matter")
    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError(f"{path.name}: front-matter tidak ditutup")
    fm: dict[str, str] = {}
    for line in text[3:end].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    body = text[end + 4 :].strip()
    fmas = [f.strip() for f in fm.get("fma", "").split(",") if f.strip()]
    if not fmas:
        raise ValueError(f"{path.name}: field `fma` kosong")
    if not fm.get("source"):
        raise ValueError(f"{path.name}: field `source` kosong (§E9 AC4)")
    if not fm.get("title"):
        raise ValueError(f"{path.name}: field `title` kosong")
    note = {
        "id": path.stem,
        "fma": fmas,
        "title": fm["title"],
        "source": fm["source"],
        "body": body,
    }
    if fm.get("sourceUrl"):
        note["sourceUrl"] = fm["sourceUrl"]
    if fm.get("compiledBy"):
        note["compiledBy"] = fm["compiledBy"]
    return note


def main() -> int:
    notes = [parse(p) for p in sorted(SRC.glob("*.md"))]
    OUT.write_text(
        json.dumps({"schema": 1, "notes": notes}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    fmas = {f for n in notes for f in n["fma"]}
    print(f"{len(notes)} catatan, {len(fmas)} FMA -> {OUT.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
