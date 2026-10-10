# tools/models/blender/naval.py
"""Gun mounts for the Blender ship scripts (Track M, M1, 2026-10-08). Original work, AGPL-3.0-or-later.

A ship script reads its armament from its own ShipSpec (content/ships/<id>.json, the one source of
gun positions) and draws every mount with a kit there as a node named for its locator (Turret1,
HeavyAA3, LightAA7): the build's carve stage keeps the first of each kit as the instanced mesh and
drops the rest (tools/models/stages/shipMounts.ts). Light AA kits are not drawn here: the build
generates them (M1b, 2026-10-09).

Each mount stands on (x, y, z) -- y is its foot -- and points along its rest bearing, clockwise from
the bow seen from above (0 bow, 90 starboard, 180 stern). Every dimension is an ESTIMATE scaled to the
real mount's footprint unless the caller's header cites one.
"""
import json
import math
import os

from kit import _loft as kit_loft  # noqa: E402  (M1f: oval funnels loft like kit's fuselage)

_REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')


def armament(spec_id):
    """[(locator name, mount dict)] bow to stern within turrets, heavyAA, lightAA, as shipMounts.ts names them."""
    with open(os.path.join(_REPO, 'content', 'ships', f'{spec_id}.json')) as f:
        a = json.load(f)['armament']
    out = []
    for key, prefix in (('turrets', 'Turret'), ('heavyAA', 'HeavyAA'), ('lightAA', 'LightAA')):
        out += [(f'{prefix}{i + 1}', mnt) for i, mnt in enumerate(a[key])]
    return out


def _at(x, z, bearing, dx, dz):
    """A point dx forward and dz to starboard of (x, z) in a mount turned to `bearing`."""
    b = math.radians(bearing)
    return x + dx * math.cos(b) - dz * math.sin(b), z + dx * math.sin(b) + dz * math.cos(b)


def _quarter(bearing):
    """True when the mount faces abeam: an axis-aligned box swaps its length and width."""
    return round(bearing) % 180 != 0


def _barrels(m, node, x, y, z, bearing, n, spacing, dx, height, length, radius, elev, sides=12):
    for i in range(n):
        bx, bz = _at(x, z, bearing, dx, (i - (n - 1) / 2) * spacing)
        m.gun_barrel('fitting', (bx, y + height, bz), -bearing, elev, length, radius, 0.85 * radius, sides, node)


def turret(m, node, x, y, z, bearing, body, barrels, barrel_length, barrel_radius, bag_length=0.0, elevation_deg=0.0):
    """A naval gunhouse (kit.naval_turret) on its foot: centerline turrets face the bow or the stern."""
    assert round(bearing) % 180 == 0, f'{node}: a gunhouse faces the bow or the stern'
    m.naval_turret('fitting', 1, (x, y, z), 1 if round(bearing) == 0 else -1, body, barrels, barrel_length, barrel_radius,
                   elevation_deg=elevation_deg, bag_length=bag_length, node=node)


def mount_5in38_twin(m, node, x, y, z, bearing, embed):
    """Mk 38-type twin 5"/38 enclosed mount: a 1.6 m pedestal ring, a 4.2 x 3.6 m gunhouse, two 5 m barrels."""
    m.tank('fitting', (x, y, z), 1.6, 0.6 + embed, segments=24, node=node)
    lo, up = ((4.2, 3.6), (3.6, 3.2)) if not _quarter(bearing) else ((3.6, 4.2), (3.2, 3.6))
    m.frustum('fitting', (x, y + 0.6, z), lo, up, 2.4, node=node)
    _barrels(m, node, x, y, z, bearing, 2, 1.1, 1.6, 1.7, 5.0, 0.09, 8.0)


def mount_5in38_single(m, node, x, y, z, bearing, embed):
    """Mk 30-type single 5"/38 on a 2.4 m platform: a 3.0 x 2.6 m shield, one 3.5 m barrel at 5 deg."""
    m.tank('fitting', (x, y, z), 2.4, 0.4 + embed, segments=24, node=node)
    lo, up = ((3.0, 2.6), (2.6, 2.2)) if not _quarter(bearing) else ((2.6, 3.0), (2.2, 2.6))
    m.frustum('fitting', (x, y + 0.4, z), lo, up, 1.8, node=node)
    _barrels(m, node, x, y, z, bearing, 1, 0.0, 1.4, 1.4, 3.5, 0.09, 5.0)


MOUNTS = {
    'mount-5in38-twin': mount_5in38_twin,
    'mount-5in38-single': mount_5in38_single,
}
# Light AA (40 mm and below) is not drawn here: the build generates it (stages/mountKits.ts, M1b),
# so a script skips any kit not in MOUNTS.


# M1 deck fittings (every dimension an ESTIMATE): what makes a hull read busy at a few hundred meters.

