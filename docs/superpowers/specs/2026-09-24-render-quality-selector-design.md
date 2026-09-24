# Render quality selector — design

**Status: approved design, 2026-09-24.** Brainstormed with Mark after he
played the overnight build and reported trees vanishing mid-flight; the root
cause (`docs/superpowers/specs/2026-09-24-post-overnight-critiques.md` §1)
is a silent, one-time GPU probe that already exists
(`adaptOceanQuality` in `src/render/main.ts`) picking a tier nobody can see
or override. This spec turns that probe into a visible, overridable,
persisted choice, and generalizes it across the three rendering systems that
already (informally) share it.

## 1. What exists today, and why this is smaller than it looks

Three independent tier tables already exist, and — this was confirmed by
reading the code, not assumed — **two of them already key off the same
value** at their call sites:

- `OCEAN_TIERS` (`src/render/ocean/tiers.ts`): `high`/`medium`/`low`,
  varying FFT cascade count/resolution. `tierForFrameTimeMs(ms)` maps a
  measured GPU-time cost to one of these.
- `CLOUD_TIERS` (`src/render/scene/clouds.ts`): `high`/`medium`/`low`,
  varying raymarch step counts. `main.ts:862` sets
  `cloudTier = forcedCloudTier ?? oceanTier.name` at boot, and
  `main.ts:949-950` calls `clouds.setTier(next.name)` /
  `shadow.setTier(next.name)` with the *same* `next` the ocean probe picked.
- `SCENERY_TIERS` (`src/render/scene/tiers.ts`): `high`/`medium`/`low`,
  varying tree fade-out distance (`low` = `treeFadeEndM: 0`, i.e. no trees —
  this is item #1's actual bug). `main.ts:1911` and `:946` call
  `vegetation.setTier(oceanTier.name)` / `vegetation.setTier(next.name)` —
  again, the ocean probe's result, not an independent measurement.

`SCENERY_TIERS`'s own doc comment states this was deliberate: "the app has
exactly one quality signal... and a second, independently chosen tier would
only disagree with it." **This spec deliberately reverses that stance** (see
§4) — Mark's own account of item #1 is a real case for wanting them to
diverge (e.g. keep ocean/clouds at `high`, drop scenery to `low`), and every
call site already accepts an independent name; only the *always-pass-the-
-same-value* convention needs to change, not the call sites themselves. The
comment in `scene/tiers.ts` gets corrected in Task 1 below to state why
independent tiers are now supported instead of asserting they aren't.

The actual measurement mechanism, `adaptOceanQuality`, already:
- Samples ~180 real rendered frames (~3s) of GPU time (via
  `renderer.hasFeature('timestamp-query')`, falling back to raw frame
  intervals on adapters without that feature — same threshold logic, just
  looser: `cost <= 18 ? high : cost <= 34 ? medium : low`).
