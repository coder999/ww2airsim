// tools/models/stages/shipMounts.ts
import type { Document, Node, Primitive } from '@gltf-transform/core'
import { compactPrimitive, getBounds, transformMesh } from '@gltf-transform/functions'
import type { ShipArmament, ShipMount, ShipSpec } from '../../../src/sim/world/ships.js'
import { onlyScene, ownMesh } from '../document.js'
import type { ShipEntry } from '../manifest.js'
import { generateKit, GENERATED_KITS } from './mountKits.js'
import { carve, ensureIndices } from './geometry.js'
import { triangleShells } from './split.js'
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
/** A kit's guns, the part that elevates (M1b, Ruling B4): a child of `Kit_<kit>`, in its frame. */
export const GUNS_SUFFIX = '_Guns'

/** Light AA (40 mm and below) is drawn this much over true size so it reads from the air (M1b, Ruling B3). */
export const LIGHT_AA_SCALE = 1.3

/**
 * Each kit's maximum elevation, degrees (M1b, Ruling B4). ESTIMATES from navweaps.com's gun pages
 * (read 2026-10-09) unless noted; a kit in use with no entry fails the build.
 */
export const MAX_ELEVATION_DEG: Readonly<Record<string, number>> = {
  'mount-20mm-single': 90, // Oerlikon Mk 4: +90
  'mount-25mm-single': 85, // Type 96: +85
  'mount-25mm-triple': 85,
  'mount-25mm-triple-shielded': 85,
  'mount-40mm-quad': 90, // Bofors Mk 2: +90
  'mount-40mm-twin': 90, // Bofors Mk 1: +90
  'mount-5in38-twin': 85, // 5"/38 Mk 28/Mk 38: +85
  'mount-5in38-single': 85, // Mk 30: +85
  'mount-5in38-single-open': 85, // Mk 24 open (Yorktown-class): +85
  'mount-127mm-twin-ijn': 90, // 12.7 cm/40 Type 89 (A1): +90
  'turret-127mm-twin': 55, // 12.7 cm/50 3rd Year Type, Model C (Kagero; Shiratsuyu's Model B also +55)
  'turret-6in-triple': 60, // 6"/47 Mk 16 (Cleveland): +60
  'turret-8in-twin': 55, // 20.3 cm/50 3rd Year No. 2, Model E2 (Mogami, 1939 refit): +55
  'turret-8in-twin-raised': 55,
  'turret-14in-triple': 30, // 14"/45 (Pennsylvania after her 1929-31 refit): +30
  'turret-155mm-triple': 75, // 15.5 cm/60 3rd Year Type, Yamato's secondaries: +75
  'turret-18in-triple': 45, // 46 cm/45 Type 94: +45
}

/** One drawn gun position: an armament entry, or one gun of a gallery entry (M1b, Ruling B2),
 *  named `LightAA<k>_<i>` bow to stern, standing on the surface under it. */
export interface PlacedMount { readonly name: string; readonly mount: ShipMount; readonly aa: 'heavy' | null }

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

/** Every drawn gun position. A gallery's guns spread evenly over its `run`, bow to stern, each
 *  standing on the surface under it, which must be within MOUNT_SLACK_M of the entry's height. */
export function placedMounts(doc: Document, a: ShipArmament, problems: string[]): PlacedMount[] {
  const soup = documentSoup(doc)
  return namedMounts(a).flatMap(({ name, mount, aa }): PlacedMount[] => {
    if (mount.run === undefined) return [{ name, mount, aa }]
    const n = mount.barrels
    return Array.from({ length: n }, (_, i) => {
      const x = mount.x + mount.run! / 2 - (i * mount.run!) / (n - 1)
      const under = surfaceBelow(soup, x, mount.z, mount.y + MOUNT_SLACK_M)
      if (under === null || Math.abs(under - mount.y) > MOUNT_SLACK_M) problems.push(`${name} gun ${i + 1} at [${x.toFixed(2)}, ${mount.z}] has no deck within ${MOUNT_SLACK_M} m of y ${mount.y} (${under === null ? 'nothing' : under.toFixed(2)}): shorten its run`)
      const y = under ?? mount.y
      const { run, ...rest } = mount
      void run
      return { name: `${name}_${i + 1}`, mount: { ...rest, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, barrels: 1 }, aa }
    })
  })
}

