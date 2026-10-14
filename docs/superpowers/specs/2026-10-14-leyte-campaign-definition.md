# F3 — Leyte campaign definition and source lock

**Status:** review draft; no downstream implementation is released by this document yet

**Date:** 2026-10-14

**Branch:** `f3-campaign-lock`

**Viewing checkpoint:** final lock only
**Run:** unattended to the final checkpoint pending Mark's kickoff reply

## 1. Purpose and authority

This document resolves the alternatives in the 12 October campaign brainstorm into one bounded
implementation contract for MASTER_PLAN Track F3. `GAMEPLAY.md` remains the home of approved
player-facing rules. This lock owns the implementation-facing chapter matrix, source limits,
canonical site states, scene dependencies, reusable-asset inventory, and plan dependency graph.

Nothing in this document authorizes F4 asset production until Mark reviews the lock. Nothing in F4
authorizes campaign systems, base layouts, scenes, or mission scripting until every individual F4
asset passes its attended Hangar gate.

## 2. Global campaign contracts

- Chapter order is linear within each faction. A normal failed sortie may bank legitimate score,
  but only primary-objective success plus authored recovery awards the badge, applies the state
  transition, and unlocks the next chapter.
- Action begins in at most 7 minutes at 1×. Distances below are path-length ceilings for ordinary
  cruise, not promises to place an actor at an arbitrary straight-line coordinate before F8 fixes
  the canonical layout.
- Surface starts count takeoff time. Openings are outside the budget and skipping them changes no
  simulation state.
- A reachable carrier, runway, or seaplane anchorage must be used. An egress gate is legal only for
  aircraft whose historical home lies outside the playable world.
- `conditional field set` is an exact recovery graph, not an invitation for any friendly field:
  only the named fields qualify, and only while allied/controlled and serviceable.
- Mission populations below are simultaneous maxima. Spawned replacements wait for a preceding
  group to depart, land, or be destroyed.
- The finale population is fixed at 24 airborne aircraft including the player, 10 ships, and no
  more than 16 aircraft in the close-combat set.
- Unless a row says otherwise, no authored completion points are paid. A4 retains the approved
  2,500-point exception.

## 3. Frozen chapter matrix

| Id | Date / honesty label | Aircraft / minimum rank | Light | First action | Recovery budget | Authored recovery |
| --- | --- | --- | --- | --- | ---: | --- |
| A1 | 20 Oct 1944 / historical composite | F6F-5 / Ensign | 0800, partly cloudy | 3–4 min; raid contact inside 15 mi | ≤5 min | Essex trap |
| A2 | 25 Oct 1944 / historical action, geographically and numerically compressed | TBM-3 / Ensign | 0730, broken cloud and squalls | 2–3 min; surface engagement inside 12 mi | 4–6 min | surviving Casablanca-class carrier trap |
| A3 | 3 Nov 1944 / historical action, force compressed | P-38L / Lieutenant | 0930, partly cloudy | 2–3 min; column inside 12 mi | 6–7 min | Tacloban landing |
| A4 | 5 Nov 1944 / historical composite | PBY-5A / Lieutenant (junior grade) | 2100, night, scattered cloud | 5–6 min including water takeoff; search area inside 10 mi | 5–6 min | San Pedro Bay anchorage, afloat and stopped |
| A5 | 11 Nov 1944 / historical composite | F6F-5 / Commander | 1030, broken cloud | intercept 2–3 min; convoy 5–6 min | 5–7 min | Essex trap |
| A6 | 6–7 Dec 1944 / historical action, multi-day compressed finale | P-38L / Captain | dawn | 1–2 min | ≤7 min | serviceable allied Tacloban, Bayug, or Buri |
| J1 | 18 Oct 1944 / historical composite | A6M2 / Kaigun Shōi | 0830, partly cloudy | 2–3 min including takeoff; attackers inside 6 mi | 3–4 min | Buri; Bayug only if Buri runway becomes unserviceable |
| J2 | 20 Oct 1944 / historical composite | B5N2 / Kaigun Shōi | 1515, broken cloud | CAP 2–3 min; ships 5–6 min | 3–5 min | western/southern egress gate |
| J3 | 3 Nov 1944 / historical composite | Ki-43-IIb / Kaigun Shōi | 0945, partly cloudy | 2–3 min | 3–5 min | Bayug landing |
| J4 | 3 Dec 1944 / historical composite | B5N2 / Kaigun Chūi | 2130, night | <2 min | 3–4 min | western egress gate |
| J5 | 6 Dec 1944 / historical composite | Ki-57-II / Kaigun Taii | 1830, night | intercept 2–3 min; drop 5–6 min | 3–5 min | western egress gate |
| J6 | 7 Dec 1944 / alternate history | Ki-43-IIb or A6M2 / Kaigun Taisa | dawn | 2–3 min | ≤7 min | Japanese-held, serviceable Buri or Bayug |

