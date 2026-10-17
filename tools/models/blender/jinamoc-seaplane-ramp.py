"""Jinamoc seaplane ramp: a 220 ft beaching ramp of pre-cast concrete slabs and steel decking. Original work, AGPL-3.0-or-later.

Figures (read 2026-10-16):
  length 220 ft = 67.056 m (plan run)    CITED: Building the Navy's Bases ch. XXIX
                    (https://www.ibiblio.org/hyperwar/NHC/bases/bases-29.htm): the first ramp was a submerged pontoon
                    barge, the permanent ramp 220 ft long, of steel and pre-cast concrete
  width 40 ft = 12.192 m                 ESTIMATE: not in the source (a PBY-5A spans 104 ft)
  slope 1 in 15                          ESTIMATE: the toe's deck is 0.5 m above y=0, the landward end 4.47 m higher
  landward 160 ft: eight 20 ft pre-cast slabs, 0.4 m thick, 0.04 m joints, on a sand-and-earth fill   ESTIMATE split
  seaward 60 ft: 0.1 m steel deck on four H-pile bents 15 ft apart, five piles of 0.35 m each, cap beams   ESTIMATE split
  fill batters 2.0 m each side; concrete headwall 0.6 m thick where the fill ends                    ESTIMATE
  timber curbs 0.25 m square along both edges; two steel beaching-gear rails 2.4 m apart, 0.12 m round; four bollards at the top   ESTIMATE
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Frame: the ramp runs down to +x (the sea), the landward end at -x, +y up, meters; y=0 is the toe's underside (a ground
origin), not the waterline: a placer sets the waterline.
Leaves out: the submerged pontoon-barge first ramp, hardstand, the hauling cradle.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import f4geom as g  # noqa: E402

FOOTPRINT_X_M = 67.062
FOOTPRINT_Z_M = 16.192
HEIGHT_M = 5.35
BASE_Y_M = 0.0

R = 67.056                  # 220 ft
W = 12.192                  # 40 ft
HZ = W / 2
SLOPE = 1.0 / 15.0
TOE_Y = 0.5
X_LAND, X_SEA = -R / 2, R / 2
STEEL_RUN = 18.288          # 60 ft
X_S = X_SEA - STEEL_RUN
SLAB_RUN, SLAB_T, JOINT = 6.096, 0.4, 0.04
DECK_T, BATTER, EMBED_M = 0.1, 2.0, 0.02


def ytop(x):
    return TOE_Y + (X_SEA - x) * SLOPE


def sloped(x0, x1, z0, z1, t, lift=0.0):
    """A slab of vertical thickness t whose top follows the ramp, over [x0, x1] x [z0, z1]."""
    yt = lambda x: ytop(x) + lift
    return [(x0, yt(x0) - t, z0), (x1, yt(x1) - t, z0), (x1, yt(x1) - t, z1), (x0, yt(x0) - t, z1),
            (x0, yt(x0), z0), (x1, yt(x1), z0), (x1, yt(x1), z1), (x0, yt(x0), z1)]


out, opts = kit.cli_args()
m = kit.Model('jinamoc-seaplane-ramp', skin=512)
# Fill under the slabs: flat base, top 0.05 m inside the slab undersides, batters on both sides.
with m.tagged('fill'):
    yb = lambda x: ytop(x) - SLAB_T + 0.05
    a, b = HZ + BATTER, HZ
    v = [(X_LAND, 0.0, -a), (X_S, 0.0, -a), (X_S, 0.0, a), (X_LAND, 0.0, a),
         (X_LAND, yb(X_LAND), -b), (X_S, yb(X_S), -b), (X_S, yb(X_S), b), (X_LAND, yb(X_LAND), b)]
    g.solid(m, 'earth', v, [(0, 1, 2, 3), (4, 7, 6, 5), (0, 3, 7, 4), (1, 5, 6, 2),
                            (0, 1, 5), (0, 5, 4), (3, 7, 6), (3, 6, 2)])
with m.tagged('slabs'):
    n = int(round((X_S - X_LAND) / SLAB_RUN))
    for i in range(n):
        xa = X_LAND + i * SLAB_RUN + JOINT / 2
        xb = X_LAND + (i + 1) * SLAB_RUN - JOINT / 2
        g.hexa(m, 'concrete', sloped(xa, xb, -HZ, HZ, SLAB_T))
    # Headwall where the fill ends, topped 0.12 m under the steel deck.
    m.box('concrete', (X_S + 0.25, 0.0, 0.0), (0.6, ytop(X_S) - 0.12, W))
with m.tagged('deck'):
    g.hexa(m, 'steel', sloped(X_S + 0.02, X_SEA, -HZ, HZ, DECK_T))
with m.tagged('piles'), m.shared_chart():
    for k in range(4):
        xc = X_S + 2.3 + k * 4.572
        cap_top = ytop(xc) - DECK_T + EMBED_M
        m.box('steel', (xc, cap_top - 0.25, 0.0), (0.4, 0.25, W - 0.6))
        for j in range(5):
            z = -HZ + 0.6 + j * (W - 1.2) / 4
            m.box('steel', (xc, 0.0, z), (0.35, cap_top - 0.25 + EMBED_M, 0.35))
with m.tagged('curbs'):
    for s in (-1, 1):
        zc = s * (HZ - 0.15)
        g.hexa(m, 'timber', [(X_LAND, ytop(X_LAND) - EMBED_M, zc - .125), (X_SEA, ytop(X_SEA) - EMBED_M, zc - .125),
                             (X_SEA, ytop(X_SEA) - EMBED_M, zc + .125), (X_LAND, ytop(X_LAND) - EMBED_M, zc + .125),
                             (X_LAND, ytop(X_LAND) + .25, zc - .125), (X_SEA, ytop(X_SEA) + .25, zc - .125),
                             (X_SEA, ytop(X_SEA) + .25, zc + .125), (X_LAND, ytop(X_LAND) + .25, zc + .125)])
with m.tagged('rails'), m.shared_chart():
    for s in (-1, 1):
        m.strut('steel', (X_LAND, ytop(X_LAND) + 0.03, s * 1.2), (X_SEA, ytop(X_SEA) + 0.03, s * 1.2), 0.06, sides=6)
with m.tagged('bollards'), m.shared_chart():
    for zc in (-4.5, -2.0, 2.0, 4.5):
        m.tank('steel', (X_LAND + 3.0, ytop(X_LAND + 3.0) - EMBED_M, zc), 0.2, 0.6, 0.0, 10)
m.marking('grid', tags=['deck'], spacingM=[1.2192, None, 1.2192], widthM=0.02, depth=0.8)
m.export(out)
