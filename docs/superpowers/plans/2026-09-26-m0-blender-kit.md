# M0: the Blender model kit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a headless, byte-reproducible Blender authoring kit under `tools/models/blender/` and prove it on the barrel-roof hangar, without touching any file the O1 worktree owns.

**Architecture:** A TypeScript runner (`run.ts`) is the only way to call Blender. It checks the pinned version, runs a model script with `--python-exit-code 1`, and refuses a run that leaves no output. A Python kit (`kit.py`) builds geometry in the **glTF frame** (+x forward, +y up, meters). It groups faces into one node per palette role and exports with pinned options, so a model script is mostly cited numbers. The M0 output goes only to the gitignored `content/models/candidates/`, because the manifest's `blender` source kind is M1's job, after O1 merges.

**Tech Stack:** Blender 5.0.1 (Python `bpy`, glTF exporter), TypeScript run by `tsx`, vitest, `@gltf-transform/core` through the existing `tools/models/document.ts` and `measure.ts`.

**Spec:** `docs/superpowers/specs/2026-09-26-model-roster-design.md` (M0 row of §5; §4.2; §7; §8).

**Viewing checkpoint:** per family, unattended (Mark, 2026-09-26). M0 has no family, and its output cannot reach the Hangar until M1. So the checkpoint is Blender-rendered previews of the hangar, committed under `docs/handoff/2026-09-26-m0-shots/` and emailed with the handoff. Nothing waits on Mark.

**Attended or unattended:** unattended. Run to completion without stopping.

**Worktree and branch:** `.claude/worktrees/models-roster`, branch `worktree-models-roster` (it already exists and holds the spec). No dev-server slot is needed.

## Global Constraints

- Blender is exactly **5.0.1**. Any other version is an error, not a warning (spec §4.1).
- Every Blender run uses `-b --factory-startup --python-exit-code 1`. Without the last flag, a script that raises still exits 0 (measured 2026-09-26: `rc=0` without it, `rc=1` with it).
- Blender runs are **serial**: never two at once, and never inside a parallel vitest pool with other heavy suites (nexus OOM history).
- Kit geometry is written in the glTF frame: **+x forward, +y up, meters**. A building's open side faces **+z**, matching `src/render/scene/buildings.ts`.
- There is no randomness in the kit or in model scripts. `PYTHONHASHSEED=0` is set by the runner anyway.
- A model script is **original work, AGPL-3.0-or-later**. Its header cites every dimension with a read date and labels each estimate `ESTIMATE`.
- **Do not modify:** `tools/models/manifest.ts`, `tools/models/build.ts`, `tools/models/entries/`, `src/render/hangar/`, `package.json`. They are O1's or M1's (spec §5).
- US spelling. Escape `|` as `\|` in table cells.
- `npm run verify` goes through `remote-run` and ends the plan. On nexus, run only the files you touch.

## Review Focus

1. **A Blender script that raises must fail the run.** Expected: `runBlenderScript` throws with the Python traceback tail (Task 1, test "a raising script fails").
2. **Stale output must not pass as fresh.** Suppose an old `<out>.glb` exists and the new run writes nothing. Expected: the runner throws, because it deletes `out` before running (Task 1, test "no output is an error even if a stale file existed").
3. **A different Blender version must fail loudly, not skip.** Only an *absent* Blender skips, by name. A present-but-wrong one fails (Task 1, `assertBlenderVersion` tests).
4. **Faces must point outward.** An inverted winding renders as a see-through hangar under three.js back-face culling. Expected: every kit face normal points away from its solid's center (Task 2, "outward normals" test).
5. **Bad model arguments must be refused.** `--width -5` or `--width abc` must be an error, not a silently degenerate mesh (Task 3, "refuses bad arguments" test).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `tools/models/blender/run.ts` | Find and version-check Blender, and run one script to one output. It is the only place that spawns Blender |
| `tools/models/blender/cli.ts` | `npx tsx tools/models/blender/cli.ts <id> [--key value…]` builds `tools/models/blender/<id>.py` into `content/models/candidates/<id>.glb`, and prints its measurements |
| `tools/models/blender/kit.py` | The palette, glTF-frame geometry primitives (`box`, `barrel_vault`, `arch_gable`), the `Model` accumulator (one node per role), CLI argument parsing, and the pinned export |
| `tools/models/blender/hangar.py` | The proof model: a barrel-roof hangar at the Tacloban footprint |
| `tools/models/blender/preview.py` | Renders a glb to PNG with Cycles on the CPU, for handoff captures |
| `tests/tools/models/blender/run.test.ts` | Runner behavior: version parsing and pinning, error propagation, stale output |
| `tests/tools/models/blender/fixtures/kit_probe.py` | A tiny script exercising every kit primitive, used by the kit tests |
| `tests/tools/models/blender/kit.test.ts` | Kit behavior: frame, node naming, draw calls, outward normals, byte-identical rebuild |
| `tests/tools/models/blender/hangar.test.ts` | Hangar dimensions against its cited figures, budget, argument checks, byte-identical rebuild |

**Ruling for this plan:** spec §4.2's kit table also lists the lofted fuselage, wing, propeller and hull. Those are added by M2 and M3, beside their first real consumer, where each can be tested against a real model. M0 builds only what the hangar needs plus the determinism core. This follows the spec's "M0 proves the kit on one model". Record it in the ledger.

---

### Task 0: Ledger (setup, no commit)

- [ ] **Step 1: Confirm the worktree and Blender.**

Run from `.claude/worktrees/models-roster`:
```sh
git status -sb && git log --oneline -1 && blender --version | head -1
```
Expected: branch `worktree-models-roster`, clean, top commit is the M0 plan (or the spec), and `Blender 5.0.1`.

- [ ] **Step 2: Rebase on `main`** (spec §5: each plan rebases before it starts).
```sh
git fetch -q . main:main 2>/dev/null; git rebase main
```
Expected: success, or "is up to date".

