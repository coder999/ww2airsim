"""Casablanca-class escort carrier: Gambier Bay (CVE-73) as at the Battle off Samar, October 1944.
Original work, AGPL-3.0-or-later.

CITED (checked 2026-09-26):
  156.13 m overall -- U.S. Navy, Evolution of Aircraft Carriers; 19.86 m waterline
  beam and 145.69 x 24.38 m flight deck -- content/ships/casablanca-cve.json and its
  cited class particulars. NHHC photos of USS Casablanca/Gambier Bay establish the
  narrow deck, starboard island and small stern gun silhouette.
CITED (DP2 Task 1, read 2026-09-28; ledger .superpowers/sdd/2026-09-28-dp2-ships):
  The hull: Gambier Bay, 25 October 1944. Photo: Wikimedia Commons "USS Gambier Bay (CVE-73)
  and escorts making smoke off Samar 1944.jpeg", U.S. Navy 80-G-288144, public domain. It shows
  deck-edge gallery sponsons and a Measure 32 Design 15A dazzle pattern (Commons description).
  DP2 drew it palette-only by Mark's ruling; M1's Ruling R5 (Mark, 2026-10-08) reopens camouflage,
  so the hull and hangar sides now carry a Measure 32 pattern in Light Gray 5-L, Ocean Gray 5-O and
  Dull Black (skin/colors.ts). The pattern is an ESTIMATE in 15A's character (raked panels, the
  two sides different), not traced from the design sheet, which was not read. No hull number is visible on the bow
  and the flight deck is seen edge-on, so no text is drawn; no bands are distinguishable.
  AA (English Wikipedia "USS Gambier Bay" infobox): one 5"/38 on the stern, 8 twin 40 mm, 20
  single 20 mm around the deck perimeter. One catapult at the bow and two elevators, fore and
  aft (Wikipedia "Casablanca-class escort carrier").
ESTIMATE / modeling choice:
  12 m flight-deck height, 7.5 m main deck, station fullness, hangar walls, gallery and sponson
  dimensions, every AA position, overhang supports, island/funnel/mast/radar dimensions,
  elevator impression and the stern gun's mass.
M1 detail pass (Track M, 2026-10-08; every addition an ESTIMATE): bridge wings and a Mk 51-type
  director on the island, an SG radar beside the SK array, the bow catapult's track and the
  arresting wires as flight-deck markings, weathering stains. The guns' positions are now the
  ShipSpec's armament (naval.py): the stern 5"/38 and the eight 40 mm twins are nodes named for
  their locators; the 20 single 20 mm are drawn statically for four fire-position galleries.
Omits aircraft, boats, railings and rigging.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B = 156.13, 19.86
FD_L, FD_W, FD_H, FD_T = 145.69, 24.38, 12.0, 0.45
EMBED_M = 0.02  # every fitting sinks this far into what it stands on: no coplanar faces (DP0)
SUBDIVIDE = 24  # 6 built 5,958 triangles, under the 11,250 floor; the round parts' segment counts are raised too
# The hull to its main deck at 7.5 m (the hangar deck); the hangar and flight deck stand on it.
STATIONS = [
    (-L / 2, 1.0, 0.45, 7.0, 1.6), (-66.0, 7.2, 0.5, 7.3, 7.6), (-48.0, B / 2, 0.55, 7.5, 9.9),
    (45.0, B / 2, 0.55, 7.5, 9.9), (62.0, 7.8, 0.5, 7.6, 8.6), (72.0, 3.6, 0.45, 7.9, 5.2), (L / 2, 0.35, 0.4, 8.2, 1.2),
]
GALLERY_Y = FD_H - FD_T - 1.6  # catwalk level, below the flight deck (a fitting above it fails the deck grid)
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'  # prints each mount's foot, for the spec's y

out, opts = kit.cli_args()
m = kit.Model('casablanca-cve', skin=2048)


def stand(x, l):
    """Where a part `l` long centered on x stands: the lowest embedded deck under it."""
    n = max(2, math.ceil(l / 0.25) + 1)
    return min(m.hull_at(x - l / 2 + l * i / (n - 1))[2] - EMBED_M for i in range(n))


with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
# M1c: the hangar, island and funnel walls take charts of their own (no shared_chart), so the bake can paint them.
with m.tagged('hangar'):
    for s in (-1, 1):
        m.box('superstructure', (-4.0, 7.5 - EMBED_M, s * 9.4), (104.0, FD_H - FD_T - 7.5 + 2 * EMBED_M, 0.3))
    m.box('superstructure', (-56.0, 7.5 - EMBED_M, 0.0), (0.3, FD_H - FD_T - 7.5 + 2 * EMBED_M, 18.5))
    m.box('superstructure', (48.0, 7.5 - EMBED_M, 0.0), (0.3, FD_H - FD_T - 7.5 + 2 * EMBED_M, 18.5))
with m.tagged('flightdeck'):
    m.deck('flightDeck', (0.0, 0.0), FD_L, FD_W, FD_H, FD_T, node='FlightDeck')
with m.tagged('supports'), m.shared_chart():
    for x in (-70.0, -64.0, 54.0, 60.0, 66.0):  # overhang supports fore and aft (ESTIMATE)
        for s in (-1, 1):
            m.strut('fitting', (x, m.hull_at(x)[2] - EMBED_M, s * (m.hull_at(x)[3] - 0.6)), (x, FD_H - FD_T + EMBED_M, s * 9.0), 0.18, sides=6)
with m.tagged('galleries'):  # M1c: own charts; shared, the two 128 m catwalks' faces unioned into a 962 px square
    for s in (-1, 1):
        m.box('fitting', (-3.0, GALLERY_Y, s * (FD_W / 2 + 0.6)), (128.0, 0.25, 1.4))
with m.tagged('aa'), m.shared_chart():
    for name, g in naval.armament('casablanca-cve'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if 'run' in g:
            continue  # a 20 mm gallery on the catwalk: the build draws its guns (M1b)
        if name.startswith('Turret'):  # the stern 5"/38 on its platform, under the flight deck's overhang
            y = stand(x, 5.0)
        else:  # a 40 mm twin on its deck-edge sponson; the tub sinks 0.02 into it
            y = GALLERY_Y - 0.2
            m.box('fitting', (x, GALLERY_Y - 0.43, z), (4.0, 0.25, 4.0))
        if g['kit'] in naval.MOUNTS:
            naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 2)} {z}')
with m.tagged('island'):
    m.frustum('superstructure', (18.0, FD_H - EMBED_M, 10.4), (14.0, 3.2), (11.0, 2.8), 5.0 + EMBED_M)
    m.frustum('superstructure', (20.0, FD_H + 5.0 - EMBED_M, 10.4), (7.0, 2.8), (5.5, 2.4), 2.2 + EMBED_M)
with m.tagged('islandfittings'), m.shared_chart():
    m.box('glazing', (23.10, FD_H + 5.9, 10.4), (0.26, 0.6, 2.0))  # straddles the sloped face: 0.04-0.24 m proud
    m.strut('fitting', (22.0, FD_H + 7.2 - EMBED_M, 10.4), (22.0, FD_H + 13.0, 10.4), 0.18, 0.12, sides=8)  # mast
    m.lattice_mast('fitting', (22.0, FD_H + 13.0, 10.4), 1.2, 0.6, 2.4, 2, 0.06)  # radar (ESTIMATE)
    m.box('superstructure', (21.5, FD_H + 5.0 - 0.25, 10.4), (2.4, 0.25 + EMBED_M, 6.2))  # bridge wings
    m.tank('fitting', (19.0, FD_H + 7.2 - EMBED_M, 10.4), 0.6, 0.7, segments=16)  # Mk 51-type director
    m.box('fitting', (19.0, FD_H + 7.9 - EMBED_M, 10.4), (0.9, 0.5, 1.4))
    m.strut('fitting', (22.0, FD_H + 10.5, 10.4), (23.6, FD_H + 10.5, 10.4), 0.05, sides=4)  # SG radar arm
    m.box('fitting', (23.7, FD_H + 10.2, 10.4), (0.3, 0.6, 1.2))  # SG radar
with m.tagged('funnels'):
    m.strut('superstructure', (15.0, FD_H + 5.0 - EMBED_M, 10.4), (15.0, FD_H + 10.0, 10.4), 1.25, 1.2, sides=48)
    m.strut('dark', (15.0, FD_H + 9.7, 10.4), (15.0, FD_H + 10.2, 10.4), 1.21, 1.21, sides=48)
with m.tagged('elevators'), m.shared_chart():
    for x in (-40.0, 40.0):  # impressions, 0.03 m proud: under the deck grid's 0.15 m
        m.box('fitting', (x, FD_H - EMBED_M, 0.0), (12.5, 0.05, 11.0))
with m.tagged('deckfittings'), m.shared_chart():
    # M1: a capstan and bitts under the bow overhang, Carley floats on the hangar sides.
    naval.capstan(m, 72.5, stand(72.5, 1.0), 0.0, EMBED_M)
    for side in (-1, 1):
        naval.bitts(m, 68.0, stand(68.0, 1.4), side * (m.hull_at(68.0)[3] - 1.0), True, EMBED_M)
        for fx in (-44.0, -28.0, -12.0, 4.0, 28.0):
            naval.carley_float(m, fx, 8.6, side * 9.55, 2.4, side)
m.marking('grid', tags=['hull'], spacingM=[None, 1.6, None], widthM=0.015, depth=0.6)
# Flight deck: the bow catapult's track and the arresting wires (dark lines; geometry would break the deck grid).
m.marking('polygon', tags=['flightdeck'], origin=(0.0, FD_H, 0.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(48.0, -0.35), (71.0, -0.35), (71.0, 0.35), (48.0, 0.35)], color='dullBlackBK', opacity=0.8)
for x in range(-62, -24, 6):
    m.marking('polygon', tags=['flightdeck'], origin=(0.0, FD_H, 0.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
              points=[(x - 0.06, -10.0), (x + 0.06, -10.0), (x + 0.06, 10.0), (x - 0.06, 10.0)], color='dullBlackBK', opacity=0.9)
# Measure 32 dazzle (Ruling R5; an ESTIMATE in 15A's character): raked panels in three colors over the
# palette's gray, running the hull and hangar sides; the starboard pattern is the port one's mirror shifted.
PANELS = [(-79.0, -58.0, 6.0, 'dullBlackBK'), (-58.0, -40.0, -5.0, 'lightGray5L'), (-40.0, -18.0, 7.0, 'oceanGray5O'),
          (-18.0, -4.0, -6.0, 'dullBlackBK'), (-4.0, 18.0, 5.0, 'lightGray5L'), (18.0, 36.0, -7.0, 'oceanGray5O'),
          (36.0, 52.0, 6.0, 'dullBlackBK'), (52.0, 79.0, -5.0, 'lightGray5L')]
for s in (-1, 1):
    shift = 0.0 if s < 0 else 9.0
    for x0, x1, rake, color in PANELS:
        a, b = x0 + shift, x1 + shift
        pts = [(a, -0.5), (b, -0.5), (b + rake, FD_H), (a + rake, FD_H)]
        m.marking('polygon', tags=['hull', 'hangar'], origin=(0.0, 0.0, s * 12.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                  points=[(s * u, v) for u, v in pts], color=color, opacity=0.95)
# The hangar's side openings, dark (ESTIMATE: three a side between the galleries' supports).
for s in (-1, 1):
    for ox in (-36.0, -8.0, 20.0):
        if s == 1 and ox == 20.0:
            continue  # under the island
        m.marking('polygon', tags=['hangar'], origin=(0.0, 0.0, s * 9.55), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                  points=[(s * (ox - 4.0), 8.4), (s * (ox + 4.0), 8.4), (s * (ox + 4.0), 9.9), (s * (ox - 4.0), 9.9)], color='dullBlackBK', opacity=0.9)
# Weathering: waterline grime and rust from the hawse pipes.
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.7, color='exhaustSoot', effect='stain', opacity=0.3, featherM=0.4)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(70.0, 0.0, s * 6.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.4, 7.6), (0.4, 7.6), (0.9, 3.5), (-0.8, 3.8)], color='rustStain', effect='stain', opacity=0.3, featherM=0.3)
# --- M1c (2026-10-09): catwalk railings, mast stays and the bake's detail. Every position an ESTIMATE by eye
# from the class's 1944 photographs (Gambier Bay, as cited above); rails and ladders as Navy practice.
GAPS = [(g['x'] - 2.0, g['x'] + 2.0) for _, g in naval.armament('casablanca-cve') if 'twin' in (g.get('kit') or '')]


def runs(x0, x1, step, gaps):
    """The stretches of [x0, x1] outside every gap, each as its sample points `step` apart."""
    cuts = sorted(g for g in gaps if g[1] > x0 and g[0] < x1)
    out, a = [], x0
    for g0, g1 in cuts + [(x1, x1)]:
        if g0 - a >= 2.0:
            n = max(1, math.ceil((g0 - a) / step))
            out.append([a + (g0 - a) * k / n for k in range(n + 1)])
        a = max(a, g1)
    return out


with m.tagged('rails'), m.shared_chart():
    for s in (-1, 1):  # the catwalks' outboard guard rails, broken by each 40 mm sponson
        gaps = [g for g, (_, mt) in zip(GAPS, [x for x in naval.armament('casablanca-cve') if 'twin' in (x[1].get('kit') or '')]) if mt['z'] * s > 0]
        for xs in runs(-66.0, 60.0, 6.0, gaps):
            m.railing('fitting', [(x, GALLERY_Y + 0.25 - EMBED_M, s * (FD_W / 2 + 1.22)) for x in xs], height=1.0, post_m=2.4)
    m.railing('fitting', [(x, FD_H + 5.0 - EMBED_M, 10.4 - 1.3) for x in (14.5, 16.5)], height=0.9, post_m=1.0)  # the island roof's inboard edge
with m.tagged('rigging'), m.shared_chart():
    for dz in (-1.0, 1.0):  # mast stays to the island roof
        m.strut('fitting', (22.0, FD_H + 12.5, 10.4 + dz * 0.1), (19.0, FD_H + 7.2 + EMBED_M, 10.4 + dz * 1.0), 0.015, sides=4)

# Bake detail (kit.detail): hull portholes, island doors and ladders, funnel louvers, the deck-edge bar.
for s in (-1, 1):
    for x in [x / 10 for x in range(-700, 701, 26)]:
        m.detail('porthole', (x, 5.6, s * (m.hull_at(x)[3] + 1.0)), (0.0, 0.0, float(s)), radius=0.18)
    for x0 in range(-72, 72, 18):  # the main deck's edge bar under the overhangs and along the hangar
        m.detail('strip', (x0, m.hull_at(x0)[2] - 0.1, s * (m.hull_at(x0)[3] + 1.0)), (0.0, 0.0, float(s)),
                 to=[x0 + 18.0, m.hull_at(x0 + 18.0)[2] - 0.1, s * (m.hull_at(x0 + 18.0)[3] + 1.0)], width=0.12, proud=0.03)
    for x in (-48.0, -20.0, 0.0, 40.0):  # hangar side doors, clear of the openings and the Carley floats
        m.detail('door', (x, 8.5, s * 10.2), (0.0, 0.0, float(s)), w=0.8, h=1.9)
for x in (14.0, 22.0):  # island doors and ladders (outboard face, +z)
    m.detail('door', (x, FD_H + 1.05, 12.6), (0.0, 0.0, 1.0), w=0.7, h=1.9)
    m.detail('ladder', (x + 1.4, FD_H + 2.4, 12.6), (0.0, 0.0, 1.0), h=4.4)
for x in (16.0, 19.0, 22.0):
    m.detail('porthole', (x, FD_H + 3.6, 12.6), (0.0, 0.0, 1.0), radius=0.16)
    m.detail('porthole', (x, FD_H + 3.6, 8.2), (0.0, 0.0, -1.0), radius=0.16)
m.detail('louver', (15.0, FD_H + 7.0, 12.2), (0.0, 0.0, 1.0), w=1.0, h=0.8, slats=5)

# Douglas-fir flight deck planks (they read from the groove as a grain, not as boards), porthole rust (C3).
m.marking('planks', tags=['flightdeck'], widthM=0.15, lengthM=6.1, contrast=0.08, seam=0.3)
for s in (-1, 1):
    for k, x in enumerate([x / 10 for x in range(-700, 701, 26)]):
        if k % 3 == 0:
            m.marking('polygon', tags=['hull'], origin=(x, 0.0, s * 10.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                      points=[(s * -0.06, 5.35), (s * 0.06, 5.35), (s * 0.1, 4.0), (s * -0.05, 4.3)],
                      color='rustStain', effect='stain', opacity=0.35, featherM=0.08)
m.export(out)
