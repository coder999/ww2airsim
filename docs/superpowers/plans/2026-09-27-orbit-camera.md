# Orbit camera: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints: final product only** (Mark, 2026-09-27).

**Attended: no, run unattended** (Mark, 2026-09-27). Task 5's captures go in the handoff for when he is back.

**Where: a worktree** (Mark, 2026-09-27). Branch `worktree-orbit-camera`, cut from `main` at or after `f064a0d` (the spec commit). The branch may be pushed. Merging into `main`, pushing `main` and deploying are Mark's call. For Tier 2, point the worktree's own `vite.config.ts` at a spare dev slot: `ww2airsim-2` on port 5175, or `ww2airsim-3` on port 5174 (repo CLAUDE.md). That edit is local scratch and is never committed.

**Goal:** The chase camera can be swung around the plane with a left-button mouse drag and zoomed with the wheel; double-click resets it. C → cockpit → C returns to the default view.

**Architecture:**
- **Offset type and mouse mapping** go in `src/input/orbit.ts`. They are pure, a sibling of `lookAround.ts`: `OrbitOffset`, `MouseDelta`, `orbitFromMouse`, `wheelNotches`, `addMouse`.
- **Placement:** `cameraTransformFor` (`src/render/camera.ts`) gains an `orbit` argument and an optional surface-height callback. An unmoved orbit takes today's code path exactly.
- **Frame state:** `FrameState` gains `orbit`, and `nextFrameState` gains a `mouse` argument. Leaving chase resets the orbit.
- **DOM:** `main.ts` turns pointer and wheel events on the canvas into one `MouseDelta` per frame. The same screens that already block keys block it too.

**Tech Stack:** TypeScript, three.js (WebGPU), vitest (node), Playwright on the reference GPU.

**Spec:** `docs/superpowers/specs/2026-09-27-orbit-camera-design.md`. Read it in full before Task 1; this plan argues from it. The replay spec (`2026-09-27-instant-replay-design.md`) is the next plan and is **not** in scope. Read its §3 only so that nothing here blocks it: cameras must take any entity's `RenderState`, never "the player".

---

## Measured before writing this plan (`main` at `f064a0d`, 2026-09-27)

Claims to re-check before Task 1:

- **No mouse input.** Nothing in `src/` reads the mouse: `grep -rnE "addEventListener\('(wheel|mouse|pointer)" src` is empty.
- **Keys and modes.** `CameraMode = 'chase' | 'cockpit'` and `MODES = ['chase', 'cockpit']` (`src/render/frame.ts:214`). `cycleCamera` is `KeyC`.
- **Where the camera is computed.** `cameraTransformFor(mode, spec, render, look = LOOK_ZERO, speedMps = 120)` is called from `nextFrameState` (`frame.ts`, `const eye = cameraTransformFor(cameraMode, spec, render, look, speed)`). It is also called twice in `main.ts`'s DEV overrides (`inspectScenery`, `forcedLook`), which may keep the default orbit.
- **Every flight reset builds a fresh frame.** Restart, New game, a scenario rebuild and boot all go through `initialFrameStateFor` (`main.ts:646, 1478, 1525`). An `orbit: ORBIT_ZERO` there resets it on all of them.
- **Surface height.** `groundUnder(terrain, decks, x, z)` (`src/sim/world/ground.ts:34`) returns a deck or terrain height, or `null` when there is no terrain. `SEA_LEVEL_M = 0` (`src/sim/world/terrain.ts:25`).
- **Cloud history.** `shouldResetHistory` resets when the eye moves faster than `MAX_EYE_SPEED_MPS = 400` × frame time (`src/render/scene/cloudHistory.ts`).
- **Chase distance.** Today's chase eye is `CHASE_OFFSET_M = [-22, 6, 0]` × `chaseDistanceScale(speed)`, which is 0.8 to 1.2. That puts it 18 to 27 m from the plane, about 15° above its path.

## Plan rulings (made writing this plan; the spec is otherwise followed as written)

| ID | Ruling | Why |
| --- | --- | --- |
| P-1 | Orbit pitch is clamped to **[−80°, +60°]**, not the spec's ±80°. | The default eye already sits about 15° above the plane. +80° on top of that would carry the eye past overhead to 95°, and the view would lean over backwards. With +60° the highest eye is about 75°. |
| P-2 | The spec §6 cloud-history test runs at **zoom 1** and 200 m/s. | At zoom 4 the eye sits about 105 m out. A 180°/s drag then moves it about 330 m/s on its own, and a reset there is correct, not a defect. At zoom 1: 26.4 m × π ≈ 83 m/s + 200 m/s < 400 m/s. |
| P-3 | The mouse is blocked while the title, chart or debrief is up, **and during the post-impact hold**. It is the same condition as the radar-range key's (`impact !== null \|\| destroyedAt !== null \|\| landingShown`). | One gate, shared with keys. Orbiting the fireball becomes a replay feature (replay spec §5). |
| P-4 | Yaw sign: **+yaw swings the eye to the plane's left**. Pitch sign: **+pitch raises the eye**. A drag right gives +yaw; a drag down gives +pitch (as when dragging a globe). | Stated once here and pinned by a test, so later readers don't re-derive it. |

## Global Constraints

