# tools/fx/blender/smoke.py
"""The `smoke` sheet (design §6.1): gas, smoke only, dark and oily. Consumers: smoke columns,
engine smoke, the kill trail, the ship plume. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'smoke', 'cache')
SIM_FRAMES = max(8, round(96 * k))
dom = rig.gas_domain(scene, size=(8.0, 8.0, 10.0), center=(0.0, 0.0, 5.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.6, beta=0.4, vorticity=0.15)
src = rig.flow_sphere('puff', radius=0.9, location=(0.0, 0.0, 1.6), flow_type='SMOKE',
                      velocity=(0.0, 0.0, 2.5), stop_frame=max(3, round(10 * k)), density=1.0, temperature=1.0)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='smoke', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=10.5, center_z=5.0,
                 scatter=rig.scatter_material(density=6.0, albedo=0.35, anisotropy=0.2), bake_s=t)
