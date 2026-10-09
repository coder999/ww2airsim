// src/render/scene/airframeRigs.ts
/**
 * How each rigged aircraft model moves (R3). Pure data, no three.js, so Node tests and the
 * Playwright spec read it too. The glb already carries each part's hinge point and axis (the
 * build's pivot stage, tools/models/stages/pivot.ts); this adds only what a file cannot say.
 * Part names (docs/models.md §5): `Prop`, or `Prop1`...`PropN` from port (-z) to starboard;
 * `GearL`, `GearR`, `GearNose`, `Tailwheel`; `Turret1`...`TurretN` nose to tail, dorsal before
 * ventral at one station, each with `Turret<N>Guns`. Every id here is registered in AIRFRAME_MODELS (airframes.ts), and
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
  /** `Turret1`...`TurretN`, each with its barrels in `Turret<N>Guns`, aimed by `turretArcs`. */
  readonly turrets: readonly string[]
  /** How far each turret turns and its guns elevate; exactly one per turret (aircraftRigs.test.ts). */
  readonly turretArcs?: Readonly<Record<string, TurretArc>>
  /** Control surface nodes (C1). What each drives and how far follows from its name (`surfaceDrive`). */
  readonly surfaces?: readonly string[]
  /** Bomb-bay door nodes in the model itself (C2), `BayDoor<n>L/R`, each hinged on its outboard
   *  edge with its axis oriented so a positive turn opens it: the keel edge swings down and out.
   *  Exactly the specs with `bayDoors` have them (aircraftRigs.test.ts). */
  readonly doors?: readonly string[]
}

/**
 * A turret's reach. The turret turns about its own pivot axis (vertical); its `Turret<N>Guns` part
 * turns about a horizontal trunnion, oriented by the build so a positive turn raises the muzzle.
 * Elevation is degrees above the airframe's horizontal; traverse is degrees either side of the rest
 * heading, or null for a full circle.
 */
export interface TurretArc {
  readonly traverseDeg: number | null
  readonly elevationDeg: readonly [number, number]
  /** The barrels' elevation as modeled, measured from the glb (aircraftRigs.test.ts checks it). */
  readonly restElevationDeg: number
  readonly source: string
}

const fullCircle = (elevationDeg: readonly [number, number], restElevationDeg = 0): TurretArc =>
  ({ traverseDeg: null, elevationDeg, restElevationDeg, source: 'ESTIMATE (turret aim plan, 2026-10-09)' })
/** A flexible nose, cheek or tail gun on a ball socket: a small cone about where it points as modeled. */
const flexCone = (restElevationDeg = 0, elevationDeg: readonly [number, number] = [-20, 30], traverseDeg = 30): TurretArc =>
  ({ traverseDeg, elevationDeg, restElevationDeg, source: 'ESTIMATE: a flexible gun on a ball socket, not a turret (flex guns, 2026-10-09)' })

export const PART_NAME = /^(Prop\d*|GearL|GearR|GearNose|Tailwheel|Turret\d+(Guns)?|(Aileron|Elevator|Flap\d+|BayDoor\d+)[LR]|Rudder\d*)$/

export type SurfaceInput = 'roll' | 'pitch' | 'yaw' | 'flap'

/** How far a bay door swings, fully open (C2). ESTIMATE: hanging about straight down. */
export const BAY_DOOR_OPEN_DEG = 85

/** Full travel, degrees (Mark's default set, 2026-10-08: C1 Ruling R4). No airframe overrides it yet. */
export const SURFACE_MAX_DEG: Readonly<Record<SurfaceInput, number>> = { roll: 20, pitch: 25, yaw: 25, flap: 45 }

/**
 * What a control surface follows, and the sign that maps a positive input to a positive turn about
 * its hinge. kit.py orients every hinge so a positive turn raises the trailing edge (a fin's: swings
 * it to starboard), so: +roll (right) raises the right aileron and lowers the left; +pitch (nose up)
 * raises the elevator; +yaw (nose right) swings the rudder to starboard; flaps go down.
 * aircraftRigs.test.ts checks each against its committed glb.
 */
export function surfaceDrive(node: string): { readonly input: SurfaceInput; readonly sign: 1 | -1 } {
  if (/^Aileron[LR]$/.test(node)) return { input: 'roll', sign: node.endsWith('R') ? 1 : -1 }
  if (/^Elevator[LR]$/.test(node)) return { input: 'pitch', sign: 1 }
  if (/^Rudder\d*$/.test(node)) return { input: 'yaw', sign: 1 }
  if (/^Flap\d+[LR]$/.test(node)) return { input: 'flap', sign: -1 }
  throw new Error(`surfaceDrive: "${node}" is not a control surface name`)
}

