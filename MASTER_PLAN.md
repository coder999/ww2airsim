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
- **Controls overlay and pause audio (done and merged 2026-10-11, `ab78775c`):** the redundant in-flight keyboard overlay and its `/` toggle are gone; the pause dossier remains the player-facing control reference. Required data and model attribution links moved to the title screen's About memo. Pausing now silences the master bus as well as loop state, so active radio, weapons, impacts and engines stop until play resumes. Handoff [`docs/handoff/2026-10-11-controls-overlay-pause-audio.md`](docs/handoff/2026-10-11-controls-overlay-pause-audio.md).
- **Desktop Hangar UI (done 2026-10-11):** desktop now uses a full-width inspection bay, cockpit-metal bottom carousel with previous/next controls, and separate upper-right details and lower-right test-bench overlays. Aircraft, vehicles and ordnance use a generated open-front V-roof hangar; ships remain on water and buildings outside. Pivot gizmos were replaced by an opt-in scale grid. The existing compact phone picker, plain stage and bottom sheet are retained at the mobile breakpoint. Handoff [`docs/handoff/2026-10-11-hangar-desktop-ui.md`](docs/handoff/2026-10-11-hangar-desktop-ui.md).

### Track A: First load and the launch sequence

Mark's items: the loading bar UI; choosing time of day with a suggestion;
render quality with auto-detect.

**A1. Loading screen (S). Done 2026-10-08** (`ca97a522`): the art shows alone with the strip at its foot; the memos slide in on ready. Handoff `docs/handoff/2026-10-08-order-1.md`.

**A2. Scenario switch loads that scenario's weather (S). Done 2026-10-08** (`7249619f`): hour, cloud deck and sea state follow the launched scenario, both directions (`clouds.md` #10 closed). Handoff as A1.

**A3. Time-of-day picker (S-M). Done 2026-10-09; moved to dedicated Flight Conditions Form 4 on 2026-10-11** (merge of `a3a4-launch`): the form offers Morning, Midday and Dusk (Mark's ruling), each hour from the sun model (0740, 1200 and 1645 at Leyte), with the one nearest the scenario's historical hour suggested. Handoff `docs/handoff/2026-10-09-a3-a4-launch.md`.
- **Today:** Flight Conditions owns takeoff time and cloudiness; Sortie Orders is reserved for mission or Training Ground selection. **There is no night lighting**, so night is a separate rendering plan if wanted.

**A4. Quality auto-detect that measures the right thing (M). Done 2026-10-09; superseded by A6.** The first implementation measured a short frame-rate sample and put a Render Quality choice on Form 4. Its useful lesson was that one tier without resolution is not a complete recommendation; A6 replaces its probe and UI.

**A5. Render scale in Settings (S, after H0 and A4). Done and merged 2026-10-10:** Settings gains a Render Scale row offering 50, 75 and 100% on top of the capped `devicePixelRatio`. It applies live, persists, and defaults to 100%; DEV `?renderScale=` still overrides. Verified on ryzen's GPU (`settingsUi.spec.ts`, canvas size at each scale). Handoff `docs/handoff/2026-10-10-a5-render-scale.md`.

**A6. Preflight graphics check and shared rendering settings (M). Done and merged 2026-10-11 (`2ac3cc6c`):** the first automatic visit measures six quality/scale profiles against actual WebGPU queue completion on the fully built title scene, then saves the highest profile that sustains 50 fps with p95 completion latency at or below 150 ms. The saved check is reused while adapter, browser major and pixel count remain comparable. The launch forms no longer own editable rendering controls: the separate administration memo summarizes the session-wide result and links to Settings. The pause dossier embeds the same settings implementation, limited to changes safe during a live sortie. Missing or software-only adapters now explain that the browser may be hiding a real GPU and give Chrome/Edge acceleration, diagnostics, driver, multi-GPU and managed-policy recovery steps. Ryzen RX 6700 XT at 2560×1440 recommended High/100%; nexus Radeon 680M at the same size recommended Medium/75%. Plan `docs/superpowers/plans/2026-10-11-preflight-graphics-check.md`; handoff `docs/handoff/2026-10-11-preflight-graphics-check.md`.

**A7. Main-menu and sortie-flow refresh (S). Done and merged 2026-10-11 (feature commit `9ebdc3e3`):** the roster starts a sortie from each pilot row beside Dossier, removing the disabled global New game state. The six-form flow separates Missions from Training Grounds, recommends Basic Flying, Torpedo Qualification and Carrier Qualification to new pilots, keeps Sortie Orders navigation at the top-right, and gives takeoff time and cloudiness their own Flight Conditions form. Briefing citations are named hyperlinks rather than visible raw URLs; aircraft figures spell out hit points and add total engine horsepower; About credits Mark Tuttle, Copyright (C) 2026, and links both the source repository and `marktuttle.dev`. Handoff `docs/handoff/2026-10-11-main-menu-sortie-refresh.md`.

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

**B2. Bomb and rocket impact predictor (M).** Done 2026-10-10 (merged to `main`, `npm run verify` green on the merge); plan [`2026-10-10-b2-impact-predictor.md`](docs/superpowers/plans/2026-10-10-b2-impact-predictor.md), handoff [`2026-10-10-b2-impact-predictor.md`](docs/handoff/2026-10-10-b2-impact-predictor.md).
- **Today:** `predictImpact` (`sim/weapons/impactPrediction.ts`) flies the sim's own bomb or rocket step to terrain or sea; the **Impact marker** (`U`) draws the result. Matches the real sim to 1 cm.
- **This is a period-incorrect aid** (no CCIP in 1944), so it is an Assist: off by default (§4 Q2). Torpedoes are not covered.

**B3. Navigation autopilot (M).** Done and merged 2026-10-10; plan [`2026-10-10-b3-pursuit-g-limit.md`](docs/superpowers/plans/2026-10-10-b3-pursuit-g-limit.md), handoff [`2026-10-10-b3-pursuit-g-limit.md`](docs/handoff/2026-10-10-b3-pursuit-g-limit.md).
- **Built:** Shift pulls at most 0.9 of each airframe's own `gLimit` (rudder included) and stops diving at 0.9 of its dive speed. The 13 g overshoot (13.55 g, F6F broken up) is now 6.78 g, structure intact; Damage Range taps unchanged (11 and 14 hits on the first two).
- **Scope decision (§4 Q5):** pursuit only, as g-limited lead pursuit onto a gun solution; the player still fires. Heading/altitude hold and waypoint modes are dropped.

**B4. Tutorial (M).** Done and merged 2026-10-10; plan [`2026-10-10-b4-tutorial.md`](docs/superpowers/plans/2026-10-10-b4-tutorial.md), handoff [`2026-10-10-b4-tutorial.md`](docs/handoff/2026-10-10-b4-tutorial.md).
- **Ruled (Mark, 2026-10-10):** Basic Flying is the default mission; the picker opens on it.
- **Shipped:** **Basic Flying** (`content/scenarios/tutorial.json`), first mission in the picker: ten chained objectives from full throttle to landing, an instructor's radio line on each step (text only, no recordings).
- **Engine gap closed:** the `state` objective and trigger (gear, flaps, bay doors, air-relative speed, altitude band, throttle). An Assist toggle cannot be one: the Impact marker is render state (B2 R7), so the tutorial only teaches `U`.

### Track C: The aircraft come alive

Mark's items: animated rudder, ailerons and flaps; bomb-bay doors; cockpits unique to each plane.

**C1. Control surfaces (M per batch). Complete 2026-10-08: all twelve airframes move their ailerons, elevators, rudders and flaps.**
- **Batch 1 done 2026-10-08:** the five Blender models (B-29, Ki-21, G4M, P-38, Ki-84) move ailerons, elevators, rudders and flaps, and the Hangar bench has roll, pitch and yaw sliders. Plan `docs/superpowers/plans/2026-10-08-c1-surfaces-batch1.md`; handoff `docs/handoff/2026-10-08-c1-surfaces-batch1.md`.
- **Batch 2 merged 2026-10-08:** the F6F, F4U and F4F. The F6F and F4U surfaces are cut out of their downloads; the F4F is unfrozen and its ailerons cut from the outer wing at the F4F-3's measured layout (Mark's ruling, 2026-10-08), with its inboard pieces static and split flaps drawn under them in `wildcat.ts`. Handoff `docs/handoff/2026-10-08-c1-surfaces-batch2.md`.
- **Batch 3 merged 2026-10-08:** the A6M2 and Ki-43. The Zero's surfaces are cut from its body. Its draw budget rises from 12 to 14, the least seven one-draw surfaces need. The Ki-43's download already models its ailerons, elevators and rudder as their own pieces; only its flaps are cut. Handoff `docs/handoff/2026-10-08-c1-surfaces-batch3.md`.
- **Batch 4 merged 2026-10-08** (`28028ea4`): the D3A and B-17. The D3A's ailerons, flaps and elevators are cut from its one-piece wing and tailplane, and its rudder is the download's own piece. The B-17's download models its ailerons, split flaps and rudder as pieces; only its elevators are cut. Each made room under its triangle limit by trimming hidden detail (Mark's ruling): the D3A's cockpit interior, and the B-17's interior shell and seat. Handoff `docs/handoff/2026-10-08-c1-surfaces-batch4.md`.
- **Blender fighter duplicates merged 2026-10-11:** original Hellcat, Corsair and Wildcat models sit beside their downloads in the
  Hangar. A photo-guided Hellcat follow-up replaces the rounded canopy with its steep windscreen and straight descending roof, with a
  dedicated close side capture for review. Handoff `docs/handoff/2026-10-11-blender-fighter-duplicates.md`.
