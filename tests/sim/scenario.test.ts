import { describe, it, expect } from 'vitest'
import { parseScenario, worldFromScenario, PARKED_PLACEHOLDER_Y_M, type ScenarioBundle } from '../../src/sim/scenario.js'
import { advance, playerAircraft } from '../../src/sim/loop.js'
import { assertLoopOverWater, stepShip } from '../../src/sim/world/ships.js'
import { insideRect, insideRunway, worldToLocal } from '../../src/sim/world/airfields.js'
import { deckOf, deckLocal } from '../../src/sim/world/deck.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { v3, ZERO } from '../../src/sim/math/vec3.js'
import { createTerrainField, heightAt, SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../src/render/content.js'
import { loadScenarioBundle, loadScenario } from '../../tools/content/load.js'
import { DT } from '../../src/sim/flight/model.js'
import { AIRFIELD_HUTS } from '../../src/render/scene/airfield.js'
import { emptyStores } from '../../src/sim/weapons/stores.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../src/sim/ai/decision.js'

/** The level a real page load actually flies over today -- see
 *  `content.ts`'s `INTERIM_ASSET_QUALITY_TIER` for what it is and why.
 *  Before Task 2 (2026-09-24) this used `FIRST_COMMITTED_LEVEL`,
 *  numerically the same thing (2) at the time; the two concepts have since
 *  diverged ("what's committed on disk", now 0, vs "what a page load
 *  fetches", tier-dependent). */
const GROUND_TRUTH_LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)
const bundle = loadScenarioBundle('free-flight')
const header = loadTerrainHeader()
const terrain = createTerrainField(header, GROUND_TRUTH_LEVEL, loadTerrainLevel(GROUND_TRUTH_LEVEL, header))

const withScenario = (patch: Partial<typeof bundle.scenario>, base: ScenarioBundle = bundle): ScenarioBundle => ({
  ...base,
  scenario: { ...base.scenario, ...patch },
})

describe('the free-flight scenario', () => {
  it('parses, and names two aircraft, three ships and two airfields', () => {
    const w = worldFromScenario(bundle, null)
    expect(w.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'f6f-2'])
    expect(w.ships.map((s) => s.id)).toEqual(['cv-1', 'dd-1', 'dd-2'])
    expect(w.airfields.map((a) => a.id)).toEqual(['tacloban', 'dulag'])
    expect(w.player).toBe('f6f-1')
    expect(w.tick).toBe(0)
    expect(w.terrain).toBeNull()
  })

  it('parks the player at the Tacloban runway center, nose north, gear down, at the placeholder height', () => {
    const p = playerAircraft(worldFromScenario(bundle, null))
    const tacloban = bundle.airfields['tacloban']!
    expect(p.state.position.x).toBe(tacloban.runway.center.x)
    expect(p.state.position.z).toBe(tacloban.runway.center.z)
    expect(p.state.position.y).toBe(PARKED_PLACEHOLDER_Y_M)
    expect(p.state.velocity).toEqual({ x: 0, y: 0, z: 0 })
    expect(p.state.gearFraction).toBe(1)
    expect(p.parked).toBe(true)
    expect(p.controls.brake ?? 0).toBe(0)
    expect(p.previous).toBe(p.state)
  })

  it('chocks the second Hellcat on the apron, clear of the strip and every building', () => {
    const w = worldFromScenario(bundle, null)
    const wingman = w.aircraft[1]!
    const tacloban = bundle.airfields['tacloban']!
    expect(wingman.controls.brake).toBe(1)
    expect(wingman.controls.gearDown).toBe(true)
    expect(wingman.parked).toBe(true)
    const { x, z } = wingman.state.position
    expect(insideRect(tacloban, tacloban.apron!, x, z)).toBe(true)
    expect(insideRunway(tacloban, x, z)).toBe(false)
    const local = worldToLocal(tacloban, x, z)
    // Plan 6b split the old 7-entry AIRFIELD_BUILDINGS table into content
    // `buildings` (hangars, tower) plus AIRFIELD_HUTS (decorative); this
    // checks clearance against the union, same footprints as before.
    const footprints = [
      ...tacloban.buildings.map((b) => ({ kind: b.kind as string, x: b.x, z: b.z, width: b.widthM, length: b.lengthM })),
      ...AIRFIELD_HUTS.map((h) => ({ kind: 'hut', x: h.x, z: h.z, width: h.width, length: h.length })),
    ]
    for (const b of footprints) {
      const clearX = Math.abs(local.x - b.x) > b.width / 2 + 8
      const clearZ = Math.abs(local.z - b.z) > b.length / 2 + 8
      expect(clearX || clearZ, `wingman sits inside the ${b.kind} at (${b.x}, ${b.z})`).toBe(true)
    }
  })

  it('starts each ship at its first waypoint, pointing at its second, steering for it', () => {
    const w = worldFromScenario(bundle, null)
    for (const s of w.ships) {
      const wp = s.orders.waypoints
      expect(s.state.position.x).toBe(wp[0]!.x)
      expect(s.state.position.z).toBe(wp[0]!.z)
      expect(s.state.position.y).toBe(SEA_LEVEL_M)
      expect(s.state.waypoint).toBe(1)
      expect(s.state.speedMps).toBe(s.orders.speedMps)
      expect(s.previous).toBe(s.state)
    }
  })

  it('places the task force about 10.5 km from the Tacloban strip', () => {
    const w = worldFromScenario(bundle, null)
    const tac = bundle.airfields['tacloban']!.runway.center
    const cv = w.ships[0]!.state.position
    const km = Math.hypot(cv.x - tac.x, cv.z - tac.z) / 1000
    expect(km).toBeGreaterThan(9)
    expect(km).toBeLessThan(12)
  })
})

