import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createState, type Controls } from '../../src/sim/flight/state.js'
import { DT, step as stepFlight } from '../../src/sim/flight/model.js'
import { add, length, sub, v3, ZERO, type Vec3 } from '../../src/sim/math/vec3.js'
import {
  burnedVelocity, createCombat, damageShip, damageStructure, flyProjectile, healthyShipDamage,
  SINK_SECONDS, stepCombat,
  type CombatAircraft, type CombatShip, type CombatState, type Projectile,
} from '../../src/sim/weapons/combat.js'
import { emptyStores, storesFromLoadout, storesSpec } from '../../src/sim/weapons/stores.js'
import { healthyStructureDamage, type StructureEntity } from '../../src/sim/weapons/structures.js'
import { createTerrainField, type TerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'

const spec = loadAircraftSpec('f6f-hellcat')
const stores = spec.stores!
const bomb = stores.types['an-m65']!
const rocket = stores.types['hvar']!
const full = storesFromLoadout(spec, 'both') // { bombs: 2, rockets: 6 }

const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
const drop: Controls = { ...idle, dropBomb: true }
const salvo: Controls = { ...idle, fireRockets: true }

/** A flat heightfield at `heightM`, the fixture `combat.test.ts` already uses. */
const flat = (heightM: number): TerrainField => createTerrainField(
  parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
  12, new Int16Array(9).fill(Math.round(heightM * 10)),
)

const air = (id: string, position: Vec3, velocity: Vec3 = ZERO, controls: Controls = idle): CombatAircraft => {
  const state = createState({ position, velocity })
  return { id, spec, state, previous: state, controls, impact: null }
}

// The real content (Task 7), not an inline stand-in: this pins the fixture's
// numbers to whatever `content/ships/type-b-maru.json` actually says, so a
// content edit that changes the maru's hull points or dimensions is caught
// here rather than silently diverging from the shipped ship.
const MARU = loadShipSpec('type-b-maru')
const maru = (id: string, position: Vec3, headingRad = 0): CombatShip =>
  ({ id, spec: MARU, state: { position, headingRad }, previous: { position, headingRad } })

const hangar = (id: string, position: Vec3, hp = 120, half = { x: 15, y: 5, z: 20 }): StructureEntity =>
  ({ id, airfield: 'dulag', kind: 'hangar', position, headingRad: 0, halfSize: half, hp })

/** `stepCombat` with this file's argument order fixed once. */
const step = (
  before: CombatState, aircraft: readonly CombatAircraft[], opts: {
    ships?: readonly CombatShip[]; structures?: readonly StructureEntity[]
    terrain?: TerrainField | null; tick?: number; dt?: number; enemy?: ReadonlySet<string> | null
  } = {},
): CombatState => stepCombat(
  before, aircraft, opts.ships ?? [], opts.structures ?? [], opts.terrain ?? null, null, [],
  opts.tick ?? 1, opts.dt ?? DT, opts.enemy ?? null,
)

const armed = (aircraft: readonly CombatAircraft[], opts: {
  ships?: readonly CombatShip[]; structures?: readonly StructureEntity[]; stores?: typeof full
} = {}): CombatState => createCombat(
  aircraft,
  Object.fromEntries(aircraft.map(a => [a.id, opts.stores ?? full])),
  (opts.ships ?? []).map(s => ({ id: s.id, hullHp: s.spec.hullHp })),
  (opts.structures ?? []).map(s => ({ id: s.id, hp: s.hp })),
)

const bombRound = (position: Vec3, velocity: Vec3, over: Partial<Projectile> = {}): Projectile => ({
  owner: 'f6f-1', id: 1, position, previous: position, velocity,
  lifeS: bomb.lifetimeS, tracer: false, kind: 'bomb', ageS: 1, ...over,
})

// mulberry32's cursor step, the figure `randomFrom` in combat.ts advances by.
const CURSOR_STEP = 0x6d2b79f5
const afterDraws = (cursor: number, draws: number): number => (cursor + draws * CURSOR_STEP) >>> 0

describe('release', () => {
  it('drops one bomb and fires one rocket pair per tick the control asks, and never raises a count', () => {
    const a = air('f6f-1', v3(0, 1000, 0), v3(120, 0, 0), { ...idle, dropBomb: true, fireRockets: true })
    let c = armed([a])
    expect(c.aircraft['f6f-1']!.stores).toEqual({ bombs: 2, rockets: 6 })

    c = step(c, [a])
    expect(c.aircraft['f6f-1']!.stores).toEqual({ bombs: 1, rockets: 4 })
    expect(c.projectiles.filter(p => p.kind === 'bomb')).toHaveLength(1)
    expect(c.projectiles.filter(p => p.kind === 'rocket')).toHaveLength(2)

    // The control going quiet releases nothing, and the counts hold.
    const quiet = { ...a, controls: idle }
    c = step(c, [quiet], { tick: 2 })
    expect(c.aircraft['f6f-1']!.stores).toEqual({ bombs: 1, rockets: 4 })

    // Empty is empty: three more asking ticks cannot go below zero or emit.
    for (let tick = 3; tick <= 6; tick++) c = step(c, [a], { tick })
    expect(c.aircraft['f6f-1']!.stores).toEqual({ bombs: 0, rockets: 0 })
    expect(c.projectiles.filter(p => p.kind === 'bomb')).toHaveLength(2)
    expect(c.projectiles.filter(p => p.kind === 'rocket')).toHaveLength(6)
  })

  it('refuses a release parked below 2 m/s, and allows one rolling above it', () => {
    const terrain = flat(100)
    const both = { ...idle, dropBomb: true, fireRockets: true }
    const parked = air('f6f-1', v3(0, 100 + spec.gear.heightM, 0), v3(1.5, 0, 0), both)
    const held = step(armed([parked]), [parked], { terrain })
    expect(held.aircraft['f6f-1']!.stores).toEqual(full)
    expect(held.projectiles).toHaveLength(0)
    expect(held.rngState).toBe(armed([parked]).rngState)

    const rolling = air('f6f-1', v3(0, 100 + spec.gear.heightM, 0), v3(2.5, 0, 0), both)
    const away = step(armed([rolling]), [rolling], { terrain })
    expect(away.aircraft['f6f-1']!.stores).toEqual({ bombs: 1, rockets: 4 })

    // Airborne over the same field is not "parked", whatever the speed.
    const hanging = air('f6f-1', v3(0, 400, 0), v3(1, 0, 0), both)
    expect(step(armed([hanging]), [hanging], { terrain }).aircraft['f6f-1']!.stores).toEqual({ bombs: 1, rockets: 4 })
  })

  it('refuses a release from a crashed, a destroyed and an empty airplane', () => {
    const a = air('f6f-1', v3(0, 1000, 0), v3(120, 0, 0), { ...idle, dropBomb: true, fireRockets: true })

    const crashed: CombatAircraft = { ...a, impact: { kind: 'destroyed' } }
    expect(step(armed([crashed]), [crashed]).aircraft['f6f-1']!.stores).toEqual(full)

    const base = armed([a])
    const rec = base.aircraft['f6f-1']!
    const dead: CombatState = { ...base, aircraft: { 'f6f-1': { ...rec, damage: { ...rec.damage, structure: 0, destroyedAt: 7 } } } }
    expect(step(dead, [a]).aircraft['f6f-1']!.stores).toEqual(full)
    expect(step(dead, [a]).projectiles).toHaveLength(0)

    const clean = createCombat([a], { 'f6f-1': emptyStores })
    const after = step(clean, [a])
    expect(after.aircraft['f6f-1']!.stores).toEqual(emptyStores)
    expect(after.projectiles).toHaveLength(0)
    expect(after.rngState).toBe(clean.rngState)
  })

  it('drops bombs left then right, and fires rockets as the outermost remaining pair', () => {
    const position = v3(0, 1000, 0)
    const a = air('f6f-1', position, v3(120, 0, 0), drop)
    let c = armed([a])
    // Read each release on its own tick: `previous` is the spawn point only
    // while the projectile is one tick old (`flyProjectile` moves it on).
    const racks: Vec3[] = []
    for (let tick = 1; tick <= 2; tick++) {
      const before = c.projectiles.length
      c = step(c, [a], { tick })
      racks.push(...c.projectiles.slice(before).map(p => sub(p.previous, position)))
    }
    expect(racks.map(o => o.z)).toEqual([-2.6, 2.6])
    for (const o of racks) {
      expect(o.y).toBeCloseTo(-0.55, 9) // 1,500 m of altitude eats the last digits
      expect(o.x).toBeCloseTo(0.4, 9)
    }

    const r = air('f6f-1', position, v3(120, 0, 0), salvo)
    let q = armed([r])
    const pairs: number[][] = []
    for (let tick = 1; tick <= 3; tick++) {
      const before = q.projectiles.length
      q = step(q, [r], { tick })
      pairs.push(q.projectiles.slice(before).map(p => sub(p.previous, position).z))
    }
    expect(pairs).toEqual([[-5, 5], [-4.3, 4.3], [-3.6, 3.6]])
  })

  it('costs every release exactly one cone draw of the PRNG, bomb or rocket', () => {
    const a = air('f6f-1', v3(0, 1000, 0), v3(120, 0, 0), drop)
    const seeded = armed([a])
    expect(step(seeded, [a]).rngState).toBe(afterDraws(seeded.rngState, 2))

    const r = { ...a, controls: salvo }
    expect(step(seeded, [r]).rngState).toBe(afterDraws(seeded.rngState, 2))

    // Both at once is two releases, so two draws; a refused release is free.
    const both = { ...a, controls: { ...idle, dropBomb: true, fireRockets: true } }
    expect(step(seeded, [both]).rngState).toBe(afterDraws(seeded.rngState, 4))
  })
})

describe('ordnance flight', () => {
  it('flies a bomb on the round closed form with the bomb drag, over one tick and over many', () => {
    const position = v3(0, 1500, 0)
    const a = air('f6f-1', position, v3(120, 0, 0), drop)
    let c = step(armed([a]), [a])
    const spawn = c.projectiles[0]!
    const start = add(position, v3(0.4, -0.55, -2.6))
    expect(spawn.previous).toEqual(start)

    let reference = flyProjectile(
      { ...spawn, position: start, previous: start, velocity: v3(120, 0, 0), ageS: 0, lifeS: bomb.lifetimeS },
      DT, null, bomb.dragPerM,
    )
    expect(spawn.position).toEqual(reference.position)
    expect(spawn.velocity).toEqual(reference.velocity)
    expect(spawn.lifeS).toBeCloseTo(bomb.lifetimeS - DT, 12)
    expect(spawn.velocity.y).toBeCloseTo(-9.80665 * DT, 12)
    expect(spawn.ageS).toBeCloseTo(DT, 12)

    const quiet = { ...a, controls: idle }
    for (let tick = 2; tick <= 200; tick++) {
      c = step(c, [quiet], { tick })
      reference = flyProjectile(reference, DT, null, bomb.dragPerM)
    }
    const flown = c.projectiles[0]!
    expect(flown.position.x).toBeCloseTo(reference.position.x, 9)
    expect(flown.position.y).toBeCloseTo(reference.position.y, 9)
    expect(flown.ageS).toBeCloseTo(200 * DT, 9)
    // Drag has bitten: a dragless bomb would still be doing 120 m/s downrange.
    expect(flown.velocity.x).toBeLessThan(120)
    expect(flown.velocity.x).toBeGreaterThan(110)
  })

  it('lands a 1,500 m release at the range and speed the shipped drag actually gives', () => {
    const position = v3(0, 1500, 0)
    const a = air('f6f-1', position, v3(120, 0, 0), drop)
    const quiet = { ...a, controls: idle }
    const sea = flat(0)
    let c = step(armed([a]), [a], { terrain: sea })
    let last = c.projectiles[0]!
    let tick = 2
    while (c.projectiles.length > 0 && tick < 6000) {
      c = step(c, [quiet], { terrain: sea, tick: tick++ })
      if (c.projectiles.length > 0) last = c.projectiles[0]!
    }
    // Measured 2026-09-22 at `an-m65`'s shipped dragPerM of 2e-5, which is
    // what the content's `source` note says this test exists to record:
    // 17.67 s of fall, 2,066 m downrange, 202.9 m/s at the water. The note's
    // own "about 1,200 m" estimate was written without running it and has
    // been corrected to these figures; the 200 m/s estimate was right.
    expect(tick).toBe(1060)
    expect(last.position.x).toBeCloseTo(2066.5, 0)
    expect(length(last.velocity)).toBeCloseTo(202.9, 0)
  })

  it('pins the 100 m loaded-airframe run-in used by the browser bombing pass', () => {
    const loaded = storesSpec(spec, full)
    let current = createState({ position: v3(0, 1500, 0), velocity: v3(120, 0, 0) })
    let previous = current
    for (let tick = 1; tick <= 50; tick++) {
      previous = current
      current = stepFlight(loaded, current, idle, { dt: DT, tick })
    }

    // The live world releases from `previous` after stepping the airframe. The
    // 50-tick idle-power run-in reaches about 100 m and has already slowed and
    // begun descending, so it must not reuse the pristine 120 m/s calibration.
    expect(current.position.x).toBeCloseTo(98.9, 1)
    expect(current.velocity.x).toBeCloseTo(117.6, 1)
    expect(current.velocity.y).toBeCloseTo(-2.7, 1)

    let round = bombRound(previous.position, previous.velocity, { ageS: 0 })
    let ticks = 0
    do {
      round = flyProjectile(round, DT, null, bomb.dragPerM)
      ticks += 1
    } while (round.position.y > 0 && ticks < 6000)

    expect(ticks).toBe(1042)
    expect(round.position.x - previous.position.x).toBeCloseTo(1995.4, 1)
  })

  it('accelerates a rocket by its full burn delta-V over burnS, exactly, then stops', () => {
    // The closed form alone: every tick of the burn adds a * dt, and burnout
    // is exact even when a tick straddles it.
    let v = v3(100, 0, 0)
    for (let i = 0; i < Math.round(rocket.burnS! / DT); i++) {
      v = burnedVelocity(v, rocket.burnDeltaVMps!, rocket.burnS!, i * DT, DT)
    }
    expect(length(v)).toBeCloseTo(100 + rocket.burnDeltaVMps!, 9)
    // Past burnout the motor adds nothing.
    expect(burnedVelocity(v, rocket.burnDeltaVMps!, rocket.burnS!, rocket.burnS!, DT)).toEqual(v)
    // A tick straddling burnout gets only the remaining slice.
    const straddle = burnedVelocity(v3(1, 0, 0), 100, 1, 0.99, DT)
    expect(straddle.x).toBeCloseTo(1 + 100 * 0.01, 9)
  })

  it('reaches launch speed + 419 m/s at burnS within 1 %, and pays real drag for it', () => {
    const launch = 120
    const dragless = { ...spec, stores: { ...stores, types: { ...stores.types, hvar: { ...rocket, dragPerM: 0 } } } }
    const fly = (s: typeof spec): number => {
      const a: CombatAircraft = { ...air('f6f-1', v3(0, 1000, 0), v3(launch, 0, 0), salvo), spec: s }
      const quiet = { ...a, controls: idle }
      let c = step(armed([a]), [a])
      for (let tick = 2; tick <= Math.round(rocket.burnS! / DT); tick++) c = step(c, [quiet], { tick })
      return length(c.projectiles[0]!.velocity)
    }
    const ideal = launch + rocket.burnDeltaVMps!
    expect(fly(dragless)).toBeGreaterThan(ideal * 0.99)
    expect(fly(dragless)).toBeLessThan(ideal * 1.01)
    // The shipped hvar drag costs a real but modest slice of that.
    expect(fly(spec)).toBeLessThan(ideal)
    expect(fly(spec)).toBeGreaterThan(ideal - 20)
  })
})

describe('detonation', () => {
  const skip = (from: Vec3, velocity: Vec3, over: Partial<Projectile> = {}) => bombRound(from, velocity, over)

  it('is a dud before armS: removed, and nothing takes damage', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    const target = hangar('hangar-1', v3(0, 5, 0), 200)
    const early = { ...armed([a], { structures: [target] }), projectiles: [skip(v3(0, 20, 0), v3(0, -200, 0), { ageS: bomb.armS! - 0.2 })] }
    const after = step(early, [a], { structures: [target], dt: 0.1 })
    expect(after.projectiles).toHaveLength(0)
    expect(after.structures['hangar-1']).toEqual(healthyStructureDamage(200))
    expect(after.aircraft['f6f-1']!.structuresDestroyed).toBe(0)

    // The identical bomb one tenth of a second older is armed, and is not.
    const armedBomb = { ...armed([a], { structures: [target] }), projectiles: [skip(v3(0, 20, 0), v3(0, -200, 0), { ageS: bomb.armS! })] }
    expect(step(armedBomb, [a], { structures: [target], dt: 0.1 }).structures['hangar-1']!.hp).toBe(200 - bomb.damage)
  })

  it('takes the nearest contact of terrain, structure, hull and aircraft, not the first kind tested', () => {
    // One 150 m swept segment with every candidate kind on it at a known
    // distance, so the winner is decided by distance and nothing else:
    // structure box from 35 m, hull box from 92.1 m, airplane zone from
    // 118.5 m, and (when raised) terrain at 61 m.
    const a = air('f6f-1', v3(0, 5, -400))
    // Slightly low, because the box tests use the straight chord across the
    // tick while the bomb's real path bows below it.
    const other = air('other', v3(120, 4.2, 0))
    const near = hangar('near', v3(50, 5, 0), 200)
    const ship = maru('maru-1', v3(100, 0, 0))
    const world = { ships: [ship], structures: [near], dt: 0.5 }
    const shot = () => ({ ...armed([a, other], { ships: [ship], structures: [near] }), projectiles: [skip(v3(0, 5, 0), v3(300, 0, 0))] })

    // Structure at 35 m is nearest: the hull and the airplane further along
    // the same segment are untouched, being well outside 30 m of blast.
    const first = step(shot(), [a, other], world)
    expect(first.structures['near']!.hp).toBe(200 - bomb.damage)
    expect(first.ships['maru-1']!.hp).toBe(240)
    expect(first.aircraft['other']!.damage.structure).toBe(1)

    // Take the structure out of the candidate list and the hull is nearest.
    const hull = step(shot(), [a, other], { ...world, structures: [] })
    expect(hull.ships['maru-1']!.hp).toBe(240 - bomb.damage)
    expect(hull.structures['near']!.hp).toBe(200)

    // Take the hull away too and the airplane at 118.5 m is what is left.
    const plane = step(shot(), [a, other], { ...world, ships: [], structures: [] })
    expect(plane.aircraft['other']!.damage.structure).toBeLessThan(1)
    expect(plane.ships['maru-1']!.hp).toBe(240)

    // Raise the terrain into the segment and it wins over the airplane past
    // it -- but not over the structure nearer than it.
    const ground = step(shot(), [a, other], { ...world, structures: [], ships: [], terrain: flat(4.5) })
    expect(ground.aircraft['other']!.damage.structure).toBe(1)
    expect(ground.projectiles).toHaveLength(0)
    const stillNearest = step(shot(), [a, other], { ...world, ships: [], terrain: flat(4.5) })
    expect(stillNearest.structures['near']!.hp).toBe(200 - bomb.damage)
  })

  it('detonates at the sea surface and still hurts a hull 10 m away, two thirds of full', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    // sqrt(91) m along the beam axis, 3 m of box-center height: exactly 10 m,
    // and clear of the 7.9 m half-beam so the bomb misses the box itself.
    const beside = maru('maru-1', v3(Math.sqrt(91), 0, 0))
    const twenty = maru('maru-2', v3(Math.sqrt(391), 0, 0))
    const clear = maru('maru-3', v3(40, 0, 0))
    const ships = [beside, twenty, clear]
    const before = { ...armed([a], { ships }), projectiles: [bombRound(v3(0, 5, 0), v3(0, -100, 0))] }
    const after = step(before, [a], { ships, dt: 0.1 })
    expect(after.projectiles).toHaveLength(0)
    expect(after.ships['maru-1']!.hp).toBeCloseTo(240 - bomb.damage * (2 / 3), 6)
    // Linear, not inverse-square: 20 m of 30 leaves a third.
    expect(after.ships['maru-2']!.hp).toBeCloseTo(240 - bomb.damage * (1 / 3), 6)
    expect(after.ships['maru-3']!.hp).toBe(240)
  })

  it('excludes the direct target from its own blast', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    const struck = hangar('struck', v3(0, 5, 0), 200)
    // 15 m from the detonation point on the struck box's roof.
    const nearby = hangar('nearby', v3(Math.sqrt(200), 5, 0), 200, { x: 4, y: 5, z: 4 })
    const structures = [struck, nearby]
    const before = { ...armed([a], { structures }), projectiles: [bombRound(v3(0, 20, 0), v3(0, -200, 0))] }
    const after = step(before, [a], { structures, dt: 0.1 })
    expect(after.structures['struck']!.hp).toBe(200 - bomb.damage)
    expect(after.structures['nearby']!.hp).toBeCloseTo(200 - bomb.damage * (1 - 15 / bomb.blastRadiusM), 6)
  })

  it('puts blast on an aircraft into structure HP and no subsystem', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    // 10 m from the detonation point on the struck box's roof, and clear of
    // every hit zone so nothing but blast reaches it.
    const bystander = air('other', v3(0, 5, Math.sqrt(75)))
    const struck = hangar('struck', v3(0, 5, 0), 400)
    const before = { ...armed([a, bystander], { structures: [struck] }), projectiles: [bombRound(v3(0, 20, 0), v3(0, -200, 0))] }
    const after = step(before, [a, bystander], { structures: [struck], dt: 0.1 })
    const d = after.aircraft['other']!.damage
    // Two thirds of 120 damage over 120 structure HP.
    expect(d.structure).toBeCloseTo(1 - bomb.damage * (2 / 3) / spec.combat!.structureHp, 6)
    expect([d.engine, d.roll, d.pitch, d.yaw, d.fuel, d.leftGuns, d.rightGuns]).toEqual([1, 1, 1, 1, 1, 1, 1])
  })
})

