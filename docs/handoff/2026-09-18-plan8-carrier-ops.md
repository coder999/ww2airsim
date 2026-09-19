# Plan 8 handoff — carrier and airfield operations

Plan 8 is complete on `main`, not pushed and not deployed. The design and its
non-goals are in the approved
[carrier operations design](../superpowers/specs/2026-09-18-carrier-ops-design.md);
this handoff records what was measured and decided while building it rather
than repeating that design.

A scenario now carries **weather**, and a steady wind reaches the flight model:
airspeed, angle of attack, thrust, sideslip and the stall are measured against
the air, while everything the wheels do stays in the ground frame. Every
carrier in a scenario derives a **moving flight deck** the ground constraint
treats as a surface with its own velocity, so an airplane can be parked on one,
sail with it, roll off its bow, and be caught by it. `H` drops an arresting
hook; inside the trap zone a hook-down arrival is dragged to a stop at a
constant 17 m/s². The LSO's **paddles** cue reads the approach and prints one
line. `?scenario=deck-quals` starts the whole thing in a dev build.

The interrupted final review fix wave was completed on 2026-09-19; see the
[recovery handoff](2026-09-19-plan8-review-recovery.md) for the fixes and fresh
verification, including the airspeed needle/readout regression.

## Commits

| Commit | Task |
| --- | --- |
| `452c988` | Design |
| `3b26426` | Implementation plan |
| `56ff8b4` | Task 1 — scenario wind coupled into the flight model, bit-identical when calm |
| `dc4dad5` | Task 2 — a moving deck derived from every carrier; the wheels rest at its velocity |
| `e7f0301` | Task 3 — `deck-quals` content, ship-parked spawn, `?scenario=` |
| `ff3bfee` | Task 4 — `H` binds the hook; a hook-down arrival inside the trap zone arrests |
| `56cb04d` | Task 5 — the approach autopilot flies at the moving deck and traps |
| `357afbb` | Task 6 — the paddles cue, a pure function and one line of text |
| `72a2631`, `0bc1ce9` | Task 7 — the deck drawn where the sim puts it; scenario wind picks the sea state |
| this commit | Task 8 — Tier 2 on the reference GPU, this handoff, the roadmap |

## Measurements and acceptance

| Check | Result |
| --- | --- |
| Tier 1 | `npm run verify` exit 0, measured at the closing commit: **106 files, 1,123 passed, 1 skipped** (the one skip is pre-existing and named) |
| Headwind shortens the roll (Task 1) | Ashore, flat, full flaps, to the 38.67 m/s full-flap lift-off airspeed: **190.57 m calm**, **145.36 m** into 5 m/s, **122.90 m** into 7.717 m/s. Lift-off AIRSPEED is identical in all three; only the ground run changes. |
| Chocked on a turning deck (Task 2) | Worst local-frame drift **0.370 m** over 60 s, through a turn to 0.818 rad — above the ~0.2 m that would be pure discretization, so it is real residual lag, and well inside the 1 m gate |
| Carrier landing, autopilot (Task 5) | Touchdown sink **1.40 m/s** at **21.7 m/s over the deck**; at rest **102 m from the stern**, **0.4 m** off the centerline; `landing.at = { kind: 'carrier', name: 'cv-1' }` |
| Ashore landing, unchanged by all of it (Task 5) | Pinned bit-for-bit: `restZ -47670.18981410662`, `touchdownSinkMps 1.3502298286023335`, `touchdownSpeedMps 37.70385233292351` |
| Deck run, measured in Node from the `deck-quals` spot | Spot is **21.35 m from the stern, 241.35 m from the bow** on a 262.7 m deck. Flaps up, full throttle, rotating at 9 s: reaches the 38.67 m/s lift-off airspeed at **5.73 s, 67.4 m up the deck, with 174 m of deck left**; the wheels leave at **10.0 s, 202.3 m up the deck, 39.1 m short of the bow**, at 54.7 m/s of airspeed and 39.3 m/s over the deck. It climbs away and is at 475 m after 40 s. **The spot was not moved**; the brief's fallback (aft to `z: -125`) was not needed. |
| Tier 2, `deckQuals.spec.ts` alone | **3 passed** — parked-and-sailing, the deck run, and `H`. gpu **p95 1.231 ms** over 826 samples |
| Tier 2, whole suite | **35 passed, 1 skipped, 0 failed**, 3.6 min, zero transport failures. deck quals gpu **p95 1.101 ms** over 1,002 samples; entities p50 0.839 / p95 0.915 ms; frame budget gpu p50 1.083 / **p95 1.249 ms** over 598 samples with the rAF interval p95 at 3.700 ms; ocean high total p95 1.088 ms |

