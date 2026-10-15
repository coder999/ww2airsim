# F6A Night Renderer and Light Contract — plan

**Date:** 2026-10-14
**Branch/worktree:** `plan-f6a-night` / `/home/mark/projects/ww2airsim-plan-f6a-night` (from `main`)
**Plan 9 of 22** in the F3 dependency table (`docs/superpowers/specs/2026-10-14-leyte-campaign-definition.md` §11). F6B (visibility, AI perception, rank-gated sights) is plan 10 and consumes the contract in §3.
**Status:** plan only. Nothing is implemented.
**Run mode:** attended (Mark, 2026-10-14). Stop at each checkpoint below, send the windomlane URL and captures, and wait for him.
**Viewing checkpoints (Mark, 2026-10-14): intermediate steps plus the final result.**
- **CP1, after Task 4:** first light kinds rendering on the test range (flare pot, nav light, harbor light, searchlight beam, parachute flare) at the night sun.
- **CP2, after Task 8:** aircraft nav lights and cockpit instrument dimming in a night sortie.
- **CP3, final (Task 12):** representative night scenes (A4 anchorage, J4 bay, J5 field) at the three budget views.
- Mark's viewing is a checkpoint, never a test gate (AGENTS.md). Nothing below waits on him to decide pass or fail.

## 1. Goal

Make night playable and cheap, then freeze the interface F6B needs. Concretely:

1. A readable night: a fixed "movie night" floor (a blue night that is never black, Mark D3), a fixed half-bright waning moon, stars, and a night exposure that is not "dusk forever", plus a sea/terrain/cloud look that does not break when the sun is far below the horizon. Dusk (J5) and deep night (A4/J4) stay distinguishable.
2. A **light system** with five kinds (searchlight, runway/anchorage pot, fixed harbor/nav fixture, aircraft nav light, parachute flare) plus emissive fire/tracer glow, under hard caps that fit the 1440p High 8.33 ms gate.
3. A **light contract** (§3): a pure data shape and query API that F6B reads for "how visible is X at night" without touching the renderer.
4. Cockpit instrument lighting (dimmable), per GAMEPLAY.md "Night, bailout, world state, and scenes".

Out of scope: AI perception, rank-gated bombsight/torpedosight, mission scripting, base layouts (F8), scene framework (F9). Those are F6B, F8, F9. The Leyte lights' historical state is a F3 decision already made; F6A only renders it.

## 2. Scoping findings (what exists, 2026-10-14, read from this worktree)

### 2.1 What works at night today

| Area | State | Evidence |
| --- | --- | --- |
| Sun position at any hour | Works, below the horizon too. Pure function of latitude, hour, **day of year** | `src/render/sky/sun.ts:25-34` |
| Sun clock advances with sim seconds | Works | `sun.ts:76-78`; `main.ts:3444-3452` |
| `?timeOfDay=` DEV override and scenario `weather.timeOfDay` | Works for any hour in [0,24) | `sun.ts:80-90`; `src/sim/scenario.ts:295`; `main.ts:302,905` |
| Atmosphere model below the horizon | Works to about -6 deg, then a fixed "dusk floor" takes over | `src/render/sky/palette.ts:38-46,171-188` |
| Exposure | Fixed table in sun elevation, 1 at 30 deg up to 2^1.5 = 2.8x at -6 deg and below | `src/render/exposure.ts:37-52` |
| Time of day never enters the sim | `World` never sees it; the recorder stores `launch.timeOfDay` | `scenario.ts:292-295` comment; `src/flightRecorder/schema.ts:62` |
| Equipment GLBs exist and register | 5 night/site fixtures + M24 flare, with named state nodes | `src/render/scene/staticModels.ts:36-45`; `tools/models/entries/*.json`; handoff `docs/handoff/2026-10-14-f4-asset-groups.md:55-65` |
| Emissive-capable particle fx | `emissive` per effect; fire ramp radiance 6 (about 5x diffuse white at noon); bloom threshold 1.2 pre-exposure | `src/render/fx/catalog.ts:42`; `fx/shading.ts:23-29`; `pipeline.ts:121-126` |
| Tracers | Pooled, capacity 256, drawn from sim projectiles | `src/render/scene/tracers.ts:20` |
| Ship `lit` (day) flow, buildings with `MeshStandardNodeMaterial` | Lit by sun and hemisphere only | `scene/ship.ts:238`; `scene/buildings.ts:20` |

### 2.2 What does not work, or does not exist

