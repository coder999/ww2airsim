# F4 Ground Support Assets — Implementation Plan

**Branch:** `f4-ground-support-assets`

**Worktree:** `/home/mark/projects/ww2airsim-f4-ground`

**Base:** approved F3 on `main` at `d6d0ff9e`

**Attendance:** unattended through implementation and automated checks

**Viewing checkpoint:** final Hangar board containing all four ground-support assets

## Goal

Ship the four F3-locked ground models: `type94-cargo-truck`, `type38-75mm-field-gun`, `gmc-cckw-353`, and `caterpillar-d7-3t`. Each receives source-backed or explicitly estimated geometry, required articulation, a generated GLB, vehicle Library entry, budget enrollment, focused tests, captures, and a handoff.

## Ownership and execution

This branch owns only road, artillery, and construction assets plus its additions to the existing vehicle registry and measurement table. It does not add vehicle simulation, road columns, dust, crews, mission placement, or campaign logic.

Primary Blender execution uses a Ryzen remote-run slot. Existing vehicle and model outputs must remain byte-identical.

## Tasks

- [ ] Re-read F3 §§8–10, `docs/models.md`, the model-roster spec, and `docs/testing.md` Philosophy.
- [ ] Build a primary/authoritative source ledger for dimensions and configuration of all four vehicles; label unresolved proportions and omitted fittings `ESTIMATE`.
- [ ] Author the four Blender scripts and manifest entries. Required review nodes: rolling wheels and front steering for both trucks; traversing/elevating gun; D7 tracks and blade raise/tilt.
- [ ] Add the four Library cards, `STATIC_MODELS.vehicle` registrations, vehicle measurement rows, forward proofs, node/pivot assertions, and budget checks.
- [ ] Build and inspect the four GLBs: cited extent, +x forward, +y up, y=0 stance, footprint centering, no accidental turret names, and deterministic rebuild.
- [ ] Update `ASSETS.md` and only the tests whose enumerated vehicle roster changes.
- [ ] Render consistent three-quarter, side, front, and articulation captures and assemble the final Hangar review board.
- [ ] Run focused tests, then `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on Ryzen.
- [ ] Reconcile tests in the handoff, email the plan/handoff as HTML to the authorized recipient, commit, and push. Do not merge without final F4 approval.

## Acceptance

- Exactly four ground assets are committed and the F3 exclusions remain excluded.
- Every model carries a cited primary dimension or a candid estimate, fits the vehicle budget, and is recognizable at ordinary Hangar distance.
- Each required articulation is represented by stable named nodes and pivots.
- Existing vehicle models rebuild byte-identically and the full repository gate passes.
