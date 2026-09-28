# tools/fx/blender/flame.py
"""The `flame` sheet (design §6.1): a small steady fire, rendered as consecutive frames after a warm-up
so the pack can crossfade it into a loop (plan E2 Ruling R7). Consumers: the rocket motor, `ship.fire`.
Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'flame', 'cache')
FIRST = max(4, round(40 * k))
SIM_FRAMES = FIRST + a['frames'] - 1
dom = rig.gas_domain(scene, size=(4.0, 4.0, 8.0), center=(0.0, 0.0, 4.0), res=max(32, round(128 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.1, beta=1.5, vorticity=0.4, dissolve=15, fire=(0.75, 0.8, 0.8))
src = rig.flow_sphere('burner', radius=0.6, location=(0.0, 0.0, 0.9), flow_type='FIRE', velocity=(0.0, 0.0, 1.0),
                      fuel=1.2, temperature=1.5, subframes=1)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='flame', a=a, cache=cache, sim_frames=SIM_FRAMES, first_frame=FIRST,
                 ortho=8.4, center_z=4.0, scatter=rig.scatter_material(density=9.0, albedo=0.3, anisotropy=0.1),
                 emission=rig.emission_material(density=9.0, strength=10.0), bake_s=t)
