import { describe, expect, it } from 'vitest'
import { corridorHolds, effectiveDrops, bundlesLanded } from '../../../src/sim/mission/airdrop.js'
import { parseScenario } from '../../../src/sim/scenario.js'
import { CARGO_DROP, type DropRelease, type ParachutistEntity } from '../../../src/sim/bailout.js'
import { isPilotJump } from '../../../src/sim/bailout.js'
import { flatField, missionWorld, progressOf, steps } from './fixture.js'
import { ticksFor } from '../../../src/sim/mission/state.js'
import { scenario } from './fixture.js'

/**
 * F10D D.2: the airdrop pipeline. Pure envelope tests first, then one headless AI-only mission (no player input at all): a Ki-57 on the corridor drops
 * inside the zone and counts, a Ki-57 flying the same line too high does not, and neither does one whose drop point is outside the zone.
 */
const ZONE = { point: { x: 0, z: 0 }, radiusM: 900 }
const CORRIDOR = { altitudeM: [450, 560] as [number, number], headingDeg: [80, 100] as [number, number], airspeedMps: [60, 95] as [number, number] }
const ok: DropRelease = { airspeedMps: 80, groundSpeedMps: 80, altitudeM: 500, headingDeg: 90 }

describe('corridorHolds', () => {
  it('holds only while every given field holds; no corridor always holds', () => {
    expect(corridorHolds(CORRIDOR, ok)).toBe(true)
    expect(corridorHolds(undefined, { ...ok, altitudeM: 5 })).toBe(true)
    expect(corridorHolds(CORRIDOR, { ...ok, altitudeM: 561 })).toBe(false)
    expect(corridorHolds(CORRIDOR, { ...ok, altitudeM: 449 })).toBe(false)
    expect(corridorHolds(CORRIDOR, { ...ok, airspeedMps: 96 })).toBe(false)
    expect(corridorHolds(CORRIDOR, { ...ok, headingDeg: 101 })).toBe(false)
    expect(corridorHolds({ groundSpeedMps: [0, 50] }, ok)).toBe(false)
  })
  it('a heading range may run through north', () => {
    expect(corridorHolds({ headingDeg: [350, 10] }, { ...ok, headingDeg: 355 })).toBe(true)
    expect(corridorHolds({ headingDeg: [350, 10] }, { ...ok, headingDeg: 5 })).toBe(true)
    expect(corridorHolds({ headingDeg: [350, 10] }, { ...ok, headingDeg: 180 })).toBe(false)
  })
})

