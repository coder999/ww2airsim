# tools/models/blender/p-38-lightning.py
"""Lockheed P-38L Lightning. Original work, AGPL-3.0-or-later (R3 fallback, Task 16).

Built in Blender because the Sketchfab pick (manilov.ap's p38) measures 12.13 m long at the cited
15.85 m span, +5.2% over the P-38L's 11.53 m (R3 plan P10's 4%; R3 ledger, Task 8).

Figures (read 2026-09-27, English Wikipedia "Lockheed P-38 Lightning", Specifications (P-38L)):
  span 15.85 m (52 ft 0 in), length 11.53 m (37 ft 10 in),
    wing area 30.43 m2 (327.5 sq ft)                        CITED
  two 3-bladed propellers                                   CITED (blade count; Curtiss electric)
  airfoil thickness 16% root (NACA 23016) / 12% tip
    (NACA 4412)                                             CITED (camber not modeled: the kit's
                                                            section is symmetric)
  propeller diameter 3.51 m                                 ESTIMATE (the source is silent)
  taper 0.40, an unswept quarter chord, dihedral 5.5 deg   ESTIMATE
  boom spacing, gondola and boom sections, canopy, tail,
    gear track and leg lengths (fractions below)            ESTIMATE
  tricycle gear, all three legs retracting aft              ESTIMATE of the motion and angles
  natural metal, flat roles, no insignia (R3 P16)           ESTIMATE (role naturalMetal)
Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
thrust line (ESTIMATE). Pose: gear down, thrust line level (R3 P13).
Leaves out: the fins' lower halves, turbosuperchargers, radiators, guns, insignia, cockpit.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'p38'
SPAN, LENGTH, WING_AREA = 15.85, 11.53, 30.43       # CITED
BLADES = 3                                          # CITED
ROOT_T, TIP_T = 0.16, 0.12                          # CITED (NACA 23016 / 4412)
PROP_DIAMETER = 3.51                                # ESTIMATE
TAPER, DIHEDRAL_DEG = 0.40, 5.5                     # ESTIMATE
NOSE_X, WING_Y = 0.36, -0.004
BOOM_Z = 0.16                                        # of SPAN
GONDOLA = [(0.62, 0.006, 0.008, 0.010), (0.50, 0.045, 0.055, 0.015), (0.30, 0.055, 0.065, 0.010),
           (0.12, 0.050, 0.055, 0.000), (0.03, 0.030, 0.032, -0.005), (0.0, 0.004, 0.004, -0.008)]
CANOPY = [(0.42, 0.004, 0.004, 0.060), (0.36, 0.035, 0.030, 0.070), (0.26, 0.034, 0.028, 0.068), (0.20, 0.004, 0.004, 0.060)]
BOOM = [(0.985, 0.006, 0.008, 0.020), (0.85, 0.020, 0.026, 0.018), (0.55, 0.030, 0.038, 0.005),
        (0.35, 0.052, 0.060, -0.005), (0.20, 0.055, 0.058, 0.000), (0.085, 0.045, 0.045, 0.000), (0.078, 0.025, 0.025, 0.000)]
PROP = dict(hub=0.068, chord=0.022, spinner_r=0.028, spinner_len=0.035)
FIN = dict(root=0.12, taper=0.6, height=0.14, y=0.02)
TAILPLANE = dict(le=0.86, root=0.10, taper=0.9, y=0.02, overhang=0.40)
GEAR = dict(ahead=-0.01, below=0.045, length=0.15, wheel_r=0.030, wheel_w=0.018)
NOSE_GEAR = dict(at=0.08, y=-0.045, wheel_r=0.022, wheel_w=0.014)

L, S = LENGTH, SPAN


def X(f):
    return (NOSE_X - f) * L


out, _opts = kit.cli_args()
m = kit.Model(NAME)
bz = BOOM_Z * S
m.fuselage('naturalMetal', [(X(f), w * L, h * L, y * L) for f, w, h, y in GONDOLA], segments=16)
m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], segments=16)
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
le_x = 0.25 * root_chord
m.wing('naturalMetal', le_x, WING_Y * L, root_chord, tip_chord, S, sweep_deg=sweep, dihedral_deg=DIHEDRAL_DEG,
       thickness=ROOT_T, tip_thickness=TIP_T)
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root
for i, z in enumerate((-bz, bz), start=1):
    m.fuselage('naturalMetal', [(X(f), w * L, h * L, y * L) for f, w, h, y in BOOM], segments=16, center_z=z)
    m.fin('naturalMetal', X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
          sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), center_z=z)
    pr = PROP
    m.propeller('dark', (X(pr['hub']), 0.0, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                pr['spinner_len'] * L, node=f'Prop{i}')
tp = TAILPLANE
m.wing('naturalMetal', X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, 2 * (bz + tp['overhang']),
       thickness=0.10)
g = GEAR
gy = -g['below'] * L
ground_y = gy - g['length'] * L
for side, name in ((-1, 'GearL'), (1, 'GearR')):
    z = side * bz
    m.gear_leg('dark', (le_x - bz * math.tan(math.radians(sweep)) + g['ahead'] * L, gy, z), g['length'] * L,
               g['wheel_r'] * L, g['wheel_w'] * L, node=name)
ng = NOSE_GEAR
m.gear_leg('dark', (X(ng['at']), ng['y'] * L, 0.0), ng['y'] * L - ground_y, ng['wheel_r'] * L, ng['wheel_w'] * L, node='GearNose')
m.export(out)
