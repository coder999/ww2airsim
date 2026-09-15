import { describe, expect, it } from 'vitest'
import { butterflyStages } from '../../../src/render/ocean/fft.js'
import { fftKernelSource, evolveKernelSource } from '../../../src/render/ocean/wgsl.js'

describe('raw WGSL FFT generation', () => {
  it.each([16, 64, 128, 256])('uses the reference stages and shared memory at N=%i', (n) => {
    const source = fftKernelSource(n)
    expect(source).toContain(`STAGES: u32 = ${butterflyStages(n).length}u`)
    expect(source).toContain('var<workgroup>')
    expect(source).toContain('workgroupBarrier()')
    expect(source).toContain('reverseBits')
    expect(source).toContain('@compute')
    expect(source).toContain('@binding(0)')
    expect(source).toContain('@binding(1)')
  })
  it('rejects unsupported transforms', () => {
    expect(() => fftKernelSource(48)).toThrow()
    expect(() => fftKernelSource(512)).toThrow()
  })
  it('evolves phase with deep-water dispersion', () => {
    expect(evolveKernelSource()).toContain('sqrt(G *')
  })
})
