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
