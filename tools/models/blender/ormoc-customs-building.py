"""Ormoc customs building: a plain one-story port customs house, NO light. Original work, AGPL-3.0-or-later.

Whole appearance is an ESTIMATE. The only source is existence: the JACAR Notice to Mariners
(https://www.jacar.archives.go.jp/acv/contents/pub/pdf/B11/B11092933500.b3_0098.3-2198.00000139.pdf) records a customs
building with a fixed red light at Ormoc; its look and its 1944 survival are NOT sourced. The light stays excluded
(F3 section 8): nothing here is a lamp, lens or lit marker. Figures (read 2026-10-16), all ESTIMATE:
  plan 9 x 18 m, plinth 0.5 m high (0.15 m wider each side), walls 3.6 m, plaster-like concrete
  gable roof of corrugated steel, 2.2 m rise, 0.6 m eaves
  porch 5.0 x 2.5 m on a 0.5 m raised slab with two steps 3.0 m wide, steel awning 0.12 m on four timber posts 0.25 m square
  front door 1.8 x 2.6 m (dark leaves, timber frame); rear door 1.0 x 2.2 m
  windows 1.1 x 1.5 m, five per long side, two on the front and two on the rear, timber sills and open shutters
  flagpole 0.1 m across rising 3.0 m from the front ridge (no flag)
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Frame: ridge along z, front (porch) toward +z like the barracks, +y up, meters; the ground is y=0.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 10.2
FOOTPRINT_Z_M = 21.6
HEIGHT_M = 9.3
BASE_Y_M = 0.0

W, L = 9.0, 18.0
PLINTH_H, WALL_H, RISE, EAVE = 0.5, 3.6, 2.2, 0.6
EMBED_M = 0.02
RIDGE_Y = PLINTH_H + WALL_H + RISE

out, opts = kit.cli_args()
m = kit.Model('ormoc-customs-building', skin=512)
with m.tagged('plinth'):
    m.box('concrete', (0.0, 0.0, 0.0), (W + 0.3, PLINTH_H, L + 0.3))
with m.tagged('walls'):
    m.box('concrete', (0.0, PLINTH_H - EMBED_M, 0.0), (W, WALL_H + EMBED_M, L))
with m.tagged('roof'):
    m.gable_roof('steel', (0.0, PLINTH_H + WALL_H, 0.0), W, L, RISE, EAVE)
with m.tagged('porch'):
    m.box('concrete', (0.0, 0.0, L / 2 + 1.2), (5.0, PLINTH_H, 2.5))
    m.box('concrete', (0.0, 0.0, L / 2 + 2.5 + 0.25), (3.0, 0.25, 0.5))
    m.box('steel', (0.0, 3.4, L / 2 + 1.35), (5.8, 0.12, 2.9))
    m.box('steel', (0.0, RIDGE_Y - 0.1, L / 2 + EAVE - 0.05), (0.1, 3.1, 0.1))
with m.tagged('posts'), m.shared_chart():
    for sx in (-1, 1):
        m.box('timber', (sx * 2.4, PLINTH_H - EMBED_M, L / 2 + 2.3), (0.25, 2.9 + 2 * EMBED_M, 0.25))
    m.box('timber', (0.0, 3.15, L / 2 + 2.3), (5.0, 0.25, 0.25))
with m.tagged('openings'), m.shared_chart():
    zf = L / 2
    m.box('dark', (0.0, PLINTH_H, zf + 0.04), (1.8, 2.6, 0.1))
    m.box('dark', (0.0, PLINTH_H, -zf - 0.04), (1.0, 2.2, 0.1))
    for sx in (-1, 1):
        m.box('timber', (sx * 1.02, PLINTH_H, zf + 0.05), (0.12, 2.7, 0.14))
    m.box('timber', (0.0, PLINTH_H + 2.6, zf + 0.05), (2.16, 0.12, 0.14))
    wy = PLINTH_H + 0.9
    for s in (-1, 1):
        for zc in (-6.4, -3.2, 0.0, 3.2, 6.4):
            m.box('dark', (s * (W / 2 + 0.02), wy, zc), (0.08, 1.5, 1.1))
            m.box('timber', (s * (W / 2 + 0.05), wy - 0.08, zc), (0.14, 0.08, 1.4))
            for dz in (-1, 1):
                m.box('timber', (s * (W / 2 + 0.02), wy, zc + dz * 0.8), (0.07, 1.5, 0.5))
        for sx in (-3.6, 3.6) if s == 1 else (-2.5, 2.5):
            zz = s * (zf + 0.02)
            m.box('dark', (sx, wy, zz), (1.0, 1.5, 0.08))
            m.box('timber', (sx, wy - 0.08, s * (zf + 0.05)), (1.3, 0.08, 0.14))
m.marking('grid', tags=['walls'], spacingM=[1.2, 1.2, 1.2], widthM=0.015, depth=0.8)
m.marking('grid', tags=['roof'], spacingM=[1.0, None, 1.0], widthM=0.03, depth=0.8)
m.export(out)
