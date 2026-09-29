"""Kagero-class destroyer: Yukikaze as at the Battle off Samar, October 1944.
Original work, AGPL-3.0-or-later.

CITED (checked 2026-09-26):
  118.5 m overall and 10.8 m beam -- content/ships/kagero-dd.json, sourced there to
  the published class particulars; 3.76 m draft is the class design draft.
  Twin 127 mm mounts and two centerline quadruple Type 93 torpedo mounts --
  U.S. Naval Technical Mission to Japan, Japanese Destroyers and Torpedo Boats,
  Article 1 (Hulls), and Japanese Monograph 149 class/construction record.
CITED (DP2 Task 1, read 2026-09-28; ledger .superpowers/sdd/2026-09-28-dp2-ships):
  The hull: Yukikaze, 25 October 1944 (Battle off Samar). No photograph of Yukikaze herself
  in October 1944 was found. The stand-in photo is her division sister Urakaze (DesDiv 17),
  Wikimedia Commons "DDs at Brunei, 10-21-partial-view.jpg", 21 October 1944, the X mount
  already removed. It is low resolution and shows no markings, no camouflage (dark gray)
  and no funnel bands, so no text or band marking is drawn.
  Ruling S8: the X mount (No. 2, superfiring aft) was removed in August-September 1943
  (combinedfleet.com TROM page and English Wikipedia "Japanese destroyer Yukikaze"), so this
  hull has TWO twin 127/50 mounts: Turret1 forward, Turret2 aft, numbered bow to stern.
  AA (combinedfleet.com TROM): two triple 25 mm on the X mount's site, two triple abreast the
  aft funnel, one twin before the bridge. Radar: Type 22 on the foremast, Type 13 on the
  mainmast. The later "14 singles and 4 x 13 mm" is dated only "late 1944": omitted.
  Main-gun length: 127 mm/50 is 50 calibers of 127 mm = 6.35 m (arithmetic).
ESTIMATE / modeling choice:
  5.5 m main deck; station table, section and the forecastle's sheer; bridge, funnel and mast
  heights; gunhouse and torpedo-bank dimensions; every AA position beyond the cited counts.
  The twin mount before the bridge is drawn as a triple (the kit has one 25 mm mount); its
  x position, the two boats a side and the depth-charge racks are ESTIMATE. No source read
  settles the boats or racks for October 1944.
Omits reload housings, railings, rigging, radar arrays and the searchlight.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

L, B, DRAFT, DECK = 118.5, 10.8, 3.76, 5.5
EMBED_M = 0.02  # every fitting sinks this far into what it stands on: no coplanar faces (DP0)
SUBDIVIDE = 36  # 6 built 3,890 triangles, under the 11,250 floor; the hull is small, so the round parts' segment counts are raised too
# (x, waterline half-beam, draft, deck-edge height, deck-edge half-beam): a fine flared bow, the
# forecastle as sheer (ESTIMATE), full to the keel: a full-hull model, keel pinned at -3.76 m.
STATIONS = [
    (-L / 2, 0.5, 2.6, 5.4, 0.9), (-50.0, 3.8, 3.3, 5.2, 4.0), (-30.0, B / 2, DRAFT, DECK, 5.3),
    (15.0, B / 2, DRAFT, DECK, 5.3), (35.0, 4.3, 3.6, 6.2, 4.8), (50.0, 2.2, 3.2, 7.0, 3.3), (L / 2, 0.15, 2.5, 7.6, 0.5),
]
SECTION = ((0.0, -1.0), (0.3, -0.96), (0.65, -0.82), (0.9, -0.55), (1.0, -0.22), (1.0, 0.0), (1.0, 0.45), (1.0, 1.0))
GUN_L = 50 * 0.127  # 127 mm/50: 6.35 m, CITED arithmetic from the caliber
TURRETS = [(1, 42.0, 1, 0.0), (2, -39.0, -1, 0.0)]  # index, x, facing, barbette rise (Ruling S8: two mounts)
TORPEDO = [1.0, -17.0]
# 25 mm mounts: two at the X mount's site, two abreast the aft funnel, one before the bridge (counts CITED).
TRIPLE_25 = [(-25.0, -1), (-25.0, 1), (-8.0, -1), (-8.0, 1), (19.0, 0)]


def stand_fn(m):
    def stand(x, l):
        """Where a part `l` long centered on x stands: the lowest embedded deck under it, sampled every 0.25 m."""
        n = max(2, math.ceil(l / 0.25) + 1)
        return min(m.hull_at(x - l / 2 + l * i / (n - 1))[2] - EMBED_M for i in range(n))
    return stand


out, opts = kit.cli_args()
m = kit.Model('kagero-dd', skin=1024)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck',
                 below_role='antifouling', below_node='Bottom', subdivide=SUBDIVIDE)
stand = stand_fn(m)
inside = lambda x: m.hull_at(x)[3]  # noqa: E731

with m.tagged('turrets'):
    for i, x, facing, rise in TURRETS:
        y = stand(x, 5.0)
        m.naval_turret('fitting', i, (x, y + rise, 0.0), facing, (5.0, 4.2, 2.2), 2, GUN_L, 0.1, elevation_deg=5.0)

s0 = stand(27.0, 11.0)          # the bridge's foot
y1 = s0 + 3.0 + EMBED_M         # its first tier's roof
y2 = y1 - EMBED_M + 2.6         # the upper tier's roof
with m.tagged('bridge'), m.shared_chart():
    m.frustum('superstructure', (27.0, s0, 0.0), (11.0, 7.4), (9.0, 6.4), 3.0 + EMBED_M)
    m.frustum('superstructure', (28.5, y1 - EMBED_M, 0.0), (7.0, 6.0), (6.0, 5.0), 2.6)
    # Bridge windows: a glazing slab straddling the sloped front face (x 31.75 -> 31.60 over its height),
    # 0.06-0.21 m proud (ESTIMATE; check it in the capture).
    m.box('glazing', (31.68, y1 + 1.3 - EMBED_M, 0.0), (0.26, 0.8, 5.0))
    m.frustum('fitting', (27.5, y2 - EMBED_M, 0.0), (3.0, 2.4), (2.4, 2.0), 1.4)  # director
    m.gun_barrel('fitting', (27.5, y2 + 0.6, -2.2), -90.0, 0.0, 4.4, 0.12, 0.12, 12)  # rangefinder arms, -z to +z
with m.tagged('funnels'):
    for x, top in ((10.0, 13.2), (-8.0, 12.6)):
        base = stand(x, 2.9)
        m.strut('superstructure', (x, base, 0.0), (x - 1.4, top, 0.0), 1.45, 1.3, sides=48)
        m.strut('dark', (x - 1.35, top - 0.3, 0.0), (x - 1.4, top + 0.25, 0.0), 1.36, 1.36, sides=48)
with m.tagged('torpedo'), m.shared_chart():
    for x in TORPEDO:
        y = stand(x, 3.8)
        m.tank('fitting', (x, y, 0.0), 1.9, 0.5 + EMBED_M, segments=48)
        m.frustum('fitting', (x, y + 0.5, 0.0), (3.2, 3.6), (2.8, 3.2), 1.6)
        for dz in (-1.05, -0.35, 0.35, 1.05):
            m.gun_barrel('fitting', (x - 3.8, y + 1.2, dz), 0.0, 0.0, 8.4, 0.32, 0.3, 24)
with m.tagged('aa'), m.shared_chart():
    for x, s in TRIPLE_25:
        z, y = (0.0 if s == 0 else s * (inside(x) - 1.3)), stand(x, 2.4)
        m.sandbag_ring('fitting', (x, y, z), 1.2, 0.08, 0.9, segments=32)
        m.tank('fitting', (x, y, z), 0.45, 0.9 + EMBED_M, segments=24)
        for dz in (-0.3, 0.0, 0.3):
            m.gun_barrel('fitting', (x + 0.2, y + 0.9, z + dz), 0.0, 20.0, 2.0, 0.04, 0.035, 12)
with m.tagged('masts'):
    m.strut('fitting', (29.0, s0 + 5.4, 0.0), (28.4, s0 + 16.0, 0.0), 0.2, 0.14, sides=8)
    ym = stand(-11.5, 0.4)
    m.strut('fitting', (-11.5, ym, 0.0), (-11.9, ym + 9.0, 0.0), 0.18, 0.12, sides=8)  # forward of the aft tubes (x -20.8..-12.4)
    m.strut('fitting', (28.6, s0 + 12.5, -2.6), (28.6, s0 + 12.5, 2.6), 0.08, sides=6)  # yard
with m.tagged('boats'), m.shared_chart():
    by = stand(4.5, 7.0) + 1.6
    for s in (-1, 1):
        m.fuselage('fitting', [(1.0, 0.25, 0.3, by, 2.0), (4.5, 0.9, 0.6, by, 2.4), (8.0, 0.2, 0.35, by + 0.15, 2.0)],
                   segments=24, center_z=s * (inside(4.5) - 1.1))
with m.tagged('stern'), m.shared_chart():
    for s in (-1, 1):  # depth-charge racks (ESTIMATE)
        m.box('fitting', (-55.0, stand(-55.0, 3.0), s * (inside(-55.0) - 0.8)), (3.0, 0.9 + EMBED_M, 0.7))
m.marking('grid', tags=['hull'], spacingM=[None, 1.5, None], widthM=0.015, depth=0.6)
m.export(out)