1. **"Night" is permanent civil twilight.** The dusk floor is a fixed constant (`TWILIGHT_SCALE = 0.15`, `palette.ts:38`) weighted to about 1 once the model is dark (`palette.ts:179-182`) and does not fall further with depth below the horizon. Exposure is flat past -6 deg (`exposure.ts:41`, "Dusk (-6 deg and below) still lifts 1.5 EV"). So 2100 and 1830 render identically dim-blue, and neither is dark. This is acceptable as a *floor for playability* but is a looks decision, not a night renderer. Master plan says it plainly: "There is no night lighting" (`MASTER_PLAN.md:44`), and `sun.ts:46-47` comments the same.
2. **The below-horizon sea in the dome is an unlit constant.** `sky.ts:138` mixes `color(SEA_COLOUR)` (0x18384f, `water.ts:2`) with no light term. At night that sea band is as bright as noon. Needs verifying in a capture (Task 1), but the code has no darkening path.
3. **No moon, no stars.** `grep` for moon/star in `src/render` finds only rank insignia, flags and chart art. The dome (`sky.ts`) draws sky radiance plus the sun disc only.
4. **Cockpit instruments are unlit.** Panel and gauge faces are `MeshBasicMaterial` (`scene/panel.ts:9,513-565,707`), so they stay at full brightness at night (wrong: dazzle) and have no dimmer.
5. **No point, spot or any local light, and no light list.** `grep` for PointLight/SpotLight finds none. The scene has exactly one `DirectionalLight` and one `HemisphereLight` (`scene/lighting.ts`, `applySun`). The terrain (`terrain/mesh.ts:301`, a `MeshBasicNodeMaterial` with a hand lambert term, lines 387-389), ocean (`ocean/mesh.ts:525`), beaches (`scene/beaches.ts:71-72`), cloud march (`scene/clouds.ts:384`) and fx sprites (`fx/material.ts:102-110`) each read the sun/sky uniforms by hand. **A three.js PointLight would not reach terrain, ocean or beaches at all.** Any real local illumination of ground and sea needs a shared TSL function that all of them call.
6. **Aircraft have no light emitters.** Several Blender scripts paint a landing-light disc into a texture at an ESTIMATE position (`tools/models/blender/g4m-betty.py:339-340`; the same line in `b-29`, `p-38`, `ki-21`, `ki-84`). It is a texture marking, not a node, so no light can come from it. No nav-light nodes exist on any airframe. F3 already assigned this to F6A as "source-backed fixture points to existing airframes" (spec §9).
7. **Equipment is not placed anywhere in play.** The registry and Hangar know the GLBs; no scenario schema field places equipment, and no renderer instantiates it outside the Hangar (`grep` of `staticModelUrlFor` finds only `vehicle.ts`). Placement is therefore a F6A contract question (and F8's for canonical bases).
8. **Lit/unlit are separate nodes, not emissive materials.** `LensUnlit` / `LensLit` (nav, harbor), `UnlitMarker` / `LitMarker` (pot), `BeamMarker`, `LampFace`, `LampBurningMarker` (`tools/models/blender/f4-night-site-assets.py:36-42`; entries). The handoff says the warm and red surfaces are "deliberately flat review colors, not emissive gameplay lighting" (`f4-asset-groups.md:65`). So making one a gameplay light means: toggle node visibility for state, and assign an unlit HDR material to the lit node. That is small and does not touch the GLBs.
9. **AI has no perception at all.** `targeting.ts` scores by range and aspect and has an optional `accept?` predicate (`src/sim/ai/targeting.ts:55`). Nothing in `src/sim` mentions light, darkness or visibility of a target to a pilot. F6B therefore builds perception from scratch; F6A's contract is the first input. (This is smaller than the master plan's "nighttime AI/perception consequences" wording suggests only if F6B keeps it to one scalar per contact; see §6.)
10. **Day of year is hard-coded.** `SCENARIO_DAY_OF_YEAR = 294` (21 Oct) (`sun.ts:11`) but the night missions are 5 Nov (day 310), 3 Dec (338) and 6 Dec (341). Sun elevation barely changes at night, but the **moon phase and rise time are date-specific**, and `takeoffHours` offers only morning, midday and dusk (`sun.ts:51-66`, `titleScreen.ts:809`) so Form 2 cannot select a night hour.
11. **`hellcat.ts` is a dead stub** (not registered in `airframes.ts`, `hellcat.ts:5-8`); not a night concern, noted because the brief named it. Real aircraft are GLBs.

### 2.3 Computed facts about the three night missions (my calculation; labeled)

