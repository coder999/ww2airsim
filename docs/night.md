# Night: the renderer, the light contract, and their sources

Standing reference for the F6A night work (plan `docs/superpowers/plans/2026-10-14-f6a-night-renderer-lights.md`;
rulings D1-D9 are in that plan, section 7). Status of record is the handoff
for F6A once written; this file says what ships and where its numbers came from.

## What exists (checkpoint 2, 2026-10-14)

| Piece | Where |
| --- | --- |
| Night look constants (floor, dusk, moon phase, stars), pure | `src/render/sky/night.ts` |
| Floor and moon light in the palette | `src/render/sky/palette.ts` (`withMoonLight`) |
| Stars and the waning moon on the dome (lit part only, soft terminator) | `src/render/scene/sky.ts` |
| Light contract: schema, `lightsAt`, `illuminanceAt`, `ambientNightLevel`, caps | `src/sim/lights/lights.ts` |
| Position-light points for every flyable airframe, arcs, poses | `src/sim/lights/airframeLights.ts` |
| Scenario `lights` array | `src/sim/scenario.ts` |
| Glow sprites (one instanced additive draw) | `src/render/lights/glow.ts` |
| Equipment lamp nodes (lit/unlit swap), searchlight aim | `src/render/lights/equipment.ts` |
| Lit-slot selection (8, hysteresis) and glow caps | `src/render/lights/select.ts` |
| The shared lighting node (terrain, ocean, beaches, fx, lit materials) and its CPU twin | `src/render/lights/irradiance.ts` |
| Searchlight beam, ground and cloud hit | `src/render/lights/beam.ts` |
| The renderer's half of the contract (models, glows, flicker, arcs) | `src/render/lights/nightLights.ts` |
| Night cockpit dimming (fixed 35%) | `src/render/scene/cockpitDim.ts` |
| The night test range | `content/scenarios/night-range.json`, picker row "Night Range (dev)" |

Keys: `N` toggles the player's position lights (a recorded `control: 'lights'` action, no sim effect until F6B). The night cockpit is a FIXED 35% apparent brightness with no key (Mark 2026-10-14, after CP2: fixed 35% cockpit at night, no dimmer key).

DEV `?night=floor:1.3,moon:0.8,dusk:1.1,glow:1,phase:0.7,cockpit:0.35,lux:1` overrides the tunables for a session: `phase` is the moon's lit fraction (0.7 gibbous by default, 0.25 a crescent), `glow` scales every light glow's radiance, `lux` scales how strongly lights illuminate ground and sea, `cockpit` is the lowest-step apparent night brightness of the panel.
`__ww2.lights()`, `__ww2.beams()`, `__ww2.lightIrradianceAt()` and `__ww2.playerLightsOn()` expose the lights for the specs.
Look captures: `npm run capture:e2e -- nightCapture.spec.ts` (`NIGHT_QUERY` appends parameters).
Correctness: `tests/e2e/night.spec.ts`, `tests/e2e/nightLights.spec.ts` (light legibility by WCAG contrast ratio on linear luminance, the GPU lighting node against its CPU twin), `tests/e2e/overlaySelect.spec.ts`, and the unit tests `tests/render/{night,lights,lightSelect,beam,cockpitDim}.test.ts`, `tests/sim/lights/`.

## Finding: the dome's below-horizon sea is not visible (2026-10-14)

The plan (section 2.2, item 2) suspected the dome's unlit `SEA_COLOUR` band is as bright at night as at noon.
Checked with a sentinel: the band painted pure red (`0xff0000`) at 18:30 from 600 m over the Gulf, 1920x1080,
nexus 680M: **0 red pixels**. The ocean mesh (400 km) covers everything the dome's sea branch would, so the defect
is latent and was not "fixed"; nothing observable changed. If the ocean mesh ever stops short of the horizon, the
branch is `domeColourFor` in `src/render/scene/sky.ts`.

## Finding: shared-node scope bug on D3D12 (2026-10-15)

