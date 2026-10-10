# Handoff: F2, Single Combat and Scramble (2026-10-09)

Plan: `docs/superpowers/plans/2026-10-09-f2-single-combat-scramble.md`. Run unattended; Mark's checkpoint is the final product.

## What shipped

| Mission | File | Start | Objectives | Badge |
| --- | --- | --- | --- | --- |
| Single Combat | `content/scenarios/single-combat.json` | airborne Hellcat, 10,000 ft over Leyte Gulf, 5 mi east of a veteran Ki-84 | destroy the Frank; recover at Tacloban | Single Combat |
| Scramble | `content/scenarios/scramble.json` | parked on Tacloban's runway | take off; destroy four Bettys; keep them out of 3 mi (5 km) of the field; recover at Tacloban | Scramble |

- **Picker:** both are rows in `SCENARIO_OPTIONS`. They are non-Dev, and the recommended loadout is clean.
- **Scramble's raid:**
  - `raid-1` flies 7e's ingress pilot to Tacloban; the other three Bettys hold 7f formation slots on it.
  - Two Zeros ride along the same way, 1,600 ft (500 m) higher.
  - The deny objective is labeled "Keep the raid off", so its failure reuses the voiced line "They broke through the screen!".
- **History:** both cite Cannon, *Leyte: The Return to the Philippines* (1954), ch. VI. Single Combat also cites Pacific Wrecks' Ki-84 page. Both say "inspired by".
- **Wind:** 4 m/s straight down Tacloban's runway (from 000) in both. The scripted `fieldApproach` the headless tests use lands off-field in any crosswind (measured: from 060 and from 010 both landed off-field).

## Measured (headless, `tests/sim/mission/missions/*.test.ts`)

- **Single Combat:**
  - A player who flies straight on at 80% throttle is shot down by the Frank at 130.0 s; its first rounds come at 120.9 s. The pin is [115, 145] s.
  - At full throttle he lasts until 239.0 s.
- **Scramble:**
  - The formation holds at about 89 m/s.
  - With a passive player, the first Betty is inside 3 mi (5 km) at 500.1 s; the pin is [485, 525] s.
  - The raid then orbits the field about 1 mi (1.5 km) out.
  - Estimated, not measured: a real takeoff and climb to 10,000 ft (about four minutes) meets it some 12 mi (20 km) out.
- **Seen failing:** both files fail against a mutated scenario. One mutation removed the Frank's target, which the content check catches. The other shrank the shield to 1,000 m, which three Scramble checks catch.

## Voice

There are four new Tower lines (prompt sheet rows 69-76), mapped in `RADIO_LINES`:

| Line | US take used | Japanese |
| --- | --- | --- |
| `radio_tower_single_bandit` | `v3clyde-f2-3`, 5.10 s | Adam, 4.52 s |
| `radio_tower_splash_frank` | `v3clyde-f2-2`, 2.70 s | Adam, 1.80 s |
| `radio_tower_scramble` | `v3clyde-f2-3`, 4.24 s | Adam, 6.36 s (long against its 4.0-5.5 s target) |
| `radio_tower_scramble_clear` | `v3clyde-f2-3`, 1.98 s | Adam, 2.00 s |

- **How they were picked:** each US take is the one closest to its target length, not chosen by ear.
- **Alternatives:** all three US takes are on `sounds.html` (filter `f2`). Clyde can drift British, so a listen is worth it.

## E2E

`tests/e2e/missions.spec.ts` gains a table-driven case for both missions. It checks:

- the briefing;
- the first objective on the objective line;
- the tower call on screen and on the radio (`audio().radioPlayed`);
- the chart.

It passed on nexus's 680M against the worktree's own vite, and fails when the Scramble line is mapped to `null`.

Captures are in `docs/handoff/2026-10-09-f2-single-combat-scramble-shots/`: the briefing and the chart for each mission.

## Open

- Neither mission has been flown by hand. Before tuning distances, it is worth checking whether the Scramble Zeros let the player near the Bettys, and whether the Frank is too hard.
