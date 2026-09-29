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
  Every AA and 5"/38 POSITION (no legible 1944 plan): 8 twin 5"/38 at x 24, 14, 4, -6 both
  sides; the 10 quad 40 mm on the deck edge at x 46, 30, 20, -18, -26 both sides; single
  20 mm every 8 m along the deck edge, except within 3 m of a 40 mm tub or a 5" mount, so
  fewer than the cited 51 are drawn (the rest stood on superstructure levels not modeled).
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
Omits railings, rigging, aircraft, catapult, cranes, the aft deckhouse and director, radar
arrays, and the air-recognition marks seen on turret roofs in NH 67584 (unresolvable).
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

L, B, DECK = 185.32, 32.39, 9.0
EMBED_M = 0.02  # every fitting sinks this far into what it stands on: no coplanar faces (DP0)
SUBDIVIDE = 8  # 6 built 8,810 triangles, under the 11,250 floor (25% of the budget); so did the R2 segment counts
# (x, waterline half-beam, draft, deck-edge height, deck-edge half-beam). The authored bottom is shallow:
# a waterline model, the build's skirt carries it to -3 m. The bulged midbody is widest at the
# waterline and tumbles home to the deck (ESTIMATE from the 1945 General Plans' sections).
STATIONS = [
    (-L / 2, 1.2, 0.5, 8.6, 1.4), (-84.0, 8.0, 0.55, 8.4, 8.2), (-70.0, 13.6, 0.55, 8.7, 13.0),
    (-50.0, B / 2, 0.55, DECK, 14.8), (40.0, B / 2, 0.55, DECK, 14.8), (62.0, 13.2, 0.55, 9.3, 13.4),
    (80.0, 7.2, 0.5, 9.9, 8.4), (L / 2, 0.5, 0.45, 10.6, 1.3),
]
SECTION = ((0.0, -1.0), (0.8, -0.9), (1.0, -0.4), (1.0, 0.0), (1.0, 0.3), (0.97, 0.65), (1.0, 1.0))
TURRETS = [(1, 58.0, 1, 0.0), (2, 35.0, 1, 2.6), (3, -35.0, -1, 2.6), (4, -58.0, -1, 0.0)]  # index, x, facing, barbette rise
TURRET_BODY = (9.5, 11.5, 3.4)
BARBETTE_R = 5.2
GUN_L = 45 * 0.3556  # 14"/45: 45 calibers of 14 in (0.3556 m) = 16.0 m, CITED arithmetic
FIVE_INCH = [(x, s) for x in (24.0, 14.0, 4.0, -6.0) for s in (-1, 1)]    # twin 5"/38 mounts, x and side (ESTIMATE)
QUAD_40 = [(x, s) for x in (46.0, 30.0, 20.0, -18.0, -26.0) for s in (-1, 1)]  # 40 mm quads on the deck edge (ESTIMATE)
SINGLE_CLEAR_M = 3.0  # a 20 mm single keeps this far (plan) from a 40 mm tub's or a 5" mount's center
QUAD_R, FIVE_R = 1.9 + 0.12, 1.6  # a 40 mm tub's outer radius, a 5" pedestal's radius

out, opts = kit.cli_args()
m = kit.Model('pennsylvania-bb', skin=1024)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
deck = lambda x: m.hull_at(x)[2] - EMBED_M  # noqa: E731
inside = lambda x: m.hull_at(x)[3]          # noqa: E731, the deck edge's half-beam at x


def stand(x, l):
    """Where a part `l` long centered on x stands: the lowest embedded deck under it, sampled every
    0.25 m (hull_at is linear between stations, so this misses the true low by < 0.01 m < EMBED_M)."""
    n = max(2, math.ceil(l / 0.25) + 1)
    return min(deck(x - l / 2 + l * i / (n - 1)) for i in range(n))


with m.tagged('turrets'):
    for i, x, facing, rise in TURRETS:
        y = stand(x, 2 * BARBETTE_R if rise > 0 else TURRET_BODY[0])
        if rise > 0:  # a superfiring barbette; the gunhouse sinks EMBED_M into its top
            m.tank('fitting', (x, y, 0.0), BARBETTE_R, rise + EMBED_M, segments=32)
        m.naval_turret('fitting', i, (x, y + rise, 0.0), facing, TURRET_BODY, 3, GUN_L, 0.36, bag_length=0.9)

s0 = stand(2.0, 35.0)           # the superstructure's foot
y1 = s0 + 4.0 + EMBED_M         # its first tier's roof
y2 = y1 - EMBED_M + 8.0         # the tower's roof
with m.tagged('superstructure'), m.shared_chart():
    m.frustum('superstructure', (2.0, s0, 0.0), (35.0, 15.0), (31.0, 13.0), 4.0 + EMBED_M)
    m.frustum('superstructure', (12.0, y1 - EMBED_M, 0.0), (15.0, 10.0), (11.0, 8.0), 8.0)
    m.frustum('superstructure', (16.0, y2 - EMBED_M, 0.0), (8.0, 6.0), (6.0, 4.5), 4.0)
    # Tripod foremast: three legs from the tower's roof (x 6.5..17.5, z +-4) to a platform, the director on it.
    top = (15.0, s0 + 26.0, 0.0)
    for leg in ((12.0, -3.0), (12.0, 3.0), (17.0, 0.0)):
        m.strut('fitting', (leg[0], y2 - EMBED_M, leg[1]), top, 0.45, 0.3, sides=8)
    m.frustum('fitting', (top[0], top[1] - 0.2, 0.0), (5.0, 4.0), (4.2, 3.4), 2.4)
