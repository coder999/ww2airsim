// tools/models/stages/shipMounts.ts
import type { Document, Node } from '@gltf-transform/core'
import { getBounds, transformMesh } from '@gltf-transform/functions'
import type { ShipArmament, ShipMount, ShipSpec } from '../../../src/sim/world/ships.js'
import { onlyScene, ownMesh } from '../document.js'
import type { ShipEntry } from '../manifest.js'
import { generateKit, GENERATED_KITS } from './mountKits.js'
import { roleMaterial } from './shipMaterials.js'
import { documentSoup } from './shipFit.js'
import { surfaceBelow } from '../../../src/render/scene/shipFit.js'

/**
 * The instanced mount kit (Track M, M1 plan 2026-10-08, Ruling R2). Every gun
 * position in a ship spec's `armament` gets a locator node named for its list
 * and place, bow to stern: `Turret1..N`, `HeavyAA1..N`, `LightAA1..N`. A model
 * draws a mount by carving (a download's `split`) or building (a Blender
 * script's object) a node with that same name. The first carved node of each
 * kit becomes `Kit_<kit>`, the one mesh the renderer instances at every
 * locator of that kit; the other carved copies are deleted, so a kit costs one
 * draw however many mounts use it.
 */

export const KIT_PREFIX = 'Kit_'

export interface NamedMount { readonly name: string; readonly mount: ShipMount; readonly aa: 'heavy' | null }

/** Every armament entry with its locator name, bow to stern within each list. */
export function namedMounts(a: ShipArmament): NamedMount[] {
  return [
    ...a.turrets.map((m, i) => ({ name: `Turret${i + 1}`, mount: m, aa: m.aa })),
    ...a.heavyAA.map((m, i) => ({ name: `HeavyAA${i + 1}`, mount: m, aa: null })),
    ...a.lightAA.map((m, i) => ({ name: `LightAA${i + 1}`, mount: m, aa: null })),
  ]
}

/** A carved node's base must hold its spec point: inside its plan bounds, and its foot within this of the point's y. */
export const MOUNT_SLACK_M = 0.75

/** Rotation about +y by `-bearingDeg` (bearing is clockwise seen from above, +z starboard), as a quaternion. */
export function bearingQuat(bearingDeg: number): [number, number, number, number] {
  const h = (-bearingDeg * Math.PI / 180) / 2
  return [0, Math.sin(h), 0, Math.cos(h)]
}

/** Column-major: a donor's vertices (node translation `t`) to kit-local, rotY(+bearing) * (v + t - p),
 *  so that posing the kit at the mount with `bearingQuat` puts every vertex back where it was. */
function toKitLocal(m: ShipMount, t: readonly number[]): number[] {
  const th = m.bearingDeg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th)
  const dx = t[0]! - m.x, dy = t[1]! - m.y, dz = t[2]! - m.z
  // rotY(+th): +x -> (c, 0, -s), the inverse of bearingQuat's rotY(-th).
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, c * dx + s * dz, dy, -s * dx + c * dz, 1]
}

/**
 * Before prune: checks every carved node against its spec point, turns each
 * kit's first carved node into `Kit_<kit>` (geometry in kit-local space, node
 * posed at that mount, so the file still shows the gun where it stands), and
 * deletes every other carved copy. Throws, listing every problem.
 */
export function carveMounts(doc: Document, spec: ShipSpec, palette: ShipEntry['palette']): void {
  if (!spec.armament) return
  const byName = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n] as const))
  const problems: string[] = []
  const donors = new Map<string, { node: Node; mount: ShipMount }>()
  const doomed: Node[] = []
  for (const { name, mount } of namedMounts(spec.armament)) {
    const node = byName.get(name)
    if (!node) continue
    if (mount.kit === null) { problems.push(`${name} is carved, but its spec entry has a null kit (a static fire position)`); continue }
    if (!node.getMesh()) { problems.push(`${name} has no mesh`); continue }
    const b = getBounds(node)
    const inPlan = mount.x >= b.min[0] - MOUNT_SLACK_M && mount.x <= b.max[0] + MOUNT_SLACK_M && mount.z >= b.min[2] - MOUNT_SLACK_M && mount.z <= b.max[2] + MOUNT_SLACK_M
    if (!inPlan || Math.abs(b.min[1] - mount.y) > MOUNT_SLACK_M) {
      problems.push(`${name} at spec [${mount.x}, ${mount.y}, ${mount.z}] is not at its carved node (x ${b.min[0].toFixed(2)}..${b.max[0].toFixed(2)}, foot y ${b.min[1].toFixed(2)}, z ${b.min[2].toFixed(2)}..${b.max[2].toFixed(2)})`)
      continue
    }
    if (donors.has(mount.kit)) doomed.push(node)
    else donors.set(mount.kit, { node, mount })
  }
  // Every mount, carved, generated or a static fire position, stands on something: a surface under
  // its point within the slack, so a mistyped height never leaves a gun floating or buried.
  const soup = documentSoup(doc)
  for (const { name, mount } of namedMounts(spec.armament)) {
    const under = surfaceBelow(soup, mount.x, mount.z, mount.y + MOUNT_SLACK_M)
    if (under === null || mount.y - under > MOUNT_SLACK_M) problems.push(`${name} at [${mount.x}, ${mount.y}, ${mount.z}] stands on nothing (the surface below is ${under === null ? 'absent' : under.toFixed(2)})`)
  }
  const kits = new Set(namedMounts(spec.armament).flatMap(({ mount }) => (mount.kit === null ? [] : [mount.kit])))
  for (const kit of kits) if (!donors.has(kit) && !GENERATED_KITS[kit]) problems.push(`kit "${kit}" has no carved or built node and no generator: name a node after a mount that uses it`)
  if (problems.length) throw new Error(`ship ${spec.id} mounts: ${problems.join('; ')}`)
  for (const [kit, { node, mount }] of donors) {
    // The node carries a translation only (normalize, then shipFit's bake).
    transformMesh(ownMesh(doc, node)!, toKitLocal(mount, node.getTranslation()) as unknown as Parameters<typeof transformMesh>[1])
    node.setName(`${KIT_PREFIX}${kit}`).setTranslation([mount.x, mount.y, mount.z]).setRotation(bearingQuat(mount.bearingDeg)).setScale([1, 1, 1])
    node.setExtras({ ...node.getExtras(), kit })
  }
  for (const node of doomed) node.dispose()
  // A kit the model has no geometry for is generated, posed at its first mount (mountKits.ts).
  for (const kit of kits) {
    if (donors.has(kit)) continue
    const first = namedMounts(spec.armament).find((m) => m.mount.kit === kit)!.mount
    const node = generateKit(doc, kit, roleMaterial(doc, palette, 'fitting'))
    node.setTranslation([first.x, first.y, first.z]).setRotation(bearingQuat(first.bearingDeg)).setExtras({ kit })
    onlyScene(doc).addChild(node)
  }
}

/** After prune (which drops empty leaves): one empty locator per armament entry, at the scene root. */
export function addMountLocators(doc: Document, spec: ShipSpec): void {
  if (!spec.armament) return
  const scene = onlyScene(doc)
  for (const { name, mount, aa } of namedMounts(spec.armament)) {
    const extras: Record<string, unknown> = { kit: mount.kit, barrels: mount.barrels }
    if (name.startsWith('Turret')) extras['aa'] = aa
    scene.addChild(doc.createNode(name).setTranslation([mount.x, mount.y, mount.z]).setRotation(bearingQuat(mount.bearingDeg)).setExtras(extras))
  }
}
