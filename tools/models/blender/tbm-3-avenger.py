# tools/models/blender/tbm-3-avenger.py
"""General Motors (Eastern Aircraft) TBM-3 Avenger. Original work, AGPL-3.0-or-later.

Built on the Ki-84's single-engine template (R3) with the G4M's bomb bay (C2) and the bombers' turret and
flexible gun (turret aim and flex guns, 2026-10-09). Stations are fractions of the cited length or span.

Figures (read 2026-10-09):
  span 16.51 m (54 ft 2 in), wing area 45.52 m2 (490 sq ft), airfoil NACA 23015 root / 23009 tip
                                                        CITED, English Wikipedia "Grumman TBF Avenger",
                                                        Specifications (TBF-1; the TBM-3 shares the wing)
  length 12.48 m (40 ft 11.5 in)                        CITED, J. Rickard, "Eastern TBM-3E Avenger",
                                                        historyofwar.org, read 2026-10-09 (the TBM-3E's;
                                                        the TBM-3 shares the airframe)
  3-bladed Hamilton Standard propeller                 CITED (blade count), English Wikipedia (above)
  armament: 2 x .50 in wing guns, 1 x .50 in dorsal turret, 1 x .30 in ventral gun
                                                        CITED, English Wikipedia (above), Armament;
                                                        historyofwar.org (above). The dorsal ball turret is
                                                        Turret1, the ventral gun Turret2 (a flexible gun)
  one Mark 13 torpedo, or 2,000 lb of bombs, in an internal bay
                                                        CITED, English Wikipedia (above)
  propeller diameter 3.96 m (13 ft)                     ESTIMATE (the sources read are silent)
  taper 0.45, an unswept quarter chord, dihedral 5 deg  ESTIMATE, period three-view proportions (the real
                                                        center section is flat and the folding outer panels
                                                        carry the dihedral; one dihedral stands for both)
  fuselage sections (a deep barrel, 1.5 m wide and 2.25 m deep at the bay), the long greenhouse, the
  dorsal ball turret, the ventral gun step, cowl, tail surfaces (tailplane span 0.36 of the span, fin
  height 0.155 of LENGTH)                               ESTIMATE (fractions below)
  main gear retracts outboard into the wing             ESTIMATE of the motion (the real legs swing
                                                        outboard and the wheels turn flat; one hinge swings)
  main wheels 0.84 m diameter, leg 1.62 m below the hinge; tailwheel fixed, un-noded
                                                        ESTIMATE
  bomb bay: one, under the wing center section, 4.3 m long, doors 0.32 m either side of the keel, under
    a flat stretch of belly
                                                        ESTIMATE: sized to take the Mk 13's 4.09 m
  overall Glossy Sea Blue (the US Navy's 1944-45 scheme; palette role seaBlue)
                                                        ESTIMATE (no chip read)
  1943 star-and-bar insignia (blue outline): both fuselage sides, upper left and lower right wing
                                                        ESTIMATE positions and sizes (the Navy's wing
                                                        placement rule; no TBM drawing read)
  control surfaces, exhausts, pitot, antenna mast, leg covers
                                                        ESTIMATE, period three-view proportions
  additions sink at least 0.02 m into what they sit on  modeling choice: no coplanar faces (DP0)
Frame: glTF, +x forward, +y up, +z right, meters. Origin: the wing root's quarter chord on the thrust line,
standing in for the CG (ESTIMATE). Pose: gear down, thrust line level.
Leaves out: the cockpit interior, the wing fold, rocket rails, the radar pod of later -3s, unit markings.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'tbm3'
# --- CITED
SPAN = 16.51
LENGTH = 12.48
WING_AREA = 45.52
BLADES = 3
ROOT_T, TIP_T = 0.15, 0.09
# --- ESTIMATE
PROP_DIAMETER = 3.96
TAPER = 0.45
DIHEDRAL_DEG = 5.0
UPPER = 'seaBlue'
NOSE_X = 0.2925               # spinner tip ahead of the origin, of LENGTH
WING_Y = -0.035               # wing root chord line below the thrust line, of LENGTH
# (x aft of the spinner tip, half-width, half-height, center y, exponent), tail to nose; of LENGTH
FUSELAGE = [
    (0.990, 0.006, 0.010, 0.034, 2.0),
    (0.930, 0.016, 0.024, 0.032, 2.1),
    (0.840, 0.030, 0.040, 0.026, 2.2),
    (0.740, 0.042, 0.054, 0.016, 2.2),
    (0.640, 0.051, 0.068, 0.004, 2.3),
    (0.540, 0.056, 0.088, -0.015, 2.4),
    (0.420, 0.058, 0.090, -0.016, 2.4),
    (0.300, 0.059, 0.088, -0.016, 2.4),
    (0.200, 0.060, 0.085, -0.017, 2.3),
    (0.130, 0.061, 0.064, 0.000, 2.1),
    (0.060, 0.059, 0.059, 0.000, 2.0),
    (0.052, 0.057, 0.057, 0.000, 2.0),
    (0.046, 0.034, 0.034, 0.000, 2.0),
]
# The greenhouse: pilot, then radio operator, ending at the turret.
CANOPY = [(0.545, 0.004, 0.004, 0.073), (0.500, 0.031, 0.028, 0.079), (0.360, 0.034, 0.037, 0.081),
          (0.250, 0.030, 0.031, 0.077), (0.205, 0.004, 0.004, 0.069)]
CANOPY_FRAMES = (0.500, 0.455, 0.410, 0.360, 0.305, 0.250)
TAILPLANE = dict(span=0.36, le=0.855, root=0.135, taper=0.55, y=0.028, sweep=6.0)  # span of SPAN; the rest of LENGTH
FIN = dict(root=0.170, taper=0.45, height=0.155, y=0.040)                         # trailing edge at the tail
PROP = dict(hub=0.030, chord=0.022, spinner_r=0.024, spinner_len=0.040)           # hub = 0.75 x spinner_len
GEAR = dict(x=0.020, z=0.170, length=0.130, wheel_r=0.0336, wheel_w=0.016)         # x, length, wheel of LENGTH; z of SPAN
TAILWHEEL = dict(at=0.860, y=-0.012, length=0.045, wheel_r=0.012, wheel_w=0.008)
BAYS = [(-3.3, 1.0, 0.32)]    # (x0, x1, door half width), meters (C2)
TURRET = dict(at=0.565, y=0.070, radius=0.048, height=0.062, barrel=1.2)           # at, y, radius, height of LENGTH; barrel m
VENTRAL = dict(at=0.625, y=-0.0625, length=0.9)                                      # at, y of LENGTH; length m

SEGMENTS = 96
SUBDIVIDE = 6
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.60, 0.95, 0.76)  # half-span fractions, hinge chord fraction
FLAP = (0.09, 0.56, 0.78)
ELEVATOR = (0.08, 0.97, 0.68)
RUDDER = (0.05, 0.93, 0.62)
EXHAUSTS = dict(count=4, x0=0.105, x1=0.150, y=-0.030, r=0.035, length=0.22)
FILLET = dict(le=0.20, te=0.47, half_w=0.022, half_h=0.016)
INSIGNIA = dict(fus_at=0.715, fus_d=1.00, wing_z=0.66, wing_chord=0.42, wing_d=1.45)
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
tan_sw, tan_di = math.tan(math.radians(sweep)), math.tan(math.radians(DIHEDRAL_DEG))


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def le_x(z):
    return 0.25 * root_chord - abs(z) * tan_sw


def wing_y(z):
    return WING_Y * L + abs(z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE, doors=BAYS)
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = WING_Y * L + 0.55 * ROOT_T * root_chord - FILLET['half_h'] * L
    fz = fus_side_z(mid, fy) + FILLET['half_w'] * L - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, WING_Y * L),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, WING_Y * L)],
                   segments=24, center_z=side * fz, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER, [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], [X(f) for f in CANOPY_FRAMES],
             bar=0.022, segments=48, subdivide=4)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
breaks = [0.0, GEAR['z'] * S, S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = (root_chord + (tip_chord - root_chord) * z / (S / 2) for z in (z0, z1))
        a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
        m.wing(UPPER, 0.25 * root_chord - z0 * tan_sw, WING_Y * L + z0 * tan_di, c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0,
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
hinge_y = WING_Y * L + g['z'] * S * tan_di - 0.3 * ROOT_T * root_chord
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'] * L, hinge_y, side * g['z'] * S), g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L, node=name)
    m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L)
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r'] * L
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        # Leg cover, inboard of the strut (the legs fold outboard), its face EMBED_M inside it.
        m.box('dark', (g['x'] * L, hinge_y - 0.55 * g['length'] * L, side * (g['z'] * S - strut_r + EMBED_M - 0.006)), (0.38, 0.95, 0.012), node=name)
    e = EXHAUSTS
    ey = e['y'] * L
    for side in (-1, 1):
        for k in range(e['count']):
            f = e['x0'] + (e['x1'] - e['x0']) * k / (e['count'] - 1)
            m.revolve('dark', (X(f), ey, side * (fus_side_z(f, ey) - 0.05)), (-1.0, -0.15, side * 0.5),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # Wing guns: one .50 a side outboard of the propeller disc, the muzzle just ahead of the leading edge.
    for side in (-1, 1):
        gz = side * 3.6
        m.gun_barrel('dark', (le_x(gz) - 0.45, wing_y(gz), gz), 0.0, 0.0, 0.62, 0.018)
    pz = -6.6
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.40, wing_y(pz), pz), 0.009, sides=6)
    # Antenna mast ahead of the greenhouse, raked aft.
    m.strut('dark', (X(0.195), fus_top_y(0.195, 0.0) - 0.04, 0.0), (X(0.215), fus_top_y(0.195, 0.0) + 0.45, 0.0), 0.014, 0.007, sides=6)
    m.strut('dark', (X(tw['at']) - 0.02, tw['y'] * L + 0.02, 0.0), (X(tw['at']) + 0.35, tw['y'] * L - 0.30, 0.0), 0.024, sides=6)
# Turret1 the dorsal ball turret (one .50, aft), Turret2 the ventral .30 at the step aft of the bay, firing aft and down.
t = TURRET
with m.tagged('turret'), m.shared_chart():
    m.gun_turret('glazing', 1, (X(t['at']), t['y'] * L, 0.0), t['radius'] * L, t['height'] * L, up=1, barrels=1,
                 barrel_length=t['barrel'], facing=-1, scale=1.0, gun_role='dark')
v = VENTRAL
with m.tagged('turret'), m.shared_chart():
    m.flex_gun('dark', 2, (X(v['at']), v['y'] * L, 0.0), (-1.0, -0.25, 0.0), v['length'], scale=0.75, mount_r=0.07)


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
m.marking('disc', tags=['wing'], center=(le_x(-5.0) - 0.02, wing_y(-5.0), -5.0), axis=(1.0, 0.0, 0.0), radiusM=0.11, color='lensClear')
m.export(out)
