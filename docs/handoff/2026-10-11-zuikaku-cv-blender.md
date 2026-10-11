# Zuikaku Blender comparison handoff (2026-10-11)

Worktree: `/home/mark/projects/ww2airsim-zuikaku-blender`; branch: `blender-zuikaku-cv`; base: `863c290eef9928d82d23645a22a03d43a578249b`. Unattended, final-product-only checkpoint. This branch has not been pushed or merged.

## Outcome

The existing external `zuikaku-cv` Shōkaku stand-in remains byte-for-byte intact and remains the sole gameplay/scenario ship. A separate Hangar-only comparison, `zuikaku-cv-blender`, is an original Blender/`kit.py` Shōkaku-class carrier representing Zuikaku in late October 1944.

- Original external output: `content/ships/zuikaku-cv.glb`; 946,688 bytes; SHA-256 `b3514e88b664cfa7ba009f2aac5221c2a34edadc774e7a041fd87b717e7a7b05` (identical to the base commit).
- Original external manifest/spec: `tools/models/entries/zuikaku-cv.json` and `content/ships/zuikaku-cv.json`, restored unchanged from the base commit.
- Blender source: `tools/models/blender/zuikaku-cv-blender.py`.
- Blender entry/output: `tools/models/entries/zuikaku-cv-blender.json` and `content/ships/zuikaku-cv-blender.glb`.
- Blender output: 1,087,964 bytes, 15,160 triangles, 6 draw calls; SHA-256 `25adbff35e2ebc3f188456c8644744b21bc2545de5d75b287fcd0777e734c7d9`.
- Library card: `content/library/zuikaku-cv-blender.json`, explicitly `displayOnly: true`, borrowing `spec: "zuikaku-cv"` while overriding the model so the shared Hangar ship loader can pose the fitted guns. It is not enrolled in missions or gameplay.

## Sources and measurements

