# Exercises the aircraft parts' load-bearing guards. The selected case fails before export.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit

out, opts = kit.cli_args()
case = opts.get('case', 'fuselage-order')
kit._read.add('case')
m = kit.Model('bad-aircraft')
if case == 'fuselage-order':
    m.fuselage('ijaGreen', [(1.0, 0.5, 0.5, 0.0), (0.0, 0.5, 0.5, 0.0)])
elif case == 'blades':
    m.propeller('dark', (0.0, 0.0, 0.0), 3.0, 1, 0.25, 0.3, 0.5)
elif case == 'wing-chord':
    m.wing('ijaGreen', 0.0, 0.0, 0.0, 1.0, 10.0)
else:
    m.gun_turret('naturalMetal', 0, (0.0, 0.0, 0.0), 0.5, 0.5)
m.export(out)
