# Plan 9: Pilot roster, live scoring, dynamic scenario switching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `missionScore()`'s hardcoded-zero stub with real scoring
wired to combat state, wrap the shipped title/scenario/loadout screen behind
a persistent pilot roster, and let the scenario picker swap scenarios in
place instead of reloading the page.

**Architecture:** A new pure module `src/render/roster.ts` (persistence,
rank ladder, pilot lifecycle) and a new pure module
`src/sim/weapons/targetType.ts` (the scoring vocabulary, shared by the sim
combat layer and the render scoring layer). `src/sim/weapons/combat.ts`
gains a per-shooter `killsByType` breakdown, credited at its three existing
kill/sink/destroy sites. `src/render/debrief.ts`'s three model builders
(`landingModel`/`debriefModel`/`destructionModel`) each gain a
kills-since-last-bank argument and a recovery outcome. `src/render/titleScreen.ts`
gains a roster step and a `show()` method. `src/render/main.ts`'s boot
sequence is refactored so the scenario/aircraft/ship construction it already
does once becomes a re-invokable `loadScenario(id, loadout)`.

**Tech Stack:** TypeScript, vitest (`environment: 'node'`, no DOM), the
existing render/`sim` split.

**Spec:** `docs/superpowers/specs/2026-09-23-meta-game-design.md`. Read its
§1–§7 before starting. Also read master spec §8
(`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`) for the point
table, recovery multiplier and rank ladder this plan wires against verbatim.

## Ruling: closing the scoring data-model gap (read this before Task 1)

The design doc's §4 ("no new design needed there, only the wiring") assumes
`World.combat` already carries what master spec §8's point table needs. It
does not: today every aircraft is one airframe (no Fighter/Bomber split),
`ShipSpec.role` is `'carrier' | 'escort' | 'merchant'` (no Cruiser/Battleship
split, and neither `'escort'` nor `'merchant'` is a row in §8's table at
all), and `StructureEntity.kind` is `'hangar' | 'tower'` only — there is no
AAA or Runway entity anywhere in the sim. Mark's call (2026-09-23): extend
the content schemas rather than collapse the categories silently. This plan
does that, bounded as follows — recorded here so the scope is visible in one
place rather than scattered across tasks:

- **Aircraft** gain a `role: 'fighter' | 'bomber'` field (Task 1). Every
  aircraft shipped today is `'fighter'` (`f6f-hellcat.json`); a future bomber
  spec sets `'bomber'` and needs no further scoring change.
- **Ships** keep `role` but widen its enum to add `'cruiser'` and
  `'battleship'` (Task 1). No existing ship is reclassified — `essex-cv`
  stays `'carrier'`, `fletcher-dd` stays `'escort'`, `type-b-maru` stays
  `'merchant'` — because none of the three is actually a cruiser or a
  battleship, and inventing one would be a false historical claim, not a
  wiring fix. **`'escort'` and `'merchant'` kills do not feed
  `killsByType`** — they are outside §8's table, and forcing them into the
  nearest bucket would mislabel a sunk destroyer as a downed AAA battery.
  They keep incrementing the pre-existing `shipsSunk` counter (still visible
  wherever that already renders); a future plan that wants them scored gives
  them their own row, rather than this plan guessing one.
- **Structures** gain `'aaa'` as a third `kind` (Task 1), because an AAA
  emplacement is, geometrically, exactly the kind of small ground structure
  `Building`/`StructureEntity` already models — one is added to
  `content/bases/tacloban.json` so the category is reachable. **`'runway'`
  is deliberately NOT added** as a `Building` kind: a runway is a strip, not
  a discrete building, and `src/render/scene/airfield.ts`'s `drawBuilding`
  has no shape for one that isn't a fabricated shed sitting on the tarmac.
  Master spec §8's Runway row (500 pts) stays unreachable until a plan
  designs what destroying a runway actually means (cratering? a fixed-radius
  strike trigger on `airfield.runway` itself?) — the same honest
  "unimplemented, not silently wrong" treatment 13c's abandonment already
  models for this codebase.
