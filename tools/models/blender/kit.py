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
}


def cli_args():
    """(output path, {key: value}) from everything after `--`."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise ValueError('usage: blender -b -P <script> -- <out.glb> [--key value ...]')
    out, rest = argv[0], argv[1:]
    if len(rest) % 2 or any(not k.startswith('--') for k in rest[::2]):
        raise ValueError(f'arguments must be --key value pairs, got {rest}')
    return out, {k[2:]: v for k, v in zip(rest[::2], rest[1::2])}


def positive(opts, key, default):
    raw = opts.get(key, default)
    try:
        v = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f'--{key} must be a number, got {raw!r}') from None
    if not math.isfinite(v) or v <= 0:
        raise ValueError(f'--{key} must be > 0, got {raw!r}')
    return v


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

    def barrel_vault(self, role, spring, width, rise, length, thickness, segments, node=None):
        """Half-elliptic shell over the springing line: outer semi-axes (width/2, rise),
        inner inset by `thickness`, open at both ends except for the rims."""
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
