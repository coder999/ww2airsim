import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createBootQuality, type QualityTargets } from '../../src/render/bootQuality.js'
import {
  defaultQualitySettings, loadQualitySettings, saveQualitySettings, saveAssetQualityTier,
  type QualityTierName,
} from '../../src/render/quality.js'
import { saveDamageModel } from '../../src/render/settings.js'
import { INTERIM_ASSET_QUALITY_TIER } from '../../src/render/content.js'

/** The in-memory `Storage` stand-in `quality.test.ts`, `roster.test.ts` and
 *  `settings.test.ts` already use -- this suite's environment is `node`
 *  (vitest.config.ts), so there is no real `window.localStorage`. */
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

beforeEach(() => {
  (globalThis as { window?: { localStorage: Storage } }).window = { localStorage: fakeLocalStorage() }
})

/** A recording stand-in for the three things a tier actually moves in
 *  `main.ts`: the ocean cascades, `vegetation.setTier`, and
 *  `clouds`/`shadow`. Every assertion below about "the pick took effect"
 *  reads THESE -- not the model's own snapshot, which would be true even if
 *  nothing were connected at all. */
function recordingTargets(): QualityTargets & { readonly seen: { ocean: QualityTierName[]; scenery: QualityTierName[]; clouds: QualityTierName[] } } {
  const seen = { ocean: [] as QualityTierName[], scenery: [] as QualityTierName[], clouds: [] as QualityTierName[] }
  return {
    seen,
    setOceanTier: (t) => { seen.ocean.push(t) },
    setSceneryTier: (t) => { seen.scenery.push(t) },
    setCloudTier: (t) => { seen.clouds.push(t) },
  }
}

describe('the boot sequence\'s side of the Settings dialog (render-quality-selector spec §5)', () => {
  it('APPLIES a tier pick, not merely persists it -- the failure this module exists to catch', () => {
    // The silent failure three reviews flagged: a dialog whose picks save to
    // localStorage and reach nothing. On screen it is indistinguishable from
    // a working one (the checkmark moves, Reset lights up), so asserting the
    // model's own state proves nothing. This asserts the SETTERS ran.
    const quality = createBootQuality()
    const targets = recordingTargets()
    quality.bind(targets)
    targets.seen.ocean.length = 0
    targets.seen.scenery.length = 0
    targets.seen.clouds.length = 0

    quality.settings.selectSimpleTier('low')
    expect(targets.seen.ocean).toEqual(['low'])
    expect(targets.seen.scenery).toEqual(['low'])
    expect(targets.seen.clouds).toEqual(['low'])
    // ...and it persisted too, which is the half that already worked.
    expect(loadQualitySettings()).toEqual(defaultQualitySettings('low'))
  })

  it('applies an Advanced per-system pick to that system alone', () => {
    const quality = createBootQuality()
    const targets = recordingTargets()
    quality.bind(targets)
    quality.settings.selectSystemTier('scenery', 'medium')
    // All three setters run on every change (they are idempotent), but only
    // scenery moves: an Advanced pick must not drag the other two with it.
    expect(targets.seen.scenery.at(-1)).toBe('medium')
    expect(targets.seen.ocean.at(-1)).toBe('high')
    expect(targets.seen.clouds.at(-1)).toBe('high')
    expect(quality.current()).toEqual({ ocean: 'high', scenery: 'medium', clouds: 'high' })
  })

  it('applies a tier picked BEFORE bind, once there is something to apply it to', () => {
    // Real: the title screen is clickable the instant it paints, several real
    // awaits before `main.ts` has built an ocean, clouds or vegetation.
    const quality = createBootQuality()
    quality.settings.selectSimpleTier('medium')
    const targets = recordingTargets()
    quality.bind(targets)
    expect(targets.seen).toEqual({ ocean: ['medium'], scenery: ['medium'], clouds: ['medium'] })
  })

  it('boots at the saved tiers and suppresses the probe entirely (spec §5 step 1)', () => {
    saveQualitySettings({ ocean: 'low', scenery: 'medium', clouds: 'high' })
    const quality = createBootQuality()
    expect(quality.current()).toEqual({ ocean: 'low', scenery: 'medium', clouds: 'high' })
    expect(quality.probeSuppressed).toBe(true)
  })

  it('boots at high and lets the probe run when nothing is saved -- unchanged from before this plan', () => {
    const quality = createBootQuality()
    expect(quality.current()).toEqual(defaultQualitySettings('high'))
    expect(quality.probeSuppressed).toBe(false)
    expect(loadQualitySettings()).toBeNull()
  })

  it('applies AND saves the probe result when no explicit pick was made (spec §5 step 3)', () => {
    const quality = createBootQuality()
    const targets = recordingTargets()
    quality.bind(targets)
    quality.applyProbeResult('medium')
    expect(targets.seen.ocean.at(-1)).toBe('medium')
    expect(targets.seen.scenery.at(-1)).toBe('medium')
    expect(targets.seen.clouds.at(-1)).toBe('medium')
    expect(quality.current()).toEqual(defaultQualitySettings('medium'))
    // Saved, which is what makes the probe run once per BROWSER rather than
    // once per page load.
    expect(loadQualitySettings()).toEqual(defaultQualitySettings('medium'))
    expect(quality.settings.snapshot().recommendedTier).toBe('medium')
    // The probe's own swap is not an explicit choice.
    expect(quality.settings.snapshot().explicitChoiceMade).toBe(false)
  })

  it('discards the probe result after an explicit pick, but still records the recommendation', () => {
    const quality = createBootQuality()
    const targets = recordingTargets()
    quality.bind(targets)
    quality.settings.selectSimpleTier('high')
    targets.seen.ocean.length = 0
    targets.seen.scenery.length = 0
    targets.seen.clouds.length = 0

    quality.applyProbeResult('low')
    // Nothing applied and nothing saved: a measurement may never overwrite a
    // deliberate choice.
    expect(targets.seen).toEqual({ ocean: [], scenery: [], clouds: [] })
    expect(quality.current()).toEqual(defaultQualitySettings('high'))
    expect(loadQualitySettings()).toEqual(defaultQualitySettings('high'))
    // The stamp still tells the player what the machine measured.
    expect(quality.settings.snapshot().recommendedTier).toBe('low')
  })

  it('records a recommendation equal to the tier already in force, rather than returning early', () => {
    // The pre-plan `adaptOceanQuality` returned before doing anything when the
    // measured tier matched the live one. That would now mean no "Recommended"
    // stamp and no save -- so the probe would run again on every later page
    // load, against the spec's probe-once rule.
    const quality = createBootQuality()
    quality.bind(recordingTargets())
    quality.applyProbeResult('high')
    expect(quality.settings.snapshot().recommendedTier).toBe('high')
    expect(loadQualitySettings()).toEqual(defaultQualitySettings('high'))
  })
})

