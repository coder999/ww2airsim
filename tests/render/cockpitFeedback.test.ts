import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Raycaster, Vector3 } from 'three'
import { createPanel, updatePanel, PANEL_BELOW_M } from '../../src/render/scene/panel.js'
import { PANEL_AHEAD_M, PANEL_BANDS, PANEL_SLOTS } from '../../src/render/scene/panelLayout.js'
import { cameraTransformFor } from '../../src/render/camera.js'
import { flightDataItems } from '../../src/render/flightData.js'
import { initialFrameState, nextFrameState } from '../../src/render/frame.js'
import { createState } from '../../src/sim/flight/state.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { LOOK_CENTRE } from '../../src/input/lookAround.js'
import { v3, length, sub } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const spec = loadAircraftSpec('f6f-hellcat')
const panel = () => {
  const p = createPanel(spec, () => null)
  p.root.position.set(0, 0, 0)
  p.root.rotation.set(0, 0, 0)
  return p
}

describe('cockpit feedback', () => {
  it('uses two thirds of the previous visible height and has sloping shoulders', () => {
    const edge = PANEL_AHEAD_M * Math.tan(Math.PI / 6)
    const oldTop = PANEL_AHEAD_M * Math.tan(3 * Math.PI / 180)
    expect((edge - PANEL_BANDS.upper.top) / (edge - oldTop)).toBeCloseTo(2 / 3, 9)
    const p = panel()
    const vertices = (p.backing as Mesh).geometry.getAttribute('position')
    const points = Array.from({ length: vertices.count }, (_, i) => new Vector3().fromBufferAttribute(vertices, i))
    const top = Math.max(...points.map(v => v.y))
    const bottom = Math.min(...points.map(v => v.y))
    const topWidth = Math.max(...points.filter(v => v.y === top).map(v => Math.abs(v.x)))
    const bottomWidth = Math.max(...points.filter(v => v.y === bottom).map(v => Math.abs(v.x)))
    expect(topWidth / bottomWidth).toBeLessThan(0.4)
    // Every lower-row instrument must be backed by the actual shoulder profile,
    // not just contained in its much larger rectangular bounding box.
    updatePanel(p, spec, createState(), NEUTRAL, () => null)
    p.root.updateMatrixWorld(true)
    for (const slot of PANEL_SLOTS) {
      const object = p.root.children.find(c => c.name === slot.id || c.name === `dial:${slot.id}` || c.name === `column:${slot.id}`)!
      const box = new Box3().setFromObject(object)
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          const ray = new Raycaster(new Vector3(x, y, 1), new Vector3(0, 0, -1))
          expect(ray.intersectObject(p.backing).length, `${slot.id} at ${x}, ${y}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('shows five fuel marks and capacity-based fill at empty, half and full', () => {
    const p = panel()
    const column = p.root.getObjectByName('column:fuel')!
    expect(column.children.filter(c => c.name === 'column:tick').map(c => c.userData.fraction)).toEqual([0, 0.25, 0.5, 0.75, 1])
    const fill = p.columns.get('fuel')!.fill
    let base: number | undefined
    for (const fraction of [0, 0.5, 1]) {
      updatePanel(p, spec, createState({ fuelKg: spec.mass.fuelCapacityKg * fraction }), NEUTRAL, () => null)
      expect(fill.visible).toBe(fraction > 0)
      if (fraction > 0) expect(fill.scale.y).toBeCloseTo(fraction, 9)
      const box = new Box3().setFromObject(column)
      expect(box.max.y).toBeLessThanOrEqual(PANEL_BELOW_M - PANEL_BANDS.lower.top + 1e-6)
      expect(box.min.y).toBeGreaterThanOrEqual(PANEL_BELOW_M - PANEL_BANDS.lower.bottom - 1e-6)
      const fillBase = new Box3().setFromObject(fill).min.y
      if (base !== undefined) expect(fillBase).toBeCloseTo(base, 7)
      base = fillBase
    }
  })

  it('keeps the radar recess within its reserved slot and band', () => {
    const p = panel()
    const radar = new Box3().setFromObject(p.root.getObjectByName('radar')!)
    const slot = PANEL_SLOTS.find(s => s.id === 'radar')!
    expect(radar.getCenter(new Vector3()).x).toBe(0)
    expect(radar.min.x).toBeGreaterThanOrEqual(slot.centreX - slot.widthM / 2 - 1e-6)
    expect(radar.max.x).toBeLessThanOrEqual(slot.centreX + slot.widthM / 2 + 1e-6)
    expect(radar.max.y).toBeLessThan(PANEL_BELOW_M - PANEL_BANDS.lower.top)
    expect(radar.min.y).toBeGreaterThan(PANEL_BELOW_M - PANEL_BANDS.lower.bottom)
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
    expect(items.map(i => i.label)).toEqual(['SPD', 'ALT', 'V/S', 'HDG', 'FUEL', 'THR', 'PITCH', 'BANK'])
  })
})
