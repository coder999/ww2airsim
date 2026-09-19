# Plan 16b — Cloud Shadows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cumulus decks cast drifting shadows on the terrain, the sea and every lit object, from one sun-view transmittance map rendered each frame from the same cloud field the dome marches, inside 0.5 ms of GPU time at the high tier.

**Architecture:** The cloud density function and its uniforms move out of `clouds.ts` into `cloudField.ts` (one field, two readers). `cloudShadow.ts` owns a 1024² one-channel render target covering 80 km around the eye, rendered by a full-screen quad whose fragment projects each sea-level texel up the sun ray and integrates the field, and a lookup node that undoes the camera-relative shift, applies exact directional-sun parallax, fades above the deck and samples the map. The sun's `shadow.shadowNode` carries that lookup into every lit material; the terrain and the ocean, which light themselves, read it directly. `src/sim/` never sees any of it.

**Tech Stack:** three r186 WebGPU + TSL (`RenderTarget`, `texture`, `texture3D`, `Loop`, custom `light.shadow.shadowNode`), vitest, Playwright on the reference GPU.

**Spec:** `docs/superpowers/specs/2026-09-19-cloud-shadows-design.md`

## Global Constraints

- Work on `main` in place, no worktree. Re-diff against `HEAD` before each commit; other sessions commit here.
- `src/sim/` imports nothing from `render/`; shadows change no golden, snapshot or soak.
- The density function is MOVED, never copied: after Task 1 exactly one `texture3D(shape, ...)` cumulus sample exists in `src/render`.
- Shadow pass at high ≤ 0.5 ms gpu p95 at 2560 × 1440 in 16a §6's budget view; the deck-quals deck run < 6.0 ms with shadows on. Map 1024² over 80 km (78.125 m per texel), outer 8 km fade to 1, taps 4/3/2 by tier, `OCEAN_SHADOW_FLOOR = 0.6`.
- Never add `--autoplay-policy` or any launch flag to make a Tier 2 case pass.
- `npm run verify` ends every task; capture `rc=$?` directly, never gate on a grepped pipeline. US spelling in new prose and identifiers (existing `centre` identifiers stay). Never push or deploy.
- Write the executing agent's ledger at `.superpowers/sdd/2026-09-19-cloud-shadows/progress.md` (gitignored): every ruling made on Mark's behalf, dated, with what it costs if wrong.
- Tier 2 runs from nexus against the Windows Playwright server: `ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &` then `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2 -- <spec>`. The dev server must be up: `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/` prints `200`, else start `npm run dev:lan`. Read every screenshot with the Read tool; never argue about a picture you have not looked at.

---

### Task 1: Extract the cloud field from the dome

The dome keeps its march, tiers, probes, handle and tests. The density Fn, the two volumes, the layer uniforms and the drift move to a module the shadow pass can also import. Behavior is bit-identical; the proof is the unchanged `clouds.test.ts` plus the clouds Tier 2 spec re-run in Task 6.

**Files:**
- Create: `src/render/scene/cloudField.ts`
- Modify: `src/render/scene/clouds.ts` (lines 1-13 imports, 45-70 constants, 100-190 uniforms and `density`, 320-386 debug probes and handle)
- Test: `tests/render/cloudField.test.ts`, existing `tests/render/clouds.test.ts` unchanged

**Interfaces:**
- Produces:
  ```ts
  export const SHAPE_TILE_M = 6000
  export const DETAIL_TILE_M = 400
  export const CUMULUS_SIGMA = 0.012
  export const KIND_CUMULUS = 0
  export const KIND_CIRRUS = 1
  export type CloudField = {
    readonly shape: Data3DTexture
    readonly detail: Data3DTexture
    /** [base, thickness, coverage, kind] per layer, padded to MAX_CLOUD_LAYERS, sorted by base. */
    readonly layerData: UniformArrayNode
    readonly layerCount: UniformNode<'int', number>
    readonly eyeWorld: UniformNode<'vec3', Vector3>
    readonly drift: UniformNode<'vec2', Vector2>
    /** The sorted layers, for CPU-side questions (which is the lowest cumulus). */
    readonly layers: readonly CloudLayer[]
    /** Density in [0, 1] at a TRUE world point for one layer; 0 outside its slab. */
    density(p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>): Node<'float'>
    /** Lowest cumulus layer's [base, top] in metres, or null when the deck is clear of cumulus. */
    lowestCumulus(): { baseM: number; topM: number } | null
    update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void
    dispose(): void
  }
  export function createCloudField(layers: readonly CloudLayer[], noise: SkyNoise): CloudField
  ```
  `cloudDriftM` stays exported from `clouds.ts` (its test imports it there) and is re-exported from `cloudField.ts`, which is where it is now called.
- `createClouds(layers, noise)` keeps its signature but gains an optional third parameter `field?: CloudField`; when absent it creates its own (so the existing test and any caller are unchanged), when present it shares it. `main.ts` passes the shared one in Task 5.

- [x] **Step 1: Write the failing test** `tests/render/cloudField.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createCloudField, CUMULUS_SIGMA, SHAPE_TILE_M } from '../../src/render/scene/cloudField.js'
import { createClouds } from '../../src/render/scene/clouds.js'
import { MAX_CLOUD_LAYERS } from '../../src/sim/scenario.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadDetail, loadShape } from '../../tools/sky/load.js'
import { v3 } from '../../src/sim/math/vec3.js'

const noise = { shape: loadShape(), detail: loadDetail() }

describe('cloud field (Plan 16b, extracted from the dome)', () => {
  it('holds the shipped decks sorted by base, padded to the maximum, and names the lowest cumulus', () => {
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    expect(field.layers.map((l) => l.kind)).toEqual(['cumulus', 'cirrus'])
    expect(field.layerCount.value).toBe(2)
    expect(field.layerData.array).toHaveLength(MAX_CLOUD_LAYERS)
    expect(field.lowestCumulus()).toEqual({ baseM: 1500, topM: 2400 })
    field.dispose()
  })
  it('reports no cumulus for a clear sky and for a cirrus-only deck', () => {
    expect(createCloudField([], noise).lowestCumulus()).toBeNull()
    const cirrus = createCloudField([{ kind: 'cirrus', baseM: 7000, thicknessM: 300, coverage: 0.35 }], noise)
    expect(cirrus.lowestCumulus()).toBeNull()
    expect(cirrus.layerCount.value).toBe(1)
  })
  it('drifts with the wind and moves the eye', () => {
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    field.update(v3(10, 1000, -20), 12, v3(5, 0, -2))
    expect(field.eyeWorld.value.toArray()).toEqual([10, 1000, -20])
    expect(field.drift.value.toArray()).toEqual([60, -24])
    field.dispose()
  })
  it('is shared by the dome when passed in, and made by the dome when not', () => {
    const layers = loadScenario('free-flight').weather.clouds ?? []
    const field = createCloudField(layers, noise)
    const shared = createClouds(layers, noise, field)
    shared.update(v3(1, 2, 3), 1, null)
    expect(field.eyeWorld.value.toArray()).toEqual([1, 2, 3])
    const own = createClouds(layers, noise)
    own.update(v3(4, 5, 6), 1, null)
    expect(field.eyeWorld.value.toArray()).toEqual([1, 2, 3])
    shared.dispose()
    own.dispose()
  })
  it('keeps the constants the dome was tuned with', () => {
    expect(SHAPE_TILE_M).toBe(6000)
    expect(CUMULUS_SIGMA).toBe(0.012)
  })
  it('is imported only by the dome and the shadow pass: one field, two readers', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'render')
    const importers: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (entry.name.endsWith('.ts') && readFileSync(p, 'utf8').includes("/cloudField.js'")) importers.push(entry.name)
      }
    }
    walk(root)
    expect(importers.sort()).toEqual(['cloudShadow.ts', 'clouds.ts'].filter((f) => importers.includes(f)))
    expect(importers).toContain('clouds.ts')
  })
})
```

