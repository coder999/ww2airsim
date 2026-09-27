# tests/tools/models/blender/fixtures/kit_probe.py -- exercises every kit primitive once.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit

out, opts = kit.cli_args()
m = kit.Model('probe')
m.box('concrete', (0.0, 0.0, 0.0), (2.0, 1.0, 4.0))
m.barrel_vault('steel', (10.0, 1.0, 0.0), 6.0, 1.5, 8.0, 0.2, 12)
m.arch_gable('steel', (20.0, 0.0, 0.0), 6.0, 1.0, 1.5, 0.3, 12)
m.box('dark', (0.0, 0.0, 10.0), (1.0, 1.0, 1.0), node='probe_door')
m.ship_hull('hull', [(-30.0, 0.5, 3.0, 2.5, 0.5), (0.0, 5.0, 4.0, 3.0), (30.0, 0.8, 3.0, 2.5, 0.5)], node='probe_hull')
m.ship_hull('hull', [(-30.0, 0.5, 3.0, 2.5, 0.5), (0.0, 5.0, 4.0, 3.0), (30.0, 0.8, 3.0, 2.5, 0.5)], node='probe_hull2',
            deck_role='deck', deck_node='probe_hull2_deck')
m.deck('deck', (0.0, 20.0), 12.0, 6.0, 4.0, 0.25, node='probe_deck')
m.tapered_box('superstructure', (0.0, 4.0, 20.0), (6.0, 4.0), (4.0, 3.0), 3.0, node='probe_bridge')
m.cylinder('fitting', (0.0, 7.0, 20.0), 0.4, 5.0, 8, node='probe_mast')
m.turret('fitting', 2, (-8.0, 4.0, 20.0), -1, (3.0, 2.5, 1.2), 3.0, 2)
m.turret('fitting', 1, (8.0, 4.0, 20.0), 1, (3.0, 2.5, 1.2), 3.0, 2)
m.export(out)
