# E2: baked flipbooks, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints: final product only** (Mark, 2026-09-27). The water look is judged here too, because E3 follows E2.

**Attended: no, run unattended** (Mark, 2026-09-27). Task 11's captures go in the handoff for when he is back.

**Where: a worktree.** Branch `worktree-e2-flipbooks` at `../ww2airsim-worktrees/e2-flipbooks`, cut from `main` at or after this plan's commit. Proposed with the plan as parallel work beside 7f, sortie forms and R4, and taken up by Mark's "E2" reply (2026-09-27). The branch may be pushed. Merging into `main`, pushing `main` and deploying are Mark's call. For Tier 2, point the worktree's own `vite.config.ts` at a free dev slot (repo `CLAUDE.md`, "Two more dev-server slots"); that edit is local scratch and is never committed.

**Order:** E2 before E3 (Mark, 2026-09-27, keeping design §8's order). Mark also offered ryzen for Blender, and bakes run there by default for its 32 threads (Ruling R1).

**Amended 2026-09-27, before execution:** after this plan was first written, Mark approved moving **both machines** to the blender.org build and removing Ubuntu's package. That is done (`serverconfig` `29528db`, ww2airsim `CLAUDE.md` and `docs/models.md` updated). All 16 Blender models rebuilt byte-identically with it, and the Blender suites passed 80/80 on each machine. R1, Task 0, Task 1 and Task 11 below reflect that.

**Goal:** Replace E1's code-generated placeholder flipbooks with six sheets baked from our own Mantaflow simulations and rendered with six-way lighting. Move the rocket motor flame onto the `flame` sheet. Retune the catalog so every effect keeps its on-screen size.

**Architecture:**
- **Bake (ryzen).** `tools/fx/blender/<sheet>.py` builds one gas simulation per sheet on `rig.py`, bakes it with Mantaflow, and renders each picked frame seven times with Cycles: six single-sun lit passes and one emission pass, as 16-bit PNGs. `tools/fx/render.ts` runs that on ryzen's blender.org build over SSH and rsyncs the frames back to `tools/fx/renders/` (gitignored).
- **Pack (nexus).** Pure functions in `tools/fx/pack.ts` normalize, pack the channels into E1's layout, derive motion vectors by optical flow, crossfade the flame into a loop, and measure each sheet against its acceptance rules. `tools/fx/bake.ts` does the file I/O, KTX2 encoding, size ladder, manifest and report.
- **Runtime.** No change to the shading, pass or loader. `content/fx/` gets new files, `catalog.ts` gets new numbers and a `rocket.motor` recipe, `events.ts` gets one emitter per burning rocket, and `ordnance.ts` loses its flame box.

**Tech Stack:** Blender 5.0.1 (blender.org Linux build) with Mantaflow and Cycles CPU, TypeScript, sharp 0.35.4, KTX-Software 4.4.2 (`tools/textures/ktxTool.ts`), Zod, three.js WebGPU, vitest, and Playwright on the reference GPU.

**Spec:** `docs/superpowers/specs/2026-09-26-ordnance-and-effects-design.md` §6 (with the 2026-09-26 amendment in §6.2) and §7–§8. Also read plan E1's rulings R7, R8, R16 and R17 (`docs/superpowers/plans/2026-09-26-e1-effects-engine.md`), the E1 handoff's "Open for Mark" (`docs/handoff/2026-09-26-e1-effects-engine.md`), and `serverconfig/ryzen.md`'s "Blender: the blender.org build" and "SSH into WSL from nexus".

---

## Measured before writing this plan (`main` at `134fe22`, 2026-09-27)

These are claims to re-check in Task 0.

- **Ubuntu's Blender cannot render a Mantaflow grid in Cycles; the blender.org build can.** On ryzen, one baked 64³ smoke VDB rendered as follows:

  | build | Cycles, VDB grid | Cycles, homogeneous volume cube | EEVEE |
  | --- | --- | --- | --- |
  | apt `5.0.1+dfsg-1ubuntu1` (nexus and ryzen) | **0 px** | 3,474 px | 10,268 px at 13.2 s a frame (software EGL) |
  | blender.org `5.0.1`, build `a3db93c5b259` | **4,747 px** at 0.6 s | 3,474 px | segfaults on exit |

  Both builds report `openvdb True fluid True cycles True`. Mantaflow bakes in both. **The apt build has since been removed from both machines**, and `blender` on `PATH` is the blender.org build, symlinked as `/usr/local/bin/blender` (see the amendment in the header).
- **Mantaflow is not reproducible run to run.** Two identical bakes followed by the same render covered 4,890 px and 5,092 px.
- **Mantaflow's VDB index space starts at the domain's minimum corner.** On an identity volume object, a domain spanning x −4..4, z 0..10 landed at 0..8.67, 0..9.92. With the volume object moved to the domain's minimum corner, it landed at −4.08..4.67, −0.08..9.92, and the puff drew centered (column 62 of 128). `rig.py` below does this.
- **The rig in this plan runs,** as measured before two small additions: `first_frame` (for the flame) and `velocity_normal` were added after the run, and have not run yet. `rig.py` and `smoke.py`, run with `--frames 4 --cell 128 --samples 16 --sim-scale 0.4`, exit 0 in 5.8 s bake and 10.6 s render. They write 16-bit RGBA PNGs, and each sun brightens its own side. Mean lit value on the named side minus the opposite side, frame f00, measured about the coverage centroid:

  | pass | right − left | top − bottom |
  | --- | --- | --- |
  | `right` | +0.044 | +0.001 |
  | `left` | −0.044 | +0.001 |
  | `top` | +0.000 | +0.044 |
  | `bottom` | +0.000 | −0.043 |
  | `front` / `back` | ±0.001 | −0.001 / +0.006 |

  `back` has the highest mean (forward scattering at anisotropy 0.2), as expected. Raw lit values are small (about 0.03–0.08) at albedo 0.35 and sun strength 3, which is why the pack normalizes each sheet (Ruling R6).
- **E1's placeholder fill**, the largest covered extent (alpha > 25/255) over all frames divided by the cell size, is fireball 0.719, smoke 0.719, dust 0.719, water-column 0.797, spray 0.719 and flame 0.688. Task 9 preserves these.
- **The HVAR model's aft end is 0.758 m behind its origin.** `content/ordnance/hvar.glb` has bounds min `[-0.758, -0.236, -0.142]` and max `[0.969, 0.049, 0.142]`.
- **`main.ts` passes the whole `world.combat` to `nextFxEvents`** (`main.ts:2134-2137`), so adding `projectiles` to `FxWorldView`'s `Pick` needs no `main.ts` edit. The sortie-forms worktree rewrites large parts of `main.ts`; this plan does not touch it.
- **The repo is public** (`coder999/ww2airsim`). Reference screenshots from IL-2, DCS or MSFS are linked, never committed (Ruling R11).

## Rulings (decided here; record any new ones in the ledger)

1. **R1: bake with the blender.org 5.0.1 build, on ryzen by default.** Both machines now run only that build, as plain `blender` on `PATH` (the header's amendment; `serverconfig/ryzen.md`, "Blender: the blender.org build"). The apt build drew Mantaflow grids as nothing (table above). `probe.py` repeats that measurement before every bake, so a reinstalled apt build, or a future build without NanoVDB, stops the bake with a message naming the defect. Models use the same binary and keep their byte-identical pin; nothing in `tools/models/` changes. The bake runs on ryzen for its 32 threads and to keep Mantaflow off nexus's memory. nexus could bake too, but `render.ts` only speaks SSH. *Cost if reversed:* a local branch in `render.ts` (`FX_BAKE_HOST=local`).
2. **R2: bakes are committed with provenance, never rebuilt to compare bytes.** Mantaflow is not reproducible (measured above). `sheets.json` records `generator: 'blender'`, `blenderVersion: '5.0.1 <build hash>'`, `sceneSha256` over `tools/fx/blender/*.py`, and `seed: 0`, because Mantaflow takes no seed. `fxSheets.test.ts` fails if a script changes without a rebake.
3. **R3: motion vectors come from optical flow on the rendered frames, not from Mantaflow's velocity grid.** The grid's units and axis order are undocumented. Flow works identically for every sheet, and it is testable against a known shift. The method is Lucas–Kanade on a two-level pyramid, on the coverage-weighted front-lit signal, computed after frames are picked. It is forward flow in cell UV per stored frame, x right and y down, which matches `material.ts`'s `flow()`.
4. **R4: `water-column` and `spray` are white gas bakes, not Mantaflow liquid.** This departs from design §6.1's table ("Mantaflow liquid with spray particles"). Only the grid-volume render path is proven here. A liquid mesh at 256² reads as glass, while a photographed near-miss column is aerated white spray, which a dense, strongly forward-scattering white gas with negative density buoyancy reproduces. **Flag this to Mark at the checkpoint.** *Cost if reversed:* a liquid path in `rig.py` (mesh plus instanced spray particles), rendered from the domain object, not from a VDB.
5. **R5: size ladder.** Rungs are tried in order, and the first whose `content/fx/` total is at most 10,000,000 bytes ships: 256 px × 64 frames, 256 × 48, 192 × 64, 192 × 48, 128 × 64. Renders are always 256 px and 64 frames (72 for the flame, Ruling R7), resized and picked at pack time. Encoding stays E1's ETC1S (`--clevel 2 --qlevel 128`), linear, with mips down to an 8–12 px cell.
6. **R6: normalization is per sheet.** Across one sheet's six lit passes, all frames and covered texels, the 99.9th percentile maps to 1. Emission is normalized the same way over texels that emit. Absolute albedo only shapes contrast; the catalog's `tint` sets color, as it did for the placeholders.
7. **R7: only `flame` loops.** It renders 64 + 8 consecutive steady-state frames, and the pack crossfades the last 8 into the first 8. Every other sheet plays once over a particle's life (`flipbookFrame`).
8. **R8: the rocket motor becomes a sustained `rocket.motor` recipe, and the flame box is deleted.** It is a `flame` stream plus light exhaust smoke. It is keyed `rocket:<projectile id>`, sits 0.76 m behind the rocket's origin along its velocity (the HVAR's aft end), and runs while `ageS < ROCKET_BURN_S`. `ROCKET_BURN_S` and its comment move from `ordnance.ts` to `fx/events.ts`. The HVAR axis sits 0.09 m below the origin; that is ignored, because the flame sprite is 0.7–1.1 m.
9. **R9: catalog retuning preserves each emitter's visible extent.** For every emitter drawing a sheet, `sizeM` becomes `sizeM × fill_E1[sheet] / fill_E2[sheet]`, rounded to 2 significant figures. `fill_E1` is the placeholder fill measured above; `fill_E2` comes from `tools/fx/bake-report.json`. E1's Tier 2 pixel thresholds were calibrated on those extents. The look itself is Mark's call at the checkpoint.
10. **R10: renders live in `tools/fx/renders/`,** a new gitignored path deliberately outside `/tools/**/cache/`. `.remote-run-data` mirrors `tools/*/cache` to ryzen on every `remote-run`, and about 0.5 GB of 16-bit frames has no business there.
11. **R11: reference screenshots (IL-2, DCS, MSFS) are linked from the handoff, never committed.** The repo is public, and they are not ours.

## Global Constraints

- Blender for fx is exactly `5.0.1`, the blender.org Linux build, run by `tools/fx/render.ts` only (R1). Cycles on CPU only; never EEVEE (it segfaults under WSL).
- `content/fx/` total **≤ 10,000,000 bytes** (`FX_CONTENT_BYTES_MAX`, spec §6.3). **≤ 256 layers** per array (WebGPU default `maxTextureArrayLayers`).
- Every image is Basis-encoded (ETC1S), linear (`--assign-tf linear`), with more than one mip level (E1 R8).
- Channel layout, verbatim from E1 R7: **light A RGBA = right, left, top, alpha; light B RGBA = bottom, back, front, emission; motion RG = frame-to-frame motion, 0.5 = none**. Every cell's border texels are 0 in A and B.
- `FX_SHEETS` order and names do not change: `fireball, smoke, dust, water-column, spray, flame`.
- Tier 2 gates (spec §4.5): **1440p High gpu p95 with effects ≤ 1.0 ms above `?fx=off`**, the 6.0 ms 1440p tripwire, and `budget4k.spec.ts` limits.
- **Never run a bake on ryzen during a Tier 2 GPU measurement there.** 32 threads of Mantaflow skew frame times. Full suites and `verify` go through `remote-run`; on nexus, run only the files you are touching. Capture `rc=$?` directly; never gate on a grepped pipeline.
- US spelling. Escape `|` as `\|` inside markdown table cells.
- `src/render/main.ts` is not edited (the sortie-forms worktree owns it).

## Review Focus

1. **The wrong Blender (a reinstalled apt one, or a future upgrade that drops NanoVDB) bakes six blank sheets and reports success.** Expected: the bake stops before any sheet with a message naming the defect. *Test: Task 1 (`assertProbe(0)` throws /NanoVDB/). `render.ts` runs the probe first, and the probe is re-run for real in Task 1 step 6.*
2. **Someone edits a sheet script and forgets to rebake, so the committed sheets no longer match their stated source.** Expected: the suite fails. *Test: Task 3 (the `sceneSha256` check, enforced once the content is `blender`, Task 7).*
3. **A sun is mislabeled or its rotation flipped, so every effect is lit from the wrong side, which no pixel-count test notices.** Expected: the pack refuses the sheet. *Test: Task 2 (`acceptance` on a flipped synthetic sheet names the light).*
4. **A simulation grows out of the camera frame, so every sprite shows a straight cut edge.** Expected: the pack refuses the sheet. *Test: Task 2 (edge-alpha rule on a disc touching the border).*
5. **The ship fire and rocket flame loop pops once a cycle.** Expected: seam no larger than 1.5× the mean frame-to-frame step. *Test: Task 2 (a drifting 24-frame sheet fails without `crossfadeLoop` and passes with it).*

---

### Task 0: Preconditions, worktree, ledger and baseline (setup, no commit)

- [ ] **Step 1: Create the worktree.**

```bash
cd /home/mark/projects/ww2airsim
git fetch -q origin
git worktree add -b worktree-e2-flipbooks ../ww2airsim-worktrees/e2-flipbooks main
cd ../ww2airsim-worktrees/e2-flipbooks && npm ci
```

- [ ] **Step 2: Write the ledger** at `.superpowers/sdd/e2-flipbooks/progress.md` (gitignored). It holds a rulings table, a per-task status table, and a "measured" section for bake timings and acceptance numbers.

- [ ] **Step 3: Re-check the claims in "Measured".** Run each, and record the output in the ledger:

```bash
# `wsl -- <cmd>` runs without a shell, so `~` would not expand: pipe a script (serverconfig/ryzen.md).
echo 'readlink -f "$(command -v blender)"; blender --version | head -1; rsync --version | head -1' | ssh ryzen 'wsl -- bash -s; exit $LASTEXITCODE'
readlink -f "$(command -v blender)"; blender --version | head -1
# on both: /home/<user>/opt/blender-5.0.1-linux-x64/blender, Blender 5.0.1; ryzen: rsync 3.2.3 or later (--mkpath)
rsync --version | head -1                                                                            # the same on nexus
grep -n "flameInstances\|ROCKET_BURN_S" -r src tests                                                  # only ordnance.ts and its test
sed -n 2130,2140p src/render/main.ts                                                                 # nextFxEvents gets combat: current.world.combat
```

Anything that has moved becomes a ledger ruling before Task 1.

- [ ] **Step 4: Baseline.** `remote-run npm run verify; rc=$?; echo rc=$rc`. It must be green before Task 1. If it is red on `main` already, record which tests in the ledger, and treat only new failures as yours.

---

### Task 1: The bake transport, the probe and the rig

**Files:**
- Create: `tools/fx/remote.ts`, `tools/fx/render.ts`, `tools/fx/blender/rig.py`, `tools/fx/blender/probe.py`
- Modify: `.gitignore` (add `/tools/fx/renders/`), `package.json` (`fx:render`)
- Test: `tests/tools/fxRemote.test.ts`

**Interfaces:**
- Produces: `remoteScript(r: BakeRun): string`, `rsyncArgs(from, to, opts?): string[]`, `assertProbe(coveredPx: number): void`, and the constants `FX_BAKE_HOST_DEFAULT`, `FX_BLENDER_DEFAULT`, `FX_BLENDER_VERSION` and `SSH_OPTS`. `rig.py` exports `args`, `reset`, `gas_domain`, `flow_sphere`, `bake`, `scatter_material`, `emission_material` and `render_sheet`. `render_sheet` writes `<out>/<sheet>/fNN/{right,left,top,bottom,back,front}.png`, plus `emit.png` when emission is given, and `<out>/<sheet>/meta.json`.
- Consumes (Task 2): `LOOPING` and `LOOP_BLEND` from `tools/fx/pack.ts`. Until Task 2, `render.ts` declares them locally, and Task 2 step 5 switches it to the import.

- [ ] **Step 1: Write the failing test** `tests/tools/fxRemote.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assertProbe, FX_BLENDER_DEFAULT, remoteScript, rsyncArgs, type BakeRun } from '../../tools/fx/remote.js'

const run: BakeRun = {
  remoteDir: 'fxbake/e2-flipbooks', blender: FX_BLENDER_DEFAULT, script: 'smoke.py', doneName: 'done-smoke.json',
  cleanDir: 'out/smoke', args: ['--out', 'out', '--frames', '64'], timeoutS: 10800,
}

describe('fx bake transport (plan E2 Rulings R1, R10)', () => {
  it('runs the pinned build headless, fails on a Python error, and never trusts exit 0 alone', () => {
    const s = remoteScript(run)
    expect(s).toContain("grep -qx 'Blender 5.0.1'")
    expect(s).toContain('timeout 10800 blender -b --factory-startup --python-exit-code 1')
    expect(s).toContain('-P scripts/smoke.py -- done-smoke.json --out out --frames 64')
    expect(s).toContain('rm -rf out/smoke')
    expect(s).toContain('test -s done-smoke.json')
    expect(s).not.toContain('/tmp') // WSL wipes /tmp when the distro idles out (serverconfig/ryzen.md)
  })

  it('refuses any value it would have to quote', () => {
    expect(() => remoteScript({ ...run, args: ['--out', 'a b'] })).toThrow(/quote/)
    expect(() => remoteScript({ ...run, script: 'x;rm -rf ~.py' })).toThrow(/quote/)
  })

  it('rsyncs through WSL, relative to its home', () => {
    const a = rsyncArgs('tools/fx/blender/', 'ryzen:fxbake/x/scripts/', { delete: true, mkpath: true, exclude: ['__pycache__/'] })
    expect(a).toContain('--rsync-path=wsl --cd ~ -- rsync')
    expect(a).toEqual(expect.arrayContaining(['--delete', '--mkpath', '--exclude', '__pycache__/']))
    expect(a.slice(-2)).toEqual(['tools/fx/blender/', 'ryzen:fxbake/x/scripts/'])
  })

  it('a probe that drew nothing stops the bake and names the defect (Review Focus 1)', () => {
    expect(() => assertProbe(0)).toThrow(/NanoVDB/)
    expect(() => assertProbe(Number.NaN)).toThrow(/NanoVDB/)
    expect(() => assertProbe(4747)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/tools/fxRemote.test.ts` should fail with "Cannot find module '../../tools/fx/remote.js'".

- [ ] **Step 3: Write `tools/fx/remote.ts`.**

```ts
// tools/fx/remote.ts
/**
 * Pure builders for the flipbook bake on ryzen (plan E2 Rulings R1, R10); render.ts runs them.
 * Transport is serverconfig/ryzen.md's WSL pattern: a bash script piped to
 * `ssh ryzen 'wsl -- bash -s'` (PowerShell re-parses a command string, never stdin), and rsync
 * through `--rsync-path='wsl --cd ~ -- rsync'`, as remote-run does.
 */
export const FX_BAKE_HOST_DEFAULT = 'ryzen'
/** `blender` on PATH: the blender.org build on both machines since 2026-09-27 (Ruling R1; serverconfig/ryzen.md). */
export const FX_BLENDER_DEFAULT = 'blender'
export const FX_BLENDER_VERSION = '5.0.1'
export const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'LogLevel=ERROR', '-o', 'ConnectTimeout=10'] as const

export type BakeRun = {
  /** Relative to the WSL home: one directory per checkout, so two worktrees can bake at once. */
  readonly remoteDir: string
  readonly blender: string
  /** A file in tools/fx/blender/, which render.ts rsyncs to <remoteDir>/scripts/. */
  readonly script: string
  readonly doneName: string
  /** Emptied first, so a shorter rebake cannot leave a longer one's frames behind. */
  readonly cleanDir: string
  readonly args: readonly string[]
  readonly timeoutS: number
}

const SAFE = /^[A-Za-z0-9._/~-]+$/
function safe(value: string, what: string): string {
  if (!SAFE.test(value)) throw new Error(`${what} ${JSON.stringify(value)} has characters the bake script would have to quote`)
  return value
}

/** The bash the host runs. Non-zero, with the log's tail, unless Blender exits 0 AND writes the done file. */
export function remoteScript(r: BakeRun): string {
  const dir = safe(r.remoteDir, 'remoteDir'), done = safe(r.doneName, 'doneName'), blender = safe(r.blender, 'blender')
  const script = safe(r.script, 'script'), clean = safe(r.cleanDir, 'cleanDir'), args = r.args.map((a) => safe(a, 'argument')).join(' ')
  const log = `log-${done.replace(/\.json$/, '')}.txt`
  return [
    'set -uo pipefail',
    `cd ~/${dir}`,
    `rm -rf ${clean} ${done}`,
    `${blender} --version | head -1 | grep -qx 'Blender ${FX_BLENDER_VERSION}' || { echo "fx bake: ${blender} is not Blender ${FX_BLENDER_VERSION}"; exit 3; }`,
    `timeout ${Math.round(r.timeoutS)} ${blender} -b --factory-startup --python-exit-code 1 --python-expr 'import sys; sys.dont_write_bytecode = True' -P scripts/${script} -- ${done} ${args} > ${log} 2>&1`,
    'rc=$?',
    `if [ $rc -ne 0 ]; then tail -40 ${log}; echo "fx bake: ${script} exited $rc"; exit $rc; fi`,
    `test -s ${done} || { tail -40 ${log}; echo "fx bake: ${script} exited 0 but wrote no ${done}"; exit 4; }`,
    `cat ${done}`,
    '',
  ].join('\n')
}

/** `from` and `to` name the host themselves (`ryzen:fxbake/...`), exactly one side remote. */
export function rsyncArgs(
  from: string, to: string,
  opts: { readonly delete?: boolean; readonly mkpath?: boolean; readonly exclude?: readonly string[] } = {},
): string[] {
  return [
    '-a', ...(opts.delete ? ['--delete'] : []), ...(opts.mkpath ? ['--mkpath'] : []),
    ...(opts.exclude ?? []).flatMap((e) => ['--exclude', e]),
    '-e', `ssh ${SSH_OPTS.join(' ')}`, '--rsync-path=wsl --cd ~ -- rsync', from, to,
  ]
}

/** probe.py's measurement (Ruling R1): a grid volume that renders as nothing is the Ubuntu-package defect. */
export function assertProbe(coveredPx: number): void {
  if (!(coveredPx > 0)) {
    throw new Error(
      'fx bake: the probe rendered its smoke grid as nothing. This Blender cannot draw Mantaflow grid volumes in ' +
      "Cycles; Ubuntu's package has this defect (no NanoVDB). Use the blender.org build: serverconfig/ryzen.md, " +
      '"Blender: the blender.org build".',
    )
  }
}
```

- [ ] **Step 4: Run the test and see it pass.** Same command as step 2. Expected: PASS, 4 tests.

- [ ] **Step 5: Write the rig, the probe and the runner.** `tools/fx/blender/rig.py` is exactly this. It is the version measured in "Measured", with `first_frame` added for the flame:

```python
# tools/fx/blender/rig.py
"""The flipbook bake rig (ordnance-and-effects design §6.1-6.2, plan E2). Original work, AGPL-3.0-or-later.

Runs only under the blender.org 5.0.1 Linux build (plan E2 Ruling R1). Ubuntu's blender
package renders a Mantaflow grid as nothing in Cycles (measured 2026-09-27 on ryzen: the
same VDB drew 0 px there and 4,747 px in the blender.org build). probe.py is that
measurement, and tools/fx/render.ts runs it before every bake.

Frame: the camera sits on -Y looking +Y, so the runtime particle frame (x right, y up,
z toward the camera; src/render/fx/material.ts) is world (+X, +Z, -Y). Each sun shines
FROM the side it is named for. Channel packing is tools/fx/pack.ts's.

A sheet script calls, in order: args(), reset(), gas_domain(), flow_sphere() once or more,
bake(), render_sheet(). Nothing here is random except Mantaflow itself, which is not
reproducible run to run (two identical bakes covered 4,890 and 5,092 px, 2026-09-27), so
bakes are committed with provenance and never rebuilt to compare bytes (Ruling R2).
"""
import json
import math
import os
import sys
import time

import bpy

PASSES = ('right', 'left', 'top', 'bottom', 'back', 'front')
SUN_ROTATION = {
    'right': (0.0, math.pi / 2, 0.0),
    'left': (0.0, -math.pi / 2, 0.0),
    'top': (0.0, 0.0, 0.0),
    'bottom': (math.pi, 0.0, 0.0),
    'front': (math.pi / 2, 0.0, 0.0),
    'back': (-math.pi / 2, 0.0, 0.0),
}
SUN_STRENGTH = 3.0
_KNOWN = {'--out', '--frames', '--cell', '--samples', '--sim-scale'}


def args():
    """The runner's arguments: `-- <done.json> --out <dir> [--frames N --cell PX --samples S --sim-scale K]`."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise ValueError('usage: blender -b -P <sheet>.py -- <done.json> --out <dir> [--frames N ...]')
    done, rest = argv[0], argv[1:]
    if len(rest) % 2 or any(not k.startswith('--') for k in rest[::2]):
        raise ValueError(f'arguments must be --key value pairs, got {rest}')
    kv = dict(zip(rest[::2], rest[1::2]))
    unknown = sorted(set(kv) - _KNOWN)
    if unknown:
        raise ValueError(f'unknown arguments {unknown}')
    if '--out' not in kv:
        raise ValueError('--out is required')
    return {
        'done': done, 'out': kv['--out'],
        'frames': int(kv.get('--frames', 64)), 'cell': int(kv.get('--cell', 256)),
        'samples': int(kv.get('--samples', 128)),
        # Trial runs shrink the sim; a real bake is 1.0.
        'sim_scale': float(kv.get('--sim-scale', 1.0)),
    }


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # The location keyframes that stop an inflow must step, not ease (flow_sphere).
    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'CONSTANT'
    return bpy.context.scene


def _active():
    return bpy.context.view_layer.objects.active


def gas_domain(scene, *, size, center, res, frame_end, cache, alpha, beta, vorticity=0.0, dissolve=0, fire=None):
    """A GAS domain with open borders. `fire` = (burning_rate, flame_smoke, flame_vorticity) or None.
    `alpha` > 0 makes density rise, < 0 sink; `beta` is heat buoyancy."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    dom = _active()
    dom.name = 'Domain'
    dom.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    d = dom.modifiers.new('Fluid', 'FLUID')
    d.fluid_type = 'DOMAIN'
    s = d.domain_settings
    s.domain_type = 'GAS'
    s.resolution_max = res
    s.cache_type = 'ALL'
    s.cache_directory = cache
    s.cache_frame_start = 1
    s.cache_frame_end = frame_end
    s.alpha = alpha
    s.beta = beta
    s.vorticity = vorticity
    for side in ('front', 'back', 'right', 'left', 'top', 'bottom'):
        setattr(s, f'use_collision_border_{side}', False)
    if dissolve:
        s.use_dissolve_smoke = True
        s.dissolve_speed = dissolve
    if fire is not None:
        s.burning_rate, s.flame_smoke, s.flame_vorticity = fire
    scene.frame_start = 1
    scene.frame_end = frame_end
    return dom


def flow_sphere(name, *, radius, location, flow_type, velocity=(0.0, 0.0, 0.0), velocity_normal=0.0,
                stop_frame=None, density=1.0, temperature=1.0, fuel=1.0, subframes=0):
    """An inflow sphere. With `stop_frame` it jumps 1 km below the domain at that frame, which ends its inflow."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location)
    o = _active()
    o.name = name
    m = o.modifiers.new('Fluid', 'FLUID')
    m.fluid_type = 'FLOW'
    f = m.flow_settings
    f.flow_type = flow_type
    f.flow_behavior = 'INFLOW'
    f.flow_source = 'MESH'
    f.subframes = subframes
    f.density = density
    f.temperature = temperature
    if flow_type in ('FIRE', 'BOTH'):
        f.fuel_amount = fuel
    if any(velocity) or velocity_normal:
        f.use_initial_velocity = True
        f.velocity_coord = velocity
        f.velocity_normal = velocity_normal
    if stop_frame is not None:
        o.keyframe_insert('location', frame=stop_frame - 1)
        o.location = (location[0], location[1], location[2] - 1000.0)
        o.keyframe_insert('location', frame=stop_frame)
    o.hide_render = True
    return o


def bake(dom):
    t = time.time()
    bpy.context.view_layer.objects.active = dom
    r = bpy.ops.fluid.bake_all()
    if 'FINISHED' not in r:
        raise RuntimeError(f'fluid bake returned {r}')
    return time.time() - t


def _node_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return mat, nt, out


def scatter_material(*, density, albedo, anisotropy):
    """Lit passes: scattering and absorption from the `density` grid, no emission."""
    mat, nt, out = _node_material('fx-scatter')
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    pv.inputs['Color'].default_value = (albedo, albedo, albedo, 1.0)
    pv.inputs['Density'].default_value = density
    pv.inputs['Anisotropy'].default_value = anisotropy
    nt.links.new(pv.outputs['Volume'], out.inputs['Volume'])
    return mat


def emission_material(*, density, strength):
    """The emission pass: light from the `flame` grid, dimmed by the smoke in front of it."""
    mat, nt, out = _node_material('fx-emission')
    flame = nt.nodes.new('ShaderNodeAttribute')
    flame.attribute_name = 'flame'
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = strength
    nt.links.new(flame.outputs['Fac'], k.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(k.outputs['Value'], em.inputs['Strength'])
    smoke = nt.nodes.new('ShaderNodeAttribute')
    smoke.attribute_name = 'density'
    kd = nt.nodes.new('ShaderNodeMath')
    kd.operation = 'MULTIPLY'
    kd.inputs[1].default_value = density
    nt.links.new(smoke.outputs['Fac'], kd.inputs[0])
    ab = nt.nodes.new('ShaderNodeVolumeAbsorption')
    ab.inputs['Color'].default_value = (0.5, 0.5, 0.5, 1.0)
    nt.links.new(kd.outputs['Value'], ab.inputs['Density'])
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(em.outputs['Emission'], add.inputs[0])
    nt.links.new(ab.outputs['Volume'], add.inputs[1])
    nt.links.new(add.outputs['Shader'], out.inputs['Volume'])
    return mat


def _render_settings(scene, cell, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.seed = 0
    scene.cycles.use_denoising = True
    scene.cycles.volume_bounces = 4
    scene.render.resolution_x = cell
    scene.render.resolution_y = cell
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    # Lightmaps are data: no view transform, no look, 16-bit linear PNG (straight alpha).
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'


def _vdb(cache, frame):
    return os.path.join(cache, 'data', f'fluid_data_{frame:04d}.vdb')


def render_sheet(scene, dom, flows, *, sheet, a, cache, sim_frames, ortho, center_z, scatter,
                 emission=None, bake_s, first_frame=1):
    """Renders a['frames'] frames spread evenly over sim frames first_frame..sim_frames: six lit
    passes each (and an emission pass when `emission` is given) into <out>/<sheet>/fNN/, then
    meta.json and the done file. `first_frame + frames - 1 == sim_frames` renders consecutive frames."""
    frames = a['frames']
    # Mantaflow's VDB index space starts at the domain's minimum corner (measured 2026-09-27:
    # an identity volume put a domain spanning x -4..4 at 0..8), so the volume sits at that corner.
    corner = tuple(min(v[i] for v in (dom.matrix_world @ c.co for c in dom.data.vertices)) for i in range(3))
    for o in [dom, *flows]:
        bpy.data.objects.remove(o)
    vd = bpy.data.volumes.new('fx')
    vol = bpy.data.objects.new('fx', vd)
    scene.collection.objects.link(vol)
    vol.location = corner
    vd.materials.append(scatter)
    bpy.ops.object.camera_add(location=(0.0, -50.0, center_z), rotation=(math.pi / 2, 0.0, 0.0))
    cam = _active()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho
    cam.data.clip_end = 200.0
    scene.camera = cam
    suns = {}
    for p in PASSES:
        bpy.ops.object.light_add(type='SUN', rotation=SUN_ROTATION[p])
        s = _active()
        s.name = f'sun-{p}'
        s.data.energy = SUN_STRENGTH
        s.data.angle = 0.0
        suns[p] = s
    world = bpy.data.worlds.new('black')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    scene.world = world
    _render_settings(scene, a['cell'], a['samples'])
    base = os.path.join(a['out'], sheet)
    os.makedirs(base, exist_ok=True)
    span = sim_frames - first_frame
    picked = [first_frame + round(k * span / (frames - 1)) for k in range(frames)] if frames > 1 else [sim_frames]
    t = time.time()
    for k, f in enumerate(picked):
        vd.filepath = _vdb(cache, f)
        if not vd.grids.load():
            raise RuntimeError(f'{vd.filepath}: {vd.grids.error_message}')
        d = os.path.join(base, f'f{k:02d}')
        os.makedirs(d, exist_ok=True)
        vd.materials[0] = scatter
        for p in PASSES:
            for q, s in suns.items():
                s.hide_render = q != p
            scene.render.filepath = os.path.join(d, f'{p}.png')
            bpy.ops.render.render(write_still=True)
        if emission is not None:
            for s in suns.values():
                s.hide_render = True
            vd.materials[0] = emission
            scene.render.filepath = os.path.join(d, 'emit.png')
            bpy.ops.render.render(write_still=True)
    meta = {
        'sheet': sheet, 'frames': frames, 'simFrames': sim_frames, 'firstFrame': first_frame, 'picked': picked,
        'cellPx': a['cell'], 'samples': a['samples'], 'simScale': a['sim_scale'], 'orthoScale': ortho,
        'emission': emission is not None, 'blender': bpy.app.version_string,
        'buildHash': bpy.app.build_hash.decode(), 'bakeS': round(bake_s, 1), 'renderS': round(time.time() - t, 1),
    }
    with open(os.path.join(base, 'meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=2, sort_keys=True)
    with open(a['done'], 'w') as fh:
        json.dump(meta, fh, sort_keys=True)
```

`tools/fx/blender/probe.py`:

```python
# tools/fx/blender/probe.py
"""Can this Blender draw a Mantaflow grid in Cycles? (plan E2 Ruling R1). Writes {"coveredPx": n}
to the done file; tools/fx/remote.ts assertProbe refuses 0. Original work, AGPL-3.0-or-later."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import rig  # noqa: E402

a = rig.args()
a['frames'], a['cell'], a['samples'] = 1, 64, 8
scene = rig.reset()
cache = os.path.join(a['out'], 'cache')
dom = rig.gas_domain(scene, size=(4.0, 4.0, 4.0), center=(0.0, 0.0, 2.0), res=32, frame_end=12, cache=cache,
                     alpha=1.0, beta=1.0)
src = rig.flow_sphere('probe', radius=0.4, location=(0.0, 0.0, 0.8), flow_type='SMOKE', velocity=(0.0, 0.0, 1.0))
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='probe', a=a, cache=cache, sim_frames=12, ortho=4.2, center_z=2.0,
                 scatter=rig.scatter_material(density=6.0, albedo=0.8, anisotropy=0.0), bake_s=t)
img = bpy.data.images.load(os.path.join(a['out'], 'probe', 'f00', 'front.png'))
covered = sum(1 for x in img.pixels[3::4] if x > 0.03)
with open(a['done'], 'w') as fh:
    json.dump({'coveredPx': covered}, fh)
```

`tools/fx/render.ts`:

```ts
// tools/fx/render.ts
/**
 * `npm run fx:render -- [sheet ...]` bakes flipbook sheets on ryzen with the blender.org build
 * (plan E2 Ruling R1), one at a time, into tools/fx/renders/<sheet>/ (Ruling R10). It runs
 * probe.py first. FX_BAKE_HOST and FX_BLENDER override the host and binary. FX_SIM_SCALE,
 * FX_FRAMES, FX_CELL and FX_SAMPLES shrink a trial run; a real bake leaves them unset.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FX_SHEETS, type FxSheetName } from '../../src/render/fx/sheetManifest.js'
import { assertProbe, FX_BAKE_HOST_DEFAULT, FX_BLENDER_DEFAULT, remoteScript, rsyncArgs, SSH_OPTS } from './remote.js'

// Task 2 step 5 replaces these two lines with `import { LOOPING, LOOP_BLEND } from './pack.js'`.
const LOOPING: readonly FxSheetName[] = ['flame']
const LOOP_BLEND = 8

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCRIPTS = join(ROOT, 'tools/fx/blender/')
const RENDERS = join(ROOT, 'tools/fx/renders/')
const HOST = process.env.FX_BAKE_HOST ?? FX_BAKE_HOST_DEFAULT
const BLENDER = process.env.FX_BLENDER ?? FX_BLENDER_DEFAULT
const REMOTE = `fxbake/${basename(ROOT.replace(/\/$/, ''))}`
const env = (k: string, d: number): number => (process.env[k] === undefined ? d : Number(process.env[k]))
const FRAMES = env('FX_FRAMES', 64), CELL = env('FX_CELL', 256), SAMPLES = env('FX_SAMPLES', 128), SIM_SCALE = env('FX_SIM_SCALE', 1)
/** Per sheet. Task 4 records the real times; three hours is a hang, not a slow bake. */
const TIMEOUT_S = 3 * 3600

function run(cmd: string, args: readonly string[], input?: string): string {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}
const onHost = (script: string): string => run('ssh', [...SSH_OPTS, HOST, 'wsl -- bash -s; exit $LASTEXITCODE'], script)
const lastJson = (out: string): unknown => JSON.parse(out.trim().split('\n').pop()!)

function main(): void {
  const asked = process.argv.slice(2)
  const sheets = (asked.length > 0 ? asked : [...FX_SHEETS]) as FxSheetName[]
  for (const s of sheets) if (!(FX_SHEETS as readonly string[]).includes(s)) throw new Error(`unknown sheet ${s}; one of ${FX_SHEETS.join(', ')}`)
  try { onHost('true\n') } catch (e) {
    throw new Error(`fx:render: ${HOST} is not answering. Wake it (serverconfig/ryzen.md, "Wake-on-LAN") and retry.\n${String(e)}`)
  }
  run('rsync', rsyncArgs(SCRIPTS, `${HOST}:${REMOTE}/scripts/`, { delete: true, mkpath: true, exclude: ['__pycache__/'] }))
  const probe = lastJson(onHost(remoteScript({
    remoteDir: REMOTE, blender: BLENDER, script: 'probe.py', doneName: 'done-probe.json', cleanDir: 'probe', args: ['--out', 'probe'], timeoutS: 600,
  }))) as { coveredPx: number }
  assertProbe(probe.coveredPx)
  console.log(`fx:render: probe drew ${probe.coveredPx} px`)
  for (const sheet of sheets) {
    const frames = LOOPING.includes(sheet) ? FRAMES + LOOP_BLEND : FRAMES
    const args = ['--out', 'out', '--frames', String(frames), '--cell', String(CELL), '--samples', String(SAMPLES), '--sim-scale', String(SIM_SCALE)]
    const t = Date.now()
    onHost(remoteScript({ remoteDir: REMOTE, blender: BLENDER, script: `${sheet}.py`, doneName: `done-${sheet}.json`, cleanDir: `out/${sheet}`, args, timeoutS: TIMEOUT_S }))
    mkdirSync(join(RENDERS, sheet), { recursive: true })
    run('rsync', rsyncArgs(`${HOST}:${REMOTE}/out/${sheet}/`, join(RENDERS, sheet) + '/', { delete: true, exclude: ['cache/'] }))
    const metaFile = join(RENDERS, sheet, 'meta.json')
    if (!existsSync(metaFile)) throw new Error(`fx:render: ${sheet} came back without meta.json`)
    const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as { frames: number; bakeS: number; renderS: number }
    if (meta.frames !== frames) throw new Error(`fx:render: ${sheet} came back with ${meta.frames} frames, asked for ${frames}`)
    console.log(`fx:render: ${sheet} bake ${meta.bakeS} s, render ${meta.renderS} s, ${Math.round((Date.now() - t) / 1000)} s wall`)
  }
}
main()
```

Add `/tools/fx/renders/` to `.gitignore` on a line of its own below `/tools/**/cache/`, with the comment `# fx bake frames (plan E2 Ruling R10): kept out of .remote-run-data's tools/*/cache`. In `package.json`, add `"fx:render": "tsx tools/fx/render.ts"`, and leave `fx:placeholders` until Task 3.

- [ ] **Step 6: Run the probe for real, then prove a wrong binary stops the bake.**

```bash
npx tsx tools/fx/render.ts smoke 2>&1 | tail -5; echo rc=$?
```

This is a trial of the whole path with the full-size smoke script, which does not exist yet, so expect `probe drew N px` with N > 0, then a failure on `scripts/smoke.py` (no such file). That proves the transport and the probe. Then:

```bash
FX_BLENDER=/nonexistent/blender npx tsx tools/fx/render.ts smoke 2>&1 | tail -3; echo rc=$?
```

Expected: non-zero, with `is not Blender 5.0.1` (the version gate in `remoteScript`). The apt build that produced the `NanoVDB` failure has been removed from both machines, so that path is pinned by `assertProbe(0)` in the unit test instead. Record both outputs in the ledger.

- [ ] **Step 7: Lint, typecheck and commit.**

```bash
npx vitest run tests/tools/fxRemote.test.ts && npx tsc --noEmit -p . && npx eslint --max-warnings 0 tools/fx tests/tools/fxRemote.test.ts
git add .gitignore package.json tools/fx/remote.ts tools/fx/render.ts tools/fx/blender/rig.py tools/fx/blender/probe.py tests/tools/fxRemote.test.ts
git commit -m "E2 Task 1: bake transport to ryzen's blender.org build, the grid-render probe and the rig (Rulings R1, R10)"
```

---

### Task 2: The pure pack (normalize, channels, flow, loop, acceptance)

**Files:**
- Create: `tools/fx/pack.ts`
- Modify: `tools/fx/render.ts` (import `LOOPING` and `LOOP_BLEND` from `./pack.js`)
- Test: `tests/tools/fxPack.test.ts`

**Interfaces:**
- Produces: `PASSES`, `type Pass`, `type FramePasses`, `LADDER`, `LOOPING`, `LOOP_BLEND`, `COVERED`, `BORDER`, `EDGE_BAND` and `EDGE_ALPHA_MAX`; `mipLevels(cellPx)`, `pickFrames(total, n, loop?)`, `quantile(each, q)`, `litScale(frames)`, `emitScale(frames)`, `crossfadeLoop(frames, k)`, `packCell(f, cellPx, litK, emitK)` → `{ a: Uint8Array; b: Uint8Array }`, `type Flow`, `lucasKanade(prev, next, w, h, init, radius?, iterations?)`, `pyramidFlow(prev, next, w, h)`, `flowSequence(frames, cellPx, litK, loop)`, `motionScaleOf(flows, cellPx)`, `encodeMotion(flow, cellPx, motionScale)` → `Uint8Array`, `type SheetMetrics`, `measureSheet(frames, cellPx, litK, emitK)` and `acceptance(sheet, m, frames)` → `string[]`.

- [ ] **Step 1: Write the failing test** `tests/tools/fxPack.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  acceptance, crossfadeLoop, encodeMotion, litScale, measureSheet, mipLevels, packCell, pickFrames, pyramidFlow, type FramePasses,
} from '../../tools/fx/pack.js'

const C = 64
/** A soft disc of radius r texels centered at (cx, cy), row 0 at the top. */
function disc(cx: number, cy: number, r: number): Float32Array {
  const a = new Float32Array(C * C)
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
    a[y * C + x] = d < 1 ? Math.min(1, (1 - d) * 3) : 0
  }
  return a
}
/** A lit ball: each lit pass is brighter on the side it is named for, unless `flip`. */
function frame(cx: number, cy: number, r: number, o: { emit?: number; flip?: boolean; alpha?: Float32Array } = {}): FramePasses {
  const alpha = o.alpha ?? disc(cx, cy, r)
  const side = (sx: number, sy: number): Float32Array => {
    const L = new Float32Array(C * C)
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const i = y * C + x, nx = (x + 0.5 - cx) / r, ny = (cy - (y + 0.5)) / r
      L[i] = alpha[i]! > 0 ? 0.3 + 0.2 * (sx * nx + sy * ny) : 0
    }
    return L
  }
  const f = o.flip ? -1 : 1
  return {
    lit: { right: side(f, 0), left: side(-f, 0), top: side(0, 1), bottom: side(0, -1), back: side(0, 0), front: side(0, 0) },
    alpha, emit: alpha.map((v) => v * (o.emit ?? 0)),
  }
}
/** A rising, growing puff: stays inside the frame, fill 0.625. */
const puff = (n = 16, o: { emit?: (k: number) => number; flip?: boolean } = {}): FramePasses[] =>
  Array.from({ length: n }, (_, k) => frame(32, 38 - k * 0.5, 8 + k * 0.8, { emit: o.emit?.(k), flip: o.flip }))
const judge = (sheet: Parameters<typeof acceptance>[0], frames: FramePasses[]): string[] => {
  const k = litScale(frames)
  return acceptance(sheet, measureSheet(frames, C, k, frames.some((f) => f.emit.some((v) => v > 0)) ? 1 : 0), frames.length)
}

describe('fx pack: frames and mips (plan E2 Rulings R5, R7)', () => {
  it('picks frames evenly with both ends for a one-shot sheet, and without the end for a loop', () => {
    expect(pickFrames(64, 64)).toEqual(Array.from({ length: 64 }, (_, k) => k))
    const p = pickFrames(64, 48)
    expect([p[0], p.at(-1), p.length]).toEqual([0, 63, 48])
    const l = pickFrames(64, 48, true)
    expect([l[0], l.length]).toEqual([0, 48])
    expect(l.at(-1)).toBeLessThan(63) // the loop's last frame leads back into frame 0, not onto it
    expect(() => pickFrames(8, 9)).toThrow()
  })
  it('stops the mip chain at an 8 to 12 px cell', () => {
    expect([mipLevels(256), mipLevels(192), mipLevels(128)]).toEqual([6, 5, 5])
  })
})

describe('fx pack: channels (E1 Ruling R7, verbatim)', () => {
  it('packs A = right, left, top, alpha and B = bottom, back, front, emission, with a zero border', () => {
    const u = (v: number) => new Float32Array(C * C).fill(v)
    const f: FramePasses = { lit: { right: u(0.1), left: u(0.2), top: u(0.3), bottom: u(0.4), back: u(0.5), front: u(0.6) }, alpha: u(1), emit: u(0.8) }
    const { a, b } = packCell(f, C, 1, 1)
    const at = (img: Uint8Array, x: number, y: number) => Array.from(img.slice((y * C + x) * 4, (y * C + x) * 4 + 4))
    expect(at(a, 32, 32)).toEqual([26, 51, 77, 255])
    expect(at(b, 32, 32)).toEqual([102, 128, 153, 204])
    for (const [x, y] of [[0, 0], [1, 32], [63, 10], [20, 62]] as const) { expect(at(a, x, y)).toEqual([0, 0, 0, 0]); expect(at(b, x, y)).toEqual([0, 0, 0, 0]) }
  })
  it('normalizes a sheet so its 99.9th-percentile lit value is 1 (Ruling R6)', () => {
    const f = frame(32, 32, 20)
    for (const L of Object.values(f.lit)) for (let i = 0; i < L.length; i++) if (f.alpha[i]! > 0) L[i] = (i % 1000) / 999
    expect(litScale([f])).toBeGreaterThan(0.99)
    expect(litScale([f])).toBeLessThan(1.02)
  })
})

describe('fx pack: motion by optical flow (Ruling R3)', () => {
  /** A textured blob moved by (sx, sy) texels: content moves right and down for positive values. */
  const textured = (sx: number, sy: number): Float32Array => {
    const s = new Float32Array(C * C)
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const u = x + 0.5 - sx, v = y + 0.5 - sy
      const d = Math.hypot(u - 32, v - 32) / 18
      s[y * C + x] = d < 1 ? (1 - d) * (0.6 + 0.4 * Math.sin(u * 0.7) * Math.cos(v * 0.5)) : 0
    }
    return s
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
  for (const [sx, sy, tol] of [[1.5, -1, 0.25], [4, 2, 0.5]] as const) {
    it(`recovers a (${sx}, ${sy}) texel shift within ${tol}`, () => {
      const prev = textured(0, 0), flow = pyramidFlow(prev, textured(sx, sy), C, C)
      const dx: number[] = [], dy: number[] = []
      for (let i = 0; i < C * C; i++) if (prev[i]! > 0.3) { dx.push(flow.dx[i]!); dy.push(flow.dy[i]!) }
      expect(Math.abs(median(dx) - sx)).toBeLessThan(tol)
      expect(Math.abs(median(dy) - sy)).toBeLessThan(tol)
    })
  }
  it('encodes motion as cell UV about 0.5, with a neutral border', () => {
    const n = C * C, flow = { dx: new Float32Array(n).fill(0.02 * C), dy: new Float32Array(n).fill(-0.01 * C) }
    const m = encodeMotion(flow, C, 0.02)
    const i = (32 * C + 32) * 4
    expect([m[i], m[i + 1], m[i + 2], m[i + 3]]).toEqual([255, 64, 0, 255])
    expect([m[0], m[1]]).toEqual([128, 128])
  })
})

describe('fx pack: acceptance (Review Focus 3, 4, 5)', () => {
  it('a well-framed, correctly lit smoke puff passes', () => {
    expect(judge('smoke', puff())).toEqual([])
  })
  it('refuses a sheet whose right and left lights are swapped (Review Focus 3)', () => {
    expect(judge('smoke', puff(16, { flip: true })).join('\n')).toMatch(/right light .* right side/)
  })
  it('refuses a sim that leaves the frame (Review Focus 4)', () => {
    const leaks = puff().map((f, k) => (k === 15 ? frame(32, 26, 29) : f))
    expect(judge('smoke', leaks).join('\n')).toMatch(/leaves the frame/)
  })
  it('refuses light from a sheet that must not emit, and a fireball that never burns out', () => {
    expect(judge('smoke', puff(16, { emit: () => 0.5 })).join('\n')).toMatch(/emits light/)
    expect(judge('fireball', puff(16, { emit: () => 0.5 })).join('\n')).toMatch(/does not burn out/)
    expect(judge('fireball', puff(16, { emit: (k) => (k < 6 ? 0.8 : 0) }))).toEqual([])
  })
  it('refuses a squat water column', () => {
    expect(judge('water-column', puff()).join('\n')).toMatch(/taller than it is wide/)
  })
  it('crossfading fixes a drifting flame loop (Review Focus 5)', () => {
    const drift = Array.from({ length: 24 }, (_, k) => frame(32, 32, 10 + k * 0.5, { emit: 0.6 }))
    expect(judge('flame', drift.slice(0, 16)).join('\n')).toMatch(/loop seam/)
    expect(judge('flame', crossfadeLoop(drift, 8))).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/tools/fxPack.test.ts` should fail with "Cannot find module '../../tools/fx/pack.js'".

- [ ] **Step 3: Write `tools/fx/pack.ts`.**

```ts
// tools/fx/pack.ts
/**
 * The pure half of the flipbook pack (plan E2). Channel layout, E1 Ruling R7 verbatim:
 * light A RGBA = right, left, top, alpha; light B RGBA = bottom, back, front, emission;
 * motion RG = frame-to-frame motion in cell UV, 0.5 = none. Images are Float32Array,
 * row-major, row 0 at the TOP, one value per texel. tests/tools/fxPack.test.ts covers every
 * export with synthetic images; bake.ts does the file I/O.
 */
import type { FxSheetName } from '../../src/render/fx/sheetManifest.js'

export const PASSES = ['right', 'left', 'top', 'bottom', 'back', 'front'] as const
export type Pass = (typeof PASSES)[number]
export type FramePasses = { readonly lit: Readonly<Record<Pass, Float32Array>>; readonly alpha: Float32Array; readonly emit: Float32Array }

/** Ruling R5: the first rung whose content/fx fits the 10 MB gate ships. */
export const LADDER: readonly { readonly cellPx: number; readonly frames: number }[] = [
  { cellPx: 256, frames: 64 }, { cellPx: 256, frames: 48 }, { cellPx: 192, frames: 64 }, { cellPx: 192, frames: 48 }, { cellPx: 128, frames: 64 },
]
/** Ruling R7: only the flame loops (ship fire and the rocket motor play it at a rate). */
export const LOOPING: readonly FxSheetName[] = ['flame']
export const LOOP_BLEND = 8
/** A texel is covered above this alpha; E1's placeholder fill was measured at 25/255. */
export const COVERED = 0.1
/** Border texels forced to zero in A and B, so no mip bleeds one sheet into its neighbor. */
export const BORDER = 2
/** Before masking, no alpha within EDGE_BAND texels of the cell edge may exceed EDGE_ALPHA_MAX. */
export const EDGE_BAND = 4
export const EDGE_ALPHA_MAX = 0.1

export const mipLevels = (cellPx: number): number => Math.floor(Math.log2(cellPx / 8)) + 1

export function pickFrames(total: number, n: number, loop = false): number[] {
  if (!Number.isInteger(n) || n < 1 || n > total) throw new Error(`cannot pick ${n} of ${total} frames`)
  if (loop) return Array.from({ length: n }, (_, k) => Math.floor((k * total) / n))
  if (n === 1) return [total - 1]
  return Array.from({ length: n }, (_, k) => Math.round((k * (total - 1)) / (n - 1)))
}

/** The value at quantile `q` of everything `each` visits, to 1/4096 of the maximum; 0 if none is positive. */
export function quantile(each: (visit: (x: number) => void) => void, q: number): number {
  let max = 0, n = 0
  each((x) => { if (x > max) max = x; n++ })
  if (n === 0 || !(max > 0)) return 0
  const BINS = 4096, hist = new Uint32Array(BINS)
  each((x) => { hist[Math.min(BINS - 1, Math.floor((x / max) * BINS))]!++ })
  let acc = 0
  for (let b = 0; b < BINS; b++) { acc += hist[b]!; if (acc >= q * n) return ((b + 1) / BINS) * max }
  return max
}

/** Ruling R6: maps the sheet's 99.9th-percentile covered lit value to 1. */
export function litScale(frames: readonly FramePasses[]): number {
  const p = quantile((visit) => {
    for (const f of frames) for (const pass of PASSES) { const L = f.lit[pass]; for (let i = 0; i < L.length; i++) if (f.alpha[i]! > COVERED) visit(L[i]!) }
  }, 0.999)
  if (!(p > 0)) throw new Error('the sheet has no lit, covered texel')
  return 1 / p
}
/** Ruling R6 for emission, over emitting texels; 0 for a sheet that emits nothing. */
export function emitScale(frames: readonly FramePasses[]): number {
  const p = quantile((visit) => { for (const f of frames) for (let i = 0; i < f.emit.length; i++) if (f.emit[i]! > 0) visit(f.emit[i]!) }, 0.999)
  return p > 0 ? 1 / p : 0
}

/** Ruling R7: n + k consecutive frames become n that loop. Frame i < k blends frame n + i into
 *  frame i, so the kept last frame (n - 1) leads naturally into the new frame 0 (mostly frame n). */
export function crossfadeLoop(frames: readonly FramePasses[], k: number): FramePasses[] {
  const n = frames.length - k
  if (k < 1 || n < k) throw new Error(`cannot loop ${frames.length} frames with a ${k}-frame blend`)
  const mix = (a: Float32Array, b: Float32Array, w: number): Float32Array => {
    const o = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) o[i] = a[i]! * (1 - w) + b[i]! * w
    return o
  }
  return frames.slice(0, n).map((f, i) => {
    if (i >= k) return f
    const tail = frames[n + i]!, w = (i + 0.5) / k // weight of the original frame i
    const lit = Object.fromEntries(PASSES.map((p) => [p, mix(tail.lit[p], f.lit[p], w)])) as Record<Pass, Float32Array>
    return { lit, alpha: mix(tail.alpha, f.alpha, w), emit: mix(tail.emit, f.emit, w) }
  })
}

const byte = (x: number): number => Math.round((x < 0 ? 0 : x > 1 ? 1 : x) * 255)
const isBorder = (x: number, y: number, cellPx: number, band: number): boolean =>
  x < band || y < band || x >= cellPx - band || y >= cellPx - band

export function packCell(f: FramePasses, cellPx: number, litK: number, emitK: number): { readonly a: Uint8Array; readonly b: Uint8Array } {
  const n = cellPx * cellPx, a = new Uint8Array(n * 4), b = new Uint8Array(n * 4)
  for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
    if (isBorder(x, y, cellPx, BORDER)) continue
    const i = y * cellPx + x, o = i * 4
    a[o] = byte(f.lit.right[i]! * litK); a[o + 1] = byte(f.lit.left[i]! * litK); a[o + 2] = byte(f.lit.top[i]! * litK); a[o + 3] = byte(f.alpha[i]!)
    b[o] = byte(f.lit.bottom[i]! * litK); b[o + 1] = byte(f.lit.back[i]! * litK); b[o + 2] = byte(f.lit.front[i]! * litK); b[o + 3] = byte(f.emit[i]! * emitK)
  }
  return { a, b }
}

export type Flow = { readonly dx: Float32Array; readonly dy: Float32Array }

function sample(img: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.max(0, Math.min(w - 1.001, x - 0.5)), cy = Math.max(0, Math.min(h - 1.001, y - 0.5))
  const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0
  const p = (xx: number, yy: number) => img[yy * w + xx]!
  return (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy
}
function blur(src: Float32Array, w: number, h: number): Float32Array {
  const K = [1, 4, 6, 4, 1], t = new Float32Array(w * h), o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0
    for (let k = -2; k <= 2; k++) s += K[k + 2]! * src[y * w + Math.max(0, Math.min(w - 1, x + k))]!
    t[y * w + x] = s / 16
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0
    for (let k = -2; k <= 2; k++) s += K[k + 2]! * t[Math.max(0, Math.min(h - 1, y + k)) * w + x]!
    o[y * w + x] = s / 16
  }
  return o
}
function halve(src: Float32Array, w: number, h: number): Float32Array {
  const hw = w >> 1, hh = h >> 1, o = new Float32Array(hw * hh)
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const i = 2 * y * w + 2 * x
    o[y * hw + x] = (src[i]! + src[i + 1]! + src[i + w]! + src[i + w + 1]!) / 4
  }
  return o
}
/** Sum over the (2r+1)² window around each texel, clamped at the edges, by an integral image. */
function boxSum(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]!; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1]! + row } }
  const o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    o[y * w + x] = I[y1 * (w + 1) + x1]! - I[y0 * (w + 1) + x1]! - I[y1 * (w + 1) + x0]! + I[y0 * (w + 1) + x0]!
  }
  return o
}

/** Dense iterative Lucas–Kanade: forward flow in texels such that next(p + d) ≈ prev(p). */
export function lucasKanade(prev: Float32Array, next: Float32Array, w: number, h: number, init: Flow | null, radius = 4, iterations = 3): Flow {
  const n = w * h, P = blur(prev, w, h), N = blur(next, w, h)
  const ix = new Float32Array(n), iy = new Float32Array(n)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    ix[i] = (P[y * w + Math.min(w - 1, x + 1)]! - P[y * w + Math.max(0, x - 1)]!) / 2
    iy[i] = (P[Math.min(h - 1, y + 1) * w + x]! - P[Math.max(0, y - 1) * w + x]!) / 2
  }
  const sxx = boxSum(ix.map((g) => g * g), w, h, radius), syy = boxSum(iy.map((g) => g * g), w, h, radius)
  const sxy = boxSum(ix.map((g, i) => g * iy[i]!), w, h, radius)
  const dx = init ? Float32Array.from(init.dx) : new Float32Array(n), dy = init ? Float32Array.from(init.dy) : new Float32Array(n)
  const tx = new Float32Array(n), ty = new Float32Array(n)
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, e = sample(N, w, h, x + 0.5 + dx[i]!, y + 0.5 + dy[i]!) - P[i]!
      tx[i] = ix[i]! * e; ty[i] = iy[i]! * e
    }
    const bx = boxSum(tx, w, h, radius), by = boxSum(ty, w, h, radius)
    for (let i = 0; i < n; i++) {
      const det = sxx[i]! * syy[i]! - sxy[i]! * sxy[i]!
      if (!(det > 1e-9)) continue // no texture here: leave the estimate alone
      dx[i]! -= (syy[i]! * bx[i]! - sxy[i]! * by[i]!) / det
      dy[i]! -= (sxx[i]! * by[i]! - sxy[i]! * bx[i]!) / det
    }
  }
  return { dx, dy }
}

/** Two levels: the half-resolution flow, doubled, seeds the full-resolution solve. */
export function pyramidFlow(prev: Float32Array, next: Float32Array, w: number, h: number): Flow {
  if (w < 32 || h < 32 || w % 2 || h % 2) return lucasKanade(prev, next, w, h, null)
  const hw = w >> 1, hh = h >> 1
  const coarse = lucasKanade(halve(prev, w, h), halve(next, w, h), hw, hh, null)
  const dx = new Float32Array(w * h), dy = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = Math.min(hh - 1, y >> 1) * hw + Math.min(hw - 1, x >> 1)
    dx[y * w + x] = coarse.dx[j]! * 2; dy[y * w + x] = coarse.dy[j]! * 2
  }
  return lucasKanade(prev, next, w, h, { dx, dy })
}

/** Forward flow from each frame to the next, on the coverage-weighted front-lit signal. The
 *  last frame repeats its predecessor's flow, or, in a loop, flows into frame 0. */
export function flowSequence(frames: readonly FramePasses[], cellPx: number, litK: number, loop: boolean): Flow[] {
  const signal = frames.map((f) => f.alpha.map((a, i) => a * (0.5 + 0.5 * Math.min(1, f.lit.front[i]! * litK))))
  const out: Flow[] = []
  for (let k = 0; k < frames.length; k++) {
    const next = k + 1 < frames.length ? signal[k + 1] : loop ? signal[0] : undefined
    out.push(next ? pyramidFlow(signal[k]!, next, cellPx, cellPx) : out[k - 1] ?? { dx: new Float32Array(cellPx * cellPx), dy: new Float32Array(cellPx * cellPx) })
  }
  return out
}
/** One manifest motionScale for every sheet: the 99th percentile of moving texels' speed, in cell UV. */
export function motionScaleOf(flows: readonly Flow[], cellPx: number): number {
  const p = quantile((visit) => {
    for (const f of flows) for (let i = 0; i < f.dx.length; i++) { const s = Math.hypot(f.dx[i]!, f.dy[i]!); if (s > 0) visit(s / cellPx) }
  }, 0.99)
  return Math.max(0.005, p)
}
export function encodeMotion(flow: Flow, cellPx: number, motionScale: number): Uint8Array {
  const o = new Uint8Array(cellPx * cellPx * 4)
  for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
    const i = y * cellPx + x, q = i * 4
    const border = isBorder(x, y, cellPx, BORDER)
    o[q] = border ? 128 : byte(0.5 + flow.dx[i]! / cellPx / (2 * motionScale))
    o[q + 1] = border ? 128 : byte(0.5 + flow.dy[i]! / cellPx / (2 * motionScale))
    o[q + 2] = 0; o[q + 3] = 255
  }
  return o
}

export type SheetMetrics = {
  readonly coverageByFrame: readonly number[]
  /** Largest covered bounding-box side over all frames, over the cell size: E1's placeholder "fill". */
  readonly fill: number
  readonly edgeAlpha: number
  readonly emitMeanByFrame: readonly number[]
  readonly emitFrames: number
  /** Height over width of the covered box at the frame of peak coverage. */
  readonly aspectAtPeak: number
  readonly seam: number
  readonly step: number
  /** Mean normalized lit value on the named side minus the opposite side, about the coverage centroid, at peak coverage. */
  readonly sixWay: Readonly<Record<'right' | 'left' | 'top' | 'bottom', number>>
}

export function measureSheet(frames: readonly FramePasses[], cellPx: number, litK: number, emitK: number): SheetMetrics {
  const coverageByFrame: number[] = [], emitMeanByFrame: number[] = []
  let fill = 0, edgeAlpha = 0, peak = 0, peakAt = 0
  const boxes: { w: number; h: number }[] = []
  frames.forEach((f, k) => {
    let covered = 0, x0 = cellPx, x1 = -1, y0 = cellPx, y1 = -1, emit = 0
    for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
      const i = y * cellPx + x, a = f.alpha[i]!
      if (isBorder(x, y, cellPx, EDGE_BAND)) edgeAlpha = Math.max(edgeAlpha, a)
      if (a <= COVERED) continue
      covered++; emit += f.emit[i]! * emitK
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    const w = x1 < 0 ? 0 : x1 - x0 + 1, h = y1 < 0 ? 0 : y1 - y0 + 1
    boxes.push({ w, h })
    fill = Math.max(fill, Math.max(w, h) / cellPx)
    coverageByFrame.push(covered / (cellPx * cellPx))
    emitMeanByFrame.push(covered > 0 ? emit / covered : 0)
    if (covered > peak) { peak = covered; peakAt = k }
  })
  const pf = frames[peakAt]!
  let cx = 0, cy = 0, cn = 0
  for (let i = 0; i < pf.alpha.length; i++) if (pf.alpha[i]! > COVERED) { cx += i % cellPx; cy += Math.floor(i / cellPx); cn++ }
  cx /= Math.max(1, cn); cy /= Math.max(1, cn)
  const halfMean = (L: Float32Array, pick: (x: number, y: number) => boolean): number => {
    let s = 0, n = 0
    for (let i = 0; i < L.length; i++) { const x = i % cellPx, y = Math.floor(i / cellPx); if (pf.alpha[i]! > COVERED && pick(x, y)) { s += L[i]! * litK; n++ } }
    return n > 0 ? s / n : 0
  }
  const right = (x: number) => x >= cx, upper = (_x: number, y: number) => y < cy
  const sixWay = {
    right: halfMean(pf.lit.right, right) - halfMean(pf.lit.right, (x) => !right(x)),
    left: halfMean(pf.lit.left, (x) => !right(x)) - halfMean(pf.lit.left, right),
    top: halfMean(pf.lit.top, upper) - halfMean(pf.lit.top, (x, y) => !upper(x, y)),
    bottom: halfMean(pf.lit.bottom, (x, y) => !upper(x, y)) - halfMean(pf.lit.bottom, upper),
  }
  const meanAbs = (a: Float32Array, b: Float32Array): number => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!); return s / a.length }
  let step = 0
  for (let k = 0; k + 1 < frames.length; k++) step += meanAbs(frames[k]!.alpha, frames[k + 1]!.alpha)
  step /= Math.max(1, frames.length - 1)
  const box = boxes[peakAt]!
  return {
    coverageByFrame, fill, edgeAlpha, emitMeanByFrame, emitFrames: emitMeanByFrame.filter((e) => e > 0.05).length,
    aspectAtPeak: box.w > 0 ? box.h / box.w : 0, seam: meanAbs(frames.at(-1)!.alpha, frames[0]!.alpha), step, sixWay,
  }
}

/** Every rule a baked sheet must pass; each failure is one sentence. [] = ship it. */
export function acceptance(sheet: FxSheetName, m: SheetMetrics, frames: number): string[] {
  const out: string[] = []
  const peak = Math.max(...m.coverageByFrame)
  if (peak < 0.05) out.push(`${sheet}: peak coverage ${peak.toFixed(3)} is under 0.05`)
  if (!(m.coverageByFrame[0]! > 0)) out.push(`${sheet}: frame 0 is empty, so a triggered effect would start invisible`)
  if (m.edgeAlpha > EDGE_ALPHA_MAX) out.push(`${sheet}: alpha ${m.edgeAlpha.toFixed(2)} within ${EDGE_BAND} texels of the cell edge; the sim leaves the frame`)
  if (m.fill < 0.45 || m.fill > 0.95) out.push(`${sheet}: fill ${m.fill.toFixed(2)} is outside 0.45..0.95`)
  for (const side of ['right', 'left', 'top', 'bottom'] as const) {
    if (!(m.sixWay[side] >= 0.01)) out.push(`${sheet}: the ${side} light does not brighten the ${side} side (${m.sixWay[side].toFixed(3)})`)
  }
  const peakEmit = Math.max(...m.emitMeanByFrame)
  if (sheet === 'fireball') {
    if (m.emitFrames < 0.25 * frames) out.push(`fireball: emits in only ${m.emitFrames} of ${frames} frames`)
    if (m.emitMeanByFrame.at(-1)! > 0.25 * peakEmit) out.push('fireball: does not burn out; last-frame emission is over a quarter of its peak')
  } else if (sheet === 'flame') {
    if (m.emitFrames !== frames) out.push(`flame: emits in ${m.emitFrames} of ${frames} frames; a steady flame emits in all`)
  } else if (m.emitFrames !== 0) {
    out.push(`${sheet}: emits light in ${m.emitFrames} frames; only fireball and flame may`)
  }
  if (sheet === 'water-column' && m.aspectAtPeak < 1.5) out.push(`water-column: must be taller than it is wide (height/width ${m.aspectAtPeak.toFixed(2)}, want at least 1.5)`)
  if (LOOPING.includes(sheet) && m.seam > 1.5 * m.step) out.push(`${sheet}: loop seam ${m.seam.toFixed(4)} is over 1.5 x the mean step ${m.step.toFixed(4)}`)
  return out
}
```

- [ ] **Step 4: Run the test and see it pass.** Same command as step 2. Expected: PASS, 13 tests. If the optical-flow tolerance fails, debug `lucasKanade` (superpowers:systematic-debugging). Do not loosen the tolerance: 0.25 texel at a 1.5 texel shift is what frame blending needs.

- [ ] **Step 5: Point `render.ts` at the shared constants.** Replace its two local `LOOPING` / `LOOP_BLEND` lines, and their comment, with `import { LOOPING, LOOP_BLEND } from './pack.js'`.

- [ ] **Step 6: Lint, typecheck and commit.**

```bash
npx vitest run tests/tools/fxPack.test.ts tests/tools/fxRemote.test.ts && npx tsc --noEmit -p . && npx eslint --max-warnings 0 tools/fx tests/tools
git add tools/fx/pack.ts tools/fx/render.ts tests/tools/fxPack.test.ts
git commit -m "E2 Task 2: the pure pack: channels, normalization, optical-flow motion, loop crossfade, acceptance (Rulings R3, R5-R7)"
```

---

### Task 3: The pack's I/O, manifest, report and scene hash; the placeholder generator goes

**Files:**
- Create: `tools/fx/bake.ts`, `tools/fx/sceneHash.ts`
- Delete: `tools/fx/build.ts`, `tools/fx/placeholders.ts`
- Modify: `package.json` (`fx:placeholders` goes; add `fx:pack` and `fx:bake`), `tests/tools/fxSheets.test.ts` (rewritten)

**Interfaces:**
- Consumes: everything Task 2 produces; `ktxBinary()` (`tools/textures/ktxTool.ts`); `readKtx2Header()` (`tools/textures/ktx2.ts`); `fxSheetManifestSchema`, `FX_SHEETS` and `FX_CONTENT_BYTES_MAX` (`src/render/fx/sheetManifest.ts`).
- Produces: `fxSceneSha256(dir?): string`; `tools/fx/bake-report.json` with the shape `BakeReport` below; `npm run fx:pack`; `npm run fx:pack -- --check <sheet>`.

- [ ] **Step 1: Write the failing test.** Replace `tests/tools/fxSheets.test.ts` entirely:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readKtx2Header } from '../../tools/textures/ktx2.js'
import { acceptance } from '../../tools/fx/pack.js'
import { fxSceneSha256 } from '../../tools/fx/sceneHash.js'
import type { BakeReport } from '../../tools/fx/bake.js'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema, sheetLayout } from '../../src/render/fx/sheetManifest.js'

