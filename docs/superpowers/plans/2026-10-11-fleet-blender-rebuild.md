# External-aircraft Blender fleet: plan (2026-10-11)

Replace the seven downloaded-aircraft silhouettes with original, deterministic Blender-path alternatives while keeping every legacy download visible beside its replacement in the Hangar for direct comparison. The first delivery is comparison-only: no flight spec changes models, eye points, weapons, stores, or stance.

## Header

- **Branch:** `codex/fleet-blender-rebuild`, worktree `/home/mark/projects/ww2airsim-fleet-rebuild`, cut from `main` at `863c290e`.
- **Viewing checkpoint:** final product only: all seven Blender alternatives beside their seven existing downloads in the Hangar.
- **Run:** unattended, to completion.
- **Heavy jobs:** Blender builds and focused checks may run on nexus; the complete deterministic gate runs on ryzen as `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`. Hangar correctness runs on a free dev slot; reference-GPU work uses the shared Ryzen plumbing and documented lock where required.
- **Delivery:** commit and push this branch. Do not deploy or merge to `main` without Mark's request.

## Rulings (Mark, 2026-10-11)

- The purpose is fleet-wide visual coherence through the project's Blender pathway.
- Prefer one schematic family where possible.
- Keep the existing downloaded renderings in the Hangar for comparison after the Blender alternatives are complete.
- Worktree, unattended; show the final comparison rather than pausing at intermediate aircraft.

## Reference standard

Kaboldy's orthographic SVG series on Wikimedia Commons is the common silhouette reference for all seven aircraft. It supplies a consistent projection and measurement method, not permission to ignore variant differences:

| Project aircraft | Common drawing | Variant treatment |
| --- | --- | --- |
| A6M2 Model 21 Zero | `Mitsubishi A6M Zero drawing.svg` | direct match |
| B-17G Flying Fortress | `Boeing B-17G Flying Fortress 3-view line drawing.svg` | direct match |
| F4F-4 Wildcat | `Grumman F4F Wildcat 3-view line drawing.svg` | direct match |
| F4U-1D Corsair | `Vought F4U-1 Corsair 3-view.svg` | common silhouette; retain cited -1D dimensions/details |
| F6F-5 Hellcat | `Grumman F6F Hellcat 3-view line drawing.svg` | common silhouette; retain the photo-reviewed -5 canopy and cited dimensions |
| D3A2 Model 22 Val | `Aichi D3A1 Val.svg` | common silhouette only; record the D3A1 limitation and retain cited D3A2 dimensions/details |
| Ki-43-IIb Oscar | `Nakajima Ki 43-I.svg` | common silhouette only; record the Ki-43-I limitation and retain cited IIb dimensions/details |

The aircraft's published dimensions and project spec own scale and stance. Each script labels published figures `CITED`, drawing readings `MEASURED`, and remaining construction choices `ESTIMATE`. The SVGs are credited as measurement references in the scripts, handoff, and asset ledger. The generated geometry and scripts remain original project work under the existing Blender-entry license contract; no SVG artwork is bundled.

## Tasks

1. Write and email this plan as HTML with `tools/mail-doc.py`.
2. Audit the four existing per-aircraft worktrees. Integrate the completed A6M2, B-17G, and D3A2 commits; import the Ki-43-IIb work only after its full file set is stable. Preserve those source worktrees unchanged.
3. Reconcile shared Blender-kit, preview, documentation, rig, catalog, and test changes so all seven comparison models coexist on one branch without dropping another aircraft's enrollment.
4. Review every model's reference header and asset row against the common-source table. Preserve exact-variant qualifications and explicit estimates; do not imply that D3A1 is D3A2 or Ki-43-I is Ki-43-IIb.
5. Standardize the seven alternatives' presentation conventions: skinned deterministic GLBs, coherent paint/material treatment, named propeller/gear/control-surface parts, spec-fitted stance, and the same Hangar source/origin labeling.
6. Keep the three already-merged fighter alternatives and their legacy downloads. Add the four new alternatives as display-only Library cards next to the legacy aircraft. Do not promote any alternative into `view.model` in this plan.
7. Extend the duplicate-fit, dimensions, rig, skin, catalog, and Hangar checks to all seven alternatives. Verify propeller symmetry, hinges, budget, spec stance, store clearances, source labels, deterministic rebuilding, and legacy-plus-Blender coexistence.
8. Render same-camera side/front comparisons and drawing overlays for the four new alternatives. Run the gated Hangar capture with all seven pairs and collect final screenshots in the handoff.
9. Run focused model and Hangar tests during integration, then the full deterministic gate on ryzen and the Hangar WebGPU correctness suite on an available dev slot.
10. Update `docs/blender-aircraft.md`, `docs/models.md`, `ASSETS.md`, and the master-plan ledger without duplicating measurements. Write and email the dated handoff with model budgets, tests, captures, limitations, and promotion follow-ups.
11. Commit and push `codex/fleet-blender-rebuild`; no deployment and no merge.

## Acceptance

- The Hangar contains both the legacy download and a Blender-path alternative for each of the seven formerly external aircraft.
- Every alternative rebuilds deterministically from its committed script and passes the model's size, rig, skin, budget, and duplicate-fit checks.
- All seven use the same documented reference hierarchy and presentation conventions, with variant mismatches visible rather than papered over.
- Existing flight models continue using the downloaded assets; simulation, stance, eye point, weapons, and stores are unchanged.
- Final comparison captures and a measured handoff make the visual decision reviewable after the unattended run.
