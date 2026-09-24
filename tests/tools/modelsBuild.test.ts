import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'

// Upper bound from Step 2's actual measured output size, rounded up --
// catches a future re-run of models:build silently ballooning back toward
// the 73.9 MB raw input (e.g. a flag typo dropping --texture-compress).
const MAX_BYTES = 3_000_000

describe('content/aircraft/wildcat.glb', () => {
  it('is committed and under the compressed size budget', () => {
    expect(existsSync('content/aircraft/wildcat.glb')).toBe(true)
    expect(statSync('content/aircraft/wildcat.glb').size).toBeLessThan(MAX_BYTES)
  })

  it('still has the named nodes and baked animation wildcat.ts depends on', () => {
    const buf = readFileSync('content/aircraft/wildcat.glb')
    const jsonLength = buf.readUInt32LE(12)
    const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
    const names = new Set((doc.nodes ?? []).map((n: { name?: string }) => n.name ?? ''))
    for (const required of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
      expect(names.has(required)).toBe(true)
    }
    expect(doc.animations).toHaveLength(1)
  })
})
