# tools/fx/blender/spray-gas.py
"""The `spray` sheet's gas fallback (design §6.1): a burst of white mist that falls and fades. Plan E2
Ruling R4 made this the shipped bake; Task 6 replaced it with spray.py's Mantaflow liquid whitewater
and keeps this one beside it (FX_VARIANT=gas) for a side-by-side, and to ship if the liquid bake is
blocked. Consumers: crowns, base surge, `round.water`. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

# The output directory is the script's own name (see water-column-gas.py).
NAME = os.path.splitext(os.path.basename(__file__))[0]
a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], NAME, 'cache')
SIM_FRAMES = max(8, round(48 * k))
dom = rig.gas_domain(scene, size=(8.0, 8.0, 8.0), center=(0.0, 0.0, 4.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=-0.8, beta=0.0, vorticity=0.3, dissolve=30)
src = rig.flow_sphere('burst', radius=0.6, location=(0.0, 0.0, 2.5), flow_type='SMOKE', velocity=(0.0, 0.0, 3.0),
                      velocity_normal=4.0, stop_frame=max(2, round(4 * k)), density=1.0, temperature=0.0, subframes=2)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet=NAME, a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=8.4, center_z=4.0,
                 scatter=rig.scatter_material(density=8.0, albedo=0.95, anisotropy=0.5), bake_s=t)
