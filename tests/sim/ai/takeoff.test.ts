import { describe, it, expect } from 'vitest'
import {
  startTakeoff, takeoffControls, ZERO_TAKEOFF_RUN_M, type TakeoffContext, type TakeoffState,
} from '../../../src/sim/ai/takeoff.js'
import { parkedStateOnRunway } from '../../../src/sim/ai/parkSpots.js'
import { heightAboveGround } from '../../../src/sim/ai/safety.js'
import { parseAirfield, runwayHeadingRad, worldToLocal, type Airfield } from '../../../src/sim/world/airfields.js'
import { createCombat } from '../../../src/sim/weapons/combat.js'
import { advance, aircraftById, withControls, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import type { Controls } from '../../../src/sim/flight/state.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import type { TerrainField } from '../../../src/sim/world/terrain.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { loadFixtureScenarioBundle } from '../../fixtures/scenarios.js'
import { flatField } from '../mission/fixture.js'
import { settledAll, terrainOrSkip } from '../mission/fly.js'

/** Land at 100 m everywhere: the pure tests need a surface, not Leyte. */
const flat = flatField(100)
const ZERO = loadAircraftSpec('a6m2-zero')

/** A hand-built strip at the origin, its runway on `headingDeg`. */
const strip = (headingDeg: number) => parseAirfield({
  id: 'test-strip', name: 'Test strip',
  runway: { center: { x: 0, z: 0 }, headingDeg, lengthM: 1500, widthM: 45 },
  apron: null, clearing: null,
  buildings: [{ id: 'test-hangar', kind: 'hangar', x: -146, z: -150, widthM: 22, lengthM: 28, hp: 90 }],
  reference: { source: 'test' },
})

/** An a6m2-zero at rest on the strip's center, facing down a runway on `headingDeg`. */
function parkedZero(o: { readonly headingDeg?: number } = {}): AircraftEntity {
  const state = parkedStateOnRunway(ZERO, strip(o.headingDeg ?? 0), { x: 0, z: 0 }, 100)
  return {
    id: 'ai-1', spec: ZERO, state, previous: state,
    controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 },
    assistMemory: undefined, impact: null, parked: true,
  }
}

const ctx = (o: { readonly terrain: TerrainField | null }, a: AircraftEntity = parkedZero()): TakeoffContext => ({
  nowS: 0, terrain: o.terrain, decks: [], wind: null, combat: createCombat([a]),
})

describe('takeoffControls (pure)', () => {
  it('waits on the brakes when there is no terrain', () => {
    const a = parkedZero()
    const out = takeoffControls(a, startTakeoff(), ctx({ terrain: null }, a), [a])
    expect(out.takeoff!.phase).toBe('wait')
    expect(out.controls).toMatchObject({ throttle: 0, brake: 1, gearDown: true })
  })
  it('latches the runway heading from the parked attitude on the first tick', () => {
    const a = parkedZero({ headingDeg: 0 })
    const out = takeoffControls(a, startTakeoff(), ctx({ terrain: flat }, a), [a])
    expect(out.takeoff!.headingRad).toBeCloseTo(0, 6)
    const east = parkedZero({ headingDeg: 90 })
    expect(takeoffControls(east, startTakeoff(), ctx({ terrain: flat }, east), [east]).takeoff!.headingRad).toBeCloseTo(Math.PI / 2, 6)
  })
  it('goes to roll at full throttle with the brakes off', () => {
    const a = parkedZero()
    const t = takeoffControls(a, startTakeoff(), ctx({ terrain: flat }, a), [a]).takeoff!
    const out = takeoffControls(a, t, ctx({ terrain: flat }, a), [a])
    expect(out.takeoff!.phase).toBe('roll')
    expect(out.controls).toMatchObject({ throttle: 1, brake: 0, gearDown: true, pitch: 0 })
  })
  it('steers the nose toward the latched heading (positive yaw is nose right)', () => {
    const right = parkedZero({ headingDeg: 5 })  // nose 5 degrees right of a north-latched runway
    const t = { phase: 'roll' as const, sinceS: 1, headingRad: 0, pitchIntegral: 0 }
    expect(takeoffControls(right, t, ctx({ terrain: flat }, right), [right]).controls.yaw).toBeLessThan(0)
    const left = parkedZero({ headingDeg: -5 })
    expect(takeoffControls(left, t, ctx({ terrain: flat }, left), [left]).controls.yaw).toBeGreaterThan(0)
  })
})