- Picks a tier exactly once (`qualityChecked` latch — "never oscillate
  tiers or repeatedly compile pipelines during flight").
- Applies it as a side effect, silently, mid-title-screen, with no UI and
  no memory across a reload.

So this spec's real scope is: (a) one shared type so the three tables can't
drift apart, (b) `localStorage` persistence with a settings dialog, (c)
letting `adaptOceanQuality`'s measurement become a *recommendation* instead
of a silent side effect, and (d) letting the three systems' tiers diverge
when the user's choice says so. It is explicitly **not** a rewrite of any
of the three tier tables, the probe's sampling logic, or its thresholds.

## 2. Global Constraints

- `src/sim/` is untouched by this feature entirely — it is pure
  `src/render/` state (rendering detail, not simulation).
- The existing DEV-only query overrides (`?oceanTier=`, `?cloudTier=`) are
  unchanged and keep working exactly as today, for Tier 2 measurement
  scripts that depend on them. They apply the same as before, and now
  **take precedence over a saved setting** (a DEV override should never be
  silently defeated by `localStorage` from a previous run on the same
  browser profile).
- `npm run verify` (typecheck, lint at zero warnings, depcruise, tests) ends
  every task, `rc=$?` captured directly.
- US spelling in new identifiers/prose.
- No change to the existing 6.0 ms GPU frame-time budget or its test; this
  feature adds negligible per-frame cost (a probe that already runs today,
  a settings dialog that renders only when open).

## 3. `src/render/quality.ts` (new)

The shared type and persistence layer, no rendering code:

```ts
export type QualityTierName = 'high' | 'medium' | 'low'

export type QualitySettings = {
  readonly ocean: QualityTierName
  readonly scenery: QualityTierName
  readonly clouds: QualityTierName
}

export function defaultQualitySettings(tier: QualityTierName): QualitySettings {
  return { ocean: tier, scenery: tier, clouds: tier }
}

/** Reads `localStorage['ww2airsim.quality.v1']`. Returns `null` on missing
 *  or corrupt data (warns, never throws) -- same contract as
 *  `roster.ts`'s `loadRoster`. */
export function loadQualitySettings(): QualitySettings | null

/** Writes `settings` to `localStorage['ww2airsim.quality.v1']`. Warns and
 *  no-ops on a write failure (private-browsing storage denial, quota) --
 *  same contract as `roster.ts`'s `saveRoster`. */
export function saveQualitySettings(settings: QualitySettings): void

/** Clears the saved settings (the "Reset to auto-detect" action). */
export function clearQualitySettings(): void

/** `settings.ocean === settings.scenery === settings.clouds ? that tier :
 *  null` -- drives the Simple row's single-selection display; `null` means
 *  "show as Custom" in the UI. */
export function uniformTier(settings: QualitySettings): QualityTierName | null
```

`OceanTier['name']`, `SceneryTierName`, and `CloudTierName` (the three
existing per-system tables) each become `QualityTierName` rather than their
own independently-declared string unions — a type-only change, `as const`
key sets already match exactly (`'high' | 'medium' | 'low'` in all three),
so this is imports and a type alias, not a rename of any tier's data.

## 4. `scene/tiers.ts` comment correction

`SCENERY_TIERS`'s doc comment (quoted in §1) asserted a single shared
quality signal was the *only* sensible design. Replace it with: the three
systems' tiers can now be set independently via the title screen's Advanced
panel; they default to moving together (§5) because that is what the
auto-probe recommends, not because divergence is disallowed. Point at this
spec rather than re-explaining the UI.

## 5. Boot sequence (`main.ts`)

Replace `adaptOceanQuality`'s current "measure once, silently apply"
behavior with:

1. **At boot, before any tier-dependent object is created** (cascades,
   clouds, vegetation): call `loadQualitySettings()`.
   - **Non-null** (a saved choice exists): build ocean cascades, clouds,
     and vegetation directly at their saved tiers. `adaptOceanQuality`'s
     probe **does not run at all** — this is the "probe once ever" rule.
     `qualityChecked` starts pre-latched true in this path.
   - **Null** (first visit, or after a reset): boot at today's existing
     defaults (`OCEAN_TIERS[0]`/`'high'` for all three, unchanged from
     current behavior) and let the probe run as it does today.
2. **DEV query overrides** (`?oceanTier=`, `?cloudTier=`) still short-
   circuit both paths exactly as today, applied after whichever boot path
   above ran — a DEV override on top of a saved setting still wins, matching
   today's precedence for `forcedOceanTier`/`forcedCloudTier`.
3. **When the probe resolves** (the existing ~180-frame sample window):
   - If the settings dialog has recorded no explicit user interaction yet
     this session, the recommended tier becomes the active setting for all
     three systems (today's exact live-swap behavior — cascades rebuilt,
     `vegetation.setTier`/`clouds.setTier`/`shadow.setTier` called), **and**
     is saved via `saveQualitySettings(defaultQualitySettings(recommended))`
     so it persists next visit.
   - If the user already made an explicit choice before the probe resolved,
     the probe's result is discarded outright — it never overwrites an
     explicit pick, and no save happens (the explicit pick's own save
     already happened at click time, §6).
4. **Any explicit interaction with the settings dialog** (a Simple-row tier
   click, or an Advanced per-system change) calls the relevant `setTier`
   call(s) live and `saveQualitySettings` immediately, and sets a
   `explicitChoiceMade` flag `main.ts` already needs for step 3 above.

## 6. Title screen: a Settings dialog (`titleScreen.ts`)

A **"Settings"** button, visible at all times regardless of which roster/
scenario/loadout step is active (this is session-wide state, not part of
starting a sortie). Clicking it opens a modal; Esc or a close button
dismisses it back to whatever step was underneath. No separate "Apply" —
every control inside applies immediately on click, matching every other
button on this screen.

Modal contents. Throughout, "`currentSettings`" means the live, in-memory
active settings — `defaultQualitySettings('high')` if nothing is persisted
yet and the probe hasn't resolved, the probe's recommendation once it
resolves (§5 step 3), or whatever was loaded/saved — never a direct
`loadQualitySettings()` call on every render, since that would miss the
in-flight probe result and any not-yet-saved live state.

- **Simple row**: three buttons, `High` / `Medium` / `Low`. Selected state
  comes from `uniformTier(currentSettings)` — highlights the matching
  button, or none if `null` (Advanced values diverge; see below). The
  probe's recommendation, once known, appends `(Recommended)` to that
  tier's label; before that, no suffix is shown (not "measuring…" text —
  simpler, and the Simple row's own selected state already shows the live
  default of `high` while waiting).
