# tools/models/blender/b-29-superfortress.py
"""Boeing B-29 Superfortress. Original work, AGPL-3.0-or-later.

The four-engine template (R3): stations are fractions of the cited length or span; TRICYCLE
and TURRETS make another four-engine type this file with its own CITED block (R3 plan, Task 16).
Rebuilt to the Ki-84's level in DP1 (2026-09-28): a greenhouse nose with framed multi-pane glazing,
a raised flight-deck canopy, four detailed nacelles, control surfaces, twisted four-blade propellers,
twin-wheel tricycle gear with doors, five turrets, exhausts and a baked skin.

Figures (read 2026-09-27, English Wikipedia "Boeing B-29 Superfortress", Specifications; the section
names no variant):
  span 43.05 m (141 ft 3 in), length 30.18 m (99 ft 0 in),
    wing area 161.3 m2 (1,736 sq ft)                        CITED
  four remote turrets (the lead) and a manned tail
    position (the specification's guns)                     CITED (Turret1..5 nose to tail, for H3)
  4-bladed propellers, 5.055 m (16 ft 7 in)                 CITED
  airfoil thickness 22% root / 9% tip (Boeing 117)          CITED (the section's own camber is not modeled:
                                                            the kit's section is symmetric)
  taper 0.35, leading-edge sweep 7 deg, dihedral 4.5 deg   ESTIMATE
  engine stations, nacelles, sections, glazing, tail, gear  ESTIMATE (fractions below)
  main gear retracts forward into the inboard nacelles;
    nose gear retracts aft                                  ESTIMATE
  unpainted natural metal                                   ESTIMATE (role naturalMetal)
DP1 detail figures (read 2026-09-28):
  armament: four remotely controlled turrets with two .50 M2 each, and a tail position with two .50 and one
    20 mm initially                                         CITED, English Wikipedia "Boeing B-29 Superfortress",
                                                            read 2026-09-28. Rigged: Turret1..5 (two barrels each,
                                                            the tail's 20 mm not drawn); their stations, the upper
                                                            forward / lower forward / upper aft / lower aft order,
                                                            and the sight blisters on them: ESTIMATE
  engines: the R-3350-23 is turbosupercharged              CITED, the same page and date. Everything drawn of that
                                                            installation is ESTIMATE (no drawing was read): a
                                                            turbosupercharger housing and dark waste-gate bucket
                                                            under the aft nacelle, a chin intercooler / oil-cooler
                                                            scoop with a dark opening under the cowl, a cowl-flap
                                                            band behind the cowl lip, 3 exhaust stacks a side
  national insignia: the 1943 star-and-bar. Bars added to the roundel "with an Insignia Red outline"
    (June 1943), the red outline replaced by Insignia Blue by AN-I-9 amendment 14 August 1943 (TO 07-1-1 of
    24 September 1943 for field units)                      CITED, English Wikipedia "United States military
                                                            aircraft national insignia", read 2026-09-28. This
                                                            model wears the blue-outline (post-August 1943) style;
                                                            the page gives no proportions, FS numbers or positions,
                                                            so all of the following are ESTIMATE:
  geometry: blue disc of diameter d, a white five-point star in it (points on a circle 0.40 d in radius, apex
    up), white bars 0.5 d long and 0.33 d high either side, a blue outline 0.125 d wide around the bars; d 2.0 m
    on all four wing surfaces (bars spanwise, apex forward, centered 10.75 m from the centerline and 0.42 of the
    local chord aft of the leading edge), d 1.6 m on each side of the rear fuselage (centered 0.78 of LENGTH aft of
    the nose, on the axis)                                  ESTIMATE
  colors: usaaInsigniaBlue, usaaInsigniaWhite (colors.ts)   ESTIMATE
  1945 tail markings: NOT DRAWN. "USAAF unit identification aircraft markings" (English Wikipedia, read
    2026-09-28) lists a symbol per wing (58th triangle, 73rd square, 313th circle, 314th solid square, 315th
    diamond, 509th circle around an arrowhead) and letters per group, but nothing ties this model to one wing or
    group, and the stroke font has digits only. No symbol, letter, serial or nose art is drawn.
  propeller-tip colors, cowl paint, de-icer boots: omitted (no source read)
  control surfaces (hinge chord fractions; spans of the half-span, tailplane half-span or fin height):
    flaps 0.075-0.30 and 0.385-0.62 at 0.72, ailerons 0.72-0.965 at 0.76, elevators 0.06-0.96 at 0.70,
    rudder 0.04-0.94 at 0.68                                ESTIMATE, period three-view proportions
  nose glazing: the upper half of the nose loft is glass, the lower half metal, 1.03 x the cabin section at its
    rear rim; 9 hoop frames and 7 longitudinal mullions (18 mm bars); flight-deck canopy 5 hoops and 5 mullions
                                                            ESTIMATE
  waist sighting blisters at 0.56 of LENGTH, tail gunner's canopy at 0.91-0.95   ESTIMATE
  twin nose wheels, twin wheels on each main leg, leg covers, door panels and drag braces ride the leg nodes
                                                            ESTIMATE
  pitot on the left wing at 10.5 m, dorsal mast and ventral whip antenna, landing-light lens on the left leading
    edge at 11.0 m, soot streaks aft of the stacks, walkway wear at the left wing root
                                                            ESTIMATE
  additions sink at least 0.02 m into what they sit on     modeling choice: no coplanar faces (DP0)
Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
fuselage axis (ESTIMATE). Pose: gear down (R3 P13).
Leaves out: bomb bay doors, cockpit interior, the tail 20 mm cannon, radar.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'b29'
# --- CITED
SPAN = 43.05
LENGTH = 30.18
WING_AREA = 161.3
BLADES = 4
PROP_DIAMETER = 5.055
ROOT_T, TIP_T = 0.22, 0.09
# --- ESTIMATE
TAPER = 0.35
SWEEP_DEG = 7.0
DIHEDRAL_DEG = 4.5
METAL = 'naturalMetal'
NOSE_X = 0.4175
WING_Y = -0.013
# (f aft of the nose, half-width, half-height, center y, exponent) of LENGTH, tail to nose. The cabin's section is
# 0.048 x 0.048 from the flight-deck bulkhead to 0.68 (the turret pivots sit on it).
FUSELAGE = [
    (0.965, 0.0085, 0.0100, 0.0115, 2.0),
    (0.940, 0.0135, 0.0160, 0.0100, 2.0),
    (0.900, 0.0215, 0.0255, 0.0085, 2.0),
    (0.850, 0.0315, 0.0350, 0.0050, 2.0),
    (0.800, 0.0405, 0.0435, 0.0015, 2.0),
    (0.750, 0.0460, 0.0480, 0.0000, 2.0),
    (0.680, 0.0480, 0.0480, 0.0000, 2.0),
    (0.400, 0.0480, 0.0480, 0.0000, 2.0),
    (0.160, 0.0480, 0.0480, 0.0000, 2.0),
    (0.120, 0.0480, 0.0480, 0.0000, 2.0),
]
# The nose: glass above the ring's center, metal below (lower_role). It starts 1.03 x the cabin at its rear rim.
NOSE = [
    (0.130, 0.0495, 0.0505, 0.0000, 2.0),
    (0.100, 0.0490, 0.0485, -0.0010, 2.0),
    (0.075, 0.0475, 0.0465, -0.0030, 2.0),
    (0.052, 0.0445, 0.0435, -0.0050, 2.0),
    (0.032, 0.0390, 0.0385, -0.0065, 2.0),
    (0.016, 0.0300, 0.0300, -0.0072, 2.0),
    (0.006, 0.0190, 0.0195, -0.0075, 2.0),
    (0.000, 0.0040, 0.0040, -0.0075, 2.0),
]
NOSE_HOOPS = (0.115, 0.098, 0.082, 0.068, 0.055, 0.043, 0.033, 0.024, 0.016)
NOSE_MULLIONS = (-75.0, -50.0, -25.0, 0.0, 25.0, 50.0, 75.0)
NOSE_MULLION_F = (0.126, 0.110, 0.095, 0.080, 0.066, 0.053, 0.041, 0.030, 0.021, 0.013, 0.007)
# The flight deck's raised canopy (f, half-width, half-height, center y).
DECK = [(0.134, 0.020, 0.006, 0.0400), (0.118, 0.034, 0.014, 0.0395), (0.095, 0.0385, 0.0175, 0.0345),
        (0.070, 0.0380, 0.0165, 0.0300), (0.050, 0.0270, 0.0100, 0.0255)]
DECK_HOOPS = (0.112, 0.097, 0.082, 0.067, 0.056)
DECK_MULLIONS = (-55.0, -28.0, 0.0, 28.0, 55.0)
TAIL_CANOPY = [(0.955, 0.0080, 0.0060, 0.0215), (0.942, 0.0125, 0.0095, 0.0225), (0.926, 0.0138, 0.0115, 0.0222), (0.910, 0.0110, 0.0070, 0.0210)]
TAIL_HOOPS = (0.935, 0.918)
TAILPLANE = dict(span=0.307, le=0.8352, root=0.139, taper=0.43, y=0.020, sweep=10.0)
FIN = dict(root=0.199, taper=0.40, height=0.1855, y=0.020)
ENGINES = [0.1696, 0.3298]
NACELLE = dict(below=0.015, stations=[(-0.166, 0.0066), (-0.083, 0.025), (0.0, 0.028), (0.080, 0.028), (0.106, 0.023), (0.108, 0.0116)])
PROP = dict(ahead=0.1125, chord=0.015, spinner_r=0.0116, spinner_len=0.02)
TRICYCLE = True
GEAR = dict(ahead=-0.016, below=0.027, length=0.0994, wheel_r=0.022, wheel_w=0.016, retracts='forward')
NOSE_GEAR = dict(at=0.103, y=-0.042, wheel_r=0.016, wheel_w=0.012, retracts='aft')
# (x aft of the nose, center y, up, radius, height, barrels, barrel length, facing), all of LENGTH but up/barrels/facing
TURRETS = [
    (0.1695, 0.046, 1, 0.0166, 0.015, 2, 0.040, 1),
    (0.186, -0.046, -1, 0.0166, 0.015, 2, 0.040, 1),
    (0.6495, 0.046, 1, 0.0166, 0.015, 2, 0.040, -1),
    (0.6826, -0.046, -1, 0.0166, 0.015, 2, 0.040, -1),
    (0.9542, 0.010, 1, 0.0116, 0.010, 2, 0.023, -1),
]

# --- DP1 detail (ESTIMATE, see the header)
SEGMENTS = 96
NACELLE_SEGMENTS = 48
SUBDIVIDE = 6
NACELLE_SUBDIVIDE = 4
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
FLAPS = ((0.075, 0.30, 0.72), (0.385, 0.62, 0.72))
AILERON = (0.72, 0.965, 0.76)
ELEVATOR = (0.06, 0.96, 0.70)
RUDDER = (0.04, 0.94, 0.68)
COWL_LIP = 0.003
EXHAUSTS = dict(count=3, dx=0.050, r=0.045, length=0.32, from_deg=98.0, to_deg=135.0)
INSIGNIA = dict(wing_d=2.0, wing_z=10.75, wing_chord=0.42, side_d=1.6, side_at=0.78)
BLADE_SECTIONS = [(0.13, 0.9, 44.0), (0.35, 1.05, 34.0), (0.6, 1.0, 26.0), (0.85, 0.8, 20.0), (1.0, 0.45, 17.0)]
BAR = 0.018
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    return (NOSE_X - f) * L


def _at(refined, x):
    """(half-width, half-height, center y, exponent) of a refined loft at x, linear between rings."""
    i = next(k for k in range(len(refined) - 1) if refined[k][0] <= x <= refined[k + 1][0])
    t = (x - refined[i][0]) / (refined[i + 1][0] - refined[i][0])
    return tuple(refined[i][c] + (refined[i + 1][c] - refined[i][c]) * t for c in (1, 2, 3, 4))


def _stations(rows):
    return [(X(r[0]), r[1] * L, r[2] * L, r[3] * L, *r[4:]) for r in rows]


_FUS, _ = kit._refine(_stations(FUSELAGE), SUBDIVIDE)
_NOSE, _ = kit._refine(_stations(NOSE), SUBDIVIDE)
_DECK, _ = kit._refine([(X(f), w * L, h * L, y * L, 2.2) for f, w, h, y in DECK], 4)
_TAILC, _ = kit._refine([(X(f), w * L, h * L, y * L, 2.2) for f, w, h, y in TAIL_CANOPY], 4)


def fus_section(f):
    return _at(_FUS, X(f))


def ring_point(refined, f, angle_deg, off=0.0, cz=0.0):
    """A point on a loft's skin at f of LENGTH aft of the nose, ring angle (0 = top, 90 = side), `off` m proud."""
    x = X(f)
    hw, hh, cy, n = _at(refined, x)
    t = math.radians(angle_deg)
    c, s = math.cos(t), math.sin(t)
    return (x, cy + (hh + off) * math.copysign(abs(c) ** (2 / n), c), cz + (hw + off) * math.copysign(abs(s) ** (2 / n), s))


