# E1 Effects Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all six of today's unlit-quad and unlit-cube effects with one lit, soft, pooled particle system. The sim reports every detonation it already computes. A reduced-resolution pass draws the particles before the clouds, and the clouds stop marching at dense smoke.

**Architecture:** `stepCombat` appends each detonation or ordnance expiry to a bounded ring, `World.combat.impacts`. The change is purely additive and gated by a bit-identity digest. A pure `fx/events.ts` turns sim state into one-shot triggers and state-driven sustained emitters. A zod-validated `fx/catalog.ts` holds the recipes. `fx/system.ts` is a seeded CPU pool (4096/2048/1024 by tier, oldest-first eviction) that writes one sorted instance buffer per frame. `fx/fxPass.ts` is a `TempNode` in `cloudPass.ts`'s pattern. Its `updateBefore` draws the batch twice into reduced-resolution targets: premultiplied color, and a max-blended "dense depth". Its `setup` returns a depth-aware composite over the scene. The cloud pass takes that composite as its scene color and takes the dense depth into its march limit. Particles are lit six-way from code-generated placeholder flipbooks, which ship through the existing KTX2 path in the §6.2 three-image layout.

**Tech Stack:** TypeScript, three r186 `three/webgpu` + TSL, `three/addons/loaders/KTX2Loader.js`, KTX-Software 4.4.2 `ktx create` (pinned by `tools/textures/ktxTool.ts`), `sharp`, zod, vitest (Tier 1), Playwright on the reference GPU (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-26-ordnance-and-effects-design.md`, §3, §4 and §6.4, plus the E1 lines of §7. Out of scope: §2 (O1), §5 (E3: foam stamps, splash tuning) and §6.1–6.3 (E2: Blender bakes, the 10 MB bake gate). Read the spec with this plan. The plan argues from it.

## Decisions recorded with Mark (2026-09-26)

- **Execution location: its own git worktree**, branch `worktree-e1-effects`, run in parallel with O1 in another worktree. Pushing the branch is fine. **Merging to `main` needs Mark's OK.** Never push `main`.
- **Tier 2 dev-server slot: `ww2airsim-3.windomlane.org`, port 5174**, per the repo `CLAUDE.md` ("Two more dev-server slots"). The `vite.config.ts` edit that points at the slot is local scratch. Never commit it.
- **Viewing checkpoint: none.** The sheets are placeholders, so Mark's eye has nothing to judge yet. The Tier 2 captures go into the handoff.
- **Run: unattended.** Run to completion without stopping.
- **The design choices are fixed by the spec.** This plan does not revisit them:
  - the sim ring `{tick, cause, outcome, surface, point}`, purely additive with a bit-identity gate
  - the pure `fx/events.ts`, which absorbs `nextHitFlashes`' edge logic, its restart rule and multi-tick frames
  - the zod `fx/catalog.ts` with the recipe table
  - the seeded CPU pool with tier caps 4096/2048/1024 and oldest-first recycling
  - `fxPass` (½/½/¼ resolution, soft particles, 2 m near fade, dense depth fed to the cloud march limit, composited before clouds)
  - six-way lighting with sun, sky, cloud shadow and `aerialPerspective`, plus emissive fire into bloom
  - code-generated placeholder sheets through the KTX2 path
  - the new `fx` quality system
  - all six effects migrated and the old code deleted
  - the Tier 2 `fx-budget.spec.ts`, captures, a soft-edge check and a cloud-ordering check
- **Not in E1:** foam stamps (E3), Blender (E2), GPU compute.

## Size and split

**13 tasks**, near the top of the house range (6–15). The split point, if the executor must pause, is **after Task 8**. Tasks 1–8 are independently testable on Tier 1 and leave the game running as today: nothing is wired into `main.ts` except the quality plumbing. Tasks 9–13 wire the engine, delete the old effects and run the GPU gates. Splitting E1 into two plans was considered and rejected: a half-landed engine (Tasks 1–8) delivers nothing Mark can see, and the deletion must land with the wiring (spec §3.5, "does not ship next to them").

## What was established before writing (2026-09-26, nexus)

Measured at `8935059`. `main` then moved to `2d77083` (the loading-and-dossier merge) while this plan was written. `git diff --stat 8935059 2d77083 -- src/sim tools content` is empty, so the digests hold. **Every `src/render/main.ts` line number below is at `2d77083`.** The other files this plan cites by line are unchanged between the two commits.

These were measured, not assumed. They are still claims to re-check.

| Fact | How verified |
| --- | --- |
| **No golden serializes `World.combat`.** `tests/sim/golden/trajectory.test.ts` compares `recordTrajectory(f6f).checkpoints` only (tick, position, speed of one aircraft; `tools/golden/record.ts:84`). The soak tests compare runs with each other. So spec §3.1's "exclude the ring from serialization" has nothing to exclude. The bit-identity gate is instead a **digest of the world with `impacts` stripped**, compared against baselines recorded before the change (below). | read both files; `grep -rn "JSON.stringify\|structuredClone" tests/sim src/sim` (every hit compares a run against a copy of itself) |
| Baseline digests at `8935059`, node v22.22.1. Every shipped scenario, terrain `null`, 1,800 ticks, sha256 of `{tick, aircraft, ships, combat minus impacts, accumulatorSeconds}`: deck-quals `f5be48c2c641bea55dcb255a69f7c5d9aa15264c7c0c8c20956f52bf5330afc1`, free-flight `1bf07decdd1d0f54e765e2603f22aac5714c04f7b6965a437ea6292d42218575`, gunnery-range `acb6072ebe4b353f010384f876e744ae8557de3c4caadd0eab13199efec67061`, pursuit-range `77d2aa0036653895894cd4e1a6a7fcc8ea0ab87767d48c25a6f7fd902125b570`, pursuit-range-veteran `e2a415b9edebf4480c8b7e6186e37120296c124eda7a2b18277beb91994e1231`, strike-range `ace29a5a21bac2bfbf4a4114445cf8707a90d95df8754ba025c04c37eb421e6d` | the probe in Task 1 Step 1, run from `/tmp` against the main checkout |
| Armed strike probe: strike-range, loadout `both`, player placed at (−28629, 1500, −16479) doing 120 m/s east, bombs at ticks 30 and 90, rocket pairs at 150 and 210, guns held for ticks 300–359, 1,200 ticks. Digest `6b7b26c18d72f4aef1be7b61a384b81d6d80ee61c51b20a01b25dda8907b3b78`, 2 bombs, 4 rockets, 84 shots, identical on two runs. This exercises the bomb, rocket and round paths the shipped scenarios never reach with terrain `null`. | same, second probe in Task 1 Step 1 |
| **A destroyed aircraft is frozen in place, not falling.** `stepAircraftEntity` returns the entity unchanged once `damage.destroyedAt !== null` (`src/sim/loop.ts:649`). Spec §3.3's "smoke trail attached to the falling wreck" therefore trails from a wreck that hangs where it died (Ruling R6). | read |
| `stepCombat` resolves a sea contact and a ground contact as the same `Contact` kind `'ground'` (`combat.ts:233-236`). The split into water, land and deck has to be added. `groundUnder` already returns `surface: 'water' \| 'land' \| 'deck'` (`src/sim/world/ground.ts:34-50`). | read |
| A bomb that has not armed is removed with no damage (`combat.ts:638`). A projectile whose `lifeS` runs out is dropped silently (`combat.ts:632-634`). Rounds do this too, about every 3 s (`content/aircraft/f6f-hellcat.json` `combat.lifetimeS` = 3). Bombs live 60 s and rockets 12 s. | read |
| `MAX_STEPS_PER_FRAME = 5` (`src/sim/loop.ts:81`). A world's `tick` after a step equals the `tick` handed to `stepCombat` that step (`loop.ts:805-848`). | read |
| **KTX2Loader r186 drops array layers on the uncompressed path.** `createRawTexture` builds a `DataTexture`, or a `Data3DTexture` only when `pixelDepth > 0`, and ignores `layerCount` (`node_modules/three/examples/jsm/loaders/KTX2Loader.js:1097-1200`). The Basis path returns a `CompressedArrayTexture` when `layerCount > 1` (`:447-448`). **So every sheet image must be Basis-encoded** (Ruling R8). | read |
| **WebGPU's default `maxTextureArrayLayers` is 256.** `src/render/renderer.ts:45-53` raises only `maxTextureDimension2D` and `maxBufferSize`. E2's 64 frames × 6 sheets = 384 layers would not fit one array. Hence Ruling R7's layout: one layer per frame, the six sheets as an atlas inside each layer. | read |
| `RendererUtils.resetRendererState` sets the clear color to **alpha 1** and `autoClear = true` (`node_modules/three/src/renderers/common/RendererUtils.js:46-57`). A premultiplied target must set `setClearColor(0x000000, 0)` after it. | read |
| `perspectiveDepthToViewZ` handles the reversed depth buffer itself (`node_modules/three/src/nodes/display/ViewportDepthNode.js:227-239`). `renderer.ts:110` enables it. | read |
| MRT per-attachment blending exists (`MRTNode.setBlendMode`, `MRTNode.js:107`; used by `WebGPUPipelineUtils.js:146-155`). It applies only to the **renderer's** MRT (`renderObject.context.mrt`), not to a material's `fragmentNode`. The plan uses two draws instead (Ruling R9). MRT is a lever if Task 12 shows the second draw's cost. | read |
| `BlendMode` is exported from `three/webgpu` (`Three.WebGPU.js:34`). `MaxEquation` = 104 (`constants.js:205`). | read |
| `terrain/mesh.ts:524-560, 636-660` is the working in-repo pattern for per-instance data: `InstancedBufferGeometry` + `InstancedBufferAttribute` (`DynamicDrawUsage`) + TSL `attribute('name', 'vec4')` + `instanceCount` + `frustumCulled = false`. | read |
| Terrain lighting convention: `albedo / π × (ambient + sunColor × lambert × shadowT)`, ambient `mix(skyDown, skyUp + cloudSkylight, n.y·0.5+0.5)`, then `lit × ap.a + ap.rgb` with `ap = varying(aerialPerspective(eyeToVertex, dist))` (`src/render/terrain/mesh.ts:336-353`). `SUN_ILLUMINANCE` = 3.6 (`src/render/sky/palette.ts:26`). `BLOOM_THRESHOLD` = 1.2 (`src/render/pipeline.ts:127`). | read |
| `budget4k.spec.ts` gates 4K p95 at 16.67 ms (high) and 8.33 ms (medium). `docs/clouds.md` §5 item 5: **`photo` at High has 0.6 ms of margin.** The fx pass's idle cost must therefore be ~0 (Ruling R12). | read |
| `remote-run npm run verify` fails lint on ryzen because of `tools/textures/cache/` in its data mirror (`docs/clouds.md` §4, Harness). | read |

## Rulings made in this plan (read before "fixing" any of them)

1. **R1 — Expired entries carry `surface: 'air'`.** Spec §3.1's union has no value for "it was in the air when `lifeS` ran out". Adding `'air'` is the honest location. Nothing renders for `'expired'` (Task 4 maps it to no recipe). *Cost if reversed:* making `surface` optional, and a null check at every consumer.
2. **R2 — A dud (a bomb that had not armed) records nothing.** Spec §3.1 says "appends each **detonation**", and a dud does not detonate (`combat.ts:638`). A dud into the sea therefore makes no splash in E1. E3 can revisit with a `'dud'` outcome.
3. **R3 — Round expiries are not recorded.** Spec §3.1: `'expired'` "marks a bomb or rocket that reached `lifeS`". Rounds expire in bulk (3 s life) and have nothing to show.
4. **R4 — Recipe mapping beyond the spec's table.** A bomb or rocket that hits a deck, ship, structure or aircraft uses its `.land` recipe (a fireball is a fireball). A round that hits an aircraft uses a new `round.aircraft` recipe (spark and a small flash). That is today's `hitFlash` "hit", which spec §3.5 migrates, though the §3.3 table forgot it.
5. **R5 — Every aircraft's crash fires a crash recipe, not only the player's.** Spec §3.2 names "the player's crash". An AI Zero that flies into the sea and makes no splash would read as a bug. The edge is keyed by entity id, exactly like kills.
6. **R6 — The kill trail rises from the frozen wreck.** See the table above. `kill.air` is a one-shot fireball plus a sustained smoke emitter at the wreck for `KILL_TRAIL_S` (20 s, fading). A falling wreck is a sim change, out of scope.
7. **R7 — One KTX2 array per image, one layer per frame, the six sheets as a 3×2 atlas inside each layer.** This keeps §6.2's "one layer per frame" and fits E2's 64 frames under the 256-layer limit. It lets one draw of one material sample every sheet, which the single back-to-front sort needs. The manifest holds `cols`, `rows`, `cellPx`, `frames` and each sheet's `cell`, so E2 changes files, not code.
8. **R8 — All three images are Basis-encoded; placeholders use ETC1S (`basis-lz`), linear.** The uncompressed KTX2 path drops layers (table above). ETC1S keeps the placeholder commit small. E2 picks its own encoding (UASTC is likely for lightmaps) with no code change: `KTX2Loader` transcodes either.
9. **R9 — Dense depth is a second draw of the same instances, not an MRT attachment.** The dense draw goes into an `R16F` target with `MaxEquation` blending of an encoded "closeness" `c = 1 / (1 + viewZ / 1000 m)` (clear 0 = infinitely far; half float carries ~11 bits of relative precision at any distance). A fragment writes `c` only where its own alpha exceeds `DENSE_FRAGMENT_ALPHA` (0.05). The cloud pass trusts it only where the fx color target's accumulated alpha exceeds **0.5**. Together that is §4.2's "nearest texel where accumulated alpha exceeds 0.5", to within one texel's particles. *Cost if reversed:* renderer-level MRT around a scene render, and a per-attachment blend state (see "established" above). It is lever (d) in Task 12.
10. **R10 — Particles live in their own `Scene`, whose `position` mirrors `scene.position` every frame.** They have to render in a separate pass, not in the scene pass. The instance data stays in raw world metres, and the camera-relative shift is inherited exactly as spec §3.4 says, through the scene's position.
11. **R11 — Soft particles and the composite read the same "representative pixel" per fx texel.** That pixel is the full-resolution pixel at the texel's block center (`fxTexelPixel`), loaded from `sceneDepth`. There is no extra downsample pass. The fx pass has no depth buffer, so the soft fade *is* its depth test: a particle behind the ground fades to 0. The composite's depth-weighted upsample (four bilinear taps weighted by `1 / (0.01 + |z − z_tap| / z)`, `cloudPass.ts`' rule) keeps a half-resolution edge from bleeding smoke onto a wing.
12. **R12 — Idle cost is one uniform branch.** With no live particle, `updateBefore` renders nothing and the composite's `If(active)` skips every tap. The composite is not a pass of its own: it is inlined into whatever reads it (the cloud composite, or `outputChain`'s `convertToTexture`).
13. **R13 — Anchors come from the renderer.** A ship's fire rises from its view's smoke origin (`ShipView.smokeOrigin`, new), which includes the model's own `SmokeOrigin` node and the sink offset. A structure's collapse rises from the rendered building (`AirfieldHandle.smokeAnchors`, new). The sim's structure boxes are built once, at world creation (`loop.ts:565`, `structures.ts:36`), so they are not a ground-height source E1 wants to depend on.
14. **R14 — Effects run on sim-scaled wall time:** `dt = paused ? 0 : min(frameS, 0.1) × timeScale`. A paused game freezes the smoke. Triple time triples it. The crash hold (world frozen under the debrief, not `paused`) keeps animating, as `impactEffect.ts` did.
15. **R15 — A saved quality object without `fx` loads with `fx = clouds`.** Both are reduced-resolution post passes, and a player who chose Low clouds for speed wants cheap effects. Rejecting the old shape would silently discard every returning player's choice and re-run the probe.
16. **R16 — Frame blending and top-mip skip are built now, because the tier table (§4.4, an E1 section) owns them.** Blending is a motion-warped crossfade between adjacent frames. Top-mip skip is a `+1` LOD bias at Low. E2 may later drop mip 0 at load. Spec §8 lists "six-way lighting, frame blending, fire emission" under E2. Mark's E1 decisions put the lighting and emissive fire here, so E2 is left with the bakes and their tuning.
17. **R17 — Back-to-front CPU sort, premultiplied "over" blending** (`One, OneMinusSrcAlpha`). Fire is premultiplied radiance with low alpha, so additive-looking fire and occluding smoke share one blend state and one draw.
18. **R18 — `?fx=off` builds no pass and no system.** It is the baseline `fx-budget.spec.ts` measures against, the way `?cloudTier=off` is for clouds.

## Global Constraints

- three stays at `^0.186.0`. No new runtime dependency. `KTX2Loader` comes from `three/addons/loaders/KTX2Loader.js`.
- **Bit-identity gate (spec §3.1):** the golden trajectory, the soak tests, every test card, and both digest probes in Task 1 reproduce their baselines exactly. Nothing in `src/sim/` reads `impacts` except the code that writes it.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library (`.dependency-cruiser.cjs`, `tests/architecture/boundary.test.ts`).
- **Tier caps (spec §4.4): high 4,096 / medium 2,048 / low 1,024 particles; fxPass resolution ½ / ½ / ¼; frame blending yes / yes / no; top mip yes / yes / skipped.**
- **Near fade: sprites within about 2 m of the eye fade out** (spec §4.1). Constants: fade from 0 at 0.5 m to 1 at 2.0 m.
- **Cost gates (spec §4.5):** at 1440p on high, gpu p95 with effects is at most **1.0 ms** above the same scene with `?fx=off`. The 1440p **6.0 ms** tripwire and `budget4k.spec.ts`'s limits stay green.
- **No dynamic lights** (spec §4.3). A detonation does not light nearby terrain or aircraft.
- **GPU compute is not built** (spec §3.4).
- **`docs/clouds.md` is updated in the same commit as any cloud change** (repo `CLAUDE.md`, item 6). In E1 that is Task 8.
- Every bundled asset gets an `ASSETS.md` row in the same commit that adds it.
- **O1 overlap: `src/render/ordnance.ts`.** O1 changes the in-flight store meshes (`makePool` geometry, `ordnanceInstances`/`flameInstances`, lines 29–88 and 203–235 at `8935059`). E1 deletes only the impact pool and its helpers (lines 8, 23–27, 31, 44–45, 90–181, the handle members `updateEffects`/`spawnImpact` and the `eye` parameter, and lines 237–252 and 259–295). **Keep E1's `ordnance.ts` diff to those deletions.** Do not reformat, reorder or re-document the in-flight code. Whichever branch merges second resolves the conflict. The hunks do not overlap.
- `npm run verify` ends every task. On nexus, run only the named test files you touch, with `--maxWorkers=2`. Parallel full suites have OOM-killed nexus. The end-of-plan full verify goes through `remote-run`. Always capture the runner's own status (`cmd; echo rc=$?`), never a grepped pipeline's.
- **Never run `git clean -fdx`.** Never `npm install` inside the worktree: its `node_modules` is a symlink to the main checkout's.
- Scratch probes go under `.superpowers/` (gitignored). Never commit a probe, and never commit the `vite.config.ts` slot edit. Stage files by name, never `git add -A`.
- Tier 2 runs on the reference GPU only. **Read every screenshot you cite.** A graph that fails to build renders black with zero validation errors (`docs/clouds.md` §4). Check the console and `__ww2.fx()` before believing a timing.
- US spelling in new prose and identifiers. Escape `|` as `\|` inside markdown table cells.
- End every commit message with the `Co-Authored-By` trailer your session's instructions specify.
- Keep the rulings ledger at `.superpowers/sdd/e1/progress.md` (gitignored) for every decision made during execution.

## Review Focus

1. **A returning player's saved settings predate `fx`.** `ww2airsim.quality.v1` holds `{ocean, scenery, clouds}`. Expected: it loads with `fx` taken from `clouds` (R15). It is not discarded, and the probe does not re-run. *Test: Task 6, "legacy settings without fx".*
2. **The sheets fail to load** (404, transcoder blocked, offline). Expected: the game boots, effects still draw as soft procedural blobs from the fallback sheet, `__ww2.fx().sheetsFallback` is `true`, and there is a `console.warn`, not an error (errors fail every Tier 2 spec). *Tests: Task 7 (fallback texture shape) and Task 11 (route-abort case).*
3. **Restart or scenario switch while smoke is up.** Expected: nothing from the old flight survives. No stale column and no burst of the old ring's triggers on the first frame of the new one. *Tests: Task 4 (restart rule with a non-empty ring) and Task 5 (`clear()`). Task 9 wires `clear()` into `resetFlightUi`. Task 11 asserts `fx().live === 0` right after Restart.*
4. **Pause and time scale.** Expected: a paused game's smoke is frozen, triple time runs effects three times as fast, and the crash debrief keeps animating (R14). *Test: Task 5, `fxDtSeconds` and `step(0)`.*
5. **The camera inside a smoke column** (flying through a burning ship's plume, or cockpit view beside it). Expected: no full-screen opaque wall, and the frame stays inside the 6.0 ms tripwire. *Tests: Task 7 `nearFade` twin, and Task 12's "eye in smoke" budget case.*

Also covered, because the spec implies them: a tier dropped mid-flight with more live particles than the new cap keeps the newest (Task 5, `setCapacity`). A frame spanning several ticks loses no trigger (Task 4). A ring overflow drops the oldest (Task 1).

---

## Setup (before Task 1; not a commit)

- [ ] **S1. Create the worktree.** From the main checkout:

```bash
cd /home/mark/projects/ww2airsim
git worktree add .claude/worktrees/e1-effects -b worktree-e1-effects main
cd .claude/worktrees/e1-effects
ln -s /home/mark/projects/ww2airsim/node_modules node_modules
# The pinned ktx binary Task 2 needs, without a second 30 MB download:
mkdir -p tools/textures && ln -s /home/mark/projects/ww2airsim/tools/textures/cache tools/textures/cache
# Gitignored terrain tiles (32 KB) the dev server serves:
mkdir -p content/terrain && cp -r /home/mark/projects/ww2airsim/content/terrain/tiles content/terrain/
git lfs pull 2>/dev/null; ls -la content/terrain/L0.bin   # must be ~134 MB, not a 130-byte pointer
```

- [ ] **S2. Ledger.** Create `.superpowers/sdd/e1/progress.md` with this plan's path, the branch, the start commit (`git rev-parse --short HEAD`) and an empty "Rulings during execution" list.
- [ ] **S3. Confirm the baseline Tier 1 files pass before touching anything:** `npx vitest run tests/sim/weapons/combat.test.ts tests/sim/strike.test.ts --maxWorkers=2; echo rc=$?` → `rc=0`.

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/sim/weapons/impacts.ts` | create | `CombatImpact`, `ImpactSurface`, `IMPACT_RING_CAPACITY`, `appendImpacts` |
| `src/sim/weapons/combat.ts` | modify | `CombatState.impacts`; ground contact knows sea vs land; append detonations and bomb/rocket expiries |
| `src/render/fx/sheetManifest.ts` | create | `FX_SHEETS`, manifest zod schema, `sheetLayout` (tsx-safe: no `three`, no `import.meta.env`) |
| `tools/fx/placeholders.ts` | create | deterministic placeholder pixels, three images per frame layer |
| `tools/fx/build.ts` | create | `npm run fx:placeholders`: PNG layers → three KTX2 arrays + `content/fx/sheets.json` |
| `content/fx/fx-light-a.ktx2`, `fx-light-b.ktx2`, `fx-motion.ktx2`, `sheets.json` | create (generated, committed) | the placeholder sheets |
| `src/render/fx/catalog.ts` | create | `RECIPE_IDS`, emitter/recipe zod schema, `FX_CATALOG` |
| `src/render/fx/events.ts` | create | pure: sim state → triggers + sustained emitters; restart rule; impact/crash recipe mapping |
| `src/render/fx/tiers.ts` | create | `FX_TIERS`, `FX_MAX_CAPACITY` |
| `src/render/fx/system.ts` | create | seeded CPU pool, emitters, eviction, sorted instance writer, `fxDtSeconds` |
| `src/render/quality.ts`, `settings.ts`, `bootQuality.ts` | modify | the fourth quality system, `fx`; legacy migration |
| `src/render/fx/shading.ts` | create | lighting/fade constants and their CPU twins |
| `src/render/fx/sheets.ts` | create | runtime KTX2 loader with a procedural fallback |
| `src/render/fx/material.ts` | create | the particle and dense-depth `NodeMaterial`s (billboard, streak, six-way, fire, fades, frame blend) |
| `src/render/fx/fxPass.ts` | create | the `TempNode`, its targets, the composite, the cloud-limit API, instance upload |
| `src/render/scene/cloudPass.ts` | modify | optional `fxLimit`: `min()` into the march limit and the composite depth |
| `docs/clouds.md` | modify | same commit as `cloudPass.ts` |
| `src/render/fx/query.ts` | create | DEV `?fx=`, `?fxSoft=`, `?fxCloudLimit=` |
| `src/render/fx/stress.ts` | create | pure stress/capture scenes for `__ww2.fxStress` |
| `src/render/main.ts` | modify | wiring, tier binding, per-frame update, reset, diagnostics; old effects removed in Task 10 |
| `src/render/diagnostics.ts` | modify | `fx()`, `fxStress()` |
| `src/render/scene/ship.ts` | modify | `smokeOrigin` marker (Task 9); engine-smoke child removed (Task 10) |
| `src/render/scene/airfield.ts` | modify | `smokeAnchors` (Task 9); smoke column removed (Task 10) |
| `src/render/scenarioEntities.ts` | modify | `smokes` removed (Task 10) |
| `src/render/ordnance.ts` | modify | impact pool removed (Task 10; see the O1 constraint) |
| `src/render/scene/impactEffect.ts`, `hitFlash.ts`, `smoke.ts` | delete | Task 10 |
| `tests/sim/weapons/impacts.test.ts`, `tests/architecture/impactsRing.test.ts` | create | Task 1 |
| `tests/tools/fxSheets.test.ts` | create | Task 2 |
| `tests/render/fxCatalog.test.ts`, `fxEvents.test.ts`, `fxSystem.test.ts`, `fxShading.test.ts`, `fxPass.test.ts` | create | Tasks 3–8 |
| `tests/architecture/fxMigration.test.ts` | create | Task 10: the old effects stay deleted |
| `tests/e2e/fx.spec.ts`, `tests/e2e/fx-budget.spec.ts`, `tests/e2e/fxPixels.ts` | create | Tasks 11–12 |
| `package.json` | modify | `"fx:placeholders": "tsx tools/fx/build.ts"` |
| `ASSETS.md` | modify | one row for the placeholder sheets |

---
### Task 1: The sim surfaces its impacts (`World.combat.impacts`)

**Files:**
- Create: `src/sim/weapons/impacts.ts`
- Modify: `src/sim/weapons/combat.ts` (`Contact` type `:222-226`, `nearestContact` `:228-260`, `CombatState` `:80-89`, `createCombat` `:97-108`, the shot loop `:619-645`, the return `:669`)
- Test: `tests/sim/weapons/impacts.test.ts`, `tests/architecture/impactsRing.test.ts`
- Probe (gitignored): `.superpowers/e1/digest.ts`, `.superpowers/e1/strike.ts`

**Interfaces:**
- Produces (in `src/sim/weapons/impacts.ts`):
  - `export type ImpactSurface = 'water' | 'land' | 'deck' | 'aircraft' | 'ship' | 'structure' | 'air'`
  - `export type CombatImpact = { readonly tick: number; readonly cause: 'round' | 'bomb' | 'rocket'; readonly outcome: 'detonated' | 'expired'; readonly surface: ImpactSurface; readonly point: Vec3 }`
  - `export const IMPACT_RING_CAPACITY = 512`
  - `export function appendImpacts(ring: readonly CombatImpact[], added: readonly CombatImpact[]): readonly CombatImpact[]`
- Produces (in `combat.ts`): `CombatState.impacts: readonly CombatImpact[]`, oldest first. It is the same array reference across a tick that appended nothing.

- [ ] **Step 1: Record the bit-identity baselines on the untouched code.** Create `.superpowers/e1/digest.ts`:

```ts
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { advance } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'

// E1 bit-identity gate (spec §3.1): everything the world holds EXCEPT the new
// ring. Before Task 1 the ring does not exist, so stripping it is a no-op.
const TICKS = Number(process.argv[2] ?? 1800)
const ids = readdirSync(new URL('../../content/scenarios/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
for (const id of ids) {
  let world = worldFromScenario(loadScenarioBundle(id), null)
  for (let i = 0; i < TICKS; i++) world = advance(world, DT).world
  const { tick, aircraft, ships, accumulatorSeconds } = world
  const { impacts: _ring, ...combat } = world.combat as typeof world.combat & { impacts?: unknown }
  const json = JSON.stringify({ tick, aircraft, ships, combat, accumulatorSeconds }, (_k, v: unknown) => (v instanceof Set ? [...v] : v))
  console.log(id.padEnd(24), createHash('sha256').update(json).digest('hex'), `tick=${tick}`)
}
```

and `.superpowers/e1/strike.ts`:

```ts
import { createHash } from 'node:crypto'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { advance } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { createState, type Controls } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'

// The shipped scenarios never release ordnance with terrain null; this drives
// bombs, rockets and guns over the sea so the gate covers those paths.
const TICKS = Number(process.argv[2] ?? 1200)
let world = worldFromScenario(loadScenarioBundle('strike-range'), null, 'both')
const start = createState({ position: v3(-25629 - 3000, 1500, -16479), velocity: v3(120, 0, 0) })
world = { ...world, aircraft: world.aircraft.map((a) => a.id === world.player ? { ...a, state: start, previous: start } : a) }
const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
for (let i = 0; i < TICKS; i++) {
  const controls: Controls = { ...idle,
    ...(i === 30 || i === 90 ? { dropBomb: true } : {}),
    ...(i === 150 || i === 210 ? { fireRockets: true } : {}),
    ...(i >= 300 && i < 360 ? { fire: true } : {}) }
  world = { ...world, aircraft: world.aircraft.map((a) => a.id === world.player ? { ...a, controls } : a) }
  world = advance(world, DT).world
}
const { tick, aircraft, ships, accumulatorSeconds } = world
const { impacts, ...combat } = world.combat as typeof world.combat & { impacts?: readonly { cause: string; outcome: string; surface: string }[] }
const json = JSON.stringify({ tick, aircraft, ships, combat, accumulatorSeconds }, (_k, v: unknown) => (v instanceof Set ? [...v] : v))
const rec = world.combat.aircraft[world.player]!
console.log('strike-armed'.padEnd(24), createHash('sha256').update(json).digest('hex'), `tick=${tick}`,
  `bombs=${rec.bombsDropped} rockets=${rec.rocketsFired} shots=${rec.shots}`,
  `impacts=${impacts === undefined ? 'absent' : JSON.stringify(impacts.map((i) => `${i.cause}/${i.outcome}/${i.surface}`))}`)
```

Run: `npx tsx .superpowers/e1/digest.ts 1800; echo rc=$?` then `npx tsx .superpowers/e1/strike.ts 1200; echo rc=$?`
Expected: `rc=0` twice, and the seven hashes in "What was established before writing", character for character (`impacts=absent`, `bombs=2 rockets=4 shots=84`). If any hash differs, **stop**: `main` moved under the plan. Record the new baselines in the ledger with the commit, and use those.

- [ ] **Step 2: Write the failing tests.** `tests/sim/weapons/impacts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3, ZERO, type Vec3 } from '../../../src/sim/math/vec3.js'
import { createCombat, stepCombat, type CombatAircraft, type CombatState, type Projectile } from '../../../src/sim/weapons/combat.js'
import { storesFromLoadout } from '../../../src/sim/weapons/stores.js'
import { appendImpacts, IMPACT_RING_CAPACITY, type CombatImpact } from '../../../src/sim/weapons/impacts.js'
import { createTerrainField, SEA_LEVEL_M, type TerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'

const spec = loadAircraftSpec('f6f-hellcat')
const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
/** The flat heightfield strike.test.ts uses. */
const flat = (heightM: number): TerrainField => createTerrainField(
  parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
  12, new Int16Array(9).fill(Math.round(heightM * 10)),
)
/** The shooter, parked far from every shot so it is never a contact. */
const owner: CombatAircraft = (() => {
  const state = createState({ position: v3(50000, 3000, 50000) })
  return { id: 'f6f-1', spec, state, previous: state, controls: idle, impact: null }
})()
const shot = (kind: Projectile['kind'], position: Vec3, velocity: Vec3, over: Partial<Projectile> = {}): Projectile => ({
  owner: 'f6f-1', id: 1, position, previous: position, velocity, tracer: false, kind, ageS: 1,
  lifeS: kind === 'round' ? 3 : kind === 'bomb' ? 60 : 12, ...over,
})
const withShots = (...projectiles: Projectile[]): CombatState =>
  ({ ...createCombat([owner], { 'f6f-1': storesFromLoadout(spec, 'both') }), projectiles })
const step = (c: CombatState, terrain: TerrainField | null, tick = 7): CombatState =>
  stepCombat(c, [owner], [], [], terrain, null, [], tick, DT)

describe('World.combat.impacts (effects design §3.1)', () => {
  it('starts empty', () => {
    expect(createCombat([owner]).impacts).toEqual([])
  })

  it('a gun round into the sea records surface water at the contact point, stamped with the tick', () => {
    const after = step(withShots(shot('round', v3(0, 5, 0), v3(0, -800, 0))), null, 7)
    expect(after.impacts).toHaveLength(1)
    const hit = after.impacts[0]!
    expect(hit).toMatchObject({ tick: 7, cause: 'round', outcome: 'detonated', surface: 'water' })
    expect(hit.point.y).toBeCloseTo(SEA_LEVEL_M, 9)
    expect(hit.point.x).toBeCloseTo(0, 9)
  })

  it('a gun round into land records surface land within the bisection tolerance', () => {
    const after = step(withShots(shot('round', v3(0, 25, 0), v3(0, -800, 0))), flat(20))
    expect(after.impacts.map((i) => i.surface)).toEqual(['land'])
    expect(after.impacts[0]!.point.y).toBeCloseTo(20, 1)
  })

  it('an armed bomb into the sea records a detonation on water', () => {
    const after = step(withShots(shot('bomb', v3(0, 2, 0), v3(0, -300, 0))), null)
    expect(after.impacts).toEqual([expect.objectContaining({ cause: 'bomb', outcome: 'detonated', surface: 'water' })])
  })

  it('a dud (unarmed bomb) records nothing (Ruling R2)', () => {
    const after = step(withShots(shot('bomb', v3(0, 2, 0), v3(0, -300, 0), { ageS: 0.1 })), null)
    expect(after.projectiles).toEqual([])
    expect(after.impacts).toEqual([])
  })

  it('a bomb and a rocket reaching lifeS in the air record outcome expired, surface air (Ruling R1)', () => {
    const bomb = shot('bomb', v3(0, 3000, 0), v3(100, 0, 0), { lifeS: 0.005 })
    const rocket = shot('rocket', v3(0, 3000, 100), v3(300, 0, 0), { id: 2, lifeS: 0.005, ageS: 5 })
    const after = step(withShots(bomb, rocket), null)
    expect(after.projectiles).toEqual([])
    expect(after.impacts.map((i) => [i.cause, i.outcome, i.surface])).toEqual([['bomb', 'expired', 'air'], ['rocket', 'expired', 'air']])
    expect(after.impacts[0]!.point.y).toBeGreaterThan(2999)
  })

  it('a round reaching lifeS records nothing (Ruling R3)', () => {
    const after = step(withShots(shot('round', v3(0, 3000, 0), v3(800, 0, 0), { lifeS: 0.005 })), null)
    expect(after.projectiles).toEqual([])
    expect(after.impacts).toEqual([])
  })

  it('keeps the same array reference across a tick that appended nothing', () => {
    const before = withShots(shot('round', v3(0, 3000, 0), v3(800, 0, 0)))
    expect(step(before, null).impacts).toBe(before.impacts)
  })

  it('appendImpacts keeps the newest IMPACT_RING_CAPACITY entries, oldest first', () => {
    const entry = (tick: number): CombatImpact => ({ tick, cause: 'round', outcome: 'detonated', surface: 'land', point: ZERO })
    let ring: readonly CombatImpact[] = []
    for (let t = 1; t <= IMPACT_RING_CAPACITY + 88; t++) ring = appendImpacts(ring, [entry(t)])
    expect(ring).toHaveLength(IMPACT_RING_CAPACITY)
    expect(ring[0]!.tick).toBe(89)
    expect(ring.at(-1)!.tick).toBe(IMPACT_RING_CAPACITY + 88)
    expect(appendImpacts(ring, [])).toBe(ring)
  })

  it('holds a whole MAX_STEPS_PER_FRAME frame of the heaviest gunfire the sim allows', () => {
    // Six .50s at 800 rpm fire 6 * 800 / 60 / 60 = 1.33 rounds per tick, so
    // at most 2 contacts per tick per airplane. A frame is at most
    // MAX_STEPS_PER_FRAME = 5 ticks. 512 therefore holds 38 airplanes all
    // hitting something every tick of a worst-case frame -- no scenario has
    // a tenth of that. Pinned so a capacity cut is a decision, not a drive-by.
    expect(IMPACT_RING_CAPACITY).toBeGreaterThanOrEqual(5 * 38 * 2)
  })
})
```

And `tests/architecture/impactsRing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIM = fileURLToPath(new URL('../../src/sim/', import.meta.url))
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
})

describe('the impacts ring is write-only inside the sim (effects design §3.1)', () => {
  it('no src/sim file other than its writers reads `.impacts`', () => {
    const writers = new Set(['weapons/combat.ts', 'weapons/impacts.ts'])
    const readers = walk(SIM)
      .filter((p) => !writers.has(relative(SIM, p).split('\\').join('/')))
      .filter((p) => /\.impacts\b/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SIM, p))
    expect(readers).toEqual([])
  })
})
```

- [ ] **Step 3: Run them and watch them fail.**
Run: `npx vitest run tests/sim/weapons/impacts.test.ts tests/architecture/impactsRing.test.ts --maxWorkers=2; echo rc=$?`
Expected: FAIL. `impacts.ts` does not exist. `rc=1`. The architecture test passes already, which is fine: it is a guard.

- [ ] **Step 4: Implement.** Create `src/sim/weapons/impacts.ts`:

```ts
import type { Vec3 } from '../math/vec3.js'

/**
 * What a bomb, rocket or round ended on (ordnance-and-effects design §3.1).
 * The first six are the spec's union; `'air'` is E1 Ruling R1 -- where a bomb
 * or rocket is when its `lifeS` runs out, which the spec's union has no
 * value for.
 */
export type ImpactSurface = 'water' | 'land' | 'deck' | 'aircraft' | 'ship' | 'structure' | 'air'

/** One entry of `CombatState.impacts`. `point` is the exact contact point
 *  `stepCombat` already computes for damage (or, for an expiry, where the
 *  projectile was), in world metres. */
export type CombatImpact = {
  readonly tick: number
  readonly cause: 'round' | 'bomb' | 'rocket'
  readonly outcome: 'detonated' | 'expired'
  readonly surface: ImpactSurface
  readonly point: Vec3
}

/** Oldest entries fall off past this. `MAX_STEPS_PER_FRAME` (5) ticks of
 *  heavy gunfire fit many times over; impacts.test.ts pins the margin. */
export const IMPACT_RING_CAPACITY = 512

/**
 * The ring after one tick. Returns `ring` ITSELF when nothing was added, so a
 * quiet tick allocates nothing and consumers can compare references.
 *
 * Nothing in `src/sim/` reads the ring (tests/architecture/impactsRing.test.ts):
 * it exists for the renderer (`src/render/fx/events.ts`), and the bit-identity
 * gate (plan E1 Task 1) holds only because no sim decision depends on it.
 */
export function appendImpacts(ring: readonly CombatImpact[], added: readonly CombatImpact[]): readonly CombatImpact[] {
  if (added.length === 0) return ring
  const next = ring.concat(added)
  return next.length <= IMPACT_RING_CAPACITY ? next : next.slice(next.length - IMPACT_RING_CAPACITY)
}
```

In `combat.ts`:

1. Import: `import { appendImpacts, type CombatImpact, type ImpactSurface } from './impacts.js'`.
2. `CombatState` gains, after `structures`:

```ts
  /** Every detonation, and every bomb/rocket `lifeS` expiry, oldest first,
   *  bounded (`IMPACT_RING_CAPACITY`). Written here, read only by the
   *  renderer's effects (ordnance-and-effects design §3.1). */
  readonly impacts: readonly CombatImpact[]
```

3. `createCombat` returns `impacts: []` beside `poolSaturated: 0`.
4. The `'ground'` contact learns which plane it hit. **The change adds a field and leaves `t` and the candidate order unchanged**, so `nearest` picks exactly as before:

```ts
type Contact =
  | { readonly t: number; readonly kind: 'ground'; readonly sea: boolean }
  // ...the other three members unchanged
```

In `nearestContact`: `candidates.push({ t: ground, kind: 'ground', sea: false })` and `candidates.push({ t: sea, kind: 'ground', sea: true })`.

5. Below `nearestContact`, add:

```ts
/** What a contact was ON, for the impacts ring only -- no damage rule reads
 *  this. The sea plane is always water; the heightfield/deck contact asks
 *  `groundUnder` at the contact point, whose `surface` already tells a deck
 *  from land from seabed ('water'). */
function contactSurface(c: Contact, point: Vec3, terrain: TerrainField | null, decks: readonly Deck[]): ImpactSurface {
  switch (c.kind) {
    case 'aircraft': return 'aircraft'
    case 'ship': return 'ship'
    case 'structure': return 'structure'
    case 'ground': return c.sea ? 'water' : groundUnder(terrain, decks, point.x, point.z)?.surface ?? 'land'
  }
}
```

6. In `stepCombat`, before the shot loop (beside `const alive: Projectile[] = []`): `const impacts: CombatImpact[] = []`. The loop's two exits become:

```ts
    if (contact === null) {
      if (p.lifeS > 1e-12) alive.push(p)
      // Ruling R3: only ordnance expiries are recorded.
      else if (p.kind !== 'round') impacts.push({ tick, cause: p.kind, outcome: 'expired', surface: 'air', point: p.position })
      continue
    }
    // A bomb that has not armed is a dud: removed, and nothing takes anything
    // (spec §3.4). Nor is it an impact (E1 Ruling R2).
    if (p.kind === 'bomb' && store !== null && p.ageS < (store.armS ?? 0)) continue
    const point = add(p.previous, scale(sub(p.position, p.previous), contact.t))
    impacts.push({ tick, cause: p.kind, outcome: 'detonated', surface: contactSurface(contact, point, terrain, decks), point })
```

7. The return adds `impacts: appendImpacts(before.impacts, impacts)`.

`src/sim/mission/spawn.ts:50` spreads `parts.combat`, so it carries the ring with no edit. Confirm with `grep -rn "poolSaturated:" src` that `createCombat` is the only literal constructor.

- [ ] **Step 5: Run the new tests and the combat suites.**
Run: `npx vitest run tests/sim/weapons tests/sim/strike.test.ts tests/architecture/impactsRing.test.ts tests/sim/mission/spawn.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS, `rc=0`. A `toEqual` on a whole `CombatState` that now fails on `impacts` is a test that pinned the old shape: add `impacts` to its expectation, and name the file in the ledger.

- [ ] **Step 6: Bit-identity.** Run both probes again, as in Step 1.
Expected: the same seven hashes. `strike-armed` now prints an `impacts=[...]` list instead of `absent`. Copy that list into the ledger. It must contain `bomb/detonated/water` twice and at least one `rocket/…` entry. If a hash moved, the change touched a decision path. Diff `nearestContact` against Step 4.4 before anything else.

- [ ] **Step 7: Golden, soak and test cards.**
Run: `npx vitest run tests/sim/golden tests/sim/testcards tests/sim/soak.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS, `rc=0` (spec §7 Tier 1, first bullet).

- [ ] **Step 8: Typecheck, lint, depcruise.**
Run: `npx tsc --noEmit; echo rc=$?`, then `npx eslint src/sim tests/sim tests/architecture --max-warnings 0; echo rc=$?`, then `npm run depcruise; echo rc=$?`
Expected: `rc=0` each.

- [ ] **Step 9: Commit.**

```bash
git add src/sim/weapons/impacts.ts src/sim/weapons/combat.ts tests/sim/weapons/impacts.test.ts tests/architecture/impactsRing.test.ts
git commit -m "E1 Task 1: World.combat.impacts -- every detonation and ordnance expiry, bounded, bit-identical elsewhere"
```

---

### Task 2: Placeholder flipbook sheets through the KTX2 path (spec §6.4)

**Files:**
- Create: `src/render/fx/sheetManifest.ts`, `tools/fx/placeholders.ts`, `tools/fx/build.ts`
- Create (generated, committed): `content/fx/fx-light-a.ktx2`, `content/fx/fx-light-b.ktx2`, `content/fx/fx-motion.ktx2`, `content/fx/sheets.json`
- Modify: `package.json` (script), `ASSETS.md` (one row), `tests/build/dist.test.ts` (add `content/fx/sheets.json` to the boot-critical JSON list at `:131-141`)
- Test: `tests/tools/fxSheets.test.ts`

**Interfaces:**
- Produces (in `src/render/fx/sheetManifest.ts`, which must import nothing but `zod`):
  - `export const FX_SHEETS = ['fireball', 'smoke', 'dust', 'water-column', 'spray', 'flame'] as const` and `export type FxSheetName = (typeof FX_SHEETS)[number]`
  - `export const fxSheetManifestSchema` (zod) and `export type FxSheetManifest`
  - `export type FxSheetLayout = { readonly frames: number; readonly cols: number; readonly rows: number; readonly motionScale: number; readonly cellOf: Readonly<Record<FxSheetName, number>> }`
  - `export function sheetLayout(m: FxSheetManifest): FxSheetLayout`
  - `export const FX_CONTENT_BYTES_MAX = 10_000_000` (spec §6.3's gate, enforced from E1 on)
- Produces (in `tools/fx/placeholders.ts`): `export const PLACEHOLDER = { cellPx: 128, cols: 3, rows: 2, frames: 16, seed: 1944, motionScale: 0.02 } as const` and `export function placeholderLayer(image: 'lightA' | 'lightB' | 'motion', frame: number): Uint8Array`. The result is RGBA8, `cols·cellPx × rows·cellPx`, row 0 at the top.

**Layout (Ruling R7).** Each image is one KTX2 array. Layer *f* is frame *f*. Inside a layer, sheet `cell = i` sits at column `i % cols`, row `floor(i / cols)`, in `FX_SHEETS` order. The channels are §6.2's, verbatim: **light A** RGBA = right, left, top, alpha. **light B** RGBA = bottom, back, front, emission. **motion** RG = frame-to-frame motion, 0.5 = none. B = 0 and A = 1 are padding.

- [ ] **Step 1: Write the failing test** `tests/tools/fxSheets.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readKtx2Header } from '../../tools/textures/ktx2.js'
import { PLACEHOLDER, placeholderLayer } from '../../tools/fx/placeholders.js'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema, sheetLayout } from '../../src/render/fx/sheetManifest.js'

const root = new URL('../../', import.meta.url)
const dir = new URL('content/fx/', root)
const manifest = fxSheetManifestSchema.parse(JSON.parse(readFileSync(new URL('sheets.json', dir), 'utf8')))
// KHR Data Format constants (khr_df.h), as tests/tools/textures.test.ts uses them.
const MODEL_ETC1S = 163, MODEL_UASTC = 166, TF_LINEAR = 1

describe('placeholder fx sheets (effects design §6.4)', () => {
  it('the manifest names every sheet once, in FX_SHEETS order, in distinct atlas cells', () => {
    expect(manifest.sheets.map((s) => s.name)).toEqual([...FX_SHEETS])
    const cells = manifest.sheets.map((s) => s.cell)
    expect(new Set(cells).size).toBe(FX_SHEETS.length)
    expect(Math.max(...cells)).toBeLessThan(manifest.cols * manifest.rows)
    expect(manifest.provenance.generator).toBe('placeholder')
    expect(sheetLayout(manifest).cellOf.flame).toBe(manifest.sheets.find((s) => s.name === 'flame')!.cell)
  })

  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    it(`${image}: a Basis-encoded, linear, ${PLACEHOLDER.frames}-layer array of the atlas size (Rulings R7, R8)`, () => {
      const h = readKtx2Header(new Uint8Array(readFileSync(new URL(manifest.images[image], dir))))
      expect(h.layerCount).toBe(manifest.frames)
      expect(h.pixelWidth).toBe(manifest.cols * manifest.cellPx)
      expect(h.pixelHeight).toBe(manifest.rows * manifest.cellPx)
      expect([MODEL_ETC1S, MODEL_UASTC]).toContain(h.colorModel) // never the uncompressed path: KTX2Loader drops its layers
      expect(h.transferFunction).toBe(TF_LINEAR) // lightmaps and motion are data, not color
      expect(h.levelCount).toBeGreaterThan(1)
    })
  }

  it('the whole content/fx directory stays under the 10 MB gate (spec §6.3)', () => {
    const bytes = readdirSync(dir).reduce((sum, f) => sum + statSync(new URL(f, dir)).size, 0)
    expect(bytes).toBeLessThanOrEqual(FX_CONTENT_BYTES_MAX)
  })

  it('the generator is deterministic and fades every cell to transparent at its border', () => {
    const a = placeholderLayer('lightA', 5), b = placeholderLayer('lightA', 5)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    const w = PLACEHOLDER.cols * PLACEHOLDER.cellPx
    for (let cell = 0; cell < PLACEHOLDER.cols * PLACEHOLDER.rows; cell++) {
      const x0 = (cell % PLACEHOLDER.cols) * PLACEHOLDER.cellPx, y0 = Math.floor(cell / PLACEHOLDER.cols) * PLACEHOLDER.cellPx
      for (let i = 0; i < PLACEHOLDER.cellPx; i++) {
        // alpha is light A's 4th channel; every edge texel of every cell is 0,
        // so a mip never bleeds one sheet into its neighbor
        for (const [x, y] of [[x0 + i, y0], [x0 + i, y0 + PLACEHOLDER.cellPx - 1], [x0, y0 + i], [x0 + PLACEHOLDER.cellPx - 1, y0 + i]]) {
          expect(a[(y! * w + x!) * 4 + 3]).toBe(0)
        }
      }
    }
  })

  it('emission (light B alpha) is lit only in the fireball and flame cells', () => {
    const b = placeholderLayer('lightB', 0)
    const w = PLACEHOLDER.cols * PLACEHOLDER.cellPx
    const emissionIn = (name: (typeof FX_SHEETS)[number]): number => {
      const cell = FX_SHEETS.indexOf(name)
      const cx = (cell % PLACEHOLDER.cols) * PLACEHOLDER.cellPx + PLACEHOLDER.cellPx / 2
      const cy = Math.floor(cell / PLACEHOLDER.cols) * PLACEHOLDER.cellPx + PLACEHOLDER.cellPx / 2
      return b[(cy * w + cx) * 4 + 3]!
    }
    expect(emissionIn('fireball')).toBeGreaterThan(100)
    expect(emissionIn('flame')).toBeGreaterThan(100)
    for (const name of ['smoke', 'dust', 'water-column', 'spray'] as const) expect(emissionIn(name)).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `npx vitest run tests/tools/fxSheets.test.ts --maxWorkers=2; echo rc=$?`
Expected: FAIL, the modules do not exist. `rc=1`.

- [ ] **Step 3: Implement the manifest.** `src/render/fx/sheetManifest.ts`:

```ts
// Imported by tools/ under tsx (no Vite): must stay free of import.meta.env
// and of `three`. The runtime loader is src/render/fx/sheets.ts.
import { z } from 'zod'

/** The six flipbooks (effects design §6.1). Their order is the atlas cell
 *  order the build writes and every consumer indexes by. */
export const FX_SHEETS = ['fireball', 'smoke', 'dust', 'water-column', 'spray', 'flame'] as const
export type FxSheetName = (typeof FX_SHEETS)[number]

/** Spec §6.3: the whole of content/fx/. tests/tools/fxSheets.test.ts enforces
 *  it from E1 on, so E2's bake inherits a gate, not a promise. */
export const FX_CONTENT_BYTES_MAX = 10_000_000

export const fxSheetManifestSchema = z.object({
  version: z.literal(1),
  /** File names in content/fx/. One KTX2 array each; layer = frame (plan E1 Ruling R7). */
  images: z.object({ lightA: z.string().endsWith('.ktx2'), lightB: z.string().endsWith('.ktx2'), motion: z.string().endsWith('.ktx2') }),
  cellPx: z.number().int().positive(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  /** Layers per image. WebGPU's default maxTextureArrayLayers is 256. */
  frames: z.number().int().min(1).max(256),
  /** Cell-UV displacement per frame at a motion texel of 0 or 1 (0.5 = none). */
  motionScale: z.number().nonnegative(),
  sheets: z.array(z.object({ name: z.enum(FX_SHEETS), cell: z.number().int().nonnegative() })).length(FX_SHEETS.length),
  /** E2 fills the Blender fields (spec §6.1); the placeholder build records its seed. */
  provenance: z.object({
    generator: z.enum(['placeholder', 'blender']),
    seed: z.number().int(),
    blenderVersion: z.string().optional(),
    sceneSha256: z.string().optional(),
  }),
}).refine((m) => m.sheets.every((s, i) => s.name === FX_SHEETS[i]), 'sheets must be in FX_SHEETS order')
  .refine((m) => new Set(m.sheets.map((s) => s.cell)).size === m.sheets.length && m.sheets.every((s) => s.cell < m.cols * m.rows), 'cells must be distinct and inside the atlas')
export type FxSheetManifest = z.infer<typeof fxSheetManifestSchema>

export type FxSheetLayout = {
  readonly frames: number; readonly cols: number; readonly rows: number; readonly motionScale: number
  readonly cellOf: Readonly<Record<FxSheetName, number>>
}
export function sheetLayout(m: FxSheetManifest): FxSheetLayout {
  return {
    frames: m.frames, cols: m.cols, rows: m.rows, motionScale: m.motionScale,
    cellOf: Object.fromEntries(m.sheets.map((s) => [s.name, s.cell])) as Record<FxSheetName, number>,
  }
}
```

- [ ] **Step 4: Implement the generator.** `tools/fx/placeholders.ts`. It is deterministic integer-hash value noise (no `Math.random`) with one blob per cell. The blob's shape suggests its sheet: round for fireball/smoke/dust/spray, tall and bottom-heavy for water-column, a tongue for flame. The shape is asymmetric on purpose, so an upside-down sheet is visible in the Task 11 captures. The six directional channels come from the density gradient, so a sun on one side visibly lights that side:

```ts
import { FX_SHEETS, type FxSheetName } from '../../src/render/fx/sheetManifest.js'

/** Placeholder sheet parameters (effects design §6.4). E2 replaces the files
 *  and the manifest; nothing at runtime reads these constants. */
export const PLACEHOLDER = { cellPx: 128, cols: 3, rows: 2, frames: 16, seed: 1944, motionScale: 0.02 } as const

const hash = (x: number, y: number, z: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(PLACEHOLDER.seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const smooth = (t: number): number => t * t * (3 - 2 * t)
/** 2D value noise at `scale` cells per unit, one octave, layered by `z`. */
const noise = (u: number, v: number, scale: number, z: number): number => {
  const x = u * scale, y = v * scale, xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi)
  const a = hash(xi, yi, z), b = hash(xi + 1, yi, z), c = hash(xi, yi + 1, z), d = hash(xi + 1, yi + 1, z)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** Density in [0, 1] at cell coordinates u, v in [0, 1] (v = 0 at the TOP), frame t in [0, 1]. */
function density(sheet: FxSheetName, u: number, v: number, t: number, frame: number): number {
  const x = u - 0.5, yUp = 0.5 - v // +y is up in the picture
  const n = 0.65 + 0.35 * (0.6 * noise(u, v, 6, frame) + 0.4 * noise(u, v, 13, frame + 97))
  let r: number
  switch (sheet) {
    case 'water-column': r = Math.hypot(x / (0.12 + 0.18 * (yUp + 0.5)), (yUp + 0.05) / 0.42); break // narrow at the base, wide crown
    case 'flame': r = Math.hypot(x / (0.18 * (0.5 - yUp) + 0.04), (yUp + 0.1) / 0.36); break
    default: r = Math.hypot(x, yUp) / (0.22 + 0.16 * t)
  }
  // Zero by r = 1, and the growth keeps r = 1 inside a 0.42-radius disc, so
  // every cell's border texels are exactly 0 (fxSheets.test.ts).
  return Math.max(0, Math.min(1, (1 - r) * 2.2 * n)) * (Math.hypot(x, yUp) < 0.46 ? 1 : 0)
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const byte = (x: number): number => Math.round(clamp01(x) * 255)

export function placeholderLayer(image: 'lightA' | 'lightB' | 'motion', frame: number): Uint8Array {
  const { cellPx, cols, rows, frames } = PLACEHOLDER
  const w = cols * cellPx, h = rows * cellPx, out = new Uint8Array(w * h * 4)
  const t = frames === 1 ? 0 : frame / (frames - 1)
  for (const [cell, sheet] of FX_SHEETS.entries()) {
    const ox = (cell % cols) * cellPx, oy = Math.floor(cell / cols) * cellPx
    for (let py = 0; py < cellPx; py++) for (let px = 0; px < cellPx; px++) {
      const u = (px + 0.5) / cellPx, v = (py + 0.5) / cellPx, e = 1 / cellPx
      const d = density(sheet, u, v, t, frame)
      // Surface normal from the density gradient (x right, y up, z toward the viewer).
      const gx = density(sheet, u + e, v, t, frame) - density(sheet, u - e, v, t, frame)
      const gy = density(sheet, u, v - e, t, frame) - density(sheet, u, v + e, t, frame)
      const len = Math.hypot(gx * 40, gy * 40, 1)
      const n = { x: -gx * 40 / len, y: -gy * 40 / len, z: 1 / len }
      const lit = (dot: number): number => d > 0 ? 0.25 + 0.75 * clamp01(dot) : 0
      const i = ((oy + py) * w + ox + px) * 4
      if (image === 'lightA') { out[i] = byte(lit(n.x)); out[i + 1] = byte(lit(-n.x)); out[i + 2] = byte(lit(n.y)); out[i + 3] = byte(d) }
      else if (image === 'lightB') {
        const hot = sheet === 'fireball' ? d * d * (1 - 0.8 * t) : sheet === 'flame' ? Math.pow(d, 1.5) : 0
        out[i] = byte(lit(-n.y)); out[i + 1] = byte(lit(-n.z) * 0.6); out[i + 2] = byte(lit(n.z)); out[i + 3] = byte(hot)
      } else {
        // Placeholder motion: outward radial drift, strongest mid-blob.
        const mx = (u - 0.5) * d * 0.8, my = (v - 0.5) * d * 0.8
        out[i] = byte(0.5 + mx); out[i + 1] = byte(0.5 + my); out[i + 2] = 0; out[i + 3] = 255
      }
    }
  }
  return out
}
```

- [ ] **Step 5: Implement the build.** `tools/fx/build.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema } from '../../src/render/fx/sheetManifest.js'
import { readKtx2Header } from '../textures/ktx2.js'
import { ktxBinary } from '../textures/ktxTool.js'
import { PLACEHOLDER, placeholderLayer } from './placeholders.js'

const OUT = fileURLToPath(new URL('../../content/fx/', import.meta.url))
const CACHE = fileURLToPath(new URL('./cache/', import.meta.url)) // gitignored by /tools/**/cache/
const FILES = { lightA: 'fx-light-a.ktx2', lightB: 'fx-light-b.ktx2', motion: 'fx-motion.ktx2' } as const

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true })
  const ktx = await ktxBinary()
  const { cellPx, cols, rows, frames } = PLACEHOLDER
  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    const pngs: string[] = []
    for (let f = 0; f < frames; f++) {
      const png = join(CACHE, `${image}-${String(f).padStart(2, '0')}.png`)
      await sharp(Buffer.from(placeholderLayer(image, f)), { raw: { width: cols * cellPx, height: rows * cellPx, channels: 4 } }).png().toFile(png)
      pngs.push(png)
    }
    // Ruling R8: Basis (ETC1S) and linear. --levels 5 stops at 8 px per cell.
    execFileSync(ktx, ['create', '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '128',
      '--generate-mipmap', '--levels', '5', '--layers', String(frames), ...pngs, join(OUT, FILES[image])], { stdio: 'inherit' })
    const h = readKtx2Header(new Uint8Array(readFileSync(join(OUT, FILES[image]))))
    if (h.layerCount !== frames) throw new Error(`${FILES[image]}: ${h.layerCount} layers, expected ${frames}`)
  }
  const manifest = fxSheetManifestSchema.parse({
    version: 1, images: FILES, cellPx, cols, rows, frames, motionScale: PLACEHOLDER.motionScale,
    sheets: FX_SHEETS.map((name, cell) => ({ name, cell })),
    provenance: { generator: 'placeholder', seed: PLACEHOLDER.seed },
  })
  writeFileSync(join(OUT, 'sheets.json'), JSON.stringify(manifest, null, 2) + '\n')
  const bytes = readdirSync(OUT).reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0)
  console.log(`content/fx: ${bytes} bytes`)
  if (bytes > FX_CONTENT_BYTES_MAX) throw new Error(`content/fx is ${bytes} bytes, over the ${FX_CONTENT_BYTES_MAX} gate (spec §6.3)`)
}

