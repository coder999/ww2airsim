import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import { disposeMeshTree } from '../models/dispose.js'
import type { ModelInstance } from '../models/modelCache.js'
import { SHIP_PALETTES } from './shipPalette.js'
import { createEnsign } from './ensign.js'

/** A fixed list angle once a hull is taking on water, degrees (Plan 6b Task
 *  8, spec §4). Always the same side -- a ship that could list either way
 *  randomly would look like it was rocking, not sinking. */
const LIST_DEG = 8

/** How far below its own top a sinking ship goes before `root` hides, meters (ship-models spec §6). */
const SINK_MARGIN_M = 2

/** The trap band's color, and its thickness: it sits 0.025 m proud of the deck (Plan 8). */
const TRAP_BAND_COLOR = 0x6b7480
const TRAP_BAND_THICKNESS_M = 0.05

/**
 * One ship as the renderer sees it: `root` is what `main.ts` poses each
 * frame; `setDamage` sinks and lists an inner `hull group`; `dispose` frees
 * what this view owns. `model` is the registry id drawn, or null for the
 * procedural boxes.
 */
export interface ShipView {
  readonly root: Object3D
  readonly model: string | null
  /** An empty marker at the stack/SmokeOrigin, child of the hull group, so
   *  it sinks and lists with the hull. fx reads it every frame (E1 R13). */
  readonly smokeOrigin: Object3D
  /** `listRad`: a flooded hull's list, positive to starboard (`floodListRad`, D3 T3). */
  setDamage(fire: number, sinkingFraction: number, listRad?: number): void
  /** Every instanced gun mount (Track M, M1): one per armament locator with a kit, bow to stern
   *  within Turret / HeavyAA / LightAA. Empty for the boxes. Nothing trains them until M3. */
  readonly mounts: readonly ShipMountView[]
  /** Idempotent. A model view RELEASES its shared instance; it never disposes it (modelCache.ts). */
  dispose(): void
}

export interface ShipMountView {
  /** The locator's name, e.g. `Turret2`. */
  readonly name: string
  readonly kit: string
  /** Turns this mount alone about its own vertical axis, radians from its rest bearing, positive to port (three's +y). */
  setTraining(rad: number): void
  /** The kit's top elevation, radians (M1b); 0 for a kit whose guns are not a separate part. */
  readonly maxElevationRad: number
  /** Raises this mount's guns alone about their trunnion, radians above level, clamped to [0, maxElevationRad]. */
  setElevation(rad: number): void
}

/** A locator: an armament entry, or one gun of a gallery (`LightAA5_3`, M1b). */
const MOUNT_NAME = /^(Turret|HeavyAA|LightAA)\d+(_\d+)?$/
const KIT_PREFIX = 'Kit_'
const GUNS_SUFFIX = '_Guns'

/**
 * The instanced mount kit (M1 plan, Ruling R2): each `Kit_<kit>` node in the glb
 * becomes one InstancedMesh per mesh under it, with an instance at every
 * locator whose `userData.kit` names it; the kit node itself leaves the scene.
 * A kit costs one draw however many mounts use it. Geometry and materials stay
 * the cache's (shared, never mutated); the instance buffers are this view's.
 */
