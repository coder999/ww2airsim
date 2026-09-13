/**
 * The simulation's clock and, in Task 3, its fixed-step accumulator.
 *
 * `SimContext` exists because `step`'s signature is what every later plan has
 * to extend: terrain height queries, deck contact, a threaded RNG, a wind
 * vector. As a parameter list that is a change to every call site; as one
 * object it is a change to one interface (Plan 1 whole-branch review, highest
 * -risk structural finding).
 *
 * It carries `dt` and `tick` and NOTHING ELSE on purpose. The same review
 * flagged `speedOfSoundAt` as an export with no consumer; speculative
 * `wind`/`terrain`/`rng` fields would repeat exactly that. Later plans add a
 * field when they have a consumer for it.
 */
export interface SimContext {
  /** Seconds this step advances. Always `DT` in production; tests vary it. */
  readonly dt: number
  /** Monotonic simulation tick this step produces. Starts at 0. */
  readonly tick: number
}
