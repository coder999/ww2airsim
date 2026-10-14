"""Paratrooper supply bundle with deployed cargo canopy. Original AGPL work.

The form follows wartime cargo-parachute practice but no primary drawing for this
specific bundle was located in the F3 source gate. Bundle dimensions, lashings, 16 ft
canopy, suspension spacing and colors are ESTIMATES. CanopyOpen and CanopyClosed are
named review nodes; the packed canopy is attached to the bundle. The inflated
bell/teardrop profile and radial ribs are ESTIMATES. CanopyOpen, CanopyRibs and
SuspensionLines remain separate for later low-amplitude gameplay wind animation.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('paratrooper-supply-bundle', skin=512)
m.rounded_box('oliveDrab', (-.62, 0, -.42), 1.24, .84, .84, .08, node='Bundle')
m.rounded_box('underside', (-.30, .82, -.24), .60, .48, .48, .07, node='CanopyClosed')
for x in (-.35, .35):
    m.box('webbing', (x - .035, 0, -.43), (.07, .85, .86), node='Lashings')
for z in (-.25, .25):
    m.box('webbing', (-.63, .39, z - .035), (1.26, .07, .07), node='Lashings')

canopy_y = 2.90
profile = [
    (0.00, 1.78), (0.24, 2.22), (0.48, 2.4384), (0.78, 2.30),
    (1.12, 1.92), (1.44, 1.36), (1.70, .70), (1.84, .08),
]
m.revolve('underside', (0, canopy_y, 0), (0, 1, 0), profile, 32, node='CanopyOpen')
for gore in range(10):
    a = 2 * math.pi * gore / 10
    points = [(math.cos(a) * (r + .014), canopy_y + t, math.sin(a) * (r + .014)) for t, r in profile]
    for p0, p1 in zip(points, points[1:]):
        m.strut('webbing', p0, p1, .010, sides=5, node='CanopyRibs')
for line in range(8):
    a = 2 * math.pi * line / 8
    lower = (.38 * math.cos(a), 1.27, .28 * math.sin(a))
    upper = (1.76 * math.cos(a), canopy_y + .03, 1.76 * math.sin(a))
    m.strut('webbing', lower, upper, .010, sides=5, node='SuspensionLines')
m.export(out)
