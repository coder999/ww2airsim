// tools/models/stages/yaw.ts
import type { Document } from '@gltf-transform/core'
import type { Axis } from '../manifest.js'
import { onlyScene } from '../document.js'
import { axisVector, cross } from './axes.js'

/**
 * Stage 0 (R3): turns the whole scene `yawDeg` (right-handed) about the source `up` axis
 * through the source origin, so a download posed at an angle faces an axis. manilov.ap's
 * files are showcase-posed about 31 deg off (measured 2026-09-26). Every later coordinate in
 * the entry (split boxes, pivots, origin) is in this turned frame, which
 * `npm run models:inspect -- <glb> --yaw <deg>` and `npm run models:rig -- ... --yaw <deg>`
 * print. It wraps the scene's roots in one node; collapse, split and normalize read world
 * matrices, and normalize's clean-up dissolves the wrapper.
 */
export function yawScene(doc: Document, up: Axis, yawDeg: number): void {
  if (yawDeg === 0) return
  const scene = onlyScene(doc)
  const [ax, ay, az] = axisVector(up)
  const h = (yawDeg * Math.PI) / 360
  const s = Math.sin(h)
  const wrap = doc.createNode('__r3_yaw').setRotation([ax * s, ay * s, az * s, Math.cos(h)])
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    wrap.addChild(child)
  }
  scene.addChild(wrap)
}

/**
 * Stage 0b: turns the whole scene `pitchDeg` (right-handed, positive raises the nose) about the
 * lateral axis, forward x up, through the source origin. The A6M2 download is drawn sitting on
 * its three points, 12.36 deg nose-up (2026-09-29); this levels it to its own thrust line.
 */
export function pitchScene(doc: Document, forward: Axis, up: Axis, pitchDeg: number): void {
  if (pitchDeg === 0) return
  const scene = onlyScene(doc)
  const [ax, ay, az] = cross(axisVector(forward), axisVector(up))
  const h = (pitchDeg * Math.PI) / 360
  const s = Math.sin(h)
  const wrap = doc.createNode('__pitch').setRotation([ax * s, ay * s, az * s, Math.cos(h)])
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    wrap.addChild(child)
  }
  scene.addChild(wrap)
}
