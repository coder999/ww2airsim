# E3: Bombers and gunners

**Status (2026-10-10):** merged to `main` (15390826); built on branch `e3-bombers-gunners` (worktree `.claude/worktrees/agent-a9bc867f9b5e66ad5`, cut from `main` `91da48f0`). Master plan item: Track E, item 3. Handoff (at the end): `docs/handoff/2026-10-10-e3-bombers-gunners.md`.
**Mark's decisions (2026-10-10):**
- **Gunner lethality default: "noticeable, not deadly."** A sloppy attack from dead astern takes hits; a good high-side or head-on pass mostly does not. Tuned with measured tables like E1's (hits taken and loss rate per geometry: dead astern, high side, head-on; green and veteran gunners), which go in the handoff.
- **Gunner aim error goes through E1's skill mechanism** (`PilotSkill`), so M5 (global difficulty, a parallel agent) scales it with the one hook it already has. Difficulty itself is not built here.
- **Viewing checkpoint:** the final product only. **Run:** unattended, to completion.
**Location:** a worktree; merged to `main` 2026-10-10.
**Heavy jobs:** tsc, eslint, vitest, `npm run verify` and the calibration sweeps go to ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run ...`); on nexus, single small test files only.
**Parallel agents:** 1a (terrain loader), M5 (settings, AI skill scaling, `aaFire`, player damage), B3 (`pursuit.ts`), k1 (clouds). This plan keeps its `combat.ts` edits to a few marked lines, and does not touch `pursuit.ts`, `aaFire.ts` or `settings.ts`.

## What was asked

MASTER_PLAN Track E item 3: bomber AI that flies in formation and level-bombs a target, building on E2's `level-bomb` run; then defensive gunners that fire the turrets and flexible guns that already aim (turret aim and flex guns handoffs, 2026-10-09) at enemy fighters, under the friendly-fire rules, with tracers and sound from the systems that exist. The Bomber Range bombers fly as a formation and shoot back. Leave Escort (Track F) a content-only step.

## What is in the code (read 2026-10-10)

| Fact | Where | Consequence |
| --- | --- | --- |
| Formation flying exists: a wingman (`pilot.leader`, `slot` 1-3) keeps a station off its leader, rejoins, takes over the leader's ingress orders when the leader is lost. A wingman also *engages* threats (`wingmanAccepts`). | `src/sim/ai/formation.ts`, `pilotTick.ts` | Bombers fly formation with no new steering law. A bomber with no fixed guns should never engage (it has nothing to fight with): its gunners fight. |
| E2's `level-bomb`: approach, run, release when `predictImpact` crosses the aim, one bomb per pass, egress, re-attack. Bay doors open by range (`ingressBayDoorsOpen`). Only a pilot with `ingress.attack` is armed. | `src/sim/ai/attack.ts`, `scenario.ts`, `mission/spawn.ts` | The formation leader flies E2's run. Wingmen "toggle on the leader" (drop when it drops) and work their doors with it. A leader with wingmen drops its whole load as a train on one pass (a B-17 has 8 bombs); a lone raider keeps E2's one bomb a pass (pinned by `attack.test.ts`). Wingmen of an attacker are armed too. |
| The turrets aim in the renderer only: arcs in `AIRFRAME_RIGS.turretArcs` (render), pivots and trunnion axes in the GLBs; the sim has no turret data. Every bomber's combat block says "no fixed guns: the gunners are not modeled". | `src/render/scene/airframeRigs.ts`, `src/render/airframeUpdate.ts`, `content/aircraft/*.json` | The sim needs each gunner's position, rest heading, arc and gun: a `combat.gunners` list in content, with a test that holds it to the rig's arcs and the GLB's pivots (the sim may not import render). |
| M2's light AA: hash-drawn aim error (no PRNG cursor, so a world with no AA is bit-identical), E1's lead (`solveMuzzleLead`), a ranging-in factor, rounds marked `Projectile.aa` that hit only hostile airplanes and credit the owner. | `src/sim/weapons/aaFire.ts`, `combat.ts` | Gunners are the same kind of shooter: reuse the round branch (`aa` hit scale, hostile-only contact, owner credit) and the hash draws; their state rides on `CombatState` as an optional field so a world with no gunner is bit-identical. |
| AI gun audio follows a rising `shots` count per airplane; tracers: `tracers.ts` (airplane, thin) and `aaTracers.ts` (AA, thick). | `src/render/audio.ts`, `src/audio/spatial.ts`, `src/render/scene/*` | A gunner salvo counts in the bomber's `shots`, so its guns are heard with no new sound. Gunner tracers draw in the airplane mesh (no new draw call). |

## Design

1. **Content (`combat.gunners`).** One entry per aimed mount, named after its rig part: body-frame position (the GLB pivot), rest heading (degrees right of the nose), traverse (half-angle, or null for a full circle), elevation range, barrels, and gun type (a key of the block's `gunTypes`, absent for the top-level ballistic). Enrolled for every airframe with turret arcs: B-17 (6), B-29 (5), G4M (3), Ki-21 (3), B5N2 (1), TBM-3 (2). Calibers per airframe (ESTIMATE, cited in each `source`). A seam test holds every entry to `AIRFRAME_RIGS.turretArcs` and its GLB pivot.
2. **Gunners (`src/sim/weapons/gunners.ts`).** `GUNNER_TUNING` holds every number. Per mount, per tick: the nearest hostile, airborne, live airplane inside range and the mount's arc; hold fire while a friendly is near the line of fire; first sight waits the pilot's reaction time; then salvos at a fixed rate, aimed by E1's lead, with an aim error of `GUNNER_TUNING.aimErrorScale x PilotSkill.aimErrorRad` grown by the line-of-sight rate (a fast crossing outruns the gunner) and by a ranging-in factor that settles over a time proportional to `PilotSkill.reactionS`. A salvo is one round carrying the hit scale of every round it stands for. No pilot: green.
3. **Wiring.** `stepCombat` calls the gunners once a tick (with `sides`); their rounds take M2's hostile-only branch. A burning, destroyed or crashed bomber's gunners stop.
4. **Bomber AI.** A pilot whose airframe has no fixed guns never picks a target. A wingman drops when its leader's `bombsDropped` passes its own and holds its doors as the leader does. A level-bomb leader with wingmen drops a train.
5. **Bomber Range.** The four bombers fly as one formation (the B-17 leads) on a route, veteran gunners, and shoot back. God mode makes it harmless.

## Tasks

1. Schema and content: `gunners` in `CombatSpecSchema`; entries for the six airframes; fix the stale "gunners are not modeled" sources. Seam test.
2. `gunners.ts` and its unit tests (arc, range, friendly hold, a doomed bomber is silent, no gunner world bit-identical, determinism, skill ordering).
3. `combat.ts` wiring and render: tracers in the airplane mesh, `shots` for the audio.
4. Bomber AI: gunless pilots hold their orders; wingman drops and doors; leader's train; arming of wingmen. Test: a formation of B-17s flies to a target and every bomber drops its load over it.
5. Calibration harness (`tests/sim/weapons/gunnerHarness.ts`, `tools/ai/gunnerSweep.ts`): a scripted Hellcat, three geometries, green and veteran gunners, against one B-17 and a four-ship formation. Tune `GUNNER_TUNING` to Mark's default; pin the measured table (`gunnerLethality.test.ts`).
6. Bomber Range content and title description; a capture spec for the reference GPU (God mode, assert gunner rounds through `__ww2`).
7. Full suite on ryzen; E2E (combat and capture) on a GPU; budget only if draw cost changed (it should not: same instanced tracer mesh).
8. Handoff, MASTER_PLAN Track E item 3 status, docs (CONTEXT.md, testing.md capture list), email.

## Rulings taken unattended (for Mark, in the handoff)

- Gunner rounds hit only hostile airplanes (M2's branch), so a formation never shoots itself; gunners also hold fire with a friendly near the line.
- A bomber with no fixed guns never breaks to engage: it holds formation and its gunners fight.
- No ammunition limit for gunners (an Escort-length fight does not run dry); add one if a mission needs it.
- The waist guns (B-17, G4M blisters) do not fire: they are not drawn aimed.
