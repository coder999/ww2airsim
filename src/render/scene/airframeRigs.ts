// src/render/scene/airframeRigs.ts
/**
 * How each rigged aircraft model moves (R3). Pure data, no three.js, so Node tests and the
 * Playwright spec read it too. The glb already carries each part's hinge point and axis (the
 * build's pivot stage, tools/models/stages/pivot.ts); this adds only what a file cannot say.
 * Part names (docs/models.md §5): `Prop`, or `Prop1`...`PropN` from port (-z) to starboard;
 * `GearL`, `GearR`, `GearNose`, `Tailwheel`; `Turret1`...`TurretN` nose to tail, dorsal before
 * ventral at one station. Every id here is registered in AIRFRAME_MODELS (airframes.ts), and
 * tests/tools/models/aircraftRigs.test.ts proves each rig against its committed glb.
 */
export type Retracts = 'inboard' | 'forward' | 'aft'

export interface PropRig {
  readonly node: string
  readonly blades: number
  /** Allowed symmetry error as a fraction of the radius, when a source prop is not symmetric to 1% (a measured Ruling). */
  readonly symmetryTolerance?: number
}

export interface GearRig {
  readonly node: string
  /** Signed turn, right-handed about the node's baked pivot axis, from down (fraction 1) to up (0). */
  readonly upAngleDeg: number
  /** Which way the leg goes as it retracts; the committed-glb test checks upAngleDeg's sign against it. */
  readonly retracts: Retracts
  /** Where the motion comes from, or ESTIMATE. */
  readonly source: string
}

export interface AirframeRig {
  readonly props: readonly PropRig[]
  readonly gear: readonly GearRig[]
  /** Named for H3, static until then. */
  readonly turrets: readonly string[]
}

export const PART_NAME = /^(Prop\d*|GearL|GearR|GearNose|Tailwheel|Turret\d+)$/

export const AIRFRAME_RIGS: Readonly<Record<string, AirframeRig>> = {
  'a6m2-zero': {
    // symmetryError reads its 2% cap on this mesh about any hub: its spinner's ring count is not a
    // multiple of 3 and its top blade is modeled bent ~9 units aft, so no vertex orbit closes. The
    // hub is the spinner's bounds center instead, and the hub-offset check in aircraftRigs.test.ts
    // carries Review Focus 1 for this prop (R3 ledger, Task 4 ruling).
    props: [{ node: 'Prop', blades: 3, symmetryTolerance: 0.02 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'Summary 85: retracts 90 deg inward to the line of flight (A6M Zero spec §7.3)' },
      { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'Summary 85: retracts 90 deg inward to the line of flight (A6M Zero spec §7.3)' },
      { node: 'Tailwheel', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE: Summary 85 says only "fully retractable" (A6M Zero spec §7.3)' },
    ],
    turrets: [],
  },
}
