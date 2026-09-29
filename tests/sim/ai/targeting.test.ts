import { describe, expect, it } from 'vitest'
import {
  DETECTION_RANGE_M, ENGAGED_PENALTY_M, LEADER_THREAT_BONUS_M, STICKY_BONUS_M, TAIL_BONUS_M, THREAT_BONUS_M,
  contactScore, isContact, selectTarget, type TargetingView,
} from '../../../src/sim/ai/targeting.js'
import { aircraftById, createWorldOf, withAircraftState, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { sidesOf, type Side } from '../../../src/sim/sides.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { GREEN_SKILL, initialDecision } from '../../../src/sim/ai/pilot.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level } from './maneuverWorlds.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { stateOnDeck } from '../../../src/sim/mission/respot.js'

/**
 * 7e spec §4.2: one test per score term. Each builds two contacts that are
 * symmetric except for that term, and shows the pick follows the term.
 * Self ('me', allied, the player) is at the origin flying +x at 3,000 m.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const ALT = 3000
const me = level('me', f6f, v3(0, ALT, 0), v3(120, 0, 0))
const at = (id: string, p: Vec3, v: Vec3, side?: Side, extra: Partial<AircraftEntity<undefined>> = {}): AircraftEntity<undefined> =>
  ({ ...level(id, f6f, p, v), ...(side === undefined ? {} : { side }), ...extra })
function view(aircraft: AircraftEntity<undefined>[], patchCombat?: (w: ReturnType<typeof createWorldOf<undefined>>) => TargetingView<undefined>['combat']): TargetingView<undefined> {
  const world = createWorldOf({ aircraft, player: 'me' })
  return {
    snapshot: world.aircraft, combat: patchCombat ? patchCombat(world) : world.combat.aircraft, sides: sidesOf(world, world.aircraft),
    terrain: world.terrain, decks: decksOf(world.ships),
  }
}
const NONE = { current: null, leaderId: null } as const
/** Two contacts beside me (+z and -z) at `dA`/`dB`, both flying +x, so their
 *  tail angle to me (90 deg) and threat (none) are equal. */
const beside = (dA: number, dB: number) => [at('a', v3(0, ALT, dA), v3(120, 0, 0)), at('b', v3(0, ALT, -dB), v3(120, 0, 0))]

