# tools/models/blender/p-38-lightning.py
"""Lockheed P-38L Lightning. Original work, AGPL-3.0-or-later (R3 fallback, Task 16).

Built in Blender because the Sketchfab pick (manilov.ap's p38) measures 12.13 m long at the cited
15.85 m span, +5.2% over the P-38L's 11.53 m (R3 plan P10's 4%; R3 ledger, Task 8). Rebuilt to the
Ki-84's level in DP1 (2026-09-28): fine sections, a framed bubble canopy, control surfaces, twisted
propellers, turbosupercharger bulges, exhausts, nose guns and a baked skin.

Figures (read 2026-09-27, English Wikipedia "Lockheed P-38 Lightning", Specifications (P-38L)):
  span 15.85 m (52 ft 0 in), length 11.53 m (37 ft 10 in),
    wing area 30.43 m2 (327.5 sq ft)                        CITED
  two 3-bladed propellers                                   CITED (blade count; Curtiss electric)
  airfoil thickness 16% root (NACA 23016) / 12% tip
    (NACA 4412)                                             CITED (camber not modeled: the kit's
                                                            section is symmetric)
  propeller diameter 3.51 m                                 ESTIMATE (the source is silent)
  taper 0.40, an unswept quarter chord, dihedral 5.5 deg   ESTIMATE
  boom spacing, gondola and boom sections, canopy, tail,
  gear track and leg lengths (fractions below)              ESTIMATE
  tricycle gear, all three legs retracting aft              ESTIMATE of the motion and angles
  natural metal (role naturalMetal)                         ESTIMATE
DP1 detail figures (read 2026-09-28):
  armament: "four M2 Browning machine guns, and one Hispano 20 mm autocannon with 150 rounds" in the nose
                                                            CITED, English Wikipedia "Lockheed P-38 Lightning",
                                                            read 2026-09-28 (barrels only; the breeches are
                                                            inside). The layout of the five muzzles, their
                                                            lengths and the nose's blunt tip they leave: ESTIMATE
  turbosuperchargers "positioned behind the engines, the exhaust side of the units exposed along the dorsal
    surfaces of the booms"                                  CITED, the same page and date; so a bulge on the top
                                                            of each boom behind the wing trailing edge with a dark
                                                            exhaust bucket. Its size and station: ESTIMATE
  national insignia: the 1943 star-and-bar. Bars added to the roundel "with an Insignia Red outline"
    (June 1943), the red outline replaced by Insignia Blue by AN-I-9 amendment 14 August 1943 (TO 07-1-1 of
    24 September 1943 for field units)                      CITED, English Wikipedia "United States military
                                                            aircraft national insignia", read 2026-09-28. This
                                                            model wears the blue-outline (post-August 1943) style
                                                            as a P-38L (1944-45); the page gives no proportions,
                                                            FS numbers or positions, so all of the following are
                                                            ESTIMATE:
  geometry: blue disc of diameter d, a white five-point star in it (points on a circle 0.40 d in radius, apex
    up), white bars 0.5 d long and 0.33 d high either side, a blue outline 0.125 d wide around the bars; d 1.0 m
    on the wings (bars spanwise, the star's apex forward, on all four wing surfaces, centered at 4.3 m from
    the centerline and 0.42 of the local chord aft of the leading edge), d 0.65 m on each gondola side
    (centered 0.40 of LENGTH aft of the nose, above the wing root)
                                                            ESTIMATE
  colors: usaaInsigniaBlue, usaaInsigniaWhite (colors.ts)   ESTIMATE
  anti-glare panel: olive drab on the nose top from the nose to the windshield, 0.34 m half-width tapering to
    0.14 m at the nose                                      ESTIMATE (finish and extent from no source read)
  propeller-tip yellow, the outer 14% of each blade's front face
                                                            ESTIMATE (no source read)
  no unit codes, serial numbers or nose art
  control surfaces (hinge chord fractions; spans of the half-span, tailplane half-span or fin height):
    inboard flaps 0.09-0.27 and outboard flaps 0.375-0.62 at 0.74, ailerons 0.66-0.96 at 0.76,
    elevator 0.06-0.86 of the half-span between the booms at 0.70, rudders 0.05-0.93 at 0.68
                                                            ESTIMATE, period three-view proportions
  canopy frames at 0.395, 0.360, 0.315, 0.275, 0.235 of LENGTH aft of the nose, 18 mm bars
                                                            ESTIMATE
  cowling lip: a step of 0.003 of LENGTH ahead of the cowl face's shoulder
                                                            ESTIMATE
  chin intercooler scoop under each engine cowling, 0.19 m half-width, with a dark opening
                                                            ESTIMATE (the source is silent)
  exhaust stacks: 5 a side on each boom cowling, 40 mm radius, 0.20 m long, raked aft and out
                                                            ESTIMATE (the source is silent)
  wing-root fillets at the gondola (0.30 to 0.54 of LENGTH) and at both sides of each boom
                                                            ESTIMATE
  gear: leg covers, drag braces and outboard main-gear doors ride the leg nodes; nose-gear doors likewise
                                                            ESTIMATE
  pitot on the left wing at 6.0 m, antenna mast behind the canopy, landing-light lens on the left leading edge
    at 5.6 m, soot streaks aft of the stacks, walkway wear at the left wing root
                                                            ESTIMATE
  additions sink at least 0.02 m into what they sit on     modeling choice: no coplanar faces (DP0)
  Counter-rotation is not modeled: both propellers carry the same blade handedness (the kit's propeller has no
  mirrored form), and the sim spins them alike.
Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
thrust line (ESTIMATE). Pose: gear down, thrust line level (R3 P13).
Leaves out: the fins' lower halves, the wing-root intercooler scoops, radiators' cheek scoops, cockpit interior.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'p38'
# --- CITED
SPAN, LENGTH, WING_AREA = 15.85, 11.53, 30.43
BLADES = 3
ROOT_T, TIP_T = 0.16, 0.12                          # NACA 23016 / 4412
# --- ESTIMATE
PROP_DIAMETER = 3.51
TAPER, DIHEDRAL_DEG = 0.40, 5.5
NOSE_X, WING_Y = 0.36, -0.004
BOOM_Z = 0.16                                        # of SPAN
METAL = 'naturalMetal'
# (x aft of the nose, half-width, half-height, center y, exponent), tail to nose; of LENGTH
GONDOLA = [(0.62, 0.006, 0.008, 0.010, 2.0), (0.56, 0.026, 0.033, 0.0125, 2.2), (0.50, 0.045, 0.055, 0.015, 2.2),
           (0.40, 0.052, 0.062, 0.0125, 2.2), (0.30, 0.055, 0.065, 0.010, 2.2), (0.21, 0.053, 0.060, 0.005, 2.2),
           (0.12, 0.050, 0.055, 0.000, 2.2), (0.06, 0.042, 0.045, -0.003, 2.1), (0.03, 0.030, 0.032, -0.005, 2.0),
           (0.014, 0.015, 0.016, -0.0075, 2.0)]
CANOPY = [(0.44, 0.004, 0.004, 0.058), (0.40, 0.024, 0.024, 0.066), (0.34, 0.032, 0.034, 0.070), (0.27, 0.033, 0.031, 0.068),
          (0.215, 0.026, 0.020, 0.062), (0.195, 0.004, 0.004, 0.057)]
CANOPY_FRAMES = (0.395, 0.360, 0.315, 0.275, 0.235)
BOOM = [(0.985, 0.006, 0.008, 0.020, 2.0), (0.92, 0.012, 0.016, 0.019, 2.2), (0.85, 0.020, 0.026, 0.018, 2.2),
        (0.70, 0.026, 0.033, 0.012, 2.2), (0.55, 0.030, 0.038, 0.005, 2.2), (0.35, 0.052, 0.060, -0.005, 2.2),
        (0.20, 0.055, 0.058, 0.000, 2.2), (0.11, 0.050, 0.050, 0.000, 2.0), (0.090, 0.046, 0.046, 0.000, 2.0),
        (0.081, 0.043, 0.043, 0.000, 2.0), (0.078, 0.033, 0.033, 0.000, 2.0)]
PROP = dict(hub=0.068, chord=0.027, spinner_r=0.028, spinner_len=0.045)
FIN = dict(root=0.12, taper=0.6, height=0.14, y=0.02)
TAILPLANE = dict(le=0.86, root=0.10, taper=0.9, y=0.02, overhang=0.40)
GEAR = dict(ahead=-0.01, below=0.045, length=0.15, wheel_r=0.030, wheel_w=0.018)
NOSE_GEAR = dict(at=0.08, y=-0.045, wheel_r=0.022, wheel_w=0.014)

# --- DP1 detail (ESTIMATE, see the header)
SEGMENTS = 72
BOOM_SEGMENTS = 40
SUBDIVIDE = 6
SPAN_SEGMENTS = 1
STATIONS = kit.AIRFOIL_STATIONS_FINE
FLAPS = ((0.09, 0.27, 0.74), (0.375, 0.62, 0.74))
AILERON = (0.66, 0.96, 0.76)
ELEVATOR = (0.06, 0.86, 0.70)                        # of the half-span to the boom's inner side
RUDDER = (0.05, 0.93, 0.68)
FILLET = dict(le=0.30, te=0.54, half_w=0.020, half_h=0.012)
BOOM_FILLET = dict(le=0.31, te=0.52, half_w=0.012, half_h=0.008)
EXHAUSTS = dict(count=5, f0=0.190, f1=0.115, angle=62.0, r=0.040, length=0.20)
TURBO = dict(f0=0.680, f1=0.480, half_w=0.24, rise=0.24)
INSIGNIA = dict(wing_d=1.0, wing_z=4.3, wing_chord=0.42, side_d=0.65, side_at=0.40, side_y=0.65)
BLADE_SECTIONS = [(0.13, 0.9, 44.0), (0.35, 1.05, 34.0), (0.6, 1.0, 26.0), (0.85, 0.8, 20.0), (1.0, 0.45, 17.0)]
EMBED_M = 0.02

L, S = LENGTH, SPAN


def X(f):
    return (NOSE_X - f) * L


def _at(refined, x):
    """(half-width, half-height, center y, exponent) of a refined loft at x, linear between rings."""
    i = next(k for k in range(len(refined) - 1) if refined[k][0] <= x <= refined[k + 1][0])
    t = (x - refined[i][0]) / (refined[i + 1][0] - refined[i][0])
    return tuple(refined[i][c] + (refined[i + 1][c] - refined[i][c]) * t for c in (1, 2, 3, 4))


_GON, _ = kit._refine([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in GONDOLA], SUBDIVIDE)
_BOOM, _ = kit._refine([(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in BOOM], SUBDIVIDE)


def gon_section(f):
    return _at(_GON, X(f))


def boom_section(f):
    return _at(_BOOM, X(f))


def boom_top(f):
    _hw, hh, cy, _n = boom_section(f)
    return cy + hh


def boom_bottom(f):
    _hw, hh, cy, _n = boom_section(f)
    return cy - hh


def boom_point(z, f, angle_deg):
    """A point on the boom skin centered at z, at f of LENGTH aft of the nose, ring angle (0 = top, 90 = side)."""
    hw, hh, cy, n = boom_section(f)
    t = math.radians(angle_deg)
    c, s = math.cos(t), math.sin(t)
    return (X(f), cy + hh * math.copysign(abs(c) ** (2 / n), c), z + hw * math.copysign(abs(s) ** (2 / n), s))


out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)
bz = BOOM_Z * S
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
tan_sw, tan_di = math.tan(math.radians(sweep)), math.tan(math.radians(DIHEDRAL_DEG))
le_x = 0.25 * root_chord


def chord_at(z):
    return root_chord + (tip_chord - root_chord) * abs(z) / (S / 2)


def wing_le(z):
    return le_x - abs(z) * tan_sw


def wing_y(z):
    return WING_Y * L + abs(z) * tan_di


def wing_thick(z):
    """The wing's absolute thickness at |z| (the loft interpolates it linearly)."""
    return ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * abs(z) / (S / 2)


