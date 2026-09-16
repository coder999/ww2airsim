# Archived cockpit-panel decisions and review

Historical ledger; the continuation at the end resolves the earlier outstanding
items. Final outcome: [handoff](2026-09-15-cockpit-panel.md).

# SDD ledger — plan: docs/superpowers/plans/2026-09-15-cockpit-panel.md

Spec: `docs/superpowers/specs/2026-09-15-cockpit-panel-design.md` (read; binding authority).
Worktree: `.claude/worktrees/plan6a-cockpit-panel`, branch `worktree-plan6a-cockpit-panel`.
Base: `0378213`. Baseline suite: 644 passed, 6 skipped, rc 0.
(6 skipped vs 1 on main is expected: the L0 terrain blocks need `content/terrain/tiles/`,
which exists only in the main checkout.)

## Pre-flight scan

### Task pairs sharing a file or interface

| Pair | Produces → consumes | Found |
| --- | --- | --- |
| 1 → 3 | `GAUGES` kinds → panel build loop filters `kind === 'dial'` | **CONFLICT (F1)** — see ruling R1 |
| 1 → 4 | `fractionForValue`, `gaugeValue(..., controls)` → column fill | clean |
| 1 → 5 | `TapeSpec` → tape rendering | **CONFLICT (F1)** — heading entry converted in two places |
| 1 → 6 | gauge entry for attitude → ball rendering | **CONFLICT (F1)** — attitude entry added in two places |
| 2 → 3 | `PANEL_BANDS`, `degreesBelowEye`, `metresBelowEye` → slot/band placement | **DEFECT (F2)** — `PANEL_BELOW_M` named in prose, absent from the code block |
| 3 → 4 | `PANEL_SLOTS` (`throttle`) → column placement | clean |
| 3 → 5 | `PANEL_BANDS.upper` → tape placement | clean |
| 3 → 6 | attitude slot → ball placement | depends on R1 |
| 3 → 7 | `backing` (`BACKING_Z`) → bar removal (`HORIZON_Z`) | clean — different constants |
| 6 → 7 | `Panel.attitude` → bar retired once ball is green | clean — ordering is the point |
| 1,5,6 → 3 | dial COUNT in the lower row | **CONFLICT (F1)** — Task 3 asserts six dials at a point when the table holds a different six |

### Task-internal consistency

| Task | Self-agreement | Found |
| --- | --- | --- |
| 1 | tests vs table vs panel filter | clean after R1; test import line is partial (`createState`, `v3`, `f6f` unlisted) — **minor, M1** |
| 2 | module code vs prose | **F2** — prose moves `PANEL_BELOW_M`, code does not define it |
| 3 | slot table vs test vs build code | **F1** — "keeps six dials" contradicts the table's contents mid-plan |
| 4 | test vs build code vs `Panel.columns` | clean |
| 5 | test vs `tapeOffsetFor` vs render code | clean after R1 |
| 6 | test vs helpers vs build code | clean — helpers verified to exist in `panel.test.ts` |
| 7 | removals vs what Tasks 3/6 added | clean |
| 8 | docs vs what shipped | clean |

### Rulings

**R1 — Ruling: the gauge TABLE is finalised in Task 1 (five dials, one tape, one column).
The attitude ball is NOT a `GAUGES` entry — it is panel geometry with a layout slot,
exactly as the horizon bar it replaces was.**
Why: the plan had Task 3 allocating a slot for `attitude` while `GAUGES` still held a
round `heading` dial and no attitude at all, so `slotX('heading')` would throw and the
attitude slot would go unused — the panel would not build between Tasks 3 and 6. Making
the table final in Task 1 closes that window.

Keeping the ball out of the table is the second half: `GaugeBase` requires `min`, `max`,
`majorStep`, `minorStep`, `fromSI` and `decimals`, and an attitude indicator has no scale
those describe. It is driven by `attitudeAngles(state)`, not by a scalar `gaugeValue`.
Forcing it in would put six meaningless numbers in the table — the exact thing the union
exists to prevent. The horizon bar was never a `GAUGES` row either.

