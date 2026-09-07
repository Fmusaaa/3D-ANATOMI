#!/usr/bin/env python3
"""run_tests.py — jalankan seluruh test data (`npm run test:data`)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TESTS = Path(__file__).resolve().parent.parent / "tests" / "data"


def main() -> int:
    failed = []
    for t in sorted(TESTS.glob("test_*.py")):
        print(f"\n{'=' * 68}\n>> {t.name}\n{'=' * 68}")
        if subprocess.run([sys.executable, str(t)]).returncode != 0:
            failed.append(t.name)
    print()
    if failed:
        print(f"TEST GAGAL: {', '.join(failed)}")
        return 1
    print("SEMUA TEST DATA LULUS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
