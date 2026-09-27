# tools/fx/blender/probe.py
"""Can this Blender draw a Mantaflow grid in Cycles? (plan E2 Ruling R1). Writes {"coveredPx": n}
to the done file; tools/fx/remote.ts assertProbe refuses 0. Original work, AGPL-3.0-or-later."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import rig  # noqa: E402

a = rig.args()
a['frames'], a['cell'], a['samples'] = 1, 64, 8
scene = rig.reset()
cache = os.path.join(a['out'], 'cache')
dom = rig.gas_domain(scene, size=(4.0, 4.0, 4.0), center=(0.0, 0.0, 2.0), res=32, frame_end=12, cache=cache,
                     alpha=1.0, beta=1.0)
src = rig.flow_sphere('probe', radius=0.4, location=(0.0, 0.0, 0.8), flow_type='SMOKE', velocity=(0.0, 0.0, 1.0))
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='probe', a=a, cache=cache, sim_frames=12, ortho=4.2, center_z=2.0,
                 scatter=rig.scatter_material(density=6.0, albedo=0.8, anisotropy=0.0), bake_s=t)
img = bpy.data.images.load(os.path.join(a['out'], 'probe', 'f00', 'front.png'))
# img.pixels is a bpy_prop_array: it does not support extended (step) slicing,
# so list() first (measured 2026-09-27: TypeError on img.pixels[3::4] directly).
covered = sum(1 for x in list(img.pixels)[3::4] if x > 0.03)
with open(a['done'], 'w') as fh:
    json.dump({'coveredPx': covered}, fh)
