import { Group, type Object3D } from 'three'
import { staticModelUrl } from '../content.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { recoveryRoll, type ParachutistEntity } from '../../sim/bailout.js'
import { inRaft } from './parachutist.js'

export const RAFT_MODEL_ID = 'type-a3-life-raft-survivors'
export const LAUNCH_MODEL_ID = 'usaaf-63ft-rescue-boat'

/** All ESTIMATES, and all view-only: nothing in the simulation reads this file. */
export const RESCUE_VISUAL = Object.freeze({
  /** Where the launch comes from (about 1,000 ft) and how fast it comes, about 29 knots (a 63-foot boat's best). */
  standoffM: 300,
  speedMps: 15,
  /** It stops this far from the raft, then takes the survivors aboard for this long. */
  alongsideM: 20,
  pickupS: 8,
  /** After the pickup it motors off for this long, then is gone. */
  departS: 20,
})

export type RescueScene = {
  /** The raft rides where the pilot touched down; gone once he is aboard. */
  readonly raft: { readonly x: number; readonly z: number } | null
  readonly launch: { readonly x: number; readonly z: number; readonly yawRad: number } | null
}

/**
 * The cosmetic recovery of a pilot who came down on water and was rescued: a pure function of where he landed, the
 * recorded recovery seed (it picks the compass bearing the launch comes from) and the seconds since touchdown.
 * It cannot change the outcome, which the simulation already decided; the sortie ends on touchdown (F7A).
 */
export function rescueScene(touchdown: { readonly x: number; readonly z: number }, seed: number, sinceS: number): RescueScene {
  const v = RESCUE_VISUAL
  if (sinceS < 0) return { raft: null, launch: null }
  const bearing = recoveryRoll(seed) * 2 * Math.PI
  const ux = Math.cos(bearing)
  const uz = Math.sin(bearing)
  const arriveS = (v.standoffM - v.alongsideM) / v.speedMps
  const leaveS = arriveS + v.pickupS
  const at = (distance: number, heading: number) => ({ x: touchdown.x + ux * distance, z: touchdown.z + uz * distance, yawRad: heading })
  // Inbound the launch heads toward the raft (-u); outbound it heads away (+u).
  const inbound = Math.atan2(uz, -ux)
  const outbound = Math.atan2(-uz, ux)
  const raft = sinceS < leaveS ? { x: touchdown.x, z: touchdown.z } : null
  if (sinceS < arriveS) return { raft, launch: at(v.standoffM - v.speedMps * sinceS, inbound) }
  if (sinceS < leaveS) return { raft, launch: at(v.alongsideM, inbound) }
  if (sinceS < leaveS + v.departS) return { raft, launch: at(v.alongsideM + v.speedMps * (sinceS - leaveS), outbound) }
  return { raft, launch: null }
}

export type RescueView = {
  readonly root: Object3D
  /**
   * Draws a pilot who came down on the water in his raft, and, if he was rescued, the launch that picks him up. Hides
   * both for anyone else. A pilot who was captured stays in the raft: no launch of ours comes.
   * `nowS` is a wall clock, not the world tick: the frame holds the world still once the descent has an outcome
   * (`holding` in `src/render/frame.ts`), so the pickup plays on its own time while the debrief is up.
   */
  sync(pilot: ParachutistEntity | null, nowS: number): void
  dispose(): void
}

type Acquire = (url: string) => Promise<ModelInstance>

export async function loadRescueView(acquire: Acquire = acquireModel): Promise<RescueView> {
  const raft = await acquire(staticModelUrl('equipment', RAFT_MODEL_ID))
  const launch = await acquire(staticModelUrl('vehicle', LAUNCH_MODEL_ID))
  const root = new Group()
  root.name = 'rescue'
  root.visible = false
  raft.root.visible = false
  launch.root.visible = false
  root.add(raft.root, launch.root)
  let startedS: number | null = null
  return {
    root,
    sync(pilot, nowS): void {
      const contact = pilot?.state.contact ?? null
      if (pilot === null || contact === null || !inRaft(pilot) || pilot.state.outcome === null) {
        startedS = null
        raft.root.visible = false
        launch.root.visible = false
        root.visible = false
        return
      }
      startedS ??= nowS
      const scene = pilot.state.outcome === 'rescued'
        ? rescueScene(contact.position, pilot.recoverySeed, nowS - startedS)
        : { raft: contact.position, launch: null }
      raft.root.visible = scene.raft !== null
      if (scene.raft !== null) raft.root.position.set(scene.raft.x, contact.position.y, scene.raft.z)
      launch.root.visible = scene.launch !== null
      if (scene.launch !== null) {
        launch.root.position.set(scene.launch.x, contact.position.y, scene.launch.z)
        launch.root.rotation.y = scene.launch.yawRad
      }
      root.visible = raft.root.visible || launch.root.visible
    },
    dispose(): void {
      raft.release()
      launch.release()
    },
  }
}
