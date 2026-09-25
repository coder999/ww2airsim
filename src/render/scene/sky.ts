import { BackSide, Mesh, SphereGeometry, type Object3D } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { clamp, color, dot, float, mix, normalize, positionLocal, positionWorld, smoothstep, sqrt, step } from 'three/tsl'
import { sunDirectionNode } from './lighting.js'
import { skyRadiance } from './atmosphereShading.js'
import { getAtmosphereLuts } from '../sky/atmosphereLuts.js'
import { SUN_ILLUMINANCE } from '../sky/palette.js'
import { SEA_COLOUR } from './water.js'

export const SKY_RADIUS_M = 45_000

/**
 * Segments around the dome's equator.
 *
 * CORRECTED 2026-09-13, second pass. The first pass raised this to 128 and
 * justified it with a measurement that was wrong by about sixty times, so the
 * reasoning is recorded here rather than quietly replaced.
 *
 * The claim was that each chord "sagged 217 m below the true circle at 45 km,
 * about 5 px of scalloping". The 217 m sagitta is real but it is RADIAL, in
 * the horizontal plane -- the equator ring lies exactly in y = 0 at every
 * segment count, so the chords bow inward, not downward. What a pilot sees is
 * the change in DEPRESSION ANGLE of the equator between a vertex, at range R,
 * and a chord midpoint, at range R*cos(pi/N). Measured against three's own
 * SphereGeometry from the 600 m spawn at 1440p and a 60-degree field:
 *
 *                    600 m spawn    10,000 m (altimeter full scale)
 *     32 segments        0.089 px        1.41 px
 *     64 segments        0.022 px        0.35 px
 *
 * So 32 was already far below one pixel at the spawn, and the kink Mark saw
 * cannot have been this. It was the water's old square edge: at the pre-I-1
 * 20 km half-extent that edge sat 1.718 degrees below eye level along the
 * axes and 1.215 along the diagonals, a hard four-sided kink spanning about
 * 12 px, and widening the water is what removed it.
 *
 * The raise is still worth making, just not for the reason first given and
 * not by that much: the effect grows with altitude, and at the altimeter's
 * full scale 32 segments does cross a pixel. 64 puts it under a third of one
 * everywhere this plan can go, and the test checks the top of the range
 * rather than the spawn.
 */
const SKY_WIDTH_SEGMENTS = 64
/** Even, so a vertex ring lands exactly on the equator where the colour
 *  splits -- an odd count puts the split mid-triangle. 16 already satisfied
 *  that; the first pass raised it to 32 for no stated reason and no
 *  measurable gain, so it goes back too. */
const SKY_HEIGHT_SEGMENTS = 16
/** The sun's angular radius (half-angle), degrees: 0.533 deg across. */
export const SUN_ANGULAR_RADIUS_DEG = 0.2665
/**
 * The disc's radiance per unit of transmitted sun illuminance (scene units).
 * A physical disc is E / Ω = 1 / 6.8e-5 sr ≈ 15,000× the illuminance; that
 * overflows nothing in half float but turns TRAA's history and the bloom's
 * high pass into a white blot a hundred pixels wide. 40 puts the disc's
 * core at ~140 at noon -- two orders above the bloom threshold (pipeline.ts
 * `BLOOM_THRESHOLD` 1.2), so it blooms into a halo, and after AgX it reads
 * as the brightest thing in the frame (photoreal Task 9 ruling).
 */
export const SUN_DISC_RADIANCE = 40

/**
 * Whether the dome is sea or sky at a given vertical component of the unit
 * direction from its centre: -1 straight down, 0 the equator, +1 the zenith.
 *
 * This returns the BRANCH, not the ramp. An earlier version returned the
 * interpolated sky colour too and claimed to be "the same rule written twice",
 * once for the GPU and once for a machine with no GPU. It was not.
 * `three.ColorManagement` is on by default in 0.186, so `color(0x9eb8cc)` is
 * converted into the linear working space and the shader's `mix` interpolates
 * THERE, while plain JavaScript interpolating sRGB bytes interpolates in gamma
 * space. They agreed only at the two endpoints -- which were exactly the values
 * the test asserted -- and differed by up to 20 of 255 per channel mid-ramp.
 *
 * A mirror that is only correct where it is checked is worse than no mirror,
 * so the ramp is now the GPU's business alone and this function states the one
 * thing that is genuinely testable headless and genuinely matters: below the
 * equator the dome is exactly `SEA_COLOUR`.
 *
 * The boundary follows `step(0, y)`, which returns 1 at y === 0 and therefore
 * selects sky. The previous `unitY <= 0` disagreed with the shader on that
 * single value, and the test pinned the disagreement.
 *
 * The dome is a background pass (depth test/write disabled), drawn before
 * the terrain and ocean. The curved sea now extends beyond this sphere;
 * sphere depth must never occlude those more distant surfaces.
 */