def hoops(refined, fs, bar=BAR, segments=48, cz=0.0, role=METAL):
    for f in fs:
        x = X(f)
        hw, hh, cy, n = _at(refined, x)
        m.fuselage(role, [(x - bar / 2, hw + bar, hh + bar, cy, n), (x + bar / 2, hw + bar, hh + bar, cy, n)], segments, cz)


def mullions(refined, fs, angles, r=0.022):
    for a in angles:
        pts = [ring_point(refined, f, a) for f in fs]
        for p0, p1 in zip(pts, pts[1:]):
            m.strut(METAL, p0, p1, r, sides=4)


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
le_x = 0.25 * root_chord
tan_sw, tan_di = math.tan(math.radians(SWEEP_DEG)), math.tan(math.radians(DIHEDRAL_DEG))


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def wing_le(z):
    return le_x - abs(z) * tan_sw


def wing_y(z):
    return WING_Y * L + abs(z) * tan_di


def wing_thick(z):
    return ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * abs(z) / (S / 2)


def nacelle_y(z):
    return WING_Y * L + abs(z) * tan_di - NACELLE['below'] * L


# A cowling lip: the cowl face rolls in through an added station before the last authored one.
nacelle_stations = list(NACELLE['stations'])
nacelle_stations = nacelle_stations[:-1] + [(nacelle_stations[-1][0] - COWL_LIP / 2, 0.0175), nacelle_stations[-1]]
props = sorted(side * f * S for f in ENGINES for side in (-1, 1))


