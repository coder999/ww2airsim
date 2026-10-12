# L1 plan: tree crowns and scenery materials

**Status:** ready to execute on branch `l1-l2-visuals`, worktree
`/home/mark/projects/ww2airsim-l1-l2-visuals`.

**Run:** unattended. Mark will inspect the final combined L1/L2 result after
both tracks finish. Do not stop at intermediate visual checkpoints; preserve
the before/after captures in the handoff.

**Master-plan scope:** Track L1 items 2 and 3. Terrain albedo/normal textures
already shipped in the 2026-09-26 terrain-texture pass. This plan does the
remaining L1 work: real tree crown/branch structure, leaf and bark textures,
and textured building materials. It does not promote the L3 drape/village
prototypes.

## Fixed decisions

- Keep the existing deterministic placement, resident-cell cache, quality
  distances and two instanced tree draws. Geometry and materials change;
  simulation, land cover and tree counts do not.
- Build one merged bark geometry (trunk plus tapered branches) and one merged
  foliage geometry (separated 3D clusters). No billboards or camera-facing
  cards.
- Five CC0 Poly Haven materials: foliage, bark, corrugated iron, timber and
  concrete. Pin source URLs and MD5s; record every author and page in
  `ASSETS.md`.
- KTX2/Basis, with mipmaps. A failed scenery-texture load draws the current
  solid/procedural materials and never prevents boot.
- Building geometry, strike-target identity, batching and draw counts stay
  unchanged. Real textures modulate the existing weathered colors rather than
  replacing their art direction.
- New material detail is world/object locked and mip-filtered. No anisotropy
  raise without a measured reason.
- DEV comparison controls may force old crowns or procedural materials; they
  must not appear in the production bundle.

## Tasks

1. **Baseline and source ledger.** Record current tree triangle/draw counts,
   focused tests and the relevant 1440p High budget views. Add the five pinned
   CC0 sources and authors to `ASSETS.md` before committing texture output.
2. **Scenery texture build.** Add a deterministic build manifest and tool that
   downloads the pinned diffuse/OpenGL-normal pairs, resizes them, writes
   mipmapped KTX2 assets and a checked JSON manifest, and reuses the vendored
   Basis transcoder.
3. **Runtime loader and fallback.** Load/transcode the scenery materials during
   the existing surface phase. Validate names and texture metadata. On any
   failure warn once and keep the old procedural materials.
4. **Tree geometry.** Extract a pure crown/branch builder. Replace the three
   overlapping icosahedra with a visible trunk-to-branch structure and spaced
   3D foliage clusters, merged back into the existing bark and foliage
   instanced meshes. Keep or reduce the current crown triangle count where
   practical; any increase must clear the measured budget.
5. **Tree materials.** Apply foliage and bark albedo/normal detail without
   changing per-instance color variation or whole-tree distance dissolve.
   Foliage alpha breakup must not use Three r186's rejected `alphaHash` path.
6. **Building materials.** Apply corrugated iron, timber and concrete detail to
   the existing five weathered roles, including huts, airfields and destructible
   buildings. Preserve one merged draw per material and the collapsed/intact
   visibility seam.
7. **Correctness.** Add deterministic geometry/count tests, texture manifest
   and provenance tests, loader failure/fallback tests, and focused render-graph
   wiring tests. Run typecheck, lint and the touched deterministic files.
8. **Final L1 checkpoint.** Capture close/medium/6,000-foot forest views and a
   building cluster, old versus new, on the Ryzen reference GPU. Read every
   image. Run the affected locked High budget views and the full deterministic
   gate through `remote-run`. Write the handoff and update `MASTER_PLAN.md`,
   `docs/terrain.md` and `docs/testing.md`.

## Acceptance

- Close trees read as branches carrying separated foliage masses, not three
  faceted balls or crossed cards.
- Leaf/bark/metal/timber/concrete photographed structure is visible close up,
  stays fixed in world/object space, and disappears into mip filtering without
  shimmer at distance.
- The forest remains two instanced draws, building batching is unchanged, the
  1440p High gate remains green, and missing textures preserve a flyable game.
- No simulation, terrain, cover, collision, damage or building-layout value
  changes.