def capstan(m, x, y, z, embed):
    """An anchor capstan: a 0.9 m drum on a 1.3 m base."""
    m.tank('fitting', (x, y, z), 0.65, 0.25 + embed, segments=16)
    m.tank('fitting', (x, y + 0.25, z), 0.45, 0.7, roof_rise=0.12, segments=16)


def bitts(m, x, y, z, along_x, embed):
    """A pair of mooring bitts 0.9 m apart on a plate, the pair laid fore-aft or athwartships."""
    for d in (-0.45, 0.45):
        bx, bz = (x + d, z) if along_x else (x, z + d)
        m.tank('fitting', (bx, y, bz), 0.16, 0.55 + embed, segments=12)
    m.box('fitting', (x, y - embed, z), (1.4, 0.06 + embed, 0.5) if along_x else (0.5, 0.06 + embed, 1.4))


def carley_float(m, x, y, z, length, side):
    """A Carley life float hung on a vertical face at `side` * z: a flat rounded ring, `length` long."""
    m.strut('fitting', (x - length / 2, y, z + side * 0.18), (x + length / 2, y, z + side * 0.18), 0.17, sides=8)
    m.strut('fitting', (x - length / 2, y + 0.75, z + side * 0.18), (x + length / 2, y + 0.75, z + side * 0.18), 0.17, sides=8)
    for d in (-length / 2, length / 2):
        m.strut('fitting', (x + d, y, z + side * 0.18), (x + d, y + 0.75, z + side * 0.18), 0.17, sides=8)


def cowl_vent(m, x, y, z, bearing, height, embed):
    """A cowl ventilator: a pipe and its bell mouth turned to `bearing` (0 bow)."""
    r = 0.22
    m.strut('fitting', (x, y - embed, z), (x, y + height, z), r, sides=12)
    mx, mz = _at(x, z, bearing, 0.45, 0.0)
    m.strut('fitting', (x, y + height - 0.1, z), (mx, y + height + 0.25, mz), r, 1.8 * r, sides=12)


# --- M1f (2026-10-09): shared pieces for the Blender rebuilds of the downloaded warships (Mogami, Yamato,
# Cleveland, Essex) and Abukuma. Every dimension an ESTIMATE unless the calling script's header cites one.

def mount_127mm_twin_ijn(m, node, x, y, z, bearing, embed):
    """Type 89 12.7 cm twin (A1 mount): a 1.7 m pedestal ring, a 3.8 x 3.4 m open-backed shield (drawn
    closed), two 5.1 m barrels (12.7 cm/40: 40 calibers of 127 mm, arithmetic)."""
    m.tank('fitting', (x, y, z), 1.7, 0.5 + embed, segments=24, node=node)
    lo, up = ((3.8, 3.4), (3.2, 3.0)) if not _quarter(bearing) else ((3.4, 3.8), (3.0, 3.2))
    m.frustum('fitting', (x, y + 0.5, z), lo, up, 2.3, node=node)
    _barrels(m, node, x, y, z, bearing, 2, 1.0, 1.5, 1.5, 5.1, 0.09, 8.0)


MOUNTS['mount-127mm-twin-ijn'] = mount_127mm_twin_ijn


def stander(m, embed):
    """stand(x, l): the lowest embedded deck under a part `l` long centered on x, sampled every 0.25 m."""
    def stand(x, l):
        n = max(2, math.ceil(l / 0.25) + 1)
        return min(m.hull_at(x - l / 2 + l * i / (n - 1))[2] - embed for i in range(n))
    return stand


def runs(x0, x1, step, gaps):
    """The stretches of [x0, x1] outside every gap (x0, x1), each as its sample points `step` apart."""
    cuts = sorted(g for g in gaps if g[1] > x0 and g[0] < x1)
    out, a = [], x0
    for g0, g1 in cuts + [(x1, x1)]:
        if g0 - a >= 2.0:
            n = max(1, math.ceil((g0 - a) / step))
            out.append([a + (g0 - a) * k / n for k in range(n + 1)])
        a = max(a, g1)
    return out


def funnel(m, foot, mouth, r0, r1, sides=32, bars=3):
    """A round funnel from its foot center to its mouth (raked as the two differ in x), a sooty cap band
    0.7 m deep proud of the casing, and `bars` rain-cap bars across the mouth."""
    (x0, y0, z), (x1, y1, _z) = foot, mouth
    m.strut('superstructure', (x0, y0, z), (x1, y1, z), r0, r1, sides=sides)
    d = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / d, (y1 - y0) / d
    m.strut('dark', (x1 - 0.7 * ux, y1 - 0.7 * uy, z), (x1 + 0.12 * ux, y1 + 0.12 * uy, z), r1 * 1.05, r1 * 1.05, sides=sides)
    for k in range(bars):
        dz = (k - (bars - 1) / 2) * r1 * 1.4 / max(1, bars - 1) if bars > 1 else 0.0
        half = math.sqrt(max(0.0, (r1 * 1.02) ** 2 - dz * dz))
        m.strut('dark', (x1 + 0.2 * ux - half * uy, y1 + 0.2 * uy + half * ux, z + dz), (x1 + 0.2 * ux + half * uy, y1 + 0.2 * uy - half * ux, z + dz), 0.06, sides=4)


