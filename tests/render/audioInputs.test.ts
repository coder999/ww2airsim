import { describe, it, expect } from 'vitest'
import { audioInputsFrom } from '../../src/render/audio.js'
import { initialFrameState, initialFrameStateFor } from '../../src/render/frame.js'
import { createWorldOf, playerAircraft, type ShipEntity } from '../../src/sim/loop.js'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { deckOf, deckWorld } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { createTerrainField, SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader } from '../../tools/terrain/load.js'
import { v3 } from '../../src/sim/math/vec3.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const header = loadTerrainHeader()
/** A field that is flat sea level everywhere, so a height is a known quantity
 *  rather than whatever Leyte happens to be under the test's coordinates. */
const flatField = (): ReturnType<typeof createTerrainField> =>
  createTerrainField(header, 2, new Int16Array(2049 * 2049))

describe('audioInputsFrom (design §6.1)', () => {
  it('reports onGround as null until a terrain field has arrived', () => {
    // NOT false. A ground spawn is held at zero elapsed time until the
    // heightfield lands seconds later (`FrameState.groundSpawn`), so `false`
    // here would make the arrival a false -> true transition and open every
    // flight with a landing squeak.
    const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
    expect(frame.world.terrain).toBeNull()
    expect(audioInputsFrom(frame).onGround).toBeNull()
  })

  it('reads the throttle the SIMULATION was given, not a separate copy', () => {
    // frame.controls is the identical object the player entity's controls holds
    // (frame.ts),
    // and reading it here is what makes a wire-not-connected bug visible.
    const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
    expect(frame.controls).toBe(playerAircraft(frame.world).controls)
    expect(audioInputsFrom(frame).throttle).toBe(playerAircraft(frame.world).controls.throttle)
  })

  it("reports engineRunning false once the player's impact is set, and carries the kind through", () => {
    const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
    expect(audioInputsFrom(frame).engineRunning).toBe(true)
    expect(audioInputsFrom(frame).impact).toBeNull()

    // On the player ENTITY since Plan 12: `World` itself no longer carries an
    // impact, because one airplane crashing does not stop the war (spec §4).
    const ditched = {
      ...frame,
      world: {
        ...frame.world,
        aircraft: frame.world.aircraft.map((a) => ({
          ...a,
          impact: {
            tick: 77, kind: 'ditched' as const, position: v3(0, 0, 0),
            verticalSpeedMps: -3, groundHeightM: 0, surface: 'water' as const,
          },
        })),
      },
    }
    const inputs = audioInputsFrom(ditched)
    expect(inputs.engineRunning).toBe(false)
    // `surface` travels with it: it, not `kind`, chooses the cue, because
    // `contactOutcome` calls a hard arrival on water 'destroyed' too.
    expect(inputs.impact).toEqual({ tick: 77, kind: 'ditched', surface: 'water' })
  })

  it("evaluates onGround at the airplane's own (x, z), gear offset included", () => {
    // `onGround` compares position.y - spec.gear.heightM against the ground,
    // not position.y (src/sim/ground.ts). An airplane sitting on its wheels
    // over a sea-level field is therefore ON the ground at y = gear.heightM,
    // and clearly airborne a kilometre up.
    const parked = initialFrameState(
      f6f, createState({ position: v3(0, f6f.gear.heightM, 0), gearFraction: 1 }), undefined, flatField(), true)
    expect(audioInputsFrom(parked).onGround).toBe(true)

    const airborne = initialFrameState(
      f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }), undefined, flatField())
    expect(audioInputsFrom(airborne).onGround).toBe(false)
  })

  it('reports the surface under the airplane, so wheels never squeak on the sea', () => {
    // A field of zeros IS open water by `surfaceAt`, and `onGround` is true
    // over it at wheel height -- which is the whole trap: touching the sea
    // reads as touching the ground, one or more frames before `advance`
    // registers an impact.
    const overSea = initialFrameState(
      f6f, createState({ position: v3(0, f6f.gear.heightM, 0), gearFraction: 1 }), undefined, flatField(), true)
    const inputs = audioInputsFrom(overSea)
    expect(inputs.onGround).toBe(true)
    expect(inputs.groundSurface).toBe('water')
    expect(audioInputsFrom(initialFrameState(f6f, createState({ position: v3(0, 1000, 0) }))).groundSurface).toBeNull()
  })

  it('reads a carrier DECK as hard ground under the airplane (Plan 8 review)', () => {
    // One ground model. This adapter called `heightAt`/`surfaceAt` directly,
    // which knows only terrain: an airplane chocked on a flight deck with no
    // terrain loaded read `onGround: null` (no terrain -> "no ground yet"),
    // so a trap could never squeak and a deck run opened airborne.
    // `groundUnder(terrain, decksOf(ships), ...)` is the model `landing.ts`,
    // `main.ts` and `step()` itself already share.
    const cv = loadShipSpec('essex-cv')
    const shipState = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
    const carrier: ShipEntity = {
      id: 'cv-1', spec: cv, state: shipState, previous: shipState,
      orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -3000 }], speedMps: 7.717 },
    }
    const deck = deckOf(carrier)!
    const spot = deckWorld(deck, 0, -110)
    const parked = createState({
      position: v3(spot.x, deck.center.y + f6f.gear.heightM, spot.z),
      velocity: deck.velocity,
      gearFraction: 1,
    })
    const world = createWorldOf<undefined>({
      aircraft: [{ id: 'player', spec: f6f, state: parked, previous: parked, controls: NEUTRAL, assistMemory: undefined, impact: null, parked: true }],
      ships: [carrier],
      player: 'player',
    })
    const inputs = audioInputsFrom(initialFrameStateFor(world))
    expect(world.terrain).toBeNull()
    expect(inputs.onGround).toBe(true)
    expect(inputs.groundSurface).toBe('deck')
  })

  it('carries the tick, which is how a restart is told from a landing', () => {
    const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
    expect(audioInputsFrom(frame).tick).toBe(frame.world.tick)
  })
})
