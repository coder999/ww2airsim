# F4 Night and Site-Marker Assets — Implementation Plan

**Branch:** `f4-night-site-assets`

**Worktree:** `/home/mark/projects/ww2airsim-f4-night-site`

**Base:** approved F3 on `main` at `d6d0ff9e`

**Attendance:** unattended through implementation and automated checks

**Viewing checkpoint:** final Hangar board containing all five night/site assets

## Goal

Ship the five F3-locked night/site models: `m1942-60in-searchlight`, `portable-runway-flare-pot`, `panirugan-red-harbor-light`, `ranger-temporary-nav-light`, and `suluan-damaged-lighthouse`. Each receives explicit provenance and limits, state/articulation nodes, a generated GLB, a Library entry, budget enrollment, focused tests, captures, and a handoff.

## Ownership and execution

This branch models only physical fixtures. Searchlight beams, flare glow/smoke, local light volumes, mission-controlled illumination, terrain placement, and site-state logic remain F6/F8 work. The damaged lighthouse is a fixed building; the other fixtures use the shared equipment kind after rebasing on the airborne foundation.

This is the lightest group and performs its authoritative Blender builds serially on Nexus under the compute lock. Existing model outputs must remain byte-identical.

## Tasks

- [ ] Re-read F3 §§8–10, `docs/models.md`, the model-roster spec, and `docs/testing.md` Philosophy.
- [ ] Establish source rows for the M1942 60-inch light, portable flare pot, Panirugan red harbor fixture, Ranger temporary light, and Suluan lighthouse; label dimensions/configuration not proved by a source `ESTIMATE`.
- [ ] Author five Blender scripts and entries. Required review nodes: searchlight train/elevate and beam marker; lit/unlit marker nodes for the three light fixtures; fixed, visibly damaged lighthouse silhouette.
- [ ] Add Library cards and registrations after the equipment foundation is available; keep the lighthouse under the building kind without inventing a site placement spec.
- [ ] Add bounds, ground origin, state-node, pivot, budget, provenance, and deterministic-rebuild tests.
- [ ] Update `ASSETS.md` and the enumerated building/static registries without adding runtime lighting.
- [ ] Build serially on Nexus, render consistent day and dark-background captures, and assemble the final Hangar review board.
- [ ] Run focused tests, then the full gate through Ryzen with `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`.
- [ ] Reconcile tests in the handoff, email the plan/handoff as HTML to the authorized recipient, commit, and push. Do not merge without final F4 approval.

## Acceptance

- Exactly five physical fixtures are committed; no beam, glow, smoke, local light, site placement, or mission logic is added.
- Each fixture is recognizable at ordinary display distance, carries required state/articulation nodes, and fits its recorded budget.
- Existing models remain byte-identical and the full repository gate passes.
