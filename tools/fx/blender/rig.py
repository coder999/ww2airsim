# tools/fx/blender/rig.py
"""The flipbook bake rig (ordnance-and-effects design §6.1-6.2, plan E2). Original work, AGPL-3.0-or-later.

Runs only under the blender.org 5.0.1 Linux build (plan E2 Ruling R1). Ubuntu's blender
package renders a Mantaflow grid as nothing in Cycles (measured 2026-09-27 on ryzen: the
same VDB drew 0 px there and 4,747 px in the blender.org build). probe.py is that
measurement, and tools/fx/render.ts runs it before every bake.

Frame: the camera sits on -Y looking +Y, so the runtime particle frame (x right, y up,
z toward the camera; src/render/fx/material.ts) is world (+X, +Z, -Y). Each sun shines
FROM the side it is named for. Channel packing is tools/fx/pack.ts's.

A gas sheet script calls, in order: args(), reset(), gas_domain(), flow_sphere() once or more,
bake(), render_sheet(). A liquid whitewater sheet calls liquid_domain(), flow_box() and/or
flow_sphere(), bake(), render_liquid_sheet(). Nothing here is random except Mantaflow itself, which is not
reproducible run to run (two identical bakes covered 4,890 and 5,092 px, 2026-09-27), so
bakes are committed with provenance and never rebuilt to compare bytes (Ruling R2).
"""
import json
import math
import os
import sys
import time

import bpy

PASSES = ('right', 'left', 'top', 'bottom', 'back', 'front')
SUN_ROTATION = {
    'right': (0.0, math.pi / 2, 0.0),
    'left': (0.0, -math.pi / 2, 0.0),
    'top': (0.0, 0.0, 0.0),
    'bottom': (math.pi, 0.0, 0.0),
    'front': (math.pi / 2, 0.0, 0.0),
    'back': (-math.pi / 2, 0.0, 0.0),
}
# The pack normalizes every sheet's lit passes to its own 99.9th-percentile covered value
# (plan E2 Ruling R6), so absolute exposure buys nothing there -- but render-time clipping
# (any radiance >=1 in the 16-bit PNG) destroys range the pack can never recover. 3.0 let
# flame's back pass clip 21.7%/16.9% at its peak frames; 2.75 measured 0.41% at the same
# full-settings trial (plan E2 Task 5b ledger ruling).
SUN_STRENGTH = 2.75
_KNOWN = {'--out', '--frames', '--cell', '--samples', '--sim-scale'}


def args():
    """The runner's arguments: `-- <done.json> --out <dir> [--frames N --cell PX --samples S --sim-scale K]`."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise ValueError('usage: blender -b -P <sheet>.py -- <done.json> --out <dir> [--frames N ...]')
    done, rest = argv[0], argv[1:]
    if len(rest) % 2 or any(not k.startswith('--') for k in rest[::2]):
        raise ValueError(f'arguments must be --key value pairs, got {rest}')
    kv = dict(zip(rest[::2], rest[1::2]))
    unknown = sorted(set(kv) - _KNOWN)
    if unknown:
        raise ValueError(f'unknown arguments {unknown}')
    if '--out' not in kv:
        raise ValueError('--out is required')
    return {
        'done': done, 'out': kv['--out'],
        'frames': int(kv.get('--frames', 64)), 'cell': int(kv.get('--cell', 256)),
        'samples': int(kv.get('--samples', 128)),
        # Trial runs shrink the sim; a real bake is 1.0.
        'sim_scale': float(kv.get('--sim-scale', 1.0)),
    }


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # The location keyframes that stop an inflow must step, not ease (flow_sphere).
    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'CONSTANT'
    return bpy.context.scene


def _active():
    return bpy.context.view_layer.objects.active


def gas_domain(scene, *, size, center, res, frame_end, cache, alpha, beta, vorticity=0.0, dissolve=0, fire=None):
    """A GAS domain with open borders. `fire` = (burning_rate, flame_smoke, flame_vorticity) or None.
    `alpha` > 0 makes density rise, < 0 sink; `beta` is heat buoyancy."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    dom = _active()
    dom.name = 'Domain'
    dom.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    d = dom.modifiers.new('Fluid', 'FLUID')
    d.fluid_type = 'DOMAIN'
    s = d.domain_settings
    s.domain_type = 'GAS'
    s.resolution_max = res
    s.cache_type = 'ALL'
    s.cache_directory = cache
    s.cache_frame_start = 1
    s.cache_frame_end = frame_end
    s.alpha = alpha
    s.beta = beta
    s.vorticity = vorticity
    for side in ('front', 'back', 'right', 'left', 'top', 'bottom'):
        setattr(s, f'use_collision_border_{side}', False)
    if dissolve:
        s.use_dissolve_smoke = True
        s.dissolve_speed = dissolve
    if fire is not None:
        s.burning_rate, s.flame_smoke, s.flame_vorticity = fire
    scene.frame_start = 1
    scene.frame_end = frame_end
    return dom


