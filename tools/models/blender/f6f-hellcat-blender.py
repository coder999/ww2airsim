# tools/models/blender/f6f-hellcat-blender.py
"""Grumman F6F-5 Hellcat. Original work, AGPL-3.0-or-later.

A second Hellcat beside the Sketchfab download (content/aircraft/f6f-hellcat.glb stays): built on the
Ki-84's single-engine template (R3) as the TBM-3 is, with the same DP0 detail, so the two can be compared in
the Hangar and the new one swapped in when it is approved (docs/blender-aircraft.md, "Promoting a duplicate").
Stations are fractions of the cited length or span, except the ones fitted to content/aircraft/f6f-hellcat.json
(the stance and the stores) so that a swap needs no flight-model change; those say so.

Figures (read 2026-10-11):
  span 13.06 m (42 ft 10 in), length 10.24 m (33 ft 7 in), wing area 31.0 m2 (334 sq ft), airfoil NACA 23015.6
    root / NACA 23009 tip, 3-bladed Hamilton Standard propeller 3.99 m (13 ft 1 in)
                                                        CITED, English Wikipedia "Grumman F6F Hellcat",
                                                        Specifications (F6F-5)
  main gear retracts aft, the struts turning 90 degrees  CITED (same page, Design); the model swings the leg
                                                        aft and leaves the wheel upright: one hinge, ESTIMATE
  six .50 in wings guns, three a side                    CITED (same page, Specifications)
  taper 0.42, an unswept quarter chord, dihedral 2.5 deg    ESTIMATE, period three-view proportions
  fuselage sections, turtleback, canopy side and plan outline, cowl, tail surfaces
                                                        MEASURED from Wikimedia Commons
                                                        "Grumman F6F Hellcat 3-view line drawing.svg",
                                                        fetched 2026-10-11 as a 1,920 x 2,334 PNG
  canopy transverse rail / shoulder / roof sections     ESTIMATE, checked 2026-10-11 against the
                                                        same drawing's front view, NACA Langley
                                                        photo EL-2000-00243 (XF6F-4, 5 May 1944),
                                                        and Mark's three review views
  main wheels 0.69 m (27 in) diameter                   ESTIMATE
  stance: wheels 2.42 m below the origin at x 0.62, tailwheel at x -6.0, 1.318 m below
                                                        FITTED to f6f-hellcat.json gear.heightM / mainX /
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

NAME = 'f6f'
# --- CITED
SPAN = 13.06
LENGTH = 10.24
WING_AREA = 31.0
BLADES = 3
ROOT_T, TIP_T = 0.156, 0.09
PROP_DIAMETER = 3.99
# --- ESTIMATE
TAPER = 0.42
DIHEDRAL_DEG = 2.5
UPPER = 'seaBlue'
NOSE_X = 0.2959                # spinner tip ahead of the origin, of LENGTH
WING_Y = -0.050               # wing root chord line below the thrust line, of LENGTH
# (x aft of the spinner tip, half-width, half-height, center y, exponent), tail to nose; of LENGTH
# Read off the real airplane's Commons "Grumman F6F Hellcat 3-view line drawing.svg",
# fetched at width 1600 (returned 1,920 x 2,334), measured 2026-10-11:
# (distance aft of spinner tip, half-width, half-height, center y), all of LENGTH.
FUSELAGE = [
    (1.0000, 0.0039, 0.0171, 0.0024, 2.2),
    (0.9766, 0.0088, 0.0283, 0.0010, 2.2),
    (0.8789, 0.0215, 0.0508, -0.0039, 2.2),
    (0.7812, 0.0342, 0.0620, -0.0083, 2.2),
    (0.6836, 0.0420, 0.0781, -0.0029, 2.2),
    (0.5859, 0.0508, 0.0933, 0.0044, 2.2),
    (0.5078, 0.0586, 0.1057, 0.0105, 2.2),
    (0.4492, 0.0648, 0.1076, 0.0096, 2.2),
    (0.3906, 0.0713, 0.1047, 0.0047, 2.2),
    (0.3320, 0.0736, 0.1025, 0.0010, 2.2),
    (0.2637, 0.0752, 0.0986, -0.0029, 2.2),
    (0.1953, 0.0752, 0.0952, -0.0063, 2.0),
    (0.1465, 0.0754, 0.0881, -0.0061, 2.0),
    (0.0977, 0.0757, 0.0811, -0.0059, 2.0),
    (0.0781, 0.0723, 0.0723, 0.0000, 2.0),
    (0.0537, 0.0488, 0.0537, 0.0000, 2.0),
]
# The measured side silhouette has a blunt raked windscreen rising to a high
# forward bow, then a nearly straight roof descending aft into the turtledeck.
# The drawing's top/front views and NACA EL-2000-00243 show broad straight panes,
# not an oval bubble. Transverse ordinates remain ESTIMATE because neither source
# provides factory cross-sections. Each tuple is (x, rail half-width, shoulder
# half-width, shoulder rise above the rail, roof half-width, roof drop below the
# crown, crown y), in meters. The rail y is fitted to the local fuselage skin.
CANOPY = [
    (-2.12, 0.10, 0.095, 0.006, 0.075, 0.004, 1.12),
    (-1.84, 0.24, 0.230, 0.025, 0.180, 0.015, 1.24),
    (-1.52, 0.35, 0.340, 0.060, 0.280, 0.025, 1.34),
    (-1.22, 0.40, 0.390, 0.090, 0.320, 0.025, 1.43),
    (-0.88, 0.40, 0.390, 0.105, 0.320, 0.025, 1.51),
    (-0.62, 0.36, 0.350, 0.110, 0.290, 0.025, 1.55),
    (-0.29, 0.30, 0.285, 0.006, 0.220, 0.004, 1.01),
]
CANOPY_FRAMES = (-1.82, -1.48, -1.18, -0.88, -0.60)
TAILPLANE = dict(span=0.45, le=0.8105, root=0.166, taper=0.56, y=0.011, sweep=13.6)  # span of SPAN; the rest of LENGTH
FIN = dict(root=0.195, taper=0.4, height=0.137, y=0.049)                           # trailing edge at the tail
PROP = dict(hub=0.030, chord=0.023, spinner_r=0.026, spinner_len=0.040)             # hub = 0.75 x spinner_len
# x, z, wheel of LENGTH or SPAN; the stance is FITTED (header): the wheel bottom lands on gear.heightM below the origin.
GEAR = dict(x=0.62, z=0.118, bottom=2.42, wheel_r=0.345, wheel_w=0.20)
TAILWHEEL = dict(x=-6.0, y=-0.55, bottom=1.318, wheel_r=0.15, wheel_w=0.08)           # x, hinge y, bottom: m

SEGMENTS = 96
SUBDIVIDE = 6
SPAN_SEGMENTS = 1
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {0.0375, 0.0625, 0.125, 0.175, 0.225, 0.275, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85}))
AILERON = (0.58, 0.96, 0.76)  # half-span fractions, hinge chord fraction
FLAP = (0.12, 0.55, 0.74)
ELEVATOR = (0.08, 0.97, 0.68)
RUDDER = (0.05, 0.93, 0.62)
EXHAUSTS = dict(count=3, x0=0.150, x1=0.185, y=-0.028, r=0.030, length=0.20)
FILLET = dict(le=0.20, te=0.46, half_w=0.022, half_h=0.016)
INSIGNIA = dict(fus_at=0.690, fus_d=1.00, wing_z=0.66, wing_chord=0.42, wing_d=1.45)
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
    m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE)
    mid = (FILLET['le'] + FILLET['te']) / 2
    fy = WING_Y * L + 0.55 * ROOT_T * root_chord - FILLET['half_h'] * L
    fz = fus_side_z(mid, fy) + FILLET['half_w'] * L - 0.08
    for side in (-1, 1):
        m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, WING_Y * L),
                           (X(mid), FILLET['half_w'] * L, FILLET['half_h'] * L, fy),
                           (X(FILLET['le']), 0.004 * L, 0.004 * L, WING_Y * L)],
                   segments=24, center_z=side * fz, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    canopy_stations = []
    for x, rail_width, shoulder_width, shoulder_rise, roof_width, roof_drop, crown in CANOPY:
        f = NOSE_X - x / L
        # Sink the rail into the fuselage shoulder by DP0's standard 0.02 m.
        # At the end caps the hull can already stand above the crown, so keep a
        # thin buried wedge instead of inverting the section.
        rail_y = min(crown - EMBED_M, fus_top_y(f, rail_width) - EMBED_M)
        shoulder_y = rail_y + shoulder_rise
        roof_y = crown - roof_drop
        canopy_stations.append((x, rail_width, rail_y, shoulder_width,
                                shoulder_y, roof_width, roof_y, crown))
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
        m.box('dark', (g['x'], hinge_y - 0.55 * (g['bottom'] + hinge_y), side * (gear_z + strut_r - EMBED_M + 0.006)), (0.45, 0.95, 0.012), node=name)
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
        for gz in (3.0, 3.4, 3.8):
            gz *= side
            m.gun_barrel('dark', (le_x(gz) - 0.35, wing_y(gz), gz), 0.0, 0.0, 0.50, 0.016)
    pz = -6.2
    m.strut('dark', (le_x(pz) - 0.10, wing_y(pz), pz), (le_x(pz) + 0.40, wing_y(pz), pz), 0.009, sides=6)
    # Antenna mast aft of the canopy, raked aft.
    m.strut('dark', (X(0.488), fus_top_y(0.488, 0.0) - 0.04, 0.0), (X(0.508), fus_top_y(0.488, 0.0) + 0.42, 0.0), 0.014, 0.007, sides=6)


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
