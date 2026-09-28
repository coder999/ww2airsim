# tools/fx/blender/water-column-gas.py
"""The `water-column` sheet's gas fallback (design §6.1): a near-miss column as dense, forward-scattering
white gas that shoots up and falls back (negative density buoyancy). Plan E2 Ruling R4 made this the
shipped bake; Task 6 replaced it with water-column.py's Mantaflow liquid whitewater and keeps this one
beside it (FX_VARIANT=gas) for a side-by-side, and to ship if the liquid bake is blocked.
Consumers: `bomb.water`, `rocket.water`, `crash.water`. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

# The output directory is the script's own name (water-column-gas), which is what render.ts's
# FX_VARIANT=gas fetches; renamed to water-column.py it would write the shipped sheet.
NAME = os.path.splitext(os.path.basename(__file__))[0]
a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], NAME, 'cache')
SIM_FRAMES = max(8, round(72 * k))
dom = rig.gas_domain(scene, size=(6.0, 6.0, 14.0), center=(0.0, 0.0, 7.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=-1.2, beta=0.0, vorticity=0.25)
src = rig.flow_sphere('column', radius=0.7, location=(0.0, 0.0, 1.0), flow_type='SMOKE', velocity=(0.0, 0.0, 14.0),
                      stop_frame=max(3, round(6 * k)), density=1.0, temperature=0.0, subframes=3)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet=NAME, a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=14.7, center_z=7.0,
                 scatter=rig.scatter_material(density=10.0, albedo=0.95, anisotropy=0.5), bake_s=t)
