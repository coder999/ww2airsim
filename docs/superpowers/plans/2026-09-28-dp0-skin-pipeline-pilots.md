# DP0: Skin pipeline and pilot models — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Blender kit analytic UVs and a vector-instruction export, add a deterministic TypeScript stage that bakes a per-model atlas (paint, markings, panel lines, and pinned CC0 scan detail) into base-color, metallic-roughness and normal maps, and bring two pilots, the **Ki-84** and the **hangar**, to the full bar.

**Architecture:** A script opts in with `kit.Model(name, skin=<atlas px>)`. The kit then:
- writes one `TEXCOORD_0` from each part's own parameterization, packed into one atlas;
- smooth-shades lofted surfaces;
- writes a JSON sidecar beside the glb. It lists the atlas patches, the panel lines the kit knows from its own stations and spars, the role colors, and the markings the script declares in model coordinates.

A new pipeline stage, `skinDocument`, runs before any other stage on a skinned Blender entry's raw glb. It rasterizes the triangles into a texel G-buffer (position, normal, role, patch). It evaluates paint, finish, markings, scan wear and a height field per sample, and composes three maps. It encodes them with `sharp` as WebP and replaces every role material with one skin material. The existing `join` then collapses the model to one draw plus its articulated parts. An unskinned model takes exactly today's code path, so its bytes do not change.

**Tech Stack:** Python in Blender 5.0.1 headless (`tools/models/blender/run.ts`), TypeScript, glTF-Transform 4.5.0, sharp 0.35.4 (libwebp and libjpeg-turbo pinned by the lockfile), zod, Vitest in Node, three 0.186 `WebGPURenderer`, and Playwright Tier 2 on the Windows desktop's RX 6700 XT.

**Spec:** `docs/superpowers/specs/2026-09-28-model-detail-pass-design.md`, all of it, **including the 2026-09-28 §4 ruling: one UV set, with the detail layer baked into the atlas and no `TEXCOORD_1`**. Also read before starting:
- the R0/R1 handoffs, `docs/handoff/2026-09-26-m0-blender-kit.md` and `docs/handoff/2026-09-26-r1-roster-pipeline.md` (byte identity and the Blender runner);
- the R3 handoff, `docs/handoff/2026-09-27-r3-aircraft-models.md` (the aircraft kit and the rig tests);
- the R4/R5 handoff, `docs/handoff/2026-09-28-r4-r5-roster.md` (building parts, and the inward-winding note);
- `docs/models.md`, "Authoring in Blender";
- `tools/models/generated/paint.ts` and `mesh.ts` (O1: the byte-stable `sharp` precedent this plan extends).

## Mark's decisions for this plan (2026-09-28, recorded as given)

