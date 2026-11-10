"""
Uji draf nomenklatur LLM (scripts/nomenclature_draft.py).

Draf ini ditulis model bahasa dari ingatan, jadi yang diuji bukan kebenaran
tiap istilah (itu tugas review manusia) melainkan MESIN di sekelilingnya:
turunan kiri/kanan tidak boleh salah genus, tidak boleh menebak saat draf
tidak menulis lateralitas, dan hasilnya tidak boleh pernah berstatus reviewed.

Jalankan: python tests/data/test_nomenclature_draft.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from nomenclature_draft import (  # noqa: E402
    HEAD_GENDER,
    indonesian_from_latin,
    load_draft,
    normalize_key,
    resolve,
    to_dexter,
)

FAILED: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK ' if ok else 'BUG'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        FAILED.append(name)


def main() -> int:
    draft = load_draft()
    check("draf termuat", len(draft) > 1000, f"{len(draft)} baris")

    print("\nnormalisasi kunci")
    check("awalan Left dilepas", normalize_key("Left femoral artery") == ("femoral artery", "left", False))
    check("awalan Right dilepas", normalize_key("Right femoral artery") == ("femoral artery", "right", False))
    check("right di dalam nama -> kunci left + tukar",
          normalize_key("Cavity of right ventricle") == ("cavity of left ventricle", None, True))
    check("kiri DAN kanan di satu nama dilewati",
          normalize_key("Branch of right artery to left lobe")[0] == "")

    print("\nturunan sisi: genus harus cocok")
    cases = [
        ("Left femoral artery", "Arteria femoralis sinistra"),
        ("Right femoral artery", "Arteria femoralis dextra"),
        ("Left brachioradialis", "Musculus brachioradialis sinister"),
        ("Right brachioradialis", "Musculus brachioradialis dexter"),
        ("Left hip bone", "Os coxae sinistrum"),
        ("Right kidney", "Ren dexter"),
        ("Left femur", "Femur sinistrum"),
        ("Right tenth rib", "Costa X dextra"),
    ]
    for en, want in cases:
        got = resolve(en, draft)
        check(f"{en} -> {want}", got is not None and got[0] == want, str(got))

    print("\nlateralitas di dalam nama: tukar akar, bukan tambah kata")
    got = resolve("Cavity of right ventricle", draft)
    check("Cavity of right ventricle -> ...ventriculi dextri", got is not None and got[0].endswith("ventriculi dextri"), str(got))
    got = resolve("Long head of right biceps brachii", draft)
    check("genitif ikut ditukar", got is not None and got[0] == "Caput longum musculi bicipitis brachii dextri", str(got))
    check("to_dexter menukar semua bentuk",
          to_dexter("arteriae sinistrae cum ganglio sinistro, musculus sinister") ==
          "arteriae dextrae cum ganglio dextro, musculus dexter")

    print("\ntidak menebak")
    check("nama di luar draf -> None", resolve("zone of muscle organ", draft) is None)
    check("kata kepala tanpa genus -> tidak diberi sisi",
          resolve("Left hypothalamus", {"hypothalamus": ("Hypothalamus", False, "")}) is None)
    check("right di dalam nama tapi draf tanpa sinistr- -> None",
          resolve("Branch of right thing", {"branch of left thing": ("Ramus rei", False, "")}) is None)

    print("\nIndonesia: tidak boleh Latin yang menyamar")
    check("kepala dikenal di-Indonesiakan", indonesian_from_latin("Arteria femoralis", "") == "Arteri femoralis")
    check("kepala tak dikenal -> tanpa entri Indonesia", indonesian_from_latin("Ramus acromialis", "") is None)
    check("padanan eksplisit menang", indonesian_from_latin("Ren", "Ginjal") == "Ginjal")
    got = resolve("Left kidney", draft)
    check("padanan eksplisit dapat sisi Indonesia", got is not None and got[2] == "Ginjal kiri", str(got))

    print("\nkeluaran pipeline: draf tidak pernah naik pangkat sendiri")
    for lang in ("la", "id"):
        path = ROOT / "public" / "data" / "content" / f"nomenclature.{lang}.json"
        if not path.exists():
            continue
        entries = json.loads(path.read_text(encoding="utf-8"))["entries"]
        llm = [e for e in entries if e["source"] == "llm"]
        check(f"{lang}: ada entri llm", len(llm) > 500, str(len(llm)))
        check(f"{lang}: nol entri llm berstatus reviewed", not any(e["status"] == "reviewed" for e in llm))
        check(f"{lang}: tidak ada FMA ganda", len({e['fma'] for e in entries}) == len(entries))

    check("semua kata kepala bergenus diawali huruf besar", all(k[0].isupper() for k in HEAD_GENDER))

    print("\n" + ("GAGAL: " + ", ".join(FAILED) if FAILED else "LULUS"))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