def flow_sphere(name, *, radius, location, flow_type, velocity=(0.0, 0.0, 0.0), velocity_normal=0.0,
                stop_frame=None, density=1.0, temperature=1.0, fuel=1.0, subframes=0):
    """An inflow sphere. With `stop_frame` it jumps 1 km below the domain at that frame, which ends its inflow."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location)
    o = _active()
    o.name = name
    m = o.modifiers.new('Fluid', 'FLUID')
    m.fluid_type = 'FLOW'
    f = m.flow_settings
    f.flow_type = flow_type
    f.flow_behavior = 'INFLOW'
    f.flow_source = 'MESH'
    f.subframes = subframes
    f.density = density
    f.temperature = temperature
    if flow_type in ('FIRE', 'BOTH'):
        f.fuel_amount = fuel
    if any(velocity) or velocity_normal:
        f.use_initial_velocity = True
        f.velocity_coord = velocity
        f.velocity_normal = velocity_normal
    if stop_frame is not None:
        o.keyframe_insert('location', frame=stop_frame - 1)
        o.location = (location[0], location[1], location[2] - 1000.0)
        o.keyframe_insert('location', frame=stop_frame)
    o.hide_render = True
    return o


def bake(dom):
    t = time.time()
    bpy.context.view_layer.objects.active = dom
    r = bpy.ops.fluid.bake_all()
    if 'FINISHED' not in r:
        raise RuntimeError(f'fluid bake returned {r}')
    return time.time() - t


def _node_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return mat, nt, out


def scatter_material(*, density, albedo, anisotropy):
    """Lit passes: scattering and absorption from the `density` grid, no emission."""
    mat, nt, out = _node_material('fx-scatter')
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    pv.inputs['Color'].default_value = (albedo, albedo, albedo, 1.0)
    pv.inputs['Density'].default_value = density
    pv.inputs['Anisotropy'].default_value = anisotropy
    nt.links.new(pv.outputs['Volume'], out.inputs['Volume'])
    return mat


def emission_material(*, density, strength):
    """The emission pass: light from the `flame` grid, dimmed by the smoke in front of it."""
    mat, nt, out = _node_material('fx-emission')
    flame = nt.nodes.new('ShaderNodeAttribute')
    flame.attribute_name = 'flame'
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = strength
    nt.links.new(flame.outputs['Fac'], k.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(k.outputs['Value'], em.inputs['Strength'])
    smoke = nt.nodes.new('ShaderNodeAttribute')
    smoke.attribute_name = 'density'
    kd = nt.nodes.new('ShaderNodeMath')
    kd.operation = 'MULTIPLY'
    kd.inputs[1].default_value = density
    nt.links.new(smoke.outputs['Fac'], kd.inputs[0])
    ab = nt.nodes.new('ShaderNodeVolumeAbsorption')
    ab.inputs['Color'].default_value = (0.5, 0.5, 0.5, 1.0)
    nt.links.new(kd.outputs['Value'], ab.inputs['Density'])
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(em.outputs['Emission'], add.inputs[0])
    nt.links.new(ab.outputs['Volume'], add.inputs[1])
    nt.links.new(add.outputs['Shader'], out.inputs['Volume'])
    return mat


def _render_settings(scene, cell, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.seed = 0
    scene.cycles.use_denoising = True
    scene.cycles.volume_bounces = 4
    scene.render.resolution_x = cell
    scene.render.resolution_y = cell
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    # Lightmaps are data: no view transform, no look, 16-bit linear PNG (straight alpha).
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'


def _vdb(cache, frame):
    return os.path.join(cache, 'data', f'fluid_data_{frame:04d}.vdb')


def _picked(frames, first_frame, sim_frames):
    span = sim_frames - first_frame
    return [first_frame + round(k * span / (frames - 1)) for k in range(frames)] if frames > 1 else [sim_frames]


def _render_frames(scene, *, sheet, a, picked, ortho, center_z, load, emit=None):
    """The shared half of every sheet: an orthographic camera on -Y, one sun per pass, a black
    world, then for each picked frame `load(k, f)` (which puts frame f's volume in the scene),
    six single-sun lit passes, and, when `emit(k, f)` is given, an emission pass after it swaps
    the material. Returns the render seconds."""
    bpy.ops.object.camera_add(location=(0.0, -50.0, center_z), rotation=(math.pi / 2, 0.0, 0.0))
    cam = _active()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho
    cam.data.clip_end = 200.0
    scene.camera = cam
    suns = {}
    for p in PASSES:
        bpy.ops.object.light_add(type='SUN', rotation=SUN_ROTATION[p])
        s = _active()
        s.name = f'sun-{p}'
        s.data.energy = SUN_STRENGTH
        s.data.angle = 0.0
        suns[p] = s
    world = bpy.data.worlds.new('black')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    scene.world = world
    _render_settings(scene, a['cell'], a['samples'])
    base = os.path.join(a['out'], sheet)
    os.makedirs(base, exist_ok=True)
    t = time.time()
    for k, f in enumerate(picked):
        load(k, f)
        d = os.path.join(base, f'f{k:02d}')
        os.makedirs(d, exist_ok=True)
        for p in PASSES:
            for q, s in suns.items():
                s.hide_render = q != p
            scene.render.filepath = os.path.join(d, f'{p}.png')
            bpy.ops.render.render(write_still=True)
        if emit is not None:
            for s in suns.values():
                s.hide_render = True
            emit(k, f)
            scene.render.filepath = os.path.join(d, 'emit.png')
            bpy.ops.render.render(write_still=True)
    return time.time() - t


def _write_meta(a, sheet, meta):
    with open(os.path.join(a['out'], sheet, 'meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=2, sort_keys=True)
    with open(a['done'], 'w') as fh:
        json.dump(meta, fh, sort_keys=True)


def _meta(*, sheet, a, sim, sim_frames, first_frame, picked, ortho, emission, bake_s, render_s):
    return {
        'sheet': sheet, 'sim': sim, 'frames': a['frames'], 'simFrames': sim_frames, 'firstFrame': first_frame,
        'picked': picked, 'cellPx': a['cell'], 'samples': a['samples'], 'simScale': a['sim_scale'], 'orthoScale': ortho,
        'emission': emission, 'blender': bpy.app.version_string,
        'buildHash': bpy.app.build_hash.decode(), 'bakeS': round(bake_s, 1), 'renderS': round(render_s, 1),
    }


def render_sheet(scene, dom, flows, *, sheet, a, cache, sim_frames, ortho, center_z, scatter,
                 emission=None, bake_s, first_frame=1):
    """A gas sheet: renders a['frames'] frames spread evenly over sim frames first_frame..sim_frames
    from the domain's VDB cache, six lit passes each (and an emission pass when `emission` is
    given) into <out>/<sheet>/fNN/, then meta.json and the done file.
    `first_frame + frames - 1 == sim_frames` renders consecutive frames."""
    # Mantaflow's VDB index space starts at the domain's minimum corner (measured 2026-09-27:
    # an identity volume put a domain spanning x -4..4 at 0..8), so the volume sits at that corner.
    corner = tuple(min(v[i] for v in (dom.matrix_world @ c.co for c in dom.data.vertices)) for i in range(3))
    for o in [dom, *flows]:
        bpy.data.objects.remove(o)
    vd = bpy.data.volumes.new('fx')
    vol = bpy.data.objects.new('fx', vd)
    scene.collection.objects.link(vol)
    vol.location = corner
    vd.materials.append(scatter)

    def load(k, f):
        vd.filepath = _vdb(cache, f)
        if not vd.grids.load():
            raise RuntimeError(f'{vd.filepath}: {vd.grids.error_message}')
        vd.materials[0] = scatter

    def emit(k, f):
        vd.materials[0] = emission

    picked = _picked(a['frames'], first_frame, sim_frames)
    render_s = _render_frames(scene, sheet=sheet, a=a, picked=picked, ortho=ortho, center_z=center_z, load=load,
                              emit=emit if emission is not None else None)
    _write_meta(a, sheet, _meta(sheet=sheet, a=a, sim='gas', sim_frames=sim_frames, first_frame=first_frame, picked=picked,
                                ortho=ortho, emission=emission is not None, bake_s=bake_s, render_s=render_s))


# --- Liquid whitewater (plan E2 Task 6; replaces Ruling R4 for water-column and spray) ---------
# A Mantaflow LIQUID sim's secondary particles (spray, foam, bubbles), never the liquid body or
# its FLIP particles, rendered as a white scattering volume: evaluated domain particle systems ->
# a loose-vertex mesh -> Geometry Nodes Mesh to Points -> Points to Volume -> Principled Volume.
# Proven on ryzen's 5.0.1 by the liquid spike (.superpowers/sdd/2026-09-27-e2-baked-flipbooks/
# spike-liquid-report.md, which lists the RNA and the traps).
WHITEWATER = ('SPRAY', 'FOAM', 'BUBBLE')


def liquid_domain(scene, *, size, center, res, frame_end, cache, types=('SPRAY', 'FOAM'),
                  energy=(0.5, 3.0), wavecrest=(1.0, 4.0), trapped_air=(2.0, 10.0), sampling=(400, 80), life=(10.0, 30.0)):
    """A LIQUID domain that emits whitewater of `types` (a subset of WHITEWATER) and builds no mesh.
    Every border is closed but the top: gas_domain opens all six, which would drain the pool.
    `energy`, `wavecrest`, `trapped_air` are the (min, max) potential thresholds; `sampling` is
    (wavecrest, trapped air) particles per cell; `life` is (min, max) frames."""
    bad = sorted(set(types) - set(WHITEWATER))
    if bad:
        raise ValueError(f'whitewater types {bad}; one of {WHITEWATER}')
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    dom = _active()
    dom.name = 'Domain'
    dom.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    d = dom.modifiers.new('Fluid', 'FLUID')
    d.fluid_type = 'DOMAIN'
    s = d.domain_settings
    s.domain_type = 'LIQUID'
    s.resolution_max = res
    s.cache_type = 'ALL'
    s.cache_directory = cache
    s.cache_frame_start = 1
    s.cache_frame_end = frame_end
    s.use_mesh = False
    for side in ('front', 'back', 'right', 'left', 'bottom'):
        setattr(s, f'use_collision_border_{side}', True)
    s.use_collision_border_top = False
    # Three booleans in 5.0.1, not a `particle_type` enum (spike). Each creates a domain particle
    # system (Spray:SPRAY, Foam:FOAM, Bubbles:BUBBLE) beside the liquid's own Liquid:FLIP.
    s.use_spray_particles = 'SPRAY' in types
    s.use_foam_particles = 'FOAM' in types
    s.use_bubble_particles = 'BUBBLE' in types
    s.sndparticle_combined_export = 'OFF'
    s.sndparticle_potential_min_energy, s.sndparticle_potential_max_energy = energy
    s.sndparticle_potential_min_wavecrest, s.sndparticle_potential_max_wavecrest = wavecrest
    s.sndparticle_potential_min_trappedair, s.sndparticle_potential_max_trappedair = trapped_air
    s.sndparticle_sampling_wavecrest, s.sndparticle_sampling_trappedair = sampling
    s.sndparticle_life_min, s.sndparticle_life_max = life
    scene.frame_start = 1
    scene.frame_end = frame_end
    return dom


def flow_box(name, *, size, location, flow_type='LIQUID', behavior='GEOMETRY'):
    """A box flow; GEOMETRY makes it initial liquid (a pool) that exists from frame 1."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = _active()
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    m = o.modifiers.new('Fluid', 'FLUID')
    m.fluid_type = 'FLOW'
    f = m.flow_settings
    f.flow_type = flow_type
    f.flow_behavior = behavior
    f.flow_source = 'MESH'
    o.hide_render = True
    return o


