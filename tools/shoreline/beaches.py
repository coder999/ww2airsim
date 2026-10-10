"""Build the deterministic curved beach ribbon from generated shoreline JSON.

The input is in the game's glTF frame: +x east, +y up, +z south, metres.  Blender
is Z-up, so (x, y, z) becomes (x, -z, y); Blender's glTF exporter converts it
back.  No .blend is a source artifact: this script plus the committed L1 terrain
are the source.
"""
import json
import math
import os
import sys

import bpy


TILE_M = 20_000
ROLES = {
    'ShoreSand': (0.62, 0.51, 0.34, 1.0),
    'ShoreSurf': (0.84, 0.91, 0.91, 0.7),
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise ValueError('usage: blender -P beaches.py -- out.glb --input shore.json')
    out = argv[0]
    opts = {}
    rest = argv[1:]
    if len(rest) % 2:
        raise ValueError(f'options must be --key value pairs, got {rest}')
    for key, value in zip(rest[::2], rest[1::2]):
        if not key.startswith('--') or key[2:] in opts:
            raise ValueError(f'invalid or repeated option {key!r}')
        opts[key[2:]] = value
    if set(opts) != {'input'}:
        raise ValueError(f'expected only --input, got {sorted(opts)}')
    return out, opts['input']


def lane(point, offset, y):
    return (point['x'] + point['nx'] * offset, y, point['z'] + point['nz'] * offset)


def blender_vertex(game):
    x, y, z = game
    if not all(math.isfinite(v) for v in game):
        raise ValueError(f'non-finite shoreline vertex {game}')
    return (x, -z, y)


def material(name, rgba):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = rgba
        bsdf.inputs['Roughness'].default_value = 0.9
        if name == 'ShoreSurf':
            bsdf.inputs['Alpha'].default_value = rgba[3]
            mat.surface_render_method = 'DITHERED'
    return mat


def tile_key(a, b):
    x = 0.5 * (a['x'] + b['x'])
    z = 0.5 * (a['z'] + b['z'])
    return (math.floor(x / TILE_M), math.floor(z / TILE_M))


def add_quad(bucket, line_i, a_i, b_i, lane_a, lane_b, a, b):
    vertices, faces, uvs, lookup = bucket
    ids = []
    for point_i, lane_i, point, position, uv in (
        (a_i, lane_a[0], a, lane_a[1](a), (0.0, lane_a[2])),
        (b_i, lane_a[0], b, lane_a[1](b), (1.0, lane_a[2])),
        (b_i, lane_b[0], b, lane_b[1](b), (1.0, lane_b[2])),
        (a_i, lane_b[0], a, lane_b[1](a), (0.0, lane_b[2])),
    ):
        key = (line_i, point_i, lane_i)
        index = lookup.get(key)
        if index is None:
            index = len(vertices)
            lookup[key] = index
            vertices.append(blender_vertex(position))
            uvs.append(uv)
        ids.append(index)
    faces.append(tuple(ids))


def main():
    out, input_path = args()
    with open(input_path, encoding='utf-8') as f:
        shore = json.load(f)
    if shore.get('version') != 1:
        raise ValueError(f"unsupported shoreline version {shore.get('version')!r}")
    lanes = shore['lanes']
    role_segments = {
        # One opaque material spans both quads.  Its UV.y keeps the vegetation,
        # dry-sand and wet-sand stops while removing one draw per shoreline tile.
        'ShoreSand': (
            (
                ('inland', lambda p: lane(p, lanes['inlandM'], p['inlandY']), 0.0),
                ('dry', lambda p: lane(p, lanes['dryM'], p['dryY']), 0.45),
            ),
            (
                ('dry', lambda p: lane(p, lanes['dryM'], p['dryY']), 0.45),
                ('waterline', lambda p: lane(p, lanes['waterlineM'], lanes['waterlineHeightM']), 1.0),
            ),
        ),
        'ShoreSurf': ((
            ('waterline', lambda p: lane(p, lanes['waterlineM'], lanes['waterlineHeightM'] + 0.03), 0.0),
            ('submerged', lambda p: lane(p, lanes['submergedM'], lanes['submergedHeightM']), 1.0),
        ),),
    }

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {name: material(name, color) for name, color in ROLES.items()}
    buckets = {}
    segment_count = 0
    for line_i, line in enumerate(shore['lines']):
        points = line['points']
        end = len(points) if line['closed'] else len(points) - 1
        for i in range(end):
            j = (i + 1) % len(points)
            a, b = points[i], points[j]
            tile = tile_key(a, b)
            for role, segments in role_segments.items():
                bucket = buckets.setdefault((tile, role), ([], [], [], {}))
                for lane_a, lane_b in segments:
                    add_quad(bucket, line_i, i, j, lane_a, lane_b, a, b)
            segment_count += 1

    for (tile, role), (vertices, faces, uvs, _lookup) in sorted(buckets.items()):
        if not faces:
            continue
        name = f'{role}_{tile[0]}_{tile[1]}'
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(mats[role])
        # Every role carries its normalized cross-shore coordinate.  Runtime
        # uses it to blend vegetation into dry sand, dry into wet sand, and
        # surf into open water without adding more geometry lanes.
        uv_layer = mesh.uv_layers.new(name='UVMap')
        for polygon in mesh.polygons:
            if polygon.normal.z < 0:
                polygon.flip()
            for loop_index in polygon.loop_indices:
                vertex_index = mesh.loops[loop_index].vertex_index
                # Only the cross-shore coordinate is semantic.  Keeping U
                # constant lets adjacent quads share vertices in glTF.
                uv_layer.data[loop_index].uv = (0.0, uvs[vertex_index][1])
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)

    if not buckets or segment_count == 0:
        raise ValueError('shoreline input produced no faces')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_yup=True,
        export_materials='EXPORT',
        # Runtime materials use the terrain-compatible up normal.  Exported
        # face normals split every shared ribbon vertex and nearly double the
        # asset, while contributing nothing to the rendered result.
        export_normals=False,
        export_texcoords=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f'beaches: {len(shore["lines"])} lines, {segment_count} segments, {len(buckets)} tile-role meshes')


main()
