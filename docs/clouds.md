# Clouds

The standing reference for the cloud system: what ships, where it lives,
what has been tried and with what result, the traps, and what is next.
Read this before touching anything under `src/render/scene/cloud*` or
`tools/sky/`. Dated handoffs remain the record of each step. This file
points at them and does not replace them. Last reconciled against the repo
on 2026-09-26 at `66451b7`. When you change the cloud system, update the
relevant section here in the same commit.

## 1. What ships (2026-09-26)

- **Layers:** up to four cumulus or cirrus slabs per scenario
  (`weather.clouds` in `content/scenarios/*.json`). A layer's `coverage` is
  the fraction of the **sky** it covers, seen from above
  (`src/sim/scenario.ts`). Free-flight uses 0.45 and deck-quals 0.55; the
  most any layer can reach is 0.636.
- **Cumulus shape:** every cloud is carved from one baked procedural cumulus
  (`content/sky/cumulus.bin.gz`, built by `tools/sky/cumulus.py`). Each copy
  is placed, rotated and scaled by a 1024², two-plane weather map
  (`weather.bin.gz`), then sculpted by packed shape and detail noise and
  displaced by a curl field (`npm run sky:build`).
- **Rendering:**
  - a raymarch at reduced resolution with temporal accumulation
    (`cloudPass.ts`);
  - a density field shared with a sun-view shadow map
    (`cloudField.ts`, `cloudShadow.ts`);
  - lighting from dual-lobe HG, three multi-scatter octaves and powder
    (`cloudLighting.ts`);
  - a movable sun (`sky/sun.ts`, `sky/palette.ts`).
- **Tiers:** `CLOUD_TIERS` in `src/render/scene/clouds.ts` is authoritative.
  As of this date:

| Tier | View steps | Light steps (fine) | Resolution | Update | Distance light LOD |
| --- | --- | --- | --- | --- | --- |
| high | 128 | 6 (2) | 0.5 | 1 texel in 8 per frame | none |
| medium | 56 | 4 (0) | 0.3 | every frame | 1.5–2.5 km |
| low | 32 | 2 (0) | 0.25 | every frame | 1.5–2.5 km |

- **Budget** (`tests/e2e/budget4k.spec.ts` is the gate): gpu p95 at 4K on the
  reference RX 6700 XT.
  - High: 16.67 ms (60 Hz, Mark 2026-09-25).
  - Medium: 8.33 ms.
  - In-cloud views: 20.0 / 9.0 ms (Mark 2026-09-26).
  - Measured 2026-09-26, outside cloud: High 10.6–16.0, Medium 6.9–7.9.
    `photo` at High has 0.6 ms of margin.
  - The 1440p specs are tripwires (8.33 ms total frame), not budgets.