const root = new URL('../../', import.meta.url)
const dir = new URL('content/fx/', root)
const manifest = fxSheetManifestSchema.parse(JSON.parse(readFileSync(new URL('sheets.json', dir), 'utf8')))
// KHR Data Format constants (khr_df.h), as tests/tools/textures.test.ts uses them.
const MODEL_ETC1S = 163, MODEL_UASTC = 166, TF_LINEAR = 1

describe('fx sheets (effects design §6; E1 Rulings R7, R8; E2)', () => {
  it('the manifest names every sheet once, in FX_SHEETS order, in distinct atlas cells', () => {
    expect(manifest.sheets.map((s) => s.name)).toEqual([...FX_SHEETS])
    const cells = manifest.sheets.map((s) => s.cell)
    expect(new Set(cells).size).toBe(FX_SHEETS.length)
    expect(Math.max(...cells)).toBeLessThan(manifest.cols * manifest.rows)
    expect(sheetLayout(manifest).cellOf.flame).toBe(manifest.sheets.find((s) => s.name === 'flame')!.cell)
  })

  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    it(`${image}: a Basis-encoded, linear, ${manifest.frames}-layer array of the atlas size, with mips`, () => {
      const h = readKtx2Header(new Uint8Array(readFileSync(new URL(manifest.images[image], dir))))
      expect(h.layerCount).toBe(manifest.frames)
      expect(h.pixelWidth).toBe(manifest.cols * manifest.cellPx)
      expect(h.pixelHeight).toBe(manifest.rows * manifest.cellPx)
      expect([MODEL_ETC1S, MODEL_UASTC]).toContain(h.colorModel) // never the uncompressed path: KTX2Loader drops its layers
      expect(h.transferFunction).toBe(TF_LINEAR) // lightmaps and motion are data, not color
      expect(h.levelCount).toBeGreaterThan(1)
    })
  }

  it('the whole content/fx directory stays under the 10 MB gate (spec §6.3)', () => {
    const bytes = readdirSync(dir).reduce((sum, f) => sum + statSync(new URL(f, dir)).size, 0)
    expect(bytes).toBeLessThanOrEqual(FX_CONTENT_BYTES_MAX)
  })

  // Task 7 replaces this `if` with `expect(manifest.provenance.generator).toBe('blender')`.
  if (manifest.provenance.generator === 'blender') {
    const report = JSON.parse(readFileSync(new URL('tools/fx/bake-report.json', root), 'utf8')) as BakeReport
    it('was baked by the blender.org 5.0.1 build from the scripts in this commit (Rulings R1, R2; Review Focus 2)', () => {
      expect(manifest.provenance.blenderVersion).toMatch(/^5\.0\.1 [0-9a-f]{12}$/)
      expect(manifest.provenance.seed).toBe(0) // Mantaflow takes no seed (Ruling R2)
      expect(manifest.provenance.sceneSha256, 'a script in tools/fx/blender changed without a rebake: npm run fx:bake').toBe(fxSceneSha256())
      expect(report.sceneSha256).toBe(manifest.provenance.sceneSha256)
    })
    it('every sheet passed its acceptance rules at the size that shipped', () => {
      expect([report.rung.cellPx, report.rung.frames]).toEqual([manifest.cellPx, manifest.frames])
      for (const s of FX_SHEETS) expect(acceptance(s, report.sheets[s].metrics, manifest.frames), s).toEqual([])
      expect(report.motionScale).toBe(manifest.motionScale)
    })
  }

  it('the placeholder generator is gone (E2 replaces it; git remembers)', () => {
    expect(existsSync(new URL('tools/fx/placeholders.ts', root))).toBe(false)
  })
})

