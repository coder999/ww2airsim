# Ground and water contact, and crash response — design (Plan 10)

**Status:** design, 2026-09-16. Master spec §15 orders this next; §4 and §5 are
the sections it belongs to.

The airplane currently flies through Leyte and through the sea. `advance`
notices, records it, and deliberately does nothing. This plan makes contact
mean something, and stops there: it decides what a contact *was*, ends the
flight, and tells the pilot. It does not model wheels, ground friction, or
anything that would let a contact be survivable on land.

It is first in the reordered roadmap because everything later reads its
answer. Landing (Plan 11) is a survivable contact. Ditching feeds the recovery
multiplier (Plan 9, §8). Damage, strafing and AAA (Plan 6) all resolve into
"did that end the flight". Building those on top of a stub that records an
event and ignores it would mean each of them inventing its own answer.

## 1. What already exists, and what is actually missing

Measured against the tree at `2dd298f`, 2026-09-16:

- **Detection is done.** `advance` (`src/sim/loop.ts`) tests
  `position.y <= heightAt(terrain, x, z)` after *every* fixed step, records the
  first one as `World.impact`, and never overwrites it.
- **Water is already covered**, which is easy to miss. `heightAt` returns
  `SEA_LEVEL_M = 0` for any query outside the 200 km box, and inside it the
  sea reads zero too: the resampler maps no-data samples to 0 (`tools/terrain/
  resample.ts`, and GLO-30 Public publishes no tile at all for the one cell
  that is 100% open ocean). So touching the sea already records an impact. The
  statement "the ocean is not a collision surface" is true only of the *waves*.
- **The wave surface is not available to the physics at all.** The FFT runs on
  the GPU (`src/render/ocean/`); `src/sim/` is headless, deterministic Node and
  may not import the renderer. A CPU wave model would be a second model that
  can silently disagree with the visible one.
- **What is missing is the response, entirely.** Nothing reads `impact`. The
  airplane keeps integrating, underwater, forever.

So this plan is smaller than its roadmap entry implies. Most of it is deciding
what a recorded contact *means* and showing that to the pilot.

## 2. Where the response lives: an outcome, not a force

**The resolution stays in `advance`, as state on `World`.** Three options were
considered on 2026-09-16 and this is the one taken.

| Option | Verdict |
| --- | --- |
| Outcome on `World`, resolved in `advance` | **Taken** |
| Ground reaction forces inside `step`, terrain via `SimContext` | Rejected for this plan; this is Plan 11's shape |
| Outcome now, but widen `SimContext` with terrain "for later" | Rejected outright |

A crash is an **end state, not a force**. Nothing in this plan needs a ground
reaction: the airplane stops existing as a flying object at the moment of
contact. Putting forces in `step` now would disturb every graded flight test
card and move the golden trajectory, for no behavior this plan asks for, and
it would fight `assertNoEnergyGain` — `stepChecked` asserts that airmass
specific energy never rises at idle throttle (`src/sim/invariants.ts`), which
any bounce or skip violates by construction. Plan 11 adds contact forces when
wheels give them a consumer, and owns teaching that invariant about contact.

The third option is rejected on the codebase's own standing rule.
`SimContext`'s comment states that it "carries `dt` and `tick` and NOTHING ELSE
on purpose", written after a Plan 1 review flagged an export with no consumer:
"Later plans add a field when they have a consumer for it." A terrain field
added here for Plan 11's benefit is precisely that. Plan 11 adds it.

## 3. Surface type comes from the height already captured

`Impact` already records `groundHeightM` — the ground height at the moment of
contact, captured rather than recomputed because a later step's height at the
same (x, z) can differ.

**Water iff `groundHeightM <= SEA_LEVEL_M`.** The shoreline therefore falls out
of the elevation data that is already loaded, and there is no second coastline
map to keep in sync with the first. A contact exactly at zero reads as water,
which is the right way round: the DEM's zero *is* the sea.

This has one honest consequence to state rather than discover. Contact is
tested against whichever pyramid level is loaded, and the finest tiles (L0-L3,
~171 MB) are gitignored and optional. On a machine without them the collision
surface is a coarser terrain than the one being drawn, so a ridge can be
clipped or a valley floor met early. That is pre-existing — `heightAt` has
always had it — but this plan is the first thing to make it visible, because
until now nothing happened when it mattered.

