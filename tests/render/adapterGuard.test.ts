import { describe, it, expect } from 'vitest'
import { judgeAdapter } from '../../src/render/adapterGuard.js'

/** Exactly what Chrome 152 returned on the reference platform, 2026-09-12. */
const REFERENCE = {
  vendor: 'amd',
  architecture: 'rdna-2',
  device: '',
  description: '',
  isFallbackAdapter: false,
}

describe('judgeAdapter', () => {
  it('accepts the reference platform as measured', () => {
    const v = judgeAdapter(REFERENCE)
    expect(v.ok).toBe(true)
    expect(v.severity).toBe('ok')
  })

  it('accepts the hyphenated architecture Chrome actually reports', () => {
    // The day-0 probe tested /rdna ?2/ and Chrome reports 'rdna-2', so a
    // correctly identified adapter was reported as unconfirmed. Cost one round
    // trip to the reference platform.
    expect(judgeAdapter({ ...REFERENCE, architecture: 'rdna 2' }).ok).toBe(true)
    expect(judgeAdapter({ ...REFERENCE, architecture: 'rdna-2' }).ok).toBe(true)
  })

  it('does not require device or description, which Chrome leaves empty', () => {
    // Master spec §11 says the guard should confirm vendor/device identify the
    // RX 6700 XT. Measured: Chrome returns both as empty strings for
    // fingerprinting reasons, so that guard is not implementable as written.
    expect(judgeAdapter({ ...REFERENCE, device: '', description: '' }).ok).toBe(true)
  })

  it('fails a fallback adapter even when the strings look right', () => {
    const v = judgeAdapter({ ...REFERENCE, isFallbackAdapter: true })
    expect(v.ok).toBe(false)
    expect(v.severity).toBe('fail')
  })

  it('fails a software rasterizer by name', () => {
    for (const s of ['SwiftShader', 'llvmpipe', 'Microsoft Basic Render Driver']) {
      const v = judgeAdapter({ ...REFERENCE, vendor: 'google', architecture: '', description: s })
      expect(v.ok).toBe(false)
      expect(v.severity).toBe('fail')
      expect(v.summary).toMatch(/software/i)
    }
  })

  it('warns rather than failing on an unrecognised real adapter', () => {
    // A laptop should still run the game. Only Tier 2 treats this as fatal.
    const v = judgeAdapter({ ...REFERENCE, vendor: 'intel', architecture: 'gen-12lp' })
    expect(v.ok).toBe(false)
    expect(v.severity).toBe('warn')
  })

  it('says what it saw, so a report is actionable', () => {
    expect(judgeAdapter({ ...REFERENCE, vendor: 'intel', architecture: 'gen-12lp' }).summary)
      .toMatch(/intel/)
  })
})
