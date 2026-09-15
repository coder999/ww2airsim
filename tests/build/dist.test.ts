import { describe, it, expect } from 'vitest'
import { build } from 'vite'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AIRCRAFT_CONTENT_PATH } from '../../src/render/content.js'
import { AircraftSpecSchema } from '../../src/sim/flight/schema.js'
import { SPAWN_PARAMS } from '../../src/render/spawn.js'

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

  /**
   * Every `import.meta.env.DEV` gate in `src/render/` at once, asserted rather
   * than believed.
   *
   * The mechanism is sound -- Vite replaces `import.meta.env.DEV` with the
   * literal `false` and esbuild drops the dead branch -- and this repository
   * has still shipped DEV-only code to production while believing otherwise:
   * `main.ts` records the dev overlay's "dropped N <-- replay invalid" string
   * being confirmed present in a release bundle on 2026-09-13, at a moment
   * when `__ww2` was correctly absent from the same file. One gate held and
   * one did not, and nothing but a person looking could tell them apart.
   *
   * Task 11 added a second thing worth keeping out of a release -- a query
   * parameter that MOVES THE AEROPLANE (`src/render/spawn.ts`) -- and checked
   * it the same way that overlay was checked, by grepping `dist/` once by
   * hand. That is the check that already failed here. This is the assertion
   * that replaces it (review fix round 1, I5).
   *
   * Deliberately in this file rather than as a post-step on `npm run build`,
   * which is what the review suggested: this file already runs a real
   * `vite build`, so the artifact under test is produced the same way, and
   * living here means `npm run verify` runs it -- the gate that actually
   * precedes every commit, which `npm run build` does not.
   *
   * **`NODE_ENV` has to be forced, and that is not a workaround.** Vite
   * derives `isProduction` -- and therefore the literal it substitutes for
   * `import.meta.env.DEV` -- from `process.env.NODE_ENV`, which the `vite
   * build` CLI sets to `production` and which Vitest sets to `test`. Calling
   * `build()` from inside a test therefore produces a DEVELOPMENT bundle by
   * default, `__ww2` and all. Found the moment this test was first run
   * (2026-09-14): it failed, and the failure was the test's, not the app's --
   * the real `npm run build` artifact was grepped in the same minute and
   * contained neither string. Without this line the test would have been a
   * permanent false alarm; with an `expect(...).toBe(true)` written to match
   * the wrong observation, it would have been worse than useless.
   *
   * Worth knowing for the test above, which predates this one: it has always
   * built in development mode for the same reason. That does not affect what
   * it asserts -- copying `content/` into `dist/` is mode-independent -- but
   * it is not, and never was, an assertion about a production bundle.
   */
  it('leaks no DEV-only code into the production bundle', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ww2airsim-dist-dev-'))
    const priorNodeEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'
      await build({ logLevel: 'silent', mode: 'production', build: { outDir, emptyOutDir: true } })
      const assets = join(outDir, 'assets')
      const js = readdirSync(assets).filter((f) => f.endsWith('.js'))
      // A build that emitted no JS at all would make every assertion below
      // vacuously true, which is the failure mode this whole file exists to
      // refuse.
      expect(js.length, 'the build emitted no JavaScript to search').toBeGreaterThan(0)
      const bundle = js.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')

      // The diagnostics hook. Its absence was verified by hand on 2026-09-13
      // and is now verified every run.
      expect(bundle.includes('__ww2'), '`__ww2` reached the production bundle').toBe(false)
      // The spawn override, by the parameter names the app actually parses
      // rather than by three literals -- renaming one in `spawn.ts` must not
      // quietly narrow what this test looks for.
      for (const name of SPAWN_PARAMS) {
        expect(bundle.includes(name), `\`${name}\` reached the production bundle`).toBe(false)
      }
    } finally {
      process.env.NODE_ENV = priorNodeEnv
      rmSync(outDir, { recursive: true, force: true })
    }
  }, 60_000)
})
