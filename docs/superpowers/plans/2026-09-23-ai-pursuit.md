# AI pursuit implementation plan

> **For agents:** Execute in order. Keep
> `.superpowers/sdd/2026-09-23-ai-pursuit/progress.md` current after every task.
> Run the named focused tests before each task commit.

**Goal:** Deliver Plan 7a: a deterministic AI pilot that turns a desired
velocity into player-identical controls, flies lead pursuit and attacks in a
real airborne scenario.

**Architecture:** Put pure control and pursuit logic in `src/sim/ai/`. Store an
optional static pilot assignment on an aircraft entity. At the start of every
fixed tick, derive every AI command from the same aircraft snapshot before any
entity steps. Add a strict airborne scenario start variant and a pursuit-range
scenario; do not add privileged motion or render-owned AI state.

**Tech stack:** TypeScript, Zod, Vitest, Three.js production client, Playwright
Tier 2 against the reference GPU.

---

## Task 1: Desired-velocity flight controller

**Files:**
- Create: `src/sim/ai/controller.ts`
- Create: `tests/sim/ai/controller.test.ts`

1. Write failing tests for directional command signs, body-rate damping,
   throttle response, finite zero-vector handling and output bounds.
2. Implement the pure proportional-derivative attitude controller and throttle
   controller.
3. Run `npx vitest run tests/sim/ai/controller.test.ts`.
4. Record the command and result in the execution ledger.

## Task 2: Pursuit pilot and fixed-tick world integration

**Files:**
- Create: `src/sim/ai/pursuit.ts`
- Modify: `src/sim/loop.ts`
- Create: `tests/sim/ai/pursuit.test.ts`
- Modify: `tests/sim/entities.test.ts`

1. Write failing tests for bounded target lead, gun range/cone gating and an
   ordinary `Controls` result.
2. Add the static target assignment to aircraft entities and reject missing or
   self targets in `createWorldOf`.
3. Before stepping aircraft on each fixed tick, compute every assigned pilot's
   command from one start-of-tick snapshot. Skip impacted and destroyed pilots.
4. Add production-path tests proving per-tick recomputation, player-seat AI,
   array-order independence and structured-clone determinism.
5. Run the two focused suites and update the ledger.

## Task 3: Airborne content and pursuit range

**Files:**
- Modify: `src/sim/scenario.ts`
- Modify: `src/render/scenarioLoad.ts`
- Modify: `tools/content/load.ts`
- Create: `content/scenarios/pursuit-range.json`
- Modify: `tests/sim/scenario.test.ts`
- Modify: `tests/render/scenarioLoad.test.ts`
- Modify: `tests/build/dist.test.ts`

1. Add strict parked and airborne aircraft-start alternatives. Build airborne
   state from compass heading and speed with gear retracted.
2. Parse optional pilot target assignments and reject targets absent from the
   same scenario or targeting self.
3. Make both content loaders collect airfields only for parked airfield starts.
4. Add the two-aircraft pursuit range and prove its exact initial state,
   assignment and browser/Node bundle parity.
5. Run the focused scenario, loader and build suites; update the ledger.

## Task 4: Tier 1 regression gate

**Files:**
- Modify only implementation/tests needed by failures

1. Run `npm run verify; rc=$?; echo rc=$rc` and capture the exit code directly.
2. Repair only regressions attributable to this slice. Do not update unrelated
   goldens or accept unexplained trajectory drift.
3. Re-run the full gate to exit 0 and record exact totals in the ledger.

## Task 5: Reference-GPU acceptance

**Files:**
- Create: `tests/tier2/ai-pursuit.spec.ts`
- Modify diagnostics only if production observation genuinely requires it

1. Use the served checkout and reference GPU to boot `pursuit-range`.
2. Prove the assigned pilot changes attitude/position through production
   controls and emits at least one gun shot while pursuing.
3. Assert zero WebGPU validation errors and the existing render-time budget.
4. Run the focused Tier 2 spec to exit 0 and record evidence in the ledger.

## Task 6: Close Plan 7a

**Files:**
- Create: `docs/handoff/2026-09-23-plan7a-ai-pursuit.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`
- Modify: `README.md`
- Modify: `.superpowers/sdd/2026-09-23-ai-pursuit/progress.md`

1. Write the dated handoff with behavior, design boundary, Tier 1 totals, Tier 2
   evidence, commits and the remaining Plan 7b/7c work.
2. Update master §15 and the README with Plan 7a status and the next AI slice.
3. Email the completed handoff once as HTML with `tools/mail-doc.py`.
4. Re-diff `HEAD`, confirm no unrelated changes, and commit the completion.
5. Do not push or deploy unless the user explicitly requests it.
