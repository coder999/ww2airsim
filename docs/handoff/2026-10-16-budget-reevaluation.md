# Budget re-evaluation: what we measured, and what Mark decides at home

**Status (2026-10-16):** measurement done, no budget changed. The gates stay as written and stay red where
they are red (Mark, 2026-10-16: keep current rules failing, stop adjusting things to meet them, move on).
Mark is at work and cannot judge frame rate on the workstation that matters, so the decision waits for home.

## What is red, and why

Everything below was measured on the reference RX 6700 XT (ryzen), 1440p High, under `hwlock ryzen-budget`,
on a fresh dev server per measurement (a long-running or HMR'd dev server reads slow: camera-motion p50 3.4-4.7 ms
vs 2.62 ms fresh). Method: `BUDGET_PARAMS=trees=off` rides on every e2e URL, so any budget spec can A/B trees.

| Cause | Evidence | Red specs it explains |
| --- | --- | --- |
| **Distance-forest merge `e6b2476f` (2026-10-13)** | `runway` p95 4.3-4.9 ms at `7d29f9e2` (5 of 5) vs 11.7-15.1 ms on main (6 of 6); `?trees=off` on main: 8.5-14.0 to 4.5-5.3 ms (3 of 3 pairs) | the 6 `budget` views, eye-in-smoke, fx 1.0 ms delta, fx 4K photo, `strike`, terrain Leyte, terrain textures, night floor/dusk/field, night-field lights cost, camera motion, Takram native cloud pass |
| **Ships and their trails (`night-bay`)** | 5 ships cost 9.1 ms, any one ship alone 2.5 ms, cost rises over time (4.6 to 10.7 ms in 15 s); `wake=off` + `fx=off` together: about 4.5-5.5 ms, either alone changes nothing; fill-bound (`renderScale=0.5`: 9.1 to 5.3) | `night-bay` only (about 10.3 ms with trees off) |

Not causes: Windows Update (KB5127647/648/690 on 10-13/10-14), driver (dated 8/16, unchanged), the F6A/F6B night work,
Defender. The "bimodal ryzen noise" theory in the 2026-10-15 handoff is retracted.

## Entity scaling on current main (trees off), 1440p High

Median of 2 repeats, GPU p95 in ms (what the GPU takes) and rAF p95 (what a player's display gets).

| Extra aircraft x ships | tight GPU p95 | tight rAF p95 | mission GPU p95 | mission rAF p95 |
| --- | --- | --- | --- | --- |
| 0 x 0 | 8.0 | 7.8 | 7.4 | 7.4 |
| 10 x 0 | 14.9 | 8.1 | 14.0 | 7.8 |
| 20 x 0 | 15.3 | 8.2 | 14.3 | 8.4 |
| 30 x 0 | 18.2 | 10.8 | 14.9 | 9.7 |
| 0 x 5 | 14.2 | 10.9 | 13.8 | 10.8 |
| 0 x 10 | 18.0 | 15.8 | 16.2 | 14.9 |
| 30 x 10 | 20.9 | 33.9 | 18.7 | 24.4 |
| 60 x 20 | 22.2 | 48.8 | 21.0 | 38.0 |

- **120 Hz (8.33 ms) is out of reach for any battle:** the empty scene is already 7.4-8.0 ms. The first 10 aircraft or 5 ships cost 6-7 ms.
- **60 Hz (16.7 ms) holds to about 20-30 aircraft or about 5-8 ships.** 30 aircraft + 10 ships is about 19-21 ms GPU, and past about 30 entities the main thread (12-17 ms of work per frame) joins the GPU as the limit.
- **Trees add 1-2 ms in battles, not 8** (`30x10` trees on: 21.4 vs 20.9 off), so the forest rework helps the solo views far more than battles. The per-entity cost is what limits battles.
- **Resolution is a weak lever in battles.** At render scale 0.75 (1080p-equivalent), tight: 0x0 8.0 to 5.5, 30x0 18.2 to 15.3, 30x10 20.9 to 18.7, 60x20 22.2 to 18.8 (rAF p95 unchanged at 34 and 47 ms, which is main-thread bound). Fill is a big share of the solo views and a small share of big battles.

## Mark's questions, answered

- **Which would he notice more, 1080p or 60 vs 120 Hz?** Not answered; he will compare at home. He can use `?renderScale=0.75` (about 1080p on a 1440p window) on `ww2airsim.windomlane.org`. There is no frame-rate cap yet; a DEV `?fpsCap=` would let him flip 60/90/120/144 in one session (small change, not built).
- **Monitors:** work 24" at 1920x1080 (about 92 ppi), home 27", up to 144 Hz, resolution and variable refresh unknown (to check at home). A 1080p screen cannot show 1440p detail, which makes the 1440p bar a home-monitor bar.

## Proposed budget (for Mark to rule on at home, not applied)

1. **Two tiers.** Keep 8.33 ms (120 Hz, 1440p High) as the bar for the solo views the game is shown in (runway, photo, in-cloud, low land). Add a battle bar of 16.7 ms (60 Hz) at stated entity counts, for example 20 aircraft + 5 ships, with larger counts recorded, not asserted.
2. **Per-view regression check** next to the absolute bars: compare each view's p95 with its own recorded baseline, so a change like the forest merge (+8 ms) is caught even where the absolute gate is already red or has been raised.
3. **Quality ladder as the answer to big battles:** distance LOD, render scale and fewer distant effects scale with the entity count (render scale alone buys little there, per the table).

## Next, in order (none started)

1. **Forest rework** (Mark's idea, 2026-10-16): conglomerated canopy for the bulk, scattered individual trees only at the periphery. Needs a grilling session first.
2. **Ships and trails:** cap wake and spray length and opacity per ship, fade distant ships' trails; a per-pass GPU capture would settle which layer matters most.
3. **Main-thread cost** (draw calls and the sim) for 30+ entities: ranked fixes are in [`2026-10-10-entity-scaling.md`](2026-10-10-entity-scaling.md).

## Not changed

No gate, no limit, no test threshold. These stay red until Mark rules: 18 budget specs on the 2026-10-16 nightly (13 trace to the forest, `night-bay` to ships, the fx and motion deltas to the forest). `qualityProbeChrome` skips on the RDP route (`E2E_ROUTE=rdp`); see `docs/testing.md`, Known gaps.
