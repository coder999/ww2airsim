import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
})

describe('the six old effects stay deleted (ordnance-and-effects design §3.5)', () => {
  it('their files are gone', () => {
    for (const f of ['src/render/scene/impactEffect.ts', 'src/render/scene/hitFlash.ts', 'src/render/scene/smoke.ts']) {
      expect(existsSync(join(ROOT, f)), f).toBe(false)
    }
  })
  it('nothing under src/render builds one again', () => {
    const gone = ['createImpactEffect', 'createHitFlashes', 'nextHitFlashes', 'createEngineSmoke', 'createSmokeColumn', 'nextOrdnanceImpacts', 'spawnImpact']
    const hits = walk(join(ROOT, 'src/render')).flatMap((p) => gone.filter((g) => readFileSync(p, 'utf8').includes(g)).map((g) => `${p}: ${g}`))
    expect(hits).toEqual([])
  })
  it('ordnance.ts keeps only the stores in flight', () => {
    const src = readFileSync(join(ROOT, 'src/render/ordnance.ts'), 'utf8')
    expect(src).toContain('ordnanceInstances')
    expect(src).not.toContain('PlaneGeometry')
  })
})
