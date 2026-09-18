import { describe, it, expect } from 'vitest'
import { advance, createWorld, playerAircraft, type Stepper, type World } from '../../src/sim/loop.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { surfaceAt } from '../../src/sim/contact.js'

const spec = loadAircraftSpec('f6f-hellcat')
const header = parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
  finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
})
/** A 1000 m plateau over the whole world. */
const plateau = createTerrainField(header, 12, new Int16Array(9).fill(10000))
const level = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }

describe('terrain contact', () => {
  it('records an impact when the airplane reaches the ground', () => {
    const start = createWorld(spec, createState({ position: v3(0, 1005, 0), velocity: v3(60, -30, 0) }), level)
    let w: World<undefined> = { ...start, terrain: plateau }
    for (let i = 0; i < 60 && playerAircraft(w).impact === null; i++) w = advance(w, DT, undefined).world
    expect(playerAircraft(w).impact).not.toBeNull()
    expect(playerAircraft(w).impact!.groundHeightM).toBeCloseTo(1000, 6)
    expect(playerAircraft(w).impact!.verticalSpeedMps).toBeLessThan(0)
  })

  it('records an impact for a step that lands EXACTLY on the ground, not only below it', () => {
    // The brief's own scenarios all cross the plateau strictly, so a mutant
    // that changes the impact check from `<=` to `<` passes every test above
    // unnoticed (confirmed: `sed -i 's/<= groundHeightM/< groundHeightM/'`
    // against src/sim/loop.ts left all four of the brief's tests green). This
    // test targets the boundary directly with a stub stepper that holds the
    // airplane's position fixed rather than integrating it, so "exactly at
    // ground level" is constructed on purpose instead of relying on a real
    // physics step happening to land there by chance.
    //
    // (0, 0) is verified to make `heightAt(plateau, 0, 0)` come back bit-exact
    // 1000 -- bilinear interpolation of four equal samples is not exact at
    // every (x, z) in IEEE doubles (measured: (33333.3, 66666.6) on this same
    // field returns 999.9999999999999), so the coordinate is not incidental.
    const holdPosition: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
    expect(heightAt(plateau, 0, 0)).toBe(1000)
    const start = createWorld(spec, createState({ position: v3(0, 1000, 0), velocity: v3(0, 0, 0) }), level)
    const w = { ...start, terrain: plateau }
    const result = advance(w, DT, holdPosition)
    const hit = playerAircraft(result.world)
    expect(hit.state.position.y).toBe(1000) // the stub really held it exactly, not approximately
    expect(hit.impact).not.toBeNull()
    expect(hit.impact!.groundHeightM).toBe(1000)
  })

  it('does not record one for an airplane flying above the same ground', () => {
    const start = createWorld(spec, createState({ position: v3(0, 3000, 0), velocity: v3(130, 0, 0) }), level)
    let w: World<undefined> = { ...start, terrain: plateau }
    for (let i = 0; i < 600; i++) w = advance(w, DT).world
    expect(playerAircraft(w).impact).toBeNull()
  })

  it('keeps the first impact rather than overwriting it every step', () => {
    const start = createWorld(spec, createState({ position: v3(0, 500, 0), velocity: v3(60, -10, 0) }), level)
    let w: World<undefined> = { ...start, terrain: plateau }   // already below the plateau
    w = advance(w, DT).world
    const first = playerAircraft(w).impact
    w = advance(w, DT * 10).world
    expect(playerAircraft(w).impact).toBe(first)
  })

  it('changes nothing at all when no terrain is loaded', () => {
    // The whole existing suite runs with terrain: null, so this pins that the
    // null path is byte-identical rather than merely close.
    const start = createWorld(spec, createState({ position: v3(0, 100, 0), velocity: v3(130, -50, 0) }), level)
    const withNull = advance({ ...start, terrain: null }, DT * 5).world
    const withoutField = advance(start, DT * 5).world
    expect(playerAircraft(withNull).state).toEqual(playerAircraft(withoutField).state)
    expect(playerAircraft(withNull).impact).toBeNull()
  })
})

