"""Geometry helpers for the F4 maritime and site generators. Original work, AGPL-3.0-or-later.

Thin additions over `kit.py`'s private part writer, kept here so `kit.py` (shared by every
shipped model) is untouched. Everything is deterministic: no randomness, plain lists.
Frame: glTF +x forward, +y up, +z starboard, meters (the kit's frame).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

BOX_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]


def volume(verts, faces):
    """Signed volume of a closed polyhedron: positive when every face points outward."""
    total = 0.0
    for f in faces:
        a = verts[f[0]]
        for i in range(1, len(f) - 1):
            b, c = verts[f[i]], verts[f[i + 1]]
            total += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]))
    return total / 6.0


def solid(m, role, verts, faces, node=None):
    """A closed part from raw polygons; wound outward whichever way they were given."""
    faces = [tuple(f) for f in faces]
    if volume(verts, faces) < 0:
        faces = [tuple(reversed(f)) for f in faces]
    m._part(role, [tuple(v) for v in verts], faces, node)


def loft(m, role, rings, node=None, smooth=False):
    """A solid lofted through equal-length rings (kit._loft), wound outward, with the loft charts."""
    verts, faces = kit._loft(rings)
    if volume(verts, [f for f, _ in faces]) < 0:
        rings = [list(reversed(r)) for r in rings]
        verts, faces = kit._loft(rings)
    charts = flags = None
    if m.skin:
        charts, _s, _U, _V = m._loft_charts(rings, role)
        flags = [bool(smooth) and j is not None for _, j in faces]
    m._part(role, verts, [f for f, _ in faces], node, charts, flags if flags is not None else False)


def sweep_loop(m, role, path, section, node=None, smooth=True, up=(0.0, 1.0, 0.0)):
    """A closed tube swept around a closed path of 3D points. `section` is [(a, b)] offsets: a along
    the horizontal normal pointing out of the loop's centroid, b along `up`. No end caps."""
    n, k = len(path), len(section)
    cx = sum(p[0] for p in path) / n
    cz = sum(p[2] for p in path) / n
    verts = []
    for i, p in enumerate(path):
        t = tuple(path[(i + 1) % n][c] - path[i - 1][c] for c in range(3))
        nx, nz = t[2], -t[0]          # right of travel (horizontal)
        ln = math.hypot(nx, nz)
        nx, nz = nx / ln, nz / ln
        if nx * (p[0] - cx) + nz * (p[2] - cz) < 0:
            nx, nz = -nx, -nz
        for a, b in section:
            verts.append((p[0] + a * nx + b * up[0], p[1] + b * up[1] + a * 0.0, p[2] + a * nz + b * up[2]))
    faces = []
    for i in range(n):
        i2 = (i + 1) % n
        for j in range(k):
            j2 = (j + 1) % k
            faces.append((i * k + j, i2 * k + j, i2 * k + j2, i * k + j2))
    flip = volume(verts, faces) < 0
    charts = None
    if m.skin:
        key = m._new_chart()
        u = [0.0]
        for i in range(n):
            u.append(u[-1] + kit._dist(path[i], path[(i + 1) % n]))
        per = [0.0]
        for j in range(k):
            per.append(per[-1] + math.hypot(section[(j + 1) % k][0] - section[j][0], section[(j + 1) % k][1] - section[j][1]))
        charts = []
        for f in faces:
            i, j = divmod(f[0], k)
            uv = ((u[i], per[j]), (u[i + 1], per[j]), (u[i + 1], per[j + 1]), (u[i], per[j + 1]))
            charts.append((key, tuple(reversed(uv)) if flip else uv))
    if flip:
        faces = [tuple(reversed(f)) for f in faces]
    m._part(role, verts, faces, node, charts, [bool(smooth)] * len(faces))


def rot(p, yaw=0.0, pitch=0.0, roll=0.0):
    """Roll about x, then pitch about z, then yaw about y (degrees)."""
    x, y, z = p
    r, q, w = math.radians(roll), math.radians(pitch), math.radians(yaw)
    y, z = y * math.cos(r) - z * math.sin(r), y * math.sin(r) + z * math.cos(r)
    x, y = x * math.cos(q) - y * math.sin(q), x * math.sin(q) + y * math.cos(q)
    x, z = x * math.cos(w) + z * math.sin(w), -x * math.sin(w) + z * math.cos(w)
    return (x, y, z)


def obox(m, role, center, size, yaw=0.0, pitch=0.0, roll=0.0, node=None):
    """A box centered on `center`, `size` = (x, y, z) extents, turned about its center."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    corners = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
               (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    v = []
    for c in corners:
        p = rot(c, yaw, pitch, roll)
        v.append((center[0] + p[0], center[1] + p[1], center[2] + p[2]))
    solid(m, role, v, BOX_FACES, node)


def hexa(m, role, v8, node=None):
    """A hexahedron from eight corners in `kit.box` order (bottom 0-3 around, top 4-7 above them)."""
    v = list(v8)
    solid(m, role, v, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], node)


def cable(m, role, pts, radius, sides=4, node=None):
    for a, b in zip(pts, pts[1:]):
        m.strut(role, a, b, radius, sides=sides, node=node)


def arc(cx, cy, cz, radius, a0, a1, steps, plane='xz', ):
    """Points on an arc, angles in degrees. plane xz: around y; xy: in the vertical x-y plane."""
    out = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        if plane == 'xz':
            out.append((cx + radius * math.cos(a), cy, cz + radius * math.sin(a)))
        else:
            out.append((cx + radius * math.cos(a), cy + radius * math.sin(a), cz))
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def slab(m, role, quad, t, node=None):
    """A thin plate: `quad` (four corners) pushed `t` meters along its own normal (sign of t picks the side)."""
    p = [tuple(q) for q in quad]
    n = kit._unit(kit._newell(p))
    top = [tuple(c + n[i] * t for i, c in enumerate(q)) for q in p]
    solid(m, role, p + top, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], node)
