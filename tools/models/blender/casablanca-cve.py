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
SINGLE_20 = [(x, s) for x in range(-66, 67, 12) for s in (-1, 1)]
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
with m.tagged('hangar'), m.shared_chart():
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
with m.tagged('galleries'), m.shared_chart():
    for s in (-1, 1):
        m.box('fitting', (-3.0, GALLERY_Y, s * (FD_W / 2 + 0.6)), (128.0, 0.25, 1.4))
        for x in range(-62, 63, 8):
            m.strut('fitting', (x, GALLERY_Y + 0.25 - EMBED_M, s * (FD_W / 2 + 1.2)), (x, GALLERY_Y + 1.25, s * (FD_W / 2 + 1.2)), 0.03, sides=4)
with m.tagged('aa'), m.shared_chart():
    for name, g in naval.armament('casablanca-cve'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if g['kit'] is None:
            continue
        if name.startswith('Turret'):  # the stern 5"/38 on its platform, under the flight deck's overhang
            y = stand(x, 5.0)
        else:  # a 40 mm twin on its deck-edge sponson; the tub sinks 0.02 into it
            y = GALLERY_Y - 0.2
            m.box('fitting', (x, GALLERY_Y - 0.43, z), (4.0, 0.25, 4.0))
        naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 2)} {z}')
    for x, s in SINGLE_20:
        naval.static_20mm(m, x, GALLERY_Y + 0.25 - EMBED_M, s * (FD_W / 2 + 1.0), 0.0, 0.0)
with m.tagged('island'), m.shared_chart():
    m.frustum('superstructure', (18.0, FD_H - EMBED_M, 10.4), (14.0, 3.2), (11.0, 2.8), 5.0 + EMBED_M)
    m.frustum('superstructure', (20.0, FD_H + 5.0 - EMBED_M, 10.4), (7.0, 2.8), (5.5, 2.4), 2.2 + EMBED_M)
    m.box('glazing', (23.10, FD_H + 5.9, 10.4), (0.26, 0.6, 2.0))  # straddles the sloped face: 0.04-0.24 m proud
    m.strut('fitting', (22.0, FD_H + 7.2 - EMBED_M, 10.4), (22.0, FD_H + 13.0, 10.4), 0.18, 0.12, sides=8)  # mast
    m.lattice_mast('fitting', (22.0, FD_H + 13.0, 10.4), 1.2, 0.6, 2.4, 2, 0.06)  # radar (ESTIMATE)
    m.box('superstructure', (21.5, FD_H + 5.0 - 0.25, 10.4), (2.4, 0.25 + EMBED_M, 6.2))  # bridge wings
    m.tank('fitting', (19.0, FD_H + 7.2 - EMBED_M, 10.4), 0.6, 0.7, segments=16)  # Mk 51-type director
    m.box('fitting', (19.0, FD_H + 7.9 - EMBED_M, 10.4), (0.9, 0.5, 1.4))
    m.strut('fitting', (22.0, FD_H + 10.5, 10.4), (23.6, FD_H + 10.5, 10.4), 0.05, sides=4)  # SG radar arm
    m.box('fitting', (23.7, FD_H + 10.2, 10.4), (0.3, 0.6, 1.2))  # SG radar
with m.tagged('funnels'), m.shared_chart():
    m.strut('superstructure', (15.0, FD_H + 5.0 - EMBED_M, 10.4), (15.0, FD_H + 10.0, 10.4), 1.25, 1.2, sides=48)
    m.strut('dark', (15.0, FD_H + 9.7, 10.4), (15.0, FD_H + 10.2, 10.4), 1.21, 1.21, sides=48)
with m.tagged('elevators'), m.shared_chart():
    for x in (-40.0, 40.0):  # impressions, 0.03 m proud: under the deck grid's 0.15 m
        m.box('fitting', (x, FD_H - EMBED_M, 0.0), (12.5, 0.05, 11.0))
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
# Weathering: waterline grime and rust from the hawse pipes.
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.7, color='exhaustSoot', effect='stain', opacity=0.3, featherM=0.4)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(70.0, 0.0, s * 6.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.4, 7.6), (0.4, 7.6), (0.9, 3.5), (-0.8, 3.8)], color='rustStain', effect='stain', opacity=0.3, featherM=0.3)
m.export(out)
