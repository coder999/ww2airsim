// tests/tools/models/soupHash.ts
import { createHash } from 'node:crypto'
import type { Document } from '@gltf-transform/core'
import { documentSoup } from '../../../tools/models/stages/shipFit.js'

/** A hash of every triangle in the scene frame, independent of vertex and triangle order: each
 *  triangle's corners rounded to 0.1 mm, rotated to start at its least corner (winding kept), then
 *  sorted. Two documents hash equal exactly when they draw the same triangles (DP2, Review Focus 2). */
export function soupHash(doc: Document): string {
  const s = documentSoup(doc)
  const key = (i: number): string => [0, 1, 2].map((k) => (Math.round(s.positions[3 * i + k]! * 1e4) / 1e4).toFixed(4)).join(',')
  const tris: string[] = []
  for (let t = 0; t < s.indices.length / 3; t++) {
    const c = [key(s.indices[3 * t]!), key(s.indices[3 * t + 1]!), key(s.indices[3 * t + 2]!)]
    const r = c.indexOf([...c].sort()[0]!)
    tris.push([c[r], c[(r + 1) % 3], c[(r + 2) % 3]].join('|'))
  }
  return createHash('sha256').update(tris.sort().join('\n')).digest('hex')
}
