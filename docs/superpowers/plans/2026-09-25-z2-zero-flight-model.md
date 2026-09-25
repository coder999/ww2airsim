# Z2: the A6M Zero's flight model and armament, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sim a graded A6M2 Model 21 flight model (`content/aircraft/a6m2-zero.json`), the Zero's two tactical facts as generic optional content terms, and per-gun ballistics, all headless. The F6F stays bit-identical.

**Architecture:** Every new behavior is an optional content field that no existing aircraft sets: reference tables by altitude, `rates.controlFadeByEasMps`, `engine.negativeGCutout`, `combat.gunTypes` and `guns[].type`. The code reads each field through one small pure function (`controlFade`, `engineCutOut`, `gunBallistics`, `isPrimaryGun`), and an absent field returns the old value exactly. The Zero's cards live in `tests/sim/testcards/a6m.test.ts`, beside `f6f.test.ts`, and use the same `tools/testcards/measure.ts` harness. A test-only scenario fixture flies an AI Zero against the scripted player, for 7c to build on.

**Tech Stack:** TypeScript (strict), Zod content schemas, vitest, `tsx` for scratch probes.

**Spec:** `docs/superpowers/specs/2026-09-25-a6m-zero-design.md` (approved by Mark 2026-09-25; this plan is its §11 "Z2"). It draws on §4, §5, §9 and §10. Read §4 and §5 before starting.

**Where:** the worktree `/home/mark/projects/ww2airsim/.claude/worktrees/combat-track`, branch `worktree-combat-track`. That is the combat track, and Mark set its order: gunnery fix, then Z2, then 7c, 7e, 7f, 7g. Do not switch branches, and do not push.

## Global Constraints

- `npm run verify` ends every task with `rc=0`. Capture the status directly (`npm run verify; rc=$?; echo "rc=$rc"`). Never gate on a grepped pipeline.
- **The F6F is bit-identical.** `content/aircraft/f6f-hellcat.json` and `content/aircraft/f4f-wildcat.json` are not edited by this plan. Every new field is optional. With the field absent, the code produces the same IEEE-754 bits as before (spec §4.3 item 8).
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library (`.dependency-cruiser.cjs`).
- Every aircraft schema object stays `.strict()`, so an unknown key still fails at load.
- Tolerances on graded cards start wide and only ever tighten. Never widen one to make a red card pass. Each card's comment records the measurement it was set from, with the date and how it was measured.
- A figure is either sourced (the `source` string names the document and the date it was read) or labeled an ESTIMATE in capitals, as `f6f-hellcat.json` does.
- US spelling in new prose and identifiers. Escape `|` as `\|` inside markdown table cells.
- No Tier 2. This plan changes no render code, and the Zero appears in no shipped scenario. Do not start dev servers.
- Scratch probes live under `.superpowers/` (gitignored; confirm with `git check-ignore -v <path>`). Never commit a probe.
- End each commit message with the Co-Authored-By trailer your session's instructions specify. Put no AI model names in commit bodies or docs.
- Ownership (spec §10): this plan owns `src/sim/flight/schema.ts`, `src/sim/flight/model.ts`, `src/sim/weapons/schema.ts`, `src/sim/weapons/combat.ts`, `src/sim/weapons/harmonization.ts`, `src/sim/damage/model.ts` and the `a6m2-zero` content. It edits nothing under `src/sim/ai/**`, `src/render/**`, `tools/models/**`, `src/sim/scenario.ts` or `content/scenarios/**`.

## Shared files, overlap and merge order

Z1 (model pipeline), H1 (Hangar) and M1 (missions engine) are being planned in parallel, and this plan cannot see them. What Z2 touches that anyone else might:

| File | Z2's change | Who else | Overlap |
| --- | --- | --- | --- |
| `src/sim/flight/schema.ts` | optional keys in `reference`, `rates`, `engine` | Z1 adds required `view.model` in the `view` block | textual, different blocks |
| `tests/sim/flight/schema.test.ts` | new `describe` blocks at the end | Z1 adds `model` to the `valid` fixture's `view` | textual |
| `content/aircraft/a6m2-zero.json` (new) | the whole file | Z1's registry-coverage test reads every aircraft file | **semantic, see below** |
| `src/sim/weapons/combat.ts` | firing loop and hit resolution only | 7e (side-aware kill credit in `creditAircraftDamage`) | textual; 7e runs after Z2 |
| `tests/sim/gunneryBot.ts` | two additive `BotRun` fields | 7c | textual; 7c runs after Z2 |
| `tests/sim/testcards/f6f.test.ts` | one non-null assertion on `takeoffDistanceM` | none known | none |
| `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` | §5 amendment and a §15 row | every plan edits §15 | textual |
| `README.md` | one status paragraph | every plan | textual |

**Not touched:** `src/sim/scenario.ts`, `content/scenarios/*`, `tests/build/dist.test.ts`, anything under `src/render/`. `zero-range.json` and its title entry are Z3's. The new scenario file is a test fixture under `tests/fixtures/scenarios/`, which nothing ships.

**`view.model` (the semantic overlap).** The spec says Z2 sets `view.model` to `"a6m2-zero"`, or to `"wildcat"` if Z2 merges first. The second half cannot work: until Z1 lands, `view` is `.strict()` and has no `model` key, so the file would fail to load. So:

- **If Z2 reaches `main` before Z1:** `a6m2-zero.json` carries no `view.model`. Z1's executor must add `"model": "wildcat"` to it when Z1 merges. Z1's registry-coverage test ("every `content/aircraft/*.json` names a registered model") fails loudly until it does. The Z2 handoff says so in its first paragraph.
- **If Z1 is on `main` first:** merge `main` into this branch before Task 8. Add `"model"` to the Zero's `view` block: `"a6m2-zero"` if Z1's registry already registers that id, otherwise `"wildcat"`, which Z3 flips. Run `npm run verify` and record which value you chose in the handoff.

**Merge order.** Z2 has no code dependency on Z1, H1 or M1 in either direction. Merge in whichever order they finish. The only required action is the `view.model` rule above. On every merge, re-diff `combat.ts` and `schema.ts` against `HEAD`.

## Review Focus

These are the five inputs the spec implies but no card grades. Each has a test in the task that owns the code.