- **Where it runs:** worktree `~/projects/ww2airsim-worktrees/detail-pass`, branch `worktree-detail-pass`, created 2026-09-28 from `main` at `14e05e4` (R4/R5 merged, so the spec's precondition holds). It has its own `node_modules`, and `tools/terrain/cache` and `content/terrain/tiles` are symlinks to the main checkout's (both gitignored). **One executor at a time.** The branch may be pushed. **Merging into `main` needs Mark's OK.** Never push `main`, merge into it, or deploy.
- **Attendance: unattended.** Run to completion without waiting for Mark. His viewing is the §5 checkpoint on the pilots' captures in the handoff, emailed as HTML. It is not a gate, and nothing here waits on it.
- **Viewing checkpoint: the final product only.** That is the pilots' captures beside the Zero and the Hellcat (spec §5), in the handoff (Task 12 Step 5, Task 13 Step 4).
- **Skin layers (2026-09-28):** one atlas on `TEXCOORD_0`; the scan detail is baked into it (spec §4 ruling). No `TEXCOORD_1`, and no runtime shader change.
- **§8 rulings (all as recommended):** the 4 untextured downloaded ships join the pass (DP2, not here); worn finish; one cited airframe per aircraft type for markings, or ESTIMATE; no airfield swap; Q5 superseded by the ruling above.
- **Sources:** every figure in a script is CITED (source and read date) or labeled ESTIMATE. No citation is invented.
- **US spelling** in prose. The existing identifiers stay as they are.

## Where DP0 starts (read on `worktree-detail-pass` at `cab87a9`, 2026-09-28)

- **Baseline:** `remote-run npm run verify` returned rc=0: 297 files, 3371 passed, 13 skipped (170 s).
- **The kit** (`tools/models/blender/kit.py`, 669 lines) keeps `self._nodes[key] = [role, verts, faces]`, where `key` is a named node or `f'{name}_{role}'`. `export()` makes one Blender object per key and one material per role (`_material`: sRGB PALETTE to linear, metallic 0, roughness 0.85). It exports with `export_texcoords=False` and `export_normals=True`, and every polygon is flat-shaded, because `from_pydata` defaults to `use_smooth = False`.
- **Lofts:** `fuselage`, `wing`, `fin`, `revolve` and `propeller`'s spinner all go through `_loft(rings)`, which returns `(face, ring edge j)` pairs: the side quads s-major, then two caps. `_emit` splits a loft's faces between an upper and a lower role. `wing` mirrors through `_mirror_z`.
- **Pilots today:**
  - `content/aircraft/ki-84-frank.glb`: 7 nodes, 4 materials, 0 textures, **1,184 triangles** (2% of 60,000), 7 draw calls. `textures.maxSize` 512, `maxBytes` 3,000,000.
  - `content/buildings/hangar.glb`: nodes `hangar_concrete`, `hangar_steel` and `hangar_dark`, **356 triangles**, 3 draw calls, 0 textures. Budget 5,000 triangles / 4 draws / 500,000 bytes.
- **The pipeline** (`tools/models/build.ts`) for a Blender entry runs `runBlenderScript(script, tools/models/cache/<id>.glb)`, then `runPipeline`. The stages, in order: yaw, remove, split, simplify, (collapse, pivot, normalize), ship fit, dedup, join, `compressTextures` (re-encodes **every** texture as WebP through `textureCompress`), opaque, prune, provenance. `checkOutput` enforces bytes, triangles, draws, `maxTextureSize` and the required extensions (only `EXT_texture_webp` is allowed).
- **Runtime:** `GLTFLoader` gives `MeshStandardMaterial`. No `TANGENT` attribute is exported, so three.js derives tangents per pixel from the UV derivatives. That handles mirrored charts, and GLTFLoader flips `normalScale.y` for glTF's convention. The Hangar's `applyUnlit` already copies `map`.
- **Tests that pin today's state:**
  - `tests/tools/models/blender/hangar.test.ts:67-73` builds the hangar **straight from Blender** and pins `m.textures === 0` with at most 4 draws. It stays true of the raw output even when skinned, because textures are added by the TS stage. Task 8 therefore replaces it with the raw output's new contract: UVs and a sidecar.
  - `tests/tools/models/buildingModels.test.ts:75` pins `textures === 0` for the **nine R4 buildings only** (`R4_BUILDINGS`, which does not include the hangar). DP0 leaves it alone. DP3 replaces it.
  - `tests/tools/models/blenderEntries.test.ts` rebuilds **every** Blender entry and compares SHA-256 with the committed output. This is the guard that the kit's opt-in changes do not move the 14 unskinned entries.
- **Pinned scans (read from `api.polyhaven.com/files/<id>` on 2026-09-28; 1k JPGs, `dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_<map>_1k.jpg`):**

  | id | Surface | Tile | diff MD5 | nor_gl MD5 | rough MD5 | Authors |
  | --- | --- | --- | --- | --- | --- | --- |
  | `blue_metal_plate` (O1's `PAINTED_METAL`, reused) | painted metal | 2.5 m | a906d0e554596fb76c6969f2f644c5e6 | f14c0f01832f8b18c39f07e4b5d6f749 | 76c3911d8ad2416e4db3104a2ef831c7 | Rob Tuytel |
  | `worn_corrugated_iron` | corrugated iron | 1.8 m | dee4306e2c337afcb3a815eb3345c7bd | b1fdf9a7fa3ca2764fe1621a6bdea0db | 78ed19c7b13281d6bfcf12fc9ee27dc3 | Dimitrios Savva (photography), Jenelle van Heerden (processing) |
  | `concrete_floor_worn_001` | concrete | 3.0 m | e35597cca586150b1ab2aa9a331a39c5 | 9de6626758f8793b71182b892c110827 | b158eae73029ac6a849481274a0e1b35 | Dimitrios Savva (photography), Rico Cilliers (processing) |

  All three are CC0. Planking and sandbag are DP2/DP3's to pin.

## Global Constraints

- Blender is exactly **5.0.1** (`BLENDER_VERSION`). A Blender run goes through `runBlenderScript` only.
- **An unskinned model's bytes do not change.** Every kit addition is opt-in (`skin=None` default, new keyword arguments defaulting to today's behavior). `blenderEntries.test.ts` stays green for all 14 unskinned entries at every commit.
- **Determinism:** no randomness, fixed iteration order, sorted keys. The TS stage's per-sample math uses only `+ - * /`, `Math.sqrt`, `Math.floor`, `Math.round`, `Math.min`, `Math.max`, `Math.abs` and lookup tables. `**` (pow) appears only where `colors.ts` builds those tables, once. It never uses `Math.random`, `Date`, or map/set iteration over unsorted keys. Every skinned entry rebuilds byte-identically on nexus **and** on ryzen (the rebuild test runs under `remote-run` too).
- `sharp` is pinned by the lockfile. Every WebP is written by `sharp(...).webp({ quality })` with a fixed quality. The golden test names the sharp version it was made with.
- **One UV set.** Skinned outputs have `TEXCOORD_0` and **no** `TEXCOORD_1`.
- **Map sizes:** 1024 px atlases for aircraft, 512 px for buildings (spec §4). The entry's `textures.maxSize` rises to match; `maxBytes` does **not** rise ("every family stays inside its existing maxBytes budget").
- **Budgets:**
  - Ki-84: 60,000 triangles / 47 draws / 3,000,000 bytes.
  - Hangar: 5,000 triangles / 4 draws / 500,000 bytes.

  Raising a building budget needs a measured reason in `RAISED` (the existing rule), and DP0 does not expect to.
- **Triangle target:** the Ki-84 lands at **25-60% of 60,000** (15,000-36,000). This is reported, not tested (spec §3).
- **Allowed required extensions:** only `EXT_texture_webp`.
- The skin material is `metallicFactor 1`, `roughnessFactor 1`, `baseColorFactor [1,1,1,1]`, opaque, and its textures carry the values (O1's convention).
- **No coplanar overlapping faces** in a skinned model. Two faces of one material can now show different atlas texels, so a coincident face would z-fight in paint. Additions embed by at least 0.02 m, or clear by at least 0.01 m. They never touch flush.
- **Tier 2 runs on the reference GPU** (the desktop RX 6700 XT, through `playwright run-server` in Mark's console session). A worktree uses a free dev slot: `ww2airsim-2` (port 5175) or `ww2airsim-3` (port 5174). The `vite.config.ts` edit is local scratch and never committed.
- `npm run verify` runs through `remote-run`. On nexus run only the files you touch, with `--maxWorkers=2` at most (nexus OOM, 2026-09-25). Capture `rc=$?` directly, never through a grep.
- **Never `git clean -fdx`** (275 MB of terrain data).

## Review Focus

These are the inputs and failure modes the spec implies but no task's happy-path test would catch, most likely first. Each one is pinned by a test in the task named.

1. **An unskinned model's bytes move.** A kit edit leaks into the default path: a new default argument, a changed helper, or the export flags. *Expected:* all 14 other Blender entries rebuild byte-identically. Pinned by Task 2 Step 7 and by every later task's run of `blenderEntries.test.ts`.
2. **The normal map's handedness is flipped,** so panel lines read as raised ridges lit from the wrong side. *Expected:* the texels just above a groove (smaller v) tilt toward it, green < 128; those just below, green > 128. Pinned by Task 6's groove test, and by eye in Task 12's captures.
3. **Sub-texel detail aliases into moiré,** because corrugation (about 7.6 cm pitch) is sampled at the hangar's roughly 12 cm texels. *Expected:* a scan sampled at a footprint larger than its period returns within 2% of its mean. Pinned by Task 4's footprint test.
4. **Chart edges bleed under mipmapping,** so a hinomaru's red or the underside gray shows as a seam line on the upper skin. *Expected:* every texel within `paddingPx` of a patch is filled from **that** patch. None is filled from a neighbor, and no covered texel is black. Pinned by Task 6's dilation test.
5. **A marking paints the wrong face.** A wing-top hinomaru shows through on the underside, or a fuselage band paints the wing root that shares its role. *Expected:* a disc with axis +y paints no texel whose normal has y < 0.35, and `tags` restricts a marking to its parts. Pinned by Task 6's facing and tag tests.

---

## File map

| File | Responsibility |
| --- | --- |
| `tools/models/blender/kit.py` (modify) | `Model(name, skin=None)`; charts per face; the shelf packer; UV layer; smooth shading; panel lines from lofts; `tagged()`; `marking()`; the sidecar; the aircraft detail parts (Task 9) |
| `tools/models/blender/run.ts` (modify) | deletes a stale sidecar before each run |
| `tools/models/skin/sidecar.ts` (create) | `skinSidecarPath`, the zod `SidecarSchema`, `parseSidecar` |
| `tools/models/skin/colors.ts` (create) | `MARKING_COLORS` (sRGB 0-255), the sRGB/linear LUTs |
| `tools/models/skin/surfaces.ts` (create) | `ROLE_SURFACE`: scan, roughness, metallic, fade, chip, rivets and scan-normal strength per palette role |
| `tools/models/skin/scans.ts` (create) | the three pinned scans, `loadScan`, `scanFromChannels`, `sampleScan` (footprint-filtered) |
| `tools/models/skin/raster.ts` (create) | `trianglesOf(doc, sidecar)`, `rasterize(tris, samples)`: the texel G-buffer |
| `tools/models/skin/layers.ts` (create) | per-sample paint, finish, markings, grid laps, panel lines, rivets, height |
| `tools/models/skin/compose.ts` (create) | downsample, dilation, height to normal, whiteout blend, the byte maps |
| `tools/models/skin/stage.ts` (create) | `renderSkinMaps`, `skinDocument` (before the pipeline), `attachSkinTextures` (after `compressTextures`) |
| `tools/models/manifest.ts` (modify) | `skin: true` (Blender entries only) |
| `tools/models/build.ts` (modify) | `BuildDeps.readText`; the skin branch; `runPipeline(…, skin)` |
| `tools/models/blender/hangar.py`, `ki-84-frank.py` (modify) | the pilots |
| `tools/models/entries/hangar.json`, `ki-84-frank.json` (modify) | `"skin": true`; Ki-84 `textures.maxSize` 1024 |
| `src/render/hangar/stage.ts`, `bench.ts`, `main.ts` (modify) | the UV checker debug toggle |
| `tests/tools/models/blender/fixtures/kit_skin_probe.py` (create) | Blender probe for charts, UVs, smoothing, sidecar |
| `tests/tools/models/blender/kitSkin.test.ts` (create) | the probe's assertions |
| `tests/tools/models/blender/kitDetail.test.ts` + `fixtures/kit_detail_probe.py` (create) | Task 9's aircraft detail parts |
| `tests/tools/models/skin/*.test.ts` (create) | sidecar, scans, raster, layers, compose, golden |
| `tests/tools/models/skins.test.ts` (create) | the flat-shaded allowlist and the skinned-output contract |
| `tests/e2e/hangar.spec.ts` (modify) + `tests/e2e/fixtures/flat-luminance.json` (create) | check 15: skinned luminance vs flat predecessor; check 16: UV checker |

---

### Task 0: Preconditions, ledger and baseline (setup, no commit)

**Files:**
- Create: `.superpowers/sdd/2026-09-28-dp0-skin/progress.md` (gitignored ledger)

- [ ] **Step 1: Confirm the worktree and that `main` has not moved under it.**
  ```bash
  cd ~/projects/ww2airsim-worktrees/detail-pass
  git status --short; git branch --show-current
  git fetch -q origin && git log --oneline HEAD..origin/main | head
  ```
  Expected: clean, `worktree-detail-pass`. If `origin/main` has new commits that touch `tools/models/` or `content/aircraft|buildings`, rebase onto it (`git rebase origin/main`), then re-run Step 3. Record the result in the ledger.

- [ ] **Step 2: Confirm the symlinks and the tools.**
  ```bash
  readlink tools/terrain/cache content/terrain/tiles
  blender --version | head -1
  node -e "import('sharp').then(s=>console.log(s.default.versions))"
  ```
  Expected: both symlinks point into `~/projects/ww2airsim/`; `Blender 5.0.1`; the sharp versions object. Record the `vips` and `webp` versions in the ledger. Task 6's golden test names them.

- [ ] **Step 3: Baseline.** Already taken at `14e05e4` on 2026-09-28: `remote-run npm run verify` rc=0, 3371 passed, 13 skipped. Re-run only if Step 1 rebased:
  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"
  ```

- [ ] **Step 4: Start the ledger** `.superpowers/sdd/2026-09-28-dp0-skin/progress.md` with: the worktree path, branch, base commit, the baseline counts, the sharp/vips/webp versions, and a `## Rulings` heading. Every departure from this plan is appended there as `Ruling: <what>, because <measured reason>`.

---

### Task 1: Sources for the pilots (research, ledger only, no commit)

**Files:**
- Modify: `.superpowers/sdd/2026-09-28-dp0-skin/progress.md`

- [ ] **Step 1: The Ki-84's cited airframe (spec §8 Q3).** Find one photographed Ki-84-Ia with identifiable markings. Search for:
  - English Wikipedia "Nakajima Ki-84 Hayate" (the lead photo and its Commons page);
  - Wikimedia Commons "Category:Nakajima Ki-84";
  - the surviving airframe at the Chiran Peace Museum (ex-Planes of Fame, s/n 1446).

  Record in the ledger: the unit (sentai), the serial or tail marking, the photograph's URL and read date, and what it shows:
  - hinomaru positions and diameters, with or without a white surround;
  - the yellow wing leading-edge ID strips (the inboard extent);
  - any fuselage band;
  - the tail marking, and the propeller and spinner color.

  Do not guess. If no photograph settles a figure, write `ESTIMATE` with the reason. Wikipedia's lead image, the 1446 airframe as restored, is an acceptable fallback source for positions. Name it as such.

- [ ] **Step 2: The Ki-84's cited armament and fittings.** From the same Wikipedia page, "Specifications (Ki-84-Ia)", Armament: record the gun count, caliber and location (cowling or wing). Record anything the article says about the pitot, antenna mast, landing light or exhausts. Everything it is silent on is an ESTIMATE, from the three-view proportions.

- [ ] **Step 3: Marking colors.** Record a cited source for the hinomaru red and the IJAAF ID yellow if one is found (a published FS 595 cross-reference, with URL). Otherwise keep this plan's `MARKING_COLORS` values, which are labeled ESTIMATE.

- [ ] **Step 4: The hangar's added features.** None of these are cited in the repo, so each is an ESTIMATE, recorded as such:
  - corrugated sheet width 0.8 m and end-lap spacing 2.4 m;
  - rib spacing 3.0 m, rib depth 0.06 m;
  - windows: 1.2 × 0.9 m at a 3.2 m sill, one per 4 m of wall;
  - eave overhang 0.35 m;
  - a door track over the opening.

  If a period Butler or Quonset-type hangar drawing is found with a figure, cite it and replace the estimate.

- [ ] **Step 5:** Append `Task 1 done` and a one-line summary per source to the ledger. There is no commit: the figures land in the scripts' headers in Tasks 8 and 10.

---

### Task 2: The kit writes charts, UVs, smooth shading and a sidecar (opt-in)

**Files:**
- Modify: `tools/models/blender/kit.py`
- Modify: `tools/models/blender/run.ts`
- Create: `tests/tools/models/blender/fixtures/kit_skin_probe.py`
- Create: `tests/tools/models/blender/kitSkin.test.ts`
- Modify: `tests/tools/models/blender/run.test.ts`

**Interfaces:**
- Produces (Python):
  - `kit.Model(name, skin=None)`, where `skin` is `None` or one of `SKIN_SIZES = (512, 1024, 2048)`;
  - `Model.tagged(tag)`, a context manager that tags every chart the enclosed calls create;
  - `Model.marking(kind, **fields)`, which appends to the sidecar's `markings`;
  - `Model._part(role, verts, faces, node, charts=None, smooth=False)`;
  - `Model._loft_charts(rings) -> (charts, side_key, U, V)`;
  - `Model._planar_charts(verts, faces) -> charts`;
  - `Model._line(chart, axis, at, lo, hi, kind)`.
- Produces (file): for `out.glb`, when `skin` is set, `out.skin.json`. Its shape is the one Task 3's `SidecarSchema` validates:
  `{version:1, model, atlasPx, paddingPx, metersPerPx, roles:{role:[r,g,b] sRGB 0-1}, patches:[{id, tag, rect:[x,y,w,h] px, originM:[u0,v0]}], lines:[{patch, axis:'u'|'v', atM, fromM, toM, kind:'panel'|'hinge'}], markings:[…]}`
- Produces (TS): `skinSidecarPath(glb: string): string`, exported from `tools/models/blender/run.ts`. Task 3 re-exports it from `tools/models/skin/sidecar.ts`.
- UV convention: patch rect `(x, y, w, h)` in atlas pixels, y down from the top (image rows). A chart coordinate `(u, v)` in meters lands at pixel `(x + (u - u0)/mpp, y + (v - v0)/mpp)`. glTF `TEXCOORD_0 = pixel / atlasPx`. The kit writes Blender's UV as `(px/W, 1 - py/W)`, and the exporter flips v back.

- [ ] **Step 1: Write the probe script** `tests/tools/models/blender/fixtures/kit_skin_probe.py`:
  ```python
  # A skinned probe (DP0 Task 2): one box, one fuselage, one mirrored wing, one barrel vault, a marking.
  import os
  import sys

  sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
  import kit  # noqa: E402

  out, _opts = kit.cli_args()
  m = kit.Model('sp', skin=512)
  with m.tagged('slab'):
      m.box('concrete', (0.0, -0.3, 0.0), (6.0, 0.3, 4.0))
  with m.tagged('fuselage'):
      m.fuselage('ijaGreen', [(-4.0, 0.2, 0.3, 1.5), (0.0, 0.6, 0.7, 1.5), (3.0, 0.4, 0.5, 1.5)], segments=16, lower_role='underside')
  with m.tagged('wing'):
      m.wing('ijaGreen', 0.8, 1.2, 1.8, 1.0, 8.0, dihedral_deg=5.0, lower_role='underside')
  with m.tagged('vault'):
      m.barrel_vault('steel', (0.0, 0.0, -8.0), 6.0, 1.5, 4.0, 0.2, 12)
  m.marking('disc', tags=['wing'], center=(0.0, 1.5, 2.5), axis=(0.0, 1.0, 0.0), radiusM=0.4, color='hinomaruRed')
  m.export(out)
  ```
  Check the path depth: the probe lives five levels below the repo root (`tests/tools/models/blender/fixtures/`). The existing `kit_aircraft_probe.py` shows the exact `sys.path` line used there; copy it verbatim if it differs from the above.

- [ ] **Step 2: Write the failing test** `tests/tools/models/blender/kitSkin.test.ts`:
  ```ts
  // tests/tools/models/blender/kitSkin.test.ts
  import { beforeAll, describe, expect, it } from 'vitest'
  import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
  import { createHash } from 'node:crypto'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import type { Document, Primitive } from '@gltf-transform/core'
  import { HAVE_BLENDER, runBlenderScript, skinSidecarPath } from '../../../../tools/models/blender/run.js'
  import { findNode, modelIO } from '../../../../tools/models/document.js'

  const PROBE = 'tests/tools/models/blender/fixtures/kit_skin_probe.py'
  const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
  interface Patch { id: number; tag: string; rect: [number, number, number, number]; originM: [number, number] }
  interface Side { version: number; model: string; atlasPx: number; paddingPx: number; metersPerPx: number; roles: Record<string, number[]>; patches: Patch[]; lines: { patch: number; axis: string; atM: number; fromM: number; toM: number; kind: string }[]; markings: { kind: string }[] }

  const prims = (doc: Document): Primitive[] => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())

  // Builds in beforeAll, never in the describe body (kit.test.ts says why).
  describe.skipIf(!HAVE_BLENDER)('the kit skin path (DP0 Task 2)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp0-skin-'))
    const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
    let doc: Document
    let side: Side
    beforeAll(async () => {
      runBlenderScript(PROBE, a)
      runBlenderScript(PROBE, b)
      doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
      side = JSON.parse(readFileSync(skinSidecarPath(a), 'utf8')) as Side
    }, 120_000)

    it('rebuilds byte-identically, glb and sidecar', () => {
      expect(sha(b)).toBe(sha(a))
      expect(sha(skinSidecarPath(b))).toBe(sha(skinSidecarPath(a)))
    })

    it('every primitive has TEXCOORD_0 inside [0, 1], and none has TEXCOORD_1', () => {
      for (const p of prims(doc)) {
        const uv = p.getAttribute('TEXCOORD_0')
        expect(uv, 'TEXCOORD_0').not.toBeNull()
        expect(p.getAttribute('TEXCOORD_1')).toBeNull()
        for (let i = 0; i < uv!.getCount(); i++) {
          const [u, v] = uv!.getElement(i, [0, 0])
          expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1)
          expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1)
        }
      }
    })

    it('the sidecar: version 1, 512 px, padding 4, the roles used, and patches that never overlap, padding included', () => {
      expect([side.version, side.model, side.atlasPx, side.paddingPx]).toEqual([1, 'sp', 512, 4])
      expect(Object.keys(side.roles).sort()).toEqual(['concrete', 'ijaGreen', 'steel', 'underside'])
      const pad = side.paddingPx
      const grown = side.patches.map((p) => [p.rect[0] - pad, p.rect[1] - pad, p.rect[0] + p.rect[2] + pad, p.rect[1] + p.rect[3] + pad] as const)
      for (const [x0, y0, x1, y1] of grown) { expect(x0).toBeGreaterThanOrEqual(0); expect(y0).toBeGreaterThanOrEqual(0); expect(x1).toBeLessThanOrEqual(512); expect(y1).toBeLessThanOrEqual(512) }
      for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) {
        const [a0, a1, a2, a3] = grown[i]!, [b0, b1, b2, b3] = grown[j]!
        expect(a2 <= b0 || b2 <= a0 || a3 <= b1 || b3 <= a1, `patches ${i} and ${j} overlap`).toBe(true)
      }
      expect(new Set(side.patches.map((p) => p.tag))).toEqual(new Set(['slab', 'fuselage', 'wing', 'vault']))
    })

    it('one texel density: the fuselage side chart is as long in pixels as the fuselage is in meters, over metersPerPx', () => {
      const fus = side.patches.filter((p) => p.tag === 'fuselage').sort((p, q) => q.rect[2] * q.rect[3] - p.rect[2] * p.rect[3])[0]!
      // Station centroids run from x=-4 to x=3 on one line, so the chart's u extent is 7 m.
      expect(Math.abs(fus.rect[2] - Math.ceil(7 / side.metersPerPx))).toBeLessThanOrEqual(1)
    })

    it('a vertex lands at its chart pixel: the slab top corner maps inside the slab-top patch', () => {
      const slab = findNode(doc, 'sp_concrete').getMesh()!.listPrimitives()[0]!
      const pos = slab.getAttribute('POSITION')!, uv = slab.getAttribute('TEXCOORD_0')!
      const rects = side.patches.filter((p) => p.tag === 'slab').map((p) => p.rect)
      for (let i = 0; i < pos.getCount(); i++) {
        const [u, v] = uv.getElement(i, [0, 0])
        const px = u! * 512, py = v! * 512
        expect(rects.some(([x, y, w, h]) => px >= x - 1e-3 && px <= x + w + 1e-3 && py >= y - 1e-3 && py <= y + h + 1e-3), `uv ${u},${v}`).toBe(true)
      }
    })

    it('lofts are smooth-shaded: the fuselage has far fewer distinct normals than it would flat', () => {
      const p = findNode(doc, 'sp_ijaGreen').getMesh()!.listPrimitives()[0]!
      const n = p.getAttribute('NORMAL')!
      const distinct = new Set<string>()
      for (let i = 0; i < n.getCount(); i++) distinct.add(n.getElement(i, [0, 0, 0]).map((x) => x.toFixed(3)).join(','))
      const tris = p.getIndices()!.getCount() / 3
      expect(distinct.size).toBeLessThan(tris * 0.75)
    })

    it('panel lines: one per interior authored fuselage station, and two spars per wing surface per half', () => {
      const fusPatch = side.patches.filter((p) => p.tag === 'fuselage').sort((p, q) => q.rect[2] * q.rect[3] - p.rect[2] * p.rect[3])[0]!
      expect(side.lines.filter((l) => l.patch === fusPatch.id && l.axis === 'u').length).toBe(1)
      const wingSides = side.patches.filter((p) => p.tag === 'wing').sort((p, q) => q.rect[2] * q.rect[3] - p.rect[2] * p.rect[3]).slice(0, 2)
      for (const w of wingSides) expect(side.lines.filter((l) => l.patch === w.id && l.axis === 'v').length).toBe(4)
    })

    it('markings pass through as declared', () => {
      expect(side.markings).toEqual([{ kind: 'disc', tags: ['wing'], center: [0, 1.5, 2.5], axis: [0, 1, 0], radiusM: 0.4, color: 'hinomaruRed' }])
    })

    it('a model without skin writes no sidecar and no TEXCOORD_0 (the unskinned path is unchanged)', async () => {
      const out = join(dir, 'plain.glb')
      runBlenderScript('tests/tools/models/blender/fixtures/kit_probe.py', out)
      expect(existsSync(skinSidecarPath(out))).toBe(false)
      const plain = await modelIO().readBinary(new Uint8Array(readFileSync(out)))
      for (const p of prims(plain)) expect(p.getAttribute('TEXCOORD_0')).toBeNull()
    })
  })
  ```

- [ ] **Step 3: Run it to verify it fails.**
  ```bash
  npx vitest run tests/tools/models/blender/kitSkin.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: FAIL, on the missing `skinSidecarPath` export (a TypeScript import error) or on `Model() got an unexpected keyword argument 'skin'`.

- [ ] **Step 4: `run.ts` deletes a stale sidecar.** Add below `BLENDER_VERSION`:
  ```ts
  /** The skin sidecar a skinned script writes beside its glb (DP0). */
  export function skinSidecarPath(glb: string): string {
    if (!glb.endsWith('.glb')) throw new Error(`skinSidecarPath: ${glb} is not a .glb`)
    return `${glb.slice(0, -4)}.skin.json`
  }
  ```
  In `runBlenderScript`, after `rmSync(out, { force: true })`, add:
  ```ts
    // A stale sidecar would skin this run's glb with another run's atlas (DP0).
    if (out.endsWith('.glb')) rmSync(skinSidecarPath(out), { force: true })
  ```
  Add to `tests/tools/models/blender/run.test.ts`:
  ```ts
  it('skinSidecarPath sits beside the glb and refuses anything else (DP0)', () => {
    expect(skinSidecarPath('tools/models/cache/hangar.glb')).toBe('tools/models/cache/hangar.skin.json')
    expect(() => skinSidecarPath('x.gltf')).toThrow(/not a \.glb/)
  })
  ```
  Import `skinSidecarPath` there.

- [ ] **Step 5: The kit.** Make these edits to `tools/models/blender/kit.py`. Every one is inert when `skin is None`.

  (a) Imports and constants, after `import sys`:
  ```python
  import contextlib
  import json
  ```
  and after `AIRFOIL_STATIONS`:
  ```python
  # Skins (DP0, model-detail-pass spec §4). Atlas sizes a script may ask for: 1024 for aircraft
  # and ships, 512 for buildings. Padding keeps mipmaps from bleeding one patch into the next.
  SKIN_SIZES = (512, 1024, 2048)
  SKIN_PADDING_PX = 4
  # Edges sharper than this stay hard on a smooth-shaded skinned model (trailing edges, caps).
  SHARP_DEG = 50.0
  # Spar lines drawn on every wing and fin surface, as chord fractions (ESTIMATE: period practice).
  SPARS = (0.2, 0.65)
  ```

  (b) Geometry helpers, after `_cross`:
  ```python
  def _sub(a, b):
      return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


  def _dot(a, b):
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


  def _dist(a, b):
      return math.sqrt(_dot(_sub(a, b), _sub(a, b)))


  def _newell(points):
      """A polygon's (unnormalized) normal, robust for any planar polygon."""
      n = [0.0, 0.0, 0.0]
      for i, p in enumerate(points):
          q = points[(i + 1) % len(points)]
          n[0] += (p[1] - q[1]) * (p[2] + q[2])
          n[1] += (p[2] - q[2]) * (p[0] + q[0])
          n[2] += (p[0] - q[0]) * (p[1] + q[1])
      return tuple(n)


  def _shelf_pack(sizes, mpp, width, pad):
      """Charts {key: (w m, h m)} into a width x width atlas at mpp meters per pixel: tallest
      first (ties by key), left to right in shelves. {key: (x, y, w px, h px)}, or None if they
      do not fit."""
      px = {k: (max(1, math.ceil(w / mpp)), max(1, math.ceil(h / mpp))) for k, (w, h) in sizes.items()}
      order = sorted(px, key=lambda k: (-px[k][1], k))
      placed, x, y, shelf = {}, 0, 0, 0
      for k in order:
          w, h = px[k]
          if w + 2 * pad > width:
              return None
          if x + w + 2 * pad > width:
              x, y, shelf = 0, y + shelf, 0
          if y + h + 2 * pad > width:
              return None
          placed[k] = (x + pad, y + pad, w, h)
          x += w + 2 * pad
          shelf = max(shelf, h + 2 * pad)
      return placed
  ```

  (c) `Model.__init__` and the chart registry:
  ```python
  class Model:
      def __init__(self, name, skin=None):
          _require(skin is None or skin in SKIN_SIZES, f'skin must be None or one of {SKIN_SIZES}, got {skin!r}')
          self.name = name
          self.skin = skin
          self._nodes = {}  # node name -> [role, verts, faces, face charts, face smooth]
          self._charts = {}  # chart key (int, creation order) -> tag
          self._lines = []  # (chart key, axis, at, lo, hi, kind), chart-local meters
          self._markings = []
          self._tag = 'part'

      @contextlib.contextmanager
      def tagged(self, tag):
          """Every chart made inside is tagged `tag`, so a marking can name the parts it paints."""
          _require(isinstance(tag, str) and tag, f'tagged: tag must be a nonempty string, got {tag!r}')
          prev, self._tag = self._tag, tag
          try:
              yield
          finally:
              self._tag = prev

      def marking(self, kind, **fields):
          """A marking for the skin stage, in model coordinates (tools/models/skin/sidecar.ts validates it)."""
          _require(kind in ('disc', 'polygon', 'slab', 'grid'), f'marking: unknown kind {kind!r}')
          self._markings.append({'kind': kind, **{k: list(v) if isinstance(v, tuple) else v for k, v in fields.items()}})

      def _new_chart(self):
          key = len(self._charts)
          self._charts[key] = self._tag
          return key

      def _line(self, chart, axis, at, lo, hi, kind='panel'):
          if self.skin:
              self._lines.append((chart, axis, at, lo, hi, kind))

      def _planar_charts(self, verts, faces):
          """One chart per face, projected on its own plane: u along its first edge, v = n x u."""
          out = []
          for f in faces:
              p = [verts[i] for i in f]
              u = _unit(next(_sub(q, p[0]) for q in p[1:] if _dist(q, p[0]) > 1e-9))
              v = _cross(_unit(_newell(p)), u)
              out.append((self._new_chart(), tuple((_dot(_sub(q, p[0]), u), _dot(_sub(q, p[0]), v)) for q in p)))
          return out

      def _loft_charts(self, rings):
          """Charts for _loft's faces, in its order: one chart for every side quad (u = distance
          along the ring centroids, v = each ring's own arc-length fraction x the longest ring's
          perimeter), then a planar chart per cap. Returns (charts, side key, U, V)."""
          count = len(rings[0])
          cent = [tuple(sum(p[i] for p in r) / count for i in range(3)) for r in rings]
          U = [0.0]
          for s in range(1, len(rings)):
              U.append(U[-1] + _dist(cent[s - 1], cent[s]))
          arcs = []
          for r in rings:
              c = [0.0]
              for j in range(count):
                  c.append(c[-1] + _dist(r[j], r[(j + 1) % count]))
              arcs.append(c)
          pmax = max(c[-1] for c in arcs)
          V = [[pmax * c[j] / c[-1] for j in range(count + 1)] for c in arcs]
          side = self._new_chart()
          charts = []
          for s in range(len(rings) - 1):
              for j in range(count):
                  charts.append((side, ((U[s], V[s][j]), (U[s], V[s][j + 1]), (U[s + 1], V[s + 1][j + 1]), (U[s + 1], V[s + 1][j]))))
          verts = [p for ring in rings for p in ring]
          last = (len(rings) - 1) * count
          charts.extend(self._planar_charts(verts, [tuple(reversed(range(count))), tuple(last + j for j in range(count))]))
          return charts, side, U, V

      def _mirror_charts(self, charts):
          """The z-mirror of `charts`: new keys with the same tags, corners reversed as _mirror_z
          reverses windings, and the lines on the old keys copied onto the new."""
          remap = {}
          for key, _ in charts:
              if key not in remap:
                  remap[key] = len(self._charts)
                  self._charts[remap[key]] = self._charts[key]
          for (k, axis, at, lo, hi, kind) in list(self._lines):
              if k in remap:
                  self._lines.append((remap[k], axis, at, lo, hi, kind))
          return [(remap[k], tuple(reversed(uvs))) for k, uvs in charts]
  ```

  (d) `_part` carries charts and smoothing (replace the method):
  ```python
      def _part(self, role, verts, faces, node, charts=None, smooth=False):
          if role not in PALETTE:
              raise ValueError(f'unknown role {role!r}; palette roles are {sorted(PALETTE)}')
          key = node or f'{self.name}_{role}'
          entry = self._nodes.setdefault(key, [role, [], [], [], []])
          if entry[0] != role:
              raise ValueError(f'node {key!r} already has role {entry[0]!r}, not {role!r}')
          base = len(entry[1])
          entry[1].extend(verts)
          entry[2].extend(tuple(base + i for i in f) for f in faces)
          if self.skin:
              charts = self._planar_charts(verts, faces) if charts is None else charts
              _require(len(charts) == len(faces), f'{key}: {len(charts)} charts for {len(faces)} faces')
              entry[3].extend(charts)
              entry[4].extend(smooth if isinstance(smooth, list) else [smooth] * len(faces))
  ```

  (e) `_emit` carries them through its role split (replace the method):
  ```python
      def _emit(self, role, verts, faces, node, lower_role=None, lower_node=None, is_lower=None, charts=None, smooth=None):
          """Adds (face, j) pairs to ``node``; with ``lower_role``, faces whose ring edge
          ``is_lower`` go to ``lower_node`` in that role instead (caps stay with ``role``).
          ``charts`` and ``smooth`` (skinned models only) run parallel to ``faces``."""
          groups = [(role, node, [i for i, (f, j) in enumerate(faces) if lower_role is None or j is None or not is_lower(j)])]
          if lower_role is not None:
              groups.append((lower_role, lower_node, [i for i, (f, j) in enumerate(faces) if j is not None and is_lower(j)]))
          for r, nd, ids in groups:
              fs = [faces[i][0] for i in ids]
              used = sorted({i for f in fs for i in f})
              index = {old: new for new, old in enumerate(used)}
              self._part(r, [verts[i] for i in used], [tuple(index[i] for i in f) for f in fs], nd,
                         None if charts is None else [charts[i] for i in ids],
                         False if smooth is None else [smooth[i] for i in ids])
  ```
  The groups keep today's face order, so the unskinned output is unchanged: `ids` enumerates `faces` in the same order as the old list comprehension.

  (f) Lofts request charts when skinned. In `fuselage`, replace the last two lines with:
  ```python
          verts, faces = _loft(rings)
          quarter = segments // 4
          charts = smooth = None
          if self.skin:
              charts, side, U, V = self._loft_charts(rings)
              smooth = [j is not None for _, j in faces]
              for s in range(1, len(rings) - 1):
                  self._line(side, 'u', U[s], 0.0, V[s][-1])
          self._emit(role, verts, faces, node, lower_role, lower_node, lambda j: quarter <= j < 3 * quarter, charts, smooth)
  ```
  Task 9 adds `subdivide`, which draws lines only at the authored stations. Until then every interior ring is authored.

  In `wing`, replace from `verts, faces = _loft(rings)` to the end with:
  ```python
          verts, faces = _loft(rings)
          lower = lambda j: j >= len(AIRFOIL_STATIONS) - 1  # noqa: E731
          charts = smooth = None
          if self.skin:
              charts, side, U, V = self._loft_charts(rings)
              smooth = [j is not None for _, j in faces]
              self._spar_lines(side, U, V, _section_labels(AIRFOIL_STATIONS))
          self._emit(role, verts, faces, node, lower_role, lower_node, lower, charts, smooth)
          if mirror:
              mverts, mfaces = _mirror_z(verts, faces)
              self._emit(role, mverts, mfaces, node, lower_role, lower_node, lower,
                         None if charts is None else self._mirror_charts(charts), smooth)
  ```
  and add a module function after `_airfoil`, and the method:
  ```python
  def _section_labels(stations):
      """(chord fraction, 'u' or 'l') for each point of _airfoil's ring, in ring order: the upper
      surface leading edge to trailing edge, then the lower back (both edges are single points)."""
      return [(f, 'u') for f in stations] + [(f, 'l') for f in reversed(stations[1:-1])]
  ```
  ```python
      def _spar_lines(self, side, U, V, labels):
          """A spanwise line on the upper and the lower surface at each SPARS chord fraction, at the
          section point nearest it (within 0.1 chord, else that spar is not on this piece), along
          the whole side chart. `labels` is the ring's (fraction, surface) list."""
          upper = [(f, i) for i, (f, sfc) in enumerate(labels) if sfc == 'u' and 0 < f < 1]
          for spar in SPARS:
              if not upper:
                  return
              f, _i = min(upper, key=lambda fi: (abs(fi[0] - spar), fi[1]))
              if abs(f - spar) > 0.1:
                  continue
              for j, (g, _sfc) in enumerate(labels):
                  if g == f:
                      self._line(side, 'v', V[0][j], U[0], U[-1])
  ```
  With `AIRFOIL_STATIONS` this finds 0.15 for the 0.2 spar and 0.75 for the 0.65 spar, each on both surfaces: four lines per side chart, as the probe test expects.
  In `fin`, charts come from the unrotated rings (distances are rotation-invariant):
  ```python
          verts, faces = _loft(rings)
          charts = smooth = None
          if self.skin:
              charts, side, U, V = self._loft_charts(rings)
              smooth = [j is not None for _, j in faces]
              self._spar_lines(side, U, V, _section_labels(AIRFOIL_STATIONS))
          # Stand the panel up: (x, y, z) -> (x, z, -y) is a rotation, so windings hold.
          verts = [(x, root_y + z, center_z - y) for x, y, z in verts]
          self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)
  ```
  In `revolve`:
  ```python
          verts, faces = _loft(rings)
          charts = smooth = None
          if self.skin:
              charts, _side, _U, _V = self._loft_charts(rings)
              smooth = [j is not None for _, j in faces]
          self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)
  ```

  (g) `barrel_vault` gets analytic charts (outer and inner: u = z from the -z rim, v = arc length) and the rims planar. Replace its face loop and `_part` call with:
  ```python
          f = []
          for i in range(n):
              f.append((o0 + i, o0 + i + 1, o1 + i + 1, o1 + i))      # outer, faces out
              f.append((i0 + i, i1 + i, i1 + i + 1, i0 + i + 1))      # inner, faces the axis
              f.append((o0 + i, i0 + i, i0 + i + 1, o0 + i + 1))      # rim at -z
              f.append((o1 + i, o1 + i + 1, i1 + i + 1, i1 + i))      # rim at +z
          charts = None
          if self.skin:
              def arc(rx, ry):
                  c = [0.0]
                  for i in range(n):
                      c.append(c[-1] + _dist(ring(math.pi * i / n, rx, ry, 0.0), ring(math.pi * (i + 1) / n, rx, ry, 0.0)))
                  return c
              so, si = arc(width / 2, rise), arc(width / 2 - thickness, rise - thickness)
              outer, inner = self._new_chart(), self._new_chart()
              rims = self._planar_charts(v, [f[4 * i + 2] for i in range(n)] + [f[4 * i + 3] for i in range(n)])
              charts = []
              for i in range(n):
                  charts.append((outer, ((0.0, so[i]), (0.0, so[i + 1]), (length, so[i + 1]), (length, so[i]))))
                  charts.append((inner, ((0.0, si[i]), (length, si[i]), (length, si[i + 1]), (0.0, si[i + 1]))))
                  charts.append(rims[i])
                  charts.append(rims[n + i])
          self._part(role, v, f, node, charts)
  ```

  (h) `export` writes UVs, smoothing and the sidecar only when skinned. Replace the method:
  ```python
      def _pack(self):
          """(meters per pixel, chart boxes, placements): the smallest uniform texel size, in 3%
          steps from the area estimate, at which every chart shelf-packs into the atlas."""
          box = {}
          for key in sorted(self._nodes):
              for ck, uvs in self._nodes[key][3]:
                  b = box.setdefault(ck, [math.inf, math.inf, -math.inf, -math.inf])
                  for u, v in uvs:
                      b[0], b[1], b[2], b[3] = min(b[0], u), min(b[1], v), max(b[2], u), max(b[3], v)
          sizes = {ck: (b[2] - b[0], b[3] - b[1]) for ck, b in box.items()}
          area = sum(max(w, 1e-3) * max(h, 1e-3) for w, h in sizes.values())
          mpp = math.sqrt(area / (0.6 * self.skin * self.skin))
          for _ in range(400):
              placed = _shelf_pack(sizes, mpp, self.skin, SKIN_PADDING_PX)
              if placed is not None:
                  return mpp, box, placed
              mpp *= 1.03
          raise ValueError(f'{self.name}: {len(sizes)} charts do not pack into {self.skin} px')

      def export(self, path):
          unread = sorted(_given - _read)
          if unread:
              raise ValueError(f'unknown argument --{unread[0]}; this model reads {sorted(_read) or "none"}')
          packed = self._pack() if self.skin else None
          bpy.ops.wm.read_factory_settings(use_empty=True)
          scene = bpy.context.scene
          root = bpy.data.objects.new(self.name, None)
          scene.collection.objects.link(root)
          for key in sorted(self._nodes):
              role, verts, faces, charts, smooth = self._nodes[key]
              me = bpy.data.meshes.new(key)
              me.from_pydata([(vx, -vz, vy) for vx, vy, vz in verts], [], faces)
              me.validate()
              me.update()
              if packed is not None:
                  self._write_uvs(me, key, faces, charts, smooth, packed)
              me.materials.append(_material(role))
              ob = bpy.data.objects.new(key, me)
              scene.collection.objects.link(ob)
              ob.parent = root
          bpy.ops.export_scene.gltf(
              filepath=path, export_format='GLB', export_yup=True, export_apply=True,
              export_animations=False, export_cameras=False, export_lights=False,
              export_extras=False, export_materials='EXPORT', use_selection=False,
              export_texcoords=packed is not None, export_normals=True,
          )
          if packed is not None:
              self._write_sidecar(path, packed)

      def _write_uvs(self, me, key, faces, charts, smooth, packed):
          mpp, box, placed = packed
          w = self.skin
          _require(len(me.polygons) == len(faces), f'{key}: Blender dropped {len(faces) - len(me.polygons)} degenerate faces; fix the part')
          layer = me.uv_layers.new(name='UVMap')
          for poly, (ck, uvs), sm in zip(me.polygons, charts, smooth):
              x0, y0, _w, _h = placed[ck]
              u0, v0 = box[ck][0], box[ck][1]
              for li, (u, v) in zip(poly.loop_indices, uvs):
                  layer.data[li].uv = ((x0 + (u - u0) / mpp) / w, 1.0 - (y0 + (v - v0) / mpp) / w)
              poly.use_smooth = sm
          me.set_sharp_from_angle(angle=math.radians(SHARP_DEG))

      def _write_sidecar(self, path, packed):
          mpp, box, placed = packed
          _require(path.endswith('.glb'), f'export: a skinned model writes a .glb, got {path}')
          side = {
              'version': 1, 'model': self.name, 'atlasPx': self.skin, 'paddingPx': SKIN_PADDING_PX, 'metersPerPx': mpp,
              'roles': {r: list(PALETTE[r]) for r in sorted({e[0] for e in self._nodes.values()})},
              'patches': [{'id': k, 'tag': self._charts[k], 'rect': list(placed[k]), 'originM': [box[k][0], box[k][1]]} for k in sorted(placed)],
              'lines': [{'patch': k, 'axis': a, 'atM': at, 'fromM': lo, 'toM': hi, 'kind': kind} for k, a, at, lo, hi, kind in self._lines],
              'markings': self._markings,
          }
          with open(path[:-4] + '.skin.json', 'w', encoding='utf-8') as fh:
              json.dump(side, fh, sort_keys=True, separators=(',', ':'))
  ```
  **The unskinned path is unchanged:** `packed` is `None`, `_write_uvs` and `_write_sidecar` are skipped, and `export_texcoords=False` as before. The only reordering, computing `packed` before `read_factory_settings`, touches no Blender state.

  Rim faces in `barrel_vault` come from `self._planar_charts(v, …)`, where `v` is the vault's own vertex list. It must be the list `_part` receives.

- [ ] **Step 6: Run the kit tests.**
  ```bash
  npx vitest run tests/tools/models/blender --maxWorkers=1; echo "rc=$?"
  ```
  Expected: rc=0. `kitSkin.test.ts` passes, and `kit.test.ts`, `kitAircraft.test.ts`, `kitBuildings.test.ts`, `hangar.test.ts` and `run.test.ts` still pass unchanged. If `set_sharp_from_angle` is missing, `dir(bpy.types.Mesh)` in Blender 5.0.1 names the replacement. Record a `Ruling:` and use it.

- [ ] **Step 7: The 14 unskinned entries are byte-identical.**
  ```bash
  npx vitest run tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: rc=0, every entry rebuilding to its committed SHA. Any mismatch means an edit leaked into the default path (Review Focus 1). Find it. Never re-commit a glb here.

- [ ] **Step 8: Commit.**
  ```bash
  git add tools/models/blender/kit.py tools/models/blender/run.ts tests/tools/models/blender/fixtures/kit_skin_probe.py tests/tools/models/blender/kitSkin.test.ts tests/tools/models/blender/run.test.ts
  git commit -m "DP0: the kit writes charts, UVs, smooth shading and a skin sidecar, opt-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---
### Task 3: The skin's data: sidecar schema, marking colors, role surfaces, the manifest flag

**Files:**
- Create: `tools/models/skin/colors.ts`
- Create: `tools/models/skin/sidecar.ts`
- Create: `tools/models/skin/surfaces.ts`
- Modify: `tools/models/manifest.ts`
- Create: `tests/tools/models/skin/sidecar.test.ts`
- Modify: `tests/tools/models/manifest.test.ts`

**Interfaces:**
- Consumes: the sidecar shape from Task 2; `skinSidecarPath` from `tools/models/blender/run.ts`.
- Produces:
  - `MARKING_COLORS: Record<MarkingColor, readonly [number, number, number]>` (sRGB 0-255);
  - `type MarkingColor`, `MARKING_COLOR_NAMES`;
  - `SRGB8_TO_LINEAR: Float64Array` (256), `linearToSrgb8(l: number): number`, `srgbToLinear(c: number): number`.
  - `SidecarSchema`, `type Sidecar`, `type Marking`, `parseSidecar(text: string): Sidecar` (schema plus the semantic checks below), `skinSidecarPath` re-exported.
  - `type ScanId = 'painted-metal' | 'corrugated-iron' | 'concrete'`;
  - `interface Surface { scan: ScanId | null; roughness: number; metallic: number; fade: number; chip: number; rivets: boolean; scanNormal: number }`;
  - `ROLE_SURFACE: Readonly<Record<string, Surface>>`;
  - `surfaceFor(role: string): Surface`, which throws naming the role.
  - `ModelEntry.skin?: true`, allowed on `blender` entries only.

- [ ] **Step 1: Write the failing tests** `tests/tools/models/skin/sidecar.test.ts`:
  ```ts
  // tests/tools/models/skin/sidecar.test.ts
  import { describe, expect, it } from 'vitest'
  import { parseSidecar } from '../../../../tools/models/skin/sidecar.js'
  import { linearToSrgb8, MARKING_COLORS, SRGB8_TO_LINEAR } from '../../../../tools/models/skin/colors.js'
  import { ROLE_SURFACE, surfaceFor } from '../../../../tools/models/skin/surfaces.js'

  const base = {
    version: 1, model: 'sp', atlasPx: 512, paddingPx: 4, metersPerPx: 0.05,
    roles: { ijaGreen: [0.29, 0.33, 0.21] },
    patches: [{ id: 0, tag: 'wing', rect: [4, 4, 100, 50], originM: [0, 0] }, { id: 1, tag: 'fuselage', rect: [112, 4, 60, 60], originM: [-1, 0] }],
    lines: [{ patch: 0, axis: 'v', atM: 0.4, fromM: 0, toM: 5, kind: 'panel' }],
    markings: [{ kind: 'disc', tags: ['wing'], center: [0, 1, 2], axis: [0, 1, 0], radiusM: 0.4, color: 'hinomaruRed' }],
  }
  const text = (o: unknown): string => JSON.stringify(o)

  describe('parseSidecar (DP0)', () => {
    it('accepts a well-formed sidecar and fills marking defaults', () => {
      const s = parseSidecar(text(base))
      expect(s.markings[0]).toMatchObject({ effect: 'paint', opacity: 1, featherM: 0 })
    })
    it.each([
      ['an unknown marking color', { ...base, markings: [{ ...base.markings[0], color: 'pink' }] }, /color/],
      ['a marking tag no patch has', { ...base, markings: [{ ...base.markings[0], tags: ['wnig'] }] }, /tag "wnig"/],
      ['a line on a missing patch', { ...base, lines: [{ ...base.lines[0], patch: 9 }] }, /patch 9/],
      ['a patch outside the atlas', { ...base, patches: [{ id: 0, tag: 'wing', rect: [500, 4, 100, 50], originM: [0, 0] }] }, /outside/],
      ['two patches with one id', { ...base, patches: [base.patches[0], { ...base.patches[1], id: 0 }] }, /id 0 twice/],
      ['a zero axis', { ...base, markings: [{ ...base.markings[0], axis: [0, 0, 0] }] }, /axis/],
      ['a slab with from >= to', { ...base, markings: [{ kind: 'slab', tags: ['wing'], axis: 'x', fromM: 2, toM: 1, color: 'idYellow' }] }, /fromM/],
      ['a grid with no spacing', { ...base, markings: [{ kind: 'grid', tags: ['wing'], spacingM: [null, null, null], widthM: 0.01, depth: 0.5 }] }, /spacing/],
      ['an unknown key', { ...base, extra: 1 }, /extra/],
    ])('refuses %s', (_label, raw, message) => {
      expect(() => parseSidecar(text(raw))).toThrow(message)
    })
  })

  describe('colors and surfaces (DP0)', () => {
    it('sRGB tables round-trip every byte', () => {
      for (let i = 0; i < 256; i++) expect(linearToSrgb8(SRGB8_TO_LINEAR[i]!)).toBe(i)
    })
    it('every marking color is an sRGB byte triple', () => {
      for (const c of Object.values(MARKING_COLORS)) for (const v of c) expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true)
    })
    it('every pilot role has a surface, and an unknown role is refused by name', () => {
      for (const r of ['ijaGreen', 'underside', 'dark', 'glazing', 'naturalMetal', 'steel', 'concrete']) expect(ROLE_SURFACE[r], r).toBeDefined()
      expect(() => surfaceFor('timber')).toThrow(/timber/)
    })
  })
  ```
  Add to `tests/tools/models/manifest.test.ts`, inside `describe('ModelEntrySchema', …)`:
  ```ts
    it('skin: true is a Blender entry\'s alone (DP0)', () => {
      const hangar = JSON.parse(readFileSync('tools/models/entries/hangar.json', 'utf8')) as Record<string, unknown>
      expect(parseModelEntry({ ...hangar, skin: true }).skin).toBe(true)
      expect(() => parseModelEntry({ ...valid, split: [], remove: [], skin: true })).toThrow(/skin/)
    })
  ```

- [ ] **Step 2: Run them to verify they fail.**
  ```bash
  npx vitest run tests/tools/models/skin/sidecar.test.ts tests/tools/models/manifest.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL (modules not found; `skin` an unknown key).

