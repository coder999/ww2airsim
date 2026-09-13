import { BackSide, Mesh, SphereGeometry, type Object3D } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { clamp, color, mix, positionLocal, step } from 'three/tsl'
import { SEA_COLOUR } from './water.js'

export const SKY_RADIUS_M = 45_000
/** Haze at the horizon. */
export const SKY_HAZE = 0x9eb8cc
/** Deep blue overhead. */
export const SKY_ZENITH = 0x29619f

/**
 * The dome's colour as a function of the vertical component of the unit
 * direction from its centre: -1 straight down, 0 the equator, +1 the zenith.
 *
 * Below the equator the dome is exactly the sea colour. This is I-1's real
 * fix and it is a COLOUR fix, not a size one. No finite flat plane can put
 * the water/dome boundary at eye level: a ray at angle t below eye level
 * meets the y = 0 plane at altitude/sin(t) but meets the dome at
 * `SKY_RADIUS_M`, so the dome is always the nearer surface near the horizon
 * and the boundary sits atan(altitude / SKY_RADIUS_M) below eye level no
 * matter how wide the water is. Measured 2026-09-13 from this project's own
 * constants: 0.76 degrees at the 600 m spawn, 2.54 at 2000 m, 7.59 at 6000 m.
 * Painting the dome below the equator with `SEA_COLOUR` makes that band
 * indistinguishable from the water at every altitude, and does so
 * independently of the order the two are drawn in -- which matters, because
 * this material writes no depth and nothing pins that order.
 *
 * This function and the TSL graph in `createSky` are the same rule written
 * twice, once for the GPU and once for a machine with no GPU to test it on.
 * They must change together; the expression is kept to one line each so the
 * correspondence is checkable by eye.
 */
export function domeColourFor(unitY: number): number {
  if (unitY <= 0) return SEA_COLOUR
  const h = Math.min(1, unitY * 0.5 + 0.5)
  const lerp = (a: number, b: number): number => Math.round(a + (b - a) * ((h - 0.5) * 2))
  return (
    (lerp((SKY_HAZE >> 16) & 0xff, (SKY_ZENITH >> 16) & 0xff) << 16) |
    (lerp((SKY_HAZE >> 8) & 0xff, (SKY_ZENITH >> 8) & 0xff) << 8) |
    lerp(SKY_HAZE & 0xff, SKY_ZENITH & 0xff)
  )
}

/**
 * Gradient dome. Attitude is judged against a horizon, so this is not optional.
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
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
  const y = positionLocal.normalize().y
  // Mirrors `domeColourFor`: sea below the equator, haze-to-zenith above it.
  const above = mix(color(SKY_HAZE), color(SKY_ZENITH), clamp(y, 0, 1))
  material.colorNode = mix(color(SEA_COLOUR), above, step(0, y))
  return new Mesh(new SphereGeometry(SKY_RADIUS_M, 32, 16), material)
}
