# tools/models/blender/ki-21-sally.py
"""Mitsubishi Ki-21-IIb ("Sally"). Original work, AGPL-3.0-or-later.

The twin-engine template (R3): stations are fractions of the cited length or span; another
twin is this file with its own CITED block (R3 plan, Task 16). Rebuilt to the Ki-84's level
in DP1 (2026-09-28): fine sections, framed glazing, control surfaces, twisted propellers,
exhausts, guns and a baked skin.

Figures (read 2026-09-27, English Wikipedia "Mitsubishi Ki-21", Specifications (Ki-21-IIb)):
  span 22.5 m, length 16 m, wing area 69.9 m2         CITED
  3-bladed propellers                                  CITED (blade count)
  one dorsal turret (12.7 mm Ho-103)                   CITED (Turret1, for H3)
  propeller diameter 3.4 m                             ESTIMATE
  taper 0.51, an unswept quarter chord, dihedral 6 deg,
  thickness 17% root / 10% tip                         ESTIMATE
  engine span stations, nacelles, sections, glazing,
  tail surfaces, gear                                  ESTIMATE (fractions below)
  main gear retracts aft into the nacelles             ESTIMATE
  tailwheel fixed                                      ESTIMATE (static, not rigged)
  IJA dark green over gray-green undersides            ESTIMATE
DP1 detail figures (read 2026-09-28):
  armament: 5 x 7.7 mm flexible Type 89 machine guns (nose, ventral, beam and tail positions), 1 x 12.7 mm
    Ho-103 in the dorsal turret                        CITED, English Wikipedia "Mitsubishi Ki-21", Specifications
                                                       (Ki-21-IIb), read 2026-09-28. Only the dorsal turret is
                                                       rigged; the nose gun is drawn as a barrel (its position is
                                                       ESTIMATE); the ventral, beam and tail guns are left out.
  the 60th Sentai's group symbol was a wide horizontal stripe colored by chutai; aircraft were mostly left in the
    overall green-gray                                 seen in a WebSearch summary only (2026-09-28: the ICM, iModeler
                                                       and WildEagles pages it listed were not opened), so NOT cited
                                                       and NOT drawn: no tail stripe, no unit codes.
  hinomaru: two on the wing uppers, two on the wing lowers, two on the rear fuselage, each with a white border
                                                       ESTIMATE (no Ki-21 marking source was read; the Ki-84's
                                                       cited layout, VAN 2026-09-28, is the pattern)
  hinomaru sizes and positions: wing red 0.75 m radius centered at 0.57 of the half-span, 0.42 of the local chord
    aft of the leading edge; fuselage 0.85 of the local half-height, at 0.70 of LENGTH aft of the nose
                                                       ESTIMATE
  leading-edge identification strips, cowling color: omitted (no source read)
  cockpit canopy frames at 0.255, 0.225, 0.195, 0.165 of LENGTH aft of the nose, nose glazing frames at 0.075, 0.055,
    0.035, 0.018, 18 mm bars; nose glazing 1.06 x the fuselage section
                                                       ESTIMATE
  control surfaces (hinge chord fractions; spans of the half-span, tailplane half-span or fin height):
    inboard flaps 0.07-0.25 and outboard flaps 0.40-0.62 at 0.78, ailerons 0.65-0.96 at 0.76,
    elevators 0.08-0.97 at 0.70, rudder 0.05-0.93 at 0.68     ESTIMATE, period three-view proportions
  cowling lip: a station 0.003 of LENGTH ahead of the cowl face's shoulder; cowl-gill band at 0.062-0.078 of LENGTH
    behind the leading edge, proud 0.02 m                  ESTIMATE
  exhaust stacks: 5 a side on each nacelle at 0.058 of LENGTH behind the wing leading edge, 40 mm radius,
    0.30 m long, raked aft and out                         ESTIMATE (the source is silent)
  wing-root fillets from 0.34 to 0.59 of LENGTH, 0.020 half-width, 0.012 half-height
                                                       ESTIMATE
  main-gear leg covers 0.34 x 0.90 m on the legs, a drag brace on each leg; tailwheel strut
                                                       ESTIMATE
  pitot on the left wing at 8.0 m, antenna mast, landing-light lens on the left leading edge at 5.0 m
                                                       ESTIMATE
  exhaust soot streaks aft of the stacks, walkway wear at the left wing root
                                                       ESTIMATE
  additions sink at least 0.02 m into what they sit on   modeling choice: no coplanar faces (DP0)
Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
fuselage datum (ESTIMATE). Pose: gear down (R3 P13).
Leaves out: the ventral, beam and tail guns (flexible mounts, not turrets), the nose gun's mount, cockpit interior,
bomb bay, unit markings.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'ki21'
# --- CITED
SPAN = 22.5
LENGTH = 16.0
WING_AREA = 69.9
BLADES = 3
HINOMARU_BORDER_M = 0.075     # ESTIMATE (the Ki-84's cited border)
# --- ESTIMATE
PROP_DIAMETER = 3.4
TAPER = 0.51
DIHEDRAL_DEG = 6.0
SWEEP_DEG = None              # None: an unswept quarter chord
ROOT_T, TIP_T = 0.17, 0.10
UPPER, LOWER = 'ijaGreen', 'underside'
NOSE_X = 0.40
WING_Y = -0.019
FUSELAGE = [
    (0.981, 0.005, 0.006, 0.022, 2.0),
    (0.869, 0.022, 0.028, 0.016, 2.2),
    (0.681, 0.039, 0.053, 0.006, 2.2),
    (0.463, 0.047, 0.063, 0.000, 2.2),
    (0.244, 0.045, 0.059, 0.000, 2.2),
    (0.100, 0.038, 0.047, -0.003, 2.2),
    (0.025, 0.025, 0.028, -0.006, 2.0),
    (0.001, 0.004, 0.004, -0.0075, 2.0),
]
NOSE_GLAZING = [(0.094, 0.036, 0.041, -0.003), (0.070, 0.034, 0.039, -0.004), (0.038, 0.030, 0.034, -0.005), (0.015, 0.016, 0.018, -0.0065), (0.005, 0.003, 0.003, -0.0075)]
NOSE_GLAZE_SCALE = 1.06
NOSE_FRAMES = (0.075, 0.055, 0.035, 0.018)
CANOPY = [(0.288, 0.003, 0.003, 0.053), (0.238, 0.028, 0.019, 0.059), (0.175, 0.025, 0.018, 0.056), (0.131, 0.003, 0.003, 0.050)]
CANOPY_FRAMES = (0.255, 0.225, 0.195, 0.165)
TAILPLANE = dict(span=0.338, le=0.8375, root=0.1375, taper=0.55, y=0.019, sweep=10.0)
FIN = dict(root=0.1625, taper=0.54, height=0.15, y=0.022)
ENGINES = [0.16]              # nacelle z each side, of SPAN
# (x ahead of the wing leading edge at that z, half-width), of LENGTH; half-height 1.05 x half-width
NACELLE = dict(below=0.0206, stations=[(-0.20, 0.009), (-0.10, 0.034), (0.03, 0.044), (0.10, 0.044), (0.135, 0.039), (0.138, 0.019)])
PROP = dict(ahead=0.146, chord=0.019, spinner_r=0.0175, spinner_len=0.034)
GEAR = dict(ahead=-0.02, below=0.040, length=0.131, wheel_r=0.034, wheel_w=0.020, retracts='aft')
TAILWHEEL = dict(at=0.90, y=-0.010, length=0.050, wheel_r=0.015, wheel_w=0.010, retracts=False)
TURRETS = [dict(at=0.513, y=0.059, up=1, radius=0.034, height=0.0375, barrels=1, barrel=0.075, facing=-1)]

# --- DP1 detail (ESTIMATE, see the header)
SEGMENTS = 96                 # fuselage ring segments (was 16)
NACELLE_SEGMENTS = 64
SUBDIVIDE = 6                 # Catmull-Rom stations between authored ones
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.65, 0.96, 0.76)  # half-span fractions, hinge chord fraction
FLAPS = ((0.07, 0.25, 0.78), (0.40, 0.62, 0.78))
ELEVATOR = (0.08, 0.97, 0.70)  # of the tailplane half-span
RUDDER = (0.05, 0.93, 0.68)   # of the fin height
FILLET = dict(le=0.34, te=0.59, half_w=0.020, half_h=0.012)
COWL_LIP = 0.003              # of LENGTH: the last nacelle station's step
EXHAUSTS = dict(count=5, dx=0.058, r=0.040, length=0.30, from_deg=100.0, to_deg=165.0)
HINOMARU = dict(wing_z=0.57, wing_chord=0.42, wing_red=0.75, fus_at=0.70, fus_depth=0.85)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    return (NOSE_X - f) * L


def _at(refined, x):
    """(half-width, half-height, center y, exponent) of a refined loft at x, linear between rings."""
    i = next(k for k in range(len(refined) - 1) if refined[k][0] <= x <= refined[k + 1][0])
    t = (x - refined[i][0]) / (refined[i + 1][0] - refined[i][0])
    return tuple(refined[i][c] + (refined[i + 1][c] - refined[i][c]) * t for c in (1, 2, 3, 4))


_FUS, _ = kit._refine([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], SUBDIVIDE)


def fus_section(f):
    return _at(_FUS, X(f))


def fus_top_y(f, z):
    hw, hh, cy, n = fus_section(f)
    return cy + hh * max(0.0, 1.0 - abs(z / hw) ** n) ** (1.0 / n)


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = SWEEP_DEG if SWEEP_DEG is not None else math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
tan_sw, tan_di = math.tan(math.radians(sweep)), math.tan(math.radians(DIHEDRAL_DEG))
le0 = 0.25 * root_chord


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def wing_le(z):
    return le0 - abs(z) * tan_sw


def wing_y(z):
    return WING_Y * L + abs(z) * tan_di


def nacelle_y(z):
    return wing_y(z) - NACELLE['below'] * L


# A cowling lip: the cowl face rolls in through an added station before the last authored one.
nacelle_stations = list(NACELLE['stations'])
nacelle_stations = nacelle_stations[:-1] + [(nacelle_stations[-1][0] - COWL_LIP / 2, 0.031), nacelle_stations[-1]]
props = sorted(side * f * S for f in ENGINES for side in (-1, 1))   # port to starboard


def nacelle_loft(z):
    """The nacelle's authored stations at wing station z: (x, half-width, half-height, center y, exponent)."""
    le, ny = wing_le(z), nacelle_y(z)
    return [(le + dx * L, w * L, 1.05 * w * L, ny, 2.2) for dx, w in nacelle_stations]