describe('the airborne pursuit range (Plan 7a)', () => {
  const pursuit = loadScenarioBundle('pursuit-range')

  it('starts both aircraft airborne on their compass headings and assigns only the pursuer', () => {
    const world = worldFromScenario(pursuit, null)
    const player = playerAircraft(world)
    const pursuer = world.aircraft.find((a) => a.id === 'pursuer-1')!
    expect(player.state.position).toEqual(v3(0, 3000, 0))
    expect(player.state.velocity.x).toBeCloseTo(120, 12)
    expect(player.state.velocity.z).toBeCloseTo(0, 12)
    expect(player.state.gearFraction).toBe(0)
    expect(player.parked).toBe(false)
    expect(player.pilot).toBeNull()
    expect(pursuer.state.position).toEqual(v3(-500, 3020, 50))
    expect(pursuer.state.velocity.x).toBeCloseTo(125, 12)
    expect(pursuer.state.velocity.z).toBeCloseTo(0, 12)
    expect(pursuer.state.attitude).toEqual(qFromAxisAngle(v3(0, 1, 0), 0))
    expect(pursuer.parked).toBe(false)
    expect(pursuer.pilot).toEqual({
      target: 'f6f-1', skill: VETERAN_SKILL, decision: { maneuver: 'pursue', nextRescoreS: 0, observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0 },
    })
  })

  it('accepts an optional pilot skill, defaulting to green, and seeds the initial decision state', () => {
    const raw = () => JSON.parse(JSON.stringify(pursuit.scenario)) as Record<string, unknown> & {
      aircraft: Array<Record<string, unknown>>
    }
    const veteran = raw()
    veteran.aircraft[1]!.pilot = { target: 'f6f-1', skill: 'veteran' }
    const veteranWorld = worldFromScenario({ ...pursuit, scenario: parseScenario(veteran) }, null)
    const veteranPursuer = veteranWorld.aircraft.find((a) => a.id === 'pursuer-1')!
    expect(veteranPursuer.pilot).toEqual({
      target: 'f6f-1', skill: VETERAN_SKILL, decision: { maneuver: 'pursue', nextRescoreS: 0, observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0 },
    })

    const green = raw()
    green.aircraft[1]!.pilot = { target: 'f6f-1' }
    const greenWorld = worldFromScenario({ ...pursuit, scenario: parseScenario(green) }, null)
    const greenPursuer = greenWorld.aircraft.find((a) => a.id === 'pursuer-1')!
    expect(greenPursuer.pilot).toEqual({
      target: 'f6f-1', skill: GREEN_SKILL, decision: { maneuver: 'pursue', nextRescoreS: 0, observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0 },
    })
  })

  it('turns the production pursuit pilot onto a gun solution', () => {
    let world = worldFromScenario(pursuit, null)
    for (let i = 0; i < 120 && world.combat.aircraft['pursuer-1']!.shots === 0; i++) {
      world = advance(world, DT * 5).world
    }
    expect(world.tick).toBeLessThanOrEqual(600)
    expect(world.combat.aircraft['pursuer-1']!.shots).toBeGreaterThan(0)
  })

  it('the pursuit pilot actually hits the target it is gated on, not just fires blind', () => {
    // Reference-GPU review of Task 5 found `hasGunSolution` gating on the
    // muzzle lead while the controller flew a different, longer maneuver
    // lead: 1,002 rounds fired over 90 s, zero hits. This proves the fix at
    // the level that failure was measured at, not just at the unit level
    // `pursuitDesiredVelocity`'s own test proves the two leads now agree.
    //
    // Budget re-tuned empirically for Plan 7b (2026-09-23): once the Plan
    // 7b decision layer is wired in, `MIN_ENGAGEMENT_RANGE_M` correctly
    // breaks the pursuer off before the old point-blank pass-through this
    // budget used to rely on (that pass-through was itself the defect
    // MIN_ENGAGEMENT_RANGE_M exists to remove). With `extendDesiredVelocity`
    // rejoining beyond `SAFE_SEPARATION_M` (task 3's fix) instead of diving
    // away forever, the pursuer breaks off, separates, rejoins, and gets a
    // second firing pass. That second pass was where the first hit used to
    // land: tick 7430, measured for Plan 7b.
    //
    // **Re-measured 2026-09-24 (Plan 7d, final-review fix wave): first hit is
    // now tick 525** -- first shot at 295, first hit at 525, 312 rounds
    // fired, run twice with identical output. Perception staleness and
    // control noise re-roll which individual rounds connect, and here they
    // moved the first hit forward onto the FIRST firing pass instead of the
    // post-rejoin one. The old figure was measured before either existed and
    // was never re-taken, so the "~60% headroom" arithmetic that used to sit
    // here was stale by a factor of 14.
    //
    // There IS RNG in this gate now (`pursuit-range` pins `pursuer-1` to
    // `veteran`, whose `controlNoise` is 0.02, so six mulberry32 draws are
    // taken every tick). The run is still bit-for-bit repeatable, but for the
    // other reason: the draws are seeded and cursor-threaded, not absent.
    //
    // 12000 is deliberately NOT retightened onto 525. The claim this test
    // exists to make is "the pursuer actually connects, rather than firing
    // blind forever" -- the 1,002-rounds-zero-hits defect above -- and a
    // ceiling near the observed value would instead make it a tuning gate
    // that goes red on any future AI retune for reasons that have nothing to
    // do with that claim. It also still covers the slower rejoin-and-second-
    // pass path, which remains reachable.
    let world = worldFromScenario(pursuit, null)
    for (let i = 0; i < 2400 && world.combat.aircraft['pursuer-1']!.hits === 0; i++) {
      world = advance(world, DT * 5).world
    }
    expect(world.tick).toBeLessThanOrEqual(12000)
    expect(world.combat.aircraft['pursuer-1']!.hits).toBeGreaterThan(0)
  })

  it('rejects malformed airborne starts and invalid scenario pilot targets', () => {
    const raw = () => JSON.parse(JSON.stringify(pursuit.scenario)) as Record<string, unknown> & {
      aircraft: Array<Record<string, unknown> & { airborneAt: Record<string, unknown> }>
    }
    const badAltitude = raw()
    badAltitude.aircraft[0]!.airborneAt.position = [0, 0, 0]
    expect(() => parseScenario(badAltitude)).toThrow(/airborne altitude/)
    const badSpeed = raw()
    badSpeed.aircraft[0]!.airborneAt.speedMps = 0
    expect(() => parseScenario(badSpeed)).toThrow(/speedMps/)
    const self = raw()
    self.aircraft[1]!.pilot = { target: 'pursuer-1' }
    expect(() => parseScenario(self)).toThrow(/cannot target itself/)
    const missing = raw()
    missing.aircraft[1]!.pilot = { target: 'nobody' }
    expect(() => parseScenario(missing)).toThrow(/must name an aircraft/)
  })
})

