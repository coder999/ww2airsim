import {
  BufferAttribute,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  RedFormat,
  Vector2,
  type Object3D,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Discard,
  Fn,
  attribute,
  clamp,
  dot,
  float,
  floor,
  int,
  ivec2,
  length,
  min,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  textureLoad,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'
import { clampSlopeNode, createCoverNodes, detailNormalFadeNode, detailSlopeNode, terrainSurface, type CoverNodes } from './surface.js'
import { surfaceDetailNodes, type SurfaceDetailNodes } from './surfaceDetail.js'
import type { SurfaceTextures } from './surfaceTextures.js'
import { horizonSinkNode } from '../horizon.js'
import { samplesAtLevel, type TerrainHeader } from '../../sim/world/schema.js'
import { LOD, coarsestFetchedLevel, selectNodes } from './lod.js'
import { cloudSkylightNode, skyIrradianceDownNode, skyIrradianceUpNode, sunColorNode, sunDirectionNode } from '../scene/lighting.js'
import { aerialPerspective, farFadeTarget, farFadeWeight } from '../scene/atmosphereShading.js'
import type { CloudShadowHandle } from '../scene/cloudShadow.js'
import { COVER_HEADER } from '../landcover/load.js'
import { coverByteLength } from '../landcover/cover.js'

/**
 * The terrain, as three objects: a grid of quads shared by every patch, one
 * instance per patch `selectNodes` returns, and one height texture per
 * pyramid level.
 *
 * `levelTexture` and `shaderCameraXZ` are not part of the mesh's job -- they
 * are here because nothing else in this file can be observed without a GPU,
 * and a Node test asserting that `setLevel` wrote metres into the right
 * texture, and that `update` moved the camera position the shader actually
 * reads, is the only check on those halves of it (see
 * tests/render/terrainLoad.test.ts). `shaderCameraXZ` returns the uniform's
 * own live value, not a copy, so the test cannot pass against a mesh that
 * updates some other vector.
 */
export type TerrainMesh = {
  readonly object: Object3D
  setLevel(level: number, data: Int16Array): void
  update(cameraX: number, cameraZ: number): void
  /** A WHOLE-world level's texture; throws for a windowed level (below). */
  levelTexture(level: number): DataTexture
  /** The finest level held whole: what the ocean's shoreline reads. */
  readonly wholeLevel: number
  /** A windowed level's texture and the live origin uniform (in that level's
   *  samples, column then row) the shader subtracts; throws for a whole level. */
  levelWindow(level: number): { readonly texture: DataTexture; readonly origin: Vector2 }
  shaderCameraXZ(): Vector2
  /** Plan 13b: the land-cover raster, once fetched. */
  setCover(data: Uint8Array): void
  readonly cover: CoverNodes
  /** Visual realism §2.1: swap every ring between the textured and the
   *  procedural color graph. A no-op (procedural) without textures. */
  setSurfaceDetail(enabled: boolean): void
  /** True only when textures exist AND detail is enabled. */
  readonly surfaceDetail: boolean
}

type RingMaterial = { readonly material: MeshBasicNodeMaterial; setDetail(on: boolean): void }

/**
 * Which two pyramid levels a ring's patches read: its own, and the next
 * coarser one it morphs toward.
 *
 * `ring k samples mip k` by construction (design §2, and `lod.ts`'s LodNode
 * doc comment) -- a ring-k patch spans `1562.5 * 2^k` m and is tessellated
 * into `LOD.quadsPerNode` quads, which is exactly mip k's sample spacing, so
 * one vertex lands on one texel with no lookup table to keep true.
 *
 * Both ends are clamped, and the clamps mean different things:
 *
 * - `finest` is the finest level the app HAS -- `content.ts`'s
 *   `finestFetchedLevelFor` resolves this from the persisted Asset Quality
 *   tier (0 for `medium`/`high`/`ultra`, 1 for `low`; every level down to L0
 *   is committed, but a page load may still choose not to fetch all of it).
 *   Rings finer than that ask for a level this page load does not have.
 *   Clamping BOTH taps to `finest` makes their morph blend a no-op, which is
 *   the point: clamping only the fine tap would
 *   blend the ground directly under the airplane toward level 5 by up to
 *   100% -- morph is clamped at 1 for about half of all nodes (lod.ts,
 *   measured) -- and would render the near field coarser than the data it
 *   already has.
 * - `coarsest` is the top of the pyramid, which has nothing above it to
 *   morph toward.
 */
export function sampleLevelsForRing(
  ring: number,
  finest: number,
  coarsest: number,
): { readonly fine: number; readonly coarse: number } {
  const fine = Math.min(Math.max(ring, finest), coarsest)
  const coarse = Math.min(Math.max(ring + 1, finest), coarsest)
  return { fine, coarse }
}

/**
 * Instances a single ring can hold before the buffer is reallocated.
 *
 * Measured 2026-09-14 over a 21x21 sweep of camera positions covering the
 * whole world (every 10 km from -100,000 to 100,000 on both axes): the worst
 * single ring held 48 patches, at (-50,000, -50,000) -- a quarter-point of
 * the world, not a corner; the corners are at +/-100,000 -- and the worst
 * total across all rings was 196, at the origin. 64 covers the measured worst without being a number anything
 * depends on: `ensureCapacity` doubles on demand, so being wrong costs one
 * reallocation, not a dropped patch.
 */
const INITIAL_RING_CAPACITY = 64

/**
 * L1.1 (2026-10-10): levels finer than this one are held as a camera-centred
 * window instead of a whole-world texture. L1 stays whole because it is the
 * Low tier's floor and the grid the ocean's shoreline fade reads across the
 * whole world (`wholeLevel`); windowing it too would save 67 MB and coarsen
 * that fade to L2 (handoff `docs/handoff/2026-10-10-l1-1-terrain-on-demand.md`,
 * "Rulings for Mark").
 */
export const FINEST_WHOLE_LEVEL = 1

/** Edge of a windowed level's texture, in samples: 1025 x 1025 r32float is
 *  4,202,500 bytes, against L0's whole 268,500,996. Twice the rings' reach
 *  (below) plus room to move: the camera travels about 252 samples (3.8 mi
 *  at L0) between refills. */
export const WINDOW_SAMPLES = 1025

/**
 * How far from the camera, in a level's own samples, a patch that reads that
 * level can reach. Ring k reads levels k and k+1, and a ring's reach doubles
 * with its node size, as a level's sample spacing does -- so the reach is the
 * same number of samples at every level (the clipmap property). Measured
 * 2026-10-10 with `selectNodes` over the whole world at a 1,250 m camera
 * grid: 256 for L0 to L5 (6,250 m, 3.9 mi, at L0). Plus one for the
 * bilinear tap's far sample, plus slack. `tests/render/terrainLoad.test.ts` sweeps cameras and asserts every
 * patch stays inside its windows, so a reach too small fails there.
 */
export const WINDOW_REACH_SAMPLES = 260

/**
 * Bilinear height and horizontal gradient at a world (x, z), read from one
 * pyramid level's texture. Returns `vec3(heightM, dh/dx, dh/dz)`.
 *
 * This is `src/sim/world/terrain.ts`'s `heightAt` written for the GPU: same
 * grid, same row 0 = NORTH edge and column 0 = WEST edge, same clamp at the
 * edges, same four samples. It is not a mirror anyone can check headless
 * (sky.ts records what a mirror that is only correct where it is checked
 * costs), so it is written to be read against `heightAt` line by line
 * instead.
 *
 * The gradient falls out of the same four texels: the analytic derivative of
 * the bilinear patch, so slope shading costs no extra fetches and agrees
 * exactly with the surface being drawn.
 *
 * `textureLoad` rather than a filtered sample because the height textures
 * are `r32float`, and WebGPU cannot linearly filter a 32-bit float texture
 * without the optional `float32-filterable` feature -- three's WGSL builder
 * silently falls back to a NEAREST fetch for an unfilterable texture
 * (`isUnfilterable`, WGSLNodeBuilder.js, three@0.186.0, checked 2026-09-14),
 * which would stair-step the coarse tap and nothing headless would see it.
 * Half-float would filter in hardware but quantises to 1 m above 1024 m,
 * which is 20% noise in the gradient on exactly the peaks the slope shading
 * is for.
 *
 * **`r32float` versus `r16float` -- design spec section 9, item 1, closed
 * 2026-09-14.** That item asked for the decision to rest on "a measured
 * vertex-fetch cost", so it was measured, on the reference GPU (RX 6700 XT,
 * Chromium 153, Dawn/D3D12) at 2560x1440, as WebGPU timestamp-query durations
 * over ~515-frame windows. Every level swapped to `HalfFloatType` +
 * `Uint16Array` + `DataUtils.toHalfFloat`, everything else identical:
 *
 *              100 m over Leyte   3,000 m    8,000 m   (GPU ms, p50)
 *   r32float   2.032              2.097      1.769
 *   r16float   2.032              2.097      1.769
 *
 * Identical to the digit, at all three altitudes, in a paired run. The
 * instrument quantises to 65.54 us, so the honest statement is that the
 * vertex-fetch difference is below 0.066 ms -- under 3% of a 2.1 ms frame,
 * and 0.7% of the platform's 10.0 ms requestAnimationFrame cadence (which is
 * Chromium's, not the display's -- design spec section 10.2). `r16float`
 * would halve the height textures, which is not a constraint anything here
 * has: L4..L8 is 351,173 samples, and they are held as `Float32Array`, so the
 * textures are **1,404,692 bytes** and halving them lands AT ~700 KB. (The
 * 702,346-byte figure quoted elsewhere -- `load.ts`, the design spec, the
 * README -- is the same levels' int16 size ON THE WIRE, which is what those
 * places are about. Two quantities, one coincidence of arithmetic; this
 * comment used to give the wire figure as though it were the texture one.)
 *
 * So the measurement did not decide it, and **the choice is `r32float` on the
 * quantisation argument above, not on speed**. Recording the number anyway
 * because section 9 asked for it and because "we assumed the wide format was
 * slower" is exactly the kind of belief this project keeps finding in old
 * comments.
 */
function sampleField(
  tex: DataTexture,
  samples: number,
  halfExtentM: number,
  worldXZ: Node<'vec2'>,
  // A windowed level's origin, in its samples (`createTerrainMesh`): the
  // texel index is the whole-grid index minus this, clamped into the window.
  windowOrigin: UniformNode<'vec2', Vector2> | null = null,
): Node<'vec3'> {
  // Sample-aligned grid (mips.ts): (samples-1) cells span the full width.
  const stepM = (2 * halfExtentM) / (samples - 1)
  const last = samples - 1

  // Inverse of resample.ts's gridToLocal: x = -half + col*step,
  // z = -half + row*step. Clamped for the same reason heightAt clamps -- the
  // exact edge can compute fractionally past the last sample -- and because
  // a patch on the world edge has vertices exactly on it.
  const colF = clamp(worldXZ.x.add(halfExtentM).div(stepM), 0, last)
  const rowF = clamp(worldXZ.y.add(halfExtentM).div(stepM), 0, last)
  const col0 = floor(colF)
  const row0 = floor(rowF)
  const col1 = min(col0.add(1), last)
  const row1 = min(row0.add(1), last)
  const fx = colF.sub(col0)
  const fz = rowF.sub(row0)

  const windowLast = WINDOW_SAMPLES - 1
  const texel = (col: Node<'float'>, row: Node<'float'>): Node<'float'> =>
    windowOrigin
      ? textureLoad(tex, ivec2(int(clamp(col.sub(windowOrigin.x), 0, windowLast)), int(clamp(row.sub(windowOrigin.y), 0, windowLast)))).r
      : textureLoad(tex, ivec2(int(col), int(row))).r

  const h00 = texel(col0, row0)
  const h10 = texel(col1, row0)
  const h01 = texel(col0, row1)
  const h11 = texel(col1, row1)

  const northRow = mix(h00, h10, fx)
  const southRow = mix(h01, h11, fx)
  const height = mix(northRow, southRow, fz)
  const dhdx = mix(h10.sub(h00), h11.sub(h01), fz).div(stepM)
  // Row index grows with z (southward), so use south minus north for world
  // z. Getting this backwards lights every slope from the wrong side, which
  // reads as terrain rather than as a bug -- the same hazard the north-at-row-
  // zero convention carries everywhere else in this pipeline.
  const dhdz = southRow.sub(northRow).div(stepM)

  return vec3(height, dhdx, dhdz)
}

/**
 * The material one ring draws with: a TSL vertex node that places the shared
 * grid, displaces it from the height textures, sinks it with the Earth's
 * curvature, and passes world coordinates to fragment material detail.
 *
 * `MeshBasicNodeMaterial` rather than a lit standard material: the terrain
 * does its own lambert against `sunDirectionNode` (lighting.ts) using the
 * interpolated terrain normal, and takes its ambient from the same sky
 * irradiance uniforms `applySun` gives the scene's HemisphereLight. That
 * keeps the whole surface -- displacement, normal, colour and aerial
 * perspective -- in one graph that can be read in one sitting. A `ShaderMaterial` is not an option at all here; sky.ts records
 * why (the WebGPU node library has no entry for it).
 */
function createRingMaterial(
  fineTex: DataTexture,
  fineSamples: number,
  fineOrigin: UniformNode<'vec2', Vector2> | null,
  coarseTex: DataTexture,
  coarseSamples: number,
  coarseOrigin: UniformNode<'vec2', Vector2> | null,
  halfExtentM: number,
  cameraXZ: UniformNode<'vec2', Vector2>,
  cover: CoverNodes,
  shadow: CloudShadowHandle | undefined,
  textures: SurfaceTextures | null,
): RingMaterial {
  const material = new MeshBasicNodeMaterial()

  // centreX, centreZ, edge length, morph -- one instance attribute rather
  // than four, so `update` writes one interleaved buffer per ring.
  const spec = attribute('nodeSpec', 'vec4')
  const worldXZ = vec2(positionLocal.x, positionLocal.z).mul(spec.z).add(spec.xy)

  const fine = sampleField(fineTex, fineSamples, halfExtentM, worldXZ, fineOrigin)
  const coarse = sampleField(coarseTex, coarseSamples, halfExtentM, worldXZ, coarseOrigin)
  // Height AND gradient blend by the same morph, which is what keeps the
  // shading consistent with the surface: the derivative of a blend is the
  // blend of the derivatives.
  //
  // Only the height morphs, not the vertex's horizontal position as textbook
  // CDLOD does, and here that is exact rather than a shortcut: a ring's
  // tessellation and its mip are the same grid, so at morph 1 a patch is
  // drawing the bilinear interpolant of the COARSER level, sampled more
  // finely -- the same surface its coarser neighbour draws. Along a shared
  // edge both reduce to the same linear interpolation between the same two
  // coarse samples, so the seam closes without moving a single vertex
  // sideways.
  const field = mix(fine, coarse, spec.w)
  const heightM = field.x

  const distanceM = length(worldXZ.sub(cameraXZ))
  // Horizon sink (master spec §4). The expression lives in `horizon.ts` and
  // only there -- see its doc comment for why a second copy is how the hidden
  // beach comes back.
  const sinkM = horizonSinkNode(distanceM)
  const position = vec3(worldXZ.x, heightM.sub(sinkM), worldXZ.y)
  material.positionNode = position

  const normal = normalize(vec3(field.y.negate(), 1, field.z.negate()))
  const slope = length(vec2(field.y, field.z))
  // Built once, outside the swappable color graph: both graphs and the
  // texture detail's distance fade read it (camera-relative, see the aerial
  // perspective note in `colorFor`).
  const eyeToVertex = modelWorldMatrix.mul(vec4(position, 1)).xyz
  const eyeDistanceM = length(eyeToVertex)

  // Visual realism §2.1: two color graphs, the procedural one and the
  // textured one, built on demand and swapped by `setDetail` -- a real swap
  // (the procedural graph has no texture nodes at all), so scenery `low`
  // pays nothing for the textures (plan Ruling 3). A swap recompiles the
  // pipeline once; it happens only from the Settings dialog. Everything
  // above this line is the vertex stage, shared by both graphs and never
  // rebuilt.
  const colorFor = (detail: SurfaceDetailNodes | null): Node<'vec3'> => {
    const surf = terrainSurface(varying(worldXZ), varying(heightM), varying(slope), cover, detail ?? undefined)
    const albedo = surf.albedo
    // Photoreal Task 13: the shading normal carries a procedural detail bump
    // (surface.ts `detailSlopeNode`, two scales of the albedo's value noise)
    // faded out between 500 m and 2 km of eye distance. The mesh normal is a
    // heightfield normal (y > 0 always), so dividing by y recovers
    // (-dh/dx, 1, -dh/dz) and the detail slope adds to it exactly.
    //
    // With textures, the texture normals' slope (blended by the albedo's own
    // weights, surface.ts `terrainSurface`) adds to the procedural one, and
    // the sum is clamped again so the combined tilt stays <= 12 deg.
    // `detailSlopeNode` already clamps its own sum, so on the procedural path
    // this is clamp(clamp(x)) = clamp(x): unchanged.
    const meshNormal = varying(normal)
    const procedural = detailSlopeNode(varying(worldXZ))
    const summed = surf.detailSlope ? procedural.add(surf.detailSlope) : procedural
    const detailSlope = clampSlopeNode(summed).mul(detailNormalFadeNode(varying(eyeDistanceM)))
    const shadingNormal = normalize(meshNormal.div(meshNormal.y).sub(vec3(detailSlope.x, 0, detailSlope.y)))
    const sun = normalize(sunDirectionNode)
    const lambert = clamp(dot(shadingNormal, sun), 0, 1)
    // Plan 16b: cloud shadow scales the direct term only; the sky's ambient
    // stays, so the ground under an opaque cloud is lit like a north slope.
    // The terrain already has TRUE world coordinates (`worldXZ` from
    // `nodeSpec`, `heightM` from the field), so it passes 'world' and the
    // node adds no eye offset. `varying` so the lookup is per fragment.
    const shadowT = shadow ? shadow.node(varying(vec3(worldXZ.x, heightM, worldXZ.y)), 'world') : float(1)
    // Photoreal Task 9 (spec §4.3): Lambertian in scene units, albedo/pi x
    // irradiance -- three's BRDF_Lambert, so the terrain and the lit materials
    // parked on it agree. The ambient is the atmosphere's sky irradiance,
    // mixed from the up- and down-facing values by the normal as three's
    // HemisphereLight does (lighting.ts sets both from one palette). The up
    // term includes the cumulus deck's scattered skylight, as the
    // HemisphereLight's sky color does (photoreal Task 12, lighting.ts).
    const ambient = mix(skyIrradianceDownNode, skyIrradianceUpNode.add(cloudSkylightNode), shadingNormal.y.mul(0.5).add(0.5))
    const lit = albedo.mul(1 / Math.PI).mul(ambient.add(sunColorNode.mul(lambert.mul(shadowT))))

    // Aerial perspective (atmosphereShading.ts), evaluated per VERTEX and
    // interpolated like the old fog ramp: the LUT is 32x32 per slice and
    // smooth, and a per-fragment lookup would cost two samples per 4K pixel.
    // The scene is camera-relative, so the model-to-world transform of the
    // displaced vertex IS the eye-to-vertex vector (`eyeToVertex`, above).
    //
    // The far-plane invariant: over the last 10% of the draw distance the
    // final color blends toward what is behind the edge along the same ray --
    // the sea at its own (further) distance below the true horizon, the sky
    // above it (`farFadeTarget`) -- so the clip cannot be seen. `smoothstep`
    // is exactly 1 at the distance.
    const ap = varying(aerialPerspective(eyeToVertex, eyeDistanceM))
    const fade = varying(farFadeWeight(eyeDistanceM))
    const behind = varying(farFadeTarget(eyeToVertex))
    const shaded = mix(lit.mul(ap.a).add(ap.rgb), behind, fade)
    const vertexHeightM = varying(heightM)

    // The ocean owns water fragments. Discard the DEM's zero-elevation sea
    // before shading so two overlapping surfaces never compete there. Both
    // materials apply the shared curvature sink; the contour stays at h=0.
    // `?cloudShadow=show` paints the transmittance instead of the ground.
    const painted = shadow?.showing ? vec3(shadowT, shadowT, shadowT) : shaded
    return Fn(() => {
      Discard(vertexHeightM.lessThanEqual(0))
      return painted
    })()
  }

  let proceduralColor: Node<'vec3'> | null = null, texturedColor: Node<'vec3'> | null = null
  const setDetail = (on: boolean): void => {
    const next = on && textures
      ? (texturedColor ??= colorFor(surfaceDetailNodes(textures, varying(worldXZ), varying(eyeDistanceM))))
      : (proceduralColor ??= colorFor(null))
    if (material.colorNode !== next) { material.colorNode = next; material.needsUpdate = true }
  }
  setDetail(textures !== null)
  return { material, setDetail }
}

/** The unit grid every patch instances: `LOD.quadsPerNode` quads a side,
 *  spanning [-0.5, 0.5] in x and z at y = 0, so a patch is `positionLocal *
 *  sizeM + centre`. Wound counter-clockwise seen from above, because
 *  three's default FrontSide culls the other way round and a grid wound
 *  backwards draws nothing at all from an airplane. */
function createGridAttributes(): { position: BufferAttribute; index: BufferAttribute } {
  const quads = LOD.quadsPerNode
  const side = quads + 1
  const positions = new Float32Array(side * side * 3)
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const i = (row * side + col) * 3
      positions[i] = col / quads - 0.5
      positions[i + 1] = 0
      positions[i + 2] = row / quads - 0.5
    }
  }
  const indices = new Uint16Array(quads * quads * 6)
  let out = 0
  for (let row = 0; row < quads; row++) {
    for (let col = 0; col < quads; col++) {
      const a = row * side + col
      const b = a + 1
      const c = a + side
      const d = c + 1
      indices[out++] = a
      indices[out++] = c
      indices[out++] = b
      indices[out++] = b
      indices[out++] = c
      indices[out++] = d
    }
  }
  // 65*65 = 4,225 vertices, so Uint16 indices are safe with room to spare.
  return { position: new BufferAttribute(positions, 3), index: new BufferAttribute(indices, 1) }
}

