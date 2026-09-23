# Plan 6b, strike slice — 2026-09-22

The second slice of [Plan 6](../superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps)
(master spec §5 "Guns" and "Damage", §15 row 6). Design:
[strike design](../superpowers/specs/2026-09-20-strike-design.md); plan:
[strike plan](../superpowers/plans/2026-09-22-strike.md). Tasks 1-10 (sim,
render, content, audio) landed on `main` across ten prior commits. This
document is Task 11's: headless integration, verification, and this handoff.
**It does not close Plan 6b.** Nothing was pushed or deployed.

## Tier 2 acceptance has NOT been run yet — read this first

`tests/e2e/strike.spec.ts` was written this session but **never executed**.
ryzen (the Windows desktop that hosts the reference RX 6700 XT and normally
runs `playwright run-server`) had no interactive desktop session for the
server to attach to during this pass — the machine is powered on, but nobody
was logged into its console, so there was no display/GPU for Chromium to get.
Mark was asked and chose to defer Tier 2 to whenever he is next at that
desktop, rather than have this pass attempt a GPU run with nothing to render
to.

**Nothing below is a Tier 2 number.** No screenshot has been taken, no GPU
frame time has been measured for the strike slice, no bomb has actually been
watched falling on the maru, no hangar has actually been watched collapsing.
Every figure in this document that looks like a measurement is a Tier 1
(Node/vitest) one, and is labeled as such.

### Running it, once ryzen has an interactive session

From nexus:

```sh
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/   # must print 200; else npm run dev:lan first
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2 -- tests/e2e/strike.spec.ts
```

Read every screenshot with the Read tool before believing anything passed —
`test-results/` is wiped on every Playwright run, so copy the PNGs out first
if they need to survive past that (the 16b handoff's own lesson). The
screenshot paths the spec writes: `strike-stores-chase.png`,
`strike-stores-cockpit.png`, `strike-maru-fireball.png`,
`strike-dulag-hangar-razed.png`.

**If the bombing-run case misses the maru**, that is the known risk flagged
in the spec file's own header comment: the maru's hull is only ±7.9 m wide
across the bombing run's line of flight (its 15.8 m beam, heading 0 putting
the 112 m length north-south instead), and the release trigger's accuracy
depends on real Chromium frame timing over the SSH tunnel, which this session
could not measure. Retune `BOMB_LEVEL_RANGE_M`'s spawn offset or the release
trigger in `tests/e2e/strike.spec.ts` before assuming the strike code itself
is broken — the underlying ballistics are proven deterministic at Tier 1 (see
below). The Dulag rocket case targets a much larger box (±17 m × ±21 m) and
carries less of this risk. Once a real run produces genuine numbers, replace
this whole section and the "measured" table below with them, and only then
run `tools/mail-doc.py` on this file — it was deliberately NOT emailed this
session, since it is not the final document Plan 6b's close needs.

## What Tier 1 actually proved (this session, `npm run verify`, rc=0)

```
> ww2airsim@1.0.0 verify
> npm run typecheck && npm run lint && npm run depcruise && npm test

✔ typecheck: clean
✔ lint: 0 warnings (src tests tools spike)
✔ depcruise: no dependency violations found (123 modules, 354 dependencies cruised)
✔ test (vitest): 126 test files, 1304 tests passed, 1 pre-existing skip
```

`tests/e2e/strike.spec.ts` is **not** part of that count: `vitest.config.ts`
scopes `test.include` to `tests/**/*.test.ts`, and Playwright specs are
`tests/e2e/*.spec.ts`, so `npm test` never collects them — confirmed by
reading the config, not inferred. `package.json`'s `test:tier2` script
(`playwright test`) is the only thing that runs them, and nothing in `verify`
calls it. This is the same separation `gunnery.spec.ts` and every other Tier 2
file already rely on.

`tests/sim/strike.test.ts` alone: **22 tests, all passing** — release rules
(one bomb or one rocket pair per press, left-then-right bomb order, outermost
rocket pair, a 2 m/s ground-roll floor, one PRNG cone draw per release),
ordnance flight (the bomb and rocket closed forms), detonation (nearest
contact across ground/structure/hull/aircraft, blast falloff, arm delay, the
direct target excluded from its own blast), structures (destroy-once,
`roundDamage` from strafing, `enemyAirfields`-gated RAZED counting), ships
(the fire-fraction curve below half hull, the 90 s sink), and determinism (an
identical soak run twice, a save/clone continued identically through a
release-detonation-sink).

### The bomb-drag calibration (spec §2.1's own number, corrected)

