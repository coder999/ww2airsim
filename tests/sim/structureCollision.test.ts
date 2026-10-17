import { describe, it, expect } from 'vitest'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { advance, aircraftById, withAircraftState, type World } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { bundleForScenario } from '../../tools/content/load.js'
import { COLLISION_ATTACKER_PREFIX, collisionShipName } from '../../src/sim/shipCollision.js'
import { STRUCTURE_COLLISION, structureContact } from '../../src/sim/structureCollision.js'
import { BASE, flatField } from './mission/fixture.js'

/**
 * F8A Task 4 (2026-10-16): an aircraft crashes into a structure's hit box. Tacloban's first hangar is the target
 * (content/bases/tacloban.json: 34 x 42 m at runway-local (-146, -150), so world (-29812, -47755), box top 10 m on flat
 * ground). The raider flies east with no pilot, so the controls hold and nothing steers it away. Each case is a flat
 * field, so nothing but the box can end the airplane.
 */
const HANGAR = { x: -29666 - 146, z: -47605 - 150 }
const SPEED = 100

function bed(): World<undefined> {
  const raw = {
    ...BASE,
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } },
      { id: 'raider', spec: 'f6f-hellcat', side: 'axis', airborneAt: { position: [HANGAR.x - 400, 3000, HANGAR.z], headingDeg: 90, speedMps: SPEED } },
    ],
  }
  return worldFromScenario(bundleForScenario(parseScenario(raw)), flatField(0))
}

const at = (w: World<undefined>, dx: number, y: number, dz: number): World<undefined> => {
  const a = aircraftById(w, 'raider')!
  return withAircraftState(w, 'raider', { ...a.state, position: v3(HANGAR.x + dx, y, HANGAR.z + dz), velocity: v3(SPEED, 0, 0), attitude: createState().attitude })
}

/** A level pass: put back at `y`, speed and heading every tick, so an untrimmed airframe's sag cannot decide the case. */
function pass(w0: World<undefined>, dx: number, y: number, dz: number, seconds: number): World<undefined> {
  let cur = at(w0, dx, y, dz)
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const a = aircraftById(cur, 'raider')!
    const p = a.state.position
    cur = advance(withAircraftState(cur, 'raider', { ...a.state, position: v3(p.x, y, p.z), velocity: v3(SPEED, 0, 0), attitude: createState().attitude }), DT).world
  }
  return cur
}
const gone = (w: World<undefined>): boolean => w.combat.aircraft['raider']!.damage.destroyedAt !== null

describe('air-to-structure collision (F8A Task 4)', () => {
  it('an airplane driven through a hangar box is destroyed, and the cause names the hangar', () => {
    let w = at(bed(), -60, 3, 0)
    for (let i = 0; i < Math.round(1.5 / DT); i++) w = advance(w, DT).world
    expect(gone(w)).toBe(true)
    expect(w.combat.aircraft['raider']!.damage.attacker).toBe(COLLISION_ATTACKER_PREFIX + 'tacloban-hangar-1')
    // It stops at the wall, not through the building and on.
    expect(aircraftById(w, 'raider')!.state.position.x).toBeLessThan(HANGAR.x + 20)
    expect(collisionShipName(w, w.combat.aircraft['raider']!.damage.attacker)).toBe('hangar at Tacloban')
  })

  it('one beside it does not: a pass 40 m to the side (beyond the box and the body allowance) lives', () => {
    const w = pass(bed(), -60, 3, -21 - STRUCTURE_COLLISION.bodyRadiusM - 40, 1.5)
    expect(gone(w)).toBe(false)
  })

  it('one above the roof does not: a pass at 40 m altitude lives; one under the top (8 m) dies', () => {
    expect(gone(pass(bed(), -60, 40, 0, 1.5))).toBe(false)
    expect(gone(pass(bed(), -60, 8, 0, 1.5))).toBe(true)
  })

  it('a destroyed building is rubble: nothing flies into it any more', () => {
    const w0 = bed()
    const structures = w0.combat.structures
    const down = { ...w0, combat: { ...w0.combat, structures: { ...structures, 'tacloban-hangar-1': { hp: 0, destroyedTick: 1, attacker: 'test' } } } }
    expect(gone(pass(down, -60, 3, 0, 1.5))).toBe(false)
  })

  it('a heading rotates the box: long in z it is crossed by a line along x at z = 30, turned 90 degrees it is not', () => {
    const box = { position: v3(0, 5, 0), halfSize: { x: 5, y: 5, z: 50 }, headingRad: 0 }
    expect(structureContact(box as never, v3(-80, 3, 30), v3(80, 3, 30))).not.toBeNull()
    expect(structureContact({ ...box, headingRad: Math.PI / 2 } as never, v3(-80, 3, 30), v3(80, 3, 30))).toBeNull()
  })

  it('a ground pass inside the box from the start is not a collision (content that starts there is a layout error, caught by the site tests)', () => {
    const s = { position: v3(0, 5, 0), halfSize: { x: 5, y: 5, z: 5 }, headingRad: 0 }
    expect(structureContact(s as never, v3(0, 3, 0), v3(0, 3, 0))).toBeNull()
  })
})