Consequence: `GaugeKind` stays `'dial' | 'column' | 'tape'`. The lower row is **five dials
plus the ball**. Task 3's count assertion changes to match; Tasks 5 and 6 render only.
If wrong: Task 1 grows by two table rows; Tasks 5 and 6 shrink. Rework is confined to the
gauge table and three test names — no rendering code moves.

**R2 — Ruling: `PANEL_BELOW_M` stays in `panel.ts`; only `PANEL_AHEAD_M` moves to
`panelLayout.ts`.**
Why: `PANEL_BELOW_M` places the panel's origin, which is a rendering decision;
`panelLayout.ts` owns band arithmetic measured from the eye. Moving it would give the pure
module a constant nothing in it uses.
If wrong: a one-line move and two import edits.

**M1 — deferred minor:** Task 1's test snippet lists only the `gauges.js` import. The
implementer adds `createState`, `v3` and the `f6f` spec the way every other test in
`tests/render/` already does. Not worth a plan edit.

## Progress

### Task 1

`Task 1: implementer returned DONE_WITH_CONCERNS (commit ff4b8c2, verify rc 0, 649 passed / 6 skipped).`

**R3 — Ruling: `controls` is REQUIRED, and sits 4th in `updatePanel`, ahead of `makeText`.**
The implementer made it optional with a `NEUTRAL_CONTROLS` default and appended it 6th,
to avoid touching pre-existing call sites. Two reasons that does not stand:
(a) an optional control vector means a call site that forgets to thread it silently reads
throttle 0 — a plausible-looking instrument reading rather than an error, which is the
same wired-vs-unwired failure `tests/render/frameAssists.test.ts` exists to catch;
(b) Tasks 4, 5 and 6 every one call `updatePanel(p, f6f, state, controls, () => null)`
with controls 4th, so the shipped signature breaks three later tasks' test code.
The verbosity the implementer was avoiding is already answered by the plan: Task 1
mandates a shared `NEUTRAL_CONTROLS` constant in `tests/render/panel.test.ts` for exactly
this. `gaugeValue` and `readoutTextFor` take it required too.
If wrong: the default comes back and three later tasks' snippets get their argument order
swapped instead. Confined to signatures and call sites; no behaviour changes.

**F3 — carried to Task 5:** heading's `readoutTextFor` lost its 360-degree wrap and
zero-pad when `heading` became a `TapeSpec` (no `circular` field). Inert today because
nothing renders a heading readout. Task 5 ships the tape's numeric readout (plan decision
2), so Task 5 MUST restore both — a compass reads 005, not 5. Carry this into Task 5's
dispatch.

`Task 1: fix round 1/5 (1 addressed, 0 open — controls required and 4th; commits ff4b8c2..0be98ce)`
`Task 1: minor (deferred): three module-local NEUTRAL_CONTROLS fixtures (gauges.ts, gauges.test.ts, panel.test.ts). Trivial stable shape, no export, no drift risk; one copy was brief-mandated.`
`Task 1: complete (commits 8949109..0be98ce, review clean — spec OK, quality approved)`

### Task 2
`Task 2: complete (commits 0be98ce..00e3238, review clean — spec OK, quality approved)`
Reviewer's "⚠️ cannot verify from diff" (mutation evidence in the commit body) RESOLVED by
the controller: `git log -1 --format=%B 00e3238` carries the full failure text
("expected 39.71427319525943 to be less than or equal to 30"). Not a gap.
`Task 2: minor (deferred): the 'bands do not overlap' case is algebraically guaranteed by PANEL_BANDS' own construction (lower.top IS upper.bottom + GUTTER), so it cannot fail today.`
**Ruling: keep it, do not spend a fix round.** It is plan-mandated and it does bite if a
later edit replaces the derived bands with independent literals — which is exactly the
shape of change this plan invites. Cost if wrong: one dead test case. My preflight scan
should have caught it as a self-referential assertion; recorded so the final review can
triage it.