export function domeColourFor(unitY: number): 'sea' | 'sky' {
  return unitY < 0 ? 'sea' : 'sky'
}

/**
 * The sky dome. Attitude is judged against a horizon, so this is not optional.
 *
 * Built with TSL rather than a GLSL ShaderMaterial: WebGPURenderer resolves
 * every mesh material through a `StandardNodeLibrary` that maps material
 * *type strings* (e.g. `'MeshStandardMaterial'`) to node-material classes --
 * `ShaderMaterial` is never registered there
 * (node_modules/three/src/renderers/webgpu/nodes/StandardNodeLibrary.js,
 * three@0.186.0, checked 2026-09-13). An unregistered type makes
 * `NodeLibrary.fromMaterial` return null, which
 * `node_modules/three/src/nodes/core/NodeBuilder.js:3156-3162` (same version,
 * same check) turns into `error('NodeBuilder: Material "ShaderMaterial" is
 * not compatible.')` and a silent fallback to a bare, colourless
 * `NodeMaterial()` -- a failure only visible on the reference platform,
 * never headless.
 */
export function createSky(): Object3D {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, depthTest: false })
  // The sea/sky branch is on the dome's OWN direction (`domeColourFor`), but
  // the radiance is looked up along the true VIEW direction. main.ts centres
  // the dome at sea level under the eye, not on the eye, so from altitude the
  // two differ by up to atan(eye.y / SKY_RADIUS_M) -- 7.6 deg at 6000 m. The
  // gradient never cared; the sky-view LUT does: sampling it along the
  // dome's direction put the horizon's bright band 7 deg too high and left
  // a pale strip with a hard edge between the sea's horizon and the sky
  // (high-6000 without clouds, read 2026-09-25). The scene is
  // camera-relative, so `positionWorld` IS the eye-to-fragment vector.
  const y = positionLocal.normalize().y
  const dir = positionWorld.normalize()
  // Photoreal Task 9 (spec §4.3): the sky-view LUT, in scene units, with the
  // dusk floor (atmosphereShading.ts). The radiance is the GPU's business.
  const above = skyRadiance(dir)
  // The physical sun disc: smoothstep over its angular radius, limb darkening
  // 1 - 0.6(1 - sqrt(1 - r^2)) with r the fraction of the radius, times the
  // transmittance toward the sun (which carries the below-horizon fade).
  // The cloud pass composites over it and dims it correctly.
  const sun = normalize(sunDirectionNode)
  const sinR = Math.sin(SUN_ANGULAR_RADIUS_DEG * Math.PI / 180)
  const d = dot(dir, sun)
  // Fraction of the radius from the chord, sin(angle) / sin(radius); the
  // `step` rejects the antipode, where the sine is small again.
  const rRaw = sqrt(clamp(float(1).sub(d.mul(d)), 0, 1)).div(sinR)
  const inside = float(1).sub(smoothstep(0.85, 1, rRaw)).mul(step(0, d))
  const r = clamp(rRaw, 0, 1)
  const limb = float(1).sub(float(1).sub(sqrt(float(1).sub(r.mul(r)))).mul(0.6))
  const disc = getAtmosphereLuts().sunTransmittanceNode().mul(SUN_ILLUMINANCE * SUN_DISC_RADIANCE).mul(limb.mul(inside))
  material.colorNode = mix(color(SEA_COLOUR), above.add(disc), step(0, y))
  const sky = new Mesh(new SphereGeometry(SKY_RADIUS_M, SKY_WIDTH_SEGMENTS, SKY_HEIGHT_SEGMENTS), material)
  // Background first: a 45 km dome must never paint over the 400 km ocean.
  sky.renderOrder = -1
  return sky
}
