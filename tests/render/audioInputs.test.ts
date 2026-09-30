import type { CombatImpact } from '../../src/sim/weapons/impacts.js'
import { describe, it, expect } from 'vitest'
import { audioInputsFrom, spatialInputsFrom } from '../../src/render/audio.js'
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
import { qFromAxisAngle, qIdentity } from '../../src/sim/math/quat.js'

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

  it('reports wheel height and sink rate for the touchdown latch (T1, 2026-09-28)', () => {
    const frame = initialFrameState(
      f6f, createState({ position: v3(0, 1000, 0), velocity: v3(60, -2, 0) }), undefined, flatField())
    const inputs = audioInputsFrom(frame)
    expect(inputs.heightM).toBeGreaterThan(990)
    expect(inputs.heightM).toBeLessThan(1000)
    expect(inputs.sinkMps).toBeCloseTo(2, 9)
    const climbing = initialFrameState(
      f6f, createState({ position: v3(0, 1000, 0), velocity: v3(60, 3, 0) }), undefined, flatField())
    expect(audioInputsFrom(climbing).sinkMps).toBeCloseTo(-3, 9)
  })

  it('carries the tick, which is how a restart is told from a landing', () => {
    const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
    expect(audioInputsFrom(frame).tick).toBe(frame.world.tick)
  })
})

it("carries the player's shot count from World.combat, which is what the gun cue follows (Plan 6)", () => {
  const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
  expect(audioInputsFrom(frame).shots).toBe(0)
  const rec = frame.world.combat.aircraft[frame.world.player]!
  const fired = {
    ...frame,
    world: { ...frame.world, combat: { ...frame.world.combat, aircraft: { [frame.world.player]: { ...rec, shots: 42 } } } },
  }
  expect(audioInputsFrom(fired).shots).toBe(42)
})

it('carries the cumulative bombsDropped/rocketsFired counts, not the falling stores count (Plan 6b Task 10)', () => {
  const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
  expect(audioInputsFrom(frame).bombsDropped).toBe(0)
  expect(audioInputsFrom(frame).rocketsFired).toBe(0)
  const rec = frame.world.combat.aircraft[frame.world.player]!
  // `stores` FALLS as ordnance leaves the racks/rails, so it cannot be what
  // the release cue follows -- only a count that only ever rises can be an
  // edge. This sets `stores` down and the new cumulative fields up, so a
  // wiring mistake that read `stores` instead would read the wrong number.
  const fired = {
    ...frame,
    world: {
      ...frame.world,
      combat: {
        ...frame.world.combat,
        aircraft: { [frame.world.player]: { ...rec, stores: { bombs: 0, rockets: 0 }, bombsDropped: 3, rocketsFired: 7 } },
      },
    },
  }
  expect(audioInputsFrom(fired).bombsDropped).toBe(3)
  expect(audioInputsFrom(fired).rocketsFired).toBe(7)
})

it('carries damage, hook, arrest and engine family from the world the sim ran (audio expansion)', () => {
  const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
  const quiet = audioInputsFrom(frame)
  expect(quiet).toMatchObject({ engineFamily: 'radial', structure: 1, engineHealth: 1, arrested: false, hookDown: false })

  const rec = frame.world.combat.aircraft[frame.world.player]!
  const player = playerAircraft(frame.world)
  const hurt = {
    ...frame,
    controls: { ...frame.controls, hookDown: true },
    world: {
      ...frame.world,
      aircraft: frame.world.aircraft.map((a) => (a === player ? { ...a, state: { ...a.state, arrested: true } } : a)),
      combat: { ...frame.world.combat, aircraft: { [frame.world.player]: { ...rec, damage: { ...rec.damage, structure: 0.4, engine: 0.2 } } } },
    },
  }
  expect(audioInputsFrom(hurt)).toMatchObject({ structure: 0.4, engineHealth: 0.2, hookDown: true, arrested: true })
})