describe('the energy-aware decision layer (Plan 7b)', () => {
  const pursuit = loadScenarioBundle('pursuit-range')

  it('does not change maneuver between two ticks inside one reactionS window, and does change once nextRescoreS is reached', () => {
    let world = worldFromScenario(pursuit, null)
    const maneuverAt = (w: typeof world) => w.aircraft.find((a) => a.id === 'pursuer-1')!.pilot!.decision.maneuver
    const rescoreAt = (w: typeof world) => w.aircraft.find((a) => a.id === 'pursuer-1')!.pilot!.decision.nextRescoreS
    world = advance(world, DT).world
    const firstManeuver = maneuverAt(world)
    const firstRescore = rescoreAt(world)
    world = advance(world, DT).world
    // Still inside the veteran's 0.3s reaction window (two ticks in) -- the
    // maneuver and nextRescoreS VALUES must be unchanged. Not "referentially
    // the same" (finding 10): advance() allocates a fresh decision/pilot
    // object every tick regardless of whether a rescore ran, so the only
    // real guarantee here is value equality, which is exactly what these
    // .toBe assertions on a string and a number check.
    expect(rescoreAt(world)).toBe(firstRescore)
    expect(maneuverAt(world)).toBe(firstManeuver)

    // Finding 3: the above only proved the "does not change" half of this
    // test's own name -- it never actually reached nextRescoreS, so it would
    // have passed against a permanently-latched maneuver too. Advance past
    // DT + VETERAN_SKILL.reactionS (the exact value pursuer-1's nextRescoreS
    // was set to) one tick at a time -- advance() caps a single call at
    // MAX_STEPS_PER_FRAME steps and DROPS anything owed beyond that, so one
    // large elapsedSeconds does not reliably reach a sim-time target this far
    // out -- and confirm a rescore genuinely happens: nextRescoreS moves
    // forward, not just "is different from a moment that never arrived."
    const rescoreDeadlineS = DT + VETERAN_SKILL.reactionS
    expect(firstRescore).toBeCloseTo(rescoreDeadlineS, 10)
    let ticks = 0
    while (world.tick * DT < firstRescore) {
      world = advance(world, DT).world
      ticks += 1
      if (ticks > 60) throw new Error('nextRescoreS was never reached within 1s of additional sim time')
    }
    expect(rescoreAt(world)).toBeGreaterThan(firstRescore)
  })

  it('MIN_ENGAGEMENT_RANGE_M forces Extend in production advance() at point-blank range, closing', () => {
    let world = worldFromScenario(pursuit, null)
    // Run until pursuer-1 has closed inside MIN_ENGAGEMENT_RANGE_M -- reuse
    // the existing "turns onto a gun solution" test's own tick budget/loop
    // shape from this same file, then assert:
    for (let i = 0; i < 1200; i++) world = advance(world, DT).world
    const pursuerRecord = world.aircraft.find((a) => a.id === 'pursuer-1')!
    const player = world.aircraft.find((a) => a.id === 'f6f-1')!
    const rangeM = Math.hypot(
      pursuerRecord.state.position.x - player.state.position.x,
      pursuerRecord.state.position.y - player.state.position.y,
      pursuerRecord.state.position.z - player.state.position.z,
    )
    // Finding 4 (final whole-branch review): a standalone assertion, not
    // just the guard on the conditional below -- without this, a future
    // geometry drift that stops triggering the override would silently
    // no-op this test's only assertions instead of failing loudly.
    expect(rangeM).toBeLessThan(MIN_ENGAGEMENT_RANGE_M)
    if (rangeM < MIN_ENGAGEMENT_RANGE_M) {
      expect(pursuerRecord.pilot!.decision.maneuver).toBe('extend')
      expect(pursuerRecord.controls.fire).toBeFalsy()
    }
  })

  it('Extend and Break never set fire, even when a gun solution would otherwise exist', () => {
    let world = worldFromScenario(pursuit, null)
    for (let i = 0; i < 1200; i++) {
      world = advance(world, DT).world
      const pursuerRecord = world.aircraft.find((a) => a.id === 'pursuer-1')!
      if (pursuerRecord.pilot!.decision.maneuver !== 'pursue') {
        expect(pursuerRecord.controls.fire).toBeFalsy()
      }
    }
  })
})

