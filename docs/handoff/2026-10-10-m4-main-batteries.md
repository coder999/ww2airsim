# M4 handoff: main batteries, and the Gunnery Duel test range (2026-10-10)

**Status:** built on branch `worktree-agent-ad21505b9051bdcd7` (worktree
`/home/mark/projects/ww2airsim/.claude/worktrees/agent-ad21505b9051bdcd7`), cut from `main` `cbc7d5ff`. Not merged,
not deployed. Plan: `docs/superpowers/plans/2026-10-10-m4-main-batteries.md`. Run unattended; the viewing
checkpoint (final product only) is this document and its captures.

## What was built

- **Main batteries fire** (`src/sim/weapons/mainBattery.ts`, every number in `MAIN_BATTERY` and the per-gun
  `SHELLS` table). Each turret fires at the surface target M3 already chose for it (`aa.laying`), so there is
  one target choice, not two. A dual-purpose 5-inch mount that M2 has on an aircraft keeps shooting at the
  aircraft.
  - **Real shells.** Each kit has its shell weight, muzzle velocity, cited maximum range and rate of fire
    (NavWeaps figures, rounded). A drag is fitted per gun so a 45-degree shot lands at the cited range, and the
    elevation is solved over the same integration `flyProjectile` runs, so a perfect solution lands within
    7 ft of where it aims (`mainBattery.test.ts`). The shells fly as projectiles through `stepCombat` and meet
    hulls, structures, decks, land and the sea; never airplanes.
  - **Fire control.** Each salvo's aim point is off in range (2.4% of range, one standard deviation) and
    deflection (0.6%), four times wider on first sight and settling over 90 s, with a per-mount skill and a
    per-shell spread. Every draw is a hash of (seed, mount, tick): deterministic, and a world with no
    engagement draws nothing.
  - **Damage** is by shell weight to the 0.6 power, pinned so a 14-inch shell does 110 hull points and a
    5-inch 16. Two 14-inch hits sink a Fletcher (160); Yamato (1,200) takes eleven.
  - **Knock-out.** A burst within a gun's knock-out radius (20 ft for a 5-inch, 52 ft for an 18-inch) of a
    turret or AA mount knocks it out with a chance up to 60%, falling to nothing at the radius. The ship's
    damage record lists the mounts out (`mountsOut`); an AA mount out stops firing (M2 skips it), a turret out
    stops firing, and both freeze where they were pointing.
  - **Fire orders.** A scenario ship can say what its guns engage first (`"fireAt": [ids]`); otherwise M3's
    choice, now nearest hostile ship, then a battery (`aaa` structure), then any other building.
- **Opt-in (ruling R1).** Only a scenario with `"mainBatteries": true` fires. Every shipped scenario, test and
  replay is unchanged; DEV `?mainBatteries=all` frees every warship in any scenario, `?mainBatteries=off`
  holds them in one that frees them.
- **Sound.** `ship_gun_heavy` (Track I, I3) plays at every salvo, delayed by the speed of sound
  (`src/audio/spatial.ts`). Shell bursts use the existing explosion and water-crash takes.
