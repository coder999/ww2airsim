# tools/models/blender/b-29-superfortress.py
"""Boeing B-29 Superfortress. Original work, AGPL-3.0-or-later.

The four-engine template (R3): stations are fractions of the cited length or span; TRICYCLE
and TURRETS make another four-engine type this file with its own CITED block (R3 plan, Task 16).

Figures (read 2026-09-27, English Wikipedia "Boeing B-29 Superfortress", Specifications; the section
names no variant):
  span 43.05 m (141 ft 3 in), length 30.18 m (99 ft 0 in),
    wing area 161.3 m2 (1,736 sq ft)                        CITED
  four remote turrets (the lead) and a manned tail
    position (the specification's guns)                     CITED (Turret1..5 nose to tail, for H3)
  4-bladed propellers, 5.055 m (16 ft 7 in)                 CITED
  airfoil thickness 22% root / 9% tip (Boeing 117)          CITED (the section's own camber is not modeled:
                                                            the kit's section is symmetric)
  taper 0.35, leading-edge sweep 7 deg, dihedral 4.5 deg   ESTIMATE
  engine stations, nacelles, sections, glazing, tail, gear  ESTIMATE (fractions below)
  main gear retracts forward into the inboard nacelles;
    nose gear retracts aft                                  ESTIMATE
  unpainted natural metal                                   ESTIMATE (role naturalMetal)
Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
fuselage axis (ESTIMATE). Pose: gear down (R3 P13).
Leaves out: insignia, sighting blisters, antennas, panel lines, exhausts, bomb bays, cockpit.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'b29'
# --- CITED
SPAN = 43.05
LENGTH = 30.18
WING_AREA = 161.3
BLADES = 4
PROP_DIAMETER = 5.055
ROOT_T, TIP_T = 0.22, 0.09
# --- ESTIMATE
TAPER = 0.35
SWEEP_DEG = 7.0
DIHEDRAL_DEG = 4.5
UPPER = LOWER = 'naturalMetal'
NOSE_X = 0.4175
WING_Y = -0.013
FUSELAGE = [
    (0.967, 0.008, 0.008, 0.012, 2.0),
    (0.881, 0.028, 0.031, 0.007, 2.0),
    (0.749, 0.046, 0.048, 0.000, 2.0),
    (0.136, 0.048, 0.048, 0.000, 2.0),
    (0.053, 0.045, 0.045, -0.002, 2.0),
    (0.013, 0.031, 0.031, -0.003, 2.0),
    (0.001, 0.005, 0.005, -0.005, 2.0),
]
NOSE_GLAZING = [(0.066, 0.0465, 0.0465, -0.002), (0.027, 0.041, 0.041, -0.003), (0.0, 0.003, 0.003, -0.005)]
TAILPLANE = dict(span=0.307, le=0.8352, root=0.139, taper=0.43, y=0.030, sweep=10.0)
FIN = dict(root=0.199, taper=0.40, height=0.166, y=0.040)
ENGINES = [0.1696, 0.3298]
NACELLE = dict(below=0.015, stations=[(-0.166, 0.0066), (-0.083, 0.025), (0.0, 0.028), (0.080, 0.028), (0.106, 0.023), (0.108, 0.0116)])
PROP = dict(ahead=0.1125, chord=0.015, spinner_r=0.0116, spinner_len=0.02)
TRICYCLE = True
GEAR = dict(ahead=-0.016, below=0.027, length=0.0994, wheel_r=0.022, wheel_w=0.016, retracts='forward')
NOSE_GEAR = dict(at=0.103, y=-0.042, wheel_r=0.016, wheel_w=0.012, retracts='aft')
TAILWHEEL = None              # dict(at=..., y=..., length=..., wheel_r=..., wheel_w=..., retracts=...) when not TRICYCLE
# (x aft of the nose, center y, up, radius, height, barrels, barrel length, facing), all of LENGTH but up/barrels/facing
TURRETS = [
    (0.1695, 0.046, 1, 0.0166, 0.015, 2, 0.040, 1),
    (0.186, -0.046, -1, 0.0166, 0.015, 2, 0.040, 1),
    (0.6495, 0.046, 1, 0.0166, 0.015, 2, 0.040, -1),
    (0.6826, -0.046, -1, 0.0166, 0.015, 2, 0.040, -1),
    (0.9542, 0.010, 1, 0.0116, 0.010, 2, 0.023, -1),
]

L, S = LENGTH, SPAN


def X(f):
    return (NOSE_X - f) * L


out, _opts = kit.cli_args()
m = kit.Model(NAME)
m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=16)
m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in NOSE_GLAZING], segments=16)
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
le_x = 0.25 * root_chord
m.wing(UPPER, le_x, WING_Y * L, root_chord, tip_chord, S, sweep_deg=SWEEP_DEG, dihedral_deg=DIHEDRAL_DEG,
       thickness=ROOT_T, tip_thickness=TIP_T)
tp = TAILPLANE
m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
       sweep_deg=tp['sweep'], thickness=0.10)
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root
m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h, sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)))


def wing_le(z):
    return le_x - abs(z) * math.tan(math.radians(SWEEP_DEG))


def nacelle_y(z):
    return WING_Y * L + abs(z) * math.tan(math.radians(DIHEDRAL_DEG)) - NACELLE['below'] * L


props = sorted(side * f * S for f in ENGINES for side in (-1, 1))
for i, z in enumerate(props, start=1):
    le, ny = wing_le(z), nacelle_y(z)
    m.fuselage(UPPER, [(le + dx * L, w * L, 1.05 * w * L, ny) for dx, w in NACELLE['stations']], segments=16, center_z=z)
    pr = PROP
    m.propeller('dark', (le + pr['ahead'] * L, ny, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                pr['spinner_len'] * L, node=f'Prop{i}')
g = GEAR
main_hinge_y = nacelle_y(ENGINES[0] * S) - g['below'] * L
ground_y = main_hinge_y - g['length'] * L
for side, name in ((-1, 'GearL'), (1, 'GearR')):
    z = side * ENGINES[0] * S
    m.gear_leg('dark', (wing_le(z) + g['ahead'] * L, main_hinge_y, z), g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L,
               node=name if g['retracts'] else None)
if TRICYCLE:
    ng = NOSE_GEAR
    m.gear_leg('dark', (X(ng['at']), ng['y'] * L, 0.0), ng['y'] * L - ground_y, ng['wheel_r'] * L, ng['wheel_w'] * L,
               node='GearNose' if ng['retracts'] else None)
else:
    tw = TAILWHEEL
    m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
               node='Tailwheel' if tw['retracts'] else None)
for i, (at, y, up, radius, height, barrels, barrel, facing) in enumerate(TURRETS, start=1):
    m.gun_turret(UPPER, i, (X(at), y * L, 0.0), radius * L, height * L, up=up, barrels=barrels,
                 barrel_length=barrel * L, facing=facing)
m.export(out)
