export type Vec3 = { readonly x: number; readonly y: number; readonly z: number }

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const ZERO: Vec3 = v3(0, 0, 0)

export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s)
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const length = (a: Vec3): number => Math.sqrt(dot(a, a))

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a)
  return len === 0 ? ZERO : scale(a, 1 / len)
}
