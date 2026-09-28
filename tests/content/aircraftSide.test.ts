import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { parseLibraryEntry } from '../../src/render/hangar/library.js'

describe('each flyable spec agrees with its Library entry', () => {
  const library = readdirSync('content/library').map((f) => parseLibraryEntry(JSON.parse(readFileSync(`content/library/${f}`, 'utf8'))))
  for (const f of readdirSync('content/aircraft').filter((n) => n.endsWith('.json'))) {
    const spec = loadAircraftSpec(f.slice(0, -5))
    it(`${spec.id}: side matches the Library`, () => {
      const entry = library.find((e) => e.spec === spec.id)
      expect(entry, `no Library entry has spec ${spec.id}`).toBeDefined()
      expect(spec.side).toBe(entry!.side)
    })
  }
  it('SF-R1: no weapons or AI code reads the spec-level side', () => {
    for (const dir of ['src/sim/weapons', 'src/sim/ai']) {
      for (const f of readdirSync(dir, { recursive: true }) as string[]) {
        if (!f.endsWith('.ts')) continue
        expect(readFileSync(`${dir}/${f}`, 'utf8'), `${dir}/${f}`).not.toMatch(/spec\.side\b/)
      }
    }
  })
})
