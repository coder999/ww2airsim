import { DirectionalLight, Group, HemisphereLight, type Object3D } from 'three'

/**
 * A sun and a sky/sea bounce. The sun's target is parented alongside it: a
 * DirectionalLight points from its position to its target, and the frame
 * loop translates the whole scene by -eye for camera-relative rendering. A
 * target left at the default world origin would then swing the sun around
 * as the aeroplane moves.
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
  sun.position.set(0.4, 1, 0.3)
  sun.target.position.set(0, 0, 0)
  group.add(sun, sun.target)
  group.add(new HemisphereLight(0x9eb8cc, 0x18384f, 0.8))
  return group
}