**D3D12 near-black models, fixed 2026-10-15.** From F6A Tasks 5-6 (a8d97fb2) every lit model rendered 0.06x to 0.45x of its flat luminance on ryzen (RX 6700 XT, D3D12 via Tint) even with no light active; nexus's Vulkan 680M was fine. Cause (A/B on ki-84-frank and p-38-lightning, hangar luminance, ryzen console session): `gameplayLights()` handed `positionWorld`/`normalWorld` straight into the `If`+`Loop`, so three's node builder first emitted their code INSIDE the branch scope, and the material's own sun lighting reused that variable outside it (uninitialised on D3D12). Not the loop, the `min` clamp or the emissive slot: a trivial loop body, an unrolled 8 slots with no branch, and `night=shaders:0` all rendered 0.0913 / 0.2138; the full body in `Loop` or in `If` rendered 0.0075 / 0.0168; hoisting `worldPos.toVar()` and `normal.toVar()` above the `If` with the unchanged `If`+`Loop` restored 0.0913 / 0.2138. Fix: those two `toVar()`s in `src/render/lights/irradiance.ts`; the daytime cost is unchanged (the branch still skips the loop). Pinned by hangar case 15b (lit vs `shaders:0` luminance within 2%, red before the fix on ryzen). Rule: inside a TSL `If`/`Loop`, never be the first to build a shared node (positionWorld, normalWorld, diffuseColor...); `.toVar()` it outside first.

## Finding: clouds were lit as by day at night (2026-10-15, fix-night-clouds)

**Cause.** The default cloud march (`takramTslCloudPass.ts`) had its radiance as day constants: a white sun term `(13.5, 12.8, 11.8)`, a blue sky ambient `(2.2, 2.8, 4)` and a grey ground bounce, none scaled by the sun's elevation, and `main.ts` fed it the TRUE sun direction (below the horizon at night) with no regard for the moon or the floor. The cloud composite is added after the aerial perspective, so the white deck also read as a "bright flat grey haze" along the horizon and over everything below it (the curved deck is met a long way off by rays just under the horizon). The aerial perspective and fog themselves were already night-correct: the same frame with `cloudTier=off` is dark blue (checked 2026-10-15), so nothing there changed.

**Fix.** `cloudLight(elevationDeg, sunDir)` in `src/render/sky/night.ts` returns three per-frame inputs to the march: the one light's direction, an rgb multiplier on the sun term, and a scalar on the ambient. Sun at or above the horizon: exactly `[1,1,1]`, `1` and the sun direction, so the day is unchanged by construction (`tests/render/night.test.ts`). Below it the sun term fades (squared smoothstep from 0 to -6 deg, with the dusk exposure rise divided back out, because a cloud at its day radiance was lifted 1.5 EV with the dome: sun -3 deg clouds read brighter than +3), the moon (direction and tint from the existing constants) takes over, and the ambient falls to `CLOUD_NIGHT_AMBIENT` between 0 and -9 deg. The multipliers are hoisted `toVar`s outside the march's `If`/`Loop` (the D3D12 rule above). Cloud shadows were already off under the moon. The legacy cloud pass and the raw-WebGPU Takram twin (`?cloudRenderer=legacy|takram`, DEV only) are NOT changed and still light clouds as by day.

**Tunables.** `?night=cloud:1` scales the moon term and the ambient floor together (0.5 darker, 2 brighter); `?night=clouds:0` lights the clouds as by day at any hour (the old look, and the day-regression twin). Starting values `CLOUD_MOON_LEVEL = 0.009`, `CLOUD_NIGHT_AMBIENT = 0.010` are by-eye estimates, nexus 680M 2026-10-15.

