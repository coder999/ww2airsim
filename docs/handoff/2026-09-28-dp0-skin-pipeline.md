# DP0 handoff: skin pipeline and pilot models (2026-09-28)

DP0 is the first plan of the model detail pass. Blender models can now carry a
baked skin: paint, markings, panel lines and pinned CC0 scan detail, in one
atlas. The Ki-84 and the hangar are the two pilots that have one. The design is
[`2026-09-28-model-detail-pass-design.md`](../superpowers/specs/2026-09-28-model-detail-pass-design.md),
and the plan is
[`2026-09-28-dp0-skin-pipeline-pilots.md`](../superpowers/plans/2026-09-28-dp0-skin-pipeline-pilots.md).

The work is complete on branch `worktree-detail-pass` and is **not merged**.
Merging into `main` is Mark's call. The branch forks `main` at `14e05e4`, and
its commits run from `cab87a9` (the spec ruling) to this handoff. No scenario
changed, nothing under `src/sim` changed, and the only `content/` files that
moved are `content/aircraft/ki-84-frank.glb` and `content/buildings/hangar.glb`.

## What shipped

**The pipeline.** A script opts in with `kit.Model(name, skin=<atlas px>)`.
The kit then writes one `TEXCOORD_0` from each part's own parameterization,
packed into one atlas. It smooth-shades lofted surfaces, and it writes a JSON
sidecar beside the glb: the atlas patches, the panel lines it knows from its
own stations and spars, the role colors, and the script's markings. A
TypeScript stage (`tools/models/skin/`) runs first on a skinned entry's raw
glb. It rasterizes the triangles into a texel G-buffer, evaluates paint,
finish, markings, scan wear and a height field per sample, and composes
base-color, metallic-roughness and normal maps, encoded as WebP with the
lockfile's `sharp`. It replaces every role material with one skin material.
An unskinned model takes exactly the old code path, and all 15 other Blender
entries rebuild byte-identically. How to author one:
[`docs/models.md`, "Skins (DP0)"](../models.md#skins-dp0).

**The ruling (Mark, 2026-09-28): one UV set; the detail is baked.** glTF gives
a material one base-color, one normal and one metallic-roughness texture, and
the atlas already needs all three. A second UV set could have carried only a
tiled roughness, so the scans' micro-normals and wear would have needed a
custom runtime shader. There is no `TEXCOORD_1` and no runtime change. The
cost is that micro-detail is limited by the atlas's texel size (below). Scans
are filtered to the texel footprint, so a pattern finer than a texel averages
out instead of aliasing.

**Pinned scans** (Poly Haven 1k JPGs, read 2026-09-28; the MD5s are in the
plan header and pinned in `tools/models/skin/scans.ts`):

| id | Surface | Tile | Mean luminance | Authors | License |
| --- | --- | --- | --- | --- | --- |
| `blue_metal_plate` | painted metal | 2.5 m | 0.2348 | Rob Tuytel | CC0 |
| `worn_corrugated_iron` | corrugated iron | 1.8 m | 0.4666 | Dimitrios Savva (photography), Jenelle van Heerden (processing) | CC0 |
| `concrete_floor_worn_001` | concrete | 3.0 m | 0.3378 | Dimitrios Savva (photography), Rico Cilliers (processing) | CC0 |

`ASSETS.md` credits all three.

**The pilots.** The figures come from the `built …` lines of
`npm run models:build -- ki-84-frank hangar` (rerun 2026-09-28 at `89c691f`;
both rebuilt byte-identically to the committed files) and from each
sidecar's `metersPerPx`:

| id | bytes | triangles (% of budget) | draw calls | atlas | texel | patches |
| --- | --- | --- | --- | --- | --- | --- |
| `ki-84-frank` | 658,932 of 3,000,000 | 18,748 of 60,000 (31.2%) | 5 of 47 | 1024 px | 1.49 cm | 88 |
| `hangar` | 284,916 of 500,000 | 4,316 of 5,000 (86.3%) | 1 of 4 | 512 px | 29.6 cm | 153 |

Before DP0 the Ki-84 was 1,184 triangles in 7 draws, and the hangar 356
triangles in 3. The Ki-84 lands inside the spec's 25-60% triangle target. It
has a fillet-faired fuselage, a framed canopy, flaps, ailerons,
elevators and rudder with hinge gaps, twisted blades, exhaust stacks, guns,
a pitot and an antenna mast, and six hinomaru with white borders, the yellow
inboard leading-edge ID strips, exhaust stains and a landing-light lens. The
hangar has 24-segment roof ribs, windows with frames, and door rails.

The flat-shaded allowlist in `tests/tools/models/skins.test.ts` stands at 19.

## Mark's checkpoint (spec §5)

These are the pilots beside the two downloads they are meant to match: the
Zero (Hangar id `a6m-zero`) and the Hellcat. They were captured on the
reference GPU (RX 6700 XT) in the Hangar on 2026-09-28. Each link is given
twice. The GitHub form works from your work network; `*.marktuttle.dev` does
not.

| Capture | In the repo | On GitHub |
| --- | --- | --- |
| Ki-84, three-quarter | [relative](2026-09-28-dp0-shots/ki-84-frank-three-quarter.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/ki-84-frank-three-quarter.png) |
| Ki-84, side | [relative](2026-09-28-dp0-shots/ki-84-frank-side.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/ki-84-frank-side.png) |
| Ki-84, UV checker | [relative](2026-09-28-dp0-shots/ki-84-frank-three-quarter-checker.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/ki-84-frank-three-quarter-checker.png) |
| Hangar, three-quarter | [relative](2026-09-28-dp0-shots/hangar-three-quarter.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/hangar-three-quarter.png) |
| Hangar, UV checker | [relative](2026-09-28-dp0-shots/hangar-three-quarter-checker.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/hangar-three-quarter-checker.png) |
| Zero, three-quarter | [relative](2026-09-28-dp0-shots/a6m-zero-three-quarter.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/a6m-zero-three-quarter.png) |
| Zero, side | [relative](2026-09-28-dp0-shots/a6m-zero-side.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/a6m-zero-side.png) |
| Hellcat, three-quarter | [relative](2026-09-28-dp0-shots/f6f-hellcat-three-quarter.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/f6f-hellcat-three-quarter.png) |
| Hellcat, side | [relative](2026-09-28-dp0-shots/f6f-hellcat-side.png) | [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/2026-09-28-dp0-shots/f6f-hellcat-side.png) |

What the executor saw, for you to confirm or overrule:
- The markings sit where the script declares them, with no black or garish
  texels and no seams at chart edges. Panel lines read as fine seams.
- **The Ki-84 reads plainer than the worn Zero and Hellcat:** lighter wear and
  fainter panel lines. The chip amount for the green (`ijaGreen`'s `chip` in
  `surfaces.ts`, now 0.01) is the knob.
- **The hangar's walls and roof read smooth.** At 29.6 cm per texel the
  corrugation, about 7.6 cm pitch, averages out by design rather than
  aliasing. A 1024 px atlas would halve the texel and cost bytes against the
  500 KB budget.
- Under the checker, the Ki-84's squares are square on the wings, fuselage,
  fin, tailplane and wheels, with mild stretch only at the cowling's taper.
  The hangar's roof checks stretch down the vault arc toward the springing and
  jump in phase at each rib-bay seam (its shared charts, below).

**The look lives in `tools/models/skin/surfaces.ts` and `layers.ts`.** Any
change you ask for there re-skins both pilots and every later skinned model,
and it moves the golden hashes.

**To see it live:** the worktree's dev-server slot is stopped unless someone
leaves it running (it returned 502 when this was written). Start it from the
worktree with the slot's local `vite.config.ts` edit (`TUNNEL_HOST`
`ww2airsim-2.windomlane.org`, port 5175; never committed), then
`WW2AIRSIM_TUNNEL=1 npx vite --port 5175`. This must print `200` before the
link is worth opening:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/
```

Then open `https://ww2airsim-2.windomlane.org/hangar.html?bench` and tick
"UV checker" to see the charts.

