# tools/models/blender/kit.py
"""The Blender model kit (model-roster spec §4.2). Original work, AGPL-3.0-or-later.

Geometry is written in the glTF frame: +x forward, +y up, +z toward the viewer, meters.
The kit maps it to Blender's Z-up frame, and the exporter's +Y-up conversion maps it
back, so a script never thinks in Blender axes. (x, y, z) -> Blender (x, -z, y) is a
rotation (det +1), so face winding survives both ways.

Determinism: no randomness; parts accumulate in plain lists and become Blender
objects only at export, one per node, created in sorted name order. The building
parts (R4) are wound outward and checked by `tests/tools/models/blender/kitBuildings.test.ts`;
R2's `cylinder`, `tapered_box` and `turret` wound inward until DP2 fixed them (2026-09-28);
every part is now wound outward.
"""
import contextlib
import json
import math
import os
import sys

import bpy

# sRGB 0-1, the base (unweathered) colors of src/render/scene/buildings.ts, so a
# kit building matches what the game draws today.
DETAIL_KINDS = ('porthole', 'door', 'hatch', 'louver', 'ladder', 'strip')

PALETTE = {
    'steel': (0x59 / 255, 0x64 / 255, 0x5A / 255),
    'concrete': (0x8D / 255, 0x89 / 255, 0x78 / 255),
    'dark': (0x17 / 255, 0x26 / 255, 0x24 / 255),
    'timber': (0x61 / 255, 0x51 / 255, 0x3C / 255),
    # Buildings (R4). Packed earth and sandbags; no counterpart in buildings.ts, so a
    # modeling choice, not the game's own color.
    'earth': (0x7A / 255, 0x6A / 255, 0x4C / 255),
    # Neutral authoring colors. A ship entry maps these named roles to its
    # selected gameplay palette during the shared model pipeline.
    'hull': (0x5C / 255, 0x66 / 255, 0x70 / 255),
    'deck': (0x3B / 255, 0x3F / 255, 0x44 / 255),
    'flightDeck': (0x3B / 255, 0x3F / 255, 0x44 / 255),
    'boot': (0x1E / 255, 0x21 / 255, 0x24 / 255),
    'antifouling': (0x5B / 255, 0x2A / 255, 0x24 / 255),
    'superstructure': (0x5C / 255, 0x66 / 255, 0x70 / 255),
    'fitting': (0x4B / 255, 0x53 / 255, 0x5B / 255),
    # Aircraft (R3): flat period finishes, each an ESTIMATE named in the model script's header.
    'ijaGreen': (0x4B / 255, 0x55 / 255, 0x35 / 255),
    'underside': (0xA3 / 255, 0xA8 / 255, 0x9A / 255),
    'naturalMetal': (0xB4 / 255, 0xB8 / 255, 0xBC / 255),
    'glazing': (0x2E / 255, 0x3A / 255, 0x44 / 255),
}


# The keys cli_args parsed, and those a script has read. Model.export refuses to write
# while any given key was never read, so a typo (--widht) cannot build the default model.
_given = set()
_read = set()


def cli_args():
    """(output path, {key: value}) from everything after `--`. A key given twice is an error."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise ValueError('usage: blender -b -P <script> -- <out.glb> [--key value ...]')
    out, rest = argv[0], argv[1:]
    if len(rest) % 2 or any(not k.startswith('--') for k in rest[::2]):
        raise ValueError(f'arguments must be --key value pairs, got {rest}')
    opts = {}
    for k, v in zip(rest[::2], rest[1::2]):
        if k[2:] in opts:
            raise ValueError(f'{k} given twice')
        opts[k[2:]] = v
    _given.clear()
    _given.update(opts)
    _read.clear()
    return out, opts


def positive(opts, key, default, minimum=None):
    """A finite number > 0 (and >= minimum, if given) from --key, else default."""
    _read.add(key)
    raw = opts.get(key, default)
    try:
        v = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f'--{key} must be a number, got {raw!r}') from None
    if not math.isfinite(v) or v <= 0:
        raise ValueError(f'--{key} must be > 0, got {raw!r}')
    if minimum is not None and v < minimum:
        raise ValueError(f'--{key} must be at least {minimum:g} m, got {raw!r}')
    return v


def _require(ok, message):
    if not ok:
        raise ValueError(message)


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _material(role):
    mat = bpy.data.materials.get(role)
    if mat is None:
        mat = bpy.data.materials.new(role)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*(_srgb_to_linear(c) for c in PALETTE[role]), 1.0)
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = 0.85
    return mat


# Chord stations of the NACA 4-digit symmetric section, leading edge (0) to trailing edge (1).
AIRFOIL_STATIONS = (0.0, 0.05, 0.15, 0.3, 0.5, 0.75, 1.0)
# Chord stations for detailed sections (DP0): the leading edge's curvature resolved, as the downloads' is.
AIRFOIL_STATIONS_FINE = (0.0, 0.0125, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0)
# The gap around a control surface, chordwise and at its spanwise ends (ESTIMATE: visible at Hangar distance).
CONTROL_GAP_M = 0.012

# Skins (DP0, model-detail-pass spec §4). Atlas sizes a script may ask for: 1024 for aircraft
# and ships, 512 for buildings. Padding keeps mipmaps from bleeding one patch into the next.
SKIN_SIZES = (512, 1024, 2048)
SKIN_PADDING_PX = 4
# Edges sharper than this stay hard on a smooth-shaded skinned model (trailing edges, caps).
SHARP_DEG = 50.0
# Spar lines drawn on every wing and fin surface, as chord fractions (ESTIMATE: period practice).
SPARS = (0.2, 0.65)
# DP2: the default hull section, the starboard half from the keel up as (beam fraction, height
# fraction). h <= 0 is a fraction of the draft below the waterline, h > 0 of the deck edge's height
# (ESTIMATE: a full-bodied warship midsection; a script passes its own from its section table).
HULL_SECTION = ((0.0, -1.0), (0.35, -0.97), (0.7, -0.86), (0.92, -0.62), (1.0, -0.28), (1.0, 0.0), (1.0, 0.35), (1.0, 0.7), (1.0, 1.0))


def _unit(v):
    n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    _require(n > 0 and math.isfinite(n), f'direction must be a nonzero finite vector, got {v}')
    return (v[0] / n, v[1] / n, v[2] / n)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _dist(a, b):
    return math.sqrt(_dot(_sub(a, b), _sub(a, b)))


def _newell(points):
    """A polygon's (unnormalized) normal, robust for any planar polygon."""
    n = [0.0, 0.0, 0.0]
    for i, p in enumerate(points):
        q = points[(i + 1) % len(points)]
        n[0] += (p[1] - q[1]) * (p[2] + q[2])
        n[1] += (p[2] - q[2]) * (p[0] + q[0])
        n[2] += (p[0] - q[0]) * (p[1] + q[1])
    return tuple(n)


def _shelf_pack(sizes, mpp, width, pad):
    """Charts {key: (w m, h m)} into a width x width atlas at mpp meters per pixel: tallest
    first (ties by key), left to right in shelves. {key: (x, y, w px, h px)}, or None if they
    do not fit."""
    px = {k: (max(1, math.ceil(w / mpp)), max(1, math.ceil(h / mpp))) for k, (w, h) in sizes.items()}
    order = sorted(px, key=lambda k: (-px[k][1], k))
    placed, x, y, shelf = {}, 0, 0, 0
    for k in order:
        w, h = px[k]
        if w + 2 * pad > width:
            return None
        if x + w + 2 * pad > width:
            x, y, shelf = 0, y + shelf, 0
        if y + h + 2 * pad > width:
            return None
        placed[k] = (x + pad, y + pad, w, h)
        x += w + 2 * pad
        shelf = max(shelf, h + 2 * pad)
    return placed


def _loft(rings):
    """Side quads between consecutive rings, then both end caps, as (face, ring edge j) pairs
    (j is None for a cap). Every ring lists the same number of points, counterclockwise as seen
    from beyond the last ring looking back, so every face points outward."""
    count = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = []
    for s in range(len(rings) - 1):
        a, b = s * count, (s + 1) * count
        for j in range(count):
            k = (j + 1) % count
            faces.append(((a + j, a + k, b + k, b + j), j))
    last = (len(rings) - 1) * count
    faces.append((tuple(reversed(range(count))), None))
    faces.append((tuple(last + j for j in range(count)), None))
    return verts, faces


def quarter_of(segments):
    return segments // 4


def _ends(points):
    """The two points farthest apart, in a stable order: a line's ends."""
    a, b = max(((p, q) for p in points for q in points), key=lambda pq: sum((x - y) ** 2 for x, y in zip(*pq)))
    return (a, b) if a <= b else (b, a)


def _mirror_z(verts, faces):
    """The reflection in z = 0, windings reversed so faces still point outward."""
    return [(x, y, -z) for x, y, z in verts], [(tuple(reversed(f)), j) for f, j in faces]


def _half_thickness(f, chord, thickness):
    """NACA 4-digit half-thickness at chord fraction f, with the closed trailing-edge coefficient."""
    return 5 * thickness * chord * (0.2969 * math.sqrt(f) - 0.1260 * f - 0.3516 * f ** 2 + 0.2843 * f ** 3 - 0.1036 * f ** 4)


def _airfoil(chord, thickness):
    """(dx, dy) around a closed symmetric section: leading edge at 0, chord toward -x, upper
    surface first, so counterclockwise seen from +z. NACA 4-digit thickness with the closed
    trailing-edge coefficient: the leading and trailing edges are single points."""
    upper = [(-f * chord, _half_thickness(f, chord, thickness)) for f in AIRFOIL_STATIONS]
    lower = [(-f * chord, -_half_thickness(f, chord, thickness)) for f in reversed(AIRFOIL_STATIONS[1:-1])]
    return upper + lower


def _airfoil_part(chord, thickness, f0, f1, stations):
    """(points, labels) around the closed part of a section between chord fractions f0 < f1: the
    upper surface from the leading end to the trailing end, then the lower back, counterclockwise
    seen from +z as _airfoil's. A cut end (f0 > 0 or f1 < 1) closes with a straight edge;
    labels[i] is (fraction, 'u' or 'l'). With f0 = 0, f1 = 1 and AIRFOIL_STATIONS this is _airfoil."""
    _require(0.0 <= f0 < f1 <= 1.0, f'airfoil part: need 0 <= f0 < f1 <= 1, got {f0}, {f1}')
    fs = [f0] + [f for f in stations if f0 < f < f1] + [f1]
    low = list(reversed(fs))
    if f1 == 1.0:
        low = low[1:]
    if f0 == 0.0:
        low = low[:-1]
    pts = [(-f * chord, _half_thickness(f, chord, thickness)) for f in fs] + [(-f * chord, -_half_thickness(f, chord, thickness)) for f in low]
    return pts, [(f, 'u') for f in fs] + [(f, 'l') for f in low]


def _refine(vals, k):
    """k - 1 stations between each authored pair of (x, half_w, half_h, center_y, exponent): x
    linear, the rest Catmull-Rom (ends repeated). Half-sizes are clamped to at least half the
    smaller neighbor and the exponent to at least 1, so a pointed end cannot go negative.
    Returns (stations, indices of the authored ones)."""
    out, authored, m = [], [], len(vals)
    for i in range(m - 1):
        p0, p1, p2, p3 = vals[max(i - 1, 0)], vals[i], vals[i + 1], vals[min(i + 2, m - 1)]
        authored.append(len(out))
        out.append(p1)
        for s in range(1, k):
            t = s / k
            rest = []
            for c in range(1, 5):
                v = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t
                           + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t)
                if c in (1, 2):
                    v = max(v, 0.5 * min(p1[c], p2[c]))
                if c == 4:
                    v = max(v, 1.0)
                rest.append(v)
            out.append((p1[0] + (p2[0] - p1[0]) * t, *rest))
    authored.append(len(out))
    out.append(vals[-1])
    return out, authored


