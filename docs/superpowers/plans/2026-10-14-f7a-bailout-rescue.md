# F7A Bailout and Rescue — implementation plan

**Date:** 2026-10-14
**Branch/worktree:** `plan-f7a-bailout-rescue` / `/home/mark/projects/ww2airsim-plan-f7a-bailout-rescue`
**Base:** `b1dda8a4837ad27c129614857c3c317237fbfefa`
**Run mode:** unattended
**Viewing checkpoints:** none during implementation; collect final reference-GPU captures and measured artifacts for later review.

## Scope and rulings

- F7A owns the reusable single-person bailout/parachutist simulation contract, player bailout command, qualitative pre-bailout risk, deterministic rescue/capture resolver, approved rig rendering, debrief evidence, and recorder reproduction.
- F7B consumes this contract for campaign POW/archive/replacement wiring and multi-entity paratrooper drops. F7A must not add a second campaign roster or persistence path.
- `J` is the deliberate bailout command: it is free in the centralized binding table and mnemonic for jump. It is edge-triggered and rejected on the ground, after a previous bailout, or after the pilot/airframe is already lost.
- A parachutist is a generic world entity, not a renderer-only effect. Its source aircraft continues uncontrolled after separation. Opening, descent, drift, surface contact, and terminal state advance on fixed ticks.
- The minimum viable opening uses a two-second deployment sequence and a 75 m minimum safe AGL gate. The open canopy settles toward 5.5 m/s vertical speed and follows the horizontal wind. These are explicit gameplay estimates around the approved 28-foot wartime canopy asset, not claims of exact equipment performance.
- Resolver extremes are deterministic: friendly control or active friendly rescue coverage resolves rescued; enemy control without friendly coverage resolves captured. Contested cases use a recorded seed and recorded factor weights. Failed opening/contact resolves killed before recovery is considered.
- Land/water is evidence, not a hidden random modifier. Water without rescue coverage cannot resolve rescued. Daylight, visibility, weather/sea state, nearest friendly/enemy support, and rescue/enemy presence remain explicit resolver inputs for F7B and future mission systems.
- Extend the V1 recorder additively with a bailout action/evidence. The record version stays 1 because the strict parser accepts the new optional union member while all existing V1 records remain valid and bit-identical.

## Tasks

1. Add pure bailout types and reducers: eligibility, separation, deployment phases, canopy descent/drift, land/water contact, and failed-bailout terminal states. Keep absent bailout state bit-identical for every existing world.
2. Add the deterministic recovery assessment/resolution module with clear extremes, seeded contested rolls, qualitative HUD cue, inspectable factors, and stable evidence text.
3. Enrol focused simulation tests for impossible/low-altitude bailout, airframe separation, canopy opening, wind drift, safe land/water contact, friendly rescue, enemy capture, contested repeatability, and changed-seed variance.
4. Bind `J`, latch it at the browser edge, apply it before the next fixed tick, prevent repeat/late requests, and expose concise feedback for rejected attempts.
5. Make the player flight follow the parachutist after separation, hold only after person contact/outcome, and leave the abandoned aircraft in the running world.
6. Load and render `content/equipment/parachuting-person-rig.glb`; drive closed/open canopy nodes through deployment, keep the shared model cache/disposal contract, and expose narrow diagnostics for E2E.
7. Add the pre-bailout qualitative risk cue and bailout/deployment/contact messaging without exposing numerical odds in normal play.
8. Add bailout outcome/evidence to the debrief while preserving existing landing/crash scoring and the frozen F5A `SortieEndKind`/`SortieFacts` contract.
9. Add recorder action/evidence support and exact verification for a bailout tick, descent, contact, and resolved outcome. Checksum the generic bailout state.
10. Add a Dev E2E/capture route covering safe land rescue, water recovery evidence, hostile capture evidence, and a too-low failure. Assert state and visible rig before taking captures.
11. Update controls, gameplay, recorder, campaign-contract, and testing documentation; reconcile updated/still-valid/known-gap tests explicitly.
12. Run focused tests throughout, then `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` and focused reference-GPU E2E/captures. Write and mail the handoff, merge current `main`, rerun affected gates, and commit. Do not deploy or publish externally without separate approval.

## Stop conditions

- Do not make rescue/capture depend on frame rate, wall time, renderer state, or an unrecorded random call.
- Do not remove the source aircraft or stop the rest of the world when the pilot leaves it.
- Do not infer friendly/enemy control from paint, model identity, or hardcoded scenario ids.
- Do not add campaign status fields or automatic replacement logic in F7A; consume the frozen F5A result contract in F7B.
- Do not ship a primitive substitute when the approved parachuting-person rig can load; a load failure must be diagnostic and visible.
