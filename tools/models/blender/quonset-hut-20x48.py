"""Quonset hut 20 x 48: a Navy steel-arch-rib half-cylinder hut. Original work, AGPL-3.0-or-later.

Figures (read 2026-10-16):
  hut 20 ft x 48 ft = 6.096 x 14.630 m, half-cylinder of corrugated steel     CITED by the model's id and the Navy
                       Quonset hut series (the Seabee Museum manuals page, https://history.navy.mil/content/history/museums/seabee/explore/online-reading-room/Publications/quonset-hut-manuals0.html,
                       did not load on 2026-10-16: UNVERIFIED). Used at Tacloban and the Jinamoc seaplane base per
                       Building the Navy's Bases ch. XXIX; no drawing was read.
  half circle: rise = half the width = 3.048 m (10 ft)                          ESTIMATE: "half-cylinder" form only
  foundation slab 0.2 m past the walls, 0.45 m high, door steps 0.15 m rise     ESTIMATE
  sheet shell 0.08 m, plywood end walls 0.1 m                                   ESTIMATE
  door 1.0 x 2.0 m at the +z end; two end windows 0.7 x 0.9 m at each end;
  four side windows 1.2 x 0.9 m per side, set 25 degrees up the curve           ESTIMATE
  sheet width 0.66 m, end laps every 2.4 m                                      ESTIMATE
  stovepipe 0.16 m across rising 0.95 m near the rear ridge                     ESTIMATE
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces
Frame: the vault runs along z, open end (the door) toward +z like the hangar, +y up, meters; the ground is y=0.
Leaves out: interior, arch ribs (inside the skin on a real hut), the Nissen type (British, no Leyte evidence).
Generic form only: no photo imagery, no Wikipedia imagery.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import f4geom as g  # noqa: E402

FOOTPRINT_X_M = 6.496
FOOTPRINT_Z_M = 15.730
HEIGHT_M = 4.38
BASE_Y_M = 0.0

W, L = 6.096, 14.6304            # 20 ft by 48 ft
RISE = W / 2
SLAB_H, SLAB_PAD = 0.45, 0.2
SHELL_T, END_T, INSET = 0.08, 0.1, 0.04
EMBED_M = 0.02
SPRING = SLAB_H - EMBED_M

out, opts = kit.cli_args()
m = kit.Model('quonset-hut-20x48', skin=512)
with m.tagged('slab'), m.shared_chart():
    m.box('concrete', (0.0, 0.0, 0.0), (W + 2 * SLAB_PAD, SLAB_H, L + 2 * SLAB_PAD))
    m.box('concrete', (0.0, 0.0, L / 2 + SLAB_PAD + 0.175), (1.4, 0.30, 0.35))
    m.box('concrete', (0.0, 0.0, L / 2 + SLAB_PAD + 0.525), (1.4, 0.15, 0.35))
with m.tagged('roof'):
    m.barrel_vault('steel', (0.0, SPRING, 0.0), W, RISE, L, SHELL_T, 24)
with m.tagged('stack'):
    m.tank('steel', (0.0, SPRING + RISE - 0.05, -4.0), 0.08, 0.95)
with m.tagged('gable'):
    for s in (-1, 1):
        m.arch_gable('timber', (0.0, SPRING, s * (L / 2 - INSET - END_T / 2)), W - SHELL_T, 0.02, RISE - SHELL_T / 2, END_T, 24)
with m.tagged('door'), m.shared_chart():
    zf = L / 2 - INSET
    m.box('dark', (0.0, SLAB_H, zf + 0.02), (1.0, 2.0, 0.1))
    for sx in (-1, 1):
        m.box('timber', (sx * 0.55, SLAB_H, zf + 0.04), (0.1, 2.1, 0.12))
    m.box('timber', (0.0, SLAB_H + 2.0, zf + 0.04), (1.2, 0.1, 0.12))
    for s in (-1, 1):
        zs = s * zf + s * 0.02
        for sx in (-1, 1):
            wx = sx * (1.7 if s == 1 else 1.3)
            m.box('dark', (wx, 1.05, zs), (0.7, 0.9, 0.1))
            m.box('timber', (wx, 0.97, s * zf + s * 0.04), (0.84, 0.08, 0.12))
with m.tagged('windows'), m.shared_chart():
    ang = 25.0
    r_win = W / 2 - 0.01
    for sx in (-1, 1):
        for zc in (-5.486, -1.829, 1.829, 5.486):
            cx = sx * r_win * math.cos(math.radians(ang))
            cy = SPRING + (RISE - 0.01) * math.sin(math.radians(ang))
            g.obox(m, 'dark', (cx, cy, zc), (0.08, 0.9, 1.2), pitch=ang if sx == 1 else 180.0 - ang)
m.marking('grid', tags=['roof'], spacingM=[2.4, None, 0.66], widthM=0.02, depth=0.8)
m.marking('grid', tags=['gable'], spacingM=[1.2192, 1.2192, None], widthM=0.015, depth=0.8)
m.export(out)
