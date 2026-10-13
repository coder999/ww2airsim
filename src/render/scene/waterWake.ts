import {
  BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial,
  type Object3D,
} from 'three'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { RenderState, ShipPose } from '../../sim/interpolate.js'
import { qRotate } from '../../sim/math/quat.js'
import { v3, type Vec3 } from '../../sim/math/vec3.js'
import type { CombatState } from '../../sim/weapons/combat.js'
import { waterSurfaceAt, type WaterSurfaceContext } from '../../sim/waterSurface.js'
import type { QualityTierName } from '../quality.js'

const KELVIN_HALF_ANGLE_RAD = 19.47 * Math.PI / 180
const G = 9.80665
const MAX_VERTICES = 160_000

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const clamp01 = (x: number): number => clamp(x, 0, 1)
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / Math.max(b - a, 1e-6))
  return t * t * (3 - 2 * t)
}

/** DEV-only differential-budget control. `on` is accepted for symmetric URLs. */
export function wakeOffFromQuery(search: string): boolean {
  const raw = new URLSearchParams(search).get('wake')
  if (raw === null || raw === 'on') return false
  if (raw === 'off') return true
  throw new Error(`wake: ${JSON.stringify(raw)} is not on or off`)
}

export type WaterAircraftView = {
  readonly id: string
  readonly impact: unknown | null
  readonly spec: AircraftSpec
  readonly state: { readonly velocity: Vec3 }
}

export type AircraftWaterContact = {
  readonly speedMps: number
  readonly planing: number
  readonly lengthM: number
  readonly beamM: number
  readonly stern: Vec3
  readonly aft: Vec3
  readonly right: Vec3
  readonly visibleY: number
}

/**
 * The single renderer-side definition of an aircraft being supported by the
 * sea. Both the low-speed lap/planing spray emitters and the surface wake use
 * it, so neither can remain active after the other thinks the hull is airborne.
 */
export function aircraftWaterContact(
  aircraft: WaterAircraftView,
  pose: RenderState,
  waterContext?: WaterSurfaceContext,
): AircraftWaterContact | null {
  const water = aircraft.spec.waterOperations
  if (water === undefined || aircraft.impact !== null) return null
  const speedMps = Math.hypot(aircraft.state.velocity.x, aircraft.state.velocity.z)
  const planing = clamp01((speedMps - water.planingSpeedMps) / (water.takeoffSpeedMps - water.planingSpeedMps))
  const draftM = water.displacementDraftM + planing * (water.planingDraftM - water.displacementDraftM)
  const waterlineY = pose.position.y - water.hullDepthM + draftM
  const surfaceY = waterSurfaceAt(waterContext, pose.position.x, pose.position.z).heightM
  // Stop every water-attached effect on the actual unstick, rather than
  // letting the generous approach/contact band emit spray beneath a climbing
  // aircraft for another second. The lower tolerance remains broad enough
  // for an arriving hull; above the surface the rendered waterline is tight.
  if (speedMps >= water.takeoffSpeedMps && aircraft.state.velocity.y > 0) return null
  const waterlineErrorM = waterlineY - surfaceY
  if (waterlineErrorM < -1 || waterlineErrorM > 0.2) return null
  const aft = speedMps > 0.2
    ? v3(-aircraft.state.velocity.x / speedMps, 0, -aircraft.state.velocity.z / speedMps)
    : qRotate(pose.attitude, v3(-1, 0, 0))
  const right = qRotate(pose.attitude, v3(0, 0, 1))
  const lengthM = aircraft.spec.geometry.wingSpanM * 0.62
  const visibleY = Math.max(waterlineY, surfaceY) + 0.04
  return {
    speedMps, planing, lengthM, beamM: water.hullBeamM, aft, right, visibleY,
    stern: v3(pose.position.x + aft.x * lengthM * 0.42, visibleY, pose.position.z + aft.z * lengthM * 0.42),
  }
}

export type WakeSource = {
  readonly key: string
  readonly stern: Vec3
  readonly aft: Vec3
  readonly right: Vec3
  readonly lengthM: number
  readonly beamM: number
  readonly speedMps: number
  readonly maxSpeedMps: number
  /** 0 for a displacement hull; 1 for an aircraft fully on the step. */
  readonly planing: number
  readonly strength: number
}

