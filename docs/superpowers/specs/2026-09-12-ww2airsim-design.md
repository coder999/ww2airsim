# ww2airsim — Design

**Date:** 2026-09-12
**Status:** Approved design, pre-implementation
**Repo:** https://github.com/coder999/ww2airsim

## 1. What this is

A browser-based WWII Pacific air combat simulator, inspired by *Hellcats
Over the Pacific* (Graphic Simulations, 1991) and its *Missions at Leyte
Gulf* expansion. Clean-room: no original code, assets, or text.

The player flies an F6F Hellcat from carrier and land bases over a
geographically real Leyte Gulf, fights enemy aircraft, strikes ships and
ground targets, and must recover safely to bank score and earn promotion.

`ww2airsim` is a repo working title. The player-facing name is a deliberately
deferred decision (§13).

### Primary goal

This is a **technical playground**. The engineering is the deliverable, and
depth is allocated unevenly on purpose:

| Area | Depth | Rationale |
| --- | --- | --- |
| World and terrain | Deep | Real DEM/bathymetry, CDLOD, 100 km view |
| Graphics fidelity | Deep | WebGPU, FFT ocean, volumetric cloud, PBR |
| Flight physics | Good enough | Arcade-sim: readable and fun, not study-level |
| Combat AI | Basic | Pursuit, energy awareness, a small maneuver set |
| Content volume | Minimal | Eight scenarios, six aircraft |

### Non-goals

- A full historical campaign with persistent strategic state
- Multiplayer or netcode of any kind
- Study-level aerodynamics (no tabulated stability derivatives)
- Multi-crew or flyable aircraft other than the F6F
- Mobile or touch support
- VR

## 2. Platforms

| Role | Machine | Use |
| --- | --- | --- |
| Development, build, Tier 1 tests | nexus (headless Linux, Ryzen 7 PRO 6850H) | Pure-Node work; no GPU required |
| Reference platform, Tier 2 tests | Windows Ryzen desktop, Radeon RX 6700 XT (RDNA 2, 40 CU, 12 GB GDDR6) | All GPU-touching verification; canonical golden screenshots |

nexus is headless and cannot render, so the browser always runs on the Windows
desktop against a build served from nexus. There is nothing to sync between the
two machines.

**The dev loop must be a secure context.** `navigator.gpu` is exposed only in
secure contexts. Per the Secure Contexts definition, potentially trustworthy
origins are `https`/`wss`/`file`, `127.0.0.0/8`, `::1/128`, and
`localhost`/`*.localhost` — a plain-HTTP private LAN address such as
`http://192.168.0.50:5173` is **not** one. Serving the dev server over HTTP by
LAN IP would make WebGPU unavailable before any other work could begin.

Resolution, in order of preference:

1. **SSH tunnel (chosen).** From the Windows box,
   `ssh -L 5173:localhost:5173 nexus`, and open `http://localhost:5173`. The
   origin is then genuinely trustworthy rather than flag-excepted: no
   certificate to manage, nothing to re-apply on a fresh Chrome profile,
   Playwright needs no special configuration, and Vite binds loopback-only on
   nexus instead of `0.0.0.0`.
2. **HTTPS via mkcert**, with the CA trusted on the Windows box. Needed if
   something later requires a non-localhost origin.
3. **`--unsafely-treat-insecure-origin-as-secure`** is explicitly rejected: it
   is silently lost on a new profile and must be duplicated into every
   Playwright launch, which is exactly the kind of manual step this project is
   trying to eliminate.

Renderer target is WebGPU via Chrome's D3D12 backend. Golden screenshots are
GPU-dependent and are therefore generated on and only valid for the reference
platform.

**Browser support:** WebGPU-capable Chromium only. A WebGL2 fallback is
explicitly out of scope for v1; the renderer boundary (§3) keeps it possible
later without touching the simulation.

## 3. Architecture

The load-bearing constraint: **`sim/` never imports `render/`, and never
touches a browser global.** Everything below depends on it.

```
src/
  sim/          Pure TypeScript. Deterministic. 60 Hz fixed timestep.
    flight/       One flight model, six coefficient sets
    ai/           Pilot controllers emitting player-identical control vectors
    weapons/      Ballistics, convergence, hit resolution
    damage/       Structure and subsystem resolution
    world/        Terrain height queries, carrier and ship kinematics
    scoring/      Points, recovery multiplier, badge and rank evaluation
    entities      Plain typed arrays

  render/       Three.js WebGPURenderer. Reads interpolated sim state.
    terrain/      CDLOD quadtree clipmap
    ocean/        Cascaded FFT on compute shaders
    sky/          Precomputed scattering LUTs, volumetric cloud
    aircraft/     glTF instances, animation
    effects/      Tracer, smoke, splash, wake
    hud/          Cockpit instruments, gunsight

  input/        Keyboard, mouse, gamepad to a normalized control vector
    assists/      Rate damping, auto-rudder, stall limiter

  meta/         Pilot roster, persistence, mission selector, debrief

content/        JSON, schema-validated at load
tools/          Offline pipelines (DEM to terrain tiles) and test harnesses
```

