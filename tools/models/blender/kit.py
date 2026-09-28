# tools/models/blender/kit.py
"""The Blender model kit (model-roster spec §4.2). Original work, AGPL-3.0-or-later.

Geometry is written in the glTF frame: +x forward, +y up, +z toward the viewer, meters.
The kit maps it to Blender's Z-up frame, and the exporter's +Y-up conversion maps it
back, so a script never thinks in Blender axes. (x, y, z) -> Blender (x, -z, y) is a
rotation (det +1), so face winding survives both ways.

Determinism: no randomness; parts accumulate in plain lists and become Blender
objects only at export, one per node, created in sorted name order. The building
parts (R4) are wound outward and checked by `tests/tools/models/blender/kitBuildings.test.ts`;
R2's `cylinder`, `tapered_box` and `turret` wind inward (open item, R4 handoff) and
no building calls them.
"""
import contextlib
import json
import math
import sys

import bpy

# sRGB 0-1, the base (unweathered) colors of src/render/scene/buildings.ts, so a
# kit building matches what the game draws today.
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

# Skins (DP0, model-detail-pass spec §4). Atlas sizes a script may ask for: 1024 for aircraft
# and ships, 512 for buildings. Padding keeps mipmaps from bleeding one patch into the next.
SKIN_SIZES = (512, 1024, 2048)
SKIN_PADDING_PX = 4
# Edges sharper than this stay hard on a smooth-shaded skinned model (trailing edges, caps).
SHARP_DEG = 50.0
# Spar lines drawn on every wing and fin surface, as chord fractions (ESTIMATE: period practice).
SPARS = (0.2, 0.65)


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


def _mirror_z(verts, faces):
    """The reflection in z = 0, windings reversed so faces still point outward."""
    return [(x, y, -z) for x, y, z in verts], [(tuple(reversed(f)), j) for f, j in faces]


