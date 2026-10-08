import { DAMAGE_BLAST_NEAR_M, ROUND_HIT_NEAR_M, type AudioInputs } from '../audio/cues.js'
import type { CombatImpact } from '../sim/weapons/impacts.js'
import type { Vec3 } from '../sim/math/vec3.js'
import { engineFamilyFor } from '../audio/mix.js'
import { onGround } from '../sim/ground.js'
import { wheelDepthOf } from '../sim/gearContact.js'
import { sub } from '../sim/math/vec3.js'
import { qRotate, type Quat } from '../sim/math/quat.js'
import type { SpatialInputs } from '../audio/spatial.js'
import { decksOf } from '../sim/world/deck.js'
import { groundUnder } from '../sim/world/ground.js'
import { playerAircraft } from '../sim/loop.js'
import type { FrameState } from './frame.js'

/**
 * Adapts a `FrameState` into the plain value `src/audio/` consumes.
 *
 * This lives in its own module with its own test rather than as an object
 * literal inside `main.ts`'s render loop, and that is the whole point of the
 * file. `main.ts` has no Deterministic test: the entire assists layer shipped INERT
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
    damage: damageEventsNear(frame.world.combat.impacts, aircraft.position),
  }
}

/** The newest event of each `DamageCause` at the player: a round that struck an aircraft within
 *  `ROUND_HIT_NEAR_M`, a bomb or rocket detonation within `DAMAGE_BLAST_NEAR_M`. */
function damageEventsNear(impacts: readonly CombatImpact[], at: Vec3): AudioInputs['damage'] {
  const found: { round?: { tick: number }; blast?: { tick: number } } = {}
  for (let i = impacts.length - 1; i >= 0 && (found.round === undefined || found.blast === undefined); i--) {
    const hit = impacts[i]!
    const d = Math.hypot(hit.point.x - at.x, hit.point.y - at.y, hit.point.z - at.z)
    if (hit.cause === 'round') {
      if (found.round === undefined && hit.surface === 'aircraft' && d <= ROUND_HIT_NEAR_M) found.round = { tick: hit.tick }
    } else if (found.blast === undefined && hit.outcome === 'detonated' && d <= DAMAGE_BLAST_NEAR_M) {
      found.blast = { tick: hit.tick }
    }
  }
  return found
}

/**
 * The camera's ears and everything the spatial reducer may place: every other
 * aircraft that is still flying, the decks, and every bomb or rocket
 * detonation still in the impact ring. `eye` is the world-space camera pose in
 * sim convention (body +X forward, +Y up); the world itself is Web Audio's
 * right-handed frame (north -z, east +x, up +y), so directions pass through
 * unchanged.
 */
export function spatialInputsFrom(
  frame: Pick<FrameState, 'world'>,
  eye: { readonly position: Vec3; readonly attitude: Quat },
): SpatialInputs {
  const { world } = frame
  const player = playerAircraft(world)
  return {
    tick: world.tick,
    listener: {
      position: eye.position,
      forward: qRotate(eye.attitude, { x: 1, y: 0, z: 0 }),
      up: qRotate(eye.attitude, { x: 0, y: 1, z: 0 }),
      velocity: player.state.velocity,
    },
    aircraft: world.aircraft
      .filter((a) => a.id !== world.player && world.combat.aircraft[a.id]?.damage.destroyedAt == null)
      .map((a) => ({
        id: a.id,
        family: engineFamilyFor(a.spec.id),
        position: a.state.position,
        velocity: a.state.velocity,
        shots: world.combat.aircraft[a.id]?.shots ?? 0,
        engineHealth: world.combat.aircraft[a.id]?.damage.engine ?? 1,
      })),
    decks: decksOf(world.ships).map((d, i) => ({ id: `deck${i}`, center: d.center, lengthM: d.lengthM })),
    blasts: world.combat.impacts
      .filter((h) => h.cause !== 'round' && h.outcome === 'detonated')
      .map((h) => ({ tick: h.tick, surface: h.surface, position: h.point })),
  }
}
