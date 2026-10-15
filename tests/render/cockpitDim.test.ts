import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { exposureFor } from '../../src/render/exposure.js'
import { COCKPIT_DIM_FULL_DEG, NIGHT_COCKPIT_DIM, apparentCockpitBrightness, cockpitDimFor, createCockpitDimmer, dimmedContrast, gaugePairs } from '../../src/render/scene/cockpitDim.js'
import { COCKPIT_LAYOUTS } from '../../src/render/scene/cockpitLayouts.js'

describe('night cockpit dimming', () => {
  it('is 1 in daylight, eases down monotonically, and holds NIGHT_COCKPIT_DIM from the dusk depth on', () => {
    expect(apparentCockpitBrightness(30)).toBe(1)
    expect(apparentCockpitBrightness(0)).toBe(1)
    expect(apparentCockpitBrightness(COCKPIT_DIM_FULL_DEG)).toBeCloseTo(NIGHT_COCKPIT_DIM, 12)
    expect(apparentCockpitBrightness(-46)).toBeCloseTo(NIGHT_COCKPIT_DIM, 12)
    for (let e = 10; e > -20; e -= 0.5) expect(apparentCockpitBrightness(e - 0.5)).toBeLessThanOrEqual(apparentCockpitBrightness(e))
    // The frame's exposure lifts the picture at night; the factor cancels it, so the panel APPEARS at the target level.
    for (const e of [30, 10, 0, -4, -9, -46]) expect(cockpitDimFor(e) * exposureFor(e), `elev ${e}`).toBeCloseTo(apparentCockpitBrightness(e), 12)
    expect(cockpitDimFor(-46), 'a real darkening of the panel colors, not just the target').toBeLessThan(NIGHT_COCKPIT_DIM)
    expect(NIGHT_COCKPIT_DIM).toBeLessThan(0.6) // "a bit too bright" was the complaint: it must be a real dimming
  })

  it('keeps every cockpit family\'s gauges legible: needles and major marks 4.5:1, minor marks 3:1 (WCAG 2.1) at the night level', () => {
    const pairs = gaugePairs()
    expect(pairs.length, 'every family is enrolled').toBe(Object.keys(COCKPIT_LAYOUTS).length * 3)
    for (const [name, mark, face, min] of pairs) {
      expect(dimmedContrast(mark, face, NIGHT_COCKPIT_DIM), name).toBeGreaterThanOrEqual(min)
    }
    // And the test can fail: a far deeper dim breaks it.
    expect(pairs.some(([, mark, face, min]) => dimmedContrast(mark, face, 0.02) < min)).toBe(true)
  })

  it('scales basic materials to k of their authored color, restores them at k = 1, and never compounds frame to frame', () => {
    const mat = new MeshBasicMaterial({ color: 0x808080 })
    const lamp = new MeshBasicMaterial({ color: 0x40ff40 })
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), mat), new Mesh(new BoxGeometry(), lamp))
    const authored = mat.color.r
    const dimmer = createCockpitDimmer()
    for (let i = 0; i < 5; i++) dimmer.apply(root, 0.5)
    expect(mat.color.r).toBeCloseTo(authored * 0.5, 9)
    dimmer.apply(root, 1)
    expect(mat.color.r).toBeCloseTo(authored, 9)
    // A live lamp is rewritten each frame by the panel; it dims by sqrt(k) of whatever it holds now.
    const lit = lamp.color.g
    dimmer.apply(root, 0.25, [lamp])
    expect(lamp.color.g).toBeCloseTo(lit * 0.5, 9)
  })
})
