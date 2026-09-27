# Exercises ship_hull's two load-bearing station-table guards. The selected
# case fails before export, so the fixture never writes a model.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit

out, opts = kit.cli_args()
case = opts.get('case', 'nonmonotonic')
kit._read.add('case')
m = kit.Model('bad-hull')
if case == 'degenerate':
    m.ship_hull('hull', [(-1, 0.5, 1, 1), (0, 0, 1, 1), (1, 0.5, 1, 1)])
else:
    m.ship_hull('hull', [(-1, 0.5, 1, 1), (1, 1, 1, 1), (0, 0.5, 1, 1)])
m.export(out)