### Task 3
`Task 3: implementer DONE (commit 5b6ccaf, verify rc 0, 655 passed / 6 skipped). Review: spec OK, quality approved with 2 Important.`

**R4 — Ruling: narrow `DIAL_GAP` to 0.145 and require a 1-degree margin in the horizontal
budget assertion. Keep `EDGE_W` at 0.052.**
The reviewer is right that the guard currently pins a 1.5 mm paper margin (40.75 deg
against a 40.89 deg limit) on slots that draw NOTHING: `throttle` is not rendered until
Task 4 and `armament` never is. The first real bezel on the throttle column breaches the
frustum at 3:2 while the test stays green — a guard that passes precisely because the
geometry it guards does not exist yet.
Measured just now: at `DIAL_GAP` 0.145 the edge block sits at 39.07 deg, margin 1.83 deg,
and the dial row moves from 37.05 to 35.50 deg. The plan already authorised narrowing
`DIAL_GAP` for exactly this ("narrow DIAL_GAP until it passes and record the new value").
Narrowing the row rather than shrinking `EDGE_W` is the better trade: the row had 3.8 deg
of slack, and squeezing `EDGE_W` to 0.036 would have left the column too narrow for its
tick marks and its "100" numeral.
If wrong: dials sit 10 mm closer together than the 2026-09-13 spacing decision chose.
Reversible by one constant; the assertion then re-fails and says so.

**R5 — Ruling: accept the reviewer's fix for the backing exclusion verbatim.**
Exclude by IDENTITY (`child === p.backing`), not by name, and assert
`p.backing.children` is empty. The naming was not the hole — the parenting was: only
direct children of `root` are inspected, so anything mounted UNDER the backing plate is
silently excluded with it, and the plate is the natural mount point for the very
radar/armament screens these slots reserve.
If wrong: two lines revert.

`Task 3: minor (deferred): EDGE_W comment calls it a "half-width companion"; it is used as a full widthM.`
`Task 3: minor (deferred): the backing-extent Box3 reads panel-LOCAL coords while a sibling test 20 lines up reads world coords after updateMatrixWorld(true); correct today, fragile if anything updates the world matrix first.`
`Task 3: minor (deferred): Slot carries no band, so radar (+/-0.08) overlapping the attitude slot in X is safe only by living in the upper band, and nothing records that.`
`Task 3: minor (deferred): tests/render/panelLayout.test.ts imports panel.ts (hence three) just for PANEL_MIN_ASPECT. Module purity is intact -- the constraint binds the module, not its test -- but moving the constant would keep the test pure too.`
`Task 3: report error (no action): the report states the dial row at 37.295 deg; the correct figure is 37.05 and the in-test comment has it right.`

**F4 — carried to Task 5:** there is no `heading` entry in `PANEL_SLOTS`, so `slotX('heading')`
throws. Task 5 draws the tape in the UPPER band across its width, not in a row slot, so it
must not call `slotX('heading')`. Carry into Task 5's dispatch.
`Task 3: fix round 1/5 (2 addressed, 0 open — R4 margin, R5 identity exclusion; commits 5b6ccaf..b593ab3)`
`Task 3: complete (commits 00e3238..b593ab3, review clean)`
Re-reviewer independently recomputed every figure (edge 40.893, row 35.49, block 39.065)
and confirmed the EDGE_W=0.07 mutation now fails the 1-degree bound while it would have
passed the old bare one. Also re-checked slot collision at the new gap: 7 mm clear.
**R6 — Ruling: the plan's post-Task-3 "stop and look at it" gate is DEFERRED to Task 8, not skipped.**

I built and served the bundle to take the screenshot, but the reference GPU desktop
(`ryzen`) is now unreachable — `No route to host`, and the Plan 5 Playwright server tunnel
on port 39001 died with it. Mark is at work, so the machine has almost certainly slept.
nexus is headless and Chromium over SSH gets no GPU, so there is no substitute host.

The gate's purpose is confirmation, not permission: Task 3's geometry is covered by the
vertical budget assertion, the horizontal margin assertion and the frustum test, each with
mutation evidence. Task 8 already captures screenshots and is the natural place to settle
it.

