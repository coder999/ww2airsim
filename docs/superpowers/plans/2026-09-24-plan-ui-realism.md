# UI: Render Quality, Asset Quality, G-Force Toggle, Naval Comms Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the title-screen Settings dialog (Render Quality, Asset
Quality, Damage Model/G-force rows) and restyle it plus the roster and
debrief screens into the "Naval Communications" visual language, shipping
Git-LFS-backed L0 terrain for the Asset Quality tier along the way.

**Architecture:** A pure data/persistence module (`quality.ts`) underneath
a thin-DOM Settings dialog in `titleScreen.ts`, following this codebase's
existing "pure model, thin DOM" split (`debrief.ts`'s own doc comment
states this convention explicitly). The G-force toggle is a plain boolean
threaded from render-owned persisted state into `src/sim/`'s per-tick
combat processing — no new sim-side persistence, no boundary violation.
The visual redesign ports `design-prototypes/telegram-ui/`'s CSS/markup
patterns into `src/render/`, replacing DOM structure and styling only,
never the underlying data model or interaction logic already shipped
(roster/debrief) or already specified (settings).

**Tech Stack:** TypeScript, Three.js/WebGPU (`three/webgpu`), Vite, vitest,
Playwright (Tier 2), Git LFS.

**Spec:**
- `docs/superpowers/specs/2026-09-24-render-quality-selector-design.md`
  (Render Quality + Asset Quality axes, including the 2026-09-24 Git LFS
  ruling)
- `docs/superpowers/specs/2026-09-24-visual-realism-pass-design.md` §1 only
  (the G-force/Damage Model toggle — this plan does NOT implement that
  spec's §2/§3, textures or geometry)
- `docs/superpowers/specs/2026-09-24-naval-comms-ui-design.md` (visual
  redesign of roster/debrief/settings)

## Global Constraints

- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node
  core, or a rendering library (`.dependency-cruiser.cjs`,
  `tests/architecture/boundary.test.ts`). The G-force flag is a plain
  parameter passed INTO sim-side functions, never read from
  `localStorage` inside `src/sim/`.
- `src/sim/` has a single seeded PRNG; no `Math.random` anywhere in that
  tree. Nothing in this plan needs new randomness, but any code touching
  `src/sim/` must not introduce any.
- `npm run verify` (typecheck, ESLint zero-warnings, depcruise, vitest)
  ends every task. Capture `rc=$?` directly; never gate on a grepped
  pipeline.
- US spelling in new prose/identifiers.
- Every completed plan ends with a dated `docs/handoff/` document, an
  updated master spec §15 row, and a README paragraph pointing at §15.
- Escape `|` as `\|` inside markdown table cells.
- Settings-dialog controls apply immediately on click — no Save/Cancel,
  confirmed explicitly not wanted (naval-comms-ui spec §1).
- No audio volume or input-scheme (joystick/mouse) settings — confirmed
  not real scope (naval-comms-ui spec §1). Do not build them even if a
  ported prototype file still shows them.

## Review Focus

- **A malformed/corrupt `localStorage` value for quality settings** must
  not brick boot — tolerate and fall back to unset, matching `roster.ts`'s
  established `loadRoster` contract, not throw.
- **The DEV-only `?oceanTier=`/`?cloudTier=` query overrides must still
  win over a saved setting** — a Tier 2 measurement script that always
  worked must not silently start reading a stale `localStorage` value
  instead of what its own URL asked for.
- **A player who never opens Settings** must see unchanged behavior from
  today (boots at `high`, probes once, silently recommends) — this plan
  must not make "do nothing" a worse experience than before it existed.
- **Git LFS misconfiguration must fail loudly at build/verify time, not
  silently ship a pointer file as if it were real terrain data** — an LFS
  pointer file mistakenly treated as the real 134MB binary is exactly the
  "torn edge reads as a shader bug, not as bad content" failure class
  `decodeLevel`'s own existing byte-length check already guards against
  for corruption; LFS must not reopen that gap.
- **Damage-model toggle must never affect `measureStructuralStress`'s
  output** — the HUD reading must be identical on/off; only whether stress
  converts to actual damage may differ. A test that only checks "no
  damage happens" without also checking "the HUD number is unchanged"
  would miss a regression where the toggle silently zeroes the readout too.

---

### Task 1: `src/render/quality.ts` — shared type and persistence

**Files:**
- Create: `src/render/quality.ts`
- Test: `tests/render/quality.test.ts`

**Interfaces:**
- Produces: `QualityTierName`, `QualitySettings`, `AssetQualityTierName`,
  `defaultQualitySettings`, `loadQualitySettings`, `saveQualitySettings`,
  `clearQualitySettings`, `uniformTier` — consumed by Task 5 (Settings
  dialog) and Task 6 (boot sequence).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/quality.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  defaultQualitySettings, loadQualitySettings, saveQualitySettings,
  clearQualitySettings, uniformTier, type QualitySettings,
} from '../../src/render/quality.js'

function fakeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
}

describe('quality settings persistence', () => {
  beforeEach(() => {
    (globalThis as { window?: { localStorage: Storage } }).window = { localStorage: fakeLocalStorage() }
  })

  it('round-trips save/load', () => {
    const settings: QualitySettings = { ocean: 'high', scenery: 'low', clouds: 'medium' }
    saveQualitySettings(settings)
    expect(loadQualitySettings()).toEqual(settings)
  })

  it('returns null with nothing saved', () => {
    expect(loadQualitySettings()).toBeNull()
  })

  it('tolerates corrupt stored JSON, does not throw', () => {
    window.localStorage.setItem('ww2airsim.quality.v1', '{not json')
    expect(() => loadQualitySettings()).not.toThrow()
    expect(loadQualitySettings()).toBeNull()
  })

  it('clearQualitySettings removes a saved value', () => {
    saveQualitySettings(defaultQualitySettings('high'))
    clearQualitySettings()
    expect(loadQualitySettings()).toBeNull()
  })

  it('defaultQualitySettings repeats one tier three times', () => {
    expect(defaultQualitySettings('medium')).toEqual({ ocean: 'medium', scenery: 'medium', clouds: 'medium' })
  })

  it('uniformTier: all-equal returns that tier, divergence returns null', () => {
    expect(uniformTier({ ocean: 'high', scenery: 'high', clouds: 'high' })).toBe('high')
    expect(uniformTier({ ocean: 'high', scenery: 'low', clouds: 'high' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/quality.test.ts`
Expected: FAIL — `src/render/quality.ts` does not exist yet.

- [ ] **Step 3: Implement `src/render/quality.ts`**

```ts
const STORAGE_KEY = 'ww2airsim.quality.v1'

export type QualityTierName = 'high' | 'medium' | 'low'
export type AssetQualityTierName = 'low' | 'medium' | 'high' | 'ultra'

export type QualitySettings = {
  readonly ocean: QualityTierName
  readonly scenery: QualityTierName
  readonly clouds: QualityTierName
}

export function defaultQualitySettings(tier: QualityTierName): QualitySettings {
  return { ocean: tier, scenery: tier, clouds: tier }
}

const TIER_NAMES: readonly QualityTierName[] = ['high', 'medium', 'low']
function isQualityTierName(v: unknown): v is QualityTierName {
  return typeof v === 'string' && (TIER_NAMES as readonly string[]).includes(v)
}
function isQualitySettings(v: unknown): v is QualitySettings {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return isQualityTierName(o.ocean) && isQualityTierName(o.scenery) && isQualityTierName(o.clouds)
}

export function loadQualitySettings(): QualitySettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isQualitySettings(parsed)) {
      console.warn('quality settings in localStorage have an unexpected shape; ignoring:', parsed)
      return null
    }
    return parsed
  } catch (err) {
    console.warn('quality settings in localStorage are corrupt or unreadable; ignoring:', err)
    return null
  }
}

export function saveQualitySettings(settings: QualitySettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('quality settings could not be saved to localStorage:', err)
  }
}

export function clearQualitySettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('quality settings could not be cleared from localStorage:', err)
  }
}

export function uniformTier(settings: QualitySettings): QualityTierName | null {
  return settings.ocean === settings.scenery && settings.scenery === settings.clouds
    ? settings.ocean
    : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/render/quality.test.ts`
Expected: PASS, all 6 cases.

- [ ] **Step 5: Commit**

```bash
git add src/render/quality.ts tests/render/quality.test.ts
git commit -m "Add quality.ts: shared tier type and localStorage persistence"
```

---

### Task 2: Git LFS + committed L0/L1 terrain, Asset Quality wiring

**Files:**
- Create: `.gitattributes`
- Modify: `src/render/content.ts` (`FINEST_FETCHED_LEVEL` becomes a
  function of `AssetQualityTierName`)
- Modify: `tools/terrain/load.ts` (`FIRST_COMMITTED_LEVEL`, if the
  committed range needs to widen to include L0/L1 — check current value
  against what changes below before assuming)
- Modify: `.gitignore` (remove the `content/terrain/tiles/` ignore for
  whichever of L0/L1 becomes committed, or relocate the committed copies
  out of `tiles/` entirely — decide based on what's cleaner once inside
  the task, per this task's own investigation step)
- Test: `tests/render/terrainLoad.test.ts` (extend for the new
  tier-to-level mapping)
- Test: `tests/build/dist.test.ts` (extend: assert L0/L1 ship correctly
  sized, matching the existing exact-byte-count pattern used for
  `cover.bin.gz`/`rivers.json`)

**Interfaces:**
- Consumes: nothing from Task 1 directly (this task's runtime wiring is
  independent; Task 6 is what actually reads `AssetQualityTierName` from
  persisted settings and calls whatever this task produces).
- Produces: `finestFetchedLevelFor(tier: AssetQualityTierName): number`
  (or equivalent — exact naming is this task's call, consumed by Task 6's
  boot sequence).

- [ ] **Step 1: Set up Git LFS**

```bash
git lfs install
git lfs track "content/terrain/L0.bin"
git add .gitattributes
git commit -m "Configure Git LFS for terrain L0 (134MB, over GitHub's 100MB limit)"
```

Verify LFS is actually tracking, not silently a no-op:

```bash
git lfs ls-files
```

Expected: no output yet (L0.bin isn't committed until Step 3) but no
error — confirms the hook is live.

- [ ] **Step 2: Investigate the current committed/gitignored boundary before changing it**

Run directly, do not assume from the spec's own citation (verify the
current values are still what the spec recorded on 2026-09-24, since this
is a different session):

```bash
grep -n "FIRST_COMMITTED_LEVEL" tools/terrain/load.ts
ls -la content/terrain/tiles/L0.bin content/terrain/tiles/L1.bin
grep -n "terrain" .gitignore
```

Expected (per the spec, confirm unchanged): `FIRST_COMMITTED_LEVEL = 2`,
`L0.bin` ~134MB, `L1.bin` ~33.5MB, `.gitignore` excludes
`/content/terrain/tiles/`.

- [ ] **Step 3: Move L0.bin and L1.bin to the committed directory, lower `FIRST_COMMITTED_LEVEL`**

`git mv` requires its source to already be tracked — these files are
currently gitignored (never tracked), so a plain `mv` is correct here,
not `git mv`:

```bash
mv content/terrain/tiles/L1.bin content/terrain/L1.bin
mv content/terrain/tiles/L0.bin content/terrain/L0.bin
```

Update `tools/terrain/load.ts`'s `FIRST_COMMITTED_LEVEL` from `2` to `0`
(both L0 and L1 are now committed; nothing below L0 exists). Update its
doc comment, which currently states "Levels 0-1 are 168MB and are
gitignored... fetching them 404s for everyone but the machine that last
ran `npm run terrain:build`" — this sentence becomes false the moment
this step lands; correct it in place rather than leaving a stale claim
(this repo's own standing rule — see `~/projects/CLAUDE.md`'s "Docs and
comments" section, restated in this repo's own CLAUDE.md item 3).

- [ ] **Step 4: Confirm L0.bin is tracked by LFS, not committed as a raw blob**

```bash
git add content/terrain/L0.bin content/terrain/L1.bin
git status
git lfs ls-files
```

Expected: `git lfs ls-files` lists `content/terrain/L0.bin`; `L1.bin` does
NOT appear there (33.5MB doesn't need LFS, and `.gitattributes` only
tracked the `L0.bin` pattern in Step 1 — confirm `git show
:content/terrain/L1.bin | wc -c` on the staged blob reports the real
33.5MB content, not an LFS pointer, i.e. that the `.gitattributes` glob
did not accidentally also catch L1).

- [ ] **Step 5: Wire `content.ts`'s finest-fetched-level to Asset Quality**

Replace the fixed `FINEST_FETCHED_LEVEL = 2` export with:

```ts
export function finestFetchedLevelFor(tier: AssetQualityTierName): number {
  return tier === 'low' ? 1 : 0
}
```

(import `AssetQualityTierName` from `./quality.js`). Update every call
site that referenced the old constant (`src/render/terrain/load.ts`,
`src/render/terrain/lod.ts`, and any test asserting the old fixed value)
to either take the tier as a parameter or read it from wherever Task 6's
boot sequence resolves it — this task only needs the level-selection
function to exist and be correct; Task 6 wires it into the real boot
path.

- [ ] **Step 6: Update `tests/render/terrainLoad.test.ts`**

The existing test (per `src/render/terrain/load.ts`'s own doc comment)
"asserts the level it names is committed and that the next finer one is
not." That assumption flips: previously L2 was committed and L1 was not;
now L0 and L1 are both committed and nothing finer exists. Update the
assertion to match, and add a case for each of `low`/`medium`/`high`/
`ultra` resolving to the correct level via `finestFetchedLevelFor`.

- [ ] **Step 7: Extend `tests/build/dist.test.ts`**

Add exact-byte-count assertions for `content/terrain/L0.bin` (134,250,498)
and `content/terrain/L1.bin` (33,570,818) in the built `outDir`, matching
the existing pattern used for `cover.bin.gz`. **Verify the build tooling
(`npx vite build`) actually resolves and copies the LFS-tracked file
correctly** in whatever environment this test runs (CI, a fresh clone) —
an LFS pointer file left un-smudged would be a few hundred bytes of text,
not 134MB, and this exact-byte-count assertion is exactly what would
catch that silently-wrong state (this Review Focus item, restated as a
concrete test).

- [ ] **Step 8: Run the tests, verify they pass, run `npm run verify`**

Run: `npx vitest run tests/render/terrainLoad.test.ts tests/build/dist.test.ts`
Expected: PASS.
Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`.

- [ ] **Step 9: Commit**

```bash
git add content/terrain/L0.bin content/terrain/L1.bin tools/terrain/load.ts \
  src/render/content.ts src/render/terrain/load.ts src/render/terrain/lod.ts \
  tests/render/terrainLoad.test.ts tests/build/dist.test.ts
git commit -m "Ship L0/L1 terrain (L0 via Git LFS); wire Asset Quality to finest fetched level"
```

---

### Task 3: G-force/Damage Model sim-side flag

**Files:**
- Modify: `src/sim/weapons/combat.ts` (the tick-processing function
  containing lines 434-441's structural-overload loop)
- Test: `tests/sim/weapons/combat.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1/2.
- Produces: a new boolean parameter on whatever function currently wraps
  the structural-overload loop (`stepCombat` or its caller — confirm the
  exact function boundary by reading the file directly before naming the
  parameter; do not guess from this plan's own paraphrase), consumed by
  Task 5 (Settings row) and Task 6 (threading the persisted flag from
  `main.ts`/`loop.ts` into this call).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sim/weapons/combat.test.ts (new cases in the existing file)
it('measureStructuralStress output is identical regardless of the damage-model flag', () => {
  // Construct two otherwise-identical tick sequences that would overstress
  // an airframe (a hard pull well past gLimit), one with arcade damage
  // disabled and one with it enabled. Assert `stress.loadFactorG`,
  // `stress.peakLoadFactorG`, `stress.overG` etc. are bit-identical between
  // the two runs at every tick -- only `damage.structure` may differ.
})

it('arcade mode (damage disabled) never reduces structure from G/overspeed alone', () => {
  // Run a tick sequence that would destroy the airframe under normal
  // (realistic) damage rules; assert structure stays at its starting value
  // throughout when the flag disables damage, and IS reduced (regression
  // guard) when the flag is absent/false.
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sim/weapons/combat.test.ts`
Expected: FAIL (no flag parameter exists yet).

- [ ] **Step 3: Add the flag, gate only `damageFromStructuralOverload`**

Read `src/sim/weapons/combat.ts` around the structural-failure loop
(confirmed at lines 434-441 as of 2026-09-24) before editing — add a
parameter (e.g. `arcadeDamage: boolean`) to the function that owns this
loop, and change:

```ts
const damage = a.impact === null
  ? damageFromStructuralOverload(rec.damage, stress, a.spec.limits, tick, dt)
  : rec.damage
```

to skip the overload branch when `arcadeDamage` is true, while leaving
`measureStructuralStress`'s call completely unconditional — the HUD
reading (`src/render/combatReadout.ts`) must never depend on this flag.
Thread the new parameter up through every caller between this function
and wherever `main.ts`/`loop.ts` will eventually supply it (Task 6) —
this task only needs the parameter to exist and be correctly gated; it
does not need to be wired to a real persisted setting yet (that's Task 6,
once the Settings row exists to set it from).

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/sim/weapons/combat.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full verify**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0` (this touches a widely-imported file; confirm nothing
else broke).

- [ ] **Step 6: Commit**

```bash
git add src/sim/weapons/combat.ts tests/sim/weapons/combat.test.ts
git commit -m "Add arcade-damage flag: gates structural overload damage, not its measurement"
```

---

### Task 4: Port the Naval Communications design system

**Files:**
- Create: `src/render/ui/naval-comms.css` (ported from
  `design-prototypes/telegram-ui/assets/telegram.css`, minus `.proto-nav`)
- Create: `content/fonts/special-elite.woff2`, `content/fonts/stardos-stencil.woff2`
  (self-hosted, replacing the prototype's runtime Google Fonts fetch)
- Modify: `ASSETS.md` (one row per font file: source, author, license)
- Modify: `content/scenery/NOTICE.md` or a new `content/fonts/NOTICE.md`,
  whichever matches this repo's existing per-directory attribution
  convention — check both existing `NOTICE.md` files' scope before
  deciding which this belongs in.

**Interfaces:**
- Produces: CSS classes (`.sheet`, `.letterhead`, `.form-table`,
  `.ballot-option`/`.ballot-box`/`.ballot-label`/`.ballot-note`, `.stamp`
  variants, `.ink-button`) consumed by Tasks 5, 7, 8.
- Consumes: nothing.

- [ ] **Step 1: Confirm font licensing before committing anything**

Special Elite and Stardos Stencil are both listed on Google Fonts; verify
their actual license (expected: SIL Open Font License, which permits
self-hosting/redistribution) directly from the font's own source/metadata
before downloading — do not assume OFL from this plan's own guess.

- [ ] **Step 2: Download and self-host both font files**

Convert/download as WOFF2 (smallest, broadest modern-browser support) into
`content/fonts/`. Add the `ASSETS.md` row for each (source URL, author,
license — same gate every other asset in this repo passes through) and a
`NOTICE.md` entry per whichever convention Step 1 above's investigation
settled on.

- [ ] **Step 3: Port `telegram.css` to `src/render/ui/naval-comms.css`**

Copy the file, with two changes: remove `.proto-nav` and its rules
entirely (prototype-review chrome, never shipped), and replace the
`@import`/`<link>`-based Google Fonts reference with `@font-face` rules
pointing at the self-hosted files from Step 2.

- [ ] **Step 4: Add a Tier 1 test asserting the CSS file parses and the
  expected class names exist**

```ts
// tests/render/navalComms.test.ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('naval-comms.css', () => {
  const css = readFileSync('src/render/ui/naval-comms.css', 'utf8')
  it('does not include proto-nav (prototype-only chrome)', () => {
    expect(css).not.toContain('.proto-nav')
  })
  it('defines the classes Tasks 5/7/8 depend on', () => {
    for (const cls of ['.sheet', '.letterhead', '.form-table', '.ballot-option', '.ballot-box', '.stamp', '.ink-button']) {
      expect(css).toContain(cls)
    }
  })
  it('self-hosts fonts, no external Google Fonts reference', () => {
    expect(css).not.toContain('fonts.googleapis.com')
  })
})
```

- [ ] **Step 5: Run tests, verify pass; run `npm run verify`**

- [ ] **Step 6: Commit**

```bash
git add src/render/ui/naval-comms.css content/fonts/ ASSETS.md \
  content/fonts/NOTICE.md tests/render/navalComms.test.ts
git commit -m "Port Naval Communications design system; self-host its two fonts"
```

---

### Task 5: Settings dialog (titleScreen.ts)

**Files:**
- Modify: `src/render/titleScreen.ts` (add a Settings button + modal,
  visible regardless of the active roster/scenario/loadout step)
- Test: `tests/render/titleScreen.test.ts`

**Interfaces:**
- Consumes: `quality.ts` (Task 1)'s full public API; `naval-comms.css`
  (Task 4)'s classes; the arcade-damage flag's persisted representation
  (this task defines where it's stored — a sibling `localStorage` key or
  a field alongside `QualitySettings`, implementer's call, tested either
  way).
- Produces: whatever callback/handle shape `main.ts` needs to read the
  current settings and the arcade-damage flag at boot and after a change
  — consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/titleScreen.test.ts (new cases)
it('Settings button opens a modal with Simple, Advanced and Damage Model sections', () => { /* ... */ })
it('Simple row click applies the same tier to ocean/scenery/clouds and saves it', () => { /* ... */ })
it('Advanced row clicks are independent of each other and of the Simple row', () => { /* ... */ })
it('Simple row shows no selection once Advanced values diverge', () => { /* ... */ })
it('Reset to auto-detect is disabled with nothing saved, enabled after a save', () => { /* ... */ })
it('Damage Model row toggles the arcade-damage persisted flag', () => { /* ... */ })
it('Esc or the close control dismisses the modal back to the underlying step', () => { /* ... */ })
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement the Settings button and modal**

Build using `naval-comms.css`'s classes (per the naval-comms-ui spec §3):
a `.sheet`/`.letterhead` modal container; a Simple row of three
`.ballot-option`/`.ballot-box` controls (High/Medium/Low), the currently-
recommended one (once known) carrying a `.stamp--violet` "Recommended"
stamp; an "Advanced ▸" disclosure (an `.ink-button`) expanding to three
independent Ocean/Scenery/Clouds `.ballot-option` rows; an Asset Quality
row (Low/Medium/High/Ultra `.ballot-option`s, each labeled with its real
download-size ceiling from the spec's table, and copy stating "Takes
effect next time you start a sortie" rather than implying a live change);
a Damage Model row (Realistic/Arcade `.ballot-option`s); and a "Reset to
auto-detect" `.ink-button`. Every control applies immediately on
selection — no Save/Cancel. Match the existing `.ballot-option` pattern's
own `role="radio"`/`aria-checked`/`tabindex="0"`/Enter-Space activation
(already implemented in the prototype's own inline script — port the
behavior, not necessarily the inline `<script>` structure, into however
this file's existing event-handling convention works).

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Run `npm run verify`**

- [ ] **Step 6: Commit**

```bash
git add src/render/titleScreen.ts tests/render/titleScreen.test.ts
git commit -m "Add Settings dialog: Render Quality, Asset Quality, Damage Model"
```

---

### Task 6: Boot sequence wiring (main.ts)

**Files:**
- Modify: `src/render/main.ts` (`adaptOceanQuality` and the boot-time
  cascade/clouds/vegetation construction)

**Interfaces:**
- Consumes: Task 1 (`quality.ts`), Task 2
  (`finestFetchedLevelFor`), Task 3 (the arcade-damage parameter), Task 5
  (the Settings dialog's read/write surface).
- Produces: nothing new for later tasks — this is the integration point.

- [ ] **Step 1: Write the failing Tier 1 test(s)**

Cover: saved settings present → no probe runs, cascades/clouds/vegetation
built at saved tiers immediately; nothing saved → boots at `high`, probe
runs, recommendation applies and saves ONLY if no explicit choice was
made first; a DEV query override (`?oceanTier=`) still wins over a saved
setting. (Exact test harness/mocking approach matches however this file's
existing tests already stub `renderer`/`cascades` — follow that precedent
rather than inventing a new one.)

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

Per the render-quality-selector spec §5: read `loadQualitySettings()`
before creating cascades/clouds/vegetation; branch on null vs. present;
preserve DEV override precedence exactly as today
(`forcedOceanTier`/`forcedCloudTier`); on probe resolution, apply-and-save
only if no explicit interaction happened first (an `explicitChoiceMade`
flag, per the spec). Read `finestFetchedLevelFor` from the persisted
`AssetQualityTierName` (default to `medium` on first visit, per the
spec's own stated judgment call) when building the terrain loader's
level range. Read the arcade-damage flag and pass it into whatever
Task 3 threaded through to `combat.ts`.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Run `npm run verify`**

- [ ] **Step 6: Commit**

```bash
git add src/render/main.ts tests/render/main.test.ts
git commit -m "Wire boot sequence to persisted quality settings, asset tier, and damage model"
```

---

### Task 7: Roster screen restyle

**Files:**
- Modify: `src/render/titleScreen.ts` (the roster step's DOM construction)
- Test: `tests/render/titleScreen.test.ts` (update roster-step assertions
  for new structure; behavior assertions — what data shows, what a click
  does — must not change)

**Interfaces:**
- Consumes: `naval-comms.css` (Task 4); `roster.ts`'s existing
  `PilotRecord`/`loadRoster`/`createPilot` (unchanged).

- [ ] **Step 1: Update the existing roster-step tests for new DOM structure**

Per this plan's own Review Focus: a test that breaks because of a
selector change is expected; a test that breaks because of a genuine
behavior change is a signal to stop and check scope.

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Rebuild the roster step's DOM using naval-comms classes**

Per naval-comms-ui spec §3: `.sheet`/`.letterhead` header ("Bureau of
Naval Personnel" / "Squadron Roster"), a `.form-table` with columns
matching `PilotRecord` (name, rank, score, sorties, kills, status),
`.row-selected` for the active selection, and a `.typed-input`-styled
text field for the new-pilot creation form (no matching example in the
prototype — new composition within the existing design system).

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Run `npm run verify`**

- [ ] **Step 6: Commit**

```bash
git add src/render/titleScreen.ts tests/render/titleScreen.test.ts
git commit -m "Restyle roster step into the Naval Communications design system"
```

---

### Task 8: Debrief screen restyle

**Files:**
- Modify: `src/render/debrief.ts` (`createDebrief`'s DOM construction)
- Test: `tests/render/debrief.test.ts`

**Interfaces:**
- Consumes: `naval-comms.css` (Task 4); `debrief.ts`'s existing
  `DebriefModel`/`DebriefHandle` (unchanged — `show(model, onContinue?,
  onReturnToTitle?)`/`hide()`).

- [ ] **Step 1: Update existing debrief tests for new DOM structure**

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Rebuild `createDebrief`'s panel using naval-comms classes**

Per naval-comms-ui spec §3: `.routing` (From/To/DTG/Precedence header),
`.form-section-title`/figure-row Flight Figures, `.form-table` targets-
-destroyed breakdown, and an outcome `.stamp` (color keyed off
`landed`/`ditched`/`killed` from the real `DebriefModel`, never a UI
toggle the player controls). Find a layout home within Flight Figures for
the recovery multiplier, banked total, and promotion notice (Plan 9's
final review added these; they need a place in the new layout, since the
prototype's mockup predates them and doesn't show an example).

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Run `npm run verify`**

- [ ] **Step 6: Commit**

```bash
git add src/render/debrief.ts tests/render/debrief.test.ts
git commit -m "Restyle debrief panel into the Naval Communications design system"
```

---

### Task 9: Reference-GPU acceptance

**Files:**
- Create or extend: `tests/e2e/settingsUi.spec.ts` (new)
- Extend: `tests/e2e/meta-game.spec.ts` or equivalent for the restyled
  roster/debrief screens (confirm which existing spec already drives
  those flows before creating a duplicate)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the Tier 2 spec**

Cover, each verified with a screenshot read directly (never argued about
a picture nobody looked at, per this repo's standing rule):
1. Settings dialog opens, shows no `(Recommended)` tag immediately on a
   fresh profile, shows one after the ~3s probe window.
2. An explicit Simple-row pick persists across a reload — no second probe
   run (a DEV hook exposing whether the probe ran, matching `__ww2`'s
   existing convention).
3. An Advanced per-system override (Scenery→Low, Ocean/Clouds left High)
   changes only Scenery's rendered output.
4. Damage Model set to Arcade: a hard-G maneuver that would destroy the
   airframe under Realistic does not, and the HUD stress reading is
   identical either way (screenshot both, compare the reading).
5. Roster and debrief screens render the new letterhead/stamp/table
   layout correctly composited over the WebGPU canvas (a static HTML
   file and this game's DOM-overlay context are not guaranteed to
   composite identically — confirmed for real here).
6. Frame-time re-measurement against the existing 6.0ms
   `GPU_BUDGET_P95_MS` ceiling.

- [ ] **Step 2: Run against the reference GPU**

```
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
npx playwright test tests/e2e/settingsUi.spec.ts
```

Expected: all pass, screenshots read directly before trusting the result.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settingsUi.spec.ts
git commit -m "Reference-GPU acceptance: settings, roster, debrief, damage model"
```

---

## Closing (per this repo's own convention)

- [ ] Write `docs/handoff/2026-09-24-plan-ui-realism.md`
- [ ] Update master spec §15's row for this plan
- [ ] Add a README paragraph pointing at §15
- [ ] Not pushed/deployed without being asked, per standing convention
