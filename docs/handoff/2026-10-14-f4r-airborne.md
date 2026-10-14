# F4R airborne rework: parachutes and Ki-57 windscreen

**Date:** 2026-10-14  **Branch:** `f4r-airborne` (from `f4-night-site-assets`)

Review image: `2026-10-14-f4r-airborne-before-after.png` (Hangar, before left, after right).
Capture tool: `tests/e2e/airborneCapture.spec.ts` (`npm run capture:e2e -- airborneCapture.spec.ts`).

## What changed

| Asset | Triangles before | after | Draws | Bytes before | after |
| --- | ---: | ---: | ---: | ---: | ---: |
| `parachuting-person-rig` | 2,576 | 5,868 | 6 to 8 | 156,464 | 387,332 |
| `paratrooper-supply-bundle` | 1,956 | 3,408 | 6 | 132,128 | 245,252 |
| `m24-aircraft-parachute-flare` | 324 | 1,288 | 4 | 28,656 | 126,364 |
| `ki-57-ii-topsy` | 5,758 | 5,760 | 21 | 347,892 | 345,028 |

- **Canopy (all three parachutes).** New shared builder `tools/models/blender/parachute.py`: an
  ellipsoidal round bell (rounded crown, widest just above the tucked skirt), thin closed shell,
  billow between gore seams, scalloped hem that rises between seams, gore-seam webbing
  (`CanopyRibs`) and lines that run from the seam hem points to harness risers (person: four
  connector links over the head) or four corner lugs (bundle) or the canister (flare). The old
  canopy was a flat-topped solid; its profile started at the skirt with the widest ring, hence
  the mushroom. Bell is slightly smaller in diameter (person 8.0 m vs 8.5 m, bundle 4.4 m vs 4.9 m)
  and taller (person apex 7.05 m vs 6.37 m); footprint otherwise unchanged. All figures are ESTIMATES
  and the script headers say so.
- **Person.** Rebuilt: torso, jacket skirt, pelvis, arms, thighs, shins, knee pads, M1-style helmet
  with chin strap, jump boots, hands on the risers, harness (shoulder, chest, waist, leg straps,
  D-rings), back pack and chest reserve (`CanopyClosed`). Two new nodes, `PersonHelmet` and
  `PersonBoots` (palette roles are one per node), added to the entry's `keep`. Harness and risers sit in
  `SuspensionLines`. Budget unchanged (20,000 tris, 12 draws); not raised.
- **Skin atlas lesson.** One chart per face on a canopy with thousands of faces shrinks the 512 px
  atlas to nothing and bleeds color across the person. All three scripts use `m.shared_chart()`.
- **Ki-57-II windscreen (diagnosis).** The glazing existed but lay entirely inside the fuselage skin:
  canopy crown y .83 to .64 vs fuselage top y 1.03 at x 3.15 and .85 at x 4.5; the added front and side pane
  boxes were also buried. Fix: faired canopy raised above the deck (crown 1.36 down to .80), raked down onto the
  nose, four framing hoops (`CockpitGlass`, `CockpitFrames` unchanged names), buried pane boxes
  removed. Nothing else in the Ki-57 changed.
- M24 flare uses the same canopy (8 gores, 8 lines); node names unchanged.

## Verification (honest)

- `npx tsx tools/models/build.ts <id>` for the four ids; GLBs committed.
- On ryzen via `remote-run`: `tests/tools/models` + `tests/render/staticModels.test.ts`:
  57 files, 1,821 tests pass, including the byte-identical rebuild of every Blender entry
  (the ryzen build matched the nexus build I committed).
- On ryzen: `tsc --noEmit` exit 0; `eslint tools tests/tools --max-warnings 0` exit 0 (not the full
  `src tests` lint); `tests/render/hangar tests/library tests/content` 218 pass.
- Local: `tests/tools/e2eClassification.test.ts` 4 pass after enrolling the new capture file.
- Captures ran on nexus's 680M (local Chromium, Vulkan), not the reference GPU; correctness/look only.
- Not run: the full `npm test` and E2E suites.

Tests updated: none needed beyond enrolling `airborneCapture.spec.ts` in `captureTools.ts`.
Tests still valid: model provenance, budgets, rigs, dimensions, determinism.
Known gaps: person torso is still box-built (rounded boxes); no gameplay flutter (unchanged, deferred).
