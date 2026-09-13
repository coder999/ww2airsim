import { describe, it, expect } from 'vitest'
import { Box3, Vector3 } from 'three'
import { createPanel, updatePanel } from '../../src/render/scene/panel.js'
import { GAUGES, attitudeAngles } from '../../src/render/gauges.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('panel', () => {
  it('has exactly one needle per fitted gauge, and none spare', () => {
    // A needle with no gauge behind it is the failure mode this plan is most
    // determined to avoid: an instrument that appears to mean something.
    const p = createPanel(f6f)
    expect(p.needles.size).toBe(GAUGES.length)
    for (const g of GAUGES) expect(p.needles.has(g.id)).toBe(true)
  })

  it('sits ahead of and below the eye point, where a panel actually is', () => {
    // Ahead of the EYE, not of the airframe origin. A two-metre tolerance here
    // once hid a panel sitting 0.65 m behind the pilot's head.
    const p = createPanel(f6f)
    const c = new Box3().setFromObject(p.root).getCenter(new Vector3())
    const [ex, ey] = f6f.view.eyePointM
    expect(c.x).toBeGreaterThan(ex + 0.3)
    expect(c.x).toBeLessThan(ex + 1.5)
    expect(c.y).toBeLessThan(ey)
    expect(ey - c.y).toBeLessThan(0.7)
  })

  it('turns needles when the state changes', () => {
    const p = createPanel(f6f)
    const slow = createState({ velocity: v3(40, 0, 0) })
    const fast = createState({ velocity: v3(180, 0, 0) })
    updatePanel(p, f6f, slow)
    const a = p.needles.get('airspeed')!.rotation.z
    updatePanel(p, f6f, fast)
    const b = p.needles.get('airspeed')!.rotation.z
    expect(b).not.toBeCloseTo(a, 6)
  })

  it('rolls the artificial horizon opposite the aircraft, as a real one does', () => {
    // Tied to the SIGN of roll, not just "it moved": a horizon wired to
    // rotate WITH the aircraft instead of against it still changes when
    // banked and would pass a test that only checked for a difference from
    // level -- and would read backwards to a pilot in every turn. Verified
    // 2026-09-13 that this attitude (x = sin(pi/12) about the roll axis)
    // gives attitudeAngles a positive rollRad of ~0.524 rad (30 deg), via a
    // direct qRotate check against this project's own quat math.
    const p = createPanel(f6f)
    const bankedRight = createState({
      velocity: v3(120, 0, 0),
      attitude: { x: Math.sin(Math.PI / 12), y: 0, z: 0, w: Math.cos(Math.PI / 12) },
    })
    updatePanel(p, f6f, bankedRight)
    const { rollRad } = attitudeAngles(bankedRight)
    expect(rollRad).not.toBeCloseTo(0, 6)
    expect(p.horizon.rotation.z).toBeCloseTo(-rollRad, 6)

    const bankedLeft = createState({
      velocity: v3(120, 0, 0),
      attitude: { x: Math.sin(-Math.PI / 12), y: 0, z: 0, w: Math.cos(-Math.PI / 12) },
    })
    updatePanel(p, f6f, bankedLeft)
    expect(p.horizon.rotation.z).toBeGreaterThan(0)
  })

  it('stays finite for a degenerate state', () => {
    const p = createPanel(f6f)
    updatePanel(p, f6f, createState({ velocity: v3(0, 0, 0) }))
    for (const n of p.needles.values()) expect(Number.isFinite(n.rotation.z)).toBe(true)
  })
})
