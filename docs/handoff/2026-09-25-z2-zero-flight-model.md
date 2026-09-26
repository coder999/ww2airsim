# Z2 handoff: the A6M Zero's flight model and armament (2026-09-25)

**`view.model` is not set.** Z1 had not landed on `main` when Z2 finished (checked 2026-09-25: `main`'s `src/sim/flight/schema.ts` has no `view.model`), so `content/aircraft/a6m2-zero.json` carries no `model` key; with `view` still `.strict()`, one would fail to load. **Whichever of Z1 and Z2 merges second adds `"model": "wildcat"` to the Zero's `view` block** (or `"a6m2-zero"` if Z1's registry already registers that id; Z3 flips it). Z1's registry-coverage test ("every `content/aircraft/*.json` names a registered model") fails loudly until someone does.

*Resolved 2026-09-25 at the merge into `main`: Z1 landed first, so the Z2 merge set `"model": "wildcat"`. The Zero renders as the Wildcat stand-in until Z3.*

Branch `worktree-combat-track`, cut from `main` at `d68a652` (`git merge main` at the start was already up to date). Not merged, not pushed. Plan: [2026-09-25-z2-zero-flight-model.md](../superpowers/plans/2026-09-25-z2-zero-flight-model.md). Spec: [2026-09-25-a6m-zero-design.md](../superpowers/specs/2026-09-25-a6m-zero-design.md) §4, §5, §11 "Z2".

## What changed

- `f89d164`: optional `reference.takeoffDistanceM`, `topSpeedByAltitudeM` and `climbRateByAltitudeM` (altitude strictly increasing, value positive). The F6F card reads its take-off distance with a non-null assertion; `schema.test.ts` pins that it is still 230.124 m.
- `40c2e5e`: `content/aircraft/a6m2-zero.json` (A6M2 Model 21, graded at the trial's 5,555 lb) and `tests/sim/testcards/a6m.test.ts`, cards 1-6.
- `ef71ef9`: `src/sim/math/piecewise.ts` (the power curve's lookup, moved unchanged); `equivalentAirspeedMps` and `controlFade` in `src/sim/flight/model.ts`; optional `rates.controlFadeByEasMps`. The Zero's controls fade from 250 mph EAS to a 0.2 floor at 350 mph.
- `ea681c1`: `engineCutOut` and optional `engine.negativeGCutout`. Thrust is zero while lift is strictly negative; stateless.
- `773aa81`: `src/sim/weapons/gunTypes.ts` (`gunBallistics`, `isPrimaryGun`); optional `combat.gunTypes` and `guns[].type`, with load-time checks for an unknown type and for a top-level ballistic no mount fires; per-mount cadence and muzzle velocity, `Projectile.gunType`, per-round drag and `hitScale`; `damageFromHit(..., hitScale = 1)`; the sight harmonizes to the primary guns by default.
- `dd63f0b`: the Zero's `combat` block: two Type 97 7.7 mm (500 rounds each, 650 rpm synchronized, 745 m/s, hitScale 0.4) and two Type 99-1 20 mm (60 rounds each, 520 rpm, 600 m/s, hitScale 3.0); structureHp 80, subsystemHp 25, fuel leak 1.5 kg/s.
- `f0dc641`: matchup cards; `tests/fixtures/scenarios/zero-merge.json` and `tests/sim/zeroMerge.test.ts`; `BotRun.opponentShots` and `opponentHits` in `tests/sim/gunneryBot.ts`.
- `e8cab21` (final-review fix): the cutout never fires while the wheels are in contact. Keyed on lift alone, a forward tap on the take-off roll put the nose below the -1.19° zero-lift attitude and killed the engine; the Zero then decelerated (20.9 to 19.5 m/s over 5 s of hesitation) and, below `tailUpSpeedMps`, where the ground regime gates pitch to 0, could never raise the nose again. On the ground the reaction holds the airframe at positive g, so the carburetor stays fed. `negativeG.test.ts` pins it.

`npm run verify` (run as typecheck, lint, depcruise and the full vitest suite under a lock shared with a concurrent session) gave `rc=0` after every commit. After `e8cab21`: 1717 passed, 12 skipped (the missing terrain tiles).

## The measured cards (2026-09-25, `tools/testcards/measure.ts`, node v22.22.1)

Every figure reproduced the plan's pre-measurement to the printed digit. The fade and the cutout moved none of cards 1-6.

| Card | Trial | Model | Error | Tolerance |
| --- | --- | --- | --- | --- |
| Top speed, 4,877 m (critical) | 145.74 m/s | 142.10 | -2.50% | 5% |
| Top speed, SL | 120.70 | 124.93 | +3.51% | 5% |
| Top speed, 1,524 m | 128.30 | 131.08 | +2.17% | 5% |
| Top speed, 3,048 m | 136.35 | 137.64 | +0.94% | 5% |
| Top speed, 6,096 m | 143.72 | 140.66 | -2.13% | 5% |
| Top speed, 7,620 m | 140.82 | 137.52 | -2.35% | 5% |
| Top speed, 9,144 m | 136.79 | 131.73 | -3.70% | 5% |
| Climb, SL | 13.97 m/s | 16.166 | +15.72% (F6F: +16.77%) | 25% |
| Climb, 4,572 m | 12.09 | 14.286 | +18.17% | 30% |
| Climb, 6,096 m | 9.19 | 11.250 | +22.41% | 30% |
| Climb, 9,144 m | 4.32 | 5.079 | +17.57% | 30% |
| Stall, clean, power off | 34.87 m/s | 35.765 | +2.57% | 20% |
| Stall, gear and flaps down | 30.85 | 31.585 | +2.38% | 20% |
| CLmax ratio | 1.2779 (derived) | 1.2822 | | 1 decimal |
| Roll at 95 m/s (ESTIMATE graded against itself) | 80 deg/s | 79.996 | 0.00% | 15% |
| Roll at 111.76 m/s (250 mph, fade = 1) | 80 | 79.996 | | 0 decimals |
| Roll at 150 m/s (fade 0.24336) | 19.47 | 19.468 | | 0 decimals |

Matchup cards (direction only):

| Card | F6F | Zero |
| --- | --- | --- |
| Top speed, SL / 4,877 m / 9,144 m, m/s | 137.30 / 160.28 / 169.39 | 124.93 / 142.10 / 131.73 |
| Stall clean / flaps, m/s | 45.47 / 39.13 | 35.77 / 31.59 |
| Take-off roll, full flaps, own take-off speed | 236.08 m at 86.5 mph | 168.17 m at 75 mph |
| Roll at 90 m/s, deg/s | 69.90 | 75.79 |
| Roll at 150 m/s, deg/s | 80.00 | 19.47 |
| Wing loading at trial weight | 1,780 N/m² | 1,101 N/m² (ratio 1.62) |

## Bit-identity evidence (node v22.22.1, same machine)

| Check | Before Task 3 | After Task 3 | After Task 4 | After Task 5 | After `e8cab21` |
| --- | --- | --- | --- | --- | --- |
| F6F golden trajectory JSON, sha256 | `d1fe0503…5f174e1e` | same | same | same | same |
| F6F 3 s tail-chase combat state, sha256 | `66765241…d32d23fc24f1fb` | — | — | same (240 shots, 12 hits, destroyed at tick 30, 73 in flight) | same |

Full digests: `d1fe050392928fd61d0d11e74d71111467337a4bda82cbc2b2f7803c5f174e1e` and `66765241c03703385bf44e676e5f619dd70a356934eb3af42ad32d23fc24f1fb`. In-process identity tests also pin it: `controlFade.test.ts` (absent vs neutral table), `negativeG.test.ts` (F6F absent vs `false`), `gunTypes.test.ts` (every F6F mount typed to its own values changes nothing but the tag).

## zero-merge (test fixture only)

The F6F player (the scripted reticle bot) against a green AI Zero, head-on from `pursuit-range`'s geometry, 8 noise cursors, 30 s: a firing chance at 8.63-8.65 s in 8/8 runs, **8/8 kills** at 9.07-9.57 s with 8 hits each. The AI Zero fired **0 rounds** in every run. That is the gunnery handoff's open item (the pursuer never fires after the merge, left to 7c), not a Zero property. The plan's draft Zero measured 6/8 kills.

## Open items

- **Ship and structure hits ignore `hitScale`,** as spec §5 states: a 20 mm shell does `roundDamage` to a ship, same as a 7.7 mm. Should a cannon do more to a ship?
- **Windmill drag does not apply while the engine is cut.** The windmilling-propeller term follows the throttle, not the cutout.
- **The cutout is stateless:** there is no sputter-and-recover over about a second, as the real engine had.
- **The cutout is off on the wheels** (`e8cab21`), a deviation from spec §4.4's literal "while the wing's lift is negative" in favor of its intent (negative g). Engine audio does not react to a cutout; that is outside Z2.
- **The pitch fade also limits dive recovery:** at the 0.2 floor the Zero commands 6 deg/s of pitch, about 1.7 g at 156 m/s EAS. Spec §4.4 fades pitch on purpose; an AI Zero diving fast is 7c's safety envelope's concern.
- **The fitted power curve falls from 3,000 m while the source holds manifold pressure to 16,000 ft.** That is the ram-air compromise: the model has one power curve for level flight (with ram) and the climb (without). The alternative is the spec's curve with climb at altitude graded by direction only.
- **For 7c:** an AI Zero that pushes the velocity controller into negative g loses thrust, and above 250 mph its commanded rates fade. Both are the airplane working as designed, and both belong to 7c's safety envelope.
- **For the AI gunnery follow-on:** the Zero's cannon fly at 600 m/s while the AI leads at 745 (the primary, 7.7 mm ballistic).
- **Z3** re-measures `gear.heightM`, `view.eyePointM`, the gun positions and the hit zones from the built LOD0 mesh, and re-runs the take-off and matchup cards in the same commit.

## Deferred minors from the final review

- `gunBallistics` throws inside `stepCombat`'s per-round loop if an owner's live spec lacks a round's `gunType`. Unreachable today (specs are validated and `damagedSpec`/`storesSpec` keep `combat`); the store path `continue`s instead.
- `gunBallistics` builds a fresh object for every untyped-mount call on the per-tick path.
- The primary-ballistic predicate exists twice: `CombatSpecSchema`'s `superRefine` and `isPrimaryGun`.

## No Tier 2

No render code changed, and no shipped scenario names the Zero (the fixture lives under `tests/fixtures/scenarios/`, which nothing ships). Z3's `zero-range` is the first scenario that puts it on screen.
