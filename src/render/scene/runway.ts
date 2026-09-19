import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { color, fract, mix, positionLocal, smoothstep, varying } from 'three/tsl'
import { groundNoise } from '../terrain/surface.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { localToWorld, type Airfield } from '../../sim/world/airfields.js'

/**
 * 5 cm. How far the strip's surface sits above the terrain it follows.
 *
 * Purely to stop the two coplanar surfaces z-fighting. It is therefore a lie
 * of exactly 5 cm: the physics reads `heightAt` and knows nothing about this
 * mesh, so a parked airplane's wheels are 5 cm below the surface you can see.
 * That is why the number is small against `GROUND_CONTACT_TOLERANCE_M`
 * (0.25 m, `src/sim/ground.ts`) rather than merely smaller than it --
 * `tests/render/runway.test.ts` pins it below a quarter of that tolerance.
 *
 * **Whether 5 cm is actually enough to stop the z-fighting is a Tier 2/Tier 3
 * question and has not been checked**: it cannot be, headless. At a grazing
 * angle a kilometre down the strip it may not be. The alternative --
 * `material.polygonOffset`, which is the usual fix and lies by zero -- was
 * not chosen because it resolves to a depth bias in the WebGPU backend and
 * nothing in this suite can verify it took effect, whereas this offset is
 * asserted by a unit test.
 */
export const RUNWAY_SURFACE_OFFSET_M = 0.05

/**
 * Target spacing of the strip's vertices, in metres, along both axes. The
 * actual spacing is this rounded to a whole number of cells: exactly 10 m
 * along the 1,500 m length, and 9 m across the 45 m width.
 *
 * 10 m is well finer than the terrain the strip is following -- the level the
 * physics gets (L2 since `eef5b4d`, 2026-09-18; this said L4 until Plan 12
 * Task 7) samples at tens of metres, so the surface cannot carry detail this
 * mesh would miss. It yields 151 x 6 = 906 vertices for a 1,500 x 45 m strip,
 * which is nothing beside the terrain mesh.
 */
const RUNWAY_SEGMENT_M = 10

/**
 * The strip, as a mesh draped over the real ground.
 *
 * Render-only: nothing in `src/sim/` knows this exists, and the physics goes
 * on reading `heightAt` as it does everywhere else. That is the whole reason
 * this is safe to add late -- it changes how the airfield LOOKS and not one
 * number about how the airplane behaves.
 *
 * Every vertex is placed at `heightAt(field, x, z) + RUNWAY_SURFACE_OFFSET_M`,
 * sampling the same function the physics does, so the surface cannot disagree
 * with the ground the wheels are rolling on by more than that offset. A strip
 * laid at one constant height would bury its north end or float its south:
 * flat-looking as Tacloban is, the committed field still moves half a metre
 * across the strip's length.
 *
 * **Positions are raw world metres.** `main.ts` sets `scene.position` to
 * `worldOffsetFor(eye)` every frame and that applies to every child, so adding
 * the offset here as well would apply it twice -- a Critical finding on Plan
 * 10, whose comment lives on the impact effect in `main.ts`.
 *
 * **The strip comes from the record, not from this file** (Plan 12 Task 7).
 * Where Tacloban is, how long and wide its strip is and which way it points
 * are `content/bases/<id>.json`'s -- including the two ESTIMATES that used to
 * be documented here at length, which moved verbatim into that file's
 * `reference.source` rather than being restated in both places. The grid is
 * built in the RUNWAY-LOCAL frame (`x` across, `z` along) and every vertex is
 * mapped through `localToWorld`, so a base with a heading other than 0 needs
 * no second code path -- `runway.test.ts` flies a heading-90 Tacloban past
 * this, because every base that actually ships is north-south and a
 * `createRunway` that ignored `headingDeg` would otherwise pass everything.
 */
export function createRunway(field: TerrainField, airfield: Airfield): Object3D {
  const { lengthM, widthM } = airfield.runway
  const cols = Math.round(widthM / RUNWAY_SEGMENT_M) + 1
  const rows = Math.round(lengthM / RUNWAY_SEGMENT_M) + 1

  const positions = new Float32Array(rows * cols * 3)
  for (let r = 0; r < rows; r++) {
    const lz = -lengthM / 2 + (r * lengthM) / (rows - 1)
    for (let c = 0; c < cols; c++) {
      const lx = -widthM / 2 + (c * widthM) / (cols - 1)
      const { x, z } = localToWorld(airfield, lx, lz)
      const i = (r * cols + c) * 3
      positions[i] = x
      positions[i + 1] = heightAt(field, x, z) + RUNWAY_SURFACE_OFFSET_M
      positions[i + 2] = z
    }
  }

  // Two triangles per cell, wound counter-clockwise seen from above so the
  // surface faces up. Getting the winding backwards gives a strip that is
  // invisible from the cockpit and perfectly visible from underneath.
  const indices: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = (r + 1) * cols + c
      const e = d + 1
      indices.push(a, d, b, b, d, e)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  // Deliberately darker and smoother than the terrain shading around it, so
  // the strip reads as a made surface rather than a patch of ground. Coral
  // and pierced steel plank are what Tacloban was actually surfaced with in
  // 1944; mottled material and panel seams suggest the latter at taxi height.
  const material = new MeshStandardNodeMaterial({ roughness: 0.91, metalness: 0.08 })
  const xz = varying(positionLocal.xz)
  const grain = groundNoise(xz, 12).g
  const seams = smoothstep(0.96, 0.995, fract(xz.y.div(3))).mul(0.14)
  material.colorNode = mix(color(0x55544b), color(0x7c7868), grain).mul(seams.oneMinus())
  const strip = new Mesh(geometry, material)
  strip.receiveShadow = true // Plan 16b, see hellcat.ts
  return strip
}