/**
 * Build the terrain: one `Mesh` per LOD ring, all instancing one grid, all
 * reading the same stack of height textures.
 *
 * One draw call per ring rather than one for everything, because a ring is
 * exactly the unit that shares a pair of mip textures and WGSL cannot index
 * a texture binding dynamically. Eight draw calls is the price of not
 * needing an atlas, whose seams would be a filtering bug nobody could see
 * headless.
 *
 * `object.children[k]` is ring k, in order, and says so in its name -- the
 * mesh's own bookkeeping depends on it and so does the Node test.
 *
 * `finestLevel` bounds the texture map from below and has to be the SAME value the caller passes to
 * `loadTerrainProgressively`'s `finestLevel` argument (`terrain/load.ts`) --
 * this function does not resolve it independently, on purpose (Task 2
 * review, 2026-09-25: it used to, and `main.ts` computed a second, separate
 * value for the network loop, which happened to agree only because both
 * were hardcoded to the same literal).
 */
export function createTerrainMesh(
  header: TerrainHeader,
  finestLevel: number,
  shadow?: CloudShadowHandle,
  surfaceTextures: SurfaceTextures | null = null,
): TerrainMesh {
  // Two world extents would be two worlds. `header` decides the texture sizes
  // and `sampleField`'s world->grid mapping below, but `update` calls
  // `selectNodes` with the DEFAULT `LOD`, whose `halfExtentM` comes from the
  // committed `content/terrain/header.json` (`lod.ts`). If the two disagree,
  // patch footprints are laid out over one world while the shader maps them
  // onto a texture built for another -- terrain that is wrong everywhere and
  // plausible everywhere, with no seam to point at. Every caller and every
  // test passes `TERRAIN_HEADER` today, so the disagreeing case is not
  // reachable; this is what stops it becoming reachable in silence (review
  // 2026-09-14, finding I2).
  if (header.halfExtentM !== LOD.halfExtentM) {
    throw new Error(
      `terrain header half-extent ${header.halfExtentM} m disagrees with the LOD's ` +
        `${LOD.halfExtentM} m: node selection and the height textures would describe different worlds`,
    )
  }
  // The coarsest level any ring can sample, for the header this particular
  // mesh was handed. See `coarsestFetchedLevel`'s doc comment in `lod.ts` for
  // the rule and why it is shared with `load.ts`'s fetch loop -- allocating a
  // texture past this point would reserve one that nothing can ever draw
  // into, which `levelTexture` below turns into a throw rather than a
  // silently ignored write.
  const coarsestLevel = coarsestFetchedLevel(header.levels)
  // `finestLevel` is the caller's own answer to "how far down the pyramid
  // did THIS page load fetch" (`content.ts`'s `finestFetchedLevelFor`,
  // resolved from the persisted Asset Quality tier), taken as a parameter
  // rather than resolved independently in here -- until 2026-09-25 (Task 2
  // review) this function called `finestFetchedLevelFor('low')` itself while
  // `main.ts` computed its OWN, separately, and passed that to
  // `levelTexture()`/`applyTerrainLevel()`/`loadTerrainProgressively()`: two
  // independent sources of truth for a value that has to agree, or this
  // allocates a texture map for a level the network loop never fetches (or
  // vice versa, a level arrives with no texture reserved for it -- either
  // way `levelTexture` below throws). One caller, `main.ts`, computing it
  // once and threading it through both places it is needed is what makes
  // that agreement structural instead of coincidental.
  //
  // Memory (L1.1, 2026-10-10): a whole-world `Float32Array(n^2)` per level
  // from L0 up was 358,043,428 bytes of height texture, held on the CPU and
  // again on the GPU; L0 alone is 268,500,996 and needed a 270.6 MB upload
  // staging buffer. That is why the first-visit default stayed Low until
  // this change. Levels finer than `FINEST_WHOLE_LEVEL` are now a
  // `WINDOW_SAMPLES`-square window around the camera, refilled from the
  // decoded level (the same `Int16Array` the physics keeps) when the camera
  // nears its edge; from an L0 floor that is 93,744,932 bytes in all.
  const { position, index } = createGridAttributes()
  const cameraXZ = uniform(new Vector2())
  const cover = createCoverNodes(COVER_HEADER)

  const newHeightTexture = (n: number): DataTexture => {
    // Zero-filled until `setLevel` lands: zero is sea level, and the sea is
    // discarded, so nothing is drawn at all until real heights arrive rather
    // than a flat plate that flashes and vanishes.
    const tex = new DataTexture(new Float32Array(n * n), n, n, RedFormat, FloatType)
    // Filtering is `sampleField`'s job (see its doc comment); saying NEAREST
    // here states that no sampler is expected to interpolate these.
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    tex.generateMipmaps = false
    tex.needsUpdate = true
    return tex
  }

  type LevelWindow = {
    readonly texture: DataTexture
    readonly origin: UniformNode<'vec2', Vector2>
    readonly samples: number
    source: Int16Array | null
  }
  const textures = new Map<number, DataTexture>()
  const windows = new Map<number, LevelWindow>()
  for (let level = finestLevel; level <= coarsestLevel; level++) {
    const n = samplesAtLevel(header, level)
    if (level < FINEST_WHOLE_LEVEL && n > WINDOW_SAMPLES) {
      windows.set(level, { texture: newHeightTexture(WINDOW_SAMPLES), origin: uniform(new Vector2(NaN, NaN)), samples: n, source: null })
    } else {
      textures.set(level, newHeightTexture(n))
    }
  }
  const wholeLevel = Math.min(Math.max(finestLevel, FINEST_WHOLE_LEVEL), coarsestLevel)

  /**
   * Keep a window over the samples the rings can read around the camera,
   * `WINDOW_REACH_SAMPLES` each way (clipped to the grid). When they would
   * leave it, re-centre on the camera (clamped inside the grid) and refill
   * from the decoded level: decimetres on disk, metres in the shader. The
   * origin uniform and the texture change together, before the next draw.
   */
  const placeWindow = (w: LevelWindow, cameraX: number, cameraZ: number, refill: boolean): void => {
    const n = w.samples
    const stepM = (2 * header.halfExtentM) / (n - 1)
    const col = (cameraX + header.halfExtentM) / stepM
    const row = (cameraZ + header.halfExtentM) / stepM
    const o = w.origin.value
    const covers = (c: number, origin: number): boolean =>
      Math.max(0, Math.floor(c) - WINDOW_REACH_SAMPLES) >= origin &&
      Math.min(n - 1, Math.ceil(c) + WINDOW_REACH_SAMPLES) <= origin + WINDOW_SAMPLES - 1
    if (covers(col, o.x) && covers(row, o.y) && !refill) return
    const originFor = (c: number): number => Math.min(Math.max(Math.round(c) - (WINDOW_SAMPLES - 1) / 2, 0), n - WINDOW_SAMPLES)
    o.set(originFor(col), originFor(row))
    if (w.source === null) return
    const out = w.texture.image.data as Float32Array
    for (let r = 0; r < WINDOW_SAMPLES; r++) {
      const from = (o.y + r) * n + o.x
      for (let c = 0; c < WINDOW_SAMPLES; c++) out[r * WINDOW_SAMPLES + c] = w.source[from + c]! / 10
    }
    w.texture.needsUpdate = true
  }

  const holdsLevel = (level: number): boolean => textures.has(level) || windows.has(level)
  const missing = (level: number): Error =>
    new Error(`terrain level ${level} has no texture: this build holds levels ${finestLevel}..${coarsestLevel}`)
  const levelTexture = (level: number): DataTexture => {
    const tex = textures.get(level)
    if (tex) return tex
    if (windows.has(level)) {
      throw new Error(`terrain level ${level} is held as a camera window, not a whole-world texture; use level ${wholeLevel}`)
    }
    throw missing(level)
  }
  const ringTexture = (level: number): { tex: DataTexture; origin: UniformNode<'vec2', Vector2> | null } => {
    const w = windows.get(level)
    return w ? { tex: w.texture, origin: w.origin } : { tex: levelTexture(level), origin: null }
  }

  const object = new Group()
  const geometries: InstancedBufferGeometry[] = []
  const ringMaterials: RingMaterial[] = []
  // True by default: without textures the getter is false anyway.
  let detailEnabled = true
  for (let ring = 0; ring < LOD.rings; ring++) {
    const { fine, coarse } = sampleLevelsForRing(ring, finestLevel, coarsestLevel)
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute('position', position)
    geometry.setIndex(index)
    geometry.setAttribute('nodeSpec', newSpecAttribute(INITIAL_RING_CAPACITY))
    geometry.instanceCount = 0
    const fineTex = ringTexture(fine)
    const coarseTex = ringTexture(coarse)
    const ringMaterial = createRingMaterial(
      fineTex.tex,
      samplesAtLevel(header, fine),
      fineTex.origin,
      coarseTex.tex,
      samplesAtLevel(header, coarse),
      coarseTex.origin,
      header.halfExtentM,
      cameraXZ,
      cover,
      shadow,
      surfaceTextures,
    )
    ringMaterials.push(ringMaterial)
    const mesh = new Mesh(geometry, ringMaterial.material)
    mesh.name = `terrain-ring-${ring}`
    // Every patch's real position comes from `nodeSpec`, which three knows
    // nothing about, so the geometry's own bounds are a half-metre cube at
    // the scene origin -- which camera-relative rendering parks at -eye.
    // Left culled, the terrain vanishes whenever the world origin is off
    // screen, i.e. almost always.
    mesh.frustumCulled = false
    geometries.push(geometry)
    object.add(mesh)
  }

  // Reused every frame rather than reallocated: `update` runs once per frame
  // for the life of the process, and these are the only allocations in it
  // that do not have to be.
  const counts = new Array<number>(LOD.rings).fill(0)
  const cursors = new Array<number>(LOD.rings).fill(0)
  const specs = new Array<InstancedBufferAttribute | null>(LOD.rings).fill(null)

  return {
    object,

    levelTexture,
    wholeLevel,
    levelWindow(level: number) {
      const w = windows.get(level)
      if (!w) throw holdsLevel(level) ? new Error(`terrain level ${level} is held whole; use levelTexture`) : missing(level)
      return { texture: w.texture, origin: w.origin.value }
    },

    shaderCameraXZ: () => cameraXZ.value,

    cover,
    setCover(data: Uint8Array): void {
      const expected = coverByteLength(COVER_HEADER)
      if (data.length !== expected) throw new Error(`land cover is ${data.length} bytes; expected ${expected}`)
      ;(cover.texture.image.data as Uint8Array).set(data)
      cover.texture.needsUpdate = true
      cover.ready.value = 1
    },

    setSurfaceDetail(enabled: boolean): void {
      detailEnabled = enabled
      for (const r of ringMaterials) r.setDetail(enabled)
    },
    get surfaceDetail(): boolean {
      return detailEnabled && surfaceTextures !== null
    },

    setLevel(level: number, data: Int16Array): void {
      if (!holdsLevel(level)) throw missing(level)
      const n = samplesAtLevel(header, level)
      if (data.length !== n * n) {
        throw new Error(`terrain level ${level} expects ${n}x${n} = ${n * n} samples, got ${data.length}`)
      }
      const w = windows.get(level)
      if (w) {
        // Kept by reference, not copied: it is the array the physics holds
        // (`load.ts`'s `applyTerrainLevel`), and the window only reads it.
        w.source = data
        placeWindow(w, cameraXZ.value.x, cameraXZ.value.y, true)
        return
      }
      const tex = levelTexture(level)
      // Decimetres on disk (header.encoding), metres in the shader: the one
      // place that conversion happens, so no TSL node has to remember it.
      const out = tex.image.data as Float32Array
      for (let i = 0; i < data.length; i++) out[i] = data[i]! / 10
      tex.needsUpdate = true
    },

    update(cameraX: number, cameraZ: number): void {
      cameraXZ.value.set(cameraX, cameraZ)
      for (const w of windows.values()) placeWindow(w, cameraX, cameraZ, false)
      const nodes = selectNodes(cameraX, cameraZ)

      counts.fill(0)
      for (const node of nodes) {
        if (!Number.isInteger(node.ring) || node.ring < 0 || node.ring >= LOD.rings) {
          throw new Error(`terrain node ring ${node.ring} is outside [0, ${LOD.rings - 1}]`)
        }
        counts[node.ring]!++
      }

      cursors.fill(0)
      for (let ring = 0; ring < LOD.rings; ring++) {
        specs[ring] = ensureCapacity(geometries[ring]!, counts[ring]!)
        // Written from scratch below, so the count is the only thing that
        // stops a stale patch from a previous frame being drawn again.
        geometries[ring]!.instanceCount = counts[ring]!
      }

      for (const node of nodes) {
        const spec = specs[node.ring]!
        spec.setXYZW(cursors[node.ring]!++, node.centreX, node.centreZ, node.sizeM, node.morph)
      }

      // Once per ring, not once per patch: `needsUpdate` is a setter that
      // bumps the attribute's version, and the backend compares that version
      // once per draw.
      for (let ring = 0; ring < LOD.rings; ring++) {
        if (counts[ring]! > 0) specs[ring]!.needsUpdate = true
      }
    },
  }
}

function newSpecAttribute(capacity: number): InstancedBufferAttribute {
  const attr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
  attr.setUsage(DynamicDrawUsage)
  return attr
}

/** Grow a ring's instance buffer if this frame needs more patches than it
 *  holds, doubling so growth stops happening. Reallocating is what makes
 *  INITIAL_RING_CAPACITY a starting point rather than a limit: no measured
 *  worst case has to stay true for the terrain to keep drawing. */
function ensureCapacity(geometry: InstancedBufferGeometry, needed: number): InstancedBufferAttribute {
  const current = geometry.getAttribute('nodeSpec') as InstancedBufferAttribute
  if (current.count >= needed) return current
  let capacity = Math.max(current.count, 1)
  while (capacity < needed) capacity *= 2
  const next = newSpecAttribute(capacity)
  geometry.setAttribute('nodeSpec', next)
  return next
}
