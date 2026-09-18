import { describe, it, expect } from 'vitest'
import { build } from 'vite'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { AIRCRAFT_CONTENT_PATH, FINEST_FETCHED_LEVEL, terrainLevelPath } from '../../src/render/content.js'
import { AircraftSpecSchema } from '../../src/sim/flight/schema.js'
import { BEAUFORT_PARAM } from '../../src/render/ocean/weather.js'
import { SPAWN_PARAMS } from '../../src/render/spawn.js'
import { coarsestFetchedLevel } from '../../src/render/terrain/lod.js'
import { TERRAIN_HEADER } from '../../src/render/terrain/load.js'
import { samplesAtLevel } from '../../src/sim/world/schema.js'

/**
 * The two Copernicus licence strings that must accompany the derived terrain
 * wherever it goes (Articles 6(b) and 6(c); `ASSETS.md` is authoritative for
 * why, and `content/terrain/NOTICE.md` is the copy that ships).
 *
 * Pinned here as literals on purpose, the same way
 * `tests/tools/terrainBuild.test.ts` pins the content hashes: a licence string
 * is not ours to paraphrase, so a test that read it back out of the file it is
 * checking would assert nothing. Line breaks are normalised away below because
 * NOTICE.md wraps them as a Markdown blockquote.
 */
const COPERNICUS_LICENCE_STRINGS = {
  // 6(a) -- the data as distributed. Pinned even though these files are
  // adapted and therefore governed by 6(b): `ASSETS.md`'s "Discharged
  // 2026-09-14" claims all THREE strings are in NOTICE.md, and a claim with
  // only two of them asserted is a claim that can go false in silence
  // (review 2026-09-14, finding 5).
  //
  // **6(a) is a literal suffix of 6(b)**, so a whole-document `toContain` for
  // it passes whenever 6(b) is present and asserts nothing. Found by running
  // the mutation rather than by reading the strings: deleting the entire 6(a)
  // block from NOTICE.md left this test green. That is why the assertion
  // below is per-SECTION -- each string has to appear under a heading that
  // names its own article, which is also what "the notice accompanies the
  // data" actually means.
  '6(a) attribution, data as distributed':
    '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 ' +
    'provided under COPERNICUS by the European Union and ESA; all rights reserved.',
  '6(b) attribution, data as adapted':
    'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus ' +
    'Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European ' +
    'Union and ESA; all rights reserved.',
  '6(c) no-liability notice':
    'The organisations in charge of the Copernicus programme by law or by ' +
    'delegation do not incur any liability for any use of the Copernicus WorldDEM-30.',
} as const
const TERRAIN_NOTICE_PATH = 'content/terrain/NOTICE.md'

/**
 * The gitignored half of the pyramid: L0-L3, 178,319,368 bytes, which
 * `tools/terrain/build.ts` writes and no browser code path fetches
 * (`src/render/content.ts`'s FINEST_FETCHED_LEVEL). `vite.config.ts`'s content
 * copy filters this directory out; without the filter, every build on a
 * machine that has run `npm run terrain:build` ships it, and this file runs
 * two builds.
 *
 * Resolved from this file's own URL rather than from `process.cwd()`, and the
 * same relative string is reused inside `outDir` so the two halves of the
 * claim cannot name different directories.
 */