Sun elevation uses the repo's own formula (`sun.ts`) at Leyte latitude 11.24 N with the **hard-coded day 294 (21 Oct) and the F3 hours read as apparent solar hours** (Mark D4, 2026-10-14: no `weather.dayOfYear`, no clock conversion). **Accepted limitation:** the campaign dates are 5 Nov, 3 Dec and 6 Dec, so the sun here differs slightly from the campaign date (at J5 it is about -9 deg here against about -11 deg on 6 Dec by my calculation). The moon is a fixed look (D5), so it has no date dependence at all.

| Mission | Hour (F3, read as solar) | Sun elevation (day 294) | Reading |
| --- | --- | --- | --- |
| A4 Dumbo | 2100 | about -46 deg | deep night: floor level |
| J4 Ormoc Bay | 2130 | about -53 deg | deep night: floor level |
| J5 Burauen | **1830** | **about -9 deg** | **dusk, not night** (sunset about 1752, `sun.ts:46-47`) |

**Surprise:** J5 is the *dusk* chapter, close to what the game already renders. A4/J4 are the deep-night cases. The renderer covers -6 to -53 deg and the floor (§3.5a) is what makes -9 and -46 deg distinguishable.

### 2.4 Render budget constraints

- The gate: High, 1440p, GPU p95 <= **8.33 ms** in every view of `tests/e2e/views.ts`, with `in-deck-1900` carved out at 10.0 ms (`tests/e2e/budget.spec.ts:21-23`; H0 `docs/superpowers/plans/2026-10-08-h0-render-budget.md`, R1/R3). H0's margin target was <= 7.5 ms; several views sit at 7.1 to 8.1 ms (H0 table), so the headroom for new passes is **small on the worst views and unknown on the best ones until re-measured**.
- Budget runs take the exclusive `hwlock ryzen-budget` on the ryzen RX 6700 XT, never a whole suite (`AGENTS.md`; `docs/testing.md:46`). A test is a correctness test or a budget test, never both (`testing.md:46`).
- Bloom threshold is 1.2 linear pre-exposure (`pipeline.ts:125`); at night exposure multiplies first, so lights bloom easily. A threshold tuned for noon will either flare a whole night frame or miss pots. Task 3 retunes against night captures.
- Everything is TRAA-resolved; point-like lights smaller than a pixel will shimmer. Sub-pixel emitters need a minimum screen radius.
- Forward lit materials loop over every punctual light per fragment, so true `PointLight`s scale cost with `lights x lit pixels`. Not used (see §3.5).

## 3. The light contract (F6A defines, F6B consumes)

### 3.1 Principle

A light is **content plus a pure function of sim time and world state**. The renderer computes how it looks; F6B computes what a pilot can see; neither mutates the other.

### 3.2 Kinds

| Kind id | Use | Source model (F4) | Shape | States |
| --- | --- | --- | --- | --- |
| `pot` | runway / anchorage / drop-zone lamp | `portable-runway-flare-pot` | omni, 360 deg | lit, unlit |
| `fixture` | fixed harbor/nav mast (red, steady white) | `panirugan-red-harbor-light`, `ranger-temporary-nav-light` | omni, colored | lit, unlit |
| `searchlight` | 60-in AA light | `m1942-60in-searchlight` | cone, aimed (train/elevate) | off, on; aim azimuth/elevation |
| `flare` | M24 parachute illumination flare | `m24-aircraft-parachute-flare` | omni, large radius, falls | ignited at t0, burns for T, descends |
| `nav` | aircraft red/green/white position lights | airframe fixture points (new, §4 Task 7) | omni, tiny, colored, directional shield | on, off (blackout) |

`suluan-damaged-lighthouse` is a non-operating fixed model and is never a light (F3 §8).
Fires, tracers and gun flashes are emissive **effects** (existing fx), not contract lights, but they feed `ambientGlow` (§3.4).

### 3.3 Data shape

Authored in scenario / base content (strictly validated like the rest of `scenario.ts`; zod `.strict()`):

```ts
type LightSpec = {
  id: string                       // unique per scenario; stable across builds (recorder hashes it)
  kind: 'pot' | 'fixture' | 'searchlight' | 'flare' | 'nav'
  at: { x: number; z: number; altitudeM?: number } | { ship: string; offset: [x, y, z] } | { aircraft: string; point: string }
  color: 'warm' | 'red' | 'white' | 'green'   // palette in code, not RGB in content
  state: 'lit' | 'unlit' | 'off' | 'on'
  schedule?: { onAtS?: number; offAtS?: number; burnS?: number }   // sim seconds; flare: ignite and burn
  aim?: { azimuthDeg: number; elevationDeg: number; sweep?: { ... } }   // searchlight only
  blackoutExempt?: boolean         // authored, labeled gameplay exception
  source: 'historical' | 'gameplay'  // GAMEPLAY.md: every installed light has source support or an explicit gameplay label
  sourceNote: string               // citation or the gameplay-label reason; required
}
```

