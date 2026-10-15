/**
 * Builds the headquarters over the real browser (plan F5B): `localStorage`, the clock, `crypto` ids, file
 * download and upload. Until Task 10 switches the title over, `main.ts` shows it when the URL has `?hq`.
 */
import { createSession, buildShellCatalog, purgeLegacyRoster, type Session } from '../campaignSession.js'
import type { MissionDescriptor } from '../../campaign/index.js'
import type { FlyableAircraft } from '../sortie/flyable.js'
import type { Scenario } from '../../sim/scenario.js'
import { SCENARIO_OPTIONS, badgeName } from '../titleScreen.js'
import { createHq, type AssignRequest, type HqHandle } from './screens.js'

export type HeadquartersDeps = {
  readonly flyable: readonly FlyableAircraft[]
  readonly loadScenario: (id: string) => Promise<Scenario>
  readonly onAssign?: (r: AssignRequest, session: Session, dev: boolean, god: boolean) => void
  readonly onHide?: () => void
}

const downloadText = (filename: string, text: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const pickTextFile = (): Promise<string | null> => new Promise((resolve) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.style.display = 'none'
  input.addEventListener('change', () => { void (input.files?.[0]?.text() ?? Promise.resolve(null)).then(resolve, () => resolve(null)); input.remove() })
  input.addEventListener('cancel', () => { resolve(null); input.remove() })
  document.body.appendChild(input)
  input.click()
})

export function createHeadquarters(root: HTMLElement, deps: HeadquartersDeps): { hq: HqHandle; session: Session } {
  const port = window.localStorage
  purgeLegacyRoster(port)
  const session = createSession({
    port, now: () => new Date().toISOString(), newId: () => crypto.randomUUID(),
    newSeed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
  })
  let catalog: Promise<MissionDescriptor[]> | null = null
  const nationOf = (spec: string): 'allied' | 'japanese' => deps.flyable.find((f) => f.spec.id === spec)?.spec.side ?? 'allied'
  let dev = false
  let god = false
  const hq = createHq(root, {
    session,
    catalog: () => (catalog ??= buildShellCatalog(SCENARIO_OPTIONS, deps.loadScenario, nationOf)),
    options: SCENARIO_OPTIONS,
    missionLabel: (id) => SCENARIO_OPTIONS.find((o) => o.value === id)?.label ?? id,
    badgeName,
    aircraftName: (id) => deps.flyable.find((f) => f.spec.id === id)?.spec.name ?? id,
    loadScenario: deps.loadScenario,
    dev: { get: () => dev, set: (b) => { dev = b; if (!b) god = false } },
    god: { get: () => god, set: (b) => { god = b && dev } },
    download: downloadText,
    pickFile: pickTextFile,
    today: () => new Date().toISOString().slice(0, 10),
    ...(deps.onAssign === undefined ? {} : { onAssign: (r: AssignRequest) => deps.onAssign!(r, session, dev, god) }),
    ...(deps.onHide === undefined ? {} : { onHide: deps.onHide }),
  })
  return { hq, session }
}
