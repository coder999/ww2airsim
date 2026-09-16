# Cockpit Panel Rebuild Implementation Plan

**Completed 2026-09-15.** All eight tasks and final review are complete; see the
[handoff](../../handoff/2026-09-15-cockpit-panel.md) and its archived decision ledger.
The illustrative steps below are historical; the ledger records corrections
to their clipping, tape placement, and layout assumptions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the instrument panel as a bottom-anchored, full-width, two-band dashboard carrying a throttle column, a sliding heading tape and an attitude ball, with space reserved for radar and armament.

**Architecture:** `GaugeSpec` becomes a discriminated union so a column and a tape can live in the same table as a dial. The panel gains a shallow upper band above the existing full-size dial row; its backing plate grows past the bottom of the frame and is clipped, which is what stops it reading as a floating strip. Every layout change is guarded by an assertion measured against the camera's own exported field of view, because layout is where this panel's defects have actually lived.

**Tech Stack:** TypeScript strict, Node 22, vitest, Three.js `WebGPURenderer` with TSL. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-15-cockpit-panel-design.md`

## Global Constraints

Inherited from Plans 1–5, unchanged. Every task's requirements include these.

- TypeScript strict. `npm run verify` (typecheck, lint `--max-warnings 0`, depcruise, vitest) must exit 0 before every commit. **Capture `rc` directly; never read success through a pipe into `grep`.**
- `sim/` may not import `render/`, rendering libraries, or Node core, and may not touch browser globals. **This plan makes no changes under `src/sim/`.**
- **No flight-model changes.** `content/aircraft/f6f-hellcat.json` is not edited. The golden trajectory must pass UNREGENERATED and the Patuxent test cards must stay green. If either moves, stop — something has reached `sim/` that should not have.
- **No instrument may display a quantity the model does not produce** (`src/render/gauges.ts:8-16`). Throttle qualifies; radar, armament, gear and flaps do not.
- Every new test must be proved to fail with the thing it guards removed. Record the mutation and its failure in the commit message, as Plans 4 and 5 did.
- The vitest environment is `node`. Logic must be DOM-free to be testable; anything touching `document` stays thin and untested, like `src/render/overlay.ts`.
- Dial groups are selected by name (`dial:<id>`), added 2026-09-15. Do not reintroduce `children.filter(c => c instanceof Group)`.

## Decisions taken for the spec's open questions

Settled here so the plan is executable. Mark can overrule any of them.

1. **Throttle column sits at the LEFT edge** of the dial row, full row height — where a throttle quadrant sits in the airplane. Armament reserves the mirrored right edge, so the panel stays symmetric.
2. **The heading tape keeps a numeric readout**, printed above it, consistent with every dial printing its own.
3. **The tape window spans 90°** of compass arc. Wide enough to see the next cardinal coming, tight enough to read.
4. **The reticle gets bolder** — stroke from 0.09 to 0.14 of arm length. It is faint at 1600×1000 and the horizon bar it currently contrasts against is being removed.

## File structure

| File | Responsibility |
| --- | --- |
| `src/render/gauges.ts` | Gauge table and pure gauge maths. Gains the kind union, `fractionForValue`, the throttle and tape entries. |
| `src/render/scene/panel.ts` | Builds and updates panel geometry. Gains bands, the column, the tape, the ball; loses the horizon bar. |
| `src/render/scene/panelLayout.ts` | **New.** Pure band/slot arithmetic in metres, DOM-free and Three-free, so the frustum budget is testable without building meshes. |
| `src/render/main.ts` | Passes `current.controls` to `updatePanel`. |
| `tests/render/gauges.test.ts` | Pure gauge maths. |
| `tests/render/panelLayout.test.ts` | **New.** The vertical and horizontal budget assertions. |
| `tests/render/panel.test.ts` | Built geometry, projection checks, slot emptiness. |

---

### Task 1: Gauge kinds — dial, column, tape

Splits `GaugeSpec` so a non-dial instrument can sit in the same table, and **finalises the
table**: the throttle column is added and heading becomes a tape. No rendering yet — the
panel filters to dials, so the only visible change is that the round heading dial
disappears.

> **Controller ruling R1 (pre-flight).** The table is finalised HERE, not spread across
> Tasks 1/5/6. The original ordering left a window in which Task 3 allocated a slot for
> `attitude` while `GAUGES` still held a round `heading` dial and no attitude — the panel
> would not have built at all between Tasks 3 and 6.
>
> **The attitude ball is NOT a `GAUGES` entry.** It is panel geometry with a layout slot,
> exactly as the horizon bar it replaces was. `GaugeBase` demands `min`, `max`,
> `majorStep`, `minorStep`, `fromSI` and `decimals`; an attitude indicator has no scale
> those describe, and it is driven by `attitudeAngles(state)` rather than a scalar
> `gaugeValue`. So `GaugeKind` is `'dial' | 'column' | 'tape'` — there is no `'ball'`.
>
> After this task the lower row is **five dials plus the ball**, not six dials.

**Files:**
- Modify: `src/render/gauges.ts`
- Modify: `src/render/scene/panel.ts` (filter `GAUGES` to `kind === 'dial'`)
- Modify: `src/render/main.ts:469` (pass controls)
- Test: `tests/render/gauges.test.ts`

**Interfaces:**
- Produces: `GaugeKind`, `DialSpec`, `ColumnSpec`, `TapeSpec`, `GaugeSpec` (union), `fractionForValue(g: GaugeSpec, value: number): number`, `TickMark.fraction: number`, and `gaugeValue(id, spec, state, controls)` / `readoutTextFor(id, spec, state, controls)` with a new fourth parameter.

- [ ] **Step 1: Write the failing test**

```ts
// tests/render/gauges.test.ts
import { GAUGES, fractionForValue, gaugeValue, tickMarksFor } from '../../src/render/gauges.js'