Runtime view (what both renderer and F6B read; pure, no THREE imports, lives under `src/sim/lights/` so it can be unit-tested headless and used by F6B):

```ts
type LightRuntime = {
  id: string; kind: LightKind
  positionM: Vec3          // world, from the anchor (static, ship-relative or aircraft-relative)
  intensityCd: number      // luminous intensity, scene-calibrated (candela), from kind + state; 0 when dark
  color: Rgb
  coneHalfAngleRad?: number; axis?: Vec3     // searchlight, nav-light shield
  radiusM: number          // influence radius for culling and F6B visibility
}
function lightsAt(content, world, tick): readonly LightRuntime[]       // pure, deterministic, ordered by id
function illuminanceAt(lights, pointM: Vec3): number                   // lux-like scalar for F6B ("is X lit?")
function ambientNightLevel(sunElevDeg, cloudCover): number       // GAMEPLAY scalar (sky + fixed moon), same units; deliberately NOT the rendered floor brightness (§3.5a)
```

Units: candela and lux-like scalars on one **calibrated scene scale** set in Task 2 (the renderer maps to scene radiance, F6B uses the scalar). Calibration anchors are labeled ESTIMATES until sourced (see §5 risks).

### 3.4 Budget caps (hard, enforced by tests)

| Cap | Value | Why |
| --- | --- | --- |
| Lights contributing real illumination to terrain/sea/airframes at once | **8**, nearest-to-eye with hysteresis | uniform array read by one shared TSL function (§3.5) |
| Lights drawn as glow sprites (no illumination) | **96** | one instanced draw; covers a runway of pots at distance |
| Active searchlight beams | **3** | one beam volume each |
| Active parachute flares | **4** | J4 has one TBM flare-layer; headroom for scripting |
| Nav lights drawn | **3 per aircraft, aircraft within 6 mi**, hard cap 64 sprites total | J6 has 24 aircraft airborne (F3 population) |
| Per-pot illumination | none beyond cap 8; the rest are glow only | a 30-pot runway must not cost 30 lights |

Caps are constants exported next to the types and asserted by a test that builds a worst-case scene (Task 5). If a scenario authors more than the cap, the **loader fails** (not silently drops), so a mission cannot ship over budget.

### 3.5 How lights reach pixels (design, recommended)

1. **One shared TSL node** `gameplayLightsNode(positionWorld, normal) -> vec3 irradiance` that loops over a fixed-size uniform array (8 entries: position, color x intensity, radius, optional cone axis and cosine). Terrain, ocean, beaches and fx call it where they currently add `skyIrradianceUpNode`; lit standard materials (aircraft, ships, buildings) add it through a small `emissiveNode`/output hook. Fixed loop count means no shader permutations per light count.
2. **Glow sprites**: one instanced additive quad batch (reuse the fx pass machinery: `fx/system.ts`, `fx/material.ts`), HDR color, minimum on-screen radius to stop TRAA shimmer, depth-tested against terrain. This is what makes 96 pots cheap.
3. **Searchlight beam**: a single alpha-blended cone/volume mesh per beam, fog-scattered by a cheap analytic term, **not** a volumetric march. A beam that hits cloud or ground gets a glow sprite at the hit point.
4. **Night sky**: stars as a static point-sprite or texture layer on the dome, faded in below about -6 deg of sun elevation; a fixed half-bright waning moon disc with its phase shader, and a directional moon light that replaces the sun term when the sun is below the horizon, so existing sun-lit paths work without a second DirectionalLight. The floor and moon constants are in §3.5a.
5. **Cockpit**: a dimmer uniform multiplying panel/gauge materials (`MeshBasicMaterial` colors). GAMEPLAY.md requires dimmable instruments, so the dimmer is a three-step cockpit control with a readable default; it is a cockpit control, not the retired world night-brightness setting (D3). Display-only: it never enters the sim or the recorder.

Rejected: three.js `PointLight`s (do not reach custom terrain/ocean shaders; cost scales with fragments x lights), tiled/clustered lighting (large new machinery for 8 lights), a full volumetric light march (budget).

