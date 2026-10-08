# H0: win back the render budget

**Goal:** `MASTER_PLAN.md` Track H, H0. Move the performance gate to 1440p,
buy back margin under it, and finish photoreal Task 14, so Tracks K (clouds)
and L (terrain) have a measured budget to spend.

**Run:** in a worktree (`EnterWorktree`, branch `h0-render-budget`), unattended (Mark, 2026-10-08).
**Viewing checkpoints:** the re-baseline ruling (end of Task 5) and the final
result. Unattended, so both go in the handoff for when he is back. Nothing
blocks on him.

## Rulings (Mark, 2026-10-08 grilling)

| # | Ruling |
| --- | --- |
| R1 | **The gate is 1440p (2560×1440), High gpu p95 ≤ 8.33 ms (one 120 Hz frame)**, in every view of `tests/e2e/views.ts`. The in-cloud carve-out (`IN_CLOUD_BUDGET_4K_P95_MS`) and `MEDIUM_LIMIT_OVERRIDE_MS` are retired. |
| R2 | Medium at 1440p, and both tiers at 4K, are **recorded, never asserted** (`recordFrameTime`, `tests/e2e/harness.ts`). |
| R3 | **Margin target:** every High view ≤ 7.5 ms (about 10% under the gate) when H0 ends. |
| R4 | **Stop rule:** optimize until two levers in a row each buy < 0.3 ms p95 on the worst view. |
| R5 | **Invisible levers land.** A lever that visibly changes the image lands behind a URL param, default off, with a before/after pair in the handoff. Mark rules on flipping it. |
| R6 | **Leftover reds stay red.** No limit is loosened in this plan. The handoff gives each red its measured p95 and a proposed limit, so his ruling is a one-line change. |
| R7 | `motionBudget` is re-measured at 1440p on the final build, with the same no-MRT reference method. |
| R8 | A DEV `?renderScale=` param, so Mark can compare 4K and 1440p live. The player-facing setting is A5, not this plan. |
| R9 | Photoreal Task 14 (`docs/superpowers/plans/2026-09-24-photoreal-render-pass.md:809`) is this plan's last step. |

## What the repo says today (checked 2026-10-08)

Prior 1440p High gpu p95 readings, from handoffs. Task 1 re-measures every one.
The in-cloud figure is scaled from 4K, not measured.

| View or spec | 1440p p95 | Source |
| --- | --- | --- |
| deck-quals | 7.6-8.1 ms | `2026-09-26-r2-ship-models.md`, `2026-09-26-loading-and-dossier.md` |
| entities task force | 7.1-7.4 ms | `2026-09-25-s1-ship-models.md` |
| terrain, Leyte | 6.2-6.5 ms | `2026-09-27-sortie-forms.md` |
| terrainTextures runway / low-land-600 | 7.8 / 7.3 ms | `2026-09-26-loading-and-dossier.md` |
| in-deck-1900 | ~9.5 ms (est.) | 21.5 ms at 4K × 1440p's 44% of the pixels |

So about two views are expected over R1 and most are over R3. That is the work.

- `TRIPWIRE_1440P_P95_MS = 8.33` (`tests/e2e/harness.ts:25`) is now the same
  number as the gate. Task 6 re-derives the tripwires as `min(ceil(1.2 × median × 10) / 10, 8.33)`.
  A tripwire can be tighter than the gate, never looser.
- Pixel ratio is set once, `Math.min(devicePixelRatio, 2)` (`src/render/renderer.ts:114`). The
  resize handler (`main.ts:3036`) only calls `setSize`, so it keeps whatever ratio boot set.
- Ablation params that already exist: `?cloudTier=off`, `?fx=off`, `?terrainTextures=off`.

## Global constraints

- **Worktree:** never touch `main`'s checkout. The primary dev server serves `main`,
  so this worktree uses slot 2: in the worktree's own `vite.config.ts`, set
  `TUNNEL_HOST = 'ww2airsim-2.windomlane.org'` and `server.port = 5175`, then
  `WW2AIRSIM_TUNNEL=1 npx vite --port 5175`. **That edit is local scratch, never committed:**
  stage files by name, never `git add -A`. Check `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/` → `200`.
- Tier 2 against the reference GPU: tunnel `ss -ltn | grep 39001` (else `ssh -N -L 39001:127.0.0.1:3000 ryzen &`), then
  `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test <spec>`.
  Ryzen asleep → wake per `serverconfig/ryzen.md`. The budget runs need the RDP desktop session, not session 0.
- **Every number you record comes from `hwlock ryzen <cmd>`**, budget specs only, never a whole suite
  (`docs/testing.md`). Three runs, take the median p95. A single run is not a number.
- Read `docs/testing.md` "Philosophy" before touching a spec. Budget titles must match
  `budget|p95|tripwire|frame time|Hz`, and no other title may.
- `src/sim/` is not touched. The Settings dialog UI is not touched (that is A5).
  `?cloudTier=`, `?oceanTier=`, `?fx=`, `?terrainTextures=` keep their meanings.
- **Invisible** (R5) means: a frozen-scene capture of the view, before and after, at 1440p,
  with mean absolute difference ≤ 1.0 grey level and max temporal std not worse than baseline
  (the `clouds.md` §3.8 method). Anything over that is visible.
- `npm run verify` rc=0 before each commit (capture `rc=$?` directly, never through a pipe).
- Ledger: `.superpowers/sdd/2026-10-08-h0-render-budget/progress.md` (gitignored). Each lever gets
  one row: hypothesis, ms bought (median of 3), invisible or visible, commit. Each ruling made on Mark's
  behalf goes there as `RULING n: <decision>, why, cost to reverse`.
