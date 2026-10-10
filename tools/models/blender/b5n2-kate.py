# tools/models/blender/b5n2-kate.py
"""Nakajima B5N2 Type 97 Carrier Attack Bomber Model 3 ("Kate"). Original work, AGPL-3.0-or-later.

Built on the Ki-84's single-engine template (R3), with the bombers' flexible gun (flex guns, 2026-10-09).
Stations are fractions of the cited length or span.

Figures (read 2026-10-09, English Wikipedia "Nakajima B5N", Specifications (B5N2), citing Francillon,
Japanese Aircraft of the Pacific War, 1970, pp. 415-416):
  span 15.518 m, length 10.3 m, wing area 37.7 m2       CITED
  airfoil NN-5 mod, 16% root / 8% tip                   CITED (Lednicer, via the same article)
  one Nakajima Sakae 11, a 3-blade constant-speed metal propeller
                                                        CITED (blade count)
  armament: one 7.7 mm Type 92 in the rear dorsal position; no fixed forward guns on the B5N2
                                                        CITED (drawn as Turret1, a flexible gun)
  one 800 kg Type 91 torpedo, external, on the centerline
                                                        CITED (load); the rack position is an ESTIMATE
  propeller diameter 3.2 m                              ESTIMATE (the source is silent)
  taper 0.45, an unswept quarter chord, dihedral 6 deg  ESTIMATE, period three-view proportions
  fuselage sections, the long three-seat greenhouse, cowl, tail surfaces (tailplane span 0.33 of the span,
  fin height 0.14 of LENGTH)                            ESTIMATE (fractions below)
  main gear retracts inboard into the wing; tailwheel fixed, un-noded
                                                        ESTIMATE of the motion (the B5N was the IJN's first
                                                        carrier airplane with retractable gear)
  IJN dark green over gray-green undersides (palette roles ijaGreen, underside, as the G4M's)
                                                        ESTIMATE (the 1942-44 scheme; the Pearl Harbor
                                                        airplanes were an overall light gray-green)
  hinomaru on both wing uppers and lowers and both fuselage sides, white-bordered (the Ki-84's cited
  0.075 m border)                                       ESTIMATE positions and sizes
  control surfaces, exhausts, pitot, antenna mast, leg covers
                                                        ESTIMATE, period three-view proportions
  additions sink at least 0.02 m into what they sit on  modeling choice: no coplanar faces (DP0)
Frame: glTF, +x forward, +y up, +z right, meters. Origin: the wing root's quarter chord on the thrust line,
standing in for the CG (ESTIMATE). Pose: gear down, thrust line level.
Leaves out: the cockpit interior, the wing fold, the torpedo crutch's sway braces, tail codes.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'b5n2'
# --- CITED
SPAN = 15.518
LENGTH = 10.3
WING_AREA = 37.7
BLADES = 3
ROOT_T, TIP_T = 0.16, 0.08
HINOMARU_BORDER_M = 0.075     # the Ki-84's cited border
# --- ESTIMATE
PROP_DIAMETER = 3.2
TAPER = 0.45
DIHEDRAL_DEG = 6.0
UPPER, LOWER = 'ijaGreen', 'underside'
NOSE_X = 0.315                # spinner tip ahead of the origin, of LENGTH
WING_Y = -0.050               # wing root chord line below the thrust line, of LENGTH (a low wing)
FUSELAGE = [
    (0.990, 0.006, 0.010, 0.030, 2.0),
    (0.920, 0.016, 0.026, 0.028, 2.1),
    (0.820, 0.028, 0.040, 0.022, 2.2),
    (0.700, 0.040, 0.052, 0.012, 2.2),
    (0.580, 0.050, 0.062, 0.004, 2.2),
    (0.450, 0.055, 0.068, 0.000, 2.2),
    (0.330, 0.057, 0.068, 0.000, 2.2),
    (0.200, 0.058, 0.064, 0.000, 2.1),
    (0.120, 0.058, 0.060, 0.000, 2.0),
    (0.055, 0.056, 0.056, 0.000, 2.0),
    (0.049, 0.054, 0.054, 0.000, 2.0),
    (0.044, 0.032, 0.032, 0.000, 2.0),
]
# The greenhouse: pilot, observer, then the radio operator and gunner.
CANOPY = [(0.665, 0.004, 0.004, 0.060), (0.620, 0.028, 0.026, 0.067), (0.450, 0.032, 0.034, 0.071),
          (0.300, 0.029, 0.030, 0.067), (0.250, 0.004, 0.004, 0.060)]
CANOPY_FRAMES = (0.620, 0.570, 0.520, 0.450, 0.400, 0.350, 0.300)
TAILPLANE = dict(span=0.33, le=0.860, root=0.130, taper=0.55, y=0.022, sweep=6.0)
FIN = dict(root=0.160, taper=0.45, height=0.140, y=0.030)
PROP = dict(hub=0.030, chord=0.024, spinner_r=0.026, spinner_len=0.040)
GEAR = dict(x=0.020, z=0.130, length=0.150, wheel_r=0.035, wheel_w=0.016)
TAILWHEEL = dict(at=0.880, y=-0.008, length=0.050, wheel_r=0.012, wheel_w=0.008)
REAR_GUN = dict(at=0.655, y=0.066, length=0.75)       # at, y of LENGTH; length m

SEGMENTS = 96
SUBDIVIDE = 6
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.60, 0.95, 0.76)
FLAP = (0.09, 0.56, 0.80)
ELEVATOR = (0.08, 0.97, 0.70)
RUDDER = (0.05, 0.93, 0.66)
EXHAUSTS = dict(count=4, x0=0.095, x1=0.140, y=-0.028, r=0.026, length=0.18)
FILLET = dict(le=0.24, te=0.52, half_w=0.022, half_h=0.014)
HINOMARU = dict(wing_z=0.68, wing_chord=0.45, wing_red=0.55, fus_at=0.76, fus_depth=0.85)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    return (NOSE_X - f) * L


_FUS, _ = kit._refine([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], SUBDIVIDE)


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
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
tan_sw, tan_di = math.tan(math.radians(sweep)), math.tan(math.radians(DIHEDRAL_DEG))


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def le_x(z):
    return 0.25 * root_chord - abs(z) * tan_sw


def wing_y(z):
    return WING_Y * L + abs(z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=LOWER)
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = WING_Y * L + 0.55 * ROOT_T * root_chord - FILLET['half_h'] * L
    fz = fus_side_z(mid, fy) + FILLET['half_w'] * L - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, WING_Y * L),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, WING_Y * L)],
                   segments=24, center_z=side * fz, lower_role=LOWER, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER, [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], [X(f) for f in CANOPY_FRAMES],
             bar=0.018, segments=48, subdivide=4)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
breaks = [0.0, GEAR['z'] * S, S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = (root_chord + (tip_chord - root_chord) * z / (S / 2) for z in (z0, z1))
        a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
        m.wing(UPPER, 0.25 * root_chord - z0 * tan_sw, WING_Y * L + z0 * tan_di, c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0, lower_role=LOWER,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
tp = TAILPLANE
with m.tagged('tailplane'), m.shared_chart():
    m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
           sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER, stations=STATIONS, span_segments=SPAN_SEGMENTS,
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
                blade_sections=[(0.13, 0.9, 42.0), (0.35, 1.05, 32.0), (0.6, 1.0, 24.0), (0.85, 0.8, 19.0), (1.0, 0.45, 16.0)])
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
        m.box('dark', (g['x'] * L, hinge_y - 0.55 * g['length'] * L, side * (g['z'] * S + strut_r - EMBED_M + 0.006)), (0.32, 0.85, 0.012), node=name)
    e = EXHAUSTS
    ey = e['y'] * L
    for side in (-1, 1):
        for k in range(e['count']):
            f = e['x0'] + (e['x1'] - e['x0']) * k / (e['count'] - 1)
            m.revolve('dark', (X(f), ey, side * (fus_side_z(f, ey) - 0.05)), (-1.0, -0.12, side * 0.55),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    pz = -6.0
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.38, wing_y(pz), pz), 0.008, sides=6)
    m.strut('dark', (X(0.235), fus_top_y(0.235, 0.0) - 0.035, 0.0), (X(0.260), fus_top_y(0.235, 0.0) + 0.40, 0.0), 0.012, 0.006, sides=6)
    m.strut('dark', (X(tw['at']) - 0.02, tw['y'] * L + 0.02, 0.0), (X(tw['at']) + 0.30, tw['y'] * L - 0.30, 0.0), 0.022, sides=6)
# Turret1: the rear gunner's 7.7 mm Type 92 at the greenhouse's aft end, pointing aft.
r = REAR_GUN
with m.tagged('turret'), m.shared_chart():
    m.flex_gun('dark', 1, (X(r['at']), r['y'] * L, 0.0), (-1.0, 0.12, 0.0), r['length'], scale=0.75, mount_r=0.07)

h = HINOMARU
for side in (-1, 1):
    z = side * h['wing_z'] * S / 2
    x = le_x(z) - h['wing_chord'] * chord_at(z)
    for up in (1.0, -1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'] + HINOMARU_BORDER_M, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'], color='hinomaruRed')
    hw, hh, cy, _n = fus_section(h['fus_at'])
    outer = h['fus_depth'] * hh
    center = (X(h['fus_at']), cy, side * hw)
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer - HINOMARU_BORDER_M, color='hinomaruRed')
    streak = [(-0.8, -0.10), (1.2, -0.28), (1.2, 0.09), (-0.8, 0.10)]
    m.marking('polygon', tags=['fuselage'], origin=(X(EXHAUSTS['x1']), EXHAUSTS['y'] * L, 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.0), -1.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-0.9, -0.25), (0.6, -0.25), (0.6, 0.35), (-0.9, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.marking('disc', tags=['wing'], center=(le_x(-3.6) - 0.02, wing_y(-3.6), -3.6), axis=(1.0, 0.0, 0.0), radiusM=0.09, color='lensClear')
m.export(out)