`A4` uses 5 November as a representative early-November night so the chapter sequence stays
chronological and the content has a fixed date; the
briefing must say that no specific documented rescue is being reenacted. `J4` uses 3 December, the
date of the destroyer action in which *Cooper* was lost, but the Kate attack remains openly
fabricated. `J6` begins the morning after the J5 drop and names the divergence in its briefing.

## 4. Exact mission definitions

### A1 — Over the Beaches

**Start and primary graph.** The player and two F6Fs launch from Essex 12–15 miles east of the
landing area. Four Type B Marus represent invasion transports. The badge path is `launch -> raid
contact -> at least three transports survive the attack window -> raid withdraws -> trap on Essex`.

**Secondary.** Destroy two bombers before they enter release range.

**Bounded population.** Friendly air: player plus two F6Fs. Enemy air: four G4Ms, four A6M2s and
two D3As (13 airborne at peak). Large ships: Essex, one Fletcher, one Cleveland and four Type B
Marus. Four LCVPs operate close to shore. The Cleveland's naval fire is visual/scripted against
inland points; it does not solve the air-defense objective.

**State transition.** The landing-beach state advances from assault to established beachhead;
Tacloban and Dulag change from Japanese to captured/reconstruction states.

### A2 — Taffy 3

**Start and primary graph.** The player begins airborne with two TBMs 8–12 miles southeast of the
engagement. The badge path is `join attack -> player causes durability damage to Yamato or Mogami
-> Casablanca survives the attack window -> trap on that carrier`.

**Secondary.** Disable one Japanese destroyer.

**Bounded population.** Friendly air: player, two TBMs and two F4F-4 stand-ins for FM-2 CAP.
Friendly ships: one Casablanca and two Fletchers standing in for the mixed Taffy screen. Enemy
ships: Yamato, Mogami, one Kagero and one Shiratsuyu. Peak: five aircraft and seven ships.

**Declared compression.** The real Taffy 3 had six escort carriers, three destroyers and four
destroyer escorts; the game stages one carrier and two available destroyer models. The F4F-4 art is
a disclosed FM-2 stand-in. A2 does not assert that the player's specific TBM load or hit occurred.

### A3 — The Long Column

**Start and primary graph.** The player and one P-38 wingman begin west of the ridge after an
unsuccessful Ormoc shipping search. The column has six Type 97 tanks, eight Type 94 cargo trucks,
one Type 95 command car, two Type 38 75 mm field guns, and two roadside AAA emplacements. The badge
path is `contact -> stop/destroy at least ten of the fifteen powered vehicles, including two tanks
-> land at Tacloban`.

**Secondary.** Destroy the command car and both field guns. Stationary guns do not count toward the
ten powered vehicles.

**Declared compression.** The official history reports a ten-mile column of trucks, artillery and
tanks. The mission shows a representative nineteen gameplay entities rather than a literal ten-mile
traffic file.

### A4 — Dumbo in the Gulf

**Start and primary graph.** The PBY starts afloat at the lit San Pedro Bay anchorage. The badge
path is `water takeoff -> enter the 10-mile search area -> acquire survivor flare -> supported water
landing within 150 yd of the raft -> taxi within 100 ft -> remain below 2 kt for 20 s while three
survivors board -> return to the anchorage -> stop below 1 kt with engines idle for 10 s`.

**Secondary.** Recover one separated survivor marked by dye after the primary raft boards.

**Bounded population.** One PBY, one three-person raft group, one separated survivor, and one
63-foot rescue launch. After pickup, two Ki-43s may make one reconnaissance pass; they do not spawn
until the rescue state is secure. Peak air population is three.

**Score.** Full badge conditions pay the approved 2,500-point completion award to both ledgers.
No partial rescue award exists.

### A5 — Close the Ormoc Lifeline

**Start and primary graph.** The player and one F6F wingman start with four TBMs westbound toward
Ormoc. The badge path is `hold escort station -> at least three TBMs reach weapon release -> at
least three survive to the rally gate -> trap on Essex`.

**Secondary.** Destroy one escort after the TBM release event. Convoy destruction scores normally
but is not a substitute for bomber survival.

