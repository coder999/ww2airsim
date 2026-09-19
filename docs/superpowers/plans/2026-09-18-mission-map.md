# Mission Map Implementation Plan (Plan 14)

**Goal:** Give the pilot a frozen, clickable navigation chart of the real
free-flight world: player, Tacloban, Dulag, carrier task force, and wingman;
select a friendly recovery point to read course and range.

**Architecture:** A new render-only `missionMap.ts` derives `MapPoint`s and
course geometry from the current `World`, and renders an SVG/DOM modal. The
entry point owns its open state and reuses `withPaused`; no simulation type or
tick behavior changes. A `KeyP` binding is listed in the existing legend.

**Spec:** `docs/superpowers/specs/2026-09-18-mission-map-design.md`.

## Constraints

- Work in the served nexus checkout on `main`; do not use a worktree.
- Do not push or deploy.
- `src/sim/` never imports `render/`, browser APIs, or Three.
- The map reads current world state but does not mutate it. Do not change
  flight coefficients, terrain content, scenario content, or golden tolerances.
- Run `npm run verify; rc=$?` directly before every commit. Re-diff against
  `HEAD` immediately before committing.
- Use US spelling in new prose and identifiers, and escape `|` in Markdown
  table cells.
- Update `.superpowers/sdd/2026-09-18-mission-map/progress.md` after every
  task; it is the gitignored executing ledger.

## Task 1 — Pure chart model and navigation arithmetic

Create `src/render/missionMap.ts` with pure types and functions: `MapPoint`,
`mapPoints(world)`, `chartBounds(points)`, `projectPoint(point, bounds, width,
height)`, `courseTo(from, to)`, and `selectedPoint(points, id)`. Airfield
coordinates come from `localToWorld(field, 0, 0)`, moving entities from their
current state. Use explicit kinds and `targetable`, never a label heuristic.

Create `tests/render/missionMap.test.ts` first. Construct a real
`worldFromScenario(loadScenarioBundle('free-flight'), terrain)` and assert all
seven currently relevant entities/bases appear. Test cardinal and wraparound
bearings, range, zero range, finite padded bounds, aspect-preserving
projection, and a carrier's current rather than waypoint-zero position.

Run `npm run verify`, update the ledger, and commit.

## Task 2 — Binding and discoverability

Add `toggleMissionMap: ['KeyP']` to `src/input/bindings.ts`. Add exactly one
`Navigation chart` row to `LEGEND_ROWS` in `src/render/legend.ts`. Extend
`tests/render/legend.test.ts` to pin the physical key and prove it is not
claimed by another action; the existing exhaustive test proves it remains
listed. Run verify, update the ledger, and commit.

## Task 3 — Accessible SVG/DOM chart

Extend `src/render/missionMap.ts` (or split a thin `missionMapDom.ts` only if
the pure model becomes obscured) with `createMissionMap(root)`. It renders a
hidden modal with `role="dialog"`, `aria-modal="true"`, title, close button,
SVG chart, marker buttons, selection outline, and a text course/range panel.
It exposes `show(world, selectedId)`, `hide()`, and selection/close callbacks.
Every update redraws from the supplied current world; no stored entity
coordinate becomes stale. Targetable buttons alone can select. The close
button and `P` label read `BINDINGS` through `keyLabel`.

Add focused DOM-independent tests for model text and a small jsdom-free handle
test only if existing test infrastructure supports it; otherwise let Task 5's
Tier 2 cover DOM wiring. Do not add a browser global to pure functions. Run
verify, update ledger, commit.

## Task 4 — Entry-point modal ownership and exact pause restoration

In `src/render/main.ts`, create the chart after the scenario world exists.
Handle non-repeating `KeyP` in the existing key listener, prevent its default,
and maintain `mapOpen`, `mapSelectedId`, and `pausedBeforeMap`. On opening,
remember `frame.paused`, set it through `withPaused(frame, true)`, and prevent
all flight/pause input from reaching `nextFrameState` while open. On close,
restore the remembered pause state exactly. Reset any pending control latches
at the transition boundary so a tap during the map cannot fire on close.

Refresh the map once per animation frame while open before rendering it, so a
map opened during a frame always reflects the current world. Keep it separate
from the debrief: an impact/landing remains the owner of its own modal and
cannot be opened underneath a navigation chart.

Add pure helpers to `missionMap.ts` or a narrow new module for the state
transition, then test open/close from running and manually paused frames and
the frozen tick. Do not add map fields to `FrameState`. Run verify, ledger,
commit.

## Task 5 — Tier 2 interaction proof

Create `tests/e2e/missionMap.spec.ts`. Against the reference GPU server,
wait for terrain, press `KeyP`, and assert the dialog names `YOU`, Tacloban,
Dulag, and the carrier. Click Tacloban and the carrier in turn and assert a
course/range appears. Sample `window.__ww2.tick()` across real time while
open and require equality; press `KeyP` to close and require it then rises.
Require zero `validationErrors`.

Run this test at 1440p via the documented `PW_REMOTE` tunnel, inspect a
screenshot, then run the whole Tier 2 suite. Record actual command and result
in the ledger; do not invent a GPU timing claim for a DOM-only chart. Run
verify before committing.

## Task 6 — Review, handoff, and roadmap

Review the diff against this document and the non-goals. Run `npm run verify`
and the Tier 2 suite again if review changes runtime code. Add
`docs/handoff/2026-09-18-plan14-mission-map.md` with commits, measured
verification, controls, data contract, and later seams. Update the master
roadmap's Plan 14 row to Complete with the handoff link and move `— next` to
Plan 8. Update README only where it inaccurately says there is no navigation
instrument. Email both the completed handoff and any final spec amendment as
HTML with `tools/mail-doc.py`. Verify a clean worktree; do not push or deploy.