/*
 * The headless runway takeoffs (Tier 1, real terrain). `takeoff-fixture`
 * parks ai-1 at Dulag's runway-local z +650, the south end of a strip on
 * 000, with 1,400 m ahead; wind 3 m/s from 000, airfield-strike's.
 *
 * Until 7h Task 3 wires `takeoffControls` into `pilotTick`, these fly it
 * here: ai-1's pilot is taken off (so `pilotTick` leaves its controls
 * alone) and each tick's controls are set from the start-of-tick world, as
 * `advance` hands a pilot its snapshot.
 */
const terrain = terrainOrSkip()

/** Along the runway heading from `from` to the strip's far end. */
function runwayAheadM(field: Airfield, from: { readonly x: number; readonly z: number }): number {
  return field.runway.lengthM / 2 + worldToLocal(field, from.x, from.z).z
}
/** Off the centerline, either side. */
const acrossRunway = (field: Airfield, p: { readonly x: number; readonly z: number }): number => Math.abs(worldToLocal(field, p.x, p.z).x)
/** Along the runway heading since `from`. */
function distanceRolled(field: Airfield, from: { readonly x: number; readonly z: number }, p: { readonly x: number; readonly z: number }): number {
  const h = runwayHeadingRad(field)
  return (p.x - from.x) * Math.sin(h) - (p.z - from.z) * Math.cos(h)
}

type Run = { readonly upS: number | null; readonly run10M: number | null; readonly aheadM: number; readonly maxAcrossM: number; readonly impact: string | null }

/** ai-1, as `specId`, flown by `takeoffControls` for up to 60 s. */
function takeoffRun(specId: string, opts: { readonly calm?: boolean } = {}): Run {
  const spec = loadAircraftSpec(specId)
  let w: World<undefined> = worldFromScenario(loadFixtureScenarioBundle('takeoff-fixture'), terrain)
  w = { ...w, wind: opts.calm === true ? null : w.wind, aircraft: w.aircraft.map((a) => a.id === 'ai-1' ? { ...a, spec, pilot: null } : a) }
  w = settledAll(w)
  const field = w.airfields.find((f) => f.id === 'dulag')!
  const start = aircraftById(w, 'ai-1')!.state.position
  let t: TakeoffState | null = startTakeoff()
  let upS: number | null = null, run10M: number | null = null, maxAcrossM = 0
  for (let i = 0; i < 60 * 60 && t !== null; i++) {
    const a = aircraftById(w, 'ai-1')!
    const decks = decksOf(w.ships)
    const out: { controls: Controls; takeoff: TakeoffState | null } = takeoffControls(a, t, { nowS: w.tick * DT, terrain: w.terrain, decks, wind: w.wind, combat: w.combat }, w.aircraft)
    t = out.takeoff
    w = advance(withControls(w, 'ai-1', out.controls), DT).world
    const b = aircraftById(w, 'ai-1')!
    if (b.impact !== null) return { upS, run10M, aheadM: runwayAheadM(field, start), maxAcrossM, impact: `${b.impact.kind} on ${b.impact.surface} at ${(i * DT).toFixed(2)} s` }
    maxAcrossM = Math.max(maxAcrossM, acrossRunway(field, b.state.position))
    if (run10M === null && heightAboveGround(b.state, w.terrain, decks) - spec.gear.heightM >= 10) run10M = distanceRolled(field, start, b.state.position)
    if (t === null) upS = (i + 1) * DT
  }
  return { upS, run10M, aheadM: runwayAheadM(field, start), maxAcrossM, impact: null }
}

describe.skipIf(terrain === null)('runway takeoffs from Dulag (Tier 1, real terrain)', () => {
  it.each(['a6m2-zero', 'f6f-hellcat'])('a %s is 150 m up inside 60 s, never impacts, and stays on the runway', (specId) => {
    const r = takeoffRun(specId)
    expect(r.impact).toBeNull()
    expect(r.upS).not.toBeNull()
    expect(r.upS!).toBeLessThan(60)
    expect(r.maxAcrossM).toBeLessThan(22.5)       // half the runway width
    expect(r.run10M).not.toBeNull()
    expect(r.run10M!).toBeLessThan(r.aheadM)
  }, 60000)
  it('the Zero\'s calm run to 10 m is still ZERO_TAKEOFF_RUN_M (7h Task 4 reads it)', () => {
    const r = takeoffRun('a6m2-zero', { calm: true })
    expect(r.impact).toBeNull()
    expect(Math.abs(r.run10M! - ZERO_TAKEOFF_RUN_M)).toBeLessThan(5)
  }, 60000)
})
