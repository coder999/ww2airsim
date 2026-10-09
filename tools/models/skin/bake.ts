// tools/models/skin/bake.ts
/**
 * M1c: a committed bake (plan 2026-10-09-m1c-ship-detail, "Determinism"). A GPU bake is not
 * reproducible across machines, so its two maps are source artifacts, like a download's raw:
 * tools/models/bakes/<id>/{ao,normal}.png plus manifest.json, written by tools/models/bake.ts on
 * Ryzen. The build composes them and never re-bakes. The manifest pins the two inputs a bake was
 * made from, both from the Linux build: the script's raw glb (its geometry and atlas UVs) and its
 * detail sidecar (the high-poly's detail list). Either changing means the maps no longer fit, and
 * the build refuses by name.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import sharp from 'sharp'
import { z } from 'zod'

export const bakeDir = (id: string): string => `tools/models/bakes/${id}`
export const rebakeHint = (id: string): string => `re-bake on Ryzen: npm run models:bake -- ${id}`

export const BakeManifestSchema = z.object({
  version: z.literal(1),
  model: z.string().min(1),
  rawSha256: z.string().regex(/^[0-9a-f]{64}$/),
  detailSha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().positive(),
  /** bake.py's own report (device, samples, seconds); recorded, never read by the build. */
  info: z.record(z.string(), z.unknown()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()
export type BakeManifest = z.infer<typeof BakeManifestSchema>

/** Linear AO (1 open, 0 occluded) and a tangent-space normal, RGB bytes, `size` square, top row first. */
export interface BakeMaps { readonly size: number; readonly ao: Uint8Array; readonly normal: Uint8Array }

export const sha256 = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex')

/** Throws, naming the model and the fix, unless the manifest was baked from exactly these inputs. */
export function checkBake(m: BakeManifest, id: string, rawSha: string, detailSha: string, atlasPx: number): void {
  if (m.model !== id) throw new Error(`bake for ${id}: its manifest is for ${m.model}`)
  const stale = [m.rawSha256 !== rawSha && 'the raw glb (geometry or UVs)', m.detailSha256 !== detailSha && 'the detail list'].filter(Boolean)
  if (stale.length) throw new Error(`stale bake for ${id}: ${stale.join(' and ')} changed since it was baked; ${rebakeHint(id)}`)
  if (m.size !== atlasPx) throw new Error(`bake for ${id} is ${m.size} px but its atlas is ${atlasPx} px; ${rebakeHint(id)}`)
}

async function rgb(path: string, size: number): Promise<Uint8Array> {
  const { data, info } = await sharp(path).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
  if (info.width !== size || info.height !== size || info.channels !== 3) throw new Error(`${path}: ${info.width}x${info.height}x${info.channels}, expected ${size}x${size}x3`)
  return new Uint8Array(data)
}

/** The committed bake for a skinned script's raw output, checked against it; null when the script declares no detail. */
export async function loadBake(id: string, raw: string, detail: string, atlasPx: number): Promise<BakeMaps | null> {
  if (!existsSync(detail)) return null
  const dir = bakeDir(id)
  if (!existsSync(`${dir}/manifest.json`)) throw new Error(`${id} declares bake detail but has no bake in ${dir}; ${rebakeHint(id)}`)
  const m = BakeManifestSchema.parse(JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')))
  checkBake(m, id, sha256(readFileSync(raw)), sha256(readFileSync(detail)), atlasPx)
  return { size: m.size, ao: await rgb(`${dir}/ao.png`, m.size), normal: await rgb(`${dir}/normal.png`, m.size) }
}