### Why this split

1. **Headless testability.** With no renderer dependency, the entire
   simulation runs in Node at far faster than real time. See §11.
2. **The AI is a pilot, not a puppet.** AI aircraft receive no privileged
   movement path — they produce stick and throttle inputs into the identical
   flight model, so they are bound by the same physics as the player. This
   makes combat feel fair without any balancing code, and it is what lets an
   AI fly the player's seat in tests.
3. **Contained renderer risk.** WebGPU is the newest part of the stack. It is
   one swappable layer rather than a project-wide commitment.

Authoritative state lives only in `sim/`. The renderer interpolates between
the two most recent simulation ticks for display; it never writes back.

### Determinism

Required, not aspirational:

- Fixed 60 Hz timestep; render rate is independent
- Single seeded PRNG; no `Math.random` anywhere in `sim/`
- No wall-clock reads in `sim/`
- No iteration over unordered collections in state-affecting paths

A replay is therefore `(seed, input log)`.

**Bit-exact within one engine, not across engines.** IEEE-754 guarantees
exactness for basic arithmetic and `Math.sqrt`, but `Math.sin`, `cos`, `exp`,
and `pow` are implementation-approximated and may differ between V8 versions
and platforms — which is precisely the nexus-Node versus Windows-Chrome split
in §2. Consequences:

- Golden trajectories assert within tolerance, never exact equality, and record
  the engine and version they were generated on.
- A replay recorded in-browser reproduces exactly in that browser, and within
  tolerance in Node.

If replay fidelity across engines ever becomes load-bearing, the escape hatch
is to own the transcendentals — polynomial `sin`/`cos`/`exp` inside `sim/` —
which buys true cross-engine determinism at a small accuracy cost. Not needed
for v1.

## 4. World and terrain

### Geography

A ~200 x 200 km tangent-plane area centred on Leyte Gulf (~10.8 N, 125.3 E),
covering Leyte, southern Samar, Dinagat, and Surigao Strait.

| Layer | Source | Purpose |
| --- | --- | --- |
| Land elevation | Copernicus DEM 30 m (SRTM v3 void-filled as fallback) | Terrain heightfield |
| Bathymetry | GEBCO 2024 15-arcsec | Water colour ramp, shallows, near-shore wave attenuation |
| Surface classes | ESA WorldCover 10 m | Material splat guide |

Bathymetry is not optional. Seafloor depth is what makes the water read as
*this place* rather than generic blue.

**Known compromise:** surface-class data is modern. Tacloban is a city today
and was not in 1944. WorldCover is used as a rough splat guide only, biased
toward jungle and terraced agriculture, with built-up classes stripped. The
alternative is hand-authoring 40,000 km2, which is not worth it.

### Terrain rendering

CDLOD quadtree: displacement in the vertex stage, continuous LOD morphing to
eliminate popping, aerial-perspective fog, draw distance 100 km.

**Amended 2026-09-14, after Plan 4 built it.** This paragraph used to say
"heightmap tiles as textures" and "draw distance 60–100 km", and the tile grid
in particular is not what shipped — it was measured to be unnecessary and
deleted rather than built. The world is 8193 × 8193 samples and
`maxTextureDimension2D` on the reference card is 16384, so the whole world is
**one texture per mip level**, resident from load to exit. Deleted with the
tile grid: a tile manifest, a cache, an eviction policy, seam handling, and the
class of hitching bugs that only appear when a fetch lands late. The draw
distance is exactly 100,000 m, and the fog reaches full haze at that same
distance, which is what makes the far plane provably invisible rather than
merely distant. The measurements, the "why 8193 and not 6667" argument and the
fog/far-plane derivation are in
[`2026-09-13-terrain-design.md`](2026-09-13-terrain-design.md) §2 and §5 — read
those rather than trusting a summary here.

Two properties must be present from the first commit, because retrofitting
either is far more expensive than building with them:

- **Camera-relative rendering.** float32 world coordinates produce visible
  geometry jitter at 100 km scale. The world is translated each frame so the
  camera sits at the origin.
- **Horizon curvature.** Earth drops ~780 m over 100 km, which is visible from
  15,000 ft. A shader-space distance sink provides the feel without adopting a
  curved-earth coordinate system.

### Ocean

The showcase system, and the reason for choosing WebGPU. Cascaded Tessendorf
FFT on compute shaders: three spectrum cascades at differing scales producing
displacement, normals, and Jacobian-derived foam, driven by a Beaufort wind
setting. Bathymetric depth attenuates amplitude approaching shore and drives
the shallow-water colour ramp.

### Sky

Precomputed atmospheric scattering LUTs (Hillaire-style) plus raymarched
volumetric cloud at half resolution with temporal reprojection. Cloud coverage
and base altitude are per-scenario weather parameters.

### Performance

