import type { AudioInputs } from '../audio/cues.js'
import { onGround } from '../sim/ground.js'
import { heightAt } from '../sim/world/terrain.js'
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
  const { terrain, aircraft, impact, spec } = frame.world
  return {
    // `frame.controls` is the identical object `world.controls` holds, so this
    // is the throttle the simulation actually ran, not a copy that can drift.
    throttle: frame.controls.throttle,
    engineRunning: impact === null,
    impact: impact === null ? null : { tick: impact.tick, kind: impact.kind },
    // `null`, not `false`, while there is no terrain: the airplane spawns
    // parked and the heightfield arrives seconds later, so calling that gap
    // "airborne" would make its arrival a landing.
    onGround:
      terrain === null
        ? null
        : onGround(spec, aircraft, heightAt(terrain, aircraft.position.x, aircraft.position.z)),
  }
}
