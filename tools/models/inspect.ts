// tools/models/inspect.ts
/**
 * `npm run models:inspect -- <file.glb>`: the node tree with per-node
 * triangle counts and bounds, materials, textures and animations. Every
 * coordinate it prints is in the file's SOURCE frame (world space, every node
 * matrix applied), which is the frame a `tools/models/entries/*.json` entry
 * is written in (A6M Zero spec §6.1).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getBounds } from '@gltf-transform/functions'
import type { Document, Node } from '@gltf-transform/core'
import { modelIO, onlyScene } from './document.js'
import { measureDocument, nodeTriangles, webpSize } from './measure.js'
import { AXES, type Axis } from './manifest.js'
import { yawScene } from './stages/yaw.js'

const fmt = (v: readonly number[]): string => `[${v.map((x) => x.toFixed(3)).join(', ')}]`

function subtreeTriangles(node: Node): number {
  let sum = 0
  node.traverse((n) => { sum += nodeTriangles(n) })
  return sum
}

export function inspectDocument(doc: Document, label: string): string {
  const m = measureDocument(doc)
  const root = doc.getRoot()
  const lines: string[] = [
    `${label}: ${root.listNodes().length} nodes, ${root.listMeshes().length} meshes, ` +
      `${root.listMaterials().length} materials, ${m.textures} textures, ${m.animations} animations, ` +
      `${m.triangles} triangles, ${m.drawCalls} draw calls`,
    `bounds (source units): min ${fmt(m.bounds.min)} max ${fmt(m.bounds.max)}`,
    `extensionsRequired: ${m.extensionsRequired.join(', ') || '(none)'}`,
    'nodes (name, own triangles / subtree triangles, materials, bounds):',
  ]
  const walk = (node: Node, depth: number): void => {
    const mats = node.getMesh()?.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '(none)') ?? []
    const b = getBounds(node)
    const bounds = Number.isFinite(b.min[0]) ? ` min ${fmt(b.min)} max ${fmt(b.max)}` : ''
    lines.push(`${'  '.repeat(depth + 1)}"${node.getName()}" ${nodeTriangles(node)}/${subtreeTriangles(node)}` +
      `${mats.length ? ` [${mats.join(', ')}]` : ''}${bounds}`)
    for (const c of node.listChildren()) walk(c, depth + 1)
  }
  for (const n of onlyScene(doc).listChildren()) walk(n, 0)
  lines.push('materials:')
  for (const mat of root.listMaterials()) lines.push(`  "${mat.getName()}" alpha=${mat.getAlphaMode()}`)
  lines.push('textures:')
  for (const t of root.listTextures()) {
    const img = t.getImage()
    const s = t.getMimeType() === 'image/webp' && img ? webpSize(img) : t.getSize()
    lines.push(`  "${t.getName() || t.getURI()}" ${t.getMimeType()} ${s ? `${s[0]}x${s[1]}` : '?'}`)
  }
  lines.push('animations:')
  for (const a of root.listAnimations()) lines.push(`  "${a.getName()}" ${a.listChannels().length} channels`)
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, ...rest] = process.argv.slice(2)
  if (!file) {
    console.error('usage: npm run models:inspect -- <file.glb> [--yaw <deg> [--up <axis>]]')
    process.exit(2)
  }
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(file)))
  const yawAt = rest.indexOf('--yaw'), upAt = rest.indexOf('--up')
  const up = (upAt >= 0 ? rest[upAt + 1] : '+y') as Axis
  if (!AXES.includes(up)) {
    console.error(`--up must be one of ${AXES.join(' ')}`)
    process.exit(2)
  }
  if (yawAt >= 0) yawScene(doc, up, Number(rest[yawAt + 1]))
  console.log(inspectDocument(doc, yawAt >= 0 ? `${file} (turned ${rest[yawAt + 1]} deg about ${up})` : file))
}
