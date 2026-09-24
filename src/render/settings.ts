import './ui/naval-comms.css'
import { INTERIM_ASSET_QUALITY_TIER } from './content.js'
import {
  clearQualitySettings, defaultQualitySettings, loadAssetQualityTier, loadQualitySettings,
  saveAssetQualityTier, saveQualitySettings, uniformTier,
  type AssetQualityTierName, type QualitySettings, type QualityTierName,
} from './quality.js'

/**
 * The title screen's Settings dialog (design:
 * `docs/superpowers/specs/2026-09-24-render-quality-selector-design.md` §6
 * and §10 for Asset Quality, `2026-09-24-visual-realism-pass-design.md` §1
 * for Damage Model, `2026-09-24-naval-comms-ui-design.md` §3 for the look).
 *
 * Split the way `titleScreen.ts` and `debrief.ts` are, and for the same
 * reason: a pure model the Node suite asserts on (`createSettingsModel`),
 * thin DOM under it (`createSettingsDialog`). The vitest environment is
 * `node` -- no `document` -- so every decision this dialog makes lives in
 * the model and the DOM only reflects it. `tests/render/settings.test.ts`
 * covers the model; the DOM layer is untested here, exactly as
 * `createTitleScreen`'s own DOM is.
 *
 * Its own file rather than more of `titleScreen.ts` (which the plan named)
 * for two reasons: that file is already ~490 lines and Task 7 of the same
 * plan rewrites its roster section, so keeping the dialog out of it removes
 * a real collision; and `main.ts` (Task 6) needs the model, not the title
 * screen, to read settings at boot and push the GPU probe's result back in.
 * `titleScreen.ts` owns only the button that opens it.
 *
 * WHERE EACH SETTING PERSISTS, since this dialog writes three separate
 * things and the answer is deliberately not uniform:
 * - Render Quality -> `quality.ts`'s `ww2airsim.quality.v1` (pre-existing).
 * - Asset Quality  -> `quality.ts`'s `ww2airsim.assetQuality.v1`, a sibling
 *   key; that function's own comment says why it is not a field on
 *   `QualitySettings`.
 * - Damage Model   -> `ww2airsim.damageModel.v1`, below. It lives HERE and
 *   not in `quality.ts` because it is not a quality axis at all -- it is a
 *   gameplay consequence toggle that happens to share this dialog. Folding
 *   it into a module called `quality` would make the module's name a lie
 *   and would tempt the boot sequence into treating it as probe-related.
 */

const DAMAGE_MODEL_KEY = 'ww2airsim.damageModel.v1'

/** Realistic (shipped behavior) vs. Arcade ("just turning off aggressive
 *  maneuvering damage" -- Mark, quoted in the visual-realism spec §1). */
export type DamageModel = 'realistic' | 'arcade'

/** Arcade is the opt-in. Nothing about the sim changes until a player asks. */
export const DEFAULT_DAMAGE_MODEL: DamageModel = 'realistic'

const DAMAGE_MODELS: readonly DamageModel[] = ['realistic', 'arcade']
function isDamageModel(v: unknown): v is DamageModel {
  return typeof v === 'string' && (DAMAGE_MODELS as readonly string[]).includes(v)
}

/** Reads `localStorage['ww2airsim.damageModel.v1']`; `null` on missing or
 *  unrecognized data (warns, never throws) -- the same contract every other
 *  loader in this codebase has (`quality.ts`, `roster.ts`). */
export function loadDamageModel(): DamageModel | null {
  try {
    const raw = window.localStorage.getItem(DAMAGE_MODEL_KEY)
    if (raw === null) return null
    if (!isDamageModel(raw)) {
      console.warn('damage model in localStorage is not a known model; ignoring:', raw)
      return null
    }
    return raw
  } catch (err) {
    console.warn('damage model in localStorage is unreadable; ignoring:', err)
    return null
  }
}

