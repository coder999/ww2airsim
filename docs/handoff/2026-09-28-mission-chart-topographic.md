# Handoff — navigation chart restyled as a WWII topographic sheet (2026-09-28)

Branch `worktree-mission-map-icons`, not merged. Restyle of the Plan 14 chart
(`src/render/missionMap.ts`, `P`); what it selects and lists is unchanged.
Spec `docs/superpowers/specs/2026-09-28-mission-map-chart-design.md` (§10 has
the measurements), plan `docs/superpowers/plans/2026-09-28-mission-map-chart.md`.

## What shipped

Naval Communications paper sheet with a lat/long graticule, feet contours
(50/100/200/500 ft interval by span, index every fifth, 40-level cap),
woodland/cultivation/swamp patches from `terrain.cover`, coast, compass rose,
nautical-mile scale bar, legend, and ink icons for airfields, carriers and
ships. Pure geometry lives in `src/render/mission/`, unit-tested; the DOM half
is checked by screenshot (`docs/handoff/img/2026-09-28-mission-chart-free-flight.png`).

## Traps and open items

- An open chart redraws when the terrain object changes (`chartNeedsRedraw`),
  not only on tick: a held world keeps its tick, and cover attaches by
  replacing `world.terrain`.
- Contour faceting on Low versus High asset quality was not compared.
- `courseLabel` still prints km/m (pre-existing; imperial rule).
- Viewing checkpoint (final product only, unattended): Mark has not yet looked.
  Serve the branch with `npm run dev:lan` from the worktree; the windomlane
  host serves the primary checkout, not this worktree.
