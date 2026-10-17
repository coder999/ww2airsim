// What a stationary vehicle costs the sim per tick (F8A Task 5): tsx tools/sites/vehicleCost.ts
// 12 speed-0 vehicles on the real Tacloban ground, stepped through `stepVehicle` for 60 s of 120 Hz ticks.
import { createVehicleState, parseVehicleSpec, stepVehicle, type VehicleState } from '../../src/sim/world/vehicles.js'
import { readFileSync } from 'node:fs'
import { groundTruthTerrain } from './terrain.js'

const terrain = groundTruthTerrain()
const spec = parseVehicleSpec(JSON.parse(readFileSync('content/vehicles/gmc-cckw-353.json', 'utf8')))
const orders = { waypoints: [{ x: -29900, z: -47700 }], speedMps: 0 }
const N = 12, TICKS = 60 * 120
let states: VehicleState[] = Array.from({ length: N }, (_, i) => createVehicleState(spec, { ...orders, waypoints: [{ x: -29900 + i * 8, z: -47700 }] }, terrain))
const t0 = performance.now()
for (let t = 1; t <= TICKS; t++) states = states.map((s) => stepVehicle(spec, s, orders, { dt: 1 / 120, tick: t, terrain }))
const ms = performance.now() - t0
console.log(JSON.stringify({ vehicles: N, ticks: TICKS, totalMs: +ms.toFixed(1), usPerVehicleTick: +((ms * 1000) / (N * TICKS)).toFixed(3), usPerTickAll12: +((ms * 1000) / TICKS).toFixed(2) }))