## Sources

Task 1 read every source on 2026-09-28. The Ki-84's markings follow one cited
airframe, Ki-84-Ia s/n 1446 of the 11th Sentai, 2nd Chutai (Vintage Aviation
News, "The Last Surviving Nakajima Ki-84 Hayate"). The fuselage hinomaru's
position is a ratio measured off the airframe's 1970 photo on Wikimedia
Commons. The six-hinomaru count, the 75 mm white border and the yellow ID strip
from the root to a third of the span are CITED from the same article. The
armament is CITED from English Wikipedia's specifications table.

These remain ESTIMATE, and each is an open item:
- the wing hinomaru's span and chord position, and the fuselage hinomaru's
  diameter in meters;
- the ID strip's chordwise width;
- every marking color in `tools/models/skin/colors.ts`. Hinomaru red has a
  candidate citation (FS 31136, Munsell 7.5R 4.5/10, j-aircraft.com's
  "Hinomaru Red" FAQ); no FS or Munsell figure was found for ID yellow;
- the pitot, antenna mast, landing light and exhaust layout (Wikipedia is
  silent; three-view proportions);
- the propeller and spinner colors;
- the 1446 wartime tail marking, "White 46" with a red lightning bolt, which is
  a text-only source with no photo. It is not drawn. The 1970 photo's
  winged-lion crest is a post-restoration display livery, so it is not drawn
  either;
