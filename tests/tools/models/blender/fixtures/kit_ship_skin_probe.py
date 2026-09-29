# A skinned ship probe (DP2 Task 6): kit_ship_probe.py's hull and gunhouses, skinned at 1024.
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit  # noqa: E402

out, _opts = kit.cli_args()
m = kit.Model('shp', skin=1024)
with m.tagged('hull'):
    m.hull_lines('hull', [(-30.0, 0.5, 1.5, 5.0, 0.4), (-20.0, 4.0, 2.8, 4.6, 4.2), (10.0, 5.0, 3.0, 4.5, 5.0),
                          (25.0, 3.0, 2.8, 4.8, 3.6), (30.0, 0.3, 2.0, 5.2, 0.6)],
                 deck_role='deck', deck_node='MainDeck', below_role='antifouling', below_node='Bottom', subdivide=3)
with m.tagged('turrets'):
    m.naval_turret('fitting', 1, (15.0, m.hull_at(15.0)[2] - 0.02, 0.0), 1, (4.0, 3.5, 1.6), 2, 5.0, 0.12, bag_length=0.5)
    m.naval_turret('fitting', 2, (-15.0, m.hull_at(-15.0)[2] - 0.02, 0.0), -1, (4.0, 3.5, 1.6), 3, 5.0, 0.12, elevation_deg=10.0)
m.export(out)
