# F4U-1D Corsair onboarding

The first airframe run through the process in [`docs/aircraft.md`](../../aircraft.md).
Part A (the decision table) was asked of Mark on 2026-09-28 with
`AskUserQuestion`; the rest is unexecuted.

**Run shape (Mark, 2026-09-28):** worktree `~/projects/ww2airsim-worktrees/f4u-onboard`
(branch `worktree-f4u-onboard`); viewing checkpoint: final product only;
attended for Part A, unattended for Parts B to G. Never merge into `main`,
push `main` or deploy.

**Sequencing:** Mark merges T1 (`worktree-t1-tailwheel`) into `main` first.
The gear block (D5) is authored only after that, and this branch is rebased
onto the merged `main` before it. Parts B (sourcing), C (fit), D (CARDS
entry, except take-off), E (rig and register) do not touch `gear` and may
start before T1. The take-off card and anything reading the ground model
wait for T1.

## Decision table

| # | Decision | Answer | Chosen by | Date |
| --- | --- | --- | --- | --- |
| D1 | Variant | F4U-1D | Mark | 2026-09-28 |
| D2 | Side | allied | default, not asked | 2026-09-28 |
| D3 | Carrier eligible | `carrierCapable: true`; Tier 2 carrier take-off and trap run required | Mark | 2026-09-28 |
| D4 | Model source | the committed `content/aircraft/f4u-corsair.glb` (Sketchfab, manilov.ap, CC BY 4.0, already in `ASSETS.md`) | default, not asked | 2026-09-28 |
| D5 | Gear | taildragger (F4U-1D); T1 merged 2026-09-29 (6b7e937), so the gear block is unblocked | Mark (sequencing) | 2026-09-28 |
| D6 | Engines | single R-2800; not applicable | default | 2026-09-28 |
| D7 | Payload | racks and rails: bomb stations plus HVAR rockets | Mark | 2026-09-28 |
| D8 | Stores | existing `an-m65` and `hvar` | Mark | 2026-09-28 |
| D9 | Mount offsets | measured with `npm run models:mounts`; station count from the detail spec | default | 2026-09-28 |
| D10 | Physics reference | F4U-1D Detail Specification, Report No. 6756, 15 Feb 1945 (wwiiaircraftperformance.org/f4u/f4u.html, three loadings). A detail specification may be a guarantee rather than a flown trial: label it so in the spec and report the gap | Mark | 2026-09-28 |
| D11 | Guns and damage | six .50-cal fixed guns as the detail spec states; structure and damage shape copied from the nearest aircraft, every number cited or ESTIMATE | default | 2026-09-28 |
| D12 | Cockpit view | canopy eye point only, tested by `eyePoints.test.ts`; a modeled cockpit is deferred | default | 2026-09-28 |
| D13 | AI exclusions | none (no sourced limit in hand) | Mark | 2026-09-28 |
| D14 | Appears in | picker only; no scenario changes | Mark | 2026-09-28 |

Not verified when the table was written: whether the committed model's canopy
matches the F4U-1D. An option description asserted a bubble canopy; the
`eyePoints` test settles it.

## Open at the end of Part A

- The take-off distance and lift-off speed the detail spec gives are for named
  loadings and flap settings; Part B reads them and records which one the card
  grades against.
- D5 (gear) and the carrier take-off pin (`tests/sim/carrierTakeoff.test.ts`,
  T1) are waiting on T1.