### 3.5a Night floor and moon (D3, D5; every number is a tunable constant, starting values are ESTIMATES tuned at CP1)

- **Floor.** Below about -6 deg the existing dusk floor (`palette.ts:38`) keeps its level instead of falling away, tinted blue, and exposure holds the `exposure.ts` -6 deg value (2^1.5) rather than lifting further. Constants: `NIGHT_FLOOR_SCALE` (multiplier on the existing floor, start 1.0), `NIGHT_FLOOR_FULL_DEPTH_DEG = -18` (the dusk glow is gone by here), `DUSK_GLOW_WEIGHT` (horizon warmth, 1 at -6, 0 at -18). Target: frame-mean grey of the unlit sea/land view **20 to 30 of 255 at deep night**, which is about today's -6 deg look (mean grey 22, `exposure.ts` header). That is "readable blue night, never black", per Mark.
- **Dusk versus deep night.** J5 at about -9 deg keeps about 70% of the dusk glow (`DUSK_GLOW_WEIGHT` at -9 is 0.75 by the linear ramp): a warm horizon band and a frame mean at least 25% above the deep-night floor. A4/J4 have no horizon band. The test is a measured relationship, not a constant (Task 3).
- **Moon (D5, amended after CP1: waning gibbous default, dark side invisible).** Fixed look, no ephemeris, no rise or set, not moving with sim time: `MOON_ILLUMINATED_FRACTION = 0.7` (a waning gibbous; the first draft was a half, and `?night=phase:0.25` tries a crescent), waning (lit limb on the left in this hemisphere's view), only the lit part is drawn with a soft terminator, gentle limb darkening and faint maria (the dark side adds nothing: no disc, outline or earthshine), a smaller 0.6 degree disc, `MOON_ELEVATION_DEG = 40`, `MOON_AZIMUTH_DEG = 250`, `MOON_LIGHT_SCALE` (start so moonlight adds a soft directional term, about a quarter of the floor's luminance). It is a gameplay look, not a historical claim: a real half moon is not up all night.
- **Legibility against the floor** (the contrast reasoning). A lifted floor lowers every light's contrast. Targets, measured by pixel readback in correctness E2E (not budget): a lit pot's glow core is at least **8:1** in luminance over a 50 px ring around it; a flare's lit ground pool is at least **3x** the unlit floor inside its radius; a searchlight beam is at least **3:1** over adjacent sky; nav lights at 1 mile are visible against the floor (at least 3:1, the WCAG 2.1 SC 1.4.11 non-text-contrast figure, used as a reference). Lights are HDR radiances far above the floor, so the means are met by raising emitter radiance, not by darkening the floor. If 8:1 forces glows that bloom the frame, the first lever is `NIGHT_FLOOR_SCALE`, which stays Mark's call (it is the look he chose).
- **Gameplay scalar decoupled from the floor.** `ambientNightLevel` (§3.3) is what F6B reads. It models a moonlit night (ESTIMATE) so a blacked-out target is still hard to see even though the picture is readable; the rendered floor is a display choice and is not F6B's input.


### 3.6 Determinism and flight recorder (N2) — reasoning

- **Lights are not sim state in F6A.** Position, schedule and state are derived by `lightsAt(content, world, tick)` from (a) authored scenario content and (b) existing world state (ship poses, aircraft poses, tick). It stores nothing, mutates nothing and is not in the checksum, so the world checksum and golden trajectory are unchanged. Verified requirement for Task 4: a test runs the same scenario with lights enabled and disabled and asserts the world checksum is identical at every one-second checkpoint.
- **Content identity is covered.** N2 hashes scenario content (`content.sha256`, `flightRecorder/schema.ts:56`), so light placements, schedules and `blackoutExempt` flags are part of the record's identity and a mismatched build fails closed. No schema change needed.
- **Time of day is already recorded** (`launch.timeOfDay`, schema line 62), and the moon is a fixed look (D5), so **no date and no scenario field are added** (D4). Lights read nothing the recorder does not already hash or store.
- **The one exception is player input.** A cockpit lights/blackout switch is a player action. Today recorded actions are a closed enum (`schema.ts:25-33`, strict). If F6B makes AI react to the player's lights, that switch becomes sim input and **must** be recorded and applied through the fixed-step input seam, or replay diverges. F6A adds the control as a recorded discrete action now (an additive enum member, old records still parse) but with **no sim effect until F6B**, so F6B changes behavior without changing the format. Mark ruled D2(a) on 2026-10-14. The light contract carries `LIGHT_CONTRACT_VERSION = 1`, frozen at the F6A handoff; **changing D1 (how lights reach pixels, the 8-slot shape) or D2 (the recorded action) after that is a version bump**, with a recorder migration for D2.
- **Flare ignition is deterministic** when scripted (schedule in sim seconds) or when a mission trigger fires it (existing trigger evidence, `schema.ts:38-43`). A player- or AI-dropped flare is a world event and would need to be sim state; none is in F3 (the J4 flare-layer is authored), so F6A supports scheduled/trigger flares only.
- **Random flicker is render-only** and seeded from light id + render time, never `Math.random` in `src/sim` (architecture test `boundary.test.ts`).
- F6B reads `illuminanceAt`/`ambientNightLevel` from sim-side code, so those functions live in `src/sim/lights/` and take only sim-legal inputs (no THREE, no DOM, no render clock). They must be pure functions of tick.

