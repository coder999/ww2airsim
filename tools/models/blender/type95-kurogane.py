"""Type 95 Kurogane four-wheel scout car. Original work, AGPL-3.0-or-later.

Dimensions (read 2026-10-11): 3.60 m long, 1.52 m wide and 1.68 m high from the
German Wikipedia article "Typ 95 Aufklarungswagen". The Australian War Memorial
collection record C110415 confirms the Type 95 Kurogane 4x4 scout-car identity.
Wheelbase, wheel diameter, track, panel shapes, seating and fittings are ESTIMATES.
Frame: +x forward, +y up, +z starboard, metres, ground y=0.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('type95-kurogane', skin=512)

for name, x, z in (
    ('WheelFL', 1.08, -0.68), ('WheelFR', 1.08, 0.68),
    ('WheelRL', -1.08, -0.68), ('WheelRR', -1.08, 0.68),
):
    m.strut('dark', (x, 0.34, z - 0.08), (x, 0.34, z + 0.08), 0.34, sides=16, node=name)
    m.strut('dark', (x, 0.34, z - 0.085), (x, 0.34, z + 0.085), 0.12, sides=12, node=name)

with m.tagged('body'):
    m.box('dark', (0, 0.42, 0), (3.15, 0.16, 1.08))
    m.box('ijaGreen', (-0.18, 0.52, 0), (2.65, 0.42, 1.18))
    m.tapered_box('ijaGreen', (0.92, 0.82, 0), (1.28, 1.05), (0.96, 0.86), 0.48)
    m.box('ijaGreen', (-0.75, 0.9, 0), (1.15, 0.30, 1.12))
    m.box('ijaGreen', (-1.48, 0.66, 0), (0.34, 0.70, 1.05))
    m.box('steel', (1.76, 0.36, 0), (0.08, 0.11, 1.18), node='KuroganeNose')
    m.box('steel', (-1.76, 0.36, 0), (0.08, 0.11, 1.18))
    for z in (-0.34, 0.34):
        m.strut('steel', (1.54, 0.72, z), (1.58, 1.12, z), 0.025, sides=6, node='KuroganeNose')
    for z in (-0.42, 0.42):
        m.strut('steel', (0.42, 1.12, z), (0.38, 1.655, z), 0.025, sides=6)
    m.strut('steel', (0.38, 1.655, -0.42), (0.38, 1.655, 0.42), 0.025, sides=6)
    m.box('glazing', (0.395, 1.20, 0), (0.035, 0.40, 0.76))
    m.box('dark', (-0.52, 0.86, -0.28), (0.62, 0.10, 0.38))
    m.box('dark', (-0.52, 0.86, 0.28), (0.62, 0.10, 0.38))
    m.strut('dark', (-1.45, 0.69, -0.25), (-1.45, 0.69, 0.25), 0.31, sides=16)
    m.strut('steel', (1.48, 0.83, -0.39), (1.48, 0.83, -0.32), 0.11, sides=12, node='KuroganeNose')
    m.strut('steel', (1.48, 0.83, 0.32), (1.48, 0.83, 0.39), 0.11, sides=12, node='KuroganeNose')

center = (-0.02, 1.18, 0.30)
m.strut('steel', (-0.18, 0.88, 0.55), center, 0.025, sides=8)
for dy, dz in ((0.13, 0.0), (-0.13, 0.0), (0.0, 0.13), (0.0, -0.13)):
    m.strut('dark', center, (center[0], center[1] + dy, center[2] + dz), 0.018, sides=6, node='SteeringWheel')

m.export(out)
