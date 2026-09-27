# tools/models/blender/preview.py
"""Renders a glb to a PNG for a handoff: Cycles on the CPU (nexus is headless; 0.3 s for a
cube at 16 samples, measured 2026-09-26). Not a gate; the Hangar's Tier 2 is the gate from M1 on.
Usage: blender -b --factory-startup --python-exit-code 1 -P preview.py -- <out.png> --glb <in.glb> [--view front|rear|below]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

out, opts = kit.cli_args()
view = opts.get('view', 'front')
if view not in ('front', 'rear', 'below'):
    raise ValueError(f'--view must be front, rear or below, got {view!r}')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=opts['glb'])
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(c[i] for c in corners) for i in range(3)])
hi = Vector([max(c[i] for c in corners) for i in range(3)])
center, radius = (lo + hi) / 2, (hi - lo).length / 2

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1280, 800
scene.render.filepath = out
world = bpy.data.worlds.new('sky')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.65, 0.8, 1.0)
scene.world = world

if view != 'below':
    ground = bpy.data.meshes.new('ground')
    g = radius * 6
    ground.from_pydata([(-g, -g, lo.z), (g, -g, lo.z), (g, g, lo.z), (-g, g, lo.z)], [], [(0, 1, 2, 3)])
    scene.collection.objects.link(bpy.data.objects.new('ground', ground))

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)

# glTF +z (the open end) is Blender -y, so "front" looks from -y toward +y.
side = -1 if view == 'front' else 1
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
# ~3.6 bounding radii out: the default 50 mm lens (about 40 degrees wide) then frames the whole model.
if view == 'below':
    # Beneath and a little forward and aside, looking up at the belly (R3: the Zero's drop-tank cut).
    cam.location = center + Vector((radius * 1.2, -radius * 1.6, -radius * 3.0))
else:
    cam.location = center + Vector((radius * 1.8, side * radius * 2.8, radius * 1.3))
scene.collection.objects.link(cam)
target = bpy.data.objects.new('target', None)
target.location = center
scene.collection.objects.link(target)
track = cam.constraints.new('TRACK_TO')
track.target = target
scene.camera = cam
bpy.ops.render.render(write_still=True)