If wrong: a layout error invisible to the assertions survives until Task 8 instead of being
caught now — costing rework of the instruments built into it in Tasks 4–7, not of the
layout itself.

### Task 4
`Task 4: complete (commits b593ab3..9485eef, review clean — spec OK, quality approved, no findings)`
Reviewer's "⚠️ cannot verify: does panelLayout.test.ts re-assert the margin for the column
specifically" RESOLVED by the controller: the 1-degree assertion iterates PANEL_SLOTS, which
includes `throttle`, and the reviewer separately hand-verified every drawn element (bezel
+/-0.026, face 0.022, fill 0.022, ticks, numerals) sits inside the slot's widthM of 0.052.
Slot-level coverage plus containment is the whole property. Not a gap.

### Task 5
`Task 5: implementer DONE (commit 520bdd5, verify rc 0, 667 passed / 6 skipped). Review: spec OK, quality NEEDS FIXES — 1 Important, 5 Minor.`

Controller's standing concern about eroding the frustum guard was put to the reviewer
explicitly and ANSWERED: after excluding `p.backing` and `p.tape.strip`, the test still
measures five `dial:*` groups, `column:throttle`, `horizon`, `reticle`, `tape:index` and
`tape:readout`, and `expect(p.backing.children).toHaveLength(0)` stops the plate becoming a
hiding place. The 2026-09-13 regression shape (dial labels below the frustum edge) remains
fully covered. The exclusions do not cumulatively gut it.

**R7 — Ruling: fix the Important (doubled seam mark) AND narrow the strip exclusion, in one
round.**
The doubled mark is a genuine visual defect: `tickMarksFor`'s wrap-dedup short-circuit is
`dial && circular`, so the tape emits marks at BOTH 0 and 360, putting a tick and a numeral
at exactly the same x at each rose seam, coplanar at `Z_MARKS` — z-fighting ticks and two
identical "000" plates blended over each other. `tickMarksFor`'s own doc comment names this
hazard ("drawing both leaves a doubled tick at north") for dials; the tape reintroduced it.

I am ELEVATING the strip-exclusion narrowing out of Minor, against the usual rule that
minors never enter the loop. Reason: I commissioned scrutiny of the frustum guard's
integrity specifically, and the reviewer found the visible middle copy of the rose is
covered only transitively (its top edge sits ~4 mm above anything the test still measures).
The implementer is already in that file for the seam fix, so closing it costs one round
rather than a future one.
If wrong: a slightly narrower exclusion and one extra measured object. Trivially reversible.

`Task 5: minor (deferred): the "whole tape assembly inside the upper band" test compares a world-space Box3 against local-frame band bounds; correct only while root.matrixWorld is identity. Same latent fragility already recorded for Task 3.`
`Task 5: minor (deferred): GAUGES.find + stripW recomputed every frame in updatePanel; hoist to a module const.`
`Task 5: minor (deferred): no test asserts tape:index exists or that it is not a child of strip, though the brief made both fixed.`
`Task 5: minor (deferred): report records the unmutated Math.min(xs) as -1.8110 where the exact value is -1.8; the mutated value is exact and the conclusion holds.`
`Task 5: minor (deferred): tapeOffsetFor's ((x%360)+360)%360 is dead-by-usage and untested (the implementer honestly reported mutation 1 finding no failure). Brief-mandated, keep, but the comment should say so.`

**R8 — Ruling: the tape strip must be culled to its window. Fix round 2, CRITICAL, found by
the controller at deploy time and missed by both reviews.**
Measured against the real built geometry: the strip is 3.579 m wide and reaches **71.67 deg**
off boresight against a **40.89 deg** frame edge — a 30.78 deg overshoot on each side. There
are no clipping planes, no stencil and no mask anywhere in `panel.ts`. `TAPE_W = 0.30` is
named "the visible window" but nothing enforces it, so the entire compass rose renders
across the whole view, over sky and sea.