export function saveDamageModel(model: DamageModel): void {
  try {
    window.localStorage.setItem(DAMAGE_MODEL_KEY, model)
  } catch (err) {
    console.warn('damage model could not be saved to localStorage:', err)
  }
}

export function clearDamageModel(): void {
  try {
    window.localStorage.removeItem(DAMAGE_MODEL_KEY)
  } catch (err) {
    console.warn('damage model could not be cleared from localStorage:', err)
  }
}

/** One of the three rendering systems whose tier the Advanced disclosure
 *  lets diverge (spec §4: they default to moving together because that is
 *  what the probe recommends, not because divergence is disallowed). */
export type QualitySystem = 'ocean' | 'scenery' | 'clouds'

type Option<T> = { readonly value: T; readonly label: string; readonly note: string }

/**
 * The Simple row, worst-to-best the way the prototype's ballot lists it.
 *
 * The notes are this game's REAL tier differences, read off the three tier
 * tables -- not the prototype's placeholder copy, which mentions a "shadow
 * range" this renderer does not have (naval-comms spec §1 calls that copy
 * illustrative filler). `low` naming "no trees" explicitly is deliberate:
 * a silent `low` tier rendering zero trees is the exact confusion this
 * whole feature exists to end (`SCENERY_TIERS`'s `treeFadeEndM: 0`, and
 * the critique that started it).
 */
export const RENDER_QUALITY_OPTIONS: readonly Option<QualityTierName>[] = [
  { value: 'low', label: 'Low', note: 'Fastest. Reduced ocean and cloud detail, and no trees at all.' },
  { value: 'medium', label: 'Medium', note: 'Balanced. Suits most machines.' },
  { value: 'high', label: 'High', note: 'Full ocean simulation, dense clouds, trees to the horizon.' },
]

export const ADVANCED_SYSTEMS: readonly { readonly value: QualitySystem; readonly label: string }[] = [
  { value: 'ocean', label: 'Ocean' },
  { value: 'scenery', label: 'Scenery' },
  { value: 'clouds', label: 'Clouds' },
]

/**
 * Asset Quality: what gets DOWNLOADED, as opposed to how hard the GPU works
 * on what is already here (spec §10). Each ceiling below is that spec's own
 * measured table, not a round number invented here.
 *
 * `high` and `ultra` deliberately admit they change nothing today. The
 * headroom they buy is for a later spec's real textures; saying so is
 * cheaper than a player picking Ultra, seeing no difference, and concluding
 * the setting is broken.
 */
export const ASSET_QUALITY_OPTIONS: readonly Option<AssetQualityTierName>[] = [
  { value: 'low', label: 'Low', note: 'Up to 50 MB. Terrain at 49 m spacing.' },
  { value: 'medium', label: 'Medium', note: 'Up to 150 MB. Full 24 m terrain.' },
  { value: 'high', label: 'High', note: 'Up to 500 MB. Same terrain as Medium; spare budget for later texture work.' },
  { value: 'ultra', label: 'Ultra', note: 'Up to 1 GB. Same terrain as Medium; spare budget for later texture work.' },
]

/** Spec §10: this axis needs a reload, unlike the render-quality rows above
 *  which live-apply. The dialog must say so rather than imply otherwise. */
export const ASSET_QUALITY_EFFECT_NOTE = 'Takes effect next time you start a sortie.'

export const DAMAGE_MODEL_OPTIONS: readonly Option<DamageModel>[] = [
  {
    value: 'realistic', label: 'Realistic',
    note: 'Hard maneuvering and overspeed can break the airframe.',
  },
  {
    value: 'arcade', label: 'Arcade',
    note: 'No structural damage from G or overspeed. The stress gauge still reads.',
  },
]

/** Spec §6: the recommendation is measured, not assumed, and only after the
 *  ~180-frame probe window has elapsed. */
export const RECOMMENDATION_NOTE =
  'The recommendation is measured from this machine automatically, a few seconds after launch.'

