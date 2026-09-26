# Cloud VDB fidelity: restore `coverage` as sky fraction

**Date:** 2026-09-26 · **Branch:** `worktree-cloud-vdb-fidelity` (worktree
`.codex/worktrees/cloud-vdb-fidelity`, dev slot `ww2airsim-2.windomlane.org`)
**Decision (Mark, 2026-09-26):** restore the sky-fraction meaning of a
scenario layer's `coverage`, rather than accepting the sparse look or parking the branch.

## Where the branch stands

| Commit | What |
| --- | --- |
| `a0ed535` | Codex's stacked-lobe cumulus archetype carved per weather cell, plus the in-repo generator `tools/sky/cumulus.py` (provenance closed: procedural, numpy seed 7, no third-party data) |
| `4d374af` | Half-resolution archetype and no shape read where the archetype is empty |

4K p95 on the reference GPU, same session (2026-09-26):

| View | main (pre-VDB) Medium | `a0ed535` Medium | `4d374af` Medium | budget |
| --- | --- | --- | --- | --- |
| deckquals | 7.10 | 9.92 | 7.51 | 8.33 |
| sunset | 7.24 | 9.43 | 7.34 | 8.33 |
| under-deck-1200 | 6.71 | 8.24 | 6.88 | 8.33 |

High at `a0ed535`: 12.7–16.64 ms against 16.67. It has not been re-measured since `4d374af`.

## The problem

The scenario schema says a layer "covers `coverage` of the sky"
(`src/sim/scenario.ts`). The VDB branch replaced the quantile table with
`strength >= 1 - coverage`. On a CPU twin of the shader
(archetype footprint, the shader's decode, rotation and scale):

| `coverage` | 0.20 | 0.35 | 0.45 | 0.55 | ≥ 0.70 |
| --- | --- | --- | --- | --- | --- |
| sky fraction now | 0.025 | 0.093 | 0.150 | 0.210 | 0.245 |

The ceiling of 0.245 is geometric: 1500 m cells, 330–950 m radii, and an
archetype whose footprint fills 39% of its box. A threshold table alone
cannot reach free-flight's 0.45 or deck-quals' 0.55.

## Design

A synthetic study (`/tmp/vdbcov/study*.py`, random clouds with the map's
distributions) gave these numbers:

| Cell spacing | Radius scale | Union sky fraction | Area cut, winner only | Area cut, winner + runner-up |
| --- | --- | --- | --- | --- |
| 1200 m | 1.0 | 0.33 | 3.1% | 0.07% |
| 1200 m | 1.25 | 0.50 | 7.1% | 0.57% |
| 1200 m | 1.5 | 0.65 | 9.5% | 1.26% |

"Cut" is cloud area deleted because a texel belongs to a stronger
neighbor. On screen it shows as flat vertical walls.

1. **Denser map:** `WEATHER_CELL_SPACING_M` 1500 → 1200. Reach stays 2
   cells (2 × 950 m ≤ 2 × 1200 m).
2. **Runner-up map:** a second RGBA8 map, `weather2.bin.gz`, in the same
   encoding (strength, center X/Z, radius), holding each texel's
   second-strongest bump. Where no second bump reaches, strength is 0. The
   shader reads both archetypes and keeps the denser one. The shape and
   detail reads stay single.
3. **Coverage drives size and count:** radius scale
   `1 + 0.5·smoothstep(0.3, 0.7, coverage)`, so broken decks are bigger,
   merged cells. The strength threshold then comes from a 33-entry
   coverage → threshold table, computed at load by a TypeScript twin of the
   footprint test (replacing `coverageThresholds`). That puts the projected
   sky fraction at `coverage` wherever it is reachable.
4. **Unreachable coverage is clamped and says so:** the table's top entry is
   the maximum reachable fraction. A unit test pins that it is at least 0.60
   (deck-quals needs 0.55).

## Acceptance

- Vitest: the twin's sky fraction is within ±0.02 of `coverage` for
  0.1–0.6 on the committed maps. The runner-up is never the winner. The
  maps' SHA-256 values are pinned.
- GPU, 1440p captures of free-flight views: `coverage.py` fractions back
  within the Cloud Fidelity II ±20% band (above-deck 0.70 at §3.4). No
  visible vertical cut walls in in-deck and above-deck captures (read,
  not asserted).
- 4K budget suite: Medium ≤ 8.33 and High ≤ 16.67 on every view. If
  Medium fails, the first lever is High/Medium `cumulusSteps`, not the
  design.
- `npm run verify` rc=0.

## Not in scope

Merging to `main` (Mark's call). High's update period (Codex's 16 → 8)
stays, since High passes. The "faint horizontal streaks" item gets
re-checked after step 3, because `4d374af` removed one haze source.
