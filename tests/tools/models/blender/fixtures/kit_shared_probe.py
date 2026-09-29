# A skinned probe for Model.shared_chart() (DP0 Task 8): boxes inside and outside, a nested context, two roles.
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit  # noqa: E402

out, _opts = kit.cli_args()
m = kit.Model('sh', skin=512)
with m.tagged('fit'):
    m.box('steel', (0.0, 0.0, 0.0), (1.0, 1.0, 1.0), node='sh_a')           # before: one chart per face
    with m.shared_chart():
        m.box('steel', (3.0, 0.0, 0.0), (0.2, 2.0, 0.1), node='sh_b')       # shares with c and f
        m.box('steel', (6.0, 0.0, 0.0), (0.1, 0.1, 1.5), node='sh_c')
        m.box('glazing', (9.0, 0.0, 0.0), (0.05, 0.9, 1.2), node='sh_d')    # another role: its own shared chart
        with m.shared_chart():
            m.box('steel', (12.0, 0.0, 0.0), (0.3, 0.3, 0.3), node='sh_e')  # nested: a fresh shared chart
        m.box('steel', (15.0, 0.0, 0.0), (0.4, 0.2, 0.2), node='sh_f')      # back in the outer context
    m.box('steel', (18.0, 0.0, 0.0), (1.0, 1.0, 1.0), node='sh_g')          # after: one chart per face again
m.export(out)
