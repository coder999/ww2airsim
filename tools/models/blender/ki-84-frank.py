# tools/models/blender/ki-84-frank.py
"""Nakajima Ki-84-Ia Hayate ("Frank"). Original work, AGPL-3.0-or-later.

The single-engine template (R3): every station is a fraction of the cited length or span, so
another single-engine type is this file with its own CITED block (R3 plan, Task 16).

Figures (read 2026-09-27, English Wikipedia "Nakajima Ki-84 Hayate", Specifications (Ki-84-Ia)):
  span 11.238 m, length 9.92 m, wing area 21 m2           CITED
  4-bladed propeller                                      CITED (blade count)
  airfoil thickness 16.5% root / 8% tip (NN-21)           CITED (the section's own camber is not modeled:
                                                          the kit's section is symmetric)
  propeller diameter 3.05 m                               ESTIMATE (the source is silent)
  taper 0.53, an unswept quarter chord, dihedral 6 deg   ESTIMATE, period three-view proportions
  every section, canopy, tail surface, gear track and leg
    length below (fractions of length or span)            ESTIMATE
  main gear retracts inboard into the wing                ESTIMATE (the source is silent)
  tailwheel retracts forward                              ESTIMATE
  IJA dark green over gray-green undersides               ESTIMATE (palette roles ijaGreen, underside)
DP0 detail figures (read 2026-09-28):
  armament: 2 x 12.7 mm Ho-103 machine guns in the nose (cowling), 2 x 20 mm Ho-5 cannon in the wings
                                                          CITED, English Wikipedia "Nakajima Ki-84",
                                                          Specifications (Ki-84-Ia), Armament, read 2026-09-28
                                                          (barrels only; the breeches are inside)
  the airframe the markings follow: Ki-84-Ia s/n 1446, 11th Hiko Sentai, 2nd Chutai, captured at
    Clark Field 1945, the sole survivor (Chiran Peace Museum)
                                                          CITED, Vintage Aviation News, "The Last Surviving
                                                          Nakajima Ki-84 Hayate", https://vintageaviationnews.com/
                                                          warbird-articles/the-last-surviving-nakajima-ki-84-hayate.html,
                                                          read 2026-09-28
  photo used for positions: the same airframe as N3385G, Ontario CA, 1970-10-18, RuthAS, Commons
    File:Nakajima_Ki84_Hayate_N3385G_ONT_18.10.70_edited-3.jpg, read 2026-09-28. It shows a
    post-restoration display repaint, so its tail crest is NOT drawn (not wartime).
  six hinomaru: both wing uppers, both wing lowers, both fuselage sides
                                                          CITED, Vintage Aviation News (above)
  a 75 mm white border on every hinomaru (camouflaged aircraft)
                                                          CITED, Vintage Aviation News (above)
  fuselage hinomaru centered 0.57 of LENGTH aft of the spinner tip, at mid-depth
                                                          CITED, a ratio measured off the 1970 photo (Task 1)
  fuselage hinomaru diameter 0.85 of the local fuselage depth (white border's outer edge)
                                                          ESTIMATE: the photo shows it "close to the full
                                                          local depth"; the photo has no scale reference
  wing hinomaru at 0.70 of the half-span, centered 0.45 of the local chord aft of the leading edge,
    red 1.10 m across                                     ESTIMATE: occluded in the photo, no text figure
  yellow leading-edge ID strip, root to 1/3 of the half-span (inboard third)
                                                          CITED, Vintage Aviation News (above): "from the roots
                                                          to 1/3 of the wingspan"; its chordwise width is
                                                          ESTIMATE (the forward-facing nose, the skin's facing test)
  fuselage band                                           ESTIMATE: omitted, no evidence either way (Task 1)
  exhaust soot, walkway wear by the cockpit (left wing root), landing-light lens on the left
    leading edge at 3.2 m                                 ESTIMATE: position and size
  propeller blades dark; the spinner shares the blades' role (the 1970 photo shows it green:
    ESTIMATE, the kit's propeller gives the spinner the blades' role)
  control surfaces (hinge chord fractions; spans of the half-span, tailplane half-span or fin height):
    flaps 0.11-0.56 at 0.80, ailerons 0.58-0.96 at 0.76, elevators 0.08-0.97 at 0.70,
    rudder 0.05-0.93 at 0.68                              ESTIMATE, period three-view proportions
  canopy frames at 0.535, 0.490, 0.445, 0.400 of LENGTH, 18 mm bars
                                                          ESTIMATE
  cowling lip: a station 0.002 of LENGTH ahead of the last cowl station (0.051), its half-size
    0.057 of LENGTH (0.060 at the cowl), before the cowl face at 0.046
                                                          ESTIMATE
  wing-root fillets from 0.30 to 0.52 of LENGTH, 0.022 half-width, 0.014 half-height
                                                          ESTIMATE
  exhaust stacks: 6 a side, 0.125 to 0.205 of LENGTH, 0.012 of LENGTH below the thrust line,
    28 mm radius, 0.16 m long, raked aft and out         ESTIMATE (the source is silent)
  cowl guns along the upper cowl from 0.157 to 0.065 of LENGTH, 0.09 m off the centerline;
    wing cannon at 2.55 m, muzzles 0.17 m ahead of the leading edge
                                                          ESTIMATE: positions
  pitot on the left wing at 4.6 m, 0.35 m ahead of the leading edge; antenna mast from 0.575 to
    0.625 of LENGTH, raked aft                            ESTIMATE
  main-gear leg covers 0.30 x 0.50 m on the legs; tailwheel doors 0.26 x 0.12 m, open
                                                          ESTIMATE
  additions sink at least 0.02 m into what they sit on   modeling choice: no coplanar faces (DP0)
Open: 1446's wartime tail marking, "White 46" + a red lightning bolt with white borders on the
lower rudder (Vintage Aviation News, text only; no photo found), is not drawn.
Frame: glTF, +x forward, +y up, +z right, meters. Origin: the wing root's quarter chord on the
thrust line, standing in for the CG (ESTIMATE). Pose: gear down, thrust line level (R3 P13).
The wing is two panels a side, broken at the main-gear station on the one-panel surface (see below).
Leaves out: the cockpit interior, and moving control surfaces.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'ki84'
# --- CITED
SPAN = 11.238
LENGTH = 9.92
WING_AREA = 21.0
BLADES = 4
ROOT_T, TIP_T = 0.165, 0.08
FUS_HINOMARU_AT = 0.57        # of LENGTH aft of the spinner tip (Task 1's photo ratio)
HINOMARU_BORDER_M = 0.075     # white border
ID_STRIP_TO = 1 / 3           # of the half-span, from the root
# --- ESTIMATE
PROP_DIAMETER = 3.05
TAPER = 0.53
DIHEDRAL_DEG = 6.0
GEAR_RETRACTS = 'inboard'     # 'inboard', 'aft', or None for fixed gear (not rigged)
TAILWHEEL_RETRACTS = True
UPPER, LOWER = 'ijaGreen', 'underside'
NOSE_X = 0.359                # spinner tip ahead of the origin, of LENGTH
WING_Y = -0.055               # wing root chord line below the thrust line, of LENGTH
# (x aft of the spinner tip, half-width, half-height, center y, exponent), tail to nose; of LENGTH
FUSELAGE = [
    (0.989, 0.006, 0.010, 0.025, 2.0),
    (0.863, 0.025, 0.038, 0.020, 2.2),
    (0.661, 0.042, 0.058, 0.010, 2.2),
    (0.480, 0.052, 0.073, 0.005, 2.2),
    (0.308, 0.058, 0.073, 0.000, 2.2),
    (0.157, 0.065, 0.067, 0.000, 2.0),
    (0.051, 0.060, 0.060, 0.000, 2.0),
    (0.046, 0.035, 0.035, 0.000, 2.0),
]
CANOPY = [(0.560, 0.005, 0.005, 0.062), (0.490, 0.030, 0.030, 0.071), (0.400, 0.033, 0.036, 0.073), (0.345, 0.005, 0.005, 0.067)]
TAILPLANE = dict(span=0.36, le=0.867, root=0.120, taper=0.55, y=0.015, sweep=8.0)  # span of SPAN; the rest of LENGTH
FIN = dict(root=0.131, taper=0.54, height=0.136, y=0.030)                         # trailing edge at the tail
PROP = dict(hub=0.036, chord=0.026, spinner_r=0.030, spinner_len=0.048)            # hub = 0.75 x spinner_len: tip at NOSE_X
GEAR = dict(x=0.0, z=0.178, length=0.165, wheel_r=0.033, wheel_w=0.020)            # x, length, wheel of LENGTH; z of SPAN
TAILWHEEL = dict(at=0.870, y=-0.015, length=0.045, wheel_r=0.012, wheel_w=0.008)

# --- DP0 detail (ESTIMATE unless the header cites it)
SEGMENTS = 96                 # fuselage ring segments (was 16)
SUBDIVIDE = 6                 # Catmull-Rom stations between authored ones
SPAN_SEGMENTS = 1             # spans per wing piece: sections are linear in span, so more add no shape
# Wing and tail sections: AIRFOIL_STATIONS_FINE plus more of the nose and the mid-chord, so the section's curve reads.
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
# A cowling lip: the cowl steps in from 0.060 to 0.057 of LENGTH over the 0.002 ahead of its last station.
FUSELAGE = FUSELAGE[:-1] + [(0.049, 0.057, 0.057, 0.000, 2.0), FUSELAGE[-1]]
CANOPY_FRAMES = (0.535, 0.490, 0.445, 0.400)  # of LENGTH aft of the spinner tip
AILERON = (0.58, 0.96, 0.76)  # half-span fractions, hinge chord fraction
FLAP = (0.11, 0.56, 0.80)
ELEVATOR = (0.08, 0.97, 0.70)  # of the tailplane half-span
RUDDER = (0.05, 0.93, 0.68)   # of the fin height
EXHAUSTS = dict(count=6, x0=0.125, x1=0.205, y=-0.012, r=0.028, length=0.16)  # per side; x, y of LENGTH; r, length m
FILLET = dict(le=0.30, te=0.52, half_w=0.022, half_h=0.014)  # of LENGTH: x span behind the spinner tip, bulge
EMBED_M = 0.02                # every addition sinks at least this far into what it sits on

L, S = LENGTH, SPAN


def X(f):
    """A fraction of LENGTH aft of the spinner tip, as glTF x."""
    return (NOSE_X - f) * L


# The fuselage's own lofted stations (the kit's refinement), for placing fittings on its skin.
_FUS, _ = kit._refine([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], SUBDIVIDE)


def fus_section(f):
    """(half-width, half-height, center y, exponent) of the lofted fuselage at X(f), linear between rings."""
    x = X(f)
    i = next(k for k in range(len(_FUS) - 1) if _FUS[k][0] <= x <= _FUS[k + 1][0])
    t = (x - _FUS[i][0]) / (_FUS[i + 1][0] - _FUS[i][0])
    return tuple(_FUS[i][c] + (_FUS[i + 1][c] - _FUS[i][c]) * t for c in (1, 2, 3, 4))


def fus_side_z(f, y):
    """The fuselage skin's |z| at X(f), height y (the superellipse solved for z)."""
    hw, hh, cy, n = fus_section(f)
    return hw * max(0.0, 1.0 - abs((y - cy) / hh) ** n) ** (1.0 / n)