- US spelling in new prose and identifiers (repo CLAUDE.md).
- `src/sim/` imports nothing from `render/` or `input/` (`.dependency-cruiser.cjs`). `src/input/orbit.ts` imports nothing from `render/`.
- **An unmoved orbit is bit-identical to today's chase view** (spec §7). That is exactly `ORBIT_ZERO` with the eye above the surface clearance.
- Orbit limits: pitch [−80°, +60°] (P-1), zoom [0.4, 4.0], 0.3°/px, ×1.1 per wheel notch.
- Surface clearance: 2 m (spec OC-3).
- No pointer lock (spec OC-5).
- Every task ends with `remote-run npm run verify`; capture `rc=$?` directly, never through a grep. On nexus, run only the test files you are touching.
- Escape `|` as `\|` inside markdown table cells.

## Review Focus

1. **A drag that starts on a HUD element or debrief button must not orbit.** Listen on the canvas only, so an element over it swallows the press. Pinned in Task 4's Tier 2 spec: a press on the debrief's Restart button leaves `orbit()` unchanged.
2. **A drag released outside the window, or during a tab switch, must not stay stuck.** Use pointer capture, end the drag on `pointerup`, `pointercancel` and `lostpointercapture`, and clear the drag on `blur`. Pinned in Task 4 with a fired `blur` mid-drag, after which moving the mouse changes nothing.
3. **Ctrl+wheel and trackpad pinch are the browser's zoom, not ours.** Ignore wheel events with `ctrlKey`. Pinned in Task 4.
4. **Parked on the carrier deck, a drag to −80° must stop the eye at the deck + 2 m, not at the sea + 2 m.** Pinned in Task 3 using a deck from `deck-quals`.
5. **A Restart in the middle of a drag must start from `ORBIT_ZERO`.** Pinned in Task 3 (`initialFrameStateFor`) and Task 4 (the drag state is dropped with `mouseDelta`).

---

### Task 1: Orbit offset type and camera placement

**Files:**
- Create: `src/input/orbit.ts`
- Modify: `src/render/camera.ts` (the chase branch of `cameraTransformFor`, and its signature)
- Test: `tests/render/camera.test.ts` (new `describe('orbit', …)` block)

**Interfaces:**
- Produces: `OrbitOffset`, `ORBIT_ZERO` from `src/input/orbit.ts`. `SurfaceHeightAt = (x: number, z: number) => number` and `ORBIT_SURFACE_CLEARANCE_M = 2` from `camera.ts`. The new signature: `cameraTransformFor(mode, spec, render, look = LOOK_ZERO, speedMps = 120, orbit: OrbitOffset = ORBIT_ZERO, surfaceHeightAt?: SurfaceHeightAt): EyeTransform`.

- [ ] **Step 1: Create the type** in `src/input/orbit.ts`:

```ts
/**
 * Where the pilot has swung the chase camera, relative to its default place
 * behind and above the airplane (orbit camera spec, 2026-09-27).
 *
 * An OFFSET on chase, like `LookOffset` is on both modes, not a mode of its
 * own (spec ruling OC-1): an unmoved orbit IS today's chase view. Measured in
 * the chase frame (heading + 0.92 x pitch, roll discarded), so a swing to the
 * wingtip stays on the wingtip through a turn -- Mark's "tethered".
 */
export type OrbitOffset = {
  /** Positive swings the eye to the airplane's LEFT (plan ruling P-4). Wrapped to (-PI, PI]. */
  readonly yawRad: number
  /** Positive raises the eye. Clamped to [ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD]. */
  readonly pitchRad: number
  /** Multiplies the chase distance. Clamped to [ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX]. */
  readonly zoom: number
}

export const ORBIT_ZERO: OrbitOffset = { yawRad: 0, pitchRad: 0, zoom: 1 }
```

- [ ] **Step 2: Write the failing tests** by appending to `tests/render/camera.test.ts`:

