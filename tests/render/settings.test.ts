import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSettingsModel,
  loadDamageModel, saveDamageModel, clearDamageModel,
  RENDER_QUALITY_OPTIONS, ADVANCED_SYSTEMS, ASSET_QUALITY_OPTIONS, DAMAGE_MODEL_OPTIONS,
  ASSET_QUALITY_EFFECT_NOTE, DEFAULT_DAMAGE_MODEL,
  type DamageModel,
} from '../../src/render/settings.js'
import {
  loadQualitySettings, saveQualitySettings, loadAssetQualityTier, saveAssetQualityTier,
  clearAssetQualityTier, defaultQualitySettings,
} from '../../src/render/quality.js'
import { INTERIM_ASSET_QUALITY_TIER } from '../../src/render/content.js'

/** The same in-memory `Storage` stand-in `quality.test.ts` and `roster.test.ts`
 *  already use -- this suite's environment is `node` (vitest.config.ts), so
 *  there is no real `window.localStorage` to persist into. A third copy rather
 *  than a shared helper only because adopting one would mean editing two
 *  already-green test files; noted in this task's report. */
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

describe('the damage-model flag (visual-realism spec §1)', () => {
  it('round-trips save/load and clears', () => {
    expect(loadDamageModel()).toBeNull()
    saveDamageModel('arcade')
    expect(loadDamageModel()).toBe('arcade')
    saveDamageModel('realistic')
    expect(loadDamageModel()).toBe('realistic')
    clearDamageModel()
    expect(loadDamageModel()).toBeNull()
  })

  it('ignores a stored value that is not one of the two models, and does not throw', () => {
    window.localStorage.setItem('ww2airsim.damageModel.v1', 'godmode')
    expect(() => loadDamageModel()).not.toThrow()
    expect(loadDamageModel()).toBeNull()
  })

  it('defaults to realistic -- arcade is the opt-in, not the shipped behavior', () => {
    expect(DEFAULT_DAMAGE_MODEL).toBe('realistic')
  })
})

describe('the asset-quality tier (render-quality-selector spec §10)', () => {
  it('round-trips save/load and clears, independently of the render-quality key', () => {
    saveQualitySettings(defaultQualitySettings('low'))
    saveAssetQualityTier('ultra')
    expect(loadAssetQualityTier()).toBe('ultra')
    // Clearing one must not disturb the other: they are two separate axes
    // (spec §10, "not a fourth value folded into QualityTierName").
    clearAssetQualityTier()
    expect(loadAssetQualityTier()).toBeNull()
    expect(loadQualitySettings()).toEqual(defaultQualitySettings('low'))
  })

  it('ignores a stored value that is not one of the four tiers', () => {
    window.localStorage.setItem('ww2airsim.assetQuality.v1', 'high-ish')
    expect(loadAssetQualityTier()).toBeNull()
  })
})