describe('a recorded impact says what it was', () => {
  it('records a high-speed dive into a 1000 m plateau as destroyed on land', () => {
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1005, 0), velocity: v3(60, -30, 0) }),
      level,
    )
    let w: World<undefined> = { ...start, terrain: plateau }
    for (let i = 0; i < 60 && playerAircraft(w).impact === null; i++) w = advance(w, DT, undefined).world
    expect(playerAircraft(w).impact).not.toBeNull()
    expect(playerAircraft(w).impact!.surface).toBe('land')
    expect(playerAircraft(w).impact!.kind).toBe('destroyed')
  })

  it('agrees with surfaceAt on the height it captured', () => {
    // Cross-check by recomputation, the shape the terrain soak already uses:
    // the field on Impact must equal what the classifier says about the height
    // stored beside it, so the two can never drift apart silently.
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1005, 0), velocity: v3(60, -30, 0) }),
      level,
    )
    let w: World<undefined> = { ...start, terrain: plateau }
    for (let i = 0; i < 60 && playerAircraft(w).impact === null; i++) w = advance(w, DT, undefined).world
    expect(playerAircraft(w).impact!.surface).toBe(surfaceAt(playerAircraft(w).impact!.groundHeightM))
  })
})

describe('the flight ends at the contact', () => {
  it('stops stepping the airplane on the step that hits, not at the end of the frame', () => {
    // Five steps are owed in one call; the plateau is one step away. Without
    // the per-entity skip, `advance` runs the remaining four on this airplane
    // and it ends the frame buried far below the ground it hit. The WORLD
    // still runs all five (spec §4: one airplane crashing stops nothing
    // else), which is why `stepsRun` is 5 and the airplane's own tick is not.
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1001, 0), velocity: v3(60, -60, 0) }),
      level,
    )
    const result = advance({ ...start, terrain: plateau }, DT * 5)
    const hit = playerAircraft(result.world)
    expect(hit.impact).not.toBeNull()
    expect(result.stepsRun).toBe(5)
    expect(hit.state.tick).toBeLessThan(result.world.tick)
    expect(hit.state.tick).toBe(hit.impact!.tick)
    expect(hit.state.position).toEqual(hit.impact!.position)
  })

  it('renders exactly at the point of contact, at any interpolation factor', () => {
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1001, 0), velocity: v3(60, -60, 0) }),
      level,
    )
    const result = advance({ ...start, terrain: plateau }, DT * 5)
    expect(playerAircraft(result.world).previous).toEqual(playerAircraft(result.world).state)
  })

  it('leaves a crashed airplane exactly where it was while the world runs on', () => {
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1001, 0), velocity: v3(60, -60, 0) }),
      level,
    )
    const ended = advance({ ...start, terrain: plateau }, DT * 5).world
    const after = advance(ended, DT * 10)
    expect(after.stepsRun).toBe(5)                                             // MAX_STEPS_PER_FRAME: the world ran on
    expect(playerAircraft(after.world).state).toBe(playerAircraft(ended).state) // the crashed airplane did not
    expect(playerAircraft(after.world).impact).toBe(playerAircraft(ended).impact)
  })
})

describe('supported contact does not read as a crash (Task 5b)', () => {
  it('lets a gear-down airplane rest on the ground without recording a crash', () => {
    // The precondition for take-off. Before supportedContact, the constraint
    // clamped the airplane exactly onto the surface and `advance`'s geometric
    // `y <= groundHeight` test then fired every tick, so sitting on a runway
    // raised the crash debrief.
    //
    // Position `1000 + spec.gear.heightM`, not `1000` (Task 15): the body
    // origin of an airplane actually parked on the 1000 m plateau sits
    // `spec.gear.heightM` above it, not on it -- spawning at exactly `1000`
    // would put the origin `spec.gear.heightM` BELOW the surface, which
    // `advance`'s raw `position.y <= groundHeightM` check (deliberately
    // gear-agnostic, see that check's own comment in src/sim/loop.ts) reads
    // as a crash on the very first step.
    const parkedHeightM = 1000 + spec.gear.heightM
    const parked = createState({ position: v3(0, parkedHeightM, 0), velocity: v3(0, 0, 0), gearFraction: 1 })
    let w: World<undefined> = { ...createWorld(spec, parked, level), terrain: plateau }
    for (let i = 0; i < 120; i++) w = advance(w, DT).world
    expect(playerAircraft(w).impact).toBeNull()
    expect(playerAircraft(w).state.position.y).toBeCloseTo(parkedHeightM, 6)
  })
})

