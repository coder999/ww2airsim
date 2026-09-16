import { describe, it, expect } from 'vitest'
import { advance, createWorld, type Stepper, type World } from '../../src/sim/loop.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

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
    for (let i = 0; i < 60 && w.impact === null; i++) w = advance(w, DT, undefined).world
    expect(w.impact).not.toBeNull()
    expect(w.impact!.groundHeightM).toBeCloseTo(1000, 6)
    expect(w.impact!.verticalSpeedMps).toBeLessThan(0)
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
    expect(result.world.aircraft.position.y).toBe(1000) // the stub really held it exactly, not approximately
    expect(result.world.impact).not.toBeNull()
    expect(result.world.impact!.groundHeightM).toBe(1000)
  })

  it('does not record one for an airplane flying above the same ground', () => {
    const start = createWorld(spec, createState({ position: v3(0, 3000, 0), velocity: v3(130, 0, 0) }), level)
    let w: World<undefined> = { ...start, terrain: plateau }
    for (let i = 0; i < 600; i++) w = advance(w, DT).world
    expect(w.impact).toBeNull()
  })

  it('keeps the first impact rather than overwriting it every step', () => {
    const start = createWorld(spec, createState({ position: v3(0, 500, 0), velocity: v3(60, -10, 0) }), level)
    let w: World<undefined> = { ...start, terrain: plateau }   // already below the plateau
    w = advance(w, DT).world
    const first = w.impact
    w = advance(w, DT * 10).world
    expect(w.impact).toBe(first)
  })

  it('changes nothing at all when no terrain is loaded', () => {
    // The whole existing suite runs with terrain: null, so this pins that the
    // null path is byte-identical rather than merely close.
    const start = createWorld(spec, createState({ position: v3(0, 100, 0), velocity: v3(130, -50, 0) }), level)
    const withNull = advance({ ...start, terrain: null }, DT * 5).world
    const withoutField = advance(start, DT * 5).world
    expect(withNull.aircraft).toEqual(withoutField.aircraft)
    expect(withNull.impact).toBeNull()
  })
})