**Measured (nexus 680M, 1280x720, Free Flight, Partly Cloudy, `tests/e2e/nightClouds.spec.ts`):** mean cloud-pixel luminance at 21:00 against 12:00: under the deck 44 vs 184 (was about 1.0x), over the tops 40 vs 154; sun-up cloud luminance with the model on against the `clouds:0` twin within 0.3% at 12:00 and 17:18. **Reference GPU (ryzen RX 6700 XT, D3D12, rdp session, 2026-10-15):** the same spec passes (6 cases); night/day cloud luminance 42.9/184.5 under, 40.0/183.2 over; day model vs twin within 0.4% (141.70 vs 141.63, 130.32 vs 130.25, 140.88 vs 140.89, 112.12 vs 112.12); the night twin reads 103 against 29.4. No shared-node scope problem: the hoisted multipliers render the same as on Vulkan. `cloudShadow` 'under the deck' and 'clear sky: the gunnery range' FAIL identically on main 683b2a78 on ryzen (sea strip -36.3, range mean 31.8): pre-existing, not from this change, unfixed here. Local light sources and the beam's cloud hit were not touched and not re-exercised against a deck.

## Sources (Task 1)

Anything below not tied to a citation is an ESTIMATE and is labeled where the number lives (`INTENSITY_CD` in
`src/sim/lights/lights.ts`).

| Quantity | Value used | Source | Status |
| --- | --- | --- | --- |
| 60-inch searchlight output | 800 million cd | Commonly cited peak for the US 60-inch carbon-arc light; a US Army manual-based description gives 990 million cd and 8,800 yd range. Sources: National Warplane Museum, GE carbon-arc searchlight; Steel Soldiers forum summary of the Army manual (read 2026-10-14, secondary) | 800e6 used; secondary source, TM 5-7045 itself (cited by F4 for the aperture) not re-read |
| 60-inch beam half-angle | 2.5 degrees | none | ESTIMATE |
| Parachute flare (the M24 the model depicts) | 800,000 cd, burns 3 min, falls 700 ft/min (3.556 m/s); 37.0 in, 47 lb (matches the F4 model) | **U.S. Explosive Ordnance, OP 1664, "Aircraft pyrotechnics (Army flares)", printed page 252 (PDF pages 9 to 10 of `inldigitallibrary.inl.gov/PRR/80965.pdf`), M24 row; the AN-M26 row on the same page gives the same 700 ft/min and 800,000 cp. Read 2026-10-14** | CITED. The M9 is 400 ft/min. |
| Flare burn after landing on land | 25 s | Mark asked for a short tail (20 to 30 s) | ESTIMATE; it goes out at once in water |
| Flare pot, harbor lantern, nav light, aircraft position light | 50 / 100 / 100 / 40 cd | none | ESTIMATE |
| Aircraft position light colors | red port, green starboard, white tail | standard practice of the period; per-type layout not sourced | ESTIMATE for placement (Task 7) |
| Twilight and moonlight illuminance for `ambientNightLevel` | anchors in `TWILIGHT_LUX`, half moon 0.05 lux | none | ESTIMATE |
| Landing lights per airframe (D7: position lights only unless period evidence) | none installed | not yet researched per type | Open: resolve per airframe before Task 7 puts any landing light in; until then none |

