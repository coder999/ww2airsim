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
Leaves out: the rangefinder, the fire-control post, shell hoists, camouflage.
"""
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

out, opts = kit.cli_args()
m = kit.Model('coastal-gun-battery')
for index, side in ((1, -1), (2, 1)):
    zc = side * PIT_Z
    turret = f'Turret{index}'
    m.sandbag_ring('concrete', (PIT_X, 0.0, zc), PIT_IN, PIT_T, 1.5, 0.2, 16)
    m.tank('concrete', (PIT_X, BASE_Y_M, zc), PIT_IN + 0.1, -BASE_Y_M, 0.0, 16)
    m.tank('steel', (PIT_X, 0.0, zc), 1.2, 0.8, 0.0, 16, node=turret)
    m.frustum('steel', (PIT_X, 0.8, zc), (4.0, 3.2), (3.0, 2.8), 2.4, node=turret)
    m.gun_barrel('steel', (PIT_X - 0.5, 1.9, zc), 0.0, ELEVATION, BARREL_M, 0.1, node=turret)
m.frustum('earth', (-5.0, 0.0, 0.0), (8.0, 10.0), (4.0, 6.0), 3.0)
# The muzzle must stay inside the pit's outer edge, or the footprint moves.
assert PIT_X - 0.5 + BARREL_M * 0.99863 + 0.1 * 0.05234 < PIT_X + PIT_IN + PIT_T, 'the muzzle overhangs the pit'
m.export(out)