Add `import { readdirSync, readFileSync } from 'node:fs'`, `import { dirname, join } from 'node:path'` and `import { fileURLToPath } from 'node:url'` at the top. The filter makes the assertion pass in Task 1 (before `cloudShadow.ts` exists) and in Task 3 (after), and fail for any third importer.

- [x] **Step 2: Run** `npx vitest run tests/render/cloudField.test.ts` → FAIL (module not found).

- [x] **Step 3: Create `src/render/scene/cloudField.ts`** by MOVING code out of `clouds.ts`. The file's content, with the moved pieces verbatim from `clouds.ts` (do not retype the density body; cut and paste it):

```ts
import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType, Vector2, Vector3, Vector4 } from 'three'
import type { Node, UniformNode, UniformArrayNode } from 'three/webgpu'
import { Fn, If, clamp, float, max, sin, smoothstep, texture3D, uniform, uniformArray, vec3 } from 'three/tsl'
import { MAX_CLOUD_LAYERS, type CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import { DETAIL_SIZE, SHAPE_SIZE } from '../sky/noise.js'

/**
 * The cloud FIELD: the two noise volumes, the layer uniforms, the drift, and
 * the density function (design 16a §4). Extracted from the dome on
 * 2026-09-19 for Plan 16b so the shadow pass reads the same function the
 * dome marches -- one field, two readers, and the shadow cannot disagree
 * with the cloud that casts it. `clouds.ts` keeps the march; `cloudShadow.ts`
 * integrates this along the sun. Nothing here knows about a camera.
 */

/** Metres per repeat of the shape volume and of the detail volume. Gameplay
 *  estimates (16a design §9): a 128-texel tile over 6 km is 47 m per texel. */
export const SHAPE_TILE_M = 6000
export const DETAIL_TILE_M = 400
/** Extinction per metre at full density; ~250 m to opaque for cumulus. */
export const CUMULUS_SIGMA = 0.012
/** The committed shape volume's value range, from `tests/tools/skyNoise.test.ts`'s
 *  measurement of the 128-cube (110..247 of 255). */
const SHAPE_MIN = 110 / 255
const SHAPE_MAX = 247 / 255
export const KIND_CUMULUS = 0
export const KIND_CIRRUS = 1

/** Where the noise has drifted to: the ground wind times simulated seconds. */
export function cloudDriftM(wind: Vec3 | null, seconds: number): { x: number; z: number } {
  return wind === null ? { x: 0, z: 0 } : { x: wind.x * seconds, z: wind.z * seconds }
}

export type CloudField = {
  readonly shape: Data3DTexture
  readonly detail: Data3DTexture
  readonly layerData: UniformArrayNode
  readonly layerCount: UniformNode<'int', number>
  readonly eyeWorld: UniformNode<'vec3', Vector3>
  readonly drift: UniformNode<'vec2', Vector2>
  readonly layers: readonly CloudLayer[]
  density(p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>): Node<'float'>
  lowestCumulus(): { baseM: number; topM: number } | null
  update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void
  dispose(): void
}

function volume(data: Uint8Array, size: number): Data3DTexture {
  // moved verbatim from clouds.ts
}

export function createCloudField(layers: readonly CloudLayer[], noise: SkyNoise): CloudField {
  const sorted = [...layers].sort((a, b) => a.baseM - b.baseM)
  const shape = volume(noise.shape, SHAPE_SIZE)
  const detail = volume(noise.detail, DETAIL_SIZE)
  const layerData = uniformArray(/* moved verbatim */)
  const layerCount = uniform(sorted.length, 'int')
  const eyeWorld = uniform(new Vector3())
  const drift = uniform(new Vector2())

  const density = Fn(([p, base, thickness, coverage, kind]: [Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
    // moved verbatim from clouds.ts, including the two comments about
    // sampling ONE branch and the slow two-axis warp
  })

  const firstCumulus = sorted.find((l) => l.kind === 'cumulus')
  return {
    shape, detail, layerData, layerCount, eyeWorld, drift, layers: sorted,
    density: (p, base, thickness, coverage, kind) => density(p, base, thickness, coverage, kind),
    lowestCumulus: () => (firstCumulus ? { baseM: firstCumulus.baseM, topM: firstCumulus.baseM + firstCumulus.thicknessM } : null),
    update(eye, driftSeconds, wind): void {
      eyeWorld.value.set(eye.x, eye.y, eye.z)
      const d = cloudDriftM(wind, driftSeconds)
      drift.value.set(d.x, d.z)
    },
    dispose(): void {
      shape.dispose()
      detail.dispose()
    },
  }
}
```

The `density` wrapper closure exists because a TSL `Fn` is callable but not typed as the method signature above; the closure gives the handle a plain function type. `UniformArrayNode` is exported from `three/webgpu` (the 16a code casts its elements; keep the cast at the call sites).

- [x] **Step 4: Edit `clouds.ts`** to consume the field:
  - Delete the moved pieces: `volume`, `SHAPE_TILE_M`, `DETAIL_TILE_M`, `CUMULUS_SIGMA`, `SHAPE_MIN`, `SHAPE_MAX`, `KIND_CUMULUS`, `KIND_CIRRUS`, the `cloudDriftM` body, the `layerData`/`layerCount`/`eyeWorld`/`drift` uniforms, the `density` Fn. Delete the now-unused imports (`Data3DTexture`, `LinearFilter`, `RedFormat`, `RepeatWrapping`, `UnsignedByteType`, `Vector2`, `Vector4`, `uniformArray`, `sin`, `smoothstep` if unused, `MAX_CLOUD_LAYERS`, `DETAIL_SIZE`, `SHAPE_SIZE`). `eslint --max-warnings 0` will list any you miss.
  - Add `import { createCloudField, cloudDriftM, CUMULUS_SIGMA, SHAPE_TILE_M, type CloudField } from './cloudField.js'` and `export { cloudDriftM }` so `clouds.test.ts` still imports it from here.
  - Signature: `export function createClouds(layers: readonly CloudLayer[], noise: SkyNoise, field: CloudField = createCloudField(layers, noise)): CloudsHandle`. Inside, `const { shape, layerData, layerCount, eyeWorld, drift } = field` and `const density = field.density`. Every existing use of those names then compiles unchanged. `sorted` is `field.layers`.
  - `update()` becomes `mesh.position.set(eye.x, eye.y, eye.z); field.update(eye, driftSeconds, wind)`.
  - `dispose()`: call `field.dispose()` ONLY if the field was created here. Keep a boolean `ownsField = arguments.length < 3` captured before the default applies: write the signature as `field?: CloudField` and `const ownsField = field === undefined; const f = field ?? createCloudField(layers, noise)`.
  - The debug probe `shape` (mode 4) reads `texture3D(shape, ...)` with `SHAPE_TILE_M` -- both still in scope via the destructure and the import.

- [x] **Step 5: Run** `npx vitest run tests/render/cloudField.test.ts tests/render/clouds.test.ts` → both PASS, `clouds.test.ts` untouched.

- [x] **Step 6: Assert the move was a move**: `grep -c 'texture3D(shape' src/render/scene/clouds.ts` prints `1` (the debug probe only) and `grep -c 'texture3D(shape' src/render/scene/cloudField.ts` prints `3` (cirrus streaks, cirrus sheet, cumulus shape). If `clouds.ts` prints more, a copy survived.

- [x] **Step 7: Run** `npm run verify; echo rc=$?` → `rc=0`.

- [x] **Step 8: Commit**

```bash
git add src/render/scene/cloudField.ts src/render/scene/clouds.ts tests/render/cloudField.test.ts docs/superpowers/plans/2026-09-19-cloud-shadows.md
git commit -m "Plan 16b task 1: the cloud field (density, volumes, layers, drift) moves out of the dome so a second reader can share it"
```

---

### Task 2: The sun as one uniform

**Files:**
- Modify: `src/render/scene/lighting.ts`, `src/render/terrain/mesh.ts:280`, `src/render/scene/clouds.ts` (the `sun` const)
- Test: `tests/render/scene.test.ts` (the `lighting` describe)

