import { describe, expect, it } from 'vitest'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, aircraftById, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { length, sub, ZERO } from '../../../src/sim/math/vec3.js'
import { hasGunSolution } from '../../../src/sim/ai/pursuit.js'
import { GREEN_SKILL, noiseSeedFor } from '../../../src/sim/ai/pilot.js'
import { INGRESS_ENGAGE_RANGE_M, ingressAccepts } from '../../../src/sim/ai/ingress.js'
import { spawnHeldGroup } from '../../../src/sim/mission/spawn.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { BASE, REACH_FAR, missionWorld, steps } from '../mission/fixture.js'

/**
 * The ingress pilot (7e spec §4.5): the raider Combat Air Patrol (missions
 * M4) sends at the carrier. Every case runs through production `advance`.
 */
const ROUTE = [
  { x: 0, z: -15000, altitudeM: 3800, speedMps: 130 },
  { x: -12000, z: -24000, altitudeM: 3000, speedMps: 140 },
  { x: -12000, z: -40000, altitudeM: 3500, speedMps: 120 },
]
const PLAYER_FAR = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } }
const RAIDER = { id: 'raid-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 0, speedMps: 130 }, pilot: { skill: 'green', ingress: { route: ROUTE, destination: { ship: 'cv-1' } } } }
const CARRIER = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[-8000, -48000], [-8000, -60000]], speedMps: 10 }
const raw = (aircraft: unknown[]) => ({ id: 'ingress-test', player: 'f6f-1', airfields: ['tacloban'], aircraft, ships: [CARRIER], weather: { windFromDeg: 0, windMps: 0 } })
const build = (aircraft: unknown[]) => worldFromScenario(bundleForScenario(parseScenario(raw(aircraft))), null)
const raider = (w: World<undefined>) => aircraftById(w, 'raid-1')!
const speedOf = (w: World<undefined>) => length(raider(w).state.velocity)

describe('the ingress pilot flies its route (7e spec §4.5)', () => {
  it('reaches each waypoint in order, ends each leg within 100 m and 10 m/s, and orbits the moving carrier', () => {
    let w = build([PLAYER_FAR, RAIDER])
    expect(raider(w).pilot!.decision.mode).toBe('ingress')
    const legEnds: { leg: number; altErr: number; speedErr: number }[] = []
    const bearings: number[] = []
    let orbitDistances: number[] = []
    for (let i = 0; i < 620 * 60; i++) {
      const before = raider(w).pilot!.decision.legIndex
      w = advance(w, DT).world
      const d = raider(w).pilot!.decision
      expect(d.mode).toBe('ingress')
      if (d.legIndex !== before && before < ROUTE.length) {
        legEnds.push({ leg: before, altErr: Math.abs(raider(w).state.position.y - ROUTE[before]!.altitudeM), speedErr: Math.abs(speedOf(w) - ROUTE[before]!.speedMps) })
      }
      if (i >= 560 * 60) {
        const cv = w.ships[0]!.state.position
        const p = raider(w).state.position
        orbitDistances = [...orbitDistances, Math.hypot(p.x - cv.x, p.z - cv.z)]
        bearings.push(Math.atan2(p.z - cv.z, p.x - cv.x))
      }
    }
    expect(legEnds.map((l) => l.leg)).toEqual([0, 1, 2])
    for (const l of legEnds) {
      expect(l.altErr, `leg ${l.leg} altitude`).toBeLessThan(100)
      expect(l.speedErr, `leg ${l.leg} speed`).toBeLessThan(10)
    }
    expect(raider(w).pilot!.decision.legIndex).toBe(ROUTE.length + 1)
    expect(Math.min(...orbitDistances)).toBeGreaterThan(500)
    expect(Math.max(...orbitDistances)).toBeLessThan(3000)
    // The bearing from the carrier sweeps more than half a turn in 60 s.
    let swept = 0
    for (let i = 1; i < bearings.length; i++) swept += Math.abs(Math.atan2(Math.sin(bearings[i]! - bearings[i - 1]!), Math.cos(bearings[i]! - bearings[i - 1]!)))
    expect(swept).toBeGreaterThan(Math.PI)
    // It never attacks the ship, and it held its orbit height.
    expect(w.combat.aircraft['raid-1']!.shots).toBe(0)
    expect(Math.abs(raider(w).state.position.y - ROUTE[2]!.altitudeM)).toBeLessThan(100)
  })

  it('a structuredClone taken mid-route flies on identically', () => {
    const mid = steps(build([PLAYER_FAR, RAIDER]), 90 * 60)
    expect(steps(structuredClone(mid), 600)).toEqual(steps(mid, 600))
  })
})

