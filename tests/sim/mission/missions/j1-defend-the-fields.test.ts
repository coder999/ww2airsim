/**
 * J1 Defend the Fields, flown headless (F10C, 2026-10-17). Drafted by Codex, reviewed and corrected by Claude.
 * Terrain flights follow Field Patrol and Scramble.
 *
 * The Ki-21 is admitted when the first wave is gone (`when.gone` on tag wave-a), so the peak stays at F3's ten:
 * player, wingman, two Ki-43 and two Hellcats, then the second wave of four, with the Ki-21 never coexisting with wave A.
 * Canonical Buri's tower used to carry a tag equal to its id (a content defect: any reference to it threw); it is tagged
 * "buri-control" now, and the operations rule below names it by id.
 */
import { describe, it, expect } from 'vitest'
import { bundleForScenario, loadScenario, loadScenarioBundle } from '../../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../../src/sim/scenario.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { playerAircraft, withAircraftState, type World } from '../../../../src/sim/loop.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { fieldState } from '../../../../src/sim/mission/fields.js'
import { progressOf } from '../fixture.js'
import { deckRun, destroyNow, fieldApproach, hold, levelAt, settledAll, terrainOrSkip } from '../fly.js'

const ID = 'j1-defend-the-fields'
const FIELD = { x: -41025, z: -22005 }
const RAIDERS = ['raid-1', 'raid-2', 'raid-3', 'raid-4', 'raid-5', 'raid-6']
const GROUPS = [
  { id: 'g-fuel', tag: 'buri-fuel', structures: ['buri-fuel-farm'] },
  { id: 'g-radio', tag: 'buri-radio', structures: ['buri-radio-station'] },
  { id: 'g-north', tag: 'buri-north-hangar', structures: ['buri-hangar-n'] },
  { id: 'g-south', tag: 'buri-south-hangar', structures: ['buri-hangar-s'] },
  { id: 'g-dispersal', tag: 'buri-dispersal', structures: ['buri-revetment-1', 'buri-revetment-2'] },
]
const OPERATIONS = ['buri-tower', 'buri-ammo-bunker-1', 'buri-barracks-1']
const HOLDS = 'Buri tower: The field holds. Recover at Buri; divert to Bayug only if Buri is unserviceable.'
const LOST = 'Buri tower: Too many groups lost. The defense has failed. Bring your aircraft home.'
const TAKEOFF = { flaps: false, climbToM: 300 } as const
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
const terrain = terrainOrSkip()
const defend = (): World<undefined> => settledAll(worldFromScenario(loadScenarioBundle(ID), terrain))
const holdTo = (w: World<undefined>, s: number): World<undefined> => hold(w, FAR, Math.max(0, ticksFor(s) - w.tick))

/** Remove each wave at admission so bomb accuracy cannot decide an objective-graph test. */
function closeStrike(w: World<undefined>): World<undefined> {
  let world = holdTo(w, 120)
  world = hold(destroyNow(world, RAIDERS.slice(0, 2)), FAR, 1)
  expect(progressOf(world, 'strike').status).not.toBe('complete') // unspawned wave B has not gone
  world = holdTo(world, 180)
  expect(world.mission!.spawned).toEqual(expect.arrayContaining(['strike-a', 'strike-b', 'ki21-group']))
  return hold(destroyNow(world, RAIDERS.slice(2)), FAR, 1)
}

/** Bayug's north-south runway has a crosswind in J1. The shared helper cannot
 * fly that crosswind (fly.ts); calm ONLY this landing fixture, not the scenario. */
const landBayug = (w: World<undefined>): World<undefined> => fieldApproach({ ...w, wind: null }, 'bayug')

