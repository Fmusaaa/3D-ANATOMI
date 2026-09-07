#!/usr/bin/env python3
"""
03_decimate.py — bersihkan + decimate mesh BodyParts3D (PRD §6.2).

Per file OBJ:
  1. muat (parser numpy khusus — format BP3D seragam, lihat scripts/README.md)
  2. perbaiki  : gabung vertex duplikat, buang face degenerate & duplikat,
                 buang komponen terpisah < 0,1% volume
  3. hitung triangle budget per struktur (§6.2)
  4. decimate quadric ke budget
  5. hitung centroid, bbox, volume, skor kualitas mesh (0–1)
  -> data_interim/mesh/<FJ>.npz

Budget (§6.2):

    budget = clamp(base_tri * (bbox_diag / body_diag)**0.5 * importance,
                   min=200, max=40_000)

`base_tri` TIDAK dihardcode — dicari otomatis dengan bisection supaya total
segitiga mendarat di TARGET_TOTAL_TRI. Kalau daftar high-yield berubah, angka
ini menyesuaikan sendiri.

`importance` diambil dari data_curated/high_yield.json kalau ada. Default
(D7 belum diputuskan): 1.0 untuk semua — tanpa pembobotan. Total mentah
6,68 juta segitiga vs target ~3 juta hanya butuh reduksi ~50%, jadi tanpa
pembobotan pun struktur halus tidak hancur.

Pemakaian:
    python scripts/03_decimate.py
    python scripts/03_decimate.py --limit 50        # sampel cepat
    python scripts/03_decimate.py --force           # abaikan cache
    python scripts/03_decimate.py --jobs 8
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
OBJ_DIR = REPO_ROOT / "data_raw" / "extracted" / "isa_BP3D_4.0_obj_99" / "isa_BP3D_4.0_obj_99"
INTERIM = REPO_ROOT / "data_interim"
MESH_OUT = INTERIM / "mesh"
STRUCTURES = INTERIM / "structures_raw.json"
HIGH_YIELD = REPO_ROOT / "data_curated" / "high_yield.json"
REPORT = INTERIM / "decimate_report.json"

# PRD §6.2: target total 2,5–3,5 juta segitiga untuk seluruh tubuh.
TARGET_TOTAL_TRI = 3_000_000
MIN_TRI = 200
MAX_TRI = 40_000

# Vertex dianggap sama kalau berimpit dalam toleransi ini (mm).
# BP3D menyimpan 6 desimal; 1e-3 mm jauh di bawah presisi mesh apa pun.
WELD_TOL_MM = 1e-3

# Komponen terpisah dengan volume < ambang ini (fraksi volume total) dibuang.
SMALL_COMPONENT_FRAC = 0.001

# Agresivitas quadric. 7.0 default library; 5.0 sedikit lebih menjaga bentuk
# dengan biaya waktu yang masih wajar untuk 2.234 mesh.
DECIMATE_AGG = 5.0


# --------------------------------------------------------------------------
# Loader OBJ
# --------------------------------------------------------------------------


def load_obj(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """
    Parser khusus untuk BP3D. Terverifikasi di F0: setiap file hanya berisi
    `v`, `vn`, `g`, `usemtl`, `f`; semua face segitiga dengan pola `a//a`
    (index normal selalu sama dengan index vertex).

    Mengembalikan (vertices float32 [N,3], faces int64 [M,3]) berbasis 0.
    """
    vs: list[bytes] = []
    fs: list[bytes] = []
    for ln in path.read_bytes().split(b"\n"):
        if not ln:
            continue
        if ln[0] == 0x76:  # 'v'
            if ln[1] == 0x20:  # "v "
                vs.append(ln)
            # "vn " diabaikan: normal dihitung ulang setelah decimation
        elif ln[0] == 0x66 and ln[1] == 0x20:  # "f "
            fs.append(ln)

    if not vs or not fs:
        return np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int64)

    verts = np.array([ln.split()[1:4] for ln in vs], dtype=np.float32)

    faces = np.empty((len(fs), 3), dtype=np.int64)
    for i, ln in enumerate(fs):
        a, b, c = ln.split()[1:4]
        faces[i, 0] = int(a[: a.index(b"/")])
        faces[i, 1] = int(b[: b.index(b"/")])
        faces[i, 2] = int(c[: c.index(b"/")])
    faces -= 1  # OBJ berbasis 1

    return verts, faces


def read_header_volume(path: Path) -> float | None:
    head = path.read_bytes()[:2048].decode("utf-8", "replace")
    for ln in head.splitlines():
        if ln.startswith("# Volume(cm3):"):
            try:
                return float(ln.split(":", 1)[1])
            except ValueError:
                return None
    return None


# --------------------------------------------------------------------------
# Pembersihan geometri
# --------------------------------------------------------------------------


def weld_vertices(v: np.ndarray, f: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Gabungkan vertex yang berimpit dalam WELD_TOL_MM."""
    key = np.round(v / WELD_TOL_MM).astype(np.int64)
    _, uniq_idx, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return v[uniq_idx], inverse[f]