def nacelle_loft(z):
    le, ny = wing_le(z), nacelle_y(z)
    return [(le + dx * L, w * L, 1.05 * w * L, ny, 2.2) for dx, w in nacelle_stations]


_NAC, _ = kit._refine(nacelle_loft(props[0]), NACELLE_SUBDIVIDE)


def nac_section(z, dx):
    """(half-width, half-height, exponent) of the nacelle at wing station z, dx of LENGTH from the leading edge."""
    hw, hh, _cy, n = _at(_NAC, wing_le(props[0]) + dx * L)
    return hw, hh, n


def nac_point(z, dx, angle_deg, off=0.0):
    hw, hh, n = nac_section(z, dx)
    cy = nacelle_y(z)
    t = math.radians(angle_deg)
    c, s = math.cos(t), math.sin(t)
    return (wing_le(z) + dx * L, cy + (hh + off) * math.copysign(abs(c) ** (2 / n), c), z + (hw + off) * math.copysign(abs(s) ** (2 / n), s))


# --- Fuselage, nose glazing, flight deck, tail gunner's canopy, blisters
with m.tagged('fuselage'), m.shared_chart():
    m.fuselage(METAL, _stations(FUSELAGE), segments=SEGMENTS, subdivide=SUBDIVIDE)
    # Wing-root fairings, upper and lower, either side: ellipsoids straddling the wing's surface at the fuselage.
    fmid = (le_x - 0.5 * root_chord) / L
    z_root = fus_section(NOSE_X - (le_x - 0.5 * root_chord) / L)[0]
    for side in (-1, 1):
        for sgn in (1, -1):
            yc = wing_y(0.0) + sgn * 0.5 * wing_thick(0.0) * 0.92
            f_le, f_te = NOSE_X - le_x / L, NOSE_X - (le_x - root_chord) / L
            f_mid = (f_le + f_te) / 2
            rings = [(X(f_te) + 0.3, 0.05, 0.05, yc, 2.0), (X(f_mid), 0.26, 0.24, yc, 2.0), (X(f_le) - 0.2, 0.05, 0.05, yc, 2.0)]
            rings.sort(key=lambda r: r[0])
            m.fuselage(METAL, rings, segments=24, center_z=side * (0.048 * L + 0.03), subdivide=4)
