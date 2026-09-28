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
  more AI to one ship or airfield than it has park spots; an airfield spot
  inside a building footprint. The terrain check is a content test (§7).
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

## 5. The carrier approach flies the LSO's numbers (found while planning, 2026-09-28)

§6 has the AI fly `approachControls` unchanged to the deck and obey
`paddlesCue`'s wave-off. Those two disagree, so that AI would never land.
Measured 2026-09-28 at `ca7b998` on nexus, `tests/sim/carrierLanding.test.ts`'s
own setup (deck-quals, `cv-1`, 15.4 m/s wind over the deck), cues sampled every
tick. The probe was a scratch copy of `approachControls` with the speed, slope,
aim and flare height as parameters:

| Speed / slope / aim / flare | LSO over the approach | First wave-off | Trapped, at rest |
| --- | --- | --- | --- |
| 1.3 x stall / 3.0° / zone near edge / 12 m (today's) | fast x3386, low x513, **wave-off x277**, roger x109, cut x149 | 250 m astern, before any cut | yes, 101 m from stern |
| 1.15 / 3.5° / near edge / 12 m | roger x4647, wave-off x558, no cut | 248 m astern | yes, 41 m |
| 1.15 / 3.5° / zone center / 12 m | roger x4922, cut x26, wave-off x298 | 109 m, 26 ticks after the cut, in the flare (40.4 m/s, slow) | yes, 91 m |
| **1.15 / 3.5° / zone center / none** | **roger x4912, cut x240, wave-off x8** | **3 m astern at touchdown, 240 ticks (4 s) after the cut** | **yes, 97 m** |

Why: the LSO judges speed as `APPROACH_SPEED_STALL_MULTIPLE` (1.15) x the
flap stall ± 3 m/s (43.4 m/s for the Hellcat) against the autopilot's Vref of
1.3 x (49.1 m/s), and glideslope as 3.5° to the trap zone's CENTER against the
autopilot's 3° to its near edge. The 12 m flare starts about 196 m out on a
3.5° path, inside the 250 m wave-off range, and bleeds speed with the throttle
closed. Real carrier pilots do not flare.

**So the carrier profile is:**

- `ApproachTarget` gains three optional fields, `approachSpeedMps`,
  `glidePathRad` and `flareHeightM`. Absent, each is today's constant, so both
  landing tests' inline snapshots stay bit-identical.
- An AI recovering to a deck passes the LSO's numbers:
  - approach speed `APPROACH_SPEED_STALL_MULTIPLE x effectiveStallSpeedMps(spec, 1)`;
  - slope `paddles.glideslopeDeg`;
  - aim at the trap zone's center;
  - flare height 0.

  `configure` and the capture window read "Vref" as this speed on a deck.
- **The AI is committed after the cut.** It goes around on `wave-off` only
  if it has not yet received `cut` on this pass. Afterwards the landing
  officer's priority order (wave-off before cut) can still read `wave-off` at
  touchdown, and the AI ignores it.
- Tier 1 asserts no wave-off before the first cut on a clean pass, and a
  touchdown sink under `MAX_SUPPORTED_SINK_MPS` with no flare.
- A runway approach is unchanged: Vref 1.3 x, 3°, the 12 m flare.

## 6. Safety-floor exemption covers the whole approach (found while planning)

7c-7g design §3.2 exempts "only 7g's final-approach phase" from the 400 m
floor recovery (`FLOOR_M` + `FLOOR_BUFFER_M`, `src/sim/ai/safety.ts`). But §6
puts the final approach fix at 244.6 m and the go-around at 300 m, both
below that trigger. So every recovery phase after `transit` is exempt from
the floor recovery: `join`, `configure`, `final`, `rollout`, `landed` and
`go-around`. The overspeed guard still applies in all of them. `transit` and
holding at the initial point (600 m) keep the floor.

## 7. Home is resolved when the world is built

`PilotTickContext` carries no airfields, and §2 of the 7c-7g design promised
`loop.ts` would not be edited again. Following 7e's ingress precedent (ruling
W6: an airfield destination is resolved to fixed geometry at build time):

- `pilot.home` is resolved by `worldFromScenario` into plain data:
  `{ kind: 'runway', airfieldId, aimX, aimZ, headingRad, lengthM, widthM, parkSpots }`
  or `{ kind: 'ship', id, parkSpot }`.
- A ship is read live each tick from `ctx.ships`.
- Touchdown elevation comes from `ctx.terrain` at run time.
- `loop.ts` is not edited.

The airfield park-spot check splits by what it needs:

- Spot count and building footprints are checked at `worldFromScenario`.
  Neither needs terrain.
- The terrain level check (on land, within 2 m of runway elevation) is a
  Tier 1 content test over every shipped scenario with a `home` airfield. It
  skips by name when the tiles are absent.

Airfield spots are on the runway's apron side: the sign of `apron.x` when an
apron exists, else local -x. That is, on Tacloban's apron.

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