- **The recovery multiplier has the same shape of gap.** Master spec §8
  lists four outcomes; the sim's `ContactKind` is only `'ditched' |
  'destroyed'` — there is no bail-out/parachute mechanic, so "bailed out
  over friendly water" (0.25×) has no code path to trigger it. This plan
  implements the three multipliers the sim can actually produce — landed
  (1.0), ditched (0.5), killed (0.0, covering both a fatal impact and a
  combat/structural kill before any ground contact) — and does not invent a
  fourth. `RECOVERY_MULTIPLIER`'s type (Task 3) is a 3-value union, not a
  4-value one, so a caller can't silently pass an outcome that can't happen.

## Global Constraints

- `npm run verify` ends every task. Capture `rc=$?` directly; never gate on
  a grepped pipeline.
- US spelling in every new identifier/comment.
- `localStorage`, not IndexedDB, per Mark's 2026-09-23 decision (design §2).
- Work in place on `main`, no worktree; re-diff against `HEAD` before every
  commit.
- `src/sim/` never imports `render/`; the reverse (render importing sim
  types/functions) is fine and is exactly what `roster.ts`/`debrief.ts` do
  for `TargetType`.
- `loadRoster`/`saveRoster` are the only two functions that touch
  `window.localStorage` (design §2) — everything else in `roster.ts` and in
  the render layer works with plain `PilotRecord[]` values, so Tier 1 covers
  the whole roster lifecycle with no DOM.
- Never push or deploy; both are Mark's call.

## Review Focus

- **Double-banking across a landing's "Continue".** `landingModel`'s
  `continueLabel` lets a pilot land, press Continue, and keep flying in the
  same life. `world.combat`'s `killsByType` is cumulative for the whole
  life, never reset — a second landing (or a later death) later in that
  same continued flight must bank only the kills SINCE the last banking
  event, not the whole cumulative total again. Task 3/6 build
  `killsSince(current, baseline)` and a `scoredThroughKillsByType` baseline
  in `main.ts` specifically to prevent this; Task 6's tests must cover
  land → continue → get one more kill → land again and assert the second
  bank is exactly one kill's worth, not the whole flight's.
- **A pilot with no roster selection.** The title screen's roster step is
  new; until Task 5/6 land, there is no code path where `onNewGame` fires
  without a `pilotId`. Task 6 must handle (and test) that `New pilot` with
  an empty/whitespace name is rejected inline rather than creating a
  blank-named `PilotRecord` that then can't be told apart in the list.
- **`importRoster` on malformed or hand-edited JSON.** The design's own
  signature says it "throws on malformed" (design §2) — Task 4's tests must
  cover a JSON parse failure, a missing required field, and a `rank` value
  outside the ladder, and confirm each throws rather than silently producing
  a half-valid `PilotRecord`. A malformed import silently accepted is a
  corrupted roster the player can't fix.
- **A scenario switch mid-flight (not from the title).** Design §5 restricts
  dynamic switching to "the title's `onNewGame`... and a return-to-title
  flight followed by picking a different scenario" — Task 7's tests must
  confirm `loadScenario` disposes the PREVIOUS scenario's meshes even when
  the previous scenario had MORE entities than the new one (a shrink, not
  just a grow), since a leaked large-to-small switch is exactly the case a
  single manual playtest is least likely to notice.
- **Rank never regresses.** `cumulativeScore` only grows (mission scores are
  never negative — `Math.max` is not needed since every input is
  non-negative by construction, but `rankFor` itself must be tested at every
  threshold boundary from master spec §8's table, not just one interior
  value) — Task 4's tests must hit every one of the ten thresholds, since an
  off-by-one there either promotes a pilot one mission early or traps them
  one point short forever.

---

## Task 1: `TargetType` and the content-schema extensions

**Files:**
- Create: `src/sim/weapons/targetType.ts`
- Modify: `src/sim/flight/schema.ts` (add `role` to `AircraftSpecObject`,
  around line 66, right after `name`)
- Modify: `content/aircraft/f6f-hellcat.json` (add `"role": "fighter"`)
- Modify: `src/sim/world/ships.ts` (widen the `role` enum, line 47)
- Modify: `src/sim/weapons/structures.ts` (widen `StructureEntity.kind`,
  line 12, and `buildStructures`'s use of `b.kind`)
- Modify: `src/sim/world/airfields.ts` (widen `BuildingObject`'s `kind`
  enum, line 25)
- Modify: `src/render/scene/airfield.ts` (widen `drawBuilding`'s parameter
  type, around line 182, to accept `'aaa'`)
- Modify: `content/bases/tacloban.json` (add one `"kind": "aaa"` building)
- Test: `tests/tools/content.test.ts` or wherever aircraft/ship/airfield
  content is already schema-tested (locate by searching for
  `AircraftSpecObject`/`BuildingObject` test coverage)

**Interfaces:**
- Produces: `export type TargetType = 'fighter' | 'bomber' | 'cruiser' |
  'battleship' | 'aaa' | 'runway' | 'building' | 'carrier'`,
  `export const TARGET_TYPES: readonly TargetType[]`,
  `export const zeroKillsByType: () => Readonly<Record<TargetType, number>>`
  (all `src/sim/weapons/targetType.ts`) — Task 2 imports all three;
  Task 3/4 import `TargetType`/`TARGET_TYPES`.
- Produces: `AircraftSpec.role: 'fighter' | 'bomber'`,
  `CombatShip['spec']['role']` (and `ShipSpec.role`) widened to `'carrier' |
  'cruiser' | 'battleship' | 'escort' | 'merchant'`, `StructureEntity.kind`
  and `Building.kind` widened to `'hangar' | 'tower' | 'aaa'`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/weapons/targetType.test.ts (new, colocated -- match this repo's
// existing convention of a colocated *.test.ts next to small sim modules if
// one exists nearby, otherwise tests/sim/weapons/targetType.test.ts)
import { describe, expect, it } from 'vitest'
import { TARGET_TYPES, zeroKillsByType, type TargetType } from './targetType.js'

describe('TargetType', () => {
  it('has exactly master spec §8\'s eight rows', () => {
    const expected: readonly TargetType[] = [
      'fighter', 'bomber', 'cruiser', 'battleship', 'aaa', 'runway', 'building', 'carrier',
    ]
    expect([...TARGET_TYPES].sort()).toEqual([...expected].sort())
  })

  it('zeroKillsByType starts every type at zero', () => {
    const zero = zeroKillsByType()
    for (const t of TARGET_TYPES) expect(zero[t]).toBe(0)
  })
})
```

Add to whichever test file already exercises `AircraftSpecObject`/
`BuildingObject` parsing (search for `loadAircraftSpec`/`'f6f-hellcat'` and
`BuildingObject`/`kind:` in `tests/`): a case asserting
`loadAircraftSpec('f6f-hellcat').role === 'fighter'`, and a case asserting a
`Building` with `kind: 'aaa'` parses successfully while an invalid kind
(e.g. `'bunker'`) is rejected.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/weapons/targetType.test.ts`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/sim/weapons/targetType.ts
/** Master spec §8's point-table rows, and the vocabulary
 * `AircraftCombat.killsByType`/`roster.ts`'s `PilotRecord.killsByType` share
 * with it. Not every value is reachable yet -- see this plan's own "Ruling"
 * section in docs/superpowers/plans/2026-09-23-plan9-meta-game.md for which
 * and why ('runway' has no producing code path today). */
export type TargetType =
  | 'fighter' | 'bomber' | 'cruiser' | 'battleship'
  | 'aaa' | 'runway' | 'building' | 'carrier'

export const TARGET_TYPES: readonly TargetType[] = [
  'fighter', 'bomber', 'cruiser', 'battleship', 'aaa', 'runway', 'building', 'carrier',
]

export function zeroKillsByType(): Readonly<Record<TargetType, number>> {
  return Object.fromEntries(TARGET_TYPES.map((t) => [t, 0])) as Readonly<Record<TargetType, number>>
}
```

In `src/sim/flight/schema.ts`, in `AircraftSpecObject` (around line 66):

```ts
  name: z.string().min(1),
  role: z.enum(['fighter', 'bomber']),
```

In `content/aircraft/f6f-hellcat.json`, add `"role": "fighter"` alongside
`"name"`.

In `src/sim/world/ships.ts` (line 47):

```ts
    role: z.enum(['carrier', 'cruiser', 'battleship', 'escort', 'merchant']),
```

And wherever `CombatShip['spec']['role']`'s inline type is duplicated in
`src/sim/weapons/combat.ts` (line 32), widen it identically:

```ts
    readonly hullHp: number; readonly role: 'carrier' | 'cruiser' | 'battleship' | 'escort' | 'merchant'
```

In `src/sim/world/airfields.ts`'s `BuildingObject` (line 25):

```ts
    kind: z.enum(['hangar', 'tower', 'aaa']),
```

In `src/sim/weapons/structures.ts`'s `StructureEntity` (line 12):

```ts
  readonly kind: 'hangar' | 'tower' | 'aaa'
```

In `src/render/scene/airfield.ts`'s `drawBuilding` (around line 182), widen
the parameter type to match:

```ts
    b: { kind: 'hangar' | 'tower' | 'hut' | 'aaa'; x: number; z: number; width: number; length: number },
```

No new branch is needed inside `drawBuilding`: everything that is not
`'tower'` already falls through to the generic small-building shape (`wall
= b.kind === 'hangar' ? 5.5 : 2.8`), which is what an `'aaa'` emplacement
should look like too — a low structure, not a hangar or a control tower.

In `content/bases/tacloban.json`, add one `'aaa'` building so the category
is reachable in Tier 1 and Tier 2 (placed off to the side of the runway, not
overlapping an existing building or the runway strip):

