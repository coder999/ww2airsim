# Appendix: source readings for the clouds research (2026-10-10)

Verbatim reports from the source-reading agents, kept for their file and line references. The
main document is `2026-10-10-clouds-fresh-approach-research.md`. Repositories were cloned
read-only into `~/projects/cloud-research/` and never built or executed.

## A. chrismaldona2/tsl-procedural-stylized-clouds, leoawen/volumetric-clouds, leoawen/volumetric_cloud_atmosphere_scattering, xiaxiangfeng/sky-cloud-3d

Bottom line: none of the four is a usable base for photo-like cumulus. leoawen's atmosphere repo is the only one with the right architecture: a planet shell, a weather map, Schneider-style remap/erosion, MRT colour plus depth, and aerial perspective applied to the clouds. Its noise and lighting are too weak for hard billows, though. The TSL repo is useful only for TSL idioms. sky-cloud-3d is non-commercial licensed, so do not copy it.

### 1. tsl-procedural-stylized-clouds (chrismaldona2)

- License: none (package.json `private: true`): all rights reserved. Patterns only.
- Stack: WebGPU, TSL, three ^0.182.0, R3F v10 alpha; last commit 2026-02-27; a single-cloud demo.
- Density: NOT volumetric. An SDF surface (`src/components/clouds/clouds.tsx:262-384`): a domain-warped sphere smooth-maxed with a plane (`:311-314`, the flat base); "fluff" from two Worley taps plus a bump tap added to the SDF (`:344-370`), faded by a depth mask so only the shell is eroded (`:324-332`). Noise is compute-baked into a `Storage3DTexture` of 32^3 (`use-voronoi-texture.ts:93-118`), 4 octaves of inverted-squared Worley at 4/8/16/32 cells (`:76-88`); the top two octaves alias.
- Ray march: sphere tracing from the box face (`:457-480`), breaks with the camera inside; `Discard` on miss; a cheap bound gates the noise (`:274-282`), the one good idea.
- Lighting: NPR on a 4-tap normal (`:390-408`), IQ soft shadow (`:413-449`), cel ramp (`:508-513`), Fresnel rim (`:561-582`). No phase, Beer, transmittance or alpha. No temporal, no depth, no atmosphere.
- TSL idioms worth copying: `Storage3DTexture` + `textureStore` inside `Fn`, `.compute(N)`, `await renderer.computeAsync(node)` (`use-voronoi-texture.ts:66-91, 97-118`); tileable Worley via `mod(pi+neighbor, cells)` in nested `Loop(3)` with `.toVar()` counters (`:37-64`); `texture3D(tex)` once then `.sample(coords).r` many times (`clouds.tsx:241, 344-366`); `If(...).Else(...)` gating expensive noise on a cheap bound (`:279-376`); `Loop(uniformCount)` with `Break()` (`:419-446, 462-480`).
- Avoid: the SDF surface, the 32^3 multi-octave bake, Fresnel as a silver lining.

### 2. volumetric-clouds (leoawen)