- **External-aircraft Blender comparison set promoted and merged, 2026-10-11 (`23872091`):** A6M2, B-17G, D3A2 and Ki-43-IIb alternatives
  joined the Hellcat, Corsair and Wildcat alternatives under separate `*-blender` ids. After Mark's review, all seven Blender
  airframes were promoted for gameplay with drawing-fit stance, guns, combat zones, stores and pilot eyes. Their downloaded
  predecessors retain their original ids as `status: archived`, visible only in the Dev Hangar for comparison. Plan
  `docs/superpowers/plans/2026-10-11-fleet-blender-rebuild.md`; handoff `docs/handoff/2026-10-11-fleet-blender-rebuild.md`.
  The B-17G and D3A2 were re-measured the same day after Mark flagged the B-17's triangular fin: both first passes
  had misread their three-views (body, canopy, tail); handoff `docs/handoff/2026-10-11-b17-val-remeasure.md`.
  The other five duplicates and the M4 Sherman were re-measured the same way (`docs/handoff/2026-10-11-fleet-remeasure.md`).
  Promotion handoff: `docs/handoff/2026-10-11-promote-blender-duplicates.md`. Final verification passed 426 files / 6,237 tests
  with 11 intentional skips; the 25-test desktop/mobile Hangar run also passed. The promotion worktree and merged branch were removed.
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