def tripod(m, top, feet, r, r_top, sides=8):
    """A tripod (or bipod) mast: a strut from each foot to the shared top."""
    for f in feet:
        m.strut('fitting', f, top, r, r_top, sides=sides)


def platform(m, x, y, z, length, width, rail=True, thickness=0.22, rail_h=0.9):
    """A railed platform whose top is at y: a slab `length` (x) by `width` (z), its rail on the edge."""
    m.box('fitting', (x, y - thickness, z), (length, thickness, width))
    if rail:
        hl, hw = length / 2 - 0.08, width / 2 - 0.08
        # Open at the last side's end: the ladder's gap, and no doubled post where the loop would close.
        m.railing('fitting', [(x - hl, y, z - hw), (x + hl, y, z - hw), (x + hl, y, z + hw), (x - hl, y, z + hw), (x - hl, y, z - hw + min(0.8, hw))],
                  height=rail_h, post_m=1.6)


def searchlight(m, x, y, z, r=0.55, embed=0.02):
    """A searchlight drum on a short pedestal, standing on y, its lens facing +x."""
    m.tank('fitting', (x, y, z), 0.25, 0.5 + embed, segments=12)
    m.strut('fitting', (x - 0.45, y + 0.5 + r, z), (x + 0.45, y + 0.5 + r, z), r, sides=16)
    m.strut('glazing', (x + 0.44, y + 0.5 + r, z), (x + 0.52, y + 0.5 + r, z), r * 0.85, sides=16)


def boat(m, x, y, z, length, beam, side, davits=True):
    """A ship's boat resting with its keel at y (centered x, z), and a davit pair outboard (side +-1)."""
    h = beam * 0.45
    m.fuselage('fitting', [(x - length / 2, 0.18 * beam, 0.25 * h, y + 0.35 * h, 2.0), (x - length * 0.2, beam / 2, h / 2, y + h / 2, 2.4),
                           (x + length * 0.2, beam / 2, h / 2, y + h / 2, 2.4), (x + length / 2, 0.12 * beam, 0.3 * h, y + 0.6 * h, 2.0)],
               segments=16, center_z=z)
    if davits:
        for dx in (-length * 0.32, length * 0.32):
            m.strut('fitting', (x + dx, y - 0.4, z + side * (beam / 2 + 0.6)), (x + dx, y + h + 1.8, z + side * (beam / 2 - 0.2)), 0.08, sides=6)


def torpedo_mount(m, x, y, z, tubes, length, embed, shield=True):
    """A trainable torpedo mount standing on y at (x, z): a turntable, a shield over the breeches, and
    `tubes` tubes laid fore and aft, `length` long. Kagero's banks are this shape (kagero-dd.py)."""
    m.tank('fitting', (x, y, z), 1.8, 0.45 + embed, segments=32)
    w = 0.7 * tubes
    if shield:
        m.frustum('fitting', (x - length * 0.22, y + 0.45, z), (3.0, w + 0.6), (2.6, w + 0.2), 1.5)
    for k in range(tubes):
        dz = (k - (tubes - 1) / 2) * 0.7
        m.gun_barrel('fitting', (x - length / 2, y + 1.05, z + dz), 0.0, 0.0, length, 0.3, 0.28, 16)


def catapult(m, x, y, z, length, yaw_deg, embed):
    """An aircraft catapult: a turntable standing on y and a box girder `length` long turned yaw_deg from
    the bow toward port (positive), with two launching rails on top."""
    m.tank('fitting', (x, y, z), 1.6, 0.5 + embed, segments=24)
    a = math.radians(yaw_deg)
    dx, dz = math.cos(a) * length / 2, -math.sin(a) * length / 2
    m.strut('fitting', (x - dx, y + 1.0, z - dz), (x + dx, y + 1.0, z + dz), 0.55, sides=4)
    for off in (-0.25, 0.25):
        ox, oz = math.sin(a) * off, math.cos(a) * off
        m.strut('fitting', (x - dx + ox, y + 1.42, z - dz + oz), (x + dx + ox, y + 1.42, z + dz + oz), 0.06, sides=4)


