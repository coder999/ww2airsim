"""Paratrooper supply bundle with deployed cargo canopy. Original AGPL work.

The form follows wartime cargo-parachute practice but no primary drawing for this
specific bundle was located in the F3 source gate. Bundle dimensions, lashings, 16 ft
canopy, suspension spacing and colors are ESTIMATES. CanopyOpen and CanopyClosed are
named review nodes; the packed canopy is attached to the bundle. The round ellipsoidal
bell, scalloped skirt, billow between the ten gore seams and the corner lugs the
twelve lines gather on are ESTIMATES (shared builder: parachute.py, 2026-10-14 rework
after a review found the earlier canopy read as a flat mushroom). CanopyOpen,
CanopyRibs and SuspensionLines remain separate for later low-amplitude gameplay wind animation.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from parachute import Canopy  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('paratrooper-supply-bundle', skin=512)
# One chart per role: see parachuting-person-rig.py (per-face charts blur the atlas).
with m.shared_chart():
    m.rounded_box('oliveDrab', (0, 0, 0), 1.24, .84, .84, .08, node='Bundle')
    m.rounded_box('underside', (0, .82, 0), .60, .48, .48, .07, node='CanopyClosed')
    for x in (-.35, .35):
        m.box('webbing', (x, 0, 0), (.07, .85, .86), node='Lashings')
    for z in (-.25, .25):
        m.box('webbing', (0, .39, z), (1.26, .07, .07), node='Lashings')
    # Cross straps over the pack and a carrying handle on each end.
    for x in (-.14, .14):
        m.box('webbing', (x, .84, 0), (.04, .50, .50), node='Lashings')
    for sx in (-1, 1):
        m.strut('webbing', (sx * .62, .42, -.12), (sx * .72, .42, -.12), .018, sides=6, node='Lashings')
        m.strut('webbing', (sx * .72, .42, -.12), (sx * .72, .42, .12), .018, sides=6, node='Lashings')
        m.strut('webbing', (sx * .72, .42, .12), (sx * .62, .42, .12), .018, sides=6, node='Lashings')

    # 16 ft cargo canopy, inflated: about 4.6 m across, skirt tucked under the equator.
    canopy_y = 2.95
    canopy = Canopy(canopy_y, 2.2, 2.1, gores=10, cols=3, bulge=.07, scallop=.13)
    canopy.build(m, 'underside', 'CanopyOpen')
    canopy.ribs(m, 'webbing', 'CanopyRibs', .011)

    # Four corner lugs on the bundle top; each takes the lines of the gores above it.
    lugs = {}
    for sx in (-1, 1):
        for sz in (-1, 1):
            lug = (sx * .52, .88, sz * .34)
            lugs[(sx, sz)] = lug
            m.rounded_box('webbing', (lug[0], .84, lug[2]), .09, .09, .06, .02, node='SuspensionLines')
    for g in range(canopy.gores):
        h = canopy.hem(g)
        lug = lugs[(1 if h[0] >= 0 else -1, 1 if h[2] >= 0 else -1)]
        m.strut('webbing', (lug[0], lug[1] + .03, lug[2]), h, .010, sides=4, node='SuspensionLines')
m.export(out)
