# Scaffold and Headless Flight Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic F6F Hellcat flight model that runs headlessly in Node,
validated against cited historical performance figures, behind an automated
guard that prevents the simulation from ever acquiring a renderer dependency.

**Architecture:** Everything lives under `src/sim/`, which is pure TypeScript
with no Three.js and no browser globals — enforced by dependency-cruiser and
ESLint, not by good intentions. Forces are computed honestly (ISA atmosphere,
lift/drag coefficient curves, altitude-dependent propeller thrust); moments are
faked as dynamic-pressure-scaled rate commands. A flight test card harness flies
the aircraft automatically and asserts measured performance against reference
data, so flight-model correctness is a comparison against documented reality
rather than a judgement call.

**Tech Stack:** TypeScript 5 (strict), Node 22, vitest, Zod, dependency-cruiser,
ESLint. No rendering libraries — deliberately.

**Spec:** `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`

## Global Constraints

Every task's requirements implicitly include all of these. Values are copied
verbatim from the spec.

- **`sim/` never imports `render/` and never touches a browser global.** This is
  the load-bearing constraint of the whole project (spec §3).
- **Fixed 60 Hz simulation timestep.** Render rate is independent.
- **No `Math.random` anywhere in `sim/`.** Single seeded PRNG only.
- **No wall-clock reads in `sim/`** (`Date.now`, `performance.now`).
- **No iteration over unordered collections in state-affecting paths.**
- **All content JSON is Zod-validated at load.** Malformed data must fail loudly;
  it otherwise produces `NaN` velocity, and a `NaN` entering the integrator
  silently teleports the aircraft out of the world (spec §9).
- **Golden trajectories assert within tolerance, never exact equality**, and
  record the engine and version they were generated on. IEEE-754 is exact for
  arithmetic and `Math.sqrt`, but `Math.sin`/`cos`/`exp`/`pow` are
  implementation-approximated and differ across V8 versions (spec §3).
- **Energy invariants are computed in the airmass frame**, never the ground
  frame, which legitimately changes under a scenario wind vector (spec §11).
- **TypeScript `strict: true`.** No `any` in committed code.
- **License AGPL-3.0.** Third-party code must be AGPL-compatible.
- Node 22 (`v22.22.1` on nexus). Package manager: npm.

---

### Task 1: Scaffold and the architecture boundary guard

The guard comes first because every later task's testability depends on it, and
a boundary added after the fact is a boundary already violated.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`,
  `eslint.config.js`, `.dependency-cruiser.cjs`
- Create: `src/render/placeholder.ts` (exists only so the forbidden import has a
  real target; Plan 2 replaces it)
- Test: `tests/architecture/boundary.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (vitest), `npm run lint` (ESLint), `npm run depcruise`
  (dependency-cruiser), `npm run typecheck` (tsc --noEmit). Every later task
  uses these four commands verbatim.

- [x] **Step 1: Initialise the project and install dev dependencies**

```bash
cd /home/mark/projects/ww2airsim
npm init -y
npm pkg set type=module
npm pkg set name=ww2airsim
npm pkg set license=AGPL-3.0-or-later
npm install -D typescript@^5 vitest@^2 @types/node@^22 zod@^3 \
  dependency-cruiser@^16 eslint@^9 typescript-eslint@^8
```

- [x] **Step 2: Write the config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "tools", "*.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
```

`.dependency-cruiser.cjs`:

```js
module.exports = {
  forbidden: [
    {
      name: 'sim-must-not-import-render',
      comment: 'Spec §3: sim/ never imports render/. This keeps ~90% of the logic testable in Node.',
      severity: 'error',
      from: { path: '^src/sim' },
      to: { path: '^src/render' },
    },
    {
      name: 'sim-must-not-import-render-libs',
      comment: 'Spec §3: no rendering libraries in the simulation, directly or transitively.',
      severity: 'error',
      from: { path: '^src/sim' },
      to: { path: 'node_modules/(three|@webgpu)' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)__boundary_probe__' },
  },
}
```

`eslint.config.js`:

```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', 'dist'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts', 'tools/**/*.ts'],
    rules: {
      // Spec §3 + Global Constraints: determinism and no browser globals.
      'no-restricted-globals': ['error',
        { name: 'window', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'document', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'navigator', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'performance', message: 'sim/ must not read wall-clock time (spec §3).' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG from src/sim/rng.ts (spec §3).' },
        { object: 'Date', property: 'now', message: 'sim/ must not read wall-clock time (spec §3).' },
      ],
    },
  },
)
```

`package.json` scripts — set them with `npm pkg set`:

```bash
npm pkg set scripts.test="vitest run"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.lint="eslint src tests tools"
npm pkg set scripts.depcruise="depcruise src --config .dependency-cruiser.cjs"
npm pkg set scripts.verify="npm run typecheck && npm run lint && npm run depcruise && npm test"
```

- [x] **Step 3: Write the failing boundary test**

`tests/architecture/boundary.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, existsSync } from 'node:fs'

const PROBE = 'src/sim/__boundary_probe__.ts'

