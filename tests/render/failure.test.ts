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
    // 'thermal shutdown code 0x7' shares no vocabulary with the hardcoded
    // prose below, so the /reload|driver/ match below can only be satisfied
    // by that prose, not by echoing this input back -- verified by deleting
    // the hardcoded explanation and watching this fail (see fix-round-1 notes).
    const m = failureMessage('device-lost', 'thermal shutdown code 0x7')
    expect(m.title).toMatch(/lost/i)
    expect(m.detail).toMatch(/reload|driver/i)
    expect(m.detail).toContain('thermal shutdown code 0x7')
  })

  it('surfaces a content validation failure with the offending field', () => {
    const m = failureMessage('bad-content', 'aero.cd0: Required')
    expect(m.title).toMatch(/valid/i)
    // A substring that can only come from the hardcoded label/explanation,
    // never from the echoed detail -- the field-name check below alone would
    // still pass on a bare `{ title, detail }` passthrough, since the field
    // name is exactly what got echoed.
    expect(m.detail).toMatch(/schema-validated|Offending field/i)
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
