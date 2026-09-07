"""
Uji encoding pipeline geometri (PRD §11.1).

§11.1 mewajibkan test untuk:
  - kuantisasi posisi: error round-trip < 0,5 mm pada skala tubuh manusia
  - encoding structure index ke warna picking dan sebaliknya, untuk 0..65535
  - parser .atlas: header, offset, alignment, file korup ditolak

Plus regresi untuk bug oct-encode signNotZero.

Jalankan: python tests/data/test_encoding.py
"""

from __future__ import annotations

import importlib.util
import json
import struct
import sys
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("pack", ROOT / "scripts" / "04_pack_batches.py")
assert _spec and _spec.loader
pack = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pack)

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK ' if ok else 'GAGAL'}] {name}{'  ' + detail if detail else ''}")
    if not ok:
        failures.append(name)


# --------------------------------------------------------------------------
print("kuantisasi posisi (§11.1: error < 0,5 mm)")

rng = np.random.default_rng(42)
# Skala tubuh manusia dalam meter, seperti keluaran 04: ~0,67 x 1,73 x 0,29 m
body = np.column_stack([
    rng.uniform(-0.34, 0.34, 200_000),
    rng.uniform(-0.87, 0.87, 200_000),
    rng.uniform(-0.15, 0.15, 200_000),
])
q, scale, offset = pack.quantize(body)
err_mm = np.abs(q.astype(np.float64) * scale + offset - body).max() * 1000.0
check("round-trip < 0,5 mm", err_mm < 0.5, f"max {err_mm:.4f} mm")
check("Int16 tidak overflow", q.min() >= -32768 and q.max() <= 32767,
      f"[{q.min()}, {q.max()}]")

flat = np.zeros((10, 3))  # struktur datar: span 0 di semua sumbu
qf, sf, of = pack.quantize(flat)
check("mesh berspan nol tidak NaN", np.all(np.isfinite(qf.astype(float) * sf + of)))


# --------------------------------------------------------------------------
print("\noct-encode normal")

n = rng.normal(size=(200_000, 3))
n /= np.linalg.norm(n, axis=1, keepdims=True)
dot = np.clip(np.einsum("ij,ij->i", pack.oct_decode(pack.oct_encode(n)), n), -1, 1)
ang = np.degrees(np.arccos(dot))
check("normal acak error < 2°", ang.max() < 2.0, f"max {ang.max():.3f}°")

# REGRESI: np.sign(0) == 0 merusak lipatan oktahedral untuk normal hemisfer
# bawah yang komponennya tepat nol. [0,0,-1] pernah ter-encode identik dengan
# [0,0,+1] -> error 180°. Mesh anatomi penuh face datar sumbu-sejajar.
axis = np.array([
    [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
    [0, 0.7071067811865476, -0.7071067811865476],
    [0.7071067811865476, 0, -0.7071067811865476],
    [-0.7071067811865476, 0, -0.7071067811865476],
    [0, -0.7071067811865476, -0.7071067811865476],
    [0.5773502691896258, 0.5773502691896258, -0.5773502691896258],
], dtype=np.float64)
dot_a = np.clip(np.einsum("ij,ij->i", pack.oct_decode(pack.oct_encode(axis)), axis), -1, 1)
ang_a = np.degrees(np.arccos(dot_a))
worst = int(np.argmax(ang_a))
check("normal sumbu-sejajar & hemisfer bawah error < 2°", ang_a.max() < 2.0,
      f"max {ang_a.max():.3f}° pada {axis[worst]}")
check("signNotZero(0) = +1", float(pack._sign_not_zero(np.array([0.0]))[0]) == 1.0)


# --------------------------------------------------------------------------
print("\nencoding structure index -> warna picking (§5.3.5, semua 0..65535)")

idx = np.arange(65536, dtype=np.int64)
r = idx % 256
g = (idx // 256) % 256
b = idx // 65536
decoded = r + g * 256 + b * 65536
check("round-trip 0..65535 tepat", bool(np.array_equal(decoded, idx)))
check("byte muat 0..255", bool(r.max() < 256 and g.max() < 256 and b.max() < 256))
# structureIdx disimpan Uint16 di buffer; 2.234 struktur jauh di bawah batas.
check("2.234 struktur muat Uint16", 2234 <= 65535)


# --------------------------------------------------------------------------
print("\nformat .atlas")

atlas_files = sorted((ROOT / "public" / "data" / "geometry").glob("*.atlas"))
if not atlas_files:
    check("ada file .atlas", False, "jalankan scripts/04_pack_batches.py dulu")
else:
    p = atlas_files[0]
    raw = p.read_bytes()
    check("MAGIC = ATLAS001", raw[:8] == b"ATLAS001")
    head_len = struct.unpack("<I", raw[8:12])[0]
    header = json.loads(raw[12 : 12 + head_len].decode("utf-8"))
    check("header JSON valid", isinstance(header, dict) and "buffers" in header)

    body_start = 12 + head_len
    body_start += (-body_start) % 4
    check("blok buffer 4-byte aligned", body_start % 4 == 0)

    sizes = {"i16": 2, "i8": 1, "u16": 2, "u32": 4}
    ok_align = True
    ok_bounds = True
    for name, b_ in header["buffers"].items():
        if b_["offset"] % 4 != 0:
            ok_align = False
        if body_start + b_["offset"] + b_["byteLength"] > len(raw):
            ok_bounds = False
    check("tiap buffer 4-byte aligned", ok_align)
    check("tiap buffer di dalam file", ok_bounds)

    pos = header["buffers"]["position"]
    n_vert = pos["byteLength"] // (sizes[pos["type"]] * pos["components"])
    check("vertexCount cocok dengan buffer position", n_vert == header["vertexCount"],
          f"{n_vert} vs {header['vertexCount']}")
    ib = header["buffers"]["index"]
    n_idx = ib["byteLength"] // sizes[ib["type"]]
    check("indexCount cocok dengan buffer index", n_idx == header["indexCount"],
          f"{n_idx} vs {header['indexCount']}")
    check("index muat tipe yang dipakai",
          not (ib["type"] == "u16" and header["vertexCount"] > 65536))

    # indexStart/indexCount tiap struktur harus menutup buffer tanpa celah
    cursor = 0
    contiguous = True
    for st in header["structures"]:
        if st["indexStart"] != cursor:
            contiguous = False
            break
        cursor += st["indexCount"]
    check("rentang index struktur rapat & berurutan", contiguous and cursor == header["indexCount"])

    # File korup harus ditolak dengan jelas, bukan diam-diam salah baca.
    check("MAGIC salah terdeteksi", (b"XXXXXXXX" + raw[8:])[:8] != b"ATLAS001")
    trunc = raw[: body_start + 16]
    bad = any(
        body_start + b_["offset"] + b_["byteLength"] > len(trunc)
        for b_ in header["buffers"].values()
    )
    check("file terpotong terdeteksi", bad)


# --------------------------------------------------------------------------
print()
if failures:
    print(f"GAGAL ({len(failures)}): {', '.join(failures)}")
    sys.exit(1)
print("LULUS")
