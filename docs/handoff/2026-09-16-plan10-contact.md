# Ground and water contact, and crash response — completed 2026-09-16

Touching the ground or the sea now ends the flight. `advance` (`src/sim/loop.ts`)
still detects a contact the way it always has, but now classifies it —
`surfaceAt` reads the ground height already captured on `Impact` to decide
water versus land, and `contactOutcome` (`src/sim/contact.ts`) judges a water
contact against four gates to decide ditched versus destroyed. Land contact is
always destroyed: the F6F model has no landing gear, flaps, or rolling
friction to land on land with, so a survivable land contact would be a
fiction. Once an outcome exists, `advance` runs zero further steps — the
airplane freezes at the point of contact rather than continuing underwater or
through the terrain. A debrief modal reports what happened over the still-frozen
scene, and its one button, Restart, rebuilds the frame from the spawn point
without tearing down the renderer, terrain, or ocean. Full design:
[`docs/superpowers/specs/2026-09-16-ground-contact-design.md`](../superpowers/specs/2026-09-16-ground-contact-design.md).

No screenshots are committed here, by design. Master spec §6 of the design
document records why: the repo is public and AGPL-3.0, `ASSETS.md` names
unverifiable asset provenance as the project's main legal exposure, and this
project calls itself clean-room. What Mark's 1991 reference screenshot
established is recorded there as prose instead.

## The ditching gates — final values, all four untuned guesses

**Nobody has flown these.** They are starting values, commented in
`src/sim/contact.ts` the same way `RAMP_SECONDS` already is in
`src/input/keyboard.ts` — a guess until somebody flies it. Getting one wrong
makes ditching too easy or impossible; it does not make anything incorrect.

| Gate | Final value | Why |
| --- | --- | --- |
| Bank | abs(roll) \<= 10° | A wing tip in the water cartwheels; the gate that matters most |
| Sink rate | velocity.y \>= -3.0 m/s | About 590 ft/min, a firm but survivable arrival |
| Pitch | -2° \<= pitch \<= +12° | Tail-first, nose above the water |
| Speed | \<= 1.2 x reference.stallSpeedMps | 52.6 m/s for the F6F — fast for a ditching, and honest: no flaps means no slower approach exists |

All four must pass for a water contact to read as `'ditched'`; any land
contact, or a water contact that fails even one gate, is `'destroyed'`. The
speed gate keys off the F6F's clean, power-off stall (43.81 m/s), not the
trial's lower landing-condition figure, because the model has no high-lift
devices to reach the lower figure with — already decided and documented in the
aircraft content file, not relitigated here.

## The impact effect — provisional, per spec §10's open question 1

`src/render/scene/impactEffect.ts` fires a camera-facing billboard at the
contact point: pale blue, 26 m max radius, 1.8 s lifetime on water; orange,
34 m max radius, 1.4 s lifetime on land. It grows on a square-root curve (fast
at first, then settling) and fades linearly to zero opacity. Whether these
read as a splash and a fireball, rather than as a colored disc, is Tier 3 —
Mark's outstanding judgment call, not a code question.

## A defect found and fixed: the effect was double-applying `worldOffset`

During Task 10's review, the effect's position was set to
`hit.position + worldOffset`, following the task brief's own text. That text
was wrong: `scene.position` is itself set to `worldOffset` every frame, and
every other child of `scene` — the airframe, the sky, the terrain mesh — sets
its position in raw world metres and lets `scene.position` apply the
camera-relative shift exactly once. Adding `worldOffset` a second time placed
the splash at `hit.position - 2 * eyePosition` instead of `hit.position -
eyePosition`: the error scales with distance flown from the world origin,
which at Leyte's 200 km scale means the effect would have drawn kilometres
from the crash site. Fixed in commit `9adcb4f` — the effect now positions from
raw `hit.position`, with a comment explaining why no offset belongs there so a
future reader does not "fix" it back.

Worth recording on its own: `src/render/main.ts` has no unit tests by design,
and this shipped inside a task the vitest suite reported as green throughout.
Nothing in the 723-test suite could have caught it. The only reason it was
caught here is that a review compared the new code against the existing
pattern the file already used for `hellcatRoot`, `sky`, and the terrain mesh.

## Verification

**Tier 1 (headless, `npm run verify`): executed, exit 0.**

```
Test Files  71 passed (71)
     Tests  723 passed | 1 skipped (724)
```

