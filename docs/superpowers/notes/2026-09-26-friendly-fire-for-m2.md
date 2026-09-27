# Friendly fire: notes for M2 (mission UI)

Dated 2026-09-26. From the friendly-fire branch (`worktree-friendly-fire`,
spec `docs/superpowers/specs/2026-09-26-friendly-fire-design.md` §7, ruling
FF-8). M2's plan is `docs/superpowers/plans/2026-09-26-m2-mission-ui.md` on
`worktree-missions-track`; the identifiers below are the ones that plan names
(read 2026-09-26), so re-check them against M2 as built.

Friendly fire deliberately built **no** radio line of its own. It left three
things for M2 to pick up.

## 1. The event and the words

- **The event** is sim state: `AircraftCombat.friendlyFire`
  (`src/sim/weapons/friendlyFire.ts`), `{ tick, kind, target }`, set once on
  the player's first damage to his own side and never overwritten.
- **The words** are `friendlyFireRadio(world)` in `src/render/discharge.ts`:
  `{ tick, text }` or `null`. The text is `FRIENDLY_FIRE_RADIO`, "Cease fire!
  Cease fire! You're hitting friendlies!".

## 2. Proposed edit: feed it to the radio line

M2's `nextRadioLine(r, messages, dtMs)` consumes a message list with no tick,
and counts what it has seen (`RadioLine.seen`). The proposal is to make the
friendly-fire call one more message in that list, in tick order with the
mission's own `radioMessages`:

- in `main.ts`, where M2 builds the `messages` argument, append
  `friendlyFireRadio(current.world)` when it is non-null and its `tick` is at
  or before the current tick, ordered by tick among the mission messages;
- it then shows for M2's `RADIO_SHOW_MS` like any other call.

If M2 as built does key messages by tick, merge by `tick` directly instead.

## 3. Drop the readout's transient segment

Until M2 lands, `combatReadoutLabel(rec, tick)` (`src/render/combatReadout.ts`)
leads with `CEASE FIRE! YOU'RE HITTING FRIENDLIES!` for
`FRIENDLY_FIRE_WARNING_TICKS` (300) after the hit, then with a persistent
`FRIENDLY FIRE` tag. Once the radio line shows the call:

- remove the transient `CEASE FIRE!` branch from `combatReadoutLabel`, and
  its tests in `tests/render/combatReadout.test.ts`;
- **keep** the persistent `FRIENDLY FIRE` tag: it tells the pilot the flight
  is already forfeit, which the radio line does not.

## 4. Deny the badge on a discharged flight

A discharged debrief scores zero and has no Continue (`withDischarge`,
`DebriefModel.discharge`). M2 awards a badge through `withMissionDebrief` and
a `badgeId` passed to `bankMissionResult`. A discharged flight must earn no
badge:

- in `withMissionDebrief` (or at its three call sites), award nothing when
  `model.discharge !== undefined`, and say so in the objectives block;
- apply `withDischarge` and `withMissionDebrief` in one fixed order at all
  three sites, so the discharge overlay is what is shown.

## 5. Merge point in `main.ts`

Both branches add a trailing parameter to `bankMissionResult`: friendly fire
adds `discharged: boolean`, and M2 adds `badgeId`. Whichever merges second
takes both, and `dischargeInRoster` (`src/render/roster.ts`) must not write a
badge.
