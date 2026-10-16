import { describe, expect, it } from 'vitest'
import { aircraftGate, isDevTakeoffHour, takeoffLockHour } from '../../../src/render/hq/launchRules.js'
import { DEV_TAKEOFF_HOURS } from '../../../src/render/sky/sun.js'
import { makeCampaign } from '../../fixtures/campaign.js'
import { mission } from '../../campaign/helpers.js'

describe('Form 5 aircraft gate (plan F5B Task 8)', () => {
  const c = makeCampaign({ faction: 'us', tiers: [1, 2, 3, 1, 1] })
  const m = mission({ aircraftIds: ['f6f-hellcat', 'p-38-lightning'] })

  it('a scored sortie blocks an advanced aircraft for a pilot below Lieutenant, naming the rank needed', () => {
    const gate = aircraftGate(c, m, c.roster.live[1]!, true)
    expect(gate('f6f-hellcat')).toEqual({ ok: true })
    expect(gate('p-38-lightning')).toEqual({ ok: false, text: 'Needs LT' })
    expect(aircraftGate(c, m, c.roster.live[2]!, true)('p-38-lightning')).toEqual({ ok: true })
  })

  it('an unscored sortie enforces nothing (assumption A2)', () => {
    expect(aircraftGate(c, m, c.roster.live[0]!, false)('p-38-lightning')).toEqual({ ok: true })
    expect(aircraftGate(c, null, c.roster.live[0]!, true)('p-38-lightning')).toEqual({ ok: true })
  })

  it('a night mission blocks a tier 1 pilot in any aircraft, and the gate reads the mission, not the aircraft', () => {
    const night = mission({ night: true })
    expect(aircraftGate(c, night, c.roster.live[0]!, true)('f6f-hellcat')).toEqual({ ok: false, text: 'Needs LTJG' })
    expect(aircraftGate(c, night, c.roster.live[1]!, true)('f6f-hellcat')).toEqual({ ok: true })
  })
})

describe('takeoff lock (ruling Q12)', () => {
  it('an authored night mission is locked to its hour; a day mission is free', () => {
    expect(takeoffLockHour(mission({ night: true }), 21.5)).toBe(21.5)
    expect(takeoffLockHour(mission({ night: true }), null)).toBe(21)
    expect(takeoffLockHour(mission({ night: false }), 9)).toBeNull()
    // a test bed with no descriptor (Night Range, authored 21:00) is locked too, or its authored lights would never be lit
    expect(takeoffLockHour(null, 21)).toBe(21)
    expect(takeoffLockHour(null, 9)).toBeNull()
    expect(takeoffLockHour(null, null)).toBeNull()
  })

  it('a Dev takeoff hour is recognized from the Dev table, a day hour is not', () => {
    for (const h of Object.values(DEV_TAKEOFF_HOURS)) expect(isDevTakeoffHour(h)).toBe(true)
    expect(isDevTakeoffHour(9)).toBe(false)
    expect(isDevTakeoffHour(undefined)).toBe(false)
  })
})
