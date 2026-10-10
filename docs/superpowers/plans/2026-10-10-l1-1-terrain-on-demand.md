# L1.1: terrain on demand, then Medium by default

**Status (2026-10-10):** merged to `main` (d3ae825a); see the handoff. Deviations from the plan below: the window is 1025 samples, not 513 (the measured reach was 256 samples, not 128; the first sweep used L1's spacing for L0), and the headless suite's ground truth stays on L1 (`GROUND_TRUTH_TIER`, handoff ruling 1). Master plan item: Track L, L1 item 1. Handoff: `docs/handoff/2026-10-10-l1-1-terrain-on-demand.md`.
**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode:** unattended.
**Location:** a worktree, branch `worktree-agent-ad00fe23fe9031a4f`. Not merged to `main` by this run; the parent session reviews and merges.
**Heavy jobs:** tests, typecheck, lint and `npm run verify` go to ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run ...`); GPU runs use the ryzen Playwright server against slot `ww2airsim-2.windomlane.org` (port 5175); budget specs only under `hwlock ryzen-budget`.
**Deploying** is Mark's call. This plan changes what a first-time player downloads; the handoff records the size.

## What was asked

MASTER_PLAN L1 item 1: "On-demand terrain level allocation, then the default Asset Quality moves to `medium`." Mark's 2026-09-27 ruling, deferred until the memory problem was fixed (`docs/handoff/2026-09-24-plan-ui-realism.md`, "Deliberate boundaries"; render-quality-selector spec §10 names `medium` as the first-visit default).

## What is in the code (read 2026-10-10)

| Fact | Where | Consequence |
| --- | --- | --- |
| `createTerrainMesh` allocates one whole-world `Float32Array(n²)` `DataTexture` per level from the floor to L8, at construction, for the life of the mesh. | `src/render/terrain/mesh.ts` | At an L0 floor that is 358,043,428 bytes of height texture (L0 alone 268,500,996), held twice: the CPU array three keeps, and the GPU copy. From L1 it is 89,542,432. |
| Uploading the whole L0 texture needs a 270.6 MB staging buffer and a texture edge of 8193, past WebGPU's default limits; `requiredDeviceLimits` raises both. | `src/render/renderer.ts` | A windowed L0 needs neither. |
| Ring k samples level k (fine tap) and k+1 (coarse tap). Swept with `selectNodes` over the whole world at a 0.8 mi (1,250 m) camera grid: no patch that reads level L reaches farther than **128 level-L samples** from the camera, for L0 to L5 (L6: 64, L7: 32). | `src/render/terrain/lod.ts` | A ring only ever needs a fixed-size neighborhood of each level around the camera (the clipmap property). L0's 128 samples is 2.0 mi. |
| The ocean reads the finest level's texture over the whole world for its shoreline wave fade, and the DEV `__ww2.oceanLandWeight` reads the same texture's CPU data. | `src/render/ocean/mesh.ts` (`depthNode`, `landWeightAt`), `src/render/main.ts` (3 call sites of `terrain.levelTexture(finestFetchedLevel)`) | The ocean needs a whole-world texture. It cannot be handed a window. |
| The physics takes the finest level's decoded `Int16Array` (`physicsFieldFor`) and keeps it. The mesh receives the same array object. | `src/render/terrain/load.ts` | A window can be refilled from that array at no extra memory. |
| `INTERIM_ASSET_QUALITY_TIER` is the first-visit default AND the "ground truth level" several tests measure against (`terrainLoad`, `geography`, `cloudShadow`, `strike.spec`, `dist`). | `src/render/fetchedLevel.ts` | Flipping it moves those tests to L0. CI checks out without LFS, so any of them reading L0 must skip by name on an LFS pointer (`hasRealLevelFile`), as `dist.test.ts` already does. |
| E2E `waitForTerrain` waits 30 s for the physics field; the adapter spec notes L0 through the tunnel outlasts that. | `tests/e2e/harness.ts` | Measure the time to ready at Medium; size the wait from that. |

## Design

**Window every level finer than L1** (today: L0 only). A windowed level gets a 513 × 513 texture (1,052,676 bytes) centered on the camera instead of the whole 8193 × 8193 grid:

- `setLevel` keeps a reference to the decoded `Int16Array` (the same one physics holds) and fills the window from it.
- `update(cameraX, cameraZ)` recenters a window when the samples the rings need (128 + 1 for the bilinear tap, plus slack) would leave it, refills it and bumps `needsUpdate`, and writes the window origin to a uniform. Texture and uniform change in the same frame.
- `sampleField` subtracts that origin from the texel index (and clamps into the window). Whole levels pass no origin and are unchanged.
- At a 513 window the camera can move 127 samples (about 1.9 mi) before a recenter, which converts 263,169 samples (about 1 MB). At 400 mph that is one refill every 17 s.
- `levelTexture(level)` keeps returning whole-world textures and throws for a windowed level; a new `wholeLevel` property names the finest whole level, and `main.ts`'s three ocean call sites use it (a one-token change each). So the ocean at Medium reads L1, as it does at Low today.

L1 stays whole on purpose: it is Low's floor and the ocean's shoreline grid. Windowing it too would save another 67 MB but coarsen the ocean's shoreline to L2 (about 320 ft posts): a visible change, so not taken unasked.

**Then flip `INTERIM_ASSET_QUALITY_TIER` to `'medium'`** and rename nothing (the constant name is referenced across the tree; the comment changes). Tests that read the ground-truth level from disk get the `hasRealLevelFile` skip guard. E2E `waitForTerrain`'s timeout is sized from the measured Medium time to ready.

Expected height-texture bytes at Medium: 89,542,432 + 1,052,676 = **90,595,108**, against 358,043,428 today.

## Tasks

1. **Baseline (before any code change).** On ryzen's RX 6700 XT at 2560 × 1440, against this worktree on slot 2, at Low and at Medium: bytes transferred, time from navigation to the physics field (`__ww2.groundHeightM() !== null`), Chrome's JS heap (`performance.memory`), and the Playwright Chrome GPU process's dedicated GPU memory (Windows counter `\GPU Process Memory(pid_*)\Dedicated Usage`). A capture spec (`tests/e2e/terrainMemoryCapture.spec.ts`, `E2E_CAPTURE=1`) records them, so the after run is the same instrument. Also: the L0 download from production (`ww2airsim.marktuttle.dev`) with `curl` from nexus, for a real-internet time.
2. **Window the fine levels** in `mesh.ts` as above. Unit tests (`tests/render/terrainLoad.test.ts`): the height-texture byte total at L0 and L1 floors; the window holds the source's samples, in meters, at its origin; and, over a sweep of camera positions, every patch's footprint for every level it reads lies inside that level's window after `update`. This last one must fail if the reach constant is too small (checked by shrinking it once).
3. **Hand the ocean the whole level** (`main.ts`, three call sites).
4. **Flip the default** and guard the tests that read L0 from disk. Update the stale comments that cite the 358 MB reason (`fetchedLevel.ts`, `bootQuality.ts`, `mesh.ts`, `lod.ts`, `renderer.ts`, `ci.yml`).
5. **After.** Same capture as task 1. Then on the reference GPU: `adapter.spec.ts` (Medium boots, zero validation errors), `terrain.spec.ts` (the camera sweep crosses many window recenters), and `budget.spec.ts` 1440p High, three runs, median, under `hwlock ryzen-budget`, with ryzen CPU and GPU checked idle first (runs under load discarded and said so).
6. **Verify** with `npm run verify` on ryzen, gated on its exit status.
7. **Docs.** Handoff with the before/after table and captures; MASTER_PLAN L1 item 1 status line; `docs/terrain.md` gains a short "Height textures" note pointing at `mesh.ts`; `docs/testing.md` lists the new capture spec. Email the handoff.

## Rulings for Mark (taken conservatively; record in the handoff)

- L1 stays whole (above). The alternative, windowing L1 too, is a one-constant change.
- The physics still waits for the finest level, so at Medium the game is not ready until L0 (134 MB) has arrived. Letting the physics fly L1 until L0 lands is a separate change with its own risk (a coarse field can register a false impact; `load.ts`'s `physicsFieldFor`) and is not made here.
