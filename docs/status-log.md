# Status log (historical)

Moved out of the README on 2026-09-29. This is a per-plan ledger of what
landed and when, kept verbatim as history. It is **not** kept current:
[master spec §15](superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps)
is the only authoritative status table, and each entry's handoff holds the
measurements. Links were rewritten to resolve from `docs/`.

## Plans and passes, newest content last as written

**Plans 1–5 implemented (2026-09-15; ocean branch).** A deterministic F6F Hellcat flight
model runs headlessly in Node under `src/sim/`, graded against cited
historical trial figures by the test-card harness in `tools/testcards/`, with
a golden-trajectory regression, a randomised soak, and CI (Plan 1). It is
flyable in the browser on a WebGPU renderer, with keyboard controls, a chase
and cockpit camera and a gauge panel (Plan 2). Three input assists — stall
limiter, auto-rudder and altitude hold — sit between the keyboard and the
simulation, each switchable in flight (Plan 3). And the water it flies over is
no longer empty: real Leyte Gulf is under it (Plan 4, below).

The sea now has deterministic, Beaufort-driven FFT waves, depth colour,
shallow-water attenuation and foam (Plan 5). See the
[ocean handoff](handoff/2026-09-15-plan5-ocean.md) for GPU measurements,
visual comparisons and the remaining art-direction questions.

Ground and water contact now ends the flight (Plan 10, below). And the
airplane now starts **parked on a runway at Tacloban and takes off from it**
(Plan 11a): the ground is a surface it rolls on rather than one it falls
through. Gear that takes seconds to move and costs drag while it hangs out,
rolling friction and wheel brakes (`B`), a tailwheel that steers until the tail
comes up, and a visual strip draped over the real heightfield — running
north-south, because east-west through the airfield runs into the sea. The
graded historical take-off card measures that real ground now instead of a
pinned state, inside a tolerance tightened from 10% to 2%; read the
[handoff](handoff/2026-09-16-plan11a-ground-handling.md) before trusting
that agreement, because it records exactly which of its inputs are guesses.
**And it lands again (Plan 11b).** Flaps, ground effect, and a lateral tire
force so the wheels go where they point rather than skidding — a taxi turn used
to reach 113.6° of sideslip and now reaches 2.7°. The flap lift increment is
*derived* from two figures in the same trial table rather than estimated, and
it is graded against the 84.5 mph landing-configuration stall that
`f6f-hellcat.json` carried for two plans flagged as unreachable. A scripted
approach autopilot (`tools/autopilot/approach.ts`) flies an approach into
Tacloban every commit and asserts the airplane comes to rest on the strip, so
the landing envelope is a number in CI rather than an impression: touchdown at
1.47 m/s and 38.4 m/s, 0.0 m off the centreline. Read the
[handoff](handoff/2026-09-17-plan11b-landing.md) for every figure that is
still an estimate.

A first scenery pass now adds procedural beach, grass, jungle and rock
materials, mapped Binahaan and Daguitan river surfaces, nearby trees, and
Tacloban hangars, control tower, service apron and stores. These buildings
and trees are visual only; collision, combat, AI and the meta-game remain ahead. See the
[scenery handoff](handoff/2026-09-18-scenery.md) for coverage and limitations.

**Plan 12 is now complete:** the scenario holds one carrier and two escorts
in San Pedro Bay, Tacloban and Dulag as airfield records, and a second,
chocked Hellcat on the Tacloban apron. The renderer draws every one of those
entities and the simulation advances them on one clock. The authoritative
status and remaining order are in [master spec §15](superpowers/specs/2026-09-12-ww2airsim-design.md).
Mark reordered them on 2026-09-16 so that the ground under the airplane comes
before there is anybody to shoot at; plan numbers were deliberately NOT
reused, for the reason the next paragraph records. **Master spec §15 holds the
order and the argument for it**, and this paragraph does not restate either.