describe('target selection (7e spec §4.2), one test per score term', () => {
  it('nearer is better', () => {
    expect(selectTarget(me, view([me, ...beside(2000, 3000)]), NONE)).toBe('a')
    expect(selectTarget(me, view([me, ...beside(3000, 2000)]), NONE)).toBe('b')
  })

  it('a large bonus for a contact that has me in its gun cone (threatAstern, read symmetrically)', () => {
    // 'b' is 100 m farther but points at me from 500 m; 'a' flies past.
    const a = at('a', v3(0, ALT, 400), v3(120, 0, 0))
    const b = at('b', v3(-500, ALT, 0), v3(120, 0, 0))
    const bBeside = at('b', v3(0, ALT, -500), v3(120, 0, 0))
    expect(selectTarget(me, view([me, a, b]), NONE)).toBe('b')
    expect(selectTarget(me, view([me, a, bBeside]), NONE)).toBe('a')
    const v = view([me, a, b])
    expect(contactScore(me, v.snapshot[2]!, v, NONE) - contactScore(me, bBeside, view([me, a, bBeside]), NONE)).toBeGreaterThan(THREAT_BONUS_M - TAIL_BONUS_M)
  })

  it('a bonus for a contact that threatens my leader (7f supplies the leader)', () => {
    const lead = at('lead', v3(3000, ALT, 3000), v3(120, 0, 0), 'allied')
    const a = at('a', v3(0, ALT, 2000), v3(120, 0, 0))
    // 'b' sits 400 m behind the leader, nose on it, 2,500 m from me.
    const b = at('b', v3(2600, ALT, 3000), v3(120, 0, 0))
    const v = view([me, lead, a, b])
    expect(selectTarget(me, v, NONE)).toBe('a')
    expect(selectTarget(me, v, { current: null, leaderId: 'lead' })).toBe('b')
    expect(contactScore(me, b, v, { current: null, leaderId: 'lead' }) - contactScore(me, b, v, NONE)).toBeCloseTo(LEADER_THREAT_BONUS_M, 6)
  })

  it('a bonus for a contact whose tail is toward me', () => {
    // Both 2,000 m ahead-ish at equal range; 'a' flies straight away from me, 'b' across.
    const a = at('a', v3(2000, ALT, 0), v3(120, 0, 0))
    const b = at('b', v3(0, ALT, 2000), v3(120, 0, 0))
    const v = view([me, a, b])
    expect(selectTarget(me, v, NONE)).toBe('a')
    expect(contactScore(me, a, v, NONE) - contactScore(me, b, v, NONE)).toBeCloseTo(TAIL_BONUS_M / 2, 6)
  })

  it('a penalty per friendly already engaging it (read from the snapshot targetIds)', () => {
    const friendOn = (targetId: string | null) => at('wing', v3(-1000, ALT, 0), v3(120, 0, 0), 'allied', {
      pilot: { target: null, skill: GREEN_SKILL, decision: { ...initialDecision('wing'), targetId } },
    })
    expect(selectTarget(me, view([me, friendOn(null), ...beside(2000, 2500)]), NONE)).toBe('a')
    expect(selectTarget(me, view([me, friendOn('a'), ...beside(2000, 2500)]), NONE)).toBe('b')
    const v = view([me, friendOn('a'), ...beside(2000, 2500)])
    const a = v.snapshot.find((x) => x.id === 'a')!
    expect(contactScore(me, a, v, NONE) - contactScore(me, a, view([me, friendOn(null), ...beside(2000, 2500)]), NONE)).toBeCloseTo(-ENGAGED_PENALTY_M, 6)
  })

  it('an enemy pilot targeting the same contact is not a friendly engaging it', () => {
    const enemyOn = at('bogey', v3(-6000, ALT, 0), v3(120, 0, 0), undefined, {
      pilot: { target: null, skill: GREEN_SKILL, decision: { ...initialDecision('bogey'), targetId: 'a' } },
    })
    const v = view([me, enemyOn, ...beside(2000, 2500)])
    expect(selectTarget(me, v, NONE)).toBe('a')
  })

  it('a stickiness bonus for my current target (hysteresis)', () => {
    const v = view([me, ...beside(2000, 2500)])
    expect(selectTarget(me, v, NONE)).toBe('a')
    expect(selectTarget(me, v, { current: 'b', leaderId: null })).toBe('b')
    expect(selectTarget(me, view([me, ...beside(2000, 2000 + STICKY_BONUS_M + 1)]), { current: 'b', leaderId: null })).toBe('a')
  })
})

describe('target selection: candidates, ties and order', () => {
  it('never picks a same-side, destroyed, impacted or out-of-range aircraft', () => {
    // `parked` alone no longer excludes a contact (7g spec §2): an aircraft
    // flagged parked but actually flying (no ground/deck under it here) is a
    // valid contact, covered by the ground-state describe block below.
    const ally = at('ally', v3(0, ALT, 500), v3(120, 0, 0), 'allied')
    const far = at('far', v3(DETECTION_RANGE_M + 1, ALT, 0), v3(120, 0, 0))
    const crashed = at('crashed', v3(0, ALT, 700), v3(120, 0, 0), undefined, { impact: { tick: 1 } as unknown as AircraftEntity['impact'] })
    const dead = at('dead', v3(0, ALT, 800), v3(120, 0, 0))
    const v = view([me, ally, far, crashed, dead], (w) => ({
      ...w.combat.aircraft, dead: { ...w.combat.aircraft['dead']!, damage: { ...w.combat.aircraft['dead']!.damage, destroyedAt: 5 } },
    }))
    expect(selectTarget(me, v, NONE)).toBeNull()
    const inRange = at('edge', v3(DETECTION_RANGE_M - 1, ALT, 0), v3(120, 0, 0))
    expect(selectTarget(me, view([me, inRange]), NONE)).toBe('edge')
  })

  it('an exact tie picks the smaller id, whatever the array order', () => {
    const b = at('b', v3(0, ALT, 2000), v3(120, 0, 0))
    const a = at('a', v3(0, ALT, -2000), v3(120, 0, 0))
    expect(selectTarget(me, view([me, b, a]), NONE)).toBe('a')
    expect(selectTarget(me, view([a, me, b]), NONE)).toBe('a')
  })

  it('the accept filter narrows the candidates (the ingress pilot uses it)', () => {
    const v = view([me, ...beside(2000, 2500)])
    expect(selectTarget(me, v, { ...NONE, accept: (c) => c.id !== 'a' })).toBe('b')
    expect(selectTarget(me, v, { ...NONE, accept: () => false })).toBeNull()
  })
})