- **"Advanced ▸" toggle**, collapsed by default. Expands to three rows —
  Ocean, Scenery, Clouds — each its own `High`/`Medium`/`Low` button group,
  reflecting `currentSettings.ocean` / `.scenery` / `.clouds` independently.
  Changing one via Advanced can make the Simple row above show no
  selection (values now diverge) — expected, not an error state.
- **"Reset to auto-detect"**: calls `clearQualitySettings()`, disabled
  (grayed, unclickable) until a setting has actually been saved this
  session or restored from a prior one. Does not re-run the probe
  immediately — the reset takes effect on the *next* page load, same as
  "no saved settings" in §5. (Re-probing live, mid-session, was explicitly
  ruled out — §5 step 3's flow only ever fires once per page load.)

## 7. What this spec deliberately does not do

- No change to `OCEAN_TIERS`/`CLOUD_TIERS`/`SCENERY_TIERS`'s actual per-tier
  numbers, or to the probe's sampling window/thresholds — those were tuned
  against real measurements on dated occasions and are out of scope here.
- No G-force/arcade-realistic toggle (item #4 of the critiques doc) — the
  Settings dialog is built to accommodate it later without redesigning the
  screen, but it is not part of this feature.
- No change to what `Low` scenery tier renders (item #1's option 2, "give
  Low a reduced forest") — Mark's call (2026-09-24) was to keep `Low` =
  zero trees, now as a visible, explicit, overridable choice instead of a
  silent one. Revisit only if that decision changes.
- No mobile/touch-specific UI — the existing title screen is
  keyboard/mouse-first and this follows its convention.

## 8. Testing

**Tier 1** (`tests/render/quality.test.ts`, new; matches `roster.test.ts`'s
shape and its in-memory fake `window.localStorage` pattern for vitest's
`node` environment):
- `loadQualitySettings`/`saveQualitySettings` round-trip.
- Corrupt/malformed stored JSON → `loadQualitySettings` returns `null`,
  warns, never throws.
- `uniformTier`: all-equal → that tier; any divergence → `null`.
- `defaultQualitySettings` produces one tier repeated three times.

**Tier 1** (`tests/render/titleScreen.test.ts`, extended): Settings button
opens/closes the dialog; Simple row click calls the right `setTier`-style
callback and updates the selected state; Advanced row clicks are
independent of each other and of the Simple row; Reset is disabled with
nothing saved and enabled after a save.

**Tier 2** (`tests/e2e/`, new or extended spec): on a fresh profile (clear
storage first), the Settings dialog shows no tier selected as
`(Recommended)` immediately, the recommendation appears once the ~3s probe
window elapses, an explicit Simple-row pick persists across a reload (no
second probe run — verifiable via a DEV hook exposing whether the probe
ran, matching `__ww2`'s existing diagnostic-hook convention), and an
Advanced per-system override (e.g. Scenery → Low with Ocean/Clouds left
High) changes only that system's rendered output — screenshot-verified,
read directly, not argued about.

## 9. Open items for the implementation plan, not this spec

- Exact CSS/visual styling of the modal — left to implementation, following
  the existing title screen's native-button, no-framework convention.
- Whether the DEV hook for Tier 2's "did the probe run" check is a new
  `__ww2` field or reuses an existing one — an implementation detail.
