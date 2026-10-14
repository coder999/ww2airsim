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

F4R (2026-10-14): the belt is now its shoes, one prism per link, in the kept node `Tracks`. The rig (vehicleRig.ts
rigSherman) slides each shoe to its neighbor's place as the tank travels, so the shoes must be
identical solids in creation order along the belt: link j of a side sits j pitches along the closed
path, starting under the rear road wheel and heading forward (+x) along the ground run. Weld beads,
stowage, a bent lamp guard and the baked wear (mud, dust, scuffs, chips, rust streaks, dent smudges)
are ESTIMATES from wartime and museum photographs of Philippine-theater Shermans, not measurements.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, _opts = kit.cli_args()
m = kit.Model('m4-sherman', skin=1024)

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


def roof_y(x):
    """(roof height, slope angle) of the upper hull's top at x, from the drawn ROOF profile."""
    if x >= ROOF[-1][0]:
        return ROOF[-1][1], 0.0
    for (x0, y0), (x1, y1) in zip(ROOF, ROOF[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0), math.atan2(y1 - y0, x1 - x0)
    raise ValueError(f'roof_y: x {x} is off the hull')


def obox(role, c, ax, ay, half, node):
    """A box centered on c with half-sizes `half` along the orthonormal axes ax, ay and az = ax x ay."""
    az = kit._cross(ax, ay)
    hx, hy, hz = half
    v = [tuple(c[i] + sx * hx * ax[i] + sy * hy * ay[i] + sz * hz * az[i] for i in range(3))
         for sx, sy, sz in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    assert _signed_volume(v, f) > 0, f'{node}: obox wound inward'
    m._part(role, v, f, node)


def weld(points, r=0.009):
    """A weld bead: a chain of thin diamond-section struts through `points` (ESTIMATE: 1.8 cm across)."""
    for p0, p1 in zip(points, points[1:]):
        m.strut(OLIVE, p0, p1, r, sides=4, node='ShermanWelds')


def track_path(h):
    """The closed centerline of the track in the side plane, counterclockwise seen from +z: from under
    the rear road wheel forward along the ground run, up round the sprocket, back over the rollers and
    down round the idler. `h` is the centerline's distance outside the wheels' running surface."""
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
    return path


LINK_PITCH_M = 0.1524            # 6 in: the M4's T48 track block pitch (ESTIMATE from photographs)


def link_shoes():
    """The shoe centers and frames along the closed track path: (center xy, tangent, inward normal)
    for each of N evenly spaced shoes, N chosen so the pitch is as near 6 in as the path allows."""
    path = track_path(TRACK_T / 2)
    pts = path + path[:1]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = cum[-1]
    count = round(total / LINK_PITCH_M)
    pitch = total / count

    def at(sv):
        sv %= total
        k = max(i for i in range(len(cum) - 1) if cum[i] <= sv)
        f = (sv - cum[k]) / (cum[k + 1] - cum[k])
        return (pts[k][0] + f * (pts[k + 1][0] - pts[k][0]), pts[k][1] + f * (pts[k + 1][1] - pts[k][1]))

    out = []
    for j in range(count):
        sv = (j + 0.5) * pitch
        c = at(sv)
        a, b = at(sv - 0.04), at(sv + 0.04)
        tl = math.hypot(b[0] - a[0], b[1] - a[1])
        tx, ty = (b[0] - a[0]) / tl, (b[1] - a[1]) / tl
        out.append((c, (tx, ty), (-ty, tx)))
    return pitch, out


def links(z0):
    """One side's track shoes: a plate with a raised grouser, identical solids in order along the
    path (the rig pairs each shoe's vertices with the previous shoe's). Frame: ex along the track,
    ey inward to the wheels, ez = +z; the shoe spans d = 0 (the wheels' side) to TRACK_T outward."""
    pitch, shoes = link_shoes()
    hx = pitch / 2 - 0.002   # shoes nearly touch, so no daylight shows between them
    profile = [(-hx, 0.0), (hx, 0.0), (hx, 0.036), (0.024, 0.036), (0.024, TRACK_T), (-0.024, TRACK_T), (-0.024, 0.036), (-hx, 0.036)]
    for (cx, cy), (tx, ty), (nx, ny) in shoes:
        # d outward from the inner face: centerline (TRACK_T / 2 outside it) minus d.
        ring = lambda zz: [(cx + a * tx - (d - TRACK_T / 2) * nx, cy + a * ty - (d - TRACK_T / 2) * ny, zz) for a, d in profile]
        verts, faces = kit._loft([ring(z0 - TRACK_W / 2), ring(z0 + TRACK_W / 2)])
        plain = [f for f, _ in faces]
        if _signed_volume(verts, plain) < 0:
            plain = [tuple(reversed(f)) for f in plain]
        m._part('dark', verts, plain, 'Tracks')
    return len(shoes)


def dual_wheel(role, x, y, side, r, node, segments=12):
    """A VVSS-style dual wheel centered on the track: two rubber-tired discs with the guide gap
    between them and a hub cap outboard. Dimensions besides the radius are ESTIMATES."""
    t0 = TRACK_Z - 0.165
    prof = [(0.0, 0.70 * r), (0.006, 0.95 * r), (0.014, r), (0.105, r), (0.112, 0.95 * r), (0.118, 0.57 * r),
            (0.212, 0.57 * r), (0.218, 0.95 * r), (0.225, r), (0.316, r), (0.323, 0.95 * r), (0.33, 0.70 * r),
            (0.345, 0.38 * r), (0.37, 0.30 * r)]
    m.revolve(role, (x, y, side * t0), (0, 0, side), prof, segments, node=node)
    # Five hub bolt heads on the outboard cap, so the wheel's turning shows (separate small solids: the rig
    # turns every fragment standing on a wheel's outboard face with that wheel).
    zb = side * (t0 + 0.328)
    with m.shared_chart():
        for k in range(5):
            a = 2 * math.pi * k / 5 + 0.3
            bx, by = x + 0.58 * r * math.cos(a), y + 0.58 * r * math.sin(a)
            m.strut('steel', (bx, by, zb), (bx, by, zb + side * 0.022), 0.017, sides=4, node='ShermanWheelBolts')


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
        # The starboard guard's inboard stay is bent down and out where something struck it (a dent, ESTIMATE).
        bent = (gx(1.40) + 0.13, 1.405, lz + 0.015) if side == 1 else (gx(1.40) + 0.16, 1.47, lz)
        m.strut('steel', (gx(1.40) + 0.02, 1.40, lz + side * 0.09), bent, 0.012, sides=4, node='ShermanLamps')
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

# The moving shoes: one node, both sides, port first. All their faces share one atlas chart.
with m.tagged('links'), m.shared_chart():
    for side in (-1, 1):
        N_LINKS = links(side * TRACK_Z)

# Welds, stowage and field-worn details. Every one is an ESTIMATE from photographs of Leyte-era Shermans:
# beads along the plate joints of the welded rear hull and at the cast front's joint, an engine deck with
# louvers and access plates, a rolled tarpaulin and gasoline cans lashed aft, spare track blocks on the
# glacis, entrenching tools clamped to the hull sides. All small solids share one chart per role.
with m.tagged('fittings'), m.shared_chart():
    inset = HALF_WIDTH - 0.004
    for side in (-1, 1):
        z = side * inset
        # Upper hull: the top seam just under the roof edge, a seam along the sponson, the cast joint at
        # x = 0.55 (where the roof's rounding up into the casting begins) and the rear corner.
        weld([(x, roof_y(x)[0] - 0.05, z) for x in (-2.70, -2.2, -1.6, -1.0, -0.3, 0.45)])
        weld([(-2.74, 1.52, z), (0.50, 1.52, z)])
        for x in (-1.40, 0.55):
            weld([(x, SPONSON_Y + 0.02, z), (x, roof_y(x)[0] - 0.06, z)])
        weld([(-2.80, SPONSON_Y + 0.03, z * 0.995), (-2.74, roof_y(-2.74)[0] - 0.04, z * 0.995)])
        # The lower hull's plate joints, between the tracks' bogies.
        for x in (-1.05, 1.25):
            weld([(x, 0.55, side * (LOWER_HW + 0.003)), (x, 1.30, side * (LOWER_HW + 0.003))])
    # Engine deck seams across the roof, and the rear plate's seam.
    for x in (-2.55, -1.05):
        weld([(x, roof_y(x)[0] + 0.004, zz) for zz in (-1.22, 0.0, 1.22)])
    (rx0, ry0), (rx1, ry1) = REAR_PLATE
    xr = lambda y: rx0 + (y - ry0) * (rx1 - rx0) / (ry1 - ry0)
    weld([(xr(1.58) - 0.004, 1.58, zz) for zz in (-1.22, 0.0, 1.22)])

    def deck_box(role, x, z, half, node, pitch=0.0, lift=None):
        """A box lying on the engine deck at x, tilted to its slope (plus `pitch`)."""
        y, a = roof_y(x)
        a += pitch
        ax, ay = (math.cos(a), math.sin(a), 0.0), (-math.sin(a), math.cos(a), 0.0)
        obox(role, (x, y + (half[1] * math.cos(pitch) if lift is None else lift), z), ax, ay, half, node)

    # Louver bars over each radiator, and an access plate with its handle.
    for z in (-0.5, 0.5):
        for x in (-2.50, -2.40, -2.30, -2.20):
            deck_box(OLIVE, x, z, (0.014, 0.014, 0.30), 'ShermanStowOlive', pitch=0.45)
        deck_box(OLIVE, -1.95, z, (0.22, 0.010, 0.30), 'ShermanStowOlive')
        deck_box('steel', -1.95, z, (0.025, 0.02, 0.10), 'ShermanStowSteel', lift=0.03)
    # Gasoline cans lashed to the rear deck.
    for z in (-1.0, -0.62, 1.0):
        deck_box(OLIVE, -2.62, z, (0.085, 0.17, 0.17), 'ShermanStowOlive')
        deck_box('steel', -2.62, z, (0.02, 0.02, 0.06), 'ShermanStowSteel', lift=0.35)
    # A rolled tarpaulin across the deck behind the turret, with two lashings.
    ty, _ = roof_y(-1.45)
    m.strut('webbing', (-1.45, ty + 0.12, -0.88), (-1.45, ty + 0.12, 0.88), 0.125, sides=10, node='ShermanStowCanvas')
    for z in (-0.45, 0.45):
        m.strut('steel', (-1.45, ty + 0.12, z - 0.015), (-1.45, ty + 0.12, z + 0.015), 0.133, sides=10, node='ShermanStowSteel')
    # Spare track blocks bolted to the glacis, two columns of three, and their straps.
    sl, nl = (-GLACIS_DXDY, 1.0, 0.0), (1.0, GLACIS_DXDY, 0.0)
    sl = tuple(c / math.hypot(sl[0], sl[1]) for c in sl)
    nl = tuple(c / math.hypot(nl[0], nl[1]) for c in nl)
    for z in (0.72, 0.94):
        for y in (1.64, 1.75, 1.86):
            obox(OLIVE, (gx(y) + 0.018 * nl[0], y + 0.018 * nl[1], z), sl, nl, (0.05, 0.016, 0.10), 'ShermanStowOlive')
    for y in (1.69, 1.81):
        obox('steel', (gx(y) + 0.036 * nl[0], y + 0.036 * nl[1], 0.83), sl, nl, (0.008, 0.008, 0.19), 'ShermanStowSteel')
    # Entrenching tools clamped to the hull sides: a shovel to port, a pick and an axe to starboard.
    hz = HALF_WIDTH + 0.002
    m.strut('timber', (0.30, 1.58, -hz), (1.12, 1.58, -hz), 0.014, sides=6, node='ShermanStowTimber')
    obox(OLIVE, (1.26, 1.58, -hz), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.13, 0.095, 0.006), 'ShermanStowOlive')
    m.strut('timber', (0.45, 1.66, hz), (1.40, 1.66, hz), 0.014, sides=6, node='ShermanStowTimber')
    m.strut('steel', (1.30, 1.66 - 0.11, hz), (1.30, 1.66 + 0.11, hz), 0.016, sides=4, node='ShermanStowSteel')
    m.strut('timber', (0.50, 1.46, hz), (1.22, 1.46, hz), 0.014, sides=6, node='ShermanStowTimber')
    obox(OLIVE, (1.30, 1.46, hz), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.07, 0.05, 0.006), 'ShermanStowOlive')
    for x in (0.60, 1.00):
        for side, yy in ((-1, 1.58), (1, 1.66), (1, 1.46)):
            obox(OLIVE, (x, yy, side * HALF_WIDTH), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.025, 0.035, 0.012), 'ShermanStowOlive')

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