**Interfaces:**
- Produces: `export const sunDirectionNode: UniformNode<'vec3', Vector3>` in `lighting.ts`, initialized from `SUN_DIRECTION`, UNNORMALIZED like the constant (readers normalize, as they do today). `SUN_DIRECTION` stays exported and unchanged.

- [x] **Step 1: Write the failing test** (append inside `describe('lighting', ...)` in `tests/render/scene.test.ts`):

```ts
  it('lights from the one sun uniform, so 16c can move it and nothing can be lit from a second direction', () => {
    // lighting.ts warned since Plan 5 that "two literals for one sun" would let
    // the terrain be lit from a different direction than the airplane parked
    // on it. Plan 16b made the direction a uniform; this pins the light to it.
    const lights = createLighting()
    const sun = lights.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)!
    expect(sun.position.toArray()).toEqual(sunDirectionNode.value.toArray())
    expect(sunDirectionNode.value.toArray()).toEqual([SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z])
  })
```

Add `sunDirectionNode, SUN_DIRECTION` to the import from `../../src/render/scene/lighting.js`.

- [x] **Step 2: Run** `npx vitest run tests/render/scene.test.ts` → FAIL (`sunDirectionNode` not exported).

- [x] **Step 3: Implement** in `lighting.ts`:

```ts
import { DirectionalLight, Group, HemisphereLight, Vector3, type Object3D } from 'three'
import { uniform } from 'three/tsl'

export const SUN_DIRECTION = { x: 0.4, y: 1, z: 0.3 } as const

/**
 * The same direction as a uniform (Plan 16b). The terrain's lambert, the
 * cloud light march and the cloud-shadow projection all read THIS, and
 * `createLighting` positions the DirectionalLight from the same constant;
 * `scene.test.ts` pins the two together. 16c (movable sun) drives this
 * value and the light's position from one clock and touches nothing else.
 * Unnormalized, like the constant: readers normalize.
 */
export const sunDirectionNode = uniform(new Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z))
```

`createLighting()` is unchanged (it already sets the position from `SUN_DIRECTION`). Update the doc comment above `SUN_DIRECTION`: replace the sentence beginning "Two literals for one sun" with "Since Plan 16b every shader reads `sunDirectionNode` below, and `scene.test.ts` pins the light's position to it."

In `terrain/mesh.ts:280` replace `const sun = normalize(vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z))` with `const sun = normalize(sunDirectionNode)` and change the import to `import { sunDirectionNode } from '../scene/lighting.js'`. Update the comment at line 229 to name `sunDirectionNode`. In `clouds.ts` do the same for its `sun` const (line ~122) and its import.

- [x] **Step 4: Run** `npx vitest run tests/render/scene.test.ts tests/render/clouds.test.ts tests/render/scenery.test.ts` → PASS.

- [x] **Step 5: Run** `npm run verify; echo rc=$?` → `rc=0`.

- [x] **Step 6: Commit**

```bash
git add src/render/scene/lighting.ts src/render/terrain/mesh.ts src/render/scene/clouds.ts tests/render/scene.test.ts docs/superpowers/plans/2026-09-19-cloud-shadows.md
git commit -m "Plan 16b task 2: one sun uniform read by the terrain, the clouds and soon the shadow map; the light's position is pinned to it"
```

---

### Task 3: The shadow map and its lookup node

The module, its pure geometry helpers, the pass material and the lookup node. Nothing is wired yet; construction under Node is the test.

**Files:**
- Create: `src/render/scene/cloudShadow.ts`
- Test: `tests/render/cloudShadow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAP_TEXELS = 1024
  export const MAP_SIDE_M = 80_000
  export const MAP_TEXEL_M = MAP_SIDE_M / MAP_TEXELS   // 78.125
  export const MAP_FADE_M = 8000
  export const OCEAN_SHADOW_FLOOR = 0.6
  export const SHADOW_TIERS = { high: { taps: 4 }, medium: { taps: 3 }, low: { taps: 2 } } as const
  export const CLOUD_SHADOW_PARAM = 'cloudShadow'
  export type CloudShadowMode = 'off' | 'show'
  export function cloudShadowFromQuery(search: string): CloudShadowMode | undefined
  /** Map center snapped to the texel grid: idempotent, moves in whole texels. */
  export function snapToTexel(x: number, z: number, texelM?: number): { x: number; z: number }
  /** Horizontal offset from a point at height y to the sea-level point on the same sun ray. */
  export function sunParallaxXZ(sun: { x: number; y: number; z: number }, y: number): { x: number; z: number }
  export type CloudShadowHandle = {
    /** Transmittance in [0, 1] at a position. `'eyeRelative'` is what `positionWorld`
     *  is under camera-relative rendering (the node adds the eye back); `'world'` is a
     *  true world position a material already has (the terrain's, the ocean's). */
    node(position: Node<'vec3'>, frame: 'eyeRelative' | 'world'): Node<'float'>
    /** True when the deck has a cumulus layer and the DEV mode is not `off`. */
    readonly enabled: boolean
    readonly showing: boolean
    readonly target: RenderTarget
    readonly scene: Scene
    readonly camera: OrthographicCamera
    readonly taps: number
    /** The snapped map center in true world metres, after `update`. */
    centerXZ(): { x: number; z: number }
    setTier(name: CloudTierName): void
    /** Recenter on the eye (true world metres). Call before rendering the pass. */
    update(eye: Vec3): void
    dispose(): void
  }
  export function createCloudShadow(field: CloudField, mode?: CloudShadowMode): CloudShadowHandle
  ```
- Consumes: `CloudField` from Task 1, `sunDirectionNode` from Task 2, `CloudTierName` from `clouds.ts`.

- [ ] **Step 1: Write the failing test** `tests/render/cloudShadow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Mesh } from 'three'
import {
  MAP_TEXELS, MAP_SIDE_M, MAP_TEXEL_M, SHADOW_TIERS, cloudShadowFromQuery, createCloudShadow, snapToTexel, sunParallaxXZ,
} from '../../src/render/scene/cloudShadow.js'
import { createCloudField } from '../../src/render/scene/cloudField.js'
import { SUN_DIRECTION } from '../../src/render/scene/lighting.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadDetail, loadShape } from '../../tools/sky/load.js'
import { v3 } from '../../src/sim/math/vec3.js'

const noise = { shape: loadShape(), detail: loadDetail() }
const deck = () => createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)

describe('cloud shadow map (Plan 16b)', () => {
  it('is 1024 texels over 80 km, 78.125 m each, with taps that descend by tier', () => {
    expect(MAP_TEXELS).toBe(1024)
    expect(MAP_SIDE_M).toBe(80_000)
    expect(MAP_TEXEL_M).toBe(78.125)
    expect(SHADOW_TIERS.high.taps).toBeGreaterThan(SHADOW_TIERS.medium.taps)
    expect(SHADOW_TIERS.medium.taps).toBeGreaterThan(SHADOW_TIERS.low.taps)
  })
  it('snaps the center to whole texels, idempotently', () => {
    const a = snapToTexel(1000, -1000)
    expect(a.x % MAP_TEXEL_M).toBe(0)
    expect(a.z % MAP_TEXEL_M).toBe(0)
    expect(Math.abs(a.x - 1000)).toBeLessThanOrEqual(MAP_TEXEL_M / 2)
    expect(snapToTexel(a.x, a.z)).toEqual(a)
    expect(snapToTexel(0, 0)).toEqual({ x: 0, z: 0 })
  })
  it('projects a raised point down the sun ray to sea level: (-0.4 y, -0.3 y) for the shipped sun, zero at sea level', () => {
    expect(sunParallaxXZ(SUN_DIRECTION, 0)).toEqual({ x: 0, z: 0 })
    const p = sunParallaxXZ(SUN_DIRECTION, 1000)
    expect(p.x).toBeCloseTo(-400, 6)
    expect(p.z).toBeCloseTo(-300, 6)
  })
  it('parses the DEV query: off and show, nothing else', () => {
    expect(cloudShadowFromQuery('?cloudShadow=off')).toBe('off')
    expect(cloudShadowFromQuery('?cloudShadow=show')).toBe('show')
    expect(cloudShadowFromQuery('?x=1')).toBeUndefined()
    expect(() => cloudShadowFromQuery('?cloudShadow=on')).toThrow(/cloudShadow/)
  })
  it('constructs for the shipped decks, recenters on the eye in whole texels, and is inert for a clear sky or under off', () => {
    for (const id of ['free-flight', 'deck-quals']) {
      const field = createCloudField(loadScenario(id).weather.clouds ?? [], noise)
      const shadow = createCloudShadow(field)
      expect(shadow.enabled).toBe(true)
      expect(shadow.showing).toBe(false)
      expect(shadow.target.width).toBe(MAP_TEXELS)
      expect(shadow.target.height).toBe(MAP_TEXELS)
      expect(shadow.scene.children.some((c) => c instanceof Mesh)).toBe(true)
      shadow.setTier('low')
      expect(shadow.taps).toBe(SHADOW_TIERS.low.taps)
      shadow.update(v3(1234.5, 800, -9876.5))
      const c = shadow.centerXZ()
      expect(c.x % MAP_TEXEL_M).toBe(0)
      expect(c.z % MAP_TEXEL_M).toBe(0)
      expect(Math.abs(c.x - 1234.5)).toBeLessThanOrEqual(MAP_TEXEL_M / 2)
      shadow.dispose()
      field.dispose()
    }
    const clear = createCloudShadow(createCloudField([], noise))
    expect(clear.enabled).toBe(false)
    const off = createCloudShadow(deck(), 'off')
    expect(off.enabled).toBe(false)
    const show = createCloudShadow(deck(), 'show')
    expect(show.enabled).toBe(true)
    expect(show.showing).toBe(true)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/render/cloudShadow.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/render/scene/cloudShadow.ts`**:

```ts
import {
  ClampToEdgeWrapping, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RedFormat, RenderTarget, Scene,
  UnsignedByteType, Vector2, Vector3,
} from 'three'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'
import { Fn, If, Loop, clamp, exp, float, int, max, min, normalize, smoothstep, texture, uniform, uv, vec2, vec3, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import { CUMULUS_SIGMA, KIND_CUMULUS, type CloudField } from './cloudField.js'
import type { CloudTierName } from './clouds.js'
import { sunDirectionNode } from './lighting.js'

/**
 * Cloud shadows (design: docs/superpowers/specs/2026-09-19-cloud-shadows-design.md).
 *
 * A sun-view transmittance map: one 8-bit channel, MAP_TEXELS square over
 * MAP_SIDE_M around the eye, rendered every frame by a full-screen quad
 * whose fragment integrates the SAME cloud density the dome marches
 * (cloudField.ts) up the sun ray from a sea-level ground point. The lookup
 * node undoes the camera-relative shift, applies exact directional-sun
 * parallax, fades to 1 above the lowest cumulus deck, and samples the map.
 * The sun's custom `shadow.shadowNode` carries the lookup into every lit
 * material (three r186 AnalyticLightNode.setupShadow); the terrain and the
 * ocean, which light themselves, call `node()` directly.
 */
export const MAP_TEXELS = 1024
export const MAP_SIDE_M = 80_000
export const MAP_TEXEL_M = MAP_SIDE_M / MAP_TEXELS
/** The outer ring that fades to no shadow, so clamp-to-edge beyond the map is seamless. */
export const MAP_FADE_M = 8000
/** How dark the sea goes under an opaque cloud: it loses glint and subsurface
 *  light but still reflects the sky. One number, for Mark to tune by eye. */
export const OCEAN_SHADOW_FLOOR = 0.6
export const SHADOW_TIERS = { high: { taps: 4 }, medium: { taps: 3 }, low: { taps: 2 } } as const

/** DEV-only `?cloudShadow=off|show`: the control for every budget and image
 *  measurement, and the probe that paints T as gray on the terrain and sea. */
export const CLOUD_SHADOW_PARAM = 'cloudShadow'
export type CloudShadowMode = 'off' | 'show'
export function cloudShadowFromQuery(search: string): CloudShadowMode | undefined {
  const raw = new URLSearchParams(search).get(CLOUD_SHADOW_PARAM)
  if (raw === null) return undefined
  if (raw === 'off' || raw === 'show') return raw
  throw new Error(`${CLOUD_SHADOW_PARAM}: ${JSON.stringify(raw)} is not a cloud shadow mode`)
}

export function snapToTexel(x: number, z: number, texelM = MAP_TEXEL_M): { x: number; z: number } {
  return { x: Math.round(x / texelM) * texelM, z: Math.round(z / texelM) * texelM }
}

export function sunParallaxXZ(sun: { x: number; y: number; z: number }, y: number): { x: number; z: number } {
  return { x: (-sun.x / sun.y) * y, z: (-sun.z / sun.y) * y }
}

export type CloudShadowHandle = {
  node(position: Node<'vec3'>, frame: 'eyeRelative' | 'world'): Node<'float'>
  readonly enabled: boolean
  readonly showing: boolean
  readonly target: RenderTarget
  readonly scene: Scene
  readonly camera: OrthographicCamera
  readonly taps: number
  centerXZ(): { x: number; z: number }
  setTier(name: CloudTierName): void
  update(eye: Vec3): void
  dispose(): void
}

export function createCloudShadow(field: CloudField, mode?: CloudShadowMode): CloudShadowHandle {
  const lowest = field.lowestCumulus()
  const enabled = lowest !== null && mode !== 'off'

  const target = new RenderTarget(MAP_TEXELS, MAP_TEXELS, {
    format: RedFormat, type: UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: LinearFilter, magFilter: LinearFilter, wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, generateMipmaps: false,
  })
  /** South-west corner of the map in true world metres (x east, z SOUTH: +z is south since 29f5319). */
  const mapOrigin = uniform(new Vector2())
  const taps = uniform(SHADOW_TIERS.high.taps, 'int')
  const deckBase = uniform(lowest?.baseM ?? 0)
  const deckTop = uniform(lowest?.topM ?? 1)
  const enabledU = uniform(enabled ? 1 : 0)

  // ---- the pass: one quad, one fragment per texel -------------------------
  const material = new MeshBasicNodeMaterial()
  material.colorNode = Fn(() => {
    // uv (0,0) is the map's south-west corner; the quad fills the clip square.
    const ground = mapOrigin.add(uv().mul(MAP_SIDE_M)).toVar()
    const sun = normalize(sunDirectionNode).toVar()
    const tau = float(0).toVar()
    const tapsF = taps.toFloat().toVar()
    Loop({ start: int(0), end: field.layerCount, type: 'int', condition: '<' }, ({ i }) => {
      const layer = (field.layerData.element(i) as unknown as Node<'vec4'>).toVar()
      const base = layer.x.toVar()
      const thickness = layer.y.toVar()
      const coverage = layer.z.toVar()
      const kind = layer.w.toVar()
      If(kind.lessThan(0.5).and(coverage.greaterThan(0)), () => {
        Loop({ start: int(0), end: taps, type: 'int', condition: '<', name: 'k' } as unknown as Node<'int'>, ({ k }) => {
          const h = k.toFloat().add(0.5).div(tapsF)
          const y = base.add(thickness.mul(h))
          // The sun ray through (ground, 0): horizontal offset (sun.xz / sun.y) * y.
          const p = vec3(ground.x.add(sun.x.div(sun.y).mul(y)), y, ground.y.add(sun.z.div(sun.y).mul(y)))
          tau.addAssign(field.density(p, base, thickness, coverage, kind).mul(thickness.div(tapsF)).mul(CUMULUS_SIGMA))
        })
      })
    })
    const t = exp(tau.negate()).toVar()
    // Fade to 1 over the outer MAP_FADE_M so the clamp beyond the map is invisible.
    const edge = min(min(uv().x, uv().y), min(float(1).sub(uv().x), float(1).sub(uv().y))).mul(MAP_SIDE_M)
    const fade = smoothstep(0, MAP_FADE_M, edge)
    const out = float(1).sub(float(1).sub(t).mul(fade))
    return vec4(out, out, out, 1)
  })()
  const scene = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  scene.add(quad)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // ---- the lookup ---------------------------------------------------------
  const map = texture(target.texture)
  const node = (position: Node<'vec3'>, frame: 'eyeRelative' | 'world'): Node<'float'> =>
    Fn(() => {
      // `positionWorld` is eye-relative under camera-relative rendering
      // (scene.position = -eye, main.ts); a material that already has a true
      // world position passes 'world' and skips the add.
      const world = (frame === 'eyeRelative' ? position.add(field.eyeWorld) : position).toVar()
      const sun = normalize(sunDirectionNode).toVar()
      const ground = world.xz.sub(vec2(sun.x, sun.z).div(sun.y).mul(world.y))
      const st = ground.sub(mapOrigin).div(MAP_SIDE_M)
      const sampled = map.sample(st).r
      const aboveDeck = smoothstep(deckBase, deckTop, world.y)
      const t = max(sampled, aboveDeck)
      // `enabledU` is 0 for a clear sky or `?cloudShadow=off`: constant 1.
      return clamp(float(1).sub(float(1).sub(t).mul(enabledU)), 0, 1)
    })()

  // The camera never moves: the quad fills its clip square and the map's
  // world placement is entirely `mapOrigin`. `center` is the CPU mirror.
  const center = { x: 0, z: 0 }
  return {
    node,
    enabled,
    showing: enabled && mode === 'show',
    target, scene, camera,
    get taps() { return taps.value },
    centerXZ: () => ({ ...center }),
    setTier(name: CloudTierName): void { taps.value = SHADOW_TIERS[name].taps },
    update(eye: Vec3): void {
      const c = snapToTexel(eye.x, eye.z)
      center.x = c.x
      center.z = c.z
      mapOrigin.value.set(c.x - MAP_SIDE_M / 2, c.z - MAP_SIDE_M / 2)
    },
    dispose(): void {
      target.dispose()
      quad.geometry.dispose()
      material.dispose()
    },
  }
}
```

