"""Cleveland-class light cruiser, as the class was in late 1944.
Original work, AGPL-3.0-or-later (Track M, M1f, 2026-10-09: rebuilt in Blender, replacing the KTKloss
print model, which stays in ASSETS.md as the proportions reference only).

CITED (content/ships/cleveland-cl.json's reference):
  185.95 m overall, 20.22 m beam; four triple 6"/47 turrets (two forward, two aft, the inner pair
  superfiring), six twin 5"/38 (one superfiring forward on the centerline, two pairs abreast, one aft
  on the centerline), and the 40 mm and 20 mm fit the spec carries.
  6"/47 Mk 16: 47 calibers of 6 in (0.1524 m) = 7.16 m (arithmetic).
  The class silhouette read from the general-arrangement drawings in English Wikipedia's article: a
  stepped forward superstructure with the pilot house, open bridge and Mk 37 director; a tripod
  foremast; two upright funnels close together; a pole mainmast; the after Mk 37; a flush deck with a
  square stern carrying two catapults and a crane over the hangar.
ESTIMATE / modeling choice (no drawing measured):
  every height (the deck 10.6 m at the stem, 8.2 m amidships, 7.6 m at the stern), the station table
  and section, the superstructure's blocks, funnel and mast sizes, gunhouse sizes; every 40 mm and
  20 mm position (content/ships/cleveland-cl.json). Paint: the usn-1944 palette; teak decks.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B = 185.95, 20.22
EMBED_M = 0.02
SUBDIVIDE = 10
STATIONS = [
    (-L / 2, 7.0, 0.5, 7.6, 7.4), (-80.0, 8.8, 0.55, 7.7, 9.0), (-60.0, 10.11, 0.55, 7.9, 9.9),
    (0.0, 10.11, 0.55, 8.2, 9.9), (35.0, 9.9, 0.55, 8.6, 9.8), (55.0, 8.6, 0.5, 9.2, 9.0),
    (75.0, 5.6, 0.5, 10.0, 6.4), (L / 2, 0.4, 0.45, 10.6, 1.0),
]
SECTION = ((0.0, -1.0), (0.8, -0.9), (1.0, -0.4), (1.0, 0.0), (1.0, 0.4), (1.0, 1.0))
GUN_L = 47 * 0.1524
TURRET_BODY = (9.2, 8.4, 3.0)
RISE = {'Turret2': 2.8, 'Turret3': 2.8}
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

out, opts = kit.cli_args()
m = kit.Model('cleveland-cl', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
stand = naval.stander(m, EMBED_M)
deck = lambda x: m.hull_at(x)[2] - EMBED_M  # noqa: E731
inside = lambda x: m.hull_at(x)[3]          # noqa: E731

# --- Superstructure: the midships deckhouse (x -34..15) carrying the funnels; the forward block (x 14..39).
ms = stand(-9.5, 49.0)
mr = ms + 2.6 + EMBED_M   # the midships deckhouse's roof
f0 = stand(26.5, 25.0)
f1 = f0 + 2.8 + EMBED_M   # the forward block's roof (the 01 level)
f2 = f1 - EMBED_M + 2.6   # level 2's roof
f3 = f2 - EMBED_M + 2.4   # the pilot house's roof (the open bridge)
with m.tagged('superstructure'):
    m.rounded_box('superstructure', (-9.5, ms, 0.0), 49.0, 14.8, 2.6 + EMBED_M, 1.6)
    m.rounded_box('superstructure', (26.5, f0, 0.0), 25.0, 15.2, 2.8 + EMBED_M, 2.4)
    m.rounded_box('superstructure', (22.0, f1 - EMBED_M, 0.0), 14.0, 9.2, 2.6, 2.0)
    m.rounded_box('superstructure', (23.5, f2 - EMBED_M, 0.0), 9.0, 8.0, 2.4, 2.2)
    m.rounded_box('superstructure', (-22.0, mr - EMBED_M, 0.0), 10.0, 8.0, 2.6, 1.6)  # the after director's deckhouse

with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('cleveland-cl'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if name.startswith('Turret'):
            rise = RISE.get(name, 0.0)
            y = stand(x, 7.4 if rise else TURRET_BODY[0])
            if rise:
                m.tank('fitting', (x, y, z), 3.7, rise + EMBED_M, segments=40)
            y += rise
            naval.turret(m, name, x, y, z, b, TURRET_BODY, 3, GUN_L, 0.15, bag_length=0.6)
            f = 1 if round(b) == 0 else -1
            m.box('fitting', (x - f * 2.8, y + TURRET_BODY[2] - 0.6, 0.0), (1.2, 0.8, 10.0), node=name)  # rangefinder ears
        elif g['kit'] in naval.MOUNTS:
            if x > 14.0:
                y = f1 - EMBED_M
            else:
                y = mr - EMBED_M
            naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        else:
            continue
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 3)} {z}')

with m.tagged('bridgefittings'), m.shared_chart():
    naval.window_band(m, 23.5, f2 + 0.9, 0.0, 9.0, 8.0, 2.2, 0.9, spacing=0.9)  # the pilot house
    naval.window_band(m, 22.0, f1 + 1.1, 0.0, 14.0, 9.2, 2.0, 0.5, spacing=1.6, visor=0.0)
    m.box('superstructure', (25.6, f2 - 0.22, 0.0), (2.4, 0.27 + EMBED_M, 13.4))  # bridge wings, 0.05 m proud
    top = naval.director(m, 22.6, f3 - EMBED_M, 0.0, 1.0, (3.6, 3.0, 2.0), 4.6)  # Mk 37
    m.box('fitting', (23.2, top + 0.7, 0.0), (0.3, 1.4, 2.4))  # Mk 12/22 radar antennas
    m.strut('fitting', (22.8, top - EMBED_M, 0.0), (22.8, top + 0.6, 0.0), 0.15, sides=6)
    naval.director(m, -22.0, mr - EMBED_M + 2.6, 0.0, 1.0, (3.6, 3.0, 2.0), 4.6)  # the after Mk 37
    for s in (-1, 1):
        m.tank('fitting', (25.6, f2 + 0.05, s * 5.6), 0.3, 1.0, segments=12)  # target designators on the wings
        naval.searchlight(m, 19.0, f2 - EMBED_M, s * 3.4)
    m.railing('fitting', [(27.6, f3 - EMBED_M, -3.7), (27.6, f3 - EMBED_M, 3.7)], height=1.0, post_m=1.2)  # the open bridge's front

# --- The tripod foremast with the SK array; the pole mainmast with the SG radar and the ensign's gaff.
fore_top = (16.4, f1 + 21.0, 0.0)
main_top = (-12.0, mr + 18.0, 0.0)
with m.tagged('masts'), m.shared_chart():
    naval.tripod(m, fore_top, [(18.0, f2 - EMBED_M, 0.0), (15.2, f1 - EMBED_M, -2.6), (15.2, f1 - EMBED_M, 2.6)], 0.3, 0.2)
    naval.platform(m, fore_top[0], fore_top[1] - 3.0, 0.0, 2.6, 2.6)
    m.lattice_mast('fitting', (fore_top[0], fore_top[1] - 3.0, 0.0), 4.4, 4.4, 0.5, 1, 0.06)  # SK, edge-on fore and aft
    m.strut('fitting', fore_top, (fore_top[0], fore_top[1] + 5.0, 0.0), 0.12, 0.07, sides=6)  # topmast
    m.strut('fitting', (fore_top[0], fore_top[1] + 3.0, -4.0), (fore_top[0], fore_top[1] + 3.0, 4.0), 0.08, sides=6)  # yard
    m.strut('fitting', (-12.0, mr - EMBED_M, 0.0), main_top, 0.3, 0.16, sides=8)
    m.strut('fitting', (-12.0, main_top[1] - 2.0, 0.0), (-15.2, main_top[1] - 0.6, 0.0), 0.08, sides=6)  # gaff
    m.strut('fitting', (-12.0, main_top[1] - 3.5, -3.0), (-12.0, main_top[1] - 3.5, 3.0), 0.08, sides=6)  # yard
    m.box('fitting', (-11.6, main_top[1] - 6.0, 0.0), (0.4, 1.0, 2.0))  # SG radar

# --- Two upright oval funnels with caps; the boats between them; the searchlight platforms.
with m.tagged('funnels'):
    naval.oval_funnel(m, (8.5, mr - 0.3, 0.0), (8.3, 24.6, 0.0), (3.0, 2.3), (2.8, 2.2), bars=3)
    naval.oval_funnel(m, (-5.0, mr - 0.3, 0.0), (-5.2, 24.0, 0.0), (3.0, 2.3), (2.8, 2.2), bars=3)
with m.tagged('funnelfittings'), m.shared_chart():
    for fx in (8.5, -5.0):
        for s in (-1, 1):
            m.strut('fitting', (fx - 3.2, mr - EMBED_M, s * 1.0), (fx - 3.0, 23.6, s * 0.8), 0.14, sides=6)  # steam pipes
    for s in (-1, 1):
        naval.boat(m, 2.0, mr + 0.08, s * 3.4, 6.0, 2.0, s)
    py = mr + 5.4  # one searchlight platform on a post between the funnels
    naval.platform(m, 1.5, py, 0.0, 2.4, 3.4)
    m.strut('fitting', (1.5, mr - EMBED_M, 0.0), (1.5, py - 0.2, 0.0), 0.2, sides=8)
    for s in (-1, 1):
        naval.searchlight(m, 1.5, py - EMBED_M, s * 0.9)

# --- The stern: two catapults, the crane, the hangar hatch.
with m.tagged('stern'), m.shared_chart():
    for s in (-1, 1):
        naval.catapult(m, -80.0, stand(-80.0, 3.2), s * 5.0, 13.0, s * 15.0, EMBED_M)
    naval.crane(m, (-90.0, stand(-90.0, 1.0), 0.0), 6.5, (-82.0, 13.0, 0.0), r=0.4)

with m.tagged('deckfittings'), m.shared_chart():
    for cx in (80.0, 84.0):
        naval.capstan(m, cx, stand(cx, 1.3), 0.0, EMBED_M)
    for bx in (74.0, 87.0, -66.0, -88.0):
        for side in (-1, 1):
            naval.bitts(m, bx, stand(bx, 1.4), side * (inside(bx) - 1.2), True, EMBED_M)
    for vx, vz in ((50.0, 6.0), (-40.0, 7.0), (-70.0, 6.0)):
        for side in (-1, 1):
            naval.cowl_vent(m, vx, stand(vx, 0.5), side * vz, 180.0 if vx > 0 else 0.0, 1.6, EMBED_M)
    for fx in (-30.0, -26.0, -18.0, -14.0):
        for side in (-1, 1):
            naval.carley_float(m, fx, ms + 0.8, side * 7.42, 2.4, side)
    m.strut('fitting', (L / 2 - 1.2, deck(L / 2 - 1.2), 0.0), (L / 2 - 0.9, deck(L / 2 - 1.2) + 4.0, 0.0), 0.08, sides=6)  # jackstaff
with m.tagged('anchors'), m.shared_chart():
    for s in (-1, 1):
        ax = 82.0
        m.box('dark', (ax, deck(ax) - 1.9, s * (m.hull_at(ax)[3] + 0.05)), (1.4, 1.6, 0.25))

GAPS = [(bx - 1.2, bx + 1.2) for bx in (74.0, 87.0, -66.0, -88.0)]
GAPS += [(g['x'] - 2.2, g['x'] + 2.2) for _, g in naval.armament('cleveland-cl') if abs(g['z']) > 7.5]
with m.tagged('rails'), m.shared_chart():
    for side in (-1, 1):
        for xs in naval.runs(-L / 2 + 1.0, L / 2 - 4.0, 4.0, GAPS):
            m.railing('fitting', [(x, deck(x) + EMBED_M, side * (inside(x) - 0.12)) for x in xs], height=0.95, post_m=2.2)
        m.railing('fitting', [(x, mr - EMBED_M, side * 7.25) for x in (-33.0, -28.0, -20.0)], height=0.9, post_m=2.0)
        m.railing('fitting', [(x, f1 - EMBED_M, side * 7.45) for x in (37.6, 35.0)], height=0.9, post_m=1.4)
with m.tagged('rigging'), m.shared_chart():
    m.strut('fitting', (fore_top[0], fore_top[1] + 4.5, 0.0), (L / 2 - 1.0, deck(L / 2 - 1.2) + 3.8, 0.0), 0.02, sides=4)  # forestay
    m.strut('fitting', (main_top[0], main_top[1], 0.0), (-L / 2 + 1.5, deck(-L / 2 + 1.5) + 1.0, 0.0), 0.02, sides=4)  # backstay
    for side in (-1, 1):
        m.strut('fitting', (fore_top[0], fore_top[1] + 3.0, side * 3.8), (main_top[0], main_top[1] - 3.5, side * 2.8), 0.015, sides=4)  # antennas
        m.strut('fitting', (fore_top[0], fore_top[1] - 0.5, side * 0.3), (13.0, f1 - EMBED_M + 0.05, side * 6.8), 0.02, sides=4)  # shrouds
        m.strut('fitting', (main_top[0], main_top[1] - 1.0, side * 0.2), (-16.0, mr - EMBED_M + 0.05, side * 6.6), 0.02, sides=4)

# --- Bake detail.
for side in (-1, 1):
    for x in [x / 10 for x in range(-900, 900, 26)]:
        if -40 < x < 20:
            continue
        for dy in (1.4, 3.3):
            y = m.hull_at(x)[2] - dy
            if y > 1.2:
                m.detail('porthole', (x, y, side * (m.hull_at(x)[3] + 2.0)), (0.0, 0.0, float(side)), radius=0.19)
    for x0 in range(-92, 78, 14):
        m.detail('strip', (x0, deck(x0) - 0.1, side * (inside(x0) + 2.0)), (0.0, 0.0, float(side)),
                 to=[x0 + 14.0, deck(x0 + 14.0) - 0.1, side * (inside(x0 + 14.0) + 2.0)], width=0.14, proud=0.035)
    for x in (-28.0, -18.0, -2.0, 12.0):
        m.detail('door', (x, ms + 1.05, side * 7.4), (0.0, 0.0, float(side)), w=0.8, h=1.9)
        m.detail('louver', (x + 2.4, ms + 1.5, side * 7.4), (0.0, 0.0, float(side)), w=1.4, h=0.8, slats=5)
    for x in (18.0, 31.0, 36.0):
        m.detail('door', (x, f0 + 1.05, side * 7.6), (0.0, 0.0, float(side)), w=0.8, h=1.9)
    m.detail('ladder', (16.0, f0 + 1.6, side * 7.6), (0.0, 0.0, float(side)), h=3.0)
    for x in (17.0, 20.0, 26.0):
        m.detail('porthole', (x, f1 + 1.5, side * 4.6), (0.0, 0.0, float(side)), radius=0.17)
for x, z in ((66.0, 0.0), (52.0, 3.0), (52.0, -3.0), (-62.0, 0.0), (-72.0, 3.0), (-72.0, -3.0)):
    m.detail('hatch', (x, deck(x) + 2.0, z), (0.0, 1.0, 0.0), w=1.4, h=1.4)
m.detail('hatch', (-86.0, deck(-86.0) + 2.0, 0.0), (0.0, 1.0, 0.0), w=6.0, h=5.0)  # the hangar hatch

# --- Paint.
m.marking('grid', tags=['hull'], spacingM=[None, 1.7, None], widthM=0.02, depth=0.6)
m.marking('planks', tags=['hull'], widthM=0.15, lengthM=7.3, contrast=0.08, seam=0.32)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.8, color='exhaustSoot', effect='stain', opacity=0.3, featherM=0.5)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(82.0, 0.0, s * 6.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.6, 8.6), (0.6, 8.6), (1.3, 2.4), (-1.1, 2.8)], color='rustStain', effect='stain', opacity=0.3, featherM=0.4)
    for k, x in enumerate([x / 10 for x in range(-900, 900, 26)]):
        if -40 < x < 20 or k % 3:
            continue
        y = m.hull_at(x)[2] - 1.4
        if y > 1.2:
            m.marking('polygon', tags=['hull'], origin=(x, 0.0, s * 12.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                      points=[(s * -0.07, y - 0.25), (s * 0.07, y - 0.25), (s * 0.12, y - 1.6), (s * -0.05, y - 1.3)],
                      color='rustStain', effect='stain', opacity=0.35, featherM=0.1)
m.marking('slab', tags=['funnels'], axis='y', fromM=22.6, toM=25.0, color='exhaustSoot', effect='stain', opacity=0.6, featherM=0.6)
m.export(out)