- [ ] **Step 3: The ledger.** Create `.superpowers/sdd/m0/progress.md`:
```markdown
# M0 ledger — docs/superpowers/plans/2026-09-26-m0-blender-kit.md
Branch worktree-models-roster. Unattended; checkpoint = Blender previews in the handoff.
Ruling: kit parts for aircraft and hulls deferred to M2/M3 (plan header).
```
Append one line per completed task, and a `Ruling:` line for any departure from this plan.

---

### Task 1: The Blender runner

**Files:**
- Create: `tools/models/blender/run.ts`
- Test: `tests/tools/models/blender/run.test.ts`

**Interfaces:**
- Produces:
  - `BLENDER_VERSION: '5.0.1'`
  - `parseBlenderVersion(stdout: string): string | null`
  - `installedBlenderVersion(bin?: string): string | null`
  - `assertBlenderVersion(found: string | null): void`
  - `runBlenderScript(script: string, out: string, args?: readonly string[], bin?: string): void`
  - `HAVE_BLENDER: boolean` (true when the `blender` on PATH reports any version; tests skip by name when false)

- [ ] **Step 1: Write the failing test.**

`tests/tools/models/blender/run.test.ts`:
```ts
// tests/tools/models/blender/run.test.ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BLENDER_VERSION, HAVE_BLENDER, assertBlenderVersion, parseBlenderVersion, runBlenderScript } from '../../../../tools/models/blender/run.js'

describe('Blender version pinning (model-roster spec §4.1)', () => {
  it('parses the version line Blender prints', () => {
    expect(parseBlenderVersion('Blender 5.0.1\n\tbuild date: 2025-12-01\n')).toBe('5.0.1')
    expect(parseBlenderVersion('Color management: ...\nBlender 4.2.3 LTS\n')).toBe('4.2.3')
    expect(parseBlenderVersion('bash: blender: command not found')).toBeNull()
  })
  it('accepts only the pinned version, and names what it found', () => {
    expect(BLENDER_VERSION).toBe('5.0.1')
    expect(() => assertBlenderVersion('5.0.1')).not.toThrow()
    expect(() => assertBlenderVersion('5.0.2')).toThrow(/5\.0\.2 found; models need exactly 5\.0\.1/)
    expect(() => assertBlenderVersion(null)).toThrow(/not found on PATH/)
  })
})

// A named skip, not a vanishing one: ryzen has no Blender (checked 2026-09-26), so there
// these print as skipped and must be run on nexus by name (spec §7).
describe.skipIf(!HAVE_BLENDER)('runBlenderScript against the real Blender', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm0-run-'))
  const script = (name: string, body: string): string => {
    const p = join(dir, name)
    writeFileSync(p, body)
    return p
  }

  it('passes the output path and extra args after --, and succeeds when the file is written', () => {
    const s = script('ok.py', [
      'import sys',
      'argv = sys.argv[sys.argv.index("--") + 1:]',
      'assert argv[1:] == ["--width", "3"], argv',
      'open(argv[0], "wb").write(b"glTF")',
    ].join('\n'))
    const out = join(dir, 'ok.glb')
    runBlenderScript(s, out, ['--width', '3'])
    expect(existsSync(out)).toBe(true)
  }, 60_000)

  it('a raising script fails, with the traceback in the message', () => {
    const s = script('boom.py', 'raise RuntimeError("kit-boom-7")\n')
    expect(() => runBlenderScript(s, join(dir, 'boom.glb'))).toThrow(/kit-boom-7/)
  }, 60_000)

  it('no output is an error even if a stale file existed', () => {
    const out = join(dir, 'stale.glb')
    writeFileSync(out, 'old bytes')
    const s = script('silent.py', 'pass\n')
    expect(() => runBlenderScript(s, out)).toThrow(/wrote no/)
    expect(existsSync(out)).toBe(false)
  }, 60_000)
})
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npx vitest run tests/tools/models/blender/run.test.ts`
Expected: FAIL, "Cannot find module .../tools/models/blender/run.js".

- [ ] **Step 3: Write the runner.**

`tools/models/blender/run.ts`:
```ts
// tools/models/blender/run.ts
/**
 * The one place Blender is spawned (model-roster spec §4.1). Three traps it exists for,
 * each measured on nexus 2026-09-26:
 *  - Blender exits 0 when a -P script raises, unless given --python-exit-code 1.
 *  - A run that writes nothing would leave a previous run's file looking fresh, so
 *    the output is deleted first and its absence afterwards is an error.
 *  - Another Blender is another glTF exporter, and the bytes change silently, so the
 *    version is pinned exactly.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

export const BLENDER_VERSION = '5.0.1'

export function parseBlenderVersion(stdout: string): string | null {
  const m = /^Blender (\d+\.\d+\.\d+)/m.exec(stdout)
  return m ? m[1]! : null
}

export function installedBlenderVersion(bin = 'blender'): string | null {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  return parseBlenderVersion(r.stdout)
}

/** Present at any version. A wrong version must fail a test, not skip it. */
export const HAVE_BLENDER = installedBlenderVersion() !== null

export function assertBlenderVersion(found: string | null): void {
  if (found === null) throw new Error(`blender not found on PATH; models need Blender ${BLENDER_VERSION}`)
  if (found !== BLENDER_VERSION) {
    throw new Error(`blender ${found} found; models need exactly ${BLENDER_VERSION} (another exporter version changes the bytes)`)
  }
}

const tail = (s: string): string => s.trim().split('\n').slice(-25).join('\n')

/** Runs `script` headless as `blender ... -P script -- out ...args`; throws unless it exits 0 AND writes `out`. */
export function runBlenderScript(script: string, out: string, args: readonly string[] = [], bin = 'blender'): void {
  assertBlenderVersion(installedBlenderVersion(bin))
  mkdirSync(dirname(out), { recursive: true })
  rmSync(out, { force: true })
  const r = spawnSync(bin, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script, '--', out, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONHASHSEED: '0' },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw r.error
  const log = `${r.stdout}\n${r.stderr}`
  if (r.status !== 0) throw new Error(`blender ${script} exited ${r.status}:\n${tail(log)}`)
  if (!existsSync(out) || statSync(out).size === 0) throw new Error(`blender ${script} exited 0 but wrote no ${out}:\n${tail(log)}`)
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npx vitest run tests/tools/models/blender/run.test.ts`
Expected: PASS, 5 tests, 0 skipped on nexus.