const surfaces = (flaps: number, rudders = 1): string[] => [
  'AileronL', 'AileronR', ...Array.from({ length: flaps }, (_, i) => [`Flap${i + 1}L`, `Flap${i + 1}R`]).flat(), 'ElevatorL', 'ElevatorR',
  ...(rudders === 1 ? ['Rudder'] : Array.from({ length: rudders }, (_, i) => `Rudder${i + 1}`)),
]

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
    surfaces: surfaces(1),
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
    // Turret1 chin, Turret2 and Turret3 the port and starboard cheek guns, Turret4 top, Turret5 ball, Turret6 the
    // tail guns. The cheek and tail guns are flexible guns, not turrets: each "turret" is the gun's rear cap, and both
    // pivots sit where the gun leaves the skin (flex guns, 2026-10-09). The waist guns are static.
    turrets: ['Turret1', 'Turret2', 'Turret3', 'Turret4', 'Turret5', 'Turret6'],
    // The download's own guns, split per turret; their modeled elevations measured 2026-10-09.
    turretArcs: {
      Turret1: { traverseDeg: 86, elevationDeg: [-46, 26], restElevationDeg: -31.3, source: 'ESTIMATE: Bendix chin turret' },
      Turret2: flexCone(-0.4), Turret3: flexCone(-0.4),
      Turret4: fullCircle([0, 85], 13.6),
      Turret5: fullCircle([-90, 0], -7.3),
      Turret6: flexCone(14.6),
    },
    // C2: real doors cut from its belly (entry split BayDoor1L/R, Mark's ruling 2026-10-08).
    doors: ['BayDoor1L', 'BayDoor1R'],
    // C1 batch 4: the ailerons, split flaps and rudder are the download's own pieces, hinged on their
    // leading edges; the elevators are cut from the tailplane.
    surfaces: surfaces(1),
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
    turretArcs: {
      // Turret1 holds 2 deg above level: level and dead ahead, its barrels touch the cockpit roof (measured 2026-10-09).
      Turret1: fullCircle([2, 90]), Turret2: fullCircle([-90, 0]), Turret3: fullCircle([0, 90]), Turret4: fullCircle([-90, 0]),
      Turret5: { traverseDeg: 30, elevationDeg: [-30, 10], restElevationDeg: 0, source: 'ESTIMATE: the tail position fires in a cone; above +10 deg its barrels reach the tail surfaces (measured 2026-10-09)' },
    },
    // C2: cut by kit.py's fuselage(doors=...) from the belly (the script's BAYS).
    doors: ['BayDoor1L', 'BayDoor1R', 'BayDoor2L', 'BayDoor2R'],
    surfaces: surfaces(2),
  },
  'd3a-val': {
    // Real blade geometry, but the download's three blades are not modeled at 120 deg (one sits
    // ~0.07 source units off its orbit), so symmetryError reads its 2% cap about any hub; the hub is
    // the spinner's axis and the hub-offset check carries Review Focus 1 (R3 ledger, Task 9).
    // Fixed, spatted gear is not rigged (P15). C1 batch 4: the ailerons, flaps and elevators are cut from
    // the one-piece wing and tailplane, and the rudder is the download's own piece; dive brakes stay static.
    props: [{ node: 'Prop', blades: 3, symmetryTolerance: 0.02 }],
    gear: [],
    turrets: [],
    surfaces: surfaces(1),
  },
  'f6f-hellcat': {
    props: [{ node: 'Prop', blades: 3 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: F6F main legs swing aft into the wing, turning 90 deg to lie flat; modeled as the swing alone' },
      { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: as GearL' },
      { node: 'Tailwheel', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE' },
    ],
    turrets: [],
    surfaces: surfaces(1),
  },
  'f4u-corsair': {
    // The download draws its propeller as a translucent disc (a 3-blade motion-blur texture at
    // alpha 0.3) plus the spinner cap, with no blade geometry, so no vertex orbit closes and
    // symmetryError reads its 2% cap; the hub-offset check carries Review Focus 1 (R3 ledger, Task 6).
    props: [{ node: 'Prop', blades: 3, symmetryTolerance: 0.02 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'ESTIMATE of the motion: the real F4U legs swing aft and turn 90 deg to lie flat; one hinge axis cannot do both, so the legs fold inboard about +x with the wheels flat, hinge lowered 0.09 m to sit in the wing (2026-09-29: a plain aft swing put the wheels 0.41 m through the wing top; this leaves 0.05 m)' },
      { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'ESTIMATE of the motion: mirror of GearL' },
      { node: 'Tailwheel', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE' },
    ],
    turrets: [],
    surfaces: surfaces(2),
  },
  'g4m-betty': {
    // An original Blender model (g4m-betty.py), replacing the flat, gearless download (2026-09-29): the kit's
    // propellers are exactly 3-fold symmetric (three blades: English Wikipedia 'Mitsubishi G4M', read
    // 2026-09-29). The mains fold aft into the nacelles (ESTIMATE); the tailwheel is fixed and static.
    // Turret1 is the nose gun and Turret3 the tail cannon, each on a ball socket; Turret2 is the dorsal
    // turret. The beam blisters are static.
    props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (g4m-betty.py header)' },
      { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (g4m-betty.py header)' },
    ],
    turrets: ['Turret1', 'Turret2', 'Turret3'],
    turretArcs: { Turret1: flexCone(), Turret2: fullCircle([0, 80]), Turret3: flexCone() },
    // C2: cut by kit.py's fuselage(doors=...) from the belly (the script's BAYS).
    doors: ['BayDoor1L', 'BayDoor1R'],
    surfaces: surfaces(2),
  },
  'ki-21-sally': {
    // An original Blender model (ki-21-sally.py): the kit's propellers are exactly 3-fold symmetric.
    // The mains fold aft into the nacelles; the tailwheel is fixed and static. Every retraction is an ESTIMATE.
    // Turret1 (nose) and Turret3 (tail) are 7.7 mm guns on ball sockets; Turret2 is the dorsal turret.
    // The tail gun tops out at +10 deg: above it the barrel reaches the fin's root (measured 2026-10-09).
    props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (ki-21-sally.py header)' },
      { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (ki-21-sally.py header)' },
    ],
    turrets: ['Turret1', 'Turret2', 'Turret3'],
    turretArcs: { Turret1: flexCone(), Turret2: fullCircle([0, 80]), Turret3: flexCone(0, [-30, 10]) },
    // C2: cut by kit.py's fuselage(doors=...) from the belly (the script's BAYS).
    doors: ['BayDoor1L', 'BayDoor1R'],
    surfaces: surfaces(2),
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
    surfaces: surfaces(1),
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
    surfaces: surfaces(1),
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
    surfaces: surfaces(2, 2),
  },
}
