import { Color, type Material, type Mesh, type MeshBasicMaterial, type Object3D } from 'three'
import { exposureFor } from '../exposure.js'
import { COCKPIT_LAYOUTS } from './cockpitLayouts.js'

/**
 * Night dimming of the cockpit panel (F6A, plan §1 item 4; Mark 2026-10-14: "the
 * cockpit is a bit too bright at night"). The panel and gauges are
 * `MeshBasicMaterial`s, which no light can darken, so a night factor scales
 * their colors directly. `cockpitDimFor` is the automatic night factor (1 in
 * daylight, `NIGHT_COCKPIT_DIM` by -9 degrees, the dusk the J5 chapter flies in);
 * Task 8's three-step dimmer multiplies a player setting on top of it.
 *
 * LEGIBILITY. Dimming scales every color by the same linear factor k, so a
 * gauge's contrast falls but its ordering does not change. The WCAG 2.1
 * contrast ratio of a mark over its face after dimming is
 * (k L_mark + 0.05) / (k L_face + 0.05); `tests/render/cockpitDim.test.ts`
 * asserts it for every cockpit family: needles and major marks at least 4.5:1
 * (SC 1.4.3, AA text), minor marks at least 3:1 (SC 1.4.11, non-text).
 */
export const NIGHT_COCKPIT_DIM = 0.35
export const COCKPIT_DIM_START_DEG = 0
export const COCKPIT_DIM_FULL_DEG = -9

/** Mutable so DEV `?night=cockpit:0.5` can try other values for a session. */
export const cockpitTuning = { nightDim: NIGHT_COCKPIT_DIM }

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/**
 * The APPARENT brightness of the panel relative to its daytime look: 1 with the sun at or above the
 * horizon, easing down to `nightDim` by -9 degrees and holding.
 */
export function apparentCockpitBrightness(sunElevationDeg: number, nightDim = cockpitTuning.nightDim): number {
  return 1 - (1 - nightDim) * smooth(COCKPIT_DIM_START_DEG, COCKPIT_DIM_FULL_DEG, sunElevationDeg)
}
/**
 * The factor to scale the panel's colors by. The frame's exposure (exposure.ts) lifts the whole picture
 * 2.8x at night, panel included, so a factor of `nightDim` alone would look as bright as by day:
 * the apparent brightness is divided by the exposure to compensate.
 */
export function cockpitDimFor(sunElevationDeg: number, nightDim = cockpitTuning.nightDim): number {
  return apparentCockpitBrightness(sunElevationDeg, nightDim) / exposureFor(sunElevationDeg)
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** WCAG relative luminance of a 0xRRGGBB color. */
export function relativeLuminance(hex: number): number {
  return 0.2126 * srgbToLinear(((hex >> 16) & 255) / 255) + 0.7152 * srgbToLinear(((hex >> 8) & 255) / 255) + 0.0722 * srgbToLinear((hex & 255) / 255)
}
/** WCAG contrast ratio of `fg` over `bg` after both are dimmed by the linear factor `k`. */
export function dimmedContrast(fg: number, bg: number, k: number): number {
  const a = k * relativeLuminance(fg) + 0.05, b = k * relativeLuminance(bg) + 0.05
  return Math.max(a, b) / Math.min(a, b)
}
/** Every cockpit family's gauge pairs, for the legibility test: [name, mark, face, minimum ratio]. */
export function gaugePairs(): readonly (readonly [string, number, number, number])[] {
  return Object.entries(COCKPIT_LAYOUTS).flatMap(([id, l]) => [
    [`${id} needle`, l.needleColor, l.faceColor, 4.5],
    [`${id} major marks`, l.majorMarkColor, l.faceColor, 4.5],
    [`${id} minor marks`, l.minorMarkColor, l.faceColor, 3],
  ] as const)
}

export type CockpitDimmer = {
  /** Scales every MeshBasicMaterial under `root` to `k` of its authored color. Idempotent for a given k. */
  apply(root: Object3D, k: number, live?: readonly Material[]): void
}

/**
 * `live` materials (passed to `apply`) are rewritten by `updatePanel` every frame (the gear, flap, hook and bay lamps),
 * so their authored color is whatever it holds NOW and they are scaled in place, after that update.
 * Warning lamps dim by sqrt(k): they must stay readable.
 */
export function createCockpitDimmer(): CockpitDimmer {
  const base = new WeakMap<Material, Color>()
  return {
    apply(root, k, live = []) {
      const liveSet = new Set<Material>(live)
      root.traverse((o) => {
        const m = (o as Mesh).material as Material | Material[] | undefined
        if (m === undefined) return
        for (const mat of Array.isArray(m) ? m : [m]) {
          if (!(mat as MeshBasicMaterial).isMeshBasicMaterial) continue
          const basic = mat as MeshBasicMaterial
          if (liveSet.has(mat)) { basic.color.multiplyScalar(Math.sqrt(k)); continue }
          let b = base.get(mat)
          if (b === undefined) { b = basic.color.clone(); base.set(mat, b) }
          basic.color.copy(b).multiplyScalar(k)
        }
      })
    },
  }
}