**T1 gave the aircraft believable ground handling (2026-09-28):** the rest
attitude is derived from a gear layout in each spec, the tail rises with
airflow instead of a speed gate, and the taxi has rudder with prop wash, a
and a locking caster. The ground pitch ceiling comes from each
aircraft's lift curve (liftoff near 1.1 x clean stall speed); the GAMEPLAY.md
"Takeoff" section has the measured speeds. On the wheels the arrow keys and A/D
(roll in the air) **steer**, and Z/X (rudder) steer too; roll never banks the
airplane on the wheels. There are no differential brakes (Mark's ruling,
2026-09-28). It is on
branch `worktree-t1-tailwheel`; the [handoff](handoff/2026-09-28-t1-ground-handling.md)
lists what was measured and what is open, [aircraft.md](aircraft.md) has
the onboarding step, and master spec §15 holds the status.

**G4M Betty rebuilt 2026-09-29, and merged into local `main`:** the
Betty is now an original Blender model with round hull sections and retractable
main gear, replacing the CC-BY download and its credit. The
[handoff](handoff/2026-09-29-g4m-betty.md) records what was measured and
what is open; master spec §15 holds the status.

**Plan 6 combat and damage is complete for the current F6F:** the playable
gunnery slice landed 2026-09-19. Space
fires the Hellcat's six guns with real flight time and finite ammunition,
rounds hit other airplanes' hit zones and damage their structure and systems,
and `?scenario=gunnery-range` parks two training targets downrange at
Tacloban. Tracers, hit flashes, engine smoke, a combat readout and gun audio
read that state. The
[handoff](handoff/2026-09-19-plan6-gunnery.md) records what was measured
and master spec §15 holds the status.

**W1 gave the Wildcat a real F4F-4 flight model (2026-09-28):** sourced
figures, a drawing at its real span and parked angle, a racks-only loadout, and
one graded card suite for every aircraft. It is on branch `worktree-w1-wildcat`;
[aircraft.md](aircraft.md) is the onboarding runbook and master spec §15
holds the status.

**Plan 6b's strike slice landed 2026-09-22:** bombs, rockets, a title-screen
loadout picker, stores hung under the wings, ship and airfield-structure
damage. Tier 1 is green and reference-GPU Tier 2 acceptance passes all five
strike cases at 1.758 ms p95 at 1440p. Torpedoes and structural-overload
damage were the remaining Plan 6 items at that handoff; see the
[handoff](handoff/2026-09-22-plan6b-strike.md) for what was actually
measured and what is still open, and master spec §15 for the status.

**E1 effects engine is complete and merged into `main` (2026-09-26):**
every armed detonation is reported through a bounded, bit-identical
simulation ring, and one lit, soft, pooled particle system now owns bomb,
rocket, shell, crash, aircraft, ship, and structure effects. Dense smoke stops
the cloud march; quality tiers, failed-sheet fallback, restart cleanup, and
paired reference-GPU cost gates are covered. The shipped flipbooks are
code-generated placeholders for E2, not final art. See the
[E1 handoff](handoff/2026-09-26-e1-effects-engine.md) for captures,
measurements, merge notes, and the two shared baseline tripwires.

**O1 ordnance models landed 2026-09-26, merged into `main`:** generated
AN-M65 and HVAR models hang on the Wildcat and fly. The
[handoff](handoff/2026-09-26-o1-ordnance-models.md) records what was
measured and what is open; master spec §15 holds the status.

**R1 roster pipeline landed 2026-09-26, merged into `main`:** an
original Blender model now ships through `npm run models:build`, and the
Hangar draws any Library entry's own model, in the game or not. The first
is the barrel-roof hangar. The
[handoff](handoff/2026-09-26-r1-roster-pipeline.md) records what was
measured; master spec §15 holds the status.

**R2 ship roster landed 2026-09-26, merged into `main`:** every ship in the Library now has a fitted model and a
sourced `ShipSpec`. That is four licensed models and three original Blender
models; none is placed in a scenario yet. The
[handoff](handoff/2026-09-26-r2-ship-models.md) records what was
measured and what is open; master spec §15 holds the status.

