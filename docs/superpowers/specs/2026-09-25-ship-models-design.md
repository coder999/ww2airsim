# Ship models from licensed candidates: design

Written 2026-09-25. This is a design only: no code and no implementation plan.
The plan follows once Mark approves it. Plan numbering stays with master spec
§15. This work takes a row there ("Ship models", order "any") when S1
completes. This document is "Lane C" in
[the A6M Zero design](2026-09-25-a6m-zero-design.md) (Lane B, branch
`worktree-a6m-zero-design`, `fd5106e`), whose pipeline and model cache it
consumes (§8).

## 0. The decision, and what it supersedes

Mark, 2026-09-25: **candidate models only, no hand-built hulls.** "Search for
similar models as what is desired. Does not have to be 100% historically
accurate."

**This supersedes
[`2026-09-24-visual-realism-pass-design.md`](2026-09-24-visual-realism-pass-design.md)
§3.3** ("Ships: real curved hull geometry"), approved the day before. That
section, a lofted hull hand-built in code and parameterized to serve all nine
roster classes, is withdrawn in full. The withdrawal covers its §7 open item
"exact hull cross-section parameterization" and its §6 Tier 2 "ship broadside
showing the new hull curvature". The rest of that spec (the G-force toggle,
textures, trees and buildings) is unaffected. When S1 lands, its handoff adds a
dated pointer at §3.3 so the section does not read as pending.

Master spec §10 allows "deliberately simple low-poly models" or "assets with
verifiable licenses". Ships now take the second option. The procedural boxes in
`src/render/scene/ship.ts` stay as the **fallback** for a ship with no model
(§3.4), so their `ASSETS.md` row stays true.

## 1. What exists today (measured 2026-09-25)

Everything here was read from the repo or measured with throwaway Node and
Python probes on 2026-09-25. Nothing is recalled. The probes were:

- a vertex walk with node transforms applied
- an area histogram of up-facing triangles
- a texture sample on the hull sides
- a z-buffered orthographic side and top render, which I read myself
- a ray-cast grid over the sim's deck rectangle

**Renderer.** `createShipMesh(spec)` builds boxes, bow along local +x and the
waterline at y = 0. `main.ts` poses `root` each frame with yaw
`π/2 − headingRad`. `setDamage(fire, sinkingFraction)` does four things to an
inner `hull group`:

- sinks it by `deckHeightM + draft`
- turns `rotation.z` by up to 8°
- hides `root` once the fraction reaches 1
- drives an engine-smoke plume scaled ×5

`buildScenarioEntities` creates one per `world.ships` entry.

**A defect found while reading.** With the bow on +x, `rotation.z` pivots about
the **beam**, which gives a bow-down trim, not the "lists 8° to a fixed side"
that the strike design §4 and the code comment describe. §6 fixes it.

**What the sim reads.** None of the render geometry. The strike hit box is
`lengthM × deckHeightM × beamM`, from the waterline up
(`src/sim/weapons/combat.ts:201`), and superstructure cannot be hit. The
carrier's Plan 8 `Deck` is a flat rectangle `flightDeck.lengthM × widthM`,
centered on the ship at `flightDeck.heightM`. Its edges are cliffs, and it has
no island or catwalk collision (carrier-ops design §4, §10). The deck height is
**17 m, an ESTIMATE** (`essex-cv.json`).

**Shipped content.** No scenario has more than three ships; deck-quals has one
carrier and two escorts.

| Spec | length × beam (m) | deckHeightM | Scenarios |
| --- | --- | --- | --- |
| `essex-cv` | 265.8 × 28.3; deck 262.7 × 32.9 at 17 | 17 (estimate) | free-flight, deck-quals |
| `fletcher-dd` | 114.8 × 12.0 | 6 (estimate) | free-flight, deck-quals (×2 each) |
| `type-b-maru` | 112.0 × 15.8 (draught 9.10) | 6 (estimate) | strike-range |

**Pipeline today.** `tools/models/build.ts` is Wildcat-only: `optimize
--no-simplify --compress false`, then `forceOpaqueMaterials`, which strips
`alphaMode` from **every** material. `wildcat.glb` requires only
`EXT_texture_webp`. Lane B's Z1 replaces all of this (§8).

**Candidate measurements.** Files are the main checkout's gitignored
`content/models/candidates/`. The CV-6 and the Liberty were fetched today with
`tools/models/sketchfab-fetch.sh`. The others were already staged and are
vetted on the unmerged `docs/model-candidates` branch (`e8ebcd2`).