it('reads the engine family off the aircraft the world flies', () => {
  const p38 = loadAircraftSpec('p-38-lightning')
  const frame = initialFrameState(p38, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
  expect(audioInputsFrom(frame).engineFamily).toBe('allison')
})

it('reports the newest round that struck an aircraft at the player, never a blast, another surface or a far one', () => {
  const frame = initialFrameState(loadAircraftSpec('a6m2-zero'), createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
  const at = (x: number) => v3(x, 1000, 0)
  const withImpacts = (impacts: CombatImpact[]) => ({ ...frame, world: { ...frame.world, combat: { ...frame.world.combat, impacts } } })
  const round = { tick: 7, cause: 'round', outcome: 'detonated', surface: 'aircraft', point: at(5) } as const
  expect(audioInputsFrom(frame).damage.round).toBeUndefined()
  expect(audioInputsFrom(withImpacts([round])).damage.round).toEqual({ tick: 7 })
  expect(audioInputsFrom(withImpacts([round, { ...round, tick: 9, cause: 'bomb' }])).damage.round?.tick).toBe(7)
  expect(audioInputsFrom(withImpacts([round, { ...round, tick: 9, surface: 'water' }])).damage.round?.tick).toBe(7)
  expect(audioInputsFrom(withImpacts([{ ...round, point: at(500) }])).damage.round).toBeUndefined()
  const bomb = { tick: 9, cause: 'bomb', outcome: 'detonated', surface: 'ship', point: at(200) } as const
  expect(audioInputsFrom(withImpacts([round, bomb])).damage).toEqual({ round: { tick: 7 }, blast: { tick: 9 } })
  expect(audioInputsFrom(withImpacts([{ ...bomb, outcome: 'expired' }])).damage.blast).toBeUndefined()
  expect(audioInputsFrom(withImpacts([{ ...bomb, point: at(20_000) }])).damage.blast).toBeUndefined()
})

describe('spatialInputsFrom (spatial audio)', () => {
  const base = () => initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))

  it('points the listener where the camera looks, from its attitude', () => {
    const frame = base()
    const ahead = spatialInputsFrom(frame, { position: v3(5, 6, 7), attitude: qIdentity() }).listener
    expect(ahead.position).toEqual(v3(5, 6, 7))
    expect(ahead.forward.x).toBeCloseTo(1, 9)
    expect(ahead.up.y).toBeCloseTo(1, 9)
    // Yawed a quarter turn about +Y: body +X now points along -Z (north).
    const north = spatialInputsFrom(frame, { position: v3(0, 0, 0), attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2) }).listener
    expect(north.forward.z).toBeCloseTo(-1, 9)
    expect(ahead.velocity).toEqual(playerAircraft(frame.world).state.velocity)
  })

  it('lists other aircraft that are still flying, never the player, and detonations but not rounds', () => {
    const frame = base()
    const player = playerAircraft(frame.world)
    const other = { ...player, id: 'wing' }
    const impact = (cause: CombatImpact['cause'], outcome: CombatImpact['outcome']): CombatImpact =>
      ({ tick: 3, cause, outcome, surface: 'water', point: v3(1, 2, 3) })
    const world = {
      ...frame.world,
      aircraft: [player, other, { ...player, id: 'dead' }],
      combat: {
        ...frame.world.combat,
        aircraft: {
          ...frame.world.combat.aircraft,
          wing: { ...frame.world.combat.aircraft[frame.world.player]!, shots: 9 },
          dead: { ...frame.world.combat.aircraft[frame.world.player]!, damage: { ...frame.world.combat.aircraft[frame.world.player]!.damage, destroyedAt: 5 } },
        },
        impacts: [impact('round', 'detonated'), impact('bomb', 'expired'), impact('bomb', 'detonated')],
      },
    }
    const out = spatialInputsFrom({ world }, { position: v3(0, 0, 0), attitude: qIdentity() })
    expect(out.aircraft.map((a) => a.id)).toEqual(['wing'])
    expect(out.aircraft[0]).toMatchObject({ shots: 9, family: 'radial' })
    expect(out.blasts).toEqual([{ tick: 3, surface: 'water', position: v3(1, 2, 3) }])
  })
})
