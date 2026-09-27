# E1 effects engine handoff — 2026-09-26

E1 replaces the six legacy unlit effects with one lit, soft, pooled particle
system. The simulation now reports every armed bomb/rocket detonation and
relevant expiry through a bounded impact ring without changing any other sim
state. Rendering maps those events plus aircraft, ship, and structure state to
one seeded CPU pool, one reduced-resolution particle pass, and a dense-depth
target that stops the cloud march in front of fire and smoke.

This work is complete on `worktree-e1-effects` and is **not merged**. Merging is
Mark's call. E1 intentionally ships code-generated placeholder flipbooks; the
first art-direction checkpoint is the end of E2.

## What shipped

| Commit | Result |
| --- | --- |
| `38ccef9` | Added bounded `World.combat.impacts` records for detonations and bomb/rocket expiries, bit-identical elsewhere. |
| `430c003` | Added three generated placeholder KTX2 arrays in the E2-compatible 3×2-atlas-per-frame layout. |
| `d35ee79` | Added the zod-validated recipe and emitter catalog. |
| `aaeca1b` | Added pure event extraction for impacts, crashes, kills, engine smoke, ship fire, and structure collapse. |
| `2b2b7d6` | Added the seeded CPU particle pool, tier caps, FIFO eviction, and back-to-front instance output. |
| `989c937` | Added Effects as the fourth quality system, including migration of older saved settings. |
| `9def951` | Added KTX2/fallback sheet loading and six-way-lit, emissive, soft, near-faded materials. |
| `5554a75` | Kept faint fire emissive outside the coverage multiplier so it can still feed bloom. |
| `3115c6e` | Added the reduced-resolution color/dense-depth pass, depth-aware composite, and cloud march limit. |
| `22e7370` | Made the idle cloud-limit path one uniform branch and disposed the template quad. |
| `49ae12c` | Wired quality, events, pool, pass, diagnostics, stress scenes, and `?fx` controls into the frame. |
| `ed7aece` | Deleted all six old effect paths; ship and airfield smoke/fire now come only from E1. |
| `f9dc163` | Added reference-GPU appearance, fallback, cloud-ordering, soft-edge, and restart acceptance tests. |
| `28f50ea` | Added paired 1440p stress/eye-smoke cost gates and an explicit 4K photo off/on gate. |

No runtime dependency was added. GPU compute was not built.

## Verification

`remote-run npm run verify` returned `rc=0` on ryzen: typecheck, ESLint, and
dependency-cruiser passed; Vitest passed 230 files and 2,355 tests, with one
intentional skip. The data pre-sync warned that it could not replace the
persistent `tools/terrain/cache` symlink, but the snapshot and complete verify
continued successfully.

The reference-GPU appearance suite passed 8/8 with no retries. The affected
adapter/boot/settings/gunnery/contact/cloud suite passed 37 tests with one
intentional skip. `strike.spec.ts` has an unrelated collection-time harness
failure on this branch: its direct Node import reaches `content.ts`, where
`import.meta.env.BASE_URL` is undefined. No E1 test or browser code runs before
that exception.

## Simulation identity

Final probes used Node v22.22.1. All hashes match the pre-E1 baselines exactly:

| Scenario | Ticks | SHA-256 |
| --- | ---: | --- |
| deck-quals | 1,800 | `f5be48c2c641bea55dcb255a69f7c5d9aa15264c7c0c8c20956f52bf5330afc1` |
| free-flight | 1,800 | `1bf07decdd1d0f54e765e2603f22aac5714c04f7b6965a437ea6292d42218575` |
| gunnery-range | 1,800 | `acb6072ebe4b353f010384f876e744ae8557de3c4caadd0eab13199efec67061` |
| pursuit-range | 1,800 | `77d2aa0036653895894cd4e1a6a7fcc8ea0ab87767d48c25a6f7fd902125b570` |
| pursuit-range-veteran | 1,800 | `e2a415b9edebf4480c8b7e6186e37120296c124eda7a2b18277beb91994e1231` |
| strike-range | 1,800 | `ace29a5a21bac2bfbf4a4114445cf8707a90d95df8754ba025c04c37eb421e6d` |
| strike-armed | 1,200 | `6b7b26c18d72f4aef1be7b61a384b81d6d80ee61c51b20a01b25dda8907b3b78` |

The armed probe still releases 2 bombs and 4 rockets and fires 84 shots. Its
new ring contains four `rocket/expired/air` entries and two
`bomb/detonated/water` entries.

## Measured effects

### Appearance and ordering

| Case | Measurement |
| --- | --- |
| Bomb on land | warm pixels 308 → 1,584; 63 live instances |
| Bomb on water | focused pale pixels 5,491 → 10,606; upright bottom-heavy plume |
| Air kill | warm pixels 49 → 1,627 |
| Smoke base | edge p90 4.6 soft versus 13.4 hard |
| Cloud ordering | 237 warm pixels with the dense-depth limit, 0 without it, 357 in clear sky |
| Crash/restart | 20 live instances before Restart, 0 after |