with m.tagged('nose'), m.shared_chart():
    m.fuselage('glazing', _stations(NOSE), segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=METAL)
    hoops(_NOSE, NOSE_HOOPS)
    m.fuselage(METAL, [(X(0.129) - 0.02, 0.0495 * L + 0.03, 0.0505 * L + 0.03, 0.0, 2.0), (X(0.129) + 0.06, 0.0495 * L + 0.03, 0.0505 * L + 0.03, 0.0, 2.0)], SEGMENTS)
    mullions(_NOSE, NOSE_MULLION_F, NOSE_MULLIONS)
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', METAL, [(X(f), w * L, h * L, y * L) for f, w, h, y in DECK], [X(f) for f in DECK_HOOPS],
             bar=BAR, segments=48, subdivide=4)
    mullions(_DECK, tuple(f for f in (0.128, 0.115, 0.100, 0.085, 0.070, 0.058)), DECK_MULLIONS, r=0.02)
    m.canopy('glazing', METAL, [(X(f), w * L, h * L, y * L) for f, w, h, y in TAIL_CANOPY], [X(f) for f in TAIL_HOOPS],
             bar=BAR, segments=32, subdivide=4)
with m.tagged('blister'), m.shared_chart():
    # Waist sighting blisters: a glazed dome on each fuselage side, its center 0.15 m inside the skin.
    for side in (-1, 1):
        cz = side * (0.048 * L - 0.15)
        x0, x1 = X(0.575), X(0.545)
        xm = (x0 + x1) / 2
        m.fuselage('glazing', [(x0, 0.05, 0.06, 0.0), (x0 * 0.7 + xm * 0.3, 0.26, 0.32, 0.0), (xm, 0.30, 0.38, 0.0), (x1 * 0.7 + xm * 0.3, 0.26, 0.32, 0.0), (x1, 0.05, 0.06, 0.0)],
                   segments=24, center_z=cz, subdivide=3)
        m.fuselage(METAL, [(x0 - 0.02, 0.32, 0.44, 0.0), (x0 + 0.02, 0.32, 0.44, 0.0)], 24, cz + side * 0.02)
        m.fuselage(METAL, [(x1 - 0.02, 0.32, 0.44, 0.0), (x1 + 0.02, 0.32, 0.44, 0.0)], 24, cz + side * 0.02)

