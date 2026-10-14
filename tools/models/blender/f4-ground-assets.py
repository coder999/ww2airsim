"""F4 Leyte ground-support assets. Original work, AGPL-3.0-or-later.

The output basename selects one approved F3 asset. CCKW dimensions use TM 10-1253-era
published overall figures; D7 identity is supported by TM 9-1773C. Type 94 truck and
Type 38 gun overall envelopes are ESTIMATES pending primary Japanese drawings. All cab,
bed, carriage, blade, track, wheel, hitch and control details are ESTIMATES. The CCKW and D7 were
reworked 2026-10-14 (f4r-ground) with ground_parts.py; the Type 94 and Type 38 are unchanged. Frame is
glTF +x forward, +y up, +z starboard, metres. No crew, cargo, ammunition or effects.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import ground_parts as gp  # noqa: E402


def wheel(m, node, x, z, radius, width):
    m.revolve('dark', (x, radius, z - width / 2), (0, 0, 1), [(0, radius), (width, radius)], 16, node=node)


def truck(m, length, width, height, axles, cargo_length):
    r, ww = .46, .22
    cab_length = length - cargo_length - .35
    m.rounded_box('oliveDrab', (length / 2 - cab_length / 2, r + .18, 0), cab_length, width, height - r - .18, .10, node='Body')
    m.box('oliveDrab', (-length / 2 + cargo_length / 2, r + .22, 0), (cargo_length, .72, width), node='Body')
    for z in (-width / 2 + .04, width / 2 - .04):
        m.box('oliveDrab', (-length / 2 + cargo_length / 2, r + .94, z), (cargo_length, .45, .08), node='Body')
    m.box('oliveDrab', (length / 2 - .06, r + .42, 0), (.12, .42, width * .66), node='Nose')
    for i, x in enumerate(axles):
        for side, z in (('L', -width / 2 + ww / 2), ('R', width / 2 - ww / 2)):
            label = ('F' if i == len(axles) - 1 else f'R{i + 1}')
            wheel(m, f'Wheel{label}{side}', x, z, r, ww)


def type38(m):
    # 75 mm barrel and split trail, posed level on its wheels.
    wheel(m, 'WheelL', -.565, -.96, .62, .18)
    wheel(m, 'WheelR', -.565, .96, .62, .18)
    m.box('oliveDrab', (-1.640, .40, 0), (2.35, .16, .16), node='Carriage')
    m.box('oliveDrab', (-1.715, .40, -.49), (2.20, .12, .12), node='Carriage')
    m.box('oliveDrab', (-1.715, .40, .49), (2.20, .12, .12), node='Carriage')
    m.box('oliveDrab', (-.605, .40, 0), (.12, .94, .70), node='Carriage')
    m.cylinder('oliveDrab', (-.565, .55, 0), .34, .24, 20, node='Train')
    m.revolve('dark', (-.515, .72, 0), (1, 0, 0), [(0, .10), (3.25, .075)], 16, node='Barrel')
    m.box('oliveDrab', (2.725, .66, 0), (.18, .18, .18), node='Nose')


def star_points(outer, inner):
    return [(math.cos(math.pi / 2 + i * math.pi / 5) * (outer if i % 2 == 0 else inner),
             math.sin(math.pi / 2 + i * math.pi / 5) * (outer if i % 2 == 0 else inner)) for i in range(10)]


def cckw(m):
    """GMC CCKW-353 2.5-ton 6x6 cargo truck. Overall length, width and cab height are the cited
    working envelope; every panel, fitting and wheel size below is an ESTIMATE."""
    OD, DK, ST, GL, WD, CV = 'oliveDrab', 'dark', 'steel', 'glazing', 'timber', 'uniform'
    R, W, ZW = 0.50, 0.24, 0.95            # tire radius, width, wheel-center z (ESTIMATES)
    AXLES = {'F': 2.05, 'R1': -2.05, 'R2': -1.15}
    hubs = []
    for label, x in AXLES.items():
        for side, z in (('L', -ZW), ('R', ZW)):
            sgn = 1 if side == 'R' else -1
            rim = gp.tire(m, f'Wheel{label}{side}', x, R, z, R, W, sgn)
            hubs.append((x, z + sgn * (W / 2 + 0.02), sgn, rim))
    for x, z, sgn, rim in hubs:
        m.marking('disc', tags=['hub'], center=(x, R, z), axis=(0, 0, sgn), radiusM=rim * 0.99, color='usaaOliveDrab')

    # Chassis: frame rails, cross members, three axles with differentials, springs, drive line, tank, muffler.
    with m.tagged('chassis'):
        for z in (-0.45, 0.45):
            m.box(DK, (0, 0.62, z), (6.30, 0.18, 0.10), node='Frame')
        for x in (-2.95, -1.60, -0.30, 1.10, 2.90):
            m.box(DK, (x, 0.64, 0), (0.12, 0.12, 0.88), node='Frame')
        for x in AXLES.values():
            m.strut(DK, (x, R, -ZW + 0.08), (x, R, ZW - 0.08), 0.058, sides=8, node='Frame')
            m.revolve(DK, (x, R, -0.16), (0, 0, 1), [(0.0, 0.10), (0.10, 0.17), (0.22, 0.17), (0.32, 0.10)], 12, node='Frame')
            for z in (-0.55, 0.55):
                m.box(DK, (x, R + 0.08, z), (0.07, 0.10, 0.10), node='Frame')   # spring seats
        for z in (-0.55, 0.55):
            m.box(DK, (2.05, 0.60, z), (1.20, 0.05, 0.075), node='Frame')       # front springs
            m.box(DK, (-1.60, 0.60, z), (2.10, 0.06, 0.075), node='Frame')      # tandem walking beam springs
        m.strut(DK, (1.95, 0.52, 0), (0.55, 0.55, 0), 0.035, sides=8, node='Frame')
        m.strut(DK, (0.20, 0.55, 0), (-1.10, 0.52, 0), 0.035, sides=8, node='Frame')
        m.strut(DK, (-1.20, 0.52, 0), (-2.05, 0.50, 0), 0.035, sides=8, node='Frame')
        m.box(DK, (0.35, 0.40, 0), (0.80, 0.30, 0.42), node='Frame')            # transmission and transfer case
        m.rounded_box(DK, (1.00, 0.46, -0.58), 0.95, 0.34, 0.34, 0.06, node='Frame')   # fuel tank
        m.strut(DK, (0.35, 0.40, 0.58), (-0.60, 0.40, 0.58), 0.09, sides=10, node='Frame')   # muffler
        m.strut(DK, (1.75, 0.60, 0.58), (0.40, 0.42, 0.58), 0.032, sides=8, node='Frame')
        for x in (-1.40, 0.0, 1.45):
            m.box(DK, (x, 0.68, 0), (0.18, 0.16, 0.30), node='Frame')           # fixed bed brackets
        for z in (-ZW, ZW):                                                       # mud flaps behind the rear axle
            m.box(DK, (-2.62, 0.10, z), (0.03, 0.40, 0.30), node='Frame')
        for z in (-0.32, 0.32):                                                   # winch bumper tow hooks
            m.strut(DK, (3.30, 0.62, z), (3.46 - 0.03, 0.62, z), 0.03, sides=6, node='Frame')
        m.strut(ST, (-3.30, 0.69, 0), (-3.43, 0.69, 0), 0.04, sides=8, node='Frame2')   # pintle

    # Front sheet metal: fenders with wheel arches, hood, grille, cab, doors, bed.
    with m.tagged('body'):
        for sgn in (-1, 1):
            z0, z1 = (0.56, 1.08) if sgn > 0 else (-1.08, -0.56)
            arch = gp.ring_pts(AXLES['F'], R, 0.60, 15, 165, 10)
            gp.prism(m, OD, [(1.45, 1.14), (2.95, 1.14), (3.12, 1.08), (3.25, 0.93), (3.27, 0.78), (3.20, 0.655)]
                     + arch + [(1.45, 0.655)], z0, z1, node='Body')
            rear = gp.ring_pts(-1.15, R, 0.58, 12, 90, 5) + gp.ring_pts(-2.05, R, 0.58, 90, 168, 5)
            gp.prism(m, OD, [(-2.72, 1.12), (-0.52, 1.12), (-0.52, 0.62)] + rear + [(-2.72, 0.62)],
                     (0.60 if sgn > 0 else -1.08), (1.08 if sgn > 0 else -0.60), node='Body')
        m.rounded_box(OD, (1.16, 0.90, 0), 1.50, 1.90, 0.70, 0.07, 2, node='Body')           # cab lower body
        m.rounded_box(OD, (1.16, 2.14, 0), 1.62, 1.98, 0.07, 0.09, 2, node='Body')           # roof
        for sgn in (-1, 1):
            for x, top in ((1.82, 2.15), (0.46, 2.15)):
                m.strut(OD, (x, 1.58, sgn * 0.90), (x - (0.04 if x > 1 else 0), top, sgn * 0.90), 0.032, sides=4, node='Body')
        with m.tagged('hood'):
            m.tapered_box(OD, (2.45, 1.14, 0), (1.10, 1.16), (1.02, 0.88), 0.50, node='Body')   # hood
        with m.tagged('door'):
            for sgn in (-1, 1):
                m.box(OD, (1.20, 0.93, sgn * 0.958), (1.14, 0.64, 0.026), node='Body')           # door panels
        m.box(OD, (1.90, 1.58, 0), (0.12, 0.08, 1.90), node='Body')                           # cowl
        m.box(OD, (0.10, 1.12, 0), (0.06, 0.62, 2.08), node='Body')                           # bed headboard
        m.box(OD, (0.10, 1.74, 0), (0.06, 0.10, 2.08), node='Body')
        for sgn in (-1, 1):
            m.box(OD, (-1.53, 1.19, sgn * 1.04), (3.70, 0.50, 0.06), node='Body')            # bed sides
            for x in (-3.18, -2.55, -1.92, -1.29, -0.66, -0.03):
                m.box(OD, (x, 1.19, sgn * 1.075), (0.07, 0.50, 0.035), node='Body')          # side ribs
            m.box(OD, (-1.53, 1.69, sgn * 1.055), (3.72, 0.05, 0.10), node='Body')           # rub rail
            for x in (-3.18, -1.29, 0.10):
                m.box(OD, (x, 1.14, sgn * 1.07), (0.18, 0.05, 0.05), node='Body')            # stake pockets
        m.box(OD, (-3.375, 1.18, 0), (0.05, 0.50, 2.08), node='Body')                         # tailgate
        for z in (-0.78, 0.0, 0.78):
            m.box(OD, (-3.40, 1.30, z), (0.03, 0.08, 0.36), node='Body')                      # tailgate stiffeners
        m.box(OD, (-3.38, 0.60, 0), (0.10, 0.17, 1.90), node='Body')                          # rear cross member
        m.box(OD, (2.90, 0.88, 0), (0.30, 0.10, 0.80), node='Body')                           # radiator support

    # Nose: the radiator shell and its grille, steel front bumper and winch roller, headlamps.
    m.rounded_box(OD, (3.08, 0.98, 0), 0.14, 0.98, 0.70, 0.06, 2, node='Nose')
    with m.tagged('front'):
        m.box(ST, (3.355, 0.55, 0), (0.15, 0.18, 2.08))
        for sgn in (-1, 1):
            m.box(ST, (3.355, 0.56, sgn * 1.05), (0.15, 0.20, 0.10))
        m.strut(ST, (3.36, 0.85, -0.88), (3.36, 0.85, 0.88), 0.045, sides=8)              # winch roller
        with m.shared_chart():
            for k in range(-5, 6):
                m.box(ST, (3.16, 1.00, k * 0.082), (0.02, 0.60, 0.032))                  # grille slats
            m.box(ST, (3.16, 1.29, 0), (0.025, 0.04, 0.92))
        for sgn in (-1, 1):
            m.revolve(ST, (2.96, 1.24, sgn * 0.70), (1, 0, 0), [(0.0, 0.080), (0.05, 0.095), (0.10, 0.085), (0.13, 0.060)], 12)   # lamp shell
            m.revolve('warmLight', (3.06, 1.24, sgn * 0.70), (1, 0, 0), [(0.0, 0.062), (0.03, 0.050), (0.055, 0.018)], 10)
            m.box(ST, (2.80, 1.145, sgn * 0.70), (0.10, 0.04, 0.10))

    # Glass, handles, mirrors, running boards, bed floor, canvas, bows, lamps.
    with m.tagged('trim'):
        for z0, z1 in ((-0.84, -0.04), (0.04, 0.84)):
            gp.prism(m, GL, [(1.86, 1.62), (1.89, 1.62), (1.81, 2.12), (1.78, 2.12)], z0, z1)  # split windshield
        m.box(ST, (1.86, 1.61, 0), (0.07, 0.03, 1.80))
        m.box(ST, (1.80, 2.12, 0), (0.06, 0.04, 1.80))
        m.box(ST, (1.83, 1.62, 0), (0.05, 0.50, 0.05))                                    # center post
        for sgn in (-1, 1):
            gp.prism(m, GL, [(0.70, 1.66), (1.76, 1.66), (1.72, 2.10), (0.70, 2.10)], sgn * 0.962, sgn * 0.972)   # door glass
            m.box(ST, (1.50, 1.50, sgn * 0.980), (0.12, 0.03, 0.03))                      # handle
            m.strut(ST, (1.78, 1.76, sgn * 0.93), (1.82, 1.86, sgn * 1.095), 0.014, sides=4)          # mirror arm
            m.box(ST, (1.82, 1.64, sgn * 1.105), (0.07, 0.30, 0.03))                      # mirror
            m.box(DK, (1.20, 0.72, sgn * 1.02), (1.36, 0.045, 0.14))                      # running board
            for x in (0.65, 1.75):
                m.box(DK, (x, 0.64, sgn * 0.97), (0.07, 0.10, 0.05))
            m.box(DK, (0.62, 1.12, sgn * 1.04), (0.52, 0.05, 0.02))                        # fuel filler step
        m.box(GL, (0.425, 1.66, 0), (0.02, 0.42, 1.00))                                   # rear cab window
        m.box(ST, (0.43, 1.64, 0), (0.025, 0.05, 1.06))
        with m.tagged('bedfloor'):
            m.box(WD, (-1.53, 1.12, 0), (3.70, 0.07, 2.12))                               # bed floor
        # Canvas cover over bows: half-ellipse section, springing at the rub rail.
        spring, rx, ry = 1.72, 1.03, 0.64
        outer = [(spring + ry * math.sin(a), rx * math.cos(a)) for a in [math.pi * i / 14 for i in range(15)]]
        inner = [(spring + (ry - 0.025) * math.sin(a), (rx - 0.025) * math.cos(a)) for a in [math.pi * i / 14 for i in range(14, -1, -1)]]
        gp.prism(m, CV, outer + inner, -3.36, 0.20, axis='x')
        gp.prism(m, CV, outer, 0.17, 0.20, axis='x')                                       # canvas front panel
        for x in (-3.30, -2.60):
            bow_o = [(spring + (ry - 0.03) * math.sin(a), (rx - 0.03) * math.cos(a)) for a in [math.pi * i / 14 for i in range(15)]]
            bow_i = [(spring + (ry - 0.07) * math.sin(a), (rx - 0.07) * math.cos(a)) for a in [math.pi * i / 14 for i in range(14, -1, -1)]]
            gp.prism(m, WD, bow_o + bow_i, x - 0.03, x + 0.03, axis='x')
        for sgn in (-1, 1):
            m.box('signalRed', (-3.405, 1.45, sgn * 0.92), (0.03, 0.08, 0.10))              # tail lamps
        # Chains and tie-downs on the open tailgate edge.
        for sgn in (-1, 1):
            m.strut(DK, (-3.34, 1.60, sgn * 0.95), (-3.43, 1.30, sgn * 0.90), 0.012, sides=4)
    with m.tagged('hood'):
        m.box(ST, (2.45, 1.645, 0), (1.00, 0.015, 0.05))                                  # hood hinge strip
        m.marking('polygon', tags=['hood'], origin=(2.45, 1.652, 0), axis=(0, 1, 0), uDir=(0, 0, 1),
                  points=star_points(0.22, 0.09), color='usaaInsigniaWhite')
    for sgn in (-1, 1):
        m.marking('polygon', tags=['door'], origin=(1.20, 1.25, sgn * 0.972), axis=(0, 0, sgn), uDir=(sgn, 0, 0),
                  points=star_points(0.20, 0.08), color='usaaInsigniaWhite')
    m.marking('planks', tags=['bedfloor'], widthM=0.14, lengthM=1.0, contrast=0.1, seam=0.6)


def d7(m):
    """Caterpillar D7 3T crawler tractor with a hydraulic angle-free straight blade, open WWII style.
    Overall length, width (the blade) and height (the exhaust cap) are the cited display envelope;
    track pitch, roller, sprocket, hood, seat, tank and blade section sizes are ESTIMATES."""
    OD, DK, ST = 'oliveDrab', 'dark', 'steel'
    C_S, R_S = (-1.48, 0.56), 0.56       # sprocket center and outer (cleat tip) radius
    C_I, R_I = (1.38, 0.48), 0.48        # idler center and outer radius
    ZT, TW = 0.80, 0.46                  # track center z and shoe width
    for sgn, side in ((-1, 'L'), (1, 'R')):
        z = sgn * ZT
        gp.track_shoes(m, DK, C_S, R_S, C_I, R_I, z, TW, 0.22, node='Shoes')
        # Track frame beam, five bottom rollers, two carriers, idler and its hub boss.
        with m.tagged('frame'):
            m.box(ST, (0.05, 0.30, z), (2.30, 0.12, 0.16), node='Rollers')
            for x in (-0.95, -0.50, -0.05, 0.40, 0.85):
                gp.lathe_z(m, ST, x, 0.215, z - 0.15, [(0.0, 0.10), (0.12, 0.125), (0.18, 0.125), (0.30, 0.10)], 12, node='Rollers')
            for x in (-0.55, 0.45):
                ytop = 0.96 - 0.02 * (x + 1.0)                      # underside of the top run, ESTIMATE
                gp.lathe_z(m, ST, x, ytop - 0.08 - 0.07, z - 0.10, [(0.0, 0.065), (0.10, 0.075), (0.20, 0.065)], 10, node='Rollers')
                m.box(ST, (x, ytop - 0.20, z), (0.08, 0.10, 0.10), node='Rollers')
            gp.lathe_z(m, ST, C_I[0], C_I[1], z - 0.15, [(0.0, 0.30), (0.02, 0.37), (0.11, 0.37), (0.13, 0.42), (0.17, 0.42), (0.19, 0.37), (0.28, 0.37), (0.30, 0.30)], 16, node='Rollers')
            gp.lathe_z(m, ST, C_I[0], C_I[1], z + sgn * 0.15 - (0.0 if sgn > 0 else 0.0), [(0.0, 0.14), (0.05, 0.12), (0.075, 0.05)], 12, direction=sgn, node='Rollers')
            m.strut(ST, (0.9, 0.46, z + sgn * 0.17), (C_I[0], C_I[1], z + sgn * 0.17), 0.05, sides=6, node='Rollers')   # idler yoke
            m.strut(DK, (0.2, 0.60, z + sgn * 0.15), (1.1, 0.52, z + sgn * 0.15), 0.035, sides=8, node='Springs')       # recoil spring
        # Sprocket: the node the rig turns.
        node = 'Track' + side
        gp.gear(m, ST, C_S[0], C_S[1], z - 0.13, z + 0.13, 11, 0.36, 0.45, node=node)
        gp.lathe_z(m, ST, C_S[0], C_S[1], z + sgn * 0.13, [(0.0, 0.17), (0.05, 0.15), (0.085, 0.08)], 12, direction=sgn, node=node)

    # Body: engine, hood, final-drive case, side decks, tank, seat, controls, exhaust, drawbar.
    with m.tagged('body'):
        m.tapered_box(OD, (0.78, 0.78, 0), (1.46, 0.80), (1.32, 0.58), 0.66, node='Body')
        m.box(OD, (-0.70, 0.25, 0), (1.62, 0.62, 1.04), node='Body')               # transmission and final-drive case
        m.box(OD, (-1.75, 0.30, 0), (0.34, 0.50, 0.74), node='Body')               # rear case
        m.box(OD, (0.60, 0.40, 0), (1.80, 0.40, 1.00), node='Body')                # main frame
        for sgn in (-1, 1):
            m.box(OD, (-0.62, 1.10, sgn * 0.80), (1.30, 0.04, 0.56), node='Body')  # track fenders
            for x in (-1.15, -0.62, -0.10):
                m.box(OD, (x, 1.00, sgn * 0.57), (0.05, 0.10, 0.04), node='Body')   # fender brackets
            m.box(OD, (-0.55, 0.88, sgn * 0.45), (1.0, 0.04, 0.12), node='Body')
        m.box(OD, (-0.55, 0.86, 0), (1.30, 0.05, 0.96), node='Body')               # operator deck
        m.rounded_box(OD, (-1.42, 1.10, 0), 0.62, 0.92, 0.50, 0.08, 2, node='Body')  # fuel tank
        m.cylinder(OD, (-1.40, 1.60, -0.18), 0.07, 0.05, 10, node='Body')           # filler cap
        for sgn in (-1, 1):
            m.box(OD, (0.60, 1.16, sgn * 0.37), (0.16, 0.10, 0.12), node='Body')     # ram base bracket
            m.strut(OD, (0.95, 0.96, sgn * 0.34), (0.62, 1.14, sgn * 0.40), 0.014, sides=6, node='Body')   # hydraulic hose
            m.strut(OD, (0.95, 0.90, sgn * 0.34), (0.58, 1.10, sgn * 0.40), 0.014, sides=6, node='Body')
    m.rounded_box(OD, (1.51, 0.60, 0), 0.20, 0.80, 0.82, 0.08, 2, node='Nose')       # radiator
    with m.tagged('trim'):
        with m.shared_chart():
            for k in range(-4, 5):
                m.box(ST, (1.625, 0.72, k * 0.085), (0.02, 0.56, 0.035), node='Grille')
        m.box(ST, (1.68, 0.46, 0), (0.12, 0.14, 1.04), node='Grille')                 # front pusher bar
        for sgn in (-1, 1):
            m.revolve(ST, (1.64, 1.46, sgn * 0.28), (1, 0, 0), [(0.0, 0.07), (0.05, 0.08), (0.09, 0.06)], 10, node='Grille')
            m.revolve('warmLight', (1.72, 1.46, sgn * 0.28), (1, 0, 0), [(0.0, 0.052), (0.03, 0.040), (0.05, 0.014)], 8, node='Lamps')
            m.strut(ST, (1.64, 1.20, sgn * 0.28), (1.64, 1.44, sgn * 0.28), 0.02, sides=6, node='Grille')
        with m.shared_chart():
            for sgn in (-1, 1):
                for k in range(7):
                    def hz(y):
                        return 0.40 - (y - 0.78) * 0.11 / 0.66 + 0.006
                    m.strut(DK, (0.25 + 0.14 * k, 0.98, sgn * hz(0.98)), (0.25 + 0.14 * k, 1.28, sgn * hz(1.28)), 0.012, sides=4, node='Louvers')   # hood side louvers
        m.strut(DK, (1.15, 1.44, 0.20), (1.15, 1.84, 0.20), 0.045, sides=10, node='Stack')   # exhaust
        m.revolve(DK, (1.15, 1.84, 0.20), (0, 1, 0), [(0.0, 0.058), (0.06, 0.040)], 10, node='Stack')   # cap tops out at 1.90
        m.strut(DK, (0.55, 1.44, -0.20), (0.55, 1.72, -0.20), 0.06, sides=10, node='Stack')   # air cleaner
        m.revolve(DK, (0.55, 1.72, -0.20), (0, 1, 0), [(0.0, 0.085), (0.07, 0.07)], 10, node='Stack')
        m.rounded_box(DK, (-1.00, 1.08, 0), 0.50, 0.46, 0.08, 0.04, 2, node='Seat')
        m.box(DK, (-1.04, 1.16, 0), (0.07, 0.40, 0.44), node='Seat')
        m.strut(DK, (-0.80, 1.08, 0), (-0.80, 0.86, 0), 0.03, sides=6, node='Seat')
        for z in (-0.18, 0.18):
            m.strut(DK, (-0.38, 0.90, z), (-0.45, 1.50, z * 1.15), 0.014, sides=6, node='Seat')   # steering clutch levers
            m.box(DK, (-0.30, 0.90, z * 1.7), (0.12, 0.03, 0.10), node='Seat')                    # brake pedals
        m.strut(DK, (-0.30, 0.90, 0), (-0.20, 1.20, 0), 0.012, sides=6, node='Seat')              # gear lever
        m.box(ST, (-1.96, 0.38, 0), (0.22, 0.10, 0.62), node='Drawbar')                           # drawbar
        m.box(ST, (-2.00, 0.48, 0), (0.08, 0.14, 0.40), node='Drawbar')
        m.strut(ST, (-1.95, 0.40, 0), (-1.95, 0.62, 0), 0.04, sides=8, node='Drawbar')             # pin
    # Push arms, hydraulic lift rams and hoses, and the blade (the rig's BladeRaise and BladeTilt).
    for sgn in (-1, 1):
        gp.prism(m, OD, [(0.18, 0.36), (0.20, 0.58), (1.30, 0.64), (1.93, 0.68), (1.93, 0.30), (1.30, 0.34)],
                 sgn * 1.05, sgn * 1.15, node='BladeRaise')
        m.strut(OD, (0.60, 1.20, sgn * 0.42), (1.25, 1.02, sgn * 0.62), 0.055, sides=10, node='BladeRaise')    # lift ram barrel
        m.strut(OD, (1.25, 1.02, sgn * 0.62), (1.82, 0.90, sgn * 0.80), 0.028, sides=8, node='BladeRaise')    # ram rod
        m.box(OD, (1.80, 0.88, sgn * 0.82), (0.12, 0.16, 0.12), node='BladeRaise')                            # blade-top bracket
        m.strut(OD, (1.15, 0.70, sgn * 1.08), (1.92, 0.98, sgn * 1.00), 0.035, sides=8, node='BladeRaise')    # tilt brace
        m.strut(OD, (0.20, 0.47, sgn * 0.98), (0.20, 0.47, sgn * 1.19), 0.07, sides=10, node='BladeRaise')    # trunnion
    m.strut(OD, (0.20, 0.47, -1.12), (0.20, 0.47, 1.12), 0.05, sides=8, node='BladeRaise')                   # cross shaft
    blade_front = [(2.030, 0.05), (2.035, 0.24), (2.015, 0.48), (1.980, 0.72), (1.940, 0.92), (1.915, 0.98)]
    blade_back = [(x - 0.075, y) for x, y in reversed(blade_front)]
    gp.prism(m, ST, blade_front + blade_back, -1.225, 1.225, node='BladeTilt')
    gp.prism(m, ST, [(2.02, 0.0), (2.04, 0.0), (2.04, 0.17), (2.02, 0.19), (1.99, 0.19), (1.99, 0.0)], -1.225, 1.225, node='BladeTilt')   # cutting edge
    with m.shared_chart():
        for z in (-0.90, -0.45, 0.0, 0.45, 0.90):
            m.box(ST, (1.865, 0.12, z), (0.07, 0.78, 0.07), node='BladeTilt')
        for y in (0.28, 0.72):
            m.box(ST, (1.82, y, 0), (0.07, 0.07, 2.30), node='BladeTilt')
        for sgn in (-1, 1):
            m.box(ST, (1.93, 0.05, sgn * 1.20), (0.14, 0.95, 0.05), node='BladeTilt')           # end plates
    m.marking('polygon', tags=['body'], origin=(0.78, 1.445, 0), axis=(0, 1, 0), uDir=(0, 0, 1),
              points=star_points(0.20, 0.08), color='usaaInsigniaWhite')


out, opts = kit.cli_args()
asset = os.path.basename(out).removesuffix('.glb')
m = kit.Model(asset, skin=512)
if asset == 'type94-cargo-truck':
    truck(m, 5.35, 1.90, 2.25, (-1.45, 1.48), 3.15)
elif asset == 'gmc-cckw-353':
    cckw(m)
elif asset == 'type38-75mm-field-gun':
    type38(m)
elif asset == 'caterpillar-d7-3t':
    d7(m)
else:
    raise ValueError(f'unknown F4 ground asset {asset}')
m.export(out)
