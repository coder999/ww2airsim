"""Fuel tank farm: four vertical steel tanks on ring foundations inside an earth fire bund, piped to a manifold.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  four tanks 12 m in diameter, 8 m shell, 1 m cone roof, 28 m apart   ESTIMATE
  ring foundations 13 m in diameter, 0.3 m deep                        ESTIMATE
  bund 55 m square at its outer toe; 3 m wide at the foot, 1 m at the top, 1.5 m high   ESTIMATE
  pipes 0.4 m across, 0.6 m above the ground                           ESTIMATE
Frame: the manifold runs out to +x, +y up, meters; the ground is y=0.
Leaves out: ladders, vents, pumps, the tank-truck stand. The bund's four walls overlap at the corners
in one paint (same material, so the overlap cannot be seen).
"""
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

out, opts = kit.cli_args()
m = kit.Model('fuel-tank-farm')
for sx in (-1, 1):
    for sz in (-1, 1):
        cx, cz = sx * PITCH / 2, sz * PITCH / 2
        m.tank('steel', (cx, 0.0, cz), TANK_R, SHELL, ROOF, 24)
        m.tank('concrete', (cx, BASE_Y_M, cz), TANK_R + 0.5, -BASE_Y_M, 0.0, 24)
side = FOOTPRINT_X_M - BUND_FOOT     # the bund's centerline square
run = BUND_FOOT - BUND_TOP           # both slopes of a wall together, also used at its ends
for s in (-1, 1):
    m.frustum('earth', (s * side / 2, 0.0, 0.0), (BUND_FOOT, FOOTPRINT_Z_M), (BUND_TOP, FOOTPRINT_Z_M - run), BUND_H)
    m.frustum('earth', (0.0, 0.0, s * side / 2), (FOOTPRINT_X_M, BUND_FOOT), (FOOTPRINT_X_M - run, BUND_TOP), BUND_H)
for sx in (-1, 1):
    m.strut('dark', (sx * PITCH / 2, PIPE_Y, -PITCH / 2), (sx * PITCH / 2, PIPE_Y, PITCH / 2), PIPE_R, sides=6)
inner_toe = FOOTPRINT_X_M / 2 - BUND_FOOT
m.strut('dark', (-PITCH / 2, PIPE_Y, 0.0), (inner_toe - 0.5, PIPE_Y, 0.0), PIPE_R, sides=6)
assert PITCH / 2 + TANK_R + 0.5 < inner_toe, 'the tanks and their foundations must stand inside the bund'
assert SHELL + ROOF == HEIGHT_M, 'HEIGHT_M is the apex of a tank roof'
m.export(out)