**Every GPU number above is on the post-2026-09-18 baseline** — the day
`playwright run-server --unsafe` first let `--disable-gpu-vsync` and
`--disable-frame-rate-limit` reach the browser. They are NOT comparable with
the ~5.2 ms figures in every handoff up to Plan 14, which were measured under
vsync with inert flags (`playwright.config.ts` carries the evidence). The
6.0 ms ceiling stands until someone re-argues it, and everything here is four
to five times inside it.

Both screenshots were read at 1440p before anything here was claimed:

- `deck-quals-parked.png` — the Hellcat sits on the flight deck, nose down the
  angled centerline toward the bow, the island block to starboard, sea to both
  beams. HDG 342°, ALT 63 ft (the 17 m deck plus 2.2 m of gear), THR 0 %, GEAR
  DOWN. `Hook H` is in the controls legend.
- `deck-quals-airborne.png` — off the bow and climbing, THR 100 %, PITCH +17°,
  V/S +1645 ft/min, ALT 103 ft, still on 342°, Leyte on the horizon. The
  chase camera looks forward, so the carrier is behind the airplane and the
  trap band is not in this frame despite the test's name; what the picture
  proves is that the deck run ended in a climb-out over water and not in the
  sea.

## Controls and data contract

- **`H`** toggles `Controls.hookDown` (`src/input/bindings.ts`, listed in the
  controls legend as `Hook H`). It does nothing off a deck. Inside the trap
  zone, with the wheels supported and the sink gate satisfied, it sets
  `AircraftState.arrested` and the deck-relative horizontal velocity decays at
  a constant `TRAP_DECEL_MPS2 = 17` m/s² until the airplane is at rest
  relative to the deck. `arrested` clears the instant the wheels are
  unsupported.
- **`?scenario=deck-quals`** (DEV only, `SCENARIO_PARAM` in
  `src/render/spawn.ts`) selects a scenario at boot. `tests/build/dist.test.ts`
  asserts the parameter name never reaches a production bundle, the same way
  it does for `?spawnX/Y/Z` and `?beaufort=`.
- A ship spec may carry **`flightDeck`** (`lengthM`, `widthM`, `heightM`),
  **`trapZone`** (`fromSternM`, `toSternM`) and **`paddles`** (§7's seven
  numbers). `decksOf(ships)` turns every ship that has a `flightDeck` into a
  `Deck`; `groundUnder(terrain, decks, x, z)` is now the ONE place anything
  asks what is under a point, and it returns the surface, its height and **the
  velocity of that point** — `deck.velocity + ω × r`, not the ship's reference
  velocity (see "decisions" below).
- A scenario carries **`weather: { windFromDeg, windMps }`**, strict, with
  `windMps >= 0`. `windMps: 0` means `World.wind = null` — "no wind specified",
  not force 0 — and the renderer keeps `DEFAULT_BEAUFORT` for it rather than
  flattening the sea. Any non-zero wind picks the nearest Beaufort force;
  `?beaufort=` still overrides both.
- An aircraft's **`parkedAt`** is a union: the airfield form, or
  `{ ship, spot: { x, z } }`. Deck-local `+z` is toward the **bow**, `−z`
  toward the stern, so `deck-quals`' `z: -110` is 110 m aft of the deck's
  center. An off-deck spot, or a spot on a ship with no `flightDeck`, throws
  by name at load.
- **`LandingReport.airfield` is gone**; it is now **`landing.at =
  { kind: 'airfield' | 'carrier', name }`**, and `Touchdown` carries `deck`.
  Plan 9 reads this.
- `paddlesCue(...)` is pure and returns `PaddlesCue | null`; the badge is one
  line of text. Plan 7's AI can call it directly.

## Decisions made while executing

- **`World.wind` was added**, against design §4's "the world does not change":
  `advance` builds every `SimContext` from the world, so the wind has to live
  there. One field to remove if that is wrong.
- **`bearingTo` is `atan2(Δx, −Δz)`**, so the free-flight racetrack's long legs
  bear 162°/342°, not the 018°/198° the design first drafted. The design was
  corrected in place before anything was built on the wrong numbers, and the
  deck-quals wind moved with it to **15 kn from 342°** — into the
  north-westbound leg, which is why the deck has 15.4 m/s of wind over it.
- **Arrest is a constant 17 m/s² deceleration**, not a 2.0 s ramp to zero.
  Algebraically the same 1.7 g / 34 m figure, but it needs no memory of the
  arrival speed.
- **`groundUnder` returns the velocity OF THE QUERIED POINT.** Task 2 shipped
  `Deck.velocity` as the ship's own reference velocity and the chock-on-deck
  test failed for a reason no friction tuning could fix: a spot 110 m from the
  reference point on a ship turning at 1°/s moves at `ω·r = 1.92 m/s` in the
  beam direction, the ground constraint drove the airplane to the wrong target
  every tick, and it walked off the deck edge at t ≈ 8.6 s and then free-fell.
  `Deck` gained `yawRateRadPerS` (from `wrapPi(state.headingRad −
  previous.headingRad) / DT`) and `groundUnder` now adds `ω × r` for the point
  asked about. Drift fell to 0.370 m over 60 s.
