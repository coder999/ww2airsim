import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, type Stepper, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { add, scale, v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { deckOf } from '../../../src/sim/world/deck.js'
import type { Projectile } from '../../../src/sim/weapons/combat.js'

/**
 * Mark, 2026-09-26: "essex should be able to be damaged by rounds that hit
 * below flight deck (but not below water line)". The flight deck (32.9 m)
 * is wider than the hull (28.3 m beam), and the deck used to read as solid
 * ground all the way down, so a round from abeam below the deck edge died on
 * that invisible column and did no damage (measured 2026-09-26: y 5, 10 and
 * 15 m, 0 damage). A deck now stops a round only where it crosses the deck
 * surface from above, and that crossing is a hit on the ship.
 */
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
const w0 = worldFromScenario(loadScenarioBundle('free-flight'), null)
const cv = w0.ships.find((s) => s.id === 'cv-1')!
const deck = deckOf(cv)!
const h = cv.state.headingRad
/** Unit vector to starboard, across the hull (perpendicular to the bow). */
const beam = v3(Math.cos(h), 0, Math.sin(h))
const hp0 = w0.combat.ships['cv-1']!.hp

/** One round fired by the player, advanced for `ticks` fixed steps (8 x 14.7 m reaches the hull from 60 m out). */
function fire(from: Vec3, velocity: Vec3, ticks = 8): World<undefined> {
  const round: Projectile = { owner: 'f6f-1', id: 1, position: from, previous: from, velocity, lifeS: 3, tracer: false, kind: 'round', ageS: 0 }
  let w: World<undefined> = { ...w0, combat: { ...w0.combat, projectiles: [round] } }
  for (let i = 0; i < ticks; i++) w = advance(w, DT, still).world
  return w
}
const at = (across: number, y: number): Vec3 => add(v3(cv.state.position.x, y, cv.state.position.z), scale(beam, across))
const inward = (speed: number, vy = 0): Vec3 => v3(-beam.x * speed, vy, -beam.z * speed)

describe('an Essex takes rounds below its flight deck, not below the waterline', () => {
  it('the deck really does overhang the hull, and sits at deck height', () => {
    expect(deck.widthM / 2).toBeGreaterThan(cv.spec.beamM / 2)
    expect(deck.center.y).toBeCloseTo(cv.state.position.y + cv.spec.deckHeightM, 6)
  })

  it.each([5, 10, 15])('a round from abeam at %i m, below the deck edge, damages the hull', (y) => {
    const w = fire(at(60, y), inward(880))
    expect(w.combat.ships['cv-1']!.hp).toBeLessThan(hp0)
    expect(w.combat.aircraft['f6f-1']!.friendlyFire).toMatchObject({ kind: 'ship', target: 'cv-1' })
  })

  it('a round from above onto the deck still damages the ship', () => {
    const w = fire(at(0, 40), v3(0, -880, 0))
    expect(w.combat.ships['cv-1']!.hp).toBeLessThan(hp0)
  })

  it('a round from above onto the overhang, outside the hull, damages the ship', () => {
    const overhang = (cv.spec.beamM / 2 + deck.widthM / 2) / 2
    const w = fire(at(overhang, 40), v3(0, -880, 0))
    expect(w.combat.ships['cv-1']!.hp).toBeLessThan(hp0)
    expect(w.combat.projectiles).toHaveLength(0)
  })

  it('a round that reaches the sea short of the hull is stopped by the water and does no damage', () => {
    // From 60 m out at 2 m, descending to the surface 30 m out: under the
    // waterline by the time it would reach the hull.
    const w = fire(at(60, 2), inward(880, -880 * 2 / 30))
    expect(w.combat.ships['cv-1']!.hp).toBe(hp0)
    expect(w.combat.projectiles).toHaveLength(0)
  })

  it('a round under the overhang that meets the sea stops at the sea, not the deck column', () => {
    const under = (cv.spec.beamM / 2 + deck.widthM / 2) / 2
    // Straight down under the overhang, from below the deck: the water, not
    // the hull and not the deck, is what it meets.
    const w = fire(at(under, 10), v3(0, -880, 0))
    expect(w.combat.ships['cv-1']!.hp).toBe(hp0)
    expect(w.combat.projectiles).toHaveLength(0)
  })
})
