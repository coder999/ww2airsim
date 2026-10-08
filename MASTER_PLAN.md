# ww2airsim master plan

**This file is the authoritative plan and ledger** (README, ["Where docs
go"](README.md#where-docs-go)): the tracks, their order, their status, and the
decisions they wait on. Execution detail for a track may live in
`docs/superpowers/plans/`, and each plan's measurements in its handoff, but
status is recorded here and nowhere else.

## 1. Tracks

Each track covers what exists, what is missing, a proposed scope, and its
size. Size is counted in plans, where one plan is the 6-15 task unit every
completed plan has been: **S** = under one plan, **M** = one plan, **L** = 2-4 plans.

### Track 0: Housekeeping (done 2026-10-08)

- **Stale docs:** fixed: §15's "not merged" claims, `clouds.md`, `drape.md`, a `main.ts` comment.
- **Test-suite cleanup:** done. Correctness and budget tests separated, three trap clones merged into one enrolled test, unwired coast tools deleted with their tests, capture tools gated behind `E2E_CAPTURE=1`, and the slowest unit file down from 108 s to 1 s.
- **Testing philosophy:** written into [`docs/testing.md`](docs/testing.md#philosophy).
- **Photoreal Task 14,** which never ran: re-filed into H0.

### Track A: First load and the launch sequence

Mark's items: the loading bar UI; choosing time of day with a suggestion;
render quality with auto-detect.

**A1. Loading screen (S).**
- **Today:** the boot strip is appended inside the roster memo, between the pilot table and "Enlist New Pilot" (`titleScreen.ts:567-584` vs `:1006-1051`). The design (§A.2) said the foot of the overlay. The title art (`content/art/title.png`) is the overlay's own background, and the opaque roster sheet sits on it from frame one, so the art is never seen (`titleScreen.ts:508-510`).
- **Proposal:** a boot state that shows the art alone, with the progress bar at the foot of the overlay. The roster sheet slides in once the boot is `ready` (about 2.9 s cold, 2026-09-26 handoff). Terrain keeps streaming afterwards, as now.

**A2. Scenario switch reloads sky and time (S, prerequisite for A3).**
- **Today:** `loadScenario` leaves sky and terrain alone, so every title launch flies the boot scenario's 10:00 sun and clouds, whatever the briefing says (`clouds.md` #10).
- **Proposal:** fix this before adding a picker, or the picker will appear to do nothing.

**A3. Time-of-day picker (S-M).**
- **Today:** players can't choose it. It comes from the scenario's `weather.timeOfDay`, or `?timeOfDay=` in DEV only.
- **Proposal:** a field on Form 2 (Sortie Orders) that defaults to the scenario's historical hour, labeled as suggested, and is clamped to dawn-dusk. **There is no night lighting**, so night is a separate rendering plan if wanted.

**A4. Quality auto-detect that measures the right thing (M).**
- **Today:** the probe takes one p95 after 180 frames **on the title screen**, under vsync. A vsynced Chrome downclocks the GPU and reads about 3× high, so Mark's desktop measured 11.4 ms and got Low (`main.ts:1424-1442`, `ocean/tiers.ts:25`).
- **Proposal:**
  - Measure a representative flight view, not the title screen.
  - Recommend one bundle across ocean, clouds and scenery rather than ocean only.
  - Show the recommendation on a quality step in the launch flow, with an override.
- This closes incident 2026-09-20 and `clouds.md` #2. **`clouds.md` notes this does more for how the clouds look on Mark's desktop than any shader work.**

### Track B: Guidance, autopilot and tutorial

Mark's items: guide mode (an arrow to the objective; a bomb impact marker); improved autopilot; a tutorial. Terms per `CONTEXT.md`: the arrow is the **Steering cue** (always on), the marker an **Assist** (off by default, behind the Assists toggle; §4 Q2).

**B1. Steering cue (S, done 2026-10-08).**
- **Shipped:** an always-on, nose-relative HUD arrow follows the first active
  primary objective with a finite destination. A destination selected on the
  navigation chart overrides it; a destroyed or otherwise stale selection
  falls back to the objective.
- Range is in statute miles and vertical separation in feet. Destroy objectives
  follow their nearest live resolved target; station altitude bands read level
  while the player is inside the band. Standing `protect`, `deny` and
  `approaches` orders do not mask a simultaneous recovery objective.
- Measurements and verification: [`docs/handoff/2026-10-08-b1-steering-cue.md`](docs/handoff/2026-10-08-b1-steering-cue.md).

**B2. Bomb impact predictor (M).**
- **Today:** bombs are aimed by eye.
- **What exists:** `flyProjectile` is pure and exported (`sim/weapons/combat.ts:140`). Bomb drag and arming are content (`an-m65`). `groundHit`/`seaHit` (`:181`, `:211`) are module-private.
- **Proposal:** a pure sim function `predictImpact(state, store)` that iterates `flyProjectile` to terrain or sea, with a ground marker in the renderer. Same pattern as the gun pipper's `gunHarmonization`. Rockets could follow.
- **This is a period-incorrect aid** (no CCIP in 1944), so it is an Assist: behind the Assists toggle, off by default (§4 Q2).

**B3. Navigation autopilot (M).**
- **Today:** the player autopilot is the pursuit law only (Shift). Altitude hold was deleted 2026-09-17 because it wasn't wanted then.
- **What exists:** the AI already flies the laws: `goalDesiredVelocity` (ingress), `loiterDesiredVelocity`, `approachControls`, formation keeping. The measurement autopilot holds level flight (`sim/autopilot.ts`).
- **Proposal:** three modes built on the AI laws rather than new control law:
  - heading and altitude hold;
  - fly to the B1 waypoint;
  - fix the pursuit mode's 13 g overshoot with a g-limit.
- **Decided (§4 Q5):** pursuit only, as g-limited lead pursuit onto a gun solution; the player still fires. Heading/altitude hold and waypoint modes are dropped.

**B4. Tutorial (M).**
- **Today:** none. Deck Quals and the ranges are practice, not instruction. The legend is a key list.
- **What exists:** the mission engine already chains objectives (`after`) and fires `message` triggers.
- **Proposal:** a **tutorial mission** rather than a separate mode: take off, fly to a point, land, then a gunnery pass and a bomb run, each step a chained objective with radio-line instructions.
- **Engine gap:** step conditions on control state ("gear down", "flaps 20°", "below 120 mph"), which are a new trigger condition kind. That makes it about one plan, and it reuses B1 for "fly here".

### Track C: The aircraft come alive

Mark's items: animated rudder, ailerons and flaps; bomb-bay doors; cockpits unique to each plane.

**C1. Control surfaces (M per batch).**
- **Today:** no airframe animates any surface. The data path already exists and is unread: `AirframeUpdate` carries `flapFraction` and `controls` "for control surfaces where a model has them" (`render/aircraft/airframe.ts:14-19`), and the Hangar bench has a flap slider that drives nothing.
- **Geometry:**
  - The four in-house Blender models (B-29, Ki-21, G4M, P-38) already cut separate surface pieces (`kit.py` `controls=`), but merge them into the parent node.
  - The downloaded models (Wildcat, Zero and others) need surfaces split per model, and the Wildcat has no flap geometry at all.
- **Proposal:**
  - Extend the rig name pattern (`airframeRigs.ts:37`) with `Aileron[LR]`, `Elevator`, `Rudder`, `Flap[LR]`, with hinge axes in the manifest.
  - Animate the four Blender models first, then split the downloaded models one at a time through the `docs/aircraft.md` process.
  - The Hangar bench is the test harness.

**C2. Bomb-bay doors (M).**
- **Today:** no door geometry anywhere. Each bomber's model script leaves it out by name. The policy in `aircraft.md:119-124` is "bay doors get their own plan".
- **Proposal:** door geometry and a rig on B-17, B-29, G4M and Ki-21, plus a sim-side door state. Release is gated on doors open, and drag rises with doors open. The B-29's two bays are the test case. This pairs with a door-motor sound (Track I).

**C3. Per-plane cockpits (L, staged).**
- **Today:** one shared procedural 3D panel for every airframe, placed per spec's eye point (`panel.ts`). It has an airspeed indicator, altimeter, rate of climb, attitude ball, heading tape, throttle, fuel, gear and flap lights, radar scope and reflector sight. Per-plane cockpits are deferred by Mark's ruling D12 (2026-09-28).
- **Proposal, in two stages:**
  1. Per-airframe panel layouts on the existing procedural panel: which instruments, where, in what units (Japanese gauges in metric would be period-correct), plus the frame and canopy bow as simple geometry. This is about one plan and covers all 12.
  2. Modeled 3D cockpits for one flagship airframe first (F6F or F4F), to measure what one costs before committing to 12.
- **Decided (§4 Q4):** stage 1 only; stage 2 is dropped.

### Track D: Torpedoes (L)

- **Today:** projectile `kind` is round, bomb or rocket (`combat.ts:85`). Ships have one `hullHp` pool and sink over 90 s, with no waterline or hit location. No torpedo bomber is in the roster. The G4M historically carried the Type 91, but its spec carries bombs.
- **Proposal, in order:**
  1. **Airframe:** TBF/TBM Avenger (US, player-facing) via the onboarding process.
  2. **Weapon:** a torpedo store with drop envelope limits (speed and height at release, or it breaks or dives), a water entry, then a surface run at set speed and depth.
  3. **Damage:** a waterline hit that does more than a bomb of equal weight. Whether that becomes flooding or a simple multiplier is a design call.
  4. **AI:** torpedo attack, so the enemy can use it too, from Track E.
- Midway and Pearl Harbor both want the B5N Kate on the Japanese side (§1 Track G).

### Track E: Better AI (L)

Mark's item is "improved AI". In priority order, by what other tracks need:

1. **Gunnery honesty (M).** Lead on relative velocity, drop compensation and per-skill aim error. **This blocks almost every combat mission:** AI-vs-AI fights don't end in kills, and M4's interceptors can't shoot raiders down.
2. **Attack behaviors (M):**
   - **Dive-bombing** first, as the D3A exists and bombs already work.
   - **Torpedo runs** after Track D.
   - **Kamikaze**, for the "Kamikaze Watch" mission.
   - Raiders that actually attack instead of orbiting.
3. **Bombers and turrets (M-L):** bomber AI (formation level bombing), then the Hangar's H3 turrets (`Turret1..N` nodes exist and are static) with defensive gunners.
4. **Fixes:**
   - escort pursuit (7f §4.2);
   - wingman commands (7f §4.5);
   - the 7c list (no stall guard, 70° bank cap, 20 s latch cap);
   - `disengageThreshold` unread (7b).

### Track F: Missions and a campaign (M then L)

- **Today:**
  - 4 missions and 6 ranges ship.
  - A new mission is a JSON file plus one `SCENARIO_OPTIONS` row, unless it needs a new objective kind, AI behavior or model.
  - Five more missions are designed in GAMEPLAY.md and not built: Scramble, Escort, Flattop Hunt, Kamikaze Watch, Single Combat.
- **Each mission's dependency:**

  | Mission | Needs |
  | --- | --- |
  | Single Combat | nothing new; buildable now |
  | Scramble | E1 (interceptors must kill) |
  | Escort | E1, E3 (bombers to escort) |
  | Kamikaze Watch | E2 (kamikaze behavior) |
  | Flattop Hunt | a Japanese carrier model; D for the full version |

- **Campaign by day** (missions spec §6.2): needs per-day airfield ownership plus the above. Build it after the missions, not before.

### Track G: Other theaters (L, after F)

- **Today:** single-world, with Leyte hardcoded:
  - `WORLD_CENTRE` is a module constant (`sim/world/projection.ts:7`).
  - Terrain, land-cover, ocean, river and places headers are static JSON imports.
  - The sun's date is the constant `SCENARIO_DAY_OF_YEAR` (`sky/sun.ts:11`).
  - Bases and routes are local coordinates.
  - Leyte's data is about 171 MB (L0 134 MB in LFS).
- **G1, the world abstraction (M):** a world id on scenarios, runtime-loaded headers, a per-world data directory and build, a per-world center and date, and a theater picker on Form 2. Leyte keeps working unchanged, verified by the existing suite.
- **G2, the first new theater (M-L):** **Midway is the recommendation** over Pearl Harbor:
  - Its terrain is two atolls, so the data is tiny.
  - The battle is carriers and dive bombers, which the game already does well.
  - Its aircraft gaps are small: SBD Dauntless and TBD Devastator for the US; the A6M2 and D3A exist; the B5N is needed.
- **Pearl Harbor** needs Oahu terrain (a full Leyte-scale build), battleship rows, B5N shallow-water torpedoes and, from the US side, mostly defense. It is a bigger lift and better second.
- **Decided (§4 Q1):** Midway first, Pearl Harbor second.

### Track H: Rendering budget (M)

Mark's items: better clouds, land and beach. Those are now Tracks K and L;
this track is the budget both spend. (Rendering steps are not numbered
H1-H3: those names already mean the Hangar plans.)

**H0. Win back budget first (M).**
- **Today:** the 2026-10-03 E2E run had 13 frame-time reds. Since correctness specs stopped asserting frame time (2026-10-08), 7 of them are budget misses: six `budget4k` views and `motionBudget` (projected; the next nightly confirms). The `photo` view at High has 0.6 ms of margin, and `clouds.md` §6 says to win margin back before adding any feature.
- **Proposal:** one profiling plan on the reference GPU (under `hwlock ryzen`) that either buys headroom or re-baselines with Mark's ruling, so Tracks K and L have a budget to spend. It also finishes photoreal Task 14, which never ran: the tripwire re-derivation, the check in Mark's Chrome, the handoff and its entry here.

### Track K: Clouds (size L)

Clouds have needed attempt after attempt (`clouds.md` §3 is the
history), so they get their own track. **`clouds.md` §6 is the
step list and its order; this track does not restate it.** In outline:
- measure High in-cloud frame pacing first;
- the auto-tier, built in A4 (order 2), which does more for Mark's desktop than any shader work;
- Low edge shimmer;
- multi-layer clouds and cirrus shadows (`clouds.md` #8);
- one look-pass sitting with Mark on #6 and #7.

No new cloud feature lands before H0's margin. Expect a plan per step, not
one plan for the lot.

### Track L: Terrain (size L)

**L1. Land (M-L).**
1. On-demand terrain level allocation, then the default Asset Quality moves to `medium`. This is Mark's 2026-09-27 ruling, deferred, and the single biggest visible change for a first-time player.
2. Real tree crowns (visual-realism §3.1). Trees are three flat icosahedra today (`scene/vegetation.ts:144-167`).
3. Leaf, bark and building textures (visual-realism spec §2.2, §2.3).

**L2. Beach and shore (M).**
- **Today:**
  - a noise-perturbed sand band over terrain heights 1.3-7.5 ft (`terrain/surface.ts:255`);
  - bathymetric water color;
  - a 6.5 ft wave fade at the shore.
  - There is **no shore foam, surf line or wet-sand band**, and no document designs one.
  - 13c's DEM reshaping was abandoned because the pyramid's tent filter can't keep a land/sea boundary.
- **Proposal:** solve it in shading, not in the DEM. Build a baked distance-to-shore field (`tools/landcover/sea.ts`'s sea-connected mask is the starting point: deleted unwired 2026-10-08, restorable from `cc8579f`). It drives a surf foam band and a breaking-wave whitening on the ocean side, and a wet-sand darkening on the land side. This needs its own design document. It shares the water-effects ground E3 never started.

### Track I: Sound (M, two plans)

- **Today:** 16 sounds wired out of about 44 designed.
- **Quick win:** `engine_radial_small` and `engine_radial_big` are on disk and unwired. The code has 3 engine families, not the spec's 4, and picks by aircraft id rather than the spec's `engineSound` key (`audio/layers.ts:33-35`).
- **I1, synthesized mechanicals:**
  - wind;
  - gear and flap motors, plus lock clunk (pair with C1, and with C2's door motors);
  - wheel rumble;
  - stall buffet and buzz;
  - overspeed creak;
  - radio squelch and static. The radio bus exists and nothing feeds it (`webAudio.ts:52-58`).
- **I2, voice (§4 Q7):** Mark generates in Adobe Firefly. Scope:
  - a catalog of every on-screen message, with a proposed **Radio line** for each reusable one ("Cleared for takeoff"); Mark strikes what he doesn't want;
  - Voices: Paddles, Tower and Wingman, each with a US English and a Japanese take chosen by the player's side (`CONTEXT.md`);
  - `docs/audio/firefly-prompt-sheet.md` (16 Paddles lines today) becomes a manifest, and an ingest script checks name, format and length, measures peaks, writes the `src/audio/assets.ts` entries and the `NOTICE.md`/`ASSETS.md` lines, and reports what is still missing.
- **Both:** an ear-tuning pass with Mark, and the E2E runs 15b and 15c never got.

### Track J: Google Analytics (S)

- **Today:**
  - No analytics anywhere.
  - The game is a static Vite build served by nginx on the VPS.
  - There is no CSP header that would block it.
  - The site is `noindex` with `robots.txt` `Disallow: /`.
  - There is no privacy text.
- **Proposal:** provision through the `google-analytics` skill: a GA4 property, then the tag in `index.html`. Add custom events for the things worth knowing: sortie launched (mission, aircraft), mission outcome, the quality tier chosen and auto-detected (useful data for A4), and boot time. Add a privacy line to the About memo.
- **Decided (§4 Q8):** production hosts only (DEV and `windomlane` excluded); one privacy line in the About memo, no consent banner.

---

## 2. Proposed order

Tracks with no dependency between them run in parallel worktrees, as the
first pass did. Each order number marks a step where every earlier step's
prerequisites are met.

| Order | Work | Why here |
| --- | --- | --- |
| 1 | A1; A2; I quick win (radial engines); J | Days of work, all visible, no dependencies. Track 0 is done |
| 2 | A3, A4; B1 | Fixes what every player sees first; A4 closes the trees incident |
| 3 | E1 gunnery honesty; H0 budget | E1 unblocks most missions; H0 unblocks Tracks K and L |
| 4 | B2, B3, B4 tutorial; C1 control surfaces; I1; I2 voice | Player experience; C1 and I1 share the flap and gear motion |
| 5 | F missions that are now unblocked (Single Combat, Scramble); L1 terrain allocation then trees; K in-cloud pacing | |
| 6 | E2 attack AI; C2 bomb bays; E3 bombers and turrets; F Escort and Kamikaze Watch | Bays and bomber AI meet in Escort |
| 7 | D torpedoes (Avenger); K clouds, remaining steps; L2 shore | |
| 8 | F campaign by day; C3 stage 1 panels | |
| 9 | G1 world abstraction; G2 Midway (adds SBD, TBD, B5N) | Last, because it multiplies the content every earlier track has to support |

A rough total by the size key: about 25-35 plans.

---

## 3. Not in this plan, deliberately

- **Night lighting, weather beyond clouds, multiplayer, a mission editor.** None was on Mark's list. The missions spec rules out an editor (`missions-design.md:167`).
- **Re-deriving flight models.** The graded cards and the `plan1-rulings.md` decisions stand.
- **Engine start and taxi sequences.** Taxiing isn't modeled for AI either (7g §6.5). This would be its own track if wanted.

---

## 4. Decisions for Mark

All decided 2026-10-08 (grilling session); the tracks above carry each answer.

1. ~~**Next theater.**~~ Midway first, then Pearl Harbor.
2. ~~**Guide mode aids.**~~ Steering cue always on; the impact predictor is an Assist, off by default behind an Assists toggle.
3. ~~**Tutorial.**~~ A tutorial mission on the existing engine.
4. ~~**Cockpits.**~~ Stage 1 only.
5. ~~**Autopilot modes.**~~ G-limited lead pursuit only; nav modes dropped.
6. ~~**Torpedo airframe.**~~ TBF/TBM Avenger first.
7. ~~**Voice lines.**~~ Generated by Mark in Firefly; catalog, three Voices (Paddles, Tower, Wingman) each with a Japanese take, manifest and ingest script (Track I).
8. ~~**Analytics scope.**~~ Production only; one privacy line in About.
9. ~~**This document's authority.**~~ Decided 2026-10-08: it lives at the repo root and is the plan and ledger; master spec §15 is frozen as history (README).
10. ~~**T1 and W1.**~~ Keep both. Mark hand-flies T1's landing and judges the 10° hands-off torque swing at the next attended session.
11. ~~**Escort pursuit.**~~ The spec's "takes hits" becomes "fires within gun solution" (`formationCover.test.ts` skip; 7f handoff §4.2; `docs/testing.md`, "Known gaps").
