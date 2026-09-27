import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIM = fileURLToPath(new URL('../../src/sim/', import.meta.url))
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
})

describe('the impacts ring is write-only inside the sim (effects design §3.1)', () => {
  it('no src/sim file other than its writers reads `.impacts`', () => {
    const writers = new Set(['weapons/combat.ts', 'weapons/impacts.ts'])
    const readers = walk(SIM)
      .filter((p) => !writers.has(relative(SIM, p).split('\\').join('/')))
      .filter((p) => /\.impacts\b/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SIM, p))
    expect(readers).toEqual([])
  })
})