with m.tagged('turret'), m.shared_chart():
    # The loader's hatch ring, a rolled bedroll in a wire basket on the bustle's rear face (ESTIMATES).
    m.revolve(OLIVE, (-0.15, 2.715, -0.45), (0, 1, 0), [(0.0, 0.30), (0.035, 0.30), (0.04, 0.27)], 18, node='Turret1')
    for z in (-0.30, 0.0, 0.30):
        m.strut(OLIVE, (-1.30, 2.30, z), (-1.30, 2.62, z), 0.010, sides=4, node='Turret1')
    for y in (2.30, 2.62):
        m.strut(OLIVE, (-1.30, y, -0.30), (-1.30, y, 0.30), 0.010, sides=4, node='Turret1')
    obox(OLIVE, (-1.20, 2.295, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.12, 0.012, 0.30), 'Turret1')
    m.strut(OLIVE, (-1.19, 2.42, -0.26), (-1.19, 2.42, 0.26), 0.085, sides=8, node='Turret1')
    for z in (-0.30, 0.30):
        m.strut(OLIVE, (-1.12, 2.30, z), (-1.30, 2.30, z), 0.010, sides=4, node='Turret1')

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

# Wear, baked into the skin (kit markings; every position and size an ESTIMATE from photographs).
# Mud thrown up from the tracks: heaviest on the running gear, fading up the lower hull and sponson edges.
m.marking('slab', tags=['running', 'links'], axis='y', fromM=-0.1, toM=0.60, color='mudBrown', effect='stain', opacity=0.5, featherM=0.25)
m.marking('slab', tags=['hull', 'fittings'], axis='y', fromM=-0.1, toM=1.05, color='mudBrown', effect='stain', opacity=0.55, featherM=0.45)
m.marking('slab', tags=['hull', 'fittings'], axis='y', fromM=1.0, toM=1.62, color='dustTan', effect='stain', opacity=0.42, featherM=0.35)
# Dust settled on the track shoes everywhere, and on the roof, engine deck and turret top.
m.marking('slab', tags=['links'], axis='y', fromM=-1.0, toM=3.0, color='dustTan', effect='stain', opacity=0.16, featherM=0.0)
m.marking('slab', tags=['hull', 'fittings', 'turret', 'gun'], axis='y', fromM=1.72, toM=3.0, color='dustTan', effect='stain', opacity=0.22, featherM=0.30)
m.marking('slab', tags=['links', 'running'], axis='y', fromM=-0.1, toM=0.2, color='exhaustSoot', effect='stain', opacity=0.20, featherM=0.1)
# Exhaust soot on the rear plate round the deflector.
m.marking('disc', tags=['hull'], center=(-2.90, 1.45, 0.0), axis=(-1, 0, 0), radiusM=0.40, color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.22)

