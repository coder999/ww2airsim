import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import { TRAIN_INTERVAL_S } from '../../../src/sim/ai/attack.js'
import { flatField } from '../mission/fixture.js'

/**
 * Formation level bombing (E3, 2026-10-10): four B-17s, the leader under E2's `level-bomb` order on an
 * anchored merchant ship, the other three on its wing. The leader drops its whole load as a train on one
 * pass; each wingman drops a bomb for each of the leader's ("toggling on the leader") and works its doors
 * with it, holding station. A flat sea, no fighters, the ship unarmed.
 */
const SHIP = { x: -27000, z: -48000 }
const ALT = 3000, V = 90
export function formationWorld(): World<undefined> {
  const sx = SHIP.x - 16000, sz = SHIP.z
  const b17 = (id: string, dx: number, dz: number, pilot: Record<string, unknown>): Record<string, unknown> => ({
    id, spec: 'b-17-flying-fortress', side: 'axis',
    airborneAt: { position: [sx + dx, ALT, sz + dz], headingDeg: 90, speedMps: V, throttle: 0.7 },
    pilot: { skill: 'veteran', ...pilot },
  })
  const raw = {
    id: 'formation-bombing', player: 'f6f-1', airfields: ['tacloban'],
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } },
      b17('lead', 0, 0, { ingress: { route: [{ x: SHIP.x - 9000, z: SHIP.z, altitudeM: ALT, speedMps: V }], destination: { ship: 'maru-1' }, attack: 'level-bomb' } }),
      b17('wing-1', -80, 100, { leader: 'lead', slot: 1 }),
      b17('wing-2', -80, -100, { leader: 'lead', slot: 2 }),
      b17('wing-3', -160, -200, { leader: 'lead', slot: 3 }),
    ],
    ships: [{ id: 'maru-1', spec: 'type-b-maru', side: 'allied', waypoints: [[SHIP.x, SHIP.z], [SHIP.x + 20000, SHIP.z]], speedMps: 0 }],
    weather: { windFromDeg: 0, windMps: 0 },
  }
  return worldFromScenario(bundleForScenario(parseScenario(raw)), flatField(0))
}

const IDS = ['lead', 'wing-1', 'wing-2', 'wing-3'] as const
type Release = { readonly id: string; readonly s: number; readonly doors: number; readonly stationM: number }

function fly(): { releases: Release[]; impacts: { x: number; z: number }[]; leadImpacts: { x: number; z: number }[]; hpLost: number; world: World<undefined> } {
  let w = formationWorld()
  const hp0 = w.combat.ships['maru-1']!.hp
  const releases: Release[] = []
  const impacts: { x: number; z: number }[] = []
  const leadImpacts: { x: number; z: number }[] = []
  for (let t = 0; t < Math.round(320 / DT); t++) {
    const before = w
    w = advance(w, DT).world
    const lead = w.aircraft.find((a) => a.id === 'lead')!
    for (const id of IDS) {
      const was = before.combat.aircraft[id]!.bombsDropped, now = w.combat.aircraft[id]!.bombsDropped
      if (now <= was) continue
      const a = before.aircraft.find((x) => x.id === id)!
      const slot = a.pilot?.formation?.slot
      for (let k = was; k < now; k++) releases.push({ id, s: t * DT, doors: a.state.bayDoorFraction, stationM: slot === undefined ? 0 : stationErrorM(a, lead, slot) })
    }
    for (const im of w.combat.impacts) if (im.tick === w.tick && im.cause === 'bomb' && im.outcome === 'detonated') impacts.push({ x: im.point.x - SHIP.x, z: im.point.z - SHIP.z })
    // The leader's own bombs: gone this tick, where they last were (within a tick's fall of the sea).
    const live = new Set(w.combat.projectiles.map((p) => p.id))
    for (const p of before.combat.projectiles) if (p.owner === 'lead' && p.kind === 'bomb' && !live.has(p.id)) leadImpacts.push({ x: p.position.x - SHIP.x, z: p.position.z - SHIP.z })
    if (IDS.every((id) => w.combat.aircraft[id]!.stores.bombs === 0) && w.combat.projectiles.length === 0) break
  }
  return { releases, impacts, leadImpacts, hpLost: hp0 - w.combat.ships['maru-1']!.hp, world: w }
}