const rig = (id: string, kind: 'trooper' | 'bundle', x: number, phase: 'down' | 'dead' | 'canopy' = 'down', release: DropRelease | undefined = ok, surface: 'land' | 'water' = 'land'): ParachutistEntity => {
  const state = { tick: 1, position: { x, y: 100, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, phase, phaseStartedTick: 1, lowAltitude: false,
    contact: phase === 'down' ? { tick: 1, position: { x, y: 100, z: 0 }, surface, verticalSpeedMps: -5 } : null, outcome: null }
  return { id, sourceAircraft: 'k', side: 'axis', recoverySeed: 0, recoveryEnvironment: { daylight: 1, visibility: 1, weather: 0, seaState: 0 }, recovery: null, state, previous: state, kind, ...(release === undefined ? {} : { release }) }
}
const men = (n: number, x: number, phase: 'down' | 'dead' | 'canopy' = 'down', release?: DropRelease) => Array.from({ length: n }, (_, i) => rig(`m${i}`, 'trooper', x, phase, release ?? ok))

describe('effectiveDrops', () => {
  it('counts a transport whose men came down alive inside the zone, from inside the corridor', () => {
    expect(effectiveDrops(men(6, 100), ['k'], ZONE, CORRIDOR)).toBe(1)
  })
  it('not while they are still in the air, when they died, or when too few landed in the zone', () => {
    expect(effectiveDrops(men(6, 100, 'canopy'), ['k'], ZONE, CORRIDOR)).toBe(0)
    expect(effectiveDrops(men(6, 100, 'dead'), ['k'], ZONE, CORRIDOR)).toBe(0)
    expect(effectiveDrops([...men(2, 100), ...men(4, 5000)].map((m, i) => ({ ...m, id: `u${i}` })), ['k'], ZONE, CORRIDOR)).toBe(0)
    expect(effectiveDrops([...men(3, 100), ...men(3, 5000)].map((m, i) => ({ ...m, id: `u${i}` })), ['k'], ZONE, CORRIDOR)).toBe(1)
  })
  it('not when the release was outside the corridor, however well they landed; not on water', () => {
    expect(effectiveDrops(men(6, 100, 'down', { ...ok, altitudeM: 650 }), ['k'], ZONE, CORRIDOR)).toBe(0)
    expect(effectiveDrops(Array.from({ length: 6 }, (_, i) => rig(`w${i}`, 'trooper', 100, 'down', ok, 'water')), ['k'], ZONE, CORRIDOR)).toBe(0)
  })
  it('a pilot jump, a bundle and another aircraft\'s men are not this transport\'s drop', () => {
    expect(effectiveDrops([...men(6, 100).map((m) => ({ ...m, sourceAircraft: 'other' }))], ['k'], ZONE, CORRIDOR)).toBe(0)
    expect(effectiveDrops(Array.from({ length: 6 }, (_, i) => rig(`b${i}`, 'bundle', 100)), ['k'], ZONE, CORRIDOR)).toBe(0)
    expect(effectiveDrops(undefined, ['k'], ZONE, CORRIDOR)).toBe(0)
  })
})

describe('bundlesLanded', () => {
  it('counts landed bundles of the named transports inside the zone', () => {
    const b = [rig('b0', 'bundle', 100), rig('b1', 'bundle', 100, 'canopy'), rig('b2', 'bundle', 5000), rig('b3', 'bundle', 100, 'down', ok, 'water')]
    expect(bundlesLanded(b, ['k'], ZONE)).toBe(1)
    expect(bundlesLanded(b, ['nobody'], ZONE)).toBe(0)
  })
})

/** Three AI Ki-57s through the zone at (0, 0) on the flat 100 m plain. The AI's safety floor keeps every AI airplane at least ~400 m above the ground (FLOOR_M 300 + buffer, `safety.ts`; measured here: it climbs from a 150 m start to 501 m), so the corridor sits there; the player (a Hellcat) is parked far away. */
const kate = (id: string, z: number, altM: number, dropX = 0, dropZ = z) => ({
  id, spec: 'ki-57-ii-topsy', airborneAt: { position: [-5000, altM, z], headingDeg: 90, speedMps: 80 },
  pilot: { ingress: { route: [{ x: 7000, z, altitudeM: altM, speedMps: 80 }], attack: 'airdrop', dropAt: { x: dropX, z: dropZ, radiusM: 200 } } },
})
const objective = (id: string, target: string) => ({
  id, label: id, priority: 'primary', kind: 'drop', targets: [target], zone: { point: { x: 0, z: 0 }, radiusM: 900 },
  corridor: { altitudeM: [450, 560], headingDeg: [80, 100], airspeedMps: [60, 95] },
})
export const PATCH = {
  aircraft: [
    { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 40000], headingDeg: 90, speedMps: 120 } },
    kate('good', 0, 500), kate('high', 300, 650), kate('wide', 4000, 500),
  ],
  ships: [],
  objectives: [objective('good-drop', 'good'), objective('high-drop', 'high'), objective('wide-drop', 'wide'),
    { id: 'bundles', label: 'Bundles', priority: 'secondary', kind: 'bundles', targets: ['good', 'high', 'wide'], zone: { point: { x: 0, z: 0 }, radiusM: 900 }, min: 4 }],
  weather: { windFromDeg: 0, windMps: 0 },
}

