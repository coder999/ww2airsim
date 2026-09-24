# Meta-game: pilot roster, live scoring, dynamic scenario switching

2026-09-23. Closes out Plan 9 (master spec §8, §15's "roster, mission select
and return-to-title remain"). The title screen itself, a loadout picker and
a scenario picker already shipped (2026-09-19, 2026-09-23) — this slice wraps
them behind a persistent pilot roster, makes scoring real instead of a
hardcoded-zero stub, and removes the page-reload the scenario picker
currently needs to switch scenarios.

Master spec §8 is the authoritative vision for scoring (the points-per-target
table, the recovery multiplier, the rank ladder, badges) and the pilot-record
shape. This document does not restate those; it is the execution architecture
around them — what changes in `src/render/`, in what order, and the one
place this slice deliberately diverges from §8's letter (persistence
technology).

## 1. Player-visible result

The title screen gains a roster step *before* today's scenario/loadout
picker: a list of pilots (name, rank, cumulative score), each selectable to
fly, with a way to create a new one. Flying a mission and landing (or not)
now produces a real debrief — per-target points, the recovery multiplier
actually applied, the banked total, any promotion — instead of every field
reading zero. The debrief gains a second button, "Return to title", which
goes back to the roster rather than only offering Restart. Picking a
*different* scenario from the picker no longer reloads the page — it swaps
the flyable world in place, the same way Restart already does today for a
loadout change.

## 2. Pilot roster and persistence

**Diverges from §8 here: `localStorage`, not IndexedDB.** The vision spec
named IndexedDB; at the actual scale a roster reaches (a handful of pilots,
each a few hundred bytes), that buys nothing IndexedDB's async
transaction/versioned-schema machinery is suited for, over one JSON blob
read/written synchronously. Decided 2026-09-23 (Mark). Export/import (§8's
own requirement, "a pilot survives a cleared browser") is unaffected either
way — it is a JSON blob download/upload regardless of where the live copy
lives.

```ts
// src/render/roster.ts (new)
export type PilotRecord = {
  readonly id: string           // stable, not the display name (renaming must not orphan history)
  readonly name: string
  readonly rank: Rank           // the ladder from master spec §8
  readonly cumulativeScore: number
  readonly missionsFlown: number
  readonly sorties: number
  readonly killsByType: Readonly<Record<TargetType, number>>
  readonly badges: readonly string[]
  readonly status: 'active' | 'kia'
  readonly resurrections: number
}

export function loadRoster(): readonly PilotRecord[]
export function saveRoster(roster: readonly PilotRecord[]): void
export function exportRoster(roster: readonly PilotRecord[]): string   // JSON, for a download
export function importRoster(json: string): readonly PilotRecord[]     // validated, throws on malformed
```

`loadRoster`/`saveRoster` are the only two functions that touch
`window.localStorage` — everything else in this module and in the UI layer
works with plain `PilotRecord[]` values, so the Tier 1 suite can exercise the
whole roster lifecycle (create, fly, score, promote, die, resurrect) without
a DOM or a browser storage global, the same "pure model, thin DOM" split
`titleScreen.ts`/`debrief.ts` already use.

**Resurrection.** Selecting a `kia` pilot and starting a flight is itself
the resurrection: `status` flips back to `active` and `resurrections`
increments the moment `New game` is pressed with that pilot selected — no
separate confirmation step. The death record is not erased (§8: "does not
erase the death" — `missionsFlown`/`killsByType`/`badges` accumulated before
the death stay on the record).

## 3. Title screen restructuring

