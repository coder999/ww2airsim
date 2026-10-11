# Zuikaku Blender replacement handoff (2026-10-11)

Worktree: `/home/mark/projects/ww2airsim-zuikaku-blender`; branch: `blender-zuikaku-cv`; base: `863c290eef9928d82d23645a22a03d43a578249b`. Unattended, final-product-only checkpoint. This branch has not been pushed or merged.

## Outcome

`zuikaku-cv` is now an original Blender/`kit.py` Shokaku-class carrier representing Zuikaku in late October 1944. It replaces the external Shokaku stand-in under the same ID and keeps the live flight, trap, damage, smoke and balanced-armament contracts unchanged.

- Model: `tools/models/blender/zuikaku-cv.py`
- Entry: the existing `tools/models/entries/zuikaku-cv.json`, now `source.kind: "blender"`
- Output: `content/ships/zuikaku-cv.glb`
- Final output: 1,087,924 bytes, 15,160 triangles, 6 draw calls; SHA-256 `4b9c94080490f37c1cc9d3aefc21f9ef52f03bf634bab08252ba011f4807f1be`
- Replaced output: 946,688 bytes, 10,606 triangles, 6 draw calls.
- A second final build produced the same SHA-256 byte for byte.

The external model remains credited in `ASSETS.md` as a retired proportions reference. It is not an input to the Blender script or shipped output.

## Sources and measurements

