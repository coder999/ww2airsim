# Plan 2 — Renderer and flight controls: design

Plan 2 of 7. Companion to `2026-09-12-ww2airsim-design.md`, which remains the
binding authority; where this document and that one disagree, that one wins and
this one is wrong.

**Status: implemented. All 15 tasks committed on `worktree-plan2-renderer` as of 2026-09-13; 341 tests in 30 files green, `npm run build` produces a bootable artifact. Four steps remain, all needing the reference platform — see the plan's 2026-09-13 revision.** Amended 2026-09-12 after the plan's pre-execution review; each amendment is marked inline and dated.

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

Deferred deliberately, each to a named later plan. **The plan numbers below
were corrected on 2026-09-15 and are no longer restated here**: this table
names the subject, and the master spec's §15 numbering table says which plan
each subject is. When this document was written, input assists did not exist;
they were later inserted as Plan 3, shifting every number in the original
version of this table by one and leaving it silently wrong for two days.

| Deferred | Where it belongs |
| --- | --- |
| Terrain, CDLOD, real geography | Terrain — master spec §15 |
| FFT ocean, Beaufort wind, foam | Ocean — master spec §15 |
| Atmospheric scattering LUTs, volumetric cloud | later; §5 ships a gradient sky |
| Weapons, damage, AI | Combat, then AI — master spec §15 |
| Carrier and airfield operations | Deck operations — master spec §15 |
| Cockpit interior geometry beyond the panel | later |
| Padlock and external orbit cameras | later |
| Continuous mouse-look | later — see §6 (deferred 2026-09-12) |
| Input assists (rate damping, auto-rudder, stall limiter, combat trim) | **Built** — shipped as Plan 3, 2026-09-13; see `2026-09-13-assists-design.md` |
| Screenshot goldens | later — see §8 |
| Sim on a worker thread | Combat, when many aeroplanes make it pay — master spec §15; see §9 |

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

**The TSL result is unsettled. This section originally concluded it was our bug, not three's; that no longer stands — see the 2026-09-13 second-platform section below, which re-ran the fixed probe and got the identical error.** The probe
passed `storageBufferNode.toAttribute()` to `renderer.getArrayBufferAsync()`,
which wants the `StorageInstancedBufferAttribute` at `.value`; `toAttribute()`
returns a `BufferAttributeNode` for feeding geometry. Hence
`TypeError: Cannot read properties of undefined (reading 'size')`. Fixed in the
probe. Re-run 2026-09-13 on a Surface: it threw the identical error, so this
diagnosis is not supported -- see the second-platform section above. Since raw
WGSL compute demonstrably works on this GPU,
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
2. `advance(world, elapsedSeconds, stepper?)` runs 0–5 fixed steps, all using it — the controls ride in `World`, see the I-5 amendment above
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
cameraTransformFor(mode, spec, render, look) → EyeTransform   // corrected 2026-09-13
needleAngleFor(id, spec, state) → radians                     // corrected 2026-09-13
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

6. **RESOLVED 2026-09-13 — no directional stability.** The fin now swings
   the nose into the wind; see `rates.weathercockSeconds` and
   `tests/sim/flight/weathercock.test.ts`. Kept in the list rather than
   deleted because items 8 and 9 both descend from it and would read as
   orphans otherwise.

7. **`spike/webgpu-day0/probe.ts` is neither typechecked nor linted by
   `npm run verify`, and it does not compile** — found 2026-09-13. `tsconfig`'s
   `include` lists `src`, `tests`, `tools` and root `*.ts`, so `tsc --listFiles`
   emits nothing under `spike/`. Adding it produces real errors: eight or more
   in the TSL compute block alone, mostly `Cannot invoke an object which is
   possibly 'undefined'` around `workgroupArray` and `instanceIndex`.

   `npm run lint` now covers `spike` and passes. Typechecking does not, and
   forcing it would turn the pipeline red on throwaway code, so it stays out
   until someone fixes the probe's types.

   This matters more than a lint gap normally would, because open item 1 now
   turns on this file's correctness: the fixed probe threw the identical error
   on a second GPU, and "the fix was incomplete" is the hypothesis with the
   least evidence against it precisely because nothing checks this file. The
   probe also wraps its whole compute block in one `catch`, so the error is
   not localised to the call that was fixed and no stack was recorded.

