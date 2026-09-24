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
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const INPUT = 'tools/models/cache/grumman_f4f_wildcat_airplane.glb'
const OUTPUT = 'content/aircraft/wildcat.glb'

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
}

// Matches tools/terrain/build.ts's own entrypoint guard exactly (fileURLToPath
// against process.argv[1], not a raw file:// string comparison, which mishandles
// paths with spaces/special characters).
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  buildWildcatModel()
}