describe('the ingress pilot fights only what attacks it (7e spec §4.5)', () => {
  const INTERCEPTOR = { id: 'int-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [300, 3000, -9000], headingDeg: 180, speedMps: 130 }, pilot: { target: 'raid-1', skill: 'veteran' } }

  it('switches to engage within one reactionS of an interceptor coming in, and resumes at the same legIndex when it is gone', () => {
    let w = build([PLAYER_FAR, RAIDER, INTERCEPTOR])
    let threatAt: number | null = null
    let engagedAt: number | null = null
    let legAtEngage = -1
    for (let i = 0; i < 60 * 60 && engagedAt === null; i++) {
      const r = raider(w)
      const it_ = aircraftById(w, 'int-1')!
      if (threatAt === null && (length(sub(it_.state.position, r.state.position)) <= INGRESS_ENGAGE_RANGE_M || hasGunSolution(it_, r))) threatAt = w.tick
      w = advance(w, DT).world
      if (raider(w).pilot!.decision.mode === 'engage') { engagedAt = w.tick; legAtEngage = raider(w).pilot!.decision.legIndex }
    }
    expect(threatAt).not.toBeNull()
    expect(engagedAt).not.toBeNull()
    expect(raider(w).pilot!.decision.targetId).toBe('int-1')
    expect((engagedAt! - threatAt!) * DT).toBeLessThanOrEqual(GREEN_SKILL.reactionS + DT)
    w = steps(w, 5 * 60)
    // The interceptor is destroyed: the raider resumes its route at once.
    w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, 'int-1': { ...w.combat.aircraft['int-1']!, damage: { ...w.combat.aircraft['int-1']!.damage, destroyedAt: w.tick } } } } }
    if (raider(w).impact === null && w.combat.aircraft['raid-1']!.damage.destroyedAt === null) {
      w = advance(w, DT).world
      expect(raider(w).pilot!.decision.mode).toBe('ingress')
      expect(raider(w).pilot!.decision.targetId).toBeNull()
      expect(raider(w).pilot!.decision.legIndex).toBe(legAtEngage)
    } else {
      throw new Error('the raider was shot down before the interceptor could be removed; move the geometry')
    }
  })

  it('a hostile 6 km off the route never pulls it off', () => {
    const parallel = { id: 'par-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [6000, 3000, 0], headingDeg: 0, speedMps: 130 } }
    let w = build([PLAYER_FAR, RAIDER, parallel])
    let minRange = Infinity
    for (let i = 0; i < 100 * 60; i++) {
      w = advance(w, DT).world
      minRange = Math.min(minRange, length(sub(aircraftById(w, 'par-1')!.state.position, raider(w).state.position)))
      expect(raider(w).pilot!.decision.mode).toBe('ingress')
    }
    expect(minRange).toBeGreaterThan(INGRESS_ENGAGE_RANGE_M)
    expect(minRange).toBeLessThan(8000)
    expect(raider(w).pilot!.decision.legIndex).toBeGreaterThanOrEqual(0)
  })
})

