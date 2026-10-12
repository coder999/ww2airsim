# Blender aircraft fleet promotion

Date: 2026-10-11

Mark approved the seven drawing-based Blender comparisons. They now supply the gameplay airframes; the downloaded predecessors remain in the Dev Hangar as archived comparisons.

## Result

| Flight spec | Active asset/model | Archived Dev-only asset | Retired model kept |
| --- | --- | --- | --- |
| `a6m2-zero` | `a6m2-zero-blender` | `a6m-zero` | `a6m2-zero` |
| `ki-43-oscar` | `ki-43-oscar-blender` | `ki-43-oscar` | `ki-43-oscar` |
| `f4f-wildcat` | `f4f-wildcat-blender` | `f4f-wildcat` | `wildcat` |
| `f4u-corsair` | `f4u-corsair-blender` | `f4u-corsair` | `f4u-corsair` |
| `f6f-hellcat` | `f6f-hellcat-blender` | `f6f-hellcat` | `f6f-hellcat` |
| `b-17-flying-fortress` | `b-17-flying-fortress-blender` | `b-17-flying-fortress` | `b-17-flying-fortress` |
| `d3a-val` | `d3a-val-blender` | `d3a-val` | `d3a-val` |

The archived cards keep their original ids, source credit, spec figures and GLBs. They are `displayOnly: true`, `status: archived`, hidden in the ordinary Hangar, and visible with `?dev=1`. The active card owns the canonical name, roster name and flight spec. The right-hand Asset ID row remains Dev-only.

Promoted cards use the flight-airframe Hangar path, not the comparison-display path. That is important: it gives them the spec's gear stance, racks/rails, bay doors, turrets and control inputs. An archived card whose model differs from its spec continues to stand by its own bounds and carries no gameplay stores.

## Flight-model fit

The aerodynamic coefficients and graded performance cards were not re-derived. Geometry-dependent values were re-measured against the promoted meshes:

- gear height, main-gear x, tail/nose-wheel x and third-wheel height;
- gun muzzle positions and combat hit-zone bounds;
- real-cockpit eye points;
- bomb racks, rocket rails and the D3A belly-bomb clearance;
- stance rows and gear-contact model mappings.

The seven Blender GLBs were rebuilt on Ryzen. The B-17's gear wheel and door were separately fitted through the complete retraction arc. Its promoted wing uses the drawing-conformance slice's normal trailing-edge clip; the center-point test's legacy B-17-download override was removed so both tests measure the same authored section. The D3A Type 98 rack moved down to `[-0.1, -0.726, 0]`, leaving about 0.020 m (0.8 in) beneath the promoted belly.

All combat boxes now lie within their promoted, propeller-excluded meshes. The old F6F/A6M overshoot allowlist is empty.

## What remains estimated

The model-shape estimates recorded by the re-measure handoffs still apply: transverse sections, fin/tail thicknesses, flap spans and pilot-seat locations where the drawings show no seat. The Ki-43 remains a Ki-43-I drawing with documented IIb overrides. Store chord fractions and clearances are fit estimates. The flight/aero coefficients are the existing game specifications; this change only refits geometry-dependent placement and contact values.

## Verification

- `remote-run npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts`
- local Vite plus `npx playwright test tests/e2e/hangar.spec.ts --workers=1`
- focused sortie and Wildcat browser checks
- `npm run verify`

Exact final counts and any rerun notes are in the integration commit message. `blenderEntries.test.ts` rebuilt the changed B-17 output byte-for-byte. The ordinary Hangar test asserts archived cards are absent; the Dev launch asserts they are present and labeled archived.

No push or deployment was performed.
