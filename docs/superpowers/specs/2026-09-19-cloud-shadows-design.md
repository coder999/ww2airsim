# Plan 16b — cloud shadows: design

2026-09-19. The second of the three slices Mark chose for Plan 16 on
2026-09-19 (the [16a design](2026-09-19-clouds-design.md) names them: the
cloud field and the whiteout, cloud shadows, a movable sun). 16a is on
`main` with its numbers in
[its handoff](../../handoff/2026-09-19-plan16a-clouds.md) and the same-day
[distant-cloud refinement](../../handoff/2026-09-19-clouds-distance.md), so
this design is written against a measured field. Mark chose the mechanism
here on 2026-09-19: a **sun-view shadow map**, over a per-fragment re-sample
of the field and over a single flat coverage slice, because it reaches every
lit object in the scene rather than only the terrain and the sea.

## 1. What the pilot sees

Cumulus decks cast soft, dark patches on the land and the sea that drift with
the clouds and match the silhouettes overhead. The runway, the hangars, the
trees, the ships and the Hellcat darken with the ground they stand on. Cirrus
casts nothing. A surface inside the deck or above it is not shadowed by it.

Nothing in `src/sim/` changes. Shadows are paint: no force, no visibility
rule, no golden or soak sees them.

## 2. The map

One **sun-view transmittance map**, `src/render/scene/cloudShadow.ts`:

| Property | Value | Why |
| --- | --- | --- |
| Target | `RenderTarget` 1024 × 1024, one 8-bit channel, linear filter, clamp to edge | 1 MiB; the value is a transmittance in [0, 1] |
| Footprint | 80 km square centered on the eye, 78.125 m per texel | the shape volume tiles at 6 km and the detail at 400 m; a texel is finer than either feature |
| Recentering | every frame, the center snapped to the texel grid | a map that recenters by fractions of a texel swims under a still cloud |
| Border | the outer 8 km fade to 1 inside the shader | clamp-to-edge then reads 1 beyond the map: no shadow, no seam. `fogWeightNode` is already 0.352 at 40 km, so the fade sits under haze |
| Rendered by | a full-screen quad, orthographic camera, `MeshBasicNodeMaterial` | its fragment shader calls the SAME TSL density function the cloud dome marches |

**Each texel is a sea-level ground point.** For every cumulus layer the
shader projects up the ray toward the sun and takes N taps through the
layer's thickness at heights `base + thickness · (k + ½) / N`, evaluating the
shared density at each. The stored value is
`exp(−Σ density · thickness / N · CUMULUS_SIGMA)`, the clouds' own extinction
(0.012 per meter): with four taps through the free-flight deck a single tap
at density 0.4 already reads 0.34, so shadows are dark, as cumulus shadows
are. Cirrus layers are skipped in this loop. A clear scenario (no cumulus)
renders nothing and the consumers read a constant 1.

**The density function moves, it is not copied.** `clouds.ts`'s `density`
Fn, the two `Data3DTexture` volumes, the layer `uniformArray`, the layer
count, and the `drift` uniform become `src/render/scene/cloudField.ts`, a
module both the dome and the shadow pass import. One field, two readers;
the shadow cannot disagree with the cloud that casts it, and the drift is
shared by construction. `clouds.ts` keeps the march, the tiers, the debug
probes and the handle; its exports and its tests are unchanged.

**Why a render target and not a compute pass.** The ocean's compute is raw
WGSL against the native device (`ocean/compute.ts`); a compute shader here
would need the density re-expressed in WGSL, and a second copy of the field
is the defect this design exists to avoid. A fragment shader runs the TSL
density unchanged, with the same implicit-derivative texture sampling the
dome uses. The compute path (TSL `Fn().compute()` with `textureStore` and
`.level(0)` sampling) is the fallback in §7, not the design.

## 3. Who reads it, and how

**The sun carries it.** three r186's `AnalyticLightNode.setupShadow` accepts
a custom node on `light.shadow.shadowNode`
(`node_modules/three/src/nodes/lighting/AnalyticLightNode.js:214`): when
`renderer.shadowMap.enabled` is true, the light casts, and the object
receives, three multiplies **that light's direct term only** by the node,
and with a custom node present it never constructs its `ShadowNode`, so no
depth map is rendered. So: `renderer.shadowMap.enabled = true`,
`sun.castShadow = true`, `sun.shadow.shadowNode = cloudShadowNode`, and
`receiveShadow = true` on the Hellcat, the ships, the trees, the runway, the
airfield and the markers. Every `MeshStandardMaterial` and
`MeshStandardNodeMaterial` in the scene then shades correctly, sun term
shadowed, hemisphere term intact, with **zero material changes**. The
hemisphere light does not cast, so it is untouched.