**R3 aircraft roster complete 2026-09-27, merged into `main` the same day:**
every aircraft in the Library now draws its own model, rigged through one
generic module: seven licensed downloads and four original Blender models
(the P-38 fell back to Blender). The Zero flies its own model; no scenario
changed. The [handoff](handoff/2026-09-27-r3-aircraft-models.md) records
what was measured and what is open; master spec §15 holds the status.

**R4 and R5 landed 2026-09-28, merged into `main` the same day:** every
Library building and vehicle now has a model in the Hangar, and nothing in
the Library is left undrawn; the airfields in the game keep their procedural
boxes. The [handoff](handoff/2026-09-28-r4-r5-roster.md) records what was
measured; master spec §15 holds the status.

**Model detail pass DP0 landed 2026-09-28:** Blender
models can now carry a baked skin (paint, markings, panel lines and scan
detail), and the Ki-84 and the hangar are the first two to have one. The
[handoff](handoff/2026-09-28-dp0-skin-pipeline.md) records what was
measured; master spec §15 holds the status.

**Model detail pass DP2 landed 2026-09-28 and is merged into local `main`:** every
ship is now skinned, the three Blender ships detailed to the downloads' level,
and the four print-model downloads box-projected. The
[handoff](handoff/2026-09-28-dp2-ships.md) records what was measured;
master spec §15 holds the status.

**Model detail pass DP3 landed 2026-09-29 and merged into `main`:**
the nine flat-shaded buildings are rebuilt with richer geometry
and baked skins, and the flat-shaded allowlist is deleted. The
[handoff](handoff/2026-09-29-dp3-buildings.md) records what was measured;
master spec §15 holds the status.

**Model detail pass DP1 landed 2026-09-29 and is merged into local `main`:** the
Ki-21, P-38 and B-29 are rebuilt to the Ki-84's level of geometry and carry
baked skins. The [handoff](handoff/2026-09-28-dp1-aircraft.md) records what
was measured; master spec §15 holds the status.

**Plan 6c structural overload landed 2026-09-23:** the fixed-step simulation
derives proper load from consecutive aircraft states and airspeed from the wind
frame. Exceeding the F6F content limits continuously damages structure, with
`OVER-G` and `OVERSPEED` warnings, current and peak DEV diagnostics, and a
destruction debrief that reaches Restart. Tier 1 is green and the reference-GPU
flight measured 10.82 g, 220.19 m/s, and a 1.301 ms render-pass p95 at 1440p
with zero validation errors. Torpedoes are deferred until a second,
historically appropriate airframe exists; they do not block Plan 7 AI. See the
[handoff](handoff/2026-09-23-plan6c-structural-overload.md).

**Plan 7a AI landed 2026-09-23**, corrected the same day after its own
whole-branch review: a pure proportional-derivative flight controller turns a
desired world velocity into the same `Controls` a human pilot supplies, and a
pursuit pilot predicts a bounded lead intercept and fires only within a
short-range gun cone. Every assigned pilot's controls are derived from one
start-of-tick snapshot before any aircraft steps, so controller cadence is
the fixed 60 Hz tick and reversing the aircraft array cannot change a
trajectory. The review found the gun gate and the steering disagreed on where
the nose was aimed — 1,002 rounds fired over 90 s, zero hits — and a
dead-astern target could silently command nothing; both are fixed and
covered by a new hits-not-just-shots test at both tiers.
`?scenario=pursuit-range` starts the player and one AI-flown F6F airborne
astern; on the reference GPU it turns onto a gun solution and lands a hit
within 24.3 s, at 0.860 ms render-pass p95 with zero validation errors. The
rest of the maneuver library, formation and landing AI remain Plan 7c. See
the [handoff](handoff/2026-09-23-plan7a-ai-pursuit.md).

