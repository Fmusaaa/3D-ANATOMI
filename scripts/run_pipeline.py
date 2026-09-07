#!/usr/bin/env python3
"""
run_pipeline.py — jalankan seluruh pipeline data lalu validasi (`npm run data:build`).

Urutan 02 -> 03 -> 04 -> 05. Berhenti di langkah pertama yang gagal.
01_download.py TIDAK ikut: unduhan 200 MB dijalankan sekali lewat
`npm run data:download`.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
STEPS = [
    ("02_parse_ontology.py", "parse ontologi -> structures_raw.json"),
    ("03_decimate.py", "bersihkan + decimate mesh"),
    ("04_pack_batches.py", "pack .atlas + manifest"),
    ("05_validate.py", "validasi invarian (PRD §11.3)"),
]


def main() -> int:
    if not (HERE.parent / "data_raw" / "isa_parts_list_e.txt").exists():
        print("data_raw/ kosong. Jalankan dulu: npm run data:download")
        return 1

    t0 = time.monotonic()
    for script, desc in STEPS:
        print(f"\n{'=' * 68}\n>> {script} — {desc}\n{'=' * 68}")
        r = subprocess.run([sys.executable, str(HERE / script)])
        if r.returncode != 0:
            print(f"\nPIPELINE GAGAL di {script} (exit {r.returncode})")
            return r.returncode
    print(f"\nPIPELINE LULUS dalam {time.monotonic() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
