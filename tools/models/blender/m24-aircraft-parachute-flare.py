"""M24 aircraft parachute flare. Original work, AGPL-3.0-or-later.

TM 9-981 (1944) gives 37 in overall length, 8 in diameter and 47 lb. The canister
uses those dimensions. Cap seams, suspension, deployed 6 ft canopy and lamp shape are
ESTIMATES. The canopy is the shared round-canopy builder (parachute.py, 2026-10-14), eight gores. CanopyDeployed and LampBurningMarker are explicit review nodes; the latter is
geometry only and does not implement glow, bloom, smoke or illumination.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from parachute import Canopy  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('m24-aircraft-parachute-flare', skin=512)
diameter = .2032
length = .9398
with m.shared_chart():
    m.revolve('steel', (0, .18, 0), (0, 1, 0), [(0, diameter / 2), (length, diameter / 2)], 20, node='Canister')
    m.revolve('dark', (0, .14, 0), (0, 1, 0), [(0, .07), (.06, .095)], 16, node='LampBurningMarker')
    canopy = Canopy(2.05, .88, .70, gores=8, cols=3, bulge=.07, scallop=.07)
    canopy.build(m, 'underside', 'CanopyDeployed')
    for g in range(canopy.gores):
        h = canopy.hem(g)
        a = 2 * math.pi * (g + .5) / canopy.gores
        m.strut('webbing', (.07 * math.cos(a), 1.12, .07 * math.sin(a)), h, .006, sides=4, node='SuspensionLines')
m.export(out)