Both reviews touched this and neither caught it. Round 1's reviewer saw the strip excluded
from the frustum test and treated it as test scoping; round 2's implementer explicitly
recorded "even copy 0 alone is wider than that budget (an accepted, separate
characteristic)". That acceptance was wrong: being wider than the budget is not a
characteristic to accept, it is the defect. The exclusion was hiding it.

Fix: cull per frame — a mark is visible only when `|strip.position.x + markLocalX| <=
TAPE_W/2`. Smallest correct change, no renderer surgery, keeps the three-copy geometry that
makes the wrap seamless. The frustum test must then MEASURE the strip's visible children
instead of excluding the strip wholesale, which is what let this hide.
Better long-term design, deliberately NOT done in a fix round: draw the rose once into a
canvas texture on a single `TAPE_W`-wide plane and slide `texture.offset.x` with
`RepeatWrapping`. That is the classic tape instrument and needs no culling at all. Worth
raising at the final review.
If wrong: per-frame visibility toggling on ~108 objects, trivially cheap, and reversible.

**R9 — Ruling: drop `- stripW / 2` from the tape's build formula. Fix round 3, CRITICAL,
and the defect is MINE — it came from the plan's own snippet.**
The implementer flagged it after round 2 and I confirmed it independently against the built
geometry, recovering each mark's compass value from its stashed local x:

```
true heading   0  ->  under index: 180  (error -180 deg)
true heading 315  ->  under index: 140  (error -175 deg)
true heading 270  ->  under index:  90  (error -180 deg)
true heading 180  ->  under index:   0  (error -180 deg)
true heading  90  ->  under index: 270  (error -180 deg)
```

Cause: `x = (mark.fraction + copy) * stripW - stripW / 2` centres the THREE-COPY BLOCK's
extent on the origin, which is cosmetic, and in doing so displaces the rose by half a rose
— exactly 180 degrees. The slide `strip.position.x = -tapeOffsetFor(...) * stripW` assumes
fraction f sits at `f * stripW`, so the two disagree by `stripW / 2`.
Fix: `x = (mark.fraction + copy) * stripW`. Verified analytically for both ends — at
heading 0 the mark under the index becomes f=0 (value 0), at heading 90 it becomes f=0.25
(value 90). The strip's extent becomes asymmetric, `[-stripW, 2*stripW)`, which no longer
matters because R8's culling now decides visibility.
Process note: the plan's Step 5 test only asserted that the strip slides LEFT as heading
increases (`at(90) < at(0)`). That is true of a rose displaced by any constant, so it could
never have caught this. A test asserting the strip slides is not a test asserting it reads
correctly — the replacement must check WHICH VALUE sits under the index.
If wrong: one term, and the alignment test says so immediately.
`Task 5: fix round 1/5 (2 addressed — seam dedup, exclusion narrowing; commit 8ed9e44)`
`Task 5: fix round 2/5 (1 addressed — R8 culling + frustum test measures visible children; commit 25e64f1)`
`Task 5: fix round 3/5 (1 addressed — R9 antipodal fix + value-under-index test; commit 5938c9c)`
`Task 5: complete (commits 55db9cd..5938c9c, review clean — all 4 findings addressed, no new breakage)`
Controller independently verified alignment (0 deg error on-mark, 5 deg off-mark = half the
10 deg minorStep granularity floor) and culling (visible reach 12.5-14.0 deg vs 40.89 deg
frame edge) against the built geometry before accepting.
`Task 5: minor (deferred): the "hides the horizon bar behind the coaming" test still excludes p.tape.strip wholesale. Z-ordering check, unrelated to frustum/visibility; Task 7 retires the bar and may remove the test entirely.`

### Task 6
`Task 6: implementer DONE_WITH_CONCERNS (commit abdb8f6, verify rc 0, 673 passed). Flagged its own slot overflow rather than hiding it — correct behaviour, and the concern is real.`

**R10 — Ruling: the ball must draw nothing outside its bezel at any attitude, and the plan
gains a PER-SLOT containment assertion. Fix round 1.**
Confirmed independently in the panel's own frame (the root is rotated -90 deg about Y, so
panel-local x is world z — my first probe measured the wrong axis and reported a degenerate
box; the corrected figures):