Notes for the implementer, each a 16a trap or a three r186 fact:
- `Loop` with a `name:` inner counter and `.toVar()` on the layer element are REQUIRED, not style (16a handoff trap 3).
- The `Fn` returns ONE node (`vec4`), never an object (trap 1).
- `field.density` samples both volumes; that is the same cost profile the light march has. Do not add a "coarse" variant; the spec says one function.
- The quad's `uv()` runs 0..1 across the target; the camera is a fixed identity view of the clip square and MUST NOT be moved to the map center (a camera translated 40 km from its quad renders nothing). The snapped center lives in `mapOrigin` (GPU) and `centerXZ()` (CPU mirror for the test).
- `map.sample(st)` is TSL's explicit-UV sample on a `TextureNode`; `texture(target.texture, st)` is the equivalent form if `.sample` is not typed in @types/three 0.186 -- use whichever compiles, and record which in the ledger.
- `+z is SOUTH` in this world (29f5319). The map's origin is the minimum-x, minimum-z corner; nothing here depends on which compass direction that is.

- [ ] **Step 4: Run** `npx vitest run tests/render/cloudShadow.test.ts` → PASS.

- [ ] **Step 5: Run** `npm run verify; echo rc=$?` → `rc=0`. If depcruise flags a cycle `clouds.ts -> cloudShadow.ts -> clouds.ts` (the `CloudTierName` type import): move `CLOUD_TIERS`/`CloudTierName` to `scene/tiers.ts`? NO -- `tiers.ts` is the scenery tiers. Instead import the type with `import type`, which depcruise's runtime-only view ignores (see `.dependency-cruiser.cjs` `no-circular` comment). If it still flags, declare `type CloudTierName = 'high' | 'medium' | 'low'` locally and add `expectTypeOf<CloudTierName>().toEqualTypeOf<keyof typeof CLOUD_TIERS>()` to the test.

- [ ] **Step 6: Commit**

```bash
git add src/render/scene/cloudShadow.ts tests/render/cloudShadow.test.ts docs/superpowers/plans/2026-09-19-cloud-shadows.md
git commit -m "Plan 16b task 3: the sun-view transmittance map, its pass material and its parallax lookup node, constructed and tested under Node"
```

---

### Task 4: The readers: terrain, ocean, and every lit mesh

**Files:**
- Modify: `src/render/terrain/mesh.ts` (`createRingMaterial` signature and line 281; `createTerrainMesh` signature), `src/render/ocean/mesh.ts` (`createOcean` signature and the `colorNode` at ~line 516), `src/render/scene/hellcat.ts`, `src/render/scene/ship.ts`, `src/render/scene/vegetation.ts`, `src/render/scene/runway.ts`, `src/render/scene/airfield.ts`, `src/render/scene/markers.ts`
- Test: `tests/render/cloudShadow.test.ts` (append), `tests/render/scenery.test.ts` and `tests/render/ocean/mesh.test.ts` (unchanged: the new parameters are optional)

**Interfaces:**
- Consumes: `CloudShadowHandle` from Task 3.
- Produces: `createTerrainMesh(header, shadow?: CloudShadowHandle)` and `createOcean(field, beaufort, cascades?, terrainTexture?, shadow?: CloudShadowHandle)`. Every `Mesh`/`InstancedMesh` returned by the six scene creators has `receiveShadow === true`.

- [ ] **Step 1: Write the failing tests** (append to `tests/render/cloudShadow.test.ts`):

```ts
import { InstancedMesh, Mesh as ThreeMesh, type Object3D } from 'three'
import { createHellcat } from '../../src/render/scene/hellcat.js'
import { createShipMesh } from '../../src/render/scene/ship.js'
import { createMarkers } from '../../src/render/scene/markers.js'
import { createRunway } from '../../src/render/scene/runway.js'
import { createAirfield } from '../../src/render/scene/airfield.js'
import { createVegetation } from '../../src/render/scene/vegetation.js'
import { createTerrainMesh } from '../../src/render/terrain/mesh.js'
import { TERRAIN_HEADER } from '../../src/render/terrain/lod.js'
import { createOcean } from '../../src/render/ocean/mesh.js'
import { createDepthField } from '../../src/render/ocean/depth.js'
import { loadAirfield, loadShipSpec } from '../../tools/content/load.js'

describe('cloud shadow readers (Plan 16b)', () => {
  const meshesUnder = (root: Object3D): (ThreeMesh | InstancedMesh)[] => {
    const out: (ThreeMesh | InstancedMesh)[] = []
    root.traverse((o) => { if (o instanceof ThreeMesh || o instanceof InstancedMesh) out.push(o) })
    return out
  }
  it('every lit mesh receives shadow, so the sun\'s custom shadow node reaches it', () => {
    // three multiplies the sun's direct term by `light.shadow.shadowNode` ONLY
    // on objects with `receiveShadow` (AnalyticLightNode.setup, r186). A mesh
    // added without the flag is lit as if the sky were clear.
    const flat = { heightAt: () => 0, normalAt: () => ({ x: 0, y: 1, z: 0 }) } as unknown as Parameters<typeof createRunway>[0]
    const tacloban = loadAirfield('tacloban')
    const roots: Object3D[] = [
      createHellcat().root, createShipMesh(loadShipSpec('essex')), createMarkers(),
      createRunway(flat, tacloban), createAirfield(flat, tacloban), createVegetation(flat, [tacloban]).object,
    ]
    for (const root of roots) {
      const meshes = meshesUnder(root)
      expect(meshes.length).toBeGreaterThan(0)
      for (const m of meshes) expect(m.receiveShadow, `${root.name || root.type} has an unshadowed mesh`).toBe(true)
    }
  })
  it('the terrain and the ocean construct with a shadow handle, and without one', () => {
    const field = deck()
    const shadow = createCloudShadow(field)
    const terrain = createTerrainMesh(TERRAIN_HEADER, shadow)
    expect(terrain.object.children.length).toBeGreaterThan(0)
    const depth = createDepthField({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, samples: 3, encoding: 'int16-metres' }, new Int16Array(9).fill(-125))
    const ocean = createOcean(depth, 4, [], undefined, shadow)
    ocean.userData.disposeOcean()
    createOcean(depth, 4).userData.disposeOcean()
    shadow.dispose()
    field.dispose()
  })
})
```