8. **RETRACTED 2026-09-13 — `angleOfAttack` does NOT leave the lateral
   component in its denominator.** This item claimed alpha was over-reported by
   1/cos(sideslip) and should instead be measured with the lateral component
   projected out of the velocity first. The prescribed fix is algebraically
   inert: the code already computes the in-plane angle.

   Derivation. Write the velocity in the body basis, which `qRotate` keeps
   orthogonal at any attitude: `v = u*forward + n*up + s*right`. Projecting the
   lateral component out gives `vSym = v - s*right`, and because `right` is
   orthogonal to both of the other two axes, `dot(vSym, forward) = u` and
   `dot(vSym, up) = n` — the two quantities `atan2(-n, u)` is built from are
   unchanged. Measured 2026-09-13 over 20,000 random attitude/velocity pairs:
   the largest disagreement between the shipped function and the explicitly
   projected form is 1.2e-14 rad, i.e. the rounding cost of the subtraction.
   `tests/sim/flight/angleOfAttack.test.ts` asserts this on a 360-case attitude
   grid rather than leaving it as this paragraph, and the same file pins the
   discriminating case: adding a lateral velocity component at a fixed attitude
   does not move alpha at all.

   What the item saw is real and is not an artefact. Yaw the nose off a fixed
   flight path and alpha grows as `tan(alpha) = tan(alpha_0)/cos(yaw)` — the two
   percentages above are correct (measured: 4.772738, 4.940283 and 6.410367
   degrees at 0, 15 and 42 degrees of yaw offset). That is what angle of attack
   *means*: crabbing cuts the chordwise component of the flow while leaving the
   component normal to the wing alone, so the chord meets the air at a bigger
   angle. Reading that as a bug is what produced this item.

   Consequences of the retraction: Plan 3 Task 3 changed no flight-model
   behaviour, the golden did not move (regenerated 2026-09-13, byte-identical),
   and the soak's stall figures did not move either. The claim was also copied
   into `tests/sim/soak.test.ts`'s baseline comment, which is corrected in the
   same commit. Item 6's note that items 8 and 9 descend from it still holds —
   this item's *observation* came from the weathercock work; only its diagnosis
   was wrong.

   Left open in a narrower form as item 10, which is what a reader chasing
   "sideslip makes the aeroplane stall early" should read next.

9. **`weathercockSeconds = 1.5` is a guess, and a primary source exists that
   probably contradicts it** — found 2026-09-13, an hour after the constant was
   introduced, by asking whether the physics could be borrowed instead of
   invented.

   NACA Wartime Report L-716, *Flight Measurements of the Flying Qualities of
   an F6F-3 Airplane (BuAer No. 04776) II: Lateral and Directional Stability
   and Control*, Williams and Reeder, February 1945. It is a flight test of
   THIS AIRCRAFT on THIS AXIS. Work of the US Government, public use permitted,
   free PDF at
   https://ntrs.nasa.gov/api/citations/19930092601/downloads/19930092601.pdf
   (NTRS 19930092601, also numbered NACA-MR-L5B13a).

   What it states, quoted from its own conclusions:

   - "The control-free lateral oscillations damped to 1/2 amplitude within two
     cycles but at the higher speeds tested small continuous oscillations
     occurred." Figure 7 plots the period against indicated airspeed.
   - "The maximum sideslip due to use of full aileron deflection (aileron yaw)
     was approximately 18.5 degrees in rolls to the left and 23.5 degrees in
     rolls to the right at approximately 100 miles per hour."
   - "The directional stability, rudder fixed and free, was positive in all
     conditions and speeds tested", but with "a decrease in directional
     stability rudder fixed for small angles of sideslip at high speeds", and
     "the high dihedral effect in conjunction with the low directional
     stability was considered objectionable."

   Two things follow. First, the real F6F had LOW directional stability and
   large adverse yaw, so some of what Mark felt is authentic; what was wrong
   was that our nose did not weathercock AT ALL, not that it was slow.
   Second, half amplitude in two cycles is a much slower envelope than a 1.5 s
   first-order decay, so 1.5 is probably several times too quick.

   Not corrected yet, deliberately. The report measures an oscillatory Dutch
   roll and our model is first-order with no oscillation, so mapping one onto
   the other needs a stated method rather than a fudge, and the period comes
   off a 1945 plot that has to be read by eye. Worth doing properly: it would
   replace a guessed constant with a cited measurement, which is what
   `reference.source` already does for mass, speed and stall.

