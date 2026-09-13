/**
 * mulberry32. Chosen deliberately: it uses only integer arithmetic and
 * Math.imul, both of which are exactly specified by IEEE-754 / ECMAScript, so
 * the sequence is bit-identical across V8 versions and platforms. A PRNG built
 * on Math.sin (a common one-liner) would not be — see spec §3.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