const TERRAIN_TILES_PATH = 'content/terrain/tiles'
const REPO_TERRAIN_TILES_DIR = fileURLToPath(new URL(`../../${TERRAIN_TILES_PATH}`, import.meta.url))

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
  it('ships the content it fetches at runtime, and the licence notice that must travel with it', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ww2airsim-dist-'))
    try {
      await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } })
      const shipped = readFileSync(join(outDir, AIRCRAFT_CONTENT_PATH), 'utf8')
      // Present is not enough: a truncated or wrong-shaped copy would 200 and
      // then fail parsing in the browser, which is the same failure screen by
      // a slower route.
      expect(() => AircraftSpecSchema.parse(JSON.parse(shipped))).not.toThrow()

      // Every terrain level the loader actually asks for, derived from the
      // same two functions the loader derives it from rather than written out
      // as five names -- a change to either bound has to move this set too.
      // Without this, a missing terrain level is a 404 at runtime and the
      // airplane flies over an empty sea, which looks like the game working.
      //
      // The EXACT byte length, not `> 0` (review 2026-09-14, finding 5). A
      // truncated copy -- a partial write, a `cp` that ran while the build was
      // still writing -- is a 200 with the wrong number of samples in it, and
      // `decodeLevel`'s own length guard would then reject it at runtime, i.e.
      // exactly the failure this assertion is here to catch before shipping.
      // The expected size is one call away (`samplesAtLevel`, the same
      // function the decoder sizes its buffer with), so accepting "non-empty"
      // was choosing a weaker check over a free stronger one.
      expect(readFileSync(join(outDir, 'content/ocean/depth.bin')).length).toBe(513 * 513 * 2)
      expect(readFileSync(join(outDir, 'content/ocean/NOTICE.md'), 'utf8')).toContain('GEBCO_2026')
      expect(readFileSync(join(outDir, 'content/landcover/cover.bin.gz')).length).toBeGreaterThan(200_000)
      expect(readFileSync(join(outDir, 'content/landcover/cover.bin.gz')).length).toBeLessThan(400_000)
      expect(readFileSync(join(outDir, 'content/landcover/NOTICE.md'), 'utf8')).toContain('ESA WorldCover')
      expect(JSON.parse(readFileSync(join(outDir, 'content/landcover/header.json'), 'utf8')).samples).toBe(1025)
      const rivers = JSON.parse(readFileSync(join(outDir, 'content/scenery/rivers.json'), 'utf8'))
      expect(rivers.length).toBe(8)
      expect(readFileSync(join(outDir, 'content/scenery/NOTICE.md'), 'utf8')).toContain('OpenStreetMap contributors')
      // The ODbL attribution ships inside the controls panel (`legend.ts`),
      // so the URL must reach the JS bundle -- and must NOT be back on the
      // play screen as the fixed `map-credit` watermark Mark did not
      // authorize (removed 2026-09-17).
      const assetsDir = join(outDir, 'assets')
      const shippedJs = readdirSync(assetsDir)
        .filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(join(assetsDir, f), 'utf8'))
        .join('\n')
      expect(shippedJs).toContain('https://www.openstreetmap.org/copyright')
      expect(readFileSync(join(outDir, 'index.html'), 'utf8')).not.toContain('map-credit')
      const coarsest = coarsestFetchedLevel(TERRAIN_HEADER.levels)
      for (let level = FINEST_FETCHED_LEVEL; level <= coarsest; level++) {
        const samples = samplesAtLevel(TERRAIN_HEADER, level)
        const bytes = readFileSync(join(outDir, terrainLevelPath(level)))
        expect(bytes.byteLength, `${terrainLevelPath(level)} is the wrong size`).toBe(samples ** 2 * 2)
      }

      // Copernicus Article 6(b)/6(c): the attribution and the no-liability
      // sentence have to accompany the derived data. They do so via
      // NOTICE.md, which is committed in the same directory as the .bin files
      // so a recipient of only those files still receives it -- and this
      // asserts the build does not quietly drop it on the way to dist/. The
      // repo-side copy is checked by reading the shipped one, so a notice
      // edited to say something else fails here rather than in a lawyer's
      // letter.
      // The 178 MB the build must NOT ship -- asserted only where the bug is
      // reachable. `expect(existsSync(...)).toBe(false)` unconditionally would
      // be green in CI and in a fresh clone for the wrong reason: the SOURCE
      // directory is absent there, so nothing could have been copied whether
      // the filter exists or not. Guarded on the source, this is a real
      // assertion on a machine that has run `npm run terrain:build` and a
      // stated no-op everywhere else.
      if (existsSync(REPO_TERRAIN_TILES_DIR)) {
        expect(
          existsSync(join(outDir, TERRAIN_TILES_PATH)),
          'the build shipped the gitignored L0-L3 tiles (vite.config.ts\'s content-copy filter)',
        ).toBe(false)
      }

      const notice = readFileSync(join(outDir, TERRAIN_NOTICE_PATH), 'utf8')
      const flatten = (md: string): string => md.replace(/^>\s?/gm, '').replace(/\s+/g, ' ')
      // Split on the `## ` headings, so each licence string is looked for
      // only inside the section that announces it.
      const sections = notice.split(/^## /m).slice(1)
      for (const [article, text] of Object.entries(COPERNICUS_LICENCE_STRINGS)) {
        const label = article.slice(0, 4) // '6(a)' / '6(b)' / '6(c)'
        const section = sections.find((sec) => sec.split('\n', 1)[0]!.includes(label))
        expect(section, `NOTICE.md has no section headed for Article ${article}`).toBeDefined()
        expect(flatten(section!), `Copernicus Article ${article}`).toContain(text)
      }
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
   * parameter that MOVES THE AIRPLANE (`src/render/spawn.ts`) -- and checked
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
      // Reject the query-key literal; general Beaufort validation can remain
      // in production as scenario weather will use it too.
      expect(bundle).not.toContain(JSON.stringify(BEAUFORT_PARAM))
      expect(bundle).not.toContain('ocean weather:')
      expect(bundle).not.toContain('sceneryView')
      // The spawn override, by the parameter names the app actually parses
      // rather than by three literals -- renaming one in `spawn.ts` must not
      // quietly narrow what this test looks for.
      for (const name of SPAWN_PARAMS) {
        expect(bundle.includes(name), `\`${name}\` reached the production bundle`).toBe(false)
      }
    } finally {
      // `delete`, not assignment, when it was unset: assigning `undefined` to
      // a `process.env` key stores the STRING "undefined", which is not
      // `=== 'production'` but is also not absent -- and absent is what the
      // rest of Vite's config resolution branches on. Latent today because
      // Vitest always sets NODE_ENV, so this restore has never actually taken
      // the unset path (review fix round 2).
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = priorNodeEnv
      rmSync(outDir, { recursive: true, force: true })
    }
  }, 60_000)
})
