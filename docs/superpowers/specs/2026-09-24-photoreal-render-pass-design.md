# Photoreal render pass — design

**Status: approved design, 2026-09-24.** Brainstormed with Mark after Plan
16d (cumulus fidelity) stalled in its Task 5. His ask: improve the clouds
and "the entire world rendering quality … to make it more photorealistic",
and explicitly not to assume the stalled session's GPU constraints were
correct. Executed as ONE sequential overnight plan, subagent-driven, on
`main` in place. **This spec supersedes
`2026-09-24-cumulus-cloud-fidelity-design.md`** (16d); what survives of 16d
is named in §6.

## 1. What was measured before designing (2026-09-24, reference desktop)

RX 6700 XT, harness Chromium, serialized GPU timestamps, 8 fixed views
(§3.2), default tiers, `main` at `e9607fa`.

| View | 1440p p95 | 4K p95 | 4K, `?cloudTier=off` |
| --- | --- | --- | --- |
| runway (bare `/`) | 3.835 | 5.710 | — |
| 600 m over land | 3.744 | 7.414 | **1.794** |
| under deck, 1200 m | 3.237 | 6.677 | — |
| inside deck, 1900 m | 6.055 | **13.070** | **2.026** |
| above deck, 3200 m | 3.238 | 6.649 | — |
| 6000 m | 3.749 | 7.291 | — |
| deck-quals | 3.906 | 7.662 | — |
| sunset (`timeOfDay=17.3`) | 3.526 | 7.274 | — |

`?cloudShadow=off` at 600 m: 7.299 (the shadow pass is ~0.1 ms).

Three conclusions this design rests on:

1. **The clouds are 75–85% of the frame.** Everything else — terrain,
   ocean, trees, ships, aircraft — costs under 2.1 ms at 4K.
2. **16d's premise was wrong.** It treated `GPU_BUDGET_P95_MS = 6.0` as a
   hard ceiling. The 2026-09-18 musings (§2) record that number as a
   regression tripwire, 1.2× a day's measurement. 16d then bisected step
   counts inside the one expensive system rather than asking why that system
   costs what it does: **the cloud march runs once per full-resolution
   pixel.** Production volumetric renderers march at reduced resolution and
   reconstruct temporally; that is where the budget lives.
3. **What reads as "not photographic" in the screenshots** is, in order of
   payoff: an LDR pipeline with no tonemapping (everything pastel, whites
   clip, no sun punch); a two-colour sky and a smoothstep-to-grey fog
   instead of an atmosphere; clouds with blurred edges, weak top/base
   contrast, no silver lining and grey ambient; a flat teal sea that does
   not reflect the sky; a near-black carrier deck; blurry procedural
   terrain.

## 2. The budget (Mark's decision, 2026-09-24)

**gpu p95 ≤ 8.33 ms (one 120 Hz frame) at 3840×2160 on the reference
desktop, at the `high` tier, in every view of §3.2.** Mark's monitor is 4K
at 120 Hz. Weaker GPUs are served by the existing Settings dialog tiers
(`quality.ts`), not by holding `high` down.

- A new Tier 2 spec, `tests/e2e/budget4k.spec.ts`, owns this number. It
  forces `?cloudTier=high&oceanTier=high` so the one-time probe cannot
  change what is being measured.
- "gpu p95" means the frame's **render-pool plus compute-pool** timestamps.
  Phase B adds compute dispatches; a budget that silently stopped counting
  them would pass on a frame that fails. Phase C0 Task 1 must prove the
  timer covers every pass of the new multi-pass frame (§4.1).
- The three existing `GPU_BUDGET_P95_MS = 6.0` checks (`terrain`,
  `entities`, `strike` specs) are 1440p tripwires. They stay tripwires: at
  the end of the plan they are re-set to 1.2× the final measured 1440p p95
  (their original derivation), with a dated comment. Any phase that pushes
  one of them over 6.0 in the meantime re-derives it the same way rather
  than loosening it arbitrarily.

## 3. Rules for the whole run

### 3.1 Phase gates

A phase is done only when all three hold:

1. `npm run verify` exits 0 (`rc=$?` captured directly).
2. `budget4k.spec.ts` passes.
3. **Screenshots of all eight §3.2 views at 1440p are captured, and the
   executing agent reads every one** and compares it with the previous
   phase's set. Written verdict per view in the ledger.

**On failure after a real debugging effort** (Mark's ruling): revert only
that phase's commits and continue with later phases that do not depend on
it. Dependencies: A, B, C1 and D all need C0's pipeline, so **a failed C0
stops the run**. C1 needs C0 only. B, C1 and D do not need A's TAA (if TAA
fails, A ships with SMAA per §4.2). Never trade visible quality away to get
under the budget — that is how 16d stalled.

