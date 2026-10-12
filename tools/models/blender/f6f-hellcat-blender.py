# tools/models/blender/f6f-hellcat-blender.py
"""Grumman F6F-5 Hellcat. Original work, AGPL-3.0-or-later.

A second Hellcat beside the Sketchfab download (content/aircraft/f6f-hellcat.glb stays): built on the
Ki-84's single-engine template (R3) as the TBM-3 is, with the same DP0 detail, so the two can be compared in
the Hangar and the new one swapped in when it is approved (docs/blender-aircraft.md, "Promoting a duplicate").
Stations are meters aft of the spinner tip, read off the drawing below, except the ones fitted to
content/aircraft/f6f-hellcat.json (the stance) so that a swap needs no flight-model change; those say so.

Figures (read 2026-10-11):
  span 13.06 m (42 ft 10 in), length 10.24 m (33 ft 7 in), wing area 31.0 m2 (334 sq ft), airfoil NACA 23015.6
    root / NACA 23009 tip, 3-bladed Hamilton Standard propeller 3.99 m (13 ft 1 in)
                                                        CITED, English Wikipedia "Grumman F6F Hellcat",
                                                        Specifications (F6F-5)
  main gear retracts aft, the struts turning 90 degrees  CITED (same page, Design); the model swings the leg
                                                        aft and leaves the wheel upright: one hinge, ESTIMATE
  six .50 in wings guns, three a side                    CITED (same page, Specifications)
  stance: wheels 2.42 m below the origin at x 0.62, tailwheel at x -6.0, 1.318 m below
                                                        FITTED to f6f-hellcat.json gear.heightM / mainX /
                                                        thirdX / thirdHeightM, so a swap leaves the sim alone
  glossy sea blue overall (the US Navy's 1944-45 scheme; palette role seaBlue)
                                                        ESTIMATE (no chip read)
  1943 star-and-bar insignia (blue outline): both fuselage sides, upper left and lower right wing
                                                        ESTIMATE positions and sizes (the Navy's wing rule)
  flap span and hinge, fuselage superellipse exponents, wing/tail thickness, exhaust stubs, pitot,
  leg covers                                            ESTIMATE
  additions sink at least 0.02 m into what they sit on  modeling choice: no coplanar faces (DP0)

REAL-AIRPLANE MEASUREMENT (re-read 2026-10-11, fourth pass): Wikimedia Commons "Grumman F6F Hellcat 3-view
line drawing.svg" (Kaboldy), rasterized through Special:FilePath at 3,840 px. One scale for all three views:
spinner tip x=67 to rudder trailing edge x=2,612 in both side and top view, 248.53 px/m. The top view's
wingtips then span 13.25 m against the cited 13.06 m (+1.5%) and the front view's 13.22 m, so spanwise
wing and tailplane figures use the span scale (252.1 px/m) and everything else the length scale. Side-view
heights are meters above the propeller axis (row 628.5, the hub's center; top-view centerline row 2,925.5).
  wing quarter chord at 30% semispan 3.04 m aft of the spinner tip (leading edge 2.35 m, trailing edge
    5.11 m): the model origin (the docs' 3.03 m, confirmed to 1 cm)      DRAWING-MEASURED
  cross-check: the drawn main wheel (gray circle, 0.397 m radius) has its center 2.43 m aft of the spinner
    (x 0.61 against the spec's 0.62) and its bottom 2.42 m under the axis, the spec's gear.heightM exactly.
    The drawn tailwheel sits at x -5.85 (spec -6.0) and 0.24 m higher than the spec's, the drawn ground
    line at 11.8 deg against the spec's 9.49 deg stance: the spec's tail was fitted to the download, and
    the stance is the spec's to change, not this script's                    DRAWING-MEASURED, NOT APPLIED
  fuselage side silhouette and top-view half-widths: BODY_M below (+/-0.02 m). The wing hides the belly
    from 2.6 to 4.4 m, where the drawn belly line (-1.034 m) is used; the drop tank and its sway braces are
    left out. From the windscreen aft, BODY_M's top is the main body's shoulder and TURTLEDECK carries the
    drawn top line with the hood's own trapezoid section             DRAWING-MEASURED (shoulder ESTIMATE)
  cowl: flat front face at 0.62 m, 1.29 m tall, lip rounding into the top line by 1.0 m; hub cap 0.15 m
    radius ahead of it, the blades in its plane 0.40 m aft of the tip        DRAWING-MEASURED
  hood and windscreen: windscreen base 3.30 m at +1.04 m, rising at 48 deg to 3.62 m at +1.40 m; roof
    +1.467 m at 3.9-4.05 m, descending to +1.41 m at the hood's rear frame, 4.42 m. In plan the windscreen
    widens from 0.26 m to the hood's 0.43 m half-width at 3.70 m. The front and top views agree on the
    section: a 0.32 m roof panel and straight sides falling at about 25 deg from vertical, the roof edge 0.04 m
    under the crown. Aft of the hood a metal turtledeck descends straight, +1.37 m at 4.45 m to +0.66 m
    at 7.5 m, in the same section                                             DRAWING-MEASURED
  vertical tail: FIN_LE / FIN_TE below, traced from the outer outline: the dorsal fillet rises from the
    deck at 8.4 m into a straight leading edge, a rounded crown +1.89 m at 9.45 m, and a trailing edge raked
    from 10.24 m at the rudder's foot (-0.10 m) to 9.88 m at +1.80 m. Rudder hinge straight at 9.655 m; the
    drawn horn balance above +1.61 m is left fixed with the fin cap (ESTIMATE simplification)
                                                                         DRAWING-MEASURED
  tailplane: TAILPLANE below, rounded tips, 5.78 m span, straight trailing edge 10.02 m, elevator hinge
    straight at 9.39 m, chord line +0.19 m, 0.25 m thick at the root (side view)  DRAWING-MEASURED
  wing: straight leading and trailing edges (root chord 3.27 m, 1.62 m at 6.30 m, taper 0.48), a rounded
    tip traced from 6.30 to 6.53 m (WINGTIP), every chord scaled by 0.990 about the quarter-chord line so
    the area is the cited 31.0 m2; flat center section with its chord line 0.40 m under the axis out to the
    fold at 2.10 m, outer panels at 7.5 deg dihedral (front view: tip chord line +0.18 m)
                                                                         DRAWING-MEASURED, FITTED (area)
  aileron 4.33-6.16 m from the centerline, hinge at 76% chord; three gun ports at 2.35, 2.53 and 2.72 m
    (front view); the spec's sim guns stay at its own 3.0-3.8 m                DRAWING-MEASURED
  antenna masts: 5.05 m, vertical to +1.76 m; 6.85 m, raked aft to +1.24 m; main wheels 0.79 m (31 in)
    in diameter, tailwheel 0.24 m (the drawing's gray extended-gear circles)   DRAWING-MEASURED
The first pass (same date) read most body ordinates within a few cm, but: its wing sat 0.11 m low at the
root and 0.41 m low at the tip (2.5 deg flat dihedral, no center section); its fin was a straight-edged
trapezoid whose flat top ran aft to a vertical trailing edge 0.35 m behind the drawn one; its tail cone
pinched to 0.58 m deep at 10.0 m where the drawn tail is 0.95 m deep; its glazing ran 0.7 m too far aft
over the turtledeck, its crown 0.07 m high and peaking 0.3 m too far forward, and the photo-guided repair's
0.64 m roof panel is twice the drawn 0.32 m; its hub was 0.27 m in radius against the drawn 0.15 m, its main
wheels 0.69 m against the drawn 0.79 m; and both wing and tailplane tips were square.

Frame: glTF, +x forward, +y up, +z right, meters. Origin: drawing-measured wing quarter chord at 30%
semispan, on the thrust line. Pose: gear down, thrust line level.
Leaves out: the cockpit interior, the wing fold, the arrester hook, the drop tank, rocket rails and stores
(the spec's stores are measured on the wing by `npm run models:mounts`), the small turtledeck windows,
unit markings.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'f6f'
# --- CITED
SPAN = 13.06
LENGTH = 10.24
WING_AREA = 31.0
BLADES = 3
ROOT_T, TIP_T = 0.156, 0.09
PROP_DIAMETER = 3.99
# --- DRAWING-MEASURED (header), meters
UPPER = 'seaBlue'
NOSE_M = 3.04                     # spinner tip to the wing quarter chord at 30% semispan
WING_Y = -0.40                    # center-section chord line under the thrust line
WING_FOLD = 2.10                  # end of the flat center section
DIHEDRAL_DEG = 7.5                # outer panels
# Straight planform lines (meters aft of the spinner, z from the centerline) before the area scaling.
WING_LE = (2.183, 0.0872)         # leading edge = a + b z
WING_CHORD = (3.265, -0.2615)     # chord = a + b z
WING_STRAIGHT_TO = 6.30
# Rounded tip, both tips averaged: (z, leading station, trailing station).
WINGTIP = [(6.36, 2.737, 4.330), (6.40, 2.746, 4.220), (6.44, 2.780, 4.058), (6.47, 2.831, 3.890),
           (6.49, 2.880, 3.760), (6.51, 2.960, 3.600), (6.522, 3.060, 3.460), (6.53, 3.200, 3.320)]
# (distance aft of the spinner, half-width, top, bottom, exponent), tail to nose. From the windscreen
# aft the top is the main body's shoulder under the turtledeck (TURTLEDECK below carries the drawn line).
BODY_M = [
    (10.13, 0.03, 0.30, -0.42, 2.0), (10.06, 0.07, 0.40, -0.48, 2.0), (10.00, 0.10, 0.45, -0.50, 2.0),
    (9.50, 0.145, 0.52, -0.545, 2.0), (9.00, 0.21, 0.55, -0.585, 2.1), (8.50, 0.277, 0.555, -0.656, 2.2),
    (8.20, 0.318, 0.547, -0.708, 2.2), (8.00, 0.344, 0.535, -0.728, 2.2), (7.50, 0.412, 0.58, -0.785, 2.2),
    (7.00, 0.477, 0.647, -0.833, 2.2), (6.50, 0.531, 0.723, -0.877, 2.2), (6.00, 0.581, 0.80, -0.917, 2.2),
    (5.50, 0.628, 0.883, -0.954, 2.0), (5.00, 0.668, 0.971, -0.986, 2.0), (4.45, 0.705, 1.07, -1.014, 1.9),
    (4.00, 0.738, 1.10, -1.03, 1.9), (3.60, 0.757, 1.08, -1.034, 1.9), (3.30, 0.775, 1.046, -1.034, 1.9),
    (3.00, 0.79, 1.014, -1.034, 1.9), (2.50, 0.80, 0.966, -1.034, 1.9), (2.00, 0.80, 0.913, -1.034, 2.0),
    (1.75, 0.80, 0.877, -1.01, 2.2), (1.50, 0.775, 0.841, -0.978, 2.1), (1.25, 0.744, 0.805, -0.942, 2.1),
    (1.00, 0.702, 0.769, -0.889, 2.0), (0.80, 0.634, 0.728, -0.833, 2.0), (0.70, 0.545, 0.676, -0.785, 2.0),
    (0.66, 0.465, 0.64, -0.74, 2.0), (0.635, 0.40, 0.60, -0.68, 2.0), (0.618, 0.33, 0.52, -0.58, 2.0),
    (0.60, 0.14, 0.14, -0.14, 2.0), (0.50, 0.12, 0.12, -0.12, 2.0),
]
# The hood's section, from the front and top views: roof edge and shoulder as fractions of the rail
# half-width, and their drops below the crown as fractions of the crown's height over the rail.
SECTION = dict(roof_w=0.37, roof_drop=0.075, shoulder_w=0.56, shoulder_drop=0.26)
# Glazing: (distance aft of the spinner, rail half-width, crown), tail to nose after conversion; the rail
# y is fitted to the fuselage skin, buried EMBED_M.
HOOD = [(4.44, 0.43, 1.41), (4.25, 0.43, 1.442), (4.10, 0.43, 1.463), (3.95, 0.43, 1.467), (3.75, 0.43, 1.451),
        (3.65, 0.424, 1.418), (3.55, 0.40, 1.346), (3.45, 0.36, 1.225), (3.38, 0.32, 1.145), (3.33, 0.29, 1.085),
        (3.29, 0.25, 1.03)]
HOOD_FRAMES = (3.73, 4.04, 4.38)
# Turtledeck crown, the drawn top line (distance aft, crown); its rails are solved onto the body skin so
# its section keeps the hood's proportions (rail half-width = 0.81 x height over the rail).
TURTLEDECK = [(8.15, 0.55), (8.00, 0.556), (7.50, 0.66), (7.00, 0.777), (6.50, 0.893), (6.00, 1.01),
              (5.50, 1.123), (5.00, 1.251), (4.50, 1.356), (4.38, 1.375)]
# Tailplane (top view, span scale): (spanwise z, leading station, trailing station, thickness m).
TAILPLANE = [(0.00, 8.26, 10.02, 0.25), (0.50, 8.407, 10.025, 0.23), (1.00, 8.552, 10.025, 0.20),
             (1.50, 8.701, 10.025, 0.17), (2.00, 8.85, 10.025, 0.14), (2.30, 8.939, 10.021, 0.12),
             (2.50, 8.995, 9.973, 0.11), (2.60, 9.027, 9.918, 0.10), (2.70, 9.063, 9.834, 0.09),
             (2.76, 9.105, 9.765, 0.08), (2.80, 9.152, 9.695, 0.07), (2.83, 9.184, 9.651, 0.06),
             (2.86, 9.246, 9.55, 0.04), (2.88, 9.30, 9.50, 0.025), (2.89, 9.36, 9.44, 0.015)]
TAILPLANE_Y = 0.19
ELEVATOR_HINGE = (0.24, 2.70, 9.39)     # spanwise extent and its straight unswept hinge station
# Vertical tail outer outline (side view): (height above the thrust line, station). The rows below the
# deck are buried in the fuselage; the rudder's foot hangs below the tail cone's end.
FIN_LE = [(-0.10, 8.30), (0.40, 8.30), (0.55, 8.40), (0.60, 8.466), (0.65, 8.546), (0.70, 8.595), (0.80, 8.659),
          (1.00, 8.76), (1.20, 8.86), (1.40, 8.961), (1.60, 9.061), (1.70, 9.114), (1.75, 9.142), (1.80, 9.186),
          (1.85, 9.254), (1.86, 9.30), (1.88, 9.40), (1.888, 9.46)]
FIN_TE = [(-0.10, 10.24), (0.00, 10.228), (0.20, 10.20), (0.40, 10.172), (0.60, 10.144), (0.80, 10.12),
          (1.00, 10.091), (1.20, 10.063), (1.40, 10.035), (1.60, 10.007), (1.70, 9.975), (1.75, 9.938),
          (1.80, 9.882), (1.85, 9.782), (1.86, 9.715), (1.88, 9.61), (1.888, 9.54)]
FIN_THICKNESS = [(-0.10, 0.20), (1.40, 0.15), (1.75, 0.10), (1.85, 0.06), (1.888, 0.02)]
RUDDER = (-0.06, 1.80, 9.655)           # heights and the straight hinge station
PROP = dict(hub=0.40, chord=0.236, spinner_r=0.148, spinner_len=0.533)  # meters; the cap's tip is d=0
# x, z, wheel; the stance is FITTED (header): the wheel bottom lands on gear.heightM below the origin.
GEAR = dict(x=0.61, z=1.5411, bottom=2.42, wheel_r=0.397, wheel_w=0.20)
TAILWHEEL = dict(x=-5.85, y=-0.55, bottom=1.078, wheel_r=0.12, wheel_w=0.08)          # x, hinge y, bottom: m

SEGMENTS = 96
SUBDIVIDE = 4
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (4.33, 6.16, 0.76)      # z from the centerline, hinge chord fraction
FLAP1 = (0.80, 2.04, 0.74)        # center section
FLAP2 = (2.16, 4.27, 0.74)        # outer panel, to the aileron
EXHAUSTS = [(2.20, -0.39), (2.39, -0.25)]   # stub outlets (distance aft, height), each side
EXHAUST = dict(r=0.04, length=0.18)
GUNS_Z = (2.35, 2.53, 2.72)
FILLET = dict(le=2.05, te=4.71, half_w=0.225, half_h=0.164)
INSIGNIA = dict(fus_d=7.07, fus_dia=1.00, wing_z=0.66, wing_chord=0.42, wing_dia=1.45)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def XD(d):
    """Meters aft of the spinner tip, as glTF x."""
    return NOSE_M - d


FUSELAGE = [(XD(d), w, (top - bottom) / 2, (top + bottom) / 2, n) for d, w, top, bottom, n in BODY_M]
_FUS, _ = kit._refine_shape(FUSELAGE, SUBDIVIDE)


def fus_section(d):
    """(half-width, half-height, center y, exponent) of the lofted fuselage d meters aft of the spinner."""
    x = XD(d)
    i = next(k for k in range(len(_FUS) - 1) if _FUS[k][0] <= x <= _FUS[k + 1][0])
    t = (x - _FUS[i][0]) / (_FUS[i + 1][0] - _FUS[i][0])
    return tuple(_FUS[i][c] + (_FUS[i + 1][c] - _FUS[i][c]) * t for c in (1, 2, 3, 4))


def fus_side_z(d, y):
    hw, hh, cy, n = fus_section(d)
    return hw * max(0.0, 1.0 - abs((y - cy) / hh) ** n) ** (1.0 / n)


def fus_top_y(d, z):
    hw, hh, cy, n = fus_section(d)
    return cy + hh * max(0.0, 1.0 - min(1.0, abs(z / hw)) ** n) ** (1.0 / n)


def section(d, rail_w, crown):
    """An eight-value faired_canopy station: the hood's section on rails buried in the body skin."""
    rail_y = min(crown - EMBED_M, fus_top_y(d, rail_w) - EMBED_M)
    h = crown - rail_y
    sc = SECTION
    return (XD(d), rail_w, rail_y, sc['shoulder_w'] * rail_w, crown - sc['shoulder_drop'] * h,
            sc['roof_w'] * rail_w, crown - sc['roof_drop'] * h, crown)


