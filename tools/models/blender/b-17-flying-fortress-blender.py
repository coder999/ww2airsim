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

Real-airplane measurement (read 2026-10-11): Wikimedia Commons
"Boeing B-17G Flying Fortress 3-view line drawing.svg", Kaboldy, CC BY-SA
3.0, fetched through Special:FilePath at width 1600. The English article's
prop=images list was checked first; it exposes the raster three-view rather
than this corrected SVG, so Commons search located the SVG counterpart.
Each table is in meters aft of the nose tip; vertical values are meters above
the model's wing-quarter-chord horizontal datum. Pixel scale for the side view is 45.5 px/m from
the 1,032 px nose-to-tail length over the cited 22.66 m. The drawing has no
fuselage cross-sections, so half-widths are read from its top view and remain
ESTIMATE between the shown outlines.

  side silhouette, station: top / bottom (DRAWING-MEASURED, +/-0.08 m):
    0.00: +0.12/-0.10; 1.10: +0.78/-0.82; 2.10: +1.05/-1.05;
    3.20: +1.20/-1.31; 4.40: +1.28/-1.49; 6.00: +1.30/-1.66;
    8.00: +1.27/-1.69; 10.00: +1.22/-1.67; 12.00: +1.13/-1.61;
    14.00: +1.18/-1.46; 16.00: +1.11/-1.30; 18.00: +0.99/-1.10;
    20.00: +0.85/-0.76; 21.50: +0.72/+0.05; 22.66: +0.66/+0.56
  top silhouette, station: half-width (DRAWING-MEASURED, +/-0.08 m):
    0.00: 0.10; 1.10: 0.78; 2.10: 1.12; 3.20: 1.33;
    4.40: 1.46; 6.00: 1.52; 8.00: 1.55; 10.00: 1.52;
    12.00: 1.46; 14.00: 1.34; 16.00: 1.18; 18.00: 0.96;
    20.00: 0.68; 21.50: 0.38; 22.66: 0.08
  windscreen front 3.18 m; canopy crown 4.35 m at +2.02 m;
    canopy rear 5.95 m                                     DRAWING-MEASURED
  fin/dorsal-fillet root 12.2-22.66 m, top leading/trailing stations
    17.7/19.7 m, height 5.20 m; tailplane leading edge
    17.4 m at the root and span 13.7 m                     DRAWING-MEASURED
  wing quarter-chord at 30% semispan 8.90 m aft of the nose;
    that point is this model's origin                       DRAWING-MEASURED
  pilot eye [4.65, 1.66] in model coordinates (station 4.25 m,
    0.36 m below the canopy crown)                          DRAWING-MEASURED

Other figures:
  taper 0.36, leading-edge sweep 6 deg, dihedral 4.5 deg    ESTIMATE from
    the drawing; the root leading edge is offset so the 30%-semispan
    quarter-chord is the origin
  fuselage superellipse exponents, nacelle sections, cowl details,
    control-surface hinges, fairings and insignia positions         ESTIMATE
  main gear is one large wheel per side and retracts forward into the
    inboard nacelles; tailwheel retracts forward                     ESTIMATE motion
  turret stations and arcs                                            ESTIMATE from
    the drawing and the cited nine-position armament layout
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
y=-1.097 m at x=-10.623 m; the proposed real-cockpit eye is [4.65,1.66,0].
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
NOSE_TO_ORIGIN = 8.90
TAPER = 0.36
SWEEP_DEG = 6.0
DIHEDRAL_DEG = 4.5
WING_Y = -0.12

# station aft of nose, half-width, bottom, top, exponent; tail to nose.
PROFILE = [
    (22.66, 0.08, 0.56, 0.66, 2.0),
    (21.50, 0.38, 0.05, 0.72, 2.0),
    (20.00, 0.68, -0.76, 0.85, 2.0),
    (18.00, 0.96, -1.10, 0.99, 2.1),
    (16.00, 1.18, -1.30, 1.11, 2.2),
    (14.00, 1.34, -1.46, 1.18, 2.3),
    (12.00, 1.46, -1.61, 1.13, 2.4),
    (10.00, 1.52, -1.67, 1.22, 2.4),
    (8.00, 1.55, -1.69, 1.27, 2.5),
    (6.00, 1.52, -1.66, 1.30, 2.5),
    (4.40, 1.46, -1.49, 1.28, 2.4),
    (3.20, 1.33, -1.31, 1.20, 2.3),
    (2.10, 1.12, -1.05, 1.05, 2.1),
    (1.10, 0.78, -0.82, 0.78, 2.0),
    (0.00, 0.10, -0.10, 0.12, 2.0),
]
CANOPY = [
    (5.95, 0.18, 0.12, 1.35),
    (5.45, 0.62, 0.34, 1.55),
    (4.85, 0.74, 0.43, 1.59),
    (4.35, 0.76, 0.45, 1.57),
    (3.75, 0.71, 0.38, 1.52),
    (3.18, 0.12, 0.08, 1.31),
]
CANOPY_FRAMES = (5.55, 5.05, 4.55, 4.05, 3.55)
TAILPLANE = dict(span=13.70, leading_station=17.40, root=4.40, taper=0.42, y=0.62, sweep=10.0)
FIN = dict(root=10.46, taper=2.00 / 10.46, height=5.20, y=0.62, sweep=46.6)
ENGINE_Z = (3.03, 6.53)
NACELLE = [(-1.65, 0.23), (-0.90, 0.62), (0.20, 0.78), (1.55, 0.80), (2.35, 0.72), (2.73, 0.56), (2.78, 0.40)]
PROP_X = (2.88, 2.42)
GEAR = dict(x=0.852, z=3.03, hinge_y=-0.42, length=2.128, wheel_r=0.55, wheel_w=0.32)
TAILWHEEL = dict(x=-10.623, hinge_y=-0.45, length=0.647, wheel_r=0.18, wheel_w=0.14)
BAYS = [(-2.55, 0.75, 0.48)]