Open for Task 1 (deferred, not done): the nine-view budget baseline on ryzen (taken at Task 11, against main, since
nothing before it touches those views' cost on purpose) and per-airframe landing-light evidence.

## Deviations from the plan, as built (2026-10-14)

- Lit-slot selection ranks lights by I / d^2 at the eye, not by distance alone (a flare outranks nearer pots); for equal lights it is the nearest. Hysteresis is a 1.35x bonus for the previous set.
- A nav light's `at.point` may be `all` (port, starboard and tail); it counts as three against the 64-sprite cap. Position-light colors come from the point, not the spec's `color`.
- Nav lights are sprites only, never lit slots. Each is drawn only from inside its visibility arc (110 degrees forward each side, 140 aft; ESTIMATE).
- `LIGHT_GAIN` (lux to scene irradiance) is 0.1, a look constant: 0.02 left a flare's ground pool invisible against the night floor, 0.24 was garish.
- Cockpit dimming divides by the frame exposure (2.8x at night), or a panel scaled to 35% would look as bright as by day. 35% is near the legibility floor (about 34%: below it the dimmest family's minor marks drop under 3:1), which the WCAG test asserts. There is no dimmer key.
- Glow sprites cap their apparent diameter (about 0.6 degrees for a pot) and ease their radiance down inside 200 m, after Mark's 2026-10-14 report of a huge blown-out blob from a pot 55 m away. Contrast targets still hold (pot 15:1, harbor 16:1, flare 14:1, beam 9:1).
- Position-light points are READ OFF THE RENDERED MESH (the most lateral wingtip vertices and the aftmost static vertex, never a control surface, turret, prop or door), regenerated by `tests/render/genNavPoints.test.ts`; the first bounding-box version floated off the Hellcat's wingtip (Mark 2026-10-14). `tests/sim/lights/airframeLights.test.ts` asserts every light of every airframe lies within 0.15 m of the mesh and that the table equals a fresh extraction. All wingtip vertices belong to the fixed airframe mesh, so gear, flaps and ailerons do not move them. Lights follow the DRAWN (interpolated) pose of the aircraft, not the last sim tick, which could be up to a tick (1.7 m at 100 m/s) off the mesh.
- A flare may carry `driftMps` ([x, z] m/s), used instead of the world wind: the night range's drifting flare uses it, because a world wind weathervanes the parked player and shifts every pixel measurement taken from the cockpit (found 2026-10-14).

## Perception (F6B, built through checkpoint 1, 2026-10-15)

Plan: `docs/superpowers/plans/2026-10-15-f6b-night-perception-sights.md`. At night each aircraft has ONE detection range R(T), computed once per tick by `perceptionAt` (`src/sim/lights/perception.ts`) from the target's own lights, the ambient night (`ambientNightLevel`) and the light falling on it from flares, beams and pots (`illuminanceAt`, nav lights excluded). An enemy sees T iff its distance is at most R(T) (a pilot already tracking T keeps it to 1.25 R). The gate is the shared `isContact` (`src/sim/ai/targeting.ts`), so target choice, the idle clock and `threatAstern` agree; anti-aircraft fire (`aaFire.ts`) reads the same range. Sun above the horizon: exactly the old 8,000 m rule.

| Constant (`PERCEPTION_DEFAULTS`) | Value | Status |
| --- | --- | --- |
| `rDayM` | 8,000 m (5.0 mi) | existing `DETECTION_RANGE_M` |
| `sRefLux` | 400 lux | the sunset anchor of `TWILIGHT_LUX` |
| `k` | 0.25 | ESTIMATE |
| `rFloorM` | 400 m (0.25 mi) | ESTIMATE |
| `rNavM` at `iNavCd` | 6,000 m (3.7 mi) at 120 cd (the three-light set) | ESTIMATE, no period source found yet |
| `sGlareLux` | 3.4 lux | ESTIMATE (civil twilight end) |
| `holdFactor` | 1.25 | ESTIMATE |

Resulting ranges, clear sky: deep night dark 0.52 mi, lit 3.7 mi; J5 dusk dark 0.74 mi; a flare 300 m away lifts a dark aircraft to 1.9 mi; a searchlight beam at 3 km to 3.4 mi. Tune in DEV with `?perception=k:0.3,rNavM:5000` (keys are the table's names; a typo throws). The values ride in the world's `night.tuning`, so they are checksummed.

Determinism: the world carries an optional `night` fact (authored lights, launch hour, cloud cover; attached by `nightFactsFor` when the scenario authors lights or the sun is below 0.5 degrees at launch or two hours later) and each aircraft an optional `lightsOff` flag. Both are absent in every day world, so day checksums are unchanged. `N` is applied to the world before the frame's fixed steps (`main.ts`) and recorded as the existing `lights` action; `verify.ts` applies the same action when it replays. The DEV reproduction refuses a different launch hour with a plain message. Recorder evidence `sighted` says who first chose the player, how far, and the limit.

Diagnostics: `__ww2.perception()`; the DEV overlay's lines under the position (lights ON/OFF, seen-out-to range, each enemy as CHASING, sees you or blind). Test bed: "Night Patrol (dev)" (`content/scenarios/night-patrol.json`). Correctness: `tests/e2e/nightPerception.spec.ts`; captures: `npm run capture:e2e -- nightPerceptionCapture.spec.ts`; unit: `tests/sim/lights/{sun,perception}.test.ts`, `tests/sim/ai/perception.test.ts`, `tests/sim/weapons/aaPerception.test.ts`, `tests/sim/nightFacts.test.ts`, `tests/flightRecorder/lightsReplay.test.ts`.

## Sights (F6B, built through checkpoint 2, 2026-10-15)

The `U` impact marker is the **bombsight** (B2's ring, unchanged physics: `predictImpact`, held to the real sim to 1 cm) and, with a torpedo as the next store, the **torpedosight**. Both are information aids; no weapon, flight or dispersion code changed. **Player-facing change (Mark 2026-10-15): the marker is no longer available to every pilot.** In the campaign and single missions it needs Lieutenant Commander or above (`abilities(tier).sights`); Dev (the checkbox in the production headquarters/picker) and every Training Ground row, the Basic Flying tutorial included, always have it. Weapons can always be released; only the aid is gated (`sightsAllowed`, `src/sim/sortie.ts`; the gate is applied in `main.ts`, where a closed gate clears the marker). The rank fact is wired through F5B's headquarters: `bootHq.assign` sets `CampaignSortie.sights` from `pilotSights(c, pilotId)` (`src/render/hq/launchRules.ts`, `abilities(tier).sights`), the title copies it onto `SortieChoice.sights`, and the launch records `facts.sights` beside the reserved facts keys. DEV `?sights=on|off` forces the gate either way.

Torpedosight (`predictTorpedoDrop`, `src/sim/weapons/impactPrediction.ts`): the real projectile step from the rack the release would use, and the sim's own envelope (`torpedoDropOk`, `combat.ts`, shared with `releaseBomb`): airspeed at most `maxDropSpeedMps`, release height above the sea at most `maxDropHeightM`, entry over open sea, bay doors open. What is drawn: a ring at the water-entry point, with a dot at its center and the word ENTRY beside it (plain green ring when the drop is valid; red ring WITH a solid X inside when not), and a thin line from the ring along the drop heading (the torpedo's run). There is no arming mark: **Mark 2026-10-15, arcade ruling: torpedoes arm the moment they are in the water** (`armRunM` is 0 in every torpedo's content, Mk 13 and Type 91, so there are no duds from a short run; the dud branch in `combat.ts` stays but no shipped content reaches it). The small yellow ring that is often near the horizon is not part of the sight: it is the existing gun pipper, drawn with the sight off too. The badge says the verdict in words and imperial units (`TORPEDOSIGHT NO DROP: TOO HIGH 3883 FT (MAX 2395) · ENTRY 1.0 MI`); the ENTRY label is `aria-hidden` and screen readers hear only a change of verdict, at most once a second. **Known limit:** hulls and decks under the entry point are not modeled (a drop onto a ship reads green and breaks up in the sim), as for the bombsight. Tests: `tests/sim/weapons/torpedoPrediction.test.ts` (against `stepCombat`, enrolled over every torpedo store), `tests/render/impactMarker.test.ts`, `tests/sim/sortieSights.test.ts`, `tests/e2e/sights.spec.ts`; captures: `npm run capture:e2e -- nightSightsCapture.spec.ts`.

Not modeled (Perception): **enemy radar** (Mark 2026-10-15: later, its own plan; the player's radar is an instrument only and does not change AI behavior), line of sight and cloud occlusion, observer altitude and silhouette, aspect, exhaust glow and muzzle flash, the observer's own lights.

**Scheduled lights are on the mission clock (F10D, 2026-10-17).** A light's `schedule` (`onAtS`, `offAtS`, `burnS`) reads `tick - night.clockOriginTick`, not the world's own tick, in both the sim
(`perceptionAt`) and the renderer (`nightLights.update`). A scene's pre-roll sets `clockOriginTick` to its handoff tick when it BEGINS (`beginPreroll`), so a light with a negative `onAtS`
ignites during an opening and is already burning at mission time 0, and a flight with no opening finds it burning from tick 0 (origin 0). This is what lets J4's flare be both the opening's ignition and
the mission's attack window (`release.window`). The sun is not affected: it follows the real hour. Tests: `tests/sim/scene/lightClock.test.ts`.
