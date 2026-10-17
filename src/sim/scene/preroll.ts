import { holdLevelFlight } from '../autopilot.js'
import { DT } from '../flight/model.js'
import type { Controls } from '../flight/state.js'
import { advance, withControls, type World } from '../loop.js'
import { ticksFor } from '../mission/state.js'
import type { Scene } from './schema.js'

/**
 * The scene's world, run for `durationS` with the mission off (F9 plan decisions 1-2). Live playback and
 * skip share `stepPreroll`, so skip lands in the identical state by construction; the live path just
 * calls it from the frame loop. The mission is set aside rather than stepped, so its clock, objectives and
 * radio are inert, and `handoffPreroll` puts it back with its clock origin at the handoff tick.
 *
 * `held`: brakes on, throttle 0 (ground start). `ai`: the existing level-flight autopilot at the start
 * altitude and throttle (airborne start).
 */
export type Preroll<M> = {
  /** Always `mission: null` while the pre-roll runs. */
  readonly world: World<M>
  readonly mission: World<M>['mission']
  readonly left: number
  readonly player: Scene['handoff']['player']
  readonly altitudeM: number
  readonly throttle: number
}

export const beginPreroll = <M>(world: World<M>, scene: Scene): Preroll<M> => {
  const me = world.aircraft.find((a) => a.id === world.player)!
  return {
    world: { ...world, mission: null }, mission: world.mission, left: ticksFor(scene.durationS), player: scene.handoff.player,
    altitudeM: me.state.position.y, throttle: me.controls.throttle,
  }
}

const controlsFor = <M>(p: Preroll<M>): Controls => {
  if (p.player === 'held') return { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 1 }
  const me = p.world.aircraft.find((a) => a.id === p.world.player)!
  return holdLevelFlight(me.spec, me.state, p.throttle, p.altitudeM, 0, p.world.wind)
}

/** One fixed tick with the mission off. */
export const stepPreroll = <M>(p: Preroll<M>): Preroll<M> => {
  const stepped = advance(withControls(p.world, p.world.player, controlsFor(p)), DT)
  return { ...p, world: stepped.world, left: p.left - 1 }
}

/** Put the mission back with its clock starting now, and hand the player a neutral stick. */
export const handoffPreroll = <M>(p: Preroll<M>): World<M> => {
  const w = p.world
  const mission = p.mission === null ? null : { ...p.mission, clockOriginTick: w.tick }
  return withControls({ ...w, mission }, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: p.player === 'ai' ? p.throttle : 0 })
}

/** The headless path: the same N ticks, no renderer. */
export const skipScene = <M>(world: World<M>, scene: Scene): World<M> => {
  let p = beginPreroll(world, scene)
  while (p.left > 0) p = stepPreroll(p)
  return handoffPreroll(p)
}
