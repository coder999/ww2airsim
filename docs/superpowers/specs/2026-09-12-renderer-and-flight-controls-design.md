# Plan 2 — Renderer and flight controls: design

Plan 2 of 7. Companion to `2026-09-12-ww2airsim-design.md`, which remains the
binding authority; where this document and that one disagree, that one wins and
this one is wrong.

**Status: design approved 2026-09-12, no implementation yet.** Amended 2026-09-12 after the plan's pre-execution review; each amendment is marked inline and dated.

## 1. What this is

The first thing you can fly. An F6F Hellcat over flat water, rendered at 60 Hz
from the deterministic flight model Plan 1 built, controlled from the keyboard,
viewed from a chase camera or the cockpit.

The master spec's §15 calls this step 4: *"Minimal renderer: flat water, one
aircraft, camera-relative from the start."* Three things were added to that
during design and are called out where they appear: procedural water detail
(§5), a camera mode system (§6), and cockpit instruments (§7).

### Why it exists

Plan 1 validated the flight model against cited trial figures and never once
flew it. Every number agrees with a 1944 Patuxent River report; nobody knows
whether it *feels* like an aeroplane. That is the question this plan answers,
and it is why the deliverable is flyable rather than a watch-only demo.

### Non-goals

Deferred deliberately, each to a named later plan:

| Deferred | Where it belongs |
| --- | --- |
| Terrain, CDLOD, real geography | Plan 3 |
| FFT ocean, Beaufort wind, foam | Plan 4 |
| Atmospheric scattering LUTs, volumetric cloud | later; §5 ships a gradient sky |
| Weapons, damage, AI | Plan 5 |
| Carrier and airfield operations | Plan 6 |
| Cockpit interior geometry beyond the panel | later |
| Padlock and external orbit cameras | later |
| Continuous mouse-look | later — see §6 (deferred 2026-09-12) |
| Input assists (rate damping, auto-rudder, stall limiter, combat trim) | later — see §4 |
| Screenshot goldens | later — see §8 |
| Sim on a worker thread | Plan 5 — see §9 |

## 2. Spike findings, 2026-09-12

Run on the reference platform (Windows, RX 6700 XT, Chrome 152) via the SSH
tunnel. These are measured, not assumed, and two of them change what gets built.

| Question | Answer |
| --- | --- |
| Secure context over the §2 SSH tunnel | Yes — `isSecureContext: true` at `http://localhost:5173` |
| `navigator.gpu` | Present |
| Adapter | `vendor: "amd"`, `architecture: "rdna-2"`, `isFallbackAdapter: false` |
| three on a WebGPU backend | Yes — `WebGPUBackend`, not a silent WebGL fallback |
| Raw WGSL `workgroupBarrier` compute | Works; reduction returned the correct 2016 |
| TSL `workgroupArray` + `workgroupBarrier` | Inconclusive — the probe had a bug (see below) |

**Two corrections came out of this.**

**The master spec's Tier 2 adapter guard cannot be implemented as written.**
§11 says the guard asserts that "`adapter.info` vendor/device identify the
RX 6700 XT". Measured, Chrome returns `device: ""` and `description: ""` — it
reports deliberately coarse adapter identifiers. Vendor plus architecture is the
real ceiling. The guard is therefore:

```ts
vendor === 'amd' && architecture === 'rdna-2' && isFallbackAdapter === false
```

which still discharges the guard's actual purpose — ruling out a software
rasterizer whose frame times and screenshots would be worthless.

**The TSL result is unsettled and it was our bug, not three's.** The probe
passed `storageBufferNode.toAttribute()` to `renderer.getArrayBufferAsync()`,
which wants the `StorageInstancedBufferAttribute` at `.value`; `toAttribute()`
returns a `BufferAttributeNode` for feeding geometry. Hence
`TypeError: Cannot read properties of undefined (reading 'size')`. Fixed in the
probe, not yet re-run. Since raw WGSL compute demonstrably works on this GPU,
**no part of this plan is blocked either way** — TSL versus `wgslFn` is a
question for Plan 4's ocean, not for anything here.

### Second platform, 2026-09-13 — Surface (Snapdragon, Adreno 7xx, Chrome 152)

