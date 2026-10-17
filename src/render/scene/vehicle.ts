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

/** `kind` (F10B): `equipment` for a vehicle spec that draws an equipment model (A4's life raft), which has no rig. */
export type LoadVehicleView = (modelId: string, kind?: 'vehicle' | 'equipment') => Promise<VehicleView>

const STILL_RIG: VehicleRig = {
  parts: [], mounts: [], drive() {}, state: () => ({}), dispose() {},
}

export const loadRegisteredVehicleView: LoadVehicleView = async (modelId, kind = 'vehicle') => {
  const instance = await acquireModel(staticModelUrlFor(kind, modelId))
  const rigFor = kind === 'equipment' ? (): VehicleRig => STILL_RIG : VEHICLE_RIGS[modelId]
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