/** Whether a shell (its kit-local bounds) is a gun: long and thin along its own fore-aft, pointing
 *  forward of its mount, no steeper than 45 degrees. A gunhouse, a shield or a rangefinder is not. */
function isGunShell(lo: readonly number[], hi: readonly number[]): boolean {
  const dx = hi[0]! - lo[0]!, dy = hi[1]! - lo[1]!, dz = hi[2]! - lo[2]!, along = Math.hypot(dx, dy)
  return along >= 0.8 && dz * 3 <= along && dx >= dy && hi[0]! > 0
}

/** Moves a carved kit's gun shells (its kit-local mesh) into a `_Guns` node. Returns that node and the
 *  trunnion (the guns' rearmost x, at their mean height, on the centerline), or null if it found none. */
function splitCarvedGuns(doc: Document, kitNode: Node, kit: string): { guns: Node; trunnion: [number, number, number] } | null {
  const mesh = kitNode.getMesh()!
  const out = doc.createMesh(`${KIT_PREFIX}${kit}${GUNS_SUFFIX}`)
  let minX = Infinity, ySum = 0, shells = 0
  for (const prim of [...mesh.listPrimitives()]) {
    const idx = ensureIndices(doc, prim), pos = prim.getAttribute('POSITION')!.getArray()!
    const shell = triangleShells(idx, pos)
    const lo = new Map<number, number[]>(), hi = new Map<number, number[]>()
    shell.forEach((root, t) => {
      for (let k = 0; k < 3; k++) {
        const v = idx[3 * t + k]!
        const l = lo.get(root) ?? [Infinity, Infinity, Infinity], h = hi.get(root) ?? [-Infinity, -Infinity, -Infinity]
        for (let a = 0; a < 3; a++) { l[a] = Math.min(l[a]!, pos[3 * v + a]!); h[a] = Math.max(h[a]!, pos[3 * v + a]!) }
        lo.set(root, l); hi.set(root, h)
      }
    })
    const gun = new Set([...lo.keys()].filter((r) => isGunShell(lo.get(r)!, hi.get(r)!)))
    if (gun.size === 0) continue
    for (const r of gun) { minX = Math.min(minX, lo.get(r)![0]!); ySum += (lo.get(r)![1]! + hi.get(r)![1]!) / 2; shells++ }
    const take: number[] = [], leave: number[] = []
    shell.forEach((root, t) => (gun.has(root) ? take : leave).push(idx[3 * t]!, idx[3 * t + 1]!, idx[3 * t + 2]!))
    out.addPrimitive(carve(doc, prim, Uint32Array.from(take)))
    if (leave.length === 0) { mesh.removePrimitive(prim); prim.dispose() } else {
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(leave)))
      compactPrimitive(prim as Primitive)
    }
  }
  if (shells === 0) { out.dispose(); return null }
  return { guns: doc.createNode(`${KIT_PREFIX}${kit}${GUNS_SUFFIX}`).setMesh(out), trunnion: [minX, ySum / shells, 0] }
}

const scaleMatrix = (k: number): number[] => [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]

/**
 * Before prune: checks every carved node against its spec point, turns each
 * kit's first carved node into `Kit_<kit>` (geometry in kit-local space, node
 * posed at that mount, so the file still shows the gun where it stands), and
 * deletes every other carved copy. Each kit's guns become its `Kit_<kit>_Guns`
 * child, carrying `trunnion` and `maxElevationRad` (M1b); light AA kits scale by
 * LIGHT_AA_SCALE. Returns every drawn position for addMountLocators. Throws,
 * listing every problem.
 */