```ts
import { ORBIT_ZERO } from '../../src/input/orbit.js'
import { cameraTransformFor as place, ORBIT_SURFACE_CLEARANCE_M } from '../../src/render/camera.js'
import { shouldResetHistory } from '../../src/render/scene/cloudHistory.js'
import { dot, normalize, add, scale } from '../../src/sim/math/vec3.js'

/** The airplane's direction as seen from the eye, in the eye's own frame. */
const aircraftInEye = (eye: { position: Vec3; attitude: Quat }, target: Vec3) => {
  const d = normalize(sub(target, eye.position))
  const conj = { x: -eye.attitude.x, y: -eye.attitude.y, z: -eye.attitude.z, w: eye.attitude.w }
  return qRotate(conj, d)
}

describe('orbit', () => {
  const climbingTurn = qNormalize(qMul(qFromAxisAngle(v3(0, 1, 0), 0.7), qFromAxisAngle(v3(0, 0, 1), 0.3)))

  it('ORBIT_ZERO is bit-identical to the pre-orbit chase eye', () => {
    for (let i = 0; i < 64; i++) {
      const att = qNormalize(qMul(qFromAxisAngle(v3(0, 1, 0), i * 0.37), qFromAxisAngle(v3(1, 0, 0), i * 0.91)))
      const r = at(v3(i * 13, 1500, -i * 7), att)
      expect(place('chase', f6f, r, LOOK_CENTRE, 90 + i, ORBIT_ZERO, () => 0))
        .toEqual(place('chase', f6f, r, LOOK_CENTRE, 90 + i))
    }
  })

  it('+yaw swings the eye to the left, +pitch raises it (ruling P-4)', () => {
    const r = at(v3(0, 1000, 0))
    const left = place('chase', f6f, r, LOOK_CENTRE, 120, { yawRad: Math.PI / 2, pitchRad: 0, zoom: 1 })
    expect(left.position.z).toBeLessThan(-10) // body -Z is left; identity attitude
    const zero = place('chase', f6f, r)
    const up = place('chase', f6f, r, LOOK_CENTRE, 120, { yawRad: 0, pitchRad: 0.5, zoom: 1 })
    expect(up.position.y).toBeGreaterThan(zero.position.y + 5)
  })

  it('is tethered: a fixed offset keeps its heading-relative bearing through a turn', () => {
    const orbit = { yawRad: 1.1, pitchRad: 0.2, zoom: 1.5 }
    const bearings = [0, 1, 2, 3, 4, 5].map((k) => {
      const heading = qFromAxisAngle(v3(0, 1, 0), k)
      const r = at(v3(0, 1000, 0), heading)
      const rel = sub(place('chase', f6f, r, LOOK_CENTRE, 120, orbit).position, r.position)
      // Back into the airplane's heading frame.
      return qRotate({ ...heading, y: -heading.y }, rel)
    })
    for (const b of bearings) {
      expect(b.x).toBeCloseTo(bearings[0]!.x, 6)
      expect(b.y).toBeCloseTo(bearings[0]!.y, 6)
      expect(b.z).toBeCloseTo(bearings[0]!.z, 6)
    }
  })

  it('keeps the airplane where the default view frames it, from any angle', () => {
    const r = at(v3(0, 1000, 0), climbingTurn)
    const home = aircraftInEye(place('chase', f6f, r), r.position)
    for (const orbit of [
      { yawRad: 2.5, pitchRad: 0.9, zoom: 3 },
      { yawRad: -1.2, pitchRad: -1.3, zoom: 0.5 },
    ]) {
      const seen = aircraftInEye(place('chase', f6f, r, LOOK_CENTRE, 120, orbit), r.position)
      expect(Math.acos(Math.min(1, dot(seen, home)))).toBeLessThan((0.1 * Math.PI) / 180)
    }
  })

  it('zoom scales the distance', () => {
    const r = at()
    const d1 = length(sub(place('chase', f6f, r).position, r.position))
    const d3 = length(sub(place('chase', f6f, r, LOOK_CENTRE, 120, { ...ORBIT_ZERO, zoom: 3 }).position, r.position))
    expect(d3 / d1).toBeCloseTo(3, 9)
  })

  it('never puts the eye below the surface + clearance', () => {
    const r = at(v3(0, 50, 0)) // 50 m over the sea
    const eye = place('chase', f6f, r, LOOK_CENTRE, 120, { yawRad: 0, pitchRad: -80 * Math.PI / 180, zoom: 4 }, () => 0)
    expect(eye.position.y).toBeGreaterThanOrEqual(ORBIT_SURFACE_CLEARANCE_M)
  })

  it('a 180 deg/s drag at zoom 1 and 200 m/s never resets cloud history (plan ruling P-2)', () => {
    const dt = 1 / 60
    let prev = place('chase', f6f, at(v3(0, 1500, 0)), LOOK_CENTRE, 200)
    for (let i = 1; i <= 120; i++) {
      const pos = add(v3(0, 1500, 0), scale(v3(200, 0, 0), i * dt))
      const eye = place('chase', f6f, at(pos), LOOK_CENTRE, 200, { yawRad: Math.PI * i * dt, pitchRad: 0, zoom: 1 })
      expect(shouldResetHistory({ eye: eye.position, prevEye: prev.position, frameSeconds: dt })).toBe(false)
      prev = eye
    }
  })
})
```

Merge the new names into the file's existing import lines rather than adding duplicate `from` lines. `cameraTransformFor` is already imported, so use it directly instead of the `place` alias if lint objects. Add `ORBIT_SURFACE_CLEARANCE_M` to it; add `dot, normalize, add, scale` and `type Vec3` to the vec3 import, and `type Quat` to the quat import. The `{ ...heading, y: -heading.y }` trick is the inverse of a pure yaw: its axis is ±Y, so negating the Y component conjugates it. The helper `aircraftInEye` conjugates a general quaternion.

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run tests/render/camera.test.ts`
Expected: FAIL. Typecheck errors on the extra arguments and the missing `ORBIT_SURFACE_CLEARANCE_M` export.

- [ ] **Step 4: Implement the orbit in the chase branch of `cameraTransformFor`**

Add to `camera.ts`:

```ts
import { ORBIT_ZERO, type OrbitOffset } from '../input/orbit.js'

/** How far above the surface under it the chase/orbit eye is held (orbit spec OC-3). */
export const ORBIT_SURFACE_CLEARANCE_M = 2

