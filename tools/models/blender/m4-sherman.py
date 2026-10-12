"""M4 Composite Sherman, 75 mm, as used by U.S. Army tank battalions in the Philippines.
Original work, AGPL-3.0-or-later.

CITED (U.S. Army 1944 Standard Ordnance Items Catalog, Medium Tank M4 Series): 19 ft 4 in
(5.8938 m) long, 8 ft 7 in (2.6162 m) wide, 9 ft (2.7432 m) high, 83 in track centers and
17.5 in ground clearance; the 75 mm Gun M3 in the M34A1 combination mount. The entry fits length.

DRAWING (re-measured 2026-10-11): FM 30-40 "Recognition Pictorial Manual on Armored Vehicles"
(War Department, 1943-11-03), p. 31, "Medium Tank, M4" three-view: public domain (U.S.
Government work), Wikimedia Commons "File:FM 30-40 Recognition Pictorial Manual on Armored
Vehicles 1943 (IA Fm30-401943).pdf", PDF page 35, its embedded 200 dpi bilevel scan (1984 x 1248 px).
Calibration: the side view's drawn extents (idler track to sprocket teeth, px 368..948) are the
cited length, 98.41 px/m (1.02 cm/px), x = 0 at their midpoint, ground (track bottom) row 869.
One scale holds for all three views. Cross-checks at that scale: side view turret roof 2.73 m
(the cited 9 ft is 2.74 m); front view width 258 px = 2.62 m (cited 2.616 m); front view belly
0.46 m (cited clearance 0.445 m); front view track centers 2.15 m (cited 2.108 m, +2%);
the glacis rises 0.58 m in 0.87 m, 56 degrees from vertical. The drawing's "19.3'" arrow line
runs 1.5% past the drawn tank, its "9.3'" label is 1.2% over the drawn hatch top (2.80 m), and
its "8.6'" arrow is the drawn width.
The drawing is the welded M4; the composite's cast front (rounded glacis corners, cast nose)
and everything the drawing does not show are ESTIMATES from wartime and museum photographs
(Commons "File:M4 Composite.jpg", "File:M4 composite in the General George Patton Museum.jpg").

What the first pass (2026-10-11, boxes) had, against the drawing: hull roof 1.66 m, drawn
1.98 m, its hull 6 ft 9 in wide with the tracks outside it where the drawn sponsons span the
full 8 ft 7 in over them; turret ring center 0.38 m aft, drawn at x = 0; turret roof 2.44 m,
drawn 2.73 m; gun axis 2.07 m, drawn 2.31 m; muzzle 2.91 m, drawn 2.68 m; six evenly spaced
0.31 m road wheels, drawn as three VVSS bogies of paired 0.245 m wheels; one wheel for both
sprocket and idler, drawn as a front sprocket and a smaller rear idler; return rollers over
the bogie centers, drawn trailing them; box track runs, drawn as a belt.

FM 30-40's text: "vertical sides; slopes down gently in rear, abruptly in front", so the
upper hull sides are vertical and the engine deck falls 0.21 m to the rear plate.
Frame: +x forward, +y up, +z starboard, meters, ground y = 0.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, _opts = kit.cli_args()
m = kit.Model('m4-sherman', skin=512)

OLIVE = 'oliveDrab'

# CITED.
HALF_WIDTH = 2.6162 / 2         # upper hull and sponsons
TRACK_Z = 2.1082 / 2            # 83 in track centers
CLEARANCE = 0.4445              # 17.5 in, the belly
# DRAWN (FM 30-40, 98.41 px/m). Side view unless noted.
TRACK_W = 0.42                  # front view 0.41-0.46 m; ESTIMATE within that
TRACK_T = 0.06                  # belt thickness, drawn 0.03 m line plus its outline
LOWER_HW = 0.84                 # front view: lower hull and nose 1.68 m wide between the tracks
SPONSON_Y = 1.37                # front view: sponson floor (full-width hull from here up)
ROOF = [(-2.76, 1.77), (-2.2, 1.815), (-1.6, 1.885), (-1.0, 1.945), (-0.3, 1.97), (0.5, 1.98), (1.0, 1.98)]
REAR_PLATE = ((-2.87, SPONSON_Y), (-2.76, 1.77))   # leans forward at the top
GLACIS_TOP = (1.50, 1.98)
GLACIS_DXDY = 1.5               # (2.37, 1.40) to (1.50, 1.98): 56 degrees from vertical
CAST_R = 0.20                   # ESTIMATE: the composite's cast front, rounded into roof and sides
WHEEL_X = (-1.67, -0.81, -0.235, 0.65, 1.21, 2.09)   # road wheel hubs, row 0.25 m
WHEEL_Y, WHEEL_R = 0.305, 0.245
BOGIE_X = tuple((WHEEL_X[i] + WHEEL_X[i + 1]) / 2 for i in (0, 2, 4))
ROLLER_DX, ROLLER_Y, ROLLER_R = -0.53, 0.915, 0.10   # return roller trails each bogie
SPROCKET = (2.585, 0.73)        # front; teeth tips 0.335 m, belt over it to 1.09 m
SPROCKET_R = 0.30               # belt inner radius over the sprocket
IDLER = (-2.625, 0.735)         # rear; belt outer 0.32 m
IDLER_R = 0.26
TURRET_BASE = 2.06              # turret ring band 1.96-2.06 under it
GUN_Y = 2.31                    # gun axis; muzzle 2.683 m
TRUNNION_X = 0.70               # ESTIMATE: inside the turret front, behind the mantlet


def _signed_volume(verts, faces):
    vol = 0.0
    for f in faces:
        p = verts[f[0]]
        for i in range(1, len(f) - 1):
            a, b = verts[f[i]], verts[f[i + 1]]
            vol += (p[0] * (a[1] * b[2] - a[2] * b[1]) + p[1] * (a[2] * b[0] - a[0] * b[2])
                    + p[2] * (a[0] * b[1] - a[1] * b[0])) / 6
    return vol


def loft(role, rings, node):
    """kit._loft's closed solid through `rings` (each ccw seen from beyond the last ring), as
    naval.oval_loft builds one: a section ring may lie on any plane (a raked plate)."""
    verts, faces = kit._loft(rings)
    plain = [f for f, _ in faces]
    assert _signed_volume(verts, plain) > 0, f'{node}: loft wound inward'
    charts = smooth = None
    if m.skin:
        charts, _side, _u, _v = m._loft_charts(rings, role)
        smooth = [j is not None for _, j in faces]
    m._part(role, verts, plain, node, charts, smooth if smooth is not None else False)


def rrect(x_of_y, yb, yt, hw, rt, rty=None, rb=0.02, n=4):
    """A section ring: flat bottom yb, vertical sides at +-hw, top yt, top corners rounded
    rt across by rty down, bottom corners rb. Starts at the top and turns toward +z, as
    kit.fuselage's rings do; each point's x is x_of_y(y), so a ring can lie on a raked plane."""
    rty = rt if rty is None else rty
    rt, rb = min(rt, 0.9 * hw), min(rb, 0.9 * hw)
    rty = min(rty, 0.9 * (yt - yb - rb))
    half = [(yt - rty + rty * math.cos(math.pi / 2 * k / n), hw - rt + rt * math.sin(math.pi / 2 * k / n)) for k in range(n + 1)]
    half += [(yb + rb - rb * math.sin(math.pi / 2 * k / n), hw - rb + rb * math.cos(math.pi / 2 * k / n)) for k in range(n + 1)]
    pts = [(yt, 0.0)] + half + [(yb, 0.0)] + [(y, -z) for y, z in reversed(half)]
    return [(x_of_y(y), y, z) for y, z in pts]


def bar(role, p0, p1, hu, hw, node, up=(0.0, 0.0, 1.0)):
    """A rectangular bar from p0 to p1: 2*hw across along `up`, 2*hu across the other way."""
    d = kit._unit(kit._sub(p1, p0))
    dot = sum(a * b for a, b in zip(up, d))
    w = kit._unit(tuple(u - dot * c for u, c in zip(up, d)))
    r = kit._cross(w, d)
    ring = lambda p: [tuple(p[i] + a * hu * r[i] + b * hw * w[i] for i in range(3)) for a, b in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    loft(role, [ring(p0), ring(p1)], node)


def disc_prism(role, center, z0, z1, outline, node):
    """A prism along +z through an xy outline given counterclockwise about `center`."""
    cx, cy = center
    loft(role, [[(cx + x, cy + y, z) for x, y in outline] for z in (z0, z1)], node)


def belt(z, node):
    """The track: a TRACK_T x TRACK_W belt along a closed path in the side plane, wrapped round
    the front sprocket and rear idler, flat under the road wheels and over the return rollers."""
    def tangent(a, ra, b, rb):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        dx, dy = dx / L, dy / L
        k = (ra - rb) / L
        s = math.sqrt(1 - k * k)
        return math.atan2(k * dy - s * dx, k * dx + s * dy)   # the outward normal's angle, ccw loop

    def arc(c, r, a0, a1, step=math.radians(12)):
        while a1 < a0 - 1e-9:
            a1 += 2 * math.pi
        n = max(1, int(math.ceil((a1 - a0) / step)))
        return [(c[0] + r * math.cos(a0 + (a1 - a0) * i / n), c[1] + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

    h = TRACK_T / 2
    wheel = lambda x: ((x, WHEEL_Y), WHEEL_R + h)
    rear, front = wheel(WHEEL_X[0]), wheel(WHEEL_X[-1])
    spr, idl = (SPROCKET, SPROCKET_R + h), (IDLER, IDLER_R + h)
    rollers = [((bx + ROLLER_DX, ROLLER_Y), ROLLER_R + h) for bx in reversed(BOGIE_X)]
    bottom = -math.pi / 2
    t_fs = tangent(*front, *spr)
    t_sr = tangent(*spr, *rollers[0])
    t_ri = tangent(*rollers[-1], *idl)
    t_iw = tangent(*idl, *rear)
    path = [(x, WHEEL_Y - WHEEL_R - h) for x in WHEEL_X[:-1]]
    path += arc(*front, bottom, t_fs)
    path += arc(*spr, t_fs, t_sr)
    tops = [path[-1]] + [(c[0], c[1] + r) for c, r in rollers]
    tops.append((idl[0][0] + idl[1] * math.cos(t_ri), idl[0][1] + idl[1] * math.sin(t_ri)))
    for a, b in zip(tops, tops[1:]):
        # The top run sags between its supports (ESTIMATE: 2 cm).
        path.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.02))
        path.append(b)
    path += arc(*idl, t_ri, t_iw)[1:]
    path += arc(*rear, t_iw, bottom)[:-1]
    rings = []
    n = len(path)
    for i, (px, py) in enumerate(path + path[:1]):
        (ax, ay), (bx, by) = path[(i - 1) % n], path[(i + 1) % n]
        tl = math.hypot(bx - ax, by - ay)
        tx, ty = (bx - ax) / tl, (by - ay) / tl
        rx, ry = -ty, tx
        rings.append([(px + a * h * rx, py + a * h * ry, z + b * TRACK_W / 2) for a, b in ((1, 1), (-1, 1), (-1, -1), (1, -1))])
    loft('dark', rings, node)


def dual_wheel(role, x, y, side, r, node, segments=12):
    """A VVSS-style dual wheel centered on the track: two rubber-tired discs with the guide gap
    between them and a hub cap outboard. Dimensions besides the radius are ESTIMATES."""
    t0 = TRACK_Z - 0.165
    prof = [(0.0, 0.70 * r), (0.006, 0.95 * r), (0.014, r), (0.105, r), (0.112, 0.95 * r), (0.118, 0.57 * r),
            (0.212, 0.57 * r), (0.218, 0.95 * r), (0.225, r), (0.316, r), (0.323, 0.95 * r), (0.33, 0.70 * r),
            (0.345, 0.38 * r), (0.37, 0.30 * r)]
    m.revolve(role, (x, y, side * t0), (0, 0, side), prof, segments, node=node)


# Hull: welded lower tub between the tracks, the cast nose, and the full-width upper hull.
with m.tagged('hull'):
    # Ends where the nose begins and 1 cm up inside the upper hull: no coplanar faces to fight.
    m.box(OLIVE, (-0.325, CLEARANCE, 0.0), (4.95, SPONSON_Y + 0.01 - CLEARANCE, 2 * LOWER_HW), node='ShermanHull')
    # The cast differential housing, rounded under (ESTIMATE below the drawn top 1.34 m at 2.3-2.5 m
    # and front 2.81 m (top view)).
    loft(OLIVE, [rrect(lambda y, x=x: x, yb, yt, hw, rr, rb=rr) for x, yb, yt, hw, rr in (
        (2.15, CLEARANCE, SPONSON_Y + 0.01, LOWER_HW, 0.04), (2.45, 0.46, 1.345, LOWER_HW, 0.10),
        (2.60, 0.50, 1.31, 0.83, 0.15), (2.70, 0.57, 1.25, 0.80, 0.18), (2.77, 0.66, 1.16, 0.75, 0.18),
        (2.81, 0.78, 1.04, 0.66, 0.12))], 'ShermanHull')

    (rx0, ry0), (rx1, ry1) = REAR_PLATE
    rings = [rrect(lambda y: rx0 + (y - ry0) * (rx1 - rx0) / (ry1 - ry0), SPONSON_Y, ry1, HALF_WIDTH, 0.03)]
    for x, yt in ROOF[1:]:
        # Welded rear corners, rounding up into the cast front from x = 0.5 m (ESTIMATE).
        rings.append(rrect(lambda y, x=x: x, SPONSON_Y, yt, HALF_WIDTH, 0.03 if x < 0.5 else 0.10))
    # The glacis: rings on planes parallel to it, CAST_R behind it to on it, shrinking CAST_R into
    # the roof and sides, so its edges round over. Its plane: x = 1.50 + (1.98 - y) * 1.5.
    gx = lambda y: GLACIS_TOP[0] + (GLACIS_TOP[1] - y) * GLACIS_DXDY
    behind = math.hypot(1.0, GLACIS_DXDY)   # x shift per meter of normal offset
    for k in range(5):
        th = math.pi / 2 * k / 4
        d, e = CAST_R * (1 - math.sin(th)), CAST_R * (1 - math.cos(th))
        rings.append(rrect(lambda y, d=d: gx(y) - d * behind, SPONSON_Y, GLACIS_TOP[1] - e, HALF_WIDTH - e, 0.10))
    loft(OLIVE, rings, 'ShermanHull')

    m.cylinder(OLIVE, (0.0, 1.96, 0.0), 0.97, TURRET_BASE - 1.96, segments=24, node='ShermanHull')
    # Driver's and assistant driver's hatches (top view 0.98-1.45 m, 0.25-0.72 m off center),
    # their periscopes and the bow gun's ball mount (front view: 0.51 m to starboard, 1.49 m up).
    for z in (-0.485, 0.485):
        m.rounded_box(OLIVE, (1.215, 1.975, z), 0.47, 0.47, 0.055, 0.15, segments=3, node='ShermanHull')
        m.box(OLIVE, (1.36, 2.03, z - 0.08), (0.09, 0.055, 0.14), node='ShermanHull')

with m.tagged('fittings'):
    by = 1.49
    bx = gx(by)
    m.revolve(OLIVE, (bx - 0.07, by, 0.51), (1, 0, 0), [(0.0, 0.05), (0.04, 0.085), (0.10, 0.085), (0.14, 0.05)],
              10, node='ShermanFittings')
    m.strut('dark', (bx + 0.12, by, 0.51), (bx + 0.16, by - 0.01, 0.51), 0.028, sides=8, node='ShermanBowGun')
    m.strut('dark', (bx + 0.16, by - 0.01, 0.51), (2.40, by - 0.03, 0.51), 0.016, sides=6, node='ShermanBowGun')
    # Headlamps in brush guards at the glacis foot (ESTIMATE, composite photographs).
    for side in (-1, 1):
        lz = side * 0.98
        m.revolve('steel', (gx(1.47) - 0.02, 1.47, lz), (1, 0, 0), [(0.0, 0.065), (0.12, 0.075), (0.14, 0.06)],
                  10, node='ShermanLamps')
        m.strut('steel', (gx(1.40) + 0.02, 1.40, lz - side * 0.09), (gx(1.40) + 0.16, 1.47, lz), 0.012, sides=4, node='ShermanLamps')
        m.strut('steel', (gx(1.40) + 0.02, 1.40, lz + side * 0.09), (gx(1.40) + 0.16, 1.47, lz), 0.012, sides=4, node='ShermanLamps')
        # Front tow shackle brackets (top view 0.59-0.85 m off center, to 2.87 m).
        m.box(OLIVE, (2.80, 0.62, side * 0.72), (0.14, 0.16, 0.10), node='ShermanFittings')
    # Rear exhaust deflector (drawn 1.32-1.38 m, to 3.00 m aft; kept inside the 2.945 m track end).
    bar(OLIVE, (-2.86, 1.395, 0.0), (-2.94, 1.335, 0.0), 0.012, 0.95, 'ShermanFittings')

# Running gear: three VVSS bogies a side, each two dual road wheels on arms from a volute-spring
# bracket with a trailing return roller; front sprocket, rear idler, and the track belt.
with m.tagged('running'):
    for side in (-1, 1):
        z = side * TRACK_Z
        for x in WHEEL_X:
            dual_wheel('dark', x, WHEEL_Y, side, WHEEL_R, 'ShermanRunningGear')
        for bxc in BOGIE_X:
            m.tapered_box(OLIVE, (bxc + 0.02, 0.45, z), (0.30, 0.20), (0.40, 0.26), 0.40, node='ShermanSuspension')
            m.box(OLIVE, (bxc + 0.02, 0.85, z), (0.46, 0.08, 0.30), node='ShermanSuspension')
            m.box(OLIVE, (bxc + 0.02, 0.58, side * (LOWER_HW + 0.06)), (0.40, 0.35, 0.12), node='ShermanSuspension')
            for dx in (-0.07, 0.12):
                m.strut(OLIVE, (bxc + dx, 0.47, z + side * 0.13), (bxc + dx, 0.84, z + side * 0.13), 0.045,
                        sides=6, node='ShermanSuspension')
            for sgn in (-1, 1):
                m.strut(OLIVE, (bxc + sgn * 0.10, 0.52, z), (bxc + sgn * 0.44, WHEEL_Y, z), 0.05, sides=6,
                        node='ShermanSuspension')
            rx = bxc + ROLLER_DX
            m.strut(OLIVE, (bxc - 0.18, 0.89, z), (rx, ROLLER_Y, z), 0.04, sides=6, node='ShermanSuspension')
            m.revolve('dark', (rx, ROLLER_Y, z - side * 0.15), (0, 0, side),
                      [(0.0, 0.08), (0.01, ROLLER_R), (0.30, ROLLER_R), (0.31, 0.08)], 10, node='ShermanRunningGear')
        # Rear idler on its bracket.
        dual_wheel('dark', IDLER[0], IDLER[1], side, IDLER_R, 'ShermanRunningGear', segments=14)
        m.strut(OLIVE, (-2.42, 0.80, side * LOWER_HW), (IDLER[0], IDLER[1], side * (TRACK_Z - 0.16)), 0.07,
                sides=6, node='ShermanSuspension')
        # Front sprocket: final-drive hub and two 13-tooth rings outboard of the belt's edges.
        m.revolve(OLIVE, (SPROCKET[0], SPROCKET[1], side * 0.78), (0, 0, side),
                  [(0.0, 0.25), (0.06, 0.25), (0.07, 0.21), (TRACK_Z + 0.22 - 0.78, 0.21), (TRACK_Z + 0.24 - 0.78, 0.12)],
                  16, node='ShermanSuspension')
        teeth = []
        for i in range(26):
            a = 2 * math.pi * i / 26
            r = 0.335 if i % 2 == 0 else 0.275
            teeth.append((r * math.cos(a), r * math.sin(a)))
        for zc in (TRACK_Z - TRACK_W / 2 - 0.018, TRACK_Z + TRACK_W / 2 + 0.018):
            disc_prism('dark', SPROCKET, side * zc - 0.015, side * zc + 0.015, teeth, 'ShermanRunningGear')

with m.tagged('tracks'):
    for side in (-1, 1):
        belt(side * TRACK_Z, 'ShermanTracks')

# Turret: one node, so its hatch and stowed .50 train with it. Plan from the top view (a 0.925 m
# circle about x = 0, a bustle tapering to 0.45 m half-width at -1.10 m); heights from the side
# view; the front view's widest 1.87 m and 1.45 m flat roof set the top corners (0.21 x 0.28 m).
TURRET = [  # x, half-width, bottom, top
    (-1.08, 0.40, 2.24, 2.44), (-1.05, 0.43, 2.19, 2.48), (-1.00, 0.47, 2.14, 2.53), (-0.90, 0.53, 2.08, 2.62),
    (-0.80, 0.59, 2.07, 2.71), (-0.70, 0.65, 2.06, 2.73), (-0.50, 0.774, 2.06, 2.73), (-0.25, 0.89, 2.06, 2.73),
    (0.00, 0.925, 2.06, 2.73), (0.25, 0.89, 2.06, 2.73), (0.45, 0.81, 2.06, 2.725), (0.55, 0.75, 2.06, 2.71),
    (0.65, 0.66, 2.06, 2.66), (0.75, 0.54, 2.06, 2.48), (0.85, 0.37, 2.06, 2.30), (0.92, 0.17, 2.06, 2.16),
]
with m.tagged('turret'):
    loft(OLIVE, [rrect(lambda y, x=x: x, yb, yt, hw, min(0.21, 0.45 * hw), min(0.28, 0.5 * (yt - yb)), rb=0.05)
                 for x, hw, yb, yt in TURRET], 'Turret1')
    # Commander's split hatch ring (top view: 0.36 m radius at (-0.40, +0.40); drawn 2.77-2.80 m).
    m.revolve(OLIVE, (-0.40, 2.70, 0.40), (0, 1, 0), [(0.0, 0.36), (0.075, 0.36), (0.08, 0.33)], 18, node='Turret1')
    # M2 .50 cal on the pintle the top view draws at the rear (-1.07, -0.40), stowed pointing aft and
    # depressed (ESTIMATE: travel position; on its pintle ready to fire it would stand 0.3 m above the
    # cited 9 ft, which is the tank's height without it).
    pz = -0.40
    m.strut(OLIVE, (-1.02, 2.40, pz), (-1.02, 2.645, pz), 0.025, sides=6, node='Turret1')
    bar(OLIVE, (-0.88, 2.70, pz), (-1.26, 2.645, pz), 0.045, 0.035, 'Turret1')
    m.strut(OLIVE, (-1.26, 2.645, pz), (-1.62, 2.595, pz), 0.032, sides=8, node='Turret1')
    m.strut(OLIVE, (-1.62, 2.595, pz), (-2.30, 2.50, pz), 0.022, 0.018, sides=8, node='Turret1')
    m.strut(OLIVE, (-2.30, 2.50, pz), (-2.40, 2.486, pz), 0.03, sides=8, node='Turret1')

# M34A1 mantlet and 75 mm M3, hinged together at the trunnion (Gun1, the entry's pivot).
with m.tagged('gun'):
    loft(OLIVE, [rrect(lambda y, x=x: x, yb, yt, hw, 0.10, rb=0.10) for x, hw, yb, yt in (
        (0.80, 0.36, 2.10, 2.56), (0.98, 0.30, 2.11, 2.555), (1.04, 0.25, 2.15, 2.50), (1.08, 0.17, 2.22, 2.42))], 'Gun1')
    m.revolve(OLIVE, (1.06, GUN_Y, 0.0), (1, 0, 0), [
        (0.0, 0.085), (0.14, 0.085), (0.15, 0.062), (1.40, 0.054), (1.60, 0.052), (1.61, 0.056), (1.623, 0.056),
    ], 12, node='Gun1')

# A period recognition star on each hull side. Its geometry and placement are ESTIMATES.
star = []
for i in range(10):
    a = math.pi / 2 + i * math.pi / 5
    r = 0.26 if i % 2 == 0 else 0.105
    star.append((math.cos(a) * r, math.sin(a) * r))
for side in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(-0.60, 1.66, side * HALF_WIDTH), axis=(0, 0, side), uDir=(1, 0, 0),
              points=star, color='usaaInsigniaWhite')
m.marking('slab', tags=['tracks', 'running'], axis='y', fromM=-0.1, toM=0.42,
          color='exhaustSoot', effect='stain', opacity=0.30, featherM=0.18)
m.marking('grid', tags=['tracks'], spacingM=[0.18, None, None], widthM=0.018, depth=0.45)

m.export(out)
