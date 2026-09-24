import { describe, expect, it } from 'vitest'
import { RADAR_TEXELS_X, RADAR_TEXELS_Y, scopeTexelFor } from '../../src/render/scene/radarScope.js'

describe('scopeTexelFor: orientation invariants', () => {
  // Row direction, verified against the fragment shader's own comment
  // (radarScope.ts, on `local`'s uv.y flip): "a render target's uv.y = 1
  // edge is texture row 0 under WebGPU ... so 'ahead' would land at the
  // BOTTOM of the scope without this [flip]." That is, texture row 0 is
  // where "ahead" would paint WITHOUT the flip -- i.e. row 0 is the
  // BOTTOM of the scope, and the flip (which IS applied) moves "ahead" to
  // the HIGH-row end instead. So in the raw sampler-row space `py` counts
  // (row 0 = top of the underlying texture memory, per that same
  // comment's WebGPU convention), a small `py` is close to texture row 0
  // -- the scope's bottom -- and a large `py` is toward its top. (An
  // earlier draft of this test had this backwards; corrected 2026-09-23
  // against the shader's own documented reasoning, not just re-guessed.)
  it('bearing 0 (ahead) lands in the high-py half — the flip moves it off row 0, away from the scope bottom', () => {
    expect(scopeTexelFor(0, 5, 15).py).toBeGreaterThan(RADAR_TEXELS_Y / 2)
  })
  it('bearing pi (astern) lands in the low-py half, toward the scope bottom (texture row 0)', () => {
    expect(scopeTexelFor(Math.PI, 5, 15).py).toBeLessThan(RADAR_TEXELS_Y / 2)
  })
  it('bearing +pi/2 (right) lands in the right half', () => {
    expect(scopeTexelFor(Math.PI / 2, 5, 15).px).toBeGreaterThan(RADAR_TEXELS_X / 2)
  })
  it('bearing -pi/2 (left) lands in the left half', () => {
    expect(scopeTexelFor(-Math.PI / 2, 5, 15).px).toBeLessThan(RADAR_TEXELS_X / 2)
  })
})
