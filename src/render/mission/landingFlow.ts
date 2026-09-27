import { lastLanding, type MissionState } from '../../sim/mission/state.js'

/**
 * Whether the landing the frame just latched is an intermediate one (spec
 * §2.4: a radio line, no debrief, no pause) or gets today's debrief. Reads
 * the MISSION's log, never the frame (ruling R2): the mission records the
 * landing on or before the frame that raises `landing.report` (measured
 * 2026-09-26 at 1 and 3 ticks per frame). Anything else is a debrief.
 */
export function landingDisposition<M>(m: MissionState<M> | null, handledTick: number): { readonly kind: 'debrief' | 'intermediate'; readonly tick: number } {
  const l = m === null ? undefined : lastLanding(m)
  if (l === undefined || l.tick <= handledTick) return { kind: 'debrief', tick: handledTick }
  return { kind: l.intermediate ? 'intermediate' : 'debrief', tick: l.tick }
}
