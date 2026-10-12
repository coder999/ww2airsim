# Controls overlay removal and pause-audio handoff (2026-10-11)

Feature commit `806d2580`; merged to `main` as `ab78775c`. This was a bounded housekeeping change, so it did not need a separate design or execution plan.

## What shipped

- The in-flight keyboard-controls overlay was removed. `Slash` is no longer bound, and capture/replay tests no longer toggle a panel that does not exist.
- The pause dossier remains the complete player-facing keyboard reference and is still derived from `BINDINGS`, with coverage requiring each binding to appear exactly once.
- Data and CC BY model attribution links formerly rendered in the flight overlay now appear in the title screen's About memo. No required attribution was removed.
- A live pause holds the audio system. The master gain goes to zero, stopping loops and already-playing one-shots such as radio, guns and impacts. Resuming restores the master gain unless the player muted sound; replay teardown also restores the live sortie's paused state.

## Verification

- Ryzen: `npx tsc --noEmit` passed.
- Ryzen: focused audio, control-catalog and title-screen unit tests passed, 71 of 71.
- Nexus real WebGPU: the pause-audio E2E passed; pausing took master and engine gain to zero and resuming restored the engine.
- Nexus real WebGPU: the pause UI test passed. The mission steering-cue/UI-overlap path passed; two later landing helpers ended in `impact` rather than `stopped`, outside this change.
- Full `npm run verify`: typecheck, lint and dependency-cruiser passed; Vitest finished with 6,230 passing and 11 skipped tests. Two 30-second timeouts passed when rerun alone. The two remaining failures—an outdated ship-model registry expectation and the Escort easy-loss assertion—reproduced identically on the pre-change `main` baseline.
- `git diff --check` passed.

The implementation worktree and feature branch were removed after merge. No deployment was performed.
