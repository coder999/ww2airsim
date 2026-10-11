import { Euler } from 'three'
import type { StructureDamage, StructureEntity } from '../../sim/weapons/structures.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { staticModelUrlFor } from './staticModels.js'
import { VEHICLE_RIGS, type VehicleRig } from './vehicleRig.js'

/** A scenario vehicle owns one cached model instance and its existing articulated rig. */
export interface VehicleView {
  readonly root: ModelInstance['root']
  sync(entity: StructureEntity, damage: StructureDamage | undefined): void
  dispose(): void
}

export type LoadVehicleView = (entity: StructureEntity) => Promise<VehicleView>

export const loadRegisteredVehicleView: LoadVehicleView = async (entity) => {
  if (entity.kind !== 'tank' || entity.model === undefined) {
    throw new Error(`vehicle view needs a modeled tank, got "${entity.id}"`)
  }
  const instance = await acquireModel(staticModelUrlFor('vehicle', entity.model))
  let rig: VehicleRig
  try {
    const buildRig = VEHICLE_RIGS[entity.model]
    if (buildRig === undefined) throw new Error(`no vehicle rig "${entity.model}"`)
    rig = buildRig(instance.root)
    rig.drive(0, 0)
  } catch (error) {
    instance.release()
    throw error
  }
  let disposed = false
  return {
    root: instance.root,
    sync(current, damage): void {
      const destroyed = damage?.destroyedTick !== null && damage?.destroyedTick !== undefined
      // GLB frame is +x forward; scenario headings use 0 = north (-z).
      const yaw = Math.PI / 2 - current.headingRad
      instance.root.position.set(current.position.x, current.position.y - current.halfSize.y - (destroyed ? 0.18 : 0), current.position.z)
      instance.root.quaternion.setFromEuler(new Euler(destroyed ? 0.08 : 0, yaw, destroyed ? 0.16 : 0, 'YXZ'))
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      rig.dispose()
      instance.release()
    },
  }
}
