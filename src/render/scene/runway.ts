import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { color, fract, mix, positionLocal, smoothstep, varying } from 'three/tsl'
import { groundNoise } from '../terrain/surface.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { v3 } from '../../sim/math/vec3.js'

/**
 * Parked on the runway at Tacloban, Leyte -- the world projection of 11.228 N
 * 125.028 E, cross-checked against the Copernicus source tiles 2026-09-14 and
 * carried by `tests/tools/terrainBuild.test.ts`. `y` is a PLACEHOLDER, not
 * the truth (see `PARKED_PLACEHOLDER_Y_M`, `src/sim/scenario.ts`).
 *
 * TEMPORARY until Task 7 boots from the scenario, and a verbatim duplicate of
 * `main.ts`'s own `PARKED_TACLOBAN` for exactly the reason that one's comment
 * gives -- this is the same literal `worldFromScenario` derives from the
 * Tacloban record today. Task 7 deletes both.
 */
const PARKED_TACLOBAN = v3(-29666, 1.9, -47605)

/**
 * Where the strip is centred, in world metres.
 *
 * Derived from `PARKED_TACLOBAN` rather than restating Tacloban's coordinate
 * a third time, so "the airplane is parked on its own runway" is structural
 * instead of a coincidence that two files have to keep agreeing about. The
 * coordinate itself is `(-29666, -47605)`, cross-checked against the
 * Copernicus source tiles in `tests/tools/terrainBuild.test.ts` -- do not
 * re-derive it here either; an equirectangular back-of-envelope lands about
 * 80 m away. `tests/render/runway.test.ts` still asserts the literal, which
 * is what stops someone un-deriving this later.
 *
 * There is no `y`. The strip has no single height: it follows the terrain
 * along its length (`createRunway`), and a `y` here would be a number that
 * looked authoritative while being wrong everywhere but one point -- the
 * exact trap `PARKED_TACLOBAN`'s own comment describes.
 */
export const RUNWAY_CENTRE = { x: PARKED_TACLOBAN.x, z: PARKED_TACLOBAN.z } as const

/**
 * 1,500 m, about 5,000 ft.
 *
 * **An estimate, not a sourced figure** -- labeled the same way Plan 11a's
 * gear constants are, and expected to be corrected by anyone with the real
 * 1944 dimensions. It is the length the Tacloban strip was reported to have
 * been extended to after the October 1944 landings, and it is chosen against
 * two things this repo has actually measured:
 *
 * - it fits inside the flat ground. North-south through the airfield the
 *   committed field runs 1.2 m to 1.7 m over 1.8 km; east-west has 3.1 m of
 *   spread because the coastline falls to the sea, which is why the strip
 *   runs north-south and why a parked airplane is pointed along it
 *   (`parkedAttitude`, `src/sim/world/airfields.ts`).
 * - it contains the roll. Rotation comes up 410-453 m into a full-throttle
 *   roll over real terrain (Plan 11a's handoff), and the airplane starts at
 *   the CENTRE of the strip, so it has 750 m ahead of it -- about 1.6 times
 *   the longest measured roll. Starting mid-field rather than at a threshold
 *   is not what a pilot does; it is what centring the strip on the airfield
 *   coordinate costs, and moving the spawn to a threshold would mean moving
 *   `PARKED_TACLOBAN` and re-measuring the ground height under it.
 */
export const RUNWAY_LENGTH_M = 1500

/** 45 m. **An estimate**: the modern field's width. A 1944 Marston-mat strip
 *  was nearer 30 m, so this is on the generous side -- it is wide enough that
 *  an airplane with no directional stability on the ground (Plan 11a's
 *  handoff measures a taxi turn reaching 113.6 deg of sideslip) does not
 *  wander off the edge during the roll before 11b gives it a lateral tire
 *  force. */
export const RUNWAY_WIDTH_M = 45

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
 * physics gets (L4) samples at tens of metres, so the surface cannot carry
 * detail this mesh would miss. It yields 151 x 6 = 906 vertices for the whole
 * runway, which is nothing beside the terrain mesh.
 */
const RUNWAY_SEGMENT_M = 10

/** The strip's four corners in world metres, north-south by construction:
 *  length along z, width along x. Exported because it is the cheapest
 *  statement of the strip's footprint to assert on, and because
 *  `runway.test.ts` uses it to check the parked airplane stands inside it. */
export function runwayCorners(): readonly { readonly x: number; readonly z: number }[] {
  const halfWidth = RUNWAY_WIDTH_M / 2
  const halfLength = RUNWAY_LENGTH_M / 2
  return [
    { x: RUNWAY_CENTRE.x - halfWidth, z: RUNWAY_CENTRE.z - halfLength },
    { x: RUNWAY_CENTRE.x + halfWidth, z: RUNWAY_CENTRE.z - halfLength },
    { x: RUNWAY_CENTRE.x + halfWidth, z: RUNWAY_CENTRE.z + halfLength },
    { x: RUNWAY_CENTRE.x - halfWidth, z: RUNWAY_CENTRE.z + halfLength },
  ]
}

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
 */
export function createRunway(field: TerrainField): Object3D {
  const cols = Math.round(RUNWAY_WIDTH_M / RUNWAY_SEGMENT_M) + 1
  const rows = Math.round(RUNWAY_LENGTH_M / RUNWAY_SEGMENT_M) + 1
  const x0 = RUNWAY_CENTRE.x - RUNWAY_WIDTH_M / 2
  const z0 = RUNWAY_CENTRE.z - RUNWAY_LENGTH_M / 2

  const positions = new Float32Array(rows * cols * 3)
  for (let r = 0; r < rows; r++) {
    const z = z0 + (r * RUNWAY_LENGTH_M) / (rows - 1)
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c * RUNWAY_WIDTH_M) / (cols - 1)
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
  return new Mesh(geometry, material)
}
