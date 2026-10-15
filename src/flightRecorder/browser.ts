import type { ScenarioBundle } from '../sim/scenario.js'
import { sha256 } from './canonical.js'
import { encodeFlightRecord } from './codec.js'
import type { FlightRecordV1 } from './schema.js'

declare const __WW2_BUILD_ID__: string
declare const __WW2_BUILD_DIRTY__: boolean

export const BUILD_ID = __WW2_BUILD_ID__
export const BUILD_DIRTY = __WW2_BUILD_DIRTY__

export const contentSha256 = (bundle: ScenarioBundle): Promise<string> => sha256(bundle)

export function browserEnvironment(graphics: Readonly<Record<string, unknown>>, gpu = 'unavailable'): FlightRecordV1['environment'] {
  return {
    browser: navigator.userAgent,
    os: navigator.platform,
    gpu,
    graphics: { ...graphics },
  }
}

export async function downloadFlightRecord(record: FlightRecordV1, scenarioId: string): Promise<void> {
  const bytes = await encodeFlightRecord(record)
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/gzip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${scenarioId}-${new Date().toISOString().replaceAll(':', '-')}.ww2flight`
  anchor.hidden = true
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Keep the object URL alive until the browser has consumed the synthetic
  // navigation. Revoking it in the same task can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
