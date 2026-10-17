import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EMPTY_SEGMENT, landingKind, stepSegment } from '../../src/render/flightRecord.js'
import { DT } from '../../src/sim/flight/model.js'

const air = { altitudeM: 1000, speedMps: 100, airborne: true }

describe('flight segment (dossier spec §B.2)', () => {
  it('accrues seconds from world ticks, only while airborne', () => {
    let s = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 60 })
    expect(s.flightSeconds).toBeCloseTo(60 * DT, 10)
    s = stepSegment(s, { ...air, ticksAdvanced: 60, airborne: false })
    expect(s.flightSeconds).toBeCloseTo(60 * DT, 10)
  })

  it('a paused frame (0 ticks) adds no time; triple time (3x ticks) adds 3x', () => {
    const paused = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 0 })
    expect(paused.flightSeconds).toBe(0)
    const triple = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 3 })
    expect(triple.flightSeconds).toBeCloseTo(3 * DT, 10)
  })

  it('keeps the peak altitude and speed, on the ground too', () => {
    let s = stepSegment(EMPTY_SEGMENT, { ticksAdvanced: 1, altitudeM: 3000, speedMps: 150, airborne: true })
    s = stepSegment(s, { ticksAdvanced: 1, altitudeM: 500, speedMps: 60, airborne: true })
    s = stepSegment(s, { ticksAdvanced: 1, altitudeM: 10, speedMps: 170, airborne: false })
    expect(s.maxAltitudeM).toBe(3000)
    expect(s.maxTrueAirspeedMps).toBe(170)
  })

  it('records the air-relative speed the caller passes as true airspeed', () => {
    // The caller (main.ts, a later task) passes length(airVelocity(state, world.wind))
    // because the sim couples a scenario wind since Plan 8 (commit 56ff8b4).
    const s = stepSegment(EMPTY_SEGMENT, { ticksAdvanced: 1, altitudeM: 0, speedMps: 123.4, airborne: true })
    expect(s.maxTrueAirspeedMps).toBe(123.4)
  })

  it('ignores a negative tick delta (a Restart rewinds the world clock)', () => {
    const s = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: -500 })
    expect(s.flightSeconds).toBe(0)
  })
})

describe('landingKind (dossier spec §B.5, fix round 2 finding 6)', () => {
  it('a carrier touchdown is a trap', () => {
    expect(landingKind({ at: { kind: 'carrier', id: 'cv-1', name: 'Essex' } })).toBe('trap')
  })
  it('an airfield touchdown is a field landing', () => {
    expect(landingKind({ at: { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } })).toBe('field')
  })
  it('an off-field touchdown (no field or deck under it) is a field landing', () => {
    expect(landingKind({ at: null })).toBe('field')
  })
})

describe('main.ts records every flight segment (dossier spec §B.2)', () => {
  const main = readFileSync(new URL('../../src/render/main.ts', import.meta.url), 'utf8')
  it('steps the segment every frame and resets it wherever the kill baseline resets', () => {
    expect(main).toContain('segment = stepSegment(segment,')
    // Indented ASSIGNMENTS only -- the two `let` declarations do not match
    // the whitespace-then-name anchor. 7 today: New game, Restart, and the
    // five bank sites (bailout, impact, destruction, landing, and F10-0's egress).
    const killResets = main.match(/^\s+scoredThroughKillsByType = /gm)?.length ?? 0
    const segResets = main.match(/^\s+segment = EMPTY_SEGMENT/gm)?.length ?? 0
    expect(killResets).toBe(7)
    expect(segResets).toBe(killResets)
  })
  it('banks through the campaign session at all four end sites, each with the landing it knows (F5B Task 10)', () => {
    // bailout, impact (ditched or killed), destruction, landing: one bankCampaign call each; the flight segment is read inside it.
    // F5C adds a fifth: End Sortie on a stop card closes the sortie its landings left open (legs bank through `bankLeg`, a sixth name).
    // F10-0 adds a sixth: a mission that ends at its egress gate banks as a landing with no touchdown (`landing: null`).
    expect(main.match(/bankCampaign\(/g)?.length).toBe(6)
    expect(main).toContain("bankCampaign('landed', current.world, success, badgeId, null)")
    expect(main).toContain("bankCampaign('landed', landedWorld, success, badgeId, null)")
    expect(main).toContain("bankCampaign('killed', current.world, success, badgeId, null)")
    expect(main).toContain("bankCampaign('landed', current.world, success, badgeId, landingKind(current.landing.report))")
    expect(main).toContain('bankCampaign(SORTIE_END_OF[bailoutResult.state.outcome], current.world, success, badgeId, null)')
    expect(main).toContain('flightSeconds: segment.flightSeconds')
  })
  it('only steps the segment when the world clock actually advanced (review round 1, IMPORTANT 1)', () => {
    // A paused/frozen/title-up frame feeds `advance` zero elapsed seconds
    // (src/sim/loop.ts, src/render/frame.ts), so `world.tick` does not move
    // -- stepping unconditionally would fold a frozen aircraft's altitude
    // and speed into the segment's maxima on every one of those frames.
    const guardIdx = main.indexOf('if (current.world.tick > segmentTick)')
    const stepIdx = main.indexOf('segment = stepSegment(segment,')
    const tickUpdateIdx = main.indexOf('segmentTick = current.world.tick')
    expect(guardIdx).toBeGreaterThan(-1)
    // The step call sits inside the guard...
    expect(stepIdx).toBeGreaterThan(guardIdx)
    // ...while `segmentTick` itself is still updated unconditionally, after
    // the guarded step -- so it keeps tracking a held world's tick through
    // the whole hold (keeping the guard false throughout, not just on the
    // first held frame) and catches up in exactly one skipped sample when
    // the world actually swaps.
    expect(tickUpdateIdx).toBeGreaterThan(stepIdx)
  })
})