export type WaterWakeView = {
  readonly combat: Pick<CombatState, 'ships'>
  readonly aircraft: readonly WaterAircraftView[]
  readonly poses: readonly RenderState[]
  readonly ships: readonly {
    readonly id: string
    readonly spec: { readonly lengthM: number; readonly beamM: number; readonly maxSpeedMps: number }
    readonly state: { readonly speedMps: number }
  }[]
  readonly shipPoses: readonly ShipPose[]
  readonly water?: WaterSurfaceContext
}

/** A common wake contract for every seaworthy craft in the rendered world. */
export function waterWakeSources(view: WaterWakeView): WakeSource[] {
  const sources: WakeSource[] = []
  view.aircraft.forEach((aircraft, i) => {
    const pose = view.poses[i]
    if (pose === undefined) return
    const contact = aircraftWaterContact(aircraft, pose, view.water)
    const water = aircraft.spec.waterOperations
    if (contact === null || water === undefined || contact.speedMps <= 1) return
    sources.push({
      key: `aircraft:${aircraft.id}`,
      stern: contact.stern,
      aft: contact.aft,
      right: contact.right,
      lengthM: contact.lengthM,
      beamM: contact.beamM,
      speedMps: contact.speedMps,
      maxSpeedMps: water.takeoffSpeedMps,
      planing: contact.planing,
      strength: clamp01(0.25 + contact.speedMps / water.takeoffSpeedMps),
    })
  })
  view.ships.forEach((ship, i) => {
    const pose = view.shipPoses[i]
    if (pose === undefined || ship.state.speedMps <= 0.5 || (view.combat.ships[ship.id]?.sinkingFraction ?? 0) >= 1) return
    const forward = v3(Math.sin(pose.headingRad), 0, -Math.cos(pose.headingRad))
    const aft = v3(-forward.x, 0, -forward.z)
    const right = v3(-forward.z, 0, forward.x)
    const sternXZ = v3(
      pose.position.x + aft.x * ship.spec.lengthM * 0.48,
      pose.position.y,
      pose.position.z + aft.z * ship.spec.lengthM * 0.48,
    )
    const surface = waterSurfaceAt(view.water, sternXZ.x, sternXZ.z).heightM
    sources.push({
      key: `ship:${ship.id}`,
      stern: v3(sternXZ.x, surface + 0.04, sternXZ.z),
      aft,
      right,
      lengthM: ship.spec.lengthM,
      beamM: ship.spec.beamM,
      speedMps: ship.state.speedMps,
      maxSpeedMps: ship.spec.maxSpeedMps,
      planing: 0,
      strength: clamp01(0.3 + ship.state.speedMps / ship.spec.maxSpeedMps),
    })
  })
  return sources
}

type Sample = { x: number; z: number; rightX: number; rightZ: number; ageS: number }
type Track = {
  source: WakeSource
  samples: Sample[]
  anchor: Sample
  maxAgeS: number
  sampleSpacingM: number
}

type Point = { x: number; y: number; z: number }

class TriangleWriter {
  readonly array = new Float32Array(MAX_VERTICES * 3)
  readonly colour = new Float32Array(MAX_VERTICES * 4)
  count = 0

  clear(): void { this.count = 0 }

  private vertex(p: Point, alpha: number): void {
    if (this.count >= MAX_VERTICES) return
    const i = this.count * 3
    this.array[i] = p.x
    this.array[i + 1] = p.y
    this.array[i + 2] = p.z
    const c = this.count * 4
    this.colour[c] = 1
    this.colour[c + 1] = 1
    this.colour[c + 2] = 1
    this.colour[c + 3] = alpha
    this.count++
  }