**The lookup node**, `cloudShadowNode(worldPosition)`, used by the sun and
by the two self-lit materials:

1. **Undo the camera-relative shift.** `scene.position` carries `−eye`
   every frame (main.ts), so `positionWorld` is eye-relative. The node adds
   the `eyeWorld` uniform the field already owns before anything else. A
   wrong sign here shows as shadows that slide with the airplane; §6's
   `show` probe exposes it in one screenshot.
2. **Parallax, exact for a directional sun.** A fragment at height `y` lies
   on the sun ray through the sea-level point
   `xz − (SUN.x, SUN.z) / SUN.y · y`. With the current sun that is
   `(−0.4 y, −0.3 y)`: 400 m and 300 m at 1,000 m. That point is the map
   coordinate. No per-height maps, no approximation.
3. **Above the deck, no shadow.** The value is faded to 1 by
   `smoothstep(base, top, y)` of the LOWEST cumulus layer, two uniforms
   the field exports. With one cumulus deck per shipped scenario this is
   exact; with two stacked decks a fragment between them would lose the
   upper deck's shadow. Recorded as a limitation, not solved: no scenario
   has two cumulus decks and the fix (per-layer maps) costs more than it
   returns.
4. **UV** is `(point − mapOrigin) / MAP_SIDE_M` against the `mapOrigin`
   uniform the pass sets when it recenters.

**The two materials that light themselves:**

- **Terrain** (`terrain/mesh.ts`, its own lambert against the sun):
  `lit = albedo · (AMBIENT + lambert · (1 − AMBIENT) · T)`. Ambient stays;
  under a dense cloud the ground keeps 35 % of full light, the same fraction
  a north slope keeps today.
- **Ocean** (`ocean/mesh.ts`, `MeshBasicNodeMaterial`, no sun term to
  scale): `color · mix(OCEAN_SHADOW_FLOOR, 1, T)` with the floor at **0.6**.
  The sea under cloud loses its glint and its subsurface brightness but
  still reflects the sky. One constant, named, for Mark to tune after he
  flies it.

The cloud dome itself reads nothing new: cloud-on-cloud shading is already
the light march inside `clouds.ts`. The sky dome is untouched.

## 4. The sun becomes one uniform

`SUN_DIRECTION` in `lighting.ts` today is a literal that the
`DirectionalLight` position, the terrain's lambert and the cloud light
march each read. The shadow pass is a fourth reader. It becomes
`sunDirectionNode`, a `uniform(vec3)` exported alongside the constant and
initialized from it, and `createLighting()` sets the light's position from
the same constant. That is the whole of 16c's preparation: 16c will drive
the uniform and the light from one clock, and touch nothing here. A Tier 1
test pins the light's position to the uniform's value, turning
lighting.ts's "two literals for one sun" warning into an assertion.

## 5. Where it plugs in

Frame order in `main.ts`, after `clouds.update(...)` and the ocean
cascades' `dispatch(...)` and before `renderer.render(scene, camera)`:

```
shadow.update(eye)          // snap center, set mapOrigin, then
renderer.setRenderTarget(shadow.target)
renderer.render(shadow.scene, shadow.camera)
renderer.setRenderTarget(null)
```

The pass is skipped (and the node is a constant 1) when the scenario has no
cumulus layer or under `?cloudShadow=off`. `main.ts`'s GPU timestamp is
`resolveTimestampsAsync('render')`, which pools every render pass in the
frame, so the shadow pass is inside the number the budget and the tier
choice read. §6 asserts that: the on/off delta must be greater than zero, or
the pass is not being measured.

Tiers, keyed by the ocean tier's name like `CLOUD_TIERS`:

| Tier | Taps per cumulus layer | Map |
| --- | --- | --- |
| high | 4 | 1024² |
| medium | 3 | 1024² |
| low | 2 | 1024² |

The map size does not descend with the tier: it is 1 MiB, and the pass cost
is the taps, not the texels. `setTier` on the shadow handle follows the
same call `clouds.setTier` receives.

DEV query parameter `cloudShadow`, parsed like `cloudTier`:

| Value | Effect |
| --- | --- |
| `off` | no pass, transmittance 1 everywhere: the control for every measurement in §6 |
| `show` | the terrain and the sea paint T as gray instead of their color: the probe for the next shader bug, in the spirit of `?cloudDebug=` |

`__ww2.clouds()` gains `shadow: { taps, mapSideM }` so a spec can assert
which configuration it measured.

## 6. Budget and acceptance

