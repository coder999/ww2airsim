"""Pennsylvania-class battleship, 1944 silhouette. Original work, AGPL-3.0-or-later.

CITED (checked 2026-09-26):
  185.32 m overall and 32.39 m post-modernization beam -- content/ships/pennsylvania-bb.json,
  sourced there to the 608 ft / 106 ft 3 in class dimensions.
  Four triple 14-inch turrets and the 1944 tower arrangement -- March 1945 U.S. Navy
  Booklet of General Plans, USS Pennsylvania (BB-38), cited by that ShipSpec; NHHC's
  USS Pennsylvania history confirms the modernization, refits, and Leyte configuration.
ESTIMATE / modeling choice:
  9 m main deck, waterline-only shallow authored bottom (the shared stage adds its skirt),
  station fullness, tower/funnel/mast heights, secondary-battery masses and gunhouse sizes.
  Omits boats, cranes, directors, AA tubs, railings, rigging and deck markings.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

L, B, DECK = 185.32, 32.39, 9.0
out, opts = kit.cli_args()
m = kit.Model('pennsylvania-bb')
m.ship_hull('hull', [
    (-L / 2, 1.4, 0.45, 8.0, 1.0), (-78, 12.5, 0.5, 8.6, 0.4),
    (-55, B / 2, 0.55, DECK), (42, B / 2, 0.55, DECK),
    (72, 12.0, 0.5, 8.6, 0.5), (L / 2, 0.45, 0.4, 8.2, 1.4),
], node='Hull')
m.deck('deck', (0, 0), 166, 29.0, DECK, 0.35, node='MainDeck')

# Main battery, numbered bow to stern for H3.
for args in [
    (1, (58, DECK, 0), 1), (2, (35, DECK, 0), 1),
    (3, (-35, DECK, 0), -1), (4, (-58, DECK, 0), -1),
]:
    m.turret('fitting', args[0], args[1], args[2], (9.5, 11.5, 3.4), 11.0, 3)

# Compact 1944 bridge/tower, trunked funnel, masts, and secondary masses.
m.tapered_box('superstructure', (2, DECK, 0), (35, 15), (29, 12), 4.0, node='Superstructure')
m.tapered_box('superstructure', (12, 13, 0), (15, 10), (10, 7), 8.0, node='Tower')
m.tapered_box('superstructure', (16, 21, 0), (8, 6), (5, 4), 4.0, node='Tower')
m.cylinder('fitting', (-5, 13, 0), 3.0, 11.0, 12, node='Funnel')
m.cylinder('fitting', (18, 24, 0), 0.45, 12.0, 8, node='Foremast')
m.cylinder('fitting', (-19, 13, 0), 0.4, 15.0, 8, node='Mainmast')
for x in (-25, -12, 2, 17, 28):
    for z in (-7.5, 7.5):
        m.box('fitting', (x, 10.0, z), (5.0, 2.2, 2.4), node='SecondaryBattery')
m.export(out)
