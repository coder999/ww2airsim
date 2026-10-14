"""WWII parachuting person and T-7-style rig. Original AGPL work.

TM 1-440 (1942) describes 24, 28 and 22 ft personnel canopies; the 28 ft main
canopy used here is also identified for the wartime T-7 by the DoD air-delivery
handbook. Body proportions, harness routing, suspension spread and pose are ESTIMATES.
Both CanopyOpen and CanopyClosed are explicit review nodes; the closed pack is shown
on the harness while the deployed canopy is the operational silhouette. The inflated
bell/teardrop profile, scalloped fullness, radial ribs and line attachment are ESTIMATES.
CanopyOpen, CanopyRibs and SuspensionLines remain separate nodes so later gameplay can
add low-amplitude wind sway/flutter without animating the Hangar review pose.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('parachuting-person-rig', skin=512)

# 28 ft / 8.5344 m nominal canopy. The skirt tucks inward below the maximum
# diameter, then the crown climbs to a compact apex: a loaded, billowing canopy
# rather than the former shallow disc.
canopy_y = 3.35
profile = [
    (0.00, 3.20), (0.32, 3.88), (0.72, 4.2672), (1.18, 4.08),
    (1.72, 3.48), (2.22, 2.58), (2.62, 1.48), (2.90, .58), (3.02, .08),
]
m.revolve('underside', (0, canopy_y, 0), (0, 1, 0), profile, 40, node='CanopyOpen')

# Twelve curved radial seams make the gore structure readable and reinforce
# the inflated silhouette. They sit just proud of the cloth.
rib_profile = [(t, r + .018) for t, r in profile]
for gore in range(12):
    a = 2 * math.pi * gore / 12
    points = [(math.cos(a) * r, canopy_y + t, math.sin(a) * r) for t, r in rib_profile]
    for p0, p1 in zip(points, points[1:]):
        m.strut('webbing', p0, p1, .012, sides=5, node='CanopyRibs')
m.rounded_box('oliveDrab', (-.24, .90, -.18), .48, .36, .58, .08, node='CanopyClosed')

# Person, head first in the model hierarchy but feet at y=0.
m.revolve('skin', (0, 1.95, 0), (0, 1, 0), [(0, .13), (.28, .13)], 16, node='PersonHead')
m.box('uniform', (-.20, 1.15, -.14), (.40, .80, .28), node='Person')
for z in (-.16, .16):
    m.strut('uniform', (0, 1.45, z), (-.48, .78, z * 1.6), .075, node='Person')
for z in (-.10, .10):
    m.strut('uniform', (0, 1.18, z), (-.18, .05, z * 1.8), .09, node='Person')

# Eight suspension groups open from the harness to the tucked skirt. Keeping
# them in their own node leaves a clean future wind-animation seam.
for line in range(8):
    a = 2 * math.pi * line / 8
    lower = (.18 * math.cos(a), 1.43, .18 * math.sin(a))
    upper = (3.16 * math.cos(a), canopy_y + .03, 3.16 * math.sin(a))
    m.strut('webbing', lower, upper, .012, sides=5, node='SuspensionLines')

m.export(out)
