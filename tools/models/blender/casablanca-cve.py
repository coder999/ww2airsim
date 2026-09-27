"""Casablanca-class escort carrier silhouette. Original work, AGPL-3.0-or-later.

CITED (checked 2026-09-26):
  156.13 m overall -- U.S. Navy, Evolution of Aircraft Carriers; 19.86 m waterline
  beam and 145.69 x 24.38 m flight deck -- content/ships/casablanca-cve.json and its
  cited class particulars. NHHC photos of USS Casablanca/Gambier Bay establish the
  narrow deck, starboard island and small stern gun silhouette.
ESTIMATE / modeling choice:
  12 m flight-deck height, 7.5 m hull freeboard, station fullness, island/funnel
  dimensions, elevator impression and stern gun mass. Omits deck-edge galleries,
  catapult, arresting wires, aircraft, boats, AA, railings and antennae.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

L, B = 156.13, 19.86
FD_L, FD_W, FD_H = 145.69, 24.38, 12.0
out, opts = kit.cli_args()
m = kit.Model('casablanca-cve')
m.ship_hull('hull', [
    (-L / 2, 1.0, 0.45, 7.0, 0.5), (-66, 7.2, 0.5, 7.4, 0.1),
    (-48, B / 2, 0.55, 7.5), (45, B / 2, 0.55, 7.5),
    (66, 6.7, 0.5, 7.3, 0.3), (L / 2, 0.35, 0.4, 7.0, 0.9),
], node='Hull')
m.deck('flightDeck', (0, 0), FD_L, FD_W, FD_H, 0.45, node='FlightDeck')
# Starboard (+z) island, with its funnel top used by SmokeOrigin.
m.tapered_box('superstructure', (18, FD_H, 8.7), (14, 5.0), (9, 3.8), 5.0, node='Island')
m.tapered_box('superstructure', (20, 17.0, 8.7), (7, 3.8), (5, 3.0), 2.2, node='Island')
m.cylinder('fitting', (15, 17.0, 8.7), 1.25, 5.0, 10, node='Funnel')
m.cylinder('fitting', (22, 19.2, 8.7), 0.18, 5.5, 8, node='Mast')
# A shallow, non-obstructing elevator impression and the small stern gun mass.
m.box('fitting', (-20, FD_H, 0), (13.0, 0.05, 9.0), node='Elevator')
m.tapered_box('fitting', (-70, 8.0, 0), (4.0, 4.0), (3.0, 3.0), 1.2, node='SternGun')
m.export(out)