def _refine_hull(vals, k):
    """k - 1 stations between each authored pair of (x, half_beam, draft, deck_y, deck_half_beam):
    x linear, the rest Catmull-Rom (ends repeated), each clamped between half the smaller neighbor
    and the larger, so a flat midbody stays flat (a pinned keel cannot overshoot) and a fine end
    cannot go negative."""
    out, m = [], len(vals)
    for i in range(m - 1):
        p0, p1, p2, p3 = vals[max(i - 1, 0)], vals[i], vals[i + 1], vals[min(i + 2, m - 1)]
        out.append(p1)
        for s in range(1, k):
            t = s / k
            rest = []
            for c in range(1, 5):
                v = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t
                           + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t)
                rest.append(min(max(v, 0.5 * min(p1[c], p2[c])), max(p1[c], p2[c])))
            out.append((p1[0] + (p2[0] - p1[0]) * t, *rest))
    out.append(vals[-1])
    return out


def _section_labels(stations):
    """(chord fraction, 'u' or 'l') for each point of _airfoil's ring, in ring order: the upper
    surface leading edge to trailing edge, then the lower back (both edges are single points)."""
    return [(f, 'u') for f in stations] + [(f, 'l') for f in reversed(stations[1:-1])]


class Model:
    def __init__(self, name, skin=None):
        _require(skin is None or skin in SKIN_SIZES, f'skin must be None or one of {SKIN_SIZES}, got {skin!r}')
        self.name = name
        self.skin = skin
        self._nodes = {}  # node name -> [role, verts, faces, face charts, face smooth]
        self._charts = {}  # chart key (int, creation order) -> tag
        self._lines = []  # (chart key, axis, at, lo, hi, kind), chart-local meters
        self._markings = []
        self._tag = 'part'
        self._shared = None  # inside shared_chart(): (tag, role) -> its one chart key, else None
        self._hull = None  # DP2: the last hull_lines' refined stations, for hull_at
        self._parents = {}  # node -> the node it hangs under, so the build's collapse makes them one part
        self._hinges = {}  # control node -> [hinge-line points], written to <out>.hinges.json
        self._fixed_hinges = {}  # bay door node -> {point, axis}, already oriented (C2), written with them
        self._shared_keys = set()  # M1c: chart keys made inside shared_chart() (overlapping, so never baked)
        self._details = []  # M1c: bake-only detail (detail()); written to <out>.detail.json, never exported

    @contextlib.contextmanager
    def tagged(self, tag):
        """Every chart made inside is tagged `tag`, so a marking can name the parts it paints."""
        _require(isinstance(tag, str) and tag, f'tagged: tag must be a nonempty string, got {tag!r}')
        prev, self._tag = self._tag, tag
        try:
            yield
        finally:
            self._tag = prev

    @contextlib.contextmanager
    def shared_chart(self):
        """Planar faces made inside share one chart per (tag, role), each face keeping its own
        face-local (u, v): they overlap in the atlas, the chart's box is the union of their
        extents, and the rasterizer's first writer paints each shared texel. For small, uniformly
        painted fittings (frames, rails, rib sides), whose one-chart-per-face padding would
        otherwise eat the atlas. Analytic charts (loft sides, vault shells) are unaffected.
        Keyed by role as well as tag because the G-buffer stores one role per texel: glass
        sharing a patch with its steel frame would paint one in the other's color."""
        prev, self._shared = self._shared, {}
        try:
            yield
        finally:
            self._shared = prev

    def marking(self, kind, **fields):
        """A marking for the skin stage, in model coordinates (tools/models/skin/sidecar.ts validates it)."""
        _require(kind in ('disc', 'polygon', 'slab', 'grid', 'text', 'planks'), f'marking: unknown kind {kind!r}')
        self._markings.append({'kind': kind, **{k: list(v) if isinstance(v, tuple) else v for k, v in fields.items()}})

    def detail(self, kind, origin, axis, **params):
        """(M1c) Bake-only surface detail: never in the glb, only in the high-poly the bake projects onto
        the atlas (bake.py builds it). `origin` is a point just off the surface and `axis` the outward
        direction the bake ray-casts back along to find it, model coordinates. Kinds and their params
        are bake.py's BUILDERS. With any detail, the sidecar lists the patches the bake may paint."""
        _require(kind in DETAIL_KINDS, f'detail: unknown kind {kind!r}; kinds are {DETAIL_KINDS}')
        self._details.append({'kind': kind, 'origin': [float(c) for c in origin], 'axis': [float(c) for c in axis],
                              **{k: (list(v) if isinstance(v, tuple) else v) for k, v in params.items()}})

    def railing(self, role, points, height=1.0, post_m=2.4, rails=2, radius=0.025, node=None):
        """(M1c) Stanchions and rails along a polyline of feet (model coordinates, each on its deck):
        a post at every point and at most `post_m` apart between them, `rails` rails at even heights
        up to `height`. Thin 4-sided struts: geometry, not an alpha strip (the build has no alpha path)."""
        _require(len(points) >= 2 and height > 0 and post_m > 0 and rails >= 1, f'railing: need >= 2 points and positive sizes, got {len(points)}')
        feet = [tuple(points[0])]
        for a, b in zip(points, points[1:]):
            n = max(1, math.ceil(_dist(a, b) / post_m))
            feet += [tuple(a[i] + (b[i] - a[i]) * k / n for i in range(3)) for k in range(1, n + 1)]
        for f in feet:
            self.strut(role, f, (f[0], f[1] + height, f[2]), radius, sides=4, node=node)
        for r in range(1, rails + 1):
            h = height * r / rails - radius
            for a, b in zip(points, points[1:]):
                self.strut(role, (a[0], a[1] + h, a[2]), (b[0], b[1] + h, b[2]), radius, sides=4, node=node)

    def _new_chart(self):
        key = len(self._charts)
        self._charts[key] = self._tag
        return key

    def _line(self, chart, axis, at, lo, hi, kind='panel'):
        if self.skin:
            self._lines.append((chart, axis, at, lo, hi, kind))

    def _planar_charts(self, verts, faces, role=None):
        """One chart per face, projected on its own plane: u along its first edge, v = n x u.
        Inside shared_chart(), every face of one (tag, role) takes that pair's one chart key."""
        out = []
        for f in faces:
            p = [verts[i] for i in f]
            u = _unit(next(_sub(q, p[0]) for q in p[1:] if _dist(q, p[0]) > 1e-9))
            v = _cross(_unit(_newell(p)), u)
            if self._shared is None:
                key = self._new_chart()
            else:
                slot = (self._tag, role)
                if slot not in self._shared:
                    self._shared[slot] = self._new_chart()
                    self._shared_keys.add(self._shared[slot])
                key = self._shared[slot]
            out.append((key, tuple((_dot(_sub(q, p[0]), u), _dot(_sub(q, p[0]), v)) for q in p)))
        return out

    def _loft_charts(self, rings, role=None, true_arc=False):
        """Charts for _loft's faces, in its order: one chart for every side quad (u = distance
        along the ring centroids, v = each ring's own arc-length fraction x the longest ring's
        perimeter), then a planar chart per cap. With true_arc, v is each ring's true arc length.
        Returns (charts, side key, U, V)."""
        count = len(rings[0])
        cent = [tuple(sum(p[i] for p in r) / count for i in range(3)) for r in rings]
        U = [0.0]
        for s in range(1, len(rings)):
            U.append(U[-1] + _dist(cent[s - 1], cent[s]))
        arcs = []
        for r in rings:
            c = [0.0]
            for j in range(count):
                c.append(c[-1] + _dist(r[j], r[(j + 1) % count]))
            arcs.append(c)
        pmax = max(c[-1] for c in arcs)
        # true_arc (DP2): each ring's own arc length from its first point, so texel density holds
        # to a hull's fine ends; the default keeps DP0's fraction x the longest perimeter.
        V = [list(c) for c in arcs] if true_arc else [[pmax * c[j] / c[-1] for j in range(count + 1)] for c in arcs]
        side = self._new_chart()
        charts = []
        for s in range(len(rings) - 1):
            for j in range(count):
                charts.append((side, ((U[s], V[s][j]), (U[s], V[s][j + 1]), (U[s + 1], V[s + 1][j + 1]), (U[s + 1], V[s + 1][j]))))
        verts = [p for ring in rings for p in ring]
        last = (len(rings) - 1) * count
        # Caps always stay with the loft's main role (_emit), so inside shared_chart() they key on it
        # (hull_lines splits its caps at the waterline and keeps this key on both halves).
        charts.extend(self._planar_charts(verts, [tuple(reversed(range(count))), tuple(last + j for j in range(count))], role))
        return charts, side, U, V

    def _mirror_charts(self, charts):
        """The z-mirror of `charts`: new keys with the same tags, corners reversed as _mirror_z
        reverses windings, and the lines on the old keys copied onto the new."""
        remap = {}
        for key, _ in charts:
            if key not in remap:
                remap[key] = len(self._charts)
                self._charts[remap[key]] = self._charts[key]
                if key in self._shared_keys:
                    self._shared_keys.add(remap[key])
        for (k, axis, at, lo, hi, kind) in list(self._lines):
            if k in remap:
                self._lines.append((remap[k], axis, at, lo, hi, kind))
        return [(remap[k], tuple(reversed(uvs))) for k, uvs in charts]

    def _spar_lines(self, side, U, V, labels):
        """A spanwise line on the upper and the lower surface at each SPARS chord fraction, at the
        section point nearest it (within 0.1 chord, else that spar is not on this piece), along
        the whole side chart. `labels` is the ring's (fraction, surface) list."""
        upper = [(f, i) for i, (f, sfc) in enumerate(labels) if sfc == 'u' and 0 < f < 1]
        for spar in SPARS:
            if not upper:
                return
            f, _i = min(upper, key=lambda fi: (abs(fi[0] - spar), fi[1]))
            if abs(f - spar) > 0.1:
                continue
            for j, (g, _sfc) in enumerate(labels):
                if g == f:
                    self._line(side, 'v', V[0][j], U[0], U[-1])

    def _part(self, role, verts, faces, node, charts=None, smooth=False):
        if role not in PALETTE:
            raise ValueError(f'unknown role {role!r}; palette roles are {sorted(PALETTE)}')
        key = node or f'{self.name}_{role}'
        entry = self._nodes.setdefault(key, [role, [], [], [], []])
        if entry[0] != role:
            raise ValueError(f'node {key!r} already has role {entry[0]!r}, not {role!r}')
        base = len(entry[1])
        entry[1].extend(verts)
        entry[2].extend(tuple(base + i for i in f) for f in faces)
        if self.skin:
            charts = self._planar_charts(verts, faces, role) if charts is None else charts
            _require(len(charts) == len(faces), f'{key}: {len(charts)} charts for {len(faces)} faces')
            entry[3].extend(charts)
            entry[4].extend(smooth if isinstance(smooth, list) else [smooth] * len(faces))

    def box(self, role, base, size, node=None):
        x, y, z = base
        w, h, l = size
        x0, x1, y0, y1, z0, z1 = x - w / 2, x + w / 2, y, y + h, z - l / 2, z + l / 2
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
        self._part(role, v, f, node)

    def ship_hull(self, role, stations, node=None, deck_role=None, deck_node=None):
        """Loft a closed ship hull from ordered stations in the glTF frame.

        Each station is ``(x, half_beam, draft, freeboard[, sheer])``. The
        waterline is y=0, draft extends downward, and freeboard+sheer is the
        deck edge. End stations stay narrow but nonzero so every triangle is
        well-defined; the bow and stern caps close the volume.

        With ``deck_role``, the hull's own top (between the deck-edge
        vertices) goes to ``deck_node`` in that role instead: a painted deck
        that follows the hull's plan and sheer, with no separate slab to
        overhang the taper or z-fight the top.
        """
        _require(len(stations) >= 3, f'ship_hull: need at least 3 stations, got {len(stations)}')
        parsed = []
        for i, station in enumerate(stations):
            _require(len(station) in (4, 5), f'ship_hull: station {i} needs 4 or 5 values, got {len(station)}')
            values = tuple(float(v) for v in station)
            _require(all(math.isfinite(v) for v in values), f'ship_hull: station {i} has a non-finite value')
            x, half_beam, draft, freeboard = values[:4]
            sheer = values[4] if len(values) == 5 else 0.0
            _require(half_beam > 0 and draft > 0 and freeboard > 0,
                     f'ship_hull: station {i} half-beam, draft and freeboard must be > 0')
            parsed.append((x, half_beam, draft, freeboard + sheer))
        _require(all(parsed[i][0] < parsed[i + 1][0] for i in range(len(parsed) - 1)),
                 'ship_hull: station x values must be strictly increasing')

        verts = []
        # Clockwise in the y-z section as seen from +x. With x increasing,
        # the side-quad winding below points away from the enclosed volume.
        for x, beam, draft, deck_y in parsed:
            verts.extend([
                (x, -draft, 0.0),
                (x, -draft * 0.55, beam * 0.75),
                (x, 0.0, beam),
                (x, deck_y, beam * 0.88),
                (x, deck_y, -beam * 0.88),
                (x, 0.0, -beam),
                (x, -draft * 0.55, -beam * 0.75),
            ])
        ring = 7
        faces, deck_faces = [], []
        top = 3  # the ring edge from (deck_y, +0.88 beam) to (deck_y, -0.88 beam)
        for station in range(len(parsed) - 1):
            a, b = station * ring, (station + 1) * ring
            for j in range(ring):
                k = (j + 1) % ring
                (deck_faces if deck_role is not None and j == top else faces).append((a + j, b + j, b + k, a + k))
        # The station ring itself points -x; reverse it for the +x bow.
        faces.append(tuple(range(ring)))
        last = (len(parsed) - 1) * ring
        faces.append(tuple(last + j for j in reversed(range(ring))))
        self._part(role, verts, faces, node)
        if deck_role is not None:
            used = sorted({i for f in deck_faces for i in f})
            index = {old: new for new, old in enumerate(used)}
            self._part(deck_role, [verts[i] for i in used], [tuple(index[i] for i in f) for f in deck_faces], deck_node)

    def deck(self, role, center, length, width, height, thickness=0.25, node=None):
        """A slab whose upper face is exactly ``height`` meters."""
        _require(length > 0 and width > 0 and height >= 0 and thickness > 0,
                 f'deck: length, width and thickness must be > 0 and height >= 0, got {length}, {width}, {height}, {thickness}')
        x, z = center
        # box()'s faces, but the top starts on an edge along x (same winding), so its chart lies long
        # across the atlas: stood on end, a carrier's 146 m deck took a whole shelf and left the
        # atlas 60% empty at 13 cm/px (M1c, measured 2026-10-09).
        x0, x1, y0, y1, z0, z1 = x - length / 2, x + length / 2, height - thickness, height, z - width / 2, z + width / 2
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (0, 4, 7, 3), (1, 2, 6, 5)]
        self._part(role, v, f, node)

    def tapered_box(self, role, base, lower, upper, height, node=None):
        """A centered truncated rectangular prism, useful for bridges and islands."""
        _require(height > 0 and min(*lower, *upper) > 0,
                 f'tapered_box: height and every width must be > 0, got {height}, {lower}, {upper}')
        x, y, z = base
        lx, lz = lower[0] / 2, lower[1] / 2
        ux, uz = upper[0] / 2, upper[1] / 2
        v = [(x - lx, y, z - lz), (x + lx, y, z - lz), (x + lx, y, z + lz), (x - lx, y, z + lz),
             (x - ux, y + height, z - uz), (x + ux, y + height, z - uz),
             (x + ux, y + height, z + uz), (x - ux, y + height, z + uz)]
        # Outward (DP2): R2's list wound every face inward (R4 handoff); frustum's winding, same layout.
        f = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        self._part(role, v, f, node)

    def cylinder(self, role, base, radius, height, segments=12, node=None):
        """A deterministic vertical prism/cylinder with closed end caps."""
        _require(radius > 0 and height > 0, f'cylinder: radius and height must be > 0, got {radius}, {height}')
        _require(isinstance(segments, int) and segments >= 3, f'cylinder: segments must be an integer >= 3, got {segments}')
        x, y, z = base
        v = []
        for yy in (y, y + height):
            v.extend((x + math.cos(2 * math.pi * i / segments) * radius, yy,
                      z + math.sin(2 * math.pi * i / segments) * radius) for i in range(segments))
        # Outward (DP2): the floor faces -y, the walls away from the axis, the top +y (tank's winding).
        f = [tuple(range(segments)), tuple(reversed(range(segments, 2 * segments)))]
        for i in range(segments):
            j = (i + 1) % segments
            f.append((i, segments + i, segments + j, j))
        self._part(role, v, f, node)

    def turret(self, role, index, center, facing, body, barrel_length, barrels=2, node=None):
        """A tapered gunhouse plus evenly spaced rectangular barrels in ``TurretN``."""
        _require(isinstance(index, int) and index > 0, f'turret: index must be a positive integer, got {index}')
        _require(facing in (-1, 1), f'turret: facing must be -1 or +1, got {facing}')
        _require(isinstance(barrels, int) and barrels > 0, f'turret: barrels must be a positive integer, got {barrels}')
        length, width, height = body
        _require(min(length, width, height, barrel_length) > 0, 'turret: body and barrel dimensions must be > 0')
        key = node or f'Turret{index}'
        x, y, z = center
        self.tapered_box(role, (x, y, z), (length, width), (length * 0.72, width * 0.8), height, key)
        spacing = width / (barrels + 1)
        muzzle_x = x + facing * (length / 2 + barrel_length / 2)
        for barrel in range(barrels):
            zz = z + (barrel - (barrels - 1) / 2) * spacing
            self.box(role, (muzzle_x, y + height * 0.55, zz), (barrel_length, height * 0.12, width * 0.08), key)

    def barrel_vault(self, role, spring, width, rise, length, thickness, segments, node=None):
        """Half-elliptic shell over the springing line: outer semi-axes (width/2, rise),
        inner inset by `thickness`, open at both ends except for the rims."""
        _require(width > 0 and rise > 0 and length > 0, f'barrel_vault: width, rise and length must be > 0, got {width}, {rise}, {length}')
        _require(0 < thickness < min(width / 2, rise), f'barrel_vault: thickness {thickness} must be > 0 and < min(width/2, rise) = {min(width / 2, rise)}')
        _require(segments >= 2, f'barrel_vault: segments must be >= 2, got {segments}')
        x, y, z = spring
        n = segments
        ring = lambda a, rx, ry, zz: (x + math.cos(a) * rx, y + math.sin(a) * ry, zz)
        v = []
        for zz in (z - length / 2, z + length / 2):
            v += [ring(math.pi * i / n, width / 2, rise, zz) for i in range(n + 1)]
        for zz in (z - length / 2, z + length / 2):
            v += [ring(math.pi * i / n, width / 2 - thickness, rise - thickness, zz) for i in range(n + 1)]
        o0, o1, i0, i1 = 0, n + 1, 2 * (n + 1), 3 * (n + 1)
        f = []
        for i in range(n):
            f.append((o0 + i, o0 + i + 1, o1 + i + 1, o1 + i))      # outer, faces out
            f.append((i0 + i, i1 + i, i1 + i + 1, i0 + i + 1))      # inner, faces the axis
            f.append((o0 + i, i0 + i, i0 + i + 1, o0 + i + 1))      # rim at -z
            f.append((o1 + i, o1 + i + 1, i1 + i + 1, i1 + i))      # rim at +z
        charts, smooth = None, False
        if self.skin:
            def arc(rx, ry):
                c = [0.0]
                for i in range(n):
                    c.append(c[-1] + _dist(ring(math.pi * i / n, rx, ry, 0.0), ring(math.pi * (i + 1) / n, rx, ry, 0.0)))
                return c
            so, si = arc(width / 2, rise), arc(width / 2 - thickness, rise - thickness)
            outer, inner = self._new_chart(), self._new_chart()
            rims = self._planar_charts(v, [f[4 * i + 2] for i in range(n)] + [f[4 * i + 3] for i in range(n)], role)
            charts = []
            for i in range(n):
                charts.append((outer, ((0.0, so[i]), (0.0, so[i + 1]), (length, so[i + 1]), (length, so[i]))))
                charts.append((inner, ((0.0, si[i]), (length, si[i]), (length, si[i + 1]), (0.0, si[i + 1]))))
                charts.append(rims[i])
                charts.append(rims[n + i])
            # The shells are a sampled curve, like a loft's sides: smooth. The rims stay flat.
            smooth = [True, True, False, False] * n
        self._part(role, v, f, node, charts, smooth)

    def arch_gable(self, role, base, width, wall, rise, thickness, segments, node=None):
        """An end wall: a rectangle `wall` high under a half-ellipse `rise` high, as a slab
        `thickness` deep along z, centered on base z. The outline is convex."""
        _require(width > 0 and rise > 0 and thickness > 0 and wall >= 0, f'arch_gable: width, rise, thickness must be > 0 and wall >= 0, got {width}, {rise}, {thickness}, {wall}')
        _require(segments >= 2, f'arch_gable: segments must be >= 2, got {segments}')
        x, y, z = base
        outline = [(x + width / 2, y)]
        outline += [(x + math.cos(math.pi * i / segments) * width / 2, y + wall + math.sin(math.pi * i / segments) * rise)
                    for i in range(segments + 1)]
        outline.append((x - width / 2, y))
        k = len(outline)
        front = [(px, py, z + thickness / 2) for px, py in outline]
        back = [(px, py, z - thickness / 2) for px, py in outline]
        f = [tuple(range(k)), tuple(reversed(range(k, 2 * k)))]
        for i in range(k):
            j = (i + 1) % k
            f.append((i, k + i, k + j, j))
        self._part(role, front + back, f, node)

    # ---- aircraft parts (R3) ------------------------------------------------------------

    def _emit(self, role, verts, faces, node, lower_role=None, lower_node=None, is_lower=None, charts=None, smooth=None):
        """Adds (face, j) pairs to ``node``; with ``lower_role``, faces whose ring edge
        ``is_lower`` go to ``lower_node`` in that role instead (caps stay with ``role``).
        ``charts`` and ``smooth`` (skinned models only) run parallel to ``faces``."""
        groups = [(role, node, [i for i, (f, j) in enumerate(faces) if lower_role is None or j is None or not is_lower(j)])]
        if lower_role is not None:
            groups.append((lower_role, lower_node, [i for i, (f, j) in enumerate(faces) if j is not None and is_lower(j)]))
        for r, nd, ids in groups:
            fs = [faces[i][0] for i in ids]
            used = sorted({i for f in fs for i in f})
            index = {old: new for new, old in enumerate(used)}
            self._part(r, [verts[i] for i in used], [tuple(index[i] for i in f) for f in fs], nd,
                       None if charts is None else [charts[i] for i in ids],
                       False if smooth is None else [smooth[i] for i in ids])

    def fuselage(self, role, stations, segments=16, center_z=0.0, node=None, lower_role=None, lower_node=None, subdivide=1, doors=None):
        """Loft a fuselage, nacelle, boom or canopy from stations in the glTF frame.

        Each station is ``(x, half_width, half_height, center_y[, exponent])``: a superellipse
        section (exponent 2 is an ellipse, larger is boxier; default 2.2) centered on
        (center_y, ``center_z``). Stations run tail to nose, x strictly increasing, and both
        ends are capped, so a pointed end is a tiny nonzero section. With ``lower_role``, the
        side faces below each section's center go to ``lower_node`` in that role.
        ``subdivide`` k > 1 lofts k - 1 Catmull-Rom stations between each authored pair (a
        smoother silhouette); panel lines stay at the authored ones.

        ``doors`` (C2) is a list of (x0, x1, half_width) bomb bays, numbered in the order given: the
        belly quads between the rings nearest x0 and x1, out to the first ring vertex at least
        ``half_width`` from the keel, become nodes ``BayDoor<n>L`` and ``BayDoor<n>R``, each hinged on
        its outboard edge (recorded for the build, oriented so a positive turn opens it down and
        out), over a dark well with inward faces, so the open bay shows a bay, not the sky through
        the far skin. The doors keep the skin's own chart: shut, they are the skin.
        """
        _require(isinstance(segments, int) and segments >= 8 and segments % 4 == 0,
                 f'fuselage: segments must be a multiple of 4, at least 8, got {segments!r}')
        _require(isinstance(subdivide, int) and subdivide >= 1, f'fuselage: subdivide must be an integer >= 1, got {subdivide!r}')
        _require(len(stations) >= 2, f'fuselage: need at least 2 stations, got {len(stations)}')
        vals = []
        for i, st in enumerate(stations):
            _require(len(st) in (4, 5), f'fuselage: station {i} needs 4 or 5 values, got {len(st)}')
            values = tuple(float(v) for v in st)
            _require(all(math.isfinite(v) for v in values), f'fuselage: station {i} has a non-finite value')
            x, half_w, half_h, center_y = values[:4]
            n = values[4] if len(values) == 5 else 2.2
            _require(half_w > 0 and half_h > 0 and n >= 1,
                     f'fuselage: station {i} half-width and half-height must be > 0 and exponent >= 1')
            vals.append((x, half_w, half_h, center_y, n))
        _require(all(vals[i][0] < vals[i + 1][0] for i in range(len(vals) - 1)), 'fuselage: station x values must be strictly increasing')
        authored = list(range(len(vals)))
        if subdivide > 1:
            vals, authored = _refine(vals, subdivide)
        rings = []
        for x, half_w, half_h, center_y, n in vals:
            ring = []
            for j in range(segments):
                t = 2 * math.pi * j / segments
                c, s = math.cos(t), math.sin(t)
                ring.append((x, center_y + half_h * math.copysign(abs(c) ** (2 / n), c),
                             center_z + half_w * math.copysign(abs(s) ** (2 / n), s)))
            rings.append(ring)
        verts, faces = _loft(rings)
        quarter = segments // 4
        charts = smooth = None
        if self.skin:
            charts, side, U, V = self._loft_charts(rings, role)
            smooth = [j is not None for _, j in faces]
            for s in authored[1:-1]:
                self._line(side, 'u', U[s], 0.0, V[s][-1])
        if doors:
            keep = self._bay_doors(doors, rings, verts, faces, charts, smooth, segments, lower_role or role)
            faces = [faces[i] for i in keep]
            charts = None if charts is None else [charts[i] for i in keep]
            smooth = None if smooth is None else [smooth[i] for i in keep]
        self._emit(role, verts, faces, node, lower_role, lower_node, lambda j: quarter <= j < 3 * quarter, charts, smooth)

    def _bay_doors(self, doors, rings, verts, faces, charts, smooth, segments, role):
        """Takes each bay's belly quads out of a fuselage loft into its two door nodes and adds its well
        (see ``fuselage``). Returns the indices of the faces the fuselage keeps."""
        count = segments
        keel = segments // 2  # t = pi: the bottom of the section (y = center - half_h)
        xs = [ring[0][0] for ring in rings]
        taken = set()
        for n, (x0, x1, half_width) in enumerate(doors, start=1):
            s0 = min(range(len(xs)), key=lambda i: abs(xs[i] - x0))
            s1 = min(range(len(xs)), key=lambda i: abs(xs[i] - x1))
            _require(s1 > s0, f'bay {n}: x {x0}..{x1} snaps to no ring span (rings at {xs[s0]:.3f}, {xs[s1]:.3f})')
            mid = rings[(s0 + s1) // 2]
            m = next((k for k in range(1, quarter_of(segments)) if abs(mid[keel - k][2] - mid[keel][2]) >= half_width), None)
            _require(m is not None, f'bay {n}: half width {half_width} reaches past the belly')
            for side, js in (('R', range(keel - m, keel)), ('L', range(keel, keel + m))):
                name = f'BayDoor{n}{side}'
                ids = [s * count + j for s in range(s0, s1) for j in js]
                taken.update(ids)
                fs = [faces[i] for i in ids]
                self._emit(role, verts, fs, name, None, None, None,
                           None if charts is None else [charts[i] for i in ids],
                           None if smooth is None else [smooth[i] for i in ids])
                # The hinge runs fore and aft along the outboard edge. A tapering belly bends that edge, so
                # the line goes through its widest and highest point: inside the skin at every station.
                edge = keel - m if side == 'R' else keel + m
                ring_edge = [rings[s][edge] for s in range(s0, s1 + 1)]
                a = (rings[s0][edge][0], max(p[1] for p in ring_edge), max((p[2] for p in ring_edge), key=abs))
                axis = [1.0, 0.0, 0.0]
                # Positive turn opens it: the keel edge, turned a little about the hinge, must go down.
                k = rings[(s0 + s1) // 2][keel]
                r = [k[i] - a[i] for i in range(3)]
                if (axis[2] * r[0] - axis[0] * r[2]) > 0:  # (axis x r).y, the keel edge's vertical velocity
                    axis = [-c for c in axis]
                self._fixed_hinges[name] = {'point': [round(c, 6) for c in a], 'axis': [round(c, 9) for c in axis]}
            self._bay_well(rings[s0], rings[s1], keel, m)
        return [i for i in range(len(faces)) if i not in taken]

    def _bay_well(self, fore, aft, keel, m):
        """The dark box behind a bay's doors: its ends follow the belly arc between the hinges (so no
        corner pokes out of the skin), its sides stand on the hinge lines, and it is open below. Wound
        inward: it is seen from outside, through the opening, only from within."""
        inset = 0.01
        arc = lambda ring, dx: [(ring[j][0] + dx, ring[j][1] + inset, ring[j][2]) for j in range(keel - m, keel + m + 1)]  # noqa: E731
        lo_f, lo_a = arc(fore, inset), arc(aft, -inset)
        # Shallow: 0.1 m above the hinges keeps it under the wing's center section, which a deeper well cut
        # through (a pale diamond in the open bay, 2026-10-08: the G4M's at 0.5 x the section, the Ki-21's,
        # whose wing underside is 0.13 m above its hinges, at 0.2 m). From below it reads as a bay.
        top = max(p[1] for p in lo_f + lo_a) + 0.1
        zr, zl = lo_f[0][2], lo_f[-1][2]
        verts, faces = [], []
        def quad(p, q, r, t):
            base = len(verts)
            verts.extend([p, q, r, t])
            faces.append((base, base + 1, base + 2, base + 3))
        def end(arcpts, x, facing):
            base = len(verts)
            verts.extend(arcpts + [(x, top, zl), (x, top, zr)])
            ring = list(range(base, len(verts)))
            faces.append(tuple(ring) if facing > 0 else tuple(reversed(ring)))
        # Arc then top, in this order, faces +x by the right-hand rule: right for the aft end (rings run
        # tail to nose, so rings[s0] is aft, at the smaller x), and reversed for the fore end.
        end(lo_f, lo_f[0][0], 1)
        end(lo_a, lo_a[0][0], -1)
        xf, xa = lo_f[0][0], lo_a[0][0]
        # Sides on the hinge lines, the top: each wound to face into the box.
        quad((xf, lo_f[0][1], zr), (xf, top, zr), (xa, top, zr), (xa, lo_a[0][1], zr))
        quad((xf, lo_f[-1][1], zl), (xa, lo_a[-1][1], zl), (xa, top, zl), (xf, top, zl))
        quad((xf, top, zr), (xf, top, zl), (xa, top, zl), (xa, top, zr))
        self._part('dark', verts, faces, None)

    def wing(self, role, le_x, root_y, root_chord, tip_chord, span, sweep_deg=0.0, dihedral_deg=0.0,
             thickness=0.12, tip_thickness=None, root_z=0.0, mirror=True, node=None, lower_role=None, lower_node=None,
             stations=None, span_segments=1, controls=None):
        """A tapered lifting surface, both halves by default: a wing or a tailplane.

        The root section's leading edge is at (``le_x``, ``root_y``, ``root_z``); the panel runs
        to z = span/2, its leading edge swept back ``sweep_deg`` and raised ``dihedral_deg``.
        Sections are NACA 4-digit symmetric (``thickness`` is a fraction of chord) with a closed
        trailing edge. ``mirror`` adds the left half, reflected in z = 0. ``lower_role`` paints
        the lower surface, as ``fuselage`` does.

        Detail (DP0, all opt-in): ``stations`` are the section's chord fractions (e.g.
        AIRFOIL_STATIONS_FINE), ``span_segments`` lofts that many spans root to tip, and
        ``controls`` is a list of (z0, z1, hinge chord fraction, name) in absolute z, clipped to the
        panel: each is its own piece aft of the hinge, with CONTROL_GAP_M gaps around it, in node
        ``<name>R`` (``<name>L`` for the mirror; ``name`` itself without one), with its hinge line
        recorded for the build (C1).
        """
        half = span / 2
        tip_t = thickness if tip_thickness is None else tip_thickness
        _require(root_chord > 0 and tip_chord > 0, f'wing: root and tip chords must be > 0, got {root_chord}, {tip_chord}')
        _require(0 <= root_z < half, f'wing: root_z must be >= 0 and inside span/2, got {root_z} for span {span}')
        _require(0 < thickness < 0.3 and 0 < tip_t < 0.3, f'wing: thickness ratios must be in (0, 0.3), got {thickness}, {tip_t}')
        _require(abs(sweep_deg) < 60 and abs(dihedral_deg) < 30, f'wing: |sweep| must be < 60 deg and |dihedral| < 30 deg, got {sweep_deg}, {dihedral_deg}')
        length = half - root_z
        tip_le = le_x - length * math.tan(math.radians(sweep_deg))
        tip_y = root_y + length * math.tan(math.radians(dihedral_deg))
        if stations is not None or span_segments != 1 or controls:
            def section(z):
                f = (z - root_z) / length
                chord = root_chord + (tip_chord - root_chord) * f
                thick = thickness * root_chord + (tip_t * tip_chord - thickness * root_chord) * f
                return (chord, thick / chord, le_x - (z - root_z) * math.tan(math.radians(sweep_deg)),
                        root_y + (z - root_z) * math.tan(math.radians(dihedral_deg)))
            self._lifting_detailed(role, section, root_z, half, stations, span_segments, controls, node, lower_role, lower_node, mirror, lambda v: v)
            return
        rings = [
            [(le_x + dx, root_y + dy, root_z) for dx, dy in _airfoil(root_chord, thickness)],
            [(tip_le + dx, tip_y + dy, half) for dx, dy in _airfoil(tip_chord, tip_t)],
        ]
        verts, faces = _loft(rings)
        lower = lambda j: j >= len(AIRFOIL_STATIONS) - 1  # noqa: E731
        charts = smooth = None
        if self.skin:
            charts, side, U, V = self._loft_charts(rings, role)
            smooth = [j is not None for _, j in faces]
            self._spar_lines(side, U, V, _section_labels(AIRFOIL_STATIONS))
        self._emit(role, verts, faces, node, lower_role, lower_node, lower, charts, smooth)
        if mirror:
            mverts, mfaces = _mirror_z(verts, faces)
            self._emit(role, mverts, mfaces, node, lower_role, lower_node, lower,
                       None if charts is None else self._mirror_charts(charts), smooth)

    def fin(self, role, le_x, root_y, root_chord, tip_chord, height, sweep_deg=0.0, thickness=0.10,
            tip_thickness=None, center_z=0.0, node=None, stations=None, span_segments=1, controls=None):
        """A vertical tail surface standing on y = ``root_y`` in the plane z = ``center_z``.
        ``stations``, ``span_segments`` and ``controls`` are ``wing``'s, with each control's
        (h0, h1, hinge chord fraction, name) in height above the root."""
        tip_t = thickness if tip_thickness is None else tip_thickness
        _require(root_chord > 0 and tip_chord > 0 and height > 0,
                 f'fin: chords and height must be > 0, got {root_chord}, {tip_chord}, {height}')
        _require(0 < thickness < 0.3 and 0 < tip_t < 0.3, f'fin: thickness ratios must be in (0, 0.3), got {thickness}, {tip_t}')
        if stations is not None or span_segments != 1 or controls:
            def section(z):
                f = z / height
                chord = root_chord + (tip_chord - root_chord) * f
                thick = thickness * root_chord + (tip_t * tip_chord - thickness * root_chord) * f
                return chord, thick / chord, le_x - z * math.tan(math.radians(sweep_deg)), 0.0
            # Stand the panel up: (x, y, z) -> (x, z, -y) about the root, as the plain path does.
            self._lifting_detailed(role, section, 0.0, height, stations, span_segments, controls, node, None, None, False,
                                   lambda v: (v[0], root_y + v[2], center_z - v[1]))
            return
        tip_le = le_x - height * math.tan(math.radians(sweep_deg))
        rings = [[(le_x + dx, dy, 0.0) for dx, dy in _airfoil(root_chord, thickness)],
                 [(tip_le + dx, dy, height) for dx, dy in _airfoil(tip_chord, tip_t)]]
        verts, faces = _loft(rings)
        charts = smooth = None
        if self.skin:
            charts, side, U, V = self._loft_charts(rings, role)
            smooth = [j is not None for _, j in faces]
            self._spar_lines(side, U, V, _section_labels(AIRFOIL_STATIONS))
        # Stand the panel up: (x, y, z) -> (x, z, -y) is a rotation, so windings hold.
        verts = [(x, root_y + z, center_z - y) for x, y, z in verts]
        self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)

    def _lifting_detailed(self, role, section, z_from, z_to, stations, span_segments, controls, node, lower_role, lower_node, mirror, place):
        """A wing or fin panel as pieces between z_from and z_to: split at every control end; inside a
        control, a main piece cut CONTROL_GAP_M ahead of the hinge and a control piece from the hinge
        aft, inset CONTROL_GAP_M at its own spanwise ends. `section(z)` gives (chord, thickness ratio,
        leading-edge x, chord-line y) at z, the one-panel loft's own section, so pieces trace its surface.
        `place` maps a lofted vertex to the model frame (a rotation, so windings hold)."""
        stations = AIRFOIL_STATIONS if stations is None else tuple(stations)
        _require(stations[0] == 0.0 and stations[-1] == 1.0 and all(a < b for a, b in zip(stations, stations[1:])),
                 'stations must run 0 to 1, strictly increasing')
        _require(isinstance(span_segments, int) and span_segments >= 1, f'span_segments must be an integer >= 1, got {span_segments!r}')
        ctrls = []
        for z0, z1, hinge, name in controls or []:
            _require(z0 < z1 and 0.3 < hinge < 0.95, f'control ({z0}, {z1}, {hinge}): need z0 < z1 and a hinge in (0.3, 0.95)')
            _require(isinstance(name, str) and name, f'control ({z0}, {z1}, {hinge}): needs a node name, got {name!r}')
            if z1 > z_from and z0 < z_to:
                ctrls.append((max(z0, z_from), min(z1, z_to), hinge, z0 >= z_from, z1 <= z_to, name))
        cuts = sorted({z_from, z_to} | {c for a, b, *_rest in ctrls for c in (a, b)})
        for za, zb in zip(cuts, cuts[1:]):
            c = next((x for x in ctrls if x[0] <= za and zb <= x[1]), None)
            if c is None:
                self._lifting_piece(role, section, za, zb, 0.0, 1.0, stations, span_segments, node, lower_role, lower_node, mirror, place)
                continue
            _a, _b, hinge, own_start, own_end, name = c
            chord = min(section(za)[0], section(zb)[0])
            self._lifting_piece(role, section, za, zb, 0.0, hinge - CONTROL_GAP_M / chord, stations, span_segments, node, lower_role, lower_node, mirror, place)
            lo = za + CONTROL_GAP_M if own_start and za == _a else za
            hi = zb - CONTROL_GAP_M if own_end and zb == _b else zb
            # The control is its own part (C1). A lower-role underside goes in a child node, which the
            # build's collapse folds into the part, since a kit node carries one role.
            here, there = (name + 'R', name + 'L') if mirror else (name, None)
            low = (lambda n: n + '_lower') if lower_role else (lambda n: None)
            for n in (here, there):
                if n is not None and lower_role:
                    self._parents[n + '_lower'] = n
            line = []
            for z in (lo, hi):
                ch, _t, le, y = section(z)
                line.append(place((le - hinge * ch, y, z)))
            self._hinge(here, line)
            if there is not None:
                self._hinge(there, [(x, y, -z) for x, y, z in line])
            self._lifting_piece(role, section, lo, hi, hinge, 1.0, stations, span_segments, here, lower_role, low(here), mirror, place,
                                there, low(there) if there else None)

    def _hinge(self, node, points):
        """Adds a control piece's hinge-line ends to ``node``'s line; pieces of one control (split at a
        wing break) must share one straight line, or the part cannot turn about one axis."""
        line = self._hinges.setdefault(node, [])
        line.extend(points)
        a, b = _ends(line)
        d = [q - p for p, q in zip(a, b)]
        n = math.sqrt(sum(c * c for c in d))
        for p in line:
            v = [q - r for q, r in zip(p, a)]
            t = sum(vi * di for vi, di in zip(v, d)) / (n * n)
            off = math.sqrt(sum((vi - t * di) ** 2 for vi, di in zip(v, d)))
            _require(off < 1e-6, f'{node}: its pieces are {off:.3g} m off one hinge line')

    def _lifting_piece(self, role, section, za, zb, f0, f1, stations, span_segments, node, lower_role, lower_node, mirror, place,
                       mirror_node=None, mirror_lower_node=None):
        """One piece of a detailed panel: the section's part between chord fractions f0 and f1,
        lofted over span_segments spans from za to zb (and mirrored in z = 0 if asked, into
        ``mirror_node`` and ``mirror_lower_node`` when given)."""
        rings, labels = [], None
        for k in range(span_segments + 1):
            z = za + (zb - za) * k / span_segments
            chord, t, le, y = section(z)
            pts, labels = _airfoil_part(chord, t, f0, f1, stations)
            rings.append([place((le + dx, y + dy, z)) for dx, dy in pts])
        verts, faces = _loft(rings)
        uppers = sum(1 for _f, sfc in labels if sfc == 'u')
        first_lower = uppers - 1 if f1 == 1.0 else uppers
        lower = lambda j: j >= first_lower  # noqa: E731
        charts = smooth = None
        if self.skin:
            # _loft_charts measures the placed rings; `place` is a rotation, so the UVs are the unplaced ones'.
            charts, side, U, V = self._loft_charts(rings, role)
            smooth = [j is not None for _, j in faces]
            self._spar_lines(side, U, V, labels)
        self._emit(role, verts, faces, node, lower_role, lower_node if lower_role else None, lower if lower_role else None, charts, smooth)
        if mirror:
            mverts, mfaces = _mirror_z(verts, faces)
            m_node = node if mirror_node is None else mirror_node
            m_lower = lower_node if mirror_node is None else mirror_lower_node
            self._emit(role, mverts, mfaces, m_node, lower_role, m_lower if lower_role else None, lower if lower_role else None,
                       None if charts is None else self._mirror_charts(charts), smooth)

    def revolve(self, role, origin, direction, profile, segments=12, node=None):
        """A closed solid of revolution about the line through ``origin`` along ``direction``:
        ``profile`` is [(t, radius)], t strictly increasing meters along the axis, every radius
        > 0. Struts, wheels, spinners and turret domes."""
        _require(isinstance(segments, int) and segments >= 3, f'revolve: segments must be an integer >= 3, got {segments!r}')
        _require(len(profile) >= 2, f'revolve: need at least 2 profile points, got {len(profile)}')
        d = _unit(direction)
        ts = [float(t) for t, _ in profile]
        rs = [float(r) for _, r in profile]
        _require(all(r > 0 for r in rs), f'revolve: every radius must be > 0, got {rs}')
        _require(all(ts[i] < ts[i + 1] for i in range(len(ts) - 1)), 'revolve: profile t values must be strictly increasing')
        helper = (0.0, 1.0, 0.0) if abs(d[1]) < 0.9 else (1.0, 0.0, 0.0)
        e1 = _unit(_cross(d, helper))
        e2 = _cross(d, e1)
        ox, oy, oz = origin
        rings = []
        for t, r in zip(ts, rs):
            cx, cy, cz = ox + d[0] * t, oy + d[1] * t, oz + d[2] * t
            ring = []
            for j in range(segments):
                th = 2 * math.pi * j / segments
                c, s = math.cos(th), math.sin(th)
                ring.append((cx + r * (c * e1[0] + s * e2[0]), cy + r * (c * e1[1] + s * e2[1]), cz + r * (c * e1[2] + s * e2[2])))
            rings.append(ring)
        verts, faces = _loft(rings)
        charts = smooth = None
        if self.skin:
            charts, _side, _U, _V = self._loft_charts(rings, role)
            smooth = [j is not None for _, j in faces]
        self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)

    def propeller(self, role, hub, diameter, blades, chord, spinner_radius, spinner_length, pitch_deg=25.0, node='Prop', blade_sections=None):
        """A propeller on an axis along +x through ``hub``: flat blades, pitched ``pitch_deg``,
        from inside the spinner out to diameter/2 (tips tapered to 35% chord, so the tip corners
        stay within 0.1% of the radius), and a spinner ahead of the hub. One node, so the entry
        pivots it at the hub about +x. Exactly N-fold symmetric: the spinner's 24 segments divide
        by 2, 3, 4 and 6.

        ``blade_sections`` (DP0, opt-in) replaces the flat blades with lofted, twisted ones: a
        list of (radius fraction, chord scale, pitch deg) from root to tip, each a 10% section
        pitched about its quarter chord (``pitch_deg`` is then unused)."""
        _require(isinstance(blades, int) and 2 <= blades <= 6, f'propeller: blades must be an integer from 2 to 6, got {blades!r}')
        radius = diameter / 2
        _require(chord > 0 and spinner_length > 0 and 0 < spinner_radius < radius,
                 f'propeller: need chord and spinner length > 0 and 0 < spinner radius < diameter/2, got chord {chord}, spinner {spinner_radius} x {spinner_length}, diameter {diameter}')
        hx, hy, hz = hub
        phi = math.radians(pitch_deg)
        thick = 0.12 * chord
        root_r = 0.8 * spinner_radius
        box_faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
        if blade_sections is not None:
            _require(len(blade_sections) >= 2 and all(0 < a[0] < b[0] <= 1 for a, b in zip(blade_sections, blade_sections[1:])),
                     'propeller: blade_sections need >= 2 entries with radius fractions strictly increasing in (0, 1]')
            for i in range(blades):
                a = 2 * math.pi * i / blades
                e_r = (0.0, math.cos(a), math.sin(a))
                t = _cross((1.0, 0.0, 0.0), e_r)  # the blade's direction of travel
                rings = []
                for rf, scale, pitch in blade_sections:
                    ph = math.radians(pitch)
                    fwd = (math.sin(ph), math.cos(ph) * t[1], math.cos(ph) * t[2])  # toward the leading edge
                    up = _cross(e_r, fwd)
                    c = chord * scale
                    # wing-local (x toward the leading edge, y up, z span) -> (fwd, up, e_r): a rotation,
                    # since fwd x up = fwd x (e_r x fwd) = e_r, so the airfoil's outward winding survives.
                    rings.append([tuple(hub[k] + rf * radius * e_r[k] + (dx + 0.25 * c) * fwd[k] + dy * up[k] for k in range(3))
                                  for dx, dy in _airfoil(c, 0.10)])
                verts, faces = _loft(rings)
                charts = smooth = None
                if self.skin:
                    charts, _s, _U, _V = self._loft_charts(rings, role)
                    smooth = [j is not None for _, j in faces]
                self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)
        else:
            for i in range(blades):
                a = 2 * math.pi * i / blades
                ca, sa = math.cos(a), math.sin(a)
                verts = []
                for z_sign in (-1, 1):
                    for x_sign, r in ((-1, root_r), (1, root_r), (1, radius), (-1, radius)):
                        half_c = (chord if r == root_r else 0.35 * chord) / 2
                        lx, lz = x_sign * thick / 2, z_sign * half_c
                        px = lx * math.cos(phi) + lz * math.sin(phi)
                        pz = -lx * math.sin(phi) + lz * math.cos(phi)
                        verts.append((hx + px, hy + r * ca - pz * sa, hz + r * sa + pz * ca))
                self._part(role, verts, box_faces, node)
        self.revolve(role, (hx - 0.25 * spinner_length, hy, hz), (1.0, 0.0, 0.0),
                     [(0.0, spinner_radius), (0.35 * spinner_length, 0.97 * spinner_radius),
                      (0.7 * spinner_length, 0.7 * spinner_radius), (spinner_length, 0.06 * spinner_radius)], 24, node)

    def canopy(self, glass_role, frame_role, stations, frames, bar=0.02, segments=16, subdivide=1, center_z=0.0, node=None, frame_node=None):
        """A glazed canopy lofted like `fuselage` from (x, half_w, half_h, center_y) stations, and a
        frame hoop at each x in `frames`: `bar` long, standing `bar` proud of the glazing's own
        (refined) section there. The hoops' role is the airframe's paint; the glazing's is its own."""
        _require(bar > 0 and frames, f'canopy: need bar > 0 and at least one frame, got {bar}, {frames}')
        self.fuselage(glass_role, stations, segments, center_z, node, subdivide=subdivide)
        vals = [(float(s[0]), float(s[1]), float(s[2]), float(s[3]), 2.2) for s in stations]
        if subdivide > 1:
            vals, _a = _refine(vals, subdivide)
        for x in frames:
            _require(vals[0][0] < x < vals[-1][0], f'canopy: frame at {x} is outside the canopy ({vals[0][0]}, {vals[-1][0]})')
            i = next(k for k in range(len(vals) - 1) if vals[k][0] <= x <= vals[k + 1][0])
            f = (x - vals[i][0]) / (vals[i + 1][0] - vals[i][0])
            hw, hh, cy = (vals[i][c] + (vals[i + 1][c] - vals[i][c]) * f for c in (1, 2, 3))
            self.fuselage(frame_role, [(x - bar / 2, hw + bar, hh + bar, cy), (x + bar / 2, hw + bar, hh + bar, cy)], segments, center_z, frame_node)

    def gear_leg(self, role, hinge, length, wheel_radius, wheel_width, strut_radius=None, node=None):
        """A landing-gear leg hanging straight down from ``hinge``: a strut to the axle and a
        wheel whose lowest point is exactly ``length`` below the hinge. One node, so the entry
        pivots it at the hinge."""
        _require(wheel_radius > 0 and wheel_width > 0 and length > 2 * wheel_radius,
                 f'gear_leg: need wheel radius and width > 0 and length > 2 x wheel radius, got {length}, {wheel_radius}, {wheel_width}')
        strut = 0.18 * wheel_radius if strut_radius is None else strut_radius
        _require(strut > 0, f'gear_leg: strut radius must be > 0, got {strut}')
        hx, hy, hz = hinge
        axle_y = hy - length + wheel_radius
        self.revolve(role, (hx, hy, hz), (0.0, -1.0, 0.0), [(0.0, strut), (hy - axle_y, strut)], 8, node)
        self.revolve(role, (hx, axle_y, hz - wheel_width / 2), (0.0, 0.0, 1.0), [(0.0, wheel_radius), (wheel_width, wheel_radius)], 16, node)

    def machine_gun(self, role, breech, direction, length, scale=1.0, node=None):
        """One flexible machine gun from its breech along ``direction``, ``length`` long, styled on the
        B-17 download's .50s: a cooling jacket over the rear 40% with two raised rings, a thin barrel and a
        muzzle booster. ``scale`` sizes the radii (1 a .50 / 20 mm, about 0.75 a 7.7 mm)."""
        _require(length > 0 and scale > 0, f'machine_gun: length and scale must be > 0, got {length}, {scale}')
        j, ring, bar, muz = 0.030 * scale, 0.037 * scale, 0.014 * scale, 0.022 * scale
        prof = [(0.0, j), (0.10, j), (0.101, ring), (0.13, ring), (0.131, j), (0.25, j), (0.251, ring), (0.28, ring),
                (0.281, j), (0.40, j), (0.401, bar), (0.88, bar), (0.881, muz), (1.0, muz)]
        self.revolve(role, breech, direction, [(t * length, r) for t, r in prof], 8, node)

    def flex_gun(self, role, index, socket, direction, length, scale=1.0, barrels=1, spacing=0.12, mount_r=0.09, node=None):
        """A flexible nose, cheek or tail gun on a ball socket at ``socket``, pointing ``direction``: the
        socket in node ``TurretN`` (it traverses about the vertical through the socket) and the gun(s) in
        ``TurretNGuns`` (elevating on a horizontal trunnion through it, a positive turn raising the muzzle).
        The breech sits 20% of ``length`` inside the socket. Both hinges are written, so an entry keeps the
        two nodes without pivots."""
        _require(isinstance(index, int) and index > 0, f'flex_gun: index must be a positive integer, got {index!r}')
        _require(isinstance(barrels, int) and barrels in (1, 2), f'flex_gun: barrels must be 1 or 2, got {barrels!r}')
        d = _unit(direction)
        _require(math.hypot(d[0], d[2]) > 0.5, f'flex_gun: direction must be within 60 deg of level, got {direction}')
        key = node or f'Turret{index}'
        guns = key + 'Guns'
        sx, sy, sz = socket
        self.revolve(role, (sx - mount_r * d[0], sy - mount_r * d[1], sz - mount_r * d[2]), d,
                     [(0.0, 0.35 * mount_r), (0.4 * mount_r, 0.9 * mount_r), (mount_r, mount_r), (1.6 * mount_r, 0.9 * mount_r), (2.0 * mount_r, 0.35 * mount_r)], 12, key)
        # The trunnion: up x heading flipped, (-dz, 0, dx), so a positive turn lifts the muzzle (as gun_turret's).
        ax = _unit((-d[2], 0.0, d[0]))
        for b in range(barrels):
            o = (b - (barrels - 1) / 2) * spacing
            br = (sx + o * ax[0] - 0.2 * length * d[0], sy - 0.2 * length * d[1], sz + o * ax[2] - 0.2 * length * d[2])
            self.machine_gun(role, br, d, length, scale, guns)
        self._fixed_hinges[key] = {'point': [round(c, 6) for c in socket], 'axis': [0.0, 1.0, 0.0]}
        self._fixed_hinges[guns] = {'point': [round(c, 6) for c in socket], 'axis': [round(c, 9) for c in ax]}

    def gun_turret(self, role, index, center, radius, height, up=1, barrels=2, barrel_length=1.2, facing=1, node=None, scale=1.0, gun_role=None):
        """A turret on the fuselage skin at ``center``: a dome ``height`` tall toward ``up`` (+1
        dorsal, -1 ventral) and ``barrels`` guns pointing ``facing`` along x, all in node
        ``TurretN`` for H3 (numbered nose to tail by the caller). The barrels are their own part,
        ``TurretNGuns`` (in ``gun_role``, default ``role``), hinged on a horizontal trunnion so a positive turn
        raises the muzzle."""
        _require(isinstance(index, int) and index > 0, f'gun_turret: index must be a positive integer, got {index!r}')
        _require(up in (-1, 1) and facing in (-1, 1), f'gun_turret: up and facing must be -1 or +1, got {up}, {facing}')
        _require(isinstance(barrels, int) and barrels > 0, f'gun_turret: barrels must be a positive integer, got {barrels!r}')
        _require(radius > 0 and height > 0 and barrel_length > 0, 'gun_turret: radius, height and barrel length must be > 0')
        key = node or f'Turret{index}'
        cx, cy, cz = center
        self.revolve(role, center, (0.0, float(up), 0.0), [(0.0, radius), (0.55 * height, 0.85 * radius), (height, 0.25 * radius)], 12, key)
        guns = key + 'Guns'
        gy = cy + up * 0.45 * height
        for b in range(barrels):
            zz = cz + (b - (barrels - 1) / 2) * radius * 0.35
            self.machine_gun(gun_role or role, (cx + facing * 0.6 * radius, gy, zz), (float(facing), 0.0, 0.0), barrel_length, scale, guns)
        # Barrels along facing * x: a turn about facing * z lifts them (z x x = y).
        self._fixed_hinges[guns] = {'point': [round(c, 6) for c in (cx, gy, cz)], 'axis': [0.0, 0.0, float(facing)]}

    # --- Building parts (R4). Every one is wound outward: kitBuildings.test.ts checks it. ---

    def frustum(self, role, base, lower, upper, height, node=None):
        """A closed truncated rectangular pyramid standing on base (x, y, z): `lower` (x size,
        z size) at y, `upper` at y + height, both centered. A mound, a berm or a blast wall;
        upper == lower is a box."""
        _require(height > 0 and min(*lower, *upper) > 0, f'frustum: height and every width must be > 0, got {height}, {lower}, {upper}')
        _require(upper[0] <= lower[0] and upper[1] <= lower[1], f'frustum: upper {upper} must not exceed lower {lower}')
        x, y, z = base
        lx, lz, ux, uz = lower[0] / 2, lower[1] / 2, upper[0] / 2, upper[1] / 2
        v = [(x - lx, y, z - lz), (x + lx, y, z - lz), (x + lx, y, z + lz), (x - lx, y, z + lz),
             (x - ux, y + height, z - uz), (x + ux, y + height, z - uz),
             (x + ux, y + height, z + uz), (x - ux, y + height, z + uz)]
        f = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        self._part(role, v, f, node)

    def gable_roof(self, role, base, width, length, rise, overhang=0.0, node=None):
        """A closed triangular prism: eaves at base y, the ridge `rise` above it along z, over a
        width (x) by length (z) plan grown by `overhang` on every side."""
        _require(width > 0 and length > 0 and rise > 0 and overhang >= 0,
                 f'gable_roof: width, length and rise must be > 0 and overhang >= 0, got {width}, {length}, {rise}, {overhang}')
        x, y, z = base
        hw, hl = width / 2 + overhang, length / 2 + overhang
        v = [(x - hw, y, z - hl), (x + hw, y, z - hl), (x, y + rise, z - hl),
             (x - hw, y, z + hl), (x + hw, y, z + hl), (x, y + rise, z + hl)]
        f = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
        self._part(role, v, f, node)

    def tank(self, role, base, radius, height, roof_rise=0.0, segments=24, node=None):
        """A vertical cylinder standing on base (x, y, z), closed below, with a cone roof rising
        `roof_rise` to its apex, or a flat top at 0. A fuel tank, a pedestal, a floor disc.
        A multiple of 4 segments puts vertices on both axes, so the extents are exact."""
        _require(radius > 0 and height > 0 and roof_rise >= 0, f'tank: radius and height must be > 0 and roof_rise >= 0, got {radius}, {height}, {roof_rise}')
        _require(isinstance(segments, int) and segments >= 3, f'tank: segments must be an integer >= 3, got {segments}')
        x, y, z = base
        n = segments
        ring = lambda yy: [(x + math.cos(2 * math.pi * i / n) * radius, yy, z + math.sin(2 * math.pi * i / n) * radius) for i in range(n)]
        v = ring(y) + ring(y + height)
        f = [tuple(range(n))]                                    # floor, faces -y
        for i in range(n):
            j = (i + 1) % n
            f.append((i, n + i, n + j, j))                       # wall, faces out
        if roof_rise == 0:
            f.append(tuple(reversed(range(n, 2 * n))))           # flat top, faces +y
        else:
            v.append((x, y + height + roof_rise, z))
            for i in range(n):
                f.append((n + i, 2 * n, n + (i + 1) % n))        # cone, faces out and up
        self._part(role, v, f, node)

    def rounded_box(self, role, base, length, width, height, radius, segments=4, node=None):
        """(M1c) A closed upright prism standing on base (x, y, z): a `length` (x) by `width` (z) plan
        whose corners are rounded to `radius` in `segments` flat steps each. A deckhouse."""
        _require(height > 0 and 0 < radius < min(length, width) / 2, f'rounded_box: need height > 0 and 0 < radius < half the plan, got {height}, {radius}')
        x, y, z = base
        hl, hw = length / 2 - radius, width / 2 - radius
        plan = []
        for cx, cz, a0 in ((hl, hw, 0.0), (-hl, hw, 90.0), (-hl, -hw, 180.0), (hl, -hw, 270.0)):
            for k in range(segments + 1):
                a = math.radians(a0 + 90.0 * k / segments)
                plan.append((x + cx + radius * math.cos(a), z + cz + radius * math.sin(a)))
        n = len(plan)
        v = [(px, y, pz) for px, pz in plan] + [(px, y + height, pz) for px, pz in plan]
        f = [tuple(range(n))] + [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)] + [tuple(reversed(range(n, 2 * n)))]
        self._part(role, v, f, node)

    def sandbag_ring(self, role, center, inner_radius, thickness, height, batter=0.0, segments=16, node=None):
        """A closed annular parapet on center (x, y, z): `thickness` across at its foot, its outer
        face leaning in by `batter` at the top. A gun pit's sandbags or a concrete emplacement."""
        _require(inner_radius > 0 and thickness > 0 and height > 0,
                 f'sandbag_ring: inner_radius, thickness and height must be > 0, got {inner_radius}, {thickness}, {height}')
        _require(0 <= batter < thickness, f'sandbag_ring: batter {batter:g} must be >= 0 and < thickness {thickness:g}')
        _require(isinstance(segments, int) and segments >= 3, f'sandbag_ring: segments must be an integer >= 3, got {segments}')
        x, y, z = center
        n = segments
        ring = lambda r, yy: [(x + math.cos(2 * math.pi * i / n) * r, yy, z + math.sin(2 * math.pi * i / n) * r) for i in range(n)]
        ro, rt = inner_radius + thickness, inner_radius + thickness - batter
        v = ring(inner_radius, y) + ring(ro, y) + ring(rt, y + height) + ring(inner_radius, y + height)
        A, B, C, D = 0, n, 2 * n, 3 * n   # inner foot, outer foot, outer top, inner top
        f = []
        for i in range(n):
            j = (i + 1) % n
            f.append((B + i, C + i, C + j, B + j))   # outer face, away from the axis
            f.append((D + i, D + j, C + j, C + i))   # top, faces +y
            f.append((A + i, A + j, D + j, D + i))   # inner face, toward the axis
            f.append((A + i, B + i, B + j, A + j))   # foot, faces -y
        self._part(role, v, f, node)

    def strut(self, role, p0, p1, radius, end_radius=None, sides=4, node=None):
        """A closed prism from p0 to p1 with `sides` faces, circumradius `radius` at p0 and
        `end_radius` (default: the same) at p1. A brace, a pipe, a mast member, a gun tube."""
        end_radius = radius if end_radius is None else end_radius
        _require(radius > 0 and end_radius > 0, f'strut: radii must be > 0, got {radius}, {end_radius}')
        _require(isinstance(sides, int) and sides >= 3, f'strut: sides must be an integer >= 3, got {sides}')
        _require(any(abs(b - a) > 1e-9 for a, b in zip(p0, p1)), f'strut: p0 and p1 must differ, got {p0}, {p1}')
        d = _unit(tuple(b - a for a, b in zip(p0, p1)))
        helper = (1.0, 0.0, 0.0) if abs(d[1]) > 0.9 else (0.0, 1.0, 0.0)
        u = _unit(_cross(helper, d))
        w = _cross(d, u)   # (u, w, d) right-handed: rings run counterclockwise about d
        v = []
        for p, r in ((p0, radius), (p1, end_radius)):
            for k in range(sides):
                c, s = math.cos(2 * math.pi * k / sides) * r, math.sin(2 * math.pi * k / sides) * r
                v.append(tuple(p[i] + c * u[i] + s * w[i] for i in range(3)))
        n = sides
        f = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]   # p0 cap faces -d, p1 cap +d
        for k in range(n):
            j = (k + 1) % n
            f.append((k, j, n + j, n + k))
        self._part(role, v, f, node)

    def gun_barrel(self, role, breech, azimuth_deg, elevation_deg, length, radius, muzzle_radius=None, sides=8, node=None):
        """A gun tube from its breech: azimuth 0 is +x, positive turns toward -z (counterclockwise
        seen from above); elevation lifts it. With sides a multiple of 4 and elevation <= 64 deg,
        its top is exactly muzzle y + muzzle radius x cos(elevation)."""
        _require(-5 <= elevation_deg <= 85, f'gun_barrel: elevation must be in [-5, 85] degrees, got {elevation_deg:g}')
        _require(length > 0, f'gun_barrel: length must be > 0, got {length}')
        az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
        d = (math.cos(el) * math.cos(az), math.sin(el), -math.cos(el) * math.sin(az))
        muzzle = tuple(b + length * c for b, c in zip(breech, d))
        self.strut(role, breech, muzzle, radius, radius if muzzle_radius is None else muzzle_radius, sides, node)

    def lattice_mast(self, role, base, base_width, top_width, height, panels, member, node=None):
        """A square, tapered lattice tower on base (x, y, z): four corner legs, a horizontal ring at
        the foot, at every panel joint and at the top, and an X of braces on each face of each panel.
        Every member is a square strut `member` across its flats."""
        _require(0 < top_width <= base_width, f'lattice_mast: top_width must be > 0 and <= base_width, got {top_width}, {base_width}')
        _require(height > 0, f'lattice_mast: height must be > 0, got {height}')
        _require(isinstance(panels, int) and panels >= 1, f'lattice_mast: panels must be an integer >= 1, got {panels}')
        _require(0 < member < top_width / 2, f'lattice_mast: member must be > 0 and < top_width / 2, got {member}')
        x, y, z = base
        r = member / math.sqrt(2)   # a 4-sided strut's circumradius for `member` across the flats

        def corner(k, level):
            t = level / panels
            h = (base_width + (top_width - base_width) * t) / 2
            sx, sz = ((-1, -1), (1, -1), (1, 1), (-1, 1))[k]
            return (x + sx * h, y + height * t, z + sz * h)

        for k in range(4):
            self.strut(role, corner(k, 0), corner(k, panels), r, r, 4, node)
        for level in range(panels + 1):
            for k in range(4):
                self.strut(role, corner(k, level), corner((k + 1) % 4, level), r, r, 4, node)
        for level in range(panels):
            for k in range(4):
                j = (k + 1) % 4
                self.strut(role, corner(k, level), corner(j, level + 1), r, r, 4, node)
                self.strut(role, corner(j, level), corner(k, level + 1), r, r, 4, node)

    # --- Ship parts (DP2) ---

    def hull_lines(self, role, stations, section=HULL_SECTION, node='Hull', deck_role=None, deck_node=None,
                   below_role=None, below_node=None, subdivide=1):
        """(DP2) A closed hull lofted through `section` at every station, wound outward.

        Each station is (x, half_beam, draft, deck_y, deck_half_beam): the waterline half-beam, the
        keel's depth below y = 0, the deck edge's height (freeboard plus sheer) and its half-beam
        (wider than the waterline is flare, narrower is tumblehome). Stations run stern to bow, x
        strictly increasing; both ends are capped, so an end is a small nonzero section.
        `section` is the starboard half from the keel up as (f, h): with h <= 0 a point is at
        z = f x half_beam, y = h x draft; with h > 0 at z = f x (half_beam + (deck_half_beam -
        half_beam) x h), y = h x deck_y. It starts at the keel (0, -1), passes the waterline (1, 0)
        and ends at the deck edge (1, 1). The deck is the ring edge between the two deck-edge
        points; with `deck_role` it goes to `deck_node`. With `below_role`, faces whose ring edge
        has both ends below the waterline go to `below_node`, and so does each end cap's part below
        the waterline chord (the caps are cut there, whatever the roles). `subdivide` k > 1 lofts k - 1
        Catmull-Rom stations between each authored pair. Skinned, the hull is one loft chart
        whose v is true arc length (texel density holds to the ends)."""
        _require(isinstance(subdivide, int) and subdivide >= 1, f'hull_lines: subdivide must be an integer >= 1, got {subdivide!r}')
        _require(len(stations) >= 3, f'hull_lines: need at least 3 stations, got {len(stations)}')
        S = [(float(f), float(h)) for f, h in section]
        _require(len(S) >= 3 and S[0] == (0.0, -1.0) and S[-1] == (1.0, 1.0) and (1.0, 0.0) in S,
                 'hull_lines: section must start at the keel (0, -1), pass the waterline (1, 0) and end at the deck edge (1, 1)')
        _require(all(S[i][1] < S[i + 1][1] for i in range(len(S) - 1)), 'hull_lines: section heights must rise strictly from the keel')
        vals = []
        for i, st in enumerate(stations):
            _require(len(st) == 5, f'hull_lines: station {i} needs (x, half_beam, draft, deck_y, deck_half_beam), got {len(st)} values')
            v = tuple(float(c) for c in st)
            _require(all(math.isfinite(c) for c in v) and all(c > 0 for c in v[1:]),
                     f'hull_lines: station {i} half-beam, draft, deck height and deck half-beam must be finite and > 0')
            vals.append(v)
        _require(all(vals[i][0] < vals[i + 1][0] for i in range(len(vals) - 1)), 'hull_lines: station x values must be strictly increasing')
        if subdivide > 1:
            vals = _refine_hull(vals, subdivide)
        self._hull = vals
        n = len(S)
        rings = []
        for x, hb, draft, deck_y, dhb in vals:
            def pt(f, h, side):
                if h <= 0:
                    return (x, h * draft, side * f * hb)
                return (x, h * deck_y, side * f * (hb + (dhb - hb) * h))
            # Counterclockwise seen from beyond the bow looking aft (_loft's rule): the viewer's right is
            # -z, so the ring climbs the port side, crosses the deck and comes down starboard.
            rings.append([pt(f, h, -1.0) for f, h in S] + [pt(f, h, 1.0) for f, h in reversed(S[1:])])
        count = 2 * n - 1
        height = [S[j][1] if j < n else S[2 * n - 1 - j][1] for j in range(count)]
        verts, faces = _loft(rings)
        charts = smooth = None
        if self.skin:
            charts, _side, _U, _V = self._loft_charts(rings, role, true_arc=True)
        # Each end cap is cut along the waterline chord into the part below it and the part above,
        # so with `below_role` no cap triangle wholly below the waterline stays `role`. Both halves
        # keep the whole cap's planar chart (they partition it, so they never overlap).
        w = S.index((1.0, 0.0))
        cut_faces, cut_charts = [], []
        for c in (-2, -1):
            cap = faces[c][0]
            pos = {v: i for i, v in enumerate(cap)}
            keel = min(cap)   # the ring's first point; its waterline points are w and count - w after it
            ip, isr = pos[keel + w], pos[keel + count - w]

            def arc(a, b, cap=cap):   # the cap's vertices from position a to b, in its own winding
                return tuple(cap[(a + i) % count] for i in range((b - a) % count + 1))
            one, two = arc(ip, isr), arc(isr, ip)
            lo, hi = (one, two) if keel in one else (two, one)
            for part, j in ((lo, 'below'), (hi, None)):
                cut_faces.append((part, j))
                if charts is not None:
                    key, uvs = charts[len(faces) + c]
                    uv = dict(zip(cap, uvs))
                    cut_charts.append((key, tuple(uv[v] for v in part)))
        faces = faces[:-2] + cut_faces
        if charts is not None:
            charts = charts[:-2] + cut_charts
            smooth = [j is not None and j != 'below' for _, j in faces]

        def group(j):
            if j is None:
                return role, node
            if j == 'below':
                return (below_role, below_node) if below_role is not None else (role, node)
            if deck_role is not None and j == n - 1:
                return deck_role, deck_node
            if below_role is not None and height[j] < 0 and height[(j + 1) % count] < 0:
                return below_role, below_node
            return role, node

        order, ids = [], {}
        for i, (_f, j) in enumerate(faces):
            g = group(j)
            if g not in ids:
                ids[g] = []
                order.append(g)
            ids[g].append(i)
        for r, nd in order:
            sel = ids[(r, nd)]
            used = sorted({v for i in sel for v in faces[i][0]})
            index = {old: new for new, old in enumerate(used)}
            self._part(r, [verts[v] for v in used], [tuple(index[v] for v in faces[i][0]) for i in sel], nd,
                       None if charts is None else [charts[i] for i in sel], False if smooth is None else [smooth[i] for i in sel])

    def hull_at(self, x):
        """(DP2) (half_beam, draft, deck_y, deck_half_beam) of the last hull_lines hull at x: linear
        between its refined stations, which is exactly its deck face. A fitting stands on deck_y
        less 0.02 m (EMBED), and keeps inside deck_half_beam."""
        _require(self._hull is not None, 'hull_at: call hull_lines first')
        st = self._hull
        _require(st[0][0] <= x <= st[-1][0], f'hull_at: x {x} is off the hull ({st[0][0]}, {st[-1][0]})')
        for a, b in zip(st, st[1:]):
            if a[0] <= x <= b[0]:
                t = (x - a[0]) / (b[0] - a[0])
                return tuple(a[c] + (b[c] - a[c]) * t for c in range(1, 5))

    def naval_turret(self, role, index, center, facing, body, barrels, barrel_length, barrel_radius,
                     elevation_deg=0.0, bag_length=0.0, node=None):
        """(DP2) A gunhouse and its guns in node TurretN, numbered bow to stern by the caller (H3):
        a frustum `body` = (length, width, height) on `center`, its roof 0.8 x 0.85 of its floor;
        `barrels` tubes pointing `facing` (+1 bow, -1 stern) along x, spread evenly across the width
        at 0.45 of the height, each breech 0.2 m inside the sloped face, the muzzle 0.8 x the root.
        With `bag_length` > 0 each tube leaves the face through a blast bag 2.2 x its radius
        (ESTIMATE). Every piece is wound outward."""
        _require(isinstance(index, int) and index > 0, f'naval_turret: index must be a positive integer, got {index!r}')
        _require(facing in (-1, 1), f'naval_turret: facing must be -1 or +1, got {facing}')
        _require(isinstance(barrels, int) and barrels > 0, f'naval_turret: barrels must be a positive integer, got {barrels!r}')
        length, width, height = body
        _require(min(length, width, height, barrel_length, barrel_radius) > 0 and bag_length >= 0,
                 'naval_turret: body, barrel length and radius must be > 0 and bag_length >= 0')
        key = node or f'Turret{index}'
        x, y, z = center
        self.frustum(role, (x, y, z), (length, width), (0.8 * length, 0.85 * width), height, key)
        gy = y + 0.45 * height
        face = 0.5 * length * (1 - 0.2 * 0.45)   # the sloped face's distance from center at gun height
        az = 0.0 if facing == 1 else 180.0
        spacing = width / (barrels + 1)
        for b in range(barrels):
            zz = z + (b - (barrels - 1) / 2) * spacing
            self.gun_barrel(role, (x + facing * (face - 0.2), gy, zz), az, elevation_deg, barrel_length + 0.2,
                            barrel_radius, 0.8 * barrel_radius, 16, key)
            if bag_length > 0:
                self.gun_barrel(role, (x + facing * (face - 0.05), gy, zz), az, elevation_deg, bag_length + 0.05,
                                2.2 * barrel_radius, 1.4 * barrel_radius, 16, key)

    def _pack(self):
        """(meters per pixel, chart boxes, placements): the smallest uniform texel size, in 3%
        steps from the area estimate, at which every chart shelf-packs into the atlas."""
        box = {}
        for key in sorted(self._nodes):
            for ck, uvs in self._nodes[key][3]:
                b = box.setdefault(ck, [math.inf, math.inf, -math.inf, -math.inf])
                for u, v in uvs:
                    b[0], b[1], b[2], b[3] = min(b[0], u), min(b[1], v), max(b[2], u), max(b[3], v)
        sizes = {ck: (b[2] - b[0], b[3] - b[1]) for ck, b in box.items()}
        area = sum(max(w, 1e-3) * max(h, 1e-3) for w, h in sizes.values())
        mpp = math.sqrt(area / (0.6 * self.skin * self.skin))
        for _ in range(400):
            placed = _shelf_pack(sizes, mpp, self.skin, SKIN_PADDING_PX)
            if placed is not None:
                return mpp, box, placed
            mpp *= 1.03
        raise ValueError(f'{self.name}: {len(sizes)} charts do not pack into {self.skin} px')

    def export(self, path):
        unread = sorted(_given - _read)
        if unread:
            raise ValueError(f'unknown argument --{unread[0]}; this model reads {sorted(_read) or "none"}')
        packed = self._pack() if self.skin else None
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        root = bpy.data.objects.new(self.name, None)
        scene.collection.objects.link(root)
        for key in sorted(self._nodes):
            role, verts, faces, charts, smooth = self._nodes[key]
            me = bpy.data.meshes.new(key)
            me.from_pydata([(vx, -vz, vy) for vx, vy, vz in verts], [], faces)
            me.validate()
            me.update()
            if packed is not None:
                self._write_uvs(me, key, faces, charts, smooth, packed)
            me.materials.append(_material(role))
            ob = bpy.data.objects.new(key, me)
            scene.collection.objects.link(ob)
            ob.parent = root
        for child, parent in self._parents.items():
            _require(child in self._nodes and parent in self._nodes, f'{child} hangs under {parent}, but one of them has no faces')
            bpy.data.objects[child].parent = bpy.data.objects[parent]
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', export_yup=True, export_apply=True,
            export_animations=False, export_cameras=False, export_lights=False,
            export_extras=False, export_materials='EXPORT', use_selection=False,
            export_texcoords=packed is not None, export_normals=True,
        )
        if packed is not None:
            self._write_sidecar(path, packed)
        if self._details:
            with open(path[:-4] + '.detail.json', 'w', encoding='utf-8') as fh:
                json.dump({'version': 1, 'model': self.name, 'details': self._details}, fh, sort_keys=True, separators=(',', ':'))
            if os.environ.get('WW2_BAKE_DIR'):
                import bake  # noqa: PLC0415, beside this file; only a bake run (tools/models/bake.ts on Ryzen) needs Cycles
                bake.run(self._details, os.environ['WW2_BAKE_DIR'], self.skin)
        if self._hinges or self._fixed_hinges:
            # C1: each control's hinge, in the glTF source frame the entry's pivots use; the build
            # pivots every kept node named here that the entry gives no pivot of its own.
            def end(p):
                return [round(c, 6) for c in p]
            hinges = {}
            for node, line in sorted(self._hinges.items()):
                a, b = _ends(line)
                d = [q - p for p, q in zip(a, b)]
                n = math.sqrt(sum(c * c for c in d))
                d = [c / n for c in d]
                # One orientation for every hinge, so a positive turn about it raises the trailing edge
                # (it lies aft, -x: axis x -x = (0, -z, y)), or on a fin swings it to starboard (+z).
                if (d[2] > 0) if abs(d[2]) >= abs(d[1]) else (d[1] < 0):
                    d = [-c for c in d]
                hinges[node] = {'point': end(a), 'axis': [round(c, 9) for c in d]}
            hinges.update(self._fixed_hinges)
            with open(path[:-4] + '.hinges.json', 'w', encoding='utf-8') as fh:
                json.dump({'version': 1, 'model': self.name, 'hinges': hinges}, fh, sort_keys=True, separators=(',', ':'))

    def _write_uvs(self, me, key, faces, charts, smooth, packed):
        mpp, box, placed = packed
        w = self.skin
        _require(len(me.polygons) == len(faces), f'{key}: Blender dropped {len(faces) - len(me.polygons)} degenerate faces; fix the part')
        layer = me.uv_layers.new(name='UVMap')
        for poly, (ck, uvs), sm in zip(me.polygons, charts, smooth):
            _require(len(poly.loop_indices) == len(uvs), f'{key}: polygon {poly.index} has {len(poly.loop_indices)} corners in Blender but {len(uvs)} in its chart')
            x0, y0, _w, _h = placed[ck]
            u0, v0 = box[ck][0], box[ck][1]
            for li, (u, v) in zip(poly.loop_indices, uvs):
                layer.data[li].uv = ((x0 + (u - u0) / mpp) / w, 1.0 - (y0 + (v - v0) / mpp) / w)
        # In Blender 5.0.1 set_sharp_from_angle also marks every face smooth (measured 2026-09-28),
        # so the per-face flags go on after it: planar parts stay flat, lofts smooth up to SHARP_DEG.
        me.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
        for poly, sm in zip(me.polygons, smooth):
            poly.use_smooth = sm

    def _write_sidecar(self, path, packed):
        mpp, box, placed = packed
        _require(path.endswith('.glb'), f'export: a skinned model writes a .glb, got {path}')
        side = {
            'version': 1, 'model': self.name, 'atlasPx': self.skin, 'paddingPx': SKIN_PADDING_PX, 'metersPerPx': mpp,
            'roles': {r: list(PALETTE[r]) for r in sorted({e[0] for e in self._nodes.values()})},
            'patches': [{'id': k, 'tag': self._charts[k], 'rect': list(placed[k]), 'originM': [box[k][0], box[k][1]]} for k in sorted(placed)],
            'lines': [{'patch': k, 'axis': a, 'atM': at, 'fromM': lo, 'toM': hi, 'kind': kind} for k, a, at, lo, hi, kind in self._lines],
            'markings': self._markings,
        }
        if self._details:  # M1c: the patches a bake may paint: every chart that no other chart overlaps
            side['baked'] = sorted(k for k in placed if k not in self._shared_keys)
        with open(path[:-4] + '.skin.json', 'w', encoding='utf-8') as fh:
            json.dump(side, fh, sort_keys=True, separators=(',', ':'))
