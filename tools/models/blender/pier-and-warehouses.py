"""Pier and warehouses: a timber pier on piles off a concrete quay, two gable-roofed warehouses on the quay.
Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  quay 40 x 40 m, its top 2.0 m above the water                 ESTIMATE
  pier 60 m long, 10 m wide, 0.3 m deck, its top level with the quay   ESTIMATE
  piles 0.4 m square, three across, every 6 m                    ESTIMATE
  warehouses 14 x 30 m, 6 m walls, 3 m roof rise, 0.5 m eaves; three 5 x 4 m doors on the seaward side   ESTIMATE
Frame: the pier runs out to +x, +y up, meters; y=0 is the water surface (a ship's waterline, R2), not the ground.
Leaves out: cranes, rails, bollards, fenders, the harbor floor.
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

out, opts = kit.cli_args()
m = kit.Model('pier-and-warehouses')
m.box('concrete', (-QUAY_X / 2, 0.0, 0.0), (QUAY_X, QUAY_H, FOOTPRINT_Z_M))
m.box('timber', (PIER_X / 2, QUAY_H - DECK_T, 0.0), (PIER_X, DECK_T, PIER_Z))
for i in range(10):
    for pz in (-4.5, 0.0, 4.5):
        m.box('timber', (4.0 + 6.0 * i, 0.0, pz), (0.4, QUAY_H - DECK_T, 0.4))
for cx in (-30.0, -12.0):
    m.box('timber', (cx, QUAY_H, 0.0), (14.0, WALL, 30.0))
    m.gable_roof('steel', (cx, QUAY_H + WALL, 0.0), 14.0, 30.0, RISE, 0.5)
    for dz in (-8.0, 0.0, 8.0):
        m.box('dark', (cx + 7.05, QUAY_H, dz), (0.1, 4.0, 5.0))
assert QUAY_X + PIER_X == FOOTPRINT_X_M and QUAY_H + WALL + RISE == HEIGHT_M, 'footprint and height'
m.export(out)
