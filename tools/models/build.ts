// tools/models/build.ts
/**
 * `npm run models:build -- [<id>...] [--force]`: raw download in
 * tools/models/cache/ (gitignored) -> committed glb in content/aircraft/ or
 * content/ships/, driven by one `tools/models/entries/<id>.json` per model
 * (A6M Zero spec §6).
 *
 * LOAD-BEARING: no stage compresses geometry. No EXT_meshopt_compression and
 * no Draco: GLTFLoader has no decoder wired in this project, and the
 * Wildcat's first build was unloadable at runtime for exactly that reason
 * (20bcaa4). `checkOutput` fails any output whose extensionsRequired holds
 * anything but EXT_texture_webp.
 *
 * With no id, builds every entry whose raw input exists locally, skips
 * frozen entries, and names every entry it skipped and why.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getBounds, prune } from '@gltf-transform/functions'
import { Logger, type Document } from '@gltf-transform/core'
import { loadModelEntries, type ModelEntry } from './manifest.js'
import { findNode, modelIO } from './document.js'
import { measureDocument, type ModelMeasure } from './measure.js'
import { removeNodes } from './stages/remove.js'
import { splitByBox } from './stages/split.js'
import { collapseKept } from './stages/collapse.js'
import { pivotNode } from './stages/pivot.js'
import { normalizeDocument } from './stages/normalize.js'
import { simplifyDocument } from './stages/simplify.js'
import { joinExcept } from './stages/join.js'
import { compressTextures } from './stages/textures.js'
import { forceOpaque } from './stages/opaque.js'

export const ALLOWED_REQUIRED_EXTENSIONS: readonly string[] = ['EXT_texture_webp']

/** The names of an entry's articulated output nodes: keep `as` names and
 *  split names that are not removed. */
export function partNames(entry: ModelEntry): string[] {
  return [
    ...entry.keep.map((k) => k.as ?? k.node),
    ...entry.split.map((s) => s.name).filter((n) => !entry.remove.includes(n)),
  ]
}

/** Every stage, in order, on a document already read. Mutates and returns it. */
export async function runPipeline(doc: Document, entry: ModelEntry): Promise<Document> {
  doc.setLogger(new Logger(Logger.Verbosity.WARN))
  const splitNames = new Set(entry.split.map((s) => s.name))
  // 1. remove (source nodes)
  removeNodes(doc, entry.remove.filter((n) => !splitNames.has(n)))
  // Presence of every kept node, before anything renames it.
  for (const k of entry.keep) findNode(doc, k.node)
  // 2. split, then drop the split names `remove` lists
  for (const s of entry.split) splitByBox(doc, s)
  removeNodes(doc, entry.remove.filter((n) => splitNames.has(n)))
  // simplify (moved ahead of join: see stages/simplify.ts)
  if (entry.simplify) await simplifyDocument(doc, entry.simplify)
  if (entry.normalize) {
    // collapse + 3. pivot + 4. normalize
    for (const k of entry.keep) {
      const node = collapseKept(doc, k)
      if (k.pivot) pivotNode(doc, node, k.pivot)
    }
    for (const s of entry.split) {
      if (s.pivot && !entry.remove.includes(s.name)) pivotNode(doc, findNode(doc, s.name), s.pivot)
    }
    normalizeDocument(doc, entry.normalize)
  }
  // 5. join everything except the parts
  await joinExcept(doc, new Set([...entry.keep.map((k) => k.as ?? k.node), ...entry.keep.map((k) => k.node), ...splitNames]))
  // 6. textures, 7. opaque
  await compressTextures(doc, entry.textures.maxSize)
  if (entry.opaque) forceOpaque(doc)
  await doc.transform(prune({ keepSolidTextures: true, keepLeaves: false }))
  // Provenance travels inside the file (checked by tests/tools/models/outputs.test.ts).
  const asset = doc.getRoot().getAsset()
  asset.extras = { ...(asset.extras ?? {}), source: entry.source.url, author: entry.source.author, license: entry.source.license }
  return doc
}

/** Every way an output can break its entry's contract, as messages naming the
 *  measured value and the limit. Empty = acceptable. Used by the build (before
 *  anything is written) and by the committed-output tests. */
