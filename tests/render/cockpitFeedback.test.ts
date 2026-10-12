import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Vector3 } from 'three'
import { createPanel, updatePanel, PANEL_BELOW_M } from '../../src/render/scene/panel.js'
import { degreesBelowEye, HORIZON_KEEP_DEG, PANEL_BANDS } from '../../src/render/scene/panelLayout.js'
import { cameraTransformFor } from '../../src/render/camera.js'
import { flightDataItems } from '../../src/render/flightData.js'
import { initialFrameState, nextFrameState } from '../../src/render/frame.js'
import { createState } from '../../src/sim/flight/state.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { LOOK_CENTRE } from '../../src/input/lookAround.js'
import { v3, length, sub } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const spec = loadAircraftSpec('f6f-hellcat')
const multiEngineSpec = loadAircraftSpec('p-38-lightning')
const panel = () => {
  const p = createPanel(spec, () => null)
  p.root.position.set(0, 0, 0)
  p.root.rotation.set(0, 0, 0)
  return p
}

describe('cockpit feedback', () => {
  it('keeps the approved fascia crown below the four-degree horizon clearance and has sloping shoulders', () => {
    // C3's approved full fascia superseded the short two-thirds-height
    // procedural strip. Its useful invariant is the clear view over the
    // crown, not a ratio to the retired silhouette.
    expect(degreesBelowEye(PANEL_BANDS.upper.top)).toBeCloseTo(HORIZON_KEEP_DEG, 9)
    const p = panel()
    const vertices = (p.backing as Mesh).geometry.getAttribute('position')
    const points = Array.from({ length: vertices.count }, (_, i) => new Vector3().fromBufferAttribute(vertices, i))
    const top = Math.max(...points.map(v => v.y))
    const bottom = Math.min(...points.map(v => v.y))
    const topWidth = Math.max(...points.filter(v => v.y === top).map(v => Math.abs(v.x)))
    const bottomWidth = Math.max(...points.filter(v => v.y === bottom).map(v => Math.abs(v.x)))
    expect(topWidth / bottomWidth).toBeLessThan(0.4)
    // The approved texture plane, not this hidden procedural fallback mesh,
    // now backs the outer columns and instrument wells. Its runtime presence
    // is browser-only and the capture pass verifies it; keep this headless
    // assertion on the fallback's still-useful sloping-shoulder silhouette.
  })

  it('shows five fuel marks and capacity-based fill at empty, half and full', () => {
    const p = panel()
    const column = p.root.getObjectByName('column:fuel')!
    expect(column.children.filter(c => c.name === 'column:tick').map(c => c.userData.fraction)).toEqual([0, 0.25, 0.5, 0.75, 1])
    const fill = p.columns.get('fuel')!.fill
    let base: number | undefined
    for (const fraction of [0, 0.5, 1]) {
      updatePanel(p, spec, createState({ fuelKg: spec.mass.fuelCapacityKg * fraction }), NEUTRAL, () => null)
      p.root.updateMatrixWorld(true)
      expect(fill.visible).toBe(fraction > 0)
      if (fraction > 0) expect(fill.scale.y).toBeCloseTo(fraction, 9)
      // The approved raster supplies the bezel, labels, and fixed marks. Test
      // the live fill rather than hidden fallback geometry on camera layer 1.
      const box = new Box3().setFromObject(fill)
      expect(box.max.y).toBeLessThanOrEqual(PANEL_BELOW_M - PANEL_BANDS.lower.top + 1e-6)
      expect(box.min.y).toBeGreaterThanOrEqual(PANEL_BELOW_M - PANEL_BANDS.lower.bottom - 1e-6)
      const fillBase = new Box3().setFromObject(fill).min.y
      if (base !== undefined) expect(fillBase).toBeCloseTo(base, 7)
      base = fillBase
    }
  })

  it('registers the radar and horizon faces to the measured fascia apertures', () => {
    const p = panel()
    p.root.updateMatrixWorld(true)
    // Independent world-space expectations from the four source assets'
    // measured pixel apertures (1672x941), including the intentional lip
    // overscan. Do not derive these from `faceRadius`: that self-referential
    // assertion previously passed while both live displays visibly missed
    // their painted openings.
    const radar = new Box3().setFromObject(p.radar.face)
    expect(radar.getCenter(new Vector3()).x).toBeCloseTo(-0.001288, 5)
    expect(radar.getCenter(new Vector3()).y).toBeCloseTo(-0.050389, 5)
    expect(radar.getSize(new Vector3()).x).toBeCloseTo(0.161977, 5)
    expect(radar.getSize(new Vector3()).y).toBeCloseTo(0.161977, 5)

    const horizon = new Box3().setFromObject(p.attitude.ball)
    expect(horizon.getCenter(new Vector3()).x).toBeCloseTo(0.198974, 5)
    expect(horizon.getCenter(new Vector3()).y).toBeCloseTo(-0.080759, 5)
    expect(horizon.getSize(new Vector3()).x).toBeCloseTo(0.113384, 5)
    expect(horizon.getSize(new Vector3()).y).toBeCloseTo(0.113384, 5)
  })

  it('registers the multi-engine horizon one source pixel lower', () => {
    const p = createPanel(multiEngineSpec, () => null)
    p.root.position.set(0, 0, 0)
    p.root.rotation.set(0, 0, 0)
    p.root.updateMatrixWorld(true)
    const horizon = new Box3().setFromObject(p.attitude.ball)
    expect(horizon.getCenter(new Vector3()).y).toBeCloseTo(-0.081495, 5)
  })
})

