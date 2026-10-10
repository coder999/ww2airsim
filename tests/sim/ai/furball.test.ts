import { beforeAll, describe, expect, it } from 'vitest'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { PURSUIT_FLOOR_M } from '../../../src/sim/ai/safety.js'
import { sidesOf } from '../../../src/sim/sides.js'
import { isDoomed } from '../../../src/sim/damage/model.js'
import { LOADOUTS } from '../../../tools/ai/replica.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'

/**
 * 7e spec §4.7: the 120 s furball soak through production `advance`, with a
 * hands-off player. `furball-range` (spec §4.6): the player and a veteran
 * wingman against two axis pairs, each a veteran with a green. Pair A starts
 * on the player's six with the wingman 280 m behind its green; pair B comes
 * in head-on from 7 km.
 *
 * Why the wingman starts on a tail (measured 2026-09-26, recorded as ruling R-F1
 * in the plan): with the spec's first layout
 * (both pairs head-on from 6 km), no AI hit another in 300 s, and in 1v1
 * duels (veteran/green, head-on, tail at 1,500 m, crossing) no AI hit another
 * in 180 s. A maneuvering AI target is out of reach of today's AI gunnery,
 * which leads by the target's velocity rather than the relative one and
 * ignores drop (7c spec, "Added to the gunnery-honesty follow-on"). What an AI
 * can do is bounce an opponent that is flying straight: here the wingman
 * kills the green at tick 24 in all four loadouts.
 */
const bundle = loadScenarioBundle('furball-range')
const SECONDS = 120

type Run = { world: World<undefined>; minHeight: Record<string, number>; peakG: Record<string, number>; nan: boolean }
function soak(loadout: (typeof LOADOUTS)[number] = 'clean'): Run {
  let world = worldFromScenario(bundle, null, loadout)
  const minHeight: Record<string, number> = {}
  const peakG: Record<string, number> = {}
  let nan = false
  for (let i = 0; i < SECONDS * 60; i++) {
    world = advance(world, DT).world
    for (const a of world.aircraft) {
      const s = a.state
      if (![s.position.x, s.position.y, s.position.z, s.velocity.x, s.velocity.y, s.velocity.z].every(Number.isFinite)) nan = true
      // Flown height only: a burning or exploded airplane falls by design (damage stages, 2026-10-09).
      if (!isDoomed(world.combat.aircraft[a.id]!.damage)) minHeight[a.id] = Math.min(minHeight[a.id] ?? Infinity, s.position.y)
      peakG[a.id] = Math.max(peakG[a.id] ?? -Infinity, world.combat.aircraft[a.id]!.stress.loadFactorG)
    }
  }
  return { world, minHeight, peakG, nan }
}

