import { describe, expect, it } from 'vitest'
import { gunHarmonization } from '../../../src/sim/weapons/harmonization.js'
import type { CombatSpec } from '../../../src/sim/weapons/schema.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const combat = f6f.combat!
const eye = f6f.view.eyePointM
const deg = (rad: number): number => rad * 180 / Math.PI

describe('gunHarmonization: where the guns put their rounds, seen from the eye', () => {
  it('depresses the F6F sight line about 0.287 degrees to the 300 m mean impact point', () => {
    // 0.287 deg is the shootdown spike's measurement (2026-09-25): a sight
    // line through the mean impact of a 1 s burst at convergence, found by
    // sweeping the aim through production stepCombat.
    const h = gunHarmonization(combat, eye)
    expect(h.rangeM).toBe(combat.convergenceM)
    expect(deg(h.depressionRad)).toBeGreaterThan(0.28)
    expect(deg(h.depressionRad)).toBeLessThan(0.295)
    // The impact point is on the centerline and below the eye: 0.9 m of eye
    // height plus gravity drop, not either one alone.
    expect(h.impactBody.x).toBeCloseTo(combat.convergenceM, 6)
    expect(Math.abs(h.impactBody.z)).toBeLessThan(1e-9)
    expect(h.impactBody.y).toBeLessThan(-0.4)
  })

  it('is driven by the spec, not an F6F constant: the eye height moves it', () => {
    const base = gunHarmonization(combat, eye)
    const higher = gunHarmonization(combat, [eye[0], eye[1] + 0.5, eye[2]])
    const expected = Math.atan2(0.5, combat.convergenceM - eye[0])
    expect(higher.depressionRad - base.depressionRad).toBeCloseTo(expected, 4)
  })

  it('includes gravity drop: an eye on the guns\' own aim line still needs depression', () => {
    // Put the eye on the line the guns aim along (body y = 0) and switch off
    // drag, so the only thing left between the sight and the rounds is
    // gravity: g t^2 / 2 at a time of flight of distance / muzzle velocity (the
    // guns toe in by a degree or less, so the along-track speed is within a
    // hair of the muzzle velocity).
    const onLine: readonly [number, number, number] = [eye[0], 0, 0]
    const h = gunHarmonization({ ...combat, dragPerM: 0 }, onLine)
    // The guns sit 1.5 m ahead of the body origin, so they fly 298.5 m.
    const t = (combat.convergenceM - combat.guns[0]!.position[0]) / combat.muzzleVelocityMps
    const drop = 0.5 * 9.80665 * t * t
    expect(h.impactBody.y).toBeCloseTo(-drop, 2)
    expect(h.depressionRad).toBeCloseTo(Math.atan2(drop, combat.convergenceM - eye[0]), 4)
  })

  it('a longer convergence harmonizes at that range', () => {
    const far = gunHarmonization({ ...combat, convergenceM: 450 }, eye)
    expect(far.rangeM).toBe(450)
    expect(far.impactBody.x).toBeCloseTo(450, 6)
  })

  it('harmonizes to a chosen reference gun set, for a mixed battery', () => {
    // A later plan's per-type guns (e.g. the A6M's 7.7 mm plus 20 mm) must
    // pick which guns the sight is harmonized to. Here: move the two
    // outboard guns 1 m lower and harmonize to them alone.
    const outboard = (i: number): boolean => i === 2 || i === 5
    const mixed: CombatSpec = {
      ...combat,
      guns: combat.guns.map((g, i) => outboard(i)
        ? { ...g, position: [g.position[0], g.position[1] - 1, g.position[2]] as [number, number, number] }
        : g),
    }
    const reference = gunHarmonization(mixed, eye, { referenceGuns: (_g, i) => outboard(i) })
    const onlyThose = gunHarmonization({ ...mixed, guns: [mixed.guns[2]!, mixed.guns[5]!] }, eye)
    expect(reference.gunCount).toBe(2)
    expect(gunHarmonization(mixed, eye).gunCount).toBe(combat.guns.length)
    expect(reference).toEqual(onlyThose)
    expect(() => gunHarmonization(mixed, eye, { referenceGuns: () => false })).toThrow(/no reference gun/)
  })
})
