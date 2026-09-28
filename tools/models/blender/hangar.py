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
DP0 detail figures (read 2026-09-28; no period source was found for this hangar type, so
every one is an ESTIMATE):
  corrugated sheet 0.8 m wide, end laps every 2.4 m   ESTIMATE: no period drawing found
  roof ribs every 3.0 m, 0.25 m wide, 0.06 m proud     ESTIMATE; the nearest cited figure is the
                         British Bellman hangar's 3.81 m (12 ft 6 in) bay centers, English Wikipedia
                         "Bellman hangar", https://en.wikipedia.org/wiki/Bellman_hangar, read
                         2026-09-28. Not adopted: a Bellman is a different (trussed, British) type.
  windows 1.2 x 0.9 m, sill 3.2 m, one per 4 m of wall, 0.08 m frames   ESTIMATE: no period source
  eaves 0.35 m out, 0.25 m deep   ESTIMATE: no period source
  door rails 0.2 m high, 0.05 m proud, at 1/3 and 2/3 of the wall   ESTIMATE: no period source
  additions sink 0.02 m into what they sit on   modeling choice: no coplanar faces (DP0)
Frame: width along x, length along z, open toward +z (the apron), as buildings.ts.
Leaves out: interior.
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
# Below 4 m the 0.3 m shell turns inside out (rise = width/4) and the door leaves cross.
# The smallest real placement is Dulag's 12 x 16 m shed.
MIN_SIZE_M = 4.0
# DP0 detail (Task 1 figures; every one an ESTIMATE unless its header line cites a source)
SHEET_M, LAP_M = 0.8, 2.4          # corrugated sheet width, end-lap spacing
RIB_EVERY_M, RIB_PROUD_M, RIB_W_M = 3.0, 0.06, 0.25
WINDOW_W_M, WINDOW_H_M, SILL_M, WINDOW_EVERY_M = 1.2, 0.9, 3.2, 4.0
FRAME_M = 0.08                     # window frame member, and how far the side members stand proud
EAVE_OUT_M, EAVE_D_M = 0.35, 0.25
RAIL_H_M, RAIL_PROUD_M = 0.2, 0.05  # door rails
EMBED_M = 0.02                     # every addition sinks this far into what it sits on: no coplanar faces (DP0)

out, opts = kit.cli_args()
width = kit.positive(opts, 'width', 34, MIN_SIZE_M)
length = kit.positive(opts, 'length', 42, MIN_SIZE_M)
rise = width * RISE_PER_WIDTH

m = kit.Model('hangar', skin=512)
with m.tagged('slab'):
    m.box('concrete', (0.0, -0.3, 0.0), (width + 1.0, 0.3, length + 1.0))
with m.tagged('walls'):
    for side in (-1, 1):
        m.box('steel', (side * (width / 2 - WALL_T / 2), 0.0, 0.0), (WALL_T, WALL_M, length))
        # Eave: under the springing, sunk into the wall top, its ends past the wall ends so no end is flush.
        m.box('steel', (side * (width / 2 + (EAVE_OUT_M - EMBED_M) / 2), WALL_M - EAVE_D_M, 0.0),
              (EAVE_OUT_M + EMBED_M, EAVE_D_M + EMBED_M, length + 0.2))
with m.tagged('roof'):
    m.barrel_vault('steel', (0.0, WALL_M, 0.0), width, rise, length, SHELL_T, 24)
    # Ribs stand RIB_PROUD_M off the shell; their inner face sinks EMBED_M into it. None at an end.
    ribs = int(length // RIB_EVERY_M)
    for i in range(ribs):
        z = -length / 2 + (i + 0.5) * length / ribs
        m.barrel_vault('steel', (0.0, WALL_M, z), width + 2 * RIB_PROUD_M, rise + RIB_PROUD_M, RIB_W_M, RIB_PROUD_M + EMBED_M, 16)
with m.tagged('gable'):
    # The end wall sits GABLE_INSET inside the vault, and its outline runs mid-shell, so its
    # curved edge is buried in the shell and its sides inside the walls: no face of it is
    # coplanar with the vault's rim or outer surface (a flush gable drew a dark seam in the M0
    # capture and would z-fight in the game).
    m.arch_gable('steel', (0.0, 0.0, -length / 2 + GABLE_INSET + SHELL_T / 2), width - SHELL_T, WALL_M, rise - SHELL_T / 2, SHELL_T, 24)
with m.tagged('windows'):
    count = int(length // WINDOW_EVERY_M)
    for side in (-1, 1):
        face = side * width / 2
        for i in range(count):
            z = -length / 2 + (i + 0.5) * length / count
            # Glass: through the wall face, 0.01 m proud; into the frames on every side.
            m.box('glazing', (face - side * 0.01, SILL_M - EMBED_M, z), (0.04, WINDOW_H_M + 2 * EMBED_M, WINDOW_W_M + 2 * EMBED_M))
            # Sides stand FRAME_M proud; head and sill 0.01 m more, so no two frame faces share a plane.
            for dz in (-1, 1):
                m.box('steel', (face + side * (FRAME_M - EMBED_M) / 2, SILL_M - FRAME_M / 2, z + dz * (WINDOW_W_M + FRAME_M) / 2),
                      (FRAME_M + EMBED_M, WINDOW_H_M + FRAME_M, FRAME_M))
            for y in (SILL_M - FRAME_M, SILL_M + WINDOW_H_M):
                m.box('steel', (face + side * (FRAME_M + 0.01 - EMBED_M) / 2, y, z), (FRAME_M + 0.01 + EMBED_M, FRAME_M, WINDOW_W_M + 2 * FRAME_M + 0.02))
with m.tagged('doors'):
    for side in (-1, 1):
        cx = side * (width / 2 - WALL_T - width / 8)
        m.box('dark', (cx, 0.0, length / 2 - DOOR_T), (width / 4, WALL_M, DOOR_T))
        outer = length / 2 - DOOR_T / 2
        for y in (WALL_M / 3, 2 * WALL_M / 3):
            m.box('dark', (cx, y, outer + (RAIL_PROUD_M - EMBED_M) / 2), (width / 4 - 0.2, RAIL_H_M, RAIL_PROUD_M + EMBED_M))
# Corrugated sheet laps, world-aligned (the skin's grid cuts them on axes lying in each surface).
m.marking('grid', tags=['walls'], spacingM=[None, LAP_M, SHEET_M], widthM=0.03, depth=0.8)
m.marking('grid', tags=['roof'], spacingM=[LAP_M, None, SHEET_M], widthM=0.03, depth=0.8)
m.marking('grid', tags=['gable'], spacingM=[SHEET_M, LAP_M, None], widthM=0.03, depth=0.8)
m.export(out)