## 4. Severity: what makes a ditch rather than a wreck

A pure function of the state at contact, with no side effects and no
dependency on how the contact was found:

```
contactOutcome(spec, state, surface) -> 'ditched' | 'destroyed'
```

**On land, always `destroyed`.** The airplane has no landing gear, no flaps and
no rolling friction (`src/sim/flight/schema.ts`, the comment on
`takeoffDistanceM`). There is nothing to land on land *with*, so a survivable
land contact would be a fiction. Plan 11 changes this by adding two inputs —
gear down, and a runway underneath — to this same function, rather than
inventing the judgment from scratch.

**On water, a ditch requires all of:** wings near level, sink rate low, nose
not down, and speed near the stall. Ditching a Hellcat is a real, survivable
maneuver and the pilot's whole job is to arrive slow, level and tail-first.

Thresholds are expressed **relative to the aircraft spec**, not as absolute
numbers, so a second airplane in the roster gets a sane judgment for free. The
speed gate keys off `reference.stallSpeedMps`, which for the F6F is 43.81 m/s —
the *clean, power-off* figure, deliberately, because the model has no high-lift
devices and the trial's 37.77 m/s landing-condition stall is unreachable for
it. That is already documented in the content file and this plan does not
relitigate it.

**These thresholds are guesses until somebody flies them.** They are stated
here as starting values and should be commented as tunable in the code, the way
`RAMP_SECONDS` already is — "the number that decides how the airplane feels,
and it is a guess until somebody flies it". Getting them wrong makes ditching
too easy or impossible; it does not make anything incorrect.

| Gate | Starting value | Why |
| --- | --- | --- |
| Bank | `abs(roll) <= 10°` | A wing tip in the water cartwheels; this is the gate that matters most |
| Sink rate | `velocity.y >= -3.0 m/s` | ~590 ft/min, a firm but survivable arrival |
| Pitch | `-2° <= pitch <= +12°` | Tail-first, nose above the water |
| Speed | `<= 1.2 * reference.stallSpeedMps` (52.6 m/s for the F6F) | Fast for a ditching, and honest: no flaps means no slower approach exists |

## 5. Freezing the world

Once an outcome exists, **`advance` runs zero steps**. The wreck stays where it
hit rather than continuing underwater, and `World` remains a complete,
serializable description of a flight that has ended — the property
`assistMemory` and `impact` are both already in `World` to preserve.

Two existing consumers were checked against this on 2026-09-16 and neither
breaks:

- The **golden trajectory** carries `terrain: null`, so its impact check never
  runs and it cannot move.
- The **terrain soak** (`runTerrainSoak`, `tools/soak/run.ts`) already stops
  each flight the instant it has an impact, for the same reason this plan
  freezes. Its `terrainHits` floor in `tests/sim/soak.test.ts` — which exists
  so a silently broken impact check cannot report zero failures forever — keeps
  working unchanged.

The soak gains one assertion: every contact it records must now carry an
outcome, so a contact that is detected but not classified fails loudly.

## 6. The debrief

Modeled on the original game's mission-debrief dialog, which Mark supplied as
a reference on 2026-09-16. **The screenshots are deliberately not committed**:
the repo is public and AGPL-3.0, `ASSETS.md` names unverifiable asset
provenance as the project's main legal exposure, and the README calls this
project clean-room. What the reference establishes is recorded here as prose,
which is not the same thing as shipping the image.

What it settles:

- A **System 7 modal over a still-visible scene** — not a separate screen. This
  is why §5 freezes the simulation rather than tearing the renderer down.
- A header naming **rank and pilot name**. Neither exists; Plan 9 owns the
  pilot roster (§8). Placeholder.
- A **"Targets Destroyed / Score" table** whose categories are Fighter, Bomber,
  AAA Battery, Carrier, Battleship, Cruiser and Runway. **This is master spec
  §8's scoring table.** The original's arithmetic agrees with it too — five
  fighters for 2,500 is 500 each, exactly §8's Fighter value. So the debrief is
  §8 rendered, not new content to invent.
