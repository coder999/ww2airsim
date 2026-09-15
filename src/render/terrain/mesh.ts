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
  color,
  dot,
  float,
  floor,
  int,
  ivec2,
  length,
  max,
  min,
  mix,
  normalize,
  positionLocal,
  smoothstep,
  textureLoad,
  uniform,
  varying,
  vec2,
  vec3,
} from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'
import { horizonSinkNode } from '../horizon.js'
import { samplesAtLevel, type TerrainHeader } from '../../sim/world/schema.js'
import { LOD, coarsestFetchedLevel, selectNodes } from './lod.js'
import { FINEST_FETCHED_LEVEL } from '../content.js'
import { SKY_HAZE } from '../scene/sky.js'
import { SUN_DIRECTION } from '../scene/lighting.js'

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
  levelTexture(level: number): DataTexture
  shaderCameraXZ(): Vector2
}

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
 * - `finest` is the finest level the app HAS (4 -- `content.ts`'s
 *   FINEST_FETCHED_LEVEL explains why L0-L3 are not fetched). Rings 0-3 ask
 *   for a level nobody has. Clamping BOTH taps to `finest` makes their morph
 *   blend a no-op, which is the point: clamping only the fine tap would
 *   blend the ground directly under the aeroplane toward level 5 by up to
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

/** Ground colours. Appearance, not tuning: nothing measures against these
 *  and no behaviour changes with them. Leyte is jungle to the ridgelines,
 *  so green dominates; the sand band exists so the coastline reads as a
 *  line at 30 km rather than as a green/blue tone change, which is the one
 *  thing the eye uses to recognise the place. */
const SAND = 0xcbb894
const JUNGLE = 0x2f4a2b
const ROCK = 0x6d6559
/**
 * Top of the sand band, in metres: above this the ground is vegetation.
 *
 * Measured, so it can be re-derived rather than taken on trust. Over the
 * committed L4 grid (2026-09-14) there are 4,846 samples that are above sea
 * level and orthogonally adjacent to a sample at exactly 0 -- the first land
 * sample inland, all the way round every coast in the world. Their heights:
 * median 0.9 m, 75th percentile 2.7 m, maximum 52.3 m. Rounding the 75th
 * percentile to 3 puts the top of the band at or before the first land
 * sample for three coastlines in four, i.e. the sand is about ONE level-4
 * cell wide (390 m) -- a shoreline, not a beach the width of a county.
 *
 * It is worth knowing what this does and does not buy: at 30 km a 390 m band
 * is well under a pixel, so the coastline at range reads from the sea-level
 * discard edge (`createRingMaterial`), not from this. The band is for the
 * near field.
 */
const SAND_TOP_M = 3
/** Where bare rock takes over from vegetation with height, in metres.
 *  Leyte's highest sample is 1236.6 m (measured over the committed L4
 *  grid), so this puts rock on the top few hundred metres of the tallest
 *  ridges and nowhere else. */
const ROCK_FROM_M = 800
const ROCK_FULL_M = 1100
/** ...and with slope, as rise over run: 0.5 is 27 degrees, 0.9 is 42. A
 *  tropical hillside holds vegetation to roughly the first and almost never
 *  past the second. */
const ROCK_FROM_SLOPE = 0.5
const ROCK_FULL_SLOPE = 0.9
/** Fraction of the terrain's lit colour that survives in shadow: sky and
 *  sea bounce, standing in for the HemisphereLight the rest of the scene
 *  gets (lighting.ts). Without it, every north face is black. */
const AMBIENT = 0.35

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
): Node<'vec3'> {
  // Sample-aligned grid (mips.ts): (samples-1) cells span the full width.
  const stepM = (2 * halfExtentM) / (samples - 1)
  const last = samples - 1

  // Inverse of resample.ts's gridToLocal: x = -half + col*step,
  // z = half - row*step. Clamped for the same reason heightAt clamps -- the
  // exact edge can compute fractionally past the last sample -- and because
  // a patch on the world edge has vertices exactly on it.
  const colF = clamp(worldXZ.x.add(halfExtentM).div(stepM), 0, last)
  const rowF = clamp(float(halfExtentM).sub(worldXZ.y).div(stepM), 0, last)
  const col0 = floor(colF)
  const row0 = floor(rowF)
  const col1 = min(col0.add(1), last)
  const row1 = min(row0.add(1), last)
  const fx = colF.sub(col0)
  const fz = rowF.sub(row0)

  const texel = (col: Node<'float'>, row: Node<'float'>): Node<'float'> =>
    textureLoad(tex, ivec2(int(col), int(row))).r

  const h00 = texel(col0, row0)
  const h10 = texel(col1, row0)
  const h01 = texel(col0, row1)
  const h11 = texel(col1, row1)

  const northRow = mix(h00, h10, fx)
  const southRow = mix(h01, h11, fx)
  const height = mix(northRow, southRow, fz)
  const dhdx = mix(h10.sub(h00), h11.sub(h01), fz).div(stepM)
  // Row index grows as z SHRINKS, so the sign flips on the way back to world
  // z. Getting this backwards lights every slope from the wrong side, which
  // reads as terrain rather than as a bug -- the same hazard the north-at-row-
  // zero convention carries everywhere else in this pipeline.
  const dhdz = northRow.sub(southRow).div(stepM)

  return vec3(height, dhdx, dhdz)
}

/**
 * The material one ring draws with: a TSL vertex node that places the shared
 * grid, displaces it from the height textures, sinks it with the Earth's
 * curvature, and shades and fogs the result.
 *
 * `MeshBasicNodeMaterial` rather than a lit standard material: the terrain
 * does its own lambert against `SUN_DIRECTION` (lighting.ts) in one vertex
 * node it already has the normal in, and takes its ambient from a constant
 * instead of the scene's HemisphereLight. That keeps the whole surface --
 * displacement, normal, colour and fog -- in one graph that can be read in
 * one sitting, at the cost of not tracking the scene's lights if they ever
 * change. A `ShaderMaterial` is not an option at all here; sky.ts records
 * why (the WebGPU node library has no entry for it).
 */
