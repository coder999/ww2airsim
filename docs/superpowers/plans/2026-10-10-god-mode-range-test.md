# God mode and the Range Test mission

**Status:** proposed 2026-10-10, not started. Branch `range-test-god-mode`, worktree `~/projects/ww2airsim-range`, cut from `main` `3ad67cae` (separate from the land-quality branch so the two merge independently).
**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode (Mark, 2026-10-10):** unattended. Run to completion; collect captures in the handoff.
**Heavy jobs:** tests, typecheck and renders go to ryzen (`remote-run`, the ryzen GPU), not nexus (Mark, 2026-10-10: nexus OOMs).

## What was asked

1. A **God mode** checkbox, available only while **Dev** is checked. The player cannot be damaged, a crash bounces the airplane back up, and fuel, gun ammo, bombs/torpedoes and rockets are unlimited.
2. A **Range Test** mission: take off from Tacloban. What spawns depends on the side of the airplane chosen.
   - Chosen American: **every** Japanese airplane flies slowly overhead as a sitting duck (no evasion, no return fire), so damage and smoke animations can be inspected. **Every** Japanese ship model spawns very nearby, to test damage and sinking.
   - Chosen Japanese: the same, mirrored: every American airplane and every American ship.
   - **Neutral ships** (the cargo ship, Mark's example) spawn for either choice.

## What is in the code (read 2026-10-10)

| Fact | Where | Consequence |
| --- | --- | --- |
| Form 1 of the title screen already has a **Dev** checkbox that lifts every sortie rule, including aircraft eligibility (`eligibleAircraft(..., dev)`). | `src/render/titleScreen.ts` (`devBox`), `src/render/sortieFlow.ts` | God mode is a second checkbox beside it, disabled until Dev is checked, cleared when Dev is cleared. A Japanese airplane is already selectable in Dev. |
| Dev-only missions are rows in `SCENARIO_OPTIONS` with `dev: true`, each backed by `content/scenarios/<id>.json`. | `src/render/titleScreen.ts`, `content/scenarios/` | The Range Test is one new Dev row. |
| The sim has two sides, `allied` and `axis`, and **no neutral**. Ships take a side from the scenario (`ships[].side`), not from their spec. An unspecified aircraft side defaults to allied for the player and axis for the rest. | `src/sim/sides.ts`, `src/sim/scenario.ts` | "Neutral" is implemented as **always a legal target**: the cargo ship takes the side opposite the player, so shooting it is never friendly fire. A real third side is a much larger change and is not done. |
| Aircraft specs carry `side` (`allied`/`japanese`). Ship specs carry only `role`. | `content/aircraft/*.json`, `content/ships/*.json` | Ship nationality needs a small table (below). |
| 7 allied airplanes (B-17, B-29, F4F, F4U, F6F, P-38, TBM-3), 7 Japanese (A6M2, B5N2, D3A, G4M, Ki-21, Ki-43, Ki-84). Ships: Allied `casablanca-cve`, `cleveland-cl`, `essex-cv`, `fletcher-dd`, `pennsylvania-bb`; Japanese `abukuma-cl`, `kagero-dd`, `mogami-ca`, `shiratsuyu-dd`, `yamato-bb`, `zuikaku-cv`; cargo `type-b-maru`. | `content/aircraft`, `content/ships` | All of them spawn; none is skipped. |
| An AI pilot with no target, leader, home or ingress **loiters**: holds heading and altitude at no less than 1.3 times stall speed. It does engage any enemy it is given a reason to. | `src/sim/ai/loiter.ts`, `pilotTick.ts` | Sitting ducks need a new `passive` pilot flag that never picks a target (hence never evades or fires) and loiters in a **circle** so the formation stays overhead. |
| Per-airplane combat state, `combat.aircraft[id]`, carries `damage`, `stores` and per-gun `ammo`; fuel is `state.fuelKg`; a crash is an `Impact` recorded when the body origin passes through the ground. | `src/sim/loop.ts`, `src/sim/weapons/combat.ts` | God mode is a pure sim feature, inside `advance`, so it is deterministic and testable without rendering. |

## Design

**God mode (sim).** A `god` flag on the `World`, off by default so every existing run is bit-identical. When set, for the player only:
- after each tick's combat step, restore the player's `damage`, `stores` and per-gun `ammo` to their initial values and refill `fuelKg` to capacity (so nothing can drain, and nothing can persist);
- in the impact branch, instead of recording a crash, **bounce**: lift the airplane clear of the surface, reflect the vertical speed into a climb of at least 80 ft/s, keep the horizontal speed, and level the pitch so the player keeps control. No `Impact` is recorded, so no debrief and no kill credit.
God mode is a Dev session setting like Dev itself: it lives on the title screen, survives return-to-title, resets on page load.

**Range Test (content + one AI flag).**
- `content/scenarios/range-test-allied.json` and `range-test-axis.json`, chosen at launch by the side of the airplane picked on Form 3. Both start parked at Tacloban for take-off.
- Sitting-duck airplanes: `pilot: { passive: true, orbit: { radiusM, ... } }`. Each airplane gets its own altitude and orbit phase, so they spread out overhead and do not collide.
- Ships: every ship of the other side anchored (speed 0) in the water within a few miles of the airfield, spaced so none overlaps; the cargo ship in both. Positions are checked against the real terrain field, not guessed.
- Scenario `side` fields: player and any wingmen on the chosen side; the other side's rosters opposite; the cargo ship opposite the player.

## Phases

1. **God mode in the sim**, with tests: damage restored, ammo/stores/fuel constant after firing everything, a dive at the ground bounces and never records an impact, a world without `god` is unchanged (existing determinism tests pass untouched).
2. **God mode UI**: the checkbox, its dependency on Dev, and the flag reaching the world at launch.
3. **`passive` + orbit pilot** in the AI, with tests: never chooses a target, never fires, circles within its radius, and existing pilots are bit-identical.
4. **Range Test content and wiring**: both scenarios, the Dev mission row, selection by side, a test that loads each scenario and asserts the rosters (7 airplanes and the right ship list per side, cargo in both, every ship on water).
5. **Verification on ryzen**: `tsc`, eslint, the touched unit suites, the full deterministic suite, then GPU captures of both missions (airplanes overhead, ships nearby, god-mode bounce) for the handoff.

## Not doing

- A real neutral side, ship AI that shoots back, or scoring changes. The sitting ducks are targets only.
- Changing normal missions. God mode and the Range Test are reachable only with Dev checked.
- Merging: Mark merges both branches (`l3-land-quality`, then this one) when he has looked.

## Open questions

- Ship placement picks water near Tacloban Bay; if the bay is too small for twelve large ships without overlap, the largest hulls (battleships, carriers) go further out. The scenario test will fail rather than overlap.
- God mode while landing on a carrier or runway must not read as a crash: only a contact the sim would have recorded as an `Impact` bounces.
