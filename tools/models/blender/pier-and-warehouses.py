"""Pier and warehouses: a timber pier on piles off a concrete quay, two gable-roofed warehouses on the quay.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  quay 40 x 40 m, its top 2.0 m above the water                 ESTIMATE
  pier 60 m long, 10 m wide, 0.3 m deck, its top level with the quay   ESTIMATE
  piles 0.4 m square, three across, every 6 m                    ESTIMATE
  warehouses 14 x 30 m, 6 m walls, 3 m roof rise, 0.5 m eaves; three 5 x 4 m doors on the seaward side   ESTIMATE
Frame: the pier runs out to +x, +y up, meters; y=0 is the water surface (a ship's waterline, R2), not the ground.
DP3 detail (read 2026-09-29; every figure an ESTIMATE, no drawing consulted):
  quay coping 0.3 m wide x 0.15 m high along the edge; bollards 0.45 m across x 0.5 m high, every 10 m on the quay and pier edges
  fender piles 0.3 m square, every 6 m on the pier's two long sides, 0.6 m taller than the deck; pile cap beams 0.3 m square
  pier stringers 0.3 m square under the deck along its length; rail tracks 0.1 m proud, 1.4 m gauge, along the quay and pier
  warehouse plinth 0.3 m high, corner boards 0.2 m, door frames 0.2 m, sliding door track 0.15 m, roof vent 0.6 m x 0.4 m at the ridge
  plank seams every 0.25 m on the walls, every 0.3 m on the deck, roof seams every 1.0 m
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: cranes, the harbor floor.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 100.0
FOOTPRINT_Z_M = 40.0
HEIGHT_M = 11.0
BASE_Y_M = 0.0

QUAY_X, QUAY_H = 40.0, 2.0
PIER_X, PIER_Z, DECK_T = 60.0, 10.0, 0.3
WALL, RISE = 6.0, 3.0
EMBED_M = 0.02

out, opts = kit.cli_args()
m = kit.Model('pier-and-warehouses', skin=512)
with m.tagged('quay'):
    m.box('concrete', (-QUAY_X / 2, 0.0, 0.0), (QUAY_X, QUAY_H, FOOTPRINT_Z_M))
with m.tagged('deck'):
    m.box('timber', (PIER_X / 2, QUAY_H - DECK_T, 0.0), (PIER_X, DECK_T, PIER_Z))
with m.tagged('piles'):
    for i in range(10):
        for pz in (-4.5, 0.0, 4.5):
            m.box('timber', (4.0 + 6.0 * i, 0.0, pz), (0.4, QUAY_H - DECK_T, 0.4))
with m.tagged('stringers'), m.shared_chart():
    for pz in (-4.5, 0.0, 4.5):
        m.box('timber', (PIER_X / 2 + 0.2, QUAY_H - DECK_T - 0.3 + EMBED_M, pz), (PIER_X - 4.0, 0.3, 0.3))
with m.tagged('fenders'), m.shared_chart():
    for i in range(10):
        for sz in (-1, 1):
            m.box('timber', (4.0 + 6.0 * i, 0.0, sz * (PIER_Z / 2 - 0.15 + 0.02)), (0.3, QUAY_H + 0.6, 0.3))
with m.tagged('coping'), m.shared_chart():
    for sz in (-1, 1):
        m.box('concrete', (-QUAY_X / 2, QUAY_H - EMBED_M, sz * (FOOTPRINT_Z_M / 2 - 0.15)), (QUAY_X, 0.15 + EMBED_M, 0.3))
with m.tagged('bollards'), m.shared_chart():
    for x in (10.0, 20.0, 30.0, 40.0, 50.0):
        for sz in (-1, 1):
            m.tank('steel', (x, QUAY_H - EMBED_M, sz * (PIER_Z / 2 - 0.9)), 0.22, 0.5 + EMBED_M, 0.0, 10)
with m.tagged('rails'), m.shared_chart():
    for rz in (-0.7, 0.7):
        m.box('steel', (28.0, QUAY_H - EMBED_M, rz), (64.0, 0.1 + EMBED_M, 0.1))
for cx in (-30.0, -12.0):
    with m.tagged('warehouse'):
        m.box('timber', (cx, QUAY_H, 0.0), (14.0, WALL, 30.0))
    with m.tagged('wroof'):
        m.gable_roof('steel', (cx, QUAY_H + WALL, 0.0), 14.0, 30.0, RISE, 0.5)
    with m.tagged('wfit'), m.shared_chart():
        m.box('concrete', (cx, QUAY_H - EMBED_M, 0.0), (14.2, 0.3 + EMBED_M, 30.2))
        for sx in (-1, 1):
            for sz in (-1, 1):
                m.box('timber', (cx + sx * (7.0 - 0.1 + 0.02), QUAY_H + 0.28, sz * (15.0 - 0.1 + 0.02)), (0.2, WALL - 0.28, 0.2))
        for dz in (-8.0, 0.0, 8.0):
            m.box('dark', (cx + 7.05, QUAY_H, dz), (0.1, 4.0, 5.0))
            for sz in (-1, 1):
                m.box('timber', (cx + 7.0 + 0.06, QUAY_H, dz + sz * 2.6), (0.2, 4.2, 0.2))
            m.box('timber', (cx + 7.0 + 0.06, QUAY_H + 4.0, dz), (0.2, 0.2, 5.4))
            m.box('steel', (cx + 7.0 + 0.09, QUAY_H + 3.85, dz), (0.1, 0.1, 6.0))
assert QUAY_X + PIER_X == FOOTPRINT_X_M and QUAY_H + WALL + RISE == HEIGHT_M, 'footprint and height'
m.marking('grid', tags=['warehouse'], spacingM=[None, 0.25, None], widthM=0.015, depth=0.8)
m.marking('grid', tags=['deck'], spacingM=[None, None, 0.3], widthM=0.02, depth=0.8)
m.marking('grid', tags=['wroof'], spacingM=[1.0, None, 1.0], widthM=0.03, depth=0.8)
m.marking('grid', tags=['quay'], spacingM=[5.0, None, 5.0], widthM=0.04, depth=0.8)
m.export(out)
