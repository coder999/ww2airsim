"""Type 95 Kurogane four-wheel scout car. Original work, AGPL-3.0-or-later.

Dimensions (read 2026-10-11): 3.60 m long, 1.52 m wide and 1.68 m high from the
German Wikipedia article "Typ 95 Aufklarungswagen". The Australian War Memorial
collection record C110415 confirms the Type 95 Kurogane 4x4 scout-car identity.
Wheelbase, wheel diameter, track, panel shapes, seating, tread, fittings and every detail added in the
2026-10-14 fidelity rework (fenders, hood, seats, folded top, spare wheel, lamps, chassis) are ESTIMATES.
Frame: +x forward, +y up, +z starboard, metres, ground y=0. Right-hand drive, as Japanese cars were.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import ground_parts as gp  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('type95-kurogane', skin=512)
BODY, DK, ST, GL, CV = 'ijaGreen', 'dark', 'steel', 'glazing', 'webbing'
R, ZW, WW = 0.34, 0.68, 0.16     # wheel radius, wheel-center z, tire width (outer face at 0.76 m)
XF, XR = 1.08, -1.08

# Road wheels: the rig's four WheelXX nodes, each spun about its own axle.
hubs = []
for name, x, z in (('WheelFL', XF, -ZW), ('WheelFR', XF, ZW), ('WheelRL', XR, -ZW), ('WheelRR', XR, ZW)):
    sgn = 1 if z > 0 else -1
    rim = gp.tire(m, name, x, R, z, R, WW, sgn, lugs=26, segments=18)
    hubs.append((x, z + sgn * (WW / 2 + 0.02), sgn, rim))
for x, z, sgn, rim in hubs:
    m.marking('disc', tags=['hub'], center=(x, R, z), axis=(0, 0, sgn), radiusM=rim * 0.99, color='ijnCamoGreen')


def slope_z(y, y0, z0, y1, z1):
    return z0 + (y - y0) * (z1 - z0) / (y1 - y0)


# Chassis: ladder frame, axles with differentials, springs, driveline, exhaust, skid plate.
with m.tagged('chassis'):
    for z in (-0.34, 0.34):
        m.box(DK, (0, 0.42, z), (3.10, 0.12, 0.08), node='Chassis')
    for x in (-1.30, -0.40, 0.45, 1.25):
        m.box(DK, (x, 0.44, 0), (0.08, 0.08, 0.68), node='Chassis')
    for x in (XF, XR):
        m.strut(DK, (x, R, -ZW + 0.10), (x, R, ZW - 0.10), 0.045, sides=8, node='Chassis')
        m.revolve(DK, (x, R, -0.12), (0, 0, 1), [(0.0, 0.07), (0.07, 0.12), (0.17, 0.12), (0.24, 0.07)], 12, node='Chassis')
        for z in (-0.40, 0.40):
            m.box(DK, (x, R + 0.06, z), (0.60, 0.04, 0.06), node='Chassis')     # leaf springs
    m.strut(DK, (XF, 0.34, 0), (XR, 0.34, 0), 0.028, sides=8, node='Chassis')    # propeller shaft
    m.box(DK, (0.20, 0.36, 0), (0.50, 0.20, 0.30), node='Chassis')                # gearbox
    m.strut(DK, (0.90, 0.28, 0.24), (-0.95, 0.28, 0.24), 0.045, sides=10, node='Chassis')   # exhaust
    m.strut(DK, (-0.95, 0.28, 0.24), (-1.40, 0.30, 0.24), 0.07, sides=10, node='Chassis')   # muffler
    m.box(DK, (0.95, 0.30, 0), (0.50, 0.04, 0.50), node='Chassis')                # skid plate

# Fenders and body.
with m.tagged('body'):
    for sgn in (-1, 1):
        z0, z1 = (0.50, 0.76) if sgn > 0 else (-0.76, -0.50)
        arch_f = gp.ring_pts(XF, R, 0.40, 18, 162, 9)
        gp.prism(m, BODY, [(0.52, 0.80), (1.40, 0.80), (1.60, 0.72), (1.67, 0.55), (1.62, 0.48)] + arch_f + [(0.52, 0.48)], z0, z1)
        arch_r = gp.ring_pts(XR, R, 0.40, 18, 162, 9)
        gp.prism(m, BODY, [(-1.60, 0.88), (-0.62, 0.88), (-0.62, 0.48)] + arch_r + [(-1.60, 0.48)], z0, z1)
        m.box(DK, (-0.05, 0.40, sgn * 0.66), (1.20, 0.04, 0.16))               # running boards
        for x in (-0.55, 0.45):
            m.box(DK, (x, 0.30, sgn * 0.62), (0.05, 0.10, 0.05))
    # Hood and cowl.
    m.tapered_box(BODY, (1.00, 0.60, 0), (1.10, 0.94), (0.96, 0.72), 0.52)
    m.box(BODY, (0.38, 0.52, 0), (0.28, 0.62, 1.22))                              # cowl and dash
    m.rounded_box(BODY, (0.35, 1.10, 0), 0.30, 1.20, 0.06, 0.04, 2)               # cowl top
    # Tub: floor, low side walls, rear panel, tail.
    m.box(BODY, (-0.62, 0.46, 0), (1.80, 0.08, 1.20))
    for sgn in (-1, 1):
        m.box(BODY, (-0.62, 0.50, sgn * 0.60), (1.82, 0.52, 0.05))
        m.box(DK, (-0.62, 1.02, sgn * 0.60), (1.84, 0.03, 0.07))                 # beltline cap
    m.box(BODY, (-1.50, 0.50, 0), (0.06, 0.62, 1.20))
    m.box(BODY, (-1.50, 1.12, 0), (0.07, 0.04, 1.24))
    m.box(BODY, (-1.46, 0.50, 0), (0.18, 0.04, 1.14))                             # rear shelf
    # Windshield posts and grab handles.
    for sgn in (-1, 1):
        m.strut(BODY, (0.44, 1.10, sgn * 0.46), (0.36, 1.655, sgn * 0.46), 0.022, sides=4)
        m.strut(BODY, (0.10, 1.00, sgn * 0.60), (-0.15, 1.00, sgn * 0.60), 0.014, sides=6)

# Hood details: louvers on both sides and a hinge strip.
with m.tagged('hood'):
    with m.shared_chart():
        for sgn in (-1, 1):
            for k in range(6):
                x = 0.66 + 0.15 * k
                zt = lambda y: slope_z(y, 0.60, 0.47, 1.12, 0.36) + 0.006
                m.strut(DK, (x, 0.82, sgn * zt(0.82)), (x, 1.02, sgn * zt(1.02)), 0.010, sides=4)
    m.box(ST, (1.00, 1.115, 0), (1.00, 0.012, 0.04))

# Nose (kept node, steel): grille slats, bumper, headlamp bezels and brackets, crank guide.
with m.tagged('front'):
    with m.shared_chart():
        for k in range(-4, 5):
            m.box(ST, (1.555, 0.64, k * 0.085), (0.02, 0.44, 0.030), node='KuroganeNose')
    m.box(ST, (1.555, 0.68, 0), (0.025, 0.04, 0.78), node='KuroganeNose')
    m.box(ST, (1.555, 0.88, 0), (0.025, 0.03, 0.74), node='KuroganeNose')
    m.box(ST, (1.76, 0.36, 0), (0.08, 0.11, 1.18), node='KuroganeNose')
    for sgn in (-1, 1):
        m.box(ST, (1.72, 0.40, sgn * 0.62), (0.16, 0.05, 0.05), node='KuroganeNose')     # bumper stays
        m.strut(ST, (1.54, 0.72, sgn * 0.34), (1.58, 1.12, sgn * 0.34), 0.025, sides=6, node='KuroganeNose')
        m.revolve(ST, (1.48, 0.92, sgn * 0.52), (1, 0, 0), [(0.0, 0.085), (0.04, 0.095), (0.09, 0.075)], 12, node='KuroganeNose')   # lamp shell
        m.strut(ST, (1.48, 0.83, sgn * 0.39), (1.48, 0.83, sgn * 0.47), 0.04, sides=8, node='KuroganeNose')
    m.strut(ST, (1.62, 0.58, 0), (1.80, 0.58, 0), 0.02, sides=6, node='KuroganeNose')   # crank guide

# Glass, lamp lenses, seats, folded top, spare wheel, controls, tail fittings.
with m.tagged('trim'):
    gp.prism(m, GL, [(0.43, 1.15), (0.45, 1.15), (0.37, 1.62), (0.35, 1.62)], -0.44, 0.44)      # windscreen
    m.strut(ST, (0.36, 1.655, -0.46), (0.36, 1.655, 0.46), 0.025, sides=6)                     # top bar (height 1.68 m)
    m.strut(ST, (0.45, 1.14, -0.46), (0.45, 1.14, 0.46), 0.02, sides=6)
    m.strut(ST, (0.40, 1.15, 0), (0.37, 1.62, 0), 0.012, sides=4)
    for sgn in (-1, 1):
        m.revolve('warmLight', (1.545, 0.92, sgn * 0.52), (1, 0, 0), [(0.0, 0.060), (0.03, 0.050), (0.05, 0.020)], 10)
        m.box('signalRed', (-1.545, 0.72, sgn * 0.50), (0.03, 0.07, 0.10))
    # Seats: front pair and rear bench, dark leather.
    m.rounded_box(DK, (-0.12, 0.54, 0), 0.40, 1.00, 0.12, 0.05, 2)
    m.box(DK, (-0.34, 0.60, 0), (0.08, 0.46, 1.00))
    m.rounded_box(DK, (-0.92, 0.54, 0), 0.42, 1.04, 0.12, 0.05, 2)
    m.box(DK, (-1.18, 0.60, 0), (0.08, 0.46, 1.04))
    # Steering column to the wheel node's center (-0.02, 1.18, 0.30); axis (0, 0.65, -0.76).
    m.strut(ST, (-0.02, 0.92, 0.604), (-0.02, 1.18, 0.30), 0.022, sides=8)
    m.box(DK, (0.18, 0.60, 0.30), (0.12, 0.18, 0.08))                                           # pedals
    m.strut(ST, (0.10, 0.72, -0.10), (0.04, 1.00, -0.10), 0.014, sides=6)                      # gear lever
    m.box(DK, (0.38, 0.78, 0), (0.05, 0.12, 0.40))                                              # instrument panel
    # Folded canvas top and its bows behind the rear seat.
    m.revolve(CV, (-1.30, 1.12, -0.54), (0, 0, 1), [(0.0, 0.115), (1.08, 0.115)], 12)
    for sgn in (-1, 1):
        m.strut(ST, (-1.24, 1.02, sgn * 0.57), (-1.34, 1.18, sgn * 0.57), 0.016, sides=6)
        m.strut(ST, (-0.95, 1.00, sgn * 0.57), (-1.28, 1.14, sgn * 0.57), 0.012, sides=4)
    # Spare wheel on the rear panel (axis along x), with cross-bar lugs, and rear bumper.
    sx = -1.53
    m.revolve('dark', (sx, 0.80, 0), (-1, 0, 0), [(0.0, 0.17), (0.02, 0.28), (0.04, 0.30), (0.12, 0.30), (0.14, 0.28), (0.16, 0.17)], 18)
    m.revolve(ST, (sx - 0.16, 0.80, 0), (-1, 0, 0), [(0.0, 0.16), (0.025, 0.16), (0.045, 0.07)], 12)
    with m.shared_chart():
        for k in range(22):
            a = 2 * math.pi * (k + 0.5) / 22
            m.strut('dark', (sx - 0.01, 0.80 + 0.295 * math.sin(a), 0.295 * math.cos(a)),
                    (sx - 0.15, 0.80 + 0.295 * math.sin(a), 0.295 * math.cos(a)), 0.018, sides=4)
    m.box(ST, (-1.76, 0.36, 0), (0.08, 0.11, 1.18))
    m.box(DK, (-1.62, 0.40, 0), (0.24, 0.05, 0.14))
    m.strut(ST, (-1.60, 0.46, 0), (-1.78, 0.46, 0), 0.03, sides=8)                                # tow hook
    for sgn in (-1, 1):
        m.strut(ST, (-1.58, 0.40, sgn * 0.20), (-1.76, 0.38, sgn * 0.30), 0.012, sides=4)

# The steering wheel node: a rim of straight segments, three spokes, a hub, in the plane normal to the column axis.
cx, cy, cz = -0.02, 1.18, 0.30
axis = (0.0, 0.649967502, -0.759962002)
u = (1.0, 0.0, 0.0)
v = (axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0])
rim_r = 0.155
ring = [(cx + rim_r * (math.cos(2 * math.pi * k / 14) * u[0] + math.sin(2 * math.pi * k / 14) * v[0]),
         cy + rim_r * (math.cos(2 * math.pi * k / 14) * u[1] + math.sin(2 * math.pi * k / 14) * v[1]),
         cz + rim_r * (math.cos(2 * math.pi * k / 14) * u[2] + math.sin(2 * math.pi * k / 14) * v[2])) for k in range(14)]
for k in range(14):
    m.strut(DK, ring[k], ring[(k + 1) % 14], 0.016, sides=6, node='SteeringWheel')
for k in (0, 5, 9):
    m.strut(DK, (cx, cy, cz), ring[k], 0.011, sides=4, node='SteeringWheel')
m.strut(DK, (cx - 0.02 * axis[0], cy - 0.02 * axis[1], cz - 0.02 * axis[2]), (cx + 0.03 * axis[0], cy + 0.03 * axis[1], cz + 0.03 * axis[2]),
        0.04, sides=10, node='SteeringWheel')

m.export(out)