- **A parked airplane's ATTITUDE is not carried by the deck's yaw** — a known
  limitation, accepted knowingly. Its POSITION tracks a turning deck correctly
  (0.370 m above), but a chocked airplane's nose stays fixed in world
  orientation while the ship turns under it. Deck quals starts on a
  thirty-minute straight leg, so it is invisible there; it is cosmetic, and it
  is the thing to fix first if anyone parks on a carrier through a turn.
- **The approach autopilot needed two speeds, not one.** A carrier making
  15 kn into 15 kn of wind has 15.4 m/s over the deck, and one surface-relative
  speed floated the airplane the length of the deck and 320 m into the water,
  while one air-relative speed flew it into the water 310 m short. Split into
  `closureMps` (deck-relative: glide path, nominal sink, roll-out) and
  `speedMps` (air-relative: throttle, because Vref is an airspeed), with an
  optional `ApproachTarget.windVelocity`. Both default to `ZERO`, so ashore
  they collapse onto the old single speed **bit-identically** — the ashore pin
  above proves it. No autopilot constant was changed.
- **The aim point is `trapFromSternM` (30 m), not the trap zone's center.**
  Aiming at the center put the wheels down 147 m from the stern, 17 m past the
  last wire, where nothing engaged.
- **A calm scenario keeps `DEFAULT_BEAUFORT`.** Free flight stays calm in the
  air (design §3, Mark's call), but deriving the sea from its zero wind
  rendered a flat sea — the exact regression Mark reported two hours before
  this plan started. `windMps === 0` therefore means "unspecified", not
  "force 0". If Mark would rather have real wind ashore, free flight gets a
  non-zero `weather` and this branch goes.
- **`DT` is duplicated in `src/sim/world/deck.ts`** rather than imported from
  `flight/model.ts`. Importing it closes a real dependency cycle
  (`model.ts → world/ground.ts → deck.ts → model.ts`), confirmed by reading
  `depcruise`'s `no-circular` violation before reverting; the duplicate carries
  a comment saying so.
- **`invariants.ts` measures the energy invariant in the airmass frame**
  (`ctx.wind ?? ZERO`), superseding ruling R29's still-air-only note.

## Known limitations

Two entries left this list on 2026-09-19, in the whole-branch review's fix
wave: the AIRSPEED gauge reading ground speed in wind (`gaugeValue` now takes
the wind and returns `length(airVelocity(state, wind))`), and the untested
pre-Plan-8 carrier-without-`flightDeck` branch in `src/render/scene/ship.ts`
(deleted; such a spec now throws by id).

- The deck's yaw does not rotate a parked airplane (above).
- Nothing models the deck moving in a seaway, catapults, wire selection, a
  wave-off the pilot must obey, or deck traffic. Design §11 is the full list.

## Every number that is a guess

Design §10 is the authoritative table; it is reproduced here because a handoff
that omits it reads as if these were measured.

| Value | Figure | Standing |
| --- | --- | --- |
| Flight-deck height above waterline | 17 m | Estimate; searched 2026-09-18, no primary figure found. Decides only where the surface is. |
| Trap zone | 30–130 m from the stern | Estimate from "16 wires from the stern to just aft of the island". |
| Arrest run-out | 17 m/s² constant | Choice, about 1.7 g. |
| Paddles parameters | design §7 values | Choices; tune by flying. |
| Deck-quals wind | 15 kn from 342° | Content choice, matching the racetrack legs. |
| Deck spot | 110 m aft of center | Choice. Now measured against the deck run: 241.35 m of deck ahead of it, and the wheels leave 39.1 m short of the bow. |
| Essex turn rate | 1°/s | Plan 12 estimate, unchanged; no tactical diameter found. |
| `gear.heightM`, `lateralGripSeconds`, `rollingResistanceCoeff` | see `content/aircraft/f6f-hellcat.json` | Unchanged by this plan, and every deck figure above rests on them. |

## Later seams

From design §12, plus what executing added:

- Plan 9 reads `landing.at` for "landed at a carrier or an airfield".
- Plan 7's AI pilots call `paddlesCue` directly; it is already pure.
- **Gusts** enter as a time-varying `wind` in `SimContext`, with no other
  change — `World.wind` is already threaded through `advance` to every step.
- **Ship motion in a seaway** enters through `Deck.center` plus a deck
  pitch/roll that `groundUnder` would rotate by. `yawRateRadPerS` is already
  there and is the precedent for how a rate reaches a queried point.
- Clouds (requested 2026-09-18) drift with `weather`, which now exists.
- A **catapult** is the natural next carrier verb and needs nothing new from
  the deck: it is an impulse applied while `supportedContact` holds on a
  `'deck'` surface, the mirror of the arrest that already ships.
