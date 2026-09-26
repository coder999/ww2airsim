# H2 handoff: the Hangar's full articulation bench (2026-09-26)

H2 finishes the Hangar's test bench (Hangar spec §8). It adds:

- bombs and rockets toggles
- a **Cycle** button for gear and flaps that runs the sim's own transit
- pivot gizmos on every node the bench moves
- wireframe
- a turntable switch
- a triangle and draw-call readout against each model's manifest budget, which turns red when over

It also adds [`docs/models.md`](../models.md), the one runbook for ingesting a
third-party model, with a pointer to it in CLAUDE.md. The work was done on
`main`, in place (Mark, 2026-09-26), in commits `2125714`..this handoff's,
on top of the plan (`4909a41`). The plan is
[`2026-09-26-h2-hangar-bench.md`](../superpowers/plans/2026-09-26-h2-hangar-bench.md);
the design is [`2026-09-25-hangar-library-design.md`](../superpowers/specs/2026-09-25-hangar-library-design.md).

Two of the spec's six H2 items were already done before H2 started: aircraft
through `Airframe.parts` (H1) and ships through the ship-model loader (S1).

## Tier 1

`remote-run npm run verify` at `rc=0`: 2,245 passed, 1 skipped, in 217 files.
New or extended: `tests/render/hangar/budgets.test.ts`, `benchController.test.ts`,
`stage.test.ts`, `models.test.ts`, and `tests/render/modelCache.test.ts`.

## Reference-GPU Tier 2

`tests/e2e/hangar.spec.ts` ran **12/12** on the RX 6700 XT (11 before the final review's fix, below) against the primary
slot. The Hangar page has no clouds or terrain, so the game page's slow cloud
shader compile (see the S1 handoff) does not touch it.

| Check | Measured |
| --- | --- |
| 6. Stores on vs off (front) | 11.51% of the mask (F4F, and the F6F, which draws as it), 12.11% (Zero); floor 0.5% |
| 7. Cycle, the real button, over the spec's `gear.travelSeconds` | ends **0 px** from the slider's gear-up pose; 404 px (3.2%) from gear-down |
| 8. Wireframe on vs off | 15.6% (aircraft) to 84.9% (AAA); off after a model round trip is 0.2% or less |
| 9. Wildcat pivot gizmos | `GRP_Rueda_Der`, `GRP_Rueda_Izq`, `Helice`, and they draw |
| 10. Every model inside its manifest budget as drawn | Wildcat 100,886 / 101,000 triangles and **47 / 47** draw calls; CV-6 15,465 / 60,000 and 5 / 8 |

Checks 1–3 and 5, and the layout and Library-button tests, still pass.

## Found and fixed along the way

- **`sceneCounts` overcounted draw calls** (H1). It counted one draw per
  geometry group even under a single material, so a `BoxGeometry` read as
  six draws. three.js splits by group only for a material array. The fix is
  pinned by a `sceneCounts` test. The readout's model numbers now match the
  build's exactly.
- **Wireframe threw a WebGPU error** (`setIndexBuffer: parameter 1 is not of
  type 'GPUBuffer'`) on the reference GPU. three 0.186 uploads the wireframe
  index only when a render object rebuilds, so `applyWireframe` sets
  `material.needsUpdate` whenever it changes the flag.
- **The Turntable box went stale after a drag** (final review). OrbitControls
  stops the turntable on a user drag, and the box stayed checked, so its first
  click did nothing. The stage now reports the drag, and the bench unchecks
  the box. Pinned by a Tier 2 test that drags the canvas.
- **The bench overflowed the 380 px panel.** The Cycle button and "Rockets"
  were clipped off. The rows now wrap.

## Open: the Wildcat's stores are in the wrong place

In the Hangar, the Wildcat's bombs and rockets float detached, below and
behind the left wing. The game's deck-quals capture shows the same: the boxes
and rockets sit behind the tail. `attachStores` places them at
`RACK_OFFSETS` / `RAIL_OFFSETS` in `src/render/scene/stores.ts`. Those offsets
were written for the old procedural Hellcat, and they do not fit the Wildcat
model, which every aircraft now draws. This is not H2's to fix. It is the
first thing the Hangar has caught on its own.

## How it works (what H3 and a new model consume)

- `benchController.ts`: `createBenchController(spec | null)`, `BenchState`,
  and `REST` (gear down, flaps up, stores on). Cycle calls `gearAfter` /
  `flapAfter` from `src/sim/`. A new model gets a fresh controller, so it
  never starts mid-cycle.
- `budgets.ts`: `parseBudgets`, `budgetForUrl`, `countsReport`, `countsText`.
  The page reads `tools/models/entries/*.json` by Vite glob, because
  `manifest.ts` needs `node:fs`. `budgets.test.ts` pins the page's parse to
  `loadModelEntries()`.
- `modelCache.ts` tags every instance root with `userData.modelUrl`, so the
  readout counts glb geometry apart from runtime additions such as stores.
- `models.ts`: `PartSpec.kind` gains `'toggle'`, `PartPose` gains `bombs` and
  `rockets`, and `HangarModel.articulated` lists the nodes
  `probeArticulated` found moving between two poses.
- `stage.ts`: `applyWireframe`, `createGizmos`, `syncGizmos`, and the stage's
  `setWireframe`, `setGizmos` and `setAutoRotate`.
- `bench.ts`: `mountBench(slot, parts, cycleable, debug, handlers)` returns
  `{ sync, setCounts }`.
- `window.__hangar` gains `cycle`, `bench`, `setDebug`, `gizmoNodes` and
  `counts`.

H3 adds turret rows to `bench.ts`, `setTurret` to the ship view, and
Tier 2 check 4.

## Deferred from the final review (minor)

- Pressing Cycle on one part while the other is cycling abandons the first
  part partway: there is one cycle slot. Press it again to finish.
- Tier 2 check 8's wireframe round trip selects models from different
  sources, so it never exercises shared materials (Zero and Wildcat). Node's
  `applyWireframe` test covers that case.
- `sceneCounts` checks each mesh's own `visible`, not its parents'. No
  Hangar model hides a group today.
- A subtree built from two tagged glbs reads "No manifest budget". This is
  not live yet; H3's turret split may make it live.
- `probeArticulated` would miss a propeller whose 0.05 s step is an exact
  multiple of 2π. This is theoretical.

## Traps

- The model cache's clones **share materials**. A material flag set on one
  instance is set on every instance of that URL, and on the cached source.
  `stage.show` applies wireframe explicitly, on or off, to every model it
  shows.
- `probeArticulated` leaves the propeller at an advanced angle. That is
  cosmetic. It restores gear and flaps to rest.
- The budget readout counts only subtrees tagged `userData.modelUrl`. A
  box-fallback ship, or a building, reads "No manifest budget" and is never
  red.
- `AxesHelper` is `LineSegments`, which `disposeMeshTree` skips. Gizmos are
  freed with `AxesHelper.dispose()`.

## Departures from the plan

The ledger's `Ruling:` lines are the record. In short:

- `HangarContent` lives in `library.ts`, not `catalog.ts`.
- `sceneCounts` was fixed (above).
- Gizmos are freed with `AxesHelper.dispose()`.
- `applyWireframe` sets `needsUpdate`.
- Bench rows wrap.
- Tier 2 ran on the primary slot, not `-3`.
