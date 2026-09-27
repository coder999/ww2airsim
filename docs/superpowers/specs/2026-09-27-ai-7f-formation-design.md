# Plan 7f: formation, wingmen and escort — design

**Status:** approved in conversation by Mark, 2026-09-27, as an amendment to
§5 of the [7c-7g design](2026-09-25-ai-7c-design.md), which he approved on
2026-09-25. This file replaces that §5. Everything else in the 7c-7g design
still holds, including its cross-cutting constraints (§7) and what it
deliberately leaves out (§9). This file restates only what changed.

**Measured start:** `main` at `58381d9`, 2026-09-27. File and symbol names
below were read at that commit.

## Why it was amended

As first written, 7f gave the player a wingman in `furball-range` and
nowhere else. Three things made that too narrow for the missions it has to
serve:

1. **Combat Air Patrol already needs it.** Its raiders are authored as pairs
   (`raid-1`/`raid-2`, `raid-3`/`raid-4` in `combat-air-patrol.json`), but
   each Zero flies its own ingress route with no link to the other. The
   original leader could only be the player or a fighter that was engaging.
   Here, the leader is a raider on ingress.
2. **Escort did not fit the cover rule.** A wingman split to cover only when
   its leader's mode was `engage`. A bomber never engages, so its escort would
   never leave station. The planned Escort (B-17s) and Scramble (G4Ms, with
   escort) missions need that behavior (GAMEPLAY.md, "Scenarios").
3. **Furball is now Dev-only.** The sortie-forms amendment A1 made Furball a
   Dev-only test bed. So it cannot carry 7f's acceptance, and a wingman that
   exists only there is never seen in normal play.

Mark's goal (2026-09-27): build a canned set of behaviors that a real
mission can use later by editing content alone, not a dev-only feature.

## What 7f builds

### 1. Content: `pilot.leader` and `pilot.slot`

- `pilot.leader: <id>` names the leader. It must be a same-side aircraft that
  is either starting or in the wingman's own held group. The leader may be the
  player. A leader may have several wingmen.
- `pilot.slot: 1 | 2 | 3` is the wingman's station, unique among that
  leader's wingmen.
- **No chains.** A wingman cannot also lead. A flight of four is one leader
  and slots 1-3, with the stations drawn as a finger-four (§2). "Two pairs"
  is how the geometry looks, not how the data is linked. This keeps the
  approved "pairs and flights, no chains".
- `leader` excludes `target` and `ingress`, and the schema rejects a pilot
  with both. A wingman goes where its leader goes. It takes on the leader's
  ingress orders only if the leader is lost (§4).
- Validation lives in `scenario.ts` beside 7e's checks, one named issue per
  rule: unknown leader, cross-side leader, self-leading, a leader that is
  itself a wingman, a duplicate slot, and a leader outside the wingman's
  starting set or held group.

### 2. Stations, in the leader's heading frame

A station is an offset in the frame of the leader's **horizontal velocity**,
not its body. So the wing does not swing up and down when the leader banks
(unchanged from the approved design). Loose cruise stations, all tuning
values:

| slot | aft | lateral | above |
| --- | --- | --- | --- |
| 1 | 80 m | 100 m right | 0 |
| 2 | 80 m | 100 m left | 0 |
| 3 | 160 m | 200 m left | 0 |

The table is data in `src/sim/ai/formation.ts`. A tighter bomber box later
is a new table, not new behavior.

### 3. Station-keeping and rejoin, one law

- **Desired velocity** = the leader's velocity, plus a proportional term on
  the station error. The term is clamped so closure never exceeds a cap, on
  the order of 40 m/s. This is flown through the existing
  `controlsForDesiredVelocity`.
- **Throttle** follows a feed-forward law like the ingress pilot's
  (`ingressThrottle`): base + gain × (desired speed − airspeed). The
  controller's own law settled 14 m/s short on ingress (measured
  2026-09-26), and a wingman that settles short never closes its station.
  The plan measures the gains.
- **One law covers rejoin.** From 2 km out, the clamped term is the overtake
  speed. There is no separate rejoin maneuver.
- **The safety override stays first,** exactly as in `pilotTick` today: the
  ground floor and G limit outrank formation.

**Amendment, 2026-09-27 (Task 3 round 2, shipped law).** For a slot station,
"the leader's velocity" in the first bullet is fed forward through the
leader's own turn — the station's own velocity, turn lead plus omega x arm —
so the wingman's velocity command banks with the leader instead of trailing
it; trail cover (§4) is not given this feed-forward, and keeps the leader's
plain velocity. The proportional term also uses a stiffer vertical gain than
horizontal, to counter the velocity controller sinking through a commanded
level turn. See `src/sim/ai/formation.ts` (`stationDesiredVelocity`,
`TURN_LEAD_PER_BANK`, `VERTICAL_GAIN_PER_S`) for the measured values and the
reasoning; not restated here.

### 4. When a wingman fights, and how it comes back

Two changes from the approved design: the trigger is **a threat to the
leader**, not the leader's mode, and the wingman fights only inside a cover
radius. The second keeps an escort from chasing every contact within the 8 km
detection range.