function instanceMounts(root: Object3D): { mounts: ShipMountView[]; dispose: () => void } {
  root.updateMatrixWorld(true)
  const kits = new Map<string, Object3D>()
  const locators: Object3D[] = []
  root.traverse((o) => {
    if (o.name.startsWith(KIT_PREFIX) && !o.name.endsWith(GUNS_SUFFIX)) kits.set(o.name.slice(KIT_PREFIX.length), o)
    else if (MOUNT_NAME.test(o.name)) locators.push(o)
  })
  const rootInverse = root.matrixWorld.clone().invert()
  const mounts: ShipMountView[] = []
  const owned: InstancedMesh[] = []
  for (const [kit, kitNode] of kits) {
    const users = locators.filter((l) => l.userData['kit'] === kit)
    if (users.length === 0) throw new Error(`kit ${kit} has no locator`)
    const kitInverse = kitNode.matrixWorld.clone().invert()
    // M1b: the guns child elevates about its trunnion (kit-local); everything else only trains.
    const gunsNode = kitNode.children.find((c) => c.name.endsWith(GUNS_SUFFIX)) ?? null
    const trunnion = (gunsNode?.userData['trunnion'] as number[] | undefined) ?? [0, 0, 0]
    const maxElevationRad = (gunsNode?.userData['maxElevationRad'] as number | undefined) ?? 0
    const parts: { mesh: InstancedMesh; rel: Matrix4; guns: boolean }[] = []
    kitNode.traverse((o) => {
      if (!(o instanceof Mesh)) return
      let guns = false
      for (let p: Object3D | null = o; p !== null && p !== kitNode.parent; p = p.parent) if (p === gunsNode) guns = true
      const mesh = new InstancedMesh(o.geometry, o.material, users.length)
      mesh.name = `${KIT_PREFIX}${kit}${guns ? GUNS_SUFFIX : ''} instances`
      mesh.frustumCulled = false // ponytail: instances span the hull; per-instance bounds when a ship's draw time matters
      parts.push({ mesh, rel: kitInverse.clone().multiply(o.matrixWorld), guns })
    })
    kitNode.removeFromParent()
    const toTrunnion = new Matrix4().makeTranslation(trunnion[0]!, trunnion[1]!, trunnion[2]!)
    const fromTrunnion = new Matrix4().makeTranslation(-trunnion[0]!, -trunnion[1]!, -trunnion[2]!)
    users.forEach((loc, i) => {
      const at = rootInverse.clone().multiply(loc.matrixWorld)
      const turn = new Matrix4(), raise = new Matrix4(), m = new Matrix4()
      let training = 0, elevation = 0
      const pose = (): void => {
        turn.makeRotationY(training)
        raise.copy(toTrunnion).multiply(m.makeRotationZ(elevation)).multiply(fromTrunnion)
        for (const p of parts) {
          m.copy(at).multiply(turn)
          if (p.guns) m.multiply(raise)
          p.mesh.setMatrixAt(i, m.multiply(p.rel)); p.mesh.instanceMatrix.needsUpdate = true
        }
      }
      pose()
      mounts.push({
        name: loc.name, kit, maxElevationRad,
        setTraining: (rad) => { training = rad; pose() },
        setElevation: (rad) => { elevation = Math.min(Math.max(rad, 0), maxElevationRad); pose() },
      })
    })
    for (const p of parts) { root.add(p.mesh); owned.push(p.mesh) }
  }
  const order = (n: string): number => {
    const [, list, k, g] = /^(\D+)(\d+)(?:_(\d+))?$/.exec(n)!
    return (list === 'Turret' ? 0 : list === 'HeavyAA' ? 1 : 2) * 1e6 + Number(k) * 1e3 + Number(g ?? 0)
  }
  mounts.sort((a, b) => order(a.name) - order(b.name))
  return { mounts, dispose: () => { for (const m of owned) { m.removeFromParent(); m.dispose() } } }
}

/** The view's smoke origin in sim world metres. `worldOffset` must be what
 *  `scene.position` holds this frame (main.ts sets it before posing ships). */
export function smokeOriginWorld(view: ShipView, worldOffset: { readonly x: number; readonly y: number; readonly z: number }): Vec3 {
  view.smokeOrigin.updateWorldMatrix(true, false)
  const e = view.smokeOrigin.matrixWorld.elements
  return { x: e[12]! - worldOffset.x, y: e[13]! - worldOffset.y, z: e[14]! - worldOffset.z }
}