**Bounded population.** Friendly air: player, one F6F and four TBMs. Enemy air: four A6M2s and two
Ki-43s. Ships: Essex, three Type B Marus, one Kagero and one Shiratsuyu. Peak: 12 aircraft and six
ships.

**Declared compression.** The 11 November strike involved far more carrier aircraft and sank four
cargo ships plus most escorts. This six-versus-six package preserves the fast-carrier strike and
Ormoc-convoy premise without claiming a literal formation.

### A6 — Battle for the Airfields

**Primary graph.** `launch from Tacloban -> prevent effective release/drop by at least five of the
ten Ki-21/G4M/Ki-57 attackers -> keep at least two of Buri, Bayug and San Pablo above their
serviceability threshold through the relief timer -> destroy six Japanese lodgment vehicles or
supply groups -> land at serviceable allied Tacloban, Bayug, or Buri`.

**Secondary.** All three inland fields remain serviceable at debrief.

**Fixed airborne population.** Allied: player plus five P-38s (6). Japanese: four Ki-57s, four
Ki-43s, four A6M2s, three Ki-21s and three G4Ms (18). Total 24. The close set is the player, five P-38s,
four Ki-43s and four A6M2s (14); the ten bombers/transports remain in distant/route groups until a
slot opens.

**Fixed ship population.** One Essex, one Pennsylvania, one Cleveland, two Fletchers and five Type
B Marus: 10 ships. Their gunfire and AAA are active, but they cannot complete the player's inland
objective.

**Fixed ground population.** Allied: four M4s and six CCKWs. Japanese: four Type 97s and six Type
94 trucks. At most ten powered vehicles move at once. Twelve landed-squad proxies and twelve
functional site targets are batched/inactive except during their authored phase.

**State transition.** Historical American victory: all three inland fields remain American, the
Japanese lodgment fails, Tacloban/Dulag continue operating, and Tanauan construction continues.

### J1 — Defend the Fields

**Start and primary graph.** The player starts engine-running at Buri with one A6M2 wingman and two
Ki-43s arriving after takeoff. Five critical groups are tracked: fuel farm, radio station, north
hangar, south hangar, and parked-aircraft dispersal. The badge path is `takeoff -> keep at least
three groups intact through the strike -> land at Buri`; Bayug is legal only if mission damage makes
Buri's runway unserviceable.

**Secondary.** Save a damaged Ki-21 until it crosses the Buri threshold.

**Bounded population.** Four friendly fighters; four attacking F6Fs and two TBMs. Peak: 10
aircraft. Airfield AAA and parked aircraft are canonical-site actors, not additional active aircraft.

### J2 — Break the Landing

**Start and primary graph.** The player and two B5Ns begin southeast of Leyte Gulf. To keep this
entry-rank chapter from violating the Commander coordinated-operation gate, no friendly Val or Zero
formation accompanies the player. The badge path is `penetrate CAP -> destroy one Type B Maru or
reduce one Fletcher/Cleveland below half hull HP -> cross the western/southern egress gate`.

**Secondary.** Destroy two LCVPs.

**Bounded population.** Three B5Ns and three defending F6Fs. Shipping: four Type B Marus, two
Fletchers, one Cleveland, one Pennsylvania and four LCVPs. Peak: six aircraft, eight large ships and
four landing craft.

### J3 — Road to Burauen

**Start and primary graph.** The player and one Ki-43 wingman orbit a column of four Type 97 tanks,
eight Type 94 trucks and one Type 95 command car. Four P-38s attack in two two-aircraft waves. The
badge path is `defend route -> at least eight of thirteen vehicles, including two tanks, enter the
Buri dispersal zone -> land at Bayug`.

**Secondary.** The command car and all four tanks survive.

**Bounded population.** At most six airborne aircraft and thirteen powered ground vehicles, plus
two destination AAA emplacements.

### J4 — Destroyers in the Bay

**Start and primary graph.** The B5N begins west of Ormoc Bay as a timed illumination flare opens a
single attack window. The badge path is `set up outside the flare -> valid torpedo release -> cause
durability damage to either Fletcher -> keep the Type B Maru alive through the attack window ->
cross the western egress gate`.

**Secondary.** Sink the damaged Fletcher. A ditching near friendly ships reaches a normal debrief
but does not satisfy authored recovery and awards no badge.

**Bounded population.** One B5N, one A6M2 high cover and one Allied TBM flare-layer; one Kagero, one Shiratsuyu,
one Type B Maru and two Fletchers. Peak: three aircraft and five ships.