/** Height of the surface (terrain, deck or sea) under a world x/z, metres. */
export type SurfaceHeightAt = (x: number, z: number) => number
```

Extend the signature with `orbit: OrbitOffset = ORBIT_ZERO` and `surfaceHeightAt?: SurfaceHeightAt` after `speedMps`. Update the doc comment: the function is still pure, and the new parameters are why. Replace the chase tail (from `const heading = …` to its `return`) with:

```ts
  const heading = headingOf(render.attitude)
  const pitch = pitchOf(render.attitude) * CHASE_PITCH_FOLLOW
  const chase = qNormalize(
    qMul(qFromAxisAngle(v3(0, 1, 0), heading), qFromAxisAngle(v3(0, 0, 1), pitch)),
  )
  // The orbit rotates the offset AND the eye's attitude by the same amount,
  // about the airplane, so the airplane keeps exactly the framing the default
  // view gives it (spec §3). Negated angles make +yaw swing left and +pitch
  // rise (plan ruling P-4). Skipped when there is no swing, so an unmoved
  // orbit is today's chase eye bit for bit (spec §7).
  const attitude =
    orbit.yawRad === 0 && orbit.pitchRad === 0
      ? chase
      : qNormalize(
          qMul(chase, qMul(qFromAxisAngle(v3(0, 1, 0), -orbit.yawRad), qFromAxisAngle(v3(0, 0, 1), -orbit.pitchRad))),
        )

  const [ox, oy, oz] = CHASE_OFFSET_M
  const distanceScale = chaseDistanceScale(speedMps) * orbit.zoom
  const placed = add(render.position, qRotate(attitude, v3(ox * distanceScale, oy * distanceScale, oz)))
  // OC-3: never under the sea, the ground or a deck. Height only; the
  // attitude is left alone, so a clamped eye sees the airplane a little
  // lower in frame rather than jumping its aim.
  const floor = surfaceHeightAt === undefined ? -Infinity : surfaceHeightAt(placed.x, placed.z) + ORBIT_SURFACE_CLEARANCE_M
  const position = placed.y < floor ? v3(placed.x, floor, placed.z) : placed

  return { position, attitude: withLook(attitude, look) }
```

`chaseDistanceScale(speedMps) * 1` is exact in IEEE-754, so the bit-identical test holds at `zoom: 1`.

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run tests/render/camera.test.ts tests/render/cloudHistory.test.ts`
Expected: PASS. That includes every chase test from before this task; they call without an orbit, so they cover the default path.

- [ ] **Step 6: Verify and commit**

```bash
remote-run npm run verify; rc=$?; echo rc=$rc   # must be 0
git add src/input/orbit.ts src/render/camera.ts tests/render/camera.test.ts
git commit -m "Orbit camera Task 1: OrbitOffset and tethered chase placement"
```

---

### Task 2: Mouse → orbit mapping

**Files:**
- Modify: `src/input/orbit.ts`
- Test: `tests/input/orbit.test.ts` (create)

**Interfaces:**
- Consumes: `OrbitOffset`, `ORBIT_ZERO` (Task 1).
- Produces:
  - `MouseDelta = { dxPx; dyPx; wheelNotches; reset }` and `NO_MOUSE`
  - `orbitFromMouse(prev: OrbitOffset, m: MouseDelta): OrbitOffset`
  - `wheelNotches(deltaY: number, deltaMode: number): number`
  - `addMouse(a: MouseDelta, b: MouseDelta): MouseDelta`
  - constants `ORBIT_RAD_PER_PX`, `ORBIT_PITCH_MIN_RAD`, `ORBIT_PITCH_MAX_RAD`, `ORBIT_ZOOM_MIN`, `ORBIT_ZOOM_MAX`, `ORBIT_ZOOM_PER_NOTCH`

- [ ] **Step 1: Write the failing tests** in `tests/input/orbit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  ORBIT_ZERO, NO_MOUSE, orbitFromMouse, wheelNotches, addMouse,
  ORBIT_RAD_PER_PX, ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD, ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX,
} from '../../src/input/orbit.js'

const drag = (dxPx: number, dyPx: number) => ({ ...NO_MOUSE, dxPx, dyPx })

describe('orbitFromMouse', () => {
  it('returns the identical object when nothing moved', () => {
    const o = { yawRad: 0.3, pitchRad: 0.1, zoom: 2 }
    expect(orbitFromMouse(o, NO_MOUSE)).toBe(o)
  })
  it('0.3 deg per pixel; drag right = +yaw, drag down = +pitch (ruling P-4)', () => {
    expect(ORBIT_RAD_PER_PX).toBeCloseTo((0.3 * Math.PI) / 180, 12)
    const o = orbitFromMouse(ORBIT_ZERO, drag(100, 50))
    expect(o.yawRad).toBeCloseTo(100 * ORBIT_RAD_PER_PX, 12)
    expect(o.pitchRad).toBeCloseTo(50 * ORBIT_RAD_PER_PX, 12)
  })
  it('clamps pitch to [-80, +60] degrees (ruling P-1) under extreme drags', () => {
    expect(orbitFromMouse(ORBIT_ZERO, drag(0, 1e6)).pitchRad).toBe(ORBIT_PITCH_MAX_RAD)
    expect(orbitFromMouse(ORBIT_ZERO, drag(0, -1e6)).pitchRad).toBe(ORBIT_PITCH_MIN_RAD)
    expect(ORBIT_PITCH_MAX_RAD).toBeCloseTo((60 * Math.PI) / 180, 12)
    expect(ORBIT_PITCH_MIN_RAD).toBeCloseTo((-80 * Math.PI) / 180, 12)
  })
  it('wraps yaw into (-PI, PI] so it never grows without bound', () => {
    const o = orbitFromMouse(ORBIT_ZERO, drag(1e6, 0))
    expect(o.yawRad).toBeGreaterThan(-Math.PI)
    expect(o.yawRad).toBeLessThanOrEqual(Math.PI)
  })
  it('x1.1 per notch, scroll down zooms out, clamped to [0.4, 4]', () => {
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: 1 }).zoom).toBeCloseTo(1.1, 12)
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: -1 }).zoom).toBeCloseTo(1 / 1.1, 12)
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: 1e4 }).zoom).toBe(ORBIT_ZOOM_MAX)
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: -1e4 }).zoom).toBe(ORBIT_ZOOM_MIN)
  })
  it('reset returns ORBIT_ZERO even with movement in the same frame', () => {
    expect(orbitFromMouse({ yawRad: 1, pitchRad: 1, zoom: 3 }, { dxPx: 50, dyPx: 5, wheelNotches: 2, reset: true })).toBe(ORBIT_ZERO)
  })
})

describe('wheelNotches', () => {
  it('pixel mode: 100 px per notch; line mode: 3 lines; page mode: 1 page', () => {
    expect(wheelNotches(100, 0)).toBe(1)
    expect(wheelNotches(-300, 0)).toBe(-3)
    expect(wheelNotches(3, 1)).toBe(1)
    expect(wheelNotches(1, 2)).toBe(1)
  })
})

describe('addMouse', () => {
  it('sums movement and ORs reset', () => {
    expect(addMouse(drag(3, 4), { dxPx: 1, dyPx: -2, wheelNotches: 0.5, reset: true }))
      .toEqual({ dxPx: 4, dyPx: 2, wheelNotches: 0.5, reset: true })
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/input/orbit.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Implement** by appending to `src/input/orbit.ts`:

```ts
/** One frame's worth of mouse input on the canvas, already folded together. */
export type MouseDelta = {
  readonly dxPx: number
  readonly dyPx: number
  /** Positive = scroll down = zoom out. Fractional for trackpads. */
  readonly wheelNotches: number
  /** A double-click this frame. */
  readonly reset: boolean
}
export const NO_MOUSE: MouseDelta = { dxPx: 0, dyPx: 0, wheelNotches: 0, reset: false }

