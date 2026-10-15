import { ballotOption, ensureStampFilter, radioGroup } from './ui/navalComms.js'
import { buttonRow, inkButton, letterhead, memoPanel, sectionTitle } from './ui/memo.js'
import { CREDITS, OSM_COPYRIGHT_URL, WORLDCOVER_LICENCE_URL, creditsLine } from './legend.js'
import { MODEL_CREDITS } from './modelCreditsIndex.js'
import { modelCreditParts } from './modelCredits.js'
import { TITLE_ART_URL } from './content.js'
import { racksLabel, type Loadout } from '../sim/weapons/stores.js'
import { createPilot, loadRoster, saveRoster, startSortie, type PilotRecord, type PilotStatus } from './roster.js'
import { openDossier } from './dossier.js'
import { insigniaElement, ribbonElement } from './insignia.js'
import { createSettingsDialog, createSettingsModel, type SettingsDialogHandle, type SettingsModel } from './settings.js'
import { readyBootProgress, type BootProgress } from './bootProgress.js'
import { awardedStamp, briefingModel, briefingRequest, renderBriefing } from './mission/briefing.js'
import { DEFAULT_TIME_OF_DAY, DEV_TAKEOFF_HOURS, TACLOBAN_LAT_DEG, nearestTakeoffTime, takeoffHours, type DevTakeoffTime, type TakeoffTime } from './sky/sun.js'
import type { Scenario } from '../sim/scenario.js'
import type { Badge } from '../sim/mission/schema.js'
import { DEV_STORES_SPEC_ID, needsDevStores, type SortieChoice, type StartKind } from '../sim/sortie.js'
import { DEFAULT_LOADOUT, aircraftFor, devLayoutNote, initialDraft, loadoutsFor, reconcile, visibleScenarios, withAircraft, withScenario, type FlowContext, type SortieDraft } from './sortieFlow.js'
import { aircraftRowLabel, storesLine, type FlyableAircraft } from './sortie/flyable.js'
import { sortieIsDev } from './devRecord.js'
import { SCENARIO_ID } from './content.js'
import { CLOUDINESS_OPTIONS, randomCloudiness } from './cloudiness.js'

/**
 * The title screen (design: docs/superpowers/specs/2026-09-19-title-screen-design.md;
 * the roster step below: docs/superpowers/specs/2026-09-23-meta-game-design.md §3).
 * Split like `debrief.ts`: a pure model the Node suite asserts on, thin DOM
 * under it. Created FIRST in `boot()`, so the art is up while the renderer,
 * the ocean and the terrain load behind it; `main.ts` holds the world while
 * `up()` is true, exactly as it does for the open navigation chart.
 *
 * The screen is six sequential memo forms in the Naval Communications style
 * (`ui/naval-comms.css`), with a small administrative memo (About project,
 * Settings) under all of them (sortie spec,
 * docs/superpowers/specs/2026-09-27-sortie-forms-design.md): Form 1 picks or
 * enlists a pilot and holds the Dev checkbox; each pilot row starts a new
 * sortie. Form 2 separates missions from the Training Grounds, Form 3 picks
 * the sortie, Form 4 sets time and weather, Form 5 assigns the aircraft and
 * Form 6 requisitions armament. Launch starts the flight. Back returns one
 * form with every choice kept; the
 * rules that decide what each form offers live in sortieFlow.ts.
 *
 * `show()` rebuilds the overlay from scratch rather than trying to reuse DOM
 * nodes an earlier `hide()` already removed -- simpler and safer -- and
 * re-reads `loadRoster()` on every call, so a score just banked by the
 * debrief that preceded it is on screen the moment the title comes back.
 */
export type TitleModel = {
  readonly newGame: string
  /** Form 6's button that starts the flight. A row's `New game` opens Form 2. */
  readonly launch: string
  /** Forms 2 through 5's way on to the next form (sortie spec). */
  readonly next: string
  /** Form 1's Dev checkbox (sortie spec): lifts every rule. */
  readonly dev: string
  /** Form 1's God mode checkbox: enabled only while Dev is checked (godMode.ts). */
  readonly god: string
  /** Form 2's way back to Form 1. */
  readonly back: string
  readonly about: string
  /** The administrative memo's link to the Hangar, hangar.html (Hangar spec §3). */
  readonly hangar: string
  readonly hangarHref: string
  /** The sound library, sounds.html (2026-10-09); its button shows only while Dev is checked. */
  readonly sounds: string
  readonly soundsHref: string
  readonly settings: string
  readonly close: string
  readonly aboutKicker: string
  readonly aboutTitle: string
  readonly aboutParagraphs: readonly string[]
  readonly credits: string
  readonly licence: string
  readonly repository: string
  readonly website: string
  /** The loading strip's label while the boot is not yet ready (loading spec §A.2). */
  readonly preparing: string
}

export function titleModel(): TitleModel {
  return {
    newGame: 'New game',
    launch: 'Launch',
    next: 'Next',
    dev: 'Dev — unlocks everything',
    god: 'God mode — cannot be hurt, never runs out, crashes bounce',
    back: 'Back',
    about: 'About project',
    hangar: 'Hangar',
    hangarHref: `${import.meta.env.BASE_URL}hangar.html`,
    sounds: 'Sounds',
    soundsHref: `${import.meta.env.BASE_URL}sounds.html`,
    settings: 'Settings',
    close: 'Close',
    aboutKicker: 'Project Office',
    aboutTitle: 'Project Information',
    aboutParagraphs: [
      'A WWII Pacific air combat simulator that runs in the browser. Fly an F6F ' +
        'Hellcat from carrier and land bases over a geographically real Leyte Gulf.',
      'Inspired by Hellcats Over the Pacific (Graphic Simulations, 1991) and its ' +
        'Missions at Leyte Gulf expansion. Clean-room: no original code, assets or ' +
        'mission text. WW2 AIRSIM is a working title.',
      'A technical playground: real terrain from the Copernicus DEM, a GEBCO sea ' +
        'floor, ESA WorldCover land cover, an FFT ocean and a deterministic flight ' +
        'model, all rendered with WebGPU.',
      'Privacy: this site uses Google Analytics to count visits and which ' +
        'missions are flown. No account, name or pilot roster leaves your browser.',
      'Created by Mark Tuttle. Copyright (C) 2026 Mark Tuttle.',
    ],
    credits: creditsLine(),
    licence: 'Source code: AGPL-3.0-or-later.',
    repository: 'https://github.com/coder999/ww2airsim',
    website: 'https://marktuttle.dev',
    preparing: 'Preparing aircraft...',
  }
}

/**
 * The letterhead text of the six sequential forms (sortie spec). Numbered so
 * the player can see how far there is to go before launch.
 */
export const TITLE_FORMS = {
  roster: { kicker: 'Bureau of Naval Personnel', title: 'Squadron Roster', number: 'Form 1 of 6' },
  type: { kicker: 'Flight Operations', title: 'Flight Type', number: 'Form 2 of 6' },
  orders: { kicker: 'Flight Operations', title: 'Sortie Orders', number: 'Form 3 of 6' },
  conditions: { kicker: 'Aerology Office', title: 'Flight Conditions', number: 'Form 4 of 6' },
  aircraft: { kicker: 'Bureau of Aeronautics', title: 'Aircraft Assignment', number: 'Form 5 of 6' },
  ordnance: { kicker: 'Bureau of Ordnance', title: 'Ordnance Requisition', number: 'Form 6 of 6' },
} as const

export const NEW_PILOT_GUIDANCE =
  'New pilots should complete Basic Flying, Torpedo Qualification and Carrier Qualification before operational missions.'

/** Form 3's text when no aircraft qualifies for the mission (Review Focus 2); Next stays disabled. */
export const NO_AIRCRAFT = 'No aircraft on the roster can fly this mission. Check Dev on Form 1 to fly anything.'

/**
 * The loadout picker's options (spec §1: "clean, bombs, rockets, both
 * (default both)"), a pure array so the Node suite can pin it the same way
 * `titleModel` pins the button text -- `createTitleScreen`'s radio row is
 * built straight off this and is otherwise untested here because the vitest
 * environment is `node`.
 */
export const LOADOUT_OPTIONS: readonly { readonly value: Loadout; readonly label: string }[] = [
  { value: 'clean', label: 'Clean' },
  { value: 'bombs', label: 'Bombs' },
  { value: 'torpedoes', label: 'Torpedoes' },
  { value: 'rockets', label: 'Rockets' },
  { value: 'both', label: 'Both' },
]
// Moved to sortieFlow.ts (the form model owns the default, SF-R4); re-exported so main.ts's import is unchanged.
export { DEFAULT_LOADOUT }

/** One row of the scenario picker. `kind`, a mission's `badge`, `start`,
 *  `aircraft` and a mission's `recommendedLoadout` restate facts from the
 *  scenario file (M2 R5, sortie ruling SF-R7): the forms need them before any
 *  file is fetched, and `tests/render/mission/options.test.ts` asserts they
 *  agree with `content/scenarios/`, and that every file there is listed.
 *  `dev` marks a test bed, listed only while Dev is checked (sortie spec A1);
 *  `description` is a range's Form 2 text (a mission shows its briefing). */
export type ScenarioPool = 'noncampaign' | 'training' | 'single'

export type ScenarioOption = {
  readonly value: string
  readonly label: string
  readonly kind: 'mission' | 'range'
  /** F5A (ruling D2, 2026-10-14): which campaign pool the row belongs to. `noncampaign` missions are
   *  repeatable, score-eligible headquarters missions; `training` (the ranges and the three
   *  qualifications) and `single` (dev fixtures) never score and never touch a campaign. */
  readonly pool: ScenarioPool
  readonly badge?: Badge
  readonly dev: boolean
  readonly start: StartKind
  readonly aircraft: string
  readonly recommendedLoadout?: Loadout
  readonly description?: string
}

/**
 * The scenario picker's options: every `content/scenarios/<id>.json` this
 * build ships, in the order shown, Dev-only test beds included (`dev: true`,
 * sortie spec A1; `scenarioOptions(false)` hides them). Player-facing labels,
 * not the raw content ids -- `pursuit-range` reads "Air Combat" here,
 * matching how Mark actually refers to it, not the file stem. The restated
 * facts are pinned against the files by `tests/render/mission/options.test.ts`.
 *
 * This is what `?scenario=` (spawn.ts's `SCENARIO_PARAM`) was always meant
 * to be replaced by (that file's own doc comment named this exact picker).
 * `?scenario=<id>` still selects which scenario a fresh page load boots
 * into, but picking a DIFFERENT one from this picker no longer navigates
 * there (Plan 9 Task 7): `main.ts`'s `onNewGame` calls `loadScenario` to
 * swap the entity list (aircraft, ships) in place instead, disposing
 * whatever was loaded and rebuilding to the new scenario's counts -- see
 * that function's own doc comment for the reasoning and what stays put
 * (terrain, ocean, sky, the panel). `isKnownScenarioId` below is what makes
 * accepting `?scenario=` in a PRODUCTION build safe either way: unlike
 * `scenarioIdFromQuery`'s format check alone, it rejects any well-formed id
 * that is not actually one of these.
 */