### J5 — Night Drop on Burauen

**Start and primary graph.** The player leads two Ki-57s from west of the ridge with one Ki-43 and
one A6M2 escort. The badge path is `hold the authored speed/altitude/heading corridor -> player and
at least one AI Ki-57 complete effective drops -> cross the western egress gate`.

**Secondary.** All three transports complete effective drops and at least four of six supply
bundles land inside the marked area.

**Bounded population.** Three Ki-57s, two Japanese escorts and four P-38s: nine aircraft. Each
effective transport releases six visible parachutist rigs, each representing a squad rather than an
individual historical head count, plus two supply bundles. Maximum descent set: 18 parachutist rigs
and six bundles.

**State transition.** A successful J5 creates the Japanese lodgment used by J6. It captures no
field by itself.

### J6 — Operation Te-Go

**Primary graph.** `escort at least one Ki-21/G4M bomber pair through release -> at least two Ki-57s
complete follow-on drops -> suppress the American P-38 response -> drive Buri and Bayug into the
Japanese-controlled state -> hold both through the reinforcement timer -> land at serviceable
Japanese Buri or Bayug`.

**Secondary.** San Pablo also remains Japanese-controlled and both Buri and Bayug stay serviceable.

**Fixed airborne population.** Japanese: player, three additional Ki-43s, four A6M2s, four Ki-21s,
four G4Ms and four Ki-57s (20). American: four P-38s. Total 24. The close set is the player, three
Ki-43s, four A6M2s and four P-38s (12); bombers and transports use route groups and timed approach
slots.

**Fixed ship population.** One Essex, one Pennsylvania, one Cleveland, two Fletchers and five Type
B Marus: 10 ships. They contribute AAA/naval fire but cannot retake a field without the authored
air/ground objective state.

**Fixed ground population.** Japanese: four Type 97s, six Type 94 trucks and two Type 95 command
cars. American: four M4s, six CCKWs and two Willys jeeps. At most ten powered vehicles move at once.
Twelve landed-squad proxies and twelve functional site targets are batched/inactive except during
their authored phase.

**State transition.** Alternate victory: Buri, Bayug and San Pablo become Japanese-controlled;
Tacloban and Dulag become unusable; the Ormoc route remains open. The epilogue must name successful
J5/J6 coordination as the divergence from the historical failure.

## 5. Canonical site-state lock

The same base/site identity and layout persists. A state changes ownership, readiness,
construction, damage, parked actors, lights, clutter density, and enabled defenses; it never moves
a surviving building to make a mission convenient.

| Site | 18–19 Oct | 20–24 Oct | Late Oct–Nov | 6–7 Dec historical | J6 alternate result |
| --- | --- | --- | --- | --- | --- |
| Tacloban | Japanese operational; J1-era target context | captured 20 Oct; emergency reconstruction | principal American operational field; coral/mat expansion, congestion and dispersals | American operational; A6 start and Japanese target | bomb-damaged and unusable, American withdrawal |
| Dulag | Japanese-held but rough/unserviceable | captured 21 Oct; still unserviceable | muddy construction/support field; limited later use | American support site and Japanese target | bomb-damaged and unusable |
| Buri | principal Japanese inland field | captured after inland fighting | dry-weather use, then construction abandoned 25 Nov | American-held, attacked and temporarily penetrated | Japanese-controlled and serviceable enough for recovery |
| Bayug | Japanese dry-weather strip | captured after inland fighting | limited American dry-weather use continues | American-held finale objective | Japanese-controlled and serviceable recovery field |
| San Pablo | overgrown, unused by Japanese | captured, still poor | construction attempted then abandoned 25 Nov | principal airborne drop/lodgment area | Japanese-controlled lodgment/field |
| Tanauan | no field | no field | site selected after Buri/San Pablo abandonment; work begins after 28 Nov | visibly under construction, not yet operational | interrupted construction site |
| San Pedro Bay | Japanese-controlled waters/shore | American anchorage forming | PBY anchorage, rescue launch and support activity | American support/transport area | abandoned/contested anchorage |
| Ormoc | Japanese port/logistics hub | Japanese reinforcement destination | repeated convoy destination; accumulated port damage | Japanese route under severe interdiction | Japanese-held, lifeline remains open |
| Landing beaches | Japanese shore defenses | active assault and unloading | dense American beachhead and supply dumps | established rear/support area | damaged, evacuating American beachhead |

