"""Yamato-class battleship: Musashi as at Leyte Gulf, October 1944 (Ruling R4 keeps the model Musashi).
Original work, AGPL-3.0-or-later (Track M, M1f, 2026-10-09: rebuilt in Blender, replacing the
download, which stays in ASSETS.md as the proportions reference only).

CITED (content/ships/yamato-bb.json's reference, read 2026-09-26 and 2026-10-08):
  263 m overall, 38.9 m beam (English Wikipedia "Yamato-class battleship").
  Three triple 46 cm turrets (two forward, the second superfiring; one aft), the two centerline
  triple 15.5 cm turrets the April 1944 refit kept (one superfiring over No. 2 on the forward
  superstructure, one aft), six twin 12.7 cm Type 89 as the spec carries them, and about 130 x 25 mm.
  46 cm/45 Type 94: 45 calibers of 460 mm = 20.7 m; 15.5 cm/60: 60 x 155 mm = 9.3 m (arithmetic).
  The silhouette from the class general-arrangement drawings in English Wikipedia's articles: a
  tall compact tower bridge with the 15 m rangefinder on top, one big funnel raked sharply aft,
  a tripod mainmast abaft it, an after fire-control tower, and an aircraft deck at the stern one deck
  lower, with two catapults and a crane.
ESTIMATE / modeling choice (no drawing measured):
  every height (the forecastle deck 15 m at the stem, dipping to 8.6 m amidships; the aircraft deck
  6.7 m), the station table and section, the tower's tiers, funnel and mast sizes, gunhouse sizes;
  the 12.7 cm mounts stand on pedestals beside the superstructure; every 25 mm position
  (content/ships/yamato-bb.json). Decks are wood (hinoki), drawn as planks.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B = 263.0, 38.9
EMBED_M = 0.02
SUBDIVIDE = 10
STEP_X = -84.0  # the aircraft deck aft of here is one deck lower
STATIONS = [
    (-L / 2, 2.5, 0.5, 7.0, 4.5), (-118.0, 10.0, 0.55, 6.8, 11.0), (-100.0, 15.5, 0.55, 6.7, 15.5),
    (STEP_X - 0.4, 18.0, 0.55, 6.7, 17.4), (STEP_X, 18.0, 0.55, 8.9, 17.4), (-60.0, 19.45, 0.55, 8.8, 18.5),
    (0.0, 19.45, 0.55, 8.6, 18.5), (40.0, 19.2, 0.55, 9.2, 18.3), (65.0, 17.0, 0.5, 10.4, 16.8),
    (90.0, 12.0, 0.5, 12.0, 12.4), (112.0, 6.2, 0.5, 13.6, 7.2), (L / 2, 0.5, 0.45, 15.0, 1.2),
]
SECTION = ((0.0, -1.0), (0.8, -0.9), (1.0, -0.4), (1.0, 0.0), (1.0, 0.3), (0.95, 0.66), (1.0, 1.0))
MAIN_L, SEC_L = 45 * 0.46, 60 * 0.155
MAIN_BODY, SEC_BODY = (16.0, 13.0, 4.2), (8.6, 7.4, 2.8)
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

out, opts = kit.cli_args()
m = kit.Model('yamato-bb', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
stand = naval.stander(m, EMBED_M)
deck = lambda x: m.hull_at(x)[2] - EMBED_M  # noqa: E731
inside = lambda x: m.hull_at(x)[3]          # noqa: E731

# --- The superstructure: two levels from x -40 to 18, the tower on them, the funnel, the after tower.
s0 = stand(-13.0, 62.0)
l1 = s0 + 3.0 + EMBED_M     # level 1's roof
l2 = l1 - EMBED_M + 2.6     # level 2's roof
with m.tagged('superstructure'):
    m.rounded_box('superstructure', (-13.0, s0, 0.0), 62.0, 22.0, 3.0 + EMBED_M, 2.4)  # level 1, x -44..18
    m.rounded_box('superstructure', (-9.5, l1 - EMBED_M, 0.0), 53.0, 18.0, 2.6, 2.4)  # level 2, x -36..17

# The guns, from the spec: No. 2 and the 15.5 cm turrets superfire on barbettes.
with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('yamato-bb'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if name.startswith('Turret'):
            main = g['kit'] == 'turret-18in-triple'
            body = MAIN_BODY if main else SEC_BODY
            if name == 'Turret3':
                y = l2 - EMBED_M
                rise = 2.8
            elif name == 'Turret4':
                y, rise = stand(x, 8.0), 7.0
            else:
                y = stand(x, 14.0 if name == 'Turret2' else body[0])
                rise = 3.6 if name == 'Turret2' else 0.0
            if rise:
                m.tank('fitting', (x, y, z), 7.4 if main else 3.9, rise + EMBED_M, segments=48)
            y += rise
            naval.turret(m, name, x, y, z, b, body, 3, MAIN_L if main else SEC_L, 0.42 if main else 0.13, bag_length=1.2 if main else 0.5)
            f = 1 if round(b) == 0 else -1
            ear = (body[0] * 0.3, body[2] - 0.7, body[1] + 1.4) if main else (body[0] * 0.15, body[2] - 0.6, body[1] + 0.8)
            m.box('fitting', (x - f * body[0] * 0.3, y + ear[1], 0.0), (1.4, 0.9, ear[2]), node=name)  # rangefinder ears
        elif g['kit'] in naval.MOUNTS:
            y = stand(x, 4.0) + 3.0
            m.tank('fitting', (x, y - 3.0 - EMBED_M, z), 2.1, 3.0 + 2 * EMBED_M, segments=32)  # pedestal to level 1's height
            naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        else:
            continue
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 3)} {z}')

# --- The tower bridge: five stepped tiers, windows, wings and platforms; the 15 m rangefinder on top.
TX = 2.0
t = [l2 - EMBED_M]
with m.tagged('tower'):
    for (dx, ln, wd, h, r) in ((0.6, 10.4, 10.0, 3.2, 2.6), (0.4, 9.2, 8.8, 3.2, 2.6), (0.2, 8.4, 8.0, 3.0, 2.4),
                               (0.6, 8.0, 7.4, 3.0, 2.6), (0.0, 6.4, 6.0, 3.4, 2.6)):
        m.rounded_box('superstructure', (TX + dx, t[-1], 0.0), ln, wd, h + EMBED_M, r)
        t.append(t[-1] + h)
with m.tagged('towerfittings'), m.shared_chart():
    naval.window_band(m, TX + 0.4, t[1] + 1.4, 0.0, 9.2, 8.8, 2.6, 0.6, spacing=1.4, visor=0.0)
    naval.window_band(m, TX + 0.6, t[3] + 1.2, 0.0, 8.0, 7.4, 2.6, 1.0, spacing=0.9)  # the main (compass) bridge
    naval.window_band(m, TX + 0.0, t[4] + 1.6, 0.0, 6.4, 6.0, 2.6, 0.7, spacing=0.9, visor=0.3)
    for k, (wx, half) in enumerate(((TX + 3.6, 8.6), (TX + 3.0, 7.6))):  # bridge wings, port to starboard
        m.box('superstructure', (wx, t[2 + k] - 0.22, 0.0), (2.6, 0.27 + EMBED_M, 2 * half))  # 0.05 m proud of the tier's roof
    top = naval.director(m, TX - 0.4, t[5] - EMBED_M, 0.0, 2.0, (5.6, 4.6, 2.4), 15.0)
    for s in (-1, 1):  # Type 21 arrays on the rangefinder's ends
        m.box('fitting', (TX - 0.4, top - 1.0, s * 7.2), (0.2, 1.6, 1.4))
    m.strut('fitting', (TX - 1.6, top - EMBED_M, 0.0), (TX - 1.8, top + 7.0, 0.0), 0.2, 0.12, sides=8)  # the tower's topmast
    m.strut('fitting', (TX - 1.8, top + 5.0, -4.0), (TX - 1.8, top + 5.0, 4.0), 0.09, sides=6)  # yard
    for s in (-1, 1):
        m.tank('fitting', (TX + 3.0, t[3] - EMBED_M + 0.02, s * 6.6), 0.35, 1.1, segments=12)  # high-angle binoculars on the wings

# --- The funnel, raked sharply aft, with its searchlight platforms; the boats beside it.
with m.tagged('funnel'):
    naval.oval_funnel(m, (-16.0, l2 - 0.3, 0.0), (-26.0, 33.4, 0.0), (6.2, 4.4), (5.0, 3.6), bars=4)
with m.tagged('funnelfittings'), m.shared_chart():
    for s in (-1, 1):
        py = l2 + 6.0
        naval.platform(m, -11.0, py, s * 6.4, 4.0, 3.0)
        for dx in (-1.4, 1.4):
            m.strut('fitting', (-11.0 + dx, l2 - EMBED_M, s * 6.4), (-11.0 + dx, py - 0.2, s * 6.4), 0.14, sides=6)
        for dx in (-1.0, 1.0):
            naval.searchlight(m, -11.0 + dx, py - EMBED_M, s * 6.4)
    m.strut('fitting', (-31.0, l2 - EMBED_M, 2.6), (-33.0, 32.8, 1.6), 0.2, sides=8)  # steam pipes up the funnel's after face
    m.strut('fitting', (-31.0, l2 - EMBED_M, -2.6), (-33.0, 32.8, -1.6), 0.2, sides=8)
with m.tagged('boats'), m.shared_chart():
    for s in (-1, 1):
        naval.boat(m, -27.0, l2 + 0.08, s * 6.6, 9.0, 2.2, s)

# --- The mainmast tripod (gaff for the ensign, M1f F2), the after fire-control tower, the stern's catapults and crane.
main_top = (-39.0, 40.0, 0.0)
with m.tagged('mainmast'), m.shared_chart():
    naval.tripod(m, main_top, [(-32.5, l2 - EMBED_M, 0.0), (-34.6, l2 - EMBED_M, -3.0), (-34.6, l2 - EMBED_M, 3.0)], 0.42, 0.26)
    m.strut('fitting', (-39.0, 37.0, 0.0), (-43.6, 38.4, 0.0), 0.1, sides=6)  # gaff
    m.strut('fitting', (-38.6, 36.0, -4.5), (-38.6, 36.0, 4.5), 0.1, sides=6)  # yard
    m.lattice_mast('fitting', (main_top[0], main_top[1] - 0.1, 0.0), 0.8, 0.6, 2.0, 2, 0.05)  # Type 13 array
with m.tagged('aftertower'):
    at0 = l1 - EMBED_M
    m.rounded_box('superstructure', (-40.0, at0, 0.0), 6.0, 6.4, 6.0 + EMBED_M, 1.8)
with m.tagged('aftertowerfittings'), m.shared_chart():
    naval.window_band(m, -40.0, at0 + 4.4, 0.0, 6.0, 6.4, 1.8, 0.6, spacing=1.0, visor=0.25)
    naval.director(m, -40.0, at0 + 6.0, 0.0, 1.4, (3.6, 3.2, 1.8), 10.0)
with m.tagged('stern'), m.shared_chart():
    for s in (-1, 1):
        naval.catapult(m, -116.0, stand(-116.0, 3.2), s * 8.0, 18.0, s * 12.0, EMBED_M)
    naval.crane(m, (-126.0, stand(-126.0, 1.0), 0.0), 9.0, (-113.0, 15.0, 0.0), r=0.5)

# --- Deck fittings.
with m.tagged('deckfittings'), m.shared_chart():
    for cx in (110.0, 115.0):
        for side in (-1, 1):
            naval.capstan(m, cx, stand(cx, 1.3), side * 2.2, EMBED_M)
    for bx in (100.0, 120.0, -95.0, -125.0):
        for side in (-1, 1):
            naval.bitts(m, bx, stand(bx, 1.4), side * (inside(bx) - 1.6), True, EMBED_M)
    for vx, vz in ((75.0, 8.0), (-76.0, 9.0), (-100.0, 6.0)):
        for side in (-1, 1):
            naval.cowl_vent(m, vx, stand(vx, 0.5), side * vz, 180.0 if vx > 0 else 0.0, 2.0, EMBED_M)
    for fx in (-30.0, -24.0, -2.0, 4.0, 10.0):
        for side in (-1, 1):
            naval.carley_float(m, fx, s0 + 0.9, side * 11.02, 2.6, side)
    m.strut('fitting', (L / 2 - 1.5, deck(L / 2 - 1.5), 0.0), (L / 2 - 1.1, deck(L / 2 - 1.5) + 5.0, 0.0), 0.09, sides=6)  # jackstaff
with m.tagged('anchors'), m.shared_chart():
    for s in (-1, 1):
        ax = 116.0
        m.box('dark', (ax, deck(ax) - 2.6, s * (m.hull_at(ax)[3] + 0.05)), (1.8, 2.0, 0.3))

# --- Railings: the deck edge broken at the mounts, bitts, galleries and the step; the levels' roofs.
GAPS = [(STEP_X - 1.0, STEP_X + 1.0)]
GAPS += [(bx - 1.4, bx + 1.4) for bx in (100.0, 120.0, -95.0, -125.0)]
GAPS += [(g['x'] - 2.4, g['x'] + 2.4) for _, g in naval.armament('yamato-bb') if abs(g['z']) > 11.5 and 'run' not in g]
GAPS += [(g['x'] - g['run'] / 2 - 0.8, g['x'] + g['run'] / 2 + 0.8) for _, g in naval.armament('yamato-bb') if 'run' in g]
with m.tagged('rails'), m.shared_chart():
    for side in (-1, 1):
        for xs in naval.runs(-L / 2 + 2.5, L / 2 - 5.0, 4.0, GAPS):
            m.railing('fitting', [(x, deck(x) + EMBED_M, side * (inside(x) - 0.14)) for x in xs], height=1.0, post_m=2.4)
        m.railing('fitting', [(x, l2 - EMBED_M, side * 8.8) for x in (-35.0, -29.0, -23.0, -17.0, -11.0, -5.0)], height=0.9, post_m=2.0)
        m.railing('fitting', [(x, l1 - EMBED_M, side * 10.8) for x in (-36.5, -32.0, -27.0)], height=0.9, post_m=2.0)
        m.railing('fitting', [(TX + 4.4, t[2] - EMBED_M + 0.01, side * 8.4), (TX + 2.2, t[2] - EMBED_M + 0.01, side * 8.4)], height=0.9, post_m=1.2)
        m.railing('fitting', [(TX - 2.4, t[5] - EMBED_M, side * 2.8), (TX + 2.6, t[5] - EMBED_M, side * 2.8)], height=0.9, post_m=1.4)
with m.tagged('rigging'), m.shared_chart():
    tm = (TX - 1.8, top + 7.0, 0.0)
    m.strut('fitting', tm, (L / 2 - 1.3, deck(L / 2 - 1.5) + 4.8, 0.0), 0.025, sides=4)  # forestay
    m.strut('fitting', (main_top[0], main_top[1] + 0.6, 0.0), (-L / 2 + 2.0, deck(-L / 2 + 2.0) + 1.0, 0.0), 0.025, sides=4)  # backstay
    for side in (-1, 1):
        m.strut('fitting', (TX - 1.8, top + 5.0, side * 3.8), (main_top[0], main_top[1] - 4.0, side * 4.3), 0.02, sides=4)  # antennas
        m.strut('fitting', (main_top[0], main_top[1] - 0.6, side * 0.4), (-46.0, l1 - EMBED_M + 0.05, side * 9.5), 0.025, sides=4)  # shrouds

# --- Bake detail.
for side in (-1, 1):
    for x in [x / 10 for x in range(-1250, 1260, 30)]:
        if -60 < x < 40:
            continue
        for row, dy in enumerate((1.6, 3.6)):
            y = m.hull_at(x)[2] - dy
            if y > 1.4 and not (row == 1 and x < STEP_X):
                m.detail('porthole', (x, y, side * (m.hull_at(x)[3] + 2.0)), (0.0, 0.0, float(side)), radius=0.22)
    for x0 in range(-130, 114, 16):
        if x0 < STEP_X < x0 + 16:
            continue
        m.detail('strip', (x0, deck(x0) - 0.12, side * (inside(x0) + 2.0)), (0.0, 0.0, float(side)),
                 to=[x0 + 16.0, deck(x0 + 16.0) - 0.12, side * (inside(x0 + 16.0) + 2.0)], width=0.16, proud=0.04)
    for x in (-34.0, -24.0, -6.0, 8.0):
        m.detail('door', (x, s0 + 1.05, side * 11.0), (0.0, 0.0, float(side)), w=0.9, h=1.95)
        m.detail('ladder', (x + 1.8, s0 + 1.6, side * 11.0), (0.0, 0.0, float(side)), h=3.2)
    for x in (-30.0, -20.0, -14.0, 0.0, 4.0, 12.0):
        m.detail('louver', (x, s0 + 1.8, side * 11.0), (0.0, 0.0, float(side)), w=1.6, h=0.9, slats=6)
    for x in (-28.0, -16.0, -4.0, 6.0):
        m.detail('porthole', (x, l1 + 1.4, side * 9.0), (0.0, 0.0, float(side)), radius=0.2)
    for k in range(1, 4):
        m.detail('door', (TX + 0.4, t[k] + 1.05, side * (4.6 - 0.4 * k)), (0.0, 0.0, float(side)), w=0.8, h=1.9)
for x, z in ((95.0, 0.0), (80.0, 4.0), (80.0, -4.0), (-90.0, 0.0), (-104.0, 4.0), (-104.0, -4.0), (70.0, 6.0), (70.0, -6.0)):
    m.detail('hatch', (x, deck(x) + 2.0, z), (0.0, 1.0, 0.0), w=1.6, h=1.6)

# --- Paint: strakes, wood decks, grime, rust; soot on the funnel.
m.marking('grid', tags=['hull'], spacingM=[None, 1.9, None], widthM=0.022, depth=0.6)
m.marking('planks', tags=['hull'], widthM=0.15, lengthM=6.0, contrast=0.1, seam=0.35)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.9, color='exhaustSoot', effect='stain', opacity=0.32, featherM=0.5)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(116.0, 0.0, s * 8.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.8, 12.6), (0.8, 12.6), (1.6, 4.0), (-1.4, 4.6)], color='rustStain', effect='stain', opacity=0.3, featherM=0.5)
    for k, x in enumerate([x / 10 for x in range(-1250, 1260, 30)]):
        if -60 < x < 40 or k % 3:
            continue
        y = m.hull_at(x)[2] - 1.6
        if y > 1.4:
            m.marking('polygon', tags=['hull'], origin=(x, 0.0, s * 20.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                      points=[(s * -0.08, y - 0.28), (s * 0.08, y - 0.28), (s * 0.13, y - 1.8), (s * -0.06, y - 1.5)],
                      color='rustStain', effect='stain', opacity=0.35, featherM=0.12)
m.marking('slab', tags=['funnel'], axis='y', fromM=30.8, toM=33.8, color='exhaustSoot', effect='stain', opacity=0.6, featherM=0.7)
m.export(out)