describe('J1 Defend the Fields content', () => {
  it('starts two running Zeros at Buri and releases two Ki-43-IIbs on takeoff', () => {
    const { scenario } = loadScenarioBundle(ID)
    const world = worldFromScenario(loadScenarioBundle(ID), null)
    expect(scenario.player).toBe('zero-1')
    expect(scenario.aircraft.find((a) => a.id === scenario.player)).toMatchObject({
      spec: 'a6m2-zero', side: 'axis', parkedAt: { airfield: 'buri', spot: { x: -8, z: -330 } }, chocked: false,
    })
    expect(sideOf(world, playerAircraft(world))).toBe('axis')
    expect(scenario.aircraft.find((a) => a.id === 'zero-2')).toMatchObject({
      spec: 'a6m2-zero', side: 'axis', parkedAt: { airfield: 'buri', spot: { x: 8, z: -330 } }, chocked: false, pilot: { takeoff: true },
    })
    const pair = scenario.heldGroups!.find((g) => g.id === 'ki43-pair')!.aircraft!
    expect(pair).toHaveLength(2)
    for (const a of pair) expect(a).toMatchObject({ spec: 'ki-43-oscar', side: 'axis' })
    expect(scenario.triggers).toContainEqual(expect.objectContaining({ when: { completed: 'up' }, then: expect.arrayContaining([{ spawn: 'ki43-pair' }]) }))
    for (const id of ['buri', 'bayug']) expect(world.airfields.find((a) => a.id === id)).toMatchObject({ side: 'axis', serviceable: true })
  })

  it('four Hellcats and two Avengers threaten every group and the tower from the east', () => {
    const scenario = loadScenario(ID)
    const raiders = scenario.heldGroups!.flatMap((g) => g.aircraft ?? []).filter((a) => a.tags?.includes('raid'))
    expect(raiders.map((a) => a.id)).toEqual(RAIDERS)
    expect(raiders.map((a) => a.spec)).toEqual([...Array<string>(4).fill('f6f-hellcat'), ...Array<string>(2).fill('tbm-3-avenger')])
    expect(raiders.map((a) => a.pilot?.ingress?.destination)).toEqual(
      [...GROUPS.map((g) => g.tag), 'buri-tower'].map((aim) => ({ airfield: 'buri', aim })),
    )
    for (const a of raiders) {
      expect(a.side).toBe('allied')
      expect(a.pilot).toMatchObject({ skill: 'green', ingress: { attack: a.spec === 'f6f-hellcat' ? 'dive-bomb' : 'level-bomb' } })
      if (!('airborneAt' in a)) throw new Error(`${a.id}: raider must start airborne`)
      expect(a.airborneAt.position[0]).toBeGreaterThan(FIELD.x)
      expect(Math.hypot(a.airborneAt.position[0] - FIELD.x, a.airborneAt.position[2] - FIELD.z)).toBeLessThan(9656)
    }
    expect(scenario.triggers).toContainEqual(expect.objectContaining({ when: { at: 120 }, then: expect.arrayContaining([{ spawn: 'strike-a' }]) }))
    expect(scenario.triggers).toContainEqual(expect.objectContaining({ when: { at: 180 }, then: expect.arrayContaining([{ spawn: 'strike-b' }]) }))
  })

  it('resolves five intact groups, the operations rule, and conditional recovery in the mission world', () => {
    const { scenario } = loadScenarioBundle(ID)
    const world = worldFromScenario(loadScenarioBundle(ID), null)
    for (const g of GROUPS) {
      expect(world.mission!.objectives.find((o) => o.id === g.id)).toMatchObject({
        kind: 'protect', priority: 'secondary', targets: [g.tag], resolved: g.structures,
        after: 'up', maxLost: 0, until: { gone: { targets: ['raid'] } },
      })
    }
    expect(world.mission!.refs['raid']).toEqual(RAIDERS)
    expect(world.mission!.objectives.find((o) => o.id === 'strike')).toMatchObject({
      kind: 'atLeast', n: 3, of: GROUPS.map((g) => g.id), after: 'up', until: { gone: { targets: ['raid'] } },
    })
    expect(scenario.fieldRules).toEqual([{ airfield: 'buri', structures: OPERATIONS, minFraction: 0.5 }])
    expect(world.mission!.fieldRules).toEqual([{ airfield: 'buri', ids: OPERATIONS, minFraction: 0.5 }])
    for (const id of OPERATIONS) expect(world.combat.structures[id]).toBeDefined()
    expect(scenario.objectives!.find((o) => o.id === 'home-buri')).toMatchObject({ kind: 'land', at: 'buri', after: 'strike', requires: { serviceable: ['buri'] } })
    expect(scenario.objectives!.find((o) => o.id === 'home-bayug')).toMatchObject({ kind: 'land', at: 'bayug', after: 'strike', requires: { unserviceable: ['buri'] } })
    expect(scenario.objectives!.find((o) => o.id === 'home')).toMatchObject({ kind: 'atLeast', n: 1, of: ['home-buri', 'home-bayug'], after: 'strike' })
    expect(scenario.freezeOnSuccess).toBe(true)
    expect(world.mission!.freezeOnSuccess).toBe(true)
  })

  it('keeps F3\'s peak of ten: the Ki-21 is admitted only when wave A is gone, and without that gate the peak is eleven', () => {
    const scenario = loadScenario(ID)
    expect(scenario.population).toEqual({ airborne: 10, ships: 0 })
    expect(() => parseScenario(scenario)).not.toThrow()
    expect(() => parseScenario({ ...scenario, population: { airborne: 9, ships: 0 } })).toThrow(/10 aircraft can be airborne at once/)
    expect(scenario.triggers).toContainEqual(expect.objectContaining({ when: { gone: { targets: ['wave-a'] } }, then: expect.arrayContaining([{ spawn: 'ki21-group' }]) }))
    const ungated = { ...scenario, triggers: scenario.triggers!.map((t) => (t.then.some((x) => 'spawn' in x && x.spawn === 'ki21-group') ? { ...t, when: { at: 150 } } : t)) }
    expect(() => parseScenario(ungated)).toThrow(/11 aircraft can be airborne at once/)
  })
})

