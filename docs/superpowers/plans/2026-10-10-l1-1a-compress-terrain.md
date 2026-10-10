# L1.1a: ship the terrain pyramid gzipped

**Status (2026-10-10):** built on branch, not merged; see the handoff `docs/handoff/2026-10-10-l1-1a-compress-terrain.md`. Deviation: the time-to-ready runs used `NODE_ENV=development` builds on a static server, since `__ww2` exists only in DEV builds.
**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode:** unattended, to completion.
**Location:** a worktree, branch `worktree-agent-a68ca0498b75ba211`. Not merged to `main` by this run.
**Heavy jobs:** tsc, eslint, vitest and `npm run verify` on ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run ...`). GPU runs on the ryzen Playwright server against a dev slot, held only while running.
**Deploying** is Mark's call. Production would need the new `deploy.yml` smoke check (below) to pass.

## What was asked

MASTER_PLAN Track L, L1 item 1a: compress L0 and L1 the way `cover.bin.gz` is compressed (L1.1 handoff, ruling 4). Also consider the other levels the loader fetches.

## What is in the code (read 2026-10-10)

| Fact | Where |
| --- | --- |
| `cover.bin.gz` and the sky volumes are written with `gzipSync(data, { level: 9 })`, fetched as-is and inflated by `inflateIfGzipped`, which decides by the gzip magic bytes, not by the response header. | `tools/landcover/build.ts`, `src/render/gunzip.ts` |
| Vite's dev server sends a `.gz` with `Content-Encoding: gzip`, so the browser has already inflated it; production nginx sends the raw bytes as `application/octet-stream` with no encoding header (`curl` of `cover.bin.gz` on `ww2airsim.marktuttle.dev`, 2026-10-10). `inflateIfGzipped` is right on both. | `src/render/gunzip.ts` |
| The browser fetches L8 down to L1 (Low) or L0 (Medium and up), one request per level, in `loadTerrainProgressively`. | `src/render/terrain/load.ts` |
| The Node side (`loadTerrainLevel`, `hasRealLevelFile`) reads the same files from disk; the headless suite's ground truth is L1. | `tools/terrain/load.ts` |
| Only L0 is in Git LFS; CI checks out without LFS and skips L0-only checks by `hasRealLevelFile`. `deploy.yml` checks out with LFS and curls `L0.bin` and `L4.bin` after a release. | `.gitattributes`, `.github/workflows/*.yml` |

## Measured (Node `zlib` on nexus, 2026-10-10)

| Level | Raw bytes | gzip -9 bytes | Inflate time (Node) |
| --- | --- | --- | --- |
| L0 | 134,250,498 | 36,794,066 | 365 ms |
| L1 | 33,570,818 | 9,477,073 | 88 ms |
| L2 | 8,396,802 | 2,425,600 | 20 ms |
| L3 | 2,101,250 | 624,722 | 4 ms |
| L4 to L8 | 702,346 | 223,918 | 1 ms |
| L9 to L12 | 808 | 711 | 0 |

Level 6 is within 0.3% of level 9 (L0: 36,829,566). Level 9 is used, as for `cover.bin.gz`.

## Decisions

1. **Every level, one rule.** `L<n>.bin` becomes `L<n>.bin.gz` for all 13 levels. L2 and L3 save another 7.4 MB at Low, and one path rule has no per-level branch. L9 to L12 grow by up to 20 bytes each; nothing fetches them.
2. **L0.bin.gz stays in Git LFS.** At 37 MB it would fit in plain git, but then every L0 rebuild adds 37 MB to history forever, and CI would start running the L0-only tests (a behavior change outside this item). Ruling for Mark if he wants it otherwise.
3. **The pinned SHA-256s stay on the inflated bytes.** The existing digests do not change, which proves the content did not. A `.gz` digest would move with the zlib version (`skyNoise.test.ts` says the same).
4. **`hasRealLevelFile` checks for the gzip magic** instead of the raw length: an LFS pointer is text.

## Tasks

1. Build: `tools/terrain/build.ts` writes `gzipSync(bytes, { level: 9 })`; `terrainLevelPath` (both twins) returns `L<n>.bin.gz`. Convert the 13 committed files with the same call (rebuilding from the source tiles must give the same inflated digests; checked by `terrainBuild.test.ts` when the cache is present).
2. Loaders: the browser inflates with `inflateIfGzipped` before `decodeLevel`; Node inflates with `gunzipSync` before the length check. `hasRealLevelFile` reads the magic.
3. `.gitattributes`: LFS for `L0.bin.gz`. Remove the old `.bin` files.
4. Tests: `dist.test.ts` byte pins move to the `.gz` sizes; `terrainLoad.test.ts`'s disk fetch mock and path checks; `terrainBuild.test.ts` hashes the inflated bytes. A loader test that a gzipped level and an already-inflated one (the dev server) decode to the same samples, seen to fail without the inflate.
5. `deploy.yml`: smoke-check `L0.bin.gz` and `L4.bin.gz`. Comments in `ci.yml`, `nightly-soak.yml`, docs and code that name `L0.bin` are updated.
6. Measure before and after (the L1.1 tool `terrainMemoryCapture.spec.ts`, `TERRAIN_TIER=low|medium`): bytes fetched, seconds to the physics field, JS heap; and the browser's inflate time per level through `DecompressionStream`, served the way production serves it (raw bytes, no `Content-Encoding`).
7. `npm run verify` on ryzen; `adapter.spec.ts` and `terrain.spec.ts` (budget excluded) on the reference GPU.
8. Handoff, MASTER_PLAN status line, email.
