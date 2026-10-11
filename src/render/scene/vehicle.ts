import { Group, type Object3D } from 'three'
import type { StructureDamage } from '../../sim/weapons/structures.js'
import { acquireModel } from '../models/modelCache.js'
import { staticModelUrlFor } from './staticModels.js'
import { VEHICLE_RIGS, type VehicleRig } from './vehicleRig.js'

export type VehicleView = {
  readonly root: Object3D
  drive(distanceM: number, steer: number): void
  setDamage(damage: StructureDamage): void
  dispose(): void
}

export type LoadVehicleView = (modelId: string) => Promise<VehicleView>

export const loadRegisteredVehicleView: LoadVehicleView = async (modelId) => {
  const instance = await acquireModel(staticModelUrlFor('vehicle', modelId))
  const rigFor = VEHICLE_RIGS[modelId]
  if (rigFor === undefined) { instance.release(); throw new Error(`no vehicle rig for "${modelId}"`) }
  let rig: VehicleRig
  try { rig = rigFor(instance.root) } catch (error) { instance.release(); throw error }
  const root = new Group()
  root.name = `vehicle ${modelId}`
  root.add(instance.root)
  return {
    root,
    drive: (distanceM, steer) => rig.drive(distanceM, steer),
    setDamage(damage) {
      const destroyed = damage.destroyedTick !== null
      instance.root.rotation.x = destroyed ? 0.12 : 0
      instance.root.scale.y = destroyed ? 0.72 : 1
    },
    dispose() { rig.dispose(); root.remove(instance.root); instance.release() },
  }
}