describe('spawning at tick > 0 (7e spec §4.5 items 1-3)', () => {
  const CHOOSER = { id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [9000, 3000, 3000], headingDeg: 270, speedMps: 130 }, pilot: { skill: 'veteran' } }
  const RAIDER_A = { id: 'raid-3', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 }, pilot: { ingress: { route: [{ x: -10000, z: -16479, altitudeM: 3000, speedMps: 130 }], destination: { ship: 'cv-1' } } } }
  const RAIDER_B = { ...RAIDER_A, id: 'raid-4' }
  const HELD = {
    objectives: [REACH_FAR],
    triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
    heldGroups: [{ id: 'wave-1', aircraft: [CHOOSER, RAIDER_A, RAIDER_B] }],
  }

  it('a pilot spawned at tick 3,000 rescores on its first tick and flies a real snapshot, never ZERO', () => {
    const at3000 = spawnHeldGroup(steps(missionWorld(HELD), 3000), 'wave-1')
    expect(at3000.tick).toBe(3000)
    const player = aircraftById(at3000, 'f6f-1')!
    expect(length(sub(player.state.position, aircraftById(at3000, 'raid-2')!.state.position))).toBeLessThan(8000)
    const w = advance(at3000, DT).world
    const d = aircraftById(w, 'raid-2')!.pilot!.decision
    expect(d.targetId).toBe('f6f-1')
    expect(d.observedTargetPosition).toEqual(player.state.position)
    expect(d.observedTargetPosition).not.toEqual(ZERO)
    expect(d.nextRescoreS).toBeCloseTo(3001 * DT + 0.3, 9)
    // The raider rescored too (nothing in range), flies its route, and is finite.
    const r = aircraftById(w, 'raid-3')!
    expect(r.pilot!.decision.mode).toBe('ingress')
    expect(r.pilot!.decision.nextRescoreS).toBeGreaterThan(3001 * DT)
    for (const k of ['roll', 'pitch', 'yaw', 'throttle'] as const) expect(Number.isFinite(r.controls[k])).toBe(true)
  })

  it('two raiders spawned on the same tick, in the same place, jitter differently (the id-seeded cursor)', () => {
    const at = spawnHeldGroup(steps(missionWorld(HELD), 3000), 'wave-1')
    const a0 = aircraftById(at, 'raid-3')!
    const b0 = aircraftById(at, 'raid-4')!
    expect(a0.state).toEqual(b0.state)
    expect(a0.pilot!.decision.noiseCursor).toBe(noiseSeedFor('raid-3'))
    expect(b0.pilot!.decision.noiseCursor).toBe(noiseSeedFor('raid-4'))
    const w = advance(at, DT).world
    const a = aircraftById(w, 'raid-3')!.controls
    const b = aircraftById(w, 'raid-4')!.controls
    expect(a.roll).not.toBe(b.roll)
    expect(a.pitch).not.toBe(b.pitch)
    expect(a.yaw).not.toBe(b.yaw)
    expect(a.throttle).toBe(b.throttle)
  })
})

describe('ingress content (7e spec §4.5)', () => {
  const base = (pilot: unknown) => raw([PLAYER_FAR, { ...RAIDER, pilot }])
  it('rejects ingress with a target', () => {
    expect(() => parseScenario(base({ target: 'f6f-1', ingress: { route: ROUTE } }))).toThrow(/ingress excludes target/)
  })
  it('rejects an unknown destination ship or airfield', () => {
    expect(() => parseScenario(base({ ingress: { route: ROUTE, destination: { ship: 'cv-9' } } }))).toThrow(/ingress destination ship "cv-9" is not a starting ship/)
    expect(() => parseScenario(base({ ingress: { route: ROUTE, destination: { airfield: 'dulag' } } }))).toThrow(/ingress destination airfield "dulag" is not one of airfields/)
  })
  it('rejects an empty route and a non-positive leg speed', () => {
    expect(() => parseScenario(base({ ingress: { route: [] } }))).toThrow()
    expect(() => parseScenario(base({ ingress: { route: [{ ...ROUTE[0], speedMps: 0 }] } }))).toThrow()
  })
  it('resolves an airfield destination to its runway center and a ship to a live reference', () => {
    const w = worldFromScenario(bundleForScenario(parseScenario(base({ ingress: { route: ROUTE, destination: { airfield: 'tacloban' } } }))), null)
    const d = raider(w).pilot!.ingress!.destination!
    expect(d.kind).toBe('point')
    const s = build([PLAYER_FAR, RAIDER])
    expect(raider(s).pilot!.ingress!.destination).toEqual({ kind: 'ship', id: 'cv-1' })
  })
  it('the mission fixture still parses with no held-group changes', () => {
    expect(() => missionWorld({})).not.toThrow()
    expect(BASE.aircraft.length).toBe(2)
  })
})