describe('supported contact requires land (Task 16, Mark drove off the runway onto the ocean)', () => {
  // A small, bespoke field rather than reusing `plateau` (uniform everywhere,
  // no coastline to drive off of): a 17x17 grid, 50 m spacing (finestSamples
  // must be `(2^k)+1` with `levels === k`, `parseTerrainHeader`'s own
  // validation), land (`LAND_M`) for x <= -50 and water (`WATER_M`,
  // comfortably below `SEA_LEVEL_M`) for x >= 0, with a single 50 m cell of
  // bilinear ramp between the two columns either side of x = 0 -- an 8%
  // grade, gentle enough that this test is about the land/water gate, not
  // the separate steep-terrain sink-through gap `tools/soak/run.ts`
  // documents.
  const coastHeader = parseTerrainHeader({
    centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 400,
    finestSamples: 17, levels: 4, encoding: 'int16-decimetres',
  })
  const LAND_M = 2
  const WATER_M = -2
  const COAST_SAMPLES = 17
  const LAND_COLUMNS = 8 // columns 0..7 -> x = -400 .. -50
  const coastHeights = new Int16Array(COAST_SAMPLES * COAST_SAMPLES)
  for (let row = 0; row < COAST_SAMPLES; row++) {
    for (let col = 0; col < COAST_SAMPLES; col++) {
      coastHeights[row * COAST_SAMPLES + col] = (col < LAND_COLUMNS ? LAND_M : WATER_M) * 10
    }
  }
  const coast = createTerrainField(coastHeader, 0, coastHeights)
  const rollingLevel = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

  it('drives off the end of the runway onto the water and crashes, instead of rolling on', () => {
    expect(heightAt(coast, -200, 0)).toBeCloseTo(LAND_M, 6)
    expect(heightAt(coast, 200, 0)).toBeCloseTo(WATER_M, 6)
    expect(surfaceAt(heightAt(coast, 200, 0))).toBe('water')

    // Parked on the wheels, deep in the land zone, then rolled at speed
    // toward the coastline -- the shape of a take-off run overshooting the
    // runway, not a controlled water landing (that path is `contactOutcome`,
    // untouched by this fix, and already covered by `tests/sim/contact.test.ts`).
    const rollSpeedMps = 90
    const rollingOffTheEnd = createState({
      position: v3(-200, LAND_M + spec.gear.heightM, 0),
      velocity: v3(rollSpeedMps, 0, 0),
      gearFraction: 1,
    })
    let w: World<undefined> = { ...createWorld(spec, rollingOffTheEnd, rollingLevel), terrain: coast }

    // Still over land, still rolling: no impact yet. (150 m at 90 m/s is
    // about 100 ticks; stop comfortably short of the coastline at x = -50.)
    for (let i = 0; i < 90 && playerAircraft(w).impact === null; i++) w = advance(w, DT).world
    expect(playerAircraft(w).impact, 'crashed while still over land').toBeNull()
    expect(playerAircraft(w).state.position.x).toBeLessThan(-50)

    // Keep rolling across the coastline and onto the water.
    for (let i = 0; i < 300 && playerAircraft(w).impact === null; i++) w = advance(w, DT).world

    expect(playerAircraft(w).impact, 'kept rolling on top of the water instead of crashing').not.toBeNull()
    expect(surfaceAt(playerAircraft(w).impact!.groundHeightM)).toBe('water')
    expect(playerAircraft(w).impact!.kind).toBe('destroyed')
  })
})