def fillet(zc_side, direction, f0, f1, half_w, half_h, side_z_at):
    """A fairing loft along the wing's upper surface, its inner edge 0.08 m inside the surface it meets.
    `zc_side` is the meeting surface's |z| at mid-chord; `direction` +1 puts the fairing outboard of it."""
    mid = (f0 + f1) / 2
    zw = zc_side
    fy = wing_y(zw) + 0.55 * wing_thick(zw) - half_h * L
    zc = side_z_at(mid, fy) + direction * (half_w * L - 0.08)
    return [(X(f1), 0.004 * L, 0.004 * L, wing_y(zw)), (X(mid), half_w * L, half_h * L, fy), (X(f0), 0.004 * L, 0.004 * L, wing_y(zw))], zc


with m.tagged('fuselage'), m.shared_chart():
    m.fuselage(METAL, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in GONDOLA], segments=SEGMENTS, subdivide=SUBDIVIDE)
    fl = FILLET
    hw_m, hh_m, cy_m, n_m = gon_section((fl['le'] + fl['te']) / 2)

    def gon_side(_f, y):
        return hw_m * max(0.0, 1.0 - abs((y - cy_m) / hh_m) ** n_m) ** (1.0 / n_m)

    for side in (-1, 1):
        rings, zc = fillet(0.7, 1, fl['le'], fl['te'], fl['half_w'], fl['half_h'], gon_side)
        m.fuselage(METAL, rings, segments=24, center_z=side * zc, subdivide=4)
