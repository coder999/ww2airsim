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