- Imperial units in prose. US spelling. Escape `|` in table cells.

## Task 1: Baseline

- [ ] Under `hwlock ryzen`, 3 runs: all views × {High, Medium} × {1440p, 4K}, gpu p95. Use the
  current `budget4k.spec.ts` for 4K. For 1440p, add a throwaway loop locally, or do Task 2 first if quicker.
- [ ] Attribute cost per view at 1440p High: the full frame, then `?cloudTier=off`, `?fx=off` and
  `?terrainTextures=off` one at a time. The table of deltas goes in the ledger. It ranks the levers.
- [ ] Frozen-scene captures of every view at 1440p High: `baseline/<view>.png`, plus a 30-frame
  std burst per view. Every later capture is compared against these.

## Task 2: The gate moves to 1440p (R1, R2)

- [ ] `git mv tests/e2e/budget4k.spec.ts tests/e2e/budget.spec.ts`. Test title:
  `1440p budget (high): <view>` asserts `p95 ≤ GATE_1440P_HIGH_P95_MS = 8.33`. The Medium and 4K
  cases call `recordFrameTime` and do not assert. Rewrite the header comment: the dated ruling and a pointer
  to this plan. Delete the carve-out history (git keeps it).
- [ ] Update every reference to `budget4k` (`grep -rn budget4k`): `docs/testing.md` Philosophy, the nightly
  script, `clouds.md`, `playwright.config.ts` comments.
- [ ] Run it under `hwlock`. Whatever is red stays red (R6). Commit.

## Task 3: `?renderScale=` (R8)

- [ ] `renderer.ts`: `setPixelRatio(Math.min(devicePixelRatio, 2) * scale)`. `scale` comes from
  `?renderScale=`, DEV builds only, clamped to [0.25, 1], default 1. Production ignores it.
- [ ] Tier 1 test of the parse and clamp (garbage → 1, 2 → 1, 0.1 → 0.25, 0.667 → 0.667).
- [ ] Tier 2: `?renderScale=0.5` at 1440p → the canvas backing store is 1280×720. Commit.

## Task 4: Optimize (R3, R4, R5)

Pick levers in the order Task 1's attribution ranks them. Starting candidates:
- `clouds.md` §6 #5: fewer immediate marches at silhouettes, cheaper archetype reads, per-view step tuning;
- the amortized in-cloud march schedule (`clouds.md` §6 #2), for in-deck-1900;
- whatever the `terrainTextures` and `fx` deltas point at. The 2026-09-17 anisotropy find
  (`docs/handoff/2026-09-17-plan13a-hardening.md`) is the model: one variable at a time, in a table.

Per lever:
- [ ] Measure 3× under `hwlock` on the views it touches, plus the worst view.
- [ ] Frozen-scene diff against baseline. Invisible → commit. Visible → behind `?h0<Lever>=1`, default off,
  with a before/after pair at 1440p in `docs/handoff/img/2026-10-08-h0/`. Buys < 0.3 ms → revert,
  and log it as a dry lever.
- [ ] Stop after two dry levers in a row (R4), or when every High view is ≤ 7.5 ms.

## Task 5: The ruling table (checkpoint 1)

- [ ] Final `budget.spec.ts` run, 3× under `hwlock`. In the ledger, for each view: baseline → final p95 at 1440p
  High; Medium and 4K recorded; and, for any view over 8.33 or 7.5, a proposed limit with its reason.
  Do not change a limit (R6).

## Task 6: `motionBudget`, then photoreal Task 14 (R7, R9)

- [ ] `motionBudget.spec.ts`: viewport 2560×1440. Re-measure `ZERO_MOTION_REFERENCE_P50_MS` with the
  no-MRT path, 5 runs under `hwlock`, as its header describes. Scale the 0.15 ms tolerance by the pixel ratio
  (1440p / 4K = 0.444 → 0.07 ms), and keep it only if it sits above the 5-run spread. Otherwise record the
  spread and propose a value instead. Rewrite the dated header. Rename the title off "4K".
- [ ] Task 14 Step 1: re-derive the tripwires in `terrain`, `strike` and `terrainTextures` as
  `min(ceil(1.2 × median × 10) / 10, 8.33)`, each with a dated comment naming this plan.
- [ ] Task 14 Step 2: the probe check in Mark's Chrome, exactly as written there. Record what the probe recommends.
- [ ] Task 14 Steps 4-5 become this plan's handoff (below). Its eight-view image pairs are Task 1 vs Task 5.

## Task 7: Handoff (checkpoint 2) and merge

- [ ] `docs/handoff/2026-10-08-h0-render-budget.md`. Put first: the ruling table (Task 5), the visible-lever
  pairs and their params, and the Chrome probe result. Then each lever row, dry levers included. Then the
  tripwire table and the `motionBudget` reference. Then how to compare 4K and 1440p live:
  `https://ww2airsim.windomlane.org/?renderScale=0.667` on his 4K monitor once merged. Date and verify every cross-boundary claim.
- [ ] `MASTER_PLAN.md` H0: mark done with the handoff link. Note in A5 what `?renderScale=` became.
  `clouds.md` §6 #5: done, pointing at the handoff.
- [ ] Merge `h0-render-budget` into `main` (re-diff `main` against `HEAD` first; other sessions commit there), push.
  Revert the slot-2 `vite.config.ts` scratch edit before removing the worktree.
- [ ] Email the handoff: `python3 tools/mail-doc.py docs/handoff/2026-10-08-h0-render-budget.md "H0 render budget: handoff"`.
