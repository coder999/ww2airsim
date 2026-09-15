# ww2airsim Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the current ww2airsim build at `https://ww2airsim.marktuttle.dev`, publicly, deployed by a manual GitHub Actions workflow.

**Architecture:** A pure static site on the OVH VPS: Cloudflare (proxied, SSL mode `full`) → Traefik → one `nginx:1.31-alpine` container serving a read-only bind mount. GitHub Actions builds the Vite bundle and rsyncs `dist/` to an unprivileged per-site deploy user over forced-command SSH. No PHP, no database, no `.env`, no secrets on the host.

**Tech Stack:** Cloudflare DNS + API, Traefik v3, Docker Compose, nginx, GitHub Actions, rsync over SSH, Vite.

**Spec:** `docs/superpowers/specs/2026-09-15-deployment-design.md`

## Global Constraints

- **This plan spans two repos and live production infrastructure.** `vps-infra` is authoritative for VPS config; `ww2airsim` owns its own build and workflow. Never edit `/opt/webhosting` on the VPS — it is a pull-only mirror.
- **`vps-infra` work happens in a git worktree, and `master` stays checked out.** Several sessions commit into that working copy at once; switching its branch silently captures their commits. This bit the fleet for real on 2026-09-02.
- **Never run bare `docker compose config`.** It expands `env_file` into cleartext and has already leaked a live API token into session logs (2026-09-04). Use `docker compose config --no-env-resolution`. To read a compose file, `cat` it.
- **On the VPS, `git -C ~/projects/vps-infra pull --ff-only` BEFORE `deploy-infra.sh`.** That script fetches from the VPS's own intermediate checkout, not GitHub, so skipping the pull makes it report "Already up to date" and deploy nothing — a success-looking no-op (hit for real 2026-08-30). It syncs files only; it restarts nothing.
- **Verification is assertions, not unit tests.** Most of this plan is infrastructure. Do not invent a test framework for DNS. Every task states the exact command and the exact expected output. A step that cannot be asserted must say so.
- **Capture exit status directly** (`rc=$?` immediately after the command). Never read success through a pipe into `grep`.
- **`curl -w '%{ssl_verify_result}'` prints `0` even when curl never connected.** Found for real on 2026-09-15: with DNS failing, `curl` returned `status=000 tls=0` and exit code 6. An assertion that checks only `tls=0` therefore PASSES on total DNS failure — the exact shape of defect this fleet keeps shipping. Every curl assertion below requires **curl's own exit code to be 0** and a real HTTP status, not just `tls=0`.
- **nexus cannot resolve a just-created record for up to 30 minutes.** The LAN resolver is the router (192.168.0.1) and `marktuttle.dev`'s SOA negative TTL is 1800s, so a name queried before it existed stays NXDOMAIN locally long after Cloudflare serves it. `resolvectl flush-caches` does not help — the cache is upstream. Verify with a public resolver and pin curl to the answer:
  ```bash
  EDGE=$(dig +short @1.1.1.1 ww2airsim.marktuttle.dev | head -1)
  curl -sS --resolve "ww2airsim.marktuttle.dev:443:$EDGE" https://ww2airsim.marktuttle.dev/...
  ```
  This is not a workaround to be embarrassed about: it tests the real edge over real TLS with the real SNI. It only bypasses a stale local cache.
- **This site is PUBLIC by explicit decision (Mark, 2026-09-15).** It must NOT be added to `origin-ca-admin-marktuttle.yml` or any Cloudflare Access application.
- Host: `vps-4b80346f.vps.ovh.us`, origin IP `15.204.123.196`, zone id `2d88836341051a77bb72c83f1fd245d2`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `vps-infra/sites/ww2airsim/compose.yml` | The nginx service and its Traefik routing labels. One service. |
| `vps-infra/sites/ww2airsim/nginx/conf.d/site.conf` | vhost: cache policy, `noindex`, real-IP chain. |
| `vps-infra/sites/ww2airsim/bin/redeploy.sh` | Root-owned nginx reload. Stamped, unmodified. |
| `vps-infra/sites/ww2airsim/bin/ssh-dispatch.sh` | Forced-command allowlist: `rsync` and `redeploy` only. Stamped, unmodified. |
| `vps-infra/sites/_template-static/README.md` | Gains the subdomain/`www` finding from this first real use. |
| `ww2airsim/.github/workflows/deploy.yml` | Build, verify, rsync `dist/`, assert the result. |
| `ww2airsim/README.md` | A "Deployment" section pointing at the spec. |

