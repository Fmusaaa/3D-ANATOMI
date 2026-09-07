"""
Uji negatif untuk 05_validate.py.

Validator yang cuma pernah bilang LULUS tidak membuktikan apa pun. Test ini
menyalin public/data ke direktori sementara, MERUSAKNYA dengan cara-cara yang
§11.3 sebut, lalu memastikan validator benar-benar menolak.

Jalankan: python tests/data/test_validator.py
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import struct
import sys
import tempfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
SRC_DATA = ROOT / "public" / "data"

failures: list[str] = []


def load_validator(data_dir: Path):
    """Muat 05_validate.py segar dengan konstanta path diarahkan ke data_dir."""
    spec = importlib.util.spec_from_file_location(
        f"v{id(data_dir)}", ROOT / "scripts" / "05_validate.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.DATA = data_dir
    mod.MANIFEST = data_dir / "manifest.json"
    mod.CONTENT = data_dir / "content"
    mod.CLINICAL = data_dir / "content" / "clinical"
    mod.QUIZ = data_dir / "content" / "quiz"
    mod.ERRORS, mod.WARNINGS, mod.NOTES = [], [], []
    return mod


def run(data_dir: Path) -> list[str]:
    mod = load_validator(data_dir)
    manifest = json.loads(mod.MANIFEST.read_text(encoding="utf-8"))
    in_geom = mod.validate_geometry(manifest)
    by_fma = mod.validate_structures(manifest, in_geom)
    mod.validate_clinical(by_fma)
    mod.validate_quiz(by_fma)
    return mod.ERRORS


def case(name: str, mutate, expect_substring: str) -> None:
    """Salin data, rusak, pastikan validator menolak dengan alasan yang tepat."""
    with tempfile.TemporaryDirectory() as td:
        d = Path(td) / "data"
        shutil.copytree(SRC_DATA, d)
        mutate(d)
        errors = run(d)
        hit = any(expect_substring.lower() in e.lower() for e in errors)
        ok = bool(errors) and hit
        print(f"  [{'OK ' if ok else 'GAGAL'}] {name}")
        if not ok:
            failures.append(name)
            print(f"        diharapkan memuat: {expect_substring!r}")
            print(f"        error sebenarnya : {errors[:3] if errors else 'TIDAK ADA ERROR'}")


def first_atlas(d: Path) -> Path:
    return sorted((d / "geometry").glob("*.atlas"))[0]


# --------------------------------------------------------------------------
print("baseline (data utuh harus LULUS)")
with tempfile.TemporaryDirectory() as td:
    d0 = Path(td) / "data"
    shutil.copytree(SRC_DATA, d0)
    base_errors = run(d0)
    ok = not base_errors
    print(f"  [{'OK ' if ok else 'GAGAL'}] data utuh tanpa error")
    if not ok:
        failures.append("baseline")
        for e in base_errors[:5]:
            print(f"        {e}")

print("\nkasus rusak (validator HARUS menolak)")


def corrupt_bytes(d: Path) -> None:
    p = first_atlas(d)
    raw = bytearray(p.read_bytes())
    raw[-32] ^= 0xFF  # balik satu byte di dalam blok buffer
    p.write_bytes(bytes(raw))


case("byte geometri berubah -> sha256 tidak cocok", corrupt_bytes, "sha256")


def truncate(d: Path) -> None:
    p = first_atlas(d)
    raw = p.read_bytes()
    p.write_bytes(raw[: len(raw) // 2])


case("file .atlas terpotong", truncate, "terpotong")


def break_magic(d: Path) -> None:
    p = first_atlas(d)
    raw = bytearray(p.read_bytes())
    raw[0:8] = b"NOTATLAS"
    p.write_bytes(bytes(raw))


case("MAGIC salah", break_magic, "MAGIC")


def drop_structure(d: Path) -> None:
    p = d / "content" / "structures.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["structures"].pop()
    p.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


case("struktur ada di .atlas tapi hilang di structures.json", drop_structure, "structures.json")


def blank_name(d: Path) -> None:
    p = d / "content" / "structures.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["structures"][10]["name"]["en"] = "   "
    p.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    man = d / "manifest.json"
    m = json.loads(man.read_text(encoding="utf-8"))
    m["content"]["structures"]["sha256"] = __import__("hashlib").sha256(p.read_bytes()).hexdigest()
    man.write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf-8")


case("struktur tanpa nama Inggris", blank_name, "nama Inggris kosong")


def header_name_junk(d: Path) -> None:
    p = d / "content" / "structures.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["structures"][5]["name"]["en"] = "# Bounds(mm): (-46.88,-70.88,942.03)"
    p.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    man = d / "manifest.json"
    m = json.loads(man.read_text(encoding="utf-8"))
    m["content"]["structures"]["sha256"] = __import__("hashlib").sha256(p.read_bytes()).hexdigest()
    man.write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf-8")


case("nama struktur berisi teks header .obj", header_name_junk, "teks header")


def zero_triangles(d: Path) -> None:
    p = first_atlas(d)
    raw = bytearray(p.read_bytes())
    head_len = struct.unpack("<I", raw[8:12])[0]
    header = json.loads(raw[12 : 12 + head_len].decode("utf-8"))
    header["structures"][0]["indexCount"] = 0
    new_head = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    # Sisipkan ulang; hash manifest sengaja dibiarkan agar dua error muncul.
    body = 12 + head_len
    body += (-body) % 4
    out = bytearray(b"ATLAS001" + struct.pack("<I", len(new_head)) + new_head)
    out += b"\0" * ((-(len(out))) % 4)
    out += raw[body:]
    p.write_bytes(bytes(out))


case("struktur dengan 0 segitiga", zero_triangles, "0 segitiga")


def budget_blown(d: Path) -> None:
    man = d / "manifest.json"
    m = json.loads(man.read_text(encoding="utf-8"))
    m["batches"][0]["bytesBrotli"] = 80 * 1024 * 1024
    man.write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf-8")


case("total aset melebihi budget §5.4", budget_blown, "budget")


def clinical_no_source(d: Path) -> None:
    cl = d / "content" / "clinical"
    cl.mkdir(parents=True, exist_ok=True)
    (cl / "FMA24474.md").write_text(
        "---\nfma: FMA24474\ntitle: Contoh\nsource:\n---\nIsi.\n", encoding="utf-8"
    )


case("catatan klinis tanpa `source`", clinical_no_source, "source")


def quiz_unreviewed(d: Path) -> None:
    q = d / "content" / "quiz"
    q.mkdir(parents=True, exist_ok=True)
    struct_doc = json.loads((d / "content" / "structures.json").read_text(encoding="utf-8"))
    fma = struct_doc["structures"][0]["fma"]
    (q / "thorax.json").write_text(
        json.dumps([{"id": "q1", "type": "identify", "targetFma": fma}]), encoding="utf-8"
    )


case("soal quiz menunjuk struktur tanpa nomenklatur `reviewed`", quiz_unreviewed, "reviewed")


def quiz_bad_fma(d: Path) -> None:
    q = d / "content" / "quiz"
    q.mkdir(parents=True, exist_ok=True)
    (q / "thorax.json").write_text(
        json.dumps([{"id": "q2", "type": "identify", "targetFma": "FMA99999999"}]), encoding="utf-8"
    )


case("soal quiz menunjuk FMA yang tidak ada", quiz_bad_fma, "tidak ada")


# --------------------------------------------------------------------------
print()
if failures:
    print(f"GAGAL ({len(failures)}): {', '.join(failures)}")
    sys.exit(1)
print("LULUS — validator menolak semua kasus rusak")