**Plan 7b energy-aware maneuvering landed 2026-09-23.** An AI pilot now
chooses between three maneuvers — Pursue, Extend, Break — rescored on a
per-skill cadence (`PilotSkill`: reaction delay, gunnery accuracy, energy
discipline), instead of flying one script forever. A
`MIN_ENGAGEMENT_RANGE_M` (120 m) override forces a break-off before
point-blank range, closing the pass-through gap 7a's own review had
declined to fix. On the reference GPU, `pursuer-1` (now `VETERAN_SKILL`)
closes under 120 m, never comes closer than 50 m, and opens range
afterward, at 0.861 ms render-pass p95 with zero validation errors. See the
[handoff](handoff/2026-09-23-plan7b-combat-depth.md) for the three
formula bugs the overnight run found and fixed along the way.

**Plan 7d AI pursuit difficulty landed 2026-09-24.** A `green`-skill pursuer
now steers against a stale snapshot of the target captured at its last
rescore rather than live ground truth, and applies deterministic,
skill-scaled jitter (`controlNoise`) to its final roll/pitch/yaw — closing
the gap Mark's own play found: "I can't ever get behind that pilot," true
even at the easiest preset. A scripted hard-break-and-reversal now genuinely
gets behind `pursuer-1` at `green` skill within a bounded window on the
reference GPU (23.6 s, gpu p95 1.616 ms, player confirmed alive when it
happens — not a frozen corpse's stale geometry). The final review found the
acceptance spec's own geometry helper had been exactly inverted (it passed
when the pursuer had the player in its own gun cone) and fixed it with a new
Tier 1 unit suite deriving the bearing convention from the app's actual
heading construction rather than hand-picking it. Re-running Tier 2 broadly
also surfaced that `ai-maneuver.spec.ts`'s point-blank break-off gate is now
red — the veteran pursuer kills a passive player before that range is
reached — left as an open gameplay-balance decision rather than forced
green. See the
[handoff](handoff/2026-09-24-plan7d-ai-pursuit-difficulty.md) for both.

**Plan 7c AI safety envelope and maneuver library is complete and merged to `main` (2026-09-26).** Its two merge blockers and the low-target finding were resolved by Mark's decisions of 2026-09-26. AI pilots can no longer overload their own airframe, fly into the sea or over-speed, and an AI Zero no longer cuts its own engine under negative g. A pursuing AI chases a low target down to 50 ft above the ground, and no lower. After a missed head-on pass the pursuer now turns back and fights again, where before it flew away for good. Veterans fly the named maneuvers (yo-yos, lag pursuit, attack run, scissors, split-S, Immelmann; an AI Zero flies no Immelmann), and greens fly only 7b's basic set, so they are easy to beat. The veteran was toned down per Mark's ruling. See the [handoff](handoff/2026-09-26-ai-7c.md); master spec §15 holds the status.

**Plan 7e sides and many-vs-many is complete on branch `worktree-ai-7e` (2026-09-26), not yet merged.** Every aircraft now has a side, allied or axis. By default the player is allied and everyone else axis, so existing scenarios are unchanged. An AI with no fixed target picks one from the other side and switches the moment it dies. It holds fire while a friendly is in the way, and teamkills never score. A new ingress pilot flies a raider's route and fights only what attacks it, for the Combat Air Patrol mission. `furball-range` ("Furball (dev)") puts the player and a wingman against four AI. One open item: AIs rarely hit each other until the AI gunnery-honesty slice lands. See the [handoff](handoff/2026-09-26-plan7e-sides.md); master spec §15 holds the status.

**Plan 7f formation, wingmen and escort is complete on branch `worktree-ai-7f-formation` (2026-09-27), not yet merged.** A wingman holds a finger-four station off a leader through one station-keeping law, splits to cover the leader when a hostile threatens it or the leader is firing, and comes back to station once the threat clears. A wingman whose leader is lost takes on the leader's own route; a wingman whose leader is parked loiters until it actually leaves the ground. `furball-range`'s `ally-1` now flies as the player's wingman. Tier 1 only; Tier 2 waits on the sortie forms landing on `main`. See the [handoff](handoff/2026-09-27-plan7f-formation.md); master spec §15 holds the status and open items.

