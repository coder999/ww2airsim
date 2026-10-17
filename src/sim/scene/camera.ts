import type { Keyframe, Scene } from './schema.js'

/** The interpolated eye at scene time `t`: position lerp, yaw by the short way round, pitch lerp. Clamped to the first and last key. */
export type SceneEye = { readonly position: readonly [number, number, number]; readonly yawDeg: number; readonly pitchDeg: number }

const inOut = (u: number): number => u * u * (3 - 2 * u)
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u
/** Shortest signed turn from `a` to `b`, degrees. */
const turn = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180

const eyeOf = (k: Keyframe): SceneEye => ({ position: k.position, yawDeg: k.yawDeg, pitchDeg: k.pitchDeg })

export function sceneAt(scene: Pick<Scene, 'camera'>, t: number): SceneEye {
  const ks = scene.camera
  const first = ks[0]!
  const last = ks[ks.length - 1]!
  if (t <= first.t) return eyeOf(first)
  if (t >= last.t) return eyeOf(last)
  const i = ks.findIndex((k) => k.t > t)
  const a = ks[i - 1]!
  const b = ks[i]!
  const raw = (t - a.t) / (b.t - a.t)
  const u = b.ease === 'linear' ? raw : inOut(raw)
  return {
    position: [lerp(a.position[0], b.position[0], u), lerp(a.position[1], b.position[1], u), lerp(a.position[2], b.position[2], u)],
    yawDeg: a.yawDeg + turn(a.yawDeg, b.yawDeg) * u,
    pitchDeg: lerp(a.pitchDeg, b.pitchDeg, u),
  }
}
