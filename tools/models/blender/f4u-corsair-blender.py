# tools/models/blender/f4u-corsair-blender.py
"""Vought F4U-1D Corsair. Original work, AGPL-3.0-or-later.

A second Corsair beside the Sketchfab download (content/aircraft/f4u-corsair.glb stays), built on the
Hellcat duplicate's single-engine template (f6f-hellcat-blender.py) with the inverted gull wing the type is known
for; compare the two in the Hangar and swap this one in when approved (docs/blender-aircraft.md, "Promoting a
duplicate"). Stations are meters aft of the propeller hub tip; the stance is fitted to content/aircraft/f4u-corsair.json
so that a swap needs no flight-model change.

Figures (read 2026-10-11):
  span 12.50 m (41 ft 0 in), length 10.26 m (33 ft 8 in), wing area 29.17 m2 (314 sq ft)
                                                        CITED, English Wikipedia "Vought F4U Corsair",
                                                        Specifications (F4U-4; the -1D shares span and wing)
  3-bladed Hamilton Standard Hydromatic propeller 4.06 m (13 ft 4 in)
                                                        CITED, same page, Design (the F4U-4 has four blades;
                                                        the -1D has three)
  inverted gull wing; main gear retracts aft, each strut turning 90 degrees, in an enclosed well
                                                        CITED, same page, Design; the model folds the leg
                                                        inboard with the wheel flat, one hinge, ESTIMATE
                                                        (as the download's rig does, airframeRigs.ts)
  six .50 in wing guns, three a side                    CITED, same page, Design
  airfoil NACA 23018 root / 23009 tip (the page names none)
                                                        ESTIMATE; the section is the kit's symmetric one and
                                                        its thickness is read off the front view (below)
  fuselage transverse sections (superellipse exponents), canopy shoulder/roof widths
                                                        ESTIMATE, checked against the drawing's front view and
                                                        Commons "NASM - Vought F4U-1D Corsair - side.jpg" /
                                                        "- front.jpg", read 2026-10-11
  Chance Vought drawing 40204, "Lines & Ordinates - Fuselage - Cockpit Cabin - Windshield & Sliding Section"
                                                        INDEXED, AirCorps Library, read 2026-10-11;
                                                        sheets require membership and supplied no numbers
  stance: wheels 2.418 m below the origin at x 0.418, tailwheel at x -5.722, 1.306 m below
                                                        FITTED to f4u-corsair.json gear.heightM / mainX /
                                                        thirdX / thirdHeightM, so a swap leaves the sim alone
  glossy sea blue overall (the US Navy's 1944-45 scheme; palette role seaBlue)
                                                        ESTIMATE (no chip read)
  1943 star-and-bar insignia (blue outline): both fuselage sides, upper left and lower right wing
                                                        ESTIMATE positions and sizes (the Navy's wing rule)
  exhaust stacks, trim tabs, leg covers                 ESTIMATE, period three-view proportions
  additions sink at least 0.02 m into what they sit on  modeling choice: no coplanar faces (DP0)

REAL-AIRPLANE MEASUREMENT (re-read 2026-10-11, second pass): Wikimedia Commons "Vought F4U-1 Corsair
3-view.svg" (Kaboldy, CC BY-SA 3.0), rasterized through Special:FilePath at 3,840 px. It is captioned an
F4U-1 but draws the raised, two-frame -1A/-1D hood; the -1D's longer cited length (33 ft 8 in) is the
length it scales to. Side and top views share one scale: hub tip x=44 to tail x=2,502, 239.57 px/m over
the cited 10.26 m. Cross-checks: the top view's wingtips span 2,991 px, 12.485 m against the cited 12.50 m
(0.1%), and its nose-to-tail length matches the side view's to the pixel; the front view at the same
scale puts the fin crown and canopy roof where the side view does. Side-view heights are meters above the
propeller axis (row 617.5, the hub cap's center). The first pass (same date; its table comment named the
Hellcat and Wildcat drawings beside this one) read this drawing badly wrong: the rear belly 0.3-0.45 m too
high, the fin standing on the tail cone 0.9 m aft of the drawn one with a straight trapezoid outline, a
trapezoid wing with square tips and a uniform 6.5 deg inner anhedral, square tailplane tips, and a spinner
twice the hub's size. Every table below replaces it.

  wing quarter chord at 30% semispan 2.89 m aft of the hub tip (leading edge 2.21 m, trailing edge
    4.93 m): the model origin. Check: the spec-fitted tailwheel then sits 8.61 m aft, the drawn
    tailwheel axle 8.55 m; the spec main wheel 2.47 m, the drawn one 2.33 m aft      DRAWING-MEASURED
  fuselage side silhouette and top-view half-widths: FUSELAGE_M below. The wing hides the belly from
    2.2 to 4.9 m (interpolated); the hood hides the deck from 4.0 to 5.4 m, where the deck is set so
    the hood's rails sit 0.015 m inside the skin at the drawn sill               DRAWING-MEASURED
  hood: windscreen base 3.97 m on the deck (+0.88 m), windscreen top 4.50 m, roof +1.31 m at 4.8 m,
    faired into the turtle deck at 5.47 m (+1.18 m); plan half-width 0.44 m; the front view's hood
    section sets the shoulder and roof proportions                               DRAWING-MEASURED
  wing: WING_ROWS below. Top view: unswept inner leading edge (the oil-cooler mouth 2.26 m inboard of
    1.3 m), straight tapered outer panel, rounded tip. Front view: chord line from the upper and lower
    silhouettes; inner panel 21.5 deg anhedral from the body side to 1.45 m, a knee bottoming at 1.8 m
    (the gear's bay, -1.0 m), outer panel 8.6 deg dihedral from 2.15 m; vertical thicknesses read there.
    Chords scaled about the quarter chord to the cited area (the trace reads 29.71 m2, +1.8%)
                                                                                 DRAWING-MEASURED, FITTED
  flaps and ailerons: hinge lines in the top view at 82% (inner flap, unswept 4.45 m), 82% (outer flap)
    and 81% chord (aileron). The inner flap stops at the knee: its hinge stays straight and clear of the
    bend (docs/blender-aircraft.md, Traps)                                       DRAWING-MEASURED
  vertical tail: FIN_LE / FIN_TE below, traced from the outer outline; the leading edge leaves the deck
    at 7.77 m, a round crown +2.31 m at 8.6 m, the rudder trailing edge near-vertical at 9.3-9.5 m and
    faired into the tail cone at 9.6 m; rudder hinge 8.70 m                      DRAWING-MEASURED
  tailplane: TAILPLANE below, 9.5 deg swept leading edge, rounded tips, 5.07 m span, elevator hinge
    straight at 9.45 m, chord line +0.445 m                                      DRAWING-MEASURED
  hub cap 0.16 m radius (no spinner: the -1D has a bare hub), cowl 1.45 m diameter, its lip at 0.61 m;
    main wheels 0.82 m and 1.88 m off the centerline (front view), tailwheel 0.33 m; gun ports at
    |z| 2.47, 2.63 and 2.78 m on the leading edge; masts at 2.76 m (0.34 m to starboard) and 6.12 m
    on the deck and 5.88 m under the belly; pitot 5.78 m out on the left wing    DRAWING-MEASURED
  proposed real-cockpit eye (-1.80, 1.05) m: 4.69 m aft of the hub tip, 0.26 m under the hood's crown
                                                                                 DRAWING-MEASURED
Frame: glTF, +x forward, +y up, +z right, meters. Origin: the drawing-measured wing quarter chord at 30%
semispan, on the thrust line. Pose: gear down, thrust line level.
Leaves out: the cockpit interior, the wing fold, the arrester hook, rocket rails and stores (the spec's
stores are measured on the wing by `npm run models:mounts`), unit markings, the oil-cooler mouths.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'f4u'
# --- CITED
SPAN = 12.50
LENGTH = 10.26
WING_AREA = 29.17
BLADES = 3
PROP_DIAMETER = 4.06
UPPER = 'seaBlue'
NOSE_M = 2.89                    # MEASURED: hub tip to the wing quarter chord at 30% semispan
DRAWN_SEMISPAN = 6.2425          # MEASURED: the drawing's wingtip, scaled to the cited span below
# (distance aft of the hub tip, half-width, top, bottom, exponent), meters, tail to nose. 4.05-5.35 m: the deck
# under the hood, solved so the rails sit at the drawn sill; 2.6-4.5 m bottoms: the belly behind the wing root.
FUSELAGE_M = [
    (10.26, 0.012, 0.32, 0.28, 2.0), (10.20, 0.046, 0.405, 0.205, 2.0), (10.10, 0.067, 0.488, 0.117, 2.0),
    (10.00, 0.09, 0.505, 0.075, 2.0), (9.80, 0.13, 0.534, 0.017, 2.0), (9.40, 0.19, 0.593, -0.067, 2.0),
    (9.00, 0.25, 0.651, -0.146, 2.0), (8.60, 0.311, 0.710, -0.221, 2.1), (8.00, 0.382, 0.808, -0.330, 2.1),
    (7.50, 0.434, 0.885, -0.405, 2.2), (7.00, 0.484, 0.964, -0.472, 2.2), (6.50, 0.528, 1.039, -0.534, 2.2),
    (6.00, 0.568, 1.114, -0.589, 2.2), (5.60, 0.597, 1.169, -0.630, 2.2), (5.47, 0.605, 1.172, -0.642, 2.2),
    (5.35, 0.616, 0.884, -0.655, 2.2), (5.20, 0.624, 0.860, -0.668, 2.2), (5.00, 0.637, 0.835, -0.680, 2.2),
    (4.80, 0.649, 0.808, -0.689, 2.2), (4.65, 0.658, 0.794, -0.692, 2.2), (4.50, 0.666, 0.803, -0.695, 2.2),
    (4.35, 0.674, 0.843, -0.697, 2.2), (4.20, 0.684, 0.888, -0.700, 2.2), (4.05, 0.693, 0.911, -0.700, 2.2),
    (3.90, 0.695, 0.877, -0.700, 2.3), (3.50, 0.707, 0.852, -0.710, 2.3), (3.00, 0.718, 0.822, -0.720, 2.3),
    (2.60, 0.722, 0.797, -0.730, 2.3), (2.20, 0.726, 0.776, -0.735, 2.2), (1.80, 0.722, 0.751, -0.730, 2.1),
    (1.75, 0.739, 0.747, -0.743, 2.05), (1.50, 0.735, 0.739, -0.739, 2.0), (1.00, 0.724, 0.726, -0.722, 2.0),
    (0.90, 0.720, 0.722, -0.718, 2.0), (0.80, 0.700, 0.701, -0.701, 2.0), (0.70, 0.653, 0.655, -0.651, 2.0),
    (0.65, 0.607, 0.609, -0.605, 2.0), (0.625, 0.549, 0.551, -0.547, 2.0), (0.605, 0.45, 0.45, -0.45, 2.0),
    (0.60, 0.155, 0.155, -0.155, 2.0), (0.42, 0.15, 0.15, -0.15, 2.0),
]
# Hood, tail to nose: (d aft, rail half-width, drawn sill y, crown y). The rail y is the local skin less
# 0.015 m (computed below; None: on the turtle deck, where the hood ends); shoulder and roof follow the front view's hood section, the shoulder at 85% of
# the rail width and 40% of the height, the roof at 52% and 85%.
CANOPY_M = [
    (5.47, 0.36, None, 1.185), (5.35, 0.395, 0.72, 1.193), (5.20, 0.397, 0.70, 1.227), (5.00, 0.413, 0.67, 1.277),
    (4.80, 0.426, 0.64, 1.307), (4.65, 0.434, 0.625, 1.295), (4.50, 0.442, 0.63, 1.240), (4.35, 0.42, 0.69, 1.140),
    (4.20, 0.388, 0.76, 1.039), (4.05, 0.31, 0.83, 0.94), (3.97, 0.06, 0.86, 0.885),
]
CANOPY_FRAMES_M = (5.32, 4.50)
# Wing, root to tip in DRAWN z: (z, leading station, trailing station). Top view.
WING_PLAN = [
    (0.0, 2.264, 4.928), (1.25, 2.264, 4.928), (1.35, 2.210, 4.928), (2.0, 2.206, 4.928), (2.2, 2.219, 4.928),
    (2.3, 2.227, 4.928), (2.5, 2.239, 4.915), (3.0, 2.273, 4.844), (4.0, 2.340, 4.690), (5.0, 2.406, 4.535),
    (5.2, 2.419, 4.502), (5.4, 2.431, 4.435), (5.5, 2.440, 4.387), (5.6, 2.448, 4.328), (5.7, 2.456, 4.258),
    (5.8, 2.482, 4.172), (5.9, 2.527, 4.070), (6.0, 2.594, 3.936), (6.1, 2.699, 3.759), (6.15, 2.770, 3.642),
    (6.2, 2.874, 3.485), (6.22, 2.936, 3.390), (6.2425, 3.10, 3.18),
]
# Front view: the chord line is straight panels through these knots (z, y); vertical thickness (z, m).
WING_Y = [(0.0, -0.183), (1.45, -0.755), (1.8, -0.783), (2.15, -0.757), (6.2425, -0.137)]
WING_T = [(0.0, 0.55), (1.25, 0.57), (1.45, 0.47), (1.8, 0.44), (2.15, 0.43), (3.0, 0.388), (4.0, 0.33), (5.0, 0.271),
          (5.5, 0.246), (5.8, 0.21), (6.0, 0.16), (6.1, 0.12), (6.2, 0.07), (6.2425, 0.008)]
FLAP1 = (0.75, 1.40, ((0.75, 4.452), (1.40, 4.452)))     # drawn z, hinge line (z, station)
FLAP2 = (2.30, 3.48, ((2.30, 4.46), (3.45, 4.326)))
AILERON = (3.55, 5.80, ((3.60, 4.285), (5.70, 4.032)))
# Tailplane (top view): (z, leading station, trailing station); chord line +0.445 m; thickness below.
TAILPLANE = [(0.0, 8.572, 10.02), (0.5, 8.655, 9.987), (1.0, 8.739, 9.928), (1.5, 8.822, 9.870), (2.0, 8.905, 9.811),
             (2.2, 8.947, 9.790), (2.3, 8.993, 9.765), (2.35, 9.025, 9.747), (2.4, 9.068, 9.713), (2.45, 9.129, 9.667),
             (2.48, 9.183, 9.621), (2.50, 9.217, 9.592), (2.52, 9.275, 9.544), (2.535, 9.36, 9.46)]
TAILPLANE_Y = 0.445
ELEVATOR = (0.32, 2.40, 9.45)            # spanwise extent and its straight unswept hinge station
# Vertical tail outer outline (side view): (height above the thrust line, station).
FIN_LE = [(0.50, 7.65), (0.86, 7.77), (0.95, 7.841), (1.05, 7.870), (1.25, 7.933), (1.45, 8.000), (1.65, 8.062),
          (1.85, 8.125), (2.00, 8.171), (2.10, 8.213), (2.15, 8.246), (2.20, 8.288), (2.25, 8.350), (2.28, 8.40),
          (2.30, 8.45), (2.315, 8.56)]
FIN_TE = [(0.50, 9.64), (0.58, 9.603), (0.62, 9.548), (0.66, 9.519), (0.75, 9.494), (0.95, 9.456), (1.15, 9.419),
          (1.35, 9.381), (1.55, 9.344), (1.70, 9.315), (1.80, 9.298), (1.90, 9.273), (2.00, 9.231), (2.10, 9.160),
          (2.20, 9.039), (2.25, 8.947), (2.30, 8.80), (2.315, 8.70)]
FIN_THICKNESS = [(0.50, 0.13), (1.80, 0.11), (2.20, 0.07), (2.315, 0.03)]
RUDDER_HINGE = ((0.76, 8.70), (2.22, 8.68))
PROP = dict(hub=0.30, chord=0.26, spinner_r=0.16, spinner_len=0.40)  # meters; hub tip is d=0
# x, z, wheel in m; the stance is FITTED (header): the wheel bottom lands on gear.heightM below the origin.
GEAR = dict(x=0.418, z=1.88, bottom=2.418, wheel_r=0.41, wheel_w=0.24)
TAILWHEEL = dict(x=-5.722, y=0.20, bottom=1.306, wheel_r=0.16, wheel_w=0.08)       # x, hinge y, bottom: m
GUN_Z = (2.47, 2.63, 2.78)

SEGMENTS = 96
SUBDIVIDE = 3
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
EXHAUSTS = dict(count=2, d0=1.90, d1=2.05, y=-0.60, r=0.030, length=0.20)
INSIGNIA = dict(fus_d=7.18, fus_d_size=1.00, wing_z=0.66, wing_chord=0.42, wing_d=1.40)
EMBED_M = 0.02

L, S = LENGTH, SPAN
K = (S / 2) / DRAWN_SEMISPAN     # drawn span to cited span


def XD(d):
    """Meters aft of the hub tip, as glTF x."""
    return NOSE_M - d


def lerp(table, h):
    """Linear interpolation in a [(key, value)] table, keys increasing; clamped at both ends."""
    if h <= table[0][0]:
        return table[0][1]
    for (h0, v0), (h1, v1) in zip(table, table[1:]):
        if h <= h1:
            return v0 + (v1 - v0) * (h - h0) / (h1 - h0)
    return table[-1][1]


_FUS, _ = kit._refine_shape([(XD(d), w, (t - b) / 2, (t + b) / 2, n) for d, w, t, b, n in FUSELAGE_M], SUBDIVIDE)


def fus_section(d):
    """(half-width, half-height, center y, exponent) of the lofted fuselage d aft of the hub tip, linear between rings."""
    x = XD(d)
    i = next(k for k in range(len(_FUS) - 1) if _FUS[k][0] <= x <= _FUS[k + 1][0])
    t = (x - _FUS[i][0]) / (_FUS[i + 1][0] - _FUS[i][0])
    return tuple(_FUS[i][c] + (_FUS[i + 1][c] - _FUS[i][c]) * t for c in (1, 2, 3, 4))


def fus_side_z(d, y):
    hw, hh, cy, n = fus_section(d)
    return hw * max(0.0, 1.0 - abs((y - cy) / hh) ** n) ** (1.0 / n)


def fus_top_y(d, z):
    hw, hh, cy, n = fus_section(d)
    return cy + hh * max(0.0, 1.0 - abs(z / hw) ** n) ** (1.0 / n)


# The wing: drawn rows, z scaled to the cited span, chords scaled about the quarter chord to the cited area.
_knots = sorted({z for z, *_ in WING_PLAN} | {z for z, _ in WING_Y} | {z for z, _ in WING_T})
_plan = [(z, lerp([(a, le) for a, le, _ in WING_PLAN], z), lerp([(a, te) for a, _, te in WING_PLAN], z)) for z in _knots]
_area = 2 * K * sum((z1 - z0) * ((t0 - l0) + (t1 - l1)) / 2 for (z0, l0, t0), (z1, l1, t1) in zip(_plan, _plan[1:]))
AREA_FIT = WING_AREA / _area
WING_ROWS = []
for z, le, te in _plan:
    qc, c = le + 0.25 * (te - le), (te - le) * AREA_FIT
    WING_ROWS.append((z * K, XD(qc - 0.25 * c), XD(qc + 0.75 * c), lerp(WING_Y, z), lerp(WING_T, z)))


def wing_at(z):
    """(leading x, trailing x, chord-line y) of the built wing at model |z|."""
    z = abs(z)
    rows = WING_ROWS
    i = next((k for k in range(len(rows) - 1) if z <= rows[k + 1][0]), len(rows) - 2)
    (z0, *a), (z1, *b) = rows[i], rows[i + 1]
    f = (z - z0) / (z1 - z0)
    return tuple(p + (q - p) * f for p, q in zip(a[:3], b[:3]))


def le_x(z):
    return wing_at(z)[0]


def chord_at(z):
    le, te, _y = wing_at(z)
    return le - te


def wing_y(z):
    return wing_at(z)[2]


def hinge(line):
    (za, da), (zb, db) = line
    return ((za * K, XD(da)), (zb * K, XD(db)))


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)

with m.tagged('fuselage'):
    m.fuselage(UPPER, [(XD(d), w, (t - b) / 2, (t + b) / 2, n) for d, w, t, b, n in FUSELAGE_M], segments=SEGMENTS,
               subdivide=SUBDIVIDE, refinement='shape')
with m.tagged('canopy'), m.shared_chart():
    hood = []
    for d, rail_w, sill, crown in CANOPY_M:
        rail_y = fus_top_y(d, rail_w) - 0.015
        assert sill is None or abs(rail_y - sill) <= 0.03, f'hood rail at {d:.2f} m: skin puts it at {rail_y:.3f}, the drawn sill is {sill:.3f}'
        h = crown - rail_y
        hood.append((XD(d), rail_w, rail_y, 0.85 * rail_w, rail_y + 0.40 * h, 0.52 * rail_w, rail_y + 0.85 * h, crown))
    m.faired_canopy('glazing', UPPER, hood, [XD(d) for d in CANOPY_FRAMES_M], bar=0.022)
controls = [(a * K, b * K, hinge(line), name) for (a, b, line), name in ((FLAP1, 'Flap1'), (FLAP2, 'Flap2'), (AILERON, 'Aileron'))]
with m.tagged('wing'), m.shared_chart():
    m.wing_outline(UPPER, WING_ROWS, stations=STATIONS, span_segments=1, controls=controls)
eh = ELEVATOR
with m.tagged('tailplane'), m.shared_chart():
    m.wing_outline(UPPER, [(z, XD(le), XD(te), TAILPLANE_Y, min(0.19 - 0.055 * z, 0.13 * (te - le))) for z, le, te in TAILPLANE],
                   stations=STATIONS, span_segments=1,
                   controls=[(eh[0], eh[1], ((eh[0], XD(eh[2])), (eh[1], XD(eh[2]))), 'Elevator')])
with m.tagged('fin'), m.shared_chart():
    root = FIN_LE[0][0]
    heights = sorted({h for h, _ in FIN_LE} | {h for h, _ in FIN_TE} | {h for h, _ in FIN_THICKNESS})
    (h_a, s_a), (h_b, s_b) = RUDDER_HINGE
    m.fin_outline(UPPER, root, [(h - root, XD(lerp(FIN_LE, h)), XD(lerp(FIN_TE, h)), lerp(FIN_THICKNESS, h)) for h in heights],
                  stations=STATIONS, span_segments=1,
                  controls=[(h_a - root, h_b - root, ((h_a - root, XD(s_a)), (h_b - root, XD(s_b))), 'Rudder')])
pr = PROP
with m.tagged('prop'), m.shared_chart():
    m.propeller('dark', (XD(pr['hub']), 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'], pr['spinner_r'], pr['spinner_len'],
                blade_sections=[(0.13, 0.9, 44.0), (0.35, 1.05, 33.0), (0.6, 1.0, 25.0), (0.85, 0.8, 19.0), (1.0, 0.5, 16.0)])
g = GEAR
hinge_y = wing_y(g['z'])
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], hinge_y, side * g['z']), g['bottom'] + hinge_y, g['wheel_r'], g['wheel_w'], node=name)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.045, node='Tailwheel')
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        # Leg cover on the inboard face of the strut (the legs fold inboard), its face EMBED_M inside it.
        m.box('dark', (g['x'], hinge_y - 0.55 * (g['bottom'] + hinge_y), side * (g['z'] - strut_r + EMBED_M - 0.006)), (0.45, 0.95, 0.012), node=name)
    e = EXHAUSTS
    for side in (-1, 1):
        for k in range(e['count']):
            d = e['d0'] + (e['d1'] - e['d0']) * k / (e['count'] - 1)
            m.revolve('dark', (XD(d), e['y'], side * (fus_side_z(d, e['y']) - 0.05)), (-1.0, -0.15, side * 0.5),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # Wing guns: three .50s a side in the drawn ports, the blast tubes just proud of the leading edge.
    for side in (-1, 1):
        for gz in GUN_Z:
            gz *= side * K
            m.gun_barrel('dark', (le_x(gz) - 0.40, wing_y(gz) - 0.04, gz), 0.0, 0.0, 0.47, 0.016)
    pz = -5.78 * K
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.62, wing_y(pz), pz), 0.009, sides=6)
    # Two dorsal masts (the forward one 0.34 m to starboard, front view) and the ventral one, as drawn.
    m.strut('dark', (XD(2.76), fus_top_y(2.76, 0.34) - 0.04, 0.34), (XD(2.78), 1.47, 0.34), 0.016, 0.008, sides=6)
    m.strut('dark', (XD(6.10), fus_top_y(6.10, 0.0) - 0.04, 0.0), (XD(6.14), 1.53, 0.0), 0.016, 0.008, sides=6)
    _hw, hh, cy, _n = fus_section(5.86)
    m.strut('dark', (XD(5.86), cy - hh + 0.04, 0.0), (XD(5.90), -0.93, 0.0), 0.014, 0.006, sides=6)


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
    roundel('fuselage', (XD(ins['fus_d']), cy, side * hw), (0.0, 0.0, float(side)), (-float(side), 0.0, 0.0), ins['fus_d_size'])
# Upper left wing and lower right wing (the Navy's rule): uDir spanwise, v forward.
zl = -ins['wing_z'] * S / 2
roundel('wing', (le_x(zl) - ins['wing_chord'] * chord_at(zl), wing_y(zl), zl), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), ins['wing_d'])
zr = ins['wing_z'] * S / 2
roundel('wing', (le_x(zr) - ins['wing_chord'] * chord_at(zr), wing_y(zr), zr), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0), ins['wing_d'])
for side in (-1, 1):
    streak = [(-0.9, -0.12), (1.4, -0.32), (1.4, 0.10), (-0.9, 0.12)]
    m.marking('polygon', tags=['fuselage'], origin=(XD(EXHAUSTS['d1']), EXHAUSTS['y'], 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.2), -1.2), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-1.0, -0.25), (0.7, -0.25), (0.7, 0.35), (-1.0, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.export(out)