/** The carrier's trap band, fromSternM..toSternM along a deck `lengthM` long, `halfWidthM` either side of the centerline. */
function trapBand(spec: ShipSpec, halfWidthM: number): Mesh | null {
  if (spec.flightDeck === undefined || spec.trapZone === undefined) return null
  const { lengthM, heightM } = spec.flightDeck
  const { fromSternM, toSternM } = spec.trapZone
  const band = new Mesh(new BoxGeometry(toSternM - fromSternM, TRAP_BAND_THICKNESS_M, 2 * halfWidthM), new MeshStandardMaterial({ color: TRAP_BAND_COLOR, roughness: 0.9 }))
  band.name = 'trap zone'
  band.position.set(-lengthM / 2 + (fromSternM + toSternM) / 2, heightM + TRAP_BAND_THICKNESS_M / 2, 0)
  return band
}

/**
 * The part of a view both paths share: the sink depth from the hull's own
 * top, `receiveShadow` on every mesh (Plan 16b), and `setDamage`. The list is
 * a roll about the keel (+x), 8 degrees to a fixed side: before S1 it was
 * `rotation.z`, which with the bow on +x is a bow-down trim, not the list the
 * strike design §4 specifies (ship-models spec §1, §6). The fire is E1's
 * `ship.fire`, rising from `smokeOrigin` -- this view draws no smoke of its
 * own.
 */
function finishView(root: Group, hullGroup: Group, smokeAt: { x: number; y: number; z: number }, model: string | null, release: () => void, mounts: readonly ShipMountView[] = []): ShipView {
  const sinkDepthM = new Box3().setFromObject(hullGroup).max.y + SINK_MARGIN_M
  const smokeOrigin = new Object3D()
  smokeOrigin.name = 'smoke origin'
  smokeOrigin.position.set(smokeAt.x, smokeAt.y, smokeAt.z)
  hullGroup.add(smokeOrigin)
  root.traverse((o) => { o.receiveShadow = true }) // Plan 16b, see hellcat.ts
  let disposed = false
  return {
    root,
    model,
    smokeOrigin,
    mounts,
    setDamage(fire: number, sinkingFraction: number, listRad = 0): void {
      const sinking = Math.min(1, Math.max(0, sinkingFraction))
      hullGroup.position.y = -sinking * sinkDepthM
      // Bow on local +x, starboard local +z: a positive rotation.x lays the masts to starboard. A
      // flooded hull lists toward its flooded side (D3 T3) and goes down the way it already leans.
      const leans = listRad > 0 ? 1 : -1
      hullGroup.rotation.x = listRad + leans * sinking * (LIST_DEG * Math.PI / 180)
      root.visible = sinking < 1
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      release()
    },
  }
}

/**
 * A ship as boxes, scaled from its class record. Bow along local +x, the
 * waterline at local y = 0, so `main.ts` poses it with the same yaw the
 * parked airplane uses (`pi/2 - headingRad` about +y, `parkedAttitude` in
 * `src/sim/world/airfields.ts`) and sets `position.y` to the state's
 * `SEA_LEVEL_M`. Original geometry, AGPL (ASSETS.md).
 *
 * Every dimension that the record carries comes from the record, including
 * the carrier's `flightDeck` and `trapZone` blocks (Plan 8); what is
 * hardcoded is what no record has: the draft, the island's size and where
 * the superstructure sits. Those are shape, not data, and a `draft` field
 * invented here would look like a sourced figure.
 *
 * Deliberately `MeshStandardMaterial`, not the `MeshStandardNodeMaterial`
 * the terrain and the strip use: these hulls need no TSL node graph, and a
 * plain material is what `hellcat.ts` already builds its airframe from.
 */
