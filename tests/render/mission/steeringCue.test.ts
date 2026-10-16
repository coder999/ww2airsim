import { describe, expect, it } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { steeringCueFor, steeringCueLabel } from '../../../src/render/mission/steeringCue.js'
import { destroyAircraft, missionWorld, moveAircraft, putPlayer } from '../../sim/mission/fixture.js'
import { deckLocal, deckOf, deckWorld } from '../../../src/sim/world/deck.js'
import { playerAircraft } from '../../../src/sim/loop.js'
import { effectiveStallSpeedMps } from '../../../src/sim/ground.js'
import { APPROACH_SPEED_STALL_MULTIPLE } from '../../../src/sim/paddles.js'

const EAST_ONE_MILE = { x: 1609.344, z: 0 }

describe('steeringCueFor', () => {
  it('is absent without a chart selection or mission objective', () => {
    expect(steeringCueFor(missionWorld({}), null)).toBeNull()
  })

  it('points from the aircraft nose to the first active primary objective', () => {
    const world = missionWorld({ objectives: [{
      id: 'rally', label: 'Rally', priority: 'primary', kind: 'reach',
      point: EAST_ONE_MILE, radiusM: 100, altitudeM: [4000, 4100],
    }] })
    const cue = steeringCueFor(world, null)!
    expect(cue.label).toBe('Rally')
    expect(cue.source).toBe('objective')
    expect(cue.rangeMi).toBeCloseTo(1, 9)
    expect(cue.target).toEqual({ x: 1609.344, y: 4000, z: 0 })
  })

  it('a chart selection overrides the automatic objective and uses the live entity altitude', () => {
    let world = missionWorld({ objectives: [
      { id: 'rally', label: 'Rally', priority: 'primary', kind: 'reach', point: EAST_ONE_MILE, radiusM: 100 },
      { id: 'raid', label: 'Raid', priority: 'secondary', kind: 'destroy', targets: ['raid'] },
    ] })
    world = moveAircraft(world, 'bandit-1', v3(0, 4500, -1609.344))
    const cue = steeringCueFor(world, 'aircraft:bandit-1')!
    expect(cue.source).toBe('chart')
    expect(cue.label).toBe('bandit-1')
    expect(cue.target).toEqual({ x: 0, y: 4500, z: -1609.344 })
  })

  it('a destroy objective chooses its nearest live resolved target', () => {
    const world = missionWorld({
      aircraft: [
        { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } },
        { id: 'far', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [8000, 3000, 0], headingDeg: 90, speedMps: 120 } },
        { id: 'near', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [2000, 3000, 0], headingDeg: 90, speedMps: 120 } },
      ],
      objectives: [{ id: 'raid', label: 'Raid', priority: 'primary', kind: 'destroy', targets: ['raid'] }],
    })
    expect(steeringCueFor(world, null)!.rangeMi).toBeCloseTo(2000 / 1609.344, 9)
  })

  it('a stale destroyed chart selection falls back to the remaining objective target', () => {
    let world = missionWorld({ objectives: [
      { id: 'rally', label: 'Rally', priority: 'primary', kind: 'reach', point: EAST_ONE_MILE, radiusM: 100 },
      { id: 'raid', label: 'Raid', priority: 'secondary', kind: 'destroy', targets: ['raid'] },
    ] })
    world = destroyAircraft(world, 'bandit-1')
    expect(steeringCueFor(world, 'aircraft:bandit-1')).toMatchObject({ label: 'Rally', source: 'objective' })
  })

  it('standing orders do not mask a simultaneous recovery objective', () => {
    const world = missionWorld({ objectives: [
      { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 },
      { id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at: 'cv-1' },
    ] })
    const cue = steeringCueFor(world, null)!
    expect(cue.label).toContain('LINEUP · 97 MPH')
    expect(cue.source).toBe('objective')
  })

  it('guides a carrier recovery to a moving lineup point on the glideslope before pointing at the deck', () => {
    let world = missionWorld({
      objectives: [{ id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at: 'cv-1' }],
    })
    const ship = world.ships.find((candidate) => candidate.id === 'cv-1')!
    const deck = deckOf(ship)!
    const paddles = ship.spec.paddles!
    const zoneZ = -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2
    const entryRangeM = paddles.maxRangeM * 0.9

    const lineup = steeringCueFor(world, null)!
    const lineupLocal = deckLocal(deck, lineup.target.x, lineup.target.z)
    const vrefMph = Math.round(
      APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(playerAircraft(world).spec, 1) * 3600 / 1609.344,
    )
    expect(lineup.label).toContain(`LINEUP · ${vrefMph} MPH`)
    expect(lineupLocal.x).toBeCloseTo(0, 9)
    expect(lineupLocal.z).toBeCloseTo(zoneZ - entryRangeM, 9)
    expect(lineup.target.y).toBeCloseTo(
      deck.center.y + playerAircraft(world).spec.gear.heightM
        + entryRangeM * Math.tan(paddles.glideslopeDeg * Math.PI / 180),
      9,
    )

    // Once astern, inside the real Paddles cone/range and closing, guidance
    // switches to the trap-zone centre without requiring the gear first.
    const onFinal = deckWorld(deck, 0, zoneZ - 1000)
    world = putPlayer(world, v3(onFinal.x, lineup.target.y, onFinal.z), 45, 0)
    const final = steeringCueFor(world, null)!
    const finalLocal = deckLocal(deck, final.target.x, final.target.z)
    expect(final.label).toContain(`FINAL · ${vrefMph} MPH · GEAR FLAPS HOOK`)
    expect(finalLocal.x).toBeCloseTo(0, 9)
    expect(finalLocal.z).toBeCloseTo(zoneZ, 9)
  })

  // F5C D3: the authored recovery is only a suggestion; the cue aims at the nearest friendly site this airplane can use.
  describe('a suggested recovery (any friendly base)', () => {
    const HOME = { id: 'home', label: 'Land at any friendly base', priority: 'primary', kind: 'land', at: 'tacloban', suggestedRecovery: true }
    const P38 = [{ id: 'f6f-1', spec: 'p-38-lightning', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }]
    const CV = { x: -25629, z: -16479 }

    it('steers a carrier-capable airplane to the carrier it is nearest to, not to the authored field', () => {
      const world = putPlayer(missionWorld({ objectives: [HOME] }), v3(CV.x + 6000, 1500, CV.z), 80, 0)
      const cue = steeringCueFor(world, null)!
      expect(cue.label).toMatch(/^(LINEUP|FINAL)/)
      expect(Math.hypot(cue.target.x - CV.x, cue.target.z - CV.z)).toBeLessThan(8000)
    })

    it('an airplane that cannot land on a deck is sent to the nearest field instead', () => {
      const world = putPlayer(missionWorld({ aircraft: [...P38, { id: 'bandit-1', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [0, 3000, -20000], headingDeg: 90, speedMps: 120 } }], objectives: [HOME] }), v3(CV.x + 6000, 1500, CV.z), 80, 0)
      const cue = steeringCueFor(world, null)!
      expect(cue.label).toBe('Land at any friendly base: Tacloban')
      expect(cue.source).toBe('objective')
      const tac = world.airfields.find((a) => a.id === 'tacloban')!.runway.center
      expect(cue.target.x).toBe(tac.x)
      expect(cue.target.z).toBe(tac.z)
    })

    it('an authored landing that is NOT a suggestion still aims at its named place', () => {
      const world = putPlayer(missionWorld({ objectives: [{ ...HOME, suggestedRecovery: undefined, at: 'tacloban' }] }), v3(CV.x + 6000, 1500, CV.z), 80, 0)
      const cue = steeringCueFor(world, null)!
      expect(cue.label).toBe('Land at any friendly base')
      expect(cue.target.x).toBe(world.airfields.find((a) => a.id === 'tacloban')!.runway.center.x)
    })

    it('the cue follows whichever friendly site is nearest as the airplane moves', () => {
      const near = (x: number, z: number) => steeringCueFor(putPlayer(missionWorld({ aircraft: P38, objectives: [HOME] }), v3(x, 3000, z), 80, 0), null)!
      const tac = missionWorld({}).airfields.find((a) => a.id === 'tacloban')!.runway.center
      expect(near(tac.x + 500, tac.z).label).toContain('Tacloban')
    })
  })

  it('reads level inside a station altitude band instead of chasing its midpoint', () => {
    let world = missionWorld({ objectives: [{
      id: 'rally', label: 'Rally', priority: 'primary', kind: 'hold', point: EAST_ONE_MILE,
      radiusM: 100, altitudeM: [2000, 4000], seconds: 60,
    }] })
    world = putPlayer(world, v3(0, 3000, 0), 120, 0)
    expect(steeringCueFor(world, null)!.target.y).toBe(3000)
  })
})

describe('steeringCueLabel', () => {
  it('names the destination and its range in statute miles, with no altitude', () => {
    expect(steeringCueLabel({ label: 'CAP station', rangeMi: 6.74 })).toBe('CAP STATION · 6.7 MI')
    expect(steeringCueLabel({ label: 'Target', rangeMi: 0.04 })).toBe('TARGET · 0.0 MI')
  })
})