Target is 60 fps at 1440p on the reference platform (RX 6700 XT), with 1080p
as headroom. Quality tiers — cloud resolution, ocean cascade count, shadow
resolution, draw distance — are implemented from the start rather than
retrofitted once it is slow; tier thresholds derive from measured frame time
via the Tier 2 perf harness (§11) rather than from estimated hardware figures.

**What "measured frame time" turned out to mean, 2026-09-14 (Plan 4, the first
budget in this project).** It is not a frame interval. `requestAnimationFrame`
on the reference desktop fires every 10.0 ms and no Chromium flag moves it —
and that cadence is the browser's own, not the display's: the monitor runs at
3840×2160 @ 120 Hz, and the same 10.0 ms appears with the GPU disabled and
under headless. The budget is therefore a **WebGPU timestamp-query GPU-pass
duration**: 2.097 ms p50 at 1440p over Leyte, asserted at ≤ 3.5 ms
(`tests/e2e/terrain.spec.ts`). It excludes everything on the CPU side, which is
a real gap and is the reason a second instrument will be wanted before a tier
threshold rests on this. Evidence, method and the exact shape of that gap:
[`2026-09-13-terrain-design.md`](2026-09-13-terrain-design.md) §10.

Two consequences of the reference card:

- **12 GB of VRAM is generous for this workload.** Streaming pressure is not a
  design driver. [Amended 2026-09-14: this said "the terrain tile cache can
  hold a large resident set". There is no tile cache — see the terrain-rendering
  note above. The conclusion survives the correction and gets stronger: the
  entire terrain pyramid is resident, and costs 358 MB as `r32float` with mips,
  of 12,288 MB.] Half-resolution volumetric cloud and three ocean cascades are
  comfortable rather than tight.
- **The reference platform is well above median hardware.** Perf tiers and
  golden screenshots are calibrated to a card most people do not have. That is
  acceptable for a personal technical playground, but "fast on the reference
  platform" must never be read as "runs anywhere".

## 5. Flight model

Honest forces, simplified moments.

### Forces

- Lift: `0.5 * rho * V^2 * S * Cl(alpha)`, with a curve that peaks at
  `alpha_crit` and falls beyond it
- Drag: `Cd0 + k * Cl^2`
- Thrust: per-aircraft curve decaying with altitude
- Gravity, with mass from empty weight plus fuel and ordnance load

This yields real energy behaviour: altitude trades for speed, turning costs
energy, and climb rate degrades with altitude.

### Moments — the deliberate simplification

Control input commands a **body rotation rate** rather than applying torque
against moments of inertia. The commanded rate scales with airspeed up to a
reference speed (the square root of the dynamic-pressure ratio — see
`rateAuthority` in `src/sim/flight/model.ts`), which produces the single most
important authentic cue — controls going mushy near the stall and stiffening
at speed — at a fraction of the complexity. *Amended 2026-09-17: this said
"scales with dynamic pressure" and was implemented as speed squared, which
left 12–23 deg/s of roll at approach speeds; Mark chose the speed-proportional
law on all three axes, accepting that it re-tunes the rudder.*

Additional behaviours:

- Past `alpha_crit`, lift falls and a wing-drop moment is injected, giving a
  recoverable departure
- A small constant prop-torque yaw bias
- Structural limits: dive speed limit and G limit, with damage beyond

### Consequence: matchups emerge from data

Giving the A6M low wing loading and modest top speed, and the F6F mass, power,
roll rate, and a high dive limit, makes turnfighting versus boom-and-zoom fall
out of the physics. There is no per-aircraft special-case code.

### Assists

Two, both protective, both on by default: auto-rudder and the stall limiter.
`src/assists/index.ts` carries the reasoning and
`tests/render/frameAssists.test.ts` pins the behaviour.

**A third, altitude hold, was deleted on 2026-09-17** — Mark's call, on being
asked what it was. It entered this document's own module list as "combat trim",
Plan 3 implemented it and renamed it honestly (it holds the flight path, not
attitude, which a rate-command model already holds), and he had already
defaulted it OFF on 2026-09-15 for being unrealistic: at zero thrust it traded
speed for altitude and a dead-stick Hellcat flew level indefinitely. It was
never requested, and its departure test had become the thing pinning
`aero.cySlopePerRad` — the lateral force that makes the rudder work — at a
ninth of its physically plausible value. Deleting an unwanted feature was
cheaper than fixing a test that protected it.

### Guns

Six .50-cal M2 with convergence distance, dispersion cone, ballistic drop,
tracer every fifth round, and finite ammunition. Projectiles have
time-of-flight; hitscan is explicitly rejected, because being forced to lead a
crossing target is most of what makes gunnery satisfying.

Bombs, rockets, and torpedoes reuse the same projectile system with different
data. Bomb count is a pre-flight loadout choice (§8) and affects mass and drag.

The G4M carries defensive gunners: simple lead-and-fire within an accuracy cone.

### Damage