describe('Asset Quality at boot (render-quality-selector spec §10)', () => {
  it('defaults a first-time visitor to the INTERIM tier, never a hardcoded medium', () => {
    // The memory constraint, pinned: an L0 floor allocates ~358 MB of mesh
    // textures per `createTerrainMesh` and fetches a 134 MB level, and nothing
    // has made that allocation lazy yet (see `INTERIM_ASSET_QUALITY_TIER`'s
    // own comment). A first visit must not pay it unasked. The second
    // assertion is deliberately redundant TODAY and is the one that fails if
    // somebody moves the constant without doing that memory work.
    expect(createBootQuality().assetQuality).toBe(INTERIM_ASSET_QUALITY_TIER)
    expect(INTERIM_ASSET_QUALITY_TIER).toBe('low')
  })

  it('honors an explicit pick from a previous visit', () => {
    saveAssetQualityTier('ultra')
    expect(createBootQuality().assetQuality).toBe('ultra')
  })

  it('is captured once, not live: this page load\'s terrain floor cannot move under it', () => {
    const quality = createBootQuality()
    quality.settings.selectAssetQuality('high')
    // What the dialog promises -- "takes effect next time you start a sortie".
    expect(quality.assetQuality).toBe(INTERIM_ASSET_QUALITY_TIER)
    expect(createBootQuality().assetQuality).toBe('high')
  })
})

describe('the Damage Model flag at boot (visual-realism spec §1)', () => {
  it('starts from the persisted model and follows a live pick', () => {
    expect(createBootQuality().arcadeDamage()).toBe(false)
    saveDamageModel('arcade')
    const quality = createBootQuality()
    expect(quality.arcadeDamage()).toBe(true)
    quality.settings.selectDamageModel('realistic')
    expect(quality.arcadeDamage()).toBe(false)
    quality.settings.selectDamageModel('arcade')
    expect(quality.arcadeDamage()).toBe(true)
  })

  it('does not count as an explicit render-quality choice: neither axis is probed', () => {
    const quality = createBootQuality()
    quality.settings.selectDamageModel('arcade')
    quality.bind(recordingTargets())
    quality.applyProbeResult('low')
    expect(quality.current()).toEqual(defaultQualitySettings('low'))
  })
})

