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
  'b-17-flying-fortress': {
    // Each prop is its three blade islands (exactly 3-fold symmetric); the spinners stay static in
    // the body, as the F6F's. Turrets are the three that are clean islands: chin, top, ball. The tail
    // position is fused and stays static (P14; R3 ledger, Task 11).
    props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }, { node: 'Prop3', blades: 3 }, { node: 'Prop4', blades: 3 }],
    gear: [
      // 60, not 90: the oleo is raked 23 deg forward at rest, and 90 swung the lower drag link 0.6 m out through
      // the nacelle top; at 60 the wheel lies in the nacelle, its bottom at the nacelle's. The upper drag link is not
      // in the leg: rigid, it swung 1.7 m above the wing, so it stays static where the real one folds (R3 ledger,
      // review of batch C; aircraftRigs.test.ts checks every leg against the skin over it).
      { node: 'GearL', upAngleDeg: 60, retracts: 'forward', source: 'B-17 main legs retract forward into the inboard nacelles, wheels partly exposed; the angle is an ESTIMATE' },
      { node: 'GearR', upAngleDeg: 60, retracts: 'forward', source: 'as GearL' },
      { node: 'Tailwheel', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE' },
    ],
    turrets: ['Turret1', 'Turret2', 'Turret3'],
  },
  'b-29-superfortress': {
    // An original Blender model (b-29-superfortress.py): the kit's propellers are exactly 4-fold
    // symmetric. The mains fold forward under the inboard nacelles and the nose gear aft under the
    // fuselage; every retraction is an ESTIMATE. Turret1..4 are the remote turrets, Turret5 the tail.
    props: [{ node: 'Prop1', blades: 4 }, { node: 'Prop2', blades: 4 }, { node: 'Prop3', blades: 4 }, { node: 'Prop4', blades: 4 }],
    gear: [
      { node: 'GearL', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE (b-29-superfortress.py header)' },
      { node: 'GearNose', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (b-29-superfortress.py header)' },
      { node: 'GearR', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE (b-29-superfortress.py header)' },
    ],
    turrets: ['Turret1', 'Turret2', 'Turret3', 'Turret4', 'Turret5'],
  },
  'd3a-val': {
    // Real blade geometry, but the download's three blades are not modeled at 120 deg (one sits
    // ~0.07 source units off its orbit), so symmetryError reads its 2% cap about any hub; the hub is
    // the spinner's axis and the hub-offset check carries Review Focus 1 (R3 ledger, Task 9).
    // Fixed, spatted gear is not rigged (P15).
    props: [{ node: 'Prop', blades: 3, symmetryTolerance: 0.02 }],
    gear: [],
    turrets: [],
  },
  'f6f-hellcat': {
    props: [{ node: 'Prop', blades: 3 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: F6F main legs swing aft into the wing, turning 90 deg to lie flat; modeled as the swing alone' },
      { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: as GearL' },
      { node: 'Tailwheel', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE' },
    ],
    turrets: [],
  },
  'f4u-corsair': {
    // The download draws its propeller as a translucent disc (a 3-blade motion-blur texture at
    // alpha 0.3) plus the spinner cap, with no blade geometry, so no vertex orbit closes and
    // symmetryError reads its 2% cap; the hub-offset check carries Review Focus 1 (R3 ledger, Task 6).
    props: [{ node: 'Prop', blades: 3, symmetryTolerance: 0.02 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: F4U main legs swing aft, turning 90 deg to lie flat in the wing; modeled as the swing alone' },
      { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: as GearL' },
      { node: 'Tailwheel', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE' },
    ],
    turrets: [],
  },
  'g4m-betty': {
    // Two 4-blade props, each four blade islands exactly 4-fold symmetric about the nacelle axis.
    // The download is a wheels-up flying model with no gear at all, so no gear is rigged. Turret1 is
    // the dorsal blister, a clean island; the tail gun position is fused into the fuselage and stays
    // static (P14; R3 ledger, Task 10).
    props: [{ node: 'Prop1', blades: 4 }, { node: 'Prop2', blades: 4 }],
    gear: [],
    turrets: ['Turret1'],
  },
  'ki-21-sally': {
    // An original Blender model (ki-21-sally.py): the kit's propellers are exactly 3-fold symmetric.
    // The mains fold aft into the nacelles; the tailwheel is fixed and static. Every retraction is an ESTIMATE.
    props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (ki-21-sally.py header)' },
      { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (ki-21-sally.py header)' },
    ],
    turrets: ['Turret1'],
  },
  'ki-43-oscar': {
    // A translucent 3-blade motion-blur disc plus its spinner, as the Corsair's: symmetryTolerance
    // is the metric's 2% cap and the hub-offset check carries Review Focus 1 (R3 ledger, Task 7).
    // The Ki-43-II's three blades (English Wikipedia, read 2026-09-27) match the disc's texture.
    props: [{ node: 'Prop', blades: 3, symmetryTolerance: 0.02 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'Ki-43 main gear retracts inward into the wing; the angle is an ESTIMATE' },
      { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'as GearL' },
    ],
    turrets: [],
  },
  'ki-84-frank': {
    // An original Blender model (ki-84-frank.py): the kit's propeller is exactly 4-fold symmetric,
    // so the default 1% tolerance holds with nothing waived. Every retraction is an ESTIMATE.
    props: [{ node: 'Prop', blades: 4 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'ESTIMATE (ki-84-frank.py header)' },
      { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'ESTIMATE (ki-84-frank.py header)' },
      { node: 'Tailwheel', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE (ki-84-frank.py header)' },
    ],
    turrets: [],
  },
  'p-38-lightning': {
    // An original Blender model (p-38-lightning.py), the fallback for manilov.ap's download (+5.2% long,
    // R3 ledger, Task 8): the kit's propellers are exactly 3-fold symmetric. Tricycle gear, every leg aft.
    props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'P-38 main legs retract aft into the booms; the angle is an ESTIMATE (p-38-lightning.py header)' },
      { node: 'GearNose', upAngleDeg: -90, retracts: 'aft', source: 'P-38 nose leg retracts aft; the angle is an ESTIMATE (p-38-lightning.py header)' },
      { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'as GearL' },
    ],
    turrets: [],
  },
}
