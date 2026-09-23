import { describe, it, expect } from 'vitest'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { audioInputsFrom } from '../../src/render/audio.js'
import { combatDiagnosticsFor } from '../../src/render/combatReadout.js'
import { loadAircraftSpec, loadScenarioBundle } from '../../tools/content/load.js'
import { createWorldOf, playerAircraft, type AircraftEntity, type Stepper } from '../../src/sim/loop.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { createState } from '../../src/sim/flight/state.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'

/**
 * The production frame path for the guns (Plan 6 acceptance: "Test the
 * production `advance` and `nextFrameState` paths"). The Plan 3 defect class
 * this guards against: every combat test in tests/sim/weapons drives
 * `advance` directly, so a `Controls.fire` that `nextFrameState` never set
 * would leave Space inert in the browser with all of them green.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
/** Holds every airplane where it is: the trigger is what is under test. */
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
const plane = (id: string, x: number): AircraftEntity => {
  const state = createState({ position: v3(x, 1000, 0) })
  return { id, spec: f6f, state, previous: state, controls: NEUTRAL, assistMemory: undefined, impact: null, parked: false }
}
const start = () => initialFrameStateFor(createWorldOf({ aircraft: [plane('f6f-1', 0), plane('target', 300)], player: 'f6f-1' }))

describe('Space fires through nextFrameState (Plan 6)', () => {
  it('reaches the player entity as Controls.fire and consumes ammunition in the fixed step', () => {
    let f = start()
    f = nextFrameState(f, DT, keys('Space'), still)
    expect(playerAircraft(f.world).controls.fire).toBe(true)
    expect(f.controls).toBe(playerAircraft(f.world).controls)
    const d = combatDiagnosticsFor(f)
    expect(d.player.firing).toBe(true)
    expect(d.player.shots).toBe(6)
    expect(d.player.ammo).toBe(2394)
    expect(d.projectiles).toBe(6)
    expect(audioInputsFrom(f).shots).toBe(6)
  })

  it('stops on release, and a paused frame neither fires nor moves the rounds', () => {
    let f = start()
    for (let i = 0; i < 30; i++) f = nextFrameState(f, DT, keys('Space'), still)
    const shots = combatDiagnosticsFor(f).player.shots
    expect(shots).toBeGreaterThan(0)
    f = nextFrameState(f, DT, keys(), still)
    expect(playerAircraft(f.world).controls.fire).toBe(false)
    for (let i = 0; i < 30; i++) f = nextFrameState(f, DT, keys(), still)
    expect(combatDiagnosticsFor(f).player.shots).toBe(shots)
    // Pause, then hold Space: the world is held, so nothing leaves the guns.
    f = nextFrameState(f, DT, keys('Escape'), still)
    expect(f.paused).toBe(true)
    const rounds = f.world.combat.projectiles
    for (let i = 0; i < 30; i++) f = nextFrameState(f, DT, keys('Space'), still)
    expect(combatDiagnosticsFor(f).player.shots).toBe(shots)
    expect(f.world.combat.projectiles).toBe(rounds)
  })

  it('holds the world once the player is destroyed, the way an impact does', () => {
    let f = start()
    const rec = f.world.combat.aircraft['f6f-1']!
    f = {
      ...f,
      world: { ...f.world, combat: { ...f.world.combat, aircraft: { ...f.world.combat.aircraft, 'f6f-1': { ...rec, damage: { ...rec.damage, structure: 0, destroyedAt: 5, attacker: 'target' } } } } },
    }
    const tick = f.world.tick
    for (let i = 0; i < 10; i++) f = nextFrameState(f, DT, keys('Space'), still)
    expect(f.world.tick).toBe(tick)
    expect(f.stepsRun).toBe(0)
  })

  it('restarts with a full load and an empty sky, from the same scenario constructor the browser uses', () => {
    // Restart rebuilds the world (`buildWorld` in main.ts) rather than
    // patching it, and `createWorldOf` builds a fresh `combat` every time.
    const bundle = loadScenarioBundle('gunnery-range')
    let f = initialFrameStateFor({ ...worldFromScenario(bundle, null), aircraft: worldFromScenario(bundle, null).aircraft.map((a) => ({ ...a, parked: false })) })
    f = { ...f, groundSpawn: false }
    for (let i = 0; i < 30; i++) f = nextFrameState(f, DT, keys('Space'), still)
    expect(combatDiagnosticsFor(f).player.ammo).toBeLessThan(2400)
    const restarted = initialFrameStateFor(worldFromScenario(bundle, null))
    const d = combatDiagnosticsFor(restarted)
    expect(d.player).toEqual({
      shots: 0, hits: 0, kills: 0, ammo: 2400, structure: 1, destroyed: false, firing: false,
      stores: { bombs: 0, rockets: 0 }, shipsSunk: 0, structuresDestroyed: 0,
      stress: {
        loadFactorG: 1, airspeedMps: 0, overG: false, overspeed: false,
        peakLoadFactorG: 1, peakAirspeedMps: 0,
      },
    })
    expect(d.projectiles).toBe(0)
    expect(d.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'target-1', 'target-2'])
    expect(d.aircraft.every((a) => a.structure === 1 && !a.destroyed)).toBe(true)
  })
})
