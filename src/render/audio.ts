import type { AudioInputs } from '../audio/cues.js'
import { engineFamilyFor } from '../audio/mix.js'
import { onGround } from '../sim/ground.js'
import { wheelDepthOf } from '../sim/gearContact.js'
import { sub } from '../sim/math/vec3.js'
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
export function audioInputsFrom(frame: Pick<FrameState, 'world' | 'controls'>): AudioInputs {
  const { terrain, ships } = frame.world
  const { state: aircraft, impact, spec } = playerAircraft(frame.world)
  // ONE ground model (Plan 8 review, item 3): `groundUnder` is what
  // `src/sim/flight/model.ts`, `src/sim/landing.ts` and `main.ts` all read,
  // and it knows about carrier decks as well as terrain. This adapter called
  // `heightAt`/`surfaceAt` directly until 2026-09-19, so an airplane chocked
  // on a flight deck before the heightfield arrived reported `onGround: null`
  // -- "no terrain yet" -- and a trap on a deck could never squeak.
  const decks = decksOf(ships)
  const ground = groundUnder(terrain, decks, aircraft.position.x, aircraft.position.z)
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
    onGround: ground === null ? null : onGround(spec, aircraft, ground.heightM, ground.velocity),
    // The SAME lookup `onGround` was judged against, so the two cannot
    // disagree about what the airplane is over.
    groundSurface: ground === null ? null : ground.surface,
    // Wheel height and sink rate for the touchdown squeak's airborne latch and
    // sink gate (src/audio/cues.ts). Both relative to the surface, so a moving
    // deck reads like land.
    heightM: ground === null ? null : aircraft.position.y - wheelDepthOf(spec, aircraft) - ground.heightM,
    sinkMps: ground === null ? 0 : -sub(aircraft.velocity, ground.velocity).y,
    // The player's own record in `World.combat` (Plan 6): the count the
    // fixed step actually incremented, not the trigger. A world built without
    // a combat record for the player cannot exist -- `createCombat` writes one
    // per entity -- so the lookup is total, but `?? 0` keeps a hand-built test
    // world from throwing inside the render loop.
    shots: frame.world.combat.aircraft[frame.world.player]?.shots ?? 0,
    // Cumulative release counts (Plan 6b Task 10), NOT `stores`: that field
    // falls as bombs/rockets leave the racks/rails, so reading it here would
    // hand the cue reducer a count that goes the wrong way -- it needs a
    // count that only ever rises, exactly like `shots` above.
    bombsDropped: frame.world.combat.aircraft[frame.world.player]?.bombsDropped ?? 0,
    rocketsFired: frame.world.combat.aircraft[frame.world.player]?.rocketsFired ?? 0,
    engineFamily: engineFamilyFor(spec.id),
    // Whole (1) for a hand-built world with no combat record, same fail-quiet posture as the counts above.
    structure: frame.world.combat.aircraft[frame.world.player]?.damage.structure ?? 1,
    engineHealth: frame.world.combat.aircraft[frame.world.player]?.damage.engine ?? 1,
    arrested: aircraft.arrested,
    hookDown: frame.controls.hookDown === true,
    // Centre distance less half the deck length: a cue for "near a carrier", not a rectangle test.
    deckDistanceM: decks.length === 0
      ? null
      : Math.max(0, Math.min(...decks.map((d) => Math.hypot(aircraft.position.x - d.center.x, aircraft.position.z - d.center.z) - d.lengthM / 2))),
  }
}