def turtledeck_rail(d, crown):
    """The rail half-width whose height under the crown keeps the hood's proportions (0.81 = 0.43 / 0.53)."""
    lo, hi = 0.02, fus_section(d)[0] * 0.95
    for _ in range(40):
        w = (lo + hi) / 2
        if w < 0.81 * (crown - fus_top_y(d, w) + EMBED_M):
            lo = w
        else:
            hi = w
    return (lo + hi) / 2


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)

# The planform: drawn straight lines and tip, chords scaled about the quarter-chord line to the cited area.
def _raw(z):
    z = abs(z)
    if z <= WING_STRAIGHT_TO:
        le = WING_LE[0] + WING_LE[1] * z
        return le, le + WING_CHORD[0] + WING_CHORD[1] * z
    rows = [(WING_STRAIGHT_TO, *_raw(WING_STRAIGHT_TO))] + WINGTIP
    for (z0, a0, b0), (z1, a1, b1) in zip(rows, rows[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            return a0 + (a1 - a0) * t, b0 + (b1 - b0) * t
    return rows[-1][1], rows[-1][2]


def _area(k):
    n = 2000
    total = 0.0
    for i in range(n):
        le, te = _raw((i + 0.5) / n * S / 2)
        total += k * (te - le) * (S / 2) / n
    return 2 * total


CHORD_K = WING_AREA / _area(1.0)


def stations_at(z):
    """(leading, trailing) meters aft of the spinner, area-scaled about the quarter chord."""
    le, te = _raw(z)
    qc = le + 0.25 * (te - le)
    return qc - CHORD_K * (qc - le), qc + CHORD_K * (te - qc)


def chord_at(z):
    le, te = stations_at(z)
    return te - le


def le_x(z):
    return XD(stations_at(z)[0])


tan_di = math.tan(math.radians(DIHEDRAL_DEG))


def wing_y(z):
    return WING_Y + max(0.0, abs(z) - WING_FOLD) * tan_di


def thickness_at(z):
    return (ROOT_T + (TIP_T - ROOT_T) * min(1.0, abs(z) / (S / 2))) * chord_at(z)


with m.tagged('fuselage'):
    m.fuselage(UPPER, FUSELAGE, segments=SEGMENTS, subdivide=SUBDIVIDE, refinement='shape')
    # A shallow wing-root fillet along the top of the center-section root, sunk into both skins.
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = wing_y(0.0) + 0.55 * thickness_at(0.0) - FILLET['half_h']
    fz = fus_side_z(mid, fy) + FILLET['half_w'] - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(XD(FILLET['te']), 0.04, 0.04, WING_Y),
                           (XD(mid), FILLET['half_w'], FILLET['half_h'], fy),
                           (XD(FILLET['le']), 0.04, 0.04, WING_Y)],
                   segments=24, center_z=side * fz, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    m.faired_canopy('glazing', UPPER, [section(d, w, c) for d, w, c in HOOD],
                    [XD(d) for d in HOOD_FRAMES], bar=0.022)
with m.tagged('fuselage'), m.shared_chart():
    # Metal turtledeck in the hood's section; the one required frame is a 4 mm step at the hood's track end.
    m.faired_canopy(UPPER, UPPER, [section(d, turtledeck_rail(d, c), c) for d, c in TURTLEDECK],
                    [XD(4.46)], bar=0.004)

controls = [(a, b, h, n) for (a, b, h), n in ((FLAP1, 'Flap1'), (FLAP2, 'Flap2'), (AILERON, 'Aileron'))]
gear_z = GEAR['z']
breaks = [0.0, gear_z, WING_FOLD, WING_STRAIGHT_TO]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = chord_at(z0), chord_at(z1)
        sweep = math.degrees(math.atan((le_x(z0) - le_x(z1)) / (z1 - z0)))
        m.wing(UPPER, le_x(z0), wing_y(z0), c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG if z0 >= WING_FOLD else 0.0,
               thickness=thickness_at(z0) / c0, tip_thickness=thickness_at(z1) / c1, root_z=z0,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
    tip = [(WING_STRAIGHT_TO, *stations_at(WING_STRAIGHT_TO))] + [(z, *stations_at(z)) for z, _a, _b in WINGTIP]
    m.wing_outline(UPPER, [(z, XD(le), XD(te), wing_y(z), thickness_at(z)) for z, le, te in tip],
                   stations=STATIONS, span_segments=1, controls=controls)


def lerp(table, h):
    """Linear interpolation in a [(key, value)] table, keys increasing."""
    for (h0, v0), (h1, v1) in zip(table, table[1:]):
        if h <= h1:
            return v0 + (v1 - v0) * (h - h0) / (h1 - h0)
    return table[-1][1]


eh = ELEVATOR_HINGE
with m.tagged('tailplane'), m.shared_chart():
    m.wing_outline(UPPER, [(z, XD(le), XD(te), TAILPLANE_Y, t) for z, le, te, t in TAILPLANE],
                   stations=STATIONS, span_segments=1,
                   controls=[(eh[0], eh[1], ((eh[0], XD(eh[2])), (eh[1], XD(eh[2]))), 'Elevator')])
with m.tagged('fin'), m.shared_chart():
    root = FIN_LE[0][0]
    heights = sorted({h for h, _ in FIN_LE} | {h for h, _ in FIN_TE} | {h for h, _ in FIN_THICKNESS})
    r0, r1, hinge = RUDDER
    m.fin_outline(UPPER, root, [(h - root, XD(lerp(FIN_LE, h)), XD(lerp(FIN_TE, h)), lerp(FIN_THICKNESS, h)) for h in heights],
                  stations=STATIONS, span_segments=1,
                  controls=[(r0 - root, r1 - root, ((r0 - root, XD(hinge)), (r1 - root, XD(hinge))), 'Rudder')])
pr = PROP
with m.tagged('prop'), m.shared_chart():
    m.propeller('dark', (XD(pr['hub']), 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'], pr['spinner_r'], pr['spinner_len'],
                blade_sections=[(0.13, 0.9, 44.0), (0.35, 1.05, 33.0), (0.6, 1.0, 25.0), (0.85, 0.8, 19.0), (1.0, 0.5, 16.0)])
g = GEAR
# The hinge sits low in the wing so the upright wheel, swung aft, stays under the upper skin (header: one hinge, ESTIMATE).
hinge_y = wing_y(gear_z) - 0.40 * ROOT_T * chord_at(0.0)
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], hinge_y, side * gear_z), g['bottom'] + hinge_y, g['wheel_r'], g['wheel_w'], node=name)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.045, node='Tailwheel')
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        # Leg cover on the outboard face of the strut, its face EMBED_M inside it.
        m.box('dark', (g['x'], hinge_y - 0.55 * (g['bottom'] + hinge_y), side * (gear_z + strut_r - EMBED_M + 0.006)), (0.45, 0.95, 0.012), node=name)
    for side in (-1, 1):
        for d, ey in EXHAUSTS:
            m.revolve('dark', (XD(d), ey, side * (fus_side_z(d, ey) - 0.05)), (-1.0, -0.15, side * 0.5),
                      [(0.0, EXHAUST['r']), (EXHAUST['length'], EXHAUST['r'] * 0.85)], 12)
    # Wing guns: three .50s a side at the drawn ports, the muzzles 0.20 m ahead of the leading edge. The
    # spec's sim guns (content/aircraft/f6f-hellcat.json combat.guns, z 3.0-3.8) were fitted to the download.
    for side in (-1, 1):
        for gz in GUNS_Z:
            gz *= side
            m.gun_barrel('dark', (le_x(gz) - 0.30, wing_y(gz) + 0.04, gz), 0.0, 0.0, 0.50, 0.016)
    pz = -6.2
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.40, wing_y(pz), pz), 0.009, sides=6)
    # Antenna masts on the turtledeck crown: vertical at 5.05 m, the whip at 6.85 m raked aft.
    m.strut('dark', (XD(5.05), 1.251 - 0.06, 0.0), (XD(5.06), 1.76, 0.0), 0.014, 0.007, sides=6)
    m.strut('dark', (XD(6.85), 0.82 - 0.05, 0.0), (XD(6.92), 1.24, 0.0), 0.010, 0.005, sides=6)