export function createShipMesh(spec: ShipSpec): ShipView {
  if (spec.role === 'carrier' && spec.flightDeck === undefined) {
    throw new Error(`Carrier ${spec.id} is missing flightDeck`)
  }
  // `root` is the object `main.ts` poses every frame from the ship's
  // kinematic position and heading (`current.shipPoses.forEach`), so
  // `setDamage`'s sink/list below moves `hullGroup`, an inner child, instead
  // -- writing to `root.position`/`root.rotation` here would be overwritten
  // by the very next frame's pose (Plan 6b Task 8).
  const root = new Group()
  root.name = `${spec.name} hull`
  const hullGroup = new Group()
  hullGroup.name = 'hull group'
  root.add(hullGroup)
  const paint = SHIP_PALETTES['usn-1944']
  const grey = new MeshStandardMaterial({ color: paint.hull, roughness: 0.8 })
  const deck = new MeshStandardMaterial({ color: paint.flightDeck, roughness: 0.9 })
  // An ESTIMATE, and the reason it is not in the content record: neither
  // class's draft is sourced anywhere in this repository, and the hull is a
  // box either way. It decides only how much of the hull sits below the
  // waterline, which nothing but the eye reads.
  const draft = spec.role === 'carrier' ? 8.5 : 4
  const hullHeightM = spec.deckHeightM + draft
  const hull = new Mesh(new BoxGeometry(spec.lengthM, hullHeightM, spec.beamM), grey)
  hull.position.set(0, (spec.deckHeightM - draft) / 2, 0)
  hullGroup.add(hull)
  let smokeOrigin = { x: -spec.lengthM * 0.05, y: spec.deckHeightM + 12, z: 0 }
  if (spec.role === 'carrier' && spec.flightDeck !== undefined) {
    // What the eye lands on is what the sim thinks is there (Plan 8): the
    // slab's TOP is at `flightDeck.heightM`, the exact `Deck.center.y` the
    // ground constraint rests the wheels on, with the sourced 862 x 108 ft
    // planform rather than the hull's maximum beam.
    const { lengthM, widthM, heightM } = spec.flightDeck
    const slabM = 1.2
    const flightDeck = new Mesh(new BoxGeometry(lengthM, slabM, widthM), deck)
    flightDeck.name = 'flight deck'
    flightDeck.position.set(0, heightM - slabM / 2, 0)
    hullGroup.add(flightDeck)
    const band = trapBand(spec, widthM * 0.45)
    if (band) hullGroup.add(band)
    const island = new Mesh(new BoxGeometry(spec.lengthM * 0.12, 14, 6), grey)
    // Keep the island outboard of the usable 32.9 m flight deck.
    island.position.set(spec.lengthM * 0.05, heightM + 7, widthM / 2 + 3)
    hullGroup.add(island)
    smokeOrigin = { x: island.position.x, y: heightM + 14, z: island.position.z }
  } else if (spec.role === 'merchant') {
    // Spec §2.2: "the merchant gets a taller box amidships ... so it is not
    // a second destroyer at a glance" -- named distinctly from the escort's
    // `superstructure` below (both are boxes; this is the one that makes a
    // merchant read as a merchant), taller, and centred amidships (x = 0)
    // rather than offset toward the bow the way the escort's is.
    const superstructure = new Mesh(new BoxGeometry(spec.lengthM * 0.22, 11, spec.beamM * 0.6), grey)
    superstructure.name = 'merchant superstructure'
    superstructure.position.set(0, spec.deckHeightM + 5.5, 0)
    hullGroup.add(superstructure)
    smokeOrigin = { x: 0, y: spec.deckHeightM + 11 + 3, z: 0 }
  } else {
    const superstructure = new Mesh(new BoxGeometry(spec.lengthM * 0.3, 7, spec.beamM * 0.7), grey)
    superstructure.name = 'superstructure'
    superstructure.position.set(spec.lengthM * 0.1, spec.deckHeightM + 3.5, 0)
    hullGroup.add(superstructure)
    const stack = new Mesh(new BoxGeometry(3, 8, 3), deck)
    stack.position.set(-spec.lengthM * 0.05, spec.deckHeightM + 7 + 4, 0)
    hullGroup.add(stack)
    smokeOrigin = { x: stack.position.x, y: spec.deckHeightM + 7 + 8 + 2, z: 0 }
  }
  // Damaged-fire smoke is E1's `ship.fire`, rising from `smokeOrigin` -- this
  // view draws none of its own.
  return finishView(root, hullGroup, smokeOrigin, null, () => { disposeMeshTree(root) })
}

