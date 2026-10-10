import type { AircraftEntity, World } from './loop.js'
import { sideOf, type Side } from './sides.js'

/**
 * Difficulty (Track M, M5; plan docs/superpowers/plans/2026-10-10-m5-difficulty.md).
 *
 * The player's global setting, labeled Recruit / Veteran / Ace. Its ids are
 * deliberately NOT pilot-skill words: a scenario's `skill` ('green' |
 * 'veteran', `PilotSkill`) is one AI pilot's baseline, and this shifts it.
 * CONTEXT.md, "Difficulty" and "Pilot skill".
 */
export type Difficulty = 'easy' | 'normal' | 'hard'

/** `normal` (Veteran) is today's tuning exactly, and the default (Mark, 2026-10-10). */
export const DEFAULT_DIFFICULTY: Difficulty = 'normal'
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard']

export type DifficultyScales = {
  /** Multiplies every hostile pilot's `skill.aimErrorRad` (E1's lethality lever). Higher is easier. */
  readonly aiAimError: number
  /** Multiplies the aim and fuse error of every AA mount that can fire at the player's side. Higher is easier. */
  readonly aaError: number
  /** Multiplies the damage the player's airplane takes from hits and flak. Lower is easier. */
  readonly playerDamage: number
}

/**
 * Measured 2026-10-10, not guessed: the table and how it was swept are in
 * docs/handoff/2026-10-10-m5-difficulty.md, and
 * tests/sim/difficultyLethality.test.ts pins the result.
 */
export const DIFFICULTY_SCALES: Readonly<Record<Difficulty, DifficultyScales>> = {
  easy: { aiAimError: 1.25, aaError: 1.3, playerDamage: 0.6 },
  normal: { aiAimError: 1, aaError: 1, playerDamage: 1 },
  hard: { aiAimError: 0.7, aaError: 0.9, playerDamage: 1.2 },
}

/**
 * The world a sortie starts from, at `difficulty`. Applied once, at launch:
 * the result is an ordinary `World`, so replay and tests reproduce it with
 * nothing else to remember, and the tick never learns the setting exists.
 *
 * Only the player's opponents are scaled: a friendly wingman's aim and the
 * player's own ships' AA stay at the scenario's baseline. `normal` returns
 * `world` itself, so Veteran is bit-identical to a world that never heard of
 * difficulty.
 */
export function applyDifficulty<M>(world: World<M>, difficulty: Difficulty): World<M> {
  if (difficulty === 'normal') return world
  const k = DIFFICULTY_SCALES[difficulty]
  const player = world.aircraft.find((a) => a.id === world.player)
  if (player === undefined) return world
  const playerSide: Side = sideOf(world, player)
  const shift = (a: AircraftEntity<M>): AircraftEntity<M> => {
    if (a.id === world.player) {
      const c = a.spec.combat
      // Dividing the hit points is multiplying every hit's and blast's damage (`damageFromHit`,
      // `blastDamageAircraft`); the fire line and engine stages are fractions and follow unchanged.
      return c === undefined ? a : {
        ...a,
        spec: { ...a.spec, combat: { ...c, structureHp: c.structureHp / k.playerDamage, subsystemHp: c.subsystemHp / k.playerDamage } },
      }
    }
    if (a.pilot == null || sideOf(world, a) === playerSide) return a
    return { ...a, pilot: { ...a.pilot, skill: { ...a.pilot.skill, aimErrorRad: a.pilot.skill.aimErrorRad * k.aiAimError } } }
  }
  const mission = world.mission === null ? null : {
    ...world.mission,
    held: world.mission.held.map((g) => ({ ...g, aircraft: g.aircraft.map(shift) })),
  }
  return {
    ...world,
    aircraft: world.aircraft.map(shift),
    mission,
    combat: { ...world.combat, aa: { ...world.combat.aa, errorScaleVs: { side: playerSide, scale: k.aaError } } },
  }
}