---

### Task 1: The site definition in `vps-infra`

**Files:**
- Create: `vps-infra/sites/ww2airsim/compose.yml`
- Create: `vps-infra/sites/ww2airsim/nginx/conf.d/site.conf`
- Create: `vps-infra/sites/ww2airsim/bin/redeploy.sh`, `vps-infra/sites/ww2airsim/bin/ssh-dispatch.sh`

**Interfaces:**
- Produces: container `ww2airsim-nginx`, Traefik router `ww2airsim` on `Host(`ww2airsim.marktuttle.dev`)`, site root `sites/ww2airsim/` with `app/htdocs` as the rsync target.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Make an isolated worktree, leaving `master` alone**

```bash
cd ~/projects/vps-infra
git worktree add .worktrees/ww2airsim-site -b ww2airsim-site master
cd .worktrees/ww2airsim-site
```

- [ ] **Step 2: Stamp the static template by hand**

`scripts/add-site.sh` is not meaningfully runnable off the VPS (it creates a system user and a sudoers drop-in). Copy the template and substitute instead; Task 4 runs the real script on the host.

```bash
mkdir -p sites/ww2airsim
cp -r sites/_template-static/. sites/ww2airsim/
rm sites/ww2airsim/README.md
grep -rl '{{SITE}}\|{{DOMAIN}}' sites/ww2airsim/ | while read -r f; do
  sed -i 's/{{SITE}}/ww2airsim/g; s/{{DOMAIN}}/ww2airsim.marktuttle.dev/g' "$f"
done
chmod +x sites/ww2airsim/bin/*.sh
grep -rn '{{' sites/ww2airsim/ && echo "UNSUBSTITUTED PLACEHOLDER" || echo "all placeholders replaced"
```

- [ ] **Step 3: Remove the `www` router, which cannot work for a subdomain**

Delete the six `ww2airsim-www` label lines and the `ww2airsim-www-redirect` middleware lines from `sites/ww2airsim/compose.yml`. `www.ww2airsim.marktuttle.dev` has no DNS record, and Cloudflare's universal certificate covers only one label deep (`*.marktuttle.dev`), so a fourth-level name has no edge certificate. Leaving the router in place would add a rule that can never match.

Replace them with a comment recording why, so the next reader does not "restore" it:

```yaml
      # No `www.` router here, deliberately -- unlike every other site using
      # this template. This is a SUBDOMAIN: `www.ww2airsim.marktuttle.dev` is
      # four labels deep, Cloudflare's universal cert covers only
      # `*.marktuttle.dev`, and no DNS record exists for it. The stamped
      # router could never match. See sites/_template-static/README.md.
```

- [ ] **Step 4: Write the vhost's cache, `noindex` and SPA-less routing policy**

Replace the `location / { try_files $uri $uri/ =404; }` block in `sites/ww2airsim/nginx/conf.d/site.conf` with the following, and leave every other line of the stamped file untouched (the real-IP chain and the dotfile deny are both correct as stamped):

