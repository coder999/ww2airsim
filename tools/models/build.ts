// tools/models/build.ts
/**
 * `npm run models:build -- [<id>...] [--force]`: raw download, a generator or a Blender
 * script -> committed glb in content/aircraft/, ships/, ordnance/, buildings/ or vehicles/,
 * driven by one `tools/models/entries/<id>.json` per model (A6M Zero spec §6).
 *
 * LOAD-BEARING: no stage compresses geometry. No EXT_meshopt_compression and
 * no Draco: GLTFLoader has no decoder wired in this project, and the
 * Wildcat's first build was unloadable at runtime for exactly that reason
 * (20bcaa4). `checkOutput` fails any output whose extensionsRequired holds
 * anything but EXT_texture_webp.
 *
 * With no id, builds every entry whose raw input exists locally, skips
 * frozen entries, and names every entry it skipped and why. A blender entry
 * is skipped, and named, where no Blender is on PATH.
 */
import { z } from 'zod'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cloneDocument, getBounds, join, prune } from '@gltf-transform/functions'
import { Logger, PropertyType, type Document, type Mesh, type Node } from '@gltf-transform/core'
import { loadModelEntries, type ModelEntry } from './manifest.js'
import { BLENDER_VERSION, blenderPresent, detailSidecarPath, hingesSidecarPath, runBlenderScript } from './blender/run.js'
import { loadBake, loadBakeFor, sha256, type BakeMaps } from './skin/bake.js'
import { downloadDetails, downloadMarkings } from './skin/downloadDetail.js'
import type { BlenderSource, SketchfabSource } from './manifest.js'
import { findNode, modelIO, onlyScene } from './document.js'
import { measureDocument, type ModelMeasure } from './measure.js'
import { removeNodes } from './stages/remove.js'
import { splitByBox } from './stages/split.js'
import { collapseKept } from './stages/collapse.js'
import { pivotNode, type Hinge } from './stages/pivot.js'
import { legacyOptimize } from './legacy.js'
import { normalizeDocument } from './stages/normalize.js'
import { simplifyDocument } from './stages/simplify.js'
import { joinExcept } from './stages/join.js'
import { pitchScene, yawScene } from './stages/yaw.js'
import { dedupMaterials } from './stages/dedup.js'
import { compressTextures } from './stages/textures.js'
import { forceOpaque } from './stages/opaque.js'
import { addShipMarkers, shipFitStage, SKIRT_NODE } from './stages/shipFit.js'
import { isRoleMaterial, shipMaterials } from './stages/shipMaterials.js'
import { addMountLocators, carveMounts, namedMounts } from './stages/shipMounts.js'
import { loadShipSpec } from '../content/load.js'
import type { ShipSpec } from '../../src/sim/world/ships.js'
import { parseSidecar, skinSidecarPath } from './skin/sidecar.js'
import { withShipColors } from './skin/shipColors.js'
import { attachSkinTextures, skinDocument, skinMaterialName, SHIP_SKIN_OPTIONS, type ScanLoader, type SkinImages } from './skin/stage.js'
import { loadScan } from './skin/scans.js'
import { boxProject } from './skin/boxProject.js'
import { GENERATORS } from './generated/registry.js'

export const ALLOWED_REQUIRED_EXTENSIONS: readonly string[] = ['EXT_texture_webp']

/** The names of an entry's articulated output nodes: keep `as` names and
 *  split names that are not removed. */
export function partNames(entry: ModelEntry): string[] {
  return [
    ...entry.keep.map((k) => k.as ?? k.node),
    ...entry.split.map((s) => s.name).filter((n) => !entry.remove.includes(n)),
  ]
}

/** Where a blender entry's raw glb lands before the stages run (gitignored by /tools/**\/cache/). */
export function blenderIntermediate(id: string): string {
  return `tools/models/cache/${id}.glb`
}

/** What travels inside the output file (checked by tests/tools/models/outputs.test.ts). The
 *  Sketchfab keys stay in their pre-R1 order: TOY_SHA256_BEFORE_O1 pins the bytes. */
function provenance(s: SketchfabSource | BlenderSource): Record<string, string> {
  return s.kind === 'sketchfab'
    ? { source: s.url, author: s.author, license: s.license }
    : { source: 'blender', script: s.script, dimensions: s.dimensions, license: s.license }
}

