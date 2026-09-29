import { describe, it, expect } from 'vitest'
import { BINDINGS } from '../../src/input/bindings.js'

describe('BINDINGS', () => {
  it('gives every key to exactly one action', () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const [name, codes] of Object.entries(BINDINGS)) {
      for (const code of codes) {
        const prior = owner.get(code)
        if (prior !== undefined && prior !== name) clashes.push(`${code}: ${prior} and ${name}`)
        owner.set(code, name)
      }
    }
    expect(clashes).toEqual([])
  })
})