```nginx
    # An unfinished game should not accumulate search results. In nginx rather
    # than in the Vite build, so removing it later is a one-line infra change
    # with no rebuild. `always` so it is set on 404s and 304s too.
    #
    # This and /robots.txt's Disallow are ALTERNATIVES, not layers, and the
    # combination is deliberately belt-and-braces rather than additive: a
    # crawler that obeys Disallow never fetches the page and so never sees this
    # header, which leaves a URL-only result possible for a link someone else
    # publishes. The rigorous de-indexing recipe is the opposite -- allow
    # crawling, serve noindex. Not worth it for a site with no inbound links.
    add_header X-Robots-Tag "noindex, nofollow" always;

    location = /robots.txt {
        # No add_header here, deliberately. `return 200` already sets
        # Content-Type: text/plain, so adding it yields the header TWICE
        # (invalid per RFC 9110) -- and declaring any add_header at this level
        # cancels inheritance of the server-level X-Robots-Tag above, so the
        # one block that most obviously needs it would silently lose it.
        return 200 "User-agent: *\nDisallow: /\n";
    }

    # Vite emits content-hashed filenames under /assets/, so a given URL's
    # bytes can never change: cache them for a year and never revalidate.
    location /assets/ {
        # NOT `always`. `always` would apply this to 404s too, and rsync is not
        # atomic: during a deploy a browser can request a hashed asset in the
        # window before it lands and cache the 404 as fresh for a year. The
        # edge copy is purgeable, the users' browser copies are not, and
        # re-deploying the identical filename does not fix it because nothing
        # revalidates. 304 is already in nginx's default status list, so
        # conditional requests still carry this header.
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Robots-Tag "noindex, nofollow" always;
        try_files $uri =404;
    }

    # content/ is NOT hashed -- the terrain pyramid and aircraft JSON keep
    # their names across releases -- so it must revalidate. nginx's default
    # ETag/Last-Modified handling makes that a conditional GET, not a refetch.
    location /content/ {
        add_header Cache-Control "public, max-age=300" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        try_files $uri =404;
    }

    # No SPA fallback: this is one page and has no client-side router, so an
    # unknown path is a genuine 404 rather than something to rewrite to
    # index.html. A blanket fallback would serve the game for every typo and
    # hide missing-asset bugs behind a 200.
    location / {
        add_header Cache-Control "no-cache" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        try_files $uri $uri/ =404;
    }
```

Note: `add_header` does not inherit into a nested `location`, which is why the header is repeated in each block rather than set once at server level. That is an nginx rule people get wrong constantly; Step 6 asserts it.

- [ ] **Step 5: Validate the compose file without leaking anything**

```bash
cd sites/ww2airsim
docker compose config --no-env-resolution > /dev/null; rc=$?
cd - >/dev/null
echo "compose config rc=$rc"
```

Expected: `rc=0`. If it errors on an undefined `proxy` network, that is expected off the VPS — confirm the message names the network and nothing else.

- [ ] **Step 6: Validate the nginx config in a throwaway container**

```bash
docker run --rm -v "$PWD/sites/ww2airsim/nginx/conf.d:/etc/nginx/conf.d:ro" \
  nginx:1.31-alpine nginx -t; rc=$?
echo "nginx -t rc=$rc"
```

Expected: `rc=0`, "syntax is ok" and "test is successful".

- [ ] **Step 7: Commit and push the branch**

```bash
git add sites/ww2airsim
git commit -m "ww2airsim: a static site for the flight sim, minus the www router

First real use of sites/_template-static: one nginx, no PHP, no MariaDB and
no .env, which is why the fleet's newly-added-env-var-needs-a-recreate
hazard cannot occur here at all -- ssh-dispatch.sh has no put-env verb to
reach.

The www router is dropped. Every other site using this template is an apex
domain where it is right; ww2airsim.marktuttle.dev is a subdomain, so the
stamped router would be Host(\`www.ww2airsim.marktuttle.dev\`) -- four labels
deep, past what Cloudflare's *.marktuttle.dev universal cert covers, with no
DNS record behind it. A rule that can never match.

Cache policy splits three ways because the content does: /assets/ is
content-hashed by Vite and immutable for a year, /content/ keeps stable
names across releases so it must revalidate, and index.html is no-cache so a
deploy is visible on reload. The X-Robots-Tag is repeated per location
because nginx add_header does not inherit into a nested location.

nginx -t rc=0 against the real image; compose config --no-env-resolution
rc=0 (never bare config -- it expands env_file in cleartext)."
git push -u origin ww2airsim-site
```

---

### Task 2: The deploy keypair and the GitHub secret

**Files:**
- Create: `~/.ssh/ww2airsim-deploy` and `.pub` on nexus (transient; the private half ends up only in GitHub secrets)

**Interfaces:**
- Produces: GitHub secret `VPS_DEPLOY_KEY` on `coder999/ww2airsim`; a public key file for Task 4's `add-site.sh`.
- Consumes: nothing.

- [ ] **Step 1: Generate a dedicated keypair**

One key per site, matching the fleet. No passphrase — it is used unattended by Actions.

