#!/usr/bin/env python3
"""
04_pack_batches.py — gabung mesh jadi batch `.atlas` + manifest (PRD §6.2, §6.3).

Masukan : data_interim/structures_raw.json + data_interim/mesh/*.npz
Keluaran: public/data/geometry/*.atlas
          public/data/manifest.json
          public/data/content/structures.json

--------------------------------------------------------------------------
KONVERSI KOORDINAT
--------------------------------------------------------------------------
BP3D  : satuan mm, Z ke atas, origin di telapak kaki, **anterior = −Y**
        (terukur: corpus sterni Yc = −189,5 vs os sacrum Yc = −37,1)
three : satuan m, Y ke atas, +Z ke arah penonton, model ter-center

    X' =  X      Y' =  Z      Z' = −Y      lalu skala 1/1000, lalu center

Determinan matriks itu +1, jadi **handedness terjaga dan winding face tidak
perlu dibalik**. Sisi kanan pasien ada di X negatif (terukur: "Right femur"
Xc = −91), sehingga saat dilihat dari +Z sisi kanan pasien muncul di kiri
layar — persis konvensi menghadap pasien.

--------------------------------------------------------------------------
UKURAN BATCH — jawaban terukur untuk §5.3.1
--------------------------------------------------------------------------
PRD §5.3.1 mencatat index buffer justru dominan, dan menawarkan mitigasi (a)
pecah batch sampai < 65.536 vertex supaya index muat Uint16.

Terukur pada dataset ini (1.516.021 vertex, 3.027.112 segitiga):

    index Uint32 : 34,6 MB
    index Uint16 : 17,3 MB      <- hemat 17,3 MB
    atribut      : 14,5 MB      (pos 6 + normal 2 + structureIdx 2 = 10 B/vertex)

Jadi default MAX_VERTS_PER_BATCH = 65.536 dan **semua index Uint16**. Biayanya
jumlah batch naik (draw call = batch x 2 pass), tapi masih jauh di bawah 2.234
draw call yang dihindari §5.3.

Pakai --max-verts 0 untuk satu batch per sistem (index Uint32) sebagai pembanding.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
INTERIM = REPO_ROOT / "data_interim"
MESH_DIR = INTERIM / "mesh"
STRUCTURES_RAW = INTERIM / "structures_raw.json"

OUT_DATA = REPO_ROOT / "public" / "data"
OUT_GEOM = OUT_DATA / "geometry"
OUT_CONTENT = OUT_DATA / "content"
MANIFEST = OUT_DATA / "manifest.json"

MAGIC = b"ATLAS001"
FORMAT_VERSION = 1
MAX_VERTS_PER_BATCH = 65536  # -> index Uint16

# §E10 AC13 mengecualikan mesh rusak dari soal `name-to-structure`. Ambang 0,4
# di PRD ditulis sebelum ada pengukuran dan mengecualikan NOL struktur.
# Diputuskan (D-011): patok di persentil 5 dari sebaran nyata, dihitung di sini
# supaya tidak jadi angka ajaib yang basi kalau dataset berubah.
QUALITY_EXCLUDE_PERCENTILE = 5.0


# --------------------------------------------------------------------------
# Encoding
# --------------------------------------------------------------------------


def _sign_not_zero(v: np.ndarray) -> np.ndarray:
    """
    signNotZero: nol dipetakan ke +1.

    ⚠️ WAJIB. `np.sign(0) == 0`, dan itu merusak lipatan oktahedral untuk
    normal di hemisfer bawah yang salah satu komponennya tepat nol —
    [0,0,-1] ter-encode identik dengan [0,0,+1] (error 180°). Normal acak
    hampir tak pernah kena, tapi mesh anatomi penuh face datar sumbu-sejajar.
    Shader di Fase 1 HARUS memakai konvensi yang sama.
    """
    return np.where(v >= 0.0, 1.0, -1.0)


def oct_encode(n: np.ndarray) -> np.ndarray:
    """Normal unit -> oktahedral Int8 x2 (PRD §5.3.1)."""
    n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    denom = np.sum(np.abs(n), axis=1, keepdims=True)
    denom[denom == 0] = 1.0
    p = n[:, :2] / denom
    lower = n[:, 2] < 0
    if np.any(lower):
        pl = p[lower]
        folded = (1.0 - np.abs(pl[:, ::-1])) * _sign_not_zero(pl)
        p[lower] = folded
    return np.clip(np.round(p * 127.0), -127, 127).astype(np.int8)


def oct_decode(e: np.ndarray) -> np.ndarray:
    """Kebalikan oct_encode — dipakai untuk mengukur error, bukan runtime."""
    p = e.astype(np.float64) / 127.0
    z = 1.0 - np.sum(np.abs(p), axis=1)
    lower = z < 0
    if np.any(lower):
        pl = p[lower]
        p[lower] = (1.0 - np.abs(pl[:, ::-1])) * _sign_not_zero(pl)
    v = np.concatenate([p, z[:, None]], axis=1)
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)


def quantize(pos: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Posisi float -> Int16 per batch.

    Dipilih supaya dekuantisasi di shader cuma satu MAD:
        p = q * quantScale + quantOffset
    """
    lo = pos.min(axis=0)
    hi = pos.max(axis=0)
    span = np.maximum(hi - lo, 1e-9)
    scale = span / 65535.0
    q = np.round((pos - lo) / scale) - 32768.0
    q = np.clip(q, -32768, 32767).astype(np.int16)
    offset = lo + 32768.0 * scale
    return q, scale.astype(np.float64), offset.astype(np.float64)


