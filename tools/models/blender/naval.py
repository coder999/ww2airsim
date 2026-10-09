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
