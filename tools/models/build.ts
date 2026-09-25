/**
 * Compresses a raw, third-party glTF download (cached under tools/models/cache/,
 * gitignored, never committed) into the small, committed asset the browser
 * actually fetches. Mirrors tools/terrain/build.ts's raw-cache-to-committed-
 * output split: the input here is 73.9 MB, 99.8% of it uncompressed embedded
 * PNG/JPEG textures (measured 2026-09-24 -- 27 images, several 14-17 MB each),
 * and committing that raw would make this repo's single largest tracked file
 * by a wide margin for no reason texture recompression doesn't already fix.
 *
 * Texture-only pass deliberately: `--no-simplify` and `--compress false`
 * disable meshoptimizer simplification AND `optimize`'s own default geometry/
 * animation compression (its `--compress` flag defaults to `"meshopt"` when
 * omitted -- easy to miss, since simplify and compress are separate concerns
 * with separate flags, and this file's own instructions previously named only
 * the first one). Three.js's `GLTFLoader` throws at runtime if a required
 * extension like `EXT_meshopt_compression` has no matching decoder wired up,
 * and this project has none, so `--compress false` is load-bearing, not
 * cosmetic. With both disabled, the exact node names and animation keyframes
 * this project's render code depends on (src/render/scene/wildcat.ts) are as
 * close to the source download as possible. Re-run the node/animation
 * inspection below after any future change to this script's flags.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const INPUT = 'tools/models/cache/grumman_f4f_wildcat_airplane.glb'
const OUTPUT = 'content/aircraft/wildcat.glb'

/**
 * The raw Sketchfab download sets `alphaMode: BLEND` on Chasis_MAT (the
 * wheel-well/hull cover) and Cabina_MAT (the canopy) -- confirmed by reading
 * the untouched download directly, so `optimize` above does not introduce
 * this, only carries it through. Neither material's base-color texture has
 * any fully- or mostly-transparent pixels (alpha only dips to ~55% over a
 * small fraction of each texture): the signature of a baked AO/dirt mask
 * left in the alpha channel by the artist's tool, not intended glass or
 * cutout geometry. Three.js's GLTFLoader turns BLEND into `transparent:
 * true, depthWrite: false` regardless of the actual opacity values, which
 * produces a camera-angle/background-dependent see-through artifact on the
 * hull -- reported by Mark 2026-09-24 flying against open sky. This project
 * has no aircraft with intentionally transparent geometry today (hellcat.ts's
 * canopy is the same opaque `dark` material as the rest of that airframe),
 * so every material is forced OPAQUE rather than only the two known-bad
 * ones, catching the same defect in a future re-export under different
 * material names.
 *
 * Implemented as a direct .glb binary patch rather than pulling in
 * `@gltf-transform/core` as a scripting dependency for one field: this
 * project already reads this exact chunk layout at runtime (`wildcat.ts`'s
 * own tests) and it is simpler than round-tripping a webp-textured document
 * through a library that expects to decode image data it never needs to
 * touch here. glTF binary layout is header(12) + JSON chunk(8-byte header +
 * padded data) + BIN chunk(8-byte header + padded data), per the glTF 2.0
 * spec.
 */
export function forceOpaqueMaterials(glbPath: string): void {
  const buf = readFileSync(glbPath)
  const jsonLength = buf.readUInt32LE(12)
  const jsonChunkType = buf.readUInt32LE(16)
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
  for (const material of doc.materials ?? []) {
    delete material.alphaMode
    delete material.alphaCutoff
  }
  const newJsonBytes = Buffer.from(JSON.stringify(doc), 'utf8')
  const pad = (4 - (newJsonBytes.length % 4)) % 4
  const paddedJson = Buffer.concat([newJsonBytes, Buffer.alloc(pad, 0x20)])

  const binChunkStart = 20 + jsonLength
  const binChunkLength = buf.readUInt32LE(binChunkStart)
  // Sliced including its own 8-byte chunk header, so it round-trips
  // unchanged -- no need to read chunkType out separately.
  const binChunk = buf.subarray(binChunkStart, binChunkStart + 8 + binChunkLength)

  const header = Buffer.alloc(12)
  header.writeUInt32LE(buf.readUInt32LE(0), 0) // magic
  header.writeUInt32LE(buf.readUInt32LE(4), 4) // version
  header.writeUInt32LE(12 + 8 + paddedJson.length + binChunk.length, 8) // total length

  const jsonChunkHeader = Buffer.alloc(8)
  jsonChunkHeader.writeUInt32LE(paddedJson.length, 0)
  jsonChunkHeader.writeUInt32LE(jsonChunkType, 4)

  writeFileSync(glbPath, Buffer.concat([header, jsonChunkHeader, paddedJson, binChunk]))
}

export function buildWildcatModel(): void {
  if (!existsSync(INPUT)) {
    throw new Error(
      `${INPUT} is missing. It is a gitignored raw download (CC-BY 4.0, ` +
      'rojatsu, see ASSETS.md) and must be fetched by hand from Sketchfab ' +
      '(login required) before this script can run -- there is no automated ' +
      're-fetch path, unlike tools/terrain/fetch.ts.',
    )
  }
  mkdirSync(dirname(OUTPUT), { recursive: true })
  execFileSync(
    'npx',
    ['--yes', '@gltf-transform/cli', 'optimize', INPUT, OUTPUT,
      '--texture-compress', 'webp',
      '--texture-size', '1024',
      '--no-simplify',
      '--compress', 'false'],
    { stdio: 'inherit' },
  )
  forceOpaqueMaterials(OUTPUT)
}

// Matches tools/terrain/build.ts's own entrypoint guard exactly (fileURLToPath
// against process.argv[1], not a raw file:// string comparison, which mishandles
// paths with spaces/special characters).
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  buildWildcatModel()
}