| File | Triangles | Meshes / materials | Textures | Long axis; bow (evidence) | Waterline (evidence) | Main-deck plane |
| --- | --- | --- | --- | --- | --- | --- |
| `enterprise-cv6.glb` (KTKloss), 939,492 B | 15,339 | 1 / 1, `metallicFactor` 0 | none | z; **bow −z**: raked, flared stem in the side render; the island at source +x is starboard only with the bow at −z (no mirror: node matrix determinant +1) | flat base at y = 0 (waterline printing model) | flight deck **y = 2.50** (up-facing, consistent winding; the 2.24 plane is the overhang's underside) |
| `liberty-ship.glb` (AlanTinka), 12,936,060 B | 42,735 | 1 / 1 | 4 × 1024² PNG (4.61 MB): color, metal-rough, normal, `KHR_materials_specular`. **10 UV sets, 9 unused** (4.7 MB of a 5.2 MB interleaved UV buffer) | z; **bow +z**: raked stem, rudder and propeller at −z, ensign aft, narrow end at +z | full hull (keel at y = 0.0008). **Red/black boot-top seam at y = 0.0075**, sampled from the base-color texture on hull-side triangles amidships: red ≥ 94% below 0.007, black or grey above | 0.0129 (10.3 m above keel at class length) |
| `fletcher-dd.glb` (JZHU) | 43,316 | 146 / 29 named flat materials | 3 small PNG (0.04 MB); 4 `BLEND` railing/radar lattices | x; **bow +x**: anchors at +4.6–4.8, propellers at −4.3 | **y = 0 exactly**: `hullred` top 0.000, `hulldark` bottom 0.000 | 3.5 m aft, ~6 m forecastle |
| `cleveland-cl.glb`, `mogami-ca.glb`, `musashi-bb.glb` (KTKloss) | 9,407 / 5,603 / 10,132 | 1–2 / 1–2 | none | z; bow −z (narrow end; Mogami weak at 0.83) | flat base at y ≈ 0 | 6.5 / 6.5 / 7.5 m |
| `shiratsuyu-dd-samidare.glb` | 140,199 | 17 / 11, metal-rough maps with implicit `metallicFactor` 1 | 23 PNG, 9.5 MB | x; bow +x (ensign aft) | **unknown**: y = 0 would give an implausible 2.5 m deck | not trusted |

## 2. Model shortlist and picks

**Method (2026-09-25).**

- Searched the public `api.sketchfab.com/v3/search?type=models&downloadable=true`.
- Read license, downloadability and price from `/v3/models/<uid>`, not the page.
- Judged authorship the way `ASSETS.md` does, from the description, tags and the
  uploader's other models (`/v3/search?user=<username>`).

Every pick below is **CC-BY 4.0** (`license.slug` = `by`), downloadable and
unpriced. None carries ShareAlike, NonCommercial or a Standard license.
Sketchfab's "faces" can undercount triangles: the Fletcher lists 23,727 faces
and measures 43,316 triangles.

### 2.1 The three shipped ships (S1)

| Spec | Pick | uid | Author | Triangles | Textured | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `essex-cv` | **USS Enterprise (CV-6), Yorktown class**, "Model for small scale printing" | `bf79e093d4c94b0eb02097c178dd6e98` | KTKloss | 15,339 | no | The only license-clean WWII US fleet carrier on Sketchfab (§2.3). Same original-work printing series as the staged Cleveland, Mogami and Musashi. A stand-in; §4.3 fits it to the Essex deck. |
| `fletcher-dd` | **Fletcher** (staged) | `5cddc3309139413e8c08462c8741b884` | JZHU (@hellomynameis.jeffz) | 43,316 | partly (named flat materials, 3 small lattice textures) | Exact class, full hull, waterline and bow measured |
| `type-b-maru` | **Liberty ship** | `a1db8e8414464c5d8b11383e202fcf26` | AlanTinka | 42,735 | yes | A WWII emergency-program freighter: midships house, single funnel, well decks, which is the Type B's silhouette in a US hull. Textured, with a measurable waterline. The author's five other uploads include the already-accepted torpedo, and the description says "free to download and free to use everywhere". |

**Alternates.** Each is vetted CC-BY:

- `essex-cv`: KTKloss **USS Independence** CVL, `ec30b6bdd81e4a3292685933b9f4ea13`,
  2,860 faces. It is too small; it is reserved for the Casablanca.
- `fletcher-dd`: KTKloss **USS Fletcher**, `82aa255d14284bcfba6333a88f9e7321`,
  2,536 faces, untextured waterline model.
- `type-b-maru`: Ronald_Reagan **Merchant-Ship**,
  `c45b1fa4090a44bca0318091f7fb4476`, 7,646 faces, 3 textures, described as a
  "hand-painted low-poly tramp steamer" and self-described as "a wip". The
  uploader's history is small original low-poly military models.

### 2.2 The rest of the roster (S2, optional)

| Roster ship (GAMEPLAY.md) | Pick | uid | Author | Faces | Textured | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Cleveland-class CL | staged `cleveland-cl.glb` | `da03808e0aa74ca89a237ce4da2ac29e` | KTKloss | 9,473 | no | exact class |
| Mogami-class CA | staged `mogami-ca.glb` | `89ccafb8c0884b868d806d7654f0fa71` | KTKloss | 5,614 | no | exact class; weak bow evidence, so S2 renders to confirm |
| Yamato-class BB | staged `musashi-bb.glb` | `698f9b6de9204609ae09aaa98f6f1e30` | KTKloss | 10,146 | no | exact class |
| Kagero-class DD | staged Samidare, as a Shiratsuyu stand-in | `b37939147c854e61857f5b248f9efd29` | everlasting17th | 64,750 (140,199 measured) | yes, 23 | Needs about 30% simplify. **Waterline unmeasured.** Alternate: JorritK "Simple IJN Fubuki" `8dcd2682ac904026a0fa64947d966920`, 4,812 faces, untextured; authorship uncertain (a single-upload account with no stated origin) |
| Pennsylvania-class BB | KTKloss **USS Nevada** as a stand-in (Pennsylvania was an enlarged Nevada) | `40b6f56f6d454bbcb3da80efc350972f` | KTKloss | 8,684 | no | Alternate: martyn169 **USS Arizona** (Pennsylvania class, textured), `ce2862b9e3994c2ea108c2cf2419b5c5`, 1,716,948 faces, a heavy decimation risk; the author has a large original portfolio |
| Casablanca-class CVE | KTKloss **USS Independence** (CVL) as a stand-in | `ec30b6bdd81e4a3292685933b9f4ea13` | KTKloss | 2,860 | no | No Casablanca, Bogue or Sangamon exists. Searched "casablanca", "gambier bay", "jeep carrier", "escort carrier", "cve" |
| Shiratsuyu (`docs/model-candidates` roster only) | staged Samidare | as above | | | | exact class |

### 2.3 Checked and rejected (2026-09-25), so they are not re-found

- **Every "Essex" carrier.** The uploads by philano `4a60a989…`, Spark_Customs
  `92033a1d…`, tonkermansreal `c6094509…`, HDT130 `5ee9f269…` and williampanchit
  ("Air Carrier", `da2b6526…`) all have **exactly 98,004 faces**: one model
  uploaded five times. Spark_Customs's copy says "Imported from Free3D", which
  is a personal-use license.
- **USS Midway.** The shangus930 `6925890e…` and 1546809 `bf2527cf…` uploads are
  identical 404,382-face models tagged `world-of-warships`/`wows`, a probable
  game rip. trbaker `7c3d45e9…` is "from the fine work of AeroScience", a
  re-upload. Midway was also commissioned after the war.
- **Kagero, cloudhub `efbc1fe1…`.** No description or tags. The uploader is an
  agency account (Telekom, Miele, BMW work).
- **Kagero, yepetto `e76ecad4…`.** A BrickLink/Tente toy-brick build.
- **"USS Yorktown AI", 30000151 `4f85632f…`.** CC-BY-NC-SA, and apparently
  AI-generated.
- **"aircraft carrier", lucasl1021 `863ce6e1…`.** A modern CVN-78.
- **"Old Freighter", ramieous `7aa603e3…`.** A spaceship.
- **Already on the candidates branch's rip and re-upload list:** kriss50 (Essex
  CV-9, Hornet, Pennsylvania, Langley, Victory Cargo), KojfDiscord (War Thunder
  Enterprise, Kagero, Yukikaze, Arizona), lxyun_2 (Hornet CV-8, Yukikaze),
  oiopu (Yukikaze).

