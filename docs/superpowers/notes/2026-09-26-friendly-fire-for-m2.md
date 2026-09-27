# Friendly fire: notes for M2 (mission UI)

> **Done in M2, 2026-09-27**, when `main` was merged into `worktree-missions-track`. Each item is recorded in the [M2 handoff](../../handoff/2026-09-27-m2-mission-ui.md):
> - §2: `radioFeed` in `src/render/mission/hud.ts` merges the call by tick.
> - §3: the readout keeps only the `FRIENDLY FIRE` tag.
> - §4: `withMissionDebrief` denies the badge on a forfeit sortie. It is applied after `withDischarge` at all three sites, and `bankMissionResult` guards the roster too.
> - §5: `bankMissionResult` takes both parameters.
>
> One addition: a landing after friendly fire always opens the debrief, even one the mission counts as intermediate.

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

## 4. Deny the badge on a forfeit sortie

A friendly-fire debrief scores zero and has no Continue (`withDischarge`).
Every one carries `DebriefModel.forfeit`; a survivor's also carries
`discharge`, while a death keeps KILLED (Mark, 2026-09-26: the dead cannot be
discharged). M2 awards a badge through `withMissionDebrief` and a `badgeId`
passed to `bankMissionResult`. A forfeit sortie must earn no badge:

- in `withMissionDebrief` (or at its three call sites), award nothing when
  `model.forfeit !== undefined`, and say so in the objectives block;
- apply `withDischarge` and `withMissionDebrief` in one fixed order at all
  three sites, so the discharge overlay is what is shown.

## 5. Merge point in `main.ts`

Friendly fire (merged to `main` 2026-09-26) gave `bankMissionResult` a
trailing `friendlyFire: 'discharged' | 'forfeit' | null` parameter, computed
by `friendlyFireBank(model)`; M2 adds `badgeId`. M2 takes both. Neither
`dischargeInRoster` (`src/render/roster.ts`) nor the forfeit path, which
banks 0 points and no kills, may write a badge.
