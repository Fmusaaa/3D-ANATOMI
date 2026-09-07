#!/usr/bin/env python3
"""
01_download.py — unduh dataset BodyParts3D ke data_raw/ (PRD §6.1, §6.2).

Langkah pertama pipeline. Tugasnya HANYA: unduh, catat checksum, ekstrak, dan
laporkan apa yang sebenarnya ada di dalam file. Skrip ini SENGAJA tidak mem-parse
apa pun — PRD §6.1 memperingatkan:

    "Jangan asumsikan format kolom file teks ini. Langkah pertama Fase 0 adalah
    download, `head -20` tiap file, dan tulis parser berdasarkan isi sebenarnya,
    bukan berdasarkan tebakan."

Jadi skrip ini berakhir dengan mencetak potongan awal tiap file teks supaya
format aslinya bisa diinspeksi sebelum `02_parse_ontology.py` ditulis.

Pemakaian:
    python scripts/01_download.py                 # unduh semua
    python scripts/01_download.py --inspect-only  # lewati unduh, inspeksi yang sudah ada
    python scripts/01_download.py --no-extract    # unduh saja, jangan ekstrak zip
    python scripts/01_download.py --only isa_parts_list_e.txt
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------
# Konfigurasi
# --------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data_raw"
EXTRACT_DIR = RAW_DIR / "extracted"
MANIFEST_PATH = RAW_DIR / "download_manifest.json"

# Halaman resmi (dicatat di sini supaya jelas dari mana angka-angka ini berasal):
#   https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
#   https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
# Path terverifikasi dari halaman unduhan resmi (7 Sep 2026). Tebakan awal
# ".../20110915/" ternyata 404 — DBCLS memakai alias "LATEST".
BASE_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST"

USER_AGENT = "corpus-atlas-anatomi/0.1 (+riset edukasi; kontak: repo issue)"

# Timeout longgar: file mesh 136 MB dari server akademik Jepang bisa lambat.
TIMEOUT_S = 120
RETRIES = 3
CHUNK = 1 << 16  # 64 KiB

# Progress bar memakai carriage return: berguna di terminal, tapi bikin log
# puluhan MB kalau output di-redirect ke file.
IS_TTY = sys.stdout.isatty()


@dataclass(frozen=True)
class Asset:
    """Satu file yang perlu diunduh."""

    name: str
    url_path: str
    kind: str  # "mesh-archive" | "text"
    expected_mb: float
    purpose: str
    extract: bool = False
    # Sengaja kosong: checksum resmi tidak dipublikasikan DBCLS. Kita hitung
    # sendiri saat unduh pertama dan simpan ke download_manifest.json, supaya
    # unduhan berikutnya bisa dibandingkan dan aset basi ketahuan (§11.3).
    known_sha256: str | None = None

    @property
    def url(self) -> str:
        return f"{BASE_URL}/{self.url_path}"

    @property
    def dest(self) -> Path:
        return RAW_DIR / self.name


# PRD §6.1 — tabel unduhan. URL & ukuran diverifikasi dari halaman unduhan resmi
# dan README_e.html (7 Sep 2026); tiga file part-of ternyata lebih kecil dari yang
# ditulis di PRD, jadi ekspektasi di sini mengikuti README, bukan PRD.
ASSETS: list[Asset] = [
    Asset(
        name="isa_BP3D_4.0_obj_99.zip",
        url_path="isa_BP3D_4.0_obj_99.zip",
        kind="mesh-archive",
        expected_mb=136.0,
        purpose="Mesh OBJ, hierarki is-a",
        extract=True,
    ),
    Asset(
        name="partof_BP3D_4.0_obj_99.zip",
        url_path="partof_BP3D_4.0_obj_99.zip",
        kind="mesh-archive",
        expected_mb=62.0,
        purpose="Mesh OBJ, hierarki part-of",
        extract=True,
    ),
    Asset(
        name="isa_parts_list_e.txt",
        url_path="isa_parts_list_e.txt",
        kind="text",
        expected_mb=0.126,
        purpose="FMA ID <-> nama Inggris",
    ),
    Asset(
        name="isa_element_parts.txt",
        url_path="isa_element_parts.txt",
        kind="text",
        expected_mb=1.1,
        purpose="Konsep <-> file elemen penyusunnya",
    ),
    Asset(
        name="isa_inclusion_relation_list.txt",
        url_path="isa_inclusion_relation_list.txt",
        kind="text",
        expected_mb=0.203,
        purpose="Hierarki is-a",
    ),
    Asset(
        name="partof_parts_list_e.txt",
        url_path="partof_parts_list_e.txt",
        kind="text",
        expected_mb=0.058,
        purpose="FMA ID <-> nama Inggris (part-of)",
    ),
    Asset(
        name="partof_element_parts.txt",
        url_path="partof_element_parts.txt",
        kind="text",
        expected_mb=0.654,
        purpose="Konsep <-> elemen (part-of)",
    ),
    Asset(
        name="partof_inclusion_relation_list.txt",
        url_path="partof_inclusion_relation_list.txt",
        kind="text",
        expected_mb=0.090,
        purpose="Hierarki part-of — sumber systemId tiap struktur (§6.2)",
    ),
]


# --------------------------------------------------------------------------
# Util
# --------------------------------------------------------------------------


def human(n: int) -> str:
    f = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if f < 1024 or unit == "GB":
            return f"{f:.1f} {unit}" if unit != "B" else f"{int(f)} B"
        f /= 1024
    return f"{f:.1f} GB"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def log(msg: str = "") -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------
# Unduh
# --------------------------------------------------------------------------


@dataclass
class DownloadResult:
    asset: Asset
    ok: bool
    skipped: bool = False
    size: int = 0
    sha256: str = ""
    error: str = ""
    notes: list[str] = field(default_factory=list)


def download_one(asset: Asset, *, force: bool = False) -> DownloadResult:
    dest = asset.dest
    if dest.exists() and not force:
        size = dest.stat().st_size
        log(f"  [lewat] {asset.name} sudah ada ({human(size)})")
        return DownloadResult(asset, ok=True, skipped=True, size=size, sha256=sha256_of(dest))

    tmp = dest.with_suffix(dest.suffix + ".part")
    last_err = ""

    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(asset.url, headers={"User-Agent": USER_AGENT})
            started = time.monotonic()
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                total_hdr = resp.headers.get("Content-Length")
                total = int(total_hdr) if total_hdr else 0
                got = 0
                with tmp.open("wb") as out:
                    while True:
                        block = resp.read(CHUNK)
                        if not block:
                            break
                        out.write(block)
                        got += len(block)
                        if IS_TTY:
                            if total:
                                pct = got * 100 // total
                                print(
                                    f"\r  [unduh] {asset.name}: {pct:3d}% "
                                    f"({human(got)}/{human(total)})",
                                    end="",
                                    flush=True,
                                )
                            else:
                                print(f"\r  [unduh] {asset.name}: {human(got)}", end="", flush=True)
            if IS_TTY:
                print()
            elapsed = time.monotonic() - started
            tmp.replace(dest)
            size = dest.stat().st_size
            digest = sha256_of(dest)

            result = DownloadResult(asset, ok=True, size=size, sha256=digest)

            # Peringatan ukuran: kalau meleset jauh dari ekspektasi PRD, mungkin
            # server mengembalikan halaman error HTML, bukan data.
            expected = asset.expected_mb * 1024 * 1024
            if expected > 0 and (size < expected * 0.5 or size > expected * 2.0):
                result.notes.append(
                    f"ukuran {human(size)} jauh dari ekspektasi PRD "
                    f"(~{asset.expected_mb} MB) — periksa isinya"
                )
            if size < 4096 and asset.kind == "mesh-archive":
                result.notes.append("file sangat kecil untuk arsip mesh — kemungkinan halaman error")

            log(f"  [ok]    {asset.name} {human(size)} dalam {elapsed:.1f}s  sha256={digest[:16]}...")
            return result

        except urllib.error.HTTPError as exc:
            last_err = f"HTTP {exc.code} {exc.reason} @ {asset.url}"
        except urllib.error.URLError as exc:
            last_err = f"jaringan: {exc.reason} @ {asset.url}"
        except TimeoutError:
            last_err = f"timeout setelah {TIMEOUT_S}s @ {asset.url}"
        except OSError as exc:
            last_err = f"IO: {exc}"

        if attempt < RETRIES:
            backoff = 2**attempt
            log(f"  [retry] {asset.name} gagal ({last_err}); coba lagi dalam {backoff}s")
            time.sleep(backoff)

    tmp.unlink(missing_ok=True)
    log(f"  [GAGAL] {asset.name}: {last_err}")
    return DownloadResult(asset, ok=False, error=last_err)


def extract_one(asset: Asset) -> list[str]:
    """Ekstrak arsip mesh. Mengembalikan catatan untuk laporan."""
    notes: list[str] = []
    target = EXTRACT_DIR / asset.name.replace(".zip", "")
    if target.exists() and any(target.iterdir()):
        notes.append(f"sudah terekstrak di {target.relative_to(REPO_ROOT)}")
        return notes

    target.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(asset.dest) as zf:
            members = zf.namelist()
            # Guard path traversal — arsip pihak ketiga, jangan percaya nama entri.
            safe = []
            for m in members:
                p = (target / m).resolve()
                if not str(p).startswith(str(target.resolve())):
                    notes.append(f"entri ditolak (path traversal): {m}")
                    continue
                safe.append(m)
            log(f"  [ekstrak] {asset.name}: {len(safe)} entri -> {target.relative_to(REPO_ROOT)}")
            zf.extractall(target, members=safe)
        objs = list(target.rglob("*.obj"))
        notes.append(f"{len(objs)} file .obj terekstrak")
    except zipfile.BadZipFile:
        notes.append("BUKAN zip yang valid — kemungkinan unduhan mengembalikan HTML error")
    return notes


# --------------------------------------------------------------------------
# Inspeksi — inti dari langkah F0 ini
# --------------------------------------------------------------------------


def sniff_encoding(path: Path) -> tuple[str, str]:
    """Tebak encoding. Mengembalikan (encoding, catatan)."""
    head = path.read_bytes()[:65536]
    if head.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig", "ada BOM UTF-8"
    for enc in ("utf-8", "cp932", "latin-1"):
        try:
            head.decode(enc)
            return enc, "" if enc == "utf-8" else f"bukan UTF-8 valid; jatuh ke {enc}"
        except UnicodeDecodeError:
            continue
    return "latin-1", "encoding tidak dikenali; dibaca sebagai latin-1"


def detect_delimiter(lines: list[str]) -> tuple[str, str]:
    """Tebak delimiter dari beberapa baris pertama. Mengembalikan (nama, char)."""
    candidates = {"TAB": "\t", "koma": ",", "titik-koma": ";", "pipa": "|"}
    best_name, best_char, best_score = "tidak jelas", "", 0
    for name, ch in candidates.items():
        counts = [ln.count(ch) for ln in lines if ln.strip()]
        if not counts or counts[0] == 0:
            continue
        # Konsisten = delimiter beneran, bukan kebetulan.
        consistent = sum(1 for c in counts if c == counts[0])
        score = consistent * 100 + counts[0]
        if score > best_score:
            best_name, best_char, best_score = name, ch, score
    return best_name, best_char


def inspect_text(path: Path, n: int = 20) -> dict[str, object]:
    """`head -20` versi terstruktur. INI yang harus dibaca manusia sebelum parser ditulis."""
    enc, enc_note = sniff_encoding(path)
    raw = path.read_bytes()
    text = raw.decode(enc, errors="replace")

    newline = "CRLF" if "\r\n" in text[:8192] else ("CR" if "\r" in text[:8192] else "LF")
    lines = text.splitlines()
    head = lines[:n]

    delim_name, delim_char = detect_delimiter(head)
    field_counts: list[int] = []
    if delim_char:
        field_counts = [len(ln.split(delim_char)) for ln in head if ln.strip()]

    log("")
    log("=" * 78)
    log(f"FILE: {path.name}   ({human(len(raw))}, {len(lines)} baris)")
    log(f"  encoding : {enc}{'  — ' + enc_note if enc_note else ''}")
    log(f"  newline  : {newline}")
    log(f"  delimiter: {delim_name}" + (f" ({delim_char!r})" if delim_char else ""))
    if field_counts:
        uniq = sorted(set(field_counts))
        log(f"  kolom    : {uniq}" + ("  <-- TIDAK KONSISTEN" if len(uniq) > 1 else ""))
    log("-" * 78)
    for i, ln in enumerate(head, 1):
        shown = ln if len(ln) <= 160 else ln[:157] + "..."
        log(f"{i:3d} | {shown}")
    log("=" * 78)

    return {
        "file": path.name,
        "bytes": len(raw),
        "lines": len(lines),
        "encoding": enc,
        "encoding_note": enc_note,
        "newline": newline,
        "delimiter": delim_name,
        "delimiter_char": delim_char,
        "field_counts_head": sorted(set(field_counts)),
        "head": head,
    }


def inspect_meshes() -> dict[str, object]:
    """Intip satu file OBJ supaya format geometrinya diketahui, bukan ditebak."""
    objs = sorted(EXTRACT_DIR.rglob("*.obj"))
    if not objs:
        log("\n[info] Belum ada file .obj terekstrak — lewati inspeksi mesh.")
        return {"obj_count": 0}

    sample = objs[0]
    lines = sample.read_text(encoding="utf-8", errors="replace").splitlines()
    v = sum(1 for ln in lines if ln.startswith("v "))
    vn = sum(1 for ln in lines if ln.startswith("vn "))
    f = sum(1 for ln in lines if ln.startswith("f "))

    total_bytes = sum(p.stat().st_size for p in objs)

    log("")
    log("=" * 78)
    log(f"MESH: {len(objs)} file .obj, total {human(total_bytes)}")
    log(f"  contoh: {sample.relative_to(EXTRACT_DIR)}")
    log(f"  vertex={v}  normal={vn}  face={f}")
    log("-" * 78)
    for i, ln in enumerate(lines[:12], 1):
        log(f"{i:3d} | {ln[:160]}")
    log("=" * 78)

    return {
        "obj_count": len(objs),
        "obj_total_bytes": total_bytes,
        "sample": str(sample.relative_to(EXTRACT_DIR)),
        "sample_vertices": v,
        "sample_normals": vn,
        "sample_faces": f,
        "sample_head": lines[:12],
    }


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inspect-only", action="store_true", help="jangan unduh, inspeksi yang sudah ada")
    ap.add_argument("--no-extract", action="store_true", help="unduh saja, jangan ekstrak zip")
    ap.add_argument("--force", action="store_true", help="unduh ulang walau file sudah ada")
    ap.add_argument("--only", nargs="*", metavar="NAMA", help="batasi ke nama file tertentu")
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)

    assets = ASSETS
    if args.only:
        wanted = set(args.only)
        assets = [a for a in ASSETS if a.name in wanted]
        unknown = wanted - {a.name for a in ASSETS}
        if unknown:
            log(f"[peringatan] nama tidak dikenal, diabaikan: {sorted(unknown)}")

    log("BodyParts3D — unduh (PRD §6.1)")
    log(f"  sumber : {BASE_URL}")
    log(f"  tujuan : {RAW_DIR.relative_to(REPO_ROOT)}")
    log("")

    results: list[DownloadResult] = []
    if args.inspect_only:
        log("[mode] --inspect-only: melewati unduhan.")
        for a in assets:
            if a.dest.exists():
                results.append(
                    DownloadResult(a, ok=True, skipped=True, size=a.dest.stat().st_size, sha256=sha256_of(a.dest))
                )
            else:
                results.append(DownloadResult(a, ok=False, error="tidak ada di data_raw/"))
    else:
        log("Mengunduh:")
        for a in assets:
            results.append(download_one(a, force=args.force))

    # Ekstrak
    if not args.no_extract:
        log("")
        log("Mengekstrak arsip mesh:")
        for r in results:
            if r.ok and r.asset.extract and r.asset.dest.exists():
                r.notes.extend(extract_one(r.asset))

    # Inspeksi — bagian yang penting
    log("")
    log("#" * 78)
    log("# INSPEKSI FORMAT — baca ini sebelum menulis 02_parse_ontology.py")
    log("# PRD §6.1: jangan asumsikan format kolom. Parser ditulis dari isi nyata.")
    log("#" * 78)

    inspections: list[dict[str, object]] = []
    for r in results:
        if r.ok and r.asset.kind == "text" and r.asset.dest.exists():
            inspections.append(inspect_text(r.asset.dest))

    mesh_info = inspect_meshes() if not args.no_extract else {"obj_count": 0}

    # Manifest
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "base_url": BASE_URL,
        "note": (
            "Checksum dihitung lokal saat unduhan pertama; DBCLS tidak "
            "mempublikasikan checksum resmi. Bandingkan antar-unduhan untuk "
            "mendeteksi aset basi (PRD §11.3)."
        ),
        "assets": [
            {
                "name": r.asset.name,
                "url": r.asset.url,
                "purpose": r.asset.purpose,
                "ok": r.ok,
                "bytes": r.size,
                "sha256": r.sha256,
                "error": r.error,
                "notes": r.notes,
            }
            for r in results
        ],
        "text_inspection": inspections,
        "mesh_inspection": mesh_info,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    # Ringkasan
    failed = [r for r in results if not r.ok]
    noted = [r for r in results if r.notes]

    log("")
    log("RINGKASAN")
    log(f"  berhasil : {len(results) - len(failed)}/{len(results)}")
    total_bytes = sum(r.size for r in results if r.ok)
    log(f"  total    : {human(total_bytes)}")
    log(f"  manifest : {MANIFEST_PATH.relative_to(REPO_ROOT)}")
    if noted:
        log("  catatan  :")
        for r in noted:
            for n in r.notes:
                log(f"    - {r.asset.name}: {n}")
    if failed:
        log("  GAGAL    :")
        for r in failed:
            log(f"    - {r.asset.name}: {r.error}")
        log("")
        log("  URL di skrip ini adalah tebakan berbasis pola arsip DBCLS. Kalau HTTP 404,")
        log("  buka halaman unduhan resmi dan koreksi BASE_URL / url_path:")
        log("    https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html")
        return 1

    free = shutil.disk_usage(RAW_DIR).free
    log(f"  disk     : {human(free)} tersisa")
    log("")
    log("Berikutnya: LAPORKAN format di atas ke product owner sebelum menulis parser.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
