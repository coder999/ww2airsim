# Friendly fire and dishonorable discharge: design

Dated 2026-09-26. Requirements are Mark's, given 2026-09-26. Worktree `.claude/worktrees/friendly-fire`, branch `worktree-friendly-fire`, cut from `main` at `7d8dc22`, which already includes Plan 7e.

Plan 7e gave aircraft a side. It left one open item (7e handoff §5 item 2): ships have no side, so the player can score for sinking his own `cv-1`. This design finishes sides for every damageable entity. It then adds the consequence Mark asked for: firing on your own side ends the career in disgrace, but the pilot can still be resurrected.

## 1. Mark's requirements

| # | Requirement (Mark, 2026-09-26) | Where it is met |
| --- | --- | --- |
| 1 | Ships and structures have a side, as aircraft already do. Absent a side, the player's side is allied (the 7e convention). Existing content gets defaults that match reality. Sides are validated at scenario load. | §2, §3 |
| 2 | "You should NOT get points for sinking your own ship." No score for damaging or destroying anything on your own side. | §4 |
| 3 | Any damage the player causes to his own side ends the flight in DISHONORABLE DISCHARGE, at every flight end that produces a debrief. | §4, §5 |
| 4 | The roster records the pilot as DISCHARGED, and he can still be resurrected, the way K.I.A. works today. | §6 |
| 5 | "Forfeit the whole flight": score zero, and the flight's kills are not credited to the career. Amended by Mark 2026-09-26: only the kills since the last landing are forfeit (§6). | §5, §6 |
| 6 | A radio warning on the first friendly hit, without building a radio-line component that competes with M2's. | §7 |

## 2. Where a side lives

`sideOf` (src/sim/sides.ts, 7e) stays the one place the default is applied: `side ?? (id === player ? 'allied' : 'axis')`. Every entity kind now reads through it.

| Entity | Content key | Absent means |
| --- | --- | --- |
| Aircraft | scenario `aircraft[].side` (7e, unchanged) | the player allied, every other aircraft axis |
| Ship | scenario `ships[].side` and held-group `ships[].side` (new) | axis |
| Structure | the airfield's side: base content `side` (new, `content/bases/*.json`), overridden per scenario by `airfieldSides: { <airfield>: side }` (new) | axis |

A structure takes its airfield's side. There is no per-building side: every shipped base is held by one side. The scenario override exists because the missions design (§6.3) flies from Tacloban and Dulag "as friendly fields in missions set on dates they were still Japanese". A mission must therefore be able to make a field friendly without editing the base.

## 3. Defaults for shipped content, and validation

| Entity | Side | Why |
| --- | --- | --- |
| `cv-1` (Essex), `dd-1`, `dd-2` (Fletcher) in `free-flight` and `deck-quals` | allied, explicit | US Navy task force; the player recovers aboard `cv-1` |
| `maru-1` (Type B maru) in `strike-range` | axis, explicit (also the default) | Japanese transport, the strike target; H1 library `japanese` |
| Dulag (both hangars) | axis, in `dulag.json` | H1 ruled every building `japanese`; `strike-range` lists Dulag in `enemyAirfields` |
| Tacloban (3 hangars, tower, AAA) | **allied**, in `tacloban.json` | See ruling FF-2 |
| Aircraft | unchanged | 7e's domain; `f6f-2` stays axis by 7e's default (open item, §9) |

**Ruling FF-2 (Tacloban).** In every shipped scenario Tacloban is the player's home field. Every range except `deck-quals` parks him there. No scenario lists Tacloban in `enemyAirfields`, and the missions design flies from it as a friendly field. The content therefore represents an Allied-held Tacloban, as after 20 October 1944, and its structures are allied. H1's `japanese` is the *building type's* ownership in the Hangar library. It is not a claim about this instance.

**Validation** (thrown at world build, named in the message, the way 7e rejects a same-side static target):

- every `enemyAirfields` entry is on the player's opposite side (checked in `createWorldOf`, which has the resolved airfield sides);
- a player parked on a ship's deck is on that ship's side;
- a `land` objective names a ship or airfield on the player's side;
- an ingress destination ship is on the raider's opposite side;
- `airfieldSides` keys are among the scenario's `airfields` (schema).

## 4. What counts as friendly fire, and credit

**Friendly fire** is any damage an aircraft's round, bomb, rocket or blast applies to an entity on its own side that was not already destroyed. That covers aircraft, ships and structures, and it includes collateral: a bomb blast that clips an allied hangar. The shooter's `AircraftCombat` gains one field:

```ts
readonly friendlyFire: { readonly tick: number; readonly kind: 'aircraft' | 'ship' | 'structure'; readonly target: string } | null
```

It is the FIRST friendly damage, set once and never overwritten. It is attributed through the same owner that `lastHitBy`, `damage.attacker`, `ShipDamage.attacker` and `StructureDamage.attacker` already use. The rest is unchanged:

- Damage stays physical. A friendly round still hits, burns, sinks and razes (7e §4.3).
- Not friendly fire: self-inflicted damage (your own bomb's blast on your own airframe), collisions (there is no collision damage path), and rounds into wreckage already destroyed.
- An own-side ship sunk or structure destroyed counts in `friendlyKills`, never in `shipsSunk`, `structuresDestroyed` or `killsByType`. Own-side aircraft already did this under 7e. `friendlyHits` stays the rounds-on-aircraft counter, mirroring `hits`.
- AI friendly fire is recorded on the AI's own record and never discharges the player.

## 5. The debrief

There are three debrief sites in `main.ts`, and each gets the same pure wrapper: `withDischarge(model, world)` in the new `src/render/discharge.ts`.

| Site | Outcomes |
| --- | --- |
| Impact (`debriefModel`) | killed by terrain, water or deck, and ditched |
| Destruction (`destructionModel`) | shot down, and overload break-up |
| Landing (`landingModel`) | field, trap and off-field |

When the player's record has `friendlyFire`, the model gains `discharge` and changes:

- the stamp reads **DISHONORABLE DISCHARGE** (red);
- the detail names what was hit, then keeps the physical sentence;
- a "Friendly fire" figure names the target;
- the score is zero, every row at 0 points, with the recovery line reading `Recovery: LANDED — forfeit (×0)`;
- there is **no Continue**: the flight is forfeit, so only Restart and Return to title remain.

`outcome` keeps the physical recovery, so `recoveryAgreement.test.ts` (the mission engine and the debrief agree on every recovery kind) is untouched.

## 6. The roster

- `PilotRecord.status` becomes `'active' | 'kia' | 'discharged'`. As first written, the discharge won when friendly fire and a death coincided. **Amended by Mark, 2026-09-26: the dead cannot be discharged.** A friendly-fire sortie that ends in death (killed by impact, or shot down) keeps its KILLED stamp and banks the pilot K.I.A., with the sortie still forfeit: 0 points and no kills credited (`DebriefModel.forfeit` without `discharge`). Only a pilot who survives (landed or ditched) is discharged.
- `dischargePilot(pilot, outcome, sortie)` banks a discharged sortie. It works as follows:
  - `missionsFlown` is incremented.
  - Nothing is scored for this sortie (the kills since the last landing).
  - **Amended by Mark, 2026-09-26:** only the kills since the last landing are forfeit. "Say I take off, kill an enemy, then land; then I take off again, kill an enemy and also kill a fellow Hellcat. Only the second enemy kill is forfeit." What an earlier landing banked stays on the career, so a discharge never lowers score, kills or rank. (This replaces an earlier `forfeit` argument that subtracted what earlier debriefs of the same flight had banked.)
  - The career's physical totals are folded: hours, landings and peaks.
  - A log entry is appended with 0 points, zero kills and `discharged: true`.
- **Resurrection matches K.I.A.** `startSortie` flips `kia` or `discharged` back to `active` and counts one resurrection. A Restart-ed flight that ends cleanly clears `discharged` exactly as it clears `kia` (Plan 9 review I-4). There is one `resurrections` counter.
- **Stored records are validated and never throw.** An unknown `status` reads as `active`, and a log entry's `discharged` is kept only when it is `true`.
- **Where it shows.** The title's roster row reads "— DISCHARGED" with a DISCHARGED chip. The Dossier header shows "Discharged", and the log line shows "· Discharged".

## 7. The radio warning

M2 (plan `2026-09-26-m2-mission-ui.md`, not yet executed, waiting on E1) builds the general radio line. This design does not build a second one.

- **The event, sim side.** `AircraftCombat.friendlyFire` is the flag. Its `tick` is the moment.
- **The words, render side.** `friendlyFireRadio(world)` returns `{ tick, text }` or `null`. The text is "Cease fire! Cease fire! You're hitting friendlies!"
- **Visible today.** The combat readout already sits at top center and shows every combat fact. It gets the warning as its first segment, `CEASE FIRE! YOU'RE HITTING FRIENDLIES!`, for 5 s of sim time. After that it shows a persistent `FRIENDLY FIRE` tag, so the pilot knows the flight is forfeit.
- **Handoff to M2.** A committed note, `docs/superpowers/notes/2026-09-26-friendly-fire-for-m2.md`, proposes the M2 edit. It merges `friendlyFireRadio` into the radio feed by tick, and drops the readout's transient segment once the radio line shows it. It also asks M2 to deny the badge on a discharged flight.

## 8. Testing

**Tier 1:**

- Side resolution and validation, one test per rule.
- Production `advance` checks:
  - strafing the allied `cv-1`, bombing an allied hangar, and a blast on an allied aircraft each set `friendlyFire` and score nothing;
  - sinking the allied carrier puts `shipsSunk` and `killsByType.carrier` at 0;
  - the same attacks on the axis `maru-1` and Dulag still score;
  - AI friendly fire leaves the player clean.
- The debrief at landing, impact and destruction: DISHONORABLE DISCHARGE, total 0, no Continue. An enemy-only flight is unchanged.
- The roster: DISCHARGED, the forfeit, resurrection, and tolerant loading.
- The combat readout labels.
- Shipped sim digests stay bit-identical after stripping the new key, using 7e's probe.

**Tier 2 (reference GPU).** A new `friendly-fire-range` dev scenario puts the player 250 m behind an allied Hellcat, so Space hits it at once. The spec then:

- fires, and reads the warning;
- dives into the sea;
- checks the debrief stamp and the zero score;
- checks the roster row and the Dossier;
- captures each screen and checks the GPU budget.

## 9. Out of scope, and open

- **Aircraft sides are unchanged.** `f6f-2`, a Hellcat chocked at Allied Tacloban in `free-flight` and `deck-quals`, is axis by 7e's default. It still scores as a gunnery target, and its radar contact is untinted. Making it allied is a one-word content edit, but it would take away the Shift pursuit autopilot's target in those scenarios. That is for Mark to decide.
- **Mission objectives aimed at the player's own side** (a `destroy` of an allied entity) are resolved by tag in `mission/create.ts`, and nothing checks their sides. Flagged for M3/M4.
- **No teamkill penalty beyond discharge**, and no court-martial screen.
