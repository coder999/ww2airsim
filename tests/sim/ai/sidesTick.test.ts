import { describe, expect, it } from 'vitest'
import { advance, createWorldOf, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { GREEN_SKILL, VETERAN_SKILL, initialDecision, type PilotSkill } from '../../../src/sim/ai/pilot.js'
import { FLOOR_M } from '../../../src/sim/ai/safety.js'
import type { Side } from '../../../src/sim/sides.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level } from './maneuverWorlds.js'

/**
 * 7e spec §4.2 in production `advance`: a pilot with no static target
 * chooses one, re-checks it every tick, retargets within one tick of its
 * death, and loiters with nothing to fight.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const ALT = 3000
const chooser = (skill: PilotSkill, id: string) => ({ target: null, skill, decision: initialDecision(id) })
const ac = (id: string, p: Vec3, v: Vec3, side?: Side, pilot?: AircraftEntity<undefined>['pilot']): AircraftEntity<undefined> =>
  ({ ...level(id, f6f, p, v), ...(side === undefined ? {} : { side }), ...(pilot == null ? {} : { pilot }) })
const byId = (w: World<undefined>, id: string) => w.aircraft.find((a) => a.id === id)!
const run = (w: World<undefined>, seconds: number, each?: (w: World<undefined>) => void): World<undefined> => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { w = advance(w, DT).world; each?.(w) }
  return w
}
const destroy = (w: World<undefined>, id: string): World<undefined> => ({
  ...w,
  combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...w.combat.aircraft[id]!, damage: { ...w.combat.aircraft[id]!.damage, destroyedAt: w.tick } } } },
})

/** An allied hunter, two unpiloted axis aircraft ahead, and a far-off allied player. */
const hunterWorld = (): World<undefined> => createWorldOf({
  aircraft: [
    ac('obs', v3(-7000, ALT + 2000, 0), v3(120, 0, 0)),
    ac('hunter', v3(0, ALT, 0), v3(120, 0, 0), 'allied', chooser(VETERAN_SKILL, 'hunter')),
    ac('h1', v3(1500, ALT, 100), v3(110, 0, 0)),
    ac('h2', v3(3000, ALT, -400), v3(110, 0, 0)),
  ],
  player: 'obs',
})

describe('a pilot that chooses its target (7e spec §4.2)', () => {
  it('picks the better contact on its first tick, engages, and snapshots it', () => {
    const before = hunterWorld()
    const w = advance(before, DT).world
    const d = byId(w, 'hunter').pilot!.decision
    expect(d.targetId).toBe('h1')
    expect(d.mode).toBe('engage')
    expect(d.observedTargetPosition).toEqual(byId(before, 'h1').state.position)
  })

  it('retargets within one tick of its target\'s death, onto a fresh snapshot of the new one', () => {
    let w = run(hunterWorld(), 2)
    expect(byId(w, 'hunter').pilot!.decision.targetId).toBe('h1')
    w = destroy(w, 'h1')
    const before = w
    w = advance(w, DT).world
    const d = byId(w, 'hunter').pilot!.decision
    expect(d.targetId).toBe('h2')
    expect(d.observedTargetPosition).toEqual(byId(before, 'h2').state.position)
    expect(d.latch).toBeNull()
  })

  it('never fires at a destroyed target afterwards', () => {
    let w = run(hunterWorld(), 2)
    w = destroy(destroy(w, 'h1'), 'h2')
    const shots = w.combat.aircraft['hunter']!.shots
    w = run(w, 10, (x) => expect(byId(x, 'hunter').controls.fire ?? false).toBe(false))
    expect(w.combat.aircraft['hunter']!.shots).toBe(shots)
    expect(byId(w, 'hunter').pilot!.decision.mode).toBe('loiter')
    expect(byId(w, 'hunter').pilot!.decision.targetId).toBeNull()
  })

  it('loiters with no contact inside 8 km: holds heading and altitude, never below the floor', () => {
    let w = createWorldOf({
      aircraft: [ac('obs', v3(-9000, ALT, 0), v3(-120, 0, 0)), ac('lone', v3(0, ALT, 0), v3(0, 0, -120), 'axis', chooser(GREEN_SKILL, 'lone'))],
      player: 'obs',
    })
    // 'obs' is 9 km away: outside detection.
    let minY = Infinity
    let maxY = -Infinity
    w = run(w, 20, (x) => { const y = byId(x, 'lone').state.position.y; minY = Math.min(minY, y); maxY = Math.max(maxY, y) })
    const lone = byId(w, 'lone')
    expect(lone.pilot!.decision.mode).toBe('loiter')
    expect(lone.pilot!.decision.targetId).toBeNull()
    expect(maxY - ALT).toBeLessThan(150)
    expect(ALT - minY).toBeLessThan(150)
    expect(minY).toBeGreaterThan(FLOOR_M)
    // Still heading north (-z), within 10 degrees.
    const v = lone.state.velocity
    expect(Math.abs(Math.atan2(v.x, -v.z)) * 180 / Math.PI).toBeLessThan(10)
  })
})

describe('a static target that dies (7c handoff open item 4; ruling W3)', () => {
  it('leaves the pilot without a target, loitering, not chasing the wreck', () => {
    let w = createWorldOf({
      aircraft: [
        ac('p', v3(0, ALT, 0), v3(120, 0, 0)),
        ac('pursuer', v3(-800, ALT, 0), v3(125, 0, 0), undefined, { target: 'p', skill: VETERAN_SKILL, decision: initialDecision('pursuer') }),
      ],
      player: 'p',
    })
    w = run(w, 1)
    expect(byId(w, 'pursuer').pilot!.decision.targetId).toBe('p')
    w = destroy(w, 'p')
    const shots = w.combat.aircraft['pursuer']!.shots
    let minY = Infinity
    w = run(w, 20, (x) => {
      expect(byId(x, 'pursuer').controls.fire ?? false).toBe(false)
      minY = Math.min(minY, byId(x, 'pursuer').state.position.y)
    })
    const d = byId(w, 'pursuer').pilot!.decision
    expect(d.targetId).toBeNull()
    expect(d.mode).toBe('loiter')
    expect(w.combat.aircraft['pursuer']!.shots).toBe(shots)
    expect(minY).toBeGreaterThan(ALT - 300)
  })
})

describe('many pilots: order independence and serialization (Review Focus 5)', () => {
  const six = (): AircraftEntity<undefined>[] => [
    ac('p', v3(0, ALT, 0), v3(120, 0, 0)),
    ac('a1', v3(-300, ALT + 100, 300), v3(120, 0, 0), 'allied', chooser(VETERAN_SKILL, 'a1')),
    ac('a2', v3(-300, ALT - 100, -300), v3(120, 0, 0), 'allied', chooser(GREEN_SKILL, 'a2')),
    ac('x1', v3(3000, ALT, 200), v3(-120, 0, 0), 'axis', chooser(VETERAN_SKILL, 'x1')),
    ac('x2', v3(3200, ALT + 200, -200), v3(-120, 0, 0), 'axis', chooser(GREEN_SKILL, 'x2')),
    ac('x3', v3(3400, ALT - 200, 0), v3(-120, 0, 0), 'axis', chooser(GREEN_SKILL, 'x3')),
  ]
  const fly = (list: AircraftEntity<undefined>[], seconds: number) => run(createWorldOf({ aircraft: list, player: 'p' }), seconds)

  it('reversing the array of six aircraft (five choosing pilots, two sides) changes nothing over 20 s', () => {
    const normal = fly(six(), 20)
    const reversed = fly(six().reverse(), 20)
    for (const a of normal.aircraft) {
      const r = byId(reversed, a.id)
      expect(r.state, a.id).toEqual(a.state)
      expect(r.controls, a.id).toEqual(a.controls)
      expect(r.pilot, a.id).toEqual(a.pilot)
    }
    expect(reversed.combat.aircraft).toEqual(normal.combat.aircraft)
    // Every pilot chose someone on the other side at some point.
    for (const id of ['a1', 'a2', 'x1', 'x2', 'x3']) expect(byId(normal, id).pilot!.decision.mode, id).not.toBe('ingress')
  })

  it('a structuredClone taken mid-fight flies on bit-identically', () => {
    const mid = fly(six(), 10)
    const a = run(mid, 10)
    const b = run(structuredClone(mid), 10)
    expect(b.aircraft).toEqual(a.aircraft)
    expect(b.combat).toEqual(a.combat)
  })
})
