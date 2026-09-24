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
