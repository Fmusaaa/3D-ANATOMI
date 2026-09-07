"""
Uji klasifikasi 02_parse_ontology.py terhadap anatomi yang diketahui.

PRD §11 minta test ditulis bareng kodenya. Klasifikasi sistem/regio menyetir
filter quiz (E10 AC1), jadi salah klasifikasi = alat belajar yang salah ajar.

Jalankan: python tests/data/test_classification.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA = Path(__file__).resolve().parents[2] / "data_interim" / "structures_raw.json"

# (nama EN di BP3D, systemId harapan, regionId harapan)
PROBES: list[tuple[str, str, str]] = [
    # skeletal, lintas regio
    ("Right femur", "systema_skeletale", "membrum_inferius"),
    ("Right humerus", "systema_skeletale", "membrum_superius"),
    ("Right radius", "systema_skeletale", "membrum_superius"),
    ("Mandible", "systema_skeletale", "caput"),
    ("Sacrum", "systema_skeletale", "pelvis_perineum"),
    ("Right hip bone", "systema_skeletale", "pelvis_perineum"),
    ("Xiphoid process", "systema_skeletale", "thorax"),
    ("Fifth lumbar vertebra", "systema_skeletale", "abdomen"),
    ("Atlas", "systema_skeletale", "collum"),
    # otot
    ("Medial head of right gastrocnemius", "systema_musculare", "membrum_inferius"),
    # viscera — kasus sulit: geometris "torakal", anatomis abdominal
    ("Right kidney", "systema_urinarium", "abdomen"),
    ("Spleen", "systema_lymphoideum", "abdomen"),
    ("Pancreas", "systema_digestorium", "abdomen"),
    ("Urinary bladder", "systema_urinarium", "pelvis_perineum"),
    ("Prostate", "systema_genitale", "pelvis_perineum"),
    ("Right testis", "systema_genitale", "pelvis_perineum"),
    # kepala & leher — batas caput/collum
    ("Cerebellum", "systema_nervosum", "caput"),
    ("Pituitary gland", "glandulae_endocrinae", "caput"),
    ("Tongue", "systema_digestorium", "caput"),
    ("Right lens", "organa_sensuum", "caput"),
    ("Epiglottis", "systema_respiratorium", "collum"),
    ("Thyroid cartilage", "systema_respiratorium", "collum"),
    ("Cricoid cartilage", "systema_respiratorium", "collum"),
]


def main() -> int:
    if not DATA.exists():
        print(f"FAIL: {DATA} tidak ada. Jalankan scripts/02_parse_ontology.py dulu.")
        return 1

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    structures = doc["structures"]
    by_name: dict[str, dict] = {}
    for s in structures:
        by_name.setdefault(s["name"]["en"].lower(), s)

    # Invarian struktural (PRD §11.3)
    problems: list[str] = []
    if len({s["idx"] for s in structures}) != len(structures):
        problems.append("structureIdx tidak unik")
    if [s["idx"] for s in structures] != list(range(len(structures))):
        problems.append("structureIdx tidak rapat 0..N-1")
    zero_tri = [s["fileId"] for s in structures if s["triangles"] <= 0]
    if zero_tri:
        problems.append(f"{len(zero_tri)} struktur dengan 0 segitiga: {zero_tri[:5]}")
    unclassified = [s["fileId"] for s in structures if s["system"] == "non_classificatum"]
    if unclassified:
        problems.append(f"{len(unclassified)} struktur tanpa sistem: {unclassified[:5]}")

    # Regresi: 17 file .obj punya "# English name :" kosong. Regex yang memakai
    # \s* (yang menelan newline) melompat ke baris berikutnya dan memungut
    # "# Bounds(mm): ..." sebagai nama. Jaga supaya tidak terulang.
    junk = [s["fileId"] for s in structures if s["name"]["en"].lstrip().startswith("#")]
    if junk:
        problems.append(f"{len(junk)} struktur bernama teks header .obj: {junk[:5]}")
    blank = [s["fileId"] for s in structures if not s["name"]["en"].strip()]
    if blank:
        problems.append(f"{len(blank)} struktur tanpa nama Inggris: {blank[:5]}")
    no_fma = [s["fileId"] for s in structures if not str(s["fma"]).startswith("FMA")]
    if no_fma:
        problems.append(f"{len(no_fma)} struktur tanpa FMA id sah: {no_fma[:5]}")

    sys_ok = reg_ok = total = 0
    misses: list[str] = []
    for name, want_sys, want_reg in PROBES:
        s = by_name.get(name.lower())
        if s is None:
            misses.append(f"  {name:36s} TIDAK DITEMUKAN di dataset")
            continue
        total += 1
        if s["system"] == want_sys:
            sys_ok += 1
        else:
            misses.append(f"  {name:36s} system={s['system']} (harusnya {want_sys})")
        if s["region"] == want_reg:
            reg_ok += 1
        else:
            misses.append(
                f"  {name:36s} region={s['region']} via {s['regionVia']} (harusnya {want_reg})"
            )

    print(f"struktur    : {len(structures)}")
    print(f"sistem benar: {sys_ok}/{total}")
    print(f"regio benar : {reg_ok}/{total}")
    if misses:
        print("\nmeleset:")
        print("\n".join(misses))
    if problems:
        print("\nINVARIAN GAGAL:")
        for p in problems:
            print(f"  - {p}")

    failed = problems or sys_ok != total or reg_ok != total
    print("\n" + ("GAGAL" if failed else "LULUS"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
