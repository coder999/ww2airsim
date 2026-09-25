import { spawnUrl } from './harness.js'

/** The fixed views of the photoreal render pass (spec §3.2). Every
 *  phase is judged against the same pictures and the same budget views. */
export type View = { readonly name: string; readonly url: string }
const TAC = { x: -29666, z: -47605 }
export const VIEWS: readonly View[] = [
  { name: 'runway', url: '/' },
  { name: 'low-land-600', url: spawnUrl({ x: TAC.x + 3000, y: 600, z: TAC.z + 6000 }) },
  { name: 'under-deck-1200', url: spawnUrl({ x: TAC.x, y: 1200, z: TAC.z - 8000 }) },
  { name: 'in-deck-1900', url: spawnUrl({ x: TAC.x, y: 1900, z: TAC.z - 8000 }) },
  { name: 'above-deck-3200', url: spawnUrl({ x: TAC.x, y: 3200, z: TAC.z - 8000 }) },
  { name: 'high-6000', url: spawnUrl({ x: TAC.x + 10000, y: 6000, z: TAC.z + 20000 }) },
  { name: 'deckquals', url: '/?scenario=deck-quals' },
  { name: 'sunset', url: withParams(spawnUrl({ x: TAC.x, y: 1000, z: TAC.z - 8000 }), { timeOfDay: '17.3' }) },
  // Cloud Fidelity II spec §5: parked on the runway (heading 000) at the
  // scenario's 10:00, looking 55 deg left (azimuth 305, opposite the sun at
  // 125) and 30 deg up at the sun-lit side of the deck -- the view the
  // reference photograph of fair-weather cumulus was taken from.
  { name: 'photo', url: withParams('/', { look: '55,30' }) },
]

/** Appends query parameters to a view URL that may or may not have a query. */
export function withParams(url: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString()
  if (q === '') return url
  return url + (url.includes('?') ? '&' : '?') + q
}