- every hangar figure (sheet width, lap spacing, ribs, windows, eaves, door
  track). The nearest cited figure is the Bellman hangar's 3.81 m rib
  spacing (English Wikipedia), against the script's 3.0 m ESTIMATE.

## Tier 1

All captured as `rc=$?` directly, 2026-09-28. The plan's baseline, at
`14e05e4`, was rc=0 with 297 files, 3,371 passed and 13 skipped.

| Run | Where | rc | Files | Passed | Skipped |
| --- | --- | --- | --- | --- | --- |
| `remote-run npm run verify` at `89c691f` | ryzen | 0 | 305 | 3,498 | 2 |
| `remote-run npm run verify` with this commit's changes | nexus (ryzen was full, so remote-run overflowed) | 0 | 305 | 3,491 | 10 |
| `npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1` | nexus | 0 | 8 | 110 | 0 |

The ryzen run's two skips are `formationCover.test.ts`'s `it.skip` (the
Plan 7f attacker geometry, documented in the file) and `bathyBuild.test.ts`'s
cached-data check. The nexus run prints no per-file skip names; its 10 are
under the baseline's 13, and its test count is the ryzen run's plus this
commit's one new manifest test. No known flake fired, so nothing was rerun.
The Blender suites rebuild all 17 Blender entries byte-identically to the
committed files, both skinned pilots included. The skin suites and the
pilots' rebuilds also matched on ryzen (Tasks 7 and 12), so the skin is
byte-stable across both machines.

## Tier 2

Run 2026-09-28 on the reference GPU (the desktop's RX 6700 XT, through the
console-session Playwright server), against slot `ww2airsim-2`. The final run
came after the debug-view fix (`89c691f`): `adapter` + `hangar` specs rc=0,
21 passed.

| Check | Ki-84 | Hangar |
| --- | --- | --- |
| Flat predecessor's luminance (`main`'s glbs, `tests/e2e/fixtures/flat-luminance.json`) | 0.0862 | 0.1154 |
| 15: skinned luminance vs the flat predecessor | 1.102x | 0.983x |
| 16: UV checker off / on / off | 0.0950 / 0.2409 / 0.0950 | 0.1135 / 0.2417 / 0.1135 |
| 5: lighting vs the Wildcat | 1.053x | — |
| 10: triangles / draws on screen | 18,748 / 5 | 4,316 / 1 |

Convoy Strike's Tier 2 is DP2's (spec §6). DP0 changes no scenario, so it was
not run.

## Open

- **DP1** (Ki-21, B-29, P-38), **DP2** (the kit's inward-winding fix, the
  ships, and box projection for the 4 untextured downloads), **DP3** (the 9
  other buildings; then the flat-shaded allowlist is deleted). None started.
