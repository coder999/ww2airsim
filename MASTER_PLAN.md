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

**A1. Loading screen (S). Done 2026-10-08** (`ca97a522`): the art shows alone with the strip at its foot; the memos slide in on ready. Handoff `docs/handoff/2026-10-08-order-1.md`.

**A2. Scenario switch loads that scenario's weather (S). Done 2026-10-08** (`7249619f`): hour, cloud deck and sea state follow the launched scenario, both directions (`clouds.md` #10 closed). Handoff as A1.

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

**A5. Render scale in Settings (S, after H0 and A4).**
- **Today:** render size is window size × `devicePixelRatio`, capped at 2 (`renderer.ts:114`). H0 adds a DEV-only `?renderScale=` param.
- **Proposal:** promote it to a player-facing Render scale option beside A4's quality step (Mark, 2026-10-08).

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
- **Redesigned 2026-10-09 (Mark):** the cue moved from a HUD text line into the scene: an arrow ahead of the nose that turns toward the destination, a diamond on the destination once it is on screen, and the name and range beside either. No altitude.
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

**C1. Control surfaces (M per batch). Complete 2026-10-08: all twelve airframes move their ailerons, elevators, rudders and flaps.**
- **Batch 1 done 2026-10-08:** the five Blender models (B-29, Ki-21, G4M, P-38, Ki-84) move ailerons, elevators, rudders and flaps, and the Hangar bench has roll, pitch and yaw sliders. Plan `docs/superpowers/plans/2026-10-08-c1-surfaces-batch1.md`; handoff `docs/handoff/2026-10-08-c1-surfaces-batch1.md`.
- **Batch 2 merged 2026-10-08:** the F6F, F4U and F4F. The F6F and F4U surfaces are cut out of their downloads; the F4F is unfrozen and its ailerons cut from the outer wing at the F4F-3's measured layout (Mark's ruling, 2026-10-08), with its inboard pieces static and split flaps drawn under them in `wildcat.ts`. Handoff `docs/handoff/2026-10-08-c1-surfaces-batch2.md`.
- **Batch 3 merged 2026-10-08:** the A6M2 and Ki-43. The Zero's surfaces are cut from its body. Its draw budget rises from 12 to 14, the least seven one-draw surfaces need. The Ki-43's download already models its ailerons, elevators and rudder as their own pieces; only its flaps are cut. Handoff `docs/handoff/2026-10-08-c1-surfaces-batch3.md`.
- **Batch 4 merged 2026-10-08** (`28028ea4`): the D3A and B-17. The D3A's ailerons, flaps and elevators are cut from its one-piece wing and tailplane, and its rudder is the download's own piece. The B-17's download models its ailerons, split flaps and rudder as pieces; only its elevators are cut. Each made room under its triangle limit by trimming hidden detail (Mark's ruling): the D3A's cockpit interior, and the B-17's interior shell and seat. Handoff `docs/handoff/2026-10-08-c1-surfaces-batch4.md`.
- **Decided (grilling, 2026-10-08):**
  - Ailerons, elevator, rudder (both fins on the P-38) and flaps. No trim tabs, cowl flaps or dive brakes.
  - **Visual only:** the renderer follows pilot `Controls` through a cosmetic slew rate, with full travel at any speed. Flaps follow the sim's existing `flapFraction`. The flight model is unchanged.
  - Deflection limits: one default set (aileron ±20°, elevator ±25°, rudder ±25°, flap 0-45°) in the manifest, overridden per model only where a source gives the real figure.
  - Every airframe, one plan per batch: (1) the five Blender models; (2) F6F, F4U, F4F, with split flaps modeled for the F4F; (3) A6M2, Ki-43; (4) D3A, B-17.
  - The rig name pattern (`render/scene/airframeRigs.ts:37`) gains `Aileron[LR]`, `Elevator`, `Rudder`, `Flap[LR]`, with hinge axes in the manifest. The Hangar bench gains roll, pitch and yaw sliders and is the test harness.
  - Worktree, unattended. Checkpoint: one Hangar look per batch, captures in the handoff.

