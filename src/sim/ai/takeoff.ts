/** 7h: the AI takeoff phase machine. Task 1 declares only the state types;
 *  Task 2 adds the controller. */
export type TakeoffPhase = 'wait' | 'roll' | 'climb'
export type TakeoffState = {
  readonly phase: TakeoffPhase
  readonly sinceS: number
  /** Runway heading, compass, latched on the first tick. */
  readonly headingRad: number | null
  /** The climb-out hold's integral term. */
  readonly pitchIntegral: number
}