- [ ] **Step 5: Lint and typecheck the new files.**

Run: `npx eslint --max-warnings 0 tools/models/blender tests/tools/models/blender && npx tsc --noEmit -p .; echo rc=$?`
Expected: `rc=0`.

- [ ] **Step 6: Commit.**
```sh
git add tools/models/blender/run.ts tests/tools/models/blender/run.test.ts
git commit -m "M0: the Blender runner -- pinned 5.0.1, --python-exit-code 1, stale output refused"
```

---

### Task 2: The kit

**Files:**
- Create: `tools/models/blender/kit.py`
- Create: `tests/tools/models/blender/fixtures/kit_probe.py`
- Test: `tests/tools/models/blender/kit.test.ts`

**Interfaces:**
- Consumes: `runBlenderScript`, `HAVE_BLENDER` (Task 1); `modelIO` (`tools/models/document.ts`); `measureDocument` (`tools/models/measure.ts`).
- Produces, in Python (`import kit` after putting `tools/models/blender` on `sys.path`):
  - `PALETTE: dict[str, tuple[float, float, float]]`, the sRGB 0-1 values for roles `steel`, `concrete`, `dark`, `timber`
  - `cli_args() -> tuple[str, dict[str, str]]`, the output path and `--key value` pairs after `--`
  - `positive(opts, key, default) -> float`, which raises `ValueError` naming the key when a value is not a finite number > 0
  - `class Model(name)` with:
    - `box(role, base, size, node=None)`: base = bottom-center `(x, y, z)`; size = `(width_x, height_y, length_z)`
    - `barrel_vault(role, spring, width, rise, length, thickness, segments, node=None)`: a half-elliptic shell along z; `spring` = `(x, y, z)` of the springing line's center
    - `arch_gable(role, base, width, wall, rise, thickness, segments, node=None)`: a wall of rectangle plus half-ellipse, `thickness` along z, centered on `base[2]`
    - `export(path)`, which builds one Blender object per node and writes the glb
  - Node naming: a part with no `node` goes into `f"{name}_{role}"`. The root empty is named `name`. Children are sorted by name.

- [ ] **Step 1: Write the probe fixture.**

`tests/tools/models/blender/fixtures/kit_probe.py`:
```python
# tests/tools/models/blender/fixtures/kit_probe.py -- exercises every kit primitive once.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
import kit

out, opts = kit.cli_args()
m = kit.Model('probe')
m.box('concrete', (0.0, 0.0, 0.0), (2.0, 1.0, 4.0))
m.barrel_vault('steel', (10.0, 1.0, 0.0), 6.0, 1.5, 8.0, 0.2, 12)
m.arch_gable('steel', (20.0, 0.0, 0.0), 6.0, 1.0, 1.5, 0.3, 12)
m.box('dark', (0.0, 0.0, 10.0), (1.0, 1.0, 1.0), node='probe_door')
m.export(out)
```

- [ ] **Step 2: Write the failing test.**