**C2. Bomb-bay doors (M, after C1 batch 1).**
- **Done 2026-10-08** (merge `4477f9ea`). Plan `docs/superpowers/plans/2026-10-08-c2-bay-doors.md`; handoff `docs/handoff/2026-10-08-c2-bay-doors.md`. All four have real doors in their models (Mark's rulings, 2026-10-08): the B-17's cut from its download, the B-29's (both bays), G4M's and Ki-21's built by `kit.fuselage(doors=...)`. The interim code-drawn plates are deleted.
- **Decided (grilling, 2026-10-08):**
  - Bay doors on the B-29 (two bays, the test case), G4M, Ki-21 and B-17, reusing C1 batch 1's hinge machinery. The Avenger (Track D) reuses the mechanism.
  - A sim-side door state with a per-airframe travel time. The player toggles it with `O`.
  - Release (`V`) with the doors shut drops nothing and shows "BAY DOORS CLOSED".
  - Drag: open doors add drag scaled by door fraction. Bay bombs keep their current stores drag.
  - AI stub: the AI opens the doors inside a fixed range of its target and closes them past it. A sim unit test and a Dev/Hangar check prove it, since no scenario places a bomber yet. E3 builds on it.
  - Sound in C2: a synthesized door motor plus a lock clunk (`hook_clunk.wav`), the first of I1's mechanicals, which I1 reuses for gear and flaps.
  - Worktree, unattended. Checkpoint: B-29 doors cycling in the Hangar plus a flown drop, captures in the handoff.

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
   - **Done 2026-10-09, merged to `main`** (veterans toned down and green strengthened per Mark's rulings the same day). Plan `docs/superpowers/plans/2026-10-09-e1-gunnery.md`; handoff `docs/handoff/2026-10-09-e1-gunnery.md`. AI duels now end in kills (26 of 72 duels, from 3); a straight-flying player survives a veteran a median 8 s; green rarely kills a maneuvering target.
2. **Attack behaviors (M):**
   - **Dive-bombing** first, as the D3A exists and bombs already work.
   - **Torpedo runs** after Track D.
   - **Kamikaze**, for the "Kamikaze Watch" mission.
   - Raiders that actually attack instead of orbiting.
3. **Bombers and turrets (M-L):** bomber AI (formation level bombing), then defensive gunners. The turrets already aim, visually (turret aim, `docs/handoff/2026-10-09-turret-aim.md`), and so do the nose, cheek and tail guns (flex guns, `docs/handoff/2026-10-09-flex-guns.md`): gunners add firing.
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
  | Surigao Strait (dawn aftermath, 25 Oct 1944: the battle line finishes the column, aircraft pursue Mogami) | M2-M4; first light keeps it inside the §3 no-night rule |

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
- **Proposal:** one profiling plan on the reference GPU (under `hwlock ryzen`) that buys headroom first and re-baselines what is left with Mark's ruling, so Tracks K and L have a budget to spend.
- **Decided (grilling, 2026-10-08):**
  - **The gate moves to 1440p at 120 Hz:** High gpu p95 ≤ 8.33 ms at 2560×1440, in every view, the in-cloud view included (no carve-out). At 1440p, 60 Hz would already be green by ~8 ms (prior handoffs read 6.2-8.1 ms), so it would not be a bar. Medium at 1440p, and both tiers at 4K, are recorded, never asserted.
  - **Margin target:** every High view at ≤ 7.5 ms (about 10%) when H0 ends.
  - **Optimize until wins dry up:** stop after two levers in a row each buy < 0.3 ms p95 on the worst view.
  - **Levers:** a lever whose frozen-scene capture matches the baseline lands as is. A visible one lands behind a URL param, default off, with a before/after pair, and Mark rules on flipping it.
  - **Leftover reds stay red.** The handoff gives each one its measured p95 and a proposed limit, so the ruling is a one-line change.
  - **`motionBudget`** is re-measured at 1440p on the final build, with the same no-MRT reference method.
  - **`?renderScale=`** DEV param (render at a fraction of window size), so Mark can compare 4K and 1440p live. The player-facing setting is A5.
  - **Photoreal Task 14** is H0's last step: tripwires re-derived from H0's final numbers, the probe check in Mark's Chrome, the handoff and its entry here.
  - **How it runs:** in a worktree, unattended. Viewing checkpoints: the re-baseline ruling and the final result, both collected in the handoff.
- **Plan:** `docs/superpowers/plans/2026-10-08-h0-render-budget.md`.

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
- **Quick win: done 2026-10-08** (`fe0eaffe`): `engine_radial_big` for the ~2,000 hp radials (F6F, F4U, Ki-84), a fourth family keyed by aircraft id. Smaller radials keep `propeller.wav` (Mark, 2026-09-29), so `engine_radial_small` stays unwired on purpose.
- **I1, synthesized mechanicals:**
  - wind;
  - wheel rumble;
  - stall buffet and buzz;
  - overspeed creak;
  - radio squelch and static. The radio bus exists and nothing feeds it (`webAudio.ts:52-58`).
- **I2, voice (§4 Q7):**
  - **Recorded 2026-10-09** with ElevenLabs instead of Firefly: all 68 lines of `docs/audio/firefly-prompt-sheet.md` (34 cues, US voice "Clyde", JA voice "Adam") are in `content/audio/voice/`, with the real `rocket_whoosh.wav`. Provenance is in `content/audio/NOTICE.md`; `tests/audio/voice.test.ts` checks every sheet line is present, mono 48 kHz and unclipped. The takes and the five-voice audition are on `sounds.html` (Dev checkbox), from nexus's gitignored `content/audio/candidates/`.
  - **Not wired yet.** The lines are not in `AUDIO_ASSETS` on purpose: `system.ts` loads that whole table at boot, and the lines total 16 MB. Wiring loads only the player side's 34, on demand.
  - Still to do: tie each on-screen message to its line, feed the radio bus (`webAudio.ts`), and choose US or JA by the player's side (`CONTEXT.md`).
- **I3, recorded effects (Mark, 2026-10-09):** gear up/down and flaps up/down are recorded rather than synthesized, plus AA guns (5-inch, 40 mm, 20 mm; ship and ground share them), a close flak burst, and torpedo drop and hit. Prompts are in `docs/audio/firefly-prompt-sheet.md`; three ElevenLabs takes of each are on `sounds.html`, awaiting Mark's picks. Wiring: gear and flaps with C1, the AA guns and flak with M2, the torpedo with the Avenger.
- **Both:** an ear-tuning pass with Mark, and the E2E runs 15b and 15c never got.

### Track J: Google Analytics (S). Done 2026-10-08

`0fe24aab`: GA4 property 558194335 (`G-3VE6LD7RCS`). The tag is in the production build only and loads only on `ww2airsim.com` and `ww2airsim.marktuttle.dev`. The events are `sortie_launched`, `mission_outcome`, `quality_tier` (detected against chosen, for A4) and `boot_ready`. There is a privacy line in the About memo. Deployed 2026-10-08 (run 37852717790); the page source on both production hosts carries the tag, and windomlane does not (curl, same day). Handoff `docs/handoff/2026-10-08-order-1.md`.


### Track M: Ships (L)

Mark's items (2026-10-08): better ship models, turrets that work and fire, and AA on every warship.
- **Today** (verified 2026-10-08):
  - 10 ship classes. Pennsylvania, Kagero and Casablanca are our own Blender models (`tools/models/blender/*.py`); the other 7 are Sketchfab downloads (`ASSETS.md`).
  - Only Pennsylvania (`Turret1..4`) and Kagero (`Turret1..2`) have separate turret nodes. Most downloads are one merged mesh.
  - Nothing fires at the player except enemy aircraft. Ground `aaa` structures are targets only (`sim/weapons/structures.ts`), and ships have no guns.
  - Ships have one `hullHp` pool (Track D).
- **Decided (Mark, 2026-10-08), in order:**
  1. ~~**M1 Models (M-L).**~~ Done 2026-10-08 (branch `m1-ship-models`, handoff `docs/handoff/2026-10-08-m1-ship-models.md`): every warship's guns are spec data and instanced, trainable kits; the three Blender ships got a detail and paint pass.
     - Our three Blender ships gain detail, silhouette, paint and textures.
     - Each download is split in Blender where its mesh allows; otherwise it is rebuilt as our own model.
     - Every warship ends with separate turret and AA-mount nodes, with AA added where a model has none.
     - Merchants (the Maru) get no guns.
     - **M1b (done 2026-10-09,** merge `e66b78a9`, handoff `docs/handoff/2026-10-09-m1b-aa-mounts.md`): Mark couldn't see the AA, so light AA is now generated at 1.3x with shields and dark barrels, every 20 mm and 25 mm gallery draws each gun, and every mount's guns elevate (Hangar Train mounts sweep).
     - **M1c (done 2026-10-09,** merge `83e23729`, handoff `docs/handoff/2026-10-09-m1c-ship-detail.md`): our three Blender ships gain railings, rigging, rounded deckhouses and a committed high-poly bake (AO and detail normals, Cycles on Ryzen's GPU), with deck planks or linoleum and porthole rust. Budgets unchanged.
  2. **M2 AA fire (M).** Ships and ground AAA share one system:
     - heavy guns throw timed flak bursts at altitude;
     - light guns fire tracer rounds through the existing ballistics at close range;
     - both sides fire, under the friendly-fire rules;
     - the default is dangerous: lingering low over a destroyer costs you.
     - Builds on E1's lead and aim error.
  3. **M3 Gun-laying AI (M).** Its own item, buildable separately: target choice, turret training and lead. It drives M2's mounts and M4's turrets.
  4. **M4 Main batteries (M-L).** Ship against ship and against ground targets.
     - Shells take `hullHp`, and a hit near a turret or AA mount can knock it out.
     - Waterline damage and flooding stay with Track D.
  5. **M5 Global difficulty (S-M).** A Settings option that scales AA accuracy, AI pilot skill and the damage the player's aircraft takes. Scenario `skill` values stay as the baseline it shifts.
  6. **Content.** First, a test range where two ships duel and one shells a shore battery. Then Surigao Strait (Track F).

---

## 2. Proposed order

Tracks with no dependency between them run in parallel worktrees, as the
first pass did. Each order number marks a step where every earlier step's
prerequisites are met.

| Order | Work | Why here |
| --- | --- | --- |
| 1 | ~~A1; A2; I quick win (radial engines); J~~ done 2026-10-08 | Days of work, all visible, no dependencies. Track 0 is done |
| 2 | A3, A4; B1; M1 ship models (own worktree, in parallel) | Fixes what every player sees first; A4 closes the trees incident. M1 is asset work, independent of the rest |
| 3 | E1 gunnery honesty; H0 budget | E1 unblocks most missions; H0 unblocks Tracks K and L |
| 4 | A5 render scale; B2, B3, B4 tutorial; C1 control surfaces; I1; I2 voice; M2 AA fire, M3 gun-laying AI, M5 difficulty | Player experience; C1 and I1 share the flap and gear motion |
| 5 | F missions that are now unblocked (Single Combat, Scramble); L1 terrain allocation then trees; K in-cloud pacing | |
| 6 | E2 attack AI; C2 bomb bays; E3 bombers and turrets; F Escort and Kamikaze Watch | Bays and bomber AI meet in Escort |
| 7 | D torpedoes (Avenger); K clouds, remaining steps; L2 shore; M4 main batteries, then F Surigao Strait | |
| 8 | F campaign by day; C3 stage 1 panels | |
| 9 | G1 world abstraction; G2 Midway (adds SBD, TBD, B5N) | Last, because it multiplies the content every earlier track has to support |

A rough total by the size key: about 30-40 plans.

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
7. ~~**Voice lines.**~~ Recorded 2026-10-09 with ElevenLabs (Track I, I2); catalog, three Voices (Paddles, Tower, Wingman) each with a Japanese take, manifest and ingest script (Track I).
8. ~~**Analytics scope.**~~ Production only; one privacy line in About.
9. ~~**This document's authority.**~~ Decided 2026-10-08: it lives at the repo root and is the plan and ledger; master spec §15 is frozen as history (README).
10. ~~**T1 and W1.**~~ Keep both. Mark hand-flew T1 2026-10-08: the landing and the hands-off torque swing are right. Settled.
11. ~~**Escort pursuit.**~~ The spec's "takes hits" becomes "fires within gun solution" (`formationCover.test.ts` skip; 7f handoff §4.2; `docs/testing.md`, "Known gaps").
