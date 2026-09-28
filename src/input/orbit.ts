/**
 * Where the pilot has swung the chase camera, relative to its default place
 * behind and above the airplane (orbit camera spec, 2026-09-27).
 *
 * An OFFSET on chase, like `LookOffset` is on both modes, not a mode of its
 * own (spec ruling OC-1): an unmoved orbit IS today's chase view. Measured in
 * the chase frame (heading + 0.92 x pitch, roll discarded), so a swing to the
 * wingtip stays on the wingtip through a turn -- Mark's "tethered".
 */
export type OrbitOffset = {
  /** Positive swings the eye to the airplane's LEFT (plan ruling P-4). Wrapped to (-PI, PI]. */
  readonly yawRad: number
  /** Positive raises the eye. Clamped to [ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD]. */
  readonly pitchRad: number
  /** Multiplies the chase distance. Clamped to [ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX]. */
  readonly zoom: number
}

export const ORBIT_ZERO: OrbitOffset = { yawRad: 0, pitchRad: 0, zoom: 1 }

/** One frame's worth of mouse input on the canvas, already folded together. */
export type MouseDelta = {
  readonly dxPx: number
  readonly dyPx: number
  /** Positive = scroll down = zoom out. Fractional for trackpads. */
  readonly wheelNotches: number
  /** A double-click this frame. */
  readonly reset: boolean
}
export const NO_MOUSE: MouseDelta = { dxPx: 0, dyPx: 0, wheelNotches: 0, reset: false }

export const ORBIT_RAD_PER_PX = (0.3 * Math.PI) / 180
/** Plan ruling P-1: the default eye already sits ~15 deg up, so +60 tops out near 75 deg, short of overhead. */
export const ORBIT_PITCH_MAX_RAD = (60 * Math.PI) / 180
export const ORBIT_PITCH_MIN_RAD = (-80 * Math.PI) / 180
export const ORBIT_ZOOM_MIN = 0.4
export const ORBIT_ZOOM_MAX = 4
export const ORBIT_ZOOM_PER_NOTCH = 1.1

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const wrapPi = (a: number): number => {
  const w = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI))
  return w === -Math.PI ? Math.PI : w
}

/** Drag = globe-style swing (drag right -> +yaw, drag down -> +pitch, ruling P-4); wheel = zoom. */
export function orbitFromMouse(prev: OrbitOffset, m: MouseDelta): OrbitOffset {
  if (m.reset) return ORBIT_ZERO
  if (m.dxPx === 0 && m.dyPx === 0 && m.wheelNotches === 0) return prev
  return {
    yawRad: wrapPi(prev.yawRad + m.dxPx * ORBIT_RAD_PER_PX),
    pitchRad: clamp(prev.pitchRad + m.dyPx * ORBIT_RAD_PER_PX, ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD),
    zoom: clamp(prev.zoom * ORBIT_ZOOM_PER_NOTCH ** m.wheelNotches, ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX),
  }
}

/** `WheelEvent.deltaY` in notches: DOM_DELTA_PIXEL (0) is ~100 px a notch in Chromium, LINE (1) is 3 lines, PAGE (2) is one. */
export function wheelNotches(deltaY: number, deltaMode: number): number {
  return deltaMode === 0 ? deltaY / 100 : deltaMode === 1 ? deltaY / 3 : deltaY
}

export function addMouse(a: MouseDelta, b: MouseDelta): MouseDelta {
  return { dxPx: a.dxPx + b.dxPx, dyPx: a.dyPx + b.dyPx, wheelNotches: a.wheelNotches + b.wheelNotches, reset: a.reset || b.reset }
}
