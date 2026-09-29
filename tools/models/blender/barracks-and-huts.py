"""Barracks and huts: one raised timber barracks and two small huts. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  barracks 12 x 28 m   the game's own decorative hut, src/render/scene/airfield.ts AIRFIELD_HUTS
                       (its comment: a period-inspired scene, not a survey; the game draws three at Tacloban)
  barracks: floor 0.8 m up on 0.25 m posts, walls 2.8 m, roof rise 2.4 m, 0.6 m eaves   ESTIMATE
  huts 6 x 8 m: floor 0.5 m up, walls 2.4 m, roof rise 1.6 m, 0.4 m eaves              ESTIMATE
  windows 1.2 x 0.9 m, doors 1.0 x 2.0 m, both 0.05 m proud of the wall                ESTIMATE
Frame: ridges run along z, the huts stand to +x of the barracks, +y up, meters; the ground is y=0.
DP3 detail (read 2026-09-29; every figure an ESTIMATE, no drawing consulted):
  corner boards 0.15 m square, sill and window frames 0.06 m, shutters 0.6 m wide standing 0.08 m proud, door frame 0.1 m
  door steps two treads 0.9 m wide x 0.3 m deep, 0.25 m rise; footing blocks 0.35 m square, 0.15 m high under each post
  hut stove pipe 0.12 m across, 1.0 m above the roof; horizontal siding seams every 0.2 m; roof seams every 0.8 m
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: verandas, the roofs' corrugation profile or thatch.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 24.0
FOOTPRINT_Z_M = 29.2
HEIGHT_M = 6.0
BASE_Y_M = 0.0

BARRACKS_WIDTH_M = 12.0
BARRACKS_LENGTH_M = 28.0
EMBED_M = 0.02

out, opts = kit.cli_args()
m = kit.Model('barracks-and-huts', skin=512)


def building(cx, cz, width, length, floor, wall, rise, eave, posts, windows, hut):
    px, pz = posts
    with m.tagged('posts'):
        for i in range(px):
            for k in range(pz):
                x = cx - width / 2 + 0.3 + (width - 0.6) * i / (px - 1)
                z = cz - length / 2 + 0.3 + (length - 0.6) * k / (pz - 1)
                m.box('concrete', (x, 0.0, z), (0.35, 0.15, 0.35))
                m.box('timber', (x, 0.15 - EMBED_M, z), (0.25, floor - 0.15 + EMBED_M, 0.25))
    with m.tagged('walls'):
        m.box('timber', (cx, floor, cz), (width, wall, length))
    with m.tagged('roof'):
        m.gable_roof('steel', (cx, floor + wall, cz), width, length, rise, eave)
    with m.tagged('trim'), m.shared_chart():
        for sx in (-1, 1):
            for sz in (-1, 1):
                m.box('timber', (cx + sx * (width / 2 - 0.075 + 0.02), floor, cz + sz * (length / 2 - 0.075 + 0.02)),
                      (0.15, wall, 0.15))
        m.box('timber', (cx, floor - 0.06, cz), (width + 0.1, 0.12, length + 0.1))
    with m.tagged('windows'), m.shared_chart():
        for k in range(windows):
            wz = cz - length / 2 + length * (k + 0.5) / windows
            for s in (-1, 1):
                fx = cx + s * (width / 2 + 0.02)
                m.box('dark', (cx + s * (width / 2 + 0.025), floor + 0.9, wz), (0.05, 0.9, 1.2))
                m.box('timber', (fx, floor + 0.84, wz), (0.08, 0.06, 1.32))
                m.box('timber', (fx, floor + 1.8, wz), (0.08, 0.06, 1.32))
                for dz in (-0.66, 0.66):
                    m.box('timber', (fx, floor + 0.84, wz + dz), (0.08, 1.02, 0.06))
                if not hut:
                    m.box('timber', (fx, floor + 0.9, wz + 1.0), (0.08, 0.9, 0.6))
    with m.tagged('door'), m.shared_chart():
        dz = cz + length / 2
        m.box('dark', (cx, floor, dz + 0.025), (1.0, 2.0, 0.05))
        for sx in (-1, 1):
            m.box('timber', (cx + sx * 0.55, floor, dz + 0.02), (0.1, 2.1, 0.08))
        m.box('timber', (cx, floor + 2.0, dz + 0.02), (1.2, 0.1, 0.08))
        m.box('timber', (cx, 0.0, dz + 0.155), (0.9, floor * 0.5, 0.35))
        m.box('timber', (cx, 0.0, dz + 0.08), (0.9, floor - 0.05, 0.2))
    if hut:
        with m.tagged('stove'), m.shared_chart():
            m.strut('steel', (cx + 1.0, floor + wall + 0.8, cz - 1.5), (cx + 1.0, floor + wall + 2.1, cz - 1.5), 0.06, sides=6)


building(-6.0, 0.0, BARRACKS_WIDTH_M, BARRACKS_LENGTH_M, 0.8, 2.8, 2.4, 0.6, (3, 8), 7, False)
for cz in (-7.0, 7.0):
    building(8.0, cz, 6.0, 8.0, 0.5, 2.4, 1.6, 0.4, (2, 3), 2, True)
assert 0.8 + 2.8 + 2.4 == HEIGHT_M, 'HEIGHT_M is the barracks ridge'
assert BARRACKS_LENGTH_M + 2 * 0.6 == FOOTPRINT_Z_M, 'FOOTPRINT_Z_M is the barracks roof with its eaves'
m.marking('grid', tags=['walls'], spacingM=[None, 0.2, None], widthM=0.015, depth=0.8)
m.marking('grid', tags=['roof'], spacingM=[0.8, None, None], widthM=0.03, depth=0.8)
m.export(out)
