import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import { cp } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/**
 * Gitignored directories under `content/` that must never reach `dist/`:
 * `terrain/tiles/` (see `copyContent` below), and `models/`, the staging area
 * `tools/models/sketchfab-fetch.sh` downloads candidates into
 * (131,197,993 bytes in the main checkout, measured 2026-09-25; A6M Zero
 * spec §6.4). Committed models live in `content/aircraft/` and
 * `content/ships/`, which are copied.
 */
export const EXCLUDED_CONTENT_DIRS: readonly string[] = ['terrain/tiles', 'models']

/** `cp`'s filter for `contentRoot`. Returning false for a directory already
 *  stops `cp` descending into it; the prefix test is the belt to those
 *  braces, and is written against `dir + sep` so a sibling that merely starts
 *  with the same name (`models-notes/`) is still copied. */
export function contentCopyFilter(contentRoot: string): (source: string) => boolean {
  const excluded = EXCLUDED_CONTENT_DIRS.map((d) => resolve(contentRoot, ...d.split('/')))
  return (source) => !excluded.some((dir) => source === dir || source.startsWith(dir + sep))
}

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
 * filter rather than a tidiness measure. Until Task 2 (2026-09-24) it held
 * the gitignored L0-L1 mips (167,821,316 bytes); that task committed both
 * (L0 via Git LFS, over GitHub's 100 MB per-file limit) into
 * `content/terrain/` proper, so nothing `terrainLevelPath` resolves lives
 * here any more. The build still creates the directory, and local experiments
 * or a future finer-than-L0 level can leave files in it. The filter therefore
 * stays: no gitignored scratch content may reach `dist/`. `dist.test.ts`
 * asserts the directory's absence only on a checkout where the source
 * directory exists, so it cannot pass in CI for the wrong reason.
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
      await cp(
        resolve(config.root, 'content'),
        resolve(config.root, config.build.outDir, 'content'),
        { recursive: true, filter: contentCopyFilter(resolve(config.root, 'content')) },
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
 * remains ww2airsim.com and is unaffected by this file.
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
