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
    m.cylinder('concrete', (0, 0, 0), 2.35, 9.6, 28, node='Tower')
    m.cylinder('steel', (0, 9.60, 0), 1.65, .45, 24, node='Gallery')
    m.cylinder('signalRed', (0, 10.05, 0), 1.15, 1.35, 24, node='Lantern')
    # Missing roof quadrant and displaced cap establish the F3 damaged state.
    m.box('dark', (-.55, 11.40, 0), (1.20, .22, 2.20), node='DamagedCrown')
    m.strut('steel', (.40, 9.8, 1.2), (1.65, 8.7, 1.8), .08, node='DamageDebris')


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
