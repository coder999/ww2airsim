# ww2airsim — Gameplay

What the player sees and does: how a mission is scored, how a pilot
advances, and the rosters of aircraft, ships, buildings and scenarios the
game is built from. Written to be read by a person, not an implementer.

This file was split out of the master spec
([`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md))
on 2026-09-24. **It owns these facts now**; the master spec's §8 and §9
keep their headings, so every existing "master spec §8" reference still
lands somewhere, and point here. Engineering detail stays in the master
spec: the schemas under which this content is stored (§9), the first pass's
plan history (§15, frozen 2026-10-08), and the tests that pin it (§11). Plans
and their status are [MASTER_PLAN.md](MASTER_PLAN.md).

Shipped versus planned is called out where it is known. The authoritative
status of any plan is [MASTER_PLAN.md](MASTER_PLAN.md) and the plan's handoff,
not this file.

## Meta-game


### Scoring

Points **bank however the flight ends** — landed, ditched or killed (Mark,
2026-09-27). Unlike the 1991 original, the game resurrects pilots, so death is
not the end of a career and a pilot whose points cross a threshold is promoted
posthumously. What a ditching or a death costs is the **badge**: a mission's
badge needs a landing (see Badges). **Destroying** something on your own side
forfeits the whole sortie, 0 points, however it ends (since F5A, 2026-10-14);
merely damaging it earns a radio warning and nothing more. A friendly ship counts
as destroyed when its hull reaches the bottom, 90 seconds after the killing blow.

The table below is the campaign table (GAMEPLAY.md, "Campaign scoring and conduct"),
used for all play since F5A (2026-10-14): transports went from 400 to 500, destroyers
from 750 to 1,000, and light vehicles and landing craft are new rows. A kill is
credited to every aircraft that damaged the target, whoever destroyed it, once;
a ship is credited when it reaches the bottom.

| Target | Points | Target | Points |
| --- | --- | --- | --- |
| Fighter | 500 | AAA battery | 250 |
| Bomber | 750 | Runway | 500 |
| Cruiser | 1500 | Building | 150 |
| Battleship | 3000 | Carrier | 5000 |
| Destroyer | 1000 | Transport | 500 |
| Tank | 300 | Light vehicle | 100 |
| Landing craft | 250 | | |

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

Each badge is shown as a ribbon: invented, not a real decoration, one design
per mission in the WWII USN palette (Mark, 2026-10-10). The designs are
`RIBBONS` in `src/render/insignia.ts`; a mission without one fails
`tests/render/insignia.test.ts`. Ribbons show in the Dossier's rack, on the
debrief beside BADGE AWARDED, and on each mission row of the picker, faded
until earned. Each rank is shown as its 1944 USN collar device (`rankDevice` in the same file; the Japanese devices are labeled estimates),
in the Headquarters roster, the dossier and beside a debrief promotion.

### Headquarters and the campaign roster

The front door is **Air Group Headquarters** (shipped by F5B, 2026-10-15). A new
visitor sees **Personnel Files**: start a campaign (U.S. Navy or Imperial Japanese Navy, a player
name) or open, export, import or delete a saved one. Import offers Replace or Cancel; there is no
keep-both and no migration of the old roster, which is discarded. Inside a campaign the Headquarters
shows the five-pilot roster (rank, score, record), the Commander's dossier and an Operations grid.
Each living pilot has a service record with kills, badges and a mission log; a lost pilot's file
stays on the roster as history and a replacement Ensign is posted.

A scored sortie is picked mission first (the current chapter or Non-campaign missions), then a pilot
(**Assign**), then Flight Conditions, Aircraft and Ordnance (shown as steps 3 to 5 of 5) and Launch.
**Training** and **Single** missions sit in the same Headquarters and are **unscored**: they bank
nothing, and the pause screen keeps Continue and Restart. A scored sortie is final: Pause offers
**Abandon Sortie** (the sortie is forfeited and banked as lost) and no Restart, and the debrief shows
a **Campaign Ledger** with only **Return to Headquarters**. A sortie banks exactly once, however it ends.

Which aircraft a mission offers is one table, `content/campaign/mission-aircraft.json`, read by the
catalog and by the Aircraft form (an aircraft above the pilot's rank is dimmed, "Needs <rank>").
P-38 is not on any list: every offered aircraft must be flyable by an entry-rank pilot.

**Dev** is a checkbox in the same screens. It unlocks the Dev rows, Night takeoff, God mode and the
whole aircraft list, and a one-click "Create dev campaign" makes a throwaway campaign. A sortie is
scored only if nothing is overridden: any Dev override makes it unscored (`unscoredReason` in
`src/render/campaignSession.ts`), but a Dev launch of an ordinary scored mission with no override
still scores and still records a flight record.

### Persistence

`localStorage` over the injected `StoragePort` (`src/campaign/storage.ts`; keys, the interrupted-sortie
record and the stale-revision guard are in `docs/campaign-data.md`, "The shell"). The old
`ww2airsim.roster.v1` key is purged at load. Export and import are in the Personnel Files screen.

### Mission selector

Headquarters offers four sections: the current chapter (`content/campaign/chapters.json`), Non-campaign
missions, Training Grounds and Single missions. The launch memos after the pilot are Flight Conditions,
Aircraft Assignment and Ordnance Requisition. A scored mission with an authored hour locks the takeoff
time; Dev can still pick Morning, Midday, Dusk or Night. Cloudiness is rolled when Flight Conditions
opens (Clear, Partly Cloudy, Cloudy, Overcast equally likely) and the pilot may pick another. The
loadout form lists the aircraft's real stores, whose mass and drag feed the flight model. Aircraft
figures spell out hit points and list engine power in horsepower. The last form shows the Difficulty
from Settings and, when it applies, "Not recorded: ..." for what will not bank.

### Planned Leyte campaigns (not yet shipped)

Track F replaces the current resurrection-era metagame with two independent,
story-driven Leyte campaigns while preserving Single Missions and Training as
free-form play. Everything in this subsection is approved player-facing design,
not current behavior. Implementation status and order remain in
[`MASTER_PLAN.md`](MASTER_PLAN.md); the
detailed mission and historical-source working record is the
[campaign brainstorm](docs/superpowers/notes/2026-10-12-leyte-campaign-brainstorm.md).

#### Campaign and player identity

Creating a campaign requires the human player's name and a permanent choice of
American or Japanese service. The same person may create a separate campaign for
the other side, but player points, command rating, badges, mission progress,
canonical world state, pilots, archives, and roster bonuses never cross between
campaigns.

The human player is distinct from the pilots flown. The campaign owns exactly five
living pilots. A pilot who is killed, captured, or dishonorably discharged leaves
the live roster permanently and keeps a closed dossier in the archive. Headquarters
automatically fills each vacancy with a newly generated entry-rank pilot who
inherits nothing. Names come from curated, period-grounded American or Japanese
given-name and surname lists; the American generator may add Jr., Sr., III, or IV.
American representation is inclusive without making ethnicity a stored attribute
or gameplay variable. Japanese names do not use those American-style suffixes.

The human-player dossier holds cumulative and adjusted scores, command rating,
campaign badges, aggregate results, roster strength, campaign victory, and a
chronological log. Its five command titles are competitive standing only and
unlock no gameplay:

| Human-player command title | Campaign points |
| --- | ---: |
| Squadron Commander | 0 |
| Air Group Commander | 20,000 |
| Wing Commander | 50,000 |
| Task Force Air Commander | 90,000 |
| Fleet Air Commander | 140,000 |

Raw player score is cumulative and may be farmed indefinitely through eligible
non-campaign missions. **Adjusted score** is player points divided by score-eligible
sorties launched. The denominator increments at launch and therefore includes
success, failure, abandonment, KIA, POW, and zero-point attempts. Training,
developer scenarios, and Single Missions outside a campaign affect neither score.
Both measures are intended for a future public Wall of Fame; submission identity,
verification, moderation, and anti-cheat are later work.

#### Pilot ranks and unlocks

Rank is the only pilot progression variable. There are no specialties,
qualifications, proficiency ratings, or statistical skill bonuses; the human still
flies the aircraft. The game uses naval ranks for both sides and every aviation
branch so the system stays legible:

| Tier | American rank | Japanese rank | Pilot points | Newly eligible play |
| ---: | --- | --- | ---: | --- |
| 1 | Ensign | Kaigun Shōi | 0 | Daytime, single-engine missions |
| 2 | Lieutenant (junior grade) | Kaigun Chūi | 2,500 | Night missions |
| 3 | Lieutenant | Kaigun Taii | 7,500 | Advanced aircraft |
| 4 | Lieutenant Commander | Kaigun Shōsa | 15,000 | Bombsight and torpedosight |
| 5 | Commander | Kaigun Chūsa | 25,000 | Coordinated operations with multiple formations or aircraft types |
| 6 | Captain | Kaigun Taisa | 40,000 | Campaign finale |

“Advanced” is an authored category, not a synonym for multi-engine. Its initial
American list is the P-38, B-17, and B-29; its Japanese list is the G4M, Ki-21,
and planned Ki-57. The PBY-5A is explicitly available to a Lieutenant (junior
grade) for the American night-rescue chapter. Lieutenant Commander's bombsight
marks the predicted ground impact point for a bomb released now; the torpedosight
shows water-entry/intercept prediction and whether the current release is valid.
They are information aids, do not change weapon physics or dispersion, and are
unavailable to lower-ranked pilots even though those pilots may still release the
weapons.

#### Campaign scoring and conduct

The campaign replaces the current target table with:

| Destroyed object | Points | Destroyed object | Points |
| --- | ---: | --- | ---: |
| Truck, car, or light vehicle | 100 | Fighter or attack aircraft | 500 |
| Building | 150 | Runway | 500 |
| Landing craft or small patrol boat | 250 | Transport or cargo ship | 500 |
| AAA battery | 250 | Bomber or transport aircraft | 750 |
| Tank | 300 | Destroyer | 1,000 |
| Cruiser | 1,500 | Battleship | 3,000 |
| Carrier | 5,000 | | |

Any actual player-caused durability damage tags an enemy for full credit during
that sortie. If it is later destroyed by the player, a friendly, a crash, fire, or
another cause, its full value is credited once to both the assigned pilot and human
player. A target that survives earns nothing; an untouched wingman kill earns
nothing; there are no fractional assists or final-blow bonuses.

A sortie that reaches its normal debrief banks legitimate destruction points even
when the primary objective or authored recovery fails. A player who shoots down an
enemy, returns, and lands without completing the objective keeps that enemy's
value, but receives no mission badge, campaign advancement, roster bonus,
difficulty bonus, or authored completion bonus. KIA, bailout, rescue, ditching, and
POW likewise retain legitimate destruction points unless the player explicitly
chooses **Quit/Abandon sortie**. Explicit mid-sortie abandonment forfeits the whole
sortie score and still increments the adjusted-score denominator.

Nonfatal friendly damage produces an immediate warning and nothing more. If the
player causes a friendly aircraft, ship, structure, or vehicle to be destroyed,
the assigned pilot is dishonorably discharged, the sortie scores zero and earns no
completion award, and headquarters supplies an entry-rank replacement. There is no
additional negative score.

A badge-earning sortie adds a fixed difficulty bonus to both ledgers: 0 on Recruit,
500 on Veteran, or 1,000 on Ace. Difficulty never multiplies target values. It also
adds a human-player-only living-roster bonus after the sortie: 0 / 100 / 200 / 300 /
400 / 500 points for each living Ensign-through-Captain counterpart, summed across
the five pilots. A mission with little destruction may define a visible completion
bonus; **Dumbo in the Gulf** initially awards 2,500 points to both ledgers. All
completion bonuses require the same primary-objective and authored-recovery success
as the badge. Accessibility, control assists, and graphics settings never change
score.

#### Campaign structure and missions

Campaign chapters unlock and must be completed in sequence. Success requires both
the primary objective and the mission's authored recovery: use the reachable
carrier, runway, or seaplane anchorage when it exists; a friendly egress boundary
is valid only when the historically appropriate recovery point lies outside the
playable world. A normal failure banks destruction points but does not award the
badge, change canonical campaign state, or unlock the next chapter. The chapter
remains available to retry with any eligible living pilot. A chapter that has been
completed is not replayable; Non-Campaign Missions always are. In a campaign a
landing ends the sortie: there is no Continue, and the result is banked once.

Repeatable **Non-Campaign Missions** are always available inside headquarters to
earn points and develop replacement pilots without advancing the story or changing
canonical world state. Each side always has an entry-rank option, so losing the
senior roster cannot deadlock a campaign. The existing scenario set seeds this
pool. **Single Missions** and **Training** outside a campaign do not affect a
campaign record.

Each side has six different chapters rather than the same missions with flags
reversed:

| Chapter | Date / label | Mission | Player aircraft | Minimum pilot rank | Core action |
| --- | --- | --- | --- | --- | --- |
| A1 | 20 Oct / historical composite | Over the Beaches | F6F Hellcat | Ensign | Defend the invasion fleet in a combat air patrol |
| A2 | 25 Oct / historical action, compressed | Taffy 3 | TBM-3 Avenger | Ensign | Bomb or torpedo a surface force during the Battle off Samar |
| A3 | 3 Nov / historical action, compressed | The Long Column | P-38 Lightning | Lieutenant | Attack a Japanese armored column |
| A4 | 5 Nov / historical composite | Dumbo in the Gulf | PBY-5A Catalina | Lieutenant (junior grade) | Night air-sea rescue and anchorage recovery |
| A5 | 11 Nov / historical composite | Close the Ormoc Lifeline | F6F Hellcat | Commander | Escort bombers against the reinforcement route |
| A6 | 6–7 Dec / historical action, compressed | Battle for the Airfields | P-38 Lightning | Captain | Large bombing-and-dogfight finale |
| J1 | 18 Oct / historical composite | Defend the Fields | A6M2 Zero | Kaigun Shōi | Defend Japanese-held airfields |
| J2 | 20 Oct / historical composite | Break the Landing | B5N2 Kate | Kaigun Shōi | Strike American invasion shipping |
| J3 | 3 Nov / historical composite | Road to Burauen | Ki-43 Oscar | Kaigun Shōi | Defend an armored column from air attack |
| J4 | 3 Dec / historical composite | Destroyers in the Bay | B5N2 Kate | Kaigun Chūi | Night torpedo attack amid a surface engagement |
| J5 | 6 Dec / historical composite | Night Drop on Burauen | Mitsubishi Ki-57 “Topsy” | Kaigun Taii | Fly and release a paratrooper drop at night |
| J6 | 7 Dec / alternate history | Operation Te-Go | Ki-43 Oscar or A6M2 Zero | Kaigun Taisa | Alternate-history combined bombing-and-dogfight finale |

Every chapter is labeled Historical action, Historical composite, or Alternate
history and carries a cited briefing. When the action is fabricated, the briefing
explains the real wartime role of its aircraft and the events that inspired it.
Meaningful action begins within 5–7 minutes at 1× speed, preferably 2–4; uneventful
transit may already have occurred before an airborne start. Both campaigns end with
the 6–7 December battle for the airfields. The American ending follows the
historical consolidation; the Japanese ending explicitly identifies its divergence
before an alternate expulsion of the beachhead.

#### Night, bailout, world state, and scenes

Night is low light, not complete darkness. Cockpit instruments are dimmed at night (a fixed level, no control);
aircraft receive only historically supported navigation, landing, formation,
recognition, or search lights rather than universal headlights. Temporary runway
and anchorage lamps, blackout-controlled ship and harbor lights, documented Leyte
navigation lights, fires, tracers, and authored flares make the night chapters
playable. A4, J4, and J5 are the initial night missions.

The pilot may deliberately bail out of a still-airborne aircraft. Friendly rescue
or overwhelming enemy control gives deterministic rescue or capture; contested
locations use a recorded seeded decision based on territory, nearby bases and
ships, rescue/enemy assets, surface, weather, visibility, and time. A rescued pilot
returns; a captured pilot is permanently archived as POW in the initial campaign;
KIA, POW, and discharge all trigger replacement. There is no modern ejection seat
and no initial prisoner-recovery mission.

Tacloban, Dulag, Buri, Bayug, San Pablo, Tanauan, Ormoc, the beachhead, ports, and
naval/seaplane areas use consistent canonical layouts. Construction, damage,
ownership, and takeover may change by chapter, but a base is not rebuilt into a
different arrangement for each mission. Every chapter receives a skippable 10–20
second opening rendered in the real world. Only A6 and J6 receive full victory
scenes and epilogues, after their results are safely banked.

Campaign state autosaves between sorties in a versioned, exportable record. The
initial campaign does not support mid-flight save/resume: an active sortie must be
completed, abandoned, or restarted. Development flight recordings are diagnostic
replays, not player save slots.

### In-flight guidance

The objective line names the current job. The steering cue sits in the scene:
an amber arrow floating ahead of the nose, a little above the gun line, turned
the way to the destination, with its name and range in miles beside it. Once
the destination is in front of you and on screen, the arrow gives way to an
amber diamond on the destination itself. It follows the first active primary
objective that has a destination. Selecting a base, carrier, waypoint or
objective target on the navigation chart (**P**) overrides that automatic
destination until the selection disappears or is destroyed.

### Debrief

Post-mission: targets destroyed with per-item points, mission total, recovery
multiplier applied, banked total, badges awarded, and any promotion.

### Landing and ditching rules

What counts as a survivable arrival. Every number below is an untuned guess
(nobody has flown the limits); the constants own the values, this table only
names them. Verified against the code 2026-09-28.

**Landing on land or a carrier deck** (`supportedContact`, `src/sim/ground.ts`).
All must hold when the wheels arrive (the sink limit is lower on a soft field, see "Where you landed"); fail any and the airplane is destroyed.
There is no pitch or bank gate.

| Gate | Limit | Constant |
| --- | --- | --- |
| Gear | at least 95% down | `GEAR_DOWN_FRACTION` |
| Sink rate | 4.0 m/s or less (about 790 ft/min; a flown approach measures 1.47 m/s) | `MAX_SUPPORTED_SINK_MPS` |
| Speed | 1.42 × the clean stall speed (139 mph for the F6F) or less, at any flap setting, while descending (Mark 2026-10-15: flaps used to lower this to 120 mph) | `MAX_SUPPORTED_SPEED_STALL_MULTIPLE` |

Speed and sink are judged relative to the surface, so a moving deck counts as
at rest.

**Carrier trap.** Hook down and main gear inside the ship's `trapZone` (distance
from the stern; Essex 30–130 m, Casablanca 20–80 m, both estimates), plus the
gates above, arrests the airplane at 17 m/s² (`TRAP_DECEL_MPS2`). Hook up or
outside the zone is an ordinary deck roll-out; the bow is a cliff. A failed deck
arrival is always destroyed, never a ditching.

**Ditching** (water only, `contactOutcome`, `src/sim/contact.ts`). All must hold:

| Gate | Limit |
| --- | --- |
| Bank | within 10° of level |
| Sink rate | 3.0 m/s or less (about 590 ft/min) |
| Pitch | −2° to +12° |
| Speed | 1.2 × clean stall speed or less (52.6 m/s for the F6F) |

Any other contact with land is destroyed.

**Where you landed.** Off an airfield, the surface under the wheels depends on
the land cover (the same raster that paints the ground), read at the wheel
position. Verified against the code 2026-09-28.

| Surface | Where | Rule | Constants |
| --- | --- | --- | --- |
| Runway | inside an airfield's runway, apron or clearing | the gates above, unchanged | `MAX_SUPPORTED_SINK_MPS` |
| Soft field | any other land that is not mostly woodland: paddy, grass, scrub, bare ground | a lower sink limit; more rolling resistance, so it takes a longer roll to stop with or without brakes (brakes still work); the speed gate is unchanged | `SOFT_FIELD_MAX_SINK_MPS`, `SOFT_FIELD_ROLLING_MULTIPLIER` |
| Woodland | land where tree plus mangrove cover reaches about half | any gear contact destroys the airplane | `FOREST_COVER_FRACTION` |

With no cover data loaded (the first seconds of a page load, or a test that
supplies none), all land is judged as a runway is. The landing report records
which surface the touchdown was on (`landClass`), for the debrief and missions to
use later; nothing shows it yet. A touchdown still counts as an airfield landing
only inside that airfield's runway.

**Scoring.** Landed, ditched and killed all carry the 1.0 recovery multiplier;
the badge is what needs a landing (see Badges).

### Instant Replay

A crash or shoot-down holds for three seconds, then replays eight seconds before
and eight seconds after the event so the aftermath can finish before the debrief.
**Watch replay** runs the same recording again. While
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
no catapults, and no mission uses the Casablanca (only the Essex is flown from
today); the take-off path is a deck run from the respot ("Launch when ready").
Measured 2026-09-28 at the shipped default fuel (400 kg), calm air, ship at
maximum speed on a straight course, start 7 m from the stern, full back stick
from 40 m/s airspeed. The start spot and pull point are my choices, not game
rules. `tests/sim/carrierTakeoff.test.ts` re-checks every aircraft and carrier
in `content/` this way.

| Ship | Aircraft | Flaps | Airspeed at liftoff | Deck run | Deck left |
| --- | --- | --- | --- | --- | --- |
| Essex (17 m/s, 256 m run) | F6F | 0 | 46.2 m/s | 119 m | 137 m |
| Essex | F6F | 1 | 41.4 m/s | 86 m | 170 m |
| Essex | F4F | 0 | 43.1 m/s | 106 m | 150 m |
| Essex | F4F | 1 | 41.1 m/s | 97 m | 159 m |
| Essex | Zero | 0 / 1 | 41.4 / 40.8 m/s | 77 m | 179 m |

Every Essex case is wheels-off well before the bow. Casablanca (9.93 m/s,
145.69 m deck, 139 m of run from the start spot, deck 12 m above the water):
the F6F with flaps 1 lifts at 138 m (about 1 m to spare) and the Zero at 125 m
(flaps 0) or 126 m (flaps 1). The F6F with flaps 0 and the F4F (both flap
settings) reach the bow still on the wheels at 40 to 43 m/s of airspeed, short of
the 1.1 x stall speed the wing needs for the F6F flaps 0 and the F4F flaps 0.

*Estimate (technique dependent):* what happens after the bow depends on the
pilot. Holding full back stick stalls, so that is not a credible pilot. With a
pilot who lowers the nose to 1.05 x stall speed and then pulls just enough to
stop sinking, the worst of those cases sags 2.6 m below deck level (F4F flaps
1), never touches the water, and climbs away. A pilot who sags less or more
than that policy will do better or worse; the figure is one measured policy,
not a limit.

*Earlier figures retracted (2026-09-28):* an earlier version of this paragraph
quoted Essex runs of 213 m, 126 m, 176 m and 118 m (margins of 42, 130, 80 and
138 m) and called Casablanca "marginal to impossible". Those were measured at
a lighter trial mass, not the shipped 400 kg fuel, and are superseded by the
table above.

**What is not modeled (arcade choices, Mark 2026-09-28).** Engine torque does
not pull the nose (every shipped aircraft has torque 0), and a tail strike is
not modeled: the pitch ceiling stops rotation, nothing is damaged.

**The touchdown squeak** plays on the first wheel contact after the airplane
has been more than 1 m up for half a second, with a sink rate of at least
0.3 m/s. It does not play on take-off, a hop or rolling chatter, and it does
not judge or damage the landing; that is the gates in the landing rules.

## Library

`hangar.html` ("Hangar" in the title's Administration memo) shows every aircraft,
ship, building and store in the rosters below: a turntable model, the gameplay
figures (hit points, speed, armament, points), read live from the game's own
content so they cannot go stale, and a short sourced history of the real
thing. A roster row with no game content yet shows as **Not yet in
service**, with its history and no model or figures; the card fills in when
its spec and model land. Stand-ins are disclosed on the card.

On a phone, the same complete catalog uses a compact filtered asset picker,
a full-width model viewport and a collapsible details sheet at the bottom.
The desktop layout keeps the object list and details beside the model.

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
| Consolidated PBY-5A Catalina | Player-flown amphibious patrol bomber |
| Vought F4U Corsair | Player-flown, friendly AI |
| Grumman TBF/TBM Avenger | Player-flown torpedo bomber |
| Mitsubishi A6M Zero | Hostile fighter |
| Aichi D3A Val | Hostile fighter |
| Nakajima Ki-43 Oscar | Hostile fighter |
| Nakajima Ki-84 Frank | Hostile fighter, higher performance |
| Mitsubishi G4M Betty | Hostile bomber, defensive gunners |
| Mitsubishi Ki-21 Sally | Hostile bomber |
| Nakajima B5N Kate | Hostile torpedo bomber |

The original fourteen rows mirror the 1991 game's roster and should be
confirmed against primary sources before art work begins; the Catalina is a
2026 expansion sourced from the 1945 Navy PBY-5A operating and maintenance
manuals.
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
| USS Crow (AMc-20) | Merchant, friendly, unarmed torpedo-recovery and training-target vessel |
| Type B "Maru" transport | Merchant, hostile (shipped: `type-b-maru.json`) |
| Kagero-class destroyer | Escort, hostile |
| Shiratsuyu-class destroyer | Escort, hostile — *Shigure* was the only survivor of Nishimura's force at Surigao Strait |
| Mogami-class heavy cruiser | Cruiser, hostile |
| Yamato-class battleship | Battleship, hostile, higher performance/heaviest armor |
| Shōkaku-class fleet carrier | Carrier, hostile: *Zuikaku*, Ozawa's flagship in the Northern Force decoy at Leyte Gulf (added 2026-10-09, Track M, M1e) |

All thirteen ship classes ship with models (verified 2026-10-11). Since Track M's M1
(2026-10-08), every warship carries its gun mounts: main turrets, heavy AA and
light AA at the positions its `content/ships/<id>.json` `armament` lists, each
mount drawn separately and able to turn; Crow and the Maru carry none. **Anti-aircraft
fire (M2, 2026-10-10):** every armed ship and every AAA battery shoots at any
airplane of the other side in range, never its own. Heavy guns (the 5-inch and
12.7 cm mounts) throw **flak bursts** that go off near you and hurt in a radius;
light guns (20, 25, 40 mm) fire **orange tracers** at close range. The default
is Moderate: circling a destroyer at 300 ft costs a Hellcat in about 20
seconds, a straight fast pass over it usually survives, and at 6,000 ft the
flak takes about a minute and a half. The guns shoot wide until they have
ranged in on you and lose you if you fly over them, so speed and not lingering
are what protect you. **Gun-laying (M3, 2026-10-10):** every drawn AA mount now
trains and elevates onto the same aircraft and ballistic lead its M2 fire uses.
Main turrets lay onto a hostile ship, or a standing hostile ground target when
there is no ship, but do not fire yet; main-battery firing remains M4
(`MASTER_PLAN.md`, Track M). The AA numbers are `AA_TUNING` in
`src/sim/weapons/aaFire.ts`.

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
| Anti-aircraft battery | `aaa` | AAA battery | 30 | Tacloban ×1; fires back at the other side's airplanes (M2): one 5-inch-class flak gun and one 40 mm twin |
| Hangar | `hangar` | Building | 90 | Dulag ×1 (22×28 m) |
| Maintenance shed | `hangar` | Building | 50 | Dulag ×1 (12×16 m) |
| Anti-aircraft battery | `aaa` | AAA battery | 30 | Dulag ×2; gameplay content (missions spec §4.2); fires back at the player (M2) |

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

Scenario-authored vehicles follow a fixed list of local `[x, z]` waypoints at
the requested speed, conforming to the terrain as they go. They stop at the
last waypoint unless `loop` is true. Vehicles can be hit by guns, rockets and
bombs; a destroyed vehicle stops and remains as a darkened, slumped wreck.
Each vehicle spec selects its scoring category: armor such as the Type 97
Chi-Ha scores in the existing **Tank** row, while unarmored scout cars and jeeps
score in the **Light vehicle** row (100; they scored as Buildings before F5A,
2026-10-14). Landing craft have their own row, for the vehicle specs that select it. Tank Buster's six 48-HP Chi-Ha targets use the same
vehicle simulation with stationary one-point routes. There is no player
driving, pathfinding, suspension, collision avoidance, vehicle weapons or
ground AI.

| Vehicle | Role |
| --- | --- |
| M4 Composite Sherman medium tank | Allied 75 mm tank used in the Philippines; Library/Hangar model with trainable turret and elevating gun |
| Type 97 Chi-Ha medium tank | Hostile 48-HP ground target in Tank Buster; temporary visual stand-in for the Type 89 and Type 95 tanks better documented on Leyte |
| Willys MB jeep | Friendly airfield scenery |
| Type 95 Kurogane scout car | Japanese command/reconnaissance counterpart to the Willys; moving hostile target in Gunnery Range |

In scenario JSON, `vehicles` entries name a vehicle spec, side, start pose,
speed and `waypoints`; `loop` is optional and defaults to false. The same form
is accepted in a held group's `vehicles` array, so a mission can spawn the
column later.

## Ordnance roster

Stores the aircraft carry. Each has a Library card whose model is generated from cited
dimensions ([ordnance spec §2](docs/superpowers/specs/2026-09-26-ordnance-and-effects-design.md)).

| Store | Kind |
| --- | --- |
| AN-M65 1,000 lb general-purpose bomb | bomb (Allied aircraft) |
| Type 98 No. 25 250 kg land bomb | bomb (Japanese aircraft) |
| 5-inch High Velocity Aircraft Rocket (HVAR) | rocket |
| Mk 13 aircraft torpedo | torpedo, drawn only (Track D) |
| Type 91 aerial torpedo | torpedo, drawn only (Track D) |

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

**Shipped on `main`** (`content/scenarios/`, checked 2026-10-11) are the
sandbox and test-range scenarios the engineering plans needed — `free-flight`,
`gunnery-range`, `pursuit-range`, `strike-range` and a few others — plus twelve
real missions: **Basic Flying**, **Torpedo Qualification**, **Deck Quals**
("Carrier Qualification"), **Airfield Strike**, **Convoy Strike**, **Tank
Buster**, **Combat Air Patrol**, **Single Combat**, **Scramble**, **Flattop
Hunt**, **Escort** and **Surigao Strait**, plus (F5A, 2026-10-14) **Field
Patrol**, the first mission with a Japanese player: an A6M2 Zero holds station
over Dulag and turns back two waves of American Hellcats (the entry-rank
Japanese non-campaign mission; see `docs/campaign-data.md`). Each declares real objectives,
carries a badge, a briefing and a cited history (M3-M4, 2026-09-27). Their
verdict paths are proven headless, with staged approaches and injected hits;
the intermediate trap and respot are not exercised in the browser (E2E
checks the briefing, objective line, radio, chart and debrief). Open items are in the M3 and M4 handoffs
(`docs/handoff/2026-09-27-m3-missions.md`, `2026-09-27-m4-combat-air-patrol.md`),
the F2 handoff (`docs/handoff/2026-10-09-f2-single-combat-scramble.md`) and
the Flattop Hunt handoff (`docs/handoff/2026-10-10-flattop-hunt.md`), the
Escort handoff (`docs/handoff/2026-10-10-escort-mission.md`), the Tank Buster
handoff (`docs/handoff/2026-10-11-tank-buster-mission.md`) and the Surigao
handoff (`docs/handoff/2026-10-11-surigao-strait-mission.md`).

**Carrier Qualification guidance** (2026-10-11) teaches the pattern instead
of jumping from DOWNWIND straight to the carrier marker. After each launch the
instructor calls for gear and flaps up in the climb. After the abeam gate, the
steering cue follows a moving LINEUP point 2,250 m astern on the carrier's
3.5-degree glideslope; in the F6F it shows 97 mph and 500 ft. Once established
inside Paddles' cone and closing, it switches to the trap zone and the FINAL
gear/flaps/hook checklist. Paddles' fast and slow calls report airspeed only;
they do not prescribe a throttle change that the cue cannot infer. Handoff:
`docs/handoff/2026-10-11-carrier-qualification-guidance.md`.

**Surigao Strait** (Track F, 2026-10-11) is a dawn-aftermath mission. *Fuso*
and *Yamashiro* are already sunk. The player's F6F carries both bombs and
rockets, pursues *Mogami* south while an American battle line exchanges real
main-battery fire with a representative rear guard, then recovers aboard a
staged Essex. Explicit surface-fire orders and separation keep the battle
line from completing the player's *Mogami* objective. The roster and carrier
compress several real formations and hours of the 25 October pursuit; the
briefing and cited history call out that abstraction.

**Tank Buster** (2026-10-11) starts a Hellcat airborne south of Dulag with
rockets and bombs. Six Japanese tanks form three close pairs along the
Dulag-Burauen approach; destroy four and recover at Tacloban for the badge,
or destroy all six for the secondary objective. The mission is a historical
composite. Its Chi-Ha is authentic to the Philippines theater but explicitly
stands in for Type 89 and Type 95 tanks better documented on Leyte.

**Escort** (Track F, 2026-10-10) is item 4 above, as Mark decided it: the
player's Hellcat escorts four B-17s to Dulag's hangars while four Zeros
intercept. The badge needs at least three bombers left, a hangar down, and a
landing at Tacloban. Unescorted, the Zeros shoot down three or four of the
bombers at every difficulty.

**Basic Flying** (B4, 2026-10-10) is the tutorial, and the first mission in the
picker. It is an ordinary mission with an instructor on the radio: full
throttle, take off, gear up, climb above 1,500 ft, fly to the marker over the
bay (the steering arrow), strafe the two parked Hellcats, bomb the cargo ship
(optional; the Impact marker, **U**, is taught here), join the final, set the
gear and flaps and slow to under 120 mph, land. A step is done when the
airplane is in the state it asks for (a *plane-state test*, `CONTEXT.md`); the
instructor's lines are on-screen text only. Handoff
`docs/handoff/2026-10-10-b4-tutorial.md`.

**Torpedo Qualification** (2026-10-11) is the Avenger's production training
mission. The instructor leads a runway takeoff, a marked low-level run toward
USS Crow, opening the internal bay, releasing one Mk 13, securing the bay and
recovering at Tacloban. The release itself completes the attack step, so a hit
or miss is acceptable. Crow's scenario-only `practiceTarget` flag preserves the
normal torpedo run, splash and detonation while preventing hull damage, flooding,