**Budget.** The shadow pass at high must cost **≤ 0.5 ms gpu p95** at
2560 × 1440 on the reference card, measured as the difference between
`?cloudShadow=off` and the default in 16a §6's budget view (free flight,
1,300 m, level, horizon), each over 300 samples after `resetFrameTimes()`.
The deck-quals deck run, the heaviest frame in the suite, must stay under
**6.0 ms** with shadows on; it read 4.859 ms on 2026-09-19 without them.

**Tier 1** (`tests/render/cloudShadow.test.ts` and neighbors):

- `snapToTexel(xz, texelM)` is idempotent and moves the center in whole
  texels; `sunParallaxXZ(sun, y)` is `−sun.xz / sun.y · y` and zero at sea
  level; `MAP_SIDE_M / MAP_TEXELS` is 78.125.
- The shadow pass, the terrain and the ocean construct under Node for each
  shipped scenario deck (the `scene.test.ts` pattern), and for a clear deck
  the pass reports `enabled === false` and the node is the constant 1.
- `cloudShadowFromQuery` accepts `off` and `show` and rejects anything else.
- `createLighting()`'s directional light position equals `sunDirectionNode`'s
  value; `SUN_DIRECTION` is unchanged.
- The tier table has three rows with descending taps.
- Architecture: `cloudField.ts` is imported only by `clouds.ts` and
  `cloudShadow.ts`; `clouds.test.ts` passes unchanged after the extraction.

**Tier 2**, reference GPU at 1440p, every screenshot READ:

- (a) the §6 budget: on/off delta ≤ 0.5 ms and > 0; deck run < 6.0 ms.
- (b) above the deck looking down at the gulf (16a's case c): a fixed sea
  strip's mean gray is lower with shadows on than off by at least 5 levels,
  and its horizontal standard deviation is higher (shadows are patches, not a
  tint).
- (c) `?scenario=gunnery-range` (clear sky): the on and off screenshots
  differ by less than 1 gray level on average.
- (d) from the chocks at Tacloban with `?cloudShadow=show`: the gray pattern
  continues across the runway and the surrounding terrain with no seam at
  the runway edge. This is the one image that proves the light hook (runway)
  and the self-lit path (terrain) read the same map at the same place.
- (e) `?cloudShadow=show` twice, 3 s apart, in level flight: the pattern's
  correlation across the pair, shifted by the ground track, is high, i.e.
  the shadows stay on the ground while the airplane moves.
- (f) zero WebGPU validation errors in every case; `renderer.info.render.calls`
  rises by exactly one with the pass on.
- (g) the existing clouds, terrain, deck-quals, gunnery and ocean specs still
  pass.

`npm run verify` exits 0 and a dated handoff records every number and which
contingency, if any, was used. §15's row 16 gains "16b landed" and this
document's link.

## 7. Risks and contingencies

- **`renderer.shadowMap.enabled` does more than gate the node.** If the
  WebGPU renderer allocates or renders anything for a casting light with a
  custom node, (f)'s draw-call count and (a)'s delta show it. Fallback:
  leave the flag off, scale each node material's `outputNode` by
  `mix(floor, 1, T)`, and convert the Hellcat's and the ships' plain
  `MeshStandardMaterial`s to node materials. Uglier, still one map.
- **A mid-frame render target disturbs the timestamp sampler.** `main.ts`
  serializes frames on the resolve while sampling; a second pass per frame
  may change how the pool's slots are consumed. Symptom: (a) reads noise or
  the alternation pattern the 2026-09-17 note describes. Fallback: the
  compute path, TSL `Fn().compute()` writing a `StorageTexture`, sampling
  the volumes with `.level(0)`.
- **Terracing at shadow edges** from four taps. Bilinear filtering at
  78 m should hide it; fallback is a 3 × 3 tap average in the lookup node,
  measured against the 0.5 ms.
- **The extraction breaks the dome.** `clouds.test.ts` and the clouds Tier 2
  spec, including the pixel-residual guard, run first, before any shadow
  code, and must be identical.
- **`positionWorld` inside the light's shadow node** is evaluated per
  material; an instanced tree's is its instance position. If a material's
  `positionWorld` is not what the node expects, (d) shows a seam and (e)
  shows sliding, both before Mark sees anything.

## 8. Sources

- three r186 `AnalyticLightNode.setupShadow`, the custom
  `light.shadow.shadowNode` path (read 2026-09-19).
- 16a design §4, §6 and its handoff's TSL traps; the same Fn rules apply to
  the shadow pass (one node returned, `toVar()` before nested loops, `name:`
  on inner loops).
- Schneider & Vos 2015, "The Real-time Volumetric Cloudscapes of Horizon:
  Zero Dawn", for the shadow-from-the-field idea; the map here is the
  ordinary shadow-map special case of it.