await main()
```

Add to `package.json` scripts: `"fx:placeholders": "tsx tools/fx/build.ts"`.

- [ ] **Step 6: Build and look.**
Run: `npm run fx:placeholders; echo rc=$?`
Expected: `rc=0` and a byte count. Record the three file sizes and the total in the ledger. If `ktx create` rejects `--levels` together with `--generate-mipmap`, drop `--levels 5`. The border-zero guarantee still keeps the mips from bleeding, so say so in the ledger. Then look at one layer: open `tools/fx/cache/lightA-08.png` with the Read tool. Expected: six blobs in a 3×2 grid, a tall column bottom-center-left, a flame tongue bottom-right.

- [ ] **Step 7: Provenance and the dist list.** Add to `ASSETS.md`'s table, after the terrain texture rows:

`| \`content/fx/fx-light-a.ktx2\`, \`fx-light-b.ktx2\`, \`fx-motion.ktx2\`, \`sheets.json\` (placeholder flipbooks, built by \`tools/fx/build.ts\`) | generated in code from seeded noise, no source material | authored for this project | AGPL-3.0-or-later |`

In `tests/build/dist.test.ts`, add `'content/fx/sheets.json'` to the list at `:131-141`. The effects boot from it.

- [ ] **Step 8: Run the tests.**
Run: `npx vitest run tests/tools/fxSheets.test.ts tests/tools/textures.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS, `rc=0`. Do not run `dist.test.ts` on nexus: it builds twice. It runs in the Task 13 `remote-run`.

- [ ] **Step 9: Typecheck and lint.**
Run: `npx tsc --noEmit; echo rc=$?` and `npx eslint src/render/fx tools/fx tests/tools --max-warnings 0; echo rc=$?` → `rc=0` each.

- [ ] **Step 10: Commit.**

```bash
git add src/render/fx/sheetManifest.ts tools/fx/placeholders.ts tools/fx/build.ts content/fx package.json ASSETS.md tests/tools/fxSheets.test.ts tests/build/dist.test.ts
git commit -m "E1 Task 2: placeholder fx flipbooks -- three KTX2 arrays in the §6.2 layout, 3x2 atlas per frame layer, 10 MB gate"
```

---
### Task 3: The recipe catalog (`fx/catalog.ts`, spec §3.3)

**Files:**
- Create: `src/render/fx/catalog.ts`
- Test: `tests/render/fxCatalog.test.ts`

**Interfaces:**
- Consumes: `FX_SHEETS`, `FxSheetName` (Task 2).
- Produces:
  - `export const RECIPE_IDS = ['bomb.land', 'bomb.water', 'rocket.land', 'rocket.water', 'round.land', 'round.water', 'round.deck', 'round.structure', 'round.ship', 'round.aircraft', 'crash.land', 'crash.water', 'crash.deck', 'kill.air', 'engine.smoke', 'ship.fire', 'structure.collapse'] as const` and `export type RecipeId = (typeof RECIPE_IDS)[number]`
  - `export const SUSTAINED_RECIPES: readonly RecipeId[] = ['engine.smoke', 'ship.fire', 'kill.air', 'structure.collapse']`
  - `export type FxEmitter = z.output<typeof emitterSchema>` with fields `mode: 'burst' | 'stream'`, `sheet: FxSheetName | 'streak'`, `count?`, `ratePerS?`, `delayS`, `durationS?`, `lifeS: [number, number]`, `speedMps: [number, number]`, `direction: 'up' | 'sphere' | 'ring'`, `spreadDeg`, `radiusM`, `sizeM: [number, number]`, `alpha`, `tint: [number, number, number]`, `emissive`, `dragPerS`, `accelYMps2`, `inheritVelocity`, `spinRadPerS`, `seaKill`, `frameRateHz?`, `streakS?`
  - `export type FxRecipe = { readonly emitters: readonly FxEmitter[]; readonly source: string }`, `export type FxCatalog = Readonly<Record<RecipeId, FxRecipe>>`
  - `export const fxCatalogSchema`, `export const FX_CATALOG: FxCatalog`

**Emitter semantics (read by Task 5; state them in the file's doc comment):**
- `burst`: `count` particles, spawned when the recipe is **triggered**.
- `stream` **with** `durationS`: a *timed stream*. A trigger starts it at the trigger point: `ratePerS` for `durationS` seconds, after `delayS`. This is a bomb's smoke column.
- `stream` **without** `durationS`: a *sustained stream*. It runs only while a state-driven emitter of that recipe is active (Task 4's `FxSustained`), at `ratePerS × intensity`, from the emitter's current position. This is engine smoke, ship fire, the kill trail and the collapse column.
- `direction`: `up` is a cone of `spreadDeg` around +Y, `sphere` is uniform (spread ignored), `ring` is a random azimuth at an elevation in `[0, spreadDeg]`.
- `accelYMps2`: + buoyancy, − gravity (−9.81 for spray and debris). `seaKill` removes a particle that falls below sea level (spec §5.1: "removed at sea level").
- `sizeM`: diameter at birth and at death. `tint`: linear albedo (or the spark color for `emissive > 0`). `emissive`: multiplier on the sheet's emission channel, or on a streak's tint.
- `frameRateHz`: loop the flipbook at this rate. Absent means one pass over the particle's life.

- [ ] **Step 1: Write the failing test** `tests/render/fxCatalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FX_CATALOG, fxCatalogSchema, RECIPE_IDS, SUSTAINED_RECIPES, type FxCatalog } from '../../src/render/fx/catalog.js'
import { FX_SHEETS } from '../../src/render/fx/sheetManifest.js'

