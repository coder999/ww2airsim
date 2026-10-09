// src/render/sounds/library.ts
import type { AudioAsset } from '../../audio/assets.js'

/**
 * One row of `content/audio/candidates/index.json`: a sound take staged for
 * audition and not yet ingested into `content/audio/` (2026-10-09). The
 * directory is gitignored and excluded from builds (vite.config.ts), so only
 * the dev server on nexus serves it.
 */
export type CandidateTake = {
  readonly file: string
  /** The manifest filename stem the take is for, e.g. `radio_paddles_cut_1_us`. */
  readonly clip: string
  /** e.g. `ml2`, `v3tags`, `take2`; one clip can have several. */
  readonly take: string
  readonly note: string
  /** The spoken line, or null for a sound effect. */
  readonly text: string | null
}

export type CandidateGroup = {
  /** The clip without its `_us`/`_ja` suffix, so both languages sit together. */
  readonly cue: string
  readonly takes: readonly CandidateTake[]
  /** The in-game clip this cue would replace, if one already ships. */
  readonly replaces: string | null
}

export function cueOf(clip: string): string {
  return clip.replace(/_(us|ja)$/, '')
}

/** Groups takes by cue, in first-seen order, and flags any cue that already ships. */
export function groupCandidates(takes: readonly CandidateTake[], assets: readonly AudioAsset[]): CandidateGroup[] {
  const groups = new Map<string, CandidateTake[]>()
  for (const t of takes) {
    const cue = cueOf(t.clip)
    groups.set(cue, [...(groups.get(cue) ?? []), t])
  }
  const shipped = new Set(assets.map((a) => a.id as string))
  return [...groups].map(([cue, list]) => ({ cue, takes: list, replaces: shipped.has(cue) ? cue : null }))
}
