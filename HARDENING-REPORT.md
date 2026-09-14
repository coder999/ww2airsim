# Plan 3 hardening — handoff

Branched from the Plan 3 merge `0873ca0`. **Deliberately short, and it does not
restate figures that live elsewhere**: every measurement is recorded next to the
assertion that depends on it, so there is one copy of each and it rots with its
test rather than in here. The first version of this file was a 300-line
restatement; review's "delete rather than preserve, point instead of restating"
applies to it as much as to any doc.

Where the durable record lives:

- design-doc items 2, 3 and 4 — `docs/superpowers/specs/2026-09-13-assists-design.md`,
  marked CLOSED in place with what was done and measured. Item 1 untouched.
- the property sweep's space, runtime, coverage and four discrimination
  measurements — the header and floors of `tests/assists/authoritySweep.test.ts`.
- the soak arm's floors, seeds and mutation results — `tests/sim/soak.test.ts`.
- the probe race, measured both ways — `cruiseWithProbes` in
  `tests/architecture/boundary.test.ts`.

## Status

All five tasks done; design item 1 (altitude hold in the stalled band with the
limiter off) deliberately untouched. `npm run verify` exits 0. Golden passes
**unregenerated**; `golden:regen` never run and the golden JSON is untouched.

| Commit | What |
| --- | --- |
| `3510f99` | design items 3 and 2: the pitch budget is a true claim for every input and every stage |
| `cae3feb` | the committed property sweep, total over alpha |
| `461559b` | the soak's assists arm |
| `721bf6b` | architecture probes cruise a per-test temp root |
| _this_ | review round: NaN actually drawn, the conflict rule pinned, four claims corrected |

## The two decisions worth reading

**Design item 2 was fixed by clamping the input, not by widening the claim.**
Widening is unavailable without giving up "the budget never leaves the pilot's
legal range" — a budget that must contain 5 is not inside [-1, 1] — and that is
the property the whole arbitration rests on. Clamping is behaviour-preserving,
not merely defensible: `commandedBodyRates` already put every channel through
the same `clampFinite(n, -1, 1)`, and `tests/assists/index.test.ts` asserts
`step()` reaches an identical state either way. The gates that read the pilot's
*literal* command keep seeing the unsanitised value, because NaN is a malformed
input event, not a centred stick.

**The soak arm is a parameter on `runSoak`, not a second harness.** `tools/` is
not `sim/`, so the named `sim-must-not-import-assists` rule does not apply; a
second runner would have had to copy the 60×60 loop, the water check, the
chaotic injection and the replay machinery, and the copies would have diverged
on the first change to the input distribution.

## What this round changed

1. **The sweep never drew NaN or −Infinity** — it indexed the illegal values by
   draw index against one fixed set of 48 draws, so four illegal draws existed
   in the whole run. Now: draws are re-drawn per alpha (8,496 independent draws
   rather than 48), illegal values cycle on a counter of illegal draws, and the
   test asserts a floor **per value**, since the healthy-looking total of 708
   was what hid a NaN count of zero. The NaN-only clamp hole review demonstrated
   now fails the sweep; it still does not fail the soak arm (the limiter
   re-clamps), and that is stated in the sweep header rather than glossed.
   A false comment about illegal draws "overlapping" centred ones is deleted —
   the conditional beneath it made overlap impossible.
2. **The conflict rule is pinned from both sides.** `lower`, `upper` and the
   midpoint each left the whole suite green; all three now fail exactly one new
   test, which measures the limiter's bound *through the shipped stage* rather
   than re-deriving it. Both directions are needed: an incoming budget above the
   bound cannot discriminate `upper`, one below it cannot discriminate `lower`.
3. **Four claims corrected**, all of them the class this project treats as
   defects equal to bugs:
   - clause 1 of the sweep (`lower <= upper`) is a **forward tripwire, not a
     discriminator** — no mutation of the stages can break it now that
     `narrowAuthority` guarantees it. Labelled as such in the header.
   - `withinAuthority` on an empty budget returns **`upper` for every input**,
     not "upper or lower depending on which side the value came from". Corrected
     in `index.ts`, in the design doc and here. The substantive objection
     survives in a better form: the answer would come from the order of a `min`
     and a `max`, not from a decision anybody wrote down.
   - reverting the input clamp fires clauses 3 and 5 and the legal-range check,
     **not clause 4** (the departed budget is `narrowToCommand`'d, which
     clamps). It also does **not** fail the soak arm on its own — the earlier
     7-guard run had *both* source fixes reverted, and it is the combination
     that reaches the soak.
   - the sweep's realised centred/illegal draw rates are measured, not the two
     gate constants, because a centred draw shadows an illegal one.
4. **`narrowAuthority`'s opening sentence** ("cannot widen") is qualified where
   the rule is defined: on the conflict branch the published budget is *not* a
   subset of the incoming one. Inherent — honouring both is impossible — but it
   means the invariant callers may rely on is "non-empty, and the command is
   inside it", not "each budget is a subset of the last".

## Concerns

1. **The sweep is not a guard against design item 1.** With the limiter off,
   altitude hold's full nose-up across the 15.5–90 degree band sits *inside* the
   published budget, so a total invariant passes. Closing item 1 is still a
   behaviour decision at the controls, and no test now covers it.
2. **The conflict rule is a decision nobody has had to make in anger.** It is
   unreachable today, documented and now pinned, but the day a second narrowing
   stage exists it is the first line to re-read — including its caveat that the
   published budget stops being a subset of the incoming one.
3. **The two soak arms sample different input distributions** (the assisted arm
   releases the stick on 25% of seconds; the unassisted one never does). That is
   the only way to reach altitude hold's exact-zero gate, and it keeps the
   unassisted arm bit-identical so its weathercock history stays checkable — but
   the arms' step and completion counts are not comparable and should not later
   be "fixed" to match.
4. **`stallLimiter` is exported** solely so its authority contract can be
   asserted directly; `runStack` is its only production caller. If that changes,
   the doc comment saying otherwise is what to correct.
5. **The architecture file copies `src/` seven times per run** (~1 s per cruise).
   If `src/` grows, that is the first place to feel it; a single per-file root
   would halve it at the cost of reintroducing shared state between tests.
6. **Nothing in the files I touched failed to reproduce**, including the soak's
   three pre-existing floors (identical to the digit before and after).