  ribbon(a: Point, b: Point, widthA: number, widthB: number, alphaA = 1, alphaB = 1): void {
    const dx = b.x - a.x, dz = b.z - a.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-4 || this.count + 18 > MAX_VERTICES) return
    const nx = -dz / d, nz = dx / d
    // Four lanes make three joined strips: transparent outer vertices and a
    // narrow opaque centre. That gives every crest a soft water-blended edge
    // without a texture, extra draw call, or a visibly polygonal halo mesh.
    const lanes = [1.6, 0.38, -0.38, -1.6]
    const edgeAlpha = [0, 1, 1, 0]
    for (let lane = 0; lane < 3; lane++) {
      const a0 = { x: a.x + nx * widthA * lanes[lane]!, y: a.y, z: a.z + nz * widthA * lanes[lane]! }
      const a1 = { x: a.x + nx * widthA * lanes[lane + 1]!, y: a.y, z: a.z + nz * widthA * lanes[lane + 1]! }
      const b0 = { x: b.x + nx * widthB * lanes[lane]!, y: b.y, z: b.z + nz * widthB * lanes[lane]! }
      const b1 = { x: b.x + nx * widthB * lanes[lane + 1]!, y: b.y, z: b.z + nz * widthB * lanes[lane + 1]! }
      this.vertex(a0, alphaA * edgeAlpha[lane]!); this.vertex(a1, alphaA * edgeAlpha[lane + 1]!); this.vertex(b0, alphaB * edgeAlpha[lane]!)
      this.vertex(a1, alphaA * edgeAlpha[lane + 1]!); this.vertex(b1, alphaB * edgeAlpha[lane + 1]!); this.vertex(b0, alphaB * edgeAlpha[lane]!)
    }
  }
}

