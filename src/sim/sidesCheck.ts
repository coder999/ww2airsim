import { airfieldSideOf, sideOf, type Side, type Sided } from './sides.js'

/**
 * Scenario-load side checks for ships and airfields (friendly-fire spec §3).
 * They sit beside 7e's same-side static-target check. Each one rejects
 * content where a side contradicts what the scenario asks the player (or a
 * raider) to do. Left alone, such content silently scores, or discharges, the
 * wrong thing:
 *
 * - the player parked on a ship of the other side;
 * - a `land` objective at a ship or airfield of the other side;
 * - a raider's ingress destination ship on its own side.
 *
 * The fourth rule, an `enemyAirfields` entry on the player's side, lives in
 * `createWorldOf`, because a hand-built world can break it too.
 *
 * Structural inputs only, so this module imports nothing but `sides.ts` and
 * cannot cycle with `scenario.ts`.
 */
export type SideCheckInput = {
  readonly scenarioId: string
  readonly player: string
  /** Start and held aircraft, as content (id, optional side). */
  readonly aircraft: readonly (Sided & {
    readonly parkedOnShip: string | null
    readonly ingressShip: string | null
  })[]
  /** Start and held ships, as content. */
  readonly ships: readonly Sided[]
  readonly airfields: readonly { readonly id: string; readonly side?: Side | undefined }[]
  readonly airfieldSides?: Readonly<Record<string, Side>> | undefined
  readonly landAt: readonly { readonly objective: string; readonly at: string }[]
}

export function checkScenarioSides(input: SideCheckInput): void {
  const world = { player: input.player }
  const fail = (message: string): never => {
    throw new Error(`scenario "${input.scenarioId}": ${message}`)
  }
  const player = input.aircraft.find((a) => a.id === input.player)
  const playerSide: Side = player === undefined ? 'allied' : sideOf(world, player)
  const shipSide = new Map(input.ships.map((s) => [s.id, sideOf(world, s)]))
  const fieldSide = new Map(input.airfields.map((a) => [a.id, airfieldSideOf(a, input.airfieldSides)]))

  if (player?.parkedOnShip != null) {
    const side = shipSide.get(player.parkedOnShip)
    if (side !== undefined && side !== playerSide) {
      fail(`player "${player.id}" is parked on "${player.parkedOnShip}", which is on the other side (${side})`)
    }
  }
  for (const { objective, at } of input.landAt) {
    const side = shipSide.get(at) ?? fieldSide.get(at)
    if (side !== undefined && side !== playerSide) {
      fail(`objective "${objective}" lands at "${at}", which is on the other side (${side})`)
    }
  }
  for (const a of input.aircraft) {
    if (a.ingressShip === null) continue
    const side = shipSide.get(a.ingressShip)
    if (side !== undefined && side === sideOf(world, a)) {
      fail(`ingress destination "${a.ingressShip}" of "${a.id}" is on its own side (${side})`)
    }
  }
}
