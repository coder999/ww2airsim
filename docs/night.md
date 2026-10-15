# Night: the renderer, the light contract, and their sources

Standing reference for the F6A night work (plan `docs/superpowers/plans/2026-10-14-f6a-night-renderer-lights.md`;
rulings D1-D9 are in that plan, section 7). Status of record is the handoff
for F6A once written; this file says what ships and where its numbers came from.

## What exists (checkpoint 1, 2026-10-14)

| Piece | Where |
| --- | --- |
| Night look constants (floor, moon, dusk, stars), pure | `src/render/sky/night.ts` |
| Floor and moon light in the palette | `src/render/sky/palette.ts` (`withMoonLight`) |
| Stars and moon on the dome | `src/render/scene/sky.ts` |
| Light contract: schema, `lightsAt`, `illuminanceAt`, `ambientNightLevel`, caps | `src/sim/lights/lights.ts` |
| Scenario `lights` array | `src/sim/scenario.ts` |

DEV `?night=floor:1.3,moon:0.8,dusk:1.1` overrides the three tunable scales for a session.
Look captures: `npm run capture:e2e -- nightCapture.spec.ts` (`NIGHT_QUERY` appends parameters).
Correctness: `tests/e2e/night.spec.ts`, `tests/render/night.test.ts`, `tests/sim/lights/lights.test.ts`.

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
| Parachute flare candlepower | 800,000 cd, 3 to 3.5 min | Navy OP 1664 via the National Museum of the USAF AN-M26 fact sheet (read 2026-10-14). That is the **AN-M26**, 50 in and 53 lb; the F4 model is the M24 (37 in, 47 lb, TM 9-981) | M24 value is an ESTIMATE borrowed from the M26 |
| Flare descent rate | 2.4 m/s (about 8 ft/s) | none | ESTIMATE |
| Flare pot, harbor lantern, nav light, aircraft position light | 50 / 100 / 100 / 40 cd | none | ESTIMATE |
| Aircraft position light colors | red port, green starboard, white tail | standard practice of the period; per-type layout not sourced | ESTIMATE for placement (Task 7) |
| Twilight and moonlight illuminance for `ambientNightLevel` | anchors in `TWILIGHT_LUX`, half moon 0.05 lux | none | ESTIMATE |
| Landing lights per airframe (D7: position lights only unless period evidence) | none installed | not yet researched per type | Open: resolve per airframe before Task 7 puts any landing light in; until then none |

Open for Task 1 (deferred, not done): the nine-view budget baseline on ryzen (taken at Task 11, against main, since
nothing before it touches those views' cost on purpose) and per-airframe landing-light evidence.
