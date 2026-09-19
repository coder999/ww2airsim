import { DirectionalLight, Group, HemisphereLight, Vector3, type Object3D } from 'three'
import { uniform } from 'three/tsl'

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
export function createLighting(): Object3D {
  const group = new Group()
  const sun = new DirectionalLight(0xfff2e0, 2.5)
  sun.position.set(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z)
  sun.target.position.set(0, 0, 0)
  group.add(sun, sun.target)
  group.add(new HemisphereLight(0x9eb8cc, 0x18384f, 0.8))
  return group
}
