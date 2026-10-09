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
M1 detail pass (Track M, 2026-10-08; every addition an ESTIMATE, no drawing read): bridge wings and a
  compass platform; the Type 22 array on the foremast and the Type 13 ladder array on the mainmast
  (both CITED above as fitted, their shapes ESTIMATED); a searchlight platform abaft the forward
  funnel; davits for the boats; weathering stains. The guns' positions are now the ShipSpec's
  armament (naval.py), each mount a node named for its locator.
Omits reload housings, railings and rigging.
Frame: +x bow, +y up, +z starboard; waterline y=0.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import naval  # noqa: E402

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
TORPEDO = [1.0, -17.0]
DRY_RUN = os.environ.get('NAVAL_DRY_RUN') == '1'  # prints each mount's foot, for the spec's y


def stand_fn(m):
    def stand(x, l):
        """Where a part `l` long centered on x stands: the lowest embedded deck under it, sampled every 0.25 m."""
        n = max(2, math.ceil(l / 0.25) + 1)
        return min(m.hull_at(x - l / 2 + l * i / (n - 1))[2] - EMBED_M for i in range(n))
    return stand


out, opts = kit.cli_args()
m = kit.Model('kagero-dd', skin=2048)
with m.tagged('hull'):
    m.hull_lines('hull', STATIONS, SECTION, node='Hull', deck_role='deck', deck_node='MainDeck',
                 below_role='antifouling', below_node='Bottom', subdivide=SUBDIVIDE)
stand = stand_fn(m)
inside = lambda x: m.hull_at(x)[3]  # noqa: E731

# The guns, from the spec (Ruling S8: two twin mounts; the 25 mm counts CITED above).
with m.tagged('turrets'), m.shared_chart():
    for name, g in naval.armament('kagero-dd'):
        x, z, b = g['x'], g['z'], g['bearingDeg']
        if name.startswith('Turret'):
            y = stand(x, 5.0)
            naval.turret(m, name, x, y, z, b, (5.0, 4.2, 2.2), 2, GUN_L, 0.1, elevation_deg=5.0)
        else:
            y = stand(x, 2.4)
            naval.MOUNTS[g['kit']](m, name, x, y, z, b, EMBED_M)
        if DRY_RUN:
            print(f'MOUNT {name} {x} {round(y, 2)} {z}')

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
with m.tagged('masts'):
    m.strut('fitting', (29.0, s0 + 5.4, 0.0), (28.4, s0 + 16.0, 0.0), 0.2, 0.14, sides=8)
    ym = stand(-11.5, 0.4)
    m.strut('fitting', (-11.5, ym, 0.0), (-11.9, ym + 9.0, 0.0), 0.18, 0.12, sides=8)  # forward of the aft tubes (x -20.8..-12.4)
    m.strut('fitting', (28.6, s0 + 12.5, -2.6), (28.6, s0 + 12.5, 2.6), 0.08, sides=6)  # yard
    m.lattice_mast('fitting', (28.7, s0 + 9.0, 0.0), 1.8, 1.8, 0.5, 1, 0.05)  # Type 22 array on the foremast
    m.lattice_mast('fitting', (-11.7, ym + 7.0, 0.0), 0.6, 0.4, 1.6, 3, 0.04)  # Type 13 ladder on the mainmast
with m.tagged('bridgewings'), m.shared_chart():
    m.box('superstructure', (29.0, y1 - 0.25, 0.0), (2.6, 0.25 + EMBED_M, 8.6))  # wings past the lower tier
    m.box('superstructure', (27.0, y2 - EMBED_M, 0.0), (2.2, 0.9, 3.4))  # compass platform behind the director
with m.tagged('searchlight'), m.shared_chart():
    sl = stand(6.5, 3.0)
    m.strut('fitting', (6.5, sl, 0.0), (6.5, sl + 5.0, 0.0), 0.6, 0.5, sides=12)
    m.box('fitting', (6.5, sl + 5.0 - EMBED_M, 0.0), (2.4, 0.2, 2.4))
    m.tank('fitting', (6.5, sl + 5.18, 0.0), 0.45, 0.8, segments=16)
with m.tagged('boats'), m.shared_chart():
    by = stand(4.5, 7.0) + 1.6
    for s in (-1, 1):
        m.fuselage('fitting', [(1.0, 0.25, 0.3, by, 2.0), (4.5, 0.9, 0.6, by, 2.4), (8.0, 0.2, 0.35, by + 0.15, 2.0)],
                   segments=24, center_z=s * (inside(4.5) - 1.1))
        for dx in (2.0, 7.0):  # davits, outboard of each boat
            m.strut('fitting', (dx, stand(dx, 0.4), s * (inside(dx) - 0.3)), (dx, by + 1.6, s * (inside(dx) - 0.9)), 0.07, sides=6)
with m.tagged('stern'), m.shared_chart():
    for s in (-1, 1):  # depth-charge racks (ESTIMATE)
        m.box('fitting', (-55.0, stand(-55.0, 3.0), s * (inside(-55.0) - 0.8)), (3.0, 0.9 + EMBED_M, 0.7))
m.marking('grid', tags=['hull'], spacingM=[None, 1.5, None], widthM=0.015, depth=0.6)
# M1 weathering: waterline grime, rust from the hawse pipes and scuppers, soot on the funnel caps.
m.marking('slab', tags=['hull'], axis='y', fromM=-0.6, toM=0.6, color='exhaustSoot', effect='stain', opacity=0.3, featherM=0.4)
for s in (-1, 1):
    m.marking('polygon', tags=['hull'], origin=(50.0, 0.0, s * 4.0), axis=(0.0, 0.0, float(s)), uDir=(1.0, 0.0, 0.0),
              points=[(-0.4, 6.6), (0.4, 6.6), (0.9, 3.0), (-0.8, 3.2)], color='rustStain', effect='stain', opacity=0.45, featherM=0.3)
    for x in (-30.0, 12.0):
        m.marking('polygon', tags=['hull'], origin=(x, 0.0, s * 5.3), axis=(0.0, 0.0, float(s)), uDir=(1.0, 0.0, 0.0),
                  points=[(-0.2, 5.4), (0.2, 5.4), (0.35, 2.8), (-0.3, 3.1)], color='rustStain', effect='stain', opacity=0.35, featherM=0.2)
m.marking('slab', tags=['funnels'], axis='y', fromM=11.8, toM=13.6, color='exhaustSoot', effect='stain', opacity=0.5, featherM=0.5)
m.export(out)
