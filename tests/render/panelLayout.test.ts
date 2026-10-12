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
    //
    // A full 1-degree margin on the bottom edge, matching ruling R4's own
    // margin on the horizontal budget below -- Ruling R12 (Task 6 fix round
    // 3, 2026-09-15) pointed out that accepting a bare `toBeLessThanOrEqual`
    // here was the same knife-edge shape R4 already rejected on the other
    // axis (a 0.14-degree horizontal margin, ruled insufficient there).
    // `LOWER_H`'s own doc comment in panelLayout.ts records the real dial
    // extent measured against several candidate values of this constant --
    // see it for the derivation this margin guards.
    const MARGIN_DEG = 1
    const bottomEdge = CAMERA_VFOV_DEG / 2
    for (const [name, band] of Object.entries(PANEL_BANDS)) {
      expect(degreesBelowEye(band.top), `${name} top clears the horizon`)
        .toBeGreaterThanOrEqual(HORIZON_KEEP_DEG)
      expect(degreesBelowEye(band.bottom), `${name} bottom clears the frame edge by a full margin`)
        .toBeLessThanOrEqual(bottomEdge - MARGIN_DEG)
    }
  })

  it('does not let the bands overlap', () => {
    expect(PANEL_BANDS.upper.bottom).toBeLessThanOrEqual(PANEL_BANDS.lower.top)
  })
})

describe('the panel horizontal budget (2026-09-15; C3 fascia 2026-10-12)', () => {
  it('keeps every slot at least 0.75 degrees inside the frustum at the narrowest supported window', () => {
    // tan(hfov/2) = aspect * tan(vfov/2). At PANEL_MIN_ASPECT the horizontal
    // edge is 40.9 degrees; today's six dials reach 35.5. The throttle and
    // armament blocks are the ones that eat into that margin, reaching 39.07.
    //
    // The approved C3 fascia deliberately widens the outer ENGINE/FUEL
    // columns to the photographed frame edge. At 16:10 their declared slots
    // retain 0.807 degrees, measured from these production constants. Keep a
    // 0.75-degree asserted floor: still far from the old 0.14-degree defect,
    // while describing the dashboard that now actually ships.
    const MARGIN_DEG = 0.75
    const halfV = Math.tan(((CAMERA_VFOV_DEG / 2) * Math.PI) / 180)
    const edgeDeg = (Math.atan(PANEL_MIN_ASPECT * halfV) * 180) / Math.PI
    for (const s of PANEL_SLOTS) {
      const outer = Math.abs(s.centreX) + s.widthM / 2
      expect((Math.atan2(outer, PANEL_AHEAD_M) * 180) / Math.PI, `slot ${s.id}`)
        .toBeLessThan(edgeDeg - MARGIN_DEG)
    }
  })
})
