import { describe, it, expect } from 'vitest'
import { normalizeGpuError } from '../../src/render/renderer.js'

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