describe('fxSceneSha256', () => {
  it('is stable, and covers every rig and sheet script', () => {
    expect(fxSceneSha256()).toMatch(/^[0-9a-f]{64}$/)
    expect(fxSceneSha256()).toBe(fxSceneSha256())
  })
})
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/tools/fxSheets.test.ts` should fail with "Cannot find module '../../tools/fx/sceneHash.js'".

- [ ] **Step 3: Write `tools/fx/sceneHash.ts`.**

```ts
// tools/fx/sceneHash.ts
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('./blender/', import.meta.url))

/** sha256 over tools/fx/blender/*.py, by sorted name: what the committed sheets were baked
 *  from (plan E2 Ruling R2). fxSheets.test.ts compares it with sheets.json. */
export function fxSceneSha256(dir = DIR): string {
  const h = createHash('sha256')
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.py')).sort()) {
    h.update(f); h.update('\0'); h.update(readFileSync(join(dir, f))); h.update('\0')
  }
  return h.digest('hex')
}
```

- [ ] **Step 4: Write `tools/fx/bake.ts`.**

```ts
// tools/fx/bake.ts
/**
 * `npm run fx:pack` packs tools/fx/renders/ into content/fx/ (plan E2) and writes
 * tools/fx/bake-report.json. `npm run fx:pack -- --check <sheet>` measures one sheet at its
 * rendered size against pack.ts's acceptance rules and writes nothing (non-zero on failure).
 * `npm run fx:bake` is fx:render, then fx:pack.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema, type FxSheetName } from '../../src/render/fx/sheetManifest.js'
import { readKtx2Header } from '../textures/ktx2.js'
import { ktxBinary } from '../textures/ktxTool.js'
import {
  acceptance, crossfadeLoop, emitScale, encodeMotion, flowSequence, LADDER, litScale, LOOP_BLEND, LOOPING, measureSheet,
  mipLevels, motionScaleOf, packCell, PASSES, pickFrames, type FramePasses, type Pass, type SheetMetrics,
} from './pack.js'
import { fxSceneSha256 } from './sceneHash.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const RENDERS = join(ROOT, 'tools/fx/renders/')
const WORK = join(RENDERS, '_pack/')
const OUT = join(ROOT, 'content/fx/')
const REPORT = join(ROOT, 'tools/fx/bake-report.json')
const FILES = { lightA: 'fx-light-a.ktx2', lightB: 'fx-light-b.ktx2', motion: 'fx-motion.ktx2' } as const
const COLS = 3, ROWS = 2

type Meta = { readonly frames: number; readonly cellPx: number; readonly emission: boolean; readonly blender: string; readonly buildHash: string; readonly bakeS: number; readonly renderS: number; readonly samples: number }
export type BakeReport = {
  readonly rung: { readonly cellPx: number; readonly frames: number }
  readonly totalBytes: number
  readonly files: Readonly<Record<string, number>>
  readonly motionScale: number
  readonly sceneSha256: string
  readonly blender: string
  readonly sheets: Readonly<Record<FxSheetName, { readonly metrics: SheetMetrics; readonly litScale: number; readonly emitScale: number; readonly bakeS: number; readonly renderS: number; readonly samples: number }>>
}

async function read16(file: string, cellPx: number): Promise<{ lum: Float32Array; alpha: Float32Array }> {
  // sharp premultiplies around the resize, so straight alpha stays straight.
  const { data } = await sharp(file).resize(cellPx, cellPx, { kernel: 'lanczos3' }).ensureAlpha().raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true })
  const u = new Uint16Array(new Uint8Array(data).buffer) // an aligned copy: sharp's Buffer may sit at an odd offset
  const n = cellPx * cellPx, lum = new Float32Array(n), alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    lum[i] = (0.2126 * u[i * 4]! + 0.7152 * u[i * 4 + 1]! + 0.0722 * u[i * 4 + 2]!) / 65535
    alpha[i] = u[i * 4 + 3]! / 65535
  }
  return { lum, alpha }
}

async function loadSheet(sheet: FxSheetName, cellPx: number): Promise<{ meta: Meta; frames: FramePasses[] }> {
  const dir = join(RENDERS, sheet)
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta
  const frames: FramePasses[] = []
  for (let k = 0; k < meta.frames; k++) {
    const f = join(dir, `f${String(k).padStart(2, '0')}`)
    const lit = {} as Record<Pass, Float32Array>
    let alpha = new Float32Array(0)
    for (const p of PASSES) { const c = await read16(join(f, `${p}.png`), cellPx); lit[p] = c.lum; if (p === 'front') alpha = c.alpha }
    const emit = meta.emission ? (await read16(join(f, 'emit.png'), cellPx)).lum : new Float32Array(cellPx * cellPx)
    frames.push({ lit, alpha, emit })
  }
  return { meta, frames }
}

type Prepared = { readonly meta: Meta; readonly picked: FramePasses[]; readonly litK: number; readonly emitK: number; readonly metrics: SheetMetrics; readonly failures: string[] }
async function prepare(sheet: FxSheetName, cellPx: number, frames: number | null): Promise<Prepared> {
  const { meta, frames: raw } = await loadSheet(sheet, cellPx)
  const loop = LOOPING.includes(sheet)
  const seq = loop ? crossfadeLoop(raw, LOOP_BLEND) : raw
  const picked = pickFrames(seq.length, frames ?? seq.length, loop).map((i) => seq[i]!)
  const litK = litScale(picked), emitK = emitScale(picked)
  const metrics = measureSheet(picked, cellPx, litK, emitK)
  return { meta, picked, litK, emitK, metrics, failures: acceptance(sheet, metrics, picked.length) }
}

function atlas(cells: readonly Uint8Array[], cellPx: number): Uint8Array {
  const w = COLS * cellPx, out = new Uint8Array(w * ROWS * cellPx * 4)
  cells.forEach((c, cell) => {
    const ox = (cell % COLS) * cellPx, oy = Math.floor(cell / COLS) * cellPx
    for (let y = 0; y < cellPx; y++) out.set(c.subarray(y * cellPx * 4, (y + 1) * cellPx * 4), ((oy + y) * w + ox) * 4)
  })
  return out
}

async function packRung(ktx: string, rung: { cellPx: number; frames: number }): Promise<BakeReport> {
  const { cellPx, frames } = rung
  const prepared = {} as Record<FxSheetName, Prepared>
  for (const s of FX_SHEETS) prepared[s] = await prepare(s, cellPx, frames)
  const failures = FX_SHEETS.flatMap((s) => prepared[s].failures)
  if (failures.length > 0) throw new Error(`acceptance failed at ${cellPx} px x ${frames}:\n${failures.join('\n')}`)
  const builds = new Set(FX_SHEETS.map((s) => `${prepared[s].meta.blender} ${prepared[s].meta.buildHash}`))
  if (builds.size !== 1) throw new Error(`sheets were baked by different Blender builds: ${[...builds].join(', ')}`)
  const flows = Object.fromEntries(FX_SHEETS.map((s) => [s, flowSequence(prepared[s].picked, cellPx, prepared[s].litK, LOOPING.includes(s))])) as Record<FxSheetName, ReturnType<typeof flowSequence>>
  const motionScale = Number(motionScaleOf(FX_SHEETS.flatMap((s) => flows[s]), cellPx).toFixed(5))
  rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true })
  const pngs: Record<keyof typeof FILES, string[]> = { lightA: [], lightB: [], motion: [] }
  for (let k = 0; k < frames; k++) {
    const packed = FX_SHEETS.map((s) => packCell(prepared[s].picked[k]!, cellPx, prepared[s].litK, prepared[s].emitK))
    const motion = FX_SHEETS.map((s) => encodeMotion(flows[s][k]!, cellPx, motionScale))
    const layers = { lightA: atlas(packed.map((p) => p.a), cellPx), lightB: atlas(packed.map((p) => p.b), cellPx), motion: atlas(motion, cellPx) }
    for (const image of ['lightA', 'lightB', 'motion'] as const) {
      const png = join(WORK, `${image}-${String(k).padStart(2, '0')}.png`)
      await sharp(Buffer.from(layers[image]), { raw: { width: COLS * cellPx, height: ROWS * cellPx, channels: 4 } }).png().toFile(png)
      pngs[image].push(png)
    }
  }
  const files: Record<string, number> = {}
  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    const out = join(WORK, FILES[image])
    // E1 Ruling R8: Basis (ETC1S), linear; Ruling R5 keeps E1's encoder settings.
    execFileSync(ktx, ['create', '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '128',
      '--generate-mipmap', '--levels', String(mipLevels(cellPx)), '--layers', String(frames), ...pngs[image], out], { stdio: 'inherit' })
    const h = readKtx2Header(new Uint8Array(readFileSync(out)))
    if (h.layerCount !== frames) throw new Error(`${FILES[image]}: ${h.layerCount} layers, expected ${frames}`)
    files[FILES[image]] = statSync(out).size
  }
  const blender = [...builds][0]!
  const manifest = fxSheetManifestSchema.parse({
    version: 1, images: FILES, cellPx, cols: COLS, rows: ROWS, frames, motionScale,
    sheets: FX_SHEETS.map((name, cell) => ({ name, cell })),
    provenance: { generator: 'blender', seed: 0, blenderVersion: blender, sceneSha256: fxSceneSha256() },
  })
  const json = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(join(WORK, 'sheets.json'), json)
  files['sheets.json'] = Buffer.byteLength(json)
  return {
    rung, totalBytes: Object.values(files).reduce((a, b) => a + b, 0), files, motionScale, sceneSha256: manifest.provenance.sceneSha256!, blender,
    sheets: Object.fromEntries(FX_SHEETS.map((s) => [s, {
      metrics: prepared[s].metrics, litScale: prepared[s].litK, emitScale: prepared[s].emitK,
      bakeS: prepared[s].meta.bakeS, renderS: prepared[s].meta.renderS, samples: prepared[s].meta.samples,
    }])) as BakeReport['sheets'],
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv[0] === '--check') {
    const sheet = argv[1] as FxSheetName
    if (!(FX_SHEETS as readonly string[]).includes(sheet)) throw new Error(`--check needs a sheet: one of ${FX_SHEETS.join(', ')}`)
    const meta = JSON.parse(readFileSync(join(RENDERS, sheet, 'meta.json'), 'utf8')) as Meta
    const p = await prepare(sheet, meta.cellPx, null)
    const m = p.metrics
    console.log(JSON.stringify({ sheet, frames: p.picked.length, fill: m.fill, edgeAlpha: m.edgeAlpha, peakCoverage: Math.max(...m.coverageByFrame), aspectAtPeak: m.aspectAtPeak, emitFrames: m.emitFrames, seam: m.seam, step: m.step, sixWay: m.sixWay }, null, 2))
    if (p.failures.length > 0) { console.error(p.failures.join('\n')); process.exit(1) }
    console.log(`${sheet}: passes`)
    return
  }
  const ktx = await ktxBinary()
  for (const rung of LADDER) {
    const report = await packRung(ktx, rung)
    console.log(`fx:pack: ${rung.cellPx} px x ${rung.frames} frames = ${report.totalBytes} bytes`)
    if (report.totalBytes > FX_CONTENT_BYTES_MAX) continue
    for (const f of readdirSync(OUT)) rmSync(join(OUT, f))
    for (const f of Object.keys(report.files)) copyFileSync(join(WORK, f), join(OUT, f))
    writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n')
    console.log(`fx:pack: shipped ${rung.cellPx} px x ${rung.frames}; report in tools/fx/bake-report.json`)
    return
  }
  throw new Error(`fx:pack: no rung of ${JSON.stringify(LADDER)} fits ${FX_CONTENT_BYTES_MAX} bytes (spec §6.3)`)
}

await main()
```

`bake.ts` runs `main()` at import. The test imports only its type (`import type { BakeReport }`), which TypeScript erases, so the test never executes it. Keep that import `import type`.

- [ ] **Step 5: Delete the placeholder generator and fix the scripts.**

```bash
git rm -q tools/fx/build.ts tools/fx/placeholders.ts
```

In `package.json`, remove `"fx:placeholders"` and add, next to `fx:render`:

```json
"fx:pack": "tsx tools/fx/bake.ts",
"fx:bake": "tsx tools/fx/render.ts && tsx tools/fx/bake.ts",
```

Check nothing else referenced the placeholder generator: `grep -rn "placeholders\|fx:placeholders" src tools tests package.json` must print nothing. The README mention is fixed in Task 11.

- [ ] **Step 6: Run the tests.** `npx vitest run tests/tools/fxSheets.test.ts tests/tools/fxPack.test.ts tests/tools/fxRemote.test.ts`. Expected: PASS. The committed content is still the E1 placeholders (`generator: 'placeholder'`), so the two `blender` tests do not run yet; Task 7 makes them unconditional.

- [ ] **Step 7: Lint, typecheck, depcruise and commit.**

```bash
npx tsc --noEmit -p . && npx eslint --max-warnings 0 tools/fx tests/tools && npx depcruise src tools --config .dependency-cruiser.cjs
git add -A tools/fx package.json tests/tools/fxSheets.test.ts
git commit -m "E2 Task 3: fx:pack with the size ladder, manifest provenance and bake report; the placeholder generator goes (Rulings R2, R5)"
```

---

### Tasks 4–6: the six sheets

Each sheet task follows the same loop. For every sheet it names:

1. **Write the script**, exactly as given.
2. **Trial run** (minutes, not hours), then check it:

   ```bash
   FX_SIM_SCALE=0.4 FX_FRAMES=8 FX_CELL=128 FX_SAMPLES=16 npx tsx tools/fx/render.ts <sheet>; echo rc=$?
   npx tsx tools/fx/bake.ts --check <sheet>; echo rc=$?
   ```

   A trial is for finding a broken script quickly. At sim scale 0.4 the physics differs, so the trial's `fill` and `aspect` are only indicative. The edge and six-way rules must already pass.
3. **Full bake:** `npx tsx tools/fx/render.ts <sheet>; echo rc=$?`, then `npx tsx tools/fx/bake.ts --check <sheet>; echo rc=$?`. Record in the ledger: bake seconds, render seconds, and the `--check` JSON.
4. **If `--check` fails,** change only the knob its message names, in the direction given, then re-run step 3. Stop after **three** full rebakes of one sheet, record every attempt, mark the task blocked in the ledger, and write the handoff's "Blocked" section. An unattended run stops here rather than loosening a rule.

   | message | knob and direction |
   | --- | --- |
   | `the sim leaves the frame` | `ortho` +10%; if fill would drop under 0.5, instead lower the inflow `velocity` 15% |
   | `fill ... outside` (low) | `ortho` −10% |
   | `fill ... outside` (high) | `ortho` +10% |
   | `peak coverage ... under 0.05` | `scatter_material(density=...)` ×1.5 |
   | `does not burn out` | `fire=(burning_rate, ...)` ×1.4 |
   | `emits in only` / a steady flame not emitting in all frames | `fuel` ×1.3 |
   | `must be taller than it is wide` | inflow `velocity` z ×1.2 |
   | `loop seam` | `FIRST` (warm-up frames) ×1.5 |
   | `the <side> light does not brighten` | **not a knob.** It is a rig bug; stop and debug `rig.py` (superpowers:systematic-debugging). |

5. **Commit the script** (never the renders): `git add tools/fx/blender/<sheet>.py` and commit with the task's message. Each commit changes `fxSceneSha256()`, which is expected until Task 7 rebakes and repacks.

Never run step 3 while a Tier 2 GPU measurement is running on ryzen (Global Constraints).

---

### Task 4: `smoke` and `dust`

**Files:** Create `tools/fx/blender/smoke.py` and `tools/fx/blender/dust.py`.

- [ ] **Step 1: Write `smoke.py`.** This is the measured version from "Measured".

```python
# tools/fx/blender/smoke.py
"""The `smoke` sheet (design §6.1): gas, smoke only, dark and oily. Consumers: smoke columns,
engine smoke, the kill trail, the ship plume. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'smoke', 'cache')
SIM_FRAMES = max(8, round(96 * k))
dom = rig.gas_domain(scene, size=(8.0, 8.0, 10.0), center=(0.0, 0.0, 5.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.6, beta=0.4, vorticity=0.15)
src = rig.flow_sphere('puff', radius=0.9, location=(0.0, 0.0, 1.6), flow_type='SMOKE',
                      velocity=(0.0, 0.0, 2.5), stop_frame=max(3, round(10 * k)), density=1.0, temperature=1.0)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='smoke', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=10.5, center_z=5.0,
                 scatter=rig.scatter_material(density=6.0, albedo=0.35, anisotropy=0.2), bake_s=t)
```

- [ ] **Step 2: Write `dust.py`.**

```python
# tools/fx/blender/dust.py
"""The `dust` sheet (design §6.1): gas, smoke only, earth-toned (the tint is the catalog's). Consumers:
land impacts, collapses, `round.land`. A low, wide kick that barely rises. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'dust', 'cache')
SIM_FRAMES = max(8, round(80 * k))
dom = rig.gas_domain(scene, size=(10.0, 10.0, 8.0), center=(0.0, 0.0, 4.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.25, beta=0.0, vorticity=0.2)
src = rig.flow_sphere('kick', radius=1.0, location=(0.0, 0.0, 1.2), flow_type='SMOKE', velocity=(0.0, 0.0, 1.2),
                      velocity_normal=2.5, stop_frame=max(3, round(6 * k)), density=1.0, temperature=0.0)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='dust', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=10.5, center_z=4.0,
                 scatter=rig.scatter_material(density=5.0, albedo=0.6, anisotropy=0.1), bake_s=t)
```

- [ ] **Step 3: Trial, full bake and check each sheet** (loop steps 2–4 above). **Record `smoke`'s full bake and render seconds first.** If one sheet's render takes over 90 minutes, set `FX_SAMPLES=64` for every later full bake, and record that as a ruling.

- [ ] **Step 4: Commit.** `git add tools/fx/blender/smoke.py tools/fx/blender/dust.py && git commit -m "E2 Task 4: smoke and dust sheet scripts; full bakes pass --check (times in the ledger)"`

---

### Task 5: `fireball` and `flame`

**Files:** Create `tools/fx/blender/fireball.py` and `tools/fx/blender/flame.py`.

- [ ] **Step 1: Write `fireball.py`.**

```python
# tools/fx/blender/fireball.py
"""The `fireball` sheet (design §6.1): gas, fire and smoke from one burst that burns out into smoke.
Consumers: bomb, rocket, crash, kill, structure. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'fireball', 'cache')
SIM_FRAMES = max(8, round(72 * k))
dom = rig.gas_domain(scene, size=(10.0, 10.0, 12.0), center=(0.0, 0.0, 6.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.2, beta=1.2, vorticity=0.3, fire=(0.9, 0.6, 0.6))
src = rig.flow_sphere('charge', radius=1.2, location=(0.0, 0.0, 3.0), flow_type='BOTH', velocity=(0.0, 0.0, 3.0),
                      velocity_normal=6.0, stop_frame=max(3, round(6 * k)), density=0.8, temperature=2.0, fuel=1.6, subframes=2)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='fireball', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=12.6, center_z=6.0,
                 scatter=rig.scatter_material(density=5.0, albedo=0.3, anisotropy=0.2),
                 emission=rig.emission_material(density=5.0, strength=8.0), bake_s=t)
```

- [ ] **Step 2: Write `flame.py`.** It is a steady burner. `render.ts` asks for 64 + 8 frames (Ruling R7), rendered consecutively after `FIRST` warm-up frames.

```python
# tools/fx/blender/flame.py
"""The `flame` sheet (design §6.1): a small steady fire, rendered as consecutive frames after a warm-up
so the pack can crossfade it into a loop (plan E2 Ruling R7). Consumers: the rocket motor, `ship.fire`.
Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'flame', 'cache')
FIRST = max(4, round(40 * k))
SIM_FRAMES = FIRST + a['frames'] - 1
dom = rig.gas_domain(scene, size=(4.0, 4.0, 8.0), center=(0.0, 0.0, 4.0), res=max(32, round(128 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=0.1, beta=1.5, vorticity=0.4, dissolve=15, fire=(0.75, 0.3, 0.8))
src = rig.flow_sphere('burner', radius=0.6, location=(0.0, 0.0, 0.9), flow_type='FIRE', velocity=(0.0, 0.0, 1.0),
                      fuel=1.2, temperature=1.5, subframes=1)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='flame', a=a, cache=cache, sim_frames=SIM_FRAMES, first_frame=FIRST,
                 ortho=8.4, center_z=4.0, scatter=rig.scatter_material(density=2.0, albedo=0.3, anisotropy=0.1),
                 emission=rig.emission_material(density=2.0, strength=10.0), bake_s=t)
```

- [ ] **Step 3: Trial, full bake and check each sheet** (loop steps 2–4).

- [ ] **Step 4: Commit.** `git add tools/fx/blender/fireball.py tools/fx/blender/flame.py && git commit -m "E2 Task 5: fireball and flame sheet scripts; full bakes pass --check"`

---

### Task 6: `water-column` and `spray` (white gas, Ruling R4)

**Files:** Create `tools/fx/blender/water-column.py` and `tools/fx/blender/spray.py`.

- [ ] **Step 1: Write `water-column.py`.**

```python
# tools/fx/blender/water-column.py
"""The `water-column` sheet (design §6.1): a near-miss column as dense, forward-scattering white gas that
shoots up and falls back (negative density buoyancy), not Mantaflow liquid (plan E2 Ruling R4). Consumers:
`bomb.water`, `rocket.water`, `crash.water`. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'water-column', 'cache')
SIM_FRAMES = max(8, round(72 * k))
dom = rig.gas_domain(scene, size=(6.0, 6.0, 14.0), center=(0.0, 0.0, 7.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=-1.2, beta=0.0, vorticity=0.25)
src = rig.flow_sphere('column', radius=0.7, location=(0.0, 0.0, 1.0), flow_type='SMOKE', velocity=(0.0, 0.0, 14.0),
                      stop_frame=max(3, round(6 * k)), density=1.0, temperature=0.0, subframes=3)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='water-column', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=14.7, center_z=7.0,
                 scatter=rig.scatter_material(density=10.0, albedo=0.95, anisotropy=0.5), bake_s=t)
```

- [ ] **Step 2: Write `spray.py`.**

```python
# tools/fx/blender/spray.py
"""The `spray` sheet (design §6.1): a burst of white mist that falls and fades, as gas (plan E2 Ruling R4).
Consumers: crowns, base surge, `round.water`. Original work, AGPL-3.0-or-later."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402

a = rig.args()
scene = rig.reset()
k = a['sim_scale']
cache = os.path.join(a['out'], 'spray', 'cache')
SIM_FRAMES = max(8, round(48 * k))
dom = rig.gas_domain(scene, size=(8.0, 8.0, 8.0), center=(0.0, 0.0, 4.0), res=max(32, round(160 * k)),
                     frame_end=SIM_FRAMES, cache=cache, alpha=-0.8, beta=0.0, vorticity=0.3, dissolve=30)
src = rig.flow_sphere('burst', radius=0.6, location=(0.0, 0.0, 2.5), flow_type='SMOKE', velocity=(0.0, 0.0, 3.0),
                      velocity_normal=4.0, stop_frame=max(2, round(4 * k)), density=1.0, temperature=0.0, subframes=2)
t = rig.bake(dom)
rig.render_sheet(scene, dom, [src], sheet='spray', a=a, cache=cache, sim_frames=SIM_FRAMES, ortho=8.4, center_z=4.0,
                 scatter=rig.scatter_material(density=8.0, albedo=0.95, anisotropy=0.5), bake_s=t)
```

- [ ] **Step 3: Trial, full bake and check each sheet** (loop steps 2–4).

- [ ] **Step 4: Commit.** `git add tools/fx/blender/water-column.py tools/fx/blender/spray.py && git commit -m "E2 Task 6: water-column and spray as white gas (Ruling R4); full bakes pass --check"`

---

### Task 7: Bake all six from the final scripts, pack, and ship the sheets

**Files:**
- Modify: `content/fx/*` (regenerated), `tests/tools/fxSheets.test.ts` (the `blender` checks become unconditional)
- Create: `tools/fx/bake-report.json`

- [ ] **Step 1: Make the provenance checks unconditional.** In `tests/tools/fxSheets.test.ts`, replace `if (manifest.provenance.generator === 'blender') {` and its comment with an unconditional block, preceded by:

```ts
  it('ships baked sheets, not the E1 placeholders', () => {
    expect(manifest.provenance.generator).toBe('blender')
  })
```

Keep the two `it`s from that block, drop the `if` braces, and read `report` at the top level of the `describe`.

- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/tools/fxSheets.test.ts`. Expected: FAIL. The generator is `'placeholder'`, and `tools/fx/bake-report.json` does not exist.

- [ ] **Step 3: Rebake every sheet from the committed scripts, then pack.** Tasks 4–6 each changed the scene hash, so every sheet must come from the final scripts:

```bash
git status --short tools/fx/blender   # must print nothing: bake only committed scripts
npx tsx tools/fx/render.ts; echo rc=$?                     # all six, one at a time, on ryzen
nice -n 10 npx tsx tools/fx/bake.ts; rc=$?; echo rc=$rc    # ladder, KTX2, manifest, report (nexus)
```

Record in the ledger which rung shipped, the total bytes, and each sheet's times.

- [ ] **Step 4: Run the tests and see them pass.** `npx vitest run tests/tools/fxSheets.test.ts`. Expected: PASS. Then run the fx runtime units, which read the manifest's layout: `npx vitest run tests/render/fxSystem.test.ts tests/render/fxCatalog.test.ts tests/render/fxPass.test.ts tests/render/fxShading.test.ts tests/render/fxStress.test.ts tests/render/fxEvents.test.ts`. Also check nothing assumed E1's 16 frames or 128 px cell:

```bash
grep -rn "frames: 16\|cellPx: 128\|\b16 frames\b" src tests --include=*.ts
```

Every hit must be a test's own synthetic layout, or `sheets.ts`'s one-frame fallback. Anything reading `content/fx` must use the manifest.

- [ ] **Step 5: Full verify on ryzen.** `remote-run npm run verify; rc=$?; echo rc=$rc`. Must be 0, or fail only where the Task 0 baseline already failed.

- [ ] **Step 6: Commit.**

```bash
git add content/fx tools/fx/bake-report.json tests/tools/fxSheets.test.ts
git commit -m "E2 Task 7: six Blender-baked flipbooks replace the E1 placeholders (<rung> px x <frames>, <total> bytes)"
```

Fill in the real rung and total in the message.

---

### Task 8: The rocket motor on the `flame` sheet (Ruling R8)

**Files:**
- Modify: `src/render/fx/catalog.ts` (`RECIPE_IDS`, `SUSTAINED_RECIPES`, a `rocket.motor` recipe), `src/render/fx/events.ts` (`ROCKET_BURN_S` moves here; a `ROCKET_NOZZLE_AFT_M`; the `projectiles` loop), `src/render/ordnance.ts` (the flame pool, `flameInstances` and `ROCKET_BURN_S` go)
- Test: `tests/render/fxEvents.test.ts`, `tests/render/ordnance.test.ts`

**Interfaces:**
- Produces: `ROCKET_BURN_S` and `ROCKET_NOZZLE_AFT_M` exported from `src/render/fx/events.ts`; the recipe id `'rocket.motor'`; `FxWorldView['combat']` now includes `projectiles`.

- [ ] **Step 1: Write the failing tests.** Add to `tests/render/fxEvents.test.ts`, after the existing imports. Import `ROCKET_BURN_S` and `ROCKET_NOZZLE_AFT_M` from `../../src/render/fx/events.js` as well.

```ts
import { readFileSync } from 'node:fs'
import type { Projectile } from '../../src/sim/weapons/combat.js'
import { modelIO } from '../../tools/models/document.js'
import { measureDocument } from '../../tools/models/measure.js'

describe('the rocket motor (plan E2 Ruling R8)', () => {
  const rocket = (id: number, ageS: number, kind: Projectile['kind'] = 'rocket'): Projectile =>
    ({ owner: 'a', id, position: v3(100, 500, 0), previous: v3(99, 500, 0), velocity: v3(300, 0, 0), lifeS: 10, tracer: false, kind, ageS })

  it('a burning rocket carries a motor emitter at its nozzle; a spent rocket and a bomb carry none', () => {
    const { combat, aircraft } = base()
    const c = { ...combat, projectiles: [rocket(1, 0.2), rocket(2, ROCKET_BURN_S), rocket(3, 0.2, 'bomb')] }
    const motors = nextFxEvents(NO_FX_MEMORY, view(1, c, aircraft)).sustained.filter((s) => s.recipe === 'rocket.motor')
    expect(motors.map((m) => m.key)).toEqual(['rocket:1'])
    expect(motors[0]!.position.x).toBeCloseTo(100 - ROCKET_NOZZLE_AFT_M, 6)
    expect(motors[0]!.velocity).toEqual(v3(300, 0, 0))
    expect(motors[0]!.intensity).toBe(1)
  })

  it('ROCKET_NOZZLE_AFT_M is the HVAR model\'s aft end, measured rather than remembered', async () => {
    const m = measureDocument(await modelIO().readBinary(new Uint8Array(readFileSync('content/ordnance/hvar.glb'))))
    expect(-m.bounds.min[0]!).toBeCloseTo(ROCKET_NOZZLE_AFT_M, 2)
  })
})
```

In `tests/render/ordnance.test.ts`:
- Remove `ROCKET_BURN_S` and `flameInstances` from the import, and delete the test `'flameInstances keeps only rockets still burning (ageS < ROCKET_BURN_S)'`.
- Delete the test `"moves the motor flame to the rocket model's aft end, on its axis (not riding its back)"`.
- In `'adds its pools to the scene, all at zero count and hidden'`, change the `// bomb, rocket, flame` expectation to two pools (bomb and rocket).
- Rewrite `'update() positions live bombs/rockets and shows a flame only on a still-burning rocket'` as `'update() positions live bombs and rockets'`, destructuring `[bombMesh, rocketMesh]` and dropping the two `flameMesh` expectations.
- Add:

```ts
  it('draws no motor flame of its own: the fx system does (plan E2 Ruling R8)', () => {
    const o = createOrdnance(new Scene())
    expect(o.object.children.filter((c) => c instanceof InstancedMesh)).toHaveLength(2)
  })
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run tests/render/fxEvents.test.ts tests/render/ordnance.test.ts`. Expected: FAIL. `ROCKET_NOZZLE_AFT_M` is not exported, and there are 3 pools, not 2.

- [ ] **Step 3: Implement.**

In `src/render/fx/events.ts`:
- Import `length` and `scale` from `../../sim/math/vec3.js`, next to `add`.
- Change `FxWorldView`'s combat to `Pick<CombatState, 'impacts' | 'aircraft' | 'ships' | 'structures' | 'projectiles'>`.
- Move `ROCKET_BURN_S` here, with its whole doc comment unchanged, from `ordnance.ts`.
- Add:

```ts
/** The HVAR model's aft end, metres behind its origin along its axis: content/ordnance/hvar.glb's
 *  bounds min x is -0.758 (measured 2026-09-27; fxEvents.test.ts re-measures it). The axis sits
 *  0.09 m below the origin; ignored, against a 0.7-1.1 m flame (plan E2 Ruling R8). */
