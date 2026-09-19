# Plan 6, playable gunnery milestone — 2026-09-19

The first slice of [Plan 6](../superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps)
landed on `main` in three commits (`b39951e`, `b51791d`, and the one carrying
this document). Design: [combat design](../superpowers/specs/2026-09-19-combat-design.md);
plan: [combat plan](../superpowers/plans/2026-09-19-combat.md). Codex built
tasks 1-3 and the input half of task 4 up to its rate limit, uncommitted;
Claude resumed the same working tree, committed that slice unchanged except
for one legend label, and built the rest. Nothing was pushed or deployed.

## What the pilot gets

- **Space fires six .50-inch guns** from the Hellcat's wings: 800 rpm per gun,
  400 rounds per gun, 300 m convergence, 0.12 degree dispersion, every fifth
  round a tracer. Rounds have real flight time, gravity and wind-relative
  drag, and live 3 s. Sources and which numbers are estimates are in the
  design's "Initial data and sources"; the `source` string in
  `content/aircraft/f6f-hellcat.json` repeats them beside the data.
- **Targets take damage.** Each hit lands in a body-frame hit zone and takes
  10 of 120 structural HP plus 10 of 40 from that zone's system: engine,
  ailerons, elevator, rudder, fuel, or one wing's guns. Engine damage cuts
  power and progresses to seizure; control damage cuts that axis's rate;
  fuel damage leaks; a shot-away gun group cannot fire. Twelve hits destroy
  an airplane, once, at a stable tick with a stable attacker.
- **`?scenario=gunnery-range`** (DEV): the player parked on the Tacloban strip
  300 m south of the runway center, a chocked training Hellcat at the center
  exactly at the guns' convergence, and a second one 500 m ahead, 35 m left.
  Fire from the chocks or take off and strafe.
- **On screen and in the ear:** pooled tracer streaks, a hit flash per
  recorded hit, a fireball on a destruction, engine smoke sized by engine
  damage, a top-center readout of ammunition, hits, kills, health and damaged
  systems in both camera modes, and the machine-gun clip cued while the shot
  count is rising. Holding the trigger on empty guns, a paused frame and a
  repeated render frame are all silent.

## Measured, reference GPU, 2026-09-19

Tier 2 (`tests/e2e/gunnery.spec.ts`), Windows desktop, RX 6700 XT, 2560 x
1440, through the run-server with the launch args in force:
**3 passed / 0 failed, 25.2 s**, then the first case re-run once to log the
record below (passed again, 10.5 s). Every case asserts an empty
`validationErrors` list.

| Measurement | Value |
| --- | --- |
| GPU p95 while firing, 1440p | **0.760 ms** over 269 samples, 264 rounds fired (budget 6.0 ms) |
| ~3 s of continuous fire, parked | 318 rounds, ammo 2082, 12 hits, 1 kill, `poolSaturated` 0 |
| target-1 (300 m, at convergence) | structure 0, destroyed; systems hit: elevator, fuel |
| target-2 (500 m, 35 m left) | untouched |
| After release, 3.5 s later | shot count unchanged, 0 projectiles, 0 tracers |
| Paused with Space held, 1 s | shot count and `cuesFired` unchanged |
| Restart after a burst and a ditching | shots 0, ammo 2400, 0 projectiles, every airframe healthy, `cuesFired` unchanged 3 s later |

Three 1440p screenshots were read, not just taken (`test-results/gunnery-*.png`
on nexus): chase view firing shows two tracer clusters leaving the wings, the
readout `AMMO 2310  HITS 12  KILLS 1  HP 100%`, and the orange fireball over
the target downrange; cockpit view firing shows a tracer cross ahead of the
nose and the same readout above the panel; after release the readout shows
`AMMO 2088` with the target a dark silhouette on the strip.

Observed and not investigated: the DEV overlay read `dropped 19` on every
screenshot, at tick 74 already. That is the terrain-arrival catch-up on a
ground spawn, visible before this milestone; it is noted so nobody attributes
it to the guns.

Tier 1: `npm run verify` exits 0 at the final commit -- typecheck, lint at
zero warnings, dependency boundaries, **111 files / 1,175 tests / 1
pre-existing skip**. No golden trajectory and no landing snapshot changed:
a healthy airplane steps through the identical spec object (`damagedSpec`
returns its argument), and that identity is what the goldens ride on.

## Traps for the next session

- **Destroyed airplanes keep their entity slot and their mesh.** The
  renderer indexes airframes by entity order. The destruction is the
  fireball, full smoke and the `DESTROYED` readout; no wreck model.
- **Only the player fires.** Nothing in this milestone can destroy the
  player, so the frame's hold on a destroyed player is pinned at Tier 1
  (`tests/render/gunneryFrame.test.ts`) and never seen in a browser. Plan 7
  is the first thing that can shoot back.
- **Engine smoke was not seen in the Tier 2 run**: the twelve hits on
  target-1 landed in the tail and fuselage zones, never the engine. The
  smoke curve and its show/hide are Tier 1 only (`combatEffects.test.ts`).
- **Tracer pool is 256 streaks**; past it a round still exists and still hits,
  only its streak is skipped. `poolSaturated` on the projectile pool (4,096)
  counts rounds NOT emitted, which do not consume ammunition -- the design's
  rule. Both read 0 in every measurement above.
- **Gun audio is an edge on the shot count**, re-cued every 72 ticks
  (`GUN_CUE_INTERVAL_TICKS`, from the 1.30 s clip length). A one-frame tap
  costs one clip. It is not positional and does not vary with distance.
- **Restart** is only reachable from a debrief; the Tier 2 restart case
  ditches an airborne spawn to get one, exactly as `audio.spec.ts` does.
- `tests/e2e/audio.spec.ts` still presses `KeyP` as "deliberately UNBOUND";
  P has opened the navigation chart since Plan 14. It passes because any key
  is a gesture, but the comment is stale. Not fixed here: it is Plan 14's
  file and the gunnery run did not touch it.

## Remaining Plan 6 scope

Unchanged from the design: bombs, rockets, torpedoes, external-store mass and
drag, ship damage (hulls stop rounds and take none), and structural-overload
damage. AI pilots are Plan 7. The §15 row reads "in progress" for that reason.