- [ ] **Step 3: `tools/models/skin/colors.ts`.**
  ```ts
  // tools/models/skin/colors.ts
  /**
   * Marking colors for the skin stage (DP0), sRGB 0-255. Every value is an ESTIMATE unless its
   * comment cites a source (Task 1 of the DP0 plan replaces an estimate only with a citation).
   * The palette roles' own colors are not here: the kit writes them into each sidecar, so
   * kit.py's PALETTE stays their one source.
   */
  export const MARKING_COLORS = {
    hinomaruRed: [0xb3, 0x24, 0x2a], // ESTIMATE: a faded IJAAF hinomaru red
    insigniaWhite: [0xe6, 0xe4, 0xdc], // ESTIMATE: off-white, weathered
    idYellow: [0xe0, 0xa8, 0x1e], // ESTIMATE: IJAAF leading-edge identification yellow
    exhaustSoot: [0x2a, 0x26, 0x22], // ESTIMATE
    walkwayDark: [0x33, 0x33, 0x30], // ESTIMATE
    lensClear: [0xc8, 0xd4, 0xdc], // ESTIMATE: a landing-light cover
  } as const satisfies Record<string, readonly [number, number, number]>

  export type MarkingColor = keyof typeof MARKING_COLORS
  export const MARKING_COLOR_NAMES = Object.keys(MARKING_COLORS).sort() as [MarkingColor, ...MarkingColor[]]

  export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

  /** Built once: the per-texel math is table lookups, so no transcendental runs per sample. */
  export const SRGB8_TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255))
  const STEPS = 65536
  const TO_SRGB8 = Uint8Array.from({ length: STEPS + 1 }, (_, i) => {
    const l = i / STEPS
    return Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255)
  })
  export const linearToSrgb8 = (l: number): number => TO_SRGB8[Math.round(Math.min(1, Math.max(0, l)) * STEPS)]!
  ```
  The round trip in Step 1 needs 65,536 steps: at 4,096, bytes 1-3 collide in the dark end.

- [ ] **Step 4: `tools/models/skin/sidecar.ts`.**
  ```ts
  // tools/models/skin/sidecar.ts
  import { z } from 'zod'
  import { MARKING_COLOR_NAMES } from './colors.js'
  export { skinSidecarPath } from '../blender/run.js'

  const finite = z.number().finite()
  const vec3 = z.tuple([finite, finite, finite])
  const axis3 = vec3.refine((v) => Math.hypot(...v) > 1e-9, { message: 'axis must be a nonzero vector' })
  const tags = z.array(z.string().min(1)).min(1)
  /** What a marking does to the texels it covers: paint over, wear (lighter, rougher), or stain. */
  const common = {
    tags,
    color: z.enum(MARKING_COLOR_NAMES),
    effect: z.enum(['paint', 'wear', 'stain']).default('paint'),
    opacity: z.number().gt(0).lte(1).default(1),
    /** Soft edge width, meters; 0 = a hard (antialiased) edge. */
    featherM: z.number().min(0).default(0),
  }
  const Disc = z.object({ kind: z.literal('disc'), center: vec3, axis: axis3, radiusM: z.number().positive(), ...common }).strict()
  /** A 2D polygon in the plane through `origin` normal to `axis`; `uDir` is its u axis, v = axis x u. */
  const Polygon = z.object({ kind: z.literal('polygon'), origin: vec3, axis: axis3, uDir: axis3, points: z.array(z.tuple([finite, finite])).min(3), ...common }).strict()
  /** Everything between two planes normal to a model axis (a fuselage band). No facing test. */
  const Slab = z.object({ kind: z.literal('slab'), axis: z.enum(['x', 'y', 'z']), fromM: finite, toM: finite, ...common }).strict()
    .refine((s) => s.fromM < s.toM, { message: 'fromM must be < toM', path: ['fromM'] })
  /** World-aligned sheet laps: a groove wherever a coordinate crosses a multiple of its spacing. */
  const Grid = z.object({
    kind: z.literal('grid'), tags,
    spacingM: z.tuple([z.number().positive().nullable(), z.number().positive().nullable(), z.number().positive().nullable()])
      .refine((s) => s.some((v) => v !== null), { message: 'spacing needs at least one axis' }),
    /** Groove width, meters; depth in groove units (a panel line is 1: see layers.ts). */
    widthM: z.number().positive(), depth: z.number().positive(),
  }).strict()
  const Marking = z.union([Disc, Polygon, Slab, Grid])

  export const SidecarSchema = z.object({
    version: z.literal(1),
    model: z.string().min(1),
    atlasPx: z.union([z.literal(512), z.literal(1024), z.literal(2048)]),
    paddingPx: z.number().int().positive(),
    metersPerPx: z.number().positive(),
    roles: z.record(z.string(), z.tuple([finite, finite, finite])),
    patches: z.array(z.object({
      id: z.number().int().nonnegative(), tag: z.string().min(1),
      rect: z.tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()]),
      originM: z.tuple([finite, finite]),
    }).strict()).min(1),
    lines: z.array(z.object({
      patch: z.number().int().nonnegative(), axis: z.enum(['u', 'v']), atM: finite, fromM: finite, toM: finite, kind: z.enum(['panel', 'hinge']),
    }).strict()),
    markings: z.array(Marking),
  }).strict()

  export type Sidecar = z.infer<typeof SidecarSchema>
  export type Marking = Sidecar['markings'][number]

  /** The schema, then what it cannot say: ids unique, rects inside the atlas, every line on a
   *  patch that exists, and every marking tag on some patch (a typo would paint nothing). */
  export function parseSidecar(text: string): Sidecar {
    const s = SidecarSchema.parse(JSON.parse(text))
    const ids = new Set<number>()
    for (const p of s.patches) {
      if (ids.has(p.id)) throw new Error(`sidecar ${s.model}: patch id ${p.id} twice`)
      ids.add(p.id)
      const [x, y, w, h] = p.rect
      if (x < 0 || y < 0 || x + w > s.atlasPx || y + h > s.atlasPx) throw new Error(`sidecar ${s.model}: patch ${p.id} rect ${p.rect.join(',')} is outside the ${s.atlasPx} px atlas`)
    }
    for (const l of s.lines) if (!ids.has(l.patch)) throw new Error(`sidecar ${s.model}: a line names patch ${l.patch}, which does not exist`)
    const known = new Set(s.patches.map((p) => p.tag))
    for (const m of s.markings) for (const t of m.tags) if (!known.has(t)) throw new Error(`sidecar ${s.model}: a ${m.kind} marking names tag "${t}", which no patch has (tags: ${[...known].sort().join(', ')})`)
    return s
  }
  ```
  If the repo's zod rejects `.refine` inside `z.union` for `Slab`, use `z.discriminatedUnion` over the unrefined objects, and check `fromM < toM` in `parseSidecar` with the same message. Record which one you used.

- [ ] **Step 5: `tools/models/skin/surfaces.ts`.**
  ```ts
  // tools/models/skin/surfaces.ts
  /**
   * How each palette role weathers (DP0; model-detail-pass spec §4, §8 Q2: worn). These are the
   * shared look: a change here re-skins every skinned model on its next build (spec §5).
   * Every number is an ESTIMATE, chosen by eye on the DP0 pilots.
   *   scan        the pinned CC0 scan its micro-normal, wear and roughness come from (null: none)
   *   roughness   base roughness before the scan's variation
   *   metallic    0 paint, 1 bare metal
   *   fade        chalking toward a lighter gray on sky-facing surfaces, 0-1
   *   chip        fraction of the scan's darkest texels that show bare metal through the paint
   *   rivets      draw rivet rows beside its panel lines
   *   scanNormal  the scan normal's strength, 0-1
   */
  export type ScanId = 'painted-metal' | 'corrugated-iron' | 'concrete'
  export interface Surface {
    readonly scan: ScanId | null
    readonly roughness: number
    readonly metallic: number
    readonly fade: number
    readonly chip: number
    readonly rivets: boolean
    readonly scanNormal: number
  }

  export const ROLE_SURFACE: Readonly<Record<string, Surface>> = {
    ijaGreen: { scan: 'painted-metal', roughness: 0.62, metallic: 0, fade: 0.18, chip: 0.06, rivets: true, scanNormal: 0.6 },
    underside: { scan: 'painted-metal', roughness: 0.58, metallic: 0, fade: 0.04, chip: 0.03, rivets: true, scanNormal: 0.6 },
    naturalMetal: { scan: 'painted-metal', roughness: 0.35, metallic: 1, fade: 0, chip: 0, rivets: true, scanNormal: 0.4 },
    dark: { scan: 'painted-metal', roughness: 0.55, metallic: 0, fade: 0.05, chip: 0.02, rivets: false, scanNormal: 0.5 },
    glazing: { scan: null, roughness: 0.08, metallic: 0, fade: 0, chip: 0, rivets: false, scanNormal: 0 },
    steel: { scan: 'corrugated-iron', roughness: 0.7, metallic: 0, fade: 0.1, chip: 0.04, rivets: false, scanNormal: 1 },
    concrete: { scan: 'concrete', roughness: 0.9, metallic: 0, fade: 0.04, chip: 0, rivets: false, scanNormal: 1 },
  }

  export function surfaceFor(role: string): Surface {
    const s = ROLE_SURFACE[role]
    if (!s) throw new Error(`skin: palette role "${role}" has no surface in tools/models/skin/surfaces.ts (known: ${Object.keys(ROLE_SURFACE).sort().join(', ')})`)
    return s
  }
  ```
  DP1-DP3 add the roles their models use: `timber`, `earth`, and the ship roles. `surfaceFor` makes a missing one fail by name.

- [ ] **Step 6: The manifest flag.** In `tools/models/manifest.ts`'s `ModelEntrySchema`, after `ship: ShipSchema.optional(),`, add:
  ```ts
    /** DP0: the Blender script is skinned (`kit.Model(name, skin=<px>)`), and the build bakes its atlas. */
    skin: z.literal(true).optional(),
  ```
  In the `superRefine`, after the `ship` block, add:
  ```ts
    if (e.skin && e.source.kind !== 'blender') fail(['skin'], 'skin: true is for Blender entries: only the kit writes the charts and sidecar it needs')
  ```

- [ ] **Step 7: Run the tests.**
  ```bash
  npx vitest run tests/tools/models/skin/sidecar.test.ts tests/tools/models/manifest.test.ts --maxWorkers=2; echo "rc=$?"
  npx tsc --noEmit -p .; echo "tsc rc=$?"
  ```
  Expected: both rc=0.