describe('the shipped loops on the real terrain (spec §5.4)', () => {
  it('every ideal leg is water', () => {
    for (const s of bundle.scenario.ships) {
      expect(() => assertLoopOverWater(s.id, { waypoints: s.waypoints.map(([x, z]) => ({ x, z })), speedMps: s.speedMps }, terrain)).not.toThrow()
    }
  })

  it('every ship sails one full lap of the track it actually steers, over water throughout', () => {
    const w = worldFromScenario(bundle, terrain)
    for (const ship of w.ships) {
      let s = ship.state
      let laps = 0
      let prevWaypoint = s.waypoint
      let maxHeight = -Infinity
      // 3 hours of simulated time is comfortably more than one lap of 42 km at 15 kn.
      for (let i = 0; i < 60 * 3600 * 3 && laps < 1; i++) {
        s = stepShip(ship.spec, s, ship.orders, { dt: DT, tick: i + 1 })
        maxHeight = Math.max(maxHeight, heightAt(terrain, s.position.x, s.position.z))
        if (s.waypoint === 0 && prevWaypoint !== 0) laps++
        prevWaypoint = s.waypoint
      }
      expect(laps, `${ship.id} never completed a lap`).toBe(1)
      expect(maxHeight, `${ship.id} touched land`).toBeLessThanOrEqual(SEA_LEVEL_M)
    }
  })

  it('worldFromScenario itself rejects a loop over land when handed terrain', () => {
    const overLand = withScenario({
      ships: [{ ...bundle.scenario.ships[0]!, waypoints: [[-29666, -47605], [-29666, -40000]] }],
    })
    expect(() => worldFromScenario(overLand, terrain)).toThrow(/cv-1.*leg/)
  })
})