const throttleSpec = () => {
  const g = GAUGES.find((x) => x.id === 'throttle')
  if (!g) throw new Error('no throttle gauge')
  return g
}

describe('the throttle column (2026-09-15)', () => {
  it('is a column, not a dial', () => {
    expect(throttleSpec().kind).toBe('column')
  })

  it('maps the control vector 0..1 onto 0..100 percent of the column', () => {
    const controls = (throttle: number) => ({ pitch: 0, roll: 0, yaw: 0, throttle })
    const level = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
    expect(gaugeValue('throttle', f6f, level, controls(0))).toBeCloseTo(0, 9)
    expect(gaugeValue('throttle', f6f, level, controls(0.5))).toBeCloseTo(50, 9)
    expect(gaugeValue('throttle', f6f, level, controls(1))).toBeCloseTo(100, 9)
  })

  it('places its fill fraction linearly, clamped at both ends', () => {
    const g = throttleSpec()
    expect(fractionForValue(g, 0)).toBeCloseTo(0, 9)
    expect(fractionForValue(g, 50)).toBeCloseTo(0.5, 9)
    expect(fractionForValue(g, 100)).toBeCloseTo(1, 9)
    expect(fractionForValue(g, -10)).toBeCloseTo(0, 9)
    expect(fractionForValue(g, 250)).toBeCloseTo(1, 9)
  })

  it('carries nine tick marks, numbered only at the ends, like the reference', () => {
    const marks = tickMarksFor(throttleSpec())
    expect(marks).toHaveLength(9)
    expect(marks.filter((m) => m.major).map((m) => m.text)).toEqual(['0', '100'])
  })
})
```

Add this shared constant near the top of `tests/render/panel.test.ts` too —
every `updatePanel` call in later tasks uses it:

```ts
import type { Controls } from '../../src/sim/flight/state.js'
const NEUTRAL_CONTROLS: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/render/gauges.test.ts -t throttle`
Expected: FAIL — `no throttle gauge`, because nothing named `throttle` is in `GAUGES` yet.

- [ ] **Step 3: Split the type and add the entry**

```ts
export type GaugeId =
  | 'airspeed' | 'altimeter' | 'verticalSpeed' | 'heading'
  | 'fuel' | 'slip' | 'throttle'

export type GaugeKind = 'dial' | 'column' | 'tape'

type GaugeBase = {
  readonly id: GaugeId
  readonly label: string
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly majorStep: number
  readonly minorStep: number
  readonly fromSI: number
  readonly decimals: number
}

/** A round dial with a needle. `sweepRad` and `circular` mean nothing to the
 *  other kinds, which is the whole reason this is a union. */
export type DialSpec = GaugeBase & {
  readonly kind: 'dial'
  readonly sweepRad: number
  readonly circular: boolean
}
/** A vertical bar that fills from the bottom. */
export type ColumnSpec = GaugeBase & { readonly kind: 'column' }
/** A sliding strip showing `windowSpan` of the scale either side of the index. */
export type TapeSpec = GaugeBase & { readonly kind: 'tape'; readonly windowSpan: number }

