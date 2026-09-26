#!/usr/bin/env python3
"""Build content/sky/cumulus.bin.gz: the cumulus archetype density volume.

  python3 tools/sky/cumulus.py        # needs numpy only

One procedural cumulus -- stacked spheres, billowed by tiling Worley noise,
with a flat base -- generated at 250x170x307 and box-filtered 2x to
125x85x153 before it is written as R8 density indexed [x, y, z] (x fastest),
the layout src/render/sky/noise.ts's CUMULUS_DIMS describes. Half resolution
is 11.7 m per voxel, still far finer than the cloud march's steps; measured
2026-09-26 on the reference GPU it cut the 4K Medium tier p95 by ~1.5 ms
with no visible change in the capture views. Carried over
unchanged from the cloud VDB spike's `generated()` (2026-09-25), which is
where this volume was first made; that spike was never versioned, so this
file is now the only copy of the generator.

No third-party density data is used. The grid, 250x170x307 voxels at
1800/307 m, was sized to match the eighth-resolution Disney cloud data set
the spike compared against, and nothing else was taken from it.

Numpy's seeded PCG64 is not reproduced by the TypeScript sky build, which is
why this generator stays in Python rather than moving into `npm run sky:build`.
tests/tools/skyNoise.test.ts pins the inflated bytes' SHA-256.
"""
import gzip
import os

import numpy as np

GEN_DIMS = (250, 170, 307)
VOXEL_M = 1800.0 / 307
SEED = 7
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'content', 'sky', 'cumulus.bin.gz')


def worley_tile(n, cells, rng):
    """Tiling inverted-F1 Worley noise, n^3, `cells` feature cells per side."""
    pts = rng.random((cells, cells, cells, 3))
    g = (np.arange(n) + 0.5) / n * cells
    X, Y, Z = np.meshgrid(g, g, g, indexing='ij')
    best = np.full(X.shape, 9.0)
    ci, cj, ck = np.floor(X).astype(int), np.floor(Y).astype(int), np.floor(Z).astype(int)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for dk in (-1, 0, 1):
                a, b, c = ci + di, cj + dj, ck + dk
                p = pts[a % cells, b % cells, c % cells]
                d2 = (X - (a + p[..., 0])) ** 2 + (Y - (b + p[..., 1])) ** 2 + (Z - (c + p[..., 2])) ** 2
                best = np.minimum(best, d2)
    return 1.0 - np.clip(np.sqrt(best), 0, 1)


def sample_wrap(tile, x, y, z):
    """Trilinear sample of a tiling n^3 array at tile-space coords (in texels)."""
    n = tile.shape[0]
    x0, y0, z0 = np.floor(x).astype(int), np.floor(y).astype(int), np.floor(z).astype(int)
    fx, fy, fz = x - x0, y - y0, z - z0
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                out = out + w * tile[(x0 + dx) % n, (y0 + dy) % n, (z0 + dz) % n]
    return out


def generated(shape, voxel_m, rng):
    """A cumulus from stacked spheres, billowed by Worley noise, flat base."""
    nx, ny, nz = shape
    X, Y, Z = np.meshgrid(np.arange(nx) * voxel_m, np.arange(ny) * voxel_m,
                          np.arange(nz) * voxel_m, indexing='ij')
    cx, cz = nx * voxel_m / 2, nz * voxel_m / 2
    base_y = 0.06 * ny * voxel_m
    top_y = 0.95 * ny * voxel_m

    # Stack spheres: a broad skirt of low domes, then towers that sit on the
    # tops of what is below them, shrinking with height (cauliflower).
    hx, hz = cx, cz  # half extents
    spheres = []
    # Main tower: off-center, rising from the base in shrinking steps.
    tx, tz = cx + (rng.random() - 0.5) * hx * 0.5, cz + (rng.random() - 0.5) * hz * 0.5
    y, rad = base_y + 230, 330.0
    while y + rad < top_y:
        spheres.append((tx, y, tz, rad))
        tx += (rng.random() - 0.5) * 120
        tz += (rng.random() - 0.5) * 120
        y += rad * 0.55
        rad *= 0.86
    for _ in range(14):  # skirt: low domes around it, flattened by the base
        rad = 140 + 130 * rng.random()
        a, r = rng.random() * 2 * np.pi, 0.25 + 0.75 * rng.random()
        spheres.append((cx + np.cos(a) * r * (hx - rad - 40), base_y + rad * 0.45,
                        cz + np.sin(a) * r * (hz - rad - 40), rad))
    for _ in range(18):  # cauliflower lobes on whatever is already there
        px, py, pz, pr = spheres[rng.integers(len(spheres))]
        rad = pr * (0.45 + 0.25 * rng.random())
        a, e = rng.random() * 2 * np.pi, rng.random() * 1.2
        spheres.append((px + np.cos(a) * np.cos(e) * pr * 0.8, min(py + np.sin(e) * pr * 0.8, top_y - rad),
                        pz + np.sin(a) * np.cos(e) * pr * 0.8, rad))

    field = np.full(shape, -1.0, np.float32)
    for (sx, sy, sz, r) in spheres:
        f = 1.0 - np.sqrt((X - sx) ** 2 + (Y - sy) ** 2 + (Z - sz) ** 2) / r
        np.maximum(field, f, out=field)

    # Billows: inverted Worley at three scales, stronger with height (bases
    # are smooth and flat, tops are cauliflower).
    tile = worley_tile(48, 6, rng)
    h = np.clip((Y - base_y) / (top_y - base_y), 0, 1)
    billow = 0
    for period_m, amp in ((520.0, 0.55), (230.0, 0.3), (105.0, 0.15)):
        s = tile.shape[0] / period_m
        billow = billow + amp * sample_wrap(tile, X * s, Y * s, Z * s)
    field = field + (billow - 0.55) * (0.25 + 0.55 * h)

    # Flat base, soft over ~25 m; and never touch the grid's walls.
    field = field * np.clip((Y - base_y) / 25.0, 0, 1)
    wall = np.minimum.reduce([X, nx * voxel_m - X, Z, nz * voxel_m - Z, ny * voxel_m - Y])
    field = field * np.clip(wall / 60.0, 0, 1)
    # Edge softness: 0 at the surface to full density ~10% of a radius in.
    density = np.clip(field / 0.12, 0, 1)
    # Denser core: ~0.5 interior with 0.9 hot spots.
    return density * (0.45 + 0.35 * np.clip(field / 0.5, 0, 1))


def main():
    vol = generated(GEN_DIMS, VOXEL_M, np.random.default_rng(SEED))
    # 2x box filter; an odd last voxel is dropped (the walls are empty).
    nx, ny, nz = (d // 2 for d in vol.shape)  # 125, 85, 153: CUMULUS_DIMS in src/render/sky/noise.ts
    vol = vol[: 2 * nx, : 2 * ny, : 2 * nz].reshape(nx, 2, ny, 2, nz, 2).mean(axis=(1, 3, 5))
    u8 = np.clip(vol * 255 + 0.5, 0, 255).astype(np.uint8)
    # x fastest, then y, then z: C-order of [z, y, x].
    raw = u8.transpose(2, 1, 0).tobytes()
    with open(OUT, 'wb') as f:
        f.write(gzip.compress(raw, compresslevel=9, mtime=0))
    print(f'wrote {OUT} ({len(raw)} bytes raw)')


if __name__ == '__main__':
    main()
