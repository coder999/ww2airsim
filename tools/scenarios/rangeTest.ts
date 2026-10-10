/**
 * Generates the two Range Test scenarios (docs/superpowers/plans/2026-10-10-god-mode-range-test.md):
 *
 *   range-test.json          an Allied pilot: every Japanese airplane circles
 *                            overhead, every Japanese ship is anchored nearby.
 *   range-test-axis.json     a Japanese pilot: the mirror image (declared a variant of
 *                            `range-test` in `AXIS_VARIANTS`, `src/sim/sortie.ts`).
 *
 * Both carry the cargo ship ("neutral": always a legal target, so it takes the
 * side OPPOSITE the player). The title screen offers one Dev row,
 * `range-test`, and `main.ts` picks the file from the side of the airplane
 * chosen (`scenarioFileFor` in `src/sim/sortie.ts`).
 *
 * Run `npx tsx tools/scenarios/rangeTest.ts`. Deterministic: the same content
 * and terrain give the same bytes, and `tests/tools/rangeTestScenarios.test.ts`
 * fails if the committed files drift from what this writes.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createTerrainField, heightAt, type TerrainField } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel } from '../terrain/load.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
type Json = { readonly [key: string]: Json } & { readonly side?: string; readonly lengthM?: number; readonly reference?: { readonly stallSpeedMps: number }; readonly runway?: { readonly center: { x: number; z: number } } }
const read = (p: string): Json => JSON.parse(readFileSync(ROOT + p, 'utf8')) as Json

/** Tacloban airfield's runway centre (content/bases/tacloban.json); the ring and the ships are laid out around it. */
const BASE = read('content/bases/tacloban.json').runway!.center
const ORBIT_RADIUS_M = 2400
const FIRST_ALTITUDE_M = 600
const ALTITUDE_STEP_M = 130
/** Slow, but never below the loiter's own floor (1.3 x stall, `loiter.ts`). */
const SPEED_OVER_STALL = 1.4
/** Open water: the terrain says sea (it holds the sea at 0 m) and the ocean depth grid says at least this deep (the sim floats a ship at sea level whatever the depth, so this only has to mean "sea, not a lagoon or river"), all around the hull and a margin beyond it. */
const MIN_DEPTH_M = 2
const HULL_MARGIN_M = 120

/** Ship nationality is not in the ship specs, only a role, so it is written down here. */
export const NATIONALITY: Readonly<Record<string, 'allied' | 'japanese' | 'cargo'>> = {
  'casablanca-cve': 'allied', 'cleveland-cl': 'allied', 'essex-cv': 'allied', 'fletcher-dd': 'allied', 'pennsylvania-bb': 'allied',
  'abukuma-cl': 'japanese', 'kagero-dd': 'japanese', 'mogami-ca': 'japanese', 'shiratsuyu-dd': 'japanese', 'yamato-bb': 'japanese', 'zuikaku-cv': 'japanese',
  'type-b-maru': 'cargo',
}

type Side = 'allied' | 'axis'
const shipSpecs = readdirSync(ROOT + 'content/ships').filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort()
const aircraftSpecs = readdirSync(ROOT + 'content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort()
for (const s of shipSpecs) if (NATIONALITY[s] === undefined) throw new Error(`ship ${s} has no nationality in tools/scenarios/rangeTest.ts: add it, so the Range Test stays complete`)

const terrain: TerrainField = (() => {
  const header = loadTerrainHeader()
  return createTerrainField(header, 1, loadTerrainLevel(1, header))
})()

/** The ocean depth grid (content/ocean/depth.bin): int16 metres, row 0 NORTH, column 0 WEST; negative is water. `src/render/ocean/depth.ts` reads the same file but needs a browser (`import.meta.env`), so this is its twin. */
const depthHeader = read('content/ocean/header.json') as unknown as { samples: number; halfExtentM: number }
const depthSamples = (() => {
  const buf = readFileSync(ROOT + 'content/ocean/depth.bin')
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
})()
function depthAt(x: number, z: number): number {
  const { samples: n, halfExtentM: h } = depthHeader
  if (Math.abs(x) > h || Math.abs(z) > h) return -8000
  const col = ((x + h) / (2 * h)) * (n - 1), row = ((z + h) / (2 * h)) * (n - 1)
  const ix = Math.min(Math.floor(col), n - 2), iz = Math.min(Math.floor(row), n - 2)
  const fx = col - ix, fz = row - iz
  const at = (dx: number, dz: number): number => depthSamples[(iz + dz) * n + ix + dx]!
  return Math.min(0, (1 - fz) * ((1 - fx) * at(0, 0) + fx * at(1, 0)) + fz * ((1 - fx) * at(0, 1) + fx * at(1, 1)))
}

function isWaterAt(x: number, z: number): boolean {
  return heightAt(terrain, x, z) <= 0.05 && depthAt(x, z) <= -MIN_DEPTH_M
}

function isOpenWater(x: number, z: number, radiusM: number): boolean {
  if (!isWaterAt(x, z)) return false
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    if (!isWaterAt(x + Math.cos(a) * radiusM, z + Math.sin(a) * radiusM)) return false
  }
  return true
}

