"""Shared parts for the original ground-vehicle scripts. Original work, AGPL-3.0-or-later.

Frame as kit.py: +x forward, +y up, +z starboard, metres. Helpers only; every size a caller
passes is that script's own cited figure or labeled ESTIMATE.
"""
import math

import kit


def prism(m, role, pts, w0, w1, axis='z', node=None):
    """A closed prism: the simple polygon `pts` (any winding) extruded from w0 to w1.
    The polygon's coordinates are (x, y) for axis 'z', (y, z) for axis 'x' and (z, x) for axis 'y'
    (cyclic, so the winding survives); the faces come out wound outward."""
    pts = [tuple(p) for p in pts]
    pts = [p for i, p in enumerate(pts) if math.dist(p, pts[i - 1]) > 1e-6]
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    if area < 0:
        pts.reverse()
    at = {'z': lambda p, w: (p[0], p[1], w), 'x': lambda p, w: (w, p[0], p[1]), 'y': lambda p, w: (p[1], w, p[0])}[axis]
    v = [at(p, w0) for p in pts] + [at(p, w1) for p in pts]
    f = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    m._part(role, v, f, node)


def lathe_z(m, role, cx, cy, z0, profile, segments=16, direction=1, node=None):
    """A solid of revolution about the axle line through (cx, cy) along z, starting at z0 and
    running toward `direction` (+1 or -1); profile is [(distance along the axle, radius)]."""
    m.revolve(role, (cx, cy, z0), (0, 0, direction), profile, segments, node=node)


def ring_pts(cx, cy, r, a0_deg, a1_deg, steps):
    """Points on a circle arc, a0 to a1 degrees (0 = +x, 90 = +y), `steps` segments."""
    return [(cx + r * math.cos(math.radians(a0_deg + (a1_deg - a0_deg) * k / steps)),
             cy + r * math.sin(math.radians(a0_deg + (a1_deg - a0_deg) * k / steps))) for k in range(steps + 1)]


def tire(m, node, cx, cy, cz, radius, width, outward, lugs=30, segments=20, tag='tread', hub_tag='hub'):
    """A road wheel about the axle through (cx, cy, cz): a rounded tire body with cross-bar
    lugs, and a dished hub on the `outward` (+1 or -1 along z) face. One role (`dark`) so the
    node stays one draw; the hub is painted by a marking on its `hub_tag` charts. Returns the
    hub radius, which a caller's marking uses."""
    rv = radius - 0.020
    rim = radius * 0.56
    hub_h = 0.045                       # the hub dome stands this far proud, inside the stated overall width
    body_w = width - hub_h
    z0 = cz - width / 2 if outward > 0 else cz - width / 2 + hub_h
    zc = z0 + body_w / 2
    with m.tagged(tag):
        lathe_z(m, 'dark', cx, cy, z0, [
            (0.0, rim + 0.02), (0.05 * body_w, radius * 0.86), (0.14 * body_w, rv),
            (0.86 * body_w, rv), (0.95 * body_w, radius * 0.86), (body_w, rim + 0.02)], segments, node=node)
        with m.shared_chart():
            lw, lh = 0.046, radius - rv + 0.006
            for k in range(lugs):
                a = 2 * math.pi * (k + 0.5) / lugs
                c, s = math.cos(a), math.sin(a)
                rc = rv - 0.006 + lh / 2
                cxk, cyk = cx + c * rc, cy + s * rc
                corners = [(cxk + c * dr - s * dt, cyk + s * dr + c * dt)
                           for dr, dt in ((-lh / 2, -lw / 2), (lh / 2, -lw / 2), (lh / 2, lw / 2), (-lh / 2, lw / 2))]
                prism(m, 'dark', corners, zc - body_w * 0.38, zc + body_w * 0.38, node=node)
    with m.tagged(hub_tag):
        face = zc + outward * body_w / 2
        k = hub_h / 0.075
        lathe_z(m, 'dark', cx, cy, face, [
            (0.0, rim), (0.012 * k, rim), (0.034 * k, rim * 0.86), (0.054 * k, rim * 0.40), (0.066 * k, rim * 0.36), (0.075 * k, rim * 0.14)],
            max(12, segments - 4), direction=outward, node=node)
    return rim


