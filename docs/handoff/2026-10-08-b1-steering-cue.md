# B1 steering cue handoff

**Date:** 2026-10-08  
**Branch:** `codex/b1-steering-cue`  
**Worktree:** `/home/mark/projects/ww2airsim-b1-steering-cue`  
**Viewing:** unattended; the targeted E2E run writes the existing mission-UI captures.

## What shipped

- An always-visible in-flight steering cue below the objective line: a
  nose-relative arrow, range in statute miles and signed relative altitude in
  feet.
- The first active primary `takeoff`, `land`, `reach`, `hold` or `destroy`
  objective supplies the automatic destination. A destroy group chooses its
  nearest live resolved member.
- A target chosen on the navigation chart overrides the automatic destination.
  If that selection becomes stale or is destroyed, the cue falls back to the
  current objective.
- `protect`, `deny` and `approaches` are standing orders, matching the existing
  objective-line rule, so they do not hide a simultaneously active recovery.
- A station with an altitude band shows zero vertical separation while the
  player is inside the band, and the nearest band edge while outside it.
- `window.__ww2.mission()` exposes the rendered steering label for E2E wiring
  checks.

## Verification

- `npm test -- --run tests/render/mission/steeringCue.test.ts tests/render/mission/hud.test.ts tests/render/missionMap.test.ts tests/render/mission/chart.test.ts`
  — 66 passed.
- `npm run typecheck` — passed.
- `npx eslint` over the six changed source/test files — passed.
- `npm run build` — passed; 384 modules transformed.
- Impeccable's one-time mechanical detector over `hud.ts` and
  `steeringCue.ts` — no findings.
- `PW_BASE_URL=http://localhost:5175 sg render -c 'npx playwright test
  tests/e2e/mission-ui.spec.ts --grep "steering cue follows" --reporter=line'`
  — 1 passed in 11.7 s on Nexus's real Radeon 680M.
- The browser check captured 2560×1440 automatic-objective guidance and
  1920×1080 chart-override guidance. Visual inspection found the objective,
  steering cue, transient radio line and existing HUD readouts separated and
  legible at both sizes.

A first browser attempt used the broader pre-existing mission-UI journey. It
passed the new steering-cue and chart-override checkpoints, then timed out in
the unrelated `hopClear` takeoff helper. B1's focused test stops at its own
boundary and supplies the browser verdict above.

## Open items

- None in B1. The bomb impact marker remains B2 and is still an Assist, off by
  default.
