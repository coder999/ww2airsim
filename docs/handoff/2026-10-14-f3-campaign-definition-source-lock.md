# F3 Campaign Definition and Source Lock Handoff

**Date:** 2026-10-14

**Branch:** `f3-campaign-lock`

**Worktree:** `/home/mark/projects/ww2airsim-f3-campaign-lock`
**Status:** Awaiting Mark's F3 review; F4 asset production has not begun.

## Outcome

F3 now has a reviewable campaign and source lock for both six-mission Leyte chapters. The lock fixes the historical label, date, player aircraft, minimum rank, objective and recovery graph, bounded order of battle, first-action budget, canonical site state, opening scene, victory scene, briefing evidence, and implementation uncertainty for every mission.

The exact F4 asset set is 17 reusable models, divided into four like-for-like production groups suitable for four independent worktrees after this gate is approved:

1. Airborne: 4 assets.
2. Ground support: 4 assets.
3. Maritime and rescue: 4 assets.
4. Night and site markers: 5 assets.

Procedural base-layout work is explicitly excluded from Blender scope. The downstream plan count is dependency-checked at 22 plans, replacing the former 10–16 estimate.

## Files

- `docs/superpowers/specs/2026-10-14-leyte-campaign-definition.md` — authoritative F3 definition and evidence ledger.
- `docs/superpowers/plans/2026-10-14-f3-campaign-definition-source-lock.md` — execution and acceptance plan.
- `GAMEPLAY.md` — chapter tables now carry the locked dates, labels, and minimum ranks.
- `MASTER_PLAN.md` — F3 points to the review artifacts and the downstream estimate is now exact.

## Important decisions

- Allied missions: Tacloban landing, daylight Tacloban defense, Ormoc road interdiction, Ormoc convoy strike, Samar carrier defense, and San Pablo airborne defense.
- Japanese missions: Buri interception, Bayug field defense, Ormoc convoy cover, Tacloban night harassment, Ormoc convoy cover, and the Te-Go airborne assault.
- Every mission budgets meaningful action inside 5–7 minutes, with most targeting 2–4 minutes.
- The two finale populations are bounded at 24 airborne entities including the player. Close-aircraft sets remain at or below 16, and heavy formations outside that set follow routed/aggregate logic.
- Taffy 3 and Te-Go are disclosed compressions: the former retains the tactical identity within the 10-ship cap, and the latter uses the Ki-57 as the representative transport type because the Army history does not identify every observed transport subtype.
- The U.S. night flare is the War Department M24 aircraft parachute flare, not the later Mk 24 naval flare.
- The existing F4F-4 stands in for the FM-2 in the Samar chapter until a separate roster decision authorizes another aircraft.

## Evidence and limits

The lock uses official U.S. Army, Army Air Forces, Navy, Marine Corps, War Department, Coast and Geodetic Survey, and Australian War Memorial material. The source ledger distinguishes direct evidence from gameplay compression or representative typing.

All ledger URLs returned HTTP 200 from Nexus except two `history.navy.mil` pages, where Nexus curl rejected the local certificate issuer. Both pages were independently readable through the web source and remain cited; this is a Nexus CA-chain limitation, not a missing document.

Exact runway coordinates, terrain fit, and per-asset geometry provenance remain intentionally deferred to F8 and the four F4 asset plans. Those are implementation questions, not unresolved campaign-definition choices.

## Verification

- One-off structural consistency assertion: `chapters=12 matrix=12 assets=4/4/4/5 finales=2 planCount=22 PASS`.
- Full repository verification: passed on the Ryzen worker with `REMOTE_RUN_OVERFLOW=0 /home/mark/.local/bin/remote-run npm run verify` — typecheck, lint, dependency checks, 441 test files, and 6,413 tests passed; 12 tests were skipped by their existing conditions.
- Tests added or changed: none. This change is documentation-only, and a permanent source-grep test would add brittle duplication rather than protect shipped behavior.
- Existing tests remain valid because no runtime code, generated content, asset, or scenario data changed.
- Required HTML document email: pending. The execution environment blocked the send because the configured recipients were not exposed for verification; explicit user approval is required before retrying.

## Review gate

Mark's approval is required before any F4 worktree renders or asset generation begins. The review should decide whether the 12 mission locks, two disclosed substitutions, four F4 asset groups, and 22-plan dependency count are accepted as the implementation baseline.

## Assumptions made while work proceeded

- The user's request for parallel worktrees was interpreted as permission to prepare F3 in an isolated worktree rather than edit `main` directly.
- With no checkpoint reply received, this pass used one final source-lock checkpoint and otherwise ran unattended.
