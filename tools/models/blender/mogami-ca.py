"""Mogami-class heavy cruiser, five-turret layout, as Suzuya and Kumano were at Leyte, October 1944.
Original work, AGPL-3.0-or-later (Track M, M1f, 2026-10-09: rebuilt in Blender, replacing the KTKloss
print model, which stays in ASSETS.md as the proportions reference only).

CITED (content/ships/mogami-ca.json's reference, read 2026-09-26 and 2026-10-08):
  200.6 m overall, 20.2 m beam (English Wikipedia "Mogami-class cruiser").
  Five twin 20.3 cm turrets (three forward, the third superfiring; two aft, the first superfiring),
  four twin 12.7 cm Type 89 amidships, and 25 mm Type 96 in triples and singles (Ruling R4 keeps the
  five-turret layout; Mogami herself lost Nos. 4 and 5 in 1943, Suzuya and Kumano kept theirs).
  20.3 cm/50 3rd Year No. 2: 50 calibers of 203 mm = 10.15 m (arithmetic).
  The class silhouette read from the general-arrangement drawings reproduced in English Wikipedia's
  article and from the KTKloss model's proportions: a tall stepped bridge with a tripod foremast close
  abaft it, one large raked funnel with the forward uptakes trunked into it, a tripod mainmast with the
  aircraft crane, two catapults abaft it, and the quarterdeck one deck lower aft of the catapults.
ESTIMATE / modeling choice (no drawing measured):
  every height (deck 6.9-7.3 m amidships, 10.6 m at the stem, 4.9 m on the quarterdeck), the station
  table and section, the bridge tiers, the funnel's rake and size, mast heights, gunhouse sizes;
  four triple 61 cm torpedo mounts drawn on the upper deck abreast the after shelter deck (the class
  carried four triple mounts; their exact stations are not read); the 12.7 cm mounts stand on
  pedestals abreast the funnel; every 25 mm position (content/ships/mogami-ca.json).
  Paint: the ijn palette (Kure gray), linoleum decks with dark brass edging, as Kagero (M1c).
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B = 200.6, 20.2
EMBED_M = 0.02
SUBDIVIDE = 10
STEP_X = -40.0  # the forecastle deck ends here; the quarterdeck aft of it is one deck lower
# (x, waterline half-beam, draft, deck-edge height, deck-edge half-beam); a waterline model (shallow bottom).
STATIONS = [
    (-L / 2, 1.6, 0.5, 5.2, 3.0), (-92.0, 6.2, 0.5, 5.0, 7.0), (-75.0, 9.2, 0.55, 4.9, 9.1),
    (-55.0, 10.1, 0.55, 4.9, 9.6), (STEP_X - 0.35, 10.1, 0.55, 4.9, 9.6), (STEP_X, 10.1, 0.55, 7.0, 9.6),
    (10.0, 10.1, 0.55, 6.9, 9.6), (40.0, 9.9, 0.55, 7.3, 9.5), (60.0, 8.6, 0.5, 8.0, 8.9),
    (80.0, 5.6, 0.5, 9.2, 6.6), (L / 2, 0.4, 0.45, 10.6, 1.0),
]
# A bulged midbody: widest at the waterline, tumbling home to the deck edge (ESTIMATE).
SECTION = ((0.0, -1.0), (0.8, -0.9), (1.0, -0.4), (1.0, 0.0), (1.0, 0.35), (0.96, 0.7), (1.0, 1.0))
GUN_L = 50 * 0.203
TURRET_BODY = (8.6, 6.8, 2.7)
RISE = {'Turret2': 1.2, 'Turret3': 4.4, 'Turret4': 3.6}  # barbettes above the deck under them
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

out, opts = kit.cli_args()
m = kit.Model('mogami-ca', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
stand = naval.stander(m, EMBED_M)
deck = lambda x: m.hull_at(x)[2] - EMBED_M  # noqa: E731
inside = lambda x: m.hull_at(x)[3]          # noqa: E731

with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('mogami-ca'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if name.startswith('Turret'):
            rise = RISE.get(name, 0.0)
            y = stand(x, 7.6 if rise else TURRET_BODY[0])
            if rise:
                m.tank('fitting', (x, y, z), 3.6, rise + EMBED_M, segments=40)
            y += rise
            naval.turret(m, name, x, y, z, b, TURRET_BODY, 2, GUN_L, 0.2, bag_length=0.7)
            f = 1 if round(b) == 0 else -1
            m.box('fitting', (x - f * 2.6, y + TURRET_BODY[2] - 0.6, 0.0), (1.2, 0.8, 7.6), node=name)  # rangefinder ears
        elif g['kit'] in naval.MOUNTS:
            y = stand(x, 3.6) if abs(z) < 5.5 else stand(x, 3.6) + 1.6  # 12.7 cm on 1.6 m pedestals
            if abs(z) >= 5.5:
                m.tank('fitting', (x, y - 1.6 - EMBED_M, z), 2.0, 1.6 + 2 * EMBED_M, segments=32)
            naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        else:
            continue
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 3)} {z}')

# --- The bridge: four stepped tiers, wings, the compass bridge's windows, the Type 94 director on top.
s0 = stand(31.2, 14.5)
y1 = s0 + 3.0 + EMBED_M
y2 = y1 - EMBED_M + 2.8
y3 = y2 - EMBED_M + 2.6
y4 = y3 - EMBED_M + 2.4
with m.tagged('bridge'):
    m.rounded_box('superstructure', (31.2, s0, 0.0), 14.5, 11.0, 3.0 + EMBED_M, 2.0)
    m.rounded_box('superstructure', (31.7, y1 - EMBED_M, 0.0), 12.0, 9.2, 2.8, 2.2)
    m.rounded_box('superstructure', (32.3, y2 - EMBED_M, 0.0), 9.4, 7.6, 2.6, 2.6)
    m.rounded_box('superstructure', (31.4, y3 - EMBED_M, 0.0), 6.0, 5.2, 2.4, 1.6)
with m.tagged('bridgefittings'), m.shared_chart():
    naval.window_band(m, 32.3, y2 + 1.1, 0.0, 9.4, 7.6, 2.6, 0.9, spacing=0.9)  # the compass bridge
    naval.window_band(m, 31.4, y3 + 1.1, 0.0, 6.0, 5.2, 1.6, 0.7, spacing=0.9, visor=0.3)  # the director tower's
    naval.window_band(m, 31.7, y1 + 1.2, 0.0, 12.0, 9.2, 2.2, 0.5, spacing=1.6, visor=0.0)  # the lower bridge's ports
    m.box('superstructure', (34.6, y1 - 0.25, 0.0), (3.2, 0.25 + EMBED_M, 15.0))  # lower wings
    m.box('superstructure', (35.4, y2 - 0.22, 0.0), (2.4, 0.22 + EMBED_M, 12.4))  # upper wings
    top = naval.director(m, 31.0, y4 - EMBED_M, 0.0, 1.3, (3.4, 3.0, 1.9), 6.0)
    for s in (-1, 1):  # 12 cm high-angle binoculars and the 1.5 m rangefinders on the wings
        m.tank('fitting', (35.4, y2 - EMBED_M, s * 5.6), 0.35, 1.1, segments=12)
        m.gun_barrel('fitting', (34.8, y1 + 0.6, s * 7.0), -90.0, 0.0, 1.5, 0.12, 0.12, 8)
    naval.searchlight(m, 27.95, y3 - EMBED_M, 1.8)
    naval.searchlight(m, 27.95, y3 - EMBED_M, -1.8)

# --- The shelter deck amidships, the funnel on it, the 12.7 cm mounts abreast.
sh = stand(3.5, 39.0)
sh_top = sh + 2.5 + EMBED_M
with m.tagged('shelter'):
    m.rounded_box('superstructure', (3.5, sh, 0.0), 39.0, 11.2, 2.5 + EMBED_M, 1.4)
# --- The foremast: a tripod close abaft the bridge, the Type 21 array and a yard at its top.
fore_top = (24.6, y4 + 9.0, 0.0)
with m.tagged('foremast'), m.shared_chart():
    naval.tripod(m, fore_top, [(28.2, y3 - EMBED_M, 0.0), (22.2, sh_top - EMBED_M, -2.8), (22.2, sh_top - EMBED_M, 2.8)], 0.32, 0.22)
    naval.platform(m, fore_top[0], fore_top[1] - 2.0, 0.0, 2.6, 2.6)
    m.lattice_mast('fitting', (fore_top[0], fore_top[1] - 2.0, 0.0), 2.2, 2.2, 1.4, 1, 0.06)  # Type 21 array
    m.strut('fitting', (fore_top[0] - 0.1, fore_top[1] - 3.2, -5.0), (fore_top[0] - 0.1, fore_top[1] - 3.2, 5.0), 0.1, sides=6)  # yard
    m.strut('fitting', fore_top, (fore_top[0] - 0.2, fore_top[1] + 4.0, 0.0), 0.12, 0.07, sides=6)  # topmast

with m.tagged('funnel'):
    # One big raked funnel; the forward uptakes trunked into it from ahead (the class's signature).
    # One big oblong funnel (two raked casings side by side fore and aft, read as one), the forward
    # uptakes trunked into its front low down (the class's signature).
    naval.oval_funnel(m, (9.3, sh_top - 0.3, 0.0), (4.7, 22.4, 0.0), (4.0, 2.8), (3.7, 2.5), bars=4)
    naval.oval_loft(m, 'superstructure', (15.0, sh_top - 0.25, 0.0), (9.0, 15.0, 0.0), (2.2, 1.9), (1.6, 1.7), 3.0, 32, 2)  # ends inside the funnel
with m.tagged('funnelfittings'), m.shared_chart():
    m.strut('fitting', (2.2, sh_top - EMBED_M, 2.4), (1.0, 22.0, 1.6), 0.18, sides=8)  # steam pipes up the funnel's after face
    m.strut('fitting', (2.2, sh_top - EMBED_M, -2.4), (1.0, 22.0, -1.6), 0.18, sides=8)
    for s in (-1, 1):  # searchlight platforms on struts either side of the funnel
        py = sh_top + 4.6
        naval.platform(m, 0.2, py, s * 3.6, 2.6, 2.6)
        for dx in (-0.9, 0.9):
            m.strut('fitting', (0.2 + dx, sh_top - EMBED_M, s * 3.6), (0.2 + dx, py - 0.2, s * 3.6), 0.12, sides=6)
        naval.searchlight(m, 0.2, py - EMBED_M, s * 3.6)
with m.tagged('boats'), m.shared_chart():
    for s in (-1, 1):
        naval.boat(m, -5.6, sh_top - EMBED_M + 0.1, s * 3.4, 8.0, 2.2, s)

# --- Torpedo mounts on the upper deck abreast the shelter deck's after end.
with m.tagged('torpedo'), m.shared_chart():
    for tx in (-9.0, -19.5):
        for s in (-1, 1):
            naval.torpedo_mount(m, tx, stand(tx, 4.0), s * 7.5, 3, 8.4, EMBED_M)

# --- The mainmast tripod, its gaff (the ensign's halyard, M1f F2) and the aircraft crane; two catapults.
main_top = (-21.0, 25.5, 0.0)
with m.tagged('mainmast'), m.shared_chart():
    naval.tripod(m, main_top, [(-19.0, stand(-19.0, 1.0), 0.0), (-23.4, stand(-23.4, 1.0), -2.6), (-23.4, stand(-23.4, 1.0), 2.6)], 0.3, 0.2)
    m.strut('fitting', (-21.1, 23.2, 0.0), (-24.6, 24.4, 0.0), 0.08, sides=6)  # gaff
    m.strut('fitting', (-21.0, 22.0, -3.2), (-21.0, 22.0, 3.2), 0.08, sides=6)  # yard
    naval.crane(m, (-21.0, stand(-21.0, 1.0), 0.0), 11.0, (-33.0, 15.5, 0.0))
    m.lattice_mast('fitting', (main_top[0], main_top[1] - 0.1, 0.0), 0.7, 0.5, 1.6, 2, 0.04)  # Type 13 ladder array
with m.tagged('catapults'), m.shared_chart():
    for s in (-1, 1):
        naval.catapult(m, -33.5, stand(-33.5, 3.2), s * 4.6, 12.0, s * -8.0, EMBED_M)

# --- Deck fittings.
with m.tagged('deckfittings'), m.shared_chart():
    for cx in (86.0, 90.0):
        naval.capstan(m, cx, stand(cx, 1.3), 0.0, EMBED_M)
    for bx in (80.0, 92.0, -82.0, -92.0):
        for side in (-1, 1):
            naval.bitts(m, bx, stand(bx, 1.4), side * (inside(bx) - 1.2), True, EMBED_M)
    for vx, vz in ((58.0, 6.0), (-44.0, 6.5), (-80.0, 5.0)):
        for side in (-1, 1):
            naval.cowl_vent(m, vx, stand(vx, 0.5), side * vz, 180.0 if vx > 0 else 0.0, 1.6, EMBED_M)
    for fx in (-2.0, 6.0, 12.0):
        for side in (-1, 1):
            naval.carley_float(m, fx, sh + 0.7, side * 5.62, 2.2, side)
    m.strut('fitting', (L / 2 - 1.2, deck(L / 2 - 1.2), 0.0), (L / 2 - 0.9, deck(L / 2 - 1.2) + 4.0, 0.0), 0.08, sides=6)  # jackstaff
    m.strut('fitting', (-L / 2 + 1.5, deck(-L / 2 + 1.5), 0.0), (-L / 2 + 1.1, deck(-L / 2 + 1.5) + 5.0, 0.0), 0.08, sides=6)  # flagstaff
with m.tagged('anchors'), m.shared_chart():
    for s in (-1, 1):
        ax = 88.0
        m.box('dark', (ax, deck(ax) - 1.9, s * (m.hull_at(ax)[3] + 0.05)), (1.4, 1.6, 0.25))

# --- Railings: the deck edge, broken at the mounts, bitts and the step; the bridge and shelter roofs.
GAPS = [(STEP_X - 1.0, STEP_X + 1.0)]
GAPS += [(bx - 1.2, bx + 1.2) for bx in (80.0, 92.0, -82.0, -92.0)]
GAPS += [(g['x'] - 2.2, g['x'] + 2.2) for _, g in naval.armament('mogami-ca') if abs(g['z']) > 6.5 and 'run' not in g]
GAPS += [(g['x'] - g['run'] / 2 - 0.8, g['x'] + g['run'] / 2 + 0.8) for _, g in naval.armament('mogami-ca') if 'run' in g]
with m.tagged('rails'), m.shared_chart():
    for side in (-1, 1):
        for xs in naval.runs(-L / 2 + 2.0, L / 2 - 4.0, 4.0, GAPS):
            m.railing('fitting', [(x, deck(x) + EMBED_M, side * (inside(x) - 0.12)) for x in xs], height=0.95, post_m=2.2)
        m.railing('fitting', [(x, sh_top - EMBED_M, side * 5.45) for x in (-15.0, -9.0, -3.0)], height=0.9, post_m=2.0)
        m.railing('fitting', [(x, y1 - EMBED_M, side * 5.35) for x in (24.6, 26.0)], height=0.9, post_m=1.4)
        m.railing('fitting', [(35.9, y1 - EMBED_M + 0.01, side * 7.4), (33.1, y1 - EMBED_M + 0.01, side * 7.4)], height=0.9, post_m=1.4)  # wing ends
        m.railing('fitting', [(36.5, y2 - EMBED_M + 0.01, side * 6.1), (34.3, y2 - EMBED_M + 0.01, side * 6.1)], height=0.9, post_m=1.2)
        m.railing('fitting', [(36.6, y3 - EMBED_M, side * 3.55), (34.8, y3 - EMBED_M, side * 3.55), (28.4, y3 - EMBED_M, side * 3.55)], height=0.9, post_m=1.4)
        m.railing('fitting', [(33.6, y4 - EMBED_M, side * 2.35), (29.2, y4 - EMBED_M, side * 2.35)], height=0.9, post_m=1.2)
with m.tagged('rigging'), m.shared_chart():
    m.strut('fitting', (fore_top[0] + 0.3, fore_top[1] + 3.0, 0.0), (L / 2 - 1.0, deck(L / 2 - 1.2) + 3.8, 0.0), 0.02, sides=4)  # forestay
    m.strut('fitting', (main_top[0], main_top[1] + 0.8, 0.0), (-L / 2 + 1.2, deck(-L / 2 + 1.5) + 4.8, 0.0), 0.02, sides=4)  # backstay
    for side in (-1, 1):
        m.strut('fitting', (fore_top[0] - 0.1, fore_top[1] - 3.2, side * 4.6), (main_top[0], main_top[1] - 3.5, side * 2.9), 0.015, sides=4)  # antennas
        m.strut('fitting', (fore_top[0], fore_top[1] - 0.5, side * 0.3), (22.0, sh_top - EMBED_M + 0.05, side * 5.0), 0.02, sides=4)  # shrouds
        m.strut('fitting', (main_top[0], main_top[1] - 0.5, side * 0.3), (-26.0, deck(-26.0) + 0.6, side * (inside(-26.0) - 0.6)), 0.02, sides=4)

# --- Bake detail: portholes, the deck-edge bar, doors, ladders, hatches, louvers.
for side in (-1, 1):
    zo = side * 20.0
    for x in [x / 10 for x in range(-940, 960, 26)]:
        if -30 < x < 25:
            continue  # amidships: the machinery spaces had none
        for row, dy in enumerate((1.4, 3.3)):
            y = m.hull_at(x)[2] - dy
            if y > 1.2 and not (row == 1 and x < STEP_X):
                m.detail('porthole', (x, y, side * (m.hull_at(x)[3] + 2.0)), (0.0, 0.0, float(side)), radius=0.19)
    for x0 in range(-98, 96, 14):
        if x0 < STEP_X < x0 + 14:
            continue
        m.detail('strip', (x0, deck(x0) - 0.1, side * (inside(x0) + 2.0)), (0.0, 0.0, float(side)),
                 to=[x0 + 14.0, deck(x0 + 14.0) - 0.1, side * (inside(x0 + 14.0) + 2.0)], width=0.14, proud=0.035)
    for x in (27.0, 36.0):
        m.detail('door', (x, s0 + 1.05, side * 5.5), (0.0, 0.0, float(side)), w=0.8, h=1.9)
    m.detail('ladder', (25.4, s0 + 1.6, side * 5.5), (0.0, 0.0, float(side)), h=3.0)
    for x in (29.0, 31.0, 33.0):
        m.detail('porthole', (x, y1 + 1.4, side * 4.6), (0.0, 0.0, float(side)), radius=0.17)
    for x in (-12.0, -3.0, 18.0):
        m.detail('door', (x, sh + 1.05, side * 5.6), (0.0, 0.0, float(side)), w=0.8, h=1.9)
    for x in (-8.0, 0.0, 14.0, 20.0):
        m.detail('louver', (x, sh + 1.5, side * 5.6), (0.0, 0.0, float(side)), w=1.4, h=0.8, slats=5)
for x, z in ((74.0, 0.0), (62.0, 3.0), (62.0, -3.0), (-66.0, 0.0), (-76.0, 3.0), (-76.0, -3.0), (-84.0, 0.0)):
    m.detail('hatch', (x, deck(x) + 2.0, z), (0.0, 1.0, 0.0), w=1.4, h=1.4)

# --- Paint: strakes, linoleum, grime, rust; soot on the funnel's top.
m.marking('grid', tags=['hull'], spacingM=[None, 1.7, None], widthM=0.02, depth=0.6)
m.marking('planks', tags=['hull'], widthM=1.83, lengthM=3.6, contrast=0.05, seam=0.45)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.8, color='exhaustSoot', effect='stain', opacity=0.32, featherM=0.5)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(88.0, 0.0, s * 6.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.6, 8.6), (0.6, 8.6), (1.3, 2.4), (-1.1, 2.8)], color='rustStain', effect='stain', opacity=0.3, featherM=0.4)
    for k, x in enumerate([x / 10 for x in range(-940, 960, 26)]):
        if -30 < x < 25 or k % 3:
            continue
        y = m.hull_at(x)[2] - 1.4
        if y > 1.2:
            m.marking('polygon', tags=['hull'], origin=(x, 0.0, s * 12.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                      points=[(s * -0.07, y - 0.25), (s * 0.07, y - 0.25), (s * 0.12, y - 1.6), (s * -0.05, y - 1.3)],
                      color='rustStain', effect='stain', opacity=0.35, featherM=0.1)
m.marking('slab', tags=['funnel'], axis='y', fromM=20.2, toM=23.0, color='exhaustSoot', effect='stain', opacity=0.6, featherM=0.6)
m.export(out)