**CITED:** English Wikipedia, [Shokaku-class aircraft carrier](https://en.wikipedia.org/wiki/Sh%C5%8Dkaku-class_aircraft_carrier), Specifications and Flight deck and hangars, read 2026-10-11: 257.5 m (844 ft 10 in) overall length, 29 m (95 ft 2 in) maximum beam, 9.32 m (30 ft 7 in) deep-load draft, 23 m (75 ft 6 in) moulded depth, 34.5 kn; 242.2 × 29.0 m (794 ft 7 in × 95 ft 2 in) flight deck; two hangars; three elevator sizes; ten arrestor wires; and eight twin Type 89 127 mm mounts.

**CITED / MEASURED:** Wikimedia Commons, [Fig of japanese aircraft carrier Zuikaku in 1944.gif](https://commons.wikimedia.org/wiki/File:Fig_of_japanese_aircraft_carrier_Zuikaku_in_1944.gif), SnowCloudInSummer, CC BY-SA 3.0, read 2026-10-11. The drawing is explicitly October 1944 and cites *Nihon Kaigun Kantei Zumenshu*, 4th ed. (1978), and *Shashin Nihon no Gunkan*, vol. 3 (1989). It was fetched through the Commons API and canonical `Special:FilePath` route. Its 0–50 m scale bar is 205 px (4.10 px/m), while the 257.5 m hull reads 1,037 px (4.03 px/m). The profile and plan established the long slab-sided hangar, sheer, waterline/deck widths, island at about +35 m, elevators near +72/0/−70 m, starboard funnel/masts, gallery rhythm and camouflage character. Temporary source and measurement files were removed before commit.

The script records this symmetric measured station table, with +x forward and the waterline at y=0:

| x from midships (m) | −128.8 | −121 | −110 | −95 | −60 | 0 | +60 | +95 | +115 | +128.8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| half-width (m) | 0.5 | 4.0 | 8.4 | 11.5 | 13.0 | 13.0 | 13.0 | 11.6 | 6.5 | 0.4 |
| deck height (m) | 5.5 | 7.5 | 8.3 | 9.0 | 9.4 | 9.4 | 9.4 | 10.0 | 10.8 | 11.5 |

The fixed-camera side/plan contact sheet was visually compared with the cited drawing. The hull length, sheer, long hangar, island station and three elevator stations agree at this level of detail. The model does not trace or reproduce drawing pixels.

## What is fitted and what is estimated

**FITTED:** the existing simulation contract remains authoritative where gameplay already depends on it. `FlightDeck` is exactly 242.2 × 29.0 m (794 ft 7 in × 95 ft 2 in), its top is exactly 15.5 m (50 ft 10 in), `TrapBand` stays probeable and unobstructed, the waterline beam is the spec's 26.0 m (85 ft 4 in), the smoke origin remains `[25, 34.4, 18.9]`, bow is +x and the island is starboard. The full hull reaches the cited −9.32 m (−30 ft 7 in) keel.

All eight twin Type 89 mounts and the four deliberately balanced Type 96 triple mounts are at the existing spec's exact positions. Their `Turret1`…`Turret8` and `LightAA1`…`LightAA4` locators use the existing hierarchy, train and elevate at runtime, and each locator stands on modeled gallery/sponson geometry. The real late-1944 ship carried much more 25 mm armament; this branch intentionally preserves the simulation's four-triple balance fit.

**ESTIMATE / modeling choice:** sectional fullness between measured stations; exact hangar ends/openings; platform thicknesses and supports; island tier, funnel, mast, radar and director dimensions; boats, rails, rigging and other fine fittings; exact camouflage polygon boundaries. The 26.0 m waterline beam and 15.5 m flight-deck height are inherited simulation estimates, not claimed drawing measurements. Camouflage follows the source drawing's late-1944 character but is simplified.

## Repository changes

- Added the original deterministic Blender script and updated its bake sidecars.
- Converted the same manifest from the external source to Blender; retained the 1.5 MB / 60k-triangle / 8-draw budget.
- Kept the existing ship spec's deck, trap zone, damage, smoke, ensign and balanced armament. Only the reference text and ensign hoist point were made honest for the new measured model.
- Added Zuikaku to the Blender ship raw-export checks and removed it from the twelve remaining Sketchfab downloads.
- Generalized the carrier-deck contract test to Essex and Zuikaku and pinned the new `flattop-hunt` roster in the E2E ship check.
- Added the source-credit row and documented the missing downloaded-ship-to-measured-Blender replacement process in `docs/models.md`.

## Verification

- Final deterministic rebuild: PASS, identical SHA-256 `4b9c9408…`; 1,087,924 bytes, 15,160 triangles, 6 draws.
- `REMOTE_RUN_OVERFLOW=0 remote-run` relevant post-restore suite: PASS, 16 files and 367 tests. This included raw Blender ship topology/coplanarity/palette/deck checks, all committed ship fit/armament/deck checks, download rebuilds, manifest parsing, render fit/models/palette/gun-laying, carrier takeoff/landing, trap logic, gun laying and ship rosters.
- The broader model run also passed `blenderEntries.test.ts`: all 38 tests, including a byte-identical Zuikaku rebuild. Its first pass exposed two branch defects (one missing fixture brace and twelve coplanar faces); both were fixed, and the focused raw-ship rerun passed 101/101 tests.
- Local Vite at `http://127.0.0.1:5198`, Playwright `ships.spec.ts` + `deckQuals.spec.ts`, one worker: the combined first pass was load-starved (3 passed, 9 failed: eight terrain/title/resource timeouts or resource errors and one low GPU-sample count). Required isolated reruns passed all four ship-validation scenarios, the Hangar side view, moving-deck attachment, full-throttle carrier launch, hook/legend and rendered-deck/wheel alignment. The deck luminance itself measured in range (runway 68.2, deck 45.5, ratio 0.667; shadowed deck 39.4), but its isolated assertion still failed because Chromium reported 24 `ERR_INSUFFICIENT_RESOURCES` loads; a second isolated try timed out at the title dialog. The isolated strike-range GPU check still recorded only 8 samples instead of >100. Those two failures are host-resource/performance evidence, not model-validation failures.

## Known limits

- The flight-deck collision/probe must remain a full 242.2 × 29.0 m rectangle for the simulation contract, so the visual outline is less tapered than the plan drawing.
- The source drawing supports the principal silhouette and stations, not every small fitting. No claim is made that every gallery, boat or radar dimension is exact.
- Only four triple 25 mm mounts are modeled because the live combat spec intentionally balances the ship that way.

## Capture and email

`zuikaku-old-new-contact.jpg` is a 48,571-byte JPEG contact sheet: old/new starboard side and plan views from identical orthographic cameras. `zuikaku-drawing-overlay.jpg` is a 109,701-byte JPEG with the new rendered centerline silhouette in red over the cited October 1944 drawing. The two attachments total 158,272 bytes and were sent as plain attachments from `alerts@marktuttle.dev` to `marktuttle1@gmail.com`. This handoff was also emailed through the repository handoff mailer.
