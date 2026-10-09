// tools/models/skin/stage.ts
import type { Document, Material, Node } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { rasterize, trianglesOf } from './raster.js'
import { paint } from './layers.js'
import { compose, type SkinMaps } from './compose.js'
import { loadScan, type Scan } from './scans.js'
import { surfaceFor, type ScanId } from './surfaces.js'
import type { Sidecar } from './sidecar.js'
import type { BakeMaps } from './bake.js'
import { SKIRT_NODE } from '../stages/shipFit.js'

/** One quality for all three maps, like O1's; a change moves every skinned glb's bytes. */
export const SKIN_WEBP_QUALITY = 90
export interface SkinImages { readonly baseColor: Uint8Array; readonly metallicRoughness: Uint8Array; readonly normal: Uint8Array }
export type ScanLoader = (id: ScanId) => Promise<Scan>

/** DP2: how a skin is applied. metallicFactor 1 (DP0's pilots) or 0 (a ship, Ruling S1); `skip`
 *  names nodes that keep their own material and take no UVs (a ship's Skirt, Ruling S4). */
export interface SkinOptions { readonly metallicFactor?: number; readonly skip?: (node: Node) => boolean; /** M1c: a committed bake (skin/bake.ts). */ readonly bake?: BakeMaps | null }
export const SHIP_SKIN_OPTIONS: SkinOptions = { metallicFactor: 0, skip: (n) => n.getName() === SKIRT_NODE }

export const skinMaterialName = (id: string): string => `${id}-skin`

/** The three maps of a kit export and its sidecar, at the sidecar's atlas size. Scans load in
 *  sorted order, once each. */
export async function renderSkinMaps(doc: Document, side: Sidecar, scans: ScanLoader = loadScan, skip: (node: Node) => boolean = () => false, bake: BakeMaps | null = null): Promise<SkinMaps> {
  const t = trianglesOf(doc, side, side.atlasPx, skip)
  const ids = [...new Set(t.roles.map((r) => surfaceFor(r).scan).filter((s): s is ScanId => s !== null))].sort()
  const loaded = new Map<ScanId, Scan>()
  for (const id of ids) loaded.set(id, await scans(id))
  return compose(paint(rasterize(t, 2 * side.atlasPx), t.roles, side, loaded, side.atlasPx), side, side.atlasPx, bake)
}

export async function encodeSkinMaps(m: SkinMaps): Promise<SkinImages> {
  const webp = async (rgb: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await sharp(rgb, { raw: { width: m.size, height: m.size, channels: 3 } }).webp({ quality: SKIN_WEBP_QUALITY }).toBuffer())
  return { baseColor: await webp(m.baseColor), metallicRoughness: await webp(m.metallicRoughness), normal: await webp(m.normal) }
}

/**
 * Stage 0 of a skinned Blender entry, on the kit's raw export (DP0): bakes and encodes the atlas,
 * then gives every primitive one skin material in place of its role materials, so join (stage 6)
 * merges the whole airframe into one draw plus its parts. The textures are attached after
 * compressTextures (attachSkinTextures), which would otherwise re-encode them.
 */
export async function skinDocument(doc: Document, id: string, side: Sidecar, scans: ScanLoader = loadScan, opts: SkinOptions = {}): Promise<SkinImages> {
  const skip = opts.skip ?? (() => false)
  const images = await encodeSkinMaps(await renderSkinMaps(doc, side, scans, skip, opts.bake ?? null))
  const old = doc.getRoot().listMaterials()
  const kept = new Set<Material>()
  for (const node of doc.getRoot().listNodes()) if (node.getMesh() && skip(node)) for (const p of node.getMesh()!.listPrimitives()) { const m = p.getMaterial(); if (m) kept.add(m) }
  const skin = doc.createMaterial(skinMaterialName(id)).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(opts.metallicFactor ?? 1).setRoughnessFactor(1)
  for (const mesh of doc.getRoot().listMeshes()) {
    if (mesh.listParents().some((n) => n.propertyType === 'Node' && skip(n as Node))) continue
    for (const p of mesh.listPrimitives()) {
      if (p.getAttribute('TEXCOORD_1')) throw new Error(`${id}: a skinned model has one UV set (spec §4 ruling), found TEXCOORD_1 on ${mesh.getName()}`)
      p.setMaterial(skin)
    }
  }
  for (const m of old) if (!kept.has(m)) m.dispose()
  return images
}

export function attachSkinTextures(doc: Document, id: string, images: SkinImages): void {
  const skin = doc.getRoot().listMaterials().find((m) => m.getName() === skinMaterialName(id))
  if (!skin) throw new Error(`${id}: no ${skinMaterialName(id)} material to attach the skin to`)
  doc.createExtension(EXTTextureWebP).setRequired(true)
  const tex = (label: string, bytes: Uint8Array) => doc.createTexture(`${id}-skin-${label}`).setMimeType('image/webp').setImage(bytes)
  skin.setBaseColorTexture(tex('baseColor', images.baseColor))
    .setMetallicRoughnessTexture(tex('metallicRoughness', images.metallicRoughness))
    .setNormalTexture(tex('normal', images.normal))
}