Mark ran the **fixed** probe (commit 3f6ee0b, its first run on any machine) on
an ARM Windows Surface over the same SSH tunnel. Not the reference platform,
and not a substitute for it — but it settles one question and reopens another.

| Question | Answer |
| --- | --- |
| Secure context over the tunnel | Yes — `isSecureContext: true` at `http://localhost:5173` |
| `navigator.gpu` | Present |
| Adapter | `vendor: "qualcomm"`, `architecture: "adreno-7xx"`, `device: ""`, `isFallbackAdapter: false` |
| three on a WebGPU backend | Yes — `WebGPUBackend` |
| Raw WGSL `workgroupBarrier` compute | Works |
| TSL `workgroupArray` + `workgroupBarrier` | **Fails**, `TypeError: Cannot read properties of undefined (reading 'size')` |
| Adapter guard verdict | `warn` — "unrecognised adapter", `haystack="qualcomm adreno-7xx"` |

**The empty `device`/`description` finding generalises.** Chrome reports coarse
adapter identifiers on a completely different vendor and architecture too, so
the vendor-plus-architecture ceiling above is a property of Chrome, not of the
AMD driver. The guard's shape is right.

**The TSL diagnosis above is not supported, and this section says so rather
than being quietly left to stand.** The 2026-09-12 entry concluded the
`TypeError` "was our bug, not three's", from passing `toAttribute()` where
`.value` was wanted. That fix is in the probe (`spike/webgpu-day0/probe.ts`,
the `.value` cast and the comment above it) and the fixed probe throws the
**identical** error on this machine. So one of three things is true and none of
them is "fixed": the fix was incomplete, the same message is now coming from
somewhere else, or three's TSL compute path genuinely does not work here. It
has still never been run on the reference GPU. Open item 1 is reopened
accordingly.

Not blocking anything, for the same reason as before: raw WGSL compute works on
both machines, so the contingency holds on two GPUs from different vendors,
which is a stronger result than the plan had yesterday.

**Tier 2 cannot run here, by design.** The adapter guard returns `warn`, and
Ruling R17 makes warn fatal — the reviewer considered loosening it and would
not, because a false negative silently corrupts every frame-time number
downstream while a false positive fails loudly on one machine. Adding
`adreno` to the allowlist would be loosening it for a machine that is not the
reference platform, so the Surface is a probe host, not a Tier 2 runner.

## 3. The sim↔render seam

The load-bearing decision of this plan, and the one later plans inherit.

A fixed 60 Hz simulation and a variable-rate renderer have to meet somewhere.
`src/sim/loop.ts` owns that meeting, and nothing else in the codebase decides
when a step happens.

```ts
export interface SimContext {
  readonly dt: number
  readonly tick: number
}

/**
 * Everything the simulation owns. One aircraft in Plan 2; later plans add
 * fields here rather than adding parameters to `advance`.
 */
export interface World {
  /** Added 2026-09-12 (plan review): the coefficient set lives here, not as a
   *  parameter of `advance`, for exactly the reason the comment above gives. */
  readonly spec: AircraftSpec
  readonly aircraft: AircraftState
  /** The tick before `aircraft`, for interpolation. Equal to it on tick 0. */
  readonly previous: AircraftState
  /** Added 2026-09-13 (whole-branch review, I-5): the commanded controls live
   *  here for the same reason `spec` does. They were an `advance` parameter
   *  through Plan 2's fifteen tasks — the last counterexample to the rule
   *  above, and the one Plan 5's N-entity AI would have hit. */
  readonly controls: Controls
  readonly accumulatorSeconds: number
}

export interface AdvanceResult {
  readonly world: World
  /** Whole 60 Hz steps actually run this call, 0..MAX_STEPS_PER_FRAME. */
  readonly stepsRun: number
  /** Steps owed but discarded to break a spiral. Non-zero invalidates replay. */
  readonly droppedSteps: number
  /** Remainder as a 0..1 fraction of a step: the renderer's interpolation factor. */
  readonly alpha: number
}

export function advance(
  world: World,
  controls: Controls,
  elapsedSeconds: number,
): AdvanceResult
```

