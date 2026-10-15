import { MathUtils, type Object3D } from 'three'
import { DT } from '../../sim/flight/model.js'
import type { ParachutistEntity } from '../../sim/bailout.js'
import { staticModelUrl } from '../content.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'

export const PARACHUTIST_MODEL_ID = 'parachuting-person-rig'

export type ParachutistView = {
  readonly root: Object3D
  sync(entity: ParachutistEntity | null): void
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
    sync(entity): void {
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
    },
    dispose(): void {
      instance.release()
    },
  }
}