## 4. Tasks

TDD-ish: each task lists the test written first, then the work. Tests follow `docs/testing.md` Philosophy: enroll don't clone, assert behavior against an outside truth, a test must be able to fail, budgets only in budget specs, heavy runs on ryzen via `remote-run`, budget specs under `hwlock ryzen-budget` with three runs and the median p95.

1. **Sources and baseline.** Establish sources (archive/Navy manuals, TM 9-981 already cited in F3, Coast Pilot) for: US/Japanese aircraft position-light colors and blackout practice **and whether period evidence exists for a landing light on each airframe (D7)**, 60-in searchlight output and beam, M24 flare burn time/candlepower. Anything unsourced is labeled `ESTIMATE`. (No moon ephemeris: D5 is a fixed look.) Capture the current look at -6, -9 and -46 deg, and a budget baseline for the 9 views plus the new night view set (Task 11). *Tests:* a capture proving the unlit dome-sea defect (§2.2 item 2) so the fix can fail it.
2. **Contract types and pure module.** `src/sim/lights/` (types, loader validation, `lightsAt`, `illuminanceAt`, `ambientNightLevel`, caps). *Tests first:* schema rejects unknown fields and over-cap scenarios; `lightsAt` ordering is by id; flare burn/ignite times; searchlight cone math; `illuminanceAt` falls off as expected (inverse-square from a known anchor) and returns 0 outside radius; boundary test confirms no `render/` import.
3. **Night floor, moon, stars and exposure.** The floor model (§3.5a): hold the dusk floor at depth with a blue tint, `DUSK_GLOW_WEIGHT` ramp, fixed half-bright waning moon and moon light, stars, night exposure keys past -6 deg, the dome-sea fix, bloom threshold retune, and cloud shadows disabled while the moon is the only directional light (§5). *Tests:* exposure monotonic and capped; palette continuous across -6 deg (extend `palette.test.ts` and `exposure.test.ts`); frame-mean grey in [20,30] at -46 deg and at least 25% higher with a horizon band at -9 deg (extends the `sun.spec` bands); moon direction identical at sim times 0 and 3600 s; moon disc is lit by the phase fraction and its dark side is invisible; star count nonzero below -6 deg and zero in daylight. **Tune to Mark's eye at CP1.**
4. **Glow sprites and first light kinds (pot, fixture, flare).** Instanced glow batch, lit/unlit node swap for the F4 models, M24 flare (descends, flickers). *Contrast tests (correctness E2E):* the pot, flare and harbor-light legibility targets of §3.5a against the new floor. *Tests:* swapping `lit`/`unlit` toggles exactly the named nodes (enrolled over all equipment with a state node); no change to the world checksum with lights on/off (recorder-safe, §3.6). **Checkpoint CP1.**
5. **Shared lighting node and caps.** The 8-slot uniform array and shared TSL function, nearest-with-hysteresis selection, wiring into terrain, ocean, beaches, fx; lit standard materials. *Tests:* selection is stable (no flicker as the eye moves) and honors the cap; a worst-case scene builder (30 pots, 3 beams, 4 flares, 24 aircraft) respects every cap in §3.4; GPU-vs-CPU comparison of irradiance at known points (outside truth, like `ocean.spec.ts`).
6. **Searchlight beam.** Cone mesh with analytic scatter (D6), train/elevate from the existing `Train`/`Lamp` rig nodes (`vehicleRig.ts:525-547`), ground/cloud hit glow. *Tests:* beam axis equals the rig's elevation/train; capped at 3.
7. **Aircraft nav lights.** Add fixture points to the flyable airframes (data first: a `lightPoints` table keyed by aircraft id and verified against the Task 1 sources; **position lights only, red/green/white (D7)**; a landing light only for an airframe where Task 1 found period evidence; no universal headlights). Sprites, directional shielding, blackout flag. *Tests:* enrolled over every flyable id in `content/aircraft` (pin the list); points lie inside the airframe bounds; port is red, starboard green, tail white; any landing-light entry carries a source or the task fails.
8. **Cockpit lighting.** Three-step dimmer uniform on panel/gauge `MeshBasicMaterial`s with a readable default; the recorded `lights` control action (D2). *Tests:* dim factor monotonic; dimmed luminance bounded; recorder action parses and round-trips (extend `flightRecorder` tests). **Checkpoint CP2.**
9. **Scenario placement and sample night content.** Scenario `lights` array and a night test range holding every kind; Form 2 night takeoff choices selectable in Dev only (rank gating is F5). No `weather.dayOfYear` (D4). Lights in canonical bases are F8 (D9). *Tests:* schema; every shipped scenario still validates; the test range enrolls every light kind.
10. **Quality tiers and fallback.** Medium/Low caps (fewer true-lit slots and sprites), a render-off path, and a documented behavior when `timestamp-query` is absent. *Tests:* tier tables are monotonic.
11. **Budget gates.** New night views: `night-floor-600` (deep-night floor at -46 deg, no lights), `night-field` (J5-style field: 30 pots + 2 beams), `night-bay` (J4: 5 ships, flare, gun glow), `night-dusk-j5` (-9 deg). **Measurable gates (budget spec, High, 1440p, ryzen, three runs, median p95):** (a) existing 9 views regress by **< 0.3 ms** p95 and still pass 8.33 ms (in-deck-1900 10.0) — the cost of the new shader branch when no lights are active must be near zero; (b) each new night view <= 8.33 ms, target <= 7.5; (c) lights-on minus lights-off on the same view <= **1.0 ms**. If (c) fails, the caps in §3.4 shrink before any visual quality is cut (stop rule from H0 R4). Tripwire values derived by the H0 rule `min(ceil(1.2 x median x 10)/10, 8.33)`.
12. **Final scenes, handoff.** Capture A4/J4/J5-style scenes, run focused tests then the full gate through `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`, write `docs/handoff/2026-10-XX-f6a-night-renderer-lights.md`, update `docs/<topic>.md` (a new `docs/night.md` subsystem reference, README "Where docs go" pointer), update MASTER_PLAN F6 status, email the plan/handoff HTML to `marktuttle1@gmail.com` after the AGENTS.md exact-recipient check. **Checkpoint CP3.**

