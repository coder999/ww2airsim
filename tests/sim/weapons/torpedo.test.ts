// Track D step 2 (D1 plan): the torpedo store. Every torpedo type any spec in content carries is
// enrolled here, so a new torpedo plane is covered without a new test. A drop inside the envelope
// runs; outside it breaks up; an armed run hits a ship and damages it; inside the arming run it is a
// dud; past its range it sinks.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { createCombat, stepCombat, type CombatShip, type CombatState, type Projectile } from '../../../src/sim/weapons/combat.js'
import { storesFromLoadout } from '../../../src/sim/weapons/stores.js'
import type { AircraftSpec, StoreType } from '../../../src/sim/flight/schema.js'

const ids = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
const carriers = new Map<string, AircraftSpec>()
for (const id of ids) {
  const spec = loadAircraftSpec(id)
  for (const [storeId, t] of Object.entries(spec.stores?.types ?? {})) if (t.kind === 'torpedo' && !carriers.has(storeId)) carriers.set(storeId, spec)
}
const ENROLLED = ['mk13', 'type91']

it('enrolls every torpedo store in content', () => {
  expect(ids.length).toBeGreaterThan(10)
  expect([...carriers.keys()].sort()).toEqual(ENROLLED)
})

const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, dropBomb: true }

/** The carrier releasing over open sea (no terrain field, so the sea plane is everywhere), doors
 *  open, at `speed` along +x and `height` above the sea. Steps until the torpedo is in the water or
 *  gone, and returns the combat state then. */
function drop(spec: AircraftSpec, speed: number, height: number): { combat: CombatState; ticks: number } {
  const state = createState({ position: v3(0, height, 0), velocity: v3(speed, 0, 0), bayDoorFraction: 1 })
  const a = { id: 'p', spec, state, previous: state, controls, impact: null }
  let combat = createCombat([a], { p: storesFromLoadout(spec, 'bombs') })
  combat = stepCombat(combat, [a], [], [], null, null, [], 1, DT)
  const idle = { ...a, controls: { ...controls, dropBomb: false } }
  let ticks = 1
  while (combat.projectiles.some((p) => p.kind === 'torpedo' && p.runM === undefined) && ticks < 60 * 60) {
    combat = stepCombat(combat, [idle], [], [], null, null, [], ++ticks, DT)
  }
  return { combat, ticks }
}

// Heading 0 lays the hull along z, so a run along +x meets it broadside.
const ship = (x: number): CombatShip => ({
  id: 'target', spec: { lengthM: 200, beamM: 25, deckHeightM: 10, hullHp: 1000, role: 'battleship' },
  state: { position: v3(x, 0, 0), headingRad: 0 }, previous: { position: v3(x, 0, 0), headingRad: 0 },
})

/** A torpedo already running east at its depth from `at`, `runM` into its run. */
const runner = (t: StoreType, at: Vec3, runM: number): Projectile => ({
  id: 1, owner: 'p', position: v3(at.x, -t.runDepthM!, at.z), previous: v3(at.x, -t.runDepthM!, at.z),
  velocity: v3(t.runSpeedMps!, 0, 0), lifeS: (t.runRangeM! - runM) / t.runSpeedMps!, tracer: false, kind: 'torpedo', ageS: 5, runM,
})

/** Steps a lone runner against `ships` until it is gone. */
function run(spec: AircraftSpec, p: Projectile, ships: readonly CombatShip[]): CombatState {
  const state = createState({ position: v3(0, 500, 0) })
  const a = { id: 'p', spec, state, previous: state, controls: { ...controls, dropBomb: false }, impact: null }
  let combat: CombatState = { ...createCombat([a], {}, ships.map((s) => ({ id: s.id, hullHp: s.spec.hullHp }))), projectiles: [p] }
  for (let tick = 1; combat.projectiles.length > 0 && tick < 60 * 600; tick++) combat = stepCombat(combat, [a], ships, [], null, null, [], tick, DT)
  return combat
}

describe.each(ENROLLED.filter((s) => carriers.has(s)))('%s', (storeId) => {
  const spec = carriers.get(storeId)!
  const t = spec.stores!.types[storeId]!

  it('dropped inside its envelope, it enters the water and runs at its depth and speed', () => {
    const { combat } = drop(spec, 0.8 * t.maxDropSpeedMps!, 0.5 * t.maxDropHeightM!)
    const p = combat.projectiles.find((q) => q.kind === 'torpedo')
    expect(p, 'a running torpedo').toBeDefined()
    expect(p!.runM).toBeDefined()
    expect(p!.position.y).toBeCloseTo(-t.runDepthM!, 6)
    expect(Math.hypot(p!.velocity.x, p!.velocity.z)).toBeCloseTo(t.runSpeedMps!, 6)
    expect(p!.velocity.y).toBe(0)
    expect(combat.impacts.map((i) => i.outcome)).toEqual(['entered'])
    expect(combat.aircraft.p!.torpedoesBrokeUp).toBe(0)
  })

  it.each([['too fast', 1.1, 0.5], ['too high', 0.8, 1.2]] as const)('dropped %s, it breaks up on the water', (_why, speedK, heightK) => {
    const { combat } = drop(spec, speedK * t.maxDropSpeedMps!, heightK * t.maxDropHeightM!)
    expect(combat.projectiles.filter((q) => q.kind === 'torpedo')).toHaveLength(0)
    expect(combat.impacts.map((i) => [i.cause, i.outcome, i.surface])).toEqual([['torpedo', 'broke-up', 'water']])
    expect(combat.aircraft.p!.torpedoesBrokeUp).toBe(1)
  })

  it('an armed run that meets a hull does its damage to it', () => {
    const at = v3(0, 0, 0)
    const combat = run(spec, runner(t, at, t.armRunM! + 1), [ship(150)])
    expect(combat.ships.target!.hp).toBeLessThanOrEqual(1000 - t.damage)
    expect(combat.impacts.filter((i) => i.outcome === 'detonated').map((i) => i.surface)).toEqual(['ship'])
  })

  it('a hit inside its arming run is a dud', () => {
    const combat = run(spec, runner(t, v3(0, 0, 0), 0), [ship(Math.min(100, t.armRunM! / 2))])
    expect(combat.ships.target!.hp).toBe(1000)
    expect(combat.impacts).toHaveLength(0)
  })

  it('past its range it sinks, harmlessly', () => {
    const combat = run(spec, runner(t, v3(0, 0, 0), 0), [ship(t.runRangeM! + 500)])
    expect(combat.ships.target!.hp).toBe(1000)
    expect(combat.impacts.map((i) => [i.outcome, i.surface])).toEqual([['expired', 'water']])
  })
})
