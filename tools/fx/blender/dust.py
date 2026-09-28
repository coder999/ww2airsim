# tools/fx/blender/dust.py
"""The `dust` sheet (design §6.1): gas, smoke only, earth-toned (the tint is the catalog's). Consumers:
land impacts, collapses, `round.land`. A low, wide kick that barely rises. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'dust', 'cache')
SIM_FRAMES = max(8, round(80 * k))
dom = rig.gas_domain(scene, size=(10.0, 10.0, 8.0), center=(0.0, 0.0, 4.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.25, beta=0.0, vorticity=0.2)
src = rig.flow_sphere('kick', radius=1.0, location=(0.0, 0.0, 1.2), flow_type='SMOKE', velocity=(0.0, 0.0, 1.2),
                      velocity_normal=2.5, stop_frame=max(3, round(6 * k)), density=1.0, temperature=0.0)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='dust', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=9.45, center_z=4.0,
                 scatter=rig.scatter_material(density=5.0, albedo=0.6, anisotropy=0.1), bake_s=t)
