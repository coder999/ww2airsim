"""F4 Leyte night-operation and site assets. Original work, AGPL-3.0-or-later.

TM 5-7045 documents the 60-inch M1942 searchlight. The Coast Pilot and wartime
blackout guidance support the navigation-light context. Searchlight carriage, flare-pot,
Panirugan harbor light, Ranger temporary light and damaged Suluan lighthouse dimensions
and construction details are ESTIMATES unless stated below. Lit nodes are flat review
geometry only: no beam, glow, smoke, terrain dressing or runtime illumination. Frame is
glTF +x forward, +y up, +z starboard, metres.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import f4geom as g  # noqa: E402
import math  # noqa: E402


def searchlight(m):
    m.cylinder('steel', (0, 0, 0), .72, .78, 20, node='Stand')
    m.cylinder('steel', (0, .78, 0), .46, .32, 20, node='Train')
    # 60 in / 1.524 m clear aperture.
    m.revolve('steel', (0, 1.10, 0), (1, 0, 0), [(0, .82), (.55, .82), (.76, .762)], 28, node='Lamp')
    m.revolve('warmLight', (.765, 1.10, 0), (1, 0, 0), [(0, .70), (.025, .70)], 28, node='LampFace')
    m.strut('warmLight', (.80, 1.10, 0), (2.10, 1.10, 0), .025, node='BeamMarker')


def flare_pot(m):
    m.revolve('steel', (0, 0, 0), (0, 1, 0), [(0, .22), (.32, .22), (.52, .15)], 20, node='Pot')
    m.revolve('dark', (0, .52, 0), (0, 1, 0), [(0, .10), (.14, .05)], 16, node='UnlitMarker')
    m.revolve('warmLight', (0, .52, 0), (0, 1, 0), [(0, .05), (.34, .16), (.50, .04)], 16, node='LitMarker')


def harbor_light(m):
    m.cylinder('steel', (0, 0, 0), .20, 3.7, 16, node='Tower')
    m.tapered_box('steel', (0, 3.70, 0), (.90, .90), (.60, .60), .45, node='Tower')
    m.cylinder('dark', (0, 4.15, 0), .28, .32, 20, node='LensUnlit')
    m.cylinder('signalRed', (0, 4.15, 0), .22, .32, 20, node='LensLit')


def nav_light(m):
    m.cylinder('steel', (0, 0, 0), .14, .78, 14, node='Stand')
    m.rounded_box('dark', (0, .78, 0), .42, .42, .34, .06, node='LensUnlit')
    m.rounded_box('warmLight', (0, .80, 0), .30, .30, .28, .05, node='LensLit')


def lighthouse(m):
    # Suluan lighthouse, bomb-damaged campaign state. NO CITED DRAWING OR PHOTO (searched 2026-10-14):
    # the Coast Pilot names the light and Army records the 6th Ranger Battalion landing on 17 Oct 1944.
    # EVERY figure is an ESTIMATE: 11.62 m displayed height, 4.70 m footing, tapered masonry shaft,
    # gallery with railing, glazed lantern with domed roof, entrance porch and ladder. The damage
    # (upper section on the -x/+z side sheared away, shell holes, rubble, fallen roof gores) is a
    # modeling choice for the F3-approved "non-operating" state, not a record of observed damage.
    # The sheared side and ladder are authored on -x/+z and the porch on +x; the whole tower is then turned
    # 60 degrees about its axis so the Hangar's side and three-quarter presets (both from +z) see the breach.
    turn = 60.0
    part = m._part

    def turned(role, verts, faces, node, charts=None, smooth=False):
        verts = [g.rot(v, turn) for v in verts]
        part(role, verts, faces, node, charts, smooth)
    m._part = turned
    N, H_TOP, T = 20, 8.0, .45
    r_at = lambda y: 1.90 - .45 * (y - .85) / (H_TOP - .85)
    th = lambda j: math.radians((j + .5) * 360.0 / N)
    levels = [.85, 2.6, 4.4, 6.0]
    top = {6: 7.6, 7: 6.7, 8: 6.45, 9: 6.9, 10: 6.55, 11: 7.3, 12: 7.8, 13: 7.95}
    outer, inner = [], []
    for j in range(N):
        ys = levels + [top.get(j, H_TOP)]
        outer.append([(r_at(y) * math.cos(th(j)), y, r_at(y) * math.sin(th(j))) for y in ys])
        inner.append([((r_at(y) - T) * math.cos(th(j)), y, (r_at(y) - T) * math.sin(th(j))) for y in ys])
    verts, faces = [], []
    idx = {}
    for kind, ring in (('o', outer), ('i', inner)):
        for j in range(N):
            for l in range(5):
                idx[kind, j, l] = len(verts)
                verts.append(ring[j][l])
    for j in range(N):
        j2 = (j + 1) % N
        for l in range(4):
            o = [idx['o', j, l], idx['o', j2, l], idx['o', j2, l + 1], idx['o', j, l + 1]]
            faces.append(tuple(reversed(o)))                                  # outward
            i_ = [idx['i', j, l], idx['i', j2, l], idx['i', j2, l + 1], idx['i', j, l + 1]]
            faces.append(tuple(i_))                                           # inward
        faces.append((idx['o', j, 4], idx['o', j2, 4], idx['i', j2, 4], idx['i', j, 4]))  # wall top
    for f in faces[:2]:
        cx = sum(verts[i][0] for i in f) / 4
        cz = sum(verts[i][2] for i in f) / 4
        n = kit._newell([verts[i] for i in f])
        assert (n[0] * cx + n[2] * cz > 0) == (f is faces[0]), 'shaft winding'
    m._part('concrete', verts, faces, 'Tower')
    with m.shared_chart():
        # Footing: a two-step plinth, 4.70 m across at the base.
        m.cylinder('concrete', (0, 0, 0), 2.35, .45, 20, node='Tower')
        m.cylinder('concrete', (0, .45, 0), 2.10, .40, 20, node='Tower')
        # Entrance porch on +x with a recessed door, timber frame and two steps.
        a0 = r_at(1.5) * math.cos(math.radians(9))
        g.hexa(m, 'concrete', [(a0 - .25, .85, -.62), (a0 + .28, .85, -.62), (a0 + .28, .85, .62), (a0 - .25, .85, .62),
                               (a0 - .25, 3.15, -.62), (a0 + .42, 3.15, -.62), (a0 + .42, 3.15, .62), (a0 - .25, 3.15, .62)][:4]
               + [(a0 - .25, 3.0, -.62), (a0 + .28, 3.0, -.62), (a0 + .28, 3.0, .62), (a0 - .25, 3.0, .62)], node='Tower')
        g.slab(m, 'dark', [(a0 + .29, .85, -.40), (a0 + .29, .85, .40), (a0 + .29, 2.55, .40), (a0 + .29, 2.55, -.40)], .02)
        for z in (-.46, .46):
            m.box('timber', (a0 + .30, .85, z), (.05, 1.78, .09))
        m.box('timber', (a0 + .30, 2.55, 0), (.05, .09, 1.0))
        m.box('concrete', (a0 + .40, .45, 0), (.22, .40, 1.1), node='Tower')
        m.cylinder('dark', (0, .86, 0), 1.3, .02, 16)           # interior floor, seen through the breach
        # Shell holes: ragged dark patches proud of the masonry.
        for k, (ang, y, rad) in enumerate(((60, 5.2, .38), (-40, 3.7, .30), (200, 4.9, .46), (95, 6.7, .34), (-75, 2.4, .26), (150, 3.2, .32))):
            a = math.radians(ang)
            c = ((r_at(y) + .05) * math.cos(a), y, (r_at(y) + .05) * math.sin(a))
            nrm = (math.cos(a), 0, math.sin(a))
            u = (-math.sin(a), 0, math.cos(a))
            pts = []
            for q in range(9):
                t = 2 * math.pi * q / 9
                rr = rad * (1 + .28 * math.sin(2.3 * q + k) + .12 * math.cos(5 * q))
                pts.append(tuple(c[i] + u[i] * rr * math.cos(t) + (0, rr * math.sin(t) * 1.15, 0)[i] for i in range(3)))
            back = [tuple(p[i] + nrm[i] * .02 for i in range(3)) for p in pts]
            g.solid(m, 'dark', pts + back, [tuple(range(9)), tuple(range(17, 8, -1))] + [(q, (q + 1) % 9, 9 + (q + 1) % 9, 9 + q) for q in range(9)])
        # String courses: three masonry bands round the shaft, each a short two-ring loft.
        for y in (2.6, 4.4, 6.0):
            ring = lambda yy, rr: [(rr * math.cos(th(j)), yy, rr * math.sin(th(j))) for j in range(N)]
            g.loft(m, 'concrete', [ring(y - .09, r_at(y) + .06), ring(y + .09, r_at(y) + .06)], node='Tower')
        # Three small arched stair windows with timber frames on the intact +x/-z sides (dark glass).
        for ang, y in ((-60, 3.5), (-110, 5.2), (50, 5.0)):
            a_ = math.radians(ang)
            cx, cz = (r_at(y) + .035) * math.cos(a_), (r_at(y) + .035) * math.sin(a_)
            ux, uz = -math.sin(a_), math.cos(a_)
            q = [(cx - ux * .17, y - .30, cz - uz * .17), (cx + ux * .17, y - .30, cz + uz * .17), (cx + ux * .17, y + .30, cz + uz * .17), (cx - ux * .17, y + .30, cz - uz * .17)]
            g.slab(m, 'dark', q, .03)
            g.obox(m, 'timber', (cx, y + .31, cz), (.05, .05, .40), yaw=-ang)
            g.obox(m, 'timber', (cx + math.cos(a_) * .02, y, cz + math.sin(a_) * .02), (.04, .64, .04), yaw=-ang)
        # Corbels under the gallery slab, one every 18 degrees on the intact arc.
        for a in range(-108, 109, 18):
            ar = math.radians(a)
            g.obox(m, 'concrete', (1.72 * math.cos(ar), H_TOP - .22, 1.72 * math.sin(ar)), (.34, .30, .16), yaw=-a, node='Tower')
        # Exterior service ladder up the +z side to the gallery.
        zl = lambda y: r_at(y) + .10
        for sx in (-.20, .20):
            m.strut('steel', (sx, .85, zl(.85)), (sx, 8.0, zl(8.0)), .026, sides=4)
        for i in range(21):
            y = 1.2 + i * .33
            m.strut('steel', (-.20, y, zl(y)), (.20, y, zl(y)), .016, sides=4)
        for y in (2.4, 5.4):
            for sx in (-.20, .20):
                m.strut('steel', (sx, y, zl(y)), (sx, y, zl(y) - .16), .02, sides=4)
    # Gallery: slab and corbel on the intact 220-degree arc, with a bent-ended railing.
    def arc_slab(r0, r1, y0, y1, a0, a1, n, role, node, xf=None):
        vs, ids = [], {}
        for k in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * k / n)
            for nm, r_, y_ in (('ot', r1, y1), ('ob', r1, y0), ('it', r0, y1), ('ib', r0, y0)):
                ids[nm, k] = len(vs)
                vs.append((r_ * math.cos(a), y_, r_ * math.sin(a)))
        fs = []
        for k in range(n):
            fs += [(ids['ot', k], ids['ot', k + 1], ids['ob', k + 1], ids['ob', k]), (ids['it', k], ids['ib', k], ids['ib', k + 1], ids['it', k + 1]),
                   (ids['ot', k], ids['it', k], ids['it', k + 1], ids['ot', k + 1]), (ids['ob', k], ids['ob', k + 1], ids['ib', k + 1], ids['ib', k])]
        fs += [(ids['ot', 0], ids['ob', 0], ids['ib', 0], ids['it', 0]), (ids['ot', n], ids['it', n], ids['ib', n], ids['ob', n])]
        if xf:
            vs = [xf(v) for v in vs]
        g.solid(m, role, vs, fs, node)
    A0, A1 = -110, 110
    arc_slab(1.40, 2.08, H_TOP - .02, H_TOP + .20, A0, A1, 11, 'steel', 'Gallery')
    arc_slab(1.20, 1.70, H_TOP - .30, H_TOP - .02, A0 + 8, A1 - 8, 10, 'steel', 'Gallery')
    with m.shared_chart():
        pts = [(1.98 * math.cos(math.radians(a)), H_TOP + .20, 1.98 * math.sin(math.radians(a))) for a in range(-100, 101, 25)]
        m.railing('steel', pts, height=.95, post_m=.9, rails=3, radius=.022, node='Gallery')
        m.strut('steel', pts[-1][:1] + (pts[-1][1] + .95,) + pts[-1][2:], (pts[-1][0] - .5, pts[-1][1] + 1.25, pts[-1][2] + .35), .022, sides=4, node='Gallery')
        m.strut('steel', pts[0][:1] + (pts[0][1] + .95,) + pts[0][2:], (pts[0][0] + .10, pts[0][1] + .80, pts[0][2] - .22), .022, sides=4, node='Gallery')
    # Lantern room: parapet wall, eight mullions (two sheared short), glazing with panes shot out, lamp.
    LY0, LY1 = H_TOP + .20, H_TOP + 1.05
    arc_slab(1.02, 1.18, LY0, LY1, A0 + 5, A1 - 5, 10, 'steel', 'Lantern')
    GL1 = LY1 + 1.50
    for k, a in enumerate(range(-105, 106, 30)):
        ar = math.radians(a)
        hi = GL1 if abs(a) < 100 else LY1 + 0.55 + .1 * k
        m.strut('steel', (1.10 * math.cos(ar), LY1, 1.10 * math.sin(ar)), (1.10 * math.cos(ar), hi, 1.10 * math.sin(ar)), .045, sides=6, node='Lantern')
    for k in range(7):
        if k in (1, 4, 5):
            continue                                        # panes shot out
        a0_, a1_ = math.radians(-105 + 30 * k), math.radians(-75 + 30 * k)
        q = [(1.08 * math.cos(a0_), LY1 + .03, 1.08 * math.sin(a0_)), (1.08 * math.cos(a1_), LY1 + .03, 1.08 * math.sin(a1_)),
             (1.08 * math.cos(a1_), GL1 - .03, 1.08 * math.sin(a1_)), (1.08 * math.cos(a0_), GL1 - .03, 1.08 * math.sin(a0_))]
        g.slab(m, 'glazing', q, .015)
    arc_slab(.98, 1.28, GL1 - .02, GL1 + .12, A0 + 5, A1 - 5, 10, 'steel', 'Lantern')
    m.revolve('glazing', (0, LY1 + .12, 0), (0, 1, 0), [(0, .30), (.50, .36), (1.0, .30), (1.15, .18)], 12)
    for yy in (LY1 + .35, LY1 + .85):
        m.revolve('steel', (0, yy, 0), (0, 1, 0), [(0, .39), (.05, .39)], 12)
    m.cylinder('steel', (0, LY0, 0), .14, LY1 - LY0 + .12, 8)
    # Domed roof: twelve 30-degree gores, seven left on the intact side with ragged ridges;
    # two more lie fallen on the gallery, and the finial rod is bent beside them.
    def gore(a0, a1, ridge, xf=None):
        prof = [(1.30, GL1 + .10), (1.02, GL1 + .50), (.62, GL1 + .82), (.04, GL1 + 1.0 + ridge)]
        def pt(rr, y_, ang):
            return (rr * math.cos(ang), y_, rr * math.sin(ang))
        vs = []
        for rr, y_ in prof:
            vs += [pt(rr, y_, math.radians(a0)), pt(rr, y_, math.radians(a1))]
        for rr, y_ in prof:
            vs += [pt(max(rr - .08, .02), y_ - .07, math.radians(a0)), pt(max(rr - .08, .02), y_ - .07, math.radians(a1))]
        n_ = len(prof)
        fs = []
        for k in range(n_ - 1):
            a_, b_ = 2 * k, 2 * k + 2
            fs += [(a_, b_, b_ + 1, a_ + 1), (n_ * 2 + a_, n_ * 2 + a_ + 1, n_ * 2 + b_ + 1, n_ * 2 + b_),
                   (a_, n_ * 2 + a_, n_ * 2 + b_, b_), (a_ + 1, b_ + 1, n_ * 2 + b_ + 1, n_ * 2 + a_ + 1)]
        fs += [(0, 1, n_ * 2 + 1, n_ * 2), (2 * n_ - 2, n_ * 4 - 2, n_ * 4 - 1, 2 * n_ - 1)]
        if xf:
            vs = [xf(v) for v in vs]
        g.solid(m, 'dark', vs, fs, 'DamagedCrown')
    for k, ridge in zip(range(7), (-.05, -.18, -.02, -.25, -.12, -.30, -.08)):
        gore(-105 + 30 * k, -75 + 30 * k, ridge)
    def fallen(v):
        x, y, z = v
        p = g.rot((x - 1.0, y - GL1 - .5, z), 20, 0, 0)       # lie it on its side
        p = g.rot(p, 0, 8, 0)
        return (p[0] - .75, p[1] + H_TOP + .45, p[2] - 1.0)
    gore(0, 30, 0, fallen)
    gore(30, 60, -.1, fallen)
    m.strut('dark', (0, GL1 + .85, 0), (0, 11.62, 0), .02, sides=6, node='DamagedCrown')
    # Rubble and fallen masonry at the foot of the sheared side, kept inside the 4.70 m footprint.
    blocks = [(-1.55, .85, 1.00, .55, .32, .42, 30, 5, 8), (-1.80, .85, .30, .46, .40, .50, 80, 0, 12), (-1.55, .85, -.55, .60, .28, .36, 110, 6, 0),
              (-1.20, .85, 1.45, .40, .30, .36, 10, 0, 20), (-1.85, .85, -.95, .42, .38, .40, 140, 4, 4), (-.60, .85, 1.85, .38, .26, .34, 70, 0, 12),
              (-1.45, 1.17, .40, .36, .26, .30, 15, 14, 10), (-1.70, 1.15, -.20, .32, .30, .28, 100, 6, 18), (-.95, .85, -1.75, .36, .28, .40, 40, 0, 0),
              (-1.30, 1.10, 1.00, .30, .24, .28, 55, 10, 5), (-.30, .85, -2.0, .44, .30, .34, 5, 0, 0), (.30, .85, 2.0, .34, .26, .30, 75, 0, 10),
              (-2.0, .85, .90, .30, .26, .26, 20, 0, 0), (-.80, .85, 1.55, .26, .20, .26, 60, 0, 30)]
    for k in range(18):
        a_ = math.radians(105 + 150 * ((k * 7) % 18) / 18.0)
        r_ = 1.95 + .18 * ((k * 5) % 4) / 3
        blocks.append((r_ * math.cos(a_), .85 + .1 * (k % 3 == 0), r_ * math.sin(a_), .16 + .03 * (k % 4), .12 + .02 * (k % 3), .16 + .02 * (k % 5), 17 * k, 4 * (k % 5), 7 * (k % 4)))
    with m.shared_chart():
        for bx, by, bz, sx, sy, sz, yaw, pitch, roll in blocks:
            g.obox(m, 'concrete', (bx, by + sy / 2, bz), (sx, sy, sz), yaw=yaw, pitch=pitch, roll=roll, node='DamageDebris')
        # A fallen gallery slab section and a twisted railing bar in the rubble.
        arc_slab(1.55, 2.05, 0, .20, 0, 40, 4, 'steel', None, xf=lambda v: g.rot(v, 150, 0, 0))
        g.cable(m, 'steel', [(-1.9, 1.0, -.2), (-1.4, 1.12, -.5), (-1.0, 1.0, -.45), (-.7, 1.2, -.9)], .022, 4)


out, opts = kit.cli_args()
asset = os.path.basename(out).removesuffix('.glb')
m = kit.Model(asset, skin=512)
if asset == 'm1942-60in-searchlight': searchlight(m)
elif asset == 'portable-runway-flare-pot': flare_pot(m)
elif asset == 'panirugan-red-harbor-light': harbor_light(m)
elif asset == 'ranger-temporary-nav-light': nav_light(m)
elif asset == 'suluan-damaged-lighthouse': lighthouse(m)
else: raise ValueError(f'unknown F4 night/site asset {asset}')
m.export(out)
