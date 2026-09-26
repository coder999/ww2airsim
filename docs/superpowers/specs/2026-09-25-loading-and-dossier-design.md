# Loading screen and pilot dossier — design

2026-09-25. Mark asked for two things on the title screen: a loading bar,
because "when ww2airsim.windomlane.org first loads nothing is clickable, after
a period of time the pilots and settings become clickable"; and a **Dossier**
per pilot showing completed-mission badges, kills and other collected stats.
Decisions taken with Mark the same day: the loading work goes past a bar and
also cuts the freeze itself; the dossier collects a mission log, flight hours
and landings, highest altitude and fastest speed. Built in the
`worktree-loading-dossier` worktree.

Two parts, independent except that both edit `titleScreen.ts`. Part A
(loading) lands first; its cloud-shader half lands last of all (§A.3).

## Part A — Loading screen

### A.1 What is actually happening (measured)

Measured 2026-09-25 on the reference desktop (RX 6700 XT, Chrome via the
Playwright run-server, `https://ww2airsim.windomlane.org/`, fresh context),
with a `longtask` PerformanceObserver and a 50 ms `setTimeout` heartbeat:

| t (ms from navigation) | Main thread |
| --- | --- |
| 1 208 | first contentful paint -- title art and menu drawn, clickable |
| 2 155 | 371 ms task (sky noise decode) |
| **3 325** | **one 13 014 ms task begins** -- heartbeat gap 13 163 ms |
| 16 350 -- 20 350 | terrain L7..L1 fetch (L1 alone 33.6 MB) |
| 20 375 | 551 ms task, then idle |

A CPU profile over the same boot attributes the 13 s task to the **first
rendered frame**: `rafLoop.tick` → `frameFn` (main.ts) → `pipeline.render` →
`TRAANode.updateBefore` → `cloudPass.ts` `updateBefore` → three.js TSL
`NodeBuilder.build`. 16.9 s inclusive across the boot; the hottest self-time
frames are `build`, `_getChildren`, `addNode`, `setData`, `getDataFromNode`,
`getHash`, with 2.7 s in the garbage collector. The cloud march loops are TSL
`Loop` nodes, not JS-unrolled, so graph size from unrolling is not the cause.

Nothing in `titleScreen.ts` disables the roster or Settings: the "not
clickable" period is click events queued behind a blocked main thread. That
is also why a bar alone cannot fix it -- a JS-driven bar freezes for the same
13 s the buttons do.

### A.2 The loading bar

`src/render/bootProgress.ts` (new): a pure model of named, weighted stages
plus a thin DOM strip, the `paddlesBadge.ts` split.

```ts
export type BootStage = 'sky' | 'terrain' | 'surface' | 'shaders' | 'firstFrame'
export type BootProgress = {
  begin(stage: BootStage): void
  end(stage: BootStage): void
  readonly fraction: number          // 0..1, weighted by completed stages
  readonly label: string             // "Compiling cloud shaders..."
  readonly ready: boolean            // true once 'firstFrame' has ended
  onChange(listener: () => void): void
}
```

- `main.ts` calls `begin`/`end` around the stages it already passes through:
  sky noise load, terrain fetch, land cover + ocean depth, the shader build
  (the first `pipeline.render`), and the first presented frame. Weights are
  initial guesses from the A.1 table, re-measured once A.3 lands.
- The strip lives at the foot of the title overlay: a thin bar, the current
  stage label, and a moving stripe driven by a **CSS `transform` animation**,
  which the compositor keeps running while the main thread is blocked. The
  fill only advances between stages; the stripe proves it is alive.
- **Controls are locked until `ready`**: pilot rows, New pilot, Add, Library,
  Settings and About are `disabled` and dimmed, with the line "Preparing
  aircraft...". On `ready` the strip fades out, the controls enable and focus
  goes to the first pilot row (or New pilot on an empty roster). Enter via
  `onKey` is guarded on `ready` too, the same way `advance()` already guards
  on `selectedPilotId`.
- The Dossier (Part B) is read-only and is **not** locked.
- A boot failure still empties `#app` via `failure.ts`, taking the strip with
  it; no separate error state.

### A.3 Shrinking the freeze

Measurement before any fix:

1. Instrument the cloud material build (a DEV-only counter wrapped around
   `NodeBuilder.build` for that material): unique node count, total node
   visits, time per build phase (setup / analyze / generate).
2. **Hypothesis to confirm or kill:** shared sub-expressions in the cloud
   graph are re-traversed many times over (visits ≫ unique nodes). If it
   holds, the fix is `.toVar()` / hoisting at the shared points so each node
   is built once. If it does not hold, report what does dominate before
   choosing a fix -- this section is re-opened with Mark, not improvised.
3. Whatever cost remains is split so the terrain/ocean material builds and
   the cloud material build fall on separate frames (the loading strip
   repaints between them).

Visual output must not change: a fixed-seed cloud frame is captured before
and after on the reference GPU and pixel-diffed (max channel delta ≤ 1).

**Coordination:** A.3 edits `clouds.ts` / `cloudLighting.ts`, which the Codex
`cloud-vdb-fidelity` worktree also changes. A.3 is done last and kept to the
minimum edit so either merge order stays cheap.

### A.4 Acceptance

Tier 1: `bootProgress` fraction/label/ready over a scripted stage sequence;
out-of-order `end` throws; `ready` fires its listener exactly once.

Tier 2 (reference GPU, `tests/e2e/boot.spec.ts`, new):