export const ORBIT_RAD_PER_PX = (0.3 * Math.PI) / 180
/** Plan ruling P-1: the default eye already sits ~15 deg up, so +60 tops out near 75 deg, short of overhead. */
export const ORBIT_PITCH_MAX_RAD = (60 * Math.PI) / 180
export const ORBIT_PITCH_MIN_RAD = (-80 * Math.PI) / 180
export const ORBIT_ZOOM_MIN = 0.4
export const ORBIT_ZOOM_MAX = 4
export const ORBIT_ZOOM_PER_NOTCH = 1.1

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const wrapPi = (a: number): number => {
  const w = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI))
  return w === -Math.PI ? Math.PI : w
}

/** Drag = globe-style swing (drag right -> +yaw, drag down -> +pitch, ruling P-4); wheel = zoom. */
export function orbitFromMouse(prev: OrbitOffset, m: MouseDelta): OrbitOffset {
  if (m.reset) return ORBIT_ZERO
  if (m.dxPx === 0 && m.dyPx === 0 && m.wheelNotches === 0) return prev
  return {
    yawRad: wrapPi(prev.yawRad + m.dxPx * ORBIT_RAD_PER_PX),
    pitchRad: clamp(prev.pitchRad + m.dyPx * ORBIT_RAD_PER_PX, ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD),
    zoom: clamp(prev.zoom * ORBIT_ZOOM_PER_NOTCH ** m.wheelNotches, ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX),
  }
}

/** `WheelEvent.deltaY` in notches: DOM_DELTA_PIXEL (0) is ~100 px a notch in Chromium, LINE (1) is 3 lines, PAGE (2) is one. */
export function wheelNotches(deltaY: number, deltaMode: number): number {
  return deltaMode === 0 ? deltaY / 100 : deltaMode === 1 ? deltaY / 3 : deltaY
}

export function addMouse(a: MouseDelta, b: MouseDelta): MouseDelta {
  return { dxPx: a.dxPx + b.dxPx, dyPx: a.dyPx + b.dyPx, wheelNotches: a.wheelNotches + b.wheelNotches, reset: a.reset || b.reset }
}
```

- [ ] **Step 4: Run and pass**

Run: `npx vitest run tests/input/orbit.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
remote-run npm run verify; rc=$?; echo rc=$rc   # must be 0
git add src/input/orbit.ts tests/input/orbit.test.ts
git commit -m "Orbit camera Task 2: mouse drag/wheel to orbit mapping"
```

---

### Task 3: Frame state: orbit, mouse argument, C-cycle reset, surface clamp

**Files:**
- Modify: `src/render/frame.ts` (`FrameState`, `initialFrameStateFor`, `nextFrameState`)
- Test: `tests/render/orbitFrame.test.ts` (create)

**Interfaces:**
- Consumes: `OrbitOffset`, `ORBIT_ZERO`, `MouseDelta`, `NO_MOUSE`, `orbitFromMouse` (Tasks 1–2). `cameraTransformFor(…, orbit, surfaceHeightAt)` (Task 1).
- Produces: `FrameState.orbit: OrbitOffset`. The new signature: `nextFrameState(prev, elapsedSeconds, pressed, stepper?, arcadeDamage = false, mouse: MouseDelta = NO_MOUSE)`.

- [ ] **Step 1: Write the failing tests** in `tests/render/orbitFrame.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initialFrameState, initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { ORBIT_ZERO, NO_MOUSE } from '../../src/input/orbit.js'
import { ORBIT_SURFACE_CLEARANCE_M } from '../../src/render/camera.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const FRAME = 1 / 60
const start = (y = 3000) => initialFrameState(f6f, createState({ position: v3(0, y, 0), velocity: v3(120, 0, 0) }))
const drag = (dxPx: number, dyPx: number) => ({ ...NO_MOUSE, dxPx, dyPx })