`tests/tools/models/blender/kit.test.ts`:
```ts
// tests/tools/models/blender/kit.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBounds } from '@gltf-transform/functions'
import type { Document, Node } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
import { modelIO, findNode, onlyScene } from '../../../../tools/models/document.js'
import { measureDocument } from '../../../../tools/models/measure.js'

const PROBE = 'tests/tools/models/blender/fixtures/kit_probe.py'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

/** World-space triangles of one node: [a, b, c] each an [x, y, z]. */
function triangles(node: Node): number[][][] {
  const m = node.getWorldMatrix()
  const out: number[][][] = []
  for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!
    const idx = prim.getIndices()!
    const v = (i: number): number[] => {
      const [x, y, z] = pos.getElement(idx.getScalar(i), [0, 0, 0]) as number[]
      return [0, 1, 2].map((r) => m[r]! * x! + m[4 + r]! * y! + m[8 + r]! * z! + m[12 + r]!)
    }
    for (let i = 0; i < idx.getCount(); i += 3) out.push([v(i), v(i + 1), v(i + 2)])
  }
  return out
}

// Builds run in beforeAll, never in the describe body: vitest runs a skipped suite's body
// to collect it, so a build there would error on ryzen instead of skipping by name.
describe.skipIf(!HAVE_BLENDER)('the Blender kit (model-roster spec §4.2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm0-kit-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  beforeAll(async () => {
    runBlenderScript(PROBE, a)
    runBlenderScript(PROBE, b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
  }, 120_000)

  it('rebuilds byte-identically', () => {
    expect(sha(b)).toBe(sha(a))
  })

  it('one root named for the model, one child per role or named node, sorted', () => {
    const roots = onlyScene(doc).listChildren()
    expect(roots.map((n) => n.getName())).toEqual(['probe'])
    expect(roots[0]!.listChildren().map((n) => n.getName())).toEqual(['probe_concrete', 'probe_door', 'probe_steel'])
  })

  it('one draw call per node, flat materials named by role, metalness 0', () => {
    expect(measureDocument(doc).drawCalls).toBe(3)
    const mats = doc.getRoot().listMaterials()
    expect(mats.map((m) => m.getName()).sort()).toEqual(['concrete', 'dark', 'steel'])
    for (const mat of mats) expect(mat.getMetallicFactor()).toBe(0)
  })

  it('writes the glTF frame as given: the box spans x ±1, y 0..1, z ±2', () => {
    const bb = getBounds(findNode(doc, 'probe_concrete'))
    for (const [got, want] of [[bb.min, [-1, 0, -2]], [bb.max, [1, 1, 2]]] as const) {
      got.forEach((g, i) => expect(g).toBeCloseTo(want[i]!, 5))
    }
  })

  it('the vault: outer width 6 at the spring line, rise 1.5 above y = 1, length 8 along z', () => {
    const tris = triangles(findNode(doc, 'probe_steel')).flat().filter((p) => p[0]! > 5 && p[0]! < 15)
    const xs = tris.map((p) => p[0]!), ys = tris.map((p) => p[1]!), zs = tris.map((p) => p[2]!)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 5)
    expect(Math.min(...ys)).toBeCloseTo(1, 5)
    expect(Math.max(...ys)).toBeCloseTo(2.5, 5)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(8, 5)
  })

  it('outward normals: every face of every solid points away from its solid center', () => {
    // Solids are separated in x (box at 0, vault at 10, gable at 20), so a face belongs to
    // the solid whose center is nearest. The vault is a shell: its inner surface faces the
    // axis and its outer surface faces away, so for it "outward" is measured from the
    // springing axis (x=10, y=1), in the x-y plane only.
    const centers: Record<string, number[]> = { box: [0, 0.5, 0], vault: [10, 1, 0], gable: [20, 1.5, 0] }
    for (const node of ['probe_concrete', 'probe_steel']) {
      for (const [p, q, r] of triangles(findNode(doc, node))) {
        const u = [q![0]! - p![0]!, q![1]! - p![1]!, q![2]! - p![2]!]
        const w = [r![0]! - p![0]!, r![1]! - p![1]!, r![2]! - p![2]!]
        const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]
        const c = [(p![0]! + q![0]! + r![0]!) / 3, (p![1]! + q![1]! + r![1]!) / 3, (p![2]! + q![2]! + r![2]!) / 3]
        const solid = c[0]! < 5 ? 'box' : c[0]! < 15 ? 'vault' : 'gable'
        const o = centers[solid]!
        if (solid === 'vault') {
          const radial = [c[0]! - o[0]!, c[1]! - o[1]!]
          const rim = Math.abs(Math.abs(c[2]!) - 4) < 1e-4 // the two end rims face ±z
          if (rim) expect(Math.sign(n[2]!), `vault rim at z=${c[2]}`).toBe(Math.sign(c[2]!))
          else {
            const dot = n[0]! * radial[0]! + n[1]! * radial[1]!
            const r0 = Math.hypot(radial[0]! / 3, radial[1]! / 1.5) // ~1 on the outer surface, <1 inner
            expect(dot * (r0 > 0.97 ? 1 : -1), `vault face at ${c.map((v) => v.toFixed(2))}`).toBeGreaterThan(0)
          }
        } else {
          const dot = n[0]! * (c[0]! - o[0]!) + n[1]! * (c[1]! - o[1]!) + n[2]! * (c[2]! - o[2]!)
          expect(dot, `${solid} face at ${c.map((v) => v.toFixed(2))}`).toBeGreaterThan(0)
        }
      }
    }
  })
})
```

- [ ] **Step 3: Run it to verify it fails.**

Run: `npx vitest run tests/tools/models/blender/kit.test.ts`
Expected: FAIL. `runBlenderScript` throws with `ModuleNotFoundError: No module named 'kit'` in the message.

- [ ] **Step 4: Write the kit.**

