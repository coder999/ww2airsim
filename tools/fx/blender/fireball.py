# tools/fx/blender/fireball.py
"""The `fireball` sheet (design §6.1): gas, fire and smoke from one burst that burns out into smoke.
Consumers: bomb, rocket, crash, kill, structure. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'fireball', 'cache')
SIM_FRAMES = max(8, round(72 * k))
dom = rig.gas_domain(scene, size=(10.0, 10.0, 12.0), center=(0.0, 0.0, 6.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.2, beta=1.2, vorticity=0.3, fire=(0.9, 0.6, 0.6))
src = rig.flow_sphere('charge', radius=1.2, location=(0.0, 0.0, 3.0), flow_type='BOTH', velocity=(0.0, 0.0, 3.0),
                      velocity_normal=6.0, stop_frame=max(3, round(6 * k)), density=0.8, temperature=2.0, fuel=4.5, subframes=2)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='fireball', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=12.6, center_z=6.0,
                 scatter=rig.scatter_material(density=5.0, albedo=0.3, anisotropy=0.2),
                 emission=rig.emission_material(density=5.0, strength=0.17), bake_s=t)
