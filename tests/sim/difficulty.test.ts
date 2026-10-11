import { describe, expect, it } from 'vitest'
import { loadScenarioBundle, loadShipSpec } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { DIFFICULTIES, DIFFICULTY_SCALES, applyDifficulty } from '../../src/sim/difficulty.js'
import { initialAa, mountsOf, stepAa, type AaOwner, type AaRound } from '../../src/sim/weapons/aaFire.js'
import { v3 } from '../../src/sim/math/vec3.js'

/**
 * M5: what `applyDifficulty` moves, and what it must leave alone. How much each level changes the
 * game is measured in difficultyLethality.test.ts.
 */
const furball = worldFromScenario(loadScenarioBundle('furball-range'), null)
const cap = worldFromScenario(loadScenarioBundle('combat-air-patrol'), null)

describe('applyDifficulty', () => {
  it('Veteran (normal) is the very same world: bit-identical to today', () => {
    expect(applyDifficulty(furball, 'normal')).toBe(furball)
    expect(applyDifficulty(cap, 'normal')).toBe(cap)
  })

  it('the three levels are ordered: Recruit easier than Veteran easier than Ace on every scale', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard'])
    const [e, n, h] = DIFFICULTIES.map((d) => DIFFICULTY_SCALES[d])
    expect(n).toEqual({ aiAimError: 1, aaError: 1, playerDamage: 1 })
    expect(e!.aiAimError).toBeGreaterThan(1); expect(h!.aiAimError).toBeLessThan(1)
    expect(e!.aaError).toBeGreaterThan(1); expect(h!.aaError).toBeLessThan(1)
    expect(e!.playerDamage).toBeLessThan(1); expect(h!.playerDamage).toBeGreaterThan(1)
  })

  it.each(['easy', 'hard'] as const)('%s: scales hostile pilots\' aim and the player\'s hit points, never a friendly pilot', (d) => {
    const k = DIFFICULTY_SCALES[d]
    const w = applyDifficulty(furball, d)
    const before = new Map(furball.aircraft.map((a) => [a.id, a]))
    const bandits = w.aircraft.filter((a) => a.id.startsWith('bandit-'))
    expect(bandits).toHaveLength(4) // not a vacuous pass
    for (const a of bandits) expect(a.pilot!.skill.aimErrorRad).toBeCloseTo(before.get(a.id)!.pilot!.skill.aimErrorRad * k.aiAimError, 12)
    // The allied wingman keeps the scenario's skill, untouched.
    expect(w.aircraft.find((a) => a.id === 'ally-1')!.pilot!.skill).toBe(before.get('ally-1')!.pilot!.skill)
    const p = w.aircraft.find((a) => a.id === w.player)!.spec.combat!
    const p0 = before.get(furball.player)!.spec.combat!
    expect(p.structureHp).toBeCloseTo(p0.structureHp / k.playerDamage, 9)
    expect(p.subsystemHp).toBeCloseTo(p0.subsystemHp / k.playerDamage, 9)
    // Every other airplane's toughness is its own.
    for (const a of w.aircraft) if (a.id !== w.player) expect(a.spec).toBe(before.get(a.id)!.spec)
    expect(w.combat.aa.errorScaleVs).toEqual({ side: 'allied', scale: k.aaError })
  })

  it('reaches pilots in held mission groups, which spawn mid-flight', () => {
    const w = applyDifficulty(cap, 'easy')
    const raiders = w.mission!.held.flatMap((g) => g.aircraft)
    const raiders0 = cap.mission!.held.flatMap((g) => g.aircraft)
    expect(raiders.length).toBeGreaterThan(0)
    raiders.forEach((a, i) => expect(a.pilot!.skill.aimErrorRad).toBeCloseTo(raiders0[i]!.pilot!.skill.aimErrorRad * DIFFICULTY_SCALES.easy.aiAimError, 12))
  })
})

describe('the AA hook: errorScaleVs widens only the guns that can fire at that side', () => {
  const at = v3(0, 0, 0)
  const owner: AaOwner = { id: 'dd', side: 'axis', mounts: mountsOf(loadShipSpec('fletcher-dd').armament!), position: at, previous: at, headingRad: 0 }
  const target = { id: 'p', side: 'allied' as const, kind: 'aircraft' as const, position: v3(600, 150, 0), velocity: v3(100, 0, 0), accel: v3(0, 0, 0) }
  const rounds = (errorScaleVs?: { side: 'allied' | 'axis'; scale: number }): AaRound[] => {
    let aa = { ...initialAa(7), ...(errorScaleVs === undefined ? {} : { errorScaleVs }) }
    const out: AaRound[] = []
    for (let tick = 1; tick <= 5 * 60; tick++) {
      const s = stepAa(aa, [owner], [target], tick, 1 / 60, 0)
      out.push(...s.rounds)
      aa = s.aa
    }
    return out
  }
  const base = rounds()
  it('fires (not a vacuous comparison)', () => expect(base.length).toBeGreaterThan(20))
  it('a scale on the shooter\'s own side changes nothing', () => {
    expect(rounds({ side: 'axis', scale: 3 }).map((r) => r.velocity)).toEqual(base.map((r) => r.velocity))
  })
  it('a scale on the target\'s side moves every round', () => {
    const scaled = rounds({ side: 'allied', scale: 3 })
    expect(scaled).toHaveLength(base.length)
    scaled.forEach((r, i) => expect(r.velocity).not.toEqual(base[i]!.velocity))
  })
})