- [ ] **Step 8: Commit.**
  ```bash
  git add tools/models/skin/colors.ts tools/models/skin/sidecar.ts tools/models/skin/surfaces.ts tools/models/manifest.ts tests/tools/models/skin/sidecar.test.ts tests/tools/models/manifest.test.ts
  git commit -m "DP0: skin sidecar schema, marking colors, role surfaces, manifest skin flag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 4: Pinned scans, sampled at the texel's footprint

**Files:**
- Create: `tools/models/skin/scans.ts`
- Create: `tests/tools/models/skin/scans.test.ts`

**Interfaces:**
- Consumes: `fetchPinned`, `pinnedCachePath` (`tools/textures/fetchPinned.ts`); `PAINTED_METAL` (`tools/models/generated/paint.ts`); `ScanId` (Task 3).
- Produces:
  - `SCANS: Record<ScanId, ScanSource>`, where `ScanSource = { polyHaven: string; authors: string; license: 'CC0-1.0'; tileM: number; diffuse, normal, rough: { url: string; md5: string } }`;
  - `scansCached(ids?: readonly ScanId[]): boolean`;
  - `interface Scan { size: number; tileM: number; levels: readonly ScanLevel[]; meanLum: number; lumAtQuantile(q: number): number }`;
  - `interface ScanLevel { size: number; lum: Float32Array; rough: Float32Array; nrm: Float32Array /* xyz interleaved, unnormalized after averaging */ }`;
  - `scanFromChannels(size: number, tileM: number, lum: Float32Array, rough: Float32Array, nrm: Float32Array): Scan` (pure);
  - `loadScan(id: ScanId): Promise<Scan>`;
  - `interface ScanSample { lum: number; rough: number; n: [number, number, number] }` and `sampleScan(scan: Scan, uM: number, vM: number, footprintM: number): ScanSample`.

- [ ] **Step 1: Write the failing tests** `tests/tools/models/skin/scans.test.ts`:
  ```ts
  // tests/tools/models/skin/scans.test.ts
  import { describe, expect, it } from 'vitest'
  import { SCANS, sampleScan, scanFromChannels, scansCached, loadScan } from '../../../../tools/models/skin/scans.js'

  /** A 64 px scan of vertical stripes 2 px wide (period 4 px), lum 0 and 1; flat normals; rough = x / 63. */
  function stripes(): ReturnType<typeof scanFromChannels> {
    const n = 64
    const lum = new Float32Array(n * n), rough = new Float32Array(n * n), nrm = new Float32Array(3 * n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x
      lum[i] = (x >> 1) & 1
      rough[i] = x / 63
      nrm[3 * i] = ((x >> 1) & 1) ? 0.6 : -0.6; nrm[3 * i + 1] = 0; nrm[3 * i + 2] = 0.8
    }
    return scanFromChannels(n, 1.0, lum, rough, nrm)
  }

  describe('scan sampling (DP0, Review Focus 3)', () => {
    const scan = stripes()
    it('builds a mip chain down to 1 px, each level the 2x2 box average of the one above', () => {
      expect(scan.levels.map((l) => l.size)).toEqual([64, 32, 16, 8, 4, 2, 1])
      expect(scan.levels[6]!.lum[0]).toBeCloseTo(0.5, 6)
      expect(scan.meanLum).toBeCloseTo(0.5, 6)
    })
    it('at its native footprint it resolves the stripes', () => {
      const texel = 1 / 64
      const a = sampleScan(scan, 0.5 * texel, 0.5 * texel, texel).lum
      const b = sampleScan(scan, 2.5 * texel, 0.5 * texel, texel).lum
      expect(Math.abs(a - b)).toBeGreaterThan(0.9)
    })
    it('at a footprint wider than the period it returns the mean, within 2%, with no moire', () => {
      for (let i = 0; i < 50; i++) {
        const s = sampleScan(scan, i * 0.0137, i * 0.0291, 8 / 64)
        expect(Math.abs(s.lum - 0.5), `sample ${i}`).toBeLessThanOrEqual(0.01)
        expect(Math.abs(s.n[0]), 'normals average flat').toBeLessThanOrEqual(0.02)
      }
    })
    it('wraps: u and u + tile sample the same texel, negative coordinates included', () => {
      const a = sampleScan(scan, 0.3, 0.7, 1 / 64), b = sampleScan(scan, 1.3, -0.3, 1 / 64)
      expect(b).toEqual(a)
    })
    it('the dark-quantile threshold is monotone and inside [0, 1]', () => {
      expect(scan.lumAtQuantile(0.1)).toBeLessThanOrEqual(scan.lumAtQuantile(0.9))
      expect(scan.lumAtQuantile(0)).toBeGreaterThanOrEqual(0)
      expect(scan.lumAtQuantile(1)).toBeLessThanOrEqual(1)
    })
  })

  describe('the pinned scans', () => {
    it('are three CC0 Poly Haven sets, each with a positive tile size and three MD5-pinned files', () => {
      expect(Object.keys(SCANS).sort()).toEqual(['concrete', 'corrugated-iron', 'painted-metal'])
      for (const s of Object.values(SCANS)) {
        expect(s.license).toBe('CC0-1.0')
        expect(s.tileM).toBeGreaterThan(0)
        for (const f of [s.diffuse, s.normal, s.rough]) { expect(f.url).toMatch(/^https:\/\/dl\.polyhaven\.org\//); expect(f.md5).toMatch(/^[0-9a-f]{32}$/) }
      }
    })
  })

  describe.skipIf(!scansCached())('the pinned scans load (needs tools/textures/cache: run `npm run models:build -- hangar` once)', () => {
    it.each(['painted-metal', 'corrugated-iron', 'concrete'] as const)('%s decodes to a 1024 px scan with unit-ish normals', async (id) => {
      const s = await loadScan(id)
      expect(s.size).toBe(1024)
      const l0 = s.levels[0]!
      const len = Math.hypot(l0.nrm[0]!, l0.nrm[1]!, l0.nrm[2]!)
      expect(len).toBeGreaterThan(0.9); expect(len).toBeLessThan(1.1)
      expect(s.meanLum).toBeGreaterThan(0); expect(s.meanLum).toBeLessThan(1)
    }, 60_000)
  })
  ```

- [ ] **Step 2: Run it to verify it fails.**
  ```bash
  npx vitest run tests/tools/models/skin/scans.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `tools/models/skin/scans.ts`.**
  ```ts
  // tools/models/skin/scans.ts
  import { existsSync } from 'node:fs'
  import sharp from 'sharp'
  import { fetchPinned, pinnedCachePath } from '../../textures/fetchPinned.js'
  import { PAINTED_METAL } from '../generated/paint.js'
  import type { ScanId } from './surfaces.js'

  const PH1K = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k'
  const files = (id: string, diff: string, nor: string, rough: string) => ({
    diffuse: { url: `${PH1K}/${id}/${id}_diff_1k.jpg`, md5: diff },
    normal: { url: `${PH1K}/${id}/${id}_nor_gl_1k.jpg`, md5: nor },
    rough: { url: `${PH1K}/${id}/${id}_rough_1k.jpg`, md5: rough },
  })

  export interface ScanFile { readonly url: string; readonly md5: string }
  export interface ScanSource {
    readonly polyHaven: string; readonly authors: string; readonly license: 'CC0-1.0'; readonly tileM: number
    readonly diffuse: ScanFile; readonly normal: ScanFile; readonly rough: ScanFile
  }

  /** MD5s from api.polyhaven.com/files/<id>, read 2026-09-28 (painted metal: O1's, read 2026-09-26).
   *  Tile sizes are each asset's own "dimensions" (mm) from api.polyhaven.com/info/<id>. */
  export const SCANS: Readonly<Record<ScanId, ScanSource>> = {
    'painted-metal': { polyHaven: PAINTED_METAL.id, authors: PAINTED_METAL.author, license: 'CC0-1.0', tileM: PAINTED_METAL.tileM, diffuse: PAINTED_METAL.diffuse, normal: PAINTED_METAL.normal, rough: PAINTED_METAL.rough },
    'corrugated-iron': { polyHaven: 'worn_corrugated_iron', authors: 'Dimitrios Savva (photography), Jenelle van Heerden (processing)', license: 'CC0-1.0', tileM: 1.8,
      ...files('worn_corrugated_iron', 'dee4306e2c337afcb3a815eb3345c7bd', 'b1fdf9a7fa3ca2764fe1621a6bdea0db', '78ed19c7b13281d6bfcf12fc9ee27dc3') },
    concrete: { polyHaven: 'concrete_floor_worn_001', authors: 'Dimitrios Savva (photography), Rico Cilliers (processing)', license: 'CC0-1.0', tileM: 3.0,
      ...files('concrete_floor_worn_001', 'e35597cca586150b1ab2aa9a331a39c5', '9de6626758f8793b71182b892c110827', 'b158eae73029ac6a849481274a0e1b35') },
  }

  export const scansCached = (ids: readonly ScanId[] = Object.keys(SCANS) as ScanId[]): boolean =>
    ids.every((id) => [SCANS[id].diffuse, SCANS[id].normal, SCANS[id].rough].every((f) => existsSync(pinnedCachePath(f.url))))

  export interface ScanLevel { readonly size: number; readonly lum: Float32Array; readonly rough: Float32Array; readonly nrm: Float32Array }
  export interface Scan {
    readonly size: number; readonly tileM: number; readonly levels: readonly ScanLevel[]; readonly meanLum: number
    lumAtQuantile(q: number): number
  }
  export interface ScanSample { readonly lum: number; readonly rough: number; readonly n: [number, number, number] }

  function halve(l: ScanLevel): ScanLevel {
    const s = l.size / 2
    const lum = new Float32Array(s * s), rough = new Float32Array(s * s), nrm = new Float32Array(3 * s * s)
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const o = y * s + x
      const i = [(2 * y) * l.size + 2 * x, (2 * y) * l.size + 2 * x + 1, (2 * y + 1) * l.size + 2 * x, (2 * y + 1) * l.size + 2 * x + 1]
      lum[o] = (l.lum[i[0]!]! + l.lum[i[1]!]! + l.lum[i[2]!]! + l.lum[i[3]!]!) / 4
      rough[o] = (l.rough[i[0]!]! + l.rough[i[1]!]! + l.rough[i[2]!]! + l.rough[i[3]!]!) / 4
      for (let c = 0; c < 3; c++) nrm[3 * o + c] = (l.nrm[3 * i[0]! + c]! + l.nrm[3 * i[1]! + c]! + l.nrm[3 * i[2]! + c]! + l.nrm[3 * i[3]! + c]!) / 4
    }
    return { size: s, lum, rough, nrm }
  }

  /** A scan from decoded channels: `size` a power of two, `nrm` xyz in [-1, 1] interleaved. */
  export function scanFromChannels(size: number, tileM: number, lum: Float32Array, rough: Float32Array, nrm: Float32Array): Scan {
    if (size < 1 || (size & (size - 1)) !== 0) throw new Error(`scan: size ${size} is not a power of two`)
    const levels: ScanLevel[] = [{ size, lum, rough, nrm }]
    while (levels[levels.length - 1]!.size > 1) levels.push(halve(levels[levels.length - 1]!))
    const sorted = Float32Array.from(lum).sort()
    return {
      size, tileM, levels, meanLum: levels[levels.length - 1]!.lum[0]!,
      lumAtQuantile: (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]!,
    }
  }

  const wrap = (i: number, n: number): number => ((i % n) + n) % n

  /**
   * The scan at chart coordinates (uM, vM) meters, averaged over a texel `footprintM` wide: the
   * mip level is the finest whose texel covers the footprint, then bilinear with wrap. One level,
   * not two, so the result is a plain function of its inputs (Review Focus 3).
   */
  export function sampleScan(scan: Scan, uM: number, vM: number, footprintM: number): ScanSample {
    let k = 0, texel = scan.tileM / scan.size
    while (texel < footprintM && k < scan.levels.length - 1) { k++; texel *= 2 }
    const l = scan.levels[k]!
    const fx = (uM / scan.tileM) * l.size - 0.5, fy = (vM / scan.tileM) * l.size - 0.5
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
    const idx = [wrap(y0, l.size) * l.size + wrap(x0, l.size), wrap(y0, l.size) * l.size + wrap(x0 + 1, l.size),
      wrap(y0 + 1, l.size) * l.size + wrap(x0, l.size), wrap(y0 + 1, l.size) * l.size + wrap(x0 + 1, l.size)]
    const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]
    let lum = 0, rough = 0, nx = 0, ny = 0, nz = 0
    for (let j = 0; j < 4; j++) {
      const i = idx[j]!, wj = w[j]!
      lum += wj * l.lum[i]!; rough += wj * l.rough[i]!
      nx += wj * l.nrm[3 * i]!; ny += wj * l.nrm[3 * i + 1]!; nz += wj * l.nrm[3 * i + 2]!
    }
    return { lum, rough, n: [nx, ny, nz] }
  }

  /** Decodes the three pinned 1k JPGs (fetched once into tools/textures/cache). Luminance is the
   *  diffuse's grayscale; the normal is Poly Haven's OpenGL map, glTF's convention, unchanged. */
  export async function loadScan(id: ScanId): Promise<Scan> {
    const src = SCANS[id]
    const raw = async (f: ScanFile, channels: 1 | 3): Promise<{ data: Buffer; size: number }> => {
      const img = sharp(await fetchPinned(f.url, f.md5))
      const { data, info } = await (channels === 1 ? img.greyscale() : img.removeAlpha()).raw().toBuffer({ resolveWithObject: true })
      if (info.channels !== channels || info.width !== info.height) throw new Error(`scan ${id}: ${f.url} decoded to ${info.width}x${info.height}x${info.channels}, expected square x${channels}`)
      return { data, size: info.width }
    }
    const diff = await raw(src.diffuse, 1), nor = await raw(src.normal, 3), rgh = await raw(src.rough, 1)
    if (nor.size !== diff.size || rgh.size !== diff.size) throw new Error(`scan ${id}: map sizes differ`)
    const n = diff.size, count = n * n
    const lum = new Float32Array(count), rough = new Float32Array(count), nrm = new Float32Array(3 * count)
    for (let i = 0; i < count; i++) {
      lum[i] = diff.data[i]! / 255
      rough[i] = rgh.data[i]! / 255
      for (let c = 0; c < 3; c++) nrm[3 * i + c] = nor.data[3 * i + c]! / 127.5 - 1
    }
    return scanFromChannels(n, src.tileM, lum, rough, nrm)
  }
  ```
  `Float32Array.prototype.sort` sorts numerically, which is deterministic.

- [ ] **Step 4: Run it, then fetch the scans once so the cached block runs too.**
  ```bash
  npx vitest run tests/tools/models/skin/scans.test.ts --maxWorkers=2; echo "rc=$?"
  npx tsx -e "import('./tools/models/skin/scans.ts').then(async (m) => { for (const id of ['painted-metal','corrugated-iron','concrete']) { const s = await m.loadScan(id); console.log(id, s.size, s.meanLum.toFixed(4)) } })"
  npx vitest run tests/tools/models/skin/scans.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: the first run passes with one named skip. The fetch prints three lines, and an MD5 mismatch is a hard error naming the file. The second run passes with no skip. Record the three mean luminances in the ledger.

- [ ] **Step 5: Commit.**
  ```bash
  git add tools/models/skin/scans.ts tests/tools/models/skin/scans.test.ts
  git commit -m "DP0: pinned CC0 scans with a footprint-filtered sampler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---
### Task 5: The rasterizer: triangles into a texel G-buffer

**Files:**
- Create: `tools/models/skin/raster.ts`
- Create: `tests/tools/models/skin/fixture.ts` (shared by Tasks 5-7)
- Create: `tests/tools/models/skin/raster.test.ts`

**Interfaces:**
- Consumes: `Sidecar` (Task 3); a glTF-Transform `Document` as the kit exports it (every mesh node has an identity world matrix, and every primitive is indexed triangles with `POSITION`, `NORMAL`, `TEXCOORD_0` and a material named by its palette role).
- Produces:
  - `type Vec3 = [number, number, number]`;
  - `interface RasterTri { p: [Vec3, Vec3, Vec3]; n: [Vec3, Vec3, Vec3]; uv: [[number, number], [number, number], [number, number]]; role: number; patch: number }`, where `role` indexes `roles` and `patch` is a sidecar patch id;
  - `interface Triangles { roles: string[]; tris: RasterTri[] }`;
  - `trianglesOf(doc: Document, side: Sidecar, atlasPx: number): Triangles`. The atlas size is explicit: every skin function takes it as an argument, never from `side.atlasPx` (see the fixture note);
  - `interface GBuffer { size: number; covered: Uint8Array; role: Uint8Array; patch: Int32Array; pos: Float32Array; nrm: Float32Array }`, one sample per cell of a `size × size` grid over UV [0,1]², rows top to bottom, `pos`/`nrm` xyz interleaved;
  - `rasterize(t: Triangles, size: number): GBuffer`, called with `size = 2 × atlas px`.
- Produces (test fixture, `tests/tools/models/skin/fixture.ts`):
  - `FIXTURE_ATLAS = 64`, `FIXTURE_MPP = 0.05`;
  - `fixtureSidecar(overrides?: Partial<Sidecar>): Sidecar`;
  - `fixtureDoc(atlasPx = FIXTURE_ATLAS): Document`;
  - `flatScan(): Scan`, which is uniform: lum 0.5, rough 0.5, normal +z.

- [ ] **Step 1: The shared fixture** `tests/tools/models/skin/fixture.ts`:
  ```ts
  // tests/tools/models/skin/fixture.ts
  /**
   * A 64 px skin in two patches, built without Blender (DP0 Tasks 5-7):
   *   patch 0, tag "wing": a 1.6 x 1.6 m quad at y = 0 facing +y (x = u, z = v), role ijaGreen, rect [8, 8, 32, 32]
   *   patch 1, tag "wing": a 0.6 x 0.6 m quad at y = -0.1 facing -y, role underside, rect [48, 8, 12, 12]
   *   patch 2, tag "fuselage": a 0.3 x 0.3 m quad at x = 3 facing +x, role ijaGreen, rect [48, 28, 6, 6]
   * metersPerPx 0.05, padding 4. One panel line on patch 0 at v = 0.8 m.
   */
  import { Document } from '@gltf-transform/core'
  import { parseSidecar, type Sidecar } from '../../../../tools/models/skin/sidecar.js'
  import { scanFromChannels, type Scan } from '../../../../tools/models/skin/scans.js'

  export const FIXTURE_ATLAS = 64
  export const FIXTURE_MPP = 0.05

  export function fixtureSidecar(overrides: Record<string, unknown> = {}): Sidecar {
    return parseSidecar(JSON.stringify({
      version: 1, model: 'fx', atlasPx: 512, paddingPx: 4, metersPerPx: FIXTURE_MPP,
      roles: { ijaGreen: [0x4b / 255, 0x55 / 255, 0x35 / 255], underside: [0xa3 / 255, 0xa8 / 255, 0x9a / 255] },
      patches: [
        { id: 0, tag: 'wing', rect: [8, 8, 32, 32], originM: [0, 0] },
        { id: 1, tag: 'wing', rect: [48, 8, 12, 12], originM: [0, 0] },
        { id: 2, tag: 'fuselage', rect: [48, 28, 6, 6], originM: [0, 0] },
      ],
      lines: [{ patch: 0, axis: 'v', atM: 0.8, fromM: 0, toM: 1.6, kind: 'panel' }],
      markings: [],
      ...overrides,
    }))
  }

  type Quad = { role: string; patch: number; rect: [number, number]; corner: (u: number, v: number) => [number, number, number]; n: [number, number, number]; sizeM: number }
  const QUADS: Quad[] = [
    { role: 'ijaGreen', patch: 0, rect: [8, 8], corner: (u, v) => [u, 0, v], n: [0, 1, 0], sizeM: 1.6 },
    { role: 'underside', patch: 1, rect: [48, 8], corner: (u, v) => [u, -0.1, v], n: [0, -1, 0], sizeM: 0.6 },
    { role: 'ijaGreen', patch: 2, rect: [48, 28], corner: (u, v) => [3, v, u], n: [1, 0, 0], sizeM: 0.3 },
  ]

  /** The quads as the kit would export them, UVs in an `atlasPx` atlas. The unit tests use 64 (fast);
   *  the build test (Task 7) uses 512, the size the fixture sidecar declares. */
  export function fixtureDoc(atlasPx: number = FIXTURE_ATLAS): Document {
    const doc = new Document()
    const buffer = doc.createBuffer()
    const scene = doc.createScene('s')
    const mats = new Map<string, ReturnType<Document['createMaterial']>>()
    for (const q of QUADS) {
      const mat = mats.get(q.role) ?? doc.createMaterial(q.role)
      mats.set(q.role, mat)
      const pos: number[] = [], nrm: number[] = [], uv: number[] = []
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
        const u = a * q.sizeM, v = b * q.sizeM
        pos.push(...q.corner(u, v)); nrm.push(...q.n)
        uv.push((q.rect[0] + u / FIXTURE_MPP) / atlasPx, (q.rect[1] + v / FIXTURE_MPP) / atlasPx)
      }
      const acc = (type: 'VEC2' | 'VEC3' | 'SCALAR', a: Float32Array | Uint16Array) => doc.createAccessor().setType(type).setArray(a).setBuffer(buffer)
      const prim = doc.createPrimitive().setMaterial(mat)
        .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
        .setAttribute('NORMAL', acc('VEC3', new Float32Array(nrm)))
        .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
        .setIndices(acc('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])))
      scene.addChild(doc.createNode(`fx_${q.patch}`).setMesh(doc.createMesh(`fx_${q.patch}`).addPrimitive(prim)))
    }
    return doc
  }

  export function flatScan(): Scan {
    const n = 4
    const nrm = new Float32Array(3 * n * n)
    for (let i = 0; i < n * n; i++) nrm[3 * i + 2] = 1
    return scanFromChannels(n, 1, new Float32Array(n * n).fill(0.5), new Float32Array(n * n).fill(0.5), nrm)
  }
  ```
  The sidecar declares `atlasPx: 512` because the schema admits only real sizes. Every skin function therefore takes the atlas size as an argument, never from `side.atlasPx`. The fixture's rects are in 64 px units, and the tests pass 64. The production caller (Task 7) passes `side.atlasPx`.

- [ ] **Step 2: Write the failing test** `tests/tools/models/skin/raster.test.ts`:
  ```ts
  // tests/tools/models/skin/raster.test.ts
  import { describe, expect, it } from 'vitest'
  import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
  import { FIXTURE_ATLAS, fixtureDoc, fixtureSidecar } from './fixture.js'

  describe('rasterize (DP0)', () => {
    const side = fixtureSidecar()
    const t = trianglesOf(fixtureDoc(), side, FIXTURE_ATLAS)
    const g = rasterize(t, 2 * FIXTURE_ATLAS)

    it('reads every triangle with its role and its patch', () => {
      expect(t.roles).toEqual(['ijaGreen', 'underside'])
      expect(t.tris.map((x) => x.patch)).toEqual([0, 0, 1, 1, 2, 2])
    })
    it('covers exactly each patch rect at 2x: 64x64 + 24x24 + 12x12 samples', () => {
      let n = 0
      for (let i = 0; i < g.covered.length; i++) n += g.covered[i]!
      expect(n).toBe(64 * 64 + 24 * 24 + 12 * 12)
    })
    it('interpolates position and normal: sample (x, y) in patch 0 is at u = (x + 0.5) / 2 - 8 px', () => {
      const s = 2 * FIXTURE_ATLAS
      const x = 30, y = 40, i = y * s + x
      expect(g.covered[i]).toBe(1)
      expect(g.patch[i]).toBe(0)
      expect(g.pos[3 * i]).toBeCloseTo(((x + 0.5) / 2 - 8) * 0.05, 5)
      expect(g.pos[3 * i + 2]).toBeCloseTo(((y + 0.5) / 2 - 8) * 0.05, 5)
      expect([g.nrm[3 * i], g.nrm[3 * i + 1], g.nrm[3 * i + 2]]).toEqual([0, 1, 0])
    })
    it('refuses a triangle whose UVs fall in no patch, naming the node', () => {
      const doc = fixtureDoc()
      const uv = doc.getRoot().listNodes()[0]!.getMesh()!.listPrimitives()[0]!.getAttribute('TEXCOORD_0')!
      uv.setElement(0, [0.99, 0.99]).setElement(1, [0.98, 0.99]).setElement(2, [0.99, 0.98])
      expect(() => trianglesOf(doc, side, FIXTURE_ATLAS)).toThrow(/fx_0.*no patch/)
    })
    it('refuses a role the sidecar does not list', () => {
      const doc = fixtureDoc()
      doc.getRoot().listMaterials()[0]!.setName('timber')
      expect(() => trianglesOf(doc, side, FIXTURE_ATLAS)).toThrow(/timber/)
    })
  })
  ```

- [ ] **Step 3: Run it to verify it fails.**
  ```bash
  npx vitest run tests/tools/models/skin/raster.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL (module not found).

- [ ] **Step 4: Implement `tools/models/skin/raster.ts`.**
  ```ts
  // tools/models/skin/raster.ts
  import type { Document } from '@gltf-transform/core'
  import type { Sidecar } from './sidecar.js'

  export type Vec3 = [number, number, number]
  type UV = [number, number]
  export interface RasterTri { readonly p: [Vec3, Vec3, Vec3]; readonly n: [Vec3, Vec3, Vec3]; readonly uv: [UV, UV, UV]; readonly role: number; readonly patch: number }
  export interface Triangles { readonly roles: string[]; readonly tris: RasterTri[] }
  export interface GBuffer {
    readonly size: number
    readonly covered: Uint8Array
    readonly role: Uint8Array
    readonly patch: Int32Array
    readonly pos: Float32Array
    readonly nrm: Float32Array
  }

  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

  /** Every triangle of the kit's raw export, in node order, with its role (the material's name)
   *  and its patch (the rect holding its UV centroid, in `atlasPx` pixels). */
  export function trianglesOf(doc: Document, side: Sidecar, atlasPx: number): Triangles {
    const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh())
    const roles = [...new Set(nodes.flatMap((n) => n.getMesh()!.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '')))].sort()
    for (const r of roles) if (!(r in side.roles)) throw new Error(`skin ${side.model}: material "${r}" is not a role the sidecar lists (${Object.keys(side.roles).join(', ')})`)
    const tris: RasterTri[] = []
    for (const node of nodes) {
      const m = node.getWorldMatrix()
      if (m.some((v, i) => Math.abs(v - IDENTITY[i]!) > 1e-9)) throw new Error(`skin ${side.model}: node ${node.getName()} is not at the identity; skin the kit's raw export`)
      for (const prim of node.getMesh()!.listPrimitives()) {
        const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices()
        if (!pos || !nrm || !uv || !idx || prim.getMode() !== 4) throw new Error(`skin ${side.model}: node ${node.getName()} needs indexed triangles with POSITION, NORMAL and TEXCOORD_0`)
        const role = roles.indexOf(prim.getMaterial()?.getName() ?? '')
        for (let k = 0; k < idx.getCount(); k += 3) {
          const v = [idx.getScalar(k), idx.getScalar(k + 1), idx.getScalar(k + 2)]
          const p = v.map((i) => pos.getElement(i, [0, 0, 0]) as Vec3) as [Vec3, Vec3, Vec3]
          const n = v.map((i) => nrm.getElement(i, [0, 0, 0]) as Vec3) as [Vec3, Vec3, Vec3]
          const t = v.map((i) => uv.getElement(i, [0, 0]) as UV) as [UV, UV, UV]
          const cx = ((t[0][0] + t[1][0] + t[2][0]) / 3) * atlasPx, cy = ((t[0][1] + t[1][1] + t[2][1]) / 3) * atlasPx
          const hit = side.patches.find((q) => cx >= q.rect[0] && cx <= q.rect[0] + q.rect[2] && cy >= q.rect[1] && cy <= q.rect[1] + q.rect[3])
          if (!hit) throw new Error(`skin ${side.model}: node ${node.getName()} triangle ${k / 3} (uv centroid ${cx.toFixed(1)}, ${cy.toFixed(1)} px) lies in no patch`)
          tris.push({ p, n, uv: t, role, patch: hit.id })
        }
      }
    }
    return { roles, tris }
  }

  const edge = (a: UV, b: UV, x: number, y: number): number => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])

  /** One sample at each cell center of a size x size grid over UV [0, 1]^2. A sample on an edge
   *  two triangles share goes to the first: iteration order, not floating-point luck, decides. */
  export function rasterize(t: Triangles, size: number): GBuffer {
    const count = size * size
    const g: GBuffer = { size, covered: new Uint8Array(count), role: new Uint8Array(count), patch: new Int32Array(count).fill(-1), pos: new Float32Array(3 * count), nrm: new Float32Array(3 * count) }
    for (const tri of t.tris) {
      const [a, b, c] = tri.uv.map(([u, v]) => [u * size, v * size] as UV) as [UV, UV, UV]
      const area = edge(a, b, c[0], c[1])
      if (area === 0) continue
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 0.5)), x1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0]) - 0.5))
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - 0.5)), y1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1]) - 0.5))
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5
        const w0 = edge(b, c, px, py) / area, w1 = edge(c, a, px, py) / area, w2 = edge(a, b, px, py) / area
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        const i = y * size + x
        if (g.covered[i]) continue
        g.covered[i] = 1; g.role[i] = tri.role; g.patch[i] = tri.patch
        let nx = 0, ny = 0, nz = 0
        for (let k = 0; k < 3; k++) {
          const w = k === 0 ? w0 : k === 1 ? w1 : w2
          g.pos[3 * i + k] = w0 * tri.p[0][k]! + w1 * tri.p[1][k]! + w2 * tri.p[2][k]!
          nx += w * tri.n[k]![0]; ny += w * tri.n[k]![1]; nz += w * tri.n[k]![2]
        }
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        g.nrm[3 * i] = nx / l; g.nrm[3 * i + 1] = ny / l; g.nrm[3 * i + 2] = nz / l
      }
    }
    return g
  }
  ```
  Note the two loops over `k`: the first computes position component k, and the normal sums use vertex weight k. Keep them exactly as written.

- [ ] **Step 5: Run it.**
  ```bash
  npx vitest run tests/tools/models/skin/raster.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: rc=0. If the coverage count is off by a row or column, the bounding box is clipping. Fix the rounding in `x0/x1/y0/y1`, never the expected count: it is the rect area at 2×.

- [ ] **Step 6: Commit.**
  ```bash
  git add tools/models/skin/raster.ts tests/tools/models/skin/fixture.ts tests/tools/models/skin/raster.test.ts
  git commit -m "DP0: skin rasterizer, triangles into a texel G-buffer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 6: Layers and composition: paint, markings, height, normals, and a golden image

**Files:**
- Create: `tools/models/skin/layers.ts`
- Create: `tools/models/skin/compose.ts`
- Modify: `tools/models/skin/colors.ts` (add `BARE_METAL`)
- Create: `tests/tools/models/skin/layers.test.ts`
- Create: `tests/tools/models/skin/golden.test.ts`

**Interfaces:**
- Consumes: `GBuffer`, `Triangles` (Task 5); `Sidecar`, `Marking` (Task 3); `Scan`, `sampleScan` (Task 4); `surfaceFor`, `ScanId` (Task 3); `SRGB8_TO_LINEAR`, `srgbToLinear`, `linearToSrgb8`, `MARKING_COLORS` (Task 3).
- Produces:
  - `interface Painted { size: number; covered: Uint8Array; patch: Int32Array; color: Float32Array; rough: Float32Array; metal: Float32Array; height: Float32Array; scanN: Float32Array }`: per sample, `color` linear RGB interleaved and `scanN` xyz interleaved;
  - `paint(g: GBuffer, roles: readonly string[], side: Sidecar, scans: ReadonlyMap<ScanId, Scan>, atlasPx: number): Painted`;
  - `interface SkinMaps { size: number; baseColor: Uint8Array; metallicRoughness: Uint8Array; normal: Uint8Array }`: RGB, rows top to bottom, `size` = atlas px;
  - `compose(p: Painted, side: Sidecar, atlasPx: number): SkinMaps`;
  - the constants `LINE_HALF_M`, `LINE_DEPTH_M`, `RIVET`, `FACING_MIN` (layers.ts) and `NORMAL_GAIN` (compose.ts), all exported for the tests.

- [ ] **Step 1: Write the failing tests** `tests/tools/models/skin/layers.test.ts`:
  ```ts
  // tests/tools/models/skin/layers.test.ts
  import { describe, expect, it } from 'vitest'
  import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
  import { paint } from '../../../../tools/models/skin/layers.js'
  import { compose, type SkinMaps } from '../../../../tools/models/skin/compose.js'
  import type { Sidecar } from '../../../../tools/models/skin/sidecar.js'
  import type { ScanId } from '../../../../tools/models/skin/surfaces.js'
  import { FIXTURE_ATLAS as W, fixtureDoc, fixtureSidecar, flatScan } from './fixture.js'

  const scans = new Map<ScanId, ReturnType<typeof flatScan>>([['painted-metal', flatScan()]])
  const build = (side: Sidecar): SkinMaps => {
    const t = trianglesOf(fixtureDoc(), side, W)
    return compose(paint(rasterize(t, 2 * W), t.roles, side, scans, W), side, W)
  }
  const px = (m: Uint8Array, x: number, y: number): number[] => [m[3 * (y * W + x)]!, m[3 * (y * W + x) + 1]!, m[3 * (y * W + x) + 2]!]
  const disc = (tags: string[], extra: Record<string, unknown> = {}) => ({ kind: 'disc', tags, center: [0.4, 0, 0.4], axis: [0, 1, 0], radiusM: 0.2, color: 'hinomaruRed', ...extra })

  describe('skin layers (DP0)', () => {
    it('paints each role its sidecar color, lighter only by fading, and leaves the metallic channel at 0 for paint', () => {
      const m = build(fixtureSidecar({ lines: [] }))
      const top = px(m.baseColor, 20, 12), under = px(m.baseColor, 52, 12)
      expect(top[1]!).toBeGreaterThan(top[2]!) // green over blue: ijaGreen
      expect(under[0]!).toBeGreaterThan(140) // the pale underside
      expect(px(m.metallicRoughness, 20, 12)[2]).toBe(0)
    })

    it('a disc marking paints the face it faces and not the underside below it (Review Focus 5)', () => {
      const m = build(fixtureSidecar({ lines: [], markings: [disc(['wing'])] }))
      // (0.4, 0.4) m on patch 0 is texel (8 + 8, 8 + 8); on patch 1 it is (48 + 8, 8 + 8).
      const top = px(m.baseColor, 16, 16), under = px(m.baseColor, 56, 16)
      expect(top[0]!).toBeGreaterThan(top[1]! + 40) // red
      expect(under[0]! - under[1]!).toBeLessThan(20) // still the gray underside
    })

    it('tags restrict a marking to its parts (Review Focus 5)', () => {
      const m = build(fixtureSidecar({ lines: [], markings: [disc(['fuselage'])] }))
      const top = px(m.baseColor, 16, 16)
      expect(top[0]! - top[1]!).toBeLessThan(10) // not red: the wing is not tagged fuselage
    })

    it("a groove's normals tilt toward it: green < 128 just above the line, > 128 just below (Review Focus 2)", () => {
      const m = build(fixtureSidecar())
      // The line is at v = 0.8 m on patch 0: texel row 8 + 16 = 24.
      expect(px(m.normal, 20, 23)[1]).toBeLessThan(126)
      expect(px(m.normal, 20, 25)[1]).toBeGreaterThan(130)
      expect(px(m.normal, 20, 12)).toEqual([128, 128, 255]) // flat away from it
      expect(px(m.baseColor, 20, 24)[1]).toBeLessThan(px(m.baseColor, 20, 12)[1]!) // dirt in the seam
    })

    it('dilation fills the padding from its own patch, never a neighbor, and never black (Review Focus 4)', () => {
      const m = build(fixtureSidecar({ lines: [] }))
      // Patch 0 ends at x = 40 and patch 1 starts at x = 48: columns 40-43 are patch 0's, 44-47 patch 1's.
      for (let x = 40; x < 44; x++) expect(px(m.baseColor, x, 20), `x=${x}`).toEqual(px(m.baseColor, 39, 20))
      for (let x = 44; x < 48; x++) expect(px(m.baseColor, x, 12), `x=${x}`).toEqual(px(m.baseColor, 48, 12))
      for (let i = 0; i < W * W; i++) expect(m.baseColor[3 * i]! + m.baseColor[3 * i + 1]! + m.baseColor[3 * i + 2]!, `texel ${i}`).toBeGreaterThan(0)
    })

    it('a slab paints across a band whatever it faces; a grid cuts laps only on axes lying in the surface', () => {
      const slab = build(fixtureSidecar({ lines: [], markings: [{ kind: 'slab', tags: ['wing'], axis: 'x', fromM: 1.0, toM: 1.2, color: 'insigniaWhite' }] }))
      expect(px(slab.baseColor, 8 + 22, 20)[0]).toBeGreaterThan(180) // x = 1.1 m
      expect(px(slab.baseColor, 8 + 10, 20)[0]).toBeLessThan(120) // x = 0.5 m
      const grid = build(fixtureSidecar({ lines: [], markings: [{ kind: 'grid', tags: ['wing'], spacingM: [0.8, 0.8, null], widthM: 0.02, depth: 1 }] }))
      // On the +y face only x lies in the surface: a lap at x = 0.8 m (column 24) and none at z = 0.8 m.
      expect(px(grid.normal, 23, 12)[0]).not.toBe(128)
      expect(px(grid.normal, 12, 23)[1]).toBe(128)
    })
  })
  ```
  `tests/tools/models/skin/golden.test.ts` (Task 7 adds the WebP half):
  ```ts
  // tests/tools/models/skin/golden.test.ts
  import { describe, expect, it } from 'vitest'
  import { createHash } from 'node:crypto'
  import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
  import { paint } from '../../../../tools/models/skin/layers.js'
  import { compose } from '../../../../tools/models/skin/compose.js'
  import type { ScanId } from '../../../../tools/models/skin/surfaces.js'
  import { FIXTURE_ATLAS as W, fixtureDoc, fixtureSidecar, flatScan } from './fixture.js'

  const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
  const side = fixtureSidecar({ markings: [{ kind: 'disc', tags: ['wing'], center: [0.4, 0, 0.4], axis: [0, 1, 0], radiusM: 0.2, color: 'hinomaruRed', featherM: 0.02 }] })
  export const goldenMaps = () => {
    const t = trianglesOf(fixtureDoc(), side, W)
    return compose(paint(rasterize(t, 2 * W), t.roles, side, new Map<ScanId, ReturnType<typeof flatScan>>([['painted-metal', flatScan()]]), W), side, W)
  }

  /** Golden hashes, recorded at Task 6 Step 5 from maps the implementer looked at. A change here
   *  is a change to the shared look (spec §5): update deliberately, in the commit that changes it. */
  const RAW = { baseColor: 'RECORD_AT_STEP_5', metallicRoughness: 'RECORD_AT_STEP_5', normal: 'RECORD_AT_STEP_5' }

  describe('the skin golden image (DP0, spec §6)', () => {
    it('the raw maps hash to the recorded goldens', () => {
      const m = goldenMaps()
      expect({ baseColor: sha(m.baseColor), metallicRoughness: sha(m.metallicRoughness), normal: sha(m.normal) }).toEqual(RAW)
    })
  })
  ```
  `RECORD_AT_STEP_5` is a deliberate sentinel for the golden workflow, not a placeholder in the plan. It makes the test fail until Step 5 records real hashes from maps the implementer has looked at. **Do not commit it.**

- [ ] **Step 2: Run the layer tests to verify they fail.**
  ```bash
  npx vitest run tests/tools/models/skin/layers.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL (modules not found).

- [ ] **Step 3: `BARE_METAL` in `colors.ts`**, after `MARKING_COLORS`:
  ```ts
  /** What a paint chip shows: kit.py PALETTE's naturalMetal, sRGB 0-255. */
  export const BARE_METAL = [0xb4, 0xb8, 0xbc] as const
  ```