export const ROCKET_NOZZLE_AFT_M = 0.76
```

- Before the ships loop in `nextFxEvents`, add:

```ts
  for (const p of w.combat.projectiles) {
    if (p.kind !== 'rocket' || p.ageS >= ROCKET_BURN_S) continue
    const speed = length(p.velocity)
    const aft = speed > 1e-9 ? scale(p.velocity, -ROCKET_NOZZLE_AFT_M / speed) : ZERO
    sustained.push({ key: `rocket:${p.id}`, recipe: 'rocket.motor', intensity: 1, position: add(p.position, aft), velocity: p.velocity })
  }
```

In `src/render/fx/catalog.ts`:
- Add `'rocket.motor'` to `RECIPE_IDS`, after `'rocket.water'`, and to `SUSTAINED_RECIPES`.
- Add to `RAW`, after `'engine.smoke'`:

```ts
  // Plan E2 Ruling R8: the HVAR's motor, at its nozzle while it burns (events.ts ROCKET_BURN_S).
  // 90% inherited velocity leaves a plume of about 5 m behind a 300 m/s rocket.
  'rocket.motor': { emitters: [
    { mode: 'stream', sheet: 'flame', ratePerS: 90, lifeS: [0.05, 0.09], speedMps: [0, 2], direction: 'sphere', spreadDeg: 180, sizeM: [0.7, 1.1], alpha: 0.95, tint: [1, 1, 1], emissive: 1, dragPerS: 0, accelYMps2: 0, inheritVelocity: 0.9, frameRateHz: 24 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 30, lifeS: [1.2, 2.2], speedMps: [0, 1], direction: 'sphere', spreadDeg: 180, sizeM: [0.5, 3], alpha: 0.35, tint: [0.62, 0.62, 0.64], dragPerS: 1.2, accelYMps2: 0.2 },
  ], source: 'estimate (plan E2 Ruling R8): burn time mirrors hvar.burnS 1.0 s; plume and exhaust-smoke sizes are estimates' },
