// tools/models/stages/shipFit.ts
import type { Accessor, Document } from '@gltf-transform/core'
import { transformMesh } from '@gltf-transform/functions'
import type { ShipSpec } from '../../../src/sim/world/ships.js'
import type { ShipEntry } from '../manifest.js'
import { meshNodes, onlyScene, ownMesh } from '../document.js'
import {
  applyFit, deckFit, fitProblems, hullFit, residualProblems, skirtOutline, skirtWall, SKIRT_BOTTOM_M,
  surfaceBelow, bounds, type ShipFit, type TriangleSoup,
} from '../../../src/render/scene/shipFit.js'
import { roleMaterial } from './shipMaterials.js'

/** How far above the surface under it a smoke origin may sit, meters (spec §4.6). */
export const SMOKE_REACH_M = 5

/** Every triangle in the document, in the scene frame (node translations applied: after `bakeTranslations`, none remain). */
export function documentSoup(doc: Document): TriangleSoup {
  const pos: number[] = [], idx: number[] = []
  for (const node of meshNodes(doc)) {
    const w = node.getWorldMatrix()
    for (const prim of node.getMesh()!.listPrimitives()) {
      if (prim.getMode() !== 4) continue
      const a = prim.getAttribute('POSITION')!.getArray()!
      const base = pos.length / 3
      for (let i = 0; i < a.length / 3; i++) {
        const x = a[3 * i]!, y = a[3 * i + 1]!, z = a[3 * i + 2]!
        pos.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14])
      }
      const ind = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: a.length / 3 }, (_, i) => i)
      for (const i of ind) idx.push(i + base)
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

/** After `normalize` every mesh node carries a translation only; bake it, so vertices are in the ship frame. */
function bakeTranslations(doc: Document): void {
  for (const node of meshNodes(doc)) {
    const [tx, ty, tz] = node.getTranslation()
    if (tx === 0 && ty === 0 && tz === 0) continue
    transformMesh(ownMesh(doc, node)!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1])
    node.setTranslation([0, 0, 0])
  }
}

/** Applies `fit` once per accessor: every NORMAL against its primitive's ORIGINAL positions first, then every POSITION. */
function applyToDocument(doc: Document, fit: ShipFit): void {
  const originals = new Map<Accessor, Float32Array>()
  const pairs: [Accessor, Accessor | null][] = []
  for (const node of meshNodes(doc)) {
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!
      if (!originals.has(pos)) originals.set(pos, new Float32Array(pos.getArray()!))
      pairs.push([pos, prim.getAttribute('NORMAL')])
    }
  }
  const doneNormals = new Set<Accessor>()
  for (const [pos, nor] of pairs) {
    if (!nor || doneNormals.has(nor)) continue
    doneNormals.add(nor)
    const scratch = new Float32Array(originals.get(pos)!)
    const normals = new Float32Array(nor.getArray()!)
    applyFit(scratch, normals, fit)
    nor.setArray(normals)
  }
  for (const [pos, original] of originals) {
    const out = new Float32Array(original)
    applyFit(out, null, fit)
    pos.setArray(out)
  }
}

export interface ShipFitResult {
  readonly fit: ShipFit
  /** The fitted flight-deck height for shipMaterials' classification, or null for a non-carrier. */
  readonly flightDeckY: number | null
  /** Carriers with a trap zone: the band half-width the model leaves clear (TrapBand's extras). */
  readonly trapLaneHalfWidthM: number | null
}

/**
 * Stage (ship-models spec §4): the residual fit after `normalize`, the skirt
 * for waterline-cut models, then every §4.4 tolerance on the result. Throws,
 * listing every problem, if any fails; nothing is written. Records the fit in
 * `asset.extras.shipFit`, which Tier 1 re-checks.
 */
export function shipFitStage(doc: Document, ship: ShipEntry, spec: ShipSpec): ShipFitResult {
  if (spec.id !== ship.spec) throw new Error(`ship block names spec "${ship.spec}", got "${spec.id}"`)
  bakeTranslations(doc)
  const fit = ship.fit === 'deck' ? deckFit(documentSoup(doc), spec) : hullFit(documentSoup(doc), spec)
  const residual = residualProblems(fit, ship)
  if (residual.length) throw new Error(`ship ${spec.id}: ${residual.join('; ')}`)
  applyToDocument(doc, fit)
  if (ship.kind === 'waterline') {
    const wall = skirtWall(skirtOutline(documentSoup(doc)), 0, SKIRT_BOTTOM_M)
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(wall.positions))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(wall.normals))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(wall.indices))
      .setMaterial(roleMaterial(doc, ship.palette, 'boot'))
    onlyScene(doc).addChild(doc.createNode('Skirt').setMesh(doc.createMesh('Skirt').addPrimitive(prim)))
  }
  const soup = documentSoup(doc)
  const { problems, measures } = fitProblems(soup, spec, ship)
  const [sx, sy, sz] = ship.smokeOrigin
  const b = bounds(soup)
  // Inside the fitted bounds in plan, and at most SMOKE_REACH_M over the top: a funnel's mouth is its top.
  if (sx < b.min[0] || sx > b.max[0] || sz < b.min[2] || sz > b.max[2] || sy < b.min[1] || sy > b.max[1] + SMOKE_REACH_M) problems.push(`smokeOrigin [${ship.smokeOrigin}] lies outside the fitted bounds`)
  const under = surfaceBelow(soup, sx, sz, sy)
  if (under === null || sy - under > SMOKE_REACH_M) problems.push(`smokeOrigin [${ship.smokeOrigin}]: no surface within ${SMOKE_REACH_M} m below it (found ${under?.toFixed(2) ?? 'none'})`)
  if (problems.length) throw new Error(`ship ${spec.id}: ${problems.join('; ')}`)
  const asset = doc.getRoot().getAsset()
  asset.extras = { ...(asset.extras ?? {}), shipFit: { spec: spec.id, ...fit } }
  return { fit, flightDeckY: ship.fit === 'deck' ? spec.flightDeck!.heightM : null, trapLaneHalfWidthM: measures.trapLaneHalfWidthM ?? null }
}

/**
 * After `prune` (which drops empty leaf nodes): the runtime's markers, as
 * empty nodes at the scene root. `SmokeOrigin` at the entry's point; on a
 * carrier with a trap zone, `TrapBand` at the band's center on the deck with
 * `extras.halfWidthM`, which GLTFLoader surfaces as `userData.halfWidthM`.
 */
export function addShipMarkers(doc: Document, ship: ShipEntry, spec: ShipSpec, result: ShipFitResult): void {
  const scene = onlyScene(doc)
  scene.addChild(doc.createNode('SmokeOrigin').setTranslation([...ship.smokeOrigin]))
  if (spec.flightDeck && spec.trapZone && result.trapLaneHalfWidthM !== null) {
    const x = -spec.flightDeck.lengthM / 2 + (spec.trapZone.fromSternM + spec.trapZone.toSternM) / 2
    scene.addChild(doc.createNode('TrapBand').setTranslation([x, spec.flightDeck.heightM, 0]).setExtras({ halfWidthM: result.trapLaneHalfWidthM }))
  }
}
