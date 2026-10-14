"""WWII parachuting person and T-7-style rig. Original AGPL work.

TM 1-440 (1942) describes 24, 28 and 22 ft personnel canopies; the 28 ft main
canopy used here is also identified for the wartime T-7 by the DoD air-delivery
handbook. Body proportions, harness routing, riser and suspension spread and pose are
ESTIMATES, as are the M1-style helmet, jump boots and the back and chest packs.
Both CanopyOpen and CanopyClosed are explicit review nodes; the closed packs are shown
on the harness while the deployed canopy is the operational silhouette. The round
ellipsoidal bell, scalloped skirt, billow between gore seams, twelve gores and the
line-to-riser fan are ESTIMATES (shared builder: parachute.py, 2026-10-14 rework after a
review found the earlier canopy read as a flat mushroom).
CanopyOpen, CanopyRibs and SuspensionLines remain separate nodes so later gameplay can
add low-amplitude wind sway/flutter without animating the Hangar review pose; harness
webbing and risers are part of SuspensionLines. The person faces +x, feet at y=0.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from parachute import Canopy  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('parachuting-person-rig', skin=512)

# Every face shares one chart per role: one chart per face would shrink the atlas texel
# density to nothing and bleed colors across this many small faces (measured 2026-10-14).
with m.shared_chart():
    # 28 ft canopy, inflated: ~8 m across the bell, skirt tucked in under the equator.
    canopy_y = 3.35
    canopy = Canopy(canopy_y, 3.85, 3.7, gores=12, cols=4, bulge=.07, scallop=.22)
    canopy.build(m, 'underside', 'CanopyOpen')
    canopy.ribs(m, 'webbing', 'CanopyRibs', .014)

    # --- Person: facing +x, hanging with the legs slightly forward and hands on the risers.
    SIDES = (-1, 1)
    # Torso: jump jacket skirt, chest, pelvis, neck.
    m.rounded_box('uniform', (0, .80, 0), .34, .44, .32, .10, node='Person')
    m.rounded_box('uniform', (0, 1.08, 0), .30, .43, .52, .10, node='Person')
    m.rounded_box('uniform', (0, .93, 0), .27, .36, .16, .08, node='Person')
    for s in SIDES:
        m.strut('uniform', (0, 1.56, s * .20), (0, 1.66, s * .09), .075, .06, sides=8, node='Person')   # trapezius
        # Pocketed jacket thighs (M42 jump trousers carry big cargo pockets).
        m.box('uniform', (.07, .66, s * .165 - .055), (.11, .20, .11), node='Person')
        # Leg: thigh, knee, shin.
        m.strut('uniform', (.01, 1.00, s * .105), (.13, .60, s * .110), .098, .076, sides=8, node='Person')
        m.strut('uniform', (.13, .60, s * .110), (.04, .30, s * .110), .076, .062, sides=8, node='Person')
        m.revolve('uniform', (.13, .60, s * .110), (0, 0, 1), [(-.075, .074), (.075, .074)], 10, node='Person')
        # Arm: shoulder, elbow, forearm up to the riser.
        m.strut('uniform', (0, 1.58, s * .225), (-.04, 1.78, s * .345), .066, .055, sides=8, node='Person')
        m.strut('uniform', (-.04, 1.78, s * .345), (.12, 2.00, s * .270), .055, .046, sides=8, node='Person')
        m.revolve('uniform', (-.04, 1.78, s * .345), (0, 0, 1), [(-.05, .058), (.05, .058)], 8, node='Person')
        m.revolve('uniform', (0, 1.58, s * .225), (0, 0, 1), [(-.06, .074), (.06, .074)], 10, node='Person')
        # Jump boots: shank, ankle, foot, heel, sole.
        m.strut('boots', (.04, .30, s * .110), (.03, .13, s * .110), .066, .062, sides=8, node='PersonBoots')
        m.strut('boots', (.03, .08, s * .110), (.26, .06, s * .110), .066, .046, sides=8, node='PersonBoots')
        m.box('boots', (.07, 0, s * .110), (.28, .035, .115), node='PersonBoots')
        m.box('boots', (-.03, .02, s * .110), (.10, .09, .12), node='PersonBoots')
        # Hands on the risers.
        m.revolve('skin', (.12, 2.00, s * .270), (0, 1, 0), [(-.05, .035), (.03, .048), (.075, .036)], 8, node='PersonHead')

    # --- Head and neck.
    m.strut('skin', (0, 1.62, 0), (.01, 1.74, 0), .05, sides=8, node='PersonHead')
    m.revolve('skin', (.01, 1.70, 0), (0, 1, 0),
              [(0, .045), (.035, .085), (.09, .105), (.16, .100), (.215, .075), (.245, .035)], 16, node='PersonHead')
    m.box('skin', (.105, 1.77, 0), (.035, .05, .035), node='PersonHead')   # nose
    for s in SIDES:
        m.box('skin', (.01, 1.79, s * .108), (.04, .07, .02), node='PersonHead')   # ears
    # M1-style helmet: dome, rolled rim, chin strap.
    m.revolve('helmet', (.01, 1.83, 0), (0, 1, 0),
              [(0, .150), (.018, .157), (.032, .138), (.07, .132), (.108, .112), (.140, .075), (.158, .025)], 20, node='PersonHelmet')
    for s in SIDES:
        m.strut('webbing', (.04, 1.84, s * .125), (.06, 1.70, s * .06), .010, sides=4, node='SuspensionLines')

    # --- Harness (webbing): shoulder straps, chest strap, waist belt, leg straps, D-rings.
    m.rounded_box('webbing', (0, .985, 0), .295, .395, .05, .09, node='SuspensionLines')
    for s in SIDES:
        for fx in (-1, 1):
            m.strut('webbing', (fx * .015, 1.64, s * .13), (fx * .155, 1.05, s * .12), .024, sides=4, node='SuspensionLines')
        m.revolve('webbing', (.01, .90, s * .108), (.118, -.52, .02), [(0, .105), (.05, .105)], 12, node='SuspensionLines')
        m.box('webbing', (.15, 1.37, s * .12), (.03, .04, .04), node='SuspensionLines')   # chest D-ring
    m.box('webbing', (.145, 1.36, 0), (.025, .03, .26), node='SuspensionLines')

    # --- Packs on the harness. Back pack and chest reserve are the closed canopy.
    m.rounded_box('oliveDrab', (-.215, 1.02, 0), .16, .38, .52, .05, node='CanopyClosed')
    m.rounded_box('oliveDrab', (.205, 1.10, 0), .11, .34, .30, .035, node='CanopyClosed')

    # --- Risers to four connector links above the head, then twelve lines to the skirt.
    links = {}
    for sx in SIDES:
        for sz in SIDES:
            top = (sx * .15, 2.32, sz * .20)
            shoulder = (sx * .06 + .01, 1.66, sz * .20)
            links[(sx, sz)] = top
            m.strut('webbing', shoulder, top, .016, .013, sides=4, node='SuspensionLines')
            m.box('webbing', (top[0], top[1] - .02, top[2]), (.05, .05, .05), node='SuspensionLines')
    for g in range(canopy.gores):
        h = canopy.hem(g)
        sx = 1 if h[0] >= 0 else -1
        sz = 1 if h[2] >= 0 else -1
        top = links[(sx, sz)]
        m.strut('webbing', (top[0], top[1] + .02, top[2]), (h[0], h[1], h[2]), .009, sides=4, node='SuspensionLines')

m.export(out)
