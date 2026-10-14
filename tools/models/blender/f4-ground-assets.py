"""F4 Leyte ground-support assets. Original work, AGPL-3.0-or-later.

The output basename selects one approved F3 asset. CCKW dimensions use TM 10-1253-era
published overall figures; D7 identity is supported by TM 9-1773C. Type 94 truck and
Type 38 gun overall envelopes are ESTIMATES pending primary Japanese drawings. All cab,
bed, carriage, blade, track, wheel, hitch and control details are ESTIMATES. Frame is
glTF +x forward, +y up, +z starboard, metres. No crew, cargo, ammunition or effects.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402


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


def d7(m):
    length, width = 4.08, 2.45
    m.rounded_box('oliveDrab', (0, .55, 0), 2.65, 1.65, 1.35, .12, node='Body')
    m.box('oliveDrab', (-1.485, .32, 0), (1.10, .70, 1.0), node='Body')
    for side, z in (('L', -1.05), ('R', 1.05)):
        m.rounded_box('dark', (0, 0, z), 3.45, .34, .72, .12, node=f'Track{side}')
    m.box('steel', (1.92, 0, 0), (.20, 1.02, 2.44), node='BladeRaise')
    m.box('steel', (1.94, .05, 0), (.18, .90, 2.30), node='BladeTilt')
    m.box('oliveDrab', (1.29, .55, 0), (.28, .35, .70), node='Nose')


out, opts = kit.cli_args()
asset = os.path.basename(out).removesuffix('.glb')
m = kit.Model(asset, skin=512)
if asset == 'type94-cargo-truck':
    truck(m, 5.35, 1.90, 2.25, (-1.45, 1.48), 3.15)
elif asset == 'gmc-cckw-353':
    truck(m, 6.86, 2.24, 2.36, (-2.05, -1.15, 2.05), 4.10)
elif asset == 'type38-75mm-field-gun':
    type38(m)
elif asset == 'caterpillar-d7-3t':
    d7(m)
else:
    raise ValueError(f'unknown F4 ground asset {asset}')
m.export(out)