export function carveMounts(doc: Document, spec: ShipSpec, palette: ShipEntry['palette']): PlacedMount[] {
  if (!spec.armament) return []
  const byName = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n] as const))
  const problems: string[] = []
  const donors = new Map<string, { node: Node; mount: ShipMount }>()
  const doomed: Node[] = []
  for (const { name, mount } of namedMounts(spec.armament)) {
    const node = byName.get(name)
    if (!node) continue
    if (mount.kit === null) { problems.push(`${name} is carved, but its spec entry has a null kit (a fire position with nothing drawn)`); continue }
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
  // Every mount, carved, generated or a fire position, stands on something: a surface under
  // its point within the slack, so a mistyped height never leaves a gun floating or buried.
  const soup = documentSoup(doc)
  for (const { name, mount } of namedMounts(spec.armament)) {
    const under = surfaceBelow(soup, mount.x, mount.z, mount.y + MOUNT_SLACK_M)
    if (under === null || mount.y - under > MOUNT_SLACK_M) problems.push(`${name} at [${mount.x}, ${mount.y}, ${mount.z}] stands on nothing (the surface below is ${under === null ? 'absent' : under.toFixed(2)})`)
  }
  const placed = placedMounts(doc, spec.armament, problems)
  const kits = new Set(namedMounts(spec.armament).flatMap(({ mount }) => (mount.kit === null ? [] : [mount.kit])))
  const light = new Set(spec.armament.lightAA.flatMap((m) => (m.kit === null ? [] : [m.kit])))
  for (const kit of kits) {
    if (!donors.has(kit) && !GENERATED_KITS[kit]) problems.push(`kit "${kit}" has no carved or built node and no generator: name a node after a mount that uses it`)
    if (MAX_ELEVATION_DEG[kit] === undefined) problems.push(`kit "${kit}" has no MAX_ELEVATION_DEG entry`)
  }
  if (problems.length) throw new Error(`ship ${spec.id} mounts: ${problems.join('; ')}`)
  const finish = (kit: string, node: Node, guns: { guns: Node; trunnion: [number, number, number] } | null, first: ShipMount): void => {
    node.setName(`${KIT_PREFIX}${kit}`).setTranslation([first.x, first.y, first.z]).setRotation(bearingQuat(first.bearingDeg)).setScale([1, 1, 1])
    node.setExtras({ ...node.getExtras(), kit })
    const k = light.has(kit) ? LIGHT_AA_SCALE : 1
    if (k !== 1) transformMesh(node.getMesh()!, scaleMatrix(k) as unknown as Parameters<typeof transformMesh>[1])
    if (!guns) return
    if (k !== 1) transformMesh(guns.guns.getMesh()!, scaleMatrix(k) as unknown as Parameters<typeof transformMesh>[1])
    const t = guns.trunnion.map((v) => Math.round(v * k * 1000) / 1000)
    guns.guns.setExtras({ trunnion: t, maxElevationRad: MAX_ELEVATION_DEG[kit]! * Math.PI / 180 })
    node.addChild(guns.guns)
  }
  for (const [kit, { node, mount }] of [...donors]) {
    // The node carries a translation only (normalize, then shipFit's bake).
    transformMesh(ownMesh(doc, node)!, toKitLocal(mount, node.getTranslation()) as unknown as Parameters<typeof transformMesh>[1])
    const guns = splitCarvedGuns(doc, node, kit)
    // M1b ruling-by-default (2026-10-09): a carved kit whose guns are welded into one shell with the
    // mount cannot elevate, so its generated kit replaces it where there is one.
    if (!guns && GENERATED_KITS[kit]) { donors.delete(kit); doomed.push(node); continue }
    finish(kit, node, guns, mount)
  }
  for (const node of doomed) node.dispose()
  // A kit the model has no geometry for is generated, posed at its first mount (mountKits.ts).
  for (const kit of kits) {
    if (donors.has(kit)) continue
    const first = namedMounts(spec.armament).find((m) => m.mount.kit === kit)!.mount
    const g = generateKit(doc, kit, roleMaterial(doc, palette, 'fitting'))
    finish(kit, g.mount, { guns: g.guns, trunnion: g.trunnion }, first)
    onlyScene(doc).addChild(g.mount)
  }
  return placed
}

/** After prune (which drops empty leaves): one empty locator per drawn position, at the scene root. */
export function addMountLocators(doc: Document, placed: readonly PlacedMount[]): void {
  const scene = onlyScene(doc)
  for (const { name, mount, aa } of placed) {
    const extras: Record<string, unknown> = { kit: mount.kit, barrels: mount.barrels }
    if (name.startsWith('Turret')) extras['aa'] = aa
    scene.addChild(doc.createNode(name).setTranslation([mount.x, mount.y, mount.z]).setRotation(bearingQuat(mount.bearingDeg)).setExtras(extras))
  }
}
