// tools/models/legacy.ts
/**
 * The Wildcat's original recipe (2026-09-24, before the manifest pipeline), kept so its committed glb can
 * be rebuilt from the raw download rather than frozen (C1 batch 2, Mark's ruling 2026-10-08). The recipe
 * was `@gltf-transform/cli optimize` (WebP textures at 1024 px, no simplification, no geometry
 * compression) and then every material forced opaque (the download's BLEND materials drew the hull and
 * canopy see-through: commit d2a629de). Run at CLI 4.5.0 on 2026-10-08 it reproduced the committed file
 * byte for byte, binary chunk and all, except `asset.generator` (the CLI now resolves core 4.5.1).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

export const LEGACY_CLI = '@gltf-transform/cli@4.5.0'

/** Rewrites a .glb's JSON chunk with every material's alphaMode and alphaCutoff removed (glTF's default
 *  is OPAQUE); the binary chunk is carried over unchanged. */
export function forceOpaqueMaterials(glbPath: string): void {
  const buf = readFileSync(glbPath)
  const jsonLength = buf.readUInt32LE(12)
  const jsonChunkType = buf.readUInt32LE(16)
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as { materials?: Record<string, unknown>[] }
  for (const material of doc.materials ?? []) {
    delete material['alphaMode']
    delete material['alphaCutoff']
  }
  const json = Buffer.from(JSON.stringify(doc), 'utf8')
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
  const binStart = 20 + jsonLength
  const bin = buf.subarray(binStart, binStart + 8 + buf.readUInt32LE(binStart))
  const header = Buffer.alloc(12)
  header.writeUInt32LE(buf.readUInt32LE(0), 0)
  header.writeUInt32LE(buf.readUInt32LE(4), 4)
  header.writeUInt32LE(12 + 8 + paddedJson.length + bin.length, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(paddedJson.length, 0)
  jsonHeader.writeUInt32LE(jsonChunkType, 4)
  writeFileSync(glbPath, Buffer.concat([header, jsonHeader, paddedJson, bin]))
}

/** The whole recipe, `input` to `output`. Needs the network once, for npx to fetch the pinned CLI. */
export function legacyOptimize(input: string, output: string): void {
  execFileSync('npx', ['--yes', LEGACY_CLI, 'optimize', input, output, '--texture-compress', 'webp', '--texture-size', '1024', '--no-simplify', '--compress', 'false'], { stdio: 'inherit' })
  forceOpaqueMaterials(output)
}
