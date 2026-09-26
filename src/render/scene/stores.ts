// src/render/scene/stores.ts
import { BoxGeometry, CylinderGeometry, Mesh, type BufferGeometry, type Material, type Object3D } from 'three'
import type { Stores } from '../../sim/flight/schema.js'
import { railOrder } from '../../sim/weapons/combat.js'

/** The mounts a spec carries, body-frame meters. The SIM owns them (content/aircraft/*.json
 *  `stores`, released from by combat.ts): the render hangs stores where the sim releases them,
 *  and never keeps a copy (O1; before O1 a hand copy of the Hellcat's lived here and drifted). */
export type StoreMounts = Pick<Stores, 'racks' | 'rails'>
export interface StoreVisual { readonly geometry: BufferGeometry; readonly material: Material }
/** One visual per store id, and the pitch of the drawn datum the stores hang parallel to. */
export interface StoreVisuals { readonly byStore: ReadonlyMap<string, StoreVisual>; readonly pitchRad: number }

/** The pre-O1 box and cylinder, for an airframe with no store models (hellcat.ts) or whose
 *  store models failed to load (wildcat.ts). Racks carry bombs and rails rockets, by construction. */
export function primitiveStoreVisuals(mounts: StoreMounts, material: Material): StoreVisuals & { dispose(): void } {
  const bomb = new BoxGeometry(1.6, 0.5, 0.5)
  const rocket = new CylinderGeometry(0.09, 0.09, 1.4, 8).rotateZ(Math.PI / 2)
  const byStore = new Map<string, StoreVisual>()
  for (const m of mounts.racks) byStore.set(m.store, { geometry: bomb, material })
  for (const m of mounts.rails) byStore.set(m.store, { geometry: rocket, material })
  return { byStore, pitchRad: 0, dispose(): void { bomb.dispose(); rocket.dispose() } }
}

/** One mesh per mount, named for its id, at its offset, pitched to the drawn datum, sharing
 *  its store's geometry and material (never disposed here: the visuals' owner frees them).
 *  `setStores` hides dropped bombs in rack order and fired rockets in the sim's own
 *  `railOrder`, the order combat.ts releases them in. */
export function attachStores(root: Object3D, mounts: StoreMounts, visuals: StoreVisuals): { setStores(bombsLeft: number, rocketsLeft: number): void; dispose(): void } {
  const make = (m: StoreMounts['racks'][number]): Mesh => {
    const v = visuals.byStore.get(m.store)
    if (v === undefined) throw new Error(`attachStores: no visual for store "${m.store}" (mount ${m.id}); have ${[...visuals.byStore.keys()].join(', ') || 'none'}`)
    const mesh = new Mesh(v.geometry, v.material)
    mesh.name = m.id
    mesh.position.set(...m.offset)
    mesh.rotation.z = visuals.pitchRad
    root.add(mesh)
    return mesh
  }
  const bombMeshes = mounts.racks.map(make)
  const rocketMeshes = mounts.rails.map(make)
  const dropOrder = railOrder(mounts.rails)
  return {
    setStores(bombsLeft: number, rocketsLeft: number): void {
      const dropped = mounts.racks.length - bombsLeft
      bombMeshes.forEach((mesh, i) => { mesh.visible = i >= dropped })
      const hidden = new Set(dropOrder.slice(0, mounts.rails.length - rocketsLeft))
      rocketMeshes.forEach((mesh, i) => { mesh.visible = !hidden.has(i) })
    },
    dispose(): void { for (const m of [...bombMeshes, ...rocketMeshes]) root.remove(m) },
  }
}