/**
 * `main.ts` is unreachable from this suite (Three.js, WebGPU, one 1,700-line
 * async `boot()`), so the last link in the chain -- that `boot()` actually
 * hands the dialog THIS model and binds it to the real renderer objects --
 * has no runtime assertion available. These read the source instead.
 *
 * Deliberately narrow and deliberately brittle-on-rename: each one pins a
 * line whose ABSENCE is silent. Dropping `createTitleScreen`'s fourth
 * argument, for instance, leaves a dialog that saves every pick and changes
 * nothing, with no error anywhere and correct-looking checkmarks. A failure
 * here after a rename is a five-second fix; the failure mode it guards
 * against cost three review rounds to keep catching by eye.
 */
describe('main.ts boot wiring (what no Tier 1 test can execute)', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/render/main.ts', import.meta.url)), 'utf8')

  it('builds exactly one settings model, through createBootQuality', () => {
    expect(source).toContain('const quality = createBootQuality()')
    // A second model would have its own callbacks and its own persisted
    // state, and whichever one the dialog got would be the one that worked.
    expect(source).not.toContain('createSettingsModel(')
  })

  it('passes that model to createTitleScreen as its settings parameter', () => {
    expect(source.match(/createTitleScreen\(/g)).toHaveLength(1)
    // Task 3 adds a fifth argument (the boot progress) after `quality.settings`;
    // the closing paren moved but this must still be the fourth argument.
    expect(source).toContain('}, quality.settings, boot)')
  })

  it('binds the model to the live tier setters', () => {
    expect(source).toContain('quality.bind({ setOceanTier:')
    expect(source).toContain('quality.applyProbeResult(next.name)')
    expect(source).toContain('let qualityChecked = quality.probeSuppressed')
  })

  it('reads the terrain floor from the persisted asset tier, not a hardcoded one', () => {
    expect(source).toContain('finestFetchedLevelFor(quality.assetQuality)')
    // One CALL, not one mention: the negative lookbehind skips the `code
    // span` in the comment further down that names the old hardcoded form.
    expect(source.match(/(?<!`)finestFetchedLevelFor\(/g)).toHaveLength(1)
  })

  it('feeds the damage model into the frame loop every frame', () => {
    expect(source).toContain('quality.arcadeDamage())')
    expect(source).toMatch(/nextFrameState\([^\n]*quality\.arcadeDamage\(\)\)/)
  })

  it('keeps the DEV query overrides winning over a saved setting', () => {
    // A Tier 2 measurement run passes `?oceanTier=`/`?cloudTier=`; if a saved
    // localStorage tier could override it, the run would silently measure
    // something other than what its URL says.
    expect(source).toContain('let oceanTier = forcedOceanTier ?? oceanTierNamed(quality.current().ocean)')
    expect(source).toContain('cloudTier = forcedCloudTier ?? quality.current().clouds')
    // ...and the live setters refuse to move a forced tier at all.
    expect(source).toMatch(/const applyOceanTier[\s\S]{0,400}?if \(forcedOceanTier !== undefined\) return/)
    expect(source).toMatch(/const applyCloudTier[\s\S]{0,400}?if \(forcedCloudTier !== undefined \|\| cloudTier === name\) return/)
  })

  it('keeps ?oceanTier= driving the scenery tier, which is what turns the trees off', () => {
    // Round-1 regression, caught in review: scenery was made independent of
    // the ocean (correct for the Advanced disclosure) but nothing replaced
    // the DEV override's reach into it, so `?oceanTier=low` -- the URL every
    // recorded GPU frame-time number in this project was measured through --
    // silently started rendering trees to the horizon in a fresh browser
    // context. `SCENERY_TIERS.low.treeFadeEndM` is 0; trees appearing or
    // vanishing from tier logic has cost real debugging time here before
    // (2026-09-20).
    expect(source).toContain('const forcedSceneryTier = forcedOceanTier?.name')
    expect(source).toContain('sceneryTier = forcedSceneryTier ?? quality.current().scenery')
    expect(source).toMatch(/const applySceneryTier[\s\S]{0,400}?if \(forcedSceneryTier !== undefined\) return/)
    // The one remaining `setTier` on vegetation must read that variable, not
    // a tier resolved somewhere else.
    expect(source).toContain('vegetation.setTier(sceneryTier)')
    // Two CALLS -- `applySceneryTier`'s and the one on the terrain-arrival
    // path. The lookbehind skips the `code span` in the comment above that
    // quotes the pre-plan form.
    expect(source.match(/(?<!`)vegetation[?]?\.setTier\(/g)).toHaveLength(2)
  })
})