_NAC, _ = kit._refine(nacelle_loft(props[0]), SUBDIVIDE)     # the two nacelles differ only by z, and by the tiny dihedral rise


def nac_point(z, dx, angle_deg):
    """A point on the nacelle skin at z, dx of LENGTH ahead of the leading edge, at ring angle (0 = top, 90 = side)."""
    x = wing_le(z) + dx * L
    hw, hh, _cy, n = _at(_NAC, wing_le(props[0]) + dx * L)
    cy = nacelle_y(z)
    t = math.radians(angle_deg)
    c, s = math.cos(t), math.sin(t)
    return (x, cy + hh * math.copysign(abs(c) ** (2 / n), c), z + hw * math.copysign(abs(s) ** (2 / n), s))


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=LOWER)
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = WING_Y * L + 0.55 * ROOT_T * root_chord - FILLET['half_h'] * L
    hw_mid, _hh, _cy, n_mid = fus_section(mid)
    fz = hw_mid * max(0.0, 1.0 - abs((fy - _cy) / _hh) ** n_mid) ** (1.0 / n_mid) + FILLET['half_w'] * L - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, WING_Y * L),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, WING_Y * L)],
                   segments=24, center_z=side * fz, lower_role=LOWER, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER, [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], [X(f) for f in CANOPY_FRAMES],
             bar=0.018, segments=48, subdivide=4)
