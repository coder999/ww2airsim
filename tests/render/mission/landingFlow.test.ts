import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { landingDisposition } from '../../../src/render/mission/landingFlow.js'
import { initialFrameStateFor, nextFrameState, acknowledgeLanding, type FrameState } from '../../../src/render/frame.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario, loadAircraftSpec, loadAirfield } from '../../../tools/content/load.js'
import { withAircraftState } from '../../../src/sim/loop.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { radioMessages } from '../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../src/sim/mission/outcome.js'
import { NORTH, flatField } from '../../sim/mission/fixture.js'
import type { TerrainField } from '../../../src/sim/world/terrain.js'
import type { MissionState } from '../../../src/sim/mission/state.js'

describe('landingDisposition (M2 R2)', () => {
  it('debrief without a mission', () => {
    expect(landingDisposition(null, -1).kind).toBe('debrief')
  })
  it('intermediate for a new landing with intermediate: true', () => {
    const m = { log: [{ tick: 10, kind: 'landing', at: null, advanced: 'circuit', intermediate: true }] } as unknown as MissionState<unknown>
    const d = landingDisposition(m, -1)
    expect(d.kind).toBe('intermediate')
    expect(d.tick).toBe(10)
  })
  it('debrief for a new landing that completes the objective', () => {
    const m = { log: [{ tick: 10, kind: 'landing', at: null, advanced: 'circuit', intermediate: false }] } as unknown as MissionState<unknown>
    const d = landingDisposition(m, -1)
    expect(d.kind).toBe('debrief')
    expect(d.tick).toBe(10)
  })
  it('debrief when the newest landing was already handled (tick <= handledTick)', () => {
    const m = { log: [{ tick: 10, kind: 'landing', at: null, advanced: 'circuit', intermediate: true }] } as unknown as MissionState<unknown>
    const d = landingDisposition(m, 10)
    expect(d.kind).toBe('debrief')
    expect(d.tick).toBe(10)
  })
})

// Measured (probe .superpowers/m2-plan/landing-order.ts): the mission logs a
// landing on or before the frame that raises `landing.report`, at both 1
// and 3 ticks per frame. `landingDisposition` reads the mission's log
// rather than the frame for exactly that reason (plan ruling R2).
const GEAR_M = loadAircraftSpec('f6f-hellcat').gear.heightM
const TAC = loadAirfield('tacloban').runway.center

function frameFor(terrain: TerrainField | null): FrameState {
  const raw = {
    id: 'p', player: 'f6f-1', airfields: ['tacloban'],
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [TAC.x, 500, TAC.z], headingDeg: 0, speedMps: 60 } }],
    ships: [], weather: { windFromDeg: 0, windMps: 0 },
    objectives: [{ id: 'circuit', label: 'Circuit', priority: 'primary', kind: 'land', at: 'tacloban', count: 2 }],
  }
  return initialFrameStateFor(worldFromScenario(bundleForScenario(parseScenario(raw)), terrain))
}

function put(f: FrameState, x: number, y: number, z: number, speed: number, sink: number): FrameState {
  return {
    ...f,
    world: withAircraftState(f.world, f.world.player, createState({
      position: v3(x, y, z), velocity: v3(0, -sink, -speed), attitude: NORTH, gearFraction: 1, flapFraction: 1, tick: f.world.tick,
    })),
  }
}

function land(f0: FrameState, dt: number): FrameState {
  const x = TAC.x
  const z = TAC.z
  const gy = 100
  let g = nextFrameState(put(f0, x, gy + GEAR_M + 50, z, 45, 0), dt, new Set())
  g = put(g, x, gy + GEAR_M + 0.4, z, 30, 1)
  let i = 0
  for (; i < 200 && g.landing.touchdown === null; i++) g = nextFrameState(g, dt, new Set())
  g = put(g, x, gy + GEAR_M, z, 0, 0)
  let frames = 0
  while (g.landing.report === null && frames < 50) {
    g = nextFrameState(g, dt, new Set())
    frames++
  }
  return g
}

describe('through production nextFrameState (Review Focus 3)', () => {
  it.each([1, 3])('%i tick(s) per frame: landing 1 of 2 is intermediate, landing 2 is the debrief', (ticks) => {
    const dt = ticks / 60
    let frame = frameFor(flatField(100))
    frame = land(frame, dt)
    expect(frame.landing.report).not.toBeNull()
    const mission = frame.world.mission!
    const first = landingDisposition(mission, -1)
    expect(first.kind).toBe('intermediate')
    expect(radioMessages(mission).at(-1)!.text).toBe('Circuit 1 of 2')

    frame = acknowledgeLanding(frame)
    // Re-latch airborne, one frame, then land again.
    frame = put(frame, TAC.x, 500, TAC.z, 60, 0)
    frame = nextFrameState(frame, dt, new Set())
    frame = land(frame, dt)
    expect(frame.landing.report).not.toBeNull()
    const mission2 = frame.world.mission!
    const second = landingDisposition(mission2, first.tick)
    expect(second.kind).toBe('debrief')
    expect(missionOutcome(mission2, recoveryOf(frame.world)!).result).toBe('success')
  })

  it('a fresh handled tick of -1 treats the first landing as new', () => {
    let frame = frameFor(flatField(100))
    frame = land(frame, 1 / 60)
    const mission = frame.world.mission!
    expect(landingDisposition(mission, -1).kind).toBe('intermediate')
  })
})

describe('main.ts resets the handled landing tick and the mission HUD (controller ruling PF7)', () => {
  const main = readFileSync(new URL('../../../src/render/main.ts', import.meta.url), 'utf8')
  const start = main.indexOf('const resetFlightUi = (): void => {')
  const end = main.indexOf('\n  }', start)
  const body = main.slice(start, end)
  it('found the function', () => {
    expect(start).toBeGreaterThan(-1)
  })
  it('resets handledLandingTick and the mission HUD', () => {
    expect(body).toContain('handledLandingTick = -1')
    expect(body).toContain('missionHud.reset()')
  })
})
