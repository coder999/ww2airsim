# tools/fx/blender/water-column.py
"""The `water-column` sheet (design §6.1): a near-miss column, a tall narrow cone of aerated white water
with a spray fringe that rises and collapses. Mantaflow LIQUID whitewater (spray and foam; the liquid
body, its FLIP particles and bubbles are not drawn), which replaced plan E2 Ruling R4's white gas in
Task 6; water-column-gas.py is that gas bake, kept as the fallback. Consumers: `bomb.water`,
`rocket.water`, `crash.water`. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

NAME = os.path.splitext(os.path.basename(__file__))[0]
a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], NAME, 'cache')
POOL = 0.5  # water depth, m; the domain floor is z 0
FIRST = 5  # whitewater takes a few frames to appear, and frame 0 must not be empty
SIM_FRAMES = FIRST + a['frames'] - 1  # one sim frame per picked frame, as flame.py
# 6 m wide, so the pool's wave, reflected off the walls, returns after the sheet ends (at 4 m it
# threw up a second surge in the last frames); 11 m tall, above the frame's 10.8 m top, so no
# fleck leaves the sim inside the frame (at 9 m the jet's flecks reached 8.95). res 137 keeps
# trial 3's ~8 cm cells. Whitewater lives 6..18 frames, not 10..30, so flecks thrown sideways die
# before they spread the peak frame's base (the aspect rule is on the peak-coverage frame).
dom = rig.liquid_domain(scene, size=(6.0, 6.0, 11.0), center=(0.0, 0.0, 5.5), res=max(32, round(137 * k)),
                        frame_end=SIM_FRAMES, cache=cache, types=('SPRAY', 'FOAM'), life=(6.0, 18.0))
# The pool fills the domain wall to wall: a 5 cm gap at each wall splashed (trial 2).
pool = rig.flow_box('pool', size=(6.0, 6.0, POOL), location=(0.0, 0.0, POOL / 2))
jet = rig.flow_sphere('jet', radius=0.35, location=(0.0, 0.0, 0.35), flow_type='LIQUID', velocity=(0.0, 0.0, 13.0),
                      stop_frame=max(3, round(6 * k)), subframes=2)
t = rig.bake(dom)
# z_min culls the foam skirt on the pool surface, which otherwise makes the peak frame wide and flat;
# the radial fade drops the flecks the closed walls throw up, softly, so it draws no edge.
# Anisotropy 0.3, not the spike's 0.5: at 0.5 the back pass clipped 12-34% of covered texels (spike trap 3).
rig.render_liquid_sheet(scene, dom, [pool, jet], sheet=NAME, a=a, sim_frames=SIM_FRAMES, first_frame=FIRST,
                        ortho=12.0, center_z=4.8, scatter=rig.scatter_material(density=8.0, albedo=0.95, anisotropy=0.3),
                        bake_s=t, types=('SPRAY', 'FOAM'), z_min=POOL + 0.4, fade=(1.5, 2.5))