describe.skipIf(terrain === null)('J1 Defend the Fields, headless', () => {
  it('a passive distant player earns no strike completion or badge while both timed waves enter', () => {
    const w = holdTo(defend(), 180)
    // Airborne staging satisfies the engine's takeoff latch. Nothing else is earned by waiting here.
    expect(w.mission!.objectives.filter((_, i) => w.mission!.progress[i]!.status === 'complete').map((o) => o.id)).toEqual(['up'])
    expect(progressOf(w, 'strike').status).not.toBe('complete')
    expect(progressOf(w, 'home').status).not.toBe('complete')
    expect(recoveryOf(w)).toBeNull()
    expect(missionOutcome(w.mission!, { kind: 'landed', at: null, base: null }).badge).toBeNull()
    for (const [group, seconds] of [['strike-a', 120], ['strike-b', 180]] as const) {
      expect(w.mission!.log.find((e) => e.kind === 'spawn' && e.group === group)?.tick).toBe(ticksFor(seconds))
    }
    expect(w.mission!.spawned).not.toContain('ki21-group') // nobody has downed wave A, so the Ki-21 is still waiting
    const waveB = w.aircraft.filter((a) => RAIDERS.slice(2).includes(a.id))
    expect(waveB).toHaveLength(4)
    for (const a of waveB) expect(Math.hypot(a.state.position.x - FIELD.x, a.state.position.z - FIELD.z)).toBeLessThan(9656)
  })

  it('releases the Ki-43 pair exactly when a real takeoff completes up', () => {
    const start = defend()
    expect(start.aircraft.some((a) => a.id.startsWith('ki43-'))).toBe(false)
    const w = deckRun(start, TAKEOFF)
    expect(progressOf(w, 'up').status).toBe('complete')
    const up = w.mission!.log.find((e) => e.kind === 'objective' && e.id === 'up' && e.status === 'complete')!
    const releases = w.mission!.log.filter((e) => e.kind === 'spawn' && e.group === 'ki43-pair')
    expect(releases).toHaveLength(1)
    expect(releases[0]!.tick).toBe(up.tick)
    expect(w.aircraft.filter((a) => ['ki43-1', 'ki43-2'].includes(a.id))).toHaveLength(2)
  })

  it.each([1, 2, 3, 5])('%i groups destroyed: three intact groups are required through the entire strike', (lost) => {
    let w = deckRun(defend(), TAKEOFF)
    w = hold(destroyNow(w, GROUPS.slice(0, lost).flatMap((g) => g.structures), 'raid-1'), FAR, 1)
    expect(progressOf(w, 'strike').status).toBe(lost <= 2 ? 'active' : 'failed')
    w = closeStrike(w)
    expect(GROUPS.filter((g) => progressOf(w, g.id).status === 'complete')).toHaveLength(5 - lost)
    expect(progressOf(w, 'strike').status).toBe(lost <= 2 ? 'complete' : 'failed')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(lost <= 2 ? HOLDS : LOST)
    if (lost >= 3) {
      w = fieldApproach(w, 'buri')
      expect(progressOf(w, 'home').status).not.toBe('complete')
      expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null })
    }
  })

  it('one dispersal revetment lost fails the whole dispersal group', () => {
    let w = deckRun(defend(), TAKEOFF)
    w = hold(destroyNow(w, ['buri-revetment-1'], 'raid-1'), FAR, 1)
    expect(progressOf(w, 'g-dispersal').status).toBe('failed')
    expect(w.combat.structures['buri-revetment-2']!.destroyedTick).toBeNull()
  })

  it('tower plus ammo bunker lost: Bayug completes home, while Buri does not', () => {
    let w = closeStrike(deckRun(defend(), TAKEOFF))
    w = hold(destroyNow(w, ['buri-tower'], 'raid-1'), FAR, 1)
    expect(fieldState(w.mission!, w, 'buri').serviceable).toBe(true)
    w = hold(destroyNow(w, ['buri-ammo-bunker-1'], 'raid-1'), FAR, 1)
    expect(fieldState(w.mission!, w, 'buri').serviceable).toBe(false)
    const buri = fieldApproach(w, 'buri')
    expect(progressOf(buri, 'home-buri').status).not.toBe('complete')
    expect(progressOf(buri, 'home').status).not.toBe('complete')
    expect(missionOutcome(buri.mission!, recoveryOf(buri)!)).toMatchObject({ result: 'no-badge', badge: null })
    const bayug = landBayug(w)
    expect(progressOf(bayug, 'home-bayug').status).toBe('complete')
    expect(progressOf(bayug, 'home').status).toBe('complete')
    expect(missionOutcome(bayug.mission!, recoveryOf(bayug)!)).toMatchObject({ result: 'success', badge: { id: ID } })
  })

  it('Bayug cannot substitute for a serviceable Buri', () => {
    const w = landBayug(closeStrike(deckRun(defend(), TAKEOFF)))
    expect(progressOf(w, 'home-bayug').status).not.toBe('complete')
    expect(progressOf(w, 'home').status).not.toBe('complete')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null })
  })

  it('the Ki-21 must reach the threshold alive; protection ends at arrival', () => {
    let w = deckRun(defend(), TAKEOFF)
    w = holdTo(w, 120)
    w = holdTo(hold(destroyNow(w, RAIDERS.slice(0, 2)), FAR, 1), 150)
    expect(progressOf(w, 'ki21-arrive').status).toBe('active')
    const arrival = w.mission!.objectives.find((o) => o.id === 'ki21-arrive')!
    if (arrival.kind !== 'arrive') throw new Error('ki21-arrive must be an arrive objective')
    const atThreshold = levelAt(arrival.zone.point, 900, 85, 80)
    const failed = hold(destroyNow(withAircraftState(w, 'ki21-1', { ...atThreshold, tick: w.tick }), ['ki21-1'], 'raid-1'), FAR, 1)
    expect(progressOf(failed, 'ki21-arrive').status).toBe('failed')
    expect(progressOf(failed, 'ki21-safe').status).toBe('failed')
    expect(progressOf(failed, 'ki21').status).toBe('failed')
    w = hold(withAircraftState(w, 'ki21-1', { ...atThreshold, tick: w.tick }), FAR, 1)
    expect(progressOf(w, 'ki21-arrive').status).toBe('complete')
    expect(progressOf(w, 'ki21-safe').status).toBe('complete')
    expect(progressOf(w, 'ki21').status).toBe('complete')
    w = hold(destroyNow(w, ['ki21-1'], 'raid-1'), FAR, 1)
    expect(progressOf(w, 'ki21').status).toBe('complete')
  })

  it('success: take off, destroy all raiders, land the Zero at Buri, earn the badge and freeze the script', () => {
    let w = closeStrike(deckRun(defend(), TAKEOFF))
    expect(progressOf(w, 'up').status).toBe('complete')
    expect(progressOf(w, 'strike').status).toBe('complete')
    expect(progressOf(w, 'home').status).not.toBe('complete')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(HOLDS)
    w = fieldApproach(w, 'buri')
    expect(playerAircraft(w).spec.id).toBe('a6m2-zero')
    expect(progressOf(w, 'home').status).toBe('complete')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: { id: ID }, reasons: [] })
    expect(w.mission!.latched).toBe(true)
    const progress = w.mission!.progress
    w = hold(destroyNow(w, GROUPS.flatMap((g) => g.structures), 'raid-1'), FAR, 1)
    expect(w.mission!.progress).toEqual(progress)
  })

  // MEASURED GAP, 2026-10-17 (a tripwire): the six AI attackers cannot take three groups. Over eight variants (altitude 1,800 and 3,000 m, approach from
  // east, 60 degrees either side, both waves at once, with and without the wingmen and Ki-43s, player passive and 60 km away) they destroyed
  // 0-2 of the five groups, because the field's three AAA emplacements and the ground kill most of them before they drop (each attacker dropped 0-1
  // bombs). So `strike` cannot fail by AI action alone, and a passive player who takes off and lands earns the badge. Re-measure if the AI changes.
  it('MEASURED GAP: with no wingmen and a passive player the raid still loses (at most two groups fall), so the strike completes', () => {
    const scenario = loadScenario(ID)
    const bare = {
      ...scenario,
      aircraft: scenario.aircraft.filter((a) => a.id !== 'zero-2'),
      heldGroups: scenario.heldGroups!.filter((g) => g.id !== 'ki43-pair'),
      triggers: scenario.triggers!.map((t) => ({ ...t, then: t.then.filter((a) => !('spawn' in a && a.spawn === 'ki43-pair')) })).filter((t) => t.then.length > 0),
    }
    let w = deckRun(settledAll(worldFromScenario(bundleForScenario(parseScenario(bare)), terrain)), TAKEOFF)
    w = holdTo(w, 540)
    expect(GROUPS.filter((g) => progressOf(w, g.id).status === 'failed').length).toBeLessThanOrEqual(2)
    expect(progressOf(w, 'strike').status).toBe('complete')
  }, 120000)
})
