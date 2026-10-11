# tools/models/blender/a6m2-zero-blender.py
"""Mitsubishi A6M2 Model 21 Zero. Original work, AGPL-3.0-or-later.

A Hangar-only duplicate beside the Sketchfab download (content/aircraft/a6m2-zero.glb stays), built from
the F6F single-engine template and fitted to content/aircraft/a6m2-zero.json so later promotion needs no
flight-model change. The real airplane, not the download, owns the silhouette.

Figures (English Wikipedia "Mitsubishi A6M Zero", Specifications (A6M2 (Type 0 Model 21)), read 2026-10-11):
  span 12.0 m (39 ft 4 in), length 9.06 m (29 ft 9 in), wing area 22.44 m2
                                                        CITED
  root airfoil MAC118 or NACA 2315; tip MAC118 or NACA 3309
                                                        CITED (the symmetric kit section approximates thickness only)
  3-bladed Sumitomo-Hamilton constant-speed propeller    CITED (blade count and maker); that table leaves diameter blank
  propeller diameter 2.90 m                             ESTIMATE, measured from the drawing's side view
  2 x 7.7 mm Type 97 cowling guns, 500 rpg; 2 x 20 mm Type 99-1 Mk.3 wing cannon, 60 rpg
                                                        CITED
  main gear retracts 90 degrees inward                  CITED, USAAF Intelligence Summary 85 as quoted by the existing
                                                        spec; the model uses one hinge and leaves each wheel upright
  taper 0.45, unswept quarter chord, dihedral 5.5 deg  ESTIMATE from the cited three-view
  overall early-war gray-green, six unbordered hinomaru ESTIMATE (palette role ijnaGray; no paint chip or airframe read)
  control-surface spans/hinges, exhausts, pitot, antenna mast and leg covers
                                                        ESTIMATE from the drawing and period proportions
  additions sink at least 0.02 m into what they sit on modeling choice: no coplanar faces (DP0)

Measured real-airplane reference (read 2026-10-11): Wikimedia Commons
  "Mitsubishi A6M Zero drawing.svg", fetched through Special:FilePath as a 1,920 x 2,325 PNG.
Each view has its own scale. Side view: spinner tip x=25 px, tail x=1,380 px, thrust line y=262.5 px,
  0.006686 m/px. Top view: spinner tip x=25 px, tail x=1,474 px, centerline y=1,424 px,
  0.006253 m/px. The top view at 30% semispan has leading/trailing edges x=296/630 px; quarter chord
  is 2.22 m aft of the spinner tip, which is the model origin.
Nose-relative stations in meters, side view; top/bottom are the outer mold line relative to the thrust line.
The 2026-10-11 tail repair re-read the original pixels after Mark found the aft body pinched to a strip: the first
pass had followed internal longitudinal/panel lines as the belly. Canopy is separate:
  aft     top    bottom
  0.70   +0.58   -0.64
  1.30   +0.61   -0.65
  2.00   +0.64   -0.59
  2.17   +0.62   -0.59   windscreen front
  2.75   +0.58   -0.60   canopy crown +1.00
  3.10   +0.57   -0.60   canopy crown +1.00
  3.60   +0.56   -0.58   canopy crown +0.92
  4.10   +0.58   -0.42   canopy crown +0.82
  4.55   +0.55   -0.55   canopy rear +0.70 / turtledeck
  5.20   +0.57   -0.54
  5.50   +0.55   -0.52
  6.00   +0.52   -0.49
  6.50   +0.47   -0.45
  6.80   +0.45   -0.41
  7.00   +0.36   -0.39
  7.50   +0.26   -0.34
  8.00   +0.20   -0.27
  8.40   +0.14   -0.19
Top-view fuselage half-widths, same nose-relative stations (meters):
  0.70 0.54; 1.30 0.52; 2.00 0.51; 2.70 0.49; 3.50 0.47; 4.55 0.46;
  5.20 0.42; 5.50 0.38; 6.00 0.35; 6.50 0.32; 6.80 0.29; 7.00 0.26;
  7.50 0.12; 8.00 0.08; 8.40 0.05; 9.06 0.02.
The top-view fuselage boundary is hidden by the tailplane around 7.5 m, so the 0.12 m half-width there is
ESTIMATE, checked against the 1942 photograph of the Akutan A6M2 and a Model 21 tail photograph on Commons;
all other aft stations above are MEASURED from the drawing's visible outer line (read 2026-10-11).
The windscreen front is 2.17 m aft of the spinner tip, crown 1.00 m at 2.75-3.10 m, canopy rear 4.55 m;
the proposed real-cockpit eye is (-0.88, 0.70, 0), 0.30 m below the crown. Fin and tailplane were
read from the same drawing: fin leading edge about 7.05 m aft, height about 1.2 m above the spine;
tailplane span about 4.0 m and leading edge about 6.7 m aft. These pixel-derived figures are MEASURED,
not published dimensions; rounding and the drawing itself remain sources of error.

Stance: wheel bottoms 2.025 m below the origin at x 0.182, tailwheel at x -6.532 and y -0.570
                                                        FITTED to a6m2-zero.json gear.heightM / mainX /
                                                        thirdX / thirdHeightM and its 12.224 deg stance
Frame: glTF, +x forward, +y up, +z right, meters. Origin: measured wing quarter chord on the thrust line.
Pose: gear down, thrust line level. Leaves out cockpit interior, folding wing tips, arrester hook, racks,
rails and stores; attachment is spec data and blenderDuplicates.test.ts fits it to the wing.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'a6m2b'
# --- CITED
SPAN = 12.0
LENGTH = 9.06
WING_AREA = 22.44
BLADES = 3
ROOT_T, TIP_T = 0.15, 0.09
# --- ESTIMATE
PROP_DIAMETER = 2.90
TAPER = 0.45
DIHEDRAL_DEG = 5.5
UPPER = LOWER = 'ijnaGray'
NOSE_X = 2.22 / LENGTH         # MEASURED: wing quarter chord aft of spinner tip
WING_Y = -0.052                # ESTIMATE: wing root chord below the thrust line, of LENGTH
# (x aft of the spinner tip, half-width, half-height, center y, exponent), tail to nose; of LENGTH
# Read off the real airplane's Commons 'Mitsubishi A6M Zero drawing.svg' three-view,
# measured 2026-10-11: (d aft of the spinner tip, half-width, half-height, center y), all of LENGTH.
FUSELAGE = [
    (1.0000, 0.0022, 0.0132, 0.0022, 2.2),
    (0.9272, 0.0055, 0.0182, -0.0028, 2.2),
    (0.8830, 0.0088, 0.0260, -0.0039, 2.2),
    (0.8278, 0.0132, 0.0331, -0.0044, 2.2),
    (0.7726, 0.0287, 0.0414, -0.0017, 2.2),
    (0.7506, 0.0320, 0.0475, 0.0022, 2.2),
    (0.7174, 0.0353, 0.0508, 0.0011, 2.2),
    (0.6623, 0.0386, 0.0552, 0.0017, 2.2),
    (0.6071, 0.0419, 0.0591, 0.0017, 2.2),
    (0.5739, 0.0464, 0.0613, 0.0017, 2.2),
    (0.5022, 0.0508, 0.0607, 0.0000, 2.2),
    (0.3863, 0.0519, 0.0607, 0.0055, 2.2),
    (0.2980, 0.0541, 0.0662, -0.0011, 2.2),
    (0.2208, 0.0563, 0.0673, 0.0022, 2.1),
    (0.1435, 0.0574, 0.0693, -0.0002, 2.0),
    (0.0773, 0.0596, 0.0668, -0.0033, 2.0),
    (0.0400, 0.0300, 0.040, 0.000, 2.0),
]
# (glTF x, lower-edge half-width, crown y), tail to nose, meters; measured stations in the header.
CANOPY = [
    (NOSE_X * LENGTH - 4.55, 0.08, 0.70),
    (NOSE_X * LENGTH - 4.10, 0.27, 0.82),
    (NOSE_X * LENGTH - 3.60, 0.34, 0.92),
    (NOSE_X * LENGTH - 3.10, 0.36, 1.00),
    (NOSE_X * LENGTH - 2.75, 0.34, 1.00),
    (NOSE_X * LENGTH - 2.45, 0.25, 0.95),
    (NOSE_X * LENGTH - 2.17, 0.08, 0.62),
]
CANOPY_FRAMES = tuple(NOSE_X * LENGTH - d for d in (4.10, 3.60, 3.10, 2.75, 2.45))
TAILPLANE = dict(span=0.335, le=0.720, root=0.200, taper=0.48, y=0.0276, sweep=8.0)
FIN = dict(root=0.222, taper=0.32, height=0.163, y=0.0155)
PROP = dict(hub=0.030, chord=0.025, spinner_r=0.029, spinner_len=0.040)
# x and bottom are FITTED to the spec; z, wheel and hinge placement are ESTIMATE.
GEAR = dict(x=0.182, z=0.145, bottom=2.025, wheel_r=0.305, wheel_w=0.16)
TAILWHEEL = dict(x=-6.532, y=-0.20, bottom=0.570, wheel_r=0.115, wheel_w=0.065)

SEGMENTS = 96
SUBDIVIDE = 6
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.60, 0.95, 0.75)
FLAP = (0.15, 0.58, 0.78)
ELEVATOR = (0.08, 0.96, 0.70)
RUDDER = (0.05, 0.94, 0.67)
EXHAUSTS = dict(count=5, x0=0.105, x1=0.160, y=-0.020, r=0.022, length=0.14)
FILLET = dict(le=0.22, te=0.50, half_w=0.020, half_h=0.014)
INSIGNIA = dict(fus_at=0.650, fus_d=0.92, wing_z=0.65, wing_chord=0.45, wing_d=1.25)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    """A fraction of LENGTH aft of the spinner tip, as glTF x."""
    return (NOSE_X - f) * L


_FUS, _ = kit._refine_shape([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], SUBDIVIDE)


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
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE,
               lower_role=LOWER, refinement='shape')
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = WING_Y * L + 0.55 * ROOT_T * root_chord - FILLET['half_h'] * L
    fz = fus_side_z(mid, fy) + FILLET['half_w'] * L - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, WING_Y * L),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, WING_Y * L)],
                   segments=24, center_z=side * fz, subdivide=4, lower_role=LOWER)
with m.tagged('canopy'), m.shared_chart():
    canopy_stations = []
    for x, width, crown in CANOPY:
        f = NOSE_X - x / L
        # Sink the seam by DP0's standard 0.02 m. At the narrow end caps the
        # fuselage can already stand above the crown, so retain a thin hidden
        # wedge rather than inverting the section.
        base = min(crown - EMBED_M, fus_top_y(f, width) - EMBED_M)
        canopy_stations.append((x, width, base, crown))
    m.faired_canopy('glazing', UPPER, canopy_stations, list(CANOPY_FRAMES), bar=0.022)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
gear_z = GEAR['z'] * S
breaks = [0.0, gear_z, S / 2]
with m.tagged('wing'), m.shared_chart():
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = (root_chord + (tip_chord - root_chord) * z / (S / 2) for z in (z0, z1))
        a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
        m.wing(UPPER, 0.25 * root_chord - z0 * tan_sw, WING_Y * L + z0 * tan_di, c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0,
               lower_role=LOWER, stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
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
# The hinge sits low in the wing so the upright wheel, swung aft, stays under the upper skin (header: one hinge, ESTIMATE).
hinge_y = wing_y(gear_z) - 0.40 * ROOT_T * root_chord
tw = TAILWHEEL
tw_hinge_y = tw['y']
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], hinge_y, side * gear_z), g['bottom'] + hinge_y, g['wheel_r'], g['wheel_w'], node=name)
    m.gear_leg('dark', (tw['x'], tw_hinge_y, 0.0), tw['bottom'] + tw_hinge_y, tw['wheel_r'], tw['wheel_w'], strut_radius=0.045, node='Tailwheel')
with m.tagged('fittings'), m.shared_chart():
    strut_r = 0.18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        # Leg cover on the outboard face of the strut, its face EMBED_M inside it.
        m.box('dark', (g['x'], hinge_y - 0.55 * (g['bottom'] + hinge_y), side * (gear_z + strut_r - EMBED_M + 0.006)), (0.34, 0.82, 0.012), node=name)
    e = EXHAUSTS
    ey = e['y'] * L
    for side in (-1, 1):
        for k in range(e['count']):
            f = e['x0'] + (e['x1'] - e['x0']) * k / (e['count'] - 1)
            m.revolve('dark', (X(f), ey, side * (fus_side_z(f, ey) - 0.05)), (-1.0, -0.15, side * 0.5),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # The spec's two 20 mm wing cannon and two synchronized 7.7 mm cowl guns (header, CITED).
    for side in (-1, 1):
        gz = 2.3 * side
        m.gun_barrel('dark', (le_x(gz) - 0.30, wing_y(gz), gz), 0.0, 0.0, 0.48, 0.016)
        z = 0.25 * side
        m.gun_barrel('dark', (1.78, 0.45, z), 0.0, 0.0, 0.50, 0.010)
    pz = -5.2
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.40, wing_y(pz), pz), 0.009, sides=6)
    # Antenna mast aft of the canopy, raked aft.
    m.strut('dark', (X(0.635), fus_top_y(0.635, 0.0) - 0.04, 0.0), (X(0.665), fus_top_y(0.635, 0.0) + 0.45, 0.0), 0.012, 0.006, sides=6)


ins = INSIGNIA
for side in (-1, 1):
    hw, hh, cy, _n = fus_section(ins['fus_at'])
    m.marking('disc', tags=['fuselage'], center=(X(ins['fus_at']), cy, side * hw),
              axis=(0.0, 0.0, float(side)), radiusM=0.5 * ins['fus_d'], color='hinomaruRed')
    z = side * ins['wing_z'] * S / 2
    x = le_x(z) - ins['wing_chord'] * chord_at(z)
    for up in (-1.0, 1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0),
                  radiusM=0.5 * ins['wing_d'], color='hinomaruRed')
for side in (-1, 1):
    streak = [(-0.9, -0.12), (1.4, -0.32), (1.4, 0.10), (-0.9, 0.12)]
    m.marking('polygon', tags=['fuselage'], origin=(X(EXHAUSTS['x1']), EXHAUSTS['y'] * L, 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.2), -1.2), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-1.0, -0.25), (0.7, -0.25), (0.7, 0.35), (-1.0, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.export(out)