- **Muzzle fire and smoke (Mark's added requirement).** A salvo is a `fired` impact naming its ship and mount;
  the FX layer asks the drawn mount for its muzzle (the front face of its guns under the current training and
  elevation, `ShipMountView.muzzle`) and triggers `muzzle.heavy` (8-inch and up) or `muzzle.light` there,
  thrown down the barrel: an orange flash, then a brown-grey cordite cloud that slows, spreads, drifts up and
  fades over 7 to 12 s. Same FX pool, no new draw call. Splashes and hits reuse the bomb (heavy shell) and
  rocket (lighter) recipes. Tests that can fail: `fxEvents.test.ts` (a salvo triggers the recipe at the
  muzzle, along the barrel, once) and `ship.test.ts` (the muzzle point follows training and elevation).
- **Gunnery Duel (dev)** (`content/scenarios/gunnery-duel.json`, title row "Gunnery Duel (dev)"): 2,000 ft
  over San Pedro Bay heading north; a Fletcher and a Kagero 5 miles apart, each ordered onto the other; a
  Cleveland anchored off Tacloban shells the hostile AAA battery, then turns on the Kagero. Measured over real
  terrain (`mainBattery.test.ts`): all three ships fire, and the Cleveland destroys the battery inside
  150 s.
- **Diagnostics.** `__ww2.combat().mainBattery`: on, shells in the air, salvos (ship, mount, tick) and bursts in
  the impact ring, each hull's points and mounts out.

## Duel tables (measured 2026-10-10 on ryzen, 16 seeds each)

Two ships on parallel courses at 15 knots, open sea, main batteries only (`tools/ai/duelSweep.ts`, harness
`tests/sim/weapons/duelHarness.ts`). "Time to sink" is the median time until the first ship's hull points reach
zero (she then takes 90 s to go down). "Hits to sink" is the mean shell hits on the loser, every caliber she was
hit by. "Hits per salvo" is per turret salvo (all its barrels), first ship / second.

| Pair | Range | Wins (first / second / neither) | Time to sink | Hits to sink | Hits per salvo |
| --- | --- | --- | --- | --- | --- |
| Fletcher v Kagero | 3 mi | 11 / 5 / 0 | 1 min 37 s | 11.9 | 0.10 / 0.26 |
| Fletcher v Kagero | 5 mi | 12 / 4 / 0 | 3 min 30 s | 11.9 | 0.05 / 0.12 |
| Fletcher v Kagero | 8 mi | 12 / 4 / 0 | 10 min 22 s | 11.8 | 0.01 / 0.04 |
| Abukuma v Fletcher | 5 mi | 14 / 2 / 0 | 3 min 16 s | 9.4 | 0.06 / 0.06 |
| Cleveland v Mogami | 5 mi | 5 / 11 / 0 | 2 min 5 s | 11.9 | 0.21 / 0.21 |
| Cleveland v Mogami | 8 mi | 5 / 11 / 0 | 3 min 55 s | 11.6 | 0.10 / 0.11 |
| Cleveland v Mogami | 12 mi | 11 / 5 / 0 | 9 min 51 s | 14.5 | 0.06 / 0.04 |
| Pennsylvania v Yamato | 8 mi | 4 / 12 / 0 | 4 min 14 s | 12.5 | 0.27 / 0.20 |
| Pennsylvania v Yamato | 12 mi | 4 / 12 / 0 | 9 min 10 s | 11.9 | 0.12 / 0.08 |
| Pennsylvania v Yamato | 15 mi | 2 / 14 / 0 | 15 min 35 s | 11.5 | 0.06 / 0.05 |
| Pennsylvania v Kagero | 8 mi | 16 / 0 / 0 | 3 min 39 s | 2.3 | 0.09 / 0.09 |
| Pennsylvania v Mogami | 10 mi | 16 / 0 / 0 | 5 min 30 s | 4.0 | 0.10 / 0.08 |
| Fletcher v Yamato | 5 mi | 0 / 16 / 0 | 1 min 51 s | 5.6 | 0.10 / 0.17 |

Mean mounts knocked out per duel (both ships): 0.6 to 1.4 for destroyers, 2 to 4 for cruisers and battleships.

How the numbers were found: the first sweep (salvo error 1.2% of range) sank destroyers at 5 miles in about
2 minutes and battleships at 9 miles in 3; doubling the aim error to today's figures gave the table above. The
pinned 8-seed cases are in `tests/sim/weapons/duel.test.ts`. Retune with
`REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/duelSweep.ts 16 fletcher-dd:kagero-dd@8047 '{"rangeErrorFraction":0.03}'`.

## Captures (nexus Radeon 680M, 1920x1080, God mode, 2026-10-10)

`docs/handoff/2026-10-10-m4-main-batteries-shots/`, from `tests/e2e/mainBatteryCapture.spec.ts` (capture-gated;
it reads the salvo off `__ww2.combat().mainBattery` and freezes the frame with the page overlays hidden):

- `broadside-flash.png`: the Fletcher at the moment of a salvo, from about 1,000 ft off her port side: the
  muzzle flashes at her forward mounts, earlier salvos' smoke drifting aft.
- `broadside-smoke.png`: the same 2.5 s later.
- `range-overview.png`: a minute in, the Kagero under fire half a mile off, a splash beside her.

These are correctness and look captures on nexus's GPU, not reference-GPU measurements. The view is the chase
camera, so the turrets read small; the muzzle placement itself is proven by the unit tests above.

## Frame time

**Not measured.** The muzzle smoke adds particles to the existing FX pool (no new draw call, pass or
shader); it does add overdraw. Both shared ryzen slots (`ww2airsim-2` on 5175, `ww2airsim-3` on 5174) were
held by other sessions for the whole run, so the reference-GPU budget run could not be made. The spec is
ready: `tests/e2e/mainBatteryFrameTimeCapture.spec.ts`, `MB_VARIANT=live|off` interleaved three each, under
`hwlock ryzen-budget`, beside the Fletcher at 300 ft (live against the same scene with `?mainBatteries=off`).
Run it before clearing the effect against the 8.33 ms gate.

## Verify

`npm run verify` through `REMOTE_RUN_OVERFLOW=0 remote-run` on ryzen, 2026-10-10, with two other sessions'
verifies running beside it: typecheck, lint and dependency-cruiser passed; tests **5,642 passed, 3 failed,
12 skipped** (408 files). Two failures were the 30 s timeout under that load (`aiLethality.test.ts` 46 s,
`soak.test.ts` 32 s); the third was `bootQuality.test.ts` reading `main.ts`'s source for the exact
`return applyDifficulty(built, ...)` line, which the DEV `?mainBatteries` query had renamed. Fixed, then the
three re-run alone with `duel.test.ts`: **45 of 45 passed** (soak 37 s, aiLethality 20 s, duel 38 s).

## Rulings for Mark (defaults taken unattended)

1. **R1 Opt-in.** On everywhere, the Range Test's anchored enemies would shell Tacloban while you take off, and
   the Friendly Fire Range's Essex would sink its target Maru (both measured by a scenario survey). So only
   `"mainBatteries": true` scenarios fire. See the alternative with `?mainBatteries=all` (DEV).
2. **R2** Shells do not inherit their ship's velocity, and the solve ignores wind.
3. **R3** Shells never hit airplanes; a shell kill credits no airplane; a friendly ship in the line of fire can
   be hit.
4. **R4** No armor or penetration: damage is shell weight. Yamato's 18-inch outclasses everything (she wins 12
   to 14 of 16 against Pennsylvania).