`advance` is pure: it takes a `World` and returns a new one, accumulating real
elapsed time, running whole 60 Hz steps, and keeping the remainder. The renderer
interpolates between `result.world.previous` and `result.world.aircraft` by
`result.alpha` — `lerp` on position, `slerp` on attitude.

Authoritative state lives only in `sim/`; the renderer holds `readonly`
snapshots it did not create and never writes back.

### Two decisions Plan 1 deferred, settled here

**`step()` takes a context object rather than growing a parameter.** Plan 1's
whole-branch review named `step(spec, state, controls, dt)` the highest-risk
structural decision on the branch: every following plan needs something absent
from that signature — a terrain height query, deck contact, a threaded RNG, the
wind vector — and each addition touches every call site and risks invalidating
the golden trajectory.

**`SimContext` ships with `dt` and `tick` only.** This refines what was
originally proposed (`{ dt, tick, wind?, terrain?, rng? }`). The same review
praised Plan 1 for not carrying unused things, and flagged `speedOfSoundAt` as
an export with no consumer. Speculative fields would repeat that. The win is the
*shape*: Plans 3–7 add fields to one interface instead of parameters to every
signature. YAGNI and the migration argument only looked opposed.

**`AircraftState` gains `tick: number`.** The master spec §3 requires the
renderer to interpolate between the two most recent ticks and nothing currently
records which tick a state belongs to. It also makes a stale-snapshot bug
detectable instead of silent.

### The spiral of death, and why it is visible

If a frame runs longer than the steps it owes, the next frame owes more, and the
game locks up. The standard fix is a per-frame step cap — here, five.

The cost is that capped time never gets simulated. That quietly breaks the
master spec §3 guarantee that a replay is `(seed, input log)`, because a replay
runs every step while the live session skipped some. So the cap is **counted**:
`droppedSteps` is part of `AdvanceResult`, surfaced in the dev overlay, and a
replay can assert it was zero. The determinism guarantee becomes explicit and
checkable rather than quietly false under load.

## 4. Input

`src/input/` maps keyboard and mouse to the same `Controls` value the AI will
emit — the master spec §3's "the AI is a pilot, not a puppet" applied from the
first commit. It never touches `sim/` internals.

**Frame order**, which is the part that is easy to get subtly wrong:

1. Sample input → one `Controls` value
2. `advance(world, controls, elapsed)` runs 0–5 fixed steps, all using it
3. Render interpolates `prev`/`curr` by `alpha`

Input is sampled per *frame*, not per step. A long frame running six steps
applies the same stick position to all six, which is correct: that is what the
stick was doing during that interval.

**Keyboard ramping is the decision that shapes feel.** A key is binary; a stick
is analog. Mapping held-to-±1 gives bang-bang control that would make a model
validated against real trial data feel like a toy. Held keys ramp toward full
deflection over a time constant and spring back to centre on release. That
constant is a named, documented value — expect to tune it once the thing flies.

**Assists are deferred.** Rate damping, auto-rudder, stall limiter and combat
trim all calibrate against how the raw model behaves, and nobody has felt it
yet. Building them now would be guesswork dressed as a feature.

Bindings live in one table so they are trivially rebindable: arrows or WASD for
pitch and roll, Q/E rudder, Shift and Z (or `=`/`-`) for throttle. *Not* Ctrl,
which this document first named: Ctrl+W closes the tab in Chrome and
`preventDefault` cannot stop it, so on WASD "nose down while throttling back"
would quit the game (amended 2026-09-12).

## 5. The render layer

`src/render/`, Three.js `WebGPURenderer`. Reads interpolated state, writes
nothing back.

**Camera-relative from the first commit.** The world translates each frame so
the camera sits at the origin. With one aircraft over flat water float32 jitter
will not show — this is built now because the master spec §4 is explicit that
retrofitting it once terrain exists means touching every position in the
renderer.

**Procedural water detail — an addition to "flat water", and the reason for
it.** A uniform plane gives no motion parallax. At 170 m/s over featureless
water you cannot perceive speed, altitude or sink rate, and "how does the model
feel" would go unanswered — which is this plan's entire purpose. So the water
carries a cheap repeating normal/noise pattern: no FFT, no simulation, purely so
motion is visible. A handful of static markers at known spacing give absolute
scale and make altitude judgeable.

