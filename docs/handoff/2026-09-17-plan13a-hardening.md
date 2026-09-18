# Plan 13a — hardening Codex's surface-detail pass

Bounded work, no plan document (Mark's call, 2026-09-17). Everything here
was measured on the reference desktop (RX 6700 XT, Playwright 1.63
Chromium, headed, 2560x1440 for budget numbers) through the tunnel loop in
`README.md`'s Tier 2 section. Commits `942f1f9..6dea59b` on `main`, plus
`8776183` (specs) and `d4639fc` (credit).

## What was wrong with daa1b39, and what was done

| Finding | Evidence | Fix |
| --- | --- | --- |
| **The trees never drew.** Both tree materials failed pipeline creation: "An error occurred while generating Tint IR". three surfaces that only on the console; the app's own error list showed just the downstream "invalid due to a previous error" entries, so Tier 2 failed 11 of 24 specs and Codex's in-app inspection saw nothing. | Single-variable probe: removing `alphaHash: true` alone took a parked sweep from 8 validation errors to 0. three r186's alpha hash takes dFdx/dFdy of the position and then discards; the terrain's derivative-free `Discard` compiles. | Per-instance dissolve: `alphaTestNode = hash(instanceIndex)` against the distance fade, opaque pipeline. Guard test in `tests/render/scenery.test.ts`. (`942f1f9`) |
| **The GPU frame at 1440p went from 3.15 ms to 11.3 ms**, past the 8.33 ms a 120 Hz frame allows. | Bisected in a throwaway worktree served on port 5183 through the reverse tunnel, one variable at a time, trees off: anisotropy 8 on the 256-texel detail texture, sampled nine times per fragment, was 8.98 ms against 3.80 at anisotropy 1 (4.72 at 2, 7.21 at 4). River mask 0.1 ms, noise lookups 0.5 ms. Screenshots down the runway at 8 and at 1 are indistinguishable. | Anisotropy removed. Guard test carries the table. (`455ea72`) |
| **The app's GPU sampler was reporting noise**, so neither the budget test nor the one-time ocean tier choice could see any of the above. | Once a frame is heavy enough that a timestamp resolve outlives it, three's pool hands the next frame the same query slots: a strict alternation of 6.0 / 1.6 ms where the serialized truth was a flat 6.03, and a two-frame sample reading 2.0 ms. Sample-to-frame ratio had dropped from 0.99 to 0.65. | While samples are wanted (first `FRAME_TIME_CAPACITY` frames after boot or a reset), a frame renders only after the previous resolve has landed. Pre-scenery main reads 1.84 ms either way. Production never tracks timestamps. (`455ea72`, comment in `main.ts`) |
| **Every 400 m cell crossing recomposed all 26,620 instance matrices twice**: 4.7–7.2 ms of main-thread time per crossing in node, about one 120 Hz frame. The 11x11 window's corner cells sat 1.8–2.3 km out, past the 1,850 m dissolve end, drawing only discarded fragments. | Micro-benchmark in vitest; the fade geometry. | Resident cells are a disc (69 cells), each cell's instances are packed once and copied on later visits; a crossing composes only the cells that entered. Crossings 1.4–2.3 ms. (`d0ddd04`) |
| **No quality tiering.** | The trees are the scenery's one GPU-scalable cost, 1.1 ms of a 4.9 ms frame. | `src/render/scene/tiers.ts`, keyed by the ocean tier the app already chooses: dissolve to 1,200 m on medium, no trees on low. (`6dea59b`) |
| **Budget** `GPU_BUDGET_P95_MS` was 3.5 ms, a tripwire sized for the bare terrain. | Serialized, this spawn, 1440p: pre-scenery 3.15 / 3.28; + materials, river mask, airfield 3.80 / 3.87; + trees 4.92 / 5.05 p95. | Re-derived to 6.0 ms with the table in `tests/e2e/terrain.spec.ts`. (`3644347`) |
| **OSM credit as a play-screen watermark**, which Mark had not authorized. | ODbL still requires attribution for `content/scenery/rivers.json`. | Moved into the `/` controls panel as a credits line; dist test asserts the play screen has none. (`d4639fc`) |
| Stale axis claims after the handedness flip: the master spec's Tacloban coordinate, the terrain design's "no trees, buildings, roads", the ground-handling design's coordinate. | Grep. | Dated amendments; Plan 13 split into 13a–13d in the roadmap table. (`8776183`) |

## Final state

- `npm run verify`: exit 0, 933 passed, 1 skipped.
- Tier 2, full suite: 23 of 24, the 24th `net::ERR_QUIC_PROTOCOL_ERROR` at
  `page.goto` (the transport flake in the 2026-09-17 session handoff),
  passed on re-run.
- Budget test: gpu p50 4.981 ms, p95 5.046 ms over 301 samples at 1440p.
- Production is still on `549e272`. Nothing here is deployed.

## How the numbers were taken, so they can be taken again

A throwaway `git worktree` at any commit, `node_modules` symlinked, `vite
--port 5183`, `ssh -f -N -R 5183:localhost:5183 ryzen`, and the probe
run with `PW_BASE_URL=http://localhost:5183`. Edits in that worktree are
the experiment; the served copy is never touched. To serialize sampling
there before `455ea72`, insert `if (gpuResolvePending) return` ahead of
`renderer.render`. Kill the vite with an anchored pattern
(`pgrep -f '^[^ ]*node[^ ]* [^ ]*vite --port 5183'`): a bare
`pkill -f 'vite --port 5183'` matches the shell that runs it.

## Not done, on purpose

- No `?trees=0`-style DEV overrides: the worktree bisect above attributes
  cost without them, and they would be one more thing to keep out of the
  production bundle.
- The river mask (4096², 16 MiB CPU + ~22 MiB GPU) is untiered: 0.1 ms.
- The 70 ms cold build of the forest when terrain first arrives is one
  frame at boot, left alone.
