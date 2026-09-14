# Plan 3 hardening — report, 2026-09-13

Worktree `.claude/worktrees/plan3-hardening`, branched from the Plan 3 merge
`0873ca0` (442 tests, 37 files). Four commits, `npm run verify` exit 0 before
each, golden passing **unregenerated** (`golden:regen` never run, and
`tests/sim/golden/f6f-rolling-descent.golden.json` is untouched — see the
`git diff --name-only 0873ca0..HEAD` list at the end).

All five tasks done. Design-doc item 1 (altitude hold not standing down in the
stalled band below 90 degrees with the limiter off) deliberately NOT touched.

| # | Commit | What |
| --- | --- | --- |
| 4, 5 | `3510f99` | design items 3 and 2: the pitch budget is a true claim for every input and every stage |
| 1 | `cae3feb` | the committed property sweep, total over alpha |
| 2 | `461559b` | the soak's assists arm |
| 3 | `721bf6b` | architecture probes cruise a per-test temp root |

Test count 442 → 451. Suite runtime 13.35 s → 13.39 s wall (the soak file went
1.7 s → 4.8 s and the architecture file 9.6 s → 11.7 s, both absorbed by
vitest's parallel workers).

---

## Task 1 — the committed property sweep

`tests/assists/authoritySweep.test.ts`, new file, 2 tests.

**The invariant is total over alpha**, which is the whole point: the invariant
the suite had ("the command lies inside the limiter's bound") is vacuous past 90
degrees, where the limiter publishes no bound, and that is exactly where the
third Critical lived. The budget `applyAssistsWithAuthority` publishes exists on
every path, so five clauses are checked at every single point with no
conditional exemption:

1. the published budget is non-empty (`lower <= upper`);
2. it never leaves the pilot's legal range `[-1, 1]`;
3. the command returned is inside it, **exactly**, not to a tolerance;
4. past the departed threshold the budget IS the pilot's own command, narrowed
   to a single value;
5. with all three assists off the stack is the identity on the pilot's
   (sanitised) command.

Clause 4 is evaluated through the same `!(Math.abs(alpha) < PI/2)` predicate the
production code stands down on, applied to the state's own `angleOfAttack` —
not at a standoff from 90 degrees. There is no band of alpha in which the sweep
checks nothing.

**Space and count.** 177 alphas × 48 seeded random draws × 8 settings
combinations = **67,968 stack evaluations**. Alphas: 0.1, 0.5, 1, 2 and 5
degrees either side of both boundaries (`alphaCritDeg` 15.5 and 90) in both
signs, both boundaries exactly, and a 2.5-degree lattice out to ±180 so past-90
is covered in both directions. Draws: speed 0.02–250 m/s (one draw in eight
nearly zero), altitude 50–9,050 m, sideslip ±60 degrees, arbitrary attitude via
random axis-angle (so rolled and inverted), throttle 0–1, `dt` either `DT` or
0.05–0.5 s (the branch where the limiter rations its margin over the step rather
than its 0.15 s time constant), held altitude ±600 m of the aeroplane or nothing
held, pilot pitch exactly centred on 40% of draws and illegal (±5, NaN, ±Inf) on
15%.

**Runtime: 254 ms for the sweep case, 578 ms for the file** including loading
the spec (node v22.22.1). Draws come from `createRng` (mulberry32, bit-identical
across platforms) off a fixed seed, so two CI runs of one commit sweep the same
space and a failure message replays by hand.

**Proved to discriminate**, by re-introducing each defect shape:

- departed-region defect (`runStack`'s narrowing replaced by
  `FULL_PITCH_AUTHORITY` unconditionally): **31,368 cases fail**, every departed
  case, every one on clause 4 and nothing else. Clauses 1, 2, 3 and 5 stay
  satisfied — which is precisely why "inside the budget" alone was blind to it.
- original C1 shape (`altitudeHold`'s final `withinAuthority` replaced by the
  raw sum): **4,988 cases fail**, all on clause 3.
- reverting the task-5 input clamp also fails it (see below).

Coverage floors are asserted and measured, the way the soak's are, so a sweep
that stopped visiting a region fails instead of passing quietly: 31,368 departed
cases, 28,488 stalled-band, 6,928 where the limiter moved the command, 2,280
where altitude hold did, and of the 8,496 (alpha, draw) pairs, 3,186 rolled more
than 30 degrees and 708 carrying an illegal pitch.

The existing deterministic lattice in `index.test.ts` is **kept**: it cannot
miss an integer degree, the new sweep covers the dimensions it holds fixed
(attitude, throttle, sideslip, `dt`, illegal inputs), and neither contains the
other. Together they cost under 0.4 s.

Incidental: the states are built from the body axes, so alpha is exactly the
swept value at any attitude and any sideslip — asserted numerically (worst error
1.14e-13 degrees over the sweep), which re-checks design open item 8's
retraction as a construction rather than as prose.

## Task 2 — the soak's assists arm

`tools/soak/run.ts` gains an optional fourth parameter; `tests/sim/soak.test.ts`
gains one arm and extends the reproducibility test.

**Shape, and why.** A parameter on `runSoak`, not a second harness and not a
loop in the test. `sim/` must not import `assists/` (named rule
`sim-must-not-import-assists`, probed), but `tools/` is not `sim/` — this file
already imports `src/sim` and the content loader, and it is the stand-in for the
call chain the renderer builds. It now builds the same one through
`createAssistRunner`, one runner per FLIGHT so a captured altitude cannot
outlive its aeroplane. A separate `runAssistedSoak` would have had to copy the
60×60 loop, the water check, the chaotic injection and the replay machinery, and
the copies would have diverged on the first change to the input distribution.

The arm checks more than the unassisted one: `stepChecked`'s finiteness and
energy invariants as before, plus, on every step, that the published budget is
non-empty, inside `[-1, 1]`, contains the command flown, and collapses onto the
pilot's own command past 90 degrees. The budget is recovered by re-running the
stack with the memory the runner has just used, and the reconstruction is
asserted equal to the command actually flown rather than assumed to be.

**A gap found while measuring, and worth flagging as a finding in its own
right:** with the soak's continuous pitch draw, the assisted arm engaged
altitude hold on **0 of 550,320 steps**, because that stage's gate is an exact
`raw.pitch === 0` (a released key ramps to literal zero) and a continuous draw
never produces an endpoint. The arm now releases the stick on 25% of seconds —
the same endpoint-forcing trick the pre-existing `throttle: rng() < 0.2 ? 0 :
rng()` uses for the same reason. The `> 0` guard short-circuits so the
unassisted arm consumes no extra rng draw.

**Floors, measured 2026-09-13, node v22.22.1, seed 1337, 200 iterations,
`DEFAULT_ASSIST_SETTINGS`:** 577,980 steps, 92 completions, 32,793 stalled
steps, 159,224 steps where the stack moved the pitch axis off the pilot's
command, 145,140 with altitude hold engaged, 577,980 where auto-rudder moved yaw
(i.e. every step — which is why pitch and yaw are counted separately: one
combined counter would sit at 100% and could not detect the two pitch stages
going quiet, the exact failure the hold counter did detect). Zero failures,
2.5 s against the unassisted arm's 1.0 s. Seeds 4242 and 7 are recorded in the
test for spread.

**Proved to fail:** `altitudeHold` skipping `withinAuthority` fails 99 of 200
iterations (`commanded -1 against {"lower":0,"upper":0}`); removing the departed
narrowing fails 53 (`departed budget {"lower":-1,"upper":1} is not the pilot's
own 0.32… at alpha -111.66 deg`). Both leave the unassisted arm green.

**Existing figures re-checked:** the unassisted arm's three floors reproduce to
the digit before and after this change — 587,040 steps / 99 completions / 46,086
stalled steps at seed 1337 × 200 — so that comment's claims still hold and the
weathercock comparison it rests on stays checkable. Nothing in it had to be
corrected.

## Task 3 — the architecture tests no longer touch the real tree

`tests/architecture/boundary.test.ts`: `cruiseWithProbes` copies `src/` plus
`.dependency-cruiser.cjs` and `tsconfig.json` into a fresh `mkdtemp` root
outside the repo, writes the probes there, and cruises that root with
`depcruise src --config .dependency-cruiser.cjs` — `npm run depcruise`'s exact
arguments. No config changes: every rule pattern is relative to the cruise root.

**The race, reproduced and measured.** Looping that command in a shell for as
long as the boundary suite takes to run: with the old in-tree probes, **9 of 13
concurrent cruises failed** — seven reporting a violation against 40 or 41
modules where the quiescent tree has 39, two dying with `ENOENT …
__cycle_a__.ts` because the file vanished between being listed and being read.
With the temp root, **0 of 12 failed.** The suite itself was green in both runs,
which is what makes this the sort of defect that wastes an afternoon rather than
failing CI.

All seven depcruise rules were watched firing **by name** from a temp root
(`sim-must-not-import-render`, `-render-libs`, `-node-core`, `-input`,
`-assists`, `assists-must-not-import-render`, `no-circular`). `node_modules` is
symlinked rather than copied, because `sim-must-not-import-render-libs` matches
`node_modules/(three|@webgpu)` and an unresolvable import produces no violation
at all; the resolved path still contains `node_modules/three` through the link,
so the unanchored pattern matches unchanged. `rmSync` does not follow the link
(checked directly: the target's files survive a recursive remove of the root).

A probe can no longer appear in the real tree **at all**, and that is asserted
rather than described: one new test writes all four probes, confirms the cruise
saw them by rule name, confirms none of the four paths exists in the repo, and
confirms the real tree still cruises clean immediately afterward. The
`afterEach` is gone — there is no shared mutable location left to clean. The
`.gitignore` entry stays as a backstop, with its comment corrected: it asserted
that the test writes those paths, which is now false.

## Task 4 — design item 3: the limiter clamps into the narrowed authority

`src/assists/index.ts`. The one line as advertised — and writing the guard as a
direct call on the stage (now exported for that purpose, since no input through
`applyAssists` can reach the case) found **two more holes in the same shape**:

- both no-bound EARLY RETURNS handed the command straight back alongside a
  budget it need not be inside. Handed `[-0.4, 0.4]` at alpha −100 the stage
  returned the pilot's raw `+1`. Both now put their value on the axis through
  the budget, a no-op on every reachable path (departed: `runStack` has already
  collapsed the budget onto that exact command; unauthorised: nothing has
  narrowed it, so it is still `[-1, 1]`).
- `narrowAuthority` could publish an EMPTY budget when an incoming budget does
  not overlap the limiter's bound (`[0.25, 0.25]` against `[-1, 0]`), after
  which `withinAuthority` answers `upper` or `lower` depending on which side the
  value came from — an arbitrary answer from an incoherent claim. The conflict is
  now decided rather than intersected: the bound being applied wins (later, more
  specific, and in the shipped stack the one keeping the wing attached),
  collapsed to its point nearest the budget it replaces. `lower <= upper` is now
  true of every budget the file publishes, with no exception clause for the sweep
  to carry.

Guard: `tests/assists/stallLimiter.test.ts`, 3 new tests, the third total over
alpha at 1-degree steps in both directions — 14,440 direct calls to the stage,
of which 4,410 are decided conflicts (measured, so the conflict clause is a case
rather than an escape hatch).

## Task 5 — design item 2: the illegal command

Fixed by **clamping the input** in `runStack`, before any stage or any budget
sees it, not by widening the claim. Reasoning: widening is unavailable without
giving up "the budget never leaves the pilot's legal range", the property the
whole arbitration rests on — a budget that must contain 5 is not inside
`[-1, 1]`, and clauses 2 and 4 of the sweep would have to go with it. Clamping
is also behaviour-preserving rather than merely defensible: `commandedBodyRates`
already put every channel through the same `clampFinite(n, -1, 1)`, so 5 was
already flown as 1 and NaN as 0. This moves that clamp one stage earlier, where
the claim is made, and makes the stack's contract total — `Controls` in, legal
`Controls` out, for every input a caller can construct.

The two GATES that read the pilot's literal command (`isPitchCentred`, and
`nextAltitudeHoldMemory` in the runner) deliberately keep seeing the
**unsanitised** value: NaN is a malformed input event, not a centred stick, and
mapping it to 0 there would engage altitude hold and capture a held altitude off
a broken input.

Guard: `tests/assists/index.test.ts`, 2 new tests — the budget contains the
command for all five illegal values at three alphas across all eight
combinations, and `step()` reaches an identical state field-for-field from the
illegal command and from the sanitised one, which is what makes the fix safe to
believe rather than merely tidy.

---

## How every new test was proved to fail

Reverting BOTH source fixes and running the whole suite: **exactly the 7 new
guards fail, and all 444 other tests pass** (including the 442 as merged). That
single run establishes three things at once — each new guard bites, neither fix
changes any pre-existing behaviour, and both design items really were
unreachable through the shipped call path, as the design doc claimed.

Per-guard, with the mutation used:

| Guard | Mutation | Result |
| --- | --- | --- |
| sweep, clause 4 | departed narrowing → `FULL_PITCH_AUTHORITY` | 31,368 cases fail |
| sweep, clause 3 | `altitudeHold` skips `withinAuthority` | 4,988 cases fail |
| sweep, clauses 3/4 | task-5 input clamp reverted | fails |
| soak assists arm | either of the two mutations above | 99 / 53 of 200 iterations fail |
| stall-limiter guard ×3 | task-4 clamp reverted to the old expression | all 3 fail, other 50 assist tests green |
| illegal-pitch ×2 | task-5 input clamp reverted | both fail |
| temp-root guard | measured against the pre-fix file from `0873ca0` | 9/13 concurrent cruises fail pre-fix, 0/12 post-fix |

## Numbers I re-measured rather than inherited

- soak, unassisted, seed 1337 × 200: **587,040 steps / 99 completions / 46,086
  stalled steps** — reproduces the figure in that test's comment exactly, before
  and after my change. No existing figure in any file I touched failed to
  reproduce.
- `stallLimiter` at alpha 0, 130 m/s with a full budget hands back +1, −1 and
  +0.5 unchanged and publishes `[-1, 1]` — measured, and the reason the item-3
  guard's expected values come from the incoming budget and not from the
  limiter's own bound.
- everything quoted above (67,968 / 254 ms, 14,440 / 4,410, 577,980 / 92 /
  32,793 / 159,224 / 145,140, 9-of-13 vs 0-of-12, 1.14e-13 degrees) was measured
  in this worktree today on node v22.22.1, and is recorded next to the
  assertion that depends on it.

## Concerns and open items

1. **Design item 1 remains open and untouched**, as instructed: with the stall
   limiter OFF and altitude hold ON, altitude hold still commands full nose-up
   across the 15.5–90 degree stalled band. Note that the new sweep is total over
   alpha and passes anyway, because that behaviour is *inside* the published
   budget — the budget is honest about it. So the sweep is not a guard against
   item 1, and closing item 1 is still a behaviour decision for the owner at the
   controls.
2. **`narrowAuthority`'s conflict rule is unreachable today** (the shipped stack
   has exactly one stage that narrows to a range, and it only ever sees the full
   budget). It is written, documented and covered by the stage guard, but it
   encodes a *decision* — the later, more specific bound wins — that nobody has
   had to make in anger yet. The day a second narrowing stage is added, that
   line is the first thing to re-read.
3. **The two soak arms sample slightly different input distributions** (the
   assisted arm releases the pitch stick on 25% of seconds; the unassisted one
   never does). That is deliberate and documented — it is the only way to reach
   altitude hold's exact-zero gate, and it keeps the unassisted arm's figures
   bit-identical so its weathercock history stays checkable — but the two arms'
   step/completion counts are not comparable, and nobody should later "fix" one
   to match the other.
4. **`stallLimiter` is now exported** solely so its authority contract can be
   asserted directly. It has no production caller besides `runStack`. If a
   future change gives it one, the doc comment saying otherwise is the thing to
   correct.
5. **The architecture file copies `src/` seven times per run** (~1 s per cruise,
   11.7 s for the file, absorbed by parallel workers). If `src/` grows large
   this is the first place to feel it; a single per-file root would halve the
   copies at the cost of reintroducing shared mutable state between tests in the
   file.
6. `docs/superpowers/specs/2026-09-13-assists-design.md` items 2, 3 and 4 are
   now marked CLOSED in place with what was done and what was measured; item 1
   is untouched. Nothing else in that document was edited.
