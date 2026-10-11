"""Fletcher-class destroyer, late-war U.S. Navy fit; Hangar comparison duplicate.
Original work, AGPL-3.0-or-later.

CITED (read 2026-10-11):
  English Wikipedia, "Fletcher-class destroyer", Specifications: 376 ft 6 in
  (114.8 m) overall, 39 ft 8 in (12.1 m) beam, 13 ft (4.0 m) draft; five
  single 5 in/38 dual-purpose guns and ten 21 in torpedo tubes in two
  quintuple centerline banks.  The committed ShipSpec keeps its documented
  late-war AA fit: five twin 40 mm Bofors and seven single 20 mm Oerlikons.
  Naval History and Heritage Command, DANFS "Fletcher I (DD-445)" (read
  2026-10-11): 376 ft 3 in length, 39 ft 8 in beam, 13 ft draft, five
  5-inch guns and ten 21-inch tubes.  The tiny length discrepancy is below
  the ShipSpec's one-decimal precision; this model preserves its 114.8 m.
  U.S. Navy Bureau of Ships, Camouflage Measure 32 Design 13D for DD-445
  class, 22 June 1944, Wikimedia Commons file "Pattern sheet, MS-32 13D for
  Fletcher class.jpg" (public domain; read and measured 2026-10-11):
  starboard/port profiles, plan view, bridge/funnel sections and 10 ft scale.
  U.S. Navy, "Fletcher-class destroyer technical drawing 1954", All Hands,
  October 1954 pp. 32-33, Wikimedia Commons (public domain; read 2026-10-11):
  class cutaway used only to confirm the two-stack, five-mount arrangement;
  its post-war equipment is not copied.

MEASURED (2026-10-11 from the 1944 Bureau of Ships sheet; bow pixel 1161,
  stern pixel 29, scaled to the cited 114.8 m overall; values rounded to
  0.1 m).  `aft` is metres aft of the bow; model x = 57.4 - aft.

  aft   x      deck half-width  silhouette / station feature
   0.0  57.4       0.4         raked stem
   6.0  51.4       2.5         flare begins
  16.0  41.4       4.8         No. 1 mount / forecastle
  28.0  29.4       5.8         No. 2 and bridge front
  46.0  11.4       6.0         forward stack / first torpedo bank
  62.0  -4.6       6.0         after stack
  78.0 -20.6       5.9         after deckhouse / No. 3
  92.0 -34.6       5.6         Nos. 4 and 5 group
 107.0 -49.6       4.6         quarterdeck
 114.8 -57.4       3.1         transom

  Profile measurements from the same 10 ft scale place the weather deck
  about 3.2 m above water aft, 3.6-3.8 m amidships and 5.4 m under the
  forecastle guns, with the bow sheer rising to about 8.2 m.  The two funnel
  mouths measure about 14.9 m above the waterline; the forward mast truck is
  about 25 m.  These values set STATIONS and the major vertical tiers.

FITTED (the Hangar duplicate uses the gameplay/rig contract in content/ships/fletcher-dd.json):
  five 5 in mount feet are at x 37.36, 29.59, -20.11, -31.20 and -38.86 m.
  No. 2 stands on a 7.39 m gun deck; Nos. 3 and 4 share the 5.68 m after
  deckhouse; No. 5 stands on the 3.17 m quarterdeck.  Every Bofors/Oerlikon
  point is supported by drawn deck or platform at its unchanged spec y.
  SmokeOrigin remains [8.5, 15, 0].  Frame: +x bow, +y up, +z starboard;
  origin amidships on the waterline.

ESTIMATE / modeling choice:
  Section curvature between the measured plan widths; underwater run between
  the cited draft and the drawing's waterline; exact tier, mast, radar,
  director, boat, vent, rail and rigging dimensions; torpedo mount and Mk 30
  gunhouse shapes.  These follow the drawing's silhouette but were not legible
  to survey as construction dimensions.  Paint uses the project's USN 1944
  palette, not Design 13D's literal camouflage.  The old JZHU download was
  viewed only as a proportions cross-check; no mesh or texture was copied.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

L, B, DRAFT = 114.8, 12.0, 3.96
EMBED_M = 0.02
SUBDIVIDE = 24

# (x, waterline half-beam, draft, deck-edge y, deck-edge half-beam).
STATIONS = [
    (-57.4, 2.8, 2.8, 3.50, 3.1),
    (-52.0, 4.4, 3.5, 3.55, 4.6),
    (-42.0, 5.6, DRAFT, 3.15, 5.7),
    (-31.0, 5.9, DRAFT, 3.34, 5.8),
    (-20.0, B / 2, DRAFT, 3.54, 5.9),
    (-8.0, B / 2, DRAFT, 3.69, 5.9),
    (8.0, B / 2, DRAFT, 3.86, 5.9),
    (12.0, B / 2, DRAFT, 5.18, 5.9),
    (30.0, 5.8, 3.9, 5.42, 5.8),
    (42.0, 4.8, 3.6, 6.35, 5.0),
    (51.4, 2.4, 3.1, 7.45, 2.5),
    (57.4, 0.25, 2.4, 8.20, 0.45),
]
SECTION = ((0.0, -1.0), (0.35, -0.97), (0.72, -0.78), (0.95, -0.42),
           (1.0, 0.0), (1.0, 0.35), (0.98, 0.72), (1.0, 1.0))
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'

out, opts = kit.cli_args()
m = kit.Model('fletcher-dd-blender', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck',
                 deck_node='MainDeck', below_role='antifouling',
                 below_node='Bottom', subdivide=SUBDIVIDE)

stand = naval.stander(m, EMBED_M)
deck = lambda x: m.hull_at(x)[2] - EMBED_M  # noqa: E731
inside = lambda x: m.hull_at(x)[3]          # noqa: E731

# Measured/FITTED decks: the after gun deck and the forward bridge/gun decks.
aft_base = stand(-25.5, 21.0)
with m.tagged('superstructure'):
    m.rounded_box('superstructure', (-25.5, aft_base, 0.0), 21.0, 6.4,
                  5.68 - aft_base + EMBED_M, 1.1)
    fwd_base = stand(22.0, 12.0)
    m.rounded_box('superstructure', (22.0, fwd_base, 0.0), 12.0, 8.4,
                  7.51 - fwd_base + EMBED_M, 1.6)
    # No. 2's separate narrow gun platform ends at its exact 7.39 m foot.
    t2_base = stand(30.0, 8.0)
    m.rounded_box('superstructure', (30.0, t2_base, 0.0), 8.0, 5.4,
                  7.39 - t2_base + EMBED_M, 1.2)
    # Upper pilothouse: its 10.05 m roof carries the paired Bofors galleries.
    m.rounded_box('superstructure', (21.5, 7.49, 0.0), 8.0, 6.2, 2.58, 1.4)
    m.box('superstructure', (20.0, 9.80, 0.0), (3.6, 0.23, 10.0))
    # Aft director house below the preserved high two-gun 20 mm gallery.
    m.rounded_box('superstructure', (-25.0, 5.66, 0.0), 5.0, 4.2, 2.36, 0.9)

# All five 5-in mounts are donors for the instanced Mk 30 kit.  Their guns are
# split into the elevating child by shipMounts.ts; the unchanged spec positions
# therefore drive both training and elevation in the renderer.
with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('fletcher-dd'):
        if not name.startswith('Turret'):
            continue
        x, y, z, bearing = g['x'], g['y'], g['z'], g['bearingDeg']
        naval.MOUNTS[g['kit']](m, name, x, y, z, bearing, EMBED_M)
        if DRY_RUN:
            print(f'MOUNT {name} {x} {y} {z}')

# Bridge glazing, Mk 37 director and the open bridge lip.
with m.tagged('bridgefittings'), m.shared_chart():
    naval.window_band(m, 21.5, 8.72, 0.0, 8.0, 6.2, 1.4, 0.75,
                      spacing=0.9, visor=0.45)
    m.box('fitting', (23.0, 9.79, 0.0), (3.0, 0.18, 9.6))
    naval.director(m, 20.5, 10.03, 0.0, 0.8, (3.0, 2.4, 1.7), 4.2)

# Two quintuple 21-in banks from the cited class fit.  They are static ship
# fittings; the sim has no destroyer torpedo firing seam.
with m.tagged('torpedoes'), m.shared_chart():
    for tx in (2.5, -11.5):
        naval.torpedo_mount(m, tx, stand(tx, 4.0), 0.0, 5, 8.0, EMBED_M)

# Two raked oval stacks.  The forward cap reaches SmokeOrigin y=15 exactly.
with m.tagged('funnels'):
    naval.oval_funnel(m, (8.8, deck(8.8) - 0.2, 0.0), (8.5, 14.88, 0.0),
                      (1.9, 1.45), (1.55, 1.30), bars=3)
    naval.oval_funnel(m, (-6.2, deck(-6.2) - 0.2, 0.0), (-6.8, 14.28, 0.0),
                      (1.9, 1.45), (1.55, 1.30), bars=3)

# Tripod foremast and pole mainmast, radars and antenna yards.
fore_top = (17.5, 22.5, 0.0)
main_top = (-22.8, 19.8, 0.0)
with m.tagged('masts'), m.shared_chart():
    naval.tripod(m, fore_top, [(18.5, 10.03, 0.0), (15.8, 7.49, -2.4),
                               (15.8, 7.49, 2.4)], 0.20, 0.11)
    naval.platform(m, 17.5, 18.2, 0.0, 2.5, 2.5)
    m.lattice_mast('fitting', (17.5, 21.7, 0.0), 3.0, 3.0, 0.55, 1, 0.05)
    m.strut('fitting', fore_top, (17.5, 25.0, 0.0), 0.10, 0.06, sides=6)
    m.strut('fitting', (17.5, 22.0, -3.0), (17.5, 22.0, 3.0), 0.06, sides=6)
    m.strut('fitting', (-22.8, 11.18, 0.0), main_top, 0.18, 0.10, sides=8)
    m.strut('fitting', (-22.8, 17.5, -2.5), (-22.8, 17.5, 2.5), 0.06, sides=6)
    m.box('fitting', (-22.5, 18.0, 0.0), (0.35, 1.0, 1.8))
    # The spec's centerline 20 mm pair stands at y=11.2.  A light railed
    # director platform, rather than a solid tower, supports it at that height.
    naval.platform(m, -25.0, 11.2, 0.0, 3.2, 3.2)
    for z in (-1.1, 1.1):
        m.strut('fitting', (-25.0, 7.98, z), (-25.0, 11.0, z), 0.09, sides=6)

# Boats, searchlights, vents, capstans, bitts, anchors and depth charges.
with m.tagged('boats'), m.shared_chart():
    for side in (-1, 1):
        naval.boat(m, -1.0, deck(-1.0) + 0.15, side * 3.6, 6.2, 1.8, side)
        naval.boat(m, 5.0, deck(5.0) + 0.15, side * 3.6, 5.4, 1.6, side)
with m.tagged('fittings'), m.shared_chart():
    for sx in (4.0, -16.0):
        naval.platform(m, sx, deck(sx) + 4.4, 0.0, 2.5, 3.0)
        naval.searchlight(m, sx, deck(sx) + 4.38, 0.0, r=0.45)
    for cx in (47.0, 50.5):
        naval.capstan(m, cx, stand(cx, 1.3), 0.0, EMBED_M)
    for bx in (43.0, 52.0, -45.0, -52.0):
        for side in (-1, 1):
            naval.bitts(m, bx, stand(bx, 1.4), side * (inside(bx) - 0.8), True, EMBED_M)
    for vx in (13.0, -4.0, -35.0):
        for side in (-1, 1):
            naval.cowl_vent(m, vx, stand(vx, 0.5), side * (inside(vx) - 1.0),
                            180.0 if vx > 0 else 0.0, 1.25, EMBED_M)
    for side in (-1, 1):
        m.box('dark', (48.0, deck(48.0) - 1.2,
                       side * (m.hull_at(48.0)[3] + 0.04)), (1.0, 1.2, 0.18))
        m.box('fitting', (-53.0, deck(-53.0), side * 2.1), (3.0, 0.7, 0.6))

# Railings stay open at every weapon position; antenna wires follow the drawing.
gaps = [(g['x'] - 2.0, g['x'] + 2.0) for _, g in naval.armament('fletcher-dd')]
gaps += [(-54.5, -50.5), (41.5, 44.5), (50.5, 53.5)]
with m.tagged('rails'), m.shared_chart():
    for side in (-1, 1):
        for xs in naval.runs(-55.0, 54.0, 3.0, gaps):
            m.railing('fitting', [(x, deck(x), side * (inside(x) - 0.08))
                                   for x in xs], height=0.9, post_m=2.0)
        m.railing('fitting', [(x, 5.66, side * 3.0) for x in (-34.0, -28.0,
                                                               -23.0, -17.0)],
                  height=0.85, post_m=1.8)
with m.tagged('rigging'), m.shared_chart():
    m.strut('fitting', (17.5, 24.8, 0.0), (52.0, deck(52.0) + 1.0, 0.0),
            0.012, sides=4)
    m.strut('fitting', (-22.8, 19.6, 0.0), (-53.0, deck(-53.0) + 1.0, 0.0),
            0.012, sides=4)
    for side in (-1, 1):
        m.strut('fitting', (17.5, 22.0, side * 2.8),
                (-22.8, 17.5, side * 2.3), 0.010, sides=4)
        m.strut('fitting', (17.5, 21.5, side * 0.2),
                (15.0, 7.49, side * 3.8), 0.012, sides=4)

# Bake detail and paint.  No hull number: the source is a generic class sheet.
for side in (-1, 1):
    for x in [v / 10 for v in range(-500, 451, 23)]:
        if -15.0 < x < 14.0:
            continue
        y = deck(x) - 1.25
        if y > 1.0:
            m.detail('porthole', (x, y, side * (inside(x) + 1.0)),
                     (0.0, 0.0, float(side)), radius=0.14)
    for x0 in range(-50, 45, 12):
        m.detail('strip', (x0, deck(x0) - 0.08, side * (inside(x0) + 1.0)),
                 (0.0, 0.0, float(side)),
                 to=[x0 + 12.0, deck(x0 + 12.0) - 0.08,
                     side * (inside(x0 + 12.0) + 1.0)], width=0.09, proud=0.025)
    for x in (-31.0, -25.0, -19.0):
        m.detail('door', (x, aft_base + 1.0, side * 3.22),
                 (0.0, 0.0, float(side)), w=0.7, h=1.8)
    for x in (19.0, 22.0, 25.0):
        m.detail('porthole', (x, fwd_base + 1.25, side * 4.22),
                     (0.0, 0.0, float(side)), radius=0.15)
for x, z in ((45.0, 0.0), (40.0, -2.0), (40.0, 2.0), (-47.0, 0.0),
             (-43.0, -2.0), (-43.0, 2.0)):
    m.detail('hatch', (x, deck(x) + 1.5, z), (0.0, 1.0, 0.0), w=0.9, h=0.9)

m.marking('grid', tags=['hull'], spacingM=[None, 1.5, None], widthM=0.015, depth=0.6)
m.marking('planks', tags=['hull'], widthM=0.15, lengthM=6.0, contrast=0.06, seam=0.30)
m.marking('slab', tags=['hull'], axis='y', fromM=-0.55, toM=0.65,
          color='exhaustSoot', effect='stain', opacity=0.30, featherM=0.45)
for side in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(48.0, 0.0, side * 6.2),
              axis=(0.0, 0.0, float(side)), uDir=(float(side), 0.0, 0.0),
              points=[(-0.3, 6.9), (0.3, 6.9), (0.7, 2.0), (-0.6, 2.4)],
              color='rustStain', effect='stain', opacity=0.3, featherM=0.25)
m.marking('slab', tags=['funnels'], axis='y', fromM=13.1, toM=15.2,
          color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.45)
m.export(out)
