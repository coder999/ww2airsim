"""(M1c) The high-poly bake: ambient occlusion and a tangent-space normal map onto a skinned model's atlas.
Original work, AGPL-3.0-or-later.

kit.Model.export calls run() after writing its glb when WW2_BAKE_DIR is set, which only
tools/models/bake.ts does, on Ryzen's Windows Blender with Cycles on the RX 6700 XT (a bake at 2,048 px
is sample-bound, serverconfig/ryzen.md "Cycles on the GPU"). A normal build never imports this file.

The game mesh (`low`) is every exported mesh joined, its UVs the atlas. The high-poly is a copy of it
plus the script's detail() list, each snapped onto the low surface by a ray cast from its origin back along its axis
and built in that surface's tangent frame. Both maps bake selected-to-active, so a detail's AO is
taken on its own top, not under it. The low is pulled 5 mm inside, so no AO ray meets a surface
coincident with the high copy. Images are Non-Color: the PNGs hold linear values.

Every size here is an ESTIMATE, chosen to read at the atlas's 6-13 cm texels.
"""
import json
import math
import os
import time

import bmesh
import bpy
from mathutils import Vector

# The env overrides are for a quick trial on nexus's CPU only; a committed bake uses the defaults (bake.ts checks).
AO_SAMPLES = int(os.environ.get('WW2_BAKE_AO_SAMPLES', '128'))
NORMAL_SAMPLES = 16
AO_DISTANCE_M = 4.0   # occlusion reach: a superstructure darkens the deck at its foot, not the whole ship
CAGE_M = 0.06         # the deepest detail stands 0.045 m proud
RAY_M = 0.12
SHRINK_M = 0.005
SNAP_M = 6.0          # a detail's origin is at most this far off its surface, with nothing between
SINK_M = 0.01         # every detail sinks this far into the surface: no gap for a ray to slip through


def _b(p):
    """Model coordinates (x fore, y up, z starboard) to Blender's (kit.export's own conversion)."""
    return Vector((p[0], -p[2], p[1]))


def _frame(n):
    """(t, b) across a surface with normal n: t horizontal along a wall (fore and aft on a deck), b up the wall."""
    t = Vector((0.0, 0.0, 1.0)).cross(n)
    if t.length < 0.3:
        t = Vector((1.0, 0.0, 0.0)) - n * n.x
    t.normalize()
    return t, n.cross(t)


