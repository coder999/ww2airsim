import { describe, expect, it } from 'vitest'
import { SOLID_CRASH_SETTLE_S, solidCrashMotion, type SurfaceCrashVisual } from '../../src/render/scene/airframe.js'

const crash = (massKg: number): SurfaceCrashVisual => ({
  mode: 'breakup',
  seed: 0x12345678,
  velocity: { x: 55, y: -22, z: 4 },
  massKg,
  surfaceLiftM: 0.4,
})

const angle = (w: number): number => 2 * Math.acos(Math.min(1, Math.abs(w)))

describe('solid crash choreography', () => {
  it('inherits impact momentum, rebounds above the captured surface and compresses the hull', () => {
    const at = solidCrashMotion(0.35, crash(3200))
    expect(at.offset.x).toBeGreaterThan(5)
    expect(at.offset.y).toBeGreaterThan(0.4)
    expect(Math.abs(at.offset.z)).toBeGreaterThan(0.1)
    expect(angle(at.rotation.w)).toBeGreaterThan(0.1)
    expect(at.crush).toBeGreaterThan(0.02)
    expect(at.crush).toBeLessThanOrEqual(0.08)
  })

  it('makes a bomber heave and settle instead of bouncing and tumbling like a fighter', () => {
    const fighter = solidCrashMotion(0.35, crash(3200))
    const bomber = solidCrashMotion(0.35, crash(30_000))
    expect(bomber.offset.y).toBeLessThan(fighter.offset.y)
    expect(angle(bomber.rotation.w)).toBeLessThan(angle(fighter.rotation.w))
  })

  it('is deterministic, bounded and fully settled after its advertised duration', () => {
    expect(solidCrashMotion(1.25, crash(3200))).toEqual(solidCrashMotion(1.25, crash(3200)))
    const settled = solidCrashMotion(SOLID_CRASH_SETTLE_S, crash(3200))
    const muchLater = solidCrashMotion(1000, crash(3200))
    expect(muchLater).toEqual(settled)
    expect(settled.offset.y).toBeCloseTo(0.4, 12)
    expect(Math.hypot(settled.offset.x, settled.offset.z)).toBeLessThan(45)
  })

  it('sanitizes incomplete legacy inputs instead of putting NaN into the scene graph', () => {
    const at = solidCrashMotion(Number.NaN, { mode: 'breakup', seed: 1 })
    expect([...Object.values(at.offset), ...Object.values(at.rotation), at.crush].every(Number.isFinite)).toBe(true)
  })
})