describe('fx catalog (effects design §3.3)', () => {
  it('validates, and defines every recipe id', () => {
    expect(() => fxCatalogSchema.parse(FX_CATALOG)).not.toThrow()
    expect(Object.keys(FX_CATALOG).sort()).toEqual([...RECIPE_IDS].sort())
  })

  it('every emitter names an existing sheet, or the code-drawn streak', () => {
    for (const id of RECIPE_IDS) for (const e of FX_CATALOG[id].emitters) {
      expect([...FX_SHEETS, 'streak'], `${id}`).toContain(e.sheet)
    }
  })

  it('every recipe cites a source or says it is an estimate', () => {
    for (const id of RECIPE_IDS) expect(FX_CATALOG[id].source, id).toMatch(/\S/)
  })

  it('a sustained recipe has a sustained stream; a trigger-only recipe has none that could never run', () => {
    for (const id of RECIPE_IDS) {
      const sustained = FX_CATALOG[id].emitters.filter((e) => e.mode === 'stream' && e.durationS === undefined)
      if ((SUSTAINED_RECIPES as readonly string[]).includes(id)) expect(sustained.length, id).toBeGreaterThan(0)
      else expect(sustained, id).toEqual([])
    }
  })

  it('rejects the shapes a typo produces', () => {
    const bad = (patch: object): FxCatalog => ({ ...FX_CATALOG, 'round.land': { ...FX_CATALOG['round.land'], emitters: [{ ...FX_CATALOG['round.land'].emitters[0]!, ...patch }] } })
    expect(() => fxCatalogSchema.parse(bad({ mode: 'burst', count: undefined }))).toThrow()
    expect(() => fxCatalogSchema.parse(bad({ sheet: 'fire' }))).toThrow()
    expect(() => fxCatalogSchema.parse(bad({ lifeS: [2, 1] }))).toThrow()
    expect(() => fxCatalogSchema.parse(bad({ sheet: 'streak', streakS: undefined }))).toThrow()
    const { ['kill.air']: _dropped, ...missing } = FX_CATALOG
    expect(() => fxCatalogSchema.parse(missing)).toThrow()
  })

  it('a rocket effect is a smaller version of the bomb one (spec §3.3)', () => {
    const peak = (id: 'bomb.land' | 'rocket.land' | 'bomb.water' | 'rocket.water'): number => Math.max(...FX_CATALOG[id].emitters.map((e) => e.sizeM[1]))
    expect(peak('rocket.land')).toBeLessThan(peak('bomb.land'))
    expect(peak('rocket.water')).toBeLessThan(peak('bomb.water'))
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `npx vitest run tests/render/fxCatalog.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: Implement** `src/render/fx/catalog.ts`:

```ts
import { z } from 'zod'
import { FX_SHEETS } from './sheetManifest.js'

/**
 * Effect recipes (ordnance-and-effects design §3.3). A recipe is a list of
 * emitters; `system.ts` runs them. Semantics, exactly:
 * - `burst`: `count` particles when the recipe is TRIGGERED.
 * - `stream` with `durationS`: a timed stream a trigger starts at its point.
 * - `stream` without `durationS`: a sustained stream, run only while a
 *   state-driven emitter of this recipe is active (`events.ts`'s
 *   `FxSustained`), at `ratePerS * intensity`, from that emitter's position.
 * Sizes and durations are estimates unless `source` cites a figure (spec
 * §3.3); E2 and E3 replace them with the baked sheets' own tuning and the
 * NHHC/NARA photographs (spec §5.1). E2 touches this file's NUMBERS only.
 */
export const RECIPE_IDS = [
  'bomb.land', 'bomb.water', 'rocket.land', 'rocket.water',
  'round.land', 'round.water', 'round.deck', 'round.structure', 'round.ship', 'round.aircraft',
  'crash.land', 'crash.water', 'crash.deck',
  'kill.air', 'engine.smoke', 'ship.fire', 'structure.collapse',
] as const
export type RecipeId = (typeof RECIPE_IDS)[number]
/** Recipes `events.ts` drives as state-driven emitters (they carry a sustained stream). */
export const SUSTAINED_RECIPES: readonly RecipeId[] = ['engine.smoke', 'ship.fire', 'kill.air', 'structure.collapse']

const range = z.tuple([z.number().nonnegative(), z.number().nonnegative()]).refine(([a, b]) => a <= b, 'range must be [min, max]')
const emitterSchema = z.object({
  mode: z.enum(['burst', 'stream']),
  sheet: z.enum([...FX_SHEETS, 'streak']),
  count: z.number().int().positive().optional(),
  ratePerS: z.number().positive().optional(),
  delayS: z.number().nonnegative().default(0),
  durationS: z.number().positive().optional(),
  lifeS: range,
  speedMps: range,
  direction: z.enum(['up', 'sphere', 'ring']),
  spreadDeg: z.number().min(0).max(180),
  radiusM: z.number().nonnegative().default(0),
  sizeM: z.tuple([z.number().positive(), z.number().positive()]),
  alpha: z.number().min(0).max(1),
  tint: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
  emissive: z.number().nonnegative().default(0),
  dragPerS: z.number().nonnegative(),
  accelYMps2: z.number(),
  inheritVelocity: z.number().min(0).max(1).default(0),
  spinRadPerS: z.number().nonnegative().default(0.2),
  seaKill: z.boolean().default(false),
  frameRateHz: z.number().positive().optional(),
  streakS: z.number().positive().optional(),
})
  .refine((e) => e.mode !== 'burst' || (e.count !== undefined && e.ratePerS === undefined && e.durationS === undefined), 'a burst has a count and nothing else')
  .refine((e) => e.mode !== 'stream' || (e.ratePerS !== undefined && e.count === undefined), 'a stream has a rate')
  .refine((e) => e.sheet !== 'streak' || e.streakS !== undefined, 'a streak needs streakS')
export type FxEmitter = z.output<typeof emitterSchema>
const recipeSchema = z.object({ emitters: z.array(emitterSchema).min(1), source: z.string().min(1) })
export type FxRecipe = z.output<typeof recipeSchema>
export type FxCatalog = Readonly<Record<RecipeId, FxRecipe>>
export const fxCatalogSchema = z.record(z.enum(RECIPE_IDS), recipeSchema)
  .refine((c) => RECIPE_IDS.every((id) => id in c), 'every recipe id must be defined')

type RawEmitter = z.input<typeof emitterSchema>
const ESTIMATE = 'estimate (E1 placeholder tuning; E2/E3 replace with cited figures, design §3.3, §5.1)'
const DIRT: [number, number, number] = [0.3, 0.25, 0.19]
const DUST: [number, number, number] = [0.45, 0.39, 0.31]
const SMOKE: [number, number, number] = [0.1, 0.1, 0.11]
const WATER: [number, number, number] = [0.85, 0.88, 0.9]
const SPARK: [number, number, number] = [1, 0.72, 0.38]
const GRAVITY = -9.81

/** Spec §3.3: "smaller versions of the above". Size and speed scale by `k`,
 *  counts and rates by `k` too, floored at one particle. */
const smaller = (emitters: readonly RawEmitter[], k: number): RawEmitter[] => emitters.map((e) => ({
  ...e,
  sizeM: [e.sizeM[0] * k, e.sizeM[1] * k],
  speedMps: [e.speedMps[0] * k, e.speedMps[1] * k],
  ...(e.count !== undefined ? { count: Math.max(1, Math.round(e.count * k)) } : {}),
  ...(e.ratePerS !== undefined ? { ratePerS: e.ratePerS * k } : {}),
  ...(e.durationS !== undefined ? { durationS: e.durationS * k } : {}),
}))

const fireball = (count: number, size: [number, number], life: [number, number]): RawEmitter =>
  ({ mode: 'burst', sheet: 'fireball', count, lifeS: life, speedMps: [3, 10], direction: 'sphere', spreadDeg: 180, radiusM: size[0] * 0.3, sizeM: size, alpha: 1, tint: [1, 1, 1], emissive: 1, dragPerS: 1.5, accelYMps2: 3 })
const ejecta = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'streak', count, lifeS: [1.5, 3], speedMps: [25, 60], direction: 'up', spreadDeg: 50, sizeM: [0.6, 0.4], alpha: 1, tint: DIRT, dragPerS: 0.3, accelYMps2: GRAVITY, streakS: 0.06 })
const column = (rate: number, durationS: number, size: [number, number]): RawEmitter =>
  ({ mode: 'stream', sheet: 'smoke', ratePerS: rate, delayS: 0.5, durationS, lifeS: [8, 12], speedMps: [4, 8], direction: 'up', spreadDeg: 15, sizeM: size, alpha: 0.6, tint: SMOKE, dragPerS: 0.4, accelYMps2: 1.5 })
const waterColumn = (count: number, size: [number, number]): RawEmitter =>
  ({ mode: 'burst', sheet: 'water-column', count, lifeS: [2.5, 3.5], speedMps: [30, 45], direction: 'up', spreadDeg: 8, sizeM: size, alpha: 0.9, tint: WATER, dragPerS: 0.8, accelYMps2: GRAVITY, seaKill: true })
const crown = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'spray', count, lifeS: [2, 3], speedMps: [20, 35], direction: 'up', spreadDeg: 35, sizeM: [4, 12], alpha: 0.8, tint: WATER, dragPerS: 0.6, accelYMps2: GRAVITY, seaKill: true })
const surge = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'spray', count, lifeS: [3, 5], speedMps: [18, 28], direction: 'ring', spreadDeg: 5, sizeM: [6, 20], alpha: 0.5, tint: WATER, dragPerS: 1.2, accelYMps2: 0 })
const sparks = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'streak', count, lifeS: [0.12, 0.25], speedMps: [15, 30], direction: 'up', spreadDeg: 80, sizeM: [0.15, 0.1], alpha: 1, tint: SPARK, emissive: 3, dragPerS: 2, accelYMps2: GRAVITY, streakS: 0.03 })

const BOMB_LAND: RawEmitter[] = [
  fireball(6, [14, 30], [1.2, 1.8]),
  ejecta(40),
  { mode: 'burst', sheet: 'dust', count: 16, lifeS: [3, 5], speedMps: [15, 25], direction: 'ring', spreadDeg: 10, sizeM: [8, 22], alpha: 0.7, tint: DUST, dragPerS: 1.2, accelYMps2: 0.3 },
  column(6, 18, [10, 35]),
]
const BOMB_WATER: RawEmitter[] = [waterColumn(5, [8, 20]), crown(24), surge(16)]