with m.tagged('canopy'), m.shared_chart():
    m.canopy('glazing', METAL, [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], [X(f) for f in CANOPY_FRAMES],
             bar=0.018, segments=48, subdivide=4)

controls = [(a * S / 2, b * S / 2, h) for a, b, h in (*FLAPS, AILERON)]
with m.tagged('wing'), m.shared_chart():
    breaks = [0.0, bz, S / 2]
    for z0, z1 in zip(breaks, breaks[1:]):
        c0, c1 = chord_at(z0), chord_at(z1)
        a0, a1 = wing_thick(z0), wing_thick(z1)
        m.wing(METAL, le_x - z0 * tan_sw, WING_Y * L + z0 * tan_di, c0, c1, 2 * z1, sweep_deg=sweep,
               dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0,
               stations=STATIONS, span_segments=SPAN_SEGMENTS, controls=controls)
tp = TAILPLANE
tp_half = bz + tp['overhang']
inner = bz - 0.32                                    # the elevator ends 0.32 m short of the boom's axis
with m.tagged('tailplane'), m.shared_chart():
    m.wing(METAL, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, 2 * tp_half,
           thickness=0.10, stations=STATIONS, span_segments=SPAN_SEGMENTS,
           controls=[(ELEVATOR[0] * tp_half, ELEVATOR[1] * tp_half, ELEVATOR[2])])
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root