Structure hit points plus four subsystems — engine, controls, fuel, guns —
resolved by hit location.

| Subsystem | Effect when damaged |
| --- | --- |
| Engine | Thrust loss, smoke trail, eventual seizure |
| Controls | Reduced rate authority on affected axes |
| Fuel | Leak; fuel exhaustion becomes a live threat |
| Guns | Individual gun groups stop firing |

Sufficient for drama; no per-component structural modelling.

## 7. AI

Three layers, all inside `sim/ai/`.

1. **Flight controller.** Desired velocity vector in, control inputs out. A PD
   controller on attitude error. Shared by every AI aircraft and the only
   genuinely delicate piece.
2. **Maneuver library.** Short parameterized routines emitting desired vectors:
   lead pursuit, lag pursuit, break turn, barrel-roll defence, split-S, extend,
   scissors, bomber formation station-keeping, attack run.
3. **Decision layer.** Utility scoring over a small fact set — relative energy,
   angle-off, range, ammunition, damage, threat astern, fuel — rescored every
   0.5 s to select a maneuver. Utility scoring is chosen over a behaviour tree
   deliberately: less code, and it tunes far better against the headless
   matchup harness.

Pilot skill is purely a parameter set — reaction delay, gunnery accuracy,
energy discipline, disengagement threshold. Green versus veteran is data.

## 8. Meta-game

### Scoring

Points are **provisional until recovery**. This is the central risk/reward
mechanic: kills are worth nothing until the pilot is back on a deck or runway.

| Target | Points | Target | Points |
| --- | --- | --- | --- |
| Fighter | 500 | AAA battery | 250 |
| Bomber | 750 | Runway | 500 |
| Cruiser | 1500 | Building | 150 |
| Battleship | 3000 | Carrier | 5000 |

Recovery multiplier applied to the mission total:

| Outcome | Multiplier |
| --- | --- |
| Landed at carrier or airfield | 1.0 |
| Ditched alongside friendly ships | 0.5 |
| Bailed out over friendly water | 0.25 |
| Killed, or captured over enemy territory | 0.0 |

### Ranks

Cumulative banked score determines rank.

| Rank | Abbrev | Threshold |
| --- | --- | --- |
| Ensign | ENS | 0 |
| Lieutenant, junior grade | LTJG | 2,500 |
| Lieutenant | LT | 7,500 |
| Lieutenant Commander | LCDR | 17,500 |
| Commander | CDR | 35,000 |
| Captain | CAPT | 60,000 |
| Commodore | COMO | 100,000 |
| Rear Admiral | RADM | 150,000 |
| Vice Admiral | VADM | 225,000 |
| Admiral | ADM | 325,000 |

Flag officers do not fly combat aircraft. The top tiers are prestige rewards,
and the game does not pretend otherwise.

**Period accuracy note.** The ladder deviates from the modern USN list it was
drawn from. In 1944 the one-star flag rank was **Commodore** (reestablished
9 April 1943 for wartime service) and **Rear Admiral** was two stars with no
upper/lower-half split; "Rear Admiral (lower half)" as a title dates only to
1986. The substitution is one-for-one, so tier count and thresholds are
unchanged.

### Badges

Objective-based, not score-based. Each scenario defines named objectives;
completing them awards that scenario's badge. This deliberately rewards flying
the brief over farming kills.

### Pilot roster

The main menu is a roster of pilot records:

```
name, rank, cumulativeScore, missionsFlown, sorties,
kills (by type), badges[], status: 'active' | 'kia', resurrections
```

**Resurrection** flips `status` from `kia` back to `active` and increments
`resurrections`. It does not erase the death. The roster stays simultaneously
honest and forgiving.

### Persistence

IndexedDB, with explicit JSON export and import so a pilot survives a cleared
browser. Save/load round-trip equality is a property test (§11). Server-side
sync against existing auth infrastructure is possible later but is not worth
the coupling now.

### Mission selector

Scenario choice plus pre-flight loadout: fuel fraction and bomb count, both
feeding mass and drag into the flight model. The loadout screen is a
performance decision, not decoration.

### Debrief

Post-mission: targets destroyed with per-item points, mission total, recovery
multiplier applied, banked total, badges awarded, and any promotion.

## 9. Content and data

Everything tunable is JSON, validated with Zod at load time.

```
content/aircraft/*.json    mass (empty, fuel capacity), wing area, span,
                           Cl_max, alpha_crit, Cd0, k, thrust curve vs
                           altitude, max roll/pitch/yaw rates, dive limit,
                           G limit, armament, subsystem HP,
                           aiHint: 'boom-and-zoom' | 'turnfight',
                           reference: historical figures + citation (§11)

content/scenarios/*.json   bases, flights (type, count, skill, orders),
                           targets, objectives, weather (wind vector,
                           Beaufort, cloud coverage and base, time of day)

content/bases/*.json       carrier: course, speed, deck geometry, wire
                           positions, LSO cue parameters
                           airfield: runway endpoints, heading, elevation
```