# --- Lifting surfaces
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in zip((*FLAPS, AILERON), ('Flap1', 'Flap2', 'Aileron'))]
breaks = [0.0, ENGINES[0] * S, ENGINES[1] * S, S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = chord_at(z0), chord_at(z1)
        a0, a1 = wing_thick(z0), wing_thick(z1)
        m.wing(METAL, le_x - z0 * tan_sw, WING_Y * L + z0 * tan_di, c0, c1, 2 * z1, sweep_deg=SWEEP_DEG,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
tp = TAILPLANE
tp_half = tp['span'] * S / 2
with m.tagged('tailplane'), m.shared_chart():
    m.wing(METAL, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
           sweep_deg=tp['sweep'], thickness=0.10, stations=STATIONS, span_segments=SPAN_SEGMENTS,
           controls=[(ELEVATOR[0] * tp_half, ELEVATOR[1] * tp_half, ELEVATOR[2], 'Elevator')])
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root
with m.tagged('fin'), m.shared_chart():
    m.fin(METAL, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
          sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), stations=STATIONS, span_segments=SPAN_SEGMENTS,
          controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2], 'Rudder')])

# --- Nacelles: cowl, cowl-flap band, chin scoop, turbosupercharger housing and bucket, exhaust stacks, propeller
pr = PROP
for i, z in enumerate(props, start=1):
    le, ny = wing_le(z), nacelle_y(z)
    with m.tagged('nacelle'), m.shared_chart():
        m.fuselage(METAL, nacelle_loft(z), segments=NACELLE_SEGMENTS, subdivide=NACELLE_SUBDIVIDE, center_z=z)
        # Cowl-flap band: a hoop proud of the cowl by 0.02 m.
        d0, d1 = 0.034, 0.050
        s0, s1 = nac_section(z, d0), nac_section(z, d1)
        m.fuselage('dark', [(le + d0 * L, s0[0] + 0.02, s0[1] + 0.02, ny), (le + d1 * L, s1[0] + 0.02, s1[1] + 0.02, ny)], segments=NACELLE_SEGMENTS, center_z=z)
        # Dark engine face inside the cowl opening.
        m.revolve('dark', (le + 0.1068 * L, ny, z), (1.0, 0.0, 0.0), [(0.0, 0.0175 * L - 0.02), (0.05, 0.0165 * L - 0.02)], 24)
        # Chin intercooler / oil-cooler scoop: a boxy loft under the cowl, its top 0.10 m inside it, and a dark opening.
        sc = [(0.030, 0.10, 0.10), (0.052, 0.34, 0.20), (0.086, 0.36, 0.20), (0.100, 0.30, 0.16)]
        chin = []
        for dx, hw_, hh_ in sc:
            hwn, hhn, nn = nac_section(z, dx)
            chin.append((le + dx * L, hw_, hh_, ny - hhn * 0.93 - hh_ + 0.12, 3.0))
        m.fuselage(METAL, chin, segments=24, subdivide=3, center_z=z)
        xf = chin[-1][0]
        m.fuselage('dark', [(xf - 0.02, 0.27, 0.13, chin[-1][3]), (xf + 0.012, 0.27, 0.13, chin[-1][3])], segments=24, center_z=z)
        # Turbosupercharger housing under the aft nacelle, and its waste-gate bucket.
        tb = [(-0.150, 0.12, 0.08), (-0.130, 0.30, 0.22), (-0.108, 0.38, 0.26), (-0.086, 0.30, 0.20), (-0.070, 0.12, 0.08)]
        turbo = []
        for dx, hw_, hh_ in tb:
            hwn, hhn, nn = nac_section(z, dx)
            turbo.append((le + dx * L, hw_, hh_, ny - hhn * 0.80 - hh_ * 0.35, 2.2))
        m.fuselage(METAL, turbo, segments=24, subdivide=3, center_z=z)
        bx, by = le + -0.108 * L, turbo[2][3] - turbo[2][2] + 0.10
        m.revolve('dark', (bx, by, z), (0.0, -1.0, 0.0), [(0.0, 0.24), (0.16, 0.24)], 20)
        # Exhaust stacks: EXHAUSTS['count'] a side, short tubes from 0.05 m inside the cowl, raked aft and out.
        e = EXHAUSTS
        for side in (-1, 1):
            for k in range(e['count']):
                a = e['from_deg'] + (e['to_deg'] - e['from_deg']) * k / (e['count'] - 1)
                px, py, pz = nac_point(z, e['dx'], a)
                pz = z + side * (pz - z)
                dz, dy = pz - z, py - ny
                nrm = math.hypot(dz, dy)
                ox, oy = dz / nrm, dy / nrm
                m.revolve('dark', (px, py - 0.04 * oy, pz - 0.04 * ox), (-1.0, 0.7 * oy, 0.7 * ox), [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 10)
    with m.tagged('prop'), m.shared_chart():
        m.propeller('dark', (le + pr['ahead'] * L, ny, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                    pr['spinner_len'] * L, node=f'Prop{i}', blade_sections=BLADE_SECTIONS)


def wheel_leg(hinge, length, wheel_r, wheel_w, node, twin=True):
    """A strut down to an axle with one or two wheels; the lowest wheel point is `length` below the hinge."""
    hx, hy, hz = hinge
    axle_y = hy - length + wheel_r
    strut_r = 0.16 * wheel_r
    m.revolve('dark', (hx, hy, hz), (0.0, -1.0, 0.0), [(0.0, strut_r), (hy - axle_y, strut_r)], 12, node)
    if twin:
        each = 0.44 * wheel_w
        offs = (-0.56 * wheel_w, 0.56 * wheel_w)
    else:
        each, offs = wheel_w, (0.0,)
    for o in offs:
        m.revolve('dark', (hx, axle_y, hz + o - each / 2), (0.0, 0.0, 1.0), [(0.0, wheel_r), (each, wheel_r)], 24, node)
        m.revolve('dark', (hx, axle_y, hz + o - each / 2 - EMBED_M), (0.0, 0.0, 1.0), [(0.0, 0.42 * wheel_r), (each + 2 * EMBED_M, 0.42 * wheel_r)], 16, node)
    if twin:
        m.revolve('dark', (hx, axle_y, hz - 0.56 * wheel_w), (0.0, 0.0, 1.0), [(0.0, 0.14 * wheel_r), (1.12 * wheel_w, 0.14 * wheel_r)], 8, node)


# --- Landing gear
g = GEAR
main_hinge_y = nacelle_y(ENGINES[0] * S) - g['below'] * L
ground_y = main_hinge_y - g['length'] * L
hinge = {}
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        z = side * ENGINES[0] * S
        hinge[name] = (wing_le(z) + g['ahead'] * L, main_hinge_y, z)
        wheel_leg(hinge[name], g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L, name)
    ng = NOSE_GEAR
    nose_hinge = (X(ng['at']), ng['y'] * L, 0.0)
    wheel_leg(nose_hinge, ng['y'] * L - ground_y, ng['wheel_r'] * L, ng['wheel_w'] * L, 'GearNose')
with m.tagged('fittings'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        hx, hy, hz = hinge[name]
        gw = g['wheel_w'] * L
        # Two door panels flanking the leg (tops inside the nacelle), a leg cover aft, and a drag brace forward.
        for dz, hgt in ((gw / 2 + 0.16, 1.5), (-(gw / 2 + 0.16), 1.5)):
            m.box('dark', (hx, hy - hgt + 0.30, hz + dz), (0.55, hgt, 0.03), node=name)
        m.box('dark', (hx - 0.32, hy - 1.7, hz), (0.22, 1.9, 0.05), node=name)
        m.strut('dark', (hx + 0.02, hy - 0.10, hz), (hx + 0.55, hy - 1.7, hz), 0.035, sides=6, node=name)
    nx, ny_, nz = nose_hinge
    nw = ng['wheel_w'] * L
    for side in (-1, 1):
        m.box('dark', (nx, ny_ - 1.1, nz + side * (nw + 0.16)), (0.45, 1.3, 0.03), node='GearNose')
    m.strut('dark', (nx + 0.02, ny_ - 0.10, 0.0), (nx + 0.45, ny_ - 1.3, 0.0), 0.028, sides=6, node='GearNose')

# --- Turrets: gun_turret domes, a base ring and a sight bulge on each (one role per node: all naturalMetal)
with m.tagged('turret'), m.shared_chart():
    for i, (at, y, up, radius, height, barrels, barrel, facing) in enumerate(TURRETS, start=1):
        c = (X(at), y * L, 0.0)
        m.gun_turret(METAL, i, c, radius * L, height * L, up=up, barrels=barrels, barrel_length=barrel * L, facing=facing)
        rr = radius * L
        m.revolve(METAL, (c[0], c[1] - up * 0.10, c[2]), (0.0, float(up), 0.0), [(0.0, 1.10 * rr), (0.16, 1.10 * rr)], 16, f'Turret{i}')
        m.revolve(METAL, (c[0] + facing * 0.40 * rr, c[1] + up * 0.38 * height * L, c[2]), (float(facing), 0.0, 0.0), [(0.0, 0.34 * rr), (0.34 * rr, 0.20 * rr)], 12, f'Turret{i}')

# --- Small fittings
with m.tagged('fittings'), m.shared_chart():
    pz = -10.5
    m.strut('dark', (wing_le(pz) - 0.10, wing_y(pz), pz), (wing_le(pz) + 0.60, wing_y(pz), pz), 0.012, sides=6)
    top = fus_section(0.34)
    m.strut('dark', (X(0.34), top[2] + top[1] - 0.05, 0.0), (X(0.36), top[2] + top[1] + 0.85, 0.0), 0.018, 0.009, sides=6)
    m.strut('dark', (X(0.30), -top[1] + 0.05, 0.0), (X(0.32), -top[1] - 0.80, 0.0), 0.016, 0.008, sides=6)


def star(r_out):
    r_in = 0.382 * r_out
    return [((r_out if k % 2 == 0 else r_in) * math.sin(k * math.pi / 5), (r_out if k % 2 == 0 else r_in) * math.cos(k * math.pi / 5)) for k in range(10)]


def rect(u0, u1, v0, v1):
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def roundel(tag, center, axis, uDir, d):
    """The 1943 star-and-bar (ESTIMATE geometry, header): blue outline, white bars, blue disc, white star."""
    o = 0.125 * d
    common = dict(tags=[tag], origin=center, axis=axis, uDir=uDir)
    m.marking('polygon', points=rect(-(d + o), d + o, -(0.165 * d + o), 0.165 * d + o), color='usaaInsigniaBlue', **common)
    for sgn in (-1, 1):
        u0, u1 = sorted((sgn * 0.35 * d, sgn * d))
        m.marking('polygon', points=rect(u0, u1, -0.165 * d, 0.165 * d), color='usaaInsigniaWhite', **common)
    m.marking('disc', tags=[tag], center=center, axis=axis, radiusM=0.5 * d, color='usaaInsigniaBlue')
    m.marking('polygon', points=star(0.40 * d), color='usaaInsigniaWhite', **common)


# --- Markings (ESTIMATE, see the header). On a wing surface the bars run spanwise and the star's apex points forward.
ins = INSIGNIA
for side in (-1, 1):
    z = side * ins['wing_z']
    x = wing_le(z) - ins['wing_chord'] * chord_at(z)
    roundel('wing', (x, wing_y(z), z), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), ins['wing_d'])
    roundel('wing', (x, wing_y(z), z), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0), ins['wing_d'])
    hw, hh, cy, n = fus_section(ins['side_at'])
    zs = hw * max(0.0, 1.0 - abs((0.0 - cy) / hh) ** n) ** (1.0 / n)
    roundel('fuselage', (X(ins['side_at']), 0.0, side * zs), (0.0, 0.0, float(side)), (1.0, 0.0, 0.0) if side > 0 else (-1.0, 0.0, 0.0), ins['side_d'])
    # Exhaust soot streaks aft of the stacks on each nacelle's outer side. v = axis x uDir = -side * y.
    for zc in props:
        sd = side
        px, py, pz_ = nac_point(zc, EXHAUSTS['dx'], 90.0)
        pz_ = zc + sd * (pz_ - zc)
        streak = [(-0.3, -0.22), (1.6, -0.40), (1.6, 0.14), (-0.3, 0.22)]
        m.marking('polygon', tags=['nacelle'], origin=(px, py - 0.10, pz_), axis=(0.0, 0.0, float(sd)), uDir=(-1.0, 0.0, 0.0),
                  points=[(u, -sd * v) for u, v in streak], color='exhaustSoot', effect='stain', opacity=0.5, featherM=0.15)
# Walkway wear on the left wing root, where the crew climbed onto the wing (ESTIMATE).
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-2.6) + 0.4, -2.6), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-1.0, -0.30), (1.0, -0.30), (1.0, 0.40), (-1.0, 0.40)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
# Landing light: a lens on the left wing's leading edge (ESTIMATE position).
m.marking('disc', tags=['wing'], center=(wing_le(-11.0) - 0.02, wing_y(-11.0), -11.0), axis=(1.0, 0.0, 0.0), radiusM=0.14, color='lensClear')
m.export(out)
