# Visual realism pass: real textures, hand-built geometry, G-force toggle — design

**Status: approved design, 2026-09-24.** Bundled at Mark's request (three
critiques from `2026-09-24-post-overnight-critiques.md`: better aircraft/
scene rendering generally, plus the standalone G-force toggle ask, which
fits the same "Settings dialog" surface the quality-selector spec already
built). Three genuinely separate subsystems in one document because they
were designed together; each has its own section, its own files, and can
be implemented as its own plan or task sequence independently — nothing
below requires all three to land together.

**Depends on** `2026-09-24-render-quality-selector-design.md` (the Settings
dialog UI and its Asset Quality axis) and its own texture-format/-sourcing
decisions (§2). Terrain LOD (that spec's §10) and cumulus cloud fidelity
(`2026-09-24-cumulus-cloud-fidelity-design.md`) are separate, already-
written specs — not restated here.

## 1. G-force / arcade-realistic toggle

**Scope, explicitly bounded by Mark's own words**: "just turning off
aggressive maneuvering damage." Stall/spin behavior and every other
flight-realism system stay untouched, always-on, regardless of this
toggle. This is a damage-consequence toggle, not a flight-model difficulty
toggle.

**Mechanism.** `src/sim/weapons/combat.ts:437-440` calls
`measureStructuralStress` unconditionally (every aircraft, every tick) —
that continues unchanged, since `src/render/combatReadout.ts` already
surfaces G/overspeed stress on the HUD and **that indicator stays visible
in arcade mode too** (Mark's call, 2026-09-24: it's informational feedback
even when there's no consequence). Only the second call,
`damageFromStructuralOverload`, needs gating: when arcade mode is active,
skip it (or call a no-op equivalent that returns `before` unchanged),
exactly the same short-circuit `damageFromStructuralOverload` already uses
for a destroyed aircraft (`if (before.destroyedAt !== null ...) return
before`).

**Where the flag lives.** `src/sim/` may not read `localStorage` — the
existing render/sim boundary (`.dependency-cruiser.cjs`,
`tests/architecture/boundary.test.ts`) forbids it, and this feature does
not get an exception. The flag is a plain boolean threaded into whatever
already calls `combat.ts`'s tick-processing function from `main.ts`/
`loop.ts`, the same way `wind`, `dt`, and other per-tick scenario/session
data already arrive as parameters — **not** a new sim-side persistence
read. Render-side persistence (a new field on `QualitySettings`, or a
sibling key next to `ww2airsim.quality.v1` — implementation's call) lives
in the Settings dialog already designed, as a third row alongside Render
Quality / Asset Quality: **Damage Model: Realistic / Arcade**.

**Testing.** Tier 1: a test asserting `damageFromStructuralOverload`'s
existing behavior is unchanged when the flag is off, and that structure
never decreases from G/overspeed alone when the flag is on, across a
tick sequence that would otherwise destroy the airframe. A test that
`measureStructuralStress`'s own output (and therefore the HUD reading) is
identical regardless of the flag — the measurement must never depend on
whether damage is being applied. Tier 2: not required — this has no
rendering surface beyond a HUD number that's already tested by existing
`combatReadout` coverage, and a Settings-dialog row that's covered by the
quality-selector spec's own Tier 1/2 plan.

## 2. Texture pipeline: format and sourcing (settled 2026-09-24)

- **Format: KTX2/Basis supercompressed**, not PNG. Given the asset-quality
  budget headroom opened up (`2026-09-24-render-quality-selector-design.md`
  §10, up to 1GB at `ultra`), KTX2 buys real texture variety per MB and
  keeps VRAM proportionate to the compressed size rather than the
  decompressed one. Needs a new build-time compression step
  (`tools/textures/build.ts` or similar, mirroring `tools/scenery/build.ts`
  and `tools/landcover/fetch.ts`'s existing tools-dir convention) and a
  KTX2 loader wired into the render bundle (`KTX2Loader` from
  `three/addons`, or the WebGPU-renderer equivalent — verify which
  Three.js/WebGPU loader path this repo's existing `three`/`three/webgpu`
  imports actually support before assuming the standard Three.js loader
  applies unchanged).
- **Sourcing: CC0 photogrammetry/PBR sites first** (the Poly Haven/
  ambientCG class of source — free, tileable, real photographed materials,
  explicitly CC0), **AI-generated as fallback** only for materials a real
  CC0 source doesn't cover (the same Adobe Firefly precedent already used
  for this project's audio content). Every texture gets an `ASSETS.md` row
  (source URL, author, license) before commit, same gate every other asset
  in this repo already passes through — a texture is not exempt just
  because it's smaller than a 3D model or an audio file.
- **What needs textures, in priority order Mark set 2026-09-24**: land/
  terrain surface materials first, then trees (bark + leaf material),
  then buildings. Ocean is explicitly **not** part of this pass (called
  "already decent" — see §5's separate, smaller wave-variability note).

### 2.1 Land/terrain surface textures

`src/render/terrain/surface.ts` currently blends flat procedural colors
(`sand`/`land`/`rock`) via `smoothstep`/`mix` on value noise — no bitmap at
all. Replace each flat color with a real tiled albedo + normal map pair
(CC0-sourced: grass, bare dirt, sand, jungle floor/undergrowth, exposed
rock — five materials, matching the existing blend's own material count
plus jungle floor as a genuinely new category this setting needs and
generic PBR sites are less likely to have well-covered, flagged as an
AI-generated-fallback candidate in §2). The existing height/noise-driven
blend WEIGHTS are unchanged — only what each weight blends *into* changes,
from a flat color to a sampled tiled texture. Tiling seams and stretching
at this world's scale (a 200km terrain) need a triplanar or macro-variation
technique to avoid an obviously-repeating pattern — a real technical risk
worth prototyping early in implementation, not assumed away here.

### 2.2 Tree bark and leaf textures

Paired with §3.1's real 3D crown/branch geometry — a textured leaf material
(albedo + alpha-cutout or alpha-blend for individual leaf clusters within
the now-3D crown geometry, not a flat white `roughness: 1` material) and a
textured bark material for the trunk/branches, replacing
`vegetation.ts`'s current solid-color `MeshStandardNodeMaterial`s.

### 2.3 Building materials

Paired with §3.2's modest building geometry pass — real weathered-metal/
timber/concrete textures (albedo + normal) replacing `buildings.ts`'s
current `weathered()` procedural-noise color mix. `weathered()`'s existing
technique (mixing a base/worn color via `groundNoise`) can plausibly stay
as a *variation* layer on top of a real base texture (dirt/rust
accumulation pattern) rather than being thrown away entirely — an
implementation-level decision once real textures exist to layer it onto.

## 3. Hand-built geometry, project-wide

### 3.1 Trees — real 3D crown/branch geometry, not billboards

Explicit choice (Mark, 2026-09-24): actual 3D geometry over textured
billboard cards, despite billboards being the more common efficient game-
-tree technique — no alpha-sorting/camera-facing complexity to build, at
the cost of more triangles per instance. Replaces `vegetation.ts`'s current
three-overlapping-icosahedra crown (a deliberately crude blob) with a real
branch/foliage-cluster structure. Stays within the existing
`InstancedMesh`/`mergeGeometries` architecture (`vegetation.ts`'s current
pattern) — only the *geometry* fed into that pipeline changes, not the
instancing/batching technique, which already scales to the tree counts
this world uses (`CAPACITY = residentCellOffsets().length * TREES_PER_CELL`
today).

### 3.2 Buildings — modest geometry pass, textures do most of the work

Window insets, roof detail (a ridge/pitch instead of a flat box top), and
similar real-but-modest additions to `buildings.ts`'s current box-based
construction — not a from-scratch rebuild. Combined with §2.3's real
textures, since Mark's read was that texture-driven realism matters more
here than raw geometric complexity for a small hand-built structure.
Existing `weathered()`/`batched()`/material-per-batch merging stays; the
box-construction helper (`box(x, y, z, w, h, d, material)`) gains
additional shapes (a ridge, a window-inset cutout) rather than being
replaced.

### 3.3 Ships — real curved hull geometry (priority)

**Superseded 2026-09-25** by [the ship-models design](2026-09-25-ship-models-design.md) §0; S1 shipped the models on 2026-09-25 ([handoff](../../handoff/2026-09-25-s1-ship-models.md)).

Different treatment than buildings, per Mark's explicit call: a boxy hull
is a much more visually jarring simplification for a ship than a boxy
building is for a structure, so this gets real geometric investment, not
just texture-driven improvement. `src/render/scene/ship.ts`'s current
`BoxGeometry(spec.lengthM, hullHeightM, spec.beamM)` hull becomes an
actual tapered/curved hull shape (a lofted cross-section along the keel —
narrower and rising at bow and stern, a proper deck sheer — built by hand
in code, matching this project's existing "deliberately simple hand-built
geometry, no external model" convention for the aircraft, master spec §10).
Superstructure/deck/turret elements built on top can stay simpler boxes,
matching buildings' treatment — the hull specifically is the priority,
since that's what reads as "boxy" from any distance. Real UV coordinates
need authoring by hand for a non-default geometry like this (unlike
`BoxGeometry`, which Three.js UV-unwraps automatically) — needed for §2.3-
-equivalent hull plating textures once those exist, an implementation-
-level detail to get right the first time rather than retrofit.

Tied to the new ship roster (master spec §9, added 2026-09-24, 9 ship
types across `carrier`/`cruiser`/`battleship`/`escort`/`merchant` — see
that section for the full list) — hull geometry should be parameterized
enough (length/beam/height already are, per `ShipSpec`; hull *shape*
parameters like bow rake and stern taper are new) to plausibly serve all
nine without a bespoke hull per ship class, at least for the ones without
shipped content yet.

## 4. What this spec deliberately does not do

- No change to ocean rendering (§2's own priority ordering: ocean is
  "already decent") beyond the small, explicitly separate note in §5.
- No billboard/card technique for trees — considered and explicitly
  rejected, §3.1.
- No aircraft model changes — Mark may pursue that separately (his own
  words, 2026-09-24); this spec's geometry work is buildings/ships/trees
  only. If he sources an external model, `2026-09-24-post-overnight-
  -critiques.md` §6 already covers the format/licensing/rig requirements
  to check it against.
- No change to `CLOUD_TIERS`/cumulus fidelity — that's
  `2026-09-24-cumulus-cloud-fidelity-design.md`'s scope, not this one's.
- No stall/spin/flight-model realism changes from the G-force toggle
  (§1) — bounded explicitly to structural overload damage only.

## 5. Small, separately-flagged note: ocean wave variability

Mark: ocean is "already decent (though could use some wave variability/
wave crests)." Explicitly smaller and lower-priority than everything above
— not designed in this pass. Worth a follow-up spec of its own (likely
touching `src/render/ocean/`'s cascade/FFT technique, out of scope for a
per-tier textures/geometry pass) rather than folding it in here and losing
it among three bigger subsystems.

## 6. Testing (§2/§3, textures and geometry generally)

**Tier 1:** any new pure geometry-construction functions (a hull-shape
builder, a tree-crown builder) get the same kind of unit test this repo
already applies to `buildings.ts`'s `box()`/`batched()` — deterministic
output, correct vertex/triangle counts for known inputs, no NaN/degenerate
geometry for edge-case dimensions (a zero-length ship, a zero-height
building).

**Tier 2:** real-GPU screenshots, read directly (never argued about a
picture nobody looked at, per this repo's standing rule), for each of:
a ship broadside showing the new hull curvature against the old boxy
silhouette; a tree canopy close enough to judge the new crown geometry
and leaf texture; a building cluster showing the new roof/window detail
and real material; and a frame-time re-measurement against the existing
6.0ms budget, since real textures (sampling cost) and heavier tree/ship
geometry (vertex cost) both have genuine, non-zero per-frame cost unlike
the mostly-free tier work elsewhere this week.

## 7. Open items for the implementation plan, not this spec

- Exact KTX2 build tool and loader choice — verify against this repo's
  actual Three.js/WebGPU renderer version before assuming a specific
  loader API.
- Triplanar/macro-variation technique for terrain texture tiling at 200km
  scale (§2.1) — a real technical risk, not a solved problem here.
- Whether `weathered()`'s procedural noise layer survives as a variation-
  -on-top-of-real-texture technique or gets replaced outright (§2.3).
- Exact hull cross-section parameterization for §3.3 — enough to serve
  all 9 ship-roster entries without a bespoke hull per class, worked out
  during implementation against real reference silhouettes.
- Ship roster (master spec §9) sourcing/accuracy — flagged there as
  needing primary-source confirmation before hull-geometry work begins,
  same as the aircraft roster's own standing caveat.
