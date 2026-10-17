/**
 * F8's chapter-to-site-windows table (F8A Task 2, plan docs/superpowers/plans/2026-10-16-f8-canonical-world.md, decision 8).
 * Pure data and two functions. F3 sections 3 and 5 say which window each chapter is played in; section 4's "State
 * transition" lines say what a chapter's success changes. `Campaign.world[siteId]` holds the latest banked window and F5A
 * keeps it opaque; the window ids are the one list in `content/campaign/site-windows.json`, shared with
 * `src/sim/world/sites.ts`.
 *
 * Only the F8A sites are listed. F8B (Buri, Bayug, San Pablo) and F8C (Ormoc, the beaches, San Pedro Bay) add their keys to
 * `SITES`, `PLAY` and `SUCCESS` below; a key this file does not own is passed through untouched.
 */
import siteWindows from '../../content/campaign/site-windows.json'
import { CHAPTER_IDS } from './schema.js'

export const WINDOW_IDS: readonly string[] = siteWindows.windows.map((w) => w.id)
export const F8A_SITES = ['tacloban', 'dulag', 'tanauan'] as const
const SITES: readonly string[] = F8A_SITES

type World = Readonly<Record<string, string>>
const all = (window: string): Readonly<Record<string, string>> => Object.fromEntries(SITES.map((s) => [s, window]))

/**
 * The window every site is drawn in while a chapter is played (F3 sections 3 and 5, by the chapter's date and hour).
 * A1 launches at 0800, before H-hour, so the fields are still Japanese in it; its success is what captures them.
 * J4 (3 Dec) falls between the November column and the 6-7 Dec one and is placed in the earlier, as Tanauan's work began
 * after 28 Nov and nothing else changes by 6 Dec. These two placements are readings, recorded in the F8A handoff.
 */
const PLAY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  A1: all('pre-invasion'), A2: all('buildup'), A3: all('buildup'), A4: all('buildup'), A5: all('buildup'), A6: all('endgame'),
  J1: all('pre-invasion'), J2: all('assault'), J3: all('buildup'), J4: all('buildup'), J5: all('endgame'), J6: all('j6-alternate'),
}

/**
 * What a chapter's success writes into `world` (F3 section 4, "State transition"). A chapter with no line changes no
 * F8A site: J5 "captures no field by itself"; A2-A5 and J1-J4 name none.
 */
const SUCCESS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  A1: { tacloban: 'assault', dulag: 'assault' },
  A2: {}, A3: {}, A4: {}, A5: {},
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