```json
  {
    "id": "tacloban-aaa-1",
    "kind": "aaa",
    "x": -100,
    "z": 30,
    "widthM": 6,
    "lengthM": 6,
    "hp": 30
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sim/weapons/targetType.test.ts && npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`. Confirm no existing test asserting an exact building count
or an exact `structures` record size for Tacloban breaks — if one does, it
is asserting a count that must now include the new AAA building, which is
the correct, expected change; update that assertion's expected number rather
than reverting the content addition.

- [ ] **Step 5: Commit**

```bash
git add src/sim/weapons/targetType.ts src/sim/weapons/targetType.test.ts \
  src/sim/flight/schema.ts content/aircraft/f6f-hellcat.json \
  src/sim/world/ships.ts src/sim/weapons/combat.ts src/sim/world/airfields.ts \
  src/sim/weapons/structures.ts src/render/scene/airfield.ts \
  content/bases/tacloban.json
git commit -m "Plan 9 task 1: TargetType and the content-schema extensions for scoring"
```

---

## Task 2: Per-type kill crediting in `combat.ts`

**Files:**
- Modify: `src/sim/weapons/combat.ts`:
  - `AircraftCombat` type (line 37-53)
  - `createCombat` (line 77-96)
  - `creditAircraftDamage` (line 513-519) and its caller `damageAircraftAt`
    (line 521-529)
  - `damageStructureAt` (line 531-540)
  - The `shipsSunk` credit loop (line 605-612) and `stepCombat`'s own
    signature (needs a `ships` lookup by id for role, which the function
    already receives as a parameter — confirm the exact parameter name by
    reading `stepCombat`'s signature before editing)
- Test: wherever `AircraftCombat`/`stepCombat`'s kill/sink/structure crediting
  is already tested (search for `shipsSunk`/`structuresDestroyed`/`kills`
  assertions in `tests/sim/weapons/combat.test.ts` or similar)

**Interfaces:**
- Consumes: `TargetType`, `zeroKillsByType` (Task 1).
- Produces: `AircraftCombat.killsByType: Readonly<Record<TargetType,
  number>>` — Task 3's `missionScore` reads this directly off the player's
  own record.

- [ ] **Step 1: Write the failing tests**

Read the existing combat test file first to match its entity/world
construction pattern exactly (it already builds `CombatAircraft`/`CombatShip`/
`StructureEntity` fixtures for the existing `kills`/`shipsSunk`/
`structuresDestroyed` tests — mirror that construction, don't invent a new
one). Add:

```ts
it('credits an aircraft kill to the shooter\'s killsByType, keyed by the target\'s role', () => {
  // Construct a shooter and a 'fighter'-role target at point-blank range
  // with a lethal hit, exactly as the existing "kills" test already does --
  // then additionally assert:
  // expect(after.aircraft[shooterId]!.killsByType.fighter).toBe(1)
})

it('credits a structure kill to killsByType.aaa for an aaa-kind structure, and .building for hangar/tower', () => {
  // Two StructureEntity fixtures, kind 'aaa' and kind 'hangar', both
  // destroyed by the same shooter -- assert killsByType.aaa === 1 and
  // killsByType.building === 1 on the shooter's record.
})

it('credits a sunk carrier/cruiser/battleship to killsByType, but NOT an escort or merchant sink', () => {
  // Four ship fixtures (carrier/cruiser/battleship/escort roles), all sunk
  // by the same shooter -- assert killsByType.carrier/.cruiser/.battleship
  // are each 1, and that shipsSunk is 4 while the escort's role contributes
  // to NO killsByType entry (sum of killsByType values is 3, not 4).
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run <the combat test file>`
Expected: FAIL — `killsByType` does not exist on `AircraftCombat` yet.

- [ ] **Step 3: Implement**

```ts
// src/sim/weapons/combat.ts
import { zeroKillsByType, type TargetType } from './targetType.js'
```

`AircraftCombat` (line 37-53), add one field:

```ts
  readonly killsByType: Readonly<Record<TargetType, number>>
```

`createCombat` (around line 88), seed it:

```ts
      shots: 0, hits: 0, kills: 0, lastHit: null, killsByType: zeroKillsByType(),
```

`creditAircraftDamage` and its call site (lines 513-529):

```ts
  const creditAircraftDamage = (
    before_: Damage, after: Damage, owner: string, round: boolean, targetType: TargetType,
  ): void => {
    const shooter = records[owner]
    if (shooter === undefined) return
    const killed = before_.destroyedAt === null && after.destroyedAt !== null
    if (!round && !killed) return
    records[owner] = {
      ...shooter,
      hits: shooter.hits + (round ? 1 : 0),
      kills: shooter.kills + (killed ? 1 : 0),
      killsByType: killed
        ? { ...shooter.killsByType, [targetType]: shooter.killsByType[targetType] + 1 }
        : shooter.killsByType,
    }
  }

  const damageAircraftAt = (target: CombatAircraft, amount: number, system: DamageSystem | null, owner: string, point: Vec3 | null): void => {
    const rec = records[target.id]
    if (rec === undefined || rec.damage.destroyedAt !== null || target.impact !== null) return
    const damage = system === null
      ? blastDamageAircraft(target.spec, rec.damage, amount, tick, owner)
      : damageFromHit(target.spec, rec.damage, system, tick, owner)
    records[target.id] = point === null ? { ...rec, damage } : { ...rec, damage, lastHit: { tick, position: point } }
    creditAircraftDamage(rec.damage, damage, owner, system !== null, target.spec.role)
  }
```

`damageStructureAt` (lines 531-540):

```ts
  const damageStructureAt = (s: StructureEntity, amount: number, owner: string): void => {
    const was = structureDamage[s.id]
    if (was === undefined) return
    const now = damageStructure(was, amount, tick, owner)
    structureDamage[s.id] = now
    if (was.destroyedTick !== null || now.destroyedTick === null) return
    if (enemyStructureIds !== null && !enemyStructureIds.has(s.id)) return
    const shooter = records[owner]
    if (shooter === undefined) return
    const targetType: TargetType = s.kind === 'aaa' ? 'aaa' : 'building'
    records[owner] = {
      ...shooter,
      structuresDestroyed: shooter.structuresDestroyed + 1,
      killsByType: { ...shooter.killsByType, [targetType]: shooter.killsByType[targetType] + 1 },
    }
  }
```

The `shipsSunk` loop (lines 605-612) needs each ship's role at credit time.
Locate `stepCombat`'s own parameter list (its `ships` parameter — read the
function's opening lines to get the exact name before editing) and add,
near where `shipDamage`/`structureDamage` mutable copies are first built:

```ts
  const shipRoleById = new Map(ships.map((s) => [s.id, s.spec.role]))
```

then change the credit loop:

```ts
  for (const [id, d] of Object.entries(shipDamage)) {
    if (d.destroyedTick === null || d.sinkingFraction >= 1) continue
    const sinkingFraction = Math.min(1, d.sinkingFraction + dt / SINK_SECONDS)
    shipDamage[id] = { ...d, sinkingFraction }
    if (sinkingFraction < 1 || d.attacker === null) continue
    const shooter = records[d.attacker]
    if (shooter === undefined) continue
    const role = shipRoleById.get(id)
    const targetType: TargetType | null =
      role === 'carrier' || role === 'cruiser' || role === 'battleship' ? role : null
    records[d.attacker] = {
      ...shooter,
      shipsSunk: shooter.shipsSunk + 1,
      killsByType: targetType === null
        ? shooter.killsByType
        : { ...shooter.killsByType, [targetType]: shooter.killsByType[targetType] + 1 },
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`. Confirm every pre-existing `kills`/`shipsSunk`/
`structuresDestroyed` assertion in this file still passes unmodified — this
task adds a field, it does not change when the existing counters increment.

- [ ] **Step 5: Commit**

```bash
git add src/sim/weapons/combat.ts <the combat test file>
git commit -m "Plan 9 task 2: credit kills by target type in combat.ts"
```

---

## Task 3: `missionScore()`, real recovery multiplier, model builders

**Files:**
- Modify: `src/render/debrief.ts`
- Test: wherever `missionScore`/`landingModel`/`debriefModel`/
  `destructionModel` are already tested (search for these names in
  `tests/render/debrief.test.ts` or similar)

**Interfaces:**
- Consumes: `TargetType`, `TARGET_TYPES` (Task 1); `AircraftCombat`
  (`src/sim/weapons/combat.ts`, Task 2's `killsByType`).
- Produces: `killsSince(current, baseline): Readonly<Record<TargetType,
  number>>`, `RecoveryOutcome = 'landed' | 'ditched' | 'killed'`,
  `RECOVERY_MULTIPLIER: Readonly<Record<RecoveryOutcome, number>>`,
  `missionScore(killsByType, outcome): { rows, total, multiplier }`.
  `landingModel`/`debriefModel`/`destructionModel` each gain a
  `killsSinceLastBank: Readonly<Record<TargetType, number>>` parameter —
  Task 6's `main.ts` computes this via `killsSince` before calling any of
  the three and reads `.score.total` back off the returned `DebriefModel`
  to bank into the roster.

- [ ] **Step 1: Write the failing tests**

```ts
// add to the existing debrief test file
import { killsSince, missionScore, RECOVERY_MULTIPLIER } from '../../src/render/debrief.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'

describe('missionScore', () => {
  it('applies master spec §8\'s point table and the recovery multiplier', () => {
    const kills = { ...zeroKillsByType(), fighter: 2, carrier: 1 }
    const landed = missionScore(kills, 'landed')
    expect(landed.total).toBe(2 * 500 + 1 * 5000)
    const ditched = missionScore(kills, 'ditched')
    expect(ditched.total).toBe(Math.round((2 * 500 + 1 * 5000) * 0.5))
    const killed = missionScore(kills, 'killed')
    expect(killed.total).toBe(0)
  })

  it('every row is present even at zero, in master spec §8\'s eight categories', () => {
    const score = missionScore(zeroKillsByType(), 'landed')
    expect(score.rows).toHaveLength(8)
    expect(score.total).toBe(0)
  })
})

describe('killsSince', () => {
  it('is the per-type difference, not the raw current total', () => {
    const baseline = { ...zeroKillsByType(), fighter: 3 }
    const current = { ...zeroKillsByType(), fighter: 5, carrier: 1 }
    const delta = killsSince(current, baseline)
    expect(delta.fighter).toBe(2)
    expect(delta.carrier).toBe(1)
  })
})
```

Update the existing `landingModel`/`debriefModel`/`destructionModel` tests to
pass a `killsSinceLastBank` argument (a zeroed one for tests only checking
headline/detail text, a populated one to add a new case asserting the score
in the returned model matches `missionScore`'s own output for that outcome).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/debrief.test.ts`
Expected: FAIL — `missionScore` still takes no arguments.

- [ ] **Step 3: Implement**

```ts
// src/render/debrief.ts
import { TARGET_TYPES, type TargetType } from '../sim/weapons/targetType.js'
import type { AircraftCombat } from '../sim/weapons/combat.js'

export function killsSince(
  current: Readonly<Record<TargetType, number>>,
  baseline: Readonly<Record<TargetType, number>>,
): Readonly<Record<TargetType, number>> {
  return Object.fromEntries(TARGET_TYPES.map((t) => [t, current[t] - baseline[t]])) as Readonly<Record<TargetType, number>>
}

const POINTS_BY_TARGET_TYPE: Readonly<Record<TargetType, number>> = {
  fighter: 500, bomber: 750, cruiser: 1500, battleship: 3000,
  aaa: 250, runway: 500, building: 150, carrier: 5000,
}

const TARGET_LABEL: Readonly<Record<TargetType, string>> = {
  fighter: 'Fighter', bomber: 'Bomber', cruiser: 'Cruiser', battleship: 'Battleship',
  aaa: 'AAA Battery', runway: 'Runway', building: 'Building', carrier: 'Carrier',
}

/** The three recovery outcomes the sim can actually produce -- see this
 *  plan's "Ruling" section for why "bailed out over friendly water" (master
 *  spec §8's fourth row, 0.25x) has no member here: there is no bail-out
 *  mechanic to trigger it. */
export type RecoveryOutcome = 'landed' | 'ditched' | 'killed'

export const RECOVERY_MULTIPLIER: Readonly<Record<RecoveryOutcome, number>> = {
  landed: 1.0, ditched: 0.5, killed: 0.0,
}

/**
 * The mission's score: master spec §8's point table applied to kills SINCE
 * the last bank (`killsSince`, so a landing followed by "Continue" and more
 * flying does not re-bank the whole flight's cumulative total), times the
 * recovery multiplier for how this flight/segment ended.
 */
export function missionScore(
  killsByType: Readonly<Record<TargetType, number>>,
  outcome: RecoveryOutcome,
): { readonly rows: readonly ScoreRow[]; readonly total: number; readonly multiplier: number } {
  const multiplier = RECOVERY_MULTIPLIER[outcome]
  const rows = TARGET_TYPES.map((t) => ({
    target: TARGET_LABEL[t],
    destroyed: killsByType[t],
    score: Math.round(killsByType[t] * POINTS_BY_TARGET_TYPE[t] * multiplier),
  }))
  return { rows, total: rows.reduce((sum, r) => sum + r.score, 0), multiplier }
}
```

Update the three model builders to accept and thread through
`killsSinceLastBank`:

```ts
export function landingModel(
  report: LandingReport,
  killsSinceLastBank: Readonly<Record<TargetType, number>>,
  shipNames: Readonly<Record<string, string>> = {},
): DebriefModel {
  // ...unchanged body above `return`...
  return {
    // ...unchanged fields...
    score: missionScore(killsSinceLastBank, 'landed'),
    continueLabel: 'Continue',
  }
}

export function debriefModel(
  impact: Impact,
  state: AircraftState,
  killsSinceLastBank: Readonly<Record<TargetType, number>>,
): DebriefModel {
  // ...unchanged figures/detail logic...
  const outcome = impact.kind === 'ditched' ? 'ditched' as const : 'killed' as const
  // ...replace both `score: missionScore()` call sites in this function
  // (the 'ditched' early return and the fall-through) with
  // `score: missionScore(killsSinceLastBank, outcome)` /
  // `score: missionScore(killsSinceLastBank, 'ditched')` respectively...
}

export function destructionModel(
  state: AircraftState,
  attacker: string | null,
  killsSinceLastBank: Readonly<Record<TargetType, number>>,
): DebriefModel {
  return {
    // ...unchanged headline/detail/figures...
    score: missionScore(killsSinceLastBank, 'killed'),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`. This will not compile until Task 6 updates `main.ts`'s
three call sites to pass the new argument — if this task is executed in
strict task order, expect `main.ts`'s typecheck to fail here; note that in
the task's own commit message rather than papering over it with an `any`,
and confirm it is fixed by the end of Task 6, before `npm run verify` is
required to pass again at that task's own Step 4/5.

- [ ] **Step 5: Commit**

```bash
git add src/render/debrief.ts <the debrief test file>
git commit -m "Plan 9 task 3: real missionScore(), recovery multiplier, killsSince"
```

---

## Task 4: `roster.ts`

**Ruling (controller, overnight run, 2026-09-23):** this repo's vitest
`environment: 'node'` provides no `window` global at all — confirmed
directly against this checkout's Node v22 (`globalThis.window` and
`globalThis.localStorage` are both `undefined` by default; Node's own
experimental `localStorage` global, where available, is not `window`-
scoped either). `loadRoster`/`saveRoster`'s design-mandated
`window.localStorage` usage (design §2) would throw "window is not
defined" the instant the persistence tests ran. Fixed in the test file's
own setup (below) with a minimal in-memory fake `window.localStorage`,
rather than changing production code to a different global — the
persistence functions are correctly browser-shaped for their real runtime;
only the Node test environment needed a shim. **Cost if wrong:** contained
entirely to `tests/render/roster.test.ts`'s `beforeEach`; production
`roster.ts` is unaffected either way.

**Files:**
- Create: `src/render/roster.ts`
- Test: `tests/render/roster.test.ts` (new, `environment: 'node'` per this
  project's vitest config — no DOM, matching `titleScreen.test.ts`/
  `debrief.test.ts`'s existing split)

**Interfaces:**
- Consumes: `TargetType`, `zeroKillsByType` (Task 1).
- Produces: `Rank`, `RANK_LADDER`, `rankFor(cumulativeScore): Rank`,
  `PilotRecord`, `loadRoster()`, `saveRoster(roster)`, `exportRoster(roster)`,
  `importRoster(json)`, `createPilot(name): PilotRecord`,
  `startSortie(pilot): PilotRecord`, `applyMissionResult(pilot, scoreTotal,
  outcome): PilotRecord` — Task 5/6 use all of these from the render layer.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/roster.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import {
  RANK_LADDER, applyMissionResult, createPilot, exportRoster, importRoster,
  loadRoster, rankFor, saveRoster, startSortie, type PilotRecord,
} from '../../src/render/roster.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'

describe('rankFor', () => {
  it('matches master spec §8\'s ladder at every threshold', () => {
    for (const { threshold, abbrev } of RANK_LADDER) {
      expect(rankFor(threshold).abbrev).toBe(abbrev)
      if (threshold > 0) expect(rankFor(threshold - 1).abbrev).not.toBe(abbrev)
    }
  })
})

describe('roster persistence', () => {
  // This repo's vitest config (`environment: 'node'`) provides no DOM and
  // no `window` global at all -- confirmed against this checkout's own
  // Node (v22): `globalThis.window`/`globalThis.localStorage` are both
  // `undefined` by default. `loadRoster`/`saveRoster` correctly use
  // `window.localStorage` (design §2 says persistence is a browser
  // concern), so the test file supplies a minimal in-memory fake `window`
  // here rather than changing production code to a different global --
  // `titleScreen.test.ts`/`debrief.test.ts`'s "test the pure pieces only"
  // convention is about not driving DOM construction, not about avoiding
  // every browser global a pure-looking function happens to call.
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        clear: () => store.clear(),
      },
    }
  })

  it('save/load round-trips exactly', () => {
    const pilot = createPilot('Boyington')
    saveRoster([pilot])
    expect(loadRoster()).toEqual([pilot])
  })

  it('export/import round-trips exactly', () => {
    const pilot = createPilot('Boyington')
    expect(importRoster(exportRoster([pilot]))).toEqual([pilot])
  })

  it('importRoster throws on malformed JSON', () => {
    expect(() => importRoster('not json')).toThrow()
  })

  it('importRoster throws on a missing required field', () => {
    const pilot = createPilot('Boyington') as unknown as Record<string, unknown>
    delete pilot.id
    expect(() => importRoster(JSON.stringify([pilot]))).toThrow()
  })

  it('importRoster throws on a rank not in the ladder', () => {
    const pilot = { ...createPilot('Boyington'), rank: { abbrev: 'XYZ', name: 'Not A Rank', threshold: 0 } }
    expect(() => importRoster(JSON.stringify([pilot]))).toThrow()
  })
})

