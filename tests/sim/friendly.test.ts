/**
 * F5C D3 (2026-10-16): which bases are the player's. `friendlyBaseAt` is the one answer the recovery rule, the leg stop,
 * the objective line and the steering cue share, so it is pinned against the shipped scenarios (enrolled from content,
 * not hand-built worlds) and against the Japanese side as well as the American one.
 */
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { friendlyBaseAt, friendlySites, nearestFriendlySite, siteUsableBy, SHIP_RECOVERY_RADIUS_M } from '../../src/sim/friendly.js'
import { CHAPTER_MISSIONS } from '../../src/campaign/index.js'
import { playerAircraft, type World } from '../../src/sim/loop.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadAircraftSpec, loadScenarioBundle } from '../../tools/content/load.js'

const world = (id: string): World<undefined> => worldFromScenario(loadScenarioBundle(id), null)
const field = (w: World<undefined>, id: string) => w.airfields.find((a) => a.id === id)!.runway.center
const SCENARIOS = readdirSync('content/scenarios').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()

describe('friendlyBaseAt', () => {
  it('an airfield is friendly when the player\'s side holds it: Tacloban and Bayug yes, Dulag no (base content sides)', () => {
    const w = world('convoy-strike')
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'tacloban', name: 'Tacloban' }, field(w, 'tacloban'))).toEqual({ kind: 'airfield', id: 'tacloban', name: 'Tacloban' })
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'bayug', name: 'Bayug' }, field(w, 'bayug'))).toMatchObject({ kind: 'airfield', id: 'bayug' })
    const strike = world('airfield-strike')
    expect(friendlyBaseAt(strike, { kind: 'airfield', id: 'dulag', name: 'Dulag' }, field(strike, 'dulag'))).toBeNull()
  })

  it('a scenario\'s airfieldSides override counts: aa-range hands Tacloban to the other side', () => {
    const w = world('aa-range')
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'tacloban', name: 'Tacloban' }, field(w, 'tacloban'))).toBeNull()
    const takeoff = world('takeoff-range')
    expect(friendlyBaseAt(takeoff, { kind: 'airfield', id: 'dulag', name: 'Dulag' }, field(takeoff, 'dulag'))).toMatchObject({ id: 'dulag' })
  })

  it('the Japanese side: the same field is friendly to the Zero\'s side and the American field is not', () => {
    const w = world('field-patrol')
    expect(playerAircraft(w).side).toBe('axis')
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'dulag', name: 'Dulag' }, field(w, 'dulag'))).toMatchObject({ id: 'dulag' })
  })

  it('a carrier is friendly by its side: Essex yes, Zuikaku no', () => {
    const w = world('flattop-hunt')
    expect(friendlyBaseAt(w, { kind: 'carrier', id: 'cv-1', name: 'cv-1' }, { x: 0, z: 0 })).toMatchObject({ kind: 'carrier', id: 'cv-1' })
    expect(friendlyBaseAt(w, { kind: 'carrier', id: 'zuikaku', name: 'zuikaku' }, { x: 0, z: 0 })).toBeNull()
  })

  it('water is friendly inside a declared anchorage, or alongside a friendly ship, and nowhere else', () => {
    const w = world('water-quals')
    const open = { kind: 'water', id: 'open-water', name: 'Open water' } as const
    const bay = w.anchorages![0]!
    expect(friendlyBaseAt(w, open, { x: bay.x, z: bay.z })).toMatchObject({ kind: 'anchorage', id: 'san-pedro-bay' })
    expect(friendlyBaseAt(w, open, { x: bay.x + bay.radiusM + 1, z: bay.z })).toBeNull()
    const fleet = world('free-flight')
    const cv = fleet.ships.find((s) => s.id === 'cv-1')!.state.position
    expect(friendlyBaseAt(fleet, open, { x: cv.x + SHIP_RECOVERY_RADIUS_M - 10, z: cv.z })).toMatchObject({ kind: 'ship', id: 'cv-1' })
    expect(friendlyBaseAt(fleet, open, { x: cv.x + SHIP_RECOVERY_RADIUS_M + 500, z: cv.z + SHIP_RECOVERY_RADIUS_M })).toBeNull()
  })

  it('off-field and unknown places are never friendly', () => {
    const w = world('convoy-strike')
    expect(friendlyBaseAt(w, null, { x: 0, z: 0 })).toBeNull()
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'nowhere', name: 'Nowhere' }, { x: 0, z: 0 })).toBeNull()
  })
})

