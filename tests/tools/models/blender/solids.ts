// tests/tools/models/blender/solids.ts
/** Triangles grouped into islands of welded positions (keys to 1e-6 m): one inverted solid in a
 *  node cannot hide behind another's volume (R3; shared by DP2's ship tests). */
export function islands(tris: number[][][]): number[][][][] {
  const key = (p: number[]): string => p.map((v) => v.toFixed(6)).join(',')
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r)! !== r) r = parent.get(r)!
    parent.set(k, r)
    return r
  }
  for (const t of tris) for (const p of t) if (!parent.has(key(p))) parent.set(key(p), key(p))
  for (const t of tris) for (const p of t.slice(1)) parent.set(find(key(p)), find(key(t[0]!)))
  const groups = new Map<string, number[][][]>()
  for (const t of tris) {
    const r = find(key(t[0]!))
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(t)
  }
  return [...groups.values()]
}

/** The signed volume of a closed triangle set: positive when every face points outward. */
export const signedVolume = (tris: number[][][]): number =>
  tris.reduce((s, [a, b, c]) => s + (a![0]! * (b![1]! * c![2]! - b![2]! * c![1]!)
    - a![1]! * (b![0]! * c![2]! - b![2]! * c![0]!) + a![2]! * (b![0]! * c![1]! - b![1]! * c![0]!)) / 6, 0)