export type SettingsSnapshot = {
  readonly isOpen: boolean
  readonly advancedExpanded: boolean
  /** The live, in-memory active render settings -- spec §6's `currentSettings`. */
  readonly quality: QualitySettings
  /** `uniformTier(quality)`: the Simple row's selection, or `null` once the
   *  Advanced values diverge (spec §6 -- expected, not an error state). */
  readonly simpleTier: QualityTierName | null
  readonly assetQuality: AssetQualityTierName
  readonly damageModel: DamageModel
  /** The boolean `stepCombat`'s trailing `arcadeDamage` parameter (Task 3)
   *  takes. `src/sim/` may not read `localStorage` itself, so this value is
   *  threaded in as a parameter -- visual-realism spec §1. */
  readonly arcadeDamage: boolean
  /** The probe's pick once `main.ts` pushes it in; `null` until then, which
   *  is what suppresses the Recommended stamp rather than a "measuring..."
   *  label (spec §6). */
  readonly recommendedTier: QualityTierName | null
  /** Whether "Reset to auto-detect" is enabled: whether a render-quality
   *  choice is actually persisted right now. Asset Quality and Damage Model
   *  deliberately do NOT count -- there is no auto-detection for either
   *  (spec §10: "No GPU-style probe for this axis"), so a reset would have
   *  nothing to fall back to. */
  readonly canReset: boolean
  /** Spec §5 step 3: set by a Simple/Advanced pick only. `main.ts` checks it
   *  when the probe resolves and discards the probe's result if it is true,
   *  so a measurement can never overwrite a deliberate choice. An Asset
   *  Quality or Damage Model pick does not set it -- neither axis is probed,
   *  so neither has anything to protect. */
  readonly explicitChoiceMade: boolean
}

export type SettingsCallbacks = {
  /** Fired on every Simple/Advanced pick, with the full new settings.
   *  `main.ts` turns this into its live `setTier` calls; persistence has
   *  already happened by the time it runs. */
  readonly onQualityChange?: (settings: QualitySettings) => void
  /** Fired on an Asset Quality pick. Nothing is expected to happen live --
   *  see `ASSET_QUALITY_EFFECT_NOTE`; this exists so `main.ts` can log or
   *  surface a "restart to apply" hint if it ever wants one. */
  readonly onAssetQualityChange?: (tier: AssetQualityTierName) => void
  /** Fired on a Damage Model pick. `main.ts` keeps the boolean it passes
   *  into `stepCombat` in sync from here. */
  readonly onDamageModelChange?: (model: DamageModel) => void
}

export type SettingsModel = {
  snapshot(): SettingsSnapshot
  open(): void
  close(): void
  toggleAdvanced(): void
  /** Sets ocean/scenery/clouds all to `tier`, saves, and applies. */
  selectSimpleTier(tier: QualityTierName): void
  /** Sets one system's tier, leaving the other two alone, saves, applies. */
  selectSystemTier(system: QualitySystem, tier: QualityTierName): void
  selectAssetQuality(tier: AssetQualityTierName): void
  selectDamageModel(model: DamageModel): void
  /** Spec §6: clears the saved render-quality choice so the NEXT page load
   *  probes again. Deliberately does not re-probe or revert live state. */
  resetToAutoDetect(): void
  /** `main.ts` pushes the probe's result in when it resolves; display-only
   *  (it stamps a tier "Recommended"), it neither selects nor saves. */
  setRecommendedTier(tier: QualityTierName): void
  /** `main.ts` pushes back settings IT applied -- the probe's live swap.
   *  Never counts as an explicit choice. */
  setCurrentQuality(settings: QualitySettings): void
  /** Called after every state change, so the DOM layer can re-render. One
   *  listener; the dialog is the only consumer. */
  subscribe(listener: () => void): void
}