def star(r_out):
    r_in = 0.382 * r_out
    return [((r_out if k % 2 == 0 else r_in) * math.sin(k * math.pi / 5), (r_out if k % 2 == 0 else r_in) * math.cos(k * math.pi / 5)) for k in range(10)]


def rect(u0, u1, v0, v1):
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def roundel(tag, center, axis, uDir, d):
    """The 1943 star-and-bar (ESTIMATE geometry, as the P-38's): blue outline, white bars, blue disc, white star."""
    o = 0.125 * d
    common = dict(tags=[tag], origin=center, axis=axis, uDir=uDir)
    m.marking('polygon', points=rect(-(d + o), d + o, -(0.165 * d + o), 0.165 * d + o), color='usaaInsigniaBlue', **common)
    for sgn in (-1, 1):
        u0, u1 = sorted((sgn * 0.35 * d, sgn * d))
        m.marking('polygon', points=rect(u0, u1, -0.165 * d, 0.165 * d), color='usaaInsigniaWhite', **common)
    m.marking('disc', tags=[tag], center=center, axis=axis, radiusM=0.5 * d, color='usaaInsigniaBlue')
    m.marking('polygon', points=star(0.40 * d), color='usaaInsigniaWhite', **common)


ins = INSIGNIA
for side in (-1, 1):
    hw, hh, cy, _n = fus_section(ins['fus_d'])
    # On a fuselage side v = axis x uDir is up for uDir = -side x (aft on the left side's view).
    roundel('fuselage', (XD(ins['fus_d']), cy, side * hw), (0.0, 0.0, float(side)), (-float(side), 0.0, 0.0), ins['fus_dia'])
# Upper left wing and lower right wing (the Navy's rule): uDir spanwise, v forward.
zl = -ins['wing_z'] * S / 2
roundel('wing', (le_x(zl) - ins['wing_chord'] * chord_at(zl), wing_y(zl), zl), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), ins['wing_dia'])
zr = ins['wing_z'] * S / 2
roundel('wing', (le_x(zr) - ins['wing_chord'] * chord_at(zr), wing_y(zr), zr), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0), ins['wing_dia'])
for side in (-1, 1):
    streak = [(-0.9, -0.12), (1.4, -0.32), (1.4, 0.10), (-0.9, 0.12)]
    m.marking('polygon', tags=['fuselage'], origin=(XD(EXHAUSTS[-1][0]), EXHAUSTS[-1][1], 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.2), -1.2), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-1.0, -0.25), (0.7, -0.25), (0.7, 0.35), (-1.0, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.export(out)