```
attitude slot x: [0.0071, 0.1379]   fuel slot starts 0.1521
pitch   0 bank   0: x [-0.0235, 0.1685] overflow 0.0306 m, into fuel 0.0164 m
pitch   0 bank  45: x [-0.0633, 0.2083] overflow 0.0704 m, into fuel 0.0562 m
```

Cause, and it is MINE: the brief said the disc is "drawn oversized and clipped by the bezel
ring". Nothing clips it. `grep` confirms the renderer has no `localClippingEnabled`, no
`clippingPlanes`, no stencil anywhere. That sentence was aspirational in exactly the way
`TAPE_W = 0.30` "the visible window" was in Task 5.

**This is the THIRD instance of the same mistake in this plan** (tape strip, attitude ball,
and the backing plate — that one deliberate). The plan repeatedly assumed a clipping
facility this renderer does not have. Raise it at the final review as a plan-level lesson,
not three unrelated bugs.

Mechanism is the implementer's choice, because I have now twice prescribed geometry that
was wrong. I specify the PROPERTY and the TEST; they pick how.

Second half of the ruling: add a per-slot containment assertion covering EVERY drawn
instrument. The existing frustum test is a GLOBAL envelope dominated by the throttle and
armament edge blocks, so per-slot overflow is invisible to it — which is why this reached me
through a subagent's honesty rather than through the suite.
If wrong: the containment test is the load-bearing part and stands either way; only the
ball's drawing mechanism would be revisited.

**R6 UPDATE:** `ryzen` is reachable again and the Plan 5 Playwright server is still
LISTENING on 127.0.0.1:3000 (pid 8364). The deferred visual check is back on the table for
Task 8, which already owns screenshot capture. No separate catch-up pass needed — Task 8
will cover Tasks 3-7 in one look, which is a better check than a mid-plan glance would have
been.
`Task 6: fix round 1/5 (1 addressed — R10 circular-segment ball + per-slot containment suite; commits abdb8f6..1e9935e)`

**R11 — Ruling: widen `LOWER_H` from 0.172 to 0.188 so the declared band matches the drawn
geometry, and assert FULL containment for dials rather than horizontal-only. Fix round 2.**
The implementer's second concern is real. Measured: every dial's drawn extent is
[0.1264, 0.3254] below the eye against a declared lower band of [0.1394, 0.3114] — a uniform
14.0 mm overshoot past the band bottom. Nothing is visually broken (28.47 deg against a
30 deg frame edge), so this is a bookkeeping error in MY band arithmetic from Task 2: the
0.172 m allowance understates what a dial with its readout and label actually occupies.

The cost of leaving it is that Task 6's new containment suite had to assert horizontal-only
for dials — a weakened assertion carved out to accommodate a wrong constant, which is the
same shape as the exclusions that hid two Criticals in Task 5. Correct the constant, get a
uniform assertion.

0.188 chosen over the exact 0.186 for 2 mm of headroom. Band bottom becomes 0.3274 m =
28.62 deg, still 1.38 deg inside the frame edge, so the Task 2 vertical budget assertion
keeps passing.

**Probe error on my part, recorded so it is not mistaken for a finding:** my sweep initially
reported the drawn extent reaching 1.51 deg ABOVE the eye line. That is the horizon bar and
the gunsight reticle, both of which sit on the boresight BY DESIGN and are not band
instruments. My probe wrongly included them. Not a defect.
`Task 6: fix round 2/5 (1 addressed — LOWER_H corrected; commits 1e9935e..5526359)`

**R11 CORRECTED by the implementer, and they were right.** My value of 0.188 was insufficient.
The dial row is CENTRED in the band, so widening `LOWER_H` by d moves the row down by d/2
and the band bottom by d — buying only d/2 at the bottom, and the dials overshoot the TOP
by a similar 13 mm which I had not accounted for at all. Dial height is 0.199 against the
old 0.172 allowance. They re-derived 0.202 and watched the containment test fail at both
0.172 and 0.188 before landing on it. Recorded because it corrects a controller ruling.