describe('structures', () => {
  it('destroys once, at a stable tick, with a stable attacker, and keeps blocking as rubble', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    const target = hangar('hangar-1', v3(0, 5, 0))
    const structures = [target]
    const bombIn = (c: CombatState, tick: number): CombatState => step(
      { ...c, projectiles: [bombRound(v3(0, 20, 0), v3(0, -200, 0))] }, [a], { structures, tick, dt: 0.1 },
    )
    let c = bombIn(armed([a], { structures }), 11)
    expect(c.structures['hangar-1']).toEqual({ hp: 0, destroyedTick: 11, attacker: 'f6f-1' })
    expect(c.aircraft['f6f-1']!.structuresDestroyed).toBe(1)

    c = bombIn(c, 12)
    expect(c.structures['hangar-1']).toEqual({ hp: 0, destroyedTick: 11, attacker: 'f6f-1' })
    expect(c.aircraft['f6f-1']!.structuresDestroyed).toBe(1)
    // Rubble still stops what is shot at it.
    expect(c.projectiles).toHaveLength(0)
  })

  it('reduces hp by roundDamage per round, so thirty strafing rounds raze a hangar', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    const target = hangar('hangar-1', v3(0, 5, 0))
    const structures = [target]
    const round: Projectile = { owner: 'f6f-1', id: 1, position: v3(0, 20, 0), previous: v3(0, 20, 0), velocity: v3(0, -880, 0), lifeS: 3, tracer: false, kind: 'round', ageS: 0 }
    let c = armed([a], { structures })
    for (let tick = 1; tick <= 29; tick++) c = step({ ...c, projectiles: [{ ...round, id: tick }] }, [a], { structures, tick, dt: 0.1 })
    expect(c.structures['hangar-1']!.hp).toBeCloseTo(120 - 29 * spec.combat!.roundDamage, 9)
    expect(c.structures['hangar-1']!.destroyedTick).toBeNull()
    c = step({ ...c, projectiles: [{ ...round, id: 30 }] }, [a], { structures, tick: 30, dt: 0.1 })
    expect(c.structures['hangar-1']!.destroyedTick).toBe(30)
  })

  it('counts only enemy structures toward RAZED, destroying both all the same', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    const mine = hangar('tacloban-hangar-1', v3(0, 5, 0))
    const theirs = hangar('dulag-hangar-1', v3(500, 5, 0))
    const structures = [mine, theirs]
    const enemy = new Set(['dulag-hangar-1'])
    const bombAt = (c: CombatState, x: number, tick: number): CombatState => step(
      { ...c, projectiles: [bombRound(v3(x, 20, 0), v3(0, -200, 0))] }, [a], { structures, tick, dt: 0.1, enemy },
    )
    let c = bombAt(armed([a], { structures }), 0, 1)
    expect(c.structures['tacloban-hangar-1']!.destroyedTick).toBe(1)
    expect(c.aircraft['f6f-1']!.structuresDestroyed).toBe(0)
    c = bombAt(c, 500, 2)
    expect(c.structures['dulag-hangar-1']!.destroyedTick).toBe(2)
    expect(c.aircraft['f6f-1']!.structuresDestroyed).toBe(1)
  })

  it('reduces, floors and freezes a structure through its own reducer', () => {
    const healthy = healthyStructureDamage(120)
    const hurt = damageStructure(healthy, 40, 5, 'f6f-1')
    expect(hurt).toEqual({ hp: 80, destroyedTick: null, attacker: null })
    const dead = damageStructure(hurt, 200, 9, 'f6f-1')
    expect(dead).toEqual({ hp: 0, destroyedTick: 9, attacker: 'f6f-1' })
    expect(damageStructure(dead, 50, 10, 'other')).toBe(dead)
  })
})

