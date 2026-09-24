const STORAGE_KEY = 'ww2airsim.quality.v1'

/**
 * Asset Quality's own key, a SIBLING of `ww2airsim.quality.v1` rather than a
 * field inside it (the choice the design spec
 * `docs/superpowers/specs/2026-09-24-render-quality-selector-design.md` §10
 * left to the implementation, settled here 2026-09-24).
 *
 * Two keys because they are two independent axes with different lifetimes:
 * render quality live-applies and is auto-probed, asset quality needs a
 * reload and is never probed (§10). A shared key would also mean
 * `isQualitySettings` below has to decide what to do with a stored value
 * carrying only one of the two -- exactly the migration hazard a second key
 * costs nothing to avoid.
 */
const ASSET_STORAGE_KEY = 'ww2airsim.assetQuality.v1'

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

const ASSET_TIER_NAMES: readonly AssetQualityTierName[] = ['low', 'medium', 'high', 'ultra']
function isAssetQualityTierName(v: unknown): v is AssetQualityTierName {
  return typeof v === 'string' && (ASSET_TIER_NAMES as readonly string[]).includes(v)
}

/**
 * Reads `localStorage['ww2airsim.assetQuality.v1']`. `null` on missing or
 * unrecognized data (warns, never throws) -- the same contract
 * `loadQualitySettings` above has, and `roster.ts`'s `loadRoster` before it.
 *
 * Stored as the bare tier name, not JSON: there is no object shape to
 * version, and a raw string cannot throw on parse, so the only failure mode
 * left is a value that is not one of the four -- which the guard catches.
 *
 * There is deliberately no DEFAULT constant beside this function. The
 * first-visit default is `src/render/settings.ts`'s to choose, because the
 * honest answer is "whatever the terrain loader actually uses this boot"
 * (`content.ts`'s `INTERIM_ASSET_QUALITY_TIER`), and `content.ts` imports
 * THIS module -- a default here would either be a second, quietly diverging
 * copy of that value or an import cycle.
 */
export function loadAssetQualityTier(): AssetQualityTierName | null {
  try {
    const raw = window.localStorage.getItem(ASSET_STORAGE_KEY)
    if (raw === null) return null
    if (!isAssetQualityTierName(raw)) {
      console.warn('asset quality tier in localStorage is not a known tier; ignoring:', raw)
      return null
    }
    return raw
  } catch (err) {
    console.warn('asset quality tier in localStorage is unreadable; ignoring:', err)
    return null
  }
}

export function saveAssetQualityTier(tier: AssetQualityTierName): void {
  try {
    window.localStorage.setItem(ASSET_STORAGE_KEY, tier)
  } catch (err) {
    console.warn('asset quality tier could not be saved to localStorage:', err)
  }
}

export function clearAssetQualityTier(): void {
  try {
    window.localStorage.removeItem(ASSET_STORAGE_KEY)
  } catch (err) {
    console.warn('asset quality tier could not be cleared from localStorage:', err)
  }
}

export function uniformTier(settings: QualitySettings): QualityTierName | null {
  return settings.ocean === settings.scenery && settings.scenery === settings.clouds
    ? settings.ocean
    : null
}