1. **A Zero at zero lift keeps its engine.** When the airplane is parked, or at q = 0, its lift is exactly 0, and the cutout must not fire (`liftN < 0`, strictly). Otherwise a Zero could never take off. Task 4.
2. **Controls fade by equivalent airspeed, not true airspeed.** At 6,000 m and 150 m/s true, the Zero has more authority than at sea level at 150 m/s, because the sources quote indicated airspeed. Task 3.
3. **A mixed battery's gunsight does not average a cannon into the machine-gun aim point.** The default harmonization uses only the primary-ballistic guns. The F6F's default is unchanged (all six). Tasks 5 and 6.
4. **A typo in the new content fails at load.** Examples: an unknown `guns[].type`, a fade table whose fraction rises with speed, and a battery whose top-level ballistic matches no mount. Tasks 3 and 5.
5. **The cannon run dry first.** At 520 rpm, 60 rounds last 6.9 s. After that the 7.7 mm guns keep firing, and the summed ammunition count stays correct. Task 6.

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/sim/math/piecewise.ts` | create | `piecewiseLinear`: one clamped lookup that the power curve and the control fade share |
| `src/sim/flight/schema.ts` | modify | optional `reference.takeoffDistanceM`, `topSpeedByAltitudeM`, `climbRateByAltitudeM`, `rates.controlFadeByEasMps`, `engine.negativeGCutout` |
| `src/sim/flight/model.ts` | modify | `equivalentAirspeedMps`, `controlFade` (applied in `ratesFromDynamicPressure`), `engineCutOut` (applied to `thrustN` in `step`); `powerFractionAt` delegates to `piecewiseLinear` |
| `src/sim/weapons/schema.ts` | modify | `GunTypeSchema`, optional `gunTypes`, optional `guns[].type`, two cross-field refinements |
| `src/sim/weapons/gunTypes.ts` | create | `gunBallistics(combat, type)` and `isPrimaryGun(combat, gun)` |
| `src/sim/weapons/combat.ts` | modify | per-mount cadence and muzzle velocity, `Projectile.gunType`, per-round drag and `hitScale` |
| `src/sim/weapons/harmonization.ts` | modify | per-gun ballistics; default reference guns = the primary guns |
| `src/sim/damage/model.ts` | modify | `damageFromHit(..., hitScale = 1)` |
| `content/aircraft/a6m2-zero.json` | create | the A6M2 Model 21 |
| `tests/sim/testcards/a6m.test.ts` | create | cards 1-6 (Task 2), fade and roll cards (Task 3), matchup cards (Task 7) |
| `tests/sim/math/piecewise.test.ts`, `tests/sim/flight/controlFade.test.ts`, `tests/sim/flight/negativeG.test.ts`, `tests/sim/weapons/gunTypes.test.ts`, `tests/sim/weapons/a6mArmament.test.ts`, `tests/sim/zeroMerge.test.ts` | create | tests named in each task |
| `tests/fixtures/scenarios/zero-merge.json` | create | head-on merge with an AI Zero; test-only |
| `tests/sim/gunneryBot.ts` | modify | `BotRun.opponentShots`, `opponentHits` |
| `tests/sim/flight/schema.test.ts`, `tests/sim/weapons/harmonization.test.ts`, `tests/sim/testcards/f6f.test.ts` | modify | as named in each task |

## Measured before writing this plan (2026-09-25, node v22.22.1, this worktree)

These are claims to re-check, not premises. Task 2 re-runs every one. (Re-run once already at plan review, 2026-09-25: a probe fed the Task 2 JSON through `measure.ts` and reproduced every speed, climb, stall, roll and take-off figure below to the printed digit, both digests, and the draft zero-merge result.)

- **The spec's §4.2 probe reproduces exactly:** cd0 0.0195, η 0.75 gives 144.85 m/s at 4,877 m and 17.50 m/s sea-level climb.
- **But that baseline fails the spec's own cards,** which the §4.2 probe never graded. Sea-level climb reads +25.3%, against a tolerance of 25%. Climb at 4,572, 6,096 and 9,144 m reads +44.2%, +55.7% and +63.1%, against 30%.
  - The cause: the model has one power curve and no ram-air term. The trial's 16,000 ft critical altitude is a level-flight figure, where ram holds manifold pressure higher than in a slow climb.
  - A curve flat to 4,877 m therefore gives the climb too much power at altitude.
- **A sweep of 208 combinations found a fit where every card is green:**
  - The fit: cd0 0.017, η 0.68, and a power curve flat to 3,000 m, falling to 0.92 at 4,877 m, then scaled by 0.92 above that.
  - Top speed, in % from the trial at SL / 5k / 10k / 16k / 20k / 25k / 30k ft: +3.51 / +2.17 / +0.94 / -2.50 / -2.13 / -2.35 / -3.70.
  - Climb, in % at SL / 15k / 20k / 30k ft: +15.72 / +18.17 / +22.41 / +17.57. The F6F's own climb bias is +16.77%, so the two airplanes now share that bias.
  - The sourced sea-level climb order holds: the Zero's 2,750 ft/min beats the F6F's 2,660, and the model reads 16.17 against 15.78 m/s.
- **Stall:** 35.765 m/s clean (+2.57%) and 31.585 m/s with full flaps (+2.38%). The CLmax ratio is 1.2822, against the derived 1.2779.
- **Take-off roll at full flaps:** the Zero is 168.17 m at 75 mph and the F6F 236.08 m at 86.5 mph.
- **Roll:** the Zero reads 79.996 deg/s at its 95 m/s reference speed. At 90 m/s it reads 75.786 and the F6F 69.901. At 150 m/s the F6F reads 79.996.
- **The F6F versus a draft Zero at a head-on merge** (the gunnery bot, 8 noise cursors, with no fade, cutout or gun types yet): a firing chance at 8.6 s in 8/8 runs, and 6/8 kills, each at 8 hits.
- **Baseline digests for the bit-identity checks** (Tasks 3, 4 and 5):
  - F6F golden trajectory JSON, sha256 `d1fe050392928fd61d0d11e74d71111467337a4bda82cbc2b2f7803c5f174e1e`
  - F6F 3 s tail-chase combat state, sha256 `66765241c03703385bf44e676e5f619dd70a356934eb3af42ad32d23fc24f1fb` (240 shots, 12 hits, target destroyed, 73 rounds in flight)
- **Figures read on 2026-09-25 that differ from the spec's "about" values:**
  - English Wikipedia, "Type 97 aircraft machine gun": 900 rpm, but **600-700 rpm synchronized**, and the cowl guns are synchronized; 745 m/s; 6.9 g bullet.
  - "Type 99 cannon": Model 1 **520 rpm**, 600 m/s, 127-132 g shell.
  - "Mitsubishi A6M Zero", A6M2 Model 21 specifications: never-exceed speed **600 km/h**.
  - This plan uses 650, 520 and 166.67 m/s.

---

### Task 1: Optional reference fields

**Files:**
- Modify: `src/sim/flight/schema.ts:15-20` (a new helper after `fraction`), `:368-374` (the `reference` block)
- Modify: `tests/sim/testcards/f6f.test.ts:232`
- Test: `tests/sim/flight/schema.test.ts` (append)

**Interfaces:**
- Produces: `AircraftSpec['reference']` gains `takeoffDistanceM?: number`, `topSpeedByAltitudeM?: [number, number][]` and `climbRateByAltitudeM?: [number, number][]`. Each pair is `[altitudeM, value]`, with the altitude strictly increasing.

- [ ] **Step 1: Write the failing tests.** Append to `tests/sim/flight/schema.test.ts`:

```ts
describe('optional reference tables (A6M plan Z2)', () => {
  const withReference = (reference: Record<string, unknown>) => ({ ...valid, reference })

  it('accepts a spec whose trial gives no take-off distance', () => {
    const reference: Record<string, unknown> = { ...valid.reference }
    delete reference['takeoffDistanceM']
    expect(parseAircraftSpec(withReference(reference)).reference.takeoffDistanceM).toBeUndefined()
  })

  it('accepts level speed and climb tables by altitude', () => {
    const spec = parseAircraftSpec(withReference({
      ...valid.reference,
      topSpeedByAltitudeM: [[0, 120.7], [1524, 128.3]],
      climbRateByAltitudeM: [[4572, 12.09]],
    }))
    expect(spec.reference.topSpeedByAltitudeM).toEqual([[0, 120.7], [1524, 128.3]])
    expect(spec.reference.climbRateByAltitudeM).toEqual([[4572, 12.09]])
  })

  it('rejects a table whose altitudes do not strictly increase', () => {
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, topSpeedByAltitudeM: [[1524, 128], [1524, 130]] })))
      .toThrow(/topSpeedByAltitudeM.*strictly increase/)
  })

  it('rejects a negative altitude, a non-positive value, and an empty table', () => {
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, climbRateByAltitudeM: [[-1, 12]] }))).toThrow(/climbRateByAltitudeM/)
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, climbRateByAltitudeM: [[0, 0]] }))).toThrow(/climbRateByAltitudeM/)
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, climbRateByAltitudeM: [] }))).toThrow(/climbRateByAltitudeM/)
  })

  it('stays strict: a misspelled table name still fails', () => {
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, topSpeedByAltitude: [[0, 120]] }))).toThrow(/topSpeedByAltitude/)
  })

  it('the real F6F still carries its sourced take-off distance', () => {
    expect(loadAircraftSpec('f6f-hellcat').reference.takeoffDistanceM).toBe(230.124)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/flight/schema.test.ts`
Expected: FAIL. The no-take-off-distance test fails on the missing `takeoffDistanceM`, and the table tests fail on unrecognized keys.

- [ ] **Step 3: Implement.** In `src/sim/flight/schema.ts`, directly after the `fraction` line (line 20), add:

```ts
/** `[altitudeM, value]` rows copied from a trial table: altitude at or above
 *  sea level and strictly increasing, value positive. */
const altitudeTable = z
  .array(z.tuple([finite.refine((n) => n >= 0, { message: 'altitude must be at or above sea level' }), positive]))
  .min(1)
  .refine((rows) => rows.every((r, i) => i === 0 || r[0] > rows[i - 1]![0]), {
    message: 'altitudes must strictly increase',
  })
```

Replace the `takeoffDistanceM` entry in the `reference` block (lines 369-373, with its doc comment) with:

```ts
    /** Ground-roll distance the cited trial measured for take-off, metres.
     *  OPTIONAL since the A6M plan (Z2, 2026-09-25): the Zero's primary
     *  sources say only "Take-off is very rapid", so it carries no figure and
     *  gets a direction card against the F6F instead. The F6F keeps its
     *  sourced value and its card; see the tolerance comment on that card in
     *  f6f.test.ts. */
    takeoffDistanceM: positive.optional(),
    /** Level top speed, m/s, at further altitudes from the SAME trial table
     *  as `topSpeedMps`. Graded by that aircraft's own card file. Optional:
     *  the F6F's Patuxent table is graded at its critical altitude only. */
    topSpeedByAltitudeM: altitudeTable.optional(),
    /** Rate of climb, m/s, at further altitudes from the same trial table as
     *  `climbRateMps`. Optional, for the same reason. */
    climbRateByAltitudeM: altitudeTable.optional(),
```

In `tests/sim/testcards/f6f.test.ts:232`, change `ref.takeoffDistanceM` to `ref.takeoffDistanceM!`, and add this comment on the line above the `it`: `// Non-null: optional since Z2 (the A6M has no sourced figure); schema.test.ts pins that the F6F still carries 230.124 m.`

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npx vitest run tests/sim/flight/schema.test.ts tests/sim/testcards/f6f.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # must print rc=0
git add src/sim/flight/schema.ts tests/sim/flight/schema.test.ts tests/sim/testcards/f6f.test.ts
git commit -m "Aircraft schema: optional take-off distance, speed and climb tables by altitude"
```

---

### Task 2: `a6m2-zero.json` and its graded cards

**Files:**
- Create: `content/aircraft/a6m2-zero.json`
- Create: `tests/sim/testcards/a6m.test.ts`

**Interfaces:**
- Consumes: Task 1's optional reference tables; `measureTopSpeed`, `measureClimbRate`, `measureStallSpeed`, `measureRollRate` and `measureTakeoffRun` from `tools/testcards/measure.ts`; `loadAircraftSpec('a6m2-zero')`.
- Produces: the content id `a6m2-zero`, with `role: "fighter"`, no `combat` (Task 6 adds it), no `stores` and no `view.model` (see "view.model" above).

- [ ] **Step 1: Write the failing card file** `tests/sim/testcards/a6m.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import {
  measureTopSpeed,
  measureClimbRate,
  measureStallSpeed,
  measureRollRate,
} from '../../../tools/testcards/measure.js'

const zero = loadAircraftSpec('a6m2-zero')
const ref = zero.reference

/** Never widen to make a red card pass (f6f.test.ts's rule). Every
 *  tolerance below was set from the measurement in its comment. */
const within = (actual: number, expected: number, tol: number) => {
  const err = Math.abs(actual - expected) / expected
  return { pass: err <= tol, err, actual, expected }
}
const pct = (r: { err: number }) => `${(r.err * 100).toFixed(2)}% off`

const climbSeaLevel = measureClimbRate(zero, 0)

describe('A6M2 Model 21 flight test card (Informational Intelligence Summary No. 85, calibrated table)', () => {
  it('is graded at the trial weight, 5,555 lb, with no take-off distance of its own', () => {
    expect(ref.testMassKg).toBe(2519.71)
    expect(ref.takeoffDistanceM).toBeUndefined()
    expect(ref.topSpeedByAltitudeM).toHaveLength(6)
    expect(ref.climbRateByAltitudeM).toHaveLength(3)
    // The table prints "10,000" twice; the asterisked row is the 16,000 ft
    // critical altitude (spec §4.1). The source string must say so.
    expect(ref.source).toMatch(/16,000/)
  })

  // Measured 2026-09-25 (plan probe): 142.10 m/s against 145.74, -2.50%.
  // 5% is 2x the measurement, tighter than the spec's 15% starting point.
  it('reaches its top speed at the 16,000 ft critical altitude', () => {
    const r = within(measureTopSpeed(zero, ref.topSpeedAltitudeM), ref.topSpeedMps, 0.05)
    expect(r.pass, `top speed ${r.actual.toFixed(2)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  // Measured 2026-09-25: SL +3.51%, 5k +2.17%, 10k +0.94%, 20k -2.13%,
  // 25k -2.35%, 30k -3.70%. Spec §4.3 item 2's 5% each; worst is 1.35x under it.
  it.each(zero.reference.topSpeedByAltitudeM ?? [])('reaches its trial speed at %d m', (altitudeM, speedMps) => {
    const r = within(measureTopSpeed(zero, altitudeM), speedMps, 0.05)
    expect(r.pass, `top speed at ${altitudeM} m ${r.actual.toFixed(2)} vs ${speedMps} (${pct(r)})`).toBe(true)
  })

  // Measured 2026-09-25: 16.166 m/s against 13.97, +15.72%. The F6F reads
  // +16.77% on the same harness: the model's known climb bias, shared.
  // 25% is the F6F's tolerance (spec §4.3 item 3).
  it('climbs at its sea-level rate', () => {
    const r = within(climbSeaLevel, ref.climbRateMps, 0.25)
    expect(r.pass, `climb ${r.actual.toFixed(3)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  // Measured 2026-09-25: 15k +18.17%, 20k +22.41%, 30k +17.57%. 30% is the
  // spec's figure. The spec's §4.2 baseline (cd0 0.0195, eta 0.75, curve flat
  // to 4,877 m) read +44.2 / +55.7 / +63.1% here: the power curve is shared
  // by level flight (with ram) and the climb (without), and is fitted to both.
  it.each(zero.reference.climbRateByAltitudeM ?? [])('climbs at its trial rate at %d m', (altitudeM, rateMps) => {
    const r = within(measureClimbRate(zero, altitudeM), rateMps, 0.3)
    expect(r.pass, `climb at ${altitudeM} m ${r.actual.toFixed(3)} vs ${rateMps} (${pct(r)})`).toBe(true)
  })

  it('climbs more slowly at each higher altitude in its table', () => {
    const rates = [climbSeaLevel, ...(ref.climbRateByAltitudeM ?? []).map(([a]) => measureClimbRate(zero, a))]
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeLessThan(rates[i - 1]!)
  })

  // Measured 2026-09-25: 35.765 clean (+2.57%), 31.585 flaps (+2.38%).
  // 20% each, the F6F's (spec §4.3 item 5).
  it('stalls near its clean, power-off stall speed', () => {
    const r = within(measureStallSpeed(zero, 0, 0), ref.stallSpeedMps, 0.2)
    expect(r.pass, `stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it('stalls near its gear-and-flaps-down stall speed', () => {
    const r = within(measureStallSpeed(zero, 0, 1), ref.stallSpeedFlapMps, 0.2)
    expect(r.pass, `flap stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  // (78/69)^2 = 1.2779 is the CLmax ratio the two sourced stalls imply.
  // Measured 2026-09-25: 1.2822.
  it('stalls slower with flaps by about the derived CLmax ratio', () => {
    const clean = measureStallSpeed(zero, 0, 0)
    const flapped = measureStallSpeed(zero, 0, 1)
    expect(flapped).toBeLessThan(clean)
    expect((clean / flapped) ** 2).toBeCloseTo(1.2779, 1)
  })

  // An unsourced estimate graded against itself, as the F6F's is. Measured
  // 2026-09-25: 79.996 deg/s at 95 m/s.
  it('rolls at its estimated rate at the reference speed', () => {
    const r = within(measureRollRate(zero, 0, zero.rates.rateRefSpeedMps), ref.rollRateDegPerSec, 0.15)
    expect(r.pass, `roll ${r.actual.toFixed(3)} deg/s vs ${r.expected}`).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run tests/sim/testcards/a6m.test.ts`
Expected: FAIL with `Failed to read aircraft content file for id "a6m2-zero"`.

- [ ] **Step 3: Write `content/aircraft/a6m2-zero.json`.**

Before writing the `source` strings, re-read the secondary figures (span, wing area, empty and maximum weight, engine power, never-exceed speed) from the English Wikipedia article "Mitsubishi A6M Zero", section "Specifications (A6M2 Type 0 Model 21)". If any figure differs from the values below, stop and report it. Do not silently change the value. Then write the file with the date you read it:

```json
{
  "id": "a6m2-zero",
  "name": "Mitsubishi A6M2 Model 21 Zero",
  "role": "fighter",
  "geometry": { "wingAreaM2": 22.44, "wingSpanM": 12.0 },
  "mass": { "emptyKg": 1680, "fuelCapacityKg": 395, "maxTakeoffKg": 2796 },
  "aero": {
    "clSlopePerRad": 4.8055,
    "clMax": 1.4,
    "alphaCritDeg": 15.5,
    "clAtZeroAlpha": 0.1,
    "cySlopePerRad": 2.0,
    "cd0": 0.017,
    "oswaldE": 0.85
  },
  "engine": {
    "maxPowerW": 701000,
    "propEfficiency": 0.68,
    "staticThrustN": 9400,
    "windmillCd0": 0.034,
    "powerFractionByAltitudeM": [[0, 1.0], [3000, 1.0], [4877, 0.92], [6096, 0.8], [7620, 0.66], [9144, 0.53], [11700, 0.37]]
  },
  "rates": {
    "maxRollRateDegPerSec": 80,
    "maxPitchRateDegPerSec": 30,
    "maxYawRateDegPerSec": 15,
    "rateRefSpeedMps": 95,
    "weathercockSeconds": 1.5,
    "autoRudderGainPerDeg": 0.1,
    "stallLimiterSeconds": 0.15
  },
  "limits": { "diveSpeedMps": 166.67, "gLimit": 7.0 },
  "gear": {
    "travelSeconds": 10,
    "dragAreaM2": 0.22,
    "rollingResistanceCoeff": 0.02,
    "brakingResistanceCoeff": 0.4,
    "tailUpSpeedMps": 15,
    "tailwheelYawRateDegPerSec": 5,
    "lateralGripSeconds": 1.5,
    "heightM": 2.48
  },
  "flap": { "travelSeconds": 5, "dragAreaM2": 0.43, "clIncrement": 0.389 },
  "reference": {
    "source": "Primary: USAAF Intelligence Service, Informational Intelligence Summary No. 85, December 1942, 'Flight Characteristics of the Japanese Zero Fighter' (wwiiaircraftperformance.org/japan/intelsum85-dec42.pdf), US Navy trials at San Diego of the captured 'Type Zero Mark I, Carrier Fighter, Model 2', calibrated performance table, gross weight 5,555 lb 'with a full military load' = testMassKg 2519.71. topSpeedMps = 326 mph at the CRITICAL ALTITUDE OF 16,000 FT: the table prints '10,000' twice, and the second, asterisked row is a typo for 16,000 -- the AAF Materiel Command memo of 23 Oct 1942 (a6m2-oct2342.pdf) puts the critical altitude at 16,000 ft, as does the Eglin conclusion ('maximum manifold pressure can be maintained from sea level to sixteen-thousand (16,000) feet'). topSpeedByAltitudeM = the same table's SL 270, 5k 287, 10k 305, 20k 321.5, 25k 315, 30k 306 mph. climbRateMps = 2,750 ft/min at sea level; climbRateByAltitudeM = 15k 2,380, 20k 1,810, 30k 850 ft/min. stallSpeedMps = 78 mph IAS clean, power off; stallSpeedFlapMps = 69 mph IAS gear and flaps down, power off; indicated airspeed, the same treatment as the F6F. No take-off distance is given ('Take-off is very rapid'), so takeoffDistanceM is absent and the Zero is graded by a direction card against the F6F instead (take-off speed 75 mph IAS, Wright Field Memorandum Report ENG-47-1673-A, 24 Nov 1943). gear.travelSeconds = 10 is SOURCED: ENG-47-1673-A, the gear retracts 'in about 10 seconds'. The tailwheel is non-steerable (Summary 85; ENG-47-1673-A): the schema requires a positive tailwheelYawRateDegPerSec, so 5 deg/s stands in for brake steering, an ESTIMATE. rollRateDegPerSec = 80 is an UNSOURCED ESTIMATE, the same status as the F6F's; no trial reports a number, only that 'the rate of roll at speeds under 250 M.P.H. is quite rapid' (ENG-47-1673-A). rates.rateRefSpeedMps = 95 is an ESTIMATE, lower than the F6F's 103 so the Zero reaches full control authority at a lower speed, which is the direction the trial reports describe at low speed. maxPitchRateDegPerSec, maxYawRateDegPerSec, weathercockSeconds, autoRudderGainPerDeg and stallLimiterSeconds are the F6F's values, ESTIMATES carried over so the two airplanes differ only where a source says they do. Secondary, read <READ-DATE> from English Wikipedia 'Mitsubishi A6M Zero', Specifications (A6M2 Type 0 Model 21), which cites The Great Book of Fighters and Aircraft Profile #129: span 12.0 m, wing area 22.44 sq m, empty 1,680 kg, maximum take-off 2,796 kg, Nakajima Sakae 12 of 700 kW (940 hp) for take-off (Summary 85 itself says 'estimated 900 H.P. at sixteen-thousand (16,000) feet'), never-exceed speed 600 km/h = limits.diveSpeedMps 166.67. limits.gLimit = 7.0 is an ESTIMATE; no source located states the design load factor. mass.fuelCapacityKg = 395: internal fuel 145 US gal (2 x 54 + 37, Summary 85) = 548.9 L at 0.72 kg/L; the belly tank is not carried. Internal fuel below testMassKg - emptyKg = 839.71 kg is expected: the harness loads pilot, oil and ammunition through fuelKg too (Ruling R31). aero.cySlopePerRad = 2.0 is Mark's arcade number on the F6F, kept identical so the two feel alike under rudder; see f6f-hellcat.json's source for its history. clSlopePerRad, clMax, alphaCritDeg, clAtZeroAlpha and oswaldE are the F6F's shipped lift curve, ESTIMATES for this airframe. FITTED, NOT SOURCED (measured 2026-09-25 by the Z2 plan's sweep through tools/testcards/measure.ts at testMassKg): cd0 0.017, propEfficiency 0.68 and the power curve (flat to 3,000 m, 0.92 at 4,877 m, the upper points scaled by 0.92). The model has one power curve and no ram-air term; the trial's 16,000 ft critical altitude is a level-flight figure where ram holds manifold pressure up, and a curve flat to 4,877 m over-reads the climb at 15-30k ft by 44-63%. This fit trades a curve that falls early for a speed profile within 3.7% at every tabulated altitude and a climb within 22.4%, the climb bias sitting at the F6F's own +16.8% at sea level. staticThrustN = 9,400 N is the F6F's 20,000 N scaled by power (701/1491), an ESTIMATE. windmillCd0 = 2 x cd0, the F6F's rule. flap.clIncrement = 0.389 is DERIVED, as the F6F's is: (78/69)^2 = 1.2779 is the CLmax ratio the two sourced stalls imply, the shipped lift curve peaks at 1.400013, and 1.400013 x 0.2779 = 0.389. flap.dragAreaM2 = 0.43 and gear.dragAreaM2 = 0.22 are the F6F's estimates scaled by wing area (22.44/31.03); flap.travelSeconds = 5 is the F6F's estimate. gear.heightM = 2.48 is DERIVED from the chosen mesh (A6M Zero spec §2, 2026-09-25): hub y 129.2 to wheel contact y -1.71 source units at 0.01898 m per unit, with the thrust line level in the model's sitting pose. Z3 re-measures it from the built LOD0 mesh and re-runs the cards in the same commit. view.eyePointM = [-0.4, 0.85, 0] is an ESTIMATE, re-measured by Z3.",
    "testMassKg": 2519.71,
    "topSpeedMps": 145.74,
    "topSpeedAltitudeM": 4876.8,
    "topSpeedByAltitudeM": [[0, 120.7], [1524, 128.3], [3048, 136.35], [6096, 143.72], [7620, 140.82], [9144, 136.79]],
    "climbRateMps": 13.97,
    "climbRateByAltitudeM": [[4572, 12.09], [6096, 9.19], [9144, 4.32]],
    "stallSpeedMps": 34.87,
    "stallSpeedFlapMps": 30.85,
    "rollRateDegPerSec": 80
  },
  "view": { "eyePointM": [-0.4, 0.85, 0] }
}
```

Replace `<READ-DATE>` with the date you read the article, in `YYYY-MM-DD` form. Then run `grep -c "READ-DATE" content/aircraft/a6m2-zero.json`. It must print `0`.

- [ ] **Step 4: Run the cards and record the numbers.**

Run: `npx vitest run tests/sim/testcards/a6m.test.ts; rc=$?; echo "rc=$rc"`
Expected: PASS, `rc=0`.

If a figure differs from the measurement in its card comment by more than 0.05 percentage points, update the comment with your own measurement and the date. Print the figures with a scratch probe that calls the same `measure*` functions under `.superpowers/sdd/z2/`. Do not change a tolerance.

If a card is red, stop. Do not retune. Report the card, the number, and the probe's figure for it. The fit above was measured on this exact content.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # rc=0
git add content/aircraft/a6m2-zero.json tests/sim/testcards/a6m.test.ts
git commit -m "A6M2 Zero flight model, graded against the 1942 Navy trial of a captured airframe"
```

---

### Task 3: Controls that fade with airspeed (`rates.controlFadeByEasMps`)

**Files:**
- Create: `src/sim/math/piecewise.ts`, `tests/sim/math/piecewise.test.ts`, `tests/sim/flight/controlFade.test.ts`
- Modify: `src/sim/flight/model.ts:134-145` (`powerFractionAt`), `:193-213` (`rateAuthority` stays; `ratesFromDynamicPressure` changes)
- Modify: `src/sim/flight/schema.ts` (the `rates` block, after `stallLimiterSeconds`)
- Modify: `content/aircraft/a6m2-zero.json` (`rates`, and an addition to `reference.source`)
- Modify: `tests/sim/testcards/a6m.test.ts` (append cards)

**Interfaces:**
- Produces: `piecewiseLinear(points: readonly (readonly [number, number])[], x: number): number`; `equivalentAirspeedMps(q: number): number`; `controlFade(spec: AircraftSpec, q: number): number`, all exported. `AircraftSpec['rates'].controlFadeByEasMps?: [number, number][]`.
- The weathercock keeps reading `rateAuthority` alone. The fade multiplies the pilot's commanded rates only (spec §4.4).

- [ ] **Step 1: Record the flight baseline digest.** Put this in `.superpowers/sdd/z2/flightDigest.ts` (gitignored; check with `git check-ignore -v`):

```ts
import { createHash } from 'node:crypto'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { recordTrajectory } from '../../../tools/golden/record.js'
const t = recordTrajectory(loadAircraftSpec('f6f-hellcat'))
console.log(createHash('sha256').update(JSON.stringify(t)).digest('hex'))
```

Run: `npx tsx .superpowers/sdd/z2/flightDigest.ts`
Expected: `d1fe050392928fd61d0d11e74d71111467337a4bda82cbc2b2f7803c5f174e1e` on node v22.22.1. If your node differs, record your own value in `.superpowers/sdd/z2/progress.md` before changing any code. Exact equality is a same-machine, same-node check. The committed golden stays tolerance-based (`tests/sim/golden/trajectory.test.ts` explains why).

- [ ] **Step 2: Write the failing tests.**

`tests/sim/math/piecewise.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { piecewiseLinear } from '../../../src/sim/math/piecewise.js'

const pts: [number, number][] = [[100, 1], [200, 0.5], [300, 0.2]]

describe('piecewiseLinear', () => {
  it('clamps to the end values outside the table', () => {
    expect(piecewiseLinear(pts, 0)).toBe(1)
    expect(piecewiseLinear(pts, 100)).toBe(1)
    expect(piecewiseLinear(pts, 300)).toBe(0.2)
    expect(piecewiseLinear(pts, 1e6)).toBe(0.2)
  })
  it('is exact at every anchor and linear between them', () => {
    expect(piecewiseLinear(pts, 200)).toBe(0.5)
    expect(piecewiseLinear(pts, 150)).toBeCloseTo(0.75, 12)
    expect(piecewiseLinear(pts, 250)).toBeCloseTo(0.35, 12)
  })
})
```

`tests/sim/flight/controlFade.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { densityAt } from '../../../src/sim/atmosphere.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import {
  createState, step, commandedBodyRates, controlFade, equivalentAirspeedMps, DT, type Controls,
} from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const DEG = Math.PI / 180
const FULL: Controls = { pitch: 1, roll: 1, yaw: 1, throttle: 1 }
const at = (altitudeM: number, speedMps: number) =>
  createState({ position: v3(0, altitudeM, 0), velocity: v3(speedMps, 0, 0) })
const q = (altitudeM: number, speedMps: number) => 0.5 * densityAt(altitudeM) * speedMps * speedMps

describe('rates.controlFadeByEasMps (A6M spec §4.4)', () => {
  it('is exactly 1 when absent, so the F6F commands the same bits as before', () => {
    const neutral = parseAircraftSpec({ ...f6f, rates: { ...f6f.rates, controlFadeByEasMps: [[1, 1], [1000, 1]] } })
    for (const [alt, v] of [[0, 40], [0, 103], [0, 200], [6000, 150]] as const) {
      expect(controlFade(f6f, q(alt, v))).toBe(1)
      const a = commandedBodyRates(f6f, at(alt, v), FULL)
      const b = commandedBodyRates(neutral, at(alt, v), FULL)
      expect([a.x, a.y, a.z]).toEqual([b.x, b.y, b.z])
    }
  })

  it('gives the Zero full authority up to 250 mph IAS, and 0.35 of it at 300 mph', () => {
    // toBeCloseTo, not toBe: sqrt(2q / rho0) returns 111.76 to within an ulp.
    expect(controlFade(zero, q(0, 111.76))).toBeCloseTo(1, 9)
    expect(controlFade(zero, q(0, 134.11))).toBeCloseTo(0.35, 6)
    expect(controlFade(zero, q(0, 200))).toBe(0.2)
  })

  it('fades by equivalent airspeed: the same true speed higher up keeps more authority', () => {
    const eas = equivalentAirspeedMps(q(6096, 150))
    expect(eas).toBeCloseTo(150 * Math.sqrt(densityAt(6096) / densityAt(0)), 9)
    const high = commandedBodyRates(zero, at(6096, 150), FULL).x
    const low = commandedBodyRates(zero, at(0, 150), FULL).x
    expect(high).toBeGreaterThan(low)
  })

  it('reduces the pilot\'s commanded roll, pitch and yaw together', () => {
    const r = commandedBodyRates(zero, at(0, 150), FULL)
    const f = controlFade(zero, q(0, 150))
    expect(r.x).toBeCloseTo(80 * DEG * f, 12)
    expect(r.z).toBeCloseTo(30 * DEG * f, 12)
    expect(-r.y).toBeCloseTo(15 * DEG * f, 12)
  })

  it('does not touch the weathercock: hands-off yaw from sideslip is the same with or without it', () => {
    const noFade: Record<string, unknown> = { ...zero.rates }
    delete noFade['controlFadeByEasMps']
    const bare = parseAircraftSpec({ ...zero, rates: noFade })
    const slipping = createState({
      position: v3(0, 1000, 0), velocity: v3(150, 0, 0),
      attitude: qFromAxisAngle(v3(0, 1, 0), 5 * DEG),
    })
    const hands: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    const a = step(zero, slipping, hands, { dt: DT, tick: 1 })
    const b = step(bare, slipping, hands, { dt: DT, tick: 1 })
    expect(a.bodyRates.y).toBe(b.bodyRates.y)
    expect(a.bodyRates.y).not.toBe(0)
  })

  it('rejects a table whose fraction rises with speed, or whose speeds do not increase', () => {
    expect(() => parseAircraftSpec({ ...zero, rates: { ...zero.rates, controlFadeByEasMps: [[100, 0.5], [150, 0.9]] } }))
      .toThrow(/must not rise/)
    expect(() => parseAircraftSpec({ ...zero, rates: { ...zero.rates, controlFadeByEasMps: [[150, 1], [150, 0.5]] } }))
      .toThrow(/strictly increase/)
    expect(() => parseAircraftSpec({ ...zero, rates: { ...zero.rates, controlFadeByEasMps: [[150, 0]] } }))
      .toThrow(/controlFadeByEasMps/)
  })
})
```

Append to `tests/sim/testcards/a6m.test.ts` (add `measureRollRate` to the imports if it is not already there):

```ts
describe('A6M2: controls stiffen at high speed (Eglin: "slow rate of roll of the Zero at high speeds")', () => {
  // Fraction from content: 1.0 to 111.76 m/s (250 mph), 0.35 at 134.11
  // (300 mph), 0.2 from 156.46 (350 mph). At 150 m/s that is
  // 0.35 - 0.15 * (150 - 134.11) / 22.35 = 0.24336, times 80 deg/s.
  it('rolls at 80 deg/s under 250 mph and about 19.5 deg/s at 150 m/s', () => {
    expect(measureRollRate(zero, 0, 111.76)).toBeCloseTo(80, 0)
    expect(measureRollRate(zero, 0, 150)).toBeCloseTo(80 * 0.24336, 0)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/math/piecewise.test.ts tests/sim/flight/controlFade.test.ts tests/sim/testcards/a6m.test.ts`
Expected: FAIL. `piecewise.js` does not exist, and `controlFade` is not exported.

- [ ] **Step 4: Implement.**

Create `src/sim/math/piecewise.ts`:

```ts
/**
 * Piecewise-linear lookup through `[x, y]` points, x strictly increasing,
 * clamped to the end values outside the table. The content schemas validate
 * the ordering; this does not re-check it (it is on the hot path).
 *
 * The expression is `powerFractionAt`'s, moved here unchanged so the power
 * curve and the control fade share one implementation and the power curve's
 * output is bit-identical.
 */
export function piecewiseLinear(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0]![0]) return points[0]![1]
  const last = points[points.length - 1]!
  if (x >= last[0]) return last[1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x0, y0] = points[i - 1]!
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return last[1]
}
```

In `src/sim/flight/model.ts`, add `import { piecewiseLinear } from '../math/piecewise.js'` and replace the body of `powerFractionAt` with:

```ts
function powerFractionAt(spec: AircraftSpec, altitudeM: number): number {
  return piecewiseLinear(spec.engine.powerFractionByAltitudeM, altitudeM)
}
```

After `rateAuthority`, add:

```ts
/** Equivalent airspeed, m/s: the speed that gives dynamic pressure `q` at
 *  sea-level density. What an airspeed indicator reads, less instrument and
 *  position error, which is how the Zero's sources quote their speeds. */
export function equivalentAirspeedMps(q: number): number {
  return Math.sqrt((2 * Math.max(0, q)) / densityAt(0))
}

/**
 * The share of the pilot's commanded rates that heavy controls still allow at
 * dynamic pressure `q`, from `rates.controlFadeByEasMps` (A6M spec §4.4,
 * Mark's decision 2026-09-25). Exactly 1 when the field is absent, so an
 * aircraft that does not set it commands the same bits as before.
 *
 * It exists because `rateAuthority` stays at 1 at any speed above the
 * reference speed, so nothing could make the controls heavy at high speed.
 * The Zero's trial reports say they were ("above 300 M.P.H. all maneuvers
 * become increasingly difficult", ENG-47-1673-A).
 *
 * Applied to the pilot's commands only, never to the weathercock: a heavy
 * stick does not weaken the fin.
 */
export function controlFade(spec: AircraftSpec, q: number): number {
  const fade = spec.rates.controlFadeByEasMps
  return fade === undefined ? 1 : piecewiseLinear(fade, equivalentAirspeedMps(q))
}
```

In `ratesFromDynamicPressure`, change the first line to:

```ts
  const authority = rateAuthority(spec, q) * controlFade(spec, q)
```

Leave `weathercockY`'s `const authority = rateAuthority(spec, q)` unchanged.

In `src/sim/flight/schema.ts`, in the `rates` object after `stallLimiterSeconds: positive,`, add:

```ts
    /**
     * Optional `[easMps, fraction]` table multiplying the pilot's commanded
     * roll, pitch and yaw rates -- controls that stiffen at speed. Read
     * through `controlFade` in src/sim/flight/model.ts, which says why it
     * exists. Speeds strictly increase and fractions never rise, because a
     * stick does not get lighter as the airplane goes faster.
     */
    controlFadeByEasMps: z
      .array(z.tuple([positive, fraction]))
      .min(2)
      .refine((pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1]![0]), {
        message: 'control fade speeds must strictly increase',
      })
      .refine((pts) => pts.every((p, i) => i === 0 || p[1] <= pts[i - 1]![1]), {
        message: 'control fade fractions must not rise with speed',
      })
      .optional(),
```

In `content/aircraft/a6m2-zero.json`, add to `rates`:

```json
    "controlFadeByEasMps": [[111.76, 1.0], [134.11, 0.35], [156.46, 0.2]]
```

Append to `reference.source`: ` rates.controlFadeByEasMps: the ANCHORS are sourced -- full authority to 250 mph IAS (ENG-47-1673-A: 'the rate of roll at speeds under 250 M.P.H. is quite rapid'), and 300 mph where Summary 85 says 'it is virtually impossible to reverse a turn' and both reports describe two-handed rolls -- and the FRACTIONS (0.35 at 300 mph, a floor of 0.2 from 350 mph) are ESTIMATES (A6M Zero spec §4.4).`

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `npx vitest run tests/sim/math/piecewise.test.ts tests/sim/flight/controlFade.test.ts tests/sim/testcards/a6m.test.ts tests/sim/golden; rc=$?; echo "rc=$rc"`
Expected: PASS. Every Task 2 card must still pass. The fade changes how the autopilot reaches equilibrium, but not the equilibrium itself. Re-record any card comment that moved by more than 0.05 percentage points.

- [ ] **Step 6: Check F6F bit-identity.**

Run: `npx tsx .superpowers/sdd/z2/flightDigest.ts`
Expected: the same digest as Step 1. Write both values in `progress.md`. If they differ, stop and find the change. The absent path must be exact.

- [ ] **Step 7: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/math/piecewise.ts src/sim/flight/model.ts src/sim/flight/schema.ts content/aircraft/a6m2-zero.json \
  tests/sim/math/piecewise.test.ts tests/sim/flight/controlFade.test.ts tests/sim/testcards/a6m.test.ts
git commit -m "Flight model: optional control fade with equivalent airspeed; the Zero's controls stiffen above 250 mph"
```

---

### Task 4: An engine that cuts out under negative g (`engine.negativeGCutout`)

**Files:**
- Modify: `src/sim/flight/model.ts` (a new export beside `thrustMagnitude`; the `thrustN` line in `step`, currently line 337)
- Modify: `src/sim/flight/schema.ts` (the `engine` block)
- Modify: `content/aircraft/a6m2-zero.json` (`engine`, and `reference.source`)
- Create: `tests/sim/flight/negativeG.test.ts`

**Interfaces:**
- Produces: `engineCutOut(spec: AircraftSpec, liftN: number): boolean`, exported. `AircraftSpec['engine'].negativeGCutout?: boolean`. There is no new `AircraftState` field: the cutout is stateless on purpose (spec §4.4).

- [ ] **Step 1: Write the failing test** `tests/sim/flight/negativeG.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import { liftCoefficient } from '../../../src/sim/aero.js'
import { createState, step, angleOfAttack, engineCutOut, DT, type Controls } from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const withoutCutout = parseAircraftSpec({ ...zero, engine: { ...zero.engine, negativeGCutout: false } })
const DEG = Math.PI / 180
const FULL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
/** Level velocity, nose `noseDeg` above (+) or below (-) it. */
const flying = (noseDeg: number) => createState({
  position: v3(0, 3000, 0), velocity: v3(130, 0, 0), fuelKg: 300,
  attitude: qFromAxisAngle(v3(0, 0, 1), noseDeg * DEG),
})

describe('engine.negativeGCutout (A6M spec §4.4, the float carburetor)', () => {
  it('pushed over, the Zero gets no thrust and burns no fuel', () => {
    const s0 = flying(-3)
    // Precondition, so a sign-convention slip fails here rather than passing
    // by accident: the wing really is making negative lift.
    expect(liftCoefficient(zero, angleOfAttack(s0))).toBeLessThan(0)
    const cut = step(zero, s0, FULL, { dt: DT, tick: 1 })
    const running = step(withoutCutout, s0, FULL, { dt: DT, tick: 1 })
    expect(length(cut.velocity)).toBeLessThan(length(running.velocity))
    expect(cut.fuelKg).toBe(s0.fuelKg)
    expect(running.fuelKg).toBeLessThan(s0.fuelKg)
  })

  it('under positive lift the term changes nothing, bit for bit', () => {
    const s0 = flying(3)
    expect(step(zero, s0, FULL, { dt: DT, tick: 1 })).toEqual(step(withoutCutout, s0, FULL, { dt: DT, tick: 1 }))
  })

  it('is stateless: the first positive-lift step after a long push is a normal step', () => {
    let s = flying(-3)
    for (let i = 1; i <= 60; i++) s = { ...step(zero, s, FULL, { dt: DT, tick: i }), attitude: flying(-3).attitude }
    const recovered = { ...s, attitude: qFromAxisAngle(v3(0, 0, 1), 3 * DEG) }
    // The push bent the flight path down (about -10 deg), so nose +3 is now
    // well inside positive, unstalled lift. Asserted, not assumed.
    expect(liftCoefficient(zero, angleOfAttack(recovered))).toBeGreaterThan(0)
    expect(step(zero, recovered, FULL, { dt: DT, tick: 61 })).toEqual(step(withoutCutout, recovered, FULL, { dt: DT, tick: 61 }))
  })

  it('keeps the engine at exactly zero lift: a parked Zero can still take off', () => {
    expect(engineCutOut(zero, 0)).toBe(false)
    expect(engineCutOut(zero, -1e-9)).toBe(true)
    const parked = createState({ position: v3(0, 3000, 0), fuelKg: 300 })
    const next = step(zero, parked, FULL, { dt: DT, tick: 1 })
    expect(next.velocity.x).toBeGreaterThan(0)
  })

  it('is off when absent: the F6F pushed over keeps its thrust, bit for bit with the field set false', () => {
    const f6fFalse = parseAircraftSpec({ ...f6f, engine: { ...f6f.engine, negativeGCutout: false } })
    const s0 = flying(-3)
    expect(engineCutOut(f6f, -1000)).toBe(false)
    expect(step(f6f, s0, FULL, { dt: DT, tick: 1 })).toEqual(step(f6fFalse, s0, FULL, { dt: DT, tick: 1 }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run tests/sim/flight/negativeG.test.ts`
Expected: FAIL. `engineCutOut` is not exported.

- [ ] **Step 3: Implement.** In `src/sim/flight/model.ts`, after `thrustMagnitude`, add:

```ts
/**
 * True while a float-carburetted engine is starved of fuel (A6M spec §4.4,
 * Mark's decision 2026-09-25): `engine.negativeGCutout` is set and the wing's
 * lift this step is negative. Eglin, 1942: "Inability of the Zero engine to
 * continue operating under negative acceleration."
 *
 * STRICTLY negative. Zero lift -- a parked airplane, or any q = 0 -- keeps the
 * engine running, or a Zero could never start its take-off roll.
 *
 * Stateless on purpose: no new AircraftState field, so no state migration and
 * no golden churn. The real engine sputtered and caught again over about a
 * second; a timer would model that and needs state. Windmilling-propeller
 * drag still follows the throttle, not this flag: the spec cuts thrust only.
 */
export function engineCutOut(spec: AircraftSpec, liftN: number): boolean {
  return spec.engine.negativeGCutout === true && liftN < 0
}
```

In `step`, replace

```ts
  const thrustN = thrustMagnitude(spec, air, controls.throttle)
```

with

```ts
  const thrustN = engineCutOut(spec, liftN) ? 0 : thrustMagnitude(spec, air, controls.throttle)
```

`liftN` is already computed above this line (line 312). The fuel burn at `workJ` reads `thrustN`, so a starved engine burns nothing, which is the intent.

In `src/sim/flight/schema.ts`, in the `engine` object after `windmillCd0: positive,`, add:

```ts
    /** Optional: thrust is zero while the wing's lift is negative (a float
     *  carburetor). Absent means false. See `engineCutOut` in
     *  src/sim/flight/model.ts. */
    negativeGCutout: z.boolean().optional(),
```

In `content/aircraft/a6m2-zero.json`, add `"negativeGCutout": true` to `engine`, and append to `reference.source`: ` engine.negativeGCutout is SOURCED as a behavior (Eglin conclusions, 1942: 'Inability of the Zero engine to continue operating under negative acceleration') and modeled statelessly -- thrust is zero exactly while lift is negative, with no sputter-and-recover timer (A6M Zero spec §4.4).`

- [ ] **Step 4: Run the tests, then the cards.**

Run: `npx vitest run tests/sim/flight/negativeG.test.ts tests/sim/testcards/a6m.test.ts tests/sim/golden; rc=$?; echo "rc=$rc"`
Expected: PASS, including every Zero card. The stall card flies at idle, and the others hold positive lift.

- [ ] **Step 5: Check F6F bit-identity.** Run `npx tsx .superpowers/sdd/z2/flightDigest.ts`. The output must equal the Task 3 Step 1 value. Record it.

- [ ] **Step 6: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/flight/model.ts src/sim/flight/schema.ts content/aircraft/a6m2-zero.json tests/sim/flight/negativeG.test.ts
git commit -m "Flight model: optional negative-g engine cutout; the Zero's float carburetor starves under negative lift"
```

---

### Task 5: Per-gun ballistics (`combat.gunTypes`, `guns[].type`, `hitScale`)

**Files:**
- Modify: `src/sim/weapons/schema.ts` (whole file, 34 lines)
- Create: `src/sim/weapons/gunTypes.ts`, `tests/sim/weapons/gunTypes.test.ts`
- Modify: `src/sim/weapons/combat.ts:56-61` (`Projectile`), `:486-517` (the firing loop), `:545-553` (`damageAircraftAt`), `:605-630` (the flying loop)
- Modify: `src/sim/damage/model.ts:14-25` (`damageFromHit`)
- Modify: `src/sim/weapons/harmonization.ts:59-104`
- Modify: `tests/sim/weapons/harmonization.test.ts` (append)

**Interfaces:**
- Consumes: `CombatSpec` and `GunMount = CombatSpec['guns'][number]`.
- Produces:
  - `type GunBallistics = { readonly roundsPerMinute: number; readonly muzzleVelocityMps: number; readonly dragPerM: number; readonly hitScale: number }`
  - `gunBallistics(combat: CombatSpec, type: string | undefined): GunBallistics`. An untyped mount gets the top-level fields and `hitScale: 1`; an unknown type throws.
  - `isPrimaryGun(combat: CombatSpec, gun: GunMount): boolean`. True for an untyped mount, or a typed one whose `muzzleVelocityMps` and `dragPerM` equal the top-level values.
  - `Projectile.gunType?: string`, set only for a typed mount, so an F6F round has no such key.
  - `damageFromHit(spec, before, system, tick, attacker, hitScale = 1)`.
  - `gunHarmonization`'s default reference set becomes the primary guns.
- The AI's lead keeps reading the top-level `combat.muzzleVelocityMps` (spec §5). No `src/sim/ai` file changes.

- [ ] **Step 1: Record the combat baseline digest.** Put this in `.superpowers/sdd/z2/combatDigest.ts`:

```ts
import { createHash } from 'node:crypto'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
const spec = loadAircraftSpec('f6f-hellcat')
const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
const still: Stepper = (_s, state, _c, ctx) => ({ ...state, tick: ctx.tick })
const plane = (id: string, x: number, fire: boolean): AircraftEntity => {
  const state = createState({ position: v3(x, 1000, 0) })
  return { id, spec, state, previous: state, controls: { ...controls, fire }, assistMemory: undefined, impact: null, parked: false }
}
let w = createWorldOf({ aircraft: [plane('shooter', 0, true), plane('target', 300, false)], player: 'shooter' })
for (let i = 0; i < 180; i++) w = advance(w, DT, still).world
console.log(createHash('sha256').update(JSON.stringify(w.combat)).digest('hex'))
```

Run: `npx tsx .superpowers/sdd/z2/combatDigest.ts`
Expected: `66765241c03703385bf44e676e5f619dd70a356934eb3af42ad32d23fc24f1fb` (node v22.22.1). Record it in `progress.md`.

- [ ] **Step 2: Write the failing tests.** Create `tests/sim/weapons/gunTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3, length, sub } from '../../../src/sim/math/vec3.js'
import { gunBallistics, isPrimaryGun } from '../../../src/sim/weapons/gunTypes.js'
import { damageFromHit, healthyDamage } from '../../../src/sim/damage/model.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const c = f6f.combat!
const still: Stepper = (_s, state, _c, ctx) => ({ ...state, tick: ctx.tick })
const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
const plane = (spec: AircraftSpec, id: string, x: number, fire: boolean): AircraftEntity => {
  const state = createState({ position: v3(x, 1000, 0) })
  return { id, spec, state, previous: state, controls: { ...idle, fire }, assistMemory: undefined, impact: null, parked: false }
}
const run = (shooter: AircraftSpec, target: AircraftSpec, ticks: number) => {
  let w = createWorldOf({ aircraft: [plane(shooter, 'shooter', 0, true), plane(target, 'target', 300, false)], player: 'shooter' })
  for (let i = 0; i < ticks; i++) w = advance(w, DT, still).world
  return w
}
/** The F6F with every mount typed to a type identical to its top level. */
const typedLike = (hitScale: number): AircraftSpec => parseAircraftSpec({
  ...f6f,
  combat: {
    ...c,
    gunTypes: { m2: { roundsPerMinute: c.roundsPerMinute, muzzleVelocityMps: c.muzzleVelocityMps, dragPerM: c.dragPerM, hitScale } },
    guns: c.guns.map((g) => ({ ...g, type: 'm2' })),
  },
})
/** Two slow mounts and four at the top-level ballistic. */
const mixed = parseAircraftSpec({
  ...f6f,
  combat: {
    ...c,
    gunTypes: { slow: { roundsPerMinute: 400, muzzleVelocityMps: 600, dragPerM: 0.000125, hitScale: 3 } },
    guns: c.guns.map((g, i) => (i === 0 || i === 3 ? { ...g, type: 'slow' } : g)),
  },
})

describe('combat.gunTypes: content validation', () => {
  it('rejects a mount naming a type that does not exist', () => {
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, guns: [{ ...c.guns[0]!, type: 'nope' }] } }))
      .toThrow(/gun type "nope"/)
  })
  it('rejects a misspelled key inside a type, and a non-positive hitScale', () => {
    const t = { roundsPerMinute: 500, muzzleVelocityMps: 600, dragPerM: 0.0001, hitScale: 1 }
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, gunTypes: { a: { ...t, hitscale: 2 } } } })).toThrow(/hitscale/)
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, gunTypes: { a: { ...t, hitScale: 0 } } } })).toThrow(/hitScale/)
  })
  it('requires the top-level ballistic to be at least one mount\'s, since the AI leads with it', () => {
    const t = { roundsPerMinute: 500, muzzleVelocityMps: 600, dragPerM: 0.0001, hitScale: 1 }
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, gunTypes: { a: t }, guns: c.guns.map((g) => ({ ...g, type: 'a' })) } }))
      .toThrow(/primary/)
  })
})

describe('gunBallistics and isPrimaryGun', () => {
  it('an untyped mount uses the top-level fields and hits at scale 1', () => {
    expect(gunBallistics(c, undefined)).toEqual({ roundsPerMinute: 800, muzzleVelocityMps: 883.92, dragPerM: 0.00015, hitScale: 1 })
    expect(c.guns.every((g) => isPrimaryGun(c, g))).toBe(true)
  })
  it('a typed mount uses its type; a type slower than the top level is not primary', () => {
    const m = mixed.combat!
    expect(gunBallistics(m, 'slow').muzzleVelocityMps).toBe(600)
    expect(m.guns.map((g) => isPrimaryGun(m, g))).toEqual([false, true, true, false, true, true])
    expect(() => gunBallistics(m, 'missing')).toThrow(/missing/)
  })
})

describe('per-gun firing', () => {
  it('leaves the F6F bit-identical: typing every gun to its own values changes nothing but the tag', () => {
    const plain = run(f6f, f6f, 180).combat
    const typed = run(typedLike(1), f6f, 180).combat
    const untag = (s: typeof typed) => ({
      ...s,
      projectiles: s.projectiles.map((p) => { const rest: Record<string, unknown> = { ...p }; delete rest['gunType']; return rest }),
    })
    expect(untag(typed)).toEqual(plain)
    expect(plain.projectiles.every((p) => !('gunType' in p))).toBe(true)
  })

  it('fires each mount at its own cadence and muzzle velocity', () => {
    const w = run(mixed, f6f, 60)
    const guns = w.combat.aircraft.shooter!.guns
    const fired = guns.map((g, i) => mixed.combat!.guns[i]!.rounds - g.ammo)
    // 400 rpm is 6.67 rounds a second; 800 rpm is 13.33.
    expect(fired[0]).toBeGreaterThanOrEqual(6)
    expect(fired[0]).toBeLessThanOrEqual(7)
    expect(fired[1]).toBeGreaterThanOrEqual(13)
    expect(fired[1]).toBeLessThanOrEqual(14)
    const slow = w.combat.projectiles.filter((p) => p.gunType === 'slow')
    expect(slow.length).toBeGreaterThan(0)
    for (const p of slow) expect(length(sub(p.position, p.previous)) / DT).toBeLessThan(620)
  })

  it('a round carries its hitScale to the target: three times the damage kills an F6F in 4 hits, not 12', () => {
    const w = run(typedLike(3), f6f, 180).combat
    expect(w.aircraft.target!.damage.destroyedAt).not.toBeNull()
    expect(w.aircraft.shooter!.hits).toBe(4)
  })
})

describe('damageFromHit hitScale', () => {
  const hitsToKill = (hitScale: number) => {
    let d = healthyDamage(), n = 0
    while (d.destroyedAt === null && n < 1000) { d = damageFromHit(f6f, d, 'fuel', 1, 'x', hitScale); n++ }
    return n
  }
  it('defaults to 1, bit for bit', () => {
    expect(damageFromHit(f6f, healthyDamage(), 'engine', 1, 'x')).toEqual(damageFromHit(f6f, healthyDamage(), 'engine', 1, 'x', 1))
  })
  it('scales the target\'s damagePerHit: 12 hits at 1, 4 at 3, 30 at 0.4', () => {
    expect(hitsToKill(1)).toBe(12)
    expect(hitsToKill(3)).toBe(4)
    expect(hitsToKill(0.4)).toBe(30)
  })
})
```

Append to `tests/sim/weapons/harmonization.test.ts` (add the `parseAircraftSpec` import from `../../../src/sim/content.js`):

```ts
describe('gunHarmonization with a mixed battery (A6M plan Z2)', () => {
  const mixed = parseAircraftSpec({
    ...f6f,
    combat: {
      ...combat,
      gunTypes: { slow: { roundsPerMinute: 400, muzzleVelocityMps: 600, dragPerM: 0.000125, hitScale: 3 } },
      guns: combat.guns.map((g, i) => (i === 0 || i === 3 ? { ...g, type: 'slow' } : g)),
    },
  }).combat!

  it('leaves the F6F unchanged: the default is all six guns, identical to choosing them explicitly', () => {
    const byDefault = gunHarmonization(combat, eye)
    const explicit = gunHarmonization(combat, eye, { referenceGuns: () => true })
    expect(byDefault.gunCount).toBe(6)
    expect(byDefault.depressionRad).toBe(explicit.depressionRad)
  })

  it('by default harmonizes to the primary guns only, not a cannon-and-rifle average', () => {
    expect(gunHarmonization(mixed, eye).gunCount).toBe(4)
  })

  it('flies each gun with its own ballistic: slower rounds need more depression', () => {
    const slow = gunHarmonization(mixed, eye, { referenceGuns: (g) => g.type === 'slow' })
    const primary = gunHarmonization(mixed, eye)
    expect(slow.depressionRad).toBeGreaterThan(primary.depressionRad)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/weapons/gunTypes.test.ts tests/sim/weapons/harmonization.test.ts`
Expected: FAIL. `gunTypes.js` does not exist.

- [ ] **Step 4: Implement the schema.** Replace `src/sim/weapons/schema.ts` with:

```ts
import { z } from 'zod'

const positive = z.number().finite().positive()
const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
export const SYSTEMS = ['engine', 'roll', 'pitch', 'yaw', 'fuel', 'leftGuns', 'rightGuns'] as const
export type DamageSystem = typeof SYSTEMS[number]

/**
 * One gun's ballistics and hitting power (A6M Zero spec §5, Mark's decision
 * 2026-09-25), so a mixed battery -- the Zero's two 7.7 mm and two 20 mm -- is
 * not averaged into one gun. `hitScale` multiplies the TARGET's
 * `damagePerHit` for each round of this type that hits an aircraft.
 */
export const GunTypeSchema = z.object({
  roundsPerMinute: positive.max(2000),
  muzzleVelocityMps: positive.max(2000),
  dragPerM: z.number().finite().min(0).max(0.01),
  hitScale: positive.max(20),
}).strict()
export type GunType = z.infer<typeof GunTypeSchema>

export const CombatSpecSchema = z.object({
  /** The PRIMARY ballistic: an untyped mount fires with these, and the AI's
   *  lead (`src/sim/ai/pursuit.ts`) reads `muzzleVelocityMps` from here. */
  roundsPerMinute: positive.max(2000),
  muzzleVelocityMps: positive.max(2000),
  convergenceM: positive,
  dispersionDeg: z.number().finite().min(0).max(10),
  lifetimeS: positive.max(10),
  dragPerM: z.number().finite().min(0).max(0.01),
  damagePerHit: positive,
  roundDamage: positive,
  structureHp: positive,
  subsystemHp: positive,
  fuelLeakKgPerS: z.number().finite().min(0),
  engineDecayPerS: z.number().finite().min(0),
  /** Optional per-gun types; see `GunTypeSchema`. */
  gunTypes: z.record(z.string().min(1), GunTypeSchema).optional(),
  guns: z.array(z.object({
    position: point,
    rounds: z.number().int().min(1).max(10000),
    group: z.enum(['leftGuns', 'rightGuns']),
    /** A key of `gunTypes`; absent means the top-level ballistic. */
    type: z.string().min(1).optional(),
  }).strict()).min(1).max(16),
  zones: z.array(z.object({
    id: z.string().min(1),
    center: point,
    halfSize: z.tuple([positive, positive, positive]),
    system: z.enum(SYSTEMS),
  }).strict()).min(1).max(32).refine(zones => new Set(zones.map(z => z.id)).size === zones.length, { message: 'duplicate hit zone id' }),
  source: z.string().min(1),
}).strict().superRefine((c, ctx) => {
  for (const [i, g] of c.guns.entries()) {
    if (g.type !== undefined && c.gunTypes?.[g.type] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guns', i, 'type'], message: `gun type "${g.type}" is not in gunTypes` })
    }
  }
  // The AI leads with the top-level muzzle velocity, so at least one mount
  // must actually fire that ballistic, or the AI aims for rounds nobody fires.
  const primary = c.guns.some((g) => {
    if (g.type === undefined) return true
    const t = c.gunTypes?.[g.type]
    return t !== undefined && t.muzzleVelocityMps === c.muzzleVelocityMps && t.dragPerM === c.dragPerM
  })
  if (!primary) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guns'], message: 'no mount fires the top-level (primary) ballistic' })
  }
})
export type CombatSpec = z.infer<typeof CombatSpecSchema>
```

- [ ] **Step 5: Implement the resolver.** Create `src/sim/weapons/gunTypes.ts`:

```ts
import type { CombatSpec } from './schema.js'

type GunMount = CombatSpec['guns'][number]

export type GunBallistics = {
  readonly roundsPerMinute: number
  readonly muzzleVelocityMps: number
  readonly dragPerM: number
  readonly hitScale: number
}

/** The ballistics a round of gun type `type` flies with. `undefined` is an
 *  untyped mount: the top-level (primary) fields at hitScale 1, which is
 *  exactly what every mount fired with before per-gun types existed. */
export function gunBallistics(combat: CombatSpec, type: string | undefined): GunBallistics {
  if (type === undefined) {
    return { roundsPerMinute: combat.roundsPerMinute, muzzleVelocityMps: combat.muzzleVelocityMps, dragPerM: combat.dragPerM, hitScale: 1 }
  }
  const t = combat.gunTypes?.[type]
  if (t === undefined) throw new Error(`gunBallistics: gun type "${type}" is not in this aircraft's gunTypes`)
  return t
}

/** A mount that fires the top-level ballistic: the one the AI leads with and
 *  the sight is harmonized to by default. Untyped, or typed to a type whose
 *  muzzle velocity and drag equal the top level's. */
export function isPrimaryGun(combat: CombatSpec, gun: GunMount): boolean {
  if (gun.type === undefined) return true
  const t = combat.gunTypes?.[gun.type]
  return t !== undefined && t.muzzleVelocityMps === combat.muzzleVelocityMps && t.dragPerM === combat.dragPerM
}
```

- [ ] **Step 6: Implement firing and hits** in `src/sim/weapons/combat.ts`.
  1. Add `import { gunBallistics } from './gunTypes.js'`.
  2. In `Projectile`, after `readonly ageS: number`, add:

```ts
  /** The firing mount's `guns[].type`, for a typed mount only. Absent on
   *  every round an untyped mount fires, so those rounds are unchanged. */
  readonly gunType?: string
```

  3. In the firing loop, after `const mount = spec.guns[index]!`, add `const ballistic = gunBallistics(spec, mount.type)`.
  4. Inside the loop, replace `scale(qRotate(a.previous.attitude, aim), spec.muzzleVelocityMps)` with `scale(qRotate(a.previous.attitude, aim), ballistic.muzzleVelocityMps)`.
  5. In the pushed `p` object, add `...(mount.type === undefined ? {} : { gunType: mount.type })` after `ageS: 0`.
  6. Replace `cooldown += 60 / spec.roundsPerMinute` with `cooldown += 60 / ballistic.roundsPerMinute`.

  Change `damageAircraftAt` to take a scale:

```ts
  const damageAircraftAt = (target: CombatAircraft, amount: number, system: DamageSystem | null, owner: string, point: Vec3 | null, hitScale = 1): void => {
    const rec = records[target.id]
    if (rec === undefined || rec.damage.destroyedAt !== null || target.impact !== null) return
    const damage = system === null
      ? blastDamageAircraft(target.spec, rec.damage, amount, tick, owner)
      : damageFromHit(target.spec, rec.damage, system, tick, owner, hitScale)
    records[target.id] = point === null ? { ...rec, damage } : { ...rec, damage, lastHit: { tick, position: point } }
    creditAircraftDamage(rec.damage, damage, owner, system !== null, target.spec.role)
  }
```

  In the flying loop:
  1. After the `if (shot.p.kind !== 'round' && store === null) continue` line, add `const ballistic = store === null ? gunBallistics(source, shot.p.gunType) : null`.
  2. Replace `store?.dragPerM ?? source.dragPerM` with `store !== null ? store.dragPerM : ballistic!.dragPerM`.
  3. Replace the aircraft branch with:

```ts
    if (contact.kind === 'aircraft') damageAircraftAt(contact.aircraft, damage, store === null ? contact.system : null, p.owner, point, ballistic?.hitScale ?? 1)
```

  Ship and structure hits keep `source.roundDamage` unscaled, which is what spec §5 states (see the handoff's open question).

- [ ] **Step 7: Implement `damageFromHit`'s scale.** In `src/sim/damage/model.ts`:

```ts
/** `hitScale` (A6M spec §5) multiplies the target's `damagePerHit` for one
 *  round: a 20 mm shell is 3, a 7.7 mm bullet 0.4. Default 1 is every hit
 *  before per-gun types, bit for bit (x * 1 === x). */
export function damageFromHit(spec: AircraftSpec, before: Damage, system: DamageSystem, tick: number, attacker: string, hitScale = 1): Damage {
  const c = spec.combat
  if (c === undefined || before.destroyedAt !== null) return before
  const amount = c.damagePerHit * hitScale
  const structure = Math.max(0, before.structure - amount / c.structureHp)
  // Epsilon makes exactly twelve 10/120 hits lethal despite roundoff.
  const destroyed = structure < 1e-10
  return {
    ...before, structure: destroyed ? 0 : structure,
    [system]: Math.max(0, before[system] - amount / c.subsystemHp),
    destroyedAt: destroyed ? tick : null, attacker: destroyed ? attacker : before.attacker,
  }
}
```

- [ ] **Step 8: Implement per-gun harmonization.** In `src/sim/weapons/harmonization.ts`:
  1. Add `import { gunBallistics, isPrimaryGun } from './gunTypes.js'`.
  2. Replace the `referenceGuns` doc comment with: `/** Which guns the sight is harmonized to. Default: the PRIMARY guns (isPrimaryGun, src/sim/weapons/gunTypes.ts) -- every gun on an airplane with one gun type, the 7.7 mm pair on the A6M. Each gun's round is flown with its own type's ballistics. */`
  3. Replace `const select = options.referenceGuns ?? (() => true)` with `const select = options.referenceGuns ?? ((g: GunMount) => isPrimaryGun(combat, g))`.
  4. In `impactAt`, add `const ballistic = gunBallistics(combat, gun.type)` at the top.
  5. Replace `combat.muzzleVelocityMps` with `ballistic.muzzleVelocityMps`, and `flyProjectile(p, DT, null, combat.dragPerM)` with `flyProjectile(p, DT, null, ballistic.dragPerM)`.

- [ ] **Step 9: Run the tests to verify they pass.**

Run: `npx vitest run tests/sim/weapons tests/sim/strike.test.ts tests/sim/pursuitMerge.test.ts tests/render/gunsightBallistics.test.ts tests/render/gunPipper.test.ts; rc=$?; echo "rc=$rc"`
Expected: PASS.

- [ ] **Step 10: Check F6F bit-identity.** Run `npx tsx .superpowers/sdd/z2/combatDigest.ts` and `npx tsx .superpowers/sdd/z2/flightDigest.ts`. Both must equal their recorded baselines. Record them. A different combat digest means an F6F round changed: stop and find it.

- [ ] **Step 11: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/weapons/schema.ts src/sim/weapons/gunTypes.ts src/sim/weapons/combat.ts src/sim/weapons/harmonization.ts \
  src/sim/damage/model.ts tests/sim/weapons/gunTypes.test.ts tests/sim/weapons/harmonization.test.ts
git commit -m "Weapons: optional per-gun types with their own cadence, ballistics and hit scale; the F6F unchanged"
```

---

### Task 6: The Zero's armament, survivability, mounts and zones

**Files:**
- Modify: `content/aircraft/a6m2-zero.json` (add `combat`)
- Create: `tests/sim/weapons/a6mArmament.test.ts`

**Interfaces:**
- Consumes: Task 5's `gunTypes`, `gunBallistics`, `isPrimaryGun`, `gunHarmonization` and `damageFromHit(..., hitScale)`.
- Produces: the Zero's `combat` block. Its gun type ids are `"type97-7.7mm"` and `"type99-20mm"`.

- [ ] **Step 1: Write the failing test** `tests/sim/weapons/a6mArmament.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { gunBallistics, isPrimaryGun } from '../../../src/sim/weapons/gunTypes.js'
import { gunHarmonization } from '../../../src/sim/weapons/harmonization.js'
import { damageFromHit, healthyDamage } from '../../../src/sim/damage/model.js'
import { ammoRemaining } from '../../../src/render/combatReadout.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'

const zero = loadAircraftSpec('a6m2-zero')
const f6f = loadAircraftSpec('f6f-hellcat')
const zc = zero.combat!
const MG = 'type97-7.7mm', CANNON = 'type99-20mm'

const hitsToKill = (target: AircraftSpec, hitScale: number) => {
  let d = healthyDamage(), n = 0
  while (d.destroyedAt === null && n < 1000) { d = damageFromHit(target, d, 'fuel', 1, 'x', hitScale); n++ }
  return n
}

describe('A6M2 armament (AAF memo 23 Oct 1942; Summary 85)', () => {
  it('two cowl 7.7 mm with 500 rounds each, two wing 20 mm with 60 each', () => {
    const byType = (t: string) => zc.guns.filter((g) => g.type === t)
    expect(byType(MG).map((g) => g.rounds)).toEqual([500, 500])
    expect(byType(CANNON).map((g) => g.rounds)).toEqual([60, 60])
    expect(zc.guns.reduce((s, g) => s + g.rounds, 0)).toBe(1120)
    for (const t of [MG, CANNON]) expect(byType(t).map((g) => g.group).sort()).toEqual(['leftGuns', 'rightGuns'])
  })

  it('its primary ballistic is the 7.7 mm, which is what the AI leads with (spec §5)', () => {
    expect(gunBallistics(zc, undefined)).toEqual({ ...gunBallistics(zc, MG), hitScale: 1 })
    expect(zc.guns.map((g) => isPrimaryGun(zc, g))).toEqual(zc.guns.map((g) => g.type === MG))
  })

  it('harmonizes its sight to the cowl guns by default, not to a cannon-and-rifle average', () => {
    expect(gunHarmonization(zc, zero.view.eyePointM).gunCount).toBe(2)
  })

  it('a 20 mm shell kills an F6F in 4 hits and a 7.7 mm bullet in 30, against 12 for a .50 (spec §5)', () => {
    expect(hitsToKill(f6f, gunBallistics(zc, CANNON).hitScale)).toBe(4)
    expect(hitsToKill(f6f, gunBallistics(zc, MG).hitScale)).toBe(30)
    expect(hitsToKill(f6f, 1)).toBe(12)
  })

  it('no armor, no self-sealing tanks: the same .50 fire kills it in fewer hits, and it leaks faster', () => {
    expect(hitsToKill(zero, 1)).toBeLessThan(hitsToKill(f6f, 1))
    expect(zc.fuelLeakKgPerS).toBeGreaterThan(f6f.combat!.fuelLeakKgPerS)
  })

  it('a 10 s burst empties the cannon (60 rounds at 520 rpm is 6.9 s) and leaves the 7.7 mm firing', () => {
    const still: Stepper = (_s, state, _c, ctx) => ({ ...state, tick: ctx.tick })
    const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
    const state = createState({ position: v3(0, 1000, 0) })
    const me: AircraftEntity = { id: 'zero', spec: zero, state, previous: state, controls: { ...idle, fire: true }, assistMemory: undefined, impact: null, parked: false }
    let w = createWorldOf({ aircraft: [me], player: 'zero' })
    for (let i = 0; i < 600; i++) w = advance(w, DT, still).world
    const ammo = w.combat.aircraft.zero!.guns.map((g) => g.ammo)
    zc.guns.forEach((g, i) => {
      if (g.type === CANNON) expect(ammo[i]).toBe(0)
      // 650 rpm synchronized for 10 s is 108.3 rounds.
      else { expect(ammo[i]).toBeGreaterThanOrEqual(390); expect(ammo[i]).toBeLessThanOrEqual(393) }
    })
    // The HUD's AMMO readout (spec §5) still sums across the mixed battery.
    expect(ammoRemaining(w.combat.aircraft.zero!)).toBe(ammo.reduce((s, a) => s + a, 0))
  })

  it('every hit zone sits inside a 12.0 m span and a 9.06 m length', () => {
    for (const z of zc.zones) {
      expect(Math.abs(z.center[2]) + z.halfSize[2]).toBeLessThanOrEqual(6.0)
      expect(Math.abs(z.center[0]) + z.halfSize[0]).toBeLessThanOrEqual(4.53)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run tests/sim/weapons/a6mArmament.test.ts`
Expected: FAIL. `zero.combat` is undefined.

- [ ] **Step 3: Add the combat block** to `content/aircraft/a6m2-zero.json`, as a top-level key after `"flap"`:

```json
  "combat": {
    "roundsPerMinute": 650,
    "muzzleVelocityMps": 745,
    "dragPerM": 0.00034,
    "convergenceM": 300,
    "dispersionDeg": 0.12,
    "lifetimeS": 3,
    "damagePerHit": 10,
    "roundDamage": 2,
    "structureHp": 80,
    "subsystemHp": 25,
    "fuelLeakKgPerS": 1.5,
    "engineDecayPerS": 0.05,
    "gunTypes": {
      "type97-7.7mm": { "roundsPerMinute": 650, "muzzleVelocityMps": 745, "dragPerM": 0.00034, "hitScale": 0.4 },
      "type99-20mm": { "roundsPerMinute": 520, "muzzleVelocityMps": 600, "dragPerM": 0.000125, "hitScale": 3.0 }
    },
    "guns": [
      { "position": [2.0, 0.55, -0.25], "rounds": 500, "group": "leftGuns", "type": "type97-7.7mm" },
      { "position": [2.0, 0.55, 0.25], "rounds": 500, "group": "rightGuns", "type": "type97-7.7mm" },
      { "position": [0.9, -0.15, -2.3], "rounds": 60, "group": "leftGuns", "type": "type99-20mm" },
      { "position": [0.9, -0.15, 2.3], "rounds": 60, "group": "rightGuns", "type": "type99-20mm" }
    ],
    "zones": [
      { "id": "engine", "center": [2.6, 0, 0], "halfSize": [1.3, 0.75, 0.75], "system": "engine" },
      { "id": "fuel", "center": [0, 0, 0], "halfSize": [1.3, 0.75, 0.75], "system": "fuel" },
      { "id": "tail", "center": [-2.7, 0, 0], "halfSize": [1.3, 0.5, 0.5], "system": "pitch" },
      { "id": "rudder", "center": [-3.6, 0.9, 0], "halfSize": [0.7, 0.9, 0.2], "system": "yaw" },
      { "id": "left-guns", "center": [0.3, -0.2, -2.6], "halfSize": [1.1, 0.3, 1.2], "system": "leftGuns" },
      { "id": "right-guns", "center": [0.3, -0.2, 2.6], "halfSize": [1.1, 0.3, 1.2], "system": "rightGuns" },
      { "id": "left-aileron", "center": [-0.3, -0.2, -5.0], "halfSize": [0.9, 0.3, 0.9], "system": "roll" },
      { "id": "right-aileron", "center": [-0.3, -0.2, 5.0], "halfSize": [0.9, 0.3, 0.9], "system": "roll" }
    ],
    "source": "Armament: two Type 97 7.7 mm machine guns in the cowl with 500 rounds each, and two Type 99-1 20 mm cannon in the wings with 60 rounds each (AAF Materiel Command memo, 23 Oct 1942, a6m2-oct2342.pdf; Summary 85 agrees). Type 97: 745 m/s and 900 rpm free-firing, 600-700 rpm SYNCHRONIZED, 6.9 g bullet (English Wikipedia 'Type 97 aircraft machine gun', read <READ-DATE>); the cowl guns fire through the propeller, so roundsPerMinute = 650, the middle of the synchronized range. Type 99-1 Model 1: 520 rpm, 600 m/s, 127-132 g shell (English Wikipedia 'Type 99 cannon', read <READ-DATE>). The top-level roundsPerMinute, muzzleVelocityMps and dragPerM are the 7.7 mm's: the PRIMARY ballistic the AI leads with and the sight is harmonized to (A6M Zero spec §5). dragPerM values are ESTIMATES scaled from the F6F's .50 figure (0.00015) by frontal area over projectile mass: 7.7 mm x2.28 = 0.00034, 20 mm x0.83 = 0.000125. hitScale 0.4 and 3.0 are GAMEPLAY ESTIMATES (spec §5): a Hellcat's 12 lethal .50 hits become 4 cannon hits or 30 rifle-caliber ones. Survivability direction is SOURCED -- 'no armor, bullet proof glass, bullet proof fuel tanks' (23rd Fighter Group report on Zero P-5016, 6 Feb 1943) -- and the values are ESTIMATES: structureHp 80 against the F6F's 120 (8 .50 hits, not 12), subsystemHp 25 against 40, fuelLeakKgPerS 1.5 against 0.5. roundDamage 2 (against ships and structures) is an ESTIMATE, half the .50's. Convergence, dispersion, lifetime and engine decay are the F6F's gameplay estimates. Gun positions and hit zones are ESTIMATES scaled from the F6F's layout to a 12.0 m span and 9.06 m length; Z3 re-measures them from the built LOD0 mesh. Both cowl guns map to leftGuns/rightGuns by side, as spec §5 decided; there is no fuselage gun group."
  }
```

Replace both `<READ-DATE>` tokens with the date you read the two articles. Before writing, confirm the rpm and muzzle-velocity figures against those articles. Then check that `grep -c "READ-DATE" content/aircraft/a6m2-zero.json` prints `0`.

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npx vitest run tests/sim/weapons tests/sim/testcards/a6m.test.ts; rc=$?; echo "rc=$rc"`
Expected: PASS. If the 10 s burst's 7.7 mm count falls outside 390-393, print the actual counts. Correct the bound only if the arithmetic (650 × 10 / 60 = 108.33 rounds, plus the first round at t = 0) says the bound was wrong, and write the arithmetic in the comment.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # rc=0
git add content/aircraft/a6m2-zero.json tests/sim/weapons/a6mArmament.test.ts
git commit -m "A6M2 Zero armament: two synchronized 7.7 mm and two 20 mm cannon, unarmored airframe"
```

---

### Task 7: Matchup cards and the AI-Zero harness for 7c

**Files:**
- Modify: `tests/sim/testcards/a6m.test.ts` (append a `describe`; add `measureTakeoffRun` to the imports)
- Create: `tests/fixtures/scenarios/zero-merge.json`, `tests/sim/zeroMerge.test.ts`
- Modify: `tests/sim/gunneryBot.ts` (`BotRun`, and the `return` in `flyGunneryBot`)

**Interfaces:**
- Consumes: every earlier task; `loadFixtureScenarioBundle` from `tests/fixtures/scenarios.ts`; `flyGunneryBot` and `withNoiseCursor`.
- Produces:
  - `BotRun.opponentShots: number` and `BotRun.opponentHits: number` (the target's own gunnery).
  - Fixture id `zero-merge`: `pursuit-range`'s head-on geometry with the pursuer's `spec` set to `a6m2-zero` and a green pilot.
- 7c's spec (`docs/superpowers/specs/2026-09-25-ai-7c-design.md` §3.3) says its Tier 1 proof uses a synthetic variant "because the Zero does not exist yet". This fixture is what makes the real one available. Do not write any 7c code here.

- [ ] **Step 1: Write the failing matchup cards.** Append to `tests/sim/testcards/a6m.test.ts`:

```ts
describe('A6M2 against F6F-5: the matchup emerges from data (master spec §5; A6M spec §4.3 item 7)', () => {
  const f6f = loadAircraftSpec('f6f-hellcat')
  const table: [number, number][] = [
    [zero.reference.topSpeedAltitudeM, zero.reference.topSpeedMps],
    ...(zero.reference.topSpeedByAltitudeM ?? []),
  ]

  // Measured 2026-09-25, F6F vs Zero, m/s: SL 137.30 / 124.93, 16k 160.28 /
  // 142.10, 30k 169.39 / 131.73.
  it.each(table)('the F6F is faster at %d m', (altitudeM) => {
    expect(measureTopSpeed(f6f, altitudeM)).toBeGreaterThan(measureTopSpeed(zero, altitudeM))
  })

  // Measured 2026-09-25: clean 35.77 vs 45.47, flaps 31.59 vs 39.13 m/s.
  it('the Zero stalls slower, clean and with flaps', () => {
    expect(measureStallSpeed(zero, 0, 0)).toBeLessThan(measureStallSpeed(f6f, 0, 0))
    expect(measureStallSpeed(zero, 0, 1)).toBeLessThan(measureStallSpeed(f6f, 0, 1))
  })

  // Each at its own sourced take-off speed, both at full flaps (how the F6F's
  // trial and card fly). Measured 2026-09-25: 168.17 m vs 236.08 m.
  it('the Zero\'s take-off roll is shorter', () => {
    const zeroRoll = measureTakeoffRun(zero, 75 * 0.44704, 1)
    const f6fRoll = measureTakeoffRun(f6f, 86.5 * 0.44704, 1)
    expect(zeroRoll).toBeLessThan(f6fRoll)
  })

  // The Hellcat pilot's escape: fast, the F6F out-rolls it; slow, it does
  // not. Measured 2026-09-25 (before the fade): at 90 m/s F6F 69.90, Zero
  // 75.79; at 150 m/s the F6F 80.00 and the Zero about 19.5 with the fade.
  it('at 150 m/s EAS the F6F out-rolls the Zero, but at 90 m/s it does not', () => {
    expect(measureRollRate(f6f, 0, 150)).toBeGreaterThan(measureRollRate(zero, 0, 150))
    expect(measureRollRate(f6f, 0, 90)).toBeLessThanOrEqual(measureRollRate(zero, 0, 90))
  })

  // The inputs 7c's envelope reads (its spec §3.3): wing loading at the
  // trial weight. F6F 1,780 N/m^2, Zero 1,101: a ratio of 1.62, well past
  // the 1.1 "turnfight" threshold 7c will use.
  it('the Zero\'s wing loading is at least 1.1x lighter than the F6F\'s at their trial weights', () => {
    const loading = (s: typeof zero) => (s.reference.testMassKg * 9.80665) / s.geometry.wingAreaM2
    expect(loading(f6f) / loading(zero)).toBeGreaterThan(1.1)
  })
})
```

Create `tests/fixtures/scenarios/zero-merge.json`:

```json
{
  "id": "zero-merge",
  "player": "f6f-1",
  "airfields": ["tacloban"],
  "aircraft": [
    {
      "id": "f6f-1",
      "spec": "f6f-hellcat",
      "airborneAt": { "position": [0, 3000, 0], "headingDeg": 90, "speedMps": 120 }
    },
    {
      "id": "pursuer-1",
      "spec": "a6m2-zero",
      "airborneAt": { "position": [2500, 3000, 60], "headingDeg": 270, "speedMps": 125 },
      "pilot": { "target": "f6f-1", "skill": "green" }
    }
  ],
  "ships": [],
  "weather": { "windFromDeg": 0, "windMps": 0, "timeOfDay": 12 }
}
```

Create `tests/sim/zeroMerge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import { flyGunneryBot, withNoiseCursor } from './gunneryBot.js'

/**
 * An AI Zero against the scripted F6F player, from `pursuit-range`'s
 * head-on start (test fixture only; nothing ships it, and the player-facing
 * scenario is Z3's zero-range.json). It exists so the AI plans after Z2 (7c
 * onward) have a real Zero to measure against, instead of the synthetic
 * variant 7c's spec planned for.
 *
 * Floors, not tuned counts. Measured 2026-09-25 with a draft Zero (no fade,
 * no cutout, no gun types): a firing chance at 8.6 s in 8/8 runs, and 6/8
 * kills at 8 hits each. Re-measured in Task 7: <record here>.
 */
const CURSORS = [0, 7919, 15838, 23757, 31676, 39595, 47514, 55433]

describe('zero-merge: F6F player against an AI Zero, head-on', () => {
  const bundle = loadFixtureScenarioBundle('zero-merge')

  it('flies the Zero as the pursuer', () => {
    const world = worldFromScenario(bundle, null)
    expect(world.aircraft.find((a) => a.id === 'pursuer-1')!.spec.id).toBe('a6m2-zero')
  })

  it('gives a player aiming with the reticle a firing chance in every run, inside 15 s', () => {
    const runs = CURSORS.map((c) => flyGunneryBot(withNoiseCursor(worldFromScenario(bundle, null), c), 'pursuer-1', 30))
    for (const [i, r] of runs.entries()) {
      expect(r.firstChanceS, `cursor ${CURSORS[i]}`).not.toBeNull()
      expect(r.firstChanceS!, `cursor ${CURSORS[i]}`).toBeLessThan(15)
      expect(Number.isFinite(r.opponentShots) && Number.isFinite(r.opponentHits)).toBe(true)
    }
    console.log('zero-merge runs', JSON.stringify(runs))
    expect(runs.filter((r) => r.killS !== null).length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/testcards/a6m.test.ts tests/sim/zeroMerge.test.ts`
Expected: `zeroMerge.test.ts` fails typecheck/at runtime on `opponentShots`. The matchup cards should already pass: they grade Tasks 2-6. Any red card is a finding. Report it, and do not retune to turn it green.

- [ ] **Step 3: Implement.** In `tests/sim/gunneryBot.ts`, add to `BotRun`:

```ts
  /** The target's own gunnery over the run: rounds it fired, and hits it
   *  scored (on anyone). For the AI plans that measure the pursuer. */
  readonly opponentShots: number
  readonly opponentHits: number
```

and change the final `return` of `flyGunneryBot` to:

```ts
  const opponent = w.combat.aircraft[targetId]!
  return {
    firstChanceS, chanceS, hits: w.combat.aircraft[player]!.hits, killS, playerLostS,
    opponentShots: opponent.shots, opponentHits: opponent.hits,
  }
```

- [ ] **Step 4: Run the tests and record.**

Run: `npx vitest run tests/sim/testcards/a6m.test.ts tests/sim/zeroMerge.test.ts tests/sim/pursuitMerge.test.ts; rc=$?; echo "rc=$rc"`
Expected: PASS. Copy the printed `zero-merge runs` numbers into the `<record here>` spot in the test's doc comment: firing-chance times, kills out of 8, hits per kill, and opponent shots and hits. If kills are below 4, stop and report the numbers. That is a balance finding for Mark, not something to tune here.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # rc=0
git add tests/sim/testcards/a6m.test.ts tests/fixtures/scenarios/zero-merge.json tests/sim/zeroMerge.test.ts tests/sim/gunneryBot.ts
git commit -m "Zero against Hellcat: matchup cards, and a head-on AI Zero fixture for the AI plans"
```

---

### Task 8: Handoff, §15 row, §5 amendment, README

**Files:**
- Create: `docs/handoff/<YYYY-MM-DD>-z2-zero-flight-model.md`, named with the date the work completes
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§5 "Moments" and "Guns"; the §15 table)
- Modify: `README.md` (one status paragraph near the other plan paragraphs, around lines 195-240)

- [ ] **Step 1: Apply the `view.model` rule.** Run `git log --oneline main -- src/sim/flight/schema.ts | head` and `git show main:src/sim/flight/schema.ts | grep -n "model"`.

  If Z1 has landed on `main` (the `view` block has `model`):
  1. `git merge main`, and resolve `schema.ts` and `schema.test.ts` by keeping both sides.
  2. Add `"model"` to the Zero's `view`, per "Shared files" above.
  3. Run `npm run verify` and capture `rc`.

  Otherwise, change nothing.

- [ ] **Step 2: Write the handoff.** In this order:
  1. **First paragraph:** the `view.model` state. Either "Z1 must add `view.model` to `a6m2-zero.json` when it merges; its registry-coverage test fails until it does", or the value you set.
  2. **What changed:** one bullet per commit, with its SHA.
  3. **The measured cards:** a table with columns card, trial, model, error and tolerance, taken from the card comments, for every Zero card and the matchup cards.
  4. **The bit-identity evidence:** the digests before and after each of Tasks 3, 4 and 5, with the node version.
  5. **zero-merge's recorded numbers.**
  6. **Open items, stated plainly:**
     - Ship and structure hits ignore `hitScale`, as spec §5 states. Should a 20 mm do more to a ship?
     - Windmill drag does not apply while the engine is cut.
     - The cutout is stateless: there is no sputter-and-recover.
     - The fitted power curve falls from 3,000 m while the source holds manifold pressure to 16,000 ft. That is the ram-air compromise. The alternative is to keep the spec's curve and grade climb at altitude by direction only.
     - For 7c: an AI Zero pushing the velocity controller's negative g loses thrust, and above 250 mph its commanded rates fade. Both are the airplane working as designed, and both are 7c's safety envelope's concern.
     - For the AI gunnery follow-on: the Zero's cannon fly at 600 m/s while the AI leads at 745.
     - Z3 re-measures `gear.heightM`, `view.eyePointM`, the gun positions and the zones, and re-runs the take-off and matchup cards in the same commit.
  7. **No Tier 2,** and why: no render change, and no shipped scenario names the Zero.

- [ ] **Step 3: Amend master spec §5.**
  1. Under "Moments — the deliberate simplification", after the existing amendment, add: *Amended YYYY-MM-DD (A6M plan Z2, Mark's decision 2026-09-25): two optional, data-driven terms any aircraft may set. `rates.controlFadeByEasMps` makes the controls heavy at speed (`controlFade`, `src/sim/flight/model.ts`). `engine.negativeGCutout` starves a float-carburetted engine under negative lift (`engineCutOut`). The F6F sets neither.*
  2. Under "Guns", add: *Per-gun types (`combat.gunTypes`, `guns[].type`, per-round `hitScale`) let one airplane carry a mixed battery. See `src/sim/weapons/gunTypes.ts`. The top-level ballistic is the primary one, which the AI leads with and the sight is harmonized to.*

- [ ] **Step 4: Update the §15 table.** Add a row, or update the existing one if Z1 already added it:

`| A6M Zero (Z1-Z3) | any | Second airframe: graded A6M2 flight model and mixed armament (Z2), model pipeline and runtime (Z1), the Zero on screen (Z3) | §5, §7 | Z2 complete YYYY-MM-DD, headless, Tier 1 only ([design](2026-09-25-a6m-zero-design.md), [plan](../plans/2026-09-25-z2-zero-flight-model.md), [handoff](../../handoff/YYYY-MM-DD-z2-zero-flight-model.md)); the Zero is in no shipped scenario until Z3's zero-range. Z1 and Z3: see their own rows or plans |`

Adjust the Z1 and Z3 wording to whatever their state is on `main` when you merge.

- [ ] **Step 5: Add a README paragraph** beside the other plan paragraphs:

`**The A6M Zero flies, headless (Z2, YYYY-MM-DD):** content/aircraft/a6m2-zero.json is graded against the 1942 Navy trial of a captured A6M2. Its controls stiffen above 250 mph, its engine cuts out under negative g, and it carries two 7.7 mm guns and two 20 mm cannon with their own ballistics. It appears in no shipped scenario yet. See the [handoff](docs/handoff/YYYY-MM-DD-z2-zero-flight-model.md); master spec §15 holds the status.`

- [ ] **Step 6: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # rc=0
git add docs/handoff/*-z2-zero-flight-model.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
git commit -m "Z2 handoff: the Zero's flight model and armament, measured"
```

Email the handoff to Mark once: `python3 tools/mail-doc.py docs/handoff/<file>.md "ww2airsim handoff: Z2, the Zero's flight model and armament"`. Exit 0 means sent. Never re-run it with `--debug`.

---

## Self-review

**Spec coverage (spec §11 Z2 items 1-8):**

| Spec item | Where |
| --- | --- |
| 1: optional reference fields | Task 1 |
| 2: content and cards 1-6, plus `view.model` | Task 2; `view.model` is re-sequenced with its reason under "Shared files" |
| 3: control fade | Task 3 |
| 4: negative-g cutout | Task 4 |
| 5: gun types and the F6F identity check | Task 5 |
| 6: combat block | Task 6 |
| 7: matchup cards | Task 7 |
| 8: handoff | Task 8 |
| §4.3 item 8 (F6F bit-identical) | Tasks 3, 4 and 5, each with an in-process identity test and a same-machine digest |
| §9 scenario | Z3's; not here |
| §5's survivability card | Task 6 |

**Placeholder scan.** The only fill-ins are:
- the article read dates (`<READ-DATE>`), each checked mechanically with `grep -c` to be 0;
- the handoff's file date, which is the date the work completes, and the same date wherever Task 8 writes `YYYY-MM-DD` (the §5 amendment, the §15 row and the README paragraph);
- the zero-merge comment's `<record here>`, filled from a printed measurement in the same step.

**Type consistency.** These names are used identically in every task: `controlFade(spec, q)`, `equivalentAirspeedMps(q)`, `engineCutOut(spec, liftN)`, `gunBallistics(combat, type)`, `isPrimaryGun(combat, gun)`, `Projectile.gunType`, `damageFromHit(..., hitScale)`, `BotRun.opponentShots` and `BotRun.opponentHits`, and the gun type ids `type97-7.7mm` and `type99-20mm`.

**Review Focus coverage:**

| Item | Test |
| --- | --- |
| 1 | Task 4, "keeps the engine at exactly zero lift" |
| 2 | Task 3, "fades by equivalent airspeed" |
| 3 | Task 5, "by default harmonizes to the primary guns only", and Task 6, "harmonizes its sight to the cowl guns" |
| 4 | Task 3, the fade-table rejections; Task 5, the unknown-type and primary-contract rejections |
| 5 | Task 6, "a 10 s burst empties the cannon" |
