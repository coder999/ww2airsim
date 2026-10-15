import { describe, expect, it } from 'vitest'
import { HYSTERESIS_BONUS, NAV_RANGE_M, limitGlows, selectLit } from '../../src/render/lights/select.js'
import { irradianceAtCpu, LIGHT_SLOTS, MAX_IRRADIANCE } from '../../src/render/lights/irradiance.js'
import {
  INTENSITY_CD, LIGHT_CAPS, LIGHT_RGB, LightsSchema, MAX_RADIUS_M, MIN_LUX, SEARCHLIGHT_HALF_ANGLE_RAD, aimAxis, lightsAt,
  type LightKind, type LightRuntime, type LightSpec,
} from '../../src/sim/lights/lights.js'
import { v3 } from '../../src/sim/math/vec3.js'

const light = (id: string, kind: LightKind, x: number, z: number, y = 1, cd: number = INTENSITY_CD[kind]): LightRuntime => ({
  id, kind, positionM: v3(x, y, z), intensityCd: cd, color: LIGHT_RGB.warm, radiusM: Math.min(MAX_RADIUS_M, Math.sqrt(cd / MIN_LUX)), blackoutExempt: false,
})
const runway = (): LightRuntime[] => Array.from({ length: 30 }, (_, i) => light(`pot-${String(i).padStart(2, '0')}`, 'pot', i % 2 === 0 ? -24 : 24, -750 + Math.floor(i / 2) * 100))

describe('lit-slot selection (plan §3.4: 8 lights, nearest to the eye, with hysteresis)', () => {
  it('honors the cap and picks the nearest of equal lights', () => {
    const eye = v3(0, 30, 0)
    const pick = selectLit(runway(), eye, new Set())
    expect(pick.length).toBe(LIGHT_SLOTS)
    const all = runway().map((l) => Math.hypot(l.positionM.x, l.positionM.y - 30, l.positionM.z)).sort((a, b) => a - b)
    const picked = pick.map((l) => Math.hypot(l.positionM.x, l.positionM.y - 30, l.positionM.z)).sort((a, b) => a - b)
    expect(picked).toEqual(all.slice(0, LIGHT_SLOTS))
  })
  it('a flare outranks nearer pots: ranked by light at the eye, not by distance alone', () => {
    const flare = light('flare', 'flare', 600, 0, 500)
    const pick = selectLit([...runway(), flare], v3(0, 30, 0), new Set(), 1)
    expect(pick[0]!.id).toBe('flare')
  })
  it('ignores dark lights', () => {
    expect(selectLit([light('off', 'pot', 1, 1, 1, 0)], v3(0, 0, 0), new Set())).toEqual([])
  })
  it('is stable: an eye jittering about an equidistant point never swaps the set once chosen, and a drift costs fewer swaps than no hysteresis', () => {
    // Two groups equidistant from x = 0; the eye jitters +-1 m about it.
    const lights = [...Array.from({ length: 8 }, (_, i) => light(`a${i}`, 'pot', -50 + i * 0.2, 10)), ...Array.from({ length: 8 }, (_, i) => light(`b${i}`, 'pot', 50 + i * 0.2, 10))]
    const run = (use: boolean): number => {
      let prev: ReadonlySet<string> = new Set(), swaps = 0
      for (let step = 0; step < 400; step++) {
        const eye = v3(Math.sin(step * 0.9) * 1.0, 1, 0)
        const set = new Set(selectLit(lights, eye, use ? prev : new Set()).map((l) => l.id))
        if (step > 0) for (const id of set) if (!prev.has(id)) swaps++
        prev = set
      }
      return swaps
    }
    const withHyst = run(true), without = run(false)
    expect(withHyst, 'hysteresis stops the flicker').toBeLessThan(without)
    expect(withHyst).toBeLessThanOrEqual(LIGHT_SLOTS)
    expect(HYSTERESIS_BONUS).toBeGreaterThan(1)
  })
  it('along a straight flight the set changes as lights pass, each light entering and leaving once', () => {
    const lights = runway()
    let prev: ReadonlySet<string> = new Set()
    const entered = new Map<string, number>()
    for (let z = -900; z <= 900; z += 5) {
      const set = new Set(selectLit(lights, v3(0, 80, z), prev).map((l) => l.id))
      for (const id of set) if (!prev.has(id)) entered.set(id, (entered.get(id) ?? 0) + 1)
      prev = set
    }
    for (const [id, n] of entered) expect(n, `${id} entered the lit set ${n} times`).toBe(1)
  })
})

