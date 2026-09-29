import { describe, expect, it } from 'vitest'
import { FX_CATALOG, type FxCatalog } from '../../src/render/fx/catalog.js'
import { FX_SHEETS, type FxSheetLayout } from '../../src/render/fx/sheetManifest.js'
import {
  createFxSystem, createInstanceArrays, flipbookFrame, fxDtSeconds, lifeAlpha, lifeSize, sampleDirection, type FxSystem,
} from '../../src/render/fx/system.js'
import { FX_MAX_CAPACITY, FX_TIERS } from '../../src/render/fx/tiers.js'
import { length, v3, ZERO } from '../../src/sim/math/vec3.js'

const layout: FxSheetLayout = { frames: 16, cols: 3, rows: 2, motionScale: 0.02, cellOf: Object.fromEntries(FX_SHEETS.map((s, i) => [s, i])) as FxSheetLayout['cellOf'] }
const make = (capacity = 4096, seed = 1944): FxSystem => createFxSystem({ capacity, seed, catalog: FX_CATALOG, layout })
const run = (fx: FxSystem, seconds: number): void => { for (let i = 0; i < Math.round(seconds * 60); i++) fx.step(1 / 60) }
const snapshot = (fx: FxSystem, eye = ZERO): Float32Array[] => {
  const out = createInstanceArrays(FX_MAX_CAPACITY)
  const n = fx.writeInstances(eye, out)
  return [out.posSize, out.anim, out.tint, out.vel].map((a) => a.slice(0, n * 4))
}
const cellCount = (fx: FxSystem, cell: number): number => { const [, anim] = snapshot(fx); let n = 0; for (let i = 3; i < anim!.length; i += 4) if (anim![i] === cell) n++; return n }