### 3.2 The eight views

Fixed, so every phase is compared against the same pictures. `TAC =
(-29666, -47605)`.

| Name | URL |
| --- | --- |
| runway | `/` |
| low-land-600 | spawn `(TAC.x+3000, 600, TAC.z+6000)` |
| under-deck-1200 | spawn `(TAC.x, 1200, TAC.z-8000)` |
| in-deck-1900 | spawn `(TAC.x, 1900, TAC.z-8000)` |
| above-deck-3200 | spawn `(TAC.x, 3200, TAC.z-8000)` |
| high-6000 | spawn `(TAC.x+10000, 6000, TAC.z+20000)` |
| deckquals | `/?scenario=deck-quals` |
| sunset | spawn `(TAC.x, 1000, TAC.z-8000)` + `&timeOfDay=17.3` |

A shared helper (`tests/e2e/views.ts`) owns this table; both the budget spec
and the screenshot capture read it.

### 3.3 Existing pixel assertions

Tonemapping and the atmosphere change pixel values, so some Tier 2
assertions measured against today's picture will move (cloud-shadow mean
grey on the deck, the clouds horizon-strip residual, `sun.spec.ts`).
Each is **re-measured and re-baselined with a dated comment saying why**,
never loosened to whatever makes it pass. Readback assertions of world
facts (the cloud-shadow world anchoring, `oceanLandWeight`) must not change
at all; if one does, that is a bug.

### 3.4 Unchanged

`src/sim/` (entirely untouched), the radar scope pass, the DOM HUD and title
screen, the Settings dialog UI (new per-tier knobs map onto the existing
`high/medium/low`; no new controls), `?cloudTier=`, `?oceanTier=`,
`?cloudShadow=`, `?cloudDebug=`, `?timeOfDay=` semantics.

## 4. The five phases, in order

### 4.1 Phase C0 — clouds at reduced resolution (performance only)

**Same look as today; roughly a quarter of the cost.**

- **Frame restructure.** `main.ts`'s `renderer.render(scene, camera)` becomes
  a three `RenderPipeline` (r186, `three/webgpu`) whose scene `pass()`
  renders into a target with a depth texture. With no other nodes its
  output must be pixel-equivalent to today's frame; that equivalence is
  this phase's first checkpoint (mean absolute difference over the eight
  views < 1 grey level, clouds off). The shadow-map and radar passes stay
  as separate `renderer.render` calls before it.
- **Timer proof.** After the restructure, show that
  `gpuFrameTimesMs` still spans the whole frame: add a deliberately
  expensive throwaway node to the post chain, confirm the p95 moves by
  about its cost, remove it. Recorded in the ledger with the numbers.
- **Cloud pass.** The cloud dome leaves the scene. The same march (existing
  `density`, lighting and curved-slab intersection, moved not rewritten)
  runs as a full-screen pass at **half width × half height**, reading the
  full-resolution scene depth (min-depth downsample so thin foreground
  geometry is not marched through). It outputs premultiplied colour + alpha
  and a representative cloud depth (transmittance-weighted mean `t`).
- **Temporal accumulation.** The march start jitter changes every frame
  (the existing interleaved-gradient dither offset by a frame index). The
  history target is reprojected using the cloud depth, the **current and
  previous eye world position** and the current and previous
  view-projection — both are needed because the scene is camera-relative.
  History is clamped to the current 3×3 neighbourhood's min/max and blended
  at ~0.9; rejected (off-screen, depth-discontinuous) samples take the
  current value.
- **Composite.** A full-resolution depth-aware upsample (three's
  `depthAwareBlend` or a joint-bilateral equivalent) composites the clouds
  over the scene pass. Aircraft and ship edges against cloud must stay
  sharp.
- **Tiers.** `CLOUD_TIERS` gains `resolutionScale` (high 0.5, medium 0.5,
  low 0.25). Step counts return to the pre-16d baseline (48/32/20 cumulus,
  2/1/1 light, 8/6/4 cirrus) — the 16d bisected values are discarded.
- **Cloud shadows** are unchanged; they read `cloudField` directly, not the
  cloud pass.
- **Acceptance.** The eight screenshots match today's to the eye; a
  rolling-flight capture (full roll at 200 m/s through `in-deck-1900`,
  frames at 0/0.5/1 s) shows no ghost trails; 4K `in-deck-1900` p95 falls
  from 13.07 ms to ≤ 8.33, and the budget spec passes for all eight.

