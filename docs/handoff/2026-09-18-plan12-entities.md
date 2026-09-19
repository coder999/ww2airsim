# Plan 12 handoff — entities, ships and airfields

Plan 12 is complete on `main`. The authoritative shape and the remaining
seams are in the approved [entities design](../superpowers/specs/2026-09-18-entities-design.md), especially §9; this handoff records what was measured
while implementing it rather than repeating that design.

`World` now carries identified aircraft and ships on one clock, with the
player identified by id. The free-flight scenario supplies Tacloban and Dulag,
the parked/chocked second Hellcat, and one Essex-class carrier with two
Fletcher-class escorts. Ships step before aircraft; a player impact freezes
only the frame, while the rest of the world continues to advance.

## Measurements and acceptance

| Check | Result |
| --- | --- |
| Chocked wingman, 60 s | **0.0000 m** horizontal drift (limit: under 0.5 m) |
| Entity soak | 12 one-minute simulations plus a replay of the first seed; ships stayed at sea level and over water; ticks agreed; no failures |
| Destroyer formation | **300 m diagonal offset** from the carrier: dd-1 `(x +212, z -212)` northeast; dd-2 `(x -212, z +212)` southwest. Both loops passed the real-field water check. |
| Reference GPU, 2560×1440 | **p50 3.539 ms; p95 3.670 ms**, below the 6.0 ms budget |
| Tier 2 | Task-force motion, second Hellcat/apron placement, validation-error sweep, and GPU budget passed. The first complete run had a single `net::ERR_QUIC_PROTOCOL_ERROR` on the budget page navigation; its isolated retry passed and produced the numbers above. |
| Tier 1 | `npm run verify` exit 0: **98 files, 1,066 passed, 1 skipped** |

Visual review used a paused downward view over San Pedro Bay: the carrier and
both destroyers were visible on the water. The normal flight acceptance view
also passed its motion and WebGPU-validation assertions.

## Values that remain assumptions or choices

These are the complete Plan 12 list from design §11, retained here so a later
plan does not mistake a working placeholder for sourced physics:

| Value | Figure | Standing |
| --- | --- | --- |
| Essex flight-deck height | 17 m | Estimate; Plan 8 must source it for deck contact. |
| Essex turn rate | 1°/s | Estimate; Plan 8 tunes it against a sourced tactical diameter. |
| Fletcher turn rate | 3°/s | Estimate. |
| Task-force speed | 7.717 m/s (15 kn) | Formation choice, not a fact. |
| Dulag runway length / width | 1500 m / 45 m | Estimates carried from Tacloban. |
| Dulag runway heading | North–south | Assumption pending a period source. |
| Chocked-aircraft bound | 0.5 m in 60 s | Measurement tolerance, now pinned; observed 0.0000 m. |
| Ship mesh draft / superstructure | 8.5 m carrier; 4 m destroyer; simple box dimensions | Visual estimates only; no collision uses them yet. |
| Escort formation | 300 m diagonal (±212 m in each local world axis) | Water-checked choice. |

Published Essex and Fletcher dimensions and maximum speeds remain cited in the
ship content records; they are not estimates.

## Traps worth preserving

- Work directly in the served nexus checkout on `main`; the local Windows
  checkout is not the served tree.
- A World impact is per aircraft. Do not restore the old world-wide impact
  hold in `advance`: the player’s hold belongs in `nextFrameState`.
- The entity soak settles parked aircraft from terrain before stepping them;
  importing `render/` to borrow that behavior would break the simulation
  boundary.
- Tier 2 requires the Windows console Playwright server and the nexus control
  tunnel. A `net::ERR_QUIC_PROTOCOL_ERROR` at `page.goto` was transient here;
  rerun the affected case before treating it as a renderer result.
- The carrier and escorts are intentionally at mean sea level through waves.
  There is no deck, wake coupling, or ship-water physics yet.

## What comes next, and what is not done

The design’s §9 owns the seams. Plan 8 adds a moving deck and carrier/airfield
operations; Plan 7 adds pilots for non-player aircraft; Plan 6 adds combat and
damage; Plan 14 consumes scenarios and airfields for the map; Plan 9 consumes
them for the meta-game. Ships have no collision or deck surface, hulls are
class-shaped procedural meshes rather than historical models, the wingman is
parked rather than AI-flown, and ships have class ids rather than hull names.
None of those omissions is hidden by the acceptance tests.

Plan 13d no longer owns airfield placement. `content/bases/` is the source of
airfield records and its runway/airfield builders already take those records;
13d may decorate the bases but must not invent a parallel places-file key.

## Commits

- `a02f8d3` through `7c14356`: ships, airfields, scenarios, generalized
  world/frame/landing behavior, and rendering.
- `7ff9730`: entity soak.
- `f6cdc1d`: reference-GPU acceptance.

Production remains undeployed. Pushing `main` does not publish it; deployment
is Mark’s explicit `deploy.yml` decision.
