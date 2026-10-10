# Aircraft damage stages: plan

**Run:** unattended. **Mark's viewing checkpoint:** the final product only, flown on a dev slot before any merge.
**Branch:** `worktree-agent-ae648b20d14101ecc`. **Date:** 2026-10-09.

Mark's report (2026-10-09): "I shot an enemy zero and it froze in space in mid air. Needs to crash. At a certain level of damage (smoke could be increasingly coming out too) the engine should start to sputter and stall and eventually go dead. At certain hit point the plane catches fire and goes down. If no more hp left at all it should explode in a fireball and pieces of the plane should go down as debris."

## Rulings (Mark, 2026-10-09)

| Question | Ruling |
| --- | --- |
| What does fire mean? | Doomed. The fire burns what structure is left over about 10–20 s, then the airplane explodes, or it crashes first. AI pilots stop flying; the player keeps the stick but cannot save it. |
| When is the kill credited? | At the explosion or the impact, not at the fire, as ships score at the bottom. Credit goes to whoever set it alight. |
| Debris | The real parts that already exist as rig nodes (propellers, control surfaces) break off and tumble, plus generic dark fragments and the existing fireball. No Blender splitting. |
| Where | Worktree, unattended, final look only. |

## Why it froze

`stepAircraftEntity` (`src/sim/loop.ts`) returned a destroyed airplane unchanged every tick, and `kill.air`'s smoke trail was drawn at that frozen spot (Ruling R6, `src/render/fx/catalog.ts`). A destroyed airplane was never stepped again.

## Stages

All thresholds are ESTIMATES, named constants in `src/sim/damage/model.ts`, so tuning them changes one number each.