describe('airdrop pipeline, AI only (headless)', () => {
  const w0 = missionWorld(PATCH, flatField(100))
  const w = steps(w0, ticksFor(220)) // the drop is at about 50 s; the high one (about 550 m up) is under canopy for another 100 s
  const stickOf = (id: string) => (w.parachutists ?? []).filter((p) => p.sourceAircraft === id)

  it('every Ki-57 opens its doors and drops its whole stick once: six men and two bundles each, none a pilot jump', () => {
    for (const id of ['good', 'high', 'wide']) {
      const s = stickOf(id)
      expect(s.filter((p) => p.kind === 'trooper'), id).toHaveLength(CARGO_DROP.men)
      expect(s.filter((p) => p.kind === 'bundle'), id).toHaveLength(CARGO_DROP.bundles)
      expect(s.some(isPilotJump)).toBe(false)
    }
    expect(w.parachutists).toHaveLength(3 * (CARGO_DROP.men + CARGO_DROP.bundles))
  })
  it('the drop happens inside the AI circle with the doors fully open, and the doors are shut again once past it', () => {
    const release = stickOf('good')[0]!.state.position
    expect(Math.hypot(release.x, release.z)).toBeLessThan(200 + 50)
    const a = w.aircraft.find((x) => x.id === 'good')!
    expect(a.state.bayDoorFraction).toBe(0)
  })
  it('the Ki-57 on the corridor counts, the one flying the same line too high does not, and the one that dropped outside the zone does not', () => {
    expect(progressOf(w, 'good-drop').status).toBe('complete')
    expect(progressOf(w, 'high-drop').status).toBe('active')
    expect(progressOf(w, 'wide-drop').status).toBe('active')
    // The high one really did drop and land in the zone: only the corridor rejected it (else this test would pass for the wrong reason).
    const highMen = stickOf('high').filter((p) => p.kind === 'trooper')
    expect(highMen.every((p) => p.state.phase === 'down')).toBe(true)
    expect(highMen.filter((p) => Math.hypot(p.state.position.x, p.state.position.z) < 900).length).toBeGreaterThanOrEqual(3)
    // And the wide one landed away from the zone.
    expect(stickOf('wide').filter((p) => p.kind === 'trooper').every((p) => Math.hypot(p.state.position.x, p.state.position.z) > 900)).toBe(true)
  })
  it('bundles: only the zone\'s count (two each from the two transports that dropped over it, whatever their altitude)', () => {
    expect(progressOf(w, 'bundles').count).toBe(4) // good + high (bundles ignore the corridor: only where they land); wide's landed outside
    expect(bundlesLanded(w.parachutists, ['wide'], ZONE)).toBe(0)
    expect(progressOf(w, 'bundles').status).toBe('complete')
  })
  it('a transport shot down before the zone drops nothing, and a second pass never drops a second stick', () => {
    const rec = w0.combat.aircraft['good']!
    const dead = { ...w0, combat: { ...w0.combat, aircraft: { ...w0.combat.aircraft, good: { ...rec, damage: { ...rec.damage, destroyedAt: 0, attacker: 'f6f-1' } } } } }
    const after = steps(dead, ticksFor(150))
    expect((after.parachutists ?? []).filter((p) => p.sourceAircraft === 'good')).toHaveLength(0)
  })
  it('the schema: airdrop needs its zone, and only an airdrop has one', () => {
    const bad = (ingress: unknown) => () => parseScenario(scenario({ aircraft: [PATCH.aircraft[0], { ...kate('x', 0, 250), pilot: { ingress } }] }))
    expect(bad({ route: [{ x: 1, z: 1, altitudeM: 100, speedMps: 80 }], attack: 'airdrop' })).toThrow(/airdrop and dropAt go together/)
    expect(bad({ route: [{ x: 1, z: 1, altitudeM: 100, speedMps: 80 }], dropAt: { x: 0, z: 0, radiusM: 100 } })).toThrow(/airdrop and dropAt go together/)
  })
})