describe('formation level bombing', () => {
  const r = fly()

  it('arms the wingmen of an attacker, and every bomber drops its whole load', () => {
    for (const id of IDS) expect(r.releases.filter((x) => x.id === id), id).toHaveLength(8)
  })

  it('the leader drops a train on one pass, and the wingmen drop with it', () => {
    const lead = r.releases.filter((x) => x.id === 'lead').map((x) => x.s)
    // 8 bombs, TRAIN_INTERVAL_S apart (the tick rounds each gap up), on one pass.
    expect(Math.max(...lead) - Math.min(...lead)).toBeLessThan(8 * (TRAIN_INTERVAL_S + DT))
    for (const x of r.releases) {
      expect(x.s, x.id).toBeGreaterThanOrEqual(Math.min(...lead))
      expect(x.s, x.id).toBeLessThan(Math.max(...lead) + 2)
    }
  })

  it('doors are open at every release, and the wingmen are on station', () => {
    for (const x of r.releases) {
      expect(x.doors, x.id).toBeGreaterThan(0.99)
      expect(x.stationM, x.id).toBeLessThan(60)
    }
  })

  it('the pattern straddles the ship', () => {
    // The bombers fly east along the anchored ship's length (x). Level bombing from 9,800 ft is not precise
    // (E2 measured a lone veteran Sally's median miss at 65 m), and a merchant is 52 ft wide, so this asks
    // where the pattern falls, not that it hits: measured 2026-10-10, the leader's train centered 2 m along and
    // 32 m across the ship, the closest of the 32 bombs 35 m from its center. Whether it hurts the ship is luck
    // at this size (here it did not: the blast reaches 30 m from the hull center).
    expect(r.impacts).toHaveLength(32)
    expect(r.leadImpacts).toHaveLength(8)
    const cx = r.leadImpacts.reduce((s, p) => s + p.x, 0) / 8, cz = r.leadImpacts.reduce((s, p) => s + p.z, 0) / 8
    expect(Math.hypot(cx, cz), `${cx.toFixed(0)} ${cz.toFixed(0)}`).toBeLessThan(60)
    expect(r.leadImpacts.some((p) => p.x < -30)).toBe(true) // short
    expect(r.leadImpacts.some((p) => p.x > 30)).toBe(true) // long
    expect(Math.min(...r.impacts.map((p) => Math.hypot(p.x, p.z)))).toBeLessThan(60)
  })
})

describe('the Bomber Range (Dev): Mark\'s test bed for E3', () => {
  it('its four bombers hold one formation to Tacloban and bomb it', () => {
    // Measured 2026-10-10 (terrain null): station errors held at 2-19 m all the way, the B-17, B-29 and Ki-21
    // dropped everything at about 330-360 s; the G4M carries a torpedo, which a wingman never drops.
    const raw = JSON.parse(readFileSync('content/scenarios/bomber-range.json', 'utf8')) as unknown
    let w = worldFromScenario(bundleForScenario(parseScenario(raw)), null)
    const wings = ['superfort-1', 'betty-1', 'sally-1']
    let worst = 0
    for (let t = 0; t < Math.round(420 / DT); t++) {
      w = advance(w, DT).world
      const lead = w.aircraft.find((a) => a.id === 'fort-1')!
      for (const id of wings) {
        const a = w.aircraft.find((x) => x.id === id)!
        worst = Math.max(worst, stationErrorM(a, lead, a.pilot!.formation!.slot))
      }
    }
    expect(worst).toBeLessThan(40)
    for (const id of ['fort-1', 'superfort-1', 'sally-1']) expect(w.combat.aircraft[id]!.stores.bombs, id).toBe(0)
    expect(w.combat.aircraft['betty-1']!.stores.bombs).toBe(1)
  }, 60_000)
})