describe('worst-case night scene respects every cap (plan §3.4)', () => {
  const beam = (i: number): LightSpec => ({ id: `s${i}`, kind: 'searchlight', at: { x: i * 100, z: 0 }, color: 'white', state: 'on', aim: { azimuthDeg: 0, elevationDeg: 80 }, source: 'gameplay', sourceNote: 'cap test' })
  const flare = (i: number): LightSpec => ({ id: `f${i}`, kind: 'flare', at: { x: i * 100, z: 50, altitudeM: 400 }, color: 'warm', state: 'on', schedule: { onAtS: 0, burnS: 100 }, source: 'gameplay', sourceNote: 'cap test' })
  const pot = (i: number): LightSpec => ({ id: `p${i}`, kind: 'pot', at: { x: i * 30, z: 0 }, color: 'warm', state: 'lit', source: 'gameplay', sourceNote: 'cap test' })
  it('30 pots, 3 beams and 4 flares load; every drawn and lit count stays under its cap with 24 aircraft in the air', () => {
    const specs = [...Array.from({ length: 30 }, (_, i) => pot(i)), ...[0, 1, 2].map(beam), ...[0, 1, 2, 3].map(flare)]
    expect(LightsSchema.safeParse(specs).success).toBe(true)
    const world = { tick: 60, dtS: 1, groundHeightM: () => 0, shipPoint: () => null, aircraftPoint: () => null }
    const runtime = [...lightsAt(specs, world)]
    // 24 aircraft x 3 position lights = 72 nav lights, all in range of the eye.
    for (let a = 0; a < 24; a++) for (const [k, dx] of [['port', -6], ['stbd', 6], ['tail', 0]] as const) runtime.push(light(`nav-${a}-${k}`, 'nav', a * 40 + dx, 300 + a * 7, 1500))
    const eye = v3(0, 1500, 0)
    expect(selectLit(runtime, eye, new Set()).length).toBeLessThanOrEqual(LIGHT_CAPS.litSlots)
    const glows = limitGlows(runtime, eye)
    expect(glows.filter((l) => l.kind === 'nav').length).toBe(LIGHT_CAPS.navSprites)
    expect(glows.filter((l) => l.kind !== 'nav').length).toBeLessThanOrEqual(LIGHT_CAPS.glowSprites)
    expect(glows.length).toBeLessThanOrEqual(LIGHT_CAPS.glowSprites + LIGHT_CAPS.navSprites)
    expect(runtime.filter((l) => l.kind === 'nav').length, 'the worst case really exceeds the nav cap').toBeGreaterThan(LIGHT_CAPS.navSprites)
    expect(runtime.filter((l) => l.kind === 'searchlight' && l.intensityCd > 0).length).toBeLessThanOrEqual(LIGHT_CAPS.searchlights)
    expect(runtime.filter((l) => l.kind === 'flare' && l.intensityCd > 0).length).toBeLessThanOrEqual(LIGHT_CAPS.flares)
  })
  it('nav lights beyond six miles are not drawn', () => {
    const far = light('nav-far', 'nav', NAV_RANGE_M + 100, 0, 1500)
    const near = light('nav-near', 'nav', NAV_RANGE_M - 100, 0, 1500)
    const g = limitGlows([far, near], v3(0, 1500, 0))
    expect(g.map((l) => l.id)).toEqual(['nav-near'])
  })
})

describe('the CPU twin of the shared lighting node', () => {
  it('is inverse-square, cosine-weighted and clamped', () => {
    const l = light('l', 'pot', 0, 0, 10, 1000)
    const at = (d: number, n = v3(0, 1, 0)) => irradianceAtCpu([l], v3(d, 0, 0), n, 1)[0]
    // A light straight overhead (d = 10 m up): E = I / d^2 * cos = 1000 / 100 = 10 -> clamped to the maximum.
    expect(irradianceAtCpu([{ ...l, positionM: v3(0, 100, 0) }], v3(0, 0, 0), v3(0, 1, 0), 1)[0]).toBeCloseTo(0.1 * LIGHT_RGB.warm[0], 9)
    expect(irradianceAtCpu([{ ...l, positionM: v3(0, 200, 0) }], v3(0, 0, 0), v3(0, 1, 0), 1)[0], 'half the distance up, a quarter the light').toBeCloseTo(0.025, 9)
    expect(at(0.0001)).toBeLessThanOrEqual(MAX_IRRADIANCE)
    expect(irradianceAtCpu([l], v3(5, 0, 0), v3(0, -1, 0), 1)[0], 'a surface facing away gets nothing').toBe(0)
    expect(irradianceAtCpu([l], v3(5, 0, 0), null, 1)[0], 'an omnidirectional receiver ignores the normal').toBeGreaterThan(0)
  })
  it('a searchlight lights only inside its cone', () => {
    const s: LightRuntime = { ...light('s', 'searchlight', 0, 0, 0, 1e6), axis: aimAxis(0, 90), coneHalfAngleRad: SEARCHLIGHT_HALF_ANGLE_RAD }
    expect(irradianceAtCpu([s], v3(0, 500, 0), v3(0, -1, 0), 0.001)[0]).toBeGreaterThan(0)
    expect(irradianceAtCpu([s], v3(500, 100, 0), v3(-1, 0, 0), 0.001)[0]).toBe(0)
  })
})