def path_loop(c1, r1, c2, r2):
    """The closed outline of two circles joined by their outer tangents, counterclockwise from
    the flat bottom run: a list of ((x, y), outward normal (nx, ny)) arcs and runs as
    (kind, data) pieces; see track_shoes. c1 is the rear (-x) circle, c2 the front."""
    dx, dy = c2[0] - c1[0], c2[1] - c1[1]
    dist = math.hypot(dx, dy)
    th = math.atan2(dy, dx)
    beta = math.acos((r1 - r2) / dist)
    bottom, top = th - beta, th + beta   # outward normal angles of the two tangent lines
    return bottom, top


def track_shoes(m, role, c1, r1, c2, r2, z_center, width, pitch, plate=0.055, cleat=0.035, node=None):
    """Individual track shoes with a cleat each, spaced evenly along the outline of two circles
    (rear c1/r1, front c2/r2) joined by their outer tangents; r is the cleat tip. Returns the shoe count."""
    bottom, top = path_loop(c1, r1, c2, r2)
    # Pieces in travel order: bottom run (rear to front), front arc, top run (front to rear), rear arc.
    two_pi = 2 * math.pi
    front_sweep = (top - bottom) % two_pi
    rear_sweep = (bottom - top) % two_pi
    def tangent_pt(c, r, ang):
        return (c[0] + r * math.cos(ang), c[1] + r * math.sin(ang))
    a0, a1 = tangent_pt(c1, r1, bottom), tangent_pt(c2, r2, bottom)
    b0, b1 = tangent_pt(c2, r2, top), tangent_pt(c1, r1, top)
    pieces = [('line', a0, a1, bottom), ('arc', c2, r2, bottom, front_sweep), ('line', b0, b1, top), ('arc', c1, r1, top, rear_sweep)]
    lengths = [math.dist(p[1], p[2]) if p[0] == 'line' else p[2] * p[4] for p in pieces]
    total = sum(lengths)
    count = max(8, round(total / pitch))
    step = total / count
    def sample(s):
        s %= total
        for piece, length in zip(pieces, lengths):
            if s <= length:
                u = s / length
                if piece[0] == 'line':
                    p = (piece[1][0] + (piece[2][0] - piece[1][0]) * u, piece[1][1] + (piece[2][1] - piece[1][1]) * u)
                    return p, piece[3]
                ang = piece[3] + piece[4] * u
                return (piece[1][0] + piece[2] * math.cos(ang), piece[1][1] + piece[2] * math.sin(ang)), ang
            s -= length
        raise AssertionError('track path overrun')
    half = step * 0.47
    with m.tagged('track'):
        with m.shared_chart():
            for i in range(count):
                (px, py), ang = sample((i + 0.5) * step)
                nx, ny = math.cos(ang), math.sin(ang)   # outward normal
                tx, ty = -ny, nx                          # tangent, counterclockwise
                loc = [(-half, -plate - cleat), (half, -plate - cleat), (half, -cleat), (half * 0.30, -cleat),
                       (half * 0.30, 0.0), (-half * 0.34, 0.0), (-half * 0.34, -cleat), (-half, -cleat)]
                pts = [(px + tx * t + nx * nn, py + ty * t + ny * nn) for t, nn in loc]
                prism(m, role, pts, z_center - width / 2, z_center + width / 2, node=node)
    return count


def gear(m, role, cx, cy, z0, z1, teeth, root, tip, node=None):
    """A toothed wheel (sprocket) about the axle line through (cx, cy), a prism from z0 to z1."""
    pts = []
    for k in range(teeth):
        a = 2 * math.pi * k / teeth
        step = 2 * math.pi / teeth
        for frac, r in ((0.0, root), (0.22, root), (0.36, tip), (0.52, tip), (0.66, root)):
            pts.append((cx + r * math.cos(a + frac * step), cy + r * math.sin(a + frac * step)))
    prism(m, role, pts, z0, z1, node=node)