Measured directly in this worktree 2026-09-16, after Task 11 and again just
before this commit. `npm run verify` runs `tsc --noEmit`, ESLint, the
dependency-cruiser boundary rules, and the full vitest suite, all clean.

**The plan document is stale from Task 6 onward, and that is expected.** The
plan text prints 715 after Task 6 and 724 at the end. The true chain is 714
after Task 6, 719 after Task 7, and 723 at the end (Task 9 adds the final
four; Tasks 8, 10, and 12 add none; Task 11 is Playwright, not vitest). The
cause is a controller ruling made during execution (ledger ruling P3): the
plan's Task 6 called for a second `runTerrainSoak` test that would have
duplicated coverage the existing soak assertion in `tests/sim/soak.test.ts`
already provided, so that one test was cut as redundant rather than added.
Every count the plan prints from that point on is one too high. A future
reader comparing the plan document to the shipped suite should trust this
handoff and the execution ledger
(`.superpowers/sdd/2026-09-16-ground-contact/progress.md`), not the plan's
printed figures.

**Tier 2 (real GPU, reference platform): NOT executed.** `tests/e2e/contact.spec.ts`
is written and typechecks — two specs, a scripted dive into the sea that
asserts the debrief raises with the right headline and surface, and a restart
that puts a fresh airplane back in the air — but this sandbox has no discrete
GPU, and headless Chromium here fails at the adapter guard before reaching
either test. It must be run on the Windows reference desktop with a Playwright
server already running in Mark's interactive console session (the same setup
`docs/handoff/2026-09-15-cockpit-panel.md` used):

```
npx playwright test tests/e2e/contact.spec.ts
```

Expected: 2 passed, no page errors, no WebGPU validation errors. This handoff
does not claim it passed — it has not been run.

**Tier 3 (human eyes): NOT executed.** Nobody has looked at the splash or the
fireball on real hardware. Whether they read as a splash and a fireball, and
whether the debrief dialog looks right, is entirely Mark's outstanding
judgment call — see the impact-effect section above.

## Nonblocking follow-ups

Carried from the execution ledger's deferred minors (`progress.md`), not
silently dropped:

- The sink-rate gate (`sinkingGently` in `src/sim/contact.ts`) bounds sink
  from below only, so a state that is climbing at the moment of contact would
  pass that one gate. Moot in the flight model as it exists today, but not
  for the reason an earlier draft of this note gave — "reaching `y <= 0` from
  above already implies `velocity.y <= 0`" is a continuous-motion argument
  that discrete sampling does not automatically preserve; a climbing sample
  could in principle straddle the ground in one discrete step. The real
  guarantee is `src/sim/flight/model.ts`'s integrator: it is semi-implicit
  (symplectic) Euler — velocity is advanced from the force first, then
  position is advanced using that *new* velocity in the same step — so a
  step that ends climbing cannot have used a downward velocity to get there,
  and cannot land at or below ground from above while climbing. An explicit
  Euler or a midpoint/RK integrator would not give this for free, and the
  gate would need its own check if the project ever moves off semi-implicit
  Euler. It is a latent gap if a future plan lets the airplane approach a
  water contact from below (unlikely, but not impossible on paper).
- `contactOutcome` and the impact effect's appearance/scale functions are
  verbatim transcriptions of the plan's own code. The green Tier 1 suite
  therefore validates that the plan's design does what the plan says, not
  that an implementer's independent judgment agrees with it. Tier 2 and
  Tier 3 are the checks that exercise judgment instead of transcription.
- Spec §10's open question 2 (whether the debrief should show contact
  figures) was decided yes during Task 7: the dialog shows impact speed, sink
  rate, and bank. Open question 3 (renaming `Impact`) was decided no during
  Task 4 — it stays an event-shaped record even though it is now read as an
  outcome, because a rename would have touched the soak, the terrain tests,
  and the e2e suite for no behavior change.
- Plan 11 (gear, flaps, ground handling, and landing ashore) is next per
  master spec §15, and reuses `contactOutcome` rather than inventing a second
  survivability judgment: it adds gear-down and runway-underneath as two more
  inputs to the same function.

None of the above is a release blocker. The two outstanding items that matter
before calling this plan actually done in the field are Tier 2 and Tier 3,
recorded above with Tier 2's exact command and Tier 3's owner named.
