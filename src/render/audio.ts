import type { AudioInputs } from '../audio/cues.js'
import { onGround } from '../sim/ground.js'
import { decksOf } from '../sim/world/deck.js'
import { groundUnder } from '../sim/world/ground.js'
import { playerAircraft } from '../sim/loop.js'
import type { FrameState } from './frame.js'

/**
 * Adapts a `FrameState` into the plain value `src/audio/` consumes.
 *
 * This lives in its own module with its own test rather than as an object
 * literal inside `main.ts`'s render loop, and that is the whole point of the
 * file. `main.ts` has no Tier 1 test: the entire assists layer shipped INERT
 * in the browser because every test called `applyAssists` directly and nothing
 * ever threaded it into `advance` (see `Assist` in src/sim/loop.ts). An
 * adapter written inline would repeat that exactly -- every audio test would
 * pass while nothing reached a speaker.
 *
 * The dependency runs one way: `render/` may import `sim/`, and `audio/` sees
 * neither. That is `audio-must-not-import-render` in .dependency-cruiser.cjs.
 */
export function audioInputsFrom(frame: FrameState): AudioInputs {
  const { terrain, ships } = frame.world
  const { state: aircraft, impact, spec } = playerAircraft(frame.world)
  // ONE ground model (Plan 8 review, item 3): `groundUnder` is what
  // `src/sim/flight/model.ts`, `src/render/landing.ts` and `main.ts` all read,
  // and it knows about carrier decks as well as terrain. This adapter called
  // `heightAt`/`surfaceAt` directly until 2026-09-19, so an airplane chocked
  // on a flight deck before the heightfield arrived reported `onGround: null`
  // -- "no terrain yet" -- and a trap on a deck could never squeak.
  const ground = groundUnder(terrain, decksOf(ships), aircraft.position.x, aircraft.position.z)
  return {
    // `frame.controls` is the identical object the player entity's `controls`
    // holds, so this is the throttle the simulation actually ran, not a copy
    // that can drift.
    throttle: frame.controls.throttle,
    engineRunning: impact === null,
    impact: impact === null ? null : { tick: impact.tick, kind: impact.kind, surface: impact.surface },
    // The WORLD's clock, not the airplane's: they agree after every step, and
    // the cue's "a tick that went backwards means a new flight" rule is about
    // the flight, which is the world (spec §4).
    tick: frame.world.tick,
    // `null`, not `false`, while there is no ground: the airplane spawns
    // parked and the heightfield arrives seconds later, so calling that gap
    // "airborne" would make its arrival a landing. A deck-parked airplane has
    // ground from tick 0 whatever the terrain is doing.
    onGround: ground === null ? null : onGround(spec, aircraft, ground.heightM),
    // The SAME lookup `onGround` was judged against, so the two cannot
    // disagree about what the airplane is over.
    groundSurface: ground === null ? null : ground.surface,
  }
}
