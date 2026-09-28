/** Pure crash/manual/debrief orchestration for instant replay (spec §4). */
export type ReplayFlow =
  | { readonly kind: 'live' }
  | { readonly kind: 'hold'; readonly remainingMs: number }
  | { readonly kind: 'replay'; readonly returnTo: 'debrief' | 'live'; readonly firstShow: boolean }
  | { readonly kind: 'debrief' }

export type ReplayFlowEvent =
  | { readonly kind: 'crashBanked' }
  | { readonly kind: 'frame'; readonly frameMs: number; readonly paused: boolean; readonly recordingAvailable: boolean }
  | { readonly kind: 'replayDone' }
  | { readonly kind: 'watch' }
  | { readonly kind: 'manual' }
  | { readonly kind: 'landingDebrief' }
  | { readonly kind: 'debriefClosed' }
  | { readonly kind: 'reset' }

export type ReplayFlowEffect = 'startAutoReplay' | 'startManualReplay' | 'showDebrief'

export const DEBRIEF_DELAY_MS = 3000

const unchanged = (flow: ReplayFlow): { readonly flow: ReplayFlow; readonly effects: readonly ReplayFlowEffect[] } =>
  ({ flow, effects: [] })

export function stepFlow(
  flow: ReplayFlow,
  event: ReplayFlowEvent,
): { readonly flow: ReplayFlow; readonly effects: readonly ReplayFlowEffect[] } {
  if (event.kind === 'reset') return unchanged({ kind: 'live' })

  switch (flow.kind) {
    case 'live':
      if (event.kind === 'crashBanked') return unchanged({ kind: 'hold', remainingMs: DEBRIEF_DELAY_MS })
      if (event.kind === 'manual') {
        return {
          flow: { kind: 'replay', returnTo: 'live', firstShow: false },
          effects: ['startManualReplay'],
        }
      }
      if (event.kind === 'landingDebrief') return unchanged({ kind: 'debrief' })
      return unchanged(flow)

    case 'hold': {
      if (event.kind !== 'frame' || event.paused) return unchanged(flow)
      const remainingMs = flow.remainingMs - Math.max(0, event.frameMs)
      if (remainingMs > 0) return unchanged({ kind: 'hold', remainingMs })
      return event.recordingAvailable
        ? {
            flow: { kind: 'replay', returnTo: 'debrief', firstShow: true },
            effects: ['startAutoReplay'],
          }
        : { flow: { kind: 'debrief' }, effects: ['showDebrief'] }
    }

    case 'replay':
      if (event.kind !== 'replayDone') return unchanged(flow)
      return {
        flow: { kind: flow.returnTo },
        effects: flow.firstShow && flow.returnTo === 'debrief' ? ['showDebrief'] : [],
      }

    case 'debrief':
      if (event.kind === 'watch') {
        return {
          flow: { kind: 'replay', returnTo: 'debrief', firstShow: false },
          effects: ['startAutoReplay'],
        }
      }
      if (event.kind === 'debriefClosed') return unchanged({ kind: 'live' })
      return unchanged(flow)
  }
}
