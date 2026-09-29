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
DP3 detail (read 2026-09-29; no period drawing found, every figure an ESTIMATE):
  leg plinths 0.75 m square, 0.3 m high; girts 0.2 m square at 4 m, all four sides
  deck rail posts 0.08 m at 4.15 m, rails 0.06 m at 0.5 m and 1.0 m above the deck; stair handrail 0.08 m across
  cab windows 3.2 x 1.2 m, sill 0.9 m above the cab floor, glass 0.07 m thick, timber muntin 0.06 m at center
  cab door 1.0 x 2.0 m on the -z face; roof rim 0.15 m x 0.15 m; mast cross-arm 1.2 m
  plank seams every 0.15 m on the timber; pad joints every 2.5 m
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: ladders, the interior, the wind sock.
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
EMBED_M = 0.02

out, opts = kit.cli_args()
m = kit.Model('tower', skin=512)
with m.tagged('pad'):
    m.box('concrete', (0.0, BASE_Y_M, 0.0), (FOOTPRINT_X_M, -BASE_Y_M, FOOTPRINT_Z_M))
with m.tagged('plinths'), m.shared_chart():
    for dx in (-LEG, LEG):
        for dz in (-LEG, LEG):
            m.box('concrete', (dx, -EMBED_M, dz), (0.75, 0.3 + EMBED_M, 0.75))
with m.tagged('frame'):
    for dx in (-LEG, LEG):
        for dz in (-LEG, LEG):
            m.box('timber', (dx, 0.0, dz), (0.45, 10.0, 0.45))
    corners = [(-LEG, -LEG), (LEG, -LEG), (LEG, LEG), (-LEG, LEG)]
    for k in range(4):
        (ax, az), (bx, bz) = corners[k], corners[(k + 1) % 4]
        m.strut('timber', (ax, 0.5, az), (bx, 7.5, bz), 0.08)
        m.strut('timber', (bx, 0.5, bz), (ax, 7.5, az), 0.08)
    for s in (-1, 1):
        m.box('timber', (0.0, 4.0, s * LEG), (2 * LEG, 0.2, 0.2))
        m.box('timber', (s * LEG, 4.0, 0.0), (0.2, 0.2, 2 * LEG))
with m.tagged('deck'):
    m.box('timber', (0.0, 8.0, 0.0), (8.5, 1.1, 8.5))
with m.tagged('cab'):
    m.box('dark', (0.0, 9.1, 0.0), (7.5, 2.4, 7.5))
with m.tagged('posts'):
    for dx in (-3.8, 0.0, 3.8):
        for dz in (-3.8, 3.8):
            m.box('timber', (dx, 9.1, dz), (0.22, 2.7, 0.22))
with m.tagged('windows'), m.shared_chart():
    for s in (-1, 1):
        for c in (-1.9, 1.9):
            # +-z faces, between the corner and center posts
            m.box('glazing', (c, 10.0, s * (3.75 - 0.03) + s * 0.0), (3.0, 1.2, 0.07))
            m.box('timber', (c, 10.0, s * 3.78), (0.06, 1.2 + EMBED_M, 0.05))
    for s in (-1, 1):
        for c in (-1.9, 1.9):
            m.box('glazing', (s * (3.75 - 0.03), 10.0, c), (0.07, 1.2, 3.0))
            m.box('timber', (s * 3.78, 10.0, c), (0.05, 1.2 + EMBED_M, 0.06))
with m.tagged('door'):
    m.box('timber', (2.6, 9.1, -3.75 - 0.03 + EMBED_M / 2), (1.0, 2.0, 0.06 + EMBED_M))
with m.tagged('roof'):
    m.box('steel', (0.0, 11.7, 0.0), (10.0, 0.4, 10.0))
with m.tagged('rim'), m.shared_chart():
    for s in (-1, 1):
        m.box('steel', (0.0, 12.1 - EMBED_M, s * 4.9), (9.8, 0.15 + EMBED_M, 0.15))
        m.box('steel', (s * 4.9, 12.1 - EMBED_M, 0.0), (0.15, 0.15 + EMBED_M, 9.6))
    m.box('steel', (0.0, 12.1, 0.0), (0.12, HEIGHT_M - 12.1, 0.12))
    m.box('steel', (0.0, 15.0, 0.0), (1.2, 0.06, 0.06))
with m.tagged('rails'), m.shared_chart():
    for x in (-4.15, 4.15):
        for z in (-4.15, -2.0, 0.0, 2.0, 4.15):
            m.box('timber', (x, 9.1 - EMBED_M, z), (0.08, 1.0 + EMBED_M, 0.08))
    for z in (-4.15, 4.15):
        for x in (-2.0, 0.0, 2.0):
            m.box('timber', (x, 9.1 - EMBED_M, z), (0.08, 1.0 + EMBED_M, 0.08))
    for y in (9.6, 10.1):
        for s in (-1, 1):
            m.box('timber', (0.0, y, s * 4.15), (8.3, 0.06, 0.06))
            m.box('timber', (s * 4.15, y, 0.0), (0.06, 0.06, 8.3))
with m.tagged('stair'):
    for i in range(16):
        m.box('timber', (4.4, i * 0.5, 4.0 - i * 0.55), (1.2, 0.16, 0.6))
with m.tagged('handrail'), m.shared_chart():
    m.strut('timber', (3.85, 1.0, 4.0), (3.85, 8.9, 4.0 - 15 * 0.55), 0.04, sides=4)
    for i in (0, 4, 8, 12, 15):
        m.box('timber', (3.85, i * 0.5 - 0.02, 4.0 - i * 0.55), (0.06, 1.0 + 0.02, 0.06))
assert 4.4 + 0.6 <= FOOTPRINT_X_M / 2 and 4.0 - 15 * 0.55 - 0.3 >= -FOOTPRINT_Z_M / 2, 'the stair must stay on the pad'
m.marking('grid', tags=['pad'], spacingM=[2.5, None, 2.5], widthM=0.04, depth=0.8)
m.marking('grid', tags=['cab'], spacingM=[0.3, 0.3, 0.3], widthM=0.02, depth=0.8)
m.marking('grid', tags=['roof'], spacingM=[1.0, None, 1.0], widthM=0.03, depth=0.8)
m.export(out)