Schema validation at the boundary is a correctness requirement, not hygiene:
malformed aircraft data does not throw, it produces `NaN` velocity, and a `NaN`
entering the integrator silently teleports the aircraft out of the world.

### Aircraft roster

| Aircraft | Role |
| --- | --- |
| Grumman F6F Hellcat | Player-flown |
| Lockheed P-38 Lightning | Friendly AI |
| Boeing B-17 Flying Fortress | Friendly AI, escort subject |
| Mitsubishi A6M Zero | Hostile fighter |
| Nakajima Ki-84 Frank | Hostile fighter, higher performance |
| Mitsubishi G4M Betty | Hostile bomber, defensive gunners |

This roster mirrors the original's and should be confirmed against a primary
source before art work begins; it currently derives from a secondary summary.

### Scenarios

Eight, with original names rather than the 1991 game's mission list:

1. **Deck Quals** — training: launch, pattern, recover
2. **Scramble** — intercept inbound G4M formation
3. **Airfield Strike** — bomb a coastal airstrip
4. **Escort** — protect a B-17 formation
5. **Flattop Hunt** — strike an enemy carrier
6. **Combat Air Patrol** — fighter sweep
7. **Kamikaze Watch** — defend the fleet from massed attack
8. **Single Combat** — 1v1 against a veteran Ki-84

## 10. Assets and licensing

The repo is public. The real legal exposure is **3D model provenance**, not
game IP — free model sites are riddled with license laundering.

Code is licensed **AGPL-3.0**. The network clause is deliberate: anyone running
a modified version as a network service must offer source. A consequence to
respect when pulling in dependencies — third-party code must be
AGPL-compatible, which permissive licenses (MIT, BSD, Apache-2.0) are, and
proprietary or GPL-incompatible code is not.

Rules:

- Either build deliberately simple low-poly models, or use only assets with
  verifiable licenses
- Every asset is recorded in `ASSETS.md` with source URL, author, and license
  before it is committed
- No original *Hellcats* code, art, sound, text, or mission names
- Terrain source data is open government data; attribution recorded in
  `ASSETS.md`

The Copernicus source rasters **are not committed** (106,966,683 bytes over
eight tiles, measured 2026-09-14). The repo holds the `tools/` pipeline plus a
small low-resolution fallback so that a fresh clone runs.

[Amended 2026-09-14: "Full tiles are generated locally or served from R2" —
the R2 half is retired. The browser fetches five levels totalling 702,346
bytes, and has never been able to fetch the 178,319,368 bytes of L0–L3, so
there is nothing an object store would be for. Closed, with the one condition
that would reopen it, in
[`2026-09-13-terrain-design.md`](2026-09-13-terrain-design.md) §9 item 2.]

## 11. Testing

Designed so that human attention is the last resort, not the default.

### Tier 1 — Node, no GPU, no browser

Covers roughly 90% of the logic. Runs in CI in seconds. Made possible entirely
by the §3 module boundary.

**Input sources with no human pilot**, all producing player-identical control
vectors:

1. Recorded input log (replay)
2. Scripted autopilot (`hold-level-heading`, `fly-pattern`, `approach`)
3. The AI pilot controller — the same code flying the Zeros, flying the
   player's seat through an entire mission

**What is asserted:**

- **Flight test cards.** Each aircraft's `reference` block holds cited
  historical figures — top speed at altitude, sea-level climb rate, stall
  speed, sustained turn rate, roll rate. The harness flies each measurement
  and asserts the simulated value within tolerance. Flight-model correctness
  becomes a comparison against documented reality rather than a judgement call.
- **Golden-trajectory regression.** Fixed seed and input sequence produce
  recorded trajectory checkpoints. Any physics change that shifts them must be
  deliberate. This is what makes tuning safe.
- **Invariants**, asserted every step: no `NaN` escapes an integration step;
  specific energy in the **airmass frame** never increases at idle throttle
  (ground-frame energy legitimately changes as the aircraft turns relative to a
  scenario wind vector, so the ground frame would flap); trimmed level flight
  stays trimmed; no
  aircraft is below terrain without a crash event; score is never negative.
- **Mission-level end-to-end**, AI-flown: landed, touchdown vertical speed
  within limits, wire caught, recovery multiplier applied, badge awarded,
  promotion fired.
- **Property tests** on save/load round-trip equality, scoring arithmetic, and
  rank threshold boundaries.
- **Matchup harness.** 500 seeded engagements per pairing, reporting win rate
  and time-to-kill. A tuning instrument, not a pass/fail gate.
- **Soak testing.** Thousands of randomized scenarios asserting the invariants
  above. The machine hunts; the output is a one-line summary.
- **Architecture boundary test.** The build fails if `sim/` imports from
  `render/` or references a browser global. This protects the testability of
  everything above from quiet erosion.

### Tier 2 — real GPU, reference platform

Playwright on the Windows desktop against a build served from nexus.
Automated, but requires a GPU, so it runs locally and nightly rather than in
hosted CI.

