# tools/models/blender/tower.py
"""Timber airfield control tower. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  footprint 9 x 9 m   content/bases/tacloban.json, tacloban-tower (the sim is authoritative; that
                      file's reference note calls it a round gameplay figure, not a survey)
  pad footprint+1 m square, 0.3 m deep, top at y=0   ESTIMATE: the game's own, src/render/scene/buildings.ts
  legs 0.45 m square at +-3.5 m, 10 m tall             ESTIMATE: buildings.ts
  platform 8.5 m square, 1.1 m deep, at 8 m            ESTIMATE: buildings.ts
  cab 7.5 m square, 2.4 m tall, on the platform        ESTIMATE: buildings.ts
  window posts 0.22 m; roof 10 m square, 0.4 m deep, at 11.7 m; mast 0.12 m x 4 m   ESTIMATE: buildings.ts
  16 treads: 0.5 m rise, 0.55 m going                  ESTIMATE: buildings.ts, moved 0.6 m inboard to stay on the pad
  cross braces 0.16 m across, two per face, 0.5 m to 7.5 m   ESTIMATE: new here
Frame: the stair is on +x, +y up, meters; the pad top is y=0.
Leaves out: railings, glazing bars, ladders, the interior, the wind sock.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 10.0
FOOTPRINT_Z_M = 10.0
HEIGHT_M = 16.1
BASE_Y_M = -0.3

LEG = 3.5

out, opts = kit.cli_args()
m = kit.Model('tower')
m.box('concrete', (0.0, BASE_Y_M, 0.0), (FOOTPRINT_X_M, -BASE_Y_M, FOOTPRINT_Z_M))
for dx in (-LEG, LEG):
    for dz in (-LEG, LEG):
        m.box('timber', (dx, 0.0, dz), (0.45, 10.0, 0.45))
corners = [(-LEG, -LEG), (LEG, -LEG), (LEG, LEG), (-LEG, LEG)]
for k in range(4):
    (ax, az), (bx, bz) = corners[k], corners[(k + 1) % 4]
    m.strut('timber', (ax, 0.5, az), (bx, 7.5, bz), 0.08)
    m.strut('timber', (bx, 0.5, bz), (ax, 7.5, az), 0.08)
m.box('timber', (0.0, 8.0, 0.0), (8.5, 1.1, 8.5))
m.box('dark', (0.0, 9.1, 0.0), (7.5, 2.4, 7.5))
for dx in (-3.8, 0.0, 3.8):
    for dz in (-3.8, 3.8):
        m.box('timber', (dx, 9.1, dz), (0.22, 2.7, 0.22))
m.box('steel', (0.0, 11.7, 0.0), (10.0, 0.4, 10.0))
m.box('steel', (0.0, 12.1, 0.0), (0.12, HEIGHT_M - 12.1, 0.12))
for i in range(16):
    m.box('timber', (4.4, i * 0.5, 4.0 - i * 0.55), (1.2, 0.16, 0.6))
assert 4.4 + 0.6 <= FOOTPRINT_X_M / 2 and 4.0 - 15 * 0.55 - 0.3 >= -FOOTPRINT_Z_M / 2, 'the stair must stay on the pad'
m.export(out)
