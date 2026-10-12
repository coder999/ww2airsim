# tools/models/blender/d3a-val-blender.py
"""Aichi D3A2 Model 22 "Val". Original work, AGPL-3.0-or-later.

A Hangar-only duplicate beside the downloaded d3a-val.glb. Built on the B5N2/TBM single-engine, two-seat
procedural pattern, with fixed spatted gear and the rear flexible gun. Every figure is tagged below.

Figures (read 2026-10-11, English Wikipedia "Aichi D3A", Specifications (D3A2 Model 22), citing
Francillon, Japanese Aircraft of the Pacific War, 1979, pp. 271-276):
  span 14.365 m, length 10.195 m, wing area 34.9 m2      CITED
  airfoil                                                ESTIMATE: Wikipedia's Specifications airfoil field is blank;
                                                         NACA 23015 root / 23009 tip is the nearby F6F/TBM procedural
                                                         section used here, not a claim about the real D3A
  3-blade metal constant-speed propeller                 CITED (blade count and type)
  propeller diameter 3.20 m                              ESTIMATE: Wikipedia's Specifications diameter field is blank;
                                                         scaled from the Commons drawing's prop disc
  armament: two forward 7.7 mm Type 97 guns in the upper decking and one flexible rear-cockpit
  7.7 mm Type 92                                        CITED; forward barrels and Turret1 are drawn
  one 250 kg fuselage bomb and two 60 kg wing bombs      CITED; attachment remains spec data, not model geometry
  fixed cantilever spatted mains and fixed tailwheel     CITED as fixed gear in the existing sourced d3a-val spec;
                                                         the exact spat and wheel shapes are ESTIMATES
  stance: main wheel bottoms 1.850 m below the origin at x 0.257; tail contact x -6.577, 0.457 m below
                                                         FITTED to content/aircraft/d3a-val.json gear.heightM /
                                                         mainX / thirdX / thirdHeightM, so a swap needs no flight-model change
  proposed real-cockpit eye (-0.60, 0.82) m              MEASURED from the drawing: 3.15 m aft of the spinner,
                                                         0.20 m under the roof; the existing spec's (-0.8, 0.75)
                                                         was fitted to the downloaded canopy
  control surfaces, dive-brake panels, cowl/exhaust, pitot, antenna mast, markings and colors
                                                         ESTIMATE except their drawing-measured positions below
  IJN dark green over gray-green undersides; six white-bordered hinomaru
                                                         ESTIMATE scheme, positions and sizes (no paint chip read)
  additions sink at least 0.02 m into what they sit on   modeling choice: no coplanar faces (DP0)

REAL-AIRPLANE MEASUREMENT (re-read 2026-10-11, second pass): Wikimedia Commons "Aichi D3A1 Val.svg"
(Kaboldy), linked from the English article's image list, rasterized through Special:FilePath at
3,840 px. It is explicitly a D3A1 drawing; no D3A2 three-view was present in Commons' Aichi D3A file
list. The D3A1 and cited D3A2 share the 10.195 m published length. Side and top views share one scale:
spinner tip x=55 to tail x=2,670, 256.5 px/m; the top view's wingtips then span 14.30 m against the
cited 14.365 m, so the drawing is self-consistent. Side-view heights are meters above the propeller axis
(row 584, the spinner's center). The first pass (same date) read the side view about 1.35x too large:
cowl 1.72 m deep instead of 1.25 m, canopy 1.1 m too far aft and 0.29 m too high, fin 0.35 m too tall,
tailplane span 5.31 m instead of 4.40 m, spats twice as deep. Every side-view table below replaces it;
its top-view wing planform and the 2.55 m origin were right and are kept.

  wing quarter chord at 30% semispan 2.55 m aft of the spinner tip (leading edge 1.85 m, trailing edge
    4.69 m): the model origin                                            DRAWING-MEASURED
  fuselage side silhouette and top-view half-widths: FUSELAGE_M below (+/-0.02 m). The wing hides the
    belly from 1.6 to 4.8 m; the drawn wing-root fillet's lower line (-0.69 to -0.71 m) is used there
                                                                         DRAWING-MEASURED
  greenhouse: windscreen base 2.44 m at +0.76 m, roof +1.02 m from 2.75 to 4.73 m, rear end 4.97 m on
    the deck; 0.39 m half-width; sills buried in the deck                DRAWING-MEASURED
  vertical tail: FIN_LE / FIN_TE below, traced from the outer outline. The dorsal fillet leaves the
    deck at 6.37 m and rises gently to 8.13 m, then the leading edge curves up to a rounded crown,
    +1.96 m at 9.37 m; the rudder trailing edge is near-vertical at 9.95-9.99 m and its hinge 9.35 m
                                                                         DRAWING-MEASURED
  tailplane: TAILPLANE below, elliptical tips, 4.40 m span, elevator hinge straight at 9.45 m, chord
    line +0.06 m                                                         DRAWING-MEASURED
  spat: SPAT below, blunt nose 1.54 m, deepest at 1.9-2.2 m, tail 3.16 m; faired leg 1.95-2.36 m.
    The drawing's tire is 0.26 m lower than the spec stance, so the spat is raised by that much
                                                                         DRAWING-MEASURED, FITTED
  telescopic gunsight 1.95-2.62 m at +0.85 m; antenna mast 3.9 m from the roof to +1.46 m
                                                                         DRAWING-MEASURED

Frame: glTF, +x forward, +y up, +z right, meters. Origin: drawing-measured wing quarter chord at
30% semispan, on the thrust line. Pose: fixed gear down, thrust line level.
Fixed main gear: one faired leg per side into the wing (the drawing's), no braces.
Leaves out: cockpit interior, bomb trapeze/racks/stores, wing-fold detail and tail codes. The dive brakes
are static perforated-looking panels because the renderer has no dive-brake input or part-name contract.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'd3a2'
# --- CITED
SPAN = 14.365
LENGTH = 10.195
WING_AREA = 34.9
BLADES = 3
ROOT_T, TIP_T = 0.15, 0.09       # ESTIMATE: Wikipedia gives no airfoil
HINOMARU_BORDER_M = 0.075     # the Ki-84's cited border
# --- ESTIMATE
PROP_DIAMETER = 3.2
DIHEDRAL_DEG = 4.5
UPPER, LOWER = 'ijaGreen', 'underside'
NOSE_M = 2.55                    # MEASURED: spinner tip to the wing quarter chord at 30% semispan
NOSE_X = NOSE_M / LENGTH
WING_Y = -0.018                  # ESTIMATE: puts the low-wing section through the drawing
# (distance aft nose, half-width, top, bottom, exponent), tail to nose after conversion below; meters.
# The 1.6-4.8 m bottoms follow the drawn wing-root fillet line (see above); 0.30-0.45 m is the engine face.
FUSELAGE_M = [
    (10.195, 0.01, 0.07, 0.03, 2.0), (10.00, 0.05, 0.10, -0.01, 2.0),
    (9.80, 0.09, 0.16, -0.06, 2.0), (9.40, 0.14, 0.22, -0.16, 2.1),
    (9.00, 0.19, 0.25, -0.27, 2.1), (8.60, 0.24, 0.31, -0.33, 2.2),
    (8.20, 0.274, 0.35, -0.40, 2.2), (7.50, 0.345, 0.42, -0.49, 2.3),
    (7.00, 0.39, 0.48, -0.54, 2.4), (6.40, 0.422, 0.54, -0.60, 2.5),
    (6.00, 0.441, 0.59, -0.624, 2.6), (5.50, 0.46, 0.62, -0.65, 2.7),
    (5.00, 0.478, 0.65, -0.67, 2.8), (4.50, 0.49, 0.67, -0.69, 2.8),
    (4.00, 0.505, 0.68, -0.70, 2.8), (3.50, 0.515, 0.69, -0.705, 2.8),
    (3.00, 0.53, 0.70, -0.706, 2.7), (2.50, 0.545, 0.72, -0.70, 2.5),
    (2.00, 0.555, 0.72, -0.69, 2.3), (1.60, 0.552, 0.69, -0.68, 2.2),
    (1.40, 0.546, 0.66, -0.67, 2.1), (1.36, 0.58, 0.66, -0.67, 2.0),
    (1.00, 0.58, 0.66, -0.66, 2.0), (0.80, 0.58, 0.647, -0.647, 2.0),
    (0.60, 0.56, 0.604, -0.604, 2.0), (0.51, 0.50, 0.52, -0.51, 2.0),
    (0.45, 0.30, 0.30, -0.30, 2.0), (0.30, 0.15, 0.15, -0.15, 2.0),
]
# Explicit fitted greenhouse sections, tail to nose, meters:
# (x, rail half-width, rail y, shoulder half-width, shoulder y, roof half-width, roof y, crown y).
# The rails sit below the deck, inside the local shape-preserved fuselage skin (checked against
# fus_side_z at each row), so the underside cannot expose a daylight wedge along either side.
CANOPY = [
    (-2.42, 0.08, 0.56, 0.07, 0.62, 0.05, 0.66, 0.70),
    (-2.25, 0.30, 0.50, 0.27, 0.80, 0.18, 0.90, 0.93),
    (-2.00, 0.39, 0.50, 0.36, 0.92, 0.25, 1.00, 1.02),
    (-1.25, 0.39, 0.50, 0.37, 0.93, 0.26, 1.01, 1.02),
    (-0.55, 0.39, 0.52, 0.37, 0.93, 0.26, 1.01, 1.02),
    (-0.17, 0.36, 0.55, 0.33, 0.92, 0.22, 0.99, 1.00),
    (0.09, 0.17, 0.62, 0.15, 0.74, 0.10, 0.78, 0.79),
]
CANOPY_FRAMES = (-2.22, -1.95, -1.60, -1.25, -0.88, -0.55, -0.17)
# Tailplane (top view): (spanwise z, leading station, trailing station, thickness m); chord line +0.06 m.
TAILPLANE = [(0.00, 8.34, 10.14, 0.18), (0.40, 8.384, 10.133, 0.175), (0.80, 8.495, 10.123, 0.163),
             (1.20, 8.63, 10.066, 0.144), (1.52, 8.782, 10.012, 0.123), (1.76, 8.922, 9.94, 0.10),
             (1.92, 9.033, 9.862, 0.083), (2.00, 9.103, 9.809, 0.07), (2.08, 9.191, 9.735, 0.054),
             (2.16, 9.314, 9.604, 0.029), (2.20, 9.40, 9.52, 0.012)]
TAILPLANE_Y = 0.06
ELEVATOR_HINGE = (0.42, 1.92, 9.45)     # spanwise extent and its straight unswept hinge station
# Vertical tail outer outline (side view): (height above the thrust line, station).
FIN_LE = [(0.05, 6.37), (0.54, 6.37), (0.60, 6.68), (0.63, 7.00), (0.67, 7.60), (0.70, 8.00), (0.735, 8.20),
          (0.809, 8.30), (0.873, 8.35), (0.969, 8.40), (1.062, 8.45), (1.154, 8.50), (1.238, 8.55), (1.314, 8.60),
          (1.388, 8.65), (1.456, 8.70), (1.517, 8.75), (1.577, 8.80), (1.635, 8.85), (1.692, 8.90), (1.745, 8.95),
          (1.789, 9.00), (1.836, 9.05), (1.873, 9.10), (1.904, 9.15), (1.928, 9.20), (1.943, 9.25), (1.951, 9.30)]
FIN_TE = [(0.05, 10.00), (0.29, 9.99), (0.71, 9.977), (0.99, 9.969), (1.20, 9.953), (1.34, 9.930), (1.48, 9.895),
          (1.55, 9.871), (1.604, 9.85), (1.69, 9.815), (1.76, 9.772), (1.83, 9.708), (1.904, 9.60), (1.942, 9.50),
          (1.951, 9.46)]
FIN_THICKNESS = [(0.05, 0.13), (1.50, 0.12), (1.80, 0.08), (1.90, 0.05), (1.951, 0.03)]
RUDDER_HINGE = ((0.31, 9.351), (1.62, 9.36))
PROP = dict(hub=0.28, chord=0.25, spinner_r=0.18, spinner_len=0.28)  # meters; spinner tip is d=0
GEAR = dict(x=0.430, z=1.62, bottom=2.110, wheel_r=0.39, wheel_w=0.20)
TAILWHEEL = dict(x=-6.790, y=-0.10, bottom=0.500, wheel_r=0.12, wheel_w=0.07)
REAR_GUN = dict(x=-2.10, y=0.86, length=0.75)
# Spat side outline (drawing, raised SPAT_RAISE so the tire meets the spec stance): (x, half-width,
# half-height, center y); the drawing's tire bottom is 0.26 m below the spec's.
SPAT_RAISE = 0.0
SPAT = [(-0.61, 0.02, 0.03, -1.50), (-0.45, 0.08, 0.145, -1.515), (-0.20, 0.14, 0.245, -1.515),
        (0.05, 0.19, 0.335, -1.505), (0.35, 0.21, 0.385, -1.485), (0.60, 0.21, 0.385, -1.495),
        (0.75, 0.19, 0.34, -1.51), (0.89, 0.15, 0.255, -1.525), (0.95, 0.10, 0.17, -1.53), (1.01, 0.02, 0.04, -1.52)]
# The faired main leg between spat and wing (side view): leading and trailing stations, thickness m.
GEAR_LEG = dict(le=1.95, te=2.36, thickness=0.09)

SEGMENTS = 96
SUBDIVIDE = 4
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.61, 0.84, 0.70)
FLAP1 = (0.13, 0.29, 0.73)
FLAP2 = (0.31, 0.59, 0.73)
EXHAUSTS = dict(count=4, d0=1.10, d1=1.55, y=-0.35, r=0.030, length=0.20)
HINOMARU = dict(wing_z=0.66, wing_chord=0.48, wing_red=0.58, fus_d=7.15, fus_depth=0.72)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    """A fraction of LENGTH aft of the spinner tip, as glTF x."""
    return (NOSE_X - f) * L


def XD(d):
    """Meters aft of the spinner tip, as glTF x."""
    return NOSE_M - d


FUSELAGE = [(d / L, w / L, (top - bottom) / (2 * L), (top + bottom) / (2 * L), n)
            for d, w, top, bottom, n in FUSELAGE_M]
_FUS, _ = kit._refine_shape([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], SUBDIVIDE)


def fus_section(f):
    x = X(f)
    i = next(k for k in range(len(_FUS) - 1) if _FUS[k][0] <= x <= _FUS[k + 1][0])
    t = (x - _FUS[i][0]) / (_FUS[i + 1][0] - _FUS[i][0])
    return tuple(_FUS[i][c] + (_FUS[i + 1][c] - _FUS[i][c]) * t for c in (1, 2, 3, 4))


def fus_side_z(f, y):
    hw, hh, cy, n = fus_section(f)
    return hw * max(0.0, 1.0 - abs((y - cy) / hh) ** n) ** (1.0 / n)


def fus_top_y(f, z):
    hw, hh, cy, n = fus_section(f)
    return cy + hh * max(0.0, 1.0 - abs(z / hw) ** n) ** (1.0 / n)


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)
# Drawing-measured elliptical planform, scaled by 0.966 so its piecewise trapezoids total the cited 34.9 m2.
WING_F = (0.0, 0.30, 0.60, 0.85, 1.0)
WING_C = (3.864, 2.898, 2.415, 1.546, 0.097)
WING_QC = (0.07, 0.0, -0.15, -0.34, -0.49)
tan_di = math.tan(math.radians(DIHEDRAL_DEG))


def interp_wing(values, z):
    f = min(1.0, abs(z) / (S / 2))
    i = next((i for i in range(len(WING_F) - 1) if WING_F[i] <= f <= WING_F[i + 1]), len(WING_F) - 2)
    t = (f - WING_F[i]) / (WING_F[i + 1] - WING_F[i])
    return values[i] + t * (values[i + 1] - values[i])


def chord_at(z):
    return interp_wing(WING_C, z)


def le_x(z):
    return interp_wing(WING_QC, z) + 0.25 * chord_at(z)


def wing_y(z):
    return WING_Y * L + abs(z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS,
               subdivide=SUBDIVIDE, lower_role=LOWER, refinement='shape')
with m.tagged('canopy'), m.shared_chart():
    m.faired_canopy('glazing', UPPER, CANOPY, list(CANOPY_FRAMES), bar=0.020)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP1, 'Flap1'), (FLAP2, 'Flap2'), (AILERON, 'Aileron'))]
with m.tagged('wing'), m.shared_chart():
    for f0, f1 in zip(WING_F, WING_F[1:]):
        z0, z1 = f0 * S / 2, f1 * S / 2
        c0, c1 = chord_at(z0), chord_at(z1)
        le0, le1 = le_x(z0), le_x(z1)
        sweep = math.degrees(math.atan((le0 - le1) / (z1 - z0)))
        t0 = ROOT_T + (TIP_T - ROOT_T) * f0
        t1 = ROOT_T + (TIP_T - ROOT_T) * f1
        m.wing(UPPER, le0, wing_y(z0), c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=t0, tip_thickness=t1, root_z=z0, lower_role=LOWER,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)

def lerp(table, h):
    """Linear interpolation in a [(key, value)] table, keys increasing."""
    for (h0, v0), (h1, v1) in zip(table, table[1:]):
        if h <= h1:
            return v0 + (v1 - v0) * (h - h0) / (h1 - h0)
    return table[-1][1]


eh = ELEVATOR_HINGE
with m.tagged('tailplane'), m.shared_chart():
    m.wing_outline(UPPER, [(z, XD(le), XD(te), TAILPLANE_Y, t) for z, le, te, t in TAILPLANE], lower_role=LOWER,
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
                blade_sections=[(0.13, 0.9, 42.0), (0.35, 1.05, 32.0), (0.6, 1.0, 24.0), (0.85, 0.8, 19.0), (1.0, 0.45, 16.0)])
g = GEAR
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    # Fixed gear: no GearL/GearR nodes. The full spats are skin; the tire bottoms are fitted to the spec.
    # The central spat section reaches into the wing skin; the short root and two braces below overlap both
    # supporting surfaces. The earlier spat stopped 0.08 m below the wing and visibly floated.
    for side in (-1, 1):
        z = side * g['z']
        m.fuselage(UPPER, [(x, w, h, y + SPAT_RAISE) for x, w, h, y in SPAT], segments=48, center_z=z,
                   lower_role=LOWER, subdivide=4, refinement='shape')
        root_y = wing_y(z) - 0.06
        spat_top = max(y + h for _x, _w, h, y in SPAT) + SPAT_RAISE
        leg = GEAR_LEG
        m.fin_outline(UPPER, spat_top - 0.10, [(0.0, XD(leg['le']), XD(leg['te']), leg['thickness']),
                                               (root_y - spat_top + 0.10, XD(leg['le']) + 0.02, XD(leg['te']), leg['thickness'])],
                      center_z=z, stations=STATIONS)
        m.revolve('dark', (g['x'], -g['bottom'] + g['wheel_r'], z), (0.0, 0.0, float(side)),
                  [(-g['wheel_w'] / 2, 0.85 * g['wheel_r']), (-0.45 * g['wheel_w'], g['wheel_r']),
                   (0.45 * g['wheel_w'], g['wheel_r']), (g['wheel_w'] / 2, 0.85 * g['wheel_r'])], 24)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.035)
with m.tagged('fittings'), m.shared_chart():
    e = EXHAUSTS
    for side in (-1, 1):
        for k in range(e['count']):
            d = e['d0'] + (e['d1'] - e['d0']) * k / (e['count'] - 1)
            f = d / L
            m.revolve('dark', (XD(d), e['y'], side * (fus_side_z(f, e['y']) - 0.05)), (-1.0, -0.12, side * 0.55),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # Two synchronized Type 97 guns at the existing spec's positions.
    for side in (-1, 1):
        m.gun_barrel('dark', (1.9, 0.45, side * 0.25), 0.0, 0.0, 0.55, 0.015)
    pz = -6.0
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.38, wing_y(pz), pz), 0.008, sides=6)
    m.strut('dark', (XD(3.92), 0.98, 0.0), (XD(3.87), 1.46, 0.0), 0.012, 0.006, sides=6)
    # The long telescopic gunsight ahead of the windscreen.
    m.strut('dark', (XD(1.95), 0.86, 0.0), (XD(2.62), 0.83, 0.0), 0.028, sides=8)
    m.strut('dark', (tw['x'] - 0.02, tw['y'] + 0.02, 0.0), (tw['x'] + 0.30, tw['y'] - 0.25, 0.0), 0.020, sides=6)
    # Static, slotted-looking dive brakes under both outer wings: the renderer has no dive-brake control input.
    for side in (-1, 1):
        for k in range(8):
            z = side * (3.2 + 0.22 * k)
            y = wing_y(z) - 0.5 * chord_at(z) * (ROOT_T + (TIP_T - ROOT_T) * abs(z) / (S / 2)) - 0.025
            m.strut('dark', (le_x(z) - 0.55 * chord_at(z), y, z), (le_x(z) - 0.90 * chord_at(z), y, z), 0.025, sides=4)
# Rear gunner's 7.7 mm Type 92 at the greenhouse's aft end, drawn in its stowed aft position.
r = REAR_GUN
with m.tagged('turret'), m.shared_chart():
    direction = (-1.0, 0.12, 0.0)
    m.revolve('dark', (r['x'] + 0.06, r['y'] - 0.01, 0.0), direction, [(0.0, 0.025), (0.12, 0.07), (0.24, 0.025)], 12)
    m.machine_gun('dark', (r['x'] + 0.14, r['y'] - 0.02, 0.0), direction, r['length'], scale=0.75)

h = HINOMARU
for side in (-1, 1):
    z = side * h['wing_z'] * S / 2
    x = le_x(z) - h['wing_chord'] * chord_at(z)
    for up in (1.0, -1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'] + HINOMARU_BORDER_M, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'], color='hinomaruRed')
    f = h['fus_d'] / L
    hw, hh, cy, _n = fus_section(f)
    outer = h['fus_depth'] * hh
    center = (XD(h['fus_d']), cy, side * hw)
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer - HINOMARU_BORDER_M, color='hinomaruRed')
    streak = [(-0.8, -0.10), (1.2, -0.28), (1.2, 0.09), (-0.8, 0.10)]
    m.marking('polygon', tags=['fuselage'], origin=(XD(EXHAUSTS['d1']), EXHAUSTS['y'], 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.0), -1.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-0.9, -0.25), (0.6, -0.25), (0.6, 0.35), (-0.9, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.marking('disc', tags=['wing'], center=(le_x(-3.6) - 0.02, wing_y(-3.6), -3.6), axis=(1.0, 0.0, 0.0), radiusM=0.09, color='lensClear')
m.export(out)
