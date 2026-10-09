"""Pennsylvania-class battleship: USS Pennsylvania (BB-38) as at Surigao Strait, October 1944.
Original work, AGPL-3.0-or-later.

CITED (checked 2026-09-26):
  185.32 m overall and 32.39 m post-modernization beam -- content/ships/pennsylvania-bb.json,
  sourced there to the 608 ft / 106 ft 3 in class dimensions.
  Four triple 14-inch turrets and the 1944 tower arrangement -- March 1945 U.S. Navy
  Booklet of General Plans, USS Pennsylvania (BB-38), cited by that ShipSpec; NHHC's
  USS Pennsylvania history confirms the modernization, refits, and Leyte configuration.
CITED (DP2 Task 1, all read 2026-09-28; ledger .superpowers/sdd/2026-09-28-dp2-ships):
  The hull: USS Pennsylvania (BB-38), October 1944 (Surigao Strait, 24-25 Oct 1944).
  Photograph 80-G-K-2106, drydocked in an ABSD, circa 1944 (color), port bow and forward
  superstructure from ahead: https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/images/k02000/k02106.jpg
  (page https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/sh-usn/usnsh-p/bb38.htm, the
  HyperWar mirror of NHC's Online Library; history.navy.mil failed to load). It shows:
    - no hull number on the bow (the port bow is bare), so no text marking is drawn;
    - Measure 21, overall Navy Blue 5-N, no dazzle (HyperWar/NHC camouflage page,
      https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/sh-co-mk/camouflg/usn-wwii/3--bb1.htm:
      Measure 32/3D was drawn for BB-38 but "never applied"). Drawn as the usn-1944 palette
      (Mark's palette-only ruling, DP2 Question 1), not as 5-N itself;
    - no boot-top or funnel band;
    - the tower foremast with its radar, twin 5"/38 mounts and AA tubs about the superstructure.
  AA fit, the 1942 Mare Island refit held until the 1945 refit (English Wikipedia
  "USS Pennsylvania (BB-38)", https://en.wikipedia.org/wiki/USS_Pennsylvania_(BB-38)):
  8 twin 5"/38 mounts, 10 quad 40 mm, 51 single 20 mm; the tripod mainmast was removed and
  an aft deckhouse carries the aft director and CXAM-1 radar. The March 1945 Booklet is
  post-1945-refit, so its AA layout is not used (hull, turrets and tower only).
  Main-gun length: 14"/45, 45 calibers of 14 in (0.3556 m) = 16.0 m (arithmetic).
ESTIMATE / modeling choice:
  9 m main deck; waterline-only shallow authored bottom (the shared stage adds its skirt);
  the station table, section, sheer and tumblehome (read by eye from the 1945 General Plans'
  sections); tower, funnel and mast heights; gunhouse and barbette sizes.
  Every AA and 5"/38 POSITION (no legible 1944 plan), now in content/ships/pennsylvania-bb.json:
  8 twin 5"/38 at x 24, 14, 4, -6 both sides; the 10 quad 40 mm on the deck edge at x 46, 30,
  20, -18, -26 both sides; single 20 mm every 8 m along the deck edge, except within 3 m of a
  40 mm tub or a 5" mount, drawn statically for the spec's four 20 mm galleries.
  Two boats a side on the superstructure roof; a pole mainmast with a yard stands in for the
  aft deckhouse's radar mast. Catapult, cranes and aircraft: no source read settles them for
  October 1944, so they are omitted.
Rulings (DP2 Task 7):
  smokeOrigin moved to the raked funnel's new top (the entry's [-6, 26, 0], the cap's top about
  25.6 m): the old [-5, 24, 0] sat ~11 m over the funnel's bottom, past SMOKE_REACH_M (5 m).
  Every part stands on stand(x, l), the lowest deck under its length, and every stacked tier
  sinks EMBED_M into the one below, rather than on deck(x) at its center (plan pre-flight:
  gaps of 0.05-0.19 m otherwise, in the sheer).
  The boats sit on the superstructure roof, not 1.7 m over the main deck (they floated there,
  and 40 mm barrels pierced them).
M1 detail pass (Track M, 2026-10-08; every addition an ESTIMATE read by eye from 80-G-K-2106 and the
  1945 General Plans' profile, positions not measured): conning tower (5.5 m armored cylinder) at the
  superstructure's fore end; two stepped bridge levels with wings and a glazing band; a fire-control
  top on the tripod (box, Mk 34 director with rangefinder arms) carrying an SK air-search array;
  two Mk 37 directors (fore on the upper bridge, aft on the aft deckhouse); the aft deckhouse
  (the 1942 refit's, cited above) with a CXAM-type array on a pole mast; four searchlight
  platforms on the funnel; a quarterdeck crane; six boats with davits; two bower anchors.
  The guns are no longer drawn here from constants: their positions are the ShipSpec's armament
  (naval.py), and every 5"/38 and 40 mm mount is a node named for its locator.
Omits railings (an alpha strip the build has no path for yet), rigging, aircraft, the catapult
(no source read settles it for October 1944), and the air-recognition marks on turret roofs.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B, DECK = 185.32, 32.39, 9.0
EMBED_M = 0.02  # every fitting sinks this far into what it stands on: no coplanar faces (DP0)
SUBDIVIDE = 12  # M1: 8 -> 12 for a smoother sheer and bow flare
# (x, waterline half-beam, draft, deck-edge height, deck-edge half-beam). The authored bottom is shallow:
# a waterline model, the build's skirt carries it to -3 m. The bulged midbody is widest at the
# waterline and tumbles home to the deck (ESTIMATE from the 1945 General Plans' sections).
STATIONS = [
    (-L / 2, 1.2, 0.5, 8.6, 1.4), (-84.0, 8.0, 0.55, 8.4, 8.2), (-70.0, 13.6, 0.55, 8.7, 13.0),
    (-50.0, B / 2, 0.55, DECK, 14.8), (40.0, B / 2, 0.55, DECK, 14.8), (62.0, 13.2, 0.55, 9.3, 13.4),
    (80.0, 7.2, 0.5, 9.9, 8.4), (L / 2, 0.5, 0.45, 10.6, 1.3),
]
SECTION = ((0.0, -1.0), (0.8, -0.9), (1.0, -0.4), (1.0, 0.0), (1.0, 0.3), (0.97, 0.65), (1.0, 1.0))
SUPERFIRING_RISE_M = 2.6  # Nos. 2 and 3 stand on barbettes this far above the deck (ESTIMATE)
TURRET_BODY = (9.5, 11.5, 3.4)
BARBETTE_R = 5.2
GUN_L = 45 * 0.3556  # 14"/45: 45 calibers of 14 in (0.3556 m) = 16.0 m, CITED arithmetic
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'  # prints each mount's foot, for the spec's y

out, opts = kit.cli_args()
m = kit.Model('pennsylvania-bb', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
deck = lambda x: m.hull_at(x)[2] - EMBED_M  # noqa: E731
inside = lambda x: m.hull_at(x)[3]          # noqa: E731, the deck edge's half-beam at x


def stand(x, l):
    """Where a part `l` long centered on x stands: the lowest embedded deck under it, sampled every
    0.25 m (hull_at is linear between stations, so this misses the true low by < 0.01 m < EMBED_M)."""
    n = max(2, math.ceil(l / 0.25) + 1)
    return min(deck(x - l / 2 + l * i / (n - 1)) for i in range(n))


# The guns, from the spec. Turrets: a barbette for the superfiring pair, the gunhouse on it.
with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('pennsylvania-bb'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if name.startswith('Turret'):
            rise = SUPERFIRING_RISE_M if abs(x) < 45 else 0.0
            y = stand(x, 2 * BARBETTE_R if rise > 0 else TURRET_BODY[0])
            if rise > 0:  # the barbette is hull; the gunhouse sinks EMBED_M into its top
                m.tank('fitting', (x, y, z), BARBETTE_R, rise + EMBED_M, segments=48)
            y += rise
            naval.turret(m, name, x, y, z, b, TURRET_BODY, 3, GUN_L, 0.36, bag_length=0.9)
            f = 1 if round(b) == 0 else -1  # rangefinder hoods (ears) on the gunhouse's flanks, toward its rear
            for side in (-1, 1):
                m.box('fitting', (x - f * 2.5, y + TURRET_BODY[2] - 0.8, side * 5.2), (1.6, 0.9, 0.8), node=name)
        elif g['kit'] in naval.MOUNTS:
            y = stand(x, 4.2)
            naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        else:
            continue  # light AA: the build generates it (M1b)
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 2)} {z}')

s0 = stand(2.0, 35.0)           # the superstructure's foot
y1 = s0 + 4.0 + EMBED_M         # its first tier's roof
y2 = y1 - EMBED_M + 4.0         # the lower bridge's roof
y3 = y2 - EMBED_M + 3.2         # the upper bridge's roof
with m.tagged('superstructure'), m.shared_chart():
    m.frustum('superstructure', (2.0, s0, 0.0), (35.0, 15.0), (33.0, 14.0), 4.0 + EMBED_M)
    # Conning tower: the armored cylinder at the fore end, rising through both bridge levels.
    m.tank('superstructure', (17.5, y1 - 0.06, 0.0), 2.75, 6.3, segments=32)  # sunk deeper than the bridge: no shared floor
    # Lower and upper bridge, each with wings spanning past the tier below.
    m.frustum('superstructure', (12.0, y1 - EMBED_M, 0.0), (15.0, 10.0), (14.0, 9.4), 4.0)
    m.box('superstructure', (15.0, y2 - 0.3, 0.0), (4.0, 0.3 + EMBED_M, 16.0))  # lower wings
    m.frustum('superstructure', (14.0, y2 - EMBED_M, 0.0), (9.0, 7.0), (8.4, 6.6), 3.2)
    m.box('superstructure', (16.0, y3 - 0.3, 0.0), (3.0, 0.3 + EMBED_M, 12.0))  # upper wings
    # Window bands straddling each sloped face at their mid height (Kagero's pattern): never coplanar with it.
    m.box('glazing', (18.34, y2 + 1.3, 0.0), (0.26, 0.9, 5.6))   # upper bridge
    m.box('glazing', (19.21, y1 + 1.9, 0.0), (0.26, 0.9, 7.0))   # lower bridge
    # Mk 37 director on the upper bridge, rangefinder arms athwartships.
    m.tank('fitting', (14.0, y3 - EMBED_M, 0.0), 1.0, 0.9, segments=16)
    m.frustum('fitting', (14.0, y3 + 0.88, 0.0), (3.6, 3.0), (3.0, 2.6), 2.0)
    m.gun_barrel('fitting', (14.0, y3 + 2.0, -2.6), -90.0, 0.0, 5.2, 0.14, 0.14, 12)
    # Tripod foremast to the fire-control top, the Mk 34 director and the SK air-search array on it.
    top = (12.0, s0 + 27.0, 0.0)
    for leg in ((9.5, -3.0), (9.5, 3.0), (14.5, 0.0)):
        m.strut('fitting', (leg[0], y3 - EMBED_M, leg[1]), top, 0.45, 0.3, sides=8)
    m.frustum('fitting', (top[0], top[1] - 0.2, 0.0), (6.0, 5.0), (5.4, 4.4), 2.6)
    m.box('glazing', (top[0] + 2.75, top[1] + 1.2, 0.0), (0.2, 0.7, 3.8))
    m.frustum('fitting', (top[0], top[1] + 2.38, 0.0), (3.4, 2.8), (2.8, 2.4), 1.6)
    m.gun_barrel('fitting', (top[0], top[1] + 3.2, -2.8), -90.0, 0.0, 5.6, 0.14, 0.14, 12)
    m.strut('fitting', (top[0] - 1.0, top[1] + 3.96, 0.0), (top[0] - 1.0, top[1] + 8.0, 0.0), 0.15, 0.1, sides=8)
    m.lattice_mast('fitting', (top[0] - 1.0, top[1] + 8.0, 0.0), 4.6, 4.6, 0.6, 1, 0.06)  # SK array, edge-on fore-aft
    # Aft deckhouse with the aft Mk 37 and a CXAM-type array on its pole mast.
    ad = stand(-22.0, 12.0)  # x -28..-16: clear of No. 3's barbette (to -29.8) and of the pole mainmast
    m.frustum('superstructure', (-22.0, ad, 0.0), (12.0, 9.0), (11.0, 8.4), 3.6 + EMBED_M)
    m.tank('fitting', (-22.0, ad + 3.6, 0.0), 1.0, 0.9, segments=16)
    m.frustum('fitting', (-22.0, ad + 4.48, 0.0), (3.6, 3.0), (3.0, 2.6), 2.0)
    m.gun_barrel('fitting', (-22.0, ad + 5.6, -2.6), -90.0, 0.0, 5.2, 0.14, 0.14, 12)
    m.strut('fitting', (-27.5, ad + 3.6 - EMBED_M, 0.0), (-27.5, ad + 17.0, 0.0), 0.3, 0.18, sides=8)
    m.lattice_mast('fitting', (-27.5, ad + 17.0, 0.0), 5.2, 5.2, 0.5, 1, 0.06)  # CXAM-type array
with m.tagged('funnel'):
    # Raked aft; its mouth (the cap's top, about y 25.6) is the entry's smokeOrigin [-6, 26, 0] (DP2 ruling).
    m.strut('superstructure', (-5.0, y1 - 0.3, 0.0), (-6.0, s0 + 16.0, 0.0), 3.2, 2.9, sides=32)
    m.strut('dark', (-6.0, s0 + 16.0 - 0.3, 0.0), (-6.05, s0 + 16.6, 0.0), 3.0, 3.0, sides=32)  # cap, sooty
with m.tagged('searchlights'), m.shared_chart():
    for s in (-1, 1):  # two platforms a side on the funnel's flanks, a searchlight drum on each
        for k, dy in enumerate((6.0, 9.5)):
            py = s0 + dy
            m.box('fitting', (-5.5, py, s * 3.9), (2.6, 0.2, 2.4))
            m.tank('fitting', (-5.5, py + 0.2 - EMBED_M, s * 3.9), 0.55, 0.9, segments=16)
with m.tagged('boats'), m.shared_chart():
    # Six on the superstructure roof (x -13.5..19.5, z +-7), outboard of the funnel and aft of the bridge.
    by = y1 - EMBED_M + 0.8  # the keel (the mid station's lowest point) sinks EMBED_M into the roof
    for x in (-11.0, -2.0, 7.0):
        if x == 7.0:
            continue  # under the bridge wings
        for s in (-1, 1):
            m.fuselage('fitting', [(x - 4.0, 0.3, 0.3, by, 2.0), (x, 1.2, 0.8, by, 2.4), (x + 4.0, 0.2, 0.4, by + 0.2, 2.0)],
                       segments=16, center_z=s * 5.0)
            for dx in (-3.0, 3.0):  # davits, outboard of each boat
                m.strut('fitting', (x + dx, y1 - EMBED_M, s * 6.6), (x + dx, y1 + 3.0, s * 5.6), 0.1, sides=6)
with m.tagged('stern'), m.shared_chart():
    # Quarterdeck crane: a post and a boom raised toward the stern.
    cy = stand(-82.0, 1.2)
    m.strut('fitting', (-82.0, cy, 0.0), (-82.0, cy + 6.0, 0.0), 0.5, 0.4, sides=12)
    m.strut('fitting', (-82.0, cy + 5.5, 0.0), (-90.0, cy + 9.0, 0.0), 0.25, 0.15, sides=6)
with m.tagged('masts'):
    ym = ad + 3.6 - EMBED_M  # the pole mainmast stands on the aft deckhouse's roof, forward of its director
    m.strut('fitting', (-17.5, ym, 0.0), (-17.5, ym + 16.4, 0.0), 0.35, 0.2, sides=8)
    m.strut('fitting', (-17.5, ym + 13.4, -4.0), (-17.5, ym + 13.4, 4.0), 0.12, sides=6)  # yard
with m.tagged('anchors'), m.shared_chart():
    for s in (-1, 1):  # bower anchors stowed at the hawse pipes
        ax = 82.0
        m.box('dark', (ax, deck(ax) - 1.8, s * (m.hull_at(ax)[3] + 0.05)), (1.4, 1.6, 0.25))
with m.tagged('deckfittings'), m.shared_chart():
    # M1: forecastle capstans and bitts, quarterdeck bitts, cowl vents, Carley floats on the superstructure.
    for cx in (70.0, 74.0):
        naval.capstan(m, cx, stand(cx, 1.3), 0.0, EMBED_M)
    for bx in (64.0, 79.0, -66.0, -78.0):
        for side in (-1, 1):
            naval.bitts(m, bx, stand(bx, 1.4), side * (inside(bx) - 1.4), True, EMBED_M)
    for vx, vz in ((49.0, 8.0), (-47.0, 8.0), (-70.0, 6.0)):
        for side in (-1, 1):
            naval.cowl_vent(m, vx, stand(vx, 0.5), side * vz, 180.0 if vx > 0 else 0.0, 1.8, EMBED_M)
    for fx in (-12.0, -6.0, 0.0, 6.0):
        for side in (-1, 1):
            naval.carley_float(m, fx, s0 + 1.2, side * 7.42, 2.6, side)
# Plating strakes, world-aligned (the grid cuts only axes lying in each surface; decks cut none).
m.marking('grid', tags=['hull'], spacingM=[None, 1.8, None], widthM=0.02, depth=0.6)
# M1 weathering: grime along the waterline, rust streaks from the hawse pipes, soot on the funnel's top.
m.marking('slab', tags=['hull'], axis='y', fromM=-1.0, toM=0.9, color='exhaustSoot', effect='stain', opacity=0.35, featherM=0.5)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(82.0, 0.0, s * 9.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.6, 8.2), (0.6, 8.2), (1.4, 2.0), (-1.2, 2.5)], color='rustStain', effect='stain', opacity=0.3, featherM=0.4)
    for x in (-60.0, -30.0, 30.0):  # scupper streaks down the side
        m.marking('polygon', tags=['hull'], origin=(x, 0.0, s * 16.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                  points=[(-0.3, 8.3), (0.3, 8.3), (0.5, 4.5), (-0.4, 5.0)], color='rustStain', effect='stain', opacity=0.4, featherM=0.3)
m.marking('slab', tags=['funnel'], axis='y', fromM=s0 + 14.5, toM=s0 + 17.0, color='exhaustSoot', effect='stain', opacity=0.6, featherM=0.6)
m.export(out)
