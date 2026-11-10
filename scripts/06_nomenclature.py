#!/usr/bin/env python3
"""
06_nomenclature.py — turunkan nomenklatur Latin & Indonesia dari nama Inggris FMA.

⚠️⚠️ BACA INI SEBELUM MEMAKAI HASILNYA ⚠️⚠️

Seluruh keluaran skrip ini berstatus **`machine`**. Tidak ada satu entri pun
yang boleh dianggap Terminologia Anatomica yang sahih sampai ada manusia yang
memeriksanya dan menaikkan statusnya ke `reviewed`.

PRD §E7 AC4 dan R5 mengaturnya keras, dan alasannya nyata: user-nya calon
dokter, dan istilah anatomi yang salah bisa kebawa sampai ujian. Aturan yang
ditegakkan di kode, bukan sekadar niat:

  * setiap entri `machine` wajib berbadge di UI
  * entri `machine` TIDAK boleh dipakai sebagai jawaban benar di quiz
    (`05_validate.py` menolaknya)
  * cakupan v1.0 §E7 AC6 menuntut status `reviewed`, jadi **skrip ini tidak
    bisa memenuhi AC6** — hanya menyiapkan kandidat untuk direview

Filosofi generator: **lebih baik tidak menghasilkan entri daripada menebak.**
Kata yang tidak ada di kamus di bawah membuat seluruh nama dilewati, bukan
diterjemahkan separuh.

Pemakaian:
    python scripts/06_nomenclature.py
    python scripts/06_nomenclature.py --sample 40   # lihat contoh hasil
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from nomenclature_reviews import apply_reviews, load_reviews  # noqa: E402
from nomenclature_draft import indonesian_from_latin, load_draft, resolve  # noqa: E402
CONTENT = REPO_ROOT / "public" / "data" / "content"
STRUCTURES = CONTENT / "structures.json"
OUT_LA = CONTENT / "nomenclature.la.json"
OUT_ID = CONTENT / "nomenclature.id.json"

# --------------------------------------------------------------------------
# Kepala frasa: kata benda Latin + genusnya.
#
# Genus WAJIB benar — dialah yang menentukan bentuk adjektiva yang mengikuti.
# "arteria hepatica" (f) vs "nervus hepaticus" (m) vs "ligamentum latum" (n).
# --------------------------------------------------------------------------
HEAD_NOUNS: dict[str, tuple[str, str, str]] = {
    # english        latin           genus  indonesia
    "artery":        ("arteria",     "f",   "arteri"),
    "arteries":      ("arteriae",    "f",   "arteri"),
    "vein":          ("vena",        "f",   "vena"),
    "veins":         ("venae",       "f",   "vena"),
    "nerve":         ("nervus",      "m",   "nervus"),
    "nerves":        ("nervi",       "m",   "nervus"),
    "muscle":        ("musculus",    "m",   "otot"),
    "muscles":       ("musculi",     "m",   "otot"),
    "bone":          ("os",          "n",   "tulang"),
    "cartilage":     ("cartilago",   "f",   "kartilago"),
    "ligament":      ("ligamentum",  "n",   "ligamentum"),
    "vertebra":      ("vertebra",    "f",   "vertebra"),
    "rib":           ("costa",       "f",   "kosta"),
    "tooth":         ("dens",        "m",   "gigi"),
    "gyrus":         ("gyrus",       "m",   "girus"),
    "sulcus":        ("sulcus",      "m",   "sulkus"),
    "lobe":          ("lobus",       "m",   "lobus"),
    "ventricle":     ("ventriculus", "m",   "ventrikel"),
    "atrium":        ("atrium",      "n",   "atrium"),
    "valve":         ("valva",       "f",   "katup"),
    "tendon":        ("tendo",       "m",   "tendo"),
    "gland":         ("glandula",    "f",   "kelenjar"),
    "duct":          ("ductus",      "m",   "duktus"),
    "sinus":         ("sinus",       "m",   "sinus"),
    "membrane":      ("membrana",    "f",   "membran"),
    "fascia":        ("fascia",      "f",   "fasia"),
    "nucleus":       ("nucleus",     "m",   "nukleus"),
    "cortex":        ("cortex",      "m",   "korteks"),
    "arch":          ("arcus",       "m",   "arkus"),
    "process":       ("processus",   "m",   "prosesus"),
    "fossa":         ("fossa",       "f",   "fosa"),
    "foramen":       ("foramen",     "n",   "foramen"),
    "canal":         ("canalis",     "m",   "kanalis"),
    "septum":        ("septum",      "n",   "septum"),
    "capsule":       ("capsula",     "f",   "kapsul"),
    "bursa":         ("bursa",       "f",   "bursa"),
    "disk":          ("discus",      "m",   "diskus"),
    "disc":          ("discus",      "m",   "diskus"),
}

# --------------------------------------------------------------------------
# Adjektiva: batang + bentuk (m, f, n).
#
# Dua kelas deklinasi yang relevan:
#   -us/-a/-um   (hepaticus / hepatica / hepaticum)
#   -is/-is/-e   (femoralis / femoralis / femorale)
#
# Aturan sufiks di bawah menutup mayoritas, tapi PENGECUALIAN nyata ada dan
# ditulis eksplisit — mis. "pulmonary" -> pulmonalis, BUKAN pulmonarius.
# --------------------------------------------------------------------------
ADJ_EXCEPTIONS: dict[str, tuple[str, str, str]] = {
    "pulmonary":    ("pulmonalis", "pulmonalis", "pulmonale"),
    "renal":        ("renalis", "renalis", "renale"),
    "middle":       ("medius", "media", "medium"),
    "common":       ("communis", "communis", "commune"),
    "proper":       ("proprius", "propria", "proprium"),
    "great":        ("magnus", "magna", "magnum"),
    "greater":      ("major", "major", "majus"),
    "lesser":       ("minor", "minor", "minus"),
    "small":        ("parvus", "parva", "parvum"),
    "deep":         ("profundus", "profunda", "profundum"),
    "superficial":  ("superficialis", "superficialis", "superficiale"),
    "internal":     ("internus", "interna", "internum"),
    "external":     ("externus", "externa", "externum"),
    "anterior":     ("anterior", "anterior", "anterius"),
    "posterior":    ("posterior", "posterior", "posterius"),
    "superior":     ("superior", "superior", "superius"),
    "inferior":     ("inferior", "inferior", "inferius"),
    "transverse":   ("transversus", "transversa", "transversum"),
    "oblique":      ("obliquus", "obliqua", "obliquum"),
    "straight":     ("rectus", "recta", "rectum"),
    "round":        ("teres", "teres", "teres"),
    "long":         ("longus", "longa", "longum"),
    "short":        ("brevis", "brevis", "breve"),
    "broad":        ("latus", "lata", "latum"),
    "first":        ("primus", "prima", "primum"),
    "second":       ("secundus", "secunda", "secundum"),
    "third":        ("tertius", "tertia", "tertium"),
    "fourth":       ("quartus", "quarta", "quartum"),
    "fifth":        ("quintus", "quinta", "quintum"),
    "sixth":        ("sextus", "sexta", "sextum"),
    "seventh":      ("septimus", "septima", "septimum"),
    "eighth":       ("octavus", "octava", "octavum"),
    "ninth":        ("nonus", "nona", "nonum"),
    "tenth":        ("decimus", "decima", "decimum"),
    "left":         ("sinister", "sinistra", "sinistrum"),
    "right":        ("dexter", "dextra", "dextrum"),
}

# Sufiks Inggris -> pola Latin. Diterapkan HANYA kalau tidak ada di pengecualian.
ADJ_SUFFIX_RULES: list[tuple[str, tuple[str, str, str]]] = [
    # (akhiran inggris, (ganti_m, ganti_f, ganti_n))
    # "cervical" -> cervicalis, BUKAN "cervica". Sempat salah dan
    # menghasilkan "arteria profunda cervica".
    ("ical", ("icalis", "icalis", "icale")),
    ("ial",  ("ialis", "ialis", "iale")),
    ("al",   ("alis", "alis", "ale")),
    ("ar",   ("aris", "aris", "are")),
    ("ary",  ("arius", "aria", "arium")),
    ("ic",   ("icus", "ica", "icum")),
    ("ous",  ("osus", "osa", "osum")),
    ("id",   ("ideus", "idea", "ideum")),
    ("ine",  ("inus", "ina", "inum")),
]

# Kata yang dibuang dari frasa Latin karena tidak menambah makna nomenklatur
# atau butuh konstruksi genitif yang tidak bisa dibuat mekanis.
DROP = {"the", "a", "an"}

# Adjektiva posisional/ordinal/kualifier. Dalam Terminologia Anatomica kata
# jenis ini berdiri SETELAH adjektiva deskriptif, kebalikan dari urutan Inggris:
#
#   inggris : superior epigastric artery
#   TA      : arteria epigastrica superior
#
# Mempertahankan urutan Inggris menghasilkan "arteria superior epigastrica",
# yang salah dan akan ditandai salah di ujian.
POSITIONAL = {
    "superior", "inferior", "anterior", "posterior", "middle",
    "deep", "superficial", "internal", "external",
    "greater", "lesser", "great", "small", "long", "short", "broad",
    "common", "proper", "straight", "round",
    "first", "second", "third", "fourth", "fifth",
    "sixth", "seventh", "eighth", "ninth", "tenth",
}

# Kata yang membuat SELURUH nama dilewati: menerjemahkannya butuh genitif atau
# konstruksi yang tidak deterministik ("branch of X" -> "ramus X-i").
BLOCKERS = {
    "of", "branch", "tributary", "segment", "subdivision", "set", "zone",
    "region", "part", "trunk", "head", "body", "wall", "layer", "cavity",
    "space", "junction", "component", "compound", "element", "tree",
}


def adj_forms(word: str) -> tuple[str, str, str] | None:
    """Bentuk (m, f, n) sebuah adjektiva, atau None kalau tidak yakin."""
    w = word.lower()
    if w in ADJ_EXCEPTIONS:
        return ADJ_EXCEPTIONS[w]
    for suffix, (m, f, n) in ADJ_SUFFIX_RULES:
        if w.endswith(suffix) and len(w) > len(suffix) + 2:
            stem = w[: -len(suffix)]
            return (stem + m, stem + f, stem + n)
    return None


def pick(forms: tuple[str, str, str], gender: str) -> str:
    return {"m": forms[0], "f": forms[1], "n": forms[2]}[gender]


def to_latin(name_en: str) -> tuple[str, list[str], bool] | None:
    """
    Inggris -> Latin. Mengembalikan (latin, kata_dipakai, perlu_review_dulu)
    atau None.

    None berarti "tidak yakin" — dan itu keluaran yang benar, bukan kegagalan.
    """
    words = [re.sub(r"[^a-zA-Z]", "", w).lower() for w in name_en.split()]
    words = [w for w in words if w and w not in DROP]
    if not words:
        return None
    if any(w in BLOCKERS for w in words):
        return None

    head = words[-1]
    if head not in HEAD_NOUNS:
        return None
    latin_noun, gender, _id = HEAD_NOUNS[head]

    laterality: str | None = None
    mods = words[:-1]
    if mods and mods[0] in ("right", "left"):
        laterality = mods[0]
        mods = mods[1:]

    descriptive: list[str] = []
    positional: list[str] = []
    for w in mods:
        forms = adj_forms(w)
        if forms is None:
            return None  # satu kata tak dikenal -> lewati seluruh nama
        (positional if w in POSITIONAL else descriptive).append(pick(forms, gender))

    parts = [latin_noun, *descriptive, *positional]
    if laterality:
        parts.append(pick(ADJ_EXCEPTIONS[laterality], gender))

    # Urutan antar-adjektiva DESKRIPTIF tidak deterministik. Inggris menulis
    # "dorsal scapular artery", TA menulis "arteria scapularis dorsalis" —
    # kebalikannya. Dengan satu adjektiva deskriptif tidak ada ambiguitas;
    # dengan dua atau lebih, urutannya tebakan dan wajib direview lebih dulu.
    risky = len(descriptive) > 1
    return " ".join(parts), words, risky


def to_indonesian(name_en: str, latin: str) -> str | None:
    """
    Indonesia = kepala frasa di-Indonesiakan + modifier Latin dipertahankan.

    Ini konvensi yang benar-benar dipakai di pendidikan kedokteran Indonesia
    ("arteri femoralis", bukan "arteri paha"). Menerjemahkan modifier ke bahasa
    Indonesia sehari-hari justru menjauh dari istilah yang diuji di kampus.
    """
    head = re.sub(r"[^a-zA-Z]", "", name_en.split()[-1]).lower()
    entry = HEAD_NOUNS.get(head)
    if entry is None:
        return None
    _la, _g, id_head = entry
    rest = latin.split()[1:]
    if not rest:
        return id_head
    return " ".join([id_head, *rest])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sample", type=int, default=25)
    args = ap.parse_args()

    if not STRUCTURES.exists():
        raise SystemExit(f"Tidak ada {STRUCTURES}. Jalankan 04_pack_batches.py dulu.")

    doc = json.loads(STRUCTURES.read_text(encoding="utf-8"))
    items: list[tuple[str, str]] = [(s["fma"], s["name"]["en"]) for s in doc["structures"]]
    items += [(g["fma"], g["name"]["en"]) for g in doc.get("groups", [])]
    # FMA bisa muncul di structures dan groups; satu entri saja per FMA.
    seen: dict[str, str] = {}
    for fma, en in items:
        seen.setdefault(fma, en)

    la_entries = []
    id_entries = []
    skipped: list[str] = []
    samples: list[tuple[str, str, str]] = []

    # Draf LLM menang atas aturan (urutan kata aturan sering salah), tapi kalah
    # dari review manusia yang ditimpakan sesudah loop ini.
    draft = load_draft()
    llm_la = llm_id = 0

    for fma, en in sorted(seen.items()):
        drafted = resolve(en, draft)
        if drafted is not None:
            d_latin, d_unsure, d_idn = drafted
            status = "needs-review" if d_unsure else "machine"
            la_entries.append({"fma": fma, "term": d_latin, "source": "llm", "status": status})
            llm_la += 1
            d_indo = indonesian_from_latin(d_latin, d_idn)
            if d_indo is not None:
                id_entries.append({"fma": fma, "term": d_indo, "source": "llm", "status": status})
                llm_id += 1
            continue

        result = to_latin(en)
        if result is None:
            skipped.append(en)
            continue
        latin, _used, risky = result
        indo = to_indonesian(en, latin)
        if indo is None:
            skipped.append(en)
            continue

        la_entries.append({
            "fma": fma,
            "term": latin[:1].upper() + latin[1:],
            "source": "machine",
            "status": "needs-review" if risky else "machine",
        })
        id_entries.append({
            "fma": fma,
            "term": indo[:1].upper() + indo[1:],
            "source": "machine",
            "status": "needs-review" if risky else "machine",
        })
        if len(samples) < args.sample:
            samples.append((en, latin, indo))

    # Timpakan buku besar review manusia (data_curated/nomenclature_reviews.json).
    # Tanpa langkah ini, tiap `npm run data:build` menghapus seluruh hasil review
    # tanpa jejak — lihat scripts/nomenclature_reviews.py.
    reviews = load_reviews()
    la_entries, la_replaced, la_added = apply_reviews(la_entries, "la", reviews)
    id_entries, id_replaced, id_added = apply_reviews(id_entries, "id", reviews)

    note = (
        "Entri berstatus `machine`/`needs-review` BELUM diverifikasi manusia: "
        "wajib berbadge di UI (§E7 AC4) dan tidak boleh dipakai sebagai jawaban "
        "benar di quiz (§E10 AC14). Entri `reviewed` berasal dari "
        "data_curated/nomenclature_reviews.json — JANGAN edit file ini langsung, "
        "ia dibangun ulang tiap pipeline jalan."
    )
    for path, entries, lang in ((OUT_LA, la_entries, "la"), (OUT_ID, id_entries, "id")):
        path.write_text(
            json.dumps(
                {"schema": 1, "lang": lang, "note": note, "entries": entries},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )

    total = len(seen)
    done = len(la_entries)
    print("=" * 68)
    print("CONTOH HASIL — periksa ini sebelum mempercayai apa pun")
    print("=" * 68)
    for en, la, idn in samples:
        print(f"  {en[:44]:44s} -> {la}")
        print(f"  {'':44s}    {idn}")
    print("\n" + "=" * 68)
    print(f"draf LLM           : la {llm_la} · id {llm_id}  (source=llm, tetap berbadge)")
    risky_n = sum(1 for e in la_entries if e["status"] == "needs-review")
    reviewed_la = sum(1 for e in la_entries if e["status"] == "reviewed")
    reviewed_id = sum(1 for e in id_entries if e["status"] == "reviewed")
    print(f"konsep total       : {total}")
    print(f"berhasil diturunkan: {done}  ({100 * done / total:.1f}%)")
    print(f"  status machine       : {done - risky_n - la_replaced}  (1 adjektiva, urutan pasti)")
    print(f"  status needs-review  : {risky_n}  (>1 adjektiva, urutan tebakan)")
    print(f"review manusia     : la {reviewed_la} (ganti {la_replaced}, tambah {la_added}) · "
          f"id {reviewed_id} (ganti {id_replaced}, tambah {id_added})")
    print(f"dilewati           : {len(skipped)}  ({100 * len(skipped) / total:.1f}%)")
    print("\nDilewati BUKAN kegagalan — itu keluaran yang benar untuk nama yang")
    print("butuh konstruksi genitif atau memuat kata di luar kamus.")
    print(f"\ncontoh yang dilewati: {skipped[:5]}")
    print(f"\nditulis: {OUT_LA.relative_to(REPO_ROOT)}")
    print(f"         {OUT_ID.relative_to(REPO_ROOT)}")
    if reviewed_la == 0 and reviewed_id == 0:
        print()
        print("⚠️  Belum ada satu pun entri `reviewed`. §E7 AC6 menuntutnya,")
        print("    jadi cakupan v1.0 BELUM terpenuhi. Mulai lewat:")
        print("    python scripts/07_review_nomenclature.py sheet --lang la")
    return 0


if __name__ == "__main__":
    sys.exit(main())
