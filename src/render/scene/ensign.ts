import { DataTexture, DoubleSide, Mesh, PlaneGeometry, SRGBColorSpace, LinearMipmapLinearFilter } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { float, positionLocal, sin, time, vec3 } from 'three/tsl'
import type { ShipSpec } from '../../sim/world/ships.js'

/**
 * A warship's ensign (Track M, M1f Ruling F2, Mark 2026-10-09): historical, waving. US ships fly the
 * 48-star ensign, IJN warships the Rising Sun naval ensign, and a merchant none. The spec's
 * `view.ensign` places the hoist's top corner in the ship frame (+x bow, y up from the waterline);
 * the flag streams aft (-x) from there, as it does from a gaff with the ship under way.
 *
 * The cloth is drawn here, not in the glb, so every ship gets it the same way whether it is a
 * download or a Blender build, and the flag can change with the spec. It costs one draw per ship,
 * outside the model's budget (it hangs in the hull group beside the trap band, not under the model).
 */
export type EnsignFlag = 'us48' | 'ijn-rising-sun'

/** Fly to hoist: the US ensign is 1.9 : 1 (Executive Order 10834's proportions, unchanged for 48
 *  stars since 1912); the IJN naval ensign 1.5 : 1 (its 1889 regulation). */
export const ENSIGN_ASPECT: Readonly<Record<EnsignFlag, number>> = { us48: 1.9, 'ijn-rising-sun': 1.5 }

const OLD_GLORY_RED: readonly [number, number, number] = [178, 34, 52]
const OLD_GLORY_BLUE: readonly [number, number, number] = [60, 59, 110]
const WHITE: readonly [number, number, number] = [245, 245, 240]
const IJN_RED: readonly [number, number, number] = [188, 0, 45]

/** Whether (x, y), relative to a five-pointed star's center (y up), is inside a star of outer radius r. */
function inStar(x: number, y: number, r: number): boolean {
  const d = Math.hypot(x, y)
  if (d > r) return false
  const a = Math.atan2(x, y) // 0 at the top point
  const sector = (2 * Math.PI) / 5
  const t = Math.abs(((a % sector) + sector) % sector - sector / 2) / (sector / 2) // 1 at a point, 0 between
  const inner = 0.382 * r // a regular star's inner radius
  return d <= inner + (r - inner) * t ** 2
}

/**
 * The flag's color at (u, v): u from the hoist (0) to the fly (1), v from the top (0) to the bottom (1).
 * US: 13 stripes, red at top and bottom; the canton 7 stripes deep and 0.76 hoists wide; 48 stars in
 * 6 rows of 8 (the 1912 order's spacing). IJN: a red disc half the hoist across, its center 1/36 of the
 * fly toward the hoist (ESTIMATE of the regulation drawing), with 16 red rays of 11.25 degrees.
 */
export function ensignColor(flag: EnsignFlag, u: number, v: number): readonly [number, number, number] {
  const aspect = ENSIGN_ASPECT[flag]
  const x = u * aspect, y = v // hoists
  if (flag === 'us48') {
    if (x < 0.76 && y < 7 / 13) {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 8; col++) {
          const cx = 0.063 + col * 0.0906, cy = 0.054 + row * 0.0864
          if (inStar(x - cx, cy - y, 0.0308)) return WHITE
        }
      }
      return OLD_GLORY_BLUE
    }
    return Math.floor(y * 13) % 2 === 0 ? OLD_GLORY_RED : WHITE
  }
  const cx = aspect / 2 - aspect / 36, cy = 0.5
  const dx = x - cx, dy = y - cy
  if (Math.hypot(dx, dy) <= 0.25) return IJN_RED
  const ray = Math.floor(((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 16))
  return ray % 2 === 0 ? IJN_RED : WHITE
}

const textures = new Map<EnsignFlag, DataTexture>()
/** One texture per flag, shared by every ship flying it (never disposed: two 256-wide images). */
export function ensignTexture(flag: EnsignFlag): DataTexture {
  const cached = textures.get(flag)
  if (cached) return cached
  const w = 256, h = Math.round(w / ENSIGN_ASPECT[flag])
  const data = new Uint8Array(w * h * 4)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = ensignColor(flag, 1 - (i + 0.5) / w, (j + 0.5) / h) // the plane's u = 1 edge is the hoist (createEnsign)
      const k = ((h - 1 - j) * w + i) * 4 // DataTexture row 0 is the bottom
      data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255
    }
  }
  const t = new DataTexture(data, w, h)
  t.colorSpace = SRGBColorSpace
  t.generateMipmaps = true
  t.minFilter = LinearMipmapLinearFilter
  t.needsUpdate = true
  textures.set(flag, t)
  return t
}

/** The wave: a traveling sine across the cloth, zero at the hoist and growing to the fly. ESTIMATES:
 *  1.6 rad/s, 1.5 waves along the fly, an amplitude of 6% of the fly length at the fly. */
export const ENSIGN_WAVE = { radPerS: 1.6 * Math.PI, waves: 1.5, amplitude: 0.06 } as const

/** Sideways (z) displacement at fraction u of the fly (0 hoist, 1 fly) at time t, in fly lengths: the
 *  CPU statement of the material's positionNode below, which tests read against each other. */
export function ensignWaveZ(u: number, t: number): number {
  return Math.sin(ENSIGN_WAVE.radPerS * t - 2 * Math.PI * ENSIGN_WAVE.waves * u) * ENSIGN_WAVE.amplitude * u
}

/** The flag for `spec`, or null when it flies none. Named `ensign`, child of the hull group. */
export function createEnsign(spec: ShipSpec): Mesh<PlaneGeometry, MeshStandardNodeMaterial> | null {
  const e = spec.view?.ensign
  if (e === undefined) return null
  const fly = e.flyM, hoist = fly / ENSIGN_ASPECT[e.flag]
  const geometry = new PlaneGeometry(fly, hoist, 12, 4)
  geometry.translate(-fly / 2, -hoist / 2, 0) // the hoist's top corner at the origin, streaming aft
  const material = new MeshStandardNodeMaterial({ map: ensignTexture(e.flag), side: DoubleSide, roughness: 0.9, metalness: 0 })
  const u = positionLocal.x.negate().div(fly)
  const wave = sin(time.mul(ENSIGN_WAVE.radPerS).sub(u.mul(2 * Math.PI * ENSIGN_WAVE.waves))).mul(u).mul(float(ENSIGN_WAVE.amplitude * fly))
  material.positionNode = vec3(positionLocal.x, positionLocal.y, positionLocal.z.add(wave))
  const flag = new Mesh(geometry, material)
  flag.name = 'ensign'
  flag.position.set(e.at[0], e.at[1], e.at[2])
  return flag
}