Check the exact names before running: `TERRAIN_HEADER` is what `main.ts:498` passes (grep its import there and use the same module); `loadShipSpec`'s name and the ship id come from `tools/content/load.ts` and `content/ships/` (grep `createShipMesh(` in `tests/render/ship.test.ts` and copy its fixture exactly); `createRunway`'s first parameter type is `TerrainField` from `src/render/terrain/field.ts` or wherever `tests/render/runway.test.ts` builds it -- copy that test's fixture instead of the `flat` stub above if one exists. The stub's shape is the only thing that may change; the assertions do not.

- [ ] **Step 2: Run** `npx vitest run tests/render/cloudShadow.test.ts` → FAIL (`receiveShadow` false; `createTerrainMesh` takes one argument -- a type error surfaces at `verify`, vitest runs it anyway).

- [ ] **Step 3: Implement**

`terrain/mesh.ts`:
- `createRingMaterial(..., cover: CoverNodes, shadow?: CloudShadowHandle)` and, replacing line 281:
  ```ts
  const lambert = clamp(dot(varying(normal), sun), 0, 1)
  // Plan 16b: cloud shadow scales the direct term only; ambient stays, so
  // the ground under an opaque cloud keeps AMBIENT, like a north slope.
  // The terrain already has TRUE world coordinates (`worldXZ` from
  // `nodeSpec`, `heightM` from the field), so it passes 'world' and the
  // node adds no eye offset. `varying` so the lookup is per fragment.
  const shadowT = shadow ? shadow.node(varying(vec3(worldXZ.x, heightM, worldXZ.y)), 'world') : float(1)
  const lit = albedo.mul(float(AMBIENT).add(lambert.mul(1 - AMBIENT).mul(shadowT)))
  ```
  The sun's node (Task 5) is the only `'eyeRelative'` caller; the terrain and the ocean pass `'world'`.
- `?cloudShadow=show`: after `const shaded = mix(lit, color(SKY_HAZE), varying(fog))`, add `const painted = shadow?.showing ? vec3(shadowT, shadowT, shadowT) : shaded` and return `painted` from the `colorNode` Fn instead of `shaded`.
- `createTerrainMesh(header: TerrainHeader, shadow?: CloudShadowHandle)` passes `shadow` through to every `createRingMaterial` call.
- Imports: `import type { CloudShadowHandle } from '../scene/cloudShadow.js'`.

`ocean/mesh.ts`:
- `export function createOcean(field: DepthField, beaufort: number, cascades: readonly OceanCompute[] = [], terrainTexture?: DataTexture, shadow?: CloudShadowHandle): Object3D`.
- The ocean's vertices are eye-relative in XZ (`positionLocal.xz` is around the eye; `worldXZ = positionLocal.xz + camera` is true world) and the sea is at y = 0, so parallax is zero and the true-world point is `vec3(worldXZ.x, 0, worldXZ.y)`. Replace the `material.colorNode = ...` assignment with:
  ```ts
  const unshadowed = cascades.length === 0 ? waterColour : mix(
    mix(waterColour.mul(max(normal.y, 0.3)), color(0x9abacb), fresnel), color(0xe4eff0), clamp(foam, 0, 1))
  // Plan 16b: under cloud the sea loses glint and subsurface light but still
  // reflects the sky, hence a floor rather than the terrain's direct-only scale.
  const shadowT = shadow ? shadow.node(vec3(worldXZ.x, 0, worldXZ.y), 'world') : float(1)
  material.colorNode = shadow?.showing ? vec3(shadowT, shadowT, shadowT) : unshadowed.mul(mix(float(OCEAN_SHADOW_FLOOR), float(1), shadowT))
  ```
  Import `OCEAN_SHADOW_FLOOR` and the handle type from `../scene/cloudShadow.js`.

Six creators, one line each, on every `Mesh`/`InstancedMesh` they build (hellcat: after each `root.add(x)` write `x.receiveShadow = true`, or loop `root.traverse` once before `return`; ship: same on `root` before `return root`; markers: `m.receiveShadow = true` in the loop; runway: on the returned mesh; airfield: in `batched()` on each `new Mesh`; vegetation: inside `for (const mesh of [crowns, trunks])`). Add one comment at the first of them: `// Plan 16b: the sun's custom shadow node reaches only receivers (cloudShadow.ts).`

- [ ] **Step 4: Run** `npx vitest run tests/render/cloudShadow.test.ts tests/render/scenery.test.ts tests/render/ocean tests/render/scene.test.ts tests/render/ship.test.ts tests/render/runway.test.ts` → PASS.

- [ ] **Step 5: Run** `npm run verify; echo rc=$?` → `rc=0`.

- [ ] **Step 6: Commit**

```bash
git add src/render/terrain/mesh.ts src/render/ocean/mesh.ts src/render/scene/hellcat.ts src/render/scene/ship.ts src/render/scene/vegetation.ts src/render/scene/runway.ts src/render/scene/airfield.ts src/render/scene/markers.ts src/render/scene/cloudShadow.ts tests/render/cloudShadow.test.ts docs/superpowers/plans/2026-09-19-cloud-shadows.md
git commit -m "Plan 16b task 4: the terrain scales its direct term and the ocean darkens to a floor from the shadow map; every lit mesh receives the sun's shadow node"
```

---

### Task 5: Wire the pass into boot and the frame

**Files:**
- Modify: `src/render/main.ts` (boot around lines 498-547 and 583; the `__ww2.clouds` hook at 361; the frame loop at 1143-1151), `src/render/diagnostics.ts:243`
- Test: `tests/render/frame.test.ts` or a new `tests/render/cloudShadowWiring.test.ts` only if a pure function is extracted; otherwise this task's test is Task 6's Tier 2 run. `npm run verify` must still pass.

**Interfaces:**
- Consumes: `createCloudField`, `createCloudShadow`, `cloudShadowFromQuery`, `SHADOW_TIERS`, `MAP_SIDE_M`.
- Produces: `__ww2.clouds()` returns `{ layers, tier, steps, shadow: { enabled, taps, mapSideM } }`.

- [ ] **Step 1: Reorder boot so the field exists before the terrain.** `loadSkyNoise()` (line 541) is an independent fetch; move it up: right before `const terrain = createTerrainMesh(TERRAIN_HEADER)` (line 498) add

```ts
  // Plan 16b: the shadow map's lookup node is baked into the terrain's and
  // the ocean's materials, so the cloud field and the map exist before them.
  // The noise is fetched here rather than beside the bathymetry (16a) for
  // that reason; a clear-sky scenario still loads it (16a's reason stands).
  const skyNoise = await loadSkyNoise()
  const forcedCloudTier = import.meta.env.DEV ? cloudTierFromQuery(location.search) : undefined
  cloudLayers = forcedCloudTier === 'off' ? [] : bundle.scenario.weather.clouds ?? []
  cloudTier = forcedCloudTier ?? oceanTier.name
  const cloudField = createCloudField(cloudLayers, skyNoise)
  const shadowMode = import.meta.env.DEV ? cloudShadowFromQuery(location.search) : undefined
  const shadow = createCloudShadow(cloudField, shadowMode)
  if (cloudTier !== 'off') shadow.setTier(cloudTier)
  const terrain = createTerrainMesh(TERRAIN_HEADER, shadow)
```