The Buri, Bayug and San Pablo runway headings/lengths follow the official Army history where given:
San Pablo about 4,920 × 164 ft, Bayug about 5,000 ft, and Buri about 5,000 ft, with final headings and
terrain fit measured in F8. Tanauan is under construction during the campaign and does not become
operational before the 7 December endpoint; the official history dates operation to 16 December.

## 6. Opening and victory scene lock

All openings last 10–20 seconds, are skippable, and end at the exact frozen start state.

| Scene | Duration | Required actors and action |
| --- | ---: | --- |
| A1 opening | 18 s | landing craft and transports off the beaches; Essex CAP launch; inbound raid report; camera settles behind player on deck |
| A2 opening | 15 s | Casablanca group under shell splashes; destroyer turns into smoke; TBMs form up; player receives attack order |
| A3 opening | 12 s | P-38s cross ridge; empty Ormoc water below; dust/smoke reveals the road column; camera hands off airborne |
| A4 opening | 18 s | night anchorage lamps and mooring buoy; survivor report; rescue launch casts off; camera hands off to PBY afloat |
| A5 opening | 12 s | TBM formation over ridge; Ormoc convoy glimpsed ahead; enemy contact call; player receives escort station |
| A6 opening | 20 s | dawn Tacloban readiness; radar/spotter alarm; first Japanese wave crosses western hills; player takes runway control |
| J1 opening | 18 s | pre-invasion Japanese Buri; parked aircraft and fuel/radio assets; strike warning; player receives scramble order |
| J2 opening | 12 s | Japanese formation reaches gulf haze; invasion shipping and LCVPs appear; CAP turns toward player |
| J3 opening | 12 s | road column moving toward Burauen; P-38 report from ridge; player orbit hands off |
| J4 opening | 15 s | dark Ormoc Bay; destroyer gun flashes and burning ship; illumination flare ignites; player attack line appears |
| J5 opening | 18 s | Ki-57 formation over dark ridge; signal fires and field lights reveal drop corridor; P-38 contact call |
| J6 opening | 20 s | dawn over surviving J5 lodgment; bombers/transports form; American fields and response launch appear; player gets escort choice |
| A6 victory | 45–60 s | bank first; returning aircraft, repair crews, unloading ships, held fields and fleet; historical consolidation epilogue |
| J6 victory | 45–60 s | bank first; player lands at captured field, Japanese consolidation, damaged Tacloban and withdrawing ships; explicit alternate-history epilogue |

Camera splines, subtitle wording, and exact radio lines belong to F9, but F9 may not add an actor
or reusable model absent from sections 7–8 without reopening F3.

## 7. Existing reusable content

The campaign reuses the complete shipped aircraft, ship, ordnance, building, and four-vehicle
catalog where named above. Particularly important reuse includes all current combat aircraft except
Ki-57; Essex/Casablanca, Pennsylvania, Cleveland, Fletcher, Kagero, Shiratsuyu, Yamato, Mogami and
Type B Maru; M4, Type 97, Willys and Type 95 Kurogane; and all ten building types (`hangar`,
`tower`, `aaa`, `ammunition-bunker`, `barracks-and-huts`, `coastal-gun-battery`, `fuel-tank-farm`,
`pier-and-warehouses`, `radio-radar-station`, `revetment`).

Aircraft parked at a site use the existing airframe asset in a static/inactive state. Ground flags
reuse the existing ensign material/cloth path. Fuel and ammunition areas use the existing target
buildings surrounded by F8 clutter; they do not require a second destructible building model.

## 8. Frozen F4 individual-asset inventory

Exactly these **17** new reusable models enter F4. Each gets provenance, limits, a Library entry,
budget enrollment, a Hangar or suitable Library turntable, and attended approval. `Bench` names the
minimum articulation exposed for review.