**Gradient sky with a clean horizon.** Not the scattering LUTs — those are a
later plan. But attitude is judged against a horizon, so this is not optional.

**The aircraft is built in code**: a low-poly F6F silhouette — fuselage, wings,
tail, spinner — with a prop disc whose rotation tracks throttle. That confirms
throttle reaches the frame state, not that it reaches the simulation (amended
2026-09-13; Task 13 review measured a case where the prop kept spinning while
`advance` received `NEUTRAL` regardless — the visual and the physics can
diverge). Per the master spec §10, building deliberately simple models is one
of the two permitted routes, and it carries no license exposure and no
`ASSETS.md` row.

## 6. Cameras

One interface, several modes, each mapping sim state to an eye transform.

- **Chase** — behind and above; position and heading followed, **roll
  discarded** — the eye attitude is rebuilt from heading and pitch alone, so
  there is nothing to damp and no time constant to tune (amended 2026-09-12;
  this first said "damped"). Plan 1's own golden trajectory is four continuous
  barrel rolls; a camera welded to the roll axis through that is nauseating, and
  the flight model would get the blame for a camera problem.
- **First-person** — eye rigidly attached to the airframe at a named eye point.
  Attitude tracked exactly, **no damping**: from the cockpit, the horizon
  rotating with you is the point.
- **Look-around** — not a mode but an *offset* layered on the active one, a
  yaw/pitch rotation in body frame. This is the structural choice that matters:
  it means look-around behaves identically from the cockpit and from chase, and
  snap views are presets of the same offset rather than separate code.

Numpad as hat-switch emulation — 8/2/4/6 for up/down/left/right, 5 to centre, 0
for rearward — springing back to centre on release, plus a key to cycle modes.
Continuous mouse-look is **deferred** to a later plan (2026-09-12): pointer lock
and a sensitivity constant are two more untuned guesses, and the hat answers
this plan's question, which is whether you can check your six.

**Eye point is per-aircraft content.** `view: { eyePointM: [x, y, z] }` in
`f6f-hellcat.json`, declared in the schema — Plan 1 made content validation
`.strict()`, so an undeclared key now fails loudly rather than being silently
dropped, and adding one is a deliberate act.

A noted smell, recorded rather than resolved: that schema lives in
`sim/flight/schema.ts`, so the simulation's content schema now carries a field
only the renderer reads. It does not breach the boundary — `sim/` never reads it
— and a separate view-content file for one aircraft would be over-engineering.
Revisit when a second category of render-only content appears.

## 7. Cockpit instruments

**3D geometry, not a screen-space overlay.** A 2D HUD would stay pinned to the
viewport while the cockpit swung past behind it during look-around, which defeats
the point of instruments being *in* the cockpit. A low-poly panel with needles as
meshes rotating about their own axes gets correct parallax and occlusion for
free, because they are really there.

**Legibility beats period authenticity.** Gauge *appearance* is free to be
inauthentic: oversized, high-contrast, clearly labelled, with digital readouts
alongside needles where that helps. Authentic 1944 markings that cannot be read
at a realistic eye point would be faithful and useless.

**Gauge data, however, must be real.** This project treats a comment asserting
something false as a defect on par with a bug; a gauge is a far more prominent
assertion than a comment, rendered at 60 fps. So instruments are fitted only
where Plan 1's model actually produces the quantity:

| Fitted | Source |
| --- | --- |
| Airspeed | `airspeed(state)` |
| Altimeter | `position.y` |
| Vertical speed | `velocity.y` — likely the most informative gauge for judging feel |
| Attitude indicator | attitude quaternion |
| Heading | yaw from the same quaternion |
| Fuel | `fuelKg`, which the model genuinely burns |
| Slip/skid | sideslip from velocity against body axes |

**Not fitted**, because the flight model has no such quantity: tachometer,
manifold pressure, oil temperature, cylinder-head temperature. An empty
instrument hole is honest; a needle driven by `throttle * 2700` is a lie
rendered continuously. Each goes in when a later plan models the quantity behind
it.

## 8. Testing

The structural move that decides whether a human is in the loop: **the
renderer's logic is pure and separate from its drawing.**