function createRingMaterial(
  fineTex: DataTexture,
  fineSamples: number,
  coarseTex: DataTexture,
  coarseSamples: number,
  halfExtentM: number,
  cameraXZ: UniformNode<'vec2', Vector2>,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()

  // centreX, centreZ, edge length, morph -- one instance attribute rather
  // than four, so `update` writes one interleaved buffer per ring.
  const spec = attribute('nodeSpec', 'vec4')
  const worldXZ = vec2(positionLocal.x, positionLocal.z).mul(spec.z).add(spec.xy)

  const fine = sampleField(fineTex, fineSamples, halfExtentM, worldXZ)
  const coarse = sampleField(coarseTex, coarseSamples, halfExtentM, worldXZ)
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
  material.positionNode = vec3(worldXZ.x, heightM.sub(sinkM), worldXZ.y)

  const normal = normalize(vec3(field.y.negate(), 1, field.z.negate()))
  const slope = length(vec2(field.y, field.z))
  const bare = max(
    smoothstep(ROCK_FROM_M, ROCK_FULL_M, heightM),
    smoothstep(ROCK_FROM_SLOPE, ROCK_FULL_SLOPE, slope),
  )
  const albedo = mix(mix(color(SAND), color(JUNGLE), smoothstep(0, SAND_TOP_M, heightM)), color(ROCK), bare)
  const sun = normalize(vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z))
  const lit = albedo.mul(float(AMBIENT).add(clamp(dot(normal, sun), 0, 1).mul(1 - AMBIENT)))

  // Aerial perspective, and the reason the far plane can sit exactly on the
  // draw distance (main.ts). `smoothstep` is exactly 1 at `drawDistanceM`,
  // so terrain at or beyond it is precisely the haze the sky dome behind it
  // is painted with -- a fragment the far plane removes and one it keeps are
  // the same colour, and the clip cannot be seen. A `1 - exp(-d/L)`
  // extinction curve would be more physical and never reach 1, which is
  // exactly the property that would make the clip a visible edge.
  const fog = smoothstep(0, LOD.drawDistanceM, distanceM)
  const shaded = varying(mix(lit, color(SKY_HAZE), fog))
  const vertexHeightM = varying(heightM)

  // The sea is drawn by scene/water.ts, and this grid covers the whole
  // world: over the 65% of it that is ocean the DEM is exactly 0 (measured
  // over the committed L4 grid: 170,819 of 263,169 samples), i.e. coplanar
  // with the water plane at y = 0, and two coplanar opaque surfaces z-fight
  // across the entire sea. Dropping every fragment at or below sea level
  // leaves the water exactly as it was before this task and puts the
  // coastline on the interpolated h = 0 contour, which is where it belongs.
  material.colorNode = Fn(() => {
    Discard(vertexHeightM.lessThanEqual(0))
    return shaded
  })()

  return material
}

/** The unit grid every patch instances: `LOD.quadsPerNode` quads a side,
 *  spanning [-0.5, 0.5] in x and z at y = 0, so a patch is `positionLocal *
 *  sizeM + centre`. Wound counter-clockwise seen from above, because
 *  three's default FrontSide culls the other way round and a grid wound
 *  backwards draws nothing at all from an aeroplane. */
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
 */
export function createTerrainMesh(header: TerrainHeader): TerrainMesh {
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
  const { position, index } = createGridAttributes()
  const cameraXZ = uniform(new Vector2())

  const textures = new Map<number, DataTexture>()
  for (let level = FINEST_FETCHED_LEVEL; level <= coarsestLevel; level++) {
    const n = samplesAtLevel(header, level)
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
    textures.set(level, tex)
  }

  const levelTexture = (level: number): DataTexture => {
    const tex = textures.get(level)
    if (!tex) {
      throw new Error(
        `terrain level ${level} has no texture: this build holds levels ` +
          `${FINEST_FETCHED_LEVEL}..${coarsestLevel}`,
      )
    }
    return tex
  }

  const object = new Group()
  const geometries: InstancedBufferGeometry[] = []
  for (let ring = 0; ring < LOD.rings; ring++) {
    const { fine, coarse } = sampleLevelsForRing(ring, FINEST_FETCHED_LEVEL, coarsestLevel)
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute('position', position)
    geometry.setIndex(index)
    geometry.setAttribute('nodeSpec', newSpecAttribute(INITIAL_RING_CAPACITY))
    geometry.instanceCount = 0
    const mesh = new Mesh(
      geometry,
      createRingMaterial(
        levelTexture(fine),
        samplesAtLevel(header, fine),
        levelTexture(coarse),
        samplesAtLevel(header, coarse),
        header.halfExtentM,
        cameraXZ,
      ),
    )
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

    shaderCameraXZ: () => cameraXZ.value,

    setLevel(level: number, data: Int16Array): void {
      const tex = levelTexture(level)
      const n = samplesAtLevel(header, level)
      if (data.length !== n * n) {
        throw new Error(`terrain level ${level} expects ${n}x${n} = ${n * n} samples, got ${data.length}`)
      }
      // Decimetres on disk (header.encoding), metres in the shader: the one
      // place that conversion happens, so no TSL node has to remember it.
      const out = tex.image.data as Float32Array
      for (let i = 0; i < data.length; i++) out[i] = data[i]! / 10
      tex.needsUpdate = true
    },

    update(cameraX: number, cameraZ: number): void {
      cameraXZ.value.set(cameraX, cameraZ)
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
