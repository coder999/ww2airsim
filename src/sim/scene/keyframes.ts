import type { Keyframe } from './schema.js'

export type KeyframeSample = Readonly<Omit<Keyframe, 'position' | 'ease'>> & {
  readonly position: readonly [number, number, number]
  readonly ease?: Keyframe['ease']
}

function copyKey(key: KeyframeSample): Keyframe {
  return {
    t: key.t, position: [...key.position], yawDeg: key.yawDeg, pitchDeg: key.pitchDeg,
    ease: key.ease ?? 'inOut',
  }
}

/** A dropped key replaces all keys within 1 ms of its time. */
export function dropKey(keys: readonly Keyframe[], key: Keyframe): Keyframe[] {
  return [...keys.filter((k) => Math.abs(k.t - key.t) > 1e-3), key]
    .map(copyKey).sort((a, b) => a.t - b.t)
}

/** Index refers to the input list; an invalid index leaves every key. */
export function deleteKey(keys: readonly Keyframe[], index: number): Keyframe[] {
  return keys.filter((_, i) => i !== index).map(copyKey).sort((a, b) => a.t - b.t)
}

/** Keep chronological endpoints, then time-spaced moves or turns from the last retained key. */
export function recordPath(
  samples: readonly KeyframeSample[], minDtS: number, minMoveM: number, minTurnDeg: number,
): Keyframe[] {
  if ([minDtS, minMoveM, minTurnDeg].some((n) => !Number.isFinite(n) || n < 0)) {
    throw new RangeError('recordPath thresholds must be finite and nonnegative')
  }
  const sorted = samples.map(copyKey).sort((a, b) => a.t - b.t)
  if (sorted.length < 2) return sorted
  const keys = [sorted[0]!]
  for (let i = 1; i < sorted.length - 1; i++) {
    const sample = sorted[i]!
    const last = keys[keys.length - 1]!
    if (sample.t - last.t < minDtS) continue
    const move = Math.hypot(
      sample.position[0] - last.position[0],
      sample.position[1] - last.position[1],
      sample.position[2] - last.position[2],
    )
    const yaw = Math.abs((sample.yawDeg - last.yawDeg) % 360)
    const turn = Math.max(Math.min(yaw, 360 - yaw), Math.abs(sample.pitchDeg - last.pitchDeg))
    if (move >= minMoveM || turn >= minTurnDeg) keys.push(sample)
  }
  keys.push(sorted[sorted.length - 1]!)
  return keys
}