```ts
cameraTransformFor(mode, prev, curr, alpha, lookOffset) → { position, quaternion }
needleAngleFor(gauge, state) → radians
controlsFromKeys(pressed, dt, previous) → Controls
```

None of those need a GPU, so most of this plan is **Tier 1 testable on nexus** —
including the things most likely to be subtly wrong: quaternion double-cover in
interpolation, chase-camera stability through a sustained roll, symmetry of
input ramping, `droppedSteps` accounting under a stalled frame. Had camera maths
been written inside Three objects instead, every one of those would have become
GPU-only and therefore a human's job.

**Tier 2 ships minimal, and only what needs no human judgement:**

- The adapter guard of §2, asserted on every run
- Zero WebGPU validation errors across a scripted camera sweep, via
  `pushErrorScope` and `onuncapturederror`

**Screenshot goldens are deliberately excluded.** They are the expensive half to
maintain, and at a stage where the picture changes with every commit they would
generate constant diffs that mean nothing. The two checks above catch the
silent-corruption failures — a software rasterizer, or a renderer quietly
emitting validation errors — which are exactly the ones a human would never
notice.

**Tier 3 is you, once**, answering a question no assertion can: does it feel
like an aeroplane.

## 9. Failure modes

**Never a blank canvas.** The day-0 spike taught this expensively: a page that
fails silently costs a full round trip to diagnose, and the loop to the
reference platform is long. Every failure has a visible, explanatory state —
WebGPU absent, adapter is a software fallback, device lost, content failed
validation.

**The adapter guard has different teeth in different places.** In the app it is
a visible warning and the thing still runs, so a laptop is not bricked. In the
Tier 2 harness it is a hard assertion, because that is where a silent fallback
would corrupt frame budgets and goldens.

**`device.lost` is handled.** Windows TDR resets the driver after a GPU hang,
and a long compute pass in a later plan is exactly what trips it. A few lines
now; a random unexplained freeze later.

**`stepChecked` in development, `step` in production.** Plan 1 built finiteness
and airmass-energy invariants and its soak runs everything through them. In the
browser those assertions cost per step — but they turn "the aircraft teleported"
into "a NaN entered at tick 4,102." One build flag.

**`droppedSteps`, frame time and sim/render rates go in a dev overlay**, so a
spiral is visible while it happens rather than inferred afterwards.

**The sim stays on the main thread**, deliberately. At the ~830 ns/step measured
in Plan 1, one aircraft is about 0.005% of a frame; a worker would be ceremony.
It stays cheap to move later precisely because `step` is pure and takes a
context object — a worker boundary becomes a message-passing change rather than
a rewrite. Plan 5 is the plan that should revisit it.

## 10. Open items

1. **TSL versus raw WGSL** — unsettled, and deliberately not blocking. Updated
   2026-09-13: the fixed probe HAS now been run, on the Surface, and throws the
   identical `TypeError` the fix was supposed to remove (see the second-platform
   section above). It has still never been run on the reference GPU. Raw WGSL
   compute now works on two GPUs from different vendors, so the contingency is
   better proven than the TSL path is broken; this only matters to Plan 4's
   ocean.
2. **Keyboard ramp time constant** — a named value, expected to change once the
   aeroplane has been flown.
3. **Eye point** — needs a plausible value for the F6F; no primary source is
   required for a number that exists to make a camera sit somewhere sensible.
4. **Gauge legibility at 1440p** — the first thing to check in Tier 3, and the
   reason appearance authenticity was traded away up front.
5. **Control ramping runs at frame rate, so replay is not frame-rate
   independent** — added 2026-09-13 (whole-branch review, I-4; Ruling R18
   settled the documentation half only). `nextFrameState` ramps the controls
   against the animation-frame delta, outside the fixed step, so 60 Hz and
   144 Hz replaying the same key log diverge even with `droppedSteps` zero
   throughout. Master spec §3's replay guarantee therefore does not hold today,
   and `droppedSteps === 0` does not imply it does.

   Not fixed here on purpose: moving the ramp inside the fixed step changes how
   the controls feel, and **nobody has flown this yet**. Deciding it before the
   reference-platform trip is the same guessing the no-tuning rule exists to
   prevent. Note that it gets harder every plan, and no plan uses replay yet, so
   the cost of waiting is currently zero and the cost of guessing is not.
