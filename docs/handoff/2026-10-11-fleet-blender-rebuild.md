# External-aircraft Blender fleet: handoff (2026-10-11)

## Result

The seven downloaded aircraft now each have an original, deterministic Blender-path alternative in the Hangar. The alternatives are display-only and sit beside the existing downloads for direct review; no aircraft spec, flight model, eye point, weapon, store mount, stance, or mission was changed.

- Branch: `codex/fleet-blender-rebuild`
- Worktree: `/home/mark/projects/ww2airsim-fleet-rebuild`
- Base: `main` at `863c290e`
- Live review: `https://ww2airsim-2.windomlane.org/hangar.html?bench`
- Captures: `docs/handoff/2026-10-11-fleet-blender-rebuild-shots/` (51 PNGs: seven paired aircraft in seven views, plus two Hellcat canopy close-ups)
- Delivery status: committed and pushed; not merged and not deployed

The Hangar pairs are:

| Existing download | Blender alternative |
| --- | --- |
| A6M2 Model 21 Zero | `a6m2-zero-blender` |
| B-17G Flying Fortress | `b-17-flying-fortress-blender` |
| Aichi D3A2 Model 22 Val | `d3a-val-blender` |
| F4F-4 Wildcat | `f4f-wildcat-blender` |
| F4U-1D Corsair | `f4u-corsair-blender` |
| F6F-5 Hellcat | `f6f-hellcat-blender` |
| Ki-43-IIb Oscar | `ki-43-oscar-blender` |

## Source and license treatment

All seven use Kaboldy's orthographic drawings on Wikimedia Commons as a common silhouette family. Published dimensions and each project aircraft spec own scale and stance. Every Blender script distinguishes cited facts, measured drawing stations, spec fits, and estimates. The Commons SVGs are credited measurement references and are not copied into the repository; the generated geometry and scripts remain original project work under the existing Blender-entry AGPL contract.

The A6M2, B-17G, and F4F drawings are direct variant matches. The F4U-1 drawing supplies the common Corsair silhouette while cited F4U-1D dimensions and details prevail. The Hellcat drawing supplies the common silhouette while the photo-reviewed F6F-5 canopy and cited dimensions prevail. Only adjacent-variant drawings were available for the D3A2 and Ki-43-IIb: the scripts explicitly record that the D3A1 and Ki-43-I drawings are silhouette references, then override them with cited D3A2 and Ki-43-IIb dimensions and details.

AirCorps Library's public B-17 index exposed useful factory-drawing titles and numbers, but the sheets require sign-in. They were recorded as a future refinement source, not treated as evidence used by this build, and no access control was bypassed.

## Build inventory

| Blender alternative | GLB bytes | Triangles | Draws |
| --- | ---: | ---: | ---: |
| `a6m2-zero-blender` | 717,844 | 21,464 | 18 |
| `b-17-flying-fortress-blender` | 1,163,684 | 36,408 | 29 |
| `d3a-val-blender` | 901,876 | 27,060 | 19 |
| `f4f-wildcat-blender` | 825,212 | 26,236 | 17 |
| `f4u-corsair-blender` | 868,724 | 27,320 | 14 |
| `f6f-hellcat-blender` | 788,316 | 24,796 | 12 |
| `ki-43-oscar-blender` | 806,148 | 25,624 | 17 |

All are within their committed size, triangle, and draw-call budgets. Each output rebuilds byte-identically from its Blender Python source. Propellers, landing gear where retractable, and control-surface pivots are named and enrolled in the common rig path. The D3A's fixed gear is baked into the skin; its dive brakes remain static because the renderer has no dive-brake input. The Ki-43's fixed tail wheel is likewise baked into the skin.

## Verification

- Focused duplicate/dimension/rig/catalog/roster checks: 5 files, 671 tests passed.
- Complete model/render gate on Ryzen: 64 files, 1,676 tests passed, including deterministic byte rebuilds for all seven alternatives.
- Gated capture: 1 test passed; all 51 PNGs written.
- Visual QA: same-camera paired three-quarter and side views inspected for all four newly integrated alternatives, plus the Hellcat canopy close-ups. All render coherently in the project's procedural fleet style; no blank, clipped, or broken model was found.
- Full repository `npm run verify`: 419 files and 6,113 tests passed, 11 skipped; one pre-existing mission assertion failed (`Escort, headless > unescorted at easy`, expecting more than one B-17 loss but receiving one). The same isolated test fails identically on untouched `main`, and this branch changes no simulation or mission data.
- Hangar WebGPU suite: all 23 tests passed in 7.9 minutes against the live worktree, covering the full roster plus rendering, gear, props, controls, stores, bays, pivots, budgets, provenance, skin lighting, and UV checking.

Two stale Hangar test assumptions were corrected while exercising the full roster: the warship count now includes the already-present Crow entry, and title-to-Hangar navigation waits for title preflight readiness. Both corrections are test-only.

## Review and next decision

Use the live Hangar's Origin filter or the paired cards to compare the download and Blender versions. The existing downloads remain the models used in missions, deliberately separating the visual decision from flight and combat fit.

If a Blender alternative is approved for promotion, handle it as a separate aircraft-by-aircraft change: point the spec at the alternative, remeasure stores, validate the eye point and stance, remove its display-only duplicate status, and rerun the graded flight cards. The first promotion should also verify and update the promotion checklist in `docs/blender-aircraft.md`; that checklist is derived from current code paths but has not yet been exercised end to end.

