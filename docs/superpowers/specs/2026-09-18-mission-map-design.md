# Mission map — design (Plan 14)

**Status:** implementation design, 2026-09-18. Plan 14 is order 11 in the
[master roadmap](2026-09-12-ww2airsim-design.md#15-plan-order-and-dependencies),
after entities, ships, and airfields. This document makes that already-approved
scope concrete; it does not add combat, mission selection, scoring, or new
world content.

## 1. Purpose and boundary

The map answers the pilot's immediate navigation questions: where am I, where
are the friendly airfields and carrier, and what course should I fly to one of
them? It is a chart over the live world, not a second simulation or a
strategic map.

The initial free-flight scenario contains two airfields and a carrier task
force, but no enemy base, primary target, objectives, or flights. The map must
therefore show only records that actually exist. It must not manufacture an
enemy marker to imitate a future mission. Plans 6, 7, and 9 add the content
that lets later scenarios extend the same marker contract.

The map is browser UI in `src/render/`; `src/sim/` remains browser-free and
does not know whether the chart is open. It reads the `World` and `Scenario`
Plan 12 already made authoritative. A point's current position is taken from
the current world each frame, so a carrier marker sails while the chart is
closed or open without an independently animated map state.

## 2. Interaction and pause

`P` opens and closes the chart. It is unbound on 2026-09-18 and is recorded in
`BINDINGS`, the on-screen controls legend, and tests together so it cannot
become another undiscoverable key. The map opens as an accessible modal over
the still-rendered scene; its title is **NAVIGATION CHART** and it has an
explicit close button as well as the `P` shortcut.

Opening the chart holds simulation time through `withPaused`, the same frame
mechanism landing debriefs use. It remembers whether the pilot had already
paused manually and restores that exact state on close. While the chart is
open, flight-control and pause edges are not forwarded to `nextFrameState`:
looking at the chart cannot silently move a lever or change the pause state.
The renderer, ocean, and DOM continue to update. A map never changes an
aircraft's controls, position, world tick, or scenario.

## 3. Markers and navigation

`mapPoints(world)` emits a small, render-owned view model:

| Kind | Source | Label | Targetable |
| --- | --- | --- | --- |
| Player | `playerAircraft(world)` | `YOU` | no |
| Airfield | `world.airfields`, runway-local origin | airfield name | yes |
| Carrier | `world.ships` whose spec role is `carrier` | ship name | yes |
| Escort | other ships | ship name | no |
| Wingman/other aircraft | `world.aircraft` excluding player | entity id | no |

The carrier, its escorts, and the wingman are shown because they are real
entities and their absence would make the map disagree with the scene. Only a
friendly recovery point is targetable in this first scenario: airfields and
carriers. A selected target produces a straight course line from the player's
current position, range in kilometers, and a true bearing measured clockwise
from north. The project frame is +x east and +z south, so the conversion is
`atan2(dx, -dz)` normalized to `[0, 360)`: a target due north reads 000° and
one due east reads 090°. The displayed line is navigation advice, not an
autopilot or a promised collision-free route.

## 4. Chart geometry

The chart is a DOM/SVG modal, not a texture or world object. It has no GPU
cost, cannot be occluded by cockpit geometry, and remains usable in both
camera modes. Map coordinates preserve the world x:z aspect ratio, with +x
right/east and -z up/north. Bounds are the union of current map points with a
finite padding floor; a single point still yields a finite, nonzero chart.
The player and selected target never fall outside its padding. The map has no
terrain raster, political boundary, invented coastline, or background asset:
those would imply accuracy unavailable from its data contract.

Markers use text and shape as well as color. The selected destination has a
visible outline, and the player marker has an unambiguous `YOU` label. Buttons
have accessible names. Marker clicks and keyboard focus select only targetable
points; no click can write into the simulation.

## 5. Contracts and verification

`src/render/missionMap.ts` owns pure point generation, bounds/projection,
bearing/range, selection resolution, and textual course data. Its DOM handle
only renders that model and reports selection/close events. This split keeps
the important geography and state rules in Node-tested code.

Tier 1 proves:

- the map reads the player, both bases, carrier, escorts, and wingman from a
  real scenario world, rather than hardcoded coordinates or labels;
- north, east, diagonal, zero-range, and wraparound courses are correct;
- projection preserves aspect ratio and yields finite coordinates for one or
  many markers;
- a selected carrier follows its live world position and a missing selected id
  is harmless;
- `P` is the only map binding and every binding remains listed in the legend;
- opening/closing restores both a running and an already-paused frame without
  advancing a tick while open.

Tier 2 on the reference GPU opens the real chart after terrain arrives,
selects Tacloban and the carrier, asserts a readable course/range and a frozen
tick, closes it, and proves ticks resume. It also asserts no WebGPU validation
errors. The chart is DOM-only, so it does not receive a new GPU budget; its
test runs beside the existing 1440p suite and catches accidental renderer
coupling.

## 6. Explicit non-goals

- No enemy bases, targets, objective routes, map tiles, terrain imagery,
  fog-of-war, waypoints, or route planning.
- No mission picker, loadout, pilot roster, persistence, score, or debrief
  changes; those are Plan 9 and master spec §8.
- No autopilot, heading bug, HUD bearing, carrier deck contact, or collision
  behavior.
- No modification to `World`, flight physics, terrain data, scenarios, or
  the player's golden trajectory.

## 7. Later extension seam

A later scenario can add named marker records for enemy bases and objectives,
or Plan 9 can adapt its mission content into `MapPoint`s. It must add them at
the map boundary, with a declared kind and targetability, not as a renderer
literal. Carrier position remains live from `World`; an eventual named hull or
mission objective is metadata beside that identity, not an alternate moving
coordinate.
