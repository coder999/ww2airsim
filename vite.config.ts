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
 * Two dev loops, both of which exist for the same reason: `navigator.gpu` is
 * exposed only in a secure context, and a plain-HTTP LAN address is not one
 * (master spec §2) -- so serving on 0.0.0.0 and browsing by IP would make
 * WebGPU unavailable before anything else could be debugged.
 *
 * DEFAULT -- loopback plus an SSH tunnel from the Windows desktop, because
 * http://localhost IS a secure context:
 *
 *     ssh -L 5173:localhost:5173 nexus
 *     # then open http://localhost:5173 on Windows
 *
 * Verified working on the reference platform 2026-09-12 (day-0 spike).
 *
 * WW2AIRSIM_TUNNEL=1 -- no SSH tunnel; real HTTPS at
 * https://ww2airsim.windomlane.org, terminated at Cloudflare's edge and
 * carried to this host by the nexus cloudflared tunnel. Added 2026-09-16.
 *
 *     npm run dev:lan          # = WW2AIRSIM_TUNNEL=1 vite
 *
 * The script exists because forgetting the variable fails WORSE than not
 * starting the server at all: plain `npm run dev` binds loopback, Traefik
 * cannot reach it, and the browser gets the same "Bad Gateway" it gets when
 * nothing is running — one symptom, two unrelated causes. Hit for real
 * 2026-09-16.
 *
 * 172.17.0.1 is the docker bridge gateway: nexus's Traefik runs in a
 * container and cannot reach this host's loopback. The routing, the Access
 * gate in front of it and what does NOT need configuring in Cloudflare are
 * documented once, in vps-local/shared/traefik/dynamic/ww2airsim-dev.yml --
 * do not restate any of it here. That hostname is dev-only; production
 * remains ww2airsim.marktuttle.dev and is unaffected by this file.
 *
 * `hmr` has to be spelled out for that path because the browser reaches the
 * page on :443 over TLS while Vite listens on plain :5173, so the client's
 * default guess (ws://<page host>:5173) connects to nothing.
 *
 * `allowedHosts` is what makes Vite answer for a Host header that is not a
 * loopback name; without it the tunnel gets a 403 that reads like a routing
 * bug.
 *
 * The dev server needs no content copy: it serves `content/` from the project
 * root as-is, which is why the gap only ever existed in a build and why
 * Task 15's Playwright harness, which runs against dev, could not see it.
 */
const TUNNEL_HOST = 'ww2airsim.windomlane.org'
const viaTunnel = process.env.WW2AIRSIM_TUNNEL === '1'

export default defineConfig({
  plugins: [copyContent()],
  server: {
    host: viaTunnel ? '172.17.0.1' : '127.0.0.1',
    port: 5173,
    strictPort: true,
    ...(viaTunnel
      ? {
          allowedHosts: [TUNNEL_HOST],
          hmr: { protocol: 'wss', host: TUNNEL_HOST, clientPort: 443 },
        }
      : {}),
  },
  build: { target: 'esnext' },
})