export const SCENARIO_OPTIONS: readonly ScenarioOption[] = [
  { value: 'free-flight', label: 'Free Flight', kind: 'range', pool: 'training', dev: false, start: 'airfield', aircraft: 'f6f-hellcat', description: 'Parked at Tacloban with the Essex task group offshore. No objectives: fly anywhere.' },
  { value: 'deck-quals', label: 'Deck Quals', kind: 'range', pool: 'training', dev: false, start: 'carrier', aircraft: 'f6f-hellcat', description: "Spotted on the Essex's deck. Practice launches and traps; no objectives." },
  { value: 'water-quals', label: 'Catalina Water Qualification', kind: 'mission', pool: 'noncampaign', badge: { id: 'water-qualified', name: 'Catalina Water Qualified' }, dev: false, start: 'water', aircraft: 'pby-5a-catalina', recommendedLoadout: 'torpedoes' },
  { value: 'gunnery-range', label: 'Gunnery Range', kind: 'range', pool: 'training', dev: false, start: 'airborne', aircraft: 'f6f-hellcat', description: 'On a low run-in to Tacloban with two parked Hellcat targets on the runway. Strafe them, then land straight ahead.' },
  { value: 'pursuit-range', label: 'Air Combat', kind: 'range', pool: 'training', dev: false, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Airborne, with a green-skill fighter on your tail. Shake it or shoot it down.' },
  { value: 'pursuit-range-veteran', label: 'Air Combat: Veteran', kind: 'range', pool: 'training', dev: false, start: 'airborne', aircraft: 'f6f-hellcat', description: 'As Air Combat, against a veteran-skill pursuer.' },
  { value: 'strike-range', label: 'Strike Range', kind: 'range', pool: 'training', dev: false, start: 'airfield', aircraft: 'f6f-hellcat', description: 'Parked at Tacloban, with a Japanese cargo ship and enemy airfield targets for bomb and rocket practice.' },
  // Plan 7e's development furball (ruling W9): a test bed, so Dev-only (A1);
  // `?scenario=` still reaches it (A2). "(dev)" stays in the label (SF-R8).
  { value: 'furball-range', label: 'Furball (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (Plan 7e): airborne with an allied wingman against four enemy fighters, so AI fights AI.' },
  // Plan 7g's recovery test bed: two allied AI go home on the 30 s idle rule (fuel is not scenario content).
  { value: 'recovery-range', label: 'Recovery (dev)', kind: 'range', pool: 'training', dev: true, start: 'airfield', aircraft: 'f6f-hellcat', description: 'Test bed (Plan 7g): parked at Tacloban while two allied AI land, one on the runway and one on the Essex.' },
  // Plan 7h's takeoff test bed: two allied AI Zeros roll off Dulag's runway while the player sits parked at Tacloban.
  { value: 'takeoff-range', label: 'Takeoff (dev)', kind: 'range', pool: 'training', dev: true, start: 'airfield', aircraft: 'f6f-hellcat', description: 'Test bed (Plan 7h): parked at Tacloban while two allied AI Zeros take off from Dulag.' },
  // Friendly-fire ruling FF-10: the discharge test bed, Dev-only like the furball.
  { value: 'friendly-fire-range', label: 'Friendly Fire (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (friendly-fire plan): airborne near an allied Hellcat, an enemy Hellcat, the Essex and a cargo ship.' },
  { value: 'damage-range', label: 'Damage Range (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (damage stages plan): 8,200 ft up behind three Zeros flying straight and level. Shoot the engine for smoke, sputter and stall; keep firing for fire, then the explosion and debris.' },
  { value: 'bomber-range', label: 'Bomber Range (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (damage stages round 2, E3): 8,200 ft up behind a formation of four bombers, a B-17 leading a B-29, a G4M and a Ki-21, on their way to bomb Tacloban. Their veteran gunners shoot back: a slow pass from dead astern takes hits, a high-side or head-on pass mostly does not (God mode makes it harmless). Each engine smokes, sputters and dies on its own; the airframe burns at its fire line.' },
  // The survivable half: a Gunnery Range run-in onto a parked allied Hellcat,
  // so a strafing pass and the landing after it end in the discharge (FF-7 as
  // amended; the parked start became a run-in when T1's tail-down attitude
  // took the guns off a parked target, 2026-09-29).
  { value: 'friendly-fire-field', label: 'Friendly Fire: Field (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (friendly-fire plan): on a run-in to Tacloban with a parked allied Hellcat on the runway.' },
  // L3 / Range Test (2026-10-10): take off from Tacloban into a target range. Every enemy airplane circles overhead as a sitting duck and every enemy ship is anchored nearby, plus a cargo ship; WHICH enemy follows the side of the airplane picked (`AXIS_VARIANTS`, `src/sim/sortie.ts`). Best flown with God mode.
  { value: 'range-test', label: 'Range Test (dev)', kind: 'range', pool: 'training', dev: true, start: 'airfield', aircraft: 'f6f-hellcat', description: 'Test bed: take off from Tacloban. Every enemy airplane circles overhead as a sitting duck and every enemy ship is anchored nearby, plus a cargo ship. Pick an American airplane for Japanese targets, a Japanese one for American. Shoot them to see damage, smoke and sinking; God mode helps.' },
  // F6A (2026-10-14): the night test bed (docs/night.md). Parked on Tacloban's runway at 21:00 with every light kind placed around it: runway pots (some unlit), threshold and harbor lights, a parachute flare and a searchlight.
  { value: 'night-range', label: 'Night Range (dev)', kind: 'range', pool: 'training', dev: true, start: 'airfield', aircraft: 'f6f-hellcat', description: 'Test bed (F6A): parked on Tacloban\'s runway at 21:00. Runway flare pots (the first four on the west row unlit), threshold lights, a red harbor light, a parachute flare and a searchlight.' },
  // F6A Task 11: the night budget benches (tests/e2e/nightBudget.spec.ts): a lit field and a bay at night.
  { value: 'night-field', label: 'Night Field (dev)', kind: 'range', pool: 'training', dev: true, start: 'airfield', aircraft: 'f6f-hellcat', description: 'Test bed (F6A budget): parked on a Tacloban runway at 18:30 with 30 flare pots and two searchlight beams.' },
  { value: 'night-bay', label: 'Night Bay (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (F6A budget): airborne at 21:00 over a bay with five ships, harbor lights and a parachute flare.' },
  // M2 (2026-10-10): the AA test bed. Airborne, 3 km from an anchored destroyer that shoots (a Fletcher flagged axis, so its AA is the calibrated one) with Tacloban's AAA battery 2 km beyond, also hostile. Best flown with God mode for a look, without it to feel the lethality.
  { value: 'aa-range', label: 'AA Range (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (M2): 2,000 ft up, 2 miles from an anchored destroyer and a ground AAA battery that both shoot at you. Heavy guns throw flak bursts; light guns fire tracers. Fly low and slow to feel it; God mode to just watch.' },
  // M4 (2026-10-10): the main-battery test bed, main batteries on (`mainBatteries`). Airborne at 2,000 ft over San Pedro Bay heading north, 2.5 miles south of a Fletcher steaming against a Kagero 5 miles beyond her, each ordered onto the other; a Cleveland anchored off Tacloban shells the hostile AAA battery there, then joins in.
  { value: 'gunnery-duel', label: 'Gunnery Duel (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (M4): 2,000 ft up over San Pedro Bay, heading north. Ahead, an American and a Japanese destroyer fight it out with their main guns 5 miles apart, and a cruiser off Tacloban shells the AAA battery there, then turns on the Japanese destroyer. Watch the muzzle smoke, the splashes walk onto the target and the hits; God mode to just watch.' },
  // E2 (2026-10-10): the attack AI test bed. Airborne and clear of the raids, west of an anchored allied destroyer and Tacloban's strip. Axis raiders attack both: three Vals dive-bomb the destroyer (two veterans and a green pilot), three Kates run torpedoes at it (the same), a Sally level-bombs the strip. Both targets shoot back (M2). Best flown with God mode.
  { value: 'attack-range', label: 'Attack Range (dev)', kind: 'range', pool: 'training', dev: true, start: 'airborne', aircraft: 'f6f-hellcat', description: 'Test bed (E2): 6,000 ft up, 4 miles west of an anchored American destroyer and Tacloban\'s strip. Japanese raiders attack both: three Vals dive-bomb the destroyer, three Kates run torpedoes at it, a Sally bombs the strip from 10,000 ft. The destroyer and the strip\'s guns shoot back. God mode to just watch.' },
  // M3's missions. The picker shows missions first whatever their place here.
  // "Carrier Qualification", not "Deck Quals": e2e selectors match labels by
  // substring, and the range above keeps that name (M3-R5).
  // B4 (2026-10-10): first among the missions, for a new player. "Basic Flying" is a substring of no other label.
  { value: 'tutorial', label: 'Basic Flying', kind: 'mission', pool: 'training', badge: { id: 'basic-flying', name: 'Basic Flying' }, dev: false, start: 'airfield', aircraft: 'f6f-hellcat', recommendedLoadout: 'bombs' },
  { value: 'torpedo-qualification', label: 'Torpedo Qualification', kind: 'mission', pool: 'training', badge: { id: 'torpedo-qualified', name: 'Torpedo Qualified' }, dev: false, start: 'airfield', aircraft: 'tbm-3-avenger', recommendedLoadout: 'bombs' },
  { value: 'deck-quals-mission', label: 'Carrier Qualification', kind: 'mission', pool: 'training', badge: { id: 'carrier-qualified', name: 'Carrier Qualified' }, dev: false, start: 'carrier', aircraft: 'f6f-hellcat', recommendedLoadout: 'clean' },
  { value: 'airfield-strike', label: 'Airfield Strike', kind: 'mission', pool: 'noncampaign', badge: { id: 'airfield-strike', name: 'Airfield Strike' }, dev: false, start: 'airfield', aircraft: 'f6f-hellcat', recommendedLoadout: 'both' },
  { value: 'convoy-strike', label: 'Convoy Strike', kind: 'mission', pool: 'noncampaign', badge: { id: 'convoy-strike', name: 'Convoy Strike' }, dev: false, start: 'airborne', aircraft: 'f6f-hellcat', recommendedLoadout: 'both' },
  { value: 'tank-buster', label: 'Tank Buster', kind: 'mission', pool: 'noncampaign', badge: { id: 'tank-buster', name: 'Tank Buster' }, dev: false, start: 'airborne', aircraft: 'f6f-hellcat', recommendedLoadout: 'both' },
  // M4. "Air Combat" above is not a substring of this label, so e2e's
  // substring selectors still find one row each.
  { value: 'combat-air-patrol', label: 'Combat Air Patrol', kind: 'mission', pool: 'noncampaign', badge: { id: 'combat-air-patrol', name: 'Combat Air Patrol' }, dev: false, start: 'airborne', aircraft: 'f6f-hellcat', recommendedLoadout: 'clean' },
  // F2 (2026-10-09). Neither label is a substring of another row's.
  { value: 'scramble', label: 'Scramble', kind: 'mission', pool: 'noncampaign', badge: { id: 'scramble', name: 'Scramble' }, dev: false, start: 'airfield', aircraft: 'f6f-hellcat', recommendedLoadout: 'clean' },
  { value: 'single-combat', label: 'Single Combat', kind: 'mission', pool: 'noncampaign', badge: { id: 'single-combat', name: 'Single Combat' }, dev: false, start: 'airborne', aircraft: 'f6f-hellcat', recommendedLoadout: 'clean' },
  // Track F (2026-10-10): the first shipped mission to use E2 torpedo-attack pilots and the Japanese carrier.
  { value: 'flattop-hunt', label: 'Flattop Hunt', kind: 'mission', pool: 'noncampaign', badge: { id: 'flattop-hunt', name: 'Flattop Hunt' }, dev: false, start: 'airborne', aircraft: 'tbm-3-avenger', recommendedLoadout: 'bombs' },
  // Track F (2026-10-10): escort four E3 B-17s to Dulag's hangars against Zeros. "Escort" is a substring of no other label.
  { value: 'escort', label: 'Escort', kind: 'mission', pool: 'noncampaign', badge: { id: 'escort', name: 'Escort' }, dev: false, start: 'airborne', aircraft: 'f6f-hellcat', recommendedLoadout: 'clean' },
  // Track F (2026-10-11): dawn pursuit south through Surigao Strait while the battle line finishes the rear guard.
  { value: 'surigao-strait', label: 'Surigao Strait', kind: 'mission', pool: 'noncampaign', badge: { id: 'surigao-strait', name: 'Surigao Strait' }, dev: false, start: 'airborne', aircraft: 'f6f-hellcat', recommendedLoadout: 'both' },
  // F5A Task 9 (2026-10-14, ruling D3): the first mission with a Japanese player, so a Japanese campaign always has an entry-rank non-campaign lifeline.
  { value: 'field-patrol', label: 'Field Patrol', kind: 'mission', pool: 'noncampaign', badge: { id: 'field-patrol', name: 'Field Patrol' }, dev: false, start: 'airborne', aircraft: 'a6m2-zero', recommendedLoadout: 'clean' },
  // M2's two fixture missions, Dev-only like every test bed (A1).
  { value: 'dev-mission-ui', label: 'UI Fixture (dev)', kind: 'mission', pool: 'single', badge: { id: 'dev-ui-wings', name: 'UI Fixture Wings (dev)' }, dev: true, start: 'airfield', aircraft: 'f6f-hellcat', recommendedLoadout: 'clean' },
  { value: 'dev-mission-circuit', label: 'Circuit Fixture (dev)', kind: 'mission', pool: 'single', badge: { id: 'dev-circuit-wings', name: 'Circuit Fixture Wings (dev)' }, dev: true, start: 'airfield', aircraft: 'f6f-hellcat', recommendedLoadout: 'clean' },
]

/** The picker's rows: every row with Dev, the non-dev rows without (A1). */
export function scenarioOptions(dev: boolean): readonly ScenarioOption[] {
  return dev ? SCENARIO_OPTIONS : SCENARIO_OPTIONS.filter((o) => !o.dev)
}
/** Whether `id` is a scenario this build ships -- the `?scenario=` whitelist.
 *  Dev-only scenarios included (A2): a link may reach a test bed. */
export function isKnownScenarioId(id: string): boolean {
  return SCENARIO_OPTIONS.some((option) => option.value === id)
}

/** A badge id's display name (M2 R4: the roster stores ids), falling back to
 *  the raw id for a badge whose mission this build no longer ships. */
export function badgeName(id: string): string {
  return SCENARIO_OPTIONS.find((o) => o.badge?.id === id)?.badge?.name ?? id
}

/** A scenario id's player-facing label (dossier spec §B.4's Mission Log
 *  column), falling back to the raw id for one this build no longer ships
 *  (an old log entry referencing a retired scenario). Searches the Dev-only
 *  rows too, so a fixture's log row reads its label. */
const scenarioLabel = (id: string): string => SCENARIO_OPTIONS.find((o) => o.value === id)?.label ?? id

/** What the sortie forms offer, and how Form 3 fetches a mission's briefing.
 *  `flyable` is Form 5's catalog and `ordnanceNames` Form 6's store names
 *  (sortie spec); `loadScenario: null` fetches nothing (no briefing panel). */
export type TitleMissions = {
  readonly options: readonly ScenarioOption[]
  readonly flyable: readonly FlyableAircraft[]
  readonly ordnanceNames: Readonly<Record<string, string>>
  readonly loadScenario: ((id: string) => Promise<Scenario>) | null
}

/** `createTitleScreen`'s default: the production rows, no briefing fetch --
 *  exactly the picker as it was before M2. */
export const PRODUCTION_MISSIONS: TitleMissions = { options: SCENARIO_OPTIONS, flyable: [], ordnanceNames: {}, loadScenario: null }

/**
 * The text on each pilot's entry in the roster list (design §3: "a list...
 * plus a 'New pilot' entry"), so the Node suite can pin what a pilot button
 * says without a DOM -- same split as `LOADOUT_OPTIONS`/`SCENARIO_OPTIONS`
 * above, whose `label` this mirrors.
 */
export function pilotButtonLabel(pilot: PilotRecord): string {
  // Whole-branch review M-1: a `kia` pilot was visually identical to an
  // `active` one in this list -- nothing distinguished a dead pilot a New
  // Game would resurrect (design §2) from one still flying. Appended, not a
  // separate figure, matching this label's existing terse "name — rank —
  // score" shape.
  const status = STATUS_SUFFIX[pilot.status]
  return `${pilot.name} — ${pilot.rank.abbrev} — ${pilot.cumulativeScore}${status}`
}

const STATUS_SUFFIX: Readonly<Record<PilotStatus, string>> = { active: '', kia: ' — KIA', discharged: ' — DISCHARGED' }

/** The roster table's status chip: its text and its stamp color. A discharge
 *  (friendly-fire spec §6) is stamped red, like a death. */
export function pilotStatusChip(status: PilotStatus): { readonly text: string; readonly color: '--stamp-red' | '--stamp-black' } {
  if (status === 'kia') return { text: 'K.I.A.', color: '--stamp-red' }
  if (status === 'discharged') return { text: 'DISCHARGED', color: '--stamp-red' }
  return { text: 'Active', color: '--stamp-black' }
}

/**
 * The header shown once a pilot is selected, above the scenario/loadout
 * pickers it reveals (design §3: "now labeled with that pilot's name and
 * rank").
 */
export function selectedPilotLabel(pilot: PilotRecord): string {
  return `Flying as ${pilot.name} (${pilot.rank.name})`
}

/** The pilot as named in Form 2's routing block: rank abbreviation, then name. */
export function sortiePilotLabel(pilot: PilotRecord): string {
  return `${pilot.rank.abbrev} ${pilot.name}`
}

/**
 * Whether `name` is acceptable to pass to `createPilot` (roster.ts) -- the
 * same non-empty-after-trim rule `createPilot` itself enforces, duplicated
 * here so the DOM layer can reject an empty/whitespace name inline rather
 * than calling `createPilot` and letting its throw reach the DOM uncaught.
 */
export function isValidPilotName(name: string): boolean {
  return name.trim().length > 0
}

export type TitleScreenHandle = {
  /** Whether the title is still on screen; `main.ts` holds the world while it is. */
  readonly up: () => boolean
  /**
   * The Settings dialog's model (`settings.ts`) -- the read/write surface
   * `main.ts` needs and the one thing here that OUTLIVES `hide()`/`show()`,
   * since the dialog's DOM is rebuilt with the rest of the overlay but the
   * player's choices are session state, not screen state.
   *
   * `main.ts` (Task 6) reads `snapshot()` at boot for the tiers, the asset
   * tier and `arcadeDamage`, pushes the GPU probe's result back in with
   * `setRecommendedTier`/`setCurrentQuality`, and checks `explicitChoiceMade`
   * before letting that probe overwrite anything. It gets the live change
   * callbacks from `src/render/bootQuality.ts`'s `createBootQuality()`, which
   * owns the one model of the page and the `SettingsCallbacks` that apply a
   * pick live, and hands it here as `createTitleScreen`'s fourth argument.
   * The default model built below still persists every pick; it just has
   * nobody listening to apply it until the next page load.
   */
  readonly settings: SettingsModel
  hide(): void
  /** Rebuilds the overlay fresh and re-reads `loadRoster()`; see the file's
   *  own top comment for why. `main.ts` calls this when a flight ends and
   *  the player is sent back to the title rather than straight to a new one.
   *
   *  `currentScenarioId` is what the scenario radiogroup preselects (Plan 9
   *  Task 7 bugfix). It is a PARAMETER here, not the constructor's own
   *  `currentScenarioId` closed over once, because `main.ts`'s
   *  `loadScenario` can swap scenarios in place after this title screen was
   *  first built -- a return-to-title flight following an in-session switch
   *  must show what is ACTUALLY loaded right now, which only `main.ts` still
   *  knows by the time `show()` is called; the constructor's own value is
   *  stale the instant a switch happens. `main.ts` passes its own live
   *  tracking variable (`requestedScenarioId`) on every call. */
  show(currentScenarioId: string): void
}

// The roster step's own tokens (Task 7 restyle, naval-comms spec §3) --
// design-system colors/fonts via the `var(--...)` custom properties
// `naval-comms.css` declares on `:root` (available anywhere in the document,
// not just under `.naval-comms`).
const FLYING_AS_STYLE =
  'margin:14px 0 4px;min-height:1.4em;color:var(--ink-faint);font:12px var(--font-body);letter-spacing:.04em'
const NEW_PILOT_ERROR_STYLE =
  'display:none;margin:8px 0 0;color:var(--stamp-red);font:12px var(--font-body);letter-spacing:.02em'
// A native `<button>` reset to read as plain table-cell text while staying a
// real, clickable, keyboard-reachable control -- same "native control, not a
// styled div" convention the rest of this file follows (see the roster
// section's own comment below).
const ROW_SELECT_BUTTON_STYLE =
  'all:unset;display:block;width:100%;cursor:pointer;font:inherit;color:inherit;padding:2px 0'
// The stripe runs on the compositor (a `transform` animation), so it keeps
// moving while the main thread is blocked by a shader build -- the whole
// reason for it (loading spec §A.2). The fill width only changes between
// stages, when the thread is free to paint.
const BOOT_STRIP_CSS = `
[data-ww2-boot]{position:relative;height:6px;margin:10px 0 4px;background:rgba(0,0,0,.12);overflow:hidden}
[data-ww2-boot] .fill{position:absolute;inset:0 auto 0 0;background:var(--ink-faint);transition:width .25s}
[data-ww2-boot] .stripe{position:absolute;inset:0;width:40%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:ww2-boot-stripe 1.1s linear infinite;will-change:transform}
@keyframes ww2-boot-stripe{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
[data-ww2-boot]{background:rgba(0,0,0,.45);box-shadow:0 0 0 1px rgba(233,223,194,.35)}
[data-ww2-boot] .fill{background:var(--paper)}
.ww2-boot-slide-in{animation:ww2-boot-slide-in .45s ease-out both}
@keyframes ww2-boot-slide-in{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
`
/** The boot strip on the bare title art: paper-colored, shadowed so it reads on
 *  any part of the picture, at the overlay's foot (A1). */
const BOOT_FOOT_STYLE =
  'position:absolute;left:50%;bottom:6vh;transform:translateX(-50%);width:min(560px,86vw);pointer-events:none;' +
  'color:var(--paper);text-shadow:0 1px 3px rgba(0,0,0,.9)'

export function createTitleScreen(
  root: HTMLElement,
  /** Whichever scenario `main.ts` already resolved this boot with (`?scenario=`
   *  or the production default) -- what the FIRST build of the picker
   *  preselects. Reassigned by `show()` below on every later call (Plan 9
   *  Task 7 bugfix), since an in-session scenario switch can leave this
   *  initial value stale before a return-to-title ever shows the picker
   *  again -- see `TitleScreenHandle.show`'s own doc comment. */
  currentScenarioId: string,
  /** One sortie (sortie spec, Wiring). `pilotId` is null only for a quick launch (A6). */
  onNewGame: (choice: SortieChoice, pilotId: string | null) => void,
  /** The Settings dialog's model. Optional so this file owns a working
   *  dialog on its own: with nothing passed, every pick still persists, it
   *  simply takes effect on the next page load rather than live. `main.ts`
   *  (Task 6) passes `createBootQuality().settings` (`bootQuality.ts`) so a
   *  tier click reaches the live cascades/clouds/vegetation -- see
   *  `TitleScreenHandle.settings`. `tests/render/bootQuality.test.ts` pins
   *  that this argument is actually passed, because omitting it is invisible
   *  on screen: the dialog looks and persists exactly the same. */
  settings: SettingsModel = createSettingsModel(),
  /** The boot sequence's progress (loading spec §A.2). Until `ready`, every
   *  control that starts or configures a flight is disabled and the strip is
   *  shown; the Dossier is not locked (read-only). Defaults to already-ready
   *  so a title built without it behaves exactly as before. */
  boot: BootProgress = readyBootProgress(),
  /** The picker's rows and the briefing loader (M2 Task 6). `main.ts` passes
   *  `scenarioOptions(import.meta.env.DEV)` and `loadScenarioFile`. */
  missions: TitleMissions = PRODUCTION_MISSIONS,
  /** SF-R6: `?recordDevSorties` in a DEV build, so a Dev sortie's launch-time
   *  write happens too; `main.ts` passes it. */
  recordDevSorties = false,
): TitleScreenHandle {
  const m = titleModel()

  // The Dev checkbox (sortie spec): session state, so it lives out here with
  // `settings`, not in `build()` -- it survives return-to-title and resets on
  // a page load. A `?scenario=` naming a Dev-only row checks it (A2).
  let dev = missions.options.find((o) => o.value === currentScenarioId)?.dev === true
  // God mode: session state like Dev, and only ever true while Dev is.
  let god = false

  let isUp = false
  let onKey: ((e: KeyboardEvent) => void) | null = null
  let unsubscribeBoot: (() => void) | null = null
  let unsubscribeGraphicsSummary: (() => void) | null = null
  // Rebuilt with the overlay on every `build()`; the MODEL above is not,
  // which is what makes a choice survive a return-to-title.
  let settingsDialog: SettingsDialogHandle | null = null
  // The open Dossier's `destroy()`, if one is up (fix round 1, IMPORTANT 1)
  // -- same reason `settingsDialog` is tracked here: it owns a `window`
  // keydown listener `hide()` must tear down, or it outlives the overlay
  // that held it and keeps swallowing Escape/Enter for the rest of the
  // session.
  let openDossierClose: (() => void) | null = null

  const hide = (): void => {
    if (!isUp) return
    isUp = false
    // Before the overlay node goes: the dialog also owns a `window` keydown
    // listener for Esc, and one leaked per return-to-title would accumulate.
    // Closed first so a dialog left open when a flight starts is not still
    // open on the overlay the next `show()` builds.
    settings.close()
    settingsDialog?.destroy()
    settingsDialog = null
    // Same leak, same fix, for the Dossier -- `destroy()` (not a plain
    // close) so it does NOT try to refocus the row button this overlay is
    // about to remove.
    openDossierClose?.()
    openDossierClose = null
    root.querySelector('[data-ww2-title]')?.remove()
    if (onKey) window.removeEventListener('keydown', onKey)
    onKey = null
    unsubscribeBoot?.()
    unsubscribeBoot = null
    unsubscribeGraphicsSummary?.()
    unsubscribeGraphicsSummary = null
  }

  // Rebuilds the whole overlay from nothing -- both the initial build below
  // and `show()` (TitleScreenHandle) run this same path, so there is exactly
  // one place the DOM gets constructed rather than an initial build and a
  // second, easily-diverging copy for the return trip. Always lands on
  // Form 1, so a return-to-title starts from the roster with the selection
  // cleared, as it always has.
  const build = (): void => {
    hide()
    // Only the forms scroll (`stage`); the overlay itself does not, so the
    // About and Settings dialogs (`position:absolute;inset:0`) always cover
    // the whole viewport and the administrative memo stays on screen.
    const overlay = document.createElement('div')
    overlay.dataset.ww2Title = ''
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Title')
    overlay.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;overflow:hidden;' +
      `background:#0b0d10 url(${TITLE_ART_URL}) center/cover no-repeat;z-index:20`

    // `ensureStampFilter()` runs before anything below can render the
    // corner "Confidential" `.stamp` -- see that function's own doc comment
    // (navalComms.ts): without the filter element Chromium silently paints an
    // unroughened stamp. Idempotent, so calling it again here is safe even
    // though `settings.ts`'s dialog also calls it.
    ensureStampFilter()
    const pilots: PilotRecord[] = [...loadRoster()]
    let selectedPilotId: string | null = null
    let hasStartedFlow = false
    const pilotRows = new Map<string, { row: HTMLTableRowElement; selectButton: HTMLButtonElement; sortieButton: HTMLButtonElement }>()

    // The forms sit in a scroll region whose first child's `margin-top:
    // auto` bottom-aligns them over the art when they are short (what
    // `justify-content:flex-end` did before) while staying scrollable from
    // the top when they are not -- `flex-end` would clip the top unreachably.
    const stage = document.createElement('div')
    stage.style.cssText =
      'flex:1 1 auto;min-height:0;width:100%;overflow-y:auto;display:flex;flex-direction:column;' +
      'align-items:center;padding-top:16px'
    overlay.appendChild(stage)

    // ============ Form 1 of 6: the roster (design §3) ============
    // Every pilot `loadRoster()` returns, plus a "New pilot" entry -- read
    // fresh on every `build()` call so a score just banked by the debrief
    // that preceded this `show()` is what the roster shows. Native `<button>`
    // per selectable row: free keyboard support.
    const roster = memoPanel()
    roster.panel.style.marginTop = 'auto'
    const rosterSheet = roster.sheet

    const confidentialStamp = document.createElement('div')
    confidentialStamp.className = 'stamp stamp--violet stamp--sm stamp--rotate-2 stamp-corner'
    confidentialStamp.textContent = 'Confidential'
    rosterSheet.appendChild(confidentialStamp)
    rosterSheet.appendChild(letterhead(TITLE_FORMS.roster.kicker, TITLE_FORMS.roster.title, TITLE_FORMS.roster.number))

    // The pilot list itself, scrolled independently of the letterhead/enlist
    // form around it -- confined to the table body so the form below stays
    // reachable without scrolling past every pilot.
    const tableScroll = document.createElement('div')
    tableScroll.style.cssText = 'max-height:32vh;overflow-y:auto'
    const table = document.createElement('table')
    table.className = 'form-table'
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    for (const label of ['Name', 'Rank', 'Score', 'Sorties', 'Kills', 'Status', '']) {
      const th = document.createElement('th')
      th.textContent = label
      headRow.appendChild(th)
    }
    thead.appendChild(headRow)
    const tbody = document.createElement('tbody')
    table.append(thead, tbody)
    tableScroll.appendChild(table)
    rosterSheet.appendChild(tableScroll)

    const bootWrap = document.createElement('div')
    const bootStyle = document.createElement('style')
    bootStyle.textContent = BOOT_STRIP_CSS
    const bootBar = document.createElement('div')
    bootBar.dataset.ww2Boot = ''
    bootBar.setAttribute('role', 'progressbar')
    bootBar.setAttribute('aria-valuemin', '0')
    bootBar.setAttribute('aria-valuemax', '100')
    const bootFill = document.createElement('div')
    bootFill.className = 'fill'
    const bootStripe = document.createElement('div')
    bootStripe.className = 'stripe'
    bootBar.append(bootFill, bootStripe)
    const bootLabel = document.createElement('p')
    bootLabel.style.cssText = FLYING_AS_STYLE + ';color:inherit'
    bootLabel.setAttribute('aria-live', 'polite')
    bootWrap.append(bootStyle, bootBar, bootLabel)
    // Loading spec §A.2 / MASTER_PLAN A1: the strip sits at the foot of the
    // overlay, on the art itself, not inside a memo -- appended last, below.
    bootWrap.style.cssText = BOOT_FOOT_STYLE

    const flyingAs = document.createElement('p')
    flyingAs.style.cssText = FLYING_AS_STYLE
    rosterSheet.appendChild(flyingAs)

    stage.appendChild(roster.panel)

    // ============ Forms 2-4: sortie orders, aircraft, ordnance (sortie spec) ============
    // One draft, drawn by three forms and reset by the pure rules in
    // sortieFlow.ts (A3; SF-R4, SF-R5). Each form is a `.ballot-option`
    // radiogroup on the left -- `role="radio"` + `aria-checked` is what the
    // e2e specs key on -- and the description of the selected row on the right.
    const ctx = (): FlowContext => ({ options: missions.options, flyable: missions.flyable, dev })
    const optionOf = (id: string): ScenarioOption | undefined => missions.options.find((o) => o.value === id)
    // With no catalog (the constructor's default; main.ts always passes one)
    // nothing can be resolved, so Form 3 says so and Next stays off.
    const flowReady = missions.flyable.length > 0
    let draft: SortieDraft = flowReady
      ? reconcile(ctx(), initialDraft(ctx(), optionOf(currentScenarioId) === undefined ? SCENARIO_ID : currentScenarioId), SCENARIO_ID)
      : { scenarioId: currentScenarioId, aircraftSpec: optionOf(currentScenarioId)?.aircraft ?? '', loadout: DEFAULT_LOADOUT }
    type FlightType = ScenarioOption['kind']
    let flightType: FlightType = optionOf(draft.scenarioId)?.kind ?? 'mission'

    const markGroup = <T>(options: Map<T, HTMLDivElement>, selected: T): void => {
      for (const [value, el] of options) el.setAttribute('aria-checked', String(value === selected))
    }
    const enable = (b: HTMLButtonElement, on: boolean): void => {
      b.disabled = !on
      b.style.opacity = on ? '' : '.45'
    }

    const routingPilots: HTMLElement[] = []
    const sortieForm = (f: { readonly kicker: string; readonly title: string; readonly number: string }) => {
      const memo = memoPanel()
      memo.panel.style.display = 'none'
      memo.panel.style.marginTop = 'auto'
      memo.sheet.appendChild(letterhead(f.kicker, f.title, f.number))
      const routing = document.createElement('dl')
      routing.className = 'routing'
      const routingTerm = document.createElement('dt')
      routingTerm.textContent = 'Pilot'
      const routingPilot = document.createElement('dd')
      routingPilots.push(routingPilot)
      const routingRow = document.createElement('div')
      routingRow.append(routingTerm, routingPilot)
      routing.appendChild(routingRow)
      memo.sheet.appendChild(routing)
      const topNavigation = document.createElement('div')
      topNavigation.style.cssText = 'display:flex;justify-content:flex-end;margin:0 0 10px'
      memo.sheet.appendChild(topNavigation)
      // Side by side when the sheet is wide, stacked when it is not.
      const columns = document.createElement('div')
      columns.style.cssText =
        'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:0 28px'
      const left = document.createElement('div')
      const right = document.createElement('div')
      columns.append(left, right)
      memo.sheet.appendChild(columns)
      stage.appendChild(memo.panel)
      return { panel: memo.panel, sheet: memo.sheet, left, right, topNavigation }
    }
    const paragraph = (text: string): HTMLParagraphElement => {
      const p = document.createElement('p')
      p.style.cssText = 'margin:0 0 10px;font-size:13px;line-height:1.55'
      p.textContent = text
      return p
    }

    // ---- Form 2: choose missions or the Training Grounds before the long
    // sortie list. Missions lead, and the qualification sequence is called
    // out explicitly for a new pilot.
    const typeForm = sortieForm(TITLE_FORMS.type)
    const typeGroup = radioGroup('Flight type')
    typeForm.left.append(sectionTitle('Choose a flight type'), typeGroup)
    const typeDescription = document.createElement('div')
    typeForm.right.append(sectionTitle('Recommendation'), typeDescription)
    const typeRows = new Map<FlightType, HTMLDivElement>()
    const renderFlightType = (): void => {
      typeGroup.replaceChildren()
      typeRows.clear()
      const choices: readonly { value: FlightType; label: string; description: string }[] = [
        { value: 'mission', label: 'Missions', description: NEW_PILOT_GUIDANCE },
        { value: 'range', label: 'Training Grounds', description: 'Free flight and focused practice ranges with no campaign obligations.' },
      ]
      for (const choice of choices) {
        const el = ballotOption(choice.label, '', () => {
          flightType = choice.value
          const current = optionOf(draft.scenarioId)
          if (current?.kind !== flightType) {
            const first = visibleScenarios(ctx()).find((o) => o.kind === flightType)
            if (first !== undefined) draft = flowReady ? withScenario(ctx(), first.value) : { ...draft, scenarioId: first.value }
          }
          renderFlightType()
        })
        typeRows.set(choice.value, el)
        typeGroup.appendChild(el)
      }
      markGroup(typeRows, flightType)
      const message = choices.find((choice) => choice.value === flightType)!.description
      typeDescription.replaceChildren(paragraph(message))
    }
    const typeBack = inkButton(m.back)
    const typeNext = inkButton(m.next, true)
    typeForm.sheet.appendChild(buttonRow(typeBack, typeNext))

    // ---- Form 3: the mission or range; its briefing or description on the right.
    const orders = sortieForm(TITLE_FORMS.orders)
    const scenarioGroup = radioGroup('Scenario')
    const scenarioHeading = document.createElement('div')
    orders.left.append(scenarioHeading, scenarioGroup)
    const descriptionHost = document.createElement('div')
    // The briefing (M2 Task 6); hidden for a range, which has its description instead.
    const briefingHost = document.createElement('div')
    briefingHost.style.display = 'none'
    orders.right.append(sectionTitle('Description'), descriptionHost, briefingHost)
    const request = missions.loadScenario === null ? null : briefingRequest(missions.loadScenario)
    // The selected pilot's badge ids, re-read from the roster each time Form
    // 2 opens (`advance`), so a badge banked this session shows.
    let heldBadges: readonly string[] = []
    const scenarioRows = new Map<string, HTMLDivElement>()
    const showBriefing = (): void => {
      const option = optionOf(draft.scenarioId)
      if (option?.kind !== 'mission' || request === null) {
        briefingHost.style.display = 'none'
        briefingHost.replaceChildren()
        return
      }
      const id = option.value
      briefingHost.style.display = ''
      renderBriefing(briefingHost, 'loading')
      // `request` is latest-wins across missions; the id check also drops a
      // result that lands after the player moved on to a RANGE.
      request(id, (s) => {
        if (draft.scenarioId === id) renderBriefing(briefingHost, briefingModel(s, heldBadges))
      }, () => {
        if (draft.scenarioId === id) renderBriefing(briefingHost, 'unavailable')
      })
    }
    const showDescription = (): void => {
      const option = optionOf(draft.scenarioId)
      descriptionHost.replaceChildren(...(option?.kind === 'range' && option.description !== undefined ? [paragraph(option.description)] : []))
      showBriefing()
    }
    // ---- Form 4: weather and time, split out from Sortie Orders so the long
    // scenario list stays focused and the conditions are a deliberate step.
    const conditions = sortieForm(TITLE_FORMS.conditions)
    conditions.right.append(
      sectionTitle('Forecast'),
      paragraph('Choose the takeoff period and expected cloud cover for this sortie.'),
    )

    // A3: Morning, Midday or Dusk (Mark, 2026-10-09), each hour from the sun
    // model (`takeoffHours`). The one nearest the scenario's historical hour
    // (its weather's `timeOfDay`, from the same scenario file the briefing
    // reads) is preselected and marked suggested; a scenario change resets it,
    // as it resets the aircraft. Null until that file arrives: the scenario's
    // own hour then flies.
    const takeoff = takeoffHours(TACLOBAN_LAT_DEG)
    const hhmm = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
    const TAKEOFF_LABELS: Readonly<Record<TakeoffTime, string>> = { morning: 'Morning', midday: 'Midday', dusk: 'Dusk' }
    const takeoffGroup = radioGroup('Takeoff time')
    let takeoffTime: TakeoffTime | DevTakeoffTime | null = null
    const DEV_TAKEOFF_LABELS: Readonly<Record<DevTakeoffTime, string>> = { 'late-dusk': 'Late dusk (dev)', night: 'Night (dev)' }
    const hourFor = (t: TakeoffTime | DevTakeoffTime): number => (t in DEV_TAKEOFF_HOURS ? DEV_TAKEOFF_HOURS[t as DevTakeoffTime] : takeoff[t as TakeoffTime])
    let suggestedTime: TakeoffTime | null = null
    let hourScenario: string | null = null
    const hourRequest = missions.loadScenario === null ? null : briefingRequest(missions.loadScenario)
    const renderTakeoff = (): void => {
      takeoffGroup.replaceChildren()
      const rows = new Map<TakeoffTime, HTMLDivElement>()
      const devRows = new Map<DevTakeoffTime, HTMLDivElement>()
      for (const t of Object.keys(takeoff) as TakeoffTime[]) {
        const label = `${TAKEOFF_LABELS[t]} (${hhmm(takeoff[t])}${t === suggestedTime ? ', suggested' : ''})`
        const el = ballotOption(label, '', () => { takeoffTime = t; renderTakeoff() })
        rows.set(t, el)
        takeoffGroup.appendChild(el)
      }
      // Night choices (F6A Task 9) are a Dev tool until F5 gates them by rank.
      if (dev) {
        for (const t of Object.keys(DEV_TAKEOFF_HOURS) as DevTakeoffTime[]) {
          const el = ballotOption(`${DEV_TAKEOFF_LABELS[t]} (${hhmm(DEV_TAKEOFF_HOURS[t])})`, '', () => { takeoffTime = t; renderTakeoff() })
          takeoffGroup.appendChild(el)
          devRows.set(t, el)
        }
      }
      markGroup(rows, takeoffTime !== null && takeoffTime in DEV_TAKEOFF_HOURS ? null : (takeoffTime as TakeoffTime | null))
      for (const [t, el] of devRows) el.setAttribute('aria-checked', String(t === takeoffTime))
    }
    const suggestHour = (): void => {
      if (hourRequest === null || hourScenario === draft.scenarioId) return
      const id = draft.scenarioId
      hourScenario = id
      hourRequest(id, (sc) => {
        if (draft.scenarioId !== id) return
        suggestedTime = nearestTakeoffTime(sc.weather.timeOfDay ?? DEFAULT_TIME_OF_DAY, takeoff)
        takeoffTime = suggestedTime
        renderTakeoff()
      }, () => { if (draft.scenarioId === id) hourScenario = null })
    }
    if (hourRequest !== null) {
      renderTakeoff()
      conditions.left.append(sectionTitle('Takeoff time'), takeoffGroup)
    }
    // Each new title-screen build rolls one of the four player-facing
    // weather reports. The roll is only an initial selection: Back/Next keep
    // the player's pick for this sortie, and clicking a row replaces it.
    let cloudiness = randomCloudiness()
    const cloudinessGroup = radioGroup('Cloudiness')
    const renderCloudiness = (): void => {
      cloudinessGroup.replaceChildren()
      const rows = new Map<typeof cloudiness, HTMLDivElement>()
      for (const option of CLOUDINESS_OPTIONS) {
        const el = ballotOption(option.label, '', () => { cloudiness = option.value; renderCloudiness() })
        rows.set(option.value, el)
        cloudinessGroup.appendChild(el)
      }
      markGroup(rows, cloudiness)
    }
    renderCloudiness()
    conditions.left.append(sectionTitle('Cloudiness'), cloudinessGroup)
    const selectScenario = (id: string): void => {
      draft = flowReady ? withScenario(ctx(), id) : { ...draft, scenarioId: id }
      markGroup(scenarioRows, draft.scenarioId)
      showDescription()
      suggestHour()
    }
    // Each mission row shows its ribbon, faded until the selected pilot holds
    // the badge, and then AWARDED beside it (PF4).
    const refreshAwarded = (): void => {
      for (const option of visibleScenarios(ctx())) {
        const row = option.badge === undefined ? undefined : scenarioRows.get(option.value)
        if (option.badge === undefined || row === undefined) continue
        const held = heldBadges.includes(option.badge.id)
        const ribbon = ribbonElement(option.badge.id, option.badge.name, 14)
        ribbon.style.cssText += `;margin-left:auto;opacity:${held ? 1 : 0.3}`
        row.appendChild(ribbon)
        if (held) row.appendChild(awardedStamp())
      }
    }
    // Form 2 has already separated missions from ranges. Rebuilt on each
    // entry because the Dev checkbox changes which rows exist (A1).
    const renderScenarios = (): void => {
      scenarioGroup.replaceChildren()
      scenarioRows.clear()
      scenarioHeading.replaceChildren(sectionTitle(flightType === 'mission' ? 'Mission' : 'Training Ground'))
      const rows = visibleScenarios(ctx()).filter((o) => o.kind === flightType)
      for (const option of rows) {
        const el = ballotOption(option.label, '', () => selectScenario(option.value))
        scenarioRows.set(option.value, el)
        scenarioGroup.appendChild(el)
      }
      markGroup(scenarioRows, draft.scenarioId)
      refreshAwarded()
      showDescription()
      suggestHour()
    }
    const ordersBack = inkButton(m.back)
    const ordersNext = inkButton(m.next, true)
    // The scenario list is long. Keep navigation at the top-right so it is
    // always available without scrolling to the foot of the memo.
    orders.topNavigation.appendChild(buttonRow(ordersBack, ordersNext))

    const conditionsBack = inkButton(m.back)
    const conditionsNext = inkButton(m.next, true)
    conditions.sheet.appendChild(buttonRow(conditionsBack, conditionsNext))

    // ---- Form 5: the aircraft; its Library card and Hangar figures on the right.
    const aircraftForm = sortieForm(TITLE_FORMS.aircraft)
    const aircraftGroup = radioGroup('Aircraft')
    aircraftForm.left.append(sectionTitle('Aircraft'), aircraftGroup)
    const aircraftCard = document.createElement('div')
    aircraftForm.right.append(sectionTitle('Particulars'), aircraftCard)
    const aircraftBack = inkButton(m.back)
    const aircraftNext = inkButton(m.next, true)
    aircraftForm.sheet.appendChild(buttonRow(aircraftBack, aircraftNext))
    const figuresTable = (f: FlyableAircraft): HTMLTableElement => {
      const table = document.createElement('table')
      table.className = 'form-table'
      const body = document.createElement('tbody')
      for (const fig of f.figures) {
        const row = document.createElement('tr')
        const label = document.createElement('td')
        label.textContent = fig.label
        const value = document.createElement('td')
        value.textContent = fig.value
        const note = document.createElement('td')
        note.style.color = 'var(--ink-faint)'
        note.textContent = fig.note ?? ''
        row.append(label, value, note)
        body.appendChild(row)
      }
      table.appendChild(body)
      return table
    }
    const renderAircraft = (): void => {
      aircraftGroup.replaceChildren()
      const rows = new Map<string, HTMLDivElement>()
      const offered = flowReady ? aircraftFor(ctx(), draft.scenarioId) : []
      for (const f of offered) {
        const el = ballotOption(aircraftRowLabel(f, dev), '', () => {
          draft = withAircraft(ctx(), draft, f.spec.id)
          renderAircraft()
        })
        rows.set(f.spec.id, el)
        aircraftGroup.appendChild(el)
      }
      markGroup(rows, draft.aircraftSpec)
      const chosen = offered.find((f) => f.spec.id === draft.aircraftSpec)
      aircraftCard.replaceChildren(...(chosen === undefined ? [paragraph(NO_AIRCRAFT)] : [paragraph(chosen.blurb), figuresTable(chosen)]))
      enable(aircraftNext, chosen !== undefined)
    }

    // ---- Form 6: the armament; exactly what hangs on the right.
    const ordnanceForm = sortieForm(TITLE_FORMS.ordnance)
    const loadoutGroup = radioGroup('Loadout')
    ordnanceForm.left.append(sectionTitle('Armament'), loadoutGroup)
    const storesHost = document.createElement('div')
    ordnanceForm.right.append(sectionTitle('Stores'), storesHost)
    const ordnanceBack = inkButton(m.back)
    const launchButton = inkButton(m.launch, true)
    ordnanceForm.sheet.appendChild(buttonRow(ordnanceBack, launchButton))
    const renderOrdnance = (): void => {
      loadoutGroup.replaceChildren()
      const rows = new Map<Loadout, HTMLDivElement>()
      const allowed = flowReady ? loadoutsFor(ctx(), draft.aircraftSpec) : [draft.loadout]
      // The briefing is two forms back, so its recommendation is marked here (A3).
      const recommended = optionOf(draft.scenarioId)?.recommendedLoadout
      const racks = racksLabel(missions.flyable.find((x) => x.spec.id === draft.aircraftSpec)?.spec)
      for (const option of LOADOUT_OPTIONS.filter((o) => allowed.includes(o.value))) {
        // A torpedo airplane's racks say "Torpedo" (D3 T1); every other label is the option's own.
        const label = option.value === 'bombs' ? racks : option.label
        const el = ballotOption(option.value === recommended ? `${label} (recommended)` : label, '', () => {
          draft = { ...draft, loadout: option.value }
          renderOrdnance()
        })
        rows.set(option.value, el)
        loadoutGroup.appendChild(el)
      }
      markGroup(rows, draft.loadout)
      const f = missions.flyable.find((x) => x.spec.id === draft.aircraftSpec)
      const hangs: string[] = []
      if (f !== undefined) {
        // A Dev loadout on a spec with no stations hangs the Hellcat's layout
        // (SF-R2), so say what that layout carries rather than "guns only".
        const layout = missions.flyable.find((x) => x.spec.id === DEV_STORES_SPEC_ID)?.spec.stores
        const drawn = needsDevStores(f.spec, draft.loadout) && layout !== undefined ? { ...f.spec, stores: layout } : f.spec
        hangs.push(storesLine(drawn, draft.loadout, missions.ordnanceNames))
        const note = devLayoutNote(ctx(), f.spec.id, draft.loadout)
        if (note !== null) hangs.push(note)
      }
      storesHost.replaceChildren(...hangs.map(paragraph))
    }

    // ============ Administrative memo: About / Settings ============
    // A separate, always-visible memo under both forms. Settings sits here,
    // NOT inside the roster/orders flow: it is session-wide state, not part of
    // starting a sortie, so it is reachable at every step including before a
    // pilot is picked (render-quality-selector spec §6).
    const admin = memoPanel()
    admin.panel.style.marginBottom = '3vh'
    admin.sheet.style.cssText = 'padding:12px 24px'
    const adminRow = document.createElement('div')
    adminRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap'
    const adminKicker = document.createElement('div')
    adminKicker.className = 'letterhead-kicker'
    adminKicker.textContent = 'Administration'
    const graphicsSummary = document.createElement('div')
    graphicsSummary.setAttribute('aria-label', 'Graphics status')
    graphicsSummary.style.cssText = 'margin-top:3px;font-size:12px;color:var(--ink-faint)'
    const renderGraphicsSummary = (): void => {
      const snap = settings.snapshot()
      const tier = snap.simpleTier === null ? 'Custom mix' :
        `${snap.simpleTier[0]!.toUpperCase()}${snap.simpleTier.slice(1)}`
      const adapter = snap.graphicsCheck?.environment.adapter
      const adapterName = adapter === undefined ? '' :
        [adapter.vendor, adapter.architecture].filter((v) => v.trim() !== '').join(' ').toUpperCase()
      const mode = snap.graphicsMode === 'automatic' ? 'recommended' : 'custom'
      graphicsSummary.textContent = [
        adapterName === '' ? 'Graphics' : adapterName,
        tier,
        `${Math.round(snap.renderScale * 100)}%`,
        mode,
      ].join(' · ')
    }
    const adminLabel = document.createElement('div')
    adminLabel.append(adminKicker, graphicsSummary)
    const about = inkButton(m.about)
    const settingsButton = inkButton(m.settings)
    // A plain link, not a mode: the Hangar is its own page (Hangar spec §3),
    // and navigating away drops this page's state the same way a reload does.
    // With About and Settings since 2026-10-08 (Mark): reference, not part of starting a sortie.
    const hangar = inkButton(m.hangar)
    // Carry only this page's session-scoped Dev choice. The Hangar uses it to
    // reveal exact asset ids; a reload or an ordinary Hangar link omits them.
    hangar.addEventListener('click', () => { window.location.href = `${m.hangarHref}${dev ? '?dev=1' : ''}` })
    // A developer's tool, not a player's (Mark 2026-10-09): shown only while Dev is checked.
    const sounds = inkButton(m.sounds)
    sounds.addEventListener('click', () => { window.location.href = m.soundsHref })
    sounds.style.display = dev ? '' : 'none'
    const adminButtons = document.createElement('div')
    adminButtons.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap'
    adminButtons.append(hangar, sounds, about, settingsButton)
    adminRow.append(adminLabel, adminButtons)
    admin.sheet.appendChild(adminRow)
    unsubscribeGraphicsSummary = settings.subscribe(renderGraphicsSummary)
    renderGraphicsSummary()
    overlay.appendChild(admin.panel)
    overlay.appendChild(bootWrap)

    // ============ About memo (popup) ============
    // Inside the overlay so it can never outlive it; dimmed the same way the
    // Settings dialog is.
    const aboutPanel = document.createElement('div')
    aboutPanel.className = 'naval-comms'
    aboutPanel.setAttribute('role', 'dialog')
    aboutPanel.setAttribute('aria-modal', 'true')
    aboutPanel.setAttribute('aria-label', 'About')
    aboutPanel.style.cssText =
      'position:absolute;inset:0;display:none;overflow-y:auto;background:rgba(11,13,16,.82);z-index:30'
    const aboutSheet = document.createElement('div')
    aboutSheet.className = 'sheet'
    aboutSheet.style.maxWidth = '640px'
    aboutSheet.appendChild(letterhead(m.aboutKicker, m.aboutTitle, 'FORM INFO-1'))
    for (const text of m.aboutParagraphs) {
      const p = document.createElement('p')
      p.style.cssText = 'margin:0 0 10px;font-size:13px;line-height:1.55'
      p.textContent = text
      aboutSheet.appendChild(p)
    }
    const aboutFinePrint = document.createElement('div')
    aboutFinePrint.className = 'fine-print'
    const creditsSpan = document.createElement('span')
    const creditLink = (text: string, href: string): HTMLAnchorElement => {
      const link = document.createElement('a')
      link.href = href
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = text
      link.style.color = 'inherit'
      return link
    }
    creditsSpan.append(
      CREDITS.before,
      creditLink(CREDITS.worldCover, WORLDCOVER_LICENCE_URL),
      CREDITS.between,
      creditLink(CREDITS.link, OSM_COPYRIGHT_URL),
    )
    // The flight overlay used to carry these links. Keep every CC BY work and
    // both data attributions reachable after removing that redundant panel.
    if (MODEL_CREDITS.length > 0) {
      creditsSpan.append(document.createElement('br'), 'Models: ')
      for (const part of modelCreditParts(MODEL_CREDITS)) {
        creditsSpan.append(part.href === undefined ? part.text : creditLink(part.text, part.href))
      }
      creditsSpan.append(' (', creditLink('CC BY 4.0', WORLDCOVER_LICENCE_URL), ')')
    }
    const licenceSpan = document.createElement('span')
    const repo = document.createElement('a')
    repo.href = m.repository
    repo.target = '_blank'
    repo.rel = 'noopener'
    repo.textContent = 'Source repository'
    repo.style.color = 'inherit'
    const website = document.createElement('a')
    website.href = m.website
    website.target = '_blank'
    website.rel = 'noopener'
    website.textContent = 'marktuttle.dev'
    website.style.color = 'inherit'
    licenceSpan.append(`${m.licence} `, repo, ' · ', website)
    aboutFinePrint.append(creditsSpan, licenceSpan)
    aboutSheet.appendChild(aboutFinePrint)
    const close = inkButton(m.close, true)
    aboutSheet.appendChild(buttonRow(close))
    aboutPanel.appendChild(aboutSheet)
    overlay.appendChild(aboutPanel)

    // Inside the overlay, same as the About panel and for the same reason:
    // it can never outlive the screen it belongs to.
    settingsDialog = createSettingsDialog(overlay, settings)

    root.appendChild(overlay)

    type Step = 'roster' | 'type' | 'orders' | 'conditions' | 'aircraft' | 'ordnance'
    let step: Step = 'roster'
    const panels: Readonly<Record<Step, HTMLDivElement>> = {
      roster: roster.panel, type: typeForm.panel, orders: orders.panel, conditions: conditions.panel,
      aircraft: aircraftForm.panel, ordnance: ordnanceForm.panel,
    }
    const showStep = (next: Step): void => {
      step = next
      for (const [k, panel] of Object.entries(panels)) panel.style.display = k === next ? 'block' : 'none'
      // Each form is drawn from the draft as it is entered (A3: the rows and
      // the defaults depend on everything chosen before it).
      if (next === 'type') renderFlightType()
      if (next === 'orders') renderScenarios()
      if (next === 'conditions') { renderTakeoff(); renderCloudiness() }
      if (next === 'aircraft') renderAircraft()
      if (next === 'ordnance') renderOrdnance()
      // Whichever control the player is most likely to press next.
      if (next === 'type') typeNext.focus()
      else if (next === 'orders') ordersNext.focus()
      else if (next === 'conditions') conditionsNext.focus()
      else if (next === 'aircraft') aircraftNext.focus()
      else if (next === 'ordnance') launchButton.focus()
      else if (selectedPilotId !== null) pilotRows.get(selectedPilotId)?.sortieButton.focus()
      else newPilotButton.focus()
    }
    const nextFromType = (): void => { if (flowReady) showStep('orders') }
    const nextFromOrders = (): void => { if (flowReady) showStep('conditions') }
    const nextFromConditions = (): void => { if (flowReady) showStep('aircraft') }
    const nextFromAircraft = (): void => { if (!aircraftNext.disabled) showStep('ordnance') }

    const selectPilot = (pilot: PilotRecord): void => {
      selectedPilotId = pilot.id
      for (const [id, { row: pilotRow, selectButton }] of pilotRows) {
        const selected = id === pilot.id
        pilotRow.classList.toggle('row-selected', selected)
        selectButton.setAttribute('aria-pressed', String(selected))
      }
      flyingAs.textContent = selectedPilotLabel(pilot)
      for (const el of routingPilots) el.textContent = sortiePilotLabel(pilot)
    }

    // A row-scoped start action removes the old invisible prerequisite where
    // a player first selected a row and then discovered that the footer's
    // disabled New game button had become available.
    const advance = (pilot: PilotRecord): void => {
      if (!boot.ready) return
      selectPilot(pilot)
      heldBadges = loadRoster().find((p) => p.id === pilot.id)?.badges ?? []
      if (flowReady) draft = reconcile(ctx(), draft, SCENARIO_ID)
      // On the ordinary default boot, a new pilot is led to the qualification
      // missions. Explicit scenario links and Dev test beds keep their target.
      if (!hasStartedFlow && pilot.sorties === 0 && currentScenarioId === SCENARIO_ID && !dev) {
        // The first training mission (Basic Flying), not the first mission row: the Catalina water
        // qualification sits earlier in the list and is a pooled mission (found 2026-10-14 by the title E2E).
        const firstMission = visibleScenarios(ctx()).find((o) => o.kind === 'mission' && o.pool === 'training')
        if (firstMission !== undefined) draft = withScenario(ctx(), firstMission.value)
      }
      hasStartedFlow = true
      flightType = optionOf(draft.scenarioId)?.kind ?? 'mission'
      showStep('type')
    }

    const totalKills = (pilot: PilotRecord): number =>
      Object.values(pilot.killsByType).reduce((sum, n) => sum + n, 0)

    // One `.form-table` row per pilot, columns matching `PilotRecord` (naval-
    // comms spec §3): name, rank, score, sorties, kills, status. The Name
    // cell's button is the row's select control -- a real `<button>` reset to
    // read as plain cell text (`ROW_SELECT_BUTTON_STYLE`), not a `role`
    // stuck on the `<tr>` itself, so the table keeps valid row/cell structure
    // while staying a native, keyboard-reachable control.
    //
    // Its accessible name is `pilotButtonLabel(pilot)` -- the SAME
    // name/rank/score(/KIA) string this screen has always used, unchanged
    // and still pinned by `titleScreen.test.ts` -- carried as `aria-label`
    // rather than visible text now that those fields each have their own
    // column, so a screen reader still hears the whole picture in one
    // announcement instead of just the name.
    const makePilotRow = (pilot: PilotRecord): HTMLTableRowElement => {
      const pilotRow = document.createElement('tr')

      const nameCell = document.createElement('td')
      const selectButton = document.createElement('button')
      selectButton.style.cssText = ROW_SELECT_BUTTON_STYLE
      selectButton.textContent = pilot.name
      selectButton.setAttribute('aria-label', pilotButtonLabel(pilot))
      selectButton.setAttribute('aria-pressed', 'false')
      selectButton.addEventListener('click', () => selectPilot(pilot))
      nameCell.appendChild(selectButton)

      const rankCell = document.createElement('td')
      rankCell.textContent = `${pilot.rank.abbrev}, ${pilot.rank.name}`
      const device = insigniaElement(pilot.rank, 18)
      if (device !== null) { device.style.marginRight = '8px'; rankCell.prepend(device) }

      const scoreCell = document.createElement('td')
      scoreCell.className = 'num'
      scoreCell.textContent = String(pilot.cumulativeScore)

      const sortiesCell = document.createElement('td')
      sortiesCell.className = 'num'
      sortiesCell.textContent = String(pilot.sorties)

      const killsCell = document.createElement('td')
      killsCell.className = 'num'
      killsCell.textContent = String(totalKills(pilot))

      // `.stamp-chip` -- unlike `.stamp`, it carries no `filter: url(...)`
      // reference (naval-comms.css), so it needs no `ensureStampFilter()`.
      const statusCell = document.createElement('td')
      statusCell.className = 'center'
      const statusChip = document.createElement('span')
      statusChip.className = 'stamp-chip'
      const chip = pilotStatusChip(pilot.status)
      statusChip.style.cssText = `color:var(${chip.color});border-color:var(${chip.color})`
      statusChip.textContent = chip.text
      statusCell.appendChild(statusChip)

      // Read-only, so never boot-locked (plan ruling): not in `lockable()`.
      const dossierCell = document.createElement('td')
      dossierCell.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'
      const dossierButton = inkButton('Dossier')
      dossierButton.setAttribute('aria-label', `Dossier: ${pilot.name}`)
      dossierButton.addEventListener('click', () => {
        // Re-entrancy guard (fix round 1, IMPORTANT 2): a double-click (or a
        // click on a different row's Dossier button while one is already
        // open) must not stack a second panel -- Close on the top one would
        // then leave the other alive with its own live keydown listener.
        if (openDossierClose !== null) return
        // Re-read so a record banked since this row was built is shown.
        const fresh = loadRoster().find((p) => p.id === pilot.id) ?? pilot
        openDossierClose = openDossier(overlay, fresh, scenarioLabel, () => {
          openDossierClose = null
          dossierButton.focus()
        }, badgeName)
      })
      const sortieButton = inkButton(m.newGame, true)
      sortieButton.setAttribute('aria-label', `${m.newGame}: ${pilot.name}`)
      sortieButton.addEventListener('click', () => advance(pilot))
      dossierCell.append(dossierButton, sortieButton)

      pilotRow.append(nameCell, rankCell, scoreCell, sortiesCell, killsCell, statusCell, dossierCell)
      pilotRows.set(pilot.id, { row: pilotRow, selectButton, sortieButton })
      return pilotRow
    }

    for (const pilot of pilots) tbody.appendChild(makePilotRow(pilot))

    // "Enlist New Pilot" (naval-comms spec §3: no matching prototype example
    // for this control, a new composition within the design system) -- a
    // `.form-section-title` heading, a `.field-row`/`.typed-input` pair for
    // the name, and an `.ink-button` pair, all styled off `naval-comms.css`'s
    // existing classes. "New pilot" toggles to the inline form, the same
    // button text, placeholder and confirm label `tests/e2e/
    // scenarioPicker.spec.ts` already selects by.
    rosterSheet.appendChild(sectionTitle('Enlist New Pilot'))

    const newPilotButton = inkButton('New pilot')

    const newPilotForm = document.createElement('div')
    newPilotForm.style.cssText = 'display:none;flex-direction:column;gap:10px'
    const fieldRow = document.createElement('div')
    fieldRow.className = 'field-row'
    const fieldLabel = document.createElement('span')
    fieldLabel.className = 'field-label'
    fieldLabel.textContent = 'Name'
    const newPilotInput = document.createElement('input')
    newPilotInput.type = 'text'
    newPilotInput.placeholder = 'Pilot name'
    newPilotInput.className = 'typed-input'
    fieldRow.append(fieldLabel, newPilotInput)
    const confirmRow = document.createElement('div')
    confirmRow.className = 'button-row'
    const newPilotConfirm = inkButton('Add', true)
    confirmRow.appendChild(newPilotConfirm)
    newPilotForm.append(fieldRow, confirmRow)

    const newPilotError = document.createElement('p')
    newPilotError.setAttribute('aria-live', 'polite')
    newPilotError.style.cssText = NEW_PILOT_ERROR_STYLE

    rosterSheet.append(newPilotButton, newPilotForm, newPilotError)
    // The Dev and God-mode switches remain roster-wide controls. Starting a
    // sortie is now contextual to each pilot row above.
    const devLabel = document.createElement('label')
    devLabel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-right:auto;font:12px var(--font-body);letter-spacing:.04em'
    const devBox = document.createElement('input')
    devBox.type = 'checkbox'
    devBox.checked = dev
    const godLabel = document.createElement('label')
    godLabel.style.cssText = devLabel.style.cssText.replace('margin-right:auto;', 'margin-right:12px;')
    const godBox = document.createElement('input')
    godBox.type = 'checkbox'
    godBox.checked = god && dev
    godBox.disabled = !dev
    godBox.addEventListener('change', () => { god = godBox.checked })
    devBox.addEventListener('change', () => {
      dev = devBox.checked
      sounds.style.display = dev ? '' : 'none'
      // God mode needs Dev: unchecking Dev clears it and locks the box.
      godBox.disabled = !dev
      if (!dev) { god = false; godBox.checked = false }
      if (flowReady) draft = reconcile(ctx(), draft, SCENARIO_ID)
      // The night takeoff choices are Dev-only: unchecking Dev falls back to the suggested time.
      if (!dev && takeoffTime !== null && takeoffTime in DEV_TAKEOFF_HOURS) takeoffTime = suggestedTime
      if (hourRequest !== null) renderTakeoff()
    })
    devLabel.append(devBox, m.dev)
    godLabel.append(godBox, m.god)
    const rosterButtons = buttonRow()
    rosterButtons.prepend(godLabel)
    rosterButtons.prepend(devLabel)
    rosterSheet.appendChild(rosterButtons)

    const openNewPilotForm = (): void => {
      newPilotButton.style.display = 'none'
      newPilotForm.style.display = 'flex'
      newPilotError.style.display = 'none'
      newPilotInput.value = ''
      newPilotInput.focus()
    }
    const closeNewPilotForm = (): void => {
      newPilotForm.style.display = 'none'
      newPilotButton.style.display = ''
      newPilotError.style.display = 'none'
    }
    // Rejects an empty/whitespace name here, inline -- `createPilot` (roster.ts)
    // throws on one by design, and letting that throw reach this click/keydown
    // handler uncaught is not this layer's job to recover from.
    const confirmNewPilot = (): void => {
      if (!isValidPilotName(newPilotInput.value)) {
        newPilotError.textContent = 'Enter a pilot name.'
        newPilotError.style.display = 'block'
        newPilotInput.focus()
        return
      }
      const pilot = createPilot(newPilotInput.value)
      pilots.push(pilot)
      saveRoster(pilots)
      tbody.appendChild(makePilotRow(pilot))
      closeNewPilotForm()
      selectPilot(pilot)
    }
    newPilotButton.addEventListener('click', openNewPilotForm)
    newPilotConfirm.addEventListener('click', confirmNewPilot)
    newPilotInput.addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      e.preventDefault()
      // Stops the keydown from bubbling to `window`'s `onKey` at all, rather
      // than relying on `onKey`'s own newPilotForm-open guard: the bubble
      // phase runs strictly AFTER this listener finishes. Cutting propagation
      // keeps that same Enter from also activating the newly added row action.
      e.stopPropagation()
      confirmNewPilot()
    })

    // Launch: Form 6 -> the flight.
    const start = (): void => {
      // Guards Enter (`onKey` below) the same way `advance` does: no pilot
      // selected, no flight -- `pilotId` has nothing to be.
      if (selectedPilotId === null) return
      const pilotIndex = pilots.findIndex((p) => p.id === selectedPilotId)
      if (pilotIndex === -1) return // unreachable: selectedPilotId only ever comes from `pilots`
      const pilotId = selectedPilotId
      // The resurrection (design §2): flipping a `kia` pilot back to `active`
      // and counting the resurrection happens exactly here, the moment the
      // sortie is LAUNCHED with that pilot selected -- not on selection, and
      // not on New game's step to Form 2, either of which would count a pilot
      // merely looked at. A Dev sortie (sortie spec A5: one that NEEDED Dev)
      // writes nothing, not even this: a K.I.A. pilot flying one stays K.I.A.
      const option = optionOf(draft.scenarioId)
      const flying = missions.flyable.find((f) => f.spec.id === draft.aircraftSpec)
      if (option === undefined || flying === undefined) return
      if (!sortieIsDev(option, flying.spec, draft.loadout, false) || recordDevSorties) {
        pilots[pilotIndex] = startSortie(pilots[pilotIndex]!)
        saveRoster(pilots)
      }
      hide()
      // `dev` is "Dev rules were available" (the box); main.ts derives whether
      // the sortie NEEDED them for the debrief's banking.
      onNewGame({ scenarioId: draft.scenarioId, aircraftSpec: draft.aircraftSpec, loadout: draft.loadout, dev, cloudiness, ...(dev && god ? { god: true } : {}), ...(takeoffTime === null ? {} : { timeOfDay: hourFor(takeoffTime) }) }, pilotId)
    }
    launchButton.addEventListener('click', start)
    typeBack.addEventListener('click', () => showStep('roster'))
    typeNext.addEventListener('click', nextFromType)
    ordersBack.addEventListener('click', () => showStep('type'))
    ordersNext.addEventListener('click', nextFromOrders)
    conditionsBack.addEventListener('click', () => showStep('orders'))
    conditionsNext.addEventListener('click', nextFromConditions)
    aircraftBack.addEventListener('click', () => showStep('conditions'))
    aircraftNext.addEventListener('click', nextFromAircraft)
    ordnanceBack.addEventListener('click', () => showStep('aircraft'))

    const aboutOpen = (): boolean => aboutPanel.style.display !== 'none'
    about.addEventListener('click', () => {
      aboutPanel.style.display = 'flex'
      close.focus()
    })
    const closeAbout = (): void => {
      aboutPanel.style.display = 'none'
      about.focus()
    }
    close.addEventListener('click', closeAbout)
    settingsButton.addEventListener('click', () => settingsDialog?.open())

    onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape' && aboutOpen()) {
        e.preventDefault()
        closeAbout()
        return
      }
      if (!boot.ready) return
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      if (aboutOpen()) return
      if (newPilotForm.style.display !== 'none') return
      // Enter must not advance or launch out from under the Settings dialog.
      // Its own ballot rows already stop Enter propagating (settings.ts), but
      // Enter pressed with nothing in the dialog focused still reaches here.
      if (settingsDialog?.isOpen() === true) return
      // A focused button activates itself natively on Enter: Back must go
      // back and About must open, not have Enter turn into "advance". The one
      // exception is a roster row's select button (the only button that
      // carries `aria-pressed`): click a pilot, press Enter -- that fast path
      // predates the multi-form flow and is kept.
      const target = e.target instanceof Element ? e.target.closest('button') : null
      if (target !== null && !target.hasAttribute('aria-pressed')) return
      e.preventDefault()
      if (step === 'roster') {
        const pilot = pilots.find((p) => p.id === selectedPilotId)
        if (pilot !== undefined) advance(pilot)
      }
      else if (step === 'type') nextFromType()
      else if (step === 'orders') nextFromOrders()
      else if (step === 'conditions') nextFromConditions()
      else if (step === 'aircraft') nextFromAircraft()
      else start()
    }
    // Everything that starts or configures a flight; the Dossier buttons are
    // deliberately absent (read-only, plan ruling).
    const lockable = (): (HTMLButtonElement | HTMLInputElement)[] => [
      ...[...pilotRows.values()].flatMap((r) => [r.selectButton, r.sortieButton]),
      newPilotButton, newPilotConfirm, hangar, about, settingsButton, devBox,
    ]
    const applyBootLock = (): void => {
      const locked = !boot.ready
      overlay.dataset.ww2Ready = String(!locked)
      for (const b of lockable()) {
        b.disabled = locked
        b.style.opacity = locked ? '.45' : ''
      }
      bootFill.style.width = `${Math.round(boot.fraction * 100)}%`
      bootBar.setAttribute('aria-valuenow', String(Math.round(boot.fraction * 100)))
      bootLabel.textContent = boot.label
    }
    const wasLocked = !boot.ready
    // The strip's own visibility is handled separately from the rest of
    // applyBootLock (fix round 2 finding 4): a title built already ready
    // (return-to-title, New game) hides it AT ONCE, no fade -- it was never
    // shown this build, so there is nothing to fade FROM. Only the live
    // "still loading -> ready" transition below fades.
    bootWrap.style.display = wasLocked ? 'block' : 'none'
    // A1: while booting the art shows alone -- every memo waits for ready.
    // `visibility`, not `display`: each memo keeps its own inline layout
    // (the stage is a flex column), and the forms keep their place.
    const memos = [stage, admin.panel]
    for (const el of memos) el.style.visibility = wasLocked ? 'hidden' : ''
    applyBootLock()
    unsubscribeBoot?.()
    unsubscribeBoot = boot.onChange(() => {
      applyBootLock()
      // The unlock moment: focus what the player most likely wants next.
      if (boot.ready && wasLocked) {
        // Spec §A.2: "the strip fades out", not the instant `display:none`
        // fix round 2's finding 4 caught -- a CSS opacity transition, then
        // hidden once it has fully faded. 300ms clears both E2E budgets
        // (dossier.spec.ts's 1s post-return-to-title check, boot.spec.ts's
        // post-ready check) with room to spare.
        bootWrap.style.transition = 'opacity .3s'
        bootWrap.style.opacity = '0'
        window.setTimeout(() => { bootWrap.style.display = 'none' }, 300)
        // The memos slide in at once, under the fading strip: the first
        // click after ready must land (boot.spec.ts).
        for (const el of memos) {
          el.style.visibility = ''
          el.classList.add('ww2-boot-slide-in')
        }
        const first = [...pilotRows.values()][0]
        ;(first?.selectButton ?? newPilotButton).focus()
      }
    })

    window.addEventListener('keydown', onKey)
    isUp = true
    if (boot.ready) newPilotButton.focus()
  }

  build()

  return {
    up: () => isUp,
    settings,
    hide,
    // Reassigns the parameter `build`'s closure already reads
    // (`currentScenarioId`, above) before rebuilding, rather than adding a
    // second variable -- `build`'s own scenario ballot and `start()`'s
    // selection both close over this one binding by reference, so a
    // reassignment here is exactly what the next `build()` call sees (Plan 9
    // Task 7 bugfix).
    show: (nextScenarioId: string): void => {
      currentScenarioId = nextScenarioId
      build()
    },
  }
}
