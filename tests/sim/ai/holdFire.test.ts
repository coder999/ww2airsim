import { describe, expect, it } from 'vitest'
import { HOLD_FIRE_BEYOND_TARGET_M, HOLD_FIRE_CONE_RAD, friendlyInLineOfFire } from '../../../src/sim/ai/holdFire.js'
import { AI_GUN_CONE_RAD } from '../../../src/sim/ai/pursuit.js'
import { VETERAN_SKILL, initialDecision } from '../../../src/sim/ai/pilot.js'
import { advance, createWorldOf, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { sidesOf, type Side } from '../../../src/sim/sides.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { healthyDamage } from '../../../src/sim/damage/model.js'
import { level } from './maneuverWorlds.js'

/** 7e spec §4.3: the gun gate also refuses while any same-side aircraft is
 *  within 2 x cone of the nose and no farther than the target plus 100 m. */
const f6f = loadAircraftSpec('f6f-hellcat')
const ALT = 3000
const ac = (id: string, p: Vec3, v: Vec3, side?: Side, extra: Partial<AircraftEntity<undefined>> = {}): AircraftEntity<undefined> =>
  ({ ...level(id, f6f, p, v), ...(side === undefined ? {} : { side }), ...extra })
const shooter = ac('s', v3(0, ALT, 0), v3(120, 0, 0), 'allied')
const viewOf = (list: AircraftEntity<undefined>[], player = 's') => {
  const w = createWorldOf({ aircraft: list, player })
  return { w, view: { snapshot: w.aircraft, combat: w.combat.aircraft, sides: sidesOf(w, w.aircraft), terrain: w.terrain, decks: decksOf(w.ships) } }
}

describe('friendlyInLineOfFire (unit)', () => {
  const cone = HOLD_FIRE_CONE_RAD
  it('is twice the gun cone, unscaled by skill (ruling W5)', () => {
    expect(cone).toBeCloseTo(2 * AI_GUN_CONE_RAD, 12)
  })
  it('a friendly on the nose short of the target blocks; the same aircraft as an enemy does not', () => {
    expect(friendlyInLineOfFire(shooter, 400, viewOf([shooter, ac('f', v3(200, ALT, 0), v3(120, 0, 0), 'allied')]).view)).toBe(true)
    expect(friendlyInLineOfFire(shooter, 400, viewOf([shooter, ac('e', v3(200, ALT, 0), v3(120, 0, 0), 'axis')]).view)).toBe(false)
  })
  it('the cone edge: inside 2 x cone blocks, outside does not', () => {
    const r = 300
    const inside = ac('f', v3(r * Math.cos(cone * 0.95), ALT, r * Math.sin(cone * 0.95)), v3(120, 0, 0), 'allied')
    const outside = ac('f', v3(r * Math.cos(cone * 1.05), ALT, r * Math.sin(cone * 1.05)), v3(120, 0, 0), 'allied')
    expect(friendlyInLineOfFire(shooter, 400, viewOf([shooter, inside]).view)).toBe(true)
    expect(friendlyInLineOfFire(shooter, 400, viewOf([shooter, outside]).view)).toBe(false)
  })
  it('beyond the target plus 100 m does not block; just inside it does', () => {
    const at = (x: number) => viewOf([shooter, ac('f', v3(x, ALT, 0), v3(120, 0, 0), 'allied')]).view
    expect(friendlyInLineOfFire(shooter, 400, at(400 + HOLD_FIRE_BEYOND_TARGET_M - 1))).toBe(true)
    expect(friendlyInLineOfFire(shooter, 400, at(400 + HOLD_FIRE_BEYOND_TARGET_M + 1))).toBe(false)
  })
  it('the player counts as a friendly; a downed friendly does not', () => {
    const player = ac('pl', v3(200, ALT, 0), v3(120, 0, 0))
    const { view } = viewOf([shooter, player], 'pl')
    expect(friendlyInLineOfFire(shooter, 400, view)).toBe(true)
    const dead = { ...view, combat: { ...view.combat, pl: { ...view.combat['pl']!, damage: { ...view.combat['pl']!.damage, destroyedAt: 1 } } } }
    expect(friendlyInLineOfFire(shooter, 400, dead)).toBe(false)
  })
})

describe('a friendly crosses the line of fire (7e spec §4.7)', () => {
  it('the shooter holds fire while it is in the way, fires before and after, and never hits it', () => {
    // A veteran allied shooter 300 m behind a straight axis target; an allied
    // aircraft keeps pace in x and slides across the shooter's nose at 150 m,
    // in the cone from about 0.7 s to 1.3 s. The target's damage is reset
    // every tick: a veteran kills a straight target at this range in under
    // half a second (measured 2026-09-26), and the gate can only be seen to
    // re-open on a live target.
    let w: World<undefined> = createWorldOf({
      aircraft: [
        ac('s', v3(0, ALT, 0), v3(120, 0, 0), 'allied', { pilot: { target: 't', skill: VETERAN_SKILL, decision: initialDecision('s') } }),
        ac('t', v3(300, ALT, 0), v3(118, 0, 0)),
        ac('x', v3(150, ALT, 60), v3(120, 0, -60), 'allied'),
        ac('pl', v3(-6000, ALT + 3000, 0), v3(-120, 0, 0)),
      ],
      player: 'pl',
    })
    const cone = { blockedTicks: 0, firedWhileBlocked: 0, shotsBefore: 0, shotsAfter: 0 }
    let phase: 'before' | 'during' | 'after' = 'before'
    for (let i = 0; i < 4 * 60; i++) {
      w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, t: { ...w.combat.aircraft['t']!, damage: healthyDamage() } } } }
      const s = w.aircraft.find((a) => a.id === 's')!
      const t = w.aircraft.find((a) => a.id === 't')!
      const view = { snapshot: w.aircraft, combat: w.combat.aircraft, sides: sidesOf(w, w.aircraft), terrain: w.terrain, decks: decksOf(w.ships) }
      const range = Math.hypot(t.state.position.x - s.state.position.x, t.state.position.y - s.state.position.y, t.state.position.z - s.state.position.z)
      const blocked = friendlyInLineOfFire(s, range, view)
      const shots = w.combat.aircraft['s']!.shots
      w = advance(w, DT).world
      const fired = w.combat.aircraft['s']!.shots - shots
      if (blocked) { phase = 'during'; cone.blockedTicks++; cone.firedWhileBlocked += fired }
      else if (phase === 'before') cone.shotsBefore += fired
      else cone.shotsAfter += fired
    }
    expect(cone.blockedTicks, 'the crosser never entered the cone').toBeGreaterThan(5)
    expect(cone.firedWhileBlocked).toBe(0)
    expect(cone.shotsBefore, 'never fired before the crossing').toBeGreaterThan(0)
    expect(cone.shotsAfter, 'never fired after the crossing').toBeGreaterThan(0)
    expect(w.combat.aircraft['x']!.damage.structure).toBe(1)
    expect(w.combat.aircraft['s']!.friendlyHits).toBe(0)
  })
})
