# tools/models/blender/f4f-wildcat-blender.py
"""Grumman F4F-4 Wildcat. Original work, AGPL-3.0-or-later.

A second Wildcat beside the Sketchfab download (content/aircraft/wildcat.glb stays; the game still stretches its
legs and draws its split flaps in code, src/render/scene/wildcat.ts), built on the Hellcat duplicate's
single-engine template (f6f-hellcat-blender.py). Compare the two in the Hangar and swap this one in when approved
(docs/blender-aircraft.md, "Promoting a duplicate"). Stations are fractions of the cited length or span, except the
ones fitted to content/aircraft/f4f-wildcat.json (the stance and the wing height) so that a swap needs no
flight-model change; those say so.

Figures (read 2026-10-11):
  span 11.58 m (38 ft 0 in), length 8.76 m (28 ft 9 in), wing area 24.15 m2 (260 sq ft), airfoil NACA 23015 root /
    NACA 23009 tip, 3-bladed constant-speed propeller   CITED, English Wikipedia "Grumman F4F Wildcat",
                                                        Specifications (the page's table is the F4F-3's; the F4F-4
                                                        differs in armament and the folding wing, not in these)
  six .50 in wing guns, three a side                    CITED, same page (the F4F-4)
  ailerons 65.5 to 92.5 percent of the semispan, hinge at 77.2 percent chord
                                                        CITED, the F4F-3's, NACA ACR, Kleckner 1942, as ASSETS.md
                                                        records for the download's own cut
  tailwheel fixed (not rigged, as the TBM's)            ESTIMATE
  main gear hand-cranked, retracting up into the fuselage sides
                                                        CITED, same page (the F3F-derived gear); the model folds
                                                        the leg inboard into the hull, one hinge, ESTIMATE
  propeller diameter 3.2 m (10 ft 6 in)                 ESTIMATE (the sources read are silent)
  taper 0.55, an unswept quarter chord, dihedral 4 deg  ESTIMATE, period three-view proportions
  fuselage sections, the low canopy, tail surfaces      ESTIMATE (the station table below)
  main wheels 0.66 m diameter, track 1.6 m              ESTIMATE
  stance: wheels 2.3952 m below the origin at x 0.413, tailwheel at x -4.627, 1.293 m below; wing center
    -0.54 m at z 2.66                                   FITTED to f4f-wildcat.json gear.heightM / mainX /
                                                        thirdX / thirdHeightM and combat.guns, so a swap leaves
                                                        the sim alone
  upper surfaces non-specular blue-gray over light gray undersides (the Navy's 1941-43 scheme; roles blueGray,
    underside)                                          ESTIMATE (no chip read)
  1943 star-and-bar insignia (blue outline): both fuselage sides, upper left and lower right wing
                                                        ESTIMATE positions and sizes (the Navy's wing rule; the
                                                        F4F-4 first wore the 1942 star without bars)
  control surfaces, exhausts, pitot, antenna mast, leg covers
                                                        ESTIMATE, period three-view proportions
  additions sink at least 0.02 m into what they sit on  modeling choice: no coplanar faces (DP0)
Frame: glTF, +x forward, +y up, +z right, meters. Origin: the wing root's quarter chord on the thrust line,
standing in for the CG (ESTIMATE). Pose: gear down, thrust line level.
Leaves out: the cockpit interior, the wing fold, the arrester hook, split-flap plates (the flap is a plain hinged
panel), stores (measured on the wing by `npm run models:mounts`), unit markings.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'f4f'
# --- CITED
SPAN = 11.58
LENGTH = 8.76
WING_AREA = 24.15
BLADES = 3
ROOT_T, TIP_T = 0.15, 0.09
# --- ESTIMATE
PROP_DIAMETER = 3.2
TAPER = 0.55
DIHEDRAL_DEG = 4.0
ROOT_Y = -0.72                # m, wing root chord line below the thrust line (FITTED: center -0.54 at z 2.66)
UPPER, LOWER = 'blueGray', 'underside'
NOSE_X = 0.30                 # spinner tip ahead of the origin, of LENGTH
FUSELAGE = [
    (1.000, 0.002, 0.007, 0.016, 2.0),
    (0.939, 0.008, 0.015, 0.015, 2.0),
    (0.859, 0.019, 0.030, 0.007, 2.1),
    (0.768, 0.032, 0.045, 0.001, 2.2),
    (0.665, 0.043, 0.055, -0.004, 2.3),
    (0.574, 0.050, 0.064, -0.009, 2.3),
    (0.483, 0.057, 0.070, -0.013, 2.3),
    (0.368, 0.064, 0.073, -0.011, 2.3),
    (0.254, 0.071, 0.075, -0.007, 2.2),
    (0.186, 0.074, 0.075, -0.002, 2.1),
    (0.117, 0.075, 0.075, 0.000, 2.0),
    (0.072, 0.074, 0.074, 0.001, 2.0),
    (0.043, 0.068, 0.067, 0.001, 2.0),
    (0.026, 0.055, 0.054, 0.001, 2.0),
    (0.017, 0.037, 0.035, 0.001, 2.0),
]
# The glass, read off the download's canopy node (x, half-width, crown y; tail to nose, meters, 2026-10-11): a raked
# windscreen, the crown over the eye, a long taper aft into the deck. `base` sinks into the deck.
CANOPY = [(-2.35, 0.1, 0.5), (-2.1, 0.28, 0.58), (-1.8, 0.35, 0.62), (-1.5, 0.36, 0.61), (-1.2, 0.3, 0.56), (-0.95, 0.18, 0.49)]
CANOPY_BASE = 0.42
CANOPY_FRAMES = (-1.9, -1.6, -1.3)
TAILPLANE = dict(span=0.37, le=0.862, root=0.131, taper=0.50, y=0.026, sweep=5.0)   # span of SPAN; the rest of LENGTH
FIN = dict(root=0.160, taper=0.45, height=0.115, y=0.022)                           # trailing edge at the tail
PROP = dict(hub=0.032, chord=0.024, spinner_r=0.028, spinner_len=0.043)             # hub = 0.75 x spinner_len
# x, z, wheel in m; the stance is FITTED (header): the wheel bottom lands on gear.heightM below the origin.
GEAR = dict(x=0.413, z=0.80, y=-0.64, bottom=2.3952, wheel_r=0.33, wheel_w=0.20)
TAILWHEEL = dict(x=-4.627, y=-0.10, bottom=1.293, wheel_r=0.12, wheel_w=0.07)       # x, hinge y, bottom: m

SEGMENTS = 96
SUBDIVIDE = 6
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.655, 0.925, 0.772)  # half-span fractions, hinge chord fraction (CITED)
FLAP = (0.10, 0.62, 0.74)
ELEVATOR = (0.08, 0.97, 0.68)
RUDDER = (0.05, 0.93, 0.62)
EXHAUSTS = dict(count=2, x0=0.160, x1=0.190, y=-0.032, r=0.030, length=0.20)
FILLET = dict(le=0.22, te=0.46, half_w=0.020, half_h=0.015)
INSIGNIA = dict(fus_at=0.690, fus_d=0.90, wing_z=0.66, wing_chord=0.42, wing_d=1.25)
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
    return ROOT_Y + abs(z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=LOWER)
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = ROOT_Y + 0.35 * ROOT_T * root_chord - FILLET['half_h'] * L
    fz = fus_side_z(mid, fy) + FILLET['half_w'] * L - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, ROOT_Y),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, ROOT_Y)],
                   segments=24, center_z=side * fz, lower_role=LOWER, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER, [(x, w, (t - CANOPY_BASE) / 2, (t + CANOPY_BASE) / 2) for x, w, t in CANOPY], list(CANOPY_FRAMES),
             bar=0.022, segments=48, subdivide=4)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
gear_z = GEAR['z']
breaks = [0.0, S / 4, S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = (root_chord + (tip_chord - root_chord) * z / (S / 2) for z in (z0, z1))
        a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
        m.wing(UPPER, 0.25 * root_chord - z0 * tan_sw, ROOT_Y + z0 * tan_di, c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls, lower_role=LOWER)
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
                blade_sections=[(0.13, 0.9, 44.0), (0.35, 1.05, 33.0), (0.6, 1.0, 25.0), (0.85, 0.8, 19.0), (1.0, 0.5, 16.0)])
g = GEAR
hinge_y = g['y']
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], hinge_y, side * gear_z), g['bottom'] + hinge_y, g['wheel_r'], g['wheel_w'], node=name)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.04)
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        # Leg cover on the inboard face of the strut (the legs fold inboard), its face EMBED_M inside it.
        m.box('dark', (g['x'], hinge_y - 0.55 * (g['bottom'] + hinge_y), side * (gear_z - strut_r + EMBED_M - 0.006)), (0.40, 0.90, 0.012), node=name)
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
        for gz in (2.66, 3.02, 3.37):
            gz *= side
            m.gun_barrel('dark', (le_x(gz) - 0.35, wing_y(gz), gz), 0.0, 0.0, 0.50, 0.016)
    pz = -5.2
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.40, wing_y(pz), pz), 0.009, sides=6)
    # Antenna mast aft of the canopy, raked aft.
    m.strut('dark', (X(0.62), fus_top_y(0.62, 0.0) - 0.04, 0.0), (X(0.64), fus_top_y(0.62, 0.0) + 0.40, 0.0), 0.014, 0.007, sides=6)


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
