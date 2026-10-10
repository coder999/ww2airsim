"""Nagara-class light cruiser: Abukuma as at Surigao Strait, 25 October 1944 (Shima's force).
Original work, AGPL-3.0-or-later (Track M, M1f Ruling F3, 2026-10-09).

CITED (content/ships/abukuma-cl.json's reference; English Wikipedia "Japanese cruiser Abukuma", read
2026-10-09):
  162.1 m overall, 14.2 m beam. By mid-1944: five 14 cm/50 3rd Year Type singles (Nos. 5 and 7
  removed), a twin 12.7 cm Type 89 in No. 7's place on the stern, two quadruple 61 cm torpedo mounts
  aft of the funnels, one catapult abaft them, Type 21 and Type 22 radars.
  14 cm/50: 50 calibers of 140 mm = 7.0 m (arithmetic).
  The class silhouette (the 5,500-ton cruisers' general-arrangement drawings in English Wikipedia's
  "Nagara-class cruiser"): a raised forecastle carrying Nos. 1 and 2 on the centerline and Nos. 3 and
  4 abreast a tall narrow bridge with its tripod foremast; three raked funnels; a pole mainmast with
  a derrick; No. 6 on the quarterdeck.
ESTIMATE / modeling choice (no drawing measured):
  every height (the forecastle deck 7.6-9.6 m, the main deck 5.0-5.4 m), the station table, the
  bridge's tiers, the funnels' size and rake, mast heights, the shield sizes, the torpedo mounts'
  and catapult's stations; every 25 mm position (content/ships/abukuma-cl.json). Paint: the ijn palette
  (Kure gray), linoleum decks with dark brass edging, as Kagero (M1c).
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B = 162.1, 14.2
EMBED_M = 0.02
SUBDIVIDE = 10
STEP_X = 30.0  # the forecastle deck ends here; the main deck aft of it is one deck lower
STATIONS = [
    (-L / 2, 0.8, 0.5, 5.0, 2.0), (-70.0, 4.6, 0.5, 5.0, 5.2), (-50.0, 6.6, 0.55, 5.1, 6.7),
    (STEP_X - 0.4, B / 2, 0.55, 5.4, 7.0), (STEP_X, B / 2, 0.55, 7.6, 7.0), (50.0, 6.4, 0.5, 8.0, 6.6),
    (68.0, 3.6, 0.5, 8.8, 4.4), (L / 2, 0.3, 0.45, 9.6, 0.8),
]
SECTION = ((0.0, -1.0), (0.8, -0.9), (1.0, -0.4), (1.0, 0.0), (1.0, 0.4), (1.0, 1.0))
GUN_L = 50 * 0.14
SHIELD = (5.0, 3.6, 2.4)
RISE = {'Turret2': 2.0}
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

out, opts = kit.cli_args()
m = kit.Model('abukuma-cl', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
stand = naval.stander(m, EMBED_M)
deck = lambda x: m.hull_at(x)[2] - EMBED_M  # noqa: E731
inside = lambda x: m.hull_at(x)[3]          # noqa: E731

with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('abukuma-cl'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if name.startswith('Turret'):
            rise = RISE.get(name, 0.0)
            y = stand(x, 4.4 if rise else SHIELD[0])
            if rise:
                m.tank('fitting', (x, y, z), 2.2, rise + EMBED_M, segments=32)
            y += rise
            naval.turret(m, name, x, y, z, b, SHIELD, 1, GUN_L, 0.11, bag_length=0.0, elevation_deg=3.0)
        elif g['kit'] in naval.MOUNTS:
            y = stand(x, 3.6)
            naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        else:
            continue
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 3)} {z}')

# --- The bridge: three narrow tiers on the forecastle, wings, windows; the director and Type 22 on top.
s0 = stand(37.5, 9.0)
b1 = s0 + 2.6 + EMBED_M
b2 = b1 - EMBED_M + 2.4
b3 = b2 - EMBED_M + 2.2
with m.tagged('bridge'):
    m.rounded_box('superstructure', (37.5, s0, 0.0), 9.0, 5.6, 2.6 + EMBED_M, 1.4)
    m.rounded_box('superstructure', (37.8, b1 - EMBED_M, 0.0), 7.6, 5.2, 2.4, 1.6)
    m.rounded_box('superstructure', (38.2, b2 - EMBED_M, 0.0), 5.6, 5.0, 2.2, 1.8)
with m.tagged('bridgefittings'), m.shared_chart():
    naval.window_band(m, 38.2, b2 + 0.9, 0.0, 5.6, 5.0, 1.8, 0.8, spacing=0.8)  # the compass bridge
    naval.window_band(m, 37.8, b1 + 1.1, 0.0, 7.6, 5.2, 1.6, 0.45, spacing=1.2, visor=0.0)
    m.box('superstructure', (39.6, b2 - 0.22, 0.0), (2.0, 0.27 + EMBED_M, 9.6))  # wings, 0.05 m proud
    top = naval.director(m, 37.6, b3 - EMBED_M, 0.0, 0.8, (2.4, 2.2, 1.5), 3.5)
    for s in (-1, 1):
        m.box('fitting', (40.2, b3 + 0.4, s * 1.4), (0.5, 0.8, 0.5))  # the Type 22's horns
        m.tank('fitting', (39.8, b2 + 0.05, s * 4.2), 0.25, 0.9, segments=12)  # binoculars on the wings
    fore_top = (34.6, b3 + 10.0, 0.0)
    naval.tripod(m, fore_top, [(36.2, b3 - EMBED_M, 0.0), (32.2, stand(32.2, 0.4), -2.0), (32.2, stand(32.2, 0.4), 2.0)], 0.24, 0.16)
    naval.platform(m, fore_top[0], fore_top[1] - 2.0, 0.0, 2.6, 2.6)
    m.lattice_mast('fitting', (fore_top[0], fore_top[1] - 2.0, 0.0), 1.8, 1.8, 1.2, 1, 0.05)  # Type 21 array
    m.strut('fitting', (fore_top[0], fore_top[1] - 3.0, -3.6), (fore_top[0], fore_top[1] - 3.0, 3.6), 0.07, sides=6)  # yard
    m.strut('fitting', fore_top, (fore_top[0] - 0.1, fore_top[1] + 3.0, 0.0), 0.1, 0.06, sides=6)  # topmast

# --- The shelter deck, three raked funnels on it, boats and the searchlight between them.
sh = stand(11.0, 34.0)
sh_top = sh + 2.2 + EMBED_M
with m.tagged('shelter'):
    m.rounded_box('superstructure', (11.0, sh, 0.0), 34.0, 6.8, 2.2 + EMBED_M, 1.2)
with m.tagged('funnels'):
    for fx, top_y in ((23.0, 19.0), (13.0, 18.6), (3.0, 18.2)):
        naval.oval_funnel(m, (fx, sh_top - 0.3, 0.0), (fx - 2.6, top_y, 0.0), (2.2, 1.6), (2.0, 1.5), bars=2)
with m.tagged('funnelfittings'), m.shared_chart():
    for s in (-1, 1):
        for bx, bl in ((17.6, 5.2), (7.6, 5.0)):
            naval.boat(m, bx, sh_top + 0.06, s * 2.6, bl, 1.5, s, davits=False)
    m.strut('fitting', (8.0, sh_top - EMBED_M, 0.0), (8.0, sh_top + 3.8, 0.0), 0.18, sides=8)
    naval.platform(m, 8.0, sh_top + 4.0, 0.0, 1.8, 2.2)
    naval.searchlight(m, 8.0, sh_top + 4.0 - EMBED_M, 0.0)
    for fx in (23.0, 13.0, 3.0):  # steam pipes up each funnel's after face
        m.strut('fitting', (fx - 2.4, sh_top - EMBED_M, 0.0), (fx - 4.8, 17.6, 0.0), 0.1, sides=6)

# --- The torpedo mounts, the mainmast with its derrick and gaff, the catapult.
with m.tagged('torpedo'), m.shared_chart():
    for s in (-1, 1):
        naval.torpedo_mount(m, -11.0, stand(-11.0, 3.6), s * 4.6, 4, 8.4, EMBED_M)
main_top = (-20.6, 21.5, 0.0)
with m.tagged('mainmast'), m.shared_chart():
    m.strut('fitting', (-20.0, stand(-20.0, 0.6), 0.0), main_top, 0.26, 0.14, sides=8)
    m.strut('fitting', (-20.5, 19.6, 0.0), (-23.4, 20.8, 0.0), 0.07, sides=6)  # gaff
    m.strut('fitting', (-20.4, 18.4, -2.8), (-20.4, 18.4, 2.8), 0.07, sides=6)  # yard
    naval.crane(m, (-20.0, stand(-20.0, 0.6), 0.0), 8.0, (-30.0, 11.0, 0.0), r=0.26)  # the derrick
with m.tagged('catapult'), m.shared_chart():
    naval.catapult(m, -38.0, stand(-38.0, 3.2), 0.0, 14.0, 0.0, EMBED_M)

with m.tagged('deckfittings'), m.shared_chart():
    for cx in (70.0, 73.0):
        naval.capstan(m, cx, stand(cx, 1.1), 0.0, EMBED_M)
    for bx in (64.0, 76.0, -58.0, -72.0):
        for side in (-1, 1):
            naval.bitts(m, bx, stand(bx, 1.4), side * (inside(bx) - 0.9), True, EMBED_M)
    for vx, vz in ((52.0, 3.4), (-30.0, 4.4), (-60.0, 3.6)):
        for side in (-1, 1):
            naval.cowl_vent(m, vx, stand(vx, 0.5), side * vz, 180.0 if vx > 0 else 0.0, 1.3, EMBED_M)
    for fx in (-2.0, 1.5, 15.0, 20.5):
        for side in (-1, 1):
            naval.carley_float(m, fx, sh + 0.6, side * 3.42, 1.8, side)
    m.strut('fitting', (L / 2 - 1.0, deck(L / 2 - 1.0), 0.0), (L / 2 - 0.8, deck(L / 2 - 1.0) + 3.4, 0.0), 0.07, sides=6)  # jackstaff
    m.strut('fitting', (-L / 2 + 1.4, deck(-L / 2 + 1.4), 0.0), (-L / 2 + 1.1, deck(-L / 2 + 1.4) + 4.0, 0.0), 0.07, sides=6)  # flagstaff
with m.tagged('anchors'), m.shared_chart():
    for s in (-1, 1):
        ax = 72.0
        m.box('dark', (ax, deck(ax) - 1.7, s * (m.hull_at(ax)[3] + 0.05)), (1.2, 1.4, 0.22))

GAPS = [(STEP_X - 1.0, STEP_X + 1.0)]
GAPS += [(bx - 1.2, bx + 1.2) for bx in (64.0, 76.0, -58.0, -72.0)]
GAPS += [(g['x'] - 1.8, g['x'] + 1.8) for _, g in naval.armament('abukuma-cl') if abs(g['z']) > 3.0]
with m.tagged('rails'), m.shared_chart():
    for side in (-1, 1):
        for xs in naval.runs(-L / 2 + 1.8, L / 2 - 3.0, 3.0, GAPS):
            m.railing('fitting', [(x, deck(x) + EMBED_M, side * (inside(x) - 0.1)) for x in xs], height=0.9, post_m=2.0)
        m.railing('fitting', [(x, sh_top - EMBED_M, side * 3.3) for x in (-5.0, -1.0, 1.0)], height=0.9, post_m=1.6)
        m.railing('fitting', [(40.4, b2 - EMBED_M + 0.06, side * 4.7), (38.8, b2 - EMBED_M + 0.06, side * 4.7)], height=0.9, post_m=1.0)
with m.tagged('rigging'), m.shared_chart():
    m.strut('fitting', (fore_top[0], fore_top[1] + 2.6, 0.0), (L / 2 - 0.9, deck(L / 2 - 1.0) + 3.2, 0.0), 0.015, sides=4)  # forestay
    m.strut('fitting', main_top, (-L / 2 + 1.2, deck(-L / 2 + 1.4) + 3.8, 0.0), 0.015, sides=4)  # backstay
    for side in (-1, 1):
        m.strut('fitting', (fore_top[0], fore_top[1] - 3.0, side * 3.4), (main_top[0], main_top[1] - 3.1, side * 2.6), 0.012, sides=4)  # antennas
        m.strut('fitting', (main_top[0], main_top[1] - 0.6, side * 0.2), (-23.0, deck(-23.0) + 0.6, side * (inside(-23.0) - 0.4)), 0.015, sides=4)

# --- Bake detail.
for side in (-1, 1):
    for x in [x / 10 for x in range(-760, 760, 22)]:
        if -25 < x < 26:
            continue
        for row, dy in enumerate((1.3, 3.2)):
            y = m.hull_at(x)[2] - dy
            if y > 1.1 and not (row == 1 and x < STEP_X):
                m.detail('porthole', (x, y, side * (m.hull_at(x)[3] + 1.5)), (0.0, 0.0, float(side)), radius=0.17)
    for x0 in range(-78, 66, 12):
        if x0 < STEP_X < x0 + 12:
            continue
        m.detail('strip', (x0, deck(x0) - 0.08, side * (inside(x0) + 1.5)), (0.0, 0.0, float(side)),
                 to=[x0 + 12.0, deck(x0 + 12.0) - 0.08, side * (inside(x0 + 12.0) + 1.5)], width=0.12, proud=0.03)
    m.detail('door', (35.0, s0 + 1.0, side * 2.8), (0.0, 0.0, float(side)), w=0.7, h=1.8)
    m.detail('ladder', (33.6, s0 + 1.5, side * 2.8), (0.0, 0.0, float(side)), h=2.8)
    for x in (-3.0, 10.0, 26.0):
        m.detail('door', (x, sh + 1.0, side * 3.4), (0.0, 0.0, float(side)), w=0.7, h=1.8)
    for x in (0.0, 18.0):
        m.detail('louver', (x, sh + 1.3, side * 3.4), (0.0, 0.0, float(side)), w=1.2, h=0.7, slats=5)
for x, z in ((62.0, 0.0), (44.0, 2.2), (44.0, -2.2), (-46.0, 0.0), (-62.0, 2.0), (-62.0, -2.0)):
    m.detail('hatch', (x, deck(x) + 2.0, z), (0.0, 1.0, 0.0), w=1.1, h=1.1)

# --- Paint.
m.marking('grid', tags=['hull'], spacingM=[None, 1.5, None], widthM=0.016, depth=0.6)
m.marking('planks', tags=['hull'], widthM=1.83, lengthM=3.6, contrast=0.05, seam=0.45)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.6, color='exhaustSoot', effect='stain', opacity=0.3, featherM=0.4)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(72.0, 0.0, s * 4.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.5, 7.8), (0.5, 7.8), (1.0, 2.6), (-0.9, 2.9)], color='rustStain', effect='stain', opacity=0.3, featherM=0.3)
m.marking('slab', tags=['funnels'], axis='y', fromM=16.8, toM=19.4, color='exhaustSoot', effect='stain', opacity=0.6, featherM=0.6)
m.export(out)
