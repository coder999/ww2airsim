# A skinned probe (DP0 Task 2): one box, one fuselage, one mirrored wing, one barrel vault, a flat tank, a marking.
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit  # noqa: E402

out, _opts = kit.cli_args()
m = kit.Model('sp', skin=512)
with m.tagged('slab'):
    m.box('concrete', (0.0, -0.3, 0.0), (6.0, 0.3, 4.0))
with m.tagged('fuselage'):
    m.fuselage('ijaGreen', [(-4.0, 0.2, 0.3, 1.5), (0.0, 0.6, 0.7, 1.5), (3.0, 0.4, 0.5, 1.5)], segments=16, lower_role='underside')
with m.tagged('wing'):
    m.wing('ijaGreen', 0.8, 1.2, 1.8, 1.0, 8.0, dihedral_deg=5.0, lower_role='underside')
with m.tagged('vault'):
    m.barrel_vault('steel', (0.0, 0.0, -8.0), 6.0, 1.5, 4.0, 0.2, 12)
    # A planar part whose faces meet under SHARP_DEG: it must stay flat (its smooth flags are False).
    m.tank('steel', (12.0, 0.0, 0.0), 1.0, 2.0, segments=24, node='sp_tank')
m.marking('disc', tags=['wing'], center=(0.0, 1.5, 2.5), axis=(0.0, 1.0, 0.0), radiusM=0.4, color='hinomaruRed')
m.export(out)
