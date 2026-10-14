"""M24 aircraft parachute flare. Original work, AGPL-3.0-or-later.

TM 9-981 (1944) gives 37 in overall length, 8 in diameter and 47 lb. The canister
uses those dimensions. Cap seams, suspension, deployed 6 ft canopy and lamp shape are
ESTIMATES. CanopyDeployed and LampBurningMarker are explicit review nodes; the latter is
geometry only and does not implement glow, bloom, smoke or illumination.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('m24-aircraft-parachute-flare', skin=512)
diameter = .2032
length = .9398
m.revolve('steel', (0, .18, 0), (0, 1, 0), [(0, diameter / 2), (length, diameter / 2)], 20, node='Canister')
m.revolve('dark', (0, .14, 0), (0, 1, 0), [(0, .07), (.06, .095)], 16, node='LampBurningMarker')
m.revolve('underside', (0, 2.1, 0), (0, 1, 0), [(0, .05), (.16, .55), (.30, .9144)], 24, node='CanopyDeployed')
for x in (-.06, .06):
    for z in (-.06, .06):
        m.strut('webbing', (x, 1.12, z), (x * 5, 2.12, z * 5), .008, node='SuspensionLines')
m.export(out)