describe('follow camera and numeric data', () => {
  it('moves farther aft with speed, with bounded low/high distances', () => {
    const state = createState()
    const distance = (speed: number) => length(sub(cameraTransformFor('chase', spec, state, LOOK_CENTRE, speed).position, state.position))
    expect(distance(40)).toBeLessThan(distance(120))
    expect(distance(120)).toBeLessThan(distance(200))
    expect(distance(0)).toBe(distance(40))
    expect(distance(400)).toBe(distance(200))
    expect(cameraTransformFor('cockpit', spec, state, LOOK_CENTRE, 40)).toEqual(cameraTransformFor('cockpit', spec, state, LOOK_CENTRE, 200))
  })

  it('routes actual flight speed to the follow camera', () => {
    const distance = (speed: number) => {
      const frame = nextFrameState(initialFrameState(spec, createState({ velocity: v3(speed, 0, 0) })), 0, new Set())
      return length(sub(frame.eye.position, frame.render.position))
    }
    expect(distance(200)).toBeGreaterThan(distance(40) * 1.4)
  })

  it('reports flight values and attitude without pegging at analog dial limits', () => {
    const items = flightDataItems(spec, createState({ position: v3(0, 15240, 0), velocity: v3(100, 0, 0), fuelKg: spec.mass.fuelCapacityKg / 2 }), { ...NEUTRAL, throttle: 0.75 })
    expect(items.find(i => i.label === 'ALT')?.value).toBe('50000 ft')
    expect(items.find(i => i.label === 'THR')?.value).toBe('75 %')
    expect(items.find(i => i.label === 'FUEL')?.value).toBe('50% (125 gal)')
    expect(items.map(i => i.label)).toEqual(['SPD', 'ALT', 'V/S', 'HDG', 'FUEL', 'THR', 'PITCH', 'BANK', 'GEAR', 'FLAP'])
  })

  it('shows SPD as airspeed once there is wind, with ALT and V/S untouched (Plan 8 review)', () => {
    // The strip's SPD is `gaugeValue('airspeed', ...)`, so it carried the same
    // ground-speed reading the panel dial did until the wind was threaded in.
    const state = createState({ position: v3(0, 1524, 0), velocity: v3(0, -5, -60) })
    const calm = flightDataItems(spec, state, NEUTRAL)
    // Air moving south (+z) is a headwind for an airplane tracking north.
    const into = flightDataItems(spec, state, NEUTRAL, v3(0, 0, 15))
    expect(calm.find(i => i.label === 'SPD')?.value).toBe(`${Math.round(length(v3(0, -5, -60)) / 0.44704)} mph`)
    expect(into.find(i => i.label === 'SPD')?.value).toBe(`${Math.round(length(v3(0, -5, -75)) / 0.44704)} mph`)
    expect(into.find(i => i.label === 'ALT')?.value).toBe(calm.find(i => i.label === 'ALT')?.value)
    expect(into.find(i => i.label === 'V/S')?.value).toBe(calm.find(i => i.label === 'V/S')?.value)
  })

  it('shows three gear states, not two: up, down, and traveling in between', () => {
    // gearAfter takes several seconds (spec.gear.travelSeconds), so a pilot
    // who just toggled the gear spends real time in a state that is neither
    // UP nor DOWN -- this must be a genuine third value, not a rounding of
    // one of the other two.
    const gearValue = (gearFraction: number): string | undefined =>
      flightDataItems(spec, createState({ gearFraction }), NEUTRAL).find(i => i.label === 'GEAR')?.value
    expect(gearValue(0)).toBe('UP')
    expect(gearValue(1)).toBe('DOWN')
    expect(gearValue(0.5)).toBe('TRANSIT')
  })

  it('shows three flap states too, for the same reason and on the same thresholds', () => {
    // Plan 11a's Task 12 recorded that a flaps indicator was 11b's debt. A
    // pilot who cannot see the flap position cannot fly a repeatable approach,
    // so this is not cosmetic.
    const flapValue = (flapFraction: number): string | undefined =>
      flightDataItems(spec, createState({ flapFraction }), NEUTRAL).find(i => i.label === 'FLAP')?.value
    expect(flapValue(0)).toBe('UP')
    expect(flapValue(1)).toBe('DOWN')
    expect(flapValue(0.5)).toBe('TRANSIT')
  })
})

describe('the flight data strip shows the bay doors on an airplane that has them (C2)', () => {
  it('BAY reads SHUT, TRANSIT, OPEN on a B-29, and a fighter has no BAY row', () => {
    const b29 = loadAircraftSpec('b-29-superfortress')
    const bay = (f: number) => flightDataItems(b29, createState({ bayDoorFraction: f }), NEUTRAL).find((i) => i.label === 'BAY')?.value
    expect([bay(0), bay(0.5), bay(1)]).toEqual(['SHUT', 'TRANSIT', 'OPEN'])
    expect(flightDataItems(loadAircraftSpec('f6f-hellcat'), createState(), NEUTRAL).some((i) => i.label === 'BAY')).toBe(false)
  })
})