def drop_bad_faces(f: np.ndarray) -> tuple[np.ndarray, int]:
    """Buang face degenerate (index kembar) dan face duplikat."""
    n0 = len(f)
    ok = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    f = f[ok]
    if len(f):
        _, keep = np.unique(np.sort(f, axis=1), axis=0, return_index=True)
        f = f[np.sort(keep)]
    return f, n0 - len(f)


def face_areas(v: np.ndarray, f: np.ndarray) -> np.ndarray:
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)


def signed_volume(v: np.ndarray, f: np.ndarray) -> float:
    """Volume via teorema divergensi. Butuh mesh tertutup untuk jadi bermakna."""
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return float(np.abs(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) / 6.0)


def connected_components(n_verts: int, f: np.ndarray) -> np.ndarray:
    """Union-find atas vertex lewat sisi segitiga. Mengembalikan label per face."""
    parent = np.arange(n_verts, dtype=np.int64)

    def find(x: int) -> int:
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:  # kompresi jalur
            parent[x], x = root, parent[x]
        return root

    for tri in f:
        r0 = find(int(tri[0]))
        for k in (1, 2):
            r = find(int(tri[k]))
            if r != r0:
                parent[r] = r0

    roots = np.array([find(int(x)) for x in f[:, 0]], dtype=np.int64)
    _, labels = np.unique(roots, return_inverse=True)
    return labels