/** Every ship of the given kinds, big hulls first, each at the nearest open water to the airfield that clears the ones already placed. */
function placeShips(specs: readonly string[], placed: { x: number; z: number; r: number }[]): { spec: string; x: number; z: number }[] {
  const lengthOf = (s: string): number => read(`content/ships/${s}.json`).lengthM!
  const out: { spec: string; x: number; z: number }[] = []
  for (const spec of [...specs].sort((a, b) => lengthOf(b) - lengthOf(a) || a.localeCompare(b))) {
    const r = lengthOf(spec) / 2 + HULL_MARGIN_M
    let best: { x: number; z: number; d: number } | null = null
    for (let x = BASE.x - 14000; x <= BASE.x + 14000; x += 250) for (let z = BASE.z - 14000; z <= BASE.z + 14000; z += 250) {
      const d = Math.hypot(x - BASE.x, z - BASE.z)
      if (d < 1500 || (best !== null && d >= best.d)) continue
      // Keep the take-off path clear: the runway points north (heading 0), so no hull within 400 m of its extended centreline, out to 6 km.
      if (Math.abs(x - BASE.x) < 400 + r && z < BASE.z && z > BASE.z - 6000) continue
      if (!isOpenWater(x, z, r)) continue
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r)) continue
      best = { x, z, d }
    }
    if (best === null) throw new Error(`no open water for ${spec} near Tacloban`)
    placed.push({ x: best.x, z: best.z, r })
    out.push({ spec, x: Math.round(best.x), z: Math.round(best.z) })
  }
  return out.sort((a, b) => a.spec.localeCompare(b.spec))
}

const round = (n: number, p = 1): number => Math.round(n * 10 ** p) / 10 ** p

function build(player: Side): object {
  const enemy: Side = player === 'allied' ? 'axis' : 'allied'
  const enemyNation = player === 'allied' ? 'japanese' : 'allied'
  const ducks = aircraftSpecs.filter((s) => read(`content/aircraft/${s}.json`).side === enemyNation)
  const aircraft: object[] = [{
    id: 'player-1', spec: 'f6f-hellcat', ...(player === 'axis' ? { side: 'axis' } : {}),
    parkedAt: { airfield: 'tacloban', spot: { x: 0, z: 700 } }, chocked: false,
  }]
  ducks.forEach((spec, k) => {
    // Start on the ring, heading counter-clockwise, so the centre of the circle is the airfield (`loiterReference`: the centre lies to the left).
    const theta = (k / ducks.length) * Math.PI * 2
    const x = BASE.x + Math.cos(theta) * ORBIT_RADIUS_M, z = BASE.z + Math.sin(theta) * ORBIT_RADIUS_M
    const psi = theta - Math.PI / 2
    const compassDeg = ((Math.atan2(Math.cos(psi), -Math.sin(psi)) * 180) / Math.PI + 360) % 360
    const stall = read(`content/aircraft/${spec}.json`).reference!.stallSpeedMps
    aircraft.push({
      id: `duck-${spec}`, spec, side: enemy,
      airborneAt: { position: [Math.round(x), FIRST_ALTITUDE_M + k * ALTITUDE_STEP_M, Math.round(z)], headingDeg: round(compassDeg), speedMps: round(stall * SPEED_OVER_STALL), throttle: 0.4 },
      pilot: { skill: 'green', passive: { orbitRadiusM: ORBIT_RADIUS_M } },
    })
  })
  const placed: { x: number; z: number; r: number }[] = []
  const enemyShips = shipSpecs.filter((s) => NATIONALITY[s] === enemyNation)
  const ships = [...placeShips([...enemyShips, 'type-b-maru'], placed)].map((s) => ({
    id: `ship-${s.spec}`, spec: s.spec, side: enemy, waypoints: [[s.x, s.z]], speedMps: 0,
  }))
  return {
    id: player === 'allied' ? 'range-test' : 'range-test-axis',
    player: 'player-1',
    airfields: ['tacloban'],
    ...(player === 'axis' ? { airfieldSides: { tacloban: 'axis' } } : {}),
    aircraft,
    ships,
    weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const side of ['allied', 'axis'] as const) {
    const scenario = build(side) as { id: string }
    writeFileSync(`${ROOT}content/scenarios/${scenario.id}.json`, JSON.stringify(scenario, null, 2) + '\n')
    console.log('wrote', scenario.id)
  }
}
export const buildRangeTest = build
