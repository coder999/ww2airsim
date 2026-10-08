// src/render/scene/bayDoors.ts
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Material } from 'three'

/**
 * Bomb-bay doors (C2), drawn in code for every airframe that has them: two plates per bay, each
 * hinged along x at its outboard edge, over a dark plate that reads as the open bay behind them.
 * Procedural rather than modeled, so a Sketchfab download (the B-17, whose raw source is not kept
 * and whose body a rebuild would re-simplify) and a Blender model take the same path.
 * ponytail: flat plates on a curved belly, offset outward so the skin's sag between hinge and keel
 * never pokes through; model them into each glb if a close look ever shows the gap.
 */
export interface BayRig {
  /** Fore and aft ends of the opening, body x, m. */
  readonly x0: number
  readonly x1: number
  /** Each door runs from the keel out to this |z|, its hinge, m. */
  readonly halfWidthM: number
  /** The belly's y at the keel and at the hinge, measured off the committed glb (aircraftRigs.test.ts). */
  readonly keelY: number
  readonly hingeY: number
}

/** How far the doors swing, fully open. ESTIMATE: hanging about straight down. */
export const BAY_DOOR_OPEN_DEG = 85
/** Door plates stand this far outside the keel-to-hinge chord: more than the skin's sag below it
 *  (2.7 cm on the B-29's 1.45 m belly radius over a 0.56 m door), so the skin never shows through. */
export const DOOR_OFFSET_M = 0.035
const KEEL_GAP_M = 0.02
const DOOR_THICK_M = 0.015

/** A thin slab across the bay, from (keel z, keel y) to (hinge z, hinge y), `out` metres outboard
 *  of that chord, in the frame of a pivot sitting on the hinge line. */
function plate(len: number, dz: number, dy: number, out: number, thick: number): BufferGeometry {
  const n = Math.hypot(dz, dy)
  // Outward normal of the chord, away from the fuselage: below it, and outboard.
  const nz = (dy / n) * Math.sign(dz), ny = -Math.abs(dz) / n
  const ring = (o: number): [number, number][] => [[dz + nz * o, dy + ny * o], [nz * o, ny * o]]
  const outer = ring(out), inner = ring(out - thick)
  const h = len / 2
  const p: number[] = []
  for (const [z, y] of [...outer, ...inner]) p.push(-h, y, z, h, y, z)
  // 0..3 outer (keel-fore, keel-aft, hinge-fore, hinge-aft), 4..7 inner; double-sided material.
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3))
  geometry.setIndex([0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3])
  geometry.computeVertexNormals()
  return geometry
}

/** The doors and the dark bay behind them, under one group in the airframe's frame. `set` takes
 *  `AircraftState.bayDoorFraction`. */
export function buildBayDoors(bays: readonly BayRig[], paint: Material): { readonly group: Group; set(fraction: number): void; dispose(): void } {
  const group = new Group()
  group.name = 'bay doors'
  const dark = new MeshStandardMaterial({ color: 0x0b0c0e, roughness: 1, side: 2 })
  const doors: { pivot: Group; side: number }[] = []
  const geometries: BufferGeometry[] = []
  for (const b of bays) {
    const len = b.x1 - b.x0, xm = (b.x0 + b.x1) / 2
    for (const side of [-1, 1]) {
      // In the pivot's frame the keel end sits at (dz, dy) from the hinge.
      const dz = -side * (b.halfWidthM - KEEL_GAP_M), dy = b.keelY - b.hingeY
      const pivot = new Group()
      pivot.name = `BayDoor${bays.indexOf(b) + 1}${side < 0 ? 'L' : 'R'}`
      pivot.position.set(xm, b.hingeY, side * b.halfWidthM)
      const door = plate(len, dz, dy, DOOR_OFFSET_M, DOOR_THICK_M)
      const well = plate(len, dz, dy, DOOR_OFFSET_M - DOOR_THICK_M - 0.005, 0.005)
      geometries.push(door, well)
      pivot.add(new Mesh(door, paint))
      const wellMesh = new Mesh(well, dark)
      wellMesh.position.copy(pivot.position)
      group.add(pivot, wellMesh)
      doors.push({ pivot, side })
    }
  }
  return {
    group,
    set(fraction): void {
      const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
      // A positive turn about +x lifts the inboard (keel) edge of a right door; open swings it down.
      for (const d of doors) d.pivot.rotation.x = -d.side * f * (BAY_DOOR_OPEN_DEG * Math.PI) / 180
    },
    dispose(): void {
      for (const g of geometries) g.dispose()
      dark.dispose()
    },
  }
}