/** A script's hinges sidecar (kit.py `export`), checked: every axis a unit vector. */
export function parseHinges(text: string): Record<string, Hinge> {
  const v3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
  const side = z.object({ version: z.literal(1), model: z.string(), hinges: z.record(z.string(), z.object({ point: v3, axis: v3 }).strict()) }).strict().parse(JSON.parse(text))
  for (const [n, h] of Object.entries(side.hinges)) {
    if (Math.abs(Math.hypot(...h.axis) - 1) > 1e-6) throw new Error(`hinge ${n}: axis is not a unit vector`)
  }
  return side.hinges
}

/** M1d: a download's bake loader: its bake input glb and detail list in, the checked committed bake out. */
export type DownloadBakeLoader = (id: string, input: Uint8Array, detail: string, atlasPx: number) => Promise<BakeMaps>
export const loadDownloadBake: DownloadBakeLoader = async (id, input, detail, atlasPx) => loadBakeFor(id, sha256(input), sha256(detail), atlasPx)

/** M1d: where a box-skinned download's masked primitives (railing and net lattices) wait while the skin paints the rest. */
export const MASKED_NODE = 'Masked'

/** M1d: moves every primitive whose material is not a `ship:<role>` (a `mask`) into one Masked node, which the
 *  skin skips: it keeps its own texture and UVs, and join merges it back by material as before. */
function isolateMasked(doc: Document): void {
  let masked: Mesh | null = null
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh || node.getName() === SKIRT_NODE) continue
    for (const prim of mesh.listPrimitives()) {
      if (isRoleMaterial(prim.getMaterial())) continue
      if (node.getWorldMatrix().some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-9)) throw new Error(`isolateMasked: node ${node.getName()} is not at the identity`)
      if (!masked) { masked = doc.createMesh(MASKED_NODE); onlyScene(doc).addChild(doc.createNode(MASKED_NODE).setMesh(masked)) }
      mesh.removePrimitive(prim)
      masked.addPrimitive(prim)
    }
  }
}

/** M1d: what a download's bake is baked from: the skinned nodes after box projection (geometry and atlas UVs),
 *  as glb bytes. bake.ts sends exactly these to Ryzen, and the build hashes them to find a stale bake. */
export async function bakeInput(doc: Document, skip: (n: Node) => boolean): Promise<Uint8Array> {
  const copy = cloneDocument(doc)
  for (const n of copy.getRoot().listNodes()) if (n.getMesh() && skip(n)) n.dispose()
  await copy.transform(prune({ keepLeaves: false, keepAttributes: true })) // the UVs are unused by any texture here, and are the point
  return modelIO().writeBinary(copy)
}

/** M1d: a box-skinned download's bake inputs, from a pipeline run that stops at its bake (tools/models/bake.ts). */
export async function downloadBakeInputs(entry: ModelEntry, deps: BuildDeps = nodeBuildDeps()): Promise<{ input: Uint8Array; detail: string; atlasPx: number }> {
  let got: { input: Uint8Array; detail: string; atlasPx: number } | null = null
  const stop = new Error('bake inputs captured')
  try {
    await runPipeline(await deps.read(entry.input!), entry, deps.shipSpec ?? loadShipSpec, null, deps.scan, {}, async (_id, input, detail, atlasPx) => { got = { input, detail, atlasPx }; throw stop })
  } catch (error) { if (error !== stop) throw error }
  if (!got) throw new Error(`${entry.id}: no bake inputs (does its boxSkin declare detail?)`)
  return got
}

