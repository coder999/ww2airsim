"""Earth-covered ammunition magazine: a mound over the store, a concrete headwall with wing walls, steel doors.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  mound 14 x 12 m at the foot, 8 x 6 m at the top, 3.5 m high         ESTIMATE
  headwall 1.0 m thick, 3.2 m high, 5.0 m wide; its face on the mound's foot line   ESTIMATE
  wing walls 2.0 m long, 0.4 m thick, 1.6 m high                      ESTIMATE
  concrete walls buried 0.1 m below the ground                         ESTIMATE
  doors 2.0 x 2.2 m, standing 0.1 m proud of the headwall             ESTIMATE
Frame: the doors face +x, +y up, meters; the ground is y=0.
DP3 detail (read 2026-09-29; no period drawing found, every figure an ESTIMATE):
  mound trimmed to 3.2 m so the vent cowls and rod reach the 3.5 m envelope
  headwall cap 1.2 m x 5.4 m, 0.15 m deep, 0.1 m proud; form-board lines every 0.6 m (rows), 1.25 m (joints)
  door leaves 1.0 m each, 0.1 m proud, with two steel straps and a center bar; hinge barrels 0.1 m
  wing-wall caps 0.15 m deep; access apron 2.0 m out, top 0.05 m above ground
  two vent stacks 0.24 m radius, 0.22 m plus a 0.1 m cowl, on the mound top; one lightning rod 0.03 m radius
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: the blast traverse, the access track.
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
MOUND_H = 3.2
EMBED_M = 0.02

out, opts = kit.cli_args()
m = kit.Model('ammunition-bunker', skin=512)
with m.tagged('mound'):
    m.frustum('earth', (FACE_X - MOUND_X / 2, 0.0, 0.0), (MOUND_X, FOOTPRINT_Z_M), (8.0, 6.0), MOUND_H)
with m.tagged('headwall'):
    m.box('concrete', (FACE_X - 0.5, BASE_Y_M, 0.0), (1.0, 3.2, 5.0))
with m.tagged('caps'), m.shared_chart():
    m.box('concrete', (FACE_X - 0.5 + 0.05, MOUND_H - 0.05 - EMBED_M, 0.0), (1.2, 0.15 + EMBED_M, 5.4))
    for s in (-1, 1):
        m.box('concrete', (FACE_X + WING_L / 2, 1.6 - 0.1 - EMBED_M, s * 2.7), (WING_L + 0.1, 0.15 + EMBED_M, 0.6))
with m.tagged('wings'):
    for s in (-1, 1):
        m.box('concrete', (FACE_X + WING_L / 2, BASE_Y_M, s * 2.7), (WING_L, 1.6, 0.4))
with m.tagged('apron'):
    m.box('concrete', (FACE_X + 0.98, BASE_Y_M, 0.0), (2.0, 0.15, 5.2))
with m.tagged('doors'):
    for s in (-1, 1):
        m.box('dark', (FACE_X + 0.05, 0.0, s * 0.5), (0.1, 2.2, 1.0 - 0.02))
    with m.shared_chart():
        for y in (0.5, 1.7):
            m.box('steel', (FACE_X + 0.08 + EMBED_M / 2, y, 0.0), (0.05 + EMBED_M, 0.12, 2.0))
        m.box('steel', (FACE_X + 0.08 + EMBED_M / 2, 0.0, 0.0), (0.05 + EMBED_M, 2.2, 0.1))
        for z in (-1.0, 1.0):
            for y in (0.4, 1.8):
                m.box('steel', (FACE_X + 0.05, y, z), (0.16, 0.14, 0.1))
with m.tagged('vents'), m.shared_chart():
    for z in (-1.8, 1.8):
        m.tank('steel', (FACE_X - 6.0, MOUND_H - EMBED_M, z), 0.24, 0.22 + EMBED_M, 0.1, 8)
    m.strut('steel', (FACE_X - 6.0, MOUND_H - EMBED_M, 0.0), (FACE_X - 6.0, HEIGHT_M, 0.0), 0.03, 0.02, 4)
# Poured-concrete form-board joints on the headwall's face (x normal): rows in y, joints in z.
m.marking('grid', tags=['headwall'], spacingM=[None, 0.6, 1.25], widthM=0.02, depth=0.8)
m.marking('grid', tags=['apron'], spacingM=[1.0, None, 1.3], widthM=0.03, depth=0.8)
assert FACE_X + WING_L - (FACE_X - MOUND_X) == FOOTPRINT_X_M, 'FOOTPRINT_X_M runs from the mound\'s back toe to the wing walls\' ends'
m.export(out)