| Group | Asset id / modeled identity | Consumers | Bench |
| --- | --- | --- | --- |
| Airborne | `ki-57-ii-topsy` — Mitsubishi Ki-57-II Type 100 transport | J5, J6, A6 enemy transport wave | propellers, gear, doors/drop exit, control surfaces |
| Airborne | `parachuting-person-rig` — shared canopy, harness and suspended person | bailout, downed AI when enabled, J5/J6 paratroopers | canopy open/closed, suspension pose |
| Airborne | `paratrooper-supply-bundle` — bundled drop load with separate small canopy | J5/J6 | canopy open/closed |
| Airborne | `m24-aircraft-parachute-flare` — U.S. M24 illumination flare assembly | J4 Allied flare-layer and later night authoring | canopy deployed, lamp burning marker |
| Ground | `type94-cargo-truck` — Imperial Japanese Army Type 94 six-wheel truck | A3, J3, J6, Ormoc | wheel roll, front-wheel steer |
| Ground | `type38-75mm-field-gun` — Japanese Type 38 75 mm field gun | A3 column, Ormoc and finale scenery | traverse/elevation |
| Ground | `gmc-cckw-353` — U.S. 2½-ton 6×6 cargo truck | A6/J6, beaches, bases, Tanauan | wheel roll, front-wheel steer |
| Ground | `caterpillar-d7-3t` — wartime U.S. military bulldozer | Tacloban/Dulag/Tanauan construction and A6 victory | tracks, blade raise/tilt |
| Maritime | `lcvp` — Higgins landing craft, vehicle/personnel | A1, J2, beachhead | bow ramp |
| Maritime | `usaaf-63ft-rescue-boat` — 63-foot aircraft rescue boat/launch | A4, San Pedro Bay | propellers/rudders or display-only helm pose |
| Maritime | `type-a3-life-raft-survivors` — raft with removable three-person survivor group | A4 and bailout rescue | survivor group present/removed |
| Maritime | `pby-mooring-buoy` — Catalina mooring buoy and pickup ring | A4, San Pedro anchorage | no articulation |
| Night/site | `m1942-60in-searchlight` — mobile 60-inch antiaircraft searchlight emplacement | J5/J6 fields, night bases | train/elevate, beam marker |
| Night/site | `portable-runway-flare-pot` — reusable temporary runway/anchorage lamp | A4/J5/J6 and F6 test range | lit/unlit state |
| Night/site | `panirugan-red-harbor-light` — prewar fixed red Tacloban harbor fixture | early invasion/site states | lit/unlit state |
| Night/site | `ranger-temporary-nav-light` — temporary steady-white Dinagat/Homonhon mast light | A1 opening/world state | lit/unlit state |
| Night/site | `suluan-damaged-lighthouse` — bomb-damaged, non-operating lighthouse | invasion approach/world state | fixed damaged state |

The Ormoc customs-building red light is excluded. The located historical notice proves a fixture
existed when published but not that it survived or operated in 1944. F8 may model the customs
building with no light only if other site needs justify it; a lit or modeled beacon requires new
evidence and an F3 amendment.

### F4 parallel worktree grouping

The four groups above are intentionally non-overlapping and may run in four worktrees after this
lock is approved:

1. `f4-airborne-assets` — four airborne/drop assets.
2. `f4-ground-assets` — four road/construction assets.
3. `f4-maritime-assets` — four rescue/landing assets.
4. `f4-night-site-assets` — five night/navigation assets.

Each branch owns its model scripts, generated GLBs, Library entries, provenance rows, focused tests,
captures, handoff, and attended checkpoint. Shared catalog/test edits are rebased and reconciled in
that order before the hard gate closes. No group waits for another group's Blender rendering.

## 9. Explicitly not individual F4 assets

These are procedural, instanced, decal/effect, or layout work and receive scene checkpoints in F6,
F7, or F8 instead of artificial Hangar cards:

- pierced-steel-plank/Marston-mat strips, coral/gravel runway layers, aprons and taxiways;
- drainage ditches, culverts, standing water, mud, tire ruts and rough access roads;
- tents, sandbags, blast walls, foxholes, fuel drums, crates, bomb carts, maintenance stands,
  canvas stores, supply piles and repeated debris;
- runway craters, repair patches, burned pads, scorch/damage decals and building-damage states;
- parked-aircraft arrangements, dispersal spacing, national identification panels and windsocks;
- road dust, rescue dye, flare glow/smoke, searchlight beams, fires, local light volumes and tracer
  illumination;
- ground-crew crowds, paratrooper squad abstraction after touchdown, and repeated inactive figures;
- whole airfield, port, anchorage, beachhead, convoy, road-column and victory-scene layouts;
- aircraft navigation/landing-light emitters. F6 adds source-backed fixture points to existing
  airframes; these are airframe modifications, not reusable standalone models. If F6 discovers that
  a unique modeled housing is necessary, F3 must be reopened before Blender work.

No separate seaplane tender, maintenance barge, PT boat, tanker truck, road roller, tractor, or
coastal patrol boat is selected for the initial campaigns. Existing piers, ships, trucks and
procedural clutter cover their nonessential scene roles. This exclusion prevents brainstorm options
from silently entering F4.