describe('ships', () => {
  it('burns harder below half hull, and freezes hp at the killing blow', () => {
    const healthy = healthyShipDamage(240)
    expect(damageShip(healthy, 240, 80, 3, 'f6f-1')).toEqual({ hp: 160, fire: 0, destroyedTick: null, attacker: null, sinkingFraction: 0 })
    const burning = damageShip(healthy, 240, 180, 3, 'f6f-1')
    expect(burning.hp).toBe(60)
    expect(burning.fire).toBeCloseTo(0.5, 12)
    const dead = damageShip(burning, 240, 60, 4, 'f6f-1')
    expect(dead).toEqual({ hp: 0, fire: 1, destroyedTick: 4, attacker: 'f6f-1', sinkingFraction: 0 })
    expect(damageShip(dead, 240, 500, 5, 'other')).toBe(dead)
  })

  it('sinks over ninety seconds, credits the attacker once at the bottom, and then takes nothing', () => {
    const a = air('f6f-1', v3(0, 1000, 0))
    const ship = maru('maru-1', v3(0, 0, 0))
    const ships = [ship]
    const two = { ...armed([a], { ships }), projectiles: [bombRound(v3(0, 20, 0), v3(0, -200, 0)), bombRound(v3(0, 20, 0), v3(0, -200, 0), { id: 2 })] }
    let c = step(two, [a], { ships, tick: 5, dt: 0.1 })
    expect(c.ships['maru-1']!.hp).toBe(0)
    expect(c.ships['maru-1']!.destroyedTick).toBe(5)
    expect(c.ships['maru-1']!.attacker).toBe('f6f-1')
    expect(c.ships['maru-1']!.sinkingFraction).toBeCloseTo(0.1 / SINK_SECONDS, 12)
    expect(c.aircraft['f6f-1']!.shipsSunk).toBe(0)

    // One second short of the bottom it is still sinking and still uncounted.
    for (let tick = 6; tick <= 93; tick++) c = step(c, [a], { ships, tick, dt: 1 })
    expect(c.ships['maru-1']!.sinkingFraction).toBeLessThan(1)
    expect(c.aircraft['f6f-1']!.shipsSunk).toBe(0)
    // A sinking hull still stops a round.
    const sinking = step({ ...c, projectiles: [bombRound(v3(0, 20, 0), v3(0, -200, 0), { id: 9 })] }, [a], { ships, tick: 94, dt: 0.1 })
    expect(sinking.projectiles).toHaveLength(0)
    expect(sinking.ships['maru-1']!.hp).toBe(0)

    for (let tick = 94; tick <= 100; tick++) c = step(c, [a], { ships, tick, dt: 1 })
    expect(c.ships['maru-1']!.sinkingFraction).toBe(1)
    expect(c.aircraft['f6f-1']!.shipsSunk).toBe(1)
    // Sunk: counted once, and now transparent to what is fired at it.
    for (let tick = 101; tick <= 110; tick++) c = step(c, [a], { ships, tick, dt: 1 })
    expect(c.aircraft['f6f-1']!.shipsSunk).toBe(1)
    const through = step({ ...c, projectiles: [bombRound(v3(0, 20, 0), v3(0, -100, 0), { id: 11 })] }, [a], { ships, tick: 111, dt: 0.05 })
    expect(through.projectiles).toHaveLength(1)
    expect(through.ships['maru-1']!.hp).toBe(0)
  })
})