describe('orbit in the frame', () => {
  it('starts at ORBIT_ZERO', () => {
    expect(start().orbit).toBe(ORBIT_ZERO)
  })
  it('a drag in chase moves the orbit and the eye', () => {
    const f0 = nextFrameState(start(), FRAME, keys())
    const f1 = nextFrameState(f0, FRAME, keys(), undefined, false, drag(200, 0))
    expect(f1.orbit.yawRad).toBeGreaterThan(0)
    expect(f1.eye.position).not.toEqual(nextFrameState(f0, FRAME, keys()).eye.position)
  })
  it('the mouse does nothing in cockpit view', () => {
    let f = nextFrameState(start(), FRAME, keys('KeyC')) // -> cockpit
    f = nextFrameState(f, FRAME, keys(), undefined, false, drag(200, 100))
    expect(f.cameraMode).toBe('cockpit')
    expect(f.orbit).toBe(ORBIT_ZERO)
  })
  it('C to cockpit and back lands on the default view (spec OC-4)', () => {
    let f = nextFrameState(start(), FRAME, keys(), undefined, false, drag(300, -80))
    expect(f.orbit).not.toBe(ORBIT_ZERO)
    f = nextFrameState(f, FRAME, keys('KeyC'))
    f = nextFrameState(f, FRAME, keys())
    f = nextFrameState(f, FRAME, keys('KeyC'))
    expect(f.cameraMode).toBe('chase')
    expect(f.orbit).toBe(ORBIT_ZERO)
  })
  it('a rebuilt frame (Restart / New game) starts at ORBIT_ZERO', () => {
    const dragged = nextFrameState(start(), FRAME, keys(), undefined, false, drag(300, 0))
    expect(initialFrameStateFor(dragged.world).orbit).toBe(ORBIT_ZERO)
  })
  it('low over the sea, a full downward drag holds the eye at the clearance', () => {
    const f = nextFrameState(start(30), FRAME, keys(), undefined, false, { ...drag(0, -1e6), wheelNotches: 50 })
    expect(f.eye.position.y).toBeGreaterThanOrEqual(ORBIT_SURFACE_CLEARANCE_M - 1e-9)
  })
})
```

- [ ] **Step 2: Add the carrier-deck case (Review Focus 4)** to the same file. The world is built exactly as `tests/render/audioInputs.test.ts`'s "reads a carrier DECK" case builds it:

```ts
import { createWorldOf, type ShipEntity } from '../../src/sim/loop.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { loadShipSpec } from '../../tools/content/load.js'   // same module as loadAircraftSpec; merge the import
import { createShipState } from '../../src/sim/world/ships.js'
import { deckOf, deckWorld, decksOf } from '../../src/sim/world/deck.js'
import { groundUnder } from '../../src/sim/world/ground.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'

