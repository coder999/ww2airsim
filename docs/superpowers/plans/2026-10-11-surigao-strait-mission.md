# Surigao Strait mission — executable plan

**Status:** authorized by Mark on 2026-10-11.

**Run:** unattended.

**Viewing checkpoint:** final product only; do not stop for intermediate review.

**Workspace:** isolated worktree `/home/mark/projects/ww2airsim-surigao-strait`, branch
`surigao-strait-mission`.

**Exact base:** local `main` at `b8c17fb7e09cb3a44e668ad5568e0678736aff39`.

## Goal

Ship **Surigao Strait**, a dawn-aftermath mission on 25 October 1944. The
player flies an F6F Hellcat south after the damaged *Mogami* while the old
battle line engages other surviving Japanese ships behind her. Use the real
strait inside the Leyte world and the systems already delivered by Tracks D,
E, F and M. This is a content-only mission: no new objective kind, AI behavior,
ship class, weapon, model or global tuning.

## Fixed rulings

- **Aftermath, not the night battle.** *Fuso* and *Yamashiro* are already sunk
  by dawn, so this plan does not build or substitute models for them. The
  visible Japanese force uses the shipped *Mogami*, *Abukuma* and destroyer
  classes to evoke the retreating remnants, not to reconstruct an exact
  order of battle.
- **Player task.** Sinking *Mogami* is the primary strike objective. The U.S.
  battle line receives explicit `fireAt` orders against the other survivors,
  and *Mogami* begins outside its main-battery reach and retreats farther
  south. The player therefore has a real pursuit rather than waiting for an
  AI fleet to complete the mission.
- **Aircraft and stores.** The player is airborne in the project's flagship
  F6F Hellcat with `both`: two 1,000 lb bombs, six HVARs and six .50-cal guns
  carrying 2,400 rounds. This is the same shipped F6F anti-shipping loadout
  used by Convoy Strike and is more suitable than the bomb-only loadout, whose
  two bombs cannot sink the cruiser. The production damage regression does not
  assume every store hits: after one bomb and one rocket miss, the remaining
  bomb and five rockets leave 100 hull points, and 30 direct gun hits finish
  *Mogami* with 20 points of margin. That is 1.25% of the carried ammunition.
- **Recovery.** An Essex is staged north in Leyte Gulf for carrier recovery,
  as Flattop Hunt already does for an airborne naval strike. The historical
  note says plainly that the carrier and compressed fleet geometry are game
  staging; the battle itself remains at the real strait.
- **Dawn.** Scenario time stays inside the renderer's daylight envelope. No
  night lighting is added.
- **Radio.** New lines are text-only (`null` in `RADIO_LINES`), consistent
  with Flattop Hunt and Escort. No recordings are created.

## Verified starting facts

| Claim | Evidence at the base | Consequence |
| --- | --- | --- |
| Surigao Strait at 10.167 N, 125.383 E is a committed terrain orientation check, about 5.6 miles east and 43.7 miles south of the world center. | `tests/tools/terrainBuild.test.ts`; `src/sim/world/projection.ts` | Use the real strait rather than stage it elsewhere. |
| Scenario ships support sides, tags, closed waypoint loops, speeds and ordered surface targets; `mainBatteries` opts real shells in. | `src/sim/scenario.ts`; M4 handoff | The naval action is scenario content. |
| Main batteries select the first live `fireAt` target, then fall back to the nearest hostile ship, with a 15.5-mile fire-control cap. | `src/sim/weapons/aaFire.ts`; `src/sim/weapons/mainBattery.ts` | Geometry and a deterministic test must keep *Mogami* outside fallback reach. |
| The F6F carries two bombs, six rockets and 2,400 gun rounds; all three direct-hit kinds damage ships in `stepCombat`. | F6F and Mogami content; `src/sim/weapons/combat.ts` | A production-path test must prove a useful miss-and-gunnery margin, not just add nominal store damage. |
| A shipped mission needs a scenario, one picker row and one unique ribbon; content, product-flow and radio tests enroll additions. | Track F in `MASTER_PLAN.md`; `docs/testing.md` | Prefer enrollment and one mission-specific behavior test. |

## Tasks

1. **Write the failing contract first.** Add a focused Surigao mission test
   that expects the roster, sides, explicit fire orders, player loadout and
   production damage margin, real-strait geometry, water-valid loops, a main-battery fight
   that leaves *Mogami* untouched for the measured pursuit window, and badge
   success/failure paths.
2. **Scenario content.** Add `content/scenarios/surigao-strait.json` with the
   airborne F6F, retreating *Mogami*, the representative remnant and U.S.
   groups, staged Essex, dawn weather, strike/secondary/recovery objectives,
   concise messages, badge, briefing and an original historical note citing
   lookupable U.S. federal sources.
3. **Tune from measurements.** Against the real L1 terrain, prove every ship
   loop is water, the battle line fires on its ordered targets, *Mogami*
   remains outside the battle line's shell reach long enough for the player
   to act, and the player starts on a useful pursuit bearing. Change scenario
   geometry and counts only; do not retune AA, shells, ship HP or weapons.
4. **Product enrollment.** Add the non-Dev picker row, unique ribbon and
   text-only radio mappings. Update exact mission lists and extend the
   existing mission E2E flow for briefing, objective line, opening message,
   chart and debrief. Do not clone table-driven coverage.
5. **Standing documentation.** Update `MASTER_PLAN.md` as the project ledger
   and `GAMEPLAY.md` as the player-facing scenario roster. Write the dated
   handoff with measurements, verification, abstractions and remaining risk;
   email it as required by `AGENTS.md`.
6. **Verification.** Run touched deterministic tests first, then
   `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on Ryzen. Run only the
   proportionate non-budget mission E2E/capture work, reusing shared
   Playwright plumbing and not taking or stopping a shared dev slot. If no
   isolated safe route is available, report the E2E limitation rather than
   disturbing another session.
7. **Delivery.** Commit coherent changes and push `surigao-strait-mission`.
   Do not merge, deploy or modify `main` or another worktree.

## Acceptance gates

- Every scenario and reference resolves through `worldFromScenario`.
- Every ship loop is over water on the committed terrain field.
- The naval battle produces real main-battery salvos against the explicitly
  ordered survivors, while *Mogami* takes no main-battery damage during the
  measured pursuit window.
- The player begins in an F6F, pointed toward *Mogami*, and the recommended
  `both` loadout has a production-tested miss-and-gunnery margin sufficient to sink her.
- Destroying *Mogami* and trapping aboard Essex awards the badge; trapping
  while she survives awards none.
- The picker, ribbon, radio mapping, briefing, chart, objective line and
  debrief are enrolled in their existing tests.
- Focused deterministic checks and full verification pass. Any E2E run names
  its host/adapter and reports captures separately from correctness.

## Known abstraction and risks

- The representative ship groups compress a confused, hours-long action into
  one readable sortie. *Mogami*'s shipped model retains five 8-inch turrets
  although the real ship had lost her aft pair in the 1943 conversion.
- Main-battery fallback is engine behavior. Geometry, not a special-case code
  change, keeps the battle line off *Mogami*; the mission test must pin that
  behavior over a named time window.
- Several warships concentrate AA. The deterministic run must measure that
  the mission remains flyable; any rendering performance observation is
  recorded, not mixed into the correctness test.
