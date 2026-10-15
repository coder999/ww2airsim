import { describe, expect, it } from 'vitest'
import { recoveryFactsAt } from '../../src/sim/recovery.js'
import { createWorldOf, type AircraftEntity, type ShipEntity } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createShipState } from '../../src/sim/world/ships.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const destroyer = loadShipSpec('fletcher-dd')
const player: AircraftEntity<undefined> = {
  id: 'player', spec: f6f,
  state: createState({ position: v3(0, 1000, 0) }),
  previous: createState({ position: v3(0, 1000, 0) }),
  controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 },
  assistMemory: undefined, impact: null, parked: false, side: 'allied',
}
const shipAt = (id: string, x: number, side: 'allied' | 'axis'): ShipEntity => ({
  id, spec: destroyer,
  state: createShipState({ position: v3(x, 0, 0) }),
  previous: createShipState({ position: v3(x, 0, 0) }),
  orders: { waypoints: [{ x, z: 0 }], speedMps: 0 }, side,
})

describe('world recovery context', () => {
  it('uses canonical side and support distance for friendly water coverage', () => {
    const world = createWorldOf({ aircraft: [player], player: player.id, ships: [shipAt('rescue', 5_000, 'allied')] })
    expect(recoveryFactsAt(world, v3(0, 0, 0), 'water', 7)).toMatchObject({
      seed: 7, surface: 'water', control: 'friendly', friendlyRescuePresent: true, friendlySupportM: 5_000,
    })
  })

  it('marks unsupported hostile proximity as enemy control and presence', () => {
    const world = createWorldOf({ aircraft: [player], player: player.id, ships: [shipAt('enemy', 4_000, 'axis')] })
    expect(recoveryFactsAt(world, v3(0, 0, 0), 'land', 9)).toMatchObject({
      control: 'enemy', friendlyRescuePresent: false, enemyPresence: true, enemySupportM: 4_000,
    })
  })

  it('can resolve a non-player parachutist relative to its own side', () => {
    const world = createWorldOf({ aircraft: [player], player: player.id, ships: [shipAt('axis-rescue', 3_000, 'axis')] })
    expect(recoveryFactsAt(world, v3(0, 0, 0), 'water', 11, undefined, 'axis')).toMatchObject({
      control: 'friendly', friendlyRescuePresent: true, friendlySupportM: 3_000,
    })
  })
})
