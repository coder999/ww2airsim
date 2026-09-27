"""Barracks and huts: one raised timber barracks and two small huts. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  barracks 12 x 28 m   the game's own decorative hut, src/render/scene/airfield.ts AIRFIELD_HUTS
                       (its comment: a period-inspired scene, not a survey; the game draws three at Tacloban)
  barracks: floor 0.8 m up on 0.25 m posts, walls 2.8 m, roof rise 2.4 m, 0.6 m eaves   ESTIMATE
  huts 6 x 8 m: floor 0.5 m up, walls 2.4 m, roof rise 1.6 m, 0.4 m eaves              ESTIMATE
  windows 1.2 x 0.9 m, doors 1.0 x 2.0 m, both 0.05 m proud of the wall                ESTIMATE
Frame: ridges run along z, the huts stand to +x of the barracks, +y up, meters; the ground is y=0.
Leaves out: steps, verandas, shutters, the roofs' corrugation or thatch.
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

out, opts = kit.cli_args()
m = kit.Model('barracks-and-huts')


def building(cx, cz, width, length, floor, wall, rise, eave, posts, windows):
    px, pz = posts
    for i in range(px):
        for k in range(pz):
            x = cx - width / 2 + 0.3 + (width - 0.6) * i / (px - 1)
            z = cz - length / 2 + 0.3 + (length - 0.6) * k / (pz - 1)
            m.box('timber', (x, 0.0, z), (0.25, floor, 0.25))
    m.box('timber', (cx, floor, cz), (width, wall, length))
    m.gable_roof('steel', (cx, floor + wall, cz), width, length, rise, eave)
    for k in range(windows):
        wz = cz - length / 2 + length * (k + 0.5) / windows
        for s in (-1, 1):
            m.box('dark', (cx + s * (width / 2 + 0.025), floor + 0.9, wz), (0.05, 0.9, 1.2))
    m.box('dark', (cx, floor, cz + length / 2 + 0.025), (1.0, 2.0, 0.05))


building(-6.0, 0.0, BARRACKS_WIDTH_M, BARRACKS_LENGTH_M, 0.8, 2.8, 2.4, 0.6, (3, 8), 7)
for cz in (-7.0, 7.0):
    building(8.0, cz, 6.0, 8.0, 0.5, 2.4, 1.6, 0.4, (2, 3), 2)
assert 0.8 + 2.8 + 2.4 == HEIGHT_M, 'HEIGHT_M is the barracks ridge'
assert BARRACKS_LENGTH_M + 2 * 0.6 == FOOTPRINT_Z_M, 'FOOTPRINT_Z_M is the barracks roof with its eaves'
m.export(out)