```

In `src/render/ordnance.ts`:
- Delete `ROCKET_BURN_S` (moved) and `flameInstances`.
- Delete the `flameMesh` pool, its comment, its `root.add`, its `apply(flameMesh, ...)` line, and the whole flame-translation block at the end of `setStoreModels`, from the comment "The flame box was centered..." through the closing `)` of `flameMesh.geometry.translate(...)`.
- Drop `MeshBasicMaterial` from the `three` import if nothing else uses it.
- Change the header comment's "bomb/rocket/flame pools" to "bomb and rocket pools", and add one line: "The rocket motor flame is src/render/fx's `rocket.motor` (plan E2 Ruling R8)."
- Change `update()`'s doc to "Positions every live bomb and rocket instance".

- [ ] **Step 4: Run the tests and see them pass.** `npx vitest run tests/render/fxEvents.test.ts tests/render/ordnance.test.ts tests/render/fxCatalog.test.ts tests/render/fxSystem.test.ts`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint and commit.**

```bash
npx tsc --noEmit -p . && npx eslint --max-warnings 0 src/render/fx src/render/ordnance.ts tests/render
git add src/render/fx/events.ts src/render/fx/catalog.ts src/render/ordnance.ts tests/render/fxEvents.test.ts tests/render/ordnance.test.ts
git commit -m "E2 Task 8: the rocket motor is a flame-sheet stream at the HVAR nozzle; the flame box goes (Ruling R8)"
```

---

### Task 9: Retune the catalog to keep every effect's visible size (Ruling R9)

**Files:**
- Modify: `src/render/fx/catalog.ts` (numbers only, and `source` strings)
- Create: `tests/render/fxVisibleExtent.e1.json` (snapshot), `tests/render/fxVisibleExtent.test.ts`

- [ ] **Step 1: Snapshot E1's visible extents before touching a number.** Run once from the worktree root, and commit the output with this task:

```bash
cat > .tmp-extent.mts <<'EOF'
import { writeFileSync } from 'node:fs'
import { FX_CATALOG, RECIPE_IDS } from './src/render/fx/catalog.js'
// E1's placeholder fill, measured 2026-09-27 (plan E2, "Measured").
const FILL: Record<string, number> = { fireball: 0.719, smoke: 0.719, dust: 0.719, 'water-column': 0.797, spray: 0.719, flame: 0.688 }
const out: Record<string, (readonly [number, number] | null)[]> = {}
for (const id of RECIPE_IDS) {
  if (id === 'rocket.motor') continue // new in E2 (Task 8); sized on the baked sheet, not carried over
  out[id] = FX_CATALOG[id].emitters.map((e) => e.sheet === 'streak' ? null : [e.sizeM[0] * FILL[e.sheet]!, e.sizeM[1] * FILL[e.sheet]!] as const)
}
writeFileSync('tests/render/fxVisibleExtent.e1.json', JSON.stringify(out, null, 2) + '\n')
EOF
npx tsx .tmp-extent.mts && rm .tmp-extent.mts
```

- [ ] **Step 2: Write the failing test** `tests/render/fxVisibleExtent.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FX_CATALOG, type RecipeId } from '../../src/render/fx/catalog.js'
import type { BakeReport } from '../../tools/fx/bake.js'

