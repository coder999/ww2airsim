# Mobile Hangar handoff (2026-10-11)

The Hangar now has a phone layout without creating a second page or catalog.
Desktop keeps its existing three columns. At 820 CSS pixels and below, the
same DOM becomes a compact catalog header, a full-width WebGPU viewport, and
a scrollable details / test-bench sheet at the bottom.

## What changed

- The long object list becomes one **Asset** picker on mobile. Kind, Side and
  Origin remain available as 44-pixel-high controls and immediately rebuild
  the picker.
- The model owns the full width between the picker and details. Orbit input
  stays on the canvas with `touch-action: none`.
- Details use 42% of the dynamic viewport height (capped at 390 CSS pixels),
  scroll internally, honor the bottom safe-area inset, and collapse to a
  44-pixel handle. Collapsing returns the height to the model; desktop's same
  control still returns width.
- The exact selected item is synchronized between the desktop list and mobile
  picker. Desktop also gains an `aria-current` selection marker.
- `hangar.html` now declares the mobile viewport and safe-area behavior.
- The canonical Hangar design and `GAMEPLAY.md` describe both responsive
  layouts. A 390 × 844 browser acceptance test pins stacking, touch-target
  height, full-width canvas, on-screen details, collapse behavior, and absence
  of horizontal document overflow.
- The full-suite run found a stale turret roster assertion left by the V2 M4
  addition. The M4 already aimed correctly in that test; its id is now in the
  expected list.

## Visual check

A real nexus GPU capture at 390 × 844 CSS pixels was inspected with the
F4F-4 selected, `?bench&dev=1`, and the details sheet open. The filters and
asset picker fit without truncating the page, the aircraft and scale pad are
fully visible, the collapse handle is reachable, the Dev-only Asset ID is
present, and the card scrolls inside the sheet rather than the document.

## Verification

- `npm run typecheck` through `remote-run`: pass.
- `npm run lint` through `remote-run`: pass.
- `npx vitest run tests/render/hangar` through `remote-run`: 12 files, 147
  tests passed.
- Focused GPU E2E: the new mobile case passed; both existing desktop layout
  cases passed.
- Full GPU Hangar suite: 24 of 25 passed in 8.4 minutes. The only failure was
  the stale final expected-id list for the already-modeled M4 Sherman; all of
  that test's turret motion assertions had passed. After adding that id, the
  exact case passed alone (1 of 1, 20.1 seconds). Thus every one of the 25
  Hangar cases has a passing post-change run.

No asset, simulation, model, mission, or deployment behavior changed.