and delete the four lines that previously computed `skyNoise`, `forcedCloudTier`, `cloudLayers`, `cloudTier` at 541-544. Check that `bundle` and `oceanTier` are in scope at line 498 (both are declared earlier -- verify with a grep before moving; if `oceanTier` is chosen later, keep `cloudTier`'s assignment where it was and only move the field/shadow creation).

- [ ] **Step 2: Create the dome from the shared field**: `const clouds = createClouds(cloudLayers, skyNoise, cloudField)`. Pass `shadow` into `createOcean(oceanDepth, beaufort, cascades, terrain.levelTexture(FINEST_FETCHED_LEVEL), shadow)` at BOTH call sites (548 and the `replacement` in `adaptOceanQuality`). In `adaptOceanQuality`, next to `clouds.setTier(next.name)`, add `shadow.setTier(next.name)`.

- [ ] **Step 3: Hand the node to the sun.** `createLighting()` gains an optional parameter: `export function createLighting(shadowNode?: Node<'float'>): Object3D`; when given, `sun.castShadow = true; sun.shadow.shadowNode = shadowNode` (cast: `(sun.shadow as unknown as { shadowNode: Node }).shadowNode = shadowNode` if @types/three lacks the field; record in the ledger). In `main.ts:583`: `scene.add(createLighting(shadow.enabled ? shadow.node(positionWorld, 'eyeRelative') : undefined))` with `positionWorld` imported from `three/tsl`. And right after `initRenderer` (line 180): `renderer.shadowMap.enabled = true` with the comment `// Plan 16b: gates the sun's custom shadow node (AnalyticLightNode.setupShadow); with a custom node three renders no shadow map.` Add a `scene.test.ts` case: `createLighting(float(0.5))` yields a sun with `castShadow === true` and `createLighting()` yields `castShadow === false`.

- [ ] **Step 4: The frame.** Replace lines 1143-1151:

```ts
    clouds.update(current.eye.position, skyTimeS, current.world.wind)
    for (const cascade of cascades) {
      cascade.dispatch(skyTimeS)
    }
    const sampling = renderer.hasFeature('timestamp-query') && gpuFrameTimesMs.length < FRAME_TIME_CAPACITY
    if (!(sampling && gpuResolvePending)) {
      // Plan 16b: the shadow map first, inside the same frame and the same
      // timestamp pool ('render'), so the budget below includes it.
      if (shadow.enabled) {
        shadow.update(current.eye.position)
        renderer.setRenderTarget(shadow.target)
        renderer.render(shadow.scene, shadow.camera)
        renderer.setRenderTarget(null)
      }
      renderer.render(scene, camera)
    }
```

- [ ] **Step 5: Diagnostics.** In `diagnostics.ts:243` extend the type: `readonly clouds: () => { readonly layers: readonly CloudLayer[]; readonly tier: CloudTierName | 'off'; readonly steps: number; readonly shadow: { readonly enabled: boolean; readonly taps: number; readonly mapSideM: number } }`. In `main.ts:361`: `clouds: () => ({ layers: cloudLayers, tier: cloudTier, steps: ..., shadow: { enabled: shadow.enabled, taps: shadow.taps, mapSideM: MAP_SIDE_M } })`.

- [ ] **Step 6: Run** `npm run verify; echo rc=$?` → `rc=0`. Then a smoke run on the reference GPU BEFORE committing, because nothing headless can see this pass: with the dev server up, `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2 -- tests/e2e/clouds.spec.ts` must still pass 7/7 with zero console errors. If the screen is black with zero validation errors, a TSL Fn failed to build: check the browser console for `THREE.TSL` and apply 16a's traps.

- [ ] **Step 7: Commit**

```bash
git add src/render/main.ts src/render/diagnostics.ts src/render/scene/lighting.ts tests/render/scene.test.ts docs/superpowers/plans/2026-09-19-cloud-shadows.md
git commit -m "Plan 16b task 5: the shadow map renders each frame before the scene, the sun carries its lookup, the terrain and sea read it, the DEV hook reports it"
```

---

### Task 6: Prove it on the GPU, tune, and hand off

**Files:**
- Create: `tests/e2e/cloudShadow.spec.ts`, `docs/handoff/2026-09-19-plan16b-cloud-shadows.md`
- Modify: `README.md` (lines 84-93), `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 row 16, line 721), `src/render/scene/cloudShadow.ts` (constants, only if tuning is needed)

- [ ] **Step 1: Write `tests/e2e/cloudShadow.spec.ts`**:

```ts
import { test, expect, type Page } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { CLOUD_SHADOW_PARAM } from '../../src/render/scene/cloudShadow.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { loadAirfield } from '../../tools/content/load.js'

/**
 * Tier 2, cloud shadows (Plan 16b). Screenshots are READ by the executor;
 * the numbers are design §6. Same console-error guard as clouds.spec.ts:
 * a TSL graph that fails to build is a black frame with zero validation
 * errors, so every case also fails on a three console error.
 */
test.setTimeout(240_000)
const errors = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
const threeErrors: string[] = []
test.beforeEach(({ page }) => {
  threeErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') threeErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => threeErrors.push(e.message))
})
test.afterEach(() => {
  expect(threeErrors, `console errors:\n${threeErrors.join('\n')}`).toEqual([])
})
const gpuP95 = async (page: Page): Promise<{ p95: number; n: number }> => {
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  return { p95: percentile(gpu, 0.95), n: gpu.length }
}
const TACLOBAN = loadAirfield('tacloban').runway.center
const OVER_GULF = { x: TACLOBAN.x, z: TACLOBAN.z - 8000 }

/** Mean and horizontal standard deviation of gray over a screen rectangle,
 *  decoded in the browser to avoid a PNG dependency (clouds.spec.ts pattern). */
async function grayStats(page: Page, png: Buffer, rect: { x: number; y: number; w: number; h: number }): Promise<{ mean: number; sd: number }> {
  return page.evaluate(async ({ base64, rect }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const { data } = ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
    let sum = 0, sumSq = 0
    const n = rect.w * rect.h
    for (let p = 0; p < n; p++) {
      const g = (data[p * 4]! + data[p * 4 + 1]! + data[p * 4 + 2]!) / 3
      sum += g
      sumSq += g * g
    }
    const mean = sum / n
    return { mean, sd: Math.sqrt(Math.max(sumSq / n - mean * mean, 0)) }
  }, { base64: png.toString('base64'), rect })
}
/** Holds the title at tick 0 and hides it, so on/off images differ only by the shader. */
async function fixedView(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null)
  await expect(page.getByRole('dialog', { name: 'Title' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Title' }).evaluate((el) => { el.style.visibility = 'hidden' })
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBe(0)
}
/** The sea below the deck, seen from 3,200 m looking level: the lower third of the frame. */
const SEA_STRIP = { x: 200, y: 1000, w: 2160, h: 300 }

test('budget: the pass costs under 0.5 ms and is inside the measured number', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const at = { ...OVER_GULF, y: 1300 }
  await page.goto(`${spawnUrl(at)}&${CLOUD_SHADOW_PARAM}=off`)
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())).shadow.enabled).toBe(false)
  const off = await gpuP95(page)
  await page.goto(spawnUrl(at))
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  const c = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())
  expect(c.shadow).toEqual({ enabled: true, taps: 4, mapSideM: 80_000 })
  const on = await gpuP95(page)
  console.log(`shadow off p95 ${off.p95.toFixed(3)} ms (${off.n}); on p95 ${on.p95.toFixed(3)} ms (${on.n}); cost ${(on.p95 - off.p95).toFixed(3)} ms`)
  expect(off.n).toBeGreaterThan(120)
  expect(on.n).toBeGreaterThan(120)
  expect(on.p95 - off.p95, 'the pass must be inside the timestamp the budget reads').toBeGreaterThan(0)
  expect(on.p95 - off.p95).toBeLessThan(0.5)
  expect(on.p95).toBeLessThan(6.0)
  expect(await errors(page)).toEqual([])
})

