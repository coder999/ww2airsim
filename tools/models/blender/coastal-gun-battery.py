"""Coast-defense battery: two shielded guns in open concrete pits, an earth-covered magazine behind. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  two guns 24 m apart, 4 m seaward of center                     ESTIMATE
  pit 4.0 m inner radius, 1.0 m wall, 1.5 m high, leaning in 0.2 m; floor 0.3 m deep   ESTIMATE
  pedestal 1.2 m radius x 0.8 m; shield 4.0 x 3.2 m at the foot, 3.0 x 2.8 m at the top, 2.4 m tall   ESTIMATE
  barrel 5.3848 m from the breech, 0.1 m radius, at 3 deg
      CITED: U.S. War Department, Handbook on Japanese Military Forces, TM-E 30-480 (1944),
      chapter IX, section III.4.c, page 237: Model 3 (1914) 12-cm naval gun, tube 17 ft 8 in;
      https://www.ibiblio.org/hyperwar/Japan/IJA/HB/HB-9.html
  magazine mound 8 x 10 m at the foot, 4 x 6 m at the top, 3 m high   ESTIMATE
Frame: the guns point +x (seaward) at rest, +y up, meters; the ground is y=0.
Turret1 (-z) and Turret2 (+z) are the whole guns, named for H3 (Hangar spec §9); a building's turrets
are numbered +x to -x, then -z to +z (R4). No Gun children, no pivots (H3's).
DP3 detail (read 2026-09-29; no period drawing found, every figure an ESTIMATE):
  gun: breech housing 0.8 x 0.5 x 0.5 m, barrel jacket 0.16 m radius over 1.8 m from the breech, muzzle
       swell 0.13 m radius over the last 0.3 m, hand-wheel shaft 0.12 m radius
  shield rivet seams every 0.6 m; pit cap course lines every 0.55 m (rounds) and 0.3 m (courses)
  four ammunition lockers per pit 1.0 x 0.8 x 0.6 m against the wall, ring cap 0.1 m
  concrete ammunition walkway 1.78 m wide between the pits, top 0.05 m above ground
  magazine portal: headwall 1.0 x 2.4 x 3.5 m, doors 0.1 m proud, two vent stacks 0.2 m radius, 0.15 m
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: the rangefinder, the fire-control post, shell hoists, camouflage.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 18.0
FOOTPRINT_Z_M = 34.0
HEIGHT_M = 3.2
BASE_Y_M = -0.3

PIT_X, PIT_Z, PIT_IN, PIT_T = 4.0, 12.0, 4.0, 1.0
BARREL_M, ELEVATION = 5.3848, 3.0
EMBED_M = 0.02

out, opts = kit.cli_args()
m = kit.Model('coastal-gun-battery', skin=512)
el = math.radians(ELEVATION)
d = (math.cos(el), math.sin(el))          # the barrel's direction in the x-y plane
for index, side in ((1, -1), (2, 1)):
    zc = side * PIT_Z
    turret = f'Turret{index}'
    with m.tagged('pit'):
        m.sandbag_ring('concrete', (PIT_X, 0.0, zc), PIT_IN, PIT_T, 1.5, 0.2, 16)
    with m.tagged('floor'):
        m.tank('concrete', (PIT_X, BASE_Y_M, zc), PIT_IN + 0.1, -BASE_Y_M, 0.0, 16)
    with m.tagged('gun'):
        m.tank('steel', (PIT_X, 0.0, zc), 1.2, 0.8, 0.0, 16, node=turret)
        m.frustum('steel', (PIT_X, 0.8, zc), (4.0, 3.2), (3.0, 2.8), 2.4, node=turret)
        bx, by = PIT_X - 0.5, 1.9
        m.gun_barrel('steel', (bx, by, zc), 0.0, ELEVATION, BARREL_M, 0.1, node=turret)
        m.gun_barrel('steel', (bx, by, zc), 0.0, ELEVATION, 1.8, 0.16, node=turret)
        m.gun_barrel('steel', (bx + d[0] * (BARREL_M - 0.3), by + d[1] * (BARREL_M - 0.3), zc), 0.0, ELEVATION, 0.3, 0.13, node=turret)
        m.box('steel', (PIT_X - 0.9, 1.65, zc), (0.8, 0.5, 0.5), node=turret)
        m.strut('steel', (PIT_X - 0.6, 1.5, zc + 0.7), (PIT_X - 0.6, 1.5, zc + 1.05), 0.12, sides=6, node=turret)
    with m.tagged('lockers'), m.shared_chart():
        for dx, dz, w, l in ((0.0, 3.35, 1.0, 0.6), (0.0, -3.35, 1.0, 0.6), (-3.35, 0.0, 0.6, 1.0), (3.35, 0.0, 0.6, 1.0)):
            m.box('dark', (PIT_X + dx, 0.0, zc + dz), (w, 0.8, l))
with m.tagged('walkway'):
    m.box('concrete', (0.01, BASE_Y_M, 0.0), (1.78, 0.35, 2 * PIT_Z))
with m.tagged('mound'):
    m.frustum('earth', (-5.0, 0.0, 0.0), (8.0, 10.0), (4.0, 6.0), 3.0)
with m.tagged('portal'):
    m.box('concrete', (-1.4, BASE_Y_M, 0.0), (1.0, 2.7, 3.5))
with m.tagged('doors'):
    for s in (-1, 1):
        m.box('dark', (-0.85, 0.0, s * 0.5), (0.1, 2.0, 0.98))
    with m.shared_chart():
        for y in (0.4, 1.6):
            m.box('steel', (-0.82 + EMBED_M / 2, y, 0.0), (0.05 + EMBED_M, 0.12, 2.0))
with m.tagged('vents'), m.shared_chart():
    for z in (-1.5, 1.5):
        m.tank('steel', (-5.0, 3.0 - EMBED_M, z), 0.2, 0.15 + EMBED_M, 0.05, 8)
m.marking('grid', tags=['gun'], spacingM=[0.6, 0.6, 0.6], widthM=0.02, depth=0.8)
m.marking('grid', tags=['pit'], spacingM=[0.55, 0.3, 0.55], widthM=0.03, depth=0.8)
m.marking('grid', tags=['walkway'], spacingM=[None, None, 2.0], widthM=0.03, depth=0.8)
m.marking('grid', tags=['portal'], spacingM=[None, 0.6, 1.25], widthM=0.02, depth=0.8)
# The muzzle must stay inside the pit's outer edge, or the footprint moves.
assert PIT_X - 0.5 + BARREL_M * 0.99863 + 0.1 * 0.05234 < PIT_X + PIT_IN + PIT_T, 'the muzzle overhangs the pit'
m.export(out)
