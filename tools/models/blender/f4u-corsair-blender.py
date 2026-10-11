# tools/models/blender/f4u-corsair-blender.py
"""Vought F4U-1D Corsair. Original work, AGPL-3.0-or-later.

A second Corsair beside the Sketchfab download (content/aircraft/f4u-corsair.glb stays), built on the
Hellcat duplicate's single-engine template (f6f-hellcat-blender.py) with the inverted gull wing the type is known
for; compare the two in the Hangar and swap this one in when approved (docs/blender-aircraft.md, "Promoting a
duplicate"). Stations are fractions of the cited length or span, except the ones fitted to
content/aircraft/f4u-corsair.json (the stance) so that a swap needs no flight-model change; those say so.

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
                                                        ESTIMATE
  taper 0.50, an unswept quarter chord; inner panel 6.5 deg anhedral, outer panel 5.4 deg dihedral, the
  knee at 2.1 m                                         ESTIMATE, period three-view proportions
  fuselage sections, the long nose, the raised canopy, tail surfaces
                                                        ESTIMATE (the station table below)
  canopy front/rear, side crown line and top-view rail half-widths
                                                        MEASURED, Wikimedia Commons
                                                        "Vought F4U-1 Corsair 3-view.svg",
                                                        read 2026-10-11; this is the adjacent
                                                        F4U-1 drawing, not an F4U-1D factory sheet
  canopy rail/shoulder/roof cross-sections              ESTIMATE, checked against Commons photographs
                                                        "NASM - Vought F4U-1D Corsair - side.jpg" and
                                                        "NASM - Vought F4U-1D Corsair - front.jpg",
                                                        read 2026-10-11; the rail is fitted 0.01-0.02 m
                                                        inside the measured fuselage skin
  Chance Vought drawing 40204, "Lines & Ordinates - Fuselage - Cockpit Cabin - Windshield & Sliding Section"
                                                        INDEXED, AirCorps Library, read 2026-10-11;
                                                        sheets require membership and supplied no numbers
  main wheels 0.82 m diameter                           ESTIMATE
  stance: wheels 2.418 m below the origin at x 0.418, tailwheel at x -5.722, 1.306 m below
                                                        FITTED to f4u-corsair.json gear.heightM / mainX /
                                                        thirdX / thirdHeightM, so a swap leaves the sim alone
  glossy sea blue overall (the US Navy's 1944-45 scheme; palette role seaBlue)
                                                        ESTIMATE (no chip read)
  1943 star-and-bar insignia (blue outline): both fuselage sides, upper left and lower right wing
                                                        ESTIMATE positions and sizes (the Navy's wing rule)
  control surfaces, exhausts, pitot, antenna mast, leg covers
                                                        ESTIMATE, period three-view proportions
  additions sink at least 0.02 m into what they sit on  modeling choice: no coplanar faces (DP0)
Frame: glTF, +x forward, +y up, +z right, meters. Origin: the wing root's quarter chord on the thrust line,
standing in for the CG (ESTIMATE). Pose: gear down, thrust line level.
Leaves out: the cockpit interior, the wing fold, the arrester hook, rocket rails and stores (the spec's
stores are measured on the wing by `npm run models:mounts`), unit markings.
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
# --- ESTIMATE
ROOT_T, TIP_T = 0.18, 0.09
TAPER = 0.50
KNEE_Z = 2.1                  # m, where the gull wing bends
ROOT_Y = -0.62                # m, wing root chord line below the thrust line
ANHEDRAL_DEG = 6.5            # inner panel, root to knee (the panel goes down)
DIHEDRAL_DEG = 5.4            # outer panel, knee to tip
UPPER = 'seaBlue'
NOSE_X = 0.2797                # spinner tip ahead of the origin, of LENGTH
# Read off the real airplane's three-view (English Wikipedia, Commons 'Grumman F6F Hellcat 3-view line drawing', 'Vought F4U-1 Corsair 3-view',
# 'Grumman F4F Wildcat 3-view line drawing', measured 2026-10-11): (d aft of the spinner tip, half-width, half-height, center y), all of LENGTH.
FUSELAGE = [
    (1.0000, 0.0039, 0.0015, 0.0424, 2.2),
    (0.9649, 0.0078, 0.0038, 0.0477, 2.2),
    (0.8772, 0.0166, 0.0180, 0.0453, 2.2),
    (0.7797, 0.0273, 0.0368, 0.0431, 2.2),
    (0.6823, 0.0370, 0.0546, 0.0400, 2.2),
    (0.5848, 0.0448, 0.0724, 0.0367, 2.2),
    (0.5458, 0.0472, 0.0795, 0.0355, 2.2),
    (0.4678, 0.0519, 0.0828, 0.0225, 2.2),
    (0.3899, 0.0565, 0.0802, 0.0101, 2.2),
    (0.3119, 0.0596, 0.0766, 0.0065, 2.2),
    (0.2437, 0.0624, 0.0748, 0.0046, 2.2),
    (0.1852, 0.0702, 0.0714, 0.0051, 2.0),
    (0.1365, 0.0702, 0.0702, 0.0039, 2.0),
    (0.0780, 0.0702, 0.0687, 0.0024, 2.0),
    (0.0487, 0.0487, 0.0439, 0.0000, 2.0),
]
# Eight values per section: x, rail half-width/y, shoulder half-width/y,
# roof half-width/y, crown y. The longitudinal outline and rail widths are
# measured from the F4U-1 drawing. The F4U-1D photographs own the near-vertical
# side panes and narrower roof; without factory ordinates those are ESTIMATE.
# The rail y values are the local fuselage skin minus 0.01-0.02 m, so no closed
# elliptical canopy can sit above the hull as a separate pod.
CANOPY = [
    (-2.68, 0.100, 1.151, 0.095, 1.161, 0.064, 1.168, 1.170),
    (-2.43, 0.260, 1.045, 0.247, 1.131, 0.166, 1.194, 1.210),
    (-2.13, 0.380, 0.868, 0.361, 1.082, 0.243, 1.239, 1.280),
    (-1.83, 0.430, 0.753, 0.408, 1.048, 0.275, 1.263, 1.320),
    (-1.53, 0.440, 0.704, 0.418, 1.003, 0.282, 1.222, 1.280),
    (-1.23, 0.340, 0.797, 0.323, 0.944, 0.218, 1.052, 1.080),
    (-1.08, 0.180, 0.876, 0.171, 0.904, 0.115, 0.925, 0.930),
]
CANOPY_FRAMES = (-2.23, -1.98, -1.68, -1.38)
TAILPLANE = dict(span=0.4, le=0.8285, root=0.127, taper=0.64, y=0.049, sweep=7.3)  # span of SPAN; the rest of LENGTH
FIN = dict(root=0.205, taper=0.5, height=0.156, y=0.068)                           # trailing edge at the tail
PROP = dict(hub=0.030, chord=0.025, spinner_r=0.026, spinner_len=0.040)             # hub = 0.75 x spinner_len
# x, z, wheel in m; the stance is FITTED (header): the wheel bottom lands on gear.heightM below the origin.
GEAR = dict(x=0.418, z=1.80, bottom=2.418, wheel_r=0.41, wheel_w=0.25)
TAILWHEEL = dict(x=-5.722, y=0.20, bottom=1.306, wheel_r=0.13, wheel_w=0.08)       # x, hinge y, bottom: m

SEGMENTS = 96
SUBDIVIDE = 6
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.55, 0.95, 0.76)  # half-span fractions, hinge chord fraction
FLAP1 = (0.15, 0.31, 0.75)
FLAP2 = (0.34, 0.52, 0.74)
ELEVATOR = (0.08, 0.97, 0.68)
RUDDER = (0.05, 0.93, 0.62)
EXHAUSTS = dict(count=2, x0=0.150, x1=0.175, y=-0.020, r=0.030, length=0.20)
FILLET = dict(le=0.22, te=0.48, half_w=0.022, half_h=0.016)
INSIGNIA = dict(fus_at=0.700, fus_d=1.00, wing_z=0.66, wing_chord=0.42, wing_d=1.40)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    """A fraction of LENGTH aft of the spinner tip, as glTF x."""
    return (NOSE_X - f) * L


_FUS, _ = kit._refine([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], SUBDIVIDE)


def fus_section(f):
    """(half-width, half-height, center y, exponent) of the lofted fuselage at X(f), linear between rings."""
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
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))  # an unswept quarter chord
tan_sw, tan_di, tan_an = math.tan(math.radians(sweep)), math.tan(math.radians(DIHEDRAL_DEG)), math.tan(math.radians(ANHEDRAL_DEG))


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def le_x(z):
    return 0.25 * root_chord - abs(z) * tan_sw


def wing_y(z):
    z = abs(z)
    if z <= KNEE_Z:
        return ROOT_Y - z * tan_an
    return ROOT_Y - KNEE_Z * tan_an + (z - KNEE_Z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE)
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = ROOT_Y + 0.35 * ROOT_T * root_chord - FILLET['half_h'] * L
    fz = fus_side_z(mid, fy) + FILLET['half_w'] * L - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, ROOT_Y),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, ROOT_Y)],
                   segments=24, center_z=side * fz, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    for x, rail_w, rail_y, *_rest in CANOPY:
        f = NOSE_X - x / L
        sink = fus_top_y(f, rail_w) - rail_y
        assert 0.005 <= sink <= 0.025, f'canopy rail at x {x:.2f} sinks {sink:.3f} m into fuselage skin'
    m.faired_canopy('glazing', UPPER, CANOPY, list(CANOPY_FRAMES), bar=0.022)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP1, 'Flap1'), (FLAP2, 'Flap2'), (AILERON, 'Aileron'))]
gear_z = GEAR['z']
breaks = [0.0, KNEE_Z, S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = (root_chord + (tip_chord - root_chord) * z / (S / 2) for z in (z0, z1))
        a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
        m.wing(UPPER, 0.25 * root_chord - z0 * tan_sw, wing_y(z0), c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=-ANHEDRAL_DEG if z0 < KNEE_Z else DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
tp = TAILPLANE
with m.tagged('tailplane'), m.shared_chart():
    m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
           sweep_deg=tp['sweep'], thickness=0.10, stations=STATIONS, span_segments=SPAN_SEGMENTS,
           controls=[(ELEVATOR[0] * tp['span'] * S / 2, ELEVATOR[1] * tp['span'] * S / 2, ELEVATOR[2], 'Elevator')])
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root
with m.tagged('fin'), m.shared_chart():
    m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
          sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), stations=STATIONS, span_segments=SPAN_SEGMENTS,
          controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2], 'Rudder')])
pr = PROP
with m.tagged('prop'), m.shared_chart():
    m.propeller('dark', (X(pr['hub']), 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L, pr['spinner_len'] * L,
                blade_sections=[(0.13, 0.9, 44.0), (0.35, 1.05, 33.0), (0.6, 1.0, 25.0), (0.85, 0.8, 19.0), (1.0, 0.5, 16.0)])
g = GEAR
hinge_y = wing_y(gear_z)  # - 0.0 * ROOT_T * root_chord
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], hinge_y, side * gear_z), g['bottom'] + hinge_y, g['wheel_r'], g['wheel_w'], node=name)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.045, node='Tailwheel')
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        # Leg cover on the inboard face of the strut (the legs fold inboard), its face EMBED_M inside it.
        m.box('dark', (g['x'], hinge_y - 0.55 * (g['bottom'] + hinge_y), side * (gear_z - strut_r + EMBED_M - 0.006)), (0.45, 0.95, 0.012), node=name)
    e = EXHAUSTS
    ey = e['y'] * L
    for side in (-1, 1):
        for k in range(e['count']):
            f = e['x0'] + (e['x1'] - e['x0']) * k / (e['count'] - 1)
            m.revolve('dark', (X(f), ey, side * (fus_side_z(f, ey) - 0.05)), (-1.0, -0.15, side * 0.5),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # Wing guns: three .50s a side outboard of the propeller disc, the muzzles just ahead of the leading edge
    # (stations of content/aircraft/f6f-hellcat.json combat.guns: z 3.0, 3.4, 3.8).
    for side in (-1, 1):
        for gz in (2.87, 3.25, 3.63):
            gz *= side
            m.gun_barrel('dark', (le_x(gz) - 0.35, wing_y(gz), gz), 0.0, 0.0, 0.50, 0.016)
    pz = -5.9
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.40, wing_y(pz), pz), 0.009, sides=6)
    # Antenna mast aft of the canopy, raked aft.
    m.strut('dark', (X(0.565), fus_top_y(0.565, 0.0) - 0.04, 0.0), (X(0.585), fus_top_y(0.565, 0.0) + 0.42, 0.0), 0.014, 0.007, sides=6)


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
    hw, hh, cy, _n = fus_section(ins['fus_at'])
    # On a fuselage side v = axis x uDir is up for uDir = -side x (aft on the left side's view).
    roundel('fuselage', (X(ins['fus_at']), cy, side * hw), (0.0, 0.0, float(side)), (-float(side), 0.0, 0.0), ins['fus_d'])
# Upper left wing and lower right wing (the Navy's rule): uDir spanwise, v forward.
zl = -ins['wing_z'] * S / 2
roundel('wing', (le_x(zl) - ins['wing_chord'] * chord_at(zl), wing_y(zl), zl), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), ins['wing_d'])
zr = ins['wing_z'] * S / 2
roundel('wing', (le_x(zr) - ins['wing_chord'] * chord_at(zr), wing_y(zr), zr), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0), ins['wing_d'])
for side in (-1, 1):
    streak = [(-0.9, -0.12), (1.4, -0.32), (1.4, 0.10), (-0.9, 0.12)]
    m.marking('polygon', tags=['fuselage'], origin=(X(EXHAUSTS['x1']), EXHAUSTS['y'] * L, 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.2), -1.2), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-1.0, -0.25), (0.7, -0.25), (0.7, 0.35), (-1.0, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.export(out)
