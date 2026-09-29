"""Light anti-aircraft gun pit: a twin automatic-cannon mount in a sandbag ring. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-27):
  footprint 6 x 6 m   content/bases/tacloban.json, tacloban-aaa-1 (the sim is authoritative; that file's
                      reference note calls it a round gameplay figure): the ring's outer diameter
  ring 0.8 m thick at the foot, 1.2 m high, leaning in 0.3 m     ESTIMATE
  pit floor 0.2 m deep, tucked 0.1 m under the ring               ESTIMATE
  pedestal 0.35 m radius, 1.0 m; cradle 1.0 x 0.5 x 0.9 m         ESTIMATE
  two barrels 1.5 m from the breech, 0.06 m radius, 0.4 m apart, at 30 deg
      CITED (secondary): Wikipedia, "Type 96 25 mm AT/AA gun", infobox part_length = 1.5 m (L/60),
      https://en.wikipedia.org/wiki/Type_96_25_mm_AT/AA_gun
  two ready-ammunition boxes 0.8 x 0.5 x 0.4 m                    ESTIMATE
Frame: the guns point +x at rest, +y up, meters; the ground is y=0.
Turret1 is the whole mount, named for H3 (Hangar spec §9). A building's turrets are numbered +x to -x,
then -z to +z (R4). The barrels are part of Turret1: no Gun children, no pivot (H3's).
DP3 detail (read 2026-09-29; no period drawing found, every figure an ESTIMATE):
  base plate 0.5 m radius, 0.06 m; top magazine 0.35 x 0.3 x 0.25 m; shield 0.05 x 1.0 x 1.1 m at x 0.5;
  recoil jackets 0.09 m radius over the first 0.6 m of each barrel; sight post; seat post 0.7 m with a 0.3 m seat
  three timber steps 0.2 m apart on the pit's +x wall; duckboards 2.4 x 0.25 m at z +-0.7
  four camouflage-net posts 0.05 m radius, 2.0 m high, on the ring top at 45 deg; sandbag course lines every 0.3 m
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Leaves out: the sandbags as individual bags, ammunition in the boxes.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOTPRINT_X_M = 6.0
FOOTPRINT_Z_M = 6.0
HEIGHT_M = 2.102
BASE_Y_M = -0.2

RING_T = 0.8
INNER = FOOTPRINT_X_M / 2 - RING_T
EMBED_M = 0.02

out, opts = kit.cli_args()
m = kit.Model('aaa', skin=512)
with m.tagged('ring'):
    m.sandbag_ring('earth', (0.0, 0.0, 0.0), INNER, RING_T, 1.2, 0.3, 16)
with m.tagged('floor'):
    m.tank('concrete', (0.0, BASE_Y_M, 0.0), INNER + 0.1, -BASE_Y_M, 0.0, 16)
with m.tagged('mount'):
    m.tank('steel', (0.0, 0.0, 0.0), 0.35, 1.0, 0.0, 12, node='Turret1')
    m.tank('steel', (0.0, -EMBED_M, 0.0), 0.5, 0.06 + EMBED_M, 0.0, 12, node='Turret1')
    m.box('steel', (0.0, 1.0, 0.0), (1.0, 0.5, 0.9), node='Turret1')
    m.box('steel', (0.1, 1.5 - EMBED_M, 0.0), (0.35, 0.3 + EMBED_M, 0.25), node='Turret1')
    m.box('steel', (0.5, 1.0, 0.0), (0.05, 1.0, 1.1), node='Turret1')
    for dz in (-0.2, 0.2):
        m.gun_barrel('steel', (-0.3, 1.3, dz), 0.0, 30.0, 1.5, 0.06, node='Turret1')
        m.gun_barrel('steel', (-0.3, 1.3, dz), 0.0, 30.0, 0.6, 0.09, sides=8, node='Turret1')
    m.strut('steel', (-0.2, 1.5, 0.3), (-0.2, 1.75, 0.3), 0.03, sides=4, node='Turret1')
    m.strut('steel', (-0.9, 0.0, 0.0), (-0.9, 0.7, 0.0), 0.03, sides=4, node='Turret1')
    m.box('steel', (-0.9, 0.7 - EMBED_M, 0.0), (0.3, 0.05 + EMBED_M, 0.3), node='Turret1')
with m.tagged('ammo'), m.shared_chart():
    for dz in (-1.2, 1.2):
        m.box('dark', (-1.2, 0.0, dz), (0.8, 0.5, 0.4))
# The boxes' outer corners (x -1.6, |z| 1.4) must clear the ring's inner face.
assert (1.6 ** 2 + 1.4 ** 2) ** 0.5 < INNER, 'the ammunition boxes must stand inside the pit'
with m.tagged('timber'), m.shared_chart():
    for k in range(3):
        w = 0.6 - 0.2 * k   # each higher step is shorter, so the three read as a stair against the wall
        m.box('timber', (INNER - w / 2 + EMBED_M, 0.0, 0.0), (w + EMBED_M, 0.2 * (k + 1), 0.6))
    for z in (-0.7, 0.7):
        m.box('timber', (0.5, -EMBED_M, z), (2.4, 0.06 + EMBED_M, 0.25))
    for a in (45, 135, 225, 315):
        r = INNER + RING_T * 0.6
        c, sn = math.cos(math.radians(a)) * r, math.sin(math.radians(a)) * r
        m.strut('timber', (c, 1.2 - 0.1, sn), (c, 2.0, sn), 0.05, sides=4)
m.marking('grid', tags=['ring'], spacingM=[0.55, 0.3, 0.55], widthM=0.03, depth=0.8)
m.export(out)
