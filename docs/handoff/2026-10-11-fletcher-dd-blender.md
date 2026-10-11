# Fletcher-class destroyer Blender replacement handoff

Date: 2026-10-11  
Worktree: `/home/mark/projects/ww2airsim-fletcher-blender`  
Branch: `blender-fletcher-dd`  
Base: `863c290eef9928d82d23645a22a03d43a578249b`

## Outcome

`fletcher-dd` is now an original, deterministic Blender-authored Fletcher-class destroyer, replacing the same-id Sketchfab download without changing the gameplay ship specification. The model keeps the existing ship-frame contract (+x bow, +y up, +z starboard, origin amidships at the waterline), the 114.8 m length, all five 5 in/38 mount locators, the late-war AA locators, two torpedo banks, smoke origin, keel, bow detection, damage/list/sink behavior, and the existing budgets.

The committed GLB is 1,139,208 bytes, 17,886 triangles and 7 draw calls (previous download: 2,681,556 bytes, 43,316 triangles and 15 allowed draw calls). SHA-256: `0840064e51603b8601425e8951dafb09c54e33561ebe2d90d0725289467e22ed`.

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

The exact section curvature, underwater run, deckhouse corner radii, mast/radar/director dimensions, vents, boats, railings, rigging, Mk 30 gunhouse form, and torpedo-mount detail remain estimates. Paint uses the project's `usn-1944` palette rather than literally reproducing Design 13D. The retired JZHU model was viewed only as a proportions and same-camera comparison; no mesh or texture was copied. It has finer small fittings than the replacement; the new model prioritizes an original, measured silhouette and the renderer's moving-kit contract.

## Repository changes

- Added `tools/models/blender/fletcher-dd.py`, based on `kit.py` and `naval.py`.
- Converted `tools/models/entries/fletcher-dd.json` from a download entry to a Blender entry and rebuilt `content/ships/fletcher-dd.glb` plus its AO/normal bake.
- Added Fletcher to the Blender ship pinned suite; removed it from the Sketchfab roster and external Hangar/credit lists.
- Updated `ASSETS.md`, retaining the JZHU download as a retired proportions reference only.
- Updated Hangar warship count so the now-internal Fletcher participates in the all-mount motion check.
- Updated `docs/models.md` with the same-id shared-cache hazard, fixed-camera/raw-preview distinction, and the correct non-nested bake invocation.
- Deliberately left `content/ships/fletcher-dd.json` unchanged.

## Verification

- `npm run models:bake -- fletcher-dd` on nexus: PASS; it dispatched to Ryzen's RX 6700 XT (AO 3.4 s, normal 0.9 s). Wrapping this in `remote-run` was tried first and timed out in the nested SSH job; the standing docs now prohibit that.
- `npm run models:build -- fletcher-dd`: PASS, 1,139,208 bytes / 17,886 triangles / 7 draw calls.
- Focused repaired Vitest set (`blender/ships`, `shipModels`, `modelCredits`): 3 files, 133/133 PASS.
- Exact deterministic rebuild (`blenderEntries -t fletcher-dd`): 1/1 PASS (37 skipped); byte-identical in 8.1 s.
- Broad required remote-run (`tests/tools/models`, ship renderer, Hangar catalog/provenance/credits, gun laying, main battery): initially 56/57 files and 1,419/1,420 tests passed. The sole failure was the stale external-roster count (13 expected, 12 actual after Fletcher's conversion), not model geometry. After updating it, the affected file reran 25/25 PASS. Fletcher's deterministic rebuild took 7.276 s; its raw geometry/coplanar suite, renderer, gun-laying, and main-battery tests all passed.
- `tests/e2e/ships.spec.ts --workers=1`: 5/6 PASS. Fletcher free-flight, deck-qualification and Hangar side rendering passed; the only failure was the unrelated `strike-range: ship models draw at 1440p`, which loads Type B Maru and collected 8 GPU samples instead of >100. Two isolated reruns reproduced 9 samples, so this is not being represented as a pass.
- Hangar checks 10, 14, 15, 16 and 17 were run together: check 16 passed; 10/14 failed on transient model fetches, 15 hit its documented load-sensitive screenshot timeout, and 17 first exposed the now-correct 13-ship roster count. After the other GPU jobs finished, the required isolated reruns all passed: checks 10+14, 2/2 in 10.9 s; check 15, 1/1 in 25.2 s; and check 17, 1/1 in 34.9 s. Fletcher drew at 17,982 scene triangles / 8 scene draws, under its 45,000 / 12 budgets; all 13 warships' gun mounts trained, elevated and restored independently.
- `gunLayingCapture.spec.ts`: FAIL twice, both at the 120 s acquisition wait before capture (`aa.laying` never reported an aircraft target). This scenario-level AA acquisition failure reproduced in a quiet isolated rerun; it is not being represented as a pass. The deterministic gun-laying unit suite and Hangar per-mount motion check both passed.

## Shared-cache incident

The first same-id Blender build wrote the generated raw GLB to the shared `tools/models/cache/fletcher-dd.glb`, temporarily replacing the pinned download raw used by other worktrees (unexpected hash `98490f…`). The file was restored from the repository's existing verified candidate copy and is now back to the pinned SHA-256 `847a5fe51a34b7bc1caba03dbebb28d310789f3f9b0ff409e1ff9cee802de127`. Other active model agents were notified. `docs/models.md` now calls out this shared-cache hazard and the restore step explicitly.

## Review attachments

The three JPEGs total 265,238 bytes:

- `2026-10-11-fletcher-dd-blender-shots/fletcher-dd-side-comparison.jpg` — retired download and new raw Blender model, identical fixed orthographic side camera.
- `2026-10-11-fletcher-dd-blender-shots/fletcher-dd-top-comparison.jpg` — identical fixed orthographic top camera.
- `2026-10-11-fletcher-dd-blender-shots/fletcher-dd-drawing-overlay.jpg` — red side/top Blender silhouettes over the 1944 Bureau of Ships sheet.

The comparison renders use the dry-run raw export so all five named main turrets are visible. A standalone preview of the committed optimized GLB shows only donor kits by design; runtime instances are verified in the Hangar.

No branch was pushed or merged.
