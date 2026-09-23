import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'

/**
 * Rack and rail offsets, body-frame metres, mirrored from
 * `content/aircraft/f6f-hellcat.json`'s `stores.racks`/`stores.rails`
 * (read 2026-09-22) exactly the way this file already mirrors that content's
 * `geometry.wingSpanM` into the wing box above -- hardcoded because this
 * module is hand-authored low-poly geometry with no content-loading path of
 * its own, not read from the file at runtime. Order matches content order:
 * racks are [left, right]; rails are [left-1, left-2, left-3, right-1,
 * right-2, right-3], nearest-fuselage first on each side.
 */
const RACK_OFFSETS: readonly { readonly id: string; readonly offset: readonly [number, number, number] }[] = [
  { id: 'left-rack', offset: [0.4, -0.55, -2.6] },
  { id: 'right-rack', offset: [0.4, -0.55, 2.6] },
]
const RAIL_OFFSETS: readonly { readonly id: string; readonly offset: readonly [number, number, number] }[] = [
  { id: 'left-rail-1', offset: [0.4, -0.4, -3.6] },
  { id: 'left-rail-2', offset: [0.4, -0.4, -4.3] },
  { id: 'left-rail-3', offset: [0.4, -0.4, -5.0] },
  { id: 'right-rail-1', offset: [0.4, -0.4, 3.6] },
  { id: 'right-rail-2', offset: [0.4, -0.4, 4.3] },
  { id: 'right-rail-3', offset: [0.4, -0.4, 5.0] },
]
/**
 * The order rails actually empty in, mirroring `src/sim/weapons/combat.ts`'s
 * `railOrder` exactly (not imported: that module is `src/sim/`, this is
 * `src/render/`, and the dependency-cruiser boundary only allows the other
 * direction) -- outermost `|z| offset` first, ties broken by index. Task 6's
 * `releaseRockets` fires two at a time off the front of this order, so
 * `RAIL_DROP_ORDER.slice(0, RAIL_OFFSETS.length - rocketsLeft)` is exactly
 * the set of rails Task 6 has already released.
 */
const RAIL_DROP_ORDER: readonly number[] = RAIL_OFFSETS
  .map((_, i) => i)
  .sort((x, y) => Math.abs(RAIL_OFFSETS[y]!.offset[2]) - Math.abs(RAIL_OFFSETS[x]!.offset[2]) || x - y)

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
export function createHellcat(): { root: Object3D; prop: Object3D; setStores(bombsLeft: number, rocketsLeft: number): void } {
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
  // airplane (Task 13 review, measured 2026-09-13).
  const prop = new Mesh(new BoxGeometry(0.12, 3.9, 0.3), dark)
  prop.position.set(5.4, 0, 0)
  root.add(prop)

  // Stores (Plan 6b Task 8): a squat box per bomb, a slender rotated cylinder
  // per rocket -- shape is a legibility choice, not a claim to model either
  // munition's real profile. Named after their content id so `setStores` (and
  // a test) can address one directly.
  const bombGeometry = new BoxGeometry(1.6, 0.5, 0.5)
  const bombMeshes = RACK_OFFSETS.map(({ id, offset }) => {
    const mesh = new Mesh(bombGeometry, dark)
    mesh.name = id
    mesh.position.set(...offset)
    root.add(mesh)
    return mesh
  })
  const rocketGeometry = new CylinderGeometry(0.09, 0.09, 1.4, 8)
  rocketGeometry.rotateZ(Math.PI / 2)
  const rocketMeshes = RAIL_OFFSETS.map(({ id, offset }) => {
    const mesh = new Mesh(rocketGeometry, dark)
    mesh.name = id
    mesh.position.set(...offset)
    root.add(mesh)
    return mesh
  })

  // Plan 16b: the sun's custom shadow node reaches only receivers (cloudShadow.ts).
  root.traverse((o) => { o.receiveShadow = true })
  return {
    root,
    prop,
    /**
     * Hides the racks/rails Task 6's `stepCombat` has already released, in
     * its exact order (see `RAIL_DROP_ORDER`'s doc comment): bombs left-rack
     * first (array order), rockets outermost-pair-first on each side.
     */
    setStores(bombsLeft: number, rocketsLeft: number): void {
      const droppedBombs = RACK_OFFSETS.length - bombsLeft
      bombMeshes.forEach((mesh, i) => { mesh.visible = i >= droppedBombs })
      const firedRockets = RAIL_OFFSETS.length - rocketsLeft
      const hidden = new Set(RAIL_DROP_ORDER.slice(0, firedRockets))
      rocketMeshes.forEach((mesh, i) => { mesh.visible = !hidden.has(i) })
    },
  }
}