- [ ] **Step 4: Implement `tools/models/skin/layers.ts` and `tools/models/skin/compose.ts`.**
  ```ts
  // tools/models/skin/layers.ts
  import type { GBuffer } from './raster.js'
  import type { Marking, Sidecar } from './sidecar.js'
  import { sampleScan, type Scan } from './scans.js'
  import { surfaceFor, type ScanId, type Surface } from './surfaces.js'
  import { BARE_METAL, MARKING_COLORS, SRGB8_TO_LINEAR, srgbToLinear } from './colors.js'

  /**
   * Height is in groove units, not meters: a panel line is 1 deep at its center. compose.ts turns
   * the height's slope per TEXEL into the normal (NORMAL_GAIN), so a line reads as a one-texel
   * bevel at any texel density, as the downloads' baked panel lines do. A physical 2 mm groove at
   * the hangar's 12 cm texels would be invisible (worked in the DP0 plan, Task 6).
   * Half-widths are meters; a line narrower than a sample is drawn one sample wide (ESTIMATE, the look).
   */
  export const LINE_HALF_M = { panel: 0.001, hinge: 0.004 } as const
  export const LINE_DEPTH_M = { panel: 1, hinge: 1.6 } as const
  /** Rivet rows beside each panel line (ESTIMATE): offset and pitch (m), head radius (m), head
   *  height (groove units). Dots where a sample is under 4 mm; a faint ridge above that. */
  export const RIVET = { offsetM: 0.012, pitchM: 0.025, radiusM: 0.0025, heightM: 0.35, dotsBelowM: 0.004 } as const
  /** A disc or polygon marks a sample only if its normal is within ~70 deg of the marking's axis. */
  export const FACING_MIN = 0.35
  const SEAM_DIRT = 0.3

  export interface Painted {
    readonly size: number; readonly covered: Uint8Array; readonly patch: Int32Array
    readonly color: Float32Array; readonly rough: Float32Array; readonly metal: Float32Array
    readonly height: Float32Array; readonly scanN: Float32Array
  }

  type V3 = [number, number, number]
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const unit = (a: V3): V3 => { const l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l] }
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
  const linearColor = (c: readonly number[]): V3 => [SRGB8_TO_LINEAR[c[0]!]!, SRGB8_TO_LINEAR[c[1]!]!, SRGB8_TO_LINEAR[c[2]!]!]

  /** Distance from p to segment ab, 2D. */
  function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / l2)
    const ex = px - ax - t * dx, ey = py - ay - t * dy
    return Math.sqrt(ex * ex + ey * ey)
  }

  /** Coverage 0-1 of one marking at sample (p, n), or 0. Grid markings return 0: they cut height only. */
  function coverage(mk: Marking, p: V3, n: V3): number {
    if (mk.kind === 'grid') return 0
    const ramp = (inside: number): number => (mk.featherM > 0 ? clamp01(inside / mk.featherM) : inside >= 0 ? 1 : 0)
    if (mk.kind === 'slab') {
      const c = p[mk.axis === 'x' ? 0 : mk.axis === 'y' ? 1 : 2]
      return ramp(Math.min(c - mk.fromM, mk.toM - c))
    }
    const a = unit(mk.axis as V3)
    if (dot(n, a) < FACING_MIN) return 0
    if (mk.kind === 'disc') {
      const d: V3 = [p[0] - mk.center[0], p[1] - mk.center[1], p[2] - mk.center[2]]
      const along = dot(d, a)
      if (Math.abs(along) > mk.radiusM) return 0
      const r = Math.sqrt(Math.max(0, dot(d, d) - along * along))
      return ramp(mk.radiusM - r)
    }
    // polygon: plane coordinates about origin, u along uDir made orthogonal to the axis
    const u0 = mk.uDir as V3
    const u = unit([u0[0] - dot(u0, a) * a[0], u0[1] - dot(u0, a) * a[1], u0[2] - dot(u0, a) * a[2]])
    const v = cross(a, u)
    const d: V3 = [p[0] - mk.origin[0], p[1] - mk.origin[1], p[2] - mk.origin[2]]
    const reach = Math.max(...mk.points.map(([x, y]) => Math.sqrt(x * x + y * y)))
    if (Math.abs(dot(d, a)) > reach) return 0
    const x = dot(d, u), y = dot(d, v)
    let inside = false, dist = Infinity
    for (let i = 0, j = mk.points.length - 1; i < mk.points.length; j = i++) {
      const [xi, yi] = mk.points[i]!, [xj, yj] = mk.points[j]!
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      dist = Math.min(dist, segDist(x, y, xi, yi, xj, yj))
    }
    return inside ? ramp(dist) : 0
  }

  /**
   * Every covered sample's paint, finish, markings and height (DP0, spec §4). Order: role color;
   * scan wear; fading on sky-facing surfaces; markings in declaration order; chips through all
   * of it; then the seam dirt of panel lines. `atlasPx` sets the texel footprint the scans are
   * filtered to; the G-buffer is 2x that.
   */
  export function paint(g: GBuffer, roles: readonly string[], side: Sidecar, scans: ReadonlyMap<ScanId, Scan>, atlasPx: number): Painted {
    const count = g.size * g.size
    const out: Painted = {
      size: g.size, covered: g.covered, patch: g.patch,
      color: new Float32Array(3 * count), rough: new Float32Array(count), metal: new Float32Array(count),
      height: new Float32Array(count), scanN: new Float32Array(3 * count),
    }
    const mpp = side.metersPerPx, spacing = (mpp * atlasPx) / g.size // meters per sample
    const surfaces: Surface[] = roles.map((r) => surfaceFor(r))
    const base: V3[] = roles.map((r) => side.roles[r]!.map(srgbToLinear) as V3)
    const scanOf = (s: Surface): Scan | null => {
      if (s.scan === null) return null
      const sc = scans.get(s.scan)
      if (!sc) throw new Error(`skin ${side.model}: scan "${s.scan}" was not loaded`)
      return sc
    }
    const chipAt = surfaces.map((s) => { const sc = scanOf(s); return sc && s.chip > 0 ? sc.lumAtQuantile(s.chip) : -1 })
    const patches = new Map(side.patches.map((p) => [p.id, p]))
    const lines = new Map<number, Sidecar['lines']>()
    for (const l of side.lines) lines.set(l.patch, [...(lines.get(l.patch) ?? []), l])
    const marks = side.markings.map((m) => ({ m, color: m.kind === 'grid' ? null : linearColor(MARKING_COLORS[m.color]), tags: new Set(m.tags) }))
    const bare = linearColor(BARE_METAL)

    for (let i = 0; i < count; i++) {
      if (!g.covered[i]) continue
      const x = i % g.size, y = (i - x) / g.size
      const q = patches.get(g.patch[i]!)!
      const u = q.originM[0] + (((x + 0.5) * atlasPx) / g.size - q.rect[0]) * mpp
      const v = q.originM[1] + (((y + 0.5) * atlasPx) / g.size - q.rect[1]) * mpp
      const p: V3 = [g.pos[3 * i]!, g.pos[3 * i + 1]!, g.pos[3 * i + 2]!]
      const n: V3 = [g.nrm[3 * i]!, g.nrm[3 * i + 1]!, g.nrm[3 * i + 2]!]
      const r = g.role[i]!, surf = surfaces[r]!, sc = scanOf(surf)
      const s = sc ? sampleScan(sc, u, v, mpp) : { lum: 0.5, rough: 0.5, n: [0, 0, 1] as V3 }
      let [cr, cg, cb] = base[r]!
      // scan wear
      if (sc) { const k = 1 + 0.35 * (s.lum - sc.meanLum); cr *= k; cg *= k; cb *= k }
      // chalking: lighter and grayer toward the sky
      const t = surf.fade * Math.max(0, n[1])
      const gray = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) * 1.35 + 0.02
      cr += (gray - cr) * t; cg += (gray - cg) * t; cb += (gray - cb) * t
      let rough = surf.roughness + 0.5 * (s.rough - 0.5), metal = surf.metallic, h = 0
      // markings
      for (const { m, color, tags } of marks) {
        if (!tags.has(q.tag)) continue
        if (m.kind === 'grid') {
          const hw = Math.max(m.widthM / 2, spacing)
          for (let a = 0; a < 3; a++) {
            const sp = m.spacingM[a]
            if (sp === null || Math.abs(n[a]!) >= 0.5) continue
            const c = p[a]!, d = Math.abs(c - sp * Math.round(c / sp))
            h -= m.depth * Math.max(0, 1 - d / hw)
          }
          continue
        }
        const al = coverage(m, p, n) * m.opacity
        if (al === 0) continue
        if (m.effect === 'wear') {
          cr += (cr * 1.15 + 0.02 - cr) * al; cg += (cg * 1.15 + 0.02 - cg) * al; cb += (cb * 1.15 + 0.02 - cb) * al
          rough += 0.2 * al
        } else {
          cr += (color![0] - cr) * al; cg += (color![1] - cg) * al; cb += (color![2] - cb) * al
          if (m.effect === 'stain') rough += 0.15 * al
        }
      }
      // chips: the scan's darkest texels show bare metal through paint and markings alike
      if (sc && chipAt[r]! >= 0 && s.lum < chipAt[r]!) { [cr, cg, cb] = bare; metal = 1; rough = 0.35 }
      // panel lines, hinge lines and rivets
      for (const l of lines.get(q.id) ?? []) {
        const c = l.axis === 'u' ? u : v, o = l.axis === 'u' ? v : u
        const halfM = LINE_HALF_M[l.kind], hw = Math.max(halfM, spacing)
        if (o < l.fromM - hw || o > l.toM + hw) continue
        const d = Math.abs(c - l.atM), w = Math.max(0, 1 - d / hw)
        h -= LINE_DEPTH_M[l.kind] * w
        const dirt = 1 - SEAM_DIRT * w
        cr *= dirt; cg *= dirt; cb *= dirt
        if (l.kind !== 'panel' || !surf.rivets) continue
        for (const side2 of [-1, 1]) {
          const row = l.atM + side2 * RIVET.offsetM
          if (spacing < RIVET.dotsBelowM) {
            const oc = l.fromM + RIVET.pitchM * Math.round((o - l.fromM) / RIVET.pitchM)
            const dd = Math.sqrt((c - row) * (c - row) + (o - oc) * (o - oc))
            h += RIVET.heightM * Math.max(0, 1 - dd / RIVET.radiusM)
          } else {
            const rw = Math.max(RIVET.radiusM, spacing)
            h += RIVET.heightM * 0.3 * Math.max(0, 1 - Math.abs(c - row) / rw)
          }
        }
      }
      out.color[3 * i] = cr; out.color[3 * i + 1] = cg; out.color[3 * i + 2] = cb
      out.rough[i] = Math.min(1, Math.max(0.04, rough)); out.metal[i] = metal; out.height[i] = h
      out.scanN[3 * i] = s.n[0] * surf.scanNormal; out.scanN[3 * i + 1] = s.n[1] * surf.scanNormal; out.scanN[3 * i + 2] = s.n[2]
    }
    return out
  }
  ```
  ```ts
  // tools/models/skin/compose.ts
  import type { Painted } from './layers.js'
  import type { Sidecar } from './sidecar.js'
  import { linearToSrgb8 } from './colors.js'

  export interface SkinMaps { readonly size: number; readonly baseColor: Uint8Array; readonly metallicRoughness: Uint8Array; readonly normal: Uint8Array }

  const NEUTRAL = { base: [128, 128, 128], mr: [255, 230, 0], nrm: [128, 128, 255] } as const
  /** Normal tilt per groove unit of height change per texel (layers.ts: height is in groove units). */
  export const NORMAL_GAIN = 1
  const byte = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 255)

  /**
   * The 2x samples down to atlas texels (covered samples averaged), height to a tangent-space
   * normal (glTF convention: +x toward +u, +y toward -v, the top of the image), blended with the
   * scan normal (whiteout), encoded; then `paddingPx` rounds of dilation, each uncovered texel
   * copying its first covered neighbor (left, right, up, down) from the round before, so padding
   * holds its own patch (Review Focus 4). What is still uncovered gets a neutral value.
   */
  export function compose(p: Painted, side: Sidecar, atlasPx: number): SkinMaps {
    const W = atlasPx, S = p.size / W, n = W * W
    if (!Number.isInteger(S) || S < 1) throw new Error(`compose: sample grid ${p.size} is not a multiple of the ${W} px atlas`)
    const covered = new Uint8Array(n), patch = new Int32Array(n).fill(-1)
    const color = new Float32Array(3 * n), rough = new Float32Array(n), metal = new Float32Array(n), height = new Float32Array(n), sn = new Float32Array(3 * n)
    for (let ty = 0; ty < W; ty++) for (let tx = 0; tx < W; tx++) {
      const t = ty * W + tx
      let c = 0
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const i = (ty * S + sy) * p.size + tx * S + sx
        if (!p.covered[i]) continue
        if (c === 0) patch[t] = p.patch[i]!
        c++
        for (let k = 0; k < 3; k++) { color[3 * t + k]! += p.color[3 * i + k]!; sn[3 * t + k]! += p.scanN[3 * i + k]! }
        rough[t]! += p.rough[i]!; metal[t]! += p.metal[i]!; height[t]! += p.height[i]!
      }
      if (c === 0) continue
      covered[t] = 1
      for (let k = 0; k < 3; k++) { color[3 * t + k]! /= c; sn[3 * t + k]! /= c }
      rough[t]! /= c; metal[t]! /= c; height[t]! /= c
    }
    const baseColor = new Uint8Array(3 * n), metallicRoughness = new Uint8Array(3 * n), normal = new Uint8Array(3 * n)
    const same = (t: number, dx: number, dy: number): number => {
      const x = (t % W) + dx, y = Math.floor(t / W) + dy
      if (x < 0 || y < 0 || x >= W || y >= W) return -1
      const o = y * W + x
      return covered[o] && patch[o] === patch[t] ? o : -1
    }
    const slope = (t: number, dx: number, dy: number): number => {
      const a = same(t, -dx, -dy), b = same(t, dx, dy)
      if (a >= 0 && b >= 0) return (NORMAL_GAIN * (height[b]! - height[a]!)) / 2
      if (b >= 0) return NORMAL_GAIN * (height[b]! - height[t]!)
      if (a >= 0) return NORMAL_GAIN * (height[t]! - height[a]!)
      return 0
    }
    for (let t = 0; t < n; t++) {
      if (!covered[t]) continue
      for (let k = 0; k < 3; k++) baseColor[3 * t + k] = linearToSrgb8(color[3 * t + k]!)
      metallicRoughness[3 * t] = 255; metallicRoughness[3 * t + 1] = byte(rough[t]!); metallicRoughness[3 * t + 2] = byte(metal[t]!)
      // height normal: dh/du along +x (image right), dh/dv along +y (image down); glTF +y is image up
      let hx = -slope(t, 1, 0), hy = slope(t, 0, 1), hz = 1
      const hl = Math.sqrt(hx * hx + hy * hy + hz * hz); hx /= hl; hy /= hl; hz /= hl
      let sx = sn[3 * t]!, sy = sn[3 * t + 1]!, sz = sn[3 * t + 2]!
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1; sx /= sl; sy /= sl; sz /= sl
      let nx = hx + sx, ny = hy + sy, nz = hz * sz
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl
      normal[3 * t] = byte(nx * 0.5 + 0.5); normal[3 * t + 1] = byte(ny * 0.5 + 0.5); normal[3 * t + 2] = byte(nz * 0.5 + 0.5)
    }
    for (let round = 0; round < side.paddingPx; round++) {
      const was = covered.slice()
      for (let t = 0; t < n; t++) {
        if (was[t]) continue
        const x = t % W, y = (t - x) / W
        const from = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].find(([a, b]) => a! >= 0 && b! >= 0 && a! < W && b! < W && was[b! * W + a!])
        if (!from) continue
        const o = from[1]! * W + from[0]!
        for (let k = 0; k < 3; k++) { baseColor[3 * t + k] = baseColor[3 * o + k]!; metallicRoughness[3 * t + k] = metallicRoughness[3 * o + k]!; normal[3 * t + k] = normal[3 * o + k]! }
        covered[t] = 1; patch[t] = patch[o]!
      }
    }
    for (let t = 0; t < n; t++) {
      if (covered[t]) continue
      for (let k = 0; k < 3; k++) { baseColor[3 * t + k] = NEUTRAL.base[k]!; metallicRoughness[3 * t + k] = NEUTRAL.mr[k]!; normal[3 * t + k] = NEUTRAL.nrm[k]! }
    }
    return { size: W, baseColor, metallicRoughness, normal }
  }
  ```
  Byte `128` is `round(0.5 × 255)`, and a flat normal encodes as `[128, 128, 255]`. The layer test pins exactly that away from any line.

  **The groove, worked once.** The line is at v = 0.8 m, the boundary between texel rows 23 and 24. Samples are 2.5 cm apart, so the line is one sample wide, and rows 23 and 24 each average h = -0.25. At row 23 the slope is `(h24 - h22)/2 = -0.125`, so `hy = -0.125` and green = round((0.5 - 0.062) × 255) = 112. At row 25 it is +0.125, green 144. On the row above a line (smaller v), height falls as v grows: `dh/dv < 0`, green < 128. That texel's normal points toward +v, down the image and toward the groove, which is what a slope into a groove does. Below the line it is the mirror. If the layer test fails the other way round, the sign in `hy` is wrong. Fix that line only.

- [ ] **Step 5: Run the layer tests, look at the maps, then record the goldens.**
  ```bash
  npx vitest run tests/tools/models/skin/layers.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: rc=0. Then write the fixture's three maps as PNGs to the session scratchpad with a throwaway `npx tsx -e` script. Use `sharp(buf, { raw: { width: 64, height: 64, channels: 3 } }).resize(512, 512, { kernel: 'nearest' }).png().toFile(...)`. Build the maps with the golden test's `side`: the fixture plus the feathered disc. **Read all three PNGs.** Check:
  - base color: green top, pale underside patch, a red disc near the top-left of patch 0, and a dark seam line;
  - normal: flat lavender (128,128,255) except a thin bevel at row 24;
  - metallic-roughness: uniform except the seam.

  Only after looking, run the golden test once and copy the three hashes from its failure diff into `RAW`, replacing every `RECORD_AT_STEP_5`:
  ```bash
  npx vitest run tests/tools/models/skin/golden.test.ts --maxWorkers=1; echo "rc=$?"   # fails, printing the hashes
  ```
  Record in the ledger that the goldens were recorded from maps you had looked at.

- [ ] **Step 6: Run both, and the two earlier skin suites.**
  ```bash
  npx vitest run tests/tools/models/skin --maxWorkers=2; echo "rc=$?"
  ```
  Expected: rc=0.

- [ ] **Step 7: Commit.** `grep -c RECORD_AT_STEP_5 tests/tools/models/skin/golden.test.ts` must print `0`.
  ```bash
  git add tools/models/skin/layers.ts tools/models/skin/compose.ts tools/models/skin/colors.ts tests/tools/models/skin/layers.test.ts tests/tools/models/skin/golden.test.ts
  git commit -m "DP0: skin layers (paint, finish, markings, panel lines, rivets) and composition, with raw goldens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---
### Task 7: The skin stage in the build, and the flat-shaded allowlist

**Files:**
- Create: `tools/models/skin/stage.ts`
- Modify: `tools/models/build.ts`
- Modify: `tests/tools/models/build.test.ts`, `tests/tools/models/shipStages.test.ts` (their fake `BuildDeps`)
- Modify: `tests/tools/models/skin/golden.test.ts` (the WebP half)
- Create: `tests/tools/models/skins.test.ts`

**Interfaces:**
- Consumes: Tasks 3-6.
- Produces:
  - `SKIN_WEBP_QUALITY = 90`;
  - `interface SkinImages { baseColor: Uint8Array; metallicRoughness: Uint8Array; normal: Uint8Array }` (WebP bytes);
  - `type ScanLoader = (id: ScanId) => Promise<Scan>`;
  - `renderSkinMaps(doc, side, scans?: ScanLoader): Promise<SkinMaps>`;
  - `encodeSkinMaps(m: SkinMaps): Promise<SkinImages>`;
  - `skinMaterialName(id) = \`${id}-skin\``;
  - `skinDocument(doc, id, side, scans?): Promise<SkinImages>`;
  - `attachSkinTextures(doc, id, images): void`.
  - `BuildDeps` gains `readText(path: string): string` and `scan: ScanLoader`.
  - `runPipeline(doc, entry, shipSpec = loadShipSpec, skin: SkinImages | null = null)`.
  - Texture names: `<id>-skin-baseColor`, `<id>-skin-metallicRoughness`, `<id>-skin-normal`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/tools/models/build.test.ts` (read its imports first and reuse them; add `parseModelEntry`, `modelIO` and the fixture if absent):
  ```ts
  import { fixtureDoc, fixtureSidecar, flatScan } from './skin/fixture.js'

  describe('a skinned Blender entry (DP0)', () => {
    const hangar = (): ModelEntry => parseModelEntry({ ...JSON.parse(readFileSync('tools/models/entries/hangar.json', 'utf8')), skin: true })
    const deps = (over: Partial<BuildDeps> = {}): { deps: BuildDeps; written: Map<string, Uint8Array>; log: string[] } => {
      const written = new Map<string, Uint8Array>(), log: string[] = []
      return {
        written, log,
        deps: {
          ...nodeBuildDeps(), haveBlender: () => true, blender: () => {},
          exists: (p) => p.endsWith('.skin.json'), read: async () => fixtureDoc(512),
          readText: () => JSON.stringify(fixtureSidecar()), scan: async () => flatScan(),
          write: (p, b) => { written.set(p, b) }, log: (l) => { log.push(l) }, ...over,
        },
      }
    }

    it('builds one skin material with three WebP maps, TEXCOORD_0 on every primitive, in one draw', async () => {
      const d = deps()
      expect(await runBuild([hangar()], ['hangar'], d.deps), d.log.join('\n')).toBe(0)
      const doc = await modelIO().readBinary(d.written.get('content/buildings/hangar.glb')!)
      expect(doc.getRoot().listMaterials().map((m) => m.getName())).toEqual(['hangar-skin'])
      expect(doc.getRoot().listTextures().map((t) => t.getName()).sort()).toEqual(['hangar-skin-baseColor', 'hangar-skin-metallicRoughness', 'hangar-skin-normal'])
      expect(doc.getRoot().listTextures().every((t) => t.getMimeType() === 'image/webp')).toBe(true)
      for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) expect(p.getAttribute('TEXCOORD_0')).not.toBeNull()
      expect(measureDocument(doc).drawCalls).toBe(1)
    })

    it('refuses a skin entry whose script wrote no sidecar, and a sidecar its entry did not ask for', async () => {
      const none = deps({ exists: () => false })
      expect(await runBuild([hangar()], ['hangar'], none.deps)).toBe(1)
      expect(none.log.join('\n')).toMatch(/wrote no .*skin\.json/)
      const plain = parseModelEntry(JSON.parse(readFileSync('tools/models/entries/hangar.json', 'utf8')))
      const extra = deps()
      expect(await runBuild([plain], ['hangar'], extra.deps)).toBe(1)
      expect(extra.log.join('\n')).toMatch(/has no "skin": true/)
    })
  })
  ```
  Create `tests/tools/models/skins.test.ts`:
  ```ts
  // tests/tools/models/skins.test.ts
  import { describe, expect, it } from 'vitest'
  import { readFileSync } from 'node:fs'
  import { loadModelEntries } from '../../../tools/models/manifest.js'
  import { modelIO } from '../../../tools/models/document.js'
  import { measureDocument } from '../../../tools/models/measure.js'

  /**
   * Entries still flat-shaded: no UVs, no textures (model-detail-pass spec §6). The list shrinks
   * with each plan and never grows; DP3 deletes it. Blender entries leave it as they are skinned;
   * the four downloads are the ships made for 3D printing (spec §2, §8 Q1, DP2).
   */
  const FLAT_SHADED: readonly string[] = [
    'aaa', 'ammunition-bunker', 'b-29-superfortress', 'barracks-and-huts', 'casablanca-cve', 'cleveland-cl',
    'coastal-gun-battery', 'essex-cv', 'fuel-tank-farm', 'hangar', 'kagero-dd', 'ki-21-sally', 'ki-84-frank',
    'mogami-ca', 'p-38-lightning', 'pennsylvania-bb', 'pier-and-warehouses', 'radio-radar-station', 'revetment',
    'tower', 'yamato-bb',
  ]
  /** Lower it with every entry that leaves the list; never raise it. */
  const CEILING = 21

  const entries = loadModelEntries().filter((e) => e.source.kind !== 'generated')
  const read = async (path: string) => modelIO().readBinary(new Uint8Array(readFileSync(path)))

  describe('the flat-shaded allowlist (DP0)', () => {
    it('only shrinks: sorted, unique, every id an entry, at most CEILING', () => {
      expect([...FLAT_SHADED].sort()).toEqual(FLAT_SHADED)
      expect(new Set(FLAT_SHADED).size).toBe(FLAT_SHADED.length)
      for (const id of FLAT_SHADED) expect(entries.some((e) => e.id === id), id).toBe(true)
      expect(FLAT_SHADED.length).toBeLessThanOrEqual(CEILING)
    })
    it.each(entries.map((e) => [e.id, e] as const))('%s is listed exactly when its committed output is untextured', async (id, e) => {
      const m = measureDocument(await read(e.output))
      expect(FLAT_SHADED.includes(id), `${id}: ${m.textures} textures`).toBe(m.textures === 0)
    })
  })

  const skinned = entries.filter((e) => e.source.kind === 'blender' && !FLAT_SHADED.includes(e.id))
  describe.each(skinned.map((e) => [e.id, e] as const))('skinned %s (DP0, spec §6)', (id, e) => {
    it('its entry says skin: true', () => { expect(e.skin).toBe(true) })
    it('one skin material: base-color, metallic-roughness and normal WebP maps at its atlas size; TEXCOORD_0 and no TEXCOORD_1', async () => {
      const doc = await read(e.output)
      const mats = doc.getRoot().listMaterials()
      expect(mats.map((m) => m.getName())).toEqual([`${id}-skin`])
      const mat = mats[0]!
      for (const t of [mat.getBaseColorTexture(), mat.getMetallicRoughnessTexture(), mat.getNormalTexture()]) {
        expect(t).not.toBeNull(); expect(t!.getMimeType()).toBe('image/webp')
      }
      expect(measureDocument(doc).maxTextureSize).toBe(e.textures.maxSize)
      for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
        expect(p.getAttribute('TEXCOORD_0')).not.toBeNull(); expect(p.getAttribute('TEXCOORD_1')).toBeNull()
      }
    })
  })

  it('no Blender entry says skin: true while its output is still listed flat', () => {
    for (const e of entries) if (FLAT_SHADED.includes(e.id)) expect(e.skin, e.id).toBeUndefined()
  })
  ```
  In Task 7 no model is skinned yet, so `skinned` is empty. Vitest's `describe.each([])` registers nothing, which is expected here. Tasks 8 and 10 give it members.

- [ ] **Step 2: Run them to verify they fail.**
  ```bash
  npx vitest run tests/tools/models/build.test.ts tests/tools/models/skins.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: `build.test.ts` FAILS (no `readText` on `BuildDeps`, no skin branch). `skins.test.ts` PASSES already: it describes today's state, which is the point of an allowlist.