describe('the Settings dialog model (render-quality-selector spec §6)', () => {
  it('Settings button opens a modal with Simple, Advanced and Damage Model sections', () => {
    const model = createSettingsModel()
    // Closed until the Settings button opens it.
    expect(model.snapshot().isOpen).toBe(false)
    model.open()
    expect(model.snapshot().isOpen).toBe(true)

    // The Simple row: the three render-quality tiers, worst-to-best order as
    // the prototype shows them.
    expect(RENDER_QUALITY_OPTIONS.map((o) => o.value)).toEqual(['low', 'medium', 'high'])
    // The Advanced disclosure: the three systems that can now diverge.
    expect(ADVANCED_SYSTEMS.map((s) => s.value)).toEqual(['ocean', 'scenery', 'clouds'])
    // Advanced is collapsed by default (spec §6).
    expect(model.snapshot().advancedExpanded).toBe(false)
    model.toggleAdvanced()
    expect(model.snapshot().advancedExpanded).toBe(true)

    // The Damage Model row.
    expect(DAMAGE_MODEL_OPTIONS.map((o) => o.value)).toEqual(['realistic', 'arcade'])
    // And the fourth, separate axis.
    expect(ASSET_QUALITY_OPTIONS.map((o) => o.value)).toEqual(['low', 'medium', 'high', 'ultra'])
    // Its copy says a reload is needed rather than implying a live change
    // (spec §10: "Takes effect next time you start a sortie").
    expect(ASSET_QUALITY_EFFECT_NOTE).toMatch(/next time you start a sortie/i)
    // Every asset tier names its real download ceiling from the spec's table.
    const notes = Object.fromEntries(ASSET_QUALITY_OPTIONS.map((o) => [o.value, o.note]))
    expect(notes.low).toContain('50 MB')
    expect(notes.medium).toContain('150 MB')
    expect(notes.high).toContain('500 MB')
    expect(notes.ultra).toContain('1 GB')
  })

  it('Simple row click applies the same tier to ocean/scenery/clouds and saves it', () => {
    const applied: string[] = []
    const model = createSettingsModel({ onQualityChange: (q) => applied.push(`${q.ocean}/${q.scenery}/${q.clouds}`) })
    model.selectSimpleTier('medium')

    expect(model.snapshot().quality).toEqual({ ocean: 'medium', scenery: 'medium', clouds: 'medium' })
    expect(model.snapshot().simpleTier).toBe('medium')
    // Applied live (main.ts's setTier calls) AND persisted immediately -- no
    // Save button exists (spec §6, naval-comms spec §1).
    expect(applied).toEqual(['medium/medium/medium'])
    expect(loadQualitySettings()).toEqual(defaultQualitySettings('medium'))
    // This is the flag main.ts's probe checks before overwriting anything.
    expect(model.snapshot().explicitChoiceMade).toBe(true)
  })

  it('Advanced row clicks are independent of each other and of the Simple row', () => {
    const model = createSettingsModel()
    model.selectSimpleTier('high')
    model.selectSystemTier('scenery', 'low')
    expect(model.snapshot().quality).toEqual({ ocean: 'high', scenery: 'low', clouds: 'high' })

    model.selectSystemTier('clouds', 'medium')
    expect(model.snapshot().quality).toEqual({ ocean: 'high', scenery: 'low', clouds: 'medium' })
    expect(loadQualitySettings()).toEqual({ ocean: 'high', scenery: 'low', clouds: 'medium' })

    // And the Simple row still overrides all three at once.
    model.selectSimpleTier('low')
    expect(model.snapshot().quality).toEqual(defaultQualitySettings('low'))
  })

  it('Simple row shows no selection once Advanced values diverge', () => {
    const model = createSettingsModel()
    model.selectSimpleTier('high')
    expect(model.snapshot().simpleTier).toBe('high')
    model.selectSystemTier('scenery', 'low')
    // `uniformTier` returns null; the dialog shows no Simple selection. Not an
    // error state (spec §6).
    expect(model.snapshot().simpleTier).toBeNull()
  })

  it('Reset to auto-detect is disabled with nothing saved, enabled after a save', () => {
    const model = createSettingsModel()
    expect(model.snapshot().canReset).toBe(false)
    model.selectSimpleTier('low')
    expect(model.snapshot().canReset).toBe(true)

    model.resetToAutoDetect()
    expect(loadQualitySettings()).toBeNull()
    expect(model.snapshot().canReset).toBe(false)
    // Reset takes effect on the NEXT page load; it does not re-run the probe
    // or revert what is rendering right now (spec §6).
    expect(model.snapshot().quality).toEqual(defaultQualitySettings('low'))
  })

  it('a model built with settings already persisted starts able to reset', () => {
    saveQualitySettings({ ocean: 'medium', scenery: 'low', clouds: 'medium' })
    saveAssetQualityTier('high')
    saveDamageModel('arcade')
    const model = createSettingsModel()
    const s = model.snapshot()
    expect(s.quality).toEqual({ ocean: 'medium', scenery: 'low', clouds: 'medium' })
    expect(s.assetQuality).toBe('high')
    expect(s.damageModel).toBe('arcade')
    expect(s.canReset).toBe(true)
    // Restored from a prior session is not an explicit choice made *this*
    // session -- but main.ts's probe never runs at all when settings are
    // persisted (spec §5 step 1), so this flag is only about this session.
    expect(s.explicitChoiceMade).toBe(false)
  })

  it('Damage Model row toggles the arcade-damage persisted flag', () => {
    const seen: DamageModel[] = []
    const model = createSettingsModel({ onDamageModelChange: (m) => seen.push(m) })
    expect(model.snapshot().damageModel).toBe('realistic')
    expect(model.snapshot().arcadeDamage).toBe(false)

    model.selectDamageModel('arcade')
    expect(model.snapshot().damageModel).toBe('arcade')
    // The boolean `stepCombat`'s trailing `arcadeDamage` parameter takes
    // (Task 3) -- what Task 6 threads into the sim, since src/sim/ may not
    // read localStorage itself (visual-realism spec §1).
    expect(model.snapshot().arcadeDamage).toBe(true)
    expect(loadDamageModel()).toBe('arcade')
    expect(seen).toEqual(['arcade'])

    model.selectDamageModel('realistic')
    expect(model.snapshot().arcadeDamage).toBe(false)
    expect(loadDamageModel()).toBe('realistic')

    // A gameplay choice, not a render-quality one: it must not enable the
    // render-quality Reset, and must not defeat the GPU probe.
    expect(model.snapshot().canReset).toBe(false)
    expect(model.snapshot().explicitChoiceMade).toBe(false)
  })

  it('Asset Quality persists a pick without pretending it applies live', () => {
    const seen: string[] = []
    const model = createSettingsModel({ onAssetQualityChange: (t) => seen.push(t) })
    // Nothing persisted yet: the dialog preselects what the app is ACTUALLY
    // loading this boot, not the spec's eventual `medium` default.
    expect(model.snapshot().assetQuality).toBe(INTERIM_ASSET_QUALITY_TIER)

    model.selectAssetQuality('ultra')
    expect(model.snapshot().assetQuality).toBe('ultra')
    expect(loadAssetQualityTier()).toBe('ultra')
    expect(seen).toEqual(['ultra'])
    // Nothing about the terrain already loaded changes -- that is the whole
    // point of the "next time you start a sortie" copy.
    expect(model.snapshot().explicitChoiceMade).toBe(false)
  })

  it('Esc or the close control dismisses the modal back to the underlying step', () => {
    const model = createSettingsModel()
    model.open()
    model.selectSimpleTier('low')
    model.toggleAdvanced()

    model.close()
    expect(model.snapshot().isOpen).toBe(false)
    // Dismissing discards nothing: there is no Cancel, so what was picked
    // while it was open stays picked and stays saved.
    expect(model.snapshot().quality).toEqual(defaultQualitySettings('low'))
    expect(loadQualitySettings()).toEqual(defaultQualitySettings('low'))
    // Reopening shows the same state, including the Advanced disclosure.
    model.open()
    expect(model.snapshot().advancedExpanded).toBe(true)
  })

  it('the probe recommendation is pushed in by main.ts and never overwrites an explicit pick', () => {
    const applied: string[] = []
    const model = createSettingsModel({ onQualityChange: (q) => applied.push(q.ocean) })
    expect(model.snapshot().recommendedTier).toBeNull()

    model.setRecommendedTier('medium')
    expect(model.snapshot().recommendedTier).toBe('medium')
    // Recording the recommendation is display-only: it stamps a tier
    // "Recommended", it does not select or save it. main.ts owns that
    // decision (spec §5 step 3) because only main.ts can apply it to live
    // cascades/clouds/vegetation.
    expect(applied).toEqual([])
    expect(loadQualitySettings()).toBeNull()

    // main.ts's own live swap comes back in through setCurrentQuality, which
    // must not look like the player made a choice.
    model.setCurrentQuality(defaultQualitySettings('medium'))
    expect(model.snapshot().quality).toEqual(defaultQualitySettings('medium'))
    expect(model.snapshot().explicitChoiceMade).toBe(false)
    expect(applied).toEqual([])
  })
})
