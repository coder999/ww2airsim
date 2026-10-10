import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle, bundleForScenario } from '../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, aircraftById } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { storeTypeOf } from '../../../src/sim/weapons/combat.js'
import { attackCommitted, DIVE_MAX_ANGLE_RAD } from '../../../src/sim/ai/attack.js'
import type { AttackKind } from '../../../src/sim/ai/pilot.js'
import { attackWorld, runAttack, type AttackOptions, type AttackRun } from './attackHarness.js'

/**
 * The attack run (E2, 2026-10-10): what an ingress raider does on arrival when its orders say `attack`.
 * Every case runs through production `advance` on a flat sea with the target's AA stripped (the AA has its
 * own tests, and the handoff records what it does to an attacker); a seed is the start bearing and the
 * raider's id, so its sight error and its noise. The numbers are calibrated by tools/ai/attackSweep.ts
 * (docs/handoff/2026-10-10-e2-attack-ai.md); the bounds here are the measured spread, with room.
 */
const SEEDS = 10
const runs = (o: Omit<AttackOptions, 'seed'>, n = SEEDS): AttackRun[] => Array.from({ length: n }, (_, i) => runAttack({ ...o, seed: i + 1 }))
const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
const directRate = (rs: readonly AttackRun[]): number => rs.filter((r) => r.direct > 0).length / rs.length

describe('opt-in: an ingress without `attack` is the ingress it always was', () => {
  const raw = (ingress: Record<string, unknown>) => ({
    id: 'optin', player: 'f6f-1', airfields: ['tacloban'],
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } },
      { id: 'r-1', spec: 'd3a-val', airborneAt: { position: [0, 3000, 0], headingDeg: 0, speedMps: 120 }, pilot: { ingress } },
    ],
    ships: [{ id: 'dd-1', spec: 'fletcher-dd', side: 'allied', waypoints: [[-8000, -48000]], speedMps: 0 }],
    weather: { windFromDeg: 0, windMps: 0 },
  })
  const route = [{ x: 0, z: -15000, altitudeM: 3000, speedMps: 120 }]

  it('builds the same orders, no attack key and no stores, and the raider carries nothing', () => {
    const w = worldFromScenario(bundleForScenario(parseScenario(raw({ route, destination: { ship: 'dd-1' } }))), null)
    const orders = aircraftById(w, 'r-1')!.pilot!.ingress!
    expect(Object.keys(orders).sort()).toEqual(['destination', 'route'])
    expect(w.combat.aircraft['r-1']!.stores).toEqual({ bombs: 0, rockets: 0 })
  })

  it('with `attack` the raider is armed with its full racks, and `attack` needs a destination', () => {
    const w = worldFromScenario(bundleForScenario(parseScenario(raw({ route, destination: { ship: 'dd-1' }, attack: 'dive-bomb' }))), null)
    expect(aircraftById(w, 'r-1')!.pilot!.ingress!.attack).toBe('dive-bomb')
    expect(w.combat.aircraft['r-1']!.stores.bombs).toBe(1)
    expect(() => parseScenario(raw({ route, attack: 'dive-bomb' }))).toThrow(/attack needs a destination/)
  })

  it('an airfield destination carries the strip\'s side, only for an attacker', () => {
    const plain = worldFromScenario(bundleForScenario(parseScenario(raw({ route, destination: { airfield: 'tacloban' } }))), null)
    expect(aircraftById(plain, 'r-1')!.pilot!.ingress!.destination).not.toHaveProperty('side')
    const armed = worldFromScenario(bundleForScenario(parseScenario({ ...raw({ route, destination: { airfield: 'tacloban' }, attack: 'level-bomb' }), airfieldSides: { tacloban: 'allied' } })), null)
    expect(aircraftById(armed, 'r-1')!.pilot!.ingress!.destination).toMatchObject({ kind: 'point', side: 'allied' })
  })
})