for i, z in enumerate((-bz, bz), start=1):
    side = 1 if z > 0 else -1
    with m.tagged('boom'), m.shared_chart():
        m.fuselage(METAL, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in BOOM], segments=BOOM_SEGMENTS, subdivide=SUBDIVIDE, center_z=z)
        # Fairings where the wing meets the boom's two sides.
        bf = BOOM_FILLET
        mid = (bf['le'] + bf['te']) / 2
        hw_b, hh_b, cy_b, n_b = boom_section(mid)

        def boom_side(_f, y):
            return hw_b * max(0.0, 1.0 - abs((y - cy_b) / hh_b) ** n_b) ** (1.0 / n_b)

        for d in (-1, 1):
            zw = bz + d * boom_side(mid, wing_y(bz))
            rings, zc = fillet(abs(zw), d * side * 1, bf['le'], bf['te'], bf['half_w'], bf['half_h'], lambda _f, y: 0.0)
            # zc above is the wing-surface offset only; the fairing's center is the boom's side plus its own offset.
            m.fuselage(METAL, rings, segments=24, center_z=side * (bz + d * (boom_side(mid, rings[1][3]) + bf['half_w'] * L - 0.08)), subdivide=4)
        # Cowling chin intercooler scoop: a boxy loft under the cowl, its top 0.08 m inside it, and a dark opening.
        sc = [(0.150, 0.04, 0.04), (0.128, 0.17, 0.10), (0.105, 0.19, 0.10), (0.090, 0.19, 0.10)]
        scoop = [(X(f), hw, hh, boom_bottom(f) - hh + 0.08 + 0.02 * 0, 3.0) for f, hw, hh in sc]
        m.fuselage(METAL, scoop, segments=24, subdivide=3, center_z=z)
        xf = X(sc[-1][0])
        m.fuselage('dark', [(xf - 0.03, 0.15, 0.07, scoop[-1][3]), (xf + 0.012, 0.15, 0.07, scoop[-1][3])], segments=24, center_z=z)
    with m.tagged('turbo'), m.shared_chart():
        tb = TURBO
        fs = [tb['f0'] - (tb['f0'] - tb['f1']) * k / 6 for k in range(7)]
        rises = [-0.02, 0.07, 0.17, tb['rise'], 0.19, 0.08, -0.02]
        hh_t = 0.20
        stations = []
        for f, r in zip(fs, rises):
            h_ = hh_t if 0 < r else 0.05
            hw_ = tb['half_w'] if 0 < r else 0.06
            stations.append((X(f), hw_, h_, boom_top(f) + r - h_))
        m.fuselage(METAL, stations, segments=32, subdivide=4, center_z=z)
        # Exhaust bucket: a dark ring on the bulge's crest, sunk 0.03 m into it.
        fb = (tb['f0'] + tb['f1']) / 2 + 0.008
        top = boom_top(fb) + tb['rise'] - 0.05
        m.revolve('dark', (X(fb), top, z), (0.0, 1.0, 0.0), [(0.0, 0.12), (0.045, 0.11)], 20)
    with m.tagged('fin'), m.shared_chart():
        m.fin(METAL, X(1.0) + fin_root, FIN['y'] * L - 0.04, fin_root, fin_tip, fin_h,
              sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), center_z=z, stations=STATIONS,
              span_segments=SPAN_SEGMENTS, controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2])])
    pr = PROP
    with m.tagged('prop'), m.shared_chart():
        m.propeller('dark', (X(pr['hub']), 0.0, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                    pr['spinner_len'] * L, node=f'Prop{i}', blade_sections=BLADE_SECTIONS)

g = GEAR
gy = -g['below'] * L
ground_y = gy - g['length'] * L
hinge = {}
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        z = side * bz
        hinge[name] = (wing_le(z) + g['ahead'] * L, gy, z)
        m.gear_leg('dark', hinge[name], g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L, node=name)
    ng = NOSE_GEAR
    nose_hinge = (X(ng['at']), ng['y'] * L, 0.0)
    m.gear_leg('dark', nose_hinge, ng['y'] * L - ground_y, ng['wheel_r'] * L, ng['wheel_w'] * L, node='GearNose')
with m.tagged('fittings'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        hx, hy, hz = hinge[name]
        gw = g['wheel_w'] * L
        # An outboard door hanging beside the wheel (its top inside the boom), an inboard one, and a drag brace forward.
        m.box('dark', (hx, hy - 0.55, hz + side * (gw / 2 + 0.04)), (0.36, 1.00, 0.02), node=name)
        m.box('dark', (hx, hy - 0.45, hz - side * (gw / 2 + 0.04)), (0.30, 0.80, 0.02), node=name)
        m.strut('dark', (hx - 0.02, hy - 0.10, hz), (hx + 0.45, hy - 0.95, hz), 0.025, sides=6, node=name)
    nx, ny, nz = nose_hinge
    nw = ng['wheel_w'] * L
    for side in (-1, 1):
        m.box('dark', (nx, ny - 0.35, nz + side * (nw / 2 + 0.04)), (0.34, 0.60, 0.02), node='GearNose')
    m.strut('dark', (nx - 0.02, ny - 0.10, 0.0), (nx + 0.35, ny - 0.75, 0.0), 0.020, sides=6, node='GearNose')
    # Exhaust stacks: EXHAUSTS['count'] a side on each boom cowling, raked aft and out.
    e = EXHAUSTS
    for zb in (-bz, bz):
        for sd in (-1, 1):
            for k in range(e['count']):
                f = e['f0'] + (e['f1'] - e['f0']) * k / (e['count'] - 1)
                px, py, pz = boom_point(zb, f, e['angle'])
                pz = zb + sd * (pz - zb)
                cy = boom_section(f)[2]
                dz, dy = pz - zb, py - cy
                nrm = math.hypot(dz, dy)
                ox, oy = dz / nrm, dy / nrm
                m.revolve('dark', (px, py - 0.04 * oy, pz - 0.04 * ox), (-1.0, 0.7 * oy, 0.7 * ox), [(0.0, e['r']), (e['length'], e['r'] * 0.85)], 10)
    # Nose armament (header): four .50 and one 20 mm, from inside the nose through its blunt tip, and beyond it.
    tip_y = -0.0075 * L
    nose_x = X(0.0)
    for zz, dy in ((-0.115, 0.06), (0.115, 0.06), (-0.075, -0.075), (0.075, -0.075)):
        m.gun_barrel('dark', (nose_x - 0.60, tip_y + dy, zz), 0.0, 0.0, 0.60 + 0.02, 0.0125)
    m.gun_barrel('dark', (nose_x - 0.60, tip_y, 0.0), 0.0, 0.0, 0.60 - 0.03, 0.020)
    # Pitot, left wing, on the chord line: its aft end 0.10 m inside the leading edge.
    pz = -6.0
    m.strut('dark', (wing_le(pz) - 0.10, wing_y(pz), pz), (wing_le(pz) + 0.45, wing_y(pz), pz), 0.008, sides=6)
    # Antenna mast behind the canopy, raked aft, its foot 0.035 m under the spine.
    f_a = 0.455
    hw_a, hh_a, cy_a, _n = gon_section(f_a)
    m.strut('dark', (X(f_a), cy_a + hh_a - 0.035, 0.0), (X(f_a + 0.03), cy_a + hh_a + 0.50, 0.0), 0.012, 0.006, sides=6)


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


# --- Markings (ESTIMATE, see the header). On a wing surface the bars run spanwise and the star's apex points
# forward: uDir spanwise, v = axis x uDir forward (up: uDir = +z; down: uDir = -z). On a gondola side v is up.
ins = INSIGNIA
for side in (-1, 1):
    z = side * ins['wing_z']
    x = wing_le(z) - ins['wing_chord'] * chord_at(z)
    roundel('wing', (x, wing_y(z), z), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), ins['wing_d'])
    roundel('wing', (x, wing_y(z), z), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0), ins['wing_d'])
    hw, hh, cy, n = gon_section(ins['side_at'])
    zs = hw * max(0.0, 1.0 - abs((ins['side_y'] - cy) / hh) ** n) ** (1.0 / n)
    roundel('fuselage', (X(ins['side_at']), ins['side_y'], side * zs), (0.0, 0.0, float(side)), (1.0, 0.0, 0.0) if side > 0 else (-1.0, 0.0, 0.0), ins['side_d'])
    # Exhaust soot streaks aft of the stacks on each boom's outer side. v = axis x uDir = -side * y.
    for zb in (-bz, bz):
        fs_ = EXHAUSTS['f1']
        sx, sy, sz = boom_point(zb, fs_, 90.0)
        sd = side
        streak = [(-0.3, -0.16), (1.3, -0.30), (1.3, 0.10), (-0.3, 0.16)]
        m.marking('polygon', tags=['boom'], origin=(sx, sy, zb + sd * (sz - zb)), axis=(0.0, 0.0, float(sd)), uDir=(-1.0, 0.0, 0.0),
                  points=[(u, -sd * v) for u, v in streak], color='exhaustSoot', effect='stain', opacity=0.5, featherM=0.15)