- [ ] **Step 3: `tools/models/skin/stage.ts`.**
  ```ts
  // tools/models/skin/stage.ts
  import type { Document } from '@gltf-transform/core'
  import { EXTTextureWebP } from '@gltf-transform/extensions'
  import sharp from 'sharp'
  import { rasterize, trianglesOf } from './raster.js'
  import { paint } from './layers.js'
  import { compose, type SkinMaps } from './compose.js'
  import { loadScan, type Scan } from './scans.js'
  import { surfaceFor, type ScanId } from './surfaces.js'
  import type { Sidecar } from './sidecar.js'

  /** One quality for all three maps, like O1's; a change moves every skinned glb's bytes. */
  export const SKIN_WEBP_QUALITY = 90
  export interface SkinImages { readonly baseColor: Uint8Array; readonly metallicRoughness: Uint8Array; readonly normal: Uint8Array }
  export type ScanLoader = (id: ScanId) => Promise<Scan>

  export const skinMaterialName = (id: string): string => `${id}-skin`

  /** The three maps of a kit export and its sidecar, at the sidecar's atlas size. Scans load in
   *  sorted order, once each. */
  export async function renderSkinMaps(doc: Document, side: Sidecar, scans: ScanLoader = loadScan): Promise<SkinMaps> {
    const t = trianglesOf(doc, side, side.atlasPx)
    const ids = [...new Set(t.roles.map((r) => surfaceFor(r).scan).filter((s): s is ScanId => s !== null))].sort()
    const loaded = new Map<ScanId, Scan>()
    for (const id of ids) loaded.set(id, await scans(id))
    return compose(paint(rasterize(t, 2 * side.atlasPx), t.roles, side, loaded, side.atlasPx), side, side.atlasPx)
  }

  export async function encodeSkinMaps(m: SkinMaps): Promise<SkinImages> {
    const webp = async (rgb: Uint8Array): Promise<Uint8Array> =>
      new Uint8Array(await sharp(rgb, { raw: { width: m.size, height: m.size, channels: 3 } }).webp({ quality: SKIN_WEBP_QUALITY }).toBuffer())
    return { baseColor: await webp(m.baseColor), metallicRoughness: await webp(m.metallicRoughness), normal: await webp(m.normal) }
  }

  /**
   * Stage 0 of a skinned Blender entry, on the kit's raw export (DP0): bakes and encodes the atlas,
   * then gives every primitive one skin material in place of its role materials, so join (stage 6)
   * merges the whole airframe into one draw plus its parts. The textures are attached after
   * compressTextures (attachSkinTextures), which would otherwise re-encode them.
   */
  export async function skinDocument(doc: Document, id: string, side: Sidecar, scans: ScanLoader = loadScan): Promise<SkinImages> {
    const images = await encodeSkinMaps(await renderSkinMaps(doc, side, scans))
    const old = doc.getRoot().listMaterials()
    const skin = doc.createMaterial(skinMaterialName(id)).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(1).setRoughnessFactor(1)
    for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
      if (p.getAttribute('TEXCOORD_1')) throw new Error(`${id}: a skinned model has one UV set (spec §4 ruling), found TEXCOORD_1 on ${mesh.getName()}`)
      p.setMaterial(skin)
    }
    for (const m of old) m.dispose()
    return images
  }

  export function attachSkinTextures(doc: Document, id: string, images: SkinImages): void {
    const skin = doc.getRoot().listMaterials().find((m) => m.getName() === skinMaterialName(id))
    if (!skin) throw new Error(`${id}: no ${skinMaterialName(id)} material to attach the skin to`)
    doc.createExtension(EXTTextureWebP).setRequired(true)
    const tex = (label: string, bytes: Uint8Array) => doc.createTexture(`${id}-skin-${label}`).setMimeType('image/webp').setImage(bytes)
    skin.setBaseColorTexture(tex('baseColor', images.baseColor))
      .setMetallicRoughnessTexture(tex('metallicRoughness', images.metallicRoughness))
      .setNormalTexture(tex('normal', images.normal))
  }
  ```

- [ ] **Step 4: Wire it into `tools/models/build.ts`.**
  - Imports:
    ```ts
    import { parseSidecar, skinSidecarPath } from './skin/sidecar.js'
    import { attachSkinTextures, skinDocument, type ScanLoader, type SkinImages } from './skin/stage.js'
    import { loadScan } from './skin/scans.js'
    ```
  - `runPipeline` signature and the attach step:
    ```ts
    export async function runPipeline(doc: Document, entry: ModelEntry, shipSpec: (id: string) => ShipSpec = loadShipSpec, skin: SkinImages | null = null): Promise<Document> {
    ```
    and replace `// 6. textures, 7. opaque` and the line after it with:
    ```ts
      // 6. textures, 7. opaque. A skin's maps go on after compressTextures, which would re-encode them (DP0).
      await compressTextures(doc, entry.textures.maxSize)
      if (skin) attachSkinTextures(doc, entry.id, skin)
    ```
  - `BuildDeps`, after `blender(…)`:
    ```ts
      /** A text file (the skin sidecar, DP0). */
      readText(path: string): string
      /** A pinned scan for the skin stage (skin/scans.ts's loadScan). */
      scan: ScanLoader
    ```
  - In `runBuild`, replace the `blender` branch:
    ```ts
          } else if (source.kind === 'blender') {
            // Blender runs are serial (spec §4.1): this loop awaits each entry before the next.
            const raw = blenderIntermediate(entry.id)
            deps.blender(source.script, raw)
            const read = await deps.read(raw)
            // runBlenderScript deletes a stale sidecar first, so one here is this run's (DP0).
            const sidecar = skinSidecarPath(raw)
            let skin: SkinImages | null = null
            if (entry.skin) {
              if (!deps.exists(sidecar)) throw new Error(`the entry says skin: true, but ${source.script} wrote no ${sidecar} (kit.Model(name, skin=<px>))`)
              skin = await skinDocument(read, entry.id, parseSidecar(deps.readText(sidecar)), deps.scan)
            } else if (deps.exists(sidecar)) {
              throw new Error(`${source.script} wrote a skin sidecar, but the entry has no "skin": true`)
            }
            doc = await runPipeline(read, entry, loadShipSpec, skin)
    ```
  - `nodeBuildDeps()` gains `readText: (p) => readFileSync(p, 'utf8'),` and `scan: loadScan,`.
  - Find every other `BuildDeps` literal and add the two members there too:
    ```bash
    grep -rn "haveBlender:" tests tools
    ```
    In the tests' fakes, add `readText: () => { throw new Error('readText: not used by this test') }, scan: () => Promise.reject(new Error('scan: not used by this test'))`. `nodeBuildDeps()` spreads cover the rest.

- [ ] **Step 5: The WebP golden.** Append to `tests/tools/models/skin/golden.test.ts`:
  ```ts
  import sharp from 'sharp'
  import { encodeSkinMaps } from '../../../../tools/models/skin/stage.js'

  /** Recorded at DP0 Task 7 Step 5 with the sharp version named; a sharp upgrade that moves them is a finding. */
  const WEBP = { sharp: 'RECORD_AT_STEP_5', baseColor: 'RECORD_AT_STEP_5', metallicRoughness: 'RECORD_AT_STEP_5', normal: 'RECORD_AT_STEP_5' }

  describe('the skin golden image, encoded (DP0, spec §9)', () => {
    it(`the WebP bytes hash to the goldens recorded with sharp ${WEBP.sharp}`, async () => {
      expect(sharp.versions.sharp).toBe(WEBP.sharp)
      const e = await encodeSkinMaps(goldenMaps())
      expect({ baseColor: sha(e.baseColor), metallicRoughness: sha(e.metallicRoughness), normal: sha(e.normal) })
        .toEqual({ baseColor: WEBP.baseColor, metallicRoughness: WEBP.metallicRoughness, normal: WEBP.normal })
    })
  })
  ```
  Move the imports to the top of the file with the others. Run it once, copy the version and the three hashes from the failure into `WEBP`, and confirm `grep -c RECORD_AT_STEP_5` prints `0`.

- [ ] **Step 6: Run the touched suites.**
  ```bash
  npx vitest run tests/tools/models/build.test.ts tests/tools/models/shipStages.test.ts tests/tools/models/skins.test.ts tests/tools/models/skin --maxWorkers=2; echo "rc=$?"
  npx tsc --noEmit -p .; echo "tsc rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: all rc=0. Every unskinned Blender entry still rebuilds byte-identically through the changed `runBuild` (Review Focus 1).

- [ ] **Step 7: Commit.**
  ```bash
  git add tools/models/skin/stage.ts tools/models/build.ts tests/tools/models/build.test.ts tests/tools/models/shipStages.test.ts tests/tools/models/skin/golden.test.ts tests/tools/models/skins.test.ts
  git commit -m "DP0: the skin stage in the build; the flat-shaded allowlist at 21

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 8: Pilot one, the hangar: geometry detail and its skin

**Files:**
- Modify: `tools/models/blender/hangar.py`
- Modify: `tools/models/entries/hangar.json`
- Modify: `tests/tools/models/blender/hangar.test.ts`
- Modify: `tests/tools/models/skins.test.ts` (the list and the ceiling)
- Modify: `content/buildings/hangar.glb` (rebuilt)

**Interfaces:**
- Consumes: the kit (Task 2), the stage (Task 7).
- Produces: `content/buildings/hangar.glb` skinned: one draw, a 512 px atlas, at most 5,000 triangles and 500,000 bytes. Its raw export has nodes `hangar_concrete`, `hangar_steel`, `hangar_dark` and `hangar_glazing` (4 roles, so 4 raw draws).

- [ ] **Step 1: Update the hangar tests first** in `tests/tools/models/blender/hangar.test.ts`:
  - Import `skinSidecarPath` from `run.js`, and `worldTriangles` and `coplanarOverlaps` from `../buildingGeometry.js`.
  - At the top of the file, add the script's eave figure:
    ```ts
    /** hangar.py's EAVE_OUT_M (DP0): the steel's footprint is the walls' plus an eave each side. */
    const EAVE_OUT_M = 0.35
    ```
  - In `'the steel structure fits the sim footprint and stands on y = 0'`, change the width line to:
    ```ts
        within1pct(bb.max[0] - bb.min[0], cited.widthM + 2 * EAVE_OUT_M, 'width (x), eaves included')
    ```
    and, in `'takes the Dulag footprint by argument'`:
    ```ts
        within1pct(bb.max[0] - bb.min[0], 22 + 2 * EAVE_OUT_M, 'Dulag width, eaves included')
    ```
    The height line stays: the ribs add 0.06 m to 14.0 m, which is 0.43%.
  - **Replace** the test `'is inside the spec §4.4 building budget: 5k triangles, 4 draw calls, 0.5 MB, no textures'` with the raw export's new contract. The textured-output checks move to `skins.test.ts` and the committed-output budget stays in `outputs.test.ts`:
    ```ts
      it('the raw export: at most 5k triangles in its 4 role nodes, UVs on every primitive, and its skin sidecar (DP0)', () => {
        const m = measureDocument(doc)
        expect(m.triangles).toBeLessThanOrEqual(5000)
        expect(m.drawCalls).toBeLessThanOrEqual(4)
        expect(m.textures).toBe(0) // the kit writes UVs; the build's skin stage adds the textures
        for (const p of doc.getRoot().listMeshes().flatMap((x) => x.listPrimitives())) expect(p.getAttribute('TEXCOORD_0')).not.toBeNull()
        const side = JSON.parse(readFileSync(skinSidecarPath(a), 'utf8')) as { atlasPx: number; markings: { kind: string }[] }
        expect(side.atlasPx).toBe(512)
        expect(side.markings.filter((k) => k.kind === 'grid')).toHaveLength(3)
      })

      it('no two faces lie in one plane facing one way and overlapping: a skin would show the z-fight (DP0)', () => {
        const tris = doc.getRoot().listNodes().filter((n) => n.getMesh()).flatMap((n) => worldTriangles(n).map((tri, i) => ({ label: `${n.getName()}#${i}`, where: n.getName(), tri })))
        expect(coplanarOverlaps(tris)).toEqual([])
      }, 60_000)
    ```
  - `'the door leaves stand at the open +z end only'` stays. The window frames are `steel`, so `hangar_dark` is still only the doors and their rails.

- [ ] **Step 2: Run to verify it fails.**
  ```bash
  npx vitest run tests/tools/models/blender/hangar.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: FAIL (the width, the missing sidecar).

- [ ] **Step 3: Rewrite `tools/models/blender/hangar.py`.** Keep every existing figure and its line in the header. Add the Task 1 figures to the header, each with its CITED/ESTIMATE label and read date. Change `Leaves out:` to `Leaves out: interior.` Then:
  ```python
  WALL_M = 5.5
  RISE_PER_WIDTH = 0.25
  WALL_T = 0.35
  SHELL_T = 0.3
  DOOR_T = 0.15
  GABLE_INSET = 0.05
  MIN_SIZE_M = 4.0
  # DP0 detail (Task 1 figures; every one an ESTIMATE unless its header line cites a source)
  SHEET_M, LAP_M = 0.8, 2.4          # corrugated sheet width, end-lap spacing
  RIB_EVERY_M, RIB_PROUD_M, RIB_W_M = 3.0, 0.06, 0.25
  WINDOW_W_M, WINDOW_H_M, SILL_M, WINDOW_EVERY_M = 1.2, 0.9, 3.2, 4.0
  FRAME_M = 0.08                     # window frame member, and how far the side members stand proud
  EAVE_OUT_M, EAVE_D_M = 0.35, 0.25
  RAIL_H_M, RAIL_PROUD_M = 0.2, 0.05  # door rails
  EMBED_M = 0.02                     # every addition sinks this far into what it sits on: no coplanar faces (DP0)

  out, opts = kit.cli_args()
  width = kit.positive(opts, 'width', 34, MIN_SIZE_M)
  length = kit.positive(opts, 'length', 42, MIN_SIZE_M)
  rise = width * RISE_PER_WIDTH

  m = kit.Model('hangar', skin=512)
  with m.tagged('slab'):
      m.box('concrete', (0.0, -0.3, 0.0), (width + 1.0, 0.3, length + 1.0))
  with m.tagged('walls'):
      for side in (-1, 1):
          m.box('steel', (side * (width / 2 - WALL_T / 2), 0.0, 0.0), (WALL_T, WALL_M, length))
          # Eave: under the springing, sunk into the wall top, its ends past the wall ends so no end is flush.
          m.box('steel', (side * (width / 2 + (EAVE_OUT_M - EMBED_M) / 2), WALL_M - EAVE_D_M, 0.0),
                (EAVE_OUT_M + EMBED_M, EAVE_D_M + EMBED_M, length + 0.2))
  with m.tagged('roof'):
      m.barrel_vault('steel', (0.0, WALL_M, 0.0), width, rise, length, SHELL_T, 24)
      # Ribs stand RIB_PROUD_M off the shell; their inner face sinks EMBED_M into it. None at an end.
      ribs = int(length // RIB_EVERY_M)
      for i in range(ribs):
          z = -length / 2 + (i + 0.5) * length / ribs
          m.barrel_vault('steel', (0.0, WALL_M, z), width + 2 * RIB_PROUD_M, rise + RIB_PROUD_M, RIB_W_M, RIB_PROUD_M + EMBED_M, 16)
  with m.tagged('gable'):
      # (the existing comment on the inset gable stays here)
      m.arch_gable('steel', (0.0, 0.0, -length / 2 + GABLE_INSET + SHELL_T / 2), width - SHELL_T, WALL_M, rise - SHELL_T / 2, SHELL_T, 24)
  with m.tagged('windows'):
      count = int(length // WINDOW_EVERY_M)
      for side in (-1, 1):
          face = side * width / 2
          for i in range(count):
              z = -length / 2 + (i + 0.5) * length / count
              # Glass: through the wall face, 0.01 m proud; into the frames on every side.
              m.box('glazing', (face - side * 0.01, SILL_M - EMBED_M, z), (0.04, WINDOW_H_M + 2 * EMBED_M, WINDOW_W_M + 2 * EMBED_M))
              # Sides stand FRAME_M proud; head and sill 0.01 m more, so no two frame faces share a plane.
              for dz in (-1, 1):
                  m.box('steel', (face + side * (FRAME_M - EMBED_M) / 2, SILL_M - FRAME_M / 2, z + dz * (WINDOW_W_M + FRAME_M) / 2),
                        (FRAME_M + EMBED_M, WINDOW_H_M + FRAME_M, FRAME_M))
              for y in (SILL_M - FRAME_M, SILL_M + WINDOW_H_M):
                  m.box('steel', (face + side * (FRAME_M + 0.01 - EMBED_M) / 2, y, z), (FRAME_M + 0.01 + EMBED_M, FRAME_M, WINDOW_W_M + 2 * FRAME_M + 0.02))
  with m.tagged('doors'):
      for side in (-1, 1):
          cx = side * (width / 2 - WALL_T - width / 8)
          m.box('dark', (cx, 0.0, length / 2 - DOOR_T), (width / 4, WALL_M, DOOR_T))
          outer = length / 2 - DOOR_T / 2
          for y in (WALL_M / 3, 2 * WALL_M / 3):
              m.box('dark', (cx, y, outer + (RAIL_PROUD_M - EMBED_M) / 2), (width / 4 - 0.2, RAIL_H_M, RAIL_PROUD_M + EMBED_M))
  # Corrugated sheet laps, world-aligned (the skin's grid cuts them on axes lying in each surface).
  m.marking('grid', tags=['walls'], spacingM=[None, LAP_M, SHEET_M], widthM=0.03, depth=0.8)
  m.marking('grid', tags=['roof'], spacingM=[LAP_M, None, SHEET_M], widthM=0.03, depth=0.8)
  m.marking('grid', tags=['gable'], spacingM=[SHEET_M, LAP_M, None], widthM=0.03, depth=0.8)
  m.export(out)
  ```
  Python's `None` serializes to JSON `null`, which is what the schema's nullable spacing expects.

  Check the geometry against the no-coplanar rule before building:
  - Side frames stand `FRAME_M`; head and sill stand `FRAME_M + 0.01`, and run 0.01 m past the side frames at each end, so their end faces are not flush with the side frames' outer faces.
  - Side frames run from `SILL_M - FRAME_M/2` to `SILL_M + WINDOW_H_M + FRAME_M/2`. Their top and bottom faces sit halfway into the head and sill, not flush with them.
  - Glass extends `EMBED_M` into the frames all round.

- [ ] **Step 4: The entry.** In `tools/models/entries/hangar.json`, add `"skin": true` after `"license"`'s closing `}` of `source` (a top-level key). `textures.maxSize` stays 512; the budget is unchanged.

- [ ] **Step 5: Build and read the result.**
  ```bash
  npx vitest run tests/tools/models/blender/hangar.test.ts --maxWorkers=1; echo "rc=$?"
  npm run models:build -- hangar; echo "rc=$?"
  npx tsx tools/models/inspect.ts content/buildings/hangar.glb | head -12
  ```
  Expected: the tests pass, and the build line reports ≤ 500,000 bytes, ≤ 5,000 triangles and **1 draw call**. Copy the build line into the ledger.
  - **Over 500,000 bytes:** first drop the rib segments from 16 to 12, then the window count to one per 5 m. Never raise `maxBytes`. The spec keeps every family inside its budget. Record each step as a `Ruling:` with the byte counts.
  - **A coplanar overlap:** move the named part by `EMBED_M`. Never delete the test.

- [ ] **Step 6: Look at it before going on.** Render the three maps to PNG (upscaled ×2, nearest) in the scratchpad, using `renderSkinMaps` on the raw `tools/models/cache/hangar.glb` and its sidecar. **Read them.** Also render a quick lit view: `npm run models:preview -- hangar` if that script exists (`grep -n preview package.json`), otherwise skip to Task 12's captures. Check:
  - laps run vertically on the walls and along the roof;
  - the windows are glazing-dark, framed in steel;
  - no black texels, and no bright seams at patch edges.

  Record what you saw in the ledger.

- [ ] **Step 7: Shrink the allowlist.** In `tests/tools/models/skins.test.ts`, remove `'hangar'` from `FLAT_SHADED` and set `CEILING = 20`.

- [ ] **Step 8: Run the model suites.**
  ```bash
  npx vitest run tests/tools/models/skins.test.ts tests/tools/models/outputs.test.ts tests/tools/models/blenderEntries.test.ts tests/tools/models/blender/hangar.test.ts --maxWorkers=1; echo "rc=$?"
  npx vitest run tests/render/hangar --maxWorkers=2; echo "rc=$?"
  ```
  Expected: rc=0 for both. The hangar now rebuilds byte-identically **with** its skin, and `skins.test.ts` runs the skinned-hangar block. If `outputs.test.ts` pins an `ASSETS.md` row that names every scan, Task 13 adds the rows. If it fails now on a missing row, add the two scan rows here instead (Task 13 Step 3 has the text), and say so in the commit message.

- [ ] **Step 9: Commit.**
  ```bash
  git add tools/models/blender/hangar.py tools/models/entries/hangar.json tests/tools/models/blender/hangar.test.ts tests/tools/models/skins.test.ts content/buildings/hangar.glb
  git commit -m "DP0: the hangar pilot, detailed and skinned (ribs, eaves, windows, door rails; laps; one draw)

Replaces hangar.test.ts's no-textures pin deliberately: the raw export carries UVs and a sidecar,
and skins.test.ts checks the built output's three maps.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---
### Task 9: The kit's aircraft detail parts (opt-in)

Spec §3's aircraft kit work: more loft stations and ring segments; control surfaces as their own pieces with a hinge gap; a real canopy (frame hoops and glazing as separate materials); spinner and blades with twist. Fillets, the cowling lip and exhaust stacks are script-level uses of these parts (Task 10). **Every new argument defaults to today's behavior.** R3's four aircraft rebuild byte-identically.

**Files:**
- Modify: `tools/models/blender/kit.py`
- Create: `tests/tools/models/blender/fixtures/kit_detail_probe.py`
- Create: `tests/tools/models/blender/kitDetail.test.ts`

**Interfaces:**
- Produces (Python):
  - `AIRFOIL_STATIONS_FINE`, `CONTROL_GAP_M = 0.012`;
  - `_half_thickness(f, chord, thickness)`;
  - `_airfoil_part(chord, thickness, f0, f1, stations) -> (points, labels)`;
  - `_refine(vals, k) -> (vals, authored indices)`;
  - `fuselage(..., subdivide=1)`;
  - `wing(..., stations=None, span_segments=1, controls=None)`, where `controls` is a list of `(z0, z1, hinge_fraction)` in absolute z (clipped to the panel);
  - `fin(..., stations=None, span_segments=1, controls=None)`, where `controls` is a list of `(h0, h1, hinge_fraction)` in height above the root;
  - `propeller(..., blade_sections=None)`, where `blade_sections` is a list of `(radius fraction, chord scale, pitch deg)` from root to tip;
  - `canopy(glass_role, frame_role, stations, frames, bar=0.02, segments=16, subdivide=1, center_z=0.0, node=None, frame_node=None)`.

- [ ] **Step 1: The probe** `tests/tools/models/blender/fixtures/kit_detail_probe.py` (copy the `sys.path` line from `kit_skin_probe.py`):
  ```python
  # DP0 Task 9: the aircraft detail parts, each in its own node so each can be proven closed and outward.
  import os
  import sys

  sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
  import kit  # noqa: E402

  out, _opts = kit.cli_args()
  m = kit.Model('dp', skin=1024)
  with m.tagged('fuselage'):
      m.fuselage('ijaGreen', [(-4.0, 0.05, 0.08, 0.0), (-1.0, 0.5, 0.6, 0.0), (1.0, 0.55, 0.6, 0.0), (2.0, 0.3, 0.3, 0.0)],
                 segments=32, subdivide=4, node='df_fuse')
  with m.tagged('wing'):
      m.wing('ijaGreen', 0.5, -0.3, 2.0, 1.0, 10.0, dihedral_deg=5.0, stations=kit.AIRFOIL_STATIONS_FINE, span_segments=4,
             controls=[(3.0, 4.5, 0.75)], node='df_wing', lower_role='underside', lower_node='df_wing_lower')
  with m.tagged('fin'):
      m.fin('ijaGreen', -3.0, 0.3, 1.2, 0.6, 1.4, sweep_deg=20.0, stations=kit.AIRFOIL_STATIONS_FINE, controls=[(0.1, 1.3, 0.7)], node='df_fin')
  with m.tagged('prop'):
      m.propeller('dark', (2.3, 0.0, 0.0), 3.0, 2, 0.25, 0.25, 0.4, blade_sections=[(0.1, 1.0, 45.0), (0.5, 1.1, 30.0), (0.95, 0.6, 18.0)], node='Prop')
  with m.tagged('canopy'):
      m.canopy('glazing', 'ijaGreen', [(-1.0, 0.05, 0.05, 0.55), (-0.5, 0.3, 0.3, 0.6), (0.5, 0.3, 0.32, 0.6), (0.9, 0.05, 0.05, 0.55)],
               frames=[-0.5, 0.0, 0.5], subdivide=3, node='df_canopy', frame_node='df_frames')
  m.export(out)
  ```

- [ ] **Step 2: The failing test** `tests/tools/models/blender/kitDetail.test.ts`:
  ```ts
  // tests/tools/models/blender/kitDetail.test.ts
  import { beforeAll, describe, expect, it } from 'vitest'
  import { mkdtempSync, readFileSync } from 'node:fs'
  import { createHash } from 'node:crypto'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import type { Document } from '@gltf-transform/core'
  import { HAVE_BLENDER, runBlenderScript, skinSidecarPath } from '../../../../tools/models/blender/run.js'
  import { findNode, modelIO } from '../../../../tools/models/document.js'
  import { worldTriangles } from '../buildingGeometry.js'

  const PROBE = 'tests/tools/models/blender/fixtures/kit_detail_probe.py'
  const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
  /** Signed volume by the divergence theorem: positive iff the closed shells are wound outward. */
  const volume = (doc: Document, name: string): number => worldTriangles(findNode(doc, name)).reduce((s, [a, b, c]) =>
    s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0)
  const verts = (doc: Document, name: string): number[][] => worldTriangles(findNode(doc, name)).flat()

  describe.skipIf(!HAVE_BLENDER)('the kit aircraft detail parts (DP0 Task 9)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp0-detail-'))
    const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
    let doc: Document
    beforeAll(async () => {
      runBlenderScript(PROBE, a)
      runBlenderScript(PROBE, b)
      doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
    }, 180_000)

    it('rebuilds byte-identically', () => { expect(sha(b)).toBe(sha(a)) })

    it.each(['df_fuse', 'df_wing', 'df_wing_lower', 'df_fin', 'Prop', 'df_canopy', 'df_frames'])('%s is wound outward (positive signed volume)', (n) => {
      expect(volume(doc, n)).toBeGreaterThan(0)
    })

    it('fuselage subdivide: 3 spans x 4 = 13 rings, lines only at the 2 interior authored stations', () => {
      const xs = new Set(verts(doc, 'df_fuse').map((v) => v[0]!.toFixed(4)))
      expect(xs.size).toBe(13)
      const side = JSON.parse(readFileSync(skinSidecarPath(a), 'utf8')) as { patches: { id: number; tag: string; rect: number[] }[]; lines: { patch: number; axis: string }[] }
      const fus = side.patches.filter((p) => p.tag === 'fuselage').sort((p, q) => q.rect[2]! * q.rect[3]! - p.rect[2]! * p.rect[3]!)[0]!
      expect(side.lines.filter((l) => l.patch === fus.id && l.axis === 'u')).toHaveLength(2)
    })

    it('an aileron is its own piece: at z = 3.75 there is a chordwise gap of at least 11 mm at the hinge', () => {
      const at = verts(doc, 'df_wing').concat(verts(doc, 'df_wing_lower')).filter((v) => Math.abs(v[2]! - 3.75) < 1e-4).map((v) => v[0]!).sort((p, q) => q - p)
      const gaps = at.slice(1).map((x, i) => at[i]! - x)
      expect(Math.max(...gaps)).toBeGreaterThanOrEqual(0.011)
    })

    it('twisted blades: the chord pitches 45 deg at the root and 18 at the tip, within 4 deg', () => {
      const pitchAt = (r: number): number => {
        const ring = verts(doc, 'Prop').filter((v) => Math.abs(v[1]! - r) < 1e-4 && Math.abs(v[2]!) < 0.4)
        const xs = ring.map((v) => v[0]!), zs = ring.map((v) => v[2]!)
        return (Math.atan2(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 180) / Math.PI
      }
      expect(Math.abs(pitchAt(0.15) - 45)).toBeLessThanOrEqual(4)
      expect(Math.abs(pitchAt(1.425) - 18)).toBeLessThanOrEqual(4)
    })

    it('the canopy: three frame hoops, each bar-wide, at the given stations', () => {
      const xs = verts(doc, 'df_frames').map((v) => v[0]!)
      for (const x of [-0.5, 0, 0.5]) expect(xs.some((v) => Math.abs(v - x) <= 0.0101), `hoop at ${x}`).toBe(true)
      expect(xs.every((v) => [-0.5, 0, 0.5].some((x) => Math.abs(v - x) <= 0.0101))).toBe(true)
    })
  })
  ```
  In the pitch test, blade 0 (`a = 0`) runs along +y with its chord in the x-z plane. The 2-blade probe puts blade 1 along -y, so filtering at y = r > 0 picks blade 0 only. A 10% airfoil adds at most `atan(0.1)`, about 6°, to the extents' angle at worst. It adds far less at 45° and 18°, which is why the tolerance is 4°. If a measured value lands 4-6° off, read the ring's vertices before touching the tolerance.

- [ ] **Step 3: Run to verify it fails.**
  ```bash
  npx vitest run tests/tools/models/blender/kitDetail.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: FAIL (`unexpected keyword argument 'subdivide'`).