```bash
ssh-keygen -t ed25519 -N '' -C 'ww2airsim-deploy@github-actions' -f ~/.ssh/ww2airsim-deploy
ls -l ~/.ssh/ww2airsim-deploy ~/.ssh/ww2airsim-deploy.pub
```

- [ ] **Step 2: Put the private half in GitHub secrets**

```bash
gh secret set VPS_DEPLOY_KEY --repo coder999/ww2airsim < ~/.ssh/ww2airsim-deploy; rc=$?
echo "rc=$rc"
gh secret list --repo coder999/ww2airsim
```

Expected: `rc=0` and `VPS_DEPLOY_KEY` listed. The name matches the other sites' workflows deliberately.

If a guard blocks handling the private key, stop and ask Mark to run exactly the command above himself — do not route it via another agent or another host. Report the public key path so Task 4 can still proceed.

- [ ] **Step 3: Verify the secret is usable, not just present**

`gh secret list` proves a name exists, not that the value is a valid key. Assert the value round-trips as a key locally before trusting it:

```bash
ssh-keygen -y -f ~/.ssh/ww2airsim-deploy > /tmp/derived.pub; rc=$?
diff <(cut -d' ' -f1,2 /tmp/derived.pub) <(cut -d' ' -f1,2 ~/.ssh/ww2airsim-deploy.pub) && echo "keypair consistent rc=$rc"
```

