# Structural-overload implementation plan

> **For agents:** Execute in order. Keep `.superpowers/sdd/2026-09-23-structural-overload/progress.md`
> current after every task. Run the named focused tests before each task commit.

**Goal:** Complete Plan 6's currently implementable damage work by making the
aircraft's existing G and dive-speed limits cause deterministic structural
damage, with player warnings and production diagnostics.

**Architecture:** Derive proper load and wind-relative airspeed from consecutive
fixed-tick aircraft states after flight integration. Apply a pure overload
damage reducer at the start of `stepCombat`, store current and peak telemetry on
`AircraftCombat`, and expose it through the existing combat readout and DEV
diagnostics. Do not change the flight model or aircraft content values.

**Tech stack:** TypeScript, Vitest, Three.js production client, Playwright Tier 2
against the reference GPU.

---

## Task 1: Pure structural-stress measurement

**Files:**
- Create: `src/sim/damage/overload.ts`
- Create: `tests/sim/damage/overload.test.ts`

1. Write failing tests for 1 g steady motion, 0 g ballistic motion,
   wind-relative airspeed, exact-limit flags and peak preservation.
2. Add immutable `StructuralStress` and a pure measurement function accepting
   previous/current state, wind, limits, `dt` and the previous telemetry.
3. Run `npx vitest run tests/sim/damage/overload.test.ts`.
4. Record the command and result in the execution ledger.

## Task 2: Pure overload damage and production combat integration

**Files:**
- Modify: `src/sim/damage/overload.ts`
- Modify: `src/sim/weapons/combat.ts`
- Modify: `src/sim/loop.ts`
- Modify: `tests/sim/damage/overload.test.ts`
- Modify: `tests/sim/weapons/combat.test.ts`

1. Write failing reducer tests for no damage at/below a limit, the continuous
   excess rate, additive G and speed excess, destruction metadata and stable
   already-destroyed state.
2. Implement the pure reducer against the existing normalized `Damage` record.
3. Add stress telemetry to `AircraftCombat` and initialize it in `createCombat`.
4. Pass previous aircraft states into `stepCombat`. Before release and gun
   handling, measure every aircraft and apply overload to live, uncrashed ones.
5. Add production-path tests for wind, crash exclusion, no kill credit,
   same-tick weapon refusal and deterministic cloned state.
6. Run the two focused suites and update the ledger.

## Task 3: Readout and DEV diagnostics

**Files:**
- Modify: `src/render/combatReadout.ts`
- Modify: `tests/render/combatReadout.test.ts`
- Modify diagnostics type/call sites found by the compiler as required

1. Write failing tests for `OVER-G` and `OVERSPEED` readout labels and diagnostic
   current/peak values.
2. Render limit warnings only while their corresponding flags are true. Keep
   existing ammo, stores, hit, kill and structure output intact.
3. Expose current load factor, airspeed, flags and peaks on player combat
   diagnostics.
4. Run the focused render suite and `npm run typecheck`; update the ledger.

## Task 4: Tier 1 regression gate

**Files:**
- Modify only implementation/tests needed by failures

1. Run `npm run verify; rc=$?; echo rc=$rc` and capture the exit code directly.
2. Repair only regressions attributable to this slice. Do not update unrelated
   goldens or accept unexplained drift.
3. Re-run the full gate to exit 0 and record exact totals in the ledger.

## Task 5: Reference-GPU acceptance

**Files:**
- Create or modify: `tests/tier2/structural-overload.spec.ts`
- Modify support code only if a production diagnostic is genuinely missing

1. Use the served checkout and reference GPU. Start high, enter a dive and
   pull out using production controls.
2. Prove a live limit flag, falling structure, pause freeze and restart reset
   from production diagnostics.
3. Assert zero WebGL validation errors and the existing render-time budget.
4. Run the focused Tier 2 spec to exit 0 and record the evidence in the ledger.

## Task 6: Close Plan 6c

**Files:**
- Create: `docs/handoff/2026-09-23-plan6c-structural-overload.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`
- Modify: `README.md`
- Modify: `.superpowers/sdd/2026-09-23-structural-overload/progress.md`

1. Write the dated handoff with behavior, design boundary, Tier 1 totals, Tier 2
   commands/evidence, commits and remaining Plan 6 torpedo dependency.
2. Update master §15: mark structural-overload complete, leave torpedoes deferred
   for a second airframe, and make Plan 7 AI the next implementable phase.
3. Add the concise README status paragraph.
4. Email the completed handoff once as HTML with `tools/mail-doc.py`.
5. Re-diff `HEAD`, confirm no unrelated changes, and commit the completion.
6. Do not push or deploy unless the user explicitly requests it.

