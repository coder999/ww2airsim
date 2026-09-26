# Loading Screen and Pilot Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An honest, locked-until-ready loading strip on the title screen, the 12 s cloud-shader boot freeze cut to ~1 s, and a per-pilot Dossier backed by a career record and a mission log.

**Architecture:** Pure model + thin DOM, the repo's `paddlesBadge.ts`/`debrief.ts` split, everywhere: `bootProgress.ts` (stages → fraction/label/ready), `flightRecord.ts` (per-segment airborne time and peaks), `roster.ts` (career totals + capped log, migrate-on-read), `dossier.ts` (formatting + sheet). `main.ts` only wires. The freeze fix makes the cumulus density a laid-out TSL `Fn`, one instance per material.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU + TSL, Vite, Vitest (node environment -- no DOM in Tier 1), Playwright Tier 2 on the reference desktop GPU.

**Spec:** `docs/superpowers/specs/2026-09-25-loading-and-dossier-design.md` (read it first; §A.3 holds the measurements this plan's Task 10 rests on).

## Global Constraints

- Worktree: `/home/mark/projects/ww2airsim/.claude/worktrees/loading-dossier`, branch `worktree-loading-dossier`. Never commit `vite.config.ts` (its slot-3 edit is local scratch: `TUNNEL_HOST = 'ww2airsim-3.windomlane.org'`, `port: 5174`).
- Dev server for this worktree: `WW2AIRSIM_TUNNEL=1 npx vite --port 5174` from the worktree; host `https://ww2airsim-3.windomlane.org/` must return `200` before any Tier 2 run.
- Tier 2: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test <spec>` (tunnel: `ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &`).
- The desktop GPU may be shared with another session. A Tier 2 failure on sample COUNT (e.g. "Expected: > 120, Received: 9") is contention: rerun the same test on the unmodified code in the same session before blaming the change, and record both numbers.
- `npm run verify` ends every task; capture `rc=$?` directly, never through a grep pipeline. Never run two vitest suites at once on nexus (2026-09-25 OOM).
- Never `git clean -fdx`. Never push or deploy.
- US spelling in prose and new identifiers. Display units imperial: feet (`1 / 0.3048` ft per m), knots (`1.943844` kt per m/s).
- `src/sim/` imports nothing from `render/`; everything new here is under `src/render/`.
- Longest main-thread task from navigation to ready: **under 1 500 ms** on the reference GPU (spec §A.4).
- Mission log cap: **200** entries, oldest dropped; `career` totals are stored, never derived from the log.
- Storage key stays `ww2airsim.roster.v1`; pre-dossier records load with zeroed `career` and `log: []`.
- Every user-supplied string (pilot name) reaches the DOM through `textContent`, never `innerHTML`.

## Review Focus

1. **Return to title after boot must not re-lock.** `show()` rebuilds the overlay; a rebuild after `ready` must come up unlocked with no strip. Pinned in Task 2 (build reads `boot.ready`) and Task 9 (Tier 2 returns to title and clicks immediately).
2. **Land → Continue → crash produces two log lines whose segments do not overlap.** The segment resets after each bank. Pinned in Task 7 (a `segment = EMPTY_SEGMENT` beside every kill-baseline reset, enforced by its wiring test) and Task 6 (two sequential banks through `applyMissionResultToRoster`).
3. **Paused, title-up, chart-open and triple-time frames.** Airborne seconds come from world ticks advanced × `DT`, never wall time: paused adds 0, triple time adds 3×. Pinned in Task 5.
4. **A half-migrated or hand-edited record** (e.g. `career` present but `landings` missing a key) loads with the missing numbers zeroed rather than throwing, which would wipe the whole roster through `loadRoster`'s catch. Pinned in Task 6.
5. **Pilot name containing markup** (`<b>Ace</b>`) shows literally in the roster row and the dossier. Pinned in Task 9 (Tier 2).

## Rulings (plan-time, 2026-09-25)

- **Terrain is not a boot stage** (spec §A.2 correction): `loadTerrainProgressively` runs after the loop starts and a ground spawn is already held until its field arrives.
- **`ready` = the first `frameFn` call has returned.** That call is the shader build (spec §A.1 profile).
- **The Dossier button is never locked**: it only reads `localStorage`.
- **`applyMissionResult`'s new sortie argument is optional**: every existing caller and test keeps compiling; omitting it records no log line and no career change.

---

### Task 1: `bootProgress` model

**Files:**
- Create: `src/render/bootProgress.ts`
- Test: `tests/render/bootProgress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BootStage = 'renderer' | 'sky' | 'surface' | 'shaders'
  export const BOOT_STAGES: readonly { readonly stage: BootStage; readonly weight: number; readonly label: string }[]
  export type BootProgress = {
    begin(stage: BootStage): void
    end(stage: BootStage): void
    readonly fraction: number
    readonly label: string
    readonly ready: boolean
    onChange(listener: () => void): () => void   // returns unsubscribe
  }
  export function createBootProgress(): BootProgress
  export function readyBootProgress(): BootProgress   // already ready; the default for createTitleScreen
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/render/bootProgress.test.ts
import { describe, expect, it } from 'vitest'
import { BOOT_STAGES, createBootProgress, readyBootProgress } from '../../src/render/bootProgress.js'

describe('bootProgress (loading spec §A.2)', () => {
  it('starts at zero with the first stage waiting, not ready', () => {
    const p = createBootProgress()
    expect(p.fraction).toBe(0)
    expect(p.ready).toBe(false)
    expect(p.label).toBe('Preparing aircraft...')
  })

  it('advances the fraction by stage weight only when a stage ends, and labels the running stage', () => {
    const p = createBootProgress()
    const total = BOOT_STAGES.reduce((s, x) => s + x.weight, 0)
    p.begin('renderer')
    expect(p.label).toBe(BOOT_STAGES[0]!.label)
    expect(p.fraction).toBe(0)
    p.end('renderer')
    expect(p.fraction).toBeCloseTo(BOOT_STAGES[0]!.weight / total, 10)
  })

  it('is ready exactly when the shaders stage ends, at fraction 1', () => {
    const p = createBootProgress()
    for (const { stage } of BOOT_STAGES) { p.begin(stage); p.end(stage) }
    expect(p.ready).toBe(true)
    expect(p.fraction).toBe(1)
  })

  it('throws on an end without its begin, and on a stage out of order', () => {
    const p = createBootProgress()
    expect(() => p.end('renderer')).toThrow(/renderer/)
    expect(() => p.begin('sky')).toThrow(/renderer/)
  })

  it('notifies listeners on every change, and a ready listener fires once, not again', () => {
    const p = createBootProgress()
    let calls = 0
    const off = p.onChange(() => { calls++ })
    p.begin('renderer')
    expect(calls).toBe(1)
    off()
    p.end('renderer')
    expect(calls).toBe(1)
  })

  it('readyBootProgress is ready at fraction 1 and never calls a listener', () => {
    const p = readyBootProgress()
    let calls = 0
    p.onChange(() => { calls++ })
    expect(p.ready).toBe(true)
    expect(p.fraction).toBe(1)
    expect(calls).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/bootProgress.test.ts`
Expected: FAIL, cannot resolve `../../src/render/bootProgress.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/render/bootProgress.ts
/**
 * The title screen's loading strip, as a model (loading spec §A.2). Stages
 * run strictly in `BOOT_STAGES` order; the fraction moves only when a stage
 * ENDS, because a stage's own work is one blocking task the page cannot
 * paint through -- the strip's moving stripe (a compositor-driven CSS
 * transform, titleScreen.ts) is what shows it is still alive in between.
 *
 * Weights are from the 2026-09-25 boot measurement (spec §A.1), re-measured
 * after the cloud-shader fix (spec §A.3). Terrain is deliberately absent:
 * it loads after the render loop starts and a ground spawn is held until it
 * lands (plan ruling, spec §A.2).
 */
export type BootStage = 'renderer' | 'sky' | 'surface' | 'shaders'

export const BOOT_STAGES: readonly { readonly stage: BootStage; readonly weight: number; readonly label: string }[] = [
  { stage: 'renderer', weight: 1, label: 'Starting the graphics device...' },
  { stage: 'sky', weight: 2, label: 'Loading the sky...' },
  { stage: 'surface', weight: 2, label: 'Loading the ocean and land...' },
  { stage: 'shaders', weight: 3, label: 'Compiling shaders...' },
]

const IDLE_LABEL = 'Preparing aircraft...'
const TOTAL_WEIGHT = BOOT_STAGES.reduce((sum, s) => sum + s.weight, 0)

export type BootProgress = {
  begin(stage: BootStage): void
  end(stage: BootStage): void
  readonly fraction: number
  readonly label: string
  readonly ready: boolean
  /** Returns the unsubscribe; `titleScreen.ts` subscribes once per `build()`. */
  onChange(listener: () => void): () => void
}

export function createBootProgress(): BootProgress {
  let next = 0                      // index of the stage expected to begin
  let running: BootStage | null = null
  let done = 0                      // summed weight of ended stages
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const l of [...listeners]) l() }
  return {
    begin(stage) {
      const expected = BOOT_STAGES[next]
      if (running !== null || expected === undefined || expected.stage !== stage) {
        throw new Error(`boot stage "${stage}" began out of order (expected "${expected?.stage ?? 'none'}"${running ? `, "${running}" still running` : ''})`)
      }
      running = stage
      notify()
    },
    end(stage) {
      if (running !== stage) throw new Error(`boot stage "${stage}" ended without beginning`)
      done += BOOT_STAGES[next]!.weight
      running = null
      next++
      notify()
    },
    get fraction() { return next >= BOOT_STAGES.length ? 1 : done / TOTAL_WEIGHT },
    get label() {
      if (running === null) return IDLE_LABEL
      return BOOT_STAGES.find((s) => s.stage === running)!.label
    },
    get ready() { return next >= BOOT_STAGES.length },
    onChange(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** Already finished: what `createTitleScreen` uses when no boot is passed. */
export function readyBootProgress(): BootProgress {
  const p = createBootProgress()
  for (const { stage } of BOOT_STAGES) { p.begin(stage); p.end(stage) }
  return p
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render/bootProgress.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/bootProgress.ts tests/render/bootProgress.test.ts
git commit -m "Boot progress model: ordered weighted stages, ready on the shader build"
```
Expected: `rc=0`.

---

### Task 2: Title screen strip and lock

**Files:**
- Modify: `src/render/titleScreen.ts` (`TitleModel`/`titleModel()` ~l.27-78; `createTitleScreen` signature ~l.293-312; `build()` ~l.342 onward; `onKey` ~l.781; `newGame` enable in `selectPilot` ~l.585)
- Test: `tests/render/titleScreen.test.ts`

**Interfaces:**
- Consumes: `BootProgress`, `readyBootProgress` (Task 1).
- Produces: `createTitleScreen(root, currentScenarioId, onNewGame, settings = createSettingsModel(), boot: BootProgress = readyBootProgress())`; `TitleModel.preparing: string` = `'Preparing aircraft...'`; overlay attribute `data-ww2-ready="true"|"false"`; the strip carries `data-ww2-boot` and `role="progressbar"` with `aria-valuenow` 0..100.

- [ ] **Step 1: Write the failing test** (append to `tests/render/titleScreen.test.ts`)

```ts
describe('the loading strip (loading spec §A.2)', () => {
  it('names the locked-state line', () => {
    expect(titleModel().preparing).toBe('Preparing aircraft...')
  })

  it('accepts a boot progress as the fifth argument (type-level contract)', () => {
    // main.ts passes createBootProgress(); omitting it means "already ready"
    // (readyBootProgress). A regression that dropped the parameter fails tsc
    // at main.ts's call site; this pins the parameter type here too.
    type Params = Parameters<typeof createTitleScreen>
    const boot: Params[4] = readyBootProgress()
    expect(boot?.ready).toBe(true)
  })
})
```
Add `createTitleScreen` to the existing import from `../../src/render/titleScreen.js`, and `import { readyBootProgress } from '../../src/render/bootProgress.js'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/titleScreen.test.ts`
Expected: FAIL, `preparing` undefined / type error on `Params[4]` under `npm run typecheck`.

- [ ] **Step 3: Implement**

In `TitleModel` add `readonly preparing: string` and in `titleModel()` return `preparing: 'Preparing aircraft...'`.

Add the fifth parameter after `settings`:
```ts
  /** The boot sequence's progress (loading spec §A.2). Until `ready`, every
   *  control that starts or configures a flight is disabled and the strip is
   *  shown; the Dossier is not locked (read-only). Defaults to already-ready
   *  so a title built without it behaves exactly as before. */
  boot: BootProgress = readyBootProgress(),
```

Module-level, beside the other style constants:
```ts
// The stripe runs on the compositor (a `transform` animation), so it keeps
// moving while the main thread is blocked by a shader build -- the whole
// reason for it (loading spec §A.2). The fill width only changes between
// stages, when the thread is free to paint.
const BOOT_STRIP_CSS = `
[data-ww2-boot]{position:relative;height:6px;margin:10px 0 4px;background:rgba(0,0,0,.12);overflow:hidden}
[data-ww2-boot] .fill{position:absolute;inset:0 auto 0 0;background:var(--ink-faint);transition:width .25s}
[data-ww2-boot] .stripe{position:absolute;inset:0;width:40%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:ww2-boot-stripe 1.1s linear infinite;will-change:transform}
@keyframes ww2-boot-stripe{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
`
```

Inside `build()`, directly after `rosterSheet.appendChild(tableScroll)` and before `flyingAs`:
```ts
    const bootWrap = document.createElement('div')
    const bootStyle = document.createElement('style')
    bootStyle.textContent = BOOT_STRIP_CSS
    const bootBar = document.createElement('div')
    bootBar.dataset.ww2Boot = ''
    bootBar.setAttribute('role', 'progressbar')
    bootBar.setAttribute('aria-valuemin', '0')
    bootBar.setAttribute('aria-valuemax', '100')
    const bootFill = document.createElement('div')
    bootFill.className = 'fill'
    const bootStripe = document.createElement('div')
    bootStripe.className = 'stripe'
    bootBar.append(bootFill, bootStripe)
    const bootLabel = document.createElement('p')
    bootLabel.style.cssText = FLYING_AS_STYLE
    bootLabel.setAttribute('aria-live', 'polite')
    bootWrap.append(bootStyle, bootBar, bootLabel)
    rosterSheet.appendChild(bootWrap)
```

After every control exists (just before `window.addEventListener('keydown', onKey)`), add the lock:
```ts
    // Everything that starts or configures a flight; the Dossier buttons are
    // deliberately absent (read-only, plan ruling). `newGame` is handled by
    // `applyBootLock` AND `selectPilot`, so it is enabled only when both a
    // pilot is selected and the boot is ready.
    const lockable = (): HTMLButtonElement[] => [
      ...[...pilotRows.values()].map((r) => r.selectButton),
      newPilotButton, newPilotConfirm, library, about, settingsButton,
    ]
    const applyBootLock = (): void => {
      const locked = !boot.ready
      overlay.dataset.ww2Ready = String(!locked)
      for (const b of lockable()) {
        b.disabled = locked
        b.style.opacity = locked ? '.45' : ''
      }
      if (locked) {
        newGame.disabled = true
        newGame.style.opacity = '.45'
      } else if (selectedPilotId !== null) {
        newGame.disabled = false
        newGame.style.opacity = '1'
      }
      bootWrap.style.display = locked ? 'block' : 'none'
      bootFill.style.width = `${Math.round(boot.fraction * 100)}%`
      bootBar.setAttribute('aria-valuenow', String(Math.round(boot.fraction * 100)))
      bootLabel.textContent = boot.label
    }
    const wasLocked = !boot.ready
    applyBootLock()
    unsubscribeBoot?.()
    unsubscribeBoot = boot.onChange(() => {
      applyBootLock()
      // The unlock moment: focus what the player most likely wants next.
      if (boot.ready && wasLocked) {
        const first = [...pilotRows.values()][0]
        ;(first?.selectButton ?? newPilotButton).focus()
      }
    })
```
Declare `let unsubscribeBoot: (() => void) | null = null` next to `let onKey` at the top of `createTitleScreen`, and in `hide()` add `unsubscribeBoot?.(); unsubscribeBoot = null` beside the `onKey` removal.

`makePilotRow` must respect the lock for rows added later (new pilot while unlocked is fine; nothing adds rows while locked because New pilot is disabled), so no change there.

In `selectPilot`, replace the two enabling lines with:
```ts
      newGame.disabled = !boot.ready
      newGame.style.opacity = boot.ready ? '1' : '.45'
```

In `onKey`, first line of the Enter path (after the Escape block):
```ts
      if (!boot.ready) return
```

The final `newPilotButton.focus()` at the end of `build()` becomes:
```ts
    if (boot.ready) newPilotButton.focus()
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/render/titleScreen.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/titleScreen.ts tests/render/titleScreen.test.ts
git commit -m "Title screen: loading strip with a compositor-driven stripe; controls locked until boot is ready"
```

---

### Task 3: Wire the boot stages in `main.ts`

**Files:**
- Modify: `src/render/main.ts` (title creation ~l.537; `initRenderer` ~l.625; sky ~l.996-1008; surface: `createCloudField` ~l.1020 through `loadDepth` ~l.1081; loop start ~l.2180; `frameFn` ~l.1686)
- Test: `tests/render/bootProgress.test.ts` (one wiring assertion)

**Interfaces:**
- Consumes: `createBootProgress` (Task 1), `createTitleScreen(..., boot)` (Task 2).

- [ ] **Step 1: Write the failing test** (append to `tests/render/bootProgress.test.ts`)

```ts
import { readFileSync } from 'node:fs'

describe('main.ts wires every boot stage (loading spec §A.2)', () => {
  // A stage main.ts never begins leaves the title locked forever -- a
  // silent failure no DOM-less test can see, so the source is checked the
  // same way bootQuality.test.ts pins its title-screen argument.
  const main = readFileSync(new URL('../../src/render/main.ts', import.meta.url), 'utf8')
  for (const { stage } of BOOT_STAGES) {
    it(`begins and ends '${stage}'`, () => {
      expect(main).toContain(`boot.begin('${stage}')`)
      expect(main).toContain(`boot.end('${stage}')`)
    })
  }
  it('hands the boot progress to the title screen', () => {
    expect(main).toMatch(/createTitleScreen\([\s\S]*?,\s*quality\.settings,\s*boot\)/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/render/bootProgress.test.ts`
Expected: FAIL on every `main.ts` case.

- [ ] **Step 3: Implement**

Directly above `const title = createTitleScreen(`:
```ts
  // The title's loading strip (loading spec §A.2): created before the title
  // so its first build shows the locked state, and advanced below at each
  // stage this function already passes through.
  const boot = createBootProgress()
```
Pass it as the fifth argument: `createTitleScreen(root, requestedScenarioId, (loadout, scenarioId, pilotId) => { ... }, quality.settings, boot)` (confirm the existing fourth argument's exact expression and keep it).

Around `initRenderer`:
```ts
  boot.begin('renderer')
  const { renderer, adapterVerdict } = await initRenderer(canvas, true)
  boot.end('renderer')
```
Sky: `boot.begin('sky')` immediately before `const skyNoiseLoading = loadSkyNoise()`, `boot.end('sky')` immediately after `const skyNoise = await skyNoiseLoading`.
Surface: `boot.begin('surface')` immediately before `const cloudField = createCloudField(...)`; `boot.end('surface')` immediately after `oceanDepth = await loadDepth()`.
Shaders: immediately before `loop = createRafLoop(frameFn)`:
```ts
  // One paint BEFORE the first frame, which is the shader build (spec §A.1):
  // rAF alone runs before that frame's paint, so without the setTimeout hop
  // "Compiling shaders..." would not be on screen while the build blocks.
  boot.begin('shaders')
  await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
  if (deviceLost) return
```
(Move the existing `if (deviceLost) return` below the await rather than duplicating it.)
In `frameFn`, as its last statement:
```ts
    // The first frame built every material; the title can unlock.
    if (!boot.ready) boot.end('shaders')
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/render/bootProgress.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/main.ts tests/render/bootProgress.test.ts
git commit -m "Boot: report renderer, sky, surface and shader stages to the title's loading strip"
```

---

### Task 4: Tier 2 boot acceptance

**Files:**
- Create: `tests/e2e/boot.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/boot.spec.ts
import { expect, test } from '@playwright/test'

/** Loading spec §A.4. Long tasks are observed from navigation (buffered). */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: [number, number][] }
    w.__lt = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__lt.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  })
})

test('controls are locked until ready, then the first click selects a pilot', async ({ page }) => {
  // domcontentloaded, not load: 'load' waits for the 2 MB title art and can
  // land after the unlock, so the locked-state assertions below would race.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title.getByRole('button', { name: 'Settings' })).toBeDisabled()
  await expect(title.getByRole('progressbar')).toBeVisible()
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  const readyAtMs = await page.evaluate(() => performance.now())
  console.log(`navigation to ready: ${Math.round(readyAtMs)} ms`)
  await expect(title.getByRole('progressbar')).toBeHidden()
  await expect(title.getByRole('button', { name: 'Settings' })).toBeEnabled()
  // Create a pilot the instant the lock lifts; the row must take the click.
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Boot Check')
  await title.getByRole('button', { name: 'Add' }).click()
  await expect(title.locator('button[aria-pressed="true"]')).toHaveText('Boot Check')
})

test('the longest main-thread task before ready is under 1 500 ms', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  const longest = await page.evaluate(() =>
    Math.max(0, ...(window as unknown as { __lt: [number, number][] }).__lt.map(([, d]) => d)))
  console.log(`longest task before ready: ${Math.round(longest)} ms`)
  expect(longest).toBeLessThan(1_500)
})
```

- [ ] **Step 2: Run on the reference GPU** (dev server on slot 3 up, `curl` → `200`)

Run: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/boot.spec.ts`
Expected: test 1 PASS; test 2 **FAIL** at roughly 12 000 ms (the freeze Task 10 removes; it stays red through Tasks 5-9 by design, matching the spec's "A.3 lands last"). Record both printed numbers in `.superpowers/sdd/loading-dossier/progress.md`.

- [ ] **Step 3: Commit** (the failing budget is the point: Task 10 makes it pass)

```bash
npm run verify; rc=$?; echo rc=$rc
git add tests/e2e/boot.spec.ts
git commit -m "Tier 2 boot spec: locked until ready, first click lands, long-task budget (red until the shader fix)"
```

---

### Task 5: Flight segment accumulator

**Files:**
- Create: `src/render/flightRecord.ts`
- Test: `tests/render/flightRecord.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FlightSegment = { readonly flightSeconds: number; readonly maxAltitudeM: number; readonly maxTrueAirspeedMps: number }
  export const EMPTY_SEGMENT: FlightSegment
  export type SegmentSample = { readonly ticksAdvanced: number; readonly altitudeM: number; readonly speedMps: number; readonly airborne: boolean }
  export function stepSegment(s: FlightSegment, sample: SegmentSample): FlightSegment
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/render/flightRecord.test.ts
import { describe, expect, it } from 'vitest'
import { EMPTY_SEGMENT, stepSegment } from '../../src/render/flightRecord.js'
import { DT } from '../../src/sim/flight/model.js'

const air = { altitudeM: 1000, speedMps: 100, airborne: true }

describe('flight segment (dossier spec §B.2)', () => {
  it('accrues seconds from world ticks, only while airborne', () => {
    let s = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 60 })
    expect(s.flightSeconds).toBeCloseTo(60 * DT, 10)
    s = stepSegment(s, { ...air, ticksAdvanced: 60, airborne: false })
    expect(s.flightSeconds).toBeCloseTo(60 * DT, 10)
  })

  it('a paused frame (0 ticks) adds no time; triple time (3x ticks) adds 3x', () => {
    const paused = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 0 })
    expect(paused.flightSeconds).toBe(0)
    const triple = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 3 })
    expect(triple.flightSeconds).toBeCloseTo(3 * DT, 10)
  })

  it('keeps the peak altitude and speed, on the ground too', () => {
    let s = stepSegment(EMPTY_SEGMENT, { ticksAdvanced: 1, altitudeM: 3000, speedMps: 150, airborne: true })
    s = stepSegment(s, { ticksAdvanced: 1, altitudeM: 500, speedMps: 60, airborne: true })
    s = stepSegment(s, { ticksAdvanced: 1, altitudeM: 10, speedMps: 170, airborne: false })
    expect(s.maxAltitudeM).toBe(3000)
    expect(s.maxTrueAirspeedMps).toBe(170)
  })

  it('treats |velocity| as true airspeed because the sim has no wind (2026-09-25)', () => {
    // If a wind term is ever added to src/sim/flight/, the caller must pass
    // |velocity - wind| instead; this test names the assumption.
    const s = stepSegment(EMPTY_SEGMENT, { ticksAdvanced: 1, altitudeM: 0, speedMps: 123.4, airborne: true })
    expect(s.maxTrueAirspeedMps).toBe(123.4)
  })

  it('ignores a negative tick delta (a Restart rewinds the world clock)', () => {
    const s = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: -500 })
    expect(s.flightSeconds).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/render/flightRecord.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/render/flightRecord.ts
import { DT } from '../sim/flight/model.js'

/**
 * One scored stretch of flight, from a New game / Restart / previous bank
 * to the next debrief (dossier spec §B.2). Time comes from WORLD TICKS
 * advanced, not wall time, so a paused world, the title or the chart adds
 * nothing and triple time counts triple.
 */
export type FlightSegment = {
  readonly flightSeconds: number
  readonly maxAltitudeM: number
  readonly maxTrueAirspeedMps: number
}

export const EMPTY_SEGMENT: FlightSegment = { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0 }

export type SegmentSample = {
  readonly ticksAdvanced: number
  readonly altitudeM: number
  /** |velocity|: true airspeed while the sim has no wind (2026-09-25). */
  readonly speedMps: number
  readonly airborne: boolean
}

export function stepSegment(s: FlightSegment, sample: SegmentSample): FlightSegment {
  const ticks = Math.max(0, sample.ticksAdvanced)
  return {
    flightSeconds: s.flightSeconds + (sample.airborne ? ticks * DT : 0),
    maxAltitudeM: Math.max(s.maxAltitudeM, sample.altitudeM),
    maxTrueAirspeedMps: Math.max(s.maxTrueAirspeedMps, sample.speedMps),
  }
}
```

- [ ] **Step 4: Run tests** → PASS, 5 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/flightRecord.ts tests/render/flightRecord.test.ts
git commit -m "Flight segment accumulator: airborne seconds from world ticks, peak altitude and true airspeed"
```

---

### Task 6: Roster career, mission log and migration

**Files:**
- Modify: `src/render/roster.ts`
- Test: `tests/render/roster.test.ts`

**Interfaces:**
- Consumes: `FlightSegment` (Task 5), `Loadout` from `src/sim/weapons/stores.ts`.
- Produces:
  ```ts
  export type LandingKind = 'trap' | 'field' | 'ditched'
  export type LogOutcome = LandingKind | 'killed'
  export type Career = { readonly flightSeconds: number; readonly landings: Readonly<Record<LandingKind, number>>; readonly maxAltitudeM: number; readonly maxTrueAirspeedMps: number }
  export type MissionLogEntry = { readonly at: string; readonly scenarioId: string; readonly aircraft: string; readonly loadout: Loadout; readonly outcome: LogOutcome; readonly points: number; readonly killsByType: Readonly<Record<TargetType, number>>; readonly flightSeconds: number; readonly maxAltitudeM: number; readonly maxTrueAirspeedMps: number }
  export type SortieFacts = { readonly at: string; readonly scenarioId: string; readonly aircraft: string; readonly loadout: Loadout; readonly outcome: LogOutcome; readonly segment: FlightSegment }
  export const MISSION_LOG_CAP = 200
  export const ZERO_CAREER: Career
  // PilotRecord gains: readonly career: Career; readonly log: readonly MissionLogEntry[]
  export function applyMissionResult(pilot, scoreTotal, outcome, killsSinceLastBank = zeroKillsByType(), sortie?: SortieFacts): PilotRecord
  export function applyMissionResultToRoster(roster, pilotId, scoreTotal, outcome, killsSinceLastBank?, sortie?: SortieFacts): readonly PilotRecord[]
  ```

- [ ] **Step 1: Write the failing tests** (append to `tests/render/roster.test.ts`; add the new names to its import)

```ts
const facts = (over: Partial<SortieFacts> = {}): SortieFacts => ({
  at: '2026-09-25T20:00:00.000Z', scenarioId: 'leyte-cap', aircraft: 'F6F-5 Hellcat', loadout: 'clean',
  outcome: 'field', segment: { flightSeconds: 600, maxAltitudeM: 3000, maxTrueAirspeedMps: 150 }, ...over,
})

describe('career and mission log (dossier spec §B.1)', () => {
  it('a new pilot starts with a zero career and an empty log', () => {
    const p = createPilot('Ace')
    expect(p.career).toEqual(ZERO_CAREER)
    expect(p.log).toEqual([])
  })

  it('appends one log entry and folds the segment into career totals', () => {
    const p = applyMissionResult(createPilot('Ace'), 500, 'landed', zeroKillsByType(), facts({ outcome: 'trap' }))
    expect(p.log).toHaveLength(1)
    expect(p.log[0]).toMatchObject({ outcome: 'trap', points: 500, flightSeconds: 600, aircraft: 'F6F-5 Hellcat' })
    expect(p.career.flightSeconds).toBe(600)
    expect(p.career.landings).toEqual({ trap: 1, field: 0, ditched: 0 })
    expect(p.career.maxAltitudeM).toBe(3000)
  })

  it('a killed sortie logs but counts no landing; peaks keep the career maximum', () => {
    let p = applyMissionResult(createPilot('Ace'), 0, 'landed', zeroKillsByType(), facts())
    p = applyMissionResult(p, 0, 'killed', zeroKillsByType(), facts({ outcome: 'killed', segment: { flightSeconds: 10, maxAltitudeM: 100, maxTrueAirspeedMps: 200 } }))
    expect(p.career.landings).toEqual({ trap: 0, field: 1, ditched: 0 })
    expect(p.career.maxAltitudeM).toBe(3000)
    expect(p.career.maxTrueAirspeedMps).toBe(200)
    expect(p.career.flightSeconds).toBe(610)
  })

  it('without sortie facts nothing is logged (existing callers unchanged)', () => {
    const p = applyMissionResult(createPilot('Ace'), 100, 'landed')
    expect(p.log).toEqual([])
    expect(p.career).toEqual(ZERO_CAREER)
  })

  it('caps the log at 200, dropping the oldest, and keeps career totals past the cap', () => {
    let p = createPilot('Ace')
    for (let i = 0; i < MISSION_LOG_CAP + 5; i++) {
      p = applyMissionResult(p, 1, 'landed', zeroKillsByType(), facts({ at: `2026-09-25T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z` }))
    }
    expect(p.log).toHaveLength(MISSION_LOG_CAP)
    expect(p.log[0]!.at).toContain('.005Z')
    expect(p.career.landings.field).toBe(MISSION_LOG_CAP + 5)
    expect(p.career.flightSeconds).toBe(600 * (MISSION_LOG_CAP + 5))
  })

  it('land -> continue -> crash banks two separate log lines (review focus 2)', () => {
    const p0 = createPilot('Ace')
    let roster: readonly PilotRecord[] = [p0]
    roster = applyMissionResultToRoster(roster, p0.id, 100, 'landed', zeroKillsByType(), facts({ segment: { flightSeconds: 300, maxAltitudeM: 1000, maxTrueAirspeedMps: 90 } }))
    roster = applyMissionResultToRoster(roster, p0.id, 0, 'killed', zeroKillsByType(), facts({ outcome: 'killed', segment: { flightSeconds: 40, maxAltitudeM: 400, maxTrueAirspeedMps: 120 } }))
    const p = roster[0]!
    expect(p.log.map((e) => [e.outcome, e.flightSeconds])).toEqual([['field', 300], ['killed', 40]])
    expect(p.career.flightSeconds).toBe(340)
  })
})

describe('migrate on read (dossier spec §B.3)', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } },
    }
  })
  const legacy = (): Record<string, unknown> => {
    const { career: _c, log: _l, ...rest } = createPilot('Old Timer') as unknown as Record<string, unknown>
    return { ...rest, cumulativeScore: 9000, sorties: 7 }
  }

  it('a pre-dossier record loads with a zero career and an empty log, keeping its score', () => {
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem('ww2airsim.roster.v1', JSON.stringify([legacy()]))
    const [p] = loadRoster()
    expect(p!.career).toEqual(ZERO_CAREER)
    expect(p!.log).toEqual([])
    expect(p!.cumulativeScore).toBe(9000)
  })

  it('a partial career (landings missing a key) is zero-filled, not a thrown roster (review focus 4)', () => {
    const rec = { ...legacy(), career: { flightSeconds: 12, landings: { trap: 2 }, maxAltitudeM: 5 }, log: [] }
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem('ww2airsim.roster.v1', JSON.stringify([rec]))
    const [p] = loadRoster()
    expect(p!.career).toEqual({ flightSeconds: 12, landings: { trap: 2, field: 0, ditched: 0 }, maxAltitudeM: 5, maxTrueAirspeedMps: 0 })
  })

  it('a pre-dossier export still imports; a populated log round-trips', () => {
    expect(importRoster(JSON.stringify([legacy()]))[0]!.log).toEqual([])
    const flown = applyMissionResult(createPilot('Ace'), 5, 'landed', zeroKillsByType(), facts())
    expect(importRoster(exportRoster([flown]))).toEqual([flown])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/render/roster.test.ts`
Expected: FAIL (new names not exported).

- [ ] **Step 3: Implement in `roster.ts`**

Imports: `import type { Loadout } from '../sim/weapons/stores.js'` and `import type { FlightSegment } from './flightRecord.js'`.

Add the types and constants from **Interfaces** above, with:
```ts
export const MISSION_LOG_CAP = 200
export const ZERO_CAREER: Career = { flightSeconds: 0, landings: { trap: 0, field: 0, ditched: 0 }, maxAltitudeM: 0, maxTrueAirspeedMps: 0 }
```
Add `readonly career: Career` and `readonly log: readonly MissionLogEntry[]` to `PilotRecord`; `createPilot` returns `career: ZERO_CAREER, log: []`.

`applyMissionResult` gains `sortie?: SortieFacts` as a fifth parameter, and its returned object adds:
```ts
    ...(sortie === undefined ? {} : {
      career: foldCareer(pilot.career, sortie),
      log: [...pilot.log, logEntry(sortie, scoreTotal, killsSinceLastBank)].slice(-MISSION_LOG_CAP),
    }),
```
with module-level helpers:
```ts
function foldCareer(c: Career, s: SortieFacts): Career {
  return {
    flightSeconds: c.flightSeconds + s.segment.flightSeconds,
    landings: s.outcome === 'killed' ? c.landings : { ...c.landings, [s.outcome]: c.landings[s.outcome] + 1 },
    maxAltitudeM: Math.max(c.maxAltitudeM, s.segment.maxAltitudeM),
    maxTrueAirspeedMps: Math.max(c.maxTrueAirspeedMps, s.segment.maxTrueAirspeedMps),
  }
}
function logEntry(s: SortieFacts, points: number, kills: Readonly<Record<TargetType, number>>): MissionLogEntry {
  return {
    at: s.at, scenarioId: s.scenarioId, aircraft: s.aircraft, loadout: s.loadout, outcome: s.outcome,
    points, killsByType: kills, ...s.segment,
  }
}
```
`applyMissionResultToRoster` gains the same trailing `sortie?: SortieFacts` and passes it through.

In `validatePilot`, after the existing checks, replace `return v as unknown as PilotRecord` with:
```ts
  // Dossier spec §B.3: pre-dossier records (and hand-edited partial ones)
  // are completed with zeros, never thrown -- a throw here empties the whole
  // roster through loadRoster's catch (review focus 4).
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  const c = (typeof v.career === 'object' && v.career !== null ? v.career : {}) as Record<string, unknown>
  const l = (typeof c.landings === 'object' && c.landings !== null ? c.landings : {}) as Record<string, unknown>
  const career: Career = {
    flightSeconds: num(c.flightSeconds),
    landings: { trap: num(l.trap), field: num(l.field), ditched: num(l.ditched) },
    maxAltitudeM: num(c.maxAltitudeM),
    maxTrueAirspeedMps: num(c.maxTrueAirspeedMps),
  }
  const log = Array.isArray(v.log) ? (v.log as MissionLogEntry[]) : []
  return { ...(v as unknown as PilotRecord), career, log }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/render/roster.test.ts tests/render/titleScreen.test.ts tests/render/debrief.test.ts`
Expected: PASS (existing roster tests unchanged).

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/roster.ts tests/render/roster.test.ts
git commit -m "Roster: career totals and a 200-entry mission log, migrated on read"
```

---

### Task 7: Record flights in `main.ts`

**Files:**
- Modify: `src/render/main.ts` (state near `scoredThroughKillsByType` ~l.252; its resets ~l.549 and ~l.1347; `bankMissionResult` ~l.1392; the three bank sites ~l.1933-1969; `frameFn` after `nextFrameState` ~l.1748)
- Test: `tests/render/flightRecord.test.ts` (source wiring pin)

**Interfaces:**
- Consumes: `stepSegment`, `EMPTY_SEGMENT` (Task 5); `SortieFacts`, `LogOutcome` (Task 6); `onGround` from `src/sim/ground.ts`; `playerAircraft` from `src/sim/loop.ts`.

- [ ] **Step 1: Write the failing wiring test** (append to `tests/render/flightRecord.test.ts`)

```ts
import { readFileSync } from 'node:fs'

describe('main.ts records every flight segment (dossier spec §B.2)', () => {
  const main = readFileSync(new URL('../../src/render/main.ts', import.meta.url), 'utf8')
  it('steps the segment every frame and resets it wherever the kill baseline resets', () => {
    expect(main).toContain('segment = stepSegment(segment,')
    // Indented ASSIGNMENTS only -- the two `let` declarations do not match
    // the whitespace-then-name anchor. 5 today: New game, Restart, and the
    // three bank sites.
    const killResets = main.match(/^\s+scoredThroughKillsByType = /gm)?.length ?? 0
    const segResets = main.match(/^\s+segment = EMPTY_SEGMENT/gm)?.length ?? 0
    expect(killResets).toBe(5)
    expect(segResets).toBe(killResets)
  })
  it('passes sortie facts at all three bank sites', () => {
    expect(main.match(/bankMissionResult\([^)]*sortieFacts\(/g)?.length).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/render/flightRecord.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Imports to add to `main.ts`: `stepSegment`, `EMPTY_SEGMENT`, `type FlightSegment` from `./flightRecord.js`; `type SortieFacts`, `type LogOutcome` from `./roster.js`; `onGround` from `../sim/ground.js`; `length` from `../sim/math/vec3.js` if not already imported. `requestedScenarioId` is `main.ts`'s live scenario variable (it is reassigned on an in-session switch; `TitleScreenHandle.show`'s doc comment relies on the same fact).

Beside `let scoredThroughKillsByType = zeroKillsByType()`:
```ts
  /** The flight since the last New game / Restart / bank (dossier spec
   *  §B.2); reset at exactly the places `scoredThroughKillsByType` is, so a
   *  land -> Continue -> crash logs two segments that do not overlap. */
  let segment: FlightSegment = EMPTY_SEGMENT
  let segmentTick = 0
```
Beside EVERY `scoredThroughKillsByType = ` assignment (the New game handler, Restart, and the three bank sites), add `segment = EMPTY_SEGMENT` on the next line.

In `frameFn`, right after `let current = nextFrameState(...)` and its camera adjustments:
```ts
    {
      const { spec: pSpec, state: pState } = playerAircraft(current.world)
      // The same ground the diagnostics hook's `groundHeightM` reads: terrain
      // OR a carrier deck, so a trap's deck roll-out is not "airborne".
      const ground = groundUnder(current.world.terrain, decksOf(current.world.ships), pState.position.x, pState.position.z)?.heightM ?? 0
      segment = stepSegment(segment, {
        ticksAdvanced: current.world.tick - segmentTick,
        altitudeM: pState.position.y,
        speedMps: length(pState.velocity),
        airborne: !onGround(pSpec, pState, ground),
      })
      segmentTick = current.world.tick
    }
```
`groundUnder` and `decksOf` are already imported by `main.ts` (the diagnostics hook's `groundHeightM`, ~l.781, uses them); `length` is `src/sim/math/vec3.ts`'s.

Add a helper above `bankMissionResult`:
```ts
  const sortieFacts = (outcome: LogOutcome, world: FrameState['world']): SortieFacts => ({
    at: new Date().toISOString(),
    scenarioId: requestedScenarioId,
    aircraft: playerAircraft(world).spec.name,
    loadout: chosenLoadout,
    outcome,
    segment,
  })
```
`bankMissionResult` gains a fourth parameter `sortie: SortieFacts` and passes it as the last argument of `applyMissionResultToRoster`. The bank sites call it BEFORE their `segment = EMPTY_SEGMENT` line:
- impact: `bankMissionResult(model.score.total, hit.kind === 'ditched' ? 'ditched' : 'killed', killsSinceLastBank, sortieFacts(hit.kind === 'ditched' ? 'ditched' : 'killed', current.world))`
- destruction: `bankMissionResult(model.score.total, 'killed', killsSinceLastBank, sortieFacts('killed', current.world))`
- landing: `bankMissionResult(model.score.total, 'landed', killsSinceLastBank, sortieFacts(current.landing.report.at?.kind === 'carrier' ? 'trap' : 'field', current.world))`

- [ ] **Step 4: Run tests** → `npx vitest run tests/render/flightRecord.test.ts` PASS.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/main.ts tests/render/flightRecord.test.ts
git commit -m "Record each flight segment and bank it with the debrief as a mission log entry"
```

---

### Task 8: Dossier model and sheet

**Files:**
- Create: `src/render/dossier.ts`
- Modify: `src/render/titleScreen.ts` (roster table header ~l.444 and `makePilotRow` ~l.606)
- Test: `tests/render/dossier.test.ts`

**Interfaces:**
- Consumes: `PilotRecord`, `RANK_LADDER`, `MissionLogEntry` (Task 6); `TARGET_TYPES`.
- Produces:
  ```ts
  export function formatHours(seconds: number): string            // 3725 -> '1:02'
  export function formatFeet(m: number): string                   // 3048 -> '10,000 ft'
  export function formatKnots(mps: number): string                // 100 -> '194 kt'
  export function nextRankProgress(score: number): { readonly next: Rank | null; readonly fraction: number }
  export type DossierModel = { header: {...}; record: readonly (readonly [string, string])[]; kills: readonly (readonly [string, number])[]; badges: readonly string[]; badgesEmpty: string; since: string; log: readonly DossierLogRow[] }
  export function dossierModel(pilot: PilotRecord, scenarioLabel: (id: string) => string): DossierModel
  export function openDossier(host: HTMLElement, pilot: PilotRecord, scenarioLabel: (id: string) => string, onClose: () => void): void
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/render/dossier.test.ts
import { describe, expect, it } from 'vitest'
import { dossierModel, formatFeet, formatHours, formatKnots, nextRankProgress } from '../../src/render/dossier.js'
import { RANK_LADDER, applyMissionResult, createPilot } from '../../src/render/roster.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'

const label = (id: string): string => `Scenario ${id}`

describe('dossier formatting (dossier spec §B.4)', () => {
  it('formats hours as h:mm, feet with separators, knots rounded', () => {
    expect(formatHours(0)).toBe('0:00')
    expect(formatHours(3725)).toBe('1:02')
    expect(formatFeet(3048)).toBe('10,000 ft')
    expect(formatKnots(100)).toBe('194 kt')
  })

  it('reports progress to the next rank, and none at the top', () => {
    expect(nextRankProgress(1_250)).toEqual({ next: RANK_LADDER[1], fraction: 0.5 })
    const top = RANK_LADDER[RANK_LADDER.length - 1]!
    expect(nextRankProgress(top.threshold + 1)).toEqual({ next: null, fraction: 1 })
  })
})

describe('dossierModel', () => {
  it('an unflown pilot: empty-state lines, zeroed record', () => {
    const m = dossierModel(createPilot('Ace'), label)
    expect(m.since).toBe('No missions logged yet')
    expect(m.badges).toEqual([])
    expect(m.badgesEmpty).toBe('No badges yet — awarded for completing mission objectives.')
    expect(m.record).toContainEqual(['Flight hours', '0:00'])
    expect(m.log).toEqual([])
  })

  it('a flown pilot: records-since date, landings split, log newest first', () => {
    let p = createPilot('Ace')
    const seg = { flightSeconds: 3600, maxAltitudeM: 3048, maxTrueAirspeedMps: 100 }
    p = applyMissionResult(p, 100, 'landed', zeroKillsByType(), { at: '2026-09-20T10:00:00.000Z', scenarioId: 'a', aircraft: 'F6F-5 Hellcat', loadout: 'clean', outcome: 'trap', segment: seg })
    p = applyMissionResult(p, 50, 'ditched', { ...zeroKillsByType(), fighter: 2 }, { at: '2026-09-21T10:00:00.000Z', scenarioId: 'b', aircraft: 'F6F-5 Hellcat', loadout: 'both', outcome: 'ditched', segment: seg })
    const m = dossierModel(p, label)
    expect(m.since).toBe('Records kept since 2026-09-20')
    expect(m.record).toContainEqual(['Landings', '1 trap · 0 field · 1 ditched'])
    expect(m.record).toContainEqual(['Highest altitude', '10,000 ft'])
    expect(m.record).toContainEqual(['Fastest speed', '194 kt TAS'])
    expect(m.log.map((r) => r.scenario)).toEqual(['Scenario b', 'Scenario a'])
    expect(m.log[0]!.kills).toBe(2)
    expect(m.kills).toContainEqual(['Fighter', 2])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/render/dossier.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement `src/render/dossier.ts`**

```ts
import { ensureStampFilter } from './ui/navalComms.js'
import { RANK_LADDER, type PilotRecord, type Rank } from './roster.js'
import { TARGET_TYPES } from '../sim/weapons/targetType.js'

/**
 * The pilot Dossier (dossier spec §B.4): a pure model for Tier 1 and a thin
 * memo-sheet DOM, the debrief.ts split. Every pilot-supplied string reaches
 * the DOM through `textContent` only.
 */
const FT_PER_M = 1 / 0.3048
const KT_PER_MPS = 1.943844

export const formatHours = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}
export const formatFeet = (m: number): string => `${Math.round(m * FT_PER_M).toLocaleString('en-US')} ft`
export const formatKnots = (mps: number): string => `${Math.round(mps * KT_PER_MPS)} kt`

export function nextRankProgress(score: number): { readonly next: Rank | null; readonly fraction: number } {
  const i = RANK_LADDER.findIndex((r) => r.threshold > score)
  if (i === -1) return { next: null, fraction: 1 }
  const prev = RANK_LADDER[i - 1]!
  const next = RANK_LADDER[i]!
  return { next, fraction: (score - prev.threshold) / (next.threshold - prev.threshold) }
}

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const OUTCOME_LABEL = { trap: 'Trap', field: 'Field landing', ditched: 'Ditched', killed: 'Killed' } as const

export type DossierLogRow = {
  readonly date: string; readonly scenario: string; readonly aircraft: string; readonly outcome: string
  readonly points: number; readonly kills: number; readonly time: string; readonly altitude: string; readonly speed: string
}
export type DossierModel = {
  readonly header: { readonly name: string; readonly rank: string; readonly status: string; readonly score: number; readonly nextRank: string; readonly fraction: number }
  readonly record: readonly (readonly [string, string])[]
  readonly kills: readonly (readonly [string, number])[]
  readonly badges: readonly string[]
  readonly badgesEmpty: string
  readonly since: string
  readonly log: readonly DossierLogRow[]
}

export function dossierModel(pilot: PilotRecord, scenarioLabel: (id: string) => string): DossierModel {
  const { next, fraction } = nextRankProgress(pilot.cumulativeScore)
  const c = pilot.career
  const status = pilot.status === 'kia' ? 'K.I.A.' : 'Active'
  return {
    header: {
      name: pilot.name,
      rank: `${pilot.rank.abbrev}, ${pilot.rank.name}`,
      status: pilot.resurrections > 0 ? `${status} · resurrected ${pilot.resurrections}×` : status,
      score: pilot.cumulativeScore,
      nextRank: next === null ? 'Highest rank' : `Next: ${next.name} at ${next.threshold.toLocaleString('en-US')}`,
      fraction,
    },
    record: [
      ['Flight hours', formatHours(c.flightSeconds)],
      ['Sorties', String(pilot.sorties)],
      ['Missions', String(pilot.missionsFlown)],
      ['Landings', `${c.landings.trap} trap · ${c.landings.field} field · ${c.landings.ditched} ditched`],
      ['Highest altitude', formatFeet(c.maxAltitudeM)],
      ['Fastest speed', `${formatKnots(c.maxTrueAirspeedMps)} TAS`],
    ],
    kills: TARGET_TYPES.map((t) => [titleCase(t === 'aaa' ? 'AAA' : t), pilot.killsByType[t]] as const),
    badges: pilot.badges,
    badgesEmpty: 'No badges yet — awarded for completing mission objectives.',
    since: pilot.log.length === 0 ? 'No missions logged yet' : `Records kept since ${pilot.log[0]!.at.slice(0, 10)}`,
    log: [...pilot.log].reverse().map((e) => ({
      date: e.at.slice(0, 10),
      scenario: scenarioLabel(e.scenarioId),
      aircraft: e.aircraft,
      outcome: OUTCOME_LABEL[e.outcome],
      points: e.points,
      kills: Object.values(e.killsByType).reduce((s, n) => s + n, 0),
      time: formatHours(e.flightSeconds),
      altitude: formatFeet(e.maxAltitudeM),
      speed: formatKnots(e.maxTrueAirspeedMps),
    })),
  }
}
```
The `titleCase` for `'aaa'` above yields `'AAA'`; the others yield `'Fighter'`, `'Bomber'` and so on, as the test expects.

Then the DOM, in the same file. It follows the About panel's overlay pattern (`titleScreen.ts` ~l.513-548: `.naval-comms` wrapper with `position:absolute;inset:0;overflow-y:auto;background:rgba(11,13,16,.82);z-index:30`, a `.sheet` inside):
```ts
export function openDossier(host: HTMLElement, pilot: PilotRecord, scenarioLabel: (id: string) => string, onClose: () => void): void {
  ensureStampFilter()
  const m = dossierModel(pilot, scenarioLabel)
  const panel = document.createElement('div')
  panel.className = 'naval-comms'
  panel.dataset.ww2Dossier = ''
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', `Dossier: ${pilot.name}`)
  panel.style.cssText = 'position:absolute;inset:0;overflow-y:auto;background:rgba(11,13,16,.82);z-index:30;display:flex'
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.style.cssText = 'width:min(900px,92vw);margin:4vh auto'
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag)
    if (text !== undefined) e.textContent = text
    if (className !== undefined) e.className = className
    return e
  }
  const heading = (t: string): HTMLDivElement => el('div', t, 'form-section-title')
  const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]): HTMLTableElement => {
    const t = el('table', undefined, 'form-table')
    const hr = el('tr'); for (const h of head) hr.appendChild(el('th', h))
    const thead = el('thead'); thead.appendChild(hr)
    const tbody = el('tbody')
    for (const r of rows) {
      const tr = el('tr')
      for (const c of r) { const td = el('td', String(c)); if (typeof c === 'number') td.className = 'num'; tr.appendChild(td) }
      tbody.appendChild(tr)
    }
    t.append(thead, tbody)
    return t
  }

  // 1. Header
  sheet.appendChild(el('div', 'Pilot Dossier', 'letterhead-kicker'))
  sheet.appendChild(el('div', m.header.name, 'letterhead-title'))
  sheet.appendChild(el('p', `${m.header.rank} · ${m.header.status} · ${m.header.score.toLocaleString('en-US')} points`))
  const bar = el('div')
  bar.setAttribute('role', 'progressbar')
  bar.setAttribute('aria-valuenow', String(Math.round(m.header.fraction * 100)))
  bar.style.cssText = 'height:6px;background:rgba(0,0,0,.12)'
  const fill = el('div'); fill.style.cssText = `height:100%;width:${Math.round(m.header.fraction * 100)}%;background:var(--ink-faint)`
  bar.appendChild(fill)
  sheet.append(bar, el('p', m.header.nextRank))
  // 2. Service record
  sheet.append(heading('Service Record'), table(['', ''], m.record))
  // 3. Kills
  sheet.append(heading('Kills by Type'), table(['Type', 'Kills'], m.kills))
  // 4. Badges
  sheet.appendChild(heading('Badges'))
  if (m.badges.length === 0) sheet.appendChild(el('p', m.badgesEmpty))
  else { const row = el('div'); for (const b of m.badges) row.appendChild(el('span', b, 'stamp-chip')); sheet.appendChild(row) }
  // 5. Mission log
  sheet.append(heading('Mission Log'), el('p', m.since))
  const logScroll = el('div'); logScroll.style.cssText = 'max-height:40vh;overflow-y:auto'
  logScroll.appendChild(table(['Date', 'Scenario', 'Aircraft', 'Outcome', 'Points', 'Kills', 'Time', 'Peak alt', 'Peak spd'],
    m.log.map((r) => [r.date, r.scenario, r.aircraft, r.outcome, r.points, r.kills, r.time, r.altitude, r.speed])))
  sheet.appendChild(logScroll)
  // Close
  const close = el('button', 'Close', 'ink-button')
  const row = el('div', undefined, 'button-row'); row.appendChild(close)
  sheet.appendChild(row)
  panel.appendChild(sheet)
  host.appendChild(panel)

  const done = (): void => { window.removeEventListener('keydown', onKey, true); panel.remove(); onClose() }
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return
    // Capture phase + stop: neither Escape nor Enter may reach the title's
    // own onKey (which would advance or launch) while the dossier is open.
    e.stopPropagation()
    if (e.code === 'Escape') { e.preventDefault(); done() }
  }
  window.addEventListener('keydown', onKey, true)
  close.addEventListener('click', done)
  close.focus()
}
```
Before writing, check `naval-comms.css` for the exact class names (`letterhead-kicker`, `letterhead-title`, `form-section-title`, `form-table`, `ink-button`, `button-row`, `stamp-chip`) via the `letterhead()`/`sectionTitle()`/`inkButton()` helpers in `titleScreen.ts`, and match them.

In `titleScreen.ts`:
- Header labels become `['Name', 'Rank', 'Score', 'Sorties', 'Kills', 'Status', '']`.
- In `makePilotRow`, after `statusCell`:
  ```ts
      // Read-only, so never boot-locked (plan ruling): not in `lockable()`.
      const dossierCell = document.createElement('td')
      const dossierButton = inkButton('Dossier')
      dossierButton.setAttribute('aria-label', `Dossier: ${pilot.name}`)
      dossierButton.addEventListener('click', () => {
        // Re-read so a record banked since this row was built is shown.
        const fresh = loadRoster().find((p) => p.id === pilot.id) ?? pilot
        openDossier(overlay, fresh, scenarioLabel, () => dossierButton.focus())
      })
      dossierCell.appendChild(dossierButton)
  ```
  and append `dossierCell` to `pilotRow.append(...)`.
- Module-level: `const scenarioLabel = (id: string): string => SCENARIO_OPTIONS.find((o) => o.value === id)?.label ?? id`.

- [ ] **Step 4: Run tests** → `npx vitest run tests/render/dossier.test.ts tests/render/titleScreen.test.ts` PASS.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/dossier.ts src/render/titleScreen.ts tests/render/dossier.test.ts
git commit -m "Pilot Dossier: service record, kills, badges and mission log from each roster row"
```