- **Adapter guard, asserted on every run.** `adapter.info.isFallbackAdapter`
  is `false` and `adapter.info` vendor/device identify the RX 6700 XT. Not a
  one-time spike check: if a driver update, a headless flag change, or a new
  Chrome version silently drops to a software rasterizer, every frame-time
  number and every golden screenshot produced afterwards is invalid. Failing
  loudly is the only way that does not quietly corrupt the baselines.
- **Zero WebGPU validation errors** across a scripted camera sweep, via
  `pushErrorScope` and `onuncapturederror`. Catches a large class of renderer
  bugs with no screenshots and no human judgement.
- **Frame-time budget** on a fixed benchmark scene; also the source of the
  quality-tier thresholds in §4.
- **Deterministic re-render**: the same scene and camera produce identical
  output twice.
- **Perceptual screenshot diffs** against committed goldens. A human looks only
  when a diff crosses threshold.

### Tier 3 — human eyes

Art direction only: does the ocean look convincing, do clouds read as clouds,
is the HUD legible. Irreducible, and deliberately rare.

### CI

GitHub Actions runs typecheck, lint, Tier 1, and build on every push, plus a
nightly Tier 1 soak run. **A nightly failure opens an issue**, so a regression
arrives as a notification rather than as something to go looking for.

No GPU in hosted CI, therefore no Tier 2 there.

## 12. Stack

TypeScript (strict), Vite, Three.js WebGPURenderer, Zod, vitest, Playwright
(Tier 2 only). Static build output; deployable to existing hosting.

## 13. Open items

These are tracked decisions with stated current defaults, not unknowns
blocking implementation.

1. **Player-facing name.** Deferred until there is something to name. Current
   default: repo working title `ww2airsim`. Candidates considered and held:
   *Paddles* (the 1944 LSO, period-correct as the Fresnel lens postdates the
   war), *Angels Fifteen*, *Feet Wet*. *Taffy 3* is recorded as **rejected**:
   that task unit flew FM-2 Wildcats and TBM Avengers from escort carriers, not
   Hellcats from fleet carriers.
2. **Aircraft roster confirmation** against a primary source before art work
   (§9).

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| WebGPU maturity | Reference platform is Chrome/D3D12, the most mature backend. Day-0 spike validates compute before anything is built on it. Renderer is one swappable layer. |
| FFT ocean is the hardest single system | Build after terrain is stable, against a flat-water fallback that keeps the game playable throughout. |
| Flight model feel | Flight test cards against historical data replace subjective judgement. Golden trajectories make tuning reversible. |
| Asset license contamination in a public repo | `ASSETS.md` discipline from commit one; retroactive audits are far worse. |
| Scope creep into a full campaign | Non-goals in §1 are explicit. Eight scenarios, six aircraft, no netcode. |

## 15. First steps

Detailed sequencing is the implementation plan's job, not this document's. The
minimum honest ordering:

1. **Day-0 spike on the reference platform.** Settles, rather than assumes:
   - Secure-context dev loop works end to end via the SSH tunnel (§2), with
     `navigator.gpu` present
   - `adapter.info.isFallbackAdapter` is `false` **and** `adapter.info` vendor
     and device identify the RX 6700 XT. Both checks are required: a software
     rasterizer can present as a non-fallback adapter, and frame-time budgets
     or goldens taken from one are worthless. Note the check is on
     `adapter.info`; the `GPUAdapter.isFallbackAdapter` property is removed
     from the platform.
   - The same adapter assertion holds under **headless** Chromium, which is how
     Tier 2 runs; headless is the likeliest place to silently lose the discrete
     GPU.
   - A trivial TSL compute pass using `workgroupArray` + `workgroupBarrier` and
     a `StorageTexture` write actually executes. Verified present in the API as
     of three 0.186.0, so this confirms behaviour rather than existence; if it
     regresses, the contingency is raw WGSL via `wgslFn` on the same device.
2. Repo scaffold: TypeScript strict, vitest, architecture boundary test,
   `.gitignore`, and a `LICENSE` — the repo is public, so absent a license the
   code is all-rights-reserved, which contradicts §10 entirely.
3. `sim/` flight model with flight test cards for the F6F, headless only
4. Minimal renderer: flat water, one aircraft, camera-relative from the start
5. Terrain pipeline and CDLOD
6. FFT ocean
7. Weapons, damage, AI
8. Carrier and airfield operations
9. Meta-game, persistence, menus

### The numbered plans — authoritative

**This table is the only authoritative statement of plan numbering.** Other
design documents point at it; none of them restate it.

It exists because for two days three documents disagreed. Input assists were
inserted as Plan 3, taking the slot the ordering above had given terrain, and
every later number shifted without anything being updated: the renderer design
still called terrain Plan 3 and the ocean Plan 4, the terrain design called the
ocean Plan 6 and deck operations Plan 8, and the assists design reserved Plan 5
for combat. Those were not three transcription errors — they encoded two
different answers to "what comes after terrain", and nobody had taken that
decision. Mark took it on 2026-09-15.