def fus_top_y(f, z):
    """The fuselage skin's upper y at X(f), |z|."""
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
    """The wing's leading-edge x at span station z."""
    return 0.25 * root_chord - abs(z) * tan_sw


def wing_y(z):
    """The wing's chord-line height at span station z."""
    return WING_Y * L + abs(z) * tan_di


with m.tagged('fuselage'):
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=LOWER)
    # Wing-root fillets: a fairing loft each side over the wing's root, rising just above its upper
    # surface and sunk into the fuselage side (ESTIMATE). Pointed at both ends.
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = WING_Y * L + 0.55 * ROOT_T * root_chord - FILLET['half_h'] * L   # its top 0.55 x the root's thickness above the chord (0.50 at the surface)
    fz = fus_side_z(mid, fy) + FILLET['half_w'] * L - 0.08                 # its inner edge 0.08 m inside the side
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, WING_Y * L),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, WING_Y * L)],
                   segments=24, center_z=side * fz, lower_role=LOWER, subdivide=4)
# Loft caps (planar) share one chart per (tag, role) inside shared_chart(); loft sides keep their own
# analytic charts. No marking reaches a cap: every cap faces +-z or +-x, and each wing marking's axis
# is x or y with its tags' caps facing away (FACING_MIN), so the overlap paints only uniform paint.
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', UPPER, [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], [X(f) for f in CANOPY_FRAMES],
             bar=0.018, segments=48, subdivide=4)
