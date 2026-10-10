import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRangeTest, NATIONALITY } from '../../tools/scenarios/rangeTest.js'
import { loadScenarioBundle, loadShipSpec } from '../../tools/content/load.js'
import { AXIS_VARIANTS, scenarioFileFor } from '../../src/sim/sortie.js'

/**
 * The Range Test (docs/superpowers/plans/2026-10-10-god-mode-range-test.md):
 * every enemy airplane circles overhead, every enemy ship is anchored nearby,
 * and the cargo ship is there whichever side you fly. Which enemy depends on
 * the side of the airplane chosen.
 */
const list = (dir: string): string[] => readdirSync(new URL(`../../content/${dir}/`, import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
const sideOfSpec = (id: string): string => JSON.parse(readFileSync(new URL(`../../content/aircraft/${id}.json`, import.meta.url), 'utf8')).side

const allied = loadScenarioBundle('range-test').scenario
const axis = loadScenarioBundle('range-test-axis').scenario
const BASE = { x: -29666, z: -47605 } // Tacloban runway centre

const aircraftOf = (s: typeof allied) => s.aircraft.filter((a) => a.id !== s.player)
const specsOf = (xs: readonly { spec: string }[]): string[] => xs.map((x) => x.spec).sort()

describe('Range Test scenarios', () => {
  it('picks the Japanese-pilot file for a Japanese airplane and the Allied one for anyone else', () => {
    expect(AXIS_VARIANTS['range-test']).toBe('range-test-axis')
    expect(scenarioFileFor('range-test', 'japanese')).toBe('range-test-axis')
    expect(scenarioFileFor('range-test', 'allied')).toBe('range-test')
    expect(scenarioFileFor('free-flight', 'japanese')).toBe('free-flight')
  })

  it('an Allied pilot meets EVERY Japanese airplane, and a Japanese pilot EVERY Allied one', () => {
    const all = list('aircraft')
    expect(specsOf(aircraftOf(allied))).toEqual(all.filter((s) => sideOfSpec(s) === 'japanese'))
    expect(specsOf(aircraftOf(axis))).toEqual(all.filter((s) => sideOfSpec(s) === 'allied'))
  })

  it('every ship model is used, the cargo ship is in both, and nothing else is shared', () => {
    expect(new Set([...specsOf(allied.ships), ...specsOf(axis.ships)])).toEqual(new Set(list('ships')))
    for (const s of [allied, axis]) expect(specsOf(s.ships)).toContain('type-b-maru')
    const shared = specsOf(allied.ships).filter((s) => specsOf(axis.ships).includes(s))
    expect(shared).toEqual(['type-b-maru'])
    for (const s of list('ships')) expect(NATIONALITY[s], s).toBeDefined()
  })

  it('sides: the pilot is on its own side and every target, the cargo ship included, is on the other', () => {
    const player = (s: typeof allied) => s.aircraft.find((a) => a.id === s.player)!
    expect(player(allied).side ?? 'allied').toBe('allied')
    for (const a of aircraftOf(allied)) expect(a.side, a.id).toBe('axis')
    for (const sh of allied.ships) expect(sh.side, sh.id).toBe('axis')
    expect(player(axis).side).toBe('axis')
    for (const a of aircraftOf(axis)) expect(a.side, a.id).toBe('allied')
    for (const sh of axis.ships) expect(sh.side, sh.id).toBe('allied')
    expect(axis.airfieldSides).toEqual({ tacloban: 'axis' })
  })

  it('every enemy airplane is a sitting duck: passive, on its own altitude, slower than 1.5 x stall', () => {
    for (const s of [allied, axis]) {
      const ducks = aircraftOf(s)
      for (const d of ducks) {
        expect(d.pilot?.passive, d.id).toBeDefined()
        expect(d.pilot?.passive?.orbitRadiusM, d.id).toBeGreaterThanOrEqual(2000)
      }
      const alts = ducks.map((d) => ('airborneAt' in d ? d.airborneAt.position[1] : -1)).sort((a, b) => a - b)
      for (let i = 1; i < alts.length; i++) expect(alts[i]! - alts[i - 1]!, 'altitude separation').toBeGreaterThanOrEqual(100)
    }
  })

  it('the player takes off from Tacloban', () => {
    for (const s of [allied, axis]) {
      const p = s.aircraft.find((a) => a.id === s.player)!
      expect('parkedAt' in p && 'airfield' in p.parkedAt && p.parkedAt.airfield).toBe('tacloban')
    }
  })

  it('no two hulls overlap, every ship is within 3 km of the airfield, and none sits on the take-off path', () => {
    for (const s of [allied, axis]) {
      const hulls = s.ships.map((sh) => ({ id: sh.id, x: sh.waypoints[0]![0], z: sh.waypoints[0]![1], half: loadShipSpec(sh.spec).lengthM / 2 }))
      for (const h of hulls) {
        expect(Math.hypot(h.x - BASE.x, h.z - BASE.z), h.id).toBeLessThan(3000)
        expect(Math.abs(h.x - BASE.x) < 400 + h.half && h.z < BASE.z && h.z > BASE.z - 6000, `${h.id} on the take-off path`).toBe(false)
      }
      for (let i = 0; i < hulls.length; i++) for (let j = i + 1; j < hulls.length; j++) {
        expect(Math.hypot(hulls[i]!.x - hulls[j]!.x, hulls[i]!.z - hulls[j]!.z), `${hulls[i]!.id} / ${hulls[j]!.id}`).toBeGreaterThan(hulls[i]!.half + hulls[j]!.half)
      }
    }
  })

  it('the committed files are exactly what tools/scenarios/rangeTest.ts writes', () => {
    const read = (f: string) => JSON.parse(readFileSync(new URL(`../../content/scenarios/${f}.json`, import.meta.url), 'utf8'))
    expect(buildRangeTest('allied')).toEqual(read('range-test'))
    expect(buildRangeTest('axis')).toEqual(read('range-test-axis'))
  })
})
