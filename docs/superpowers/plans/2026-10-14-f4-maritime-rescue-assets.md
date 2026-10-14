# F4 Maritime and Rescue Assets — Implementation Plan

**Branch:** `f4-maritime-rescue-assets`

**Worktree:** `/home/mark/projects/ww2airsim-f4-maritime`

**Base:** approved F3 on `main` at `d6d0ff9e`

**Attendance:** unattended through implementation and automated checks

**Viewing checkpoint:** final Hangar board containing all four maritime/rescue assets

## Goal

Ship the four F3-locked maritime/rescue models: `lcvp`, `usaaf-63ft-rescue-boat`, `type-a3-life-raft-survivors`, and `pby-mooring-buoy`. Each receives explicit provenance and limits, review articulation, a generated GLB, a Library entry, budget enrollment, focused tests, captures, and a handoff.

## Ownership and coordination

The landing craft and rescue boat are display vehicles, not new `ShipSpec`s; F4 does not add navigation, combat, wakes, beaching, docking, survivor pickup, or mission placement. The raft and buoy use the shared equipment kind owned by the airborne branch, so this branch authors and renders them in parallel, then rebases on that foundation before final registration.

Primary Blender execution uses a Ryzen remote-run slot. Existing ship and static model outputs must remain byte-identical.

## Tasks

- [ ] Re-read F3 §§8–10, `docs/models.md`, the model-roster spec, and `docs/testing.md` Philosophy.
- [ ] Establish authoritative source rows for LCVP, the 63-foot rescue boat family, Type A-3 raft, survivor load, and PBY mooring fixture; label every unresolved detail `ESTIMATE`.
- [ ] Author four Blender scripts and entries. Required review nodes: LCVP bow ramp; rescue-boat propellers/rudders or an explicitly justified display-only helm pose; removable survivor group; buoy pickup ring.
- [ ] Add Library cards and registrations: LCVP/rescue boat as display vehicles, raft/buoy as equipment after the airborne foundation is available.
- [ ] Add bounds, waterline/display-origin, +x-forward, node/pivot, survivor-present/removed, budget, provenance, and deterministic-rebuild tests.
- [ ] Update `ASSETS.md` and enumerated registry tests without creating premature ship specs.
- [ ] Render consistent three-quarter, side, front, and articulation captures and assemble the final Hangar review board.
- [ ] Run focused tests, then `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on Ryzen.
- [ ] Reconcile tests in the handoff, email the plan/handoff as HTML to the authorized recipient, commit, and push. Do not merge without final F4 approval.

## Acceptance

- Exactly four maritime/rescue assets are committed; no seaplane tender, PT boat, barge, or mission system enters scope.
- Waterline/origin conventions are explicit, required articulation is named, and every asset remains inside its recorded budget.
- Source uncertainty is disclosed, existing ship models are untouched, and the full repository gate passes.
