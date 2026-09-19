import { describe, it, expect } from 'vitest'
import { Quaternion } from 'three'
import { createTracers, MIN_TRACER_LENGTH_M, quatFromXTo, tracerInstances, TRACER_CAPACITY } from '../../src/render/scene/tracers.js'
import { createHitFlashes, flashAppearance, NO_FLASH_MEMORY, nextHitFlashes } from '../../src/render/scene/hitFlash.js'
import { createEngineSmoke, smokeAppearance } from '../../src/render/scene/smoke.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createCombat, type Projectile } from '../../src/sim/weapons/combat.js'
import { createState } from '../../src/sim/flight/state.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const round = (over: Partial<Projectile> = {}): Projectile => ({
  owner: 'p', id: 1, position: v3(100, 500, 0), previous: v3(85, 500.2, 0), velocity: v3(880, -3, 0), lifeS: 2, tracer: true, ...over,
})

describe('tracers read the projectile list (Plan 6)', () => {
  it('draws only tracer rounds, as a streak ending at the round and pointing along its travel', () => {
    const [t, ...rest] = tracerInstances([round(), round({ id: 2, tracer: false })])
    expect(rest).toEqual([])
    expect(t!.lengthM).toBeCloseTo(Math.hypot(15, 0.2), 9)
    // The streak's front is the round's position: midpoint + half length along the direction.
    const dir = qRotate(t!.attitude, v3(1, 0, 0))
    const front = v3(t!.position.x + dir.x * t!.lengthM / 2, t!.position.y + dir.y * t!.lengthM / 2, t!.position.z + dir.z * t!.lengthM / 2)
    expect(front.x).toBeCloseTo(100, 9)
    expect(front.y).toBeCloseTo(500, 9)
    expect(front.z).toBeCloseTo(0, 9)
  })

  it('gives a round born this frame a visible minimum streak along its velocity', () => {
    const [t] = tracerInstances([round({ previous: v3(100, 500, 0), velocity: v3(0, 0, -880) })])
    expect(t!.lengthM).toBe(MIN_TRACER_LENGTH_M)
    const dir = qRotate(t!.attitude, v3(1, 0, 0))
    expect(dir.z).toBeCloseTo(-1, 9)
  })

  it('rotates +X onto any direction, including straight back', () => {
    for (const d of [v3(0, 1, 0), v3(0, 0, 1), v3(-1, 0, 0), v3(0.6, -0.8, 0)]) {
      const r = qRotate(quatFromXTo(d), v3(1, 0, 0))
      expect(r.x).toBeCloseTo(d.x, 9)
      expect(r.y).toBeCloseTo(d.y, 9)
      expect(r.z).toBeCloseTo(d.z, 9)
    }
  })

  it('is bounded by the pool, and the mesh count follows the list frame to frame', () => {
    const many = Array.from({ length: TRACER_CAPACITY + 40 }, (_, i) => round({ id: i }))
    expect(tracerInstances(many)).toHaveLength(TRACER_CAPACITY)
    const tracers = createTracers(8)
    tracers.update(many)
    expect(tracers.object.count).toBe(8)
    expect(tracers.object.visible).toBe(true)
    tracers.update([])
    expect(tracers.object.count).toBe(0)
    expect(tracers.object.visible).toBe(false)
  })
})

describe('hit flashes fire on edges of the combat record (Plan 6)', () => {
  const state = createState({ position: v3(0, 1000, 0) })
  const entity = (id: string) => ({ id, spec: f6f, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, impact: null })
  const world = () => createCombat([entity('p'), entity('t')])

  it('flashes once per recorded hit, not once per frame the record persists', () => {
    const c = world()
    const hitOnce = { ...c, aircraft: { ...c.aircraft, t: { ...c.aircraft.t!, lastHit: { tick: 7, position: v3(1, 2, 3) } } } }
    const a = nextHitFlashes(NO_FLASH_MEMORY, hitOnce, [entity('p'), entity('t')], 7)
    expect(a.events).toEqual([{ id: 't', kind: 'hit', position: v3(1, 2, 3) }])
    const b = nextHitFlashes(a.memory, hitOnce, [entity('p'), entity('t')], 8)
    expect(b.events).toEqual([])
    const again = { ...hitOnce, aircraft: { ...hitOnce.aircraft, t: { ...hitOnce.aircraft.t!, lastHit: { tick: 9, position: v3(4, 5, 6) } } } }
    expect(nextHitFlashes(b.memory, again, [entity('p'), entity('t')], 9).events).toHaveLength(1)
  })

  it('fires a fireball at the airplane once when it is destroyed, and forgets everything on a restart', () => {
    const c = world()
    const dead = { ...c, aircraft: { ...c.aircraft, t: { ...c.aircraft.t!, damage: { ...c.aircraft.t!.damage, structure: 0, destroyedAt: 30, attacker: 'p' } } } }
    const a = nextHitFlashes(NO_FLASH_MEMORY, dead, [entity('p'), entity('t')], 30)
    expect(a.events).toEqual([{ id: 't', kind: 'kill', position: state.position }])
    expect(nextHitFlashes(a.memory, dead, [entity('p'), entity('t')], 31).events).toEqual([])
    // Restart: tick goes backwards, the fresh world has no hits, nothing fires.
    const restarted = nextHitFlashes(a.memory, world(), [entity('p'), entity('t')], 0)
    expect(restarted.events).toEqual([])
    expect(restarted.memory.seenKillTick).toEqual({})
    // ...and the same tick numbers in the new flight fire again.
    expect(nextHitFlashes(restarted.memory, dead, [entity('p'), entity('t')], 30).events).toHaveLength(1)
  })

  it('pools its quads: fires, faces the camera, fades out, and can be hidden', () => {
    const flashes = createHitFlashes(2)
    const facing = new Quaternion(0, 1, 0, 0)
    for (let i = 0; i < 3; i++) flashes.fire({ id: 't', kind: 'hit', position: v3(i, 0, 0) })
    const meshes = flashes.object.children
    expect(meshes.filter((m) => m.visible)).toHaveLength(2)
    flashes.update(0.01, facing)
    expect(meshes[0]!.quaternion.equals(facing)).toBe(true)
    flashes.update(flashAppearance('hit').lifetimeSeconds + 1, facing)
    expect(meshes.filter((m) => m.visible)).toHaveLength(0)
    flashes.fire({ id: 't', kind: 'kill', position: v3(0, 0, 0) })
    flashes.hide()
    expect(meshes.filter((m) => m.visible)).toHaveLength(0)
    expect(flashAppearance('kill').maxRadiusM).toBeGreaterThan(flashAppearance('hit').maxRadiusM)
  })
})

describe('engine smoke reads engine health (Plan 6)', () => {
  it('is invisible on a healthy engine and grows with the damage, capped for a wreck', () => {
    expect(smokeAppearance(1, false).visible).toBe(false)
    const light = smokeAppearance(0.75, false)
    const heavy = smokeAppearance(0.1, false)
    expect(light.visible).toBe(true)
    expect(heavy.opacity).toBeGreaterThan(light.opacity)
    expect(heavy.scale).toBeGreaterThan(light.scale)
    expect(smokeAppearance(1, true)).toEqual(smokeAppearance(0, false))
    expect(smokeAppearance(NaN, false).visible).toBe(false)
  })

  it('shows and hides its puffs from the record', () => {
    const smoke = createEngineSmoke()
    expect(smoke.object.visible).toBe(false)
    smoke.set(0.5, false)
    expect(smoke.object.visible).toBe(true)
    smoke.set(1, false)
    expect(smoke.object.visible).toBe(false)
  })
})