/** Every stage, in order, on a document already read. Mutates and returns it. */
export async function runPipeline(doc: Document, entry: ModelEntry, shipSpec: (id: string) => ShipSpec = loadShipSpec, skin: SkinImages | null = null, scans: ScanLoader = loadScan, hinges: Readonly<Record<string, Hinge>> = {}, bakeFor: DownloadBakeLoader | null = null): Promise<Document> {
  if (entry.source.kind === 'generated') throw new Error(`${entry.id}: runPipeline is for Sketchfab and Blender entries; a generated entry goes through finishGenerated`)
  doc.setLogger(new Logger(Logger.Verbosity.WARN))
  // 0. yaw (R3): square a posed download to the axes before anything reads a coordinate
  if (entry.normalize?.yawDeg !== undefined) yawScene(doc, entry.normalize.up, entry.normalize.yawDeg)
  if (entry.normalize?.pitchDeg !== undefined) pitchScene(doc, entry.normalize.forward, entry.normalize.up, entry.normalize.pitchDeg)
  const splitNames = new Set(entry.split.map((s) => s.name))
  // 1. remove (source nodes)
  removeNodes(doc, entry.remove.filter((n) => !splitNames.has(n)))
  // Presence of every kept node, before anything renames it.
  for (const k of entry.keep) findNode(doc, k.node)
  // A hinge whose node is not kept would be joined into the body and turn nothing (C1).
  const unkept = Object.keys(hinges).filter((n) => !entry.keep.some((k) => k.node === n))
  if (unkept.length) throw new Error(`${entry.id}: the script hinges ${unkept.join(', ')}, which the entry does not keep`)
  // 2. split, then drop the split names `remove` lists
  for (const s of entry.split) splitByBox(doc, s)
  removeNodes(doc, entry.remove.filter((n) => splitNames.has(n)))
  // simplify (moved ahead of join: see stages/simplify.ts)
  if (entry.simplify) await simplifyDocument(doc, entry.simplify)
  if (entry.normalize) {
    // collapse + 3. pivot + 4. normalize
    for (const k of entry.keep) {
      const node = collapseKept(doc, k)
      const pivot = k.pivot ?? hinges[k.node]
      if (pivot) pivotNode(doc, node, pivot)
    }
    for (const s of entry.split) {
      if (s.pivot && !entry.remove.includes(s.name)) pivotNode(doc, findNode(doc, s.name), s.pivot)
    }
    normalizeDocument(doc, entry.normalize)
  }
  // Ships (ship-models spec §4-§5): the residual fit and skirt, then the palette roles.
  const ship = entry.ship ? { block: entry.ship, spec: shipSpec(entry.ship.spec) } : null
  const fitted = ship ? shipFitStage(doc, ship.block, ship.spec) : null
  if (ship && fitted) shipMaterials(doc, ship.block, fitted.flightDeckY, entry.skin ? skinMaterialName(entry.id) : null)
  // DP2 (Ruling S3): a box-skinned download is projected after shipMaterials, whose ship:<role>
  // materials are its roles, and baked like a Blender skin; the Skirt keeps ship:boot (Ruling S4).
  let images = skin
  if (entry.boxSkin) {
    if (!ship) throw new Error(`${entry.id}: boxSkin needs a ship block`)
    // M1d: with detail, island charts, the entry's weathering and its committed bake (skin/downloadDetail.ts).
    const detail = entry.boxSkin.detail
    if (detail) isolateMasked(doc)
    const skip = (n: Node): boolean => SHIP_SKIN_OPTIONS.skip!(n) || n.getName() === MASKED_NODE
    let side = boxProject(doc, entry.id, { atlasPx: entry.boxSkin.atlasPx, palette: ship.block.palette, skip, islands: detail !== undefined })
    let bake: BakeMaps | null = null
    if (detail) {
      const tags = new Set(side.patches.map((p) => p.tag))
      side = parseSidecar(JSON.stringify({ ...side, markings: downloadMarkings(detail).filter((m) => m.tags.every((t) => tags.has(t))) }))
      if (!bakeFor) throw new Error(`${entry.id}: its boxSkin declares detail, which needs its committed bake, but no bake loader was given`)
      bake = await bakeFor(entry.id, await bakeInput(doc, skip), JSON.stringify(downloadDetails(detail)), side.atlasPx)
    }
    images = await skinDocument(doc, entry.id, side, scans, { ...SHIP_SKIN_OPTIONS, skip, bake, halfRoughness: detail !== undefined })
  }
  if (entry.dedupMaterials) await dedupMaterials(doc)
  // 5. join everything except the parts, and except every mount a ship's armament names (Track M, M1)
  const mountNames = ship?.spec.armament ? namedMounts(ship.spec.armament).map((m) => m.name) : []
  await joinExcept(doc, new Set([...entry.keep.map((k) => k.as ?? k.node), ...entry.keep.map((k) => k.node), ...splitNames, ...mountNames]))
  // A carved mount keeps one primitive per source material; join those sharing a role material within
  // the mount, so each kit is as few draws as its roles (Fletcher's five gun materials are one fitting).
  if (mountNames.length) await doc.transform(join({ keepMeshes: false, keepNamed: true, filter: (node) => mountNames.includes(node.getName()) }))
  // 6. textures, 7. opaque. A skin's maps go on after compressTextures, which would re-encode them (DP0).
  await compressTextures(doc, entry.textures.maxSize)
  if (images) attachSkinTextures(doc, entry.id, images)
  if (entry.opaque) forceOpaque(doc)
  const placed = ship ? carveMounts(doc, ship.spec, ship.block.palette) : []
  await doc.transform(prune({ keepSolidTextures: true, keepLeaves: false }))
  // After prune, which drops empty leaf nodes: the runtime's markers are exactly that.
  if (ship && fitted) addShipMarkers(doc, ship.block, ship.spec, fitted)
  if (ship) addMountLocators(doc, placed)
  // Provenance travels inside the file (checked by tests/tools/models/outputs.test.ts).
  const asset = doc.getRoot().getAsset()
  asset.extras = { ...(asset.extras ?? {}), ...provenance(entry.source) }
  return doc
}