- A **"Mission Awards"** panel, which is §8's badges, and a row of kill
  markers.

The dialog is a thin DOM module in the same split `legend.ts` and `overlay.ts`
already use: the layout is a pure function the node-environment suite asserts
on, and the DOM around it is small enough to read. It shows what happened
(destroyed or ditched, on water or land), §8's table at zero, and an empty
awards box.

**The score comes from a single stub.** There are no kills, so every honest
number is zero. Plan 9 replaces one function rather than a scattering of
assumptions spread through a dialog.

**One button: Restart.** "Resume" is meaningless after a death, and the
original's "End Mission" returns to a mission selector that does not exist —
a button that goes nowhere is how a stale document starts. Plan 9 adds the
menu and the button that reaches it.

### The freeze is not the debrief's

Plan 14 (the mission map, deferred on 2026-09-16 — see §15) is the same
mechanism: a modal over a frozen game. So the freeze belongs to the frame, not
to the debrief module, and the debrief must not be the thing that knows how to
stop time. This is a placement note, not a license to build a general modal
framework for one consumer.

## 7. Restart

Restart rebuilds the frame from the spawn point. `initialFrameState` is already
a pure call taking the spec, the state, the assists and the terrain field, so
this is a call and not a teardown: the renderer, the terrain and the ocean
cascades all survive untouched.

The spawn default is 600 m over water (`src/render/spawn.ts`) with altitude
hold off by default. **From this plan onward, ignoring the controls ends the
flight** instead of quietly flying into the sea. That is the intended
behavior, noted because it changes what an idle tab does.

## 8. Verification

Per master spec §11's tiers.

**Tier 1** carries nearly all of it, because nearly all of it is pure:

- `contactOutcome` at each gate's boundary, on both surfaces — one case per
  gate, each failing for one reason, so a mutant that drops a single gate
  cannot pass. The existing terrain-contact suite's `<=` boundary test is the
  precedent: it exists specifically because a `<` mutant passed everything else.
- Surface classification at and around `SEA_LEVEL_M`.
- The outcome reaching `World`, surviving `structuredClone`, and never being
  overwritten by a later step — the properties `impact` already has.
- The freeze: zero steps run, tick unchanged, position unchanged, and
  `advance` still pure against a deep-frozen world.
- The debrief's layout function: what it says for each outcome and surface.

**Tier 2** (real GPU, reference platform): a scripted dive into terrain and a
scripted descent into water each raise the dialog and fire the right effect,
with no WebGPU validation errors.

**Tier 3** (human eyes): whether the splash and the explosion read as a splash
and an explosion, and whether the dialog looks right. Mark's only step.

**Soak:** `runTerrainSoak` gains the assertion in §5.

## 9. Out of scope, stated so it is not drifted into

- **Scoring.** Plan 9 and §8. The stub returns zero.
- **Landing gear, flaps, ground friction, ground effect, roll-out.** Plan 11.
- **Wave-accurate water contact.** Mean sea level, `y = 0`, decided
  2026-09-16. At Beaufort 6 a ditching will visibly disagree with the water by
  a wave height. Revisit when sea state matters for a deck (Plan 8).
- **Wreck physics.** The airplane stops at the point of contact. No slide, no
  tumble, no debris.
- **Damage short of destruction.** Plan 6. A contact is binary here.
- **A main menu, a mission selector, a pilot roster, badges, ranks.** Plan 9.
- **Collision with anything that is not the ground or the sea** — another
  airplane, a ship, a building. Those are entities and do not exist yet
  (Plan 12). `surface` is the field that will grow when they do.

## 10. Open questions for the plan

1. **What the effect actually is.** A splash and an explosion need *some*
   geometry. The cheapest honest thing is a short-lived expanding billboard;
   whether that reads well enough is a Tier 3 answer and the plan should treat
   the first attempt as provisional.
2. **Whether the debrief should show the contact numbers.** Impact speed, sink
   rate and bank are all captured and would tell a pilot why a ditch failed.
   The original shows none of them. Leaning toward showing them while there is
   no score to show instead.
3. **Whether `Impact` is renamed.** It becomes an outcome rather than an event.
   A rename touches the soak, the terrain tests and the e2e suite; the plan
   should decide once, up front, rather than half-way through.
