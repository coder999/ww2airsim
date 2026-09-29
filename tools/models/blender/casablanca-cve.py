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
  deck-edge gallery sponsons and a Measure 32 Design 15A dazzle pattern (Commons description);
  by Mark's ruling this model is palette-only, no dazzle. No hull number is visible on the bow
  and the flight deck is seen edge-on, so no text is drawn; no bands are distinguishable.
  AA (English Wikipedia "USS Gambier Bay" infobox): one 5"/38 on the stern, 8 twin 40 mm, 20
  single 20 mm around the deck perimeter. One catapult at the bow and two elevators, fore and
  aft (Wikipedia "Casablanca-class escort carrier").
ESTIMATE / modeling choice:
  12 m flight-deck height, 7.5 m main deck, station fullness, hangar walls, gallery and sponson
  dimensions, every AA position, overhang supports, island/funnel/mast/radar dimensions,
  elevator impression and the stern gun's mass.
Omits the catapult, arresting wires, aircraft, boats, railings and rigging.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

L, B = 156.13, 19.86
FD_L, FD_W, FD_H, FD_T = 145.69, 24.38, 12.0, 0.45
EMBED_M = 0.02  # every fitting sinks this far into what it stands on: no coplanar faces (DP0)
SUBDIVIDE = 24  # 6 built 5,958 triangles, under the 11,250 floor; the round parts' segment counts are raised too
# The hull to its main deck at 7.5 m (the hangar deck); the hangar and flight deck stand on it.
STATIONS = [
    (-L / 2, 1.0, 0.45, 7.0, 1.6), (-66.0, 7.2, 0.5, 7.3, 7.6), (-48.0, B / 2, 0.55, 7.5, 9.9),
    (45.0, B / 2, 0.55, 7.5, 9.9), (62.0, 7.8, 0.5, 7.6, 8.6), (72.0, 3.6, 0.45, 7.9, 5.2), (L / 2, 0.35, 0.4, 8.2, 1.2),
]
TWIN_40 = [(-60.0, -1), (-60.0, 1), (-30.0, -1), (0.0, -1), (30.0, -1), (30.0, 1), (60.0, -1), (60.0, 1)]
SINGLE_20 = [(x, s) for x in range(-66, 67, 12) for s in (-1, 1)]
GALLERY_Y = FD_H - FD_T - 1.6  # catwalk level, below the flight deck (a fitting above it fails the deck grid)

out, opts = kit.cli_args()
m = kit.Model('casablanca-cve', skin=1024)


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
    for x, s in TWIN_40:
        z = s * (FD_W / 2 + 1.6)
        m.box('fitting', (x, GALLERY_Y - 0.43, z), (4.0, 0.25, 4.0))  # the sponson; the tub sinks 0.02 into it
        m.sandbag_ring('fitting', (x, GALLERY_Y - 0.2, z), 1.6, 0.1, 1.0, segments=32)
        m.tank('fitting', (x, GALLERY_Y - 0.2, z), 0.6, 1.0, segments=24)
        for dz in (-0.25, 0.25):
            m.gun_barrel('fitting', (x + 0.2, GALLERY_Y + 0.8, z + dz), 0.0, 20.0, 2.4, 0.05, 0.04, 16)
    for x, s in SINGLE_20:
        z = s * (FD_W / 2 + 1.0)
        m.tank('fitting', (x, GALLERY_Y + 0.25 - EMBED_M, z), 0.16, 0.9, segments=16)
        m.box('fitting', (x + 0.12, GALLERY_Y + 1.0, z), (0.06, 0.8, 0.9))
        m.gun_barrel('fitting', (x, GALLERY_Y + 1.1, z), 0.0, 30.0, 1.7, 0.03, 0.03, 8)
    sy = stand(-72.0, 5.0)  # the stern 5"/38 on its platform, under the flight deck's overhang
    m.tank('fitting', (-72.0, sy, 0.0), 2.4, 0.4 + EMBED_M, segments=24)
    m.frustum('fitting', (-72.0, sy + 0.4, 0.0), (3.0, 2.6), (2.6, 2.2), 1.8)
    m.gun_barrel('fitting', (-73.4, sy + 1.4, 0.0), 180.0, 5.0, 3.5, 0.09, 0.07, 8)  # ends inside the stern (-78.07)
with m.tagged('island'), m.shared_chart():
    m.frustum('superstructure', (18.0, FD_H - EMBED_M, 10.4), (14.0, 3.2), (11.0, 2.8), 5.0 + EMBED_M)
    m.frustum('superstructure', (20.0, FD_H + 5.0 - EMBED_M, 10.4), (7.0, 2.8), (5.5, 2.4), 2.2 + EMBED_M)
    m.box('glazing', (23.10, FD_H + 5.9, 10.4), (0.26, 0.6, 2.0))  # straddles the sloped face: 0.04-0.24 m proud
    m.strut('fitting', (22.0, FD_H + 7.2 - EMBED_M, 10.4), (22.0, FD_H + 13.0, 10.4), 0.18, 0.12, sides=8)  # mast
    m.lattice_mast('fitting', (22.0, FD_H + 13.0, 10.4), 1.2, 0.6, 2.4, 2, 0.06)  # radar (ESTIMATE)
with m.tagged('funnels'), m.shared_chart():
    m.strut('superstructure', (15.0, FD_H + 5.0 - EMBED_M, 10.4), (15.0, FD_H + 10.0, 10.4), 1.25, 1.2, sides=48)
    m.strut('dark', (15.0, FD_H + 9.7, 10.4), (15.0, FD_H + 10.2, 10.4), 1.21, 1.21, sides=48)
with m.tagged('elevators'), m.shared_chart():
    for x in (-40.0, 40.0):  # impressions, 0.03 m proud: under the deck grid's 0.15 m
        m.box('fitting', (x, FD_H - EMBED_M, 0.0), (12.5, 0.05, 11.0))
m.marking('grid', tags=['hull'], spacingM=[None, 1.6, None], widthM=0.015, depth=0.6)
m.export(out)