### 4.2 Phase A — HDR, tonemapping, anti-aliasing

- The scene pass renders to a half-float target. Output goes through **AgX**
  tonemapping (`renderer.toneMapping`, applied once at the pipeline output)
  and a **fixed exposure** driven by sun elevation (a small table in the new
  exposure module; no histogram auto-exposure). DEV `?toneMap=agx|aces|none`
  exists for comparison screenshots.
- **Bloom** (`BloomNode`), threshold above diffuse white so only the sun,
  glint and bright cloud rims bloom; strength kept subtle.
- **Anti-aliasing: TRAA replaces MSAA** (`antialias: false` on the
  renderer). Motion vectors come from three's velocity MRT. The known risk:
  custom-positioned meshes (terrain CDLOD `positionNode`, the camera-relative
  polar ocean, instanced trees) may produce wrong velocity. If TRAA ghosts
  on any view after a real effort, **fall back to SMAA** and record why.
  The cloud pass composites before AA so TRAA also smooths cloud edges.
- Lighting intensities are re-balanced once for the HDR range so the
  runway view's mean luminance stays within ±15% of Phase C0's; the look
  changes (contrast, highlights) without the scene getting globally darker
  or brighter.

### 4.3 Phase B — physically based atmosphere

Hillaire 2020 ("A Scalable and Production Ready Sky and Atmosphere Rendering
Technique"), Earth defaults.

- **One constants module** (`src/render/sky/atmosphere.ts`): planet radius
  6360 km, top 6460 km; Rayleigh β = (5.802, 13.558, 33.1)e-6 /m, scale
  height 8 km; Mie scattering 3.996e-6, absorption 4.40e-6, scale height
  1.2 km, g = 0.8; ozone absorption (0.650, 1.881, 0.085)e-6, tent 25 km
  centre, 15 km half-width. The world's metres are real metres, so the
  camera altitude is `eye.y`.
- **GPU LUTs**, rendered as quad passes into render targets (the proven
  `cloudShadow.ts` shape) or TSL compute where a pass needs it:
  transmittance 256×64 (once, and on constants change), multi-scattering
  32×32 (once), sky-view 192×108 (per frame), aerial perspective 32×32×32
  stored as a 2D slice atlas (per frame; no 3D storage textures).
- **Sky dome** samples the sky-view LUT plus a physical sun disc with limb
  darkening, attenuated by transmittance. Replaces `sky.ts`'s gradient.
- **Aerial perspective** replaces `fogWeightNode`'s blend toward
  `skyHorizonNode` in the terrain, ocean and clouds (the clouds apply it at
  their representative depth). The 100 km far plane stays; AP at 100 km is
  close to opaque at sea level, and the far fade into the sky must remain
  invisible — the existing Tier 1 far-plane/fog-distance pin moves to the
  AP function.
- **Sun colour and ambient** for the scene's `DirectionalLight` and
  `HemisphereLight` and for every shader uniform currently fed by
  `paletteFor` come from a CPU evaluation of the same constants each frame
  (transmittance along the sun ray; sky irradiance from a small fixed set of
  directions). `palette.ts`'s hand-tuned keys are retired; `applySun`'s
  signature stays so its call site does not move. Below the horizon the
  existing dusk floor behaviour is preserved (night lighting is out of
  scope).
- **The CPU and GPU halves must agree**: a Tier 2 case reads back the
  transmittance LUT at three sun elevations (readback technique of
  `__ww2.cloudShadowAt`) and compares with the CPU value within 2%. A
  Tier 1 test checks the CPU transmittance against the Hillaire reference
  values.

### 4.4 Phase C1 — cloud appearance

Replaces 16d. Works inside the C0 pipeline, lit by B's atmosphere, seen
through A's tonemapper.

- **Shape.** Base-shape remap eroded by the detail noise (Schneider 2015
  remap: `remap(shape, detail*k, 1, 0, 1)`), strongest at the cloud edge
  and base, so silhouettes become crisp and billowed instead of blurred.
  A cumulus height profile (flat base, rounded top). 16d's
  coverage-modulation field is brought over (§6).
- **Lighting.**
  - Dual-lobe Henyey-Greenstein phase (forward g ≈ 0.8, back g ≈ −0.3,
    blend ~0.5) — the silver lining with the sun behind a cloud.
  - Multiple-scattering approximation, 3 octaves (Wrenninge 2013 /
    Hillaire 2016: a = b = c = 0.5) — lit tops, dark bases, bright interiors
    without the "35% extinction" fudge (`LIGHT_EXTINCTION_SCALE` retires).
  - Beer-powder term for dark edges on thin cloud.
  - Light march: 6 steps with growing step length plus one long cone
    sample at `high`.
  - Ambient: sky irradiance from B above, a ground-bounce term below,
    replacing `skyHorizonNode × ambientScale`.
- **Steps.** `high` cumulus view steps ≥ 96, affordable because C0 made
  each step a quarter of the cost. Final tier numbers are measured, not
  invented; `high` must pass the budget in every view.
- **Acceptance.** Besides the phase gates: `under-deck-1200` must show
  visibly darker cloud bases than tops; a new view with the sun behind a
  cumulus (camera facing the sun at 1200 m, `timeOfDay` chosen so the sun
  is ~15° up) must show a bright rim. Read by the agent, verdict recorded.

### 4.5 Phase D — surfaces (no new downloads)

- **Ocean** reflects the atmosphere: Fresnel-weighted sky-view LUT lookup
  along the reflected ray (the sea already has `fresnel` and a glint term),
  replacing `mix(subsurface, skyHorizonNode, fresnel)`. Subsurface colour
  keeps its current hue and is lit by B's ambient. Sun glint uses B's sun
  colour.
- **Lit objects** (carrier, destroyers, hangars, towers, aircraft,
  `MeshStandardMaterial`/node equivalents) are checked under the new
  exposure; the near-black deck in today's `deckquals` view must read as a
  lit surface (mean deck luminance within the range of the sunlit runway's).
  The fix is lighting/exposure, not repainting albedos darker or lighter
  unless an albedo is demonstrably wrong.
- **Terrain.** B's ambient and aerial perspective (already wired in B); a
  procedural detail normal (the existing value-noise, as a derivative-based
  bump at two scales, faded out beyond ~2 km) so the near ground has relief
  in its lighting rather than flat blur.
- **Out of scope:** real textures, KTX2, CC0 sourcing, Git LFS — that is
  `2026-09-24-visual-realism-pass-design.md` and needs its own asset
  provenance work. Also out of scope: aircraft/ship geometry, trees'
  geometry, night lighting.

## 5. Testing summary

- **Tier 1**: pure functions only — atmosphere constants and CPU
  transmittance vs reference, exposure table monotonicity, the cloud
  reprojection math (a point at known cloud depth reprojects to the pixel
  the previous frame saw it at, including eye translation), `CLOUD_TIERS`
  shape, the view table.
- **Tier 2**: `budget4k.spec.ts` (the §2 gate); a screenshot capture over
  the eight views (1440p, written to `test-results/`, copied out before the
  next run because Playwright wipes that directory); the rolling-flight
  ghosting capture; the LUT readback agreement case; the sun-behind-cloud
  view. Existing specs re-baselined per §3.3.
- No test or gate asks Mark to look at anything. He flies the result.

## 6. What happens to 16d

- The worktree `.claude/worktrees/cumulus-cloud-fidelity-plan` (branch
  `worktree-cumulus-cloud-fidelity-plan`) is behind `main` by the
  quality-selector and Wildcat work and is **not merged**.
- **Kept, cherry-picked in Phase C1:** `6259d2f` (generate coverage noise),
  `5a8dbad` (spelling fix), `7b7cabf` (wire coverage into cumulus density),
  and `b55c9e2` (detail retile 400 → 150 m) if it still helps once the
  Schneider erosion exists; C1 decides by screenshot and records the call.
- **Discarded:** `71f6ccc` and `428ed6d` (the step-count raise and its
  bisection). The handoff doc `03406a5`/`fb4224e` is superseded by this spec
  and by the run's own handoff.
- The branch is kept, not deleted. The stash
  `cumulus-16d-wip-diagnostic-20260924` is left alone. The worktree's
  `vite --port 5175` process and its `vite.config.ts` scratch edit belong
  to that worktree and are left as they are.
- 16d's spec and plan get a one-line "superseded by" note at the top.

## 7. Delivery

- Every phase commits on `main` with its own gate evidence in the ledger
  `.superpowers/sdd/2026-09-24-photoreal-render-pass/progress.md`.
- Rulings made overnight on Mark's behalf are listed in the ledger AND in
  the closing handoff under "Rulings made for you", each with what it costs
  to reverse.
- Closing: handoff `docs/handoff/2026-09-25-photoreal-render-pass.md`
  (before/after screenshots of the eight views, the budget table, rulings),
  master spec §15 row, README paragraph, handoff emailed as HTML.
- **`main` is pushed at the end (Mark's decision); nothing is deployed.**
