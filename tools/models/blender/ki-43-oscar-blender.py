# tools/models/blender/ki-43-oscar-blender.py
"""Nakajima Ki-43-IIb Hayabusa ("Oscar"). Original work, AGPL-3.0-or-later.

A Hangar-only duplicate beside downloaded ki-43-oscar. The flying spec stays unchanged. Built from
kit.py. The drawing measurements describe the real airplane, not the download; stance, stores and
guns are fitted to ki-43-oscar.json.

Figures (read 2026-10-11):
  span 10.84 m (35 ft 7 in), length 8.92 m (29 ft 3 in), wing area 21.4 m2 (230 sq ft),
  airfoil NN-12 mod. 18% root / 8% tip                 CITED, English Wikipedia "Nakajima Ki-43
                                                       Hayabusa", Specifications (Ki-43-IIb)
  3-bladed metal constant-speed propeller, 2.79 m
  (9 ft 2 in) diameter                                CITED, same page and table
  two synchronized 12.7 mm Ho-103 cowl guns, 270 rpg CITED, same page and table
  Ki-43-II: Ha-115 "installed in a longer-chord
  cowling", a 3-bladed propeller, "a slightly taller
  canopy", shorter and stronger wings                 CITED, same page, Development and Variants
  Ki-43-I span 11.437 m, length 8.832 m, wing area
  22 m2; Ki-43-II span 10.837 m, length 8.92 m        CITED, Japanese Wikipedia "一式戦闘機", 諸元
  main gear pivots inward; fixed tailwheel            CITED, Greg Goebel "Nakajima Ki-27 & Ki-43",
                                                       read 2026-10-11 (one-hinge fold is ESTIMATE)

REAL-AIRPLANE MEASUREMENT (re-read 2026-10-11, second pass): Wikimedia Commons "Nakajima Ki 43-I.svg",
the article's only three-view, rasterized through Special:FilePath at 3,840 px and mirrored to face
left. It is a Ki-43-I, so the tables below are in KI-43-I DRAWING STATIONS (meters aft of its spinner
tip) and `D` maps them onto this IIb. One scale for every view: spinner tip x=58 to rudder x=2,710 over
the I's cited 8.832 m is 300.3 px/m; the top view's wingtips then span 11.46 m against the I's cited
11.437 m (+0.2%), and its traced planform's gross area is 22.2 m2 against the cited 22 m2. The thrust
line is the spinner's center row (506); heights are meters above it. The top view's centerline is row
2,851, and the front view's hub sits on the same row.

The first pass (same date) scaled this Ki-43-I drawing to the IIb's 8.92 m (297.5 px/m, 0.9% large)
instead of lengthening the cowl, put the origin 2.32 m aft of the spinner (the drawing gives 2.22 m,
cowl included), drew the wing as a straight trapezoid with an unswept quarter chord (the drawing's
leading edge is straight and square, the taper is all in the trailing edge), left out the big root
fillet, made the tailplane 3.45 m across (it is 4.36 m), the fin a trapezoid with no crown and its
rudder ending at the fuselage (the rudder runs from the crown to below the tail cone), and stood the
antenna mast behind the canopy (it is ahead of the windscreen). Every table below replaces it.

  IIb variant overrides (labeled):
  - longer-chord cowling: the IIb's extra 0.088 m of length (8.92 - 8.832) goes into the cowl, lip to
    cowl flaps (0.45-1.27 m on the drawing); everything aft moves 0.088 m back      CITED fact, ESTIMATE
                                                                                    where it goes
  - shorter wings: the drawing's straight-taper inner wing to 4.68 m, then the drawing's own rounded
    tip, moved 0.30 m inboard to the cited 5.42 m semispan. Gross area 21.33 m2 against the cited
    21.4 m2; chords are scaled by that 0.3% (AREA_FIT)                              CITED span, ESTIMATE
                                                                                    tip shape
  - slightly taller canopy: roof raised 0.08 m, tapering to nothing at the windscreen base and the
    rear deck                                                                       CITED fact, ESTIMATE
                                                                                    amount
  - 3-blade 2.79 m propeller (the drawing's is a 2-blade); no telescopic gunsight (the II has a
    reflector sight)                                                                CITED

  wing quarter chord at 30% of the IIb semispan (1.63 m): leading edge 1.565 m, trailing edge
    3.846 m on the drawing; 2.22 m aft of the IIb spinner: the model origin      DRAWING-MEASURED
    Cross-checks: the spec-fitted tailwheel (x -5.375) lands 7.51 m aft of the drawing's spinner; the
    drawn tailwheel's axle is at 7.46 m (0.05 m). The spec main wheel (x 0.348) is 1.79 m; the
    drawing's extended-wheel circle is 1.65 m, 0.30 m radius, its bottom 1.89 m under the thrust
    line (spec 1.843 m). The drawn retracted wheel sits at 1.72 m.
  fuselage side silhouette and top-view half-widths: FUSELAGE_I below. The wing hides the belly
    from 1.6 to 4.0 m; the drawn wing-root lower line (-0.69 to -0.70 m) is used there. The deck
    under the canopy is hidden and sets only the canopy rails              DRAWING-MEASURED (+/-0.01 m)
  canopy: windscreen base 2.24 m on the deck at +0.64 m; roof +0.90 m from 2.56 to 3.2 m; the
    glazed rear fairing comes down to the deck at 4.0 m; frames at 2.66 and 3.22 m; plan half-width
    0.27 m, a point at 4.0 m                                                DRAWING-MEASURED
  fin and rudder: FIN_LE / FIN_TE below. A curved dorsal fillet from 7.24 m, straight leading edge,
    rounded crown +1.38 m at 8.17 m; the rudder hinge is vertical at 8.20 m from the crown to the
    rudder's foot 0.33 m below the thrust line, under the tail cone; trailing edge 8.83 m
                                                                            DRAWING-MEASURED
  tailplane: TAILPLANE below, 4.36 m span, rounded tips, elevator hinge straight at 8.13 m from
    0.22 to 1.65 m out (a horn balance outboard), chord line +0.04 m        DRAWING-MEASURED
  wing: straight leading edge 1.565 m at 0.9 m out to 1.539 m at 5.0 m; straight trailing edge 4.009 m
    at 1.0 m, 0.2615 m forward per meter out; root fillet FILLET_I; dihedral 5.7 deg (front view,
    mid-thickness); chord line -0.44 m at the root (front view -0.43, side-view root bottom -0.69)
    ailerons 2.35 m to 0.54 m short of the tip, hinge at 84% chord          DRAWING-MEASURED
  Fowler flaps 0.90-2.30 m, hinge 72% to 80% chord (retracted under the wing, not drawn)
                                                                            ESTIMATE
  antenna mast 1.475 m, deck to +1.32 m; pitot on the right wing at 4.0 m, 0.73 m ahead of the LE
                                                                            DRAWING-MEASURED
  spinner: 0.44 m long, 0.24 m radius at its base                           DRAWING-MEASURED
  proposed real-cockpit eye [-0.77, 0.715] m: height on the drawing's telescopic-sight axis
    (+0.715 m); station 2.90 m (drawing), between the canopy frames         MEASURED / ESTIMATE station
  cross-section exponents, cowl-lip ring, fin/tailplane thicknesses, transverse canopy section
                                                                            ESTIMATE
  main wheel 0.59 m diameter                                                DRAWING-MEASURED
  gear pivot z 1.40 m                                                       ESTIMATE
  wheel bottoms 1.843 m below origin at x 0.348;
  tailwheel x -5.375 and 0.595 m below origin         FITTED to ki-43-oscar.json gear fields
  cowl guns around [1.1, 0.35, +/-0.25] m             FITTED to ki-43-oscar.json combat.guns
  IJA green/gray-green, six bordered hinomaru, yellow
  leading-edge strips; exhausts, wear                 ESTIMATE (no unit photo or paint chip read)
  additions sink at least 0.02 m into supports        modeling choice: no coplanar faces (DP0)

Frame: glTF, +x forward, +y up, +z right, meters. Origin: the drawing's wing quarter-chord at
30% semispan on the thrust line. Pose: gear down, thrust line level.
Leaves out: cockpit interior, wheel-well interiors, stores/racks (attachment is spec data), unit
markings and the Ki-43's Fowler translation (the visual flaps hinge only).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'ki43b'
# --- CITED
SPAN, LENGTH, WING_AREA = 10.84, 8.92, 21.4
LENGTH_I = 8.832                      # the drawing's Ki-43-I
BLADES, PROP_DIAMETER = 3, 2.79
ROOT_T, TIP_T = 0.18, 0.08
# --- DRAWING MEASUREMENT / ESTIMATE, labeled in the header
COWL_I = (0.45, 1.27)                 # drawing: cowl lip, cowl-flap trailing edge
CANOPY_RAISE = 0.08                   # ESTIMATE of the II's "slightly taller canopy"
DIHEDRAL_DEG, ROOT_Y = 5.7, -0.44
UPPER, LOWER = 'ijaGreen', 'underside'


def D(d):
    """A Ki-43-I drawing station (m aft of its spinner tip) on this IIb: the cowl is longer."""
    lip, flaps = COWL_I
    extra = LENGTH - LENGTH_I
    if d <= lip:
        return d
    if d <= flaps:
        return lip + (d - lip) * (flaps - lip + extra) / (flaps - lip)
    return d + extra


# Drawing stations, tail to nose: (station, half-width, top, bottom, superellipse exponent).
FUSELAGE_I = [
    (8.26, .03, .12, -.30, 2.2), (8.20, .085, .16, -.33, 2.2), (8.00, .10, .18, -.359, 2.2),
    (7.60, .13, .22, -.389, 2.2), (7.20, .157, .256, -.423, 2.2), (7.00, .170, .276, -.439, 2.2),
    (6.50, .203, .323, -.479, 2.2), (6.00, .236, .369, -.519, 2.2), (5.50, .270, .416, -.559, 2.2),
    (5.00, .300, .466, -.599, 2.2), (4.60, .326, .502, -.632, 2.2), (4.20, .353, .542, -.659, 2.2),
    (4.00, .366, .579, -.666, 2.2), (3.80, .380, .61, -.676, 2.2), (3.60, .393, .64, -.682, 2.2),
    (3.20, .420, .67, -.692, 2.2), (2.80, .443, .67, -.699, 2.2), (2.60, .456, .66, -.699, 2.2),
    (2.40, .470, .64, -.696, 2.2), (2.20, .483, .655, -.689, 2.2), (2.00, .496, .656, -.679, 2.2),
    (1.60, .529, .649, -.639, 2.1), (1.40, .550, .642, -.622, 2.1), (1.27, .556, .634, -.67, 2.0),
    (1.10, .566, .632, -.712, 2.0), (0.90, .579, .629, -.696, 2.0), (0.70, .589, .612, -.682, 2.0),
    (0.60, .573, .586, -.669, 2.0), (0.50, .493, .509, -.592, 2.0), (0.45, .40, .40, -.45, 2.0),
    (0.42, .22, .22, -.22, 2.0),
]
# (station, rail half-width, crown) as drawn; the IIb raise is applied below.
CANOPY_I = [
    (3.95, .05, .61), (3.80, .107, .672), (3.60, .183, .762), (3.40, .243, .842), (3.20, .270, .88),
    (3.00, .273, .889), (2.80, .273, .90), (2.60, .268, .899), (2.50, .262, .872), (2.40, .25, .80),
    (2.32, .21, .72), (2.24, .15, .65),
]
CANOPY_FRAMES_I = (3.22, 2.66)
# Wing (top view). Straight leading and trailing edges, (station at z=1.0, change per meter out):
WING_LE_I, WING_TE_I = (1.565, -.0065), (4.009, -.2615)
# The root fillet, (z, leading station, trailing station), inside out to where the straight edges take over.
FILLET_I = [(0.0, 1.40, 5.30), (0.33, 1.40, 5.00), (0.43, 1.40, 4.60), (0.50, 1.40, 4.40), (0.56, 1.40, 4.29),
            (0.60, 1.409, 4.23), (0.65, 1.426, 4.162), (0.70, 1.456, 4.116), (0.75, 1.492, 4.079),
            (0.80, 1.529, 4.062), (0.85, 1.559, 4.049), (0.90, 1.572, 4.036)]
# The drawing's rounded tip: (distance in from the tip, fraction of the straight-taper chord, mid-chord
# shift as a fraction of that chord, + aft), applied at the IIb's tip.
WINGTIP = [(.738, 1.0, 0.0), (.638, .98, -.002), (.538, .948, -.003), (.438, .902, -.006), (.338, .834, -.009),
           (.238, .737, -.011), (.188, .677, -.014), (.138, .596, -.018), (.088, .494, -.022), (.058, .415, -.026),
           (.038, .344, -.030), (.018, .252, -.035), (.0, .12, -.045)]
AILERON_I = (2.35, .538, .84)         # inner z, distance in from the tip, hinge chord fraction
FLAP = (.90, 2.30, .72, .80)          # ESTIMATE: inner z, outer z, hinge chord fraction at each end
# Fin outer outline (side view): (height above the thrust line, station). The leading edge below the
# fuselage top (0.26 m) is hidden inside the tail cone.
FIN_LE = [(-.33, 8.00), (-.20, 8.00), (0.00, 7.85), (.20, 7.60), (.235, 7.42), (.26, 7.24), (.30, 7.31),
          (.33, 7.335), (.40, 7.38), (.50, 7.446), (.60, 7.509), (.80, 7.639), (1.00, 7.769), (1.10, 7.836),
          (1.20, 7.902), (1.25, 7.942), (1.30, 7.996), (1.33, 8.042), (1.36, 8.09), (1.375, 8.12), (1.38, 8.155)]
FIN_TE = [(-.33, 8.33), (-.32, 8.47), (-.30, 8.56), (-.28, 8.62), (-.25, 8.688), (-.20, 8.748), (-.15, 8.78),
          (-.10, 8.804), (0.0, 8.824), (.10, 8.831), (.25, 8.824), (.50, 8.814), (.60, 8.781), (.70, 8.761),
          (.80, 8.741), (.90, 8.714), (1.00, 8.684), (1.10, 8.641), (1.20, 8.574), (1.25, 8.528), (1.30, 8.471),
          (1.33, 8.425), (1.36, 8.36), (1.375, 8.30), (1.38, 8.19)]
FIN_THICKNESS = [(-.33, .08), (.30, .11), (1.00, .08), (1.30, .05), (1.375, .03), (1.38, .008)]   # ESTIMATE
RUDDER_HINGE = ((-.33, 8.20), (1.37, 8.20))
# Tailplane (top view): (z, leading station, trailing station, thickness m); chord line +0.04 m. Inboard of
# 0.17 m the trailing edge stops at the rudder hinge (the elevators' root cut-outs).
TAILPLANE_I = [(0.0, 7.30, 8.18, .12), (.17, 7.32, 8.18, .12), (.20, 7.323, 8.441, .12), (.25, 7.336, 8.541, .118), (.30, 7.346, 8.578, .116),
               (.40, 7.37, 8.594, .113), (.60, 7.416, 8.564, .106), (1.00, 7.509, 8.504, .092),
               (1.40, 7.603, 8.441, .078), (1.70, 7.673, 8.398, .068), (1.80, 7.696, 8.375, .064),
               (1.90, 7.726, 8.341, .058), (2.00, 7.773, 8.295, .05), (2.04, 7.799, 8.271, .046),
               (2.08, 7.833, 8.245, .042), (2.12, 7.879, 8.208, .036), (2.14, 7.906, 8.185, .03),
               (2.16, 7.942, 8.152, .022), (2.17, 7.969, 8.128, .016), (2.177, 8.01, 8.09, .01)]
TAILPLANE_Y = .04
ELEVATOR_I = (.22, 1.65, 8.13)
MAST_I = dict(station=1.475, base=.62, top=1.32)
PITOT = dict(z=4.0, ahead=.73)
SPINNER = dict(length=.44, radius=.24)
PROP = dict(chord=.22)
GEAR = dict(x=.572, z=1.40, y=-.42, bottom=1.890, wheel_r=.295, wheel_w=.18)
TAILWHEEL = dict(x=-5.238, y=-.25, bottom=.595, wheel_r=.085, wheel_w=.05)

SEGMENTS, SUBDIVIDE = 96, 5
STATIONS = tuple(sorted(set(kit.AIRFOIL_STATIONS_FINE) | {.0375, .0625, .125, .175, .225, .275, .35, .45, .55, .65, .75, .85}))
EMBED_M = .02
S = SPAN
HALF = S / 2


def le_s(z):
    return WING_LE_I[0] + WING_LE_I[1] * (z - 1.0)


def te_s(z):
    return WING_TE_I[0] + WING_TE_I[1] * (z - 1.0)


def tip_fraction(z):
    """(chord fraction, mid-chord shift) of the rounded tip at z."""
    u = HALF - z
    if u >= WINGTIP[0][0]:
        return 1.0, 0.0
    for (u0, k0, s0), (u1, k1, s1) in zip(WINGTIP, WINGTIP[1:]):
        if u1 <= u <= u0:
            t = (u - u0) / (u1 - u0)
            return k0 + (k1 - k0) * t, s0 + (s1 - s0) * t
    return WINGTIP[-1][1], WINGTIP[-1][2]


def _gross_area():
    n = 2000
    total = 0.0
    for i in range(n):
        z = (i + .5) * HALF / n
        total += (te_s(z) - le_s(z)) * tip_fraction(z)[0] * HALF / n
    return 2 * total


AREA_FIT = WING_AREA / _gross_area()


def wing_edges_i(z):
    """Leading and trailing drawing stations of the IIb wing at z (fillet, straight panel or tip)."""
    if z <= FILLET_I[-1][0]:
        for (z0, l0, t0), (z1, l1, t1) in zip(FILLET_I, FILLET_I[1:]):
            if z0 <= z <= z1:
                f = (z - z0) / (z1 - z0)
                le, te = l0 + (l1 - l0) * f, t0 + (t1 - t0) * f
                break
    else:
        le, te = le_s(z), te_s(z)
    k, shift = tip_fraction(z)
    c = (te - le) * AREA_FIT
    mid = le + c / 2 + shift * c
    return mid - k * c / 2, mid + k * c / 2


# Wing quarter chord at 30% semispan: the origin, in IIb stations.
_LE30, _TE30 = wing_edges_i(.3 * HALF)
ORIGIN_AFT_NOSE_M = D(_LE30 + .25 * (_TE30 - _LE30))


def X(d):
    """IIb station (m aft of the spinner tip) as glTF x."""
    return ORIGIN_AFT_NOSE_M - d


def XI(d):
    """Ki-43-I drawing station as glTF x."""
    return X(D(d))


def ring(d, w, top, bottom, exponent):
    return (XI(d), w, (top - bottom) / 2, (top + bottom) / 2, exponent)


_FUS, _ = kit._refine_shape([ring(*s) for s in FUSELAGE_I], SUBDIVIDE)


def fus_section(x):
    i = next(k for k in range(len(_FUS) - 1) if _FUS[k][0] <= x <= _FUS[k + 1][0])
    t = (x - _FUS[i][0]) / (_FUS[i + 1][0] - _FUS[i][0])
    return tuple(_FUS[i][c] + (_FUS[i + 1][c] - _FUS[i][c]) * t for c in (1, 2, 3, 4))


def fus_side_z(x, y):
    hw, hh, cy, n = fus_section(x)
    return hw * max(0.0, 1.0 - abs((y - cy) / hh) ** n) ** (1.0 / n)


def fus_top_y(x, z):
    hw, hh, cy, n = fus_section(x)
    return cy + hh * max(0.0, 1.0 - abs(z / hw) ** n) ** (1.0 / n)


def canopy_station(d, rail_width, crown_i):
    """Eight-value fitted section: measured profile and plan width, estimated transverse form."""
    x = XI(d)
    crown_y = crown_i + CANOPY_RAISE * min(1.0, max(0.0, (crown_i - .62) / (.88 - .62)))
    rail_y = fus_top_y(x, rail_width) - EMBED_M
    height = crown_y - rail_y
    return (x, rail_width, rail_y,
            .88 * rail_width, rail_y + .36 * height,
            .58 * rail_width, rail_y + .84 * height,
            crown_y)


def lerp(table, h):
    """Linear interpolation in a [(key, value)] table, keys increasing."""
    for (h0, v0), (h1, v1) in zip(table, table[1:]):
        if h <= h1:
            return v0 + (v1 - v0) * (h - h0) / (h1 - h0)
    return table[-1][1]


def wing_y(z):
    return ROOT_Y + abs(z) * math.tan(math.radians(DIHEDRAL_DEG))


def wing_thickness(z):
    k = tip_fraction(z)[0]
    root, tip = ROOT_T * (te_s(0) - le_s(0)) * AREA_FIT, TIP_T * (te_s(HALF) - le_s(HALF)) * AREA_FIT
    return k * (root + (tip - root) * z / HALF)


def le_x(z):
    return XI(wing_edges_i(abs(z))[0])


def chord_at(z):
    le, te = wing_edges_i(abs(z))
    return D(te) - D(le)


CANOPY = [canopy_station(*s) for s in CANOPY_I]
out, _opts = kit.cli_args()
m = kit.Model(NAME, skin=1024)

with m.tagged('fuselage'):
    m.fuselage(UPPER, [ring(*s) for s in FUSELAGE_I], segments=SEGMENTS, subdivide=SUBDIVIDE,
               lower_role=LOWER, refinement='shape')
with m.tagged('canopy'), m.shared_chart():
    m.faired_canopy('glazing', UPPER, CANOPY, [XI(d) for d in CANOPY_FRAMES_I], bar=.018)

tip_in = HALF - WINGTIP[0][0]
wing_z = sorted({z for z, _l, _t in FILLET_I} | {1.2, 1.6, 2.35, 3.0, 3.6, tip_in}
                | {round(HALF - u, 4) for u, _k, _s in WINGTIP})
wing_rows = []
for z in wing_z:
    le, te = wing_edges_i(z)
    wing_rows.append((z, XI(le), XI(te), wing_y(z), wing_thickness(z)))
a_in, a_tip, a_hinge = AILERON_I
# The flap's hinge is a straight line, nearly square to the fuselage: a hinge swept with the trailing edge,
# times the dihedral, would tilt the thick flap's front face 2.3 mm ahead of it (aircraftRigs C1).
flap_hinge = tuple((z, XI(le + f * (te - le))) for z, f, (le, te) in ((z, f, wing_edges_i(z)) for z, f in zip(FLAP[:2], FLAP[2:])))
controls = [(FLAP[0], FLAP[1], flap_hinge, 'Flap1'), (a_in, HALF - a_tip, a_hinge, 'Aileron')]
with m.tagged('wing'), m.shared_chart():
    m.wing_outline(UPPER, wing_rows, lower_role=LOWER, stations=STATIONS, span_segments=1, controls=controls)

e0, e1, eh = ELEVATOR_I
with m.tagged('tailplane'), m.shared_chart():
    m.wing_outline(UPPER, [(z, XI(le), XI(te), TAILPLANE_Y, t) for z, le, te, t in TAILPLANE_I], lower_role=LOWER,
                   stations=STATIONS, span_segments=1,
                   controls=[(e0, e1, ((e0, XI(eh)), (e1, XI(eh))), 'Elevator')])
with m.tagged('fin'), m.shared_chart():
    root = FIN_LE[0][0]
    heights = sorted({h for h, _ in FIN_LE} | {h for h, _ in FIN_TE} | {h for h, _ in FIN_THICKNESS})
    (h_a, s_a), (h_b, s_b) = RUDDER_HINGE
    m.fin_outline(UPPER, root, [(h - root, XI(lerp(FIN_LE, h)), XI(lerp(FIN_TE, h)), lerp(FIN_THICKNESS, h)) for h in heights],
                  stations=STATIONS, span_segments=1,
                  controls=[(h_a - root, h_b - root, ((h_a - root, XI(s_a)), (h_b - root, XI(s_b))), 'Rudder')])

sp = SPINNER
hub_x = X(0.0) - .75 * sp['length']  # the kit's spinner runs hub - L/4 to hub + 3L/4
with m.tagged('prop'), m.shared_chart():
    m.propeller('dark', (hub_x, 0., 0.), PROP_DIAMETER, BLADES, PROP['chord'], sp['radius'], sp['length'],
                blade_sections=[(.13, .9, 44.), (.35, 1.05, 33.), (.6, 1., 25.), (.85, .8, 19.), (1., .5, 16.)])

g, tw = GEAR, TAILWHEEL
with m.tagged('gear'), m.shared_chart():
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.gear_leg('dark', (g['x'], g['y'], side * g['z']), g['bottom'] + g['y'], g['wheel_r'], g['wheel_w'], node=name)
    # The tailwheel is fixed on the cited description, so do not claim a false motion node.
    m.gear_leg('dark', (tw['x'], tw['y'], 0.), tw['bottom'] + tw['y'], tw['wheel_r'], tw['wheel_w'], strut_radius=.03)

with m.tagged('fittings'), m.shared_chart():
    strut_r = .18 * g['wheel_r']
    for side, name in ((-1, 'GearL'), (1, 'GearR')):
        m.box('dark', (g['x'], g['y'] - .55 * (g['bottom'] + g['y']), side * (g['z'] - strut_r + EMBED_M - .006)), (.34, .76, .012), node=name)
    lip_x = XI(COWL_I[0])
    for side in (-1, 1):
        m.gun_barrel('dark', (lip_x - 1.05, .42, side * .25), 0., 2., 1.04, .014)
        for k in range(3):
            d, y = D(1.32) + .10 * k, -.02
            x = X(d)
            m.revolve('dark', (x, y, side * (fus_side_z(x, y) - .04)), (-1., -.12, side * .45), [(0., .025), (.16, .021)], 12)
    pz = PITOT['z']
    m.strut('dark', (le_x(pz) - .05, wing_y(pz), pz), (le_x(pz) + PITOT['ahead'], wing_y(pz), pz), .008, sides=6)
    mx = XI(MAST_I['station'])
    m.strut('dark', (mx, MAST_I['base'], 0.), (mx - .01, MAST_I['top'], 0.), .022, .008, sides=6)

border = .06
for side in (-1, 1):
    z = side * .68 * HALF
    x = le_x(z) - .43 * chord_at(z)
    for up in (1., -1.):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0., up, 0.), radiusM=.57, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0., up, 0.), radiusM=.57 - border, color='hinomaruRed')
    x = X(5.15)
    hw, hh, cy, _n = fus_section(x)
    center = (x, cy, side * hw)
    m.marking('disc', tags=['fuselage'], center=center, axis=(0., 0., float(side)), radiusM=.36, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=center, axis=(0., 0., float(side)), radiusM=.30, color='hinomaruRed')
    zi, zo = .62, 1.82
    hs = (zo - zi) / 2
    m.marking('polygon', tags=['wing'], origin=(le_x(1.2), ROOT_Y, side * (zi + zo) / 2), axis=(1., 0., 0.), uDir=(0., 0., 1.),
              points=[(-hs, -.55), (hs, -.55), (hs, .55), (-hs, .55)], color='idYellow')
    streak = [(-.65, -.10), (1.15, -.26), (1.15, .08), (-.65, .10)]
    m.marking('polygon', tags=['fuselage'], origin=(X(D(1.52)), -.02, 0.), axis=(0., 0., float(side)), uDir=(-1., 0., 0.),
              points=[(u, -side * y) for u, y in streak], color='exhaustSoot', effect='stain', opacity=.55, featherM=.15)
m.marking('polygon', tags=['wing'], origin=(-.20, wing_y(-.9), -.9), axis=(0., 1., 0.), uDir=(1., 0., 0.),
          points=[(-.8, -.22), (.55, -.22), (.55, .30), (-.8, .30)], color='walkwayDark', effect='wear', opacity=.8, featherM=.1)
m.export(out)