- **Cover trigger.** A wingman engages a hostile contact when at least one of
  these holds:
  - it has the leader or the wingman in its gun cone (`hasGunSolution`);
  - it is within the cover radius of the leader or the wingman (a tuning
    value, around 3,000 m, the same scale as `INGRESS_ENGAGE_RANGE_M`);
  - it hit the wingman within `RECENT_HIT_S`;
  - it is the leader's own target: the split to attack.

  This becomes the wingman's `accept` filter for `selectTarget`, the same
  seam the ingress pilot uses. The wingman passes its `leaderId`, which
  switches on 7e's existing `LEADER_THREAT_BONUS_M`. So a hostile
  threatening the leader is its first choice, and a hostile on the leader's
  tail is its first choice even while the leader is attacking something
  else: the "sandwich".
- **The leader need not fight.** A bomber that never engages still gets
  covered, because the trigger reads the threat, not the leader's mode.
- **Player as leader.** The player's "own target" is unknown to the sim. The
  split-to-attack clause is read as "the player fired within the last 5 s",
  seen from the snapshot's `controls.fire`. It is latched in the wingman's
  own decision state as `coverUntilS`, because the combat record keeps no
  fire time. While the latch is open and no contact passes the filter, the
  wingman flies a trail-cover station, 500 m behind and 200 m above the
  leader (from the approved design).
- **Coming back.** Once no contact passes the filter, the mode returns to
  `formation`, and §3's law brings the wingman back to its station.
- **Leader lost** (down or gone from the snapshot). The wingman becomes
  leaderless:
  - if the leader had ingress orders, the wingman takes them on at the
    leader's `legIndex`, so a raider pair that loses its leader still reaches
    the carrier;
  - otherwise, it carries on under 7e's rules (engage or loiter).
- **Parked leader** (the player on a deck or a runway). The wingman loiters
  at its current position until the leader is airborne. That is the case of
  a future CAP wingman while the player launches.

### 5. Modes and state

- `formation` is the mode 7e reserved in `PilotMode`. It is chosen at a
  rescore when a pilot has a leader and no target.
- `PilotDecisionState` gains only plain data: `coverUntilS`, plus whatever
  §4's leader-lost handoff needs. A `World` still round-trips through
  `structuredClone`.
- `pilotTick` stays the single per-pilot function. `loop.ts` is not edited,
  as the 7c-7g design §2 promised.

### 6. Diagnostics

`__ww2`'s `aircraft()` diagnostic gains `leader` and `stationErrorM` for a
wingman. This is the one edit in `src/render/main.ts`, which the sortie forms
also edit, so re-diff against `HEAD` before committing (7c-7g design §8).

## Acceptance

**Tier 1 (headless, `tests/sim/ai/`),** on hand-built worlds in a new
`formationWorlds.ts`, in the style of `maneuverWorlds.ts`, with no scenario
file:

- Station error RMS is bounded with the leader straight and level, and
  through a 30°-bank turn, for slots 1-3.
- A wingman 2 km out rejoins within a bounded time.
- A wingman on an ingress leader follows it through a three-leg route.
- **Escort:** a leader that never engages (a fighter on ingress, standing in
  for a bomber until a bomber flight model exists) is attacked from astern.
  Within one `reactionS`, the wingman targets the attacker, range closes, and
  the attacker takes hits.
- **Sandwich:** the leader engages A, and B settles on the leader's tail.
  The wingman picks B.
- **Player-as-leader:** the player is flown by scripted `withControls`, and
  the wingman holds station. With the player firing, it moves to trail cover.
- **Leader lost:** the ingress leader is destroyed mid-route, and the
  wingman completes the route.
- **Parked leader:** the wingman loiters, then joins once the leader is
  airborne.
- **Schema:** each validation rule rejects its case by name.
- The 7c-7g invariants hold: determinism (ties broken by id, never by array
  position), `structuredClone` round-trip, and no G-limit or floor violation.
- `furball-range` gains links: `ally-1` becomes the player's wingman, and the
  furball soak (`furball.test.ts`) stays green.

**Tier 2 (reference GPU).** In the chase view, a quiet Dev fixture (the
player and one wingman, no hostiles) shows the wingman within its station
tolerance, read from `__ww2`. A screenshot is captured and read by the
executing agent.

This task runs **after the sortie forms land.** Adding a Dev fixture edits
the Dev scenario list that the sortie forms are replacing (their `dev`
flag), and their URL quick launch (A6) is how the test reaches it. 7f can
merge with Tier 1 complete and this task open.

## Not in 7f (unchanged, or follow-ups)

- **Mission content.** Pairing CAP's raiders, and giving the player a
  wingman in CAP, are one-file content follow-ups. They wait for the sortie
  forms, which may edit the same scenario files. Escort and Scramble wait for
  bomber flight models; only the F6F, F4F and A6M2 have flight specs today.
- Wingman commands ("attack my target", "rejoin"): Open for Mark, item 5 of
  the 7c-7g design. Still not built.
- Aircraft-to-aircraft collision: still not modeled anywhere, so a close
  station carries no crash risk in the sim.
- Formation takeoff and landing intervals belong to 7g.

## Files

- New: `src/sim/ai/formation.ts`, and the tests with their fixtures.
- Edited: `src/sim/ai/pilotTick.ts`, `src/sim/ai/pilot.ts`,
  `src/sim/ai/pursuit.ts` (`PilotAssignment`), `src/sim/scenario.ts` (schema
  and validation), `content/scenarios/furball-range.json`, and
  `src/render/main.ts` (the diagnostic only).
- Not touched: `loop.ts`, `targeting.ts`'s weights, the title screen,
  aircraft specs, models.
