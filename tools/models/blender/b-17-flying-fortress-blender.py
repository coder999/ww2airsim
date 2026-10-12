# tools/models/blender/b-17-flying-fortress-blender.py
"""Boeing B-17G Flying Fortress. Original work, AGPL-3.0-or-later.

Hangar-only duplicate of ``b-17-flying-fortress``. Built from kit.py using the
B-29 four-engine layout and the TBM-3 bay/turret conventions.

Figures (read 2026-10-11, English Wikipedia, "Boeing B-17 Flying Fortress",
Specifications (B-17G), unless stated otherwise):
  span 31.62 m (103 ft 9 in), length 22.66 m (74 ft 4 in),
    wing area 131.92 m2 (1,420 sq ft)                         CITED
  NACA 0018 root / NACA 0010 tip airfoils                    CITED
  four Wright R-1820 engines and 3-bladed Hamilton-Standard
    constant-speed propellers                                CITED
  13 x .50 in M2 Browning guns in nine positions: two chin,
    two cheek, two waist, two top, two ball, two tail and one
    radio-compartment gun                                    CITED
  propeller diameter 3.54 m (11 ft 7 in)                     ESTIMATE: the
    Wikipedia specification gives blade count but leaves diameter blank;
    diameter measured from the Commons drawing below

Real-airplane measurement (re-read 2026-10-11, second pass): Wikimedia Commons
"Boeing B-17G Flying Fortress 3-view line drawing.svg", Kaboldy, CC BY-SA
3.0, rasterized through Special:FilePath at 3,840 px. Side and top views share
one scale: nose x=66 to tail shell x=2,770, 119.33 px/m over the cited 22.66 m.
The drawing's span is 5% short of the cited span at that scale (3,596 px), so
spanwise tail and wingtip figures use the span calibration (113.7 px/m) and
everything else the length calibration. Tables are stations in meters aft of
the nose and heights in meters in the DRAWING frame, which is the model frame
lowered DY = 0.60 m (see below). The first pass (same date) read the body 50%
too wide, placed the nose 2.50 m too far forward of the wing, and stood the
rear fuselage and fin about 0.9 m too high; every table here replaces it.

  wing quarter-chord at 30% semispan 6.40 m aft of the nose (top view: leading
    edge 5.22 m, trailing edge 9.94 m); that point is this model's origin.
    Check: the spec-fitted tailwheel x then falls at station 17.0 m, where the
    drawing draws it (16.9 m)                               DRAWING-MEASURED
  DY: the front view puts the wing root chord line 0.99 m above the keel; the
    model's wing meets the body side at y=-0.04, so drawing heights + 0.60 m
    are model heights. The outboard nacelle centerline agrees within 0.02 m
                                                            DRAWING-MEASURED
  side silhouette and top-view half-width: PROFILE below (+/-0.05 m); the
    turrets, chin turret, ball turret, astrodome and guns are excluded
                                                            DRAWING-MEASURED
  vertical tail: FIN_LE / FIN_TE below, traced from the outer outline; the
    dorsal fillet rises from the body top at station 11.18 m at 8 deg to
    station 16.0 m, then curves into the fin, crown 4.31 m at station 19.27 m;
    the rudder trailing edge is a straight line from (21.12, +0.49) to
    (20.54, +3.35); rudder hinge (19.56, +0.49) to (20.00, +3.90)
                                                            DRAWING-MEASURED
  tail-gunner housing top +0.49 m from station 19.56 to 21.30 m; tail guns
    leave the shell at -0.33 m                              DRAWING-MEASURED
  tailplane: root leading edge 16.65 m, root trailing edge 20.09 m on the
    centerline, tip chord 1.51 m at 5.72 m out, rounded tip to 6.27 m (span
    12.53 m), straight unswept elevator hinge at station 18.80 m, chord line
    -0.12 m                                                 DRAWING-MEASURED
  wingtip: the last 1.3 m rounds off (chord fraction of the straight taper:
    1.0 at 14.47 m out, 0.90 at 15.21, 0.72 at 15.51, 0.44 at 15.71, 0.08 at
    15.81 m); ailerons end where the rounding starts          DRAWING-MEASURED
  spinner tips 2.36 m (inboard) and 2.82 m (outboard) aft of the nose
                                                            DRAWING-MEASURED
  windscreen base 2.95 m; flat cockpit roof +1.14 m from 3.50 m; pilot eye
    [2.40, 1.44] in model coordinates (station 4.00 m, 0.33 m under the roof)
                                                            DRAWING-MEASURED
  turrets: chin 1.25 m, top 5.15 m, ball 11.10 m; cheek guns 1.80 m; waist
    windows 12.5 m (right) and 13.75 m (left); radio gun 9.80 m; antenna mast
    12.15 m                                                 DRAWING-MEASURED

Other figures:
  taper 0.36, leading-edge sweep 6 deg, dihedral 4.5 deg    ESTIMATE from
    the drawing; the root leading edge is offset so the 30%-semispan
    quarter-chord is the origin
  fin and fillet thickness (0.26 m, thinning over the crown), fuselage
    superellipse exponents, nacelle sections, cowl details, fairings and
    insignia positions                                          ESTIMATE
  main gear is one large wheel per side and retracts forward into the
    inboard nacelles; tailwheel retracts forward                     ESTIMATE motion
  turret sizes and arcs                                                ESTIMATE from
    the drawing and the cited nine-position armament layout; the
    top turret base is computed from the authored fuselage loft and sunk
    0.04 m into the lowest skin point under its footprint
  one bomb bay from x -2.55 to +0.75 m, 0.48 m either side of keel    ESTIMATE;
    covers the existing spec's eight internal rack points
  unpainted natural metal with 1943 star-and-bar markings              ESTIMATE

Public factory-drawing metadata check (read 2026-10-11): the official
AirCorps Library B-17 catalog advertises 53,855 searchable Boeing drawings.
Its public index identifies 8-1070 (cockpit/fairing contours), 14-3469
(inboard-wing contours), 9-3053 (wing-rib ordinates), 15-7625 (fin-fairing
lines), 15-7361 (rear-gun-enclosure lines), and 8-1265 (stabilizer-rib
contours). The numerical sheets require member sign-in, so NO dimensions
from them are claimed here; those drawing sets are recommended for a future
authorized loft refinement.                                           CITED metadata

FITTED to content/aircraft/b-17-flying-fortress.json without changing the
flight model: main wheel bottoms y=-2.548 m at x=0.852 m; tailwheel bottom
y=-1.097 m at x=-10.623 m; the proposed real-cockpit eye is [2.40,1.44,0].
The existing combat gun list is empty, while the visible historical gun
positions are modeled as Turret1..6 plus static waist/radio barrels.

Frame: glTF, +x forward, +y up, +z right, meters. Origin: drawing-measured
wing quarter-chord at 30% semispan. Pose: gear down, thrust line level.
Leaves out: cockpit interior, individual bomb racks, external racks, turbo
plumbing, de-icer texture, crew, ammunition belts, unit serial and nose art.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'b17b'
SPAN = 31.62
LENGTH = 22.66
WING_AREA = 131.92
BLADES = 3
PROP_DIAMETER = 3.54
ROOT_T, TIP_T = 0.18, 0.10

UPPER = 'naturalMetal'
NOSE_TO_ORIGIN = 6.40
DY = 0.60
TAPER = 0.36
SWEEP_DEG = 6.0
DIHEDRAL_DEG = 4.5
WING_Y = -0.12

# Drawing frame: station aft of nose, half-width, bottom, top, exponent; tail to nose.
PROFILE = [
    (22.66, 0.12, -0.60, -0.22, 2.0),
    (22.62, 0.22, -0.70, -0.14, 2.2),
    (22.50, 0.28, -0.76, -0.08, 2.4),
    (22.25, 0.32, -0.82, -0.03, 2.4),
    (21.85, 0.36, -0.86, 0.00, 2.5),
    (21.60, 0.38, -0.88, 0.25, 2.6),
    (21.30, 0.39, -0.90, 0.49, 2.6),
    (19.80, 0.44, -1.03, 0.47, 2.6),
    (19.50, 0.43, -1.06, 0.24, 2.4),
    (19.00, 0.42, -1.10, 0.22, 2.3),
    (18.00, 0.44, -1.19, 0.28, 2.2),
    (17.50, 0.49, -1.24, 0.32, 2.2),
    (17.00, 0.58, -1.29, 0.36, 2.2),
    (16.50, 0.70, -1.33, 0.39, 2.2),
    (16.00, 0.75, -1.36, 0.41, 2.2),
    (15.00, 0.82, -1.44, 0.46, 2.2),
    (14.00, 0.90, -1.51, 0.50, 2.2),
    (13.00, 0.98, -1.57, 0.54, 2.2),
    (12.00, 1.06, -1.62, 0.58, 2.2),
    (11.00, 1.11, -1.63, 0.63, 2.3),
    (10.50, 1.12, -1.64, 0.69, 2.3),
    (10.00, 1.12, -1.64, 0.79, 2.3),
    (9.50, 1.14, -1.64, 0.89, 2.3),
    (9.00, 1.14, -1.64, 0.97, 2.3),
    (8.50, 1.11, -1.64, 1.04, 2.3),
    (7.50, 1.09, -1.64, 1.12, 2.3),
    (6.00, 1.08, -1.64, 1.13, 2.3),
    (4.50, 1.10, -1.64, 1.14, 2.3),
    (4.00, 1.08, -1.62, 1.14, 2.3),
    (3.50, 1.04, -1.58, 1.12, 2.2),
    (3.25, 1.01, -1.55, 1.00, 2.2),
    (3.00, 0.99, -1.52, 0.80, 2.2),
    (2.50, 0.92, -1.47, 0.63, 2.2),
    (2.00, 0.85, -1.38, 0.55, 2.1),
    (1.50, 0.78, -1.24, 0.49, 2.1),
    (1.00, 0.67, -1.08, 0.37, 2.0),
    (0.75, 0.58, -0.98, 0.27, 2.0),
    (0.50, 0.47, -0.86, 0.16, 2.0),
    (0.25, 0.33, -0.72, 0.01, 2.0),
    (0.00, 0.05, -0.44, -0.28, 2.0),
]
# Cockpit glazing stations: it sits CANOPY_PROUD above the roof line it follows.
CANOPY_STATIONS = (2.95, 3.15, 3.40, 3.70, 4.10, 4.60)
CANOPY_FRAMES = (3.15, 3.40, 3.70, 4.10)
CANOPY_PROUD = 0.035
CANOPY_HALF_HEIGHT = 0.32
# Vertical tail outer outline, drawing frame: (height, station).
FIN_LE = [(0.15, 11.18), (0.62, 11.18), (1.30, 16.00), (1.37, 16.25), (1.47, 16.50), (1.60, 16.75),
          (1.75, 16.98), (1.95, 17.23), (2.15, 17.43), (2.35, 17.59), (2.55, 17.73), (2.75, 17.84),
          (2.95, 17.93), (3.15, 18.01), (3.35, 18.08), (3.55, 18.14), (3.75, 18.23), (3.85, 18.30),
          (3.95, 18.39), (4.05, 18.51), (4.15, 18.68), (4.25, 18.94), (4.29, 19.08)]
FIN_TE = [(0.15, 21.19), (0.49, 21.12), (3.35, 20.54), (3.65, 20.41), (3.85, 20.27), (3.95, 20.17),
          (4.05, 20.05), (4.15, 19.88), (4.25, 19.63), (4.29, 19.48)]
FIN_THICKNESS = [(0.15, 0.26), (3.50, 0.26), (3.85, 0.20), (4.05, 0.15), (4.25, 0.08), (4.29, 0.05)]
RUDDER_HINGE = ((0.49, 19.56), (3.90, 20.00))
RUDDER_SPAN = (0.52, 3.90)
# Tailplane: (spanwise z, leading station, trailing station, thickness m); chord line -0.12 m.
TAILPLANE = [(0.00, 16.65, 20.09, 0.41), (0.68, 16.81, 20.02, 0.38), (5.72, 17.98, 19.49, 0.15),
             (5.98, 18.07, 19.39, 0.13), (6.14, 18.25, 19.22, 0.10), (6.22, 18.44, 19.03, 0.06),
             (6.27, 18.61, 18.88, 0.025)]
TAILPLANE_Y = -0.12
ELEVATOR = (0.82, 5.70, 18.80)
# Wingtip rounding: (z, fraction of the straight-taper chord, forward shift of mid-chord as a
# fraction of that chord).
WINGTIP = [(14.47, 1.00, 0.0), (14.81, 0.99, 0.01), (15.01, 0.96, 0.02), (15.21, 0.90, 0.03),
           (15.36, 0.82, 0.05), (15.51, 0.72, 0.06), (15.61, 0.61, 0.07), (15.71, 0.44, 0.09),
           (15.76, 0.33, 0.10), (15.81, 0.08, 0.11)]
TOP_TURRET = dict(station=5.15, radius=0.50, height=0.52, embed=0.04, gun=0.26, barrel=0.92)
ENGINE_Z = (3.03, 6.53)
NACELLE_SHIFT = 0.61
NACELLE = [(x + NACELLE_SHIFT, r) for x, r in
           [(-1.65, 0.23), (-0.90, 0.62), (0.20, 0.78), (1.55, 0.80), (2.35, 0.72), (2.73, 0.56), (2.78, 0.40)]]
PROP_X = (2.88 + NACELLE_SHIFT, 2.42 + NACELLE_SHIFT)
GEAR = dict(x=0.480, z=3.03, hinge_y=-0.40, length=1.890, wheel_r=0.52, wheel_w=0.32)
TAILWHEEL = dict(x=-10.300, hinge_y=-0.45, length=0.810, wheel_r=0.18, wheel_w=0.14)
BAYS = [(-2.55, 0.75, 0.48)]

SEGMENTS = 96
SUBDIVIDE = 3
NACELLE_SEGMENTS = 48
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.05, 0.10, 0.15, 0.22, 0.30, 0.40, 0.55, 0.68, 0.78, 0.88}))
FLAP = (0.10, 0.56, 0.74)
AILERON = (0.61, WINGTIP[0][0] / (SPAN / 2), 0.74)


def X(station):
    return NOSE_TO_ORIGIN - station


def lerp(table, h):
    """Linear interpolation in a [(key, value)] table, keys increasing."""
    for (h0, v0), (h1, v1) in zip(table, table[1:]):
        if h <= h1:
            return v0 + (v1 - v0) * (h - h0) / (h1 - h0)
    return table[-1][1]


def fuselage_rows():
    rows = []
    for s, w, bottom, top, exponent in PROFILE:
        rows.append((X(s), w, (top - bottom) / 2, (top + bottom) / 2 + DY, exponent))
    return rows


FUSELAGE_ROWS = fuselage_rows()
NOSE_ROWS = FUSELAGE_ROWS[-4:]
BODY_ROWS = FUSELAGE_ROWS[:-3]
_FUSELAGE_FINE, _ = kit._refine_shape(FUSELAGE_ROWS, SUBDIVIDE)


def _fuselage_section(x):
    """Interpolated (half-width, half-height, center y, exponent) at x."""
    i = next(k for k in range(len(_FUSELAGE_FINE) - 1)
             if _FUSELAGE_FINE[k][0] <= x <= _FUSELAGE_FINE[k + 1][0])
    f = (x - _FUSELAGE_FINE[i][0]) / (_FUSELAGE_FINE[i + 1][0] - _FUSELAGE_FINE[i][0])
    return tuple(_FUSELAGE_FINE[i][c] +
                 (_FUSELAGE_FINE[i + 1][c] - _FUSELAGE_FINE[i][c]) * f
                 for c in (1, 2, 3, 4))


def fuselage_top_y(station, z):
    """Top of the authored fuselage loft at a nose station and lateral z."""
    half_width, half_height, center_y, exponent = _fuselage_section(X(station))
    lateral = min(abs(z) / half_width, 1.0)
    return center_y + half_height * (1.0 - lateral ** exponent) ** (1.0 / exponent)


def fuselage_half_width_at(station, y):
    """Half-width of the authored fuselage loft at a nose station and height y."""
    half_width, half_height, center_y, exponent = _fuselage_section(X(station))
    v = min(abs(y - center_y) / half_height, 1.0)
    return half_width * (1.0 - v ** exponent) ** (1.0 / exponent)


def dorsal_turret_base(station, radius, embed):
    """A horizontal turret base below every sampled skin point in its footprint."""
    skin = []
    for ix in range(-4, 5):
        dx = radius * ix / 4
        for iz in range(-4, 5):
            z = radius * iz / 4
            if dx * dx + z * z <= radius * radius:
                # X(station) + dx is the nose station ``station - dx``.
                skin.append(fuselage_top_y(station - dx, z))
    return min(skin) - embed


def canopy_rows():
    """Glazing hugging the roof: top CANOPY_PROUD above the skin, sides just outside it."""
    rows = []
    for s in reversed(CANOPY_STATIONS):
        top = fuselage_top_y(s, 0.0) + CANOPY_PROUD
        cy = top - CANOPY_HALF_HEIGHT
        rows.append((X(s), fuselage_half_width_at(s, cy) + 0.02, CANOPY_HALF_HEIGHT, cy))
    return rows


def fin_rows():
    heights = sorted({h for h, _ in FIN_LE} | {h for h, _ in FIN_TE} | {h for h, _ in FIN_THICKNESS})
    root = heights[0]
    return [(h - root, X(lerp(FIN_LE, h)), X(lerp(FIN_TE, h)), lerp(FIN_THICKNESS, h)) for h in heights]


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)
root_chord = 2 * WING_AREA / (SPAN * (1 + TAPER))
tip_chord = TAPER * root_chord
tan_sw = math.tan(math.radians(SWEEP_DEG))
tan_di = math.tan(math.radians(DIHEDRAL_DEG))
qc_z = 0.30 * SPAN / 2
qc_chord = root_chord + (tip_chord - root_chord) * qc_z / (SPAN / 2)
# kit.wing's measured 30%-semispan section puts its quarter-chord 0.441 m
# forward of the analytic station because its airfoil chord bounds include the
# authored control-surface split. The measured correction keeps that section
# on the drawing-derived body origin (2026-10-11).
root_le_x = qc_z * tan_sw + 0.25 * qc_chord - 0.441


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (SPAN / 2)


def wing_le(z):
    return root_le_x - abs(z) * tan_sw


def wing_y(z):
    return WING_Y + abs(z) * tan_di


def wing_thickness(z):
    return ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * abs(z) / (SPAN / 2)


with m.tagged('fuselage'), m.shared_chart():
    m.fuselage(UPPER, BODY_ROWS, segments=SEGMENTS, subdivide=SUBDIVIDE,
               doors=BAYS, refinement='shape')
with m.tagged('nose'), m.shared_chart():
    # The bombardier's greenhouse occupies the upper half of the B-17G nose;
    # the lower half stays metal and carries the chin turret.
    m.fuselage('glazing', NOSE_ROWS, segments=SEGMENTS, subdivide=SUBDIVIDE,
               lower_role=UPPER, refinement='shape')
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER, canopy_rows(), [X(s) for s in CANOPY_FRAMES], bar=0.025, segments=48, subdivide=3)
    # The navigator's astrodome on the nose roof.
    m.revolve('glazing', (X(2.05), fuselage_top_y(2.05, 0.0) - 0.05, 0.0), (0.0, 1.0, 0.0),
              [(0.0, 0.24), (0.10, 0.22), (0.18, 0.14), (0.22, 0.04)], 16)

controls = [(a * SPAN / 2, b * SPAN / 2, h, name)
            for (a, b, h), name in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
breaks = [0.0, *ENGINE_Z]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = chord_at(z0), chord_at(z1)
        t0, t1 = wing_thickness(z0), wing_thickness(z1)
        m.wing(UPPER, wing_le(z0), wing_y(z0), c0, c1, 2 * z1,
               sweep_deg=SWEEP_DEG, dihedral_deg=DIHEDRAL_DEG,
               thickness=t0 / c0, tip_thickness=t1 / c1, root_z=z0,
               stations=STATIONS, span_segments=1, controls=controls)
    # The outer panel ends in the drawing's rounded tip.
    tip_rows = []
    for z, k, shift in [(ENGINE_Z[1], 1.0, 0.0)] + WINGTIP:
        c = chord_at(z)
        mid = wing_le(z) - 0.5 * c + shift * c
        tip_rows.append((z, mid + 0.5 * k * c, mid - 0.5 * k * c, wing_y(z), k * wing_thickness(z)))
    m.wing_outline(UPPER, tip_rows, stations=STATIONS, span_segments=1, controls=controls)

with m.tagged('tailplane'), m.shared_chart():
    m.wing_outline(UPPER, [(z, X(le), X(te), TAILPLANE_Y + DY, t) for z, le, te, t in TAILPLANE],
                   stations=STATIONS, span_segments=1,
                   controls=[(ELEVATOR[0], ELEVATOR[1], ((ELEVATOR[0], X(ELEVATOR[2])), (ELEVATOR[1], X(ELEVATOR[2]))), 'Elevator')])
with m.tagged('fin'), m.shared_chart():
    root = FIN_LE[0][0]
    (h_a, s_a), (h_b, s_b) = RUDDER_HINGE
    m.fin_outline(UPPER, root + DY, fin_rows(), stations=STATIONS, span_segments=1,
                  controls=[(RUDDER_SPAN[0] - root, RUDDER_SPAN[1] - root,
                             ((h_a - root, X(s_a)), (h_b - root, X(s_b))), 'Rudder')])

# Four nacelles and their exactly three-fold propellers.
props = sorted(side * z for z in ENGINE_Z for side in (-1, 1))
for i, z in enumerate(props, start=1):
    outer = abs(z) > 5
    px = PROP_X[1 if outer else 0]
    ny = wing_y(z) - 0.30
    with m.tagged('nacelle'), m.shared_chart():
        rows = [(x, r, 1.08 * r, ny, 2.2) for x, r in NACELLE]
        m.fuselage(UPPER, rows, segments=NACELLE_SEGMENTS, subdivide=4, center_z=z)
        m.revolve('dark', (NACELLE[-1][0] - 0.02, ny, z), (1.0, 0.0, 0.0),
                  [(0.0, 0.37), (0.08, 0.34)], 32)
        for side in (-1, 1):
            for k in range(3):
                ey = ny - 0.20 + 0.15 * k
                ez = z + side * 0.63
                m.revolve('dark', (0.35 + NACELLE_SHIFT - 0.22 * k, ey, ez), (-1.0, -0.10, side * 0.16),
                          [(0.0, 0.045), (0.28, 0.035)], 10)
    with m.tagged('prop'), m.shared_chart():
        m.propeller('dark', (px, ny, z), PROP_DIAMETER, BLADES, 0.38, 0.42, 0.55,
                    node=f'Prop{i}', blade_sections=[(0.13, 0.9, 43.0), (0.35, 1.05, 33.0),
                                                     (0.60, 1.0, 25.0), (0.85, 0.78, 18.0),
                                                     (1.0, 0.45, 15.0)])

# Spec-fitted landing gear.
g = GEAR
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], g['hinge_y'], side * g['z']), g['length'], g['wheel_r'], g['wheel_w'], node=name)
        m.box('dark', (g['x'] - 0.25, g['hinge_y'] - 0.75, side * (g['z'] - 0.22)),
              (0.45, 1.30, 0.035), node=name)
    tw = TAILWHEEL
    m.gear_leg('dark', (tw['x'], tw['hinge_y'], 0.0), tw['length'], tw['wheel_r'], tw['wheel_w'], node='Tailwheel')

# B-17G defensive positions. Cheek and tail mounts are flexible guns; waist and
# radio guns are static detail because the established rig has six aimable groups.
with m.tagged('turret'), m.shared_chart():
    chin = 1.25
    m.gun_turret(UPPER, 1, (X(chin), fuselage_top_y(chin, 0.0) - 2 * _fuselage_section(X(chin))[1] + 0.05, 0.0),
                 0.42, 0.60, up=-1, barrels=2, barrel_length=0.92, facing=1, gun_role='dark')
    tt = TOP_TURRET
    turret4_y = dorsal_turret_base(tt['station'], tt['radius'], tt['embed'])
    turret4_x = X(tt['station'])
    m.revolve(UPPER, (turret4_x, turret4_y, 0.0), (0.0, 1.0, 0.0),
              [(0.0, tt['radius']), (0.12, 0.48), (0.34, 0.36), (tt['height'], 0.12)], 12, 'Turret4')
    gun_y = turret4_y + tt['gun']
    for barrel in (-0.5, 0.5):
        m.machine_gun('dark', (turret4_x, gun_y, barrel * 0.12),
                      (1.0, 0.0, 0.0), tt['barrel'], node='Turret4Guns')
    m._fixed_hinges['Turret4'] = {'point': [round(turret4_x, 6), round(turret4_y, 6), 0.0],
                                  'axis': [0.0, 1.0, 0.0]}
    m._fixed_hinges['Turret4Guns'] = {'point': [round(turret4_x, 6), round(gun_y, 6), 0.0],
                                      'axis': [0.0, 0.0, 1.0]}
    ball = 11.10
    m.gun_turret(UPPER, 5, (X(ball), fuselage_top_y(ball, 0.0) - 2 * _fuselage_section(X(ball))[1] + 0.05, 0.0),
                 0.48, 0.62, up=-1, barrels=2, barrel_length=0.92, facing=1, gun_role='dark')
    # Cheek trunnions sit 0.12 m outside the measured half-width, so the full
    # flex-cone sweep stays clear of the nose shell.
    cheek = 1.80
    cheek_y = -0.10 + DY
    cheek_z = fuselage_half_width_at(cheek, cheek_y) + 0.12
    m.flex_gun('dark', 2, (X(cheek), cheek_y, -cheek_z), (1.0, -0.08, -0.38), 0.92, scale=0.8, mount_r=0.08)
    m.flex_gun('dark', 3, (X(cheek), cheek_y, cheek_z), (1.0, -0.08, 0.38), 0.92, scale=0.8, mount_r=0.08)
    # The gun socket is the measured tail plane itself: 5 cm aft of the socket,
    # every allowed flex-cone ray is already outside the closed fuselage loft.
    m.flex_gun('dark', 6, (X(LENGTH), -0.33 + DY, 0.0), (-1.0, 0.05, 0.0), 1.00, scale=0.9, mount_r=0.08)

with m.tagged('fittings'), m.shared_chart():
    # Waist guns (staggered, as the drawing's windows), radio gun, pitot and antenna mast.
    waist_y = -0.22 + DY
    for side, s in ((-1, 13.75), (1, 12.50)):
        m.gun_barrel('dark', (X(s), waist_y, side * (fuselage_half_width_at(s, waist_y) - 0.05)), side * 65.0, 0.0, 0.78, 0.020)
    m.gun_barrel('dark', (X(9.80), fuselage_top_y(9.80, 0.0) - 0.05, 0.0), 42.0, 0.0, 0.72, 0.018)
    m.strut('dark', (X(12.15), fuselage_top_y(12.15, 0.0) - 0.05, 0.0), (X(12.25), 1.62 + DY, 0.0), 0.018, 0.008, sides=6)
    pz = -12.5
    m.strut('dark', (wing_le(pz) - 0.10, wing_y(pz), pz),
            (wing_le(pz) + 0.62, wing_y(pz), pz), 0.011, sides=6)


def star(r_out):
    r_in = 0.382 * r_out
    return [((r_out if k % 2 == 0 else r_in) * math.sin(k * math.pi / 5),
             (r_out if k % 2 == 0 else r_in) * math.cos(k * math.pi / 5)) for k in range(10)]


def rect(u0, u1, v0, v1):
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def roundel(tag, center, axis, udir, diameter):
    o = 0.125 * diameter
    common = dict(tags=[tag], origin=center, axis=axis, uDir=udir)
    m.marking('polygon', points=rect(-(diameter + o), diameter + o,
                                     -(0.165 * diameter + o), 0.165 * diameter + o),
              color='usaaInsigniaBlue', **common)
    for sign in (-1, 1):
        u0, u1 = sorted((sign * 0.35 * diameter, sign * diameter))
        m.marking('polygon', points=rect(u0, u1, -0.165 * diameter, 0.165 * diameter),
                  color='usaaInsigniaWhite', **common)
    m.marking('disc', tags=[tag], center=center, axis=axis, radiusM=0.5 * diameter,
              color='usaaInsigniaBlue')
    m.marking('polygon', points=star(0.40 * diameter), color='usaaInsigniaWhite', **common)


for side in (-1, 1):
    z = side * 10.8
    x = wing_le(z) - 0.42 * chord_at(z)
    roundel('wing', (x, wing_y(z), z), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), 1.8)
    roundel('wing', (x, wing_y(z), z), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0), 1.8)
    star_station, star_y = 15.0, -0.45 + DY
    roundel('fuselage', (X(star_station), star_y, side * (fuselage_half_width_at(star_station, star_y) + 0.01)),
            (0.0, 0.0, float(side)), (1.0, 0.0, 0.0) if side > 0 else (-1.0, 0.0, 0.0), 1.20)

m.export(out)
