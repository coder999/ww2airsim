"""F4 Leyte maritime and rescue assets. Original work, AGPL-3.0-or-later.

LCVP overall dimensions use the Naval History and Heritage Command landing-boat
manual: 36 ft 4 in by 10 ft 9 in. The rescue launch is the F3-approved 63 ft
USAAF class; beam and superstructure are ESTIMATES. The Type A-3 five-person raft
identity is documented in the Federal Register and Wright Field specification listing;
its shape and survivor pose are ESTIMATES. Buoy dimensions are ESTIMATES. Frame is
glTF +x forward, +y up, +z starboard, metres. No wake, water, lighting or effects.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import f4geom as g  # noqa: E402


def interp(table, x):
    """Piecewise-linear lookup: table is [(x, value)] with x increasing."""
    if x <= table[0][0]:
        return table[0][1]
    for (x0, v0), (x1, v1) in zip(table, table[1:]):
        if x <= x1:
            return v0 + (v1 - v0) * (x - x0) / (x1 - x0)
    return table[-1][1]


def gun30(m, base, yaw, node=None):
    """A .30-caliber M1919 on a pintle post: receiver, jacketed barrel, spade grips, ammo box."""
    x, y, z = base
    m.strut('dark', (x, y, z), (x, y + .30, z), .035, sides=6, node=node)
    g.obox(m, 'dark', (x, y + .36, z), (.30, .13, .11), yaw=yaw, node=node)
    d = g.rot((1, 0, 0), yaw)
    m.strut('dark', (x + d[0] * .12, y + .37, z + d[2] * .12), (x + d[0] * .46, y + .37, z + d[2] * .46), .030, .028, sides=8, node=node)
    m.strut('dark', (x + d[0] * .46, y + .37, z + d[2] * .46), (x + d[0] * .80, y + .37, z + d[2] * .80), .016, sides=6, node=node)
    side = g.rot((0, 0, 1), yaw)
    for k in (-1, 1):
        m.strut('dark', (x - d[0] * .15 + side[0] * k * .05, y + .38, z - d[2] * .15 + side[2] * k * .05),
                (x - d[0] * .24 + side[0] * k * .07, y + .46, z - d[2] * .24 + side[2] * k * .07), .012, sides=4, node=node)
    g.obox(m, 'steel', (x + side[0] * .17, y + .27, z + side[2] * .17), (.20, .13, .09), yaw=yaw, node=node)


def lcvp(m):
    # Overall 11.08 x 3.28 m: NHHC landing-boat manual (36 ft 4 in x 10 ft 9 in). Everything else is ESTIMATE.
    X0, X1 = -5.54, 5.29            # transom face, bow end where the ramp hinges
    HALF = {'b': [(-5.54, 1.52), (-4.6, 1.60), (-3.0, 1.60), (2.8, 1.60), (4.2, 1.54), (4.9, 1.45), (5.29, 1.42)],
            'yk': [(-5.54, .30), (-4.6, .10), (-3.0, 0), (3.2, 0), (4.6, .08), (5.29, .30)],
            'yc': [(-5.54, .62), (-3.0, .42), (3.2, .42), (4.6, .55), (5.29, .75)],
            'g': [(-5.54, 1.32), (-3.0, 1.38), (2.8, 1.42), (4.6, 1.52), (5.29, 1.55)]}
    T, FLOOR = .08, .40
    xs = [-5.54, -5.2, -4.6, -3.8, -3.0, -1.5, 0, 1.5, 2.8, 3.6, 4.2, 4.6, 4.9, 5.1, 5.29]
    rings = []
    for x in xs:
        b, yk, yc, gy = (interp(HALF[k], x) for k in ('b', 'yk', 'yc', 'g'))
        bw = b * .74
        fl = max(FLOOR, yk + .08)
        outer = [(-b, gy), (-b, yc), (-bw, yk), (bw, yk), (b, yc), (b, gy)]
        inner = [(b - T, gy), (b - T, fl), (-(b - T), fl), (-(b - T), gy)]
        rings.append([(x, y, z) for z, y in outer + inner])
    g.loft(m, 'oliveDrab', rings, node='Hull')
    b_at = lambda x: interp(HALF['b'], x)
    g_at = lambda x: interp(HALF['g'], x)
    with m.shared_chart():
        # Transom plate closes the well's stern end.
        m.box('oliveDrab', (X0 + .05, FLOOR - .02, 0), (.10, g_at(X0) - FLOOR + .02, 2 * (b_at(X0) - T) + .02), node='Hull')
        # Rubbing strakes just under the gunwale, either side.
        for s in (-1, 1):
            m.box('timber', (-.25, g_at(0) - .30, s * (b_at(0) + .015)), (9.2, .10, .05), node=None)
            m.box('timber', (-.25, g_at(0) - .62, s * (b_at(0) + .015)), (9.2, .08, .05), node=None)
        # Cargo and personnel well: floor planking and cross battens.
        m.box('deck', (.55, FLOOR - .01, 0), (8.2, .035, 2 * (1.60 - T) - .04), node=None)
        for i in range(17):
            m.box('steel', (-3.25 + i * .5, FLOOR + .015, 0), (.05, .025, 2 * (1.60 - T) - .08), node=None)
        for s in (-1, 1):
            m.box('steel', (.55, FLOOR + .02, s * .52), (8.0, .03, .06), node=None)
        # Vehicle tie-down rings and the troop grab-rail inside the gunwale.
        for x in (-2.4, -.4, 1.6, 3.6):
            for s in (-1, 1):
                m.strut('dark', (x, FLOOR + .02, s * 1.30), (x, FLOOR + .10, s * 1.30), .02, sides=4, node=None)
                g.cable(m, 'dark', [(x, FLOOR + .10, s * 1.26), (x, FLOOR + .10, s * 1.34)], .018, 4, node=None)
        for s in (-1, 1):
            m.strut('steel', (-3.0, g_at(-3.0) - .12, s * (b_at(-3.0) - T - .05)), (4.6, g_at(4.6) - .12, s * (b_at(4.6) - T - .05)), .022, sides=6, node=None)
        # Fore bulkhead stiffeners behind the ramp, and ramp-well sill.
        m.box('oliveDrab', (5.12, FLOOR + .06, 0), (.16, .12, 2 * (1.40 - T)), node='Hull')
        # Stern: coxswain's raised standing platform, flanked by gun tubs; engine box ahead of him.
        m.box('oliveDrab', (-4.98, FLOOR - .02, 0), (1.08, .62, 2 * (1.52 - T) - .02), node='Hull')
        m.box('deck', (-4.98, FLOOR + .60, 0), (1.04, .03, 1.40), node=None)
        m.box('oliveDrab', (-3.55, FLOOR - .02, 0), (2.10, .90, 1.30), node='Hull')            # engine box
        g.hexa(m, 'oliveDrab', [(-4.60, FLOOR + .88, -.65), (-2.50, FLOOR + .88, -.65), (-2.50, FLOOR + .88, .65), (-4.60, FLOOR + .88, .65),
                                (-4.52, FLOOR + 1.04, -.52), (-2.62, FLOOR + 1.04, -.52), (-2.62, FLOOR + 1.04, .52), (-4.52, FLOOR + 1.04, .52)], node=None)
        for i in range(7):
            m.box('dark', (-4.15 + i * .25, FLOOR + 1.045, 0), (.09, .012, .72), node=None)  # engine louvers
        m.box('steel', (-3.55, FLOOR + 1.07, .62), (.90, .03, .30), node=None)              # hatch handle plate
        # Coxswain's station: wheel, binnacle and armor plates (front, two sides) with a vision slit.
        m.box('dark', (-5.10, FLOOR + .66, 0), (.30, .55, .46), node=None)               # steering console
        m.revolve('dark', (-5.10, FLOOR + 1.30, 0), (-1, .5, 0), [(0, .02), (.04, .20)], 12, node=None)
        m.strut('dark', (-5.10, FLOOR + .90, 0), (-5.10, FLOOR + 1.25, 0), .018, sides=6, node=None)
        PY = FLOOR + .60                                                                  # platform top, 1.00 m
        m.box('steel', (-4.58, PY, 0), (.045, .64, .92), node=None)                        # front plate below the slit
        m.box('steel', (-4.58, 2.10 - .30, 0), (.045, .30, .92), node=None)                # front plate above the slit (top 2.10 m)
        for s in (-1, 1):
            m.box('steel', (-5.00, PY, s * .46), (.93, 2.10 - PY - .12, .045), node=None)  # side plates
            m.box('steel', (-5.00, 2.10 - .12, s * .46), (.93, .12, .045), node=None)
            m.box('steel', (-4.58, PY, s * .46), (.10, 2.10 - PY, .08), node=None)         # corner posts
        # Exhaust stack and mufflers run up the starboard quarter.
        m.strut('steel', (-2.90, FLOOR + .90, .78), (-2.90, FLOOR + 1.50, .78), .07, sides=8, node=None)
        m.strut('dark', (-2.90, FLOOR + 1.50, .78), (-2.90, FLOOR + 1.58, .78), .085, sides=8, node=None)
        # Gun tubs at the stern quarters, each with a .30 cal on a pintle, and cleats on the gunwale.
        for s in (-1, 1):
            cx, cz = -2.35, s * 1.15
            gy = g_at(cx)
            m.cylinder('oliveDrab', (cx, gy - .06, cz), .44, .07, 16, node=None)
            g.sweep_loop(m, 'oliveDrab', g.arc(cx, gy + .01, cz, .40, 0, 360, 16)[:-1],
                         [(-.03, 0), (.03, 0), (.03, .42), (-.03, .42)], node=None, smooth=False)
            gun30(m, (cx, gy + .01, cz), -s * 18, node=None)
            for cx2 in (-4.35, 0.2, 4.0):
                m.box('steel', (cx2, g_at(cx2) + .03, s * (b_at(cx2) - .12)), (.26, .05, .08), node=None)
                for e in (-1, 1):
                    m.box('steel', (cx2 + e * .10, g_at(cx2) + .09, s * (b_at(cx2) - .12)), (.06, .09, .07), node=None)
        # Stern gear: skeg, rudder and the propeller in its tunnel under the counter.
        m.box('oliveDrab', (-5.38, .14, 0), (.28, .24, .30), node='Hull')
        m.box('steel', (-5.48, .34, 0), (.10, .66, .50), node=None)
        for s in (-1, 1):
            m.strut('steel', (-5.20, .46, s * .22), (-5.42, .34, s * .22), .03, sides=6, node=None)
    with m.shared_chart():
        # Inside frames and the gunwale stringer: wooden hull ribs every 0.55 m, either side.
        for s in (-1, 1):
            for i in range(17):
                x = -2.2 + i * .45
                zi = s * (b_at(x) - T - .015)
                m.box('oliveDrab', (x, FLOOR, zi), (.06, g_at(x) - FLOOR - .10, .03))
            # Plank seams on the topsides (thin proud lines).
            for k, dy in enumerate((.18, .46, .74)):
                m.box('dark', (-.2, FLOOR - .15 + dy, s * (b_at(0) + .002)), (9.6, .012, .012))
        # Ammunition cans and a boat hook stowed along the starboard side, a bilge pump handle, a life ring.
        for k in range(3):
            m.box('oliveDrab', (-2.35 + .32 * k - .15, g_at(-2.35) - .05, 1.15 - .62), (.28, .18, .14))
            m.box('steel', (-2.35 + .32 * k - .15, g_at(-2.35) + .13, 1.15 - .62), (.12, .02, .04))
        m.strut('timber', (-2.2, FLOOR + .03, 1.28), (2.4, FLOOR + .03, 1.28), .018, sides=6)
        m.strut('steel', (2.4, FLOOR + .03, 1.28), (2.55, FLOOR + .06, 1.28), .012, sides=4)
        m.strut('steel', (-3.1, FLOOR + .1, -.95), (-3.1, FLOOR + .55, -.95), .02, sides=6)
        m.strut('steel', (-3.1, FLOOR + .55, -.95), (-3.1, FLOOR + .55, -.65), .016, sides=4)
        # Spray rail: a raised lip on the bow gunwales, and the keel skeg strips under the hull.
        for s in (-1, 1):
            m.box('oliveDrab', (4.55, g_at(4.55) - .03, s * (b_at(4.55) - T / 2)), (1.4, .12, .09))
            m.box('timber', (-1.0, .0, s * .45), (7.5, .05, .06))
        # Hull number and bow-ramp warning stripes are painted markings; stencils stay out of the mesh.
    m.propeller('dark', (-5.22, .31, 0), .54, 3, .12, .045, .10, node=None)
    # Bow: ramp cheeks (Nose) and the ramp itself, hinged at its foot (pivot set in the entry).
    for s in (-1, 1):
        m.box('oliveDrab', (5.40, .30, s * 1.37), (.28, 1.32, .20), node='Nose')
        m.box('steel', (5.40, .40, s * 1.31), (.28, .14, .10), node=None)
    g.hexa(m, 'steel', [(5.42, .30, -1.27), (5.54, .30, -1.27), (5.54, .30, 1.27), (5.42, .30, 1.27),
                         (5.20, 1.55, -1.27), (5.32, 1.55, -1.27), (5.32, 1.55, 1.27), (5.20, 1.55, 1.27)], node='Ramp')
    with m.shared_chart():
        for k in range(7):
            t = (k + .6) / 7.4
            y = .30 + 1.25 * t
            x = 5.42 - .22 * t
            m.box('steel', (x - .05, y - .025, 0), (.035, .05, 2.30), node='Ramp')
        for s in (-1, 1):
            g.hexa(m, 'steel', [(5.42, .30, s * 1.27), (5.54, .30, s * 1.27), (5.54, .30, s * 1.33), (5.42, .30, s * 1.33),
                                 (5.20, 1.55, s * 1.27), (5.32, 1.55, s * 1.27), (5.32, 1.55, s * 1.33), (5.20, 1.55, s * 1.33)], node='Ramp')
    # Ramp lifting cables from the cheek heads to the ramp's upper edge, bow fender, lifting eyes, towing bitt.
    with m.shared_chart():
        for s in (-1, 1):
            g.cable(m, 'dark', [(5.40, 1.60, s * 1.37), (5.26, 1.50, s * 1.20)], .012, 4)
            g.cable(m, 'dark', [(5.26, 1.50, s * 1.20), (5.26, 1.20, s * 1.20), (5.26, .80, s * 1.20)], .01, 4)
            for x in (-5.0, 4.4):
                m.strut('steel', (x, g_at(x) - .02, s * (b_at(x) - .06)), (x, g_at(x) + .10, s * (b_at(x) - .06)), .03, sides=6)
                g.cable(m, 'steel', [(x, g_at(x) + .10, s * (b_at(x) - .11)), (x, g_at(x) + .10, s * (b_at(x) - .01))], .02, 4)
        g.sweep_loop(m, 'timber', [(5.00, 1.50, 1.30), (5.20, 1.54, 1.26), (5.20, 1.54, -1.26), (5.00, 1.50, -1.30)] + [(4.85, 1.49, -1.0), (4.85, 1.49, 1.0)],
                     [(-.035, -.035), (.035, -.035), (.035, .035), (-.035, .035)], smooth=False)
        m.cylinder('steel', (-4.55, FLOOR + .98, 0), .07, .07, 8)



def rescue_boat(m):
    # 63 ft (19.20 m) overall: U.S. congressional record. Beam over guards 4.65 m and the 23.75 in / 0.60 m
    # three-blade screws follow the Higgins-class crash-boat figures on uscrashboats.org (read 2026-10-14,
    # 15 ft 4 in over guards). Hull form, deck heights, deckhouse, mounts and fittings are ESTIMATES;
    # the overall 3.60 m height is the F3-approved estimate and keeps the house low.
    ST = [  # x, half-beam at deck edge, half-beam at chine, keel y, chine y, deck-edge y
        (-9.60, 1.85, 1.60, .50, .85, 1.78), (-9.00, 2.05, 1.80, .30, .70, 1.80), (-8.00, 2.17, 1.92, .12, .62, 1.84),
        (-6.00, 2.20, 1.98, 0, .60, 1.90), (-3.00, 2.20, 2.00, 0, .60, 1.95), (0.00, 2.20, 2.00, 0, .60, 1.97),
        (3.00, 2.16, 1.96, 0, .64, 2.03), (5.00, 2.00, 1.72, .06, .85, 2.15), (6.50, 1.72, 1.35, .25, 1.15, 2.28),
        (7.80, 1.30, .85, .55, 1.45, 2.42), (8.70, .85, .42, 1.00, 1.80, 2.55), (9.30, .40, .14, 1.60, 2.15, 2.65),
        (9.60, .08, .03, 2.20, 2.45, 2.72)]
    CAM = .07
    col = lambda i: [(s[0], s[i]) for s in ST]
    bd = lambda x: interp(col(1), x)
    bc = lambda x: interp(col(2), x)
    yk = lambda x: interp(col(3), x)
    yd = lambda x: interp(col(5), x)
    rings = []
    for x, d, c, k, ch, y in ST:
        rings.append([(x, k, 0), (x, ch, c), (x, y, d), (x, y + CAM, 0), (x, y, -d), (x, ch, -c)])
    g.loft(m, 'hull', rings, node='Hull')
    with m.shared_chart():
        # Deck plating: one cambered sheet laid 1 cm proud of the hull top.
        fr = [-1, -.5, 0, .5, 1]
        xs = [s[0] for s in ST[:-1]] + [9.45]
        verts, faces = [], []
        for x in xs:
            for f in fr:
                verts.append((x, yd(x) + CAM * (1 - f * f) + .012, f * (bd(x) - .10)))
        for i in range(len(xs) - 1):
            for k in range(4):
                a = i * 5 + k
                faces.append((a, a + 1, a + 6, a + 5))
        if g.volume(verts, faces) != 0:
            pass
        m._part('deck', verts, [tuple(reversed(f)) for f in faces], None)
        # Guards (rubbing strakes) and hanging fenders.
        for s in (-1, 1):
            pts = [(x, yd(x) - .10, s * (bd(x) + .04)) for x in (-7.5, -6.0, -3.0, 0.0, 3.0, 5.0, 6.5)]
            g.cable(m, 'timber', pts, .06, 6)
            pts = [(x, yd(x) - .40, s * (bd(x) + .02)) for x in (-6.0, -3.0, 0.0, 3.0, 5.0)]
            g.cable(m, 'timber', pts, .04, 6)
            for x in (-4.5, -1.0, 2.5):
                m.strut('boot', (x, yd(x) - .45, s * (bd(x) + .02)), (x, yd(x) + .05, s * (bd(x) + .02)), .10, sides=10)
                g.cable(m, 'dark', [(x, yd(x) + .05, s * (bd(x) - .05)), (x, yd(x) + .22, s * (bd(x) - .20))], .012, 4)
        # Aft cabin and pilot house (hexahedra, raked fronts); roofs are slabs a hair larger.
        DK = lambda x: yd(x) - .02
        g.hexa(m, 'superstructure', [(-3.2, DK(-3.2), -1.52), (.7, DK(.7), -1.52), (.7, DK(.7), 1.52), (-3.2, DK(-3.2), 1.52),
                                    (-2.95, 2.80, -1.36), (.7, 2.80, -1.36), (.7, 2.80, 1.36), (-2.95, 2.80, 1.36)])
        g.hexa(m, 'superstructure', [(.7, DK(.7), -1.30), (3.55, DK(3.55), -1.30), (3.55, DK(3.55), 1.30), (.7, DK(.7), 1.30),
                                    (.7, 3.00, -1.14), (3.12, 3.00, -1.14), (3.12, 3.00, 1.14), (.7, 3.00, 1.14)])
        g.hexa(m, 'deck', [(.62, 3.00, -1.22), (3.22, 3.00, -1.22), (3.22, 3.00, 1.22), (.62, 3.00, 1.22),
                           (.62, 3.05, -1.22), (3.22, 3.05, -1.22), (3.22, 3.05, 1.22), (.62, 3.05, 1.22)])
        g.hexa(m, 'deck', [(-3.05, 2.80, -1.42), (.7, 2.80, -1.42), (.7, 2.80, 1.42), (-3.05, 2.80, 1.42),
                           (-3.05, 2.84, -1.42), (.7, 2.84, -1.42), (.7, 2.84, 1.42), (-3.05, 2.84, 1.42)])
        # Windshield (four raked panes), pilot-house side windows, cabin portholes.
        def front(y, z):
            return (3.55 - .43 * (y - yd(3.55)) / (3.00 - yd(3.55)), y, z)
        for k in range(4):
            z0 = -1.02 + k * .52
            quad = [front(2.45, z0 + .50), front(2.45, z0), front(2.90, z0), front(2.90, z0 + .50)]
            g.slab(m, 'glazing', quad, .025)
        for zf in (-.02, 0, 1.02):
            pass
        for s in (-1, 1):
            half = lambda y: 1.30 - .16 * (y - yd(1)) / (3.00 - yd(1))
            for x0, x1 in ((.95, 1.65), (1.85, 2.55), (2.75, 3.25)):
                xe = lambda x, y: min(x, 3.55 - .43 * (y - yd(3.55)) / (3.00 - yd(3.55)) - .03)
                q = [(xe(x0, 2.45), 2.45, s * half(2.45)), (xe(x1, 2.45), 2.45, s * half(2.45)),
                     (xe(x1, 2.90), 2.90, s * half(2.90)), (xe(x0, 2.90), 2.90, s * half(2.90))]
                g.slab(m, 'glazing', q if s > 0 else list(reversed(q)), .02 if s > 0 else .02)
            for xp in (-2.55, -1.75, -.95, -.15):
                m.revolve('glazing', (xp, 2.35, s * 1.425), (0, 0, s), [(0, .15), (.03, .15)], 10)
                m.revolve('dark', (xp, 2.35, s * 1.41), (0, 0, s), [(0, .19), (.03, .19)], 10)
            # Side doors (dark recesses) at the pilot-house/cabin joint and grab rails.
            g.slab(m, 'dark', [(.20, 2.02, s * 1.45), (.60, 2.02, s * 1.45), (.60, 2.62, s * 1.45), (.20, 2.62, s * 1.45)], .02 * s)
            g.cable(m, 'steel', [(.05, 2.20, s * 1.50), (.05, 2.60, s * 1.50)], .02, 4)
            g.cable(m, 'steel', [(-2.8, 2.88, s * 1.30), (.5, 2.88, s * 1.30)], .02, 4)
        g.slab(m, 'dark', [(-3.2, 2.05, -.35), (-3.2, 2.05, .35), (-3.2, 2.62, .35), (-3.2, 2.62, -.35)], .02)
        # Roof fittings: skylight, ventilator cowls, two raft canisters, searchlight, mast.
        g.hexa(m, 'steel', [(-2.4, 2.84, -.4), (-1.5, 2.84, -.4), (-1.5, 2.84, .4), (-2.4, 2.84, .4),
                           (-2.3, 3.00, -.3), (-1.6, 3.00, -.3), (-1.6, 3.00, .3), (-2.3, 3.00, .3)])
        g.slab(m, 'glazing', [(-2.25, 3.0, -.25), (-1.65, 3.0, -.25), (-1.65, 3.0, .25), (-2.25, 3.0, .25)], .01)
        for z in (-.95, .95):
            m.revolve('steel', (-.55, 2.84, z), (0, 1, 0), [(0, .12), (.20, .12), (.32, .17)], 10)
            m.revolve('dark', (-.55, 3.16, z), (0, 1, 0), [(0, .15), (.02, .15)], 10)
        for z in (-.75, .75):
            m.revolve('oliveDrab', (-2.95, 2.98, z), (1, 0, 0), [(0, .17), (1.30, .17)], 12)
            for xs_ in (-2.6, -1.9):
                m.box('webbing', (xs_, 2.82, z), (.05, .30, .40) )
        m.revolve('steel', (2.45, 3.05, 0), (0, 1, 0), [(0, .07), (.20, .06)], 8)
        m.revolve('steel', (2.45, 3.25, 0), (1, 0, 0), [(0, .17), (.30, .17)], 12)
        m.revolve('warmLight', (2.75, 3.25, 0), (1, 0, 0), [(0, .13), (.02, .13)], 12)
        m.strut('steel', (.22, 2.84, 0), (.22, 3.60, 0), .045, .02, sides=6)
        m.box('steel', (.22, 3.36, 0), (.05, .035, .95))
        m.box('signalRed', (.22, 3.52, .55), (.03, .03, .03))
        g.cable(m, 'dark', [(.22, 3.38, -.46), (-2.9, 2.84, -.70), ], .008, 4)
        g.cable(m, 'dark', [(.22, 3.38, .46), (-2.9, 2.84, .70), ], .008, 4)
        # Exhaust stacks at the cabin's after corners and transom outlets.
        for s in (-1, 1):
            m.strut('steel', (-3.35, 1.95, s * 1.25), (-3.35, 3.05, s * 1.25), .08, sides=10)
            m.strut('dark', (-3.35, 3.05, s * 1.25), (-3.35, 3.12, s * 1.25), .095, sides=10)
            m.revolve('dark', (-9.585, 1.00, s * .85), (1, 0, 0), [(0, .09), (.03, .09)], 10)
        # Rails: bow pulpit and stern rail, two lines each.
        def edge(x, s):
            return (x, yd(x) + .02, s * (bd(x) - .13))
        bow = [edge(x, -1) for x in (4.2, 5.4, 6.6, 7.7, 8.5)] + [edge(x, 1) for x in (8.5, 7.7, 6.6, 5.4, 4.2)]
        m.railing('steel', bow, height=.58, post_m=1.3, rails=2, radius=.02)
        stern = [edge(x, -1) for x in (-3.3, -5.0, -7.0, -8.7)] + [edge(x, 1) for x in (-8.7, -7.0, -5.0, -3.3)]
        m.railing('steel', stern, height=.58, post_m=1.3, rails=2, radius=.02)
        # Twin .50-caliber mounts: foredeck and after deck (two twin M2 mounts: uscrashboats.org).
        for x, face in ((6.2, 1), (-5.9, 1)):
            y = yd(x) + CAM
            m.strut('dark', (x, y, 0), (x, y + .62, 0), .09, .07, sides=10)
            m.cylinder('steel', (x, y + .62, 0), .14, .08, 10)
            for z in (-.10, .10):
                m.strut('dark', (x - .1, y + .86, z), (x + .30, y + .86, z), .05, sides=8)
                m.strut('dark', (x + .30, y + .86, z), (x + 1.25, y + .96, z), .022, sides=6)
                m.strut('dark', (x + .45, y + .86, z), (x + .85, y + .92, z), .036, sides=6)
            g.slab(m, 'steel', [(x + .42, y + .74, -.34), (x + .42, y + .74, .34), (x + .42, y + 1.15, .30), (x + .42, y + 1.15, -.30)], .035)
            for z in (-.30, .30):
                m.box('oliveDrab', (x - .15, y + .55, z), (.30, .20, .14))
            m.box('dark', (x, y + .62, 0), (.36, .20, .36))
        # Foredeck: windlass, bow cleats, jack staff, anchor; after deck: boarding ladder, davit, flag staff.
        m.box('steel', (8.0, yd(8.0) + CAM, 0), (.40, .24, .55))
        m.revolve('steel', (8.0, yd(8.0) + CAM + .32, -.32), (0, 0, 1), [(0, .11), (.64, .11)], 10)
        for s in (-1, 1):
            for x in (4.3, 7.2):
                m.box('steel', (x, yd(x) + CAM * .5, s * (bd(x) - .22)), (.30, .06, .09))
                for e in (-1, 1):
                    m.box('steel', (x + e * .11, yd(x) + CAM * .5 + .06, s * (bd(x) - .22)), (.07, .10, .08))
        m.strut('steel', (9.18, yd(9.18) + .05, 0), (9.18, yd(9.18) + .75, 0), .018, sides=6)
        m.strut('steel', (-9.30, yd(-9.3) + .02, 0), (-9.30, yd(-9.3) + .95, 0), .02, sides=6)
        m.box('signalRed', (-9.30, yd(-9.3) + .72, .14), (.012, .18, .26))
        for s in (-1, 1):
            m.strut('steel', (-9.52, yd(-9.5) - .05, s * .30), (-9.52, 0.9, s * .30), .02, sides=4)
        for i in range(5):
            m.strut('steel', (-9.52, 1.0 + i * .17, -.30), (-9.52, 1.0 + i * .17, .30), .014, sides=4)
        m.strut('steel', (-6.7, yd(-6.7), 1.25), (-6.7, 3.10, 1.25), .06, sides=6)
        g.cable(m, 'steel', [(-6.7, 3.10, 1.25), (-7.9, 2.75, 1.85)], .045, 6)
        g.cable(m, 'dark', [(-7.9, 2.75, 1.85), (-7.9, 2.0, 1.85)], .01, 4)
    m.box('hull', (9.45, 2.38, 0), (.30, .46, .26), node='Nose')
    for i, z in enumerate((-1.05, 1.05), start=1):
        m.propeller('dark', (-8.90, .36, z), .60, 3, .10, .05, .12, node=f'Prop{i}')
        m.strut('dark', (-6.3, .36, z), (-8.85, .36, z), .035, sides=6, node=f'Prop{i}')
        m.box('steel', (-9.40, .10, z), (.34, .62, .05), node=f'Rudder{i}')
        m.strut('steel', (-9.30, .72, z), (-9.30, 1.10, z), .035, sides=6, node=f'Rudder{i}')


def raft_path(n, A, B, p=2.6, y=0.0):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s_ = math.cos(t), math.sin(t)
        pts.append((A * math.copysign(abs(c) ** (2 / p), c), y, B * math.copysign(abs(s_) ** (2 / p), s_)))
    return pts


def survivor(m, x, z, face, helmet=False, pose='rest'):
    """One seated survivor: pelvis at (x, .13, z), facing +/-z. Torso, limbs in 'Survivors' (uniform),
    heads and hands in 'SurvivorHeads' (skin), life vest in 'SurvivorVests'. All ESTIMATES."""
    f = (0.0, 0.0, face)           # facing
    sd = (-face, 0.0, 0.0)         # right-hand side
    P = lambda dx=0.0, y=0.0, df=0.0, ds=0.0: (x + sd[0] * ds + f[0] * df + dx, y, z + sd[2] * ds + f[2] * df)
    m.revolve('uniform', P(y=.12), (0, 1, 0), [(0, .13), (.10, .155), (.30, .16), (.42, .12)], 12, node='Survivors')
    m.revolve('vestYellow', P(y=.34), (0, 1, 0), [(0, .172), (.10, .178), (.19, .15)], 12, node='SurvivorVests')
    for s_ in (-1, 1):
        m.revolve('vestYellow', P(y=.47, df=.09, ds=s_ * .075), (0, 1, 0), [(0, .06), (.07, .07), (.13, .045)], 8, node='SurvivorVests')
    m.revolve('skin', P(y=.54), (0, 1, 0), [(0, .03), (.03, .06), (.08, .085), (.14, .09), (.19, .075), (.23, .04)], 12, node='SurvivorHeads')
    nose = P(y=.62, df=.095)
    m.box('skin', (nose[0] - .02, nose[1], nose[2] - .02), (.04, .05, .04), node='SurvivorHeads')
    for s_ in (-1, 1):
        e = P(y=.655, df=.083, ds=s_ * .035)
        m.box('dark', (e[0] - .012, e[1], e[2] - .012), (.024, .018, .024))
    if helmet:
        m.revolve('helmet', P(y=.66), (0, 1, 0), [(0, .098), (.04, .105), (.10, .07), (.13, .02)], 12)
    else:
        m.revolve('uniform', P(y=.69), (0, 1, 0), [(0, .092), (.04, .09), (.07, .05)], 10, node='Survivors')
    for s_ in (-1, 1):                                    # legs: thigh to raised knee, shin to boot
        hip, knee, foot = P(y=.14, df=.04, ds=s_ * .08), P(y=.27, df=.40, ds=s_ * .09), P(y=.09, df=.62, ds=s_ * .09)
        m.strut('uniform', hip, knee, .06, .05, sides=6, node='Survivors')
        m.strut('uniform', knee, foot, .05, .04, sides=6, node='Survivors')
        m.box('boots', (foot[0] - .045, foot[1] - .04, foot[2] + face * .03 - .065), (.09, .09, .13))
    sh = lambda s_: P(y=.45, ds=s_ * .165)
    for s_ in (-1, 1):                                    # arms
        el = P(y=.30, df=.07, ds=s_ * .21)
        hand = P(y=.26, df=.30, ds=s_ * .13)
        if pose == 'wave' and s_ == 1:
            el = P(y=.62, df=.02, ds=s_ * .30)
            hand = P(y=.86, df=.06, ds=s_ * .26)
        m.strut('uniform', sh(s_), el, .040, .035, sides=6, node='Survivors')
        m.strut('uniform', el, hand, .035, .03, sides=6, node='Survivors')
        m.box('skin', (hand[0] - .03, hand[1] - .03, hand[2] - .03), (.06, .06, .06), node='SurvivorHeads')


def paddle(m, a, b, blade_len=.34):
    """A paddle from grip `a` to blade tip `b`: shaft and a flat blade."""
    d = kit._unit(tuple(q - p for p, q in zip(a, b)))
    mid = tuple(b[i] - d[i] * blade_len / 2 for i in range(3))
    m.strut('timber', a, tuple(b[i] - d[i] * blade_len for i in range(3)), .018, sides=6)
    yaw = math.degrees(math.atan2(-d[2], d[0]))
    g.obox(m, 'timber', mid, (blade_len, .02, .15), yaw=yaw, pitch=math.degrees(math.asin(d[1])))


def raft(m):
    # Type A-3 five-person raft: identity from Wright Field spec. 40420-A and the 1947 Federal Register.
    # ESTIMATES (no drawing read): 2.60 x 1.70 m overall, 0.46 m tubes, rounded-rectangular plan, olive
    # floor, rope lifeline with grab loops, boarding handles, CO2 cylinder, paddles, dye marker; open
    # (canopy-less) raft; survivors in yellow vests. Raft bottom y=0 is the waterline contact.
    A, B, N = 1.00, .55, 40
    path = raft_path(N, A, B)
    tube = [(.20 * math.cos(2 * math.pi * k / 12), .18 + .18 * math.sin(2 * math.pi * k / 12)) for k in range(12)]
    g.sweep_loop(m, 'raftYellow', [(x, 0, z) for x, _, z in path], tube, node='Raft', smooth=True)
    with m.shared_chart():
        # Floor: a flat olive sheet inside the tube ring.
        floor = [(x * .80, 0, z * .83) for x, _, z in path]
        g.loft(m, 'oliveDrab', [[(x, .06, z) for x, _, z in floor], [(x, .12, z) for x, _, z in floor]])
        # Equator seam, and six chamber-divider seams across the tube.
        g.sweep_loop(m, 'dark', [(x, 0, z) for x, _, z in path], [(.202, .15), (.220, .18), (.202, .21)], smooth=False)
        for i in (0, 7, 13, 20, 27, 33):
            r0 = [(path[i][0] + math.cos(0) * 0, 0, path[i][2])]
            for dj in (-.35, .35):
                pass
        for i in (3, 9, 16, 23, 30, 36):
            p0, p1 = path[i], path[(i + 1) % N]
            tx, tz = p1[0] - p0[0], p1[2] - p0[2]
            ln = math.hypot(tx, tz)
            nx, nz = tz / ln, -tx / ln
            if nx * p0[0] + nz * p0[2] < 0:
                nx, nz = -nx, -nz
            rings = []
            for off in (-.03, .03):
                cx, cz = p0[0] + tx / ln * off, p0[2] + tz / ln * off
                rings.append([(cx + nx * a * 1.07, b * 1.04 - .008, cz + nz * a * 1.07) for a, b in tube])
            g.loft(m, 'dark', rings)
        # Lifeline rope around the outside, and grab loops hanging from it every ~0.6 m.
        rope = [(x, 0, z) for x, _, z in raft_path(N, A, B)]
        g.sweep_loop(m, 'webbing', rope, [(.232, .225), (.254, .225), (.254, .255), (.232, .255)], smooth=False)
        for i in range(0, N, 4):
            p0, p1 = path[i], path[(i + 1) % N]
            tx, tz = p1[0] - p0[0], p1[2] - p0[2]
            ln = math.hypot(tx, tz)
            tx, tz = tx / ln, tz / ln
            nx, nz = tz, -tx
            if nx * p0[0] + nz * p0[2] < 0:
                nx, nz = -nx, -nz
            pts = [(p0[0] + nx * (.255 + .05 * math.sin(math.pi * k / 4)) + tx * (-.07 + .14 * k / 4), .24 - .09 * math.sin(math.pi * k / 4), p0[2] + nz * (.255 + .05 * math.sin(math.pi * k / 4)) + tz * (-.07 + .14 * k / 4)) for k in range(5)]
            g.cable(m, 'webbing', pts, .012, 4)
            g.obox(m, 'dark', (p0[0] + nx * .21, .24, p0[2] + nz * .21), (.12, .08, .04), yaw=math.degrees(math.atan2(-nz, nx)))
        # Boarding handles: webbing arches on top of the tube at both ends and at each side.
        for (hx, hz, ang) in ((A - .02, -.18, 0), (A - .02, .18, 0), (-A + .02, -.18, 180), (-A + .02, .18, 180), (.30, B - .02, 90), (-.30, -B + .02, 270)):
            c, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            pts = [(hx + c * (-.07) + (-s_) * 0, .40, hz), (hx, .50, hz), (hx + c * .07, .40, hz)]
            tpts = []
            for (dx, dy, dz) in ((-.10, .35, 0), (-.08, .47, 0), (.08, .47, 0), (.10, .35, 0)):
                rx = dx * c - dz * s_
                rz = dx * s_ + dz * c
                tpts.append((hx + rx if ang in (0, 180) else hx + dz, dy, hz + rz if ang in (90, 270) else hz + dz))
            if ang in (0, 180):
                tpts = [(hx, dy, hz + dx) for dx, dy, dz in ((-.10, .35, 0), (-.08, .47, 0), (.08, .47, 0), (.10, .35, 0))]
            else:
                tpts = [(hx + dx, dy, hz) for dx, dy, dz in ((-.10, .35, 0), (-.08, .47, 0), (.08, .47, 0), (.10, .35, 0))]
            g.cable(m, 'webbing', tpts, .015, 4)
        # Inflation valve and CO2 cylinder on the forward starboard tube, hose into the tube.
        m.revolve('steel', (.62, .40, .50), (1, 0, 0), [(0, .045), (.30, .045), (.36, .03)], 10)
        g.cable(m, 'dark', [(.62, .42, .52), (.55, .40, .56), (.48, .33, .58)], .012, 4)
        # Dye marker packet tied to the lifeline, and a stowed second paddle along the port floor edge.
        m.revolve('warmLight', (-.80, .06, -.30), (0, 1, 0), [(0, .035), (.09, .035)], 8)
        g.cable(m, 'webbing', [(-.80, .12, -.30), (-.90, .20, -.40), (-.96, .26, -.46)], .006, 4)
        paddle(m, (-.62, .15, -.30), (.62, .16, -.31), .30)
    survivor(m, .50, -.22, 1, helmet=True)
    survivor(m, .16, .22, -1, pose='wave')
    survivor(m, -.16, -.22, 1)
    survivor(m, -.50, .22, -1, helmet=True)
    survivor(m, -.72, -.20, 1)


def buoy(m):
    m.revolve('hull', (0, 0, 0), (0, 1, 0), [(0, .55), (.55, .55), (1.05, .28), (1.35, .18)], 24, node='Buoy')
    m.revolve('steel', (0, 1.35, 0), (0, 1, 0), [(0, .09), (.20, .09)], 12, node='MooringEye')


out, opts = kit.cli_args()
asset = os.path.basename(out).removesuffix('.glb')
m = kit.Model(asset, skin=512)
if asset == 'lcvp': lcvp(m)
elif asset == 'usaaf-63ft-rescue-boat': rescue_boat(m)
elif asset == 'type-a3-life-raft-survivors': raft(m)
elif asset == 'pby-mooring-buoy': buoy(m)
else: raise ValueError(f'unknown F4 maritime asset {asset}')
m.export(out)
