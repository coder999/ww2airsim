"""Essex-class fleet carrier, short-hull group, late 1944, carrying the spec's Enterprise-pattern 5-inch
fit (Ruling R3 kept it). Original work, AGPL-3.0-or-later (Track M, M1f, 2026-10-09: rebuilt in
Blender, replacing the Enterprise download, which stays in ASSETS.md as the proportions reference only).

CITED (content/ships/essex-cv.json's reference):
  265.8 m (872 ft) overall, 28.3 m (93 ft) waterline beam; the flight deck 262.7 x 32.9 m (862 x 108 ft)
  at the spec's 17 m (an ESTIMATE there, kept: the deck quals and the trap zone are laid over it).
  Eight single 5" on deck-edge sponsons fore and aft, and the four 40 mm quads Mark's M1d cut left.
  The class silhouette from the general-arrangement drawings in English Wikipedia's article: a long
  starboard island with the stack at its after end, the navigating bridge forward on it, two Mk 37
  directors, a tripod mast with the SK array, a port deck-edge elevator and two centerline ones,
  open hangar sides behind the gallery decks.
ESTIMATE / modeling choice (no drawing measured):
  the hangar deck at 10.6 m, the station table, the island's levels and length, stack and mast sizes,
  sponson sizes, every gun position's height (the spec's x and z are kept), the elevators' size and
  places. Measure 32 dazzle in three colors over the palette's gray on the hull, hangar and island
  sides, in the character of the 1944 designs (not traced from a design sheet). Douglas-fir deck.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B = 265.8, 28.3
FD_L, FD_W, FD_H, FD_T = 262.7, 32.9, 17.0, 0.45
EMBED_M = 0.02
SUBDIVIDE = 12
HD = 10.6  # the hangar deck: the hull's main deck
STATIONS = [
    (-L / 2, 6.0, 0.5, 9.8, 8.2), (-120.0, 11.0, 0.55, 10.0, 12.2), (-95.0, B / 2, 0.55, HD, 14.3),
    (60.0, B / 2, 0.55, HD, 14.3), (90.0, 11.6, 0.5, 11.4, 12.6), (115.0, 6.2, 0.5, 12.6, 7.6), (L / 2, 0.5, 0.45, 13.6, 1.4),
]
GALLERY_Y = FD_H - FD_T - 1.6
IZ = 18.0  # the island's centerline, starboard, mostly outboard of the deck edge (z 16.45)
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

out, opts = kit.cli_args()
m = kit.Model('essex-cv', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, node='Hull', deck_role='deck', deck_node='MainDeck', subdivide=SUBDIVIDE)
stand = naval.stander(m, EMBED_M)
inside = lambda x: m.hull_at(x)[3]  # noqa: E731
with m.tagged('hangar'):
    for s in (-1, 1):
        m.box('superstructure', (-2.0, HD - EMBED_M, s * 14.0), (212.0, FD_H - FD_T - HD + 2 * EMBED_M, 0.3))
    m.box('superstructure', (-108.0, HD - EMBED_M, 0.0), (0.3, FD_H - FD_T - HD + 2 * EMBED_M, 27.7))
    m.box('superstructure', (104.0, HD - EMBED_M, 0.0), (0.3, FD_H - FD_T - HD + 2 * EMBED_M, 27.7))
    m.box('superstructure', (15.0, GALLERY_Y - 3.0, IZ + 0.2), (34.0, FD_H - (GALLERY_Y - 3.0) - EMBED_M, 4.4))  # the island's sponson
with m.tagged('flightdeck'):
    m.deck('flightDeck', (0.0, 0.0), FD_L, FD_W, FD_H, FD_T, node='FlightDeck')
with m.tagged('supports'), m.shared_chart():
    for x in (-128.0, -122.0, -116.0, -110.0, 108.0, 114.0, 120.0, 126.0):
        for s in (-1, 1):
            m.strut('fitting', (x, m.hull_at(x)[2] - EMBED_M, s * (m.hull_at(x)[3] - 0.6)), (x, FD_H - FD_T + EMBED_M, s * 12.0), 0.22, sides=6)
    for x in (-100.0, -70.0, -40.0, -10.0, 40.0, 70.0, 100.0):
        for s in (-1, 1):
            if s == 1 and -4.0 < x < 34.0:
                continue
            m.strut('fitting', (x, GALLERY_Y - 2.4, s * 14.2), (x, GALLERY_Y - 0.02, s * 16.9), 0.12, sides=6)  # gallery brackets
with m.tagged('galleries'):
    for s in (-1, 1):
        m.box('fitting', (-6.0, GALLERY_Y, s * (FD_W / 2 + 0.6)), (226.0, 0.25, 1.4))

# The guns: each on its sponson, under the flight deck's edge.
with m.tagged('aa'), m.shared_chart():
    for name, g in naval.armament('essex-cv'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        # The 5-inch on sponsons level with the gallery, outboard of the deck edge; the 40 mm lower, clear
        # of the flight deck's overhang at the bow and stern.
        top = GALLERY_Y + 0.27 if name.startswith('Turret') else GALLERY_Y - 1.35
        w = 5.4 if name.startswith('Turret') else 5.0
        inner = min(abs(z) - 2.4, inside(x) - 0.6)
        zs = math.copysign((inner + abs(z) + w / 2) / 2, z)
        m.box('fitting', (x, top - 0.35, zs), (w, 0.35, abs(z) + w / 2 - inner))
        m.strut('fitting', (x, top - 3.4, math.copysign(inner, z)), (x, top - 0.3, math.copysign(abs(z) + 1.0, z)), 0.18, sides=6)
        if g['kit'] in naval.MOUNTS:
            naval.MOUNTS[g['kit']](m, name, x, top, z, b, EMBED_M)
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(top, 3)} {z}')

# --- The island: two levels, the navigating bridge forward, the stack aft, two Mk 37s, the tripod mast.
i1 = FD_H - EMBED_M + 3.2
i2 = i1 - EMBED_M + 2.8
i3 = i2 - EMBED_M + 2.6
with m.tagged('island'):
    m.rounded_box('superstructure', (15.0, FD_H - EMBED_M, IZ), 34.0, 5.0, 3.2 + EMBED_M, 1.6)
    m.rounded_box('superstructure', (17.0, i1 - EMBED_M, IZ), 28.0, 4.6, 2.8, 1.6)
    m.rounded_box('superstructure', (24.0, i2 - EMBED_M, IZ + 0.2), 13.0, 4.8, 2.6, 1.8)
    naval.oval_funnel(m, (6.0, i1 - 0.3, IZ + 0.3), (4.4, 33.8, IZ + 0.6), (5.0, 2.0), (4.4, 1.9), bars=3)
with m.tagged('islandfittings'), m.shared_chart():
    naval.window_band(m, 24.0, i2 + 0.9, IZ + 0.2, 13.0, 4.8, 1.8, 0.9, spacing=0.9)  # the navigating bridge
    naval.window_band(m, 17.0, i1 + 1.0, IZ, 28.0, 4.6, 1.6, 0.6, spacing=1.5, visor=0.25)  # the flag bridge
    m.box('superstructure', (29.0, i2 - 0.22, IZ + 2.6), (3.0, 0.27 + EMBED_M, 3.0))  # the bridge's outboard wing
    for dx, y0 in ((28.2, i3), (12.4, i2)):
        top = naval.director(m, dx, y0 - EMBED_M, IZ + 0.2, 1.0, (3.6, 3.0, 2.0), 4.6)  # Mk 37s, fore and aft
        m.box('fitting', (dx + 0.6, top + 0.7, IZ + 0.2), (0.3, 1.4, 2.4))  # Mk 12/22 antennas
        m.strut('fitting', (dx + 0.2, top - EMBED_M, IZ + 0.2), (dx + 0.2, top + 0.6, IZ + 0.2), 0.15, sides=6)
    mast_top = (16.0, 41.0, IZ + 0.2)
    naval.tripod(m, mast_top, [(18.8, i3 - EMBED_M, IZ + 0.2), (14.6, i2 - EMBED_M, IZ - 1.6), (14.6, i2 - EMBED_M, IZ + 2.0)], 0.32, 0.2)
    naval.platform(m, mast_top[0], mast_top[1] - 2.5, IZ + 0.2, 2.6, 2.6)
    m.lattice_mast('fitting', (mast_top[0], mast_top[1] - 2.5, IZ + 0.2), 5.0, 5.0, 0.5, 1, 0.07)  # SK, edge-on fore and aft
    m.strut('fitting', mast_top, (mast_top[0], mast_top[1] + 5.0, IZ + 0.2), 0.12, 0.07, sides=6)  # topmast
    m.strut('fitting', (mast_top[0], mast_top[1] + 3.0, IZ - 3.4), (mast_top[0], mast_top[1] + 3.0, IZ + 3.8), 0.08, sides=6)  # yard
    m.strut('fitting', (mast_top[0], mast_top[1] - 4.0, IZ + 0.2), (11.8, mast_top[1] - 2.6, IZ + 0.2), 0.08, sides=6)  # gaff
    m.box('fitting', (16.6, mast_top[1] + 1.0, IZ + 0.2), (0.4, 1.0, 2.0))  # SG radar
    for x in (-1.0, 31.4):
        naval.searchlight(m, x, i1 - EMBED_M, IZ + 1.2)
    naval.crane(m, (-1.0, FD_H - 0.06, IZ + 1.4), 7.0, (-7.0, FD_H + 5.0, IZ + 3.4), r=0.35)  # the aircraft crane at the island's after end, boom stowed outboard
with m.tagged('elevators'), m.shared_chart():
    for x in (70.0, -40.0):  # centerline elevators: impressions 0.03 m proud (under the deck grid's limit)
        m.box('fitting', (x, FD_H - EMBED_M, 0.0), (13.4, 0.05, 14.0))
    m.box('flightDeck', (14.0, FD_H - FD_T + 0.12, -(FD_W / 2 + 2.6)), (17.6, FD_T - 0.17, 5.4))  # the port deck-edge elevator, just below the deck
with m.tagged('deckfittings'), m.shared_chart():
    naval.capstan(m, 118.0, stand(118.0, 1.0), 0.0, EMBED_M)
    for side in (-1, 1):
        naval.bitts(m, 112.0, stand(112.0, 1.4), side * (inside(112.0) - 1.0), True, EMBED_M)
        for fx in (-90.0, -60.0, -30.0, 40.0, 75.0):
            naval.carley_float(m, fx, HD + 1.6, side * 14.17, 2.6, side)
with m.tagged('anchors'), m.shared_chart():
    for s in (-1, 1):
        ax = 120.0
        m.box('dark', (ax, m.hull_at(ax)[2] - 2.4, s * (m.hull_at(ax)[3] + 0.05)), (1.6, 1.8, 0.25))

GAPS = [(g['x'] - 3.0, g['x'] + 3.0) for _, g in naval.armament('essex-cv')]
with m.tagged('rails'), m.shared_chart():
    for s in (-1, 1):
        gaps = GAPS + ([(-4.0, 34.0)] if s == 1 else [(4.0, 24.0)])
        for xs in naval.runs(-118.0, 110.0, 6.0, gaps):
            m.railing('fitting', [(x, GALLERY_Y + 0.25 - EMBED_M, s * (FD_W / 2 + 1.22)) for x in xs], height=1.0, post_m=2.4)
    m.railing('fitting', [(x, i3 - EMBED_M, IZ + 2.25) for x in (19.0, 23.0, 26.5)], height=0.9, post_m=1.4)
with m.tagged('rigging'), m.shared_chart():
    for dz in (-1.0, 1.0):
        m.strut('fitting', (mast_top[0], mast_top[1] - 0.5, IZ + 0.2 + dz * 0.2), (20.0, i3 - EMBED_M + 0.05, IZ + 0.2 + dz * 1.8), 0.02, sides=4)

# --- Bake detail.
for s in (-1, 1):
    for x in [x / 10 for x in range(-1200, 1200, 28)]:
        y = m.hull_at(x)[2] - 2.6
        m.detail('porthole', (x, y, s * (m.hull_at(x)[3] + 1.0)), (0.0, 0.0, float(s)), radius=0.2)
    for x0 in range(-126, 112, 18):
        m.detail('strip', (x0, m.hull_at(x0)[2] - 0.1, s * (m.hull_at(x0)[3] + 1.0)), (0.0, 0.0, float(s)),
                 to=[x0 + 18.0, m.hull_at(x0 + 18.0)[2] - 0.1, s * (m.hull_at(x0 + 18.0)[3] + 1.0)], width=0.14, proud=0.03)
    for x in (-80.0, -50.0, -20.0, 50.0, 85.0):
        m.detail('door', (x, HD + 1.05, s * 14.6), (0.0, 0.0, float(s)), w=0.9, h=1.9)
for x in (0.0, 12.0, 22.0, 30.0):
    m.detail('door', (x, FD_H + 1.05, IZ + 2.6), (0.0, 0.0, 1.0), w=0.8, h=1.9)
    m.detail('ladder', (x + 1.6, FD_H + 2.0, IZ + 2.6), (0.0, 0.0, 1.0), h=4.0)
for x in (5.0, 9.0, 16.0, 20.0, 26.0):
    m.detail('porthole', (x, FD_H + 2.4, IZ - 2.6), (0.0, 0.0, -1.0), radius=0.17)
m.detail('louver', (6.0, i1 + 2.0, IZ + 2.4), (0.0, 0.0, 1.0), w=1.6, h=1.0, slats=6)

# --- Paint: the deck's planks, wires and centerline; Measure 32 dazzle; grime and rust.
m.marking('grid', tags=['hull'], spacingM=[None, 1.8, None], widthM=0.018, depth=0.6)
m.marking('planks', tags=['flightdeck'], widthM=0.15, lengthM=6.1, contrast=0.08, seam=0.3)
for x in range(-118, -38, 6):
    m.marking('polygon', tags=['flightdeck'], origin=(0.0, FD_H, 0.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
              points=[(x - 0.06, -13.0), (x + 0.06, -13.0), (x + 0.06, 13.0), (x - 0.06, 13.0)], color='dullBlackBK', opacity=0.9)
for x in range(-126, 126, 8):
    m.marking('polygon', tags=['flightdeck'], origin=(0.0, FD_H, 0.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
              points=[(x, -0.12), (x + 4.0, -0.12), (x + 4.0, 0.12), (x, 0.12)], color='lightGray5L', opacity=0.7)
PANELS = [(-133.0, -100.0, 8.0, 'dullBlackBK'), (-100.0, -70.0, -6.0, 'lightGray5L'), (-70.0, -38.0, 9.0, 'oceanGray5O'),
          (-38.0, -14.0, -7.0, 'dullBlackBK'), (-14.0, 14.0, 6.0, 'lightGray5L'), (14.0, 44.0, -8.0, 'oceanGray5O'),
          (44.0, 74.0, 7.0, 'dullBlackBK'), (74.0, 104.0, -6.0, 'lightGray5L'), (104.0, 133.0, 8.0, 'oceanGray5O')]
for s in (-1, 1):
    shift = 0.0 if s < 0 else 11.0
    for x0, x1, rake, color in PANELS:
        a, b = x0 + shift, x1 + shift
        pts = [(a, -0.5), (b, -0.5), (b + rake, FD_H), (a + rake, FD_H)]
        m.marking('polygon', tags=['hull', 'hangar'], origin=(0.0, 0.0, s * 16.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                  points=[(s * u, v) for u, v in pts], color=color, opacity=0.95)
for x0, x1, color in ((-2.0, 9.0, 'dullBlackBK'), (9.0, 21.0, 'oceanGray5O'), (21.0, 33.0, 'lightGray5L')):  # the island
    m.marking('polygon', tags=['island'], origin=(0.0, 0.0, IZ + 4.0), axis=(0.0, 0.0, 1.0), uDir=(1.0, 0.0, 0.0),
              points=[(x0, FD_H - 1.0), (x1, FD_H - 1.0), (x1 - 3.0, 40.0), (x0 - 3.0, 40.0)], color=color, opacity=0.9)
for s in (-1, 1):  # the hangar's side openings, dark between the dazzle's panels
    for ox in (-84.0, -52.0, -22.0, 54.0, 86.0):
        m.marking('polygon', tags=['hangar'], origin=(0.0, 0.0, s * 14.15), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                  points=[(s * (ox - 6.0), HD + 1.2), (s * (ox + 6.0), HD + 1.2), (s * (ox + 6.0), HD + 4.4), (s * (ox - 6.0), HD + 4.4)],
                  color='dullBlackBK', opacity=0.85)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.9, color='exhaustSoot', effect='stain', opacity=0.3, featherM=0.5)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(120.0, 0.0, s * 6.0), axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.6, 10.4), (0.6, 10.4), (1.3, 3.4), (-1.1, 3.8)], color='rustStain', effect='stain', opacity=0.3, featherM=0.4)
m.marking('slab', tags=['island'], axis='y', fromM=31.6, toM=34.2, color='exhaustSoot', effect='stain', opacity=0.6, featherM=0.6)
m.export(out)