describe('dive-bombing run (D3A Val)', () => {
  const vet = runs({ kind: 'dive-bomb', spec: 'd3a-val', skill: 'veteran' })
  const green = runs({ kind: 'dive-bomb', spec: 'd3a-val', skill: 'green' })

  it('every run releases its bomb inside the legal window, below the dive speed, and pulls out above the sea', () => {
    const vne = loadAircraftSpec('d3a-val').limits.diveSpeedMps
    for (const r of [...vet, ...green]) {
      expect(r.releases).toHaveLength(1)
      const rel = r.releases[0]!
      expect(rel.heightM).toBeGreaterThan(350)
      expect(rel.heightM).toBeLessThan(900)
      expect(rel.speedMps).toBeLessThan(0.95 * vne)
      expect(r.minHeightM, 'pulled out above the sea').toBeGreaterThan(150)
      expect(r.world.aircraft.find((a) => a.id.startsWith('atk-'))!.impact).toBeNull()
      expect(r.lostS).toBeNull()
    }
  })

  it('a veteran puts the bomb on the ship: median miss under 25 m, most runs hit', () => {
    expect(median(vet.flatMap((r) => r.impactMissM))).toBeLessThan(25)
    expect(vet.filter((r) => r.hit).length).toBeGreaterThanOrEqual(8)
  })

  it('a green pilot is the worse bomber: farther off, and fewer hits than the veteran', () => {
    expect(median(green.flatMap((r) => r.impactMissM))).toBeGreaterThan(1.5 * median(vet.flatMap((r) => r.impactMissM)))
    expect(green.filter((r) => r.hit).length).toBeLessThan(vet.filter((r) => r.hit).length - 2)
    expect(directRate(green)).toBeLessThan(directRate(vet))
  })

  it('a moving ship is led: a veteran still hits it more often than not', () => {
    const moving = runs({ kind: 'dive-bomb', spec: 'd3a-val', skill: 'veteran', shipSpeedMps: 6 })
    expect(moving.filter((r) => r.hit).length).toBeGreaterThanOrEqual(6)
  })

  it('the dive angle stays inside its band', () => {
    expect(DIVE_MAX_ANGLE_RAD).toBeLessThan((75 * Math.PI) / 180)
  })

  it('a structuredClone taken mid-dive flies on identically', () => {
    let w = attackWorld({ kind: 'dive-bomb', spec: 'd3a-val', skill: 'veteran', seed: 3 })
    let n = 0
    while (aircraftById(w, 'atk-3')!.pilot!.decision.attack?.phase !== 'dive' && n++ < 200 * 60) w = advance(w, DT).world
    expect(aircraftById(w, 'atk-3')!.pilot!.decision.attack?.phase).toBe('dive')
    const step = (x: typeof w): typeof w => { for (let i = 0; i < 600; i++) x = advance(x, DT).world; return x }
    expect(step(structuredClone(w))).toEqual(step(w))
  })
})

describe('torpedo run (Kate, Betty, Avenger: every torpedo airplane in content)', () => {
  const planes = [
    { spec: 'b5n2-kate', altitudeM: 800, speedMps: 70 },
    { spec: 'g4m-betty', altitudeM: 1200, speedMps: 85 },
    { spec: 'tbm-3-avenger', altitudeM: 1200, speedMps: 110 },
  ] as const

  it('enrolls every airplane in content whose rack holds a torpedo', () => {
    const all = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
      .filter((id) => storeTypeOf(loadAircraftSpec(id), 'torpedo')?.kind === 'torpedo').sort()
    expect(all).toEqual(planes.map((p) => p.spec).sort())
  })

  for (const plane of planes) {
    describe(plane.spec, () => {
      const base = { kind: 'torpedo' as const, spec: plane.spec, altitudeM: plane.altitudeM, speedMps: plane.speedMps, target: 'type-b-maru', shipSpeedMps: 5 }
      const vet = runs({ ...base, skill: 'veteran' })
      const green = runs({ ...base, skill: 'green' })
      const type = storeTypeOf(loadAircraftSpec(plane.spec), 'torpedo')!

      it('releases inside the drop envelope, at a range the torpedo can run, with the doors open, and nothing breaks up', () => {
        for (const r of [...vet, ...green]) {
          expect(r.releases).toHaveLength(1)
          const rel = r.releases[0]!
          expect(rel.heightM, 'height above the sea').toBeLessThanOrEqual(type.maxDropHeightM!)
          expect(rel.speedMps).toBeLessThanOrEqual(type.maxDropSpeedMps!)
          expect(rel.rangeM).toBeGreaterThan(type.armRunM! + 150)
          expect(rel.rangeM).toBeLessThan(type.runRangeM! + 400)
          if (loadAircraftSpec(plane.spec).bayDoors !== undefined) expect(rel.doors).toBe(1)
          expect(r.torpedoesBrokeUp).toBe(0)
          expect(r.torpedoesRan).toBe(1)
          expect(r.lostS).toBeNull()
        }
      })

      it('never touches the sea: the lowest point of every run is well above it', () => {
        for (const r of [...vet, ...green]) expect(r.minHeightM).toBeGreaterThan(25)
      })

      it('a veteran hits with most torpedoes, and a green pilot with fewer', () => {
        expect(vet.filter((r) => r.direct > 0).length).toBeGreaterThanOrEqual(8)
        expect(directRate(green)).toBeLessThan(directRate(vet))
      })
    })
  }
})