def _box(bm, c, t, b, n, w, h, d):
    """A closed box on the surface at c: w along t, h along b, from SINK_M under it to d proud."""
    lo, hi = -SINK_M, d
    vs = [bm.verts.new(c + t * (sx * w / 2) + b * (sy * h / 2) + n * (lo if sz < 0 else hi))
          for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    for f in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
        bm.faces.new([vs[i] for i in f])


def _ring(bm, c, t, b, n, r_out, r_in, d, seg=12):
    """A closed annular rim on the surface at c (a porthole's)."""
    ring = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        u = t * math.cos(a) + b * math.sin(a)
        ring.append([bm.verts.new(c + u * r + n * z) for r, z in ((r_out, -SINK_M), (r_out, d), (r_in, d), (r_in, -SINK_M))])
    for k in range(seg):
        p, q = ring[k], ring[(k + 1) % seg]
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((p[i], q[i], q[j], p[j]))


def porthole(bm, c, t, b, n, d):
    r = d.get('radius', 0.2)
    _ring(bm, c, t, b, n, r, 0.7 * r, 0.03)


def door(bm, c, t, b, n, d):
    w, h, f = d.get('w', 0.8), d.get('h', 1.9), 0.08
    for dx, dy, bw, bh in ((0, (h - f) / 2, w, f), (0, -(h - f) / 2, w, f), ((w - f) / 2, 0, f, h), (-(w - f) / 2, 0, f, h)):
        _box(bm, c + t * dx + b * dy, t, b, n, bw, bh, 0.035)
    _box(bm, c, t, b, n, w - 2 * f, h - 2 * f, 0.018)


def hatch(bm, c, t, b, n, d):
    w, h, f = d.get('w', 1.4), d.get('h', 1.4), 0.1
    for dx, dy, bw, bh in ((0, (h - f) / 2, w, f), (0, -(h - f) / 2, w, f), ((w - f) / 2, 0, f, h), (-(w - f) / 2, 0, f, h)):
        _box(bm, c + t * dx + b * dy, t, b, n, bw, bh, 0.045)
    _box(bm, c, t, b, n, w - 2 * f, h - 2 * f, 0.03)
    _box(bm, c, t, b, n, w - 2 * f, 0.08, 0.04)  # the cover's stiffener


def louver(bm, c, t, b, n, d):
    w, h, k = d.get('w', 1.2), d.get('h', 0.8), int(d.get('slats', 6))
    pitch = h / k
    for i in range(k):
        _box(bm, c + b * (-h / 2 + pitch * (i + 0.5)), t, b, n, w, pitch * 0.5, 0.03)


def ladder(bm, c, t, b, n, d):
    w, h = d.get('w', 0.45), d.get('h', 2.4)
    for s in (-1, 1):
        _box(bm, c + t * (s * w / 2), t, b, n, 0.05, h, 0.04)
    for i in range(int(h / 0.3)):
        _box(bm, c + b * (-h / 2 + 0.15 + 0.3 * i), t, b, n, w, 0.03, 0.035)


BUILDERS = {'porthole': porthole, 'door': door, 'hatch': hatch, 'louver': louver, 'ladder': ladder}


def _snap(low, origin, axis):
    """The surface point and normal under `origin` along -axis (Blender frame), or None."""
    a = axis.normalized()
    hit, loc, nrm, _ = low.ray_cast(origin, -a, distance=SNAP_M)
    return (loc, nrm.normalized()) if hit else None


def run(details, out_dir, size):
    size = int(os.environ.get('WW2_BAKE_PX', size))
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    low = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    high = low.copy()
    high.data = low.data.copy()
    scene.collection.objects.link(high)

    bm = bmesh.new()
    bm.from_mesh(high.data)
    built, missed = 0, []
    for i, d in enumerate(details):
        kind = d['kind']
        if kind == 'strip':
            pts = []
            for p in (d['origin'], d['to']):
                s = _snap(low, _b(p), _b(d['axis']))
                pts.append(s)
            if None in pts:
                missed.append(i)
                continue
            (p0, n0), (p1, _n1) = pts
            span = p1 - p0
            steps = max(1, math.ceil(span.length / 2.0))
            for k in range(steps):
                s = _snap(low, p0 + span * ((k + 0.5) / steps) + n0 * 0.5, n0)
                if s is None:
                    continue
                c, n = s
                t = span.normalized()
                t = (t - n * t.dot(n)).normalized()
                _box(bm, c, t, n.cross(t), n, span.length / steps + 0.02, d.get('width', 0.08), d.get('proud', 0.03))
            built += 1
            continue
        s = _snap(low, _b(d['origin']), _b(d['axis']))
        if s is None:
            missed.append(i)
            continue
        c, n = s
        t, b = _frame(n)
        BUILDERS[kind](bm, c, t, b, n, d)
        built += 1
    bm.to_mesh(high.data)
    bm.free()
    # Pull the low inside the high copy (see the module doc), then give it the one bake material.
    for v in low.data.vertices:
        v.co -= v.normal * SHRINK_M
    low.data.materials.clear()
    mat = bpy.data.materials.new('bake')
    mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    mat.node_tree.nodes.active = node
    low.data.materials.append(mat)
    for p in low.data.polygons:
        p.material_index = 0

    scene.render.engine = 'CYCLES'
    device = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'HIP'
        prefs.get_devices()
        gpus = [dv for dv in prefs.devices if dv.type == 'HIP']
        for dv in prefs.devices:
            dv.use = dv.type == 'HIP'
        if gpus:
            scene.cycles.device = 'GPU'
            device = gpus[0].name
    except (TypeError, KeyError, AttributeError):
        pass
    scene.world = bpy.data.worlds.new('bake')
    scene.world.light_settings.distance = AO_DISTANCE_M
    bk = scene.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = CAGE_M
    bk.max_ray_distance = RAY_M
    bk.margin = 8
    bk.margin_type = 'EXTEND'
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low

    timings = {}
    for name, kind, samples, fill in (('ao', 'AO', AO_SAMPLES, (1, 1, 1, 1)), ('normal', 'NORMAL', NORMAL_SAMPLES, (0.5, 0.5, 1, 1))):
        img = bpy.data.images.new(name, size, size, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        img.generated_color = fill
        node.image = img
        scene.cycles.samples = samples
        t1 = time.time()
        if kind == 'NORMAL':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
        else:
            bpy.ops.object.bake(type='AO')
        timings[name] = round(time.time() - t1, 1)
        img.filepath_raw = os.path.join(out_dir, f'{name}.png')
        img.file_format = 'PNG'
        img.save()
    info = {'size': size, 'device': device, 'aoSamples': AO_SAMPLES, 'normalSamples': NORMAL_SAMPLES, 'aoDistanceM': AO_DISTANCE_M,
            'details': built, 'missed': missed, 'seconds': timings, 'totalSeconds': round(time.time() - t0, 1)}
    with open(os.path.join(out_dir, 'bake.json'), 'w', encoding='utf-8') as fh:
        json.dump(info, fh, sort_keys=True, indent=1)
    print('BAKE', json.dumps(info, sort_keys=True))