## 10. Source ledger and limits

All sources were read or rechecked 2026-10-14. URLs point to the official publication or a stable
HyperWar transcription of an official U.S. wartime/postwar record.

| Claim locked | Source | What it supports / limit |
| --- | --- | --- |
| 20 Oct landings, landing geography and A-day weather | U.S. Army, *Leyte: The Return to the Philippines*, ch. V; U.S. Navy aerology report, *The Assault Landings on Leyte Island* | Landing date and beach sectors; cloudy/partly-cloudy A-day conditions. A1's exact raid is a disclosed composite. |
| Air-sea rescue organization and PBY/tender availability | Task Force 77 Operation Plan 13-44, Annex G | Coordinated rescue of downed aviators and PBY/seaplane-tender use when practical. It does not identify A4's invented crew or night. |
| PBY operations in Leyte Gulf | NHHC, *Dictionary of American Naval Aviation Squadrons*, vol. 2, VPB-33 entry | PBY operations with tender support in Leyte Gulf and rescue/evacuation mission context. |
| Battle off Samar and Taffy 3 composition | DANFS USS *Kalinin Bay*, USS *Hoel*, and NHHC Battle off Samar material | Six CVEs, three destroyers, four destroyer escorts; aircraft attacked with bombs/torpedoes and diverted to Tacloban. A2's one-CVE/two-DD roster is a game compression. |
| 3 Nov P-38 road-column attack | U.S. Army, *Leyte*, ch. VI; Army Air Forces, *The Pacific: Guadalcanal to Saipan*, ch. XII | Fifteen P-38s found a roughly ten-mile Ormoc–Valencia column of trucks, artillery and tanks after a shipping search. Exact gameplay vehicle types/counts are representative. |
| 11 Nov Ormoc convoy strike | CNO, *U.S. Navy at War*, second report; Official U.S. Navy Chronology, 11 Nov; AAF history ch. XII | Fast-carrier aircraft destroyed four transports and most escorts. A5's F6F/TBM package and counts are a composite. |
| 3 Dec Ormoc Bay destroyer action | Official U.S. Navy Chronology; CNO wartime report | American and Japanese destroyers fought at night and USS *Cooper* was lost. J4's Kate intervention is invented. |
| Burauen airfields, dimensions and pre-invasion state | U.S. Army, *Leyte*, ch. VIII | San Pablo, Bayug and Buri locations and approximate runway dimensions; San Pablo overgrown/unoccupied. |
| Mud, field abandonment and Tanauan replacement | U.S. Army, *Leyte*, chs. XI and XVIII; USMC, *Marine Aviation in the Philippines* | Tacloban/Dulag construction problems; Buri/San Pablo abandonment; continued Bayug work; Tanauan work after 28 Nov and operation on 16 Dec. |
| Operation Te-Go, aircraft allocation and paratroop effects | U.S. Army, *Leyte*, ch. XVII | 51 assigned aircraft; 39 transports observed; transport allocations and 15–20 men each; Buri/San Pablo attacks and damage. It does not identify every transport as Ki-57, so J5/J6 call the Ki-57 representative. |
| 7 Dec air battle | USSBS, *The Fifth Air Force in the War Against Japan* | 56 enemy aircraft credited destroyed in the last important Leyte air engagement. A6/J6 compress air and ground action across 6–7 Dec. |
| Illumination-flare attack and M24 model | U.S. Navy wartime anti-submarine/convoy escort manual; War Department TM 9-981 | Delayed parachute-flare attack procedure and the M24's form, dimensions and operating envelope. J4's Allied TBM flare-layer is authored. |
| Tacloban, Dinagat/Homonhon and Suluan lights | prewar U.S. Coast Pilot; U.S. Army *Leyte* | Tacloban red harbor light; temporary Ranger lights; damaged Suluan lighthouse. Mission-controlled illumination remains a gameplay/state decision. |
| 1944 marine-light cross-check | Fifth Air Force navigation chart held by Australian War Memorial | Placement cross-check only; does not prove wartime operation of every charted light. |

Primary URLs:

