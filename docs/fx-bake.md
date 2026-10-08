# Baking the effects flipbooks

How `content/fx/` is made. The six sheets (`smoke`, `dust`, `fireball`, `flame`,
`water-column`, `spray`) are Mantaflow sims rendered in Cycles, then packed into
KTX2 atlases. Plan: `docs/superpowers/plans/2026-09-27-e2-baked-flipbooks.md`.
Last full bake: `docs/handoff/2026-09-28-e2-flipbooks.md`.

## What runs where

- **The bake (sim + render) runs in Blender**, the blender.org 5.0.1 build, which is
  plain `blender` on both machines (`serverconfig/ryzen.md`, "Blender: the
  blender.org build"; Ruling R1). The Ubuntu package drew Mantaflow grids as
  nothing in Cycles. `tools/fx/blender/probe.py` re-proves the grid path before
  every bake, and `tools/fx/remote.ts` refuses any other version.
- **By default it runs on ryzen** over SSH + WSL. `FX_BAKE_HOST=local` runs the
  same script on this machine instead. On nexus that goes through the
  `hwlock blender` shim. Frames stage in `~/fxbake-local/<checkout>/`.
  Both hosts can bake different sheets at once.
- **Take `hwlock -s ryzen`** around a ryzen bake, so it never overlaps an
  exclusive E2E budget measurement: `hwlock -s ryzen npx tsx tools/fx/render.ts smoke`.
- **The pack runs on nexus** (`nice -n 10`). It is CPU-light, and all it
  needs is the frames.

## Commands

| command | what it does |
| --- | --- |
| `npm run fx:render [sheet ...]` | bakes and renders each sheet into `tools/fx/renders/<sheet>/`: 6 lit passes (+ `emit`) × 64 frames (72 for `flame`), 256 px, 16-bit PNG, plus `meta.json` |
| `npx tsx tools/fx/bake.ts --check <sheet>` | measures one sheet against its acceptance rules and prints the metrics; exits non-zero on a failure |
| `npm run fx:pack` | packs all six into `content/fx/` (the size ladder, KTX2, `sheets.json`) and writes `tools/fx/bake-report.json` |
| `npm run fx:bake` | render, then pack |

Trial knobs for `render.ts` (a real bake leaves them unset): `FX_FRAMES`,
`FX_CELL`, `FX_SAMPLES`, `FX_SIM_SCALE`. They are documented in the header of
`tools/fx/render.ts`. `FX_VARIANT=gas` bakes `<sheet>-gas.py` into
`renders/<sheet>-gas/` for comparison only. `fx:pack` refuses to run while it is set.

Judge `--check` only at full settings. Cheap trials predict fill and shape,
but not six-way margins or clipping (ledger, Task 5b).

## Where frames land

`tools/fx/renders/` is gitignored and deliberately outside
`tools/**/cache/`, because `remote-run` mirrors cache paths to ryzen and ~0.5 GB of
16-bit frames does not belong there (Ruling R10). A full set is kept until the next
bake, so `fx:pack` and `--check` can re-run without re-rendering.

## Bakes are not reproducible

Mantaflow takes no seed, and two identical bakes differ (Ruling R2). So a bake is
committed with provenance and never rebuilt to compare bytes. `sheets.json` records
the Blender build and `sceneSha256`, the hash over the **raw bytes** of
`tools/fx/blender/*.py` (`tools/fx/sceneHash.ts`), and `tests/tools/fxSheets.test.ts`
fails if a script changes without a rebake. **Even a comment edit to a script means
rebaking all six sheets**, about 45 min across both hosts. Batch script edits before
a bake.

## Acceptance and the ladder

- The per-sheet rules (fill, edge alpha, peak coverage, six-way lighting,
  which sheets may emit and for how long, the water column's aspect, the
  flame's loop seam) are `acceptance` in `tools/fx/pack.ts`. Read them there.
- The pack ships the first rung of `LADDER` (`tools/fx/pack.ts`, Ruling R5)
  whose `content/fx/` total fits `FX_CONTENT_BYTES_MAX`. E2 shipped the top
  rung.
- Lit passes are normalized per sheet to the 99.9th percentile (Ruling R6).
  Absolute exposure therefore changes nothing, and the catalog's `tint` sets
  color and brightness. On the liquid water sheets the back-lit pass sets that
  scale. That is why `WATER_GAIN` in `src/render/fx/catalog.ts` exists.

## Traps

- **Mantaflow's VDB index space starts at the domain's minimum corner.**
  `rig.py` moves the volume object there. Without that, a puff draws offset by
  half the domain.
- **Never stage anything in `/tmp` on ryzen.** WSL wipes it when the distro
  idles out (`serverconfig/ryzen.md`). `tests/tools/fxRemote.test.ts`
  asserts the remote script never mentions it.
- **EEVEE is not an option.** On ryzen it rendered at 13 s a frame through
  software EGL with the apt build, and the blender.org build segfaults on exit.
  The rig is Cycles only.
- **`rsync` is spawned without a shell**, so a literal `~` in a local path
  becomes a directory named `~` in the worktree. `localRsyncArgs` throws on one.
- **Clipping:** measure it on the raw PNGs, not after `litK` scaling. The
  2026-09-28 batch measured 0–0.2% on every lit pass and ≤ 0.5% emission
  (handoff). The Task 5/5b figures quoted in `rig.py`'s `SUN_STRENGTH` comment
  predate that and are stale. Fix the comment at the next rebake, not before
  (see "Bakes are not reproducible").
