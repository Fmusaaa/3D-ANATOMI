"""
Uji buku besar review nomenklatur (§E7 AC6).

Yang dipertaruhkan di sini bukan format — tapi janji bahwa **keputusan
reviewer tidak pernah hilang**. Generator 06 menulis ulang seluruh
public/data/content/nomenclature.*.json tiap pipeline jalan; kalau overlay-nya
salah, sebulan review lenyap dalam satu `npm run data:build` dan tidak ada
yang sadar sampai badge "machine" muncul lagi di UI.

Jalankan: python tests/data/test_nomenclature_reviews.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from nomenclature_reviews import (  # noqa: E402
    Review,
    apply_reviews,
    load_reviews,
    save_reviews,
    upsert_reviews,
    validate_review,
)

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("review_cli", ROOT / "scripts" / "07_review_nomenclature.py")
assert spec and spec.loader
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)

FAILED: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK ' if ok else 'BUG'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        FAILED.append(name)


def machine_entries() -> list[dict]:
    """Tiruan keluaran 06 untuk satu bahasa."""
    return [
        {"fma": "FMA100", "term": "Arteria apicalis segmentalis", "source": "machine", "status": "needs-review"},
        {"fma": "FMA200", "term": "Vertebra thoracica nona", "source": "machine", "status": "machine"},
        {"fma": "FMA300", "term": "Musculus deltoideus", "source": "machine", "status": "machine"},
    ]


def r(fma: str, term: str, lang: str = "la", **kw) -> Review:
    base = dict(fma=fma, lang=lang, term=term, source="TA2", reviewed_by="Penguji", reviewed_at="2026-09-10")
    base.update(kw)
    return Review(**base)


def main() -> int:
    print("overlay: keputusan manusia menang atas mesin")
    entries, replaced, added = apply_reviews(machine_entries(), "la", [r("FMA100", "Arteria segmentalis apicalis")])
    e100 = next(e for e in entries if e["fma"] == "FMA100")
    check("entri mesin diganti", replaced == 1 and added == 0)
    check("status jadi reviewed", e100["status"] == "reviewed")
    check("istilah diganti", e100["term"] == "Arteria segmentalis apicalis")
    check("reviewedBy terbawa", e100.get("reviewedBy") == "Penguji")
    check("source bukan machine lagi", e100["source"] == "TA2")
    check("entri lain tidak tersentuh", next(e for e in entries if e["fma"] == "FMA200")["status"] == "machine")

    print("\noverlay: FMA yang dilewati mesin DITAMBAHKAN")
    entries, replaced, added = apply_reviews(machine_entries(), "la", [r("FMA999", "Hepar")])
    check("ditambahkan, bukan diganti", replaced == 0 and added == 1)
    check("entri baru ada", any(e["fma"] == "FMA999" and e["status"] == "reviewed" for e in entries))
    check("urutan tetap terurut FMA", [e["fma"] for e in entries] == ["FMA100", "FMA200", "FMA300", "FMA999"])

    print("\noverlay: bahasa tidak bocor")
    entries, replaced, added = apply_reviews(machine_entries(), "la", [r("FMA100", "Ini Indonesia", lang="id")])
    check("review `id` tidak menyentuh keluaran `la`", replaced == 0 and added == 0)

    print("\noverlay: bertahan saat regenerasi (INI yang paling penting)")
    ledger = [r("FMA100", "Arteria segmentalis apicalis"), r("FMA999", "Hepar")]
    first, _, _ = apply_reviews(machine_entries(), "la", ledger)
    # Pipeline jalan lagi: mesin menghasilkan entri segar, overlay diterapkan ulang.
    second, _, _ = apply_reviews(machine_entries(), "la", ledger)
    check("keluaran identik setelah regenerasi", first == second)
    check("masih reviewed setelah regenerasi",
          sum(1 for e in second if e["status"] == "reviewed") == 2)

    print("\nvalidasi review")
    check("review sah lolos", validate_review(r("FMA1", "X")) == [])
    check("tanpa reviewedBy ditolak", any("reviewedBy" in p for p in validate_review(r("FMA1", "X", reviewed_by=""))))
    check("source `machine` ditolak", any("source" in p for p in validate_review(r("FMA1", "X", source="machine"))))
    check("term kosong ditolak", any("term" in p for p in validate_review(r("FMA1", "   "))))
    check("tanggal ngawur ditolak", any("reviewedAt" in p for p in validate_review(r("FMA1", "X", reviewed_at="kemarin"))))
    check("FMA ngawur ditolak", any("FMA" in p for p in validate_review(r("bukan", "X"))))
    check("lang ngawur ditolak", any("lang" in p for p in validate_review(r("FMA1", "X", lang="en"))))

    print("\nbuku besar: simpan/muat bolak-balik + upsert")
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "reviews.json"
        merged, added, replaced = upsert_reviews([], [r("FMA100", "A"), r("FMA100", "B", lang="id")])
        check("dua bahasa untuk FMA sama = dua entri", len(merged) == 2 and added == 2)
        merged, added, replaced = upsert_reviews(merged, [r("FMA100", "A2")])
        check("kunci (fma, lang) sama ditimpa", replaced == 1 and added == 0 and len(merged) == 2)
        save_reviews(merged, path)
        loaded = load_reviews(path)
        check("bolak-balik utuh", sorted(x.term for x in loaded) == ["A2", "B"])

        # Buku besar rusak (diedit tangan tanpa reviewedBy) harus MELEDAK, bukan dilewati.
        path.write_text('{"schema":1,"reviews":[{"fma":"FMA1","lang":"la","term":"X","source":"TA2","reviewedAt":"2026-09-10"}]}', encoding="utf-8")
        try:
            load_reviews(path)
            check("buku besar cacat ditolak keras", False, "load_reviews tidak melempar")
        except ValueError:
            check("buku besar cacat ditolak keras", True)

    print("\nsheet: keputusan yang ambigu ditolak, seluruh berkas gagal")
    with tempfile.TemporaryDirectory() as td:
        sheet = Path(td) / "review-la.tsv"

        def tulis(baris: list[str]) -> None:
            header = "\t".join(cli.COLUMNS)
            sheet.write_text(header + "\n" + "\n".join(baris) + "\n", encoding="utf-8")

        def baris(fma, cur, decision, corrected="", source="", note=""):
            return "\t".join([fma, "eng", "sys", cur, "machine", "", decision, corrected, source, note])

        tulis([
            baris("FMA100", "Arteria apicalis", "ok"),
            baris("FMA200", "Vertebra", "fix", "Vertebra thoracica IX", "TA2"),
            baris("FMA300", "Musculus", "skip"),
            baris("FMA400", "Apa saja", ""),
        ])
        revs, probs, skipped = cli.parse_sheet(sheet, "la", "Penguji", "2026-09-10")
        check("ok + fix diterima, skip/kosong dilewati", len(revs) == 2 and skipped == 2 and probs == [])
        check("ok memakai current_term", any(x.fma == "FMA100" and x.term == "Arteria apicalis" for x in revs))
        check("fix memakai corrected_term", any(x.fma == "FMA200" and x.term == "Vertebra thoracica IX" for x in revs))
        check("source kosong -> curated", next(x for x in revs if x.fma == "FMA100").source == "curated")
        check("source TA2 dihormati", next(x for x in revs if x.fma == "FMA200").source == "TA2")

        tulis([baris("FMA100", "", "ok")])
        _, probs, _ = cli.parse_sheet(sheet, "la", "Penguji", "2026-09-10")
        check("`ok` tanpa current_term ditolak", any("current_term kosong" in p for p in probs))

        tulis([baris("FMA100", "X", "fix", "")])
        _, probs, _ = cli.parse_sheet(sheet, "la", "Penguji", "2026-09-10")
        check("`fix` tanpa corrected_term ditolak", any("corrected_term kosong" in p for p in probs))

        tulis([baris("FMA100", "X", "yes")])
        _, probs, _ = cli.parse_sheet(sheet, "la", "Penguji", "2026-09-10")
        check("decision di luar ok/fix/skip ditolak", any("bukan ok/fix/skip" in p for p in probs))

        tulis([baris("FMA100", "X", "ok"), baris("FMA100", "X", "fix", "Y")])
        _, probs, _ = cli.parse_sheet(sheet, "la", "Penguji", "2026-09-10")
        check("FMA ganda dengan keputusan ditolak", any("muncul 2 kali" in p for p in probs))

        tulis([baris("FMA100", "X", "ok", source="wikipedia")])
        _, probs, _ = cli.parse_sheet(sheet, "la", "Penguji", "2026-09-10")
        check("source tak dikenal ditolak", any("source" in p for p in probs))

        tulis([baris("FMA100", "X", "ok"), baris("FMA200", "Y", "fix", "")])
        revs, probs, _ = cli.parse_sheet(sheet, "la", "Penguji", "2026-09-10")
        check("satu baris cacat: yang sah tetap dilaporkan, tapi ada masalah", len(revs) == 1 and len(probs) == 1)

    print("\n" + ("GAGAL: " + ", ".join(FAILED) if FAILED else "LULUS"))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