SEGMENTS = 96
SUBDIVIDE = 5
NACELLE_SEGMENTS = 48
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.05, 0.10, 0.15, 0.22, 0.30, 0.40, 0.55, 0.68, 0.78, 0.88}))
FLAP = (0.10, 0.56, 0.74)
AILERON = (0.61, 0.96, 0.74)
ELEVATOR = (0.08, 0.96, 0.70)
RUDDER = (0.06, 0.94, 0.68)


def X(station):
    return NOSE_TO_ORIGIN - station


def fuselage_rows():
    rows = []
    for s, w, bottom, top, exponent in PROFILE:
        rows.append((X(s), w, (top - bottom) / 2, (top + bottom) / 2, exponent))
    return rows


FUSELAGE_ROWS = fuselage_rows()
NOSE_ROWS = FUSELAGE_ROWS[-3:]
BODY_ROWS = FUSELAGE_ROWS[:-2]


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
    m.fuselage(UPPER, BODY_ROWS, segments=SEGMENTS, subdivide=SUBDIVIDE, doors=BAYS)
with m.tagged('nose'), m.shared_chart():
    # The bombardier's greenhouse occupies the upper half of the B-17G nose;
    # the lower half stays metal and carries the chin turret.
    m.fuselage('glazing', NOSE_ROWS, segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=UPPER)
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER,
             [(X(s), w, h, cy) for s, w, h, cy in CANOPY],
             [X(s) for s in CANOPY_FRAMES], bar=0.025, segments=48, subdivide=3)

controls = [(a * SPAN / 2, b * SPAN / 2, h, name)
            for (a, b, h), name in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
breaks = [0.0, *ENGINE_Z, SPAN / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = chord_at(z0), chord_at(z1)
        t0, t1 = wing_thickness(z0), wing_thickness(z1)
        m.wing(UPPER, wing_le(z0), wing_y(z0), c0, c1, 2 * z1,
               sweep_deg=SWEEP_DEG, dihedral_deg=DIHEDRAL_DEG,
               thickness=t0 / c0, tip_thickness=t1 / c1, root_z=z0,
               stations=STATIONS, span_segments=1, controls=controls)

tp = TAILPLANE
tp_half = tp['span'] / 2
with m.tagged('tailplane'), m.shared_chart():
    m.wing(UPPER, X(tp['leading_station']), tp['y'], tp['root'], tp['taper'] * tp['root'], tp['span'],
           sweep_deg=tp['sweep'], thickness=0.11, stations=STATIONS, span_segments=1,
           controls=[(ELEVATOR[0] * tp_half, ELEVATOR[1] * tp_half, ELEVATOR[2], 'Elevator')])
fin_root, fin_h = FIN['root'], FIN['height']
fin_tip = FIN['taper'] * fin_root
with m.tagged('fin'), m.shared_chart():
    m.fin(UPPER, X(LENGTH) + fin_root, FIN['y'], fin_root, fin_tip, fin_h,
          sweep_deg=FIN['sweep'],
          stations=STATIONS, span_segments=1,
          controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2], 'Rudder')])

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
                m.revolve('dark', (0.35 - 0.22 * k, ey, ez), (-1.0, -0.10, side * 0.16),
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
    m.gun_turret(UPPER, 1, (X(1.75), -0.76, 0.0), 0.48, 0.42, up=-1,
                 barrels=2, barrel_length=0.92, facing=1, gun_role='dark')
    m.gun_turret(UPPER, 4, (X(5.65), 1.90, 0.0), 0.50, 0.48, up=1,
                 barrels=2, barrel_length=0.92, facing=1, gun_role='dark')
    m.gun_turret(UPPER, 5, (X(10.15), -1.72, 0.0), 0.52, 0.50, up=-1,
                 barrels=2, barrel_length=0.92, facing=1, gun_role='dark')
    # Cheek trunnions sit outside the measured 1.2 m half-width here. This
    # keeps the full +/-30 degree flex-cone sweep clear of the nose shell.
    m.flex_gun('dark', 2, (X(2.75), 0.15, -1.34), (1.0, -0.08, -0.38), 0.92, scale=0.8, mount_r=0.08)
    m.flex_gun('dark', 3, (X(2.75), 0.15, 1.34), (1.0, -0.08, 0.38), 0.92, scale=0.8, mount_r=0.08)
    # The gun socket is the measured tail plane itself: 5 cm aft of the socket,
    # every allowed flex-cone ray is already outside the closed fuselage loft.
    m.flex_gun('dark', 6, (X(22.66), 0.61, 0.0), (-1.0, 0.05, 0.0), 1.00, scale=0.9, mount_r=0.08)

with m.tagged('fittings'), m.shared_chart():
    # Waist guns, radio gun, pitot and dorsal antenna.
    for side in (-1, 1):
        m.gun_barrel('dark', (X(12.7), 0.0, side * 1.40), side * 65.0, 0.0, 0.78, 0.020)
    m.gun_barrel('dark', (X(11.6), 1.18, 0.0), 42.0, 0.0, 0.72, 0.018)
    m.strut('dark', (X(7.2), 1.15, 0.0), (X(7.45), 2.12, 0.0), 0.018, 0.008, sides=6)
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
    roundel('fuselage', (X(15.0), -0.05, side * 1.30), (0.0, 0.0, float(side)),
            (1.0, 0.0, 0.0) if side > 0 else (-1.0, 0.0, 0.0), 1.45)

m.export(out)