describe('validation', () => {
  it('rejects a duplicate id across kinds, a missing player, an unknown spec and an unknown airfield', () => {
    expect(() => worldFromScenario(withScenario({ ships: [{ ...bundle.scenario.ships[0]!, id: 'f6f-1' }] }), null)).toThrow(/duplicate.*f6f-1/)
    expect(() => worldFromScenario(withScenario({ player: 'nobody' }), null)).toThrow(/player.*nobody/)
    expect(() => worldFromScenario(withScenario({ aircraft: [{ ...bundle.scenario.aircraft[0]!, spec: 'p-38' }] }), null)).toThrow(/p-38/)
    expect(() => worldFromScenario(withScenario({ aircraft: [{ ...bundle.scenario.aircraft[0]!, parkedAt: { airfield: 'ormoc', spot: 'runwayCenter' } }] }), null)).toThrow(/ormoc/)
  })

  it('the schema rejects an unknown key and a one-point loop', () => {
    const raw = JSON.parse(JSON.stringify(bundle.scenario)) as Record<string, unknown>
    expect(() => parseScenario({ ...raw, loadout: {} })).toThrow(/loadout/)
    expect(() => parseScenario({ ...raw, ships: [{ id: 'x', spec: 'essex-cv', waypoints: [[0, 0]], speedMps: 5 }] })).toThrow(/waypoints/)
    expect(() => parseScenario({ ...raw, weather: { windFromDeg: 0, windMps: -1 } })).toThrow(/windMps/)
    expect(() => parseScenario({ ...raw, weather: { windFromDeg: 0 } })).toThrow(/windMps/)
  })
})

describe('deck quals (Plan 8)', () => {
  const quals = loadScenarioBundle('deck-quals')

  it('parks the player on the carrier deck, sailing with the ship, nose along the deck', () => {
    const world = worldFromScenario(quals, null)
    const player = playerAircraft(world)
    const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
    const local = deckLocal(deck, player.state.position.x, player.state.position.z)
    expect(local.x).toBeCloseTo(0, 6)
    expect(local.z).toBeCloseTo(-110, 6)
    expect(player.state.position.y).toBeCloseTo(deck.center.y + player.spec.gear.heightM, 9)
    expect(player.state.velocity).toEqual(deck.velocity)
    expect(player.parked).toBe(true)
    // Nose toward the bow: parkedAttitude's own rule against the ship's heading.
    expect(player.state.attitude).toEqual(qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck.headingRad))
    // The wingman is still ashore at Tacloban.
    const wingman = world.aircraft.find((a) => a.id === 'f6f-2')!
    expect(Math.hypot(wingman.state.position.x - -29666, wingman.state.position.z - -47605)).toBeLessThan(300)
    expect(world.wind).not.toBeNull()
  })

  it('rejects a deck spot off the deck, and a ship that has no flight deck', () => {
    const off = withScenario({ ...quals.scenario, aircraft: [{ ...quals.scenario.aircraft[0]!, parkedAt: { ship: 'cv-1', spot: { x: 0, z: -200 } } }] }, quals)
    expect(() => worldFromScenario(off, null)).toThrow(/off the deck/)
    const escort = withScenario({ ...quals.scenario, aircraft: [{ ...quals.scenario.aircraft[0]!, parkedAt: { ship: 'dd-1', spot: { x: 0, z: 0 } } }] }, quals)
    expect(() => worldFromScenario(escort, null)).toThrow(/dd-1.*flight deck/)
  })
})

