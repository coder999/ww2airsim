import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import type { ShipSpec } from '../../sim/world/ships.js'
import { createEngineSmoke } from './smoke.js'

/** A fixed list angle once a hull is taking on water, degrees (Plan 6b Task
 *  8, spec §4). Always the same side -- a ship that could list either way
 *  randomly would look like it was rocking, not sinking. */
const LIST_DEG = 8

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
export function createShipMesh(spec: ShipSpec): { readonly root: Object3D; setDamage(fire: number, sinkingFraction: number): void } {
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
  const grey = new MeshStandardMaterial({ color: 0x5c6670, roughness: 0.8 })
  const deck = new MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.9 })
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
    if (spec.trapZone !== undefined) {
      const { fromSternM, toSternM } = spec.trapZone
      const band = new Mesh(new BoxGeometry(toSternM - fromSternM, 0.05, widthM * 0.9), new MeshStandardMaterial({ color: 0x6b7480, roughness: 0.9 }))
      band.name = 'trap zone'
      band.position.set(-lengthM / 2 + (fromSternM + toSternM) / 2, heightM + 0.025, 0)
      hullGroup.add(band)
    }
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
  // damage fraction, not a health one). Scaled up: the airplane version is
  // authored at airframe scale, and a ship's stack is an order of magnitude
  // bigger.
  const smoke = createEngineSmoke()
  smoke.object.name = 'ship smoke'
  smoke.object.scale.setScalar(5)
  smoke.object.position.set(smokeOrigin.x, smokeOrigin.y, smokeOrigin.z)
  hullGroup.add(smoke.object)
  root.traverse((o) => { o.receiveShadow = true }) // Plan 16b, see hellcat.ts
  return {
    root,
    /**
     * Sinks `hullGroup` by `sinkingFraction * hullHeightM`, lists it 8
     * degrees to a fixed side (spec §4), hides `root` entirely once
     * `sinkingFraction >= 1`, and updates the fire smoke -- ship.ts's own
     * per-frame update closure, the pattern Task 8's structure update
     * follows too.
     */
    setDamage(fire: number, sinkingFraction: number): void {
      const sinking = Math.min(1, Math.max(0, sinkingFraction))
      hullGroup.position.y = -sinking * hullHeightM
      hullGroup.rotation.z = -sinking * (LIST_DEG * Math.PI / 180)
      root.visible = sinking < 1
      smoke.set(1 - Math.min(1, Math.max(0, fire)), sinking >= 1)
    },
  }
}
