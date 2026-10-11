# tools/models/blender/ki-43-oscar-blender.py
"""Nakajima Ki-43-IIb Hayabusa ("Oscar"). Original work, AGPL-3.0-or-later.

A Hangar-only duplicate beside downloaded ki-43-oscar. The flying spec stays unchanged. Built from
kit.py through the F4F duplicate's low-wing/inboard-gear template. The drawing measurements describe
the real airplane, not the download; stance, stores and guns are fitted to ki-43-oscar.json.

Figures (read 2026-10-11):
  span 10.84 m (35 ft 7 in), length 8.92 m (29 ft 3 in), wing area 21.4 m2 (230 sq ft),
  airfoil NN-12 mod. 18% root / 8% tip                 CITED, English Wikipedia "Nakajima Ki-43
                                                       Hayabusa", Specifications (Ki-43-IIb)
  3-bladed metal constant-speed propeller, 2.79 m
  (9 ft 2 in) diameter                                CITED, same page and table
  two synchronized 12.7 mm Ho-103 cowl guns, 270 rpg CITED, same page and table
  Ki-43-II introduced shorter stronger wings, a
  3-bladed propeller and a slightly taller canopy    CITED, same page, Development and Variants
  main gear pivots inward; fixed tailwheel            CITED, Greg Goebel "Nakajima Ki-27 & Ki-43",
                                                       read 2026-10-11 (one-hinge fold is ESTIMATE)

Measured 2026-10-11 from Wikimedia Commons File:Nakajima Ki 43-I.svg, found through the English
Wikipedia article image API and fetched through Special:FilePath at width=1600 (returned 1920x2312
PNG). It is the article's only three-view and explicitly a Ki-43-I: its fuselage, fin, tailplane and
planform proportions are the nearest available drawing, while the IIb's cited length/span, longer cowl,
3-blade propeller and slightly taller canopy govern this model. Drawing scale: 1,327 px spinner tip to
tail over the cited 8.92 m = 148.77 px/m. Stations are meters aft of the spinner tip; top is positive.

  d aft nose  top     bottom   half-width              DRAWING MEASUREMENT (+/- about 0.04 m)
     0.20      0.35    -0.40      0.40
     0.45      0.57    -0.67      0.58
     0.80      0.62    -0.70      0.59
     1.20      0.63    -0.72      0.58
     1.60      0.64    -0.65      0.59
     2.00      0.64    -0.69      0.56
     2.40      0.55    -0.71      0.54
     2.80      0.55    -0.71      0.50
     3.20      0.54    -0.71      0.48
     3.60      0.54    -0.70      0.46
     4.00      0.54    -0.68      0.42
     4.50      0.44    -0.66      0.38
     5.00      0.45    -0.62      0.34
     5.60      0.40    -0.57      0.30
     6.20      0.34    -0.52      0.25
     6.80      0.28    -0.47      0.22
     7.40      0.28    -0.42      0.18
     8.00      0.16    -0.38      0.16
     8.50      0.19    -0.33      0.09
     8.90      0.15    -0.15      0.03
  windscreen front 2.18 m; crown 2.75-3.20 m; canopy rear 3.68 m
                                                       DRAWING MEASUREMENT, canopy raised 0.08 m
                                                       for the cited II "slightly taller" (ESTIMATE)
  The corrected upper outline follows the outer silhouette at 1.60, 2.00,
  4.00 and 4.50 m; the superseded values followed cowl-panel or wing-root
  lines inside the silhouette.                              DRAWING MEASUREMENT
  fin root 7.2-8.9 m, visible height 1.17 m above its 0.17 m
  dorsal root (about 1.34 m above the thrust line); tailplane LE 7.45 m,
  span 3.45 m, root chord 1.35 m                       DRAWING MEASUREMENT (+/- about 0.08 m)
  wing quarter-chord at 30% semispan 2.32 m aft nose  DRAWING MEASUREMENT (+/- about 0.06 m); origin
  taper 0.38, unswept quarter chord, 5.5 deg dihedral;
  control-surface spans and hinges                    ESTIMATE from drawing
  cross-section centers/exponents, cowl lip, fillets,
  exact canopy widths and transverse shoulder/roof
  section fractions                                   ESTIMATE constrained by outlines;
  canopy rails are fitted 0.02 m into the measured fuselage skin
  main wheel 0.58 m diameter; gear station 1.40 m     ESTIMATE from drawing proportions
  wheel bottoms 1.843 m below origin at x 0.348;
  tailwheel x -5.375 and 0.595 m below origin         FITTED to ki-43-oscar.json gear fields
  cowl guns around [1.1, 0.35, +/-0.25] m             FITTED to ki-43-oscar.json combat.guns
  proposed real-cockpit eye [-0.75, 0.65, 0] m        DRAWING MEASUREMENT, not copied from download
  IJA green/gray-green, six bordered hinomaru, yellow
  leading-edge strips; exhausts, pitot, antenna, wear ESTIMATE (no unit photo or paint chip read)
  additions sink at least 0.02 m into supports        modeling choice: no coplanar faces (DP0)

Frame: glTF, +x forward, +y up, +z right, meters. Origin: the drawing's wing quarter-chord at
30% semispan on the thrust line. Pose: gear down, thrust line level.
Leaves out: cockpit interior, wheel-well interiors, stores/racks (attachment is spec data), unit
markings and the Ki-43's Fowler translation (the visual flaps hinge only).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'ki43b'
# --- CITED
SPAN, LENGTH, WING_AREA = 10.84, 8.92, 21.4
BLADES, PROP_DIAMETER = 3, 2.79
ROOT_T, TIP_T = 0.18, 0.08
# --- DRAWING MEASUREMENT / ESTIMATE, labeled in the header
ORIGIN_AFT_NOSE_M = 2.32
TAPER, DIHEDRAL_DEG, ROOT_Y = 0.38, 5.5, -0.42
UPPER, LOWER = 'ijaGreen', 'underside'

# (meters aft spinner tip, half-width, top, bottom, superellipse exponent), tail to nose.
FUSELAGE = [
    (8.90, .03, .15, -.15, 2.2), (8.50, .09, .19, -.33, 2.2),
    (8.00, .16, .16, -.38, 2.2), (7.40, .18, .28, -.42, 2.2),
    (6.80, .22, .28, -.47, 2.2), (6.20, .25, .34, -.52, 2.2),
    (5.60, .30, .40, -.57, 2.2), (5.00, .34, .45, -.62, 2.2),
    (4.50, .38, .44, -.66, 2.2), (4.00, .42, .54, -.68, 2.2),
    (3.60, .46, .54, -.70, 2.2), (3.20, .48, .54, -.71, 2.2),
    (2.80, .50, .55, -.71, 2.2), (2.40, .54, .55, -.71, 2.2),
    (2.00, .56, .64, -.69, 2.2), (1.60, .59, .64, -.65, 2.1),
    (1.20, .58, .63, -.72, 2.0), (.80, .59, .62, -.70, 2.0),
    (.45, .58, .57, -.67, 2.0), (.20, .40, .35, -.40, 2.0),
]
# Longitudinal station, rail half-width, crown. The rail height is fitted to the
# measured fuselage section below; the transverse shoulder/roof shape is ESTIMATE.
CANOPY_PROFILE = [
    (3.68, .12, .64), (3.42, .26, .82), (3.15, .34, .92),
    (2.78, .36, .94), (2.46, .32, .88), (2.18, .16, .62),
]
CANOPY_FRAMES = tuple(ORIGIN_AFT_NOSE_M - d for d in (3.42, 3.15, 2.78, 2.46))
TAILPLANE = dict(span=3.45, le=7.45, root=1.35, taper=.48, y=.17, sweep=11.0)
FIN = dict(root=1.72, taper=.30, height=1.17, y=.17)
PROP = dict(hub=.27, chord=.22, spinner_r=.25, spinner_len=.36)
GEAR = dict(x=.348, z=1.40, y=-.42, bottom=1.843, wheel_r=.29, wheel_w=.18)
TAILWHEEL = dict(x=-5.375, y=-.25, bottom=.595, wheel_r=.105, wheel_w=.06)

SEGMENTS, SUBDIVIDE, SPAN_SEGMENTS = 96, 5, 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {.0375, .0625, .125, .175, .225, .275, .35, .45, .55, .65, .75, .85}))
AILERON, FLAP, ELEVATOR, RUDDER = (.60, .96, .74), (.10, .57, .72), (.08, .97, .68), (.05, .93, .64)
FILLET = dict(le=1.55, te=4.05, half_w=.16, half_h=.11)
EMBED_M = .02
L, S = LENGTH, SPAN


def X(d):
    return ORIGIN_AFT_NOSE_M - d


def ring(d, w, top, bottom, exponent):
    return (X(d), w, (top - bottom) / 2, (top + bottom) / 2, exponent)


_FUS, _ = kit._refine_shape([ring(*s) for s in FUSELAGE], SUBDIVIDE)


def fus_section(d):
    x = X(d)
    i = next(k for k in range(len(_FUS) - 1) if _FUS[k][0] <= x <= _FUS[k + 1][0])
    t = (x - _FUS[i][0]) / (_FUS[i + 1][0] - _FUS[i][0])
    return tuple(_FUS[i][c] + (_FUS[i + 1][c] - _FUS[i][c]) * t for c in (1, 2, 3, 4))


def fus_side_z(d, y):
    hw, hh, cy, n = fus_section(d)
    return hw * max(0.0, 1.0 - abs((y - cy) / hh) ** n) ** (1.0 / n)


def fus_top_y(d, z):
    hw, hh, cy, n = fus_section(d)
    return cy + hh * max(0.0, 1.0 - abs(z / hw) ** n) ** (1.0 / n)


def canopy_station(d, rail_width, crown_y):
    """Eight-value fitted section: measured longitudinal profile, estimated transverse form."""
    rail_y = fus_top_y(d, rail_width) - EMBED_M
    height = crown_y - rail_y
    return (X(d), rail_width, rail_y,
            .88 * rail_width, rail_y + .36 * height,
            .58 * rail_width, rail_y + .84 * height,
            crown_y)


CANOPY = [canopy_station(*s) for s in CANOPY_PROFILE]


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = math.degrees(math.atan(.25 * (root_chord - tip_chord) / (S / 2)))
tan_sw, tan_di = math.tan(math.radians(sweep)), math.tan(math.radians(DIHEDRAL_DEG))


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def le_x(z):
    return .25 * root_chord - abs(z) * tan_sw


def wing_y(z):
    return ROOT_Y + abs(z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [ring(*s) for s in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE,
               lower_role=LOWER, refinement='shape')
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = ROOT_Y + .45 * ROOT_T * root_chord - FILLET['half_h']
    fz = fus_side_z(mid, fy) + FILLET['half_w'] - .08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), .03, .03, ROOT_Y),
                           (X(mid), FILLET['half_w'], FILLET['half_h'], fy),
                           (X(FILLET['le']), .03, .03, ROOT_Y)], segments=24,
                   center_z=side * fz, lower_role=LOWER, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    m.faired_canopy('glazing', UPPER, CANOPY, list(CANOPY_FRAMES), bar=.018)

controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
breaks = [0.0, GEAR['z'], S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = (chord_at(z) for z in (z0, z1))
        a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
        m.wing(UPPER, le_x(z0), wing_y(z0), c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1,
               root_z=z0, stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls, lower_role=LOWER)

tp = TAILPLANE
with m.tagged('tailplane'), m.shared_chart():
    m.wing(UPPER, X(tp['le']), tp['y'], tp['root'], tp['taper'] * tp['root'], tp['span'],
           sweep_deg=tp['sweep'], thickness=.10, lower_role=LOWER, stations=STATIONS,
           span_segments=SPAN_SEGMENTS, controls=[(ELEVATOR[0] * tp['span'] / 2, ELEVATOR[1] * tp['span'] / 2, ELEVATOR[2], 'Elevator')])
fin_root, fin_h = FIN['root'], FIN['height']
with m.tagged('fin'), m.shared_chart():
    m.fin(UPPER, X(LENGTH) + fin_root, FIN['y'], fin_root, FIN['taper'] * fin_root, fin_h,
          sweep_deg=math.degrees(math.atan((fin_root - FIN['taper'] * fin_root) / fin_h)),
          stations=STATIONS, span_segments=SPAN_SEGMENTS,
          controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2], 'Rudder')])

pr = PROP
with m.tagged('prop'), m.shared_chart():
    m.propeller('dark', (X(pr['hub']), 0., 0.), PROP_DIAMETER, BLADES, pr['chord'], pr['spinner_r'], pr['spinner_len'],
                blade_sections=[(.13, .9, 44.), (.35, 1.05, 33.), (.6, 1., 25.), (.85, .8, 19.), (1., .5, 16.)])

g, tw = GEAR, TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], g['y'], side * g['z']), g['bottom'] + g['y'], g['wheel_r'], g['wheel_w'], node=name)
    # The tailwheel is fixed on the cited description, so do not claim a false motion node.
    m.gear_leg('dark', (tw['x'], tw['y'], 0.), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=.035)

with m.tagged('fittings'), m.shared_chart():
    strut_r = .18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.box('dark', (g['x'], g['y'] - .55 * (g['bottom'] + g['y']), side * (g['z'] - strut_r + EMBED_M - .006)), (.34, .76, .012), node=name)
    for side in (-1, 1):
        m.gun_barrel('dark', (.82, .42, side * .25), 0., 2., 1.05, .014)
        for k in range(3):
            d, y = 1.15 + .14 * k, -.20
            m.revolve('dark', (X(d), y, side * (fus_side_z(d, y) - .04)), (-1., -.12, side * .45), [(0., .025), (.16, .021)], 12)
    pz = -4.55
    m.strut('dark', (le_x(pz) - .08, wing_y(pz), pz), (le_x(pz) + .36, wing_y(pz), pz), .008, sides=6)
    m.strut('dark', (X(4.15), fus_top_y(4.15, 0.) - .03, 0.), (X(4.33), fus_top_y(4.15, 0.) + .40, 0.), .012, .006, sides=6)

border = .06
for side in (-1, 1):
    z = side * .68 * S / 2
    x = le_x(z) - .43 * chord_at(z)
    for up in (1., -1.):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0., up, 0.), radiusM=.57, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0., up, 0.), radiusM=.57 - border, color='hinomaruRed')
    d = 5.15
    hw, hh, cy, _n = fus_section(d)
    center = (X(d), cy, side * hw)
    m.marking('disc', tags=['fuselage'], center=center, axis=(0., 0., float(side)), radiusM=.36, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=center, axis=(0., 0., float(side)), radiusM=.30, color='hinomaruRed')
    zi, zo = .28, 1.82
    hs = (zo - zi) / 2
    m.marking('polygon', tags=['wing'], origin=(le_x(0.), ROOT_Y, side * (zi + zo) / 2), axis=(1., 0., 0.), uDir=(0., 0., 1.),
              points=[(-hs, -.55), (hs, -.55), (hs, .55), (-hs, .55)], color='idYellow')
    streak = [(-.65, -.10), (1.15, -.26), (1.15, .08), (-.65, .10)]
    m.marking('polygon', tags=['fuselage'], origin=(X(1.45), -.20, 0.), axis=(0., 0., float(side)), uDir=(-1., 0., 0.),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=.55, featherM=.15)
m.marking('polygon', tags=['wing'], origin=(-.20, wing_y(-.9), -.9), axis=(0., 1., 0.), uDir=(1., 0., 0.),
          points=[(-.8, -.22), (.55, -.22), (.55, .30), (-.8, .30)], color='walkwayDark', effect='wear', opacity=.8, featherM=.1)
m.export(out)
