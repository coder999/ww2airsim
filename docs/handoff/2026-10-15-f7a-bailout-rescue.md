# F7A handoff: bailout and rescue (2026-10-15)

Branch `plan-f7a-bailout-rescue`. The original implementation commit `ac6600bd` is kept in history; F5B (`494dae5c`) is
merged in, and the rework below runs on top. Plan: `docs/superpowers/plans/2026-10-15-f7a-bailout-rescue-revised.md`
(its "Decisions (Mark, 2026-10-15)" are all applied). Not merged to `main`, not deployed, nothing emailed.
`src/campaign/` and `bank.ts` are untouched (`git diff origin/main..HEAD -- src/campaign` is empty).

## What shipped

- **`J`, once.** A jump from under about 49 ft above the ground is refused with an on-screen message ("TOO LOW TO BAIL
  OUT · ABOUT 49 FT NEEDED"). Nothing else is refused except what is not a jump at all (on the ground, airplane already
  lost, a second jump). Inverted, stalled and very fast exits are allowed and the physics decides. No speed rule.
- **One tuning object** (`src/sim/bailoutTuning.ts`), every value labeled ESTIMATE (none has a cited source): 2 s
  deployment, 49 ft, 246 ft, 18 ft/s, plus the survivable touchdown speed (30 ft/s) and the rescue weights. All user-facing
  text is built from it in feet (`src/render/bailoutText.ts`).
- **The sim decides success.** `Recovery` gained `rescued` and `captured`; `missionOutcome` returns no badge ("Bailed
  out") whatever the objectives say, and `recoveryOf` reads the pilot before the abandoned airframe's later crash.
  `bankScored` forces `success` false for every end but `landed`.
- **Mapping** (through F5B's `session.bank`, `SORTIE_END_OF` now exhaustive over five outcomes): rescued -> `rescued`
  (pilot kept, rescue counted, points kept, no badge, no bonus, no progress); captured -> `captured` (F5A's reducer closes
  the POW and refills the roster); failed descent -> `killed`. `landing` is null for all three. The sortie ends at touchdown.
- **Seed at the press, recorded in the action.** `pressSeed` is computed at the key press and written into the `bailout`
  flight-record action; `requestBailout` takes it as a parameter and `verify.ts` replays the recorded value. Version stays 1.
- **HUD cue** uses the same environment a press would record and is judged where the canopy would come down, four
  times a second. The badge row takes a notice object instead of a fourth positional string.
- **Canopy sway**, view-only (a pure function of tick, wind and sink, at most 9 degrees).
- **Debrief** in ft/s with one plain consequence line ("Mission not credited; the points you earned are kept" / "A new
  pilot takes your place"). No metric units.

## How to look at it (final, attended; nothing here is a test gate)

No dev slot is reserved. A loopback dev server for this branch was started on nexus port 5190 (`npx vite --port 5190`,
loopback only). **Tell me when you want a tunneled slot** (5174 is F6B's, 5175 the lighting fix's).

Reference captures, retaken 2026-10-15 on **ryzen's GPU** (console-session Playwright server, slot `ww2airsim-2.windomlane.org`, after the lighting hotfix `aa098745` merged; the airplane is lit normally) in `docs/handoff/2026-10-15-f7a-bailout-rescue-shots/`:

| File | What to look at |
| --- | --- |
| `01-canopy-over-tacloban.png`, `01b-canopy-sway.png` | The open canopy and pilot from the chase camera, the abandoned airplane above, "CANOPY OPEN". 01b is the same descent 1.5 s later: is the sway gentle, not silly? |
| `02-rescued-debrief.png` | RESCUED over friendly Tacloban; the consequence line; 18 ft/s; factors in miles. |
| `03-captured-debrief.png` | CAPTURED over enemy Dulag; "a new pilot takes your place". |
| `04-water-no-rescue-debrief.png` | Water contact with no friendly ship near: CAPTURED. |
| `05-low-altitude-failure.png` | A jump from about 200 ft (under the 246 ft rule) is allowed and ends KILLED. |
| `06-too-low-refused.png` | The refusal message at about 30 ft, pilot still flying. |

Things only your eye finds: the rig's pose and scale under the canopy, the sway amplitude, whether the HUD cue wording reads right.
The E2E `bailout.spec` (5) and `bailoutCampaign.spec` (1) also pass on ryzen's GPU (6/6, 3.7 min).

## Tests

**Updated:** `recoveryAgreement` (three bailout cases), `outcome` (two), `campaignBank` (after a bailout: success forced
false, POW and roster, once-only), `campaignSession` (the five-way end mapping), `debrief` (ft/s, consequence, no metric),
`recorder` (the old bailout test rewritten around a recorded seed, plus tamper, determinism with `Math.random` and
`Date.now` made to throw, strict-parse of a seedless action), `flightRecord` (four bank sites), `shipCollision` (credit and
friendly fire after the jump, cannot fire), `bailout` (the vacuous `roll` assertion now requires a number), E2E `bailout`
(water, too-low message, low killed) and new `bailoutCampaign` (a scored sortie banks once with no success).
New files: `bailoutTuning`, `bailoutText`, `bailoutEdge`, `parachutistView` (rig node names read out of the glb, sway),
and a replay test.

**Mutation checks shown red (then reverted):** a speed refusal added (two tests); the safe-descent rule dropped to 20 m
(two tests); `verify.ts` ignoring the recorded seed (three tests); the cue ignoring the environment (one); the abandoned-
airframe controls swap removed (two); and, before their fixes, outcome (2), agreement (3) and the `bankScored` clamp (1),
and the debrief test (1), were red.

**Still valid, unchanged:** all of `src/campaign` and its model check; the recorder suite apart from the rewritten test; the
architecture boundary tests.

## Known gaps and deviations

- **No end-to-end test of a bailout ending in an ENEMY ship sunk by the abandoned airplane credited in the campaign
  ledger**; the sim-level credit is pinned, the ledger path is the ordinary one.
- **The debrief still prints "Recovery: RESCUED (x1)".** F5B kept that generic line; the x1 is not a scoring input now
  (comment in `debrief.ts`). Cosmetic.
- **The instant replay** carries the parachutist in its recorded world (tested), but its automatic camera still follows the
  abandoned airplane, not the pilot. Not changed.
- Only the two bailout E2E specs were run (ryzen GPU, 6/6; also nexus 680M). The full E2E suite was not run.
- **Contested odds are a distance heuristic** (`RECOVERY_TUNING`) until F8 gives real territory.
- The physics is thin (no opening shock or wind blast; touchdown survival is a vertical-speed test), so a 390 kt inverted
  jump lives. That is the ruled arcade behavior, recorded here, not hidden.
- Not done by ruling: rescue visuals (F7B), the A4 raft, boat and buoy (F10), a hold-to-confirm, any edit to `bank.ts`.

## Verification

`REMOTE_RUN_OVERFLOW=0 remote-run bash -c 'npm run verify; echo VERIFY_EXIT=$?'` on ryzen, 2026-10-15: **exit 0** (typecheck, eslint `--max-warnings 0`, dependency-cruiser, then 471 test files passed, 1 skipped; 7040 passed | 14 skipped (7054)). The merge-time run before the tuning work had one unrelated slow test time out under load (`ships stay in the support sea ... two runs agree`, 36 s) that passed in the full run. Run on the tree at commit `9ae30948`; the handoff, captures and spec edits came after.