**C4. Damage stages (M). Damage merged 2026-10-10; asymmetric engine-loss yaw completed 2026-10-11.**
- **Mark's report (2026-10-09):** a shot Zero froze in mid-air.
- **Now:** a hit engine smokes, sputters below half health, and stalls dead below 15%. At 25% structure the airframe catches fire and is doomed. AI pilots spiral down, and the fire burns it out in 15 s. At zero it explodes, its props and control surfaces break away, and the wreck falls to the surface.
- **Credit** waits for the explosion or the impact (Mark's ruling).
- Plan `docs/superpowers/plans/2026-10-09-aircraft-damage-stages.md`; handoff `docs/handoff/2026-10-09-aircraft-damage-stages.md`. Dev range: `?scenario=damage-range&launch`.
- **Round 2 (after Mark's flight, 2026-10-09):**
  - Fighters are 4x tougher: a Zero burns on its 24th .50 hit, 2–4 short bursts.
  - Smoke follows overall damage, grey to black before the fire.
  - The B-17 and B-29 (1,440 HP) and the G4M and Ki-21 (480) take hits, with each engine damaged on its own. Bomber range: `?scenario=bomber-range&launch`.
  - AI duels resolve 18 of 72, down from 27 (handoff table). A stalled AI now unloads before its floor pull.
  - On the merge (2026-10-10), D1's Kate and Avenger took the same 4x (Mark): 280 and 560 HP.
- **Asymmetric engine-loss yaw (2026-10-11):** multi-engine damage now carries each engine's output into flight. The existing rate-command model derives signed airborne yaw from measured engine-zone arms; outer losses have naturally more leverage, and rudder/auto-rudder/AI feedback can counter it. Yaw-control damage does not weaken the independent thrust effect; the combined rate remains capped at the healthy maximum. Healthy flight stays exact, while symmetric and single-engine output add no yaw bias. Plan `docs/superpowers/plans/2026-10-11-c4-asymmetric-engine-yaw.md`; handoff `docs/handoff/2026-10-11-c4-asymmetric-engine-yaw.md`.
- **Open:** whether the slower AI fights need AI gunnery work (Track E). Also Round 1's unattended rulings, e.g. hits on a burning airplane take nothing. Detailed windmilling drag, explicit AI engine-out trim, and ground/take-off yaw are deferred.

### Track V: Ground vehicles and ordnance models (S). Done 2026-10-11

- **V1** (plan `docs/superpowers/plans/2026-10-09-v1-ordnance-vehicles.md`, handoff `docs/handoff/2026-10-09-v1-ordnance-vehicles.md`): the Chi-Ha's turret trains and its gun elevates, its wheels and tread run; the jeep's wheels turn and steer, with a driver at the wheel. Render and Hangar only, in `src/render/scene/vehicleRig.ts`: no vehicle is in the sim yet, so neither moves in a scenario. Also the Mk 13 and Type 91 torpedo models (Track D) and the Type 98 No. 25 bomb, now the store of every Japanese bomber.
- **V2** (plan `docs/superpowers/plans/2026-10-11-v2-ground-vehicles.md`, handoff `docs/handoff/2026-10-11-v2-ground-vehicles.md`): scenario and held-group vehicles are deterministic sim entities that follow authored waypoint routes, stop at the end by default or loop, conform to terrain, take direct and blast damage, and remain as stopped wrecks. Tank Buster's six stationary, 48-HP Chi-Ha targets now use this one vehicle representation while preserving their authored positions, headings, tags and 300-point Tank score. The Gunnery Range includes an Axis Type 95 Kurogane scout car, an original Blender-built Japanese counterpart to the Willys MB. Player driving, pathfinding, suspension, avoidance, vehicle weapons and ground AI remain out of scope.

### Track D: Torpedoes (L)

- **Steps 1 and 2 done (D1, 2026-10-09):** the TBM-3 Avenger and the B5N2 Kate are onboarded (Blender-built, carrier-capable, flyable from the picker), and `torpedo` is a store kind: a drop envelope judged at release, a water entry, a straight run at depth, an arming run, and a hull hit for the store's damage (`combat.ts`, `tests/sim/weapons/torpedo.test.ts`). The G4M carries a Type 91. Plan `docs/superpowers/plans/2026-10-09-d1-torpedo-planes.md`; handoff `docs/handoff/2026-10-09-d1-torpedo-planes.md`. Step 3 and the sound done in D3 (below); step 4 stays open.
- **Step 3 and the sound done (D3, 2026-10-09):** a torpedo hit floods: the blow, then 0.6x the warhead drained over 60 s on the hit side, floods adding up, the ship listing toward the water and slowing (`src/sim/weapons/flooding.ts`, `tests/sim/weapons/flooding.test.ts`); bombs never flood. `torpedo_splash` and `torpedo_hit` play; torpedo airplanes say "Torpedo" in the loadout, legend, HUD and Hangar. Plan `docs/superpowers/plans/2026-10-09-d3-torpedo-flooding.md`; handoff `docs/handoff/2026-10-09-d3-torpedo-flooding.md`.
- **Before D1:** projectile `kind` was round, bomb or rocket. Ships have one `hullHp` pool and sink over 90 s, with no waterline or hit location.
- **Drawn already (V1, 2026-10-09):** the Mk 13 and Type 91 torpedo models (`content/ordnance/mk13.glb`, `type91.glb`, in the Library), with their suspension point at the origin like every store, so step 2 adds a store type and hangs them. M4's ship torpedoes reuse the same two models (Mark's ruling: simplicity over history). Plan `docs/superpowers/plans/2026-10-09-v1-ordnance-vehicles.md`; handoff `docs/handoff/2026-10-09-v1-ordnance-vehicles.md`.
- **Proposal, in order:**
  1. ~~**Airframe:** TBF/TBM Avenger (US, player-facing) via the onboarding process.~~ Done (D1), with the B5N2 Kate.
  2. ~~**Weapon:** a torpedo store~~ Done (D1): a torpedo store with drop envelope limits (speed and height at release, or it breaks or dives), a water entry, then a surface run at set speed and depth.
  3. ~~**Damage:** a waterline hit that does more than a bomb of equal weight.~~ Done (D3): flooding, Mark's pick over a multiplier.
  4. ~~**AI:** torpedo attack, so the enemy can use it too, from Track E.~~ Done (E2, 2026-10-10): `pilot.ingress.attack: "torpedo"` flies a low run inside the drop envelope with the Kate, Betty and Avenger; see Track E item 2.
  5. ~~**Sound.**~~ Done (D3): release reuses `bombs_away`; `torpedo_splash` plays at water entry, `torpedo_hit` at a hull hit.
- Midway and Pearl Harbor both want the B5N Kate on the Japanese side (§1 Track G): it exists since D1.

### Track E: Better AI (L)

Mark's item is "improved AI". In priority order, by what other tracks need:

1. **Gunnery honesty (M).** Lead on relative velocity, drop compensation and per-skill aim error. **This blocks almost every combat mission:** AI-vs-AI fights don't end in kills, and M4's interceptors can't shoot raiders down.
   - **Done 2026-10-09, merged to `main`** (veterans toned down and green strengthened per Mark's rulings the same day). Plan `docs/superpowers/plans/2026-10-09-e1-gunnery.md`; handoff `docs/handoff/2026-10-09-e1-gunnery.md`. AI duels now end in kills (26 of 72 duels, from 3); a straight-flying player survives a veteran a median 8 s; green rarely kills a maneuvering target.
2. **Attack behaviors (M):**
   - **Done 2026-10-10 (E2, merged to `main`):** `pilot.ingress.attack` is an opt-in order (`dive-bomb`, `torpedo`, `level-bomb`); absent, a raider orbits as before. Dive-bombing, torpedo runs and level bombing of a ship or a strip are flown and calibrated (green hits less than veteran). No shipped mission uses the order yet. There is no kamikaze run: Mark dropped it 2026-10-10 (no AI flies into a ship on purpose; see the struck item below). Plan `docs/superpowers/plans/2026-10-10-e2-attack-ai.md`; handoff `docs/handoff/2026-10-10-e2-attack-ai.md`; test bed: the Dev scenario `attack-range`.
   - ~~**Dive-bombing** first, as the D3A exists and bombs already work.~~
   - ~~**Torpedo runs** after Track D.~~
   - **Air-to-ship collision (2026-10-10):** an airplane that collides with a ship is destroyed and the ship loses hull points (`src/sim/shipCollision.ts`; handoff `docs/handoff/2026-10-10-ship-collision.md`).
   - ~~**Kamikaze**, for the "Kamikaze Watch" mission.~~ **Dropped for now (Mark, 2026-10-10): no AI flies into a ship on purpose.** The first attempt is parked on branch `ship-collision-kamikaze-wip`. An airplane that hits a ship by accident is destroyed and damages it all the same (the collision rule, `src/sim/shipCollision.ts`).
   - ~~Raiders that actually attack instead of orbiting.~~
3. **Bombers and turrets (M-L):** bomber AI (formation level bombing), then defensive gunners. The turrets already aim, visually (turret aim, `docs/handoff/2026-10-09-turret-aim.md`), and so do the nose, cheek and tail guns (flex guns, `docs/handoff/2026-10-09-flex-guns.md`): gunners add firing.
   - **Done 2026-10-10, merged to `main` (15390826), reference-GPU verified.** Bombers fly formation (E2's `level-bomb` leader drops a train, wingmen drop with it); every turret and flexible gun fires (`src/sim/weapons/gunners.ts`), tuned to Mark's "noticeable, not deadly" with measured tables; the Bomber Range is a formation that shoots back. Plan `docs/superpowers/plans/2026-10-10-e3-bombers-gunners.md`; handoff `docs/handoff/2026-10-10-e3-bombers-gunners.md`.
   - **Formation turns (E3 open item 1): done, merged 2026-10-10.** A bomber formation leader turns at no more than 20 degrees of bank, so inside wingmen keep flying speed through a waypoint turn (before: 83 degrees, a Ki-21 wingman at 33 m/s). Handoff `docs/handoff/2026-10-10-escort-mission.md`.
4. **Fixes:**
   - ~~escort pursuit (7f §4.2)~~ done, merged 2026-10-10: a wingman pursues a hostile attacking its leader whatever the energy, and `formationCover.test.ts` asserts it fires within gun solution (decision 11). Handoff `docs/handoff/2026-10-10-escort-mission.md`;
   - ~~wingman commands (7f §4.5)~~ **Done, merged 2026-10-10 (E4):** `1` Attack, `2` Cover me, `3` Form up, with text-only radio answers.
   - ~~the 7c list (no stall guard, 70° bank cap, 20 s latch cap)~~ **Done, merged (E4):** an angle-of-attack and stall-speed guard on every AI, lift-vector lead pursuit for the veteran against a turning target, a 40 s attack-run latch. The E1 duels resolve 36 of 72, from 18; the Escort mission's unescorted Zeros still down 2-4 B-17s.
   - ~~`disengageThreshold` unread (7b)~~ **Deleted (E4):** `energyDiscipline` already is the energy disengage.
   - E4: plan `docs/superpowers/plans/2026-10-10-e4-ai-fixes.md`; handoff `docs/handoff/2026-10-10-e4-ai-fixes.md`.

### Track F: Missions and a campaign (M then L)

- **Today:**
  - 12 missions and 6 ranges ship on `main` (counted in `SCENARIO_OPTIONS` 2026-10-11).
  - A new mission is a JSON file, one `SCENARIO_OPTIONS` row and one `RIBBONS` design (`src/render/insignia.ts`; `tests/render/insignia.test.ts` fails without it), unless it needs a new objective kind, AI behavior or model.
  - **Ribbons and rank insignia done 2026-10-10:** an invented ribbon per mission badge and the 1944 USN collar device per rank, in the Dossier, debrief, roster and mission picker (GAMEPLAY.md, "Badges").
  - **F2 done 2026-10-09:** Single Combat and Scramble (plan `docs/superpowers/plans/2026-10-09-f2-single-combat-scramble.md`, handoff `docs/handoff/2026-10-09-f2-single-combat-scramble.md`).
  - **Flattop Hunt done 2026-10-10:** a TBM strike on Zuikaku with three E2 AI torpedo attackers, a destroyer-screen secondary and recovery aboard Essex (plan `docs/superpowers/plans/2026-10-10-flattop-hunt.md`, handoff `docs/handoff/2026-10-10-flattop-hunt.md`).
  - **Escort done 2026-10-10 (merged):** the player's Hellcat escorts four B-17s to Dulag's hangars against four Zeros; the badge needs three bombers left, a hangar down and a landing (plan `docs/superpowers/plans/2026-10-10-escort-mission.md`, handoff `docs/handoff/2026-10-10-escort-mission.md`).
  - **Surigao Strait done and merged 2026-10-11 (`a8c01fd2`):** at dawn, a bomb-and-rocket F6F pursues *Mogami* while Oldendorf's battle line engages a representative rear guard; recovery is aboard a staged Essex (plan `docs/superpowers/plans/2026-10-11-surigao-strait-mission.md`, handoff `docs/handoff/2026-10-11-surigao-strait-mission.md`).
  - **Tank Buster done 2026-10-11:** a Hellcat attacks six stationary Japanese tanks southwest of Dulag; four kills plus recovery earn the badge, all six the secondary objective. The Chi-Ha is an explicit stand-in for the Type 89/Type 95 tanks better documented on Leyte. Handoff `docs/handoff/2026-10-11-tank-buster-mission.md`; its targets now use Track V's single `World.vehicles` representation.
  - **Torpedo Qualification and USS Crow done and merged 2026-10-11 (`001a5a9d`):** the Avenger takes off from Tacloban, follows an instructor-led low-level run, releases one Mk 13 at the stationary practice ship USS *Crow* (AMc-20), secures the bay and recovers. A hit or miss completes the practice attack; Crow's scenario-only practice-target flag prevents damage and flooding. Crow is an original Blender-built, unarmed ship model.
  - **Carrier Qualification guidance improved and merged 2026-10-11 (feature commit `16899e0a`):** takeoff cleanup is coached after every launch; the recovery objective leads to a moving lineup point astern on the real glideslope, shows the F6F's 97 mph approach speed and 500 ft entry altitude, then switches to the trap zone on final. Paddles' speed calls no longer prescribe throttle changes they cannot infer. Handoff `docs/handoff/2026-10-11-carrier-qualification-guidance.md`.
  - One more mission is designed in GAMEPLAY.md and not built: Kamikaze Watch (deferred: it needs the dropped kamikaze run).
- **Each mission's dependency:**

  | Mission | Needs |
  | --- | --- |
  | ~~Single Combat~~ | done 2026-10-09 (F2) |
  | ~~Scramble~~ | done 2026-10-09 (F2) |
  | ~~Escort~~ | done 2026-10-10 |
  | Kamikaze Watch | deferred: needs an intentional kamikaze run, which Mark dropped 2026-10-10 |
  | ~~Flattop Hunt~~ | done 2026-10-10: Japanese carrier, D torpedoes/flooding and E2 attack AI |
  | ~~Surigao Strait~~ (dawn aftermath, 25 Oct 1944: the battle line finishes the column, aircraft pursue Mogami) | done and merged 2026-10-11 (`a8c01fd2`); uses M2-M4 and first light stays inside the §3 no-night rule |
  | ~~Tank Buster~~ | done 2026-10-11; Track V vehicles, stationary 48-HP Chi-Ha targets and carrier recovery |
  | ~~Torpedo Qualification~~ | done and merged 2026-10-11 (`001a5a9d`); D torpedoes/flooding, instructor state objectives and USS Crow's practice-target seam |

- **Campaign by day** (missions spec §6.2): needs per-day airfield ownership plus the above. Build it after the missions, not before.

### Track G: Other theaters (L, after F)

- **Today:** single-world, with Leyte hardcoded:
  - `WORLD_CENTRE` is a module constant (`sim/world/projection.ts:7`).
  - Terrain, land-cover, ocean, river and places headers are static JSON imports.
  - The sun's date is the constant `SCENARIO_DAY_OF_YEAR` (`sky/sun.ts:11`).
  - Bases and routes are local coordinates.
  - Leyte's data is about 171 MB (L0 134 MB in LFS; 37 MB gzipped since L1.1a).
- **G1, the world abstraction (M):** a world id on scenarios, runtime-loaded headers, a per-world data directory and build, a per-world center and date, and a theater picker upstream of mission selection in the launch flow. Leyte keeps working unchanged, verified by the existing suite.
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
- **Before H0:** the 2026-10-03 E2E run had 13 frame-time reds. Seven became budget work when correctness and budget tests were separated: six `budget4k` views and `motionBudget`. The `photo` view at High had only 0.6 ms of margin.
- **Planned work:** one profiling plan on the reference GPU (under `hwlock ryzen`) to buy headroom first and re-baseline what remained with Mark's ruling, so Tracks K and L had a budget to spend.
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
- **Done 2026-10-10, Mark's rulings applied** (handoff `docs/handoff/2026-10-08-h0-render-budget.md`, "Rulings and the as-merged result"): the cloud-edge re-march skip is the default, so every High view clears 8.33 ms at 1440p; in-deck-1900 has its own 10.0 ms gate (9.51 ms measured); terrainTextures' runway keeps 9.0 ms. Every view but in-deck is inside the 7.5 ms margin (worst: deckquals 7.01 ms).

**Entity scaling (measured 2026-10-11):** about 5 to 10 extra aircraft fit the original 120 Hz bar, not 30; the main thread's draw calls and, in a furball, the sim's bullet contact test bound first. Handoff `docs/handoff/2026-10-10-entity-scaling.md` (ranked fixes inside). **Projectile-contact broad phase and aircraft far LOD done and merged 2026-10-11 (`0ca520d9`):** conservative swept-sphere rejection and allocation-free nearest selection cut the measured tight 30-aircraft sim mean 82% (5.56 -> 1.01 ms/tick) and tight 60 + 20 mean 81% (22.94 -> 4.32 ms/tick), without changing the exact narrow phase or deterministic outcomes. Intact aircraft beyond 0.75 mi share a one-draw, vertex-colored silhouette per model; full articulation returns inside 0.62 mi and damage always forces it. Mission-60 calls fell 75% (1,741 -> 437) and tight-60 calls 41% (1,745 -> 1,025) in the frozen nexus-GPU A/B; the indexed shared proxies added about 9 MB at mission 60. Follow-ups: `docs/handoff/2026-10-11-entity-contact-broadphase.md` and `docs/handoff/2026-10-11-aircraft-draw-call-lod.md`. The next ranked scaling work is ship draw-call reduction, then dense-furball effects; remeasure the new combined ceiling before beginning either.

### Track K: Clouds (size L)

Clouds have needed attempt after attempt, recorded in `docs/clouds.md` with
the technical history and traps. Its §6 order predates the Takram promotion;
the current status and remaining order are recorded here.

H0's margin was met 2026-10-10 (every High view inside 7.5 ms but in-deck-1900, which has its own 10.0 ms gate), so cloud features can land; each still answers to `budget.spec.ts`. Expect a plan per step, not
one plan for the lot.

**Current status — TSL is the default, 2026-10-11:** after Mark's "pretty
good" flight verdict and the edge-history fix (`docs/clouds.md` §1.2),
`takram-tsl` is the default renderer on `main` in both DEV and production
builds. DEV can still select `legacy` or the native-WGSL `takram` path by
query. Form 2 rolls an equally likely Sunny, Partly Cloudy, Cloudy or Overcast
initial selection which the player may change; it adjusts combined cumulus
coverage while preserving scenario cloud geometry and cirrus. No deployment
followed from this work.

**Integration evidence:** the native-WGSL port was first accepted and merged
opt-in (`2eff2943`), with rejected Blender/spike history left out and the
production shader made self-contained. The full TSL port then merged at
`1c654889`; R8 volume textures and conditional explicit-LOD weather fetches cut
its march p95 by 45–46%. Two locked RX 6700 XT runs at 2560×1440 High measured
whole-frame p95 at 5.746–5.772 ms, versus 5.890–5.915 ms estimated for native
WGSL, inside both the 8.33 ms gate and the plan's 15% promotion criterion.
Handoffs: `docs/handoff/2026-10-11-k-clouds-v3-main-integration-testing.md`
and `docs/handoff/2026-10-11-k-clouds-v3-tsl-port.md`.

**Full TSL experiment complete, optimized and merged opt-in, 2026-10-11:**
Main commit `1c654889` merges the accepted `54fd91f7` state of
`clouds-v3-tsl-port`, which implements the same Takram-derived renderer entirely in
Three Shader Language behind DEV-only `?cloudRenderer=takram-tsl`; the native
WGSL `takram` path and all defaults are unchanged. Matched below-, in-, and
above-deck captures are visually equivalent, and the focused Ryzen/WebGPU
flight test is clean. R8 volume textures and conditional explicit-LOD weather
fetches cut the TSL march p95 by 45–46%. Two locked 1440p High runs measured
optimized TSL whole-frame p95 at 5.746–5.772 ms versus same-scene native
estimates of 5.890–5.915 ms, passing both the 8.33 ms game gate and the plan's
15% promotion criterion. It remains an opt-in research path; legacy is still
the default, and no deployment or preferred-renderer decision follows from the
merge. The rejected adaptive-sampling follow-up remains preserved separately.
**Promoted 2026-10-11 (Mark):** after the edge-history fix (`docs/clouds.md` §1.2),
`takram-tsl` is the default renderer on `main` in DEV and production; `legacy` and
`takram` stay selectable by query in DEV.
Flight Conditions now also rolls an equally likely Sunny, Partly Cloudy,
Cloudy or Overcast initial selection, which the player may change; it sets combined cumulus
coverage while preserving scenario cloud geometry and cirrus. Handoff:
`docs/handoff/2026-10-11-k-clouds-v3-tsl-port.md`.

**Open, in order:**

1. Re-measure High in-cloud p50/p95/p99 pacing on the default TSL renderer.
2. Re-test the former Low-only edge shimmer on the default path before carrying
   a legacy-renderer fix forward.
3. Add the deferred thunderhead/multi-layer work and cirrus shadows, one
   budgeted plan at a time.
4. Sit with Mark for the fixed-capture look pass: cloudiness from below,
   shadow darkness, ocean shadowing at dusk, and crimson dusk clouds. The
   accepted soft dense center and slight thin-wisp breakup are not unattended
   tuning targets.

### Track L: Terrain (size L)

**L1. Land (M-L).**
1. On-demand terrain level allocation, then the default Asset Quality moves to `medium`. This is Mark's 2026-09-27 ruling, deferred, and the single biggest visible change for a first-time player. **Merged 2026-10-10, not deployed:** L0 is held as a window around the camera, and the first-visit default is Medium. At Medium the GPU process now uses what it does at Low (1.04 GB, down from 1.32), and every 1440p High budget view passes. L1.1a below reduces the first-visit terrain download to 49.5 MB; deploying is Mark's call. Mark kept the headless suite on L1 (handoff, rulings). Handoff `docs/handoff/2026-10-10-l1-1-terrain-on-demand.md`.
1a. **Terrain compression complete, merged 2026-10-10; not deployed.** Every level ships as `L<n>.bin.gz` (gzip level 9, following `cover.bin.gz`); a Medium first visit fetches 49.5 MB of terrain instead of 179.0 MB, Low 12.8 MB instead of 44.8 MB. Inflated samples are unchanged. The build excludes obsolete raw levels left in caches. Handoff `docs/handoff/2026-10-10-l1-1a-compress-terrain.md`.
2. **Real tree crowns remain open.** The seven-cluster/four-branch pass on `l1-l2-visuals` was rejected and reverted after review on 2026-10-11: branches initially protruded through the canopy, and the bounded fix still measured 3.678 ms versus 3.350 ms p95 for the exact legacy tree (+0.328 ms, +9.8%) in the locked dense-jungle view. The original three-lobe crown and single trunk remain.
3. **Building textures complete and merged 2026-10-11.** Six mipmapped KTX2 textures from three pinned CC0 Poly Haven materials add corrugated steel, timber and concrete albedo/normal detail. Building geometry and batches are unchanged; load failure keeps the procedural materials. Leaf and bark textures were removed with the rejected tree pass. Plan and handoff: `docs/superpowers/plans/2026-10-11-l1-tree-building-materials.md`, `docs/handoff/2026-10-11-l1-l2-visuals.md`.

**L2. Beach and shore (M).**
- **Smooth border complete 2026-10-09:** a deterministic Blender-built render
  ribbon traces and smooths the committed L1 zero contour, overlaps the square
  terrain edge, and tapers from vegetation-colored inner sand through dry/wet
  sand to a submerged, feathered surf edge.  The DEM and all physics remain
  unchanged.  The 11.4 MB tiled GLB rebuilds byte-identically and uses two
  shared runtime roles.  [Design](docs/superpowers/specs/2026-10-09-curved-beaches-design.md),
  [plan](docs/superpowers/plans/2026-10-09-curved-beaches.md),
  [handoff](docs/handoff/2026-10-09-curved-beaches.md).
- **Animated surf complete and merged 2026-10-11:** the existing `ShoreSurf` draw now carries shallow-water
  color, two shoreward breaker crests, broken foam and backwash. It uses the
  simulation clock, so Pause freezes it, and adds no geometry or draw. DEV
  `?shoreFx=off` restores the static material for exact A/B. Design, plan and
  handoff: `docs/superpowers/specs/2026-10-11-l2-water-effects-design.md`,
  `docs/superpowers/plans/2026-10-11-l2-water-effects.md`,
  `docs/handoff/2026-10-11-l1-l2-visuals.md`.

### Track I: Sound (M, two plans)

- **Today (counted from `src/audio/assets.ts` 2026-10-10, after M2):** 29 of the 31 clips in `AUDIO_ASSETS` are wired, plus the 76 voice lines. Unwired: `engine_radial_small` (on purpose); `ship_gun_heavy` was wired by M4 (2026-10-10).
- **Quick win: done 2026-10-08** (`fe0eaffe`): `engine_radial_big` for the ~2,000 hp radials (F6F, F4U, Ki-84), a fourth family keyed by aircraft id. Smaller radials keep `propeller.wav` (Mark, 2026-09-29), so `engine_radial_small` stays unwired on purpose.
- **I1, synthesized mechanicals. Done 2026-10-09** (branch `i1-synth-sounds`, plan `docs/superpowers/plans/2026-10-09-i1-synth-sounds.md`, handoff `docs/handoff/2026-10-09-i1-synth-sounds.md`):
  - All of these are made in code at load (`synth.ts` `SYNTH_CLIPS`): wind (airspeed), wheel rumble (land or deck), stall buffet and buzzer (angle of attack, below), overspeed creak (the spec's dive limit), and radio static under each transmission.
  - Max gains are tuning values in `mix.ts` `SYNTH_GAIN_MAX`, not yet heard in flight.
  - **Decided (Mark, 2026-10-09):**
    - Grass shares the land rumble, because `ContactSurface` has no grass.
    - The stall cues read angle of attack, as the share of the wing's maximum lift in use, so a hard pull buffets early. Merged 2026-10-09 (`99b73ece`); at 1 g the onsets are unchanged (1.15 and 1.07 × stall speed).
    - Wind stays muffled in the cockpit.
- **I2, voice (§4 Q7):**
  - **Recorded 2026-10-09** with ElevenLabs instead of Firefly: all 76 lines of `docs/audio/firefly-prompt-sheet.md` (38 cues, US voice "Clyde", JA voice "Adam") are in `content/audio/voice/`, with the real `rocket_whoosh.wav`. Provenance is in `content/audio/NOTICE.md`; `tests/audio/voice.test.ts` checks every sheet line is present, mono 48 kHz and unclipped. The takes and the five-voice audition are on `sounds.html` (Dev checkbox), from nexus's gitignored `content/audio/candidates/`.
  - **Wired 2026-10-09** (branch `i2-voice-wiring`, plan `docs/superpowers/plans/2026-10-09-i2-voice-wiring.md`):
    - The HUD radio line and the LSO's cue speak through the radio bus as squelch, voice, squelch.
    - One transmission plays at a time; cut and wave-off cut in.
    - The lines are not in `AUDIO_ASSETS`: they load per language on first use. Japanese plays for a Japanese airframe or the axis side.
    - `src/audio/radio.ts` maps message text to line, and its test enrolls every scenario message.
- **I3, recorded effects (Mark, 2026-10-09):** prompts in `docs/audio/firefly-prompt-sheet.md`, ElevenLabs takes on `sounds.html`.
  - **Wired 2026-10-09:** `gear_cycle` and `flaps_cycle`, once as travel starts, both ways.
  - **Wired since:** `torpedo_splash` and `torpedo_hit` (D3, 2026-10-09; a torpedo's release reuses `bombs_away`), `flak_burst` (the close burst) and `aa_gun` (a 20 mm loop, every AA gun, ship and ground) with M2 (2026-10-10). `rocket_whoosh` is now take 2 (wired). `radio_squelch` (Freesound CC0) is wired: it brackets each radio line (I2).
  - `torpedo_hit` is Mark's own Firefly clip.
  - `ship_gun_heavy` (the deepest 5-inch take, for main batteries; wired by M4, 2026-10-10).
  - **Staged:** the 40 mm and other 5-inch takes stay on `sounds.html` as alternatives.
- **Both:** an ear-tuning pass with Mark, and the E2E runs 15b and 15c never got.

### Track J: Google Analytics (S). Done 2026-10-08

`0fe24aab`: GA4 property 558194335 (`G-3VE6LD7RCS`). The tag is in the production build only and loads only on `ww2airsim.com` and `ww2airsim.marktuttle.dev`. The events are `sortie_launched`, `mission_outcome`, `quality_tier` (detected against chosen, for A4) and `boot_ready`. There is a privacy line in the About memo. Deployed 2026-10-08 (run 37852717790); the page source on both production hosts carries the tag, and windomlane does not (curl, same day). Handoff `docs/handoff/2026-10-08-order-1.md`.


### Track M: Ships (L)

Mark's items (2026-10-08): better ship models, turrets that work and fire, and AA on every warship.
- **Current state (2026-10-11):**
  - 12 gameplay ship classes, eight of them original Blender models. Original Fletcher, Shiratsuyu and Zuikaku candidates also sit beside their external gameplay models in the Hangar under display-only `-blender` ids.
  - Every warship's main and AA batteries are authored as separate trainable mounts; merchants remain unarmed.
  - Ship and ground AA fire at hostile aircraft. Scenario-enabled main batteries fire at hostile ships or standing structures, with real shells, mount knock-out, muzzle effects and sound.
  - Ships retain one `hullHp` pool, augmented by torpedo flooding and visible list/slowdown (Track D); detailed compartment and waterline simulation remains out of scope.
- **Decided (Mark, 2026-10-08), in order:**
  1. ~~**M1 Models (M-L).**~~ Done 2026-10-08 (branch `m1-ship-models`, handoff `docs/handoff/2026-10-08-m1-ship-models.md`): every warship's guns are spec data and instanced, trainable kits; the three Blender ships got a detail and paint pass.
     - Our three Blender ships gain detail, silhouette, paint and textures.
     - Each download is split in Blender where its mesh allows; otherwise it is rebuilt as our own model.
     - Every warship ends with separate turret and AA-mount nodes, with AA added where a model has none.
     - Merchants (the Maru) get no guns.
     - **M1b (done 2026-10-09,** merge `e66b78a9`, handoff `docs/handoff/2026-10-09-m1b-aa-mounts.md`): Mark couldn't see the AA, so light AA is now generated at 1.3x with shields and dark barrels, every 20 mm and 25 mm gallery draws each gun, and every mount's guns elevate (Hangar Train mounts sweep).
     - **M1c (done 2026-10-09,** merge `83e23729`, handoff `docs/handoff/2026-10-09-m1c-ship-detail.md`): our three Blender ships gain railings, rigging, rounded deckhouses and a committed high-poly bake (AO and detail normals, Cycles on Ryzen's GPU), with deck planks or linoleum and porthole rust. Budgets unchanged.
     - **M1d (done 2026-10-09,** merge `3265b8e7`, handoff `docs/handoff/2026-10-09-m1d-download-detail.md`): five of the six downloaded warships (Yamato, Mogami, Cleveland, Essex, Fletcher) get M1c's baked AO and detail and the same weathering, through a non-overlapping island atlas built in the TS pipeline. Shiratsuyu keeps its author's textures, which read better than the skin did. Essex's light AA is cut to four 40 mm quads, two per side (Mark: balance, not history). Budgets unchanged.
     - **M1e (done 2026-10-09,** merge `74c33b60`, handoff `docs/handoff/2026-10-09-m1e-zuikaku.md`): the first Japanese carrier, Zuikaku as at Leyte, from KTKloss's Shōkaku (CC BY 4.0). She is armed to match Essex (eight twin 12.7 cm and four triple 25 mm; Mark: balance, not history), camouflaged, baked like M1d, and landable: every carrier now runs the arcade trap tests.
     - **M1f (done 2026-10-09,** handoff `docs/handoff/2026-10-09-m1f-ship-rebuilds.md`): Mogami, Yamato, Cleveland and Essex are rebuilt in Blender to Fletcher's level (stepped bridges with framed windows, real funnels, railings, rigging, baked detail), replacing their downloads; Abukuma (Nagara class, Surigao Strait) is added; every warship flies its waving ensign and the Maru flies none; Shiratsuyu measured right at 107.5 m.
     - **Blender warship comparisons merged 2026-10-11:** original Fletcher, Shiratsuyu and Zuikaku models sit beside their external gameplay models in the Hangar under stable `-blender` asset ids. Their borrowed specifications drive the same trainable/elevating gun mounts without enrolling the candidates in missions. The Type B Maru/Liberty ship was deliberately excluded. Handoff `docs/handoff/2026-10-11-ship-blender-comparisons-integration.md`.
  2. ~~**M2 AA fire (M).**~~ Done 2026-10-10 (merged to `main`; plan `docs/superpowers/plans/2026-10-10-m2-aa-fire.md`, handoff `docs/handoff/2026-10-10-m2-aa-fire.md`). Ships and ground AAA share one system (`src/sim/weapons/aaFire.ts`, every number in `AA_TUNING`):
     - heavy guns throw timed flak bursts at altitude;
     - light guns fire tracer rounds through the existing ballistics at close range;
     - both sides fire, under the friendly-fire rules;
     - the default is Moderate, measured and pinned: lingering at 300 ft over a destroyer costs a Hellcat in about 20 s, a fast straight pass usually survives.
     - Builds on E1's lead and aim error. `aa_gun` and `flak_burst` (Track I, I3) are wired; the Dev scenario `aa-range` is the test bed. M3 now trains every drawn mount onto the same target and nominal lead.
  3. **M3 Gun-laying AI (M). Done and merged 2026-10-10** ( plan `docs/superpowers/plans/2026-10-10-m3-gun-laying-ai.md`, handoff `docs/handoff/2026-10-10-m3-gun-laying-ai.md`). Every AA mount selects a hostile aircraft, trains and elevates on the same ballistic lead M2 fires at; light-AA gallery poses fan out to every drawn barrel mount. Main turrets select the nearest hostile live ship, then a standing hostile structure, and lay visually without firing. The bounded pose/target contract is M4's firing seam; M3 does not create a main-battery projectile, sound or hull damage.
  4. **M4 Main batteries (M-L).** Ship against ship and against ground targets. The firing sound is `ship_gun_heavy` (Track I, I3).
     - Shells take `hullHp`, and a hit near a turret or AA mount can knock it out.
     - Waterline damage and flooding stay with Track D.
     - **Done and merged 2026-10-10** (plan `docs/superpowers/plans/2026-10-10-m4-main-batteries.md`, handoff `docs/handoff/2026-10-10-m4-main-batteries.md`). Real shells on M3's targets, damage by shell weight, mount knock-out, muzzle flash and smoke, `ship_gun_heavy`; on only where a scenario says `"mainBatteries": true`. Item 6's test range is the Dev scenario `gunnery-duel`. Duel tables in the handoff.
  5. **M5 Global difficulty (S-M).** A Settings option that scales AA accuracy, AI pilot skill and the damage the player's aircraft takes. Scenario `skill` values stay as the baseline it shifts.
     - **Done and merged 2026-10-10** ( plan `docs/superpowers/plans/2026-10-10-m5-difficulty.md`, handoff `docs/handoff/2026-10-10-m5-difficulty.md`). Recruit / Veteran / Ace in the Settings dialog, Veteran the default and today's game exactly; applied at launch (`src/sim/difficulty.ts`), measured and pinned (`tests/sim/difficultyLethality.test.ts`).
  6. **Content.** The test range is `gunnery-duel`; Surigao Strait is done and merged (`a8c01fd2`, 2026-10-11) and uses M2-M4 in its representative battle-line action (Track F).

---

**L3. Land render quality (size M; measured and prototyped 2026-10-09 to 10, dev-only).**
Mark's bar: a plausible ground that looks as good as OpenSkyFlight; accuracy is not a goal.
[Plan](docs/superpowers/plans/2026-10-09-l3-land-quality.md).
- **Measured, nothing to do:** the DEM is not the weak link, and rivers and roads as ribbons were
  already tried and gave no gain ([terrain.md](docs/terrain.md), [drape.md](docs/drape.md)).
  What OpenSkyFlight has that ours lacks is built-up places, muted varied tone and fine grain
  ([Phase 0b](docs/handoff/2026-10-09-l3-phase0b.md)).
- **Prototype, DEV only:** `?drape=synth2` (muted tone, drift, grain) and `?villages=on` (about 54
  invented villages of 3D nipa-style huts, trees cleared around them). The shipping game is unchanged.
  [Handoff](docs/handoff/2026-10-10-l3-phase2.md).
- **Open:** Mark's call on shipping either as a tier. The hut colors read too orange. Tacloban and Basey
  still use the old Quonset ring. A Blender top-down render of real tree crowns for forest grain is not
  built. On 2026-10-10 L3 read its own 6,000 ft view at about 10 ms p95 on shipping terrain, before H0's
  rulings landed; H0's `high-6000` budget view now reads 6.20 ms (H0 handoff), and L3's view has not been
  re-measured since. Re-measure it before clearing either prototype against the budget.

### Track N: Dev tools (S). Done 2026-10-10

**N1. God mode and the Range Test.** [Plan](docs/superpowers/plans/2026-10-10-god-mode-range-test.md),
[handoff](docs/handoff/2026-10-10-range-test-god-mode.md).
- **God mode** (a checkbox beside Dev, only while Dev is on): the player cannot be damaged, fuel, ammo,
  bombs, torpedoes and rockets never run out, and a crash bounces the airplane back up.
- **Range Test (dev):** take off from Tacloban; every enemy airplane circles overhead as a sitting duck
  and every enemy ship is anchored nearby, plus a cargo ship; the enemy follows the side of the airplane
  chosen.
- **Open:** damage, smoke and sinking were proven in the sim but not captured in the browser; a true
  neutral side (the cargo ship is "always a legal target" instead) is not built.

## 2. Proposed order

Tracks with no dependency between them run in parallel worktrees, as the
first pass did. Each order number marks a step where every earlier step's
prerequisites are met.

| Order | Work | Why here |
| --- | --- | --- |
| 1 | ~~A1; A2; I quick win (radial engines); J~~ done 2026-10-08 | Days of work, all visible, no dependencies. Track 0 is done |
| 2 | ~~A3; A4; B1; M1 ship models~~ done by 2026-10-09 | Fixed what every player sees first; M1 ran independently as asset work |
| 3 | ~~E1 gunnery honesty; H0 budget~~ done 2026-10-09 and 2026-10-10 | E1 unblocks most missions; H0 unblocks Tracks K and L |
| 4 | ~~A5 render scale; B2; B4 tutorial; C1 control surfaces; I1; I2 voice; M2 AA fire; B3; M3 gun-laying AI; M5 difficulty~~ done by 2026-10-10 | Player experience; C1 and I1 share the flap and gear motion |
| 5 | ~~F missions that were unblocked (Single Combat, Scramble)~~ done 2026-10-09 (F2); ~~L1 terrain allocation and compression~~ done 2026-10-10 (L1.1, L1.1a); ~~L1 building materials~~ done 2026-10-11; **open:** real crowns/leaf/bark after the rejected costlier pass, and default-TSL in-cloud pacing | |
| 6 | ~~E2 attack AI; C2 bomb bays; E3 bombers and turrets~~ done; ~~F Escort~~ done 2026-10-10 (Kamikaze Watch is deferred) | Bays and bomber AI meet in Escort |
| 7 | ~~D torpedoes (Avenger); M4 main batteries; F Surigao Strait~~ done by 2026-10-11; ~~K default renderer, L2 smooth shore, and L2 animated surf/shallow water~~ done; **open:** K's remaining visual steps | |
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