export type GaugeSpec = DialSpec | ColumnSpec | TapeSpec
```

Add `kind: 'dial'` to the five entries that stay dials — `airspeed`, `altimeter`,
`verticalSpeed`, `fuel`, `slip`. Then append the column and CONVERT heading to a tape
(ruling R1 — this is the only place either happens):

```ts
  {
    id: 'throttle', label: 'THROTTLE', unit: '%', kind: 'column',
    min: 0, max: 100, majorStep: 100, minorStep: 12.5,
    fromSI: 100, decimals: 0,
  },
  {
    id: 'heading', label: 'HEADING', unit: 'deg', kind: 'tape',
    min: 0, max: 360, windowSpan: 90,
    majorStep: 30, minorStep: 10, fromSI: 180 / Math.PI, decimals: 0,
  },
```

`heading` loses `sweepRad` and `circular`. Anything that read them for heading is now a
type error — that is the union doing its job, and `fractionForValue` is the replacement.

- [ ] **Step 4: Add `fractionForValue`, and give `TickMark` a fraction**

`angleForValue` is dial-only now — narrow its parameter to `DialSpec`. `fractionForValue` is the linear equivalent that every kind can use.

```ts
/** Where `value` sits along the gauge's span, 0..1. Clamped for a linear
 *  gauge; wrapped for a circular one, exactly as `angleForValue` does. */
export function fractionForValue(g: GaugeSpec, value: number): number {
  const t = (value - g.min) / (g.max - g.min)
  if (g.kind === 'dial' && g.circular) return (((t % 1) + 1) % 1)
  return t < 0 ? 0 : t > 1 ? 1 : t
}
```

In `tickMarksFor`, add `fraction: fractionForValue(g, value)` to each mark and make `angleRad` `g.kind === 'dial' ? angleForValue(g, value) : 0`. Guard the circular short-stop with `g.kind === 'dial' && g.circular`.

- [ ] **Step 5: Thread the control vector**

Throttle is in `Controls`, not `AircraftState` (`src/sim/flight/state.ts:8`).

```ts
export function gaugeValue(
  id: GaugeId, spec: AircraftSpec, state: AircraftState, controls: Controls,
): number { /* ... siValueFor(id, spec, state, controls) * g.fromSI */ }
```

In `siValueFor`, add `case 'throttle': return controls.throttle`. Give `readoutTextFor` the same fourth parameter. In `main.ts:469` pass `current.controls` — it is already in scope at line 500 for the propeller.

- [ ] **Step 6: Keep the panel building dials only**

In `panel.ts`, the build loop becomes `for (const g of GAUGES.filter((x) => x.kind === 'dial'))`. Without this the column gets a needle and a bezel.

- [ ] **Step 7: Run the full suite**

Run: `npm run verify`
Expected: exit 0. Screen output unchanged — the column exists in the table but nothing draws it.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "gauges: a kind discriminant, so a column can share the table"
```

---

### Task 2: The vertical budget assertion

The guard goes in **before** any layout moves, so every later task is protected by it. This is the assertion the horizontal axis already has in `PANEL_MIN_ASPECT` and whose absence caused the 2026-09-13 defect.

**Files:**
- Create: `src/render/scene/panelLayout.ts`
- Create: `tests/render/panelLayout.test.ts`

**Interfaces:**
- Produces: `PANEL_AHEAD_M`, `PANEL_BELOW_M`, `HORIZON_KEEP_DEG`, `degreesBelowEye(metresBelowEye: number): number`, `metresBelowEye(deg: number): number`, `type Band = { readonly top: number; readonly bottom: number }`, `PANEL_BANDS: { readonly upper: Band; readonly lower: Band }` — all in panel-local metres below the eye.

- [ ] **Step 1: Write the failing test**

```ts
// tests/render/panelLayout.test.ts
import { CAMERA_VFOV_DEG } from '../../src/render/camera.js'
import { degreesBelowEye, HORIZON_KEEP_DEG, PANEL_BANDS } from '../../src/render/scene/panelLayout.js'

describe('the panel vertical budget (2026-09-15)', () => {
  it('keeps every instrument band inside the frustum and below the horizon', () => {
    // The defect this exists for: on 2026-09-13 PANEL_BELOW_M was 0.35, which
    // put every label and readout past the frustum edge -- only the top
    // slivers of six discs were ever visible. Nothing measured it.
    const bottomEdge = CAMERA_VFOV_DEG / 2
    for (const [name, band] of Object.entries(PANEL_BANDS)) {
      expect(degreesBelowEye(band.top), `${name} top clears the horizon`)
        .toBeGreaterThanOrEqual(HORIZON_KEEP_DEG)
      expect(degreesBelowEye(band.bottom), `${name} bottom is on screen`)
        .toBeLessThanOrEqual(bottomEdge)
    }
  })

  it('does not let the bands overlap', () => {
    expect(PANEL_BANDS.upper.bottom).toBeLessThanOrEqual(PANEL_BANDS.lower.top)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/render/panelLayout.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/scene/panelLayout.js'`.