- **Looks Mark has approved:** the `photo` view (tag
  `cloud-vdb-photo-2026-09-26`), and in-cloud flight on High ("no
  apparent loss of fps", 2026-09-26, after the fixes in §3.8).

## 2. Where it lives

| Concern | File |
| --- | --- |
| Tiers, the march, light march, early-outs | `src/render/scene/clouds.ts` |
| Density (weather decode, archetype, noise, coverage twin) | `src/render/scene/cloudField.ts` |
| Reduced-res pass, amortized update, reprojection, resolve, composite | `src/render/scene/cloudPass.ts` |
| History targets | `src/render/scene/cloudHistory.ts` |
| Shadow map (sun-view transmittance) | `src/render/scene/cloudShadow.ts` |
| Phase, multi-scatter, powder | `src/render/scene/cloudLighting.ts` |
| Asset sizes and constants shared by build and loader | `src/render/sky/noise.ts` |
| Noise and weather generators | `tools/sky/noise.ts`, `tools/sky/weather.ts`, `tools/sky/build.ts` |
| Cumulus archetype generator (Python, numpy) | `tools/sky/cumulus.py` |
| Asset provenance | `content/sky/NOTICE.md` |
| GPU gates | `tests/e2e/budget4k.spec.ts`, `clouds.spec.ts`, `cloudTemporal.spec.ts`, `cloudShadow.spec.ts`, `motionBudget.spec.ts` |
| DEV probes | `?cloudTier=off\|low\|medium\|high`, `?cloudDebug=` (depth, layer, shape, density, slab, point, eye, nodepth), `?cloudShadow=off\|show`, `?timeOfDay=`, `?look=yaw,pitch`, `__ww2.clouds()`, `__ww2.cloudShadowAt(x,z)` |

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

## 4. Traps

**TSL and three r186**
- **A graph that fails to build renders black with zero validation
  errors.** So do a TSL `Fn` returning more than one node,
  `smoothstep(0, 0, x)`, and a missing import (`saturate`). A missing
  import also makes timings look spectacular because nothing draws, so
  check the console before believing a big win.
- `uniformArray.element(i)` re-emits at every use, and nested `Loop`
  counters all default to `i`. Capture with `.toVar()` and pass `name:`.
- Hoist int→float conversions into vars: a second inline `toFloat()`
  emits `f32 / i32`.
- `textureSample` must stay in uniform control flow: sample
  unconditionally, then select.
- **A render target written from `uv()` reads back flipped.** Write
  `1 - uv.y`.
- The weather map must be sampled **NEAREST**; filtering blends two
  clouds' frames.
- Portable 3D textures need RGBA8, so detail keeps a padding channel.
- `Math.round` yields `-0`; add `+ 0`.
- A layout-less `Fn` is inlined at every call site. The light march's
  copies caused a ~39 s boot freeze. The fix, one laid-out `Fn` per
  material, is on `worktree-loading-dossier` and not yet on `main` (§5).

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
| 1 | **Page-load freeze on `main`** (26–56 s TSL build). Fixed at 1.24 s cold on `worktree-loading-dossier` (`db044e1`) | Not merged; that branch's owner |
| 2 | **Auto tier picks Low on Mark's desktop** (`docs/incidents/2026-09-20-low-tier-hides-trees.md`) | Open; Mark: "leave it for now" (2026-09-26) |
| 3 | **Low shimmers at cloud edges** | Open, cosmetic, Low-only |
| 4 | **High in-cloud frame pacing:** stutter reported, then "no apparent loss of fps" after the fixes | Unmeasured since the fixes |
| 5 | **`photo` at High has 0.6 ms of margin** | Watch; any cloud cost increase lands here first |
| 6 | **Views from below read cloudier than the old clouds** (sky fraction is correct) | Mark's call: free-flight `coverage` |
| 7 | **16b/16c look calls:** shadow darkness, `OCEAN_SHADOW_FLOOR` 0.6, sea scaled not tinted at dusk, crimson dusk clouds | Mark's calls, not made |
| 8 | **16b limits:** shadow fade uses the lowest layer only; cirrus casts no shadow; cockpit panel unshadowed; pass runs every frame | Known, unscheduled |
| 9 | **Docs debt:** photoreal Task 14 (handoff, §15 row, supersede notes) never run; 16d documents lack "superseded" | Housekeeping |

## 6. Proposed next steps

In the order I would take them. Items marked (Mark) need his decision first.

1. **Merge the boot-freeze fix** (issue 1) once its session finishes. The
   pilot feels it on every load; it is not a cloud-branch change.
2. **Measure High in-cloud frame pacing** (issue 4): p50, p95 and p99, plus
   frame-to-frame deltas, in-deck on the reference GPU. If the variance is
   still large, the next lever is the amortized schedule inside cloud.
3. **Auto tier (Mark)** (issue 2): measure after New game, show the chosen
   tier, and add a Tier 2 test that Mark's Chrome gets High. This does
   more for how the clouds look on his desktop than any shader work.
4. **Low edge shimmer** (issue 3): try a neighborhood-clamped history on
   Low, or a slightly higher Low resolution within its budget. Check each
   back-to-back against a frozen-scene flicker burst (the method in §3.8).
5. **Win back margin on `photo`/High** (issue 5) before adding any new
   cloud feature. Candidates, by expected yield: fewer immediate marches at
   silhouettes, cheaper archetype reads, per-view step tuning.
6. **Unify the GPU lock file** across sessions, and chase the
   `waitForTerrain` flake.
7. **Housekeeping** (issue 9), and the stale comments listed in the
   2026-09-26 reconciliation.
8. **Look pass with Mark (Mark)** (issues 6 and 7): one sitting, a fixed set
   of back-to-back captures, decisions recorded here.

## 7. Outside references

Repositories and papers looked at for ideas. This project is clean-room
and AGPL-3.0: **no code or data from any of these is in the repo**. Every
shipped asset is generated by `tools/sky/` (see `content/sky/NOTICE.md`).
Licenses were checked on GitHub on 2026-09-26. A repo with no license is
all-rights-reserved: read it for technique, never copy from it.

| Source | What it is | License | Relevance |
| --- | --- | --- | --- |
| [FarazzShaikh/three-volumetric-clouds](https://github.com/FarazzShaikh/three-volumetric-clouds) | Experimental Three.js (WebGL) clouds after Guerrilla's *Nubis, Evolved*: envelope model, Perlin-Worley 3D noise, envelope erosion, adaptive-step ray marching, multi-scatter and anisotropic phase. Self-described as unfinished (last push 2024-09) | **none** | Closest in spirit to our archetype-per-cell envelope (§3.6) and adaptive stepping |
| [Spiri0/volumetric-clouds](https://github.com/Spiri0/volumetric-clouds) | A simple volumetric-cloud implementation with a live demo; the author's focus moved to WebGPU (last push 2024-09) | MIT | A baseline comparison; nothing adopted |
| [CK42BB/procedural-clouds-threejs](https://github.com/CK42BB/procedural-clouds-threejs) | A Claude Code "skill" teaching Three.js clouds: WebGPU/TSL raymarching (Beer-Lambert, HG phase, light march), mesh and billboard fallbacks, all ten genera, time-of-day palettes, WGSL compute noise | MIT | Its cloud-genera parameter notes (`references/cloud-types.md`) are a reasonable source if we ever add genera beyond cumulus and cirrus |
| [jeanjerome/OpenSkyFlight](https://github.com/jeanjerome/OpenSkyFlight) | A browser flight sim over real terrain (Three.js WebGPU/TSL): Terrarium elevation, quadtree LOD, HUD, procedural sky with an animated cloud layer (`js/atmosphere/CloudLayer.js`), dynamic resolution scaling, built-in benchmark | **none** | Same genre and stack; its dynamic resolution scaling and in-app benchmark bear on our auto-tier incident (§5, issue 2) |
| Schneider & Vos, "The Real-Time Volumetric Cloudscapes of Horizon: Zero Dawn", SIGGRAPH 2015 | The Perlin-Worley shape/detail noise, remap erosion, height profiles, Beer-powder | paper (method only) | Basis of `tools/sky/noise.ts` and `cloudField.ts`; cited in `content/sky/NOTICE.md` |
| Schneider, [*Nubis, Evolved*](https://www.guerrilla-games.com/read/nubis-evolved) (Guerrilla Games) | The envelope/voxel cloud model and amortized temporal updates | paper (method only) | Cloud Fidelity II's amortized High march (§3.5); the envelope idea behind the VDB archetype |
| Walt Disney Animation Studios Cloud Data Set | Production VDB clouds | CC BY-SA 3.0 | The unversioned `~/projects/cloud-spike` rendered it for comparison only. **Not shipped**, by the 2026-09-25 ruling in the VDB ledger ("do not ship cloud-spike's disney.bin"). The archetype only borrowed its grid size (`tools/sky/cumulus.py`) |
