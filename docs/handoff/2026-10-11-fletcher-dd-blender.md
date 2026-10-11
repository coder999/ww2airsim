# Fletcher-class destroyer Blender comparison-duplicate handoff

Date: 2026-10-11
Worktree: `/home/mark/projects/ww2airsim-fletcher-blender`
Branch: `blender-fletcher-dd`
Base: `863c290eef9928d82d23645a22a03d43a578249b`

## Outcome

`fletcher-dd-blender` is an original, deterministic Blender-authored Fletcher-class destroyer kept beside the existing external `fletcher-dd` for direct Hangar comparison. The gameplay scenarios and original `fletcher-dd` entry, GLB, bake and JZHU credit are preserved. Its Library card is explicitly `displayOnly`, points at the authoritative `fletcher-dd` spec and overrides only the model with `fletcher-dd-blender`; it adds no gameplay spec and is not referenced by scenarios. The Blender model keeps the ship-frame contract (+x bow, +y up, +z starboard, origin amidships at the waterline), the 114.8 m length, all five 5 in/38 mount locators, the late-war AA locators, two torpedo banks, smoke origin, keel, bow detection, damage/list/sink behavior, and the existing budgets.

The Blender duplicate is 1,139,248 bytes, 17,886 triangles and 7 draw calls (external download: 2,681,556 bytes, 43,316 triangles and 15 allowed draw calls). The final duplicate hash and exact rebuild result are recorded under Verification.

All five named main mounts are Blender nodes at the preserved spec positions. The build keeps one donor per kit and `src/render/scene/ship.ts` instances the other spec mounts; `shipMounts.ts` splits each gun child so every 5 in/38 mount trains and elevates independently. The generated Bofors and Oerlikon mounts retain their spec positions and sit on modeled deckhouses or platforms. The two quintuple 21-inch banks are modeled as static fittings because the destroyer has no torpedo-firing simulation seam.

## Sources and measurement

