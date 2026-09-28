# Sortie forms: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints: final product only** (Mark, 2026-09-27).

**Attended: no, run unattended** (Mark, 2026-09-27). Task 8's captures go in the handoff for when he is back.

**Where: a worktree** (Mark, 2026-09-27). Branch `worktree-sortie-forms`, cut from `main` at or after `585cb79`. The branch may be pushed. Merging into `main`, pushing `main` and deploying are Mark's call. For Tier 2, point the worktree's own `vite.config.ts` at a spare dev slot: `ww2airsim-2` on port 5175, or `ww2airsim-3` on port 5174 (repo CLAUDE.md). That edit is local scratch and is never committed.

**Goal:** Replace the two-form title with four forms: Squadron Roster, Sortie Orders, Aircraft Assignment and Ordnance Requisition.
- A Dev checkbox lifts every rule.
- A Dev sortie is not recorded.
- The player is drawn as the aircraft chosen.
- A URL quick launch lets agents skip the forms.

**Architecture:**
- **Pure rules** go in `src/sim/sortie.ts`: eligibility, validation, the Dev-sortie test, the player-spec swap and the Dev stores layout.
- **A pure form-state model** goes in `src/render/sortieFlow.ts`: what each form offers, and what resets when an earlier choice changes.
- **DOM:** `titleScreen.ts` builds the four forms off that model.
- **Wiring:** `main.ts` gets one `SortieChoice` from either the forms or the quick-launch URL. It swaps the player's spec before the bundle's spec fetch, and it gates both recording points on one flag.

**Tech Stack:** TypeScript, Zod 3.25, three.js (WebGPU), vitest (node), Playwright on the reference GPU.

**Spec:** `docs/superpowers/specs/2026-09-27-sortie-forms-design.md`, including amendments A1-A6 (`585cb79`). Read it in full before Task 1; this plan argues from it. Also read the M2 plan's ruling R10 (`docs/superpowers/plans/2026-09-26-m2-mission-ui.md`) and the friendly-fire handoff §3 (`docs/handoff/2026-09-26-friendly-fire.md`).

---

## Measured before writing this plan (`main` at `585cb79`, 2026-09-27)

These are claims to re-check in P3.

- **Every scenario's player flies `f6f-hellcat`**, and only three aircraft have flight specs: `f6f-hellcat`, `f4f-wildcat` and `a6m2-zero`. Both US specs carry 2 racks and 6 rails; the Zero has no `stores`. Every scenario's start, from `content/scenarios/*.json`:

  | start | scenarios |
  | --- | --- |
  | `carrier` (`parkedAt.ship`) | `deck-quals`, `deck-quals-mission` |
  | `airfield` (`parkedAt.airfield`) | `free-flight`, `gunnery-range`, `strike-range`, `friendly-fire-field`, `airfield-strike`, `dev-mission-ui`, `dev-mission-circuit` |
  | `airborne` (`airborneAt`) | `pursuit-range`, `pursuit-range-veteran`, `furball-range`, `friendly-fire-range`, `convoy-strike`, `combat-air-patrol` |

  Briefing `loadout`s: `clean` for `deck-quals-mission`, `combat-air-patrol` and both `dev-` fixtures; `both` for `airfield-strike` and `convoy-strike`. Ranges have no briefing.
- **The player's mesh follows its spec's `view.model`.** Aircraft meshes are built by `scenarioEntities.ts:72` with `loadAirframe(a.spec.view.model, a.spec.stores)`. `f6f-hellcat.json` says `"model": "wildcat"`. `f6f-hellcat` is registered as a rigged model (`AIRFRAME_RIGS`, `airframeRigs.ts`) with a committed glb. So A4 is a one-line content edit plus proof; no render-code change picks the mesh.
- **Stores reach the player only.** `worldFromScenario` (`src/sim/scenario.ts:591`) gives `storesFromLoadout` to `s.player` and `emptyStores` to everyone else. `combat.ts:432/463` read `a.spec.stores` only at release.
- **Sides.** Library entries use `allied | japanese` (`SIDES`, `src/render/hangar/library.ts:21`). The sim's `Side` is `allied | axis` (`src/sim/sides.ts`), is per scenario entity, and defaults to allied only for the player. The spec's new aircraft-spec `side` is the Library vocabulary, and it gates eligibility only (ruling SF-R1).
- **Recording has two points.**
  - `titleScreen.ts`'s `start()` calls `startSortie` and `saveRoster` before `onNewGame`.
  - `main.ts`'s `bankMissionResult` (line 1528) writes the score, kills, mission log, badge, discharge and K.I.A. It is called from three debrief sites (impact, destruction, landing, lines 2160-2211). It is already a no-op when `currentPilotId === null`.
- **Tier 2 reaches flight only through the title.** `startGame` (`tests/e2e/harness.ts:108`) is called by `waitForTerrain` and directly by 5 spec files. `mission-ui.spec.ts` and `friendly-fire.spec.ts` drive the forms themselves. Both assert **recorded** results from scenarios that A1 makes Dev-only:
  - AWARDED on the fixture's row and the badge in the Dossier;
  - `— KIA` and `— DISCHARGED` on the roster and Dossier.

  See ruling SF-R6.
- **`content/` is copied wholesale into `dist/`** (`vite.config.ts`, `copyContent`), so the `dev-` fixtures already ship in production. A Dev checkbox in production can load them.

## Preconditions

- [x] **P1. Create the worktree** with superpowers:using-git-worktrees: branch `worktree-sortie-forms` from `main`. Start the ledger `.superpowers/sdd/2026-09-27-sortie-forms/progress.md`.
- [x] **P2. Baseline.** `remote-run npm run verify; rc=$?; echo "rc=$rc"`. Record rc, the file and test counts, and every named skip in the ledger.
- [x] **P3. Re-check the Measured section.** For each bullet, run the command or read the line cited. Record any difference in the ledger before Task 1. A difference that changes a task is a ruling to write down, not a silent edit.

## Global Constraints

- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library (`.dependency-cruiser.cjs`). `src/sim/sortie.ts` is pure.
- **A default sortie is bit-identical to today.** For every shipped scenario, the world built from the scenario's own aircraft and default loadout must deep-equal today's `worldFromScenario(bundle, null, loadout)`. Task 1 pins this, and it must hold after every task.
- With no options, `startGame(page)` flies the same Hellcat sortie with the same `'both'` default loadout that it flies today (spec, "Harness").
- **Dev exists in every build, production included.** It starts unchecked on each page load and survives return-to-title within the session.
- **`?scenario=` keeps working.** No other existing query parameter changes meaning. `?pilotSkill=`, `?oceanTier=`, `?fx*`, the Beaufort override and `?spawnX/Y/Z` stay DEV-build only, exactly as today.
- Use US spelling. Escape `|` as `\|` in table cells. Every task ends with `npm run verify` via `remote-run`; capture `rc=$?` directly, never through a grep.
- On nexus, run only the test files you touch (`npx vitest run <files>`); full suites go through `remote-run`.

## Rulings

Each is a decision made while writing this plan, stated with its cost if wrong. The executor records any further ruling in the ledger the same way.