The fallback case deliberately aborts only `content/fx/` sheet requests. The
test filters Chromium's exact `Failed to load resource: net::ERR_FAILED` line
for those requests while still failing on any other console or page error.

### GPU and CPU cost

The E1-owned hard gate is paired p95: the same scene with effects High must add
at most 1.0 ms over `?fx=off`.

| Scene / tier | p95 (ms) | Samples | Live | CPU (ms) |
| --- | ---: | ---: | ---: | ---: |
| budget / off, arm 1 | 8.113 | 329 | 0 | 0.000 |
| budget / high, arm 1 | 8.438 | 306 | 1,443 | 0.400 |
| budget / off, arm 2 | 8.072 | 335 | 0 | 0.000 |
| budget / high, arm 2 | 8.467 | 310 | 1,444 | 0.500 |
| budget / medium | 8.370 | 276 | 1,443 | 0.800 |
| budget / low | 8.253 | 281 | 1,024 | 0.300 |
| eye-smoke / off | 7.966 | 278 | 0 | 0.000 |
| eye-smoke / high | 8.828 | 275 | 32 | 0.000 |

High means are 8.453 ms versus 8.093 ms off: **+0.360 ms**. Eye-smoke adds
**+0.863 ms**. Both pass the 1.0 ms gate, and peak measured CPU time is 0.800
ms, so there is no evidence justifying GPU compute.

The explicit idle 4K High photo pair measured 16.102 ms off (151 samples) and
16.062 ms on (165 samples), delta -0.039 ms. The negative delta is scheduling
noise, not a speedup claim; the on arm passes the 16.67 ms budget.

The ordinary effects-on 4K sweep measured:

| View | High p95 | Medium p95 |
| --- | ---: | ---: |
| runway | 13.716 ms | 7.428 ms |
| low-land-600 | 12.465 ms | 7.157 ms |
| under-deck-1200 | 11.640 ms | 7.892 ms |
| in-deck-1900 | 20.328 / 20.580 / 20.416 ms | 8.859 ms |
| above-deck-3200 | 11.195 ms | 7.290 ms |
| high-6000 | 12.900 ms | 7.260 ms |
| deckquals | 13.064 ms | 7.842 ms |
| sunset | 12.258 ms | 8.221 ms |
| photo | 16.056 ms | 7.706 ms |

The full unchanged 4K/terrain suite passed 24 tests and failed two absolute
tripwires after retries. Both reproduce on current `main`: High in-cloud is
20.152 / 20.309 / 20.179 ms there against 20.0, while the legacy terrain probe
is 6.321 ms on main versus 6.337 ms on E1 against 6.0. E1's full retries were
6.396 / 6.278 / 6.355 ms. These are shared baseline drift, not an E1 delta;
neither existing gate was changed.

No Task 12 rendering lever shipped.

## Assets

The placeholder package is 345,767 bytes total:

| File | Bytes |
| --- | ---: |
| `content/fx/fx-light-a.ktx2` | 175,890 |
| `content/fx/fx-light-b.ktx2` | 114,120 |
| `content/fx/fx-motion.ktx2` | 55,129 |
| `content/fx/sheets.json` | 628 |

These are deterministic code-generated diagnostics, not E2's art.

## Captures

Every capture was opened and inspected; none is black and no plume is inverted.

- [air-kill-before.png](2026-09-26-e1-effects-shots/air-kill-before.png): empty sky before the event.
- [air-kill.png](2026-09-26-e1-effects-shots/air-kill.png): a distinct elevated fireball.
- [bomb-land-before.png](2026-09-26-e1-effects-shots/bomb-land-before.png): clean runway before impact.
- [bomb-land.png](2026-09-26-e1-effects-shots/bomb-land.png): warm fireball rooted on the runway.
- [bomb-water-before.png](2026-09-26-e1-effects-shots/bomb-water-before.png): clean shoreline before impact.
- [bomb-water.png](2026-09-26-e1-effects-shots/bomb-water.png): upright, bottom-heavy pale spray column at the water.
- [cloud-fireball-before.png](2026-09-26-e1-effects-shots/cloud-fireball-before.png): cloud-deck baseline for the limited case.
- [cloud-fireball.png](2026-09-26-e1-effects-shots/cloud-fireball.png): fireball retained in front of the cloud by dense depth.
- [cloud-fireball-nolimit-before.png](2026-09-26-e1-effects-shots/cloud-fireball-nolimit-before.png): cloud-deck baseline for the control.
- [cloud-fireball-nolimit.png](2026-09-26-e1-effects-shots/cloud-fireball-nolimit.png): control fireball fully eaten by the cloud march.
- [cloud-fireball-clearsky-before.png](2026-09-26-e1-effects-shots/cloud-fireball-clearsky-before.png): clear-sky baseline.
- [cloud-fireball-clearsky.png](2026-09-26-e1-effects-shots/cloud-fireball-clearsky.png): bright unobscured reference fireball.
- [fallback-bomb-land-before.png](2026-09-26-e1-effects-shots/fallback-bomb-land-before.png): empty runway with sheets blocked.
- [fallback-bomb-land.png](2026-09-26-e1-effects-shots/fallback-bomb-land.png): large bright procedural fallback sprite.
- [smoke-base-soft-before.png](2026-09-26-e1-effects-shots/smoke-base-soft-before.png): terrain before the soft plume.
- [smoke-base-soft.png](2026-09-26-e1-effects-shots/smoke-base-soft.png): dark plume whose base fades into the ground.
- [smoke-base-hard-before.png](2026-09-26-e1-effects-shots/smoke-base-hard-before.png): terrain before the hard-edge control.
- [smoke-base-hard.png](2026-09-26-e1-effects-shots/smoke-base-hard.png): control plume with a square, abrupt lower edge.
- [crash-water.png](2026-09-26-e1-effects-shots/crash-water.png): crash debrief over the scene; the effect is faint beneath it, while diagnostics report 20 live instances.

