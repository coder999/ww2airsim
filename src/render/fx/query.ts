import type { QualityTierName } from '../quality.js'

export type FxQuery = { readonly tier: QualityTierName | 'off' | undefined; readonly soft: boolean; readonly cloudLimit: boolean }
const TIERS = ['off', 'low', 'medium', 'high'] as const

/** DEV knobs (E1): `?fx=` forces the tier (`off` builds no pass, Ruling
 *  R18); `?fxSoft=off` swaps the soft fade for a hard depth test (the
 *  soft-edge control); `?fxCloudLimit=off` stops feeding dense depth to the
 *  clouds (the cloud-ordering control). A typo throws. */
export function fxQueryFrom(search: string): FxQuery {
  const q = new URLSearchParams(search)
  const raw = q.get('fx')
  if (raw !== null && !(TIERS as readonly string[]).includes(raw)) throw new Error(`fx: ${JSON.stringify(raw)} is not ${TIERS.join(', ')}`)
  const flag = (name: string): boolean => {
    const v = q.get(name)
    if (v === null || v === 'on') return true
    if (v === 'off') return false
    throw new Error(`${name}: ${JSON.stringify(v)} is not on or off`)
  }
  return { tier: (raw ?? undefined) as FxQuery['tier'], soft: flag('fxSoft'), cloudLimit: flag('fxCloudLimit') }
}