## 3. How a ship spec selects its model

### 3.1 `view.model`, the same pattern as aircraft

Lane B gives aircraft a required render-only `view.model` and recommends the
same id-to-registry pattern for ships (its §7.2 and §10). Ships follow it, with
one difference:

- **`ShipSpec` gains an optional `view: { model: string }` block**, strict like
  the rest of the schema. It is optional because S2's roster specs may land
  before their models, and a spec without a model is a supported state
  (§3.4).
- The change is additive: one optional key in `src/sim/world/ships.ts`. No sim
  code reads it, and the sim's boundary rules still hold. The shipped JSONs gain
  `"view": { "model": "essex-cv" }` and so on.
- `src/render/scene/shipModels.ts` is the registry,
  `Record<modelId, { url }>`. A Tier 1 test asserts that every
  `content/ships/*.json` that names a model names a registered one, the ships
  twin of Lane B's registry-coverage test.

### 3.2 One output per ship spec

A fit is specific to the spec it fits (§4). So the entry id, the output
basename and the model id all equal the **spec id**:
`tools/models/entries/essex-cv.json` builds `content/ships/essex-cv.glb`, which
Lane B's §6.1 designates the ships output directory. If a stand-in serves two
specs (the Independence for the Casablanca, say), that is two entries and two
outputs from one raw input.

### 3.3 Loading, through Lane B's model cache

Each ship instance calls `acquireModel(url)` from
`src/render/models/modelCache.ts`. That gives one parse per URL, a per-instance
`clone`, shared geometry and materials, and reference-counted `release()`. The
two Fletchers in deck-quals share one parse. Ships obey the cache's rule that
**instances never mutate a shared material**: sinking and listing move the
per-instance `hull group`, and no ship material is touched per ship. On
scenario switch, ship handles `release()` their instances, and the procedural
boxes keep `disposeMeshTree`, exactly as Lane B's §7.1 prescribes. Runtime data
travels **inside the glb** (§4.6): a `SmokeOrigin` node read with
`instance.node('SmokeOrigin')`, and the sink depth from the instance's bounding
box. No side file can drift from its model.

### 3.4 Fallback, which is loud

A spec with no `view.model` renders the procedural boxes, as today. A model
whose `acquireModel` rejects also renders the boxes, so the game still runs,
**and** pushes the failure into the `validationErrors` list that `__ww2`
exposes. Tier 2 asserts that list is empty (§9). A silent fallback would ship a
broken asset as boxes, and nothing would notice.

## 4. Fitting a model to its ShipSpec

**The sim is authoritative. The model is fitted to it, never the reverse.** The
following all stay exactly as they are:

- Plan 8's deck
- the paddles glideslope
- the trap zone
- the deck-quals spot 241 m from the bow
- the strike hit boxes
- every golden and e2e tuned against them

The cost is a bounded distortion of a model that is already a stand-in.

### 4.1 Where the fit runs: at build time, re-checked by Tier 1 against the live spec

Lane B's `normalize` stage bakes forward, up, origin and a **uniform** scale
into the output, and "runtime applies no basis or scale fix". Ships need three
non-uniform residuals on top of that. So S1 adds two ship stages to Lane B's
pipeline. They run after `normalize` and before `join`, and each is a pure
`Document → Document` function unit-tested on synthetic documents, as Lane B's
own stages are.

1. **`shipFit`.** Reads the entry's `ship.spec` through
   `tools/content/load.ts`'s `loadShipSpec`, measures the normalized geometry,
   applies the residual fit (§4.2–4.4), adds the skirt (§4.5) and the
   `SmokeOrigin` node (§4.6), and **fails the build** if any tolerance is
   exceeded, naming the axis and the measured value.
2. **`shipMaterials`.** The palette roles, metalness and alpha (§5).