describe('pilot lifecycle', () => {
  it('startSortie increments sorties and, for a kia pilot, resurrects without erasing history', () => {
    const fresh = createPilot('Boyington')
    const flown = startSortie(fresh)
    expect(flown.sorties).toBe(1)
    expect(flown.status).toBe('active')

    const kia: PilotRecord = { ...fresh, status: 'kia', missionsFlown: 3, killsByType: { ...zeroKillsByType(), fighter: 2 } }
    const revived = startSortie(kia)
    expect(revived.status).toBe('active')
    expect(revived.resurrections).toBe(1)
    expect(revived.missionsFlown).toBe(3) // history not erased
    expect(revived.killsByType.fighter).toBe(2) // history not erased
  })

  it('applyMissionResult banks score, promotes, and marks kia only on a kill', () => {
    const pilot = createPilot('Boyington')
    const landed = applyMissionResult(pilot, 3000, 'landed')
    expect(landed.cumulativeScore).toBe(3000)
    expect(landed.missionsFlown).toBe(1)
    expect(landed.status).toBe('active')
    expect(landed.rank.abbrev).toBe('LTJG') // 2,500 threshold crossed

    const killed = applyMissionResult(pilot, 100, 'killed')
    expect(killed.status).toBe('kia')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/roster.test.ts`
Expected: FAIL — `src/render/roster.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/render/roster.ts
import { TARGET_TYPES, zeroKillsByType, type TargetType } from '../sim/weapons/targetType.js'
import type { RecoveryOutcome } from './debrief.js'

export type Rank = { readonly abbrev: string; readonly name: string; readonly threshold: number }

/** Master spec §8's ladder, with §8's own period-accuracy substitution
 *  (Commodore/Rear Admiral for the modern one-/two-star titles) already
 *  applied -- this table IS the substitution, not a later patch on top of
 *  the modern one. */
export const RANK_LADDER: readonly Rank[] = [
  { abbrev: 'ENS', name: 'Ensign', threshold: 0 },
  { abbrev: 'LTJG', name: 'Lieutenant, junior grade', threshold: 2_500 },
  { abbrev: 'LT', name: 'Lieutenant', threshold: 7_500 },
  { abbrev: 'LCDR', name: 'Lieutenant Commander', threshold: 17_500 },
  { abbrev: 'CDR', name: 'Commander', threshold: 35_000 },
  { abbrev: 'CAPT', name: 'Captain', threshold: 60_000 },
  { abbrev: 'COMO', name: 'Commodore', threshold: 100_000 },
  { abbrev: 'RADM', name: 'Rear Admiral', threshold: 150_000 },
  { abbrev: 'VADM', name: 'Vice Admiral', threshold: 225_000 },
  { abbrev: 'ADM', name: 'Admiral', threshold: 325_000 },
]

export function rankFor(cumulativeScore: number): Rank {
  let current = RANK_LADDER[0]!
  for (const rank of RANK_LADDER) {
    if (cumulativeScore >= rank.threshold) current = rank
  }
  return current
}

export type PilotRecord = {
  readonly id: string
  readonly name: string
  readonly rank: Rank
  readonly cumulativeScore: number
  readonly missionsFlown: number
  readonly sorties: number
  readonly killsByType: Readonly<Record<TargetType, number>>
  readonly badges: readonly string[]
  readonly status: 'active' | 'kia'
  readonly resurrections: number
}

let nextId = 1

export function createPilot(name: string): PilotRecord {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('a pilot needs a name')
  return {
    id: `pilot-${Date.now()}-${nextId++}`,
    name: trimmed,
    rank: RANK_LADDER[0]!,
    cumulativeScore: 0,
    missionsFlown: 0,
    sorties: 0,
    killsByType: zeroKillsByType(),
    badges: [],
    status: 'active',
    resurrections: 0,
  }
}

export function startSortie(pilot: PilotRecord): PilotRecord {
  return {
    ...pilot,
    sorties: pilot.sorties + 1,
    status: 'active',
    resurrections: pilot.status === 'kia' ? pilot.resurrections + 1 : pilot.resurrections,
  }
}

export function applyMissionResult(
  pilot: PilotRecord,
  scoreTotal: number,
  outcome: RecoveryOutcome,
): PilotRecord {
  const cumulativeScore = pilot.cumulativeScore + scoreTotal
  return {
    ...pilot,
    cumulativeScore,
    rank: rankFor(cumulativeScore),
    missionsFlown: pilot.missionsFlown + 1,
    status: outcome === 'killed' ? 'kia' : pilot.status,
  }
}

const STORAGE_KEY = 'ww2airsim.roster.v1'

function validatePilot(value: unknown): PilotRecord {
  if (typeof value !== 'object' || value === null) throw new Error('pilot record is not an object')
  const v = value as Record<string, unknown>
  for (const field of ['id', 'name', 'rank', 'cumulativeScore', 'missionsFlown', 'sorties', 'killsByType', 'badges', 'status', 'resurrections']) {
    if (!(field in v)) throw new Error(`pilot record missing "${field}"`)
  }
  const rank = v.rank as Rank
  if (!RANK_LADDER.some((r) => r.abbrev === rank.abbrev && r.threshold === rank.threshold)) {
    throw new Error(`unknown rank "${rank.abbrev}"`)
  }
  const killsByType = v.killsByType as Record<string, unknown>
  for (const t of TARGET_TYPES) {
    if (typeof killsByType[t] !== 'number') throw new Error(`killsByType missing "${t}"`)
  }
  return v as unknown as PilotRecord
}

export function loadRoster(): readonly PilotRecord[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return []
  return (JSON.parse(raw) as unknown[]).map(validatePilot)
}

export function saveRoster(roster: readonly PilotRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roster))
}

export function exportRoster(roster: readonly PilotRecord[]): string {
  return JSON.stringify(roster, null, 2)
}

export function importRoster(json: string): readonly PilotRecord[] {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('roster export is not an array')
  return parsed.map(validatePilot)
}
```

`roster.ts` importing `RecoveryOutcome` from `debrief.ts` (a type-only
import) does not violate the `sim`-boundary rule (both are `render/`) and
does not create a runtime cycle since it is `import type`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/render/roster.test.ts`
Expected: PASS, all cases including every rank threshold.

- [ ] **Step 5: Commit**

```bash
git add src/render/roster.ts tests/render/roster.test.ts
git commit -m "Plan 9 task 4: roster.ts -- pilot records, rank ladder, persistence"
```

---

## Task 5: Title screen roster step

**Files:**
- Modify: `src/render/titleScreen.ts`
- Test: `tests/render/titleScreen.test.ts`

**Interfaces:**
- Consumes: `PilotRecord`, `loadRoster`, `createPilot`, `startSortie`
  (Task 4).
- Produces: `TitleScreenHandle` gains `show(): void`; `createTitleScreen`'s
  `onNewGame` grows a third parameter:
  `(loadout: Loadout, scenarioId: string, pilotId: string) => void`.

Before editing, read `src/render/titleScreen.ts` lines 1-172 in full (this
plan has only quoted the specific lines it changes) — the roster step must
match the existing scenario/loadout radiogroups' DOM patterns (the file's
own `role="button"`/native `<button>` conventions, per the design doc's own
note that the pilot list should match "the mission chart's `role=\"button\"`
marker pattern") rather than introduce a new one.

- [ ] **Step 1: Write the failing tests**

```ts
// add to tests/render/titleScreen.test.ts
import { createPilot, saveRoster } from '../../src/render/roster.js'

describe('the roster step (Plan 9)', () => {
  it('onNewGame receives the selected pilot\'s id as a third argument', () => {
    // This file's existing tests exercise the PURE pieces only (node
    // environment, no DOM per this file's own L30-35 comment) -- add a pure
    // model-level test here for whatever function titleScreen.ts factors
    // the roster-step's pilot-selection state into (mirroring how the
    // existing scenario/loadout selection already has a pure model
    // function this file's other tests already call) rather than trying to
    // drive createTitleScreen's DOM in a node environment.
  })
})
```

Since this file's suite is DOM-free by design, the concrete test shape
depends on how the roster step's selection state is factored into a pure
function alongside the file's existing pure exports (`titleModel` or
equivalent, per the file's own established pattern) — mirror that pattern
exactly rather than introducing a DOM-driven test here.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/titleScreen.test.ts`
Expected: FAIL, or not yet expressible until Step 3's refactor exists --
if so, write the test immediately after extracting the pure model function
in Step 3, before wiring it into the DOM-building code, so it still serves
as a real red/green gate rather than being written after the fact.

- [ ] **Step 3: Implement**

- Add a roster step above the existing scenario/loadout radiogroups: a list
  of native `<button>` elements, one per `PilotRecord` from `loadRoster()`,
  labelled with the pilot's name, rank abbreviation and `cumulativeScore`,
  plus a `New pilot` entry that reveals an inline text input (Enter or a
  confirm button calls `createPilot(name)`, appends it to the in-memory list
  and selects it — reject an empty/whitespace name inline, per this plan's
  Review Focus, rather than calling `createPilot` and letting it throw into
  the DOM layer uncaught).
- Selecting a pilot reveals the existing scenario/loadout pickers underneath
  (unhide, don't rebuild), labelled with that pilot's name/rank per the
  design doc §3.
- `onNewGame`'s call site (wherever `New game`'s click handler currently
  invokes it) grows the selected pilot's `id` as a third argument.
- Replace the header comment (lines 9-14) that says "There is no `show()`...
  Plan 9 adds the menu that comes back here" — the comment is now stale by
  construction the moment `show()` exists; delete it or replace it with
  what `show()` actually does, per this repo's own rule about not leaving a
  comment that asserts something no longer true.
- Add `show(): void` to `TitleScreenHandle`, implemented as the doc comment
  proposed in the design (§3): rebuild the overlay fresh (simpler and safer
  than reusing DOM nodes an earlier `hide()` removed) and re-read
  `loadRoster()` so a score just banked from the flight that ended is
  reflected immediately.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0` for this file's own suite; `main.ts`'s call site will not
typecheck yet until Task 6 updates it (same caveat as Task 3 Step 4) — note
that in this task's commit rather than hiding it.

- [ ] **Step 5: Commit**

```bash
git add src/render/titleScreen.ts tests/render/titleScreen.test.ts
git commit -m "Plan 9 task 5: title screen roster step and show()"
```

---

## Task 6: Wire roster + real scoring into `main.ts`

**Files:**
- Modify: `src/render/main.ts` (the `createDebrief` construction and Restart
  handler around line 836; the three `debrief.show(...)` call sites at
  lines 1297, 1309 and 1317-1327; the `createTitleScreen`/`onNewGame`
  construction)
- Test: an integration-level test if this repo has one for `main.ts`'s
  boot sequence (search for existing coverage before assuming none exists);
  otherwise this task's correctness is proven by Task 3/4's already-passing
  unit suites plus this task's own Tier 2 pass in Task 8

**Interfaces:**
- Consumes: `loadRoster`, `saveRoster`, `startSortie`, `applyMissionResult`
  (Task 4); `killsSince` (Task 3); `zeroKillsByType` (Task 1).

Before editing, read `src/render/main.ts` lines 1-260 (the `boot()` setup
this plan's Task 7 also touches) and lines 800-1330 in full, to see the
exact current shape of the Restart handler and the three debrief call sites
this plan has only quoted fragments of above.

- [ ] **Step 1: Implement roster state and the banking baseline**

Near wherever `frame`/`landingShown`/`shownImpactTick` are declared as
mutable `let`s in `boot()` (around line 875-882), add:

```ts
  let roster = loadRoster()
  let currentPilotId: string | null = null
  // Reset every time a NEW life starts (loadScenario/New game, and Restart
  // below) -- see this plan's own "Ruling" section on why banking must be a
  // delta against this baseline, not the raw cumulative killsByType.
  let scoredThroughKillsByType = zeroKillsByType()
```

**Ruling (controller, overnight run, 2026-09-23): corrected from the
original text above, based on what Task 5 actually built.** Task 5's
`titleScreen.ts` already calls `startSortie` and `saveRoster` itself,
inside its own `start()` handler, before invoking `onNewGame` — necessary
because `main.ts`'s existing scenario-switch path does a full
`window.location.href` navigation (unfixed until Task 7), which would
silently discard an unpersisted roster change if `titleScreen.ts` didn't
persist first. **Do not re-call `startSortie` here — the pilot handed to
`onNewGame` already has its sortie counted and is already saved.**
Wherever `onNewGame` is wired to `createTitleScreen` (construct it with the
new three-argument signature from Task 5): reload the roster fresh
(`roster = loadRoster()`, picking up `titleScreen.ts`'s own write rather
than trusting a stale boot-time copy), set `currentPilotId` to the received
`pilotId`, and reset `scoredThroughKillsByType = zeroKillsByType()` before
proceeding with whatever `onNewGame` already does today (loading the
scenario — Task 7 changes this to call `loadScenario`). **Cost if wrong:**
calling `startSortie` again here would double-count `sorties` (and, for a
freshly-revived pilot, double-increment `resurrections`) on every single
New Game press — read Task 5's own report
(`.superpowers/sdd/2026-09-23-plan9-meta-game/task-5-report.md`, gitignored
but present in tonight's checkout) for the full reasoning before writing
this task's code.

In the Restart handler (around line 836-871), add the same
`scoredThroughKillsByType = zeroKillsByType()` reset — a Restart is a new
life for scoring purposes exactly like a New game is, even though it keeps
the same pilot and does not call `startSortie` again (Restart is a redo of
the SAME sortie already counted, not a new one).

Add one small local helper near the debrief construction:

```ts
  const bankMissionResult = (scoreTotal: number, outcome: 'landed' | 'ditched' | 'killed'): void => {
    if (currentPilotId === null) return // no roster flow yet reachable pre-Task-5, or a dev-URL bypass
    roster = roster.map((p) => (p.id === currentPilotId ? applyMissionResult(p, scoreTotal, outcome) : p))
    saveRoster(roster)
  }
```

- [ ] **Step 2: Wire the three debrief sites**

Line 1297 (impact):

```ts
      const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
      const model = debriefModel(hit, player.state, killsSinceLastBank)
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      bankMissionResult(model.score.total, hit.kind === 'ditched' ? 'ditched' : 'killed')
      debrief.show(model)
```

Line 1309 (destruction):

```ts
      const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
      const model = destructionModel(player.state, playerDamage.attacker, killsSinceLastBank)
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      bankMissionResult(model.score.total, 'killed')
      debrief.show(model)
```

Lines 1317-1327 (landing):

```ts
      const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
      const model = landingModel(
        current.landing.report,
        killsSinceLastBank,
        Object.fromEntries(current.world.ships.map((s) => [s.id, s.spec.name])),
      )
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      bankMissionResult(model.score.total, 'landed')
      debrief.show(model, () => {
        frame = acknowledgeLanding(frame!)
        landingShown = false
        debrief.hide()
      })
```

Add a "Return to title" button/path per design §1: the debrief's Restart
button already exists; add a second control (or repurpose the landing
path's Continue button when the outcome was NOT a landing — a crash/kill
debrief today has only Restart, per `createDebrief`'s own "ONE button for a
crash" comment) that calls `titleScreen.show()` instead of restarting.
Follow `createDebrief`'s existing button-construction pattern (the `restart`
button at line 181-189) for a new `returnToTitle` button, wired the same
way `cont`/`restart` already are, and pass its handler through
`DebriefModel`/`createDebrief`'s signature the same way `onContinue`
already is threaded (a model-level optional callback, not a hardcoded
global).

- [ ] **Step 3: Write and run the tests**

Add to whichever test covers `main.ts`'s boot sequence (or, if none exists,
add a focused new test in `tests/render/debrief.test.ts` for the pure
`bankMissionResult`-equivalent logic factored as a testable function rather
than leaving it inline in `main.ts` only — prefer extracting
`bankMissionResult`'s pilot-update logic as a small exported pure function
if the file has no other precedent for testing `main.ts`'s own closures
directly): the land → continue → get one more kill → land again sequence
from this plan's Review Focus, asserting the second bank equals exactly one
kill's worth via `killsSince`, not the full cumulative total.

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`.

- [ ] **Step 4: Commit**

```bash
git add src/render/main.ts src/render/debrief.ts src/render/titleScreen.ts
git commit -m "Plan 9 task 6: wire roster persistence and real scoring into main.ts"
```

---

## Task 7: Dynamic scenario switching

**Files:**
- Modify: `src/render/main.ts` (`boot()`'s scenario-loading sequence,
  `loadScenarioBundle` through the `airframes`/`shipHandles` construction —
  design doc §5 names this range; locate its exact current line span by
  reading the file, since Task 6 will have shifted it slightly)

**Interfaces:**
- Produces: `loadScenario(id: string, loadout: Loadout): Promise<void>` (or
  the equivalent async function this refactor extracts) — called from
  initial boot, from the title's `onNewGame` when the picked scenario
  differs from what is loaded, and from a return-to-title flight followed by
  picking a different scenario.

Before editing, read `src/render/main.ts`'s full boot-time sequence from
wherever `loadScenarioBundle` is first called (design doc cites line 539)
through the `airframes`/`shipHandles` construction (design doc cites lines
737/771) — Task 6 will have added code above this range, so re-locate it by
content, not by these now-stale line numbers.

- [ ] **Step 1: Extract `loadScenario`**

Per design §5: terrain/ocean/sky are world geography and are NOT rebuilt on
a scenario switch (every scenario sits in the same Leyte Gulf tangent
plane); only what `scenarioWorld`'s entity lists size —
`airframes`/`shipHandles` (and any per-entity-index lookups derived from
them, e.g. `smokes`/prop/`hellcatRoot`-by-player-index) — is rebuilt. The
panel is per-player, not per-entity-count, and stays in place (already how a
loadout change works today).

Extract the sequence into:

```ts
async function loadScenario(
  id: string,
  loadout: Loadout,
  /* ...whatever shared context (scene, terrain field once loaded, etc.)
     the existing boot-time sequence already closes over -- keep this an
     inner function of boot() if that is simpler than threading every
     dependency as a parameter, matching this file's existing style of
     large closures over `boot()`'s own scope rather than free functions. */
): Promise<void> {
  // The exact body of today's boot-time sequence, relocated unchanged for
  // the FIRST call (initial boot) -- this must be a pure relocation with
  // no behavior change for that path, verified by Tier 1/Tier 2 passing
  // identically to before this task.
}
```

On a repeat call (the scenario picked differs from what is currently
loaded): **dispose every mesh in the current `airframes`/`shipHandles`**
(geometry, material, remove from `scene`) before building the new arrays —
per design §5, nothing in this codebase disposes an aircraft or ship mesh
today, so this is new code with no existing pattern to copy; write it
explicitly for every `Object3D` the current `airframes`/`shipHandles`
construction creates (walk each handle's own root object's children,
calling `.geometry.dispose()`/`.material.dispose()` on any `Mesh`, then
`scene.remove(root)`), rather than assuming a single dispose call cascades.

`bundle`, `scenarioWorld`, `airframes`, `shipHandles` become `let`s the
render loop and diagnostics hook read fresh, reassigned by `loadScenario` —
the same hoist-and-reassign shape this file already uses for `sunState`/
`radarSweepRad` (locate those two for the exact existing pattern to mirror).

- [ ] **Step 2: Wire the three call sites**

1. Initial boot: call `loadScenario` where the sequence used to run inline —
   behavior must be unchanged.
2. The title's `onNewGame`, when the picked `scenarioId` differs from what
   is currently loaded: call `loadScenario` instead of today's
   `window.location.href = ?scenario=<id>` navigation (locate this in
   `src/render/spawn.ts`/`main.ts` per the design doc's citation of line
   229 pre-Task-6 — re-locate by content).
3. A return-to-title flight (via Task 6's new "Return to title" path)
   followed by picking a different scenario from the picker: the same
   `onNewGame` path as (2), since `show()` itself does not reload anything.

- [ ] **Step 3: Write and run the tests**

Add an e2e or integration test (per this file's own existing test coverage
for the scenario picker, if any — extend it) proving: switching from a
scenario with N aircraft/M ships to one with a different N'/M' produces
exactly N'/M' entities afterward, and (per this plan's Review Focus) that a
shrink (N' < N) still disposes every mesh from the larger scenario, not
just the ones the smaller scenario's count happens to reuse.

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`.

- [ ] **Step 4: Commit**

```bash
git add src/render/main.ts
git commit -m "Plan 9 task 7: dynamic scenario switching, no page reload"
```

---

## Task 8: Reference-GPU acceptance

**Files:**
- Create: `tests/e2e/meta-game.spec.ts`

- [ ] **Step 1: Write the spec**

Per design §7's Tier 2 acceptance: on the reference GPU, pick/create a
pilot, fly `gunnery-range`, land, see a real non-zero score and (if the
roster was fresh) a promotion, hit Return to title, see the same pilot with
the updated score, switch to `pursuit-range` WITHOUT a page navigation, and
fly it — proving both the roster round-trip and the dynamic switch in one
pass. Assert zero WebGPU validation errors and the render-time budget held
after at least two scenario switches in one session (a leaked-mesh
regression a single switch would not surface). Follow
`tests/e2e/ai-pursuit.spec.ts`'s structure (`page.goto`, `waitForTerrain`,
`page.evaluate` against `window.__ww2`, a `page.screenshot()` before
asserting the GPU budget) for the concrete Playwright shape — read that file
first (already read in full while writing this plan; its pattern is the one
to match).

- [ ] **Step 2: Run it on the reference GPU**

```sh
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
  npx playwright test tests/e2e/meta-game.spec.ts
```

Expected: 1 passed, on the AMD RDNA 2 reference adapter at 2560×1440. Read
the screenshot before trusting the pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/meta-game.spec.ts
git commit -m "Plan 9 task 8: reference-GPU acceptance for roster, scoring, dynamic switching"
```

---

## Closing this plan

Write `docs/handoff/2026-09-23-plan9-meta-game.md` (what landed, Tier 1
evidence with `npm run verify`'s exact `rc=0` line, Tier 2 evidence with the
measured p95 and screenshot path, commits, remaining work — explicitly list
the two named gaps this plan leaves open: Runway as a scorable target, and
"bailed out over friendly water" as a reachable recovery outcome). Update
master spec §15's Plan 9 row (currently "Title screen landed... roster,
mission select and return-to-title remain") to record completion. Do not
push `main` or deploy.