**Plan 7g landing AI is complete on branch `worktree-ai-7g-landing` (2026-09-28), not yet merged.** An AI with a `home` (a runway airfield or a carrier) goes home when it is out of ammunition, damaged, low on fuel or idle, flies an approach under the LSO's rules, goes around when it must, lands, and is respotted on a park spot. `recovery-range` (a dev scenario on the title screen) shows it. See the [handoff](handoff/2026-09-28-plan7g-landing.md); master spec §15 holds the status and open items.

**Plan 7h AI takeoff is complete on branch `worktree-ai-7h-takeoff` (2026-09-28), not yet merged.** A parked AI with `pilot.takeoff` rolls, lifts off and hands off to the ordinary AI; Airfield Strike's defenders now scramble off Dulag's runway. `takeoff-range` (a dev scenario on the title screen) shows it. See the [handoff](handoff/2026-09-28-plan7h-takeoff.md); master spec §15 holds the status and open items.

**Friendly fire and dishonorable discharge are complete and merged to `main` (2026-09-26).** Ships and airfield structures now have a side too. Damage to your own side scores nothing, and any of it forfeits everything since the last landing. A pilot who survives the sortie gets DISHONORABLE DISCHARGE, and the roster marks him DISCHARGED until he is resurrected; one who dies is K.I.A., since the dead cannot be discharged. The first friendly hit plays a radio call on the radio line, and the combat readout keeps a FRIENDLY FIRE tag. `friendly-fire-range` ("Friendly Fire (dev)") is the test bed. See the [handoff](handoff/2026-09-26-friendly-fire.md); master spec §15 holds the status.

**The A6M Zero flies, headless (Z2, 2026-09-25):**
`content/aircraft/a6m2-zero.json` is graded against the 1942 Navy trial of a
captured A6M2. Its controls stiffen above 250 mph, its engine cuts out under
negative g, and it carries two 7.7 mm guns and two 20 mm cannon with their own
ballistics. It appears in no shipped scenario yet. See the
[handoff](handoff/2026-09-25-z2-zero-flight-model.md); master spec §15
holds the status.

**Missions have an engine, headless (M1, 2026-09-25):** a scenario that
declares objectives now runs them in the sim every tick. There are seven
objective kinds, triggers that fire once, and held groups that enter
mid-flight, and only a landing at a named base earns a badge. No shipped
scenario uses it until M3, and nothing shows it until M2. See the
[handoff](handoff/2026-09-25-m1-mission-engine.md); master spec §15
holds the status.

**Missions have a UI (M2, 2026-09-27), on branch `worktree-missions-track`, not yet merged:** mission scenarios get a briefing on the orders memo, an objective line and a radio line in flight, objectives on the navigation chart, and an objectives block with a badge verdict in the debrief; a successful landing records the badge on the pilot. No shipped scenario is a mission until M3. See the [handoff](handoff/2026-09-27-m2-mission-ui.md); master spec §15 holds the status.

**Three missions shipped (M3, 2026-09-27), on the same branch, not yet merged:** Deck Quals ("Carrier Qualification"), Airfield Strike and Convoy Strike each declare real objectives, carry a badge, a briefing and a cited, verified history. The verdict path is proven headless, with staged approaches and injected hits; the intermediate trap and respot are not exercised in the browser (Tier 2 checks the briefing, objective line, radio, chart and debrief). See the [handoff](handoff/2026-09-27-m3-missions.md); master spec §15 holds the status.

**Combat Air Patrol completes the missions sub-track (M4, 2026-09-27), on the same branch, not yet merged:** hold station over the Essex, turn back two inbound Zero waves before they reach the carrier, then recover aboard. Headless tests cover success, breach, accumulated station time and ditching; two reference-GPU runs cover the briefing, live counter, radio, held spawn, chart and debrief. See the [handoff](handoff/2026-09-27-m4-combat-air-patrol.md); master spec §15 holds the status and open items.

