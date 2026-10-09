# DP0 Task 9: the aircraft detail parts, each in its own node so each can be proven closed and outward.
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit  # noqa: E402

out, _opts = kit.cli_args()
m = kit.Model('dp', skin=1024)
with m.tagged('fuselage'):
    m.fuselage('ijaGreen', [(-4.0, 0.05, 0.08, 0.0), (-1.0, 0.5, 0.6, 0.0), (1.0, 0.55, 0.6, 0.0), (2.0, 0.3, 0.3, 0.0)],
               segments=32, subdivide=4, node='df_fuse')
with m.tagged('wing'):
    m.wing('ijaGreen', 0.5, -0.3, 2.0, 1.0, 10.0, dihedral_deg=5.0, stations=kit.AIRFOIL_STATIONS_FINE, span_segments=4,
           controls=[(3.0, 4.5, 0.75, 'Aileron')], node='df_wing', lower_role='underside', lower_node='df_wing_lower')
with m.tagged('fin'):
    m.fin('ijaGreen', -3.0, 0.3, 1.2, 0.6, 1.4, sweep_deg=20.0, stations=kit.AIRFOIL_STATIONS_FINE, controls=[(0.1, 1.3, 0.7, 'Rudder')], node='df_fin')
with m.tagged('prop'):
    m.propeller('dark', (2.3, 0.0, 0.0), 3.0, 2, 0.25, 0.25, 0.4, blade_sections=[(0.1, 1.0, 45.0), (0.5, 1.1, 30.0), (0.95, 0.6, 18.0)], node='Prop')
with m.tagged('canopy'):
    m.canopy('glazing', 'ijaGreen', [(-1.0, 0.05, 0.05, 0.55), (-0.5, 0.3, 0.3, 0.6), (0.5, 0.3, 0.32, 0.6), (0.9, 0.05, 0.05, 0.55)],
             frames=[-0.5, 0.0, 0.5], subdivide=3, node='df_canopy', frame_node='df_frames')
m.export(out)
