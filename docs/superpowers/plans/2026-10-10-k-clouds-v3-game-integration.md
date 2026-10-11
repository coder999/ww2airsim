# K Clouds v3 — game integration plan

**Date:** 2026-10-10

**Branch/worktree:** `clouds-v2-blender-lod` in `/home/mark/projects/ww2airsim-clouds-v2`

**Run:** unattended overnight

**Viewing checkpoint:** final product only; collect game-flight captures and measurements in the handoff for Mark to review in the morning

**Delivery:** an opt-in flyable game URL, a clean committed branch, and the Codex share link
**Not in this slice:** thunderheads, a production deployment, or replacing the shipping default

## Goal

Put the accepted Takram native-WebGPU plain clouds into the actual game without repeating the rejected incremental work on the old cloud renderer. The old renderer remains the default and fallback. A DEV query selects the new renderer so Mark can fly it in the complete Leyte scene before deciding whether it should become the default.

The accepted visual baseline is commit `b04fcbcb`: a 1/6-resolution ray march, 2×3 temporal reconstruction, continuous deterministic weather tiles, averaged shape mips, and a broad conditional soft edge. Mark accepted the remaining soft-looking cloud core as a known tradeoff and asked to move on.

## Architecture

The game already renders its scene into HDR color plus depth, then runs effects, clouds, anti-aliasing, bloom, tone mapping, and output. The Takram spike already owns a native `GPUDevice` pipeline. The integration adds one frame-graph node that:

1. waits for the existing scene color/depth pass;
2. renders the accepted 1/6 cloud samples with the same WGSL and assets;
3. temporally reconstructs full-resolution cloud radiance, opacity, and representative depth;
4. composites clouds over the game's HDR scene only when cloud depth is in front of scene depth;
5. hands the result to the existing TRAA, bloom, exposure, and AgX output chain.

This is deliberately a narrow bridge, not a rewrite of the accepted shader into TSL. It follows the repository's proven native-device bridge used by the FFT ocean: Three allocates the textures, native WebGPU writes them, and Three samples the same resources later in queue order.

## Tasks

### 1. Pin the opt-in and asset contract

- Add `?cloudRenderer=takram`; absent means the current renderer.
- Reject unknown values in DEV like the other renderer query parsers.
- Promote the accepted weather, shape mip chain, detail, turbulence, and STBN inputs under `content/clouds/takram/` so both dev and production builds carry them.
- Keep Takram source commit and MIT provenance in `ASSETS.md` and the standing cloud reference.

### 2. Add the native Takram frame-graph pass

- Add a `TempNode`-shaped pass whose dependency is the existing scene color/depth.
- Allocate low-resolution current data, ping-pong full-resolution history, and a full-resolution HDR composite through Three, then obtain their native GPU textures through the same backend bridge as the ocean.
- Resize and invalidate history when the drawing buffer changes.
- Dispose every Three and native resource owned by the pass.

### 3. Preserve the accepted cloud model

- Port the accepted `b04fcbcb` density, weather tiling, mip filtering, lighting, jitter, 2×3 temporal schedule, and broad conditional edge feather without retuning.
- Output cloud radiance/opacity separately from the spike's stand-alone sky so the game's atmosphere remains authoritative.
- Carry representative cloud depth separately so temporal reprojection and scene occlusion do not compete for one channel.

### 4. Wire game state

- Feed the real world-space eye, camera basis and field of view every rendered frame.
- Feed the real sun direction, simulation time, and scenario cumulus coverage.
- Reset Takram history at the same teleport, pause, camera-cut, restart, and scenario-switch seams as the existing cloud history.
- Keep existing cloud shadows for this first integration; they already follow scenario weather and are much cheaper than adding Takram shadowing in this slice.

### 5. Preserve fallback and diagnostics

- Route the current `createCloudPass` when the query is absent and the Takram pass only when requested.
- Keep `?cloudTier=off`, clear-sky routing, quality settings, effects ordering, and scenario weather switching functional.
- Extend `__ww2.clouds()` with the selected renderer so browser checks can prove which path is active.
- On an asset or pipeline failure, record a validation error and leave the old renderer available by removing the opt-in query.

### 6. Correctness checks

- Unit-test query parsing and the accepted 2×3 schedule/target sizing where the seam is pure.
- Run the touched render tests, typecheck, lint, and dependency checks through Ryzen.
- Run the full `npm run verify` gate through `remote-run` after integration.

### 7. Fly and measure on Ryzen

- Use the existing slot-2 server and shared Playwright tunnel.
- Run a real flight in cockpit and chase views through the cloud deck, including a hard turn and a near/far transition.
- Assert zero WebGPU validation errors and that diagnostics report `takram`.
- Capture the final checkpoint for the handoff.
- Under `hwlock ryzen-budget`, record 2560×1440 High GPU p95 with the new pass. The hard cloud allowance remains ≤ 4.0 ms p95; the complete High frame should remain within the Track H gate where the chosen view has an enrolled gate.

### 8. Document and commit the overnight result

- Update `docs/clouds.md` with the opt-in, integration architecture, measurements, the accepted soft-core limitation, and remaining work.
- Add a dated handoff with captures, commands, results, and exact URL.
- Update Track K in `MASTER_PLAN.md` only to the achieved status.
- Commit logical slices and leave the worktree clean. Do not deploy or flip the default.

## Acceptance

- `https://ww2airsim-2.windomlane.org/` returns HTTP 200 and the delivered query launches the complete game with Takram clouds.
- The airplane is flyable in cockpit and chase view; terrain, airplane, cockpit, effects, and the horizon occlude clouds correctly.
- New-cloud history resets cleanly through camera cuts and a hard maneuver, with no WebGPU validation errors.
- The old cloud renderer remains the no-query default.
- The full deterministic gate passes and the Ryzen GPU measurements are recorded.
- The branch is committed and clean; production is unchanged.

## Known accepted limitation

The broad edge reconstruction that removed objectionable pixelation also makes dense cloud centers look slightly out of focus. Mark accepted that as serviceable on 2026-10-10. This integration preserves the accepted image rather than reopening edge tuning; later work may separate edge-only confidence from dense-core reconstruction after the game flight is evaluated.