`Task 6: thin margin (for final review): lowest drawn instrument now sits at 29.64 deg against the 30 deg frame edge -- 0.36 deg, about 4 mm. Accepted: the bottom IS the screen edge and the bezel deliberately runs past it, so instruments 0.36 deg inside are fully visible, and the containment assertion now fails if anything grows. Buying more would mean either eating the radar/armament reserve in the upper band or cutting HORIZON_KEEP_DEG from 3 to 2 deg, i.e. covering 1 more degree of sky. Not worth it now; flagged so the final review can disagree.`

**Probe error on my part (second time), recorded so it is not mistaken for a finding:** my
margin sweep reported a drawn instrument 0.48 deg ABOVE the eye line. That is the horizon
bar, which has no `.name`, so my name-based exclusion silently missed it — the exact
mistake I flagged in Task 3's review and then made twice myself. Exclude by IDENTITY. Not
a defect; Task 7 retires the bar anyway.
`Task 6: review (opus): spec OK, quality NEEDS FIXES — 3 Important, 5 Minor. Sign convention, containment-by-construction and the 0.202 derivation all independently confirmed correct.`

**R12 — Ruling: fix the two stale/inverted comments AND buy the vertical margin back from the
dial's own layout, not from the frame. Fix round 3.**
The reviewer is right to challenge my acceptance of 0.36 deg. R4 required a full 1 deg margin
on the HORIZONTAL axis and I rejected a 0.14 deg margin there as a guard pinning nothing —
then accepted 0.36 deg vertically an hour later under a bare `toBeLessThanOrEqual`. That is
inconsistent, and the reviewer identified where the slack actually is: the dial's readout and
label sit at +/-0.088 while the face with its bezel is only +/-0.065. The oversize is the
dial's own text offsets, not the frame. Reclaim there.
Items 1 and 2 are comment defects on the subtlest logic in the change — one says the ball is
oversized, rotated and clipped by the ring (all three false since fix round 1), the other
inverts the chord derivation that is the ONLY written justification for an unconditional
sky-on-left selection. A future reader "correcting" the code to match that comment
introduces a silent pi error. This project treats a false comment as a defect; these are
textbook.
I am also elevating Minors 4 and 5 out of the ledger: both are holes in the per-slot
containment suite, which IS this task's structural deliverable. The ring exactly saturates
the slot box, so the ball could grow 5.4 mm undetected; and the pitch sweep never reaches
the clamp at 37.5 deg, so the degenerate-segment path is unexercised.
If wrong: dial text sits a few mm closer to its face. Reversible by two constants.

`Task 6: minor (deferred): updatePanel rebuilds and triangulates two shapes every frame with no change detection, while citing setPlateText -- which does cache. Skip when roll/pitch are unchanged.`
`Task 6: minor (deferred): the heading tape gets no band containment assertion (no PANEL_SLOTS entry), so the suite comment's "every instrument" overstates coverage.`
`Task 6: minor (deferred): panel.attitude.ball.children cast as [Mesh, Mesh] in two places -- unchecked and order-dependent.`
`Task 6: fix round 3/5 (5 addressed, 0 open; commits 5526359..9bdc5cd)`
`Task 6: complete (commits 5938c9c..9bdc5cd, review clean — all 5 items addressed, no new breakage)`
Controller verified independently before accepting: lowest drawn instrument 28.77 deg,
margin 1.23 deg against the 30 deg frame edge, zero per-slot overflow across six attitudes
including 90 deg bank and +/-60 pitch.

### Task 7
`Task 7: implementer DONE (commit a0204ff, verify rc 0, 673 passed). Review (opus): spec OK, quality NEEDS FIXES — 2 Important, 3 Minor. The roll-sign comments MOVED onto the ball correctly, which was the task's headline risk.`