describe('ingressAccepts (7e spec §4.5, unit)', () => {
  const w0 = build([PLAYER_FAR, RAIDER])
  const self = raider(w0)
  const rec = w0.combat.aircraft['raid-1']!
  const contactAt = (id: string, rangeM: number) => ({ ...aircraftById(w0, 'f6f-1')!, id, state: { ...aircraftById(w0, 'f6f-1')!.state, position: { x: self.state.position.x + rangeM, y: self.state.position.y, z: self.state.position.z } } })
  it('engages anything within 3 km, and nothing else unprovoked beyond it', () => {
    const accept = ingressAccepts(self, rec, null, 100)
    expect(accept(contactAt('c', 2999), 2999)).toBe(true)
    expect(accept(contactAt('c', 3100), 3100)).toBe(false)
  })
  it('keeps its current target to 1.5 x the engage range (4.5 km), then lets it go', () => {
    const accept = ingressAccepts(self, rec, 'c', 100)
    expect(accept(contactAt('c', 4400), 4400)).toBe(true)
    expect(accept(contactAt('c', 4600), 4600)).toBe(false)
    expect(accept(contactAt('other', 4400), 4400)).toBe(false)
  })
  it('engages at any range a contact that hit it within the last 10 s', () => {
    const hit = { ...rec, lastHitBy: 'c', lastHit: { tick: 600, position: self.state.position } }
    expect(ingressAccepts(self, hit, null, 600 * DT + 9)(contactAt('c', 5000), 5000)).toBe(true)
    expect(ingressAccepts(self, hit, null, 600 * DT + 11)(contactAt('c', 5000), 5000)).toBe(false)
    expect(ingressAccepts(self, hit, null, 600 * DT + 9)(contactAt('d', 5000), 5000)).toBe(false)
  })
})

describe('the raider resumes when its target leaves (7e spec §4.5 "or leaves")', () => {
  it('lets an interceptor go past 4.5 km and resumes at the same legIndex', () => {
    const INT = { id: 'int-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [300, 3000, -9000], headingDeg: 180, speedMps: 130 }, pilot: { target: 'raid-1', skill: 'veteran' } }
    let w = build([PLAYER_FAR, RAIDER, INT])
    for (let i = 0; i < 60 * 60 && raider(w).pilot!.decision.mode !== 'engage'; i++) w = advance(w, DT).world
    expect(raider(w).pilot!.decision.mode).toBe('engage')
    const leg = raider(w).pilot!.decision.legIndex
    // Teleport the interceptor 6 km away, flying away: it has left.
    const r = raider(w).state.position
    w = { ...w, aircraft: w.aircraft.map((a) => a.id !== 'int-1' ? a : { ...a, state: { ...a.state, position: { x: r.x + 6000, y: r.y, z: r.z } } }) }
    for (let i = 0; i < 2 * 60; i++) w = advance(w, DT).world
    expect(raider(w).pilot!.decision.mode).toBe('ingress')
    expect(raider(w).pilot!.decision.legIndex).toBe(leg)
  })
})
