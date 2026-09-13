import { describe, it, expect } from 'vitest'
import { failureMessage } from '../../src/render/failure.js'

describe('failureMessage', () => {
  it('tells you what to do about a missing navigator.gpu, not just that it is missing', () => {
    const m = failureMessage('no-webgpu', '')
    expect(m.title).toMatch(/WebGPU/i)
    expect(m.detail).toMatch(/secure context|localhost|tunnel/i)
  })

  it('names the software rasterizer case as a distinct failure', () => {
    const m = failureMessage('software-adapter', 'vendor="google"')
    expect(m.title).toMatch(/software/i)
    expect(m.detail).toMatch(/vendor="google"/)
  })

  it('explains a lost device as recoverable rather than as a crash', () => {
    const m = failureMessage('device-lost', 'driver reset')
    expect(m.detail).toMatch(/reload|driver/i)
  })

  it('surfaces a content validation failure with the offending field', () => {
    const m = failureMessage('bad-content', 'aero.cd0: Required')
    expect(m.detail).toMatch(/aero\.cd0/)
  })

  it('never returns an empty message for any kind', () => {
    for (const k of ['no-webgpu', 'software-adapter', 'device-lost', 'bad-content', 'unknown'] as const) {
      const m = failureMessage(k, '')
      expect(m.title.length).toBeGreaterThan(0)
      expect(m.detail.length).toBeGreaterThan(0)
    }
  })
})