with m.tagged('funnel'):
    # Raked aft; its mouth (the cap's top, about y 25.6) is the entry's smokeOrigin [-6, 26, 0] (Ruling above).
    m.strut('superstructure', (-5.0, y1 - 0.3, 0.0), (-6.0, s0 + 16.0, 0.0), 3.2, 2.9, sides=24)
    m.strut('dark', (-6.0, s0 + 16.0 - 0.3, 0.0), (-6.05, s0 + 16.6, 0.0), 3.0, 3.0, sides=24)  # cap, sooty
with m.tagged('secondary'), m.shared_chart():
    for x, s in FIVE_INCH:
        z, y = s * (inside(x) - 3.2), stand(x, 4.2)
        m.tank('fitting', (x, y, z), FIVE_R, 0.6 + EMBED_M, segments=24)
        m.frustum('fitting', (x, y + 0.6, z), (4.2, 3.6), (3.6, 3.2), 2.4)
        for dz in (-0.55, 0.55):
            m.gun_barrel('fitting', (x + 1.6, y + 1.7, z + dz), 0.0, 8.0, 5.0, 0.09, 0.07, 12)
with m.tagged('aa'), m.shared_chart():
    mounts = []
    for x, s in QUAD_40:
        z, y = s * (inside(x) - 2.6), stand(x, 2 * QUAD_R)
        mounts.append((x, z))
        m.sandbag_ring('fitting', (x, y, z), 1.9, 0.12, 1.1, segments=24)
        m.tank('fitting', (x, y, z), 0.7, 1.0 + EMBED_M, segments=16)
        for dz in (-0.45, -0.15, 0.15, 0.45):
            m.gun_barrel('fitting', (x + 0.3, y + 1.0, z + dz), 0.0, 25.0, 2.4, 0.05, 0.04, 12)
    mounts += [(x, s * (inside(x) - 3.2)) for x, s in FIVE_INCH]
    for x in range(-80, 81, 8):
        if abs(x) <= 12:
            continue
        for s in (-1, 1):
            z, y = s * (inside(x) - 0.9), stand(x, 0.4)
            if any(math.hypot(x - mx, z - mz) < SINGLE_CLEAR_M for mx, mz in mounts):
                continue  # it would stand inside a 40 mm tub or against a 5" mount (Ruling, T7/T9)
            m.tank('fitting', (x, y, z), 0.18, 1.0 + EMBED_M, segments=12)
            m.box('fitting', (x + 0.15, y + 0.9, z), (0.08, 0.9, 1.0))
            m.gun_barrel('fitting', (x, y + 1.1, z), 0.0, 30.0, 1.8, 0.03, 0.03, 8)
with m.tagged('boats'), m.shared_chart():
    # On the superstructure's roof (x -13.5..17.5, z +-6.5), outboard of the funnel and aft of the tower.
    by = y1 - EMBED_M + 0.8  # the keel (the mid station's lowest point) sinks EMBED_M into the roof
    for x in (-9.0, 0.0):
        for s in (-1, 1):
            m.fuselage('fitting', [(x - 4.0, 0.3, 0.3, by, 2.0), (x, 1.2, 0.8, by, 2.4), (x + 4.0, 0.2, 0.4, by + 0.2, 2.0)],
                       segments=16, center_z=s * 5.0)
with m.tagged('masts'):
    # Aft of the superstructure (which ends at x = -15.5), so the pole stands on the deck itself.
    ym = stand(-19.0, 0.7)
    m.strut('fitting', (-19.0, ym, 0.0), (-19.0, ym + 20.0, 0.0), 0.35, 0.2, sides=8)
    m.strut('fitting', (-19.0, ym + 17.0, -4.0), (-19.0, ym + 17.0, 4.0), 0.12, sides=6)  # yard
# Plating strakes, world-aligned (the grid cuts only axes lying in each surface; decks cut none).
m.marking('grid', tags=['hull'], spacingM=[None, 1.8, None], widthM=0.02, depth=0.6)
HULL_NUMBER = None  # Task 1: none on the cited hull (80-G-K-2106's port bow is bare); ships.test.ts counts 0 texts
if HULL_NUMBER:
    x0 = 70.0
    for s in (-1, 1):
        m.marking('text', tags=['hull'], origin=(x0 if s == 1 else x0 + 3.0, 5.0, s * (m.hull_at(x0)[0] + 0.3)),
                  axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0), text=HULL_NUMBER, heightM=2.4, strokeM=0.36, color='insigniaWhite')
m.export(out)
