import { DirectionalLight, Group, HemisphereLight, type Object3D } from 'three'

/**
 * Direction from the ground TOWARD the sun, unnormalised: a late-morning sun
 * high and slightly behind the spawn heading, chosen so relief reads as
 * relief rather than as flat colour.
 *
 * Exported because `src/render/terrain/mesh.ts` shades the terrain itself --
 * it is a `MeshBasicNodeMaterial` running its own lambert term in a TSL node
 * rather than a lit material, so the scene's `DirectionalLight` below cannot
 * reach it. Two literals for one sun is how the terrain ends up lit from a
 * different direction than the airplane parked on it, with nothing headless
 * able to see the difference.
 */
export const SUN_DIRECTION = { x: 0.4, y: 1, z: 0.3 } as const

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
