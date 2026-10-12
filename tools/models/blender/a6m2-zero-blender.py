# tools/models/blender/a6m2-zero-blender.py
"""Mitsubishi A6M2 Model 21 Zero. Original work, AGPL-3.0-or-later.

A Hangar-only duplicate beside the Sketchfab download (content/aircraft/a6m2-zero.glb stays), built from
the F6F single-engine template and fitted to content/aircraft/a6m2-zero.json so later promotion needs no
flight-model change. The real airplane, not the download, owns the silhouette.

Figures (English Wikipedia "Mitsubishi A6M Zero", Specifications (A6M2 (Type 0 Model 21)), read 2026-10-11):
  span 12.0 m (39 ft 4 in), length 9.06 m (29 ft 9 in), wing area 22.44 m2
                                                        CITED
  root airfoil MAC118 or NACA 2315; tip MAC118 or NACA 3309
                                                        CITED (the symmetric kit section approximates thickness only)
  3-bladed Sumitomo-Hamilton constant-speed propeller    CITED (blade count and maker); that table leaves diameter blank
  propeller diameter 2.88 m                             ESTIMATE, the drawing's front-view disc
  2 x 7.7 mm Type 97 cowling guns, 500 rpg; 2 x 20 mm Type 99-1 Mk.3 wing cannon, 60 rpg
                                                        CITED
  main gear retracts 90 degrees inward                  CITED, USAAF Intelligence Summary 85 as quoted by the existing
                                                        spec; the model uses one hinge and leaves each wheel upright
  overall early-war gray-green, six unbordered hinomaru ESTIMATE (palette role ijnaGray; no paint chip or airframe read)
  exhaust outlets, leg covers, transverse section exponents; the tailplane-root fillet is left out
                                                        ESTIMATE from the drawing and period proportions
  additions sink at least 0.02 m into what they sit on modeling choice: no coplanar faces (DP0)

REAL-AIRPLANE MEASUREMENT (re-read 2026-10-11, second pass): Wikimedia Commons "Mitsubishi A6M Zero
drawing.svg" (Kaboldy), rasterized through Special:FilePath at 3,840 px. Side and top views share ONE scale:
spinner tip x=51 to tail x=2,770 in the side view and x=51 to 2,766 in the top view, 300.1 px/m over the
cited 9.06 m; the top view's wingtips (rows 1,070 and 4,626) then span 11.85 m, 1.3% under the cited 12.0 m,
so the one scale is used for everything. Side-view heights are meters above the propeller axis (row 526.5,
the spinner's center); top-view centerline row 2,848. The first pass (same date) read the top view at its own
scale, 7% small (it took the tail 7% long at 1,920 px): every half-width was 7% narrow, and its origin, the
quarter chord at 30% semispan, came out 2.22 m instead of 2.36 m aft of the spinner. It also put the fin
crown 0.3 m aft on a straight trapezoid, a 4.0 m square-tipped tailplane on a chord line 0.13 m high, the
mast 1.5 m aft, the canopy's rear 0.17 m short, a 0.36 m spinner and a 0.12 m half-width tail cone at 7.5 m.

  wing quarter chord at 30% semispan 2.36 m aft of the spinner tip (leading edge 1.80 m, trailing edge
    4.04 m): the model origin                                            DRAWING-MEASURED
  cross-check against the spec's stance: the drawing's own main wheel (a circle on the ground line, r 0.30 m)
    is centered 1.94 m aft of the spinner and its tailwheel 8.55 m; the spec-fitted mains (x 0.182) land at
    2.18 m and its tailwheel (x -6.532) at 8.89 m, 0.24 m and 0.34 m aft of the drawing's. The spec was
    fitted to the download; stance is the spec's (below), so the model's wheels sit that far aft. Its tire
    bottom is 0.25 m below the drawing's, so no leg is raised         UNRESOLVED, recorded
  wing planform: straight taper 0.451 (drawn root 2.70 m extrapolated to the centerline, 1.22 m at the tip),
    leading edge swept 4.2 deg, quarter chord within 0.05 m of straight across; rounded tip from 84% semispan
    (WINGTIP); the model's root chord, 2.63 m, is FITTED so that planform has the cited area. Chord-line
    height -0.41 m at the root, dihedral 5.3 deg (front view, mid-thickness of the drawn wing from 2 to 5 m
    out)                                                                 DRAWING-MEASURED
  flap 11%-39% semispan, hinge 78% chord; aileron 40%-91%, hinge 85% chord  DRAWING-MEASURED
  fuselage side silhouette and top-view half-widths: FUSELAGE_M below (+/-0.01 m). The wing hides the belly
    from 1.6 to 4.4 m; the drawn wing-root lower line is used there. The tailplane hides the plan outline from
    6.6 to 8.25 m: half-widths there are interpolated (ESTIMATE). Under the fin the body top follows the
    drawn fin-root line (+0.32/+0.29 m). The oil-cooler scoop under the cowl, 1.25-2.0 m, to -0.75 m: SCOOP
                                                                         DRAWING-MEASURED
  canopy: windscreen base 2.18 m at +0.65 m, roof +1.005 m from 2.8 to 3.35 m, falling to 0.72 m at 4.45 m
    and closing on the deck at 4.72 m; 0.345 m half-width at the rails (top view), roof 0.17 m and shoulder
    0.28 m half-width from the front view                                DRAWING-MEASURED
  proposed real-cockpit eye (-0.74, 0.72) m: 3.10 m aft of the spinner under the sliding hood, 0.28 m under
    its roof; the existing spec's (-0.896, 0.73) was fitted to the download    ESTIMATE within the drawing
  vertical tail: FIN_LE / FIN_TE below, traced from the outer outline. The fillet leaves the spine at 6.80 m,
    the leading edge runs straight from +0.6 m to +1.4 m, then curves to a rounded crown +1.645 m at 8.12 m;
    the rudder hinge is straight at 8.10 m                              DRAWING-MEASURED
  tailplane: TAILPLANE below, 4.65 m span, rounded tips, elevator hinge straight at 7.73 m, chord line
    +0.12 m, root thickness 0.16 m (side view)                          DRAWING-MEASURED
  propeller: spinner 0.52 m long, radius 0.24 m; hub 0.39 m aft of the tip; disc 2.88 m in the front view
                                                                         DRAWING-MEASURED
  antenna mast from the canopy at 4.27 m to +1.53 m at 4.12 m, raked forward  DRAWING-MEASURED
  tailwheel radius 0.07 m, main wheel radius 0.295 m                   DRAWING-MEASURED

Stance: wheel bottoms 2.025 m below the origin at x 0.182, tailwheel at x -6.532 and y -0.570
                                                        FITTED to a6m2-zero.json gear.heightM / mainX /
                                                        thirdX / thirdHeightM and its 12.224 deg stance
Frame: glTF, +x forward, +y up, +z right, meters. Origin: measured wing quarter chord on the thrust line.
Pose: gear down, thrust line level. Leaves out cockpit interior, folding wing tips, arrester hook, racks,
rails and stores; attachment is spec data and blenderDuplicates.test.ts fits it to the wing.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'a6m2b'
# --- CITED
SPAN = 12.0
LENGTH = 9.06
WING_AREA = 22.44
BLADES = 3
ROOT_T, TIP_T = 0.15, 0.09
# --- ESTIMATE
PROP_DIAMETER = 2.88
UPPER = LOWER = 'ijnaGray'
# --- DRAWING-MEASURED (header)
NOSE_M = 2.36                  # spinner tip to the wing quarter chord at 30% semispan
TAPER = 0.451
DIHEDRAL_DEG = 5.3
WING_Y = -0.41                 # wing chord line at the root, m above the propeller axis
# (distance aft of the spinner, half-width, top, bottom, exponent), tail to nose after conversion; meters.
# 1.6-4.4 m bottoms are the drawn wing-root lower line; 6.6-8.25 m half-widths are interpolated (header).
FUSELAGE_M = [
    (9.06, 0.010, -0.060, -0.100, 2.0), (9.00, 0.030, -0.005, -0.105, 2.0),
    (8.90, 0.050, 0.118, -0.125, 2.0), (8.80, 0.065, 0.290, -0.142, 2.0),
    (8.60, 0.095, 0.300, -0.150, 2.0), (8.40, 0.120, 0.310, -0.200, 2.0),
    (8.25, 0.135, 0.320, -0.240, 2.0), (8.00, 0.165, 0.355, -0.272, 2.1),
    (7.50, 0.230, 0.405, -0.340, 2.2), (7.00, 0.290, 0.448, -0.395, 2.2),
    (6.75, 0.318, 0.462, -0.422, 2.2), (6.50, 0.345, 0.482, -0.445, 2.2),
    (6.00, 0.393, 0.525, -0.488, 2.2), (5.50, 0.433, 0.561, -0.521, 2.3),
    (5.00, 0.463, 0.595, -0.551, 2.3), (4.75, 0.477, 0.611, -0.561, 2.3),
    (4.50, 0.495, 0.610, -0.571, 2.3), (4.00, 0.502, 0.600, -0.588, 2.3),
    (3.50, 0.513, 0.600, -0.598, 2.3), (3.00, 0.523, 0.600, -0.608, 2.3),
    (2.50, 0.533, 0.620, -0.608, 2.3), (2.20, 0.540, 0.645, -0.605, 2.2),
    (2.00, 0.546, 0.648, -0.598, 2.2), (1.75, 0.546, 0.618, -0.640, 2.1),
    (1.50, 0.546, 0.591, -0.650, 2.0), (1.45, 0.555, 0.621, -0.655, 2.0),
    (1.20, 0.562, 0.611, -0.651, 2.0), (1.00, 0.572, 0.601, -0.655, 2.0),
    (0.80, 0.572, 0.588, -0.648, 2.0), (0.70, 0.559, 0.571, -0.628, 2.0),
    (0.60, 0.521, 0.535, -0.575, 2.0), (0.54, 0.462, 0.485, -0.521, 2.0),
    (0.51, 0.300, 0.300, -0.320, 2.0), (0.45, 0.180, 0.180, -0.180, 2.0),
]
# The oil-cooler scoop under the cowl: (distance aft, half-width, top, bottom); its top is buried in the belly.
SCOOP = [(2.00, 0.03, -0.50, -0.56), (1.75, 0.10, -0.50, -0.69), (1.60, 0.12, -0.50, -0.728),
         (1.45, 0.13, -0.50, -0.752), (1.28, 0.12, -0.50, -0.745), (1.24, 0.06, -0.52, -0.70)]
# Fitted canopy sections, (distance aft, rail half-width, rail y, shoulder half-width, shoulder y,
# roof half-width, roof y, crown y); rails at +0.45 m sit inside the fuselage skin.
CANOPY_M = [
    (4.70, 0.070, 0.45, 0.060, 0.56, 0.040, 0.600, 0.618),
    (4.60, 0.232, 0.45, 0.170, 0.57, 0.090, 0.630, 0.661),
    (4.45, 0.306, 0.45, 0.220, 0.60, 0.120, 0.690, 0.721),
    (4.20, 0.330, 0.45, 0.260, 0.64, 0.140, 0.770, 0.810),
    (3.80, 0.340, 0.45, 0.270, 0.68, 0.160, 0.870, 0.921),
    (3.35, 0.345, 0.45, 0.280, 0.70, 0.170, 0.950, 1.005),
    (2.80, 0.345, 0.45, 0.280, 0.70, 0.170, 0.950, 1.005),
    (2.62, 0.345, 0.45, 0.280, 0.70, 0.170, 0.930, 0.970),
    (2.45, 0.330, 0.45, 0.270, 0.68, 0.160, 0.840, 0.870),
    (2.30, 0.240, 0.45, 0.200, 0.62, 0.120, 0.730, 0.765),
    (2.18, 0.120, 0.45, 0.100, 0.55, 0.060, 0.620, 0.660),
]
CANOPY_FRAMES_M = (4.45, 4.18, 3.73, 3.37, 3.05, 2.75, 2.45)
# Wingtip rounding: (fraction of semispan, fraction of the straight-taper chord, forward shift of mid-chord
# as a fraction of that chord); the drawn tip's mid-chord stays on the trapezoid's.
WINGTIP = [(0.844, 1.0, 0.0), (0.878, 0.985, 0.0), (0.911, 0.920, 0.0), (0.928, 0.868, 0.0), (0.945, 0.796, 0.0),
           (0.962, 0.704, 0.0), (0.970, 0.645, 0.0), (0.979, 0.568, 0.0), (0.987, 0.463, -0.005),
           (0.996, 0.297, -0.008), (0.9992, 0.179, -0.010), (1.0, 0.074, -0.010)]
# Tailplane (top view): (spanwise z, leading station, trailing station, thickness m); chord line TAILPLANE_Y.
TAILPLANE = [(0.00, 6.62, 8.15, 0.16), (0.35, 6.688, 8.124, 0.15), (0.75, 6.834, 8.081, 0.135),
             (1.25, 7.011, 8.024, 0.115), (1.75, 7.184, 7.967, 0.09), (2.00, 7.271, 7.934, 0.08),
             (2.10, 7.311, 7.894, 0.07), (2.20, 7.374, 7.825, 0.055), (2.25, 7.424, 7.774, 0.045),
             (2.28, 7.464, 7.735, 0.035), (2.30, 7.500, 7.700, 0.025), (2.32, 7.560, 7.643, 0.012)]
TAILPLANE_Y = 0.12
ELEVATOR_HINGE = (0.36, 2.00, 7.73)     # spanwise extent and its straight unswept hinge station
# Vertical tail outer outline (side view): (height above the thrust line, station).
FIN_LE = [(0.10, 6.70), (0.46, 6.80), (0.48, 6.888), (0.50, 6.931), (0.55, 6.991), (0.60, 7.034), (0.70, 7.114),
          (1.00, 7.351), (1.40, 7.667), (1.45, 7.707), (1.50, 7.757), (1.55, 7.824), (1.58, 7.874), (1.60, 7.917),
          (1.62, 7.971), (1.63, 8.004), (1.64, 8.051), (1.645, 8.09)]
FIN_TE = [(0.10, 8.87), (0.21, 8.85), (0.29, 8.82), (0.55, 8.777), (0.60, 8.73), (0.80, 8.674), (1.00, 8.62),
          (1.20, 8.564), (1.40, 8.504), (1.45, 8.474), (1.50, 8.437), (1.55, 8.384), (1.58, 8.344), (1.60, 8.307),
          (1.62, 8.264), (1.63, 8.234), (1.64, 8.191), (1.645, 8.15)]
FIN_THICKNESS = [(0.10, 0.20), (0.50, 0.16), (0.70, 0.11), (1.40, 0.09), (1.58, 0.06), (1.64, 0.025), (1.645, 0.012)]
RUDDER_HINGE = ((0.32, 8.106), (1.58, 8.092))
PROP = dict(hub=0.39, chord=0.2265, spinner_r=0.24, spinner_len=0.52)  # meters; spinner tip is d=0
# x and bottom are FITTED to the spec; z and hinge placement are ESTIMATE; wheel radii DRAWING-MEASURED.
GEAR = dict(x=0.420, z=1.74, bottom=2.025, wheel_r=0.295, wheel_w=0.16)
TAILWHEEL = dict(x=-6.190, y=-0.08, bottom=0.320, wheel_r=0.07, wheel_w=0.05)

SEGMENTS = 96
SUBDIVIDE = 3
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.40, 0.91, 0.85)
FLAP = (0.11, 0.39, 0.78)
EXHAUSTS = dict(count=2, d0=1.30, d1=1.40, y=-0.52, r=0.030, length=0.14)
FILLET = dict(le=2.00, te=4.50, half_w=0.181, half_h=0.127)
INSIGNIA = dict(fus_d=5.89, fus_dia=0.92, wing_z=0.65, wing_chord=0.45, wing_dia=1.25)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def XD(d):
    """Meters aft of the spinner tip, as glTF x."""
    return NOSE_M - d


FUSELAGE = [(XD(d), w, (top - bottom) / 2, (top + bottom) / 2, n) for d, w, top, bottom, n in FUSELAGE_M]
_FUS, _ = kit._refine_shape(FUSELAGE, SUBDIVIDE)


def fus_section(d):
    """(half-width, half-height, center y, exponent) of the lofted fuselage at XD(d), linear between rings."""
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


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)


def taper_chord(f):
    return 1.0 - (1.0 - TAPER) * f


# Root chord FITTED so the straight-taper wing with the drawn rounded tip has the cited area.
_tip_f = [(0.0, 1.0)] + [(f, k) for f, k, _s in WINGTIP]
_area_fraction = sum((taper_chord(f0) * k0 + taper_chord(f1) * k1) / 2 * (f1 - f0) for (f0, k0), (f1, k1) in zip(_tip_f, _tip_f[1:]))
root_chord = WING_AREA / (S * _area_fraction)
tip_chord = TAPER * root_chord
sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))  # an unswept quarter chord
tan_sw, tan_di = math.tan(math.radians(sweep)), math.tan(math.radians(DIHEDRAL_DEG))


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def le_x(z):
    return 0.25 * root_chord - abs(z) * tan_sw


def wing_y(z):
    return WING_Y + abs(z) * tan_di


def wing_thickness(z):
    return ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * abs(z) / (S / 2)


with m.tagged('fuselage'):
    m.fuselage(UPPER, FUSELAGE, segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=LOWER, refinement='shape')
    m.fuselage(UPPER, [(XD(d), w, (top - bottom) / 2, (top + bottom) / 2) for d, w, top, bottom in SCOOP],
               segments=32, subdivide=4, lower_role=LOWER, refinement='shape')
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = WING_Y + 0.55 * ROOT_T * root_chord - FILLET['half_h']
    fz = fus_side_z(mid, fy) + FILLET['half_w'] - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(XD(FILLET['te']), 0.036, 0.036, WING_Y),
                           (XD(mid), FILLET['half_w'], FILLET['half_h'], fy),
                           (XD(FILLET['le']), 0.036, 0.036, WING_Y)],
                   segments=24, center_z=side * fz, subdivide=4, lower_role=LOWER)
with m.tagged('canopy'), m.shared_chart():
    m.faired_canopy('glazing', UPPER, [(XD(d), *rest) for d, *rest in CANOPY_M], [XD(d) for d in CANOPY_FRAMES_M], bar=0.022)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
gear_z = GEAR['z']
tip_z = WINGTIP[0][0] * S / 2
breaks = [0.0, gear_z, tip_z]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = chord_at(z0), chord_at(z1)
        a0, a1 = wing_thickness(z0), wing_thickness(z1)
        m.wing(UPPER, le_x(z0), wing_y(z0), c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0,
               lower_role=LOWER, stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
    # The outer panel ends in the drawing's rounded tip.
    tip_rows = []
    for f, k, shift in WINGTIP:
        z = f * S / 2
        c = chord_at(z)
        mid = le_x(z) - 0.5 * c + shift * c
        tip_rows.append((z, mid + 0.5 * k * c, mid - 0.5 * k * c, wing_y(z), k * wing_thickness(z)))
    # The aileron hinge continues the inner panel's straight 85%-chord line into the tip.
    hinge = tuple((z, le_x(z) - AILERON[2] * chord_at(z)) for z in (tip_z, S / 2))
    m.wing_outline(UPPER, tip_rows, lower_role=LOWER, stations=STATIONS, span_segments=1,
                   controls=[(AILERON[0] * S / 2, AILERON[1] * S / 2, hinge, 'Aileron')])


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
                blade_sections=[(0.13, 0.9, 44.0), (0.35, 1.05, 33.0), (0.6, 1.0, 25.0), (0.85, 0.8, 19.0), (1.0, 0.5, 16.0)])
g = GEAR
# The hinge sits low in the wing so the upright wheel, swung aft, stays under the upper skin (header: one hinge, ESTIMATE).
hinge_y = wing_y(gear_z) - 0.40 * ROOT_T * root_chord
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], hinge_y, side * gear_z), g['bottom'] + hinge_y, g['wheel_r'], g['wheel_w'], node=name)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.03, node='Tailwheel')
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        # Leg cover on the outboard face of the strut, its face EMBED_M inside it.
        m.box('dark', (g['x'], hinge_y - 0.55 * (g['bottom'] + hinge_y), side * (gear_z + strut_r - EMBED_M + 0.006)), (0.34, 0.82, 0.012), node=name)
    e = EXHAUSTS
    for side in (-1, 1):
        for k in range(e['count']):
            d = e['d0'] + (e['d1'] - e['d0']) * k / (e['count'] - 1)
            m.revolve('dark', (XD(d), e['y'], side * (fus_side_z(d, e['y']) - 0.05)), (-1.0, -0.15, side * 0.5),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # The spec's two 20 mm wing cannon and two synchronized 7.7 mm cowl guns (header, CITED).
    for side in (-1, 1):
        gz = 2.3 * side
        m.gun_barrel('dark', (le_x(gz) - 0.30, wing_y(gz), gz), 0.0, 0.0, 0.48, 0.016)
        z = 0.25 * side
        m.gun_barrel('dark', (1.78, 0.45, z), 0.0, 0.0, 0.50, 0.010)
    # Pitot on the left wing, 4.83 m out, reaching to 1.43 m aft of the spinner (drawing).
    pz = -4.83
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (XD(1.43), wing_y(pz), pz), 0.009, sides=6)
    # Antenna mast on the canopy's rear frame, raked forward (drawing).
    m.strut('dark', (XD(4.27), 0.76, 0.0), (XD(4.12), 1.53, 0.0), 0.012, 0.006, sides=6)


ins = INSIGNIA
for side in (-1, 1):
    hw, hh, cy, _n = fus_section(ins['fus_d'])
    m.marking('disc', tags=['fuselage'], center=(XD(ins['fus_d']), cy, side * hw),
              axis=(0.0, 0.0, float(side)), radiusM=0.5 * ins['fus_dia'], color='hinomaruRed')
    z = side * ins['wing_z'] * S / 2
    x = le_x(z) - ins['wing_chord'] * chord_at(z)
    for up in (-1.0, 1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0),
                  radiusM=0.5 * ins['wing_dia'], color='hinomaruRed')
for side in (-1, 1):
    streak = [(-0.9, -0.12), (1.4, -0.32), (1.4, 0.10), (-0.9, 0.12)]
    m.marking('polygon', tags=['fuselage'], origin=(XD(EXHAUSTS['d1']), EXHAUSTS['y'], 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.2), -1.2), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-1.0, -0.25), (0.7, -0.25), (0.7, 0.35), (-1.0, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.export(out)
