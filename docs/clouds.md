# Clouds

The standing reference for the cloud system: what ships, where it lives,
what has been tried and with what result, the traps, and what is next.
Read this before touching anything under `src/render/scene/cloud*` or
`tools/sky/`. Dated handoffs remain the record of each step. This file
points at them and does not replace them. Last reconciled against the repo
on 2026-10-13 for the Takram default, the Flight Conditions cloudiness
selector, the retired K1 experiment and the earlier clouds-v2 Blender/LOD
findings; §3.10 records the effects dense-depth ordering and idle 4K
measurement. When you change the cloud system, update the relevant section
here in the same commit.

## 1. What ships (2026-09-26)

- **Layers:** up to four cumulus or cirrus slabs per scenario
  (`weather.clouds` in `content/scenarios/*.json`). A layer's `coverage` is
  the fraction of the **sky** it covers, seen from above
  (`src/sim/scenario.ts`). Free-flight uses 0.45 and deck-quals 0.55; the
  most any layer can reach is 0.636.
- **Player weather:** Flight Conditions (Form 4) rolls one of four equally likely initial reports:
  Clear (0.10 combined cumulus coverage), Partly Cloudy (0.25), Cloudy (0.42)
  or Overcast (0.58). The pilot may change the roll. A mission's picker row may carry `recommendedCloudiness` (Convoy Strike: Overcast): Form 4 then opens on it instead of the roll and tags it "(recommended)". The adjustment preserves
  authored bases, thicknesses and cirrus, and reweights multiple cumulus
  layers to the selected combined coverage. A historically clear scenario
  receives a 1,200 m-base, 700 m-thick cumulus layer. Quick launches omit the
  choice and keep scenario weather unchanged (`render/cloudiness.ts`).
- **Cumulus shape:** every cloud is carved from one baked procedural cumulus
  (`content/sky/cumulus.bin.gz`, built by `tools/sky/cumulus.py`). Each copy
  is placed, rotated and scaled by a 1024², two-plane weather map
  (`weather.bin.gz`), then sculpted by packed shape and detail noise and
  displaced by a curl field (`npm run sky:build`).