# Anti-glare panel: olive drab on the nose top from the windshield forward (ESTIMATE). v = axis x uDir = -z.
gx0 = X(0.212)
top = gon_section(0.212)
m.marking('polygon', tags=['fuselage'], origin=(gx0, top[2] + top[1], 0.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(0.0, -0.34), (1.2, -0.31), (1.9, -0.14), (1.9, 0.14), (1.2, 0.31), (0.0, 0.34)], color='usaaOliveDrab')
# Propeller tips: the outer 14% of each blade's front face, yellow (ESTIMATE).
R_prop = PROP_DIAMETER / 2
for zb in (-bz, bz):
    for k in range(BLADES):
        a = 2 * math.pi * k / BLADES
        er = (math.sin(a), -math.cos(a))          # (u, v) of the blade's radial direction: u = z, v = -y
        ep = (-er[1], er[0])
        r0, r1, hw_p = 0.86 * R_prop, R_prop + 0.03, 0.17
        pts = [(er[0] * r + ep[0] * s, er[1] * r + ep[1] * s) for r, s in ((r0, -hw_p), (r1, -hw_p), (r1, hw_p), (r0, hw_p))]
        m.marking('polygon', tags=['prop'], origin=(X(PROP['hub']), 0.0, zb), axis=(1.0, 0.0, 0.0), uDir=(0.0, 0.0, 1.0),
                  points=pts, color='propTipYellow')
# Walkway wear on the left wing root, where the pilot climbed in (ESTIMATE).
m.marking('polygon', tags=['wing'], origin=(0.0, wing_y(-1.0), -1.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
          points=[(-0.9, -0.25), (0.6, -0.25), (0.6, 0.35), (-0.9, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
# Landing light: a lens on the left wing's leading edge (ESTIMATE position).
m.marking('disc', tags=['wing'], center=(wing_le(-5.6) - 0.02, wing_y(-5.6), -5.6), axis=(1.0, 0.0, 0.0), radiusM=0.10, color='lensClear')
m.export(out)