def whitewater_points(scene, dom, frame, *, types, z_min=None, fade=None):
    """Frame `frame`'s live whitewater positions of `types` as an (N, 3) float32 array, from the
    evaluated domain (so it must run before render_liquid_sheet removes the fluid objects). The
    Liquid:FLIP system is the water body itself and is never included (spike trap 4). Points
    under `z_min` are culled: late in a sim the pool fills with a foam slab (spike trap 5).
    `fade` = (r0, r1) thins points by their distance r from the z axis: all kept inside r0, none
    beyond r1, and a smoothstep between, so the closed walls' sparse flecks (water-column trial 2:
    they set a 6 m wall-to-wall bounding box) are dropped without the straight vertical edge a hard
    radial cut draws (review round 1: 0.12 -> 7.17 -> 20.5 alpha across two texel columns). Which
    points go is a hash of each particle's index, so it needs no RNG state."""
    import numpy as np
    bad = sorted(set(types) - set(WHITEWATER))
    if bad:
        # FLIP is the liquid body itself (spike trap 4); anything else is not whitewater.
        raise ValueError(f'whitewater types {bad}; one of {WHITEWATER}')
    scene.frame_set(frame)
    ev = dom.evaluated_get(bpy.context.evaluated_depsgraph_get())
    out, counts = [], {}
    for ps in ev.particle_systems:
        kind = ps.settings.type
        if kind not in types:
            continue
        n = len(ps.particles)
        if n == 0:
            counts[kind] = 0
            continue
        buf = np.zeros(n * 3, dtype=np.float32)
        ps.particles.foreach_get('location', buf)
        keep = np.array([p.alive_state == 'ALIVE' for p in ps.particles], dtype=bool)
        p3 = buf.reshape(-1, 3)
        if z_min is not None:
            keep &= p3[:, 2] >= z_min
        if fade is not None:
            keep &= _hash01(n) < _fade_keep(np.hypot(p3[:, 0], p3[:, 1]), *fade)
        p3 = p3[keep]
        counts[kind] = int(len(p3))
        out.append(p3)
    return (np.concatenate(out) if out else np.zeros((0, 3), dtype=np.float32)), counts


