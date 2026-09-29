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

Points **bank however the flight ends** — landed, ditched or killed (Mark,
2026-09-27). Unlike the 1991 original, the game resurrects pilots, so death is
not the end of a career and a pilot whose points cross a threshold is promoted
posthumously. What a ditching or a death costs is the **badge**: a mission's
badge needs a landing (see Badges). Damaging your own side forfeits the whole
sortie, 0 points, however it ends.

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
| Ditched | 1.0 |
| Killed | 1.0 |
| Any of the above after friendly fire | 0 (forfeit) |

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
completing them and then landing awards that scenario's badge; a ditching or a
death earns none (`src/sim/mission/outcome.ts`). This deliberately rewards
flying the brief, and bringing the airplane home, over farming kills.

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

### Instant Replay

A crash or shoot-down holds for three seconds, replays the final moments once,
then opens the debrief. **Watch replay** runs the same recording again. While
paused, **K** opens a manual replay of the last 10 seconds once at least three
seconds have been recorded.

| Input | Replay action |
| --- | --- |
| Space | Play / pause |
| Left / Right | Step back / forward one second (Shift: one simulation tick) |
| 1 / 2 / 3 | 0.5× / 1× / 3× speed |
| C | Cycle cameras |
| 4–9 | Auto, Orbit, Flyby, Target, Cockpit, Manual |
| O | Toggle Orbit spin |
| L | Toggle Manual lock on the airplane |
| WASD, Q / E | Move Manual forward/sideways, down/up |
| Mouse drag / wheel | Look around / change Manual movement speed |
| Esc | Leave or skip replay |

Replay owns these keys while it is up; it does not alter the held live flight,
assist settings, audio mute, chart, radar range, or time scale.

### Takeoff

Measured 2026-09-28 through the real sim step, from a standstill on the
Tacloban runway at full throttle (`tests/sim/ground/`). Speeds below are the
first instant the wheels leave the ground.

**Ground controls.** The arrow keys and A/D steer on the ground and roll in the
air; Z/X are rudder. **B** holds the brakes. There are no differential
brakes: steer with the keys, brake with B.

**Steering fades with speed.** The wheel (nose or tail) steering locks out
above about 8 m/s. Ground steering through rudder and the keys then fades out
near 1.5 × the aircraft's `tailLiftSpeedMps` (F6F 42 m/s, F4F 37.5, Zero 36),
after which only the rudder's air authority is left. Do not expect to correct a
swing with the arrows once the tail is up and fast.

**When and how to pull.** Hold the stick neutral and full throttle until the
airspeed is near the table below, then pull back and hold. The pitch is capped
on the wheels at the attitude where the wing makes its lift for 1.1 × the
clean stall speed (12.6 degrees for all three aircraft; `groundPitchCeilingRad`
in `src/sim/ground.ts`), so a firm pull leaves the ground within a few knots of
the table and cannot over-rotate on the runway. Hands off, the airplane never
lifts off by itself (a conformance test holds it for 30 s at full throttle).

**Flaps 0 vs 1 (F toggles).** Flaps 1 lifts off about 8 m/s earlier and
roughly 100 to 140 m shorter. Measured, full pull held from 40 m/s, trial mass
(fuel load large, so heavy):

| Aircraft | Flaps | Liftoff speed | Run |
| --- | --- | --- | --- |
| F6F | 0 | 51.0 m/s (114 mph) | 449 m |
| F6F | 1 | 42.9 m/s (96 mph) | 312 m |
| F4F | 0 | 46.4 m/s (104 mph) | 401 m |
| F4F | 1 | 41.4 m/s (93 mph) | 307 m |
| Zero | 0 | 41.7 m/s (93 mph) | 265 m |
| Zero | 1 | 40.8 m/s (91 mph) | 263 m |

The Zero and the flaps-1 rows are pinned near 40 m/s because the test starts
its pull there; a pull earlier would lift them slightly sooner. The scenario's
default 400 kg fuel load is lighter than this trial mass and lifts sooner
(F6F flaps 0: 46.2 m/s, 119 m on a carrier deck).

**Carrier.** The game has no ship-speed-as-wind setting: airspeed is the
airplane's velocity minus the world wind, and the deck carries the ship's
velocity, so in calm air the wind over the deck is the ship's speed. There are
no catapults; the take-off path is a deck run from the respot ("Launch when
ready"). Measured 2026-09-28 (calm air, ship at maximum speed on a straight
course, start 7 m from the stern, pull from 40 m/s airspeed; the start spot and
pull point are my choices, not game rules):

| Ship | Aircraft | Flaps | Liftoff airspeed | Deck run | Deck left |
| --- | --- | --- | --- | --- | --- |
| Essex (17 m/s) | F6F | 0 | 51.0 m/s | 213 m | 42 m |
| Essex | F6F | 1 | 42.8 m/s | 126 m | 130 m |
| Essex | F4F | 0 | 46.5 m/s | 176 m | 80 m |
| Essex | F4F | 1 | 41.3 m/s | 118 m | 138 m |