it('parked on the carrier, a full downward drag stops at the DECK + clearance, not the sea', () => {
  const cv = loadShipSpec('essex-cv')
  const shipState = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
  const carrier: ShipEntity = {
    id: 'cv-1', spec: cv, state: shipState, previous: shipState,
    orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -3000 }], speedMps: 7.717 },
  }
  const deck = deckOf(carrier)!
  const spot = deckWorld(deck, 0, -110)
  const parked = createState({ position: v3(spot.x, deck.center.y + f6f.gear.heightM, spot.z), velocity: deck.velocity, gearFraction: 1 })
  const world = createWorldOf<undefined>({
    aircraft: [{ id: 'player', spec: f6f, state: parked, previous: parked, controls: NEUTRAL, assistMemory: undefined, impact: null, parked: true }],
    ships: [carrier],
    player: 'player',
  })
  // Zoom 1 at -80 deg keeps the eye ~8 m horizontally from the airplane, well inside the deck.
  const f = nextFrameState(initialFrameStateFor(world), FRAME, keys(), undefined, false, drag(0, -1e6))
  const under = groundUnder(f.world.terrain, decksOf(f.world.ships), f.eye.position.x, f.eye.position.z)
  expect(under?.surface).toBe('deck')
  expect(f.eye.position.y).toBeGreaterThanOrEqual(deck.center.y + ORBIT_SURFACE_CLEARANCE_M - 1e-9)
})
```

The import paths are the ones `audioInputs.test.ts` uses (checked 2026-09-27).

- [ ] **Step 3: Run and see them fail**

Run: `npx vitest run tests/render/orbitFrame.test.ts`
Expected: FAIL (`orbit` is not on `FrameState`, and `nextFrameState` takes no 6th argument).

- [ ] **Step 4: Implement in `frame.ts`**
  - Imports:
    - `import { orbitFromMouse, NO_MOUSE, ORBIT_ZERO, type MouseDelta, type OrbitOffset } from '../input/orbit.js'`
    - `import { SEA_LEVEL_M } from '../sim/world/terrain.js'` (`groundUnder` and `decksOf` are already imported)
  - `FrameState`: add `readonly orbit: OrbitOffset`, with a doc comment pointing at the orbit spec and OC-4.
  - `initialFrameStateFor`: add `orbit: ORBIT_ZERO`.
  - `nextFrameState`: add a final parameter `mouse: MouseDelta = NO_MOUSE`, documented like `arcadeDamage` (passed in, not stored). After `cameraMode` is computed:

    ```ts
    // Leaving chase drops the orbit, so C -> cockpit -> C is always the
    // default view (orbit spec OC-4); in cockpit the mouse does nothing.
    const orbit =
      cameraMode === 'chase'
        ? orbitFromMouse(prev.cameraMode === 'chase' ? prev.orbit : ORBIT_ZERO, mouse)
        : ORBIT_ZERO
    ```

  - Replace the eye line with:

    ```ts
    const decks = decksOf(advanced.world.ships)
    const surfaceHeightAt = (x: number, z: number): number =>
      groundUnder(advanced.world.terrain, decks, x, z)?.heightM ?? SEA_LEVEL_M
    const eye = cameraTransformFor(cameraMode, spec, render, look, speed, orbit, surfaceHeightAt)
    ```

    If `decksOf(advanced.world.ships)` is already computed further down for `nextLandingTracking`, hoist it and use the one value in both places.
  - Return `orbit` in the result object.

- [ ] **Step 5: Run and pass**, including the neighbors this touches:

Run: `npx vitest run tests/render/orbitFrame.test.ts tests/render/frame.test.ts tests/render/pause.test.ts tests/render/camera.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
remote-run npm run verify; rc=$?; echo rc=$rc   # must be 0; the golden/tripleTime suites prove the sim is untouched
git add src/render/frame.ts tests/render/orbitFrame.test.ts
git commit -m "Orbit camera Task 3: orbit in FrameState, reset on leaving chase, surface clamp"
```

---

### Task 4: Wire the mouse in `main.ts`, add the diagnostics hook, Tier 2

**Files:**
- Modify: `src/render/main.ts` (canvas listeners after `const canvas = …` near line 710; the `blur` handler; the `nextFrameState` call near line 2004)
- Modify: `src/render/diagnostics.ts` (`Ww2Diagnostics.orbit`)
- Create: `tests/e2e/orbitCamera.spec.ts`

**Interfaces:**
- Consumes: `MouseDelta`, `NO_MOUSE`, `addMouse`, `wheelNotches` (Task 2). The 6th argument to `nextFrameState` (Task 3).
- Produces: `__ww2.orbit(): OrbitOffset` (DEV only, like the rest of the hook).

- [ ] **Step 1: Add the listeners** right after `root.appendChild(canvas)`:

```ts
  // Orbit camera (spec 2026-09-27). Canvas-only, so a press on any HUD or
  // dialog element sitting over it is never a drag (Review Focus 1). No
  // pointer lock: Esc is the pause key (spec OC-5).
  let mouseDelta: MouseDelta = NO_MOUSE
  let dragPointer: number | null = null
  let lastPointer = { x: 0, y: 0 }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    dragPointer = e.pointerId
    lastPointer = { x: e.clientX, y: e.clientY }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointer) return
    mouseDelta = addMouse(mouseDelta, { ...NO_MOUSE, dxPx: e.clientX - lastPointer.x, dyPx: e.clientY - lastPointer.y })
    lastPointer = { x: e.clientX, y: e.clientY }
  })
  // All three, so a release outside the window cannot leave a drag stuck (Review Focus 2).
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, (e) => { if (e.pointerId === dragPointer) dragPointer = null })
  }
  canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return // the browser's zoom / trackpad pinch (Review Focus 3)
    e.preventDefault()
    mouseDelta = addMouse(mouseDelta, { ...NO_MOUSE, wheelNotches: wheelNotches(e.deltaY, e.deltaMode) })
  }, { passive: false })
  canvas.addEventListener('dblclick', () => { mouseDelta = { ...mouseDelta, reset: true } })
```

In the existing `window` `blur` handler, add `dragPointer = null` and `mouseDelta = NO_MOUSE`.

- [ ] **Step 2: Hand the delta to the frame** at the `nextFrameState` call (near line 2004):

```ts
    // Plan ruling P-3: the mouse is gated exactly as the radar-range key is.
    // The title/chart already zero the keys through `chartOpen`.
    const mouseBlocked = chartOpen
      || playerAircraft(frame!.world).impact !== null
      || frame!.world.combat.aircraft[frame!.world.player]!.damage.destroyedAt !== null
      || landingShown
    const frameMouse = mouseBlocked ? NO_MOUSE : mouseDelta
    mouseDelta = NO_MOUSE
    let current = nextFrameState(inputFrame, frameMs / 1000, frameKeys, stepper, quality.arcadeDamage(), frameMouse)
```

`mouseDelta` is cleared every frame, blocked or not, so a drag made under the debrief is never applied later. Check that `playerAircraft` is already imported in `main.ts` (it is used in the keydown handler).

- [ ] **Step 3: Add the diagnostics hook.** In `diagnostics.ts`, add `readonly orbit: () => OrbitOffset` beside `look`. In `main.ts`'s `__ww2` object, add `orbit: () => frame?.orbit ?? ORBIT_ZERO,` beside `look`.

- [ ] **Step 4: Write the Tier 2 spec** `tests/e2e/orbitCamera.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

const TAC = { x: -29666, z: -47605 }
const orbit = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.orbit())