def director(m, x, y, z, r, hood, rangefinder):
    """A gun director standing on y: a barbette ring, a hood (length, width, height) and rangefinder arms
    athwartships, `rangefinder` across. Returns its top."""
    m.tank('fitting', (x, y, z), r, 0.8, segments=16)
    hl, hw, hh = hood
    m.frustum('fitting', (x, y + 0.78, z), (hl, hw), (hl * 0.85, hw * 0.85), hh)
    m.gun_barrel('fitting', (x - 0.1, y + 0.78 + hh * 0.55, z - rangefinder / 2), -90.0, 0.0, rangefinder, 0.16, 0.16, 12)
    return y + 0.78 + hh


def crane(m, foot, height, tip, r=0.35):
    """A deck crane: a post from `foot` up `height`, and a boom from near its top to `tip`."""
    x, y, z = foot
    m.strut('fitting', (x, y, z), (x, y + height, z), r, r * 0.8, sides=12)
    m.strut('fitting', (x, y + height * 0.85, z), tip, r * 0.5, r * 0.3, sides=6)


def window_band(m, x, y, z, length, width, radius, height, spacing=1.0, segments=4, visor=0.5):
    """Bridge windows around a rounded_box tier (same plan, base y): a glazing band `height` deep, its
    sides 0.06 m proud, framed by mullions about `spacing` apart, with a visor overhanging its top."""
    m.rounded_box('glazing', (x, y, z), length + 0.12, width + 0.12, height, radius + 0.06, segments=segments)
    hl, hw, r = length / 2 - radius, width / 2 - radius, radius + 0.1
    plan = []
    for cx, cz, a0 in ((hl, hw, 0.0), (-hl, hw, 90.0), (-hl, -hw, 180.0), (hl, -hw, 270.0)):
        for k in range(segments + 1):
            a = math.radians(a0 + 90.0 * k / segments)
            plan.append((x + cx + r * math.cos(a), z + cz + r * math.sin(a)))
    feet = []
    for (ax, az), (bx, bz) in zip(plan, plan[1:] + plan[:1]):
        n = max(1, round(math.hypot(bx - ax, bz - az) / spacing))
        feet += [(ax + (bx - ax) * k / n, az + (bz - az) * k / n) for k in range(n)]
    for fx, fz in feet:
        m.strut('fitting', (fx, y - 0.04, fz), (fx, y + height + 0.04, fz), 0.05, sides=4)
    if visor > 0:
        m.rounded_box('superstructure', (x, y + height + 0.06, z), length + 2 * visor, width + 2 * visor, 0.1, radius + visor, segments=segments)


def oval_loft(m, role, foot, mouth, lo, hi, n_exp, segments, rings, node=None):
    """A closed loft of horizontal superellipse sections (half-length along x, half-width along z) from
    `foot` to `mouth` (centers; raked as they differ in x), sizes interpolated from `lo` to `hi`."""
    (x0, y0, z0), (x1, y1, z1) = foot, mouth
    ring_list = []
    for r in range(rings + 1):
        t = r / rings
        cx, cy, cz = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t
        a, b = lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t
        ring = []
        for j in range(segments):
            th = 2 * math.pi * j / segments
            c, s = math.cos(th), math.sin(th)
            # Counterclockwise seen from above looking down (kit._loft's rule): x right, -z up on screen.
            ring.append((cx + a * math.copysign(abs(c) ** (2 / n_exp), c), cy, cz - b * math.copysign(abs(s) ** (2 / n_exp), s)))
        ring_list.append(ring)
    verts, faces = kit_loft(ring_list)
    charts = smooth = None
    if m.skin:
        charts, _side, _u, _v = m._loft_charts(ring_list, role)
        smooth = [j is not None for _, j in faces]
    m._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)


def oval_funnel(m, foot, mouth, lo, hi, n_exp=3.0, segments=32, bars=3):
    """An oblong raked funnel (lo, hi = (half-length, half-width) at foot and mouth), a sooty cap band
    proud of the casing, and rain-cap bars across the mouth fore and aft."""
    (x0, y0, z), (x1, y1, _z) = foot, mouth
    oval_loft(m, 'superstructure', foot, mouth, lo, hi, n_exp, segments, 3)
    k = 0.7 / (y1 - y0)
    cap_foot = (x1 - (x1 - x0) * k, y1 - 0.7, z)
    oval_loft(m, 'dark', cap_foot, (x1 + (x1 - x0) * 0.12 / (y1 - y0), y1 + 0.12, z), (hi[0] + 0.12, hi[1] + 0.12), (hi[0] + 0.12, hi[1] + 0.12), n_exp, segments, 1)
    for i in range(bars):
        dz = (i - (bars - 1) / 2) * hi[1] * 1.3 / max(1, bars - 1) if bars > 1 else 0.0
        m.strut('dark', (x1 - hi[0] * 0.95, y1 + 0.2, z + dz), (x1 + hi[0] * 0.95, y1 + 0.2, z + dz), 0.06, sides=4)