**Plan 17 radar landed 2026-09-23.** The cockpit panel's reserved `radar`
slot now shows a rotating, heading-up sweep with fading contact dots and a
`Tab`-cycled 15/5/1 mi range — motivated directly by Mark's own
`pursuit-range` playtest, where he evaded the AI contact and had no way to
find it again. Tier 1 is green and the reference-GPU spec passed 5
consecutive runs against the real RX 6700 XT, gpu p95 0.82-1.13 ms (budget
6.0 ms) with zero validation errors. Task review caught and fixed two real
defects along the way — a doubled render-target uv-flip in the diagnostic
readback, and a nearly-unfalsifiable brightness assertion — both covered in
the [handoff](handoff/2026-09-23-plan17-radar.md), which also has the
measured figures and the deferred list.

**A title screen landed 2026-09-19**, the first slice of Plan 9: Mark's title
art with **New game** and **About project**. The world boots behind it and is
held until New game (Enter also works), which is the click that unlocks audio
on a first visit. [Handoff](handoff/2026-09-19-title-screen.md).

**The title screen is four sequential memo forms (sortie forms, 2026-09-27)**,
in the Naval Communications style: Squadron Roster, Sortie Orders (the
mission), Aircraft Assignment and Ordnance Requisition, with **Launch** on the
last and Back on each. The player is drawn as the aircraft chosen. A **Dev**
checkbox on the roster lifts every eligibility rule, and a sortie that needed
it is not recorded. `?scenario=<id>&launch` (plus optional `aircraft=` and
`loadout=`) is a quick launch that skips the forms; it is always a Dev sortie.
The rules are in the
[sortie forms spec](superpowers/specs/2026-09-27-sortie-forms-design.md);
`src/render/titleScreen.ts` and `src/sim/sortie.ts` are authoritative; the e2e
harness's `startGame` walks all four forms and `quickLaunch` skips them.

**The chase camera orbits (2026-09-27).** Left-drag on the view swings it
around the airplane, the wheel zooms, and a double-click or C → cockpit → C
returns to the default view. Until you touch the mouse the view is exactly
the old chase view. The rules are in the
[orbit camera spec](superpowers/specs/2026-09-27-orbit-camera-design.md)
and its [handoff](handoff/2026-09-27-orbit-camera.md); master spec §15
holds the status, with Instant Replay next.

**Instant Replay is complete and merged into main (2026-09-28).** A crash or
shoot-down holds for three seconds, replays the final moments once, then opens
the debrief; **Watch replay** runs it again. While paused, K replays the last
10 seconds. During replay: Space plays/pauses, Left/Right steps, 1/2/3 select
0.5×/1×/3×, C or 4–9 selects Auto/Orbit/Flyby/Target/Cockpit/Manual, O toggles
Orbit spin, L locks Manual on the airplane, WASD/Q/E moves Manual, and Esc
returns or skips. See the [Instant Replay handoff](handoff/2026-09-27-instant-replay.md)
and [master spec §15](superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps).

