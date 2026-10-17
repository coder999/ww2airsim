import { clampAbove, headingPitch } from '../replay/cameras.js'
import { DT } from '../sim/flight/model.js'
import type { World } from '../sim/loop.js'
import { v3 } from '../sim/math/vec3.js'
import { sceneAt } from '../sim/scene/camera.js'
import { beginPreroll, handoffPreroll, stepPreroll, type Preroll } from '../sim/scene/preroll.js'
import { parseScene, type Scene } from '../sim/scene/schema.js'
import type { EyeTransform, SurfaceHeightAt } from './camera.js'
import { posesFor } from './frame.js'
import { sceneUrl } from './content.js'

/**
 * F9 flow (plan 2026-10-17): when a scene plays, how it is loaded, and one pure playback state the frame loop drives.
 * Live playback and skip both finish through `stepPreroll`, so they land in the same world.
 */

/** A missing, unreadable or invalid scene is `null`, never an error: the flight proceeds without it (plan gate: fail safely). */
export async function loadScene(id: string, fetchText: (url: string) => Promise<string> = async (u) => (await fetch(u)).text()): Promise<Scene | null> {
  try {
    return parseScene(JSON.parse(await fetchText(sceneUrl(id))))
  } catch {
    return null
  }
}

export type ScenePlayback = {
  readonly scene: Scene
  readonly p: Preroll<undefined>
  /** Real seconds of scene time consumed. */
  readonly tS: number
  /** Real seconds owed to the next fixed tick. */
  readonly accS: number
}

export const beginPlayback = (world: World<undefined>, scene: Scene): ScenePlayback =>
  ({ scene, p: beginPreroll(world, scene), tS: 0, accS: 0 })

export const playbackDone = (sp: ScenePlayback): boolean => sp.p.left <= 0

/** Advance by real time: whole fixed ticks, the remainder kept for pose interpolation. */
export function stepPlayback(sp: ScenePlayback, elapsedS: number): ScenePlayback {
  let p = sp.p
  let acc = sp.accS + elapsedS
  while (acc >= DT && p.left > 0) { p = stepPreroll(p); acc -= DT }
  return { ...sp, p, tS: sp.tS + elapsedS, accS: p.left > 0 ? acc : 0 }
}

/** Skip: the same remaining ticks, headless. */
export function skipPlayback(sp: ScenePlayback): ScenePlayback {
  let p = sp.p
  while (p.left > 0) p = stepPreroll(p)
  return { ...sp, p, accS: 0 }
}

/** The world to fly from, with the mission clock started. */
export const handoffWorld = (sp: ScenePlayback): World<undefined> => handoffPreroll(sp.p)

/** What the frame draws while the scene plays. */
export function sceneView(sp: ScenePlayback, surfaceHeightAt: SurfaceHeightAt) {
  const world = sp.p.world
  const eye = sceneAt(sp.scene, sp.tS)
  const transform: EyeTransform = {
    position: clampAbove(v3(...eye.position), surfaceHeightAt),
    attitude: headingPitch(eye.yawDeg * Math.PI / 180, eye.pitchDeg * Math.PI / 180),
  }
  return { world, eye: transform, ...posesFor(world, Math.min(1, sp.accS / DT)) }
}
