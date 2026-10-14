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


def lcvp(m):
    m.rounded_box('hull', (-.14, 0, 0), 10.80, 3.28, 1.40, .15, node='Hull')
    for z in (-1.54, 1.54):
        m.box('hull', (-.30, 1.35, z), (10.45, .55, .20), node='Hull')
    m.box('hull', (-3.70, 1.35, 0), (1.65, .75, 2.75), node='Hull')
    m.box('steel', (5.415, 0, 0), (.25, 1.55, 3.18), node='Ramp')
    m.box('hull', (5.40, 1.40, 0), (.28, .25, 2.8), node='Nose')


def rescue_boat(m):
    m.rounded_box('hull', (0, 0, 0), 19.20, 4.65, 1.10, .30, node='Hull')
    m.rounded_box('hull', (-.80, 1.05, 0), 6.2, 3.0, 2.55, .18, node='Hull')
    m.box('hull', (3.5, 1.06, 0), (5.6, .18, 3.9), node='Hull')
    for i, z in enumerate((-1.05, 1.05), start=1):
        m.propeller('dark', (-9.35, .38, z), .92, 3, .11, .10, .12, node=f'Prop{i}')
        m.box('steel', (-9.28, .12, z), (.42, .55, .09), node=f'Rudder{i}')
    m.box('hull', (9.45, .45, 0), (.30, .45, 2.0), node='Nose')


def raft(m):
    # Eight low rounded blocks read as an inflated oval ring at Hangar distance.
    for i in range(8):
        a = 2 * math.pi * i / 8
        x, z = 1.05 * math.cos(a), .72 * math.sin(a)
        m.rounded_box('oliveDrab', (x, 0, z), .72, .48, .32, .10, node='Raft')
    for i in range(5):
        x = -.55 + (i % 3) * .55
        z = -.25 + (i // 3) * .50
        m.revolve('uniform', (x, .30, z), (0, 1, 0), [(0, .12), (.62, .12)], 12, node='Survivors')
        m.revolve('skin', (x, .92, z), (0, 1, 0), [(0, .10), (.20, .10)], 12, node='SurvivorHeads')


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