5. **R5** A turret will not fire within 30 degrees of straight back over its own ship.
6. **R6** M5 difficulty does not scale main batteries (they never fire at your airplane).
7. **Tuning.** Destroyers at 5 miles take about 3.5 minutes, battleships at 12 miles about 9. Faster or slower
   is one number (`rangeErrorFraction`).
8. **Muzzle effect size** is reasoned, not compared with a photograph; a 5-inch salvo is 0.6 of a 14-inch one.

## Open items

- The frame-time run above.
- Mark's eye and ear: the muzzle flash and smoke, the `ship_gun_heavy` level (`cueGain` 0.6, unchanged), and the
  pace of the duel.
- Shore batteries do not fire back at ships (they are AA only); a coastal-gun battery model exists
  (`content/library/coastal-gun-battery.json`) but is not a structure kind.
- No flooding from shells (Track D owns waterline damage).
- Surigao Strait (Track M item 6, then Track F) is now content only: a scenario with `"mainBatteries": true`,
  its ships and `fireAt` orders; Yamashiro and Fuso need models.
- `MASTER_PLAN.md` Track I still lists `ship_gun_heavy` as unwired (Today and I3); fix on merge.

## Integration

Shared files touched, small and local: `combat.ts` (a `shell` projectile branch, the M4 call after `stepAa`, a
`mainBattery` field), `aaFire.ts` (knocked-out mounts, `fireAt`, battery preference), `scenario.ts`
(`mainBatteries`, `fireAt`), `ships.ts` (`ShipOrders.fireAt`), `impacts.ts`, `fx/events.ts`, `fx/catalog.ts`,
`audio.ts`, `spatial.ts`, `ship.ts` (`muzzle`), `main.ts`, `combatReadout.ts`, `titleScreen.ts` (one row; the
Escort bundle adds one too, a trivial conflict) and the three scenario enrollment lists in tests.
