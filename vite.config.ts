import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import { cp } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/**
 * Copy `content/` into the build output.
 *
 * Ruling R20, closing the gap Ruling R14 recorded: the build exited 0 while
 * producing a dist/ that contained only assets/ and index.html, so the
 * artifact 404'd on its own aircraft content and booted straight to the
 * bad-content failure screen.
 *
 * A plugin rather than `publicDir`, because `publicDir` copies the CONTENTS of
 * the directory it names into the root of dist/. Pointing it at `content/`
 * would put `aircraft/` at the top level and change the URL the app fetches;
 * pointing it at the repository root would ship node_modules and the source
 * tree. Neither is what is wanted, and a `public/` directory holding a symlink
 * to `content/` makes the real content's location a matter of what Vite
 * happens to do with symlinks.
 *
 * `tests/build/dist.test.ts` asserts the result by running an actual build,
 * not by reading this file.
 *
 * `content/terrain/tiles/` is excluded, and that exclusion is the point of the
 * filter rather than a tidiness measure: it holds the gitignored L0-L3 mips
 * (178,319,368 bytes, measured 2026-09-14), which no browser code path fetches
 * -- `src/render/content.ts`'s FINEST_FETCHED_LEVEL stops at L4 precisely
 * because those files are not in a clone. Without the filter, any machine that
 * has run `npm run terrain:build` ships them, and `dist.test.ts` runs two real
 * builds, so `npm run verify` alone copies ~342 MB of them on the one machine
 * that also runs Tier 2 -- which is the machine a hand-deploy comes from. That
 * test asserts the absence, and only on a machine where the directory exists,
 * so it cannot pass in CI for the wrong reason.
 */
function copyContent(): Plugin {
  // Captured from `configResolved` rather than read off the hook context: the
  // outDir has to be the one this build actually resolved, or a build into a
  // custom directory silently writes its content into ./dist instead. The
  // test builds into a temp directory precisely so that mistake cannot pass.
  let config: ResolvedConfig
  return {
    name: 'ww2airsim-copy-content',
    apply: 'build',
    configResolved(resolved): void {
      config = resolved
    },
    async closeBundle(): Promise<void> {
      const tilesDir = resolve(config.root, 'content', 'terrain', 'tiles')
      await cp(
        resolve(config.root, 'content'),
        resolve(config.root, config.build.outDir, 'content'),
        {
          recursive: true,
          // Returning false for the directory itself already stops `cp`
          // descending into it; the prefix test is the belt to that braces,
          // and is written against `dir + sep` so a sibling that merely
          // starts with the same name is not caught by it.
          filter: (source) => source !== tilesDir && !source.startsWith(tilesDir + sep),
        },
      )
    },
  }
}

/**
 * Loopback-only on purpose. `navigator.gpu` is exposed only in a secure
 * context, and a plain-HTTP LAN address is not one (master spec §2) -- so
 * serving on 0.0.0.0 and browsing by IP would make WebGPU unavailable before
 * anything else could be debugged. The dev loop is an SSH tunnel from the
 * Windows desktop:
 *
 *     ssh -L 5173:localhost:5173 nexus
 *     # then open http://localhost:5173 on Windows
 *
 * Verified working on the reference platform 2026-09-12 (day-0 spike).
 *
 * The dev server needs no content copy: it serves `content/` from the project
 * root as-is, which is why the gap only ever existed in a build and why
 * Task 15's Playwright harness, which runs against dev, could not see it.
 */
export default defineConfig({
  plugins: [copyContent()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'esnext' },
})