The measuring and fitting math lives in one pure module,
`src/render/scene/shipFit.ts`, which works on typed arrays and has no DOM and no
loader. The build stage calls it, and so does Tier 1, which reads the
**committed** glb with glTF-Transform's `NodeIO` and re-measures it against the
**live** `content/ships/<id>.json`. If Plan 8 ever moves the deck to 18 m,
Tier 1 fails and names the axis. The fix is
`tools/models/sketchfab-fetch.sh` (to re-acquire the gitignored raw input,
headlessly), then `npm run models:build -- essex-cv`.

**The entry format.** The residual stages need an **optional `ship` block** in
`ModelEntrySchema`. Lane B's §10 anticipates exactly this ("a stage a ship
needs … added in a Lane C task *after* Z1 merges"). The block is additive and
changes nothing about existing entries:

```jsonc
// tools/models/entries/essex-cv.json (illustrative; the numbers are this spec's measurements)
{
  "id": "essex-cv",
  "input": "tools/models/cache/enterprise-cv6.glb",
  "output": "content/ships/essex-cv.glb",
  "source": { "url": "https://sketchfab.com/3d-models/uss-enterprise-model-for-small-scale-printing-bf79e093d4c94b0eb02097c178dd6e98",
              "uid": "bf79e093d4c94b0eb02097c178dd6e98", "author": "KTKloss", "license": "CC-BY-4.0" },
  "normalize": { "forward": "-z", "up": "+y", "origin": [0.03, 0, 0.80], "fit": { "extent": "length", "meters": 265.8 } },
  "opaque": false,                               // shipMaterials owns alpha (§5.3)
  "budget": { "maxBytes": 1500000, "maxTriangles": 60000, "maxDrawCalls": 8 },
  "ship": {
    "spec": "essex-cv",
    "fit": "deck",                               // "hull" for everything that is not a carrier
    "kind": "waterline",                         // "full-hull" models get no skirt
    "palette": "usn-1944",
    "materials": {},                             // per-source-material role and alpha overrides (§5)
    "smokeOrigin": "funnelTop"                   // or an explicit [x,y,z] in fitted meters
  }
}
```

### 4.2 Every ship: orientation, waterline and length (`normalize`)

