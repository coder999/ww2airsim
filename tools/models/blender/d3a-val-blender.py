# tools/models/blender/d3a-val-blender.py
"""Aichi D3A2 Model 22 "Val". Original work, AGPL-3.0-or-later.

A Hangar-only duplicate beside the downloaded d3a-val.glb. Built on the B5N2/TBM single-engine, two-seat
procedural pattern, with fixed spatted gear and the rear flexible gun. Every figure is tagged below.

Figures (read 2026-10-11, English Wikipedia "Aichi D3A", Specifications (D3A2 Model 22), citing
Francillon, Japanese Aircraft of the Pacific War, 1979, pp. 271-276):
  span 14.365 m, length 10.195 m, wing area 34.9 m2      CITED
  airfoil                                                ESTIMATE: Wikipedia's Specifications airfoil field is blank;
                                                         NACA 23015 root / 23009 tip is the nearby F6F/TBM procedural
                                                         section used here, not a claim about the real D3A
  3-blade metal constant-speed propeller                 CITED (blade count and type)
  propeller diameter 3.20 m                              ESTIMATE: Wikipedia's Specifications diameter field is blank;
                                                         scaled from the Commons drawing's prop disc
  armament: two forward 7.7 mm Type 97 guns in the upper decking and one flexible rear-cockpit
  7.7 mm Type 92                                        CITED; forward barrels and Turret1 are drawn
  one 250 kg fuselage bomb and two 60 kg wing bombs      CITED; attachment remains spec data, not model geometry
  fixed cantilever spatted mains and fixed tailwheel     CITED as fixed gear in the existing sourced d3a-val spec;
                                                         the exact spat and wheel shapes are ESTIMATES
  stance: main wheel bottoms 1.850 m below the origin at x 0.257; tail contact x -6.577, 0.457 m below
                                                         FITTED to content/aircraft/d3a-val.json gear.heightM /
                                                         mainX / thirdX / thirdHeightM, so a swap needs no flight-model change
  proposed real-cockpit eye (-1.75, 1.03) m              MEASURED from the drawing; the existing spec's (-0.8, 0.75)
                                                         was fitted to the downloaded canopy
  control surfaces, dive-brake panels, cowl/exhaust, pitot, antenna mast, markings and colors
                                                         ESTIMATE except their drawing-measured positions below
  IJN dark green over gray-green undersides; six white-bordered hinomaru
                                                         ESTIMATE scheme, positions and sizes (no paint chip read)
  additions sink at least 0.02 m into what they sit on   modeling choice: no coplanar faces (DP0)

REAL-AIRPLANE MEASUREMENT (2026-10-11): Wikimedia Commons "Aichi D3A1 Val.svg", linked from the
English article's image list and fetched through Special:FilePath at width 1600 (returned 1920 x 2447).
It is explicitly a D3A1 drawing; no D3A2 three-view was present in Commons' Aichi D3A file list. The
D3A1 and cited D3A2 share the 10.195 m published length used to scale it, but cowling details are a
variant limitation. Each view was scaled separately by spinner-tip-to-tail pixels. Side-view stations
below are meters aft of the spinner tip and meters above/below the propeller axis. Top-view half-widths
are independent measurements. The wing chord at 30% semispan measured 1.83-4.73 m aft of the nose, so
its quarter chord is 2.55 m aft of the spinner tip: that is the model origin. The wing, tailplane, fin,
canopy and fuselage stations follow those lines; a rendered centerline silhouette was overlaid on the
drawing after the first build (docs/handoff/2026-10-11-d3a-val-blender.md).

GEOMETRY RECHECK (2026-10-11): the side drawing's wing hides the true belly between 2.18 and
3.74 m aft of the nose. The first model accidentally treated the visible wing/fuselage seam there
as the belly and also treated the windscreen outline at 3.51 m as fuselage deck. Those ordinates are
corrected below: visible drawing outline owns the cowl/deck and both ends of the hidden run; a smooth
belly through the hidden run is ESTIMATE, checked against the exact-variant D3A2 survivor, c/n 3179,
in Alan Wilson's Wikimedia Commons photograph "Aichi D3A2 model 22 'Val' (3179 - N3131G)", and three
period SDASM archive photographs (Commons "Aichi D3A Type 99", "... 2" and "... 3"). The survivor
also shows the greenhouse rails buried in the broad upper fuselage. The period photographs show a
short exposed fixed-leg/root fairing between each spat and wing; widths and brace diameters remain
ESTIMATE because no dimensioned D3A2 gear installation drawing was found.

Side fuselage top/bottom (m aft nose: top, bottom), DRAWING-MEASURED except the explicitly hidden
belly run: 0.18:+0.20/-0.20, 0.54:+0.88/-0.84, 0.86:+0.82/-0.88,
1.39:+0.85/-0.92, 1.92:+0.85/-0.94, 2.18:+0.88/-0.82, 2.45:+0.84/-0.72,
2.96:+0.78/-0.58, 3.51:+0.74/-0.50, 3.74:+0.72/-0.48
(2.18-3.74 bottoms ESTIMATE: wing-occluded), 4.52:+0.70/-0.40, 5.29:+0.70/-0.38,
6.17:+0.70/-0.36, 6.84:+0.78/-0.34, 7.62:+0.72/-0.32, 8.39:+0.61/-0.30,
8.82:+0.55/-0.28, 9.17:+0.50/-0.25, 9.88:+0.30/-0.18, 10.19:+0.02/-0.02.
Top-view half-widths (m aft nose: half-width), MEASURED:
0.63:0.58, 1.41:0.58, 2.18:0.56, 2.96:0.44, 3.74:0.43, 4.52:0.42,
5.29:0.42, 6.07:0.41, 6.84:0.38, 7.62:0.34, 8.39:0.28, 9.17:0.20,
9.94:0.08, 10.19:0.01. Canopy: windscreen front 3.51 m, crown 4.05-5.11 m at 1.31-1.25 m,
rear 6.70 m; fin begins 7.6 m; tailplane leading edge about 8.3 m. MEASURED.

Frame: glTF, +x forward, +y up, +z right, meters. Origin: drawing-measured wing quarter chord at
30% semispan, on the thrust line. Pose: fixed gear down, thrust line level.
Leaves out: cockpit interior, bomb trapeze/racks/stores, wing-fold detail and tail codes. The dive brakes
are static perforated-looking panels because the renderer has no dive-brake input or part-name contract.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'd3a2'
# --- CITED
SPAN = 14.365
LENGTH = 10.195
WING_AREA = 34.9
BLADES = 3
ROOT_T, TIP_T = 0.15, 0.09       # ESTIMATE: Wikipedia gives no airfoil
HINOMARU_BORDER_M = 0.075     # the Ki-84's cited border
# --- ESTIMATE
PROP_DIAMETER = 3.2
DIHEDRAL_DEG = 4.5
UPPER, LOWER = 'ijaGreen', 'underside'
NOSE_M = 2.55                    # MEASURED: spinner tip to the wing quarter chord at 30% semispan
NOSE_X = NOSE_M / LENGTH
WING_Y = -0.018                  # ESTIMATE: puts the low-wing section through the drawing
# (distance aft nose, half-width, top, bottom, exponent), tail to nose after conversion below; meters.
# The 2.18-3.74 m bottoms are the photo-constrained estimate documented above, not drawing lines.
FUSELAGE_M = [
    (10.19, 0.01, 0.02, -0.02, 2.0), (9.88, 0.08, 0.30, -0.18, 2.0),
    (9.17, 0.20, 0.50, -0.25, 2.1), (8.82, 0.24, 0.55, -0.28, 2.1),
    (8.39, 0.28, 0.61, -0.30, 2.2), (7.62, 0.34, 0.72, -0.32, 2.2),
    (6.84, 0.38, 0.78, -0.34, 2.4), (6.17, 0.41, 0.70, -0.36, 2.6),
    (5.29, 0.42, 0.70, -0.38, 2.8), (4.52, 0.42, 0.70, -0.40, 2.8),
    (3.74, 0.43, 0.72, -0.48, 2.8), (3.51, 0.44, 0.74, -0.50, 2.8),
    (2.96, 0.44, 0.78, -0.58, 2.6), (2.45, 0.56, 0.84, -0.72, 2.4),
    (2.18, 0.56, 0.88, -0.82, 2.2), (1.92, 0.58, 0.85, -0.94, 2.1),
    (1.39, 0.58, 0.85, -0.92, 2.0), (0.86, 0.58, 0.82, -0.88, 2.0),
    (0.54, 0.50, 0.88, -0.84, 2.0), (0.18, 0.08, 0.20, -0.20, 2.0),
]
# Explicit fitted greenhouse sections, tail to nose, meters:
# (x, rail half-width, rail y, shoulder half-width, shoulder y, roof half-width, roof y, crown y).
# The rail ordinates sit 0.03-0.12 m inside the local shape-preserved fuselage skin; unlike the first
# four-value canopy, its underside cannot expose a daylight wedge along either side.
CANOPY = [
    (-4.15, 0.08, 0.69, 0.07, 0.75, 0.05, 0.82, 0.86),
    (-3.75, 0.30, 0.50, 0.27, 0.69, 0.18, 0.94, 1.02),
    (-3.10, 0.36, 0.43, 0.32, 0.67, 0.22, 1.09, 1.18),
    (-2.56, 0.38, 0.40, 0.34, 0.68, 0.23, 1.15, 1.25),
    (-1.95, 0.37, 0.42, 0.33, 0.72, 0.22, 1.20, 1.31),
    (-1.35, 0.31, 0.51, 0.28, 0.72, 0.19, 1.09, 1.18),
    (-0.96, 0.16, 0.66, 0.14, 0.78, 0.09, 0.97, 1.02),
]
CANOPY_FRAMES = (-3.72, -3.30, -2.86, -2.42, -1.98, -1.55, -1.20)
TAILPLANE = dict(span=0.37, le=8.30, root=1.72, tip=0.28, y=0.13, sweep=8.0)
FIN = dict(le=7.65, root=2.45, tip=0.40, height=1.92, y=0.42)
PROP = dict(hub=0.28, chord=0.25, spinner_r=0.18, spinner_len=0.28)  # meters; spinner tip is d=0
GEAR = dict(x=0.257, z=1.62, bottom=1.850, wheel_r=0.39, wheel_w=0.20)
TAILWHEEL = dict(x=-6.577, y=-0.10, bottom=0.457, wheel_r=0.12, wheel_w=0.07)
REAR_GUN = dict(x=-3.45, y=0.93, length=0.75)

SEGMENTS = 96
SUBDIVIDE = 4
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.61, 0.84, 0.70)
FLAP1 = (0.13, 0.29, 0.73)
FLAP2 = (0.31, 0.59, 0.73)
ELEVATOR = (0.08, 0.96, 0.66)
RUDDER = (0.08, 0.94, 0.64)
EXHAUSTS = dict(count=4, d0=1.10, d1=1.55, y=-0.35, r=0.030, length=0.20)
HINOMARU = dict(wing_z=0.66, wing_chord=0.48, wing_red=0.58, fus_d=7.15, fus_depth=0.72)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    """A fraction of LENGTH aft of the spinner tip, as glTF x."""
    return (NOSE_X - f) * L


def XD(d):
    """Meters aft of the spinner tip, as glTF x."""
    return NOSE_M - d


FUSELAGE = [(d / L, w / L, (top - bottom) / (2 * L), (top + bottom) / (2 * L), n)
            for d, w, top, bottom, n in FUSELAGE_M]
_FUS, _ = kit._refine_shape([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], SUBDIVIDE)


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
# Drawing-measured elliptical planform, scaled by 0.966 so its piecewise trapezoids total the cited 34.9 m2.
WING_F = (0.0, 0.30, 0.60, 0.85, 1.0)
WING_C = (3.864, 2.898, 2.415, 1.546, 0.097)
WING_QC = (0.07, 0.0, -0.15, -0.34, -0.49)
tan_di = math.tan(math.radians(DIHEDRAL_DEG))


def interp_wing(values, z):
    f = min(1.0, abs(z) / (S / 2))
    i = next((i for i in range(len(WING_F) - 1) if WING_F[i] <= f <= WING_F[i + 1]), len(WING_F) - 2)
    t = (f - WING_F[i]) / (WING_F[i + 1] - WING_F[i])
    return values[i] + t * (values[i + 1] - values[i])


def chord_at(z):
    return interp_wing(WING_C, z)


def le_x(z):
    return interp_wing(WING_QC, z) + 0.25 * chord_at(z)


def wing_y(z):
    return WING_Y * L + abs(z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS,
               subdivide=SUBDIVIDE, lower_role=LOWER, refinement='shape')
with m.tagged('canopy'), m.shared_chart():
    m.faired_canopy('glazing', UPPER, CANOPY, list(CANOPY_FRAMES), bar=0.020)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP1, 'Flap1'), (FLAP2, 'Flap2'), (AILERON, 'Aileron'))]
with m.tagged('wing'), m.shared_chart():
    for f0, f1 in zip(WING_F, WING_F[1:]):
        z0, z1 = f0 * S / 2, f1 * S / 2
        c0, c1 = chord_at(z0), chord_at(z1)
        le0, le1 = le_x(z0), le_x(z1)
        sweep = math.degrees(math.atan((le0 - le1) / (z1 - z0)))
        t0 = ROOT_T + (TIP_T - ROOT_T) * f0
        t1 = ROOT_T + (TIP_T - ROOT_T) * f1
        m.wing(UPPER, le0, wing_y(z0), c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=t0, tip_thickness=t1, root_z=z0, lower_role=LOWER,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
tp = TAILPLANE
with m.tagged('tailplane'), m.shared_chart():
    m.wing(UPPER, XD(tp['le']), tp['y'], tp['root'], tp['tip'], tp['span'] * S,
           sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER, stations=STATIONS, span_segments=SPAN_SEGMENTS,
           controls=[(ELEVATOR[0] * tp['span'] * S / 2, ELEVATOR[1] * tp['span'] * S / 2, ELEVATOR[2], 'Elevator')])
fin_root, fin_h, fin_tip = FIN['root'], FIN['height'], FIN['tip']
with m.tagged('fin'), m.shared_chart():
    m.fin(UPPER, XD(FIN['le']), FIN['y'], fin_root, fin_tip, fin_h,
          sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), stations=STATIONS, span_segments=SPAN_SEGMENTS,
          controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2], 'Rudder')])
pr = PROP
with m.tagged('prop'), m.shared_chart():
    m.propeller('dark', (XD(pr['hub']), 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'], pr['spinner_r'], pr['spinner_len'],
                blade_sections=[(0.13, 0.9, 42.0), (0.35, 1.05, 32.0), (0.6, 1.0, 24.0), (0.85, 0.8, 19.0), (1.0, 0.45, 16.0)])
g = GEAR
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    # Fixed gear: no GearL/GearR nodes. The full spats are skin; the tire bottoms are fitted to the spec.
    # The central spat section reaches into the wing skin; the short root and two braces below overlap both
    # supporting surfaces. The earlier spat stopped 0.08 m below the wing and visibly floated.
    for side in (-1, 1):
        z = side * g['z']
        m.fuselage(UPPER, [(-0.82, 0.04, 0.10, -0.72), (-0.50, 0.13, 0.42, -1.10),
                           (-0.18, 0.20, 0.68, -1.08), (g['x'], 0.24, 0.78, -1.07),
                           (0.48, 0.20, 0.68, -1.08), (0.78, 0.12, 0.40, -1.02),
                           (1.02, 0.04, 0.10, -0.64)], segments=48, center_z=z,
                   lower_role=LOWER, subdivide=4, refinement='shape')
        root_y = wing_y(z) - 0.06
        m.strut(UPPER, (g['x'], -0.34, z), (g['x'], root_y, z), 0.11, 0.08, sides=12)
        m.strut('dark', (g['x'] - 0.30, -0.40, z), (g['x'] - 0.18, root_y, z), 0.035, sides=8)
        m.strut('dark', (g['x'] + 0.30, -0.40, z), (g['x'] + 0.18, root_y, z), 0.035, sides=8)
        m.revolve('dark', (g['x'], -g['bottom'] + g['wheel_r'], z), (0.0, 0.0, float(side)),
                  [(-g['wheel_w'] / 2, 0.85 * g['wheel_r']), (-0.45 * g['wheel_w'], g['wheel_r']),
                   (0.45 * g['wheel_w'], g['wheel_r']), (g['wheel_w'] / 2, 0.85 * g['wheel_r'])], 24)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.035)
with m.tagged('fittings'), m.shared_chart():
    e = EXHAUSTS
    for side in (-1, 1):
        for k in range(e['count']):
            d = e['d0'] + (e['d1'] - e['d0']) * k / (e['count'] - 1)
            f = d / L
            m.revolve('dark', (XD(d), e['y'], side * (fus_side_z(f, e['y']) - 0.05)), (-1.0, -0.12, side * 0.55),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # Two synchronized Type 97 guns at the existing spec's positions.
    for side in (-1, 1):
        m.gun_barrel('dark', (1.9, 0.45, side * 0.25), 0.0, 0.0, 0.55, 0.015)
    pz = -6.0
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.38, wing_y(pz), pz), 0.008, sides=6)
    m.strut('dark', (XD(4.45), 1.20, 0.0), (XD(4.68), 1.67, 0.0), 0.012, 0.006, sides=6)
    m.strut('dark', (tw['x'] - 0.02, tw['y'] + 0.02, 0.0), (tw['x'] + 0.30, tw['y'] - 0.25, 0.0), 0.020, sides=6)
    # Static, slotted-looking dive brakes under both outer wings: the renderer has no dive-brake control input.
    for side in (-1, 1):
        for k in range(8):
            z = side * (3.2 + 0.22 * k)
            y = wing_y(z) - 0.5 * chord_at(z) * (ROOT_T + (TIP_T - ROOT_T) * abs(z) / (S / 2)) - 0.025
            m.strut('dark', (le_x(z) - 0.55 * chord_at(z), y, z), (le_x(z) - 0.90 * chord_at(z), y, z), 0.025, sides=4)
# Rear gunner's 7.7 mm Type 92 at the greenhouse's aft end, drawn in its stowed aft position.
r = REAR_GUN
with m.tagged('turret'), m.shared_chart():
    direction = (-1.0, 0.12, 0.0)
    m.revolve('dark', (r['x'] + 0.06, r['y'] - 0.01, 0.0), direction, [(0.0, 0.025), (0.12, 0.07), (0.24, 0.025)], 12)
    m.machine_gun('dark', (r['x'] + 0.14, r['y'] - 0.02, 0.0), direction, r['length'], scale=0.75)

h = HINOMARU
for side in (-1, 1):
    z = side * h['wing_z'] * S / 2
    x = le_x(z) - h['wing_chord'] * chord_at(z)
    for up in (1.0, -1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'] + HINOMARU_BORDER_M, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=h['wing_red'], color='hinomaruRed')
    f = h['fus_d'] / L
    hw, hh, cy, _n = fus_section(f)
    outer = h['fus_depth'] * hh
    center = (XD(h['fus_d']), cy, side * hw)
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer - HINOMARU_BORDER_M, color='hinomaruRed')
    streak = [(-0.8, -0.10), (1.2, -0.28), (1.2, 0.09), (-0.8, 0.10)]
    m.marking('polygon', tags=['fuselage'], origin=(XD(EXHAUSTS['d1']), EXHAUSTS['y'], 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.0), -1.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-0.9, -0.25), (0.6, -0.25), (0.6, 0.35), (-0.9, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.marking('disc', tags=['wing'], center=(le_x(-3.6) - 0.02, wing_y(-3.6), -3.6), axis=(1.0, 0.0, 0.0), radiusM=0.09, color='lensClear')
m.export(out)