- The longest main-thread long task from navigation to `ready` is **under
  1 500 ms** (today 13 014 ms).
- Time from navigation to `ready` is printed, not gated.
- Before `ready`, pilot and Settings buttons report `disabled`; a pilot row
  clicked the instant `ready` flips is selected (`aria-pressed="true"`).
- The strip is gone after `ready`.

## Part B — Pilot dossier

### B.1 Record additions

`PilotRecord` (`src/render/roster.ts`) gains two fields:

```ts
export type LandingKind = 'trap' | 'field' | 'ditched'
export type Career = {
  readonly flightSeconds: number                 // airborne time only
  readonly landings: Readonly<Record<LandingKind, number>>
  readonly maxAltitudeM: number                  // shown in feet
  readonly maxTrueAirspeedMps: number            // shown in knots
}
export type MissionLogEntry = {
  readonly at: string                            // ISO date-time
  readonly scenarioId: string
  readonly aircraft: string                      // spec name
  readonly loadout: Loadout
  readonly outcome: LandingKind | 'killed'
  readonly points: number
  readonly killsByType: Readonly<Record<TargetType, number>>
  readonly flightSeconds: number
  readonly maxAltitudeM: number
  readonly maxTrueAirspeedMps: number
}
// PilotRecord += { readonly career: Career; readonly log: readonly MissionLogEntry[] }
```

- `career` holds **stored totals**, not values derived from `log`, so the log
  cap never loses a career figure.
- `log` keeps the **most recent 200** entries (~200 B each, ~40 KB/pilot).
- Outcome: `bankMissionResult`'s `'landed'` splits on the landing report --
  `report.at?.kind === 'carrier'` is a `trap`, anything else (named field or
  off-field) is `field`. `'ditched'` and `'killed'` pass through.
- True airspeed is `|state.velocity|`: the sim has no wind (verified
  2026-09-25, no wind term in `src/sim/flight/`), so ground-frame speed is
  airspeed. If wind is ever added this becomes `|velocity − wind|`; the
  accumulator's test names that assumption.

### B.2 Collection

`src/render/flightRecord.ts` (new), pure:

```ts
export type FlightSegment = { flightSeconds: number; maxAltitudeM: number; maxTrueAirspeedMps: number }
export function stepSegment(s: FlightSegment, dtS: number, altitudeM: number, speedMps: number, airborne: boolean): FlightSegment
```

- Stepped once per sim tick from the render loop, with `airborne =
  !onGround(spec, state, groundHeightM)` (`src/sim/ground.ts`). Peaks record
  on every tick; seconds accrue only while airborne.
- Reset on New game, Restart, a scenario switch, and after each bank (the
  same moments `scoredThroughKillsByType` already resets), so a land →
  Continue → crash flight produces two log lines exactly as it already
  produces two `missionsFlown` increments.
- `applyMissionResult` gains the segment, the landing kind, the scenario id,
  aircraft name and loadout; it appends the entry, trims to 200, and folds
  the segment into `career`.

### B.3 Existing data

`validatePilot` fills a missing `career` with zeros and a missing `log` with
`[]` (migrate on read). Same storage key `ww2airsim.roster.v1`; no pilot is
lost. `importRoster` applies the same defaults, so pre-dossier exports still
import. Existing pilots keep their score and kills; the dossier shows
"Records kept since <first log date>" (or "No missions logged yet") so career
kills without matching log lines read as expected, not as a bug.

### B.4 The Dossier sheet

A **Dossier** button in each roster row, beside the pilot's name, opens a
full sheet in the existing memo-form style (the About panel's overlay
pattern, `src/render/dossier.ts`, pure model + thin DOM). Close returns to the
roster with that row's Dossier button focused; Escape closes it.

1. **Header** -- name, rank, status (ACTIVE / KIA, plus "resurrected n×" when
   non-zero), cumulative score, and a progress bar to the next rank (the
   top rank shows "Highest rank").
2. **Service record** -- flight hours (h:mm), sorties, missions; landings as
   traps / field / ditched; highest altitude (ft); fastest speed (kt TAS).
3. **Kills by type** -- the `TARGET_TYPES` table.
4. **Badges** -- a stamp per entry in `badges[]`; empty state: "No badges yet
   -- awarded for completing mission objectives." Missions M2 writes
   `badges[]`; the dossier needs no change when it does.
5. **Mission log** -- newest first: date, scenario, aircraft, outcome,
   points, kills, time, peak altitude, peak speed. Scrolls inside the sheet.

### B.5 Acceptance

Tier 1: `stepSegment` (peaks, airborne-only seconds, the no-wind note);
`applyMissionResult` appends, trims at 200 and keeps `career` totals past the
trim; trap vs field split; migrate-on-read of a v1 record without `career`/
`log`; export → import round trip with a populated log; the dossier model's
formatting (h:mm, ft, kt, next-rank progress, empty states).

Tier 2 (`tests/e2e/dossier.spec.ts`, new): create a pilot, fly a short
sortie from the parked spawn, land, return to title, open the Dossier; the
log has one line with outcome `field`, flight time > 0 and a peak altitude
above the field; Close returns focus to the row.

## Out of scope

- Awarding badges (missions M2).
- Roster export/import UI (still an open §15 item).
- Byte-accurate download progress for terrain L1 -- stage granularity is
  enough once the CPU freeze is gone; revisit if A.4's printed time to
  `ready` shows the 33.6 MB fetch dominating.
