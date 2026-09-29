# tools/fx/blender/spray.py
"""The `spray` sheet (design §6.1): a short burst of white spray thrown up and out, which falls and thins.
Mantaflow LIQUID whitewater (spray and foam; the liquid body, its FLIP particles and bubbles are not
drawn), which replaced plan E2 Ruling R4's white gas in Task 6; spray-gas.py is that gas bake, kept as
the fallback. Consumers: crowns, base surge, `round.water`. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

NAME = os.path.splitext(os.path.basename(__file__))[0]
a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], NAME, 'cache')
POOL = 0.5
FIRST = 4
SIM_FRAMES = FIRST + a['frames'] - 1  # one sim frame per picked frame; the last ~20 are the fading tail
dom = rig.liquid_domain(scene, size=(8.0, 8.0, 6.0), center=(0.0, 0.0, 3.0), res=max(32, round(112 * k)),
                        frame_end=SIM_FRAMES, cache=cache, types=('SPRAY', 'FOAM'))
pool = rig.flow_box('pool', size=(7.9, 7.9, POOL), location=(0.0, 0.0, POOL / 2))
# Straddling the surface: a burst under water at 4 m/s never left the pool (trial 1, top z 1.5 m).
burst = rig.flow_sphere('burst', radius=0.6, location=(0.0, 0.0, POOL + 0.05), flow_type='LIQUID', velocity=(0.0, 0.0, 7.0),
                        velocity_normal=5.0, stop_frame=max(2, round(5 * k)), subframes=2)
t = rig.bake(dom)
# The fade keeps the walls' flecks (x, y = +-4 m) out.
rig.render_liquid_sheet(scene, dom, [pool, burst], sheet=NAME, a=a, sim_frames=SIM_FRAMES, first_frame=FIRST,
                        ortho=10.0, center_z=2.4, scatter=rig.scatter_material(density=8.0, albedo=0.95, anisotropy=0.3),
                        bake_s=t, types=('SPRAY', 'FOAM'), z_min=POOL + 0.25, fade=(2.5, 3.5), radius=0.08, voxel=0.04)
