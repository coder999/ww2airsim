# Exercises the R4 building parts' argument guards. The selected case fails before export,
# so the fixture never writes a model.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit

out, opts = kit.cli_args()
case = opts.get('case', '')
kit._read.add('case')
m = kit.Model('bad-building')
cases = {
    'frustum-upper': lambda: m.frustum('earth', (0.0, 0.0, 0.0), (2.0, 2.0), (3.0, 1.0), 1.0),
    'roof-rise': lambda: m.gable_roof('steel', (0.0, 0.0, 0.0), 4.0, 6.0, 0.0),
    'tank-segments': lambda: m.tank('steel', (0.0, 0.0, 0.0), 1.0, 1.0, 0.0, 2),
    'ring-batter': lambda: m.sandbag_ring('earth', (0.0, 0.0, 0.0), 2.0, 0.5, 1.0, 0.5),
    'strut-zero': lambda: m.strut('dark', (1.0, 1.0, 1.0), (1.0, 1.0, 1.0), 0.1),
    'barrel-elevation': lambda: m.gun_barrel('steel', (0.0, 0.0, 0.0), 0.0, 90.0, 2.0, 0.05),
    'mast-top': lambda: m.lattice_mast('steel', (0.0, 0.0, 0.0), 1.0, 2.0, 5.0, 2, 0.05),
}
if case not in cases:
    raise ValueError(f'--case must be one of {sorted(cases)}, got {case!r}')
cases[case]()
m.export(out)
