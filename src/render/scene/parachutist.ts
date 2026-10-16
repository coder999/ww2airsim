import { MathUtils, type Object3D } from 'three'
import { DT } from '../../sim/flight/model.js'
import type { ParachutistEntity } from '../../sim/bailout.js'
import { staticModelUrl } from '../content.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'

export const PARACHUTIST_MODEL_ID = 'parachuting-person-rig'
/** The rig nodes the view drives; `tests/render/parachutistView.test.ts` reads them out of the committed glb. */
export const CANOPY_NODES = ['CanopyOpen', 'CanopyRibs', 'CanopyClosed'] as const

const MAX_SWAY_RAD = (9 * Math.PI) / 180

/**
 * A gentle swing under the open canopy, view-only (Mark, 2026-10-15): a pure function of the tick, the wind and the
 * sink rate, so it never touches the simulation and a replay looks the same. The F4 art handoff left the canopy static
 * and asked the first gameplay descent to add this. Still while packed, clearing the airframe, or down.
 */
export function canopySway(tick: number, windMps: number, sinkMps: number, phase: ParachutistEntity['state']['phase']): { readonly rollRad: number; readonly pitchRad: number } {
  if (phase !== 'deploying' && phase !== 'canopy') return { rollRad: 0, pitchRad: 0 }
  const t = tick * DT
  const amplitude = Math.min(MAX_SWAY_RAD, 0.02 + 0.004 * Math.max(0, windMps) + 0.002 * Math.max(0, sinkMps))
  return {
    rollRad: amplitude * Math.sin(t * 2.4) * Math.min(1, 0.6 + 0.4 * Math.sin(t * 0.7)),
    pitchRad: amplitude * 0.6 * Math.sin(t * 1.7 + 1.1),
  }
}

export type ParachutistView = {
  readonly root: Object3D
  sync(entity: ParachutistEntity | null, wind?: { readonly x: number; readonly z: number } | null): void
  dispose(): void
}

export async function loadParachutistView(): Promise<ParachutistView> {
  const instance: ModelInstance = await acquireModel(staticModelUrl('equipment', PARACHUTIST_MODEL_ID))
  const root = instance.root
  root.name = PARACHUTIST_MODEL_ID
  root.visible = false
  const canopy = instance.node('CanopyOpen')
  const ribs = instance.node('CanopyRibs')
  const closedCanopy = instance.node('CanopyClosed')

  return {
    root,
    sync(entity, wind): void {
      if (entity === null) {
        root.visible = false
        return
      }
      root.visible = true
      const { state } = entity
      root.position.set(state.position.x, state.position.y, state.position.z)
      const speed = Math.hypot(state.velocity.x, state.velocity.z)
      if (speed > 0.2) root.rotation.y = Math.atan2(-state.velocity.z, state.velocity.x)
      const deploying = state.phase === 'deploying'
      const open = state.phase === 'canopy' || state.phase === 'down'
      canopy.visible = deploying || open
      ribs.visible = deploying || open
      closedCanopy.visible = !deploying && !open
      const fraction = open ? 1 : deploying ? MathUtils.clamp((state.tick - state.phaseStartedTick) * DT / 1.25, 0.08, 1) : 0.08
      canopy.scale.set(fraction, fraction, fraction)
      ribs.scale.set(fraction, fraction, fraction)
      const sway = canopySway(state.tick, wind === null || wind === undefined ? 0 : Math.hypot(wind.x, wind.z), Math.max(0, -state.velocity.y), state.phase)
      root.rotation.order = 'YXZ'
      root.rotation.x = sway.pitchRad
      root.rotation.z = sway.rollRad
    },
    dispose(): void {
      instance.release()
    },
  }
}