def _hash01(n):
    """A fixed pseudo-random value in [0, 1) per index 0..n-1 (Knuth's multiplicative hash, then
    a xorshift), the same on every run and machine."""
    import numpy as np
    h = np.arange(n, dtype=np.uint64) * np.uint64(2654435761) & np.uint64(0xFFFFFFFF)
    h ^= h >> np.uint64(16)
    h = h * np.uint64(0x45D9F3B) & np.uint64(0xFFFFFFFF)
    h ^= h >> np.uint64(16)
    return h.astype(np.float64) / 4294967296.0


def _fade_keep(r, r0, r1):
    """The kept fraction at distance r: 1 inside r0, 0 beyond r1, 1 - smoothstep between."""
    import numpy as np
    t = np.clip((r - r0) / (r1 - r0), 0.0, 1.0)
    return 1.0 - t * t * (3.0 - 2.0 * t)


def _points_volume(scene, material, *, radius, voxel):
    """An object whose loose-vertex mesh becomes a fog volume of `radius` spheres through Geometry
    Nodes. Its mesh is swapped per frame by _set_points."""
    me = bpy.data.meshes.new('ww')
    ob = bpy.data.objects.new('ww', me)
    scene.collection.objects.link(ob)
    ng = bpy.data.node_groups.new('ww2vol', 'GeometryNodeTree')
    ng.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    gi = ng.nodes.new('NodeGroupInput')
    go = ng.nodes.new('NodeGroupOutput')
    m2p = ng.nodes.new('GeometryNodeMeshToPoints')
    p2v = ng.nodes.new('GeometryNodePointsToVolume')
    sm = ng.nodes.new('GeometryNodeSetMaterial')
    m2p.inputs['Radius'].default_value = radius
    p2v.inputs['Density'].default_value = 1.0
    p2v.inputs['Radius'].default_value = radius
    # 5.0 made the resolution mode a menu socket, not a node property (spike).
    p2v.inputs['Resolution Mode'].default_value = 'Size'
    p2v.inputs['Voxel Size'].default_value = voxel
    sm.inputs['Material'].default_value = material
    L = ng.links.new
    L(gi.outputs[0], m2p.inputs['Mesh'])
    L(m2p.outputs['Points'], p2v.inputs['Points'])
    L(p2v.outputs['Volume'], sm.inputs['Geometry'])
    L(sm.outputs['Geometry'], go.inputs[0])
    ob.modifiers.new('ww2vol', 'NODES').node_group = ng
    return ob


