import { describe, it, expect } from 'vitest'
import { initialFrameState, initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { ORBIT_ZERO, NO_MOUSE } from '../../src/input/orbit.js'
import { ORBIT_SURFACE_CLEARANCE_M } from '../../src/render/camera.js'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createWorldOf, type ShipEntity } from '../../src/sim/loop.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { deckOf, deckWorld, decksOf } from '../../src/sim/world/deck.js'
import { groundUnder } from '../../src/sim/world/ground.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const FRAME = 1 / 60
const start = (y = 3000) => initialFrameState(f6f, createState({ position: v3(0, y, 0), velocity: v3(120, 0, 0) }))
const drag = (dxPx: number, dyPx: number) => ({ ...NO_MOUSE, dxPx, dyPx })

/** Orbit camera spec 2026-09-27: §3 (surface clamp), §4 (mouse), §5 and OC-4 (the C cycle). */
describe('orbit in the frame', () => {
  it('starts at ORBIT_ZERO', () => {
    expect(start().orbit).toBe(ORBIT_ZERO)
  })

  it('a drag in chase moves the orbit and the eye', () => {
    const f0 = nextFrameState(start(), FRAME, keys())
    const f1 = nextFrameState(f0, FRAME, keys(), undefined, false, drag(200, 0))
    expect(f1.orbit.yawRad).toBeGreaterThan(0)
    expect(f1.eye.position).not.toEqual(nextFrameState(f0, FRAME, keys()).eye.position)
  })

  it('the mouse does nothing in cockpit view', () => {
    let f = nextFrameState(start(), FRAME, keys('KeyC')) // -> cockpit
    f = nextFrameState(f, FRAME, keys(), undefined, false, drag(200, 100))
    expect(f.cameraMode).toBe('cockpit')
    expect(f.orbit).toBe(ORBIT_ZERO)
  })

  it('C to cockpit and back lands on the default view (spec OC-4)', () => {
    let f = nextFrameState(start(), FRAME, keys(), undefined, false, drag(300, -80))
    expect(f.orbit).not.toBe(ORBIT_ZERO)
    f = nextFrameState(f, FRAME, keys('KeyC'))
    f = nextFrameState(f, FRAME, keys())
    f = nextFrameState(f, FRAME, keys('KeyC'))
    expect(f.cameraMode).toBe('chase')
    expect(f.orbit).toBe(ORBIT_ZERO)
  })

  it('a rebuilt frame (Restart / New game) starts at ORBIT_ZERO', () => {
    const dragged = nextFrameState(start(), FRAME, keys(), undefined, false, drag(300, 0))
    expect(initialFrameStateFor(dragged.world).orbit).toBe(ORBIT_ZERO)
  })

  it('low over the sea, a full downward drag holds the eye at the clearance', () => {
    const f = nextFrameState(start(30), FRAME, keys(), undefined, false, { ...drag(0, -1e6), wheelNotches: 50 })
    expect(f.eye.position.y).toBeGreaterThanOrEqual(ORBIT_SURFACE_CLEARANCE_M - 1e-9)
  })

  // Plan Review Focus 4. Built as audioInputs.test.ts's "reads a carrier DECK" case builds it.
  it('parked on the carrier, a full downward drag stops at the DECK + clearance, not the sea', () => {
    const cv = loadShipSpec('essex-cv')
    const shipState = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
    const carrier: ShipEntity = {
      id: 'cv-1', spec: cv, state: shipState, previous: shipState,
      orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -3000 }], speedMps: 7.717 },
    }
    const deck = deckOf(carrier)!
    const spot = deckWorld(deck, 0, -110)
    const parked = createState({ position: v3(spot.x, deck.center.y + f6f.gear.heightM, spot.z), velocity: deck.velocity, gearFraction: 1 })
    const world = createWorldOf<undefined>({
      aircraft: [{ id: 'player', spec: f6f, state: parked, previous: parked, controls: NEUTRAL, assistMemory: undefined, impact: null, parked: true }],
      ships: [carrier],
      player: 'player',
    })
    // Zoom 1 at -80 deg keeps the eye ~8 m horizontally from the airplane, well inside the deck.
    const f = nextFrameState(initialFrameStateFor(world), FRAME, keys(), undefined, false, drag(0, -1e6))
    const under = groundUnder(f.world.terrain, decksOf(f.world.ships), f.eye.position.x, f.eye.position.z)
    expect(under?.surface).toBe('deck')
    expect(f.eye.position.y).toBeGreaterThanOrEqual(deck.center.y + ORBIT_SURFACE_CLEARANCE_M - 1e-9)
  })
})
