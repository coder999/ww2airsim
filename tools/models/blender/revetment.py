"""Aircraft revetment: a U of earth blast walls around one fighter's bay, open to +x. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  bay 14 m deep (x) by 18 m wide (z), open at +x   ESTIMATE, sized to clear a single-engine fighter of about 12 m span
  walls 3 m high, 6 m at the foot, 1.5 m at the top   ESTIMATE
  bay floor 0.2 m deep                             ESTIMATE
Frame: the open end faces +x, +y up, meters; the bay floor's top is y=0.
Leaves out: the taxiway spur, tie-downs, camouflage netting. The lower slopes overlap internally at
the rear corners; their exposed upper edges meet without duplicate top faces.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 20.0
FOOTPRINT_Z_M = 30.0
HEIGHT_M = 3.0
BASE_Y_M = -0.2

BAY_X, BAY_Z = 14.0, 18.0
FOOT, TOP = 6.0, 1.5
RUN = FOOT - TOP                     # both slopes of a wall together, also used at its ends

out, opts = kit.cli_args()
m = kit.Model('revetment')
m.frustum('earth', (-BAY_X / 2 - FOOT / 2, 0.0, 0.0), (FOOT, FOOTPRINT_Z_M), (TOP, FOOTPRINT_Z_M - RUN), HEIGHT_M)
side_len = BAY_X + FOOT - TOP        # miter the side's upper rear edge to the back wall's inner top edge
side_cx = BAY_X / 2 - side_len / 2   # keep the lower open-end toe at +BAY_X / 2
for s in (-1, 1):
    m.frustum('earth', (side_cx, 0.0, s * (BAY_Z / 2 + FOOT / 2)), (side_len, FOOT), (side_len - RUN, TOP), HEIGHT_M)
m.box('concrete', (0.0, BASE_Y_M, 0.0), (BAY_X, -BASE_Y_M, BAY_Z))
assert BAY_X / 2 - (-BAY_X / 2 - FOOT) == FOOTPRINT_X_M and BAY_Z + 2 * FOOT == FOOTPRINT_Z_M, 'the footprint is the walls\' outer toes'
m.export(out)
