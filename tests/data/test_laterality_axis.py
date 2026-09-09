"""
Kunci konvensi sumbu lateral: sisi KANAN pasien ada di X negatif.

Kenapa ini perlu diuji di level data, bukan cuma di TypeScript:

`keptSide()` di `src/viewer/types.ts` memetakan setengah-ruang +X ke "sinistra".
Unit test TypeScript hanya membuktikan pemetaan itu konsisten dengan dirinya
sendiri — kalau konvensi datanya ternyata kebalikan, seluruh rantainya tetap
"lulus" sambil melabeli sisi kiri pasien sebagai dextra.

Tubuh manusia nyaris simetris kiri-kanan, jadi kesalahan ini TIDAK akan terlihat
di layar. Satu-satunya cara menangkapnya adalah membandingkan label lateralitas
di ontologi dengan letak geometri sebenarnya di file .atlas.

Jalankan: python tests/data/test_laterality_axis.py
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
GEOMETRY = ROOT / "public" / "data" / "geometry"
STRUCTURES = ROOT / "public" / "data" / "content" / "structures.json"

# Struktur berlabel lateral yang pusat bbox-nya menyeberang garis tengah itu
# wajar: organ besar bisa melewati mediana (mis. lobus hepatis). Yang tidak
# wajar adalah kalau MAYORITAS-nya menyeberang — itu tanda sumbunya terbalik.
MIN_SESUAI = 0.90


def baca_header(path: Path) -> dict:
    with path.open("rb") as f:
        magic = f.read(8)
        if magic != b"ATLAS001":
            raise ValueError(f"{path.name}: MAGIC {magic!r} bukan b'ATLAS001'")
        panjang = struct.unpack("<I", f.read(4))[0]
        return json.loads(f.read(panjang).decode("utf-8"))


def main() -> int:
    if not GEOMETRY.is_dir() or not STRUCTURES.is_file():
        print("Aset belum dibangun — jalankan `npm run data:build` dulu.")
        return 1

    meta = {
        s["idx"]: s
        for s in json.loads(STRUCTURES.read_text(encoding="utf-8"))["structures"]
    }

    # laterality -> daftar koordinat X pusat bbox
    pusat: dict[str, list[float]] = {"right": [], "left": [], "median": []}
    for path in sorted(GEOMETRY.glob("*.atlas")):
        for st in baca_header(path)["structures"]:
            m = meta.get(st["idx"])
            if m is None:
                continue
            sisi = m.get("laterality")
            if sisi in pusat:
                pusat[sisi].append((st["bbox"][0][0] + st["bbox"][1][0]) / 2)

    problems: list[str] = []

    for sisi, tanda, arah in (("right", -1, "negatif"), ("left", +1, "positif")):
        xs = pusat[sisi]
        if not xs:
            problems.append(f"tidak ada struktur berlabel '{sisi}' — data tidak lengkap?")
            continue
        sesuai = sum(1 for x in xs if x * tanda > 0)
        rasio = sesuai / len(xs)
        print(f"{sisi:6s}: {sesuai:4d}/{len(xs):4d} ({rasio:5.1%}) ada di X {arah}")
        if rasio < MIN_SESUAI:
            problems.append(
                f"hanya {rasio:.1%} struktur '{sisi}' yang ada di X {arah} "
                f"(minimum {MIN_SESUAI:.0%}). Sumbu lateral kemungkinan TERBALIK — "
                f"periksa keptSide() di src/viewer/types.ts sebelum apa pun dirilis."
            )

    # Struktur mediana harus mengelompok di dekat X=0; kalau tidak, "tengah"
    # yang dipakai bidang sagital juga tidak bisa dipercaya.
    med = pusat["median"]
    if med:
        jauh = [x for x in med if abs(x) > 0.05]
        print(f"median: {len(med) - len(jauh)}/{len(med)} berada dalam ±50 mm dari X=0")
        if len(jauh) > len(med) * 0.25:
            problems.append(
                f"{len(jauh)}/{len(med)} struktur 'median' lebih dari 50 mm dari X=0 — "
                f"model mungkin tidak ter-center di sumbu X"
            )

    if problems:
        print("\nINVARIAN GAGAL:")
        for p in problems:
            print(f"  - {p}")

    print("\n" + ("GAGAL" if problems else "LULUS"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
