import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { Box3 } from 'three'
import {
  AIRFRAME_LANDING_LIGHTS, AIRFRAME_LIGHT_POINTS, NAV_AXIS, NAV_COLOR, NAV_HALF_ANGLE_RAD, NAV_POINTS, navLightPose,
} from '../../../src/sim/lights/airframeLights.js'
import { INTENSITY_CD, LIGHT_CAPS, LightsSchema, lightsAt, type LightSpec, type LightWorld } from '../../../src/sim/lights/lights.js'
import { arcVisibility } from '../../../src/render/lights/nightLights.js'
import { qFromAxisAngle, qIdentity } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { glbScene } from '../../render/_wildcatCache.js'

const flyable = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

describe('aircraft position lights are data for every flyable airframe (D7)', () => {
  it('the table is enrolled over every flyable id in content/aircraft, and pinned', () => {
    expect(flyable).toEqual([
      'a6m2-zero', 'b-17-flying-fortress', 'b-29-superfortress', 'b5n2-kate', 'd3a-val', 'f4f-wildcat', 'f4u-corsair', 'f6f-hellcat',
      'g4m-betty', 'ki-21-sally', 'ki-43-oscar', 'ki-84-frank', 'p-38-lightning', 'pby-5a-catalina', 'tbm-3-avenger',
    ])
    expect(Object.keys(AIRFRAME_LIGHT_POINTS).sort()).toEqual(flyable)
  })

  it('every point lies inside its airframe\'s committed model bounds, the wingtips on the span and symmetric, the tail aft of them', async () => {
    for (const id of flyable) {
      const spec = JSON.parse(readFileSync(`content/aircraft/${id}.json`, 'utf8')) as { view: { model: string }; geometry: { wingSpanM: number } }
      const root = await glbScene(`content/aircraft/${spec.view.model}.glb`)
      root.updateMatrixWorld(true)
      const b = new Box3().setFromObject(root)
      const row = AIRFRAME_LIGHT_POINTS[id]!
      for (const name of NAV_POINTS) {
        const [x, y, z] = row[name]
        expect(x, `${id} ${name} x`).toBeGreaterThanOrEqual(b.min.x); expect(x, `${id} ${name} x`).toBeLessThanOrEqual(b.max.x)
        expect(y, `${id} ${name} y`).toBeGreaterThanOrEqual(b.min.y); expect(y, `${id} ${name} y`).toBeLessThanOrEqual(b.max.y)
        expect(z, `${id} ${name} z`).toBeGreaterThanOrEqual(b.min.z); expect(z, `${id} ${name} z`).toBeLessThanOrEqual(b.max.z)
      }
      // +Z is right: green (starboard) at +z, red (port) at -z, mirrored, out at the wingtips (within 0.25 m of the half span).
      expect(row.port[2], `${id} port is left`).toBeLessThan(0)
      expect(row.starboard[2], `${id} starboard is right`).toBeGreaterThan(0)
      expect(row.port[2]).toBeCloseTo(-row.starboard[2], 6)
      expect(Math.abs(row.starboard[2] - spec.geometry.wingSpanM / 2), `${id} wingtip`).toBeLessThan(0.25)
      expect(row.tail[0], `${id} tail is aft of the wingtips`).toBeLessThan(row.port[0])
      expect(row.tail[2]).toBe(0)
    }
  })

  it('port is red, starboard green, tail white; the arcs face out and the tail faces aft', () => {
    expect(NAV_COLOR).toEqual({ port: 'red', starboard: 'green', tail: 'white' })
    expect(NAV_AXIS.port.z).toBeLessThan(0); expect(NAV_AXIS.starboard.z).toBeGreaterThan(0); expect(NAV_AXIS.tail.x).toBe(-1)
    for (const p of NAV_POINTS) expect(NAV_HALF_ANGLE_RAD[p]).toBeGreaterThan(0)
  })

  it('no landing light is installed without period evidence: any entry must carry a source (and none exists yet)', () => {
    expect(Object.keys(AIRFRAME_LANDING_LIGHTS)).toEqual([])
    for (const [id, l] of Object.entries(AIRFRAME_LANDING_LIGHTS)) expect(l.source.length, id).toBeGreaterThan(10)
  })
})

