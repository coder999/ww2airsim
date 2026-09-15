# Deploying ww2airsim to ww2airsim.marktuttle.dev

Status: design, 2026-09-15. Scope: put the current build on a public URL on
the OVH VPS, alongside the other sites, and establish the place it will live.
Requested explicitly as "nowhere near finished yet" — this is a staging
address for a work in progress, not a launch.

## Why a deploy helps now, beyond being able to look at it

WebGPU requires a **secure context**. The dev server binds loopback-only for
exactly that reason (`vite.config.ts`), which is why looking at this thing
locally needs two SSH tunnels and a Playwright server on the Windows desktop,
and why that harness being down blocks a visual check. Behind Cloudflare's
HTTPS the game simply runs, on any device, with no tunnel. The deployed site
is likely to become the *easier* way to look at it than the local loop.

## Facts this design rests on, each verified rather than assumed

- **Zone `marktuttle.dev` is Cloudflare SSL mode `full`, not `full (strict)`**
  (API read, 2026-09-15). The origin's certificate is therefore accepted
  without validation.
- **The VPS serves `CN=TRAEFIK DEFAULT CERT` for existing public subdomains.**
  Checked directly on the host with `openssl s_client -servername
  antibiogram.marktuttle.dev`, 2026-09-15. Combined with the above: a public
  marktuttle.dev subdomain needs **no Origin CA certificate at all**, which is
  how ~27 of them work today.
- **`ww2airsim.marktuttle.dev` does not exist** in the zone (API read,
  2026-09-15). Public subdomains are proxied `A` records to `15.204.123.196`.
- **`sites/_template-static` exists and no site uses it.** All 14 sites in
  `vps-infra` are the PHP+MariaDB template. This will be its first use.

## Access: public, by decision

Mark's call, 2026-09-15. The consequence is that ww2airsim must **not** join
`proxy/traefik/dynamic/origin-ca-admin-marktuttle.yml` — that consolidated
cert carries the admin-tooling hostnames and is gated by the
`admin-tools-marktuttle` Cloudflare Access app, and its own comment records
that it is deliberately not a wildcard *because* marktuttle.dev also hosts
public content that must not be Access-gated. ww2airsim is that kind of
content. It follows the legacy-archive pattern instead: `tls=true`, no cert
file, no Access application.

## The five pieces

1. **DNS** — proxied `A` record, `ww2airsim` → `15.204.123.196`, via the
   Cloudflare API.
2. **`vps-infra`: `sites/ww2airsim/`** — stamped from `_template-static`. One
   `nginx:1.31-alpine`, no PHP, no MariaDB, **no `.env`**. Committed on a
   worktree branch, per this repo's rule that `vps-infra` stays on `master`.
3. **The VPS** — `scripts/add-site.sh ww2airsim ww2airsim.marktuttle.dev
   --static <pubkey>`, run as root there. It creates the site directory, the
   unprivileged `ww2airsim-deploy` user, its forced-command SSH access and its
   sudoers drop-in, in one command. Then `deploy-infra.sh` after the
   `git pull --ff-only` its own docs require.
4. **`ww2airsim`: `.github/workflows/deploy.yml`** — `workflow_dispatch` only.
5. **A `noindex` rule**, in the site's nginx config rather than the build.

## The departure from the fleet pattern, stated plainly

Every existing site rsyncs **source**: `htdocs/` goes up as it is in the repo,
and PHP runs it. ww2airsim has no source to serve — it rsyncs a **build
artifact**. The workflow runs `npm ci`, `npm run verify` and `npm run build`
on the runner, then ships `dist/`.

Three consequences worth writing down, because they make this site's deploy
*safer* than the fleet's rather than more complex:

- **There is no `.env`, so the fleet's worst deploy hazard is structurally
  absent.** A newly added env var silently not taking effect until a container
  recreate is the failure this fleet has been bitten by repeatedly; a site with
  no secrets and no backend cannot have it. The `_template-static`
  `ssh-dispatch.sh` drops the `put-env` verb entirely, so it is not merely
  unused — it is not reachable.
