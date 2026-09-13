import { describe, it, expect } from 'vitest'
import { build } from 'vite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AIRCRAFT_CONTENT_PATH } from '../../src/render/content.js'
import { AircraftSpecSchema } from '../../src/sim/flight/schema.js'

/**
 * Ruling R14, placed by Ruling R20.
 *
 * "npm run build exits 0" and "the built artifact can boot" are different
 * claims, and treating the first as the second is this repository's own named
 * defect -- a success-looking no-op. The build did exit 0 while producing a
 * dist/ containing only assets/ and index.html, so the artifact fetched
 * /content/aircraft/f6f-hellcat.json, got a 404, and landed on the
 * bad-content failure screen. Nothing in the suite could tell.
 *
 * This builds for real rather than inspecting the config, because a config
 * that LOOKS like it copies content is the same class of claim as a comment
 * that says it does.
 */
describe('the built artifact', () => {
  it('ships the content it fetches at runtime', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ww2airsim-dist-'))
    try {
      await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } })
      const shipped = readFileSync(join(outDir, AIRCRAFT_CONTENT_PATH), 'utf8')
      // Present is not enough: a truncated or wrong-shaped copy would 200 and
      // then fail parsing in the browser, which is the same failure screen by
      // a slower route.
      expect(() => AircraftSpecSchema.parse(JSON.parse(shipped))).not.toThrow()
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  }, 60_000)
})
