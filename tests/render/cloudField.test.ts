import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCloudField, COVERAGE_TILE_M, CUMULUS_SIGMA, DETAIL_TILE_M, remap, SHAPE_TILE_M } from '../../src/render/scene/cloudField.js'
import { createClouds } from '../../src/render/scene/clouds.js'
import { MAX_CLOUD_LAYERS } from '../../src/sim/scenario.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadCoverage, loadDetail, loadShape } from '../../tools/sky/load.js'
import { COVERAGE_SIZE } from '../../src/render/sky/noise.js'
import { v3 } from '../../src/sim/math/vec3.js'

const noise = { shape: loadShape(), detail: loadDetail(), coverage: loadCoverage() }

describe('cloud field (Plan 16b, extracted from the dome)', () => {
  it('holds the shipped decks sorted by base, padded to the maximum, and names the lowest cumulus', () => {
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    expect(field.layers.map((l) => l.kind)).toEqual(['cumulus', 'cirrus'])
    expect(field.layerCount.value).toBe(2)
    expect(field.layerData.array).toHaveLength(MAX_CLOUD_LAYERS)
    expect(field.lowestCumulus()).toEqual({ baseM: 1500, topM: 2400 })
    field.dispose()
  })
  it('reports no cumulus for a clear sky and for a cirrus-only deck', () => {
    expect(createCloudField([], noise).lowestCumulus()).toBeNull()
    const cirrus = createCloudField([{ kind: 'cirrus', baseM: 7000, thicknessM: 300, coverage: 0.35 }], noise)
    expect(cirrus.lowestCumulus()).toBeNull()
    expect(cirrus.layerCount.value).toBe(1)
  })
  it('drifts with the wind and moves the eye', () => {
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    field.update(v3(10, 1000, -20), 12, v3(5, 0, -2))
    expect(field.eyeWorld.value.toArray()).toEqual([10, 1000, -20])
    expect(field.drift.value.toArray()).toEqual([60, -24])
    field.dispose()
  })
  it('is shared by the dome when passed in, and made by the dome when not', () => {
    const layers = loadScenario('free-flight').weather.clouds ?? []
    const field = createCloudField(layers, noise)
    const shared = createClouds(layers, noise, field)
    shared.update(v3(1, 2, 3), 1, null)
    expect(field.eyeWorld.value.toArray()).toEqual([1, 2, 3])
    const own = createClouds(layers, noise)
    own.update(v3(4, 5, 6), 1, null)
    expect(field.eyeWorld.value.toArray()).toEqual([1, 2, 3])
    shared.dispose()
    own.dispose()
  })
  it('keeps the constants the dome was tuned with', () => {
    expect(SHAPE_TILE_M).toBe(6000)
    expect(CUMULUS_SIGMA).toBe(0.012)
  })
  it('retiles the cumulus-only detail volume finer for the up-close view (Plan 16d)', () => {
    // DETAIL_TILE_M is sampled only in density()'s cumulus branch -- cirrus
    // never reads `detail` -- so this is the whole fix for "pixelated up
    // close," not a partial one (design §2).
    expect(DETAIL_TILE_M).toBe(150)
  })
  it('exposes a coverage field that spatially modulates cumulus (Plan 16d)', () => {
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    expect(field.coverage.image.width).toBe(COVERAGE_SIZE)
    expect(field.coverage.image.height).toBe(COVERAGE_SIZE)
    const data = field.coverage.image.data as Uint8Array
    expect(Math.max(...data) - Math.min(...data)).toBeGreaterThan(80)
    expect(COVERAGE_TILE_M).toBe(60_000)
    field.dispose()
  })
  it('is imported only by the dome and the shadow pass: one field, two readers', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'render')
    const importers: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (entry.name.endsWith('.ts') && readFileSync(p, 'utf8').includes("/cloudField.js'")) importers.push(entry.name)
      }
    }
    walk(root)
    // main.ts is the composition root: it CONSTRUCTS the field and hands it
    // to both readers, but never samples the density. Anything else here is
    // a third reader, which is the defect this test exists to catch.
    expect(importers.sort()).toEqual(['cloudShadow.ts', 'clouds.ts', 'main.ts'].filter((f) => importers.includes(f)))
    expect(importers).toContain('clouds.ts')
  })
})

describe('remap (photoreal Task 10, Schneider 2015)', () => {
  it('maps [lo0, hi0] linearly onto [lo1, hi1]', () => {
    expect(remap(0.5, 0, 1, 0, 10)).toBe(5)
    expect(remap(0.2, 0.2, 1, 0, 1)).toBe(0)
    expect(remap(1, 0.2, 1, 0, 1)).toBe(1)
  })
  it('returns lo1 rather than dividing by zero when the input range is empty', () => {
    expect(remap(0.7, 0.4, 0.4, 0.25, 1)).toBe(0.25)
  })
})
