# F7A bailout and rescue handoff

**Date:** 2026-10-14
**Branch:** `plan-f7a-bailout-rescue`
**Base:** `b1dda8a4837ad27c129614857c3c317237fbfefa`
**Run mode:** unattended; final captures collected for later review, with no intermediate viewing checkpoint.

## What landed

- `J` is the deliberate, edge-triggered bailout command. Grounded, lost, duplicate, and below-15 m AGL exits are rejected.
- A generic fixed-tick parachutist entity separates from the source aircraft; the abandoned airframe remains in the world under neutral controls.
- The approved `parachuting-person-rig.glb` drives packed, deploying, and open-canopy presentation. The chase camera follows the pilot after exit.
- The canopy deploys over two seconds, settles toward 5.5 m/s, drifts with world wind, and records land, water, or deck contact. Exits below 75 m AGL cannot complete a safe descent.
- Recovery uses canonical sides, nearby bases/ships, rescue coverage, enemy presence, surface, daylight, visibility, weather, and sea state. Friendly/enemy extremes are deterministic; contested land cases use a stable recorded seed and roll. Unsupported water cannot resolve rescued.
- Qualitative pre-exit guidance reports only `RESCUE LIKELY`, `CONTESTED`, or `CAPTURE LIKELY`. The debrief reports the terminal result and exact evidence.
- Rescued and captured outcomes bank legitimate target score at the existing 1.0 recovery multiplier and do not award a landing badge.
- The V1 flight recorder adds a strict bailout action carrying the frozen recovery environment. Separation, descent, contact, recovery facts, roll, and outcome remain ordinary checksummed fixed-tick world state and reproduce exactly.

F7A deliberately does not change the frozen campaign schema or add a second roster lifecycle. F7B owns permanent POW archival, automatic five-pilot roster replacement, campaign-specific bailout facts, and the J5 mass-paratrooper integration.

## Reference-GPU evidence

The final capture program ran through the existing Ryzen console Playwright channel on the reported `amd / rdna-2` reference adapter at 1920×1080. It completed in 2.5 minutes.

- [Open canopy and separated airframe](2026-10-14-f7a-bailout-rescue-shots/01-canopy-over-tacloban.png)
- [Friendly land rescue debrief](2026-10-14-f7a-bailout-rescue-shots/02-rescued-debrief.png)
- [Enemy-controlled land capture debrief](2026-10-14-f7a-bailout-rescue-shots/03-captured-debrief.png)
- [Unsupported water-contact evidence](2026-10-14-f7a-bailout-rescue-shots/04-water-no-rescue-debrief.png)
- [Low-altitude failed bailout](2026-10-14-f7a-bailout-rescue-shots/05-low-altitude-failure.png)

## Verification

- `npm run typecheck`: pass through `REMOTE_RUN_OVERFLOW=0 remote-run`.
- Focused Vitest: 54/54 pass across bailout simulation, world recovery context, debrief/scoring, and recorder verification; the final banking-contract reconciliation also passed 17/17.
- Reference-GPU E2E: friendly Tacloban rescue passed in 36.5 s; enemy Dulag capture passed in 36.2 s.
- Final capture tool: 1/1 pass in 2.5 min, producing the five artifacts above.
- `npm run verify`: pass through `REMOTE_RUN_OVERFLOW=0 remote-run` — typecheck, ESLint, dependency-cruiser (350 modules / 1,216 dependencies, no violations), and Vitest (456 files; 6,913 passed, 13 skipped).

## Test reconciliation

Updated or added:

- Pure simulation cases cover rejection, low-altitude death, separation, canopy opening, wind drift, uncontrolled source aircraft, land/water contact, side-relative world context, deterministic extremes, and seeded contested variance.
- Recorder coverage now verifies from the tick-boundary action through terminal recovery and checksum equality.
- Debrief coverage pins rescued/captured evidence and full score banking.
- Browser correctness drives the shipped `J` binding and visible rig through friendly rescue and enemy capture.
- The capture manifest explicitly enrolls the final-evidence program; default correctness runs continue to exclude capture tools.

Still valid without changes:

- Existing pre-F7A worlds omit `parachutists`, preserving their object shape and checksum path until a bailout occurs.
- Landing, ditching, crash, destruction, replay, mission, and campaign-core tests remain the regression gate; F7A does not weaken or replace them.

Known gap, assigned rather than hidden:

- F7B must prove POW archive closure, automatic roster replacement, campaign fact handoff, and multi-paratrooper spawning. Those are part of the overall F7 acceptance gate, not F7A.

## Final closeout

F7A is complete on `plan-f7a-bailout-rescue` as a single branch-tip change set containing implementation, tests, documentation, and the five final reference-GPU captures. The repository-wide gate passed in 435.58 seconds after an earlier contended run hit only the existing entity-soak wall-clock limit; that exact soak passed alone in 22.14 seconds and in the final full run in 21.52 seconds. The worktree was audited for temporary servers, dependency links, sync directories, and unsafe browser flags before commit. Nothing was deployed or pushed to an external remote. F7B remains explicitly open for campaign POW/archive/replacement behavior and mass-paratrooper integration.
