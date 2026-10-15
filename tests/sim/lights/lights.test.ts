import { describe, it, expect } from 'vitest'
import {
  LIGHT_CAPS, LIGHT_CONTRACT_VERSION, LIGHT_KINDS, LightsSchema, ambientNightLevel, illuminanceAt, lightsAt, aimAxis,
  INTENSITY_CD, FLARE_DESCENT_MPS, FLARE_GROUND_BURN_S, type LightSpec, type LightWorld,
} from '../../../src/sim/lights/lights.js'
import { v3 } from '../../../src/sim/math/vec3.js'

const SRC = { source: 'gameplay', sourceNote: 'test fixture' } as const
const pot = (id: string, x: number, state: 'lit' | 'unlit' = 'lit', extra: Partial<LightSpec> = {}): LightSpec =>
  ({ id, kind: 'pot', at: { x, z: 0 }, color: 'warm', state, ...SRC, ...extra }) as LightSpec
const world = (tick: number): LightWorld => ({
  tick, dtS: 1, groundHeightM: () => 3,
  shipPoint: (s, o) => (s === 'cv' ? v3(100 + o[0], 20 + o[1], o[2]) : null),
  aircraftPoint: () => null,
})
const parse = (l: unknown) => LightsSchema.safeParse(l)

describe('light contract: schema', () => {
  it('pins the contract version F6B was built against', () => { expect(LIGHT_CONTRACT_VERSION).toBe(1) })
  it('pins the kinds', () => { expect([...LIGHT_KINDS]).toEqual(['pot', 'fixture', 'searchlight', 'flare', 'nav']) })
  it('accepts a minimal pot and rejects unknown fields', () => {
    expect(parse([pot('a', 0)]).success).toBe(true)
    expect(parse([{ ...pot('a', 0), rgb: [1, 1, 1] }]).success).toBe(false)
  })
  it('requires a source note (GAMEPLAY.md: sourced or labeled gameplay)', () => {
    const bare: Record<string, unknown> = { ...pot('a', 0) }
    delete bare.sourceNote
    expect(parse([bare]).success).toBe(false)
  })
  it('rejects a duplicate id, a wrong state for the kind, and kind-specific misuse', () => {
    expect(parse([pot('a', 0), pot('a', 5)]).success).toBe(false)
    expect(parse([pot('a', 0, 'lit', { state: 'on' })]).success).toBe(false)
    expect(parse([{ ...pot('s', 0), kind: 'searchlight', state: 'on' }]).success, 'searchlight without aim').toBe(false)
    expect(parse([{ ...pot('f', 0), kind: 'flare', state: 'on' }]).success, 'flare without a schedule').toBe(false)
    expect(parse([{ ...pot('p', 0), aim: { azimuthDeg: 0, elevationDeg: 10 } }]).success, 'aim on a pot').toBe(false)
  })
  it('FAILS to load past each cap instead of dropping lights silently', () => {
    const many = (n: number, mk: (i: number) => LightSpec): LightSpec[] => Array.from({ length: n }, (_, i) => mk(i))
    const beam = (i: number): LightSpec => ({ ...pot(`s${i}`, i), kind: 'searchlight', state: 'on', aim: { azimuthDeg: 0, elevationDeg: 80 } }) as LightSpec
    const flare = (i: number): LightSpec => ({ ...pot(`f${i}`, i), kind: 'flare', state: 'on', schedule: { onAtS: 0, burnS: 60 } }) as LightSpec
    expect(parse(many(LIGHT_CAPS.searchlights, beam)).success).toBe(true)
    expect(parse(many(LIGHT_CAPS.searchlights + 1, beam)).success).toBe(false)
    expect(parse(many(LIGHT_CAPS.flares, flare)).success).toBe(true)
    expect(parse(many(LIGHT_CAPS.flares + 1, flare)).success).toBe(false)
    expect(parse(many(LIGHT_CAPS.glowSprites, (i) => pot(`p${i}`, i))).success).toBe(true)
    expect(parse(many(LIGHT_CAPS.glowSprites + 1, (i) => pot(`p${i}`, i))).success).toBe(false)
  })
})

