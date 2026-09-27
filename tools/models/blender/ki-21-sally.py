# tools/models/blender/ki-21-sally.py
"""Mitsubishi Ki-21-IIb ("Sally"). Original work, AGPL-3.0-or-later.

The twin-engine template (R3): stations are fractions of the cited length or span; another
twin is this file with its own CITED block (R3 plan, Task 16).

Figures (read 2026-09-27, English Wikipedia "Mitsubishi Ki-21", Specifications (Ki-21-IIb)):
  span 22.5 m, length 16 m, wing area 69.9 m2         CITED
  3-bladed propellers                                  CITED (blade count)
  one dorsal turret (12.7 mm Ho-103)                   CITED (Turret1, for H3)
  propeller diameter 3.4 m                             ESTIMATE
  taper 0.51, an unswept quarter chord, dihedral 6 deg,
    thickness 17% root / 10% tip                       ESTIMATE
  engine span stations, nacelles, sections, glazing,
    tail surfaces, gear                                ESTIMATE (fractions below)
  main gear retracts aft into the nacelles             ESTIMATE
  tailwheel fixed                                      ESTIMATE (static, not rigged)
  IJA dark green over gray-green undersides            ESTIMATE
Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
fuselage datum (ESTIMATE). Pose: gear down (R3 P13).
Leaves out: insignia, the nose, ventral, beam and tail guns (flexible mounts, not turrets),
panel lines, exhausts, cockpit, bomb bay.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'ki21'
# --- CITED
SPAN = 22.5
LENGTH = 16.0
WING_AREA = 69.9
BLADES = 3
# --- ESTIMATE
PROP_DIAMETER = 3.4
TAPER = 0.51
DIHEDRAL_DEG = 6.0
SWEEP_DEG = None              # None: an unswept quarter chord
ROOT_T, TIP_T = 0.17, 0.10
UPPER, LOWER = 'ijaGreen', 'underside'
NOSE_X = 0.40
WING_Y = -0.019
FUSELAGE = [
    (0.981, 0.005, 0.006, 0.022, 2.0),
    (0.869, 0.022, 0.028, 0.016, 2.2),
    (0.681, 0.039, 0.053, 0.006, 2.2),
    (0.463, 0.047, 0.063, 0.000, 2.2),
    (0.244, 0.045, 0.059, 0.000, 2.2),
    (0.100, 0.038, 0.047, -0.003, 2.2),
    (0.025, 0.025, 0.028, -0.006, 2.0),
    (0.001, 0.004, 0.004, -0.0075, 2.0),
]
NOSE_GLAZING = [(0.094, 0.036, 0.041, -0.003), (0.038, 0.030, 0.034, -0.005), (0.0, 0.003, 0.003, -0.0075)]
CANOPY = [(0.288, 0.003, 0.003, 0.053), (0.238, 0.028, 0.019, 0.059), (0.175, 0.025, 0.018, 0.056), (0.131, 0.003, 0.003, 0.050)]
TAILPLANE = dict(span=0.338, le=0.8375, root=0.1375, taper=0.55, y=0.019, sweep=10.0)
FIN = dict(root=0.1625, taper=0.54, height=0.15, y=0.022)
ENGINES = [0.16]              # nacelle z each side, of SPAN
# (x ahead of the wing leading edge at that z, half-width), of LENGTH; half-height 1.05 x half-width
NACELLE = dict(below=0.0206, stations=[(-0.20, 0.009), (-0.10, 0.034), (0.03, 0.044), (0.10, 0.044), (0.135, 0.039), (0.138, 0.019)])
PROP = dict(ahead=0.146, chord=0.019, spinner_r=0.0175, spinner_len=0.034)
GEAR = dict(ahead=-0.02, below=0.040, length=0.131, wheel_r=0.034, wheel_w=0.020, retracts='aft')
TAILWHEEL = dict(at=0.90, y=-0.010, length=0.050, wheel_r=0.015, wheel_w=0.010, retracts=False)
TURRETS = [dict(at=0.513, y=0.059, up=1, radius=0.034, height=0.0375, barrels=1, barrel=0.075, facing=-1)]

L, S = LENGTH, SPAN


def X(f):
    return (NOSE_X - f) * L


out, _opts = kit.cli_args()
m = kit.Model(NAME)
m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=16, lower_role=LOWER)
m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in NOSE_GLAZING], segments=16, node=f'{NAME}_nose')
if CANOPY:
    m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], segments=16)
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = SWEEP_DEG if SWEEP_DEG is not None else math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
le_x = 0.25 * root_chord
m.wing(UPPER, le_x, WING_Y * L, root_chord, tip_chord, S, sweep_deg=sweep, dihedral_deg=DIHEDRAL_DEG,
       thickness=ROOT_T, tip_thickness=TIP_T, lower_role=LOWER)
tp = TAILPLANE
m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
       sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER)
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root
m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h, sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)))


def wing_le(z):
    return le_x - abs(z) * math.tan(math.radians(sweep))


def nacelle_y(z):
    return WING_Y * L + abs(z) * math.tan(math.radians(DIHEDRAL_DEG)) - NACELLE['below'] * L


props = sorted(side * f * S for f in ENGINES for side in (-1, 1))   # port to starboard
for i, z in enumerate(props, start=1):
    le, ny = wing_le(z), nacelle_y(z)
    m.fuselage(UPPER, [(le + dx * L, w * L, 1.05 * w * L, ny) for dx, w in NACELLE['stations']], segments=16,
               center_z=z, lower_role=LOWER)
    pr = PROP
    m.propeller('dark', (le + pr['ahead'] * L, ny, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                pr['spinner_len'] * L, node=f'Prop{i}')
g = GEAR
for side, name in ((-1, 'GearL'), (1, 'GearR')):
    z = side * ENGINES[0] * S
    m.gear_leg('dark', (wing_le(z) + g['ahead'] * L, nacelle_y(z) - g['below'] * L, z), g['length'] * L,
               g['wheel_r'] * L, g['wheel_w'] * L, node=name if g['retracts'] else None)
tw = TAILWHEEL
m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
           node='Tailwheel' if tw['retracts'] else None)
for i, t in enumerate(TURRETS, start=1):
    m.gun_turret(UPPER, i, (X(t['at']), t['y'] * L, 0.0), t['radius'] * L, t['height'] * L, up=t['up'],
                 barrels=t['barrels'], barrel_length=t['barrel'] * L, facing=t['facing'])
m.export(out)
