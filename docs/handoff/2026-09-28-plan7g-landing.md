# Plan 7g handoff: landing AI

Dated 2026-09-28. Branch `worktree-ai-7g-landing`, rebased onto `main` at
`6c5fdfd` (the branch was unpushed, so the rebase was safe) and pushed; **not
merged** (Mark's call). Design:
[2026-09-27-ai-7g-landing-design.md](../superpowers/specs/2026-09-27-ai-7g-landing-design.md)
(amends [7c-7g design](../superpowers/specs/2026-09-25-ai-7c-design.md) §6).
Plan: [2026-09-28-ai-7g-landing.md](../superpowers/plans/2026-09-28-ai-7g-landing.md).
Ledger: `.superpowers/sdd/2026-09-28-ai-7g-landing/progress.md` (gitignored;
rulings P1 to P29). Master spec §15 holds the status. Mark's viewing
checkpoint: final product only; the run was unattended.

Every figure below was measured on 2026-09-28. Tier 1 numbers come from
production `advance` on node with real Leyte terrain; the Tier 2 numbers come
from the reference GPU (RX 6700 XT) through dev slot `ww2airsim-2`.

## 1. What shipped

An AI pilot with a `home` (a runway airfield or a carrier) returns to it when
it is out of ammunition, damaged, low on fuel, or has had no contact for 30 s.
It flies a transit to the initial point, holds, joins, configures, flies final
under the LSO's rules, goes around when the capture window fails, lands, and
is respotted on a park spot clear of the landing area three seconds later.
Arrivals at one home start their approaches in id order, at least 60 s apart.
Wingmen go home in formation with their leader and peel off at the initial
point.

| Piece | Where |
| --- | --- |
| Approach autopilot promoted from `tools/` into the sim, with three optional profile fields | `src/sim/ai/approach.ts` (`tools/autopilot/approach.ts` re-exports it) |
| Return-to-base decision, phase machine (`transit`, `hold`, `join`, `configure`, `final`, `go-around`, `rollout`, `landed`), interval, capture window, respot | `src/sim/ai/recovery.ts` |
| Deck and runway park spots, pure geometry | `src/sim/ai/parkSpots.ts` |
| `pilot.home` in scenario content, validated and resolved to plain data at build | `src/sim/scenario.ts` |
| Ground state instead of the `parked` spawn flag (closes the 7f open item) | `src/sim/ai/airborne.ts`, `targeting.ts`, `autoPursuit.ts` |
| `recovery` phase in `__ww2.aircraft()` | `src/render/main.ts`, `src/render/diagnostics.ts` |
| Dev scenario, "Recovery (dev)" on the title screen | `content/scenarios/recovery-range.json` |

`loop.ts` is not edited. The three landing snapshot tests
(`landing`, `carrierLanding`, `tools/approach`) are bit-identical to `main`.

## 2. Measured numbers

| Quantity | Measured |
| --- | --- |
| Carrier trap, from the stern (Task 7) | 75.5 m; sink 1.76 m/s; 0.02 m off the deck aim |
| Runway landing at Tacloban (Task 7) | 492 m in; sink 1.36 m/s; 0.19 m off the aim |
| Interval, `cv-1`, two aircraft (Task 8) | joins at 27.15 s and 293.55 s; lands at 245.9 s and 521.15 s |
| Interval, Tacloban, two aircraft (Task 8) | joins at 25.48 s and 290.13 s; lands at 219.12 s and 491.72 s |
| Both array orders (Task 8) | identical results |
| `recovery-range`, `ai-tac` (Task 9) | lands 393.15 s; respot 396.15 s; rests 0.03 m from its park spot |
| `recovery-range`, `ai-cv` (Task 9) | lands 404.72 s; respot 407.7 s; rests 0.13 m from its deck spot |
| Reference GPU, `ai-tac` / `ai-cv` landing (Task 10, two runs) | 392.4 and 393.5 s / 404.6 and 404.2 s of sim time |
| Reference GPU, `ai-cv` at rest on the deck | drift 0.011 m over 9 s; wheels at 17.000 m against a rendered deck at 17.000 m (`shipDeckProbe`) |
| Reference GPU, WebGPU validation errors | 0 |
| Reference GPU, 1440p gpu p95 | **7.46 ms (limit 6.0): the spec is red**, see Open item 1 |
| Final verify (`remote-run npm run verify`) | rc=0; 315 files; 3544 passed; 2 skipped |

## 3. Tier 2 captures

`tests/e2e/recovery.spec.ts` (note: the plan said `tests/tier2/`, which does
not exist; the specs live in `tests/e2e/`). Run twice on the reference GPU:
once on the session-0 server and once on the console server under
`hwlock ryzen`.

- **Session 0 does not capture the canvas.** Its screenshots, and those of the
  control `deckQuals` spec, are black except for the HUD. Use the console
  server for anything visual.
- The two screenshots saved under `test-results/`
  (`recovery-landed-tacloban.png`, `recovery-respotted-tacloban.png`, both from
  the console server) show the player's parked F6F at Tacloban with hangars,
  the tower and clouds. A speck near the far end of the runway is too small to
  call `ai-tac`. **Neither shows the carrier.**
- No live camera can follow an AI (the replay Target camera reaches only
  3 km), so the carrier landing is proven by numbers (`shipDeckProbe`, table
  above), not by a picture. Ruling P24.

## 4. Rulings

Twenty-nine rulings are in the ledger, each with its cost if reversed. The
ones that change behavior or touch files outside the plan's list:

- **P7** deck park spots stagger fore and aft instead of the plan's two-abreast
  grid, which returned 0 spots on `casablanca-cve`.
- **P10** a homed pilot's idle clock starts at its first rescore, not at 0.
- **P12 to P16** capture window keeps a 60 m lateral gate through final
  (a 30 degree carrier turn otherwise sent the pilot into the sea); the AI's
  approach gets an across-track damping term the tool path does not set;
  go-around hands off to transit only above 1.3 x stall; join lookahead 750 m
  instead of 1500 m; join crabs for wind.
- **P17** a bolter or no-touchdown exit goes to go-around even after the cut.
- **P18** a join starts only on or outside the initial point and within 200 m
  of the centerline (a runway join from hold went around forever otherwise).
- **P20** a wingman whose leader is lost keeps its `home` (`formation.ts`
  touched outside the plan's list).
- **P27, P29** the whole-branch review's three confirmed defects were fixed
  test-first (Section 5); a wingman with a flying leader suppresses only its
  idle trigger, so fuel, ammunition and damage still send it home alone.
- **P28** the fourth review finding was declined (Open item 3).

## 5. Whole-branch review

A fresh reviewer read `main..HEAD` against the plan's Review Focus. Boundaries,
determinism, `structuredClone` safety, `loop.ts` and the snapshot tests were
clean. Findings:

| Finding | Verdict | Outcome |
| --- | --- | --- |
| A homed wingman took its own idle rescore and went home alone, never in formation | confirmed, own failing test | fixed `88d4fac`, narrowed `e4b5acb` |
| With no terrain a runway recovery did not hold at the initial point; it looped go-arounds | confirmed, own failing test | fixed `88d4fac` |
| A threat astern could pre-empt rollout or a committed final and retract the gear on the ground | confirmed, own failing test | fixed `88d4fac` |
| Crosswind of about 8.5 m/s or more fails the nose-heading capture gate every pass | plausible, unmeasured | declined, Open item 3 |

`recovery-range` landing times are unchanged by the fixes.

## 6. Open items

1. **`recovery.spec.ts` is red on the 1440p budget, and so is the tier.** gpu
   p95 read 7.40 ms (session 0) and 7.46 ms (console, under `hwlock ryzen`)
   against 6.0. Controls on the same harness, console, locked, 20 s parked:
   `recovery-range` with both AI 30+ km away 7.37 ms, `deck-quals` 7.58 ms, the
   bare runway spawn 7.82 ms. The 2026-09-26 loading-and-dossier handoff
   already lists deckQuals 8.09, ships 7.70, entities 7.13 and runway 7.79 ms
   over 6.0 (clouds' cost). So the overrun is the standing baseline, not 7g.
   The assertion stays at 6.0 with a dated comment (P26); raising it or
   accepting the red spec is Mark's call.
2. **Fuel is not scenario content**, so the fuel trigger is dormant in shipped
   scenarios; `recovery-range` sends its AI home on the 30 s idle rule.
3. **Strong crosswind (declined review finding).** The capture heading gate
   measures the nose, and the join crabs, so a crosswind of about 8.5 m/s or
   more at a runway approach speed of 49 m/s could fail the gate on every pass.
   `recovery-range` (7.7 m/s from 342 degrees) does not hit it. The fix would
   measure track error relative to the surface; it was declined because it
   would move the measured approach (P12, P13, P15, P18).
4. **AI takeoff is its own later plan** (Mark, 2026-09-27).
5. **Taxiing is not modeled**; the respot to a park spot stands in for it.
6. **A held-group home ship is rejected** by validation.
7. A homed raider on an ingress route goes home after 30 s without a contact,
   abandoning its route. That is literal spec §6; worth confirming.
8. Deferred minors, all cosmetic or latent: no hysteresis on the rollout
   bolter exit (no bounce has been measured); an AI landed on a ship that
   later sinks stays landed and is never respotted; `NEUTRAL` is duplicated in
   `recovery.ts` and `scenario.ts`; the runway respot rebuilds its state
   inline; a lower id stuck in `transit` holds every higher id at the initial
   point; untested paths: a downed aircraft not blocking the approach, the
   peel-off transit branch, an interval that includes a go-around.
9. `skyLoad` and `gunzip` render tests time out on ryzen under load (P6). Both
   passed in the last three verifies.

## 7. Mark's viewing steps (final checkpoint)

The dev slot serves this worktree, not the primary checkout, so the primary
host `ww2airsim.windomlane.org` does **not** show this branch.

1. From `/home/mark/projects/ww2airsim-worktrees/ai-7g-landing`, point the
   worktree's `vite.config.ts` `TUNNEL_HOST` and `server.port` at slot 2
   (`ww2airsim-2.windomlane.org`, port 5175), never committed, then
   `WW2AIRSIM_TUNNEL=1 npx vite --port 5175`.
2. Assert it is up:
   `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/`
   must print `200`.
3. Open `https://ww2airsim-2.windomlane.org/?scenario=recovery-range`. You
   start chocked at Tacloban's apron, allied, so nothing attacks the AI.
4. Press `T` for triple time. About 30 s of sim time in, both AI turn for home
   (`ai-tac` is 15 km out and `ai-cv` is 15 km from the carrier). Watch
   `ai-tac` come down the runway: it lands at about 393 s of sim time, about
   2.5 minutes at triple time, and is moved to a park spot three seconds later.
5. The carrier landing is out of view from the apron (Section 3). Its numbers
   are in Section 2.

## 8. Test evidence

- Tier 1: `tests/sim/ai/recovery*.test.ts`, `parkSpots.test.ts`,
  `approach.test.ts`, `targeting.test.ts`, `autoPursuit.test.ts`,
  `determinism.test.ts` (adds `recovery-range`, two runs and a
  `structuredClone` mid-approach run), `tests/content/recoveryParkSpots.test.ts`.
- Tier 2: `tests/e2e/recovery.spec.ts`, red only on the budget assertion.
