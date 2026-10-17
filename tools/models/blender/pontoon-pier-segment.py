"""Pontoon pier segment: Navy steel pontoon cells bolted into a short pier run. Original work, AGPL-3.0-or-later.

Figures (read 2026-10-16):
  cell 5 x 7 x 5 ft = 1.524 x 2.134 x 1.524 m     ESTIMATE: the F8 plan's "about 5 x 7 x 5 ft"; the source, Building the
                    Navy's Bases ch. XXIX (https://www.ibiblio.org/hyperwar/NHC/bases/bases-29.htm), says only that the
                    Seabees handled pontoon barges and causeways and reassembled cells as barges and pontoon piers
  run 3 cells wide x 8 cells long (15 x 56 ft)    ESTIMATE: a short pier run; length and count are a modeling choice
  0.02 m seam between cells                       ESTIMATE
  deck plates 0.03 m proud, inset 0.15 m; bolt heads 0.07 m square at each cell's four corners   ESTIMATE
  timber rubbing strakes 0.25 x 0.12 m, two heights on each long side, one across the +x end     ESTIMATE
  bollards 0.34 m across x 0.5 m high, four per side                                           ESTIMATE
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Frame: the pier runs out to +x, +y up, meters; y=0 is the underside of the cells (a ground origin), not the waterline.
Leaves out: the draft (a placer sets the waterline), the connecting pins, any causeway ramp (a sand LST causeway stays procedural).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 17.149
FOOTPRINT_Z_M = 4.752
HEIGHT_M = 2.024
BASE_Y_M = 0.0

CELL_X, CELL_Z, CELL_H = 2.1336, 1.524, 1.524
NX, NZ = 8, 3
GAP, EMBED_M = 0.02, 0.02
X0, Z0 = NX * CELL_X, NZ * CELL_Z

out, opts = kit.cli_args()
m = kit.Model('pontoon-pier-segment', skin=512)
cells = [(-X0 / 2 + (i + 0.5) * CELL_X, -Z0 / 2 + (k + 0.5) * CELL_Z) for i in range(NX) for k in range(NZ)]
with m.tagged('cells'):
    for cx, cz in cells:
        m.box('steel', (cx, 0.0, cz), (CELL_X - GAP, CELL_H, CELL_Z - GAP))
with m.tagged('plates'), m.shared_chart():
    for cx, cz in cells:
        m.box('dark', (cx, CELL_H - EMBED_M, cz), (CELL_X - 0.3, 0.03 + EMBED_M, CELL_Z - 0.3))
with m.tagged('bolts'), m.shared_chart():
    for cx, cz in cells:
        for sx in (-1, 1):
            for sz in (-1, 1):
                m.box('steel', (cx + sx * (CELL_X / 2 - 0.1), CELL_H - EMBED_M, cz + sz * (CELL_Z / 2 - 0.1)), (0.07, 0.04 + EMBED_M, 0.07))
with m.tagged('bollards'), m.shared_chart():
    for i in (1, 3, 5, 7):
        for sz in (-1, 1):
            m.tank('steel', (-X0 / 2 + (i + 0.5) * CELL_X, CELL_H - EMBED_M, sz * (Z0 / 2 - 0.4)), 0.17, 0.5 + EMBED_M, 0.0, 10)
with m.tagged('fenders'), m.shared_chart():
    for sz in (-1, 1):
        for y in (0.45, 1.0):
            m.box('timber', (0.0, y, sz * (Z0 / 2 - GAP / 2 + 0.04)), (X0 - GAP, 0.25, 0.12))
    m.box('timber', (X0 / 2 - GAP / 2 + 0.04, 0.45, 0.0), (0.12, 0.8, Z0 - GAP))
m.marking('grid', tags=['plates'], spacingM=[0.5, None, 0.5], widthM=0.02, depth=0.8)
m.export(out)
