# Plan 7g — landing AI (amended design)

**Status:** approved in conversation by Mark, 2026-09-27, as an amendment to
§6 of the [7c-7g design](2026-09-25-ai-7c-design.md), which he approved on
2026-09-25. Everything in that §6 still holds except where this file says
otherwise, as do the design's cross-cutting constraints (§7) and what it
deliberately leaves out (§9). This file restates only what changed or was
added.

**Measured start:** `main` at `c5097e8`, 2026-09-27. File and symbol names
below were read at that commit.

## Why it was amended

Three things turned up when §6 was checked against `main` after 7e, 7f, the
missions track and the sortie forms landed:

1. The fuel trigger is real code but will almost never fire in a sortie.
2. 7f's final review found that `parked` is a spawn flag nothing clears in
   flight ([7f handoff](../../handoff/2026-09-27-plan7f-formation.md) Open
   item 1). 7g is the first plan that moves an AI from flying to on the
   ground, so it inherits that bug in both directions.
3. §6 left a landed AI "where it stopped". With a 60 s interval and no
   aircraft-to-aircraft collision, the next arrival lands inside it.

## What §6 keeps, unchanged

`pilot.home`; the return-to-base decision at rescore, pre-empting `engage`
unless a threat is astern; the phases `transit`, `join`, `configure`,
`final`, `rollout`, `landed`; `approachControls` promoted to
`src/sim/ai/approach.ts` with `tools/autopilot/approach.ts` re-exporting it
and both landing tests' inline snapshots bit-identical; the capture window at
the final approach fix and the go-around; the live deck pose and the AI
obeying `paddlesCue`'s wave-off; the 60 s id-order interval with later
arrivals orbiting the initial point; the terrain rule; the `recovery-range`
development scenario; and every §6 acceptance item.

Premises re-checked at `c5097e8`: `PilotMode` already reserves `rtb` and
`landed` (`src/sim/ai/pilot.ts:152`); mode selection is one expression in
`pilotTick.ts` (the `chosen !== null ? 'engage' : ...` chain);
`paddlesCue` is in `src/sim/paddles.ts`; `approachControls` is still in
`tools/autopilot/approach.ts`; fuel burns in `src/sim/flight/model.ts`.

## 1. Return-to-base triggers

The fuel trigger (fraction ≤ 0.25) stays, but it is documented in code as
practically dormant: `FUEL_KG_PER_JOULE` is tuned so a full internal load
lasts "a realistic few hours at cruise" (`model.ts`). Tier 1 tests the three
triggers that fire in play: ammunition exhausted, `structure` < 0.5, and 30 s
without a hostile in detection range. The fuel trigger gets one unit test on a
hand-set `fuelKg`, not a flown one.

## 2. Targeting reads ground state, not the spawn flag

Mark, 2026-09-27: fold the fix into 7g.

- `isContact` in `src/sim/ai/targeting.ts` and the enemy filter in
  `src/sim/ai/autoPursuit.ts` stop reading `AircraftEntity.parked`. Both use
  the state-based on-the-ground test 7f introduced for `leaderAirborne`
  (`onGround` against `groundUnder`, the same test `canRelease` in
  `weapons/combat.ts` uses). It is already exported as
  `leaderAirborne(leader, terrain, decks)` (`src/sim/ai/formation.ts:229`);
  it is renamed to a role-neutral `airborne` in one shared module under
  `src/sim/ai/` and both callers import it, rather than copying it.
- Result: a player who launched from a deck or runway becomes a contact once
  airborne; an AI in mode `landed` stops being an air-to-air contact.
- `src/sim/ai/holdFire.ts` keeps counting parked and landed aircraft, so the
  AI still refuses a shot through a friendly on the ground.
- Tier 1, one test per direction: an AI engages a hostile player that took
  off from a deck; an AI does not select a hostile that has landed.

## 3. Respot after landing

Mark, 2026-09-27: "respot clear".

- `RESPOT_DELAY_S` (3 s, `src/sim/mission/respot.ts`) after an AI comes to
  rest, it is re-placed on a park spot: braked, throttle 0, hook up, gear
  down, facing the bow or down the runway heading. Mode `landed` stays
  terminal. The carrier case builds its state with the existing
  `stateOnDeck`; the airfield case uses its analogue, built next to it with
  `parkedAttitude` from `src/sim/world/airfields.ts`.
- **Deck park.** Spots are a pure function of `flightDeck` and `trapZone`:
  two columns abreast either side of the centerline, filling aft from near the
  bow, and every spot forward of the trap zone's forward edge
  (`toSternM`) by a clear margin. Spacing is a tuning constant sized from the
  largest wingspan among shipped flight specs. No new content fields.
- **Airfield park.** Spots are a pure function of the runway rectangle: one
  row parallel to the runway, off its surface. Each spot is checked when the
  scenario loads with terrain present: on land, within 2 m of runway
  elevation, and outside every structure footprint.
- **Assignment** is in id order among the AI homed to that place, so it is
  deterministic and independent of landing order.
- **Validation** (each rule rejects its case by name): a scenario that homes
  more AI to one ship or airfield than it has park spots; an airfield whose
  spots fail the terrain check. The terrain check runs only when terrain is
  loaded, the same way airfield recovery waits for it.
- **Acceptance (added to §6's):** two AI recover to one carrier and come to
  rest on two distinct deck-park spots, both clear of the trap zone, at rest
  relative to the deck; the same for one runway, skipping by name when the
  terrain tiles are absent; `structuredClone` round-trips a world with a
  respotted AI.

## 4. Diagnostics

`__ww2.aircraft()` already reports `mode` (`src/render/main.ts:955`), which
is enough for Tier 2 to read `landed`. It gains the recovery phase for an AI
with a home. This is the one
edit in `src/render/main.ts`; re-diff against `HEAD` before committing
(7c-7g design §8).

## Deliberately not done

- AI takeoff from a deck or runway (Mark, 2026-09-27: recovery only; its own
  later plan). 7f's formation-takeoff interval moves with it.
- Taxiing. The respot stands in for it.
- Aircraft-to-aircraft collision (still not modeled anywhere).
- Any scoring effect: the recovery multiplier is the player's alone.

## Files

- New: `src/sim/ai/approach.ts` (promoted), `src/sim/ai/recovery.ts`
  (return-to-base decision, phases, interval, go-around), a park-spot module
  in `src/sim/ai/`, `content/scenarios/recovery-range.json`, and tests.
- Edited: `src/sim/ai/pilotTick.ts`, `src/sim/ai/pilot.ts`,
  `src/sim/ai/targeting.ts`, `src/sim/ai/autoPursuit.ts`,
  `src/sim/ai/formation.ts` (the ground test moves out of it),
  `src/sim/scenario.ts` (schema and validation),
  `tools/autopilot/approach.ts` (becomes a re-export), and
  `src/render/main.ts` (the diagnostic only).