---

### Task 9: Tier 2 dossier acceptance

**Files:**
- Modify: `tests/e2e/harness.ts` (new `hopAndLand`), `tests/e2e/meta-game.spec.ts` (use it)
- Create: `tests/e2e/dossier.spec.ts`

**Interfaces:**
- Produces: `export async function hopAndLand(page: Page): Promise<void>` in `harness.ts`. It starts parked on a strip with the title gone and terrain loaded, and returns with the landing debrief visible.

- [ ] **Step 1: Extract `hopAndLand` from `meta-game.spec.ts`**

Move `meta-game.spec.ts`'s take-off-and-land block VERBATIM into `harness.ts` as `hopAndLand(page)`. That block runs from `const start = await page.evaluate(...)` (the "-- Take off." comment) through `await page.keyboard.up('KeyB')` after `debriefDialog(page).waitFor(...)`. Its measured comments (the 1.2 s pulse that crashed, the 2 m/s flare loop) come with it. Move `heightAboveGroundM` and the `f6f` spec constant with it, and add imports to `harness.ts`: `loadAircraftSpec` from `../../tools/content/load.js`, `AIRBORNE_LATCH_M` from `../../src/sim/landing.js`. In `meta-game.spec.ts`, replace the moved block with `await hopAndLand(page)` and delete the now-unused locals and imports. Nothing else in that spec changes.

