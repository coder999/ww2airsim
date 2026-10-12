import type { GaugeProfile } from '../gauges.js'
import type { AircraftSpec } from '../../sim/flight/schema.js'

export type CockpitFamily =
  | 'american-fighter'
  | 'american-bomber'
  | 'japanese-fighter'
  | 'japanese-bomber'

export type CockpitLayout = {
  readonly id: CockpitFamily
  readonly unitProfile: GaugeProfile
  readonly bomber: boolean
  readonly panelProfile: 'us-fighter-cowl' | 'us-bomber-desk' | 'jp-fighter-hood' | 'jp-bomber-twin'
  readonly clusterPattern: 'single-well' | 'split-console' | 'three-pod' | 'twin-binnacle'
  readonly fasciaColor: number
  readonly rimColor: number
  readonly frameColor: number
  readonly clusterColor: number
  readonly trimColor: number
  readonly bezelColor: number
  readonly majorMarkColor: number
  readonly minorMarkColor: number
  readonly faceColor: number
  readonly needleColor: number
  readonly auxiliaryScale: number
  readonly auxiliaryX: { readonly rpm: number; readonly slip: number }
  readonly badge: 'usn' | 'ijn'
}

export const COCKPIT_LAYOUTS: Readonly<Record<CockpitFamily, CockpitLayout>> = {
  'american-fighter': {
    id: 'american-fighter', unitProfile: 'imperial', bomber: false,
    panelProfile: 'us-fighter-cowl', clusterPattern: 'single-well',
    fasciaColor: 0x17232c, rimColor: 0x050b10, frameColor: 0x202d36,
    clusterColor: 0x0c151b, trimColor: 0x31434e, bezelColor: 0x1e2b33,
    majorMarkColor: 0xf4efe0, minorMarkColor: 0xa9b4b9,
    faceColor: 0x070b0e, needleColor: 0xf2b83f,
    auxiliaryScale: 0.82, auxiliaryX: { rpm: 0.22, slip: 0.32 }, badge: 'usn',
  },
  'american-bomber': {
    id: 'american-bomber', unitProfile: 'imperial', bomber: true,
    panelProfile: 'us-bomber-desk', clusterPattern: 'split-console',
    fasciaColor: 0x30383d, rimColor: 0x0b1013, frameColor: 0x252e31,
    clusterColor: 0x151a1d, trimColor: 0x465158, bezelColor: 0x273035,
    majorMarkColor: 0xf4f7f8, minorMarkColor: 0x9ba9b0,
    faceColor: 0x0d1114, needleColor: 0xf6d16b,
    auxiliaryScale: 0.86, auxiliaryX: { rpm: 0.21, slip: 0.32 }, badge: 'usn',
  },
  'japanese-fighter': {
    id: 'japanese-fighter', unitProfile: 'metric-japanese', bomber: false,
    panelProfile: 'jp-fighter-hood', clusterPattern: 'three-pod',
    fasciaColor: 0x263b2c, rimColor: 0x0f170f, frameColor: 0x252d25,
    clusterColor: 0x101d13, trimColor: 0x584e35, bezelColor: 0x302f21,
    majorMarkColor: 0xf1e7bf, minorMarkColor: 0xa69a72,
    faceColor: 0x111611, needleColor: 0xf4e1a0,
    auxiliaryScale: 0.82, auxiliaryX: { rpm: 0.22, slip: 0.32 }, badge: 'ijn',
  },
  'japanese-bomber': {
    id: 'japanese-bomber', unitProfile: 'metric-japanese', bomber: true,
    panelProfile: 'jp-bomber-twin', clusterPattern: 'twin-binnacle',
    fasciaColor: 0x4b442d, rimColor: 0x17150c, frameColor: 0x2c2d25,
    clusterColor: 0x211f13, trimColor: 0x62573a, bezelColor: 0x343021,
    majorMarkColor: 0xf1e7bf, minorMarkColor: 0xafa274,
    faceColor: 0x13140f, needleColor: 0xf4e1a0,
    auxiliaryScale: 0.86, auxiliaryX: { rpm: 0.21, slip: 0.32 }, badge: 'ijn',
  },
}

type Enrollment = { readonly family: CockpitFamily; readonly sight: boolean }

/** Explicit enrollment is intentional: a new flyable aircraft must make a
 * cockpit decision instead of silently inheriting one from side or role. */
export const COCKPIT_ENROLLMENT: Readonly<Record<string, Enrollment>> = {
  'f4f-wildcat': { family: 'american-fighter', sight: true },
  'f6f-hellcat': { family: 'american-fighter', sight: true },
  'f4u-corsair': { family: 'american-fighter', sight: true },
  'p-38-lightning': { family: 'american-fighter', sight: true },
  'tbm-3-avenger': { family: 'american-bomber', sight: true },
  'b-17-flying-fortress': { family: 'american-bomber', sight: false },
  'b-29-superfortress': { family: 'american-bomber', sight: false },
  'a6m2-zero': { family: 'japanese-fighter', sight: true },
  'ki-43-oscar': { family: 'japanese-fighter', sight: true },
  'ki-84-frank': { family: 'japanese-fighter', sight: true },
  'd3a-val': { family: 'japanese-bomber', sight: true },
  'b5n2-kate': { family: 'japanese-bomber', sight: false },
  'g4m-betty': { family: 'japanese-bomber', sight: false },
  'ki-21-sally': { family: 'japanese-bomber', sight: false },
}

export type CockpitConfig = {
  readonly layout: CockpitLayout
  readonly sight: boolean
  readonly gear: boolean
  readonly flap: true
  readonly hook: boolean
  readonly bay: boolean
  readonly rpmNeedles: number
}

export function cockpitFor(spec: AircraftSpec): CockpitConfig {
  const enrollment = COCKPIT_ENROLLMENT[spec.id]
  if (!enrollment) throw new Error(`Aircraft '${spec.id}' has no C3 cockpit enrollment`)
  return {
    layout: COCKPIT_LAYOUTS[enrollment.family],
    sight: enrollment.sight,
    gear: spec.gear.fixed !== true,
    flap: true,
    hook: spec.carrierCapable,
    bay: spec.bayDoors !== undefined,
    rpmNeedles: spec.engine.count,
  }
}
