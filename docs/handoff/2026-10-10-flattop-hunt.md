# Flattop Hunt mission handoff (2026-10-10)

Plan: `docs/superpowers/plans/2026-10-10-flattop-hunt.md`. Run unattended; Mark's checkpoint is the final product.

Worktree: `/home/mark/projects/ww2airsim-flattop-hunt`

Branch: `flattop-hunt`

Exact base: local `main` at `61297b23e10709288f9e19e264f1399494fb00ae` (`Checkpoint cloud rendering research`).

## What shipped on the branch

- **Flattop Hunt** (`content/scenarios/flattop-hunt.json`), a non-Dev mission in the title picker. The player starts airborne in a TBM-3 Avenger with the recommended **Torpedo** loadout and three veteran TBM-3 attackers alongside.
- The target is the moving Japanese carrier *Zuikaku*, screened by two moving Kagero-class destroyers. The carrier is the primary objective, one escort is secondary, and the other primary objective is recovery aboard a moving Essex.
- The three supporting Avengers use E2's existing opt-in `pilot.ingress.attack: "torpedo"` order. This is three independent attack pilots, not E3 formation bombing. No E3 or M3 code was copied into this branch.
- Two concise strike-lead calls are deliberately text-only (`RADIO_LINES` maps them to `null`), so there was no voice-generation spend.
- The briefing explains that the real Battle off Cape Engaño was north of this map and cites two lookupable official Naval History and Heritage Command pages, including photograph 80-G-281769.
- `MASTER_PLAN.md` and `GAMEPLAY.md` now record eight shipped real missions and Flattop Hunt's completed dependency row.

## Dependency gate and measured content

The prerequisite gate was already green at the branch point: `zuikaku-cv`, the TBM-3 and Mk 13, flooding, and E2 attack AI are all present. The mission uses them as content; it does not change carrier HP, torpedo damage, flooding, AA, difficulty, or global AI.

- Player to *Zuikaku* at spawn: **19.8 km / 12.3 mi**, heading **225°**. The opening call rounds this to twelve miles.
- Player to Essex at spawn: **12.0 km / 7.5 mi**.
- The Japanese group uses Convoy Strike's long racetrack, with fixed escort offsets. All four ship loops pass the real L1 terrain field's over-water assertion.
- Two complete Mk 13 hits leave the 600-point carrier afloat; three complete hits sink it under the shipped flooding model.
- In a deterministic 420 s run with both escorts and all AA live, all three supporting Avengers released once and *Zuikaku* sank at tick 17,036 (**283.9 s**). This makes the strike feel inhabited, but it also means the support package can complete the carrier objective without a player hit; the player must still survive and trap aboard Essex for the badge.
- AI `home` was intentionally omitted. Giving these airborne attackers a home invokes E2's idle-RTB clock before the target run and sends them away at 30 s.

## Verification

- Focused deterministic gate on Ryzen: **5 files, 144 passed**, including the live-AA supporting strike, route geometry, mission success/no-badge paths, title registration, content honesty, option enrollment and text-only radio.
- The new TBM mission exposed an old test assumption that every scenario player accepts all four loadouts. `tests/sim/sortie.test.ts` now checks default-world identity across that player's non-Dev-legal loadouts; its focused gate is **20 passed**. This keeps the original global constraint while correctly covering rack-only aircraft such as the Avenger and Wildcat.
- Full Ryzen gate, `REMOTE_RUN_OVERFLOW=0 ~/.local/bin/remote-run npm run verify`: **400 files, 5,579 passed, 12 skipped, exit 0**.
- Ryzen console-session reference GPU, through the already-shared Playwright tunnel:
  - `tests/e2e/adapter.spec.ts`: **3 passed** (reference adapter, zero WebGPU validation errors on the sweep, Medium boot clean).
  - Flattop Hunt case in `tests/e2e/missions.spec.ts`: **1 passed** (briefing, recommended Torpedo, `FLATTOP 0/1`, opening radio, chart objectives, and killed/no-badge debrief).

## Final-only captures

All are 2560 × 1440 and were visually checked:

- [Briefing and mission selection](2026-10-10-flattop-hunt-shots/f-flattop-hunt-briefing.png)
- [Live navigation chart and carrier groups](2026-10-10-flattop-hunt-shots/f-flattop-hunt-chart.png)
- [Killed/no-badge debrief](2026-10-10-flattop-hunt-shots/f-flattop-hunt-debrief.png)

The browser-tested URL was `http://localhost:5180/?scenario=flattop-hunt&launch`, served by this worktree and verified HTTP 200 from Ryzen over an isolated reverse tunnel. `localhost` is a secure WebGPU context. No routed HTTPS hostname is claimed: at final capture time all three shared routed slots (5173, 5174 and 5175) belonged to main, K1 and a Claude worktree, and none was stopped or repointed.

## Integration notes and limitations

- The branch is based on local `main` `61297b23`, not directly on the older `origin/main`; preserve or rebase the two local-main commits before integrating this feature.
- Expected overlap with other parallel work is limited to append-only picker arrays/tests and the two ledgers (`MASTER_PLAN.md`, `GAMEPLAY.md`). Keep every new mission row/count when resolving those files.
- Keep the `tests/sim/sortie.test.ts` legal-loadout correction: without it, adding any shipped scenario whose player has racks but no rails makes the generic identity test ask the sortie layer for a Dev-only loadout.
- The three-AI deterministic strike can sink *Zuikaku* without the player's torpedo. That is deliberate for this content pass and tested; if playtesting says it removes too much agency, tune only attacker skill/count or geometry, as the plan says. Do not retune global torpedoes, flooding, AA or carrier durability.
- Nobody has hand-flown the complete attack and carrier recovery. The live browser flow proves presentation and failure/debrief plumbing; headless production helpers prove the successful trap and badge.
- No public dev slot was disturbed, no deployment was run, and `main`, E3, M3 and cloud worktrees were not modified.