Run: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/meta-game.spec.ts`
Expected: PASS (a pure refactor). Commit it on its own:
```bash
npm run verify; rc=$?; echo rc=$rc
git add tests/e2e/harness.ts tests/e2e/meta-game.spec.ts
git commit -m "Tier 2 harness: hopAndLand, the measured Gunnery Range take-off and landing, shared"
```

- [ ] **Step 2: Write the dossier spec**

```ts
// tests/e2e/dossier.spec.ts
import { expect, test } from '@playwright/test'
import { debriefDialog, hopAndLand, waitForScenario, type DiagWindow } from './harness.js'

test.setTimeout(240_000)

/** Dossier spec §B.5 plus review focus 1 and 5, on Gunnery Range: the
 *  player parks on the strip, so hopAndLand is a real physics landing with
 *  no approach to hand-fly (meta-game.spec.ts's doc comment). */
test('a landed sortie appears in the dossier; the title does not re-lock', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('<b>Ace</b>')
  await title.getByRole('button', { name: 'Add' }).click()
  // Review focus 5: markup in a name shows literally.
  await expect(title.locator('button[aria-pressed="true"]')).toHaveText('<b>Ace</b>')
  await title.getByRole('button', { name: 'New game' }).click()
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()
  await waitForScenario(page, 'gunnery-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)

  await hopAndLand(page)
  await expect(debriefDialog(page)).toContainText('LANDED')
  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()

  // Review focus 1: the rebuilt title is unlocked at once, no strip.
  await expect(title.getByRole('button', { name: 'Settings' })).toBeEnabled({ timeout: 1_000 })
  await expect(page.locator('[data-ww2-boot]')).toBeHidden()

  await title.getByRole('button', { name: 'Dossier: <b>Ace</b>' }).click()
  const dossier = page.getByRole('dialog', { name: 'Dossier: <b>Ace</b>' })
  await expect(dossier).toBeVisible()
  const firstLog = dossier.locator('table').last().locator('tbody tr').first()
  await expect(firstLog).toContainText('Gunnery Range')
  await expect(firstLog).toContainText('Field landing')
  // The hop is short but real: a landing counted and a non-zero peak.
  const serviceRecord = dossier.locator('table').first()
  await expect(serviceRecord).toContainText('0 trap · 1 field · 0 ditched')
  await expect(serviceRecord).not.toContainText('Highest altitude0 ft')
  await page.keyboard.press('Escape')
  await expect(dossier).toBeHidden()
  await expect(title.getByRole('button', { name: 'Dossier: <b>Ace</b>' })).toBeFocused()
})
```
Confirm the debrief's return button label with `grep -n "Return to title" src/render/debrief.ts`. The hop's airborne time can round to `0:00` at h:mm resolution, which is why the spec asserts the landing count and a non-zero peak altitude rather than the hours.

- [ ] **Step 3: Run on the reference GPU**

Run: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/dossier.spec.ts tests/e2e/scenarioPicker.spec.ts`
Expected: all PASS. `scenarioPicker.spec.ts` proves `startGame` still works with the lock (Playwright's click waits for `enabled`).

- [ ] **Step 4: Commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add tests/e2e/dossier.spec.ts
git commit -m "Tier 2 dossier spec: a landed sortie in the log, no re-lock on return, literal names"
```

---

### Task 10: Cloud density as a per-material laid-out `Fn`

**Files:**
- Modify: `src/render/scene/cloudField.ts` (`CloudField` type ~l.130-145; `makeDensity` ~l.203-306; returned object ~l.306)
- Modify: `src/render/scene/clouds.ts` (`createClouds` ~l.150-152 and the top of `marchNode` ~l.176)
- Test: `tests/render/cloudField.test.ts`, `tests/e2e/boot.spec.ts` (from Task 4), `tests/e2e/clouds.spec.ts`, new `tests/e2e/cloudPixels.spec.ts`

**Interfaces:**
- Produces: `CloudField.laidOut(): { density: DensityFn; densityCoarse: DensityFn }` with `type DensityFn = (p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>) => Node<'float'>`. Each call returns a NEW pair.

The experiment that proved this (spec §A.3) is saved at `/tmp/claude-1000/-home-mark-projects/4b59e166-e110-56db-b748-2702f09a8a8d/scratchpad/perMaterialFn.diff`, but write the clean version below, not the experiment.

- [ ] **Step 1: Capture the "before" pixels** (on the unmodified code)

```ts
// tests/e2e/cloudPixels.spec.ts
import { test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { waitForTerrain } from './harness.js'

/** Loading spec §A.3: the density-as-function change must not change the
 *  picture. Captures a paused under-deck frame after the temporal resolve
 *  has converged; `CLOUD_PIXELS_OUT` names the output PNG. */
test('capture a converged, paused cloud frame', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?cloudTier=high')
  await waitForTerrain(page)
  await page.keyboard.press('Escape') // BINDINGS.pause (src/input/bindings.ts)
  await page.waitForTimeout(3_000)  // > 64 frames at 60 Hz: TRAA and the 1-in-16 cloud update converge
  writeFileSync(process.env.CLOUD_PIXELS_OUT ?? 'cloud-pixels.png', await page.screenshot())
})
```
Then run it twice on the unmodified code to measure the noise floor:
```bash
CLOUD_PIXELS_OUT=/tmp/claude-1000/-home-mark-projects/4b59e166-e110-56db-b748-2702f09a8a8d/scratchpad/before-1.png PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/cloudPixels.spec.ts
CLOUD_PIXELS_OUT=/tmp/claude-1000/-home-mark-projects/4b59e166-e110-56db-b748-2702f09a8a8d/scratchpad/before-2.png PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/cloudPixels.spec.ts
```

Diff tool (scratch, not committed), `scratchpad/pxdiff.py`:
```python
import sys
from PIL import Image, ImageChops
a, b = (Image.open(p).convert('RGB') for p in sys.argv[1:3])
d = ImageChops.difference(a, b)
hist = d.convert('L').histogram()
n = sum(hist); mean = sum(i * c for i, c in enumerate(hist)) / n
acc = 0; p999 = 0
for i, c in enumerate(hist):
    acc += c
    if acc >= 0.999 * n: p999 = i; break
print(f'mean {mean:.3f}  p99.9 {p999}  max {max(i for i, c in enumerate(hist) if c)}')
```
Run: `python3 .../pxdiff.py before-1.png before-2.png` and record the noise floor.

- [ ] **Step 2: Write the failing unit test** (append to `tests/render/cloudField.test.ts`)

```ts
describe('laidOut density (loading spec §A.3)', () => {
  it('returns a fresh Fn pair per call, so no two materials share one', () => {
    // three 0.186 caches a laid-out Fn's code per backend by Fn identity,
    // with the FIRST builder's binding names; sharing one across materials
    // fails WGSL validation ("unresolved value 'nodeUniform3'").
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    const a = field.laidOut()
    const b = field.laidOut()
    expect(a.density).not.toBe(b.density)
    expect(a.densityCoarse).not.toBe(b.densityCoarse)
  })
})
```
`noise` and `loadScenario` are already defined/imported at the top of this file.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/render/cloudField.test.ts`
Expected: FAIL, `laidOut is not a function`.

- [ ] **Step 4: Implement in `cloudField.ts`**

Add to the `CloudField` type, beside `density`:
```ts
  /**
   * `density`/`densityCoarse` as laid-out TSL functions (loading spec §A.3):
   * emitted once per shader as WGSL functions instead of inlined at every
   * call site -- inlining five more copies in the light march was the 12 s
   * boot freeze. Call it ONCE PER MATERIAL: each call returns a new pair,
   * and a pair must never be shared across materials (three 0.186 caches a
   * laid-out function's code by Fn identity with the first material's
   * binding names).
   */
  laidOut(): { density: DensityFn; densityCoarse: DensityFn }
```
and export `export type DensityFn = (p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>) => Node<'float'>`, using it for the existing `density`/`densityCoarse` members too.

Change `makeDensity` to take the drifted point and the threshold as parameters, and optionally lay itself out:
```ts
  const makeDensity = (detailed: boolean, layout: boolean) => {
    const fn = Fn(([p, drifted, base, thickness, coverage, kind, theta]: [Node<'vec3'>, Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
      // ... body unchanged EXCEPT: delete the `const drifted = vec3(...)`
      // line and the five lines computing `at`, `k`, `k0`, `k1`, `theta` --
      // both now arrive as parameters (see `thetaFor`/`driftedOf` below).
    })
    // Uniforms stay OUT of a laid-out Fn: `drift` and the `thresholds` array
    // are read at the call site and passed in. Textures are fine inside it
    // as long as the instance is per-material (verified 2026-09-25).
    if (layout) {
      fn.setLayout({
        name: detailed ? 'cloudDensity' : 'cloudDensityCoarse',
        type: 'float',
        inputs: [
          { name: 'p', type: 'vec3' },
          { name: 'drifted', type: 'vec3' },
          { name: 'base', type: 'float' },
          { name: 'thickness', type: 'float' },
          { name: 'coverage', type: 'float' },
          { name: 'kind', type: 'float' },
          { name: 'theta', type: 'float' },
        ],
      })
    }
    return fn
  }
  /** Cloud Fidelity II §3.3's coverage threshold, per call site. */
  const thetaFor = (coverage: Node<'float'>): Node<'float'> => {
    const at = min(coverage.mul(WEATHER_COVERAGE_GAIN), 1).mul(COVERAGE_TABLE_SIZE - 1).toVar()
    const k = min(at.floor(), float(COVERAGE_TABLE_SIZE - 2)).toVar()
    const k0 = (thresholds.element(k.toInt()) as unknown as Node<'float'>).toVar()
    const k1 = (thresholds.element(k.toInt().add(1)) as unknown as Node<'float'>).toVar()
    return mix(k0, k1, saturate(at.sub(k)))
  }
  const driftedOf = (p: Node<'vec3'>): Node<'vec3'> => vec3(p.x.add(drift.x), p.y, p.z.add(drift.y))
  const bind = (fn: ReturnType<typeof makeDensity>): DensityFn =>
    (p, base, thickness, coverage, kind) => fn(p, driftedOf(p), base, thickness, coverage, kind, thetaFor(coverage))
  const density = bind(makeDensity(true, false))
  const densityCoarse = bind(makeDensity(false, false))
```
Keep the body's existing comments on the moved lines by moving them with the code. In the returned object: `density, densityCoarse, laidOut: () => ({ density: bind(makeDensity(true, true)), densityCoarse: bind(makeDensity(false, true)) }),` replacing the two closure members.

- [ ] **Step 5: Use it in `clouds.ts`**

Delete `const density = f.density` and `const densityCoarse = f.densityCoarse` (~l.151-152). As the first lines of `marchNode`:
```ts
    // One laid-out pair per material build: `marchNode` runs once for the
    // CloudMarch material and once for CloudUpdate (loading spec §A.3).
    const { density, densityCoarse } = f.laidOut()
```
`cloudShadow.ts` is unchanged: it keeps the inline `field.density`.

- [ ] **Step 6: Tier 1 + typecheck**

Run: `npx vitest run tests/render/cloudField.test.ts tests/render/clouds.test.ts tests/render/cloudShadow.test.ts tests/render/cloudPass.test.ts`
Expected: PASS.

- [ ] **Step 7: Tier 2 acceptance on the reference GPU**

```bash
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/boot.spec.ts tests/e2e/clouds.spec.ts
CLOUD_PIXELS_OUT=/tmp/claude-1000/-home-mark-projects/4b59e166-e110-56db-b748-2702f09a8a8d/scratchpad/after.png PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/cloudPixels.spec.ts
python3 /tmp/claude-1000/-home-mark-projects/4b59e166-e110-56db-b748-2702f09a8a8d/scratchpad/pxdiff.py .../before-1.png .../after.png
```
Expected: `boot.spec.ts` both PASS (longest task ≈ 1 100 ms). `clouds.spec.ts` 10/10 with zero console errors; if only the budget tripwire fails on sample count, rerun it on the unmodified code in the same session per Global Constraints and record both. Pixel diff: `mean` ≤ 1.5 × the Step 1 noise floor's `mean`, and `p99.9` ≤ the noise floor's `p99.9` + 2 (spec: max channel delta ≤ 2 beyond noise). If it fails, **stop and report the three PNGs to Mark**. Do not tune tolerances.

Also view `after.png` (Read it) and confirm the clouds are visibly present, not a blank sky.

- [ ] **Step 8: Commit** (not `cloudPixels.spec.ts`'s PNGs)

```bash
npm run verify; rc=$?; echo rc=$rc
git add src/render/scene/cloudField.ts src/render/scene/clouds.ts tests/render/cloudField.test.ts tests/e2e/cloudPixels.spec.ts
git commit -m "Clouds: density as a per-material laid-out Fn; boot freeze 12.2 s -> ~1.1 s"
```
Put the measured before/after longest-task numbers and the pixel-diff figures in the commit body.

---

### Task 11: Full Tier 2, docs and handoff

**Files:**
- Create: `docs/handoff/2026-09-25-loading-and-dossier.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 (row 9's cell), `README.md` (one pointer paragraph), `GAMEPLAY.md` "Pilot roster" (the record's fields)

- [ ] **Step 1: Full Tier 2 on the reference GPU**

Run: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npm run test:tier2; rc=$?; echo rc=$rc`
Expected: `rc=0`. For any failure, rerun that test alone on `main`'s code in the same session. If it fails there too, it isn't this branch's fault: record both results in the handoff.

- [ ] **Step 2: Re-measure the stage weights**

Re-run `boot.spec.ts` and read its printed "navigation to ready". Using a throwaway `performance.mark` per `begin`/`end` (not committed), time each stage. Set `BOOT_STAGES` weights proportional to the measured durations, rounded to integers ≥ 1. Rerun `bootProgress.test.ts`, then commit with the measured durations in the body.

- [ ] **Step 3: Docs**

- `GAMEPLAY.md` "Pilot roster": add `career { flightSeconds, landings { trap, field, ditched }, maxAltitudeM, maxTrueAirspeedMps }` and `log[]` (latest 200 debriefs) to the field list, and one sentence pointing at the Dossier.
- §15 row 9: append "Loading strip and boot-freeze fix, pilot Dossier (career record, mission log) landed 2026-09-25 ([design](2026-09-25-loading-and-dossier-design.md), [plan](../plans/2026-09-25-loading-and-dossier.md), [handoff](../../handoff/2026-09-25-loading-and-dossier.md))." Escape any `|`.
- README: one paragraph pointing at §15 for this slice, not restating it.
- Handoff: the measured numbers (freeze before/after, time to ready, pixel-diff figures, stage durations); the three.js 0.186 laid-out-`Fn` cache trap, **stated as a trap for future shader work**: a laid-out TSL `Fn` must be one instance per material and must take uniforms as arguments. Also: open items (badges still unwritten until missions M2; roster export/import UI still open), and which flying recipe `dossier.spec.ts` uses.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify; rc=$?; echo rc=$rc
git add docs/handoff/2026-09-25-loading-and-dossier.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md GAMEPLAY.md src/render/bootProgress.ts
git commit -m "Loading strip and pilot Dossier: handoff, §15 row, README pointer, GAMEPLAY roster fields"
```

- [ ] **Step 5: Email the handoff**

`python3 tools/mail-doc.py docs/handoff/2026-09-25-loading-and-dossier.md "ww2airsim handoff: loading screen + pilot dossier"`. Exit 0 is the confirmation; never re-run with `--debug`.
