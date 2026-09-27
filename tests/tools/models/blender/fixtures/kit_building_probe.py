# tests/tools/models/blender/fixtures/kit_building_probe.py -- exercises every R4 building part once,
# each in its own node, spaced 10 m apart along x so a test can take them one at a time.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit

out, opts = kit.cli_args()
m = kit.Model('bprobe')
m.frustum('earth', (0.0, 0.0, 0.0), (6.0, 4.0), (2.0, 1.0), 2.0, node='bprobe_frustum')
m.gable_roof('steel', (10.0, 3.0, 0.0), 4.0, 6.0, 1.5, 0.5, node='bprobe_roof')
m.tank('steel', (20.0, 0.0, 0.0), 2.0, 3.0, 0.5, 16, node='bprobe_tank')
m.tank('concrete', (30.0, 0.0, 0.0), 2.0, 0.5, 0.0, 16, node='bprobe_disc')
m.sandbag_ring('earth', (40.0, 0.0, 0.0), 2.0, 0.8, 1.2, 0.3, 16, node='bprobe_ring')
m.strut('dark', (50.0, 0.0, -2.0), (52.0, 3.0, 2.0), 0.2, 0.1, 6, node='bprobe_strut')
m.gun_barrel('steel', (60.0, 1.0, 0.0), 30.0, 20.0, 4.0, 0.1, sides=8, node='bprobe_barrel')
m.lattice_mast('steel', (70.0, 0.0, 0.0), 3.0, 1.0, 12.0, 4, 0.1, node='bprobe_mast')
m.export(out)
