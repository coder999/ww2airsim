// tools/models/stages/shipMaterials.ts
import type { Document, Material, Primitive } from '@gltf-transform/core'
import type { ShipEntry } from '../manifest.js'
import { SHIP_ROUGHNESS, linearFactor, SHIP_PALETTES, type ShipRole } from '../../../src/render/scene/shipPalette.js'
import { UP_NY, PLANE_TOL_M } from '../../../src/render/scene/shipFit.js'
import { meshNodes } from '../document.js'
import { carve, ensureIndices } from './geometry.js'

const ROLE_PREFIX = 'ship:'

/** The one material for `role` in this document, created on first use. Named `ship:<role>`, so Tier 1 can find a role by name. */
export function roleMaterial(doc: Document, palette: ShipEntry['palette'], role: ShipRole): Material {
  const name = `${ROLE_PREFIX}${role}`
  const existing = doc.getRoot().listMaterials().find((m) => m.getName() === name)
  if (existing) return existing
  return doc.createMaterial(name).setBaseColorFactor(linearFactor(SHIP_PALETTES[palette][role]))
    .setMetallicFactor(0).setRoughnessFactor(SHIP_ROUGHNESS).setAlphaMode('OPAQUE')
}

export const isRoleMaterial = (m: Material | null): boolean => m !== null && m.getName().startsWith(ROLE_PREFIX)

/** An untextured role draws nothing from UVs or tangents; dropping them lets `join` merge every primitive of a role into one draw. */
function stripSurfaceAttributes(prim: Primitive): void {
  for (const s of prim.listSemantics()) if (s.startsWith('TEXCOORD_') || s === 'TANGENT' || s.startsWith('COLOR_')) prim.setAttribute(s, null)
}

const TRIANGLES = 4

/**
 * Splits `prim` by geometry (spec §5.1, "single untextured materials"):
 * up-facing triangles are `deck`, or `flightDeck` within PLANE_TOL_M of a
 * carrier's fitted deck plane; the rest are `superstructure` when their
 * centroid is over a carrier's deck, else `hull`. Returns the new primitives.
 */
function classify(doc: Document, prim: Primitive, flightDeckY: number | null): Map<ShipRole, Primitive> {
  const indices = ensureIndices(doc, prim)
  const p = prim.getAttribute('POSITION')!.getArray()!
  const buckets = new Map<ShipRole, number[]>()
  for (let t = 0; t < indices.length / 3; t++) {
    const a = indices[3 * t]!, b = indices[3 * t + 1]!, c = indices[3 * t + 2]!
    const ux = p[3 * b]! - p[3 * a]!, uy = p[3 * b + 1]! - p[3 * a + 1]!, uz = p[3 * b + 2]! - p[3 * a + 2]!
    const vx = p[3 * c]! - p[3 * a]!, vy = p[3 * c + 1]! - p[3 * a + 1]!, vz = p[3 * c + 2]! - p[3 * a + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const up = ny / (Math.hypot(nx, ny, nz) || 1) > UP_NY
    const cy = (p[3 * a + 1]! + p[3 * b + 1]! + p[3 * c + 1]!) / 3
    const role: ShipRole = up
      ? (flightDeckY !== null && Math.abs(cy - flightDeckY) <= PLANE_TOL_M ? 'flightDeck' : 'deck')
      : (flightDeckY !== null && cy > flightDeckY + PLANE_TOL_M ? 'superstructure' : 'hull')
    const list = buckets.get(role) ?? []
    list.push(a, b, c)
    buckets.set(role, list)
  }
  const out = new Map<ShipRole, Primitive>()
  for (const [role, list] of buckets) out.set(role, carve(doc, prim, Uint32Array.from(list)))
  return out
}

/**
 * Stage: every source material becomes a palette role, a kept texture, or a
 * masked lattice (spec §5), per the entry's `ship.materials` and
 * `ship.otherMaterials`. Afterward no material is BLEND and every
 * metallicFactor is 0. Runs after shipFit (classification reads the fitted
 * deck height) and before join.
 */
export function shipMaterials(doc: Document, ship: ShipEntry, flightDeckY: number | null): void {
  for (const node of meshNodes(doc)) {
    const mesh = node.getMesh()!
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue
      const src = prim.getMaterial()
      if (isRoleMaterial(src)) continue
      const rule = ship.materials[src?.getName() ?? ''] ?? ship.otherMaterials
      if (rule === 'keep' || rule === 'mask') {
        if (!src) throw new Error(`ship ${ship.spec}: an untextured primitive has no material to ${rule}`)
        src.setMetallicFactor(0)
        if (rule === 'mask') src.setAlphaMode('MASK').setAlphaCutoff(0.5).setRoughnessFactor(SHIP_ROUGHNESS)
        else {
          src.setAlphaMode('OPAQUE')
          // Tangents: three.js derives them for a normal map that lacks them; they cost the Liberty 1.04 MB (measured 2026-09-25).
          prim.setAttribute('TANGENT', null)
        }
        continue
      }
      if (rule === 'classify') {
        for (const [role, part] of classify(doc, prim, flightDeckY)) {
          stripSurfaceAttributes(part)
          mesh.addPrimitive(part.setMaterial(roleMaterial(doc, ship.palette, role)))
        }
        mesh.removePrimitive(prim)
        prim.dispose()
        continue
      }
      stripSurfaceAttributes(prim)
      prim.setMaterial(roleMaterial(doc, ship.palette, rule))
    }
  }
  // Every KHR_materials_* extension goes, with its textures: KHR_materials_specular makes
  // three.js build a MeshPhysicalMaterial, and its texture is the Liberty's largest
  // (689,750 B as WebP, measured 2026-09-25). Ships are MeshStandardMaterial, like the boxes.
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName.startsWith('KHR_materials_')) ext.dispose()
  for (const m of doc.getRoot().listMaterials()) {
    if (m.getAlphaMode() === 'BLEND') throw new Error(`ship ${ship.spec}: material "${m.getName()}" is still BLEND`)
    m.setMetallicFactor(0)
  }
}