/** A generated entry's whole pipeline after its generator (O1): prune, then the provenance
 *  every output carries. The generator already wrote geometry, one material and WebP
 *  textures; nothing here re-encodes them, so its bytes are its own. */
export async function finishGenerated(doc: Document, entry: ModelEntry): Promise<Document> {
  if (entry.source.kind !== 'generated') throw new Error(`${entry.id}: finishGenerated needs a generated entry`)
  doc.setLogger(new Logger(Logger.Verbosity.WARN))
  await doc.transform(prune({ keepSolidTextures: true, keepLeaves: false }))
  const asset = doc.getRoot().getAsset()
  asset.extras = { ...(asset.extras ?? {}), source: 'generated', generator: entry.source.generator, dimensions: entry.source.dimensions, license: entry.source.license }
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
  if ((entry.opaque || entry.ship) && m.blendMaterials.length) out.push(`BLEND materials: ${m.blendMaterials.join(', ')}`)
  if (m.maxTextureSize > entry.textures.maxSize) out.push(`a ${m.maxTextureSize}px texture > maxSize ${entry.textures.maxSize}`)
  const names = doc.getRoot().listNodes().map((n) => n.getName())
  for (const p of partNames(entry)) {
    const count = names.filter((n) => n === p).length
    if (count !== 1) out.push(`part "${p}": expected exactly one node, found ${count}`)
  }
  if (entry.ship) {
    const metallic = doc.getRoot().listMaterials().filter((mat) => mat.getMetallicFactor() !== 0).map((mat) => mat.getName())
    if (metallic.length) out.push(`metallicFactor is not 0: ${metallic.join(', ')}`)
    if (names.filter((n) => n === 'SmokeOrigin').length !== 1) out.push('a ship needs exactly one SmokeOrigin node')
  }
  if (entry.noseNode !== undefined && names.includes(entry.noseNode)) {
    // By node, not by name: join may leave two non-part nodes sharing a mesh name (R3's F6F, 2026-09-27).
    const centerX = (node: Node): number => { const bb = getBounds(node); return (bb.min[0] + bb.max[0]) / 2 }
    const nose = centerX(findNode(doc, entry.noseNode))
    const ahead = doc.getRoot().listNodes().filter((n) => n.getMesh() && n.getName() !== entry.noseNode && centerX(n) >= nose)
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
  generate(generator: string): Promise<Document>
  /** Whether a `blender` executable is on PATH (run.ts's blenderPresent). */
  haveBlender(): boolean
  /** Runs one Blender model script into `out` (run.ts's runBlenderScript). Throws on any failure. */
  blender(script: string, out: string): void
  /** The Wildcat's original recipe, raw input to `out` (legacy.ts). */
  legacyOptimize(input: string, out: string): void
  /** A text file (the skin sidecar, DP0). */
  readText(path: string): string
  /** A pinned scan for the skin stage (skin/scans.ts's loadScan). */
  scan: ScanLoader
  /** M1c: the committed bake for a script's raw output, checked against it (skin/bake.ts's loadBake);
   *  absent means no bakes (the toy-model tests). */
  bake?: (id: string, raw: string, detail: string, atlasPx: number) => Promise<BakeMaps | null>
  /** M1d: a download's committed bake (loadDownloadBake); absent means none (the toy-model tests). */
  bakeDownload?: DownloadBakeLoader
  /** The ShipSpec a ship entry fits to; content/ships by default. Toy-ship tests pass one without armament. */
  shipSpec?: (id: string) => ShipSpec
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
    if (entry.source.kind === 'sketchfab' && !deps.exists(entry.input!)) {
      deps.log(`${explicit ? 'missing' : 'skipped'} ${entry.id}: raw input ${entry.input} is not here; re-fetch with tools/models/sketchfab-fetch.sh ${entry.source.uid} <name> and copy it there`)
      if (explicit) failed = true
      continue
    }
    if (entry.source.kind === 'blender' && !deps.haveBlender()) {
      deps.log(`${explicit ? 'missing' : 'skipped'} ${entry.id}: no blender on PATH; build it on a host with Blender ${BLENDER_VERSION} (nexus)`)
      if (explicit) failed = true
      continue
    }
    let doc: Document
    try {
      const source = entry.source
      if (source.kind === 'generated') {
        doc = await finishGenerated(await deps.generate(source.generator), entry)
      } else if (source.kind === 'blender') {
        // Blender runs are serial (spec §4.1): this loop awaits each entry before the next.
        const raw = blenderIntermediate(entry.id)
        deps.blender(source.script, raw)
        const read = await deps.read(raw)
        // runBlenderScript deletes a stale sidecar first, so one here is this run's (DP0).
        const sidecar = skinSidecarPath(raw)
        let skin: SkinImages | null = null
        if (entry.skin) {
          if (!deps.exists(sidecar)) throw new Error(`the entry says skin: true, but ${source.script} wrote no ${sidecar} (kit.Model(name, skin=<px>))`)
          const side = parseSidecar(deps.readText(sidecar))
          const bake = deps.bake ? await deps.bake(entry.id, raw, detailSidecarPath(raw), side.atlasPx) : null
          if (side.baked && !bake) throw new Error(`${entry.id}: its sidecar lists baked patches but no bake was loaded`)
          // DP2 (Rulings S1, S2): a ship paints in its palette and is not metallic.
          skin = entry.ship
            ? await skinDocument(read, entry.id, withShipColors(side, entry.ship), deps.scan, { ...SHIP_SKIN_OPTIONS, bake })
            : await skinDocument(read, entry.id, side, deps.scan, { bake })
        } else if (deps.exists(sidecar)) {
          throw new Error(`${source.script} wrote a skin sidecar, but the entry has no "skin": true`)
        }
        const hingesPath = hingesSidecarPath(raw)
        const hinges = deps.exists(hingesPath) ? parseHinges(deps.readText(hingesPath)) : {}
        doc = await runPipeline(read, entry, deps.shipSpec ?? loadShipSpec, skin, deps.scan, hinges)
      } else if (entry.legacyOptimize) {
        // The original recipe into the cache once (it needs npx), then split only (manifest.ts).
        const mid = `tools/models/cache/${entry.id}.legacy.glb`
        if (!deps.exists(mid)) deps.legacyOptimize(entry.input!, mid)
        doc = await deps.read(mid)
        for (const k of entry.keep) findNode(doc, k.node)
        for (const s of entry.split) splitByBox(doc, s)
        // Slicing replaces accessors; drop only the orphans, since a full prune would also take the empty
        // locator nodes this hierarchy keeps.
        await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR], keepLeaves: true }))
      } else {
        doc = await runPipeline(await deps.read(entry.input!), entry, deps.shipSpec ?? loadShipSpec, null, deps.scan, {}, deps.bakeDownload ?? null)
      }
    } catch (error) {
      // A stage that refuses its input (a ship fit out of tolerance, a missing node) fails
      // this entry by name and writes nothing; the rest still build.
      deps.log(`FAILED ${entry.id}, nothing written: ${error instanceof Error ? error.message : String(error)}`)
      failed = true
      continue
    }
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

/** The real deps: the disk, the glTF writer, the generator registry and Blender. */
export function nodeBuildDeps(): BuildDeps {
  const io = modelIO()
  return {
    exists: existsSync,
    read: async (p) => io.readBinary(new Uint8Array(readFileSync(p))),
    write: (p, bytes) => writeFileSync(p, bytes),
    encode: (doc) => io.writeBinary(doc),
    log: (line) => console.log(line),
    generate: async (g) => { const run = GENERATORS[g]; if (!run) throw new Error(`no generator registered for ${g} in tools/models/generated/registry.ts`); return run() },
    haveBlender: () => blenderPresent(),
    blender: (script, out) => runBlenderScript(script, out),
    readText: (p) => readFileSync(p, 'utf8'),
    legacyOptimize,
    scan: loadScan,
    bake: loadBake,
    bakeDownload: loadDownloadBake,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await runBuild(loadModelEntries(), process.argv.slice(2), nodeBuildDeps()))
}