Accessibility check (F6 acceptance gate): a night capture at each mission's hour is judged by the measured contrast targets in §3.5a (pot 8:1, flare pool 3x, beam 3:1, nav lights 3:1 against the floor) and by luminance contrast of the player's own aircraft and the runway/target cues against the sky floor. Gameplay cues must not rely on red-versus-green alone (nav lights also differ by position, and steady versus none). The recorded contrast numbers go in the handoff.

## 5. Risks (honest)

- **Effort is not well bounded.** I estimate 2 to 3.5 weeks of agent time (12 tasks, size L but smaller than first estimated), but the two unknown-cost items are the shared lighting node across terrain/ocean/beaches/fx (Task 5) and getting the night look right (Task 3). The art is now easier (a fixed floor and moon, no dark case), though still at least one tuning iteration against Mark's eye at CP1.
- **Budget headroom is unmeasured at night.** Some existing views already sit near 8 ms. If the no-lights-active cost of the shared node exceeds 0.3 ms, the design must change (compile-time branch on a night flag, or a separate material variant). That is a rework risk for Task 5.
- **Shader changes touch daytime too.** The terrain/ocean materials are shared; a regression shows up in all nine day views (gated by Task 11a).
- **Calibration numbers are my estimates.** Searchlight candlepower and flare candlepower are labeled ESTIMATE until Task 1 finds sources; the floor and moon constants are tuned looks, not measurements; the contract's *shape* is stable, the *numbers* may change.
- **Historical support for lights is thin.** F3 found no type-specific drawing for the Ranger light and only "the Coast Pilot names the light" for Suluan; aircraft position-light layouts per type may need ESTIMATE labels. GAMEPLAY requires every installed light to be sourced or labeled `gameplay`; the `source`/`sourceNote` fields make that checkable.
- **Contrast risk from the chosen floor (D3).** Mark overrode my true-dark recommendation, so the floor is readable blue. The honest costs: every light has less contrast than against black, so glows must be brighter and will bloom more (watch the bloom threshold and TRAA shimmer); and a lit pot or flare matters less *visually* because nothing hides in the dark. Blackout still has to matter in F6B's perception scalar and AI behavior (F6 acceptance gate: "blackout still matters"), not in how dark the picture is. A blacked-out ship stays visible as a silhouette against the floor. If F6B finds that insufficient, the lever is a floor change, which would be a looks ruling for Mark.
- **Fixed moon and day 294 are accepted limitations (D4, D5).** The campaign dates (5 Nov, 3 Dec, 6 Dec) differ from 21 Oct, so the sun is up to about 2 deg off on J5, and the moon is a constant look rather than a real phase. Neither affects determinism.
- **Cloud shadows at night.** The shadow path is keyed to the sun direction. With the moon driving the directional term, cloud shadows must be disabled or the moon would cast them. Task 3 handles it; unmeasured.
- **Recorder format.** A recorded lights action (D2, ruled 2026-10-14) is a schema change to a record format Mark just verified; additive but must be test-covered.
- **Airframe changes.** Nav-light fixture points touch many airframe definitions and could conflict with parallel aircraft work; keep it to a data table.