describe('friendly sites and the nearest one', () => {
  it('lists every friendly field, deck and anchorage of the player\'s side, and only those', () => {
    expect(friendlySites(world('convoy-strike')).map((s) => s.id).sort()).toEqual(['bayug', 'tacloban'])
    expect(friendlySites(world('airfield-strike')).map((s) => s.id)).toEqual(['tacloban'])
    expect(friendlySites(world('combat-air-patrol')).map((s) => s.id).sort()).toEqual(['cv-1', 'tacloban'])
    expect(friendlySites(world('water-quals')).map((s) => s.id).sort()).toEqual(['san-pedro-bay', 'tacloban'])
  })

  it('the nearest site is the nearest one this airplane can use: a Hellcat takes a carrier, a P-38 and a Catalina do not take each other\'s', () => {
    const w = world('combat-air-patrol')
    const cv = w.ships.find((s) => s.id === 'cv-1')!.state.position
    expect(nearestFriendlySite(w, cv)).toMatchObject({ id: 'cv-1' })
    const useP38 = siteUsableBy(loadAircraftSpec('p-38-lightning'))
    const useHellcat = siteUsableBy(loadAircraftSpec('f6f-hellcat'))
    const useCatalina = siteUsableBy(loadAircraftSpec('pby-5a-catalina'))
    expect(nearestFriendlySite(w, cv, useHellcat)).toMatchObject({ id: 'cv-1' })
    expect(nearestFriendlySite(w, cv, useP38)).toMatchObject({ kind: 'airfield', id: 'tacloban' })
    expect(useCatalina({ kind: 'anchorage' })).toBe(true)
    expect(useP38({ kind: 'anchorage' })).toBe(false)
    expect(nearestFriendlySite(world('aa-range'), { x: 0, z: 0 })).toBeNull() // Tacloban is the other side's there, and no ship is ours
  })
})

describe('every shipped scenario declares which sites are friendly (F5C content check)', () => {
  it('enrolls every scenario file, so a filter that matches nothing fails', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(35)
    expect(SCENARIOS).toContain('convoy-strike')
  })

  it.each(SCENARIOS)('%s: a mission names at least one friendly site its player can recover to, and its suggested recovery is one', (id) => {
    const bundle = loadScenarioBundle(id)
    const w = worldFromScenario(bundle, null)
    if (w.mission === null) return // a range or test bed: no recovery to name
    const player = playerAircraft(w)
    const usable = nearestFriendlySite(w, player.state.position, siteUsableBy(player.spec))
    for (const o of w.mission.objectives) {
      if (o.kind === 'land') {
        // Every authored landing names a place the player's side holds, or open water the scenario declares friendly.
        const site = friendlySites(w).find((s) => s.id === o.at)
        const water = o.at === 'open-water' && (w.anchorages ?? []).length > 0
        expect(site !== undefined || water, `${id}: land.at "${o.at}" is not a friendly site`).toBe(true)
      }
    }
    if (w.mission.objectives.some((o) => o.kind === 'land' && o.suggestedRecovery === true)) {
      expect(usable, `${id}: no friendly site this airplane can use`).not.toBeNull()
    }
  })

  it('pins which missions carry a suggested recovery (a new mission must opt in deliberately)', () => {
    // The pooled and test-bed missions. A chapter is held to a rule of its own below, so a chapter batch never edits this list.
    const chapterIds = new Set(Object.values(CHAPTER_MISSIONS).flatMap((m) => (m.scenario === null ? [] : [m.scenario])))
    const withSuggestion = SCENARIOS.filter((id) => !chapterIds.has(id)).filter((id) => {
      const o = world(id).mission?.objectives ?? []
      return o.some((x) => x.kind === 'land' && x.suggestedRecovery === true)
    })
    expect(withSuggestion).toEqual([
      'airfield-strike', 'combat-air-patrol', 'convoy-strike', 'dev-mission-ui', 'escort', 'field-patrol',
      'flattop-hunt', 'scramble', 'single-combat', 'surigao-strait', 'tank-buster',
    ])
  })

  it('every authored chapter ends deliberately: a land objective (suggested or named), or an egress gate (Mark, 2026-10-17)', () => {
    for (const m of Object.values(CHAPTER_MISSIONS)) {
      if (m.scenario === null) continue
      const w = world(m.scenario)
      // F10C: a chapter may name its recovery field instead (J1: Buri, or Bayug only if Buri is unserviceable; J3: Bayug), which is just as deliberate.
      const suggests = (w.mission?.objectives ?? []).some((x) => x.kind === 'land')
      const egress = w.mission?.egress !== undefined
      expect(suggests || egress, `${m.scenario} neither suggests a recovery nor ends at an egress gate`).toBe(true)
      // Decision 13: a chapter's script freezes at the landing that completes it (an egress chapter ends at its gate instead).
      expect(egress || w.mission?.freezeOnSuccess === true, `${m.scenario} does not set freezeOnSuccess`).toBe(true)
    }
  })
})