export function createSettingsModel(callbacks: SettingsCallbacks = {}): SettingsModel {
  // Spec §5 step 1: a persisted choice means the probe never runs, so what is
  // loaded here IS what is rendering. With nothing persisted the app boots at
  // today's existing default of `high` for all three, and the probe may
  // replace it via `setCurrentQuality` a few seconds later.
  let quality: QualitySettings = loadQualitySettings() ?? defaultQualitySettings('high')

  // Nothing persisted -> show what this boot is ACTUALLY loading, which is
  // `content.ts`'s interim constant, not the spec §10 addendum's eventual
  // `medium` first-visit default. Those differ today for a measured reason
  // (an L0 floor allocates ~358 MB of mesh textures; see that constant's own
  // comment) and a dialog that preselected `medium` while the loader fetched
  // L1 would be stating something false. When Task 6's memory work lets that
  // constant move, this default follows it with no edit here.
  let assetQuality: AssetQualityTierName = loadAssetQualityTier() ?? INTERIM_ASSET_QUALITY_TIER
  let damageModel: DamageModel = loadDamageModel() ?? DEFAULT_DAMAGE_MODEL

  let isOpen = false
  let advancedExpanded = false
  let recommendedTier: QualityTierName | null = null
  let explicitChoiceMade = false
  let listener: (() => void) | null = null

  const changed = (): void => listener?.()

  const applyQuality = (next: QualitySettings): void => {
    quality = next
    explicitChoiceMade = true
    // Saved BEFORE the callback runs, so a throw out of `main.ts`'s live
    // `setTier` work cannot leave the player's pick unpersisted.
    saveQualitySettings(next)
    callbacks.onQualityChange?.(next)
    changed()
  }

  return {
    snapshot: (): SettingsSnapshot => ({
      isOpen,
      advancedExpanded,
      quality,
      simpleTier: uniformTier(quality),
      assetQuality,
      damageModel,
      arcadeDamage: damageModel === 'arcade',
      recommendedTier,
      // Read from storage rather than tracked as a flag: `main.ts` also saves
      // (spec §5 step 3, the probe's recommendation), so a locally-tracked
      // "has saved" boolean would go out of date the moment someone other
      // than this model wrote the key. One read of one key per render.
      canReset: loadQualitySettings() !== null,
      explicitChoiceMade,
    }),
    open: (): void => { isOpen = true; changed() },
    close: (): void => { isOpen = false; changed() },
    toggleAdvanced: (): void => { advancedExpanded = !advancedExpanded; changed() },
    selectSimpleTier: (tier: QualityTierName): void => applyQuality(defaultQualitySettings(tier)),
    selectSystemTier: (system: QualitySystem, tier: QualityTierName): void =>
      applyQuality({ ...quality, [system]: tier }),
    selectAssetQuality: (tier: AssetQualityTierName): void => {
      assetQuality = tier
      saveAssetQualityTier(tier)
      callbacks.onAssetQualityChange?.(tier)
      changed()
    },
    selectDamageModel: (model: DamageModel): void => {
      damageModel = model
      saveDamageModel(model)
      callbacks.onDamageModelChange?.(model)
      changed()
    },
    resetToAutoDetect: (): void => {
      clearQualitySettings()
      // `explicitChoiceMade` is deliberately NOT cleared. It guards this page
      // load's probe result (spec §5 step 3), and a player who has been
      // clicking tiers this session should not have the probe reach in and
      // move them a moment later just because they also pressed Reset. The
      // reset's effect is on the next load, which is exactly what the spec
      // says it is.
      changed()
    },
    setRecommendedTier: (tier: QualityTierName): void => { recommendedTier = tier; changed() },
    setCurrentQuality: (settings: QualitySettings): void => { quality = settings; changed() },
    subscribe: (next: () => void): void => { listener = next },
  }
}