const e1 = JSON.parse(readFileSync('tests/render/fxVisibleExtent.e1.json', 'utf8')) as Record<string, ([number, number] | null)[]>
const report = JSON.parse(readFileSync('tools/fx/bake-report.json', 'utf8')) as BakeReport

describe('baked sheets keep each effect its E1 visible size (plan E2 Ruling R9)', () => {
  for (const [id, sizes] of Object.entries(e1)) {
    it(id, () => {
      FX_CATALOG[id as RecipeId].emitters.forEach((e, i) => {
        const want = sizes[i]
        if (e.sheet === 'streak' || want === null || want === undefined) return
        const fill = report.sheets[e.sheet].metrics.fill
        // 2 significant figures of rounding is at most 5%; 6% leaves the float slack.
        expect(Math.abs(e.sizeM[0] * fill - want[0]) / want[0], `${id} emitter ${i} start`).toBeLessThanOrEqual(0.06)
        expect(Math.abs(e.sizeM[1] * fill - want[1]) / want[1], `${id} emitter ${i} end`).toBeLessThanOrEqual(0.06)
      })
    })
  }
})
```

- [ ] **Step 3: Run it and see it fail** (unless every baked fill happens to equal E1's): `npx vitest run tests/render/fxVisibleExtent.test.ts`.

- [ ] **Step 4: Retune.** For each sheet, compute `k = FILL_E1[sheet] / report.sheets[sheet].metrics.fill`, and write the six values in the ledger. Then multiply both numbers of every non-streak `sizeM` that draws that sheet by its `k`, rounded to 2 significant figures.

   The sizes live in the helper call sites and inline emitters of `catalog.ts`: `fireball(...)`'s `size` argument at each call, `column(...)`, `waterColumn(...)`, `crown`, `surge`, and the inline emitters in `round.*`, `kill.air`, `engine.smoke`, `ship.fire`, `structure.collapse` and `rocket.motor`. `smaller()` scales from those, so leave it alone. `crown` and `surge` hard-code `sizeM` inside the helper; change them there.

   Then update `ESTIMATE` to read `'estimate (sizes carried from E1 through the baked sheets\' fill, plan E2 Ruling R9; E3 replaces the water figures with cited ones, design §5.1)'`. **Change no other field** (spec §6.4: "the catalog's tuning").

- [ ] **Step 5: Run the tests and see them pass.** `npx vitest run tests/render/fxVisibleExtent.test.ts tests/render/fxCatalog.test.ts tests/render/fxSystem.test.ts`.

- [ ] **Step 6: Commit.**

```bash
git add src/render/fx/catalog.ts tests/render/fxVisibleExtent.e1.json tests/render/fxVisibleExtent.test.ts
git commit -m "E2 Task 9: catalog sizes carried through the baked sheets' fill (Ruling R9)"
```

---

### Task 10: Tier 2 on the reference GPU

**Files:**
- Modify: `tests/e2e/ordnance.spec.ts` (one new test)
- Test: `tests/e2e/fx.spec.ts`, `tests/e2e/fx-budget.spec.ts`, `tests/e2e/budget4k.spec.ts`, `tests/e2e/ordnance.spec.ts`

Set up per README's "Tier 2: the GPU harness" and repo `CLAUDE.md`'s "GPU work". Pick a free dev slot first. `ss -ltn | grep -E ':517[45]'` shows which ports are taken, and the 7f and sortie-forms worktrees may hold one. Point this worktree's `vite.config.ts` at it (local scratch, never committed), and assert the host answers `200` before running. **No bake may run on ryzen during this task.**

- [ ] **Step 1: Write the new test.** Add to `tests/e2e/ordnance.spec.ts`, reusing that file's `URL_`, `startGame` and `view`:

```ts
test('a fired rocket pair draws its motor flame from the fx system while it burns (plan E2 Ruling R8)', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL_)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  await startGame(page, { loadout: 'Both' })
  const fx = () => page.evaluate(() => (window as DiagWindow).__ww2!.fx())
  const before = (await fx()).live
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await view(page)).rockets, { timeout: 2_000 }).toBeGreaterThanOrEqual(2)
  // From 1,500 m the pair is seconds from any impact: every new particle is motor or exhaust.
  await expect.poll(async () => (await fx()).live - before, { timeout: 1_000 }).toBeGreaterThanOrEqual(5)
  await page.screenshot({ path: `${process.env.FX_SHOTS_DIR ?? 'test-results/fx-shots'}/rocket-motor.png` })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
