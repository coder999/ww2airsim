/**
 * F8's chapter-to-site-windows table (F8A Task 2, plan docs/superpowers/plans/2026-10-16-f8-canonical-world.md, decision 8).
 * Pure data and two functions. F3 sections 3 and 5 say which window each chapter is played in; section 4's "State
 * transition" lines say what a chapter's success changes. `Campaign.world[siteId]` holds the latest banked window and F5A
 * keeps it opaque; the window ids are the one list in `content/campaign/site-windows.json`, shared with
 * `src/sim/world/sites.ts`.
 *
 * All nine sites are listed (F8C, 2026-10-17, added Ormoc, the landing beaches and the Jinamoc anchorage); a key this file
 * does not own is passed through untouched. F8B (2026-10-17) added Buri, Bayug and San Pablo: they play in the same window as
 * every other site for a chapter, and F3 section 4 changes them only on A6 (all three stay American, `endgame`) and J6 (all
 * three Japanese, `j6-alternate`); A1 names Tacloban and Dulag only and J5 "captures no field by itself".
 */
import siteWindows from '../../content/campaign/site-windows.json' with { type: 'json' }
import { CHAPTER_IDS } from './schema.js'

export const WINDOW_IDS: readonly string[] = siteWindows.windows.map((w) => w.id)
export const F8A_SITES = ['tacloban', 'dulag', 'tanauan'] as const
export const F8B_SITES = ['buri', 'bayug', 'san-pablo'] as const
export const F8C_SITES = ['ormoc', 'landing-beaches', 'jinamoc'] as const
const SITES: readonly string[] = [...F8A_SITES, ...F8B_SITES, ...F8C_SITES]

type World = Readonly<Record<string, string>>
const BURAUEN = (window: string): Readonly<Record<string, string>> => ({ buri: window, bayug: window, 'san-pablo': window })
const all = (window: string): Readonly<Record<string, string>> => Object.fromEntries(SITES.map((s) => [s, window]))

/**
 * The window every site is drawn in while a chapter is played (F3 sections 3 and 5, by the chapter's date and hour).
 * A1 launches at 0800, before H-hour, so the fields are still Japanese in it; its success is what captures them.
 * J4 (3 Dec) falls between the November column and the 6-7 Dec one and is placed in the earlier, as Tanauan's work began
 * after 28 Nov and nothing else changes by 6 Dec. These two placements are readings, recorded in the F8A handoff.
 * J3 (3 Nov) plays the Burauen fields in `pre-invasion` (Mark, 2026-10-17): F3 section 4 recovers its Japanese pilot at Bayug, which
 * F3 section 5 makes American on that date, so the three Burauen fields are drawn Japanese for J3 and the Tacloban-side sites stay
 * in `buildup`.
 * F8C (2026-10-17): the landing beaches are played in `assault` for A1. F3 section 4's A1 line says the beach state "advances from assault
 * to established beachhead"; 20 Oct is the assault column and the opening has landing craft off the beaches. The other sites keep the
 * F8A reading (still `pre-invasion` at 0800); A1's success writes the beaches `buildup` (below).
 */
const PLAY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  A1: { ...all('pre-invasion'), 'landing-beaches': 'assault' }, A2: all('buildup'), A3: all('buildup'), A4: all('buildup'), A5: all('buildup'), A6: all('endgame'),
  J1: all('pre-invasion'), J2: all('assault'), J3: { ...all('buildup'), ...BURAUEN('pre-invasion') }, J4: all('buildup'), J5: all('endgame'), J6: all('j6-alternate'),
}

/**
 * What a chapter's success writes into `world` (F3 section 4, "State transition"). A chapter with no line changes no
 * site: J5 "captures no field by itself"; A3-A5 and J1-J4 name none. A2 is the one line F3 does not give (F10A, Mark's Decision 10, 2026-10-17):
 * A1 leaves Tacloban and Dulag in `assault`, where they are unserviceable (content/sites), which would make A3's Tacloban landing and A5's field
 * options illegal on the real campaign path; A2 advances them to the late Oct-Nov `buildup`, in which they are serviceable. A1 names Tacloban and Dulag (captured) and the landing beaches
 * (established beachhead), so the Burauen fields, Ormoc and the anchorage stay where they were after it.
 */
const SUCCESS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  A1: { tacloban: 'assault', dulag: 'assault', 'landing-beaches': 'buildup' },
  A2: { tacloban: 'buildup', dulag: 'buildup' }, A3: {}, A4: {}, A5: {},
  A6: all('endgame'),
  J1: {}, J2: {}, J3: {}, J4: {}, J5: {},
  J6: all('j6-alternate'),
}

const known = (chapter: string): void => {
  if (!(CHAPTER_IDS as readonly string[]).includes(chapter) || PLAY[chapter] === undefined || SUCCESS[chapter] === undefined) {
    throw new Error(`unknown chapter "${chapter}" (${CHAPTER_IDS.join(', ')})`)
  }
}

/** The window of every F8A site while `chapter` is played. Throws for a chapter that does not exist. */
export function windowsForChapter(chapter: string): Readonly<Record<string, string>> {
  known(chapter)
  return PLAY[chapter]!
}

/** The `world` after `chapter` succeeds. A new object; keys this table does not own are kept. */
export function applyChapterSuccess(world: World, chapter: string): Record<string, string> {
  known(chapter)
  return { ...world, ...SUCCESS[chapter]! }
}

/**
 * The window every site is drawn in when a chapter LAUNCHES (Mark's ruling, 2026-10-16: a launch reads the stored `Campaign.world`,
 * not the chapter's own window). For each site, the stored window when the key is present; the chapter's own window
 * (`windowsForChapter`) only for a key that is absent, as in a new campaign. A key the table does not own that is stored passes
 * through. `null` is a flight that carries no chapter (Dev, Single Missions, Training): `{}`, so every site reads `pre-invasion`
 * or the DEV `?siteState=`, exactly as before. Pure and total over the chapters.
 */
export function launchWindows(world: World, chapter: string | null): Record<string, string> {
  if (chapter === null) return {}
  return { ...windowsForChapter(chapter), ...world }
}
