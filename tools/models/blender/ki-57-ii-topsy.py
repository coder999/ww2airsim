"""Mitsubishi Ki-57-II transport (Topsy). Original work, AGPL-3.0-or-later.

Frame: glTF +x forward, +y up, +z starboard, metres. The 22.6 m span and 16.1 m
length are working estimates pending a primary Mitsubishi drawing. The Ha-102-powered
MC-20-II identity is supported by the Smithsonian National Air and Space Museum engine
catalogue, read 2026-10-14. Australian War Memorial photograph P02284.003 identifies a
Ki-57 in operational IJA service; the six white-bordered Hinomaru placement follows the
project's Ki-21 IJA convention and is an ESTIMATE, not a trace of that photograph. All
section shapes, stations, 3.2 m propellers, gear geometry, door outline, glazing, finish,
marking sizes and control-surface proportions are ESTIMATES. Scope is a recognisable
Hangar review model, not a cockpit, cabin, antennas or weapons fit.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

out, opts = kit.cli_args()
m = kit.Model('ki-57-ii-topsy', skin=1024)

with m.tagged('fuselage'):
    m.fuselage('ijaGreen', [
        (-10.1, .08, .08, .05), (-8.8, .42, .52, .08), (-6.0, .72, .86, .05),
        (-2.0, .95, 1.05, .02), (2.5, 1.02, 1.10, 0), (5.1, .72, .78, 0),
        (5.9, .16, .18, 0),
    ], segments=24, lower_role='underside', doors=[(-2.0, 2.5, .42)], subdivide=2)

with m.tagged('wing'):
    m.wing('ijaGreen', 2.4, .15, 4.1, 1.35, 22.6, sweep_deg=7, dihedral_deg=4,
           thickness=.15, tip_thickness=.10, lower_role='underside',
           stations=kit.AIRFOIL_STATIONS_FINE, span_segments=3,
           controls=[(2.0, 5.7, .72, 'Flap1'), (6.0, 10.3, .70, 'Aileron')])
with m.tagged('tailplane'):
    m.wing('ijaGreen', -7.1, .35, 2.8, 1.15, 7.1, sweep_deg=13, thickness=.11,
           lower_role='underside', stations=kit.AIRFOIL_STATIONS_FINE,
           controls=[(.35, 3.3, .66, 'Elevator')])
with m.tagged('fin'):
    m.fin('ijaGreen', -7.2, .25, 3.1, .72, 3.25, sweep_deg=20, thickness=.12,
          stations=kit.AIRFOIL_STATIONS_FINE, controls=[(.25, 3.05, .67, 'Rudder')])

for i, z in enumerate((-3.65, 3.65), start=1):
    with m.tagged('engine'):
        m.fuselage('ijaGreen', [(.2, .56, .56, .05), (3.8, .64, .64, .05), (4.75, .52, .52, .05)],
                   segments=20, center_z=z)
    with m.tagged('propeller'):
        m.propeller('dark', (4.88, .05, z), 3.2, 3, .25, .28, .36, node=f'Prop{i}')

for node, z in (('GearL', -3.65), ('GearR', 3.65)):
    with m.tagged('gear'):
        m.gear_leg('dark', (1.15, -.30, z), 2.0, .42, .26, node=node)
with m.tagged('tailwheel'):
    m.gear_leg('dark', (-8.25, -.10, 0), .72, .16, .10, node='Tailwheel')

with m.tagged('cockpit'):
    m.faired_canopy('glazing', 'ijaGreen', [
        (3.15, .69, .28, .64, .66, .39, .78, .83),
        (3.90, .61, .25, .55, .67, .34, .79, .84),
        (4.48, .48, .20, .43, .58, .27, .68, .72),
    ], [3.50, 3.86, 4.18], bar=.055, node='CockpitGlass', frame_node='CockpitFrames')

    # Explicit inset front and side panes make the transport windshield read at
    # normal Hangar distance instead of disappearing into the dark-green nose.
    for z0 in (-.49, .03):
        m.box('glazing', (4.44, .27, z0), (.12, .43, .46), node='CockpitGlass')
    for side in (-1, 1):
        m.box('glazing', (3.54, .34, side * .60 - .04), (.66, .38, .08), node='CockpitGlass')

# Six white-bordered Hinomaru, the established IJA aircraft treatment in this
# repository. Placement and size remain explicitly estimated for this Ki-57.
def wing_chord(z):
    return 4.1 + (1.35 - 4.1) * abs(z) / (22.6 / 2)


def wing_le(z):
    return 2.4 - abs(z) * math.tan(math.radians(7))


def wing_y(z):
    return .15 + abs(z) * math.tan(math.radians(4))


for side in (-1, 1):
    z = side * 6.75
    x = wing_le(z) - .45 * wing_chord(z)
    for up in (1.0, -1.0):
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0, up, 0),
                  radiusM=1.02, color='insigniaWhite')
        m.marking('disc', tags=['wing'], center=(x, wing_y(z), z), axis=(0, up, 0),
                  radiusM=.90, color='hinomaruRed')
    fuselage_center = (-3.15, .04, side * .91)
    m.marking('disc', tags=['fuselage'], center=fuselage_center, axis=(0, 0, float(side)),
              radiusM=.82, color='insigniaWhite')
    m.marking('disc', tags=['fuselage'], center=fuselage_center, axis=(0, 0, float(side)),
              radiusM=.70, color='hinomaruRed')

m.export(out)