- **SF-R1. The spec's new `side` field is named `side` and typed `'allied' | 'japanese'`**, as the approved spec says. Its schema doc comment says it gates eligibility only, and that combat sides come from `sideOf`. It is never read by `src/sim/weapons/` or `src/sim/ai/`; a depcruise-free grep test in Task 1 pins that. Cost if wrong: renaming one field in three JSONs and one schema.
- **SF-R2. `DEV_STORES_LAYOUT` is read from `f6f-hellcat.json`, not copied into TypeScript.** `DEV_STORES_SPEC_ID = 'f6f-hellcat'`; `main.ts` fetches that spec once and passes its `stores` to `sortieBundle`. One source, so the layout cannot drift from the Hellcat. Cost: one extra small fetch, the first time a Dev sortie needs it.
- **SF-R3. A dev-stores player gets a derived spec key.** `sortieBundle` puts the stores-bearing copy under `aircraftSpecs['<id>~dev-stores']` and points only the player's entry at it. The copy keeps `spec.id` unchanged, so kill credit, the Dossier's aircraft name and everything else keyed on `spec.id` are unaffected. An AI aircraft of the same type (M4's raiders when the player flies the Zero) keeps the stores-free spec. Cost if wrong: none outside Dev sorties.
- **SF-R4. The default loadout is the recommendation if allowed, else `DEFAULT_LOADOUT` (`'both'`) if allowed, else `clean`.** The spec says "otherwise the first allowed one", which for a Hellcat range would be `clean`. That breaks the Global Constraint that `startGame` flies today's `'both'` sortie. `clean` is always allowed, so this is total. Cost if wrong: one line in `defaultLoadout`, and every Tier 2 spec's default sortie changes.
- **SF-R5. Changing the mission resets the aircraft to that scenario's own aircraft.** This is A3's mission-change rule applied one form earlier. It also matches the spec's "It preselects the mission's own aircraft". Changing the aircraft keeps the loadout if allowed (A3). Cost if wrong: one function (`withScenario`).
- **SF-R6. `?recordDevSorties` is a DEV-build-only switch** that makes a Dev sortie record anyway. It exists for the Tier 2 specs that must prove the banking chain end to end from Dev-only test beds: friendly-fire K.I.A. and discharge, and the fixture's badge. A5 would otherwise make those assertions impossible. Tier 1 cannot cover this chain because `bankMissionResult` is a `main.ts` closure. A production build ignores the switch, and a Tier 1 test on the query parser pins that. Cost if wrong: remove the switch and rewrite those three assertions to check "Dev sortie: not recorded" and an unchanged roster. The end-to-end banking proof is then lost. **Flag this ruling to Mark in the handoff.**
- **SF-R7. Scenario facts the forms need before any fetch are restated in `SCENARIO_OPTIONS`**: `dev`, `start`, `aircraft`, `recommendedLoadout` and a range's `description`. This is M2 R5's pattern (`kind`, `badge`), and `tests/render/mission/options.test.ts` pins every restated fact against the file. Cost if wrong: an async fetch per selection, and forms that can show stale choices.
- **SF-R8. The "(dev)" labels stay.** Tier 2 selects rows by label substring, and the suffix tells a sandbox player what they are looking at. Cost: none.
- **SF-R9. A quick launch creates the title, then hides it immediately.** It does not skip building it. `title.up()` gates the world in many places. "Return to title" after a quick launch must work normally. Cost: one hidden DOM build per quick launch.

## Addenda (2026-09-27, second-session review, approved by Mark)

A second session drafted a plan for the same spec and compared it with this one. This plan stands; these three items are added to it.

- **AD-1. The harness picks the mission by exact label.**
  - Why: `startGame`'s Scenario pick matches by partial name, and "Air Combat" is part of "Air Combat: Veteran". The first spec that asks for Air Combat would hit a Playwright ambiguity error. `meta-game.spec.ts:116` already works around this with `exact: true`.
  - Where: only the **Scenario** pick gets `exact: true`. The Aircraft pick stays partial, because Task 8 selects `'Zero'` and the three aircraft labels are distinct. The Loadout pick must stay partial, because Task 5 labels a row `Both (recommended)` and specs select it as `'Both'`. Applied in Task 7 Step 1.
  - Cost if wrong: one option on one line.
- **AD-2. A KIA or discharged pilot launching a Dev sortie is not resurrected.**
  - Why: Task 4 skips `startSortie` in `titleScreen.ts`'s `start()` for a Dev sortie, and `startSortie` is where a `kia`/`discharged` pilot flips back to `active` and `resurrections` grows (`src/render/roster.ts`, `startSortie`). That skip lives in the title's DOM layer, which the Node suite cannot reach. Task 4's byte-identical-roster tests cover only the bank after the flight, not this launch-time write.
  - Where: added as Task 8 test 7.
  - Cost if wrong: one Tier 2 test.
- **AD-3 (optional, the executor's call; record the choice in the ledger).** `titleScreen.ts` is about 1,100 lines before this plan, and Task 5 builds three more forms in it. Forms 2-4 may instead go in their own module, `src/render/sortie/sortieForms.ts`, with `titleScreen.ts` composing it. Do this only if it keeps Task 5's diff clearer. Either way, the control names Task 7 depends on don't change.

## Review Focus

1. **Dev unchecked after picking a Dev-only scenario, an enemy aircraft or an unfit loadout.** Expected: each later choice falls back in order, with nothing left pointing at something no longer offered. *Task 2, `reconcile` tests.*
2. **A quick launch with a bad `aircraft` or `loadout` value.** Expected: the bad-content screen names the parameter and the value; nothing flies. *Task 6.*
3. **A Dev sortie that ends in each way: landing, ditching, death and friendly fire.** Expected: the roster is byte-identical afterwards, and the debrief says "Dev sortie: not recorded". *Task 4.*
4. **A legal sortie flown with Dev checked.** Expected: it is recorded (A5). *Task 4.*
5. **Switching aircraft only, same scenario, from the title after a flight.** Expected: the world is rebuilt with the new mesh. Today a same-scenario pick only rebuilds the frame. *Task 3.*

---

### Task 1: Aircraft spec facts and the pure sortie rules

**Files:**
- Modify: `src/sim/flight/schema.ts` (the `AircraftSpecObject` near line 83)
- Modify: `content/aircraft/f6f-hellcat.json`, `content/aircraft/f4f-wildcat.json`, `content/aircraft/a6m2-zero.json`
- Modify: `tests/sim/flight/schema.test.ts` (the `valid` literal, line 5)
- Create: `src/sim/sortie.ts`
- Test: `tests/sim/sortie.test.ts`, `tests/content/aircraftSide.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `ScenarioBundle`, `isParkedAircraft`, `isShipParked`, `worldFromScenario` (`src/sim/scenario.ts`); `AircraftSpec` (`src/sim/flight/schema.ts`); `Loadout`, `storesFromLoadout` (`src/sim/weapons/stores.ts`).
- Produces (exact):
  ```ts
  export type StartKind = 'carrier' | 'airfield' | 'airborne'
  export type AircraftNation = 'allied' | 'japanese'
  export type SortieChoice = { readonly scenarioId: string; readonly aircraftSpec: string; readonly loadout: Loadout; readonly dev: boolean }
  export type SortieRule = 'dev-scenario' | 'enemy-aircraft' | 'not-carrier-capable' | 'no-stations'
  export type SortieFacts = { readonly devScenario: boolean; readonly start: StartKind; readonly spec: AircraftSpec; readonly loadout: Loadout }
  export const ALL_LOADOUTS: readonly Loadout[]            // ['clean', 'bombs', 'rockets', 'both']
  export const DEV_STORES_SPEC_ID = 'f6f-hellcat'
  export const DEV_STORES_SUFFIX = '~dev-stores'
  export function startKindOf(scenario: Scenario): StartKind
  export function eligibleAircraft(specs: readonly AircraftSpec[], start: StartKind, dev: boolean): AircraftSpec[]
  export function eligibleLoadouts(spec: AircraftSpec, dev: boolean): Loadout[]
  export function sortieRulesBroken(f: SortieFacts): SortieRule[]
  export function isDevSortie(f: SortieFacts & { readonly quickLaunch: boolean }): boolean
  export function validateSortie(f: SortieFacts & { readonly dev: boolean }): void   // throws Error naming each rule
  export function withPlayerSpec(scenario: Scenario, specId: string): Scenario
  export function needsDevStores(spec: AircraftSpec, loadout: Loadout): boolean
  export function sortieBundle(bundle: ScenarioBundle, loadout: Loadout, devStores: AircraftSpec['stores']): ScenarioBundle
  ```

- [x] **Step 1: Add the two required fields to the schema.** In `AircraftSpecObject`, directly after `role`:

  ```ts
  /** Who flies it, in the Library's vocabulary (`SIDES`, hangar/library.ts).
   *  ELIGIBILITY ONLY (sortie spec 2026-09-27, ruling SF-R1): which aircraft
   *  the title offers with Dev off. A combat side is per scenario entity and
   *  comes from `sideOf` (sides.ts) -- a Zero flown by the player is still
   *  the player's side. */
  side: z.enum(['allied', 'japanese']),
  /** Whether a non-Dev sortie may start this aircraft on a carrier deck. */
  carrierCapable: z.boolean(),
  ```

  Add `"side"` and `"carrierCapable"` after `"role"` in each content file: `f6f-hellcat` allied/true, `f4f-wildcat` allied/true, `a6m2-zero` japanese/true (the spec's table). Add `side: 'allied', carrierCapable: true,` to `schema.test.ts`'s `valid` literal after `role`.

- [x] **Step 2: Write the failing tests** in `tests/sim/sortie.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { loadAircraftSpec, loadScenario, loadScenarioBundle } from '../../tools/content/load.js'
  import { worldFromScenario } from '../../src/sim/scenario.js'
  import { ALL_LOADOUTS, DEV_STORES_SPEC_ID, DEV_STORES_SUFFIX, eligibleAircraft, eligibleLoadouts, isDevSortie, needsDevStores, sortieBundle, sortieRulesBroken, startKindOf, validateSortie, withPlayerSpec, type StartKind } from '../../src/sim/sortie.js'
  import { readdirSync } from 'node:fs'

  const hellcat = loadAircraftSpec('f6f-hellcat')
  const wildcat = loadAircraftSpec('f4f-wildcat')
  const zero = loadAircraftSpec('a6m2-zero')
  const flyable = [hellcat, wildcat, zero]
  const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)
  const scenarioIds = readdirSync('content/scenarios').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))

  describe('startKindOf', () => {
    it.each([['deck-quals', 'carrier'], ['free-flight', 'airfield'], ['combat-air-patrol', 'airborne']] as const)('%s is %s', (id, kind) => {
      expect(startKindOf(loadScenario(id))).toBe(kind)
    })
  })

  describe('eligibleAircraft: every start kind x every flyable spec x dev', () => {
    for (const start of ['carrier', 'airfield', 'airborne'] as StartKind[]) {
      it(`${start}, dev off: allied only, carrier-capable on a carrier`, () => {
        expect(ids(eligibleAircraft(flyable, start, false))).toEqual(['f6f-hellcat', 'f4f-wildcat'])
      })
      it(`${start}, dev on: everything`, () => {
        expect(ids(eligibleAircraft(flyable, start, true))).toEqual(['f6f-hellcat', 'f4f-wildcat', 'a6m2-zero'])
      })
    }
    it('drops a non-carrier-capable allied spec from a carrier start only', () => {
      const landOnly = { ...wildcat, id: 'land-only', carrierCapable: false }
      expect(ids(eligibleAircraft([landOnly], 'carrier', false))).toEqual([])
      expect(ids(eligibleAircraft([landOnly], 'airfield', false))).toEqual(['land-only'])
    })
  })

  describe('eligibleLoadouts', () => {
    it('racks and rails: all four; no stores: clean only; dev: all four', () => {
      expect(eligibleLoadouts(hellcat, false)).toEqual(['clean', 'bombs', 'rockets', 'both'])
      expect(eligibleLoadouts(zero, false)).toEqual(['clean'])
      expect(eligibleLoadouts(zero, true)).toEqual(ALL_LOADOUTS)
    })
  })

  describe('sortieRulesBroken, isDevSortie, validateSortie', () => {
    const facts = { devScenario: false, start: 'carrier' as StartKind, spec: hellcat, loadout: 'both' as const }
    it('a legal sortie breaks nothing and is not Dev, even with Dev available (A5)', () => {
      expect(sortieRulesBroken(facts)).toEqual([])
      expect(isDevSortie({ ...facts, quickLaunch: false })).toBe(false)
      expect(() => validateSortie({ ...facts, dev: false })).not.toThrow()
    })
    it('names every rule broken, in a fixed order', () => {
      const f = { devScenario: true, start: 'carrier' as StartKind, spec: { ...zero, carrierCapable: false }, loadout: 'bombs' as const }
      expect(sortieRulesBroken(f)).toEqual(['dev-scenario', 'enemy-aircraft', 'not-carrier-capable', 'no-stations'])
      expect(() => validateSortie({ ...f, dev: false })).toThrow('sortie needs Dev: dev-scenario, enemy-aircraft, not-carrier-capable, no-stations')
      expect(() => validateSortie({ ...f, dev: true })).not.toThrow()
      expect(isDevSortie({ ...f, quickLaunch: false })).toBe(true)
    })
    it('each kind of needed-Dev choice alone is a Dev sortie; a quick launch always is', () => {
      expect(isDevSortie({ ...facts, devScenario: true, quickLaunch: false })).toBe(true)
      expect(isDevSortie({ ...facts, spec: zero, loadout: 'clean', quickLaunch: false })).toBe(true)
      expect(isDevSortie({ ...facts, start: 'airfield', spec: { ...hellcat, stores: undefined }, loadout: 'rockets', quickLaunch: false })).toBe(true)
      expect(isDevSortie({ ...facts, quickLaunch: true })).toBe(true)
    })
  })

  describe('the player-spec swap and the Dev stores layout', () => {
    it('withPlayerSpec changes only the player entry', () => {
      const s = loadScenario('combat-air-patrol')
      const swapped = withPlayerSpec(s, 'a6m2-zero')
      expect(swapped.aircraft.find((a) => a.id === s.player)!.spec).toBe('a6m2-zero')
      expect(swapped.heldGroups).toEqual(s.heldGroups)
      expect(swapped.aircraft.filter((a) => a.id !== s.player)).toEqual(s.aircraft.filter((a) => a.id !== s.player))
    })
    it('a default sortie is bit-identical to today for every shipped scenario (Global Constraint)', () => {
      for (const id of scenarioIds) {
        const bundle = loadScenarioBundle(id)
        for (const loadout of ALL_LOADOUTS) {
          expect(worldFromScenario(sortieBundle(bundle, loadout, hellcat.stores), null, loadout), `${id} ${loadout}`)
            .toEqual(worldFromScenario(bundle, null, loadout))
        }
      }
    })
    it('dev bombs on the Zero hang the Hellcat layout on the player only (SF-R2, SF-R3)', () => {
      const scenario = withPlayerSpec(loadScenario('combat-air-patrol'), 'a6m2-zero')
      const bundle = { ...loadScenarioBundle('combat-air-patrol'), scenario, aircraftSpecs: { ...loadScenarioBundle('combat-air-patrol').aircraftSpecs, 'a6m2-zero': zero } }
      expect(needsDevStores(zero, 'bombs')).toBe(true)
      const b = sortieBundle(bundle, 'bombs', loadAircraftSpec(DEV_STORES_SPEC_ID).stores)
      const key = `a6m2-zero${DEV_STORES_SUFFIX}`
      expect(b.scenario.aircraft.find((a) => a.id === b.scenario.player)!.spec).toBe(key)
      expect(b.aircraftSpecs[key]!.id).toBe('a6m2-zero')
      expect(b.aircraftSpecs[key]!.stores).toEqual(hellcat.stores)
      expect(b.aircraftSpecs['a6m2-zero']!.stores).toBeUndefined()
      const w = worldFromScenario(b, null, 'bombs')
      expect(w.combat.aircraft[w.player]!.stores).toEqual({ bombs: 2, rockets: 0 })
    })
  })
  ```

  Add to the same file a headless release proof: `advance` one tick with `dropBomb: true` on that world's player, then expect exactly one `kind === 'bomb'` projectile and `stores` `{ bombs: 1, rockets: 0 }`. Copy the harness from `tests/sim/weapons/combat.test.ts:257-275` (`withControls`, `advance`, `DT`); the `still` stepper there is the one to use.

  In `tests/content/aircraftSide.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { readdirSync, readFileSync } from 'node:fs'
  import { loadAircraftSpec } from '../../tools/content/load.js'
  import { parseLibraryEntry } from '../../src/render/hangar/library.js'

  describe('each flyable spec agrees with its Library entry', () => {
    const library = readdirSync('content/library').map((f) => parseLibraryEntry(JSON.parse(readFileSync(`content/library/${f}`, 'utf8'))))
    for (const f of readdirSync('content/aircraft').filter((n) => n.endsWith('.json'))) {
      const spec = loadAircraftSpec(f.slice(0, -5))
      it(`${spec.id}: side matches the Library`, () => {
        const entry = library.find((e) => e.spec === spec.id)
        expect(entry, `no Library entry has spec ${spec.id}`).toBeDefined()
        expect(spec.side).toBe(entry!.side)
      })
    }
    it('SF-R1: no weapons or AI code reads the spec-level side', () => {
      for (const dir of ['src/sim/weapons', 'src/sim/ai']) {
        for (const f of readdirSync(dir, { recursive: true }) as string[]) {
          if (!f.endsWith('.ts')) continue
          expect(readFileSync(`${dir}/${f}`, 'utf8'), `${dir}/${f}`).not.toMatch(/spec\.side\b/)
        }
      }
    })
  })
  ```

- [x] **Step 3: Run them to verify they fail.** `npx vitest run tests/sim/sortie.test.ts tests/content/aircraftSide.test.ts tests/sim/flight/schema.test.ts`. Expected: FAIL, because `src/sim/sortie.ts` does not exist.

- [x] **Step 4: Implement `src/sim/sortie.ts`:**

  ```ts
  import type { AircraftSpec } from './flight/schema.js'
  import { isParkedAircraft, isShipParked, type Scenario, type ScenarioBundle } from './scenario.js'
  import type { Loadout } from './weapons/stores.js'

  /**
   * The sortie rules (spec docs/superpowers/specs/2026-09-27-sortie-forms-design.md,
   * "Rules and data", amendments A5 and A6). Pure: the title's forms, the
   * quick-launch URL and main.ts's loader all ask these, so the rules cannot
   * differ between the two ways into a flight.
   */
  export type StartKind = 'carrier' | 'airfield' | 'airborne'
  export type AircraftNation = AircraftSpec['side']
  export type SortieChoice = { readonly scenarioId: string; readonly aircraftSpec: string; readonly loadout: Loadout; readonly dev: boolean }
  export type SortieRule = 'dev-scenario' | 'enemy-aircraft' | 'not-carrier-capable' | 'no-stations'
  export type SortieFacts = { readonly devScenario: boolean; readonly start: StartKind; readonly spec: AircraftSpec; readonly loadout: Loadout }

  export const ALL_LOADOUTS: readonly Loadout[] = ['clean', 'bombs', 'rockets', 'both']
  /** SF-R2: the Dev stores layout is this spec's own `stores` block, read at runtime. */
  export const DEV_STORES_SPEC_ID = 'f6f-hellcat'
  /** SF-R3: the bundle key of a player spec given the Dev stores layout. */
  export const DEV_STORES_SUFFIX = '~dev-stores'

  export function startKindOf(scenario: Scenario): StartKind {
    const player = scenario.aircraft.find((a) => a.id === scenario.player)
    if (player === undefined) throw new Error(`scenario ${scenario.id}: no player aircraft ${scenario.player}`)
    if (!isParkedAircraft(player)) return 'airborne'
    return isShipParked(player.parkedAt) ? 'carrier' : 'airfield'
  }

  export function eligibleAircraft(specs: readonly AircraftSpec[], start: StartKind, dev: boolean): AircraftSpec[] {
    if (dev) return [...specs]
    return specs.filter((s) => s.side === 'allied' && (start !== 'carrier' || s.carrierCapable))
  }

  export function eligibleLoadouts(spec: AircraftSpec, dev: boolean): Loadout[] {
    if (dev || spec.stores === undefined) return dev ? [...ALL_LOADOUTS] : ['clean']
    // StoresSchema requires at least one rack and one rail, so a spec with a
    // stores block has both today; the checks stay per kind for the day it may not.
    const racks = spec.stores.racks.length > 0, rails = spec.stores.rails.length > 0
    return ALL_LOADOUTS.filter((l) => l === 'clean' || (l === 'bombs' && racks) || (l === 'rockets' && rails) || (l === 'both' && racks && rails))
  }

  export function needsDevStores(spec: AircraftSpec, loadout: Loadout): boolean {
    return loadout !== 'clean' && !eligibleLoadouts(spec, false).includes(loadout)
  }

  export function sortieRulesBroken(f: SortieFacts): SortieRule[] {
    const broken: SortieRule[] = []
    if (f.devScenario) broken.push('dev-scenario')
    if (f.spec.side !== 'allied') broken.push('enemy-aircraft')
    if (f.start === 'carrier' && !f.spec.carrierCapable) broken.push('not-carrier-capable')
    if (needsDevStores(f.spec, f.loadout)) broken.push('no-stations')
    return broken
  }

  /** A5: Dev only if it NEEDED Dev; A6: a quick launch always is. Gates recording. */
  export function isDevSortie(f: SortieFacts & { readonly quickLaunch: boolean }): boolean {
    return f.quickLaunch || sortieRulesBroken(f).length > 0
  }

  export function validateSortie(f: SortieFacts & { readonly dev: boolean }): void {
    const broken = sortieRulesBroken(f)
    if (!f.dev && broken.length > 0) throw new Error(`sortie needs Dev: ${broken.join(', ')}`)
  }

  export function withPlayerSpec(scenario: Scenario, specId: string): Scenario {
    return { ...scenario, aircraft: scenario.aircraft.map((a) => (a.id === scenario.player ? { ...a, spec: specId } : a)) }
  }

  /**
   * The bundle a sortie flies. Returns the SAME bundle unless the player's
   * spec lacks the stations its loadout needs; then the player alone flies a
   * copy under `<spec>~dev-stores` with `devStores` hung on it (SF-R2, SF-R3).
   */
  export function sortieBundle(bundle: ScenarioBundle, loadout: Loadout, devStores: AircraftSpec['stores']): ScenarioBundle {
    const s = bundle.scenario
    const key = s.aircraft.find((a) => a.id === s.player)!.spec
    const spec = bundle.aircraftSpecs[key]!
    if (!needsDevStores(spec, loadout)) return bundle
    if (devStores === undefined) throw new Error(`sortie: ${spec.id} needs the Dev stores layout (${DEV_STORES_SPEC_ID}) and none was loaded`)
    const devKey = `${key}${DEV_STORES_SUFFIX}`
    return {
      ...bundle,
      scenario: withPlayerSpec(s, devKey),
      aircraftSpecs: { ...bundle.aircraftSpecs, [devKey]: { ...spec, stores: devStores } },
    }
  }
  ```

- [x] **Step 5: Run the tests to verify they pass**, with the same command as Step 3. Expected: PASS. If the bit-identity test fails for a scenario, that is a real regression; do not loosen the assertion.

- [x] **Step 6: `remote-run npm run verify; rc=$?; echo "rc=$rc"`.** Expected: rc=0. Test counts are P2's plus this task's.

- [x] **Step 7: Commit.**

  ```bash
  git add src/sim/flight/schema.ts src/sim/sortie.ts content/aircraft/*.json tests/sim/sortie.test.ts tests/content/aircraftSide.test.ts tests/sim/flight/schema.test.ts
  git commit -m "Sortie forms Task 1: side and carrierCapable on every spec; the pure sortie rules"
  ```

---

### Task 2: Scenario facts, the flyable catalog, and the pure form model

**Files:**
- Modify: `src/render/titleScreen.ts:92-209`. This covers the options table, `DEV_SCENARIO_OPTIONS`, `scenarioOptions`, `isKnownScenarioId`, `badgeName`, `scenarioLabel` and `PRODUCTION_MISSIONS`.
- Create: `src/render/sortieFlow.ts` (pure form model), `src/render/sortie/flyable.ts` (pure catalog builder), `src/render/sortie/flyableIndex.ts` (Vite glob, browser only)
- Modify: `tests/render/mission/options.test.ts`, `tests/render/titleScreen.test.ts`
- Test: `tests/render/sortieFlow.test.ts`, `tests/render/sortie/flyable.test.ts`

**Interfaces:**
- Consumes: Task 1's `StartKind`, `eligibleAircraft`, `eligibleLoadouts`; `figuresFor` (`src/render/hangar/stats.ts:49`); `LibraryEntry`, `rosterNameOf` (`src/render/hangar/library.ts`).
- Produces:
  ```ts
  // titleScreen.ts
  export type ScenarioOption = {
    readonly value: string; readonly label: string; readonly kind: 'mission' | 'range'; readonly badge?: Badge
    readonly dev: boolean; readonly start: StartKind; readonly aircraft: string
    readonly recommendedLoadout?: Loadout; readonly description?: string
  }
  export const SCENARIO_OPTIONS: readonly ScenarioOption[]          // now includes the dev- fixtures
  export function scenarioOptions(dev: boolean): readonly ScenarioOption[]
  export function isKnownScenarioId(id: string): boolean              // every row, Dev-only included (A2)
  // sortie/flyable.ts
  export type FlyableAircraft = { readonly spec: AircraftSpec; readonly label: string; readonly blurb: string; readonly figures: readonly Figure[] }
  export function flyableAircraft(specs: readonly AircraftSpec[], library: readonly LibraryEntry[]): FlyableAircraft[]
  export function aircraftRowLabel(f: FlyableAircraft, dev: boolean): string
  export function storesLine(spec: AircraftSpec, loadout: Loadout): string
  // sortie/flyableIndex.ts
  export function loadFlyableAircraft(): FlyableAircraft[]
  // sortieFlow.ts
  export const DEFAULT_LOADOUT: Loadout                                // 'both', moved here
  export type SortieDraft = { readonly scenarioId: string; readonly aircraftSpec: string; readonly loadout: Loadout }
  export type FlowContext = { readonly options: readonly ScenarioOption[]; readonly flyable: readonly FlyableAircraft[]; readonly dev: boolean }
  export function visibleScenarios(ctx: FlowContext): readonly ScenarioOption[]
  export function aircraftFor(ctx: FlowContext, scenarioId: string): readonly FlyableAircraft[]
  export function loadoutsFor(ctx: FlowContext, specId: string): readonly Loadout[]
  export function defaultLoadout(ctx: FlowContext, scenarioId: string, specId: string): Loadout
  export function initialDraft(ctx: FlowContext, scenarioId: string): SortieDraft
  export function withScenario(ctx: FlowContext, scenarioId: string): SortieDraft
  export function withAircraft(ctx: FlowContext, draft: SortieDraft, specId: string): SortieDraft
  export function reconcile(ctx: FlowContext, draft: SortieDraft, fallbackScenarioId: string): SortieDraft
  export function devLayoutNote(ctx: FlowContext, specId: string, loadout: Loadout): string | null
  ```

- [x] **Step 1: Extend `ScenarioOption` and merge the tables.** Fold `DEV_SCENARIO_OPTIONS` into `SCENARIO_OPTIONS` at the end, then delete `DEV_SCENARIO_OPTIONS`. Give every row `dev`, `start`, `aircraft` and, where the file has a briefing, `recommendedLoadout`. Use the Measured table above. The rows are:
  - `dev: true` exactly for `furball-range`, `friendly-fire-range`, `friendly-fire-field`, `dev-mission-ui` and `dev-mission-circuit` (A1).
  - `aircraft: 'f6f-hellcat'` on every row.
  - `description` on each range:

  | value | description |
  | --- | --- |
  | `free-flight` | Parked at Tacloban with the Essex task group offshore. No objectives: fly anywhere. |
  | `deck-quals` | Spotted on the Essex's deck. Practice launches and traps; no objectives. |
  | `gunnery-range` | Parked at Tacloban beside two parked Hellcat targets for gun practice. |
  | `pursuit-range` | Airborne, with a green-skill fighter on your tail. Shake it or shoot it down. |
  | `pursuit-range-veteran` | As Air Combat, against a veteran-skill pursuer. |
  | `strike-range` | Parked at Tacloban, with a Japanese cargo ship and enemy airfield targets for bomb and rocket practice. |
  | `furball-range` | Test bed (Plan 7e): airborne with an allied wingman against four enemy fighters, so AI fights AI. |
  | `friendly-fire-range` | Test bed (friendly-fire plan): airborne near an allied Hellcat, an enemy Hellcat, the Essex and a cargo ship. |
  | `friendly-fire-field` | Test bed (friendly-fire plan): parked at Tacloban behind a parked allied Hellcat. |

  Then:

  ```ts
  /** The picker's rows: every row with Dev, the non-dev rows without (A1). */
  export function scenarioOptions(dev: boolean): readonly ScenarioOption[] {
    return dev ? SCENARIO_OPTIONS : SCENARIO_OPTIONS.filter((o) => !o.dev)
  }
  /** Whether `id` is a scenario this build ships -- the `?scenario=` whitelist.
   *  Dev-only scenarios included (A2): a link may reach a test bed. */
  export function isKnownScenarioId(id: string): boolean {
    return SCENARIO_OPTIONS.some((option) => option.value === id)
  }
  ```

  `badgeName` and `scenarioLabel` search `SCENARIO_OPTIONS`. `PRODUCTION_MISSIONS` becomes `{ options: SCENARIO_OPTIONS, loadScenario: null }`. Move `DEFAULT_LOADOUT` to `sortieFlow.ts` and re-export it from `titleScreen.ts` (`export { DEFAULT_LOADOUT } from './sortieFlow.js'`) so `main.ts`'s import is unchanged. `sortieFlow.ts` may import only *types* from `titleScreen.ts`. If `npm run depcruise` reports that type import as a cycle (it depends on its `tsPreCompilationDeps` setting), move the `ScenarioOption` type into `sortieFlow.ts` and re-export it from `titleScreen.ts`; record which.

- [x] **Step 2: Pin the restated facts** in `tests/render/mission/options.test.ts`. Add these tests beside the existing `kind`/`badge` ones, reading each file with `loadScenario`:

  ```ts
  it('start, aircraft and recommendedLoadout restate the file (SF-R7)', () => {
    for (const o of SCENARIO_OPTIONS) {
      const s = loadScenario(o.value)
      expect(o.start, o.value).toBe(startKindOf(s))
      expect(o.aircraft, o.value).toBe(s.aircraft.find((a) => a.id === s.player)!.spec)
      expect(o.recommendedLoadout, o.value).toBe(s.briefing?.loadout)
    }
  })
  it('A1: exactly the test beds are Dev-only, and every range has a description', () => {
    expect(SCENARIO_OPTIONS.filter((o) => o.dev).map((o) => o.value).sort())
      .toEqual(['dev-mission-circuit', 'dev-mission-ui', 'friendly-fire-field', 'friendly-fire-range', 'furball-range'])
    for (const o of SCENARIO_OPTIONS.filter((r) => r.kind === 'range')) expect(o.description, o.value).toMatch(/\S/)
  })
  it("every non-Dev scenario's own aircraft is eligible with Dev off", () => {
    const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
    for (const o of scenarioOptions(false)) expect(eligibleAircraft(specs, o.start, false).map((s) => s.id), o.value).toContain(o.aircraft)
  })
  ```

  Update any existing assertion there or in `titleScreen.test.ts` that used `DEV_SCENARIO_OPTIONS` or the two-argument `isKnownScenarioId`. Add `expect(isKnownScenarioId('furball-range')).toBe(true)`, `expect(scenarioOptions(false).some((o) => o.value === 'furball-range')).toBe(false)`, and `expect(isKnownScenarioId('no-such-scenario')).toBe(false)`.

- [x] **Step 3: Write `src/render/sortie/flyable.ts`** and its test:

  ```ts
  import type { AircraftSpec } from '../../sim/flight/schema.js'
  import type { Loadout } from '../../sim/weapons/stores.js'
  import { figuresFor, type Figure } from '../hangar/stats.js'
  import { rosterNameOf, type LibraryEntry } from '../hangar/library.js'

  /** One row of Form 3: a spec in content/aircraft/ ("flyable" = has a spec)
   *  with its Library card (spec, Form 3: blurb plus `figuresFor`). */
  export type FlyableAircraft = { readonly spec: AircraftSpec; readonly label: string; readonly blurb: string; readonly figures: readonly Figure[] }

  const NATION_LABEL = { allied: 'Allied', japanese: 'Japanese' } as const

  export function flyableAircraft(specs: readonly AircraftSpec[], library: readonly LibraryEntry[]): FlyableAircraft[] {
    return specs.map((spec) => {
      const entry = library.find((e) => e.spec === spec.id)
      if (entry === undefined) throw new Error(`flyable ${spec.id}: no Library entry has spec "${spec.id}"`)
      return { spec, label: rosterNameOf(entry), blurb: entry.blurb, figures: figuresFor({ library: entry, subject: { kind: 'aircraft', spec }, origin: null }) }
    }).sort((a, b) => (a.spec.side === b.spec.side ? a.label.localeCompare(b.label) : a.spec.side === 'allied' ? -1 : 1))
  }

  /** Enemy aircraft show only with Dev on, labeled with their side (spec, Form 3). */
  export function aircraftRowLabel(f: FlyableAircraft, dev: boolean): string {
    return dev && f.spec.side !== 'allied' ? `${f.label} (${NATION_LABEL[f.spec.side]})` : f.label
  }

  /** Form 4's right side: exactly what hangs on the aircraft. */
  export function storesLine(spec: AircraftSpec, loadout: Loadout): string {
    const s = spec.stores
    if (s === undefined || loadout === 'clean') return 'Guns only: no bombs or rockets'
    const part = (n: number, id: string): string => `${n} × ${s.types[id]!.name}`
    const bombs = loadout === 'bombs' || loadout === 'both' ? [part(s.racks.length, s.racks[0]!.store)] : []
    const rockets = loadout === 'rockets' || loadout === 'both' ? [part(s.rails.length, s.rails[0]!.store)] : []
    return [...bombs, ...rockets].join(', ')
  }
  ```

  Before writing `storesLine`, read the `types` entries of `StoresSchema` (`src/sim/flight/schema.ts:55-65`). If the store type has no `name`, use its key with the Library `ordnance` entry's `name` (`content/library/an-m65.json`, `hvar.json`) and record the choice as a ruling. The test pins the Hellcat's `both` line to contain `2 ×` and `6 ×`. In `tests/render/sortie/flyable.test.ts`, build from `tools/content/load.ts` plus `parseLibraryEntry`. Pin:
  - the order: Hellcat and Wildcat before the Zero;
  - `aircraftRowLabel(zero, true)` ends `(Japanese)`, and `aircraftRowLabel(zero, false)` has no suffix;
  - `storesLine(hellcat, 'clean')`;
  - `storesLine(hellcat, 'both')`.

  `src/render/sortie/flyableIndex.ts` mirrors `hangar/contentIndex.ts`:

  ```ts
  import { parseAircraftSpec } from '../../sim/content.js'
  import { parseLibraryEntry } from '../hangar/library.js'
  import { flyableAircraft, type FlyableAircraft } from './flyable.js'
  // Bundled at build time (a browser cannot list content/aircraft/); Node tests never import this module.
  const aircraft = import.meta.glob('/content/aircraft/*.json', { eager: true, import: 'default' })
  const library = import.meta.glob('/content/library/*.json', { eager: true, import: 'default' })
  export function loadFlyableAircraft(): FlyableAircraft[] {
    const all = (files: Record<string, unknown>) => Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([, raw]) => raw)
    return flyableAircraft(all(aircraft).map(parseAircraftSpec), all(library).map(parseLibraryEntry).filter((e) => e.kind === 'aircraft'))
  }
  ```

- [x] **Step 4: Write the failing form-model tests** in `tests/render/sortieFlow.test.ts`. Build `ctx` from `SCENARIO_OPTIONS` and a `flyableAircraft(...)` list made from disk as in Step 3, with `dev` set per test. Pin, one `it` each:
  - `visibleScenarios` hides exactly the five Dev rows when Dev is off.
  - `aircraftFor(ctx, 'deck-quals')`: Hellcat and Wildcat with Dev off; plus the Zero with Dev on.
  - `initialDraft(ctx, 'combat-air-patrol')` is `{ aircraftSpec: 'f6f-hellcat', loadout: 'clean' }` (recommended).
  - `initialDraft(ctx, 'free-flight').loadout` is `'both'` (SF-R4).
  - **A3, mission change:** from `{ airfield-strike, f4f-wildcat, rockets }`, `withScenario(ctx, 'combat-air-patrol')` gives `{ f6f-hellcat, clean }` (SF-R5 plus the recommendation).
  - **A3, aircraft change keeps an allowed pick:** from `{ airfield-strike, f6f-hellcat, rockets }`, `withAircraft(ctx, d, 'f4f-wildcat').loadout` is `'rockets'`.
  - **A3, aircraft change resets a disallowed pick:** with Dev on, from `{ free-flight, f6f-hellcat, rockets }`, `withAircraft(ctx, d, 'a6m2-zero').loadout` is `'rockets'` (Dev allows everything). With Dev off, `loadoutsFor(ctx, 'a6m2-zero')` is `['clean']`.
  - **`reconcile` after Dev is unchecked:**
    - scenario `furball-range` falls back to the fallback id, with that scenario's defaults;
    - on `free-flight`, aircraft `a6m2-zero` falls back to `f6f-hellcat`, and the loadout is kept if allowed;
    - a legal draft comes back unchanged (`toBe`-equal fields).
  - `devLayoutNote(devCtx, 'a6m2-zero', 'bombs')` is `'dev layout: Hellcat stations'`; for the Hellcat, or `'clean'` on the Zero, it is `null`.

- [x] **Step 5: Run them to verify they fail**: `npx vitest run tests/render/sortieFlow.test.ts`. Expected: FAIL.

- [x] **Step 6: Implement `src/render/sortieFlow.ts`:**

  ```ts
  import type { Loadout } from '../sim/weapons/stores.js'
  import { eligibleAircraft, eligibleLoadouts, needsDevStores } from '../sim/sortie.js'
  import type { ScenarioOption } from './titleScreen.js'
  import type { FlyableAircraft } from './sortie/flyable.js'

  /**
   * What Forms 2-4 offer and what resets when an earlier choice changes
   * (sortie spec, "Navigation", A3; rulings SF-R4 and SF-R5). Pure, so the
   * Node suite pins every reset; titleScreen.ts only draws the draft.
   */
  export const DEFAULT_LOADOUT: Loadout = 'both'
  export type SortieDraft = { readonly scenarioId: string; readonly aircraftSpec: string; readonly loadout: Loadout }
  export type FlowContext = { readonly options: readonly ScenarioOption[]; readonly flyable: readonly FlyableAircraft[]; readonly dev: boolean }

  const option = (ctx: FlowContext, id: string): ScenarioOption => {
    const o = ctx.options.find((x) => x.value === id)
    if (o === undefined) throw new Error(`sortie: unknown scenario ${id}`)
    return o
  }
  const specOf = (ctx: FlowContext, id: string) => {
    const f = ctx.flyable.find((x) => x.spec.id === id)
    if (f === undefined) throw new Error(`sortie: unknown aircraft ${id}`)
    return f.spec
  }

  export const visibleScenarios = (ctx: FlowContext): readonly ScenarioOption[] => ctx.options.filter((o) => ctx.dev || !o.dev)

  export function aircraftFor(ctx: FlowContext, scenarioId: string): readonly FlyableAircraft[] {
    const allowed = new Set(eligibleAircraft(ctx.flyable.map((f) => f.spec), option(ctx, scenarioId).start, ctx.dev).map((s) => s.id))
    return ctx.flyable.filter((f) => allowed.has(f.spec.id))
  }

  export const loadoutsFor = (ctx: FlowContext, specId: string): readonly Loadout[] => eligibleLoadouts(specOf(ctx, specId), ctx.dev)

  /** SF-R4: the recommendation if allowed, else 'both' if allowed, else 'clean' (always allowed). */
  export function defaultLoadout(ctx: FlowContext, scenarioId: string, specId: string): Loadout {
    const allowed = loadoutsFor(ctx, specId)
    const rec = option(ctx, scenarioId).recommendedLoadout
    if (rec !== undefined && allowed.includes(rec)) return rec
    return allowed.includes(DEFAULT_LOADOUT) ? DEFAULT_LOADOUT : 'clean'
  }

  export function initialDraft(ctx: FlowContext, scenarioId: string): SortieDraft {
    const aircraftSpec = option(ctx, scenarioId).aircraft
    return { scenarioId, aircraftSpec, loadout: defaultLoadout(ctx, scenarioId, aircraftSpec) }
  }

  /** A mission change resets the aircraft (SF-R5) and the loadout (A3). */
  export const withScenario = (ctx: FlowContext, scenarioId: string): SortieDraft => initialDraft(ctx, scenarioId)

  /** An aircraft change keeps the pilot's loadout if the new aircraft allows it (A3). */
  export function withAircraft(ctx: FlowContext, draft: SortieDraft, specId: string): SortieDraft {
    const keep = loadoutsFor(ctx, specId).includes(draft.loadout)
    return { ...draft, aircraftSpec: specId, loadout: keep ? draft.loadout : defaultLoadout(ctx, draft.scenarioId, specId) }
  }

  /** After Dev changes: each stage, in order, falls back if no longer offered. */
  export function reconcile(ctx: FlowContext, draft: SortieDraft, fallbackScenarioId: string): SortieDraft {
    if (!visibleScenarios(ctx).some((o) => o.value === draft.scenarioId)) return initialDraft(ctx, fallbackScenarioId)
    const aircraftOk = aircraftFor(ctx, draft.scenarioId).some((f) => f.spec.id === draft.aircraftSpec)
    const d = aircraftOk ? draft : { ...draft, aircraftSpec: option(ctx, draft.scenarioId).aircraft }
    return loadoutsFor(ctx, d.aircraftSpec).includes(d.loadout) ? d : { ...d, loadout: defaultLoadout(ctx, d.scenarioId, d.aircraftSpec) }
  }

  /** Form 4's mark for a Dev loadout the aircraft has no stations for (spec, Form 4). */
  export function devLayoutNote(ctx: FlowContext, specId: string, loadout: Loadout): string | null {
    return ctx.dev && needsDevStores(specOf(ctx, specId), loadout) ? 'dev layout: Hellcat stations' : null
  }
  ```

  In `reconcile`, when the draft is unchanged, return the same object: `if (aircraftOk && loadoutOk) return draft`.

- [x] **Step 7: Run the Task 2 test files, then `remote-run npm run verify; rc=$?; echo "rc=$rc"`.** Expected: PASS; rc=0.

- [x] **Step 8: Commit.**

  ```bash
  git add src/render/titleScreen.ts src/render/sortieFlow.ts src/render/sortie/ tests/render/sortieFlow.test.ts tests/render/sortie/ tests/render/mission/options.test.ts tests/render/titleScreen.test.ts
  git commit -m "Sortie forms Task 2: scenario facts, Dev-only test beds (A1), the flyable catalog and the pure form model"
  ```

---

### Task 3: One `SortieChoice` into the flight: spec swap, Dev stores, validation, the chosen model

**Files:**
- Modify: `src/render/scenarioLoad.ts` (`loadScenarioBundle`)
- Modify: `src/render/main.ts`: `chosenLoadout` (line 239), `loadScenario` (361), `buildWorld` (462), the `?scenario=` check (499-511), the `onNewGame` closure (570-652) and the boot `loadScenario` call (~1034)
- Modify: `content/aircraft/f6f-hellcat.json` (`view.model`), `src/render/titleScreen.ts` (the `onNewGame` parameter type only)
- Test: `tests/render/scenarioLoad.test.ts`, `tests/render/airframes.test.ts`

**Interfaces:**
- Consumes: Task 1's `SortieChoice`, `withPlayerSpec`, `sortieBundle`, `validateSortie`, `startKindOf`, `DEV_STORES_SPEC_ID`; Task 2's `SCENARIO_OPTIONS`.
- Produces:
  - `loadScenarioBundle(id, fetchImpl?, playerSpec?: string): Promise<ScenarioBundle>`
  - `createTitleScreen`'s callback becomes `onNewGame: (choice: SortieChoice, pilotId: string | null) => void`
  - in `main.ts`: `let chosen: SortieChoice`, `let devStores: AircraftSpec['stores']`, `let devSortie: boolean` (Task 4 reads it)

- [x] **Step 1: Failing loader test** in `tests/render/scenarioLoad.test.ts`, beside the existing disk-fetch tests:

  ```ts
  it('playerSpec swaps the player before the spec fetch, and fetches the new spec', async () => {
    const b = await loadScenarioBundle('combat-air-patrol', diskFetch, 'f4f-wildcat')
    expect(b.scenario.aircraft.find((a) => a.id === b.scenario.player)!.spec).toBe('f4f-wildcat')
    expect(b.aircraftSpecs['f4f-wildcat']!.id).toBe('f4f-wildcat')
  })
  it('without playerSpec the browser and Node loaders still agree', async () => { /* the existing parity test, unchanged */ })
  ```

- [x] **Step 2: Run it, expect FAIL; then implement.** In `loadScenarioBundle`, add `playerSpec?: string` and rewrite the parsed scenario first: `const scenario = playerSpec === undefined ? parsed : withPlayerSpec(parsed, playerSpec)`. Everything after reads `scenario`. Run again; expect PASS.

- [x] **Step 3: A4, the Hellcat's own model.**
  - Set `"model": "f6f-hellcat"` in `content/aircraft/f6f-hellcat.json`'s `view`.
  - `tests/render/airframes.test.ts` already requires every `content/aircraft/*.json` `view.model` to be registered. Add one assertion: `loadAircraftSpec('f6f-hellcat').view.model` is `'f6f-hellcat'`.
  - Then check whether the Hellcat's eye point (`view.eyePointM`) and store mounts were set against the Wildcat mesh. Read the git log of `content/aircraft/f6f-hellcat.json`, and R3's ruling P1 on "re-measured guns, zones and eye point" in `docs/superpowers/plans/2026-09-26-r3-aircraft-models.md`.
  - Record in the ledger what you found. Task 8's captures (parked, on deck, stores hung) are the visual check. Do not re-measure the eye point in this plan; if it is visibly wrong, record it as an open item for Mark.

- [x] **Step 4: Wire `main.ts`.**
  - Replace `let chosenLoadout: Loadout = DEFAULT_LOADOUT` with `let chosen: SortieChoice`. Initialize it at the `?scenario=` resolution to the scenario's own aircraft and default loadout. Task 6 adds the quick-launch branch here.

    ```ts
    const bootOption = SCENARIO_OPTIONS.find((o) => o.value === requestedScenarioId)!
    let chosen: SortieChoice = { scenarioId: requestedScenarioId, aircraftSpec: bootOption.aircraft, loadout: DEFAULT_LOADOUT, dev: bootOption.dev }
    ```

    Keep `DEFAULT_LOADOUT` rather than the recommendation here: it matches today's boot world, and the forms apply the recommendation before Launch.
  - Change `isKnownScenarioId(requestedScenarioId, import.meta.env.DEV)` to `isKnownScenarioId(requestedScenarioId)`, and update the comment above it (A2).
  - `loadScenario(choice: SortieChoice)`:
    - call `loadScenarioBundle(choice.scenarioId, fetch, choice.aircraftSpec)`;
    - run `validateSortie({ devScenario, start: startKindOf(nextBundle.scenario), spec: nextBundle.aircraftSpecs[choice.aircraftSpec]!, loadout: choice.loadout, dev: choice.dev })`, with `devScenario` from the option row;
    - fetch the Dev stores spec once if `needsDevStores(...)` and `devStores` is still `undefined`: `devStores = parseAircraftSpec(await (await fetch(aircraftUrl(DEV_STORES_SPEC_ID))).json()).stores`;
    - build `nextScenarioWorld` from `sortieBundle(nextBundle, choice.loadout, devStores)`.
  - `buildWorld` uses `worldFromScenario(sortieBundle(bundle!, chosen.loadout, devStores), null, chosen.loadout)`.
  - Every other read of `chosenLoadout` becomes `chosen.loadout`, including `sortieFacts`.
  - `onNewGame(choice, pilotId)`:
    - Set `chosen = choice` first.
    - Rebuild the entities when **the scenario or the aircraft** differs from what is loaded. Track `loadedAircraftSpec` next to `requestedScenarioId` (Review Focus 5).
    - Also reload when only the loadout changed but `needsDevStores` flips and `devStores` is not yet fetched. Reloading whenever `needsDevStores(...)` is true for the new choice is the simple, correct form.
    - A same-everything pick keeps today's `rebuildFrame()`.
    - `currentPilotId = pilotId`; `null` is legal (Task 6).
  - An illegal non-Dev choice throws inside `loadScenario` and reaches the existing `.catch` → `showFailure(root, 'bad-content', message)`, so it "fails loudly by name".

- [x] **Step 5: Update `titleScreen.ts`'s `onNewGame` type** and its one call. `start()` passes `{ scenarioId: selectedScenarioId, aircraftSpec: 'f6f-hellcat' /* Task 5 replaces */, loadout: selectedLoadout, dev: false }` and `pilotId`. Task 5 replaces this with the draft.

- [x] **Step 6: Tier 1 for the swap end to end.** In `tests/sim/sortie.test.ts`, add a test: for `deck-quals`, a choice of `f4f-wildcat` with `both` gives a world whose player spec is the Wildcat and whose player stores are `{ bombs: 2, rockets: 6 }`. Build it with `withPlayerSpec` plus `bundleForScenario` (`tools/content/load.ts:65`) plus `sortieBundle`. Run it with `npx vitest run tests/sim/sortie.test.ts tests/render/scenarioLoad.test.ts tests/render/airframes.test.ts`.

- [x] **Step 7: `remote-run npm run verify; rc=$?; echo "rc=$rc"`**, expecting rc=0. Commit:

  ```bash
  git add src/render/scenarioLoad.ts src/render/main.ts src/render/titleScreen.ts content/aircraft/f6f-hellcat.json tests/
  git commit -m "Sortie forms Task 3: one SortieChoice into the flight; the chosen spec, Dev stores and the Hellcat's own model (A4)"
  ```

---

### Task 4: Dev sorties are not recorded (A5)

**Files:**
- Modify: `src/render/titleScreen.ts` (`start()`, lines 967-983)
- Modify: `src/render/main.ts` (`bankMissionResult`, line 1528, and the three `withMissionDebrief(...)` sites)
- Modify: `src/render/debrief.ts` (`DebriefModel`, and the row renderer near line 530)
- Create: `src/render/devRecord.ts`, the query parser for SF-R6
- Test: `tests/render/debrief.test.ts`, `tests/render/devRecord.test.ts`, `tests/render/devSortie.test.ts`

**Interfaces:**
- Consumes: Task 1's `isDevSortie`, `startKindOf`; Task 3's `chosen`.
- Produces:
  - `DebriefModel.notRecorded?: true`
  - `export function withNotRecorded(model: DebriefModel, devSortie: boolean): DebriefModel` (in `debrief.ts`)
  - `export const DEV_SORTIE_STAMP = 'Dev sortie: not recorded'`
  - `export function recordDevSortiesFromQuery(search: string, devBuild: boolean): boolean` (in `devRecord.ts`)
  - `export function sortieIsDev(option: ScenarioOption, spec: AircraftSpec, loadout: Loadout, quickLaunch: boolean): boolean` (in `devRecord.ts`, so `titleScreen.ts` and `main.ts` share it)

- [x] **Step 1: Failing tests.**
  - `devRecord.test.ts`:
    - `recordDevSortiesFromQuery('?recordDevSorties', true)` is `true`;
    - the same query with `false` is `false` (the production build ignores it, SF-R6);
    - `recordDevSortiesFromQuery('', true)` is `false`;
    - `sortieIsDev` for each A5 case, delegating to `isDevSortie`.
  - `debrief.test.ts`:
    - `withNotRecorded(m, true).notRecorded` is `true`;
    - `withNotRecorded(m, false)` returns `m` itself (`toBe`).
  - `devSortie.test.ts`: the roster is byte-identical across every debrief path.
    - Drive `applyMissionResultToRoster`, `awardBadgeInRoster` and `dischargeInRoster` through a copy of `bankMissionResult`'s decision. To make that possible, extract that decision from `main.ts` into an exported pure function in `src/render/roster.ts`:

      ```ts
      bankSortie(roster, pilotId, { devSortie, scoreTotal, outcome, killsSinceLastBank, sortie, friendlyFire, badgeId }): readonly PilotRecord[]
      ```

      It returns `roster` unchanged (`toBe`) when `devSortie` is true. `bankMissionResult` then calls it, and its `saveRoster` runs only when the returned roster `!==` the input.
    - Assert `JSON.stringify(roster)` is unchanged for `landed`, `ditched`, `killed`, discharged and forfeit when `devSortie` is true, and changed for `landed` when `devSortie` is false.

- [x] **Step 2: Run them, expect FAIL; implement.**
  - `bankSortie` as above.
  - `bankMissionResult` computes the flag as `devSortie && !recordDevSorties`, with `recordDevSorties = import.meta.env.DEV ? recordDevSortiesFromQuery(location.search, true) : false` read once at boot.
  - In `main.ts`, compute `devSortie` in `onNewGame` (and at boot for a quick launch, Task 6) with `sortieIsDev(option, spec, loadout, quickLaunch)`. Read `spec` from the loaded bundle after `loadScenario`. Store it in a `let devSortie = false` beside `chosen`.
  - At each of the three debrief sites, wrap the model: `const { model, badgeId } = ...; const shown = withNotRecorded(model, devSortie && !recordDevSorties)`. Pass `shown` to `showDebrief`.
  - `debrief.ts` renders `notRecorded` as a plain row directly under the headline stamp, with the text `DEV_SORTIE_STAMP`. Use the existing `plainRow` helper; no new style.
  - `titleScreen.ts`'s `start()`: skip `startSortie` and `saveRoster` when `sortieIsDev(...)` is true for the draft; still `hide()` and call `onNewGame`. The title gets its `recordDevSorties` flag as a new optional last parameter, default `false`, so the SF-R6 switch applies to the launch-time write too. `main.ts` passes it.

- [x] **Step 3: Run the Task 4 test files, then `remote-run npm run verify; rc=$?; echo "rc=$rc"`.** Expected: PASS; rc=0.

- [x] **Step 4: Commit.**

  ```bash
  git add src/render/roster.ts src/render/main.ts src/render/debrief.ts src/render/devRecord.ts src/render/titleScreen.ts tests/render/
  git commit -m "Sortie forms Task 4: a Dev sortie records nothing and says so (A5); DEV-only ?recordDevSorties for Tier 2 (SF-R6)"
  ```

---

### Task 5: The four forms and the Dev checkbox

**Files:**
- Modify: `src/render/titleScreen.ts` (`TITLE_FORMS`, `TitleModel`, `build()`'s Form 2 section at lines 556-685, `step`/`showStep`, `advance`, `start`, `onKey`, and the file's top comment)
- Modify: `src/render/main.ts` (pass `loadFlyableAircraft()` to `createTitleScreen`)
- Modify: `tests/render/titleScreen.test.ts`

**Interfaces:**
- Consumes: Task 2's `sortieFlow` functions, `FlyableAircraft`, `aircraftRowLabel`, `storesLine`, `devLayoutNote`; Task 4's `sortieIsDev`.
- Produces:
  - `TITLE_FORMS = { roster, orders, aircraft, ordnance }`, numbered `'Form N of 4'`
  - `TitleModel.next: 'Next'` and `TitleModel.dev: 'Dev — unlocks everything'`
  - `TitleMissions` gains `readonly flyable: readonly FlyableAircraft[]`
  - The radiogroups are named `Scenario`, `Aircraft` and `Loadout`; the Dev control is a checkbox named `Dev — unlocks everything`. Task 7's harness selects by these names.

- [x] **Step 1: Failing Node tests** in `titleScreen.test.ts`:
  - `Object.keys(TITLE_FORMS)` is `['roster', 'orders', 'aircraft', 'ordnance']`;
  - the numbers are `Form 1 of 4` through `Form 4 of 4`;
  - the titles are `Squadron Roster`, `Sortie Orders`, `Aircraft Assignment` and `Ordnance Requisition`;
  - the kickers are `Bureau of Naval Personnel`, `Flight Operations`, `Bureau of Aeronautics` and `Bureau of Ordnance`;
  - `titleModel().next` is `'Next'` and `titleModel().dev` is `'Dev — unlocks everything'`.

  Replace the old `Form 1 of 2`/`Form 2 of 2` assertions (lines 267-268).

- [x] **Step 2: Run, expect FAIL; implement the model constants**, then run again and expect PASS.

- [x] **Step 3: Build the DOM.** Everything below reuses the file's existing helpers: `memoPanel`, `letterhead`, `sectionTitle`, `ballotOption`, `radioGroup`, `markGroup`, `inkButton` and `buttonRow`. It needs no new CSS beyond one checkbox row.
  - **Dev state:**
    - `let dev = false` lives in `createTitleScreen`'s closure, **outside** `build()`, so it survives return-to-title.
    - A `?scenario=` that names a Dev-only row sets it to `true` once, at construction (A2): `dev = SCENARIO_OPTIONS.find((o) => o.value === currentScenarioId)?.dev === true`.
  - **Form 1:** a native `<input type="checkbox">` with a `<label>` reading `m.dev`, in the button row beside New game. Toggling sets `dev` and runs `draft = reconcile(ctx(), draft, SCENARIO_ID)`. Form 1 shows nothing that depends on the draft, so no redraw is needed there. It is in `lockable()`'s list, so it is disabled until the boot is ready.
  - **The draft:** `let draft: SortieDraft = initialDraft(ctx(), currentScenarioId)` in `build()`, where `ctx = (): FlowContext => ({ options: missions.options, flyable: missions.flyable, dev })`. Each form's radiogroup is rebuilt from the draft on `showStep`: clear the group and re-append its rows. Rebuilding is simpler than diffing, and this is how `show()` already treats the whole overlay.
  - **Form 2 (Sortie Orders):**
    - The left column is the existing Scenario radiogroup, built from `visibleScenarios(ctx())` with the Missions/Ranges headings kept.
    - Selecting a row sets `draft = withScenario(ctx(), id)`.
    - The right column shows the description: for a mission, the existing briefing (`showBriefing`, unchanged, including the AWARDED stamps); for a range, a `<p>` with `option.description`.
    - Delete the Armament column and R10's `loadoutTouched` from this form; A3 replaces it with `withScenario` and `withAircraft`. The briefing's `model.loadout` is no longer applied here, because `recommendedLoadout` (Task 2) is.
    - The buttons are Back, then Next (primary).
  - **Form 3 (Aircraft Assignment):**
    - The left column is `radioGroup('Aircraft')` with one `ballotOption(aircraftRowLabel(f, dev))` per `aircraftFor(ctx(), draft.scenarioId)`. Selecting a row sets `draft = withAircraft(ctx(), draft, f.spec.id)`.
    - The right column is the selected aircraft's `blurb` in a `<p>`, then a `.form-table` of `figures`: label, then value, then note in the `--ink-faint` color.
    - The buttons are Back, then Next.
  - **Form 4 (Ordnance Requisition):**
    - The left column is `radioGroup('Loadout')` built from `LOADOUT_OPTIONS` filtered to `loadoutsFor(ctx(), draft.aircraftSpec)`.
    - A row's label gets ` (recommended)` when it equals the scenario's `recommendedLoadout` (A3). Tier 2 selects by substring, so `name: 'Both'` still matches `Both (recommended)`.
    - The right column is `storesLine(spec, draft.loadout)` and, if `devLayoutNote(...)` is non-null, that note on its own line.
    - The buttons are Back, then Launch (primary).
  - **`step`** is `'roster' | 'orders' | 'aircraft' | 'ordnance'`. `showStep` shows exactly one panel and focuses its primary button.
    - `advance()` goes from roster to orders and keeps today's badge refresh.
    - Next goes from orders to aircraft, and from aircraft to ordnance.
    - Back goes one form back.
    - `onKey`'s Enter branch becomes: `if (step === 'ordnance') start(); else if (step === 'roster') advance(); else next()`.
  - **`start()`**:
    - builds `choice = { scenarioId: draft.scenarioId, aircraftSpec: draft.aircraftSpec, loadout: draft.loadout, dev }`;
    - decides recording with Task 4's `sortieIsDev(option, spec, loadout, false)`;
    - calls `onNewGame(choice, pilotId)`.
  - **The file's top comment** says four forms and points at the spec. Remove every "of 2" wording.

- [x] **Step 4: Pass the catalog.** In `main.ts`'s `createTitleScreen` call, pass `{ options: SCENARIO_OPTIONS, flyable: loadFlyableAircraft(), loadScenario: (id) => loadScenarioFile(id) }`. `PRODUCTION_MISSIONS` gets `flyable: []`. With an empty catalog, Form 3 offers the scenario's own aircraft as a single row: guard `aircraftFor` to fall back to `[option.aircraft]` by id when `flyable` is empty, and pin that with one Node test. This keeps the constructor default working for the existing title tests.

- [x] **Step 5: Run `npx vitest run tests/render/titleScreen.test.ts tests/render/sortieFlow.test.ts`, then `remote-run npm run verify; rc=$?; echo "rc=$rc"`.** Expected: PASS; rc=0. Tier 2 is expected to be red here until Task 7 updates the harness. Do not run it yet.

- [x] **Step 6: Commit.**

  ```bash
  git add src/render/titleScreen.ts src/render/main.ts src/render/sortieFlow.ts tests/render/
  git commit -m "Sortie forms Task 5: four forms, the Dev checkbox, descriptions on every form"
  ```

---

### Task 6: The quick-launch URL (A6)

**Files:**
- Modify: `src/render/spawn.ts` (beside `scenarioIdFromQuery`), `src/render/main.ts` (the `?scenario=` resolution and just after `createTitleScreen`)
- Test: `tests/render/spawn.test.ts`, or the file that already tests `scenarioIdFromQuery` (`grep -rl scenarioIdFromQuery tests`)

**Interfaces:**
- Consumes: Task 1's `SortieChoice`, `ALL_LOADOUTS`; Task 2's `SCENARIO_OPTIONS`; Task 3's `chosen`; Task 4's `devSortie`.
- Produces: `export function quickLaunchFromQuery(search: string, knownAircraft: readonly string[]): { readonly aircraft?: string; readonly loadout?: Loadout } | null`. It returns `null` without `launch`, and throws `Error('quick launch: unknown aircraft "<v>"')` or `Error('quick launch: unknown loadout "<v>"')`.

- [x] **Step 1: Failing tests:**

  ```ts
  it.each([
    ['?scenario=free-flight', null],
    ['?scenario=free-flight&launch', {}],
    ['?scenario=free-flight&launch&aircraft=a6m2-zero&loadout=bombs', { aircraft: 'a6m2-zero', loadout: 'bombs' }],
  ])('%s', (q, want) => expect(quickLaunchFromQuery(q, ['f6f-hellcat', 'a6m2-zero'])).toEqual(want))
  it('names a bad value', () => {
    expect(() => quickLaunchFromQuery('?launch&aircraft=spitfire', ['f6f-hellcat'])).toThrow('quick launch: unknown aircraft "spitfire"')
    expect(() => quickLaunchFromQuery('?launch&loadout=torpedo', ['f6f-hellcat'])).toThrow('quick launch: unknown loadout "torpedo"')
  })
  ```

- [x] **Step 2: Run, expect FAIL; implement** with `URLSearchParams`, returning only the keys present. Run again; expect PASS.

- [x] **Step 3: Wire it in `main.ts`.**
  - Inside the existing `?scenario=` `try`, call `quickLaunchFromQuery(location.search, loadFlyableAircraft().map((f) => f.spec.id))`. A throw goes to the same `showFailure(root, 'bad-content', ...)`.
  - When it returns non-null:
    - `chosen = { scenarioId, aircraftSpec: q.aircraft ?? option.aircraft, loadout: q.loadout ?? option.recommendedLoadout ?? DEFAULT_LOADOUT, dev: true }`;
    - `quickLaunch = true`, so `devSortie` is true (A6);
    - `currentPilotId` stays `null`;
    - immediately after `createTitleScreen(...)` returns, call `title.hide()` (SF-R9).
  - The boot `loadScenario(chosen)` then builds the chosen world.
  - Verify: search `main.ts` for every `title.up()` read. Each must treat a hidden title as "flight running", which is what `hide()` gives. Record any that assume `onNewGame` ran, such as `audio.resume()`. The known consequence is that audio stays suspended until the first click, which Tier 2 does not assert.

- [x] **Step 4: `remote-run npm run verify; rc=$?; echo "rc=$rc"`**, expecting rc=0. Commit:

  ```bash
  git add src/render/spawn.ts src/render/main.ts tests/render/
  git commit -m "Sortie forms Task 6: ?launch quick launch, always a Dev sortie (A6)"
  ```

---

### Task 7: The Tier 2 harness and the existing specs

**Files:**
- Modify: `tests/e2e/harness.ts` (`startGame`, and a new `quickLaunch`)
- Modify: `tests/e2e/title.spec.ts`, `tests/e2e/mission-ui.spec.ts`, `tests/e2e/friendly-fire.spec.ts`, `tests/e2e/furball.spec.ts` (only if it breaks), `tests/e2e/scenarioPicker.spec.ts`, and every other spec that clicks `Launch` itself (`grep -rln "name: 'Launch'" tests/e2e`)

**Interfaces:**
- Consumes: Task 5's control names (radiogroups `Scenario`/`Aircraft`/`Loadout`, button `Next`, checkbox `Dev — unlocks everything`); Task 6's URL.
- Produces:

  ```ts
  export async function startGame(page: Page, options?: { readonly scenario?: string; readonly aircraft?: string; readonly loadout?: string; readonly dev?: boolean }): Promise<void>
  export async function quickLaunch(page: Page, o: { readonly scenario: string; readonly aircraft?: string; readonly loadout?: string }): Promise<void>
  ```

  Here `scenario` and `aircraft` are row **labels**, as the specs already select by label; `quickLaunch` takes ids. `scenario` must be the **exact, full** label (AD-1); `aircraft` may be a distinctive part of one.

- [x] **Step 1: Rewrite `startGame`.** Keep the pilot-selection half verbatim. After `newGame.click()`:

  ```ts
  if (options.dev === true) {
    await title.getByRole('button', { name: 'Back' }).click()
    await title.getByRole('checkbox', { name: 'Dev — unlocks everything' }).check()
    await title.getByRole('button', { name: 'New game' }).click()
  }
  // AD-1: exact, because "Air Combat" is a substring of "Air Combat: Veteran". Aircraft and Loadout stay substring
  // matches on purpose ('Zero'; 'Both' for 'Both (recommended)').
  if (options.scenario !== undefined) await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: options.scenario, exact: true }).check()
  await title.getByRole('button', { name: 'Next' }).click()
  if (options.aircraft !== undefined) await title.getByRole('radiogroup', { name: 'Aircraft' }).getByRole('radio', { name: options.aircraft }).check()
  await title.getByRole('button', { name: 'Next' }).click()
  if (options.loadout !== undefined) await title.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: options.loadout }).check()
  await title.getByRole('button', { name: 'Launch' }).click()
  ```

  Check Dev on Form 1 before New game instead of going Back, if that reads more simply once the pilot is selected. Either way, update the doc comment to say four forms. `quickLaunch` does `page.goto(`/?scenario=${o.scenario}&launch...`)`, then `waitForScenario(page, o.scenario)`.

- [x] **Step 2: Update the specs that drive the forms themselves.**
  - `title.spec.ts`: `Form 1 of 4` … `Form 4 of 4`, with Next between forms 2, 3 and 4. It must also prove Back and Enter on each form (the spec lists these under Tier 1, but `titleScreen.ts`'s DOM is not reachable from the Node suite; its own comment says why):
    - Enter advances forms 1-3 and launches from form 4;
    - Back from forms 2-4 lands on the previous form with the draft intact (the same row still `aria-checked`).
  - `mission-ui.spec.ts`: its `orders()` helper checks Dev before New game, so the `dev-` fixtures are listed. Its load-out assertions (`Clean` preselected, then `Both`) move to after two `Next` clicks.
  - Add `?recordDevSorties` to the `page.goto` of every test that asserts a recorded result from a Dev-only scenario (SF-R6): the fixture's AWARDED and Dossier badge, and friendly-fire's `— KIA` and `— DISCHARGED` roster and Dossier assertions.
  - Every other spec that clicked `Launch` directly now clicks `Next` twice first.
  - Do not weaken any assertion. If one no longer holds, record why in the ledger.

- [x] **Step 3: Run the Tier 2 specs this task touched** on the reference GPU through the spare slot:

  ```sh
  ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
  PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test tests/e2e/title.spec.ts tests/e2e/mission-ui.spec.ts tests/e2e/friendly-fire.spec.ts tests/e2e/furball.spec.ts tests/e2e/scenarioPicker.spec.ts; rc=$?; echo "rc=$rc"
  ```

  Pass the spec files by path: `playwright test <name>` collects nothing here, because `strike.spec.ts` imports `content.ts`. Expected: rc=0. For any failure, check it against `main` with a probe before blaming this branch (M2 handoff lesson: sea dives and hop-and-land depend on timing).

- [x] **Step 4: `remote-run npm run verify; rc=$?; echo "rc=$rc"`**, expecting rc=0. Commit:

  ```bash
  git add tests/e2e/
  git commit -m "Sortie forms Task 7: the harness walks four forms; quickLaunch; the existing specs follow"
  ```

---

### Task 8: New Tier 2 acceptance, captures and docs

**Files:**
- Create: `tests/e2e/sortie.spec.ts`
- Create: `docs/handoff/2026-09-27-sortie-forms.md` (use the date the task runs), `docs/handoff/<date>-sortie-forms-shots/`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 (Plan 9's row), `README.md` (the title-screen paragraph near line 220)

- [x] **Step 1: Write `tests/e2e/sortie.spec.ts`** with these tests. Each follows the existing specs' shape (`page.goto`, `startGame`/`quickLaunch`, `waitForScenario`, the `__ww2` diagnostics).
  1. **A non-Dev carrier mission offers only carrier-capable allied aircraft.** Use Carrier Qualification. Form 3's `Aircraft` radiogroup has exactly the Hellcat and the Wildcat rows, and no row containing `Zero`. Check Dev: the Zero row appears, labeled `(Japanese)`.
  2. **A Dev Zero with bombs releases a real bomb.** `startGame(page, { dev: true, scenario: 'Free Flight', aircraft: 'Zero', loadout: 'Bombs' })`.
     - Form 4 showed `dev layout: Hellcat stations`; assert it before Launch by driving the forms in the test rather than through `startGame`.
     - Hop clear with `hopClear(page)`, press the bomb key (see the key `strike.spec.ts` uses), then poll `__ww2` until a `bomb` projectile exists and the player's stores read `bombs: 1`.
  3. **The player's model matches the chosen aircraft**, including the default Hellcat no longer drawing the Wildcat. Read the player airframe's model id through `__ww2`; if no getter exposes it, add a DEV-only `playerModel()` to the diagnostics hook beside `scenarioId()`. Check the default sortie gives `f6f-hellcat`, and a Wildcat choice gives `wildcat`. Then Review Focus 5: from that flight, Return to title, keep the **same scenario**, pick the Hellcat, and Launch. The model must read `f6f-hellcat` again, which proves an aircraft-only change rebuilds the entities.
  4. **A quick launch reaches flight without the title, and its debrief shows the stamp.** `quickLaunch(page, { scenario: 'free-flight', aircraft: 'f4f-wildcat', loadout: 'clean' })`, then:
     - the `Title` dialog is hidden;
     - `diveToSea(page)`, then the debrief contains `Dev sortie: not recorded`;
     - `localStorage`'s roster is unchanged from before the launch.
  5. **Invalidation on Dev uncheck.** Check Dev, pick Furball, go Back to Form 1, uncheck Dev, press New game. The Scenario radiogroup has no `Furball` row, and `Free Flight` is selected.
  6. **Captures:** one screenshot of each of the four forms, at 2560×1440, into `test-results/sortie-form-<n>.png`.
  7. **AD-2: a KIA pilot launching a Dev sortie stays KIA.**
     - Enlist `Fallen Pilot` through the forms (the `New pilot` path in `startGame`). Leave the title without launching.
     - Mark the pilot KIA in storage the way the app stores it: `page.evaluate` reads `localStorage['ww2airsim.roster.v1']`, sets that pilot's `status` to `'kia'`, writes it back, and reloads the page.
     - Record the pilot's `resurrections`.
     - Select the pilot. Check Dev. Pick `Free Flight` and the Zero with `Bombs`, which is illegal without Dev and so makes a genuine Dev sortie. Launch.
     - Once flying, read the roster from `localStorage`: the pilot's `status` is still `'kia'` and `resurrections` is unchanged.
     - Return to title: the pilot's row still shows `K.I.A.`
     - Repeat with `status: 'discharged'`, expecting `DISCHARGED`.
     - Control case, which proves the test can see a resurrection: the same KIA pilot launching the default non-Dev sortie comes back `'active'` with `resurrections + 1`.

- [x] **Step 2: Run the Tier 2 suite on the reference GPU**, twice, the M4 way: `tests/e2e/sortie.spec.ts` plus every file Task 7 touched. Record both rc values and durations. Then run the full `npm run test:tier2` once through the spare slot, and record rc and any pre-existing failures, checked against `main`. Also run the GPU budget spec (gpu p95 < 6.0 ms at 1440p). The Hellcat's own model replaces the Wildcat's in every default scenario, so record the p95 before and after.

- [x] **Step 3: Frozen captures for Mark.** Copy the four form captures into `docs/handoff/<date>-sortie-forms-shots/`. Add three flight captures:
  - the default Hellcat parked at Tacloban;
  - the default Hellcat spotted on the Essex (`deck-quals`);
  - the Dev Zero with Hellcat-layout bombs hung.

  Read every capture before writing about it. A capture that shows a wheel off the ground, a store floating off the wing or an eye point outside the canopy becomes an open item, with the capture named.

- [x] **Step 4: Write the handoff.** Follow M4's shape:
  1. what changed, commit by commit;
  2. measured numbers: verify counts, Tier 2 runs, GPU p95 before and after;
  3. rulings: SF-R1 to SF-R9, the addenda AD-1 to AD-3 (say which way AD-3 went), and execution rulings from the ledger, **with SF-R6 called out for Mark's decision**;
  4. Tier 2 and captures;
  5. open items.

  Update Plan 9's §15 row with one sentence and the plan, spec and handoff links. Replace README's "Form 1 of 2 … Form 2 of 2" description with the four forms, the Dev checkbox and the quick launch, pointing at `titleScreen.ts` and the spec rather than restating the rules.

- [x] **Step 5: `remote-run npm run verify; rc=$?; echo "rc=$rc"`**, expecting rc=0. Commit, push the branch, and email the handoff:

  ```bash
  git add tests/e2e/sortie.spec.ts docs/ README.md
  git commit -m "Sortie forms: Tier 2 acceptance, captures, handoff, §15 row and README"
  git push -u origin worktree-sortie-forms
  python3 tools/mail-doc.py docs/handoff/<date>-sortie-forms.md "ww2airsim: sortie forms handoff (worktree-sortie-forms, not merged)"
  ```

  Do not merge into `main`, push `main` or deploy.