Note that the list above is a *minimum honest ordering*, written before any
plan existed, and the assists work has no entry in it. The table is what the
plans are actually numbered.

A plan number is an **identity, not a position**. Numbers 1-9 were handed out
in the order anyone then expected to build them, and on 2026-09-16 Mark changed
that order: the ground under the airplane, and getting off and back onto it,
come before there is anybody to shoot at. Nothing was renumbered, because the
paragraphs above are what renumbering costs. Read the **Order** column for what
happens next, and the **Plan** column for what a document means when it says
"Plan 6".

| Plan | Order | Subject | Sections | Status |
| --- | --- | --- | --- | --- |
| 1 | 1 | Scaffold and flight model | §5, §11 | Complete |
| 2 | 2 | Renderer and flight controls | §3, §4 | Complete |
| 3 | 3 | Input assists | §5 | Complete |
| 4 | 4 | Terrain and level of detail | §4 | Complete |
| 5 | 5 | Ocean | §4 | Complete |
| 6a | 6 | Cockpit panel | §4 | Complete; [original handoff](../../handoff/2026-09-15-cockpit-panel.md), [cockpit/follow-view feedback](../../handoff/2026-09-15-cockpit-feedback.md) |
| 10 | 7 | Ground and water contact, and crash response | §4, §5 | Complete; [handoff](../../handoff/2026-09-16-plan10-contact.md) |
| 11a | 8 | Ground handling, gear and take-off; the runway to do it from | §4, §5 | Complete, except Tier 2 has not been run; [handoff](../../handoff/2026-09-16-plan11a-ground-handling.md) |
| 11b | 9 | Flaps, approach and landing ashore | §5 | Complete; [handoff](../../handoff/2026-09-17-plan11b-landing.md) |
| 12 | 10 | Entities, ships and airfields | §4 | Complete 2026-09-18; [handoff](../../handoff/2026-09-18-plan12-entities.md) |
| 14 | 11 — next | Mission map | §4, §8 | Not started |
| 8 | 12 | Carrier and airfield operations | §4, §8 | Not started |
| 6 | 13 | Combat and damage | §6 | Not started |
| 7 | 14 | AI | §7 | Not started |
| 9 | 15 | Meta-game | §8 | Not started |
| 13 | any | Terrain surface detail | §4 | First pass landed 2026-09-17 in daa1b39 without a spec or plan (Codex, [handoff](../../handoff/2026-09-18-scenery.md)); split into 13a-13d the same day |
| 13a | any | Harden and verify the first pass (Tier 2, GPU budget, quality tiering, tree streaming) | §4 | Complete 2026-09-17, bounded work, no plan document; [handoff](../../handoff/2026-09-17-plan13a-hardening.md) |
| 13b | any | Land cover from ESA WorldCover as the material and vegetation guide | §4 | Complete 2026-09-18; [handoff](../../handoff/2026-09-18-plan13b-land-cover.md) |
| 13c | any | Coastline and beaches | §4 | **Abandoned as designed 2026-09-18**, and the problem it existed for is SOLVED by other means: the blocky coast was L4's 391 m grid, not the DEM, so shipping L2 at 98 m fixed it (`eef5b4d`, confirmed by eye). Moving the shoreline at 24 m and letting `buildPyramid` carry it down cannot work — `halve` is a [1,2,1] tent filter and does not preserve a binary land/sea boundary; measured net -203 land cells at L4, with before/after frames indistinguishable. Reshaping per level is worse (-6.6% land at L4, -88.9% at L12). `tools/landcover/sea.ts` and `tools/terrain/coast.ts` remain committed, reviewed and UNWIRED. |
| 15 | any | Audio: engine loop and event cues | — | Complete 2026-09-18; [handoff](../../handoff/2026-09-18-plan15-audio.md) |
| 13d | any | Dulag, villages and roads from OpenStreetMap | §4 | Not started; [design](2026-09-18-land-cover-design.md) 2026-09-18 |

Plan 10 is first because nothing acts on a crash today: `advance` records an
`Impact` and deliberately stops there, and the sea is a picture rather than a
surface, so the airplane presently flies through both (`src/sim/loop.ts`).
Landing, ditching, damage and strafing all read that outcome.

Three couplings decide the rest of the order, and they are the whole argument
for it:

1. **Flight-model changes precede anything tuned against the flight model.**
   Plan 11 adds gear, flaps, rolling friction and ground effect, which the
   aircraft spec records as absent today (`src/sim/flight/schema.ts`, the
   comment on `takeoffDistanceM`). Gunnery, energy tactics and AI are all
   tuned against how the airplane flies, so building them first buys a
   re-tune and a fresh golden trajectory.