At trial mass, Casablanca (9.93 m/s, 145.69 m deck) sends all four cases off
the bow with the wheels still down. At the default 400 kg the F6F with flaps 1
lifts with under a metre to spare and the other cases run off the bow. The fall
after the bow is an estimate: the measurement holds full pull, which stalls it,
so it overstates how hard a real pilot would hit the water. Treat Casablanca
take-off as marginal to impossible without a catapult.

**What is not modeled (arcade choices, Mark 2026-09-28).** Engine torque does
not pull the nose (every shipped aircraft has torque 0), and a tail strike is
not modeled: the pitch ceiling stops rotation, nothing is damaged.

**The touchdown squeak** plays on the first wheel contact after the airplane
has been more than 1 m up for half a second, with a sink rate of at least
0.3 m/s. It does not play on take-off, a hop or rolling chatter, and it does
not judge or damage the landing; that is the gates in the landing rules.

## Library

`hangar.html` ("Library" on the title's first form) shows every aircraft,
ship, building and store in the rosters below: a turntable model, the gameplay
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
`src/sim/world/airfields.ts` on 2026-09-27:

| Building | Kind | Scores as | HP | Where |
| --- | --- | --- | --- | --- |
| Large hangar (barrel-roof) | `hangar` | Building | 120 | Tacloban ×3 (34×42 m, 34×42 m, 28×36 m) |
| Control tower | `tower` | Building | 40 | Tacloban |
| Anti-aircraft battery | `aaa` | AAA battery | 30 | Tacloban ×1; does not fire back yet |
| Hangar | `hangar` | Building | 90 | Dulag ×1 (22×28 m) |
| Maintenance shed | `hangar` | Building | 50 | Dulag ×1 (12×16 m) |
| Anti-aircraft battery | `aaa` | AAA battery | 30 | Dulag ×2; gameplay content (missions spec §4.2); does not fire back yet |

Hit points are gameplay choices, not historical figures. One bomb or three
rockets razes a 120-HP hangar; strafing works too but takes 30 rounds. Razing only counts toward a mission's
**RAZED** readout at an *enemy-held* airfield: a scenario names those in
`enemyAirfields`, and wrecking your own hangar costs nothing and awards
nothing. The numbers and the reasoning are in the
[strike design](docs/superpowers/specs/2026-09-20-strike-design.md) §3.5–3.6.
Dulag's AAA batteries count as enemy structures there too, so `strike-range`'s
RAZED readout can now reach 4, not 2 (M3, 2026-09-27).

Dulag's hangar and maintenance shed are the historically motivated set: it was a
hastily-established fighter strip in October 1944, so it has no tower
(Plan 13d). Its two AAA batteries are **gameplay content, not history**,
added for Airfield Strike's secondary objective (missions spec
[2026-09-25](docs/superpowers/specs/2026-09-25-missions-design.md) §4.2) at
Tacloban's emplacement size and HP; `dulag.json`'s `reference.source` says
the same (M3 Task 5, 2026-09-27).

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

## Ordnance roster

Stores the aircraft carry. Each has a Library card whose model is generated from cited
dimensions ([ordnance spec §2](docs/superpowers/specs/2026-09-26-ordnance-and-effects-design.md)).

| Store | Kind |
| --- | --- |
| AN-M65 1,000 lb general-purpose bomb | bomb |
| 5-inch High Velocity Aircraft Rocket (HVAR) | rocket |

## Scenarios


Eight, with original names rather than the 1991 game's mission list:

1. **Deck Quals** — training: launch, pattern, recover
2. **Scramble** — intercept inbound G4M formation
3. **Airfield Strike** — bomb a coastal airstrip
4. **Escort** — protect a B-17 formation
5. **Flattop Hunt** — strike an enemy carrier
6. **Combat Air Patrol** — hold CAP over the carrier and turn back the raids (missions spec §4.4)
7. **Kamikaze Watch** — defend the fleet from massed attack
8. **Single Combat** — 1v1 against a veteran Ki-84

Mark added a ninth, **Convoy Strike** — bomb and rocket a Japanese
reinforcement convoy off Ormoc — on 2026-09-25 (missions spec §0.4). It is
not renumbered into the list above; the numbering above is the original
eight.

**Shipped today** (`content/scenarios/`, checked 2026-09-27) are the
sandbox and test-range scenarios the engineering plans needed —
`free-flight`, `gunnery-range`, `pursuit-range`, `strike-range` and a few
others — plus four real missions: **Deck Quals** ("Carrier Qualification"),
**Airfield Strike**, **Convoy Strike** and **Combat Air Patrol**. Each declares real objectives,
carries a badge, a briefing and a cited history (M3-M4, 2026-09-27). Their
verdict paths are proven headless, with staged approaches and injected hits;
the intermediate trap and respot are not exercised in the browser (Tier 2
checks the briefing, objective line, radio, chart and debrief). Full status and open items are in
master spec §15.