export type SettingsDialogHandle = {
  readonly isOpen: () => boolean
  open(): void
  close(): void
  /** Removes the dialog's node and its window key listener. `titleScreen.ts`
   *  calls this from `hide()`, because it rebuilds its whole overlay from
   *  scratch on every `show()` and a listener left behind would accumulate
   *  one per return-to-title. */
  destroy(): void
}

const STAMP_FILTER_ID = 'ww2StampRough'

/**
 * `.stamp`'s hand-struck edge is `filter: url(#stampRough)` -- an SVG filter
 * the prototype declared inline in its own page. Nothing in `index.html`
 * declares it, and a CSS `filter: url()` pointing at a missing element is
 * not merely ignored in Chromium, so the Recommended stamp would vanish.
 * Declared once per dialog, inside it, so it cannot outlive the overlay.
 */
function stampFilterDefs(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute'
  svg.innerHTML =
    `<filter id="${STAMP_FILTER_ID}" x="-20%" y="-20%" width="140%" height="140%">` +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2"/></filter>'
  return svg
}

function sectionTitle(text: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'form-section-title'
  el.textContent = text
  return el
}

/**
 * One `.ballot-option`, carrying the prototype's own accessibility contract:
 * `role="radio"` + `aria-checked` + `tabindex="0"` + Enter/Space activation
 * (naval-comms spec §3). Ported as a listener pair rather than as the
 * prototype's page-wide inline `<script>` sweep, matching how every other
 * control in `titleScreen.ts` wires itself up.
 *
 * Enter is swallowed (`stopPropagation`) for the same reason
 * `titleScreen.ts`'s new-pilot field swallows it: that file has a `window`
 * keydown listener that starts a flight on Enter, and a bubbled Enter from a
 * ballot would launch a sortie out from under an open dialog.
 */
function ballotOption(label: string, note: string, onActivate: () => void): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'ballot-option'
  el.setAttribute('role', 'radio')
  el.setAttribute('aria-checked', 'false')
  el.tabIndex = 0

  const box = document.createElement('span')
  box.className = 'ballot-box'
  const text = document.createElement('span')
  text.className = 'ballot-label'
  text.textContent = label
  el.append(box, text)
  if (note !== '') {
    const noteEl = document.createElement('span')
    noteEl.className = 'ballot-note'
    noteEl.textContent = note
    el.appendChild(noteEl)
  }

  el.addEventListener('click', onActivate)
  el.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') return
    e.preventDefault()
    e.stopPropagation()
    onActivate()
  })
  return el
}

function radioGroup(ariaLabel: string): HTMLDivElement {
  const group = document.createElement('div')
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-label', ariaLabel)
  return group
}

/**
 * The dialog itself: built once into `parent`, hidden, and re-rendered from
 * `model.snapshot()` on every change. Nothing here decides anything -- every
 * branch below reads a field the model already computed, which is what makes
 * the `node`-environment test suite's coverage of the model meaningful.
 */