# The wing is laid as panels broken at the main-gear station, so its skin carries vertices over
# the wheel wells (aircraftRigs.test.ts measures a retracted leg against skin vertices). Each
# break section is the one-panel loft's own section there: chord, absolute thickness, leading
# edge and dihedral rise all interpolate linearly, so the panels trace the same surface.
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
# The rudder's trailing edge is vertical at the tail, so the model's aftmost point is X(1).
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
        m.gear_leg('dark', (g['x'] * L, hinge_y, side * g['z'] * S), g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L,
                   node=name if GEAR_RETRACTS else None)
    m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
               node='Tailwheel' if TAILWHEEL_RETRACTS else None)
with m.tagged('fittings'), m.shared_chart():
    # Main-gear leg covers, on each leg node, outboard of the strut with their inner face EMBED_M
    # inside it (ESTIMATE); they fold with the leg.
    strut_r = 0.18 * g['wheel_r'] * L
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.box('dark', (g['x'] * L, hinge_y - 0.55 * g['length'] * L, side * (g['z'] * S + strut_r - EMBED_M + 0.006)), (0.30, 0.50, 0.012), node=name)
    # Exhaust stacks, EXHAUSTS['count'] a side: each a short tube from 0.05 m inside the cowl side,
    # raked aft and out, its start cap at least EMBED_M inside the skin.
    e = EXHAUSTS
    ey = e['y'] * L
    for side in (-1, 1):
        for k in range(e['count']):
            f = e['x0'] + (e['x1'] - e['x0']) * k / (e['count'] - 1)
            m.revolve('dark', (X(f), ey, side * (fus_side_z(f, ey) - 0.05)), (-1.0, -0.1, side * 0.6),
                      [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 12)
    # Guns (armament per the header): barrels only, the breeches are inside.
    # Cowl guns lie along the upper cowl, their axis 4 mm under the skin, so their tops show in the troughs.
    gx0, gx1, gz, gr = 0.157, 0.065, 0.09, 0.012
    gy0, gy1 = fus_top_y(gx0, gz) - 0.004, fus_top_y(gx1, gz) - 0.004
    glen = math.hypot(X(gx1) - X(gx0), gy1 - gy0)
    gel = math.degrees(math.atan2(gy1 - gy0, X(gx1) - X(gx0)))
    cz = 2.55   # wing cannon span station
    for side in (-1, 1):
        m.gun_barrel('dark', (X(gx0), gy0, side * gz), 0.0, gel, glen, gr)
        m.gun_barrel('dark', (le_x(cz) - 0.38, wing_y(cz), side * cz), 0.0, 0.0, 0.55, 0.016)
    # Pitot, left wing, on the chord line: its aft end 0.10 m inside the leading edge.
    pz = -4.6
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.35, wing_y(pz), pz), 0.008, sides=6)
    # Antenna mast, raked aft, its foot 0.035 m under the spine.
    m.strut('dark', (X(0.575), fus_top_y(0.575, 0.0) - 0.035, 0.0), (X(0.625), 0.115 * L, 0.0), 0.012, 0.006, sides=6)
    # Tailwheel doors, open, their tops sunk into the fuselage bottom (ESTIMATE).
    for side in (-1, 1):
        m.box('dark', (X(tw['at']) + 0.05, tw['y'] * L - 0.08, side * 0.075), (0.26, 0.12, 0.010))

