import type { Object3D } from 'three'

/** Implemented by every airframe module (hellcat.ts, wildcat.ts). One
 *  content id, one mesh, one interface: main.ts and scenarioEntities.ts
 *  drive whichever concrete airframe a scenario names through this alone,
 *  so adding a third aircraft type later touches neither of those files'
 *  render-loop logic, only a new module satisfying this shape. */
export interface Airframe {
  readonly root: Object3D
  setStores(bombsLeft: number, rocketsLeft: number): void
  spinProp(deltaRadians: number): void
  setGear(fraction: number): void
}