def align4(n: int) -> int:
    return (n + 3) & ~3


# --------------------------------------------------------------------------
# Penulisan .atlas
# --------------------------------------------------------------------------


def write_atlas(path: Path, header: dict, buffers: dict[str, np.ndarray]) -> int:
    """
    MAGIC u8[8] | headerLen u32 | header JSON | buffer berurutan, 4-byte aligned.
    `offset` di header relatif terhadap awal blok buffer.
    """
    order = ["position", "normal", "structureIdx", "index"]
    meta: dict[str, dict] = {}
    blob = bytearray()
    for name in order:
        arr = np.ascontiguousarray(buffers[name])
        while len(blob) % 4:
            blob.append(0)
        meta[name] = {
            "offset": len(blob),
            "byteLength": arr.nbytes,
            "type": {
                "int16": "i16", "int8": "i8", "uint16": "u16", "uint32": "u32",
            }[arr.dtype.name],
            "components": 1 if arr.ndim == 1 else int(arr.shape[1]),
        }
        blob += arr.tobytes()

    header["buffers"] = meta
    head = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

    with path.open("wb") as fh:
        fh.write(MAGIC)
        fh.write(struct.pack("<I", len(head)))
        fh.write(head)
        pad = (-(len(MAGIC) + 4 + len(head))) % 4
        fh.write(b"\0" * pad)
        fh.write(bytes(blob))
    return path.stat().st_size


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-verts", type=int, default=MAX_VERTS_PER_BATCH,
                    help="0 = satu batch per sistem (index Uint32)")
    args = ap.parse_args()

    if not STRUCTURES_RAW.exists():
        raise SystemExit(f"Tidak ada {STRUCTURES_RAW}. Jalankan 02 lalu 03 dulu.")

    doc = json.loads(STRUCTURES_RAW.read_text(encoding="utf-8"))
    structures = doc["structures"]

    print(f"Memuat {len(structures)} mesh...")
    meshes: dict[str, dict] = {}
    qualities: list[float] = []
    for s in structures:
        f = MESH_DIR / f"{s['fileId']}.npz"
        if not f.exists():
            raise SystemExit(f"{f} tidak ada. Jalankan 03_decimate.py dulu.")
        with np.load(f) as z:
            meshes[s["fileId"]] = {
                "v": z["v"].astype(np.float64),
                "f": z["f"].astype(np.int64),
                "n": z["n"].astype(np.float64),
                "quality": float(z["quality"]),
            }
        qualities.append(meshes[s["fileId"]]["quality"])

    quality_threshold = float(np.percentile(np.array(qualities), QUALITY_EXCLUDE_PERCENTILE))
    n_excluded = int((np.array(qualities) < quality_threshold).sum())
    print(f"ambang mutu p{QUALITY_EXCLUDE_PERCENTILE:.0f} = {quality_threshold:.4f} "
          f"-> {n_excluded} struktur dikecualikan dari quiz klik (D-011)")

    # ---- transformasi ke ruang viewer -------------------------------------
    # X' = X, Y' = Z, Z' = -Y ; mm -> m ; lalu center
    def to_viewer(v: np.ndarray) -> np.ndarray:
        return np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1) / 1000.0

    lo = np.full(3, np.inf)
    hi = np.full(3, -np.inf)
    for m in meshes.values():
        p = to_viewer(m["v"])
        lo = np.minimum(lo, p.min(axis=0))
        hi = np.maximum(hi, p.max(axis=0))
    center = (lo + hi) / 2.0
    print(f"bbox tubuh (m, setelah remap): "
          f"X {hi[0]-lo[0]:.3f}  Y {hi[1]-lo[1]:.3f}  Z {hi[2]-lo[2]:.3f}")

    # ---- kelompokkan jadi batch -------------------------------------------
    # Urutan deterministik (§E6 AC4 minta layout deterministik; sumbernya di sini).
    ordered = sorted(structures, key=lambda s: (s["system"], s["region"], s["fileId"]))
    batches: list[list[dict]] = []
    cur: list[dict] = []
    cur_v = 0
    cur_sys = None
    limit = args.max_verts if args.max_verts > 0 else 1 << 62
    for s in ordered:
        nv = len(meshes[s["fileId"]]["v"])
        if cur and (s["system"] != cur_sys or cur_v + nv > limit):
            batches.append(cur)
            cur, cur_v = [], 0
        cur.append(s)
        cur_v += nv
        cur_sys = s["system"]
    if cur:
        batches.append(cur)

    OUT_GEOM.mkdir(parents=True, exist_ok=True)
    OUT_CONTENT.mkdir(parents=True, exist_ok=True)
    for old in OUT_GEOM.glob("*.atlas"):
        old.unlink()

    # ---- tulis tiap batch --------------------------------------------------
    import brotli

    seq: dict[str, int] = {}
    entries: list[dict] = []
    pos_err_max = 0.0
    nrm_err_max = 0.0
    total_raw = total_br = 0

    for group in batches:
        system = group[0]["system"]
        seq[system] = seq.get(system, 0) + 1
        name = f"{system}.{seq[system]:02d}.atlas" if len([b for b in batches if b[0]["system"] == system]) > 1 else f"{system}.atlas"

        pos_l, nrm_l, sid_l, idx_l = [], [], [], []
        struct_meta = []
        v_off = 0
        i_off = 0
        for s in group:
            m = meshes[s["fileId"]]
            p = to_viewer(m["v"]) - center
            # Remap normal dengan matriks yang sama; determinan +1, panjang terjaga.
            nv = m["n"]
            n = np.stack([nv[:, 0], nv[:, 2], -nv[:, 1]], axis=1)

            pos_l.append(p)
            nrm_l.append(n)
            sid_l.append(np.full(len(p), s["idx"], dtype=np.uint16))
            idx_l.append(m["f"] + v_off)

            lo_s, hi_s = p.min(axis=0), p.max(axis=0)
            struct_meta.append({
                "idx": s["idx"],
                "fma": s["fma"],
                "fileId": s["fileId"],
                "indexStart": i_off,
                "indexCount": int(m["f"].size),
                "centroid": [round(float(x), 5) for x in (lo_s + hi_s) / 2],
                "bbox": [[round(float(x), 5) for x in lo_s], [round(float(x), 5) for x in hi_s]],
                "meshQuality": round(m["quality"], 4),
            })
            v_off += len(p)
            i_off += int(m["f"].size)

        pos = np.concatenate(pos_l)
        nrm = np.concatenate(nrm_l)
        sid = np.concatenate(sid_l)
        idx = np.concatenate(idx_l).reshape(-1)

        qpos, qscale, qoffset = quantize(pos)
        pos_err_max = max(pos_err_max, float(np.abs(qpos.astype(np.float64) * qscale + qoffset - pos).max()))

        enc_n = oct_encode(nrm)
        dot = np.clip(np.einsum("ij,ij->i", oct_decode(enc_n), nrm), -1, 1)
        nrm_err_max = max(nrm_err_max, float(np.degrees(np.arccos(dot)).max()))

        idx_dtype = np.uint16 if v_off <= 65536 else np.uint32
        header = {
            "version": FORMAT_VERSION,
            "systemId": system,
            "quantScale": [float(x) for x in qscale],
            "quantOffset": [float(x) for x in qoffset],
            "vertexCount": int(v_off),
            "indexCount": int(idx.size),
            "structures": struct_meta,
        }
        path = OUT_GEOM / name
        size = write_atlas(path, header, {
            "position": qpos,
            "normal": enc_n,
            "structureIdx": sid,
            "index": idx.astype(idx_dtype),
        })
        raw = path.read_bytes()
        br = len(brotli.compress(raw, quality=11))
        total_raw += size
        total_br += br
        entries.append({
            "file": f"geometry/{name}",
            "systemId": system,
            "vertexCount": int(v_off),
            "indexCount": int(idx.size),
            "triangleCount": int(idx.size // 3),
            "structureCount": len(group),
            "indexType": "u16" if idx_dtype is np.uint16 else "u32",
            "bytes": size,
            "bytesBrotli": br,
            "sha256": hashlib.sha256(raw).hexdigest(),
        })
        print(f"  {name:36s} v={v_off:6,} tri={idx.size//3:7,} "
              f"{size/1024/1024:5.2f} MB -> br {br/1024/1024:5.2f} MB")

    # ---- structures.json (§6.4) -------------------------------------------
    qmap = {s["fileId"]: meshes[s["fileId"]]["quality"] for s in structures}
    content = {
        "schema": 1,
        "note": (
            "parent = induk part-of kalau ada, kalau tidak induk is-a. "
            "parentPartof/parentIsa disediakan terpisah karena keduanya punya arti "
            "berbeda: part-of = topografi, is-a = tipe. highYield masih false untuk "
            "semua (D-010: daftar high-yield belum dikurasi)."
        ),
        "meshQualityExcludeBelow": round(quality_threshold, 4),
        "structures": [
            {
                "idx": s["idx"],
                "fma": s["fma"],
                "fileId": s["fileId"],
                "system": s["system"],
                "region": s["region"],
                "regionVia": s["regionVia"],
                "laterality": s["laterality"],
                "name": {"en": s["name"]["en"]},
                "highYield": False,
                "meshQuality": round(qmap[s["fileId"]], 4),
            }
            for s in structures
        ],
    }
    (OUT_CONTENT / "structures.json").write_text(
        json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    sj = (OUT_CONTENT / "structures.json").stat().st_size
    sj_br = len(brotli.compress((OUT_CONTENT / "structures.json").read_bytes(), quality=11))

    manifest = {
        "schema": 1,
        "formatVersion": FORMAT_VERSION,
        "source": "BodyParts3D 4.0 (isa tree)",
        "units": "meter",
        "axes": "Y-up, +Z anterior, model ter-center",
        "structureCount": len(structures),
        "triangleCount": int(sum(e["triangleCount"] for e in entries)),
        "vertexCount": int(sum(e["vertexCount"] for e in entries)),
        "meshQualityExcludeBelow": round(quality_threshold, 4),
        "batches": entries,
        "content": {
            "structures": {
                "file": "content/structures.json",
                "bytes": sj,
                "bytesBrotli": sj_br,
                "sha256": hashlib.sha256((OUT_CONTENT / "structures.json").read_bytes()).hexdigest(),
            }
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 68)
    print(f"batch            : {len(entries)}  (draw call ~{len(entries) * 2} untuk 2 pass)")
    print(f"index Uint16     : {sum(1 for e in entries if e['indexType'] == 'u16')}/{len(entries)}")
    print(f"geometri mentah  : {total_raw/1024/1024:.1f} MB")
    print(f"geometri Brotli  : {total_br/1024/1024:.1f} MB")
    print(f"structures.json  : {sj/1024/1024:.2f} MB -> br {sj_br/1024/1024:.2f} MB")
    print(f"TOTAL Brotli     : {(total_br+sj_br)/1024/1024:.1f} MB  "
          f"(budget §5.4 total < 60 MB: {'OK' if (total_br+sj_br)/1024/1024 < 60 else 'LEWAT'})")
    print(f"\nerror kuantisasi posisi max : {pos_err_max*1000:.4f} mm  "
          f"(§11.1 ambang 0,5 mm: {'OK' if pos_err_max*1000 < 0.5 else 'GAGAL'})")
    print(f"error oct-encode normal max : {nrm_err_max:.3f}°")
    print(f"\nmanifest: {MANIFEST.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