describe('the furball soak (7e spec §4.7)', () => {
  let run: Run
  let world: World<undefined>
  let sides: ReturnType<typeof sidesOf>
  let ai: World<undefined>['aircraft'][number][]
  beforeAll(() => {
    run = soak()
    world = run.world
    sides = sidesOf(world, world.aircraft)
    ai = world.aircraft.filter((a) => a.pilot != null)
  })

  it('is bit-identical across two runs and never produces a NaN', () => {
    expect(run.nan).toBe(false)
    const again = soak().world
    expect(again.aircraft).toEqual(world.aircraft)
    expect(again.combat).toEqual(world.combat)
  })

  it('holds the §3.6 safety invariants for every AI', () => {
    for (const a of ai) {
      const rec = world.combat.aircraft[a.id]!
      // No structure lost to its own overload: unhurt unless something hit it.
      if (rec.lastHitBy === null) expect(rec.damage.structure, `${a.id} lost structure unhit`).toBe(1)
      expect(run.peakG[a.id]!, `${a.id} peak g`).toBeLessThanOrEqual(a.spec.limits.gLimit)
      // No terrain in the soak, so sea level is the ground; a pursuer may
      // follow its target down to the pursuit floor, never into the sea.
      expect(run.minHeight[a.id]!, `${a.id} lowest point`).toBeGreaterThan(PURSUIT_FLOOR_M)
      expect(a.impact, `${a.id} hit the sea`).toBeNull()
    }
  })

  // Damage stages round 2 (2026-10-09): fighters 4x tougher, and no AI-on-AI kill happens inside the
  // 120 s soak any more (measured: the wingman's bounce lands 6 hits, structure 0.875, and the only
  // kill is a bandit's on the hands-off player). What still holds is AI hitting AI across sides;
  // AI-on-AI kills are pinned in the longer duels, tests/sim/ai/gunnery.test.ts.
  it('resolves AI-on-AI hits across sides, and any AI-on-AI kill is BY HITS, credited to the other side', () => {
    const hitAcross = ai.filter((victim) => {
      const by = world.aircraft.find((a) => a.id === world.combat.aircraft[victim.id]!.lastHitBy)
      return by?.pilot != null && sides[by.id] !== sides[victim.id] && world.combat.aircraft[victim.id]!.damage.structure < 1
    })
    expect(hitAcross.length).toBeGreaterThanOrEqual(1)
    const aiKills = ai.filter((victim) => {
      const d = world.combat.aircraft[victim.id]!.damage
      const killer = world.aircraft.find((a) => a.id === d.attacker)
      return d.destroyedAt !== null && killer?.pilot != null && sides[killer.id] !== sides[victim.id]
    })
    for (const victim of aiKills) {
      const killer = world.combat.aircraft[world.combat.aircraft[victim.id]!.damage.attacker!]!
      expect(killer.hits).toBeGreaterThan(0)
      expect(killer.kills).toBeGreaterThanOrEqual(1)
    }
  })

  it('credits every kill to the opposite side: no friendly kills, friendly hits under 5% of all hits', () => {
    let hits = 0
    let friendlyHits = 0
    let kills = 0
    for (const a of world.aircraft) {
      const rec = world.combat.aircraft[a.id]!
      hits += rec.hits
      friendlyHits += rec.friendlyHits
      kills += rec.kills
      expect(rec.friendlyKills, `${a.id} teamkilled`).toBe(0)
    }
    // Every downed aircraft with a killer names one on the other side, and
    // the kill counts add up to exactly those.
    let credited = 0
    for (const victim of world.aircraft) {
      const rec = world.combat.aircraft[victim.id]!
      const down = rec.damage.destroyedAt !== null || victim.impact !== null
      const by = rec.damage.attacker ?? (down ? rec.lastHitBy : null)
      if (!down || by === null) continue
      expect(sides[by], `${victim.id} killed by ${by}`).not.toBe(sides[victim.id])
      credited++
    }
    expect(kills).toBe(credited)
    expect(hits).toBeGreaterThan(0)
    expect(friendlyHits / (hits + friendlyHits)).toBeLessThan(0.05)
    console.log(`furball: ${hits} hits, ${friendlyHits} friendly, ${kills} kills`)
  })

  // The spec's "p95 tick cost reported, with a sanity ceiling of 2 ms" is
  // `npm run perf:furball` (tests/sim/ai/furballCost.ts), run on an idle
  // machine, not here (ruling R-F2): the same measurement read 2.56 ms inside
  // ryzen's full parallel suite and 0.774 ms alone on nexus (2026-09-26), so
  // the suite's number is the other workers', not the sim's.

  it.each(LOADOUTS)('the opening bounce hit holds with the player\'s %s loadout', (loadout) => {
    let w = worldFromScenario(bundle, null, loadout)
    for (let i = 0; i < 5 * 60; i++) w = advance(w, DT).world
    // Hit in the opening bounce. Since damage stages round 2 (2026-10-09) the bounce no longer sets it
    // alight: 6 hits, a quarter of what a Zero takes to the fire line.
    expect(w.combat.aircraft['bandit-2']!.lastHitBy).toBe('ally-1')
    expect(w.combat.aircraft['bandit-2']!.damage.structure).toBeLessThan(1)
  })
})
