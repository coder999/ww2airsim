# tools/models/blender/ki-84-frank.py
"""Nakajima Ki-84-Ia Hayate ("Frank"). Original work, AGPL-3.0-or-later.

The single-engine template (R3): every station is a fraction of the cited length or span, so
another single-engine type is this file with its own CITED block (R3 plan, Task 16).

Figures (read 2026-09-27, English Wikipedia "Nakajima Ki-84 Hayate", Specifications (Ki-84-Ia)):
  span 11.238 m, length 9.92 m, wing area 21 m2           CITED
  4-bladed propeller                                      CITED (blade count)
  airfoil thickness 16.5% root / 8% tip (NN-21)           CITED (the section's own camber is not modeled:
                                                          the kit's section is symmetric)
  propeller diameter 3.05 m                               ESTIMATE (the source is silent)
  taper 0.53, an unswept quarter chord, dihedral 6 deg   ESTIMATE, period three-view proportions
  every section, canopy, tail surface, gear track and leg
    length below (fractions of length or span)            ESTIMATE
  main gear retracts inboard into the wing                ESTIMATE (the source is silent)
  tailwheel retracts forward                              ESTIMATE
  IJA dark green over gray-green undersides               ESTIMATE (palette roles ijaGreen, underside)
Frame: glTF, +x forward, +y up, +z right, meters. Origin: the wing root's quarter chord on the
thrust line, standing in for the CG (ESTIMATE). Pose: gear down, thrust line level (R3 P13).
The wing is two panels a side, broken at the main-gear station on the one-panel surface (see below).
Leaves out: insignia, ID stripes, panel lines, exhausts, guns, antenna, cockpit, control-surface
gaps, wheel-well doors.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = 'ki84'
# --- CITED
SPAN = 11.238
LENGTH = 9.92
WING_AREA = 21.0
BLADES = 4
ROOT_T, TIP_T = 0.165, 0.08
# --- ESTIMATE
PROP_DIAMETER = 3.05
TAPER = 0.53
DIHEDRAL_DEG = 6.0
GEAR_RETRACTS = 'inboard'     # 'inboard', 'aft', or None for fixed gear (not rigged)
TAILWHEEL_RETRACTS = True
UPPER, LOWER = 'ijaGreen', 'underside'
NOSE_X = 0.359                # spinner tip ahead of the origin, of LENGTH
WING_Y = -0.055               # wing root chord line below the thrust line, of LENGTH
# (x aft of the spinner tip, half-width, half-height, center y, exponent), tail to nose; of LENGTH
FUSELAGE = [
    (0.989, 0.006, 0.010, 0.025, 2.0),
    (0.863, 0.025, 0.038, 0.020, 2.2),
    (0.661, 0.042, 0.058, 0.010, 2.2),
    (0.480, 0.052, 0.073, 0.005, 2.2),
    (0.308, 0.058, 0.073, 0.000, 2.2),
    (0.157, 0.065, 0.067, 0.000, 2.0),
    (0.051, 0.060, 0.060, 0.000, 2.0),
    (0.046, 0.035, 0.035, 0.000, 2.0),
]
CANOPY = [(0.560, 0.005, 0.005, 0.062), (0.490, 0.030, 0.030, 0.071), (0.400, 0.033, 0.036, 0.073), (0.345, 0.005, 0.005, 0.067)]
TAILPLANE = dict(span=0.36, le=0.867, root=0.120, taper=0.55, y=0.015, sweep=8.0)  # span of SPAN; the rest of LENGTH
FIN = dict(root=0.131, taper=0.54, height=0.136, y=0.030)                         # trailing edge at the tail
PROP = dict(hub=0.036, chord=0.026, spinner_r=0.030, spinner_len=0.048)            # hub = 0.75 x spinner_len: tip at NOSE_X
GEAR = dict(x=0.0, z=0.178, length=0.165, wheel_r=0.033, wheel_w=0.020)            # x, length, wheel of LENGTH; z of SPAN
TAILWHEEL = dict(at=0.870, y=-0.015, length=0.045, wheel_r=0.012, wheel_w=0.008)

L, S = LENGTH, SPAN


def X(f):
    """A fraction of LENGTH aft of the spinner tip, as glTF x."""
    return (NOSE_X - f) * L


out, _opts = kit.cli_args()
m = kit.Model(NAME)
m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=16, lower_role=LOWER)
m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], segments=16)
root_chord = 2 * WING_AREA / (S * (1 + TAPER))
tip_chord = TAPER * root_chord
sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))  # an unswept quarter chord
# The wing is laid as panels broken at the main-gear station, so its skin carries vertices over
# the wheel wells (aircraftRigs.test.ts measures a retracted leg against skin vertices). Each
# break section is the one-panel loft's own section there: chord, absolute thickness, leading
# edge and dihedral rise all interpolate linearly, so the panels trace the same surface.
breaks = [0.0, GEAR['z'] * S, S / 2]
for z0, z1 in zip(breaks, breaks[1:]):
    c0, c1 = (root_chord + (tip_chord - root_chord) * z / (S / 2) for z in (z0, z1))
    a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
    m.wing(UPPER, 0.25 * root_chord - z0 * math.tan(math.radians(sweep)),
           WING_Y * L + z0 * math.tan(math.radians(DIHEDRAL_DEG)), c0, c1, 2 * z1, sweep_deg=sweep,
           dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0, lower_role=LOWER)
tp = TAILPLANE
m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
       sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER)
fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
fin_tip = FIN['taper'] * fin_root
# The rudder's trailing edge is vertical at the tail, so the model's aftmost point is X(1).
m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
      sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)))
pr = PROP
m.propeller('dark', (X(pr['hub']), 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L, pr['spinner_len'] * L)
g = GEAR
hinge_y = WING_Y * L + g['z'] * S * math.tan(math.radians(DIHEDRAL_DEG)) - 0.3 * ROOT_T * root_chord
for side, name in ((-1, 'GearL'), (1, 'GearR')):
    m.gear_leg('dark', (g['x'] * L, hinge_y, side * g['z'] * S), g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L,
               node=name if GEAR_RETRACTS else None)
tw = TAILWHEEL
m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
           node='Tailwheel' if TAILWHEEL_RETRACTS else None)
m.export(out)