def strip_small_components(v: np.ndarray, f: np.ndarray) -> tuple[np.ndarray, np.ndarray, int, float]:
    """
    Buang komponen terpisah dengan volume < SMALL_COMPONENT_FRAC dari total.
    Mengembalikan (v, f, jumlah_komponen_awal, rasio_area_komponen_terbesar).
    """
    labels = connected_components(len(v), f)
    n_comp = int(labels.max()) + 1 if len(labels) else 0

    areas = face_areas(v, f)
    comp_area = np.bincount(labels, weights=areas, minlength=max(n_comp, 1))
    largest_area_ratio = float(comp_area.max() / comp_area.sum()) if comp_area.sum() > 0 else 0.0

    if n_comp <= 1:
        return v, f, n_comp, largest_area_ratio

    vols = np.array([signed_volume(v, f[labels == i]) for i in range(n_comp)])
    total = vols.sum()
    if total <= 0:
        keep_comp = np.array([int(np.argmax(comp_area))])
    else:
        keep_comp = np.where(vols / total >= SMALL_COMPONENT_FRAC)[0]
        if len(keep_comp) == 0:
            keep_comp = np.array([int(np.argmax(vols))])

    f = f[np.isin(labels, keep_comp)]
    used = np.unique(f)
    remap = np.full(len(v), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return v[used], remap[f], n_comp, largest_area_ratio


def manifold_ratio(f: np.ndarray) -> float:
    """Fraksi sisi yang dipakai tepat 2 face. 1,0 = manifold tertutup rapi."""
    if not len(f):
        return 0.0
    e = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    e = np.sort(e, axis=1)
    _, counts = np.unique(e, axis=0, return_counts=True)
    return float((counts == 2).sum() / len(counts))


def vertex_normals(v: np.ndarray, f: np.ndarray) -> np.ndarray:
    """
    Normal per vertex, berbobot luas face.

    Vertex yang normal face-nya saling meniadakan (geometri terlipat) menghasilkan
    vektor nol — kalau dibiarkan, oct-encode memetakannya ke (0,0,1) dan vertex itu
    ter-shading dengan normal sampah. Jarang (2 dari 1,5 juta vertex di BP3D),
    tapi murah untuk ditangani: pakai arah dari centroid mesh ke vertex tersebut,
    tebakan yang wajar untuk permukaan tertutup.
    """
    n = np.zeros_like(v, dtype=np.float64)
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    fn = np.cross(b - a, c - a)  # panjangnya = 2x luas -> bobot otomatis
    for k in range(3):
        np.add.at(n, f[:, k], fn)

    ln = np.linalg.norm(n, axis=1)
    degenerate = ln < 1e-12
    if np.any(degenerate):
        outward = v[degenerate] - v.mean(axis=0)
        olen = np.linalg.norm(outward, axis=1, keepdims=True)
        outward = np.where(olen > 1e-12, outward / np.maximum(olen, 1e-12),
                           np.array([0.0, 0.0, 1.0]))
        n[degenerate] = outward
        ln = np.linalg.norm(n, axis=1)

    return (n / np.maximum(ln, 1e-12)[:, None]).astype(np.float32)


# --------------------------------------------------------------------------
# Skor kualitas
# --------------------------------------------------------------------------


def quality_score(
    *,
    largest_area_ratio: float,
    n_components: int,
    manifold: float,
    bad_face_frac: float,
    resolution: float,
) -> float:
    """
    Heuristik 0–1 untuk mutu mesh SUMBER (PRD §6.2 minta skor, tidak menentukan
    rumusnya).

    ⚠️ Dihitung pada mesh sumber yang sudah dibersihkan, SEBELUM decimation.
    Kalau dihitung sesudahnya, skornya mengukur pilihan budget kita sendiri,
    bukan mutu dataset — dan itu bukan yang ingin diketahui user.

    Dipakai UI untuk jujur soal batas dataset: < 0,5 tampilkan peringatan,
    < 0,4 dikecualikan dari soal `name-to-structure` (§E10 AC13) karena tidak
    adil menyuruh mengklik mesh yang bentuknya rusak.

    Komponen:
      fragmentasi 0,40 — sinyal TERKUAT untuk segmentasi BP3D yang berantakan.
                         Gabungan rasio luas komponen terbesar dan JUMLAH
                         komponen: satu blob besar + 562 serpihan tetap mesh
                         rusak, walau 99% luasnya ada di blob itu.
      manifold    0,20 — fraksi sisi yang dipakai tepat 2 face (lubang/non-manifold)
      face rusak  0,15 — proporsi face degenerate/duplikat di sumber
      resolusi    0,25 — panjang sisi rata-rata relatif diagonal bbox. BP3D
                         sudah menerapkan reduksi poligon 99%, jadi banyak
                         struktur halus tinggal bentuk kasar.
    """
    # 1 komponen -> 1,0; 2 -> 0,50; 4 -> 0,33; 16 -> 0,20; 563 -> 0,10
    count_score = 1.0 / (1.0 + np.log2(max(n_components, 1)))
    frag = 0.5 * largest_area_ratio + 0.5 * count_score

    # resolution = mean_edge / bbox_diag. Ambang dikalibrasi dari sebaran
    # terukur seluruh dataset (lihat scripts/README.md).
    res_score = float(np.clip(1.0 - (resolution - 0.010) / (0.060 - 0.010), 0.0, 1.0))

    score = (
        0.40 * frag
        + 0.20 * manifold
        + 0.15 * (1.0 - min(1.0, bad_face_frac * 10.0))
        + 0.25 * res_score
    )
    return round(float(np.clip(score, 0.0, 1.0)), 4)


def mean_edge_ratio(v: np.ndarray, f: np.ndarray) -> float:
    """Panjang sisi rata-rata dibagi diagonal bbox. Kecil = mesh halus."""
    if not len(f):
        return 1.0
    e = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    lens = np.linalg.norm(v[e[:, 0]] - v[e[:, 1]], axis=1)
    diag = float(np.linalg.norm(v.max(axis=0) - v.min(axis=0)))
    return float(lens.mean() / diag) if diag > 0 else 1.0


# --------------------------------------------------------------------------
# Budget
# --------------------------------------------------------------------------


def bbox_diag(bbox: list[list[float]]) -> float:
    lo, hi = np.array(bbox[0]), np.array(bbox[1])
    return float(np.linalg.norm(hi - lo))


def budget_for(diag: float, body_diag: float, importance: float, base_tri: float) -> int:
    raw = base_tri * (diag / body_diag) ** 0.5 * importance
    return int(np.clip(raw, MIN_TRI, MAX_TRI))


def solve_base_tri(diags: list[float], imps: list[float], caps: list[int], body_diag: float) -> float:
    """Cari base_tri lewat bisection supaya total budget ~= TARGET_TOTAL_TRI."""

    def total(base: float) -> int:
        return sum(
            min(cap, budget_for(d, body_diag, im, base))
            for d, im, cap in zip(diags, imps, caps)
        )

    lo, hi = 1.0, 1_000_000.0
    if total(hi) < TARGET_TOTAL_TRI:
        return hi  # tak mungkin capai target: semua sudah mentok cap asli
    for _ in range(60):
        mid = (lo + hi) / 2
        if total(mid) < TARGET_TOTAL_TRI:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# --------------------------------------------------------------------------
# Worker
# --------------------------------------------------------------------------


@dataclass
class Job:
    file_id: str
    budget: int
    force: bool


def process(job: Job) -> dict:
    import fast_simplification as fsimp

    src = OBJ_DIR / f"{job.file_id}.obj"
    dst = MESH_OUT / f"{job.file_id}.npz"

    if dst.exists() and not job.force and dst.stat().st_mtime >= src.stat().st_mtime:
        with np.load(dst) as z:
            return {
                "fileId": job.file_id,
                "cached": True,
                "triIn": int(z["tri_in"]),
                "triOut": int(z["f"].shape[0]),
                "meshQuality": float(z["quality"]),
            }

    v, f = load_obj(src)
    tri_in = len(f)
    if tri_in == 0:
        return {"fileId": job.file_id, "error": "0 segitiga di sumber"}

    v, f = weld_vertices(v, f)
    f, n_bad = drop_bad_faces(f)
    if len(f) == 0:
        return {"fileId": job.file_id, "error": "semua face degenerate"}
    bad_frac = n_bad / tri_in

    v, f, n_comp, largest_ratio = strip_small_components(v, f)
    if len(f) == 0:
        return {"fileId": job.file_id, "error": "kosong setelah buang komponen kecil"}

    tri_clean = len(f)

    # Skor mutu diukur DI SINI — pada sumber bersih, sebelum decimation.
    src_manifold = manifold_ratio(f)
    src_resolution = mean_edge_ratio(v, f)
    quality = quality_score(
        largest_area_ratio=largest_ratio,
        n_components=n_comp,
        manifold=src_manifold,
        bad_face_frac=bad_frac,
        resolution=src_resolution,
    )

    target = min(job.budget, tri_clean)
    if target < tri_clean:
        pts, faces = fsimp.simplify(
            v.astype(np.float32), f.astype(np.int32), target_count=target, agg=DECIMATE_AGG
        )
        v, f = np.asarray(pts, np.float32), np.asarray(faces, np.int64)
        f, _ = drop_bad_faces(f)
        if len(f) == 0:
            return {"fileId": job.file_id, "error": "kosong setelah decimation"}
        used = np.unique(f)
        remap = np.full(len(v), -1, np.int64)
        remap[used] = np.arange(len(used))
        v, f = v[used], remap[f]

    n = vertex_normals(v, f)
    lo, hi = v.min(axis=0), v.max(axis=0)

    MESH_OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        dst,
        v=v.astype(np.float32),
        f=f.astype(np.uint32),
        n=n,
        bbox=np.stack([lo, hi]).astype(np.float32),
        centroid=((lo + hi) / 2).astype(np.float32),
        volume=np.float32(signed_volume(v, f)),
        quality=np.float32(quality),
        tri_in=np.int64(tri_in),
        components=np.int64(n_comp),
        manifold=np.float32(src_manifold),
        resolution=np.float32(src_resolution),
        largest_area_ratio=np.float32(largest_ratio),
        bad_face_frac=np.float32(bad_frac),
    )

    return {
        "fileId": job.file_id,
        "cached": False,
        "triIn": tri_in,
        "triClean": tri_clean,
        "triOut": int(len(f)),
        "budget": job.budget,
        "components": n_comp,
        "manifold": round(src_manifold, 4),
        "resolution": round(src_resolution, 5),
        "largestAreaRatio": round(largest_ratio, 4),
        "meshQuality": quality,
    }


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--jobs", type=int, default=max(1, (mp.cpu_count() or 4) - 1))
    args = ap.parse_args()

    if not STRUCTURES.exists():
        raise SystemExit(f"Tidak ada {STRUCTURES}. Jalankan 02_parse_ontology.py dulu.")

    doc = json.loads(STRUCTURES.read_text(encoding="utf-8"))
    structures = doc["structures"]
    if args.limit:
        structures = structures[: args.limit]

    importance: dict[str, float] = {}
    if HIGH_YIELD.exists():
        hy = json.loads(HIGH_YIELD.read_text(encoding="utf-8"))
        importance = {k: float(v) for k, v in hy.get("importance", {}).items()}
        print(f"high_yield.json: {len(importance)} struktur berbobot khusus")
    else:
        print("high_yield.json belum ada -> importance = 1,0 untuk semua (D7 default)")

    bb = doc["body_bbox_mm"]
    body_diag = float(
        np.linalg.norm(
            np.array([bb["x_half"] * 2, bb["x_half"] * 2, bb["z_max"] - bb["z_min"]])
        )
    )

    diags = [bbox_diag(s["bbox"]) for s in structures]
    imps = [importance.get(s["fma"], importance.get(s["fileId"], 1.0)) for s in structures]
    caps = [s["triangles"] for s in structures]

    base = solve_base_tri(diags, imps, caps, body_diag)
    jobs = [
        Job(s["fileId"], min(c, budget_for(d, body_diag, im, base)), args.force)
        for s, d, im, c in zip(structures, diags, imps, caps)
    ]
    planned = sum(j.budget for j in jobs)
    print(f"base_tri terpecahkan  : {base:,.0f}")
    print(f"total budget rencana  : {planned:,} segitiga (target {TARGET_TOTAL_TRI:,})")
    print(f"memproses {len(jobs)} mesh dengan {args.jobs} proses...\n")

    MESH_OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.monotonic()
    results: list[dict] = []
    if args.jobs > 1:
        with mp.Pool(args.jobs) as pool:
            for i, r in enumerate(pool.imap_unordered(process, jobs, chunksize=16), 1):
                results.append(r)
                if i % 250 == 0:
                    print(f"  {i}/{len(jobs)}  ({time.monotonic() - t0:.0f}s)")
    else:
        for i, j in enumerate(jobs, 1):
            results.append(process(j))
            if i % 250 == 0:
                print(f"  {i}/{len(jobs)}  ({time.monotonic() - t0:.0f}s)")

    elapsed = time.monotonic() - t0
    errors = [r for r in results if r.get("error")]
    ok = [r for r in results if not r.get("error")]
    tri_in = sum(r.get("triIn", 0) for r in ok)
    tri_out = sum(r.get("triOut", 0) for r in ok)
    q = np.array([r["meshQuality"] for r in ok]) if ok else np.zeros(1)

    print("\n" + "=" * 66)
    print(f"selesai {len(ok)}/{len(jobs)} dalam {elapsed:.0f}s")
    print(f"  segitiga masuk : {tri_in:,}")
    print(f"  segitiga keluar: {tri_out:,}  ({100 * tri_out / max(tri_in, 1):.1f}%)")
    print(f"  target PRD     : 2.500.000 – 3.500.000  -> "
          f"{'DALAM RENTANG' if 2_500_000 <= tri_out <= 3_500_000 else 'DI LUAR RENTANG'}")
    print(f"\nkualitas mesh: min={q.min():.2f} median={np.median(q):.2f} max={q.max():.2f}")
    for lo_, hi_ in [(0.0, 0.4), (0.4, 0.5), (0.5, 0.7), (0.7, 1.01)]:
        n = int(((q >= lo_) & (q < hi_)).sum())
        label = "  <0,4 (dikecualikan dari quiz klik)" if hi_ == 0.4 else f"  {lo_:.1f}–{hi_ if hi_ <= 1 else 1.0:.1f}"
        print(f"{label:38s} {n:5d}")
    if errors:
        print(f"\nGAGAL {len(errors)}:")
        for e in errors[:15]:
            print(f"  {e['fileId']}: {e['error']}")

    REPORT.write_text(
        json.dumps(
            {
                "baseTri": base,
                "targetTotal": TARGET_TOTAL_TRI,
                "triIn": tri_in,
                "triOut": tri_out,
                "elapsedSec": round(elapsed, 1),
                "results": sorted(results, key=lambda r: r["fileId"]),
            },
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"\nlaporan: {REPORT.relative_to(REPO_ROOT)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
