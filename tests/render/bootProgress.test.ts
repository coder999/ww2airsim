import { describe, expect, it } from 'vitest'
import { BOOT_STAGES, createBootProgress, readyBootProgress } from '../../src/render/bootProgress.js'

describe('bootProgress (loading spec §A.2)', () => {
  it('starts at zero with the first stage waiting, not ready', () => {
    const p = createBootProgress()
    expect(p.fraction).toBe(0)
    expect(p.ready).toBe(false)
    expect(p.label).toBe('Preparing aircraft...')
  })

  it('advances the fraction by stage weight only when a stage ends, and labels the running stage', () => {
    const p = createBootProgress()
    const total = BOOT_STAGES.reduce((s, x) => s + x.weight, 0)
    p.begin('renderer')
    expect(p.label).toBe(BOOT_STAGES[0]!.label)
    expect(p.fraction).toBe(0)
    p.end('renderer')
    expect(p.fraction).toBeCloseTo(BOOT_STAGES[0]!.weight / total, 10)
  })

  it('is ready exactly when the shaders stage ends, at fraction 1', () => {
    const p = createBootProgress()
    for (const { stage } of BOOT_STAGES) { p.begin(stage); p.end(stage) }
    expect(p.ready).toBe(true)
    expect(p.fraction).toBe(1)
  })

  it('throws on an end without its begin, and on a stage out of order', () => {
    const p = createBootProgress()
    expect(() => p.end('renderer')).toThrow(/renderer/)
    expect(() => p.begin('sky')).toThrow(/renderer/)
  })

  it('notifies listeners on every change, and a ready listener fires once, not again', () => {
    const p = createBootProgress()
    let calls = 0
    const off = p.onChange(() => { calls++ })
    p.begin('renderer')
    expect(calls).toBe(1)
    off()
    p.end('renderer')
    expect(calls).toBe(1)
  })

  it('readyBootProgress is ready at fraction 1 and never calls a listener', () => {
    const p = readyBootProgress()
    let calls = 0
    p.onChange(() => { calls++ })
    expect(p.ready).toBe(true)
    expect(p.fraction).toBe(1)
    expect(calls).toBe(0)
  })
})
