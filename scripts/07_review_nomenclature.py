#!/usr/bin/env python3
"""
07_review_nomenclature.py — alat review nomenklatur manusia (PRD §E7 AC6).

Alur kerja yang dirancang untuk mereview RATUSAN entri, bukan satu-satu:

    1. python scripts/07_review_nomenclature.py sheet --lang la --out review-la.tsv
       -> buka di Excel / Google Sheets / LibreOffice
       -> isi kolom `decision` (ok / fix / skip) dan `corrected_term` bila fix
    2. python scripts/07_review_nomenclature.py apply review-la.tsv --by "Nama Lu"
       -> ditulis ke data_curated/nomenclature_reviews.json (buku besar)
       -> 06 dijalankan ulang, public/data/content/* ikut diperbarui
    3. python scripts/07_review_nomenclature.py status
       -> cakupan vs §E7 AC6

Yang TIDAK dilakukan alat ini: menebak. Ia tidak menyarankan terjemahan, tidak
mengisi keputusan, dan menolak baris yang ambigu. Keputusannya milik reviewer;
alat ini cuma memastikan keputusan itu tercatat dengan nama, tanggal, dan
sumber — lalu tidak pernah hilang saat pipeline jalan.

Urutan baris di sheet:
    high-yield (kalau data_curated/high_yield.json ada)
    > needs-review (urutan kata masih tebakan)
    > machine (satu adjektiva, urutan pasti)
    > tanpa entri (mesin melewatinya; reviewer bisa mengisi dari nol)
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nomenclature_reviews import (  # noqa: E402
    HIGH_YIELD,
    LANGS,
    REVIEW_SOURCES,
    REVIEWS,
    Review,
    load_high_yield,
    load_reviews,
    save_reviews,
    upsert_reviews,
    validate_review,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT = REPO_ROOT / "public" / "data" / "content"
STRUCTURES = CONTENT / "structures.json"
GENERATOR = REPO_ROOT / "scripts" / "06_nomenclature.py"

COLUMNS = [
    "fma", "english", "system", "current_term", "status", "high_yield",
    "decision", "corrected_term", "source", "note",
]
DECISIONS = ("ok", "fix", "skip", "")

# Target §E7 AC6. High-yield belum ada (D-010), jadi target Latin belum bisa
# diukur; target Indonesia dihitung terhadap seluruh struktur sebagai proksi.
TARGET_ID_REVIEWED = 300


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def load_concepts() -> dict[str, dict]:
    """fma -> {english, system}. Struktur dan grup COMPOUND sekaligus."""
    if not STRUCTURES.exists():
        raise SystemExit(f"Tidak ada {STRUCTURES}. Jalankan `npm run data:build` dulu.")
    doc = json.loads(STRUCTURES.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for s in doc["structures"]:
        out.setdefault(s["fma"], {"english": s["name"]["en"], "system": s["system"]})
    for g in doc.get("groups", []):
        # Grup tidak punya sistem sendiri; ambil dari anggota pertama yang ada.
        members = g.get("members", [])
        sys_id = ""
        if members:
            by_idx = {s["idx"]: s for s in doc["structures"]}
            first = by_idx.get(members[0])
            sys_id = first["system"] if first else ""
        out.setdefault(g["fma"], {"english": g["name"]["en"], "system": sys_id})
    return out


def load_current(lang: str) -> dict[str, dict]:
    path = CONTENT / f"nomenclature.{lang}.json"
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {e["fma"]: e for e in doc.get("entries", [])}


# ---------------------------------------------------------------------------
# sheet
# ---------------------------------------------------------------------------

def cmd_sheet(args: argparse.Namespace) -> int:
    concepts = load_concepts()
    current = load_current(args.lang)
    high_yield = load_high_yield()

    rank = {"needs-review": 1, "machine": 2, "none": 3, "reviewed": 4}
    rows: list[dict] = []
    for fma, meta in concepts.items():
        e = current.get(fma)
        status = e["status"] if e else "none"
        if args.status != "all" and status != args.status:
            continue
        if status == "reviewed" and not args.include_reviewed:
            continue
        if args.system and meta["system"] != args.system:
            continue
        rows.append({
            "fma": fma,
            "english": meta["english"],
            "system": meta["system"],
            "current_term": e["term"] if e else "",
            "status": status,
            "high_yield": "ya" if fma in high_yield else "",
            "decision": "",
            "corrected_term": "",
            "source": "",
            "note": "",
        })

    rows.sort(key=lambda r: (
        0 if r["high_yield"] else 1,
        rank.get(r["status"], 9),
        r["system"],
        r["english"].lower(),
    ))
    if args.limit:
        rows = rows[: args.limit]

    out = Path(args.out) if args.out else None
    fh = out.open("w", encoding="utf-8", newline="") if out else sys.stdout
    try:
        w = csv.DictWriter(fh, fieldnames=COLUMNS, delimiter="\t", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    finally:
        if out:
            fh.close()

    if out:
        by_status: dict[str, int] = {}
        for r in rows:
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        print(f"ditulis: {out}  ({len(rows)} baris)")
        for k in ("needs-review", "machine", "none", "reviewed"):
            if k in by_status:
                print(f"  {k:13s} {by_status[k]}")
        if not high_yield:
            print("\nCATATAN: data_curated/high_yield.json belum ada (D-010), jadi tidak ada")
            print("prioritas high-yield. Baris diurut: needs-review > machine > tanpa entri.")
        print("\nIsi kolom `decision`: ok | fix | skip. Untuk `fix`, isi `corrected_term`.")
        print("Kolom `source` boleh kosong (= curated), atau TA98 / TA2 / FMA.")
    return 0


# ---------------------------------------------------------------------------
# apply
# ---------------------------------------------------------------------------

def parse_sheet(path: Path, lang: str, reviewer: str, when: str) -> tuple[list[Review], list[str], int]:
    """
    Baca keputusan dari TSV. Kembalikan (review sah, daftar masalah, dilewati).

    Satu baris cacat menggagalkan SELURUH berkas. Mengimpor separuh berarti
    reviewer mengira 200 entri masuk padahal 180 — dan yang 20 tidak akan
    pernah dicari lagi.
    """
    reviews: list[Review] = []
    problems: list[str] = []
    skipped = 0

    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        missing = [c for c in ("fma", "decision") if c not in (reader.fieldnames or [])]
        if missing:
            return [], [f"kolom wajib tidak ada: {missing}"], 0

        for n, row in enumerate(reader, start=2):
            fma = (row.get("fma") or "").strip()
            decision = (row.get("decision") or "").strip().lower()
            current = (row.get("current_term") or "").strip()
            corrected = (row.get("corrected_term") or "").strip()
            source = (row.get("source") or "").strip() or "curated"
            note = (row.get("note") or "").strip()
            row_by = (row.get("reviewed_by") or "").strip() or reviewer

            if decision not in DECISIONS:
                problems.append(f"baris {n} ({fma}): decision {decision!r} bukan ok/fix/skip")
                continue
            if decision in ("", "skip"):
                skipped += 1
                continue

            if decision == "ok":
                if not current:
                    problems.append(
                        f"baris {n} ({fma}): `ok` tapi current_term kosong — "
                        f"tidak ada yang bisa disetujui; pakai `fix` dan isi corrected_term"
                    )
                    continue
                term = current
            else:  # fix
                if not corrected:
                    problems.append(f"baris {n} ({fma}): `fix` tapi corrected_term kosong")
                    continue
                if corrected == current:
                    # Bukan error, tapi patut tahu: reviewer mungkin bermaksud `ok`.
                    note = (note + " " if note else "") + "(fix identik dengan istilah mesin)"
                term = corrected

            r = Review(
                fma=fma, lang=lang, term=term, source=source,
                reviewed_by=row_by, reviewed_at=when, note=note,
            )
            bad = validate_review(r)
            if bad:
                problems.append(f"baris {n} ({fma}): {'; '.join(bad)}")
                continue
            reviews.append(r)

    # FMA ganda di satu berkas = dua keputusan untuk hal yang sama; tolak.
    seen: dict[str, int] = {}
    for r in reviews:
        seen[r.fma] = seen.get(r.fma, 0) + 1
    for fma, k in seen.items():
        if k > 1:
            problems.append(f"{fma} muncul {k} kali dengan keputusan — pilih satu")

    return reviews, problems, skipped


def infer_lang(path: Path, explicit: str | None) -> str:
    if explicit:
        return explicit
    name = path.name.lower()
    for lang in LANGS:
        if f"-{lang}." in name or f"_{lang}." in name or f".{lang}." in name:
            return lang
    raise SystemExit(
        "Tidak bisa menebak bahasa dari nama berkas. Pakai --lang la|id, "
        "atau beri nama berkas seperti review-la.tsv."
    )


def cmd_apply(args: argparse.Namespace) -> int:
    path = Path(args.sheet)
    if not path.exists():
        raise SystemExit(f"Berkas tidak ada: {path}")
    lang = infer_lang(path, args.lang)
    when = args.date or date.today().isoformat()

    reviews, problems, skipped = parse_sheet(path, lang, args.by, when)
    print(f"berkas   : {path}")
    print(f"bahasa   : {lang}")
    print(f"reviewer : {args.by}")
    print(f"tanggal  : {when}")
    print(f"keputusan: {len(reviews)} sah, {skipped} dilewati, {len(problems)} bermasalah")

    if problems:
        print("\nDITOLAK — perbaiki dulu, tidak ada yang ditulis:")
        for p in problems:
            print(f"  - {p}")
        return 1
    if not reviews:
        print("\nTidak ada keputusan ok/fix di berkas ini. Tidak ada yang ditulis.")
        return 0

    existing = load_reviews()
    merged, added, replaced = upsert_reviews(existing, reviews)
    print(f"buku besar: {len(existing)} -> {len(merged)} entri (+{added} baru, {replaced} ditimpa)")

    if args.dry_run:
        print("\n--dry-run: tidak ada yang ditulis.")
        return 0

    save_reviews(merged)
    print(f"ditulis: {REVIEWS.relative_to(REPO_ROOT)}")

    # Bangun ulang keluaran supaya app langsung melihatnya. Ini SATU-SATUNYA
    # jalur yang benar; mengedit public/data/content/* langsung akan dihapus
    # pipeline berikutnya.
    print("\nmenjalankan 06_nomenclature.py ...")
    rc = subprocess.run([sys.executable, str(GENERATOR), "--sample", "0"], cwd=REPO_ROOT).returncode
    if rc != 0:
        print("06 GAGAL — buku besar sudah tersimpan, tapi keluaran belum diperbarui.")
        return rc
    print("\nSelesai. Jalankan `npm run validate` sebelum commit.")
    return 0


# ---------------------------------------------------------------------------
# add (satu entri, untuk koreksi cepat)
# ---------------------------------------------------------------------------

def cmd_add(args: argparse.Namespace) -> int:
    r = Review(
        fma=args.fma, lang=args.lang, term=args.term, source=args.source,
        reviewed_by=args.by, reviewed_at=args.date or date.today().isoformat(),
        note=args.note or "",
    )
    bad = validate_review(r)
    if bad:
        print("DITOLAK:")
        for b in bad:
            print(f"  - {b}")
        return 1
    concepts = load_concepts()
    if r.fma not in concepts:
        print(f"DITOLAK: {r.fma} tidak ada di structures.json — cek lagi ID-nya.")
        return 1
    merged, added, replaced = upsert_reviews(load_reviews(), [r])
    save_reviews(merged)
    print(f"{'ditambah' if added else 'ditimpa'}: {r.fma}/{r.lang} = {r.term!r}  ({concepts[r.fma]['english']})")
    subprocess.run([sys.executable, str(GENERATOR), "--sample", "0"], cwd=REPO_ROOT)
    return 0


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

def cmd_status(_args: argparse.Namespace) -> int:
    concepts = load_concepts()
    high_yield = load_high_yield()
    total = len(concepts)

    print("=" * 68)
    print("CAKUPAN NOMENKLATUR vs §E7 AC6")
    print("=" * 68)
    print(f"konsep (struktur + grup): {total}")
    if high_yield:
        print(f"high-yield              : {len(high_yield)}")
    else:
        print("high-yield              : belum ada daftar (D-010) — target Latin belum bisa diukur")

    for lang, label in (("la", "Latin TA"), ("id", "Indonesia")):
        cur = load_current(lang)
        reviewed = [f for f, e in cur.items() if e["status"] == "reviewed"]
        needs = sum(1 for e in cur.values() if e["status"] == "needs-review")
        machine = sum(1 for e in cur.values() if e["status"] == "machine")
        print(f"\n{label}")
        print(f"  ada entri     : {len(cur)}/{total} ({100 * len(cur) / total:.1f}%)")
        print(f"  reviewed      : {len(reviewed)}")
        print(f"  needs-review  : {needs}")
        print(f"  machine       : {machine}")
        if high_yield:
            hy_rev = sum(1 for f in reviewed if f in high_yield)
            hy_any = sum(1 for f in cur if f in high_yield)
            print(f"  high-yield    : {hy_any}/{len(high_yield)} punya entri, {hy_rev} reviewed")
            if lang == "la":
                ok = hy_rev == len(high_yield)
                print(f"  AC6 Latin     : {'TERPENUHI' if ok else 'BELUM'} (100% high-yield reviewed)")
        if lang == "id":
            ok = len(reviewed) >= TARGET_ID_REVIEWED
            print(f"  AC6 Indonesia : {'TERPENUHI' if ok else 'BELUM'} ({len(reviewed)}/{TARGET_ID_REVIEWED} reviewed)")

    ledger = load_reviews()
    who: dict[str, int] = {}
    for r in ledger:
        who[r.reviewed_by] = who.get(r.reviewed_by, 0) + 1
    print(f"\nbuku besar: {len(ledger)} keputusan")
    for name, n in sorted(who.items(), key=lambda kv: -kv[1]):
        print(f"  {name}: {n}")
    return 0


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sheet", help="ekspor lembar review TSV")
    s.add_argument("--lang", choices=LANGS, required=True)
    s.add_argument("--out", help="path TSV; tanpa ini, ke stdout")
    s.add_argument("--system", help="batasi ke satu systemId, mis. systema_skeletale")
    s.add_argument("--status", default="all", choices=("all", "needs-review", "machine", "none"))
    s.add_argument("--include-reviewed", action="store_true", help="ikutkan yang sudah reviewed")
    s.add_argument("--limit", type=int, default=0)
    s.set_defaults(fn=cmd_sheet)

    a = sub.add_parser("apply", help="terapkan keputusan dari TSV ke buku besar")
    a.add_argument("sheet")
    a.add_argument("--by", required=True, help="nama reviewer (wajib — masuk field reviewedBy)")
    a.add_argument("--lang", choices=LANGS, help="kalau tidak bisa ditebak dari nama berkas")
    a.add_argument("--date", help="YYYY-MM-DD; default hari ini")
    a.add_argument("--dry-run", action="store_true")
    a.set_defaults(fn=cmd_apply)

    d = sub.add_parser("add", help="satu keputusan cepat tanpa sheet")
    d.add_argument("--fma", required=True)
    d.add_argument("--lang", choices=LANGS, required=True)
    d.add_argument("--term", required=True)
    d.add_argument("--by", required=True)
    d.add_argument("--source", default="curated", choices=REVIEW_SOURCES)
    d.add_argument("--date")
    d.add_argument("--note")
    d.set_defaults(fn=cmd_add)

    st = sub.add_parser("status", help="cakupan vs §E7 AC6")
    st.set_defaults(fn=cmd_status)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