`tools/models/blender/kit.py`:
```python
# tools/models/blender/kit.py
"""The Blender model kit (model-roster spec §4.2). Original work, AGPL-3.0-or-later.

Geometry is written in the glTF frame: +x forward, +y up, +z toward the viewer, meters.
The kit maps it to Blender's Z-up frame, and the exporter's +Y-up conversion maps it
back, so a script never thinks in Blender axes. (x, y, z) -> Blender (x, -z, y) is a
rotation (det +1), so face winding survives both ways.

Determinism: no randomness; parts accumulate in plain lists and become Blender
objects only at export, one per node, created in sorted name order.
"""
import math
import sys

import bpy

# sRGB 0-1, the base (unweathered) colors of src/render/scene/buildings.ts, so a
# kit building matches what the game draws today.
PALETTE = {
    'steel': (0x59 / 255, 0x64 / 255, 0x5A / 255),
    'concrete': (0x8D / 255, 0x89 / 255, 0x78 / 255),
    'dark': (0x17 / 255, 0x26 / 255, 0x24 / 255),
    'timber': (0x61 / 255, 0x51 / 255, 0x3C / 255),
}


def cli_args():
    """(output path, {key: value}) from everything after `--`."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise ValueError('usage: blender -b -P <script> -- <out.glb> [--key value ...]')
    out, rest = argv[0], argv[1:]
    if len(rest) % 2 or any(not k.startswith('--') for k in rest[::2]):
        raise ValueError(f'arguments must be --key value pairs, got {rest}')
    return out, {k[2:]: v for k, v in zip(rest[::2], rest[1::2])}


def positive(opts, key, default):
    raw = opts.get(key, default)
    try:
        v = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f'--{key} must be a number, got {raw!r}') from None
    if not math.isfinite(v) or v <= 0:
        raise ValueError(f'--{key} must be > 0, got {raw!r}')
    return v


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _material(role):
    mat = bpy.data.materials.get(role)
    if mat is None:
        mat = bpy.data.materials.new(role)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*(_srgb_to_linear(c) for c in PALETTE[role]), 1.0)
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = 0.85
    return mat


class Model:
    def __init__(self, name):
        self.name = name
        self._nodes = {}  # node name -> [role, verts, faces]

    def _part(self, role, verts, faces, node):
        if role not in PALETTE:
            raise ValueError(f'unknown role {role!r}; palette roles are {sorted(PALETTE)}')
        key = node or f'{self.name}_{role}'
        entry = self._nodes.setdefault(key, [role, [], []])
        if entry[0] != role:
            raise ValueError(f'node {key!r} already has role {entry[0]!r}, not {role!r}')
        base = len(entry[1])
        entry[1].extend(verts)
        entry[2].extend(tuple(base + i for i in f) for f in faces)

    def box(self, role, base, size, node=None):
        x, y, z = base
        w, h, l = size
        x0, x1, y0, y1, z0, z1 = x - w / 2, x + w / 2, y, y + h, z - l / 2, z + l / 2
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
        self._part(role, v, f, node)

    def barrel_vault(self, role, spring, width, rise, length, thickness, segments, node=None):
        """Half-elliptic shell over the springing line: outer semi-axes (width/2, rise),
        inner inset by `thickness`, open at both ends except for the rims."""
        x, y, z = spring
        n = segments
        ring = lambda a, rx, ry, zz: (x + math.cos(a) * rx, y + math.sin(a) * ry, zz)
        v = []
        for zz in (z - length / 2, z + length / 2):
            v += [ring(math.pi * i / n, width / 2, rise, zz) for i in range(n + 1)]
        for zz in (z - length / 2, z + length / 2):
            v += [ring(math.pi * i / n, width / 2 - thickness, rise - thickness, zz) for i in range(n + 1)]
        o0, o1, i0, i1 = 0, n + 1, 2 * (n + 1), 3 * (n + 1)
        f = []
        for i in range(n):
            f.append((o0 + i, o0 + i + 1, o1 + i + 1, o1 + i))      # outer, faces out
            f.append((i0 + i, i1 + i, i1 + i + 1, i0 + i + 1))      # inner, faces the axis
            f.append((o0 + i, i0 + i, i0 + i + 1, o0 + i + 1))      # rim at -z
            f.append((o1 + i, o1 + i + 1, i1 + i + 1, i1 + i))      # rim at +z
        self._part(role, v, f, node)

    def arch_gable(self, role, base, width, wall, rise, thickness, segments, node=None):
        """An end wall: a rectangle `wall` high under a half-ellipse `rise` high, as a slab
        `thickness` deep along z, centered on base z. The outline is convex."""
        x, y, z = base
        outline = [(x + width / 2, y)]
        outline += [(x + math.cos(math.pi * i / segments) * width / 2, y + wall + math.sin(math.pi * i / segments) * rise)
                    for i in range(segments + 1)]
        outline.append((x - width / 2, y))
        k = len(outline)
        front = [(px, py, z + thickness / 2) for px, py in outline]
        back = [(px, py, z - thickness / 2) for px, py in outline]
        f = [tuple(range(k)), tuple(reversed(range(k, 2 * k)))]
        for i in range(k):
            j = (i + 1) % k
            f.append((i, k + i, k + j, j))
        self._part(role, front + back, f, node)

    def export(self, path):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        root = bpy.data.objects.new(self.name, None)
        scene.collection.objects.link(root)
        for key in sorted(self._nodes):
            role, verts, faces = self._nodes[key]
            me = bpy.data.meshes.new(key)
            me.from_pydata([(vx, -vz, vy) for vx, vy, vz in verts], [], faces)
            me.validate()
            me.update()
            me.materials.append(_material(role))
            ob = bpy.data.objects.new(key, me)
            scene.collection.objects.link(ob)
            ob.parent = root
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', export_yup=True, export_apply=True,
            export_animations=False, export_cameras=False, export_lights=False,
            export_extras=False, export_materials='EXPORT', use_selection=False,
            export_texcoords=False, export_normals=True,
        )
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `npx vitest run tests/tools/models/blender/kit.test.ts`
Expected: PASS, 6 tests. If "rebuilds byte-identically" fails, **stop and diagnose** before going on (spec §8's first risk):
- Dump both glbs' JSON chunks with `npm run models:inspect -- <glb>` and diff them to find the drifting field.
- Record the finding and the fix as a `Ruling:` in the ledger.
- Do not loosen the test to a dimension comparison without a ledger ruling that names the drifting field.

If an "outward normals" face fails, the failing face's center is in the message. Fix that primitive's face order, not the test.

- [ ] **Step 6: Commit.**
```sh
git add tools/models/blender/kit.py tests/tools/models/blender/fixtures/kit_probe.py tests/tools/models/blender/kit.test.ts
git commit -m "M0: the Blender kit -- glTF-frame box, barrel vault and arch gable, one node per role, pinned export"
```

---

### Task 3: The hangar proof model and the CLI

**Files:**
- Create: `tools/models/blender/hangar.py`
- Create: `tools/models/blender/cli.ts`
- Test: `tests/tools/models/blender/hangar.test.ts`

**Interfaces:**
- Consumes: `kit.Model`, `kit.cli_args`, `kit.positive` (Task 2); `runBlenderScript` (Task 1); `measureDocument`, `modelIO`, `findNode`.
- Produces:
  - `content/models/candidates/hangar.glb` (gitignored), via `npx tsx tools/models/blender/cli.ts hangar`
  - Nodes `hangar_concrete`, `hangar_dark`, `hangar_steel` under root `hangar`
  - `cli.ts` exports `blenderScriptFor(id: string): string` and `candidateOutput(id: string): string`

The figures, and where each comes from (read 2026-09-26):

| Figure | Value | Source |
| --- | --- | --- |
| Footprint width (x) | 34 m | `content/bases/tacloban.json`, `tacloban-hangar-1`, `widthM`. The sim is authoritative |
| Footprint length (z) | 42 m | same, `lengthM` |
| Wall height | 5.5 m | ESTIMATE: the game's own, `src/render/scene/buildings.ts` (`wall`) |
| Roof rise | width × 0.25 = 8.5 m | ESTIMATE: the game's own, `buildings.ts` (`roofHeight`) |
| Wall and shell thickness | 0.35 m walls, 0.3 m gable and shell | ESTIMATE: `buildings.ts` |
| Slab | footprint + 0.5 m each side, 0.3 m deep, top at y = 0 | ESTIMATE: `buildings.ts` draws width + 1 by length + 1 |
| Door leaves | two, each width / 4 wide, wall height, 0.15 m thick, parked at the open (+z) end's sides | ESTIMATE: new in this model |

- [ ] **Step 1: Write the failing test.**

`tests/tools/models/blender/hangar.test.ts`:
```ts
// tests/tools/models/blender/hangar.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBounds } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
import { blenderScriptFor, candidateOutput } from '../../../../tools/models/blender/cli.js'
import { modelIO, findNode } from '../../../../tools/models/document.js'
import { measureDocument } from '../../../../tools/models/measure.js'

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
const tacloban = JSON.parse(readFileSync('content/bases/tacloban.json', 'utf8')) as { buildings: { id: string; widthM: number; lengthM: number }[] }
const cited = tacloban.buildings.find((b) => b.id === 'tacloban-hangar-1')!
const within1pct = (got: number, want: number, label: string): void => {
  expect(Math.abs(got - want) / want, `${label}: measured ${got}, cited ${want}`).toBeLessThanOrEqual(0.01)
}

