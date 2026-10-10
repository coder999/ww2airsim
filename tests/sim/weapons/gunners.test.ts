import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { bundleForScenario, loadAircraftSpec } from '../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { inArc } from '../../../src/sim/weapons/gunners.js'
import { v3 } from '../../../src/sim/math/vec3.js'

/**
 * Defensive gunners (E3, 2026-10-10): who they shoot, when they hold, and that a world without them is
 * untouched. How hard they hit is gunnerLethality.test.ts's.
 */
const X = -30000, Z = -16000, Y = 2500, V = 90

type Extra = { id: string; spec: string; side?: 'allied' | 'axis'; dx: number; dy?: number; dz?: number }
function world(extra: readonly Extra[], opts: { bomber?: boolean; skill?: 'green' | 'veteran' } = {}): World<undefined> {
  const route = [{ x: X + 80000, z: Z, altitudeM: Y, speedMps: V }]
  return worldFromScenario(bundleForScenario(parseScenario({
    id: 'gunner-test', player: 'f6f-1', airfields: ['tacloban'],
    aircraft: [
      ...extra.map((e) => ({
        id: e.id, spec: e.spec, ...(e.side === undefined ? {} : { side: e.side }),
        airborneAt: { position: [X + e.dx, Y + (e.dy ?? 0), Z + (e.dz ?? 0)], headingDeg: 90, speedMps: V, throttle: 0.7 },
      })),
      ...(opts.bomber === false ? [] : [{
        id: 'b17-1', spec: 'b-17-flying-fortress', side: 'axis',
        airborneAt: { position: [X, Y, Z], headingDeg: 90, speedMps: V, throttle: 0.7 },
        pilot: { skill: opts.skill ?? 'veteran', ingress: { route } },
      }]),
    ],
    ships: [], weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  })), null)
}
const run = (w: World<undefined>, seconds: number): World<undefined> => {
  let out = w
  for (let i = 0; i < Math.round(seconds / DT); i++) out = advance(out, DT).world
  return out
}

describe('a gunner\'s arc', () => {
  const tail = loadAircraftSpec('b-17-flying-fortress').combat!.gunners!.find((g) => g.mount === 'Turret6')!
  it('the B-17\'s tail guns cover a cone astern and nothing ahead', () => {
    expect(inArc(v3(-1, 0, 0), tail)).toBe(true)
    expect(inArc(v3(-1, 0.3, 0.3), tail)).toBe(true) // about 17 deg up and right
    expect(inArc(v3(1, 0, 0), tail)).toBe(false)
    expect(inArc(v3(-Math.cos(0.7), 0, Math.sin(0.7)), tail)).toBe(false) // 40 deg off the tail, past its 30
    expect(inArc(v3(-Math.cos(0.6), Math.sin(0.6), 0), tail)).toBe(false) // 34 deg up, past its 30
  })
  it('the ball turret sees only below the airframe\'s horizontal, all the way round', () => {
    const ball = loadAircraftSpec('b-17-flying-fortress').combat!.gunners!.find((g) => g.mount === 'Turret5')!
    expect(inArc(v3(1, -0.2, 0), ball)).toBe(true)
    expect(inArc(v3(-0.3, -1, 0.5), ball)).toBe(true)
    expect(inArc(v3(0, 0.1, 1), ball)).toBe(false)
  })
})

