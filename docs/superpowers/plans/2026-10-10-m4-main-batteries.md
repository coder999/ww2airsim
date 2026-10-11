# M4: main batteries, and the Gunnery Duel test range

**Status (2026-10-10):** in progress on branch `worktree-agent-ad21505b9051bdcd7`, worktree
`/home/mark/projects/ww2airsim/.claude/worktrees/agent-ad21505b9051bdcd7`, cut from `main` `cbc7d5ff`.
Master plan items: Track M 4 (M4 Main batteries) and the first half of Track M 6 (the test range).
Surigao Strait is out of scope; it is left a content-only step.

**Mark's decisions (2026-10-10):**
- **Big-gun hits matter.** A heavy shell takes a real bite of hull points: a destroyer dies to a few, a
  battleship to many. A near hit can knock out a turret or AA mount. Tune with measured duel tables (time
  to sink and hits to sink, by ship pair and range) and put them in the handoff.
- **Muzzle fire and smoke (added mid-run).** When the big guns fire there is a visible muzzle flash and a
  smoke cloud that drifts and fades, at the drawn muzzles as M3 trains and elevates them. Reuse the FX
  system; a test proves a firing event emits the effect at the muzzle; the handoff carries a broadside
  capture; measure under `hwlock ryzen-budget` if it adds draw cost.

**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode:** unattended, to completion.
**Heavy jobs:** `REMOTE_RUN_OVERFLOW=0 remote-run` on ryzen (tsc, eslint, vitest, verify, sweeps). Nexus
runs only single small test files. Browser correctness captures under `hwlock nexus-compute`.

## Starting point (read 2026-10-10 from the repo)

| Fact | Where | Consequence |
| --- | --- | --- |
| M3 picks each main turret's target (nearest hostile ship, then structure) and publishes a pose in `aa.laying`; it never fires. Its lead is a flat 760 m/s intercept. | `src/sim/weapons/aaFire.ts` (`MAIN_BATTERY_LAYING`), M3 handoff | M4 consumes M3's target choice and replaces the visual lead with the real shell's ballistic elevation. |
| A dual-purpose turret engaged by M2 on an aircraft keeps its AA pose. | `aaFire.ts` | It does not fire at the surface that tick. |
| Ship hull damage is one `hullHp` pool; DD 160, CL 300-360, CA 420, BB 960/1200. A 1,000 lb bomb does 120, a Mk 13 torpedo 136 plus flooding. | `content/ships/*.json`, aircraft stores | Shell damage is scaled against those. |
| Projectiles fly through `flyProjectile` (gravity + quadratic drag) and meet hulls, structures, decks, land and sea in `nearestContact`. | `src/sim/weapons/combat.ts` | A shell is a `Projectile` with a `shell` field, flown and resolved in its own small branch, like M2's AA rounds. |
| `ship_gun_heavy` is in `AUDIO_ASSETS`, unwired. Blasts reach audio through the impacts ring. | `src/audio/assets.ts`, `src/render/audio.ts` | A `fired` impact plays it with the speed-of-sound delay. |
| FX triggers carry a velocity that emitters inherit. | `src/render/fx/system.ts` | A muzzle recipe aims its flash and smoke down the barrel without a new system. |
| Survey of every shipped scenario (tools script, 2026-10-10): opposing armed ships or structures inside gun range exist only in Range Test (both: anchored enemies 1.0-1.3 mi from Tacloban's buildings) and Friendly Fire Range (an Essex 1.2 mi from the target Maru). Flattop Hunt's carriers start 20 mi apart. | `content/scenarios` | See ruling R1. |

## Design

- **`src/sim/weapons/mainBattery.ts`** owns every M4 number (`MAIN_BATTERY` and the per-kit `SHELLS` table:
  shell weight, muzzle velocity, cited maximum range, rate of fire, damage, knock-out radius) and the pure
  functions: the drag fit, the ballistic elevation solve (bisection over the same integration
  `flyProjectile` does, so a perfect solution lands where it aims), lead, aim error and the per-tick
  `stepMainBattery`.
- **Damage** scales with shell weight to the 0.6 power, pinned so a 14-inch shell does 110 (a 5-inch about
  16). Measured duel tables decide the final numbers.
- **Fire control.** Each salvo's aim point carries a range and deflection error proportional to range,
  wide at first and settling over the first minute on a target (as M2's ranging does); each shell adds its
  own spread. Every draw is a hash of (seed, mount, salvo), so nothing advances a cursor and a world with
  no main-battery engagement is unchanged.
- **Knock-out.** A shell bursting within its caliber's radius of a mount knocks it out with a chance falling
  off with distance. The ship's damage record lists the mounts out; an AA mount out stops firing, a turret
  out stops firing and freezes where it was.
- **Opt-in (ruling R1).** Main batteries fire only in a world whose scenario says `"mainBatteries": true`
  (the combat state then carries `mainBattery`). Every other scenario, replay and test is bit-identical.
  DEV `?mainBatteries=all` turns them on in any scenario to see the alternative.
- **Render.** `fired` impacts carry the ship and mount; the FX layer places a muzzle recipe at the drawn
  mount's muzzle (computed from the kit's gun geometry under the current pose) aimed down the barrel.
  Shell bursts reuse the bomb (heavy shells) and rocket (light shells) water, land and hit recipes.
- **Test range:** Dev scenario `gunnery-duel`: Pennsylvania and a Fletcher against Yamato's consort
  Kagero and Mogami at about 8 miles, and a Cleveland shelling a hostile Tacloban AAA battery.

## Tasks

1. Plan (this file), emailed.
2. `mainBattery.ts`: shell table, drag fit, solver, lead, knock-out; unit tests (a perfect solution hits;
   the drag fit returns each cited range; the solver refuses beyond range).
3. Wire into `stepCombat` (opt-in), shells flown and resolved, knock-outs applied to AA and turrets, M3
   pose elevation from the solve; tests: opt-out bit-identity, a duel sinks a destroyer, knock-out stops a
   mount, determinism.
4. Duel harness and sweep (`tools/ai/duelSweep.ts`), tuning, pinned tables (`tests/sim/weapons/duel.test.ts`).
5. Audio (`ship_gun_heavy`), FX (muzzle recipe and shell bursts), render muzzle points; tests.
6. Scenario `gunnery-duel`, title-screen row, scenario `mainBatteries` field, DEV query param.
7. Browser capture of a broadside (nexus GPU, `hwlock nexus-compute`); budget run on ryzen only if the
   effect adds draw cost.
8. Verify on ryzen; handoff, emailed; MASTER_PLAN M4 line.

## Rulings taken unattended (the handoff lists them for Mark)

- **R1 Opt-in.** Turning main batteries on everywhere would have the Range Test's anchored enemies shell
  Tacloban while the player takes off and the Essex sink the Friendly Fire Range's target Maru. Default
  off; `?mainBatteries=all` shows the alternative.
- **R2** Shells do not inherit their ship's velocity, and wind is not in the solve (it is an error source).
- **R3** Shells hit ships, structures, land and sea, never aircraft. Shell damage gives no credit to any
  airplane; friendly ships can be hit physically.
- **R4** No armor or penetration model: damage is by shell weight.
- **R5** A turret may not fire within 30 degrees of straight back over its own ship.
- **R6** M5 difficulty does not scale main batteries (they never fire at the player's airplane).
