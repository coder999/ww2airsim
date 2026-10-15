/**
 * Builds the headquarters over the real browser (plan F5B): `localStorage`, the clock, `crypto` ids, file
 * download and upload. Until Task 10 switches the title over, `main.ts` shows it when the URL has `?hq`.
 */
import { UNSCORED_LABEL, createSession, buildShellCatalog, purgeLegacyRoster, unscoredReason, type Session } from '../campaignSession.js'
import { describeAircraft, type MissionDescriptor } from '../../campaign/index.js'
import { sortieIsDev } from '../devRecord.js'
import type { SettingsModel } from '../settings.js'
import { aircraftGate, isDevTakeoffHour, takeoffLockHour } from './launchRules.js'
import { missionAircraft } from './missionAircraft.js'
import { rankShort } from './model.js'
import { formatName, tierOf } from '../../campaign/index.js'
import type { FlyableAircraft } from '../sortie/flyable.js'
import type { Scenario } from '../../sim/scenario.js'
import { SCENARIO_OPTIONS, badgeName, type TitleScreenHandle } from '../titleScreen.js'
import { createHq, type AssignRequest, type HqHandle } from './screens.js'

export type HeadquartersDeps = {
  readonly flyable: readonly FlyableAircraft[]
  readonly loadScenario: (id: string) => Promise<Scenario>
  readonly title: TitleScreenHandle
  readonly settings: SettingsModel
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

export function createHeadquarters(root: HTMLElement, deps: HeadquartersDeps): { hq: HqHandle; session: Session; catalogNow: () => readonly MissionDescriptor[] | null } {
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
  const catalogOnce = (): Promise<MissionDescriptor[]> => (catalog ??= buildShellCatalog(SCENARIO_OPTIONS, deps.loadScenario, nationOf))

  /** Step 2's Assign: the title shows Forms 4 to 6 for this mission and pilot, and Launch starts the sortie. */
  const assign = async (r: AssignRequest): Promise<void> => {
    const c = session.current()
    if (c === null) return
    const pilot = c.pilots[r.pilotId]!
    const cat = await catalogOnce()
    const mission = r.row.scored ? cat.find((m) => m.id === r.row.id) ?? null : null
    const option = SCENARIO_OPTIONS.find((o) => o.value === r.row.id)!
    const authored = await deps.loadScenario(r.row.id).catch(() => null)
    const gate = aircraftGate(c, mission, r.pilotId, r.row.scored)
    const offered = missionAircraft(r.row.id)
    const reasonFor = (choice: { aircraftSpec: string; loadout: Parameters<typeof sortieIsDev>[2]; timeOfDay?: number | undefined; god?: boolean | undefined }) => {
      const spec = deps.flyable.find((f) => f.spec.id === choice.aircraftSpec)?.spec
      return unscoredReason({
        // An airplane outside the mission's list is a Dev choice (Form 5 shows it only with Dev) and is not recorded.
        section: r.row.section, devScenario: option.dev, devRules: (spec !== undefined && sortieIsDev(option, spec, choice.loadout, false)) || (offered !== null && !offered.includes(choice.aircraftSpec)),
        pilotIneligible: r.row.scored && !gate(choice.aircraftSpec).ok, devTakeoff: isDevTakeoffHour(choice.timeOfDay), god: choice.god === true,
      })
    }
    hq.hide()
    deps.title.beginSortie({
      scenarioId: r.row.id,
      pilotLabel: `${rankShort(c.faction, tierOf(pilot.points))} ${formatName(pilot.name, c.faction)}`,
      dev, god, lockedHour: takeoffLockHour(mission, authored?.weather?.timeOfDay ?? null), aircraftGate: gate,
      notRecorded: (choice) => { const u = reasonFor(choice); return u === null ? null : UNSCORED_LABEL[u] },
      onLaunch: (choice) => {
        if (reasonFor(choice) !== null) return null // unscored: nothing is launched in the campaign
        if (mission === null) return 'This mission has no orders in the catalog.'
        const out = session.launch({ pilotId: r.pilotId, mission, aircraft: describeAircraft(choice.aircraftSpec), difficulty: deps.settings.snapshot().difficulty, loadout: choice.loadout, unscored: null })
        return out.ok ? null : out.error.message
      },
      // Back from Form 4 returns to the headquarters on the pilot step; the old title goes back up beneath it so the world stays held.
      onBack: () => { deps.title.show(r.row.id); hq.reopen() },
    })
  }

  const hq = createHq(root, {
    session,
    settings: deps.settings,
    catalog: catalogOnce,
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
    onAssign: (r: AssignRequest) => { void assign(r) },
    ...(deps.onHide === undefined ? {} : { onHide: deps.onHide }),
  })
  let resolved: readonly MissionDescriptor[] | null = null
  void catalogOnce().then((c) => { resolved = c }, () => undefined)
  return { hq, session, catalogNow: () => resolved }
}
