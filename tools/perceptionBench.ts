/**
 * F6B budget gate (a): the sim cost of night perception. 24 aircraft (23 enemy pilots and the player), 100 authored
 * lights (4 flares, 2 searchlights, pots, fixtures and a nav light per aircraft), alternating the night fact on and off
 * in ONE process, 7 blocks of 600 ticks each, median ms per tick of each. Run: `remote-run npx tsx tools/perceptionBench.ts`.
 * Gate: on minus off at most 0.15 ms per tick. Not a test (docs/testing.md: budget numbers never gate a correctness run).
 */
import { performance } from 'node:perf_hooks'
import { GREEN_SKILL, initialDecision } from '../src/sim/ai/pilot.js'
import { DT } from '../src/sim/flight/model.js'
import { advance, createWorldOf, withControls, withNightFacts, type World } from '../src/sim/loop.js'
import type { LightSpec } from '../src/sim/lights/lights.js'
import { v3 } from '../src/sim/math/vec3.js'
import { loadAircraftSpec } from './content/load.js'
import { level } from '../tests/sim/ai/maneuverWorlds.js'

const zero = loadAircraftSpec('a6m2-zero'), f6f = loadAircraftSpec('f6f-hellcat')
const SRC = { source: 'gameplay', sourceNote: 'bench' } as const
const aircraft = [level('me', f6f, v3(0, 1500, 0), v3(100, 0, 0))]
for (let i = 0; i < 23; i++) {
  const pilot = { target: null, skill: GREEN_SKILL, decision: { ...initialDecision(`z${i}`), targetId: null } }
  aircraft.push(level(`z${i}`, zero, v3(2000 + 800 * (i % 6), 1200 + 60 * i, -3000 + 600 * Math.floor(i / 6)), v3(-100, 0, 0), pilot))
}
const lights: LightSpec[] = []
for (const a of aircraft) lights.push({ id: `nav-${a.id}`, kind: 'nav', at: { aircraft: a.id, point: 'all' }, color: 'white', state: 'on', ...SRC } as LightSpec)
for (let i = 0; i < 4; i++) lights.push({ id: `fl${i}`, kind: 'flare', at: { x: 1500 * i, z: 0, altitudeM: 1500 }, color: 'warm', state: 'on', schedule: { onAtS: 0, burnS: 600 }, ...SRC } as LightSpec)
for (let i = 0; i < 2; i++) lights.push({ id: `sl${i}`, kind: 'searchlight', at: { x: 3000 * i, z: 500 }, color: 'white', state: 'on', aim: { azimuthDeg: 0, elevationDeg: 60 }, ...SRC } as LightSpec)
for (let i = 0; lights.length < 100; i++) lights.push({ id: `pot${i}`, kind: 'pot', at: { x: 40 * i, z: 800 }, color: 'warm', state: 'lit', ...SRC } as LightSpec)

const base = createWorldOf({ aircraft, player: 'me' })
const night = withNightFacts(base, { hour0: 21, latDeg: 11.24, cloudCover: 0.1, lights })
const block = (w0: World<undefined>): number => {
  let w = w0
  const t0 = performance.now()
  for (let i = 0; i < 600; i++) w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }), DT).world
  return (performance.now() - t0) / 600
}
block(night); block(base) // warm up
const on: number[] = [], off: number[] = []
for (let k = 0; k < 7; k++) { off.push(block(base)); on.push(block(night)) }
const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
console.log(JSON.stringify({ aircraft: aircraft.length, lights: lights.length, offMsPerTick: +med(off).toFixed(4), onMsPerTick: +med(on).toFixed(4), deltaMs: +(med(on) - med(off)).toFixed(4), gateMs: 0.15 }))
