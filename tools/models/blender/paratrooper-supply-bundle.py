"""Paratrooper supply bundle with deployed cargo canopy. Original AGPL work.

The form follows wartime cargo-parachute practice but no primary drawing for this
specific bundle was located in the F3 source gate. Bundle dimensions, lashings, 16 ft
canopy, suspension spacing and colors are ESTIMATES. CanopyOpen and CanopyClosed are
named review nodes; the packed canopy is attached to the bundle.
"""
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

m.revolve('underside', (0, 3.0, 0), (0, 1, 0), [(0, .12), (.28, 1.1), (.58, 2.05), (.72, 2.4384)], 28, node='CanopyOpen')
for z in (-.28, .28):
    for x in (-.35, .35):
        m.strut('webbing', (x, 1.25, z), (x * 1.8, 3.02, z * 2.1), .012, node='SuspensionLines')
m.export(out)
