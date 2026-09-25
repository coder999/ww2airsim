import { describe, it, expect } from 'vitest'
import { normalizeGpuError, requiredDeviceLimits } from '../../src/render/renderer.js'
import { TERRAIN_HEADER } from '../../src/render/terrain/load.js'
import { finestFetchedLevelFor } from '../../src/render/content.js'
import { samplesAtLevel } from '../../src/sim/world/schema.js'

describe('normalizeGpuError', () => {
  // @types/three declares Renderer.onError as (errorMessage: string) => void,
  // but the installed three@0.186.0 runtime actually calls it with an object
  // (node_modules/three/src/renderers/webgpu/WebGPUBackend.js:281-291).
  // normalizeGpuError has to cope with whichever one actually shows up.

  it('passes a bare string straight through', () => {
    expect(normalizeGpuError('boom')).toBe('boom')
  })

  it('extracts message from the object shape the runtime actually sends', () => {
    expect(normalizeGpuError({ message: 'out of memory' })).toBe('out of memory')
  })

  it('falls back to a fixed string when the object has no message', () => {
    expect(normalizeGpuError({})).toBe('Unknown GPU error')
  })

  it('falls back to a fixed string when message is an empty string', () => {
    expect(normalizeGpuError({ message: '' })).toBe('Unknown GPU error')
  })
})

describe('requiredDeviceLimits', () => {
  // WebGPU's defaults; a device gets only these unless a limit is requested.
  const WEBGPU_DEFAULT_MAX_2D = 8192
  const WEBGPU_DEFAULT_MAX_BUFFER = 268_435_456
  // What the RX 6700 XT advertises (Tier 2, 2026-09-25); Mark's Intel
  // gen-12lp laptop advertises the same texture maximum.
  const REFERENCE = { maxTextureDimension2D: 16384, maxBufferSize: 2_147_483_648 }

  it('requests enough to create and upload the finest terrain level', () => {
    const n = samplesAtLevel(TERRAIN_HEADER, finestFetchedLevelFor('ultra'))
    // Staging for WriteTexture: one r32float row per texel row, padded to 256 bytes.
    const staging = n * Math.ceil((n * 4) / 256) * 256
    // The regression: L0 is past both defaults.
    expect(n).toBeGreaterThan(WEBGPU_DEFAULT_MAX_2D)
    expect(staging).toBeGreaterThan(WEBGPU_DEFAULT_MAX_BUFFER)
    const limits = requiredDeviceLimits(REFERENCE)
    expect(limits.maxTextureDimension2D).toBeGreaterThanOrEqual(n)
    expect(limits.maxBufferSize).toBeGreaterThanOrEqual(staging)
  })

  it('never asks for more than the adapter offers, so requestDevice cannot fail on it', () => {
    const small = { maxTextureDimension2D: 8192, maxBufferSize: WEBGPU_DEFAULT_MAX_BUFFER }
    expect(requiredDeviceLimits(small)).toEqual(small)
  })
})
