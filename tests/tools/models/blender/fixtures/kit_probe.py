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
m.export(out)