describe('cloud layers (Plan 16a)', () => {
  const raw = () => JSON.parse(JSON.stringify(bundle.scenario)) as Record<string, unknown> & { weather: Record<string, unknown> }
  const withClouds = (clouds: unknown) => ({ ...raw(), weather: { ...raw().weather, clouds } })
  const cumulus = { kind: 'cumulus', baseM: 1500, thicknessM: 900, coverage: 0.45 }

  it('parses the shipped decks: free-flight has two layers, deck-quals two, the range none', () => {
    expect(loadScenario('free-flight').weather.clouds?.map((c) => c.kind)).toEqual(['cumulus', 'cirrus'])
    expect(loadScenario('deck-quals').weather.clouds?.map((c) => c.kind)).toEqual(['cumulus', 'cirrus'])
    expect(loadScenario('gunnery-range').weather.clouds).toBeUndefined()
  })

  it('rejects an unknown key, a negative base, zero thickness, coverage outside [0, 1], five layers and overlap', () => {
    expect(() => parseScenario(withClouds([{ ...cumulus, typo: 1 }]))).toThrow(/typo/)
    expect(() => parseScenario(withClouds([{ ...cumulus, baseM: -1 }]))).toThrow(/baseM/)
    expect(() => parseScenario(withClouds([{ ...cumulus, thicknessM: 0 }]))).toThrow(/thicknessM/)
    expect(() => parseScenario(withClouds([{ ...cumulus, coverage: 1.2 }]))).toThrow(/coverage/)
    expect(() => parseScenario(withClouds(Array(5).fill(cumulus).map((c, i) => ({ ...c, baseM: 1000 * (i + 1), thicknessM: 100 }))))).toThrow(/clouds/)
    expect(() => parseScenario(withClouds([cumulus, { ...cumulus, baseM: 2000 }]))).toThrow(/overlap/)
    expect(parseScenario(withClouds([cumulus, { kind: 'cirrus', baseM: 7000, thicknessM: 300, coverage: 0.35 }])).weather.clouds).toHaveLength(2)
  })
})

describe('time of day (Plan 16c)', () => {
  const raw = () => JSON.parse(JSON.stringify(loadScenarioBundle('free-flight').scenario)) as Record<string, unknown> & { weather: Record<string, unknown> }
  const withTime = (timeOfDay: unknown) => ({ ...raw(), weather: { ...raw().weather, timeOfDay } })

  it('is apparent solar time in [0, 24): accepts 0 and 23.99, rejects 24, -1 and a string', () => {
    expect(parseScenario(withTime(0)).weather.timeOfDay).toBe(0)
    expect(parseScenario(withTime(23.99)).weather.timeOfDay).toBe(23.99)
    expect(() => parseScenario(withTime(24))).toThrow(/timeOfDay/)
    expect(() => parseScenario(withTime(-1))).toThrow(/timeOfDay/)
    expect(() => parseScenario(withTime('noon'))).toThrow(/timeOfDay/)
  })
  it('is optional: absent parses, and the renderer treats absent as 12', () => {
    const weather = { ...raw().weather }
    delete weather.timeOfDay
    expect(parseScenario({ ...raw(), weather }).weather.timeOfDay).toBeUndefined()
  })
  it('ships free flight at 10:00, deck quals at 16:30 and the range at noon', () => {
    expect(loadScenario('free-flight').weather.timeOfDay).toBe(10)
    expect(loadScenario('deck-quals').weather.timeOfDay).toBe(16.5)
    expect(loadScenario('gunnery-range').weather.timeOfDay).toBe(12)
  })
})

