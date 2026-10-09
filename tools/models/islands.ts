// tools/models/islands.ts
/**
 * `npx tsx tools/models/islands.ts <entry-id> [minTris] [--box x0,y0,z0,x1,y1,z1 ...]`: a
 * download's connected shells (the ones `split`'s `components` select), with
 * bounds in the OUTPUT ship frame (+x bow, y up from the waterline, +z
 * starboard), so a gun mount can be found by where it stands on the ship.
 * Each `--box` (output frame) is printed back as the input-frame
 * `boxMin`/`boxMax` an entry's `split` takes. Track M, M1 (2026-10-08).
 *
 * The output frame here is normalize's only; shipFit's hull fit then scales z
 * by its beam factor k (~1), so z is within a few percent of the shipped model.
 */
import { readFileSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import { loadModelEntries } from './manifest.js'
import { modelIO, meshNodes } from './document.js'
import { normalizeMatrix } from './stages/normalize.js'
import { pitchScene, yawScene } from './stages/yaw.js'
import { removeNodes } from './stages/remove.js'
import { applyMatrix } from './stages/geometry.js'
import { simplifyDocument } from './stages/simplify.js'
import { documentSoup } from './stages/shipFit.js'
import { surfaceBelow } from '../../src/render/scene/shipFit.js'

const [id, minArg, ...rest] = process.argv.slice(2)
const entry = loadModelEntries().find((e) => e.id === id)
if (!entry?.normalize) throw new Error(`${id}: no entry with normalize`)
// A Blender entry's raw is the script's output in the cache (build.ts blenderIntermediate).
const raw = entry.input ?? `tools/models/cache/${entry.id}.glb`
const minTris = Number(minArg ?? 20)
const doc = await modelIO().readBinary(new Uint8Array(readFileSync(raw)))
if (entry.normalize.yawDeg !== undefined) yawScene(doc, entry.normalize.up, entry.normalize.yawDeg)
if (entry.normalize.pitchDeg !== undefined) pitchScene(doc, entry.normalize.forward, entry.normalize.up, entry.normalize.pitchDeg)
removeNodes(doc, entry.remove.filter((n) => !entry.split.some((s) => s.name === n)))
// The scale comes from bounds AFTER simplify, as in the pipeline (a simplified stern can be shorter).
const sized = await modelIO().readBinary(new Uint8Array(readFileSync(raw)))
if (entry.normalize.yawDeg !== undefined) yawScene(sized, entry.normalize.up, entry.normalize.yawDeg)
if (entry.normalize.pitchDeg !== undefined) pitchScene(sized, entry.normalize.forward, entry.normalize.up, entry.normalize.pitchDeg)
removeNodes(sized, entry.remove.filter((n) => !entry.split.some((s) => s.name === n)))
if (entry.simplify) await simplifyDocument(sized, entry.simplify)
const sb = getBounds(sized.getRoot().listScenes()[0]!)
const m = normalizeMatrix(entry.normalize, sb.min, sb.max)
const out = (p: number[]): number[] => applyMatrix(m, p, 0)

type Island = { tris: number; min: number[]; max: number[]; node: string }
const islands: Island[] = []
for (const node of meshNodes(doc)) {
  const w = node.getWorldMatrix()
  for (const prim of node.getMesh()!.listPrimitives()) {
    if (prim.getMode() !== 4) continue
    const pos = prim.getAttribute('POSITION')!.getArray()!
    const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i)
    const key = new Map<string, number>(), parent: number[] = []
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
    const k = (v: number): number => { const s = `${pos[3 * v]},${pos[3 * v + 1]},${pos[3 * v + 2]}`; let r = key.get(s); if (r === undefined) { r = parent.length; parent.push(r); key.set(s, r) } return r }
    const tk: number[] = []
    for (let t = 0; t < idx.length / 3; t++) { const a = k(idx[3 * t]!), b = k(idx[3 * t + 1]!), c = k(idx[3 * t + 2]!); parent[find(b)] = find(a); parent[find(c)] = find(a); tk.push(a) }
    const groups = new Map<number, Island>()
    for (let t = 0; t < idx.length / 3; t++) {
      const r = find(tk[t]!)
      let g = groups.get(r)
      if (!g) { g = { tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], node: node.getName() }; groups.set(r, g) }
      g.tris++
      for (let j = 0; j < 3; j++) {
        const o = out(applyMatrix(w, pos, idx[3 * t + j]!))
        for (let a = 0; a < 3; a++) { g.min[a] = Math.min(g.min[a]!, o[a]!); g.max[a] = Math.max(g.max[a]!, o[a]!) }
      }
    }
    islands.push(...groups.values())
  }
}
const f = (v: number[]): string => v.map((x) => x.toFixed(2).padStart(7)).join(',')
const probes = rest.filter((a, i) => rest[i - 1] === '--probe')
const boxes = rest.filter((a, i) => a !== '--box' && a !== '--probe' && rest[i - 1] === '--box')
if (probes.length) {
  // Heights on the COMMITTED output (the shipped frame): the topmost surface at x,z at or below y (default: any).
  const shipped = await modelIO().readBinary(new Uint8Array(readFileSync(entry.output)))
  const soup = documentSoup(shipped)
  for (const p of probes) { const [x, z, y] = p.split(',').map(Number) as [number, number, number?]; console.log(`probe ${x},${z}: ${surfaceBelow(soup, x, z, y ?? 1e4)?.toFixed(2) ?? 'none'}`) }
} else if (boxes.length === 0) {
  console.log(`${id}: ${islands.length} islands; showing >= ${minTris} tris, bow first (output frame min / max / plan center)`)
  for (const i of islands.filter((i) => i.tris >= minTris).sort((a, b) => b.max[0]! + b.min[0]! - a.max[0]! - a.min[0]!)) {
    console.log(`${String(i.tris).padStart(6)}  min ${f(i.min)}  max ${f(i.max)}  c ${f([(i.min[0]! + i.max[0]!) / 2, i.min[1]!, (i.min[2]! + i.max[2]!) / 2])}  ${i.node}`)
  }
} else {
  // Invert the normalize matrix's affine part on the box's 8 corners.
  const inv = (p: number[]): number[] => {
    const a = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]] as number[][]
    const d = [p[0]! - m[12]!, p[1]! - m[13]!, p[2]! - m[14]!]
    const det = a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) - a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) + a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!)
    const col = (c: number, v: number[]): number[][] => a.map((row, r) => row.map((x, j) => (j === c ? v[r]! : x)))
    const d3 = (b: number[][]): number => b[0]![0]! * (b[1]![1]! * b[2]![2]! - b[1]![2]! * b[2]![1]!) - b[0]![1]! * (b[1]![0]! * b[2]![2]! - b[1]![2]! * b[2]![0]!) + b[0]![2]! * (b[1]![0]! * b[2]![1]! - b[1]![1]! * b[2]![0]!)
    return [0, 1, 2].map((c) => d3(col(c, d)) / det)
  }
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b.split(',').map(Number) as [number, number, number, number, number, number]
    const corners = [[x0, y0, z0], [x1, y1, z1], [x0, y1, z1], [x1, y0, z0]].map(inv)
    const lo = [0, 1, 2].map((a) => Math.min(...corners.map((c) => c[a]!)))
    const hi = [0, 1, 2].map((a) => Math.max(...corners.map((c) => c[a]!)))
    console.log(`"boxMin": [${lo.map((v) => +v.toFixed(5)).join(', ')}], "boxMax": [${hi.map((v) => +v.toFixed(5)).join(', ')}]`)
  }
}