Expected: no diff output, `rc=0`. (The real end-to-end proof is Task 5's first dispatch.)

- [ ] **Step 4: No commit**

Nothing here is committed. Record in the task report that `~/.ssh/ww2airsim-deploy` exists on nexus and is the only copy of the private key outside GitHub.

---

### Task 3: The DNS record

**Files:** none. Cloudflare API only.

**Interfaces:**
- Produces: `ww2airsim.marktuttle.dev` resolving through Cloudflare to the VPS.
- Consumes: nothing.

- [ ] **Step 1: Confirm the record does not already exist**

```bash
# via the cloudflare-api MCP
GET /zones/2d88836341051a77bb72c83f1fd245d2/dns_records?name=ww2airsim.marktuttle.dev
```

Expected: `result` is an empty array. If it is not, STOP and report — something else owns that name.

- [ ] **Step 2: Create the proxied A record**

```json
POST /zones/2d88836341051a77bb72c83f1fd245d2/dns_records
{ "type": "A", "name": "ww2airsim", "content": "15.204.123.196",
  "proxied": true, "comment": "ww2airsim flight sim, static site on the VPS. Added 2026-09-15." }
```

`proxied: true` is not optional: it is what puts Cloudflare's certificate in front, and the origin serves only Traefik's self-signed default cert. Unproxied, the browser would see that cert and refuse.

- [ ] **Step 3: Assert it resolves to Cloudflare, not to the origin**

```bash
dig +short ww2airsim.marktuttle.dev
```

Expected: two Cloudflare edge addresses (104.x / 172.67.x), **not** `15.204.123.196`. Seeing the origin IP means `proxied` did not take.

- [ ] **Step 4: Assert the edge answers, even though no site exists yet**

```bash
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://ww2airsim.marktuttle.dev/
```

Expected: a 404 or 502 from Traefik with `ssl_verify_result` 0. A TLS error here is the failure that matters; the status code is meaningless until Task 4.

---

### Task 4: Provision the site on the VPS

**Files:**
- Modify (on the VPS, via git only): `/opt/webhosting/sites/ww2airsim/`

**Interfaces:**
- Consumes: Task 1's branch, Task 2's public key, Task 3's DNS.
- Produces: a running `ww2airsim-nginx`, the `ww2airsim-deploy` user, TLS serving.

**Read this before touching anything.** Two guards interact here, and the
obvious order trips both:

- `add-site.sh` **aborts** if `sites/<name>/` already exists in the checkout it
  runs from (`/opt/webhosting`). It must therefore run BEFORE this site reaches
  production.
- `deploy-infra.sh` **refuses to run** if that checkout has *anything*
  uncommitted — including the untracked directory `add-site.sh` just stamped.
  Its own header comment documents this exact interaction and records it as a
  former silent-deletion bug.

So `add-site.sh` runs first, and the vanilla files it stamps are removed before
`deploy-infra.sh` replaces them with the customised, committed versions. `app/`
is gitignored and must survive — it is the rsync target.

- [ ] **Step 1: Land Task 1's branch on `master` and push**

```bash
cd ~/projects/vps-infra
git fetch origin
git push origin ww2airsim-site:master
git log --oneline origin/master -1
```

If rejected, `master` moved — another session committed. Rebase the worktree
branch onto `origin/master` and retry. Never force-push. Pushing changes nothing
in production; only `deploy-infra.sh` does that.

- [ ] **Step 2: Copy the deploy public key up**

```bash
scp ~/.ssh/ww2airsim-deploy.pub vps:/tmp/ww2airsim-deploy.pub
```

A public key — nothing sensitive moves.

- [ ] **Step 3: Confirm production does not yet know about this site**

```bash
ssh vps 'ls -d /opt/webhosting/sites/ww2airsim 2>&1; sudo git -C /opt/webhosting status --porcelain | head'
```

Expected: "No such file or directory", and empty porcelain output (a clean
checkout). If the directory exists, `add-site.sh` will abort — STOP and report.
If the checkout is already dirty, STOP: that is someone else's uncommitted work,
and `deploy-infra.sh` will refuse for a reason unrelated to this task.

- [ ] **Step 4: Create the site, its user, its SSH access and its sudoers rule**

```bash
ssh vps 'sudo /opt/webhosting/scripts/add-site.sh ww2airsim ww2airsim.marktuttle.dev --static /tmp/ww2airsim-deploy.pub'; rc=$?
echo "add-site rc=$rc"
```

Expected: `rc=0`. It creates the `ww2airsim-deploy` system user with a real
shell, its forced-command `authorized_keys`, a sudoers drop-in, `app/htdocs`,
and a vanilla stamp of the template. Only the last of those is discarded next.

- [ ] **Step 5: Remove the vanilla stamp, keeping `app/`**

List before deleting — this is production, and the list is the evidence:

```bash
ssh vps 'sudo git -C /opt/webhosting status --porcelain'
```

Expected: untracked `sites/ww2airsim/` and nothing else. Then remove every
stamped entry EXCEPT `app/`, which is gitignored and is the deploy target.

Delete by exclusion rather than by naming files. The stamp copies the whole
template directory, which includes a `README.md` of template instructions as
well as `compose.yml`, `nginx/` and `bin/` — and one leftover untracked file is
enough to make Step 7 refuse:

```bash
ssh vps 'sudo find /opt/webhosting/sites/ww2airsim -mindepth 1 -maxdepth 1 ! -name app -exec rm -rf {} +'
ssh vps 'sudo git -C /opt/webhosting status --porcelain; ls -A /opt/webhosting/sites/ww2airsim'
```

Expected: porcelain now empty, and `app` the only entry left. Everything removed
comes back from git in Step 7 — the committed versions, with the `www` router
dropped and the cache policy applied, neither of which the stamp has.

- [ ] **Step 6: Pull the dev repo on the VPS — skipping this makes Step 7 a no-op**

```bash
ssh vps 'git -C ~/projects/vps-infra pull --ff-only'
```

Expected: Task 1's commit arrives. **"Already up to date" means Step 1 did not
land.** `deploy-infra.sh` fetches from this intermediate checkout, not from
GitHub, so continuing would report success and deploy nothing — a
success-looking no-op that cost this fleet real time on 2026-08-30.

- [ ] **Step 7: Deploy the infra files**

```bash
ssh vps 'sudo /opt/webhosting/scripts/deploy-infra.sh'; echo "deploy-infra rc=$?"
ssh vps 'sudo git -C /opt/webhosting log --oneline -1; ls /opt/webhosting/sites/ww2airsim'
```

Expected: `rc=0`; HEAD is Task 1's commit; `compose.yml`, `nginx/`, `bin/` and
`app/` all present. If it refuses, re-read Step 5's output — something is still
uncommitted. This script syncs files only and starts nothing, which is why
Step 8 exists.

- [ ] **Step 8: Start the container**

```bash
ssh vps 'cd /opt/webhosting/sites/ww2airsim && sudo docker compose up -d --wait ww2airsim-nginx'; echo "up rc=$?"
ssh vps "sudo docker ps --filter name=ww2airsim-nginx --format '{{.Names}} {{.Status}}'"
```

Expected: `ww2airsim-nginx Up ... (healthy)`. The healthcheck fetches `/`, and
`app/htdocs` is empty until Task 5 — if it reports unhealthy for that reason,
record it and let Task 5's deploy settle it. Do **not** add a placeholder
`index.html`: that makes the healthcheck pass on a file nothing else knows
about, and it would then be served to a real visitor.

- [ ] **Step 9: Assert TLS and the vhost end to end, before any content exists**

```bash
EDGE=$(dig +short @1.1.1.1 ww2airsim.marktuttle.dev | head -1); echo "edge=$EDGE"
R="--resolve ww2airsim.marktuttle.dev:443:$EDGE"
curl -sS $R -o /dev/null -w 'status=%{http_code} tls=%{ssl_verify_result}\n' https://ww2airsim.marktuttle.dev/; echo "curl rc=$?"
curl -sS $R -D- -o /dev/null https://ww2airsim.marktuttle.dev/robots.txt; echo "curl rc=$?"
```

Expected: **`curl rc=0`** — check that FIRST, because `tls=0` is also printed
when curl never connected at all, which would otherwise read as a pass. Then
`tls=0`, the edge certificate verifying.

**Expect the site itself to be UNREACHABLE through the edge at this point, and
do not treat that as a failure.** Traefik's Docker provider filters out any
container reporting unhealthy (`keepContainer()`: `Filtering unhealthy or
starting container`), so with `app/htdocs` empty there is no
`ww2airsim@docker` router at all and the 404 comes from Traefik, not from
nginx. The two facts are coupled: the empty web root that makes `/` a 403 is
also what makes the container unhealthy, which is what removes the router.

So at this step the edge proves only that DNS, Cloudflare and TLS are correct.
To check the vhost CONFIG, assert against the origin instead — and state the
result honestly, because `server_name _` is a catch-all, so this proves the
config is right and says nothing about Host routing or the edge path:

```bash
ssh vps 'curl -sS -o /dev/null -w "robots=%{http_code}\n" http://172.30.0.19/robots.txt'
ssh vps 'curl -sS -D- -o /dev/null http://172.30.0.19/robots.txt | grep -i "x-robots-tag\|content-type"'
```

Expected: `200`, one `Content-Type: text/plain`, and `X-Robots-Tag: noindex,
nofollow`. Substitute the container's real address from
`docker inspect ww2airsim-nginx`.

**The edge assertions move to Task 5 Step 5**, after the first rsync puts an
`index.html` in place. That makes `/` a 200, the healthcheck pass, and Traefik
create the router — verified to happen on the health-status transition, within
one healthcheck interval (120s).

- [ ] **Step 10: Commit nothing on the VPS**

`/opt/webhosting` is a pull-only mirror; committing there is forbidden, and
`deploy-infra.sh` exists to discard anything that appears. Record Step 5's
porcelain output, Step 7's HEAD and Step 9's two results in the task report.

---

### Task 5: The deploy workflow

**Files:**
- Create: `ww2airsim/.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `VPS_DEPLOY_KEY` (Task 2), the `ww2airsim-deploy` user (Task 4).
- Produces: a `workflow_dispatch` deploy that ships `dist/` and asserts the result.

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy ww2airsim to VPS

# Manual only. Pushing main does NOT deploy (fleet rule, 2026-08-26).
on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: npm

      - name: Install
        run: npm ci

      # Unlike every other site in this fleet, ww2airsim builds -- so the
      # tests can gate the release. A red suite fails the deploy before
      # anything is shipped.
      - name: Verify
        run: npm run verify

      - name: Build
        run: npm run build

      # The committed terrain fallback is what a fresh visitor flies on. If it
      # is missing the world renders as empty sea, which reads as a broken
      # renderer rather than a broken deploy -- so fail here instead.
      - name: Assert the build carries the terrain fallback
        shell: bash
        run: |
          set -euo pipefail
          test -s dist/content/terrain/L4.bin
          test ! -e dist/content/terrain/tiles
          echo "dist size: $(du -sh dist | cut -f1)"

      - name: Set up SSH
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p "$HOME/.ssh"
          printf '%s\n' "${{ secrets.VPS_DEPLOY_KEY }}" > "$HOME/.ssh/deploy_key"
          chmod 600 "$HOME/.ssh/deploy_key"
          ssh-keyscan vps-4b80346f.vps.ovh.us >> "$HOME/.ssh/known_hosts"

      # --delete so a renamed hashed asset does not accumulate forever. No
      # put-env and no redeploy: this site has no .env, and app/htdocs is a
      # read-only bind mount, so an rsync'd file is served on the next request
      # with no container action and no 502.
      - name: Deploy via rsync
        shell: bash
        run: |
          set -euo pipefail
          rsync -avz --delete \
            -e "ssh -i $HOME/.ssh/deploy_key -o IdentitiesOnly=yes" \
            dist/ ww2airsim-deploy@vps-4b80346f.vps.ovh.us:htdocs/

      - name: Verify the live site
        shell: bash
        run: |
          set -euo pipefail
          base=https://ww2airsim.marktuttle.dev
          code=$(curl -sS -o /dev/null -w '%{http_code}' "$base/")
          test "$code" = "200" || { echo "::error::homepage returned $code"; exit 1; }
          curl -sSI $R "$base/" | grep -qi 'x-robots-tag: *noindex' \
            || { echo "::error::noindex header missing"; exit 1; }
          tcode=$(curl -sS -o /dev/null -w '%{http_code}' "$base/content/terrain/L4.bin")
          test "$tcode" = "200" || { echo "::error::terrain L4 returned $tcode"; exit 1; }
          lcode=$(curl -sS -o /dev/null -w '%{http_code}' "$base/content/terrain/tiles/L0.bin")
          test "$lcode" = "404" || { echo "::error::gitignored L0 is public ($lcode)"; exit 1; }
          echo "live site verified"
```

- [ ] **Step 2: Commit and push — pushing does not deploy**

```bash
git add .github/workflows/deploy.yml
git commit -m "deploy: manual workflow shipping the built bundle to the VPS

workflow_dispatch only, per the fleet rule that pushing main releases
nothing. Unlike the other sites this one BUILDS, so npm run verify gates
the deploy: a red suite fails the run before anything ships.

No put-env step and no redeploy verb, because there is nothing to
configure -- the static template has no .env and app/htdocs is a read-only
bind mount, so an rsync'd file is live on the next request with no
container recreate and no 502.

The final step asserts the deploy rather than assuming it, including the
negative: the 178 MB of gitignored L0-L3 terrain must 404."
git push
```

- [ ] **Step 3: Dispatch it**

```bash
gh workflow run deploy.yml --repo coder999/ww2airsim; rc=$?
echo "dispatch rc=$rc"
sleep 10
gh run list --repo coder999/ww2airsim --workflow deploy.yml --limit 1
```

- [ ] **Step 4: Watch it to a verdict**

```bash
RUN=$(gh run list --repo coder999/ww2airsim --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN" --exit-status --interval 15; rc=$?
echo "run rc=$rc"
```

Expected: `rc=0`. On failure read the failing step's log before changing anything — the first dispatch is also the end-to-end proof of the deploy key, so an SSH failure here means Task 2, not this workflow.

- [ ] **Step 5: Assert the six spec checks by hand, independently of the workflow**

The workflow asserting itself is necessary but not sufficient — a bug in the assertion passes itself.

```bash
base=https://ww2airsim.marktuttle.dev
EDGE=$(dig +short @1.1.1.1 ww2airsim.marktuttle.dev | head -1)
R="--resolve ww2airsim.marktuttle.dev:443:$EDGE"   # nexus may still cache NXDOMAIN
# Prove curl actually connected before trusting anything else it prints.
curl -sS $R -o /dev/null -w 'status=%{http_code}\n' "$base/"; echo "curl rc=$?"
curl -sSI $R "$base/" | head -1
curl -sSI $R "$base/" | grep -i 'x-robots-tag\|cache-control'
curl -sS  $R "$base/robots.txt"
curl -sSI $R "$base/content/terrain/L4.bin" | grep -i 'HTTP/\|content-length\|cache-control'
curl -sSI $R "$base/content/terrain/tiles/L0.bin" | head -1
curl -sSI "$base/$(curl -sS "$base/" | grep -oP 'assets/[^"]+\.js' | head -1)" | grep -i 'HTTP/\|cache-control'
```

Expected, in order: `200`; `noindex` and `no-cache`; `Disallow: /`; `200` with a non-zero `Content-Length` and `max-age=300`; `404`; `200` with `immutable`.

- [ ] **Step 6: Commit nothing; report the raw output**

Paste each command's actual output into the task report. "All six passed" without the output is not evidence.

---

### Task 6: Documentation, and the finding this first use produced

**Files:**
- Modify: `vps-infra/sites/_template-static/README.md`
- Modify: `ww2airsim/README.md`
- Modify: `ww2airsim/docs/superpowers/specs/2026-09-13-terrain-design.md` (§9 item 2)

**Interfaces:** none.

- [ ] **Step 1: Record the `www` finding in the template, where the next user will read it**

Add to `sites/_template-static/README.md`, in the `vps-infra` worktree:

```markdown
### Subdomains: delete the `www` router

`compose.yml` stamps a `www.{{DOMAIN}}` router unconditionally, which is
right for an apex domain and wrong for a subdomain. For
`foo.example.com` it produces `Host(`www.foo.example.com`)` — four labels
deep, past what a `*.example.com` universal certificate covers, and with no
DNS record behind it. Delete those labels and the matching middleware.

Found on 2026-09-15, this template's first real use (`sites/ww2airsim`).
```

- [ ] **Step 2: Commit and push the template note, then land it on `master`**

```bash
cd ~/projects/vps-infra/.worktrees/ww2airsim-site
git add sites/_template-static/README.md
git commit -m "template-static: say that a subdomain must drop the www router

Found using this template for the first time. The stamped router is right
for an apex domain and impossible for a subdomain, and the failure is
quiet -- Traefik simply never matches it."
git push
cd ~/projects/vps-infra && git push origin ww2airsim-site:master
```

- [ ] **Step 3: Add a Deployment section to `ww2airsim/README.md`**

Point, do not restate — the spec is authoritative:

```markdown
## Deployment

Live at <https://ww2airsim.marktuttle.dev>, a public static site on the OVH
VPS. `noindex`, because it is unfinished.

Deploys are **manual**: `gh workflow run deploy.yml --repo coder999/ww2airsim`.
Pushing `main` releases nothing. The workflow builds, runs `npm run verify`,
rsyncs `dist/`, and then asserts the live site — including that the
gitignored L0–L3 terrain levels return 404.

The design, the facts it rests on and how each was verified are in
[`docs/superpowers/specs/2026-09-15-deployment-design.md`](docs/superpowers/specs/2026-09-15-deployment-design.md).
The VPS side lives in `vps-infra/sites/ww2airsim/`.
```

- [ ] **Step 4: Update the terrain design's open item, whose premise has changed**

§9 item 2 says where terrain is served from "needs no decision until a deploy exists". A deploy now exists. Amend in place with a dated note: the item is now answerable and the answer is "same origin, 703 KB, not worth R2 yet" — do not delete the item, and do not leave it claiming no deploy exists.

- [ ] **Step 5: Verify and commit**

```bash
cd ~/projects/ww2airsim
npm run verify; echo "rc=$?"
git add README.md docs/superpowers/specs/2026-09-13-terrain-design.md
git commit -m "docs: ww2airsim is deployed, and one open item's premise changed

README gains a Deployment section that points at the spec rather than
restating it. The terrain design's Sec 9 item 2 said serving terrain from R2
needed no decision 'until a deploy exists' -- one does now, so the item is
amended in place with what changed and why the answer is still 'not yet',
rather than left asserting something that stopped being true."
```

Expected: `rc=0`, 546 tests.

---

## Verification of the whole plan

The deliverable is a URL. After Task 6, all of the following must hold at once:

1. `https://ww2airsim.marktuttle.dev/` returns `200` over valid TLS.
2. It is flyable in a browser with WebGPU — the acceptance test, and Mark's.
3. `X-Robots-Tag: noindex` on the homepage; `/robots.txt` disallows everything.
4. `/content/terrain/L4.bin` is `200`; `/content/terrain/tiles/L0.bin` is `404`.
5. `gh workflow run deploy.yml` re-deploys, and a red `npm run verify` blocks it.
6. `git -C ~/projects/vps-infra status` shows `master`, clean, with the worktree removed.