def _airfoil(chord, thickness):
    """(dx, dy) around a closed symmetric section: leading edge at 0, chord toward -x, upper
    surface first, so counterclockwise seen from +z. NACA 4-digit thickness with the closed
    trailing-edge coefficient: the leading and trailing edges are single points."""
    def half(f):
        return 5 * thickness * chord * (0.2969 * math.sqrt(f) - 0.1260 * f - 0.3516 * f ** 2 + 0.2843 * f ** 3 - 0.1036 * f ** 4)
    upper = [(-f * chord, half(f)) for f in AIRFOIL_STATIONS]
    lower = [(-f * chord, -half(f)) for f in reversed(AIRFOIL_STATIONS[1:-1])]
    return upper + lower


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

    @contextlib.contextmanager
    def tagged(self, tag):
        """Every chart made inside is tagged `tag`, so a marking can name the parts it paints."""
        _require(isinstance(tag, str) and tag, f'tagged: tag must be a nonempty string, got {tag!r}')
        prev, self._tag = self._tag, tag
        try:
            yield
        finally:
            self._tag = prev

    def marking(self, kind, **fields):
        """A marking for the skin stage, in model coordinates (tools/models/skin/sidecar.ts validates it)."""
        _require(kind in ('disc', 'polygon', 'slab', 'grid'), f'marking: unknown kind {kind!r}')
        self._markings.append({'kind': kind, **{k: list(v) if isinstance(v, tuple) else v for k, v in fields.items()}})

    def _new_chart(self):
        key = len(self._charts)
        self._charts[key] = self._tag
        return key

    def _line(self, chart, axis, at, lo, hi, kind='panel'):
        if self.skin:
            self._lines.append((chart, axis, at, lo, hi, kind))

    def _planar_charts(self, verts, faces):
        """One chart per face, projected on its own plane: u along its first edge, v = n x u."""
        out = []
        for f in faces:
            p = [verts[i] for i in f]
            u = _unit(next(_sub(q, p[0]) for q in p[1:] if _dist(q, p[0]) > 1e-9))
            v = _cross(_unit(_newell(p)), u)
            out.append((self._new_chart(), tuple((_dot(_sub(q, p[0]), u), _dot(_sub(q, p[0]), v)) for q in p)))
        return out

    def _loft_charts(self, rings):
        """Charts for _loft's faces, in its order: one chart for every side quad (u = distance
        along the ring centroids, v = each ring's own arc-length fraction x the longest ring's
        perimeter), then a planar chart per cap. Returns (charts, side key, U, V)."""
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
        V = [[pmax * c[j] / c[-1] for j in range(count + 1)] for c in arcs]
        side = self._new_chart()
        charts = []
        for s in range(len(rings) - 1):
            for j in range(count):
                charts.append((side, ((U[s], V[s][j]), (U[s], V[s][j + 1]), (U[s + 1], V[s + 1][j + 1]), (U[s + 1], V[s + 1][j]))))
        verts = [p for ring in rings for p in ring]
        last = (len(rings) - 1) * count
        charts.extend(self._planar_charts(verts, [tuple(reversed(range(count))), tuple(last + j for j in range(count))]))
        return charts, side, U, V

    def _mirror_charts(self, charts):
        """The z-mirror of `charts`: new keys with the same tags, corners reversed as _mirror_z
        reverses windings, and the lines on the old keys copied onto the new."""
        remap = {}
        for key, _ in charts:
            if key not in remap:
                remap[key] = len(self._charts)
                self._charts[remap[key]] = self._charts[key]
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
            charts = self._planar_charts(verts, faces) if charts is None else charts
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
        self.box(role, (x, height - thickness, z), (length, thickness, width), node)

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
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
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
        f = [tuple(reversed(range(segments))), tuple(range(segments, 2 * segments))]
        for i in range(segments):
            j = (i + 1) % segments
            f.append((i, j, segments + j, segments + i))
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
        charts = None
        if self.skin:
            def arc(rx, ry):
                c = [0.0]
                for i in range(n):
                    c.append(c[-1] + _dist(ring(math.pi * i / n, rx, ry, 0.0), ring(math.pi * (i + 1) / n, rx, ry, 0.0)))
                return c
            so, si = arc(width / 2, rise), arc(width / 2 - thickness, rise - thickness)
            outer, inner = self._new_chart(), self._new_chart()
            rims = self._planar_charts(v, [f[4 * i + 2] for i in range(n)] + [f[4 * i + 3] for i in range(n)])
            charts = []
            for i in range(n):
                charts.append((outer, ((0.0, so[i]), (0.0, so[i + 1]), (length, so[i + 1]), (length, so[i]))))
                charts.append((inner, ((0.0, si[i]), (length, si[i]), (length, si[i + 1]), (0.0, si[i + 1]))))
                charts.append(rims[i])
                charts.append(rims[n + i])
        self._part(role, v, f, node, charts)

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

    def fuselage(self, role, stations, segments=16, center_z=0.0, node=None, lower_role=None, lower_node=None):
        """Loft a fuselage, nacelle, boom or canopy from stations in the glTF frame.

        Each station is ``(x, half_width, half_height, center_y[, exponent])``: a superellipse
        section (exponent 2 is an ellipse, larger is boxier; default 2.2) centered on
        (center_y, ``center_z``). Stations run tail to nose, x strictly increasing, and both
        ends are capped, so a pointed end is a tiny nonzero section. With ``lower_role``, the
        side faces below each section's center go to ``lower_node`` in that role.
        """
        _require(isinstance(segments, int) and segments >= 8 and segments % 4 == 0,
                 f'fuselage: segments must be a multiple of 4, at least 8, got {segments!r}')
        _require(len(stations) >= 2, f'fuselage: need at least 2 stations, got {len(stations)}')
        rings, xs = [], []
        for i, st in enumerate(stations):
            _require(len(st) in (4, 5), f'fuselage: station {i} needs 4 or 5 values, got {len(st)}')
            values = tuple(float(v) for v in st)
            _require(all(math.isfinite(v) for v in values), f'fuselage: station {i} has a non-finite value')
            x, half_w, half_h, center_y = values[:4]
            n = values[4] if len(values) == 5 else 2.2
            _require(half_w > 0 and half_h > 0 and n >= 1,
                     f'fuselage: station {i} half-width and half-height must be > 0 and exponent >= 1')
            xs.append(x)
            ring = []
            for j in range(segments):
                t = 2 * math.pi * j / segments
                c, s = math.cos(t), math.sin(t)
                ring.append((x, center_y + half_h * math.copysign(abs(c) ** (2 / n), c),
                             center_z + half_w * math.copysign(abs(s) ** (2 / n), s)))
            rings.append(ring)
        _require(all(xs[i] < xs[i + 1] for i in range(len(xs) - 1)), 'fuselage: station x values must be strictly increasing')
        verts, faces = _loft(rings)
        quarter = segments // 4
        charts = smooth = None
        if self.skin:
            charts, side, U, V = self._loft_charts(rings)
            smooth = [j is not None for _, j in faces]
            for s in range(1, len(rings) - 1):
                self._line(side, 'u', U[s], 0.0, V[s][-1])
        self._emit(role, verts, faces, node, lower_role, lower_node, lambda j: quarter <= j < 3 * quarter, charts, smooth)

    def wing(self, role, le_x, root_y, root_chord, tip_chord, span, sweep_deg=0.0, dihedral_deg=0.0,
             thickness=0.12, tip_thickness=None, root_z=0.0, mirror=True, node=None, lower_role=None, lower_node=None):
        """A tapered lifting surface, both halves by default: a wing or a tailplane.

        The root section's leading edge is at (``le_x``, ``root_y``, ``root_z``); the panel runs
        to z = span/2, its leading edge swept back ``sweep_deg`` and raised ``dihedral_deg``.
        Sections are NACA 4-digit symmetric (``thickness`` is a fraction of chord) with a closed
        trailing edge. ``mirror`` adds the left half, reflected in z = 0. ``lower_role`` paints
        the lower surface, as ``fuselage`` does.
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
        rings = [
            [(le_x + dx, root_y + dy, root_z) for dx, dy in _airfoil(root_chord, thickness)],
            [(tip_le + dx, tip_y + dy, half) for dx, dy in _airfoil(tip_chord, tip_t)],
        ]
        verts, faces = _loft(rings)
        lower = lambda j: j >= len(AIRFOIL_STATIONS) - 1  # noqa: E731
        charts = smooth = None
        if self.skin:
            charts, side, U, V = self._loft_charts(rings)
            smooth = [j is not None for _, j in faces]
            self._spar_lines(side, U, V, _section_labels(AIRFOIL_STATIONS))
        self._emit(role, verts, faces, node, lower_role, lower_node, lower, charts, smooth)
        if mirror:
            mverts, mfaces = _mirror_z(verts, faces)
            self._emit(role, mverts, mfaces, node, lower_role, lower_node, lower,
                       None if charts is None else self._mirror_charts(charts), smooth)

    def fin(self, role, le_x, root_y, root_chord, tip_chord, height, sweep_deg=0.0, thickness=0.10,
            tip_thickness=None, center_z=0.0, node=None):
        """A vertical tail surface standing on y = ``root_y`` in the plane z = ``center_z``."""
        tip_t = thickness if tip_thickness is None else tip_thickness
        _require(root_chord > 0 and tip_chord > 0 and height > 0,
                 f'fin: chords and height must be > 0, got {root_chord}, {tip_chord}, {height}')
        _require(0 < thickness < 0.3 and 0 < tip_t < 0.3, f'fin: thickness ratios must be in (0, 0.3), got {thickness}, {tip_t}')
        tip_le = le_x - height * math.tan(math.radians(sweep_deg))
        rings = [[(le_x + dx, dy, 0.0) for dx, dy in _airfoil(root_chord, thickness)],
                 [(tip_le + dx, dy, height) for dx, dy in _airfoil(tip_chord, tip_t)]]
        verts, faces = _loft(rings)
        charts = smooth = None
        if self.skin:
            charts, side, U, V = self._loft_charts(rings)
            smooth = [j is not None for _, j in faces]
            self._spar_lines(side, U, V, _section_labels(AIRFOIL_STATIONS))
        # Stand the panel up: (x, y, z) -> (x, z, -y) is a rotation, so windings hold.
        verts = [(x, root_y + z, center_z - y) for x, y, z in verts]
        self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)

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
            charts, _side, _U, _V = self._loft_charts(rings)
            smooth = [j is not None for _, j in faces]
        self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)

    def propeller(self, role, hub, diameter, blades, chord, spinner_radius, spinner_length, pitch_deg=25.0, node='Prop'):
        """A propeller on an axis along +x through ``hub``: flat blades, pitched ``pitch_deg``,
        from inside the spinner out to diameter/2 (tips tapered to 35% chord, so the tip corners
        stay within 0.1% of the radius), and a spinner ahead of the hub. One node, so the entry
        pivots it at the hub about +x. Exactly N-fold symmetric: the spinner's 24 segments divide
        by 2, 3, 4 and 6."""
        _require(isinstance(blades, int) and 2 <= blades <= 6, f'propeller: blades must be an integer from 2 to 6, got {blades!r}')
        radius = diameter / 2
        _require(chord > 0 and spinner_length > 0 and 0 < spinner_radius < radius,
                 f'propeller: need chord and spinner length > 0 and 0 < spinner radius < diameter/2, got chord {chord}, spinner {spinner_radius} x {spinner_length}, diameter {diameter}')
        hx, hy, hz = hub
        phi = math.radians(pitch_deg)
        thick = 0.12 * chord
        root_r = 0.8 * spinner_radius
        box_faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
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

    def gun_turret(self, role, index, center, radius, height, up=1, barrels=2, barrel_length=1.2, facing=1, node=None):
        """A turret on the fuselage skin at ``center``: a dome ``height`` tall toward ``up`` (+1
        dorsal, -1 ventral) and ``barrels`` guns pointing ``facing`` along x, all in node
        ``TurretN`` for H3 (numbered nose to tail by the caller)."""
        _require(isinstance(index, int) and index > 0, f'gun_turret: index must be a positive integer, got {index!r}')
        _require(up in (-1, 1) and facing in (-1, 1), f'gun_turret: up and facing must be -1 or +1, got {up}, {facing}')
        _require(isinstance(barrels, int) and barrels > 0, f'gun_turret: barrels must be a positive integer, got {barrels!r}')
        _require(radius > 0 and height > 0 and barrel_length > 0, 'gun_turret: radius, height and barrel length must be > 0')
        key = node or f'Turret{index}'
        cx, cy, cz = center
        self.revolve(role, center, (0.0, float(up), 0.0), [(0.0, radius), (0.55 * height, 0.85 * radius), (height, 0.25 * radius)], 12, key)
        gauge = 0.16 * radius
        for b in range(barrels):
            zz = cz + (b - (barrels - 1) / 2) * radius * 0.35
            self.box(role, (cx + facing * (0.6 * radius + barrel_length / 2), cy + up * 0.45 * height - gauge / 2, zz),
                     (barrel_length, gauge, gauge), key)

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
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', export_yup=True, export_apply=True,
            export_animations=False, export_cameras=False, export_lights=False,
            export_extras=False, export_materials='EXPORT', use_selection=False,
            export_texcoords=packed is not None, export_normals=True,
        )
        if packed is not None:
            self._write_sidecar(path, packed)

    def _write_uvs(self, me, key, faces, charts, smooth, packed):
        mpp, box, placed = packed
        w = self.skin
        _require(len(me.polygons) == len(faces), f'{key}: Blender dropped {len(faces) - len(me.polygons)} degenerate faces; fix the part')
        layer = me.uv_layers.new(name='UVMap')
        for poly, (ck, uvs), sm in zip(me.polygons, charts, smooth):
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
        with open(path[:-4] + '.skin.json', 'w', encoding='utf-8') as fh:
            json.dump(side, fh, sort_keys=True, separators=(',', ':'))
