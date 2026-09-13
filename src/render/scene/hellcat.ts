import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'

/**
 * A deliberately simple low-poly F6F, built in code.
 *
 * Master spec §10 allows either verifiable-licence assets or deliberately
 * simple models built by hand; this is the second, so there is no provenance
 * to audit and no ASSETS.md row.
 *
 * Dimensions and where each came from:
 * - The 13.06 m wingspan (the `wing` box's z-size below) is
 *   `content/aircraft/f6f-hellcat.json`'s `geometry.wingSpanM`, read directly
 *   off that file 2026-09-13 -- not invented, since scale is what makes
 *   altitude and speed readable against the water and markers.
 * - The ~10.2 m fuselage length (the `fuselage` box's x-size) is NOT in that
 *   content file: `geometry` there holds only `wingAreaM2` and `wingSpanM`
 *   (confirmed by reading `src/sim/flight/schema.ts`'s `AircraftSpecObject`,
 *   which has no length field at all). It is the real F6F-5's published
 *   overall length, ~33 ft 7 in / 10.24 m, rounded for this low-poly build;
 *   it is a historical-reference figure, not a project-content one, and is
 *   recorded here as such rather than misattributed to the JSON.
 *
 * Body frame matches sim/: +X forward, +Y up, +Z right.
 */
export function createHellcat(): { root: Object3D; prop: Object3D } {
  const root = new Group()
  const paint = new MeshStandardMaterial({ color: 0x2f4f6a, roughness: 0.7 })
  const dark = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })

  const fuselage = new Mesh(new BoxGeometry(10.2, 1.5, 1.4), paint)
  root.add(fuselage)

  const wing = new Mesh(new BoxGeometry(2.6, 0.28, 13.06), paint)
  wing.position.set(0.4, -0.25, 0)
  root.add(wing)

  const tailplane = new Mesh(new BoxGeometry(1.3, 0.2, 5.2), paint)
  tailplane.position.set(-4.4, 0.25, 0)
  root.add(tailplane)

  const fin = new Mesh(new BoxGeometry(1.3, 2.0, 0.2), paint)
  fin.position.set(-4.6, 1.1, 0)
  root.add(fin)

  const canopy = new Mesh(new BoxGeometry(2.2, 0.7, 1.0), dark)
  canopy.position.set(0.9, 0.95, 0)
  root.add(canopy)

  const spinner = new Mesh(new CylinderGeometry(0.35, 0.5, 0.8, 12), dark)
  spinner.rotation.z = Math.PI / 2
  spinner.position.set(5.1, 0, 0)
  root.add(spinner)

  // Separate, so the frame loop can spin it with throttle. This confirms
  // throttle reaches the frame state, not that it reaches the simulation --
  // a bug that stops `frame.controls` from reaching `advance` would leave
  // the prop spinning at the correct rate with nothing driving the
  // aeroplane (Task 13 review, measured 2026-09-13).
  const prop = new Mesh(new BoxGeometry(0.12, 3.9, 0.3), dark)
  prop.position.set(5.4, 0, 0)
  root.add(prop)

  return { root, prop }
}
