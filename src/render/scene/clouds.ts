import { BackSide, Data3DTexture, LinearFilter, Mesh, RedFormat, RepeatWrapping, SphereGeometry, UnsignedByteType, Vector2, Vector3, Vector4, type Object3D } from 'three'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'
import {
  Break, Fn, If, Loop, cameraFar, cameraNear, clamp, color, exp, float, fract, int, length, max, min, mix, normalize,
  positionView, positionWorld, screenCoordinate, sin, smoothstep, sqrt, texture3D, uniform, uniformArray, vec3, vec4, viewportLinearDepth,
} from 'three/tsl'
import { MAX_CLOUD_LAYERS, type CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import { DETAIL_SIZE, SHAPE_SIZE } from '../sky/noise.js'
import { FOG_DISTANCE_M, fogWeightNode, horizonSinkNode } from '../horizon.js'
import { SKY_HAZE, SKY_RADIUS_M } from './sky.js'
import { SUN_DIRECTION } from './lighting.js'

/**
 * Volumetric cloud layers (design: docs/superpowers/specs/2026-09-19-clouds-design.md §4).
 *
 * One dome, drawn after everything else, whose fragment marches the view ray
 * through each layer's slab, occluded per pixel by the scene depth. The world
 * is camera-relative, so the eye is the origin and the dome vertex direction
 * is the ray; `eyeWorld` (a uniform) restores true world coordinates for the
 * noise so clouds stay put as the airplane flies through them.
 */
export const CLOUD_TIERS = {
  high: { cumulusSteps: 48, lightSteps: 2, cirrusSteps: 8 },
  medium: { cumulusSteps: 32, lightSteps: 2, cirrusSteps: 6 },
  low: { cumulusSteps: 20, lightSteps: 1, cirrusSteps: 4 },
} as const
export type CloudTierName = keyof typeof CLOUD_TIERS

/** DEV-only `?cloudTier=off|high|medium|low`, for measuring one scene with and without. */
export const CLOUD_TIER_PARAM = 'cloudTier'
export function cloudTierFromQuery(search: string): CloudTierName | 'off' | undefined {
  const raw = new URLSearchParams(search).get(CLOUD_TIER_PARAM)
  if (raw === null) return undefined
  if (raw === 'off' || raw in CLOUD_TIERS) return raw as CloudTierName | 'off'
  throw new Error(`${CLOUD_TIER_PARAM}: ${JSON.stringify(raw)} is not a cloud tier`)
}

/** Where the noise has drifted to: the ground wind times simulated seconds. */
export function cloudDriftM(wind: Vec3 | null, seconds: number): { x: number; z: number } {
  return wind === null ? { x: 0, z: 0 } : { x: wind.x * seconds, z: wind.z * seconds }
}

/** Metres per repeat of the shape volume and of the detail volume. Gameplay
 *  estimates (design §9): a 128-texel tile over 6 km is 47 m per texel. */
const SHAPE_TILE_M = 6000
const DETAIL_TILE_M = 400
/** Extinction per metre at full density; ~250 m to opaque for cumulus. */
const CUMULUS_SIGMA = 0.012
/** Bound cumulus sampling to 125 m at high, after finding the actual curved
 * layer entry. Capping the old widened flat slab marched empty foreground
 * air and erased distant clouds. Cirrus keeps its full thin-sheet span. */
const MAX_MARCH_M = 6000
/** The committed shape volume's value range, from `tests/tools/skyNoise.test.ts`'s
 *  measurement of the 128-cube (110..247 of 255). */
const SHAPE_MIN = 110 / 255
const SHAPE_MAX = 247 / 255
/** The light march sees a softer extinction than the view ray: single
 *  scattering alone makes a cloud's core black, and the usual cheap stand-in
 *  for the multiple scattering that lights it is to under-count the shadow. */
const LIGHT_EXTINCTION_SCALE = 0.35
const CIRRUS_SIGMA = 0.0015
const KIND_CUMULUS = 0
const KIND_CIRRUS = 1

/** DEV-only `?cloudDebug=`: `nodepth` marches to the fog distance ignoring the
 *  scene depth; `depth` paints the depth bound as grey (black near, white at
 *  the fog distance) with full alpha. Both exist because the first GPU run
 *  (2026-09-19) drew almost nothing and the only way to tell "no density"
 *  from "no march" was to look at each in isolation. */
export const CLOUD_DEBUG_PARAM = 'cloudDebug'
export type CloudDebug = 'nodepth' | 'depth' | 'layer' | 'shape' | 'density' | 'slab' | 'point' | 'eye'
export function cloudDebugFromQuery(search: string): CloudDebug | undefined {
  const raw = new URLSearchParams(search).get(CLOUD_DEBUG_PARAM)
  if (raw === null) return undefined
  if (['nodepth', 'depth', 'layer', 'shape', 'density', 'slab', 'point', 'eye'].includes(raw)) return raw as CloudDebug
  throw new Error(`${CLOUD_DEBUG_PARAM}: ${JSON.stringify(raw)} is not a cloud debug mode`)
}

export type CloudsHandle = {
  readonly object: Object3D
  setTier(name: CloudTierName): void
  setDebug(mode: CloudDebug | undefined): void
  update(eyeWorld: Vec3, driftSeconds: number, wind: Vec3 | null): void
  dispose(): void
}

function volume(data: Uint8Array, size: number): Data3DTexture {
  const t = new Data3DTexture(data, size, size, size)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

export function createClouds(layers: readonly CloudLayer[], noise: SkyNoise): CloudsHandle {
  const sorted = [...layers].sort((a, b) => a.baseM - b.baseM)
  const shape = volume(noise.shape, SHAPE_SIZE)
  const detail = volume(noise.detail, DETAIL_SIZE)

  // Uniforms. Layers as [base, thickness, coverage, kind], padded to MAX.
  const layerData = uniformArray(
    Array.from({ length: MAX_CLOUD_LAYERS }, (_, i) => {
      const l = sorted[i]
      return l ? new Vector4(l.baseM, l.thicknessM, l.coverage, l.kind === 'cirrus' ? KIND_CIRRUS : KIND_CUMULUS) : new Vector4(0, 0, 0, 0)
    }),
    'vec4',
  )
  const layerCount = uniform(sorted.length, 'int')
  const eyeWorld = uniform(new Vector3())
  const drift = uniform(new Vector2())
  const cumulusSteps = uniform(CLOUD_TIERS.high.cumulusSteps, 'int')
  const cirrusSteps = uniform(CLOUD_TIERS.high.cirrusSteps, 'int')
  const lightSteps = uniform(CLOUD_TIERS.high.lightSteps, 'int')
  /** 0 normal, 1 ignore depth, 2 paint the depth bound. */
  const debug = uniform(0, 'int')

  const sun = normalize(vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z))
  const sunColor = color(0xfff2e0)
  const ambientTop = color(SKY_HAZE).mul(1.0)
  const ambientBottom = color(SKY_HAZE).mul(0.6)

  /** Density in [0, 1] at a world point for one layer; 0 outside the slab. */
  const density = Fn(([p, base, thickness, coverage, kind]: [Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
    const h = p.y.sub(base).div(thickness)
    const inside = h.greaterThan(0).and(h.lessThan(1))
    const d = float(0).toVar()
    If(inside, () => {
      const drifted = vec3(p.x.add(drift.x), p.y, p.z.add(drift.y))
      // The committed volume spans 110..247 of 255 (the Perlin-Worley remap
      // lifts the low end on purpose); stretched back to 0..1 here so
      // `coverage` means the fraction of sky it names.
      const stretch = (v: Node<'float'>): Node<'float'> => clamp(v.sub(SHAPE_MIN).div(SHAPE_MAX - SHAPE_MIN), 0, 1)
      // Coverage thresholds the shape: what survives above 1 - coverage is cloud.
      const threshold = (shapeValue: Node<'float'>): Node<'float'> =>
        clamp(shapeValue.sub(float(1).sub(coverage)).div(max(coverage, 0.001)), 0, 1)
      // ONE branch samples, never both: a `mix` of the two kinds after
      // sampling cost every cumulus step three volume reads instead of one
      // (3.9 ms against the 2.5 ms budget, 2026-09-19).
      If(kind.greaterThan(0.5), () => {
        // Cirrus: the same volume stretched along the east axis over a tile
        // three times wider, times a second coarser sample so the 1.5 km
        // Worley cells cannot read as a grid from below. A thin band.
        const streaks = texture3D(shape, drifted.mul(vec3(1 / (SHAPE_TILE_M * 9), 1 / SHAPE_TILE_M, 1 / (SHAPE_TILE_M * 3)))).r
        const sheet = texture3D(shape, drifted.mul(vec3(1 / (SHAPE_TILE_M * 4), 1 / (SHAPE_TILE_M * 2), 1 / (SHAPE_TILE_M * 5))).add(0.37)).r
        const gradient = smoothstep(0, 0.3, h).mul(smoothstep(1, 0.7, h))
        d.assign(threshold(stretch(streaks.mul(0.6).add(sheet.mul(0.4)))).mul(gradient).mul(0.6))
      }).Else(() => {
        // Cumulus: flat-bottomed, rounded on top, edges eroded by the detail
        // volume, strongest near the base and the edge (Schneider 2015).
        // Slowly warp the horizontal coordinates at two unequal scales:
        // the same 6 km volume must not line up in repeating distant rows.
        const warped = vec3(
          drifted.x.add(sin(drifted.z.div(7300).add(drifted.x.div(17000))).mul(1800)),
          drifted.y,
          drifted.z.add(sin(drifted.x.div(9100).sub(drifted.z.div(13000))).mul(1800)),
        )
        const shapeValue = stretch(texture3D(shape, warped.div(SHAPE_TILE_M)).r)
        const gradient = smoothstep(0, 0.1, h).mul(smoothstep(1, 0.55, h))
        const body = threshold(shapeValue).mul(gradient)
        const e = texture3D(detail, drifted.div(DETAIL_TILE_M)).r
        const erode = e.mul(float(1).sub(h)).mul(0.3)
        d.assign(clamp(body.sub(erode).div(max(float(1).sub(erode), 0.001)), 0, 1))
      })
    })
    return d
  })

  const material = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthTest: false, depthWrite: false })
  const march = Fn(() => {
    const dir = normalize(positionWorld)
    // Scene depth as a ray length: orthographic linear depth is view-space Z,
    // and the dome fragment's own view position gives the ray's angle to it.
    const viewZ = cameraNear.add(viewportLinearDepth.mul(cameraFar.sub(cameraNear)))
    const cosView = positionView.z.negate().div(length(positionView))
    const sceneT = debug.equal(int(1)).select(float(FOG_DISTANCE_M), min(viewZ.div(max(cosView, 0.001)), float(FOG_DISTANCE_M)))
    // Per-pixel start dither: interleaved gradient noise, hides step banding.
    const dither = fract(float(52.9829189).mul(fract(screenCoordinate.x.mul(0.06711056).add(screenCoordinate.y.mul(0.00583715)))))

    const transmittance = float(1).toVar()
    const scattered = vec3(0, 0, 0).toVar()
    const firstHitT = float(FOG_DISTANCE_M).toVar()
    const horizontal = length(dir.xz)
    const peakDensity = float(0).toVar()
    const slabEnter = float(0).toVar()
    const slabExit = float(0).toVar()

    Loop({ start: int(0), end: layerCount, type: 'int', condition: '<' }, ({ i }) => {
      // `uniformArray(..., 'vec4')` is typed `UniformArrayNode<string>` in
      // @types/three 0.186, so the element needs telling it is a vec4.
      const layer = layerData.element(i) as unknown as Node<'vec4'>
      // Captured into vars HERE, before the inner loops. TSL re-emits an
      // element lookup at every use, and every inner `Loop` also names its
      // counter `i` unless told otherwise, so an un-captured `layer.x` read
      // inside the step loop indexed the array by the STEP -- layer 2 and up
      // are zero, and the whole deck vanished (first GPU run, 2026-09-19).
      const base = layer.x.toVar()
      const thickness = layer.y.toVar()
      const coverage = layer.z.toVar()
      const kind = layer.w.toVar()
      const top = base.add(thickness).toVar()
      // Along the ray, curved altitude is y0 + dy*t + a*t*t. The interval
      // below the top, minus the interval below the base, gives up to TWO
      // cloud segments (a downward ray can leave and re-enter the layer).
      // Solve before capping: the old conservative flat slab began well
      // before the cloud, wasting steps and making a short march miss it.
      const a = horizonSinkNode(horizontal).toVar()
      const dy = dir.y
      const roots = Fn(([height]: [Node<'float'>]) => {
        const c = eyeWorld.y.sub(height).toVar()
        const discriminant = dy.mul(dy).sub(a.mul(c).mul(4)).toVar()
        const r = sqrt(max(discriminant, 0)).toVar()
        // Stable quadratic roots: avoid subtracting almost equal values.
        const q = dy.add(dy.greaterThanEqual(0).select(r, r.negate())).mul(-0.5).toVar()
        const u = q.div(max(a, 1e-12)).toVar()
        const v = c.div(q.abs().greaterThan(1e-12).select(q, float(1e-12))).toVar()
        return vec3(min(u, v), max(u, v), discriminant)
      })
      const topRoots = roots(top).toVar()
      const baseRoots = roots(base).toVar()
      const tEnter = max(topRoots.x, 0).toVar()
      const tExit = min(topRoots.y, sceneT).toVar()
      const gapEnter = tExit.toVar()
      const gapExit = tExit.toVar()
      If(baseRoots.z.greaterThan(0), () => {
        gapEnter.assign(clamp(baseRoots.x, tEnter, max(tEnter, tExit)))
        gapExit.assign(clamp(baseRoots.y, tEnter, max(tEnter, tExit)))
      })
      If(topRoots.z.lessThanEqual(0), () => { tExit.assign(tEnter) })
      // Vertical rays have no curvature and use the ordinary flat slab.
      If(a.lessThan(1e-12), () => {
        const tA = base.sub(eyeWorld.y).div(dy)
        const tB = top.sub(eyeWorld.y).div(dy)
        tEnter.assign(max(min(tA, tB), 0))
        tExit.assign(min(max(tA, tB), sceneT))
        gapEnter.assign(tExit)
        gapExit.assign(tExit)
      })
      const nearSpan = max(gapEnter.sub(tEnter), 0).toVar()
      const farSpan = max(tExit.sub(gapExit), 0).toVar()
      If(i.equal(int(0)), () => {
        slabEnter.assign(tEnter)
        slabExit.assign(tExit)
      })
      If(tExit.greaterThan(tEnter).and(transmittance.greaterThan(0.01)).and(coverage.greaterThan(0)), () => {
        const isCirrus = kind.greaterThan(0.5)
        const steps = isCirrus.select(cirrusSteps, cumulusSteps).toVar()
        const sigma = isCirrus.select(float(CIRRUS_SIGMA), float(CUMULUS_SIGMA)).toVar()
        // Converted ONCE into a float var: an inline `steps.toFloat()` used
        // twice emitted the second use as `f32 / i32`, which WGSL rejects.
        const stepsF = steps.toFloat().toVar()
        const fullSpan = nearSpan.add(farSpan).toVar()
        const span = isCirrus.select(fullSpan, min(fullSpan, float(MAX_MARCH_M))).toVar()
        const ds = span.div(stepsF).toVar()
        // With the finer cumulus spacing, half-strength jitter hides the
        // remaining bands without turning distant edges into pixel stipple.
        const jitter = isCirrus.select(dither, dither.mul(0.5).add(0.25))
        const walked = ds.mul(jitter).toVar()
        // `name` is honoured at runtime (LoopNode.js: `param.name || getVarName(i)`)
        // but absent from @types/three 0.186's overloads, hence the casts.
        Loop({ start: int(0), end: steps, type: 'int', condition: '<', name: 's' } as unknown as Node<'int'>, () => {
          If(walked.greaterThanEqual(span).or(transmittance.lessThan(0.01)), () => {
            Break()
          })
          const t = walked.lessThan(nearSpan).select(
            tEnter.add(walked), gapExit.add(walked.sub(nearSpan)),
          ).toVar()
          const p = eyeWorld.add(dir.mul(t))
          // Curvature: altitude above the sunk surface rises with distance.
          const pc = vec3(p.x, p.y.add(horizonSinkNode(t.mul(horizontal))), p.z)
          const dens = density(pc, base, thickness, coverage, kind)
          peakDensity.assign(max(peakDensity, dens))
          If(dens.greaterThan(0.001), () => {
            firstHitT.assign(min(firstHitT, t))
            // Light march toward the sun through this layer.
            // Light march toward the sun, cumulus only: a 300 m cirrus sheet
            // casts no shadow on itself worth four density samples a step --
            // measured 2026-09-19, marching it cost 1.6 ms of the 2.5 ms budget.
            const lightStepsF = lightSteps.toFloat().toVar()
            const lightDs = thickness.div(lightStepsF).mul(0.5).toVar()
            const shadow = float(0).toVar()
            If(isCirrus.not(), () => {
              Loop({ start: int(0), end: lightSteps, type: 'int', condition: '<', name: 'l' } as unknown as Node<'int'>, (inputs) => {
                const l = (inputs as unknown as { readonly l: Node<'int'> }).l
                const jF = l.toFloat().toVar()
                const lp = pc.add(sun.mul(lightDs.mul(jF.add(1))))
                shadow.addAssign(density(lp, base, thickness, coverage, kind).mul(lightDs))
              })
            })
            const light = isCirrus.select(float(0.85), exp(shadow.mul(sigma).mul(LIGHT_EXTINCTION_SCALE).negate()))
            const powder = float(1).sub(exp(dens.mul(sigma).mul(ds).mul(-2)))
            const h = clamp(pc.y.sub(base).div(thickness), 0, 1)
            const ambient = mix(ambientBottom, ambientTop, h)
            const lit = sunColor.mul(light).mul(mix(float(1), powder, 0.5)).mul(1.2).add(ambient)
            const stepT = exp(dens.mul(sigma).mul(ds).negate())
            scattered.addAssign(lit.mul(transmittance.mul(float(1).sub(stepT))))
            transmittance.mulAssign(stepT)
          })
          walked.addAssign(ds)
        })
      })
    })
    const alpha = float(1).sub(transmittance).toVar()
    // Aerial perspective on the cloud, by the distance to its first sample.
    const fog = fogWeightNode(firstHitT)
    const rgb = mix(scattered.div(max(alpha, 0.0001)), color(SKY_HAZE), fog).toVar()
    If(debug.equal(int(2)), () => {
      const g = sceneT.div(FOG_DISTANCE_M)
      rgb.assign(vec3(g, g, g))
      alpha.assign(1)
    })
    If(debug.equal(int(3)), () => {
      const l0 = layerData.element(int(0)) as unknown as Node<'vec4'>
      rgb.assign(vec3(l0.z, l0.x.div(4000), layerCount.toFloat().div(4)))
      alpha.assign(1)
    })
    If(debug.equal(int(4)), () => {
      const g = texture3D(shape, eyeWorld.add(dir.mul(2000)).div(SHAPE_TILE_M)).r
      rgb.assign(vec3(g, g, g))
      alpha.assign(1)
    })
    If(debug.equal(int(5)), () => {
      rgb.assign(vec3(peakDensity, peakDensity, peakDensity))
      alpha.assign(1)
    })
    If(debug.equal(int(6)), () => {
      rgb.assign(vec3(slabEnter.div(10000), slabExit.div(10000), dir.y.mul(0.5).add(0.5)))
      alpha.assign(1)
    })
    If(debug.equal(int(7)), () => {
      const l0 = layerData.element(int(0)) as unknown as Node<'vec4'>
      const at = vec3(eyeWorld.x.add(dir.x.mul(1500)), l0.x.add(l0.y.mul(0.5)), eyeWorld.z.add(dir.z.mul(1500)))
      const g = density(at, l0.x, l0.y, l0.z, l0.w)
      rgb.assign(vec3(g, g, g))
      alpha.assign(1)
    })
    If(debug.equal(int(8)), () => {
      const g = eyeWorld.y.div(4000)
      rgb.assign(vec3(g, g, g))
      alpha.assign(1)
    })
    // ONE node out, never a JS object: a `Fn` that returns `{ rgb, alpha }`
    // does not build ("this.outputNode.build is not a function"), and three
    // then draws the dome with a blank fallback material -- a black screen
    // with zero validation errors (first GPU run, 2026-09-19).
    return vec4(rgb, alpha)
  })()
  material.colorNode = march.xyz
  material.opacityNode = march.w

  const mesh = new Mesh(new SphereGeometry(SKY_RADIUS_M * 0.9, 32, 16), material)
  mesh.renderOrder = 10
  mesh.frustumCulled = false
  mesh.visible = sorted.length > 0

  return {
    object: mesh,
    setTier(name: CloudTierName): void {
      const t = CLOUD_TIERS[name]
      cumulusSteps.value = t.cumulusSteps
      cirrusSteps.value = t.cirrusSteps
      lightSteps.value = t.lightSteps
    },
    setDebug(mode: CloudDebug | undefined): void {
      const modes: Record<CloudDebug, number> = { nodepth: 1, depth: 2, layer: 3, shape: 4, density: 5, slab: 6, point: 7, eye: 8 }
      debug.value = mode === undefined ? 0 : modes[mode]
    },
    update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void {
      // Centered on the eye: with the scene at -eye the dome's center is the camera.
      mesh.position.set(eye.x, eye.y, eye.z)
      eyeWorld.value.set(eye.x, eye.y, eye.z)
      const d = cloudDriftM(wind, driftSeconds)
      drift.value.set(d.x, d.z)
    },
    dispose(): void {
      shape.dispose()
      detail.dispose()
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