Restart is asserted diagnostically in the same crash test (zero live instances)
but has no separate committed image.

## Rulings

1. Expired bomb/rocket entries use `surface: 'air'`.
2. An unarmed dud records nothing and therefore makes no splash.
3. Round expiries are not recorded.
4. Deck/ship/structure/aircraft bomb and rocket hits use the land fireball; round aircraft hits have `round.aircraft`.
5. Every aircraft crash emits an effect, not only the player's.
6. Kill smoke rises from the frozen destroyed aircraft; falling wreck physics is later work.
7. Each image is one KTX2 array; a layer is one frame containing a 3×2 six-sheet atlas.
8. All three placeholder arrays are linear ETC1S Basis data so array layers survive the three r186 loader.
9. Dense depth is a max-blended second draw, not MRT.
10. Particles render in their own scene and mirror the main scene's floating-origin position.
11. Soft particles and the composite use the same representative full-resolution depth pixel per effects texel.
12. Idle cost is one uniform branch; inactive composite and dense-depth reads are skipped.
13. Ship and structure smoke anchors come from their rendered views.
14. Effects use paused/time-scaled wall time; a crash debrief continues animating.
15. Saved quality settings without `fx` migrate it from `clouds`.
16. Frame blending and Low's top-mip skip ship in E1; E2 changes the bakes and tuning.
17. One back-to-front draw uses premultiplied-over blending, with fire radiance outside coverage.
18. `?fx=off` builds neither the system nor the pass.
19. The smoke-base diagnostic moves from the 300 m budget range to 40 m so a one-pixel ground edge can be resolved; the budget scene remains at 300 m.
20. The shaded water plume is measured in a focused region at luma 160; its visible six-way-lit white is gray-white, not paper white.
21. Static soft/hard TSL variants are captured in sequential browser contexts because concurrent pages reuse the first pipeline variant.
22. The cloud-ordering view is `look=33,33`, with thresholds derived from 237 limited / 0 unlimited / 357 clear pixels.
23. Crash liveness is >10 because the stable measured pre-restart count is 20 and post-restart is 0.
24. The E1 performance gate is paired high-minus-off <=1.0 ms. Shared absolute baseline failures stay visible in the unchanged legacy suites.
25. Stress liveness is sampled one second after injection; by 3.5 seconds its intentionally short-lived initial bursts have decayed below the plan draft's threshold.
26. The explicit 4K photo pair lives in `fx-budget.spec.ts` because `budget4k.spec.ts` has no effects-off injection.

## Traps found

- A TSL graph can render black without a validation error; every accepted frame
  therefore needs both a visual check and live diagnostics.
- Static TSL feature variants can reuse a compiled pipeline while two pages are
  alive; use sequential browser contexts for a trustworthy A/B.
- Six-way lighting changes “white” diagnostic pixels enough that a global
  paper-white threshold can report a visually obvious plume as absent.
- The first liveness sample must cover the initial stress burst. Sampling after
  the five-second performance window measures steady-state emitters instead.
- Chromium emits its own console error for a deliberately aborted sheet URL;
  filter only that exact network line in the fallback case.
- `strike.spec.ts` currently imports Vite-only `import.meta.env` state in Node
  during collection.
- The reference GPU's current absolute terrain and High in-cloud readings are
  above their historical tripwires on both this branch and main; use paired,
  back-to-back measurements before assigning cost to E1.

## Open for Mark

1. Merge `worktree-e1-effects` to `main` if approved. O1 and E1 both touch
   `src/render/ordnance.ts`; E1's side is deletions against O1's in-flight model
   changes, so the second merge must resolve that file deliberately.
2. Do not judge the placeholder look as E2 art. The first viewing checkpoint is
   the end of E2 (design §7).
3. The kill trail rises from a frozen wreck. A falling wreck is a later sim
   change.
4. A dud makes no splash under R2.
5. E2 must preserve `sheets.json`'s layout or update `sheetManifest.ts` with it.
6. Decide whether to re-baseline the legacy 6 ms terrain and 20 ms High
   in-cloud tripwires; E1 did not change them because current main misses too.
