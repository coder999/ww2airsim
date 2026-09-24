import {
  defaultQualitySettings, loadQualitySettings, saveQualitySettings,
  type AssetQualityTierName, type QualitySettings, type QualityTierName,
} from './quality.js'
import { createSettingsModel, type SettingsModel } from './settings.js'

/**
 * The join between the Settings dialog's model (`settings.ts`, Task 5) and
 * the boot sequence that has to obey it (`main.ts`, Task 6) -- design
 * `docs/superpowers/specs/2026-09-24-render-quality-selector-design.md` §5.
 *
 * ITS OWN MODULE, rather than thirty more lines inside `boot()`, for one
 * reason: `main.ts` is unreachable from the Tier 1 suite. It imports Three.js,
 * builds a WebGPU renderer and runs one 1,700-line async function, so every
 * decision left inside it is a decision no test can execute -- and the
 * decision this task most needs a test for is the one three separate reviews
 * flagged as the easiest thing to ship broken: a Settings dialog whose picks
 * persist to localStorage and are never applied to anything, which looks
 * completely correct on screen (the checkmark moves, Reset lights up) while
 * the game never changes tier. `tests/render/bootQuality.test.ts` drives the
 * REAL `createSettingsModel` through this object and asserts a pick actually
 * reaches the three setters; what is left in `main.ts` is only the three
 * setters' bodies.
 *
 * The spec's `explicitChoiceMade` rule lives here too (§5 step 3): the probe
 * may never overwrite a deliberate pick.
 */

/**
 * What a tier actually moves, as `main.ts` implements it: the ocean cascades
 * (an async rebuild), `vegetation.setTier`, and `clouds`/`shadow`'s tier.
 *
 * Tier NAMES, not `OCEAN_TIERS` entries, so this module stays free of the
 * renderer: `main.ts` maps the name onto its own tier tables. Each setter is
 * expected to be idempotent and to be a no-op under its DEV query override --
 * `?oceanTier=`/`?cloudTier=` must keep winning over a saved setting (spec §5
 * step 2), and `bind` below calls all three unconditionally.
 */
export type QualityTargets = {
  readonly setOceanTier: (tier: QualityTierName) => void
  readonly setSceneryTier: (tier: QualityTierName) => void
  readonly setCloudTier: (tier: QualityTierName) => void
}

export type BootQuality = {
  /** Hand this to `createTitleScreen`'s fourth parameter. It is THE model:
   *  building a second one anywhere would give the dialog a different set of
   *  callbacks from the ones wired here, which is the silent failure this
   *  whole module exists to make testable. */
  readonly settings: SettingsModel
  /** The live render tiers. A function, not a captured value: the title
   *  screen is clickable from the moment it paints, several real `await`s
   *  before `main.ts` builds anything tier-dependent, so a pick can land
   *  between construction and the read. */
  readonly current: () => QualitySettings
  /**
   * The Asset Quality tier THIS page load fetches terrain at, captured once
   * at construction and deliberately not live: the dialog says "takes effect
   * next time you start a sortie" (`ASSET_QUALITY_EFFECT_NOTE`), and the
   * terrain pyramid's floor is chosen once, before any mesh exists.
   *
   * With nothing persisted this is `content.ts`'s `INTERIM_ASSET_QUALITY_TIER`
   * -- `'low'`/L1 -- NOT the spec §10 addendum's eventual `'medium'`. That
   * constant's own comment holds the measured reason (an L0 floor allocates
   * ~358 MB of mesh textures per `createTerrainMesh` and fetches a 134 MB
   * level); a first-time visitor must not pay it unasked. A player who picks
   * Medium or better in the dialog gets exactly what they asked for on their
   * next load, which is the point of the picker.
   */
  readonly assetQuality: AssetQualityTierName
  /**
   * Whether a render-quality choice was already persisted when this page load
   * started, i.e. whether `main.ts` must skip the GPU probe entirely (spec §5
   * step 1, the "probe once ever" rule). Read at construction, before the
   * model can save anything of its own.
   */
  readonly probeSuppressed: boolean
  /** The boolean `stepCombat`'s `arcadeDamage` parameter takes, live: a
   *  Damage Model pick applies to the very next tick, with no reload. */
  readonly arcadeDamage: () => boolean
  /**
   * Connects the live tier setters, once `main.ts` has objects to move, and
   * immediately applies whatever the model currently holds -- which is what
   * picks up a tier clicked during boot's own awaits, when there was nothing
   * to apply it to yet.
   */
  bind(targets: QualityTargets): void
  /**
   * Spec §5 step 3: the ~180-frame probe has resolved on `tier`.
   *
   * The recommendation is ALWAYS recorded (it is display-only -- the
   * "Recommended" stamp), including when it is discarded, so the dialog can
   * say what the machine measured even where it did not act on it. It is
   * applied and saved only when no explicit pick has happened first; a
   * measurement may never overwrite a deliberate choice.
   */
  applyProbeResult(tier: QualityTierName): void
}

export function createBootQuality(): BootQuality {
  // Before the model exists, so it cannot see the model's own writes.
  const savedAtBoot = loadQualitySettings()

  let targets: QualityTargets | null = null
  const apply = (q: QualitySettings): void => {
    if (targets === null) return
    targets.setOceanTier(q.ocean)
    targets.setSceneryTier(q.scenery)
    targets.setCloudTier(q.clouds)
  }

  let arcade = false
  const settings = createSettingsModel({
    onQualityChange: (q) => { apply(q) },
    onDamageModelChange: (model) => { arcade = model === 'arcade' },
  })
  // The model loaded the persisted damage model at construction; this is that
  // value. Read through the snapshot rather than `loadDamageModel()` again so
  // there is one answer to "which model is in force", not two.
  arcade = settings.snapshot().arcadeDamage
  const assetQuality = settings.snapshot().assetQuality

  return {
    settings,
    current: () => settings.snapshot().quality,
    assetQuality,
    probeSuppressed: savedAtBoot !== null,
    arcadeDamage: () => arcade,
    bind: (next: QualityTargets): void => {
      targets = next
      apply(settings.snapshot().quality)
    },
    applyProbeResult: (tier: QualityTierName): void => {
      settings.setRecommendedTier(tier)
      if (settings.snapshot().explicitChoiceMade) return
      const recommended = defaultQualitySettings(tier)
      // Saved as well as applied (spec §5 step 3): persisting the probe's own
      // result is what makes the probe run once per browser rather than once
      // per page load.
      saveQualitySettings(recommended)
      settings.setCurrentQuality(recommended)
      apply(recommended)
    },
  }
}