**CITED:** English Wikipedia, [Shōkaku-class aircraft carrier](https://en.wikipedia.org/wiki/Sh%C5%8Dkaku-class_aircraft_carrier), Specifications and Flight deck and hangars, read 2026-10-11: 257.5 m (844 ft 10 in) overall length, 29 m (95 ft 2 in) maximum beam, 9.32 m (30 ft 7 in) deep-load draft, 23 m (75 ft 6 in) moulded depth, 34.5 kn; 242.2 × 29.0 m (794 ft 7 in × 95 ft 2 in) flight deck; two hangars; three elevator sizes; ten arrestor wires; and eight twin Type 89 127 mm mounts.

**CITED / MEASURED:** Wikimedia Commons, [Fig of japanese aircraft carrier Zuikaku in 1944.gif](https://commons.wikimedia.org/wiki/File:Fig_of_japanese_aircraft_carrier_Zuikaku_in_1944.gif), SnowCloudInSummer, CC BY-SA 3.0, read 2026-10-11. The drawing is explicitly October 1944 and cites *Nihon Kaigun Kantei Zumenshu*, 4th ed. (1978), and *Shashin Nihon no Gunkan*, vol. 3 (1989). It was fetched through the Commons API and canonical `Special:FilePath` route. Its 0–50 m scale bar is 205 px (4.10 px/m), while the 257.5 m hull reads 1,037 px (4.03 px/m). The profile and plan established the long slab-sided hangar, sheer, waterline/deck widths, island at about +35 m, elevators near +72/0/−70 m, starboard funnel/masts, gallery rhythm and camouflage character. Temporary source and measurement files were removed before commit.

The script records this symmetric measured station table, with +x forward and the waterline at y=0:

| x from midships (m) | −128.8 | −121 | −110 | −95 | −60 | 0 | +60 | +95 | +115 | +128.8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| half-width (m) | 0.5 | 4.0 | 8.4 | 11.5 | 13.0 | 13.0 | 13.0 | 11.6 | 6.5 | 0.4 |
| deck height (m) | 5.5 | 7.5 | 8.3 | 9.0 | 9.4 | 9.4 | 9.4 | 10.0 | 10.8 | 11.5 |

The fixed-camera side/plan contact sheet was visually compared with the cited drawing. The hull length, sheer, long hangar, island station and three elevator stations agree at this level of detail. The model does not trace or reproduce drawing pixels.

## What is fitted and what is estimated

**FITTED:** the existing `zuikaku-cv` simulation contract remains authoritative for the comparison model. `FlightDeck` is exactly 242.2 × 29.0 m (794 ft 7 in × 95 ft 2 in), its top is exactly 15.5 m (50 ft 10 in), `TrapBand` stays probeable and unobstructed, the waterline beam is the spec's 26.0 m (85 ft 4 in), the smoke origin remains `[25, 34.4, 18.9]`, bow is +x and the island is starboard. The full hull reaches the cited −9.32 m (−30 ft 7 in) keel.

All eight twin Type 89 mounts and the four deliberately balanced Type 96 triple mounts are at the existing spec's exact positions. Their `Turret1`…`Turret8` and `LightAA1`…`LightAA4` locators use the existing hierarchy, train and elevate at runtime, and each locator stands on modeled gallery/sponson geometry. The real late-1944 ship carried much more 25 mm armament; this model intentionally preserves the simulation's four-triple balance fit.

**ESTIMATE / modeling choice:** sectional fullness between measured stations; exact hangar ends/openings; platform thicknesses and supports; island tier, funnel, mast, radar and director dimensions; boats, rails, rigging and other fine fittings; exact camouflage polygon boundaries. The 26.0 m waterline beam and 15.5 m flight-deck height are inherited simulation estimates, not claimed drawing measurements. Camouflage follows the source drawing's late-1944 character but is simplified.

## Repository changes

- Preserved the original external entry, source cache/output, ship spec and attribution under `zuikaku-cv`.
- Added deterministic Blender source, bake sidecars and output under `zuikaku-cv-blender`, retaining the 1.5 MB / 60k-triangle / 8-draw budget.
- Registered the duplicate model in `SHIP_MODELS`, the Blender ship checks, carrier-deck contract checks, Hangar catalog and checks 10/16.
- Added an explicit display-only Library card with base-spec/model-override linkage; did not add the duplicate to any scenario or gameplay roster.
- Documented the downloaded-ship comparison workflow in `docs/models.md`.

## Verification

- Final deterministic rebuild: PASS. Rebuilding `zuikaku-cv-blender` again produced 1,087,964 bytes, 15,160 triangles, 6 draw calls and the same SHA-256 `25adbff35e2ebc3f188456c8644744b21bc2545de5d75b287fcd0777e734c7d9`.
- Focused post-restore `REMOTE_RUN_OVERFLOW=0 remote-run` suite: PASS, 5 files and 210/210 tests. It covered raw Blender ship topology/coplanarity/palette/deck checks, both Zuikaku model entries' live-spec fit, armament, smoke and carrier-deck contracts, all thirteen external rebuilds (including the restored Fletcher and external Zuikaku), manifest parsing and the complete ship-model registry.
- Focused Hangar budget and provenance tests: PASS, 2 files and 12/12 tests.
- The Hangar model-selection unit suite stops before collecting tests on this standalone branch because the current strict Library parser rejects the new `displayOnly` key. That is the expected boundary with the separately owned shared schema/ship-override-loader change; no competing parser or loader change was added here.
- Local-Vite Hangar checks 10 and 16 were not rerun against this standalone branch for the same parser dependency. Both checks previously exercised the identical authored geometry under the replacement ID; final duplicate-card execution must be rerun after the shared lifecycle commit is integrated.
- The earlier full ship/deck E2E evidence remains applicable to the identical authored geometry: isolated Hangar side view, moving-deck attachment, carrier launch, hook/legend and deck/wheel alignment passed. Two broader checks remained host-resource/performance limited (`ERR_INSUFFICIENT_RESOURCES` and an undersampled GPU range run), not model-validation failures.

## Known limits and integration dependency

- The flight-deck collision/probe remains a full 242.2 × 29.0 m rectangle for the simulation contract, so the visual outline is less tapered than the plan drawing.
- The source drawing supports the principal silhouette and stations, not every small fitting. No claim is made that every gallery, boat or radar dimension is exact.
- Only four triple 25 mm mounts are modeled because the live combat spec intentionally balances the ship that way.
- Mount motion on the display-only duplicate requires the shared Hangar ship-override loader change being integrated separately. This branch intentionally does not duplicate that shared runtime implementation or relax the shared Library duplicate-spec invariant.

## Capture and email

`zuikaku-old-new-contact.jpg` is a 48,571-byte JPEG contact sheet: the preserved external model and authored comparison from identical starboard-side and plan cameras. `zuikaku-drawing-overlay.jpg` is a 109,701-byte JPEG with the authored centerline silhouette in red over the cited October 1944 drawing. The two attachments total 158,272 bytes and were sent as plain attachments from `alerts@marktuttle.dev` to `marktuttle1@gmail.com`. The original handoff was also emailed; this corrected comparison-ID handoff supersedes it.
