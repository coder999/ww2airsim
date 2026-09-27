"""Kagero-class destroyer silhouette. Original work, AGPL-3.0-or-later.

CITED (checked 2026-09-26):
  118.5 m overall and 10.8 m beam -- content/ships/kagero-dd.json, sourced there to
  the published class particulars; 3.76 m draft is the class design draft.
  Three twin 127 mm turrets and two centerline quadruple Type 93 torpedo mounts --
  U.S. Naval Technical Mission to Japan, Japanese Destroyers and Torpedo Boats,
  Article 1 (Hulls), and Japanese Monograph 149 class/construction record.
ESTIMATE / modeling choice:
  5.5 m main deck, station fullness and sheer, bridge/funnel/mast heights, gunhouse
  and torpedo-bank dimensions. Omits boats, reload housings, AA, railings and rigging.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

L, B, DRAFT, DECK = 118.5, 10.8, 3.76, 5.5
out, opts = kit.cli_args()
m = kit.Model('kagero-dd')
m.ship_hull('hull', [
    (-L / 2, 0.55, 2.7, 4.8, 0.7), (-48, 4.2, 3.5, 5.1, 0.2),
    (-28, B / 2, DRAFT, DECK), (22, B / 2, DRAFT, DECK),
    (45, 3.6, 3.3, 5.2, 0.5), (L / 2, 0.22, 2.4, 4.8, 1.5),
], node='Hull', deck_role='deck', deck_node='MainDeck')
for args in [(1, (42, DECK, 0), 1), (2, (-25, DECK, 0), -1), (3, (-39, DECK, 0), -1)]:
    m.turret('fitting', args[0], args[1], args[2], (4.2, 4.0, 1.5), 4.2, 2)
m.tapered_box('superstructure', (24, DECK, 0), (12, 7.5), (7, 5), 4.2, node='Bridge')
m.tapered_box('superstructure', (27, 9.7, 0), (5, 4.5), (3.5, 3), 2.3, node='Bridge')
for x, top in ((10, 13.2), (-8, 12.6)):
    m.cylinder('fitting', (x, 6.8, 0), 1.3, top - 6.8, 10, node=f'Funnel{x}')
for x in (1, -17):
    m.tapered_box('fitting', (x, DECK, 0), (5.5, 5.0), (4.5, 4.2), 1.2, node='TorpedoBanks')
m.cylinder('fitting', (29, 11.8, 0), 0.18, 8.0, 8, node='Foremast')
m.cylinder('fitting', (-15, 7.0, 0), 0.16, 7.0, 8, node='Mainmast')
m.export(out)
