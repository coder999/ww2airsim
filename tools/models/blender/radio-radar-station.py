"""Radio / radar station: an equipment hut and a tapered lattice mast carrying a fixed antenna array.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  pad 16 x 12 m, 0.3 m deep                                    ESTIMATE
  hut 6 x 8 m, 3.0 m walls, a 0.3 m roof slab with 0.3 m eaves  ESTIMATE
  mast 18 m: 3.0 m square at the foot, 1.0 m at the top, six panels, 0.12 m members   ESTIMATE
  array 6.0 m wide, 4.0 m tall, 0.3 m deep, facing +x, on a 0.5 m yoke   ESTIMATE: a generic fixed early-warning array
Frame: the array faces +x, +y up, meters; the pad top is y=0.
Leaves out: guy wires, the generator, the fence, the array's dipoles (one dark panel stands for them).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 16.0
FOOTPRINT_Z_M = 12.0
HEIGHT_M = 22.0
BASE_Y_M = -0.3

MAST_X, MAST_H = 3.0, 18.0
ARRAY_H = 4.0

out, opts = kit.cli_args()
m = kit.Model('radio-radar-station')
m.box('concrete', (0.0, BASE_Y_M, 0.0), (FOOTPRINT_X_M, -BASE_Y_M, FOOTPRINT_Z_M))
m.box('concrete', (-4.0, 0.0, 0.0), (6.0, 3.0, 8.0))
m.box('concrete', (-4.0, 3.0, 0.0), (6.6, 0.3, 8.6))
m.box('dark', (-0.975, 0.0, 0.0), (0.05, 2.0, 1.0))
m.lattice_mast('steel', (MAST_X, 0.0, 0.0), 3.0, 1.0, MAST_H, 6, 0.12)
m.box('steel', (MAST_X, MAST_H - 0.5, 0.0), (0.3, 0.5, 6.4))
m.box('dark', (MAST_X, MAST_H, 0.0), (0.3, ARRAY_H, 6.0))
m.strut('dark', (-1.0, 2.5, 0.0), (MAST_X - 1.4, 2.5, 0.0), 0.05)
assert MAST_H + ARRAY_H == HEIGHT_M, 'HEIGHT_M is the array top'
m.export(out)
