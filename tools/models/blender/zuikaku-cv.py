"""Zuikaku, Shokaku-class fleet carrier, late October 1944. Original work,
AGPL-3.0-or-later.

CITED (English Wikipedia, "Shokaku-class aircraft carrier", Specifications and
Background and description / Flight deck and hangars, read 2026-10-11):
  257.5 m overall length, 29 m maximum beam, 9.32 m deep-load draft, 23 m
  moulded depth, 34.5 kn, and a 242.2 x 29.0 m flight deck. The upper hangar
  was about 200 m long, 18.5-24 m wide and 4.85 m high; the lower was about
  20 m shorter, 17.5-20 m wide and 4.7 m high. Three elevators: 13 x 16 m
  forward and two 13 x 12 m. Ten transverse arrestor wires. Eight twin Type
  89 12.7 cm/40 mounts; the article records the much larger historical 1944
  light-AA fit, which this project's four-triple balanced fit does not copy.
CITED / MEASURED (Wikimedia Commons, "Fig of japanese aircraft carrier
  Zuikaku in 1944.gif", SnowCloudInSummer, CC BY-SA 3.0, read 2026-10-11;
  the file cites Nihon Kaigun Kantei Zumenshu, 4th ed. (1978), and Shashin
  Nihon no Gunkan vol. 3 (1989); downloaded through Commons API/FilePath):
  The 1100 x 500 profile/plan is explicitly October 1944. Its 0-50 m bar is
  205 px (4.10 px/m); the 257.5 m hull reads 1037 px (4.03 px/m). The model
  uses 4.03 px/m longitudinally, bow right / +x, and records these stations:
    x m       -128.8 -121 -110 -95 -60   0  +60 +95 +115 +128.8
    half-beam    0.5  4.0  8.4 11.5 13.0 13 13.0 11.6 6.5  0.4
    deck y m     5.5  7.5  8.3  9.0  9.4 9.4 9.4 10.0 10.8 11.5
  These are MEASURED from the colored hull envelope at waterline/deck, then
  symmetrized; the class record's 26 m waterline beam (the existing ShipSpec
  estimate) caps the measured maximum. The drawing measures the starboard
  island center at x about +35 m, three elevators near +72, 0 and -70 m, the
  long island/funnel group, deck-edge AA sponsons, and the 1944 deck/hull
  camouflage used below. The script does not trace or reproduce the drawing.
FITTED TO THE EXISTING SIMULATION CONTRACT (content/ships/zuikaku-cv.json):
  FlightDeck is exactly 242.2 x 29.0 m with its top at y=15.5 m; that height
  and the 26.0 m waterline beam remain the spec's ESTIMATES because landing,
  trap and hit-volume tuning already use them. All eight twin Type 89 mounts
  and all four balanced triple Type 96 mounts use the spec's exact x/y/z and
  stand on modeled sponsons. They become train/elevate locators in the build.
ESTIMATE / MODELING CHOICE:
  hull sectional fullness between measured stations, hangar ends and openings,
  every platform thickness/support, island tier heights, funnel/mast/radar and
  director dimensions, rail/rigging runs, boats and fine fittings. Camouflage
  polygons follow the cited October 1944 drawing's character but are simplified.

Frame: +x bow, +y up, +z starboard; waterline y=0; origin at midships.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B, DRAFT = 257.5, 26.0, 9.32
FD_L, FD_W, FD_H, FD_T = 242.2, 29.0, 15.5, 0.45
EMBED_M = 0.02
SUBDIVIDE = 16
HANGAR_DECK = 9.4
GALLERY_Y = 13.35
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

# MEASURED stations from the cited October 1944 profile/plan, symmetrized; see header.
STATIONS = [
    (-L / 2, 0.5, 6.0, 5.5, 0.8),
    (-121.0, 4.0, 8.2, 7.5, 5.5),
    (-110.0, 8.4, 9.0, 8.3, 9.6),
    (-95.0, 11.5, DRAFT, 9.0, 12.2),
    (-60.0, B / 2, DRAFT, 9.4, 13.6),
    (60.0, B / 2, DRAFT, 9.4, 13.6),
    (95.0, 11.6, 8.9, 10.0, 12.4),
    (115.0, 6.5, 7.6, 10.8, 8.0),
    (L / 2, 0.4, 4.2, 11.5, 0.8),
]

out, opts = kit.cli_args()
m = kit.Model('zuikaku-cv', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, node='Hull', deck_role='deck', deck_node='MainDeck',
                 below_role='antifouling', below_node='Bottom', subdivide=SUBDIVIDE)

stand = naval.stander(m, EMBED_M)
inside = lambda x: m.hull_at(x)[3]  # noqa: E731

# Two enclosed hangars read as a deep slab-sided carrier hull. Their upper wall ends under the flight deck.
with m.tagged('hangar'):
    for s in (-1, 1):
        m.box('superstructure', (-2.0, HANGAR_DECK - EMBED_M, s * 12.2),
              (194.0, FD_H - FD_T - HANGAR_DECK + 2 * EMBED_M, 0.34))
        m.box('superstructure', (-5.0, 5.1, s * 11.2), (174.0, HANGAR_DECK - 5.1 - 0.04, 0.28))
    for x in (-99.0, 95.0):
        m.box('superstructure', (x, HANGAR_DECK - EMBED_M, 0.0),
              (0.32, FD_H - FD_T - HANGAR_DECK + 2 * EMBED_M, 24.2))
    for x in (-92.0, 82.0):
        m.box('superstructure', (x, 5.1, 0.0), (0.28, HANGAR_DECK - 5.1, 22.2))

with m.tagged('flightdeck'):
    m.deck('flightDeck', (0.0, 0.0), FD_L, FD_W, FD_H, FD_T, node='FlightDeck')

with m.tagged('supports'), m.shared_chart():
    for x in (-118.0, -112.0, -104.0, 100.0, 108.0, 116.0):
        for s in (-1, 1):
            m.strut('fitting', (x, m.hull_at(x)[2] - EMBED_M, s * max(0.5, inside(x) - 0.5)),
                    (x, FD_H - FD_T + EMBED_M, s * 11.5), 0.2, sides=6)
    for x in (-86.0, -58.0, -30.0, 0.0, 66.0, 92.0):
        for s in (-1, 1):
            m.strut('fitting', (x, m.hull_at(x)[2] - 0.4, s * (inside(x) - 0.3)),
                    (x, GALLERY_Y, s * 15.0), 0.14, sides=6)

# All gun sponsons are geometry first, then the spec's exact mounts stand on them.
with m.tagged('sponsons'):
    for name, g in naval.armament('zuikaku-cv'):
        x, y, z = g['x'], g['y'], g['z']
        if name.startswith('Turret'):
            length, width, thickness = 6.3, 6.2, 0.42
            inner = math.copysign(min(abs(z) - 1.6, inside(x) - 0.2), z)
            center_z = (inner + math.copysign(abs(z) + width / 2, z)) / 2
            total_w = abs(abs(z) + width / 2 - abs(inner))
            m.box('fitting', (x, y - thickness, center_z), (length, thickness, total_w))
            m.strut('fitting', (x, y - 3.2, inner), (x, y - 0.28, math.copysign(abs(z) + 1.5, z)), 0.17, sides=6)
        else:
            length, width, thickness = 4.8, 4.8, 0.35
            m.box('fitting', (x, y - thickness, z), (length, thickness, width))
            m.strut('fitting', (x, y - 2.7, math.copysign(inside(x), z)),
                    (x, y - 0.25, z), 0.13, sides=6)

with m.tagged('aa'), m.shared_chart():
    for name, g in naval.armament('zuikaku-cv'):
        if g['kit'] in naval.MOUNTS:
            naval.MOUNTS[g['kit']](m, name, g['x'], g['y'], g['z'], g['bearingDeg'], EMBED_M)
        if DRY_RUN:
            print(f"MOUNT {name} {g['x']} {g['y']} {g['z']}")

# Starboard island: its measured longitudinal station and outline; heights are estimates fitted to the silhouette.
IZ = 16.6
i1, i2, i3 = FD_H + 4.0, FD_H + 7.3, FD_H + 10.2
with m.tagged('island'):
    m.rounded_box('superstructure', (35.0, FD_H - EMBED_M, IZ), 29.0, 6.8, 4.0 + EMBED_M, 1.4)
    m.rounded_box('superstructure', (37.0, i1 - EMBED_M, IZ), 23.0, 6.2, 3.3 + EMBED_M, 1.3)
    m.rounded_box('superstructure', (41.0, i2 - EMBED_M, IZ - 0.1), 14.0, 5.8, 2.9 + EMBED_M, 1.2)
    naval.oval_funnel(m, (28.0, i1 - 0.4, IZ + 0.8), (25.0, 34.4, IZ + 2.3),
                      (4.2, 2.1), (3.5, 1.8), bars=3)

with m.tagged('islandfittings'), m.shared_chart():
    naval.window_band(m, 41.0, i2 + 0.8, IZ - 0.1, 14.0, 5.8, 1.2, 0.85, spacing=0.9)
    naval.window_band(m, 37.0, i1 + 1.1, IZ, 23.0, 6.2, 1.3, 0.65, spacing=1.25, visor=0.3)
    for x, y in ((46.0, i3), (31.0, i2)):
        naval.director(m, x, y - EMBED_M, IZ, 0.9, (3.2, 2.6, 1.7), 4.0)
    mast_top = (39.0, 39.0, IZ)
    naval.tripod(m, mast_top, [(41.5, i3 - EMBED_M, IZ), (37.0, i2 - EMBED_M, IZ - 2.0),
                               (37.0, i2 - EMBED_M, IZ + 2.0)], 0.26, 0.15)
    naval.platform(m, mast_top[0], mast_top[1] - 2.2, IZ, 2.5, 2.4)
    m.lattice_mast('fitting', (mast_top[0], mast_top[1] - 2.0, IZ), 4.2, 4.2, 0.45, 1, 0.06)
    m.strut('fitting', mast_top, (mast_top[0], mast_top[1] + 5.5, IZ), 0.11, 0.05, sides=6)
    m.strut('fitting', (mast_top[0], mast_top[1] + 2.7, IZ - 3.0),
            (mast_top[0], mast_top[1] + 2.7, IZ + 3.4), 0.07, sides=6)
    m.strut('fitting', (mast_top[0], mast_top[1] - 4.0, IZ), (34.0, mast_top[1] - 2.6, IZ), 0.07, sides=6)
    m.box('fitting', (39.6, mast_top[1] + 0.7, IZ), (0.35, 1.0, 1.8))
    for x in (24.0, 48.0):
        naval.searchlight(m, x, i1 + EMBED_M, IZ + 1.5, r=0.48)
    naval.crane(m, (20.5, FD_H - 0.06, IZ + 1.5), 6.5,
                (14.5, FD_H + 4.5, IZ + 3.0), r=0.28)

# The three cited elevators: exact plan dimensions, positions MEASURED/ESTIMATE from the 1944 drawing.
with m.tagged('elevators'), m.shared_chart():
    for x, length, width in ((72.0, 16.0, 13.0), (0.0, 13.0, 12.0), (-70.0, 13.0, 12.0)):
        m.box('fitting', (x, FD_H - EMBED_M, 0.0), (length, 0.05, width))

with m.tagged('deckfittings'), m.shared_chart():
    naval.capstan(m, 116.0, stand(116.0, 1.0), 0.0, EMBED_M)
    for s in (-1, 1):
        naval.bitts(m, 109.0, stand(109.0, 1.4), s * (inside(109.0) - 1.0), True, EMBED_M)
        for x in (-84.0, -55.0, -27.0, 58.0, 86.0):
            naval.carley_float(m, x, HANGAR_DECK + 1.4, s * 12.38, 2.5, s)
    for x, s in ((-48.0, -1), (-24.0, 1), (58.0, -1)):
        naval.boat(m, x, HANGAR_DECK + 0.2, s * 10.7, 7.0, 2.0, s)

with m.tagged('anchors'), m.shared_chart():
    for s in (-1, 1):
        x = 112.0
        m.box('dark', (x, m.hull_at(x)[2] - 2.5, s * (m.hull_at(x)[3] + 0.05)), (1.5, 1.8, 0.24))

GAPS = [(g['x'] - 3.5, g['x'] + 3.5) for _, g in naval.armament('zuikaku-cv')]
with m.tagged('rails'), m.shared_chart():
    for s in (-1, 1):
        side_gaps = [g for g, (_, mt) in zip(GAPS, naval.armament('zuikaku-cv')) if mt['z'] * s > 0]
        if s == 1:
            side_gaps.append((18.0, 52.0))
        for xs in naval.runs(-108.0, 102.0, 6.0, side_gaps):
            m.railing('fitting', [(x, GALLERY_Y - EMBED_M, s * 15.05) for x in xs], height=0.95, post_m=2.4)
    m.railing('fitting', [(x, i3 - EMBED_M, IZ + 2.5) for x in (35.0, 39.0, 44.0, 47.0)],
              height=0.9, post_m=1.2)

with m.tagged('rigging'), m.shared_chart():
    # Stays terminate on the starboard edge; a diagonal crossing the after centerline would be a
    # real landing obstruction and the carrier grid correctly rejects it.
    m.strut('fitting', (mast_top[0], mast_top[1] + 3.0, IZ + 0.2),
            (-35.0, FD_H + 1.0, 14.2), 0.018, sides=4)
    m.strut('fitting', (mast_top[0], mast_top[1] + 2.0, IZ + 0.3),
            (78.0, FD_H + 0.8, 13.8), 0.018, sides=4)

# Surface detail for the skin; no external texture or drawing pixels are copied.
for s in (-1, 1):
    for x in [v / 10 for v in range(-1080, 1081, 30)]:
        m.detail('porthole', (x, 6.8, s * (m.hull_at(x)[3] + 1.0)), (0.0, 0.0, float(s)), radius=0.18)
    for x0 in range(-108, 108, 18):
        m.detail('strip', (x0, m.hull_at(x0)[2] - 0.12, s * (m.hull_at(x0)[3] + 1.0)),
                 (0.0, 0.0, float(s)),
                 to=[x0 + 18.0, m.hull_at(x0 + 18.0)[2] - 0.12,
                     s * (m.hull_at(x0 + 18.0)[3] + 1.0)], width=0.13, proud=0.03)
for x in (25.0, 34.0, 43.0):
    m.detail('door', (x, FD_H + 1.05, IZ + 3.45), (0.0, 0.0, 1.0), w=0.8, h=1.9)
    m.detail('ladder', (x + 1.4, FD_H + 2.2, IZ + 3.45), (0.0, 0.0, 1.0), h=4.0)
m.detail('louver', (28.0, i1 + 2.0, IZ + 3.15), (0.0, 0.0, 1.0), w=1.4, h=1.0, slats=6)

# Planks, the ten cited arrestor wires and the dotted centerline.
m.marking('grid', tags=['hull'], spacingM=[None, 1.8, None], widthM=0.016, depth=0.6)
m.marking('planks', tags=['flightdeck'], widthM=0.15, lengthM=6.0, contrast=0.08, seam=0.3)
for x in [-103.0 + i * 5.7 for i in range(10)]:
    m.marking('polygon', tags=['flightdeck'], origin=(0.0, FD_H, 0.0), axis=(0.0, 1.0, 0.0),
              uDir=(1.0, 0.0, 0.0), points=[(x - 0.06, -13.5), (x + 0.06, -13.5),
                                             (x + 0.06, 13.5), (x - 0.06, 13.5)],
              color='dullBlackBK', opacity=0.9)
for x in range(-112, 112, 8):
    m.marking('polygon', tags=['flightdeck'], origin=(0.0, FD_H, 0.0), axis=(0.0, 1.0, 0.0),
              uDir=(1.0, 0.0, 0.0), points=[(x, -0.11), (x + 3.4, -0.11),
                                             (x + 3.4, 0.11), (x, 0.11)],
              color='lightGray5L', opacity=0.75)

# Simplified late-1944 false-merchant camouflage, guided by the cited drawing rather than traced.
SIDE_PANELS = [
    (-129.0, -103.0, 8.0, 'ijnCamoDark'), (-103.0, -76.0, -7.0, 'ijnCamoGreen'),
    (-76.0, -44.0, 9.0, 'ijnCamoLight'), (-44.0, -14.0, -8.0, 'ijnCamoGreen'),
    (-14.0, 18.0, 7.0, 'ijnCamoDark'), (18.0, 48.0, -8.0, 'ijnCamoGreen'),
    (48.0, 78.0, 7.0, 'ijnCamoLight'), (78.0, 106.0, -7.0, 'ijnCamoGreen'),
    (106.0, 129.0, 5.0, 'ijnCamoDark'),
]
for s in (-1, 1):
    shift = 0.0 if s < 0 else 7.0
    for x0, x1, rake, color in SIDE_PANELS:
        a, b = x0 + shift, x1 + shift
        m.marking('polygon', tags=['hull', 'hangar'], origin=(0.0, 0.0, s * 15.0),
                  axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                  points=[(s * a, -0.5), (s * b, -0.5), (s * (b + rake), FD_H),
                          (s * (a + rake), FD_H)], color=color, opacity=0.9)
for x0, x1, color, skew in ((-116.0, -84.0, 'ijnCamoDark', 18.0),
                            (-76.0, -36.0, 'ijnCamoGreen', 24.0),
                            (-18.0, 22.0, 'ijnCamoDark', 26.0),
                            (38.0, 74.0, 'ijnCamoGreen', 22.0),
                            (88.0, 118.0, 'ijnCamoDark', 16.0)):
    m.marking('polygon', tags=['flightdeck'], origin=(0.0, FD_H, 0.0), axis=(0.0, 1.0, 0.0),
              uDir=(1.0, 0.0, 0.0), points=[(x0, -14.5), (x1, -14.5),
                                             (x1 - skew, 14.5), (x0 - skew, 14.5)],
              color=color, opacity=0.82)
for x0, x1, color in ((20.5, 31.0, 'ijnCamoDark'), (31.0, 42.0, 'ijnCamoGreen'),
                      (42.0, 50.0, 'ijnCamoLight')):
    m.marking('polygon', tags=['island'], origin=(0.0, 0.0, IZ + 4.0),
              axis=(0.0, 0.0, 1.0), uDir=(1.0, 0.0, 0.0),
              points=[(x0, FD_H - 1.0), (x1, FD_H - 1.0),
                      (x1 - 2.0, 31.0), (x0 - 2.0, 31.0)], color=color, opacity=0.9)

# Dark hangar openings, grime and light rust keep the painted silhouette from reading as a solid slab.
for s in (-1, 1):
    for x in (-78.0, -48.0, -18.0, 58.0, 82.0):
        if s == 1 and 18.0 < x < 54.0:
            continue
        m.marking('polygon', tags=['hangar'], origin=(0.0, 0.0, s * 12.4),
                  axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
                  points=[(s * (x - 5.0), HANGAR_DECK + 0.8),
                          (s * (x + 5.0), HANGAR_DECK + 0.8),
                          (s * (x + 5.0), HANGAR_DECK + 3.6),
                          (s * (x - 5.0), HANGAR_DECK + 3.6)],
                  color='dullBlackBK', opacity=0.82)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.7, toM=0.8,
          color='exhaustSoot', effect='stain', opacity=0.28, featherM=0.5)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(111.0, 0.0, s * 7.0),
              axis=(0.0, 0.0, float(s)), uDir=(float(s), 0.0, 0.0),
              points=[(-0.5, 9.5), (0.5, 9.5), (1.1, 3.6), (-0.9, 4.0)],
              color='rustStain', effect='stain', opacity=0.28, featherM=0.35)
m.marking('slab', tags=['island'], axis='y', fromM=32.0, toM=35.0,
          color='exhaustSoot', effect='stain', opacity=0.6, featherM=0.6)

m.export(out)
