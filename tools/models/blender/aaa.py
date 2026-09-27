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
Leaves out: sights, seats, magazines, a shield, the sandbags' texture.
"""
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

out, opts = kit.cli_args()
m = kit.Model('aaa')
m.sandbag_ring('earth', (0.0, 0.0, 0.0), INNER, RING_T, 1.2, 0.3, 16)
m.tank('concrete', (0.0, BASE_Y_M, 0.0), INNER + 0.1, -BASE_Y_M, 0.0, 16)
m.tank('steel', (0.0, 0.0, 0.0), 0.35, 1.0, 0.0, 12, node='Turret1')
m.box('steel', (0.0, 1.0, 0.0), (1.0, 0.5, 0.9), node='Turret1')
for dz in (-0.2, 0.2):
    m.gun_barrel('steel', (-0.3, 1.3, dz), 0.0, 30.0, 1.5, 0.06, node='Turret1')
for dz in (-1.2, 1.2):
    m.box('dark', (-1.2, 0.0, dz), (0.8, 0.5, 0.4))
# The boxes' outer corners (x -1.6, |z| 1.4) must clear the ring's inner face.
assert (1.6 ** 2 + 1.4 ** 2) ** 0.5 < INNER, 'the ammunition boxes must stand inside the pit'
m.export(out)