export function checkOutput(doc: Document, byteLength: number, entry: ModelEntry): string[] {
  const m: ModelMeasure = measureDocument(doc)
  const out: string[] = []
  const b = entry.budget
  if (byteLength > b.maxBytes) out.push(`${byteLength} bytes > budget ${b.maxBytes}`)
  if (m.triangles > b.maxTriangles) out.push(`${m.triangles} triangles > budget ${b.maxTriangles}`)
  if (m.drawCalls > b.maxDrawCalls) out.push(`${m.drawCalls} draw calls > budget ${b.maxDrawCalls}`)
  const badExt = m.extensionsRequired.filter((e) => !ALLOWED_REQUIRED_EXTENSIONS.includes(e))
  if (badExt.length) out.push(`extensionsRequired has ${badExt.join(', ')}: GLTFLoader has no decoder for it`)
  if (entry.opaque && m.blendMaterials.length) out.push(`BLEND materials: ${m.blendMaterials.join(', ')}`)
  if (m.maxTextureSize > entry.textures.maxSize) out.push(`a ${m.maxTextureSize}px texture > maxSize ${entry.textures.maxSize}`)
  const names = doc.getRoot().listNodes().map((n) => n.getName())
  for (const p of partNames(entry)) {
    const count = names.filter((n) => n === p).length
    if (count !== 1) out.push(`part "${p}": expected exactly one node, found ${count}`)
  }
  if (entry.noseNode !== undefined && names.includes(entry.noseNode)) {
    const centerX = (name: string): number => { const bb = getBounds(findNode(doc, name)); return (bb.min[0] + bb.max[0]) / 2 }
    const nose = centerX(entry.noseNode)
    const ahead = doc.getRoot().listNodes().filter((n) => n.getMesh() && n.getName() !== entry.noseNode && centerX(n.getName()) >= nose)
    if (ahead.length) out.push(`noseNode "${entry.noseNode}" is not the frontmost part: ${ahead.map((n) => n.getName()).join(', ')} center at or ahead of it`)
  }
  return out
}

export interface BuildDeps {
  exists(path: string): boolean
  read(path: string): Promise<Document>
  write(path: string, bytes: Uint8Array): void
  encode(doc: Document): Promise<Uint8Array>
  log(line: string): void
}

/** The driver, with its file system injected so tests never touch the disk.
 *  Returns the process exit code. */
export async function runBuild(entries: readonly ModelEntry[], argv: readonly string[], deps: BuildDeps): Promise<number> {
  const force = argv.includes('--force')
  const ids = argv.filter((a) => a !== '--force')
  const unknown = ids.filter((id) => !entries.some((e) => e.id === id))
  if (unknown.length) {
    deps.log(`unknown model id: ${unknown.join(', ')} (entries: ${entries.map((e) => e.id).join(', ')})`)
    return 1
  }
  const explicit = ids.length > 0
  const chosen = explicit ? entries.filter((e) => ids.includes(e.id)) : entries
  let failed = false
  for (const entry of chosen) {
    if (entry.frozen !== undefined && !(explicit && force)) {
      deps.log(`${explicit ? 'refused' : 'skipped'} ${entry.id}: frozen (${entry.frozen})${explicit ? '; pass --force to rebuild it anyway' : ''}`)
      if (explicit) failed = true
      continue
    }
    if (!deps.exists(entry.input)) {
      deps.log(`${explicit ? 'missing' : 'skipped'} ${entry.id}: raw input ${entry.input} is not here; re-fetch with tools/models/sketchfab-fetch.sh ${entry.source.uid} <name> and copy it there`)
      if (explicit) failed = true
      continue
    }
    const doc = await runPipeline(await deps.read(entry.input), entry)
    const bytes = await deps.encode(doc)
    const problems = checkOutput(doc, bytes.byteLength, entry)
    if (problems.length) {
      deps.log(`FAILED ${entry.id}, nothing written: ${problems.join('; ')}`)
      failed = true
      continue
    }
    deps.write(entry.output, bytes)
    const m = measureDocument(doc)
    deps.log(`built ${entry.id} -> ${entry.output}: ${bytes.byteLength} bytes, ${m.triangles} triangles, ${m.drawCalls} draw calls`)
  }
  return failed ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const io = modelIO()
  const code = await runBuild(loadModelEntries(), process.argv.slice(2), {
    exists: existsSync,
    read: async (p) => io.readBinary(new Uint8Array(readFileSync(p))),
    write: (p, bytes) => writeFileSync(p, bytes),
    encode: (doc) => io.writeBinary(doc),
    log: (line) => console.log(line),
  })
  process.exit(code)
}
