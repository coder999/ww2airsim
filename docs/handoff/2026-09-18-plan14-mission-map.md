# Plan 14 handoff — mission map

Plan 14 is complete on `main`, not pushed and not deployed. The design and its
non-goals are in the approved
[mission map design](../superpowers/specs/2026-09-18-mission-map-design.md);
this handoff records what was measured and decided while building it rather
than repeating that design.

`P` opens a frozen navigation chart of the live free-flight world: the player
(`YOU`), Tacloban and Dulag, the Essex-class carrier with its two
Fletcher-class escorts, and the wingman `f6f-2`. Airfields and the carrier are
selectable; selecting one prints a true course and range from the player's
current position. The chart is DOM/SVG only. Opening it holds the frame
through `withPaused` and closing restores the exact prior pause state; no
simulation type or tick behavior changed.

## Commits

| Commit | Task |
| --- | --- |
| `cab2d57` | Design and implementation plan |
| `0f4f69b` | Task 1 — pure chart model and navigation arithmetic |
| `0ca010b` | Task 2 — `KeyP` binding, listed in the controls legend |
| `767fc55` | Task 3 — accessible SVG/DOM chart |
| `18f9341` | Task 4 — entry-point ownership, exact pause restoration |
| `c54005d` | Task 5 — Tier 2 proof; caption placement; debrief dialog named |
| this commit | Task 6 — handoff, roadmap, harness flags |

## Measurements and acceptance

| Check | Result |
| --- | --- |
| Tier 1 | `npm run verify` exit 0: **99 files, 1,077 passed, 1 skipped** |
| Tier 2 chart spec, 2560×1440 | Passed on all four runs: seven markers named, Tacloban then the carrier selected with a printed course/range, world tick equal across 600 ms while open and rising again after close, zero WebGPU validation errors, every SVG caption's bounding box inside the chart viewBox |
| Reference GPU budget, unchanged by a DOM-only chart | frame budget **gpu p95 5.177 ms**; entities **p95 3.670 ms**; ocean high total **p95 4.588 ms** (6.0 ms ceiling) |
| Tier 2 full suite | Two full runs each had 3–4 page-load transport failures on a different set of tests; each passed alone. Root cause found and recorded below; it is not a renderer or chart result. |

Screenshot reviewed at 1440p: `YOU`, `Tacloban` and `f6f-2` share one
parking spot and read as three stacked lines beside one marker; the task
force's three captions stack beside the carrier.

## Controls and data contract

- `P` toggles the chart; `Esc` remains pause and does nothing lasting while
  the chart is up. While open, the frame loop feeds `nextFrameState` an empty
  key set and no latches, and `clearMapInput` drains held keys and pending
  taps at both transitions, so nothing pressed while reading the chart can
  fire on close. The selected destination survives close and reopen.
- Only targetable markers carry `role="button"`; click, Enter or Space
  selects. The chart's `section` has `role="dialog"` and the accessible name
  `Navigation chart`; the debrief now carries `aria-label="Debrief"` so the
  two dialogs are distinguishable. Tier 2 locates the debrief through
  `debriefDialog(page)` in `tests/e2e/harness.ts`.
- `mapPoints(world)` is the only source of markers: player, every airfield
  (targetable), every ship (carrier targetable, escorts not), every other
  aircraft. Coordinates are read from the live world on every redraw; nothing
  is cached. `labelPlacements()` moves captions, never markers, and only when
  their estimated text boxes overlap.
- No enemy base, objective, waypoint, coastline or terrain raster exists on
  the chart, by design §4 and §6.

## Decisions made while executing

- Zero range reads `000°`, not JavaScript's `atan2(0, -0)` 180°.
- The first cut of Task 5 placed captions from a fixed offset table, which
  pushed the wingman's caption above the chart edge, invisible at every
  viewport. Replaced by overlap-only stacking, and the e2e spec now asserts
  every caption's bbox lies inside the viewBox so clipping fails mechanically.
- The chart redraws only when the world tick or selection changed, and moves
  focus to `Close` only on the transition from hidden to shown.
- Task 6 review found that Task 4 cleared the input latches at open and close
  but still passed live keys into `nextFrameState` between them. The hold
  zeroes the sim clock, so axes could not ramp, but the edge-triggered toggles
  do not depend on the clock: `G` pressed while reading the chart dropped the
  gear. Fixed in the Task 6 commit by feeding an empty key set while open.

## Tier 2 transport failures: root cause

`ww2airsim.windomlane.org` is split-horizon: the UniFi resolver overrides its
A record to nexus (192.168.0.50, Traefik, TCP 443 only) but forwards
Cloudflare's auto-generated HTTPS (type 65) record, which advertises
`alpn="h3,h2"` and an ECH config for Cloudflare's edge. Chromium reads that
record on the first connection and tries QUIC, then ECH, against a server that
supports neither, and intermittently fails the navigation instead of falling
back. Cloudflare's edge logged none of the failing loads and cloudflared on
nexus logged nothing, so neither is in the path. The Plan 12 handoff's
"transient" QUIC error was this.

Headless A/B on the desktop, 30 fresh-context loads each:

| Chromium flags | Failures |
| --- | --- |
| none | 7, `ERR_QUIC_PROTOCOL_ERROR` |
| `--disable-quic` | 5, `ERR_ECH_FALLBACK_CERTIFICATE_INVALID` |
| `--disable-quic --disable-features=UseDnsHttpsSvcb` | 0 |

Both flags are now in `CHROMIUM_ARGS`. They reach the browser only if the
desktop's `playwright run-server` is started with `--unsafe`; measured
2026-09-18, the server had been running without it and none of the config's
Chromium flags had ever applied on the reference platform. README's Tier 2
section carries the corrected command.

Later the same day the server was restarted with `--unsafe` from nexus (an
interactive-logon scheduled task, so it runs in the console session with the
GPU). Two consequences, both measured: `--use-angle=d3d12`, in the config
since Task 11, makes `requestAdapter()` return null once it actually applies,
and was removed; and with the vsync and frame-rate flags real, the full suite
ran **32 passed, 0 failed** with the frame budget at **gpu p95 1.377 ms** and
the rAF interval p95 at 1.5 ms. The 5.177 ms figures above and in every
earlier handoff were measured under vsync with inert flags and are not
comparable with anything measured after this restart. The resolver-side fix, a LAN answer
with no HTTPS record for that name, is open and is Mark's decision; the same
record affects any LAN browser, not only the harness.

## Later seams

- A coastline layer from the land-cover raster or the L2 heightfield would be
  a small follow-on: one SVG path under the markers, sourced from real data,
  which would answer the design's "implies accuracy unavailable from its data
  contract" reservation with the same data the terrain already uses.
- Enemy bases and objectives enter at the `mapPoints` boundary with a declared
  kind and targetability (design §7), when a scenario supplies them.
- A heading bug or HUD bearing to the selected destination is Plan 8 or later
  territory; `mapSelectedId` in `main.ts` already survives close and reopen.
