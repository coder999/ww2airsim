/** The twelve campaign chapters' titles, dates and labels: a stand-in until F10 authors real descriptors. Checked against GAMEPLAY.md by a parsed-table test. */
import data from '../../../content/campaign/chapters.json'
import type { ChapterId, Faction } from '../../campaign/index.js'

export type ChapterInfo = {
  readonly id: ChapterId; readonly faction: Faction; readonly title: string; readonly date: string
  readonly label: string; readonly aircraft: string; readonly minRank: string; readonly action: string
}
export const CHAPTER_INFO: readonly ChapterInfo[] = data.chapters as unknown as ChapterInfo[]
export const chapterInfo = (id: ChapterId): ChapterInfo => CHAPTER_INFO.find((c) => c.id === id)!
