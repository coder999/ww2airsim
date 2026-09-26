# ww2airsim — Gameplay

What the player sees and does: how a mission is scored, how a pilot
advances, and the rosters of aircraft, ships, buildings and scenarios the
game is built from. Written to be read by a person, not an implementer.

This file was split out of the master spec
([`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md))
on 2026-09-24. **It owns these facts now**; the master spec's §8 and §9
keep their headings, so every existing "master spec §8" reference still
lands somewhere, and point here. Engineering detail stays in the master
spec: the schemas under which this content is stored (§9), the plan order
and what has shipped (§15), and the tests that pin it (§11).

Shipped versus planned is called out where it is known. The authoritative
status of any plan is the table in master spec §15, not this file.

## Meta-game


### Scoring

Points are **provisional until recovery**. This is the central risk/reward
mechanic: kills are worth nothing until the pilot is back on a deck or runway.

| Target | Points | Target | Points |
| --- | --- | --- | --- |
| Fighter | 500 | AAA battery | 250 |
| Bomber | 750 | Runway | 500 |
| Cruiser | 1500 | Building | 150 |
| Battleship | 3000 | Carrier | 5000 |

Recovery multiplier applied to the mission total:

| Outcome | Multiplier |
| --- | --- |
| Landed at carrier or airfield | 1.0 |
| Ditched alongside friendly ships | 0.5 |
| Bailed out over friendly water | 0.25 |
| Killed, or captured over enemy territory | 0.0 |

### Ranks

Cumulative banked score determines rank.

| Rank | Abbrev | Threshold |
| --- | --- | --- |
| Ensign | ENS | 0 |
| Lieutenant, junior grade | LTJG | 2,500 |
| Lieutenant | LT | 7,500 |
| Lieutenant Commander | LCDR | 17,500 |
| Commander | CDR | 35,000 |
| Captain | CAPT | 60,000 |
| Commodore | COMO | 100,000 |
| Rear Admiral | RADM | 150,000 |
| Vice Admiral | VADM | 225,000 |
| Admiral | ADM | 325,000 |

Flag officers do not fly combat aircraft. The top tiers are prestige rewards,
and the game does not pretend otherwise.

**Period accuracy note.** The ladder deviates from the modern USN list it was
drawn from. In 1944 the one-star flag rank was **Commodore** (reestablished
9 April 1943 for wartime service) and **Rear Admiral** was two stars with no
upper/lower-half split; "Rear Admiral (lower half)" as a title dates only to
1986. The substitution is one-for-one, so tier count and thresholds are
unchanged.

### Badges

Objective-based, not score-based. Each scenario defines named objectives;
completing them awards that scenario's badge. This deliberately rewards flying
the brief over farming kills.

### Pilot roster

The main menu is a roster of pilot records:

```
name, rank, cumulativeScore, missionsFlown, sorties,
kills (by type), badges[], status: 'active' | 'kia', resurrections,
career { flightSeconds, landings { trap, field, ditched },
         maxAltitudeM, maxTrueAirspeedMps },
log[] (the latest 200 debriefs)
```

Each roster row's **Dossier** button opens that pilot's service record,
kills, badges and mission log (`src/render/dossier.ts`).

**Resurrection** flips `status` from `kia` back to `active` and increments
`resurrections`. It does not erase the death. The roster stays simultaneously
honest and forgiving.

### Persistence

`localStorage`, key `ww2airsim.roster.v1` (`src/render/roster.ts`; the
original IndexedDB plan was dropped, Mark's call, 2026-09-23). Records from
before the Dossier load with a zeroed `career` and an empty `log`. JSON
export and import exist in `roster.ts` so a pilot can survive a cleared
browser, but no UI calls them yet (master spec §15, row 9). Save/load round-trip equality is a property test (master spec §11). Server-side
sync against existing auth infrastructure is possible later but is not worth
the coupling now.

### Mission selector

Scenario choice plus pre-flight loadout: fuel fraction and bomb count, both
feeding mass and drag into the flight model. The loadout screen is a
performance decision, not decoration.

### Debrief

Post-mission: targets destroyed with per-item points, mission total, recovery
multiplier applied, banked total, badges awarded, and any promotion.

## Library

`hangar.html` ("Library" on the title's first form) shows every aircraft,
ship and building in the rosters below: a turntable model, the gameplay
figures (hit points, speed, armament, points), read live from the game's own
content so they cannot go stale, and a short sourced history of the real
thing. A roster row with no game content yet shows as **Not yet in
service**, with its history and no model or figures; the card fills in when
its spec and model land. Stand-ins are disclosed on the card.

The rosters below are checked against `content/library/` by a test: a row
added here without a library file fails the suite. Design:
[hangar spec](docs/superpowers/specs/2026-09-25-hangar-library-design.md).

## Aircraft roster


| Aircraft | Role |
| --- | --- |
| Grumman F4F Wildcat | Player-flown |
| Grumman F6F Hellcat | Player-flown |
| Lockheed P-38 Lightning | Player-flown, friendly AI |
| Boeing B-17 Flying Fortress | Player-flown, friendly AI, escort subject |
| Boeing B-29 Superfortress | Player-flown, friendly AI, escort subject |
| Vought F4U Corsair | Player-flown, friendly AI |
| Mitsubishi A6M Zero | Hostile fighter |
| Aichi D3A Val | Hostile fighter |
| Nakajima Ki-43 Oscar | Hostile fighter |
| Nakajima Ki-84 Frank | Hostile fighter, higher performance |
| Mitsubishi G4M Betty | Hostile bomber, defensive gunners |
| Mitsubishi Ki-21 Sally | Hostile bomber |

This roster mirrors the original's and should be confirmed against a primary
source before art work begins; it currently derives from a secondary summary.
(Typos corrected 2026-09-24: F4F not "f4F", F4U not "f4U", "friendly" not
"firendly"/"friendly-flow", Ki-21 not "K-21" — the Imperial Japanese Army
bomber the 1991 original calls "Sally" is the Mitsubishi **Ki-21**, not a
"K-21," which is not a real aircraft designation.)

## Ship roster


Added 2026-09-24, alongside the render-quality realism work — same caveat
as the aircraft roster above: derived from a secondary summary of the
historical Leyte Gulf order of battle, confirmed against a primary source
before art/hull-geometry work begins. `role` matches
`src/sim/world/ships.ts`'s existing enum exactly (`carrier` / `cruiser` /
`battleship` / `escort` / `merchant`) — no new role values needed.

| Ship | Role |
| --- | --- |
| Essex-class fleet carrier | Carrier, friendly (shipped: `essex-cv.json`) |
| Casablanca-class escort carrier | Carrier, friendly, smaller/slower — the "jeep carriers" of the Battle off Samar |
| Fletcher-class destroyer | Escort, friendly (shipped: `fletcher-dd.json`) |
| Cleveland-class light cruiser | Cruiser, friendly |
| Pennsylvania-class battleship | Battleship, friendly — one of the pre-war "Old Battleships" that fought at Surigao Strait |
| Type B "Maru" transport | Merchant, hostile (shipped: `type-b-maru.json`) |
| Kagero-class destroyer | Escort, hostile |
| Shiratsuyu-class destroyer | Escort, hostile — *Shigure* was the only survivor of Nishimura's force at Surigao Strait |
| Mogami-class heavy cruiser | Cruiser, hostile |
| Yamato-class battleship | Battleship, hostile, higher performance/heaviest armor |

Three of ten are shipped content today; the rest are names and roles only,
same status as most of the aircraft roster above. Candidate 3D models for
several of them are recorded in `ASSETS.md` under "Candidate models".

## Building roster

New 2026-09-24. Buildings are the ground targets that score as **Building**
(150) or **AAA battery** (250) in the [scoring table](#scoring), and the
scenery an airfield is made of. A building is content, not code: each
airfield lists its own in `content/bases/<id>.json` (`buildings`:
`kind`, position in the airfield's local frame, footprint, `hp`), validated
at load like everything else in master spec §9. `kind` is one of `hangar`,
`tower`, `aaa`.

What can be shot, verified against `content/bases/` and
`src/sim/world/airfields.ts` on 2026-09-24:

| Building | Kind | Scores as | HP | Where |
| --- | --- | --- | --- | --- |
| Large hangar (barrel-roof) | `hangar` | Building | 120 | Tacloban ×3 (34×42 m, 34×42 m, 28×36 m) |
| Control tower | `tower` | Building | 40 | Tacloban |
| Anti-aircraft battery | `aaa` | AAA battery | 30 | Tacloban ×1; does not fire back yet |
| Hangar | `hangar` | Building | 90 | Dulag ×1 (22×28 m) |
| Maintenance shed | `hangar` | Building | 50 | Dulag ×1 (12×16 m) |

Hit points are gameplay choices, not historical figures. One bomb or three
rockets razes a 120-HP hangar; strafing works too but takes 30 rounds. Razing only counts toward a mission's
**RAZED** readout at an *enemy-held* airfield: a scenario names those in
`enemyAirfields`, and wrecking your own hangar costs nothing and awards
nothing. The numbers and the reasoning are in the
[strike design](docs/superpowers/specs/2026-09-20-strike-design.md) §3.5–3.6.

Dulag's two buildings are deliberate: it was a hastily-established fighter
strip in October 1944, so it has no tower and no AAA (Plan 13d).

Scenery that is drawn but cannot be hit: town and village huts (from
OpenStreetMap settlements), the Tacloban service apron and stores, drums,
crates and a windsock. They block trees and are visual only.

**Not built yet:**

- **Runway** is a row in the scoring table (500) but not a building. A
  runway is a strip, not a discrete structure, and no plan has designed what
  destroying one means (cratering? a strike-radius trigger?). The row is
  unreachable today, by design, rather than silently wrong.
- Everything below is a candidate roster, not shipped content and not
  checked against a primary source. Names and roles only, same status as
  most of the aircraft roster:

| Building | Role |
| --- | --- |
| Fuel tank farm | Target; a large secondary fire when destroyed |
| Ammunition bunker | Target; secondary explosion |
| Radio / radar station | Target; scores as Building, an objective for a strike scenario |
| Barracks and huts | Target; scores as Building |
| Revetment | Cover for parked aircraft; not a target in itself |
| Coastal gun battery | Hostile shore defence, the shore counterpart of AAA |
| Pier and warehouses | Harbour target at a port town; supply objective |

## Vehicle roster

New 2026-09-25, candidate only. No vehicle exists in the sim, and the
[scoring table](#scoring) has no vehicle row, so none of these can be shot or
scored yet. Listed so the candidate models in `ASSETS.md` have a role to be
checked against.

| Vehicle | Role |
| --- | --- |
| Type 97 Chi-Ha medium tank | Hostile ground target |
| Willys MB jeep | Friendly airfield scenery |

## Scenarios


Eight, with original names rather than the 1991 game's mission list:

1. **Deck Quals** — training: launch, pattern, recover
2. **Scramble** — intercept inbound G4M formation
3. **Airfield Strike** — bomb a coastal airstrip
4. **Escort** — protect a B-17 formation
5. **Flattop Hunt** — strike an enemy carrier
6. **Combat Air Patrol** — fighter sweep
7. **Kamikaze Watch** — defend the fleet from massed attack
8. **Single Combat** — 1v1 against a veteran Ki-84

**Shipped today** (`content/scenarios/`, checked 2026-09-24) are the
sandbox and test-range scenarios that the engineering plans needed, not the
eight above: `free-flight`, `deck-quals`, `gunnery-range`, `pursuit-range`
and `strike-range`. Of the eight, only Deck Quals has a shipped counterpart,
and that is a stand-in without objectives. No scenario declares an objective
yet, so no badge is earnable yet. Full status and open items are in master
spec §15.
