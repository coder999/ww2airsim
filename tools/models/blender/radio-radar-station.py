"""Radio / radar station: an equipment hut and a tapered lattice mast carrying a fixed antenna array.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  pad 16 x 12 m, 0.3 m deep                                    ESTIMATE
  hut 6 x 8 m, 3.0 m walls, a 0.3 m roof slab with 0.3 m eaves  ESTIMATE
  mast 18 m: 3.0 m square at the foot, 1.0 m at the top, six panels, 0.12 m members   ESTIMATE
  array 6.0 m wide, 4.0 m tall, 0.3 m deep, facing +x, on a 0.5 m yoke   ESTIMATE: a generic fixed early-warning array
Frame: the array faces +x, +y up, meters; the pad top is y=0.
DP3 detail (read 2026-09-29; no period drawing found, every figure an ESTIMATE):
  mast plinth 3.6 m square, 0.3 m high; four guy wires 0.05 m across to 0.5 m anchor blocks (12 m up the mast)
  array frame 0.1 m bars, 0.36 m deep; dipole rows every 0.4 m (marking on the dark panel)
  hut windows 1.2 x 0.9 m, sill 1.2 m, glass 0.06 m; door frame 0.1 m; roof air unit 1.2 x 0.8 x 0.8 m, stack 0.1 m x 1.0 m
  generator 1.5 x 1.2 x 1.0 m, three fuel drums 0.3 m radius x 0.9 m, at the hut's +z side; cable tray 0.3 x 0.08 m
  pad joints every 4 m; roof-slab parapet 0.15 m
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: the fence, the array's individual dipoles (a marking stands for them).
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
EMBED_M = 0.02

out, opts = kit.cli_args()
m = kit.Model('radio-radar-station', skin=512)
with m.tagged('pad'):
    m.box('concrete', (0.0, BASE_Y_M, 0.0), (FOOTPRINT_X_M, -BASE_Y_M, FOOTPRINT_Z_M))
with m.tagged('hut'):
    m.box('concrete', (-4.0, 0.0, 0.0), (6.0, 3.0, 8.0))
    m.box('concrete', (-4.0, 3.0, 0.0), (6.6, 0.3, 8.6))
with m.tagged('door'):
    m.box('dark', (-0.975, 0.0, 0.0), (0.05, 2.0, 1.0))
with m.tagged('hut-fittings'), m.shared_chart():
    for dz in (-0.55, 0.55):
        m.box('steel', (-1.0 + 0.05 - EMBED_M, 0.0, dz), (0.1 + EMBED_M, 2.1, 0.1))
    m.box('steel', (-1.0 + 0.05 - EMBED_M, 2.0, 0.0), (0.1 + EMBED_M, 0.1, 1.2))
    m.box('steel', (-4.0, 3.3 - EMBED_M, 0.0), (1.2, 0.8 + EMBED_M, 0.8))
    m.strut('steel', (-6.0, 3.3 - EMBED_M, 2.5), (-6.0, 4.3, 2.5), 0.05, sides=6)
    for sz in (-1, 1):
        m.box('concrete', (-4.0, 3.3 - EMBED_M, sz * 4.225), (6.6, 0.15 + EMBED_M, 0.15))
        m.box('concrete', (-4.0 + sz * 3.225, 3.3 - EMBED_M, 0.0), (0.15, 0.15 + EMBED_M, 8.3))
with m.tagged('glass'), m.shared_chart():
    for sz in (-1, 1):
        for x in (-5.6, -2.4):
            m.box('glazing', (x, 1.2, sz * 4.0 - sz * 0.03), (1.2, 0.9, 0.06))
    m.box('glazing', (-7.0 + 0.03, 1.2, 0.0), (0.06, 0.9, 1.2))
with m.tagged('yard'), m.shared_chart():
    m.box('steel', (-5.0, 0.0, 5.0), (1.5, 1.0, 1.2))
    for k in range(3):
        m.tank('dark', (-2.8 + 0.7 * k, 0.0, 5.0), 0.3, 0.9, 0.0, 8)
with m.tagged('plinth'):
    m.box('concrete', (MAST_X, -EMBED_M, 0.0), (3.6, 0.3 + EMBED_M, 3.6))
with m.tagged('mast'):
    m.lattice_mast('steel', (MAST_X, 0.0, 0.0), 3.0, 1.0, MAST_H, 6, 0.12)
with m.tagged('array'), m.shared_chart():
    m.box('steel', (MAST_X, MAST_H - 0.5, 0.0), (0.3, 0.5, 6.4))
with m.tagged('panel'):
    m.box('dark', (MAST_X, MAST_H, 0.0), (0.3, ARRAY_H, 6.0))
with m.tagged('frame'), m.shared_chart():
    for y in (MAST_H - EMBED_M, MAST_H + ARRAY_H - 0.1 - EMBED_M + 0.0):
        m.box('steel', (MAST_X, y, 0.0), (0.36, 0.1 + EMBED_M - 0.0, 6.1))
    for sz in (-1, 1):
        m.box('steel', (MAST_X, MAST_H, sz * 3.0), (0.36, ARRAY_H - 0.02, 0.1))
with m.tagged('cable'):
    m.strut('dark', (-1.0, 2.5, 0.0), (MAST_X - 1.4, 2.5, 0.0), 0.05)
with m.tagged('guys'), m.shared_chart():
    for tx, tz in ((7.5, 5.5), (7.5, -5.5), (MAST_X, 5.6), (MAST_X, -5.6)):
        m.strut('dark', (MAST_X, 12.0, 0.0), (tx, 0.25, tz), 0.025, sides=4)
        m.box('concrete', (tx, -EMBED_M, tz), (0.5, 0.35 + EMBED_M, 0.5))
m.marking('grid', tags=['pad'], spacingM=[4.0, None, 4.0], widthM=0.04, depth=0.8)
m.marking('grid', tags=['hut'], spacingM=[None, 0.6, 1.2], widthM=0.02, depth=0.8)
m.marking('grid', tags=['panel'], spacingM=[None, 0.4, 0.4], widthM=0.05, depth=1.0)
assert MAST_H + ARRAY_H == HEIGHT_M, 'HEIGHT_M is the array top'
m.export(out)
