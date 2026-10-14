# N2 Dev Flight Recorder handoff

**Date:** 2026-10-14  
**Branch:** `n2-flight-recorder`  
**Status:** implemented and verified; not deployed

## Result

N2 now records an entire title-launched Dev sortie from the exact fixed-step
input seam, exports a strict gzip `.ww2flight`, verifies it headlessly with
first-divergence reporting, and imports it back into the game. Successful
imports reuse the existing ten-second replay history, replay bar, and cameras.

The format carries exact clean/dirty build identity, canonical scenario-content
SHA-256, launch and environment data, per-tick consumed controls, discrete
actions, mission/combat evidence, one-second/final world checksums, and final
debrief data. Terrain samples and all binary assets stay outside the record.

N2 is explicitly parallel with F4 in `MASTER_PLAN.md`. New assets change the
content/build identities and add ordinary stable ids; they do not require a
recorder redesign.

## Lifecycle and UI

- Dev title-screen sorties record automatically after the recoverable initial
  world is settled. Quick query launches retain their prior no-record contract.
- Pause and Debrief expose **Export flight record** only for a Dev recording.
- A pause-boundary export preserves the pause evidence even when no new fixed
  tick ran. Continuing afterward marks the evolving record unexported again.
- Starting another Dev flight warns before discarding changed, unexported data.
- `?flightRecorder=1` adds a collapsed reproduction panel. It validates the
  same scenario/aircraft/loadout, exact build/content, and initial world before
  simulating. The collapsed form no longer blocks title-screen controls.
- Production builds tree-shake the recorder surface and code; ordinary play has
  no session, packet buffer, or controls.

## Measurements

`npm run perf:flight-recorder` ran on the Ryzen worker over 3,600 ticks (one
simulated minute) per case. Simulation timings are median-of-five tight-loop
runs; they are diagnostic, not a correctness or frame-time budget.

| Case | gzip bytes/min | retained JSON | peak heap delta | export | verification | verifier speed | recorder sim overhead |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Free Flight | 12,259 | 333,443 B | 14.36 MB | 30.0 ms | 248.7 ms | 241x realtime | +29.2 ms/min (+15.0%) |
| Furball combat | 12,131 | 340,793 B | 16.76 MB | 14.4 ms | 600.5 ms | 99.9x realtime | +134.5 ms/min (+31.9%) |
| Airfield Strike + debrief payload | 12,399 | 333,223 B | 9.79 MB | 15.0 ms | 73.0 ms | 822x realtime | +34.7 ms/min (+84.1%) |

The percentage looks large for the very cheap mission case because its baseline
simulates one minute in 41 ms; the absolute recorder cost is 0.58 ms per
simulated second. The non-Dev path passes no observer, builds no observation
world, and allocates no packet buffer.

## Tests updated

- Added `tests/flightRecorder/recorder.test.ts`: canonical hashing, entity-order
  and structure-damage checksums, gzip round-trip, held guns, one-shot stores,
  release evidence, pause, triple time, export revision tracking, wingman target,
  held-group spawn, inspection seek, corruption/mismatch, divergence, and frame
  hitches (dropped fixed steps do not invalidate a record).
- Added `tests/render/flightRecorderSurface.test.ts` for opt-in route gating.
- Added `tests/e2e/flightRecorder.spec.ts` for no recorder/UI in ordinary play,
  Dev automatic capture, Pause download, Node decode/schema validation, in-game
  import, bit-exact resimulation, and replay-camera handoff.
- Updated `tests/render/bootQuality.test.ts` only to follow the extended
  `nextFrameState` argument list while preserving its existing damage/mouse
  wiring assertions.

## Tests still valid

- `tests/sim/loop.test.ts` and `tests/render/frame.test.ts` remain the owners of
  fixed-step, accumulator, terrain-hold, input pulse, and multi-entity behavior.
- `tests/render/debrief.test.ts` remains the owner of debrief model/rendering.
- The production distribution tests remain the owner of Dev-code exclusion.

## Verification

- Focused deterministic: 5 files, 101 tests passed before final additions;
  final recorder file has 14 passing cases.
- Focused build reconciliation: 3 files, 49 tests passed, including production
  bundle Dev-code exclusion.
- Final real-browser N2 gate: 2/2 cases passed on nexus's real Radeon 680M in
  23.5 s. The Dev case exported, decoded, imported, verified bit-exactly, and
  entered replay; ordinary play exposed neither recorder state nor UI.
- Final post-merge `npm run verify`: typecheck, lint, and dependency cruise
  passed; Vitest passed 443/443 files and 6,428 tests (12 skipped) in 419.38 s.
  The production distribution gate confirmed that Dev recorder code is absent
  from the shipped bundle.

## Known gaps

- V1 has no sparse keyframes; inspection re-simulates from tick zero by design.
- Exact import is deliberately not a cross-build migration tool. Candidate-fix
  comparison exists in the programmatic verifier (`allowMismatch`) but has no
  browser checkbox, preventing accidental mismatch acceptance.
- The peak-heap figure is process sampling and includes runtime allocation
  noise; retained JSON and compressed bytes are the stable size measures.

## Frame hitches (revised 2026-10-14)

The first build marked a record invalid whenever the loop dropped fixed steps. Mark's
GPU-less laptop (software rendering) produced thousands of drops and every export
failed verification. A dropped step never advances a tick, so the per-tick consumed
controls still reproduce the run; a recording with 1,333 dropped steps and changing
keys verified bit-identically (`recorder.test.ts`, "frame hitches"). `main.ts` no
longer invalidates on drops. `recorder.invalidate` remains for genuine problems
(fixed-tick gaps, unapplied actions).