describe('lightsAt', () => {
  it('orders by id regardless of authored order, and is pure', () => {
    const specs = [pot('c', 2), pot('a', 0), pot('b', 1)]
    const a = lightsAt(specs, world(0)), b = lightsAt(specs, world(0))
    expect(a.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(b).toEqual(a)
  })
  it('puts a static light on the ground unless an altitude is given', () => {
    expect(lightsAt([pot('a', 0)], world(0))[0]!.positionM.y).toBe(3)
    expect(lightsAt([pot('a', 0, 'lit', { at: { x: 0, z: 0, altitudeM: 40 } })], world(0))[0]!.positionM.y).toBe(40)
  })
  it('an unlit light has no intensity and no radius', () => {
    const l = lightsAt([pot('a', 0, 'unlit')], world(0))[0]!
    expect([l.intensityCd, l.radiusM]).toEqual([0, 0])
  })
  it('follows a ship anchor and drops a light whose ship is gone', () => {
    const on = (ship: string): LightSpec => ({ ...pot('m', 0), kind: 'fixture', at: { ship, offset: [1, 2, 3] } }) as LightSpec
    expect(lightsAt([on('cv')], world(0))[0]!.positionM).toEqual(v3(101, 22, 3))
    expect(lightsAt([on('sunk')], world(0))).toEqual([])
  })
  it('a flare ignites at onAtS, descends while it burns and goes dark after burnS', () => {
    const f: LightSpec = { ...pot('f', 0), kind: 'flare', state: 'on', at: { x: 0, z: 0, altitudeM: 600 }, schedule: { onAtS: 10, burnS: 180 } } as LightSpec
    const at = (t: number) => lightsAt([f], world(t))[0]!
    expect(at(9).intensityCd).toBe(0)
    expect(at(10).intensityCd).toBe(INTENSITY_CD.flare)
    expect(at(110).positionM.y).toBeCloseTo(600 - FLARE_DESCENT_MPS * 100, 6)
    expect(at(189).intensityCd).toBeGreaterThan(0)
    expect(at(190).intensityCd).toBe(0)
  })
  it('a scheduled pot is lit only inside its window', () => {
    const p = pot('p', 0, 'lit', { schedule: { onAtS: 5, offAtS: 8 } })
    const lit = (t: number) => lightsAt([p], world(t))[0]!.intensityCd > 0
    expect([4, 5, 7, 8].map(lit)).toEqual([false, true, true, false])
  })
  it('a searchlight aims by compass azimuth, sweeps with time, and carries a cone', () => {
    const s: LightSpec = { ...pot('s', 0), kind: 'searchlight', state: 'on', aim: { azimuthDeg: 90, elevationDeg: 0, sweepDegPerS: 10 } } as LightSpec
    const l0 = lightsAt([s], world(0))[0]!, l9 = lightsAt([s], world(9))[0]!
    expect(l0.axis!.x).toBeCloseTo(1, 6) // east
    expect(l9.axis!.x).toBeCloseTo(aimAxis(180, 0).x, 6) // swept to south
    expect(l9.axis!.z).toBeCloseTo(1, 6) // +z is south
    expect(l0.coneHalfAngleRad).toBeGreaterThan(0)
  })
})

describe('flares behave like flares (F6A, Mark 2026-10-14)', () => {
  const flare = (extra: Partial<LightSpec> = {}, at = { x: 0, z: 0, altitudeM: 300 }, burnS = 240): LightSpec =>
    ({ ...pot('f', 0), kind: 'flare', state: 'on', at, schedule: { onAtS: 10, burnS }, ...extra }) as LightSpec
  const worldWith = (ground: (x: number, z: number) => number, wind = v3(0, 0, 0)): ((tick: number) => LightWorld) => (tick) => ({
    tick, dtS: 1, windMps: wind, groundHeightM: ground, shipPoint: () => null, aircraftPoint: () => null,
  })
  const at = (spec: LightSpec, w: (tick: number) => LightWorld, t: number) => lightsAt([spec], w(t))[0]!

  it('descends at the parachute rate and drifts with the wind', () => {
    const w = worldWith(() => 0, v3(5, 0, -3))
    const f = flare()
    const a = at(f, w, 30), b = at(f, w, 70)
    expect(a.positionM.y).toBeCloseTo(300 - FLARE_DESCENT_MPS * 20, 6)
    expect(a.positionM.x).toBeCloseTo(5 * 20, 6); expect(a.positionM.z).toBeCloseTo(-3 * 20, 6)
    expect((a.positionM.y - b.positionM.y) / 40, 'a constant descent rate').toBeCloseTo(FLARE_DESCENT_MPS, 6)
    expect(a.intensityCd).toBe(INTENSITY_CD.flare)
  })
  it('goes out the moment it touches water, at the sea surface', () => {
    const w = worldWith(() => 0)
    const f = flare()
    const touch = 10 + (300 - 0.3) / FLARE_DESCENT_MPS
    expect(at(f, w, touch - 2).intensityCd).toBeGreaterThan(0)
    expect(at(f, w, touch + 2).intensityCd, 'out in water').toBe(0)
    expect(at(f, w, touch + 2).positionM.y).toBeCloseTo(0.3, 6)
    // And a flare drifting from land out over the sea goes out where it lands, not where it started.
    const coast = worldWith((x) => (x < 100 ? 20 : 0), v3(10, 0, 0))
    expect(at(f, coast, 10 + 60).intensityCd, 'still falling over the water: lit').toBeGreaterThan(0)
    expect(at(f, coast, 10 + 200).intensityCd, 'out once it has drifted over the water and touched it').toBe(0)
  })
  it('on land it lies there and keeps burning for FLARE_GROUND_BURN_S, then goes out; a shorter schedule ends it earlier', () => {
    const w = worldWith(() => 50)
    const f = flare({}, { x: 0, z: 0, altitudeM: 300 })
    const touch = 10 + (300 - 50 - 0.3) / FLARE_DESCENT_MPS
    expect(at(f, w, touch + 1).intensityCd).toBeGreaterThan(0)
    expect(at(f, w, touch + 1).positionM.y).toBeCloseTo(50.3, 6)
    expect(at(f, w, touch + FLARE_GROUND_BURN_S - 1).intensityCd, 'still burning on the ground').toBeGreaterThan(0)
    expect(at(f, w, touch + FLARE_GROUND_BURN_S + 2).intensityCd, 'out after its ground burn').toBe(0)
    const short = flare({}, { x: 0, z: 0, altitudeM: 300 }, 30)
    expect(at(short, w, 10 + 29).intensityCd, 'burning while the schedule allows').toBeGreaterThan(0)
    expect(at(short, w, 10 + 31).intensityCd, 'the schedule\'s burn time ends it before it lands').toBe(0)
  })
  it('falls at M24 speed: 700 ft/min, scalable for tuning', () => {
    expect(FLARE_DESCENT_MPS).toBeCloseTo(3.556, 3)
    const f = flare()
    const slow = { ...worldWith(() => 0)(60), flareFallScale: 0.5 }
    expect(lightsAt([f], slow)[0]!.positionM.y).toBeCloseTo(300 - 0.5 * FLARE_DESCENT_MPS * 50, 6)
  })
  it('lands on a sloping hillside where the slope meets it, not at the launch point\'s ground', () => {
    const slope = (x: number) => 0.2 * x // rises 0.2 m per metre eastward
    const f = flare()
    const w = worldWith((x) => Math.max(0, slope(x)), v3(10, 0, 0))
    const l = at(f, w, 10 + 40)
    // After 40 s it has drifted 400 m east where the ground is 80 m up; it fell 142 m so is still above it, then lands later.
    expect(l.positionM.x).toBeCloseTo(400, 6)
    const late = at(f, w, 10 + 80)
    expect(late.positionM.y, 'resting on the slope').toBeCloseTo(slope(late.positionM.x) + 0.3, 1)
  })
  it('a flare ignited below the terrain is on the ground at once', () => {
    const f = flare({}, { x: 0, z: 0, altitudeM: 10 })
    expect(at(f, worldWith(() => 30), 11).positionM.y).toBeCloseTo(30.3, 6)
  })
  it('a FIXED flare hangs at its authored point for its whole burn: no descent, drift or ground', () => {
    const w = worldWith(() => 0, v3(8, 0, 8))
    const f = flare({ fixed: true })
    for (const t of [11, 100, 200, 249]) { const l = at(f, w, t); expect(l.positionM).toEqual(v3(0, 300, 0)); expect(l.intensityCd, `t ${t}`).toBe(INTENSITY_CD.flare) }
    expect(at(f, w, 251).intensityCd).toBe(0)
    expect(at(f, w, 5).intensityCd).toBe(0)
  })
  it('is deterministic: the same tick gives the same flare, in any order of evaluation', () => {
    const w = worldWith((x, z) => 40 + Math.sin(x * 0.01) * 15 + z * 0.01, v3(4, 0, 2))
    const f = flare()
    const times = [10, 40, 90, 150, 150, 40]
    const first = times.map((t) => at(f, w, t))
    expect(first[1]).toEqual(first[5]); expect(first[3]).toEqual(first[4])
    expect(times.map((t) => at(f, w, t))).toEqual(first)
  })
  it('only a flare may be `fixed`', () => {
    expect(parse([{ ...pot('a', 0), fixed: true }]).success).toBe(false)
    expect(parse([flare({ fixed: true })]).success).toBe(true)
  })
})

describe('illuminanceAt', () => {
  it('falls off as inverse square from a known anchor: 50 cd is 0.5 lux at 10 m and 0.125 at 20 m', () => {
    const L = lightsAt([pot('a', 0, 'lit', { at: { x: 0, z: 0, altitudeM: 0 } })], world(0))
    expect(illuminanceAt(L, v3(10, 0, 0))).toBeCloseTo(0.5, 9)
    expect(illuminanceAt(L, v3(20, 0, 0))).toBeCloseTo(0.125, 9)
  })
  it('is 0 outside the influence radius and for unlit lights, and sums lights', () => {
    const lit = lightsAt([pot('a', 0, 'lit', { at: { x: 0, z: 0, altitudeM: 0 } })], world(0))
    expect(illuminanceAt(lit, v3(lit[0]!.radiusM + 1, 0, 0))).toBe(0)
    expect(illuminanceAt(lightsAt([pot('a', 0, 'unlit')], world(0)), v3(1, 0, 0))).toBe(0)
    const two = lightsAt([pot('a', 0, 'lit', { at: { x: 0, z: 0, altitudeM: 0 } }), pot('b', 0, 'lit', { at: { x: 0, z: 0, altitudeM: 0 } })], world(0))
    expect(illuminanceAt(two, v3(10, 0, 0))).toBeCloseTo(1, 9)
  })
  it('a searchlight lights only inside its cone', () => {
    const s: LightSpec = { ...pot('s', 0, 'lit', { at: { x: 0, z: 0, altitudeM: 0 } }), kind: 'searchlight', state: 'on', aim: { azimuthDeg: 0, elevationDeg: 90 } } as LightSpec
    const L = lightsAt([s], world(0))
    expect(illuminanceAt(L, v3(0, 1000, 0))).toBeGreaterThan(100)
    expect(illuminanceAt(L, v3(1000, 100, 0)), 'far outside the beam').toBe(0)
  })
})

describe('ambientNightLevel', () => {
  it('falls with the sun and bottoms at the moonlit floor, never zero', () => {
    const levels = [10, 0, -6, -12, -18, -46].map((e) => ambientNightLevel(e, 0))
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeLessThanOrEqual(levels[i - 1]!)
    expect(levels.at(-1)!).toBeGreaterThan(0)
    expect(ambientNightLevel(-46, 0)).toBeCloseTo(ambientNightLevel(-90, 0), 12) // fixed moon: no depth dependence
  })
  it('cloud makes it darker and tolerates NaN cover', () => {
    expect(ambientNightLevel(-46, 1)).toBeLessThan(ambientNightLevel(-46, 0))
    expect(ambientNightLevel(-46, NaN)).toBe(ambientNightLevel(-46, 0))
  })
  it('is far below any lit pot at 10 m, so a lit airfield is lit in the scalar too', () => {
    expect(ambientNightLevel(-46, 0)).toBeLessThan(INTENSITY_CD.pot / 100)
  })
})