2. **The single-entity `World` has three consumers, not one.** Enemy
   aircraft, projectiles and a sailing carrier all need it. `World.controls`
   in `src/sim/loop.ts` currently assigns that generalisation to the combat
   plan; Plan 12 takes it instead, because a shape derived from airplanes
   alone would have to be bent afterwards to carry a moving deck, which is a
   reference frame rather than another airplane.
3. **A fixed runway precedes a moving deck.** Plan 11 settles flare,
   touchdown, roll-out and brakes against something that is not itself
   moving, so that a landing defect in Plan 8 has one candidate cause and not
   two.

**Plan 11 owns its own runway** (amended 2026-09-16, after Mark asked why
landing waits for Plan 11 at all). As first written, Plan 11 landed "ashore"
at order 8 while airfields sat in Plan 12 at order 9 — there was nowhere to
land. A static prepared strip is not an entity: it does not move, carries no
AI and needs nothing the entity system provides, so it has no business waiting
on the plan that builds those. Plan 11 therefore lands one minimal runway on
real ground, and Plan 12 keeps the full airfield content and the moving ships.
Tacloban and Dulag were both real October 1944 Leyte airfields, and Tacloban
is already in this repo at world **(-29666, -47605)** — sourced independently of
the terrain pipeline and cross-checked against the Copernicus tiles on
2026-09-14, carried by `tests/tools/terrainBuild.test.ts` and used by
`tests/e2e/terrain.spec.ts`. **Plan 11 must take the coordinate from there, not
re-derive it**: an equirectangular back-of-envelope lands about 80 m away, and
two nearly-equal coordinates for one airfield is precisely the drift this
document exists to prevent. So the strip can sit where one historically did
rather than somewhere invented.

**Amended 2026-09-17, after `29f5319` made the world right-handed.** This said
**(-29666, 47605)**. That commit ("Fix geographic handedness and align compass
with north", [handoff](../../handoff/2026-09-17-map-compass.md)) redefined world
coordinates as +x east, +y up, **+z south** — north is -z — so the z sign
flipped and nothing else moved. The world value is now carried by
`DEFAULT_SPAWN_POSITION` in `src/render/spawn.ts` and asserted by
`tests/render/spawn.test.ts` and `tests/e2e/terrain.spec.ts`;
`tests/tools/terrainBuild.test.ts` holds the geographic point it was projected
from (11.228 N 125.028 E), not the world metres (verified 2026-09-17 by reading
those four files). Plans and handoffs dated before 2026-09-17 that quote a
z of +47605 are records of the old frame, not errors to chase.

**Plan 11 was split in two on 2026-09-16**, following Plan 6a's precedent, when
its scope was read out in full: gear, flaps, ground physics, brakes, steering, a
runway, take-off, landing and the touchdown-severity extension are several
subsystems, not one. **11a gets the airplane off the ground; 11b gets it back
on.** 11a is independently flyable and has an unusually good acceptance test
waiting for it — `measureTakeoffRun` in `tools/testcards/measure.ts` currently
FAKES the ground, pinning `position.y` and `velocity.y` to zero after every step
because the model has none, so 11a can delete that fake and let the graded
historical take-off card measure real ground physics.

**Plans 10 and 11 are a pair, delivered back to back.** Plan 10 ends a flight;
Plan 11 is what lets one continue. Between them the game can kill you and let
you ditch, but not let you land and go again. That trough is accepted
deliberately rather than closed by merging the two: a crash is a state
transition and pure, while landing is a second physics regime — contact forces
in `step`, terrain in `SimContext`, `assertNoEnergyGain` taught about contact,
and the graded test cards revisited. Merged they would be one plan of 25-plus
tasks, where a ground-reaction problem blocks a DOM dialog and the reverse;
every completed plan here has run 6 to 15.

Plan 14, the mission map, is deferred to here rather than built early
(2026-09-16, Mark's suggestion and my recommendation to wait). Its entire
substance is the points of interest — friendly base, carrier, enemy base,
primary target — and five of the six entries in the 1991 original's map legend
are entities. Built before Plan 12 it would show terrain, the player's own
airplane, and a legend of things that do not exist, and the half that makes it
useful (click a target, get a course line and a heading) *is* the entity logic.
It does share a mechanism with Plan 10's debrief — a modal over a frozen
simulation — which is why Plan 10's design puts the freeze in the frame rather
than inside the debrief.

Plan 13 is render-only — beach and jungle surfacing, vegetation — and nothing
in `sim/` reads it, so it can land whenever. Alongside Plan 11 is the natural
moment: surface texture is how a pilot judges height in the flare.
**Amended 2026-09-17.** A first pass landed that day in `daa1b39` — procedural
materials, streamed trees, Tacloban base buildings and two OSM rivers, still
render-only — with no spec or plan document; the
[scenery handoff](../../handoff/2026-09-18-scenery.md) is its only record.
Mark chose the same day to split the remainder into 13a-13d (table above):
13a is bounded hardening of what landed and gets no plan document; 13b-13d
share one design document, which is authoritative for them once it exists.

Deploying the game to a public URL (2026-09-15) is infrastructure and takes no
plan number.
