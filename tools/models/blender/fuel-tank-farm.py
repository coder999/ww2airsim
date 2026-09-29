"""Fuel tank farm: four vertical steel tanks on ring foundations inside an earth fire bund, piped to a manifold.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  four tanks 12 m in diameter, 8 m shell, 1 m cone roof, 28 m apart   ESTIMATE
  ring foundations 13 m in diameter, 0.3 m deep                        ESTIMATE
  bund 55 m square at its outer toe; 3 m wide at the foot, 1 m at the top, 1.5 m high   ESTIMATE
  pipes 0.4 m across, 0.6 m above the ground                           ESTIMATE
Frame: the manifold runs out to +x, +y up, meters; the ground is y=0.
DP3 detail (read 2026-09-29; no period drawing found, every figure an ESTIMATE):
  shell courses 2.0 m tall, weld bands 0.12 m proud at each joint; wind girder 0.15 m proud, 0.2 m deep, 0.6 m under the roof
  ladder: two 0.05 m rails 0.5 m apart, rungs every 0.5 m, on the side facing the farm's center
  roof: manway 0.5 m radius, 0.3 m high, vent 0.25 m radius, 0.4 m high
  pipe sleepers 0.5 x 0.42 x 0.6 m every 4 m; flanges 0.28 m radius every 7 m; two valve bodies
  soot stain on the lowest 0.8 m of each shell
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: pumps, the tank-truck stand. The bund's four walls overlap at the corners
in one paint (same material, so the overlap cannot be seen).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 55.0
FOOTPRINT_Z_M = 55.0
HEIGHT_M = 9.0
BASE_Y_M = -0.3

TANK_R, SHELL, ROOF, PITCH = 6.0, 8.0, 1.0, 28.0
BUND_FOOT, BUND_TOP, BUND_H = 3.0, 1.0, 1.5
PIPE_Y, PIPE_R = 0.6, 0.2
EMBED_M = 0.02
COURSE_M = 2.0

out, opts = kit.cli_args()
m = kit.Model('fuel-tank-farm', skin=512)
for sx in (-1, 1):
    for sz in (-1, 1):
        cx, cz = sx * PITCH / 2, sz * PITCH / 2
        with m.tagged('shell'):
            m.tank('steel', (cx, 0.0, cz), TANK_R, SHELL, ROOF, 24)
        with m.tagged('foundation'):
            m.tank('concrete', (cx, BASE_Y_M, cz), TANK_R + 0.5, -BASE_Y_M, 0.0, 24)
        with m.tagged('bands'), m.shared_chart():
            for k in range(1, int(SHELL // COURSE_M)):
                m.tank('steel', (cx, k * COURSE_M - 0.06, cz), TANK_R + 0.12, 0.12, 0.0, 24)
            m.tank('steel', (cx, SHELL - 0.8, cz), TANK_R + 0.15, 0.2, 0.0, 24)
        with m.tagged('roof-fittings'), m.shared_chart():
            m.tank('steel', (cx + 4.5, SHELL + 0.25 - 0.1, cz), 0.5, 0.3, 0.0, 8)
            m.tank('steel', (cx - 3.0, SHELL + 0.5 - 0.25 + 0.0, cz + 0.0), 0.25, 0.4, 0.0, 8)
        with m.tagged('ladder'), m.shared_chart():
            nx, nz = -sx, -sz                      # toward the farm's center, along a diagonal
            n = math.hypot(nx, nz)
            nx, nz = nx / n, nz / n
            tx, tz = -nz, nx
            r0 = TANK_R + 0.03
            for side in (-1, 1):
                p = (cx + nx * r0 + tx * side * 0.25, cz + nz * r0 + tz * side * 0.25)
                m.strut('steel', (p[0], 0.0, p[1]), (p[0], SHELL - 0.3, p[1]), 0.05, sides=4)
            for k in range(1, int((SHELL - 0.3) / 0.5)):
                y = k * 0.5
                a = (cx + nx * r0 - tx * 0.25, y, cz + nz * r0 - tz * 0.25)
                b = (cx + nx * r0 + tx * 0.25, y, cz + nz * r0 + tz * 0.25)
                m.strut('steel', a, b, 0.03, sides=4)
side = FOOTPRINT_X_M - BUND_FOOT     # the bund's centerline square
run = BUND_FOOT - BUND_TOP           # both slopes of a wall together, also used at its ends
with m.tagged('bund'):
    for s in (-1, 1):
        m.frustum('earth', (s * side / 2, 0.0, 0.0), (BUND_FOOT, FOOTPRINT_Z_M), (BUND_TOP, FOOTPRINT_Z_M - run), BUND_H)
        m.frustum('earth', (0.0, 0.0, s * side / 2), (FOOTPRINT_X_M, BUND_FOOT), (FOOTPRINT_X_M - run, BUND_TOP), BUND_H)
with m.tagged('pipes'):
    for sx in (-1, 1):
        m.strut('dark', (sx * PITCH / 2, PIPE_Y, -PITCH / 2), (sx * PITCH / 2, PIPE_Y, PITCH / 2), PIPE_R, sides=6)
    inner_toe = FOOTPRINT_X_M / 2 - BUND_FOOT
    m.strut('dark', (-PITCH / 2, PIPE_Y, 0.0), (inner_toe - 0.5, PIPE_Y, 0.0), PIPE_R, sides=6)
with m.tagged('pipe-fittings'), m.shared_chart():
    for sx in (-1, 1):
        x = sx * PITCH / 2
        for z in range(-12, 13, 4):
            m.box('concrete', (x, -EMBED_M, z), (0.5, PIPE_Y - PIPE_R + EMBED_M + 0.02, 0.6))
        for z in (-14, -7, 0, 7, 14):
            m.strut('dark', (x, PIPE_Y, z - 0.05), (x, PIPE_Y, z + 0.05), 0.28, sides=6)
        m.tank('steel', (x, PIPE_Y + PIPE_R - EMBED_M, 8.0), 0.15, 0.5, 0.0, 8)
    for x in range(-14, int(inner_toe - 1), 4):
        m.box('concrete', (x, -EMBED_M, 0.0), (0.6, PIPE_Y - PIPE_R + EMBED_M + 0.02, 0.5))
m.marking('grid', tags=['shell', 'bands'], spacingM=[None, COURSE_M, 2.4], widthM=0.02, depth=0.8)
m.marking('slab', axis='y', fromM=-0.1, toM=0.8, tags=['shell'], color='exhaustSoot', effect='stain', opacity=0.5, featherM=0.3)
assert PITCH / 2 + TANK_R + 0.5 < inner_toe, 'the tanks and their foundations must stand inside the bund'
assert SHELL + ROOF == HEIGHT_M, 'HEIGHT_M is the apex of a tank roof'
m.export(out)
