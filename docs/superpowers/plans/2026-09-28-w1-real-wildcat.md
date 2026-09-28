# W1: the real F4F-4 Wildcat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Wildcat's placeholder Hellcat numbers with a sourced F4F-4 flight model, and draw it at its real size and parked angle. It is onboarded through a generic card suite that the next aircraft reuses.

**Architecture:**
- **Content.** `content/aircraft/f4f-wildcat.json` gets real figures. The fit comes from the existing `tools/testcards/measure.ts` sweep.
- **Cards.** One data-driven card file grades every aircraft from its `reference`. The F6F's and Zero's cards move into it first, unchanged.
- **Drawing.** The drawn Wildcat is rescaled and re-centered through `wildcatCorrection()`. Its main legs are lengthened at load. Every fit is held by generic model tests.

**Tech Stack:** TypeScript, vitest, three.js, @gltf-transform (model tests), Playwright (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-28-w1-real-wildcat-design.md`. Read it first. Its rulings R1 to R5 are Mark's.

**Viewing checkpoint:** the final product only (Task 5). **Run:** unattended. The checkpoint captures go in the handoff (Mark, 2026-09-28).

## Global Constraints

- **Work in a worktree:** `git worktree add ../ww2airsim-worktrees/w1-wildcat -b worktree-w1-wildcat main`.
  - Symlink `node_modules` from the main checkout.
  - Never touch `main`. Pushing the branch is allowed. Merging is Mark's call.
- **Verify every task:** `npm run verify` ends every task with `rc=0`, run through `remote-run npm run verify`. Capture `rc=$?` directly, and never gate on a grepped pipeline. On nexus, run only the files you touch, with `--maxWorkers=2`.
- **The F6F and the Zero fly bit-identically.** `f6f-hellcat.json` and `a6m2-zero.json` are not edited, except as named in Task 1 (no content edits there) and Task 4 (none).
- **Tolerances:** graded-card tolerances only ever tighten. Never widen one to pass. Each card comment records its measurement and date. R36 applies: report a gap, never tune a coefficient to pass a card.
- **Sourcing:** every figure is sourced (document plus the read date, 2026-09-28) or labeled `ESTIMATE`, `DERIVED` or `FITTED` in capitals in its `source` string.
- **Code rules:**
  - `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library.
  - Aircraft schema objects stay `.strict()`.
- **Style:** US spelling. Escape `|` as `\|` in markdown table cells.
- **Commits:** end every commit message with the Co-Authored-By trailer your session's instructions give. No AI model names in commit bodies or docs.
- **Scratch probes** go under `.superpowers/w1/`, which is gitignored. Never commit a probe.
- **Tier 2** runs only in Task 5, against a worktree dev server on `ww2airsim-2.windomlane.org` (port 5175) or a localhost port. The `vite.config.ts` slot edit is local scratch and is never committed.

## Review Focus

1. **A dropped or loosened card.** A card migrated in Task 1 could silently lose an assertion or loosen a tolerance. Task 1 checks it three ways: the table records every old tolerance verbatim, a before-and-after test-name count, and the migrated `it` titles.
2. **An aircraft missing from the table.** A new aircraft file with a `reference` but no `CARDS` entry would go ungraded. `graded.test.ts` fails by name for any spec missing from `CARDS` (Task 1).
3. **A Wildcat with no rails.** A Dev sortie or `?launch&aircraft=f4f-wildcat&loadout=rockets` puts a no-rails Wildcat in the air. `storesSpec` dereferences `s.rails[0]!` today (`src/sim/weapons/stores.ts:36`), and must instead fly with zero rockets and no throw. Task 4 pins this.
4. **The retracting gear.** The lengthened main legs could poke out through the fuselage or wing skin, at gear-up or mid-travel. Task 3 tests fractions 0, 0.25, 0.5 and 0.75, not only the endpoints.
5. **A saved Rockets loadout.** A pilot whose last sortie was a Wildcat with Rockets or Both reopens the forms. The flow already re-validates (`src/render/sortieFlow.ts:63`). Task 4 adds the case to `tests/render/sortieFlow.test.ts` so it cannot regress.

## Measured before writing this plan (2026-09-28, node v22.22.1, main at `c37e4d4`)

These are claims to re-check, not premises. The probe scripts were
`.superpowers/w1/{fit,sweep,final,draw,zones}.mts` in the main checkout. Tasks
2 to 4 re-measure every figure.

- **The fit.** It uses cd0 0.016, propEfficiency 0.60, and a power curve that
  is the R-1830-86's sourced normal ratings, unscaled, as fractions of 1,200 hp
  take-off. The curve points (m, fraction) are:
  `[0,0.9167],[1005.8,0.9167],[1158.2,0.9],[3444.2,0.9083],[3962.4,0.8583],[5608.3,0.8667],[7500,0.6933],[10400,0.494]`.
  The two points above 5,608 m are ESTIMATES (density lapse). Measured with it:
  - **Top speed**, % from [DS] at SL / 2.5k / 4.6k / 12k / 14k / 19k / 19.4k ft:
    +0.64 / +0.50 / +1.20 / +0.83 / +0.99 / +1.71 / +1.18.
  - **Climb:** SL +16.84% (10.031 against 8.585 m/s), the F6F's own +16.77%
    bias. At 16,300 ft it reads +5.05%.
  - **Stall:** 41.302 m/s clean (+2.11% against 40.45), 35.988 m/s flaps
    (+1.86% against 35.33). The CLmax ratio is 1.3171, against the derived
    1.3104.
  - **Take-off** at 73 mph lift-off: 179.16 m with full flaps (-14.32%),
    174.14 m clean (-16.72%), against 209.1 m. [4058] states neither its flap
    setting nor its lift-off speed. The 73 mph is [5262]'s. This is a
    reported gap (R36), graded at 20%.
  - **Roll** at the reference speed: 67.998 deg/s against 68.
- **Of 100 combinations swept,** 27 passed the Zero's widths. This fit is the
  one with the power curve unscaled.
- **The F6F, measured the same way:**
  - Top speed at the same seven altitudes: 137.30, 140.53, 143.34, 154.00,
    157.09, 165.26, 165.94 m/s. The F4F reads 123.45, 126.29, 127.90, 136.31,
    137.16, 143.23, 142.98.
  - Climb at SL: 15.775 m/s.
  - Stall: 45.469 m/s clean, 39.129 m/s with flaps.
  - Take-off at full flaps and 86.5 mph: 236.06 m.
- **The drawing at the real span.**
  - `WILDCAT_SCALE` = 11.582 / 15.658001068688918 = 0.7396857.
  - `WILDCAT_OFFSET_Y_M` = -1.872 × (0.7396857 / 0.8340784) = -1.6601.
  - The quarter-chord at z = 1.737 m (30% of the half-span) is at x = 1.871:
    the leading edge is at 2.452 and the trailing edge at 0.127. So
    `WILDCAT_OFFSET_X_M` = -1.871.
  - After that the mains are at x 0.413 and y -1.951, the length is 8.544 m
    (the real F4F-4 is 8.80 m), and the parked angle is 7.432°.
  - A 0.4445 m downward stretch of the main contact gives 12.333°, so
    `gear.heightM` = 2.3952.
  - The parked propeller hub then sits 2.347 m high, against about 2.10 m
    derived from [DS]. The model's wheelbase is 5.04 m against 5.46 m, and its
    main-wheel track is 1.28 m against 1.96 m. These gaps are recorded (spec
    §2) and not fixed.
- **Existing zones outside their drawn airframe** (the allowlist for Task 4):
  - f6f-hellcat: `engine` x 1.53 m, `rudder` y 0.20 m.
  - a6m2-zero: `engine` x 1.83 m, `rudder` y 1.00 m.
  - Every gun mount of both is inside.
- **The schema requires at least one rail** (`rails ... .min(1)`,
  `src/sim/flight/schema.ts:60`). A no-rails Wildcat needs that relaxed
  (Task 4).

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `tests/sim/testcards/graded.test.ts` (new) | Grades every aircraft from its `reference`, with each aircraft's tolerances and take-off configuration in one table | 1, 2 |
| `tests/sim/testcards/f6f.test.ts`, `a6m.test.ts` | Keep only airplane-specific claims | 1 |
| `tests/sim/testcards/f4f.test.ts` (new) | F4F against F6F matchups | 2 |
| `content/aircraft/f4f-wildcat.json` | The real F4F-4 | 2, 3, 4 |
| `src/render/scene/wildcatFrame.ts` | Scale, center and drop constants | 3 |
| `src/render/scene/wildcat.ts` | Main-leg stretch at load | 3 |
| `src/render/scene/stance.ts` | `MODEL_STANCE.wildcat` becomes the sourced 12.333° | 3 |
| `tests/tools/models/centerPoint.test.ts` (new) | Quarter-chord at x = 0 for every drawn model | 3 |
| `tests/tools/models/wildcatGear.test.ts` (new) | The stretched legs stow inside the skin | 3 |
| `tests/tools/models/stance.test.ts` | Held to 0.25° of the stance angle | 3 |
| `src/sim/flight/schema.ts`, `src/sim/weapons/stores.ts` | Allow a racks-only airplane | 4 |
| `tests/tools/models/combatFit.test.ts` (new) | Zones and gun mounts inside the drawn airframe | 4 |
| `docs/aircraft.md` (new), handoff, §15 row, `ASSETS.md`, README | Docs | 5 |

---

### Task 1: One graded card suite (the F6F and the Zero, moved as-is)

**Files:**
- Create: `tests/sim/testcards/graded.test.ts`
- Modify: `tests/sim/testcards/f6f.test.ts`, `tests/sim/testcards/a6m.test.ts`

**Interfaces:**
- Consumes: `measureTopSpeed`, `measureClimbRate`, `measureStallSpeed`,
  `measureRollRate` and `measureTakeoffRun` from
  `tools/testcards/measure.ts`, and `loadAircraftSpec`.
- Produces: `CARDS: Record<string, Card>` in `graded.test.ts`, which Task 2
  adds `f4f-wildcat` to:

```ts
type Card = {
  readonly topSpeed: number          // tolerance at reference.topSpeedAltitudeM
  readonly topSpeedTable?: number    // each reference.topSpeedByAltitudeM point
  readonly climb: number             // sea level
  readonly climbTable?: number       // each reference.climbRateByAltitudeM point
  readonly stall: number
  readonly flapStall: number
  readonly roll: number
  readonly takeoff?: { readonly tol: number; readonly liftoffMps: number; readonly flapFraction: number }
}
```

- [ ] **Step 1: Record the baseline.**

```bash
npx vitest run tests/sim/testcards --reporter=verbose 2>&1 | grep -E '✓|×' | sed 's/ [0-9]*ms$//' | sort > .superpowers/w1/cards-before.txt; wc -l .superpowers/w1/cards-before.txt
```

Expected: every line passes. Note the count.

- [ ] **Step 2: Write `tests/sim/testcards/graded.test.ts`.** Each tolerance
  below is the existing card's value, verbatim. Each `// was:` comment names
  the card it came from.

```ts
// tests/sim/testcards/graded.test.ts
// Every aircraft graded from its own `reference` (W1, 2026-09-28). Onboarding a new aircraft is a
// CARDS entry plus its sourced reference (docs/aircraft.md). Tolerances only ever tighten; each is
// the measurement it was set from, dated, and a red card is reported, never tuned (R36).
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { measureTopSpeed, measureClimbRate, measureStallSpeed, measureRollRate, measureTakeoffRun } from '../../../tools/testcards/measure.js'

type Card = {
  readonly topSpeed: number
  readonly topSpeedTable?: number
  readonly climb: number
  readonly climbTable?: number
  readonly stall: number
  readonly flapStall: number
  readonly roll: number
  readonly takeoff?: { readonly tol: number; readonly liftoffMps: number; readonly flapFraction: number }
}

const MPH = 0.44704

export const CARDS: Readonly<Record<string, Card>> = {
  // was: f6f.test.ts (TOL 0.15 default; climb 0.25; stalls 0.2; take-off 0.04 at 86.5 mph, full flaps).
  'f6f-hellcat': { topSpeed: 0.15, climb: 0.25, stall: 0.2, flapStall: 0.2, roll: 0.15, takeoff: { tol: 0.04, liftoffMps: 86.5 * MPH, flapFraction: 1 } },
  // was: a6m.test.ts (top 0.05 incl. table; climb 0.25; climb table 0.3; stalls 0.2; roll 0.15; no take-off distance).
  'a6m2-zero': { topSpeed: 0.05, topSpeedTable: 0.05, climb: 0.25, climbTable: 0.3, stall: 0.2, flapStall: 0.2, roll: 0.15 },
}

const within = (actual: number, expected: number, tol: number) => {
  const err = Math.abs(actual - expected) / expected
  return { pass: err <= tol, err, actual, expected }
}
const pct = (r: { err: number }) => `${(r.err * 100).toFixed(2)}% off`

const ids = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()

it('every aircraft has a CARDS entry (onboarding: docs/aircraft.md)', () => {
  expect(ids.filter((id) => CARDS[id] === undefined), 'aircraft with no graded cards').toEqual([])
})

describe.each(ids.filter((id) => CARDS[id] !== undefined))('%s graded against its reference', (id) => {
  const spec = loadAircraftSpec(id)
  const ref = spec.reference
  const card = CARDS[id]!
  const climbSeaLevel = measureClimbRate(spec, 0)

  it('reaches its top speed at its critical altitude', () => {
    const r = within(measureTopSpeed(spec, ref.topSpeedAltitudeM), ref.topSpeedMps, card.topSpeed)
    expect(r.pass, `top speed ${r.actual.toFixed(2)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it.each(ref.topSpeedByAltitudeM ?? [])('reaches its trial speed at %d m', (altitudeM, speedMps) => {
    const r = within(measureTopSpeed(spec, altitudeM), speedMps, card.topSpeedTable!)
    expect(r.pass, `top speed at ${altitudeM} m ${r.actual.toFixed(2)} vs ${speedMps} (${pct(r)})`).toBe(true)
  })

  it('climbs at its sea-level rate', () => {
    const r = within(climbSeaLevel, ref.climbRateMps, card.climb)
    expect(r.pass, `climb ${r.actual.toFixed(3)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it.each(ref.climbRateByAltitudeM ?? [])('climbs at its trial rate at %d m', (altitudeM, rateMps) => {
    const r = within(measureClimbRate(spec, altitudeM), rateMps, card.climbTable!)
    expect(r.pass, `climb at ${altitudeM} m ${r.actual.toFixed(3)} vs ${rateMps} (${pct(r)})`).toBe(true)
  })

  it('climbs more slowly at each higher altitude in its table', () => {
    const rates = [climbSeaLevel, ...(ref.climbRateByAltitudeM ?? []).map(([a]) => measureClimbRate(spec, a))]
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeLessThan(rates[i - 1]!)
  })

  it('stalls near its clean, power-off stall speed', () => {
    const r = within(measureStallSpeed(spec, 0, 0), ref.stallSpeedMps, card.stall)
    expect(r.pass, `stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it('stalls near its landing-configuration stall speed with the flaps down', () => {
    const r = within(measureStallSpeed(spec, 0, 1), ref.stallSpeedFlapMps, card.flapStall)
    expect(r.pass, `flap stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it('stalls slower with flaps by about the CLmax ratio its two stalls imply', () => {
    const clean = measureStallSpeed(spec, 0, 0)
    const flapped = measureStallSpeed(spec, 0, 1)
    expect(flapped).toBeLessThan(clean)
    expect((clean / flapped) ** 2).toBeCloseTo((ref.stallSpeedMps / ref.stallSpeedFlapMps) ** 2, 1)
  })

  it('rolls at its reference rate at the reference speed', () => {
    const r = within(measureRollRate(spec, 0, spec.rates.rateRefSpeedMps), ref.rollRateDegPerSec, card.roll)
    expect(r.pass, `roll ${r.actual.toFixed(3)} deg/s vs ${r.expected}`).toBe(true)
  })

  it.runIf(card.takeoff !== undefined && ref.takeoffDistanceM !== undefined)('rolls to its take-off distance in the trial configuration', () => {
    const t = card.takeoff!
    const r = within(measureTakeoffRun(spec, t.liftoffMps, t.flapFraction), ref.takeoffDistanceM!, t.tol)
    expect(r.pass, `take-off roll ${r.actual.toFixed(1)} m vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it.runIf(card.takeoff !== undefined)('rolls longer with full flaps than clean, the direction flap drag must push', () => {
    const t = card.takeoff!
    expect(measureTakeoffRun(spec, t.liftoffMps, 1)).toBeGreaterThan(measureTakeoffRun(spec, t.liftoffMps, 0))
  })
})
```

  Note on the F6F. Its old flap-ratio card asserted `toBeCloseTo(1.3451, 1)`.
  1.3451 is exactly `(43.81 / 37.7749)²`, and the Zero's 1.2779 is exactly
  `(78 / 69)²`. So the generic form asserts the same value. Check both
  numerically in this step:

```bash
node -e "console.log((43.81/37.7749)**2, (35.7652/31.5845)**2, (78*0.44704/(69*0.44704))**2)"
```

- [ ] **Step 3: Trim the per-aircraft files.**
  - **`f6f.test.ts` keeps only** these cards:
    - "climbs more slowly at altitude than at sea level" (8,000 m; the F6F has
      no climb table);
    - "reads the same climb rate at any lateral-force coefficient".
  - **`a6m.test.ts` keeps:**
    - the metadata card, "is graded at the trial weight, 5,555 lb";
    - the control-fade `describe`;
    - the F6F matchup `describe`.
  - **Delete from both** every card that `graded.test.ts` now runs. Keep each
    file's header comment and the tolerance-history comments. Move each
    deleted card's measurement comment, verbatim, onto its `CARDS` line in
    `graded.test.ts`.
- [ ] **Step 4: Run and compare.**

```bash
npx vitest run tests/sim/testcards --maxWorkers=2 --reporter=verbose 2>&1 | grep -E '✓|×' | sed 's/ [0-9]*ms$//' | sort > .superpowers/w1/cards-after.txt; wc -l .superpowers/w1/cards-before.txt .superpowers/w1/cards-after.txt
```

  - **Temporary placeholder entry.** Add `'f4f-wildcat'` to `CARDS`, with the
    F6F's card values and the comment `// placeholder until Task 2`. Its
    placeholder `reference` is the F6F's own, so it passes. That keeps the
    guard test green.
  - **Then check:**
    - no `×` anywhere;
    - `grep -c -E 'f6f|F6F' ` and `grep -c -E 'a6m2|A6M2|Zero'` on the before
      and after files agree, after subtracting the cards that stayed in the
      per-aircraft files;
    - every before line maps by hand to an after line (the names change, the
      assertions do not).
  - **Record** the mapping in the commit body as `old title -> new title`.

- [ ] **Step 5: Verify and commit.**

```bash
remote-run npm run verify; rc=$?; echo "rc=$rc"
git add tests/sim/testcards && git commit -m "Cards: one graded suite grades every aircraft from its reference; F6F and Zero moved as-is"
```

### Task 2: The F4F-4 flight model

**Files:**
- Modify: `content/aircraft/f4f-wildcat.json`
- Modify: `tests/sim/testcards/graded.test.ts` (the `f4f-wildcat` entry)
- Create: `tests/sim/testcards/f4f.test.ts`
- Modify: any test that pins a placeholder-derived Wildcat figure. Find them
  with `grep -rln "f4f-wildcat" tests`: today that list includes
  `tests/render/hangar/stats.test.ts` and `tests/render/sortie/flyable.test.ts`.
  Update each pinned value to the new content, and name the old and new values
  in the commit body.

**Interfaces:**
- Produces: the content id `f4f-wildcat`, with the fields below. Task 3
  overwrites `gear.heightM` and `view.eyePointM`. Task 4 overwrites `combat`
  and `stores`.

- [ ] **Step 1: Write `tests/sim/testcards/f4f.test.ts` (it fails first).**

```ts
// tests/sim/testcards/f4f.test.ts
// F4F-4 against F6F-5: what the sources say must fall out of the data (W1 spec §1). Grading
// against the F4F's own trials is graded.test.ts's job; this file holds only the matchup.
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { measureTopSpeed, measureClimbRate, measureStallSpeed, measureTakeoffRun } from '../../../tools/testcards/measure.js'

const f4f = loadAircraftSpec('f4f-wildcat')
const f6f = loadAircraftSpec('f6f-hellcat')
const MPH = 0.44704

describe('F4F-4 against F6F-5', () => {
  it('is a real F4F-4, graded at the six-gun combat weight (R2)', () => {
    expect(f4f.reference.testMassKg).toBe(3616.04)
    expect(f4f.geometry.wingSpanM).toBe(11.582)
    expect(f4f.reference.source).not.toMatch(/PLACEHOLDER/)
  })
  it.each([0, 762, 1402.1, 3657.6, 4267.2, 5791.2, 5913.1])('the F6F is faster at %d m', (altitudeM) => {
    expect(measureTopSpeed(f6f, altitudeM)).toBeGreaterThan(measureTopSpeed(f4f, altitudeM))
  })
  it('the F6F climbs faster at sea level', () => {
    expect(measureClimbRate(f6f, 0)).toBeGreaterThan(measureClimbRate(f4f, 0))
  })
  it('the F4F stalls slower, clean and with flaps', () => {
    expect(measureStallSpeed(f4f, 0, 0)).toBeLessThan(measureStallSpeed(f6f, 0, 0))
    expect(measureStallSpeed(f4f, 0, 1)).toBeLessThan(measureStallSpeed(f6f, 0, 1))
  })
  it('the F4F rolls shorter to lift-off, each at its own trial lift-off speed with full flaps', () => {
    expect(measureTakeoffRun(f4f, 73 * MPH, 1)).toBeLessThan(measureTakeoffRun(f6f, 86.5 * MPH, 1))
  })
  it('the F4F has the lighter wing loading at the trial weights', () => {
    expect(f4f.reference.testMassKg / f4f.geometry.wingAreaM2).toBeLessThan(f6f.reference.testMassKg / f6f.geometry.wingAreaM2)
  })
})
```

  Run it with `npx vitest run tests/sim/testcards/f4f.test.ts`. Expected:
  FAIL on `testMassKg` (5633.62) and span (13.06).

- [ ] **Step 2: Edit the content.** Set these fields in
  `content/aircraft/f4f-wildcat.json`. Leave `id`, `name`, `role`, `side`,
  `carrierCapable`, `view`, `combat` and `stores` as they are (Tasks 3 and 4
  own those).

```json
"geometry": { "wingAreaM2": 24.155, "wingSpanM": 11.582 },
"mass": { "emptyKg": 2673.9, "fuelCapacityKg": 392.5, "maxTakeoffKg": 3974.4 },
"aero": { "clSlopePerRad": 4.8055, "clMax": 1.4, "alphaCritDeg": 15.5, "clAtZeroAlpha": 0.1, "cySlopePerRad": 2.0, "cd0": 0.016, "oswaldE": 0.85 },
"engine": { "maxPowerW": 894800, "propEfficiency": 0.6, "staticThrustN": 12003, "windmillCd0": 0.032,
  "powerFractionByAltitudeM": [[0, 0.9167], [1005.8, 0.9167], [1158.2, 0.9], [3444.2, 0.9083], [3962.4, 0.8583], [5608.3, 0.8667], [7500, 0.6933], [10400, 0.494]] },
"rates": { "maxRollRateDegPerSec": 68, "...": "every other rates field unchanged" },
"gear": { "travelSeconds": 10, "dragAreaM2": 0.234, "...": "every other gear field unchanged" },
"flap": { "travelSeconds": 5, "dragAreaM2": 0.467, "clIncrement": 0.4346 },
"reference": {
  "testMassKg": 3616.04, "topSpeedMps": 141.31, "topSpeedAltitudeM": 5913.1,
  "climbRateMps": 8.585, "stallSpeedMps": 40.45, "stallSpeedFlapMps": 35.33,
  "rollRateDegPerSec": 68, "takeoffDistanceM": 209.1,
  "topSpeedByAltitudeM": [[0, 122.67], [762, 125.66], [1402.1, 126.38], [3657.6, 135.19], [4267.2, 135.81], [5791.2, 140.82], [5913.1, 141.31]],
  "climbRateByAltitudeM": [[4968.2, 7.62]]
}
```

  (The `"..."` keys are notes to you, not JSON: keep those blocks' other
  fields exactly as they are.) Confirm the conversions with a one-line `node
  -e` before writing: mph × 0.44704, ft × 0.3048, ft/min × 0.00508,
  lb × 0.45359237. The `flap.clIncrement` 0.4346 is
  `1.400013 × ((87/76)² − 1)`. The `staticThrustN` 12,003 is
  `20000 × 894.8/1491`.

  Rewrite `reference.source` in full. Start from the spec's §1 table and
  sources list, in the house style of `a6m2-zero.json`'s source, covering:
  - the [4058], [5262], [02135], [DS], [SAC], [N868] and [HB] citations, with
    URLs under `http://www.wwiiaircraftperformance.org/f4f/`, read 2026-09-28;
  - that the site's HTML stall transcription is wrong (cite the scans);
  - R2's weight;
  - the stall DERIVED by √(7972/7370) = 1.0400, with [DS]'s 81.3 mph as the
    cross-check;
  - no IAS or TAS basis stated in any source;
  - the take-off at 7,921 lb with no flap setting stated, and the 73 mph
    lift-off borrowed from [5262];
  - FITTED cd0, propEfficiency and the curve, with the numbers from
    "Measured before";
  - ESTIMATES: the two upper curve points, roll 68 (from [N868]'s **F4F-3**
    curve, ±3°/s), gear travel 10 s (hand-cranked, about 28 turns, [HB]), and
    the `rates` and ground fields kept from the F6F (T1 reworks the ground
    fields);
  - `limits.diveSpeedMps` and `limits.gLimit` kept from the F6F as ESTIMATES,
    since no source was found.

  It must not contain `PLACEHOLDER`.

- [ ] **Step 3: Replace the `f4f-wildcat` placeholder in `CARDS`** with this
  entry:

```ts
  // Set 2026-09-28 from the W1 fit (cd0 0.016, eta 0.60, sourced normal-rating curve unscaled):
  // top +0.50..+1.71% over [DS]'s seven points; climb SL +16.84% (the F6F's own +16.77% bias),
  // 16,300 ft +5.05%; stall +2.11% clean, +1.86% flaps; roll 67.998 vs 68. Take-off -14.32% at full
  // flaps and [5262]'s 73 mph lift-off: [4058] states neither its flap setting nor its lift-off
  // speed, so 20% is a reported gap (R36), not a fit.
  'f4f-wildcat': { topSpeed: 0.05, topSpeedTable: 0.05, climb: 0.25, climbTable: 0.3, stall: 0.2, flapStall: 0.2, roll: 0.15, takeoff: { tol: 0.2, liftoffMps: 73 * MPH, flapFraction: 1 } },
```

- [ ] **Step 4: Run.**

```bash
npx vitest run --maxWorkers=2 tests/sim/testcards $(grep -rln "f4f-wildcat" tests --include=*.test.ts | tr '\n' ' ')
```

  Expected:
  - Every graded card and every `f4f.test.ts` card passes, and each measured
    figure matches "Measured before" to the printed digit.
  - If a figure differs, re-measure and report. Do not tune.
  - Fix each pin in the other named tests to the new content value.
- [ ] **Step 5: Verify and commit.** `remote-run npm run verify; rc=$?`,
  then commit with "W1: the F4F-4 flight model, sourced from the 1942
  Anacostia trials and Grumman's detail specification".

### Task 3: The drawing: real scale, centered, lengthened legs, sourced parked angle

**Files:**
- Modify: `src/render/scene/wildcatFrame.ts`, `src/render/scene/wildcat.ts`, `src/render/scene/stance.ts`
- Modify: `content/aircraft/f4f-wildcat.json` (`gear.heightM`, `view.eyePointM`, `stores` rack offsets)
- Modify: `tests/tools/models/wildcatMounts.test.ts`, `tests/render/wildcat.test.ts`, `tests/tools/models/stance.test.ts`
- Create: `tests/tools/models/centerPoint.test.ts`, `tests/tools/models/wildcatGear.test.ts`

**Interfaces:**
- Produces: in `wildcatFrame.ts`:
  - `WILDCAT_OFFSET_X_M` (new);
  - the new values of `WILDCAT_SCALE` and `WILDCAT_OFFSET_Y_M`;
  - `WILDCAT_GEAR_STRETCH_M` (new, 0.4445): sim meters, the vertical drop of
    the main contact;
  - `wildcatGearStretch(der: Object3D, izq: Object3D): void` (new, exported
    from `wildcat.ts`), which applies the stretch to the two gear groups in
    place.
- `MODEL_STANCE.wildcat` becomes `{ mainWheelXM: 0.413, tailDownPitchRad: (12 + 20 / 60) * DEG }`.

- [ ] **Step 1: Write `tests/tools/models/centerPoint.test.ts`.** It fails for
  the Wildcat.

```ts
// Every drawn model's wing quarter-chord sits at the sim body origin, x = 0 (W1, 2026-09-28):
// the origin stands for the center of gravity, which a WWII fighter carries near 25-30% MAC.
// Measured that day: Hellcat 0.04 m, Zero 0.11 m; the Wildcat was drawn 2.11 m forward.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { sectionAtFor } from '../../../tools/models/mounts.js'

const TOLERANCE_M = 0.15
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))

describe('every drawn model is centered on its quarter-chord', () => {
  it.each(specs.map((s) => [s.id, s] as const))('%s', async (_id, spec) => {
    const at = await sectionAtFor(spec.view.model)
    const s = at(0.3 * spec.geometry.wingSpanM / 2)
    const qc = s.leadingX - 0.25 * (s.leadingX - s.trailingX)
    expect(Math.abs(qc), `${spec.id}: quarter-chord at x ${qc.toFixed(3)} m`).toBeLessThanOrEqual(TOLERANCE_M)
  })
})
```

  Run it. Expected: FAIL for f4f-wildcat, and PASS for the other two.

- [ ] **Step 2: Rescale and center.** In `wildcatFrame.ts`:
  - Change `TARGET_WINGSPAN_M` to `11.582`, and fix its doc comment: it is now
    `f4f-wildcat.json`'s real span, not the Hellcat's.
  - Add `export const WILDCAT_OFFSET_X_M = -1.871`, with a doc comment citing
    this task's measurement.
  - Set `WILDCAT_OFFSET_Y_M = -1.6601`, with its doc comment updated: the
    2026-09-28 drop, scaled by the new scale, so the airframe keeps its height
    about the origin.
  - In `wildcatCorrection()`, change the last line to
    `g.position.set(WILDCAT_OFFSET_X_M, WILDCAT_OFFSET_Y_M, 0)`.
  - In `wildcatMounts.test.ts`'s slicing-transform test, add the X offset to
    the expected group.

  Run `centerPoint.test.ts`: PASS for all three.

- [ ] **Step 3: Write `tests/tools/models/wildcatGear.test.ts` (it fails
  first).**
  - **What it loads:** the glb through the same path `wildcat.test.ts`'s
    synthetic cache uses (read that file first and reuse its `syntheticCache`
    helper by import or by copying it into a shared `tests/render/_wildcatCache.ts`,
    whichever file owns it today).
  - **At GEAR_DOWN** (fraction 1), it asserts that the lowest main-wheel
    vertex, in the root's frame, is `-(2.3952)` within 0.01 m, and that the
    strut's top vertex is where it was before the stretch, within 0.005 m.
    The strut is `polySurface272` under `GRP_Rueda_Der`, and `GRP_Rueda_Izq`'s
    matching child for the other side.
  - **At fractions 0, 0.25, 0.5 and 0.75,** it asserts that no vertex of the
    stretched strut or wheel lies outside the fuselage's outer skin. The
    fuselage is the `Cubierta_ruedas_Chasis` mesh plus the wing meshes. Use
    the method in `aircraftRigs.test.ts`'s `THROUGH_SKIN` check: take the
    fuselage's section at the gear's x, and require each gear vertex's |z| and
    y to be within the section's hull, plus a 0.02 m slack.
  - **The two bounds.** Record the unstretched gear's worst excess, measured
    in Step 4 before the stretch is applied, as the allowed ceiling. The
    stretch may not make any fraction worse than the unstretched gear's
    worst.

- [ ] **Step 4: Implement the stretch in `wildcat.ts`.**

```ts
/**
 * Lengthens both main legs so the drawn Wildcat sits at Grumman's static ground angle, 12°20'
 * ([DS] 116a), rather than the model's own 7.43° (W1 spec R5, 2026-09-28). The model's tailwheel
 * top is already inside the fuselage skin, so the tail cannot come up; the mains come down.
 * The strut (polySurface272) is scaled along its own local y about its top, and every other
 * child of the gear group below the strut's midpoint (the wheel and its bolts) moves down the
 * same local distance. Local units: WILDCAT_GEAR_STRETCH_M / (WILDCAT_SCALE * the group's world
 * scale), measured once here. The model is CC-BY 4.0; ASSETS.md records the modification.
 */
export function wildcatGearStretch(der: Object3D, izq: Object3D): void {
  for (const group of [der, izq]) {
    const strut = group.children.find((c) => c.name.startsWith('polySurface272') || c.name.startsWith('polySurface277'))
    if (strut === undefined) throw new Error(`wildcatGearStretch: no strut under ${group.name}`)
    const box = new Box3().setFromObject(strut)
    // ... measure in the group's local frame: box of the strut's geometry transformed by strut.matrix.
    // Compute localStretch = WILDCAT_GEAR_STRETCH_M / worldScaleOf(group) (group.getWorldScale after
    // the correction is attached), scale strut.scale.y by (len + localStretch) / len about its top,
    // and translate every child whose local center is below the strut's midpoint by -localStretch in y.
  }
}
```

  The code above is a skeleton. Your first action in this step is to measure
  the right node names and axes, then write the full body:
  - **Find the strut on each side.** Dump the children of both
    `GRP_Rueda_Der` and `GRP_Rueda_Izq` with a scratch probe, following
    `.superpowers/w1/tree.mts` (its output for `GRP_Rueda_Der` is in the
    main checkout).
  - **Confirm the strut's axis.** Take its long axis from its geometry bounds,
    and confirm it is local y at the GEAR_DOWN pose, where the group's
    quaternion is the identity.
  - **Call it once.** Call `wildcatGearStretch` once in `loadWildcat`, right
    after the gear nodes are looked up. The animation poses
    (`applyGearFraction`) move the whole group, so the stretched children ride
    along unchanged.
  - **Fill in the constant.** Replace the skeleton's comment lines with the
    measured code, and set `WILDCAT_GEAR_STRETCH_M = 0.4445` in
    `wildcatFrame.ts`.

  Run `wildcatGear.test.ts` until it passes.

- [ ] **Step 5: Refit `gear.heightM` and the stance.**
  - **Gear height.** Set `gear.heightM` to 2.3952, then re-run
    `stance.test.ts`, which measures it. The stance test's mesh reader works
    on the raw glb, which does not see the runtime stretch. Extend its
    `simFramePoints('wildcat')` to apply the same stretch: offset the
    main-gear vertices of `GRP_Rueda_*` below the strut midpoint by
    `-WILDCAT_GEAR_STRETCH_M` in sim y. That is exact at GEAR_DOWN, where the
    leg is vertical in the sim frame; assert the leg's verticality within 1°
    in the test.
  - **The stance entry.** Set `MODEL_STANCE.wildcat` to
    `{ mainWheelXM: 0.413, tailDownPitchRad: (12 + 20 / 60) * DEG }`, with its
    comment citing [DS] 116a.
  - **The tighter angle check.** Add to `stance.test.ts` a check that the
    Wildcat's measured first-touch angle equals `tailDownPitchRad` within
    0.25°.

  Run `npx vitest run --maxWorkers=2 tests/tools/models tests/render/stance.test.ts tests/render/wildcat.test.ts`.

- [ ] **Step 6: The eye point and the racks.**
  - **The eye point.** Re-measure it the way `eyePointM`'s current `source`
    note describes: the canopy node `Puerta_cabina_Cabina_MAT_0`, the
    fore-aft middle of the hood, 0.3 m under its top. Update the value and its
    note.
  - **The racks.** Run `npm run models:mounts` and paste the two
    `f4f-wildcat` rack offsets into the content. Leave the rails; Task 4
    removes them. Re-run `models:mounts` until the rails' offsets are also
    current, so `wildcatMounts.test.ts` passes.
  - **Run** `tests/tools/models/eyePoints.test.ts`, `wildcatMounts.test.ts`
    and `centerPoint.test.ts`.
- [ ] **Step 7: Verify and commit.** `remote-run npm run verify; rc=$?`,
  then commit with "W1: the drawn Wildcat at its real span, centered on its
  quarter-chord, legs lengthened to Grumman's 12°20′".

### Task 4: Guns, zones, a racks-only loadout

**Files:**
- Modify: `src/sim/flight/schema.ts:60`, `src/sim/weapons/stores.ts:31-45`
- Modify: `content/aircraft/f4f-wildcat.json` (`combat`, `stores`)
- Create: `tests/tools/models/combatFit.test.ts`
- Modify: `tests/sim/weapons/stores.test.ts`, or whichever file tests `storesSpec` (find it with `grep -rln storesSpec tests`)
- Modify: `tests/render/sortieFlow.test.ts`, `tests/sim/sortie.test.ts`, `tests/tools/models/wildcatMounts.test.ts`

**Interfaces:**
- Produces:
  - `rails` may be an empty array (`.min(0)`).
  - `storesSpec` only reads a rocket type when `stores.rockets > 0`, and a
    bomb type when `stores.bombs > 0`.

- [ ] **Step 1: The failing tests.**
  - In the `storesSpec` test file:

```ts
it('flies a racks-only airplane with any loadout, rockets counting zero (W1 Review Focus 3)', () => {
  const racksOnly = { ...f6f, stores: { ...f6f.stores!, rails: [] } }
  for (const l of ['clean', 'bombs', 'rockets', 'both'] as const) {
    const st = storesFromLoadout(racksOnly, l)
    expect(st.rockets).toBe(0)
    expect(() => storesSpec(racksOnly, st)).not.toThrow()
  }
  expect(storesSpec(racksOnly, storesFromLoadout(racksOnly, 'bombs')).storesLoad!.massKg).toBe(2 * racksOnly.stores!.types['an-m65']!.massKg)
})
```

    Import `storesFromLoadout` from wherever `stores.ts` exports it. It is the
    function at `src/sim/weapons/stores.ts:15`; read the file for its name.
  - In `tests/render/sortieFlow.test.ts`: a draft with `aircraftSpec:
    'f4f-wildcat'` and `loadout: 'rockets'` validates to `defaultLoadout(...)`,
    not to `'rockets'`, when Dev is off.
  - In `tests/sim/sortie.test.ts`: `eligibleLoadouts(f4f, false)` equals
    `['clean', 'bombs']`.

  Run them. Expected: the schema rejects `rails: []`, or `storesSpec` throws.

- [ ] **Step 2: The fix.**
  - In `schema.ts:60`, change `.min(1)` on `rails` to `.min(0)`, with a
    comment: "a racks-only airplane (the F4F-4, W1)".
  - In `storesSpec`:

```ts
  const bombType = stores.bombs > 0 ? s.types[s.racks[0]!.store]! : undefined
  const rocketType = stores.rockets > 0 ? s.types[s.rails[0]!.store]! : undefined
  const massKgLoad = stores.bombs * (bombType?.massKg ?? 0) + stores.rockets * (rocketType?.massKg ?? 0)
  const dragAreaM2Load = stores.bombs * (bombType?.dragAreaM2 ?? 0) + stores.rockets * (rocketType?.dragAreaM2 ?? 0)
```

    Check the F6F golden trajectory and the strike pins after this change.
    They must be bit-identical, because the arithmetic for a nonzero count is
    unchanged.
- [ ] **Step 3: The content.** In `f4f-wildcat.json`:
  - **`stores`:** set `"rails": []` and delete the `hvar` entry from
    `stores.types`. Record R3 in `stores.source` as a gameplay choice: the
    real F4F-4 carried 100 to 250 lb bombs or 58-gal drop tanks.
  - **`combat.guns`:** six guns, `rounds: 240` each ([DS] 104c; [SAC] p.1;
    [SAC]'s drawing says 1,400, and 1,440 is preferred). The positions are
    re-measured on the drawn wing, three per side:
    - Slice the wing with `sectionAtFor('wildcat')` at the three gun stations.
      The stations are the old |z| values (3.0, 3.4, 3.8), scaled by
      11.582/13.06, giving 2.66, 3.02 and 3.37.
    - Place each gun at 40% chord and at mid-thickness, which is the lower
      skin plus half the local depth.
    - Record the method in `combat.source`.
  - **`combat.zones`:** refit to the drawn airframe:
    - `engine`: centered on the cowling. Its x range comes from the `Helice`
      hub to the firewall, which is the cowling mesh's aft bound.
    - `fuel`: the fuselage between the wing spars.
    - `tail` and `rudder`: inside the fuselage and fin bounds.
    - The guns and ailerons at the measured wing stations.
    - HP and damage fields stay unchanged, as ESTIMATES.
- [ ] **Step 4: Write `tests/tools/models/combatFit.test.ts`.**
  - For every spec with `combat`, every zone's box (`center ± halfSize`) and
    every gun `position` must lie inside the drawn airframe's bounds, the
    `Prop` node excluded. Read the points the way `stance.test.ts` does,
    wildcat matrix and stretch included.
  - The allowlist, measured 2026-09-28 (see "Measured before"):

```ts
const KNOWN_OVERSHOOT_M: Readonly<Record<string, number>> = {
  'f6f-hellcat/engine': 1.53, 'f6f-hellcat/rudder': 0.2,
  'a6m2-zero/engine': 1.83, 'a6m2-zero/rudder': 1.0,
}
```

  - An allowlisted zone must still overshoot. Otherwise the entry fails as
    stale, which is `aircraftRigs.test.ts`'s `THROUGH_SKIN` rule.
  - It may not overshoot by more than its recorded value plus 0.01 m.
  - The Wildcat has no allowlist entry.
- [ ] **Step 5: Run and fix pins.**

```bash
npx vitest run --maxWorkers=2 tests/tools/models tests/sim/weapons tests/sim/sortie.test.ts tests/render/sortieFlow.test.ts tests/render/wildcat.test.ts
```

  `wildcatMounts.test.ts`'s rail loop runs over an empty list and passes.
  Update its "covers both stores-carrying specs" test only if it breaks.
- [ ] **Step 6: Verify and commit.** `remote-run npm run verify; rc=$?`,
  then commit with "W1: the F4F-4's guns, zones and a racks-only loadout (no
  rockets, R3)".

### Task 5: Tier 2, captures, the runbook and the handoff

**Files:**
- Modify: `tests/e2e/sortie.spec.ts`, `tests/e2e/wildcat.spec.ts`
- Create: `docs/aircraft.md`, `docs/handoff/2026-09-28-w1-real-wildcat.md`, and `docs/handoff/2026-09-28-w1-shots/` (captures)
- Modify: `ASSETS.md` (the wildcat.glb row), `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 row), `README.md`

- [ ] **Step 1: Tier 2 changes.**
  - **`sortie.spec.ts`:** after `startGame(page, { aircraft: 'Wildcat' })`'s
    forms step, assert that the Ordnance Requisition radiogroup offers exactly
    `Clean (recommended)` and `Bombs`.
  - **`wildcat.spec.ts`:** add a parked check. Quick-launch `free-flight` with
    `aircraft: 'f4f-wildcat'`, wait for terrain, then assert:
    - `supportedContact()` is true;
    - `validationErrors` is empty;
    - `playerModel()` is `'wildcat'`.
- [ ] **Step 2: Run Tier 2** on nexus's 680M against the worktree's dev
  server (see Global Constraints):

```bash
PW_BASE_URL=https://ww2airsim-2.windomlane.org sg render -c 'npx playwright test tests/e2e/wildcat.spec.ts tests/e2e/sortie.spec.ts tests/e2e/hangar.spec.ts --workers=1'
```

  Expected: all pass, with zero validation errors.
- [ ] **Step 3: The captures.** With a throwaway spec under `tests/e2e/_scratch/`
  (never committed; the orbit drag is the one in
  `tests/e2e/orbitCamera.spec.ts`), save these PNGs to
  `docs/handoff/2026-09-28-w1-shots/`:
  - the Wildcat parked at Tacloban, side-on, beside the capture of a parked
    Hellcat taken the same way;
  - the Wildcat on the Essex (`deck-quals`);
  - the Wildcat's cockpit view;
  - the Wildcat in flight at 1,000 m, gear up.

  Read each PNG. The Wildcat must sit nose-high on all three wheels and look
  visibly smaller than the Hellcat.
- [ ] **Step 4: `docs/aircraft.md`.** This is the onboarding runbook. It
  points at the documents that own each fact and does not restate them:
  - Sourcing standard: the house `source` style, with the
    SOURCED/DERIVED/FITTED/ESTIMATE labels.
  - The fit sweep: the `.superpowers/w1/sweep.mts` pattern, with its script
    body inlined as the example.
  - The `CARDS` entry.
  - The model-fit tests, in the order they fail on a new aircraft:
    `stance`, `centerPoint`, `eyePoints`, `combatFit`, `aircraftRigs`, then
    `wildcatMounts` if it has stores.
  - The Wildcat as the worked example, linking this plan and its handoff.

  Add one line to `docs/models.md` pointing at it.
- [ ] **Step 5: `ASSETS.md`, the handoff, the §15 row and the README.**
  - **`ASSETS.md`:** on the wildcat.glb row, add "modified: main gear legs
    lengthened 0.4445 m at load to Grumman's 12°20′ static ground angle (W1,
    2026-09-28)".
  - **The handoff** follows the house handoff shape: what changed, the
    measured figures with dates, the captures, open items. It carries T1's
    scope forward from the spec's out-of-scope section, verbatim in substance,
    plus the recorded model gaps (hub height, wheelbase, track).
  - **The §15 row** for W1.
  - **The README** gets a paragraph that points at §15.
- [ ] **Step 6: Verify, commit and push the branch.**

```bash
remote-run npm run verify; rc=$?; echo "rc=$rc"
git add -A && git commit -m "W1: Tier 2, captures, docs/aircraft.md, handoff"
git push -u origin worktree-w1-wildcat
```

  Then email the handoff to Mark: `python3 tools/mail-doc.py
  docs/handoff/2026-09-28-w1-real-wildcat.md "ww2airsim W1 handoff: the real
  F4F-4 Wildcat"`. Do not merge. Merging is Mark's call.

## Self-review

- **Spec coverage:**
  - §1 (flight model, cards, runbook): Tasks 1, 2 and 5.
  - §2 (scale, center, stretch, `gear.heightM`, stance, eye, racks, the
    unchanged physics): Task 3.
  - §3 (guns, zones, R3 ordnance, generic tests, Tier 2, docs): Tasks 4 and 5.
  - Out of scope (T1): carried into the handoff in Task 5.
  - The spec's hub-height sentence was corrected with this plan (2026-09-28).
- **Placeholders:** Task 3, Step 4's function body is deliberately measured
  first. The node names and axes are the step's first action, and the test
  (Step 3) fixes the required outcome in numbers. Everything else is concrete.
- **Types:**
  - `Card` and `CARDS` are defined in Task 1 and extended in Task 2.
  - `WILDCAT_OFFSET_X_M` and `WILDCAT_GEAR_STRETCH_M` are defined in Task 3
    and used by the tests in Tasks 3 and 4.
  - `storesSpec`'s signature is unchanged.
- **Review Focus:** each line has a test in its owning task: 1 and 2 in Task
  1, 3 in Task 4, 4 in Task 3, 5 in Task 4.
