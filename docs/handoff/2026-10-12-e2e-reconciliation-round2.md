# E2E reconciliation, round 2 — 2026-10-12

## Result

The non-budget failures from the overnight/reference-GPU run were separated
into one renderer defect and stale or noisy test contracts. The shipping
`takram-tsl` renderer and the native `takram` comparison renderer now both
honor dense FX depth in their cloud march and their final temporal composite.
The repaired control on the RX 6700 XT reads:

- TSL: limited 124-147 warm pixels, limit off 0, clear sky 348-357;
- native: limited 152, limit off 0, clear sky 353.

The stimulus is 1,150 m along the 39-degree-up view ray, immediately before
the ray crosses the 750 m cloud base. The former 800 m stimulus did not meet a
cloud on the default TSL weather field; the first attempted 1,400 m stimulus
was inside the cloud and therefore did not represent “effect in front.”

## Tests updated

- `fx.spec.ts`: water spray and soft-edge checks run with clouds off, so their
  local pixel relationships measure FX rather than a different temporal cloud
  field. Cloud ordering now enrolls both Takram paths and has explicit
  non-vacuity controls.
- `clouds.spec.ts`: the distant-edge guard asserts the shipping TSL renderer
  and uses its measured 3.357 residual with a `< 4` ceiling. The old `< 3`
  number belonged to the retired legacy default; the known stipple failure is
  8.02.
- `cloudShadow.spec.ts`: actual shadow-pass submissions are counted during the
  GPU sample window. The same correct build measured shadow-on 0.759 ms faster
  than shadow-off in this run, demonstrating why the former positive two-load
  p95 delta was not a correctness oracle. Dedicated budget specs still own
  cost.
- `mission-ui.spec.ts`'s shared landing target is capped 120 m before the far
  runway threshold. UI assertions can no longer move the computed touchdown
  beyond the strip.
- `gunnery.spec.ts`: the browser wiring test requires shots, hits and real
  damage, with kill credit consistent if the target dies. The deterministic
  twin still requires the exact pass to kill; browser frame cadence no longer
  turns hit-zone distribution into a stochastic mandatory-kill gate.
- `shipModels.test.ts`: the model manifest is compared with the live Library
  ship roster rather than a second literal inventory. The enrollment remains
  non-empty and unique.
- The stale sun-overlay comment was corrected. Hangar luminance output now
  records the measured value as well as its ratio; Pennsylvania's Measure 21
  reference was remeasured as 0.039929415 on the RX 6700 XT.

## Tests still valid

- Legacy cloud ordering remains covered by its existing depth-limit code and
  lower-level shading tests; the new E2E owns the two supported Takram paths
  that had not been wired.
- Dedicated budget specs retain the 1440p High 8.33 ms gate. No correctness
  threshold was converted into a performance threshold.
- The deterministic Gunnery Range pass still requires a kill, landing and no
  friendly damage.

## Budget-lock issue

`hwlock ryzen-budget` serializes only callers that use that same resource. It
cannot see a browser started directly on Windows or a `remote-run` WSL job,
and the overnight script currently wraps its whole run in `hwlock ryzen`, a
disabled/no-op resource. Consequently overnight budget reds are triage signals
until the script splits budget specs into their own `ryzen-budget` invocation
and checks both GPU and CPU contention. Correctness failures are unaffected by
that limitation. This is also recorded in `docs/testing.md` under the nightly
runbook.

## Known gaps

- Zuikaku's flat pre-skin artifact is no longer present. Its 0.095 baseline
  was measured on nexus's 680M; the current skinned model measures 0.078485465
  on the RX 6700 XT and remains green at 0.826x. Recreating the historical flat
  build would be asset archaeology rather than a test repair, so the fixture
  now says so explicitly.
- No deploy was requested or performed.

