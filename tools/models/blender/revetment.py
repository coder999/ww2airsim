"""Aircraft revetment: a U of earth blast walls around one fighter's bay, open to +x. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  bay 14 m deep (x) by 18 m wide (z), open at +x   ESTIMATE, sized to clear a single-engine fighter of about 12 m span
  walls 3 m high, 6 m at the foot, 1.5 m at the top   ESTIMATE
  bay floor 0.2 m deep                             ESTIMATE
Frame: the open end faces +x, +y up, meters; the bay floor's top is y=0.
DP3 detail (read 2026-09-29; no period drawing found, every figure an ESTIMATE):
  sandbag crest 0.3 m high, 1.3 m wide, bags 0.52 x 0.3 x 0.3 m on a 0.54 m pitch, two lanes half a bag apart
  wheel-stop beam 0.25 m square, timber, 3 m in from the back wall
  tie-down pads 0.6 x 0.6 m, ring 0.3 m, six around the bay floor; floor joints every 3 m
  apron lip 1.0 m wide, 0.08 m proud of the bay floor, at the open end
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: the taxiway spur, camouflage netting. The lower slopes overlap internally at
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
CREST_H = 0.3                        # the sandbag course on top of each earth wall
BAG_L, BAG_PITCH, BAG_W = 0.52, 0.54, 0.65
EMBED_M = 0.02
WALL_H = HEIGHT_M - CREST_H

out, opts = kit.cli_args()
m = kit.Model('revetment', skin=512)
side_len = BAY_X + FOOT - TOP        # miter the side's upper rear edge to the back wall's inner top edge
side_cx = BAY_X / 2 - side_len / 2   # keep the lower open-end toe at +BAY_X / 2
back_cx = -BAY_X / 2 - FOOT / 2
with m.tagged('earth'):
    m.frustum('earth', (back_cx, 0.0, 0.0), (FOOT, FOOTPRINT_Z_M), (TOP, FOOTPRINT_Z_M - RUN), WALL_H)
    for s in (-1, 1):
        m.frustum('earth', (side_cx, 0.0, s * (BAY_Z / 2 + FOOT / 2)), (side_len, FOOT), (side_len - RUN, TOP), WALL_H)
with m.tagged('floor'):
    m.box('concrete', (0.0, BASE_Y_M, 0.0), (BAY_X, -BASE_Y_M, BAY_Z))
assert BAY_X / 2 - (-BAY_X / 2 - FOOT) == FOOTPRINT_X_M and BAY_Z + 2 * FOOT == FOOTPRINT_Z_M, 'the footprint is the walls\' outer toes'


def bags(cx, cz, length, along_x):
    """Two lanes of sandbags across the wall top, running `length` along x or z, centered on (cx, cz)."""
    n = int(length // BAG_PITCH)
    for lane in (-1, 1):
        for i in range(n):
            t = -length / 2 + (i + 0.5 + (0.25 if lane > 0 else -0.25)) * (length / n)
            t = max(-length / 2 + BAG_L / 2, min(length / 2 - BAG_L / 2, t))
            h = CREST_H - 0.02 * ((i * 5 + (3 if lane > 0 else 0)) % 3)   # bags settle unevenly
            off = lane * (BAG_W / 2 + 0.01)
            size = (BAG_L, h + EMBED_M, BAG_W - 0.02) if along_x else (BAG_W - 0.02, h + EMBED_M, BAG_L)
            at = (cx + t, WALL_H - EMBED_M, cz + off) if along_x else (cx + off, WALL_H - EMBED_M, cz + t)
            m.box('earth', at, size)


with m.tagged('sandbags'), m.shared_chart():
    bags(back_cx, 0.0, FOOTPRINT_Z_M - RUN - 0.1, False)
    for s in (-1, 1):
        # Side crests start clear of the back crest's end so no two bag tops overlap.
        x0, x1 = back_cx + TOP / 2 + 0.1, side_cx + (side_len - RUN) / 2 - 0.05
        bags((x0 + x1) / 2, s * (BAY_Z / 2 + FOOT / 2), x1 - x0, True)
with m.tagged('fittings'):
    with m.shared_chart():
        m.box('timber', (-BAY_X / 2 + 3.0, -EMBED_M, 0.0), (0.25, 0.25 + EMBED_M, BAY_Z - 2.0))
        for x in (-BAY_X / 2 + 3.0, ):
            for z in (-BAY_Z / 2 + 1.0, BAY_Z / 2 - 1.0):
                m.box('timber', (x, -EMBED_M, z), (0.4, 0.4 + EMBED_M, 0.4))
    with m.shared_chart():
        for x in (-BAY_X / 4, BAY_X / 4 + 1.0):
            for z in (-BAY_Z / 2 + 1.5, BAY_Z / 2 - 1.5, 0.0):
                m.box('concrete', (x, -EMBED_M, z), (0.6, 0.05 + EMBED_M, 0.6))
                m.box('dark', (x, 0.05 - EMBED_M, z), (0.3, 0.06 + EMBED_M, 0.3))
    m.box('concrete', (BAY_X / 2 - 0.5 - EMBED_M, -EMBED_M, 0.0), (1.0, 0.08 + EMBED_M, BAY_Z - 0.04))
m.marking('grid', tags=['floor'], spacingM=[3.0, None, 3.0], widthM=0.04, depth=0.8)
m.export(out)
