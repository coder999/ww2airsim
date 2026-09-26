// src/render/hangar/framing.ts
/** Turntable framing, pure so it is a test (Hangar spec §6). */
export type CameraPreset = 'side' | 'front' | 'top' | 'three-quarter'
export const CAMERA_PRESETS: readonly CameraPreset[] = ['side', 'front', 'top', 'three-quarter']

/** Distance at which a sphere of `radius` fills `fill` of the smaller of the
 *  view's two angular extents. */
export function framingDistance(radius: number, vfovDeg: number, aspect: number, fill = 0.8): number {
  const halfV = (vfovDeg * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  const half = Math.min(halfV, halfH)
  return radius / Math.sin(half * fill)
}

/** Unit direction from the target toward the camera, in the model frame
 *  (+X nose or bow, +Y up, +Z right). 'side' looks at the right side. */
export function presetDirection(p: CameraPreset): [number, number, number] {
  const n = (x: number, y: number, z: number): [number, number, number] => {
    const l = Math.hypot(x, y, z)
    return [x / l, y / l, z / l]
  }
  switch (p) {
    case 'side': return [0, 0, 1]
    case 'front': return [1, 0, 0]
    case 'top': return n(0, 1, 0.0001) // a hair off vertical so OrbitControls keeps an up vector
    case 'three-quarter': return n(1, 0.5, 1)
  }
}