## 6. Notes for F6B (not decided here)

F6B should read `illuminanceAt` and `ambientNightLevel` to scale a contact's detection range; because `targeting.ts` already has an `accept?` hook (line 55) the cheapest design is one scalar visibility factor per (observer, target), computed from target self-light (nav lights, exhaust glow) plus ambient plus illumination, then used in the existing selection. That keeps the per-tick cost O(contacts), not O(lights x contacts). It also means the blackout and the lights switch become real sim input at that point (D2).

## 7. Decisions (Mark, 2026-10-14)

Mark ruled on all nine. Where he overrode my recommendation the plan implements his choice and §5 records the cost.

| # | Decision | Ruling |
| --- | --- | --- |
| D1 | How lights reach ground and sea | **(a)** shared TSL lighting node with 8 true-lit slots plus glow sprites. Sprites-only stays the fallback if Task 5 busts the budget. |
| D2 | Cockpit lights/blackout switch and the recorder | **(a)** add the recorded lights/blackout action now, no sim effect until F6B. |
| D3 | Night darkness target | **(b)** bright "movie night" floor: a readable blue night everywhere, not true dark, and **not a player setting** (Mark overrode my recommendation). Dusk (J5) and deep night (A4/J4) stay distinguishable; lights stay legible by measured contrast (§3.5a). |
| D4 | Date and clock | **(b)** keep the hard-coded day 294 and read F3 hours as solar hours. No `weather.dayOfYear`, no clock conversion. Accepted limitation: campaign dates differ from 21 Oct. |
| D5 | Moon | Fixed waning moon, up all night, constant look; no ephemeris and no rise or set. Phase and elevation are tunable constants. **Mark 2026-10-14, after CP1: waning gibbous default (70% lit), dark side invisible** (was: half-bright). |
| D6 | Searchlight beam | **(a)** cone mesh with analytic scatter. |
| D7 | Aircraft nav lights | **(b)** position lights only (red/green/white); a landing light only where Task 1 finds period evidence for that airframe. |
| D8 | Cap values | Accepted as starting values (§3.4); Task 11 may lower them. |
| D9 | F6A versus F8 | Confirmed: F6A ships a night test range only; light placement in canonical bases is F8. |

**Changing D1 or D2 after the light contract freezes (the F6A handoff) is a contract version bump** (`LIGHT_CONTRACT_VERSION`), and D2 additionally needs a recorder migration.

## 8. Size estimate

Size L, revised down. Removed since the first draft: moon ephemeris and its verification, a scenario date field and the clock conversion, the player night-brightness setting, and the "dark case" tuning. 12 tasks stand (numbering and the three checkpoints are unchanged), but Tasks 1, 3 and 9 are smaller. Roughly 20 to 32 new or changed source files plus 4 night budget views; risk-weighted **2 to 3.5 weeks** of agent time (was 2.5 to 4), one attended session per checkpoint. The unknown-cost items are still Task 5 and the tuning at CP1.

## 9. What would change this plan

- Task 5's no-lights cost over 0.3 ms: drop to the sprites-only fallback (D1 fallback) and move ground illumination to F8's local decals.
- Task 4 finds the 8:1 pot contrast cannot be met without blooming the frame: bring the floor level back to Mark as a looks question (his choice D3 stands until he says otherwise).