```

If the sortie-forms branch has merged into this branch's base by then, `startGame`'s signature may have changed. Use whatever `tests/e2e/harness.ts` offers for a "Both" loadout, and record it in the ledger.

- [ ] **Step 2: Run the fx specs with captures.**

```bash
export FX_SHOTS_DIR=docs/handoff/2026-09-2x-e2-flipbooks-shots   # the real date
npx playwright test tests/e2e/fx.spec.ts tests/e2e/ordnance.spec.ts; rc=$?; echo rc=$rc
```

Expected: all green, including `sheetsFallback: false` in the boot test. Open every capture and check it: none black, no plume upside down, no cell showing its neighbor's sheet at the edge. If a pixel-count threshold in `fx.spec.ts` fails, first check that Task 9's test is green, then measure. Do not change a threshold without a ledger ruling that quotes the measured before and after.

- [ ] **Step 3: Run the cost gates at 1440p.**

```bash
npx playwright test tests/e2e/fx-budget.spec.ts tests/e2e/budget4k.spec.ts; rc=$?; echo rc=$rc
```

Gates: gpu p95 with effects ≤ +1.0 ms over `?fx=off` at 1440p High (E1 measured +0.360 ms), plus the 6.0 ms tripwire and 4K limits. The E1 handoff records two shared current-`main` baseline misses; compare against those, not against zero. **If the fx gate fails:** re-pack at the next ladder rung by editing `LADDER` so it starts there, and record that as a ruling. Re-run, and stop at 192 px. If it still fails, record the numbers and mark the task blocked.

- [ ] **Step 4: Commit the test and the captures.**

```bash
git add tests/e2e/ordnance.spec.ts docs/handoff/*-e2-flipbooks-shots
git commit -m "E2 Task 10: reference-GPU Tier 2: fx, ordnance (motor flame), fx-budget and 4K gates green; captures"
```

---

### Task 11: Docs, handoff, and Mark's checkpoint

**Files:**
- Create: `docs/handoff/<date>-e2-flipbooks.md`, `docs/fx-bake.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15, the "Effects realism" row only), `README.md` (the E1 paragraph near line 88), `CLAUDE.md` (the Blender paragraph, one pointer), `docs/superpowers/specs/2026-09-26-ordnance-and-effects-design.md` (§6.1, one dated amendment line under the table)

- [ ] **Step 1: Write `docs/fx-bake.md`,** the runbook. Point to the owning files instead of restating them. It covers:
   - what runs where: the bake on ryzen with the blender.org build (Ruling R1, `serverconfig/ryzen.md`), and the pack on nexus;
   - the three commands (`fx:render`, `fx:pack` with `--check`, `fx:bake`) and the trial environment variables;
   - where frames land (`tools/fx/renders/`) and why not in a cache path (R10);
   - that bakes are not reproducible and what the provenance test enforces (R2);
   - the acceptance rules, by pointing to `tools/fx/pack.ts` `acceptance`;
   - the ladder (R5);
   - the traps from "Measured": the VDB corner offset, `/tmp` on WSL, and EEVEE.

- [ ] **Step 2: Update the pointers.**
   - **`CLAUDE.md`:** the Blender paragraph already describes the one blender.org build (updated 2026-09-27, with the header's amendment). Add one sentence at its end: "Effects flipbooks bake with it on ryzen: `docs/fx-bake.md`." Re-read the paragraph so it is still true.
   - **Design spec §6.1:** add one line under the table: "**Amended 2026-09-27 (plan E2 Ruling R4):** `water-column` and `spray` are baked as white gas, not liquid; see the E2 handoff."
   - **README:** replace "The shipped flipbooks are code-generated placeholders for E2, not final art." with one sentence saying E2's Blender-baked sheets replaced them, pointing at §15 and the E2 handoff.
   - **§15 "Effects realism" row:** replace "E2 (baked flipbooks) and E3 (water) not started." with an E2-complete clause (date, the Tier 1 and reference-GPU Tier 2 result, plan/handoff links, the shipped rung and bytes, and Ruling R4 as open for Mark) followed by "E3 (water) not started." Escape any `|`.

- [ ] **Step 3: Write the handoff** `docs/handoff/<date>-e2-flipbooks.md`, in the shape of the E1 handoff. Include:
   - a commit table;
   - each sheet's bake and render time, and its `--check` numbers from `tools/fx/bake-report.json`;
   - the shipped rung and bytes per file;
   - Tier 2 numbers against E1's (+0.360 ms fx, 4K photo 16.062 ms);
   - the captures, each with one line saying what it shows;
   - every ruling added in the ledger;
   - **"Open for Mark":** (1) Ruling R4, the water sheets as gas, which the checkpoint should look at; (2) the look, with links (links only, R11) to one public reference image each for an IL-2 Great Battles bomb, an MSFS or DCS smoke column, and a WWII near-miss photograph from NHHC; (3) anything blocked.

- [ ] **Step 4: Final verify and push the branch.**

```bash
git -C . log --oneline main..HEAD | cat
remote-run npm run verify; rc=$?; echo rc=$rc
git add -A docs CLAUDE.md README.md && git commit -m "E2 Task 11: handoff, runbook, §15 row and doc pointers"
git push -u origin worktree-e2-flipbooks
```

`rc` must be 0. Push the branch only. Merging into `main` is Mark's call (repo `CLAUDE.md`).

- [ ] **Step 5: The checkpoint (final product; unattended, so do not wait).** Start the worktree's dev server on its slot, and assert the host is up (`curl -sS -o /dev/null -w '%{http_code}\n' https://<slot host>/` → `200`). Put the URL, and the three captures to look at first (bomb on water, air kill, rocket motor), at the top of the handoff. Email Mark the handoff as HTML:

```bash
python3 /home/mark/projects/ww2airsim/tools/mail-doc.py docs/handoff/<date>-e2-flipbooks.md "ww2airsim E2 baked flipbooks: handoff and checkpoint"
```

It exits 0 and prints a byte count. Never re-run it with `--debug` to confirm; that sends the mail again.