- <https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-5.html>
- <https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-6.html>
- <https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-8.html>
- <https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-11.html>
- <https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-17.html>
- <https://www.ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-18.html>
- <https://www.ibiblio.org/hyperwar/USN/rep/Leyte/OpPlan/13-44-G.html>
- <https://www.ibiblio.org/hyperwar/USN/rep/NAVAER/Leyte/index.html>
- <https://www.ibiblio.org/hyperwar/USN/USNatWar/USN-King-2.html>
- <https://www.ibiblio.org/hyperwar/USN/USN-Chron/USN-Chron-1944.html>
- <https://www.ibiblio.org/hyperwar/USMC/USMC-M-AvPhil/USMC-M-AvPhil-2.html>
- <https://www.history.navy.mil/content/dam/nhhc/research/histories/naval-aviation/dictionary-of-american-naval-aviation-squadrons-volume-2/pdfs/chap4-3.pdf>
- <https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-038/h-038-2.html>
- <https://www.ibiblio.org/hyperwar/USN/ships/dafs/CVE/cve68.html>
- <https://www.ibiblio.org/hyperwar/USN/ships/dafs/DD/dd533.html>
- <https://www.ibiblio.org/hyperwar/AAF/V/AAF-V-12.html>
- <https://www.ibiblio.org/hyperwar/NHC/NewPDFs/USAAF/United%20States%20Strategic%20Bombing%20Survey/USSBS%20Fifth%20Air%20Force%20in%20the%20War%20Against%20Japan.pdf>
- <https://www.ibiblio.org/hyperwar/USN/ref/ASW-Convoy/ASW-Convoy-2.html>
- <https://radionerds.com/images/0/08/TM_9-981.pdf>
- <https://upload.wikimedia.org/wikipedia/commons/3/39/United_States_coast_pilot%2C_Philippine_Islands_%28IA_cu31924007510633%29.pdf>
- <https://www.awm.gov.au/collection/LIB100022056>

### Source claims deliberately not made

- The exact A1, A4, J1, J2, J3 or J4 engagement did not occur as authored.
- The A2 F4F-4 is not labeled an FM-2, and Fletchers are not labeled destroyer escorts.
- Ki-57 is representative of the Operation Te-Go transport force unless a unit-level source proves
  a specific allocation.
- No exact 1944 Ormoc beacon state is claimed.
- Gameplay vehicle variants and field-gun mix are representative until F4 records model-specific
  provenance; mission history claims only trucks, cars, artillery and tanks.
- The J6 outcome is alternate history from the successful J5/J6 coordination point onward.

## 11. Dependency-checked plan count

The previous 10–16 estimate is replaced by **22 execution plans including F3**:

| Plan(s) | Work | Dependency |
| --- | --- | --- |
| 1 | F3 definition/source lock (this plan) | none |
| 2–5 | F4 airborne, ground, maritime, and night/site asset groups | F3 approved; four worktrees parallel |
| 6 | N2 Dev Flight Recorder | all F4 assets approved |
| 7–8 | F5A campaign data/persistence/scoring; F5B headquarters/roster/progression UI | F4 gate; may overlap behind frozen contracts |
| 9–10 | F6A night renderer/lights; F6B visibility, AI perception and rank-gated sights | F4 gate; F6B follows F6A's light contract |
| 11–12 | F7A bailout/rescue; F7B POW/paratroopers/campaign integration | F4 gate; F7B follows F7A rig/state contract |
| 13–15 | F8A east-coast fields; F8B Burauen fields; F8C Ormoc/beachhead/anchorage plus state integration | F4 and F5 state schema; three layout worktrees with shared-state reconciliation |
| 16 | F9 scene framework, twelve openings and two victories | F5 persistence and F8 canonical layouts |
| 17–21 | F10A A1–A3; F10B A4–A5; F10C J1–J3; F10D J4–J5; F10E A6/J6 finales | N2 and every consumed F5–F9 contract; day batches may overlap, finales last |
| 22 | F11 campaign validation and release reconciliation | all prior plans |

Critical path: `F3 -> F4 hard gate -> F5/F6/F7 -> F8 -> F9 -> F10E -> F11`. N2 runs after F4
and must finish before any F10 batch. Four F4 worktrees and, later, the independent F5/F6/F7
foundations provide the safe parallelism; mission work does not start early to hide unfinished
contracts.

## 12. Review decisions required

Approval of this lock confirms all of the following at once:

1. the exact mission dates, ranks, objective/recovery graphs and bounded populations;
2. the canonical site sequence and the J6 divergence;
3. the 17-item F4 inventory and the explicit exclusions;
4. four parallel F4 asset worktrees with attended per-asset Hangar approval;
5. the 22-plan dependency count.

Any requested change is made here before F4 branches are cut. Later discovery of a genuinely new
reusable asset reopens F3 and pauses the dependent F4/F8/F10 work; scene dressing and procedural
treatments already classified in section 9 do not.