with m.tagged('nose'), m.shared_chart():
    ng = [(X(f), w * NOSE_GLAZE_SCALE * L, h * NOSE_GLAZE_SCALE * L, y * L) for f, w, h, y in NOSE_GLAZING]
    m.canopy('glazing', UPPER, ng, [X(f) for f in NOSE_FRAMES], bar=0.018, segments=48, subdivide=4)

controls = [(a * S / 2, b * S / 2, h) for a, b, h in (*FLAPS, AILERON)]
nac_z = ENGINES[0] * S
breaks = [0.0, nac_z, S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = chord_at(z0), chord_at(z1)
        a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
        m.wing(UPPER, le0 - z0 * tan_sw, WING_Y * L + z0 * tan_di, c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0, lower_role=LOWER,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
tp = TAILPLANE
with m.tagged('tailplane'), m.shared_chart():
    m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
           sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER, stations=STATIONS, span_segments=SPAN_SEGMENTS,
           controls=[(ELEVATOR[0] * tp['span'] * S / 2, ELEVATOR[1] * tp['span'] * S / 2, ELEVATOR[2])])
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root
with m.tagged('fin'), m.shared_chart():
    m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
          sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), stations=STATIONS, span_segments=SPAN_SEGMENTS,
          controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2])])

for i, z in enumerate(props, start=1):
    le, ny = wing_le(z), nacelle_y(z)
    with m.tagged('nacelle'), m.shared_chart():
        m.fuselage(UPPER, nacelle_loft(z), segments=NACELLE_SEGMENTS, subdivide=SUBDIVIDE, center_z=z, lower_role=LOWER)
        # Cowl-gill band: a hoop proud of the cowl by 0.02 m, its cap rims stepping out of the skin.
        (xa, xb) = (le + 0.062 * L, le + 0.078 * L)
        sa, sb = _at(_NAC, wing_le(props[0]) + 0.062 * L), _at(_NAC, wing_le(props[0]) + 0.078 * L)
        m.fuselage('dark', [(xa, sa[0] + 0.02, sa[1] + 0.02, ny), (xb, sb[0] + 0.02, sb[1] + 0.02, ny)], segments=NACELLE_SEGMENTS, center_z=z)
    pr = PROP
    with m.tagged('prop'), m.shared_chart():
        m.propeller('dark', (le + pr['ahead'] * L, ny, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                    pr['spinner_len'] * L, node=f'Prop{i}',
                    blade_sections=[(0.13, 0.9, 45.0), (0.35, 1.05, 34.0), (0.6, 1.0, 26.0), (0.85, 0.8, 20.0), (1.0, 0.45, 17.0)])
g = GEAR
tw = TAILWHEEL
hinge = {}
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        z = side * ENGINES[0] * S
        hinge[name] = (wing_le(z) + g['ahead'] * L, nacelle_y(z) - g['below'] * L, z)
        m.gear_leg('dark', hinge[name], g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L, node=name if g['retracts'] else None)
    m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
               node='Tailwheel' if tw['retracts'] else None)
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r'] * L
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        hx, hy, hz = hinge[name]
        # Leg cover, outboard of the strut with its inner face EMBED_M inside it; a drag brace forward of the leg.
        m.box('dark', (hx, hy - 0.55 * g['length'] * L, hz + side * (strut_r - EMBED_M + 0.006)), (0.34, 0.90, 0.012), node=name)
        m.strut('dark', (hx - 0.02, hy - 0.10, hz), (hx + 0.45, hy - 0.90, hz), 0.025, sides=6, node=name)
    # Exhaust stacks: EXHAUSTS['count'] a side on each nacelle, short tubes from 0.05 m inside the cowl, raked aft and out.
    e = EXHAUSTS
    for z in props:
        for side in (-1, 1):
            for k in range(e['count']):
                a = e['from_deg'] + (e['to_deg'] - e['from_deg']) * k / (e['count'] - 1)
                px, py, pz = nac_point(z, e['dx'], a)
                pz = z + side * (pz - z)
                cy = nacelle_y(z)
                out_dir = (pz - z, py - cy)
                nrm = math.hypot(*out_dir)
                ox, oy = out_dir[0] / nrm, out_dir[1] / nrm
                m.revolve('dark', (px, py - 0.04 * oy, pz - 0.04 * ox), (-1.0, 0.7 * oy, 0.7 * ox), [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 10)
    # Turret is below (gun_turret). Nose gun: a barrel from inside the greenhouse, its muzzle 3 cm inside the nose tip's x.
    m.gun_barrel('dark', (X(0.030), -0.0060 * L + 0.05, 0.0), 0.0, 0.0, X(0.001) - 0.03 - X(0.030), 0.018)
    # Pitot, left wing, on the chord line: its aft end 0.10 m inside the leading edge.
    pz = -8.0
    m.strut('dark', (wing_le(pz) - 0.10, wing_y(pz), pz), (wing_le(pz) + 0.45, wing_y(pz), pz), 0.010, sides=6)
    # Antenna mast ahead of the canopy, raked aft, its foot 0.04 m under the spine.
    m.strut('dark', (X(0.320), fus_top_y(0.320, 0.0) - 0.04, 0.0), (X(0.345), fus_top_y(0.320, 0.0) + 0.85, 0.0), 0.014, 0.007, sides=6)
    # Tailwheel strut brace and fork (fixed gear).
    m.strut('dark', (X(tw['at']) - 0.02, tw['y'] * L + 0.02, 0.0), (X(tw['at']) + 0.30, tw['y'] * L - 0.35, 0.0), 0.022, sides=6)
for i, t in enumerate(TURRETS, start=1):
    with m.tagged('turret'), m.shared_chart():
        m.gun_turret(UPPER, i, (X(t['at']), t['y'] * L, 0.0), t['radius'] * L, t['height'] * L, up=t['up'],
                     barrels=t['barrels'], barrel_length=t['barrel'] * L, facing=t['facing'])

# --- Markings (ESTIMATE, see the header).
h = HINOMARU
for side in (-1, 1):
    z = side * h['wing_z'] * S / 2
    x = wing_le(z) - h['wing_chord'] * chord_at(z)
    for up in (1.0, -1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'] + HINOMARU_BORDER_M, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'], color='hinomaruRed')
    hw, hh, cy, _n = fus_section(h['fus_at'])
    outer = h['fus_depth'] * hh
    center = (X(h['fus_at']), cy, side * hw)
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer - HINOMARU_BORDER_M, color='hinomaruRed')
    # Exhaust soot streaks on the nacelle's outer side, aft of the stacks; v = axis x uDir = -side * y.
    zc = side * nac_z
    streak = [(-0.4, -0.20), (1.6, -0.45), (1.6, 0.15), (-0.4, 0.20)]
    m.marking('polygon', tags=['nacelle'], origin=(wing_le(zc) + EXHAUSTS['dx'] * L, nacelle_y(zc) - 0.15, zc + side * 0.7), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * v) for u, v in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
# Walkway wear on the left wing root, where the crew climbed in (ESTIMATE).
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.2), -1.2), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-0.9, -0.30), (0.7, -0.30), (0.7, 0.40), (-0.9, 0.40)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
# Landing light: a lens on the left wing's leading edge (ESTIMATE position).
m.marking('disc', tags=['wing'], center=(wing_le(-5.0) - 0.02, wing_y(-5.0), -5.0), axis=(1.0, 0.0, 0.0), radiusM=0.11, color='lensClear')
m.export(out)