describe('level bombing run (Sally, two bombs in a bay)', () => {
  const base = { kind: 'level-bomb' as const, spec: 'ki-21-sally', altitudeM: 3000, speedMps: 100 }
  const vet = runs({ ...base, skill: 'veteran' })
  const green = runs({ ...base, skill: 'green' })

  it('opens its doors before it drops and lets both bombs go on separate passes', () => {
    for (const r of [...vet, ...green]) {
      expect(r.releases.length).toBe(2)
      for (const rel of r.releases) {
        expect(rel.doors).toBe(1)
        expect(rel.rangeM).toBeLessThan(5000)
        expect(rel.heightM).toBeGreaterThan(2500)
      }
    }
  })

  it('a veteran is the better bomber from altitude, and neither is a precision weapon', () => {
    const v = median(vet.flatMap((r) => r.impactMissM)), g = median(green.flatMap((r) => r.impactMissM))
    expect(v).toBeLessThan(90)
    expect(v).toBeGreaterThan(15)
    expect(g).toBeGreaterThan(1.4 * v)
  })

  it('bombs a strip too: the runway center, and not a strip of its own side', () => {
    const strip = runs({ ...base, skill: 'veteran', target: 'strip' }, 4)
    for (const r of strip) {
      expect(r.releases.length).toBe(2)
      expect(Math.min(...r.impactMissM)).toBeLessThan(150)
    }
    // The same raider ordered at a strip of its own side drops nothing.
    let w = attackWorld({ ...base, skill: 'veteran', seed: 1, target: 'strip', stripSide: 'axis' })
    for (let i = 0; i < 260 * 60; i++) w = advance(w, DT).world
    expect(w.combat.aircraft['atk-1']!.bombsDropped).toBe(0)
  })
})

describe('who is attacked', () => {
  it('a ship on the raider\'s own side cannot be the destination (the scenario check), and a strip of its own side is orbited (above)', () => {
    expect(() => attackWorld({ kind: 'dive-bomb', spec: 'd3a-val', skill: 'veteran', seed: 1, shipSide: 'axis' })).toThrow(/own side/)
  })

  it('a sunk target is not bombed again', () => {
    let w = attackWorld({ kind: 'dive-bomb', spec: 'd3a-val', skill: 'veteran', seed: 1 })
    w = { ...w, combat: { ...w.combat, ships: { ...w.combat.ships, 'dd-1': { ...w.combat.ships['dd-1']!, hp: 0, destroyedTick: 1 } } } }
    for (let i = 0; i < 200 * 60; i++) w = advance(w, DT).world
    expect(w.combat.aircraft['atk-1']!.bombsDropped).toBe(0)
  })

  it('a committed run is not pre-empted by a fighter', () => {
    expect(attackCommitted(undefined)).toBe(false)
    for (const phase of ['dive', 'pullout', 'run'] as const) expect(attackCommitted({ phase } as never)).toBe(true)
    for (const phase of ['approach', 'egress', 'done'] as const) expect(attackCommitted({ phase } as never)).toBe(false)
  })

  it('a kind a plane cannot fly is the orbit: a dive-bomb order on a torpedo airplane drops nothing', () => {
    const r = runAttack({ kind: 'dive-bomb', spec: 'b5n2-kate', skill: 'veteran', seed: 1, maxS: 200 })
    expect(r.releases).toHaveLength(0)
    expect(r.endPhase).toBe('none')
  })
})

const kinds: AttackKind[] = ['dive-bomb', 'torpedo', 'level-bomb']
describe('the run is written to the pilot\'s state only for an attacker', () => {
  it.each(kinds)('%s', (kind) => {
    const spec = kind === 'torpedo' ? 'b5n2-kate' : kind === 'dive-bomb' ? 'd3a-val' : 'ki-21-sally'
    const w = attackWorld({ kind, spec, skill: 'green', seed: 1 })
    expect(aircraftById(w, 'atk-1')!.pilot!.decision.attack).toBeUndefined()
    expect(aircraftById(w, 'f6f-1')!.pilot).toBeNull()
  })
})


describe('attack-range, the Dev scenario, with the AA live (M2)', () => {
  it('seven armed raiders fly into the guns: some are shot down, some still get a weapon away, and the ship is hurt', () => {
    let w = worldFromScenario(loadScenarioBundle('attack-range'), null)
    const raiders = w.aircraft.filter((a) => a.id !== 'f6f-1')
    expect(raiders.map((a) => a.id).sort()).toEqual(['kate-1', 'kate-2', 'kate-3', 'sally-1', 'val-1', 'val-2', 'val-3'])
    for (const r of raiders) expect(w.combat.aircraft[r.id]!.stores.bombs, r.id).toBeGreaterThan(0)
    for (let i = 0; i < 240 * 60; i++) w = advance(w, DT).world
    const dropped = raiders.reduce((n, r) => n + w.combat.aircraft[r.id]!.bombsDropped, 0)
    const down = raiders.filter((r) => w.combat.aircraft[r.id]!.damage.destroyedAt !== null).length
    expect(dropped).toBeGreaterThanOrEqual(3)
    expect(down).toBeGreaterThanOrEqual(1)
    expect(w.combat.ships['dd-1']!.hp).toBeLessThan(160)
  })
})
