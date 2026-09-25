import { Color, DirectionalLight, Group, HemisphereLight, Vector3, type Object3D } from 'three'
import { uniform } from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'
import type { Vec3 } from '../../sim/math/vec3.js'
import { directAtmospherePalette, type SkyPalette } from '../sky/palette.js'

/**
 * Direction from the ground TOWARD the sun, unnormalised: a late-morning sun
 * high and slightly behind the spawn heading, chosen so relief reads as
 * relief rather than as flat colour.
 *
 * Exported because `src/render/terrain/mesh.ts` shades the terrain itself --
 * it is a `MeshBasicNodeMaterial` running its own lambert term in a TSL node
 * rather than a lit material, so the scene's `DirectionalLight` below cannot
 * reach it. Since Plan 16b every shader reads `sunDirectionNode` below, and
 * `scene.test.ts` pins the light's position to it.
 */
export const SUN_DIRECTION = { x: 0.4, y: 1, z: 0.3 } as const

/**
 * The same direction as a uniform (Plan 16b). The terrain's lambert, the
 * cloud light march and the cloud-shadow projection all read THIS, and
 * `createLighting` positions the DirectionalLight from the same constant;
 * `scene.test.ts` pins the two together. 16c (movable sun) drives this
 * value and the light's position from one clock and touches nothing else.
 * Unnormalized, like the constant: readers normalize.
 */
export const sunDirectionNode = uniform(new Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z))

/**
 * The palette as uniforms (Plan 16c; from the atmosphere since photoreal
 * Task 9, `sky/palette.ts`). Written once per frame by `applySun`. All are
 * scene-linear and already scaled by `SUN_ILLUMINANCE`. Controller ruling P3
 * names `sunColorNode`, `skyIrradianceUpNode` and `skyIrradianceDownNode`;
 * later tasks read them by those names.
 *
 *  - `sunColorNode`: the transmitted sun's irradiance on a surface facing it
 *    (the DirectionalLight's color × intensity). Black below the dusk floor.
 *  - `skyIrradianceUpNode` / `skyIrradianceDownNode`: sky irradiance on an
 *    up-facing / down-facing surface (the HemisphereLight's sky / ground),
 *    dusk floor included.
 *  - `twilightZenithNode` / `twilightHorizonNode`: the dusk floor's dome
 *    radiance as currently weighted -- 0 in daylight. The dome and the aerial
 *    perspective add these over the model (`atmosphereShading.ts`).
 *
 * Initialized from the noon sea-level palette so a consumer built before the
 * first frame renders a plausible day -- by one direct evaluation, not the
 * irradiance table, whose build main.ts schedules during boot's load phase.
 */
const initial = directAtmospherePalette(0, 68)
const vec3Uniform = (c: readonly [number, number, number]): UniformNode<'vec3', Color> =>
  uniform(new Color(...c)) as unknown as UniformNode<'vec3', Color>
export const sunColorNode = vec3Uniform(initial.sunColor)
export const skyIrradianceUpNode = vec3Uniform(initial.fillSky)
export const skyIrradianceDownNode = vec3Uniform(initial.fillGround)
export const twilightZenithNode = vec3Uniform(initial.zenith)
export const twilightHorizonNode = vec3Uniform(initial.horizon)
export const sunElevationNode = uniform(68)

/** Drives the two lights and every sun/sky uniform from one palette and one
 *  direction. `direction` is the unit vector toward the sun (sun.ts); it is
 *  stored unnormalized-compatible, as `SUN_DIRECTION` always was. */
export function applySun(lights: Object3D, palette: SkyPalette, direction: Vec3, elevationDeg: number): void {
  const sun = lights.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)
  const fill = lights.children.find((c): c is HemisphereLight => c instanceof HemisphereLight)
  if (!sun || !fill) throw new Error('applySun: the lighting group must hold the sun and the fill')
  sun.position.set(direction.x, direction.y, direction.z)
  sun.color.setRGB(...palette.sunColor)
  sun.intensity = palette.sunIntensity
  // HemisphereLightNode: irradiance = mix(ground, sky, 0.5 + 0.5 n.y) x intensity.
  fill.color.setRGB(...palette.fillSky)
  fill.groundColor.setRGB(...palette.fillGround)
  fill.intensity = 1
  sunDirectionNode.value.set(direction.x, direction.y, direction.z)
  sunColorNode.value.setRGB(...palette.sunColor).multiplyScalar(palette.sunIntensity)
  skyIrradianceUpNode.value.setRGB(...palette.fillSky)
  skyIrradianceDownNode.value.setRGB(...palette.fillGround)
  twilightZenithNode.value.setRGB(...palette.zenith)
  twilightHorizonNode.value.setRGB(...palette.horizon)
  sunElevationNode.value = elevationDeg
}

/**
 * A sun and a sky/sea bounce. The sun's target is parented alongside it: a
 * DirectionalLight points from its position to its target, and the frame
 * loop translates the whole scene by -eye for camera-relative rendering. A
 * target left at the default world origin would then swing the sun around
 * as the airplane moves.
 *
 * Every other material in this scene is a lit `MeshStandardMaterial`
 * (water.ts, markers.ts, hellcat.ts); with no light source they all render
 * black, and no Tier 1 test can see that -- appearance is unobservable
 * headless, so this file's existence is what the review that required it
 * is actually checking for.
 */
export function createLighting(shadowNode?: Node<'float'>): Object3D {
  const group = new Group()
  const sun = new DirectionalLight(new Color(...initial.sunColor), initial.sunIntensity)
  sun.position.set(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z)
  if (shadowNode !== undefined) {
    // Plan 16b: three multiplies this light's direct term by the node on
    // every receiver (AnalyticLightNode.setupShadow, r186) and, given a
    // custom node, allocates no shadow map. `shadowNode` is read off
    // `light.shadow` at runtime but is not in @types/three 0.186.
    sun.castShadow = true
    ;(sun.shadow as unknown as { shadowNode: Node<'float'> }).shadowNode = shadowNode
  }
  sun.target.position.set(0, 0, 0)
  group.add(sun, sun.target)
  group.add(new HemisphereLight(new Color(...initial.fillSky), new Color(...initial.fillGround), 1))
  return group
}
