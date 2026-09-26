import { describe, expect, it } from 'vitest'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { autopilotLabel } from '../../src/render/autopilotBadge.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createWorldOf, playerAircraft, type AircraftEntity, type Stepper } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'

/**
 * The production frame path for the pursuit autopilot. The Plan 3 defect
 * class: `tests/sim/ai/autoPursuit.test.ts` calls the module directly, so a
 * Shift that `nextFrameState` never routed would be inert in the browser
 * with all of those green. This reads the command back off the player ENTITY.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
const plane = (id: string, position = v3(0, 1500, 0)): AircraftEntity => {
  const state = createState({ position, velocity: v3(120, 0, 0) })
  return { id, spec: f6f, state, previous: state, controls: { ...NEUTRAL, throttle: 0.6 }, assistMemory: undefined, impact: null, parked: false }
}
/** The bandit is off the right wing, so the autopilot must roll right. */
const start = (...others: AircraftEntity[]) =>
  initialFrameStateFor(createWorldOf({ aircraft: [plane('f6f-1'), ...others], player: 'f6f-1' }))

describe('Shift flies the pursuit autopilot through nextFrameState', () => {
  it('rolls the player toward the enemy and leaves the throttle alone', () => {
    let f = start(plane('bandit', v3(800, 1500, 1200)))
    f = nextFrameState(f, DT, keys('ShiftLeft'), still)
    expect(f.autopilot).toEqual({ target: 'bandit' })
    expect(playerAircraft(f.world).controls.roll).toBeGreaterThan(0.5)
    expect(playerAircraft(f.world).controls.throttle).toBe(0.6)
    expect(autopilotLabel(f.autopilot)).toBe('AUTOPILOT · PURSUIT')
  })

  it('does nothing without the key, and either Shift engages it', () => {
    const f0 = start(plane('bandit', v3(800, 1500, 1200)))
    expect(nextFrameState(f0, DT, keys(), still).autopilot).toBeNull()
    expect(nextFrameState(f0, DT, keys('ShiftRight'), still).autopilot).toEqual({ target: 'bandit' })
  })

  it('stays off while paused', () => {
    let f = start(plane('bandit', v3(800, 1500, 1200)))
    f = nextFrameState(f, DT, keys('Escape'), still)
    f = nextFrameState(f, DT, keys('ShiftLeft'), still)
    expect(f.paused).toBe(true)
    expect(f.autopilot).toBeNull()
  })

  it('reports no target, and holds level, when the only enemy is below the floor', () => {
    let f = start(plane('bandit', v3(800, 100, 1200)))
    f = nextFrameState(f, DT, keys('ShiftLeft'), still)
    expect(f.autopilot).toEqual({ target: null })
    expect(Math.abs(playerAircraft(f.world).controls.roll)).toBeLessThan(0.05)
    expect(autopilotLabel(f.autopilot)).toBe('AUTOPILOT · NO TARGET · LEVEL')
  })

  it('hands the stick back on release, ramping from where the autopilot left it', () => {
    let f = start(plane('bandit', v3(800, 1500, 1200)))
    f = nextFrameState(f, DT, keys('ShiftLeft'), still)
    const held = playerAircraft(f.world).controls.roll
    f = nextFrameState(f, DT, keys(), still)
    expect(f.autopilot).toBeNull()
    const released = playerAircraft(f.world).controls.roll
    expect(released).toBeLessThan(held)
    expect(released).toBeGreaterThan(0)
  })
})
