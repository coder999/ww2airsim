import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COVERAGE_TABLE_SIZE, coverageRadiusScale, cumulusFootprint, skyCoverageTable, createCloudField, CUMULUS_SIGMA, DETAIL_TILE_M, remap, SHAPE_TILE_M, WEATHER_TILE_M } from '../../src/render/scene/cloudField.js'
import { createClouds } from '../../src/render/scene/clouds.js'
import { MAX_CLOUD_LAYERS } from '../../src/sim/scenario.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadCumulus, loadCurl, loadWeather, loadDetail, loadShape } from '../../tools/sky/load.js'
import { WEATHER_SIZE } from '../../src/render/sky/noise.js'
import { v3 } from '../../src/sim/math/vec3.js'

const noise = { shape: loadShape(), detail: loadDetail(), curl: loadCurl(), weather: loadWeather(), cumulus: loadCumulus() }

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
    expect(SHAPE_TILE_M).toBe(2560)
    expect(CUMULUS_SIGMA).toBe(0.012)
  })
  it('retiles the cumulus-only detail volume finer for the up-close view (Plan 16d)', () => {
    // DETAIL_TILE_M is sampled only in density()'s cumulus branch -- cirrus
    // never reads `detail` -- so this is the whole fix for "pixelated up
    // close," not a partial one (design §2).
    expect(DETAIL_TILE_M).toBe(40)
  })
  it('exposes the RGBA weather map that places individual cumulus (Cloud Fidelity II 3.3)', () => {
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    expect(field.weather.image.width).toBe(WEATHER_SIZE)
    expect(field.weather.image.height).toBe(WEATHER_SIZE)
    expect((field.weather.image.data as Uint8Array).length).toBe(WEATHER_SIZE ** 2 * 4)
    expect(WEATHER_TILE_M).toBe(40_000)
    field.dispose()
  })
  it('thresholds the map so a layer\'s coverage is the fraction of the SKY in cloud', () => {
    // src/sim/scenario.ts: a layer covers `coverage` of the sky. On the
    // pre-coverage-table VDB branch free-flight's 0.45 drew 0.15 and nothing
    // could exceed 0.245 (plan 2026-09-26-cloud-vdb-coverage).
    const footprint = cumulusFootprint(noise.cumulus)
    const table = skyCoverageTable(noise.weather, footprint)
    expect(table.thresholds).toHaveLength(COVERAGE_TABLE_SIZE)
    // Monotonic: more coverage, lower threshold.
    for (let k = 1; k < COVERAGE_TABLE_SIZE; k++) expect(table.thresholds[k]!).toBeLessThanOrEqual(table.thresholds[k - 1]!)
    // Every shipped scenario's coverage is reachable with room to spare:
    // free-flight 0.45, deck-quals 0.55.
    for (let k = 0; k < COVERAGE_TABLE_SIZE; k++) {
      const c = k / (COVERAGE_TABLE_SIZE - 1)
      if (c <= 0.5625) expect(table.reachable[k]!, `coverage ${c}`).toBeGreaterThanOrEqual(c + 0.03)
    }
    expect(table.reachable[COVERAGE_TABLE_SIZE - 1]!).toBeGreaterThan(0.6)
    // Zero coverage leaves no cloud alive: the threshold clears every strength.
    expect(table.thresholds[0]! + 0.045).toBeGreaterThan(1 - 1 / 255 - 0.03)
    // A different sample of the same map lands on the same thresholds: the
    // table is a property of the map, not of the twin's stride.
    const dense = skyCoverageTable(noise.weather, footprint, COVERAGE_TABLE_SIZE, 1)
    for (const k of [8, 14, 18]) expect(Math.abs(dense.thresholds[k]! - table.thresholds[k]!), `entry ${k}`).toBeLessThan(0.01)
  })
  it('grows clouds with coverage so broken decks are merged cells', () => {
    expect(coverageRadiusScale(0)).toBe(1)
    expect(coverageRadiusScale(0.2)).toBe(1)
    expect(coverageRadiusScale(0.65)).toBe(1.5)
    expect(coverageRadiusScale(1)).toBe(1.5)
    for (let c = 0.2; c < 0.65; c += 0.05) expect(coverageRadiusScale(c + 0.05)).toBeGreaterThan(coverageRadiusScale(c))
  })
  it('stores a runner-up plane holding a second, different cloud', () => {
    const plane = WEATHER_SIZE * WEATHER_SIZE * 4
    expect(noise.weather.length).toBe(plane * 2)
    let seconds = 0
    for (let i = 0; i < WEATHER_SIZE * WEATHER_SIZE; i++) {
      const w = noise.weather.subarray(i * 4, i * 4 + 4), r = noise.weather.subarray(plane + i * 4, plane + i * 4 + 4)
      if (r[0] === 0) { expect(r[1]! | r[2]! | r[3]!).toBe(0); continue }
      seconds++
      // A different cloud: not the winner's centre.
      expect(r[1] === w[1] && r[2] === w[2]).toBe(false)
    }
    // At 1200 m spacing with 660-1900 m bumps, most of the sky has a second cloud in reach.
    expect(seconds / (WEATHER_SIZE * WEATHER_SIZE)).toBeGreaterThan(0.5)
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

describe('laidOut density (loading spec §A.3)', () => {
  it('returns a fresh Fn pair per call, so no two materials share one', () => {
    // three 0.186 caches a laid-out Fn's code per backend by Fn identity,
    // with the FIRST builder's binding names; sharing one across materials
    // fails WGSL validation ("unresolved value 'nodeUniform3'").
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    const a = field.laidOut()
    const b = field.laidOut()
    expect(a.density).not.toBe(b.density)
    expect(a.densityCoarse).not.toBe(b.densityCoarse)
  })
})
