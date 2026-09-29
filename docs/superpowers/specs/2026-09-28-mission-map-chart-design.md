# Mission map as a WWII topographic chart — design

**Status: approved by Mark 2026-09-28; implemented on branch `worktree-mission-map-icons`.**
Builds on `2026-09-18-mission-map-design.md` (what the chart shows and how a
destination is chosen — unchanged) and `2026-09-24-naval-comms-ui-design.md`
(the visual language this adopts). This spec changes how the chart **looks**,
not what it selects or which entities it lists.

## 1. Goal

The navigation chart (`src/render/missionMap.ts`, opened with `P`) reads as a
WWII-era Army Map Service / USGS topographic sheet inside the Naval
Communications paper style: coastline, elevation contours, green woodland
patches, a faint lat/long grid, and ink icons for airfields, carriers and
ships. Success: Mark opens the chart on the dev server and it looks like a
period chart, not a debug plot, and opening it takes no perceptible hitch.

Already done on this branch (`152fd55`): a plain coastline
(`coastSegments`) and icons for airfield / carrier / ship (`MARKER_ICONS`).
This spec restyles and extends both.

## 2. Non-goals

- No zoom or pan; the chart stays one fixed view fitted to the markers.
- No new content files; all data is the terrain heights and the land-cover
  raster already loaded (`world.terrain`, `world.terrain.cover`).
- No change to selection, targetability, objective marks, or `World`.
- Ship icons do not rotate (no heading in `MapPoint`).

## 3. Sheet and frame

- The modal becomes a `.sheet` (`naval-comms.css`) using `naval-comms`
  fonts and variables: stencil letterhead "NAVIGATION CHART", scenario name,
  form number; Close is an `.ink-button`; the objectives list reuses the
  form-table styling. The dark panel is removed.
- The chart is a paper inset with a double neatline (heavy outer, thin inner).
- Margin legend (Army Map Service style): contour interval, symbol key
  (airfield, carrier, ship, woodland, cultivation, swamp), scale bar. All distances imperial: scale bar in nautical miles; contours and
  elevation labels in feet. (A numeric ratio was dropped: the chart fits a
  variable marker area to a fixed-size sheet, so a ratio would change with
  every scenario and mean nothing to a pilot; the bar carries the scale.)
- `role="dialog"`, `aria-label`, focus-on-open, Close, and keyboard selection
  behave exactly as today; existing tests for them must still pass.

## 4. Graticule

- Faint lat/long lines at major intervals, chosen from the visible span
  (1', 5' or 10'); ink at `--rule` opacity, under everything except the wash.
- Degree/minute labels in the margins. Projection is the game's local x/z
  about the terrain header's centre (10.8°N, 125.3°E); `localToLatLon` math
  must agree with `tools/terrain` and is unit-tested against known points
  (the header centre maps to the header lat/lon; one minute of latitude is
  1852 m).

## 5. Land

Drawn back to front:

1. **Wash.** Pale buff fill over all land; open water is the paper color with
   a faint blue tint within a short distance of shore.
2. **Woodland.** Translucent green where `tree + mangrove` is at or above the
   same 0.5 threshold family `LandClass` uses (`cover.ts`), traced from the
   cover raster as closed, lightly smoothed polygons. **Cultivation**
   (`crop`) is a fine hatch pattern. **Mangrove** is a swamp-tuft pattern
   over the green. `open` stays plain wash.
3. **Contours.** Brown thin lines at the interval, heavier index lines every
   fifth, from terrain heights. Interval is picked from the visible span so
   the count stays legible (target: roughly 100 ft interval / 500 ft index at
   default zoom); elevation labels sit on index lines only, sparse and
   non-overlapping.
4. **Coastline.** Dark ink line over the wash, with a light offshore
   water-lining (a second, thinner, offset line).

## 6. Markers

The icons from `152fd55`, drawn in ink; objective colors move to the stamp
palette (`--stamp-red` destroy, `--stamp-blue` friendly, `--stamp-violet`
protect). Labels use the typewriter face; the course line is dashed pencil
with a bearing and range note; the selected target gets a stamped ring.
Label placement (`labelPlacements`) is unchanged.

## 7. Structure

Pure modules (no DOM, unit-tested), under `src/render/mission/`:

| Module | Job |
| --- | --- |
| `graticule.ts` | interval choice, grid line + label positions, local↔lat/lon |
| `contours.ts` | marching squares to **chained closed/open polylines** at given levels |
| `coverPatches.ts` | threshold the cover raster to polygons per class; smoothing |
| `chartScale.ts` | scale bar length/label, contour interval choice |

`missionMap.ts` keeps the DOM half: builds one SVG per open from those models.
`coastSegments` is replaced by the chained-polyline coastline from
`contours.ts` (level = land threshold), so there is one tracing routine.

Sampling and cost: the map is static while open, so geometry is computed once
for the visible rectangle and cached: terrain layers are rebuilt only when the
chart bounds or the loaded terrain/cover change, not every tick; markers
redraw as today. Grid density is decided by measurement
on the real 200 km world; the budget is that opening the chart adds no more
than one dropped frame on nexus's dev server. Fall back to fewer contour
levels, not a coarser coast, if the budget is missed.

Missing data: no terrain → no land layers (paper chart with grid and
markers); no cover → no woodland/crop/mangrove, contours still drawn.

## 8. Testing

- Unit: graticule interval/labels and lat/lon anchors; contour chaining on
  synthetic fields (a cone gives nested closed loops; a ramp gives open
  lines; saddle cases produce no dangling segments); cover polygons on a
  synthetic raster (one square of trees gives one closed polygon of the right
  extent); scale bar; interval choice monotonic in span.
- Existing `tests/render/missionMap.test.ts` keeps passing.
- Visual: screenshots of the real free-flight scenario chart on the dev
  server (Playwright, via the preview-harness approach in memory) reviewed by
  Mark; `npm run verify` via `remote-run`.

## 9. Open items to measure, not assume

- Contour/cover cost on the real terrain level loaded at chart-open time
  (`finestFetchedLevelFor(quality.assetQuality)` may be coarse on low tiers;
  contours from a coarse level will look faceted — record what each tier
  shows).
- Whether `terrain.cover` is attached by the time a mission can open the
  chart (it loads separately from heights).

## 10. Measured (2026-09-28)

- Layer build (land, coast, woodland, crop, mangrove, contours) on the real
  200 km terrain: at most 25 ms at the worst-case visible area, run once per
  open and cached per (terrain, visible area, cover presence). The real
  Tacloban-area scenario was not benchmarked separately; it rendered without a
  visible hitch.
- `terrain.cover` was attached by the time the chart opened (about 4 s after
  terrain load): woodland, cultivation and swamp all rendered in the
  `free-flight` and `convoy-strike` screenshots
  (`docs/handoff/img/2026-09-28-mission-chart-free-flight.png`). A chart
  opened before cover attaches simply omits the green layers.
- Not compared: contour faceting on Low versus High asset quality.