describe('fx system (effects design §3.4)', () => {
  it('is deterministic under a seed, and the seed matters', () => {
    const a = make(), b = make(), c = make(4096, 7)
    for (const fx of [a, b, c]) { fx.trigger('bomb.land', v3(0, 0, 0), ZERO); run(fx, 0.5) }
    expect(snapshot(a)).toEqual(snapshot(b))
    expect(snapshot(a)).not.toEqual(snapshot(c))
  })

  it('a burst spawns its count', () => {
    const fx = make(); fx.trigger('round.land', v3(0, 0, 0), ZERO)
    expect(fx.live()).toBe(2)
  })

  for (const tier of ['high', 'medium', 'low'] as const) {
    it(`respects the ${tier} cap (${FX_TIERS[tier].capacity})`, () => {
      const fx = make(FX_TIERS[tier].capacity)
      for (let i = 0; i < 80; i++) fx.trigger('bomb.land', v3(i, 0, 0), ZERO) // 80 * 62 = 4960 burst particles
      expect(fx.live()).toBe(FX_TIERS[tier].capacity)
      run(fx, 2)
      expect(fx.live()).toBeLessThanOrEqual(FX_TIERS[tier].capacity)
    })
  }

  it('recycles the oldest only when full, and uses a free slot first', () => {
    const fx = make(4)
    fx.trigger('round.land', ZERO, ZERO); fx.trigger('round.land', ZERO, ZERO) // serials 0..3, full
    fx.trigger('round.land', ZERO, ZERO)
    expect(fx.liveSerials()).toEqual([2, 3, 4, 5])
    run(fx, 1.5) // round.land lives <= 1.2 s
    expect(fx.live()).toBe(0)
    fx.trigger('round.land', ZERO, ZERO)
    expect(fx.liveSerials()).toEqual([6, 7])
  })

  it('evicts oldest-first across many fills without drifting (FIFO compaction)', () => {
    const fx = make(100)
    for (let i = 0; i < 5000; i++) fx.trigger('round.land', ZERO, ZERO)
    expect(fx.liveSerials()).toEqual(Array.from({ length: 100 }, (_, k) => 9900 + k))
  })

  it('setCapacity to a lower tier keeps the newest; raising it again keeps working (tier change mid-flight)', () => {
    const fx = make(4096)
    for (let i = 0; i < 48; i++) fx.trigger('bomb.land', v3(i, 0, 0), ZERO) // 2976
    const before = fx.liveSerials()
    fx.setCapacity(1024)
    expect(fx.capacity()).toBe(1024)
    expect(fx.liveSerials()).toEqual(before.slice(-1024))
    fx.trigger('bomb.land', ZERO, ZERO)
    expect(fx.live()).toBe(1024)
    fx.setCapacity(4096)
    fx.trigger('bomb.land', ZERO, ZERO)
    expect(fx.live()).toBe(1024 + 62)
  })

  it('a timed stream (the bomb smoke column) runs for its duration after its delay, then dies out', () => {
    const fx = make(); fx.trigger('bomb.land', ZERO, ZERO)
    run(fx, 5)
    // 6/s from 0.5 s: 27 by 5 s, all still alive (life >= 8 s)
    expect(cellCount(fx, layout.cellOf.smoke)).toBeGreaterThanOrEqual(26)
    expect(cellCount(fx, layout.cellOf.smoke)).toBeLessThanOrEqual(28)
    run(fx, 27) // stream ends at 18.5 s; its last particle dies by 30.5 s
    expect(cellCount(fx, layout.cellOf.smoke)).toBe(0)
  })

  it('a sustained emitter emits rate x intensity while listed, and stops when dropped', () => {
    const fx = make()
    const smoke = (intensity: number) => [{ key: 'engine:a', recipe: 'engine.smoke' as const, intensity, position: v3(0, 1000, 0), velocity: v3(100, 0, 0) }]
    fx.setSustained(smoke(1)); run(fx, 1)
    expect(fx.live()).toBeGreaterThanOrEqual(13); expect(fx.live()).toBeLessThanOrEqual(15) // 14/s
    const at1 = fx.live()
    fx.setSustained(smoke(0.5)); run(fx, 1) // life >= 2 s: nothing has died yet
    expect(fx.live() - at1).toBeGreaterThanOrEqual(6); expect(fx.live() - at1).toBeLessThanOrEqual(8)
    fx.setSustained([]); const at2 = fx.live(); run(fx, 0.5)
    expect(fx.live()).toBeLessThanOrEqual(at2)
  })

  it('a seaKill particle is removed at sea level, long before its life ends (spec §5.1)', () => {
    // A long-lived, slow, straight-up droplet: it can only die by falling
    // below the sea (y = 0.5 + t - 4.9 t^2 crosses 0 near 0.5 s).
    const drop = (seaKill: boolean): FxCatalog => ({ ...FX_CATALOG, 'round.water': { ...FX_CATALOG['round.water'],
      emitters: [{ ...FX_CATALOG['round.water'].emitters[0]!, count: 1, lifeS: [10, 10], speedMps: [1, 1], spreadDeg: 0, dragPerS: 0, accelYMps2: -9.81, seaKill }] } })
    for (const seaKill of [true, false]) {
      const fx = createFxSystem({ capacity: 16, seed: 1, catalog: drop(seaKill), layout })
      fx.trigger('round.water', v3(0, 0.5, 0), ZERO)
      run(fx, 1.5)
      expect(fx.live()).toBe(seaKill ? 0 : 1)
    }
  })

  it('step(0) -- a paused game -- changes nothing; fxDtSeconds scales, freezes and clamps (Review Focus 4)', () => {
    const fx = make(); fx.trigger('bomb.land', ZERO, ZERO); run(fx, 0.3)
    const before = snapshot(fx)
    fx.step(0)
    expect(snapshot(fx)).toEqual(before)
    expect(fxDtSeconds(1 / 60, true, 1)).toBe(0)
    expect(fxDtSeconds(1 / 60, false, 3)).toBeCloseTo(3 / 60, 12)
    expect(fxDtSeconds(5, false, 1)).toBe(0.1)
  })

  it('clear() empties the pool and stops timed streams (restart, Review Focus 3)', () => {
    const fx = make(); fx.trigger('bomb.land', ZERO, ZERO); run(fx, 1)
    fx.clear()
    expect(fx.live()).toBe(0)
    run(fx, 5)
    expect(fx.live()).toBe(0)
  })

  it('writes back to front', () => {
    const fx = make()
    for (const x of [100, -300, 50, 900, -20]) fx.trigger('round.land', v3(x, 0, 0), ZERO)
    const [pos] = snapshot(fx, v3(0, 10, 0))
    let last = Infinity
    for (let i = 0; i < pos!.length; i += 4) {
      const d = Math.hypot(pos![i]!, pos![i + 1]! - 10, pos![i + 2]!)
      expect(d).toBeLessThanOrEqual(last + 1e-3)
      last = d
    }
  })

  it('life curves: fade in, fade out, grow; flipbook plays once or loops', () => {
    expect(lifeAlpha(0, 1)).toBe(0)
    expect(lifeAlpha(0.3, 0.8)).toBeCloseTo(0.8, 12)
    expect(lifeAlpha(1, 1)).toBe(0)
    expect(lifeSize(0, 2, 10)).toBe(2)
    expect(lifeSize(1, 2, 10)).toBe(10)
    expect(lifeSize(0.5, 2, 10)).toBeGreaterThan(6) // grows fast, then settles
    expect(flipbookFrame(0, 2, 16)).toBe(0)
    expect(flipbookFrame(2, 2, 16)).toBe(15)
    expect(flipbookFrame(1.25, 1, 16, 12)).toBeCloseTo(15, 12)
    expect(flipbookFrame(1.5, 1, 16, 12)).toBeCloseTo(2, 12)
  })

  it('directions stay inside their cone, on the unit sphere', () => {
    for (let i = 0; i < 200; i++) {
      const r1 = (i * 0.618) % 1, r2 = (i * 0.414) % 1
      const up = sampleDirection('up', 30, r1, r2)
      expect(length(up)).toBeCloseTo(1, 9)
      expect(up.y).toBeGreaterThanOrEqual(Math.cos(Math.PI / 6) - 1e-9)
      const ring = sampleDirection('ring', 10, r1, r2)
      expect(ring.y).toBeGreaterThanOrEqual(-1e-9); expect(ring.y).toBeLessThanOrEqual(Math.sin(Math.PI / 18) + 1e-9)
      expect(length(sampleDirection('sphere', 180, r1, r2))).toBeCloseTo(1, 9)
    }
  })
})

describe('reset(seed) (instant replay R-3)', () => {
  it('makes a run reproducible whatever the system did before', () => {
    const burst = (fx: FxSystem) => {
      fx.reset(7)
      fx.trigger('crash.water', v3(0, 0, 0), ZERO)
      for (let i = 0; i < 30; i++) fx.step(1 / 60)
      return { serials: fx.liveSerials(), live: fx.live() }
    }
    const fx = make()
    fx.trigger('crash.land', v3(10, 0, 0), ZERO) // consume the RNG first
    fx.step(0.2)
    const a = burst(fx)
    const b = burst(fx)
    expect(a.live).toBeGreaterThan(0)
    expect(b).toEqual(a)
  })
})
