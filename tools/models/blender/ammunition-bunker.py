"""Earth-covered ammunition magazine: a mound over the store, a concrete headwall with wing walls, steel doors.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  mound 14 x 12 m at the foot, 8 x 6 m at the top, 3.5 m high         ESTIMATE
  headwall 1.0 m thick, 3.2 m high, 5.0 m wide; its face on the mound's foot line   ESTIMATE
  wing walls 2.0 m long, 0.4 m thick, 1.6 m high                      ESTIMATE
  concrete walls buried 0.1 m below the ground                         ESTIMATE
  doors 2.0 x 2.2 m, standing 0.1 m proud of the headwall             ESTIMATE
Frame: the doors face +x, +y up, meters; the ground is y=0.
Leaves out: vents, lightning rods, the blast traverse, the access track.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 16.0
FOOTPRINT_Z_M = 12.0
HEIGHT_M = 3.5
BASE_Y_M = -0.1

MOUND_X, FACE_X = 14.0, 6.0          # the mound's foot length, and the headwall's face line
WING_L = 2.0

out, opts = kit.cli_args()
m = kit.Model('ammunition-bunker')
m.frustum('earth', (FACE_X - MOUND_X / 2, 0.0, 0.0), (MOUND_X, FOOTPRINT_Z_M), (8.0, 6.0), HEIGHT_M)
m.box('concrete', (FACE_X - 0.5, BASE_Y_M, 0.0), (1.0, 3.2, 5.0))
for s in (-1, 1):
    m.box('concrete', (FACE_X + WING_L / 2, BASE_Y_M, s * 2.7), (WING_L, 1.6, 0.4))
m.box('dark', (FACE_X + 0.05, 0.0, 0.0), (0.1, 2.2, 2.0))
assert FACE_X + WING_L - (FACE_X - MOUND_X) == FOOTPRINT_X_M, 'FOOTPRINT_X_M runs from the mound\'s back toe to the wing walls\' ends'
m.export(out)
