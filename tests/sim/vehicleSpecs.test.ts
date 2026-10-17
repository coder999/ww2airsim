import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import { modelIO, onlyScene } from '../../tools/models/document.js'
import { loadVehicleSpec } from '../../tools/content/load.js'
import { createVehicleState, stepVehicle, vehicleOnTerrain, type VehicleEntity } from '../../src/sim/world/vehicles.js'
import { STATIC_MODELS } from '../../src/render/scene/staticModels.js'
import { VEHICLE_RIGS } from '../../src/render/scene/vehicleRig.js'
import { groundTruthTerrain } from '../../tools/sites/terrain.js'
import { flatField } from './mission/fixture.js'

/**
 * F8A Task 5 (2026-10-16): every vehicle spec in content/vehicles is enrolled by reading the directory, so the five F4
 * vehicles (trucks, dozer, field gun, landing craft) that had a glb and a Library entry but no sim spec are covered
 * without a test of their own, and so is any spec added later. The enrolled list is pinned.
 */
// The 10% is measured: the four older specs carry reference dimensions that differ from their glb by up to 7% (Chi-Ha height, Willys width, 2026-10-16); the five F8A specs were taken from the glb and agree to 1%.
const ids = readdirSync('content/vehicles').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()

describe('vehicle specs (every one enrolled)', () => {
  it('enrolls the four original specs, the five F8A ones, the F8C rescue launch and the F10B life raft', () => {
    expect(ids).toEqual(['caterpillar-d7-3t', 'gmc-cckw-353', 'lcvp', 'm4-sherman', 'type38-75mm-field-gun', 'type94-cargo-truck', 'type95-kurogane', 'type97-chi-ha', 'type-a3-life-raft-survivors', 'usaaf-63ft-rescue-boat', 'willys-mb-jeep'])
  })

  it.each(ids)('%s loads, names a registered model and rig, and is the size of its glb (10%)', async (id) => {
    const spec = loadVehicleSpec(id)
    expect(spec.id).toBe(id)
    // F10B: a spec may draw an equipment model (the life raft), which has no rig.
    const kind = spec.view.kind ?? 'vehicle'
    expect(Object.keys(STATIC_MODELS[kind])).toContain(spec.view.model)
    if (kind === 'vehicle') expect(Object.keys(VEHICLE_RIGS)).toContain(spec.view.model)
    const glb = `content/${kind === 'vehicle' ? 'vehicles' : 'equipment'}/${spec.view.model}.glb`
    expect(existsSync(glb)).toBe(true)
    const b = getBounds(onlyScene(await modelIO().readBinary(new Uint8Array(readFileSync(glb)))))
    const near = (got: number, want: number): number => Math.abs(got - want) / want
    expect(near(spec.lengthM, b.max[0] - b.min[0]), 'length').toBeLessThan(0.10)
    expect(near(spec.widthM, b.max[2] - b.min[2]), 'width').toBeLessThan(0.10)
    expect(near(spec.heightM, b.max[1] - b.min[1]), 'height').toBeLessThan(0.10)
  })

  it('the landing craft is the only landing-craft target; the trucks and dozer are light vehicles', () => {
    expect(ids.filter((i) => loadVehicleSpec(i).targetType === 'landing-craft')).toEqual(['lcvp'])
    for (const i of ['gmc-cckw-353', 'type94-cargo-truck', 'caterpillar-d7-3t']) expect(loadVehicleSpec(i).targetType).toBe('light-vehicle')
  })
})

describe('craft that float (F8C)', () => {
  const orders = { waypoints: [{ x: -29900, z: -47700 }], speedMps: 0, loop: false, headingRad: 1 }

  it('the landing craft, the life raft and the rescue launch say so, and no other spec does', () => {
    expect(ids.filter((i) => loadVehicleSpec(i).floats === true)).toEqual(['lcvp', 'type-a3-life-raft-survivors', 'usaaf-63ft-rescue-boat'])
  })

  it('a floating craft rests on the sea surface, level, whatever the ground under it; a truck on the same ground sits on it', () => {
    const raised = flatField(5)
    const boat = createVehicleState(loadVehicleSpec('usaaf-63ft-rescue-boat'), orders, raised)
    expect(boat.position.y).toBe(0)
    expect([boat.pitchRad, boat.rollRad]).toEqual([0, 0])
    expect(createVehicleState(loadVehicleSpec('gmc-cckw-353'), orders, raised).position.y).toBeCloseTo(5, 1)
    // reseated when terrain arrives, too
    const spec = loadVehicleSpec('lcvp')
    const s = createVehicleState(spec, orders, null)
    expect(vehicleOnTerrain({ id: 'v', spec, state: s, previous: s, orders }, raised).state.position.y).toBe(0)
  })
})

describe('a placed (speed 0) vehicle', () => {
  const terrain = groundTruthTerrain()
  const spec = loadVehicleSpec('gmc-cckw-353')
  const orders = { waypoints: [{ x: -29900, z: -47700 }], speedMps: 0, loop: false, headingRad: 1 }

  it('stays put for a minute of ticks, level with the ground it was posed on', () => {
    const first = createVehicleState(spec, orders, terrain)
    let s = first
    for (let t = 1; t <= 7200; t++) s = stepVehicle(spec, s, orders, { dt: 1 / 120, tick: t, terrain })
    expect(s).toEqual({ ...first, tick: 7200, stopped: true, speedMps: 0, steer: 0 })
    expect(s.position).toEqual(first.position)
  })

  it('costs a step no allocation: the same state object comes back, only the clock moves', () => {
    const first = createVehicleState(spec, orders, terrain)
    const a = stepVehicle(spec, first, orders, { dt: 1 / 120, tick: 1, terrain })
    const b = stepVehicle(spec, a, orders, { dt: 1 / 120, tick: 2, terrain })
    expect(b.position).toBe(a.position)
    expect(b.tick).toBe(2)
  })

  it('is re-seated on a new ground by vehicleOnTerrain, which the frame calls whenever terrain arrives', () => {
    const state = createVehicleState(spec, orders, null)
    expect(state.position.y).toBe(0)
    const entity: VehicleEntity = { id: 'v', spec, state, previous: state, orders }
    const seated = vehicleOnTerrain(entity, flatField(40))
    expect(seated.state.position.y).toBeCloseTo(40, 1)
    // and stepping it afterwards keeps that height
    expect(stepVehicle(spec, seated.state, orders, { dt: 1 / 120, tick: 1, terrain: flatField(40) }).position.y).toBeCloseTo(40, 1)
  })

  it('a destroyed moving vehicle still comes to rest (the skip does not swallow the stop)', () => {
    const moving = { waypoints: [{ x: -29900, z: -47700 }, { x: -29900, z: -47500 }], speedMps: 10, loop: false }
    let s = createVehicleState(spec, moving, terrain)
    for (let t = 1; t <= 120; t++) s = stepVehicle(spec, s, moving, { dt: 1 / 120, tick: t, terrain })
    expect(s.speedMps).toBeGreaterThan(0)
    const dead = stepVehicle(spec, s, moving, { dt: 1 / 120, tick: 121, terrain }, true)
    expect(dead.speedMps).toBe(0)
    expect(dead.stopped).toBe(true)
  })
})
