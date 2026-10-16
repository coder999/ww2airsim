import { describe, expect, it } from 'vitest'
import { isContact, selectTarget, type TargetingView } from '../../../src/sim/ai/targeting.js'
import { threatAstern } from '../../../src/sim/ai/recovery.js'
import { GREEN_SKILL, initialDecision } from '../../../src/sim/ai/pilot.js'
import { advance, createWorldOf, withNightFacts, withPlayerLights, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { perceptionAt, type NightFacts } from '../../../src/sim/lights/perception.js'
import type { LightSpec } from '../../../src/sim/lights/lights.js'
import { sidesOf } from '../../../src/sim/sides.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { worldChecksum } from '../../../src/flightRecorder/checksum.js'
import { level } from './maneuverWorlds.js'

/**
 * F6B Task 5: the AI perceives. Observer 'z' (an enemy Zero; every non-player aircraft is axis) and target
 * 'me' (the player's Hellcat, allied) at deep night. 1 mi = 1,609 m. Lit range is 6,000 m, dark about 830 m
 * (plan 3.5); the tests assert the behavior (seen when lit, not when dark, back when lit by a flare), not those numbers.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const SRC = { source: 'gameplay', sourceNote: 'test' } as const
const navOn = (id: string): LightSpec => ({ id: `nav-${id}`, kind: 'nav', at: { aircraft: id, point: 'all' }, color: 'white', state: 'on', ...SRC }) as LightSpec
const flareAt = (x: number, y: number, z: number): LightSpec =>
  ({ id: 'flare', kind: 'flare', at: { x, z, altitudeM: y }, color: 'warm', state: 'on', schedule: { onAtS: 0, burnS: 600 }, fixed: true, ...SRC }) as LightSpec
const NIGHT = (lights: readonly LightSpec[]): NightFacts => ({ hour0: 21, latDeg: 11.24, cloudCover: 0.1, lights })
const MILE = 1609.344

function build(rangeM: number, opts: { dark?: boolean; lights?: readonly LightSpec[]; night?: boolean; tracking?: boolean; velocity?: Vec3 } = {}): World<undefined> {
  const pilot = { target: null, skill: GREEN_SKILL, decision: { ...initialDecision('z'), targetId: opts.tracking === true ? 'me' : null } }
  const z = level('z', zero, v3(0, 1500, 0), v3(100, 0, 0), pilot)
  const me = level('me', f6f, v3(rangeM, 1500, 0), opts.velocity ?? v3(100, 0, 0))
  let w = createWorldOf({ aircraft: [me, z], player: 'me' })
  if (opts.night !== false) w = withNightFacts(w, NIGHT(opts.lights ?? [navOn('me'), navOn('z')]))
  return opts.dark === true ? withPlayerLights(w, false) : w
}
const viewOf = (w: World<undefined>): TargetingView<undefined> => {
  const p = perceptionAt(w, DT)
  return { snapshot: w.aircraft, combat: w.combat.aircraft, sides: sidesOf(w, w.aircraft), terrain: w.terrain, decks: decksOf(w.ships), ...(p === null ? {} : { perception: p }) }
}
const zOf = (w: World<undefined>): AircraftEntity<undefined> => w.aircraft.find((a) => a.id === 'z')!
const NONE = { current: null, leaderId: null } as const

describe('a lit player is seen from far, a blacked-out one only from close', () => {
  it('at 3 mi: lit is selected, blacked out is not', () => {
    const lit = build(3 * MILE), dark = build(3 * MILE, { dark: true })
    expect(selectTarget(zOf(lit), viewOf(lit), NONE)).toBe('me')
    expect(selectTarget(zOf(dark), viewOf(dark), NONE)).toBeNull()
  })
  it('at a quarter mile both are seen', () => {
    const dark = build(0.25 * MILE, { dark: true })
    expect(selectTarget(zOf(dark), viewOf(dark), NONE)).toBe('me')
  })
  it('a flare 300 m from a blacked-out player brings him back at 1.9 mi, not at 3 mi', () => {
    // Flare 300 m above the player's position, so illuminance there is about 8.9 lux (the plan's row).
    const near = build(1.8 * MILE, { dark: true, lights: [navOn('me'), flareAt(1.8 * MILE, 1800, 0)] })
    const far = build(3 * MILE, { dark: true, lights: [navOn('me'), flareAt(3 * MILE, 1800, 0)] })
    expect(selectTarget(zOf(near), viewOf(near), NONE)).toBe('me')
    expect(selectTarget(zOf(far), viewOf(far), NONE)).toBeNull()
  })
  it('a pilot already tracking him keeps him out to 1.25 x the range; a fresh pilot does not', () => {
    // Dark range about 830 m: 1,000 m is outside it but inside 1.25 x.
    const fresh = build(1000, { dark: true }), tracking = build(1000, { dark: true, tracking: true })
    expect(selectTarget(zOf(fresh), viewOf(fresh), NONE)).toBeNull()
    expect(selectTarget(zOf(tracking), viewOf(tracking), NONE)).toBe('me')
    const beyond = build(1300, { dark: true, tracking: true })
    expect(selectTarget(zOf(beyond), viewOf(beyond), NONE)).toBeNull()
  })
  it('a day world (no night facts) selects exactly as before, lit or not', () => {
    const a = build(3 * MILE, { night: false }), b = build(3 * MILE, { night: false, dark: true })
    expect(viewOf(a).perception).toBeUndefined()
    expect(selectTarget(zOf(a), viewOf(a), NONE)).toBe('me')
    expect(selectTarget(zOf(b), viewOf(b), NONE)).toBe('me')
  })
})

describe('the gate is in the shared check, so nothing can bypass it', () => {
  it('isContact itself is false for an unseen aircraft (idle clock reads isContact)', () => {
    const dark = build(3 * MILE, { dark: true })
    expect(isContact(zOf(dark), dark.aircraft.find((a) => a.id === 'me')!, viewOf(dark))).toBe(false)
  })
  it('threatAstern ignores an unseen tail-chaser 1,200 m behind (inside its 1,500 m cone), and sees a lit one', () => {
    const lit = build(-1200), dark = build(-1200, { dark: true }), day = build(-1200, { night: false, dark: true })
    expect(threatAstern(zOf(lit), viewOf(lit))).toBe(true)
    expect(threatAstern(zOf(dark), viewOf(dark))).toBe(false)
    expect(threatAstern(zOf(day), viewOf(day))).toBe(true)
  })
})

describe('through advance (the real tick)', () => {
  const run = (w: World<undefined>, ticks: number): World<undefined> => { let x = w; for (let i = 0; i < ticks; i++) x = advance(x, DT).world; return x }
  it('after one rescore the Zero has chosen the lit player and not the blacked-out one', () => {
    const lit = run(build(3 * MILE), 3), dark = run(build(3 * MILE, { dark: true }), 3)
    expect(zOf(lit).pilot!.decision.targetId).toBe('me')
    expect(zOf(dark).pilot!.decision.targetId).toBeNull()
  })
  it('the flag survives stepping, and two identical runs have identical checksums every second (determinism)', () => {
    const a = run(build(3 * MILE, { dark: true }), 180), b = run(build(3 * MILE, { dark: true }), 180)
    expect(a.aircraft.find((x) => x.id === 'me')!.lightsOff).toBe(true)
    expect(a.night).toBeDefined()
    expect(worldChecksum(a)).toBe(worldChecksum(b))
  })
})
