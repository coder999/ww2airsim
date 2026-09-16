# Plan 6a (cockpit panel) — resume snapshot, 2026-09-15

> **Superseded:** continuation completed; see [final handoff](2026-09-15-cockpit-panel.md).
> The snapshot below describes the earlier stopping point.

Written mid-execution because the session ran low on usage. This is the
durable record; the SDD ledger it summarises is **gitignored** and will not
survive `git clean -fdx`.

## Where everything is

| Thing | Location |
| --- | --- |
| Worktree | `.claude/worktrees/plan6a-cockpit-panel` |
| Branch | `worktree-plan6a-cockpit-panel` (pushed to origin) |
| Plan | `docs/superpowers/plans/2026-09-15-cockpit-panel.md` |
| Spec | `docs/superpowers/specs/2026-09-15-cockpit-panel-design.md` |
| **SDD ledger (gitignored — do not delete)** | `.superpowers/sdd/2026-09-15-cockpit-panel/progress.md` |
| Briefs / reports / review packages | same directory |

The ledger holds all 13 rulings in full, with what each costs if wrong. Read
it before resuming — it is the reasoning behind every deviation from the plan.

## Task status

| Task | State | Commits |
| --- | --- | --- |
| 1 — gauge kinds (dial/column/tape) | ✅ complete | `ff4b8c2`, `0be98ce` |
| 2 — vertical budget assertion | ✅ complete | `00e3238` |
| 3 — two bands, clipped bezel, slots | ✅ complete | `5b6ccaf`, `b593ab3` |
| 4 — throttle column | ✅ complete | `9485eef` |
| 5 — heading tape | ✅ complete | `520bdd5`, `8ed9e44`, `25e64f1`, `5938c9c` |
| 6 — attitude ball | ✅ complete | `abdb8f6`, `1e9935e`, `5526359`, `9bdc5cd` |
| 7 — retire horizon bar, bolden reticle | ✅ fix round 1 landed; **awaiting scoped re-review** | `a0204ff`, `8ff248b` |
| 8 — screenshots, handoff, spec table | ⬜ not started | — |

**Tasks 1–5 are already merged to `main` (`b5918ca`) and DEPLOYED** to
`https://ww2airsim.marktuttle.dev`. Tasks 6–8 are not.

## Resume here

1. **Task 7's fix round landed as `8ff248b`** (after the first version of this
   snapshot was written — the tree is now clean, `npm run verify` exits 0 at
   675 passed / 6 skipped). It addressed four items: a stale "like the horizon
   bar two tests above" reference in `tests/`; the ball's pitch MAGNITUDE being
   pinned by a single inequality, now covered by `offset(20°) ≈ 2 × offset(10°)`
   and `offset(30°) ≈ 0.8 × DIAL_RADIUS`; a restored "backing covers every other
   child horizontally" assertion; and two comment corrections. The implementer
   mutated the `0.8` scale to `0.5` and reports it broke the magnitude test but
   NOT the linearity test — so both were genuinely needed, which is the
   evidence that the pair is not redundant.
   **Still owed: a scoped re-review of `a0204ff..8ff248b`**, then mark Task 7
   complete in the ledger. Nothing else in Task 7 is outstanding.
3. **Task 8**: screenshots on the reference GPU, handoff doc, add a Plan 6a row
   to master spec §15. The Playwright path is set up and working — see below.
4. **Final whole-branch review** on the most capable model, pointed at the
   ledger's deferred-minor and parked lines.
5. Merge to `main`, deploy (`gh workflow run deploy.yml --repo coder999/ww2airsim`),
   delete the SDD workspace, then `superpowers:finishing-a-development-branch`.

## The Playwright / screenshot path (working as of this snapshot)

The reference GPU is the Windows desktop `ryzen`; nexus is headless and
Chromium over SSH gets no GPU at all.

- A Playwright server is LISTENING on `ryzen` at `127.0.0.1:3000` (pid 8364),
  left over from Plan 5's scheduled task. It does NOT survive the desktop
  sleeping — it died once today and the tunnel with it.
- Forward it: `ssh -N -L 39001:127.0.0.1:3000 ryzen`, then connect to
  `ws://127.0.0.1:39001/` with an `x-playwright-launch-options` header
  (`channel: chromium`, `headless: false`, ANGLE/WebGPU args) — see
  `playwright.config.ts`'s `PW_REMOTE` block for the exact shape.
- Serve the built bundle locally and REVERSE-forward it (`-R 5185:127.0.0.1:5185`)
  so the browser reaches it over `http://localhost` — WebGPU needs a secure
  context and plain LAN HTTP will not do.
- **Hold `KeyC` for ~250 ms to switch to cockpit view.** `page.keyboard.press()`
  is shorter than a frame, so the loop never samples it and the camera never
  changes. This cost a full screenshot cycle to discover.

## What this plan actually taught, worth carrying into Plan 6

Three defects in this plan shared one root cause: **the plan assumed a clipping
facility this renderer does not have.** There is no `localClippingEnabled`, no
`clippingPlanes`, no stencil anywhere. So "drawn oversized and clipped by the
bezel ring" and `TAPE_W` "the visible window" were both aspirational, and both
shipped geometry painting far outside its intended bounds — the compass rose
reached 71.67° off boresight against a 40.89° frame edge. Masking here has to
be geometric or per-frame culling.

The second recurring lesson, which cost three separate fix rounds: **a test that
an instrument MOVES is not a test that it READS CORRECTLY.** The tape's original
test asserted only that the strip slid left as heading increased — true of a
rose displaced by any constant, and it sat green while the compass read exactly
180° backwards. The same shape appeared in the ball's pitch magnitude.

Third: **an assertion weakened to accommodate a wrong constant hides the next
defect.** Two Criticals in Task 5 hid behind a test exclusion; the dial
containment check was nearly weakened to horizontal-only to accommodate a band
constant that was simply 14 mm too short.
