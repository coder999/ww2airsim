# M5 Global difficulty: plan (2026-10-10)

MASTER_PLAN Track M, item 5: a Settings option that scales AA accuracy, AI pilot skill and the
damage the player's aircraft takes, with scenario `skill` values as the baseline it shifts.

## Header

- **Branch:** `m5-difficulty`, a worktree of `main` at `91da48f0`. Merged to `main` 2026-10-10.
- **Mark's decisions (2026-10-10):**
  - Three levels, **Recruit / Veteran / Ace**. **Veteran is today's tuning exactly, and the default**,
    so nothing changes until a player picks. Recruit is easier, Ace harder; each scales AA accuracy,
    AI pilot skill (shifting scenario `skill` as a baseline) and the damage the player's aircraft takes.
  - Naming: pilot skill already says "green" and "veteran". The difficulty gets its own type
    (`Difficulty`) and its own internal ids, and CONTEXT.md gains the term so the two are never confused.
  - Tune Recruit and Ace by measurement (E1's passive-player lethality, M2's AA lethality harness at
    each level); the measured table goes in the handoff. Recruit clearly survivable for a new player,
    Ace clearly harder, neither absurd.
- **Viewing checkpoints:** the final product only.
- **Run:** unattended, to completion. Decisions only Mark can make take the conservative option and are
  listed under "Rulings for Mark" in the handoff.

## Design

### One pure function at world build, nothing new in the tick

`src/sim/difficulty.ts` exports `Difficulty` (`'easy' | 'normal' | 'hard'`, labeled Recruit, Veteran,
Ace), a table of three scales per level, and `applyDifficulty(world, difficulty)`. It runs once, on the
`World` a sortie starts from (`main.ts`'s `buildWorld`, which Restart also goes through):

| Scale | What it changes | Where it lands |
| --- | --- | --- |
| `aiAimError` | every hostile pilot's `skill.aimErrorRad` (E1's lethality lever), including pilots in held mission groups | `pilot.skill` on the entity |
| `aaError` | the aim and fuse error of every AA mount firing at the player's side | one optional field on `AaState`, read in `stepAa` where the mount's skill is computed |
| `playerDamage` | damage the player's airplane takes from hits and blasts | the player entity's `spec.combat.structureHp` and `subsystemHp`, divided by it |

- **Normal returns the same world object**, so Veteran is bit-identical to today by construction, and
  every existing test, golden and determinism check is untouched.
- **Only the player's opponents are scaled.** A friendly wingman and the player's own ships' AA stay
  at the scenario's baseline: a Recruit whose escorts and carrier also got worse would partly undo the
  setting. (Conservative ruling, listed for Mark.)
- **Why these hooks:** each is a value the sim already reads, so the tick gains no parameter and
  `combat.ts` (E3's area) is not edited. Dividing the player's hit points is the same arithmetic as
  multiplying the damage of every hit and flak blast (`damageFromHit`, `blastDamageAircraft` both
  divide by them), and the fire line, smoke and engine stages follow unchanged. Overload damage
  (Damage Model) is a fraction of structure and is not scaled.

### Next sortie, not live

The difficulty is baked into the `World` at launch, so it takes effect on the next sortie (or
Restart), like Asset Quality. Why:
- A recorded world (instant replay) and a test world then describe the flight completely: the replay
  records `World`s, and the scaled skill, hit points and AA scale are in them. Nothing outside the
  world has to be remembered to reproduce a flight.
- A sortie is never flown under two difficulties. The Settings dialog lives on the title screen, so a
  pick lands between sorties in practice anyway.

### Settings

`settings.ts` gains a Difficulty row (persisted at `ww2airsim.difficulty.v1`, `loadDifficulty` /
`saveDifficulty` like Render Scale), with the "takes effect next time you start a sortie" note.
`bootQuality.ts` exposes `difficulty()`, read by `buildWorld`.

## Tasks

1. `src/sim/difficulty.ts` + `tests/sim/difficulty.test.ts`: normal is identity; easy/hard move only
   hostile pilots, the player's hit points and the AA scale; held groups covered.
2. `stepAa` hook + test that the scale widens the error only for guns firing at the player's side.
3. Settings row, persistence, `bootQuality` getter, `buildWorld` wiring; settings/bootQuality tests.
4. Measure: passive-player lethality (veteran and green pursuers, tail-chase fixture, 4 loadouts x 4
   cursors) and M2's orbit / pass / high AA sweeps (32 seeds) at each level; sweep the scales until
   Recruit and Ace read right. A tool `tools/ai/difficultySweep.ts` prints the table.
5. Pin the measured table in a test (`tests/sim/difficultyLethality.test.ts`), ordered relationships
   plus bands from the measurement.
6. CONTEXT.md: Difficulty updated with its levels, and Pilot skill added, cross-referenced.
7. `npm run verify` on ryzen; title-screen E2E (Settings) on nexus's GPU under `hwlock nexus-compute`.
8. Handoff, MASTER_PLAN status line, email.