The title's **Library** opens the separate Hangar catalog described in
[GAMEPLAY.md's Library section](../GAMEPLAY.md#library). Its delivered scope and
the remaining model-track work are recorded in
[master spec §15](superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps).
`hangar.html?bench` is the articulation test bench (H2, 2026-09-26; see the
[handoff](handoff/2026-09-26-h2-hangar-bench.md)), and
[`docs/models.md`](models.md) is the runbook for adding a model.

**Models build from a manifest (Z1, 2026-09-25).** Each shipped glb has one
entry in `tools/models/entries/*.json`; `npm run models:build` runs it through
the glTF-Transform stages into `content/aircraft/` or `content/ships/`, and
`npm run models:inspect -- <file.glb>` prints the node tree, counts and
source-frame bounds an entry is written against. The Wildcat's entry is
frozen, so a bare build skips it. The design is
[A6M Zero spec §6](superpowers/specs/2026-09-25-a6m-zero-design.md#6-the-model-pipeline-the-interface-lane-c-designs-against);
see the [handoff](handoff/2026-09-25-z1-model-pipeline.md); master spec
§15 holds the status.

**Original models are authored in Blender (R0, planned as M0, 2026-09-26).** Where no
cleanly licensed model exists, a script under `tools/models/blender/` builds
one headlessly and byte-reproducibly; the barrel-roof hangar is the first.
The roster plan that puts every Library object on screen is the
[model-roster design](superpowers/specs/2026-09-26-model-roster-design.md);
see the [handoff](handoff/2026-09-26-m0-blender-kit.md); master spec §15
holds the status.

**Ships draw licensed models (S1, 2026-09-25).** The three shipped ships
(`essex-cv`, `fletcher-dd`, `type-b-maru`) are licensed models fitted at
build time to their `content/ships/*.json`, so the sim stays authoritative
and Tier 1 fails if a spec moves under a committed glb. A model that fails
to load draws the procedural boxes and says so in `validationErrors`. See
the [handoff](handoff/2026-09-25-s1-ship-models.md); master spec §15
holds the status.

**The rest of Plan 9 (roster, live scoring, dynamic scenario switching)
landed 2026-09-23/24.** A pilot roster now sits ahead of the scenario/loadout
pickers (persisted to `localStorage`, not the design doc's original
IndexedDB — Mark's call, the scale never justified it); landing or crashing
now produces a real debrief with per-target points, the recovery multiplier
applied, the banked total, and a promotion notice, instead of every field
reading zero; picking a different scenario swaps the entity list in place
with no page reload. This plan's first real reference-GPU run — for the
scenario-switch feature specifically — found the switch didn't work at all,
tracked to a temporal-dead-zone bug class in `main.ts`'s title-screen
callback (a closure created before several bindings it reads were declared,
across real `await` boundaries) that a silent `ReferenceError` was aborting
with no visible symptom; fixed across six bindings, the last two found only
by building a click harness fast enough to beat the race. The same run found
this plan's own roster gate had broken the shared Tier 2 test harness
repo-wide (~20 spec files), fixed separately. The final whole-branch review
then found one more real regression in the same area — returning to title
after a landing and flying a second sortie silently stopped banking any
score, because the "New Game" path reset the scoring baseline but not the
other flight/debrief UI state Restart already reset — fixed and re-verified
on the real GPU (a banked total going 500 → 1000 across two landings in one
session). [Handoff](handoff/2026-09-23-plan9-meta-game.md). Open:
roster export/import has no UI wiring yet (needs a replace-vs-merge design
decision first); badge content (no scenario declares an objective yet).

**A loading strip and a pilot Dossier landed 2026-09-26.** The title shows
boot progress and keeps its controls locked until the world is ready, and the
freeze that made it look unclickable is gone. Each roster row opens a Dossier
with the pilot's service record and mission log. See the
[handoff](handoff/2026-09-26-loading-and-dossier.md) for the measured
figures; master spec §15 (row 9) holds the status.

**The UI-realism plan landed 2026-09-24.** The title screen now has persisted
Render Quality, Asset Quality and Damage Model settings; the roster, settings
and debrief use the Naval Communications visual system; and L0/L1 terrain now
ships as selectable asset quality (L0 through Git LFS). Arcade damage disables
only G/overspeed structural consequences, not the stress measurement or HUD.
The reference-GPU acceptance covered every new screen and setting at 1.988 ms
GPU p95 with zero validation errors. See the
[handoff](handoff/2026-09-24-plan-ui-realism.md) for measured evidence,
the Git LFS/CI tradeoff and the deliberately deferred asset-quality work;
master spec §15 remains the authoritative status table.

**Terrain surface textures landed 2026-09-26.** Five CC0 Poly Haven materials
(sand, grass, dirt, jungle floor and rock) now add photographed albedo and normal
detail under the existing land-cover blend. The 2.77 MB KTX2 arrays load before
terrain creation, preserve the procedural average color, fade with distance and
turn off entirely at scenery `low`; a failed texture load falls back to the old
procedural ground. See the
[plan](superpowers/plans/2026-09-26-terrain-surface-textures.md),
[handoff](handoff/2026-09-26-terrain-textures.md) and master spec §15.

**Clouds landed 2026-09-19 (Plan 16a):** volumetric cloud layers raymarched
from two committed noise volumes, declared per scenario in `weather.clouds`
(`free-flight` has a cumulus deck at 1,500 m and a cirrus sheet at 7,000 m;
the gunnery range stays clear). They drift with the wind, curve over the
horizon, fog with the terrain, and going into one is a whiteout with the
panel intact. The [distant-cloud refinement](handoff/2026-09-19-clouds-distance.md)
reduces horizon stipple and repeating rows; its cloud-pass cost measured
1.63 ms at high, 1440p (2026-09-19). See the
[original handoff](handoff/2026-09-19-plan16a-clouds.md).

**Cloud shadows landed 2026-09-19 (Plan 16b):** one sun-view transmittance
map rendered each frame from the same cloud field, carried by the sun's
custom shadow node into every lit material; the terrain and the sea read it
directly. The pass cost 0.16–0.40 ms at high, 1440p. See the
[handoff](handoff/2026-09-19-plan16b-cloud-shadows.md); master spec
§15 holds the status.

**Cloud fidelity II landed 2026-09-25:** a weather map makes cumulus
separate cells with flat bases and varied tops, carved by packed multiscale
noise and a curl field; High amortizes its march over several frames to
fund 128 view steps, against the 60 Hz High budget (the current tier values
live in `CLOUD_TIERS`, `src/render/scene/clouds.ts`). See the
[handoff](handoff/2026-09-25-cloud-fidelity-ii.md) for the reference-GPU
numbers; master spec §15 holds the status.

**Cloud VDB fidelity merged 2026-09-26** (the cloud system's standing
reference is [docs/clouds.md](clouds.md)): every cumulus is carved from one
baked procedural cloud (`tools/sky/cumulus.py`), rotated and scaled per
weather cell, and a layer's `coverage` is again the fraction of sky it
covers. Flying inside a cloud has its own 4K budget. See the
[handoff](handoff/2026-09-26-cloud-vdb-fidelity.md); master spec §15
holds the status.

**The sun moves (Plan 16c, 2026-09-19):** each scenario states an apparent
solar hour (`weather.timeOfDay`); the sun sits where it would over Leyte on
1944-10-20, creeps with the sim clock, and the sky, haze, lights, clouds, sea
and shadows follow its elevation through one keyframed palette. `?timeOfDay=`
picks any hour in DEV. See the
[handoff](handoff/2026-09-19-plan16c-sun.md); master spec §15 holds the
status.

That count was genuinely unsettled until then, and this paragraph said so:
input assists were inserted into the slot the roadmap had given terrain, and
three design documents each shifted differently — the renderer design still
called terrain Plan 3 and the ocean Plan 4, the terrain design called the
ocean Plan 6, and the assists design reserved Plan 5 for combat. Those encoded
two different answers to "what comes after terrain" rather than three typos.
**The table in master spec §15 is now the only authoritative copy**; every
other document points at it.

## Ocean: trying Plan 5 (obsolete branch instructions)

Run `npm run dev -- --port 5183` in the ocean worktree. Compare
`http://localhost:5183/?spawnY=100&beaufort=2&oceanTime=17` with force `6`.
Remove `oceanTime` to animate. `oceanTier=high`, `medium` or `low` holds a
quality tier for development comparisons. These URL overrides are absent
from production builds. Default weather is Beaufort 4.

Three disjoint wave bands use 509/127/31 m periods. High quality runs three
256² FFTs, medium two 128² FFTs, low one 128² FFT. A one-time warm-up check
can reduce quality if measured cost exceeds its threshold. Water remains a
rendering effect: wave forces and water collision are future work.