10. **The force model uses the total airspeed as its dynamic pressure,
    including the part of the flow that runs along the span** — added
    2026-09-13, replacing the retracted item 8 with the thing that is actually
    approximated there; scope and measurements corrected 2026-09-13 by the
    final whole-branch review of Plan 3.

    `step` computes one `q = 0.5*rho*V^2` from the total speed
    (`src/sim/flight/model.ts`, in `step`) and feeds it to BOTH
    `liftN = q * S * Cl(alpha)` and `dragN = q * S * Cd`, on the next line.
    For an unswept wing the section force depends on the flow component normal
    to the span, which is `V*cos(beta)`, so at large sideslip the model
    over-estimates lift by roughly `1/cos^2(beta)`: 7.2% at 15 degrees, 81.1%
    at 42. Alpha itself is right (item 8); it is the dynamic pressure that is
    not.

    **This item is about `q`, not about lift.** It was originally written as
    "lift uses...", and anyone implementing it as written would change the
    lift line and leave drag computed on the old `q` one line below —
    correcting half the force model and leaving the two halves disagreeing
    about what the free stream is, which is worse than either consistent
    choice. Doing it properly needs its own derivation for drag rather than
    the same factor copied across: the independence principle gives the
    section NORMAL force directly, while the wing's parasite and induced drag
    do not both follow it, and the fuselage's drag is not a span-wise
    argument at all.

    **Derived, not measured** — the `1/cos^2` factor comes from the standard
    independence principle for an unswept wing, with no flight-test figure
    behind it.

    How often it matters, re-measured 2026-09-13. The soak harness itself
    (`tools/soak/run.ts`, seed 1337, 200 iterations, 587,040 steps, the
    shipped model with the weathercock on), sampling |beta| every step:
    median 6.8 degrees (1.4% error), mean 11.0 (3.8%), 90th percentile 25.5
    (22.7%), peak 89.6. **18.9% of all steps sit past 15 degrees of sideslip,
    and 5.0% past 42** — i.e. one step in twenty is somewhere the lift term is
    over-estimated by 81% or more. With the weathercock disabled
    (`weathercockSeconds = 1e9`) the same run gives median 23.0, mean 28.0 and
    65.3% of steps past 15 degrees, so item 6 does help a great deal; it does
    not make this small.

    This paragraph used to end "the weathercock term already keeps
    steady-state sideslip small — under soak-like random inputs it took mean
    absolute sideslip from 15.1 to 5.4 degrees, where the error is 0.9%",
    quoting one central statistic and the error at it. The same source
    (`tests/sim/soak.test.ts`'s comment) records a peak of 15.2 degrees from
    that run in the same sentence, where the error is 7.4%, and the omission
    is most of what made the item read as ignorable. Neither of those two
    figures reproduces here: replaying the soak loop step for step gives its
    step count and completion count to the digit (587,040 / 99 with the
    weathercock, 611,160 / 132 without), and a sideslip mean twice the quoted
    one with a peak nearly six times it. Whatever "soak-like" probe produced 5.4 and
    15.2, it was not this harness, and the numbers above are the ones with a
    reproduction recipe attached.

    Still not fixed: it is a flight-model change with no reported symptom
    behind it, and it would move the golden and re-baseline the soak. But the
    measurement that was supposed to justify deferring it does not say what it
    was quoted as saying, so the deferral now rests on cost and risk alone.