**R13 — Ruling: fix both Importants plus the two cheap Minors. Fix round 1.**
Important 1 is MY defect: the stale-reference gate I wrote into the dispatch was
`grep -ri horizon src/`, which excluded `tests/` — and `tests/` is exactly where the stale
reference survived ("like the horizon bar two tests above", in the reticle test). A gate
that checks only the directory you expect to be wrong is not a gate.

Important 2 is a real coverage hole the reviewer found by reading what the deletion LEFT
rather than what it removed. The implementer was right that an equality test against
`trueHorizonScreenHeight` would fail correct code — the ball's pitch term is a dial-scale
deflection, `-(pitchRad/(pi/6)) * DIAL_RADIUS * 0.8`, with no relation to
`PANEL_AHEAD_M * tan(pitch)`. But concluding "and none should be added" overreached: after
the deletion the ball's pitch MAGNITUDE is pinned by a single inequality
(`heightAt(20) < heightAt(-20)`), so a halved, doubled or saturating deflection passes the
whole suite. The reviewer supplied a replacement that asserts nothing false — local-frame
linearity below the clamp, and the deflection at the clamp — which is the right shape.
This is the same lesson as Task 5's tape: a test that an instrument MOVES is not a test
that it reads correctly.
If wrong: two comment edits and one test. Trivially reversible.

`Task 7: minor (deferred): none -- all three Minors folded into fix round 1, since this is the last implementation task and they are each one or two lines.`
`Task 7: fix round 1/5 (4 addressed, 0 open — stale tests/ reference, pitch-magnitude coverage, restored coaming assertion, two comment fixes; commits a0204ff..8ff248b)`
Mutation evidence: scale 0.8 -> 0.5 broke the magnitude test but NOT the linearity test,
confirming the pair is not redundant.
**OUTSTANDING: scoped re-review of a0204ff..8ff248b, then Task 7 complete. Then Task 8,
final whole-branch review, merge, deploy.**


## Continuation review — Codex, 2026-09-15

Task 7 scoped re-review of a0204ff..8ff248b: complete. The pitch tests read
actual chord vertices, pin both linearity and magnitude, and preserve the
world-projected roll comparison. The coaming check is restored and the
reticle depth comment agrees with the local +Z convention. No open blocker.
Baseline verified outside the sandbox: 675 passed / 6 skipped. Inside the
sandbox eight architecture subprocess checks failed; unrestricted verify passed.

Whole-branch review included every deferred/parked line above. One further
Important was confirmed in the production GPU capture: backing width based on
PANEL_MIN_ASPECT leaves 36 px of open sea at each side at 1600x1000. Fixed with
resizePanel at boot and on resize, scaling only the backing. Regression checks
3:2, 16:10, 16:9, 21:9 and return to 3:2; disabling scaling fails at 16:10
(projected left edge -0.954659 instead of beyond -1). Final production capture
confirms both edges covered. No instrument scale or simulation change.

Also corrected stale not-yet-built comments, EDGE_W's full-width label, the
pitch-clamp bank comment, and the lower-band scope description. Restored backing
coverage now includes visible tape marks rather than excluding the entire strip.

Accepted nonblocking follow-ups: angle-change caching for the ball, named sky/
ground references instead of ordered children, hoisting tape constants, explicit
band metadata on reserved slots, and a texture-based tape if profiling warrants
it. Existing small neutral-control fixtures and the band-overlap guard stay.
The two Box3 tests still intentionally measure unposed panel-local geometry;
future refactoring must make the coordinate frame explicit. Tape tick extents/
index containment can be strengthened beyond the current centre/readout checks.
No current visible overflow found in the captures or containment sweeps.

Final local verify: 676 passed / 6 skipped; typecheck, lint, depcruise green.
Build succeeds. No sim/, aircraft-spec, or golden changes.

Task 8 complete: production screenshots inspected at 16:10 and 3:2, chase view
captured, handoff/README/master table updated. Reference GPU suite: 20 passed
(exit 0); Leyte GPU p50/p95 2.294/2.359 ms over 510 samples.

All implementation and review gates complete. This ledger is archived in
docs/handoff/2026-09-15-cockpit-panel-review.md before SDD workspace cleanup.