- [ ] **Step 4: The kit.**

  (a) Constants, after `AIRFOIL_STATIONS`:
  ```python
  # Chord stations for detailed sections (DP0): the leading edge's curvature resolved, as the downloads' is.
  AIRFOIL_STATIONS_FINE = (0.0, 0.0125, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0)
  # The gap around a control surface, chordwise and at its spanwise ends (ESTIMATE: visible at Hangar distance).
  CONTROL_GAP_M = 0.012
  ```

  (b) Factor the thickness out of `_airfoil`, keeping its arithmetic **identical** (same expression, same order, so R3's bytes hold):
  ```python
  def _half_thickness(f, chord, thickness):
      return 5 * thickness * chord * (0.2969 * math.sqrt(f) - 0.1260 * f - 0.3516 * f ** 2 + 0.2843 * f ** 3 - 0.1036 * f ** 4)


  def _airfoil(chord, thickness):
      \"\"\"(unchanged docstring)\"\"\"
      upper = [(-f * chord, _half_thickness(f, chord, thickness)) for f in AIRFOIL_STATIONS]
      lower = [(-f * chord, -_half_thickness(f, chord, thickness)) for f in reversed(AIRFOIL_STATIONS[1:-1])]
      return upper + lower


  def _airfoil_part(chord, thickness, f0, f1, stations):
      \"\"\"(points, labels) around the closed part of a section between chord fractions f0 < f1: the
      upper surface from the leading end to the trailing end, then the lower back, counterclockwise
      seen from +z as _airfoil's. A cut end (f0 > 0 or f1 < 1) closes with a straight edge;
      labels[i] is (fraction, 'u' or 'l'). With f0 = 0, f1 = 1 and AIRFOIL_STATIONS this is _airfoil.\"\"\"
      _require(0.0 <= f0 < f1 <= 1.0, f'airfoil part: need 0 <= f0 < f1 <= 1, got {f0}, {f1}')
      fs = [f0] + [f for f in stations if f0 < f < f1] + [f1]
      low = list(reversed(fs))
      if f1 == 1.0:
          low = low[1:]
      if f0 == 0.0:
          low = low[:-1]
      pts = [(-f * chord, _half_thickness(f, chord, thickness)) for f in fs] + [(-f * chord, -_half_thickness(f, chord, thickness)) for f in low]
      return pts, [(f, 'u') for f in fs] + [(f, 'l') for f in low]


  def _refine(vals, k):
      \"\"\"k - 1 stations between each authored pair of (x, half_w, half_h, center_y, exponent): x
      linear, the rest Catmull-Rom (ends repeated). Half-sizes are clamped to at least half the
      smaller neighbor and the exponent to at least 1, so a pointed end cannot go negative.
      Returns (stations, indices of the authored ones).\"\"\"
      out, authored, m = [], [], len(vals)
      for i in range(m - 1):
          p0, p1, p2, p3 = vals[max(i - 1, 0)], vals[i], vals[i + 1], vals[min(i + 2, m - 1)]
          authored.append(len(out))
          out.append(p1)
          for s in range(1, k):
              t = s / k
              rest = []
              for c in range(1, 5):
                  v = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t
                             + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t)
                  if c in (1, 2):
                      v = max(v, 0.5 * min(p1[c], p2[c]))
                  if c == 4:
                      v = max(v, 1.0)
                  rest.append(v)
              out.append((p1[0] + (p2[0] - p1[0]) * t, *rest))
      authored.append(len(out))
      out.append(vals[-1])
      return out, authored
  ```

  (c) `fuselage(..., subdivide=1)`. Restructure so the parsed station tuples come first. Today's validation, messages and ring formula are kept:
  ```python
      def fuselage(self, role, stations, segments=16, center_z=0.0, node=None, lower_role=None, lower_node=None, subdivide=1):
          \"\"\"(existing docstring, plus:) ``subdivide`` k > 1 lofts k - 1 Catmull-Rom stations between
          each authored pair (a smoother silhouette); panel lines stay at the authored ones.\"\"\"
          _require(isinstance(segments, int) and segments >= 8 and segments % 4 == 0,
                   f'fuselage: segments must be a multiple of 4, at least 8, got {segments!r}')
          _require(isinstance(subdivide, int) and subdivide >= 1, f'fuselage: subdivide must be an integer >= 1, got {subdivide!r}')
          _require(len(stations) >= 2, f'fuselage: need at least 2 stations, got {len(stations)}')
          vals = []
          for i, st in enumerate(stations):
              _require(len(st) in (4, 5), f'fuselage: station {i} needs 4 or 5 values, got {len(st)}')
              values = tuple(float(v) for v in st)
              _require(all(math.isfinite(v) for v in values), f'fuselage: station {i} has a non-finite value')
              x, half_w, half_h, center_y = values[:4]
              n = values[4] if len(values) == 5 else 2.2
              _require(half_w > 0 and half_h > 0 and n >= 1,
                       f'fuselage: station {i} half-width and half-height must be > 0 and exponent >= 1')
              vals.append((x, half_w, half_h, center_y, n))
          _require(all(vals[i][0] < vals[i + 1][0] for i in range(len(vals) - 1)), 'fuselage: station x values must be strictly increasing')
          authored = list(range(len(vals)))
          if subdivide > 1:
              vals, authored = _refine(vals, subdivide)
          rings = []
          for x, half_w, half_h, center_y, n in vals:
              ring = []
              for j in range(segments):
                  t = 2 * math.pi * j / segments
                  c, s = math.cos(t), math.sin(t)
                  ring.append((x, center_y + half_h * math.copysign(abs(c) ** (2 / n), c),
                               center_z + half_w * math.copysign(abs(s) ** (2 / n), s)))
              rings.append(ring)
          verts, faces = _loft(rings)
          quarter = segments // 4
          charts = smooth = None
          if self.skin:
              charts, side, U, V = self._loft_charts(rings)
              smooth = [j is not None for _, j in faces]
              for s in authored[1:-1]:
                  self._line(side, 'u', U[s], 0.0, V[s][-1])
          self._emit(role, verts, faces, node, lower_role, lower_node, lambda j: quarter <= j < 3 * quarter, charts, smooth)
  ```
  The x-order check moves after parsing but checks the same values with the same message. The ring loop computes each point exactly as before.

  (d) Detailed lifting surfaces. At the top of `wing` (after its validation) and of `fin`, add:
  ```python
          if stations is not None or span_segments != 1 or controls:
              return self._lifting_detailed(...)   # the arguments listed below
  ```
  Then add these methods:
  ```python
      def _lifting_detailed(self, role, section, z_from, z_to, stations, span_segments, controls, node, lower_role, lower_node, mirror, place):
          \"\"\"A wing or fin panel as pieces between z_from and z_to: split at every control end; inside a
          control, a main piece cut CONTROL_GAP_M ahead of the hinge and a control piece from the hinge
          aft, inset CONTROL_GAP_M at its own spanwise ends. `section(z)` gives (chord, thickness ratio,
          leading-edge x, chord-line y) at z, the one-panel loft's own section, so pieces trace its surface.
          `place` maps a lofted vertex to the model frame (a rotation, so windings hold).\"\"\"
          stations = AIRFOIL_STATIONS if stations is None else tuple(stations)
          _require(stations[0] == 0.0 and stations[-1] == 1.0 and all(a < b for a, b in zip(stations, stations[1:])),
                   'stations must run 0 to 1, strictly increasing')
          _require(isinstance(span_segments, int) and span_segments >= 1, f'span_segments must be an integer >= 1, got {span_segments!r}')
          ctrls = []
          for z0, z1, hinge in controls or []:
              _require(z0 < z1 and 0.3 < hinge < 0.95, f'control ({z0}, {z1}, {hinge}): need z0 < z1 and a hinge in (0.3, 0.95)')
              if z1 > z_from and z0 < z_to:
                  ctrls.append((max(z0, z_from), min(z1, z_to), hinge, z0 >= z_from, z1 <= z_to))
          cuts = sorted({z_from, z_to} | {c for a, b, _h, _s, _e in ctrls for c in (a, b)})
          for za, zb in zip(cuts, cuts[1:]):
              c = next((x for x in ctrls if x[0] <= za and zb <= x[1]), None)
              if c is None:
                  self._lifting_piece(role, section, za, zb, 0.0, 1.0, stations, span_segments, node, lower_role, lower_node, mirror, place)
                  continue
              _a, _b, hinge, own_start, own_end = c
              chord = min(section(za)[0], section(zb)[0])
              self._lifting_piece(role, section, za, zb, 0.0, hinge - CONTROL_GAP_M / chord, stations, span_segments, node, lower_role, lower_node, mirror, place)
              lo = za + CONTROL_GAP_M if own_start and za == _a else za
              hi = zb - CONTROL_GAP_M if own_end and zb == _b else zb
              self._lifting_piece(role, section, lo, hi, hinge, 1.0, stations, span_segments, node, lower_role, lower_node, mirror, place)

      def _lifting_piece(self, role, section, za, zb, f0, f1, stations, span_segments, node, lower_role, lower_node, mirror, place):
          rings, labels = [], None
          for k in range(span_segments + 1):
              z = za + (zb - za) * k / span_segments
              chord, t, le, y = section(z)
              pts, labels = _airfoil_part(chord, t, f0, f1, stations)
              rings.append([place((le + dx, y + dy, z)) for dx, dy in pts])
          verts, faces = _loft(rings)
          uppers = sum(1 for _f, sfc in labels if sfc == 'u')
          first_lower = uppers - 1 if f1 == 1.0 else uppers
          lower = lambda j: j >= first_lower  # noqa: E731
          charts = smooth = None
          if self.skin:
              charts, side, U, V = self._loft_charts(rings)
              smooth = [j is not None for _, j in faces]
              self._spar_lines(side, U, V, labels)
          self._emit(role, verts, faces, node, lower_role, lower_node if lower_role else None, lower if lower_role else None, charts, smooth)
          if mirror:
              mverts, mfaces = _mirror_z(verts, faces)
              self._emit(role, mverts, mfaces, node, lower_role, lower_node if lower_role else None, lower if lower_role else None,
                         None if charts is None else self._mirror_charts(charts), smooth)
  ```
  `_loft_charts` measures the placed rings. `place` is a rotation, so distances, and therefore UVs, are the same as the unplaced ones.

  In `wing`, add `stations=None, span_segments=1, controls=None` to the signature. After today's validation and the `length`/`tip_le`/`tip_y` lines, dispatch:
  ```python
          if stations is not None or span_segments != 1 or controls:
              def section(z):
                  f = (z - root_z) / length
                  chord = root_chord + (tip_chord - root_chord) * f
                  thick = thickness * root_chord + (tip_t * tip_chord - thickness * root_chord) * f
                  return (chord, thick / chord, le_x - (z - root_z) * math.tan(math.radians(sweep_deg)),
                          root_y + (z - root_z) * math.tan(math.radians(dihedral_deg)))
              self._lifting_detailed(role, section, root_z, half, stations, span_segments, controls, node, lower_role, lower_node, mirror, lambda v: v)
              return
  ```
  In `fin`, add the same three keyword arguments. After its validation:
  ```python
          if stations is not None or span_segments != 1 or controls:
              def section(z):
                  f = z / height
                  chord = root_chord + (tip_chord - root_chord) * f
                  thick = thickness * root_chord + (tip_t * tip_chord - thickness * root_chord) * f
                  return chord, thick / chord, le_x - z * math.tan(math.radians(sweep_deg)), 0.0
              # Stand the panel up: (x, y, z) -> (x, z, -y) about the root, as the plain path does.
              self._lifting_detailed(role, section, 0.0, height, stations, span_segments, controls, node, None, None, False,
                                     lambda v: (v[0], root_y + v[2], center_z - v[1]))
              return
  ```
  The plain `fin` lofts the absolute thickness linearly between root and tip, because its two rings are airfoils of `thickness` and `tip_t`. So the detailed `section` interpolates the absolute thickness too. The plain `wing` does the same.

  (e) `propeller(..., blade_sections=None)`. Add the argument. When it is given, replace the flat-blade loop with lofted, twisted blades. The spinner call after the loop is unchanged:
  ```python
          if blade_sections is not None:
              _require(len(blade_sections) >= 2 and all(0 < a[0] < b[0] <= 1 for a, b in zip(blade_sections, blade_sections[1:])),
                       'propeller: blade_sections need >= 2 entries with radius fractions strictly increasing in (0, 1]')
              for i in range(blades):
                  a = 2 * math.pi * i / blades
                  e_r = (0.0, math.cos(a), math.sin(a))
                  t = _cross((1.0, 0.0, 0.0), e_r)  # the blade's direction of travel
                  rings = []
                  for rf, scale, pitch in blade_sections:
                      ph = math.radians(pitch)
                      fwd = (math.sin(ph), math.cos(ph) * t[1], math.cos(ph) * t[2])  # toward the leading edge
                      up = _cross(e_r, fwd)
                      c = chord * scale
                      # wing-local (x toward the leading edge, y up, z span) -> (fwd, up, e_r): a rotation
                      rings.append([tuple(hub[k] + rf * radius * e_r[k] + (dx + 0.25 * c) * fwd[k] + dy * up[k] for k in range(3))
                                    for dx, dy in _airfoil(c, 0.10)])
                  verts, faces = _loft(rings)
                  charts = smooth = None
                  if self.skin:
                      charts, _s, _U, _V = self._loft_charts(rings)
                      smooth = [j is not None for _, j in faces]
                  self._part(role, verts, [f for f, _ in faces], node, charts, smooth if smooth is not None else False)
          else:
              (today's flat-blade loop, unchanged)
  ```
  The blade frame is right-handed: `fwd × up = fwd × (e_r × fwd) = e_r`, because `fwd ⟂ e_r`. So the airfoil's outward winding survives.

  (f) `canopy`:
  ```python
      def canopy(self, glass_role, frame_role, stations, frames, bar=0.02, segments=16, subdivide=1, center_z=0.0, node=None, frame_node=None):
          \"\"\"A glazed canopy lofted like `fuselage` from (x, half_w, half_h, center_y) stations, and a
          frame hoop at each x in `frames`: `bar` long, standing `bar` proud of the glazing's own
          (refined) section there. The hoops' role is the airframe's paint; the glazing's is its own.\"\"\"
          _require(bar > 0 and frames, f'canopy: need bar > 0 and at least one frame, got {bar}, {frames}')
          self.fuselage(glass_role, stations, segments, center_z, node, subdivide=subdivide)
          vals = [(float(s[0]), float(s[1]), float(s[2]), float(s[3]), 2.2) for s in stations]
          if subdivide > 1:
              vals, _a = _refine(vals, subdivide)
          for x in frames:
              _require(vals[0][0] < x < vals[-1][0], f'canopy: frame at {x} is outside the canopy ({vals[0][0]}, {vals[-1][0]})')
              i = next(k for k in range(len(vals) - 1) if vals[k][0] <= x <= vals[k + 1][0])
              f = (x - vals[i][0]) / (vals[i + 1][0] - vals[i][0])
              hw, hh, cy = (vals[i][c] + (vals[i + 1][c] - vals[i][c]) * f for c in (1, 2, 3))
              self.fuselage(frame_role, [(x - bar / 2, hw + bar, hh + bar, cy), (x + bar / 2, hw + bar, hh + bar, cy)], segments, center_z, frame_node)
  ```

- [ ] **Step 5: Run the kit suites and the rebuilds.**
  ```bash
  npx vitest run tests/tools/models/blender --maxWorkers=1; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: both rc=0. `kitAircraft.test.ts` and all 16 Blender entries other than the hangar rebuild byte-identically (Review Focus 1). The hangar rebuilds identically too, to its Task 8 bytes.

- [ ] **Step 6: Commit.**
  ```bash
  git add tools/models/blender/kit.py tests/tools/models/blender/fixtures/kit_detail_probe.py tests/tools/models/blender/kitDetail.test.ts
  git commit -m "DP0: kit aircraft detail, opt-in (fine sections, control surfaces with gaps, twisted blades, framed canopy, subdivided lofts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 10: Pilot two, the Ki-84: geometry to the downloads' level, cited features, markings, skin

**Files:**
- Modify: `tools/models/blender/ki-84-frank.py`
- Modify: `tools/models/entries/ki-84-frank.json`
- Modify: `tests/tools/models/skins.test.ts`
- Modify: `content/aircraft/ki-84-frank.glb` (rebuilt)

**Interfaces:**
- Consumes: Task 1's ledger (the cited airframe, armament, colors); Task 9's parts; Task 7's stage.
- Produces: a skinned `content/aircraft/ki-84-frank.glb`:
  - 15,000-36,000 triangles (the report band, not a test);
  - 5 draw calls (the skin plus `Prop`, `GearL`, `GearR`, `Tailwheel`);
  - a 1024 px atlas;
  - at most 3,000,000 bytes.

  The part nodes' names and **pivots are unchanged**, so the entry's `keep` block is untouched.

- [ ] **Step 1: The guards this task must keep green.** Run them first, to know their state:
  ```bash
  npx vitest run tests/tools/models/aircraftDimensions.test.ts tests/tools/models/aircraftRigs.test.ts tests/tools/models/eyePoints.test.ts tests/tools/models/stance.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: rc=0. These pin:
  - span and length within 1% (`aircraftDimensions`);
  - every gear leg hinging and folding under the skin (`aircraftRigs`, which uses skin vertices over the wheel wells);
  - the eye point and the parked stance.

  A failure after the rewrite is fixed in the script, never in these tests.

- [ ] **Step 2: Rewrite the script's header.** Keep every existing CITED/ESTIMATE line. Add Task 1's findings:
  - the cited airframe (unit, marking, photo URL and read date), or `ESTIMATE` with the reason;
  - the armament (CITED from Wikipedia's Specifications);
  - each new ESTIMATE: control-surface spans and hinges, exhaust-stack count and position, canopy frame stations, fillet size, pitot, antenna mast, landing-light position, door sizes, marking positions and diameters.

  Replace `Leaves out:` with what is still left out: the cockpit interior, and moving control surfaces.

- [ ] **Step 3: The geometry.** Keep `NAME`, the CITED block, `PROP_DIAMETER`, `TAPER`, `DIHEDRAL_DEG`, the gear figures, `X()` and the wing-panel break at the gear station. Their numbers are unchanged, so the pivots hold. Then:
  ```python
  # --- DP0 detail (ESTIMATE unless the header cites it)
  SEGMENTS = 48                 # fuselage ring segments (was 16)
  SUBDIVIDE = 4                 # Catmull-Rom stations between authored ones
  SPAN_SEGMENTS = 4             # rings per wing panel
  # A cowling lip: the cowl face steps in over 0.005 of LENGTH ahead of the last cowl station.
  FUSELAGE = FUSELAGE[:-1] + [(0.049, 0.057, 0.057, 0.000, 2.0), FUSELAGE[-1]]
  CANOPY_FRAMES = (0.535, 0.490, 0.445, 0.400)  # of LENGTH aft of the spinner tip
  AILERON = (0.58, 0.96, 0.76)  # half-span fractions, hinge chord fraction
  FLAP = (0.11, 0.56, 0.80)
  ELEVATOR = (0.08, 0.97, 0.70) # of the tailplane half-span
  RUDDER = (0.05, 0.93, 0.68)   # of the fin height
  EXHAUSTS = dict(count=6, x0=0.125, x1=0.205, y=-0.012, r=0.028, length=0.14)  # per side; x, y of LENGTH
  FILLET = dict(le=0.30, te=0.52, half_w=0.022, half_h=0.012)  # of LENGTH: x span behind the spinner tip, bulge

  out, _opts = kit.cli_args()
  m = kit.Model(NAME, skin=1024)
  with m.tagged('fuselage'):
      m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=SEGMENTS, subdivide=SUBDIVIDE, lower_role=LOWER)
      # Wing-root fillets: a fairing loft each side, its center just inside the fuselage side (ESTIMATE).
      fus_w = max(w for f, w, h, y, n in FUSELAGE if FILLET['le'] <= f <= FILLET['te']) * L
      for side in (-1, 1):
          m.fuselage(UPPER, [(X(FILLET['te']), 0.004 * L, 0.004 * L, WING_Y * L),
                             (X((FILLET['le'] + FILLET['te']) / 2), FILLET['half_w'] * L, FILLET['half_h'] * L, WING_Y * L + 0.004 * L),
                             (X(FILLET['le']), 0.004 * L, 0.004 * L, WING_Y * L)],
                     segments=16, center_z=side * (fus_w - 0.3 * FILLET['half_w'] * L), lower_role=LOWER, subdivide=3)
  with m.tagged('canopy'):
      m.canopy('glazing', UPPER, [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], [X(f) for f in CANOPY_FRAMES],
               bar=0.018, segments=32, subdivide=3)
  root_chord = 2 * WING_AREA / (S * (1 + TAPER))
  tip_chord = TAPER * root_chord
  sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
  controls = [(a * S / 2, b * S / 2, h) for a, b, h in (FLAP, AILERON)]
  breaks = [0.0, GEAR['z'] * S, S / 2]
  with m.tagged('wing'):
      for z0, z1 in zip(breaks, breaks[1:]):
          c0, c1 = (root_chord + (tip_chord - root_chord) * z / (S / 2) for z in (z0, z1))
          a0, a1 = (ROOT_T * root_chord + (TIP_T * tip_chord - ROOT_T * root_chord) * z / (S / 2) for z in (z0, z1))
          m.wing(UPPER, 0.25 * root_chord - z0 * math.tan(math.radians(sweep)),
                 WING_Y * L + z0 * math.tan(math.radians(DIHEDRAL_DEG)), c0, c1, 2 * z1, sweep_deg=sweep,
                 dihedral_deg=DIHEDRAL_DEG, thickness=a0 / c0, tip_thickness=a1 / c1, root_z=z0, lower_role=LOWER,
                 stations=kit.AIRFOIL_STATIONS_FINE, span_segments=SPAN_SEGMENTS, controls=controls)
  tp = TAILPLANE
  with m.tagged('tailplane'):
      m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
             sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER, stations=kit.AIRFOIL_STATIONS_FINE, span_segments=3,
             controls=[(ELEVATOR[0] * tp['span'] * S / 2, ELEVATOR[1] * tp['span'] * S / 2, ELEVATOR[2])])
  fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
  fin_tip = FIN['taper'] * fin_root
  with m.tagged('fin'):
      m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
            sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), stations=kit.AIRFOIL_STATIONS_FINE, span_segments=3,
            controls=[(RUDDER[0] * fin_h, RUDDER[1] * fin_h, RUDDER[2])])
  pr = PROP
  with m.tagged('prop'):
      m.propeller('dark', (X(pr['hub']), 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L, pr['spinner_len'] * L,
                  blade_sections=[(0.13, 0.9, 42.0), (0.35, 1.05, 32.0), (0.6, 1.0, 24.0), (0.85, 0.8, 19.0), (1.0, 0.45, 16.0)])
  ```
  Then the gear, the tailwheel, and the cited or estimated fittings. The gear calls are today's, with their `node=` names. Add:
  ```python
  with m.tagged('fittings'):
      # Main-gear leg covers, on each leg node, outboard of the strut (ESTIMATE); they fold with the leg.
      for side, name in ((-1, 'GearL'), (1, 'GearR')):
          m.box('dark', (g['x'] * L, hinge_y - 0.55 * g['length'] * L, side * (g['z'] * S + 0.045)), (0.30, 0.50, 0.012), node=name)
      # Exhaust stacks, EXHAUSTS['count'] a side, each a short tube leaving the cowling aft and outward.
      e = EXHAUSTS
      for side in (-1, 1):
          for k in range(e['count']):
              f = e['x0'] + (e['x1'] - e['x0']) * k / (e['count'] - 1)
              hw = next(w for ff, w, h, y, n in reversed(FUSELAGE) if ff >= f) * L
              m.revolve('dark', (X(f), e['y'] * L, side * (hw - 0.02)), (-1.0, -0.15, side * 0.45),
                        [(0.0, e['r'] * 1.0), (e['length'], e['r'] * 0.85)], 10)
      # Guns (armament per the header): barrels only, the breeches are inside.
      for side in (-1, 1):
          m.gun_barrel('dark', (X(0.13), 0.052 * L, side * 0.09), 0.0, 0.0, 0.45, 0.012)             # cowl guns
          m.gun_barrel('dark', (0.10, WING_Y * L + 2.55 * math.tan(math.radians(DIHEDRAL_DEG)), side * 2.55), 0.0, 0.0, 0.55, 0.016)  # wing cannon
      m.strut('dark', (0.30, WING_Y * L + 4.6 * math.tan(math.radians(DIHEDRAL_DEG)) - 0.05, -4.6), (0.70, WING_Y * L + 4.6 * math.tan(math.radians(DIHEDRAL_DEG)) - 0.05, -4.6), 0.008, sides=6)  # pitot, left wing
      m.strut('dark', (X(0.575), 0.070 * L, 0.0), (X(0.625), 0.115 * L, 0.0), 0.012, 0.006, sides=6)  # antenna mast, raked aft
      for side in (-1, 1):  # tailwheel doors, open (ESTIMATE)
          m.box('dark', (X(tw['at']) + 0.05, tw['y'] * L - 0.08, side * 0.075), (0.26, 0.12, 0.010))
  m.export(out)
  ```
  Every fitting that starts inside the skin starts at least 0.02 m inside it. The noseNode rule needs `Prop` to stay the frontmost part: the cowl guns end at `X(0.13) + 0.45 ≈ 2.72 m` and the wing cannon at 0.65 m, both far behind the spinner. `checkOutput` enforces this. Adjust the numbers until each fitting sits where the header says, with no floating and no penetration through the far side. **Read Step 6's captures before calling a fitting placed.**

- [ ] **Step 4: The markings.** Positions come from Task 1. If a figure is not cited, use these ESTIMATEs and label them in the header:
  ```python
  wing_top = lambda z: WING_Y * L + abs(z) * math.tan(math.radians(DIHEDRAL_DEG))  # noqa: E731, chord-line height
  for side in (-1, 1):
      z = side * 0.70 * S / 2
      x = 0.25 * root_chord - abs(z) * math.tan(math.radians(sweep)) - 0.45 * (root_chord + (tip_chord - root_chord) * abs(z) / (S / 2))
      m.marking('disc', tags=['wing'], center=(x, wing_top(z), z), axis=(0.0, 1.0, 0.0), radiusM=0.55, color='hinomaruRed')
      m.marking('disc', tags=['wing'], center=(x, wing_top(z), z), axis=(0.0, -1.0, 0.0), radiusM=0.55, color='hinomaruRed')
      # Fuselage: a white surround, then the red (home-defense style; drop the white if Task 1's photo shows none).
      # Centered on the skin (the fuselage's half-width there), not the axis: a disc marks only within its radius of its plane.
      skin_z = side * next(w for ff, w, h, y, n in reversed(FUSELAGE) if ff >= 0.66) * L
      m.marking('disc', tags=['fuselage'], center=(X(0.66), 0.0, skin_z), axis=(0.0, 0.0, float(side)), radiusM=0.46, color='insigniaWhite')
      m.marking('disc', tags=['fuselage'], center=(X(0.66), 0.0, skin_z), axis=(0.0, 0.0, float(side)), radiusM=0.38, color='hinomaruRed')
      # Leading-edge ID strip, inboard: everything on the wing facing forward, from the root fillet to 0.45 half-span.
      m.marking('polygon', tags=['wing'], origin=(0.25 * root_chord, WING_Y * L, 0.0), axis=(1.0, 0.0, 0.0), uDir=(0.0, 0.0, 1.0),
                points=[(side * 0.95, -0.6), (side * 0.45 * S / 2, -0.6), (side * 0.45 * S / 2, 0.6), (side * 0.95, 0.6)], color='idYellow')
      # Exhaust soot streaks aft of the stacks.
      m.marking('polygon', tags=['fuselage'], origin=(X(EXHAUSTS['x1']), EXHAUSTS['y'] * L, 0.0), axis=(0.0, 0.0, float(side)), uDir=(-1.0, 0.0, 0.0),
                points=[(-0.9, -0.12), (1.3, -0.30), (1.3, 0.10), (-0.9, 0.12)], color='exhaustSoot', effect='stain', opacity=0.55, featherM=0.15)
  # Walkway wear on the left wing root, where the pilot climbed in (ESTIMATE).
  m.marking('polygon', tags=['wing'], origin=(0.0, wing_top(-1.0), -1.0), axis=(0.0, 1.0, 0.0), uDir=(1.0, 0.0, 0.0),
            points=[(-0.9, -0.25), (0.6, -0.25), (0.6, 0.35), (-0.9, 0.35)], color='walkwayDark', effect='wear', opacity=0.8, featherM=0.1)
  # Landing light: a lens on the left wing's leading edge (ESTIMATE position).
  m.marking('disc', tags=['wing'], center=(0.25 * root_chord - 3.2 * math.tan(math.radians(sweep)) + 0.02, wing_top(-3.2), -3.2), axis=(1.0, 0.0, 0.0), radiusM=0.09, color='lensClear')
  ```
  Put these **before** `m.export(out)`. A polygon's points are `(u, v)` in the plane, with `u` along `uDir` and `v = axis × u`. For the LE strip, `v = x̂ × ẑ = -ŷ`, so `v ∈ [-0.6, 0.6]` spans the wing's thickness either way. If Task 1 cites a unit marking on the fin, express it with `disc`, `polygon` or `slab` (tag `fin`). If it cannot be expressed that way, list it as open.

- [ ] **Step 5: The entry.** In `tools/models/entries/ki-84-frank.json`, add `"skin": true` and set `"textures": { "maxSize": 1024, "format": "webp" }`. The budget and `keep` are unchanged.

- [ ] **Step 6: Build, measure, look.**
  ```bash
  npm run models:build -- ki-84-frank; echo "rc=$?"
  npx tsx tools/models/inspect.ts content/aircraft/ki-84-frank.glb | head -12
  npx vitest run tests/tools/models/aircraftDimensions.test.ts tests/tools/models/aircraftRigs.test.ts tests/tools/models/eyePoints.test.ts tests/tools/models/stance.test.ts tests/tools/models/outputs.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: the build succeeds, with triangles in the 15,000-36,000 band and 5 draw calls. Copy the build line into the ledger. The five suites pass.
  - **Below 15,000:** raise `SEGMENTS` to 64 or `SPAN_SEGMENTS` to 6. **Above 36,000:** lower them. The band is a report, but it is the spec's target, so hit it.
  - **Over 3,000,000 bytes:** stop and record it. It should not happen: about 1.4 MB is expected.
  - **A rig failure:** a fitting on a leg node (the leg covers) is folding through the skin. Move or shrink the cover. Never touch `aircraftRigs.test.ts`'s list.
  - **A dimension failure:** a fitting extends the span or length. Pull it in.

  Render the atlas maps to PNG in the scratchpad (Task 8 Step 6's method) and **read them**:
  - hinomaru positions: upper and lower wings, fuselage sides;
  - the yellow LE strip is on the leading edge only;
  - panel lines at the fuselage stations and spars;
  - no stretched patch that reads as smeared paint (Spec §9 risk: note any in the ledger, and correct UV stretch only through the kit's chart code);
  - no black texels.

- [ ] **Step 7: Shrink the allowlist.** Remove `'ki-84-frank'` from `FLAT_SHADED`; set `CEILING = 19`.

- [ ] **Step 8: Run the model suites.**
  ```bash
  npx vitest run tests/tools/models --maxWorkers=1; echo "rc=$?"
  npx vitest run tests/render/hangar tests/render/models --maxWorkers=2; echo "rc=$?"
  ```
  Expected: both rc=0. `blenderEntries.test.ts` rebuilds the Ki-84 byte-identically with its skin, and every other entry unchanged.

- [ ] **Step 9: Commit.**
  ```bash
  git add tools/models/blender/ki-84-frank.py tools/models/entries/ki-84-frank.json tests/tools/models/skins.test.ts content/aircraft/ki-84-frank.glb
  git commit -m "DP0: the Ki-84 pilot to the downloads' level (control surfaces, framed canopy, twisted prop, fittings, markings, skin)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---
### Task 11: The Hangar's UV checker (spec §9)

A debug toggle that draws every model with a checker texture in place of its base-color map. Stretch at loft ends and wing tips (spec §9's first risk) shows as distorted squares. It is part of the `?bench` debug set, beside wireframe.

**Files:**
- Modify: `src/render/hangar/stage.ts` (`applyChecker`, and the stage's `setChecker`)
- Modify: `src/render/hangar/bench.ts` (`DebugToggle`, the toggle list)
- Modify: `src/render/hangar/main.ts` (the debug record and dispatch)
- Modify: `tests/render/hangar/stage.test.ts`

**Interfaces:**
- Produces:
  - `applyChecker(root: Object3D, on: boolean): void`;
  - `DebugToggle` gains `'checker'`;
  - `__hangar.setDebug('checker', on)` works through the existing hook.

- [ ] **Step 1: The failing test.** Append to `tests/render/hangar/stage.test.ts`, and import `applyChecker`:
  ```ts
  describe('applyChecker (DP0: the UV checker, spec §9)', () => {
    it('swaps each standard material for a clone mapped with one shared checker, and restores the very same materials', () => {
      const lit = new MeshStandardMaterial({ color: new Color(0.2, 0.4, 0.6), map: new DataTexture(new Uint8Array(4), 1, 1) })
      const a = new Mesh(new BoxGeometry(), lit), b = new Mesh(new BoxGeometry(), lit)
      const root = new Group(); root.add(a, b)
      applyChecker(root, true)
      const ca = a.material as MeshStandardMaterial, cb = b.material as MeshStandardMaterial
      expect(ca).not.toBe(lit)
      expect(ca.map).not.toBe(lit.map)
      expect(ca.map).toBe(cb.map) // one checker texture, shared
      expect(ca.color.toArray()).toEqual([1, 1, 1]) // the checker shows unmodulated
      expect(lit.map).not.toBeNull() // the shared original is untouched
      applyChecker(root, true) // idempotent
      applyChecker(root, false)
      expect(a.material).toBe(lit)
      expect(b.material).toBe(lit)
    })
  })
  ```

- [ ] **Step 2: Run to verify it fails.**
  ```bash
  npx vitest run tests/render/hangar/stage.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL (`applyChecker` not exported).

- [ ] **Step 3: Implement.** In `src/render/hangar/stage.ts`, beside `applyUnlit`:
  ```ts
  let checker: DataTexture | null = null
  /** 8 x 8 squares, black and white, repeating once over UV [0, 1]: one per page, shared. */
  function checkerTexture(): DataTexture {
    if (checker) return checker
    const n = 256, cell = 32, data = new Uint8Array(n * n * 4)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) ? 235 : 20
      data.set([v, v, v, 255], (y * n + x) * 4)
    }
    checker = new DataTexture(data, n, n)
    checker.colorSpace = SRGBColorSpace
    checker.needsUpdate = true
    return checker
  }

  const checkered = new WeakMap<Mesh, Mesh['material']>()
  /** Every standard material under `root` swapped for a clone showing the UV checker, or back to
   *  the very materials it had (DP0, spec §9): stretch at a loft end shows as bent squares. The
   *  clone, not the original, is changed: the model cache shares materials across instances. */
  export function applyChecker(root: Object3D, on: boolean): void {
    const swap = (m: Mesh['material'] & object): Mesh['material'] & object => {
      if (!(m instanceof MeshStandardMaterial)) return m
      const c = m.clone()
      c.map = checkerTexture(); c.color.setRGB(1, 1, 1); c.needsUpdate = true
      return c
    }
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return
      const saved = checkered.get(o)
      if (on && !saved) {
        checkered.set(o, o.material)
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material)
      } else if (!on && saved) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m !== saved && !(Array.isArray(saved) && saved.includes(m))) m.dispose()
        o.material = saved
        checkered.delete(o)
      }
    })
  }
  ```
  Add `DataTexture` and `SRGBColorSpace` to the `three` import. Find the stage object's `setUnlit`/`setWireframe` members (`grep -n "setWireframe\|setUnlit" src/render/hangar/stage.ts`), and add a `setChecker(on)` member that calls `applyChecker` on the current model root the same way `setWireframe` applies to it. That includes re-applying on model change if `setWireframe` does.

  In `src/render/hangar/bench.ts`: `export type DebugToggle = 'wireframe' | 'gizmos' | 'turntable' | 'checker'`, and add `['checker', 'UV checker']` to `toggles`.

  In `src/render/hangar/main.ts`: add `checker: false` to the `debug` record (line 69), and `if (which === 'checker') stage.setChecker(on)` beside the wireframe line (line 78).

  In `tests/e2e/hangar.spec.ts`, widen the `setDebug` helper's `which` type to include `'checker'`.

- [ ] **Step 4: Run.**
  ```bash
  npx vitest run tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx tsc --noEmit -p .; echo "tsc rc=$?"
  npx eslint src/render/hangar tests/render/hangar tests/e2e/hangar.spec.ts --max-warnings 0; echo "lint rc=$?"
  ```
  Expected: all rc=0. If a bench test enumerates the toggles (`grep -rn "Pivot gizmos" tests/render`), add the checker row to its expectation. That is the only test change allowed there.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/render/hangar/stage.ts src/render/hangar/bench.ts src/render/hangar/main.ts tests/render/hangar tests/e2e/hangar.spec.ts
  git commit -m "DP0: the Hangar's UV checker debug toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 12: Tier 2 on the reference GPU, and the pilots' checkpoint captures

**Files:**
- Create: `tests/e2e/fixtures/flat-luminance.json`
- Modify: `tests/e2e/hangar.spec.ts` (checks 15 and 16)
- Local scratch, **never committed:** `vite.config.ts` (the slot), `tests/e2e/dp0-flat.spec.ts`, `tests/e2e/dp0-checkpoint.spec.ts`
- Create: `docs/handoff/<run date>-dp0-shots/` (PNGs)

- [ ] **Step 1: Serve the worktree on a free slot.**
  ```bash
  for p in 5174 5175; do pid=$(ss -ltnp | grep ":$p " | grep -oP 'pid=\K[0-9]+' | head -1); echo "$p ${pid:+busy: $(readlink /proc/$pid/cwd)}"; done
  ```
  - Pick a free slot: `ww2airsim-3` for 5174, or `ww2airsim-2` for 5175.
  - Set `TUNNEL_HOST` and `server.port` in `vite.config.ts` to match. **Never stage this file.**
  - Start the server in the background: `WW2AIRSIM_TUNNEL=1 npx vite --port <port>`.
  - Assert it: `curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/hangar.html` must print `200`.
  - If both slots are busy, poll every five minutes for up to an hour. If neither frees, record a `Ruling:`, go to Task 13, and mark Tier 2 NOT RUN in the handoff.

  **The Playwright server.** Use the console session's (`ss -ltn | grep -q ':39001 ' || (ssh -N -L 39001:127.0.0.1:3000 ryzen &)`, then `PW_REMOTE=ws://localhost:39001/`). If it is down or busy, use README's "Tier 2: the GPU harness" session-0 recipe (`PW_SESSION0=1`, `PW_REMOTE=ws://localhost:39002/`). These are correctness runs, not numbers, so session 0 is fine.

- [ ] **Step 2: Measure the flat predecessors (spec §6's band).** Put `main`'s flat glbs back in place **temporarily**:
  ```bash
  git show main:content/aircraft/ki-84-frank.glb > content/aircraft/ki-84-frank.glb
  git show main:content/buildings/hangar.glb > content/buildings/hangar.glb
  ```
  Write the throwaway `tests/e2e/dp0-flat.spec.ts`. It reuses `hangar.spec.ts`'s `openHangar`/`view`/`masks` approach: copy those helpers in, since the throwaway is never committed. For `ki-84-frank` and `hangar`, it runs `view(page, id, 'three-quarter')` and `masks(page, v.empty, [v.model])`, then prints `flat <id> <luminance>`. Run it (`PW_REMOTE=… PW_BASE_URL=https://<host> npx playwright test tests/e2e/dp0-flat.spec.ts`). **Then restore the skinned bytes and prove it:**
  ```bash
  git checkout HEAD -- content/aircraft/ki-84-frank.glb content/buildings/hangar.glb
  git status --short content/
  ```
  The status must print nothing. Write `tests/e2e/fixtures/flat-luminance.json`:
  ```json
  {
    "note": "Mean lit luminance inside each model's mask, three-quarter view, measured on the reference GPU from main's flat-shaded glbs before DP0 skinned them (Task 12 Step 2, <run date>). Check 15 holds each skinned model inside 0.6x-1.5x of it.",
    "ki-84-frank": 0.0,
    "hangar": 0.0
  }
  ```
  Replace each `0.0` with the printed value. Record the values and the run's host in the ledger.

- [ ] **Step 3: Checks 15 and 16.** Append inside `test.describe('the Hangar', …)` in `tests/e2e/hangar.spec.ts`:
  ```ts
    test('15. every skinned model is lit inside 0.6x to 1.5x of its flat predecessor: no black, missing or blown-out skin (DP0)', async ({ page }) => {
      const flat = JSON.parse(readFileSync('tests/e2e/fixtures/flat-luminance.json', 'utf8')) as Record<string, number>
      for (const id of Object.keys(flat).filter((k) => k !== 'note')) {
        const v = await view(page, id, 'three-quarter')
        const [lum] = (await masks(page, v.empty, [v.model])).luminance
        const r = lum! / flat[id]!
        console.log(`skin ${id}: ${r.toFixed(3)}x its flat predecessor's luminance`)
        expect.soft(r, `${id} luminance ratio`).toBeGreaterThanOrEqual(0.6)
        expect.soft(r, `${id} luminance ratio`).toBeLessThanOrEqual(1.5)
      }
      expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
    })

    test('16. the UV checker changes a skinned model and restores it exactly (DP0, spec §9)', async ({ page }) => {
      for (const id of ['ki-84-frank', 'hangar']) {
        const { empty, model } = await view(page, id, 'three-quarter')
        await setDebug(page, 'checker', true)
        const on = await shot(page)
        await setDebug(page, 'checker', false)
        const off = await shot(page)
        const m = await masks(page, empty, [model, on, off])
        console.log(`checker ${id}: luminance ${m.luminance.map((x) => x.toFixed(4)).join(' / ')}`)
        expect(Math.abs(m.luminance[1]! - m.luminance[0]!) / m.luminance[0]!, `${id} checker differs`).toBeGreaterThan(0.05)
        expect(Math.abs(m.luminance[2]! - m.luminance[0]!) / m.luminance[0]!, `${id} restored`).toBeLessThanOrEqual(0.005)
      }
    })
  ```
  Import `readFileSync` from `node:fs` if the spec does not already.

- [ ] **Step 4: Run Tier 2.**
  ```bash
  PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://<host> npx playwright test tests/e2e/adapter.spec.ts tests/e2e/hangar.spec.ts; echo "rc=$?"
  ```
  Expected: `rc=0`. Every existing check still passes:
  - check 1: the mask share for both pilots, 2-80%;
  - check 5: the Ki-84's lighting ratio, 0.5-1.5× the Wildcat's; unlit still carries its map;
  - check 8: wireframe;
  - check 10: the budget as drawn.

  Plus 15 and 16. Copy into the ledger: checks 1, 5, 10, 15 and 16's logged numbers for both pilots.
  - A check-15 ratio outside the band is a skin defect: black texels, a missing map, a wrong color space. Find it in the maps. Never widen the band.
  - Convoy Strike's Tier 2 is DP2's (spec §6); DP0 changes no scenario. Record that as a `Ruling:`.

- [ ] **Step 5: The checkpoint captures (spec §5).** Write the throwaway `tests/e2e/dp0-checkpoint.spec.ts`. Use R4/R5's `roster-checkpoint.spec.ts` shape: 2560×1440, `?bench`, `freeze()`, `camera(...)`, three `requestAnimationFrame`s, canvas screenshot. Capture:
  - `ki-84-frank`, `a6m2-zero` and `f6f-hellcat`, each at `three-quarter` and `side`;
  - `hangar` at `three-quarter`;
  - `ki-84-frank` and `hangar` with `setDebug('checker', true)` at `three-quarter`.

  All go to `docs/handoff/<run date>-dp0-shots/<id>-<preset>[-checker].png`. The same camera and lighting for all, which is the Hangar's fixed sun. If a preset name differs, `grep -n "CameraPreset" src/render/hangar/framing.ts` lists them. **Read every PNG.** For each, check:
  - the markings sit where the header says;
  - panel lines read as fine seams, not stripes;
  - no black or garish texels;
  - no seam at patch edges;
  - the checker squares stay square except where the ledger already names stretch;
  - the Ki-84 reads as the same class of detail as the Zero and Hellcat beside it.

  Correct only behind a capture you have read or a failing measurement. After a correction, rebuild, rerun Step 4, and refreeze. Keep each PNG under 1.5 MB, downscaling with `sharp` if needed.

- [ ] **Step 6: Clean up and commit.** Delete both throwaway specs. Restore `vite.config.ts` with `git checkout -- vite.config.ts`. Stop only this worktree's server.
  ```bash
  git status --short
  git add tests/e2e/hangar.spec.ts tests/e2e/fixtures/flat-luminance.json docs/handoff/*-dp0-shots/
  git diff --cached --stat
  git commit -m "DP0: Tier 2 checks 15 (skin vs flat luminance) and 16 (UV checker); pilot checkpoint captures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  `git diff --cached --stat` must list neither `vite.config.ts` nor either throwaway spec, and no `content/` file.

---

### Task 13: Full verification, docs, and the completion ritual

**Files:**
- Modify: `docs/models.md` ("Authoring in Blender": a "Skins" subsection)
- Modify: `ASSETS.md` (scan credits)
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15: a new row)
- Modify: `README.md` (one paragraph)
- Create: `docs/handoff/<run date>-dp0-skin-pipeline.md`
- Modify: `.superpowers/sdd/2026-09-28-dp0-skin/progress.md` (final entry)

- [ ] **Step 1: Full verification on ryzen.**
  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"
  ```
  Expected: `rc=0`. The skip count should be the baseline's 13 or fewer. A higher count means a suite skipped: name it and find out why.
  - The scans reach ryzen through `.remote-run-data`'s `tools/*/cache` line, so `scans.test.ts`'s cached block runs there.
  - A known flake (`furball.test.ts`'s `beforeAll` timeout, or the slow sky-noise tests under shared load) is rerun alone and both results recorded.

  Then the Blender suites on nexus, serially, by name:
  ```bash
  npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: `rc=0` with nothing skipped. Every Blender entry rebuilds byte-identically on nexus as on ryzen, both pilots with their skins.

- [ ] **Step 2: Nothing else moved.**
  ```bash
  git diff main...HEAD --stat -- content/ src/sim content/scenarios
  ```
  Expected: exactly `content/aircraft/ki-84-frank.glb` and `content/buildings/hangar.glb` under `content/`, and nothing under `src/sim`. Read the whole branch diff (`git diff main...HEAD --stat`). Confirm that no candidate, cache, sidecar, scratch PNG, probe output, `vite.config.ts` edit or throwaway spec is tracked (`git ls-files | grep -E '\.skin\.json$|dp0-(flat|checkpoint)'` prints nothing).

- [ ] **Step 3: Docs.**
  - **`ASSETS.md`:** after the `blue_metal_plate` row (line ~195), extend that row's first cell to add "and the painted-metal detail baked into Blender skins by `tools/models/skin/`". Add two rows in the same table format:
    ```
    | corrugated-iron detail baked into Blender skins by `tools/models/skin/` | https://polyhaven.com/a/worn_corrugated_iron | Dimitrios Savva (photography), Jenelle van Heerden (processing) | CC0 |
    | concrete detail baked into Blender skins by `tools/models/skin/` | https://polyhaven.com/a/concrete_floor_worn_001 | Dimitrios Savva (photography), Rico Cilliers (processing) | CC0 |
    ```
    Run `npx vitest run tests/tools/models/outputs.test.ts tests/render/modelCredits.test.ts --maxWorkers=2`. CC0 needs no in-app credit; if a credits test disagrees, read it before changing anything.
  - **`docs/models.md`**, under "Authoring in Blender", a `### Skins (DP0)` subsection. Point to the code, don't restate it:
    - `kit.Model(name, skin=<px>)` turns it on; the kit writes charts, UVs, smooth shading and `<out>.skin.json`;
    - markings are declared with `m.marking(...)`, schema in `tools/models/skin/sidecar.ts`;
    - tags come from `with m.tagged(...)`;
    - the entry takes `"skin": true`;
    - the look lives in `tools/models/skin/surfaces.ts` and `layers.ts` (a change re-skins every model, and moves the golden hashes);
    - the no-coplanar-faces rule and why;
    - the UV checker (`?bench`, "UV checker");
    - `skins.test.ts`'s allowlist.

    Date the section and say it was verified by this plan's Tier 1 and Tier 2 runs.
  - **The master spec §15:** add a row after "Model roster": `| Model detail pass (DP0-DP3) | any | Every Blender model (and the four untextured downloaded ships) brought to the downloads' level of geometry and skin | [spec](2026-09-28-model-detail-pass-design.md) | DP0 complete <run date>, on branch \`worktree-detail-pass\` (not merged; merging is Mark's call): the kit's charts and sidecar, the TS skin stage (one baked atlas, three pinned CC0 scans), the UV checker, and two pilots, the Ki-84 and the hangar, skinned; the flat-shaded allowlist stands at 19. [plan](../plans/2026-09-28-dp0-skin-pipeline-pilots.md), [handoff](../../handoff/<run date>-dp0-skin-pipeline.md). DP1-DP3 not started. |`. Match the table's existing column count: read the header row first.
  - **README:** after the roster paragraph, add: "**Model detail pass DP0 landed <run date> on a branch awaiting merge:** Blender models can now carry a baked skin (paint, markings, panel lines and scan detail), and the Ki-84 and the hangar are the first two to have one. The [handoff](docs/handoff/<run date>-dp0-skin-pipeline.md) records what was measured; master spec §15 holds the status."

- [ ] **Step 4: The handoff** `docs/handoff/<run date>-dp0-skin-pipeline.md`, in R4/R5's shape:
  - **What shipped:** the pipeline in one paragraph with a pointer to `docs/models.md`; the ruling (one baked atlas, and why); the scans table; the two pilots in a table (id, bytes / triangles / draw calls from each `built …` line, triangles as % of budget, atlas px, texel size in cm from the sidecar's `metersPerPx`).
  - **Mark's checkpoint (spec §5):** every capture, linked twice: relatively, and as `https://github.com/Coder999/ww2airsim/blob/worktree-detail-pass/docs/handoff/<run date>-dp0-shots/<file>`, because `*.marktuttle.dev` is blocked on his work network. Say that the look lives in `surfaces.ts` and `layers.ts`, so a change he asks for re-skins both pilots and every later model. Say how to see it live: the slot is stopped unless left running, and give the `curl` that must print `200`.
  - **Sources:** Task 1's findings; every ESTIMATE still standing is an open item.
  - **Tier 1 / Tier 2:** the rcs and counts; checks 15 and 16's numbers.
  - **Open:**
    - DP1 (Ki-21, B-29, P-38), DP2 (the winding fix, ships, the 4 downloads' box projection), DP3 (9 buildings; delete the allowlist);
    - the in-game airfield swap stays a later decision (§8 Q4);
    - any UV stretch the checker showed;
    - the marking colors still ESTIMATE;
    - text markings (tail codes, hull numbers) are not drawn by DP0's marking kinds. DP1 (the B-29's tail letters) and DP2 (hull numbers) need a stroke-font marking.
  - **Departures:** the ledger's `Ruling:` lines, summarized.

- [ ] **Step 5: The ledger.** Append the final entry: every rc, the named skips, the two build lines, the Tier 2 rc, the commit range (`git log --oneline main..HEAD`), and "handoff written".

- [ ] **Step 6: Commit, push the branch, email.**
  ```bash
  git status --short
  git add docs/models.md ASSETS.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md docs/handoff/*-dp0-skin-pipeline.md
  git commit -m "DP0: handoff, docs, §15 row, README pointer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git push -u origin worktree-detail-pass
  python3 tools/mail-doc.py docs/handoff/<run date>-dp0-skin-pipeline.md "ww2airsim: DP0 skin pipeline and pilots handoff (branch, not merged)"
  ```
  The mail script prints a byte count and exits 0. **Do not re-run it with `--debug`.** Do not merge, and do not touch `main`.