- [ ] **Step 3: Write the module**

Move `PANEL_AHEAD_M` here from `panel.ts` and re-export it there so nothing else breaks.

> **Controller ruling R2 (pre-flight).** `PANEL_BELOW_M` STAYS in `panel.ts`. It places the
> panel's origin, which is a rendering decision; this module owns band arithmetic measured
> from the eye, and moving `PANEL_BELOW_M` would hand the pure module a constant nothing in
> it uses. Measured 2026-09-15: the usable zone from 3° to 30° is 0.315 m, and this layout uses 0.280 m.

```ts
export const PANEL_AHEAD_M = 0.6
/** Sky left clear below the eye line, so the panel never hides the horizon. */
export const HORIZON_KEEP_DEG = 3

export const degreesBelowEye = (m: number): number =>
  (Math.atan2(m, PANEL_AHEAD_M) * 180) / Math.PI
export const metresBelowEye = (deg: number): number =>
  Math.tan((deg * Math.PI) / 180) * PANEL_AHEAD_M

export type Band = { readonly top: number; readonly bottom: number }

const UPPER_TOP = metresBelowEye(HORIZON_KEEP_DEG)   // 0.0314 m
const UPPER_H = 0.098                                 // tape strip + radar row
const GUTTER = 0.010
const LOWER_H = 0.172                                 // readout + dial + label

export const PANEL_BANDS: { readonly upper: Band; readonly lower: Band } = {
  upper: { top: UPPER_TOP, bottom: UPPER_TOP + UPPER_H },
  lower: { top: UPPER_TOP + UPPER_H + GUTTER, bottom: UPPER_TOP + UPPER_H + GUTTER + LOWER_H },
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/render/panelLayout.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Prove the assertion catches the real defect**

Temporarily set `UPPER_TOP` to `metresBelowEye(20)` — which pushes the lower band past 30°, the 2026-09-13 failure shape. Re-run; expect `lower bottom is on screen` to FAIL. **Restore the value.** Record the observed failure in the commit message.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "panel: assert the vertical budget before moving anything into it"
```

---

### Task 3: Two bands, a full-width bezel, and reserved slots

The structural change. Dials move into the lower band; the backing becomes full width and runs past the bottom of the frame; radar and armament get space and nothing drawn.

**Files:**
- Modify: `src/render/scene/panel.ts`
- Modify: `src/render/scene/panelLayout.ts` (horizontal slots)
- Test: `tests/render/panel.test.ts`, `tests/render/panelLayout.test.ts`

