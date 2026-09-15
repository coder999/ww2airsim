import { describe, it, expect } from 'vitest'
import { CAMERA_VFOV_DEG } from '../../src/render/camera.js'
import { PANEL_MIN_ASPECT } from '../../src/render/scene/panel.js'
import {
  degreesBelowEye,
  HORIZON_KEEP_DEG,
  PANEL_AHEAD_M,
  PANEL_BANDS,
  PANEL_SLOTS,
} from '../../src/render/scene/panelLayout.js'

describe('the panel vertical budget (2026-09-15)', () => {
  it('keeps every instrument band inside the frustum and below the horizon', () => {
    // The defect this exists for: on 2026-09-13 PANEL_BELOW_M was 0.35, which
    // put every label and readout past the frustum edge -- only the top
    // slivers of six discs were ever visible. Nothing measured it.
    const bottomEdge = CAMERA_VFOV_DEG / 2
    for (const [name, band] of Object.entries(PANEL_BANDS)) {
      expect(degreesBelowEye(band.top), `${name} top clears the horizon`)
        .toBeGreaterThanOrEqual(HORIZON_KEEP_DEG)
      expect(degreesBelowEye(band.bottom), `${name} bottom is on screen`)
        .toBeLessThanOrEqual(bottomEdge)
    }
  })

  it('does not let the bands overlap', () => {
    expect(PANEL_BANDS.upper.bottom).toBeLessThanOrEqual(PANEL_BANDS.lower.top)
  })
})

describe('the panel horizontal budget (2026-09-15)', () => {
  it('keeps every slot inside the frustum at the narrowest supported window', () => {
    // tan(hfov/2) = aspect * tan(vfov/2). At PANEL_MIN_ASPECT the horizontal
    // edge is 40.9 degrees; today's six dials reach 37.0. The throttle and
    // armament blocks eat into that margin, so it is measured, not assumed.
    const halfV = Math.tan(((CAMERA_VFOV_DEG / 2) * Math.PI) / 180)
    const edgeDeg = (Math.atan(PANEL_MIN_ASPECT * halfV) * 180) / Math.PI
    for (const s of PANEL_SLOTS) {
      const outer = Math.abs(s.centreX) + s.widthM / 2
      expect((Math.atan2(outer, PANEL_AHEAD_M) * 180) / Math.PI, `slot ${s.id}`)
        .toBeLessThan(edgeDeg)
    }
  })
})
