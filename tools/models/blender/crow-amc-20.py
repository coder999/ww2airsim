"""USS Crow (AMc-20), Puget Sound torpedo-recovery configuration, June 1943.
Original work, AGPL-3.0-or-later.

CITED (read 2026-10-11):
  The U.S. Naval History and Heritage Command's 80-G-277691 photograph shows Crow in
  Puget Sound on 4 June 1943 during torpedo-recovery operations, with torpedoes on the
  fantail. NHHC's Crow collection identifies her as AMc-20 and records her accidental
  sinking while serving as a torpedo-plane target on 23 August 1943.
  25.35 m overall, 6.38 m beam, 1.52 m draft and 10 knots -- the published Crow
  particulars recorded in content/ships/crow-amc-20.json. She was the 1935 wooden purse
  seiner Jadran before Navy acquisition.
ESTIMATE / modeling choice:
  Station shapes, sheer and every height are reconstructed by eye from the NHHC Crow
  photographs; no builder's plan was found. The wheelhouse, engine casing, single exhaust,
  mast, cargo boom, recovery winch, railings, vents, skiff and deck fittings reproduce the
  working-vessel silhouette, not surveyed geometry. Two recovered practice torpedoes on
  timber cradles make the June 1943 role readable. The ship is deliberately unarmed for the
  proposed training-target use, despite published wartime small-arms fits.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B, DRAFT, DECK = 25.35, 6.38, 1.52, 2.15
EMBED_M = 0.02
STATIONS = [
    (-L / 2, 0.55, 1.05, 1.75, 0.75),
    (-10.8, 2.35, 1.42, 1.88, 2.55),
    (-7.0, B / 2, DRAFT, 2.02, 3.08),
    (1.5, B / 2, DRAFT, DECK, 3.12),
    (7.2, 2.95, 1.48, 2.48, 2.92),
    (10.6, 1.85, 1.30, 3.05, 2.15),
    (L / 2, 0.10, 0.75, 3.62, 0.30),
]
SECTION = ((0.0, -1.0), (0.38, -0.96), (0.72, -0.78), (0.94, -0.44),
           (1.0, -0.12), (1.0, 0.0), (0.98, 0.55), (1.0, 1.0))

out, opts = kit.cli_args()
m = kit.Model('crow-amc-20', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck',
                 deck_node='MainDeck', below_role='antifouling', below_node='Bottom', subdivide=28)

inside = lambda x: m.hull_at(x)[3]  # noqa: E731


def stand(x, length=0.4):
    count = max(2, math.ceil(length / 0.2) + 1)
    return min(m.hull_at(x - length / 2 + length * i / (count - 1))[2] - EMBED_M for i in range(count))


# Low after work deck, engine casing, raised pilothouse and overhanging bridge wings.
engine_y = stand(-0.9, 4.6)
bridge_y = stand(4.4, 5.2)
with m.tagged('superstructure'):
    m.rounded_box('superstructure', (-0.9, engine_y, 0.0), 4.6, 4.0, 1.75 + EMBED_M, 0.35, segments=6)
    m.rounded_box('superstructure', (4.4, bridge_y, 0.0), 5.2, 4.35, 2.15 + EMBED_M, 0.45, segments=6)
    m.box('superstructure', (4.8, bridge_y + 2.13, 0.0), (3.4, 0.18, 4.85))
with m.tagged('windows'), m.shared_chart():
    wy = bridge_y + 1.25
    for z in (-1.75, -0.85, 0.0, 0.85, 1.75):
        m.box('glazing', (7.02, wy, z), (0.08, 0.62, 0.58))
    for side in (-1, 1):
        for x in (3.15, 4.2, 5.25, 6.2):
            m.box('glazing', (x, wy, side * 2.19), (0.68, 0.62, 0.08))

# A short diesel exhaust abaft the bridge, its cap blackened by use.
with m.tagged('stack'):
    m.strut('superstructure', (-1.3, engine_y + 1.65, 0.0), (-1.55, engine_y + 4.25, 0.0), 0.42, 0.34, sides=24)
    m.strut('dark', (-1.50, engine_y + 3.72, 0.0), (-1.57, engine_y + 4.38, 0.0), 0.37, 0.34, sides=24)

# Purse-seiner working mast, boom and stays dominate the small ship's silhouette.
mast_x, mast_base, mast_top = 0.65, stand(0.65), 11.15
with m.tagged('mast'), m.shared_chart():
    m.strut('fitting', (mast_x, mast_base, 0.0), (mast_x - 0.25, mast_top, 0.0), 0.17, 0.10, sides=10)
    m.strut('fitting', (mast_x - 0.18, 8.2, -2.45), (mast_x - 0.18, 8.2, 2.45), 0.07, sides=6)
    m.strut('fitting', (mast_x - 0.12, 7.15, 0.0), (-8.75, stand(-8.75) + 2.15, 0.0), 0.12, 0.08, sides=8)
    for side in (-1, 1):
        m.strut('fitting', (mast_x - 0.20, 9.25, side * 0.08), (-0.4, stand(-0.4) + 0.4, side * 2.85), 0.015, sides=4)
        m.strut('fitting', (mast_x - 0.18, 8.2, side * 2.35), (8.8, stand(8.8) + 0.8, side * 0.35), 0.012, sides=4)
    m.strut('fitting', (mast_x - 0.22, 10.8, 0.0), (10.6, stand(10.6) + 1.0, 0.0), 0.015, sides=4)
    m.strut('fitting', (mast_x - 0.12, 7.2, 0.0), (-8.75, stand(-8.75) + 2.18, 0.0), 0.012, sides=4)

# Recovery winch and boom tackle on the open fantail.
with m.tagged('workgear'), m.shared_chart():
    winch_y = stand(-4.7)
    m.strut('fitting', (-4.7, winch_y + 0.55, -0.95), (-4.7, winch_y + 0.55, 0.95), 0.42, sides=18)
    for side in (-1, 1):
        m.tank('fitting', (-4.7, winch_y, side * 1.15), 0.18, 1.15 + EMBED_M, segments=12)
    m.strut('fitting', (-8.72, stand(-8.72) + 2.12, 0.0), (-8.72, stand(-8.72) + 0.2, 0.0), 0.07, sides=6)

# NHHC 80-G-277691 explicitly calls out torpedoes on the fantail. These are inert
# recovered rounds on timber cradles, not trainable weapons and therefore have no mount nodes.
with m.tagged('recoveredtorpedoes'), m.shared_chart():
    ty = stand(-8.0, 5.2) + 0.50
    for side in (-1, 1):
        z = side * 0.72
        for x in (-9.6, -6.1):
            m.box('timber', (x, ty - 0.48, z), (0.22, 0.42, 0.72))
        m.gun_barrel('dark', (-10.55, ty, z), 0.0, 0.0, 5.35, 0.24, 0.13, sides=18)
        for dz in (-0.48, 0.48):
            m.box('fitting', (-10.25, ty - 0.02, z + dz * 0.35), (0.65, 0.05, 0.28))

with m.tagged('deckfittings'), m.shared_chart():
    naval.capstan(m, 9.3, stand(9.3), 0.0, EMBED_M)
    for x in (8.0, -10.5):
        for side in (-1, 1):
            naval.bitts(m, x, stand(x, 1.0), side * (inside(x) - 0.48), True, EMBED_M)
    for x in (-3.2, 2.0):
        for side in (-1, 1):
            naval.cowl_vent(m, x, stand(x), side * 2.15, 0.0, 0.85, EMBED_M)
    for side in (-1, 1):
        naval.carley_float(m, 3.4, bridge_y + 0.55, side * 2.20, 1.65, side)
    # A small clinker-built skiff stowed across the forward engine casing.
    m.fuselage('fitting', [(-2.6, 0.16, 0.15, engine_y + 2.05, 2.0),
                            (-0.9, 0.58, 0.34, engine_y + 2.05, 2.4),
                            (0.8, 0.16, 0.15, engine_y + 2.08, 2.0)], segments=20, center_z=1.45)

# Open working-deck rails, with breaks at the torpedo-handling area and bow fittings.
with m.tagged('rails'), m.shared_chart():
    for side in (-1, 1):
        for a, b in ((-11.1, -10.1), (-5.0, 7.3), (8.5, 11.0)):
            n = max(2, math.ceil((b - a) / 1.5) + 1)
            pts = [(a + (b - a) * i / (n - 1), stand(a + (b - a) * i / (n - 1)),
                    side * (inside(a + (b - a) * i / (n - 1)) - 0.08)) for i in range(n)]
            m.railing('fitting', pts, height=0.78, post_m=1.4, rails=2)
        m.railing('fitting', [(2.9, bridge_y + 2.31, side * 2.32), (6.4, bridge_y + 2.31, side * 2.32)],
                  height=0.72, post_m=1.2, rails=2)

# Wooden construction and workboat wear: planking, waterline grime, exhaust soot, doors and ports.
m.marking('planks', tags=['hull'], widthM=0.32, lengthM=2.2, contrast=0.07, seam=0.5)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.35, toM=0.38,
          color='exhaustSoot', effect='stain', opacity=0.28, featherM=0.22)
m.marking('slab', tags=['stack'], axis='y', fromM=engine_y + 3.45, toM=engine_y + 4.5,
          color='exhaustSoot', effect='stain', opacity=0.50, featherM=0.20)
for side in (-1, 1):
    for x in (-7.6, -5.8, 8.1, 9.4):
        m.detail('porthole', (x, m.hull_at(x)[2] - 0.72, side * (inside(x) + 0.8)),
                 (0.0, 0.0, float(side)), radius=0.12)
    m.detail('door', (2.2, bridge_y + 0.95, side * 2.25), (0.0, 0.0, float(side)), w=0.68, h=1.72)
    m.detail('ladder', (-0.2, engine_y + 0.9, side * 2.05), (0.0, 0.0, float(side)), h=1.65)
for x in (-4.0, -2.8, 8.2):
    m.detail('hatch', (x, m.hull_at(x)[2] + 1.0, 0.0), (0.0, 1.0, 0.0), w=0.85, h=0.75)

m.export(out)
