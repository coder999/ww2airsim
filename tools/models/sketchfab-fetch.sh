#!/usr/bin/env bash
# Download a Sketchfab model by uid into the gitignored candidates folder,
# with a <name>.sketchfab.json sidecar recording uid, author, license and
# fetch time (the same shape ASSETS.md's "Candidate models" rows cite).
#
#   tools/models/sketchfab-fetch.sh <uid> <name>   # writes content/models/candidates/<name>.glb
#
# Auth: the Sketchfab API token in 1Password (vault hal9000, item
# sketchfab-api, field credential) -- the same key nexus's Blender Sketchfab
# add-on uses. It is read into a variable and never printed. Verified
# 2026-09-25: /v3/models/<uid>/download returned 200 for d701787b... (A6M2).
# Downloading proves nothing about the license: vet it per ASSETS.md before
# anything is promoted out of candidates/.
set -euo pipefail
uid=${1:?usage: sketchfab-fetch.sh <uid> <name>}
name=${2:?usage: sketchfab-fetch.sh <uid> <name>}
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
out="$root/content/models/candidates"
mkdir -p "$out"

tok=$(op read 'op://hal9000/sketchfab-api/credential')
[ -n "$tok" ] || { echo "sketchfab-fetch: empty token from op" >&2; exit 1; }
links=$(curl -fsS -H "Authorization: Token $tok" "https://api.sketchfab.com/v3/models/$uid/download")
unset tok
url=$(jq -r '.glb.url // empty' <<<"$links")
[ -n "$url" ] || { echo "sketchfab-fetch: no .glb offered for $uid" >&2; exit 1; }
curl -fsS -o "$out/$name.glb" "$url"

curl -fsS "https://api.sketchfab.com/v3/models/$uid" | jq --arg t "$(date -u +%FT%TZ)" \
  '{uid, name, author: .user.username, license: .license.slug, licenseLabel: .license.label, faceCount, viewerUrl, fetched: $t}' \
  > "$out/$name.sketchfab.json"
echo "sketchfab-fetch: OK $out/$name.glb ($(stat -c %s "$out/$name.glb") bytes), license $(jq -r .license "$out/$name.sketchfab.json")"
