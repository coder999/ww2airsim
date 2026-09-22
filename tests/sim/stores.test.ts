import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { emptyStores, storesFromLoadout, storesSpec } from '../../src/sim/weapons/stores.js'
import { massKg } from '../../src/sim/flight/model.js'
import { createState, step, DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('stores content and loadouts', () => {
  it('parses the shipped racks, rails and store types', () => {
    expect(f6f.stores?.racks).toHaveLength(2)
    expect(f6f.stores?.rails).toHaveLength(6)
    expect(f6f.stores?.types['an-m65']).toMatchObject({ kind: 'bomb', massKg: 453.6 })
    expect(f6f.stores?.types.hvar).toMatchObject({ kind: 'rocket', massKg: 61 })
  })
  it('a loadout of "both" carries two bombs and six rockets; "clean" carries none', () => {
    expect(storesFromLoadout(f6f, 'both')).toEqual({ bombs: 2, rockets: 6 })
    expect(storesFromLoadout(f6f, 'clean')).toEqual(emptyStores)
    expect(storesFromLoadout(f6f, 'bombs')).toEqual({ bombs: 2, rockets: 0 })
    expect(storesFromLoadout(f6f, 'rockets')).toEqual({ bombs: 0, rockets: 6 })
  })
})

describe('storesSpec bit-identity and mass/drag (Plan 6b spec §3.1)', () => {
  it('an empty-stores spec is the IDENTICAL object: no arithmetic performed on the calm path', () => {
    expect(storesSpec(f6f, emptyStores)).toBe(f6f)
  })
  it('mass is empty + fuel + carried store mass; massKg itself is unchanged code', () => {
    const state = createState({ position: v3(0, 2000, 0), attitude: qIdentity() })
    const loaded = storesSpec(f6f, { bombs: 2, rockets: 6 })
    expect(massKg(loaded, state)).toBeCloseTo(f6f.mass.emptyKg + state.fuelKg + 2 * 453.6 + 6 * 61, 6)
    expect(massKg(storesSpec(f6f, { bombs: 1, rockets: 0 }), state)).toBeCloseTo(f6f.mass.emptyKg + state.fuelKg + 453.6, 6)
  })
  it('drag rises by the summed store area times dynamic pressure, and a clean airplane steps IDENTICALLY to today', () => {
    let bare = createState({ position: v3(0, 2000, 0), velocity: v3(0, 0, -90), attitude: qIdentity() })
    let clean = bare
    let loaded = bare
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 }
    for (let tick = 1; tick <= 300; tick++) {
      clean = step(storesSpec(f6f, emptyStores), clean, controls, { dt: DT, tick })
      bare = step(f6f, bare, controls, { dt: DT, tick })
      loaded = step(storesSpec(f6f, { bombs: 2, rockets: 6 }), loaded, controls, { dt: DT, tick })
    }
    expect(clean).toEqual(bare)
    expect(loaded.position.y).not.toBeCloseTo(bare.position.y, 1) // heavier + draggier: measurably different trajectory
  })
})