`createTitleScreen` gains a roster step ahead of the existing scenario/
loadout radiogroups: a list (native `<button>` per pilot, matching the
mission chart's `role="button"` marker pattern) plus a "New pilot" entry
that prompts for a name inline. Selecting a pilot reveals today's
scenario/loadout pickers underneath, now labeled with that pilot's name and
rank. `New game` behaves as it does today, but the callback signature grows
a third value: `onNewGame(loadout, scenarioId, pilotId)`.

**`show()` is invented for the first time.** `titleScreen.ts`'s own
long-standing comment says exactly this: "There is no `show()`... Plan 9
adds the menu that comes back here." `createTitleScreen`'s returned handle
gains `show(): void`, re-attaching the overlay (rebuilding it fresh is
simpler and safer than trying to reuse DOM nodes an earlier `hide()` already
removed) and re-reading the current roster from `loadRoster()` so a score
just banked from the flight that ended is reflected immediately.

## 4. Scoring, live

`debrief.ts`'s `missionScore()` currently returns every category at zero
with an explicit comment that nothing destructible existed yet when it was
written. That is no longer true: `World.combat` already tracks aircraft
kills, ship sinkings and structure destruction (Plan 6/6b). `missionScore()`
is rewired to read the player's own `AircraftCombat` record plus
`combat.ships`/`combat.structures`, apply master spec §8's point table by
target type, and apply the recovery multiplier from the flight's actual
outcome (`Impact`'s kind/surface — already exactly the data `contactOutcome`
classifies for the crash/splash/land distinction the debrief headline
already uses). The banked total, rank-ladder lookup and promotion check all
follow directly from §8's own tables — no new design needed there, only the
wiring from live `World` state into the numbers `createDebrief` already
knows how to render.

## 5. Dynamic scenario switching

Today's scenario picker (2026-09-23) navigates to `?scenario=<id>` and lets
a full page reload re-enter `boot()`, because `airframes`/`shipHandles`/
`panel` are built ONCE at boot, sized off whichever scenario's entity list
(`scenarioWorld.aircraft`/`scenarioWorld.ships`) loaded eagerly — nothing
after boot has ever added or removed a mesh. Folded into this plan because
it touches the exact code Plan 9 is already restructuring (the title
screen's callback, boot's own sequencing), and doing it as a second pass on
top of an already-reworked flow would cost more than doing it once, now.

**The boundary:** terrain, ocean and sky are world geography, not scenario
content — every shipped scenario sits in the same Leyte Gulf tangent-plane,
so none of that needs rebuilding on a scenario switch. Only what
`scenarioWorld`'s entity lists size — `airframes` (and the `smokes`/prop/
`hellcatRoot`-by-player-index lookups derived from it) and `shipHandles` —
does. The panel is per-*player*, not per-entity-count, and every scenario
has exactly one player flying the one shipped airframe, so it is rebuilt in
place (already how a loadout change works today) rather than reconstructed.

**The refactor:** extract today's boot-time sequence — `loadScenarioBundle`
through the `airframes`/`shipHandles` construction — into a named,
re-invokable async function, e.g. `loadScenario(id, loadout)`. On a repeat
call (scenario picked differs from what is currently loaded): dispose every
mesh in the current `airframes`/`shipHandles` (geometry, material, remove
from `scene`) before building the new arrays — nothing in this codebase
disposes an aircraft or ship mesh today, because nothing has ever needed to;
this is new, and it is the one place a leak (GPU memory growing across
repeated switches) can hide with no test able to see it directly. `bundle`,
`scenarioWorld`, `airframes`, `shipHandles` become `let`s the render loop
and the diagnostics hook read fresh, reassigned by `loadScenario` — the same
hoist-and-reassign shape `sunState`/`radarSweepRad` already use for
per-frame state, applied here to per-scenario state instead.

`loadScenario` is called from three places once it exists: initial boot
(unchanged behavior, just relocated), the title's `onNewGame` when the
picked scenario differs from what is loaded, and a return-to-title flight
followed by picking a different scenario — the same path, since `show()`
does not itself reload anything.

## 6. Deliberate boundary

Not in this slice: the aircraft roster (master spec §9, a *different*
roster — historical airframe types, still single-airframe today, separately
gated behind primary-source confirmation per §13's open items); badge
*content* beyond the mechanism (§8 says badges are scenario-defined
objectives — this slice builds the record field and the award mechanism,
not a first real badge, since no scenario currently declares objectives to
award one from); multiplayer or server-side sync of the roster (§8 itself
defers this: "possible later but not worth the coupling now").

## 7. Acceptance

### Tier 1

- Roster lifecycle as pure functions: create, save/load round-trips
  (property test, per §8's own "save/load round-trip equality" requirement),
  export/import, resurrection semantics, score accumulation against the
  point table, rank-ladder promotion at each threshold.
- `missionScore()` against constructed `World.combat` states covering every
  recovery-multiplier case (landed, ditched near friendly, bailed over
  friendly water, killed/captured).
- `loadScenario`'s entity-list sizing: switching between two scenarios with
  different aircraft/ship counts produces exactly the new counts, and (to
  the extent a headless test can see it) the old arrays are the ones marked
  disposed, not reused.

### Tier 2

- The full flow on the reference GPU: pick/create a pilot, fly
  `gunnery-range`, land, see a real non-zero score and (if the roster was
  fresh) a promotion, hit Return to title, see the same pilot with the
  updated score, switch to `pursuit-range` WITHOUT a page navigation this
  time, and fly it — proving both the roster round-trip and the dynamic
  switch in one pass.
- Zero WebGPU validation errors and the render-time budget held after at
  least two scenario switches in one session, specifically to catch a
  leaked-mesh regression a single switch would not surface.