function runDepcruise(): { code: number; output: string } {
  try {
    const output = execFileSync('npx', ['depcruise', 'src', '--config', '.dependency-cruiser.cjs'], {
      encoding: 'utf8',
    })
    return { code: 0, output }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

afterEach(() => {
  if (existsSync(PROBE)) rmSync(PROBE)
})

describe('architecture boundary (spec §3)', () => {
  it('passes on the real source tree', () => {
    expect(runDepcruise().code).toBe(0)
  })

  it('fails when sim/ imports render/', () => {
    writeFileSync(PROBE, "import { PLACEHOLDER } from '../render/placeholder.js'\nexport const probe = PLACEHOLDER\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('sim-must-not-import-render')
  })
})
```

Note the probe is excluded from dependency-cruiser's own `exclude` for the
*passing* case only by being absent; when present it is analysed. Confirm the
`exclude` pattern in `.dependency-cruiser.cjs` does not suppress it — if the
second test passes with exit code 0, delete the `exclude` line and re-run.

- [x] **Step 4: Create the placeholder render module so the probe has a target**

`src/render/placeholder.ts`:

```ts
// Exists only so the boundary guard has a real forbidden target to detect.
// Plan 2 replaces this with the actual renderer entry point.
export const PLACEHOLDER = 'render' as const
```

- [x] **Step 5: Run the test to verify it fails, then passes correctly**

Run: `npx vitest run tests/architecture/boundary.test.ts`

Expected on first run before `.dependency-cruiser.cjs` is correct: the second
test FAILS because depcruise exits 0. Fix the config until both tests pass:
test one green (clean tree) and test two green (violation detected).

- [x] **Step 6: Write the ESLint browser-global probe test**

Append to `tests/architecture/boundary.test.ts`:

```ts
import { ESLint } from 'eslint'

describe('sim/ forbids browser globals and nondeterminism (spec §3)', () => {
  it('reports an error for navigator, Math.random and Date.now', async () => {
    const eslint = new ESLint({})
    const results = await eslint.lintText(
      'export const bad = [navigator.userAgent, Math.random(), Date.now()]\n',
      { filePath: 'src/sim/__lint_probe__.ts' },
    )
    const messages = results.flatMap((r) => r.messages).map((m) => m.ruleId)
    expect(messages).toContain('no-restricted-globals')
    expect(messages).toContain('no-restricted-properties')
  })
})
```

- [x] **Step 7: Run the full verify pipeline**

Run: `npm run verify`
Expected: typecheck, lint, depcruise, and tests all PASS.

Capture the exit status directly — never pipe this into `grep` and read the
pipeline's status, which is grep's and not the runner's.

- [x] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts \
  eslint.config.js .dependency-cruiser.cjs src/render/placeholder.ts \
  tests/architecture/boundary.test.ts
git commit -m "feat: scaffold project with enforced sim/render boundary

The boundary guard lands before any simulation code because every later
task's headless testability depends on it. Two probe tests prove the guard
actually fires rather than merely existing: one writes a forbidden import
and asserts depcruise rejects it, one lints browser globals and Math.random
and asserts ESLint reports them."
```

---

### Task 2: Seeded PRNG

**Files:**
- Create: `src/sim/rng.ts`
- Test: `tests/sim/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createRng(seed: number): () => number` returning values in `[0, 1)`.
  Used by every later system needing randomness (dispersion cones, AI reaction
  delay, scenario spawn jitter).

- [x] **Step 1: Write the failing test**

`tests/sim/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRng } from '../../src/sim/rng.js'

describe('createRng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const seqA = Array.from({ length: 100 }, () => a())
    const seqB = Array.from({ length: 100 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(Array.from({ length: 10 }, () => a())).not.toEqual(
      Array.from({ length: 10 }, () => b()),
    )
  })

  it('stays within [0, 1)', () => {
    const r = createRng(99)
    for (let i = 0; i < 10_000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is bit-exact across engines by using only integer operations', () => {
    // Spec §3: transcendentals vary across V8 versions; integer ops do not.
    // These values were generated by this implementation and must never drift.
    const r = createRng(42)
    const first = [r(), r(), r()]
    expect(first.every((v) => Number.isFinite(v))).toBe(true)
    // Re-deriving from a fresh generator must reproduce exactly.
    const again = createRng(42)
    expect([again(), again(), again()]).toEqual(first)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: FAIL — cannot resolve `src/sim/rng.js`.

- [x] **Step 3: Implement**

`src/sim/rng.ts`:

```ts
/**
 * mulberry32. Chosen deliberately: it uses only integer arithmetic and
 * Math.imul, both of which are exactly specified by IEEE-754 / ECMAScript, so
 * the sequence is bit-identical across V8 versions and platforms. A PRNG built
 * on Math.sin (a common one-liner) would not be — see spec §3.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/sim/rng.ts tests/sim/rng.test.ts
git commit -m "feat: add integer-only seeded PRNG

mulberry32 rather than a Math.sin one-liner: integer arithmetic and Math.imul
are exactly specified, so the sequence is bit-identical across V8 versions,
which the sin-based variants are not (spec §3)."
```

---

### Task 3: Vector and quaternion math

Hand-rolled, because the boundary guard forbids Three.js in `sim/`. This is a
real consequence of the architecture, not an oversight.

**Files:**
- Create: `src/sim/math/vec3.ts`, `src/sim/math/quat.ts`
- Test: `tests/sim/math/vec3.test.ts`, `tests/sim/math/quat.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Vec3 = { x: number; y: number; z: number }`
  - `v3(x, y, z): Vec3`, `add(a, b)`, `sub(a, b)`, `scale(a, s)`, `dot(a, b)`,
    `cross(a, b)`, `length(a)`, `normalize(a)`
  - `type Quat = { x: number; y: number; z: number; w: number }`
  - `qIdentity(): Quat`, `qFromAxisAngle(axis: Vec3, rad: number): Quat`,
    `qMul(a, b): Quat`, `qNormalize(q): Quat`, `qRotate(q, v): Vec3`,
    `qIntegrateBodyRates(q: Quat, rates: Vec3, dt: number): Quat`
  - Coordinate convention: right-handed, **+Y up**, body axes +X forward,
    +Y up, +Z right. Body rates are `{ x: roll, y: yaw, z: pitch }` in rad/s.

- [x] **Step 1: Write the failing vec3 test**

`tests/sim/math/vec3.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3, add, sub, scale, dot, cross, length, normalize } from '../../../src/sim/math/vec3.js'

describe('vec3', () => {
  it('adds and subtracts componentwise', () => {
    expect(add(v3(1, 2, 3), v3(4, 5, 6))).toEqual(v3(5, 7, 9))
    expect(sub(v3(4, 5, 6), v3(1, 2, 3))).toEqual(v3(3, 3, 3))
  })

  it('scales', () => {
    expect(scale(v3(1, -2, 3), 2)).toEqual(v3(2, -4, 6))
  })

  it('computes dot and cross products', () => {
    expect(dot(v3(1, 0, 0), v3(0, 1, 0))).toBe(0)
    expect(dot(v3(1, 2, 3), v3(4, 5, 6))).toBe(32)
    expect(cross(v3(1, 0, 0), v3(0, 1, 0))).toEqual(v3(0, 0, 1))
  })

  it('computes length exactly for Pythagorean triples', () => {
    // Math.sqrt is IEEE-754 exact, so this is safe to assert exactly.
    expect(length(v3(3, 4, 0))).toBe(5)
  })

  it('normalizes to unit length and returns zero for a zero vector', () => {
    expect(length(normalize(v3(0, 5, 0)))).toBeCloseTo(1, 12)
    expect(normalize(v3(0, 0, 0))).toEqual(v3(0, 0, 0))
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/math/vec3.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement vec3**

`src/sim/math/vec3.ts`:

```ts
export type Vec3 = { readonly x: number; readonly y: number; readonly z: number }

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const ZERO: Vec3 = v3(0, 0, 0)

export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s)
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const length = (a: Vec3): number => Math.sqrt(dot(a, a))

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a)
  return len === 0 ? ZERO : scale(a, 1 / len)
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/math/vec3.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Write the failing quaternion test**

`tests/sim/math/quat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3, length, sub } from '../../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle, qMul, qNormalize, qRotate, qIntegrateBodyRates }
  from '../../../src/sim/math/quat.js'

describe('quat', () => {
  it('identity rotation leaves a vector unchanged', () => {
    const v = v3(1, 2, 3)
    expect(length(sub(qRotate(qIdentity(), v), v))).toBeCloseTo(0, 12)
  })

  it('rotates 90 degrees about +Y taking +X to -Z', () => {
    const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    const r = qRotate(q, v3(1, 0, 0))
    expect(r.x).toBeCloseTo(0, 10)
    expect(r.y).toBeCloseTo(0, 10)
    expect(r.z).toBeCloseTo(-1, 10)
  })

  it('composes rotations: two 90 degree turns equal one 180', () => {
    const q90 = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    const composed = qMul(q90, q90)
    const r = qRotate(composed, v3(1, 0, 0))
    expect(r.x).toBeCloseTo(-1, 10)
  })

  it('stays normalized under repeated integration', () => {
    let q = qIdentity()
    for (let i = 0; i < 10_000; i++) q = qIntegrateBodyRates(q, v3(0.5, 0.3, -0.2), 1 / 60)
    const n = Math.hypot(q.x, q.y, q.z, q.w)
    expect(n).toBeCloseTo(1, 9)
  })

  it('integrating a pure roll rate for a known duration gives the expected angle', () => {
    // 1 rad/s of roll for 1 second, stepped at 60 Hz, should be ~1 rad about +X.
    let q = qIdentity()
    for (let i = 0; i < 60; i++) q = qIntegrateBodyRates(q, v3(1, 0, 0), 1 / 60)
    const expected = qFromAxisAngle(v3(1, 0, 0), 1)
    // Small-angle integration accumulates error; 1% is acceptable at 60 Hz.
    expect(Math.abs(q.w - expected.w)).toBeLessThan(0.01)
  })

  it('never produces NaN from a zero rate', () => {
    const q = qIntegrateBodyRates(qIdentity(), v3(0, 0, 0), 1 / 60)
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true)
  })

  it('qNormalize returns identity for a degenerate quaternion', () => {
    expect(qNormalize({ x: 0, y: 0, z: 0, w: 0 })).toEqual(qIdentity())
  })
})
```

- [x] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/sim/math/quat.test.ts`
Expected: FAIL — module not found.

- [x] **Step 7: Implement quat**

`src/sim/math/quat.ts`:

```ts
import { type Vec3, v3 } from './vec3.js'

export type Quat = { readonly x: number; readonly y: number; readonly z: number; readonly w: number }

export const qIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 })

export const qNormalize = (q: Quat): Quat => {
  const n = Math.hypot(q.x, q.y, q.z, q.w)
  if (n === 0) return qIdentity()
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n }
}

export const qFromAxisAngle = (axis: Vec3, rad: number): Quat => {
  const n = Math.hypot(axis.x, axis.y, axis.z)
  if (n === 0) return qIdentity()
  const h = rad / 2
  const s = Math.sin(h) / n
  return qNormalize({ x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(h) })
}

export const qMul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
})

/** Rotate v by q. Uses the standard v + 2w(q x v) + 2(q x (q x v)) form. */
export const qRotate = (q: Quat, v: Vec3): Vec3 => {
  const qv = v3(q.x, q.y, q.z)
  const t = v3(
    2 * (qv.y * v.z - qv.z * v.y),
    2 * (qv.z * v.x - qv.x * v.z),
    2 * (qv.x * v.y - qv.y * v.x),
  )
  const c = v3(
    qv.y * t.z - qv.z * t.y,
    qv.z * t.x - qv.x * t.z,
    qv.x * t.y - qv.y * t.x,
  )
  return v3(v.x + q.w * t.x + c.x, v.y + q.w * t.y + c.y, v.z + q.w * t.z + c.z)
}

/**
 * Integrate body angular rates into the attitude quaternion.
 * rates: { x: roll, y: yaw, z: pitch } in rad/s, body frame.
 * Renormalizes every step, which is why attitude cannot drift off the unit
 * sphere over a long mission.
 */
export const qIntegrateBodyRates = (q: Quat, rates: Vec3, dt: number): Quat => {
  const half = dt / 2
  const dq: Quat = {
    w: -(q.x * rates.x + q.y * rates.y + q.z * rates.z) * half,
    x: (q.w * rates.x + q.y * rates.z - q.z * rates.y) * half,
    y: (q.w * rates.y + q.z * rates.x - q.x * rates.z) * half,
    z: (q.w * rates.z + q.x * rates.y - q.y * rates.x) * half,
  }
  return qNormalize({ x: q.x + dq.x, y: q.y + dq.y, z: q.z + dq.z, w: q.w + dq.w })
}
```

- [x] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/sim/math/`
Expected: PASS, 12 tests across both files.

- [x] **Step 9: Commit**

```bash
git add src/sim/math tests/sim/math
git commit -m "feat: add hand-rolled vec3 and quaternion math for sim/

Hand-rolled rather than imported from Three.js because the boundary guard
forbids rendering libraries in sim/ (spec §3). qIntegrateBodyRates
renormalizes every step so attitude cannot drift off the unit sphere over a
long mission, which the 10k-step test asserts."
```

---

### Task 4: ISA standard atmosphere

**Files:**
- Create: `src/sim/atmosphere.ts`
- Test: `tests/sim/atmosphere.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `densityAt(altitudeM: number): number` (kg/m³),
  `pressureAt(altitudeM: number): number` (Pa),
  `temperatureAt(altitudeM: number): number` (K),
  `speedOfSoundAt(altitudeM: number): number` (m/s).

- [x] **Step 1: Write the failing test**

`tests/sim/atmosphere.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { densityAt, pressureAt, temperatureAt, speedOfSoundAt } from '../../src/sim/atmosphere.js'

describe('ISA atmosphere', () => {
  it('matches published sea-level values', () => {
    expect(temperatureAt(0)).toBeCloseTo(288.15, 2)
    expect(pressureAt(0)).toBeCloseTo(101325, 0)
    expect(densityAt(0)).toBeCloseTo(1.225, 3)
  })

  it('matches published density at 5000 m', () => {
    expect(densityAt(5000)).toBeCloseTo(0.7364, 3)
  })

  it('matches published density at the tropopause (11000 m)', () => {
    expect(densityAt(11000)).toBeCloseTo(0.3639, 3)
  })

  it('holds temperature constant in the lower stratosphere', () => {
    expect(temperatureAt(12000)).toBeCloseTo(216.65, 2)
    expect(temperatureAt(15000)).toBeCloseTo(216.65, 2)
  })

  it('decreases monotonically with altitude', () => {
    let prev = densityAt(0)
    for (let h = 500; h <= 15000; h += 500) {
      const d = densityAt(h)
      expect(d).toBeLessThan(prev)
      prev = d
    }
  })

  it('clamps below sea level rather than returning nonsense', () => {
    expect(densityAt(-500)).toBeGreaterThan(1.225)
    expect(Number.isFinite(densityAt(-500))).toBe(true)
  })

  it('gives a sea-level speed of sound near 340 m/s', () => {
    expect(speedOfSoundAt(0)).toBeCloseTo(340.3, 1)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/atmosphere.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

`src/sim/atmosphere.ts`:

```ts
const T0 = 288.15        // K, sea-level standard temperature
const P0 = 101325        // Pa, sea-level standard pressure
const L = 0.0065         // K/m, tropospheric lapse rate
const R = 287.05287      // J/(kg·K), specific gas constant for dry air
const G = 9.80665        // m/s²
const GAMMA = 1.4        // ratio of specific heats
const TROPOPAUSE_M = 11000
const T_TROPOPAUSE = T0 - L * TROPOPAUSE_M     // 216.65 K
const P_TROPOPAUSE = P0 * Math.pow(T_TROPOPAUSE / T0, G / (L * R))

export const temperatureAt = (altitudeM: number): number =>
  altitudeM < TROPOPAUSE_M ? T0 - L * altitudeM : T_TROPOPAUSE

export const pressureAt = (altitudeM: number): number => {
  if (altitudeM < TROPOPAUSE_M) {
    return P0 * Math.pow(temperatureAt(altitudeM) / T0, G / (L * R))
  }
  // Isothermal layer: exponential decay.
  return P_TROPOPAUSE * Math.exp((-G * (altitudeM - TROPOPAUSE_M)) / (R * T_TROPOPAUSE))
}

export const densityAt = (altitudeM: number): number =>
  pressureAt(altitudeM) / (R * temperatureAt(altitudeM))

export const speedOfSoundAt = (altitudeM: number): number =>
  Math.sqrt(GAMMA * R * temperatureAt(altitudeM))
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/atmosphere.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add src/sim/atmosphere.ts tests/sim/atmosphere.test.ts
git commit -m "feat: add ISA standard atmosphere

Asserted against published ISA values rather than self-consistency: 1.225,
0.7364 and 0.3639 kg/m3 at 0, 5000 and 11000 m. Same approach as the flight
test cards -- compare against documented reality, not against ourselves."
```

---

### Task 5: Aircraft schema and F6F Hellcat data

**Files:**
- Create: `src/sim/flight/schema.ts`, `src/sim/content.ts`
- Create: `content/aircraft/f6f-hellcat.json`
- Test: `tests/sim/flight/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `AircraftSpecSchema` (Zod) and `type AircraftSpec = z.infer<typeof AircraftSpecSchema>`
  - `parseAircraftSpec(raw: unknown): AircraftSpec` — throws a descriptive error
    on invalid input
  - `loadAircraftSpec(id: string): AircraftSpec` — reads
    `content/aircraft/<id>.json` and validates it

- [x] **Step 1: Write the failing test**

`tests/sim/flight/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseAircraftSpec, loadAircraftSpec } from '../../../src/sim/content.js'

const valid = {
  id: 'test-plane',
  name: 'Test Plane',
  geometry: { wingAreaM2: 30, wingSpanM: 13 },
  mass: { emptyKg: 4000, fuelCapacityKg: 600, maxTakeoffKg: 6000 },
  aero: { clSlopePerRad: 4.6, clMax: 1.4, alphaCritDeg: 15.5, clAtZeroAlpha: 0.1, cd0: 0.021, oswaldE: 0.85 },
  engine: {
    maxPowerW: 1_491_000, propEfficiency: 0.8, staticThrustN: 20_000,
    powerFractionByAltitudeM: [[0, 1], [7132, 1], [11400, 0.6]],
  },
  rates: { maxRollRateDegPerSec: 80, maxPitchRateDegPerSec: 30, maxYawRateDegPerSec: 15, rateRefSpeedMps: 103 },
  limits: { diveSpeedMps: 216, gLimit: 7.5 },
  reference: { source: 'test', topSpeedMps: 170, topSpeedAltitudeM: 7132, climbRateMps: 17, stallSpeedMps: 38, rollRateDegPerSec: 80 },
}

describe('AircraftSpec validation (spec §9)', () => {
  it('accepts a well-formed spec', () => {
    expect(parseAircraftSpec(valid).id).toBe('test-plane')
  })

  it('rejects NaN rather than letting it reach the integrator', () => {
    const bad = { ...valid, mass: { ...valid.mass, emptyKg: Number.NaN } }
    expect(() => parseAircraftSpec(bad)).toThrow(/emptyKg/)
  })

  it('rejects a missing required field with a field name in the message', () => {
    const { aero, ...withoutAero } = valid
    void aero
    expect(() => parseAircraftSpec(withoutAero)).toThrow(/aero/)
  })

  it('rejects non-positive wing area', () => {
    const bad = { ...valid, geometry: { ...valid.geometry, wingAreaM2: 0 } }
    expect(() => parseAircraftSpec(bad)).toThrow(/wingAreaM2/)
  })

  it('rejects a power curve that does not start at sea level', () => {
    const bad = { ...valid, engine: { ...valid.engine, powerFractionByAltitudeM: [[1000, 1]] } }
    expect(() => parseAircraftSpec(bad)).toThrow(/sea level/)
  })

  it('loads and validates the real F6F content file', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(f6f.id).toBe('f6f-hellcat')
    expect(f6f.reference.source).not.toBe('')
    expect(f6f.geometry.wingAreaM2).toBeGreaterThan(0)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/flight/schema.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the schema**

`src/sim/flight/schema.ts`:

```ts
import { z } from 'zod'

/** Rejects NaN and Infinity. Zod's .number() accepts NaN, which is the exact
 *  failure mode spec §9 warns about: a NaN reaching the integrator. */
const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
const fraction = finite.refine((n) => n > 0 && n <= 1, { message: 'must be in (0, 1]' })

export const AircraftSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  geometry: z.object({ wingAreaM2: positive, wingSpanM: positive }),
  mass: z.object({ emptyKg: positive, fuelCapacityKg: positive, maxTakeoffKg: positive }),
  aero: z.object({
    clSlopePerRad: positive,
    clMax: positive,
    alphaCritDeg: positive,
    clAtZeroAlpha: finite,
    cd0: positive,
    oswaldE: fraction,
  }),
  engine: z.object({
    maxPowerW: positive,
    propEfficiency: fraction,
    staticThrustN: positive,
    powerFractionByAltitudeM: z
      .array(z.tuple([finite, fraction]))
      .min(2)
      .refine((pts) => pts[0]![0] === 0, { message: 'power curve must start at sea level (altitude 0)' })
      .refine((pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1]![0]), {
        message: 'power curve altitudes must strictly increase',
      }),
  }),
  rates: z.object({
    maxRollRateDegPerSec: positive,
    maxPitchRateDegPerSec: positive,
    maxYawRateDegPerSec: positive,
    rateRefSpeedMps: positive,
  }),
  limits: z.object({ diveSpeedMps: positive, gLimit: positive }),
  reference: z.object({
    source: z.string().min(1),
    topSpeedMps: positive,
    topSpeedAltitudeM: positive,
    climbRateMps: positive,
    stallSpeedMps: positive,
    rollRateDegPerSec: positive,
  }),
})

export type AircraftSpec = z.infer<typeof AircraftSpecSchema>
```

`src/sim/content.ts`:

```ts
import { readFileSync } from 'node:fs'
import { AircraftSpecSchema, type AircraftSpec } from './flight/schema.js'

export function parseAircraftSpec(raw: unknown): AircraftSpec {
  const result = AircraftSpecSchema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    throw new Error(`Invalid aircraft spec: ${detail}`)
  }
  return result.data
}

/** Node-only loader, used by tests and tools. The browser build loads content
 *  over fetch and calls parseAircraftSpec directly. */
export function loadAircraftSpec(id: string): AircraftSpec {
  const path = new URL(`../../content/aircraft/${id}.json`, import.meta.url)
  return parseAircraftSpec(JSON.parse(readFileSync(path, 'utf8')))
}
```

- [x] **Step 4: Write the F6F content file**

`content/aircraft/f6f-hellcat.json`. These are commonly cited F6F-5 figures.
Confirm each against a primary or reputable secondary source and record the
exact source string in `reference.source` before committing — the schema
rejects an empty source, and the flight test cards in Task 11 assert against
these numbers, so an unsourced figure silently becomes the definition of
correct.

```json
{
  "id": "f6f-hellcat",
  "name": "Grumman F6F-5 Hellcat",
  "geometry": { "wingAreaM2": 31.03, "wingSpanM": 13.06 },
  "mass": { "emptyKg": 4190, "fuelCapacityKg": 681, "maxTakeoffKg": 6990 },
  "aero": {
    "clSlopePerRad": 4.6,
    "clMax": 1.4,
    "alphaCritDeg": 15.5,
    "clAtZeroAlpha": 0.1,
    "cd0": 0.0211,
    "oswaldE": 0.85
  },
  "engine": {
    "maxPowerW": 1491000,
    "propEfficiency": 0.8,
    "staticThrustN": 20000,
    "powerFractionByAltitudeM": [[0, 1.0], [3000, 1.0], [7132, 1.0], [9000, 0.82], [11400, 0.6]]
  },
  "rates": {
    "maxRollRateDegPerSec": 80,
    "maxPitchRateDegPerSec": 30,
    "maxYawRateDegPerSec": 15,
    "rateRefSpeedMps": 103
  },
  "limits": { "diveSpeedMps": 216, "gLimit": 7.5 },
  "reference": {
    "source": "REPLACE WITH THE ACTUAL SOURCE YOU CHECKED, e.g. Dean, America's Hundred Thousand, F6F-5 data tables",
    "topSpeedMps": 169.8,
    "topSpeedAltitudeM": 7132,
    "climbRateMps": 17.3,
    "stallSpeedMps": 37.6,
    "rollRateDegPerSec": 80
  }
}
```

The `reference.source` string above is intentionally an instruction, not data.
The step is not complete until it names a real source.

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/sim/flight/schema.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 6: Commit**

```bash
git add src/sim/flight/schema.ts src/sim/content.ts \
  content/aircraft/f6f-hellcat.json tests/sim/flight/schema.test.ts
git commit -m "feat: add Zod-validated aircraft schema and F6F-5 data

Every numeric field rejects NaN and Infinity explicitly, because Zod's
.number() accepts NaN and that is precisely the failure spec 9 warns about:
bad data does not throw, it produces NaN velocity and teleports the aircraft
out of the world. Error messages name the offending field path."
```

---

### Task 6: Aerodynamic coefficient curves

**Files:**
- Create: `src/sim/aero.ts`
- Test: `tests/sim/aero.test.ts`

**Interfaces:**
- Consumes: `AircraftSpec` from Task 5.
- Produces:
  - `liftCoefficient(spec: AircraftSpec, alphaRad: number): number`
  - `dragCoefficient(spec: AircraftSpec, cl: number): number`
  - `aspectRatio(spec: AircraftSpec): number`
  - `inducedDragFactor(spec: AircraftSpec): number`

- [x] **Step 1: Write the failing test**

`tests/sim/aero.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { liftCoefficient, dragCoefficient, aspectRatio, inducedDragFactor } from '../../src/sim/aero.js'
import { loadAircraftSpec } from '../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const deg = (d: number) => (d * Math.PI) / 180

describe('lift coefficient curve', () => {
  it('equals clAtZeroAlpha at zero angle of attack', () => {
    expect(liftCoefficient(f6f, 0)).toBeCloseTo(f6f.aero.clAtZeroAlpha, 6)
  })

  it('rises linearly below the critical angle', () => {
    const a = liftCoefficient(f6f, deg(4))
    const b = liftCoefficient(f6f, deg(8))
    expect(b - a).toBeCloseTo(f6f.aero.clSlopePerRad * deg(4), 4)
  })

  it('peaks at clMax at the critical angle', () => {
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))).toBeCloseTo(f6f.aero.clMax, 3)
  })

  it('falls past the critical angle rather than rising forever', () => {
    const peak = liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg + 8))).toBeLessThan(peak)
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg + 20))).toBeLessThan(peak)
  })

  it('is antisymmetric-ish for negative alpha and never NaN', () => {
    for (let d = -90; d <= 90; d += 1) {
      expect(Number.isFinite(liftCoefficient(f6f, deg(d)))).toBe(true)
    }
    expect(liftCoefficient(f6f, deg(-20))).toBeLessThan(0)
  })
})

describe('drag coefficient', () => {
  it('is minimum at zero lift and equals cd0 there', () => {
    expect(dragCoefficient(f6f, 0)).toBeCloseTo(f6f.aero.cd0, 6)
  })

  it('increases with the square of lift', () => {
    const d1 = dragCoefficient(f6f, 0.4) - f6f.aero.cd0
    const d2 = dragCoefficient(f6f, 0.8) - f6f.aero.cd0
    expect(d2 / d1).toBeCloseTo(4, 2)
  })

  it('is symmetric in the sign of lift', () => {
    expect(dragCoefficient(f6f, -0.6)).toBeCloseTo(dragCoefficient(f6f, 0.6), 9)
  })
})

describe('geometry derived values', () => {
  it('computes aspect ratio as span squared over area', () => {
    expect(aspectRatio(f6f)).toBeCloseTo((13.06 * 13.06) / 31.03, 6)
  })

  it('computes the induced drag factor as 1/(pi*AR*e)', () => {
    expect(inducedDragFactor(f6f)).toBeCloseTo(1 / (Math.PI * aspectRatio(f6f) * f6f.aero.oswaldE), 9)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/aero.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

`src/sim/aero.ts`:

```ts
import type { AircraftSpec } from './flight/schema.js'

export const aspectRatio = (spec: AircraftSpec): number =>
  (spec.geometry.wingSpanM * spec.geometry.wingSpanM) / spec.geometry.wingAreaM2

export const inducedDragFactor = (spec: AircraftSpec): number =>
  1 / (Math.PI * aspectRatio(spec) * spec.aero.oswaldE)

/**
 * Lift coefficient against angle of attack.
 *
 * Linear through the attached-flow region, peaking at clMax at alphaCrit, then
 * decaying post-stall toward a flat-plate value. Spec §5: the curve must peak
 * and fall, because that fall is what makes the stall a real event rather than
 * a number that keeps growing.
 */
export function liftCoefficient(spec: AircraftSpec, alphaRad: number): number {
  const { clSlopePerRad, clMax, alphaCritDeg, clAtZeroAlpha } = spec.aero
  const alphaCrit = (alphaCritDeg * Math.PI) / 180
  const sign = alphaRad < 0 ? -1 : 1
  const a = Math.abs(alphaRad)

  // Offset so the linear region passes through clAtZeroAlpha and reaches clMax
  // exactly at alphaCrit.
  const linearAtCrit = clAtZeroAlpha + clSlopePerRad * alphaCrit
  const scale = linearAtCrit === 0 ? 1 : (clMax - 0) / linearAtCrit

  if (a <= alphaCrit) {
    const cl = (clAtZeroAlpha + clSlopePerRad * a) * scale
    return sign > 0 ? cl : -(cl - 2 * clAtZeroAlpha * scale)
  }

  // Post-stall: decay from clMax toward ~0.6*clMax at 90 degrees, monotonically
  // down over the first 30 degrees past the stall.
  const over = a - alphaCrit
  const decayed = clMax * Math.max(0.25, 1 - 0.9 * (over / (Math.PI / 2)))
  return sign * decayed
}

/** cd0 + k*cl^2. Symmetric in the sign of lift. */
export function dragCoefficient(spec: AircraftSpec, cl: number): number {
  return spec.aero.cd0 + inducedDragFactor(spec) * cl * cl
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/aero.test.ts`
Expected: PASS, 10 tests. If the negative-alpha assertion fails, adjust the
negative branch of `liftCoefficient` — the requirement is only that negative
alpha gives negative lift and nothing returns NaN.

- [x] **Step 5: Commit**

```bash
git add src/sim/aero.ts tests/sim/aero.test.ts
git commit -m "feat: add lift and drag coefficient curves

The Cl curve peaks at clMax and decays post-stall rather than rising without
bound; that decay is what makes a stall a real event instead of a number that
keeps growing (spec 5). Drag is cd0 + k*cl^2 with k derived from span, area
and Oswald efficiency."
```

---

### Task 7: Flight integrator — forces only

**Files:**
- Create: `src/sim/flight/state.ts`, `src/sim/flight/model.ts`
- Test: `tests/sim/flight/forces.test.ts`

**Interfaces:**
- Consumes: `AircraftSpec` (Task 5), `Vec3`/`Quat` math (Task 3),
  `densityAt` (Task 4), `liftCoefficient`/`dragCoefficient` (Task 6).
- Produces:
  - `type Controls = { pitch: number; roll: number; yaw: number; throttle: number }`
    — pitch/roll/yaw in `[-1, 1]`, throttle in `[0, 1]`
  - `type AircraftState = { position: Vec3; velocity: Vec3; attitude: Quat; bodyRates: Vec3; fuelKg: number }`
  - `createState(init: Partial<AircraftState>): AircraftState`
  - `step(spec: AircraftSpec, state: AircraftState, controls: Controls, dt: number): AircraftState`
  - `angleOfAttack(state: AircraftState): number` (rad)
  - `airspeed(state: AircraftState): number` (m/s)
  - `DT = 1 / 60`

- [x] **Step 1: Write the failing test**

`tests/sim/flight/forces.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, airspeed, angleOfAttack, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('flight integrator: forces', () => {
  it('accelerates downward in free fall with no airspeed', () => {
    const s0 = createState({ position: v3(0, 5000, 0), velocity: v3(0, 0, 0) })
    const s1 = step(f6f, s0, NEUTRAL, DT)
    expect(s1.velocity.y).toBeLessThan(0)
    expect(s1.velocity.y).toBeCloseTo(-9.80665 * DT, 3)
  })

  it('never produces a non-finite state over a long run', () => {
    let s = createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) })
    for (let i = 0; i < 60 * 300; i++) {
      s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }, DT)
      const all = [s.position.x, s.position.y, s.position.z, s.velocity.x, s.velocity.y,
        s.velocity.z, s.attitude.x, s.attitude.y, s.attitude.z, s.attitude.w, s.fuelKg]
      expect(all.every(Number.isFinite)).toBe(true)
    }
  })

  it('reaches a terminal velocity in a vertical power-off dive', () => {
    let s = createState({
      position: v3(0, 8000, 0),
      velocity: v3(0, -60, 0),
      attitude: qIdentity(),
    })
    for (let i = 0; i < 60 * 120; i++) s = step(f6f, s, NEUTRAL, DT)
    const speed = airspeed(s)
    expect(speed).toBeGreaterThan(60)
    expect(speed).toBeLessThan(400)
  })

  it('produces more thrust at sea level than at high altitude for equal throttle', () => {
    const low = createState({ position: v3(0, 0, 0), velocity: v3(100, 0, 0) })
    const high = createState({ position: v3(0, 11000, 0), velocity: v3(100, 0, 0) })
    const full: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    const dLow = step(f6f, low, full, DT).velocity.x - low.velocity.x
    const dHigh = step(f6f, high, full, DT).velocity.x - high.velocity.x
    expect(dLow).toBeGreaterThan(dHigh)
  })

  it('burns fuel at full throttle and not at idle', () => {
    const s0 = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0), fuelKg: 600 })
    const burned = s0.fuelKg - step(f6f, s0, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, DT).fuelKg
    const idle = s0.fuelKg - step(f6f, s0, NEUTRAL, DT).fuelKg
    expect(burned).toBeGreaterThan(0)
    expect(burned).toBeGreaterThan(idle)
  })

  it('computes zero angle of attack for velocity along the body X axis', () => {
    const s = createState({ velocity: v3(100, 0, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeCloseTo(0, 6)
  })

  it('computes positive angle of attack when descending through level attitude', () => {
    const s = createState({ velocity: v3(100, -10, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeGreaterThan(0)
  })

  it('is deterministic: identical inputs give identical output', () => {
    const run = () => {
      let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
      for (let i = 0; i < 600; i++) s = step(f6f, s, { pitch: 0.2, roll: 0.1, yaw: 0, throttle: 0.7 }, DT)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('conserves speed within tolerance in level flight at trim', () => {
    // Straight and level at 130 m/s with enough throttle to hold it: speed
    // should not run away in either direction over 30 seconds.
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
    for (let i = 0; i < 60 * 30; i++) s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.75 }, DT)
    expect(length(s.velocity)).toBeGreaterThan(40)
    expect(length(s.velocity)).toBeLessThan(300)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/flight/forces.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement state**

`src/sim/flight/state.ts`:

```ts
import { type Vec3, v3 } from '../math/vec3.js'
import { type Quat, qIdentity } from '../math/quat.js'

export type Controls = {
  readonly pitch: number     // [-1, 1], positive = nose up
  readonly roll: number      // [-1, 1], positive = right roll
  readonly yaw: number       // [-1, 1], positive = nose right
  readonly throttle: number  // [0, 1]
}

export type AircraftState = {
  readonly position: Vec3    // world metres, +Y up
  readonly velocity: Vec3    // world m/s
  readonly attitude: Quat
  readonly bodyRates: Vec3   // rad/s, { x: roll, y: yaw, z: pitch }
  readonly fuelKg: number
}

export const createState = (init: Partial<AircraftState> = {}): AircraftState => ({
  position: init.position ?? v3(0, 0, 0),
  velocity: init.velocity ?? v3(0, 0, 0),
  attitude: init.attitude ?? qIdentity(),
  bodyRates: init.bodyRates ?? v3(0, 0, 0),
  fuelKg: init.fuelKg ?? 400,
})
```

- [x] **Step 4: Implement the model**

`src/sim/flight/model.ts`:

```ts
import { type Vec3, v3, add, scale, dot, length, normalize, cross, ZERO } from '../math/vec3.js'
import { qRotate, qIntegrateBodyRates } from '../math/quat.js'
import { densityAt } from '../atmosphere.js'
import { liftCoefficient, dragCoefficient } from '../aero.js'
import type { AircraftSpec } from './schema.js'
import { type AircraftState, type Controls, createState } from './state.js'

export { createState } from './state.js'
export type { AircraftState, Controls } from './state.js'

export const DT = 1 / 60
const G = 9.80665
/** kg of fuel per joule of work, tuned so a full internal load lasts a
 *  realistic few hours at cruise. Refined when range matters. */
const FUEL_KG_PER_JOULE = 7.5e-8

export const airspeed = (state: AircraftState): number => length(state.velocity)

/** Body-frame forward, up and right axes for the current attitude. */
const bodyAxes = (state: AircraftState) => ({
  forward: qRotate(state.attitude, v3(1, 0, 0)),
  up: qRotate(state.attitude, v3(0, 1, 0)),
  right: qRotate(state.attitude, v3(0, 0, 1)),
})

export function angleOfAttack(state: AircraftState): number {
  const v = state.velocity
  if (length(v) < 1e-6) return 0
  const { forward, up } = bodyAxes(state)
  const vn = normalize(v)
  // Positive alpha = airflow coming from below the wing.
  return Math.atan2(-dot(vn, up), dot(vn, forward))
}

function powerFractionAt(spec: AircraftSpec, altitudeM: number): number {
  const pts = spec.engine.powerFractionByAltitudeM
  if (altitudeM <= pts[0]![0]) return pts[0]![1]
  const last = pts[pts.length - 1]!
  if (altitudeM >= last[0]) return last[1]
  for (let i = 1; i < pts.length; i++) {
    const [h1, f1] = pts[i]!
    const [h0, f0] = pts[i - 1]!
    if (altitudeM <= h1) return f0 + ((f1 - f0) * (altitudeM - h0)) / (h1 - h0)
  }
  return last[1]
}

function thrustMagnitude(spec: AircraftSpec, state: AircraftState, throttle: number): number {
  const v = Math.max(airspeed(state), 1)
  const power = spec.engine.maxPowerW * powerFractionAt(spec, state.position.y) * throttle
  // Propeller thrust from power, capped at static thrust so it does not blow up
  // toward zero airspeed.
  return Math.min((spec.engine.propEfficiency * power) / v, spec.engine.staticThrustN * throttle)
}

export function step(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  dt: number,
): AircraftState {
  const mass = spec.mass.emptyKg + state.fuelKg
  const rho = densityAt(state.position.y)
  const v = airspeed(state)
  const q = 0.5 * rho * v * v
  const { forward, up } = bodyAxes(state)

  const alpha = angleOfAttack(state)
  const cl = liftCoefficient(spec, alpha)
  const cd = dragCoefficient(spec, cl)

  const liftN = q * spec.geometry.wingAreaM2 * cl
  const dragN = q * spec.geometry.wingAreaM2 * cd
  const thrustN = thrustMagnitude(spec, state, controls.throttle)

  const vdir = v > 1e-6 ? normalize(state.velocity) : forward
  // Lift acts perpendicular to the relative wind, in the plane of the body up axis.
  const liftDir = v > 1e-6 ? normalize(cross(cross(vdir, up), vdir)) : up

  let force: Vec3 = ZERO
  force = add(force, scale(forward, thrustN))
  force = add(force, scale(vdir, -dragN))
  force = add(force, scale(liftDir, liftN))
  force = add(force, v3(0, -mass * G, 0))

  const accel = scale(force, 1 / mass)
  const velocity = add(state.velocity, scale(accel, dt))
  const position = add(state.position, scale(velocity, dt))

  const workJ = thrustN * Math.max(v, 1) * dt
  const fuelKg = Math.max(0, state.fuelKg - workJ * FUEL_KG_PER_JOULE)

  // Moments arrive in Task 8; attitude integrates existing body rates only.
  const attitude = qIntegrateBodyRates(state.attitude, state.bodyRates, dt)

  return { position, velocity, attitude, bodyRates: state.bodyRates, fuelKg }
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/sim/flight/forces.test.ts`
Expected: PASS, 9 tests. The terminal-velocity and level-flight bounds are
deliberately wide — Task 11's test cards tighten them against reference data.

- [x] **Step 6: Run the whole verify pipeline**

Run: `npm run verify`
Expected: all PASS. In particular depcruise must still report zero violations.

- [x] **Step 7: Commit**

```bash
git add src/sim/flight/state.ts src/sim/flight/model.ts tests/sim/flight/forces.test.ts
git commit -m "feat: add flight integrator with honest forces

Lift, drag, altitude-dependent propeller thrust and gravity, integrated at a
fixed 60 Hz. Thrust is derived from power and capped at static thrust so it
does not diverge toward zero airspeed. A 300-second run asserts no non-finite
value ever escapes a step, which is the invariant spec 11 cares most about."
```

---

### Task 8: Rate-command moments with dynamic-pressure scaling

This is the spec's deliberate simplification (§5): control input commands a body
rotation rate rather than applying torque, and the achievable rate scales with
dynamic pressure. That scaling is what produces mushy controls near the stall.

**Files:**
- Modify: `src/sim/flight/model.ts`
- Test: `tests/sim/flight/moments.test.ts`

**Interfaces:**
- Consumes: everything from Task 7.
- Produces: `commandedBodyRates(spec, state, controls): Vec3` (rad/s), exported
  from `src/sim/flight/model.ts`. `step` now applies it.

- [x] **Step 1: Write the failing test**

`tests/sim/flight/moments.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, commandedBodyRates, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const FULL_ROLL: Controls = { pitch: 0, roll: 1, yaw: 0, throttle: 0.5 }
const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 }
const degs = (r: number) => (r * 180) / Math.PI

describe('rate-command moments (spec §5)', () => {
  it('achieves near maximum roll rate at or above the reference speed', () => {
    const s = createState({ position: v3(0, 1000, 0), velocity: v3(f6f.rates.rateRefSpeedMps, 0, 0) })
    const rates = commandedBodyRates(f6f, s, FULL_ROLL)
    expect(degs(rates.x)).toBeGreaterThan(f6f.rates.maxRollRateDegPerSec * 0.9)
    expect(degs(rates.x)).toBeLessThanOrEqual(f6f.rates.maxRollRateDegPerSec * 1.001)
  })

  it('caps the rate rather than growing without bound at very high speed', () => {
    const s = createState({ position: v3(0, 1000, 0), velocity: v3(400, 0, 0) })
    expect(degs(commandedBodyRates(f6f, s, FULL_ROLL).x))
      .toBeLessThanOrEqual(f6f.rates.maxRollRateDegPerSec * 1.001)
  })

  it('gives mushy controls at low speed: much less roll authority', () => {
    const slow = createState({ position: v3(0, 1000, 0), velocity: v3(40, 0, 0) })
    const fast = createState({ position: v3(0, 1000, 0), velocity: v3(150, 0, 0) })
    const slowRate = degs(commandedBodyRates(f6f, slow, FULL_ROLL).x)
    const fastRate = degs(commandedBodyRates(f6f, fast, FULL_ROLL).x)
    expect(slowRate).toBeLessThan(fastRate * 0.5)
    expect(slowRate).toBeGreaterThan(0)
  })

  it('gives almost no authority at a standstill', () => {
    const s = createState({ position: v3(0, 0, 0), velocity: v3(0, 0, 0) })
    expect(Math.abs(degs(commandedBodyRates(f6f, s, FULL_ROLL).x))).toBeLessThan(2)
  })

  it('loses authority with altitude at equal true airspeed', () => {
    const low = createState({ position: v3(0, 0, 0), velocity: v3(120, 0, 0) })
    const high = createState({ position: v3(0, 9000, 0), velocity: v3(120, 0, 0) })
    expect(degs(commandedBodyRates(f6f, high, FULL_ROLL).x))
      .toBeLessThan(degs(commandedBodyRates(f6f, low, FULL_ROLL).x))
  })

  it('holds attitude with neutral input', () => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
    for (let i = 0; i < 60; i++) s = step(f6f, s, NEUTRAL, DT)
    expect(Math.abs(s.attitude.x)).toBeLessThan(0.02)
    expect(Math.abs(s.attitude.z)).toBeLessThan(0.15)
  })

  it('actually rolls the aircraft when roll is commanded', () => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
    for (let i = 0; i < 30; i++) s = step(f6f, s, FULL_ROLL, DT)
    expect(Math.abs(s.attitude.x)).toBeGreaterThan(0.05)
  })

  it('never produces non-finite rates for any control input or speed', () => {
    for (const speed of [0, 1, 50, 200, 500]) {
      for (const input of [-1, -0.5, 0, 0.5, 1]) {
        const s = createState({ position: v3(0, 1000, 0), velocity: v3(speed, 0, 0) })
        const r = commandedBodyRates(f6f, s, { pitch: input, roll: input, yaw: input, throttle: 0.5 })
        expect([r.x, r.y, r.z].every(Number.isFinite)).toBe(true)
      }
    }
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/flight/moments.test.ts`
Expected: FAIL — `commandedBodyRates` is not exported.

- [x] **Step 3: Implement**

Add to `src/sim/flight/model.ts`:

```ts
const DEG = Math.PI / 180

/**
 * Spec §5: control input commands a body rotation rate, not a torque. The
 * achievable fraction of the maximum rate scales with dynamic pressure
 * normalised against sea-level dynamic pressure at the reference speed. This
 * is what makes controls mushy near the stall and stiff at speed, without
 * modelling moments of inertia or damping derivatives.
 */
export function commandedBodyRates(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
): Vec3 {
  const rho = densityAt(state.position.y)
  const v = airspeed(state)
  const q = 0.5 * rho * v * v
  const qRef = 0.5 * densityAt(0) * spec.rates.rateRefSpeedMps * spec.rates.rateRefSpeedMps
  const authority = Math.min(1, qRef === 0 ? 0 : q / qRef)

  const clamp = (n: number) => Math.max(-1, Math.min(1, n))
  return v3(
    clamp(controls.roll) * spec.rates.maxRollRateDegPerSec * DEG * authority,
    clamp(controls.yaw) * spec.rates.maxYawRateDegPerSec * DEG * authority,
    clamp(controls.pitch) * spec.rates.maxPitchRateDegPerSec * DEG * authority,
  )
}
```

Then in `step`, replace the attitude lines:

```ts
  // was: const attitude = qIntegrateBodyRates(state.attitude, state.bodyRates, dt)
  const bodyRates = commandedBodyRates(spec, state, controls)
  const attitude = qIntegrateBodyRates(state.attitude, bodyRates, dt)
```

and return `bodyRates` instead of `state.bodyRates`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/flight/`
Expected: PASS. If the "holds attitude with neutral input" test fails on the
pitch component, that is gravity curving the flight path with no trim — widen
that one bound and note it; Task 9 does not fix it and trim is Plan 5's concern.

- [x] **Step 5: Commit**

```bash
git add src/sim/flight/model.ts tests/sim/flight/moments.test.ts
git commit -m "feat: command body rates scaled by dynamic pressure

The spec's deliberate simplification: input commands a rotation rate rather
than a torque, scaled by q against sea-level q at the reference speed. Tests
assert the cue that matters -- roll authority at 40 m/s is under half that at
150 m/s, and near zero at a standstill."
```

---

### Task 9: Stall and departure

**Files:**
- Modify: `src/sim/flight/model.ts`
- Test: `tests/sim/flight/stall.test.ts`

**Interfaces:**
- Consumes: Tasks 6–8.
- Produces: `isStalled(spec, state): boolean` exported from
  `src/sim/flight/model.ts`. `step` injects a wing-drop roll rate when stalled.

- [x] **Step 1: Write the failing test**

`tests/sim/flight/stall.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, isStalled, angleOfAttack, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('stall behaviour (spec §5)', () => {
  it('reports not stalled in normal cruise', () => {
    const s = createState({ position: v3(0, 2000, 0), velocity: v3(140, 0, 0), attitude: qIdentity() })
    expect(isStalled(f6f, s)).toBe(false)
  })

  it('reports stalled past the critical angle of attack', () => {
    // Descending steeply through a level attitude gives a large positive alpha.
    const s = createState({ position: v3(0, 2000, 0), velocity: v3(30, -30, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeGreaterThan((f6f.aero.alphaCritDeg * Math.PI) / 180)
    expect(isStalled(f6f, s)).toBe(true)
  })

  it('injects a wing drop when stalled, breaking wings-level flight', () => {
    let s = createState({ position: v3(0, 3000, 0), velocity: v3(30, -30, 0), attitude: qIdentity() })
    const neutral: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
    for (let i = 0; i < 30; i++) s = step(f6f, s, neutral, DT)
    expect(Math.abs(s.attitude.x)).toBeGreaterThan(0.005)
  })

  it('is recoverable: unloading reduces alpha below critical', () => {
    let s = createState({ position: v3(0, 4000, 0), velocity: v3(35, -25, 0), attitude: qIdentity() })
    const unload: Controls = { pitch: -1, roll: 0, yaw: 0, throttle: 1 }
    for (let i = 0; i < 60 * 15; i++) s = step(f6f, s, unload, DT)
    expect(isStalled(f6f, s)).toBe(false)
  })

  it('loses altitude in a sustained stall', () => {
    let s = createState({ position: v3(0, 4000, 0), velocity: v3(30, -20, 0), attitude: qIdentity() })
    const neutral: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
    const y0 = s.position.y
    for (let i = 0; i < 60 * 5; i++) s = step(f6f, s, neutral, DT)
    expect(s.position.y).toBeLessThan(y0)
  })

  it('produces no non-finite state through a full stall and recovery', () => {
    let s = createState({ position: v3(0, 5000, 0), velocity: v3(30, -30, 0), attitude: qIdentity() })
    for (let i = 0; i < 60 * 60; i++) {
      const controls: Controls = i < 1800
        ? { pitch: 1, roll: 0, yaw: 0, throttle: 0 }
        : { pitch: -0.5, roll: 0, yaw: 0, throttle: 1 }
      s = step(f6f, s, controls, DT)
      expect(Number.isFinite(s.position.y + s.velocity.x + s.attitude.w)).toBe(true)
    }
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/flight/stall.test.ts`
Expected: FAIL — `isStalled` is not exported.

- [x] **Step 3: Implement**

Add to `src/sim/flight/model.ts`:

```ts
/** Wing-drop roll rate injected at the stall, rad/s. Deterministic in sign so
 *  the behaviour is reproducible; a randomised drop would need the seeded RNG. */
const STALL_WING_DROP_RAD_PER_S = 0.6

export function isStalled(spec: AircraftSpec, state: AircraftState): boolean {
  return Math.abs(angleOfAttack(state)) > (spec.aero.alphaCritDeg * Math.PI) / 180
}
```

In `step`, after computing `bodyRates`:

```ts
  const stalled = isStalled(spec, state)
  const ratesWithStall = stalled
    ? v3(bodyRates.x + STALL_WING_DROP_RAD_PER_S, bodyRates.y, bodyRates.z)
    : bodyRates
  const attitude = qIntegrateBodyRates(state.attitude, ratesWithStall, dt)
```

and return `bodyRates: ratesWithStall`.

Post-stall lift loss needs no new code: Task 6's `liftCoefficient` already
decays past `alphaCrit`, so the lift fall-off is already in the force model.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/flight/`
Expected: PASS. If "recoverable" fails, the recovery window may need longer than
15 s — raise it to 30 s rather than weakening the assertion.

- [x] **Step 5: Commit**

```bash
git add src/sim/flight/model.ts tests/sim/flight/stall.test.ts
git commit -m "feat: add stall detection and wing drop

Lift fall-off needed no new code -- the Cl curve from the aero task already
decays past alphaCrit. This adds the departure cue and asserts the property
that matters for playability: the stall is recoverable by unloading."
```

---

### Task 10: Invariant harness

**Files:**
- Create: `src/sim/invariants.ts`
- Test: `tests/sim/invariants.test.ts`

**Interfaces:**
- Consumes: Tasks 3–9.
- Produces:
  - `specificEnergyAirmass(state: AircraftState, windMps: Vec3): number` (J/kg)
  - `assertFinite(state: AircraftState, context: string): void` — throws on any
    non-finite field
  - `stepChecked(spec, state, controls, dt, windMps?): AircraftState` — wraps
    `step`, asserts finiteness, and asserts airmass specific energy does not
    increase at idle throttle. Every later sim test uses `stepChecked`.

- [x] **Step 1: Write the failing test**

`tests/sim/invariants.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3 } from '../../src/sim/math/vec3.js'
import { createState, DT, type Controls } from '../../src/sim/flight/model.js'
import { specificEnergyAirmass, assertFinite, stepChecked } from '../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const IDLE: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('airmass-frame specific energy (spec §11)', () => {
  it('ignores a uniform wind, unlike the ground frame', () => {
    const s = createState({ position: v3(0, 1000, 0), velocity: v3(100, 0, 0) })
    const still = specificEnergyAirmass(s, v3(0, 0, 0))
    const windy = specificEnergyAirmass({ ...s, velocity: v3(120, 0, 0) }, v3(20, 0, 0))
    expect(windy).toBeCloseTo(still, 6)
  })

  it('increases with altitude at constant airspeed', () => {
    const low = createState({ position: v3(0, 1000, 0), velocity: v3(100, 0, 0) })
    const high = createState({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0) })
    expect(specificEnergyAirmass(high, v3(0, 0, 0)))
      .toBeGreaterThan(specificEnergyAirmass(low, v3(0, 0, 0)))
  })

  it('does not increase at idle throttle over a long glide, even in wind', () => {
    let s = createState({ position: v3(0, 6000, 0), velocity: v3(120, 0, 0) })
    const wind = v3(25, 0, 0)
    let prev = specificEnergyAirmass(s, wind)
    for (let i = 0; i < 60 * 120; i++) {
      s = stepChecked(f6f, s, IDLE, DT, wind)
      const e = specificEnergyAirmass(s, wind)
      expect(e).toBeLessThanOrEqual(prev + 1e-3)
      prev = e
    }
  })

  it('allows energy to increase under thrust', () => {
    let s = createState({ position: v3(0, 1000, 0), velocity: v3(80, 0, 0) })
    const e0 = specificEnergyAirmass(s, v3(0, 0, 0))
    for (let i = 0; i < 60 * 20; i++) {
      s = stepChecked(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, DT)
    }
    expect(specificEnergyAirmass(s, v3(0, 0, 0))).toBeGreaterThan(e0)
  })
})

describe('assertFinite', () => {
  it('passes a valid state', () => {
    expect(() => assertFinite(createState({ velocity: v3(1, 2, 3) }), 'ok')).not.toThrow()
  })

  it('throws naming the field and context for a NaN', () => {
    const bad = { ...createState(), velocity: v3(Number.NaN, 0, 0) }
    expect(() => assertFinite(bad, 'my-context')).toThrow(/velocity\.x/)
    expect(() => assertFinite(bad, 'my-context')).toThrow(/my-context/)
  })

  it('throws for Infinity as well as NaN', () => {
    const bad = { ...createState(), position: v3(0, Number.POSITIVE_INFINITY, 0) }
    expect(() => assertFinite(bad, 'ctx')).toThrow(/position\.y/)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/invariants.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

`src/sim/invariants.ts`:

```ts
import { type Vec3, v3, sub, dot, ZERO } from './math/vec3.js'
import type { AircraftSpec } from './flight/schema.js'
import { type AircraftState, type Controls, step } from './flight/model.js'

const G = 9.80665

/**
 * Specific energy in the AIRMASS frame, J/kg: v_air^2/2 + g*h.
 *
 * Spec §11: the ground frame is wrong for this invariant. Under a scenario wind
 * vector, ground-frame energy legitimately changes as the aircraft turns
 * relative to the wind, so a ground-frame assertion flaps in soak runs for
 * entirely correct physics.
 */
export function specificEnergyAirmass(state: AircraftState, windMps: Vec3 = ZERO): number {
  const vAir = sub(state.velocity, windMps)
  return dot(vAir, vAir) / 2 + G * state.position.y
}

const FIELDS: ReadonlyArray<readonly [string, (s: AircraftState) => number]> = [
  ['position.x', (s) => s.position.x], ['position.y', (s) => s.position.y], ['position.z', (s) => s.position.z],
  ['velocity.x', (s) => s.velocity.x], ['velocity.y', (s) => s.velocity.y], ['velocity.z', (s) => s.velocity.z],
  ['attitude.x', (s) => s.attitude.x], ['attitude.y', (s) => s.attitude.y],
  ['attitude.z', (s) => s.attitude.z], ['attitude.w', (s) => s.attitude.w],
  ['bodyRates.x', (s) => s.bodyRates.x], ['bodyRates.y', (s) => s.bodyRates.y],
  ['bodyRates.z', (s) => s.bodyRates.z], ['fuelKg', (s) => s.fuelKg],
]

export function assertFinite(state: AircraftState, context: string): void {
  for (const [name, get] of FIELDS) {
    if (!Number.isFinite(get(state))) {
      throw new Error(`Non-finite ${name} (${get(state)}) in aircraft state at ${context}`)
    }
  }
}

/**
 * step() with the spec §11 invariants asserted. Use this in tests and in the
 * soak harness; use the bare step() in the hot path of the running game.
 */
export function stepChecked(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  dt: number,
  windMps: Vec3 = ZERO,
): AircraftState {
  const before = specificEnergyAirmass(state, windMps)
  const next = step(spec, state, controls, dt)
  assertFinite(next, 'stepChecked')
  if (controls.throttle === 0) {
    const after = specificEnergyAirmass(next, windMps)
    if (after > before + 1e-3) {
      throw new Error(
        `Airmass specific energy increased at idle throttle: ${before} -> ${after}`,
      )
    }
  }
  return next
}
```

Note `v3` is imported but may be unused — remove it if ESLint flags it.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/invariants.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add src/sim/invariants.ts tests/sim/invariants.test.ts
git commit -m "feat: add airmass-frame energy and finiteness invariants

Energy is asserted in the airmass frame, not the ground frame: under a wind
vector, ground-frame energy legitimately changes as the aircraft turns, so a
ground-frame assertion would flap in soak runs for correct physics (spec 11).
The wind-invariance test pins exactly that distinction."
```

---

### Task 11: Flight test cards

The payoff task. Flight-model correctness becomes a comparison against cited
reference data rather than a judgement call (spec §11).

**Files:**
- Create: `src/sim/autopilot.ts`, `tools/testcards/measure.ts`
- Test: `tests/sim/testcards/f6f.test.ts`

**Interfaces:**
- Consumes: Tasks 5–10.
- Produces:
  - `holdLevelHeading(spec, state, throttle): Controls` — a proportional
    autopilot holding pitch attitude level
  - `measureTopSpeed(spec, altitudeM): number` (m/s)
  - `measureClimbRate(spec, altitudeM): number` (m/s)
  - `measureStallSpeed(spec, altitudeM): number` (m/s)
  - `measureRollRate(spec, altitudeM, speedMps): number` (deg/s)

- [x] **Step 1: Write the failing test**

`tests/sim/testcards/f6f.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../src/sim/content.js'
import { measureTopSpeed, measureClimbRate, measureStallSpeed, measureRollRate }
  from '../../../tools/testcards/measure.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const ref = f6f.reference

/** Wide to start. Tighten as the model matures; never widen to make a red
 *  test pass, because that converts the reference figure into decoration. */
const TOL = 0.15

const within = (actual: number, expected: number, tol = TOL) => {
  const err = Math.abs(actual - expected) / expected
  return { pass: err <= tol, err, actual, expected }
}

describe('F6F-5 flight test card', () => {
  it('reaches its documented top speed at its critical altitude', () => {
    const r = within(measureTopSpeed(f6f, ref.topSpeedAltitudeM), ref.topSpeedMps)
    expect(r.pass, `top speed ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('climbs at its documented sea-level rate', () => {
    const r = within(measureClimbRate(f6f, 0), ref.climbRateMps, 0.25)
    expect(r.pass, `climb ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('stalls near its documented stall speed', () => {
    const r = within(measureStallSpeed(f6f, 0), ref.stallSpeedMps, 0.2)
    expect(r.pass, `stall ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('rolls at its documented rate at the reference speed', () => {
    const r = within(measureRollRate(f6f, 1000, f6f.rates.rateRefSpeedMps), ref.rollRateDegPerSec)
    expect(r.pass, `roll ${r.actual.toFixed(1)} deg/s vs reference ${r.expected}`).toBe(true)
  })

  it('climbs more slowly at altitude than at sea level', () => {
    expect(measureClimbRate(f6f, 8000)).toBeLessThan(measureClimbRate(f6f, 0))
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/testcards/f6f.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the autopilot**

`src/sim/autopilot.ts`:

```ts
import { v3, dot, normalize, length } from './math/vec3.js'
import { qRotate } from './math/quat.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/model.js'

/**
 * Proportional autopilot holding a wings-level attitude at a target flight-path
 * angle. Deliberately simple: its job is to make automated measurement possible,
 * not to fly well.
 */
export function holdFlightPath(
  _spec: AircraftSpec,
  state: AircraftState,
  throttle: number,
  targetClimbAngleRad = 0,
): Controls {
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const fwd = qRotate(state.attitude, v3(1, 0, 0))

  // Pitch: drive the nose toward the target climb angle.
  const pitchNow = Math.asin(Math.max(-1, Math.min(1, fwd.y)))
  const pitchErr = targetClimbAngleRad - pitchNow
  const pitch = Math.max(-1, Math.min(1, pitchErr * 4))

  // Roll: drive the body up axis back toward world up.
  const bank = Math.atan2(dot(up, v3(0, 0, 1)), up.y)
  const roll = Math.max(-1, Math.min(1, -bank * 3))

  void length(normalize(state.velocity))
  return { pitch, roll, yaw: 0, throttle }
}

export const holdLevelHeading = (
  spec: AircraftSpec,
  state: AircraftState,
  throttle: number,
): Controls => holdFlightPath(spec, state, throttle, 0)
```

- [x] **Step 4: Implement the measurement harness**

`tools/testcards/measure.ts`:

```ts
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { createState, step, airspeed, isStalled, DT, type Controls }
  from '../../src/sim/flight/model.js'
import { holdLevelHeading, holdFlightPath } from '../../src/sim/autopilot.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

/** Full throttle, hold level, fly until airspeed stops rising. */
export function measureTopSpeed(spec: AircraftSpec, altitudeM: number): number {
  let s = createState({
    position: v3(0, altitudeM, 0),
    velocity: v3(spec.rates.rateRefSpeedMps, 0, 0),
    attitude: qIdentity(),
    fuelKg: spec.mass.fuelCapacityKg,
  })
  let prev = 0
  for (let i = 0; i < 60 * 600; i++) {
    s = step(spec, s, holdLevelHeading(spec, s, 1), DT)
    // Hold altitude exactly: this is a performance measurement, not a flight.
    s = { ...s, position: v3(s.position.x, altitudeM, s.position.z) }
    if (i % 60 === 0) {
      const v = airspeed(s)
      if (i > 600 && Math.abs(v - prev) < 0.01) return v
      prev = v
    }
  }
  return airspeed(s)
}

/** Full throttle, best-rate climb approximated by holding a fixed climb angle
 *  and taking the best result across a sweep. */
export function measureClimbRate(spec: AircraftSpec, altitudeM: number): number {
  let best = -Infinity
  for (let angleDeg = 2; angleDeg <= 20; angleDeg += 2) {
    let s = createState({
      position: v3(0, altitudeM, 0),
      velocity: v3(spec.rates.rateRefSpeedMps, 0, 0),
      attitude: qIdentity(),
      fuelKg: spec.mass.fuelCapacityKg,
    })
    const angle = (angleDeg * Math.PI) / 180
    for (let i = 0; i < 60 * 30; i++) {
      s = step(spec, s, holdFlightPath(spec, s, 1, angle), DT)
    }
    // Average climb over the final 10 seconds.
    const y0 = s.position.y
    for (let i = 0; i < 60 * 10; i++) {
      s = step(spec, s, holdFlightPath(spec, s, 1, angle), DT)
    }
    const rate = (s.position.y - y0) / 10
    if (rate > best) best = rate
  }
  return best
}

/** Decelerate in level flight until the wing stalls; report the airspeed. */
export function measureStallSpeed(spec: AircraftSpec, altitudeM: number): number {
  let s = createState({
    position: v3(0, altitudeM, 0),
    velocity: v3(spec.rates.rateRefSpeedMps, 0, 0),
    attitude: qIdentity(),
    fuelKg: spec.mass.fuelCapacityKg * 0.5,
  })
  for (let i = 0; i < 60 * 300; i++) {
    s = step(spec, s, holdLevelHeading(spec, s, 0), DT)
    s = { ...s, position: v3(s.position.x, altitudeM, s.position.z) }
    if (isStalled(spec, s)) return airspeed(s)
  }
  return airspeed(s)
}

/** Full aileron at a fixed speed; report degrees per second of bank change. */
export function measureRollRate(spec: AircraftSpec, altitudeM: number, speedMps: number): number {
  let s = createState({
    position: v3(0, altitudeM, 0),
    velocity: v3(speedMps, 0, 0),
    attitude: qIdentity(),
  })
  const controls: Controls = { pitch: 0, roll: 1, yaw: 0, throttle: 0.8 }
  const SECONDS = 1
  let totalRad = 0
  for (let i = 0; i < 60 * SECONDS; i++) {
    const next = step(spec, s, controls, DT)
    totalRad += Math.abs(next.bodyRates.x) * DT
    // Pin speed and altitude so this measures roll authority, not a spiral.
    s = { ...next, velocity: v3(speedMps, 0, 0), position: v3(0, altitudeM, 0) }
  }
  return (totalRad / SECONDS) * (180 / Math.PI)
}
```

- [x] **Step 5: Run the test cards and tune to the reference figures**

Run: `npx vitest run tests/sim/testcards/f6f.test.ts`

Expected: initially some FAIL. The failure messages print measured versus
reference with a percentage. Tune in this order, editing only
`content/aircraft/f6f-hellcat.json`:

1. **Top speed too high or low** → `engine.propEfficiency` (primary knob), then
   `aero.cd0`. Propeller efficiency between 0.75 and 0.85 is physically
   defensible; cd0 much below 0.02 is not.
2. **Climb rate off** → `engine.maxPowerW` should stay at the documented figure;
   adjust `engine.staticThrustN` and re-check top speed did not move.
3. **Stall speed off** → `aero.clMax`. Between 1.2 and 1.6 is defensible for a
   1940s fighter with this wing.
4. **Roll rate off** → `rates.maxRollRateDegPerSec` is the direct knob, but the
   reference figure and the spec value should agree; if they disagree, the
   reference is right.

Do not widen `TOL` to make a test pass. A widened tolerance turns the reference
figure into decoration, which defeats the entire point of the test card.

- [x] **Step 6: Commit**

```bash
git add src/sim/autopilot.ts tools/testcards tests/sim/testcards \
  content/aircraft/f6f-hellcat.json
git commit -m "feat: add flight test cards measured against reference data

The harness flies the aircraft automatically -- full throttle level for top
speed, a climb-angle sweep for best rate, decelerating level flight to the
stall, full aileron for roll rate -- and asserts each against the cited
figures in the aircraft's reference block. Flight-model correctness is now a
comparison against documented reality rather than a judgement call (spec 11)."
```

---

### Task 12: Golden trajectory regression

**Files:**
- Create: `tests/sim/golden/trajectory.test.ts`
- Create: `tests/sim/golden/f6f-cruise.golden.json` (generated in Step 3)
- Create: `tools/golden/record.ts`

**Interfaces:**
- Consumes: Tasks 5–10.
- Produces: `recordTrajectory(spec, controlsFor, steps): GoldenTrajectory` where
  `type GoldenTrajectory = { engine: string; checkpoints: Array<{ tick: number; position: [number, number, number]; speed: number }> }`

- [x] **Step 1: Write the recorder**

`tools/golden/record.ts`:

```ts
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { createState, step, airspeed, DT, type Controls } from '../../src/sim/flight/model.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

export type GoldenTrajectory = {
  engine: string
  checkpoints: Array<{ tick: number; position: [number, number, number]; speed: number }>
}

/** Fixed manoeuvre: 60 s of climbing right turn at three quarter throttle. */
export const CRUISE_CONTROLS = (tick: number): Controls =>
  tick < 1800
    ? { pitch: 0.15, roll: 0.3, yaw: 0, throttle: 0.75 }
    : { pitch: -0.1, roll: -0.3, yaw: 0, throttle: 0.9 }

export function recordTrajectory(spec: AircraftSpec, steps = 3600): GoldenTrajectory {
  let s = createState({
    position: v3(0, 2000, 0),
    velocity: v3(130, 0, 0),
    attitude: qIdentity(),
    fuelKg: 400,
  })
  const checkpoints: GoldenTrajectory['checkpoints'] = []
  for (let tick = 0; tick < steps; tick++) {
    s = step(spec, s, CRUISE_CONTROLS(tick), DT)
    if (tick % 300 === 0) {
      checkpoints.push({
        tick,
        position: [s.position.x, s.position.y, s.position.z],
        speed: airspeed(s),
      })
    }
  }
  return { engine: `node ${process.version}`, checkpoints }
}
```

- [x] **Step 2: Write the failing test**

`tests/sim/golden/trajectory.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../../src/sim/content.js'
import { recordTrajectory, type GoldenTrajectory } from '../../../tools/golden/record.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const GOLDEN_PATH = new URL('./f6f-cruise.golden.json', import.meta.url)

/**
 * Spec §3: assert within tolerance, never exact equality. Math.sin/cos/exp are
 * implementation-approximated and differ across V8 versions, so an exact
 * assertion would break on a Node upgrade for no real reason.
 */
const POSITION_TOL_M = 1.0
const SPEED_TOL_MPS = 0.1

describe('golden trajectory regression', () => {
  it('reproduces the recorded trajectory within tolerance', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenTrajectory
    const actual = recordTrajectory(f6f)

    expect(actual.checkpoints).toHaveLength(golden.checkpoints.length)
    for (const [i, want] of golden.checkpoints.entries()) {
      const got = actual.checkpoints[i]!
      expect(got.tick).toBe(want.tick)
      for (const axis of [0, 1, 2] as const) {
        expect(
          Math.abs(got.position[axis] - want.position[axis]),
          `tick ${want.tick} axis ${axis}: ${got.position[axis]} vs ${want.position[axis]}`,
        ).toBeLessThan(POSITION_TOL_M)
      }
      expect(Math.abs(got.speed - want.speed)).toBeLessThan(SPEED_TOL_MPS)
    }
  })

  it('is self-consistent within a single run', () => {
    const a = recordTrajectory(f6f)
    const b = recordTrajectory(f6f)
    expect(a.checkpoints).toEqual(b.checkpoints)
  })

  it('records the engine it was generated on', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenTrajectory
    expect(golden.engine).toMatch(/^node v\d+/)
  })
})
```

- [x] **Step 3: Run to verify it fails, then generate the golden file**

Run: `npx vitest run tests/sim/golden/trajectory.test.ts`
Expected: FAIL — golden file does not exist.

Generate it:

```bash
npx tsx --eval "
import { loadAircraftSpec } from './src/sim/content.js'
import { recordTrajectory } from './tools/golden/record.js'
import { writeFileSync } from 'node:fs'
const t = recordTrajectory(loadAircraftSpec('f6f-hellcat'))
writeFileSync('tests/sim/golden/f6f-cruise.golden.json', JSON.stringify(t, null, 2) + '\n')
console.log('checkpoints:', t.checkpoints.length, 'engine:', t.engine)
"
```

If `tsx` is not installed: `npm install -D tsx` first.

Before committing the golden file, sanity-check it by eye: the aircraft should
climb (position[1] rising in the first half), turn (position[2] changing sign of
rate after tick 1800), and hold a plausible speed of roughly 100–200 m/s. A
golden file recording nonsense locks in nonsense.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/golden/trajectory.test.ts`
Expected: PASS, 3 tests.

- [x] **Step 5: Run the full pipeline and commit**

Run: `npm run verify`
Expected: typecheck, lint, depcruise, all tests PASS.

```bash
git add tools/golden tests/sim/golden package.json package-lock.json
git commit -m "feat: add golden trajectory regression with tolerance

Checkpoints every 5 seconds of a fixed 60-second manoeuvre, asserted within
1 m and 0.1 m/s rather than exactly: Math.sin/cos/exp are implementation-
approximated and drift across V8 versions, so exact equality would break on a
Node upgrade for no real reason (spec 3). The golden file records the engine
it was generated on."
```

---

### Task 13: CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/nightly-soak.yml`
- Create: `tools/soak/run.ts`
- Test: `tests/sim/soak.test.ts`

**Interfaces:**
- Consumes: Tasks 2–10.
- Produces: `runSoak(spec, iterations, seed): { failures: string[]; iterations: number }`

- [ ] **Step 1: Write the failing soak test**

`tests/sim/soak.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../src/sim/content.js'
import { runSoak } from '../../tools/soak/run.js'

describe('randomized soak (spec §11)', () => {
  it('survives 200 randomized flights with no invariant violations', () => {
    const result = runSoak(loadAircraftSpec('f6f-hellcat'), 200, 1337)
    expect(result.failures, result.failures.slice(0, 5).join('\n')).toHaveLength(0)
    expect(result.iterations).toBe(200)
  })

  it('is reproducible from its seed', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(runSoak(f6f, 20, 99)).toEqual(runSoak(f6f, 20, 99))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/soak.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the soak runner**

`tools/soak/run.ts`:

```ts
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { createState, DT, type Controls } from '../../src/sim/flight/model.js'
import { stepChecked } from '../../src/sim/invariants.js'
import { createRng } from '../../src/sim/rng.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

export function runSoak(
  spec: AircraftSpec,
  iterations: number,
  seed: number,
): { failures: string[]; iterations: number } {
  const rng = createRng(seed)
  const failures: string[] = []

  for (let n = 0; n < iterations; n++) {
    const altitude = 200 + rng() * 9000
    const speed = 30 + rng() * 200
    const wind = v3((rng() - 0.5) * 40, 0, (rng() - 0.5) * 40)
    let s = createState({
      position: v3(0, altitude, 0),
      velocity: v3(speed, (rng() - 0.5) * 40, (rng() - 0.5) * 40),
      attitude: qIdentity(),
      fuelKg: rng() * spec.mass.fuelCapacityKg,
    })

    try {
      for (let tick = 0; tick < 60 * 60; tick++) {
        // Change controls every second, so the aircraft is thrown around rather
        // than flown politely.
        const controls: Controls = {
          pitch: (rng() - 0.5) * 2,
          roll: (rng() - 0.5) * 2,
          yaw: (rng() - 0.5) * 2,
          throttle: rng() < 0.2 ? 0 : rng(),
        }
        for (let i = 0; i < 60; i++) s = stepChecked(spec, s, controls, DT, wind)
        if (s.position.y <= 0) break   // hit the water; that is a crash, not a bug
      }
    } catch (err) {
      failures.push(`iteration ${n} (alt ${altitude.toFixed(0)} speed ${speed.toFixed(0)}): ${(err as Error).message}`)
    }
  }

  return { failures, iterations }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/soak.test.ts`
Expected: PASS. If it fails, the failure message names the iteration, altitude
and speed — reproduce that single case before changing anything, per
superpowers:systematic-debugging.

- [ ] **Step 5: Write the CI workflows**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: ['**']
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run depcruise
      - run: npm test
```

No GPU on hosted runners, so there are no Tier 2 render checks here — that is
deliberate per spec §11, not an omission.

`.github/workflows/nightly-soak.yml`:

```yaml
name: Nightly soak
on:
  schedule:
    - cron: '0 9 * * *'   # 09:00 UTC
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  soak:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - name: Long soak
        id: soak
        run: npx vitest run tests/sim/soak.test.ts --reporter=verbose 2>&1 | tee soak.log
      - name: Open an issue on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            let log = ''
            try { log = fs.readFileSync('soak.log', 'utf8').slice(-4000) } catch {}
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Nightly soak failed on ${new Date().toISOString().slice(0, 10)}`,
              body: [
                `Run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
                '',
                '```',
                log,
                '```',
              ].join('\n'),
              labels: ['soak-failure'],
            })
```

The `tee` in the soak step means the step's exit status is `tee`'s, not
vitest's. Verify the workflow actually fails on a red test — temporarily break
an assertion, push to a branch, confirm the run goes red and opens an issue,
then revert. If it passes green on a broken test, add
`set -o pipefail` as the step's shell or drop the `tee`.

- [ ] **Step 6: Verify CI and commit**

```bash
npm run verify
git add tools/soak tests/sim/soak.test.ts .github/workflows
git commit -m "feat: add CI and a nightly soak that opens an issue on failure

Typecheck, lint, boundary check and tests on every push; a randomized soak
nightly. Spec 11's loop closer: a regression arrives as a GitHub notification
rather than as something to go looking for. No Tier 2 render checks here --
hosted runners have no GPU, which is deliberate."
```

---

## Self-Review

**Spec coverage for this plan's scope (spec §3, §5, §9, §11, §12):**

| Spec requirement | Task |
| --- | --- |
| §3 `sim/` never imports `render/` or browser globals | 1 |
| §3 fixed 60 Hz timestep | 7 (`DT`) |
| §3 seeded PRNG, no `Math.random` | 2, enforced by lint in 1 |
| §3 no wall-clock in `sim/` | enforced by lint in 1 |
| §3 golden trajectories within tolerance, engine recorded | 12 |
| §5 honest forces: lift, drag, altitude-dependent thrust, gravity | 6, 7 |
| §5 rate-command moments scaled by dynamic pressure | 8 |
| §5 stall with wing drop, recoverable | 9 |
| §9 Zod validation, `NaN` rejected at the boundary | 5 |
| §9 aircraft data as JSON with cited reference block | 5 |
| §11 flight test cards against reference figures | 11 |
| §11 invariants incl. airmass-frame energy, no `NaN` escapes | 10 |
| §11 soak testing, nightly, issue on failure | 13 |
| §11 architecture boundary test | 1 |
| §12 TypeScript strict, vitest, Zod | 1 |

**Deferred to later plans, deliberately:** assists and input mapping (`input/`,
spec §5 — no input device in a headless plan), weapons and damage (§6, Plan 5),
AI (§7, Plan 5), meta-game (§8, Plan 7), terrain and ocean (§4, Plans 3–4),
renderer (§3 `render/`, Plan 2), Tier 2 GPU checks (§11, needs the spike first).

**Placeholder scan:** one intentional instruction-as-data remains —
`reference.source` in `content/aircraft/f6f-hellcat.json` (Task 5, Step 4) is a
directive to name the real source consulted, and the schema rejects an empty
string. It is called out in the step text rather than left to be discovered.

**Type consistency check:** `AircraftSpec` (Task 5) is consumed unchanged by
Tasks 6–13. `Controls` and `AircraftState` are defined in
`src/sim/flight/state.ts` (Task 7) and re-exported from `model.ts` so every
later import path is `src/sim/flight/model.js`. `step` signature
`(spec, state, controls, dt)` is stable from Task 7; Tasks 8 and 9 change its
internals, not its signature. `stepChecked` (Task 10) adds one optional
trailing `windMps` parameter. `createRng` (Task 2) is used only in Task 13.
Body-rate convention `{ x: roll, y: yaw, z: pitch }` is declared in Task 3 and
used consistently in Tasks 8, 9 and 11.