def _set_points(ob, P):
    me = bpy.data.meshes.new('ww')
    me.vertices.add(len(P))
    me.vertices.foreach_set('co', P.ravel())
    me.update()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def render_liquid_sheet(scene, dom, flows, *, sheet, a, sim_frames, ortho, center_z, scatter, bake_s, first_frame,
                        types, z_min, fade=None, radius=0.06, voxel=0.03):
    """A liquid whitewater sheet: the same frames, passes, files and meta.json as render_sheet
    (plus per-frame particle counts), from whitewater_points instead of a VDB. The liquid emits
    nothing, so there is no emission pass."""
    import numpy as np
    picked = _picked(a['frames'], first_frame, sim_frames)
    t = time.time()
    points, counts = {}, []
    # rig.py's liquid sheets render one sim frame per picked frame: a repeat is zero optical flow
    # followed by a double step (review round 1), so set sim_frames = first_frame + frames - 1.
    if len(set(picked)) != len(picked):
        raise ValueError(f'{sheet}: {len(picked)} frames from sim frames {first_frame}..{sim_frames} repeat some')
    for f in sorted(set(picked)):
        points[f], _ = whitewater_points(scene, dom, f, types=types, z_min=z_min, fade=fade)
    for f in picked:
        counts.append(int(len(points[f])))
    extract_s = time.time() - t
    allp = np.concatenate([p for p in points.values() if len(p)]) if any(len(p) for p in points.values()) else None
    for o in [dom, *flows]:
        bpy.data.objects.remove(o)
    scene.frame_set(1)
    ob = _points_volume(scene, scatter, radius=radius, voxel=voxel)

    def load(k, f):
        _set_points(ob, points[f])

    render_s = _render_frames(scene, sheet=sheet, a=a, picked=picked, ortho=ortho, center_z=center_z, load=load)
    meta = _meta(sheet=sheet, a=a, sim='liquid', sim_frames=sim_frames, first_frame=first_frame, picked=picked,
                 ortho=ortho, emission=False, bake_s=bake_s, render_s=render_s)
    meta.update({
        'particles': counts, 'types': list(types), 'zMin': z_min, 'fade': list(fade) if fade else None, 'pointRadius': radius, 'voxel': voxel,
        'extractS': round(extract_s, 1),
        # World-space extent of every rendered point (min xyz, max xyz): the ortho arithmetic's input.
        'pointsBox': [allp.min(0).round(2).tolist(), allp.max(0).round(2).tolist()] if allp is not None else None,
    })
    _write_meta(a, sheet, meta)
