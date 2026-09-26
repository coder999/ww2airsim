import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Vector3, type Object3D } from 'three'
import type { ShipSpec } from '../../sim/world/ships.js'
import { createEngineSmoke } from './smoke.js'
import { disposeMeshTree } from '../models/dispose.js'
import type { ModelInstance } from '../models/modelCache.js'
import { SHIP_PALETTES } from './shipPalette.js'

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
 * frame; `setDamage` sinks, lists and smokes an inner `hull group`; `dispose`
 * frees what this view owns. `model` is the registry id drawn, or null for
 * the procedural boxes.
 */
export interface ShipView {
  readonly root: Object3D
  readonly model: string | null
  setDamage(fire: number, sinkingFraction: number): void
  /** Idempotent. A model view RELEASES its shared instance; it never disposes it (modelCache.ts). */
  dispose(): void
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
 * The part of a view both paths share: the damage smoke at `smokeAt`, the
 * sink depth from the hull's own top, `receiveShadow` on every mesh (Plan
 * 16b), and `setDamage`. The list is a roll about the keel (+x), 8 degrees to
 * a fixed side: before S1 it was `rotation.z`, which with the bow on +x is a
 * bow-down trim, not the list the strike design §4 specifies (ship-models
 * spec §1, §6).
 */
function finishView(root: Group, hullGroup: Group, smokeAt: { x: number; y: number; z: number }, model: string | null, release: () => void): ShipView {
  const sinkDepthM = new Box3().setFromObject(hullGroup).max.y + SINK_MARGIN_M
  const smoke = createEngineSmoke()
  smoke.object.name = 'ship smoke'
  // Scaled up: the airplane version is authored at airframe scale, and a ship's stack is an order of magnitude bigger.
  smoke.object.scale.setScalar(5)
  smoke.object.position.set(smokeAt.x, smokeAt.y, smokeAt.z)
  hullGroup.add(smoke.object)
  root.traverse((o) => { o.receiveShadow = true }) // Plan 16b, see hellcat.ts
  let disposed = false
  return {
    root,
    model,
    setDamage(fire: number, sinkingFraction: number): void {
      const sinking = Math.min(1, Math.max(0, sinkingFraction))
      hullGroup.position.y = -sinking * sinkDepthM
      hullGroup.rotation.x = -sinking * (LIST_DEG * Math.PI / 180)
      root.visible = sinking < 1
      smoke.set(1 - Math.min(1, Math.max(0, fire)), sinking >= 1)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      hullGroup.remove(smoke.object)
      disposeMeshTree(smoke.object)
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
  // Damaged-fire smoke, reusing `smoke.ts`'s existing engine-smoke curve
  // (`createEngineSmoke`/`smokeAppearance`) rather than a second particle
  // implementation: `fire` (0..1, `ShipDamage.fire`) plays the role
  // `engineHealth` plays for an airplane, inverted (fire is already a
  // damage fraction, not a health one).
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
 * same URL. The trap band and the smoke are this view's own, and are
 * disposed with it; the instance is released.
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
  hullGroup.add(instance.root)
  if (band) hullGroup.add(band)
  return finishView(root, hullGroup, smokeAt, modelId, () => {
    if (band) disposeMeshTree(band)
    instance.release()
  })
}

/**
 * The sim-world height of the topmost rendered surface of `view` straight below
 * each point, or null where the ray misses it (ship-models spec §9: the Tier 2
 * proof that what the eye lands on is what the sim rests the wheels on, in the
 * real renderer and not only in Node math). `'ship'` points are in the ship's
 * own frame (+x bow, midships 0); `'world'` points are world x, z. The smoke
 * plume is not a surface and is skipped.
 */
export function probeShipSurface(view: ShipView, points: readonly { readonly x: number; readonly z: number }[], space: 'ship' | 'world'): (number | null)[] {
  view.root.updateWorldMatrix(true, true)
  const hullGroup = view.root.getObjectByName('hull group')
  if (!hullGroup) return points.map(() => null)
  const targets = hullGroup.children.filter((c) => c.name !== 'ship smoke')
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
