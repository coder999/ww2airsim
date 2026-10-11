"""M4 Composite Sherman, 75 mm, as used by U.S. Army tank battalions in the Philippines.
Original work, AGPL-3.0-or-later.

The U.S. Army 1944 Standard Ordnance Items Catalog gives the M4 as 19 ft 4 in
(5.8938 m) long, 8 ft 7 in (2.6162 m) wide and 9 ft (2.7432 m) high, with
83 in track centers and 17.5 in ground clearance. It lists the 75 mm Gun M3
in the M34A1 combination mount. The cast-front/welded-rear composite hull,
VVSS layout and fittings are ESTIMATES from wartime photographs of 44th Tank
Battalion composite M4s in the Philippines. Gun travel is runtime rig data.
Frame: +x forward, +y up, +z starboard, metres, ground y=0.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, _opts = kit.cli_args()
m = kit.Model('m4-sherman', skin=512)

OLIVE = 'oliveDrab'
TRACK_Z = 1.145

# T48-style track runs and their characteristic VVSS wheels. The wheels remain
# part of the static skin; this model's authored motion is turret and gun only.
with m.tagged('tracks'):
    for side in (-1, 1):
        z = side * TRACK_Z
        m.box('dark', (0.0, 0.03, z), (4.62, 0.22, 0.326), node='ShermanTracks')
        m.box('dark', (0.0, 1.02, z), (4.38, 0.18, 0.326), node='ShermanTracks')
        m.box('dark', (2.22, 0.22, z), (0.28, 0.82, 0.326), node='ShermanTracks')
        m.box('dark', (-2.22, 0.22, z), (0.28, 0.82, 0.326), node='ShermanTracks')
        for x in (-1.55, -0.94, -0.33, 0.33, 0.94, 1.55):
            m.revolve('dark', (x, 0.31, z - side * 0.13), (0, 0, side),
                      [(0.0, 0.31), (0.26, 0.31)], 16, node='ShermanRunningGear')
            m.revolve('oliveDrab', (x, 0.31, z - side * 0.145), (0, 0, side),
                      [(0.0, 0.14), (0.29, 0.14)], 12, node='ShermanWheelHubs')
        for x in (-2.13, 2.13):
            m.revolve('dark', (x, 0.39, z - side * 0.13), (0, 0, side),
                      [(0.0, 0.39), (0.26, 0.39)], 18, node='ShermanRunningGear')
            m.revolve('oliveDrab', (x, 0.39, z - side * 0.145), (0, 0, side),
                      [(0.0, 0.16), (0.29, 0.16)], 12, node='ShermanWheelHubs')
        for x in (-1.24, 0.0, 1.24):
            m.revolve('dark', (x, 0.90, z - side * 0.13), (0, 0, side),
                      [(0.0, 0.135), (0.26, 0.135)], 12, node='ShermanRunningGear')
        # Three paired vertical-volute bogie brackets per side.
        for x in (-1.245, 0.0, 1.245):
            m.tapered_box(OLIVE, (x, 0.48, z), (0.74, 0.23), (0.49, 0.18), 0.47,
                          node='ShermanSuspension')
            for dx in (-0.19, 0.19):
                m.strut(OLIVE, (x + dx, 0.65, z - side * 0.12),
                        (x + dx, 0.94, z - side * 0.12), 0.055, sides=8,
                        node='ShermanSuspension')

# Lower hull and the composite upper hull: welded rear, rounded cast front.
with m.tagged('hull'):
    m.box(OLIVE, (-0.10, 0.42, 0.0), (4.80, 0.69, 2.06), node='ShermanHull')
    m.tapered_box(OLIVE, (-1.10, 1.07, 0.0), (2.80, 2.08), (2.56, 1.68), 0.59,
                  node='ShermanHull')
    # The cast bow is a rounded loft, blending into the welded rear at x=0.1.
    m.fuselage(OLIVE, [
        (0.08, 1.02, 0.54, 1.36),
        (0.72, 1.00, 0.51, 1.33),
        (1.44, 0.93, 0.45, 1.27),
        (2.18, 0.75, 0.35, 1.15),
        (2.48, 0.42, 0.23, 1.03),
    ], segments=12, node='ShermanHull')
    # Transmission nose and rear engine overhang establish the cited length.
    m.tapered_box(OLIVE, (2.49, 0.44, 0.0), (0.90, 2.02), (0.63, 1.77), 0.58,
                  node='ShermanHull')
    m.box(OLIVE, (-2.69, 0.55, 0.0), (0.49, 0.68, 1.93), node='ShermanHull')
    # Driver/co-driver hoods, engine deck and rear deck intake covers.
    for z in (-0.48, 0.48):
        m.tapered_box(OLIVE, (0.68, 1.58, z), (0.62, 0.48), (0.47, 0.37), 0.17,
                      node='ShermanHull')
    m.box(OLIVE, (-1.78, 1.61, 0.0), (1.20, 0.08, 1.58), node='ShermanHull')
    for z in (-0.48, 0.0, 0.48):
        m.box(OLIVE, (-1.87, 1.69, z), (0.72, 0.035, 0.25), node='ShermanHull')
    # Track guards.
    for z in (-1.25, 1.25):
        m.box(OLIVE, (-0.02, 1.10, z), (4.78, 0.055, 0.12), node='ShermanHull')

# Hull fittings: bow gun, lamps, lifting eyes, tools and exhausts.
with m.tagged('fittings'):
    m.revolve('dark', (2.22, 1.33, 0.46), (1, 0.04, 0),
              [(0.0, 0.105), (0.16, 0.085), (0.48, 0.025)], 10, node='ShermanFittings')
    for z in (-0.73, 0.73):
        m.revolve('steel', (2.18, 1.26, z), (0.18, 0.05, 0),
                  [(0.0, 0.10), (0.18, 0.085)], 10, node='ShermanLamps')
        m.strut('steel', (2.08, 1.12, z), (2.15, 1.38, z), 0.025, sides=6,
                node='ShermanLamps')
    for z in (-0.48, 0.48):
        m.revolve('dark', (-2.91, 0.77, z), (-1, 0, 0),
                  [(0.0, 0.12), (0.10, 0.12)], 10, node='ShermanExhausts')
    m.strut('steel', (-0.72, 1.70, -0.72), (0.90, 1.76, -0.72), 0.026,
            sides=6, node='ShermanTools')
    m.strut('timber', (-0.78, 1.73, -0.77), (0.42, 1.78, -0.77), 0.035,
            sides=6, node='ShermanToolHandles')

# Low-bustle 75 mm turret. Everything here except Gun1 is one node so its cupola,
# hatch and flexible .50 move with the turret when the Hangar trains it.
with m.tagged('turret'):
    m.revolve(OLIVE, (-0.38, 1.65, 0.0), (0, 1, 0), [
        (0.0, 0.88), (0.14, 1.00), (0.46, 0.89), (0.69, 0.70), (0.79, 0.45),
    ], 18, node='Turret1')
    m.tapered_box(OLIVE, (-0.94, 1.78, 0.0), (1.22, 1.43), (0.98, 1.15), 0.43,
                  node='Turret1')
    m.revolve(OLIVE, (-0.62, 2.40, -0.33), (0, 1, 0),
              [(0.0, 0.24), (0.13, 0.24), (0.22, 0.17)], 14, node='Turret1')
    m.box(OLIVE, (-0.61, 2.59, -0.33), (0.43, 0.05, 0.33), node='Turret1')
    m.revolve(OLIVE, (-0.18, 2.40, 0.35), (0, 1, 0),
              [(0.0, 0.20), (0.08, 0.20)], 12, node='Turret1')
    # Flexible M2 .50 cal silhouette on its pintle.
    m.strut(OLIVE, (-0.86, 2.49, 0.35), (-0.86, 2.71, 0.35), 0.025, sides=6, node='Turret1')
    m.machine_gun(OLIVE, (-0.78, 2.69, 0.35), (1, 0, 0), 0.78, 0.72, node='Turret1')
    m.strut(OLIVE, (-0.98, 2.47, -0.48), (-1.08, 2.72, -0.48), 0.012, sides=6, node='Turret1')

# M34A1 mantlet and 75 mm M3, hinged together at the trunnion.
with m.tagged('gun'):
    m.revolve(OLIVE, (0.31, 2.02, 0.0), (1, 0, 0),
              [(0.0, 0.34), (0.22, 0.37), (0.43, 0.25)], 16, node='Gun1')
    m.revolve(OLIVE, (0.64, 2.07, 0.0), (1, 0, 0), [
        (0.0, 0.105), (1.72, 0.075), (2.12, 0.07), (2.20, 0.12), (2.27, 0.12),
    ], 12, node='Gun1')

# A period recognition star on each hull side. Its geometry and placement are ESTIMATES.
star = []
for i in range(10):
    a = math.pi / 2 + i * math.pi / 5
    r = 0.30 if i % 2 == 0 else 0.125
    star.append((math.cos(a) * r, math.sin(a) * r))
for side in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(0.10, 1.30, side * 1.035),
              axis=(0, 0, side), uDir=(1, 0, 0), points=star,
              color='usaaInsigniaWhite')
m.marking('slab', tags=['tracks'], axis='y', fromM=-0.1, toM=0.42,
          color='exhaustSoot', effect='stain', opacity=0.30, featherM=0.18)
m.marking('grid', tags=['tracks'], spacingM=[0.18, None, None], widthM=0.018, depth=0.45)

m.export(out)
