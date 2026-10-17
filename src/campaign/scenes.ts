import type { Campaign } from './schema.js'

/** F9: the only thing a scene writes. Idempotent (same reference back when already seen); one `revision` bump otherwise. */
export function markSceneSeen(c: Campaign, sceneId: string): Campaign {
  if (c.scenesSeen.includes(sceneId)) return c
  return { ...c, revision: c.revision + 1, scenesSeen: [...c.scenesSeen, sceneId] }
}
