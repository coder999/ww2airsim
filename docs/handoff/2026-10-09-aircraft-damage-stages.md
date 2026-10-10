# Handoff: aircraft damage stages (2026-10-09)

**Branch:** `worktree-agent-ae648b20d14101ecc`, not merged. **Plan:** `docs/superpowers/plans/2026-10-09-aircraft-damage-stages.md`. **Run:** unattended; final look only.

## What you asked for, and what is there now

A shot-down airplane no longer freezes in the air. In order:

1. **Engine hit:** it smokes, thicker as the engine gets worse.
2. **Below half health:** it sputters. The thrust and the engine sound cut out in short bursts, more often as it worsens, and the propeller windmills.
3. **Below 15%:** it stalls dead. The prop windmills, and there is no thrust.
4. **At 25% structure:** it catches fire. Flame trails from the engine with thick black smoke, and the pilot gives up into a falling spiral. Your guns do no more to it; the fire burns it out in 15 s.
5. **At zero:** it explodes. There is a fireball and dark fragments. The propeller and the control surfaces break off and tumble away. The fuselage falls burning, at up to 155 mph, and disappears when it hits the sea or ground.
6. **The kill:** it counts when it explodes or hits the surface, never at the fire, and it goes to whoever set it alight. The HUD readout shows ON FIRE for your own airplane.

If you are the one on fire, you keep the stick but cannot put it out.

All the thresholds are estimates, named constants in `src/sim/damage/model.ts`; the plan has the table and the arithmetic.

## How to see it

**Host:** `https://ww2airsim-2.windomlane.org/` (dev slot 2, served from this worktree; curl returned 200 on 2026-10-09).

- **Straight in:** `https://ww2airsim-2.windomlane.org/?scenario=damage-range&launch`.
- **Through the title screen:** tick Dev, then pick **Damage Range (dev)**.
- **The range:** you are at 8,200 ft behind three Zeros flying straight and level. They have no pilots, so they will not fight back.
- **Holding Shift** (the pursuit autopilot) lines you up on the nearest Zero.
- **To see each stage:** tap Space in short bursts. A long burst gets to the fire in under a second, and once it is burning you can stop firing and watch it go down. An engine hit, for the smoke-sputter-stall progression, is luck of where the rounds land.
- Once a Zero is on fire the autopilot moves on to the next one.

## Captures

Nexus's own GPU (Radeon 680M), Playwright through the slot host, Shift and Space by script.

![A Zero on fire, nose down, flame at the engine](captures/2026-10-09-aircraft-damage-stages/zero-on-fire.jpg)

The explosion and the debris were not captured. The burning Zero dives away faster than a scripted chase camera could follow, and three tries framed only the empty sea. They are covered at Deterministic instead:
- `tests/sim/damage/stages.test.ts`: explosion timing, the wreck's fall, credit;
- `tests/render/pivotedAirframe.test.ts`: the parts fly off, hide, and come back when scrubbed;
- `tests/render/fxEvents.test.ts`: the fire and trail follow the wreck down.

They are the part to look at when you fly it.

## Verification

- `npm run typecheck`, `npm run lint` and `npm run depcruise` are clean, and the full suite passes: **376 files, 5,084 passed, 17 skipped** (2026-10-09, this branch).
- New: `tests/sim/damage/stages.test.ts` (18 tests). It is enrolled over every airframe with a combat block and pins the eight: A6M2, D3A, F4F, F4U, F6F, Ki-43, Ki-84, P-38. Each catches fire from a single-caliber stream and then only the fire finishes it.

## Rulings I made unattended (yours to reverse)

1. **Hits on a burning airplane take nothing.** A held .50 burst puts eight hits in a Zero in half a second, so the fire stage lasted a few frames and you would never have seen it. Your "fire drains its remaining structure over 10–20 s" reads as the fire alone finishing it. Hits still flash and count as hits. To restore "keep firing to finish it": remove the `burningSince` guard in `damageFromHit` and `blastDamageAircraft`.
2. **Lethality is up about 25%.** The fire line is where an airplane is out of the fight: 9 .50 hits on a Hellcat instead of 12, 6 on a Zero instead of 8. The tests that measured "hits to kill" now measure hits to the fire line, with the new numbers. To walk it back, lower `FIRE_AT_STRUCTURE` and raise `structureHp`.
3. **The AI ignores a burning airplane.** It is no longer a target, a leader to follow, or a pursuit-autopilot target (`isAircraftDoomed`). The kill still waits for `isAircraftDown`.
4. **Green against green, crossing, is unpinned** in `tests/sim/ai/gunnery.test.ts`. The sputter cost it its 2 of 8 kills (0 of 8 with the cut-outs, 2 of 8 without; every other row unchanged). The sputtering target's pulsing thrust spoils a green's lead. It was the last green-green row and was 2 of 8 to begin with.
5. **The wreck has no ground with no terrain.** It falls forever, the same as any airplane in a world without terrain (tests and the first seconds before the heightfield arrives). With terrain it hits the sea or land as expected.

## Open

- **The player's own explosion** still freezes the world into the debrief, as a crash always has. Watching your own wreck fall would be a frame-layer change.
- **Bombers** (B-17, B-29, G4M, Ki-21) have no `combat` block, so they take no hits, and none of this reaches them. Unchanged.
- **The `engine_sputter` cue** still plays once, on the way below half health. Each cut-out is heard as the loop dropping out, not as a new clip.
- **Debris:** only the pivoted (R3) models' parts break away. Those are all but the Wildcat, whose airframe module is its own; it gets the fragments and the fireball without the loose parts.