const RAW: Record<RecipeId, { emitters: RawEmitter[]; source: string }> = {
  'bomb.land': { emitters: BOMB_LAND, source: ESTIMATE },
  'bomb.water': { emitters: BOMB_WATER, source: ESTIMATE },
  'rocket.land': { emitters: smaller(BOMB_LAND, 0.45), source: ESTIMATE },
  'rocket.water': { emitters: smaller(BOMB_WATER, 0.45), source: ESTIMATE },
  'round.land': { emitters: [{ mode: 'burst', sheet: 'dust', count: 2, lifeS: [0.8, 1.2], speedMps: [2, 5], direction: 'up', spreadDeg: 30, sizeM: [0.8, 2.5], alpha: 0.6, tint: DUST, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  'round.water': { emitters: [{ mode: 'burst', sheet: 'spray', count: 2, lifeS: [0.6, 0.9], speedMps: [6, 10], direction: 'up', spreadDeg: 10, sizeM: [0.5, 1.6], alpha: 0.8, tint: WATER, dragPerS: 0.5, accelYMps2: GRAVITY, seaKill: true }], source: ESTIMATE },
  'round.deck': { emitters: [sparks(4), { mode: 'burst', sheet: 'dust', count: 1, lifeS: [0.6, 0.9], speedMps: [1, 3], direction: 'up', spreadDeg: 40, sizeM: [0.5, 1.5], alpha: 0.5, tint: DUST, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  'round.structure': { emitters: [sparks(4), { mode: 'burst', sheet: 'dust', count: 1, lifeS: [0.6, 0.9], speedMps: [1, 3], direction: 'up', spreadDeg: 40, sizeM: [0.5, 1.5], alpha: 0.5, tint: DUST, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  'round.ship': { emitters: [sparks(4), { mode: 'burst', sheet: 'smoke', count: 1, lifeS: [0.6, 0.9], speedMps: [1, 3], direction: 'up', spreadDeg: 40, sizeM: [0.5, 1.5], alpha: 0.4, tint: SMOKE, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  // Ruling R4: today's hitFlash 'hit' (2.5 m, 0.25 s, hitFlash.ts flashAppearance).
  'round.aircraft': { emitters: [sparks(3), { ...fireball(1, [1, 2.5], [0.2, 0.3]), radiusM: 0 }], source: 'hitFlash.ts flashAppearance(\'hit\'): 2.5 m, 0.25 s (estimate, Plan 6)' },
  'crash.land': { emitters: [fireball(8, [18, 40], [1.4, 2]), ejecta(50), column(8, 30, [12, 40])], source: ESTIMATE },
  'crash.water': { emitters: [waterColumn(6, [10, 26]), crown(30), surge(20)], source: ESTIMATE },
  'crash.deck': { emitters: [fireball(6, [12, 28], [1.2, 1.8]), sparks(20), column(6, 20, [8, 26])], source: ESTIMATE },
  // Ruling R6: fireball on the kill edge; the trail is sustained at the (frozen) wreck.
  'kill.air': { emitters: [fireball(6, [10, 26], [1.2, 1.6]), sparks(16),
    { mode: 'stream', sheet: 'smoke', ratePerS: 10, lifeS: [4, 7], speedMps: [1, 3], direction: 'sphere', spreadDeg: 180, sizeM: [3, 14], alpha: 0.7, tint: SMOKE, dragPerS: 0.6, accelYMps2: 0.8 }], source: ESTIMATE },
  // Today's smoke.ts: dark (0x23262b), opacity 0.25..0.8 with damage.
  'engine.smoke': { emitters: [{ mode: 'stream', sheet: 'smoke', ratePerS: 14, lifeS: [2, 3.5], speedMps: [0.5, 2], direction: 'sphere', spreadDeg: 180, sizeM: [1.2, 6], alpha: 0.6, tint: [0.14, 0.15, 0.17], dragPerS: 1.5, accelYMps2: 0.5, inheritVelocity: 0.15 }], source: 'smoke.ts smokeAppearance (estimate, Plan 6)' },
  'ship.fire': { emitters: [
    { mode: 'stream', sheet: 'flame', ratePerS: 20, lifeS: [0.8, 1.2], speedMps: [1, 3], direction: 'up', spreadDeg: 20, radiusM: 3, sizeM: [4, 6], alpha: 0.9, tint: [1, 1, 1], emissive: 1, dragPerS: 1, accelYMps2: 2, frameRateHz: 12 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 8, lifeS: [10, 14], speedMps: [3, 6], direction: 'up', spreadDeg: 12, radiusM: 3, sizeM: [8, 40], alpha: 0.65, tint: SMOKE, dragPerS: 0.3, accelYMps2: 1.2 },
  ], source: ESTIMATE },
  // Strike design §4: "a 60 s fading smoke column" (events.ts COLLAPSE_SMOKE_S).
  'structure.collapse': { emitters: [
    { mode: 'burst', sheet: 'dust', count: 24, lifeS: [3, 6], speedMps: [6, 14], direction: 'ring', spreadDeg: 25, radiusM: 6, sizeM: [6, 20], alpha: 0.75, tint: DUST, dragPerS: 1, accelYMps2: 0.3 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 5, lifeS: [10, 14], speedMps: [2, 5], direction: 'up', spreadDeg: 15, radiusM: 4, sizeM: [6, 30], alpha: 0.55, tint: SMOKE, dragPerS: 0.3, accelYMps2: 1.2 },
  ], source: 'strike design §4 (60 s column); sizes estimate' },
}

export const FX_CATALOG: FxCatalog = fxCatalogSchema.parse(RAW) as FxCatalog
```

- [ ] **Step 4: Run the test.**
Run: `npx vitest run tests/render/fxCatalog.test.ts --maxWorkers=2; echo rc=$?` → PASS, `rc=0`.

- [ ] **Step 5: Typecheck and lint.** `npx tsc --noEmit; echo rc=$?` and `npx eslint src/render/fx tests/render/fxCatalog.test.ts --max-warnings 0; echo rc=$?` → `rc=0` each.

- [ ] **Step 6: Commit.**

```bash
git add src/render/fx/catalog.ts tests/render/fxCatalog.test.ts
git commit -m "E1 Task 3: fx recipe catalog, zod-validated, every recipe on an existing sheet"
```

---

### Task 4: Sim state to effect events (`fx/events.ts`, spec §3.2)

**Files:**
- Create: `src/render/fx/events.ts`
- Test: `tests/render/fxEvents.test.ts`

**Interfaces:**
- Consumes: `CombatState` + `CombatImpact` (Task 1), `RecipeId` (Task 3), `Impact` (`src/sim/loop.ts:201`), `RenderState` (`src/sim/interpolate.ts:8`), `ContactSurface` (`src/sim/contact.ts:10`).
- Produces:
  - `export type FxTrigger = { readonly recipe: RecipeId; readonly position: Vec3; readonly velocity: Vec3 }`
  - `export type FxSustained = { readonly key: string; readonly recipe: RecipeId; readonly intensity: number; readonly position: Vec3; readonly velocity: Vec3 }`
  - `export type FxMemory = { readonly lastTick: number; readonly lastImpactTick: number; readonly seenCrashTick: Readonly<Record<string, number>>; readonly seenKillTick: Readonly<Record<string, number>>; readonly seenCollapseTick: Readonly<Record<string, number>> }`
  - `export const NO_FX_MEMORY: FxMemory`
  - `export type FxWorldView = { readonly tick: number; readonly combat: Pick<CombatState, 'impacts' | 'aircraft' | 'ships' | 'structures'>; readonly aircraft: readonly { readonly id: string; readonly impact: Impact | null; readonly state: { readonly velocity: Vec3 } }[]; readonly poses: readonly RenderState[]; readonly shipSmokeOrigins: ReadonlyMap<string, Vec3>; readonly structureAnchors: ReadonlyMap<string, Vec3> }`
  - `export function nextFxEvents(prev: FxMemory, w: FxWorldView): { readonly memory: FxMemory; readonly triggers: readonly FxTrigger[]; readonly sustained: readonly FxSustained[] }`
  - `export function impactRecipe(i: Pick<CombatImpact, 'cause' | 'outcome' | 'surface'>): RecipeId | null`, `export function crashRecipe(s: ContactSurface): RecipeId`
  - constants `KILL_TRAIL_S = 20`, `COLLAPSE_SMOKE_S = 60`, `ENGINE_SMOKE_OFFSET_BODY: Vec3 = v3(3.2, 0.7, 0)`

**The rules, all in one place:**
- **Restart (hitFlash.ts's rule, `hitFlash.ts:36-38`):** `w.tick < prev.lastTick` means a new flight. Every memory starts from `NO_FX_MEMORY`.
- **Impacts:** every ring entry with `tick > lastImpactTick` is new, in ring order. That holds however many ticks the frame spanned: the ring keeps them all (Task 1). `'expired'` maps to no recipe (R1). `lastImpactTick` becomes the newest entry's tick.
- **Crash (R5):** for each aircraft with `impact !== null` and `seenCrashTick[id] !== impact.tick`, trigger `crash.<surface>` at `impact.position`.
- **Kill:** for each aircraft whose record has `damage.destroyedAt !== null` and `seenKillTick[id] !== destroyedAt`, trigger `kill.air` at its pose, zero velocity (the wreck is frozen, R6).
- **Collapse:** for each structure with `destroyedTick !== null` and `seenCollapseTick[id] !== destroyedTick` and an anchor, trigger `structure.collapse` at the anchor.
- **Sustained, recomputed from state every frame (no memory):**
  - `engine:<id>`: not destroyed, `impact === null`, `damage.engine < 1`. Intensity is `1 − clamp01(engine)`, at pose + `qRotate(pose.attitude, ENGINE_SMOKE_OFFSET_BODY)`, with velocity `state.velocity`.
  - `kill:<id>`: destroyed, `impact === null`, age `(tick − destroyedAt)·DT < KILL_TRAIL_S`. Intensity is `1 − age / KILL_TRAIL_S`, at the pose.
  - `ship:<id>`: `fire > 0`, `sinkingFraction < 1`, and a smoke origin exists. Intensity is `min(1, fire)`.
  - `structure:<id>`: destroyed, age `< COLLAPSE_SMOKE_S`, and an anchor exists. Intensity is `1 − age / COLLAPSE_SMOKE_S`.

- [ ] **Step 1: Write the failing test** `tests/render/fxEvents.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { v3, ZERO, type Vec3 } from '../../src/sim/math/vec3.js'
import { createCombat, type CombatState } from '../../src/sim/weapons/combat.js'
import type { CombatImpact } from '../../src/sim/weapons/impacts.js'
import type { Impact } from '../../src/sim/loop.js'
import {
  COLLAPSE_SMOKE_S, crashRecipe, impactRecipe, KILL_TRAIL_S, NO_FX_MEMORY, nextFxEvents,
  type FxMemory, type FxWorldView,
} from '../../src/render/fx/events.js'

const spec = loadAircraftSpec('f6f-hellcat')
const craft = (id: string, position: Vec3) => {
  const state = createState({ position, velocity: v3(100, 0, 0) })
  return { id, spec, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, impact: null as Impact | null }
}
const base = (): { combat: CombatState; aircraft: ReturnType<typeof craft>[] } => {
  const aircraft = [craft('a', v3(0, 1000, 0)), craft('b', v3(500, 1000, 0))]
  return { aircraft, combat: createCombat(aircraft, {}, [{ id: 'maru', hullHp: 100 }], [{ id: 'hangar', hp: 50 }]) }
}
const view = (tick: number, combat: CombatState, aircraft: ReturnType<typeof craft>[], extra: Partial<FxWorldView> = {}): FxWorldView => ({
  tick, combat, aircraft,
  poses: aircraft.map((a) => ({ position: a.state.position, attitude: qIdentity() })),
  shipSmokeOrigins: new Map([['maru', v3(9000, 20, 0)]]),
  structureAnchors: new Map([['hangar', v3(-500, 12, 40)]]),
  ...extra,
})
const hit = (tick: number, over: Partial<CombatImpact> = {}): CombatImpact =>
  ({ tick, cause: 'bomb', outcome: 'detonated', surface: 'land', point: v3(tick, 0, 0), ...over })
const withImpacts = (c: CombatState, impacts: CombatImpact[]): CombatState => ({ ...c, impacts })

describe('fx events (effects design §3.2)', () => {
  it('maps every impact to its recipe; expiries to nothing (Rulings R1, R4)', () => {
    expect(impactRecipe({ cause: 'bomb', outcome: 'detonated', surface: 'water' })).toBe('bomb.water')
    expect(impactRecipe({ cause: 'bomb', outcome: 'detonated', surface: 'ship' })).toBe('bomb.land')
    expect(impactRecipe({ cause: 'rocket', outcome: 'detonated', surface: 'deck' })).toBe('rocket.land')
    expect(impactRecipe({ cause: 'round', outcome: 'detonated', surface: 'aircraft' })).toBe('round.aircraft')
    expect(impactRecipe({ cause: 'round', outcome: 'detonated', surface: 'structure' })).toBe('round.structure')
    expect(impactRecipe({ cause: 'rocket', outcome: 'expired', surface: 'air' })).toBeNull()
    expect(crashRecipe('deck')).toBe('crash.deck')
  })

  it('emits each new impact once, and none twice across frames', () => {
    const { combat, aircraft } = base()
    const c1 = withImpacts(combat, [hit(3)])
    const f1 = nextFxEvents(NO_FX_MEMORY, view(3, c1, aircraft))
    expect(f1.triggers.map((t) => t.recipe)).toEqual(['bomb.land'])
    const f2 = nextFxEvents(f1.memory, view(4, c1, aircraft))
    expect(f2.triggers).toEqual([])
  })

  it('loses no trigger when one frame spans several ticks (MAX_STEPS_PER_FRAME)', () => {
    const { combat, aircraft } = base()
    let memory: FxMemory = nextFxEvents(NO_FX_MEMORY, view(10, withImpacts(combat, [hit(10)]), aircraft)).memory
    const five = [hit(10), hit(11), hit(12, { surface: 'water' }), hit(13, { cause: 'round' }), hit(13, { cause: 'round', surface: 'water' }), hit(15)]
    const f = nextFxEvents(memory, view(15, withImpacts(combat, five), aircraft))
    expect(f.triggers.map((t) => t.recipe)).toEqual(['bomb.land', 'bomb.water', 'round.land', 'round.water', 'bomb.land'])
    expect(f.triggers[0]!.position).toEqual(v3(11, 0, 0))
    memory = f.memory
    expect(memory.lastImpactTick).toBe(15)
  })

  it('a tick moving backwards is a new flight: old edges are forgotten, the fresh ring is read from the start', () => {
    const { combat, aircraft } = base()
    const late = nextFxEvents(NO_FX_MEMORY, view(900, withImpacts(combat, [hit(900)]), aircraft)).memory
    // Restart: the NEW world's ring holds only its own entries, at small ticks.
    const f = nextFxEvents(late, view(2, withImpacts(combat, [hit(1), hit(2)]), aircraft))
    expect(f.triggers).toHaveLength(2)
    expect(f.memory.lastTick).toBe(2)
    // And the restarted frame with an EMPTY ring triggers nothing.
    expect(nextFxEvents(late, view(1, combat, aircraft)).triggers).toEqual([])
  })

  it('fires a crash per aircraft, once, on its own surface (Ruling R5)', () => {
    const { combat, aircraft } = base()
    const impact: Impact = { tick: 40, position: v3(1, 2, 3), verticalSpeedMps: -30, groundHeightM: 0, surface: 'water', kind: 'ditched' }
    const crashed = [aircraft[0]!, { ...aircraft[1]!, impact }]
    const f1 = nextFxEvents(NO_FX_MEMORY, view(40, combat, crashed))
    expect(f1.triggers).toEqual([{ recipe: 'crash.water', position: v3(1, 2, 3), velocity: ZERO }])
    expect(nextFxEvents(f1.memory, view(41, combat, crashed)).triggers).toEqual([])
  })

  it('fires kill.air on the destroyedAt edge, then a fading trail for KILL_TRAIL_S (Ruling R6)', () => {
    const { combat, aircraft } = base()
    const rec = combat.aircraft['b']!
    const killed: CombatState = { ...combat, aircraft: { ...combat.aircraft, b: { ...rec, damage: { ...rec.damage, destroyedAt: 100 } } } }
    const f1 = nextFxEvents(NO_FX_MEMORY, view(100, killed, aircraft))
    expect(f1.triggers).toEqual([{ recipe: 'kill.air', position: v3(500, 1000, 0), velocity: ZERO }])
    expect(f1.sustained.find((s) => s.key === 'kill:b')).toMatchObject({ recipe: 'kill.air', intensity: 1 })
    const half = 100 + Math.round(KILL_TRAIL_S / 2 / DT)
    expect(nextFxEvents(f1.memory, view(half, killed, aircraft)).sustained.find((s) => s.key === 'kill:b')!.intensity).toBeCloseTo(0.5, 2)
    const over = 100 + Math.round(KILL_TRAIL_S / DT) + 1
    expect(nextFxEvents(f1.memory, view(over, killed, aircraft)).sustained.some((s) => s.key === 'kill:b')).toBe(false)
    // A destroyed airframe's engine no longer smokes on its own key.
    expect(f1.sustained.some((s) => s.key === 'engine:b')).toBe(false)
  })

  it('engine smoke follows engine health, from the nose in the body frame', () => {
    const { combat, aircraft } = base()
    const rec = combat.aircraft['a']!
    const hurt: CombatState = { ...combat, aircraft: { ...combat.aircraft, a: { ...rec, damage: { ...rec.damage, engine: 0.25 } } } }
    const s = nextFxEvents(NO_FX_MEMORY, view(5, hurt, aircraft)).sustained
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ key: 'engine:a', recipe: 'engine.smoke', intensity: 0.75, velocity: v3(100, 0, 0) })
    expect(s[0]!.position.x).toBeCloseTo(3.2, 9)
    expect(s[0]!.position.y).toBeCloseTo(1000.7, 9)
    expect(s[0]!.position.z).toBeCloseTo(0, 9)
    expect(nextFxEvents(NO_FX_MEMORY, view(5, combat, aircraft)).sustained).toEqual([])
  })

  it('ship fire scales with fire, stops once sunk, and needs a smoke origin', () => {
    const { combat, aircraft } = base()
    const burning = (fire: number, sinkingFraction: number): CombatState =>
      ({ ...combat, ships: { maru: { ...combat.ships['maru']!, fire, sinkingFraction } } })
    expect(nextFxEvents(NO_FX_MEMORY, view(5, burning(0.4, 0.2), aircraft)).sustained)
      .toEqual([{ key: 'ship:maru', recipe: 'ship.fire', intensity: 0.4, position: v3(9000, 20, 0), velocity: ZERO }])
    expect(nextFxEvents(NO_FX_MEMORY, view(5, burning(0.4, 1), aircraft)).sustained).toEqual([])
    expect(nextFxEvents(NO_FX_MEMORY, view(5, burning(0.4, 0.2), aircraft, { shipSmokeOrigins: new Map() })).sustained).toEqual([])
  })

  it('a collapse triggers once at its anchor and smokes for COLLAPSE_SMOKE_S, fading', () => {
    const { combat, aircraft } = base()
    const razed: CombatState = { ...combat, structures: { hangar: { hp: 0, destroyedTick: 60, attacker: 'a' } } }
    const f1 = nextFxEvents(NO_FX_MEMORY, view(60, razed, aircraft))
    expect(f1.triggers).toEqual([{ recipe: 'structure.collapse', position: v3(-500, 12, 40), velocity: ZERO }])
    expect(f1.sustained.find((s) => s.key === 'structure:hangar')!.intensity).toBe(1)
    const f2 = nextFxEvents(f1.memory, view(60 + Math.round(COLLAPSE_SMOKE_S / DT) + 1, razed, aircraft))
    expect(f2.triggers).toEqual([])
    expect(f2.sustained).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/render/fxEvents.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: Implement** `src/render/fx/events.ts`:

```ts
import type { ContactSurface } from '../../sim/contact.js'
import { DT } from '../../sim/flight/model.js'
import type { RenderState } from '../../sim/interpolate.js'
import type { Impact } from '../../sim/loop.js'
import { qRotate } from '../../sim/math/quat.js'
import { add, v3, ZERO, type Vec3 } from '../../sim/math/vec3.js'
import type { CombatState } from '../../sim/weapons/combat.js'
import type { CombatImpact } from '../../sim/weapons/impacts.js'
import type { RecipeId } from './catalog.js'

/**
 * Sim state -> effect events (ordnance-and-effects design §3.2). Pure. One
 * call per rendered frame. Edge memory follows `hitFlash.ts`'s old rule
 * (`nextHitFlashes`, deleted in E1 Task 10): a tick that moves backwards is
 * a new flight, and the old flight's edges are forgotten with it.
 */
export type FxTrigger = { readonly recipe: RecipeId; readonly position: Vec3; readonly velocity: Vec3 }
export type FxSustained = { readonly key: string; readonly recipe: RecipeId; readonly intensity: number; readonly position: Vec3; readonly velocity: Vec3 }
export type FxMemory = {
  readonly lastTick: number
  readonly lastImpactTick: number
  readonly seenCrashTick: Readonly<Record<string, number>>
  readonly seenKillTick: Readonly<Record<string, number>>
  readonly seenCollapseTick: Readonly<Record<string, number>>
}
/** Ring ticks start at 1 (the first step's tick), so 0 means "nothing seen". */
export const NO_FX_MEMORY: FxMemory = { lastTick: 0, lastImpactTick: 0, seenCrashTick: {}, seenKillTick: {}, seenCollapseTick: {} }

export type FxWorldView = {
  readonly tick: number
  readonly combat: Pick<CombatState, 'impacts' | 'aircraft' | 'ships' | 'structures'>
  readonly aircraft: readonly { readonly id: string; readonly impact: Impact | null; readonly state: { readonly velocity: Vec3 } }[]
  /** Parallel to `aircraft`: this frame's interpolated poses (frame.ts `posesFor`). */
  readonly poses: readonly RenderState[]
  /** World metres, per ship id: the view's smoke origin (Ruling R13). */
  readonly shipSmokeOrigins: ReadonlyMap<string, Vec3>
  /** World metres, per structure id: the rendered building's smoke anchor (Ruling R13). */
  readonly structureAnchors: ReadonlyMap<string, Vec3>
}

/** Seconds the kill trail rises from the wreck, fading (Ruling R6). Estimate. */
export const KILL_TRAIL_S = 20
/** Strike design §4: "a 60 s fading smoke column". */
export const COLLAPSE_SMOKE_S = 60
/** Where engine smoke leaves the airframe, body frame (+x nose): smoke.ts's
 *  first puff, `(3.2, 0.7, 0)`, carried over unchanged. */
export const ENGINE_SMOKE_OFFSET_BODY: Vec3 = v3(3.2, 0.7, 0)

export function impactRecipe(i: Pick<CombatImpact, 'cause' | 'outcome' | 'surface'>): RecipeId | null {
  if (i.outcome === 'expired' || i.surface === 'air') return null
  if (i.cause === 'round') return `round.${i.surface}` as RecipeId
  const water = i.surface === 'water'
  if (i.cause === 'bomb') return water ? 'bomb.water' : 'bomb.land'
  return water ? 'rocket.water' : 'rocket.land'
}
export const crashRecipe = (s: ContactSurface): RecipeId => `crash.${s}` as RecipeId

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

export function nextFxEvents(prev: FxMemory, w: FxWorldView): { readonly memory: FxMemory; readonly triggers: readonly FxTrigger[]; readonly sustained: readonly FxSustained[] } {
  const from = w.tick < prev.lastTick ? NO_FX_MEMORY : prev
  const seenCrashTick: Record<string, number> = { ...from.seenCrashTick }
  const seenKillTick: Record<string, number> = { ...from.seenKillTick }
  const seenCollapseTick: Record<string, number> = { ...from.seenCollapseTick }
  const triggers: FxTrigger[] = []
  const sustained: FxSustained[] = []

  let lastImpactTick = from.lastImpactTick
  for (const i of w.combat.impacts) {
    if (i.tick <= from.lastImpactTick) continue
    lastImpactTick = Math.max(lastImpactTick, i.tick)
    const recipe = impactRecipe(i)
    if (recipe !== null) triggers.push({ recipe, position: i.point, velocity: ZERO })
  }

  w.aircraft.forEach((a, index) => {
    const pose = w.poses[index]
    const rec = w.combat.aircraft[a.id]
    if (pose === undefined || rec === undefined) return
    if (a.impact !== null && seenCrashTick[a.id] !== a.impact.tick) {
      seenCrashTick[a.id] = a.impact.tick
      triggers.push({ recipe: crashRecipe(a.impact.surface), position: a.impact.position, velocity: ZERO })
    }
    const destroyedAt = rec.damage.destroyedAt
    if (destroyedAt !== null) {
      if (seenKillTick[a.id] !== destroyedAt) {
        seenKillTick[a.id] = destroyedAt
        triggers.push({ recipe: 'kill.air', position: pose.position, velocity: ZERO })
      }
      const age = (w.tick - destroyedAt) * DT
      if (a.impact === null && age < KILL_TRAIL_S) {
        sustained.push({ key: `kill:${a.id}`, recipe: 'kill.air', intensity: 1 - age / KILL_TRAIL_S, position: pose.position, velocity: ZERO })
      }
    } else if (a.impact === null && rec.damage.engine < 1) {
      sustained.push({
        key: `engine:${a.id}`, recipe: 'engine.smoke', intensity: 1 - clamp01(rec.damage.engine),
        position: add(pose.position, qRotate(pose.attitude, ENGINE_SMOKE_OFFSET_BODY)), velocity: a.state.velocity,
      })
    }
  })

  for (const [id, d] of Object.entries(w.combat.ships)) {
    const origin = w.shipSmokeOrigins.get(id)
    if (origin === undefined || d.fire <= 0 || d.sinkingFraction >= 1) continue
    sustained.push({ key: `ship:${id}`, recipe: 'ship.fire', intensity: Math.min(1, d.fire), position: origin, velocity: ZERO })
  }

  for (const [id, d] of Object.entries(w.combat.structures)) {
    const anchor = w.structureAnchors.get(id)
    if (anchor === undefined || d.destroyedTick === null) continue
    if (seenCollapseTick[id] !== d.destroyedTick) {
      seenCollapseTick[id] = d.destroyedTick
      triggers.push({ recipe: 'structure.collapse', position: anchor, velocity: ZERO })
    }
    const age = (w.tick - d.destroyedTick) * DT
    if (age < COLLAPSE_SMOKE_S) sustained.push({ key: `structure:${id}`, recipe: 'structure.collapse', intensity: 1 - age / COLLAPSE_SMOKE_S, position: anchor, velocity: ZERO })
  }

  return { memory: { lastTick: w.tick, lastImpactTick, seenCrashTick, seenKillTick, seenCollapseTick }, triggers, sustained }
}
```

`qRotate` with the identity quaternion leaves the offset alone, so the test's engine position is `(0, 1000, 0) + (3.2, 0.7, 0)`. That is the body-frame convention `smoke.ts` used (+x nose). Check `qRotate`'s argument order (`src/sim/math/quat.ts:29`: `qRotate(q, v)`) before trusting the test.

- [ ] **Step 4: Run the test.** `npx vitest run tests/render/fxEvents.test.ts --maxWorkers=2; echo rc=$?` → PASS, `rc=0`.

- [ ] **Step 5: Typecheck, lint, depcruise.** `npx tsc --noEmit; echo rc=$?`, `npx eslint src/render/fx tests/render/fxEvents.test.ts --max-warnings 0; echo rc=$?`, `npm run depcruise; echo rc=$?` → `rc=0` each.

- [ ] **Step 6: Commit.**

```bash
git add src/render/fx/events.ts tests/render/fxEvents.test.ts
git commit -m "E1 Task 4: fx events -- impacts, crashes, kills and collapses as edges; engine, kill, ship and collapse smoke from state"
```

---
### Task 5: The particle pool (`fx/system.ts`, `fx/tiers.ts`, spec §3.4, §4.4)

**Files:**
- Create: `src/render/fx/tiers.ts`, `src/render/fx/system.ts`
- Test: `tests/render/fxSystem.test.ts`

**Interfaces:**
- Consumes: `FX_CATALOG`, `FxEmitter`, `RecipeId` (Task 3), `FxSustained` (Task 4), `FxSheetLayout` (Task 2), `createRng` (`src/sim/rng.ts:7`), `SEA_LEVEL_M`.
- Produces (in `tiers.ts`):
  - `export type FxTier = { readonly capacity: number; readonly resolutionScale: 0.5 | 0.25; readonly frameBlend: boolean; readonly topMip: boolean }`
  - `export const FX_TIERS: Readonly<Record<QualityTierName, FxTier>>` (spec §4.4's table verbatim) and `export const FX_MAX_CAPACITY = 4096`
- Produces (in `system.ts`):
  - `export type FxInstanceArrays = { readonly posSize: Float32Array; readonly anim: Float32Array; readonly tint: Float32Array; readonly vel: Float32Array }`. There are four `vec4` per particle. **posSize** is world xyz and diameter (m). **anim** is rotation (rad), flipbook frame (float), alpha (after the life curve) and atlas cell (−1 = streak). **tint** is linear rgb and emissive. **vel** is velocity xyz and streak length (m, 0 for sprites).
  - `export function createInstanceArrays(capacity: number): FxInstanceArrays`
  - `export type FxSystem = { capacity(): number; trigger(recipe: RecipeId, position: Vec3, velocity: Vec3): void; setSustained(list: readonly FxSustained[]): void; step(dtS: number): void; live(): number; clear(): void; setCapacity(capacity: number): void; writeInstances(eye: Vec3, out: FxInstanceArrays): number; liveSerials(): number[] }`
  - `export function createFxSystem(o: { readonly capacity: number; readonly seed: number; readonly catalog: FxCatalog; readonly layout: FxSheetLayout }): FxSystem`
  - pure helpers `lifeAlpha(t, peak)`, `lifeSize(t, s0, s1)`, `flipbookFrame(age, life, frames, fps?)`, `sampleDirection(kind, spreadDeg, r1, r2): Vec3`, `fxDtSeconds(frameS, paused, timeScale)`

**Eviction, exactly (spec §3.4, "recycles the oldest particle").** Dead slots go to a free stack. A spawn takes a free slot if one exists. Only when the pool is **full** does it evict the oldest live particle. "Oldest" is the lowest spawn serial, found through a FIFO of `(slot, generation)` pairs whose stale entries are skipped, and which is compacted when it fills. So the cost is O(1) amortized, never an O(capacity) scan per spawn. A 32-rocket burst on Low evicts about 600 particles in one frame.

- [ ] **Step 1: Write the failing test** `tests/render/fxSystem.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FX_CATALOG, type FxCatalog } from '../../src/render/fx/catalog.js'
import { FX_SHEETS, type FxSheetLayout } from '../../src/render/fx/sheetManifest.js'
import {
  createFxSystem, createInstanceArrays, flipbookFrame, fxDtSeconds, lifeAlpha, lifeSize, sampleDirection, type FxSystem,
} from '../../src/render/fx/system.js'
import { FX_MAX_CAPACITY, FX_TIERS } from '../../src/render/fx/tiers.js'
import { length, v3, ZERO } from '../../src/sim/math/vec3.js'

const layout: FxSheetLayout = { frames: 16, cols: 3, rows: 2, motionScale: 0.02, cellOf: Object.fromEntries(FX_SHEETS.map((s, i) => [s, i])) as FxSheetLayout['cellOf'] }
const make = (capacity = 4096, seed = 1944): FxSystem => createFxSystem({ capacity, seed, catalog: FX_CATALOG, layout })
const run = (fx: FxSystem, seconds: number): void => { for (let i = 0; i < Math.round(seconds * 60); i++) fx.step(1 / 60) }
const snapshot = (fx: FxSystem, eye = ZERO): Float32Array[] => {
  const out = createInstanceArrays(FX_MAX_CAPACITY)
  const n = fx.writeInstances(eye, out)
  return [out.posSize, out.anim, out.tint, out.vel].map((a) => a.slice(0, n * 4))
}
const cellCount = (fx: FxSystem, cell: number): number => { const [, anim] = snapshot(fx); let n = 0; for (let i = 3; i < anim!.length; i += 4) if (anim![i] === cell) n++; return n }

describe('fx system (effects design §3.4)', () => {
  it('is deterministic under a seed, and the seed matters', () => {
    const a = make(), b = make(), c = make(4096, 7)
    for (const fx of [a, b, c]) { fx.trigger('bomb.land', v3(0, 0, 0), ZERO); run(fx, 0.5) }
    expect(snapshot(a)).toEqual(snapshot(b))
    expect(snapshot(a)).not.toEqual(snapshot(c))
  })

  it('a burst spawns its count', () => {
    const fx = make(); fx.trigger('round.land', v3(0, 0, 0), ZERO)
    expect(fx.live()).toBe(2)
  })

  for (const tier of ['high', 'medium', 'low'] as const) {
    it(`respects the ${tier} cap (${FX_TIERS[tier].capacity})`, () => {
      const fx = make(FX_TIERS[tier].capacity)
      for (let i = 0; i < 80; i++) fx.trigger('bomb.land', v3(i, 0, 0), ZERO) // 80 * 62 = 4960 burst particles
      expect(fx.live()).toBe(FX_TIERS[tier].capacity)
      run(fx, 2)
      expect(fx.live()).toBeLessThanOrEqual(FX_TIERS[tier].capacity)
    })
  }

  it('recycles the oldest only when full, and uses a free slot first', () => {
    const fx = make(4)
    fx.trigger('round.land', ZERO, ZERO); fx.trigger('round.land', ZERO, ZERO) // serials 0..3, full
    fx.trigger('round.land', ZERO, ZERO)
    expect(fx.liveSerials()).toEqual([2, 3, 4, 5])
    run(fx, 1.5) // round.land lives <= 1.2 s
    expect(fx.live()).toBe(0)
    fx.trigger('round.land', ZERO, ZERO)
    expect(fx.liveSerials()).toEqual([6, 7])
  })

  it('evicts oldest-first across many fills without drifting (FIFO compaction)', () => {
    const fx = make(100)
    for (let i = 0; i < 5000; i++) fx.trigger('round.land', ZERO, ZERO)
    expect(fx.liveSerials()).toEqual(Array.from({ length: 100 }, (_, k) => 9900 + k))
  })

  it('setCapacity to a lower tier keeps the newest; raising it again keeps working (tier change mid-flight)', () => {
    const fx = make(4096)
    for (let i = 0; i < 48; i++) fx.trigger('bomb.land', v3(i, 0, 0), ZERO) // 2976
    const before = fx.liveSerials()
    fx.setCapacity(1024)
    expect(fx.capacity()).toBe(1024)
    expect(fx.liveSerials()).toEqual(before.slice(-1024))
    fx.trigger('bomb.land', ZERO, ZERO)
    expect(fx.live()).toBe(1024)
    fx.setCapacity(4096)
    fx.trigger('bomb.land', ZERO, ZERO)
    expect(fx.live()).toBe(1024 + 62)
  })

  it('a timed stream (the bomb smoke column) runs for its duration after its delay, then dies out', () => {
    const fx = make(); fx.trigger('bomb.land', ZERO, ZERO)
    run(fx, 5)
    // 6/s from 0.5 s: 27 by 5 s, all still alive (life >= 8 s)
    expect(cellCount(fx, layout.cellOf.smoke)).toBeGreaterThanOrEqual(26)
    expect(cellCount(fx, layout.cellOf.smoke)).toBeLessThanOrEqual(28)
    run(fx, 27) // stream ends at 18.5 s; its last particle dies by 30.5 s
    expect(cellCount(fx, layout.cellOf.smoke)).toBe(0)
  })

  it('a sustained emitter emits rate x intensity while listed, and stops when dropped', () => {
    const fx = make()
    const smoke = (intensity: number) => [{ key: 'engine:a', recipe: 'engine.smoke' as const, intensity, position: v3(0, 1000, 0), velocity: v3(100, 0, 0) }]
    fx.setSustained(smoke(1)); run(fx, 1)
    expect(fx.live()).toBeGreaterThanOrEqual(13); expect(fx.live()).toBeLessThanOrEqual(15) // 14/s
    const at1 = fx.live()
    fx.setSustained(smoke(0.5)); run(fx, 1) // life >= 2 s: nothing has died yet
    expect(fx.live() - at1).toBeGreaterThanOrEqual(6); expect(fx.live() - at1).toBeLessThanOrEqual(8)
    fx.setSustained([]); const at2 = fx.live(); run(fx, 0.5)
    expect(fx.live()).toBeLessThanOrEqual(at2)
  })

  it('a seaKill particle is removed at sea level, long before its life ends (spec §5.1)', () => {
    // A long-lived, slow, straight-up droplet: it can only die by falling
    // below the sea (y = 0.5 + t - 4.9 t^2 crosses 0 near 0.5 s).
    const drop = (seaKill: boolean): FxCatalog => ({ ...FX_CATALOG, 'round.water': { ...FX_CATALOG['round.water'],
      emitters: [{ ...FX_CATALOG['round.water'].emitters[0]!, count: 1, lifeS: [10, 10], speedMps: [1, 1], spreadDeg: 0, dragPerS: 0, accelYMps2: -9.81, seaKill }] } })
    for (const seaKill of [true, false]) {
      const fx = createFxSystem({ capacity: 16, seed: 1, catalog: drop(seaKill), layout })
      fx.trigger('round.water', v3(0, 0.5, 0), ZERO)
      run(fx, 1.5)
      expect(fx.live()).toBe(seaKill ? 0 : 1)
    }
  })

  it('step(0) -- a paused game -- changes nothing; fxDtSeconds scales, freezes and clamps (Review Focus 4)', () => {
    const fx = make(); fx.trigger('bomb.land', ZERO, ZERO); run(fx, 0.3)
    const before = snapshot(fx)
    fx.step(0)
    expect(snapshot(fx)).toEqual(before)
    expect(fxDtSeconds(1 / 60, true, 1)).toBe(0)
    expect(fxDtSeconds(1 / 60, false, 3)).toBeCloseTo(3 / 60, 12)
    expect(fxDtSeconds(5, false, 1)).toBe(0.1)
  })

  it('clear() empties the pool and stops timed streams (restart, Review Focus 3)', () => {
    const fx = make(); fx.trigger('bomb.land', ZERO, ZERO); run(fx, 1)
    fx.clear()
    expect(fx.live()).toBe(0)
    run(fx, 5)
    expect(fx.live()).toBe(0)
  })

  it('writes back to front', () => {
    const fx = make()
    for (const x of [100, -300, 50, 900, -20]) fx.trigger('round.land', v3(x, 0, 0), ZERO)
    const [pos] = snapshot(fx, v3(0, 10, 0))
    let last = Infinity
    for (let i = 0; i < pos!.length; i += 4) {
      const d = Math.hypot(pos![i]!, pos![i + 1]! - 10, pos![i + 2]!)
      expect(d).toBeLessThanOrEqual(last + 1e-3)
      last = d
    }
  })

  it('life curves: fade in, fade out, grow; flipbook plays once or loops', () => {
    expect(lifeAlpha(0, 1)).toBe(0)
    expect(lifeAlpha(0.3, 0.8)).toBeCloseTo(0.8, 12)
    expect(lifeAlpha(1, 1)).toBe(0)
    expect(lifeSize(0, 2, 10)).toBe(2)
    expect(lifeSize(1, 2, 10)).toBe(10)
    expect(lifeSize(0.5, 2, 10)).toBeGreaterThan(6) // grows fast, then settles
    expect(flipbookFrame(0, 2, 16)).toBe(0)
    expect(flipbookFrame(2, 2, 16)).toBe(15)
    expect(flipbookFrame(1.25, 1, 16, 12)).toBeCloseTo(15, 12)
    expect(flipbookFrame(1.5, 1, 16, 12)).toBeCloseTo(2, 12)
  })

  it('directions stay inside their cone, on the unit sphere', () => {
    for (let i = 0; i < 200; i++) {
      const r1 = (i * 0.618) % 1, r2 = (i * 0.414) % 1
      const up = sampleDirection('up', 30, r1, r2)
      expect(length(up)).toBeCloseTo(1, 9)
      expect(up.y).toBeGreaterThanOrEqual(Math.cos(Math.PI / 6) - 1e-9)
      const ring = sampleDirection('ring', 10, r1, r2)
      expect(ring.y).toBeGreaterThanOrEqual(-1e-9); expect(ring.y).toBeLessThanOrEqual(Math.sin(Math.PI / 18) + 1e-9)
      expect(length(sampleDirection('sphere', 180, r1, r2))).toBeCloseTo(1, 9)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/render/fxSystem.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: Implement `tiers.ts`:**

```ts
import type { QualityTierName } from '../quality.js'

/** Effects quality (ordnance-and-effects design §4.4), verbatim. */
export type FxTier = { readonly capacity: number; readonly resolutionScale: 0.5 | 0.25; readonly frameBlend: boolean; readonly topMip: boolean }
export const FX_TIERS: Readonly<Record<QualityTierName, FxTier>> = {
  high: { capacity: 4096, resolutionScale: 0.5, frameBlend: true, topMip: true },
  medium: { capacity: 2048, resolutionScale: 0.5, frameBlend: true, topMip: true },
  low: { capacity: 1024, resolutionScale: 0.25, frameBlend: false, topMip: false },
}
/** Instance buffers are allocated once at this size, so a tier change never reallocates GPU memory. */
export const FX_MAX_CAPACITY = 4096
```

- [ ] **Step 4: Implement `system.ts`:**

```ts
import { createRng } from '../../sim/rng.js'
import { SEA_LEVEL_M } from '../../sim/world/terrain.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { FxCatalog, FxEmitter, RecipeId } from './catalog.js'
import type { FxSustained } from './events.js'
import type { FxSheetLayout } from './sheetManifest.js'
import { FX_MAX_CAPACITY } from './tiers.js'

/**
 * The effects particle pool (ordnance-and-effects design §3.4): fixed
 * capacity from the tier, simulated on the CPU with a seeded generator so
 * Tier 1 tests it without a GPU, one sorted instance buffer per frame.
 * Positions are raw world metres (float64 here, float32 on upload); the fx
 * scene's position supplies the camera-relative shift (plan E1 Ruling R10).
 */
export type FxInstanceArrays = { readonly posSize: Float32Array; readonly anim: Float32Array; readonly tint: Float32Array; readonly vel: Float32Array }
export const createInstanceArrays = (capacity: number): FxInstanceArrays => ({
  posSize: new Float32Array(capacity * 4), anim: new Float32Array(capacity * 4),
  tint: new Float32Array(capacity * 4), vel: new Float32Array(capacity * 4),
})

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Fade in over the first 10% of life, out over the last 40%. */
export const lifeAlpha = (t: number, peak: number): number => peak * Math.min(1, clamp01(t) / 0.1) * Math.min(1, (1 - clamp01(t)) / 0.4)
/** Grows fast, then settles: size(t) = s0 + (s1 - s0)(1 - (1 - t)^2). */
export const lifeSize = (t: number, s0: number, s1: number): number => { const u = 1 - clamp01(t); return s0 + (s1 - s0) * (1 - u * u) }
/** Continuous flipbook frame: one pass over life, or a loop at `fps`. */
export const flipbookFrame = (age: number, life: number, frames: number, fps?: number): number =>
  fps === undefined ? Math.min(age / life, 1) * (frames - 1) : (age * fps) % frames
/** R14: paused freezes, time scale scales, a stalled tab steps at most 0.1 s. */
export const fxDtSeconds = (frameS: number, paused: boolean, timeScale: number): number =>
  paused ? 0 : Math.min(Math.max(frameS, 0), 0.1) * timeScale

export function sampleDirection(kind: FxEmitter['direction'], spreadDeg: number, r1: number, r2: number): Vec3 {
  const phi = 2 * Math.PI * r2
  if (kind === 'sphere') { const y = 1 - 2 * r1, s = Math.sqrt(Math.max(0, 1 - y * y)); return { x: s * Math.cos(phi), y, z: s * Math.sin(phi) } }
  const spread = (spreadDeg * Math.PI) / 180
  if (kind === 'ring') { const e = r1 * spread; return { x: Math.cos(e) * Math.cos(phi), y: Math.sin(e), z: Math.cos(e) * Math.sin(phi) } }
  const cosT = 1 - r1 * (1 - Math.cos(spread)), sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
  return { x: sinT * Math.cos(phi), y: cosT, z: sinT * Math.sin(phi) }
}

export type FxSystem = {
  capacity(): number
  trigger(recipe: RecipeId, position: Vec3, velocity: Vec3): void
  setSustained(list: readonly FxSustained[]): void
  step(dtS: number): void
  live(): number
  clear(): void
  setCapacity(capacity: number): void
  /** Back-to-front from `eye` (Ruling R17). Returns the instance count. */
  writeInstances(eye: Vec3, out: FxInstanceArrays): number
  /** Spawn serials of the live particles, ascending (tests). */
  liveSerials(): number[]
}

const F64 = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'serial'] as const
const F32 = ['age', 'life', 's0', 's1', 'rot', 'spin', 'alpha', 'tr', 'tg', 'tb', 'emissive', 'drag', 'accelY', 'fps', 'streakS', 'cell', 'seaKill'] as const

export function createFxSystem(o: { readonly capacity: number; readonly seed: number; readonly catalog: FxCatalog; readonly layout: FxSheetLayout }): FxSystem {
  const N = FX_MAX_CAPACITY
  const checkCap = (c: number): number => { if (!Number.isInteger(c) || c < 1 || c > N) throw new Error(`fx capacity ${c} outside 1..${N}`); return c }
  let cap = checkCap(o.capacity)
  const d = Object.fromEntries(F64.map((k) => [k, new Float64Array(N)])) as Record<(typeof F64)[number], Float64Array>
  const f = Object.fromEntries(F32.map((k) => [k, new Float32Array(N)])) as Record<(typeof F32)[number], Float32Array>
  const gen = new Uint32Array(N), alive = new Uint8Array(N)
  const free = new Int32Array(N)
  const FIFO = 2 * N, fifoSlot = new Int32Array(FIFO), fifoGen = new Uint32Array(FIFO)
  let freeTop = 0, head = 0, count = 0, liveCount = 0, nextSerial = 0
  const rng = createRng(o.seed)
  type Timed = { readonly e: FxEmitter; readonly p: Vec3; readonly v: Vec3; t: number; carry: number }
  let timed: Timed[] = []
  const sustainedState = new Map<string, { carry: number[]; last: Vec3 | null }>()
  let sustainedNow: readonly FxSustained[] = []
  const dist2 = new Float64Array(N)
  const order: number[] = []

  const resetSlots = (): void => {
    alive.fill(0); freeTop = 0; head = 0; count = 0; liveCount = 0
    for (let s = cap - 1; s >= 0; s--) free[freeTop++] = s
  }
  resetSlots()

  const compactFifo = (): void => {
    let k = 0
    for (let j = 0; j < count; j++) {
      const i = (head + j) % FIFO, s = fifoSlot[i]!
      if (alive[s] === 1 && gen[s] === fifoGen[i]) { fifoSlot[k] = s; fifoGen[k] = fifoGen[i]!; k++ }
    }
    head = 0; count = k
  }
  const fifoPush = (s: number): void => {
    if (count === FIFO) compactFifo()
    const at = (head + count) % FIFO
    fifoSlot[at] = s; fifoGen[at] = gen[s]!; count++
  }
  const kill = (s: number): void => { alive[s] = 0; free[freeTop++] = s; liveCount-- }
  const allocate = (): number => {
    let s = -1
    if (freeTop > 0) s = free[--freeTop]!
    else {
      // Full: the first valid FIFO entry is the oldest live particle (spec §3.4).
      while (s < 0) {
        const i = head; head = (head + 1) % FIFO; count--
        const c = fifoSlot[i]!
        if (alive[c] === 1 && gen[c] === fifoGen[i]) s = c
      }
      liveCount--
    }
    gen[s]!++; alive[s] = 1; liveCount++; d.serial[s] = nextSerial++
    fifoPush(s)
    return s
  }
  const lerp = (r: readonly [number, number], t: number): number => r[0] + (r[1] - r[0]) * t

  const spawn = (e: FxEmitter, x: number, y: number, z: number, v: Vec3): void => {
    const s = allocate()
    // Exactly nine draws per particle, in this order, so a seed replays.
    const dir = sampleDirection(e.direction, e.spreadDeg, rng(), rng())
    const speed = lerp(e.speedMps, rng())
    const off = sampleDirection('sphere', 180, rng(), rng())
    const rr = e.radiusM * Math.cbrt(rng())
    d.px[s] = x + off.x * rr; d.py[s] = y + off.y * rr; d.pz[s] = z + off.z * rr
    d.vx[s] = dir.x * speed + v.x * e.inheritVelocity; d.vy[s] = dir.y * speed + v.y * e.inheritVelocity; d.vz[s] = dir.z * speed + v.z * e.inheritVelocity
    f.age[s] = 0; f.life[s] = lerp(e.lifeS, rng())
    f.rot[s] = rng() * 2 * Math.PI; f.spin[s] = (rng() * 2 - 1) * e.spinRadPerS
    f.s0[s] = e.sizeM[0]; f.s1[s] = e.sizeM[1]; f.alpha[s] = e.alpha
    f.tr[s] = e.tint[0]; f.tg[s] = e.tint[1]; f.tb[s] = e.tint[2]; f.emissive[s] = e.emissive
    f.drag[s] = e.dragPerS; f.accelY[s] = e.accelYMps2; f.fps[s] = e.frameRateHz ?? 0; f.streakS[s] = e.streakS ?? 0
    f.cell[s] = e.sheet === 'streak' ? -1 : o.layout.cellOf[e.sheet]; f.seaKill[s] = e.seaKill ? 1 : 0
  }

  const emit = (e: FxEmitter, n: number, from: Vec3, to: Vec3, v: Vec3): void => {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n // spread along the frame's travel, so a fast emitter leaves no gaps
      spawn(e, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t, v)
    }
  }

  const system: FxSystem = {
    capacity: () => cap,
    live: () => liveCount,
    trigger(recipe, p, v) {
      for (const e of o.catalog[recipe].emitters) {
        if (e.mode === 'burst') emit(e, e.count!, p, p, v)
        else if (e.durationS !== undefined) timed.push({ e, p, v, t: 0, carry: 0 })
      }
    },
    setSustained(list) {
      sustainedNow = list
      const keys = new Set(list.map((s) => s.key))
      for (const k of [...sustainedState.keys()]) if (!keys.has(k)) sustainedState.delete(k)
      for (const s of list) if (!sustainedState.has(s.key)) sustainedState.set(s.key, { carry: o.catalog[s.recipe].emitters.map(() => 0), last: null })
    },
    step(dt) {
      if (!(dt > 0)) return
      for (let s = 0; s < cap; s++) {
        if (alive[s] !== 1) continue
        const age = f.age[s]! + dt
        if (age >= f.life[s]!) { kill(s); continue }
        f.age[s] = age
        const k = Math.exp(-f.drag[s]! * dt)
        d.vx[s]! *= k; d.vy[s] = d.vy[s]! * k + f.accelY[s]! * dt; d.vz[s]! *= k
        d.px[s]! += d.vx[s]! * dt; d.py[s]! += d.vy[s]! * dt; d.pz[s]! += d.vz[s]! * dt
        f.rot[s]! += f.spin[s]! * dt
        if (f.seaKill[s] === 1 && d.py[s]! < SEA_LEVEL_M) kill(s)
      }
      timed = timed.filter((ts) => {
        const e = ts.e, start = e.delayS, end = e.delayS + e.durationS!
        const active = Math.max(0, Math.min(ts.t + dt, end) - Math.max(ts.t, start))
        ts.t += dt
        if (active > 0) {
          const n = ts.carry + e.ratePerS! * active, whole = Math.floor(n)
          ts.carry = n - whole
          emit(e, whole, ts.p, ts.p, ts.v)
        }
        return ts.t < end
      })
      for (const em of sustainedNow) {
        const st = sustainedState.get(em.key)!
        const from = st.last ?? em.position
        o.catalog[em.recipe].emitters.forEach((e, i) => {
          if (e.mode !== 'stream' || e.durationS !== undefined) return
          const n = st.carry[i]! + e.ratePerS! * em.intensity * dt, whole = Math.floor(n)
          st.carry[i] = n - whole
          emit(e, whole, from, em.position, em.velocity)
        })
        st.last = em.position
      }
    },
    clear() { resetSlots(); timed = []; sustainedState.clear(); sustainedNow = [] },
    setCapacity(next) {
      checkCap(next)
      if (next === cap) return
      // Rare (a Settings pick), so a sort is fine: keep the newest `next`, in spawn order.
      const keep = [...Array(cap).keys()].filter((s) => alive[s] === 1).sort((a, b) => d.serial[a]! - d.serial[b]!).slice(-next)
      const snapD = Object.fromEntries(F64.map((k) => [k, d[k].slice()])) as typeof d
      const snapF = Object.fromEntries(F32.map((k) => [k, f[k].slice()])) as typeof f
      cap = next
      resetSlots()
      freeTop = 0 // refilled below with only the slots the kept particles do not occupy
      for (let s = cap - 1; s >= keep.length; s--) free[freeTop++] = s
      keep.forEach((from, to) => {
        for (const k of F64) d[k][to] = snapD[k][from]!
        for (const k of F32) f[k][to] = snapF[k][from]!
        alive[to] = 1; gen[to]!++; liveCount++
        fifoPush(to)
      })
    },
    writeInstances(eye, out) {
      order.length = 0
      for (let s = 0; s < cap; s++) {
        if (alive[s] !== 1) continue
        const dx = d.px[s]! - eye.x, dy = d.py[s]! - eye.y, dz = d.pz[s]! - eye.z
        dist2[s] = dx * dx + dy * dy + dz * dz
        order.push(s)
      }
      order.sort((a, b) => dist2[b]! - dist2[a]!)
      order.forEach((s, i) => {
        const t = f.age[s]! / f.life[s]!, j = i * 4
        out.posSize[j] = d.px[s]!; out.posSize[j + 1] = d.py[s]!; out.posSize[j + 2] = d.pz[s]!; out.posSize[j + 3] = lifeSize(t, f.s0[s]!, f.s1[s]!)
        out.anim[j] = f.rot[s]!
        out.anim[j + 1] = flipbookFrame(f.age[s]!, f.life[s]!, o.layout.frames, f.fps[s]! > 0 ? f.fps[s]! : undefined)
        out.anim[j + 2] = lifeAlpha(t, f.alpha[s]!); out.anim[j + 3] = f.cell[s]!
        out.tint[j] = f.tr[s]!; out.tint[j + 1] = f.tg[s]!; out.tint[j + 2] = f.tb[s]!; out.tint[j + 3] = f.emissive[s]!
        out.vel[j] = d.vx[s]!; out.vel[j + 1] = d.vy[s]!; out.vel[j + 2] = d.vz[s]!
        out.vel[j + 3] = f.cell[s]! < 0 ? Math.hypot(d.vx[s]!, d.vy[s]!, d.vz[s]!) * f.streakS[s]! : 0
      })
      return order.length
    },
    liveSerials() {
      const out: number[] = []
      for (let s = 0; s < cap; s++) if (alive[s] === 1) out.push(d.serial[s]!)
      return out.sort((a, b) => a - b)
    },
  }
  return system
}
```

- [ ] **Step 5: Run the test.** `npx vitest run tests/render/fxSystem.test.ts --maxWorkers=2; echo rc=$?` → PASS, `rc=0`. If the timed-stream bounds (26–28) or the sustained bounds miss by one, the cause is the carry arithmetic at the delay boundary. Fix the arithmetic, not the bound: the bound is rate × time.

- [ ] **Step 6: Typecheck, lint.** `npx tsc --noEmit; echo rc=$?`, `npx eslint src/render/fx tests/render/fxSystem.test.ts --max-warnings 0; echo rc=$?` → `rc=0` each.

- [ ] **Step 7: Commit.**

```bash
git add src/render/fx/tiers.ts src/render/fx/system.ts tests/render/fxSystem.test.ts
git commit -m "E1 Task 5: fx particle pool -- seeded CPU sim, tier caps, oldest-first eviction via FIFO, back-to-front instances"
```

---

### Task 6: `fx`, the fourth quality system (spec §4.4)

**Files:**
- Modify: `src/render/quality.ts` (`QualitySettings` `:21-25`, `defaultQualitySettings` `:27-29`, `isQualitySettings` `:35-39`, `loadQualitySettings` `:41-55`, `uniformTier` `:125-129`)
- Modify: `src/render/settings.ts` (`QualitySystem` `:94`, `RENDER_QUALITY_OPTIONS` Low note `:110`, `ADVANCED_SYSTEMS` `:115-119`, doc comments naming "three" systems)
- Modify: `src/render/bootQuality.ts` (`QualityTargets` `:39-43`, `apply` `:106-110`, doc at `:30-38`)
- Modify: `src/render/main.ts` (the `quality.bind` call `:1210`, a minimal `applyFxTier`)
- Test: `tests/render/quality.test.ts`, `tests/render/settings.test.ts`, `tests/render/bootQuality.test.ts`; expectations in `tests/e2e/settingsUi.spec.ts:127` and `:239` (run in Task 11)

**Interfaces:**
- Produces: `QualitySettings = { ocean; scenery; clouds; fx }`, `QualitySystem = 'ocean' | 'scenery' | 'clouds' | 'fx'`, and `QualityTargets.setFxTier: (tier: QualityTierName) => void`. In `main.ts`: `let fxTier: QualityTierName` and `const applyFxTier = (name: QualityTierName): void`. Task 9 extends it.

- [ ] **Step 1: Write the failing tests.** In `tests/render/quality.test.ts`, change every `{ ocean, scenery, clouds }` literal to carry `fx`, and add:

```ts
  it('a saved object from before fx existed loads with fx = clouds, not discarded (Ruling R15, Review Focus 1)', () => {
    window.localStorage.setItem('ww2airsim.quality.v1', JSON.stringify({ ocean: 'high', scenery: 'medium', clouds: 'low' }))
    expect(loadQualitySettings()).toEqual({ ocean: 'high', scenery: 'medium', clouds: 'low', fx: 'low' })
  })

  it('a stored fx that is not a tier is still rejected', () => {
    window.localStorage.setItem('ww2airsim.quality.v1', JSON.stringify({ ocean: 'high', scenery: 'high', clouds: 'high', fx: 'ultra' }))
    expect(loadQualitySettings()).toBeNull()
  })
```

Update the two existing expectations: `defaultQualitySettings('medium')` gives `{ ocean: 'medium', scenery: 'medium', clouds: 'medium', fx: 'medium' }`. `uniformTier` gains a case: `expect(uniformTier({ ocean: 'high', scenery: 'high', clouds: 'high', fx: 'low' })).toBeNull()`.

In `tests/render/settings.test.ts:88`: `expect(ADVANCED_SYSTEMS.map((s) => s.value)).toEqual(['ocean', 'scenery', 'clouds', 'fx'])`, plus `expect(ADVANCED_SYSTEMS.at(-1)!.label).toBe('Effects')`.

In `tests/render/bootQuality.test.ts`, `recordingTargets` gains `fx: [] as QualityTierName[]` in `seen` and `setFxTier: (t) => { seen.fx.push(t) }`. The "APPLIES a tier pick" case also clears `seen.fx` and asserts `expect(targets.seen.fx).toEqual(['low'])`. The source-pin case `binds the model to the live tier setters` (`:230-234`) gains `expect(source).toContain('setFxTier: applyFxTier')`. The file's own comment says why these pins exist: a setter nobody binds fails silently.

In `tests/e2e/settingsUi.spec.ts`: `:127` expects `{ ocean: 'low', scenery: 'low', clouds: 'low', fx: 'low' }`, and `:239` expects `{ ocean: 'high', scenery: 'low', clouds: 'high', fx: 'high' }`. Leave `:162` and `:188` alone. They seed and read back a pre-E1 object that the model never re-saves, which is exactly Review Focus 1 through the real UI.

- [ ] **Step 2: Run and watch them fail.**
Run: `npx vitest run tests/render/quality.test.ts tests/render/settings.test.ts tests/render/bootQuality.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: Implement.** In `quality.ts`:

```ts
export type QualitySettings = {
  readonly ocean: QualityTierName
  readonly scenery: QualityTierName
  readonly clouds: QualityTierName
  /** Effects (ordnance-and-effects design §4.4). Added 2026-09-26 (E1): an
   *  object saved before then has no `fx` and loads with `fx = clouds`
   *  (plan E1 Ruling R15), rather than being discarded. */
  readonly fx: QualityTierName
}

export function defaultQualitySettings(tier: QualityTierName): QualitySettings {
  return { ocean: tier, scenery: tier, clouds: tier, fx: tier }
}

/** A stored value as today's shape, migrating a pre-E1 object; null if unusable. */
function parseQualitySettings(v: unknown): QualitySettings | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isQualityTierName(o.ocean) || !isQualityTierName(o.scenery) || !isQualityTierName(o.clouds)) return null
  if (o.fx === undefined) return { ocean: o.ocean, scenery: o.scenery, clouds: o.clouds, fx: o.clouds }
  return isQualityTierName(o.fx) ? { ocean: o.ocean, scenery: o.scenery, clouds: o.clouds, fx: o.fx } : null
}
```

Delete `isQualitySettings`. `loadQualitySettings` calls `parseQualitySettings(parsed)`, warns and returns `null` when that returns `null`, and otherwise returns the parsed value. `uniformTier` requires `settings.clouds === settings.fx` as well.

In `settings.ts`: `export type QualitySystem = 'ocean' | 'scenery' | 'clouds' | 'fx'`. `ADVANCED_SYSTEMS` gains `{ value: 'fx', label: 'Effects' }` last. The Low note becomes `'Fastest. Reduced ocean, cloud and effects detail, no trees and plain ground.'`. Fix the doc comments that say "three rendering systems", "ocean/scenery/clouds all" and "the other two" to say four and three.

In `bootQuality.ts`: `QualityTargets` gains `readonly setFxTier: (tier: QualityTierName) => void`, and `apply` calls `targets.setFxTier(q.fx)` last. Update the doc comment: "four things a tier moves ... the effects pool and pass".

In `main.ts`, beside `let cloudTier` (search `cloudTier = forcedCloudTier ??`, `:1055`): `let fxTier: QualityTierName = quality.current().fx`. Above `quality.bind` (`:1210`):

```ts
  /** Effects tier (E1). Task 9 moves the pool and the pass from here; until
   *  then it only records the pick, so the Settings dialog is honest. */
  const applyFxTier = (name: QualityTierName): void => { fxTier = name }
```

Then add `setFxTier: applyFxTier` to the `quality.bind({...})` object.

- [ ] **Step 4: Run the tests.** Same command as Step 2 → PASS, `rc=0`. Also run `npx vitest run tests/render/titleScreen.test.ts --maxWorkers=2; echo rc=$?` → `rc=0`. The dialog renders `ADVANCED_SYSTEMS` generically (`settings.ts:436`, `:513`).

- [ ] **Step 5: Typecheck, lint.** `npx tsc --noEmit; echo rc=$?`, `npx eslint src/render tests/render tests/e2e/settingsUi.spec.ts --max-warnings 0; echo rc=$?` → `rc=0` each.

- [ ] **Step 6: Commit.**

```bash
git add src/render/quality.ts src/render/settings.ts src/render/bootQuality.ts src/render/main.ts tests/render/quality.test.ts tests/render/settings.test.ts tests/render/bootQuality.test.ts tests/e2e/settingsUi.spec.ts
git commit -m "E1 Task 6: Effects is the fourth quality system; saved settings from before it migrate fx from clouds"
```

---
### Task 7: Sheets at runtime, and the lit particle materials (spec §4.1, §4.3)

**Files:**
- Create: `src/render/fx/shading.ts` (constants and CPU twins), `src/render/fx/sheets.ts` (runtime loader and fallback), `src/render/fx/material.ts` (TSL)
- Test: `tests/render/fxShading.test.ts`

**Interfaces:**
- Consumes: the Task 2 manifest and files. `sunDirectionNode`, `sunColorNode`, `skyIrradianceUpNode`, `skyIrradianceDownNode`, `cloudSkylightNode` (`src/render/scene/lighting.ts:28-70`). `aerialPerspective(dir, distanceM)` (`src/render/scene/atmosphereShading.ts:50`). `CloudShadowHandle.node(position, 'eyeRelative')` (`src/render/scene/cloudShadow.ts:66-70`). `BASIS_TRANSCODER_DIR` (`src/render/terrain/surfaceTextures.ts:15`).
- Produces (in `shading.ts`): `NEAR_FADE_START_M = 0.5`, `NEAR_FADE_END_M = 2.0`, `SOFT_MIN_M = 0.5`, `SOFT_SIZE_FRACTION = 0.5`, `DENSE_FRAGMENT_ALPHA = 0.05`, `DENSE_ACCUMULATED_ALPHA = 0.5`, `CLOSENESS_SCALE_M = 1000`, `FIRE_RADIANCE = 6`. Also `nearFade(viewZ)`, `softFade(sceneViewZ, particleViewZ, sizeM)`, `encodeCloseness(viewZM)`, `decodeCloseness(c)`, `sixWayLight(maps, l)`, `fireRamp(e): [number, number, number]` and `fxTexelPixel(texel, span, fullSize)`.
- Produces (in `sheets.ts`): `export type FxSheetTextures = { readonly manifest: FxSheetManifest; readonly lightA: Texture; readonly lightB: Texture; readonly motion: Texture; readonly fallback: boolean }`, `export async function loadFxSheets(renderer: WebGPURenderer): Promise<FxSheetTextures>` (never rejects), `export function fallbackFxSheets(): FxSheetTextures`.
- Produces (in `material.ts`): `export type FxUniforms` (below), `export function createFxUniforms(): FxUniforms`, `export function createFxMaterials(i: FxMaterialInputs): { readonly particle: NodeMaterial; readonly dense: NodeMaterial }`.

**The shading, as written in `material.ts` (and twinned in `shading.ts`):**
- **Billboard.** A `PlaneGeometry(2, 2)` corner `c ∈ [−1, 1]²` is placed at `center + (right·c.x + up·c.y)·size/2`. `right` and `up` are the camera's axes rotated by the particle's rotation. A **streak** (cell −1) is stretched along its velocity projected perpendicular to the view, with half-length `max(streakLength, size)/2`. Picture row 0 is the **top**: `quadUv = (c.x/2 + 1/2, 1/2 − c.y/2)`.
- **Eye-relative position** `rel = center + worldOffset`, computed from the attributes, not from `positionWorld`, so no builtin's evaluation order matters. `viewZ = −dot(rel, camBack)`.
- **Six-way (spec §4.3).** The sun direction goes into the particle frame, `l = (L·right, L·up, L·back)`. The direct term is `Σ max(±l, 0)²` weighted over (right, top, front | left, bottom, back). The weights sum to 1 for a unit `l`. Ambient is `skyUp·top + skyDown·bottom + (skyUp + skyDown)/8·(right + left + front + back)`, with `skyUp` including `cloudSkylightNode` exactly as the terrain's does (`mesh.ts:336`). Radiance is `tint/π·(sunColor·cloudShadow·direct + ambient) + fireRamp(emission·emissive)`. That is the terrain's Lambert convention, `mesh.ts:337`.
- **Fire (spec §4.3):** `fireRamp(e) = FIRE_RADIANCE·(e, 0.6e², 0.3e⁴)`. At `e = 1` this is 6.0 scene-linear, well over `BLOOM_THRESHOLD` (1.2, `pipeline.ts:127`), so fire blooms and needs no light of its own.
- **Haze:** `color = radiance·ap.a + ap.rgb`, with `ap = aerialPerspective(rel, |rel|)` per vertex, as the terrain does (`mesh.ts:350`).
- **Fades (spec §4.1):** `soft = clamp((sceneZ − viewZ) / max(0.5·size, 0.5 m), 0, 1)`, where `sceneZ` is the fx texel's representative pixel (R11). `near = smoothstep(0.5 m, 2.0 m, viewZ)`. With `?fxSoft=off` the soft term becomes a hard depth test, `sceneZ > viewZ ? 1 : 0`, never "no test".
- **Output:** premultiplied `vec4(color·a, a)`. The **dense** material outputs `vec4(a > 0.05 ? 1/(1 + viewZ/1000) : 0, 0, 0, 1)` under `MaxEquation` (R9).

- [ ] **Step 1: Write the failing test** `tests/render/fxShading.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataArrayTexture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { BLOOM_THRESHOLD } from '../../src/render/pipeline.js'
import {
  CLOSENESS_SCALE_M, decodeCloseness, encodeCloseness, fireRamp, fxTexelPixel, nearFade, sixWayLight, softFade,
} from '../../src/render/fx/shading.js'
import { fallbackFxSheets, loadFxSheets } from '../../src/render/fx/sheets.js'
import { FX_SHEETS, fxSheetManifestSchema } from '../../src/render/fx/sheetManifest.js'

const MAPS = { right: 0.9, left: 0.1, top: 0.7, bottom: 0.2, back: 0.3, front: 0.5 }

describe('fx shading twins (effects design §4.1, §4.3)', () => {
  it('near fade: invisible inside 0.5 m, full by 2 m (spec: "within about 2 m of the eye", Review Focus 5)', () => {
    expect(nearFade(0.4)).toBe(0)
    expect(nearFade(1.25)).toBeCloseTo(0.5, 12)
    expect(nearFade(2.5)).toBe(1)
  })

  it('soft fade: gone behind the surface, full a half-size in front, scale floored at 0.5 m', () => {
    expect(softFade(100, 101, 10)).toBe(0)
    expect(softFade(100, 95, 10)).toBe(1)
    expect(softFade(100, 97.5, 10)).toBeCloseTo(0.5, 12)
    expect(softFade(100, 99.75, 0.1)).toBeCloseTo(0.5, 12)
  })

  it('dense-depth closeness round-trips and orders by distance; 0 means nothing there', () => {
    for (const z of [0.5, 12, 300, 4000, 100_000]) expect(decodeCloseness(encodeCloseness(z)) / z).toBeCloseTo(1, 9)
    expect(encodeCloseness(10)).toBeGreaterThan(encodeCloseness(20)) // MaxEquation keeps the nearest
    expect(decodeCloseness(0)).toBe(Infinity)
    expect(encodeCloseness(CLOSENESS_SCALE_M)).toBe(0.5)
  })

  it('six-way: an axis light reads exactly its map; weights sum to one for any unit direction', () => {
    expect(sixWayLight(MAPS, { x: 1, y: 0, z: 0 })).toBe(MAPS.right)
    expect(sixWayLight(MAPS, { x: 0, y: -1, z: 0 })).toBe(MAPS.bottom)
    expect(sixWayLight(MAPS, { x: 0, y: 0, z: 1 })).toBe(MAPS.front)
    const s = Math.SQRT1_2
    expect(sixWayLight(MAPS, { x: s, y: s, z: 0 })).toBeCloseTo((MAPS.right + MAPS.top) / 2, 12)
    const ones = { right: 1, left: 1, top: 1, bottom: 1, back: 1, front: 1 }
    for (const l of [{ x: 0.36, y: -0.48, z: 0.8 }, { x: -0.6, y: 0, z: -0.8 }]) expect(sixWayLight(ones, l)).toBeCloseTo(1, 12)
  })

  it('fire is emissive HDR above the bloom threshold, and black when cold (spec §4.3)', () => {
    expect(fireRamp(0)).toEqual([0, 0, 0])
    const hot = fireRamp(1)
    expect(Math.max(...hot)).toBeGreaterThan(BLOOM_THRESHOLD)
    expect(hot[0]).toBeGreaterThan(hot[1]); expect(hot[1]).toBeGreaterThan(hot[2]) // orange, not white
  })

  it('an fx texel reads the full-resolution pixel at its block center, clamped', () => {
    expect(fxTexelPixel(0, 2, 2560)).toBe(1)
    expect(fxTexelPixel(3, 4, 2560)).toBe(14)
    expect(fxTexelPixel(1279, 2, 2559)).toBe(2558)
  })
})

describe('fx sheets at runtime', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('the fallback is a valid one-frame atlas: emission only in fireball and flame, transparent borders (Review Focus 2)', () => {
    const s = fallbackFxSheets()
    expect(s.fallback).toBe(true)
    expect(() => fxSheetManifestSchema.parse(s.manifest)).not.toThrow()
    expect(s.lightA).toBeInstanceOf(DataArrayTexture)
    const { cellPx, cols } = s.manifest
    const b = (s.lightB as DataArrayTexture).image.data as Uint8Array
    const a = (s.lightA as DataArrayTexture).image.data as Uint8Array
    const w = cols * cellPx
    const centerOf = (cell: number): number => ((Math.floor(cell / cols) * cellPx + cellPx / 2) * w + (cell % cols) * cellPx + cellPx / 2) * 4
    FX_SHEETS.forEach((name, cell) => {
      const glowing = name === 'fireball' || name === 'flame'
      expect(b[centerOf(cell) + 3]! > 0, name).toBe(glowing)
      expect(a[centerOf(cell) + 3]).toBeGreaterThan(100)
    })
    expect(a[3]).toBe(0)
  })

  it('a failed fetch resolves to the fallback with a warning, never a rejection or console.error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error')
    const s = await loadFxSheets({} as WebGPURenderer)
    expect(s.fallback).toBe(true)
    expect(warn).toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('fx materials build', () => {
  it('the particle material blends premultiplied over; the dense one takes the max', async () => {
    const { createFxMaterials, createFxUniforms } = await import('../../src/render/fx/material.js')
    const { CustomBlending, MaxEquation, OneFactor, OneMinusSrcAlphaFactor, DepthTexture } = await import('three')
    const { texture, uniform } = await import('three/tsl')
    const { particle, dense } = createFxMaterials({
      sheets: fallbackFxSheets(), sceneDepth: texture(new DepthTexture(4, 4)) as never,
      near: uniform(0.1) as never, far: uniform(440_000) as never, u: createFxUniforms(), soft: true, shadow: null,
    })
    expect([particle.blending, particle.blendSrc, particle.blendDst]).toEqual([CustomBlending, OneFactor, OneMinusSrcAlphaFactor])
    expect([dense.blending, dense.blendEquation, dense.blendSrc, dense.blendDst]).toEqual([CustomBlending, MaxEquation, OneFactor, OneFactor])
    for (const m of [particle, dense]) { expect(m.depthTest).toBe(false); expect(m.depthWrite).toBe(false); expect(m.transparent).toBe(true) }
  })
})
```

If constructing the materials throws in Node because `aerialPerspective`'s LUT module needs a renderer (`getAtmosphereLuts`), do not delete the case. Mock that one export with `vi.mock('../../src/render/scene/atmosphereShading.js', …)`, returning `vec4(0, 0, 0, 1)`, and say so in the ledger.

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/render/fxShading.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: Implement `shading.ts`:**

```ts
import type { Vec3 } from '../../sim/math/vec3.js'

/** Spec §4.1: "sprites within about 2 m of the eye fade out". */
export const NEAR_FADE_START_M = 0.5
export const NEAR_FADE_END_M = 2.0
/** Soft-particle range: half the sprite, never under half a metre. */
export const SOFT_MIN_M = 0.5
export const SOFT_SIZE_FRACTION = 0.5
/** A fragment this opaque contributes to dense depth (Ruling R9). */
export const DENSE_FRAGMENT_ALPHA = 0.05
/** The clouds stop at fx only where accumulated alpha exceeds this (spec §4.2). */
export const DENSE_ACCUMULATED_ALPHA = 0.5
/** Closeness c = 1 / (1 + viewZ / this): half at 1 km, ~0.01 at 100 km. */
export const CLOSENESS_SCALE_M = 1000
/** Scene-linear radiance of fire at emission 1: ~5x diffuse white under the
 *  noon sun (SUN_ILLUMINANCE 3.6 / pi = 1.15). Estimate; E2 tunes. */
export const FIRE_RADIANCE = 6

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const smoothstep = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
export const nearFade = (viewZ: number): number => smoothstep(NEAR_FADE_START_M, NEAR_FADE_END_M, viewZ)
export const softFade = (sceneViewZ: number, particleViewZ: number, sizeM: number): number =>
  clamp01((sceneViewZ - particleViewZ) / Math.max(sizeM * SOFT_SIZE_FRACTION, SOFT_MIN_M))
export const encodeCloseness = (viewZM: number): number => 1 / (1 + viewZM / CLOSENESS_SCALE_M)
export const decodeCloseness = (c: number): number => (c <= 0 ? Infinity : CLOSENESS_SCALE_M * (1 / c - 1))
export type SixWayMaps = { readonly right: number; readonly left: number; readonly top: number; readonly bottom: number; readonly back: number; readonly front: number }
/** `l`: unit light direction in the particle frame (x right, y up, z toward the camera). */
export function sixWayLight(m: SixWayMaps, l: Vec3): number {
  const p = (x: number): number => (x > 0 ? x * x : 0)
  return p(l.x) * m.right + p(-l.x) * m.left + p(l.y) * m.top + p(-l.y) * m.bottom + p(l.z) * m.front + p(-l.z) * m.back
}
export const fireRamp = (e: number): [number, number, number] => [FIRE_RADIANCE * e, FIRE_RADIANCE * 0.6 * e * e, FIRE_RADIANCE * 0.3 * e ** 4]
/** The full-resolution pixel an fx texel stands for (Ruling R11). */
export const fxTexelPixel = (texel: number, span: number, fullSize: number): number => Math.min(Math.floor((texel + 0.5) * span), fullSize - 1)
```

- [ ] **Step 4: Implement `sheets.ts`:**

```ts
import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { BASIS_TRANSCODER_DIR } from '../terrain/surfaceTextures.js'
import { FX_SHEETS, fxSheetManifestSchema, type FxSheetManifest } from './sheetManifest.js'

export const FX_SHEETS_DIR = `${import.meta.env.BASE_URL}content/fx/`
export type FxSheetTextures = { readonly manifest: FxSheetManifest; readonly lightA: Texture; readonly lightB: Texture; readonly motion: Texture; readonly fallback: boolean }

/** The three flipbook arrays (plan E1 Rulings R7, R8). Never rejects: any
 *  failure warns and returns `fallbackFxSheets()` (Review Focus 2), because
 *  a console error fails every Tier 2 spec and effects are not worth a
 *  failure screen. */
export async function loadFxSheets(renderer: WebGPURenderer): Promise<FxSheetTextures> {
  try {
    const res = await fetch(`${FX_SHEETS_DIR}sheets.json`)
    if (!res.ok) throw new Error(`${FX_SHEETS_DIR}sheets.json: HTTP ${res.status}`)
    const manifest = fxSheetManifestSchema.parse(await res.json())
    const loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_DIR).detectSupport(renderer)
    try {
      const images = [manifest.images.lightA, manifest.images.lightB, manifest.images.motion]
      const [lightA, lightB, motion] = await Promise.all(images.map((f) => loader.loadAsync(FX_SHEETS_DIR + f)))
      for (const [name, t] of [['lightA', lightA], ['lightB', lightB], ['motion', motion]] as const) {
        const depth = (t!.image as { depth?: number }).depth
        if (depth !== manifest.frames) throw new Error(`fx ${name}: ${depth} layers, expected ${manifest.frames}`)
        if (t!.colorSpace === SRGBColorSpace) throw new Error(`fx ${name} is tagged sRGB; lightmaps are linear data`)
        t!.minFilter = LinearMipmapLinearFilter; t!.magFilter = LinearFilter
        t!.name = `fx-${name}`; t!.needsUpdate = true
      }
      return { manifest, lightA: lightA!, lightB: lightB!, motion: motion!, fallback: false }
    } finally {
      loader.dispose()
    }
  } catch (err) {
    console.warn('fx sheets did not load; effects draw procedural blobs instead:', err)
    return fallbackFxSheets()
  }
}

/** A 16 px, one-frame procedural atlas in the same layout: round soft blobs,
 *  evenly lit, emission in the fireball and flame cells only. */
export function fallbackFxSheets(): FxSheetTextures {
  const cellPx = 16, cols = 3, rows = 2, w = cols * cellPx, h = rows * cellPx
  const a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4), m = new Uint8Array(w * h * 4)
  FX_SHEETS.forEach((name, cell) => {
    const glow = name === 'fireball' || name === 'flame'
    for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
      const r = Math.hypot((x + 0.5) / cellPx - 0.5, (y + 0.5) / cellPx - 0.5) / 0.45
      const d = Math.round(255 * Math.max(0, 1 - r) ** 1.5)
      const i = (((Math.floor(cell / cols) * cellPx + y) * w) + (cell % cols) * cellPx + x) * 4
      a.set([153, 153, 191, d], i)
      b.set([115, 89, 153, glow ? d : 0], i)
      m.set([128, 128, 0, 255], i)
    }
  })
  const tex = (data: Uint8Array, name: string): DataArrayTexture => {
    const t = new DataArrayTexture(data, w, h, 1)
    t.format = RGBAFormat; t.type = UnsignedByteType; t.minFilter = LinearFilter; t.magFilter = LinearFilter
    t.generateMipmaps = false; t.name = name; t.needsUpdate = true
    return t
  }
  const manifest = fxSheetManifestSchema.parse({
    version: 1, images: { lightA: 'fallback-a.ktx2', lightB: 'fallback-b.ktx2', motion: 'fallback-m.ktx2' },
    cellPx, cols, rows, frames: 1, motionScale: 0,
    sheets: FX_SHEETS.map((name, cell) => ({ name, cell })), provenance: { generator: 'placeholder', seed: 0 },
  })
  return { manifest, lightA: tex(a, 'fx-fallback-a'), lightB: tex(b, 'fx-fallback-b'), motion: tex(m, 'fx-fallback-m'), fallback: true }
}
```

- [ ] **Step 5: Implement `material.ts`.** Compose plain nodes. **Do not wrap per-call helpers in `Fn`:** a layout-less `Fn` is inlined at every call site, which once caused a ~39 s boot freeze (`docs/clouds.md` §4). Where @types/three 0.186 is narrower than the runtime, use `cloudPass.ts`' `as unknown as Node<…>` idiom, not `any`.

```ts
import { AddEquation, CustomBlending, DoubleSide, MaxEquation, OneFactor, OneMinusSrcAlphaFactor, Vector2, Vector3 } from 'three'
import { NodeMaterial, type Node, type TextureNode, type UniformNode } from 'three/webgpu'
import {
  abs, attribute, clamp, cos, cross, dot, exp, float, floor, fract, int, ivec2, length, max, min, mix, mod, normalize,
  perspectiveDepthToViewZ, positionGeometry, screenCoordinate, select, sin, smoothstep, texture, uniform, varying, vec2, vec3, vec4,
} from 'three/tsl'
import { aerialPerspective } from '../scene/atmosphereShading.js'
import type { CloudShadowHandle } from '../scene/cloudShadow.js'
import { cloudSkylightNode, skyIrradianceDownNode, skyIrradianceUpNode, sunColorNode, sunDirectionNode } from '../scene/lighting.js'
import {
  CLOSENESS_SCALE_M, DENSE_FRAGMENT_ALPHA, FIRE_RADIANCE, NEAR_FADE_END_M, NEAR_FADE_START_M, SOFT_MIN_M, SOFT_SIZE_FRACTION,
} from './shading.js'
import type { FxSheetTextures } from './sheets.js'

/** Written by fxPass.ts every frame it draws; shared by both materials and the composite. */
export type FxUniforms = {
  /** Full-resolution pixels per fx texel (a whole number: 2 or 4). */
  readonly span: UniformNode<number>
  /** Drawing-buffer size minus one, in pixels. */
  readonly fullMax: UniformNode<Vector2>
  readonly camRight: UniformNode<Vector3>
  readonly camUp: UniformNode<Vector3>
  /** The camera's +Z in world space: toward the viewer. */
  readonly camBack: UniformNode<Vector3>
  /** `scene.position` this frame, i.e. minus the eye (Ruling R10). */
  readonly worldOffset: UniformNode<Vector3>
  readonly frameBlend: UniformNode<number>
  readonly mipBias: UniformNode<number>
}
export const createFxUniforms = (): FxUniforms => ({
  span: uniform(2), fullMax: uniform(new Vector2(1, 1)),
  camRight: uniform(new Vector3(1, 0, 0)), camUp: uniform(new Vector3(0, 1, 0)), camBack: uniform(new Vector3(0, 0, 1)),
  worldOffset: uniform(new Vector3()), frameBlend: uniform(1), mipBias: uniform(0),
}) as unknown as FxUniforms

export type FxMaterialInputs = {
  readonly sheets: FxSheetTextures
  readonly sceneDepth: TextureNode
  readonly near: Node<'float'>
  readonly far: Node<'float'>
  readonly u: FxUniforms
  /** false under DEV ?fxSoft=off: a hard depth test instead of the soft fade. */
  readonly soft: boolean
  readonly shadow: CloudShadowHandle | null
}

function particleNodes(i: FxMaterialInputs) {
  const { u } = i
  const m = i.sheets.manifest
  const posSize = attribute('fxPosSize', 'vec4'), anim = attribute('fxAnim', 'vec4'), tint = attribute('fxTint', 'vec4'), vel = attribute('fxVel', 'vec4')
  const corner = positionGeometry.xy
  const size = posSize.w
  const c = cos(anim.x), s = sin(anim.x)
  const right = u.camRight.mul(c).add(u.camUp.mul(s))
  const up = u.camUp.mul(c).sub(u.camRight.mul(s))
  const centerRel = posSize.xyz.add(u.worldOffset)
  const toCam = normalize(centerRel.negate())
  const axis = normalize(vel.xyz.sub(toCam.mul(dot(vel.xyz, toCam))).add(u.camUp.mul(1e-4)))
  const side = normalize(cross(axis, toCam))
  const isStreak = anim.w.lessThan(0)
  const spriteOffset = right.mul(corner.x).add(up.mul(corner.y)).mul(size.mul(0.5))
  const streakOffset = side.mul(corner.x.mul(size.mul(0.5))).add(axis.mul(corner.y.mul(max(vel.w, size).mul(0.5))))
  const position = posSize.xyz.add(select(isStreak, streakOffset, spriteOffset))
  const rel = position.add(u.worldOffset)
  const L = normalize(sunDirectionNode)
  const l = vec3(dot(L, right), dot(L, up), dot(L, u.camBack))
  const lp = max(l, vec3(0)), ln = max(l.negate(), vec3(0))
  const cols = float(m.cols), rows = float(m.rows)
  const cell = max(anim.w, 0)
  return {
    position,
    quadUv: varying(vec2(corner.x.mul(0.5).add(0.5), float(0.5).sub(corner.y.mul(0.5)))),
    cellOrigin: varying(vec2(mod(cell, cols), floor(cell.div(cols))).div(vec2(cols, rows))),
    lPos: varying(lp.mul(lp)), lNeg: varying(ln.mul(ln)),
    sunT: varying(i.shadow ? i.shadow.node(rel as unknown as Node<'vec3'>, 'eyeRelative') : float(1)),
    ap: varying(aerialPerspective(rel as unknown as Node<'vec3'>, length(rel) as unknown as Node<'float'>)),
    viewZ: varying(dot(rel, u.camBack).negate()),
    alpha: varying(anim.z), frame: varying(anim.y), streak: varying(select(isStreak, float(1), float(0))),
    tint: varying(tint), size: varying(size),
  }
}

function shade(i: FxMaterialInputs, v: ReturnType<typeof particleNodes>) {
  const m = i.sheets.manifest
  const cellSize = vec2(1 / m.cols, 1 / m.rows)
  const inset = vec2(0.5 / (m.cols * m.cellPx), 0.5 / (m.rows * m.cellPx))
  const lo = v.cellOrigin.add(inset), hi = v.cellOrigin.add(cellSize).sub(inset)
  const atlasUv = v.cellOrigin.add(v.quadUv.mul(cellSize))
  const blending = i.u.frameBlend.greaterThan(0.5)
  const last = float(m.frames - 1)
  const f0 = min(select(blending, floor(v.frame), floor(v.frame.add(0.5))), last)
  const f1 = min(f0.add(1), last)
  const w = select(blending, fract(v.frame), float(0))
  const lightA = texture(i.sheets.lightA), lightB = texture(i.sheets.lightB), motion = texture(i.sheets.motion)
  // Every sample unconditional: textureSample must stay in uniform control flow (docs/clouds.md §4).
  const flow = (layer: Node<'float'>) => motion.sample(atlasUv).depth(int(layer)).rg.mul(2).sub(1).mul(m.motionScale).mul(cellSize)
  const uvA = clamp(atlasUv.sub(flow(f0).mul(w)), lo, hi)
  const uvB = clamp(atlasUv.add(flow(f1).mul(float(1).sub(w))), lo, hi)
  const at = (t: TextureNode, uv: Node<'vec2'>, layer: Node<'float'>) => t.sample(uv).depth(int(layer)).bias(i.u.mipBias)
  const A = mix(at(lightA, uvA, f0), at(lightA, uvB, f1), w)
  const B = mix(at(lightB, uvA, f0), at(lightB, uvB, f1), w)
  const skyUp = skyIrradianceUpNode.add(cloudSkylightNode)
  const direct = dot(v.lPos, vec3(A.r, A.b, B.b)).add(dot(v.lNeg, vec3(A.g, B.r, B.g)))
  const ambient = skyUp.mul(A.b).add(skyIrradianceDownNode.mul(B.r)).add(skyUp.add(skyIrradianceDownNode).mul(0.125).mul(A.r.add(A.g).add(B.g).add(B.b)))
  const e = B.a.mul(v.tint.a)
  const fire = vec3(e, e.mul(e).mul(0.6), e.mul(e).mul(e).mul(e).mul(0.3)).mul(FIRE_RADIANCE)
  const spriteRad = v.tint.rgb.mul(1 / Math.PI).mul(sunColorNode.mul(v.sunT).mul(direct).add(ambient)).add(fire)
  const sx = v.quadUv.x.mul(2).sub(1), sy = v.quadUv.y.mul(2).sub(1)
  const streakA = exp(sx.mul(sx).mul(-4)).mul(float(1).sub(abs(sy)))
  const streakRad = v.tint.rgb.mul(1 / Math.PI).mul(sunColorNode.mul(v.sunT).mul(0.5).add(skyUp.add(skyIrradianceDownNode).mul(0.5)))
    .add(v.tint.rgb.mul(v.tint.a).mul(FIRE_RADIANCE))
  const isStreak = v.streak.greaterThan(0.5)
  // Soft particles and the depth test in one term (Ruling R11): the fx pass has no depth buffer.
  const full = ivec2(min(floor(floor(screenCoordinate.xy).add(0.5).mul(i.u.span)), i.u.fullMax))
  const sceneZ = perspectiveDepthToViewZ(i.sceneDepth.load(full).x, i.near, i.far).negate()
  const soft = i.soft
    ? clamp(sceneZ.sub(v.viewZ).div(max(v.size.mul(SOFT_SIZE_FRACTION), SOFT_MIN_M)), 0, 1)
    : select(sceneZ.greaterThan(v.viewZ), float(1), float(0))
  const a = select(isStreak, streakA, A.a).mul(v.alpha).mul(soft).mul(smoothstep(NEAR_FADE_START_M, NEAR_FADE_END_M, v.viewZ))
  const radiance = select(isStreak, streakRad, spriteRad)
  return { a, color: radiance.mul(v.ap.a).add(v.ap.rgb) }
}

function base(material: NodeMaterial): NodeMaterial {
  material.transparent = true
  material.depthTest = false
  material.depthWrite = false
  material.side = DoubleSide
  material.blending = CustomBlending
  return material
}

export function createFxMaterials(i: FxMaterialInputs): { readonly particle: NodeMaterial; readonly dense: NodeMaterial } {
  const pv = particleNodes(i), ps = shade(i, pv)
  const particle = base(new NodeMaterial())
  particle.name = 'FxParticle'
  particle.positionNode = pv.position
  particle.fragmentNode = vec4(ps.color.mul(ps.a), ps.a)
  particle.blendEquation = AddEquation
  particle.blendSrc = OneFactor; particle.blendDst = OneMinusSrcAlphaFactor
  particle.blendSrcAlpha = OneFactor; particle.blendDstAlpha = OneMinusSrcAlphaFactor

  const dv = particleNodes(i), ds = shade(i, dv)
  const dense = base(new NodeMaterial())
  dense.name = 'FxDense'
  dense.positionNode = dv.position
  const closeness = float(1).div(float(1).add(dv.viewZ.div(CLOSENESS_SCALE_M)))
  dense.fragmentNode = vec4(select(ds.a.greaterThan(DENSE_FRAGMENT_ALPHA), closeness, float(0)), 0, 0, 1)
  // WebGPU requires factor 'one' for min/max operations.
  dense.blendEquation = MaxEquation; dense.blendEquationAlpha = MaxEquation
  dense.blendSrc = OneFactor; dense.blendDst = OneFactor; dense.blendSrcAlpha = OneFactor; dense.blendDstAlpha = OneFactor
  return { particle, dense }
}
```

The dense material builds the full shading graph only for its alpha. The WGSL compiler drops the unused color math, so what is left is 4–6 samples. If Task 12 shows the dense draw costing more than 0.2 ms, the lever is a `shadeAlpha` that samples light A's alpha only. That lever is not a design change.

- [ ] **Step 6: Run the test.** `npx vitest run tests/render/fxShading.test.ts --maxWorkers=2; echo rc=$?` → PASS, `rc=0`.

- [ ] **Step 7: Typecheck, lint.** `npx tsc --noEmit; echo rc=$?`, `npx eslint src/render/fx tests/render/fxShading.test.ts --max-warnings 0; echo rc=$?` → `rc=0` each.

- [ ] **Step 8: Commit.**

```bash
git add src/render/fx/shading.ts src/render/fx/sheets.ts src/render/fx/material.ts tests/render/fxShading.test.ts
git commit -m "E1 Task 7: fx sheets at runtime with a procedural fallback; six-way lit, emissive, soft and near-faded particle materials"
```

---
### Task 8: `fxPass` and the cloud march limit (spec §4.1, §4.2)

**Files:**
- Create: `src/render/fx/fxPass.ts`
- Modify: `src/render/scene/cloudPass.ts` (constructor `:285-292`, `minViewZAt` `:317-334`, composite `z` `:658-659`, `createCloudPass` `:769-781`)
- Modify: `docs/clouds.md` (**same commit**, repo `CLAUDE.md` item 6)
- Test: `tests/render/fxPass.test.ts`

**Interfaces:**
- Consumes: `createFxMaterials`, `createFxUniforms`, `FxUniforms` (Task 7), `FxSheetTextures` (Task 7), `createInstanceArrays`, `FxInstanceArrays` (Task 5), `FxTier`, `FX_MAX_CAPACITY` (Task 5), `DENSE_ACCUMULATED_ALPHA`, `CLOSENESS_SCALE_M` (Task 7).
- Produces:
  - `export function fxSpan(scale: number): number`: 2 at ½, 4 at ¼. It throws unless `1/scale` is a whole number.
  - `export function fxTargetSize(width: number, height: number, scale: number): { width: number; height: number }`
  - `export type FxCloudLimit = { denseViewZAt(fullPixel: Node<'vec2'>): Node<'float'> }`. It returns view-Z in metres, or `FOG_DISTANCE_M` where there is no dense fx.
  - `export type FxPass = { readonly composite: Node<'vec4'>; readonly cloudLimit: FxCloudLimit | null; readonly instances: FxInstanceArrays; setTier(tier: FxTier): void; setWorldOffset(offset: Vec3): void; setCount(count: number): void; count(): number; dispose(): void }`
  - `export function createFxPass(o: { camera: PerspectiveCamera; sceneColor: Node<'vec4'>; sceneDepth: Node<'float'>; sheets: FxSheetTextures; shadow: CloudShadowHandle | null; soft: boolean; cloudLimit: boolean; tier: FxTier }): FxPass`
  - `createCloudPass` accepts `fxLimit?: FxCloudLimit | null`. With it absent or `null`, **every cloud node graph is built exactly as today** (a JS-level branch, not a shader one), so clouds with `?fx=off` are unchanged.

**Ordering, and why no call in `main.ts` sets it.** The cloud composite reads `sceneColor`. When fx is on, that is the fx composite, which is this `TempNode`, so three builds this node before the cloud node. `Node.build` adds a node to the sequential update list after its children (`cloudPass.ts:24-30` records the mechanism). This node's `updateBefore` therefore runs before the cloud pass's, and the cloud march reads a dense depth written this frame. Task 11's cloud-ordering capture is the check that this holds on the GPU.

- [ ] **Step 1: Write the failing test** `tests/render/fxPass.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { createFramePipeline } from '../../src/render/pipeline.js'
import { createFxPass, fxSpan, fxTargetSize } from '../../src/render/fx/fxPass.js'
import { fallbackFxSheets } from '../../src/render/fx/sheets.js'
import { FX_MAX_CAPACITY, FX_TIERS } from '../../src/render/fx/tiers.js'

describe('fxPass (effects design §4.1)', () => {
  it('spans whole pixels per texel at the tier scales, and refuses any other', () => {
    expect(fxSpan(FX_TIERS.high.resolutionScale)).toBe(2)
    expect(fxSpan(FX_TIERS.low.resolutionScale)).toBe(4)
    expect(() => fxSpan(0.3)).toThrow()
  })

  it('sizes its targets by ceiling, never below one texel', () => {
    expect(fxTargetSize(2560, 1440, 0.5)).toEqual({ width: 1280, height: 720 })
    expect(fxTargetSize(2561, 1441, 0.25)).toEqual({ width: 641, height: 361 })
    expect(fxTargetSize(1, 1, 0.25)).toEqual({ width: 1, height: 1 })
  })

  it('builds over a frame pipeline, exposes max-capacity instance arrays, a cloud limit, and a live count', () => {
    const camera = new PerspectiveCamera()
    const p = createFramePipeline({} as WebGPURenderer, new Scene(), camera)
    const make = (cloudLimit: boolean) => createFxPass({ camera, sceneColor: p.sceneColor, sceneDepth: p.sceneDepth, sheets: fallbackFxSheets(), shadow: null, soft: true, cloudLimit, tier: FX_TIERS.high })
    const fx = make(true)
    expect(fx.composite).toBeDefined()
    expect(fx.instances.posSize.length).toBe(FX_MAX_CAPACITY * 4)
    expect(fx.cloudLimit).not.toBeNull()
    expect(make(false).cloudLimit).toBeNull()
    expect(fx.count()).toBe(0)
    fx.setCount(37)
    expect(fx.count()).toBe(37)
    fx.setTier(FX_TIERS.low)
    fx.dispose()
  })
})
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/render/fxPass.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: Implement** `src/render/fx/fxPass.ts`:

```ts
import {
  DynamicDrawUsage, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NearestFilter, PlaneGeometry,
  RGBAFormat, RedFormat, RenderTarget, Scene, Vector2, type PerspectiveCamera,
} from 'three'
import { NodeUpdateType, RendererUtils, TempNode, type Node, type NodeBuilder, type NodeFrame, type TextureNode, type WebGPURenderer } from 'three/webgpu'
import { Fn, If, abs, clamp, float, floor, fract, ivec2, max, min, perspectiveDepthToViewZ, reference, screenCoordinate, select, texture, uniform, vec2, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import { FOG_DISTANCE_M } from '../horizon.js'
import type { CloudShadowHandle } from '../scene/cloudShadow.js'
import { createFxMaterials, createFxUniforms, type FxUniforms } from './material.js'
import { CLOSENESS_SCALE_M, DENSE_ACCUMULATED_ALPHA } from './shading.js'
import type { FxSheetTextures } from './sheets.js'
import { createInstanceArrays, type FxInstanceArrays } from './system.js'
import { FX_MAX_CAPACITY, type FxTier } from './tiers.js'

/**
 * The effects pass (ordnance-and-effects design §4.1), in cloudPass.ts's
 * TempNode shape. `updateBefore` draws the particle batch twice into
 * reduced-resolution targets -- premultiplied color, then max-blended dense
 * depth (plan E1 Ruling R9) -- reading the scene pass's depth for the soft
 * fade. `setup` returns the depth-aware composite over the scene color,
 * which main.ts hands the cloud pass as ITS scene color: effects composite
 * before clouds (§4.2), and the clouds' march stops at dense fx via
 * `cloudLimit`. With no live particle nothing renders and the composite
 * skips its taps (Ruling R12).
 */
export function fxSpan(scale: number): number {
  const span = 1 / scale
  if (Math.abs(span - Math.round(span)) > 1e-9) throw new Error(`fx resolution scale ${scale} must be 1/n`)
  return Math.round(span)
}
export function fxTargetSize(width: number, height: number, scale: number): { width: number; height: number } {
  return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) }
}

export type FxCloudLimit = { denseViewZAt(fullPixel: Node<'vec2'>): Node<'float'> }
export type FxPass = {
  readonly composite: Node<'vec4'>
  readonly cloudLimit: FxCloudLimit | null
  /** The system writes these (`FxSystem.writeInstances`); `setCount` uploads them. */
  readonly instances: FxInstanceArrays
  setTier(tier: FxTier): void
  /** `scene.position` this frame (minus the eye): the fx scene mirrors it (Ruling R10). */
  setWorldOffset(offset: Vec3): void
  setCount(count: number): void
  count(): number
  dispose(): void
}

/** cloudPass.ts's composite weight constant, the same rule (Ruling R11). */
const DEPTH_EPSILON = 0.01
let rendererState: ReturnType<typeof RendererUtils.resetRendererState> | undefined
const drawingBuffer = new Vector2()
const clampTexel = (at: Node<'ivec2'>, hi: Node<'ivec2'>): Node<'ivec2'> =>
  (clamp as unknown as (x: Node<'ivec2'>, lo: Node<'ivec2'>, hi: Node<'ivec2'>) => Node<'ivec2'>)(at, ivec2(0, 0), hi)
const target = (format: typeof RGBAFormat | typeof RedFormat): RenderTarget => {
  const t = new RenderTarget(1, 1, { type: HalfFloatType, format, depthBuffer: false })
  t.texture.minFilter = NearestFilter; t.texture.magFilter = NearestFilter
  return t
}

class FxPassNode extends TempNode<'vec4'> {
  readonly color = target(RGBAFormat)
  readonly dense = target(RedFormat)
  readonly scene = new Scene()
  readonly denseScene = new Scene()
  readonly geometry = new InstancedBufferGeometry()
  readonly instances = createInstanceArrays(FX_MAX_CAPACITY)
  readonly u: FxUniforms = createFxUniforms()
  readonly active = uniform(0)
  readonly lowMax = uniform(new Vector2(0, 0))
  readonly colorTex = texture(this.color.texture) as unknown as TextureNode
  readonly denseTex = texture(this.dense.texture) as unknown as TextureNode
  private readonly attributes: InstancedBufferAttribute[]
  private readonly materials: ReturnType<typeof createFxMaterials>
  scale = 0.5
  live = 0

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly sceneColor: Node<'vec4'>,
    private readonly sceneDepth: TextureNode,
    private readonly near: Node<'float'>,
    private readonly far: Node<'float'>,
    sheets: FxSheetTextures, shadow: CloudShadowHandle | null, soft: boolean,
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME
    const quad = new PlaneGeometry(2, 2)
    this.geometry.setAttribute('position', quad.getAttribute('position'))
    this.geometry.setIndex(quad.getIndex())
    const { posSize, anim, tint, vel } = this.instances
    this.attributes = ([['fxPosSize', posSize], ['fxAnim', anim], ['fxTint', tint], ['fxVel', vel]] as const).map(([name, array]) => {
      const a = new InstancedBufferAttribute(array, 4)
      a.setUsage(DynamicDrawUsage)
      this.geometry.setAttribute(name, a)
      return a
    })
    this.geometry.instanceCount = 0
    this.materials = createFxMaterials({ sheets, sceneDepth, near, far, u: this.u, soft, shadow })
    for (const [scene, material] of [[this.scene, this.materials.particle], [this.denseScene, this.materials.dense]] as const) {
      const mesh = new Mesh(this.geometry, material)
      // Instances are scattered over kilometres (terrain/mesh.ts's reason, verbatim).
      mesh.frustumCulled = false
      scene.add(mesh)
    }
  }

  setCount(n: number): void {
    this.live = n
    this.geometry.instanceCount = n
    for (const a of this.attributes) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true }
    this.active.value = n > 0 ? 1 : 0
  }

  override updateBefore(frame: NodeFrame): undefined {
    if (this.live === 0) return undefined // Ruling R12
    const renderer = frame.renderer as unknown as WebGPURenderer
    const { x: width, y: height } = renderer.getDrawingBufferSize(drawingBuffer)
    const low = fxTargetSize(width, height, this.scale)
    this.color.setSize(low.width, low.height)
    this.dense.setSize(low.width, low.height)
    this.u.span.value = fxSpan(this.scale)
    this.u.fullMax.value.set(width - 1, height - 1)
    this.lowMax.value.set(low.width - 1, low.height - 1)
    this.u.camRight.value.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize()
    this.u.camUp.value.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize()
    this.u.camBack.value.setFromMatrixColumn(this.camera.matrixWorld, 2).normalize()
    rendererState = RendererUtils.resetRendererState(renderer, rendererState as ReturnType<typeof RendererUtils.resetRendererState>)
    // resetRendererState clears to alpha 1; both targets must start empty.
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(this.color)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(this.dense)
    renderer.render(this.denseScene, this.camera)
    RendererUtils.restoreRendererState(renderer, rendererState)
    return undefined
  }

  /** Depth-aware upsample (Ruling R11): four bilinear taps, each weighted by
   *  how well the depth its texel was drawn against matches this pixel's. */
  override setup(_builder: NodeBuilder): Node<'vec4'> {
    const composite = Fn(() => {
      const pixel = screenCoordinate.xy
      const fx = vec4(0, 0, 0, 0).toVar()
      If(this.active.greaterThan(0.5), () => {
        const viewZ = (at: Node<'ivec2'>) => min(perspectiveDepthToViewZ(this.sceneDepth.load(at).x, this.near, this.far).negate(), float(FOG_DISTANCE_M))
        const z = viewZ(ivec2(floor(pixel))).toVar()
        const uv = pixel.div(this.u.span).sub(0.5).toVar()
        const f = fract(uv).toVar()
        const i0 = ivec2(floor(uv)).toVar()
        const lowMax = ivec2(this.lowMax).toVar()
        const fullMax = ivec2(this.u.fullMax).toVar()
        const sum = vec4(0, 0, 0, 0).toVar()
        const weights = float(0).toVar()
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const at = clampTexel(i0.add(ivec2(ox, oy)), lowMax).toVar()
          const rep = clampTexel(ivec2(floor(vec2(at).add(0.5).mul(this.u.span))), fullMax)
          const rel = abs(z.sub(viewZ(rep))).div(max(z, 1e-3))
          const wx = ox === 0 ? float(1).sub(f.x) : f.x
          const wy = oy === 0 ? float(1).sub(f.y) : f.y
          const w = wx.mul(wy).div(rel.add(DEPTH_EPSILON)).toVar()
          sum.addAssign(this.colorTex.load(at).mul(w))
          weights.addAssign(w)
        }
        fx.assign(sum.div(max(weights, 1e-12)))
      })
      return vec4(this.sceneColor.rgb.mul(float(1).sub(fx.a)).add(fx.rgb), this.sceneColor.a)
    })
    return composite() as unknown as Node<'vec4'>
  }

  readonly limit: FxCloudLimit = {
    denseViewZAt: (fullPixel) => {
      const t = clampTexel(ivec2(floor(fullPixel.div(this.u.span))), ivec2(this.lowMax))
      const a = this.colorTex.load(t).a
      const c = this.denseTex.load(t).x
      const dense = this.active.greaterThan(0.5).and(a.greaterThan(DENSE_ACCUMULATED_ALPHA)).and(c.greaterThan(0))
      return select(dense, float(CLOSENESS_SCALE_M).mul(float(1).div(max(c, 1e-6)).sub(1)), float(FOG_DISTANCE_M)) as unknown as Node<'float'>
    },
  }

  override dispose(): void {
    this.color.dispose(); this.dense.dispose(); this.geometry.dispose()
    this.materials.particle.dispose(); this.materials.dense.dispose()
    super.dispose()
  }
}

export function createFxPass(o: {
  camera: PerspectiveCamera; sceneColor: Node<'vec4'>; sceneDepth: Node<'float'>; sheets: FxSheetTextures
  shadow: CloudShadowHandle | null; soft: boolean; cloudLimit: boolean; tier: FxTier
}): FxPass {
  const node = new FxPassNode(
    o.camera, o.sceneColor, o.sceneDepth as unknown as TextureNode,
    reference('near', 'float', o.camera) as unknown as Node<'float'>,
    reference('far', 'float', o.camera) as unknown as Node<'float'>,
    o.sheets, o.shadow, o.soft,
  )
  const pass: FxPass = {
    composite: node as unknown as Node<'vec4'>,
    cloudLimit: o.cloudLimit ? node.limit : null,
    instances: node.instances,
    setTier(tier) {
      node.scale = tier.resolutionScale
      node.u.frameBlend.value = tier.frameBlend ? 1 : 0
      node.u.mipBias.value = tier.topMip ? 0 : 1
    },
    setWorldOffset(offset) {
      node.scene.position.set(offset.x, offset.y, offset.z)
      node.denseScene.position.set(offset.x, offset.y, offset.z)
      node.u.worldOffset.value.set(offset.x, offset.y, offset.z)
    },
    setCount(n) { node.setCount(n) },
    count: () => node.live,
    dispose() { node.dispose() },
  }
  pass.setTier(o.tier)
  return pass
}
```

- [ ] **Step 4: The cloud march limit.** In `src/render/scene/cloudPass.ts`:

1. `import type { FxCloudLimit } from '../fx/fxPass.js'` (type-only: no runtime cycle).
2. `CloudPassNode`'s constructor gains a last parameter, `private readonly fxLimit: FxCloudLimit | null`.
3. `minViewZAt` (`:317-334`) ends with:

```ts
      // Ordnance-and-effects design §4.2: the march also stops at dense
      // effects, exactly as it stops at opaque surfaces. A JS branch, so a
      // pass built without effects compiles the graph it always did.
      return (this.fxLimit === null
        ? minViewZ
        : min(minViewZ, this.fxLimit.denseViewZAt(cell.add(0.5).mul(this.cellsF) as unknown as Node<'vec2'>))) as unknown as Node<'float'>
```

   It replaces the current `return minViewZ as unknown as Node<'float'>`. Because the constructor assigns `this.fxLimit` before any closure runs, confirm that the parameter-property order makes it defined when `minViewZAt` is first *called*. It is only called inside the `Fn` bodies, which build later.
4. In the composite (`:659`), right after `const z = …toVar()`:

```ts
      // The composite must match the march's own stop (§4.2), or a fireball's
      // texels mismatch every tap and fall to the 4x4 search.
      if (this.fxLimit !== null) z.assign(min(z, this.fxLimit.denseViewZAt(pixel as unknown as Node<'vec2'>)))
```

5. `createCloudPass`'s options gain `fxLimit?: FxCloudLimit | null`. It passes `opts.fxLimit ?? null` as the new last constructor argument.

- [ ] **Step 5: `docs/clouds.md`, in the same commit.**
   - §1 "Rendering": add a bullet: `- the march stops at the nearer of the scene depth and the effects' dense depth (where effects alpha > 0.5), so a fireball in front of a cloud keeps its pixels (E1, \`src/render/fx/fxPass.ts\`'s \`cloudLimit\`);`
   - §2 table: add the row `| Effects dense depth, the cloud march limit's second input | \`src/render/fx/fxPass.ts\` (\`FxCloudLimit\`) |`. The DEV probes row gains `` `?fx=off\|low\|medium\|high`, `?fxCloudLimit=off` ``.
   - §3: add `### 3.10 Effects in front of clouds (E1, <date>)`, after §3.9 (the boot freeze, merged at `2d77083`). It is three sentences: what changed (`minViewZAt` and the composite take `min(…, denseViewZAt)`), why (spec §4.2, air kills against cloud), and that without `fxLimit` the graphs are unchanged. The Task 11 capture numbers go in at Task 13.
   - The header's "Last reconciled" line is left alone. Task 13 reconciles it.

- [ ] **Step 6: Run the tests.**
Run: `npx vitest run tests/render/fxPass.test.ts tests/render/cloudPass.test.ts tests/render/pipeline.test.ts --maxWorkers=2; echo rc=$?` → PASS, `rc=0`.

- [ ] **Step 7: Typecheck, lint, depcruise.** `npx tsc --noEmit; echo rc=$?`, `npx eslint src/render tests/render --max-warnings 0; echo rc=$?`, `npm run depcruise; echo rc=$?` → `rc=0` each. `no-circular` must stay clean. If it reports `cloudPass → fxPass → …`, the import was not `import type`.

- [ ] **Step 8: Commit** (the cloud change and its doc together):

```bash
git add src/render/fx/fxPass.ts src/render/scene/cloudPass.ts docs/clouds.md tests/render/fxPass.test.ts
git commit -m "E1 Task 8: fxPass TempNode (reduced-res color + dense depth, depth-aware composite); cloud march stops at dense effects"
```

**Split point.** Tasks 1–8 leave `main.ts` running as today, apart from Task 6's quality plumbing. If the run must pause, pause here and record it in the ledger.

---
### Task 9: Wire the engine into the frame (`main.ts`, anchors, DEV knobs, diagnostics)

**Files:**
- Create: `src/render/fx/query.ts`, `src/render/fx/stress.ts`
- Modify: `src/render/scene/ship.ts` (`ShipView` `:26`, `finishView` `:53-80`; add `smokeOriginWorld`), `src/render/scene/airfield.ts` (`AirfieldHandle`, add `smokeAnchors`), `src/render/main.ts`, `src/render/diagnostics.ts` (type `Ww2Diagnostics` `:33`)
- Test: `tests/render/fxQuery.test.ts`, `tests/render/fxStress.test.ts`; additions to `tests/render/ship.test.ts` and `tests/render/airfield.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces:
  - `export type FxQuery = { readonly tier: QualityTierName | 'off' | undefined; readonly soft: boolean; readonly cloudLimit: boolean }` and `export function fxQueryFrom(search: string): FxQuery`. DEV `?fx=off|low|medium|high`, `?fxSoft=on|off`, `?fxCloudLimit=on|off`. It throws on a typo, as `cloudTierFromQuery` does.
  - `export const FX_STRESS_NAMES = ['budget', 'bomb-land', 'bomb-water', 'air-kill', 'smoke-base', 'cloud-fireball', 'eye-smoke', 'none'] as const`, `export type FxStressName`, `export type FxStressScene = { readonly triggers: readonly FxTrigger[]; readonly sustained: readonly FxSustained[]; readonly roundsHz: number; readonly center: Vec3; readonly anchors: readonly { readonly name: string; readonly position: Vec3 }[] }`, `export const STRESS_RANGE_M = 300`, `export function stressScene(name: FxStressName, eye: Vec3, look: Vec3, groundAt: (x: number, z: number) => number): FxStressScene`, `export function stressRounds(center: Vec3, k: number): readonly FxTrigger[]`
  - `ShipView.smokeOrigin: Object3D` and `export function smokeOriginWorld(view: ShipView, worldOffset: Vec3): Vec3`
  - `AirfieldHandle.smokeAnchors: ReadonlyMap<string, Vec3>`
  - `__ww2.fx(): { tier: string; capacity: number; live: number; drawn: number; sheetsFallback: boolean; cpuMs: number }` and `__ww2.fxStress(name: FxStressName): { anchors: readonly { name: string; x: number; y: number }[] }` (CSS pixels)

**Old and new effects coexist until Task 10.** That is deliberate: Task 10 is the deletion a reviewer approves separately. Both draw during Task 9, and nothing tests their overlap.

- [ ] **Step 1: Write the failing tests.** `tests/render/fxQuery.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fxQueryFrom } from '../../src/render/fx/query.js'

describe('?fx DEV knobs', () => {
  it('defaults to everything on and no forced tier', () => {
    expect(fxQueryFrom('')).toEqual({ tier: undefined, soft: true, cloudLimit: true })
  })
  it('parses each knob', () => {
    expect(fxQueryFrom('?fx=off&fxSoft=off&fxCloudLimit=off')).toEqual({ tier: 'off', soft: false, cloudLimit: false })
    expect(fxQueryFrom('?fx=low').tier).toBe('low')
  })
  it('throws on a typo rather than silently measuring the default', () => {
    expect(() => fxQueryFrom('?fx=hi')).toThrow(/fx/)
    expect(() => fxQueryFrom('?fxSoft=no')).toThrow(/fxSoft/)
  })
})
```

`tests/render/fxStress.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FX_STRESS_NAMES, STRESS_RANGE_M, stressRounds, stressScene } from '../../src/render/fx/stress.js'
import { v3 } from '../../src/sim/math/vec3.js'

const eye = v3(1000, 40, 2000), look = v3(0.8, -0.1, 0.6), ground = (): number => 5

describe('fx stress scenes (spec §4.5)', () => {
  it('the budget scene is the spec list: 8 bombs, 32 rockets, a burning ship, a collapse, one air kill, gunfire at 20 Hz', () => {
    const s = stressScene('budget', eye, look, ground)
    const n = (prefix: string): number => s.triggers.filter((t) => t.recipe.startsWith(prefix)).length
    expect(n('bomb.')).toBe(8)
    expect(n('rocket.')).toBe(32)
    expect(s.triggers.filter((t) => t.recipe.startsWith('rocket.water')).length).toBe(16)
    expect(n('kill.air')).toBe(1)
    expect(n('structure.collapse')).toBe(1)
    expect(s.sustained.map((x) => x.recipe).sort()).toEqual(['kill.air', 'ship.fire', 'structure.collapse'])
    expect(s.roundsHz).toBe(20)
    const h = Math.hypot(s.center.x - eye.x, s.center.z - eye.z)
    expect(h).toBeCloseTo(STRESS_RANGE_M, 6)
    expect(s.center.y).toBe(5)
  })
  it('gunfire alternates land and water, deterministically', () => {
    expect(stressRounds(v3(0, 5, 0), 3)).toEqual(stressRounds(v3(0, 5, 0), 3))
    expect(stressRounds(v3(0, 5, 0), 3).map((t) => t.recipe)).toEqual(['round.land', 'round.water'])
  })
  it('every name builds; none is empty', () => {
    for (const name of FX_STRESS_NAMES) expect(() => stressScene(name, eye, look, ground)).not.toThrow()
    const none = stressScene('none', eye, look, ground)
    expect([none.triggers.length, none.sustained.length, none.roundsHz]).toEqual([0, 0, 0])
  })
})
```

Append to `tests/render/ship.test.ts`'s `describe` (and import `smokeOriginWorld`, `Scene`):

```ts
  it('exposes its smoke origin in world metres, whatever the floating origin, sinking with the hull (E1 Ruling R13)', () => {
    const view = createShipMesh(loadShipSpec('fletcher-dd'))
    const scene = new Scene()
    scene.add(view.root)
    view.root.position.set(1200, 0, -800)
    const at = (offset: { x: number; y: number; z: number }) => { scene.position.set(offset.x, offset.y, offset.z); return smokeOriginWorld(view, offset) }
    const a = at({ x: 0, y: 0, z: 0 }), b = at({ x: -1200, y: -30, z: 800 })
    expect(b.x).toBeCloseTo(a.x, 6); expect(b.y).toBeCloseTo(a.y, 6); expect(b.z).toBeCloseTo(a.z, 6)
    expect(a.y).toBeGreaterThan(5)
    view.setDamage(0, 0.5)
    expect(at({ x: 0, y: 0, z: 0 }).y).toBeLessThan(a.y)
  })
```

Append to `tests/render/airfield.test.ts`'s collapse `describe` (import `heightAt` from `../../src/sim/world/terrain.js`):

```ts
  it('publishes one smoke anchor per content building, above its ground (E1 Ruling R13)', () => {
    const tacloban = loadAirfield('tacloban')
    const { smokeAnchors } = createAirfield(field, tacloban)
    expect([...smokeAnchors.keys()].sort()).toEqual(tacloban.buildings.map((b) => b.id).sort())
    for (const p of smokeAnchors.values()) expect(p.y).toBeGreaterThanOrEqual(heightAt(field, p.x, p.z))
  })
```

In `tests/render/bootQuality.test.ts`'s `keeps the DEV query overrides winning over a saved setting` (`:248-258`), add the fx pins beside the cloud ones:

```ts
    expect(source).toContain("let fxTier: QualityTierName | 'off' = fxQuery.tier ?? quality.current().fx")
    expect(source).toMatch(/const applyFxTier[\s\S]{0,400}?if \(fxQuery\.tier !== undefined \|\| fxTier === name\) return/)
```

- [ ] **Step 2: Run and watch them fail.** `npx vitest run tests/render/fxQuery.test.ts tests/render/fxStress.test.ts tests/render/ship.test.ts tests/render/airfield.test.ts tests/render/bootQuality.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: Implement `query.ts`:**

```ts
import type { QualityTierName } from '../quality.js'

export type FxQuery = { readonly tier: QualityTierName | 'off' | undefined; readonly soft: boolean; readonly cloudLimit: boolean }
const TIERS = ['off', 'low', 'medium', 'high'] as const

/** DEV knobs (E1): `?fx=` forces the tier (`off` builds no pass, Ruling
 *  R18); `?fxSoft=off` swaps the soft fade for a hard depth test (the
 *  soft-edge control); `?fxCloudLimit=off` stops feeding dense depth to the
 *  clouds (the cloud-ordering control). A typo throws. */
export function fxQueryFrom(search: string): FxQuery {
  const q = new URLSearchParams(search)
  const raw = q.get('fx')
  if (raw !== null && !(TIERS as readonly string[]).includes(raw)) throw new Error(`fx: ${JSON.stringify(raw)} is not ${TIERS.join(', ')}`)
  const flag = (name: string): boolean => {
    const v = q.get(name)
    if (v === null || v === 'on') return true
    if (v === 'off') return false
    throw new Error(`${name}: ${JSON.stringify(v)} is not on or off`)
  }
  return { tier: (raw ?? undefined) as FxQuery['tier'], soft: flag('fxSoft'), cloudLimit: flag('fxCloudLimit') }
}
```

- [ ] **Step 4: Implement `stress.ts`:**

```ts
import { v3, ZERO, type Vec3 } from '../../sim/math/vec3.js'
import type { FxSustained, FxTrigger } from './events.js'

/** Named effects scenes for Tier 2 (`__ww2.fxStress`, DEV only). `budget`
 *  is spec §4.5's stress scene verbatim; the others are one effect each
 *  for the captures. Render-side injection, not sim events: what is
 *  measured is what the renderer draws. */
export const FX_STRESS_NAMES = ['budget', 'bomb-land', 'bomb-water', 'air-kill', 'smoke-base', 'cloud-fireball', 'eye-smoke', 'none'] as const
export type FxStressName = (typeof FX_STRESS_NAMES)[number]
export type FxStressScene = {
  readonly triggers: readonly FxTrigger[]
  readonly sustained: readonly FxSustained[]
  readonly roundsHz: number
  readonly center: Vec3
  readonly anchors: readonly { readonly name: string; readonly position: Vec3 }[]
}
/** Spec §4.5: "about 300 m from the target". */
export const STRESS_RANGE_M = 300

export function stressScene(name: FxStressName, eye: Vec3, look: Vec3, groundAt: (x: number, z: number) => number): FxStressScene {
  const h = Math.hypot(look.x, look.z) || 1
  const fwd = { x: look.x / h, z: look.z / h }, right = { x: -fwd.z, z: fwd.x }
  const ground = (along: number, across: number): Vec3 => {
    const x = eye.x + fwd.x * along + right.x * across, z = eye.z + fwd.z * along + right.z * across
    return v3(x, groundAt(x, z), z)
  }
  const len = Math.hypot(look.x, look.y, look.z) || 1
  const ahead = (d: number): Vec3 => v3(eye.x + (look.x / len) * d, eye.y + (look.y / len) * d, eye.z + (look.z / len) * d)
  const center = ground(STRESS_RANGE_M, 0)
  const t = (recipe: FxTrigger['recipe'], position: Vec3): FxTrigger => ({ recipe, position, velocity: ZERO })
  const s = (key: string, recipe: FxSustained['recipe'], position: Vec3): FxSustained => ({ key: `stress:${key}`, recipe, intensity: 1, position, velocity: ZERO })
  const empty = { triggers: [], sustained: [], roundsHz: 0, center, anchors: [] }
  switch (name) {
    case 'budget': {
      const kill = v3(center.x, center.y + 150, center.z)
      const bombs = Array.from({ length: 8 }, (_, k) => t('bomb.land', ground(STRESS_RANGE_M + (k >> 2) * 40 - 20, (k % 4) * 40 - 60)))
      const rockets = Array.from({ length: 32 }, (_, k) => t(k % 2 === 0 ? 'rocket.land' : 'rocket.water', ground(STRESS_RANGE_M + ((k >> 3) - 1.5) * 25, (k % 8) * 20 - 70)))
      return {
        triggers: [...bombs, ...rockets, t('structure.collapse', ground(STRESS_RANGE_M, -90)), t('kill.air', kill)],
        sustained: [s('ship', 'ship.fire', ground(STRESS_RANGE_M, 90)), s('structure', 'structure.collapse', ground(STRESS_RANGE_M, -90)), s('kill', 'kill.air', kill)],
        roundsHz: 20, center, anchors: [{ name: 'center', position: center }, { name: 'kill', position: kill }],
      }
    }
    case 'bomb-land': return { ...empty, triggers: [t('bomb.land', center)], anchors: [{ name: 'center', position: center }] }
    case 'bomb-water': return { ...empty, triggers: [t('bomb.water', center)], anchors: [{ name: 'center', position: center }] }
    case 'air-kill': { const p = ahead(400); return { ...empty, triggers: [t('kill.air', p)], sustained: [s('kill', 'kill.air', p)], anchors: [{ name: 'kill', position: p }] } }
    case 'smoke-base': return { ...empty, sustained: [s('base', 'structure.collapse', center)], anchors: [{ name: 'base', position: center }] }
    case 'cloud-fireball': { const p = ahead(800); return { ...empty, triggers: [t('kill.air', p)], anchors: [{ name: 'fireball', position: p }] } }
    case 'eye-smoke': return { ...empty, sustained: [s('plume', 'ship.fire', ahead(5)), s('column', 'structure.collapse', v3(eye.x, eye.y - 3, eye.z))], anchors: [] }
    case 'none': return empty
  }
}

/** The k-th gunfire burst: one round into land and one into water, spread
 *  over 60 m around `center` by a fixed low-discrepancy sequence. */
export function stressRounds(center: Vec3, k: number): readonly FxTrigger[] {
  const a = (k * 0.618034) % 1, b = (k * 0.414214) % 1
  return [
    { recipe: 'round.land', position: v3(center.x + (a - 0.5) * 60, center.y, center.z + (b - 0.5) * 60), velocity: ZERO },
    { recipe: 'round.water', position: v3(center.x + (b - 0.5) * 60, center.y, center.z + (a - 0.5) * 60 + 40), velocity: ZERO },
  ]
}
```

- [ ] **Step 5: Anchors.** In `ship.ts`, `ShipView` gains the following, with the matching `Object3D` and `Vec3` imports:

```ts
  /** An empty marker at the stack/SmokeOrigin, child of the hull group, so
   *  it sinks and lists with the hull. fx reads it every frame (E1 R13). */
  readonly smokeOrigin: Object3D
```

In `finishView`, next to the existing smoke (Task 10 removes that smoke), add:

```ts
  const smokeOrigin = new Object3D()
  smokeOrigin.name = 'smoke origin'
  smokeOrigin.position.set(smokeAt.x, smokeAt.y, smokeAt.z)
  hullGroup.add(smokeOrigin)
```

Return `smokeOrigin` in the view. Then add the exported helper:

```ts
/** The view's smoke origin in sim world metres. `worldOffset` must be what
 *  `scene.position` holds this frame (main.ts sets it before posing ships). */
export function smokeOriginWorld(view: ShipView, worldOffset: { readonly x: number; readonly y: number; readonly z: number }): Vec3 {
  view.smokeOrigin.updateWorldMatrix(true, false)
  const e = view.smokeOrigin.matrixWorld.elements
  return { x: e[12]! - worldOffset.x, y: e[13]! - worldOffset.y, z: e[14]! - worldOffset.z }
}
```

In `airfield.ts`, `AirfieldHandle` gains `readonly smokeAnchors: ReadonlyMap<string, Vec3>`. The building loop records `anchors.set(b.id, { x, y: y + 2.5, z })`, the same point today's column starts from (`airfield.ts:189`). `finish()` returns `smokeAnchors: anchors`.

- [ ] **Step 6: `main.ts`.** Every insertion is named by what it follows. Search for the quoted text rather than trusting a line number.

1. Imports (beside the cloud imports near `:31-32`):

```ts
import { FX_CATALOG } from './fx/catalog.js'
import { NO_FX_MEMORY, nextFxEvents, type FxMemory } from './fx/events.js'
import { createFxPass, type FxPass } from './fx/fxPass.js'
import { fxQueryFrom } from './fx/query.js'
import { sheetLayout } from './fx/sheetManifest.js'
import { loadFxSheets, type FxSheetTextures } from './fx/sheets.js'
import { stressRounds, stressScene, type FxStressName, type FxStressScene } from './fx/stress.js'
import { createFxSystem, fxDtSeconds, type FxSystem } from './fx/system.js'
import { FX_TIERS } from './fx/tiers.js'
```

   Also add `smokeOriginWorld` to the `./scene/ship.js` import (or import it), plus `heightAt`, `SEA_LEVEL_M` and `Vector2`/`Vector3` if they are not already imported.
2. State, right after `let cloudPass: CloudPass | null = null` (`:1193`). Task 6's `let fxTier` line changes to read the query:

```ts
  const fxQuery = import.meta.env.DEV ? fxQueryFrom(location.search) : { tier: undefined, soft: true, cloudLimit: true } as const
  let fxSystem: FxSystem | null = null
  let fxPass: FxPass | null = null
  let fxSheets: FxSheetTextures | null = null
  let fxMemory: FxMemory = NO_FX_MEMORY
  let fxStress: { readonly scene: FxStressScene; readonly startedMs: number; rounds: number } | null = null
  let fxCpuMs = 0
```

   Task 6's declaration becomes `let fxTier: QualityTierName | 'off' = fxQuery.tier ?? quality.current().fx`. `fxQuery` must be declared above it. Move the `const fxQuery` line up next to `forcedCloudTier` (`:1050`).
3. `applyFxTier` (Task 6) becomes:

```ts
  /** `?fx=` holds the tier, including `off` (no pass at all, Ruling R18). */
  const applyFxTier = (name: QualityTierName): void => {
    if (fxQuery.tier !== undefined || fxTier === name) return
    fxTier = name
    fxSystem?.setCapacity(FX_TIERS[name].capacity)
    fxPass?.setTier(FX_TIERS[name])
  }
```

4. Start the sheet download early. Next to `skyNoiseLoading` (search `const skyNoiseLoading`), add `const fxSheetsLoading = fxQuery.tier === 'off' ? null : loadFxSheets(renderer)`. `loadFxSheets` never rejects.
5. Build the pass. Right after the `forcedSharpen` block and before the cloud pass comment (`:1313`):

```ts
  // E1 (ordnance-and-effects design §3-4): one pool and one reduced-resolution
  // pass for every effect, composited BEFORE the clouds -- the cloud pass
  // takes this composite as its scene color, and stops its march at dense
  // effects (§4.2). `?fx=off` builds neither (Ruling R18).
  if (fxTier !== 'off' && fxSheetsLoading !== null) {
    fxSheets = await fxSheetsLoading
    fxSystem = createFxSystem({ capacity: FX_TIERS[fxTier].capacity, seed: 1944, catalog: FX_CATALOG, layout: sheetLayout(fxSheets.manifest) })
    fxPass = createFxPass({
      camera, sceneColor: framePipeline.sceneColor, sceneDepth: framePipeline.sceneDepth, sheets: fxSheets,
      shadow: shadow.enabled ? shadow : null, soft: fxQuery.soft, cloudLimit: fxQuery.cloudLimit, tier: FX_TIERS[fxTier],
    })
  }
```

   Check the "no `await` between `frame`'s first assignment and `resetFlightUi`" argument in the comment at `:1526-1545`. This `await` comes before `frame = initialFrameStateFor(...)` (`:1335`), so the argument still holds. Say so in the ledger.
6. The cloud pass takes the fx composite and the limit (`:1322-1329`):

```ts
  cloudPass = cloudTier === 'off' || !clouds.enabled ? null : createCloudPass({
    clouds, camera, sceneColor: fxPass?.composite ?? framePipeline.sceneColor, sceneDepth: framePipeline.sceneDepth,
    fxLimit: fxPass?.cloudLimit ?? null,
  })
  if (cloudPass !== null && cloudTier !== 'off') {
    // ...the existing three lines, unchanged
  } else if (fxPass !== null) {
    framePipeline.setOutput(fxPass.composite)
  }
```

7. The per-frame update, right after `for (const h of airfieldHandles) h.update(frameMs / 1000)`:

```ts
    // E1: every effect reads World.combat through one pure edge detector
    // (fx/events.ts), one seeded pool (fx/system.ts) and one pass (fx/fxPass.ts).
    if (fxSystem !== null && fxPass !== null) {
      const started = performance.now()
      const shipSmokeOrigins = new Map(current.world.ships.map((s, i) => [s.id, smokeOriginWorld(shipHandles[i]!, worldOffset)] as const))
      const structureAnchors = new Map(airfieldHandles.flatMap((h) => [...h.smokeAnchors]))
      const events = nextFxEvents(fxMemory, {
        tick: current.world.tick, combat: current.world.combat, aircraft: current.world.aircraft, poses: current.poses,
        shipSmokeOrigins, structureAnchors,
      })
      fxMemory = events.memory
      for (const t of events.triggers) fxSystem.trigger(t.recipe, t.position, t.velocity)
      if (fxStress !== null) {
        const due = Math.floor(((now - fxStress.startedMs) / 1000) * fxStress.scene.roundsHz)
        for (; fxStress.rounds < due; fxStress.rounds++) for (const t of stressRounds(fxStress.scene.center, fxStress.rounds)) fxSystem.trigger(t.recipe, t.position, t.velocity)
      }
      fxSystem.setSustained(fxStress === null ? events.sustained : [...events.sustained, ...fxStress.scene.sustained])
      fxSystem.step(fxDtSeconds(frameMs / 1000, current.paused, current.timeScale))
      fxPass.setWorldOffset(worldOffset)
      fxPass.setCount(fxSystem.writeInstances(current.eye.position, fxPass.instances))
      fxCpuMs = performance.now() - started
    }
```

   `airfieldHandles`, `shipHandles`, `worldOffset` and `now` are all in scope there (`:1886`, `:1897`, `:1749`). Confirm each by reading. If `now` is named differently in the loop, use that name.
8. `resetFlightUi` (`:1546`) gains, after `hitFlashes.hide()`:

```ts
    // E1: a new life starts with no effects and no remembered edges
    // (Review Focus 3); events.ts's restart rule would also forget the
    // edges, but only the pool can drop what is already drawn.
    fxSystem?.clear()
    fxMemory = NO_FX_MEMORY
    fxStress = null
```

9. The DEV stress hook. Declare it after `resetFlightUi`:

```ts
  const startFxStress = (name: FxStressName): { anchors: { name: string; x: number; y: number }[] } => {
    const f = frame!
    const eye = f.eye.position
    const look = new Vector3()
    camera.getWorldDirection(look)
    const terrainField = f.world.terrain
    const groundAt = (x: number, z: number): number => terrainField === null ? SEA_LEVEL_M : Math.max(SEA_LEVEL_M, heightAt(terrainField, x, z))
    const scene = stressScene(name, eye, { x: look.x, y: look.y, z: look.z }, groundAt)
    fxSystem?.clear()
    for (const t of scene.triggers) fxSystem?.trigger(t.recipe, t.position, t.velocity)
    fxStress = name === 'none' ? null : { scene, startedMs: performance.now(), rounds: 0 }
    const size = renderer.getSize(new Vector2())
    return {
      anchors: scene.anchors.map((a) => {
        const p = new Vector3(a.position.x - eye.x, a.position.y - eye.y, a.position.z - eye.z).project(camera)
        return { name: a.name, x: ((p.x + 1) / 2) * size.x, y: ((1 - p.y) / 2) * size.y }
      }),
    }
  }
```

10. Diagnostics. In the `__ww2` object, after `terrainSurface:` (`:911`):

```ts
      // E1: the effects pool, for the Tier 2 captures and budget.
      fx: () => ({
        tier: fxTier, capacity: fxSystem?.capacity() ?? 0, live: fxSystem?.live() ?? 0,
        drawn: fxPass?.count() ?? 0, sheetsFallback: fxSheets?.fallback ?? false, cpuMs: fxCpuMs,
      }),
      fxStress: (name) => startFxStress(name),
```

    It closes over `startFxStress`, which is declared later, as `clouds()` closes over `cloudPass`. It runs only after boot. In `diagnostics.ts`, add both to `Ww2Diagnostics`, with doc comments, importing `FxStressName` as a type:

```ts
  /** E1: the effects pool and pass. `tier` is 'off' under ?fx=off; `cpuMs` is
   *  the last frame's events + step + instance write, in milliseconds. */
  readonly fx: () => { readonly tier: string; readonly capacity: number; readonly live: number; readonly drawn: number; readonly sheetsFallback: boolean; readonly cpuMs: number }
  /** E1 DEV: clear the pool and inject a named scene relative to the eye
   *  (fx/stress.ts). Anchors are CSS pixels of the named world points. */
  readonly fxStress: (name: FxStressName) => { readonly anchors: readonly { readonly name: string; readonly x: number; readonly y: number }[] }
```

- [ ] **Step 7: Run the tests.** `npx vitest run tests/render/fxQuery.test.ts tests/render/fxStress.test.ts tests/render/ship.test.ts tests/render/airfield.test.ts tests/render/shipModels.test.ts tests/render/scenarioEntities.test.ts tests/render/bootQuality.test.ts --maxWorkers=2; echo rc=$?` → PASS, `rc=0`.

- [ ] **Step 8: Typecheck, lint, depcruise.** `npx tsc --noEmit; echo rc=$?`, `npx eslint src/render tests/render --max-warnings 0; echo rc=$?`, `npm run depcruise; echo rc=$?` → `rc=0` each.

- [ ] **Step 9: Smoke check in a browser before committing.** Follow the Task 11 Step 1 dev-server setup: slot `ww2airsim-3`, and `curl` must print 200. Then run only the existing adapter spec: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/adapter.spec.ts --retries=2; echo rc=$?` → `rc=0`. It fails on any WebGPU validation error or console error at boot, which is the cheapest proof the new graphs compile. A black frame with no error is the "graph failed to build" trap (`docs/clouds.md` §4). Take one `page.screenshot` at `/` and read it.

- [ ] **Step 10: Commit.**

```bash
git add src/render/fx/query.ts src/render/fx/stress.ts src/render/scene/ship.ts src/render/scene/airfield.ts src/render/main.ts src/render/diagnostics.ts tests/render/fxQuery.test.ts tests/render/fxStress.test.ts tests/render/ship.test.ts tests/render/airfield.test.ts tests/render/bootQuality.test.ts
git commit -m "E1 Task 9: wire the effects engine -- events, pool and pass every frame, clouds after effects, ?fx knobs, __ww2.fx/fxStress"
```

---

### Task 10: Migrate and delete the six old effects (spec §3.5)

**Files:**
- Delete: `src/render/scene/impactEffect.ts`, `src/render/scene/hitFlash.ts`, `src/render/scene/smoke.ts`, `tests/render/impactEffect.test.ts`
- Modify: `src/render/ordnance.ts` (**deletions only**, see the O1 constraint), `src/render/scene/airfield.ts`, `src/render/scene/ship.ts`, `src/render/scenarioEntities.ts`, `src/render/main.ts`, `src/render/scene/tracers.ts:70` (a comment naming `impactEffect.ts`)
- Modify tests: `tests/render/combatEffects.test.ts`, `tests/render/ordnance.test.ts`, `tests/render/airfield.test.ts`, `tests/render/ship.test.ts`, `tests/render/scenarioEntities.test.ts`
- Create: `tests/architecture/fxMigration.test.ts`

**Interfaces:**
- Produces: `OrdnanceHandle = { readonly object: Object3D; update(projectiles: readonly Projectile[]): void }`, `AirfieldHandle` without `update`, `ScenarioEntities` without `smokes`, `ShipView` without the engine-smoke child.

- [ ] **Step 1: Write the failing guard** `tests/architecture/fxMigration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
})

describe('the six old effects stay deleted (ordnance-and-effects design §3.5)', () => {
  it('their files are gone', () => {
    for (const f of ['src/render/scene/impactEffect.ts', 'src/render/scene/hitFlash.ts', 'src/render/scene/smoke.ts']) {
      expect(existsSync(join(ROOT, f)), f).toBe(false)
    }
  })
  it('nothing under src/render builds one again', () => {
    const gone = ['createImpactEffect', 'createHitFlashes', 'nextHitFlashes', 'createEngineSmoke', 'createSmokeColumn', 'nextOrdnanceImpacts', 'spawnImpact']
    const hits = walk(join(ROOT, 'src/render')).flatMap((p) => gone.filter((g) => readFileSync(p, 'utf8').includes(g)).map((g) => `${p}: ${g}`))
    expect(hits).toEqual([])
  })
  it('ordnance.ts keeps only the stores in flight', () => {
    const src = readFileSync(join(ROOT, 'src/render/ordnance.ts'), 'utf8')
    expect(src).toContain('ordnanceInstances')
    expect(src).not.toContain('PlaneGeometry')
  })
})
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tests/architecture/fxMigration.test.ts --maxWorkers=2; echo rc=$?` → FAIL, `rc=1`.

- [ ] **Step 3: `ordnance.ts`, deletions only.**
   - Remove the `effectScaleAndOpacity` import (`:8`) and `PlaneGeometry`/`Mesh` from the three import if nothing else uses them.
   - Header doc: remove the impact-pool bullet (`:23-27`). Add one line: `Impacts are drawn by src/render/fx (E1): the sim reports them (World.combat.impacts).`
   - Remove `SMOKE_CAPACITY` (`:31`), `IMPACT_LIFETIME_S` (`:44-45`), and `ImpactAppearance`, `impactAppearance`, `createSmokeColumn`, `OrdnanceImpactEvent`, `OrdnanceMemory`, `NO_ORDNANCE_MEMORY` and `nextOrdnanceImpacts` (`:90-181`).
   - In `OrdnanceHandle`, `update` becomes `update(projectiles: readonly Projectile[]): void` with its doc cut to the first sentence. Remove `updateEffects` and `spawnImpact`.
   - In `createOrdnance`, remove the impact pool (`:237-252`), the eye-facing loop in `update` (`:259-266`), `updateEffects` and `spawnImpact` (`:268-295`).
   - **Do not touch** `makePool`, the three `InstancedMesh` pools, `apply`, `ordnanceInstances`, `flameInstances` or `ROCKET_BURN_S`.

- [ ] **Step 4: `airfield.ts`.** Remove the `createSmokeColumn` import (`:5`), `COLLAPSE_SMOKE_LIFETIME_S` and its doc (`:7-12`; the 60 s lives in `events.ts` as `COLLAPSE_SMOKE_S`), and the `smoke` member of the `structures` map. Remove the smoke creation and its `group.add` (`:187-195`), `sync`'s two smoke lines, and `update` (from the handle type and from `finish()`). Rewrite the comment block at `:150-163` to name only `intact` and `collapsed`, and say that the collapse's dust and smoke are E1's `structure.collapse` recipe, anchored at `smokeAnchors`.

- [ ] **Step 5: `ship.ts`.** Remove the `createEngineSmoke` import (`:3`), the smoke creation in `finishView` (`:55-60`), `smoke.set` in `setDamage` (`:71`), and the smoke lines in `dispose` (`:76-77`). Rewrite `finishView`'s doc and the comment at `:166-170`: the fire is E1's `ship.fire`, rising from `smokeOrigin`. `probeShipSurface`'s filter (`:220`) becomes `c.name !== 'smoke origin'`.

- [ ] **Step 6: `scenarioEntities.ts`.** Remove the `createEngineSmoke` import (`:4`), `smokes` from `ScenarioEntities` and its doc (`:13-24`), the smoke-per-airframe loop (`:90-94`), `disposeMeshTree(previous.smokes[i]!.object)` (`:74`), and the doc sentence about smoke trails (`:45-46`). Return `{ airframes, shipHandles, player }`.

- [ ] **Step 7: `main.ts`.**
   - Remove imports `:27` (`createImpactEffect`) and `:44` (`hitFlash.js`). `:45` becomes `import { createOrdnance } from './ordnance.js'`.
   - Remove `hitFlashes` (`:1251-1252`), `ordnanceMemory` and `flashMemory` (`:1259-1260`), and `impactEffect` (`:1417-1418`). Fix the comments that name them (`:1240-1258`, `:1526-1527`, and the `smokes` mentions at `:294` and `:313`).
   - `resetFlightUi`: remove `impactEffect.hide()` and `hitFlashes.hide()`.
   - Frame loop:
     - the destructure at `:1886` drops `smokes`
     - remove the flash block and the smoke loop (`:1976-1982`), replacing the comment at `:1970-1973` with one line: `// Plan 6: the readout and tracers are stateless views of World.combat; every effect is E1's (fx/, below).`
     - `ordnance.update(current.world.combat.projectiles)` (`:2003`), remove `:2004-2007`, and cut the impact-pool sentence from the comment at `:1983-1988`
     - remove `h.update(...)` for airfields (`:2022`)
     - in the impact block, remove `impactEffect.object.position.set(...)`, `impactEffect.fire(...)` and the long comment above them (`:2030-2040`); keep the debrief logic
     - remove `:2096-2098`
   - Search the whole file for `smokes`, `hitFlash`, `impactEffect`, `ordnanceMemory`, `flashMemory` and `updateEffects`. Every hit must be gone.

- [ ] **Step 8: `tracers.ts:70`.** It reads "…`MeshBasicMaterial`, unlit, for the same reason `impactEffect.ts` uses it:". Change it to state the reason itself: a tracer is a light source, so lighting must not touch it. Read the surrounding lines and keep their meaning.

- [ ] **Step 9: Tests.**
   - Delete `tests/render/impactEffect.test.ts`.
   - `combatEffects.test.ts`: delete the `hit flashes …` and `engine smoke …` describes (`:59-end`) and their imports. That edge logic is `fxEvents.test.ts`'s now. Keep the tracer describe.
   - `ordnance.test.ts`: delete `spawnImpact …` and `the impact pool …` (`:81-110`) and the `nextOrdnanceImpacts` and `createSmokeColumn` describes (`:112-end`). The `update()` case calls `update(projectiles)`. Fix the imports and the describe title at `:41` (`…plus an impact pool` → nothing).
   - `airfield.test.ts`: remove the three `getObjectByName('smoke')` assertions (`:114`, `:126`, `:176`/`:183`) and the whole `update() fades …` case (`:139-148`). Update the comment block at `:97-104`.
   - `ship.test.ts`: the case at `:97-106` becomes `setDamage draws no smoke of its own: the fire is E1's, from smokeOrigin`. It asserts `root.getObjectByName('ship smoke')` is `undefined`, and that `setDamage(1, 0)` does not throw.
   - `scenarioEntities.test.ts`: drop `smokes` from `:57-62`'s expectations and title. In `:182-191`, drop the smoke spies and "and its smoke" from the title.

- [ ] **Step 10: Run everything touched.**
Run: `npx vitest run tests/architecture tests/render/combatEffects.test.ts tests/render/ordnance.test.ts tests/render/airfield.test.ts tests/render/ship.test.ts tests/render/scenarioEntities.test.ts tests/render/shipModels.test.ts tests/render/fx*.test.ts --maxWorkers=2; echo rc=$?` → PASS, `rc=0`.
Then `grep -rn "impactEffect\|hitFlash\|createEngineSmoke\|createSmokeColumn\|nextOrdnanceImpacts\|scene/smoke" src tests --include=*.ts`. Expected: only `tests/architecture/fxMigration.test.ts`'s own strings.

- [ ] **Step 11: Typecheck, lint, depcruise.** `npx tsc --noEmit; echo rc=$?`, `npm run lint; echo rc=$?`, `npm run depcruise; echo rc=$?` → `rc=0` each. Lint is safe to run whole on nexus: it runs no tests.

- [ ] **Step 12: Commit.**

```bash
git rm src/render/scene/impactEffect.ts src/render/scene/hitFlash.ts src/render/scene/smoke.ts tests/render/impactEffect.test.ts
git add src/render/ordnance.ts src/render/scene/airfield.ts src/render/scene/ship.ts src/render/scenarioEntities.ts src/render/main.ts src/render/scene/tracers.ts tests/render/combatEffects.test.ts tests/render/ordnance.test.ts tests/render/airfield.test.ts tests/render/ship.test.ts tests/render/scenarioEntities.test.ts tests/architecture/fxMigration.test.ts
git commit -m "E1 Task 10: delete the six old effects -- impactEffect, hit-flash quads, engine smoke, the ordnance impact pool, smoke columns; ship and airfield fire and smoke come from fx"
```

---
### Task 11: Tier 2 — behavior, captures, soft edge, cloud ordering (spec §7 Tier 2)

**Files:**
- Create: `tests/e2e/fxPixels.ts`, `tests/e2e/fx.spec.ts`
- Create (captures, committed with the handoff in Task 13): `docs/handoff/<date>-e1-effects-shots/`
- Local scratch, **never committed**: `vite.config.ts` (`TUNNEL_HOST` `:122`, `server.port` `:129`)

- [ ] **Step 1: Bring up the worktree's dev-server slot** (repo `CLAUDE.md`, "Two more dev-server slots"). In the worktree's `vite.config.ts`, set `TUNNEL_HOST = 'ww2airsim-3.windomlane.org'` and `port: 5174`. Then:

```bash
cd /home/mark/projects/ww2airsim/.claude/worktrees/e1-effects
WW2AIRSIM_TUNNEL=1 npx vite --port 5174 > .superpowers/e1/vite.log 2>&1 &
curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-3.windomlane.org/   # must print 200
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
git status --short   # vite.config.ts is the ONLY scratch change; stage by name from here on
```

Record in the ledger that the slot is in use by E1. If `curl` is not 200, read `.superpowers/e1/vite.log` before anything else.

- [ ] **Step 2: Pixel helpers** `tests/e2e/fxPixels.ts`. They are pure, and they decode screenshots with `sharp` (already a devDependency). The metrics are **color classes counted in a window around an anchor**, not frame diffs, because a flying camera changes every pixel between two shots:

```ts
import sharp from 'sharp'

export type Rgba = { readonly data: Uint8Array; readonly width: number; readonly height: number }
export async function decode(png: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), width: info.width, height: info.height }
}
const px = (img: Rgba, x: number, y: number): [number, number, number] => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]
}
export const luma = (img: Rgba, x: number, y: number): number => { const [r, g, b] = px(img, x, y); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
/** Pixels within `radius` of (cx, cy) that pass `test`. */
export function count(img: Rgba, cx: number, cy: number, radius: number, test: (r: number, g: number, b: number) => boolean): number {
  let n = 0
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(img.height, cy + radius); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(img.width, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue
      const [r, g, b] = px(img, x, y)
      if (test(r, g, b)) n++
    }
  }
  return n
}
/** Fire after AgX: bright and clearly warmer than the sky or the sand. */
export const warm = (r: number, _g: number, b: number): boolean => r >= 200 && r - b >= 60
/** Spray and the water column: near-white. */
export const white = (r: number, g: number, b: number): boolean => 0.2126 * r + 0.7152 * g + 0.0722 * b >= 190
/** The 90th-percentile, over columns x0..x1, of each column's largest
 *  adjacent-row luma step between rows y0..y1: "a single-row step" (spec §7). */
export function rowStep(img: Rgba, x0: number, x1: number, y0: number, y1: number): number {
  const steps: number[] = []
  for (let x = x0; x <= x1; x++) {
    let worst = 0
    for (let y = y0; y < y1; y++) worst = Math.max(worst, Math.abs(luma(img, x, y + 1) - luma(img, x, y)))
    steps.push(worst)
  }
  steps.sort((a, b) => a - b)
  return steps[Math.floor(steps.length * 0.9)] ?? 0
}
```

- [ ] **Step 3: The spec** `tests/e2e/fx.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { debriefDialog, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'
import { count, decode, rowStep, warm, white, type Rgba } from './fxPixels.js'
import type { FxStressName } from '../../src/render/fx/stress.js'

/** Effects engine, reference GPU (ordnance-and-effects design §7, Tier 2).
 *  Captures go to FX_SHOTS_DIR (Task 13 commits them with the handoff). */
const SHOTS = process.env.FX_SHOTS_DIR ?? 'test-results/fx-shots'
test.setTimeout(180_000)
const consoleErrors: string[] = []
test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.setViewportSize({ width: 2560, height: 1440 })
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

const fx = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.fx())
const stress = (page: Page, name: FxStressName) => page.evaluate((n) => (window as DiagWindow).__ww2!.fxStress(n), name)
const validation = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
const viewUrl = (name: string): string => VIEWS.find((v) => v.name === name)!.url
async function shot(page: Page, name: string): Promise<Rgba> {
  const png = await page.screenshot()
  mkdirSync(SHOTS, { recursive: true })
  writeFileSync(join(SHOTS, `${name}.png`), png)
  return decode(png)
}
/** Load, settle, shoot, inject `name`, wait, shoot. The anchor is `anchor`'s screen point. */
async function inject(page: Page, url: string, name: FxStressName, waitMs: number, label: string, anchor: string) {
  await page.goto(url)
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  const before = await shot(page, `${label}-before`)
  const { anchors } = await stress(page, name)
  const a = anchors.find((x) => x.name === anchor)!
  await page.waitForTimeout(waitMs)
  const after = await shot(page, label)
  return { before, after, a }
}

test('boots with the real sheets at the high tier and no validation errors', async ({ page }) => {
  await page.goto('/')
  await waitForTerrain(page)
  expect(await fx(page)).toMatchObject({ tier: 'high', capacity: 4096, sheetsFallback: false })
  expect(await validation(page)).toEqual([])
})

test('a bomb on land draws fire at its point (spec §7)', async ({ page }) => {
  const { before, after, a } = await inject(page, '/', 'bomb-land', 600, 'bomb-land', 'center')
  const was = count(before, a.x, a.y, 250, warm), now = count(after, a.x, a.y, 250, warm)
  console.log(`FX bomb-land warm px: before ${was}, after ${now}, live ${(await fx(page)).live}`)
  expect(now - was).toBeGreaterThan(500)
})

test('a bomb on water raises a white column at its point (spec §7)', async ({ page }) => {
  // contact.spec.ts's open-sea spawn, 120 m up.
  const { before, after, a } = await inject(page, spawnUrl({ x: 0, y: 120, z: 0 }), 'bomb-water', 1500, 'bomb-water', 'center')
  const was = count(before, a.x, a.y - 120, 280, white), now = count(after, a.x, a.y - 120, 280, white)
  console.log(`FX bomb-water white px: before ${was}, after ${now}`)
  expect(now).toBeGreaterThan(3 * was + 1500)
})

test('an air kill draws a fireball in the air (spec §7)', async ({ page }) => {
  const { before, after, a } = await inject(page, viewUrl('low-land-600'), 'air-kill', 500, 'air-kill', 'kill')
  const was = count(before, a.x, a.y, 200, warm), now = count(after, a.x, a.y, 200, warm)
  console.log(`FX air-kill warm px: before ${was}, after ${now}`)
  expect(now - was).toBeGreaterThan(300)
})

test('soft edge: no single-row luminance step where smoke meets the ground (spec §7)', async ({ page }) => {
  const measure = async (url: string, label: string): Promise<number> => {
    const { after, a } = await inject(page, url, 'smoke-base', 8000, label, 'base')
    return rowStep(after, Math.round(a.x - 40), Math.round(a.x + 40), Math.round(a.y - 60), Math.round(a.y + 20))
  }
  const soft = await measure('/', 'smoke-base-soft')
  const hard = await measure('/?fxSoft=off', 'smoke-base-hard')
  console.log(`FX soft edge: row step p90 soft ${soft.toFixed(1)}, hard ${hard.toFixed(1)} (8-bit luma)`)
  expect(soft).toBeLessThan(0.6 * hard)
})

test('cloud ordering: a fireball in front of a cloud keeps its pixels (spec §4.2, §7)', async ({ page }) => {
  const warmAt = async (url: string, label: string): Promise<number> => {
    const { after, a } = await inject(page, url, 'cloud-fireball', 400, label, 'fireball')
    return count(after, a.x, a.y, 160, warm)
  }
  const photo = viewUrl('photo')
  const limited = await warmAt(photo, 'cloud-fireball')
  const unlimited = await warmAt(withParams(photo, { fxCloudLimit: 'off' }), 'cloud-fireball-nolimit')
  const clear = await warmAt(withParams(photo, { cloudTier: 'off' }), 'cloud-fireball-clearsky')
  console.log(`FX cloud ordering warm px: limited ${limited}, no limit ${unlimited}, clear sky ${clear}`)
  expect(limited).toBeGreaterThanOrEqual(0.8 * clear)
  expect(unlimited).toBeLessThan(limited) // the control: without the limit the cloud eats the fireball
})

test('the sheets failing to load still boots, and effects fall back to blobs (Review Focus 2)', async ({ page }) => {
  await page.route('**/content/fx/**', (r) => r.abort())
  const { before, after, a } = await inject(page, '/', 'bomb-land', 600, 'fallback-bomb-land', 'center')
  expect((await fx(page)).sheetsFallback).toBe(true)
  expect(count(after, a.x, a.y, 250, warm) - count(before, a.x, a.y, 250, warm)).toBeGreaterThan(200)
  expect(await validation(page)).toEqual([])
})

test('a crash into the sea fires crash.water, and Restart clears every effect (Rulings R5, Review Focus 3)', async ({ page }) => {
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  await page.keyboard.down('ArrowUp')
  await debriefDialog(page).waitFor({ timeout: 20_000 })
  await page.keyboard.up('ArrowUp')
  await expect.poll(async () => (await fx(page)).live, { timeout: 2000 }).toBeGreaterThan(20)
  await shot(page, 'crash-water')
  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(debriefDialog(page)).toBeHidden()
  await expect.poll(async () => (await fx(page)).live, { timeout: 2000 }).toBe(0)
})
```

- [ ] **Step 4: Run it on the reference GPU.**

```bash
FX_SHOTS_DIR=docs/handoff/$(date +%F)-e1-effects-shots PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org \
  npx playwright test tests/e2e/fx.spec.ts --retries=2; echo rc=$?
```

Expected: `rc=0`. **Open every PNG in the shots directory with the Read tool before trusting a pass.** Write one line per capture in the ledger saying what it shows. Look specifically for:
- the water column the right way up (tall, base at the sea). The placeholder is bottom-heavy on purpose.
- smoke lit brighter on the sun side (six-way)
- no hard line at the smoke base in `smoke-base-soft`, and a visible line in `smoke-base-hard`
- the fireball over the cloud in `cloud-fireball` and partly eaten in `cloud-fireball-nolimit`

If a threshold fails, read the image first. A black frame with no console error is the "graph failed to build" trap. A fireball that is present but under threshold is a threshold to re-derive from the measured counts: log them, set the threshold at half the measured value, and record both in the ledger. An absent fireball is a bug, not a threshold. `net::ERR_QUIC_PROTOCOL_ERROR` at load is the known windomlane flake (`--retries=2` absorbs it).

- [ ] **Step 5: The existing specs this plan touches, on the same slot.**

```bash
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test \
  tests/e2e/adapter.spec.ts tests/e2e/boot.spec.ts tests/e2e/settingsUi.spec.ts tests/e2e/strike.spec.ts tests/e2e/gunnery.spec.ts \
  tests/e2e/contact.spec.ts tests/e2e/clouds.spec.ts tests/e2e/cloudTemporal.spec.ts tests/e2e/cloudPixels.spec.ts --retries=2; echo rc=$?
```

Expected: `rc=0`. `boot.spec.ts` gates the cold boot under 1,500 ms (`docs/clouds.md` §3.9). The fx materials add graph build time at boot. If boot fails the gate, the fix is in `material.ts`: build the dense material's alpha-only graph instead of the full one (Task 7's `shadeAlpha` lever). Raising the gate is not the fix. `motionBudget.spec.ts` is environmental (`docs/clouds.md` §4) and is not in this list.

- [ ] **Step 6: Commit the spec** (the captures are committed in Task 13):

```bash
git add tests/e2e/fxPixels.ts tests/e2e/fx.spec.ts
git commit -m "E1 Task 11: Tier 2 effects spec -- bomb land/water, air kill, soft edge, cloud ordering, sheet fallback, restart clears"
```

---

### Task 12: Tier 2 — the cost gates (spec §4.5)

**Files:**
- Create: `tests/e2e/fx-budget.spec.ts`
- Modify (tuning only, if the gate requires it): `src/render/fx/material.ts`, `src/render/fx/fxPass.ts`, `src/render/fx/catalog.ts` (numbers only)

- [ ] **Step 1: Write** `tests/e2e/fx-budget.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import type { FxStressName } from '../../src/render/fx/stress.js'

/**
 * Spec §4.5: the effects budget. Follow view on the runway, the stress scene
 * ~300 m ahead (fx/stress.ts 'budget': 8 bombs, 32 rockets, gunfire on land
 * and water at 20 Hz, a burning ship, a collapsing building, one air kill).
 * Clouds and ocean are forced to high so a probe cannot move them.
 *
 * Differential p95s across two page loads are noise-dominated (docs/clouds.md
 * §4, Measurement), so each arm is loaded twice, interleaved off/on/off/on,
 * and the gate compares the arms' means.
 */
const FX_DELTA_P95_MS = 1.0
const GPU_TRIPWIRE_1440P_MS = 6.0
test.setTimeout(420_000)
const consoleErrors: string[] = []
test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.setViewportSize({ width: 2560, height: 1440 })
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

type Run = { readonly fx: string; readonly p95: number; readonly n: number; readonly live: number; readonly cpuMs: number }
async function measure(page: Page, fx: 'off' | 'low' | 'medium' | 'high', scene: FxStressName): Promise<Run> {
  await page.goto(withParams('/', { fx, cloudTier: 'high', oceanTier: 'high' }))
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  await page.evaluate((n) => (window as DiagWindow).__ww2!.fxStress(n), scene)
  await page.waitForTimeout(1000)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(2500)
  const mid = await page.evaluate(() => (window as DiagWindow).__ww2!.fx())
  await page.waitForTimeout(2500)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  const run = { fx, p95: percentile(gpu, 0.95), n: gpu.length, live: mid.live, cpuMs: mid.cpuMs }
  console.log(`FXBUDGET ${scene} fx=${fx} p95=${run.p95.toFixed(3)} n=${run.n} live=${run.live} cpuMs=${run.cpuMs.toFixed(3)}`)
  return run
}
const mean = (runs: readonly Run[], fx: string): number => { const r = runs.filter((x) => x.fx === fx); return r.reduce((s, x) => s + x.p95, 0) / r.length }

test('1440p high: effects add at most 1.0 ms of gpu p95 over ?fx=off (spec §4.5)', async ({ page }) => {
  const runs: Run[] = []
  for (const fx of ['off', 'high', 'off', 'high'] as const) runs.push(await measure(page, fx, 'budget'))
  const delta = mean(runs, 'high') - mean(runs, 'off')
  const detail = `effects p95 ${mean(runs, 'high').toFixed(3)} ms vs off ${mean(runs, 'off').toFixed(3)} ms, delta ${delta.toFixed(3)} ms`
  console.log(`FXBUDGET ${detail}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const r of runs.filter((x) => x.fx === 'high')) {
    expect(r.live, 'the stress scene did not populate the pool').toBeGreaterThan(800)
    expect(r.p95).toBeLessThanOrEqual(GPU_TRIPWIRE_1440P_MS)
  }
  expect(delta, detail).toBeLessThanOrEqual(FX_DELTA_P95_MS)
})

test('1440p medium and low: recorded, and inside the tripwire', async ({ page }) => {
  for (const fx of ['medium', 'low'] as const) expect((await measure(page, fx, 'budget')).p95).toBeLessThanOrEqual(GPU_TRIPWIRE_1440P_MS)
})

test('the eye inside a smoke plume stays inside the tripwire (Review Focus 5)', async ({ page }) => {
  const r = await measure(page, 'high', 'eye-smoke')
  expect(r.live).toBeGreaterThan(0)
  expect(r.p95).toBeLessThanOrEqual(GPU_TRIPWIRE_1440P_MS)
})
```

- [ ] **Step 2: Run the gates** (same slot and tunnel as Task 11):

```bash
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/fx-budget.spec.ts --retries=1; echo rc=$?
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/budget4k.spec.ts tests/e2e/terrain.spec.ts --retries=2; echo rc=$?
```

Expected: `rc=0` for both. Copy every `FXBUDGET` and `BUDGET4K` line into the ledger. Take one `photo`/High `BUDGET4K` line each from a run with `?fx=off` and with fx on. `photo` has 0.6 ms of margin at 4K, and an idle fx pass must cost ~0 (R12). If `budget4k` newly fails on any view, compare against a `main` run of the same view back-to-back before blaming E1 (`docs/clouds.md` §4, "One capture is not a baseline").

- [ ] **Step 3: If the delta exceeds 1.0 ms, apply these levers in order, re-measuring after each, and stop at the first that passes.** Record which shipped and its numbers:
  1. **Dense target at half the fx resolution.** The dense draw's fragments drop to ¼. `denseViewZAt` divides `fullPixel` by `2 × span`.
  2. **An alpha-only dense material** (`shadeAlpha`: light A's alpha, the fades, nothing else).
  3. **No motion warp at medium and high.** `frameBlend` stays, and becomes a plain crossfade of two frames with no flow samples. Two fewer samples per fragment.
  4. **MRT instead of the second draw** (Ruling R9 reversed): `renderer.setMRT(mrt({ output, fxDense }).setBlendMode('fxDense', maxBlend))` around the one particle render.
  5. **Smaller sprites in the catalog's biggest emitters** (`column`, `ship.fire` smoke): numbers only, and noted as E2's to re-tune.

  If none passes, stop and write the numbers up for Mark. Do not ship a raised gate.

- [ ] **Step 4: CPU check (spec §3.4, "GPU compute is not built").** From the `FXBUDGET` lines, record `cpuMs` at high. If it exceeds 1.0 ms, record it as the measurement that would justify compute, and do not build compute. That is a later plan's call.

- [ ] **Step 5: Commit.**

```bash
git add tests/e2e/fx-budget.spec.ts src/render/fx
git commit -m "E1 Task 12: fx budget spec -- 1440p high within 1.0 ms of ?fx=off, tripwire and 4K budget green; <lever or 'no tuning needed'>"
```

---

### Task 13: Handoff, status, docs, full verify

**Files:**
- Create: `docs/handoff/<date>-e1-effects-engine.md` and `docs/handoff/<date>-e1-effects-shots/` (from Task 11)
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 "Effects realism" row), `README.md` (one paragraph), `docs/clouds.md` (§3.10 numbers, the header's "Last reconciled")

- [ ] **Step 1: Bit-identity, one last time.** `npx tsx .superpowers/e1/digest.ts 1800; echo rc=$?` and `npx tsx .superpowers/e1/strike.ts 1200; echo rc=$?`. Expected: the seven baseline hashes. Record them with `node --version`.

- [ ] **Step 2: Full verify on ryzen.** `remote-run npm run verify; rc=$?; echo "rc=$rc"`. Capture the status directly (`serverconfig/ryzen.md`; `exit $LASTEXITCODE` on the PowerShell side). Expected: `rc=0`. `docs/clouds.md` §4 records one known failure mode: lint fails on ryzen because of `tools/textures/cache/` in its data mirror. If that is the only failure, run `npm run typecheck; echo rc=$?`, `npm run lint; echo rc=$?` and `npm run depcruise; echo rc=$?` on nexus (no tests, cheap), then `remote-run npm test; rc=$?; echo "rc=$rc"`, and quote all four in the handoff. Never run the full suite on nexus.

- [ ] **Step 3: `docs/clouds.md`.** Fill in the numbered facts in §3.10 (added in Task 8): the cloud-ordering counts from Task 11 (limited / no limit / clear sky) and the `photo` 4K High p95 with fx off and on from Task 12. Update the header's "Last reconciled against the repo on … at …" to today and the branch's head commit.

- [ ] **Step 4: The handoff** `docs/handoff/<date>-e1-effects-engine.md`:
  - **What shipped:** the commits, one line each.
  - **Measured:** the digest hashes (unchanged), the `FXBUDGET` table (off/high ×2, medium, low, eye-smoke, live counts, cpuMs), the `BUDGET4K` lines, the cloud-ordering and soft-edge numbers, and `content/fx` bytes.
  - **Captures:** one line per image in the shots directory, saying what it shows (from the Task 11 ledger), with the relative link.
  - **Rulings:** R1–R18, one line each, plus any made during execution (from the ledger).
  - **Levers:** which Task 12 lever shipped, if any.
  - **Open, for Mark:**
    1. merge `worktree-e1-effects` to `main` (his call; the O1 `ordnance.ts` conflict is deletions against in-flight changes)
    2. the placeholder look is not a judgment of E2; the first viewing checkpoint is the end of E2 (spec §7)
    3. the kill trail rises from a frozen wreck (R6): a falling wreck is a sim change for a later plan
    4. a dud makes no splash (R2)
    5. E2 must keep `sheets.json`'s layout (R7) or change `sheetManifest.ts`
  - **Traps found:** anything the executor hit, especially TSL.
- [ ] **Step 5: §15 row.** Replace the "Effects realism" row's Status cell. Keep the other cells:

`E1 (effects engine) complete <date> on branch \`worktree-e1-effects\`, **not merged** (Mark's call), with Tier 1 and reference-GPU Tier 2 (\`fx.spec.ts\`, \`fx-budget.spec.ts\`: 1440p high +<delta> ms over \`?fx=off\`, 4K budget green) ([design](2026-09-26-ordnance-and-effects-design.md), [plan](../plans/2026-09-26-e1-effects-engine.md), [handoff](../../handoff/<date>-e1-effects-engine.md)): the sim reports every detonation (\`World.combat.impacts\`, bit-identical elsewhere); one lit, soft, pooled particle system replaces all six old effects; clouds stop at dense smoke. Sheets are code-generated placeholders. E2 (baked flipbooks) and E3 (water) not started.`

- [ ] **Step 6: README.** Add one paragraph beside the other plan paragraphs. It points at §15 and does not restate the order:

`**E1 effects engine (<date>, branch \`worktree-e1-effects\`, awaiting merge).** Every explosion, splash, fire and smoke trail is one lit particle system now, drawn at reduced resolution before the clouds. The flipbook images are placeholders until E2 bakes real ones. See the [handoff](docs/handoff/<date>-e1-effects-engine.md); master spec §15 holds the status.`

- [ ] **Step 7: Clean up the slot.** Stop the worktree's vite (`kill` the background job). Restore `vite.config.ts` (`git checkout vite.config.ts`). Confirm `git status --short` shows only the files this task commits. Note in the ledger that slot `-3` is free.

- [ ] **Step 8: Commit and push the branch** (pushing a worktree branch is allowed; merging is not):

```bash
git add docs/handoff/ docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md docs/clouds.md
git commit -m "E1: handoff, §15 row, README pointer, clouds.md numbers"
git push -u origin worktree-e1-effects
```

- [ ] **Step 9: Tell Mark.** Email the handoff as HTML: `python3 tools/mail-doc.py docs/handoff/<date>-e1-effects-engine.md "E1 effects engine: handoff"`. It exits 0 and prints a byte count. **Never re-run it with `--debug`.** Do not merge, and do not name a windomlane host for viewing: this plan has no viewing checkpoint, and slot `-3` is down after Step 7.

- [ ] **Step 10: Ledger.** Close `.superpowers/sdd/e1/progress.md`: the final commit, the verify status, and the open items as in the handoff.

---

## Spec coverage (self-review)

| Spec | Where |
| --- | --- |
| §3.1 ring `{tick, cause, outcome, surface, point}`, bounded, multi-tick | Task 1 (R1–R3 for the gaps) |
| §3.1 purely additive, bit-identical | Task 1 Steps 1, 6, 7; Task 13 Step 1; architecture guard |
| §3.2 events: impacts, crash, kills; engine, ship, structure emitters; restart rule; `nextOrdnanceImpacts` deleted | Task 4; Task 10 |
| §3.3 catalog, zod, recipe table, cited-or-estimate | Task 3 (R4 adds `round.aircraft`) |
| §3.4 fixed pool from tier, CPU, seeded, one upload, one batch, oldest-first, raw world metres, no compute | Task 5; Task 8 (upload); R10; Task 12 Step 4 |
| §3.5 deletions | Task 10 + `fxMigration.test.ts` |
| §4.1 TempNode, reduced-res, `sceneDepth`, soft particles, 2 m near fade, depth-aware composite | Tasks 7, 8 (R11, R12) |
| §4.2 before clouds, dense depth into the march limit | Task 8 (R9); Task 11 cloud-ordering |
| §4.3 six-way (sun, sky, cloud shadow, aerial perspective), emissive fire into bloom, no dynamic lights | Task 7 |
| §4.4 `fx` quality system and tier table | Tasks 5, 6, 9 (R15, R16) |
| §4.5 `fx-budget.spec.ts`, 1.0 ms, 6.0 ms tripwire, `budget4k` | Task 12 |
| §6.4 placeholder sheets, three-image layout, KTX2 path | Task 2 (R7, R8); Task 7 loader |
| §7 Tier 1 E1 bullets | Tasks 1–5 (and 2 for the KTX2 header gate) |
| §7 Tier 2 E1 bullets (budget, three captures, soft edge, cloud ordering) | Tasks 11, 12 |
