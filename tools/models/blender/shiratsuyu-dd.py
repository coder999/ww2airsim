"""Shiratsuyu-class destroyer Samidare, July 1944.
Original work, AGPL-3.0-or-later.

CITED (English Wikipedia, "Shiratsuyu-class destroyer", read 2026-10-11):
  103.5 m between perpendiculars, 107.5 m waterline length, 109.6 m overall,
  9.9 m beam and 3.5 m draft; 34 kn original / 33.3 kn modified speed; two shafts,
  three boilers, 42,000 hp; five Type 3 127 mm/50 guns as 2x2 + 1x1, eight
  610 mm torpedo tubes as 2x4, sixteen Type 93 torpedoes and sixteen depth charges.
  The article says surviving ships lost the single X mount for a triple 25 mm
  mount and eventually carried 13-21 25 mm guns; it also describes the long,
  strongly flared forecastle and compact bridge.
CITED (CombinedFleet Samidare TROM, read 2026-10-11):
  Samidare's X turret was probably removed and replaced by a triple 25 mm mount
  during the 13-19 December 1943 Yokosuka repair period.
CITED / MEASURED (Wikimedia Commons "Fig of IJN DD Samidare in 1944.gif",
  SnowCloudInSummer, July 1944 figure, read and measured 2026-10-11):
  Side and plan silhouettes, gun/torpedo/funnel/bridge/mast order, late-war AA
  distribution and the ensign on the after mast. The 500 px drawing's 50 m bar
  spans 199 px. The ship silhouette spans about 441 px = about 110.8 m, agreeing
  with Wikipedia's 109.6 m overall within the drawing's line/pixel uncertainty.
  The station table, deck sheer, half-beams, superstructure footprints and all
  x positions below are traced from that side/plan figure, then normalized to
  the existing 107.5 m gameplay length.
FITTED (existing content/ships/shiratsuyu-dd.json, kept unchanged except prose):
  The render hull is 107.5 m long rather than Wikipedia's 109.6 m overall because
  the existing simulation hit box and every scenario use 107.5 m. Main-turret
  and late-war AA feet are the existing gameplay locators. Surfaces are fitted
  under those points so the renderer, gun laying and damage model do not change.
ESTIMATE / MODELING CHOICE:
  Section fullness below the waterline; exact deck and superstructure heights;
  hull plating, rail breaks, boats, vents, davits, searchlights, directors,
  radar-array construction, depth-charge racks and every fitting dimension.
  The Type 22 foremast and Type 13 mainmast radar fit follows the class article;
  their exact Samidare July 1944 shapes and heights remain estimates. The two
  surviving Type 3 gun barrels are 6.35 m by cited 50-caliber arithmetic.

Station-table frame: +x bow, +y up, +z starboard; waterline y=0. Stations are
aft of the bow by 107.5-(x+53.75) m. Each row is (x, waterline half-width,
draft, deck-edge y, deck half-width). Full-hull keel is pinned at -3.5 m.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B, DRAFT = 107.5, 9.9, 3.5
EMBED_M = 0.02
GUN_L = 50 * 0.127  # 6.35 m, CITED arithmetic
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

# MEASURED from the 1944 drawing after its 109.6 m outline was normalized to the
# existing 107.5 m spec. A low quarterdeck rises into the long flared forecastle.
STATIONS = [
    (-53.75, 0.18, 2.2, 2.48, 0.45),
    (-49.0, 2.35, 3.0, 2.55, 2.75),
    (-40.0, 3.90, 3.4, 2.80, 4.10),
    (-30.0, 4.75, DRAFT, 2.95, 4.85),
    (-17.0, 4.95, DRAFT, 3.18, 4.95),
    (0.0, 4.95, DRAFT, 3.60, 4.95),
    (18.0, 4.78, DRAFT, 3.92, 4.88),
    (31.0, 4.45, 3.4, 4.25, 4.65),
    (39.0, 3.85, 3.2, 4.42, 4.20),
    (47.0, 2.35, 2.8, 5.65, 3.15),
    (52.0, 0.90, 2.3, 6.55, 1.45),
    (53.75, 0.10, 1.8, 6.85, 0.28),
]
SECTION = (
    (0.0, -1.0), (0.28, -0.97), (0.62, -0.84), (0.86, -0.58),
    (0.98, -0.24), (1.0, 0.0), (1.0, 0.48), (1.0, 1.0),
)


def stand_fn(model):
    def stand(x, length):
        n = max(2, math.ceil(length / 0.25) + 1)
        return min(model.hull_at(x - length / 2 + length * i / (n - 1))[2] - EMBED_M for i in range(n))
    return stand


out, opts = kit.cli_args()
m = kit.Model('shiratsuyu-dd', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck',
                 below_role='antifouling', below_node='Bottom', subdivide=42)
stand = stand_fn(m)
edge = lambda x: m.hull_at(x)[3]  # noqa: E731

# Both surviving low-angle Type 3 gunhouses are real moving kits. The spec points
# remain authoritative; their feet differ from the traced deck by under 0.1 m.
with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('shiratsuyu-dd'):
        if not name.startswith('Turret'):
            continue
        naval.turret(m, name, g['x'], g['y'], g['z'], g['bearingDeg'],
                     (4.65, 3.75, 2.15), 2, GUN_L, 0.10,
                     bag_length=0.55, elevation_deg=5.0)
        if DRY_RUN:
            print(f"MOUNT {name} {g['x']} {g['y']} {g['z']}")

# MEASURED footprint/order, ESTIMATE heights: compact stepped bridge. The first
# tier's roof is the gameplay AA platform at 6.59 m.
bridge_foot = stand(28.0, 9.0)
with m.tagged('bridge'):
    m.rounded_box('superstructure', (28.0, bridge_foot, 0.0), 9.0, 6.9,
                  6.59 - bridge_foot, 1.2, segments=5)
    m.rounded_box('superstructure', (27.0, 6.57, 0.0), 5.2, 5.0, 2.25, 1.0, segments=5)
    m.rounded_box('superstructure', (26.2, 8.80, 0.0), 3.7, 3.7, 1.65, 0.8, segments=5)
with m.tagged('bridgewindows'):
    naval.window_band(m, 27.0, 8.13, 0.0, 5.0, 4.8, 0.95, 0.55, spacing=0.85, segments=5, visor=0.35)
with m.tagged('director'), m.shared_chart():
    naval.director(m, 25.8, 10.43, 0.0, 0.8, (2.0, 1.7, 1.1), 4.2)
    # A shallow bridge-wing slab stands just above the first tier. Keeping its
    # underside off that tier's 6.59 m roof avoids coincident skin faces.
    m.box('superstructure', (28.1, 6.61, 0.0), (3.2, 0.20, 8.1))

# MEASURED two slim, raked funnels. Their casing dimensions and rain caps are estimates.
with m.tagged('funnels'):
    naval.oval_funnel(m, (18.0, stand(18.0, 4.0), 0.0), (16.6, 12.25, 0.0),
                      (1.65, 1.20), (1.25, 1.05), bars=3)
    naval.oval_funnel(m, (7.0, stand(7.0, 4.0), 0.0), (5.8, 11.35, 0.0),
                      (1.55, 1.12), (1.18, 0.98), bars=3)

# Two protected quadruple banks, MEASURED in order and longitudinal placement.
with m.tagged('torpedoes'), m.shared_chart():
    naval.torpedo_mount(m, 10.5, stand(10.5, 5.0), 0.0, 4, 7.8, EMBED_M, shield=True)
    naval.torpedo_mount(m, -10.0, stand(-10.0, 5.0), 0.0, 4, 7.8, EMBED_M, shield=True)
    m.rounded_box('fitting', (-1.0, stand(-1.0, 5.0), 0.0), 5.0, 3.4, 1.7, 0.6)

# Gameplay AA surfaces. Light guns themselves are generated by shipMounts.ts,
# so every piece remains independently trainable/elevating rather than welded.
with m.tagged('aa_platforms'), m.shared_chart():
    naval.platform(m, 1.5, 6.85, 0.0, 4.8, 4.2, rail=True)
    m.strut('superstructure', (1.5, stand(1.5, 1.0), 0.0), (1.5, 6.63, 0.0), 1.0, 0.85, sides=16)
    for side in (-1, 1):
        naval.platform(m, -29.0, 4.77, side * 1.94, 4.0, 2.2, rail=True)
        m.strut('superstructure', (-29.0, stand(-29.0, 0.8), side * 1.94),
                (-29.0, 4.55, side * 1.94), 0.42, sides=10)

# MEASURED mast positions and relative heights; construction and radar shapes estimated.
fore_top = (27.2, 20.1, 0.0)
main_top = (-20.5, 14.6, 0.0)
with m.tagged('masts'), m.shared_chart():
    naval.tripod(m, fore_top, [(24.2, 6.7, -2.2), (24.2, 6.7, 2.2), (29.1, 6.7, 0.0)], 0.13, 0.08)
    m.strut('fitting', (27.2, 14.0, -3.0), (27.2, 14.0, 3.0), 0.06, sides=6)
    m.lattice_mast('fitting', (27.2, 16.0, 0.0), 2.1, 1.8, 0.55, 1, 0.05)
    naval.tripod(m, main_top, [(-18.4, stand(-18.4, 0.4), -1.8), (-18.4, stand(-18.4, 0.4), 1.8), (-22.0, stand(-22.0, 0.4), 0.0)], 0.11, 0.07)
    m.strut('fitting', (-20.5, 11.7, -2.2), (-20.5, 11.7, 2.2), 0.05, sides=6)
    m.lattice_mast('fitting', (-20.5, 12.7, 0.0), 0.75, 0.45, 1.7, 3, 0.04)

with m.tagged('boats'), m.shared_chart():
    for side in (-1, 1):
        naval.boat(m, -2.0, stand(-2.0, 7.0) + 1.1, side * 3.25, 6.8, 1.55, side, davits=True)

with m.tagged('searchlights'), m.shared_chart():
    naval.platform(m, -18.0, 7.1, 0.0, 3.0, 3.0, rail=True)
    naval.searchlight(m, -18.0, 7.1, 0.0, r=0.48)

with m.tagged('stern'), m.shared_chart():
    for side in (-1, 1):
        m.box('fitting', (-47.0, stand(-47.0, 3.2), side * 1.65), (4.2, 0.55 + EMBED_M, 0.65))
        m.tank('fitting', (-43.5, stand(-43.5, 0.6), side * 2.6), 0.30, 0.55 + EMBED_M, segments=12)

with m.tagged('deckfittings'), m.shared_chart():
    naval.capstan(m, 47.0, stand(47.0, 1.0), 0.0, EMBED_M)
    for x in (43.0, -45.0):
        for side in (-1, 1):
            naval.bitts(m, x, stand(x, 1.4), side * max(0.8, edge(x) - 0.8), True, EMBED_M)
    for x in (21.0, 13.0, -5.0, -24.0):
        for side in (-1, 1):
            naval.cowl_vent(m, x, stand(x, 0.5), side * min(3.4, edge(x) - 0.7), 0.0, 1.25, EMBED_M)
    for x in (25.2, 27.3):
        for side in (-1, 1):
            # ESTIMATE: a low-poly Carley ring assembled from four butt-jointed
            # bars. naval.carley_float's crossing cylinders are fine in most
            # views but produce coplanar faces at this compact bridge spacing.
            z = side * (3.55 + 0.18)
            y = bridge_foot + 0.8
            m.box('fitting', (x, y, z), (1.8, 0.16, 0.14))
            m.box('fitting', (x, y + 0.59, z), (1.8, 0.16, 0.14))
            for dx in (-0.82, 0.82):
                m.box('fitting', (x + dx, y + 0.16, z), (0.16, 0.43, 0.14))

gaps = [(-51.0, -43.0), (-32.0, -26.0), (-21.0, -15.0), (-13.5, 14.0), (25.0, 33.0), (35.0, 41.0), (42.0, 45.0)]
with m.tagged('rails'), m.shared_chart():
    for side in (-1, 1):
        for xs in naval.runs(-51.0, 50.0, 2.8, gaps):
            m.railing('fitting', [(x, stand(x, 0.25), side * max(0.15, edge(x) - 0.10)) for x in xs],
                      height=0.88, post_m=1.9)

with m.tagged('rigging'), m.shared_chart():
    for side in (-1, 1):
        m.strut('fitting', (27.2, 18.8, side * 0.12), (22.0, stand(22.0, 0.3) + 0.5, side * (edge(22.0) - 0.25)), 0.012, sides=4)
        m.strut('fitting', (27.2, 14.0, side * 2.8), (-20.5, 14.2, side * 0.18), 0.010, sides=4)
    m.strut('fitting', (27.2, 19.7, 0.0), (49.0, stand(49.0, 0.3) + 0.8, 0.0), 0.012, sides=4)
    m.strut('fitting', (-20.5, 14.3, 0.0), (-48.0, stand(-48.0, 0.3) + 0.7, 0.0), 0.012, sides=4)

m.marking('grid', tags=['hull'], spacingM=[None, 1.45, None], widthM=0.014, depth=0.55)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.55, toM=0.55,
          color='exhaustSoot', effect='stain', opacity=0.28, featherM=0.35)
m.marking('slab', tags=['funnels'], axis='y', fromM=10.6, toM=12.7,
          color='exhaustSoot', effect='stain', opacity=0.52, featherM=0.45)
m.marking('planks', tags=['hull'], widthM=1.83, lengthM=3.6, contrast=0.045, seam=0.42)
for side in (-1, 1):
    for x in [v / 10 for v in range(-445, 380, 23)]:
        if -24.0 < x < 19.0:
            continue
        y = m.hull_at(x)[2] - 0.95
        m.detail('porthole', (x, y, side * (m.hull_at(x)[3] + 1.0)),
                 (0.0, 0.0, float(side)), radius=0.14)
    m.detail('door', (24.5, bridge_foot + 1.05, side * 3.50),
             (0.0, 0.0, float(side)), w=0.7, h=1.75)
    m.detail('ladder', (23.3, bridge_foot + 1.6, side * 3.50),
             (0.0, 0.0, float(side)), h=3.0)
    for x in (25.0, 27.0, 29.0):
        m.detail('porthole', (x, bridge_foot + 1.8, side * 3.50),
                 (0.0, 0.0, float(side)), radius=0.14)
    for x in (18.0, 7.0):
        m.detail('louver', (x, stand(x, 4.0) + 1.2, side * 1.75),
                 (0.0, 0.0, float(side)), w=0.85, h=0.65, slats=5)
for x, z in ((44.0, 0.0), (34.0, 0.0), (-39.0, 0.0), (-24.0, 2.0), (-24.0, -2.0)):
    m.detail('hatch', (x, m.hull_at(x)[2] + 2.0, z), (0.0, 1.0, 0.0), w=0.9, h=0.9)

m.export(out)
