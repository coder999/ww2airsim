"""A US Army jeep driver, seated at the Willys MB's wheel (V1, 2026-10-09). Original work, AGPL-3.0-or-later.

Built in the jeep's own frame (content/vehicles/willys-mb-jeep.glb: +x forward, +y up, +z starboard,
meters), so the figure loads at the jeep's origin and sits in its driver's seat. Every figure here is
an ESTIMATE; no anthropometric table or uniform specification was read:
  seat cushion top y 0.726, x -0.449 to -0.016, centered z -0.352   MEASURED off the jeep glb 2026-10-09
  steering pivot (0.0453, 1.0416, -0.3231), column (-0.7238, 0.6882, 0.0501), rim radius 0.199
                                                                     MEASURED off the jeep glb 2026-10-09
  a 5 ft 9 in man: shoulders 0.58 m above the seat, 0.40 m apart; upper arm 0.29 m, forearm 0.26 m
  thighs 0.42 m, shins 0.42 m; head 0.20 m across under an M1 helmet 0.29 m across the brim
  hands on the rim at ten and two, in olive drab knit gloves (M-1941 wool gloves were olive drab; a
  glove keeps each arm one role, so one part and one draw)
  colors: olive drab wool shirt and trousers, an M1 helmet's darker olive drab, a khaki web belt,
  russet service shoes (kit.py's figure roles)
Frame: the jeep's. ArmL and ArmR are the arms, hand included, each pivoted at the shoulder:
src/render/scene/vehicleRig.ts swings them so the hands follow the steering wheel.
Leaves out: fingers, the face, rank insignia, the carbine.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

SEAT_Y = 0.726
ZC = -0.352
PIVOT = (0.0453, 1.0416, -0.3231)
COLUMN = (-0.7238, 0.6882, 0.0501)
RIM_R = 0.199
UPPER_ARM = 0.29
FOREARM = 0.26
SEG = 14


def add(a, b, k=1.0):
    return tuple(x + k * y for x, y in zip(a, b))


def unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def length(v):
    return math.sqrt(dot(v, v))


# The rim's plane: u across (starboard), v toward its top; a hand at ten and at two o'clock.
A = unit(COLUMN)
U = unit(add((0.0, 0.0, 1.0), A, -A[2]))
V = cross(A, U)
GRIP = {s: add(PIVOT, add(V, U, s * -math.sqrt(3)), RIM_R * 0.5) for s in (1, -1)}  # 1 = left (port), -1 = right


def elbow(shoulder, wrist, pole):
    """Two-bone reach: the elbow on the side of `pole`, the bones UPPER_ARM and FOREARM long."""
    d = add(wrist, shoulder, -1.0)
    dl = min(length(d), UPPER_ARM + FOREARM - 1e-3)
    a = (UPPER_ARM ** 2 - FOREARM ** 2 + dl * dl) / (2 * dl)
    h = math.sqrt(max(UPPER_ARM ** 2 - a * a, 0.0))
    dn = unit(d)
    side = unit(add(pole, dn, -dot(pole, dn)))
    return add(add(shoulder, dn, a), side, h)


out, _opts = kit.cli_args()
m = kit.Model('us-army-driver', skin=512)

# Seated body: hips, waist and chest as solids of revolution, two side by side for the chest so it reads
# broader than deep; shoulder balls where the arms meet it.
with m.tagged('body'):
    m.revolve('uniform', (-0.27, SEAT_Y + 0.004, ZC), (0, 1, 0), [(0.0, 0.14), (0.06, 0.17), (0.17, 0.165)], 16, node='Driver')
    for dz in (-0.07, 0.07):
        m.revolve('uniform', (-0.31, SEAT_Y + 0.17, ZC + dz), (-0.08, 1, 0),
                  [(0.0, 0.12), (0.12, 0.125), (0.26, 0.14), (0.34, 0.13), (0.4, 0.07)], 16, node='Driver')
    for dz in (-0.19, 0.19):
        m.revolve('uniform', (-0.33, SEAT_Y + 0.51, ZC + dz), (0, 1, 0), [(0.0, 0.03), (0.04, 0.065), (0.09, 0.06), (0.12, 0.02)], 10, node='Driver')
with m.tagged('belt'):
    m.revolve('webbing', (-0.285, SEAT_Y + 0.15, ZC), (0, 1, 0), [(0.0, 0.172), (0.05, 0.172)], 16, node='DriverBelt')
with m.tagged('head'):
    m.revolve('skin', (-0.335, SEAT_Y + 0.55, ZC), (0, 1, 0), [(0.0, 0.055), (0.08, 0.05)], SEG, node='DriverSkin')
    m.revolve('skin', (-0.325, SEAT_Y + 0.60, ZC), (0, 1, 0),
              [(0.0, 0.035), (0.03, 0.08), (0.09, 0.1), (0.15, 0.1), (0.2, 0.08), (0.235, 0.03)], 16, node='DriverSkin')
with m.tagged('helmet'):
    m.revolve('helmet', (-0.33, SEAT_Y + 0.735, ZC), (0, 1, 0),
              [(0.0, 0.145), (0.012, 0.145), (0.025, 0.126), (0.07, 0.124), (0.12, 0.097), (0.15, 0.055), (0.163, 0.01)], 20, node='DriverHelmet')
with m.tagged('legs'):
    for dz in (-0.10, 0.10):
        hip, knee, ankle = (-0.25, SEAT_Y + 0.09, ZC + dz), (0.16, SEAT_Y + 0.11, ZC + dz * 1.1), (0.28, 0.5, ZC + dz * 1.15)
        m.revolve('uniform', hip, add(knee, hip, -1.0), [(0.0, 0.085), (length(add(knee, hip, -1.0)), 0.062)], SEG, node='Driver')
        m.revolve('uniform', knee, add(ankle, knee, -1.0), [(0.0, 0.06), (length(add(ankle, knee, -1.0)), 0.045)], SEG, node='Driver')
        m.box('boots', (ankle[0] + 0.06, ankle[1] - 0.07, ankle[2]), (0.26, 0.09, 0.10), node='DriverBoots')

# The arms, each one part with its gloved hand: shoulder to elbow to wrist to the grip.
for side, name in ((1, 'ArmL'), (-1, 'ArmR')):
    shoulder = (-0.33, SEAT_Y + 0.56, ZC - side * 0.20)
    grip = GRIP[side]
    wrist = add(grip, unit(add(grip, shoulder, -1.0)), -0.07)
    el = elbow(shoulder, wrist, (0.0, -1.0, -side * 0.6))
    with m.tagged(name):
        m.revolve('uniform', shoulder, add(el, shoulder, -1.0), [(0.0, 0.055), (length(add(el, shoulder, -1.0)), 0.045)], SEG, node=name)
        m.revolve('uniform', el, add(wrist, el, -1.0), [(0.0, 0.046), (length(add(wrist, el, -1.0)), 0.036)], SEG, node=name)
        m.revolve('uniform', wrist, add(grip, wrist, -1.0), [(0.0, 0.035), (length(add(grip, wrist, -1.0)) + 0.02, 0.03)], SEG, node=name)

m.export(out)
