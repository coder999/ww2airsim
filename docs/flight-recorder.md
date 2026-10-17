# Dev Flight Recorder

The Dev Flight Recorder captures a whole Dev sortie as a deterministic,
versioned `.ww2flight` file. It is diagnosis tooling, not a save format and not
the ten-second instant replay.

## Capture and export

1. Run a development build and launch through the title screen with **Dev —
   unlocks everything** selected. Query-string quick launches deliberately do
   not record because they have no pilot-owned, settled tick-zero lifecycle.
2. Fly normally. The recorder starts after the selected sortie world and
   terrain settlement are final.
3. Open Pause or finish the sortie. Choose **Export flight record**.

The gzip-compressed JSON file includes the exact build and scenario-content
digests, launch settings, fixed-tick controls, discrete actions/events,
one-second checksums, and final/debrief state. It does not contain terrain,
models, textures, or audio.

A bailout is a V1 tick-boundary action. It records the aircraft, the rescue die's seed (chosen at the key press and
replayed from the record, never recomputed) and the frozen daylight, visibility, weather, and sea-state inputs used
by recovery. Separation,
surface contact, and the seeded rescue/capture result then remain ordinary
fixed-tick world state, so verification reproduces the complete lifecycle rather
than injecting an outcome after the simulation step.

A cargo drop (F10D, the `Y` key of a transport) is a V1 tick-boundary action too: `{ tick, kind: 'drop', aircraft }`. Replay applies it with
`requestDrop` at the same fixed tick; a recorded drop the live sim would have refused is a named failure, not a skip. It is **additive**: the format
version stays 1, every earlier record parses and verifies unchanged, and a build older than F10D refuses a record that has a drop at parse (a clear
refusal, by the strict action union). An AI transport's drop needs no action: it is derived from the world each tick. Proof:
`tests/flightRecorder/dropReplay.test.ts` (bit-identical, a drop a tick early or late fails, no drop at all fails, an old record still verifies).

Starting a new Dev sortie warns before discarding a current record that has
changed since its last export. Ordinary and production sorties allocate no
recording session and expose no export/import controls.

## Reproduce

1. Check out the exact build and content named by the record. A dirty build id
   is exact for the local tree but cannot be recovered from its commit alone.
2. Open the development app with `?flightRecorder=1` in the URL.
3. Launch the same scenario, aircraft, and loadout in Dev mode.
4. Expand **Dev Flight Recorder Reproduction**, choose the `.ww2flight`, and
   optionally enter an inspection tick.
5. Choose **Verify and inspect**.

The app rebuilds the initial world, re-simulates through the ordinary fixed-step
loop, and stops at the first checksum divergence. A successful run feeds the
last ten seconds ending at the requested tick into the existing replay bar and
cameras. V1 seeks from tick zero and stores no periodic world snapshots.

Malformed gzip/JSON, schema errors, packet gaps, invalid dropped-step records,
and build/content/initial-world mismatches fail closed. The error names the
layer that must be corrected; do not bypass an exact mismatch unless doing an
explicit candidate-fix comparison through the programmatic verifier.

## Developer references

- Design: `docs/superpowers/specs/2026-10-14-n2-dev-flight-recorder-design.md`
- Schema and codec: `src/flightRecorder/schema.ts`, `src/flightRecorder/codec.ts`
- Headless verifier: `src/flightRecorder/verify.ts`
- Repeatable measurements: `npm run perf:flight-recorder`
- Browser correctness: `tests/e2e/flightRecorder.spec.ts`