export function createSettingsDialog(parent: HTMLElement, model: SettingsModel): SettingsDialogHandle {
  const overlay = document.createElement('div')
  overlay.dataset.ww2Settings = ''
  overlay.className = 'naval-comms'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Settings')
  overlay.style.cssText =
    'position:absolute;inset:0;display:none;overflow-y:auto;background:rgba(11,13,16,.82);z-index:30'
  overlay.appendChild(stampFilterDefs())

  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.style.maxWidth = '640px'
  overlay.appendChild(sheet)

  const letterhead = document.createElement('div')
  letterhead.className = 'letterhead'
  const letterheadText = document.createElement('div')
  letterheadText.className = 'letterhead-text'
  const kicker = document.createElement('div')
  kicker.className = 'letterhead-kicker'
  kicker.textContent = 'Requisition & Standing Orders'
  const title = document.createElement('div')
  title.className = 'letterhead-title'
  title.textContent = "Ship's Options"
  letterheadText.append(kicker, title)
  const formNumber = document.createElement('div')
  formNumber.className = 'form-number'
  formNumber.textContent = 'FORM OPS-4'
  letterhead.append(letterheadText, formNumber)
  sheet.appendChild(letterhead)

  // ---- Render Quality, the Simple row ----
  sheet.appendChild(sectionTitle('Render Quality'))
  const simpleGroup = radioGroup('Render quality')
  const simpleOptions = new Map<QualityTierName, HTMLDivElement>()
  for (const option of RENDER_QUALITY_OPTIONS) {
    const el = ballotOption(option.label, option.note, () => model.selectSimpleTier(option.value))
    el.style.position = 'relative'
    simpleOptions.set(option.value, el)
    simpleGroup.appendChild(el)
  }
  sheet.appendChild(simpleGroup)

  // The Recommended tag: one stamp, moved to whichever tier the probe named,
  // rather than one hidden stamp per tier. Absent entirely until `main.ts`
  // pushes a recommendation in (spec §6: no "measuring..." placeholder).
  const recommendedStamp = document.createElement('div')
  recommendedStamp.className = 'stamp stamp--violet stamp--sm stamp--rotate-2'
  recommendedStamp.textContent = 'Recommended'
  recommendedStamp.style.cssText = `position:absolute;top:-30px;right:18px;filter:url(#${STAMP_FILTER_ID})`

  const recommendationNote = document.createElement('p')
  recommendationNote.className = 'fine-print'
  recommendationNote.style.cssText = 'margin-top:6px;padding-top:0;border-top:none'
  recommendationNote.textContent = RECOMMENDATION_NOTE
  sheet.appendChild(recommendationNote)

  // ---- Advanced disclosure ----
  const advancedToggle = document.createElement('button')
  advancedToggle.className = 'ink-button'
  advancedToggle.setAttribute('aria-expanded', 'false')
  advancedToggle.style.marginTop = '10px'
  advancedToggle.addEventListener('click', () => model.toggleAdvanced())
  sheet.appendChild(advancedToggle)

  const advancedPanel = document.createElement('div')
  advancedPanel.style.display = 'none'
  const systemOptions = new Map<QualitySystem, Map<QualityTierName, HTMLDivElement>>()
  for (const system of ADVANCED_SYSTEMS) {
    advancedPanel.appendChild(sectionTitle(system.label))
    const group = radioGroup(`${system.label} quality`)
    const byTier = new Map<QualityTierName, HTMLDivElement>()
    for (const option of RENDER_QUALITY_OPTIONS) {
      const el = ballotOption(option.label, '', () => model.selectSystemTier(system.value, option.value))
      byTier.set(option.value, el)
      group.appendChild(el)
    }
    systemOptions.set(system.value, byTier)
    advancedPanel.appendChild(group)
  }
  sheet.appendChild(advancedPanel)

  // ---- Asset Quality ----
  sheet.appendChild(sectionTitle('Asset Quality'))
  const assetGroup = radioGroup('Asset quality')
  const assetOptions = new Map<AssetQualityTierName, HTMLDivElement>()
  for (const option of ASSET_QUALITY_OPTIONS) {
    const el = ballotOption(option.label, option.note, () => model.selectAssetQuality(option.value))
    assetOptions.set(option.value, el)
    assetGroup.appendChild(el)
  }
  sheet.appendChild(assetGroup)
  const assetNote = document.createElement('p')
  assetNote.className = 'fine-print'
  assetNote.style.cssText = 'margin-top:6px;padding-top:0;border-top:none'
  assetNote.textContent = ASSET_QUALITY_EFFECT_NOTE
  sheet.appendChild(assetNote)

  // ---- Damage Model ----
  sheet.appendChild(sectionTitle('Damage Model'))
  const damageGroup = radioGroup('Damage model')
  const damageOptions = new Map<DamageModel, HTMLDivElement>()
  for (const option of DAMAGE_MODEL_OPTIONS) {
    const el = ballotOption(option.label, option.note, () => model.selectDamageModel(option.value))
    damageOptions.set(option.value, el)
    damageGroup.appendChild(el)
  }
  sheet.appendChild(damageGroup)

  // ---- Actions. No Save and no Cancel: every control above has already
  // applied and persisted by the time it is released (spec §6, naval-comms
  // spec §1). "Close" dismisses, it does not confirm. ----
  const buttons = document.createElement('div')
  buttons.className = 'button-row'
  const resetButton = document.createElement('button')
  resetButton.className = 'ink-button'
  resetButton.textContent = 'Reset to auto-detect'
  resetButton.addEventListener('click', () => model.resetToAutoDetect())
  const closeButton = document.createElement('button')
  closeButton.className = 'ink-button ink-button--primary'
  closeButton.textContent = 'Close'
  closeButton.addEventListener('click', () => model.close())
  buttons.append(resetButton, closeButton)
  sheet.appendChild(buttons)

  const finePrint = document.createElement('div')
  finePrint.className = 'fine-print'
  const persistNote = document.createElement('span')
  persistNote.textContent = 'Settings persist to this machine only, and apply the moment you pick them.'
  const escNote = document.createElement('span')
  escNote.textContent = 'Esc to close'
  finePrint.append(persistNote, escNote)
  sheet.appendChild(finePrint)

  parent.appendChild(overlay)

  const markGroup = <T>(options: Map<T, HTMLDivElement>, selected: T | null): void => {
    for (const [value, el] of options) el.setAttribute('aria-checked', String(value === selected))
  }

  const render = (): void => {
    const s = model.snapshot()
    overlay.style.display = s.isOpen ? 'flex' : 'none'

    markGroup(simpleOptions, s.simpleTier)
    for (const system of ADVANCED_SYSTEMS) {
      markGroup(systemOptions.get(system.value) ?? new Map(), s.quality[system.value])
    }
    markGroup(assetOptions, s.assetQuality)
    markGroup(damageOptions, s.damageModel)

    // The stamp hangs ABOVE its row, so the row it lands on has to make space
    // or the stamp sits on top of the previous row's text (the prototype's
    // own `.ballot-option:has(.ballot-recommend) { margin-top: 30px }`,
    // applied here rather than in the stylesheet because which row carries it
    // is a runtime measurement). Cleared from every row first: the
    // recommendation is pushed in once, but nothing guarantees it is pushed
    // in only once, or always for the same tier.
    for (const el of simpleOptions.values()) el.style.marginTop = ''
    if (s.recommendedTier === null) {
      recommendedStamp.remove()
    } else {
      const row = simpleOptions.get(s.recommendedTier)
      row?.appendChild(recommendedStamp)
      if (row !== undefined) row.style.marginTop = '30px'
    }

    advancedToggle.textContent = s.advancedExpanded ? 'Advanced ▾' : 'Advanced ▸'
    advancedToggle.setAttribute('aria-expanded', String(s.advancedExpanded))
    advancedPanel.style.display = s.advancedExpanded ? 'block' : 'none'

    resetButton.disabled = !s.canReset
    resetButton.style.opacity = s.canReset ? '1' : '.45'
    resetButton.style.cursor = s.canReset ? 'pointer' : 'default'
  }

  model.subscribe(render)
  render()

  // Esc, on `window` rather than the dialog, so it works no matter which of
  // the dialog's controls has focus -- and guarded on the model's own open
  // state so it is inert while the dialog is down.
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape') return
    if (!model.snapshot().isOpen) return
    e.preventDefault()
    e.stopPropagation()
    model.close()
  }
  window.addEventListener('keydown', onKey)

  return {
    isOpen: () => model.snapshot().isOpen,
    open: (): void => {
      model.open()
      closeButton.focus()
    },
    close: (): void => model.close(),
    destroy: (): void => {
      window.removeEventListener('keydown', onKey)
      overlay.remove()
    },
  }
}