# --- Markings. A disc marks samples within its radius of its plane whose normal is within ~70 deg
# of its axis; tags keep each to its parts.
red_wing = 0.55
for side in (-1, 1):
    z = side * 0.70 * S / 2
    x = le_x(z) - 0.45 * chord_at(z)
    for up in (1.0, -1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=red_wing + HINOMARU_BORDER_M, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0.0, up, 0.0), radiusM=red_wing, color='hinomaruRed')
    # Fuselage: centered on the skin at mid-depth, the white border's outer edge 0.85 of the local depth.
    hw, hh, cy, _n = fus_section(FUS_HINOMARU_AT)
    outer = 0.85 * hh
    center = (X(FUS_HINOMARU_AT), cy, side * hw)
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=center, axis=(0.0, 0.0, float(side)), radiusM=outer - HINOMARU_BORDER_M, color='hinomaruRed')
    # Leading-edge ID strip: everything on the wing facing forward, from inside the root to the cited 1/3 half-span.
    # Its origin sits mid-strip so its reach (the farthest point, ~1 m) keeps it off the flaps' forward faces
    # 1.8 m aft, inside the hinge gaps.
    zi, zo = 0.30, ID_STRIP_TO * S / 2
    hs = (zo - zi) / 2
    m.marking('polygon', tags=['wing'], origin=(le_x(0.0), WING_Y * L, side * (zi + zo) / 2), axis=(1.0, 0.0, 0.0), uDir=(0.0, 0.0, 1.0),
              points=[(-hs, -0.6), (hs, -0.6), (hs, 0.6), (-hs, 0.6)], color='idYellow')
    # Exhaust soot streaks aft of the stacks. v = axis x uDir = -side * y, so v = -side * (y above the stacks).
    streak = [(-0.9, -0.12), (1.3, -0.30), (1.3, 0.10), (-0.9, 0.12)]   # (aft of the last stack, y above the stacks)
    m.marking('polygon', tags=['fuselage'], origin=(X(EXHAUSTS['x1']), EXHAUSTS['y'] * L, 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
# Walkway wear on the left wing root, where the pilot climbed in (ESTIMATE).
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.0), -1.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-0.9, -0.25), (0.6, -0.25), (0.6, 0.35), (-0.9, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
# Landing light: a lens on the left wing's leading edge (ESTIMATE position).
m.marking('disc', tags=['wing'], center=(le_x(-3.2) - 0.02, wing_y(-3.2), -3.2), axis=(1.0, 0.0, 0.0), radiusM=0.09, color='lensClear')
m.export(out)
