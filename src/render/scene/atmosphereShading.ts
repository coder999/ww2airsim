import type { Node } from 'three/webgpu'
import { clamp, color, float, max, mix, pow, smoothstep, sqrt, vec3, vec4 } from 'three/tsl'
import { AP_MAX_DISTANCE_M, getAtmosphereLuts } from '../sky/atmosphereLuts.js'
import { SUN_ILLUMINANCE } from '../sky/palette.js'
import { ATMOSPHERE } from '../sky/atmosphere.js'
import { FOG_DISTANCE_M } from '../horizon.js'
import { skyIrradianceUpNode, sunColorNode, sunDirectionNode, twilightHorizonNode, twilightZenithNode } from './lighting.js'
import { SEA_COLOUR } from './water.js'

/**
 * The atmosphere LUTs in scene units (photoreal Task 9, spec §4.3): every
 * consumer -- the dome, the terrain, the ocean, the clouds -- reads the sky
 * and the aerial perspective through these functions, so the one
 * `SUN_ILLUMINANCE` scale and the dusk floor are applied in exactly one place.
 *
 * They bind to the `getAtmosphereLuts()` singleton when the caller's graph is
 * BUILT (Task 8 note); main.ts creates it before any scene object.
 */

/** Sky radiance along a world direction: the sky-view LUT × SUN_ILLUMINANCE
 *  plus the dusk floor's dome gradient (0 in daylight). */
export function skyRadiance(dir: Node<'vec3'>): Node<'vec3'> {
  const d = dir.normalize()
  const floor = mix(twilightHorizonNode, twilightZenithNode, clamp(d.y, 0, 1))
  return getAtmosphereLuts().skyRadianceNode(d).mul(SUN_ILLUMINANCE).add(floor)
}

/**
 * Aerial perspective for a surface at `distanceM` along the eye-relative
 * direction `dir`, as ONE vec4 to apply as `shaded = lit * ap.a + ap.rgb`:
 * `rgb` is the in-scattered light (scene units, the dusk floor included in
 * proportion to the opacity), `a` the transmittance. One vec4 so a vertex
 * stage can pass it as one varying.
 *
 * Valid for in-frustum directions only (Task 8's LUT is built in the
 * camera's frustum); terrain, ocean and cloud fragments are on screen.
 *
 * Beyond the LUT's range (`AP_MAX_DISTANCE_M`, 100 km) -- only the 400 km
 * sea goes there -- it is extrapolated as a homogeneous medium from the
 * 100 km value: T(d) = T100^(d/100 km), and the in-scatter approaches the
 * same limit rgb100 / (1 − T100) as T falls. Continuous at 100 km, and it
 * carries the sea smoothly into the haze at the horizon instead of the
 * clamped LUT's constant ring.
 */
export function aerialPerspective(dir: Node<'vec3'>, distanceM: Node<'float'>): Node<'vec4'> {
  const d = dir.normalize()
  const ap = getAtmosphereLuts().aerialPerspectiveNode(d, distanceM)
  const t100 = ap.a
  const rgb100 = ap.rgb.mul(SUN_ILLUMINANCE).add(twilightHorizonNode.mul(float(1).sub(t100)))
  const k = max(distanceM.div(AP_MAX_DISTANCE_M), 1)
  const t = pow(max(t100, 1e-4), k)
  const rgb = rgb100.mul(float(1).sub(t).div(max(float(1).sub(t100), 1e-4)))
  return vec4(rgb, t)
}

/** Where the terrain's far fade begins: the last 10% of `FOG_DISTANCE_M`. */
export const FAR_FADE_START_M = 0.9 * FOG_DISTANCE_M

/**
 * The terrain's far fade weight, 0 near to exactly 1 at the draw distance.
 *
 * The far-plane invariant (spec §4.3; horizon.ts `FOG_DISTANCE_M`): terrain
 * at the draw distance must be indistinguishable from what is behind it.
 * The aerial perspective alone does not guarantee that -- at 100 km it is not
 * opaque (transmittance ~0.36 from 1900 m, Task 8's readback) -- and what
 * replaces clipped terrain is the SEA (the ocean runs to 400 km), not the
 * sky. So over the last 10% the terrain's lit color blends toward
 * `farSeaColor`, the ocean's own far-field color along the same ray, before
 * the shared aerial perspective; land and sea then meet the draw distance in
 * one color. An earlier version faded toward the horizon sky and left a pale
 * ring where land met sea from altitude (high-6000, read 2026-09-25).
 */
export function farFadeWeight(distanceM: Node<'float'>): Node<'float'> {
  return smoothstep(FAR_FADE_START_M, FOG_DISTANCE_M, distanceM)
}

/** The mirrored sky the flat sea reflects, never below the true horizon: the
 *  sky-view texel row at the horizon mixes sky and ground (Task 8), so the
 *  lookup is raised to `trueHorizonSin() + MIRROR_MIN_Y_ABOVE_HORIZON`. */
export const MIRROR_MIN_Y_ABOVE_HORIZON = 0.004
export function mirroredSky(dir: Node<'vec3'>): Node<'vec3'> {
  const d = dir.normalize()
  return skyRadiance(vec3(d.x, max(d.y.negate(), trueHorizonSin().add(MIRROR_MIN_Y_ABOVE_HORIZON)), d.z))
}

/** Irradiance on the up-facing sea, as albedo/π scale: the transmitted sun
 *  on the horizontal plus the sky's (dusk floor included), divided by π. */
export function seaIrradianceOverPi(): Node<'vec3'> {
  return sunColorNode.mul(max(sunDirectionNode.normalize().y, 0)).add(skyIrradianceUpNode).mul(1 / Math.PI)
}

/**
 * The ocean's color (before aerial perspective) where its waves have faded,
 * i.e. at the terrain's draw distance: ocean/mesh.ts's formula with a flat
 * normal -- deep-water subsurface and the mirrored sky, Schlick-Fresnel
 * weighted. Kept here beside the terrain's fade so the two cannot drift; the
 * ocean mesh reads `mirroredSky` and `seaIrradianceOverPi` from here too.
 */
export function farSeaColor(dir: Node<'vec3'>): Node<'vec3'> {
  const d = dir.normalize()
  const cosView = clamp(d.y.negate(), 0, 1)
  const fresnel = float(0.0204).add(pow(float(1).sub(cosView), 5).mul(0.9796))
  const subsurface = (color(SEA_COLOUR) as unknown as Node<'vec3'>).mul(seaIrradianceOverPi())
  return mix(subsurface, mirroredSky(d), fresnel)
}

/** Sine of the true horizon's elevation at the eye: 0 at sea level, -0.043
 *  (-2.5 deg) at 6000 m. From altitude the sky reaches down to it. */
export function trueHorizonSin(): Node<'float'> {
  const h = getAtmosphereLuts().eyeAltitude
  const r = h.add(ATMOSPHERE.bottomRadiusM)
  return sqrt(h.mul(h.add(2 * ATMOSPHERE.bottomRadiusM))).div(r).negate()
}