- **`forward`** is the bow axis (§1's evidence column).
- **`origin`** is the source point that becomes (0,0,0): the waterline, midships,
  on the centerline. That is Lane B's stated ships convention. For
  waterline-cut models the waterline is the flat base. For full hulls it is the
  measured seam: Fletcher y = 0, Liberty y = 0.0075.
- **`fit`** is `length` in meters. `hull`-fit ships use `lengthM`. Carriers get a
  deck-derived length that `shipFit` corrects exactly (§4.3).

The Liberty's seam gives a **draft of about 6.0 m and a main-deck freeboard of
about 4.3 m** at 112 m length, against a hit-box top of 6 m. That is within
§4.4's ±3 m.

**Bow-orientation checks.** Both are asserted on the output:

- **Non-carriers: the narrow-end check.** The maximum half-beam in the forward
  5% of the hull must be at most 0.9 × the aft 5%. It passes for the Fletcher,
  the Liberty and all three KTKloss cruisers and battleships (Mogami at 0.83).
- **Carriers: the island must be to starboard (+z) after the fit.** The
  narrow-end check **fails for the CV-6**: at the waterline its bow's first 5%
  measures 0.215 against a fine cruiser stern at 0.057, so the check would
  have sent it stern-first. A reversed or mirrored carrier puts its island to
  port, so the island check catches both errors.

### 4.3 The carrier deck fit (`fit: deck`)

What the eye lands on must be what the sim lands the wheels on. That is Plan 8's
own rule, stated in `ship.ts`. Measured on the CV-6 on 2026-09-25, with the
fit applied and ray-cast:

1. **Length from the deck.** The deck plane's 1st-to-99th-percentile length is
   36.05 source units, which gives `sx` = 262.7 / 36.05 = **7.287 m/unit**.
   The deck is then re-centered at x = 0, because the sim's `Deck` is centered
   on the ship. The rendered overall length is **270.4 m** against `lengthM`
   265.8, **+1.7%**. The sim hit box stays 265.8 m.
2. **Height from the deck plane.** `sy = 17 / 2.50` = 6.80. The rendered deck is
   exactly 17 m above the waterline, and `sy/sx` = **0.933**.
3. **Beam varies with height.** The lateral scale runs linearly from
   `kWaterline` at y = 0 to `kDeck` at the deck plane, and holds `kDeck` above
   it (the island and gun tubs):
   - **`kWaterline` = 28.3 / (3.612 × sx) = 1.075**, from the waterline beam.
   - **`kDeck` = 32.9 / (3.653 × sx) = 1.236**, from the median per-slice deck
     width (26.6 m, which matches Yorktown's published 86 ft).

   The result: the hull at the waterline matches the sim's 28.3 m beam, and the
   deck matches the 32.9 m landing rectangle. Per unit of length, an Essex's deck
   is proportionally wider than a Yorktown's (108 ft against 86 ft), so the warp
   pushes the stand-in toward the class it represents. `kDeck` is close to the
   1.25 cap (§4.4). That is recorded, not hidden.
4. **Ray-cast grid**, 2 m cells over the 262.7 × 32.9 m rectangle (2,096 cells),
   with the rendered surface compared against 17 m:

   | Result | Share |
   | --- | --- |
   | Within ±0.15 m | 93.6% of all cells; **97.2%** of cells more than 2.5 m from the long edges |
   | Within ±0.15 m on the centerline, including all of the trap zone | **100%** |
   | Below the deck (drawn deck narrower than the rectangle) | 1.9%, all at \|x\| ≥ 90 m and \|z\| ≥ 13 m, where the real deck tapers toward bow and stern. A wheel there rests on the sim deck over drawn water, as today's square corners also imply. |
   | Above the deck: fittings | at most 0.35 m high, at the deck ends and edges |
   | Above the deck: the island | x −28 to +42 m, z +8.6 to +16.5 m, up to 27.8 m tall. It sits **inside** the rectangle, reaching about 8 m inboard of the 16.45 m half-width, where the real island stood. |

5. **The trap band stays.** It is today's procedural `trap zone` overlay from
   the spec's `fromSternM` to `toSternM`, drawn at 17.03 m. The grid shows the
   rendered deck under its whole span.
6. **The island is still not collision.** The sim never had one (carrier-ops §4).
   Today's boxes draw the island outboard of the rectangle on purpose. The real
   model puts it on the deck, where the ship had it. A Wildcat on the
   centerline clears it by about 2.1 m of wingtip (rendered half-span 6.53 m,
   `TARGET_WINGSPAN_M` in `wildcat.ts`, against the island's inner face at
   8.6 m). An airplane that drifts farther to starboard
   rolls through a drawn island. That trade is Open item 4. Island collision is
   a sim feature for a later plan and not a render fix.

### 4.4 Tolerances (design constants: `shipFit` fails the build on any, and Tier 1 re-asserts them)

| Quantity | Tolerance | CV-6 measured |
| --- | --- | --- |
| Rendered hull length vs `lengthM` (`fit: hull`) | ±0.5% | — |
| Rendered deck length vs `flightDeck.lengthM` (`fit: deck`) | ±0.5% | exact by construction |
| Rendered overall length vs `lengthM` (`fit: deck`) | ±3% | +1.7% |
| Lateral `k` (`hull`), `kWaterline` and `kDeck` | 0.85 to 1.25 | 1.075, 1.236 |
| `sy/sx` (carriers) | 0.85 to 1.15 | 0.933 |
| Main-deck plane vs `deckHeightM` (non-carriers; vertical scale left uniform) | ±3 m | Fletcher 3.5–6 against 6; Liberty 4.3 against 6 |
| Deck cells within ±0.15 m, excluding the 2.5 m edge bands | ≥ 95% | 97.2% |
| Deck cells within ±0.15 m on the centerline and trap zone | 100% | 100% |
| Below-deck cells | only where \|x\| ≥ L/2 − 45 m and \|z\| ≥ W/2 − 4 m | all there |
| Above-deck cells outside the island's region | ≤ 0.5 m high | 0.35 m |
| Narrow-end ratio (non-carriers) / island to starboard (carriers) | ≤ 0.9 / +z | — / +z |

A model that fails is rejected at S1 Task 1 (§11) and replaced by its §2
alternate. It is never forced to fit.

### 4.5 Waterline models get a skirt

KTKloss models are cut flat at the waterline, so a wave trough would show that
flat base edge-on. `shipFit` adds a skirt: the 2D convex hull of the fitted
vertices in the lowest 0.3 m, extruded to −3 m as a wall in the `hull` role. A
ship's planform is close to convex, and the sea hides the rest. Full-hull
models (the Fletcher and the Liberty) keep their own underwater hull.

### 4.6 What the output carries for the runtime

- **`SmokeOrigin`**, an empty node in the glb. `funnelTop` means the highest
  point of the funnel's region, which the stage finds as the tallest cluster of
  above-deck geometry between the masts; Task 1 records the choice. An explicit
  point is allowed too. Tier 1 asserts it lies inside the fitted bounds and
  within 5 m of the surface a ray finds straight below it.
- **Sink depth**, computed at runtime as the instance's bounding-box top plus
  2 m. It needs no stored number.

## 5. Materials (`shipMaterials`)

Ships cannot use Lane B's default `opaque: true` stage, for the reason in §5.3.
Their entries set `opaque: false`, and `shipMaterials` owns alpha instead.

### 5.1 Palette roles

Every triangle ends up in one role: `hull`, `deck`, `flightDeck`, `boot`,
`antifouling`, `superstructure` or `fitting`. Each role is one glTF material
with a palette `baseColorFactor`, **`metallicFactor` 0** and roughness around
0.8, so Lane B's `join` gives about one draw call per role.

- **Named source materials** map to roles through `ship.materials`. The
  Fletcher's `hullgrey`, `deck`, `hullred`, `hulldark` and the rest have
  factors of 0.5 grey and so carry no color of their own.
- **Single untextured materials** (KTKloss) are classified by geometry:
  up-facing triangles (n.y > 0.9) become `deck`, those within ±0.3 m of a
  carrier's fitted deck plane become `flightDeck`, and everything else becomes
  `hull`.
- **Palettes** (`usn-1944`, `ijn`, `merchant`) live in one module. Their values
  are a render choice tuned under the photoreal exposure (§5.4). Hull-plating
  textures went with §3.3. Reusing `buildings.ts`'s `weathered()` is a possible
  follow-up and not part of this design.

### 5.2 Textured models (Liberty; S2's Samidare)

Base-color textures are kept, resized and WebP-encoded by Lane B's texture
stage. **`metallicFactor` is forced to 0.** The Liberty and the Samidare both
carry a metal-rough texture with no factor, and glTF then defaults the factor to
1. A metallic surface under a hemisphere light with no environment map renders
near black (photoreal plan Task 12 Step 3). The Liberty's
`KHR_materials_specular` stays optional: it is in `extensionsUsed` and never in
`extensionsRequired`.

### 5.3 Alpha

The Wildcat's force-everything-opaque rule would turn the Fletcher's railing
lattices into sheet steel. `ship.materials` marks those four materials `MASK`
with a cutoff of 0.5. Every other material becomes `OPAQUE`. No ship material is
`BLEND`, which still closes the Wildcat's sorting defect, and Tier 1 asserts it
(Lane B's output test already does the same).

### 5.4 The photoreal render pass

The photoreal session owns exposure, the ocean, the pipeline and the GPU probe.
Its **Task 12 Step 3** requires the deck-quals deck's mean luminance to fall
within [0.5×, 1.5×] of the runway's, and it may edit `ship.ts` materials to get
there. Consequences for this plan:

- Whatever Task 12 rules about ship materials (metalness, `receiveShadow`,
  albedo) carries into the palette. The executor reads photoreal's ledger or
  handoff first.
- S1's runtime task (§11, Task 7) starts after Task 12 lands on `main`, or
  rebases onto it.
- The Task 12 luminance check must stay green with the `flightDeck` color. Tune
  inside the gate. Do not re-baseline it.
- Ships keep today's `receiveShadow` and do not cast shadows. Island-on-deck
  shadows are photoreal's call.

## 6. Damage, fire and sinking

`setDamage(fire, sinkingFraction)` keeps its signature and its inner
`hull group`, which now holds the model instance's `root`, the trap band and
the smoke. Three changes:

- **Sink depth.** It becomes the fitted top plus 2 m (the CV-6's mast is about
  45 m up), instead of `deckHeightM + draft`. A real island or mast then goes
  under before `root` hides.
- **Listing.** The rotation moves from `rotation.z`, which is a trim, to
  `rotation.x`, about the keel. It is still 8° and still to a fixed side, which
  is what the strike design specified. The existing test only asserts that
  `rotation.z` is non-zero, so it changes with the fix.
- **Smoke.** It rises from `instance.node('SmokeOrigin')`.

Hit volumes are unchanged (§1). Rounds that strike rendered superstructure still
pass through it, as today.

## 7. Budgets and decimation

Each budget is an entry `budget` block, which Lane B's stage 8 enforces at build.

| Entry | Triangles | Draw calls | Bytes | Measured or expected |
| --- | --- | --- | --- | --- |
| `essex-cv` | ≤ 60,000 | ≤ 8 | ≤ 1.5 MB | 15,339 tri, no textures, 0.94 MB raw |
| `fletcher-dd` | ≤ 45,000 | ≤ 12 | ≤ 3 MB | 43,316 tri (no simplify); 146 meshes join to about one per role |
| `type-b-maru` | ≤ 45,000 | ≤ 4 | ≤ 4 MB | 42,735 tri (no simplify). The raw 12.9 MB is 4.6 MB PNG, a 5.2 MB UV buffer of which 9 of 10 sets are unused, 2.6 MB position, normal and tangent, and 0.5 MB indices |

The CV-6 plus two Fletchers, the heaviest scenario, come to about 102k ship
triangles, against 100,886 for a single Wildcat. The Tier 2 budget test measures
the real cost (§9).

**The Liberty needs one capability Lane B's stage list lacks: pruning unused
vertex attributes.** Its material references only `TEXCOORD_0`. After pruning,
the buffer holds position, normal, tangent and UV0 (65,057 × 48 B = 3.1 MB),
plus 0.5 MB of indices, plus an estimated 1 MB of WebP: about 4.6 MB, over the
4 MB budget. Dropping `TANGENT` (1.0 MB; three.js falls back to
derivative-based tangents for a normal map without them) and the specular
texture brings it to about 3.4 MB. S1 requests a `prune`
stage (glTF-Transform's `prune`, keeping only used attributes) from Lane B, or
adds it after Z1 under the same terms as the ship stages.

**Simplification** means meshoptimizer's simplifier, which rewrites plain
geometry and needs no decoder. None of S1's three models needs it. S2's Samidare
(about 0.3) and the Arizona alternate do. **No compression stage exists**
(Lane B §6.2), and the output test asserts that `extensionsRequired` holds
nothing but `EXT_texture_webp`.

## 8. The Lane B dependency, and file ownership

### 8.1 What S1 consumes from Lane B's Z1

Exactly Lane B's §6 and §7.1:

- one `tools/models/entries/<id>.json` per model, validated by
  `ModelEntrySchema`
- `npm run models:build -- <id>` and `npm run models:inspect -- <file.glb>`
- the stages `normalize`, `join`, `simplify`, textures, `opaque`, and the budget
  check
- the `copyContent` filter that keeps `content/models/` out of `dist/`
- `acquireModel(url)` with `release()` and shared-material identity
- the async `scenarioEntities` pattern

**S1 is sequenced after Z1 merges.** There is no parallel pipeline. If Z1 slips,
S1's Tasks 1–3 go ahead, since they need only the pure module and synthetic
tests (§11), and the rest waits.

**What S1 adds to Lane B's area, after Z1 merges, without changing its
interface:**

- the optional `ship` block in `ModelEntrySchema`
- the `shipFit` and `shipMaterials` stages in `tools/models/stages/`
- the `prune` stage, if Lane B has not added it

Each can be requested from Lane B instead.

**Raw inputs.** Lane B's entries read `tools/models/cache/<name>.glb`, which is
gitignored under `/tools/**/cache/`. S1 copies the CV-6 and Liberty downloads
there from `content/models/candidates/`, or re-fetches them with
`sketchfab-fetch.sh`.

### 8.2 File ownership

| Owner | Files |
| --- | --- |
| **This work (S1/S2)** | `tools/models/entries/{essex-cv,fletcher-dd,type-b-maru}.json` (S2: its six), `tools/models/stages/shipFit.ts`, `shipMaterials.ts` (plus `prune.ts` if needed), the additive `ship` block in `manifest.ts`, `src/render/scene/shipFit.ts`, `shipModels.ts`, `ship.ts`, the **ship half** of `src/render/scenarioEntities.ts` (after Z1), `content/ships/*.glb`, the `view` block in `src/sim/world/ships.ts` and in the three shipped `content/ships/*.json`, `tests/render/ship*.test.ts`, `tests/tools/shipModels.test.ts`, `tests/e2e/ships.spec.ts`, the deck-probe test in `tests/e2e/deckQuals.spec.ts`, the ship rows of `ASSETS.md` and the ship lines of `tests/build/dist.test.ts` |
| **Lane B (A6M Zero)** | everything else in `tools/models/**` and `src/render/models/**`, the airframe half of `scenarioEntities.ts`, the per-aircraft loop in `main.ts` |
| **Photoreal render pass** | render pipeline, ocean, exposure, clouds, sky, terrain shading, the GPU quality probe, and the deck-luminance gate in `deckQuals.spec.ts`. S1 adds a separate test to that file and rebases on theirs. |
| **Lane A (AI 7c)** | nothing shared. Landing AI reads the sim's `Deck`, never render geometry. |
| **Nobody in this work** | `src/sim/**` beyond the one optional schema key, and every sim number in `content/ships/*.json` |

`main.ts`'s ship-pose loop does not change. The yaw convention and
`setDamage` calls are unchanged.

## 9. Headless acceptance: Mark stays out of the loop

Tier 1 runs in `npm run verify` on a fresh clone. It reads **committed** glbs,
never the gitignored candidates. Tier 2 is run by the **executing agent** on the
reference GPU through a spare dev slot (`ww2airsim-2` or `-3`, per the repo
`CLAUDE.md`), so it does not skew the photoreal session's timings.

**Tier 1, per committed ship glb** (`tests/tools/shipModels.test.ts`):

1. **Provenance.** `asset.extras` author, `CC-BY-4.0` and source URL match the
   entry's `source`. `ASSETS.md`'s 3D-models table has a row for the glb path
   with the same URL and "CC-BY 4.0".
2. **Budgets, extensions and materials.** §7's limits hold, no material is
   `BLEND`, and every `metallicFactor` is 0.
3. **The fit, re-measured against the live spec.** Every §4.4 tolerance, the
   bow check, the waterline (y = 0 at midships ± 0.05 m on the source seam),
   and finite vertices.
4. **The carrier grid.** Three's `Raycaster` against a mesh built from the
   committed triangles gives §4.3's grid rules, the trap band lying on rendered
   deck along its whole span, and the island to starboard.
5. **`SmokeOrigin` and sink depth**, as in §4.6 and §6.

**Tier 1, runtime** (`tests/render/ship.test.ts`, extended). These tests use a
synthetic instance through `acquireModel`'s injectable parse, so `GLTFLoader`
never runs in Node. They check:

- bow +x and the waterline at 0 in the posed frame
- `setDamage` sinks by the top plus 2 m, rotates about **x**, and hides at 1
- the smoke sits at `SmokeOrigin`
- the trap band exists on carriers
- no `view.model` gives boxes
- a rejected `acquireModel` gives boxes plus a `validationErrors` entry
- `release()` runs on scenario switch
- two instances share `===` materials
- the registry-coverage test passes

**Tier 1, build artifact** (`tests/build/dist.test.ts`): each ship glb is in
`dist/` at its exact byte count, as the Wildcat's is.

**Tier 2, run by the executing agent:**

- **`deckQuals.spec.ts`, a new test.** A `__ww2.shipDeckProbe()` diagnostic
  ray-casts the *loaded, posed* carrier instance straight down under the parked
  airplane's main-gear contact points. It asserts |rendered surface − sim wheel
  contact| ≤ 0.2 m, and repeats that at the trap-zone center and 5 m short of
  the bow during the deck run. This proves the deck neither floats nor sinks
  under the wheels in the real renderer, not only in Node math.
- **`ships.spec.ts`.**
  - `validationErrors` is empty in free-flight, deck-quals and strike-range.
  - A broadside screenshot of each ship, which the agent reads itself.
  - gpu p95 < 6.0 ms at 1440p in deck-quals and strike-range.
- **Regression.** The strike e2e passes unchanged, because the hit box did not
  move.

## 10. Licensing

- **`ASSETS.md`.** Each committed ship glb gets its 3D-models row **before** it
  is committed, holding the path, Sketchfab URL, author and "CC-BY 4.0 (URL),
  author credit required". A provenance paragraph in the Wildcat's style
  records:
  - the fetch date and that the license was read from the API
  - the triangle count
  - what the build changed (attribute prune, texture re-encode, palette roles,
    metalness, alpha, fit and skirt)
  - that it is a stand-in, where it is one: "USS Enterprise (CV-6), Yorktown
    class, rendered as the Essex-class `essex-cv`"

  The matching rows then leave "Candidate models". That section lives on the
  unmerged `docs/model-candidates` branch (`e8ebcd2`), so S1's `ASSETS.md` task
  first brings it to `main`, by cherry-pick or by Mark's merge, whichever has
  happened by then.
- **ShareAlike.** No pick is CC-BY-SA. A future SA pick needs its own ruling
  against the repo's AGPL-3.0.
- **In-app credit.** CC-BY 4.0 §3(a) asks for creator credit "in any reasonable
  manner", and `legend.ts` already credits the CC-BY WorldCover data with a
  line linked to the deed. **The committed Wildcat (CC-BY, rojatsu) has no
  in-app credit today** (`legend.ts`, checked 2026-09-25). This design proposes
  one "Models:" credits line generated from `tools/models/entries/*.json`,
  covering the Wildcat, the ships and Lane B's Zero. That is Open item 3.

## 11. Plans: two sub-plans, each independently shippable

### S1: the three shipped ships (about 10 tasks; Tasks 4+ after Lane B's Z1)

1. **Inspect and confirm.** Put the CV-6 and Liberty raw files into
   `tools/models/cache/`. Re-read each license from the API, and cross-check
   `asset.extras` against the `.sketchfab.json` sidecar. Re-run this spec's
   measurements with `models:inspect` plus the pure measure functions, and
   record them in the plan's progress ledger. **Stop and report** if any §4.4
   tolerance fails, and fall back to the §2 alternate. The downloads are done
   already (2026-09-25), so this is no longer a manual gate.
2. `src/render/scene/shipFit.ts`: measure, fit, grid, skirt and the bow checks,
   unit-tested on synthetic hulls with a pass and a fail for every tolerance.
3. The `view` block in `ShipSpec` and the three JSONs, the `shipModels.ts`
   registry, and the coverage test.
4. The additive `ship` block in `ModelEntrySchema`, plus the `shipFit`,
   `shipMaterials` and `prune` stages, each tested on synthetic documents.
5. The three entries, `models:build`, the committed glbs, and **their
   `ASSETS.md` rows in the same commit**.
6. Tier 1 output acceptance (§9, items 1–5).
7. `ship.ts`: the model path through `acquireModel`, trap band, sink depth, the
   list fix, `SmokeOrigin`, and the loud fallback. This starts after photoreal
   Task 12 (§5.4).
8. The ship half of `scenarioEntities.ts`: acquire, release and fallback. Also
   the `dist.test.ts` byte counts.
9. Tier 2: the deck probe, `ships.spec.ts` and the budget, on a spare slot.
10. The in-app credits line (if Open item 3 is approved), the handoff, the §15
    row, the README pointer, and the dated pointer at visual-realism §3.3.

### S2: the roster models (optional, after S1; about 6–8 tasks)

- New `content/ships/<id>.json` for Cleveland, Mogami, Yamato, Kagero,
  Pennsylvania and Casablanca, with sourced dimensions and labeled estimates, as
  in the existing three.
- Their entries and glbs from §2.2, including the Samidare waterline
  measurement and its simplify step.
- The same Tier 1 acceptance.
- **No scenario placement** (Open item 5).

## 12. Risks

- **`kDeck` sits at 1.236 against a 1.25 cap.** If the fit is re-measured with
  a different width estimator, it could cross the cap. The cap is a design
  choice. Raising it trades a stretched island for deck agreement, and the
  alternative is fitting the sim to the model, which this design rejects (§4).
- **The CV-6's deck tapers at the ends.** 1.9% of the sim rectangle, all of it
  at the bow and stern corners, has no drawn deck under it. This is measured
  and accepted, and the tolerance confines it to the corners.
- **The Liberty lands at about 3.4–4.6 MB** against a 4 MB budget, depending on
  whether tangents and the specular texture survive. The build's budget check decides; it is not
  assumed.
- **The Samidare's waterline is unknown** (S2 only). The fallback is the
  Fubuki.
- **The deck-luminance gate** could fight the flight-deck color. Tune inside
  it.
- **Merge overlap** in `scenarioEntities.ts` and `deckQuals.spec.ts` with Lane B
  and photoreal. Ownership is split by half and by test, and the executor
  re-diffs against `HEAD` before each commit.
- **Stand-ins are visible.** A Yorktown-shaped Essex and a US Liberty as a
  Japanese maru. Mark accepted inaccuracy in general; Open items 1 and 2 put the
  two most visible stand-ins in front of him.

## 13. Open for Mark

1. **Essex stand-in.** No license-clean Essex exists: every "Essex" on
   Sketchfab is the same Free3D import (§2.3). *Recommendation:* the KTKloss USS
   Enterprise (CV-6, Yorktown class, untextured). Its deck is warped 23.6%
   wider and its height scaled 6.7% shorter so that it meets the Essex deck
   exactly (§4.3, measured), and it is painted in flat 1944 Navy colors.
2. **Maru stand-in.** *Recommendation:* the AlanTinka Liberty ship. It is
   textured, has the right three-island freighter silhouette, and its waterline
   is measured from its own boot-topping. The alternative is Ronald_Reagan's
   smaller low-poly hand-painted "wip" tramp steamer; how well it reads as a
   period freighter is unmeasured.
3. **In-app model credits.** *Recommendation:* yes. Add one "Models:" line in
   the legend's credits, generated from the model entries and linked to the
   CC BY 4.0 deed. It would cover the Wildcat, which lacks a credit today, as
   well as the ships and Lane B's Zero.
4. **The island on the deck.** The real model puts the island about 8 m inside
   the sim's 32.9 m landing rectangle, where the ship had it. Today's boxes draw
   it outboard on purpose. With no island collision, a pilot who drifts more
   than about 2.1 m to starboard of the centerline rolls a wingtip through it.
   *Recommendation:* accept it as drawn, and log island collision as a sim
   follow-up. The other options are shaving the island outboard in the build,
   which misrepresents the ship, or narrowing the sim deck, which re-tunes
   Plan 8.
5. **S2 and scenario placement.** *Recommendation:* approve S2 (models plus
   specs for the six remaining roster ships) after S1. Leave putting hostile
   cruisers and battleships into scenarios to a scenario or meta-game plan.