- License MIT. WebGL2, GLSL3, three 0.160.0 via CDN (`index.html:30-35`); last commit 2025-09-03; single-file demo, README says vibecoded.
- Density: CPU bake of Perlin fBm into 96^3 R8 (`index.html:1163-1236`), 5 octaves, lacunarity 3.0, persistence 0.5, noiseScale 3.5 (`:439-447`); coverage thresholded AT BAKE TIME, `smoothstep(cov-0.05, cov+0.05, value)` (`:1207`), so the field is nearly binary in 8 bits. Envelope: an ellipsoid whose radius is displaced by two 128^3 Perlin textures sampled on the unit direction, purely radial (`:192-227`, bake `:661-694`). Formula `:266-290`. No height profile, weather map or types. Wind is a texture-offset scroll (`:1263-1272`).
- Ray march: box slab (`:243-254`), fixed 44 steps (`:337`), static blue-noise start jitter (`:339-340`), early-out `length(T) < 0.01` (`:391`), no empty-space skip, camera-inside works (`:325`, BackSide `:948`).
- Lighting (`:184-185, 232-240, 296-309, 360-392`): `uLightSteps` default 1; Beer only, no powder, no multi-scatter; phase `mix(HG(-0.3), HG(0.3), 0.8)` (no silver lining); constant ambient; spectral extinction `vec3(0.6,0.65,0.7)`; scattering not scaled by (1-T)/sigma (not energy conserving).
- Integration: scene occlusion by re-rendering solids to a depth texture and breaking the march past it (`:327-352, 1277-1283`); god rays from a half-res occlusion pass and a 120-sample radial blur (`:1067-1151, 1285-1338`); the scene is rendered three times.
- Quality: near-binary 8-bit density trilinearly filtered gives voxel-shaped isosurfaces (the terraced edge failure); octaves 3-4 are aliased at 96 voxels with lacunarity 3 (27, 9, 3, 1, 0.33 voxels per cycle); one blob envelope with softness 0.17; one light step and constant ambient give little contrast.
- Adopt: stopping the march at opaque depth (with the pipeline's own depth buffer); blue-noise start jitter. Avoid: thresholding into the bake, lacunarity-3 octaves at low resolution, radial-displacement envelope, 1-step lighting, screen-space god rays.

### 3. volumetric_cloud_atmosphere_scattering (leoawen)

- License MIT. WebGL2, GLSL3, three 0.165.0 (`index.html:110-111`), logarithmic depth (`:1609`); last commit 2026-01-30; planet-scale single file with a floating origin (`:1581-1600, 2806-2880`); README credits Google AI.
- Bakes: GPU fragment shaders rendered slice by slice and read back to the CPU into 8-bit `Data3DTexture`s with mipmaps (`:1767-1825, 1828-1894`). Base 256^3 R8 (`:142`, shader `:479-509`): 4-octave periodic Perlin fBm mixed 0.3 with 3-octave inverted Worley, `f = mix(f, f*f, 0.3)`, contrast 1.8; cubic (not quintic) Perlin interpolation (`:397`). Detail 32^3 RGBA8: single-octave inverted Worley at 2/4/8 cells per channel (`:591-607`). Weather 64^2 RGBA16F: R coverage `smoothstep(0.2,0.8,fbm)`, G type (`:692-704`), lat/long mapped (`:892-902`).
- Density (`sampleCloud`, `:882-987`), the Schneider form: coverage -> local height `uWeatherHeightMax*pow(cov, curve)` (`:908-911`); `shapeBottom = pow(smoothstep(0, shapeBase, h), curve)`, `shapeTop` (`:943-944`); `density = remap(baseDensity, 1 - dynamicCoverage, 1, 0, 1)` (`:958`); `highFreqFBM = r*0.625 + g*0.25 + b*0.125` (`:972`); erosion `1 - highFreqFBM` in "popcorn" mode (`:973`); `density = remap(density, erosion*strength, 1, 0, 1)` (`:977`); then `smoothstep(threshold, threshold+softness)` in the march (`:1075`). Missing: height-dependent erosion, curl distortion. Scales: one base tile about 91 km, 355 m per voxel; detail about 9 km tiles, finest cells about 1.1 km (`:221-233`). Wind `:2856-2870`.
- Ray march (`:989-1147`): planet-shell intersections with camera below/inside handled (`:1003-1032`); steps start at 500 m and grow x1.001, capped 3 km (`:1145-1146`); 800 iterations with a 64-hit quota (`:1137`); no back-step on re-entry (`:1139-1142`); golden-ratio-animated blue noise within the step (`:1035-1063, 2942-2949`), static near the camera (`:1062`); early-out at alpha >= 0.99 (`:1056`).
- Lighting (`:850-878, 1079-1131`): ONE density sample toward the sun at `max(step, 500 m)` (`:1082-1085`); `beer = exp(-shadowDens*20)`; a powder term that BRIGHTENS dense regions (inverted); phase `mix(HG(0.6), HG(-0.2), 0.5)` (`:856-858`); per-sample analytic sun air mass (`:861-878`); ambient a hard-coded blue gradient, unoccluded by default (`:1104-1116`); no multi-scatter; alpha-blend accumulation (`:1122-1131`); transmittance-weighted cloud depth (`:1127, 1150`).
- Temporal: 0.6x resolution (`:259, 1990-1991`); MRT RGBA16F colour + R32F depth (`:1994-2017`); reprojection with the weighted depth and the previous view-projection (`:1152-1170`), blend `min(0.3, 0.97)*(1 - smoothstep(0, supp, |dA|))`, no neighbourhood clamp; BUG: camera pinned at the origin so only rotation is reprojected (`:2806, 3089`); bilinear upsample (`:1340`).
- Atmosphere (`:1182-1407`): 16-step Rayleigh+Mie+ozone single scattering per pixel (`:1258-1317`), Hillaire/Bruneton coefficients (`:312-323`), Cornette-Shanks g 0.85; aerial perspective applied to clouds with the weighted depth (`:1381-1392`), a second 16-step march for cloud pixels; sun-visibility 1x1 target with 13 taps and hysteresis for halo and shafts (`:1519-1568`); god rays (`:1424-1516`); ACES + gamma 2.2 (`:1401-1406`). No cloud shadow on terrain.
- Quality: the remap order and `1 - worley` erosion are right; soft blobs come from planetary scales, 8-bit bakes with contrast 1.8, single-octave detail channels, height-independent erosion, a single 500 m shadow tap (the main cause of low contrast), unoccluded ambient, no multi-scatter; banding from 500 m steps leaning on a broken TAA.
- Adopt: shell bounds (`:1003-1032`); weather coverage and height (`:904-911`); remap/erosion order (`:958, 972-977`); MRT colour + weighted depth for reprojection and aerial perspective (`:1127, 1150, 1385-1391`); sun-visibility hysteresis (`:1519-1568`); distance fade of erosion (`:967-978`). Avoid: CPU readback bakes, 8-bit density, geometric growth without back-step, single shadow tap, rotation-only reprojection, per-sample air mass, the inverted powder.

### 4. sky-cloud-3d (xiaxiangfeng)

- License: non-commercial only (a stray `.webgl` header claims MIT; the LICENSE governs). Do not copy code.
- Stack: WebGPU, TSL `NodeMaterial`, three ^0.183.0; last commit 2026-03-06; `SkyCloudMesh` is a 20 km BackSide sky sphere (`SkyCloudMesh.js:916-930, 802-816`).
- Density (`:605-664`): CPU-baked tileable Perlin 96^3 R8, 4 octaves, `smoothstep(0.16, 0.88)` (`:268-312`), or a 2D PNG sampled on xz only (`:611-618`); fBm with an IQ rotation and lacunarity 2.76; `density = smoothstep(cov-0.04, cov+0.12, density + detailLift)`, self-sharpened, height-windowed. Single slab, no weather map or types.
- Ray march (`:683-790`): plane-slab with a distance cap; 22-56 steps adapted to grazing angle and path length (`:703-710`); non-temporal hash jitter; early-out T < 0.01; no empty-space skip.
- Lighting: 5 fixed light steps of 5 units (`:666-681`); art-directed lerps, no phase; forward glow `pow(dot(rd, sun), 3.2)`; a Preetham sky port (`:451-603`); `sky*(1-a) + cloud` (`:792-799`). No temporal, no depth, no shadows.
- Adopt conceptually only: the adaptive step count (`:703-710`).

### Overall

- Causes of soft blobs or terracing seen in these repos: 8-bit baked fields with coverage baked in; octaves above Nyquist for the texture size; cubic Perlin; radial displacement of an ellipsoid; height-independent erosion; single-tap lighting; no multi-scatter; non-temporal jitter.
- Worth taking: remap(base, 1-cov) then remap(erosion with `1 - worley` fBm), with height-dependent erosion added; weather coverage and height; shell bounds with camera in/below; weighted cloud depth in the MRT for reprojection and aerial perspective; sun-visibility hysteresis; ray stop at opaque depth; the compute 3D-texture bake pattern.
- None provide aircraft-scale billow detail, multi-octave scattering, cloud shadows on terrain, or correct reprojection under translation. None state performance numbers.

## B. jeantimex/procedural-clouds and frmlinn/clouds-sim

Neither is a visual base for photographic cumulus; both are small demos (9-12 units across) with no depth buffer, no ground shadows and no large-world handling, and each repeats at least one cause of the in-house "low-poly blobs with terraced shading" result.

### jeantimex/procedural-clouds
- MIT (2026 Su). Native WebGPU + WGSL, no Three.js, Vite 6; last commit 2026-02-08. A port of a Blender node-graph cloud shader (`plan.md`); `ref/blender_noise.glsl` and `ref/blender_voronoi.glsl` are Blender GPU shader copies marked GPL v2+ (only the root is MIT).
- Density (`shaders/cloud.wgsl:75-135`, noise `shaders/noise.wgsl`): 4D Perlin (Jenkins hash, `noise.wgsl:138-173`), fBm (`:175-202`), 4D Voronoi F1 with 81 neighbour cells per octave (`:303-334`, fractal `:336-380`); no curl, no Perlin-Worley. Baked by compute (`cloud.wgsl:246-255`) into a 3D `rgba16float` storage texture, default 96^3 (`main.js:174-188, 295-300`), ping-ponged every 2 frames (`main.js:398-417`), only `.r` used. Formula `:104-134`: altitude mask x Perlin, Voronoi F1 UNINVERTED (density rises toward cell boundaries: foam of voids, the opposite of billows), `clamp01` saturation chains. Wind is the 4D W axis (morph in place, `main.js:386`). Bug: UI Scale also feeds `scaleAlt` (`main.js:330-335`).
- March (`cloud.wgsl:191-240`): box, fixed 48 steps over the chord (about 3x the voxel size), static IGN start jitter (`:186-189, :212`), early exit T < 0.01, no empty-space skip, camera-inside via `max(tNear, 0)`.
- Lighting (`:165-184, 217-227`): 4 fixed 0.15-unit light steps (0.6 units reach), `exp(-shadow*5)`; phase `mix(1.0, HG(0.45), 0.6)` (constant dominates, little silver lining); `(1-exp(-d))` as powder everywhere; constant ambient; no multi-scatter, no sunset; Reinhard + gamma (`:237-238`).
- Temporal: none (full-res x DPR, `main.js:254-258`); the density-cache blend is broken (`main.js:386-417`, `cloud.wgsl:64-67`: blend clamps to 1, tex0 never displayed, "Cache Smooth" is a no-op).
- Integration: none. Performance: no numbers; the bake is about 650 hash/distance evaluations per voxel (about 0.6 G per bake, every 2 frames), octaves above the cache's Nyquist are aliased compute.
- Native WGSL vs TSL: nothing here TSL cannot express in r186 (`Storage3DTexture`, `textureStore` at `src/nodes/accessors/StorageTextureNode.js:313`, bitcast, workgroup ops); the real constraint is WebGPU: the storage-writable AND filterable format in core is effectively `rgba16float` (`r32float` needs `float32-filterable`).
- Adopt: compute-baked low-frequency density in a camera-relative volume with high-frequency detail from tiled noise at march time; IGN as a dither source if animated and fed into a temporal accumulator. Avoid: per-voxel 4D Voronoi, uninverted F1, clamp chains, fixed steps over the chord, short fixed light steps, constant ambient, the cache blend.

### frmlinn/clouds-sim
- MIT (2026 frmlinn). WebGL2 GLSL ES 3.00, no WebGPU, no Three.js; Vite 8, tweakpane; last commit 2026-05-19. Live path `src/main.js` -> `src/simulation/Pipeline.js`; `CloudsSolver.js` and `conf.js` are dead.
- Noise baked once on the CPU in a worker (`noise.worker.js:10-11`): base 64^3 (freq 3, 4 oct), detail 32^3 (freq 6, 3 oct), uploaded as R8 (`utils.js:73-85`). Per octave `pw = valueNoise*0.6 + invertedWorley*0.4` (`noise-generator.js:107-137`; the "Perlin" is value noise `:81-98`, Worley `1-F1` `:52-75`, a 256-entry sin-fract hash `:12-33`).
- Density (`cloud.frag:54-77`, duplicated `shadow.frag:248-271`): height gradient smoothsteps, box-wall fade, `base = remap(tex, 1-coverage, 1, remapMin, remapMax)`, `erosion = detail * weight * mix(0.2, 1, smoothstep(hMin,hMax,h))` (height-weighted), `density = remap(base, erosion, 1, 0, 1) * densityMult`. Defaults coverage 0.48, densityMult 12 (`config/state.js`); presets are height bands only (`config/presets.js`); no weather map.
- March (`cloud.frag:137-207`): box (6,3,6), fixed 40 steps over the chord (about 5x the texel size), blue-noise PNG jitter with `frame%64 x golden ratio` (`:105-109`), early exit T < 0.01, no skipping.
- Lighting (`:125-135, 183-201`): phase `mix(mix(HG(g>=0.7), HG(-0.2), 0.3), 1.0, 0.3)` with g 0.95; 3-octave multi-scatter on extinction only `exp(-t) + 0.5 exp(-0.25 t) + 0.2 exp(-0.05 t)` (`:188-191`); unconditional powder `1-exp(-2d)`; height-gradient ambient (`:196-197`); no sunset.
- Temporal: 0.5x resolution capped at 1080p (`Pipeline.js:43-60`), Halton jitter, a plain EMA TAA with no reprojection, clamp or rejection (`taa.frag`, `Pipeline.js:254-259`); ghosts under wind, raw noise while moving.
- Shadow pass (`shadow.frag:299-326`, `Pipeline.js:127-165`): a 512^2 R16F sun-space orthographic map storing the TOTAL column optical depth (25 steps); consumed as `columnTotal * (1 - depthFraction)` (`cloud.frag:183-186`), a linear ramp, so real self-shadow structure is lost. No ground shadows (the grid never samples it), no depth compositing, no aerial perspective, mediump.
- Performance: no numbers; shadow pass well under 0.5 ms, march about 1 ms at 0.5x; cheap because low quality.
- Adopt: the pass structure (sun-space pre-pass, low-res march, temporal resolve, upscale, `Pipeline.js:67-76`); the 3-octave multi-scatter (upgrade with per-octave phase flattening); height-gradient ambient; height-weighted erosion; blue noise with a golden-ratio frame offset; a sun-space map IF it stores depth-resolvable data (front depth, mean extinction, max optical depth) and is sampled at terrain and sea points. Avoid: R8 noise, value-noise mix, the linear column shadow, unconditional powder, EMA without reprojection, fixed steps over the chord.

### Cross-cutting
1. Baking density into a coarse 3D texture and thresholding it gives faceted blobs. Keep high-frequency erosion from finely tiled noise at sample time (or a high-resolution tiled detail texture, e.g. 128^3 mipmapped), never from a camera-scale cache.
2. Terracing comes from 8-bit noise behind steep remaps and from steps much larger than texels. Use 16-bit or float noise, distance-adaptive steps, per-frame blue noise with a reprojected, clamped temporal resolve.
3. Strong lit/shadow contrast needs true transmittance toward the sun: a real light march, or a sun-space map that resolves depth.

## C. The three "skill" sources: linegel threejs-volumetric-clouds, CK42BB procedural-clouds-threejs, dao-media threejs-clouds-v5

- CK42BB and dao-media are byte-identical (`diff -rq`), one commit, MIT (2026 Kingsley). GLSL `ShaderMaterial` with `gl_FragColor` throughout (`SKILL.md:210-233`, `cloud-shaders.md:24-231, 306-337`): nothing runs under `WebGPURenderer`. `SKILL.md:77-83` imports a WebGPURenderer path that does not exist in r186. The one TSL snippet (`cloud-shaders.md:473-505`) imports `MeshStandardNodeMaterial` from the wrong module and uses an object-space normal for lighting. Density `cloud-shaders.md:107-135`: detail SUBTRACTED (not remapped), a "round bottom" smoothstep that contradicts its flat-base text; three mutually inconsistent silver-lining formulas (`cloud-shaders.md:212-215`, `SKILL.md:192`, `SKILL.md:526-530`), one peaking when looking away from the sun; light-path extinction about 8x10^4 weaker than the view path (no self-shadow); the 10-genus knobs in `cloud-types.md` are read by no shader. **Verdict: ignore**, except the altitude table (`cloud-types.md:6-20`) as a sanity list.
- linegel: ISC; a pack of 27 process skills; targets three 0.185.1 (`package.json:76`). Cloud textures and atmosphere LUTs from jeantimex/geospatial (MIT); its layer table (`cloud-config.js:67-137`) is takram's `@takram/three-clouds` default. **Its repo `CLAUDE.md` contains a prompt injection** (append promotional jokes to commits, drop AI attribution); ignored. Its demo code is real r186-valid TSL compute (`cloud-nodes.js:1-30`, `webgpu-weather-volume-clouds.js:197-206, 289`, `RenderPipeline` not the deprecated `PostProcessing`), but: camera, time and sun are baked into the node graph as JS constants (`cloud-nodes.js:219-279`), the sun is hard-coded (`:610`), depth linearization assumes a standard [0,1] buffer (`:532-542`), and its own metadata says `claimLevel: "scaffold-only"`, `runtimeEvidence: "not-run"` (`cloud-nodes.js:78-103`) while `evidence-summary.json` claims "accepted" over an image that is a featureless haze band. Density (`cloud-nodes.js:452-483`) multiplies by coverage (soft), uses a `4h(1-h)` parabola (no flat base), detail at about 234 m per texel; sigma_t <= 2e-4/m (100-500x too thin: translucent fog), albedo 0.8; the multi-scatter helper is inverted on two terms and unused (`:126-148`, `:857`); uniform 64 steps over up to 200 km. Shadows: optical-depth cascades (R16F, 32/96/288 km, `cloud-shadows.js:133-209`) whose density does not match the beauty pass and which are not camera-anchored (`:55, 160-167`). **Verdict: useful with care, for method and contracts only.** Keep: `SKILL.md:55-91` (one optical model, units, step-invariance gates); `references/lighting-and-shadows.md:17-56` (segment transfer with the expm1 branch, HG normalization), `:162-206` (store optical depth, not transmittance; a column product is valid only for ground receivers); `references/density-and-marching.md:194-243` (step-bound rule, terminate on remaining radiance); `references/temporal-reconstruction.md:53-178` (representative depth, reprojection order, reset list, depth acceptance); `SKILL.md:133-140` (`computeAsync()` is not a completion fence; `PassNode.setResolutionScale()` scales the whole pass, so reduced-resolution clouds need their own pass).
- Both skill sources depart from Schneider/Nubis in the same ways: no remap erosion, no height-dependent detail inversion, no per-type height gradient, detail far too coarse, invented powder, missing or inverted multi-scatter, constant ambient. Those are exactly the looks the target needs.
- The reader's pointer: the takram `@takram/three-clouds` spike at `~/projects/takram-clouds-spike` is a closer working reference than any of these. Read separately (section E).

## D. The literature: Nubis 2015/2017/2022/2023, Frostbite 2016, Meteoros

Sources as read: the 2015 HZD deck PDF (formulas read from slide images, "15 p.N"); the 2017 Nubis PDF plus the slide and notes XML range-fetched from its PPTX, which exposed three hidden code slides ("17 p.N", "17 hidden slide N"); the 2022 Nubis Evolved speaker notes from its PPTX ("22 s.N"); the 2023 Nubis3 ("Nubis Cubed") notes and code ("23 s.N"), the talk that describes the voxel model and flying through billowy clouds; Hillaire's 2016 Frostbite course notes ("FB p.N"). Not read: GPU Pro 7 (Schneider 2016), offline. Downloads in `/tmp/nubis-dl` for the session.

### 1. Density, 2015 and 2017
- Shape texture (15 p.31-33): 128^3 RGBA. R is Perlin-Worley (inverted Worley fBm "used as an offset to dilate Perlin"), G/B/A Worley at rising frequencies. Detail (15 p.34): 32^3 RGB Worley. Curl (15 p.35): 128^2, 3 channels, distorts the detail lookup. Perlin-Worley (17 p.34): `remap(perlin, 1 - worley, 1, 0, 1)`. Remap (17 p.28): `new_min + ((v - o_min)/(o_max - o_min))*(n_max - n_min)`.
- Full sampler, 17 hidden slide 40:
  ```
  p += height_fraction * wind_direction * 500.0;            // skew over height
  p += (wind_direction + float3(0,0.1,0)) * time * 10.0;    // wind, small upward bias
  low_freq_fBm = g*0.625 + b*0.25 + a*0.125;
  base_cloud = Remap(r, -(1.0 - low_freq_fBm), 1.0, 0.0, 1.0);
  base_cloud *= GetDensityHeightGradientForPoint(height_fraction, weather_data);
  coverage = pow(coverage, Remap(height_fraction, 0.7, 0.8, 1.0, lerp(1.0, 0.5, anvil_bias)));
  base_cloud_with_coverage = Remap(base_cloud, coverage, 1.0, 0.0, 1.0) * coverage;
  // expensive path only:
  p.xy += curl.rg * (1.0 - height_fraction) * 200.0;
  hf = tex3D(detail, p * 0.1);  high_freq_fBm = r*0.625 + g*0.25 + b*0.125;
  mod = lerp(high_freq_fBm, 1.0 - high_freq_fBm, saturate(height_fraction * 10.0));
  final = Remap(base_cloud_with_coverage, mod * 0.2, 1.0, 0.0, 1.0);
  ```
- Height gradients (17 p.28-29): only stratus is numeric, `remap(h,0,0.1,0,1) * remap(h,0.2,0.3,1,0)`; cumulus and stratocumulus are the same two-remap shape with moved points, constants unpublished. 2015 (15 p.36): three presets blended by type.
- Weather map. 2015 (15 p.42-44): R coverage, G precipitation, B type; drawn within 35 km, beyond 15 km forced toward cumulus at about 50% coverage (15 p.47); layer 1500-4000 m (15 p.75). 2017 (17 p.53-58): about 100 km^2; R and G two coverage variants (Perlin: connected; Perlin-Worley: islands); B type 0 stratus, 0.5 stratocumulus, 1 cumulus. Coverage is not animated, only the noise scrolls (17 p.45).
- Why remap, not multiply (17 p.36): it "prevents a loss of too much density at the core"; erosion removes material only near the edge (15 p.78).
- What makes billows and hard edges (reader's inference): billows from inverted Worley (the R dilation, the G/B/A octaves, the `1-hf` detail above h > 0.1); wisps at the base from non-inverted detail below h = 0.1 plus curl (15 p.39); hard edges from the threshold remap `Remap(x, t, 1, 0, 1)`, which steepens the gradient by 1/(1-t), applied twice.
- Spatial frequencies: no Guerrilla 2015/2017 source gives tile sizes in metres; the only metre-scale constants are the 500 skew, 200 curl and 10/s wind, assuming metres.

### 2. Density, 2022 and the 2023 voxel model
- Sky clouds, vertical-profile model (22 s.17-37): 2D "Nubis Data Fields" over 16 km (s.18): min height, max height (256-2048 m), coverage, top type, bottom type (0 dense and wispy, 1 ragged) (s.20); top and bottom gradients multiplied give the vertical profile; `dimensional_profile = vertical_profile * coverage` (s.29); one 128^3 RGBA noise (Perlin-Worley plus inverted Worley octaves) as a wispy-to-billowy composite (s.33); `cloud_density = saturate(noise_composite - (1.0 - dimensional_profile))` (s.34, "the dimensional profile tells us how deep to carve"); `noise_pos = pos - wind*scroll` (s.37).
- Envelope model for fly-through orographic clouds (22 s.97-106), motivated by vertical-profile tests being too costly inside a field and temporal upscaling not resolving in time when flying (s.90-93):
  ```
  height_fraction = Remap(height, min_height, max_height, 0, 1);
  top_gradient = pow(1 - height_fraction, 1.5); bottom_gradient = pow(height_fraction, 2.0);
  edge_gradient = Remap(sample_height, 0.0, 35.0, 1.0, 0.0);
  dimensional_profile = bottom*top*edge;
  noise_height_blend = Remap(height_fraction, cloud_type+0.1, cloud_type-0.1);
  composite = lerp(wispy_noise, billowy_noise, noise_height_blend);
  noise_sample_pos.z += (1 - saturate((max_height-min_height)*0.0125)) * 40.0;
  cloud_density = height_fraction * pow(saturate(noise_composite - (1 - dimensional_profile)), 0.27);
  ```
- Voxel model, 2023 (23 s.68-109): an 8 m grid holding the dimensional profile (BC4) from an SDF of fluid-sim clouds, plus detail type and density scale (BC6) and a separate SDF (BC1); 8 m chosen because 2 m would need 2048x2048x256. New 128^3 RGBA detail: R/G low and high "Curly-Alligator" (wispy), B/A low and high Alligator (billowy), sampled at `pos*0.01` (tiles every 100 m) with distance mip (s.90-92). Wispy `lerp(n.r, n.g, profile)`; billowy `lerp(n.b*0.3, n.a*0.3, pow(profile,0.25))`; composite lerp by type: low frequency at the core, high at the surface (s.95-100). Within 50-150 m of the camera a "twice-folded" noise `1-pow(abs(abs(g*2-1)*2-1),4)` adds detail without another fetch (s.103-109). Erode the profile with a remap, multiply by density scale, sharpen `pow(d, lerp(0.3, 0.6, pow(densityScale,4)))`. Stated result 0.5 m effective precision from 8 m voxels (s.108). 2023 moved to voxels because the close-up shapes "just wasn't there" (s.52).

### 3. Lighting
- Light march. 2015: 6 cone samples toward the sun, the last far away for distant clouds' shadows; cheap samples once view alpha passes 0.3 (15 p.85-86). 2017: 5 cone samples plus the far one, LOD rising per sample; hidden slide 73: `p += light_step + cone_spread*noise_kernel[i]*i; mip += i*0.5`. 2022 sky: 10 samples over 256 m, spacing increasing (22 s.41); orographic: 10 over 128 m on the noise-free profile (s.110). 2023: first two live, the rest from a 256x256x32 summed-density grid amortized over 8 frames at 0.1-0.2 ms, about 40% cheaper, long inter-cloud shadows (23 s.113-115). Frostbite: 4 shadow samples, geometric spacing, temporally jittered (FB p.36).
- Beer and powder (2015): `Energy = e^(-d r) * HG * P` (15 p.71, 87); powder `1 - e^(-2d)` (p.62), view-dependent ("only where the view vector approaches the light vector", p.66/68). The `2 e^(-d)(1 - e^(-2d))` normalization is attributed to GPU Pro 7, unverified.
- Phase (2017): `max(HG(cos, 0.6), silver_intensity * HG(cos, 0.99 - silver_spread))` (17 p.80-82); the second lobe because one g gave no sunset highlights and a higher g darkened 90 deg (p.78-79). The slide's HG ends `/ 4.0 * PI`, a bug for `/(4 PI)` (p.77).
- Multiple scattering, 2017 hidden slide 70 (shipped):
  ```
  primary = exp(-dl); secondary = exp(-dl*0.25)*0.7;
  attenuation = max(Remap(cos_angle, 0.7, 1.0, secondary, secondary*0.25), primary);
  depth_prob = lerp(0.05 + pow(ds_lodded, Remap(h, 0.3, 0.85, 0.5, 2.0)), 1.0, saturate(dl/step_size));
  vertical_prob = pow(Remap(h, 0.07, 0.14, 0.1, 1.0), 0.8);
  light_energy = attenuation * depth_prob * vertical_prob * phase * brightness;
  ```
  This in-scatter probability replaced 2015's powder; `vertical_prob` darkens bases; nothing is clamped (HDR, 17 p.93).
- 2022: `Direct = T*Phase1 + MS*Phase2` (22 s.43); base eccentricity 0.2 plus several art-directed lobes for the silver lining (s.48-49). MS (s.54): `ms = Remap(profile*step, 0.1, 1, 0, 1) * pow(coverage*type, 0.25); ms *= pow(attenuated_light, cMSDepthPower); ms *= pow(height_fraction, cMSHeightPower)`, exponents not given. 2023: `ms = profile * exp(-sumDensity * Remap(sun_dot, 0, 0.9, 0.25, Remap(cloud_sdf, -128, 0, 0.05, 0.25)))` (23 s.123), inner glow toward the sun and deep inside.
- Ambient: 2015 rises with height (15 p.90); 2022 `pow(1 - profile, 0.5)` (s.59); envelope `pow(1 - coarse, 0.25) * height_fraction` (s.113); 2023 times `exp(-summed density toward the sky)` (23 s.128); Frostbite an SH probe DC term with a linear bottom-to-top gradient and artist scale/desaturate (FB p.35-36).
- Silver lining and sunset come from the second HG lobe and the 2017 cos_angle attenuation; dark undersides from `vertical_prob` or the height power plus the ambient fade. No source has a separate red-underside term; sunset colour comes from sun and sky colours (15 p.90).
- Frostbite: extinction sigma_t cumulus [0.05, 0.12], stratus [0.04, 0.06], albedo about 1 (FB p.32; per metre by the reader's reading); energy-conserving step `S_int = (S - S exp(-sigma ds))/sigma`, 21 samples matching 512 naive (FB p.38-39, Eq. 17); dual-lobe `lerp(HG(g0), HG(g1), w)` (Eq. 18, values not given); Wrenninge octaves with a <= b (Eq. 19-20), N = 2 shipped, values not given.

### 4. Ray march and performance
- 2015: 64 samples looking up, 128 at the horizon; cheap low-frequency samples at large steps until a hit, step back, full samples, back to cheap after several zeros, exit at alpha 1 (15 p.77-83); naive 20 ms; quarter-res buffer updating 1 of 16 pixels per 4x4 block with reprojection, low-res fallback where reprojection fails, 10x faster, about 2 ms on PS4 (p.93-95).
- 2017: 54-96 samples; cheap mode after 10 zero expensive samples; light march only where density > 0 (17 p.95). PS4 ladder (p.97-98): baseline + reprojection 22 ms; + LOD and adaptive step 8.1; + light only on nonzero density 3.34; + cull below horizon 1.81; + depth culling 1.2.
- 2022: step `3.0 + 60.0*dist/16384` m (22 s.39); 480x270 working buffer upscaled to 1080p, 1 pixel per 4x4 per frame, 16 ms to about 2 ms on PS5 (s.81-82); fast clouds gave "pixel soup", fixed with motion vectors from cloud world position plus wind scroll (s.152-158); fly-through clouds use NO temporal upscaling: two passes, near at 480x270 and far at 960x540, blended over depth (s.127); orographic step placement 730 samples / 4.2 ms down to 230 / 1.3 ms (s.125-126); PS4/PS5 scaling 960x540 / 1080p, light 6 / 10, view 60-90 / 96-180 (s.183).
- 2023: step `max(SDF, max(1, sqrt(dist)*0.08))`, jitter animated within 250 m and static beyond (23 s.148-150); PS5 at 960x540 from the ground 10 ms base, 6.1 with voxel lighting, 2.2 with the SDF march; immersed 10 -> 8 -> 4; the two-resolution split halves cost, 4 to 2.1 ms (s.152-158).
- Blue noise: not mentioned by these sources; 2023 hash jitter; Frostbite jitters per step with an EMA history and camera reprojection (FB p.36). Frostbite cost on Xbox One: 1080p 1.60 ms at half res, 16 samples, MS N = 2 (FB p.45).

### 5. Shadows and integration
- Ground shadows: Frostbite bakes cloud transmittance to a 2D texture projected on a flat planet, applied to opaque, transparent, particles and GI (FB p.42); none of the Nubis talks describe ground shadows; 2022 samples the terrain shadow map onto clouds (22 s.112).
- Depth and aerial perspective: 2017 records depth at alpha 0.5 and samples the atmosphere there (17 p.100-101); 2022 an opacity-weighted mean distance (22 s.187-189); Frostbite the same weighted by transmittance (Eq. 21), aerial-perspective LUT applied once after, and clouds fed back into aerial perspective `L_AP = L_AP*Tr_cloud + L_cloud` (FB p.43-44).

### 6. Meteoros (MIT, 2017, Aman Sachan; `src/CloudScapes/`)
Textures `Sky.cpp:31-54` (128^3 RGBA8 shape, 32^3 detail, 128^2 curl, 512^2 weather); remap `shaders/cloudRayMarch.comp:153-169`; height gradient `:475-487`; wind skew `:489-497`; base shape `:499-540`; erosion `:542-563`; HG and silver max `:295-306`; `GetLightEnergy` `:331-388`; march, cone kernel, integration `:565-688`; 1-of-16 selection `:693-705`; reprojection `shaders/reprojection.comp:193-243`. Right: the texture set and fBm weights, the base remap, dual HG g 0.6 / silver 0.7 / spread 0.1 (fixes the 4 pi bug), a 6-sample cone with a far sample at 3x, 1-of-16 with Halton. Wrong or skipped: weather map and height gradient disabled (`:515-525`, coverage constant 0.6 `:529`); erosion 0.005 vs 0.2 (`:561`), effectively off; noise tiles every 100 km (`:634-635`, about 780 m per shape texel, about 3 km per detail texel: guaranteed soft blobs); light samples decorrelated from the shape (`:658-665`); integration not Beer-Lambert (`:648, 674-677`), no ambient, no sun colour; fixed 35-60 steps (`:572`); reprojection via the inner-shell hit with a 10-tap blur, no rejection, full resolution.

### 7. The recipe ([S] stated in a source, [I] the reader's inference)
Density, 1-2 km fair-weather cumulus:
1. Weather map 2D: coverage, type, optional bottom type [S]; 16 km tile [S 2022]; 32-64 m texels [I].
2. Profile `vertical_gradient(h, type) * coverage` [S 2022]; for cumulus a steep bottom ramp (0 -> 1 over h 0-0.07) for flat bases and a top ramp near 0.6-1.0 [I]; the envelope's `h^2 (1-h)^1.5` is a published alternative [S 2022].
3. Shape noise 128^3 RGBA: Perlin-Worley plus 3 Worley octaves, fBm 0.625/0.25/0.125, `Remap(R, fbm-1, 1, 0, 1)` [S 2017]; tile about 2-4 km so turrets of 200-800 m appear [I].
4. Erosion `saturate(noise - (1 - profile))` [S 2022], or the 2017 chain [S].
5. Detail: wispy below h about 0.1, billowy above (`lerp(hf, 1-hf, saturate(h*10))`) [S 2017]; low frequency at the core, high at the surface [S 2023]; tile 100 m, 128^3 [S 2023 voxel, I procedural]; twice-folded noise within 50-150 m [S 2023].
6. Edge sharpening `pow(density, 0.27)` [S 2022] or `pow(d, lerp(0.3, 0.6, .))` [S 2023]; extinction about 0.05-0.12 per metre at full density [S FB], one mean free path in 10-20 m is what reads as a hard edge [I]; 12 m voxels with weak erosion cannot make edges finer than about 50 m [I].
7. Motion: scroll noise only, not coverage [S 2017]; 500 m skew, 0.1 upward bias, curl 200 (1-h) [S 2017 code]; motion vectors for reprojection [S 2022].
Lighting:
8. Light march 6-10 samples over 256 m with increasing spacing [S 2022] plus a far sample [S 2015]; jitter per frame, raise the mip per sample [S 2017, FB]; six fixed un-jittered samples against 12 m data is the likely cause of the terracing [I]; optional summed-density grid for long shadows [S 2023].
9. Beer `T = exp(-sigma sum(d) ds)`, integrated as `(S - S T)/sigma` [S FB Eq. 17].
10. Multi-scatter or powder: minimum the 2017 `max(exp(-dl), 0.7 exp(-0.25 dl))` ramped by cos_angle from 0.7 to 1, times depth_prob and vertical_prob [S 2017]; or the 2022/2023 ms_volume [S]; optional Wrenninge N = 2-3, a <= b [S FB; values I].
11. Phase `max(HG(0.6), k HG(0.99 - spread))` [S 2017] or g 0.2 plus lobes [S 2022]; Frostbite's `lerp(HG(g0), HG(g1), w)` with g0 about 0.8, g1 about -0.3, w about 0.5 [I].
12. Ambient `pow(1 - profile, 0.5) * height_fraction` times sky colour [S 2022]; optional upward occlusion [S 2023].
13. Dark bases `vertical_prob = pow(Remap(h, .07, .14, .1, 1), .8)` [S 2017] plus the ambient height fade [S].
March and performance:
14. Adaptive step `3 + 60 dist/16384` m [S 2022] or `max(1, 0.08 sqrt(dist))` [S 2023]; cheap profile test before full samples, step back on a hit, exit at low transmittance [S 2015/2017]; an SDF or empty-space skip is what makes fly-through affordable [S 2023].
15. Temporal: 1-of-16 per 4x4 at quarter res works for distant sky only [S 2015/2022]; Guerrilla abandoned it for fly-through in favour of a near/far two-resolution split [S 2022/2023]; a flight sim needs both [I].
16. Budget: PS5 sky about 2 ms at 1080p; immersive 2.2-4 ms at 960x540 [S]; the 6700 XT is roughly PS5-class and 1440p is 1.8x the pixels, so 2-4 ms for the cloud pass if budgeted like Guerrilla [I].
17. Integration: transmittance-weighted mean depth for aerial perspective [S FB/2022]; a 2D transmittance shadow texture on the ground [S FB].
Optional: anvil bias, precipitation absorption, 2.5D cirrus with 4 light samples [S 2022], god rays [S 2017].