- **No 502 on deploy.** `app/htdocs` is bind-mounted read-only; an rsync'd file
  is served on the next request with no container action at all. The
  `redeploy` verb exists only for an nginx config change, and it *reloads*
  rather than recreating.
- **The tests gate the deploy.** `npm run verify` on the runner means a red
  suite fails the workflow before anything ships. No existing site can do this,
  because none of them build.

## nginx: three deliberate additions to the stamped template

1. **Drop the `www` router.** The template stamps a `www.{{DOMAIN}}` redirect
   unconditionally. For a subdomain that means `www.ww2airsim.marktuttle.dev`
   — no DNS record, and Cloudflare's universal certificate does not cover a
   fourth-level label. It would be a router that can never match. This is a
   finding about the template's first use, not about this site; it belongs
   upstream as a note in `_template-static`.
2. **Cache headers.** Vite emits content-hashed filenames under `/assets/`,
   which are immutable by construction: `max-age=31536000, immutable`.
   `content/**` (the terrain pyramid, the aircraft JSON) is **not** hashed, so
   it keeps nginx's default `ETag`/`Last-Modified` revalidation. `index.html`
   is `no-cache`, so a deploy is visible on reload.
3. **`noindex`.** `X-Robots-Tag: noindex, nofollow` plus a `/robots.txt`
   returning `Disallow: /`. In nginx, not in the build, so removing it later is
   a one-line infra change with no rebuild. An unfinished game should not
   accumulate search results.

## Non-goals

- **No R2, no CDN origin for terrain.** The *terrain* design's §9 item 2
  (`2026-09-13-terrain-design.md`, not the master spec) leaves where terrain is
  served from open "until a deploy exists". A deploy now exists, so that item
  becomes answerable — but the committed fallback is 703 KB served from the
  same origin as everything else, so the answer is "not yet" and the item stays
  open with its premise updated.
- **No `main`-push deploy.** Fleet rule: pushing `main` deploys nothing.
- **No Tier 2 against production.** The GPU suite points at the dev server;
  pointing it at a public URL is a separate decision.
- **No custom error pages, analytics, or uptime probe.** All cheap to add once
  the thing exists; none needed to see it.

## How it will be verified

Assertions, not a click-through:

1. `curl -sI https://ww2airsim.marktuttle.dev/` → `200`, and
   `X-Robots-Tag: noindex`.
2. `curl -s https://ww2airsim.marktuttle.dev/robots.txt` → contains
   `Disallow: /`.
3. `curl -sI .../content/terrain/L4.bin` → `200` with a non-zero
   `Content-Length`. The terrain fallback is the one asset whose absence would
   leave a flyable-but-empty world, which looks like a rendering bug.
4. `curl -sI` an `/assets/*.js` → `Cache-Control: immutable`.
5. **The negative:** `curl -sI .../content/terrain/tiles/L0.bin` → `404`. The
   178 MB of gitignored levels must not be on the public site. Note honestly
   what this does and does not prove: those files are gitignored, so a GitHub
   runner's checkout never has them and `dist/` could not contain them even
   without the build-time filter Plan 4's whole-branch review added. The
   assertion is therefore belt-and-braces — it catches a future change that
   starts shipping them, not today's build.
6. The deploy workflow's own final step curls (1) and fails the run if it does
   not hold, so a broken deploy is red rather than silent.

Opening it in a browser and flying it is the acceptance test, and it is Mark's.

## Risks

- **First use of `_template-static`.** Expect to shake out template bugs. Any
  fix belongs in the template, not only in this site.
- **A public URL for an unfinished thing.** Mitigated by `noindex` only. The
  hostname is guessable and the repo is public, so this is not obscurity and
  should not be described as it: anyone given the URL can fly it, and that is
  the accepted trade for being able to look at it from anywhere.
- **The deploy key.** A new keypair; the private half goes in this repo's
  GitHub secrets as `VPS_DEPLOY_KEY`, matching the fleet's name. Generating it
  and installing the public half is routine, but if the session's classifier
  blocks moving key material, the fallback is that Mark runs one command.