describe('determinism', () => {
  const soak = (state: CombatState, ticks: number): CombatState => {
    let c = state
    for (let tick = 1; tick <= ticks; tick++) {
      // A cheap deterministic control pattern: neither PRNG-fed nor periodic
      // with the release cadence.
      const controls: Controls = {
        ...idle,
        ...(tick % 7 === 0 ? { dropBomb: true } : {}),
        ...(tick % 5 === 0 ? { fireRockets: true } : {}),
        fire: tick % 3 === 0,
      }
      const a = air('f6f-1', v3(0, 400, 0), v3(140, 0, 0), controls)
      const other = air('other', v3(600, 400, 0))
      c = stepCombat(c, [a, other], [maru('maru-1', v3(900, 0, 0))], [hangar('hangar-1', v3(1200, 5, 0))], flat(0), null, [], tick, DT, null)
    }
    return c
  }
  const start = (): CombatState => armed(
    [air('f6f-1', v3(0, 400, 0), v3(140, 0, 0)), air('other', v3(600, 400, 0))],
    { ships: [maru('maru-1', v3(900, 0, 0))], structures: [hangar('hangar-1', v3(1200, 5, 0))] },
  )

  it('runs a soak of releases identically twice', () => {
    expect(soak(start(), 240)).toEqual(soak(start(), 240))
    expect(soak(start(), 240).aircraft['f6f-1']!.stores).toEqual(emptyStores)
  })

  it('continues a saved clone identically through a release, a detonation and a sinking', () => {
    const halfway = soak(start(), 40)
    expect(soak(structuredClone(halfway), 200)).toEqual(soak(halfway, 200))

    const a = air('f6f-1', v3(0, 1000, 0))
    const ships = [maru('maru-1', v3(0, 0, 0))]
    const hit = step(
      { ...armed([a], { ships }), projectiles: [bombRound(v3(0, 20, 0), v3(0, -200, 0)), bombRound(v3(0, 20, 0), v3(0, -200, 0), { id: 2 })] },
      [a], { ships, tick: 1, dt: 0.1 },
    )
    const sink = (c: CombatState): CombatState => {
      let out = c
      for (let tick = 2; tick <= 120; tick++) out = step(out, [a], { ships, tick, dt: 1 })
      return out
    }
    expect(sink(structuredClone(hit))).toEqual(sink(hit))
    expect(sink(hit).aircraft['f6f-1']!.shipsSunk).toBe(1)
  })
})
