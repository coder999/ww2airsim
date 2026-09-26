# Handoff: cloud VDB fidelity (2026-09-26)

**Branch:** `worktree-cloud-vdb-fidelity`, in the worktree
`.codex/worktrees/cloud-vdb-fidelity`, served on `ww2airsim-2.windomlane.org`.
Merged to `main` 2026-09-26 (Mark's go-ahead after his flight), with the
§15 row and README paragraph.
**Plan:** `docs/superpowers/plans/2026-09-26-cloud-vdb-coverage.md`.
**Ledger:** `.superpowers/sdd/cloud-vdb-fidelity/progress.md` (gitignored).
**Visual reference:** local tag `cloud-vdb-photo-2026-09-26`, the state of the
`photo` capture Mark approved. Not pushed.

## What changed

| Commit | What |
| --- | --- |
| `a0ed535` | Codex's work: each weather cell's cloud is carved from one baked, procedural stacked-lobe cumulus (`content/sky/cumulus.bin.gz`), rotated and scaled per cloud. The weather map stores each cloud's exact center and radius. The generator is `tools/sky/cumulus.py` (numpy, seed 7, no third-party data), recovered from the unversioned spike. |
| `4d374af` | Half-resolution archetype (11.7 m voxels, download 1.38 MB → 205 KB). No shape read where the archetype is empty, which also removed a faint haze that filled every live cell's column. |
| `58e61f3` | `coverage` is the sky fraction again. 1200 m cells. Winner and runner-up weather planes. Clouds grow 1 → 1.5× with coverage. A CPU twin (`skyCoverageTable`) sets the threshold. The light march reads the winner only. The cloud-edge history rejection also needs an alpha spread. Medium drops to 56 steps. |
| (this commit) | Separate in-cloud 4K budget (Mark's decision). The 1440p deck-run tripwire is reconciled to 8.33 ms. |

## Measured (4K p95, reference GPU, 2026-09-26)

| View | High | Medium | Budget |
| --- | --- | --- | --- |
| runway | 13.4 | 7.25 | 16.67 / 8.33 |
| low-land-600 | 12.4 | 7.16 | 16.67 / 8.33 |
| under-deck-1200 | 11.3 | 7.43 | 16.67 / 8.33 |
| **in-deck-1900 (inside a cloud)** | **18.8** | **8.39** | **20.0 / 9.0 (in-cloud)** |
| above-deck-3200 | 10.6 | 6.93 | 16.67 / 8.33 |
| high-6000 | 12.9 | 7.27 | 16.67 / 8.33 |
| deckquals | 13.0 | 7.90 | 16.67 / 8.33 |
| sunset | 12.0 | 7.60 | 16.67 / 8.33 |
| photo | 16.0 | 7.44 | 16.67 / 8.33 |

`main` for comparison, same session (pre-VDB clouds): High 8.9–10.3 ms,
Medium 6.0–7.2 ms. The VDB clouds cost roughly +3 ms at High and +1 ms at
Medium outside clouds. `photo` at High has 0.6 ms of margin.

Coverage (projected sky fraction, from the CPU twin): free-flight's 0.45
and deck-quals' 0.55 are met. The maximum is 0.636. Pixel fractions at 1440p:
above-deck 0.708 (Cloud Fidelity II: 0.701). Views from below read denser
(photo 0.62, runway 0.70, under-deck 0.85), because the bases are now wide,
merged masses. That follows the contract. A sunnier free-flight is a content
change (its `coverage: 0.45`) and Mark's call.

## Traps found

- **One capture is not a baseline.** The bookmark's own code, recaptured two
  hours later, was as soft as every candidate. The desktop was running 16
  Chrome processes, so fewer frames accumulated in the capture's 3 s settle.
  Compare only back-to-back captures. The Laplacian sharpness metric did not
  see the softness either.
- **A camera inside a cloud defeats the temporal schedule.** Cloud Fidelity
  II's cloud-edge rejection compared only neighbor depths, and depth is
  noisy all through haze, so High marched every texel every frame (in-deck
  24.9 ms; 11.7 with the test off). It now also needs an alpha spread
  (`CLOUD_EDGE_ALPHA_SPREAD` 0.1). Lower values are sharper at silhouettes
  and cost more: 0.03 / 0.06 / 0.10 / 0.15 gave 20.4 / 19.1 / 18.2 / 17.6 ms.
- **Levers that did NOT help in-cloud:** a High light-LOD band (it also
  contradicts the documented "no distance light LOD at High"), step growth
  behind absorbed light, and a cheap light march for thin haze. All three
  were measured and removed.
- `smoothstep(0, 0, x)` in TSL is a divide by zero and renders a black frame.
- A shader missing an import (`saturate`) fails pipeline creation, and the
  timing then looks spectacular because nothing draws. Check the console
  before believing a big win.
- `motionBudget.spec.ts` fails on `main` too today (4.12 ms p50 against
  3.745): environmental, not this branch.
- `remote-run npm run verify` fails lint on ryzen because of
  `tools/textures/cache/` (a KTX install another session left in the data
  mirror). Run the static checks locally and `remote-run npm test` for the
  suite until that mirror is cleaned or eslint ignores the cache.

## Open

- Faint fine horizontal banding on cloud bases seen from below. The likely
  cause is Codex's jitter reduction (cumulus start jitter cut to 1/8 of the
  step, `clouds.ts`). Not yet tested.
- The `waitForTerrain` page-load flake on the `-2` slot: one view failed
  three times in a row, then passed. The console was clean and terrain
  arrived at 2.5 s in an instrumented load.
- Merge to `main`, then the §15 row and README paragraph: Mark's call.

## Mark's flight (2026-09-26, after this handoff)

Flying through a cumulus showed no degradation (120 fps held). Two defects
remain, and they are the next work, in a fresh worktree:

- **Stacked slices**: cloud sides read as stacked pancakes rather than one
  continuous body, on every cloud. The suspect is the cumulus start-jitter
  cut to 1/8 of a step.
- **A flickering band near the horizon**, visible even while paused. Not yet
  diagnosed, and not yet compared against pre-merge `main`.

### Follow-up fixes (merged 2026-09-26, `e37c0a1`)

The screenshot was taken at **Low**, the tier Mark's Chrome auto-picks (the
open 2026-09-20 incident, which Mark chose to leave for now). Two fixes:

- Slices: the cumulus start jitter goes back to a full step (it was 1/8).
- Horizon band: the resolve's moving-edge rule now applies only to clouds
  nearer than 10 km. Frozen-scene flicker at Low: 1.66 → 0.78 gray levels.

Mark flew it: "huge improvements on both fronts", usable. High shows no
flicker and no fps loss in cloud. Low still shimmers at cloud edges; that
stays open.
