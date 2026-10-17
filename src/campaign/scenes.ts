import type { Campaign, ChapterId } from './schema.js'

/** F9: the only thing a scene writes. Idempotent (same reference back when already seen); one `revision` bump otherwise. */
export function markSceneSeen(c: Campaign, sceneId: string): Campaign {
  if (c.scenesSeen.includes(sceneId)) return c
  return { ...c, revision: c.revision + 1, scenesSeen: [...c.scenesSeen, sceneId] }
}

export const openingSceneId = (chapter: ChapterId): string => `${chapter.toLowerCase()}-opening`
export const victorySceneId = (chapter: ChapterId): string => `${chapter.toLowerCase()}-victory`

/** Openings and victories play once per campaign; replays from HQ ignore this. */
export const sceneUnseen = (c: Campaign, sceneId: string): boolean => !c.scenesSeen.includes(sceneId)
