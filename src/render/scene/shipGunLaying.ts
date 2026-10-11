import type { AaState } from '../../sim/weapons/aaFire.js'
import type { ShipMountView } from './ship.js'

/**
 * Apply M3's bounded sim pose to M1's instanced mount views. A gallery is one
 * sim fire position (`LightAA5`) rendered by several locators
 * (`LightAA5_1`, ...), so every barrel consumes the base pose.
 */
export function applyShipGunLaying(
  shipId: string,
  mounts: readonly ShipMountView[],
  laying: AaState['laying'],
): void {
  const poses = new Map((laying[shipId] ?? []).map((pose) => [pose.name, pose]))
  for (const mount of mounts) {
    const pose = poses.get(mount.name) ?? poses.get(mount.name.replace(/_\d+$/, ''))
    mount.setTraining(pose?.trainingRad ?? 0)
    mount.setElevation(pose?.elevationRad ?? 0)
  }
}