describe('the zero-speed ship and enemyAirfields (Plan 6b)', () => {
  const raw = JSON.parse(JSON.stringify(bundle.scenario)) as Record<string, unknown>

  it('rejects a zero-speed ship with fewer than one waypoint, accepts one for zero speed, requires two above zero', () => {
    expect(() => parseScenario({ ...raw, ships: [{ id: 's', spec: 'fletcher-dd', waypoints: [], speedMps: 0 }] })).toThrow(/waypoints/)
    expect(() => parseScenario({ ...raw, ships: [{ id: 's', spec: 'fletcher-dd', waypoints: [[0, 0]], speedMps: 0 }] })).not.toThrow()
    expect(() => parseScenario({ ...raw, ships: [{ id: 's', spec: 'fletcher-dd', waypoints: [[0, 0]], speedMps: 5 }] })).toThrow(/waypoints/)
  })

  it('enemyAirfields must be a subset of airfields', () => {
    expect(() => parseScenario({ ...raw, enemyAirfields: ['nonexistent'] })).toThrow(/enemyAirfields/)
    expect(() => parseScenario({ ...raw, airfields: ['tacloban', 'dulag'], enemyAirfields: ['dulag'] })).not.toThrow()
  })
})

describe('the strike-range scenario: loadout and a single-waypoint anchored ship (Plan 6b)', () => {
  it('worldFromScenario seeds stores from the loadout argument, clean when omitted', () => {
    const strike = loadScenarioBundle('strike-range')
    const clean = worldFromScenario(strike, null)
    expect(clean.combat.aircraft[clean.player]!.stores).toEqual(emptyStores)
    const armed = worldFromScenario(strike, null, 'both')
    expect(armed.combat.aircraft[armed.player]!.stores.bombs).toBeGreaterThan(0)
  })

  it('a single-waypoint anchored ship builds without reading a second waypoint', () => {
    const strike = loadScenarioBundle('strike-range')
    expect(() => worldFromScenario(strike, null)).not.toThrow()
  })

  it('the maru is anchored (zero speed) about 6 km east of Dulag, over water', () => {
    const strike = loadScenarioBundle('strike-range')
    const w = worldFromScenario(strike, null)
    const maru = w.ships.find((s) => s.id === 'maru-1')!
    expect(maru.state.speedMps).toBe(0)
    const dulag = strike.airfields['dulag']!
    const km = Math.hypot(maru.state.position.x - dulag.runway.center.x, maru.state.position.z - dulag.runway.center.z) / 1000
    expect(km).toBeGreaterThan(5)
    expect(km).toBeLessThan(7)
  })

  it('the maru loop passes assertLoopOverWater on the real terrain', () => {
    const strike = loadScenarioBundle('strike-range')
    expect(() => worldFromScenario(strike, terrain)).not.toThrow()
  })

  // Task 7 fix: `worldFromScenario` was building `world.structures` from
  // every airfield's buildings (correct) but never threading the scenario's
  // `enemyAirfields` into `createWorldOf`, so `World` had no way to say which
  // of them were hostile -- `RAZED` counted every destroyed structure, not
  // just Dulag's (spec §3.5). This pins `world.enemyStructureIds` against
  // the real shipped content rather than a synthetic fixture, so a content
  // edit to either base's buildings is caught here too.
  it('worldFromScenario populates world.enemyStructureIds with exactly Dulag\'s structures, none of Tacloban\'s', () => {
    const strike = loadScenarioBundle('strike-range')
    expect(strike.scenario.enemyAirfields).toEqual(['dulag'])
    const w = worldFromScenario(strike, null)
    const dulagIds = strike.airfields['dulag']!.buildings.map((b) => b.id)
    const taclobanIds = strike.airfields['tacloban']!.buildings.map((b) => b.id)
    expect(dulagIds).toHaveLength(2) // Plan 13d Task 4 gave Dulag its own smaller set
    expect(taclobanIds).toHaveLength(5) // Plan 9 Task 1 added tacloban-aaa-1
    expect([...w.enemyStructureIds].sort()).toEqual([...dulagIds].sort())
    for (const id of taclobanIds) expect(w.enemyStructureIds.has(id)).toBe(false)
  })
})