test.setTimeout(90_000)

test('drag, wheel, double-click and the C cycle drive the orbit', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ x: TAC.x, y: 1200, z: TAC.z - 8000 }))
  await waitForTerrain(page)
  await page.mouse.move(1280, 720)
  await page.mouse.down()
  await page.mouse.move(1480, 770, { steps: 10 })
  await page.mouse.up()
  const dragged = await orbit(page)
  expect(dragged.yawRad).toBeGreaterThan(0.5)   // 200 px x 0.3 deg = 60 deg
  expect(dragged.pitchRad).toBeGreaterThan(0.1)
  await page.screenshot({ path: 'test-results/orbit/dragged.png' })

  await page.mouse.wheel(0, 300)                 // 3 notches out
  await expect.poll(async () => (await orbit(page)).zoom).toBeGreaterThan(1.3)
  await page.screenshot({ path: 'test-results/orbit/zoomed-out.png' })

  await page.keyboard.down('Control')            // Review Focus 3
  const before = (await orbit(page)).zoom
  await page.mouse.wheel(0, 300)
  await page.keyboard.up('Control')
  expect((await orbit(page)).zoom).toBeCloseTo(before, 9)

  await page.mouse.dblclick(1280, 720)
  await expect.poll(async () => (await orbit(page)).yawRad).toBe(0)
  await page.screenshot({ path: 'test-results/orbit/default.png' })

  await page.mouse.move(1280, 720); await page.mouse.down(); await page.mouse.move(1380, 720, { steps: 5 }); await page.mouse.up()
  await page.keyboard.press('KeyC'); await page.keyboard.press('KeyC')
  await expect.poll(async () => (await orbit(page)).yawRad).toBe(0)
})

test('a blur mid-drag ends the drag (Review Focus 2)', async ({ page }) => {
  await page.goto(spawnUrl({ x: TAC.x, y: 1200, z: TAC.z - 8000 }))
  await waitForTerrain(page)
  await page.mouse.move(640, 360); await page.mouse.down()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  const held = await orbit(page)
  await page.mouse.move(900, 500, { steps: 5 })
  expect(await orbit(page)).toEqual(held)
  await page.mouse.up()
})

test('a press on the debrief is not a drag (Review Focus 1)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 8000 }))
  await waitForTerrain(page)
  await diveToSea(page)                                   // returns once the crash debrief is visible
  const dialog = debriefDialog(page)
  const box = (await dialog.boundingBox())!
  const before = await orbit(page)
  // Press inside the dialog, away from its buttons, and drag across the screen.
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 400, box.y + 200, { steps: 10 })
  await page.mouse.up()
  expect(await orbit(page)).toEqual(before)
})
```

Add `diveToSea` and `debriefDialog` to the spec's `./harness.js` import. This checks two things at once: the dialog swallows the press, and P-3 blocks the mouse after impact. Either one alone would make it pass, which is intended. Review Focus 1 is about the user-visible result.

- [ ] **Step 5: Run Tier 2** from the worktree on its dev slot, with no budget spec involved (so no `hwlock`):

```bash
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test tests/e2e/orbitCamera.spec.ts; rc=$?; echo rc=$rc
```

Expected: 3 passed. **Read the three PNGs** in `test-results/orbit/`. The plane should be seen from its left, from further out, and in today's default view. Never argue about a picture you have not looked at.

- [ ] **Step 6: Verify and commit**

```bash
remote-run npm run verify; rc=$?; echo rc=$rc   # must be 0
git add src/render/main.ts src/render/diagnostics.ts tests/e2e/orbitCamera.spec.ts
git commit -m "Orbit camera Task 4: canvas drag/wheel/double-click wiring, __ww2.orbit, Tier 2"
```

---

### Task 5: Handoff, §15, README, and the final captures

**Files:**
- Create: `docs/handoff/2026-09-27-orbit-camera.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 (add the orbit camera row, with Instant Replay as next)
- Modify: `README.md` (one paragraph pointing at §15, per repo convention; name the controls: drag, wheel, double-click)
- Modify: `docs/superpowers/specs/2026-09-27-orbit-camera-design.md`: a dated amendment line recording plan rulings P-1 (pitch +60°) and P-2 (the cloud-history test at zoom 1)

- [ ] **Step 1:** Run the whole-branch review: `superpowers:requesting-code-review` against `main...worktree-orbit-camera`. Fix what it confirms, re-run `remote-run npm run verify` (`rc=0`), and commit each fix.
- [ ] **Step 2:** Final captures on the reference GPU: re-run Task 4's spec and copy the three PNGs into the handoff, under `docs/handoff/assets/orbit-camera/` if that is how recent handoffs store images (check the newest handoff first).
- [ ] **Step 3:** Write the handoff:
  - what shipped
  - rulings P-1 to P-4
  - the Review Focus list, with where each item is pinned
  - that `ww2airsim-2.windomlane.org` served the Tier 2 run
  - Mark's single viewing checkpoint (final product), to be done from the primary host after merge
  - open items: none expected, otherwise list them
- [ ] **Step 4:** Update the §15 row and the README paragraph. Commit.
- [ ] **Step 5:** Push the worktree branch (allowed). Do **not** merge or push `main`. Email the handoff: `python3 tools/mail-doc.py docs/handoff/2026-09-27-orbit-camera.md "ww2airsim: orbit camera handoff"`.