/**
 * A ship drawn from its committed model (ship-models spec §3.3): `instance`
 * is this ship's own clone from the shared model cache, already fitted to
 * `spec` at build time, so it hangs in `hull group` with no transform: bow
 * +x, waterline y = 0. The glb carries what the runtime needs (§4.6): the
 * `SmokeOrigin` node, and on a carrier the `TrapBand` node whose
 * `userData.halfWidthM` keeps the band clear of the island. A missing node
 * throws, naming it, and the loader falls back to the boxes loudly.
 *
 * No material is touched: they are shared with every other instance of the
 * same URL. The trap band is this view's own, and is disposed with it; the
 * instance is released.
 */
export function createShipView(spec: ShipSpec, modelId: string, instance: ModelInstance): ShipView {
  const root = new Group()
  root.name = `${spec.name} hull`
  const hullGroup = new Group()
  hullGroup.name = 'hull group'
  root.add(hullGroup)
  const smokeAt = instance.node('SmokeOrigin').position.clone()
  let band: Mesh | null = null
  if (spec.flightDeck !== undefined && spec.trapZone !== undefined) {
    const half = instance.node('TrapBand').userData['halfWidthM']
    if (typeof half !== 'number' || !(half > 0)) throw new Error(`ship ${spec.id}: model ${modelId}'s TrapBand has no positive userData.halfWidthM`)
    band = trapBand(spec, half)
  }
  const kit = instanceMounts(instance.root)
  hullGroup.add(instance.root)
  if (band) hullGroup.add(band)
  const ensign = createEnsign(spec) // its texture is shared per flag: dispose only the geometry and material
  if (ensign) hullGroup.add(ensign)
  return finishView(root, hullGroup, smokeAt, modelId, () => {
    if (band) disposeMeshTree(band)
    if (ensign) { ensign.geometry.dispose(); ensign.material.dispose() }
    kit.dispose()
    instance.release()
  }, kit.mounts)
}

/**
 * The sim-world height of the topmost rendered surface of `view` straight below
 * each point, or null where the ray misses it (ship-models spec §9: the E2E
 * proof that what the eye lands on is what the sim rests the wheels on, in the
 * real renderer and not only in Node math). `'ship'` points are in the ship's
 * own frame (+x bow, midships 0); `'world'` points are world x, z. The smoke
 * origin marker and the ensign are not surfaces and are skipped.
 */
export function probeShipSurface(view: ShipView, points: readonly { readonly x: number; readonly z: number }[], space: 'ship' | 'world'): (number | null)[] {
  view.root.updateWorldMatrix(true, true)
  const hullGroup = view.root.getObjectByName('hull group')
  if (!hullGroup) return points.map(() => null)
  const targets = hullGroup.children.filter((c) => c.name !== 'smoke origin' && c.name !== 'ensign')
  const above = new Box3().setFromObject(hullGroup).max.y + 10
  const ray = new Raycaster()
  const down = new Vector3(0, -1, 0)
  // The sim's world is the root's PARENT frame: in the game that is `scene`,
  // which main.ts shifts to minus the eye every frame (the floating origin),
  // so three's world coordinates are not sim metres. Points go in through the
  // parent's matrix and heights come back out through its inverse. The shift
  // is a pure translation, so "down" is the same in both frames.
  const simToThree = view.root.parent?.matrixWorld.clone() ?? new Matrix4()
  const threeToSim = simToThree.clone().invert()
  return points.map((p) => {
    const origin = new Vector3(p.x, 0, p.z).applyMatrix4(space === 'ship' ? view.root.matrixWorld : simToThree)
    origin.y = above
    ray.set(origin, down)
    const hit = ray.intersectObjects(targets, true)[0]
    return hit ? hit.point.clone().applyMatrix4(threeToSim).y : null
  })
}