The primary geometry source is the public-domain [U.S. Navy Bureau of Ships Measure 32 Design 13D Fletcher-class pattern sheet](https://commons.wikimedia.org/wiki/File:Pattern_sheet,_MS-32_13D_for_Fletcher_class.jpg), dated 22 June 1944. It supplies a scaled starboard profile, port profile, plan, and sections. The 1954 [Fletcher-class technical drawing](https://commons.wikimedia.org/wiki/File:Fletcher-class_destroyer_technical_drawing_1954.jpg) was a secondary arrangement check only; its postwar equipment was not copied. Overall dimensions and armament were checked against [English Wikipedia's Fletcher-class specifications](https://en.wikipedia.org/wiki/Fletcher-class_destroyer) and [NHHC DANFS, Fletcher I](https://www.history.navy.mil/research/histories/ship-histories/danfs/f/fletcher.html), all read 2026-10-11.

The script records every figure as CITED, MEASURED, FITTED, or ESTIMATE. With the drawing scaled from the cited 114.8 m overall length, the plan stations are:

| aft of bow (m) | model x (m) | half-width (m) | feature |
|---:|---:|---:|---|
| 0.0 | 57.4 | 0.4 | raked stem |
| 6.0 | 51.4 | 2.5 | flare begins |
| 16.0 | 41.4 | 4.8 | No. 1 / forecastle |
| 28.0 | 29.4 | 5.8 | No. 2 / bridge front |
| 46.0 | 11.4 | 6.0 | forward stack / first torpedo bank |
| 62.0 | -4.6 | 6.0 | after stack |
| 78.0 | -20.6 | 5.9 | after deckhouse / No. 3 |
| 92.0 | -34.6 | 5.6 | Nos. 4 and 5 group |
| 107.0 | -49.6 | 4.6 | quarterdeck |
| 114.8 | -57.4 | 3.1 | transom |

Measured profile heights put the weather deck about 3.2 m above water aft, 3.6–3.8 m amidships, 5.4 m at the forecastle guns, bow sheer about 8.2 m, funnel mouths about 14.9 m, and foremast truck about 25 m. Fixed-camera side and top silhouettes were overlaid on the drawing. The overall hull length, plan taper, sheer, major deck breaks, two-stack arrangement and five-mount stations match it closely.

The exact section curvature, underwater run, deckhouse corner radii, mast/radar/director dimensions, vents, boats, railings, rigging, Mk 30 gunhouse form, and torpedo-mount detail remain estimates. Paint uses the project's `usn-1944` palette rather than literally reproducing Design 13D. The external JZHU model was viewed only as a proportions and same-camera comparison; no mesh or texture was copied. It has finer small fittings than the Blender duplicate; the new model prioritizes an original, measured silhouette and the renderer's moving-kit contract.

## Repository changes

- Added `tools/models/blender/fletcher-dd-blender.py`, its manifest, baked maps and `content/ships/fletcher-dd-blender.glb`.
- Added an explicit `displayOnly: true` Hangar Library card with `spec: fletcher-dd` plus a `fletcher-dd-blender` ship-model override, and the matching `SHIP_MODELS` registration. No duplicate gameplay spec or scenario reference was added.
- Restored and preserved the original external `fletcher-dd` manifest, GLB, bake, source cache, Hangar provenance and JZHU credit.
- Pinned only `fletcher-dd-blender` in the Blender ship suite; the original remains in the Sketchfab/download suites.
- Updated Hangar's warship-card motion check so both Fletchers participate. This relies on the coordinated shared Hangar loader change that applies a ship card's model override through `createShipView`, preserving the base spec's train/elevate rig rather than loading it as static geometry.
- Updated `ASSETS.md` and `docs/models.md` for the intentional side-by-side assets and the ship-duplicate registration process.

## Verification

- The original model-design run passed Blender bake/build, byte-identical rebuild, raw ship geometry/coplanar checks, renderer, gun-laying, main-battery, Hangar budget/provenance/skin checks and the all-warship train/elevate/restore check. The unrelated Type B Maru strike-range sampling check and scenario-level AA acquisition capture reproduced their failures and remain documented rather than represented as passes.
- `remote-run npx vitest run tests/tools/models/blenderEntries.test.ts -t fletcher-dd-blender --maxWorkers=1`: **1 passed**, 37 skipped. The duplicate rebuilt byte-identically.
- Focused model/ship validation (`blender/ships`, `shipModels`, downloaded `shipEntries`, `sketchfabEntries`, outputs, skins, renderer registry, and model credits): **8 files, 438 tests passed**. This includes a byte-identical rebuild of the preserved external `fletcher-dd` from the pinned raw cache and all 74 ship fit/armament checks across both Fletcher entries.
- Final duplicate: **1,139,248 bytes**, **17,886 triangles**, **7 draw calls**, SHA-256 `225d378c9e06f910de7c5a66f7d66a0b782f611a35f83102cfce574f8b13f56b`.
- Preserved external output: SHA-256 `125d5600289efde288002298692dedce767f67df9527ed3d9cfdfd4ef478bcac`; preserved raw cache: SHA-256 `847a5fe51a34b7bc1caba03dbebb28d310789f3f9b0ff409e1ff9cee802de127`. A diff against base over the original entry, GLB, bakes, credit and download tests is empty.
- The card intentionally uses the coordinated shared `displayOnly` Library schema and Hangar ship-override loader change. This asset branch does not duplicate that shared runtime work, so the final two-card Hangar motion E2E must run after both commits are integrated; otherwise this branch's older schema rejects `displayOnly` before runtime.

## Shared-cache incident

The first same-id build attempt wrote the generated raw GLB to the shared `tools/models/cache/fletcher-dd.glb`, temporarily replacing the pinned download raw used by other worktrees (unexpected hash `98490f…`). The file was restored from the repository's existing verified candidate copy and is back to the pinned SHA-256 `847a5fe51a34b7bc1caba03dbebb28d310789f3f9b0ff409e1ff9cee802de127`. Other active model agents were notified. The final asset uses `fletcher-dd-blender`, so its build cache is separate and both models coexist. `docs/models.md` records both the preferred duplicate-id path and the same-id hazard.

## Review attachments

The three JPEGs total 265,238 bytes:

- `2026-10-11-fletcher-dd-blender-shots/fletcher-dd-side-comparison.jpg` — external download and new raw Blender model, identical fixed orthographic side camera.
- `2026-10-11-fletcher-dd-blender-shots/fletcher-dd-top-comparison.jpg` — identical fixed orthographic top camera.
- `2026-10-11-fletcher-dd-blender-shots/fletcher-dd-drawing-overlay.jpg` — red side/top Blender silhouettes over the 1944 Bureau of Ships sheet.

The comparison renders use the dry-run raw export so all five named main turrets are visible. A standalone preview of the committed optimized GLB shows only donor kits by design; runtime instances are verified in the Hangar.

No branch was pushed or merged.
