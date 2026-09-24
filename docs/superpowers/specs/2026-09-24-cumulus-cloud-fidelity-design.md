# Cumulus cloud fidelity — design

**Status: approved design, 2026-09-24.** Mark's critique: low clouds (the
ones you fly through) look "pixelated and banded" and should be "fluffy and
vary in shapes and distribution more." Explicitly **not** about the high
cirrus layer, which he's fine with as-is — `cumulus`/`cirrus` are already
architecturally separate (`KIND_CUMULUS`/`KIND_CIRRUS`, independent per-tier
step counts), so this spec touches only the cumulus path.

## 1. Root cause, grounded in the actual shader

Read `src/render/scene/clouds.ts` and `cloudField.ts` before proposing
anything:

- **Light/self-shadow sampling is very low: `lightSteps: 2` at `high`, `1`
  at `medium`/`low`** (`CLOUD_TIERS`). Internal cloud shading — the light-
  vs-shadow gradient inside the cloud mass — is computed from just 1-2
  samples along the light ray, producing coarse, visibly discrete lighting
  steps rather than smooth shading. This is the strongest candidate for
  "banded."
- **Cumulus raymarch step counts are modest**: 48/32/20 at high/medium/low
  (`cumulusSteps`). Real-time volumetric cloud techniques commonly use
  64-128+; this repo's counts are on the low end even at `high`.
- **Shape/detail noise resolution is coarse relative to how close the
  camera gets.** The shape volume is 128³ tiled across `SHAPE_TILE_M =
  6000`m (~47m per texel); detail is 32³ across `DETAIL_TILE_M = 400`m
  (~12.5m per texel). Fine for large-scale silhouette from a distance, but
  a real candidate for "pixelated"/blocky edges when the camera is inside
  or very close to a cumulus layer specifically — a case cirrus never hits.
- **Coverage is a single scalar per layer, not a spatially-varying field.**
  `cloudField.ts`'s `density()` thresholds the shape noise against one
  `coverage` value per layer ("what survives above `1 - coverage` is
  cloud") — the same threshold everywhere in the sky. There is no low-
  -frequency spatial modulation creating natural clumping/gaps; every
  cumulus layer is uniformly as cloudy everywhere it exists. This is the
  root of "should vary in shapes and distribution more."

## 2. What this spec changes

All four fixes target `KIND_CUMULUS` specifically; cirrus's tier values,
noise sampling, and coverage handling are untouched.

**Raise cumulus step counts**, primarily `lightSteps` (the strongest banding
suspect) and secondarily `cumulusSteps`. Given the ~3-5x GPU headroom
already measured against the 6.0ms budget (this repo's own render-quality
musings doc, reconfirmed by Plan 13d's own frame-time re-check), there is
real room to spend here — exact new values are a Tier 2 measurement
question for the implementation plan, not a number to invent in this spec.
`CLOUD_TIERS`'s existing per-tier structure (high/medium/low) is kept; only
the cumulus numbers inside it change.

**Add a spatially-varying cumulus coverage field.** A second, large-scale
2D noise texture (analogous to the existing `shape`/`detail` 3D volumes,
but sampled in world XZ only, not height) that modulates the per-layer
`coverage` scalar spatially before it thresholds the shape noise — regions
where this coverage-noise reads low get sparser/gappier cloud, regions
where it reads high get denser, replacing today's uniform threshold. This
is the standard technique real-time volumetric cloud systems use for
"weather map"-style clumping, applied here at the smallest scope that
addresses the actual complaint (cumulus only, one new 2D texture, no change
to the density function's fundamental shape/detail sampling).

**Revisit shape/detail noise resolution for the up-close view.** Cirrus is
always seen from a distance (never flown through), so its existing 128³/
32³ resolution and tile sizes are presumably fine as-is and out of scope.
Cumulus needs re-evaluating specifically for the "camera is inside or just
below the layer" case — either a finer detail-noise tile size for cumulus
specifically (cheaper: reuse the existing 32³ texture with a smaller
`DETAIL_TILE_M` just for cumulus, since a smaller tile size makes existing
noise data represent finer real-world distances), or a genuinely higher-
-resolution detail volume (more expensive: more VRAM, a rebuild of the
noise generation tool). Start with the cheaper retiling option and measure
before reaching for a new, larger texture.

## 3. What this spec deliberately does not touch

- Cirrus: tier values, noise sampling resolution, coverage — all unchanged.
- The overall raymarch architecture (per-pixel dither, the two-noise-volume
  shape+detail technique, `MAX_MARCH_M` capping) — this is tuning within
  the existing technique, not a rewrite of it.
- `CLOUD_TIER_PARAM`'s DEV-only query override mechanism — unchanged,
  still the tool for measuring one scene with and without a change.

## 4. Testing

**Tier 1**: existing cloud-related unit tests (if any target `CLOUD_TIERS`'
shape or `cloudField.ts`'s pure functions) continue to pass with updated
numbers; a new test asserting the coverage-noise texture actually varies
spatially (not a constant field, which would silently defeat the point).

**Tier 2**: a real-GPU frame-time re-measurement against the existing 6.0ms
`GPU_BUDGET_P95_MS` ceiling — the whole point of spending here is that
there's headroom, so this must be confirmed, not assumed, the same way
every other GPU-cost claim in this project has been. A new or extended
screenshot test specifically framing a low-altitude flight through/near a
cumulus layer (not the existing wide establishing shots), read directly
before trusting any "it looks better now" claim, per this repo's own rule
about not arguing over a picture nobody looked at.

## 5. Open items for the implementation plan, not this spec

- Exact new step-count values for each cumulus tier — a real-flight/real-
  -measurement tuning question.
- Exact coverage-noise texture size/tile scale, and whether it needs its
  own drift/wind-warp treatment the way `shape`/`detail` already have
  (`cloudDriftM`) so the clumping pattern doesn't look static while flying.
- Whether the cheaper detail-retiling approach for cumulus (§2's third
  fix) is sufficient, or a genuinely finer noise volume is warranted —
  decide after measuring the retiled version first.