| Stage | Trigger | What happens |
| --- | --- | --- |
| Smoking | engine health < 100% | `engine.smoke` thickens as health falls (existing). |
| Sputtering | engine health < 50% (`SPUTTER_BELOW`, the audio's own failing line) | In each 0.25 s window the engine cuts to zero thrust in a share of windows rising from 0% at 50% health to 60% (`SPUTTER_MAX_CUT`) at the stall line. The draw is a hash of (tick window, aircraft id), so it is deterministic: replay and audio hear the same cuts the sim flew. The propeller windmills during a cut and the engine loop goes silent. |
| Stalled, dead | engine health < 15% (`ENGINE_DEAD_BELOW`) | No thrust. The prop windmills. The existing `engineDecayPerS` carries a hit engine down through the stages on its own. |
| On fire | structure ≤ 25% (`FIRE_AT_STRUCTURE`) | `burningSince` is set and the hit that did it names the `attacker`. The engine is dead. Every burning airplane but the player's flies `burningControls`: throttle off, a slow roll, the nose held 50° down, a falling spiral. AI stops targeting, following or chasing it (`isAircraftDoomed`). Further hits flash but take nothing: the fire alone drains the rest over 15 s (`BURN_S`). New `aircraft.fire` effect: flame trailing the engine, then thick black smoke. A burning airplane that reaches the sea or ground is destroyed, never ditched. |
| Exploded | structure reaches 0, whether by the fire or by one blow across the fire line (a cannon shell) | `kill.air` fireball, sparks and 30 dark fragments. The propellers and control surfaces break off (render-only, `debrisFlight`: a pure function of seconds since and a seed, so a replay scrubbed backwards reassembles the airplane), tumble for 12 s, and are gone. The fuselage falls as a wreck: gravity plus quadratic drag to a terminal 155 mph (`WRECK_TERMINAL_MPS` = 70 m/s), tumbling, still burning, until it hits. It is then hidden; the crash effect covers the spot. |
| Credit | explosion, or impact while burning | `creditDownedAircraft` credits `damage.attacker`, the hit that set it alight (or `lastHitBy`, frozen once burning, if an overload break-up cleared it). A direct kill of an unburnt airframe is still credited on the spot, as before. |

### The arithmetic, against the repo

**Superseded by Round 2** (handoff, "Round 2"): fighters are 4x tougher, so a Zero burns on its 24th .50 hit and a Hellcat on its 36th; bombers take hits too. The figures below are Round 1's.

- **Zero** (`structureHp` 80, `damagePerHit` 10): each .50 hit is 0.125 of structure. Six hits leave 0.25, so it catches fire on the sixth hit, then burns out in 15 s. Before this plan, eight hits destroyed it.
- **Hellcat** (120 HP): each .50 hit is 0.0833. Nine hits leave 0.25, so it catches fire on the ninth. Twelve used to destroy it.
- **Lethality rises about 25%:** it takes 9 hits instead of 12 to put a Hellcat out of the fight, and the same ratio holds for every airframe (the 75% of structure above the fire line). The Zero's 20 mm (hit scale 3) sets a Hellcat alight in 3 hits, and its 7.7 mm (0.4) in 23. The spec §5 ratios to zero structure were 12 : 4 : 30. The fire line is the knob if this needs walking back.
- **Engine stages for one hit:** a Zero engine hit (`subsystemHp` 25) leaves 60% health. With `engineDecayPerS` 0.05 the damage grows as (1 − health) · e^(0.05 t). It reaches the sputter line in ln(0.5/0.4)/0.05 = 4.5 s, then sputters for ln(0.85/0.5)/0.05 = 10.6 s, then is dead. A Hellcat engine hit (`subsystemHp` 40) leaves 75%, and reaches the sputter line in 13.9 s.
- **Fall during the burn:** headless (`damage-range`), a burning Zero lost about 2,200 ft (680 m) in the 15 s burn, from 8,200 ft. Below about 2,200 ft a fire therefore ends in the sea, not in an explosion.

## What changed where

- **Sim:**
  - `src/sim/damage/model.ts`: `burningSince`; `withStructure` (fire, destruction, attacker); `engineOutput`; `isDoomed`; `idSeed`; the burn in `ageDamage`; hits on a burning airframe take nothing.
  - `src/sim/loop.ts`:
    - `stepWreck`;
    - the engine output into `damagedSpec`;
    - `burningControls` for every non-player;
    - a burning ditching is `destroyed`;
    - the start-of-tick snapshot moves before `ageDamage`, so a burn-out is seen going down.
  - `src/sim/weapons/combat.ts`: `isAircraftDoomed`; the credit rules.
  - `src/sim/ai/{pilotTick,targeting,autoPursuit}.ts`: doomed is not a target, a leader or a threat.
- **Render:**
  - `fx/catalog.ts` (`aircraft.fire`, the fragments), `fx/events.ts`;
  - `airframeUpdate.ts` (windmill, `debris`), `scene/pivotedAirframe.ts` (`debrisFlight`);
  - `main.ts` hides a surfaced wreck;
  - `audio.ts` gates the engine on `engineOutput`;
  - `combatReadout.ts` shows ON FIRE and a `burning` diagnostic.
- **Audio:** `cues.ts`'s one-shot `engine_sputter` keys on "not crashed" rather than `engineRunning`, which is now false inside a cut window. No Web Audio code outside `src/audio/webAudio.ts`.
- **Content:** `content/scenarios/damage-range.json`, a Dev range.
- **Tests:**
  - `tests/sim/damage/stages.test.ts` (new). It is enrolled over every airframe with a combat block, and pins the eight.
  - Edits to `fxEvents`, `airframeUpdate`, `pivotedAirframe`, `cues`, and the lethality tests. Those now count hits to the fire line, and the duel and replica tools count a fire as decided.

## Out of scope

- The player's own explosion still freezes the world into the debrief, as a crash always has.
- No part-specific damage (a wing off, an engine on fire separately from the airframe), and no Blender splitting.
- Bombers (B-17, B-29, G4M, Ki-21) have no `combat` block and take no hits at all; that is unchanged.