test('above the deck: the sea is darker and patchier with shadows than without', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const at = { ...OVER_GULF, y: 3200 }
  await fixedView(page, `${spawnUrl(at)}&${CLOUD_SHADOW_PARAM}=off`)
  const off = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-above-off.png' }), SEA_STRIP)
  await fixedView(page, spawnUrl(at))
  const on = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-above-on.png' }), SEA_STRIP)
  console.log('sea strip gray', { off, on })
  expect(off.mean - on.mean, 'shadows must darken the sea').toBeGreaterThan(5)
  expect(on.sd, 'shadows are patches, not a tint').toBeGreaterThan(off.sd)
  expect(await errors(page)).toEqual([])
})

test('clear sky: the gunnery range is identical with and without the pass', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const range = `/?${SCENARIO_PARAM}=gunnery-range`
  await fixedView(page, `${range}&${CLOUD_SHADOW_PARAM}=off`)
  const off = await grayStats(page, await page.screenshot(), { x: 0, y: 0, w: 2560, h: 1440 })
  await fixedView(page, range)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())).shadow.enabled).toBe(false)
  const on = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-range.png' }), { x: 0, y: 0, w: 2560, h: 1440 })
  expect(Math.abs(on.mean - off.mean)).toBeLessThan(1)
  expect(await errors(page)).toEqual([])
})

test('show probe from the chocks: one gray pattern across runway and terrain, and it stays on the ground in flight', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(`/?${CLOUD_SHADOW_PARAM}=show`)
  await waitForTerrain(page)
  await page.keyboard.down('Numpad8')
  await page.waitForTimeout(1500)
  await page.keyboard.up('Numpad8')
  await page.screenshot({ path: 'test-results/cloud-shadow-show-chocks.png' })
  // Level flight at 800 m over the strip: two frames 3 s apart. The pattern
  // must move with the ground track, not with the airplane: a wrong eye
  // offset in the lookup shows as the same image twice.
  await page.goto(`${spawnUrl({ x: TACLOBAN.x, y: 800, z: TACLOBAN.z + 4000 })}&${CLOUD_SHADOW_PARAM}=show`)
  await waitForTerrain(page)
  await page.waitForTimeout(1000)
  const a = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-show-flight-a.png' }), SEA_STRIP)
  await page.waitForTimeout(3000)
  const b = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-show-flight-b.png' }), SEA_STRIP)
  console.log('show probe strips', { a, b })
  expect(a.sd, 'the probe must paint a pattern, not a flat gray').toBeGreaterThan(8)
  expect(Math.abs(a.mean - b.mean), 'the pattern moved under the airplane').toBeGreaterThan(0.5)
  expect(await errors(page)).toEqual([])
})

test('deck run with shadows on stays under 6 ms', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(`/?${SCENARIO_PARAM}=deck-quals`)
  await waitForTerrain(page)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())).shadow.enabled).toBe(true)
  await page.keyboard.down('Equal')
  await page.waitForTimeout(2000)
  const run = await gpuP95(page)
  await page.keyboard.up('Equal')
  console.log(`deck run with shadows gpu p95 ${run.p95.toFixed(3)} ms (${run.n})`)
  expect(run.n).toBeGreaterThan(120)
  expect(run.p95).toBeLessThan(6.0)
  await page.screenshot({ path: 'test-results/cloud-shadow-deck-run.png' })
  expect(await errors(page)).toEqual([])
})
```

The "pattern moved" assertion in the show probe is deliberately weak (a mean shift of half a gray level): its job is to fail on the exact bug of the pattern being glued to the airplane, where the two strips would be identical. If the first run shows the two means differ by less than 0.5 while the images visibly differ, widen the strip or compare `sd` instead, and record why in the ledger. READ both images before deciding.

- [ ] **Step 2: Run on the reference GPU**: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2 -- tests/e2e/cloudShadow.spec.ts 2>&1 | tee /tmp/shadow-tier2.log; echo rc=${PIPESTATUS[0]}`. Then READ every PNG in `test-results/cloud-shadow-*.png` with the Read tool. What to look for, per image:
  - `above-on` vs `above-off`: dark patches on the water whose shapes match the cloud bases above them; the horizon line and the cirrus unchanged.
  - `show-chocks`: a gray pattern on the ground; the runway's gray continues the terrain's gray at the runway edge with no seam and no brightness step (the light-hook path and the terrain path agree). A seam here is the parallax or the frame argument being wrong for one of them.
  - `show-flight-a/b`: the same pattern, shifted along the ground track.
  - `range`: the gunnery range as it was, no gray, no darkening.
  - `deck-run`: the carrier deck with a shadow across it if a cloud is overhead, the sea beyond it patched.

- [ ] **Step 3: If the pass costs more than 0.5 ms**: lever 1, `SHADOW_TIERS.high.taps` 4 → 3 (measure); lever 2, `MAP_TEXELS` 1024 → 768 (texel 104 m; measure). If the delta reads 0.000 or the alternating-noise pattern of the 2026-09-17 note, the pass is outside the timestamp pool or is disturbing it: switch to the compute fallback of spec §7 as a new task appended to this plan, and record the measurement that forced it. If the draw-call count check is wanted, `renderer.info.render.calls` is readable from a `page.evaluate` through a DEV hook -- add `calls: renderer.info.render.calls` to `__ww2.clouds().shadow` only if needed to diagnose.

- [ ] **Step 4: Re-run the neighbors**: `npm run test:tier2 -- tests/e2e/clouds.spec.ts tests/e2e/terrain.spec.ts tests/e2e/deckQuals.spec.ts tests/e2e/gunnery.spec.ts tests/e2e/ocean.spec.ts` (same env) → all pass; the clouds pixel-residual guard still under 3.

- [ ] **Step 5: Write `docs/handoff/2026-09-19-plan16b-cloud-shadows.md`** in the 16a handoff's shape: what shipped, the measured table (off/on p95 in the budget view, the delta, the deck run, the terrain view; the sea-strip means and sds; which tap count and map size shipped), the images inspected and what each showed, every trap hit (with the three r186 line that explains it), the contingency used if any, and the known limitations (the single-deck above-fade, the ocean floor constant untuned, no shadow on the cockpit panel, none from cirrus). Include a before/after PNG pair (the `above-off`/`above-on` screenshots, stacked, like `2026-09-19-clouds-distance.png`), read it before committing.

- [ ] **Step 6: README and §15.** In `README.md` lines 84-93 replace the last sentence with: "**Cloud shadows landed 2026-09-19 (Plan 16b):** one sun-view transmittance map rendered each frame from the same field, carried by the sun's custom shadow node into every lit material; the terrain and the sea read it directly. Cost <measured> ms at high, 1440p. See the [handoff](docs/handoff/2026-09-19-plan16b-cloud-shadows.md). A movable sun (16c) is designed next; master spec §15 holds the status." In the master spec's §15 row 16 (line 721) append "; 16b cloud shadows landed 2026-09-19 ([design](2026-09-19-cloud-shadows-design.md), [handoff](../../handoff/2026-09-19-plan16b-cloud-shadows.md)); 16c sun angle to be designed" replacing the existing "16b cloud shadows and 16c sun angle to be designed".

- [ ] **Step 7: Run** `npm run verify; echo rc=$?` → `rc=0`.

- [ ] **Step 8: Commit, then email the handoff**

```bash
git add tests/e2e/cloudShadow.spec.ts docs/handoff/2026-09-19-plan16b-cloud-shadows.md docs/handoff/2026-09-19-plan16b-cloud-shadows.png README.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md src/render/scene/cloudShadow.ts docs/superpowers/plans/2026-09-19-cloud-shadows.md
git commit -m "Close Plan 16b: cloud shadows measured on the reference GPU, handoff, roadmap row and README"
python3 tools/mail-doc.py docs/handoff/2026-09-19-plan16b-cloud-shadows.md "ww2airsim Plan 16b handoff: cloud shadows"
```

Do not push. Do not deploy. Tell Mark the host to fly it on is `ww2airsim.windomlane.org`, after asserting it returns 200.
