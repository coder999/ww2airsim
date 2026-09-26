# tools/models/blender/hangar.py
"""Barrel-roof hangar, the M0 proof model. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-26):
  footprint 34 x 42 m    content/bases/tacloban.json, tacloban-hangar-1 (the sim is authoritative);
                         --width/--length take any other placement (Dulag: 22 x 28)
  wall 5.5 m             ESTIMATE: the game's own, src/render/scene/buildings.ts
  roof rise width*0.25   ESTIMATE: the game's own, buildings.ts
  walls 0.35 m, gable and shell 0.3 m     ESTIMATE: buildings.ts
  slab footprint+1 m, 0.3 m deep, top at y=0   ESTIMATE: buildings.ts draws width+1 x length+1
  door leaves width/4 each, 0.15 m, at the open +z end   ESTIMATE: new here
  gable set 0.05 m inside the vault, outline mid-shell   modeling choice: no coplanar faces
Frame: width along x, length along z, open toward +z (the apron), as buildings.ts.
Leaves out: roof ribs, windows, interior.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

WALL_M = 5.5
RISE_PER_WIDTH = 0.25
WALL_T = 0.35
SHELL_T = 0.3
DOOR_T = 0.15
GABLE_INSET = 0.05

out, opts = kit.cli_args()
width = kit.positive(opts, 'width', 34)
length = kit.positive(opts, 'length', 42)
rise = width * RISE_PER_WIDTH

m = kit.Model('hangar')
m.box('concrete', (0.0, -0.3, 0.0), (width + 1.0, 0.3, length + 1.0))
for side in (-1, 1):
    m.box('steel', (side * (width / 2 - WALL_T / 2), 0.0, 0.0), (WALL_T, WALL_M, length))
m.barrel_vault('steel', (0.0, WALL_M, 0.0), width, rise, length, SHELL_T, 24)
# The end wall sits GABLE_INSET inside the vault, and its outline runs mid-shell, so its
# curved edge is buried in the shell and its sides inside the walls: no face of it is
# coplanar with the vault's rim or outer surface (a flush gable drew a dark seam in the M0
# capture and would z-fight in the game).
m.arch_gable('steel', (0.0, 0.0, -length / 2 + GABLE_INSET + SHELL_T / 2), width - SHELL_T, WALL_M, rise - SHELL_T / 2, SHELL_T, 24)
for side in (-1, 1):
    m.box('dark', (side * (width / 2 - WALL_T - width / 8), 0.0, length / 2 - DOOR_T), (width / 4, WALL_M, DOOR_T))
m.export(out)
