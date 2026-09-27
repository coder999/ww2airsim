# tests/tools/models/blender/fixtures/kit_aircraft_probe.py -- exercises every aircraft part once (R3).
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit

out, opts = kit.cli_args()
m = kit.Model('airprobe')
m.fuselage('ijaGreen', [(-4.0, 0.1, 0.1, 0.0), (0.0, 1.0, 0.8, 0.0), (4.0, 0.1, 0.1, 0.0)], segments=16,
           node='ap_fuse', lower_role='underside', lower_node='ap_fuse_lower')
m.wing('naturalMetal', 21.0, 0.0, 2.0, 1.0, 10.0, dihedral_deg=5.0, thickness=0.12, node='ap_wing')
m.fin('naturalMetal', 41.0, 0.0, 2.0, 1.0, 3.0, sweep_deg=10.0, node='ap_fin')
m.propeller('dark', (60.0, 0.0, 0.0), 3.0, 3, 0.25, 0.3, 0.5, node='Prop')
m.gear_leg('dark', (80.0, 0.0, 2.0), 2.0, 0.35, 0.2, node='GearR')
m.gear_leg('dark', (80.0, 0.0, -2.0), 2.0, 0.35, 0.2, node='GearL')
m.gun_turret('naturalMetal', 1, (96.0, 0.0, 0.0), 0.5, 0.5, up=1)
m.gun_turret('naturalMetal', 2, (100.0, 0.0, 0.0), 0.5, 0.5, up=-1, facing=-1)
m.fuselage('glazing', [(119.0, 0.05, 0.05, 0.5), (120.0, 0.4, 0.3, 0.5), (121.0, 0.05, 0.05, 0.5)], node='ap_canopy')
m.export(out)