describe('position-light poses and arcs', () => {
  const pose = (yawDeg: number) => navLightPose('f6f-hellcat', 'port', v3(100, 500, 200), yawDeg === 0 ? qIdentity() : qFromAxisAngle(v3(0, 1, 0), (yawDeg * Math.PI) / 180))!
  it('follows the aircraft: its position and facing rotate with the attitude, and an airframe with no row has no lights', () => {
    const a = pose(0), b = pose(180)
    const [x, y, z] = AIRFRAME_LIGHT_POINTS['f6f-hellcat']!.port
    expect(a.position).toEqual(v3(100 + x, 500 + y, 200 + z))
    expect(b.position.x).toBeCloseTo(100 - x, 9); expect(b.position.z).toBeCloseTo(200 - z, 9)
    expect(b.axis.x).toBeCloseTo(-a.axis.x, 9)
    expect(navLightPose('nonexistent', 'port', v3(0, 0, 0), qIdentity())).toBeNull()
  })

  const world = (tick = 0): LightWorld => ({
    tick, dtS: 1, groundHeightM: () => 0, shipPoint: () => null,
    aircraftPoint: (id, point) => (id === 'a1' ? navLightPose('f6f-hellcat', point, v3(0, 1000, 0), qIdentity()) : null),
  })
  const spec = (state: 'on' | 'off'): LightSpec => ({ id: 'nav-a1', kind: 'nav', at: { aircraft: 'a1', point: 'all' }, color: 'white', state, source: 'gameplay', sourceNote: 'test' })

  it('an `all` light is three position lights, red/green/white, and a blacked-out one (state off) gives no light', () => {
    const lights = lightsAt([spec('on')], world())
    expect(lights.map((l) => l.id)).toEqual(['nav-a1:port', 'nav-a1:starboard', 'nav-a1:tail'])
    expect(lights.every((l) => l.intensityCd === INTENSITY_CD.nav)).toBe(true)
    const [port, stbd, tail] = lights as [typeof lights[0], typeof lights[0], typeof lights[0]]
    expect(port.color[0]).toBeGreaterThan(port.color[1] * 5); expect(stbd.color[1]).toBeGreaterThan(stbd.color[0] * 5)
    expect(tail.color.every((c) => c > 0.5)).toBe(true)
    expect(lightsAt([spec('off')], world()).every((l) => l.intensityCd === 0)).toBe(true)
  })

  it('each light is visible only from inside its arc: a head-on eye sees red and green but not the tail; one behind sees only the tail; one off the starboard side does not see the red', () => {
    const [port, stbd, tail] = lightsAt([spec('on')], world())
    const ahead = v3(5000, 1000, 0), behind = v3(-5000, 1000, 0), starboardSide = v3(0, 1000, 5000)
    expect([arcVisibility(port!, ahead), arcVisibility(stbd!, ahead), arcVisibility(tail!, ahead)].map((f) => f > 0)).toEqual([true, true, false])
    expect([arcVisibility(port!, behind), arcVisibility(stbd!, behind), arcVisibility(tail!, behind)].map((f) => f > 0)).toEqual([false, false, true])
    expect(arcVisibility(port!, starboardSide), 'red is not seen from the right').toBe(0)
    expect(arcVisibility(stbd!, starboardSide), 'green is').toBeGreaterThan(0)
  })

  it('22 aircraft x 3 position lights exceed the 64-sprite cap and fail to load; 21 do not', () => {
    const many = (n: number): LightSpec[] => Array.from({ length: n }, (_, i) => ({ ...spec('on'), id: `nav-${i}`, at: { aircraft: `a${i}`, point: 'all' as const } }))
    expect(LightsSchema.safeParse(many(21)).success).toBe(true)
    expect(LightsSchema.safeParse(many(22)).success).toBe(false)
    expect(21 * 3).toBeLessThanOrEqual(LIGHT_CAPS.navSprites)
  })
})
