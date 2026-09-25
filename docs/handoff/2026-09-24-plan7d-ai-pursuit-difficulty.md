# Plan 7d handoff — AI pursuit difficulty

2026-09-24, executed via superpowers:subagent-driven-development in an
isolated worktree — an explicit, Mark-approved exception to this repo's own
"no worktrees, work in place on `main`" convention for this one plan
(`.claude/worktrees/ai-pursuit-difficulty`, branch
`worktree-ai-pursuit-difficulty`). Closes the gap Mark's own play found: "I
can't ever get behind that pilot," confirmed to persist even at the easiest
existing (`green`) skill preset. A `green`-skill pursuer is now genuinely
beatable by a human-equivalent scripted evasion.

## What landed

- `src/sim/ai/pilot.ts` — `PilotSkill` gained `controlNoise` (std-dev
  magnitude of deterministic jitter applied to the pilot's final roll/pitch/
  yaw), tuned to `VETERAN_SKILL: 0.02` / `GREEN_SKILL: 0.15` against real
  reference-GPU flight telemetry (veteran: monotonic turn-in, mean 0.185
  deg/500ms; green: sign-reversing wobble, mean 0.258, max 0.589).
  `PilotDecisionState` gained `observedTargetPosition`/
  `observedTargetVelocity` (the perceived-target snapshot) and `noiseCursor`
  (a plain-integer mulberry32 cursor, independent of
  `weapons/combat.ts`'s own `rngState`).
- `src/sim/ai/noise.ts` (new) — `applyControlNoise`, a pure function jittering
  final roll/pitch/yaw. Fixed six mulberry32 draws per call regardless of
  `controlNoise` magnitude, so cursor advance rate cannot depend on skill.
  Box-Muller with a zero-guard (`Math.max(u1, 1e-12)`) against the
  `Math.log(0)` edge case.
- `src/sim/ai/decision.ts` — `maneuverControls` now substitutes a "perceived"
  target (live entity with `state.position`/`state.velocity` replaced by the
  decision's snapshot) into every downstream producer — Pursue, Extend, and
  Break, including the firing gate (`hasGunSolution`) — then applies control
  noise to the final output. Self's own facts (fuel, damage) and
  `deriveFacts`/`decideManeuver`'s own safety overrides
  (`MIN_ENGAGEMENT_RANGE_M`, threat-astern) stay live; only the AI's
  perception of the *target* goes stale.
- `src/sim/loop.ts` — the existing rescore branch (`nowS >=
  decision.nextRescoreS`) now also captures the snapshot and threads the
  noise cursor; no change to rescore cadence itself.
- `src/render/spawn.ts` / `src/render/main.ts` — a fifth DEV-only query
  override, `?pilotSkill=green|veteran`, mirroring the four existing
  identical overrides (`?oceanTier=`, `?beaufort=`, `?cloudTier=`,
  `?timeOfDay=`). Needed because `content/scenarios/pursuit-range.json`
  actually pins `pursuer-1` to `veteran` — the brief this plan started from
  wrongly assumed it defaulted to `green` — and testing the acceptance claim
  against veteran would have defeated the whole point. Compiles out of
  production; inert for every other e2e spec loading `pursuit-range`.
- `tests/e2e/pursuitGeometry.ts` (new) — `isBehind`, extracted from the
  acceptance spec so it can be unit-tested (see "What the final review
  found," below).
- `tests/e2e/ai-pursuit-difficulty.spec.ts` (new) — the Tier 2 acceptance
  spec: a scripted hard-break-then-reversal against `?pilotSkill=green`
  gets behind `pursuer-1` (within 400 m, 45° of dead astern) inside a 40 s
  bounded window, and the player is confirmed alive when it does (a guard
  added at final review — see below).

## What the final whole-branch review found (all fixed, independently
re-reviewed)

The per-task reviews (5 tasks, all clean) missed one thing no scoped review
could catch, because it required actually deriving the app's own bearing
convention from its data source rather than trusting the new test's own
internal consistency:

**`isBehind()`'s geometry was exactly inverted.** It used `Math.atan2(dx,
dz)` for bearing where `src/render/main.ts:723` builds `headingRad` as
`Math.atan2(forward.x, -forward.z)` — the `z` sign was dropped — and checked
alignment-with-the-nose (`angleOff < withinDeg`) where "behind the tail"
needs opposition (`angleOff > 180 - withinDeg`). The two errors happen to
cancel near headings of 0 or π, but `pursuit-range` pins both aircraft to
due east (`headingDeg: 90`), the worst case, where they compound into an
exact inversion: the assertion fired precisely when the pursuer had the
player inside 400 m and 45° of its own nose — the tail-chase gun-solution
geometry this plan exists to let the player escape. **The original Task 5
"PASSED first attempt, 13.2 s" result was real, and meant the opposite of
what it was read as.**

Fixed by correcting the bearing convention and the front/back check, adding
a Tier 1 unit suite (`tests/render/pursuitGeometry.test.ts`, 5 cases,
including one that derives `headingRad` from the same quaternion
construction `scenario.ts`/`main.ts` actually use rather than hand-picking
radians — because the bug class is "a helper's convention silently
disagreeing with its data source," and the only real defense against that
class is deriving the check from the source, not asserting it in isolation).
The corrected acceptance spec was then **strengthened**, not just re-run:
the sim world freezes on player death (`src/render/frame.ts:617`), so a dead
player's last valid geometry could in principle satisfy `isBehind` forever;
the spec now also asserts `combat().player.destroyed === false` at the same
poll. Re-run twice on the reference GPU, genuinely passes both times (23.6 s,
gpu p95 ~1.6 ms, live player).

Four Important findings were fixed in the same pass: a `pilot.ts` doc
comment made false by this plan (claimed no buffered-observation mechanism
exists — perception staleness is exactly that); a test comment's stale "no
RNG in this gate" claim and stale tick-budget arithmetic (re-measured, not
just re-worded — first hit now lands at tick 525, not the old 7430, because
staleness+noise moved it onto the first firing pass instead of a post-rejoin
second one); and a missing Tier 1 test proving perception staleness holds
across a full `reactionS` window, not just at one instant (mutation-checked:
fails if the snapshot capture is hoisted out of `loop.ts`'s rescore branch).

## What the final review's fix wave found, and left as an open decision

Re-running the Tier 2 suite broadly (per the review's own instruction, not
just the corrected spec) surfaced a real, unplanned side effect:
**`tests/e2e/ai-maneuver.spec.ts` (Plan 7b's point-blank break-off gate) is
now red, and Task 4's original diagnosis for it (rAF throttling under fast
`.poll()` traffic) is disproven.** Applying that spec's own suggested
mitigation reproduced byte-identical failure numbers — a real throttling
artifact could not survive a 1000× cadence drop unchanged. The real cause:
the veteran pursuer now kills a passive player at tick 517 (8.6 s, 386 m),
before the point-blank range that spec gates is ever reached; the world then
legitimately freezes on death. Control evidence: the same Tier 1 scenario's
first-hit tick moved from 7430 to 525 on this branch, and the spec passes
against the pre-7d `main` route (caveat: `main` also carries the Wildcat
default-aircraft work, so not a perfectly clean control).

**This was deliberately left unfixed.** Making it green requires either
re-tuning veteran lethality or changing that spec's passive-player design —
a gameplay-balance call, not a test-mechanics one, and outside this plan's
mandate (Plan 7d's own acceptance bar is green-skill beatability, which is
independently met). `tests/e2e/radar.spec.ts` also failed twice on an
apparently pre-existing, flaky `gpu.length > 120` sample floor (112/117/169
across three runs, every content assertion passing every run); not modified,
for the same reason — it isn't this plan's budget to retune, and nothing in
this branch touches the render/sampling path it measures.

**Both are Mark's call, not decided here.**

## Tier 1 evidence

```
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=0` — typecheck, ESLint (zero warnings), dependency-cruiser, and
vitest all clean. 140 test files, 1,463 tests passed, 14 skipped (pre-
existing, unrelated). Golden-trajectory suite (bit-identical determinism)
confirmed unchanged by actually running it, not assumed.

## Reference-GPU evidence

```
PW_REMOTE=ws://localhost:39001/ \
PW_BASE_URL=https://ww2airsim-wt.windomlane.org \
npm run test:tier2 -- tests/e2e/ai-pursuit-difficulty.spec.ts tests/e2e/ai-maneuver.spec.ts tests/e2e/radar.spec.ts tests/e2e/meta-game.spec.ts tests/e2e/ai-pursuit.spec.ts
```

Run against this plan's own second reference-GPU dev route (a new Traefik
file + DNS record, mirroring the existing `ww2airsim-dev.yml` route exactly,
stood up because this plan executed in a worktree the main dev route
doesn't serve — see "Infra," below).

| Spec | Result |
| --- | --- |
| `ai-pursuit-difficulty.spec.ts` | **PASS**, 23.6 s, gpu p95 1.616 ms / 1980 samples, player confirmed alive |
| `ai-pursuit.spec.ts` | PASS, 11.9 s, gpu p95 1.109 ms / 912 samples |
| `meta-game.spec.ts` | PASS |
| `ai-maneuver.spec.ts` | **FAIL** — real, see above; not this plan's to fix |
| `radar.spec.ts` | **FAIL** — flaky pre-existing sample floor, see above; not this plan's to fix |

## Infra: a second reference-GPU dev route

This worktree needed its own Tier 2 route since the existing one
(`ww2airsim.windomlane.org`) serves the `main` checkout, not a worktree.
Stood up (Mark's explicit choice among three presented options): a new
UniFi DNS A record (`ww2airsim-wt.windomlane.org`), a new `vps-local`
Traefik file (`shared/traefik/dynamic/ww2airsim-worktree-dev.yml`, mirroring
`ww2airsim-dev.yml`'s two-router pattern, no Cloudflare change needed), and
a local, **never-committed** `vite.config.ts` override in this worktree
(port 5173→5174, `TUNNEL_HOST`→`ww2airsim-wt.windomlane.org`). Cleanup,
once this worktree is deleted: kill the backgrounded worktree Vite process,
confirm `vite.config.ts` reverts with the worktree, and ask Mark whether to
keep the DNS record + Traefik file for reuse by a future worktree (default:
keep, per the Traefik file's own header) or remove both. Full detail in this
plan's SDD ledger (`.superpowers/sdd/2026-09-24-ai-pursuit-difficulty/
progress.md`, gitignored).

## Design boundary (unchanged from 7a/7b)

`leadPursuitVelocity`'s intercept math, `hasGunSolution`'s gun-cone gate,
`gunneryAccuracy`'s effect, `energyDiscipline`, and `disengageThreshold` were
explicitly out of scope and confirmed untouched by the diff. Lag pursuit,
barrel-roll defence, split-S, scissors, attack run, bomber formation
station-keeping, formation keeping, landing AI and multi-pilot teams remain
Plan 7c's territory.

## Remaining work

- **`ai-maneuver.spec.ts`'s new redness needs Mark's ruling**: re-tune
  veteran lethality, change that spec's player behavior, or accept it red
  until Plan 7c/a later slice addresses it.
- **`radar.spec.ts`'s flaky sample floor** — separately, lower urgency; not
  an AI-behavior regression.
- Plan 7c: the rest of the maneuver library, formation/team coordination,
  landing AI — unchanged from 7a/7b's own deferred list.
- Not pushed, not deployed, not merged — all Mark's call, separately, per
  this repo's own convention.
