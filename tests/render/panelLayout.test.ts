import { describe, it, expect } from 'vitest'
import { CAMERA_VFOV_DEG } from '../../src/render/camera.js'
import { degreesBelowEye, HORIZON_KEEP_DEG, PANEL_BANDS } from '../../src/render/scene/panelLayout.js'

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