- **Rendering:**
  - a raymarch at reduced resolution with temporal accumulation
    (`cloudPass.ts`);
  - the march stops at the nearer of the scene depth and the effects'
    dense depth (where effects alpha > 0.5), so a fireball in front of a
    cloud keeps its pixels (E1, `src/render/fx/fxPass.ts`'s `cloudLimit`);
  - a density field shared with a sun-view shadow map
    (`cloudField.ts`, `cloudShadow.ts`). The march's `density` and
    `densityCoarse` are laid-out TSL `Fn`s, a fresh pair per material
    (`CloudField.laidOut()`, called once per `marchNode`), and every uniform
    they need arrives as an argument (`drifted`, `theta`). That took the
    page-load freeze from ~39 s to a cold median of 1.24 s (§3.9, and the
    `setLayout` trap in §4);
  - lighting from dual-lobe HG, three multi-scatter octaves and powder
    (`cloudLighting.ts`);
  - a movable sun (`sky/sun.ts`, `sky/palette.ts`).
- **Tiers:** `CLOUD_TIERS` in `src/render/scene/clouds.ts` is authoritative.
  As of this date (H0 changed high's fine light steps 2 -> 1, 2026-10-10):

| Tier | View steps | Light steps (fine) | Resolution | Update | Distance light LOD |
| --- | --- | --- | --- | --- | --- |
| high | 128 | 6 (1) | 0.5 | 1 texel in 8 per frame | none |
| medium | 56 | 4 (0) | 0.3 | every frame | 1.5–2.5 km |
| low | 32 | 2 (0) | 0.25 | every frame | 1.5–2.5 km |

- **Budget** (`tests/e2e/budget.spec.ts` is the gate): gpu p95 on the
  reference RX 6700 XT, High ≤ 8.33 ms at 1440p in every view, in-cloud
  included (H0, Mark 2026-10-08). Medium and 4K are recorded, not asserted.
  The measured table is in `docs/handoff/2026-10-08-h0-render-budget.md`.
- **Looks Mark has approved:** the `photo` view (tag
  `cloud-vdb-photo-2026-09-26`), and in-cloud flight on High ("no
  apparent loss of fps", 2026-09-26, after the fixes in §3.8).

### 1.1 Takram replacement, opt-in game integration (2026-10-10)

`?cloudRenderer=takram` selects the fresh native-WebGPU cloud path in DEV.
At this checkpoint omitting it selected `legacy`, as did production builds;
since 2026-10-11 the default is the TSL port (§1.2). The new pass:

- faithfully adapts the accepted Takram density, lighting and temporal model;
- marches at one-sixth resolution, reconstructs temporally, then composites at
  full resolution against the game's color and reversed-depth targets;
- follows the actual game camera, sun, scenario cumulus base and coverage, and
  resets history on camera cuts;
- renders only the plain cumulus layer. The Takram reference cirrus layer is
  intentionally disabled and thunderheads remain deferred;
- retains the existing cloud-shadow path for this checkpoint.

The integrated result passed below/in/above-deck flight captures. Mark accepted
the softened edge treatment as "way better" and the clouds as substantially
better than their predecessor. The deliberate broad resolve filter also makes
the dense center look slightly out of focus; keep that as a known compromise.
Some residual softness/pixel breakup can remain on the thinnest moving wisps.

The locked RX 6700 XT 2560x1440 High measurement was 2.016 ms native-cloud GPU
p95. The conservative estimated whole frame was 4.759 ms (2.743 ms base with
clouds off plus that native pass), under the 4.0 ms cloud-only gate and the
8.33 ms whole-frame gate. See
`docs/handoff/2026-10-10-k-clouds-v3-game-integration.md`.

### 1.2 Full TSL port and default renderer (2026-10-11)

Merged main commit `1c654889` adds a second DEV-only selector,
`?cloudRenderer=takram-tsl`. It is a complete Three Shader Language port of
the accepted Takram-derived path: native Three textures (including the
averaged 3D shape mip chain), weather and density, ray march and lighting,
2×3 temporal reconstruction, broad soft-edge resolve, and reversed-depth
scene composite. It embeds no WGSL cloud stage. At merge `legacy` remained
the default and `takram` the accepted native WGSL implementation.

Matched 2560×1440 below-, in-, and above-deck captures are visually
equivalent: weather placement, cloud silhouettes, lighting, opacity, depth
ordering and the accepted soft-edge treatment match. The residual stippling
at thin near-cloud edges appears in both implementations; it was not added by
TSL.

**Edge and horizon flicker fixed in both twins (2026-10-11).** The temporal
pass rejected history wherever the reprojected and reconstructed representative
depths differed by more than 0.035. That depth jumps from the cloud to 200 km
at every silhouette and along the horizon, so a reference-GPU mask showed
history thrown away in a band along every edge and in 65% of the sky band
above the deck, almost all of it the depth term; those pixels showed the raw
per-phase reconstruction, which changed with the 2×3 phase every frame
(Mark: "edges pixelated and flickering, horizon flickers"). Both temporal
shaders now keep history by clamping it into the mean ± 1.25σ of this frame's
3×3 low-resolution neighborhood (the usual TAA test) and compare no depth.
Cost: TSL temporal p95 0.229 → 0.367 ms at 1440p on the RX 6700 XT; the march
is unchanged. Tried and rejected the same day: advancing the STBN jitter slice
per frame, which moved the stipple into a grain across the whole cloud body.
Codex's earlier attempt (`676d0c2b`, reverted) blended every phase with the
bilinear reconstruction, which blurs rather than fixes, because the rejection
itself was the fault.

The first TSL port was about 19% slower on a corrected same-scene comparison.
An optimization pass restored R8 volumes and native WGSL's conditional
1/2/4-sample explicit-LOD weather fetch. Two clean locked RX 6700 XT runs then
put TSL whole-frame p95 at 5.746 and 5.772 ms versus same-scene native estimates
of 5.890 and 5.915 ms. The TSL march itself fell from 2.820–2.839 to
1.537–1.542 ms p95; temporal stayed 0.228–0.230 ms. It now clears both the
8.33 ms game gate and the plan's at-most-15% promotion criterion. The accepted
`54fd91f7` branch state was merged for continued use and comparison. See
`docs/handoff/2026-10-11-k-clouds-v3-tsl-port.md`.

**Promoted to the default, 2026-10-11.** After the edge fix below Mark judged
the TSL and native views "pretty similar" and the TSL one "really really
good", and ruled: `takram-tsl` is the default on `main`, in DEV and in
production, with no query parameter needed (`src/render/main.ts`,
`cloudRenderer`). `?cloudRenderer=legacy|takram` still selects the others in
DEV for comparison. The 4.1 MB of Takram assets under
`content/clouds/takram/` now ship with every build; `deploy.yml` asserts
`stbn.bin` is in `dist/`. The budget gate (`budget.spec.ts`) therefore
measures this renderer from now on; the last locked TSL numbers were 5.75 to
5.77 ms whole-frame p95 at 1440p High against the 8.33 ms gate, before the
+0.14 ms temporal-pass cost of the edge fix.

## 2. Where it lives

| Concern | File |
| --- | --- |
| Flight Conditions cloudiness roll and scenario-layer adjustment | `src/render/cloudiness.ts`, `titleScreen.ts` |
| Tiers, the march, light march, early-outs | `src/render/scene/clouds.ts` |
| Density (weather decode, archetype, noise, coverage twin) | `src/render/scene/cloudField.ts` |
| Reduced-res pass, amortized update, reprojection, resolve, composite | `src/render/scene/cloudPass.ts` |
| Comparison-only Takram raw-WebGPU pass and game adapter | `src/render/scene/takramCloudPass.ts`, `takramGameShaders.ts` |
| Default full TSL Takram port and Three texture loader | `src/render/scene/takramTslCloudPass.ts`, `takramTslAssets.ts` |
| History targets | `src/render/scene/cloudHistory.ts` |
| Effects dense depth, the cloud march limit's second input | `src/render/fx/fxPass.ts` (`FxCloudLimit`) |
| Shadow map (sun-view transmittance) | `src/render/scene/cloudShadow.ts` |
| Phase, multi-scatter, powder | `src/render/scene/cloudLighting.ts` |
| Asset sizes and constants shared by build and loader | `src/render/sky/noise.ts` |
| Noise and weather generators | `tools/sky/noise.ts`, `tools/sky/weather.ts`, `tools/sky/build.ts` |
| Cumulus archetype generator (Python, numpy) | `tools/sky/cumulus.py` |
| Asset provenance | `content/sky/NOTICE.md` |
| GPU gates | `tests/e2e/budget.spec.ts`, `clouds.spec.ts`, `cloudTemporal.spec.ts`, `cloudShadow.spec.ts`, `motionBudget.spec.ts` |
| DEV probes | `?cloudRenderer=legacy\|takram\|takram-tsl` (default `takram-tsl` since 2026-10-11), `?cloudTier=off\|low\|medium\|high`, `?cloudDebug=` (depth, layer, shape, density, slab, point, eye, nodepth), `?cloudShadow=off\|show`, `?timeOfDay=`, `?look=yaw,pitch`, `?fx=off\|low\|medium\|high`, `?fxCloudLimit=off`, `__ww2.clouds()` (includes native total and TSL march/temporal GPU samples), `__ww2.cloudShadowAt(x,z)` |

## 3. History: what was tried and what it did

Reference GPU throughout: RX 6700 XT via the Playwright run-server. Numbers
at 1440p before the photoreal pass and at 4K after it are **not
comparable**. Neither are numbers from before and after photoreal Task 2
(ocean compute joined the timer), nor numbers from different days under
different desktop load.

### 3.1 Plan 16a, volumetric layers (2026-09-19)

Handoffs: `docs/handoff/2026-09-19-plan16a-clouds.md` and
`2026-09-19-clouds-distance.md`.

- **Worked:**
  - **Branch on cloud kind and sample only one.** Sampling both and mixing
    cost 3.9 ms; branching cost 2.1 ms.
  - **No light march for cirrus**, which saved 1.6 ms.
  - **Exact curved-slab intervals, a 6 km march cap inside cumulus, and a
    slow two-scale shape warp.** Cloud cost 1.633 ms; horizon-strip
    residual 8.02 → 1.34, now guarded at < 3.
- **Failed:**
  - A **12 km cap on a conservative slab**: at 1,300 m eye height the
    curved base is first met ~50 km out, so it erased the distant deck.
  - **Exact bounds before the other savings**: 3.03 ms, over budget.
  - **Filtered detail**: 2.54 ms plus a visible band.

### 3.2 Plans 16b and 16c: shadows and sun (2026-09-19)

Handoffs: `docs/handoff/2026-09-19-plan16b-cloud-shadows.md` and
`2026-09-19-plan16c-sun.md`.

- **Worked:**
  - A 1024², 80 km sun-view transmittance map, carried by the sun's
    `shadow.shadowNode`. It reaches plain `MeshStandardMaterial` with no
    depth map. Pass cost 0.16–0.40 ms at 1440p.
  - Solar geometry and an elevation palette. Budgets were unchanged.
- **Failed:** the map was **mirrored in z**, and every screenshot check
  passed anyway. The fix was writing `1 - uv.y`. It was caught only by
  reading back fixed world points from several eye positions, which is now
  permanent.

### 3.3 Plan 16d, cumulus fidelity (2026-09-24): stalled, superseded

Design and plan: `2026-09-24-cumulus-cloud-fidelity*`. The ledger was lost
with its worktree. The in-progress handoff survives only in git:
`git show fb4224e:docs/handoff/2026-09-24-plan16d-cumulus-fidelity-in-progress.md`.

- **Stalled:** raising steps failed at deck-quals (8.36 ms against a
  6.0 ms line). The photoreal design ruled its premise wrong: 6.0 was a
  tripwire, not a ceiling, and the march ran once per full-res pixel.
- **Kept** by cherry-pick in photoreal Task 10: the detail retile and the
  coverage field. The coverage field was later replaced by the weather map.
- **Discarded:** the step bisections. The branch was deleted 2026-09-26
  (Mark). The 16d documents still lack a "superseded" line.

### 3.4 Photoreal render pass, cloud tasks (2026-09-24/25)

Plan: `docs/superpowers/plans/2026-09-24-photoreal-render-pass.md`. There is
**no handoff**: Task 14 was never run.

- **Reduced-resolution pass (Task 3):** 4K in-deck 13.57 → 6.00 ms.
- **Temporal accumulation (Task 4)**, with a 25% scene-depth disocclusion
  test. Without that test, a rolling airframe drags a clear-sky ghost of
  itself.
- **Pass span must be exactly `1/scale`, not `round(1/scale)`.** At scale
  0.45 the rounded span left 10% of the screen unmarched.
- **Schneider remap erosion, with deviations (Task 10).** The literal
  formula emptied the deck (cloud pixels 83.5% → 1.2%).
- **Lighting (Task 11):** a deep sunlit top equals albedo 0.8
  (`MS_SCALE = 3`); base/top luminance ratio 0.73.
- **Task 11 budget ladder:** 14.46 → 8.12 ms. The lesson: **"the view-step
  count itself, not the light march, is what costs."**
- **Blended light LOD** replaced a hard 2 km cut that left visible blotches.
- **Tier ladder test:** `scale² × steps` must fall from high to medium to
  low.
- **Then 60 Hz High** (Mark, 2026-09-25): scale 0.5, 6 light steps (2 on
  detailed density), no High light LOD.

### 3.5 Cloud Fidelity II (2026-09-25)

Handoff: `docs/handoff/2026-09-25-cloud-fidelity-ii.md`.

- **Camera motion reconstructed from depth** at quarter resolution replaced
  the scene motion MRT (3.849 → 3.635 ms clouds-off).
- **High marches one texel in 16, funding 128 steps.** The concentric stale
  arcs in a roll were fixed by clamping carried history to this frame's
  fresh 3×3 samples. A cloud-edge rejection alone did not fix them.
- **Weather-map cells:** flat bases, varied tops.
- **Packed RGBA shape/detail noise and a curl field:** 4K High 8.6–9.7 ms.
- **Rejected:** 128 view steps with 8 light (4 fine), 16.0 ms, no margin.
  The "1.78 ms no-MRT" baseline was retired as unreproducible.
- **Note:** CFII's final in-deck numbers were taken with the camera in a
  **clear gap** of the deck, not inside a cloud (§3.7).

### 3.6 Cloud VDB fidelity, Codex, finished by Claude (2026-09-25/26)

Handoff: `docs/handoff/2026-09-26-cloud-vdb-fidelity.md`. Plan:
`docs/superpowers/plans/2026-09-26-cloud-vdb-coverage.md`.

- **Worked:**
  - **One baked archetype per weather cell.** Mark approved the look.
  - **Continuous cloud-local coordinates** from an exactly encoded feature
    point and radius. Per-texel values had quantized clouds and shadows
    into 39 m blocks.
  - **Half-resolution archetype:** −1.5 ms at Medium. The 13 MB volume
    missed the texture cache on nearly every read.
  - **No shape read where the archetype is empty**, which also removed a
    column haze.
  - **Coverage as sky fraction:**
    - 1200 m cells;
    - winner and runner-up planes (cut walls 9.5% → 1.3% of cloud area);
    - coverage-grown radii;
    - a CPU twin, `skyCoverageTable`, that sets the threshold.
  - **Winner-only density in the light march:** in-deck 32.5 → 29.3 ms.
  - **Cloud-edge rejection also requires an alpha spread > 0.1:** in-deck
    24.9 → 18.8 ms.
- **Failed or removed:**
  - `strength >= 1 - coverage`: free-flight's 0.45 drew 0.15 of the sky,
    with a geometric ceiling of 0.245.
  - The first growth ramp (0.3 → 0.7) left 0.4375 unreachable.
  - A High light-LOD band, an adaptive step behind absorbed light, and a
    thin-haze light shortcut: none helped in-cloud.
  - High updatePeriod 16: about −2 ms, but kept at Codex's 8 (see §4).

### 3.7 The in-cloud case (2026-09-26)

The dense VDB deck put the in-deck view's camera **inside** a cloud. There,
depth-only edge rejection fired on haze noise and forced a full march of
every texel every frame (24.9 ms; 11.7 ms with the test off). The alpha
gate fixed most of that. The remainder has its own budget, Mark's call over
trimming quality. Measured in-deck 18.8 ms High, 8.39 ms Medium.

### 3.8 Fixes after Mark's first flight (2026-09-26, `e37c0a1`)

Mark was on **Low**: the auto-tier incident, §5.

- **Stacked slices on every cloud side:** Codex's 1/8-step cumulus start
  jitter. Full-step jitter removed them. The half-step value from the
  2026-09-19 distance refinement still streaked at Low. Stipple guard 0.19
  against a limit of 3.
- **Flickering band at the deck's far edge, even while paused:** the
  resolve's moving-edge rule (alpha jump > 0.12 keeps only 25% of history)
  fired on distant sub-texel noise. It now applies only to clouds nearer
  than 10 km. Frozen-scene temporal std at Low: 1.66 → 0.78 grey levels.
- Mark flew it: "huge improvements on both fronts". High showed no flicker
  and no fps loss in cloud. The High in-cloud stutter he reported before
  these fixes was not re-measured afterwards (§5).

### 3.9 The boot freeze (2026-09-25/26, `worktree-loading-dossier`)

Handoff: `docs/handoff/2026-09-26-loading-and-dossier.md` (measurements,
method and margin). Design: its spec §A.3.

- **Cause:** TSL inlines a layout-less `Fn` at every call site, and the
  light march calls the density many times per step. Each inlined copy cost
  2–3 s of three's JS graph build. The VDB rewrite's larger cumulus body
  grew the longest boot task from 13 s to 39 s.
- **Worked:** `density`/`densityCoarse` as laid-out `Fn`s, one pair per
  material, uniforms passed in: 39 s → cold median 1 240 ms (gate
  < 1 500 ms, `tests/e2e/boot.spec.ts`). Re-measured after merging §3.8's
  full jitter: 1 080 ms.
- **Failed:** one shared laid-out instance (WGSL validation error on the
  second material); one instance per call (18.5 s). See §4.
- **Not tried:** laying out `candidate` (inlined twice in the detailed
  density) and hoisting `thetaFor` to once per layer, if more headroom is
  wanted.

### 3.10 Effects in front of clouds (E1, 2026-09-26)

`minViewZAt` and the composite's `z` now take `min(…, denseViewZAt)`, the
effects pass's dense depth (`src/render/fx/fxPass.ts`), so the march stops
at a dense effect exactly as it stops at an opaque surface, and the
composite matches that stop. The reason is ordnance-and-effects spec §4.2:
air kills happen against cloud, and a fireball in front of a cloud must keep
its pixels rather than be marched over. Without `fxLimit` (`?fx=off`, or
`?fxCloudLimit=off`) it is a JS-level branch, so every cloud node graph is
built exactly as before.

Reference-GPU acceptance at 2560×1440 counted warm fireball pixels in the
same fixed view: **237 with the effects dense-depth limit, 0 with the limit
disabled, and 357 in clear sky**. The limited result therefore preserves the
foreground fireball, while the unlimited control lets the cloud march eat it.

The fixed 3840×2160 `photo`/High view measured **16.102 ms p95 with
`?fx=off` and 16.062 ms with effects High** (151 and 165 samples). The
-0.039 ms difference is scheduling noise, not a speedup claim; the effects-on
arm remains inside the 16.67 ms 4K budget. The full High in-cloud view is
currently 20.328–20.580 ms against its 20.0 ms tripwire; current `main`
reproduces that drift at 20.152–20.309 ms, so E1 did not change the gate.

### 3.11 Clouds-v2 Blender source and continuous-LOD experiment (2026-10-10)

The first half of `clouds-v2-blender-lod` tested a Blender-authored source
volume and far/mid/near runtime representations in an isolated spike. None of
that renderer entered production. The branch's later Takram work took a
different architectural direction; its accepted game integration is already
preserved on `main` and summarized in §1.1.

- **Blender was validated as deterministic offline cloud tooling.** Blender
  5.0.1 Geometry Nodes produced named density fields, baked them to OpenVDB,
  mapped normalized grids into physical bounds, saved `.blend` and JSON
  manifests, and rendered repeatable lighting/inspection views. The final
  cumulus occupied a 2.2 × 1.8 × 1.4 km envelope on a 192 × 160 × 144 grid;
  the cumulonimbus occupied 12.0 × 9.5 × 11.2 km on a 192 × 160 × 224 grid.
  Mark approved the source-render checkpoint as the best clouds seen to that
  point, which authorized only the isolated runtime proof—not production use.
- **The procedural source still exposed an authoring limit.** More voxels did
  not add missing small-scale structure: the smooth-union/ellipsoid field
  itself produced stacked bands, clean anvil rims and overly uniform internal
  extinction. Blender is useful plumbing and a Cycles truth/inspection tool;
  Geometry Nodes alone does not guarantee a convincing density model.
- **The compact LOD asset proof worked mechanically.** A single approved VDB
  generated a far proxy, a 14-direction relightable deep-impostor atlas, a
  64 × 48 × 48 near volume stored as 127 active 8³ bricks out of 288, and a
  conservative empty-brick skip field. The complete runtime assets were
  336 KiB raw / 101 KiB gzip, with held-out opacity MAE 0.0469. Persistent
  world-cell records retained cloud identity, seed, placement, bounds, yaw,
  density and wind after leaving and re-entering an area; far/mid/near weights
  used hysteresis and conserved to one.
- **The attended runtime checkpoint was rejected.** Atlas rows were flipped
  vertically during baking while the WGSL sampler treated increasing local up
  as increasing texture V, so the clouds appeared upside down. That invalidated
  the visual captures and established a simple gate for future pipelines:
  verify orientation before broader LOD or lighting evaluation.
- **Correcting steep-view cards did not solve the transition.** Expanding the
  atlas from eight azimuth views to 14 directions and blending the nearest two
  bases removed the worst flattening from above and below, but the mid/near
  overlap still showed two soft silhouettes. Conserving optical-depth weights
  is insufficient when projected density support does not coincide. A future
  approach would need deep-impostor depth to seed or terminate the spatial
  march as one optical interval rather than summing two observations.
- **The far renderer had the wrong cost shape.** A full-screen fragment pass
  tested as many as 32 records per pixel. Contaminated but still diagnostic RX
  6700 XT measurements put far incremental p95 near 4.31 ms against its 1 ms
  target, while near exterior and inside were more promising at about 2.18 and
  2.20 ms against the complete-cloud 4 ms target. A production far field must
  rasterize instanced conservative bounds so clear pixels do no cloud work.

The useful conclusion is architectural, not a request to revive this branch:
keep deterministic Blender/VDB inspection and persistent world identity in the
toolbox, but do not reuse the inverted impostor assets, the blended two-image
transition, or the full-screen far loop.

### 3.12 K1 legacy edge and lighting experiment (2026-10-10; retired 2026-10-13)

K1 investigated whether the legacy renderer's blocky silhouettes could be
improved cheaply enough to stay within the cloud budget. It produced useful
pipeline and lighting results, but its best budget-compliant visual candidate
made **no perceptible difference** in flight. No K1 renderer code was merged;
the later Takram TSL renderer superseded this line of work and became the
default. The `k1-cloud-edges` worktree and local/remote branches were removed
on 2026-10-13 after the durable findings below were preserved.

- **Blender/OpenVDB round-tripping worked.** Blender 5.0.1's bundled
  `openvdb` imported and rendered the legacy archetype in Cycles and exported
  it byte-exact; a Blender volume also exported to the game's `.bin.gz`
  format. A file-backed grid needs an explicit Attribute node feeding
  Principled Volume density, and a Geometry Nodes Bake node with no bake item
  silently writes nothing.
- **A per-voxel order-2 real spherical-harmonic lighting bake was rejected.**
  Across 128 Fibonacci-distributed hemisphere directions, its transmittance
  fit had mean error 0.049, p90 0.117, p99 0.276 and maximum 0.740; 2.6% of
  voxel/direction pairs exceeded 0.2. Restricting evaluation to sun elevations
  of at least 15 degrees did not fix the narrow lit/shadow terminator at edges
  and overhangs. The bake peaked at 3.7 GB RSS on Nexus.
- **Marching sunlight in each stretched and rotated archetype's cube frame
  was a real performance win.** It avoided weather/noise reads at each light
  sample. On the reference GPU at 1440p High, whole-frame p95 changed from
  9.41 to 6.52 ms in-deck, 6.70 to 5.93 ms at runway, and 6.29 to 5.39 ms in
  `photo`; cloud cost stayed at or below 3.7 ms. The daytime `photo` mean
  absolute image difference was 2.8 gray levels and bright-cloud luminance
  ratio was 0.98.
- **Low sun still needed one far-neighbour sample.** Cube-local shadowing
  lost dark undersides at a 15-degree sun elevation (sunset mean absolute
  difference 10.71). One full-field sample from cube exit to three cloud
  thicknesses restored neighbouring-cloud shadow. Weighting it fully below
  15 degrees and to zero above 30 reduced the sunset difference to 6.17 while
  leaving the daytime `photo` result effectively unchanged (about 2.19). The
  final whole-frame p95s were 6.41 ms in-deck, 5.57 ms runway and 4.92 ms
  `photo`, all within their gates.
- **The edge-quality ladder did not justify shipping.** Raising render scale
  to 0.65 cost about 0.9–1.5 ms and exceeded the 4 ms cloud budget in the
  worst views; 0.75 cost 1.8–2.5 ms. Marching every texel each frame at 0.5
  was about 10 ms. A four-frame/96-step candidate reached a 6.10 ms runway
  whole-frame median and 3.73 ms cloud cost, but Mark saw no perceptible
  improvement in flight, so it was rejected.
- **Measurement trap:** Chrome occlusion throttling reduced a six-second
  capture from roughly 400–480 frames to 110–150 while GPU p95 still appeared
  normal at about 5 ms. Check captured sample count before trusting p95.

The dirty worktree also contained two explicitly throwaway browser probes and
an unmeasured Geometry Nodes cumulus sketch (ellipsoid lobes, fractal/fine
noise and a flattened base). They had no validated result or reusable game
integration and were deliberately discarded with the worktree.

### 3.13 Full TSL Takram port (2026-10-11)

The full port proved that Three r186 TSL can express the complete accepted
renderer without a hidden raw-WGSL escape hatch. The important working pieces
were named MRT outputs, per-material laid-out density functions, Three-owned
3D textures with a manually uploaded averaged mip chain, and full-resolution
ping-pong history rendered through `QuadMesh`.

Two traps mattered:

- MRT render-target texture names must exactly match the keys passed to
  `mrt(...)`; otherwise Three emits an empty output struct and the frame is
  black.
- Mutable values owned by the pass use TSL `uniform(...)`; `reference(...)`
  is only for actual object properties such as camera near/far.

The first complete Ryzen/WebGPU flight passed with no console, page or WebGPU
validation errors, including camera-cut history invalidation. Matched captures
then showed that its remaining thin-edge breakup is the same accepted native
artifact. The first complete path was about 19% slower than native when
compared against the same cloud-on scene. Keeping the 3D volumes in R8 and
making the explicit-LOD weather-tile fetches conditional cut march p95 by
45–46% and whole-frame p95 by about 18%. Optimized TSL measured
5.746–5.772 ms versus same-scene native estimates of 5.890–5.915 ms and
therefore passed the plan's performance criterion. At this checkpoint the
native renderer remained authoritative only because the work was still on a
research branch; the accepted TSL implementation was subsequently merged and
promoted to the default as recorded in §1.2.

## 4. Traps

**TSL and three r186**
- **Initialize sampled render targets before their samplers compile.** Three
  r186 can initialize a target texture first through a material's texture node,
  then recreate it at the same size on its first render-target use while a
  cached WebGPU pass descriptor still holds the destroyed view (upstream
  issue #34301). The cloud-shadow map hit that exact race in the 2026-10-12
  overnight run: `main.ts` now calls `renderer.initRenderTarget` immediately
  after creating it, before terrain and ocean materials can compile the
  sampler. Keep the texture name: WebGPU validation messages then identify
  this target rather than reporting an anonymous 1024×1024 R8 texture.
- **A graph that fails to build renders black with zero validation
  errors.** So do a TSL `Fn` returning more than one node,
  `smoothstep(0, 0, x)`, and a missing import (`saturate`). A missing
  import also makes timings look spectacular because nothing draws, so
  check the console before believing a big win.
- `uniformArray.element(i)` re-emits at every use, and nested `Loop`
  counters all default to `i`. Capture with `.toVar()` and pass `name:`.
- Hoist int→float conversions into vars: a second inline `toFloat()`
  emits `f32 / i32`.
- Implicit-LOD `textureSample` must stay in uniform control flow. Explicit-LOD
  reads may be conditional; this distinction removed most of the full TSL
  port's original march penalty.
- **A render target written from `uv()` reads back flipped.** Write
  `1 - uv.y`.
- The weather map must be sampled **NEAREST**; filtering blends two
  clouds' frames.
- Three's WebGPU backend maps `RedFormat` plus `UnsignedByteType` to `r8unorm`
  for 3D textures. Expanding source R8 volumes to RGBA8 wastes 4× the storage
  and hurt the full TSL port's hot march.
- `Math.round` yields `-0`; add `+ 0`.
- A layout-less `Fn` is inlined at every call site. The light march's
  copies caused a ~39 s boot freeze (§3.9).
- **A laid-out `Fn` (`setLayout`) must be one instance per material and
  must read no uniform in its body.** three 0.186's
  `NodeBuilder.buildFunctionNode` caches a laid-out function's code per
  backend, keyed by the `Fn` object, with the binding names the *first*
  builder assigned. Share one across materials and the second fails WGSL
  validation with `unresolved value 'nodeUniformN'`. A uniform captured
  inside the body breaks the same way, so pass it in as an argument.
  One instance per *call* compiles, but rebuilt boot to 18.5 s. Captured
  textures are fine once the instance is per-material. Pattern:
  `CloudField.laidOut()`.

**Measurement**
- **One capture is not a baseline.** Compare back-to-back captures only.
  Desktop load changes how many frames accumulate in a capture's settle
  time. A mean-|Laplacian| sharpness metric did not see a softness Mark
  would.
- **Check which tier the pilot is on.** A real, vsynced Chrome auto-picks
  Low (§5), and Low looks very different.
- Differential p95s across two page loads are noise-dominated. Trust the
  4K suite.
- A view's name is not its content: "in-deck" was in a clear gap for CFII
  and inside a cloud for VDB. Look at the capture.
- Means and "it changed" checks passed a mirrored shadow map. Assert
  invariants directly, e.g. world anchoring by readback.
- Frame-time **variance** is what the pilot feels as stutter. A p95 inside
  budget with p50 ≪ p95 can still stutter.
- The dev server inflates `.gz` itself; loaders inflate only on the gzip
  magic bytes.

**Harness**
- `waitForTerrain` times out often on the `-2`/`-3` slots. It passes on
  retry, with a clean console and terrain in 2.5 s in an instrumented load.
  Use `--retries=2`.
- **Two GPU lock files are in use** (`/tmp/ww2airsim-gpu.lock`,
  `/tmp/ww2airsim-tier2.lock`), so sessions still share the desktop GPU.
- Playwright wipes `test-results/` on every run; copy captures out first.
- `motionBudget.spec.ts` failed on `main` too on 2026-09-26 (4.12 against
  3.745): environmental.
- `remote-run npm run verify` fails lint on ryzen because of
  `tools/textures/cache/` in its data mirror. Run the static checks locally
  and `remote-run npm test`.

## 5. Open issues

| # | Issue | State |
| --- | --- | --- |
| 1 | **Page-load freeze on `main`** (26–56 s TSL build). Fixed at 1.24 s cold on `worktree-loading-dossier` (`db044e1`, §3.9); `main` merged into that branch 2026-09-26 and re-measured at 1.08 s | Fixed: `db044e1` is on `main` (checked 2026-10-08) |
| 2 | **Auto tier picks Low on Mark's desktop** (`docs/incidents/2026-09-20-low-tier-hides-trees.md`) | Open; Mark: "leave it for now" (2026-09-26) |
| 3 | **Low shimmers at cloud edges** | Open, cosmetic, Low-only on the legacy comparison path; Takram's separate thin-wisp trade is issue 11 |
| 4 | **Legacy High in-cloud frame pacing:** stutter reported, then "no apparent loss of fps" after the fixes | Unmeasured since the fixes; legacy is no longer the default |
| 5 | **Legacy `photo` at High had 0.6 ms of margin** | Closed as a shipping concern when Takram TSL became the default; K1 separately proved a faster legacy light march but no worthwhile visual improvement |
| 6 | **Views from below read cloudier than the old clouds** (sky fraction is correct) | Mark's call: free-flight `coverage` |
| 7 | **16b/16c look calls:** shadow darkness, `OCEAN_SHADOW_FLOOR` 0.6, sea scaled not tinted at dusk, crimson dusk clouds | Mark's calls, not made |
| 8 | **16b limits:** shadow fade uses the lowest layer only; cirrus casts no shadow; cockpit panel unshadowed; pass runs every frame | Known, unscheduled |
| 9 | **Docs debt:** photoreal Task 14 (handoff, supersede notes) never run, re-filed into `MASTER_PLAN.md` track H0 (2026-10-08); 16d documents lack "superseded" | Housekeeping |
| 10 | **A scenario picked from the title keeps the boot scenario's clouds.** `main.ts` sets `cloudLayers` once at boot, from the boot bundle (free-flight), and builds the cloud field, clouds and shadow pass from it once; `loadScenario` never touches them. Every title-launched scenario therefore flies under free-flight's cumulus and cirrus, although free-flight is the only one that declares clouds. Found 2026-09-26 on `worktree-friendly-fire`: `friendly-fire-range` (no clouds) showed cumulus in a capture and measured gpu p95 6.9 ms when launched from the title, against 2.0 ms booted by `?scenario=` on the reference GPU. The reverse case (a cloudless URL boot, then free-flight from the title, showing no clouds) follows from the same code but was not run. The time of day has the same flaw: `scenarioTimeOfDay` is also assigned only at boot (`main.ts`, one assignment, read 2026-09-26), so a title-launched `strike-range` keeps free-flight's 10:00 sun rather than its own 14:00. Fix: rebuild both from the new scenario's `weather` in the switch. Fixed 2026-10-08 by A2 (`7249619f`): `loadScenario` applies the new scenario's weather; the cloud pass is routed into the output only while there is a deck | Fixed (2026-10-08) |
| 11 | **Takram resolve softens the dense cloud center and the thinnest moving wisps can retain slight breakup.** This is the accepted trade for eliminating the harsh pixelated/flickering boundary in the initial port | Accepted in flight and promoted with the default renderer on 2026-10-11; revisit only if it becomes objectionable in play |

## 6. Proposed next steps

In the order I would take them. Items marked (Mark) need his decision first.

1. **Boot-freeze fix (issue 1): done.** `db044e1` is on `main` (checked
   2026-10-08).
2. **Takram flight evaluation and default promotion: done.** Mark accepted the
   result in play and `takram-tsl` became the DEV and production default on
   2026-10-11 (§1.2).
3. **Auto tier (Mark)** (issue 2): measure after New game, show the chosen
   tier, and add an E2E test that Mark's Chrome gets High. This does
   more for how the clouds look on his desktop than any shader work.
4. **Low edge shimmer** (issue 3): if the legacy comparison renderer remains
   worth maintaining, try a neighborhood-clamped history or a slightly higher
   Low resolution within its budget. Check each back-to-back against a
   frozen-scene flicker burst (the method in §3.8).
5. **Legacy performance work is parked.** K1 found a cheaper light march but
   no perceptible edge improvement (§3.12). Do not resume issue 4 or 5 unless
   the legacy renderer is being reactivated for shipping.
6. **Unify the GPU lock file** across sessions, and chase the
   `waitForTerrain` flake.
7. **Housekeeping** (issue 9), and the stale comments listed in the
   2026-09-26 reconciliation.
8. **Look pass with Mark (Mark)** (issues 6 and 7): one sitting, a fixed set
   of back-to-back captures, decisions recorded here.

## 7. Outside references

Repositories and papers looked at for ideas. The legacy renderer is clean-room.
The opt-in replacement is an original WGSL port guided by Takram's MIT source
and uses the Takram/NVIDIA data assets recorded in `ASSETS.md`; no code or data
from the other references is in the repo. Legacy assets are generated by
`tools/sky/` (see `content/sky/NOTICE.md`).
Licenses were checked on GitHub on 2026-09-26. A repo with no license is
all-rights-reserved: read it for technique, never copy from it.

| Source | What it is | License | Relevance |
| --- | --- | --- | --- |
| [takram-design-engineering/three-geospatial](https://github.com/takram-design-engineering/three-geospatial) | The accepted continuous volumetric density, lighting and temporal reference used by the native WebGPU port | MIT | Ported behind `?cloudRenderer=takram`; exact asset provenance is in `ASSETS.md` |
| [FarazzShaikh/three-volumetric-clouds](https://github.com/FarazzShaikh/three-volumetric-clouds) | Experimental Three.js (WebGL) clouds after Guerrilla's *Nubis, Evolved*: envelope model, Perlin-Worley 3D noise, envelope erosion, adaptive-step ray marching, multi-scatter and anisotropic phase. Self-described as unfinished (last push 2024-09) | **none** | Closest in spirit to our archetype-per-cell envelope (§3.6) and adaptive stepping |
| [Spiri0/volumetric-clouds](https://github.com/Spiri0/volumetric-clouds) | A simple volumetric-cloud implementation with a live demo; the author's focus moved to WebGPU (last push 2024-09) | MIT | A baseline comparison; nothing adopted |
| [CK42BB/procedural-clouds-threejs](https://github.com/CK42BB/procedural-clouds-threejs) | A Claude Code "skill" teaching Three.js clouds: WebGPU/TSL raymarching (Beer-Lambert, HG phase, light march), mesh and billboard fallbacks, all ten genera, time-of-day palettes, WGSL compute noise | MIT | Its cloud-genera parameter notes (`references/cloud-types.md`) are a reasonable source if we ever add genera beyond cumulus and cirrus |
| [jeanjerome/OpenSkyFlight](https://github.com/jeanjerome/OpenSkyFlight) | A browser flight sim over real terrain (Three.js WebGPU/TSL): Terrarium elevation, quadtree LOD, HUD, procedural sky with an animated cloud layer (`js/atmosphere/CloudLayer.js`), dynamic resolution scaling, built-in benchmark | **none** | Same genre and stack; its dynamic resolution scaling and in-app benchmark bear on our auto-tier incident (§5, issue 2) |
| Schneider & Vos, "The Real-Time Volumetric Cloudscapes of Horizon: Zero Dawn", SIGGRAPH 2015 | The Perlin-Worley shape/detail noise, remap erosion, height profiles, Beer-powder | paper (method only) | Basis of `tools/sky/noise.ts` and `cloudField.ts`; cited in `content/sky/NOTICE.md` |
| Schneider, [*Nubis, Evolved*](https://www.guerrilla-games.com/read/nubis-evolved) (Guerrilla Games) | The envelope/voxel cloud model and amortized temporal updates | paper (method only) | Cloud Fidelity II's amortized High march (§3.5); the envelope idea behind the VDB archetype |
| Walt Disney Animation Studios Cloud Data Set | Production VDB clouds | CC BY-SA 3.0 | The unversioned `~/projects/cloud-spike` rendered it for comparison only. **Not shipped**, by the 2026-09-25 ruling in the VDB ledger ("do not ship cloud-spike's disney.bin"). The archetype only borrowed its grid size (`tools/sky/cumulus.py`) |
