# Handoff: aircraft crash aftermath (2026-10-12)

**Branch:** `aircraft-crash-collisions`. **Scope:** renderer-owned fatal-crash
aftermath and the automatic replay window; the deterministic simulation's impact
judgement, scoring, mission outcomes and aircraft state remain unchanged. Mark
approved the land choreography and water splash in the running reference-GPU
build. No deployment was performed.

## What is there now

- A destroyed airplane that hits water raises the enlarged `crash.water` splash
  and descends 12 m over 2.5 seconds. It no longer remains pinned to the sea
  surface. A survivable ditch keeps the existing behavior.
- A destroyed airplane that hits land, a carrier deck or another solid object
  sheds its existing breakaway parts. Its fuselage then inherits the contact
  velocity and follows a deterministic, mass-sensitive eight-second bounce,
  tumble and drag-limited slide. A small bounded longitudinal compression makes
  the initial hit read as a crumple without replacing or deforming the source
  aircraft models. Bombers heave and settle more heavily than fighters.
- The short explosion and ejecta remain at the immutable impact point. A separate
  sustained source follows the rendered fuselage while it moves: fire plus smoke
  for five minutes, smoke alone for another five minutes, then nothing. If the
  solid-impact wreck crosses into water, the renderer captures the exact entry
  pose, emits a water splash there, submerges the fuselage and extinguishes its
  attached fire and smoke.
- Settled fuselages remain visible for that aftermath. Loose debris still expires
  on its existing lifetime. Pause freezes the choreography; time scale and replay
  advance it through the same renderer-owned clock.
- Automatic replay now covers eight seconds before and eight seconds after the
  event. The former 1.5-second post-event window could hand control to the debrief
  before the approved choreography had settled.

No controls, settings, routes, labels, saved data, diagnostic surface, scoring or
simulation collision contract changed. The new renderer state is reset on sortie
restart and rebuilt deterministically during replay.

## Test reconciliation

### Tests updated

- `tests/render/surfaceCrash.test.ts` pins deterministic fighter/bomber motion,
  bounded travel, rebound, tumble, crush, settlement and malformed-input safety.
- `tests/render/pivotedAirframe.test.ts`, `tests/render/wildcat.test.ts` and
  `tests/render/airframeUpdate.test.ts` cover both production airframe paths,
  renderer-time breakup, reset, fatal water submergence, land/deck selection and
  ship-collision breakup.
- `tests/render/wreckAftermath.test.ts` holds the five-minute fire, five-minute
  smoke and out boundaries; it also proves that the source uses the current
  fuselage position and that water entry extinguishes it.
- `tests/render/fxCatalog.test.ts` and the accepted visible-extent fixture cover
  the larger water splash, the removal of a fixed crash-site smoke column and the
  cooling-wreck smoke recipe.
- `tests/replay/player.test.ts` and `tests/render/replayBar.test.ts` now hold the
  symmetric 8 + 8 second automatic replay window and event marker.
- `tests/e2e/fx.spec.ts` exercises three production paths on the reference GPU:
  inland fatal breakup and motion, a land-impact wreck sliding into the sea and
  extinguishing as it sinks, and a direct fatal sea crash with restart cleanup.
  Four existing E2E debrief waits were raised from 20 to 30 seconds because the
  replay intentionally lasts 6.5 seconds longer; their behavioral assertions are
  unchanged.

### Tests still valid

- `tests/render/fxEvents.test.ts` still correctly requires the simulation-driven
  burning-aircraft trail to stop at surface contact. The new long-lived source is
  renderer-owned and begins at that seam rather than weakening the old contract.
- `tests/render/fxSystem.test.ts` still pins sustained-source interpolation,
  pause and time-scale behavior used by the moving wreck plume.
- Existing contact, mission-outcome, scoring, debrief, audio and replay-flow
  tests remain authoritative because the simulation's single recorded impact and
  debrief state machine did not change. Audio still expects one live crash cue and
  one replayed cue.
- Existing destruction/debris tests remain authoritative for mid-air kills and
  loose-part lifetimes; the feature adds only the surface-contact presentation.

### Known gaps

- E2E does not wait ten real minutes for the complete plume lifetime. Exact phase
  boundaries and extinguishing are deterministic unit tests; the production E2E
  covers the source moving with the wreck and the shoreline transition.
- There is no brittle screenshot oracle for the visual quality of the bounce,
  crumple, splash or plume. The running reference-GPU checkpoint was inspected and
  approved by Mark, while tests assert the measurable motion and effect lifecycle.
- The shoreline E2E enters water from land. Deck-to-water uses the same captured
  renderer pose, water-entry and extinguishing path but has no separate browser
  case.

## Verification before merge

- Focused deterministic render/replay coverage passed after the final lifecycle
  refinement; TypeScript and ESLint were clean.
- The full deterministic Vitest run passed **6,283 tests in 433 files**, with
  **11 skipped**.
- The three crash E2E cases above passed together on the Ryzen RX 6700 XT
  reference GPU in **1.0 minute**.

After integration, run `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` from
`main` and record its result in the merge closeout.