rng = random.Random(0x4D34)   # fixed seed: the same scuffs on every build
EDGE = lambda x: roof_y(max(x, -2.74))[0]
for side in (-1, 1):
    n = (0, 0, side)
    # Scuffed, chipped paint along the hull's top and sponson edges, and round the hatches and fittings.
    for _ in range(14):
        x = rng.uniform(-2.6, 2.1)
        y = min(EDGE(x) - 0.05, 1.98) if x < 0.5 else rng.uniform(1.5, 1.9)
        m.marking('disc', tags=['hull'], center=(x, y - rng.uniform(0.0, 0.05), side * HALF_WIDTH), axis=n,
                  radiusM=rng.uniform(0.015, 0.045), color='bareSteel', effect='paint', opacity=rng.uniform(0.55, 0.85), featherM=0.012)
    for _ in range(10):
        x = rng.uniform(-2.7, 2.2)
        m.marking('disc', tags=['hull'], center=(x, SPONSON_Y + rng.uniform(0.03, 0.09), side * HALF_WIDTH), axis=n,
                  radiusM=rng.uniform(0.03, 0.08), color='bareSteel', effect='paint', opacity=rng.uniform(0.5, 0.85), featherM=0.015)
    for _ in range(6):
        m.marking('disc', tags=['hull'], center=(rng.uniform(-2.4, 1.6), rng.uniform(1.5, 1.85), side * HALF_WIDTH), axis=n,
                  radiusM=rng.uniform(0.10, 0.22), color='dustTan', effect='wear', opacity=rng.uniform(0.5, 0.9), featherM=0.07)
    # Rust bleeding down from the weld beads and the sponson edge.
    for x in (-2.74, -1.40, 0.55, -0.95, 1.30, -2.0):
        top = roof_y(x)[0] - 0.05 if x <= 0.55 else 1.52
        w = rng.uniform(0.02, 0.035)
        length = rng.uniform(0.18, 0.45)
        m.marking('polygon', tags=['hull'], origin=(x, top, side * HALF_WIDTH), axis=n, uDir=(side, 0, 0),
                  points=[(-w, 0.0), (w, 0.0), (0.4 * w, -length), (-0.4 * w, -length)], color='rustStain', effect='stain', opacity=0.9, featherM=0.01)
    # Dents: a dark shaded smudge with a worn, lighter rim, one low on the side and one beside the star.
    for dx, dy, r in ((rng.uniform(0.2, 1.4), 1.78, 0.11), (rng.uniform(-2.2, -1.2), 1.62, 0.09)):
        m.marking('disc', tags=['hull'], center=(dx, dy, side * HALF_WIDTH), axis=n, radiusM=r * 1.6, color='dustTan', effect='wear', opacity=0.7, featherM=0.05)
        m.marking('disc', tags=['hull'], center=(dx, dy, side * HALF_WIDTH), axis=n, radiusM=r, color='dullBlackBK', effect='stain', opacity=0.55, featherM=0.06)
# Chips and a dent on the turret and its mantlet.
for _ in range(10):
    ang = rng.uniform(0, 2 * math.pi)
    x, z = 0.9 * math.cos(ang), 0.9 * math.sin(ang)
    m.marking('disc', tags=['turret'], center=(x, rng.uniform(2.2, 2.65), z), axis=(math.cos(ang), 0, math.sin(ang)),
              radiusM=rng.uniform(0.02, 0.05), color='bareSteel', effect='paint', opacity=rng.uniform(0.6, 0.9), featherM=0.012)
m.marking('disc', tags=['turret'], center=(0.55, 2.45, 0.80), axis=(0.5, 0, 0.87), radiusM=0.12, color='dullBlackBK', effect='stain', opacity=0.5, featherM=0.06)
m.marking('disc', tags=['gun'], center=(1.0, 2.45, 0.0), axis=(0, 1, 0), radiusM=0.10, color='bareSteel', effect='paint', opacity=0.7, featherM=0.03)
# Scuffs on the road wheels' hub caps and the sprocket (the rubber is already dark).
m.marking('slab', tags=['running'], axis='y', fromM=0.55, toM=1.1, color='rustStain', effect='stain', opacity=0.28, featherM=0.15)

m.export(out)