`content/aircraft/f6f-hellcat.json`'s `source` note for `an-m65` originally
estimated "about 1,200 m downrange and roughly 200 m/s" for a release at
120 m/s from 1,500 m, written without running it. `tests/sim/strike.test.ts`
("lands a 1,500 m release at the range and speed the shipped drag actually
gives") is where Plan 6b said that figure would actually be measured, and it
now is, at `an-m65`'s shipped `dragPerM` of 2e-5:

| Predicted (spec §2.1, unrun) | Measured (Tier 1, this run) |
| --- | --- |
| ~1,200 m downrange | **2,066.5 m** downrange |
| ~200 m/s at the water | **202.9 m/s** at the water |
| — | **17.67 s** of fall (tick 1060 at 60 Hz) |

The speed estimate held; the range estimate was roughly 1.7x low. The content
file's `source` string already carries this correction (Task 6), not just
this handoff.

### Rocket burnout (`hvar`)

Launched at 120 m/s (typical release speed), the closed-form burn alone
(`burnedVelocity`, no drag) reaches exactly launch + `burnDeltaVMps`
(419 m/s) = **539 m/s** within 1%, matching the source's 1,375 ft/s figure.
With the shipped `hvar` drag applied, burnout speed is measurably lower than
539 m/s but no more than 20 m/s lower (the test's own bound: `>` 519 m/s,
`<` 539 m/s) — "a real but modest slice," in the test's own words. No single
number is pinned tighter than that bound at Tier 1; a Tier 2 run does not add
precision here either (`gpuFrameTimesMs`/`aircraftPositionM` do not expose
projectile velocity), so this bound is likely the permanent record for this
figure.

### Determinism, not accuracy — what the bombing run's design leans on

`tests/sim/strike.test.ts`'s "flies a bomb on the round closed form" case
proves a released bomb's flight is **exactly** reproducible from its release
position and velocity (`toBeCloseTo(..., 9)` against the reference closed
form, no dispersion applied) — unlike rockets and guns, which draw one PRNG
cone per release. `strike.spec.ts`'s bombing-run case is built on that fact:
it triggers the release off the aircraft's live simulated position
(`page.waitForFunction`, not a fixed delay) specifically so the only error
source at Tier 2 is release-timing jitter, not trajectory randomness the
simulation itself does not have.

## What the pilot gets (per the design; visually unverified this session)

- On the title screen, a loadout picker: **clean, bombs, rockets, both**
  (default both), landed Task 9. Chosen loadout carries into
  `worldFromScenario` and every Restart uses the same choice.
- **V drops one 1,000 lb bomb per press, edge-triggered. E fires one pair of
  5-inch HVAR rockets per press**, also edge-triggered — neither can be held
  to repeat. Stores hang under the wings until released and are gone from the
  airframe once fired (Task 8).
- `?scenario=strike-range`: parked at Tacloban, a Japanese Wartime Standard
  Type B cargo ship (`maru-1`, 240 hull HP) anchored ~6 km east of Dulag over
  water, and Dulag itself enemy-held (`enemyAirfields`) — its three hangars
  and tower are legitimate targets.
- Ships take damage, burn (a fire fraction that rises below half hull) and
  sink over 90 s once destroyed. Buildings take damage and collapse once at
  zero HP, staying rubble; a Restart un-collapses them (Task 8's own fix
  round). The readout adds `SUNK` and `RAZED` beside `KILLS`, and a
  `B n  R n` stores segment while any are carried (Task 9).
- A release thump and a synthesized rocket-whoosh cue, edge-triggered off
  cumulative release counts (Task 10).

All of the above is Tier 1-verified (the mechanism exists and behaves
correctly in isolation) and NOT Tier 2-verified (nobody has watched it happen
in the shipped app). Treat every sentence in this section as "should be true
in the browser," not "was seen in the browser."

## §15 and README

§15 row 6 now reads the strike slice as landed alongside the gunnery slice,
**still "in progress"**: structural-overload damage and AI remain, matching
the design doc's own scoping (torpedoes wait for a second airframe; the F6F
never carried one in service). The README gets one new paragraph pointing at
§15 and this handoff, in the style of every prior plan's paragraph, without
restating the order or the numbers here.

## Remaining Plan 6 scope

Unchanged from the design: torpedoes (wait for a second airframe), and
structural-overload damage. AI pilots are Plan 7. Beyond the slice itself,
**Tier 2 acceptance for this slice is the immediate remaining item** — see
the top of this document.

## The flying queue

Mark has not flown any of Plan 6b's predecessors yet either: the Plan 6
gunnery slice (2026-09-19), the title screen (2026-09-19), or 16c's movable
sun (closed 2026-09-19, not pushed/deployed, `?timeOfDay=17` is the sunset).
This strike slice joins that queue rather than needing to be flown in
isolation — nothing here should be read as more urgent than the rest of it.
