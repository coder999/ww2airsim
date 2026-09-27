# tools/models/blender/kit.py
"""The Blender model kit (model-roster spec §4.2). Original work, AGPL-3.0-or-later.

Geometry is written in the glTF frame: +x forward, +y up, +z toward the viewer, meters.
The kit maps it to Blender's Z-up frame, and the exporter's +Y-up conversion maps it
back, so a script never thinks in Blender axes. (x, y, z) -> Blender (x, -z, y) is a
rotation (det +1), so face winding survives both ways.

Determinism: no randomness; parts accumulate in plain lists and become Blender
objects only at export, one per node, created in sorted name order.
"""
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


def _unit(v):
    n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    _require(n > 0 and math.isfinite(n), f'direction must be a nonzero finite vector, got {v}')
    return (v[0] / n, v[1] / n, v[2] / n)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


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


class Model:
    def __init__(self, name):
        self.name = name
        self._nodes = {}  # node name -> [role, verts, faces]

    def _part(self, role, verts, faces, node):
        if role not in PALETTE:
            raise ValueError(f'unknown role {role!r}; palette roles are {sorted(PALETTE)}')
        key = node or f'{self.name}_{role}'
        entry = self._nodes.setdefault(key, [role, [], []])
        if entry[0] != role:
            raise ValueError(f'node {key!r} already has role {entry[0]!r}, not {role!r}')
        base = len(entry[1])
        entry[1].extend(verts)
        entry[2].extend(tuple(base + i for i in f) for f in faces)

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
        self._part(role, v, f, node)

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

    def _emit(self, role, verts, faces, node, lower_role=None, lower_node=None, is_lower=None):
        """Adds (face, j) pairs to ``node``; with ``lower_role``, faces whose ring edge
        ``is_lower`` go to ``lower_node`` in that role instead (caps stay with ``role``)."""
        groups = [(role, node, [f for f, j in faces if lower_role is None or j is None or not is_lower(j)])]
        if lower_role is not None:
            groups.append((lower_role, lower_node, [f for f, j in faces if j is not None and is_lower(j)]))
        for r, nd, fs in groups:
            used = sorted({i for f in fs for i in f})
            index = {old: new for new, old in enumerate(used)}
            self._part(r, [verts[i] for i in used], [tuple(index[i] for i in f) for f in fs], nd)

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
        self._emit(role, verts, faces, node, lower_role, lower_node, lambda j: quarter <= j < 3 * quarter)

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
        self._emit(role, verts, faces, node, lower_role, lower_node, lower)
        if mirror:
            mverts, mfaces = _mirror_z(verts, faces)
            self._emit(role, mverts, mfaces, node, lower_role, lower_node, lower)

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
        # Stand the panel up: (x, y, z) -> (x, z, -y) is a rotation, so windings hold.
        verts = [(x, root_y + z, center_z - y) for x, y, z in verts]
        self._part(role, verts, [f for f, _ in faces], node)

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
        self._part(role, verts, [f for f, _ in faces], node)

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

    def export(self, path):
        unread = sorted(_given - _read)
        if unread:
            raise ValueError(f'unknown argument --{unread[0]}; this model reads {sorted(_read) or "none"}')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        root = bpy.data.objects.new(self.name, None)
        scene.collection.objects.link(root)
        for key in sorted(self._nodes):
            role, verts, faces = self._nodes[key]
            me = bpy.data.meshes.new(key)
            me.from_pydata([(vx, -vz, vy) for vx, vy, vz in verts], [], faces)
            me.validate()
            me.update()
            me.materials.append(_material(role))
            ob = bpy.data.objects.new(key, me)
            scene.collection.objects.link(ob)
            ob.parent = root
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', export_yup=True, export_apply=True,
            export_animations=False, export_cameras=False, export_lights=False,
            export_extras=False, export_materials='EXPORT', use_selection=False,
            export_texcoords=False, export_normals=True,
        )
