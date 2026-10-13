"""Consolidated PBY-5A Catalina. Original work, AGPL-3.0-or-later.

Public-domain primary drawings: U.S. Navy AN 01-5MA-2 (15 May 1945),
Figure 1 and Section I pp. 1-4, read 2026-10-12:
  span 104 ft / 31.699 m; overall length 63 ft 10 7/16 in / 19.468 m    CITED
  wing root chord 15 ft, tip chord 10 ft; outer dihedral 2 deg 20 min,
  sweepback 2 deg 58 min; NACA 21 section                              CITED
  stabilizer span 30 ft 6 in / 9.296 m, max chord 8 ft 7 in / 2.616 m  CITED
  hull maximum width 10 ft 2.5 in / 3.111 m, height 8 ft 4 in / 2.540 m CITED
  main-gear tread 16 ft 9 in / 5.105 m; float tread 89 ft 4 in /
  27.229 m; float length 10 ft 3/8 in / 3.057 m                         CITED
  two R-1830-92 engines; three-blade, 12 ft / 3.658 m propellers        CITED

Catalina Preservation Society specifications, read 2026-10-12:
  main-gear tire 47 in contour; nose-gear tire 30 in contour            CITED

The side-mounted main-gear linkage and its inward/upward folding sequence are
VISUALLY REFERENCED from the PBY-5A hydraulic-gear animation at Aviation
Rapture, supplied by Mark on 2026-10-12. The geometry here is original and
simplifies the real multi-link motion to the renderer's single rigid hinge.

AN 01-5MA-2 Section V pp. 635-665: bow .30-cal installation, two waist
.50-cal positions, tunnel .30-cal position, two fore/aft Mark 51-7 bomb
racks under each wing, and two Mark 13-1/13-2 torpedoes as an alternate
load. The racks sit outboard of the wing-strut attachments.             CITED

The station placement below is MEASURED from the manual's Figure 1 and hull
station diagrams, then simplified into smooth kit lofts. Chine depth, canopy
sections, nacelle sections, struts, gear-leg geometry, control-surface hinge
fractions, gun proportions, markings, and VPB-33-inspired 1944 finish are
ESTIMATES. No copyrighted external mesh, texture, or drawing is bundled.

Frame: glTF +x forward, +y up, +z starboard, metres; origin at wing-root
quarter chord. Pose: wheel gear and wingtip floats deployed.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

SPAN = 31.699
LENGTH = 19.468
ROOT_CHORD = 4.572
TIP_CHORD = 3.048
SWEEP_DEG = 2.9667
DIHEDRAL_DEG = 2.3333
PROP_DIAMETER = 3.658
GROUND_Y = -2.40
MAIN_WHEEL_RADIUS = 47 * 0.0254 / 2
NOSE_WHEEL_RADIUS = 30 * 0.0254 / 2
FLOAT_HALF_TREAD = 27.229 / 2
FLOAT_LENGTH = 3.057
TAIL_SPAN = 9.296
TAIL_ROOT = 2.616
STRUT_HALF_SPAN = 6.20
STORE_HALF_SPAN = 6.75
FRONT_RACK_CHORD = 0.30
REAR_RACK_CHORD = 0.62
UPPER = 'seaBlue'
LOWER = 'underside'
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.10, 0.22, 0.38, 0.55, 0.72, 0.86}))

# (x, half width, half height, centre y, superellipse exponent), MEASURED/ESTIMATE.
HULL = [
    (-11.468, 0.06, 0.10, 0.42, 2.0),
    (-10.3, 0.38, 0.48, 0.20, 2.1),
    (-8.0, 0.72, 0.82, -0.05, 2.2),
    (-5.2, 1.12, 1.18, -0.24, 2.35),
    (-2.0, 1.48, 1.27, -0.30, 2.5),
    (1.0, 1.555, 1.27, -0.31, 2.5),
    (3.8, 1.45, 1.20, -0.30, 2.35),
    (5.8, 1.12, 1.04, -0.32, 2.1),
    (7.2, 0.62, 0.75, -0.42, 1.9),
    (7.90, 0.10, 0.18, -0.55, 1.8),
]

out, _opts = kit.cli_args()
m = kit.Model('pby5a', skin=1024)


def chord_at(z):
    return ROOT_CHORD + (TIP_CHORD - ROOT_CHORD) * abs(z) / (SPAN / 2)


def wing_le(z):
    return 0.25 * ROOT_CHORD - abs(z) * math.tan(math.radians(SWEEP_DEG))


def wing_y(z):
    return 2.35 + abs(z) * math.tan(math.radians(DIHEDRAL_DEG))


with m.tagged('fuselage'):
    m.fuselage(UPPER, HULL, segments=96, subdivide=6, lower_role=LOWER)
    # A narrow, deeper keel loft makes the flying-boat step and V-bottom readable.
    m.fuselage(LOWER, [
        (-9.5, 0.05, 0.08, -0.55), (-7.0, 0.42, 0.42, -1.00),
        (-3.0, 0.72, 0.58, -1.45), (0.4, 0.78, 0.62, -1.58),
        (2.3, 0.68, 0.50, -1.42), (5.6, 0.18, 0.20, -1.00),
    ], segments=64, subdivide=4)
    # The sharp afterbody step, deliberately proud of both lofts.
    m.box(LOWER, (-1.9, -1.78, 0), (0.30, 0.18, 1.50))

with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER, [
        (2.28, 0.52, 0.12, 0.90), (2.70, 0.88, 0.42, 1.05),
        (3.72, 0.92, 0.48, 1.02), (4.25, 0.72, 0.16, 0.78),
    ], [2.48, 2.85, 3.30, 3.68, 4.02], bar=0.035, segments=48, subdivide=4)

# High parasol wing, broken at the nacelles so panel seams survive the skin bake.
nac_z = 4.80
controls = [(0.62 * SPAN / 2, 0.96 * SPAN / 2, 0.74, 'Aileron')]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in ((0.0, nac_z), (nac_z, SPAN / 2)):
        m.wing(UPPER, wing_le(z0), wing_y(z0), chord_at(z0), chord_at(z1), 2 * z1,
               root_z=z0, sweep_deg=SWEEP_DEG, dihedral_deg=DIHEDRAL_DEG,
               thickness=0.16 if z0 == 0 else 0.14, tip_thickness=0.10,
               lower_role=LOWER, stations=STATIONS, controls=controls)

# Four parasol struts from the hull shoulders to the wing. Photographs and the
# manual's rack instructions put their upper attachments inboard of the stores.
with m.tagged('struts'), m.shared_chart():
    for side in (-1, 1):
        for x0, x1 in ((-1.5, -0.7), (2.0, 1.2)):
            m.strut(UPPER, (x0, 0.65, side * 1.18),
                    (x1, wing_y(STRUT_HALF_SPAN) - 0.08, side * STRUT_HALF_SPAN),
                    0.055, 0.035, sides=8)

# Tailplane and single tall fin.
with m.tagged('tailplane'), m.shared_chart():
    m.wing(UPPER, -8.65, 0.78, TAIL_ROOT, 1.18, TAIL_SPAN,
           sweep_deg=8.0, thickness=0.11, lower_role=LOWER, stations=STATIONS,
           controls=[(0.05 * TAIL_SPAN / 2, 0.96 * TAIL_SPAN / 2, 0.68, 'Elevator')])
with m.tagged('fin'), m.shared_chart():
    # Root chord is an estimate constrained so the rudder ends at the manual's overall-length datum.
    m.fin(UPPER, -9.05, 0.55, 2.50, 1.02, 3.55, sweep_deg=20,
          thickness=0.11, stations=STATIONS,
          controls=[(0.08 * 3.55, 0.96 * 3.55, 0.66, 'Rudder')])

# Engines, cowl bands, and propellers.
for i, z in enumerate((-nac_z, nac_z), start=1):
    with m.tagged('nacelle'), m.shared_chart():
        m.fuselage(UPPER, [
            (-1.25, 0.20, 0.22, 2.28), (-0.55, 0.58, 0.62, 2.31),
            (0.72, 0.80, 0.82, 2.40), (1.82, 0.78, 0.78, 2.42),
            (2.10, 0.12, 0.12, 2.42),
        ], segments=64, subdivide=4, center_z=z, lower_role=LOWER)
        m.fuselage('dark', [(1.73, 0.80, 0.80, 2.42), (1.88, 0.80, 0.80, 2.42)], segments=64, center_z=z)
    with m.tagged('prop'), m.shared_chart():
        m.propeller('dark', (2.17, 2.42, z), PROP_DIAMETER, 3, 0.42, 0.28, 0.38,
                    node=f'Prop{i}', blade_sections=[(0.13, 0.9, 42), (0.38, 1.05, 32), (0.70, 0.85, 23), (1.0, 0.42, 16)])

# Retractable PBY-5A tricycle gear. The cited tires sit close beside the keel,
# as in the three-view and period photographs, rather than at the ends of long
# conventional oleos. Each side is a compact triangular yoke: two hull-side
# pivots converge on a shoulder, a short carrier reaches the axle, and crossed
# radius/actuator braces make the unusual mechanism readable. The real links
# change their relative angles through travel; the game's whole assembly turns
# inward about the upper hull pivot as one rigid visual approximation.
ground_y = GROUND_Y
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        hull_z = side * 1.48
        front_pivot = (-1.92, -0.42, hull_z)
        rear_pivot = (-0.78, -0.42, hull_z)
        shoulder = (-1.35, -0.86, side * 2.06)
        carrier = (-1.35, -1.35, side * 2.39)
        axle = (-1.35, ground_y + MAIN_WHEEL_RADIUS, side * 2.5525)
        # A shallow recess/backing plate roots the mechanism in the hull side.
        m.box('dark', (-1.35, -0.64, side * 1.49), (1.42, 0.38, 0.10))
        # Upper fork, short oleo/wheel carrier, and the crossed radius/actuator links.
        m.strut('dark', front_pivot, shoulder, 0.075, 0.055, sides=8, node=name)
        m.strut('dark', rear_pivot, shoulder, 0.075, 0.055, sides=8, node=name)
        m.strut('dark', shoulder, carrier, 0.090, 0.068, sides=10, node=name)
        m.strut('dark', carrier, axle, 0.105, 0.075, sides=10, node=name)
        m.strut('dark', (-2.02, -0.72, hull_z), carrier,
                0.050, 0.036, sides=8, node=name)
        m.strut('dark', (-0.68, -0.72, hull_z), (-1.35, -1.12, side * 2.27),
                0.045, 0.032, sides=8, node=name)
        tire_width = 0.34
        m.revolve('dark', (axle[0], axle[1], axle[2] - tire_width / 2), (0, 0, 1),
                  [(0.0, MAIN_WHEEL_RADIUS), (tire_width, MAIN_WHEEL_RADIUS)], 20, node=name)
        m.revolve('dark', (axle[0], axle[1], axle[2] - 0.19), (0, 0, 1),
                  [(0.0, 0.16), (0.38, 0.16)], 16, node=name)
    nose = (5.15, -0.92, 0.0)
    m.gear_leg('dark', nose, nose[1] - ground_y, NOSE_WHEEL_RADIUS, 0.22, node='GearNose')
    m.strut('dark', nose, (4.55, ground_y + NOSE_WHEEL_RADIUS + 0.18, 0),
            0.045, sides=8, node='GearNose')

# Retractable stabilizing floats. Each complete assembly turns inboard about a fore-aft hinge.
for side, node in ((-1, 'FloatL'), (1, 'FloatR')):
    z = side * FLOAT_HALF_TREAD
    fy = -0.20
    with m.tagged('floats'), m.shared_chart():
        m.fuselage(UPPER, [
            (-1.48, 0.06, 0.08, fy), (-1.10, 0.22, 0.26, fy),
            (0.72, 0.26, 0.30, fy), (1.45, 0.05, 0.08, fy),
        ], segments=32, subdivide=3, center_z=z, node=node)
        m.strut(UPPER, (-0.55, wing_y(z), z), (-0.60, fy + 0.18, z), 0.045, sides=8, node=node)
        m.strut(UPPER, (0.75, wing_y(z), z), (0.62, fy + 0.18, z), 0.045, sides=8, node=node)

# Static gun installations. They show the sourced bow, waist and tunnel armament, but this first
# release deliberately does not create live TurretN parts or combat.gunners. The user can inspect
# them in the Hangar without the defensive-gunner simulation claiming they fire.
def static_gun(socket, direction, length, scale, mount_r):
    d = tuple(c / math.sqrt(sum(v * v for v in direction)) for c in direction)
    sx, sy, sz = socket
    m.revolve('dark', (sx - mount_r * d[0], sy - mount_r * d[1], sz - mount_r * d[2]), d,
              [(0.0, 0.35 * mount_r), (0.4 * mount_r, 0.9 * mount_r),
               (mount_r, mount_r), (1.6 * mount_r, 0.9 * mount_r),
               (2.0 * mount_r, 0.35 * mount_r)], 12)
    m.machine_gun('dark', (sx - 0.2 * length * d[0], sy - 0.2 * length * d[1], sz - 0.2 * length * d[2]),
                  d, length, scale)


with m.tagged('armament'), m.shared_chart():
    # The bow barrel ends inside the cited overall length; the manual photographs show it stowed
    # close to the socket on the ground.
    static_gun((7.40, -0.50, 0), (1, 0, 0), 0.48, 0.8, 0.10)
    static_gun((-4.0, 0.12, -1.46), (0, 0, -1), 0.82, 0.9, 0.12)
    static_gun((-4.0, 0.12, 1.46), (0, 0, 1), 0.82, 0.9, 0.12)
    static_gun((-5.45, -0.92, 0), (-0.65, -0.76, 0), 0.70, 0.75, 0.10)
    # Waist blister glazing around the two .50-cal mounts.
    for side in (-1, 1):
        m.fuselage('glazing', [(-4.75, 0.18, 0.22, 0.12), (-4.0, 0.42, 0.50, 0.12), (-3.25, 0.18, 0.22, 0.12)],
                   segments=32, subdivide=3, center_z=side * 1.40)

# Four Mark 51-7 bomb-rack fairings: a front/rear pair at one station under each
# wing. AN 01-5MA-2 pp. 643-650 places them slightly outboard of the strut
# attachments; the exact chord fractions are measured estimates from Figure 291.
with m.tagged('racks'), m.shared_chart():
    for side in (-1, 1):
        z = side * STORE_HALF_SPAN
        lead = wing_le(z)
        chord = chord_at(z)
        for fraction in (FRONT_RACK_CHORD, REAR_RACK_CHORD):
            m.box('dark', (lead - fraction * chord, wing_y(z) - 0.34, z),
                  (0.72, 0.12, 0.16))


def star(r):
    inner = 0.382 * r
    return [((r if k % 2 == 0 else inner) * math.sin(k * math.pi / 5),
             (r if k % 2 == 0 else inner) * math.cos(k * math.pi / 5)) for k in range(10)]


def rect(u0, u1, v0, v1):
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def roundel(tag, center, axis, u_dir, d):
    common = dict(tags=[tag], origin=center, axis=axis, uDir=u_dir)
    m.marking('polygon', points=rect(-0.62 * d, 0.62 * d, -0.14 * d, 0.14 * d), color='usaaInsigniaWhite', **common)
    m.marking('disc', tags=[tag], center=center, axis=axis, radiusM=0.34 * d, color='usaaInsigniaBlue')
    m.marking('polygon', points=star(0.27 * d), color='usaaInsigniaWhite', **common)


# 1944 national markings, placement estimated from PBY photographs (not a specific bureau number).
for side in (-1, 1):
    z = side * 10.2
    x = wing_le(z) - 0.46 * chord_at(z)
    roundel('wing', (x, wing_y(z), z), (0, 1, 0), (0, 0, 1), 2.25)
    roundel('wing', (x, wing_y(z), z), (0, -1, 0), (0, 0, -1), 2.25)
    roundel('fuselage', (-5.9, -0.05, side * 1.00), (0, 0, float(side)), (1, 0, 0) if side > 0 else (-1, 0, 0), 1.75)

# Antenna mast and bow mooring eye: small silhouette cues.
with m.tagged('fittings'), m.shared_chart():
    m.strut('dark', (2.35, 1.15, 0), (2.05, 2.10, 0), 0.025, 0.012, sides=8)
    m.cylinder('dark', (7.58, -0.78, 0), 0.07, 0.18, segments=16)

m.export(out)
