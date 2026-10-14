"""WWII parachuting person and T-7-style rig. Original AGPL work.

TM 1-440 (1942) describes 24, 28 and 22 ft personnel canopies; the 28 ft main
canopy used here is also identified for the wartime T-7 by the DoD air-delivery
handbook. Body proportions, harness routing, suspension spread and pose are ESTIMATES.
Both CanopyOpen and CanopyClosed are explicit review nodes; the closed pack is shown
on the harness while the deployed canopy is the operational silhouette.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('parachuting-person-rig', skin=512)

# 28 ft / 8.5344 m nominal canopy, shallow hemispherical section.
profile = [(0, .15), (.35, 1.8), (.75, 3.15), (1.05, 4.05), (1.22, 4.2672)]
m.revolve('underside', (0, 3.4, 0), (0, 1, 0), profile, 32, node='CanopyOpen')
m.rounded_box('oliveDrab', (-.24, .90, -.18), .48, .36, .58, .08, node='CanopyClosed')

# Person, head first in the model hierarchy but feet at y=0.
m.revolve('skin', (0, 1.95, 0), (0, 1, 0), [(0, .13), (.28, .13)], 16, node='PersonHead')
m.box('uniform', (-.20, 1.15, -.14), (.40, .80, .28), node='Person')
for z in (-.16, .16):
    m.strut('uniform', (0, 1.45, z), (-.48, .78, z * 1.6), .075, node='Person')
for z in (-.10, .10):
    m.strut('uniform', (0, 1.18, z), (-.18, .05, z * 1.8), .09, node='Person')

for z in (-.42, .42):
    for x in (-.20, .20):
        m.strut('webbing', (x, 1.45, z * .25), (x, 3.42, z), .012, node='SuspensionLines')

m.export(out)
