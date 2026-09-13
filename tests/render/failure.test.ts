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

describe('failure kinds match the condition that actually occurred', () => {
  // Review 2026-09-13: two kinds were reached from more than one condition and
  // hard-coded prose for only one of them, so the screen asserted a cause the
  // caller had not established. The test could not catch it because it fed
  // `failureMessage` the one detail string for which the label was accurate.

  it('does not blame the tunnel when navigator.gpu was present', () => {
    // requestAdapter() returning null used to raise 'no-webgpu', whose message
    // sends the operator to check their SSH tunnel. That advice is impossible
    // here: without the tunnel there would have been no navigator.gpu to call.
    const m = failureMessage('no-adapter', 'requestAdapter returned null')
    expect(m.detail).not.toMatch(/tunnel|secure context|localhost/i)
    expect(m.detail).toMatch(/adapter|GPU process|driver|policy/i)
    // And it must still be distinguishable from the genuinely-absent case.
    expect(m.title).not.toBe(failureMessage('no-webgpu', '').title)
  })

  it('only calls a content detail an "offending field" when it is one', () => {
    // A 404 and a JSON parse error both arrive as 'bad-content'. Rendering
    // "Offending field: Failed to fetch aircraft content: 404 Not Found" is a
    // false statement shown to the operator, which is the loudest form of this
    // project's named defect.
    const zod = failureMessage('bad-content', 'aero.cd0: Required')
    expect(zod.detail).toContain('Offending field: aero.cd0: Required')
    const http = failureMessage('bad-content', 'Failed to fetch aircraft content: 404 Not Found')
    expect(http.detail).not.toContain('Offending field')
    expect(http.detail).toContain('404 Not Found')
    const parse = failureMessage('bad-content', 'Unexpected token < in JSON at position 0')
    expect(parse.detail).not.toContain('Offending field')
  })
})
