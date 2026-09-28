import { DT } from '../sim/flight/model.js'
import type { World } from '../sim/loop.js'
import type { Vec3 } from '../sim/math/vec3.js'
import { nextFxEvents, NO_FX_MEMORY, type FxMemory, type FxWorldView } from '../render/fx/events.js'
import type { FxSystem } from '../render/fx/system.js'
import type { Recording } from './recorder.js'
import { replayPosesAt, type ReplayPoses } from './view.js'

/**
 * Instant replay ruling R-3: the live fx system is reseeded with this fixed
 * seed on replay entry and on every jump, so a re-run from a recorded world
 * always spawns the same particles in the same places -- unlike live play,
 * which seeds from wall-clock-ish state, replay determinism requires a fixed
 * value.
 */
export const REPLAY_FX_SEED = 1945

/**
 * Ship and structure smoke anchors are renderer bookkeeping (mesh handles),
 * not part of a recorded `World` (see `render/main.ts`'s own construction of
 * these maps). The replay UI supplies the current frame's anchors; this
 * module only threads them through to `nextFxEvents`.
 */
export type FxAnchors = {
  readonly shipSmokeOrigins: ReadonlyMap<string, Vec3>
  readonly structureAnchors: ReadonlyMap<string, Vec3>
}

const viewOf = (w: World<undefined>, poses: ReplayPoses['poses'], anchors: FxAnchors): FxWorldView => ({
  tick: w.tick, combat: w.combat, aircraft: w.aircraft, poses, ...anchors,
})

/**
 * One playing frame: advance the fx system from a recorded/interpolated pose
 * (spec §7; plan R-3). Used both by normal replay playback and, world by
 * world, by `rebuildReplayFx` below -- the two must agree exactly, so a jump
 * lands on the same particles a play-through to the same time would.
 */
export function stepReplayFx(fx: FxSystem, memory: FxMemory, pose: ReplayPoses, dtS: number, anchors: FxAnchors): FxMemory {
  const events = nextFxEvents(memory, viewOf(pose.world, pose.poses, anchors))
  for (const t of events.triggers) fx.trigger(t.recipe, t.position, t.velocity)
  fx.setSustained(events.sustained)
  fx.step(dtS)
  return events.memory
}

/**
 * Reseed and re-run the fx system from the start of the recording up to
 * `tS` (spec §7, §8; plan R-3): reset, prime silently from the first
 * recorded world, then re-step every recorded world in between (dt = the
 * tick gap x DT, matching how the ticks were actually spaced during
 * recording -- triple time leaves gaps), then step the tail past the last
 * processed tick up to `tS` itself.
 *
 * "Prime silently" (brief step 3): `nextFxEvents(NO_FX_MEMORY, view(first))`
 * is called only to seed `FxMemory`'s seen-tick bookkeeping from the first
 * recorded world -- its own triggers are dropped, so bursts already
 * resolved before the recording started (an impact already in the ring)
 * don't replay on entry.
 */
export function rebuildReplayFx(fx: FxSystem, rec: Recording, tS: number, anchors: FxAnchors): FxMemory {
  fx.reset(REPLAY_FX_SEED)
  const worlds = rec.worlds
  const first = worlds[0]!
  const firstPose = replayPosesAt(rec, first.tick * DT)
  let memory = nextFxEvents(NO_FX_MEMORY, viewOf(first, firstPose.poses, anchors)).memory
  let prevTick = first.tick
  let i = 1
  for (; i < worlds.length && worlds[i]!.tick * DT <= tS; i++) {
    const w = worlds[i]!
    const pose = replayPosesAt(rec, w.tick * DT)
    memory = stepReplayFx(fx, memory, pose, (w.tick - prevTick) * DT, anchors)
    prevTick = w.tick
  }
  const tailS = tS - prevTick * DT
  if (tailS > 0) fx.step(tailS)
  return memory
}