describe('defensive fire', () => {
  // A Hellcat sitting 300 m dead astern at the bomber's speed: the tail and top turrets bear.
  const astern: Extra = { id: 'f6f-1', spec: 'f6f-hellcat', dx: -300, dy: 5 }

  it('a bomber\'s gunners fire at a hostile fighter in range, and hit it', () => {
    const w = run(world([{ ...astern, dx: -100 }]), 20) // closer than the others: from 300 m a veteran rarely hits a Hellcat dead astern
    expect(w.combat.aircraft['b17-1']!.shots).toBeGreaterThan(20)
    expect(w.combat.aircraft['b17-1']!.hits).toBeGreaterThan(0)
    expect(w.combat.aircraft['f6f-1']!.damage.structure).toBeLessThan(1)
    expect(w.combat.aircraft['f6f-1']!.lastHitBy).toBe('b17-1')
  })

  it('they never fire at their own side', () => {
    const w = run(world([{ ...astern, side: 'axis' }]), 6)
    expect(w.combat.aircraft['b17-1']!.shots).toBe(0)
    expect(w.combat.gunners).toBeUndefined()
  })

  it('they hold fire with a friendly in the line, and open up once it is not', () => {
    const wingman: Extra = { id: 'b17-2', spec: 'b-17-flying-fortress', side: 'axis', dx: -150, dy: 2 }
    const held = run(world([{ ...astern, dx: -450 }, wingman]), 4)
    expect(held.combat.aircraft['b17-1']!.shots).toBe(0)
    const clear = run(world([{ ...astern, dx: -450 }]), 4)
    expect(clear.combat.aircraft['b17-1']!.shots).toBeGreaterThan(0)
  })

  it('a burning bomber\'s gunners are silent', () => {
    const w0 = world([astern])
    const rec = w0.combat.aircraft['b17-1']!
    const burning = { ...w0, combat: { ...w0.combat, aircraft: { ...w0.combat.aircraft, 'b17-1': { ...rec, damage: { ...rec.damage, burningSince: 0 } } } } }
    expect(run(burning, 4).combat.aircraft['b17-1']!.shots).toBe(0)
  })

  it('out of range they wait', () => {
    expect(run(world([{ ...astern, dx: -1200 }]), 3).combat.aircraft['b17-1']!.shots).toBe(0)
  })

  it('a world with no gunner carries no gunner state, and a world with them replays bit for bit', () => {
    const fighters = run(world([{ id: 'f6f-1', spec: 'f6f-hellcat', dx: -300 }, { id: 'zero-1', spec: 'a6m2-zero', side: 'axis', dx: 0 }], { bomber: false }), 3)
    expect(fighters.combat.gunners).toBeUndefined()
    const a = run(world([astern]), 5), b = run(world([astern]), 5)
    expect(a.combat.gunners).toBeDefined()
    expect(JSON.stringify(b.combat)).toBe(JSON.stringify(a.combat))
  })

  it('green gunners start later than veterans', () => {
    // First sight waits the pilot's reaction time (0.3 s veteran, 1.0 s green).
    const firstShot = (skill: 'green' | 'veteran'): number => {
      let w = world([astern], { skill })
      for (let i = 1; i < 300; i++) { w = advance(w, DT).world; if (w.combat.aircraft['b17-1']!.shots > 0) return i }
      return Infinity
    }
    expect(firstShot('veteran')).toBeLessThan(firstShot('green'))
  })
})

describe('every gunner in content', () => {
  const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
  const armed = specs.filter((s) => (s.combat?.gunners ?? []).length > 0).map((s) => s.id).sort()
  it('is enrolled: the six airframes with turrets or flexible guns', () => {
    expect(armed).toEqual(['b-17-flying-fortress', 'b-29-superfortress', 'b5n2-kate', 'g4m-betty', 'ki-21-sally', 'tbm-3-avenger'])
  })
  it.each(armed)('%s: each gunner fires at a fighter in its arc', (id) => {
    // Put a Hellcat 300 m out along each gun's rest line (its arc's middle) and check that gun alone takes it.
    const spec = specs.find((s) => s.id === id)!
    for (const [i, g] of spec.combat!.gunners!.entries()) {
      const el = ((g.elevationDeg[0] + g.elevationDeg[1]) / 2) * Math.PI / 180, az = g.restHeadingDeg * Math.PI / 180
      const dir = v3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
      let w = worldFromScenario(bundleForScenario(parseScenario({
        id: 'gunner-enroll', player: 'f6f-1', airfields: ['tacloban'],
        aircraft: [
          { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [X + dir.x * 300, Y + dir.y * 300, Z + dir.z * 300], headingDeg: 90, speedMps: V } },
          { id: 'b-1', spec: id, side: 'axis', airborneAt: { position: [X, Y, Z], headingDeg: 90, speedMps: V, throttle: 0.7 }, pilot: { skill: 'veteran', ingress: { route: [{ x: X + 80000, z: Z, altitudeM: Y, speedMps: V }] } } },
        ],
        ships: [], weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
      })), null)
      for (let k = 0; k < 90; k++) w = advance(w, DT).world
      expect(w.combat.gunners?.nextFire[`b-1#${i}`], `${id} ${g.mount}`).toBeDefined()
    }
  })
})
