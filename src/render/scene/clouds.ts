import { Vector2 } from 'three'
import type { Node } from 'three/webgpu'
import {
  Break, Fn, If, Loop, clamp, dot, smoothstep, exp, float, int, length, max, min, mix, normalize, sqrt, texture3D, uniform, vec3, vec4,
} from 'three/tsl'
import type { CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import { FOG_DISTANCE_M, horizonSinkNode } from '../horizon.js'
import { skyIrradianceDownNode, skyIrradianceUpNode, sunColorNode, sunDirectionNode } from './lighting.js'
import { aerialPerspective } from './atmosphereShading.js'
import { CUMULUS_SIGMA, SHAPE_TILE_M, cloudDriftM, createCloudField, type CloudField } from './cloudField.js'
import { MS_SCALE, multiScatterNode, octavePhasesNode, powderNode } from './cloudLighting.js'

export { cloudDriftM }

/**
 * Volumetric cloud layers (design: docs/superpowers/specs/2026-09-19-clouds-design.md §4).
 *
 * The march of one view ray through each layer's slab, stopped at the scene
 * depth. Until photoreal Task 3 (2026-09-24) this was the fragment of a dome
 * drawn last in the scene, once per full-resolution pixel; it is now a node
 * builder (`marchNode`) that `cloudPass.ts` calls from a reduced-resolution
 * full-screen pass and composites over the scene (photoreal spec §4.1). The
 * world is camera-relative, so the eye is the origin and the view direction
 * is the ray; `eyeWorld` (a uniform) restores true world coordinates for the
 * noise so clouds stay put as the airplane flies through them.
 *
 * `resolutionScale` is the cloud pass's target size as a fraction of the
 * drawing buffer, per axis. Step counts are photoreal Task 11's (spec §4.4
 * floors `high.cumulusSteps` at 96). Measured at 4K on the reference GPU,
 * 2026-09-25, in-deck-1900 (the costliest view): 96 steps with 6 light
 * samples was 14.5 ms p95 against the 8.33 budget. The plan's two allowed
 * levers were both needed and both taken to their floor: `high.lightSteps`
 * 6 -> 4, and `high.resolutionScale` 0.45 -> 0.35 (rolling-flight ghost check
 * re-run, clean), together with the march's early-outs and light LOD below;
 * the gate runs measured 8.16 and 8.12 ms (2026-09-25). A tier's view work
 * goes as resolutionScale^2 x cumulusSteps, which must fall high -> medium ->
 * low (clouds.test.ts): medium is 64 steps at 0.3 (5.8 vs high's then 11.8), not
 * the plan's 0.5, which made it 1.36x HEAVIER than high (Task 11 fix 1).
 *
 * 2026-09-25, Mark's decision: `high` targets 60 Hz (gpu p95 <= 16.67 ms at
 * 4K); medium and low keep 8.33 (budget4k.spec.ts checks both). High spends
 * it on the clouds: resolution scale 0.5 (in-deck-1900 p95 measured 16.66
 * ms at 0.6 and 14.9-17.0 ms at 0.55), 6 light samples, the first
 * `fineLightSteps` of them on the DETAILED density (the creases between
 * billows are shadows cast by the erosion), and no distance light LOD
 * (`lightLodBandM` null; the lower tiers blend it out over 1.5-2.5 km).
 *
 * Cloud Fidelity II §3.2 (2026-09-25): `updatePeriod: 16` marches one texel
 * per 4x4 block per frame (cloudPass.ts), and High spends the saving on 128
 * view steps. in-deck-1900 p95 at 4K: 11.2 ms at 96 steps, 13.4 / 13.8 ms at
 * 128, 16.0 ms at 128 with 8 light / 4 fine (rejected: no margin). Medium and
 * Low still march every texel.
 */
export const CLOUD_TIERS = {
  high: { cumulusSteps: 128, lightSteps: 6, fineLightSteps: 2, lightLodBandM: null, cirrusSteps: 8, resolutionScale: 0.5, updatePeriod: 8 },
  medium: { cumulusSteps: 64, lightSteps: 4, fineLightSteps: 0, lightLodBandM: [1500, 2500], cirrusSteps: 6, resolutionScale: 0.3, updatePeriod: 1 },
  low: { cumulusSteps: 32, lightSteps: 2, fineLightSteps: 0, lightLodBandM: [1500, 2500], cirrusSteps: 4, resolutionScale: 0.25, updatePeriod: 1 },
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

/** Bound cumulus sampling to 6 km (62.5 m steps at high since photoreal Task 11), after finding the actual curved
 * layer entry. Capping the old widened flat slab marched empty foreground
 * air and erased distant clouds. Cirrus keeps its full thin-sheet span. */
const MAX_MARCH_M = 6000
/** The length over which a step's LOCAL optical depth feeds the powder
 *  term (photoreal Task 11): density 1 gives powder 0.91, density 0.2 gives
 *  0.38, so wisps read darker than cores. Fixed, not the step length, so the
 *  look does not shift with the tier's step count. */
const POWDER_LENGTH_M = 100
const CIRRUS_SIGMA = 0.0015
/** The march stops once this little of the background shows through, and
 *  the pixel is then treated as opaque (photoreal Task 11 early-out): the
 *  last 3% of a ray's light changes its color by well under a gray level.
 *  Was 0.01 with no opaque fill (the 1% leaked the background). */
const OPAQUE_TRANSMITTANCE = 0.03
/** Light-march level of detail, a BUDGET LEVER (photoreal Task 11, 4K
 *  in-deck-1900): once the view ray's transmittance is below this, a step
 *  contributes at most this fraction of the pixel, and its light march drops
 *  to `LIGHT_STEPS_DEEP` near samples (plus the cone sample) spanning the
 *  same distance. */
const LIGHT_LOD_TRANSMITTANCE = 0.3
const LIGHT_STEPS_DEEP = 2
/** ... and with distance, blended across the tier's `lightLodBandM`. */
/** Step multiplier through empty air inside the layer's slab. */
const EMPTY_STEP_SCALE = 2
/** A distance no view ray reaches (FOG_DISTANCE_M is 100 km): "no LOD band". */
const NO_LOD_M = 1e7

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

/** One view ray's march (see `CloudsHandle.marchNode`). */
export type CloudMarch = {
  /** rgb premultiplied by alpha, and alpha. */
  readonly color: Node<'vec4'>
  /** Transmittance-weighted mean distance of the cloud along the ray, in
   *  metres; `FOG_DISTANCE_M` where the ray met no cloud. */
  readonly depthM: Node<'float'>
}

export type CloudsHandle = {
  /** False for a clear sky: nothing to march, so the caller builds no pass. */
  readonly enabled: boolean
  /**
   * Emits the march for one view ray into the CURRENT TSL stack and returns
   * its two results. It is deliberately not a `Fn`: a `Fn` must return ONE
   * node (trap 1, handoff 2026-09-19), and the pass needs both. Call it from
   * inside the caller's own `Fn`, which then returns one node (cloudPass.ts
   * returns a struct).
   * @param dir unit view direction in world axes (the eye is the origin).
   * @param sceneT distance along `dir` to the scene, capped at `FOG_DISTANCE_M`.
   * @param dither start jitter in [0, 1).
   */
  marchNode(dir: Node<'vec3'>, sceneT: Node<'float'>, dither: Node<'float'>): CloudMarch
  setTier(name: CloudTierName): void
  setDebug(mode: CloudDebug | undefined): void
  update(eyeWorld: Vec3, driftSeconds: number, wind: Vec3 | null): void
  dispose(): void
}

export function createClouds(layers: readonly CloudLayer[], noise: SkyNoise, field?: CloudField): CloudsHandle {
  // Plan 16b: the field is shared with the shadow pass when main.ts passes
  // one in; made (and owned, so disposed) here otherwise.
  const ownsField = field === undefined
  const f = field ?? createCloudField(layers, noise)
  const { shape, layerData, layerCount, eyeWorld } = f
  const sorted = f.layers
  const density = f.density
  const densityCoarse = f.densityCoarse

  const cumulusSteps = uniform(CLOUD_TIERS.high.cumulusSteps, 'int')
  const cirrusSteps = uniform(CLOUD_TIERS.high.cirrusSteps, 'int')
  const lightSteps = uniform(CLOUD_TIERS.high.lightSteps, 'int')
  /** 2^lightSteps - 1: the light march's near span in units of its first
   *  (shortest) segment. */
  const lightUnits = uniform(2 ** CLOUD_TIERS.high.lightSteps - 1)
  /** Light samples, nearest first, that read the detailed density. */
  const fineLightSteps = uniform(CLOUD_TIERS.high.fineLightSteps, 'int')
  /** The distance light LOD band [start, end] in metres; far away = none. */
  const lodBand = uniform(new Vector2(NO_LOD_M, NO_LOD_M * 2))
  /** 0 normal, 1 ignore depth, 2 paint the depth bound. */
  const debug = uniform(0, 'int')

  const sun = normalize(sunDirectionNode)
  // Photoreal Task 9's inputs, Task 11's model. The sun term is
  // `sunColorNode` (irradiance) x the octaves' phase (1/sr) x MS_SCALE
  // (cloudLighting.ts). The ambient is the sky's up-facing irradiance on the
  // tops and the ground bounce (down-facing) under the bases, returned as a
  // Lambertian surface would (irradiance / pi, the terrain's scale).
  const ambientTop = skyIrradianceUpNode.mul(1 / Math.PI)
  const ambientBottom = skyIrradianceDownNode.mul(1 / Math.PI)


  const marchNode = (dirIn: Node<'vec3'>, sceneTIn: Node<'float'>, dither: Node<'float'>): CloudMarch => {
    const dir = normalize(dirIn).toVar()
    // The view-sun angle is constant along the ray, so the octaves' phase
    // terms are evaluated once here, not per step.
    const phases = octavePhasesNode(dot(dir, sun)).map((p) => p.toVar())
    // `nodepth` debug: march to the fog distance, ignoring the scene.
    const sceneT = debug.equal(int(1)).select(float(FOG_DISTANCE_M), sceneTIn).toVar()

    const transmittance = float(1).toVar()
    const scattered = vec3(0, 0, 0).toVar()
    // Representative cloud depth for the composite and the temporal
    // reprojection (photoreal spec §4.1): each step's distance weighted by
    // the light it contributes, transmittance * (1 - stepT).
    const hitTSum = float(0).toVar()
    const hitWSum = float(0).toVar()
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
      If(tExit.greaterThan(tEnter).and(transmittance.greaterThan(OPAQUE_TRANSMITTANCE)).and(coverage.greaterThan(0)), () => {
        const isCirrus = kind.greaterThan(0.5)
        const steps = isCirrus.select(cirrusSteps, cumulusSteps).toVar()
        const sigma = isCirrus.select(float(CIRRUS_SIGMA), float(CUMULUS_SIGMA)).toVar()
        // Converted ONCE into a float var: an inline `steps.toFloat()` used
        // twice emitted the second use as `f32 / i32`, which WGSL rejects.
        const stepsF = steps.toFloat().toVar()
        const fullSpan = nearSpan.add(farSpan).toVar()
        const span = isCirrus.select(fullSpan, min(fullSpan, float(MAX_MARCH_M))).toVar()
        const dsBase = span.div(stepsF).toVar()
        // Cumulus silhouettes need neighboring rays to agree. A wide random
        // start interval made thin VDB boundary density alternate between
        // hit and miss, which the reduced-resolution upsample exposed as
        // sparkling checkerboard curtains in forward flight. Keep a small
        // centered jitter to break coherent step bands; cirrus remains fully
        // jittered because its broad, nearly planar sheet does not have that
        // silhouette failure mode.
        const jitter = isCirrus.select(dither, dither.mul(0.125).add(0.4375))
        const walked = dsBase.mul(jitter).toVar()
        // `name` is honoured at runtime (LoopNode.js: `param.name || getVarName(i)`)
        // but absent from @types/three 0.186's overloads, hence the casts.
        Loop({ start: int(0), end: steps, type: 'int', condition: '<', name: 's' } as unknown as Node<'int'>, (inputs) => {
          const s = (inputs as unknown as { readonly s: Node<'int'> }).s
          // Spend the same number of samples and cover the same span, but
          // concentrate cumulus steps at the leading surface where a pilot
          // can see marching bands during entry/exit. The arithmetic-series
          // scale averages to 1: 0.35 near -> 1.65 far.
          const progress = s.toFloat().div(max(stepsF.sub(1), 1))
          const ds = isCirrus.select(dsBase, dsBase.mul(mix(float(0.35), float(1.65), progress))).toVar()
          If(walked.greaterThanEqual(span).or(transmittance.lessThan(OPAQUE_TRANSMITTANCE)), () => {
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
            // Light march toward the sun, cumulus only: a 300 m cirrus sheet
            // casts no shadow on itself worth four density samples a step --
            // measured 2026-09-19, marching it cost 1.6 ms of the 2.5 ms budget.
            // Photoreal Task 11: `lightSteps` samples over geometrically
            // growing segments (1, 2, 4, ... units) that together span the
            // sun ray's path to the layer top, capped at one thickness, then
            // ONE long "cone" sample for the stretch out to three
            // thicknesses (Schneider 2015's far sample). Each sample stands
            // for its segment's length, so `shadow` is the optical path in
            // metres of density.
            const shadow = float(0).toVar()
            If(isCirrus.not(), () => {
              const toTop = top.sub(pc.y).div(max(sun.y, 0.05)).toVar()
              const near = min(toTop, thickness).toVar()
              // Optical path over [0, near] from `count` geometric segments.
              const nearMarch = (count: Node<'int'>, units: Node<'float'>, name: string, fine: Node<'int'>): Node<'float'> => {
                const path = float(0).toVar()
                const segment = near.div(units).toVar()
                const edge = float(0).toVar()
                Loop({ start: int(0), end: count, type: 'int', condition: '<', name } as unknown as Node<'int'>, (inputs) => {
                  const idx = (inputs as unknown as Record<string, Node<'int'>>)[name]!
                  const lp = pc.add(sun.mul(edge.add(segment.mul(0.5)))).toVar()
                  If(idx.lessThan(fine), () => {
                    path.addAssign(density(lp, base, thickness, coverage, kind).mul(segment))
                  }).Else(() => {
                    path.addAssign(densityCoarse(lp, base, thickness, coverage, kind).mul(segment))
                  })
                  edge.addAssign(segment)
                  segment.mulAssign(2)
                })
                return path
              }
              // Budget lever (photoreal Task 11): the full near march fades
              // out over the tier's LOD band and wherever the view ray's
              // transmittance is below LIGHT_LOD_TRANSMITTANCE, into a
              // LIGHT_STEPS_DEEP-segment march over the same span. Across
              // the band BOTH are marched and blended, so no ring can form.
              const full = float(1).sub(smoothstep(lodBand.x, lodBand.y, t))
                .mul(transmittance.greaterThan(LIGHT_LOD_TRANSMITTANCE).select(float(1), float(0))).toVar()
              const fullPath = float(0).toVar()
              const deepPath = float(0).toVar()
              If(full.greaterThan(0), () => { fullPath.assign(nearMarch(lightSteps, lightUnits, 'l', fineLightSteps)) })
              If(full.lessThan(1), () => { deepPath.assign(nearMarch(int(LIGHT_STEPS_DEEP), float(2 ** LIGHT_STEPS_DEEP - 1), 'm', int(0))) })
              shadow.assign(mix(deepPath, fullPath, full))
              const far = min(toTop, thickness.mul(3)).toVar()
              If(far.greaterThan(near), () => {
                const lp = pc.add(sun.mul(near.add(far).mul(0.5)))
                shadow.addAssign(densityCoarse(lp, base, thickness, coverage, kind).mul(far.sub(near)))
              })
            })
            // Cirrus keeps its constant light (0.85 of the sun reaches it)
            // but gets the phase function; cumulus uses the octaves.
            const tauSun = isCirrus.select(float(-Math.log(0.85)), shadow.mul(sigma))
            const sunLight = multiScatterNode(phases, tauSun).mul(MS_SCALE)
            // Beer-powder's powder half on the LOCAL optical depth over a
            // fixed length (the Beer half is in the octaves): thin wisps
            // scatter less than dense cores. A fixed length, not the step,
            // so the look does not change with the step count.
            const localPowder = powderNode(dens.mul(sigma).mul(POWDER_LENGTH_M))
            const h = clamp(pc.y.sub(base).div(thickness), 0, 1)
            const ambient = mix(ambientBottom, ambientTop, h)
            // Cumulus only: a 300 m cirrus sheet keeps its old flat light.
            const powderMix = isCirrus.select(float(1), mix(float(1), localPowder, 0.5))
            const lit = sunColorNode.mul(sunLight).mul(powderMix).add(ambient)
            const stepT = exp(dens.mul(sigma).mul(ds).negate()).toVar()
            const w = transmittance.mul(float(1).sub(stepT)).toVar()
            hitTSum.addAssign(t.mul(w))
            hitWSum.addAssign(w)
            scattered.addAssign(lit.mul(w))
            transmittance.mulAssign(stepT)
          })
          // Empty cumulus air: the next step is twice as long (photoreal
          // Task 11). A cloud's leading edge is then found up to one extra
          // step late (ds/2 on average, spread by the per-frame start
          // jitter, which the temporal resolve averages). Cirrus keeps its
          // 8 even steps.
          walked.addAssign(isCirrus.not().and(dens.lessThanEqual(0.001)).select(ds.mul(EMPTY_STEP_SCALE), ds))
        })
      })
    })
    // A ray stopped at OPAQUE_TRANSMITTANCE is treated as opaque: `rgb`
    // below is the scattered light over what was actually absorbed, so the
    // cut-off tail is filled with the mean of the cloud already marched.
    const alpha = transmittance.lessThan(OPAQUE_TRANSMITTANCE).select(float(1), float(1).sub(transmittance)).toVar()
    const absorbed = float(1).sub(transmittance)
    const depthM = hitWSum.greaterThan(0).select(hitTSum.div(max(hitWSum, 1e-12)), float(FOG_DISTANCE_M)).toVar()
    // Aerial perspective on the cloud at its representative depth (photoreal
    // Task 9, spec §4.3), applied to the straight (un-premultiplied) color
    // and premultiplied again at the end for the pass's over-composite. The
    // scene behind carries its own aerial perspective.
    const ap = aerialPerspective(dir, depthM).toVar()
    const rgb = scattered.div(max(absorbed, 0.0001)).mul(ap.a).add(ap.rgb).toVar()
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
    // Not a `Fn` return, so a JS object is fine HERE. Inside a `Fn` it is
    // not: a `Fn` that returns `{ rgb, alpha }` does not build
    // ("this.outputNode.build is not a function"), and three then draws with
    // a blank fallback material -- a black screen with zero validation
    // errors (first GPU run, 2026-09-19). The caller's `Fn` returns one node.
    return { color: vec4(rgb.mul(alpha), alpha), depthM }
  }

  return {
    enabled: sorted.length > 0,
    marchNode,
    setTier(name: CloudTierName): void {
      const t = CLOUD_TIERS[name]
      cumulusSteps.value = t.cumulusSteps
      cirrusSteps.value = t.cirrusSteps
      lightSteps.value = t.lightSteps
      lightUnits.value = 2 ** t.lightSteps - 1
      fineLightSteps.value = t.fineLightSteps
      const band = t.lightLodBandM ?? [NO_LOD_M, NO_LOD_M * 2]
      lodBand.value.set(band[0], band[1])
    },
    setDebug(mode: CloudDebug | undefined): void {
      const modes: Record<CloudDebug, number> = { nodepth: 1, depth: 2, layer: 3, shape: 4, density: 5, slab: 6, point: 7, eye: 8 }
      debug.value = mode === undefined ? 0 : modes[mode]
    },
    update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void {
      f.update(eye, driftSeconds, wind)
    },
    dispose(): void {
      if (ownsField) f.dispose()
    },
  }
}
