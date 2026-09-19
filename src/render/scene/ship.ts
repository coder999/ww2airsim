import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import type { ShipSpec } from '../../sim/world/ships.js'

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
export function createShipMesh(spec: ShipSpec): Object3D {
  const root = new Group()
  root.name = `${spec.name} hull`
  const grey = new MeshStandardMaterial({ color: 0x5c6670, roughness: 0.8 })
  const deck = new MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.9 })
  // An ESTIMATE, and the reason it is not in the content record: neither
  // class's draft is sourced anywhere in this repository, and the hull is a
  // box either way. It decides only how much of the hull sits below the
  // waterline, which nothing but the eye reads.
  const draft = spec.role === 'carrier' ? 8.5 : 4
  const hull = new Mesh(new BoxGeometry(spec.lengthM, spec.deckHeightM + draft, spec.beamM), grey)
  hull.position.set(0, (spec.deckHeightM - draft) / 2, 0)
  root.add(hull)
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
    root.add(flightDeck)
    if (spec.trapZone !== undefined) {
      const { fromSternM, toSternM } = spec.trapZone
      const band = new Mesh(new BoxGeometry(toSternM - fromSternM, 0.05, widthM * 0.9), new MeshStandardMaterial({ color: 0x6b7480, roughness: 0.9 }))
      band.name = 'trap zone'
      band.position.set(-lengthM / 2 + (fromSternM + toSternM) / 2, heightM + 0.025, 0)
      root.add(band)
    }
    const island = new Mesh(new BoxGeometry(spec.lengthM * 0.12, 14, 6), grey)
    island.position.set(spec.lengthM * 0.05, heightM + 7, widthM / 2 + 3)
    root.add(island)
  } else if (spec.role === 'carrier') {
    // A carrier record without a flight deck block: the pre-Plan-8 slab.
    const flightDeck = new Mesh(new BoxGeometry(spec.lengthM * 0.98, 1.2, spec.deckWidthM), deck)
    flightDeck.position.set(0, spec.deckHeightM + 0.6, 0)
    root.add(flightDeck)
  } else {
    const superstructure = new Mesh(new BoxGeometry(spec.lengthM * 0.3, 7, spec.beamM * 0.7), grey)
    superstructure.position.set(spec.lengthM * 0.1, spec.deckHeightM + 3.5, 0)
    root.add(superstructure)
    const stack = new Mesh(new BoxGeometry(3, 8, 3), deck)
    stack.position.set(-spec.lengthM * 0.05, spec.deckHeightM + 7 + 4, 0)
    root.add(stack)
  }
  return root
}