function meshFor(writer: TriangleWriter, colour: number, opacity: number): Mesh {
  const geometry = new BufferGeometry()
  const position = new BufferAttribute(writer.array, 3).setUsage(DynamicDrawUsage)
  const vertexColour = new BufferAttribute(writer.colour, 4).setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', position)
  geometry.setAttribute('color', vertexColour)
  geometry.setDrawRange(0, 0)
  const material = new MeshBasicMaterial({
    color: colour,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return mesh
}

function commit(mesh: Mesh, writer: TriangleWriter): void {
  const geometry = mesh.geometry
  const position = geometry.getAttribute('position') as BufferAttribute
  // WebGPU otherwise uploads the full 160k-vertex capacity on every frame.
  // The FX instance pass uses the same range discipline: only the portion
  // actually drawn is dirty.
  position.clearUpdateRanges()
  position.addUpdateRange(0, writer.count * 3)
  position.needsUpdate = true
  const vertexColour = geometry.getAttribute('color') as BufferAttribute
  vertexColour.clearUpdateRanges()
  vertexColour.addUpdateRange(0, writer.count * 4)
  vertexColour.needsUpdate = true
  geometry.setDrawRange(0, writer.count)
}

function disposeMesh(mesh: Mesh): void {
  mesh.geometry.dispose()
  ;(mesh.material as MeshBasicMaterial).dispose()
}

function samplePoint(
  sample: Sample,
  distanceM: number,
  side: -1 | 0 | 1,
  angleRad: number,
  track: Track,
  water: WaterSurfaceContext | undefined,
  crest: boolean,
): Point {
  const lateral = side === 0 ? 0 : side * (track.source.beamM * 0.22 + Math.tan(angleRad) * distanceM)
  const x = sample.x + sample.rightX * lateral
  const z = sample.z + sample.rightZ * lateral
  const developed = smoothstep(0, Math.max(3, track.source.lengthM * 0.45), distanceM)
  const faded = 1 - smoothstep(track.maxAgeS * 0.62, track.maxAgeS, sample.ageS)
  const lift = crest ? clamp(0.025 + distanceM * 0.0012, 0.025, track.source.beamM * 0.04 + 0.18) * developed * faded * track.source.strength : 0.025
  return { x, y: waterSurfaceAt(water, x, z).heightM + lift, z }
}

export type WaterWakeStats = {
  readonly tracks: number
  readonly samples: number
  readonly maxAnchorDistanceM: number
  readonly crestVertices: number
  readonly churnVertices: number
}

export type WaterWakeHandle = {
  readonly object: Object3D
  update(sources: readonly WakeSource[], water: WaterSurfaceContext | undefined, dtS: number): void
  setTier(tier: QualityTierName | 'off'): void
  clear(): void
  stats(): WaterWakeStats
  dispose(): void
}

/**
 * World-space surface wakes. They are intentionally not generic FX
 * particles: their geometry lies on the support sea, remembers the vessel's
 * path, and widens into Kelvin-style arms instead of billboarding like smoke.
 * All craft share two meshes, so adding ships changes vertices, not draw calls.
 */
export function createWaterWake(tier: QualityTierName | 'off'): WaterWakeHandle {
  const root = new Group()
  root.name = 'water-wakes'
  const crests = new TriangleWriter()
  const churn = new TriangleWriter()
  const crestMesh = meshFor(crests, 0xe8f0ed, 0.36)
  const churnMesh = meshFor(churn, 0xc3dcd9, 0.16)
  churnMesh.renderOrder = 1
  crestMesh.renderOrder = 2
  root.add(churnMesh, crestMesh)
  const tracks = new Map<string, Track>()
  const forcedOff = import.meta.env.DEV && typeof location !== 'undefined' && wakeOffFromQuery(location.search)
  let currentTier = forcedOff ? 'off' : tier

  const clear = (): void => {
    tracks.clear()
    crests.clear(); churn.clear()
    commit(crestMesh, crests); commit(churnMesh, churn)
  }

  const update = (sources: readonly WakeSource[], water: WaterSurfaceContext | undefined, dtS: number): void => {
    if (currentTier === 'off') {
      if (tracks.size > 0 || crests.count > 0 || churn.count > 0) clear()
      return
    }
    const elapsed = clamp(dtS, 0, 0.25)
    for (const track of tracks.values()) {
      for (const sample of track.samples) sample.ageS += elapsed
      track.anchor.ageS += elapsed
    }
    for (const source of sources) {
      let track = tracks.get(source.key)
      const maxAgeS = clamp(source.lengthM * 5 / Math.max(source.speedMps, 1), 12, 40)
      // High quality keeps roughly twice the longitudinal resolution of the
      // first pass. The broad halo below makes each narrow crest read as a
      // feathered wave rather than a strip of opaque triangles.
      const sampleSpacingM = currentTier === 'high'
        ? clamp(source.lengthM / 64, 0.6, 3)
        : currentTier === 'medium'
          ? clamp(source.lengthM / 48, 1, 5)
          : clamp(source.lengthM / 32, 1.5, 8)
      if (track === undefined) {
        const first = { x: source.stern.x, z: source.stern.z, rightX: source.right.x, rightZ: source.right.z, ageS: 0 }
        track = { source, samples: [first], anchor: { ...first }, maxAgeS, sampleSpacingM }
        tracks.set(source.key, track)
      }
      track.source = source
      track.maxAgeS = maxAgeS
      track.sampleSpacingM = sampleSpacingM
      const head = track.samples[0]
      const now = { x: source.stern.x, z: source.stern.z, rightX: source.right.x, rightZ: source.right.z, ageS: 0 }
      if (head === undefined) {
        track.samples.unshift(now)
        track.anchor = { ...now }
      } else {
        // Measure from the last COMMITTED trail point, not from last frame's
        // live head. A ship advances less than one sample spacing per frame;
        // moving the reference every frame would therefore prevent it from
        // ever accumulating enough distance to leave a wake.
        const moved = Math.hypot(now.x - track.anchor.x, now.z - track.anchor.z)
        // A scenario switch, seek or teleport starts a new trail instead of drawing a line across the map.
        if (moved > source.lengthM * 2) {
          track.samples = [now]
          track.anchor = { ...now }
        } else if (moved >= track.sampleSpacingM) {
          track.samples[0] = now
          track.samples.splice(1, 0, { ...track.anchor })
          track.anchor = { ...now }
        } else track.samples[0] = now
      }
    }

    const maxSamples = currentTier === 'high' ? 192 : currentTier === 'medium' ? 128 : 64
    for (const [key, track] of tracks) {
      track.samples = track.samples.filter((sample) => sample.ageS <= track.maxAgeS).slice(0, maxSamples)
      if (track.samples.length === 0) tracks.delete(key)
    }

    crests.clear(); churn.clear()
    const angles = currentTier === 'high'
      ? [KELVIN_HALF_ANGLE_RAD, 10 * Math.PI / 180]
      : [KELVIN_HALF_ANGLE_RAD]

    for (const track of tracks.values()) {
      if (track.samples.length < 2) continue
      let distanceA = 0
      for (let i = 0; i + 1 < track.samples.length; i++) {
        const a = track.samples[i]!, b = track.samples[i + 1]!
        const segmentM = Math.hypot(b.x - a.x, b.z - a.z)
        const distanceB = distanceA + segmentM
        const fadeA = 1 - smoothstep(track.maxAgeS * 0.62, track.maxAgeS, a.ageS)
        const fadeB = 1 - smoothstep(track.maxAgeS * 0.62, track.maxAgeS, b.ageS)
        const developA = smoothstep(0, track.source.lengthM * 0.35, distanceA)
        const developB = smoothstep(0, track.source.lengthM * 0.35, distanceB)
        const centreA = samplePoint(a, distanceA, 0, 0, track, water, false)
        const centreB = samplePoint(b, distanceB, 0, 0, track, water, false)
        const churnWidthA = track.source.beamM * (0.05 + developA * 0.22) * fadeA * track.source.strength
        const churnWidthB = track.source.beamM * (0.05 + developB * 0.22) * fadeB * track.source.strength
        const churnWaveM = clamp(track.source.beamM * 2.2, 3, 24)
        const churnAlphaA = 0.15 + 0.55 * Math.abs(Math.sin((distanceA / churnWaveM + sourceHash(track.source.key) * 0.01) * Math.PI))
        const churnAlphaB = 0.15 + 0.55 * Math.abs(Math.sin((distanceB / churnWaveM + sourceHash(track.source.key) * 0.01) * Math.PI))
        churn.ribbon(centreA, centreB, churnWidthA, churnWidthB, churnAlphaA, churnAlphaB)

        const planingNarrow = 1 - track.source.planing * 0.35
        angles.forEach((baseAngle, band) => {
          const angle = baseAngle * planingNarrow
          for (const side of [-1, 1] as const) {
            const pa = samplePoint(a, distanceA, side, angle, track, water, true)
            const pb = samplePoint(b, distanceB, side, angle, track, water, true)
            // The full deep-water wavelength is much longer than the visible
            // patch of breaking foam. Short pulse spacing represents the
            // smaller interference crests inside that wave, avoiding the
            // continuous parallel "rails" of the first implementation.
            const wavelengthM = clamp((track.source.speedMps ** 2 / G) * (0.08 + band * 0.03), 3, 18)
            const pulseA = 0.02 + 0.98 * smoothstep(0.25, 0.9, Math.abs(Math.sin((distanceA / wavelengthM) * Math.PI)))
            const pulseB = 0.02 + 0.98 * smoothstep(0.25, 0.9, Math.abs(Math.sin((distanceB / wavelengthM) * Math.PI)))
            const baseWidth = clamp(track.source.beamM * (0.018 + band * 0.006), 0.12, 1.5)
            const widthA = baseWidth * fadeA
            const widthB = baseWidth * fadeB
            crests.ribbon(pa, pb, widthA, widthB, pulseA * track.source.strength, pulseB * track.source.strength)
          }
        })
        distanceA = distanceB
      }
    }
    commit(crestMesh, crests); commit(churnMesh, churn)
  }

  return {
    object: root,
    update,
    setTier: (next) => {
      currentTier = forcedOff ? 'off' : next
      if (currentTier === 'off') clear()
    },
    clear,
    stats: () => ({
      tracks: tracks.size,
      samples: [...tracks.values()].reduce((sum, track) => sum + track.samples.length, 0),
      maxAnchorDistanceM: Math.max(0, ...[...tracks.values()].map((track) => {
        const head = track.samples[0]
        return head === undefined ? 0 : Math.hypot(head.x - track.anchor.x, head.z - track.anchor.z)
      })),
      crestVertices: crests.count,
      churnVertices: churn.count,
    }),
    dispose: () => { clear(); disposeMesh(crestMesh); disposeMesh(churnMesh) },
  }
}

function sourceHash(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h)
}