- The in-game airfield swap stays a later decision (spec §8 Q4).
- UV stretch that the checker shows: the hangar roof's shared charts stretch
  along the vault arc and jump in phase at each rib-bay seam; the Ki-84's
  cowling taper stretches mildly; loft charts lose texel density around small
  rings (about 2.5x at a tapering fuselage tail).
- The marking colors are still ESTIMATE (above).
- Text markings (tail codes, hull numbers) are not drawn by DP0's marking
  kinds. DP1 (the B-29's tail letters) and DP2 (hull numbers) need a
  stroke-font marking. Charts are not all one handedness (planar, loft and
  vault-inner differ), which a chart-space font must handle.
- Every chart samples the scan from the same origin, so a scan feature repeats
  at the same relative spot on each chart (now fine flecks, barely visible). A
  per-patch scan offset would decorrelate it, and would move both pilots'
  bytes.
- The rivet ridge refills a panel-line groove by about 21% at coarse sample
  spacing. The Ki-84's samples are fine enough to be unaffected, and the
  hangar has no rivets.
- Four-neighbor dilation leaves patch corners a neutral gray, which mipmaps
  may blend in at chart corners.
- There is no environment map in `src/render`, so a metallic texel renders
  near-black away from the sun's highlight. The chips are sparse enough not
  to matter; a natural-metal skin will need one.
- DP2 must adapt `shipMaterials` before a ship can be skinned. It zeroes every
  `metallicFactor`, and the skin material needs 1. The manifest now refuses
  `skin` on a ship (this commit).

## Departures

The ledger's `Ruling:` lines, summarized (the ledger is gitignored at
`.superpowers/sdd/2026-09-28-dp0-skin-pipeline-pilots/progress.md`):

- **Texel figures were wrong in the plan and the spec.** "About 12 cm on the
  hangar at 512 px" could not hold: the hangar's visible and hidden faces need
  about 0.21-0.25 m per texel even perfectly packed. With one chart per face it
  measured 0.432 m. The kit gained `with m.shared_chart():` (one chart per tag
  and role for small uniform fittings), which brought it to 0.296 m. This
  commit corrects the spec's §4 ruling text (1.5 cm and 30 cm, measured) and
  the comment in `layers.ts`.
- **Grid laps are band-limited:** a lap grid under 4 texels (`GRID_MIN_TEXELS`)
  is not drawn, so the hangar's 0.8 m sheet laps drop out and its 2.4 m end
  laps stay.
- **Chips take the scan's brightest texels, not its darkest.** The darkest 6%
  of `blue_metal_plate` are meter-wide stains, which drew black blotches on
  the Ki-84 in the first captures. The chip fractions dropped (green 0.06 to
  0.01; underside and dark 0.03 and 0.02 to 0.005, ESTIMATE, by eye).
- The hangar's ribs use 24 segments, matching the roof, so they embed
  0.020-0.024 m instead of floating or sinking by ±1.5 cm. If bytes ever
  overflow, drop the rib count, not the segments.
- A skinned barrel vault's shells are smooth-shaded, like a loft's sides.
- Loft cap charts on marked Ki-84 parts are shared. No marking reaches a cap,
  and it bought 0.0149 m per texel instead of 0.0161.
- The hangar's coplanar test was renamed to say what it checks (a centroid
  z-fight heuristic). A true polygon-overlap test is deferred; the one
  partial overlap it misses is buried inside the wall.
- The Hangar's debug views go through one `applyDebugViews`, so wireframe,
  UV checker and unlit toggle in any order. The checker repeats 8x per atlas,
  mipmapped.
- No wartime tail crest is drawn (above).
- Task 4's wrap test compares to 1e-9 rather than exactly (0.3 and 1.3 scaled
  by 64 differ in the last bit).
- The ledger lives in the SDD workspace path above, not the plan's
  `.superpowers/sdd/2026-09-28-dp0-skin/`.
- There are 17 Blender entries, not the 14 or 16 the plan's text says.
- Task 8's change of the hangar to `skin: true` broke `build.test.ts`'s
  plain-hangar case. That was fixed in Task 10 (`fd838c9`).
- `__pycache__/` is gitignored (importing `kit.py` outside Blender makes one).