/** Raw scenario JSON, parsed -- the ship JSON shape is `content/scenarios/deck-quals.json`'s,
 *  the pattern is `tests/sim/ai/formationWorlds.ts`'s. A carrier holding still: two
 *  waypoints 20 km apart, `speedMps` near zero so it does not meaningfully move. */
const STILL_CARRIER = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[0, 0], [0, 20000]], speedMps: 0.001 }
const DECK_SPOT = { x: 0, z: -110 }

const viewOf = (w: World<undefined>): TargetingView<undefined> => ({
  snapshot: w.aircraft, combat: w.combat.aircraft, sides: sidesOf(w, w.aircraft),
  terrain: w.terrain, decks: decksOf(w.ships),
})

/** A hostile player who launched from the deck: still parked, but 300 m
 *  above it. One allied AI 3 km away at 1,000 m. */
function launchedPlayerWorld(): World<undefined> {
  const scenario = parseScenario({
    id: 'targeting-launched-player', player: 'ai-1', airfields: ['tacloban'],
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', side: 'axis', parkedAt: { ship: 'cv-1', spot: DECK_SPOT }, chocked: false },
      { id: 'ai-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [3000, 1000, 0], headingDeg: 90, speedMps: 120 } },
    ],
    ships: [STILL_CARRIER],
    weather: { windFromDeg: 0, windMps: 0 },
  })
  const world = worldFromScenario(bundleForScenario(scenario), null)
  const player = aircraftById(world, 'f6f-1')!
  const raised = { ...player.state, position: v3(player.state.position.x, player.state.position.y + 300, player.state.position.z) }
  return withAircraftState(world, 'f6f-1', raised)
}

/** An axis AI, spawned airborne (`parked: false`), then placed at rest on
 *  the deck with `stateOnDeck`. One allied AI 3 km away at 1,000 m. */
function landedHostileWorld(): World<undefined> {
  const scenario = parseScenario({
    id: 'targeting-landed-hostile', player: 'ai-1', airfields: ['tacloban'],
    aircraft: [
      { id: 'ai-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [3000, 1000, 0], headingDeg: 90, speedMps: 120 } },
      { id: 'axis-1', spec: 'f6f-hellcat', side: 'axis', airborneAt: { position: [0, 3000, -110], headingDeg: 90, speedMps: 120 } },
    ],
    ships: [STILL_CARRIER],
    weather: { windFromDeg: 0, windMps: 0 },
  })
  const world = worldFromScenario(bundleForScenario(scenario), null)
  const deck = decksOf(world.ships).find((d) => d.shipId === 'cv-1')!
  const axis = aircraftById(world, 'axis-1')!
  const grounded = stateOnDeck(axis.spec, deck, DECK_SPOT)
  return withAircraftState(world, 'axis-1', grounded)
}

describe('contacts are decided by ground state (7g spec §2)', () => {
  it('a hostile player who launched from a deck is a contact once airborne, though parked stays true', () => {
    const w = launchedPlayerWorld()
    const ai = aircraftById(w, 'ai-1')!
    const player = aircraftById(w, 'f6f-1')!
    expect(player.parked).toBe(true)
    const view = viewOf(w)
    expect(isContact(ai, player, view)).toBe(true)
  })

  it('a hostile standing on a runway or deck is not a contact, whatever parked says', () => {
    const w = landedHostileWorld()
    const ai = aircraftById(w, 'ai-1')!
    const landed = aircraftById(w, 'axis-1')!
    expect(landed.parked).toBe(false)
    expect(isContact(ai, landed, viewOf(w))).toBe(false)
  })
})
