#!/usr/bin/env python3
"""
05_validate.py — gerbang invarian data (PRD §11.3). Jalan di CI.

Exit code non-zero = build gagal. §11.3 mewajibkan gagal kalau:

  - ada struktur di .atlas tanpa entri di structures.json, atau sebaliknya
  - ada structureIdx di geometri yang di luar rentang
  - ada mesh dengan 0 segitiga
  - ada file klinis tanpa `source`
  - ada entri quiz yang menunjuk FMA tidak ada, atau struktur tanpa
    nomenklatur berstatus `reviewed`
  - total ukuran aset melebihi budget
  - hash manifest tidak cocok dengan isi file (deteksi aset basi)

File konten (nomenclature/clinical/quiz) belum ada di Fase 0. Yang belum ada
DILEWATI dengan catatan; yang ada divalidasi penuh. Melewati file yang belum
ada bukan kelonggaran — begitu file muncul, aturannya langsung berlaku.

Pemakaian:
    python scripts/05_validate.py
    python scripts/05_validate.py --json   # keluaran mesin untuk CI
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA = REPO_ROOT / "public" / "data"
MANIFEST = DATA / "manifest.json"
CONTENT = DATA / "content"
CLINICAL = CONTENT / "clinical"
QUIZ = CONTENT / "quiz"

# PRD §5.4
BUDGET_INITIAL_MB = 12.0   # payload awal interaktif (Brotli)
BUDGET_TOTAL_MB = 60.0     # seluruh sistem (Brotli)
# §5.4: yang dimuat lebih dulu supaya app langsung interaktif.
INITIAL_SYSTEMS = {"systema_skeletale", "integumentum_commune"}

ERRORS: list[str] = []
WARNINGS: list[str] = []
NOTES: list[str] = []


def err(msg: str) -> None:
    ERRORS.append(msg)


def warn(msg: str) -> None:
    WARNINGS.append(msg)


def note(msg: str) -> None:
    NOTES.append(msg)


# --------------------------------------------------------------------------


def read_atlas_header(path: Path) -> dict | None:
    raw = path.read_bytes()
    if raw[:8] != b"ATLAS001":
        err(f"{path.name}: MAGIC bukan ATLAS001")
        return None
    if len(raw) < 12:
        err(f"{path.name}: file terlalu pendek")
        return None
    head_len = struct.unpack("<I", raw[8:12])[0]
    if 12 + head_len > len(raw):
        err(f"{path.name}: headerLen {head_len} melebihi ukuran file")
        return None
    try:
        header = json.loads(raw[12 : 12 + head_len].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        err(f"{path.name}: header JSON rusak ({exc})")
        return None

    body = 12 + head_len
    body += (-body) % 4
    sizes = {"i16": 2, "i8": 1, "u16": 2, "u32": 4}
    for name, b in header.get("buffers", {}).items():
        if b["offset"] % 4:
            err(f"{path.name}: buffer '{name}' tidak 4-byte aligned")
        if body + b["offset"] + b["byteLength"] > len(raw):
            err(f"{path.name}: buffer '{name}' melewati akhir file (aset terpotong)")
        if b["type"] not in sizes:
            err(f"{path.name}: buffer '{name}' bertipe tak dikenal '{b['type']}'")

    header["_bytes"] = len(raw)
    header["_raw"] = raw
    header["_bodyStart"] = body
    return header


def validate_geometry(manifest: dict) -> set[int]:
    """Cek tiap .atlas; kembalikan himpunan structureIdx yang ada di geometri."""
    seen: set[int] = set()
    total_br = 0.0
    initial_br = 0.0

    for entry in manifest["batches"]:
        path = DATA / entry["file"]
        if not path.exists():
            err(f"manifest menyebut {entry['file']} tapi file tidak ada")
            continue

        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != entry["sha256"]:
            err(f"{entry['file']}: sha256 tidak cocok dengan manifest (aset basi — "
                f"jalankan ulang 04_pack_batches.py)")
        if len(raw) != entry["bytes"]:
            err(f"{entry['file']}: ukuran {len(raw)} != manifest {entry['bytes']}")

        header = read_atlas_header(path)
        if header is None:
            continue

        if header.get("systemId") != entry["systemId"]:
            err(f"{entry['file']}: systemId header '{header.get('systemId')}' "
                f"!= manifest '{entry['systemId']}'")

        # Konsistensi buffer <-> hitungan
        sizes = {"i16": 2, "i8": 1, "u16": 2, "u32": 4}
        bufs = header["buffers"]
        pos = bufs["position"]
        n_vert = pos["byteLength"] // (sizes[pos["type"]] * pos["components"])
        if n_vert != header["vertexCount"]:
            err(f"{entry['file']}: vertexCount {header['vertexCount']} != buffer position {n_vert}")
        for name in ("normal", "structureIdx"):
            b = bufs[name]
            cnt = b["byteLength"] // (sizes[b["type"]] * b["components"])
            if cnt != header["vertexCount"]:
                err(f"{entry['file']}: buffer '{name}' punya {cnt} entri, vertexCount {header['vertexCount']}")
        ib = bufs["index"]
        n_idx = ib["byteLength"] // sizes[ib["type"]]
        if n_idx != header["indexCount"]:
            err(f"{entry['file']}: indexCount {header['indexCount']} != buffer index {n_idx}")
        if n_idx % 3:
            err(f"{entry['file']}: indexCount {n_idx} bukan kelipatan 3")
        if ib["type"] == "u16" and header["vertexCount"] > 65536:
            err(f"{entry['file']}: index Uint16 tapi {header['vertexCount']} vertex — overflow")

        # structureIdx di dalam rentang, dan rentang index rapat
        cursor = 0
        for st in header["structures"]:
            if st["indexCount"] <= 0:
                err(f"{entry['file']}: struktur {st['fma']} punya 0 segitiga")
            if st["indexCount"] % 3:
                err(f"{entry['file']}: struktur {st['fma']} indexCount bukan kelipatan 3")
            if st["indexStart"] != cursor:
                err(f"{entry['file']}: struktur {st['fma']} indexStart {st['indexStart']} "
                    f"— ada celah/tumpang tindih (harusnya {cursor})")
            cursor += st["indexCount"]
            if st["idx"] in seen:
                err(f"structureIdx {st['idx']} muncul di lebih dari satu batch")
            seen.add(st["idx"])
        if cursor != header["indexCount"]:
            err(f"{entry['file']}: rentang struktur menutup {cursor} index, "
                f"indexCount {header['indexCount']}")

        # structureIdx aktual di buffer harus cocok dengan yang dideklarasikan
        declared = {st["idx"] for st in header["structures"]}
        sb = bufs["structureIdx"]
        start = header["_bodyStart"] + sb["offset"]
        vals = set(
            int.from_bytes(raw[start + 2 * i : start + 2 * i + 2], "little")
            for i in range(0, header["vertexCount"], max(1, header["vertexCount"] // 2000))
        )
        stray = vals - declared
        if stray:
            err(f"{entry['file']}: buffer structureIdx memuat idx di luar header: {sorted(stray)[:5]}")

        total_br += entry["bytesBrotli"] / 1024 / 1024
        if entry["systemId"] in INITIAL_SYSTEMS:
            initial_br += entry["bytesBrotli"] / 1024 / 1024

    content_br = manifest.get("content", {}).get("structures", {}).get("bytesBrotli", 0) / 1024 / 1024
    total_br += content_br
    initial_br += content_br

    if total_br > BUDGET_TOTAL_MB:
        err(f"total aset {total_br:.1f} MB (Brotli) melebihi budget §5.4 {BUDGET_TOTAL_MB} MB")
    else:
        note(f"total aset {total_br:.1f} MB Brotli (budget {BUDGET_TOTAL_MB} MB)")
    if initial_br > BUDGET_INITIAL_MB:
        err(f"payload awal {initial_br:.1f} MB melebihi budget §5.4 {BUDGET_INITIAL_MB} MB")
    else:
        note(f"payload awal ({'+'.join(sorted(INITIAL_SYSTEMS))}) "
             f"{initial_br:.1f} MB Brotli (budget {BUDGET_INITIAL_MB} MB)")

    return seen


def validate_structures(manifest: dict, in_geometry: set[int]) -> dict:
    path = CONTENT / "structures.json"
    if not path.exists():
        err("public/data/content/structures.json tidak ada")
        return {}

    raw = path.read_bytes()
    meta = manifest.get("content", {}).get("structures")
    if meta:
        if hashlib.sha256(raw).hexdigest() != meta["sha256"]:
            err("structures.json: sha256 tidak cocok dengan manifest (aset basi)")

    doc = json.loads(raw.decode("utf-8"))
    structures = doc["structures"]
    by_idx = {s["idx"]: s for s in structures}

    if len(by_idx) != len(structures):
        err("structures.json: idx tidak unik")
    if sorted(by_idx) != list(range(len(structures))):
        err("structures.json: idx tidak rapat 0..N-1")
    if len(structures) != manifest["structureCount"]:
        err(f"structures.json punya {len(structures)} entri, manifest bilang {manifest['structureCount']}")

    # §11.3: dua arah, geometri <-> metadata
    only_geo = in_geometry - set(by_idx)
    only_meta = set(by_idx) - in_geometry
    if only_geo:
        err(f"{len(only_geo)} structureIdx ada di .atlas tapi tidak di structures.json: {sorted(only_geo)[:5]}")
    if only_meta:
        err(f"{len(only_meta)} struktur ada di structures.json tapi tidak di geometri: {sorted(only_meta)[:5]}")

    for s in structures:
        if not str(s.get("fma", "")).startswith("FMA"):
            err(f"struktur idx {s['idx']}: FMA id tidak sah '{s.get('fma')}'")
        if not s.get("name", {}).get("en", "").strip():
            err(f"struktur idx {s['idx']} ({s.get('fileId')}): nama Inggris kosong")
        if s["name"]["en"].lstrip().startswith("#"):
            err(f"struktur idx {s['idx']}: nama berisi teks header .obj '{s['name']['en'][:40]}'")
        if s.get("system") == "non_classificatum":
            err(f"struktur idx {s['idx']} ({s.get('fileId')}): tanpa systemId")
        q = s.get("meshQuality")
        if not isinstance(q, (int, float)) or not 0.0 <= q <= 1.0:
            err(f"struktur idx {s['idx']}: meshQuality di luar 0..1 ({q})")

    thr = doc.get("meshQualityExcludeBelow")
    if thr is None:
        err("structures.json: meshQualityExcludeBelow tidak ada (§E10 AC13 butuh ambang ini)")
    elif manifest.get("meshQualityExcludeBelow") != thr:
        err("ambang meshQuality di manifest dan structures.json berbeda")
    else:
        n_excl = sum(1 for s in structures if s["meshQuality"] < thr)
        if n_excl == 0:
            err(f"ambang meshQuality {thr} mengecualikan NOL struktur — "
                f"aturan integritas quiz §E10 AC13 tidak berfungsi")
        else:
            note(f"ambang meshQuality {thr} mengecualikan {n_excl} struktur dari quiz klik")

    # Konsep COMPOUND ikut dimasukkan: nomenklatur juga menerjemahkannya, dan
    # tanpa ini validator memuntahkan ratusan warning palsu — yang justru
    # melatih orang mengabaikan warning.
    known = {s["fma"]: s for s in structures}
    for g in doc.get("groups", []):
        known.setdefault(g["fma"], {"fma": g["fma"], "name": g["name"], "group": True})
    return known


def parse_front_matter(text: str) -> tuple[dict, bool]:
    if not text.startswith("---"):
        return {}, False
    end = text.find("\n---", 3)
    if end == -1:
        return {}, False
    fm: dict[str, str] = {}
    for line in text[3:end].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, True


def validate_nomenclature(by_fma: dict) -> dict[str, dict[str, str]]:
    """
    Validasi file nomenklatur (§6.4) dan kembalikan peta fma -> {lang: status}.

    Aturan R5 ditegakkan di sini, bukan diserahkan ke niat baik komponen UI.
    """
    nomen: dict[str, dict[str, str]] = {}
    files = sorted(CONTENT.glob("nomenclature.*.json"))
    if not files:
        note("belum ada file nomenklatur — dilewati")
        return nomen

    valid_status = {"reviewed", "machine", "needs-review"}
    valid_source = {"TA98", "TA2", "FMA", "curated", "machine"}

    for f in files:
        lang = f.name.split(".")[1]
        try:
            doc = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            err(f"{f.name}: JSON rusak ({exc})")
            continue

        entries = doc.get("entries")
        if not isinstance(entries, list):
            err(f"{f.name}: field `entries` tidak ada atau bukan list")
            continue

        seen_fma: set[str] = set()
        reviewed = machine = needs = 0
        for e in entries:
            fma = e.get("fma", "")
            term = str(e.get("term", "")).strip()
            status = e.get("status")
            source = e.get("source")

            if not str(fma).startswith("FMA"):
                err(f"{f.name}: entri dengan FMA id tidak sah '{fma}'")
                continue
            if fma in seen_fma:
                err(f"{f.name}: FMA {fma} muncul lebih dari sekali")
            seen_fma.add(fma)
            if not term:
                err(f"{f.name}: {fma} punya `term` kosong")
            if status not in valid_status:
                err(f"{f.name}: {fma} punya status tidak sah '{status}'")
            if source not in valid_source:
                err(f"{f.name}: {fma} punya source tidak sah '{source}'")
            # Status `reviewed` menuntut jejak siapa yang mereview — tanpa itu
            # klaim "terverifikasi" tidak bisa dipertanggungjawabkan.
            if status == "reviewed" and not e.get("reviewedBy"):
                err(f"{f.name}: {fma} berstatus `reviewed` tanpa field `reviewedBy`")
            if by_fma and fma not in by_fma:
                warn(f"{f.name}: {fma} tidak ada di structures.json (grup COMPOUND?)")

            nomen.setdefault(fma, {})[lang] = str(status)
            if status == "reviewed":
                reviewed += 1
            elif status == "needs-review":
                needs += 1
            else:
                machine += 1

        note(
            f"nomenclature.{lang}: {len(entries)} entri "
            f"({reviewed} reviewed, {needs} needs-review, {machine} machine)"
        )
        if reviewed == 0 and entries:
            warn(
                f"nomenclature.{lang}: NOL entri terverifikasi — §E7 AC6 belum "
                f"terpenuhi, dan quiz tidak akan punya soal yang sah"
            )

    return nomen


def validate_clinical(by_fma: dict) -> None:
    if not CLINICAL.exists() or not any(CLINICAL.glob("*.md")):
        note("belum ada catatan klinis — dilewati (aturan berlaku begitu file muncul)")
        return
    for f in sorted(CLINICAL.glob("*.md")):
        fm, ok = parse_front_matter(f.read_text(encoding="utf-8"))
        if not ok:
            err(f"clinical/{f.name}: tanpa front-matter YAML")
            continue
        if not fm.get("source"):
            err(f"clinical/{f.name}: field `source` kosong — §E9 AC4 melarang tampil tanpa sumber")
        fma = fm.get("fma", "")
        if fma and by_fma and fma not in by_fma:
            err(f"clinical/{f.name}: menunjuk FMA {fma} yang tidak ada di structures.json")


def validate_quiz(by_fma: dict, nomen: dict[str, dict[str, str]]) -> None:
    if not QUIZ.exists() or not any(QUIZ.glob("*.json")):
        note("belum ada bank soal — dilewati (aturan berlaku begitu file muncul)")
        return

    for f in sorted(QUIZ.glob("*.json")):
        try:
            items = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            err(f"quiz/{f.name}: JSON rusak ({exc})")
            continue
        for it in items if isinstance(items, list) else items.get("items", []):
            target = it.get("targetFma") or it.get("answerFma")
            if not target:
                err(f"quiz/{f.name}: entri {it.get('id')} tanpa targetFma/answerFma")
                continue
            if by_fma and target not in by_fma:
                err(f"quiz/{f.name}: entri {it.get('id')} menunjuk FMA {target} yang tidak ada")
                continue
            statuses = nomen.get(target, {})
            if not any(v == "reviewed" for v in statuses.values()):
                err(f"quiz/{f.name}: entri {it.get('id')} menunjuk {target} yang belum punya "
                    f"nomenklatur `reviewed` — §E10 AC14 melarang")
            s = by_fma.get(target)
            if s and it.get("type") == "name-to-structure":
                thr = s.get("_thr")
                if thr is not None and s["meshQuality"] < thr:
                    err(f"quiz/{f.name}: entri {it.get('id')} tipe name-to-structure "
                        f"pada mesh rusak (§E10 AC13)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not MANIFEST.exists():
        print(f"GAGAL: {MANIFEST} tidak ada. Jalankan scripts/04_pack_batches.py dulu.")
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    in_geometry = validate_geometry(manifest)
    by_fma = validate_structures(manifest, in_geometry)
    nomen = validate_nomenclature(by_fma)
    validate_clinical(by_fma)
    validate_quiz(by_fma, nomen)

    if args.json:
        print(json.dumps({"errors": ERRORS, "warnings": WARNINGS, "notes": NOTES}, indent=1, ensure_ascii=False))
        return 1 if ERRORS else 0

    print("=" * 68)
    print("VALIDASI DATA (PRD §11.3)")
    print("=" * 68)
    print(f"batch     : {len(manifest['batches'])}")
    print(f"struktur  : {manifest['structureCount']}")
    print(f"segitiga  : {manifest['triangleCount']:,}")
    print(f"vertex    : {manifest['vertexCount']:,}")
    for n in NOTES:
        print(f"  - {n}")
    if WARNINGS:
        print(f"\nPERINGATAN ({len(WARNINGS)}):")
        for w in WARNINGS:
            print(f"  ! {w}")
    if ERRORS:
        print(f"\nERROR ({len(ERRORS)}):")
        for e in ERRORS:
            print(f"  x {e}")
        print("\nGAGAL")
        return 1
    print("\nLULUS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