describe('cli paths', () => {
  it('maps an id to its script and its gitignored candidate output, and refuses reserved or bad ids', () => {
    expect(blenderScriptFor('hangar')).toBe('tools/models/blender/hangar.py')
    expect(candidateOutput('hangar')).toBe('content/models/candidates/hangar.glb')
    expect(() => blenderScriptFor('kit')).toThrow(/reserved/)
    expect(() => blenderScriptFor('preview')).toThrow(/reserved/)
    expect(() => blenderScriptFor('../x')).toThrow(/id/)
  })
})

// Builds in beforeAll, not the describe body (see kit.test.ts).
describe.skipIf(!HAVE_BLENDER)('the hangar proof model (model-roster spec §4.2, M0)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm0-hangar-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  beforeAll(async () => {
    runBlenderScript(blenderScriptFor('hangar'), a)
    runBlenderScript(blenderScriptFor('hangar'), b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
  }, 120_000)

  it('rebuilds byte-identically', () => {
    expect(sha(b)).toBe(sha(a))
  })

  it('the steel structure fits the sim footprint and stands on y = 0', () => {
    const bb = getBounds(findNode(doc, 'hangar_steel'))
    within1pct(bb.max[0] - bb.min[0], cited.widthM, 'width (x)')
    within1pct(bb.max[2] - bb.min[2], cited.lengthM, 'length (z)')
    within1pct(bb.max[1], 5.5 + cited.widthM * 0.25, 'height: wall + rise')
    expect(bb.min[1]).toBeCloseTo(0, 5)
  })

  it('the slab top is the ground plane, one meter wider and longer than the footprint', () => {
    const bb = getBounds(findNode(doc, 'hangar_concrete'))
    expect(bb.max[1]).toBeCloseTo(0, 5)
    within1pct(bb.max[0] - bb.min[0], cited.widthM + 1, 'slab width')
    within1pct(bb.max[2] - bb.min[2], cited.lengthM + 1, 'slab length')
  })

  it('is open at +z and closed at -z: the door leaves stand at the +z end only', () => {
    const doors = getBounds(findNode(doc, 'hangar_dark'))
    expect(doors.min[2]).toBeGreaterThan(cited.lengthM / 2 - 1)
  })

  it('is inside the spec §4.4 building budget: 5k triangles, 4 draw calls, 0.5 MB, no textures', () => {
    const m = measureDocument(doc)
    expect(m.triangles).toBeLessThanOrEqual(5000)
    expect(m.drawCalls).toBeLessThanOrEqual(4)
    expect(m.textures).toBe(0)
    expect(readFileSync(a).byteLength).toBeLessThanOrEqual(500_000)
  })

  it('takes the Dulag footprint by argument', async () => {
    const out = join(dir, 'dulag.glb')
    runBlenderScript(blenderScriptFor('hangar'), out, ['--width', '22', '--length', '28'])
    const bb = getBounds(findNode(await modelIO().readBinary(new Uint8Array(readFileSync(out))), 'hangar_steel'))
    within1pct(bb.max[0] - bb.min[0], 22, 'Dulag width')
    within1pct(bb.max[2] - bb.min[2], 28, 'Dulag length')
  })

  it('refuses bad arguments by name', () => {
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad1.glb'), ['--width', '-5'])).toThrow(/--width must be > 0/)
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad2.glb'), ['--length', 'abc'])).toThrow(/--length must be a number/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npx vitest run tests/tools/models/blender/hangar.test.ts`
Expected: FAIL, "Cannot find module .../tools/models/blender/cli.js".

- [ ] **Step 3: Write the CLI.**

`tools/models/blender/cli.ts`:
```ts
// tools/models/blender/cli.ts
/**
 * `npx tsx tools/models/blender/cli.ts <id> [--key value ...]` builds
 * tools/models/blender/<id>.py into the gitignored content/models/candidates/<id>.glb
 * and prints what it measured. M0 only: M1's `blender` source kind moves building
 * into `npm run models:build` (model-roster spec §4.1).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runBlenderScript } from './run.js'
import { modelIO } from '../document.js'
import { inspectDocument } from '../inspect.js'

const RESERVED = new Set(['kit', 'preview'])

export function blenderScriptFor(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`model id "${id}" must match [a-z0-9][a-z0-9-]*`)
  if (RESERVED.has(id)) throw new Error(`"${id}" is reserved: it is a kit module, not a model`)
  return `tools/models/blender/${id}.py`
}

export function candidateOutput(id: string): string {
  return `content/models/candidates/${id}.glb`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [id, ...args] = process.argv.slice(2)
  if (!id) {
    console.error('usage: npx tsx tools/models/blender/cli.ts <id> [--key value ...]')
    process.exit(2)
  }
  const out = candidateOutput(id)
  runBlenderScript(blenderScriptFor(id), out, args)
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(out)))
  console.log(inspectDocument(doc, out))
}
```

- [ ] **Step 4: Write the hangar.**

`tools/models/blender/hangar.py`:
```python
# tools/models/blender/hangar.py
"""Barrel-roof hangar, the M0 proof model. Original work, AGPL-3.0-or-later.

Figures (read 2026-09-26):
  footprint 34 x 42 m    content/bases/tacloban.json, tacloban-hangar-1 (the sim is authoritative);
                         --width/--length take any other placement (Dulag: 22 x 28)
  wall 5.5 m             ESTIMATE: the game's own, src/render/scene/buildings.ts
  roof rise width*0.25   ESTIMATE: the game's own, buildings.ts
  walls 0.35 m, gable and shell 0.3 m     ESTIMATE: buildings.ts
  slab footprint+1 m, 0.3 m deep, top at y=0   ESTIMATE: buildings.ts draws width+1 x length+1
  door leaves width/4 each, 0.15 m, at the open +z end   ESTIMATE: new here
Frame: width along x, length along z, open toward +z (the apron), as buildings.ts.
Leaves out: roof ribs, windows, interior.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

WALL_M = 5.5
RISE_PER_WIDTH = 0.25
WALL_T = 0.35
SHELL_T = 0.3
DOOR_T = 0.15

out, opts = kit.cli_args()
width = kit.positive(opts, 'width', 34)
length = kit.positive(opts, 'length', 42)
rise = width * RISE_PER_WIDTH

m = kit.Model('hangar')
m.box('concrete', (0.0, -0.3, 0.0), (width + 1.0, 0.3, length + 1.0))
for side in (-1, 1):
    m.box('steel', (side * (width / 2 - WALL_T / 2), 0.0, 0.0), (WALL_T, WALL_M, length))
m.barrel_vault('steel', (0.0, WALL_M, 0.0), width, rise, length, SHELL_T, 24)
m.arch_gable('steel', (0.0, 0.0, -length / 2 + SHELL_T / 2), width, WALL_M, rise, SHELL_T, 24)
for side in (-1, 1):
    m.box('dark', (side * (width / 2 - WALL_T - width / 8), 0.0, length / 2 - DOOR_T), (width / 4, WALL_M, DOOR_T))
m.export(out)
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `npx vitest run tests/tools/models/blender/hangar.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Build the candidate through the CLI and read the summary.**

Run: `npx tsx tools/models/blender/cli.ts hangar; echo rc=$?`
Expected: an `inspectDocument` listing with three mesh nodes, fewer than 5,000 triangles and 3 draw calls, then `rc=0`. `git status --short` shows no `content/models/` change, because the folder is gitignored.

- [ ] **Step 7: Lint, typecheck, commit.**
```sh
npx eslint --max-warnings 0 tools/models/blender tests/tools/models/blender && npx tsc --noEmit -p .; echo rc=$?
git add tools/models/blender/hangar.py tools/models/blender/cli.ts tests/tools/models/blender/hangar.test.ts
git commit -m "M0: the barrel-roof hangar, the kit's proof model, at the sim's Tacloban footprint; the candidate CLI"
```

---

### Task 4: Preview renders for the checkpoint

**Files:**
- Create: `tools/models/blender/preview.py`
- Modify: `tests/tools/models/blender/hangar.test.ts` (one test appended to the skipIf block)
- Create: `docs/handoff/2026-09-26-m0-shots/hangar-front.png`, `hangar-rear.png`

**Interfaces:**
- Consumes: `runBlenderScript` (its `out` is the PNG); `candidateOutput('hangar')`.
- Produces: `blender -b ... -P tools/models/blender/preview.py -- <out.png> --glb <in.glb> --view front|rear`, a 1280 × 800 PNG.

- [ ] **Step 1: Write the failing test.** Append inside the `describe.skipIf(!HAVE_BLENDER)` block of `hangar.test.ts`:
```ts
  it('renders a 1280x800 preview PNG of the built glb', () => {
    const png = join(dir, 'front.png')
    runBlenderScript('tools/models/blender/preview.py', png, ['--glb', a, '--view', 'front'])
    const bytes = readFileSync(png)
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(1280)
    expect(bytes.readUInt32BE(20)).toBe(800)
  }, 60_000)
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npx vitest run tests/tools/models/blender/hangar.test.ts -t preview`
Expected: FAIL. The runner reports that Blender could not open `tools/models/blender/preview.py`, or that it "wrote no" PNG.

- [ ] **Step 3: Write the preview script.**

`tools/models/blender/preview.py`:
```python
# tools/models/blender/preview.py
"""Renders a glb to a PNG for a handoff: Cycles on the CPU (nexus is headless; 0.3 s for a
cube at 16 samples, measured 2026-09-26). Not a gate; the Hangar's Tier 2 is the gate from M1 on.
Usage: blender -b --factory-startup --python-exit-code 1 -P preview.py -- <out.png> --glb <in.glb> [--view front|rear]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

out, opts = kit.cli_args()
view = opts.get('view', 'front')
if view not in ('front', 'rear'):
    raise ValueError(f'--view must be front or rear, got {view!r}')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=opts['glb'])
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(c[i] for c in corners) for i in range(3)])
hi = Vector([max(c[i] for c in corners) for i in range(3)])
center, radius = (lo + hi) / 2, (hi - lo).length / 2

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1280, 800
scene.render.filepath = out
world = bpy.data.worlds.new('sky')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.65, 0.8, 1.0)
scene.world = world

ground = bpy.data.meshes.new('ground')
g = radius * 6
ground.from_pydata([(-g, -g, lo.z), (g, -g, lo.z), (g, g, lo.z), (-g, g, lo.z)], [], [(0, 1, 2, 3)])
scene.collection.objects.link(bpy.data.objects.new('ground', ground))

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)

# glTF +z (the open end) is Blender -y, so "front" looks from -y toward +y.
side = -1 if view == 'front' else 1
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.location = center + Vector((radius * 1.3, side * radius * 2.0, radius * 0.9))
scene.collection.objects.link(cam)
target = bpy.data.objects.new('target', None)
target.location = center
scene.collection.objects.link(target)
track = cam.constraints.new('TRACK_TO')
track.target = target
scene.camera = cam
bpy.ops.render.render(write_still=True)
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `npx vitest run tests/tools/models/blender/hangar.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Render the checkpoint captures, and look at them.**
```sh
npx tsx tools/models/blender/cli.ts hangar >/dev/null
mkdir -p docs/handoff/2026-09-26-m0-shots
for v in front rear; do blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- docs/handoff/2026-09-26-m0-shots/hangar-$v.png --glb content/models/candidates/hangar.glb --view $v >/dev/null; echo "$v rc=$?"; done
```
Expected: `front rc=0`, `rear rc=0`. Then **Read both PNGs** and check them by eye:
- front shows the open end and the two door leaves;
- rear shows the closed arched gable;
- nothing is see-through.

A see-through face means a winding bug that Task 2's normals test missed. In that case, go back to Task 2 with a failing test for that face before changing the kit.

- [ ] **Step 6: Commit.**
```sh
git add tools/models/blender/preview.py tests/tools/models/blender/hangar.test.ts docs/handoff/2026-09-26-m0-shots/
git commit -m "M0: Cycles preview renders for handoff captures; the hangar's front and rear"
```

---

### Task 5: Docs, full verification, handoff

**Files:**
- Modify: `docs/models.md` (new section "Authoring in Blender")
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 table (one new row)
- Modify: `README.md` (one paragraph pointing at §15)
- Modify: `ASSETS.md` (one sentence under "3D models": Blender-authored models are original, and M1 adds their rows as they ship)
- Create: `docs/handoff/2026-09-26-m0-blender-kit.md`

- [ ] **Step 1: `docs/models.md`.** Append:
```markdown
## Authoring in Blender

Where no cleanly licensed model exists, write an original one
(model-roster spec, `docs/superpowers/specs/2026-09-26-model-roster-design.md`).
A model is a script, `tools/models/blender/<id>.py`, built from
`tools/models/blender/kit.py`. Read the kit's header for the frame and the
determinism rules; `hangar.py` is the worked example, and its header shows
how to cite each figure and label each estimate.

    npx tsx tools/models/blender/cli.ts <id> [--key value ...]

writes `content/models/candidates/<id>.glb` (gitignored) and prints its
inspection. Blender must be exactly the version pinned in
`tools/models/blender/run.ts`. Tests that need Blender skip by name without
it (ryzen has none), so run `tests/tools/models/blender/` on nexus. Until M1
adds the manifest's `blender` source kind, a Blender model does not reach
`models:build` or the Hangar.
```

- [ ] **Step 2: §15 row.** Add after the "Ship models (S1-S2)" row. Escape any `|` inside cells:
```markdown
| Model roster (M0-M5) | any | Every Library object as a real model: Blender kit (M0), pipeline and display-only Library path (M1, after O1 merges), ships (M2, carries out S2), aircraft (M3, carries out Z3), buildings (M4), vehicles (M5) | §4, §9, §10 | M0 complete 2026-09-26, Tier 1 only ([design](2026-09-26-model-roster-design.md), [plan](../plans/2026-09-26-m0-blender-kit.md), [handoff](../../handoff/2026-09-26-m0-blender-kit.md)): headless Blender 5.0.1 kit, byte-identical rebuilds, the barrel-roof hangar as proof, in candidates only. M1-M5 not started |
```

- [ ] **Step 3: README.** Where README lists plan pointers, add one sentence: "The model roster (every Library object as a real model) is tracked in master spec §15, row 'Model roster (M0-M5)'." Find the place with `grep -n '§15' README.md` and follow the neighboring pointers' form.

- [ ] **Step 4: ASSETS.md.** Under "## 3D models", after the table, add: "Models authored in Blender (`tools/models/blender/`, model-roster spec) are original work, AGPL-3.0-or-later. Each gets its row here when it ships, from M1 on. M0's hangar is a gitignored candidate and ships nothing."

- [ ] **Step 5: Full verification on ryzen, then the Blender tests on nexus by name.**
```sh
remote-run npm run verify; rc=$?; echo verify rc=$rc
npx vitest run tests/tools/models/blender/; rc2=$?; echo blender rc=$rc2
```
Expected: `verify rc=0`, with the Blender describes reported as skipped on ryzen. Then `blender rc=0` with 0 skipped on nexus. Both gates read the captured `rc`, never a grepped pipeline. If either is non-zero, stop and fix. Do not write the handoff over a red gate.

- [ ] **Step 6: The handoff.** Write `docs/handoff/2026-09-26-m0-blender-kit.md` with these sections:
  - **What landed:** files, commits (`git log --oneline main..HEAD`).
  - **Measured:** the hangar's triangle count, draw calls and bytes from Task 3 Step 6, and the byte-identity results.
  - **Captures:** both PNGs, linked.
  - **Traps:**
    - `--python-exit-code 1`
    - stale output deletion
    - ryzen has no Blender, so its skips are expected
    - the glTF-frame mapping
  - **Rulings:** copied from the ledger.
  - **Open:**
    - M1 waits on O1's merge;
    - the Tacloban and Dulag boxes in game are unchanged by decision (spec §6.3).

- [ ] **Step 7: Commit, push the branch, email the handoff.**
```sh
git add docs/models.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md ASSETS.md docs/handoff/2026-09-26-m0-blender-kit.md
git commit -m "M0: models.md Blender section, §15 row, README pointer, ASSETS note, handoff"
git push -u origin worktree-models-roster
python3 tools/mail-doc.py docs/handoff/2026-09-26-m0-blender-kit.md "ww2airsim: M0 Blender kit landed (handoff)"; echo rc=$?
```
Expected: push succeeds (a worktree branch may be pushed freely), and mail prints `msmtp exit 0`. **Never** re-run mail-doc with `--debug` to confirm. Do not merge to `main`: that is Mark's call.
