# B2: the bomb and rocket impact predictor

**Status (2026-10-10):** built and merged to `main`; results in [`../../handoff/2026-10-10-b2-impact-predictor.md`](../../handoff/2026-10-10-b2-impact-predictor.md).
**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode:** unattended.
**Location:** a worktree (branch `b2-impact-predictor`, cut from `main` `9070c285`; merged and removed 2026-10-10).
**Heavy jobs:** tests, `tsc`, eslint and `npm run verify` go to ryzen through `remote-run` (nexus OOMs).
**Parallel work:** M2 (AA fire) edits `stepCombat` and `Projectile` in `src/sim/weapons/combat.ts` at the same time, so this plan touches that file only to add `export` to three functions.

## What was asked (Mark, 2026-10-10)

1. A pure sim function `predictImpact` that iterates `flyProjectile` to terrain or sea.
2. A ground marker in the renderer showing where a store released now would land.
3. Bombs **and** rockets. Not torpedoes (own drop-envelope logic). A rocket is powered, then ballistic: model it as the sim flies it, not as a bomb.
4. A period-incorrect aid (no CCIP in 1944), so an **Assist**: off by default, toggled in flight, never changes the flight.
5. Imperial units for anything the player sees.

## What is in the code (read 2026-10-10)

| Fact | Where | Consequence |
| --- | --- | --- |
| A bomb leaves at `previous.position + R(previous.attitude) * rack.offset` with `previous.velocity`, and is flown the same tick with `flyProjectile` (drag on air-relative speed, so wind matters). | `releaseBomb`, `stepCombat`, `src/sim/weapons/combat.ts` | The player's current state is exactly the `previous` of the next tick's release, so the prediction can match the sim to float precision. |
| A rocket leaves its rail along the gunsight line (raised by `railElevationDeg`), at the airplane's speed, then `burnedVelocity` pushes it along its own velocity for `burnS`, then drag and gravity. | `releaseRockets`, `burnedVelocity` | A rocket is not a bomb: it needs the burn, the rail aim and the next pair of rails. |
| Rockets get a random dispersion cone (`dispersionDeg`, 0.12 on shipped content). | `coneAim`, `releaseDraw` | The prediction is the centre of the cone; the test bounds the real scatter instead of matching it. |
| Contact is the nearer of `groundHit` (heightfield, 2 m samples plus bisection) and `seaHit` (the plane at sea level). Both are module-private. | `nearestContact` | Export them (3 words in `combat.ts`) rather than copy them. Copies would drift. |
| A bomb that meets the ground before `armS` is a dud: removed, no impact. | `stepCombat` | The prediction reports `armed`; the marker is still drawn where it lands. |
| A bay load leaves only through open doors; a bomber's bomb needs no `combat` block; a parked airplane cannot release. | `bayDoorsShut`, `canRelease` | The function returns `null` for closed doors and for an airplane on the ground or a deck. |
| Assists live in `AssistSettings`, whose two members feed the flight stack, and pinned tests enumerate its keys. The in-flight toggles are edge-triggered in `nextFrameState`. | `src/assists/index.ts`, `src/render/frame.ts` | The impact marker is a separate `FrameState` flag with its own edge, like triple time. It cannot touch the assist stack. |
| The gun pipper and the steering cue are scene meshes with no depth test, posed each frame in `main.ts`. | `scene/gunPipper.ts`, `scene/steeringArrow.ts` | The impact marker follows them. |

## Rulings (conservative defaults, Mark is away)

- **R1. Bombs win.** If bombs are aboard and can leave, the marker shows the bomb impact; otherwise the next rocket pair. One marker, not two.
- **R2. Key `U`.** Free in `BINDINGS` (checked 2026-10-10); `I` is flight data and `O` is bay doors, so `U` is the nearest free letter. Off at every spawn, not persisted.
- **R3. Terrain and sea only.** Hulls, decks, buildings and other airplanes are not predicted: they move or are the player's job. A bomb over a ship marks the water under it.
- **R4. On the ground means hidden,** even when taxiing (the sim would allow a release above 2 m/s).
- **R5. Rocket pair = the mean of the two rockets' centres.** No dispersion in the prediction.
- **R6. Distance readout** is in statute miles on the HUD badge (`IMPACT 0.8 MI`), imperial as AGENTS.md requires.

## Tasks

Sim first.

1. **Export `groundHit`, `seaHit` and `storeTypeOf`** from `combat.ts` (the only edit to that file).
2. **`predictImpact`** in `src/sim/weapons/impactPrediction.ts`: pure, takes `(spec, state, stores, terrain, wind, decks)`, returns `{ kind, point, timeS, armed } | null`.
3. **Accuracy tests against the real sim** (`tests/sim/weapons/impactPrediction.test.ts`): drop the store in `advance` and compare the recorded detonation point. Spread: speed, altitude, dive angle, bank, wind; over real terrain (`groundTruthTerrain()`) and over the sea (no terrain, and real terrain over water); bombs and rockets. Assertions only.
4. **Null cases** in the same file: empty stores, closed bay doors, airplane on the ground, torpedo airplane, a store that times out in the air; a dud bomb reports `armed: false`.
5. **"Absent changes nothing"**: the predictor is not called by `advance`; an assertion that the world after a run with predictions interleaved is `toEqual` the world without, plus the existing golden and determinism tests passing untouched.
6. **Input and state**: `toggleImpactMarker` binding (`U`), `FrameState.impactMarker` and `impactMarkerPressed`, edge-triggered in `nextFrameState`; the legend row. Test: off by default, a press flips it, a held key flips once, the flight is bit-identical with it on or off.
7. **Scene marker** (`src/render/scene/impactMarker.ts`): a ring with a cross at the predicted point, held at a constant angular size, no depth test. Pure helpers (`markerVisible`, the distance label) tested in Node.
8. **Wiring in `main.ts`**: predict each frame from the player's state, hide when the Assist is off, in a replay, behind the title, in a debrief, or when the prediction is `null`; HUD badge with the state and range; `__ww2.impactMarker()` diagnostic for E2E.
9. **Docs**: `docs/aircraft.md` (what it is, how it matches the sim), `docs/testing.md` (the capture spec), `CONTEXT.md` ("Impact marker"), the controls legend, and the B2 bullet of `MASTER_PLAN.md` only.
10. **GPU capture spec** (`tests/e2e/impactMarkerCapture.spec.ts`, skipped unless `E2E_CAPTURE=1`): drop a bomb and fire rockets with the Assist on; read the marker through `__ww2`, screenshot the marker and then the real impact, in chase and cockpit views.
11. **Verify and hand off**: `remote-run npm run verify` green; captures on the ryzen console-session Playwright server; frame cost measured under `hwlock ryzen-budget` or stated as not measured; handoff `docs/handoff/2026-10-10-b2-impact-predictor.md`, mailed with the captures inline.

## Not doing

- Torpedoes, a lead-computing sight for moving ships, or CCIP-style release cueing (a "release now" tone).
- Dispersion in the prediction.
- Changing any sim behavior. `advance` never calls the predictor.
- Merging, pushing or deploying. Mark merges.

## Open questions

- Whether to draw both a bomb and a rocket marker on an airplane carrying both (R1 picks the bomb).
- Whether the marker should warn on a dud (`armed: false`); the data is there, the drawing is not.
