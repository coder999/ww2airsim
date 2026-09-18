import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { cameraTransformFor } from '../../src/render/camera.js'
import { toThreeOrientation } from '../../src/render/frame.js'
import { gaugeValue, readoutTextFor } from '../../src/render/gauges.js'
import { DEFAULT_SPAWN_POSITION, initialAircraftState } from '../../src/render/spawn.js'
import { createState, type Controls } from '../../src/sim/flight/state.js'
import { qFromAxisAngle, qRotate } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { toGeodetic, toLocal, WORLD_CENTRE } from '../../src/sim/world/projection.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { FIRST_COMMITTED_LEVEL, loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'

const spec = loadAircraftSpec('f6f-hellcat')
const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('geography, view and compass agree', () => {
  it('maps increasing latitude north (-Z) and increasing longitude east (+X)', () => {
    const { latDeg, lonDeg } = WORLD_CENTRE
    expect(toLocal(latDeg + 0.1, lonDeg).z).toBeLessThan(0)
    expect(toLocal(latDeg - 0.1, lonDeg).z).toBeGreaterThan(0)
    expect(toLocal(latDeg, lonDeg + 0.1).x).toBeGreaterThan(0)
    expect(toLocal(latDeg, lonDeg - 0.1).x).toBeLessThan(0)
  })

  it.each([
    [0, Math.PI / 2, 0, -1],
    [90, 0, 1, 0],
    [180, -Math.PI / 2, 0, 1],
    [270, Math.PI, -1, 0],
  ])('reads %i degrees when the nose points along that geographic axis', (bearing, yaw, x, z) => {
    const state = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), yaw) })
    const nose = qRotate(state.attitude, v3(1, 0, 0))
    expect(nose.x).toBeCloseTo(x, 12)
    expect(nose.z).toBeCloseTo(z, 12)
    expect(gaugeValue('heading', spec, state, controls)).toBeCloseTo(bearing, 9)
  })

  it.each(['chase', 'cockpit'] as const)('puts geographic east on screen right when looking north in %s view', mode => {
    const aircraft = initialAircraftState(DEFAULT_SPAWN_POSITION, true)
    const eye = cameraTransformFor(mode, spec, aircraft)
    const orientation = toThreeOrientation(eye.attitude)
    const inverse = new Quaternion(orientation.x, orientation.y, orientation.z, orientation.w).invert()
    // Independent geographic points. The old +Z=north map puts east on
    // screen LEFT here, even though its projection round-trip tests pass.
    const west = toLocal(11.3, 124.98)
    const east = toLocal(11.3, 125.08)
    const inView = (p: { x: number; z: number }) =>
      new Vector3(p.x - eye.position.x, 0, p.z - eye.position.z).applyQuaternion(inverse)
    expect(inView(west).x).toBeLessThan(0)
    expect(inView(east).x).toBeGreaterThan(0)
    expect(inView(west).z).toBeLessThan(0)
    expect(inView(east).z).toBeLessThan(0)
    expect(readoutTextFor('heading', spec, aircraft, controls)).toBe('000')
  })

  it('keeps the spawn at Tacloban and known geographic landmarks on their terrain', () => {
    const spawn = toGeodetic(DEFAULT_SPAWN_POSITION.x, DEFAULT_SPAWN_POSITION.z)
    expect(spawn.latDeg).toBeCloseTo(11.228, 4)
    expect(spawn.lonDeg).toBeCloseTo(125.028, 4)
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))
    const at = (lat: number, lon: number) => {
      const p = toLocal(lat, lon)
      return heightAt(terrain, p.x, p.z)
    }
    expect(at(11.228, 125.028)).toBeGreaterThan(0)
    // Nacolod is an asymmetric inland peak; the bay is open water.
    expect(at(10.450846, 125.096068)).toBeGreaterThan(300)
    expect(at(10.75, 125.25)).toBe(0)
  })
})
