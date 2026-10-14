import type { World } from '../sim/loop.js'
import { canonicalStringify, fnv1a64 } from './canonical.js'

const dynamicValue = (value: unknown, key = ''): unknown => {
  if (key === 'spec' && value !== null && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  if (Array.isArray(value)) return value.map((entry) => dynamicValue(entry))
  if (value instanceof Set) return [...value].sort()
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>)
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(value)) {
      const transformed = dynamicValue(child, childKey)
      if (transformed !== undefined) output[childKey] = transformed
    }
    return output
  }
  return value
}

export const worldChecksum = <M>(world: World<M>): string => {
  // Terrain samples are large immutable content and are covered by the
  // scenario digest. The fixed-step accumulator is render-frame history,
  // not simulation state. Everything else remains in the checksum,
  // including static structure ids/positions and combat.structure damage.
  const checked = { ...world, terrain: undefined, accumulatorSeconds: undefined }
  return fnv1a64(canonicalStringify(dynamicValue(checked)))
}

export type WorldSummary = {
  tick: number
  aircraft: { id: string; spec: string; destroyed: boolean; impacted: boolean }[]
  ships: { id: string; spec: string; destroyed: boolean }[]
  vehicles: { id: string; spec: string; destroyed: boolean }[]
  missionComplete: boolean | null
}

export function worldSummary<M>(world: World<M>): WorldSummary {
  return {
    tick: world.tick,
    aircraft: world.aircraft.map((aircraft) => ({
      id: aircraft.id,
      spec: aircraft.spec.id,
      destroyed: (world.combat.aircraft[aircraft.id]?.damage.destroyedAt ?? null) !== null,
      impacted: aircraft.impact !== null,
    })),
    ships: world.ships.map((ship) => ({
      id: ship.id,
      spec: ship.spec.id,
      destroyed: (world.combat.ships[ship.id]?.destroyedTick ?? null) !== null,
    })),
    vehicles: world.vehicles.map((vehicle) => ({
      id: vehicle.id,
      spec: vehicle.spec.id,
      destroyed: (world.combat.vehicles[vehicle.id]?.destroyedTick ?? null) !== null,
    })),
    missionComplete: world.mission === null ? null : world.mission.progress.every((objective) => objective.status === 'complete'),
  }
}

