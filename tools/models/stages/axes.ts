// tools/models/stages/axes.ts
import type { Axis } from '../manifest.js'

export type Vec3 = [number, number, number]

export function axisVector(a: Axis): Vec3 {
  const v: Vec3 = [0, 0, 0]
  v['xyz'.indexOf(a[1]!)] = a[0] === '-' ? -1 : 1
  return v
}

export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
