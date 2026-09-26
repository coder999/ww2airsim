import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3, ZERO, type Vec3 } from '../../../src/sim/math/vec3.js'
import { createCombat, stepCombat, type CombatAircraft, type CombatState, type Projectile } from '../../../src/sim/weapons/combat.js'
import { storesFromLoadout } from '../../../src/sim/weapons/stores.js'
import { appendImpacts, IMPACT_RING_CAPACITY, type CombatImpact } from '../../../src/sim/weapons/impacts.js'
import { createTerrainField, SEA_LEVEL_M, type TerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'

const spec = loadAircraftSpec('f6f-hellcat')
const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
/** The flat heightfield strike.test.ts uses. */
const flat = (heightM: number): TerrainField => createTerrainField(
  parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
  12, new Int16Array(9).fill(Math.round(heightM * 10)),
)
/** The shooter, parked far from every shot so it is never a contact. */
const owner: CombatAircraft = (() => {
  const state = createState({ position: v3(50000, 3000, 50000) })
  return { id: 'f6f-1', spec, state, previous: state, controls: idle, impact: null }
})()
const shot = (kind: Projectile['kind'], position: Vec3, velocity: Vec3, over: Partial<Projectile> = {}): Projectile => ({
  owner: 'f6f-1', id: 1, position, previous: position, velocity, tracer: false, kind, ageS: 1,
  lifeS: kind === 'round' ? 3 : kind === 'bomb' ? 60 : 12, ...over,
})
const withShots = (...projectiles: Projectile[]): CombatState =>
  ({ ...createCombat([owner], { 'f6f-1': storesFromLoadout(spec, 'both') }), projectiles })
const step = (c: CombatState, terrain: TerrainField | null, tick = 7): CombatState =>
  stepCombat(c, [owner], [], [], terrain, null, [], tick, DT)

describe('World.combat.impacts (effects design §3.1)', () => {
  it('starts empty', () => {
    expect(createCombat([owner]).impacts).toEqual([])
  })

  it('a gun round into the sea records surface water at the contact point, stamped with the tick', () => {
    const after = step(withShots(shot('round', v3(0, 5, 0), v3(0, -800, 0))), null, 7)
    expect(after.impacts).toHaveLength(1)
    const hit = after.impacts[0]!
    expect(hit).toMatchObject({ tick: 7, cause: 'round', outcome: 'detonated', surface: 'water' })
    expect(hit.point.y).toBeCloseTo(SEA_LEVEL_M, 9)
    expect(hit.point.x).toBeCloseTo(0, 9)
  })

  it('a gun round into land records surface land within the bisection tolerance', () => {
    const after = step(withShots(shot('round', v3(0, 25, 0), v3(0, -800, 0))), flat(20))
    expect(after.impacts.map((i) => i.surface)).toEqual(['land'])
    expect(after.impacts[0]!.point.y).toBeCloseTo(20, 1)
  })

  it('an armed bomb into the sea records a detonation on water', () => {
    const after = step(withShots(shot('bomb', v3(0, 2, 0), v3(0, -300, 0))), null)
    expect(after.impacts).toEqual([expect.objectContaining({ cause: 'bomb', outcome: 'detonated', surface: 'water' })])
  })

  it('a dud (unarmed bomb) records nothing (Ruling R2)', () => {
    const after = step(withShots(shot('bomb', v3(0, 2, 0), v3(0, -300, 0), { ageS: 0.1 })), null)
    expect(after.projectiles).toEqual([])
    expect(after.impacts).toEqual([])
  })

  it('a bomb and a rocket reaching lifeS in the air record outcome expired, surface air (Ruling R1)', () => {
    const bomb = shot('bomb', v3(0, 3000, 0), v3(100, 0, 0), { lifeS: 0.005 })
    const rocket = shot('rocket', v3(0, 3000, 100), v3(300, 0, 0), { id: 2, lifeS: 0.005, ageS: 5 })
    const after = step(withShots(bomb, rocket), null)
    expect(after.projectiles).toEqual([])
    expect(after.impacts.map((i) => [i.cause, i.outcome, i.surface])).toEqual([['bomb', 'expired', 'air'], ['rocket', 'expired', 'air']])
    expect(after.impacts[0]!.point.y).toBeGreaterThan(2999)
  })

  it('a round reaching lifeS records nothing (Ruling R3)', () => {
    const after = step(withShots(shot('round', v3(0, 3000, 0), v3(800, 0, 0), { lifeS: 0.005 })), null)
    expect(after.projectiles).toEqual([])
    expect(after.impacts).toEqual([])
  })

  it('keeps the same array reference across a tick that appended nothing', () => {
    const before = withShots(shot('round', v3(0, 3000, 0), v3(800, 0, 0)))
    expect(step(before, null).impacts).toBe(before.impacts)
  })

  it('appendImpacts keeps the newest IMPACT_RING_CAPACITY entries, oldest first', () => {
    const entry = (tick: number): CombatImpact => ({ tick, cause: 'round', outcome: 'detonated', surface: 'land', point: ZERO })
    let ring: readonly CombatImpact[] = []
    for (let t = 1; t <= IMPACT_RING_CAPACITY + 88; t++) ring = appendImpacts(ring, [entry(t)])
    expect(ring).toHaveLength(IMPACT_RING_CAPACITY)
    expect(ring[0]!.tick).toBe(89)
    expect(ring.at(-1)!.tick).toBe(IMPACT_RING_CAPACITY + 88)
    expect(appendImpacts(ring, [])).toBe(ring)
  })

  it('holds a whole MAX_STEPS_PER_FRAME frame of the heaviest gunfire the sim allows', () => {
    // Six .50s at 800 rpm fire 6 * 800 / 60 / 60 = 1.33 rounds per tick, so
    // at most 2 contacts per tick per airplane. A frame is at most
    // MAX_STEPS_PER_FRAME = 5 ticks. 512 therefore holds 38 airplanes all
    // hitting something every tick of a worst-case frame -- no scenario has
    // a tenth of that. Pinned so a capacity cut is a decision, not a drive-by.
    expect(IMPACT_RING_CAPACITY).toBeGreaterThanOrEqual(5 * 38 * 2)
  })
})