**Interfaces:**
- Produces: `PANEL_SLOTS: readonly { readonly id: string; readonly centreX: number; readonly widthM: number }[]` covering `throttle`, the six dials, `radar` and `armament`; `Panel.backing: Object3D`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/panel.test.ts
describe('the two-band dashboard (2026-09-15)', () => {
  it('runs the bezel past the bottom of the frame, so it is clipped not floating', () => {
    // The complaint this fixes: sky was visible below the panel on both sides,
    // so it read as a strip hanging in the view rather than a dashboard.
    const p = createPanel(f6f, () => null)
    const box = new Box3().setFromObject(p.backing)
    const lowestBelowEye = PANEL_BELOW_M - box.min.y
    expect(degreesBelowEye(lowestBelowEye)).toBeGreaterThan(CAMERA_VFOV_DEG / 2)
  })

  it('draws nothing in the reserved radar and armament slots', () => {
    // An unlit bezel that never fills reads as a broken instrument. The slots
    // exist in the arithmetic only, until Plan 6 has something to put in them.
    const p = createPanel(f6f, () => null)
    const named = p.root.children.map((c) => c.name)
    expect(named).not.toContain('radar')
    expect(named).not.toContain('armament')
  })

  it('keeps five dials, heading having left for the tape', () => {
    // Ruling R1: the ball is panel geometry, not a GAUGES row, so it is not a
    // dial and does not appear here. Five dials plus the ball fill the row.
    expect(dialsOf(createPanel(f6f, () => null))).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/render/panel.test.ts -t dashboard`
Expected: FAIL — `p.backing` is undefined.

- [ ] **Step 3: Add the horizontal slot table**

In `panelLayout.ts`. Six dials at the existing `DIAL_GAP`, throttle at the left edge, armament mirrored right, radar centred in the upper band.

```ts
// 0.155 until 2026-09-15 (ruling R4): at that spacing the edge blocks sat 0.14 deg
// inside the 3:2 frustum edge -- a 1.5 mm margin, and one pinned on slots that draw
// nothing yet, so the first throttle bezel would have breached it with the test green.
export const DIAL_GAP = 0.145
export const DIAL_RADIUS = 0.06
const EDGE_W = 0.052          // throttle column / armament block

export type Slot = { readonly id: string; readonly centreX: number; readonly widthM: number }

// Six positions in the lower row: five dials and the attitude ball. The ball sits
// fourth, where the round heading dial used to be, so the eye does not have to relearn
// the row. Ruling R1: `attitude` is a SLOT only -- it has no GAUGES entry.
const ROW = ['airspeed', 'altimeter', 'verticalSpeed', 'attitude', 'fuel', 'slip'] as const
const dialX = (i: number): number => (i - (ROW.length - 1) / 2) * DIAL_GAP
const edgeX = ROW.length * DIAL_GAP / 2 + EDGE_W / 2

export const PANEL_SLOTS: readonly Slot[] = [
  { id: 'throttle', centreX: -edgeX, widthM: EDGE_W },
  ...ROW.map((id, i) => ({ id, centreX: dialX(i), widthM: DIAL_RADIUS * 2.18 })),
  { id: 'armament', centreX: edgeX, widthM: EDGE_W },
  { id: 'radar', centreX: 0, widthM: 0.16 },
]
```

- [ ] **Step 4: Assert the horizontal budget too**

```ts
// tests/render/panelLayout.test.ts
it('keeps every slot inside the frustum at the narrowest supported window', () => {
  // tan(hfov/2) = aspect * tan(vfov/2). At PANEL_MIN_ASPECT the horizontal
  // edge is 40.9 degrees; today's six dials reach 37.0. The throttle and
  // armament blocks eat into that margin, so it is measured, not assumed.
  const halfV = Math.tan((CAMERA_VFOV_DEG / 2) * Math.PI / 180)
  const edgeDeg = (Math.atan(PANEL_MIN_ASPECT * halfV) * 180) / Math.PI
  for (const s of PANEL_SLOTS) {
    const outer = Math.abs(s.centreX) + s.widthM / 2
    expect((Math.atan2(outer, PANEL_AHEAD_M) * 180) / Math.PI, `slot ${s.id}`)
      .toBeLessThan(edgeDeg)
  }
})
```

**If this fails, narrow `DIAL_GAP` until it passes and record the new value and the measured angle in the commit message.** Do not widen the frustum or relax the assertion.

- [ ] **Step 5: Build the bands**

In `createPanel`, replace the single-row layout. `PANEL_BELOW_M` is the panel
origin's depth below the eye, so a band's local y is `PANEL_BELOW_M - band`.

```ts
const slotX = (id: string): number => {
  const slot = PANEL_SLOTS.find((s) => s.id === id)
  if (!slot) throw new Error(`no layout slot for ${id}`)
  return slot.centreX
}

// Full width at the NARROWEST supported window, so a wider one still has the
// bezel reaching both edges rather than stopping short of them.
const halfV = Math.tan(((CAMERA_VFOV_DEG / 2) * Math.PI) / 180)
const backingHalfW = PANEL_MIN_ASPECT * halfV * PANEL_AHEAD_M * 1.02
// Past the frame edge, not up to it: this is the clip that stops it floating.
const backingBottom = metresBelowEye(CAMERA_VFOV_DEG / 2) * 1.15
const backingTop = PANEL_BANDS.upper.top

const backing = new Mesh(
  new PlaneGeometry(backingHalfW * 2, backingBottom - backingTop),
  new MeshBasicMaterial({ color: 0x0b0e11 }),
)
backing.name = 'backing'
backing.position.set(0, PANEL_BELOW_M - (backingTop + backingBottom) / 2, BACKING_Z)
root.add(backing)

const lowerCentre = (PANEL_BANDS.lower.top + PANEL_BANDS.lower.bottom) / 2
// Five dials. The `attitude` slot stays empty until Task 6 puts the ball in it.
for (const g of GAUGES.filter((x): x is DialSpec => x.kind === 'dial')) {
  const dial = buildDial(g, makeText)          // the existing per-dial body
  dial.name = `dial:${g.id}`
  dial.position.set(slotX(g.id), PANEL_BELOW_M - lowerCentre, 0)
  root.add(dial)
}
// radar and armament: slots only. Nothing is added to `root` for them.
```

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "panel: two bands, a clipped full-width bezel, reserved slots"
```

---

### Task 4: The throttle column renders

**Files:**
- Modify: `src/render/scene/panel.ts`
- Test: `tests/render/panel.test.ts`

**Interfaces:**
- Produces: `Panel.columns: Map<GaugeId, { readonly fill: Object3D }>`.

- [ ] **Step 1: Write the failing test**

```ts
it('fills the throttle column in proportion to the control vector', () => {
  const p = createPanel(f6f, () => null)
  const level = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
  const heightAt = (throttle: number): number => {
    updatePanel(p, f6f, level, { pitch: 0, roll: 0, yaw: 0, throttle }, () => null)
    return new Box3().setFromObject(p.columns.get('throttle')!.fill).getSize(new Vector3()).y
  }
  const [shut, half, open] = [heightAt(0), heightAt(0.5), heightAt(1)]
  expect(shut).toBeLessThan(half)
  expect(half).toBeLessThan(open)
  // Linear: half throttle is half the travel, within a millimetre.
  expect(half).toBeCloseTo((shut + open) / 2, 3)
})

it('grows the throttle fill upward from its base, not from its centre', () => {
  // A plane scaled about its centre creeps downward as it grows, so the bar
  // would leave its own bezel at full throttle.
  const p = createPanel(f6f, () => null)
  const level = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
  const baseOf = (t: number): number => {
    updatePanel(p, f6f, level, { pitch: 0, roll: 0, yaw: 0, throttle: t }, () => null)
    return new Box3().setFromObject(p.columns.get('throttle')!.fill).min.y
  }
  expect(baseOf(1)).toBeCloseTo(baseOf(0.1), 4)
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/render/panel.test.ts -t throttle`
Expected: FAIL — `p.columns` is undefined.

- [ ] **Step 3: Build the column**

Black face, light bezel, nine tick dashes from `tickMarksFor`, numerals at 0 and 100 from `mark.text`, and a fill plane on the right. Translate the fill geometry so its origin is at its base, then scale on Y:

```ts
const fill = new Mesh(new PlaneGeometry(fillW, fullH), new MeshBasicMaterial({ color: 0xc8ccd2 }))
fill.geometry.translate(0, fullH / 2, 0)   // origin at the base, so scale grows upward
```

In `updatePanel`, `fill.scale.y = Math.max(1e-4, fractionForValue(g, gaugeValue('throttle', spec, state, controls)))`.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/render/panel.test.ts -t throttle` → PASS.

- [ ] **Step 5: Prove it catches the centre-scaling bug**

Remove the `geometry.translate` line; expect `grows the throttle fill upward` to FAIL. Restore it.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "panel: the throttle column, filling from its base"
```

---

### Task 5: The heading tape

Replaces the round `heading` dial, which Task 3 already removed from the dial list.

**Files:**
- Modify: `src/render/gauges.ts` (tape entry), `src/render/scene/panel.ts`
- Test: `tests/render/gauges.test.ts`, `tests/render/panel.test.ts`

**Interfaces:**
- Produces: `Panel.tape: { readonly strip: Object3D; readonly readout: Mesh }`, and `tapeOffsetFor(g: TapeSpec, headingDeg: number): number` in `gauges.ts` — the strip's offset in scale-fractions, negative when the strip slides left.

- [ ] **Step 1: Write the failing test**

```ts
describe('the heading tape (2026-09-15)', () => {
  const tape = () => GAUGES.find((g) => g.id === 'heading') as TapeSpec

  it('centres the current heading under the index', () => {
    expect(tapeOffsetFor(tape(), 0)).toBeCloseTo(0, 9)
    expect(tapeOffsetFor(tape(), 90)).toBeCloseTo(90 / 360, 9)
  })

  it('wraps through north without a jump', () => {
    // 359 -> 001 is two degrees of travel, not 358. A tape that fails this
    // whips the whole rose across the screen once per circuit.
    const step = tapeOffsetFor(tape(), 1) - tapeOffsetFor(tape(), 359)
    expect(Math.abs(((step % 1) + 1.5) % 1 - 0.5)).toBeCloseTo(2 / 360, 6)
  })

  it('shows a 90 degree window', () => {
    expect(tape().windowSpan).toBe(90)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/render/gauges.test.ts -t tape`
Expected: FAIL — `tapeOffsetFor` is not exported.

- [ ] **Step 3: Add the helper**

The `heading` table entry is already a tape — Task 1 converted it (ruling R1). This task
adds only the offset helper and the rendering.

```ts
/** How far to slide the rose, in fractions of the full 360. Wrapped, so the
 *  strip never travels the long way round. */
export function tapeOffsetFor(g: TapeSpec, headingDeg: number): number {
  return fractionForValue(g, ((headingDeg % 360) + 360) % 360)
}
```

- [ ] **Step 4: Render it in the upper band**

The rose is drawn THREE times end to end. That is what makes the wrap
seamless: sliding within the middle copy always has a neighbour rendered on
both sides, so 359 -> 001 never exposes an edge.

```ts
const TAPE_W = 0.30                                  // visible window, metres
const g = GAUGES.find((x): x is TapeSpec => x.id === 'heading')!
const stripW = TAPE_W * (360 / g.windowSpan)         // one full rose
const strip = new Group()
strip.name = 'tape:strip'
for (const copy of [-1, 0, 1]) {
  for (const mark of tickMarksFor(g)) {
    const x = (mark.fraction + copy) * stripW - stripW / 2
    const tick = new Mesh(
      new PlaneGeometry(0.002, mark.major ? 0.010 : 0.006),
      new MeshBasicMaterial({ color: 0xe6ecf5 }),
    )
    tick.position.set(x, 0.006, Z_MARKS)
    strip.add(tick)
    if (mark.major) {
      const numeral = textPlate(mark.text, 0.022, 0.011, makeText)
      numeral.position.set(x, -0.006, Z_MARKS)
      strip.add(numeral)
    }
  }
}
```

In `updatePanel`, slide it and print the digits (decision 2):

```ts
const headingDeg = gaugeValue('heading', spec, state, controls)
panel.tape.strip.position.x = -tapeOffsetFor(g, headingDeg) * stripW
setPlateText(panel.tape.readout, readoutTextFor('heading', spec, state, controls), makeText)
```

A fixed index mark and the readout are children of the BAND, not the strip, so
they do not slide with it.

- [ ] **Step 5: Assert it through the built geometry**

```ts
it('slides the strip left as the heading increases', () => {
  // `wingsLevel(headingDeg, pitchDeg)` already exists in this file.
  const p = createPanel(f6f, () => null)
  const at = (headingDeg: number): number => {
    updatePanel(p, f6f, wingsLevel(headingDeg, 0), NEUTRAL_CONTROLS, () => null)
    return p.tape.strip.position.x
  }
  expect(at(90)).toBeLessThan(at(0))
})
```

- [ ] **Step 6: Run the full suite and commit**

Run: `npm run verify` → exit 0.

```bash
git add -A && git commit -m "panel: heading as a sliding tape, replacing the round dial"
```

---

### Task 6: The attitude ball

Built while the horizon bar is still present, so its coverage exists before the bar's is deleted.

**Files:**
- Modify: `src/render/gauges.ts` (attitude entry), `src/render/scene/panel.ts`
- Test: `tests/render/panel.test.ts`

**Interfaces:**
- Produces: `Panel.attitude: { readonly ball: Object3D; readonly ring: Object3D }`.

- [ ] **Step 1: Write the failing test**

This is the test that replaces the bar's coverage, and it must compare against a WORLD quantity, not restate the renderer's convention. A `-rollRad` sign error once read −30.00° against a true horizon of +30.00° (`panel.ts:337-348`).

`panel.test.ts` already has `trueHorizonScreenAngle(worldToCamera)`,
`pose(panel, state)` and `attitude(pitchDeg, bankDeg)`. Rename the bar's two
projection helpers rather than writing new ones — `barScreenAngle` ->
`ballScreenAngle` and `barScreenHeight` -> `ballScreenHeight`, each reading
`panel.attitude.ball.matrixWorld` in place of `panel.horizon.matrixWorld`.
Their bodies are otherwise unchanged, which is the point: the projection maths
is proven and only the object it measures moves.

```ts
describe('the attitude ball (2026-09-15)', () => {
  it('lays its horizon at the true horizon angle, both bank directions', () => {
    for (const bankDeg of [30, -30, 60, -60]) {
      const p = createPanel(f6f, () => null)
      const state = attitude(0, bankDeg)
      const { worldToCamera } = pose(p, state)
      updatePanel(p, f6f, state, NEUTRAL_CONTROLS, () => null)
      expect(ballScreenAngle(p, worldToCamera), `bank ${bankDeg}`)
        .toBeCloseTo(trueHorizonScreenAngle(worldToCamera), 1)
    }
  })

  it('drops its horizon as the nose comes up', () => {
    const p = createPanel(f6f, () => null)
    const heightAt = (pitchDeg: number): number => {
      const state = attitude(pitchDeg, 0)
      const { worldToCamera } = pose(p, state)
      updatePanel(p, f6f, state, NEUTRAL_CONTROLS, () => null)
      return ballScreenHeight(p, state, worldToCamera)
    }
    expect(heightAt(20)).toBeLessThan(heightAt(-20))
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/render/panel.test.ts -t attitude`
Expected: FAIL — `p.attitude` is undefined.

- [ ] **Step 3: Build it**

Build the ball into the `attitude` slot Task 3 allocated. Ruling R1: there is **no
`GAUGES` entry** for it — it is panel geometry driven by `attitudeAngles(state)`, exactly
as the horizon bar it replaces was. The disc is drawn oversized and clipped by the bezel
ring so it can translate with pitch without exposing an edge.

```ts
// Sky over ground, split at the disc's centre line.
const ball = new Group()
ball.name = 'attitude:ball'
const face = DIAL_RADIUS * 1.6            // oversized, so pitch never shows an edge
for (const [colour, sign] of [[0x3f7fbf, 1], [0x6b4f2a, -1]] as const) {
  const half = new Mesh(
    new PlaneGeometry(face * 2, face),
    new MeshBasicMaterial({ color: colour }),
  )
  half.position.set(0, (sign * face) / 2, 0)
  ball.add(half)
}
```

In `updatePanel`, drive it from `attitudeAngles(state)` — do NOT recompute the
angles, that function already fixed a body-frame bank bug on 2026-09-13:

```ts
const { pitchRad, rollRad } = attitudeAngles(renderAttitudeState)
// Same sign convention the horizon bar used and the same reason: in a RIGHT
// bank the true horizon appears rotated anticlockwise on screen, so the ball's
// horizon rotates WITH rollRad, not against it. `-rollRad` read -30.00 against
// a true horizon of +30.00 (panel.ts, 2026-09-13).
panel.attitude.ball.rotation.z = rollRad
// Nose up drops the horizon: pitch is subtracted, scaled so the dial's usable
// range covers about +/- 30 degrees before the disc runs out.
panel.attitude.ball.position.y = -(pitchRad / (Math.PI / 6)) * DIAL_RADIUS * 0.8
```

- [ ] **Step 4: Run and watch it pass, then prove the sign**

Negate the ball's roll rotation; expect every bank case to FAIL by double the bank angle. Restore.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "panel: the attitude ball, checked against the true horizon"
```

---

### Task 7: Remove the horizon bar, and bolden the reticle

Only now, with Task 6 green.

**Files:**
- Modify: `src/render/scene/panel.ts`
- Test: `tests/render/panel.test.ts`

- [ ] **Step 1: Delete the bar**

Remove `Panel.horizon`, its geometry, its `updatePanel` branch, and `HORIZON_Z` / `MAX_HORIZON_PITCH` / `HORIZON_DISTANCE_M`. Delete the bar's own tests — their replacement is Task 6's. **Move the two comments explaining the roll-sign derivation onto the ball**, so the reasoning survives the code it described.

- [ ] **Step 2: Bolden the reticle**

`const strokeM = armM * 0.14` (was `0.09`), per decision 4.

- [ ] **Step 3: Run the full suite**

Run: `npm run verify`
Expected: exit 0, with the bar's tests gone and the ball's passing. The reticle boresight test from 2026-09-15 must still pass untouched.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "panel: retire the horizon bar, now the ball carries its coverage"
```

---

### Task 8: Documentation and handoff

**Files:**
- Create: `docs/handoff/2026-09-15-cockpit-panel.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 table), `README.md`

- [ ] **Step 1: Capture screenshots on the reference GPU**

The Windows desktop is the only real-GPU target; nexus is headless. Serve `dist/` locally, reverse-forward that port to the desktop so the browser reaches it over `http://localhost` (WebGPU needs a secure context), and connect to the Playwright server. **Hold `KeyC` for ~250 ms** — a `press()` is shorter than a frame and the loop never samples it.

- [ ] **Step 2: Write the handoff**

Cockpit and chase captures, what shipped, what is reserved and why it is empty, and the measured vertical/horizontal margins so the next layout change starts from numbers.

- [ ] **Step 3: Update the plan table and README**

Add a Plan 6a row to master spec §15. Do not restate the numbering anywhere else — that table is the only authoritative statement.

- [ ] **Step 4: Run the full suite and commit**

```bash
npm run verify && git add -A && git commit -m "docs: cockpit panel handoff and evidence"
```

---

## Review gates

- After Task 3: the panel is structurally new and every old dial still reads. Stop and look at it before building new instruments into it.
- After Task 7: whole-branch review. The horizon bar is gone; confirm nothing that referenced it survives, in code or comments.

## What this plan does not do, restated so it is not drifted into

- No `src/sim/` changes, no aircraft-spec changes, no golden regeneration.
- No radar contacts, weapons or AI — Plans 6 and 7 fill the reserved slots.
- No landing gear and no flaps. Flaps are flight-model work: the stall card cites the CLEAN Patuxent figure precisely because the model has no high-lift devices.
- No touch input; no settings UI.
