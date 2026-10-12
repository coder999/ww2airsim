# tools/models/blender/f4f-wildcat-blender.py
"""Grumman F4F-4 Wildcat. Original work, AGPL-3.0-or-later.

A second Wildcat beside the Sketchfab download (content/aircraft/wildcat.glb stays; the game still stretches its
legs and draws its split flaps in code, src/render/scene/wildcat.ts). Compare the two in the Hangar and swap this
one in when approved (docs/blender-aircraft.md, "Promoting a duplicate").

Figures (read 2026-10-11):
  span 11.58 m (38 ft 0 in), length 8.76 m (28 ft 9 in), wing area 24.15 m2 (260 sq ft), airfoil NACA 23015 root /
    NACA 23009 tip, 3-bladed constant-speed propeller   CITED, English Wikipedia "Grumman F4F Wildcat",
                                                        Specifications (the page's table is the F4F-3's; the F4F-4
                                                        differs in armament and the folding wing, not in these)
  six .50 in wing guns, three a side                    CITED, same page (the F4F-4)
  ailerons 65.5 to 92.5 percent of the semispan, hinge at 77.2 percent chord
                                                        CITED, the F4F-3's, NACA ACR, Kleckner 1942, as ASSETS.md
                                                        records for the download's own cut
  main gear hand-cranked, retracting up into the fuselage sides
                                                        CITED, same page; the model swings each leg aft about one
                                                        hinge inside the fuselage side, to lie along it under the
                                                        wing root, ESTIMATE (with the spec's 1.5 m leg an inboard
                                                        fold crosses the centerline)
  stance: wheels 2.3952 m below the origin at x 0.413, tailwheel at x -4.627, 1.293 m below
                                                        FITTED to f4f-wildcat.json gear.heightM / mainX / thirdX /
                                                        thirdHeightM, so a swap leaves the sim alone (see below)
  main wheels 0.66 m diameter (the drawing's), 0.20 m wide, track 1.6 m; tailwheel fixed
                                                        ESTIMATE except the drawn diameter
  upper surfaces non-specular blue-gray over light gray undersides; 1943 star-and-bar insignia
                                                        ESTIMATE (no chip read; the Navy's wing rule)
  cowl detail, exhausts, transverse sections, fin thickness, pitot, masts
                                                        ESTIMATE except their drawing-measured positions below
  additions sink at least 0.02 m into what they sit on  modeling choice: no coplanar faces (DP0)

REAL-AIRPLANE MEASUREMENT (2026-10-11, second pass): Wikimedia Commons "Grumman F4F Wildcat 3-view line drawing.svg"
(Kaboldy, CC BY-SA 3.0, titled F4F-4), rasterized through Special:FilePath at 3,840 px. One scale for all views:
side view hub tip x=84 to rudder trailing edge x=2,588 (2,504 px), top view 86 to 2,587 (2,501 px), 285.7 px/m on
the cited 8.76 m; the top view's wingtips then span 11.62 m against the cited 11.58 m (+0.3%, the 0.1 m nav lights
excluded). Heights are meters above the propeller axis (side row 675.5, the hub's center row; the front view's
fin tip, 1.89 m, agrees with the side view's 1.90 m crown).
  origin: wing quarter chord at 30% semispan, 2.59 m aft of the hub tip (leading edge 2.02 m, trailing edge
    4.32 m; the docs' 2.58 m is within the pixel error)                   DRAWING-MEASURED
  wing: straight leading edge 1.94-2.19 m and trailing edge 4.56-3.78 m from root to 5.6 m, a rounded tip;
    chord line at the root on the thrust line, 4.2 deg dihedral (front view)  DRAWING-MEASURED, scaled 0.997 in
    span to the cited span and 1.004 in chord to the cited area
  fuselage side silhouette and top-view half-widths: FUSELAGE_M (+/-0.02 m). Under the fin, aft of 7.2 m, the
    body is hidden in both views and its taper to the tail cone (8.47 m) is an ESTIMATE. The 2.0-2.96 m belly
    fairing reaches -0.95 m; the front view shows nothing wider than 0.1 m below the cowl ring, so it is a
    narrow keel, width ESTIMATE                                           DRAWING-MEASURED
  turtle deck: SPINE below, a narrow ridge on the fuselage behind the hood (top view inner lines, side top line),
    1.16 m at 3.9 m falling into the fin fillet at 6.5 m                  DRAWING-MEASURED
  canopy: windscreen base 2.63 m at +0.87 m, roof +1.236 m at 3.1 m falling to 1.18 m at the hood's rear frame
    3.88 m; rails 0.343 m half-width; section from the front view (0.31 m at +0.8, 0.18 m at +1.1)
                                                                          DRAWING-MEASURED
  fin and rudder: FIN_LE / FIN_TE, a curved dorsal fillet from the deck at 6.5 m into a straight leading edge,
    a flat crown +1.90 m at 8.0-8.36 m; rudder hinge straight at 8.10 m from +0.22 to +1.75 m; the rudder's
    lower edge runs aft to 8.47 m at +0.15 m                              DRAWING-MEASURED
  tailplane: TAILPLANE, 4.19 m span, straight leading edge, rounded tips, chord line +0.595 m; elevator hinge
    straight at 8.15 m, inboard edges cut diagonally clear of the rudder  DRAWING-MEASURED
  propeller: 3.02 m diameter (both views' blade tips); hub, no spinner, blade plane 0.40 m aft of the hub tip
                                                                          DRAWING-MEASURED (Wikipedia gives no diameter)
  wing guns: ports at 2.01, 2.21 and 3.10 m from the centerline           DRAWING-MEASURED
  proposed real-cockpit eye (-0.85, 0.95) m: 3.44 m aft of the hub tip, 0.27 m under the roof
                                                                          MEASURED from the drawing

The first pass (same date) built the wing as a LOW wing, its chord line 0.72 m (2 ft 4 in) below the thrust line,
fitted to the spec's gun points; the drawing's wing is a mid wing on the thrust line. Its canopy was read off
the download's canopy node (crown 1.24 m but 0.45 m wide at the rails' height and running 1.0 m short of the
windscreen's base), it had no turtle deck, a trapezoid fin and tailplane, a 3.2 m propeller with a 0.25 m
spinner, and the gun barrels 0.6-0.9 m outboard of the drawn ports.

The spec is fitted to the download, not the drawing: its wheels are 2.395 m below the origin where the drawing's
extended wheel touches 1.75 m below the thrust line, and its tailwheel is 0.56 m lower and 0.19 m forward of the
drawn one; its guns (y -0.54) sit 0.7 m under the drawn wing. The stance is not this model's to change, so the
legs are 0.645 m longer than the real ones; promotion should re-fit gear.heightM, thirdHeightM and the guns.

Frame: glTF, +x forward, +y up, +z right, meters. Origin: the drawing's wing quarter chord at 30% semispan, on the
thrust line. Pose: gear down, thrust line level.
Leaves out: the cockpit interior, the wheel wells, the wing fold, the arrester hook, split-flap plates (the flap
is a plain hinged panel), stores (measured on the wing by `npm run models:mounts`), unit markings.
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
# --- DRAWING-MEASURED (see the header)
NOSE_M = 2.59                    # hub tip to the wing quarter chord at 30% semispan
PROP_DIAMETER = 3.02
DIHEDRAL_DEG = 4.2
WING_Y = -0.01                   # root chord line, m above the thrust line
UPPER, LOWER = 'blueGray', 'underside'
# (distance aft of the hub tip, half-width, top, bottom, exponent), meters.
FUSELAGE_M = [
    (8.48, 0.01, 0.10, 0.06, 2.0), (8.45, 0.03, 0.15, -0.02, 2.0), (8.30, 0.08, 0.20, -0.09, 2.0),
    (8.05, 0.13, 0.25, -0.155, 2.2), (7.85, 0.18, 0.43, -0.19, 2.2), (7.60, 0.24, 0.58, -0.235, 2.2),
    (7.30, 0.30, 0.635, -0.287, 2.2), (7.00, 0.357, 0.645, -0.336, 2.2), (6.50, 0.448, 0.634, -0.424, 2.2),
    (6.00, 0.525, 0.645, -0.504, 2.3), (5.50, 0.606, 0.66, -0.574, 2.4), (5.10, 0.644, 0.68, -0.625, 2.5),
    (4.70, 0.686, 0.70, -0.669, 2.5), (4.30, 0.711, 0.73, -0.708, 2.5), (3.90, 0.704, 0.76, -0.742, 2.5),
    (3.50, 0.690, 0.78, -0.770, 2.5), (3.10, 0.680, 0.80, -0.795, 2.5), (2.60, 0.681, 0.866, -0.795, 2.5),
    (2.20, 0.700, 0.824, -0.790, 2.4), (1.90, 0.737, 0.798, -0.785, 2.3), (1.70, 0.735, 0.779, -0.785, 2.2),
    (1.50, 0.714, 0.760, -0.765, 2.0), (1.30, 0.697, 0.728, -0.728, 2.0), (1.10, 0.669, 0.697, -0.686, 2.0),
    (0.90, 0.634, 0.649, -0.634, 2.0), (0.75, 0.575, 0.62, -0.57, 2.0), (0.66, 0.53, 0.575, -0.535, 2.0),
    (0.62, 0.47, 0.49, -0.47, 2.0),
]
# The belly keel under the wheel wells (side view; width ESTIMATE): (distance, bottom).
KEEL_M = [(2.98, -0.70), (2.93, -0.85), (2.85, -0.90), (2.75, -0.935), (2.62, -0.945), (2.45, -0.925),
          (2.25, -0.895), (2.05, -0.86), (1.90, -0.80), (1.85, -0.70)]
KEEL_HALF_W = 0.10
# Turtle deck ridge: (distance, half-width at its base, top); it stands on the fuselage top and fairs out at 6.45 m.
SPINE_M = [(6.45, 0.24, 0.645), (6.25, 0.255, 0.66), (6.00, 0.265, 0.719), (5.75, 0.27, 0.788), (5.50, 0.284, 0.854),
           (5.25, 0.30, 0.919), (5.00, 0.305, 0.973), (4.75, 0.33, 1.025), (4.50, 0.335, 1.054),
           (4.25, 0.338, 1.097), (4.00, 0.34, 1.138), (3.85, 0.343, 1.18)]
SPINE_EXPONENT = 1.6         # the front view's narrowing ridge: 0.76 of the base width half-way up, 0.3 near the top
# Hood and windscreen, tail to nose after conversion: (distance, rail half-width, rail y, shoulder half-width,
# shoulder y, roof half-width, roof y, crown y). Rails sit inside the fuselage skin.
CANOPY_M = [
    (3.92, 0.30, 0.70, 0.23, 0.92, 0.12, 1.12, 1.165),
    (3.85, 0.343, 0.70, 0.26, 0.94, 0.13, 1.137, 1.183),
    (3.50, 0.343, 0.70, 0.26, 0.95, 0.13, 1.162, 1.208),
    (3.15, 0.338, 0.70, 0.26, 0.95, 0.13, 1.19, 1.235),
    (2.98, 0.320, 0.72, 0.25, 0.95, 0.12, 1.17, 1.213),
    (2.80, 0.270, 0.77, 0.22, 0.90, 0.12, 1.00, 1.04),
    (2.64, 0.16, 0.82, 0.15, 0.85, 0.12, 0.865, 0.875),
]
CANOPY_FRAMES_M = (3.86, 3.52, 3.18, 2.98)
# Wing (top view, before the span/area scale): (z, leading station, trailing station).
WING_ROWS = [(0.0, 1.937, 4.560), (5.60, 2.193, 3.784), (5.70, 2.209, 3.686), (5.75, 2.268, 3.409),
             (5.79, 2.45, 3.10), (5.81, 2.62, 2.84)]
WING_Z_SCALE = (SPAN / 2) / 5.81
WING_CHORD_SCALE = 1.0045    # the traced trapezoids then total the cited 24.15 m2
# Tailplane (top view): (z, leading station, trailing station, thickness m); chord line TAILPLANE_Y.
TAILPLANE = [(0.0, 7.185, 8.10, 0.10), (0.12, 7.22, 8.17, 0.10), (0.35, 7.28, 8.735, 0.095), (1.00, 7.46, 8.668, 0.08),
             (1.50, 7.60, 8.62, 0.07), (2.00, 7.735, 8.573, 0.055), (2.03, 7.77, 8.545, 0.05), (2.05, 7.79, 8.465, 0.045),
             (2.07, 7.82, 8.34, 0.035), (2.085, 7.88, 8.22, 0.025), (2.095, 7.95, 8.08, 0.012)]
TAILPLANE_Y = 0.595
ELEVATOR_HINGE = (0.20, 2.00, 8.15)     # spanwise extent and its straight unswept hinge station
# Vertical tail outer outline (side view): (height above the thrust line, station). Below the deck (0.634 m) the
# leading edge is buried in the fuselage; the trailing edge there is the rudder's lower edge.
FIN_LE = [(0.15, 6.50), (0.634, 6.50), (0.651, 6.70), (0.697, 6.90), (0.735, 7.00), (0.784, 7.10), (0.852, 7.20),
          (0.94, 7.28), (1.00, 7.347), (1.10, 7.413), (1.20, 7.466), (1.40, 7.578), (1.60, 7.690), (1.75, 7.774),
          (1.80, 7.805), (1.85, 7.858), (1.88, 7.917), (1.90, 8.00)]
FIN_TE = [(0.15, 8.47), (0.20, 8.547), (0.30, 8.670), (0.40, 8.761), (0.50, 8.750), (1.00, 8.705), (1.50, 8.659),
          (1.70, 8.642), (1.75, 8.631), (1.80, 8.60), (1.85, 8.53), (1.88, 8.446), (1.90, 8.36)]
FIN_THICKNESS = [(0.15, 0.10), (0.70, 0.16), (1.50, 0.12), (1.80, 0.08), (1.90, 0.04)]
RUDDER_HINGE = ((0.22, 8.10), (1.75, 8.10))
PROP = dict(hub=0.40, chord=0.21, spinner_r=0.12, spinner_len=0.533)  # m; the hub cap tip is d = 0
# x, z, wheel in m; the stance is FITTED (header): the wheel bottom lands on gear.heightM below the origin. The leg
# hangs from a hinge just inside the fuselage side and slants out to the axle.
GEAR = dict(x=0.413, hinge_y=-0.55, hinge_z=0.52, z=0.80, bottom=2.3952, wheel_r=0.33, wheel_w=0.20, strut_r=0.06)
TAILWHEEL = dict(x=-4.627, y=-0.25, bottom=1.293, wheel_r=0.13, wheel_w=0.07)
GUN_Z = (2.01, 2.21, 3.10)

SEGMENTS = 96
SUBDIVIDE = 4
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.655, 0.925, 0.772)  # half-span fractions, hinge chord fraction (CITED)
FLAP = (0.10, 0.62, 0.74)
EXHAUSTS = dict(count=2, d0=1.70, d1=1.85, y=-0.13, r=0.030, length=0.20)
INSIGNIA = dict(fus_d=6.05, fus_d_size=0.90, wing_z=0.66, wing_chord=0.42, wing_d=1.25)
EMBED_M = 0.02

L, S = LENGTH, SPAN


def XD(d):
    """Meters aft of the hub tip, as glTF x."""
    return NOSE_M - d


FUSELAGE = [(XD(d), w, (top - bottom) / 2, (top + bottom) / 2, n) for d, w, top, bottom, n in FUSELAGE_M]
_FUS, _ = kit._refine_shape(FUSELAGE, SUBDIVIDE)


def fus_section(d):
    """(half-width, half-height, center y, exponent) of the lofted fuselage d meters aft of the hub tip."""
    x = XD(d)
    i = next(k for k in range(len(_FUS) - 1) if _FUS[k][0] <= x <= _FUS[k + 1][0])
    t = (x - _FUS[i][0]) / (_FUS[i + 1][0] - _FUS[i][0])
    return tuple(_FUS[i][c] + (_FUS[i + 1][c] - _FUS[i][c]) * t for c in (1, 2, 3, 4))


def fus_side_z(d, y):
    hw, hh, cy, n = fus_section(d)
    return hw * max(0.0, 1.0 - abs((y - cy) / hh) ** n) ** (1.0 / n)


def fus_top_y(d):
    hw, hh, cy, n = fus_section(d)
    return cy + hh


def lerp(table, h):
    """Linear interpolation in a [(key, value)] table, keys increasing."""
    for (h0, v0), (h1, v1) in zip(table, table[1:]):
        if h <= h1:
            return v0 + (v1 - v0) * (h - h0) / (h1 - h0)
    return table[-1][1]


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)
tan_di = math.tan(math.radians(DIHEDRAL_DEG))


def wing_y(z):
    return WING_Y + abs(z) * tan_di


def _wing_row(z, le, te):
    qc = le + 0.25 * (te - le)
    c = (te - le) * WING_CHORD_SCALE
    return z * WING_Z_SCALE, XD(qc - 0.25 * c), XD(qc + 0.75 * c)


WING = [_wing_row(*r) for r in WING_ROWS]


def chord_at(z):
    return lerp([(w[0], w[1] - w[2]) for w in WING], abs(z))


def le_x(z):
    return lerp([(w[0], w[1]) for w in WING], abs(z))


def wing_t(z):
    return (ROOT_T + (TIP_T - ROOT_T) * min(1.0, abs(z) / (S / 2))) * chord_at(z)


with m.tagged('fuselage'):
    m.fuselage(UPPER, FUSELAGE, segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=LOWER, refinement='shape')
    keel = []
    for d, bottom in KEEL_M:
        top = fus_section(d)[2] - 0.3   # buried in the belly
        keel.append((XD(d), KEEL_HALF_W, (top - bottom) / 2, (top + bottom) / 2, 2.4))
    m.fuselage(LOWER, keel, segments=32, subdivide=3, refinement='shape')
    spine = []
    for d, w, top in SPINE_M:
        base = fus_top_y(d) - 0.03
        spine.append((XD(d), w, top - base, base, SPINE_EXPONENT))
    m.fuselage(UPPER, spine, segments=48, subdivide=3, refinement='shape')
with m.tagged('canopy'), m.shared_chart():
    m.faired_canopy('glazing', UPPER, [(XD(d), *rest) for d, *rest in CANOPY_M], [XD(d) for d in CANOPY_FRAMES_M], bar=0.020)
controls = [(a * S / 2, b * S / 2, h, n) for (a, b, h), n in ((FLAP, 'Flap1'), (AILERON, 'Aileron'))]
with m.tagged('wing'), m.shared_chart():
    m.wing_outline(UPPER, [(z, le, te, wing_y(z), wing_t(z)) for z, le, te in WING], lower_role=LOWER,
                   stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
eh = ELEVATOR_HINGE
with m.tagged('tailplane'), m.shared_chart():
    m.wing_outline(UPPER, [(z, XD(le), XD(te), TAILPLANE_Y, t) for z, le, te, t in TAILPLANE], lower_role=LOWER,
                   stations=STATIONS, span_segments=1,
                   controls=[(eh[0], eh[1], ((eh[0], XD(eh[2])), (eh[1], XD(eh[2]))), 'Elevator')])
with m.tagged('fin'), m.shared_chart():
    root = FIN_LE[0][0]
    heights = sorted({h for h, _ in FIN_LE} | {h for h, _ in FIN_TE} | {h for h, _ in FIN_THICKNESS})
    (h_a, s_a), (h_b, s_b) = RUDDER_HINGE
    m.fin_outline(UPPER, root, [(h - root, XD(lerp(FIN_LE, h)), XD(lerp(FIN_TE, h)), lerp(FIN_THICKNESS, h)) for h in heights],
                  stations=STATIONS, span_segments=1,
                  controls=[(h_a - root, h_b - root, ((h_a - root, XD(s_a)), (h_b - root, XD(s_b))), 'Rudder')])
pr = PROP
with m.tagged('prop'), m.shared_chart():
    hub_x = XD(pr['hub'])
    m.propeller('dark', (hub_x, 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'], pr['spinner_r'], pr['spinner_len'],
                blade_sections=[(0.13, 0.9, 44.0), (0.35, 1.05, 33.0), (0.6, 1.0, 25.0), (0.85, 0.8, 19.0), (1.0, 0.5, 16.0)])
    # The Curtiss hub barrel behind the cap, and the shaft into the cowl (drawn 0.30-0.63 m).
    m.revolve('dark', (XD(0.66), 0.0, 0.0), (1.0, 0.0, 0.0), [(0.0, 0.10), (0.16, 0.10), (0.18, 0.17), (0.34, 0.17), (0.36, 0.12)], 24, 'Prop')
g = GEAR
tw = TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        hinge = (g['x'], g['hinge_y'], side * g['hinge_z'])
        axle = (g['x'], -g['bottom'] + g['wheel_r'], side * g['z'])
        m.strut('dark', hinge, axle, g['strut_r'], 0.8 * g['strut_r'], sides=8, node=name)
        m.revolve('dark', (axle[0], axle[1], axle[2] - g['wheel_w'] / 2), (0.0, 0.0, 1.0),
                  [(0.0, 0.85 * g['wheel_r']), (0.05 * g['wheel_w'], g['wheel_r']), (0.95 * g['wheel_w'], g['wheel_r']),
                   (g['wheel_w'], 0.85 * g['wheel_r'])], 24, name)
    m.gear_leg('dark', (tw['x'], tw['y'], 0.0), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=0.04)
with m.tagged('fittings'), m.shared_chart():
    # The engine face behind the cowl lip.
    m.revolve('dark', (XD(0.70), 0.0, 0.0), (1.0, 0.0, 0.0), [(0.0, 0.47), (0.06, 0.45)], 24)
    e = EXHAUSTS
    for side in (-1, 1):
        for k in range(e['count']):
            d = e['d0'] + (e['d1'] - e['d0']) * k / (e['count'] - 1)
            m.revolve('dark', (XD(d), e['y'], side * (fus_side_z(d, e['y']) - 0.05)), (-1.0, -0.15, side * 0.5),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # Wing guns: three .50s a side at the drawn ports, the muzzles just ahead of the leading edge.
    for side in (-1, 1):
        for gz in GUN_Z:
            gz *= side
            m.gun_barrel('dark', (le_x(gz) - 0.35, wing_y(gz), gz), 0.0, 0.0, 0.50, 0.016)
    pz = -5.6 * WING_Z_SCALE
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.40, wing_y(pz), pz), 0.009, sides=6)
    # Antenna mast behind the hood, raked forward (drawn base 4.68-4.78 m on the deck, top 4.52 m at +1.58 m),
    # and the short aft mast (6.15 m to 6.22 m at +1.26 m).
    m.strut('dark', (XD(4.74), 1.00, 0.0), (XD(4.53), 1.58, 0.0), 0.022, 0.010, sides=6)
    m.strut('dark', (XD(6.15), 0.64, 0.0), (XD(6.22), 1.26, 0.0), 0.012, 0.006, sides=6)


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
    hw, hh, cy, _n = fus_section(ins['fus_d'])
    # On a fuselage side v = axis x uDir is up for uDir = -side x (aft on the left side's view).
    roundel('fuselage', (XD(ins['fus_d']), cy, side * hw), (0.0, 0.0, float(side)), (-float(side), 0.0, 0.0), ins['fus_d_size'])
# Upper left wing and lower right wing (the Navy's rule): uDir spanwise, v forward.
zl = -ins['wing_z'] * S / 2
roundel('wing', (le_x(zl) - ins['wing_chord'] * chord_at(zl), wing_y(zl), zl), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), ins['wing_d'])
zr = ins['wing_z'] * S / 2
roundel('wing', (le_x(zr) - ins['wing_chord'] * chord_at(zr), wing_y(zr), zr), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0), ins['wing_d'])
for side in (-1, 1):
    streak = [(-0.9, -0.12), (1.4, -0.32), (1.4, 0.10), (-0.9, 0.12)]
    m.marking('polygon', tags=['fuselage'], origin=(XD(EXHAUSTS['d1']), EXHAUSTS['y'], 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.2), -1.2), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-1.0, -0.25), (0.7, -0.25), (0.7, 0.35), (-1.0, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
m.export(out)
