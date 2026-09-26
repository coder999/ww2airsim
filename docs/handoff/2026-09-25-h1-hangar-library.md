# Hangar H1 handoff (2026-09-25)

Branch `worktree-models-track`, from the Models-track sequence Z1, H1, S1,
Z3, H2, S2, H3. H1 adds `hangar.html`: a 32-entry aircraft, ship and
building library checked against the rosters in `GAMEPLAY.md`, with gameplay
figures read from sim content, sourced history, a lit turntable, and a
gear/propeller bench behind `?bench`. Aircraft already load through Z1's
airframe registry.

Tier 1 completed with `verify rc=0`: typecheck, lint and dependency-cruiser
passed, followed by **1,721 tests passed and 12 skipped in 170 files**. The
skips are the repository's documented absent terrain and source-data caches.

## Reference-GPU Tier 2

Run 2026-09-25 through the desktop Playwright server on the RX 6700 XT, using
the `ww2airsim-3.windomlane.org` slot. Final result: **6/6 passed in 37.5 s**.
`validationErrors` was empty.

The final probe measured:

| Entry | Model-mask share | Luminance / Wildcat | Gear xor / model mask | Propeller xor | Zero-throttle xor |
| --- | ---: | ---: | ---: | ---: | ---: |
| F4F Wildcat | 4.24% | 1.000 | 3.30% | 931 px | 0 px |
| F6F Hellcat | 4.24% | 1.000 | 3.30% | 931 px | 0 px |
| Essex-class carrier | 4.42% | — | — | — | — |
| Fletcher-class destroyer | 4.12% | — | — | — | — |
| Type B Maru | 4.75% | — | — | — | — |
| AAA battery | 21.98% | — | — | — | — |
| Control tower | 14.10% | — | — | — | — |
| Hangar | 16.09% | — | — | — | — |

All eight in-service entries stayed inside the required 2–80% mask band.
Both modeled aircraft exceeded the 1% gear-motion floor, both propellers
changed after an exact 1/60 s tick, and neither changed at zero throttle.
Both aircraft used the same current Wildcat stand-in and therefore measured
the same luminance; each was inside the required 0.5–1.5× band.

The first gear run was red: the Wildcat gear xor was **0%** because `pose()`
deferred its effect to the animation loop after `freeze()` had stopped that
loop. `pose()` now applies an update immediately with `frameS: 0`, which
changes the articulation without advancing the propeller. The unit test pins
that behavior.

A visual probe then found the canvas right edge at **1660 px in a 1280 px
window**, and the panel at **3321.7 px high in a 720 px window**. The grid now
uses zero-minimum tracks, the canvas is re-fit to its grid cell after renderer
initialization, and the sheet scrolls inside the panel. The final layout check
passed. Saved Wildcat, Essex, hangar and full-page frames were inspected: all
three objects were framed and lit; the full page showed the list and canvas
side by side with no off-screen overflow.

## Decisions and implementation notes

Mark accepted both defaults on 2026-09-25:

- `rosterName` is optional and used only when a GAMEPLAY roster label differs
  from the sim spec's display name.
- All building entries use side `japanese`, matching their 1944 ownership and
  the strike scenario's target treatment.

Three traps remain:

- `src/render/hangar/stats.ts` mirrors the target-type decision in
  `src/sim/weapons/combat.ts`; a change to the latter must update the mirror.
- `import.meta.glob` bundles the library content into the Hangar page. The
  browser does not enumerate `content/library/` at runtime.
- `freeze()` changes the frame pipeline to SMAA. Leaving TRAA active would
  let projection jitter make frozen frames differ and create false-positive
  pixel-mask tests.

The implementation's intentional departures from the original design wording
are recorded once in the plan's
[“What H1 consumes from Z1” section](../superpowers/plans/2026-09-25-h1-hangar-library.md#what-h1-consumes-from-z1-and-where-this-plan-departs-from-the-specs-wording).

## H2 inherits

- flap and stores controls, plus Cycle
- gizmos, wireframe, and counts checked against the manifest budget
- ship models through Lane C's loader
- `docs/models.md` and the pointer to it from `CLAUDE.md`

H3 retains turret articulation and its top-view pixel-mask acceptance check.
