import { Group, MathUtils, type Object3D } from 'three'
import { DT } from '../../sim/flight/model.js'
import { isPilotJump, type ParachutistEntity } from '../../sim/bailout.js'
import { staticModelUrl } from '../content.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'

export const PARACHUTIST_MODEL_ID = 'parachuting-person-rig'
export const BUNDLE_MODEL_ID = 'paratrooper-supply-bundle'
/** J5 drops 18 men and 6 bundles (F3 §4) and the player may be in the air too, so 24 and 8 leave headroom. # ponytail: past the pool, extra entities are not drawn; raise the numbers if a scenario needs more. */
export const MAX_MEN = 24
export const MAX_BUNDLES = 8
/** The rig nodes the view drives; `tests/render/parachutistView.test.ts` reads them out of the committed glb. */
export const CANOPY_NODES = ['CanopyOpen', 'CanopyRibs', 'CanopyClosed'] as const

const MAX_SWAY_RAD = (9 * Math.PI) / 180

/**
 * A gentle swing under the open canopy, view-only (Mark, 2026-10-15): a pure function of the tick, the wind and the
 * sink rate, so it never touches the simulation and a replay looks the same. The F4 art handoff left the canopy static
 * and asked the first gameplay descent to add this. Still while packed, clearing the airframe, or down.
 */
export function canopySway(tick: number, windMps: number, sinkMps: number, phase: ParachutistEntity['state']['phase']): { readonly rollRad: number; readonly pitchRad: number } {
  if (phase !== 'deploying' && phase !== 'canopy') return { rollRad: 0, pitchRad: 0 }
  const t = tick * DT
  const amplitude = Math.min(MAX_SWAY_RAD, 0.02 + 0.004 * Math.max(0, windMps) + 0.002 * Math.max(0, sinkMps))
  return {
    rollRad: amplitude * Math.sin(t * 2.4) * Math.min(1, 0.6 + 0.4 * Math.sin(t * 0.7)),
    pitchRad: amplitude * 0.6 * Math.sin(t * 1.7 + 1.1),
  }
}

/** A pilot who has come down on the water is drawn by the rescue view, in his raft, not standing on the sea under a canopy. */
export const inRaft = (entity: ParachutistEntity): boolean =>
  isPilotJump(entity) && entity.state.phase === 'down' && entity.state.contact?.surface === 'water'

export type ParachutistView = {
  /** One group holding every rig; visible only while at least one entity is drawn. */
  readonly root: Object3D
  /** Draws every parachutist in `entities` (a pilot, dropped men, bundles) and hides the unused rigs. */
  sync(entities: readonly ParachutistEntity[], wind?: { readonly x: number; readonly z: number } | null): void
  dispose(): void
}

/** Injectable so a Node test can supply fake rigs instead of parsing a glb. */
export type Acquire = (url: string) => Promise<ModelInstance>

type Rig = { readonly root: Object3D; readonly canopy: Object3D; readonly ribs: Object3D; readonly closed: Object3D; readonly release: () => void }

async function loadRig(id: string, acquire: Acquire): Promise<Rig> {
  const instance: ModelInstance = await acquire(staticModelUrl('equipment', id))
  instance.root.name = id
  instance.root.visible = false
  return {
    root: instance.root,
    canopy: instance.node('CanopyOpen'),
    ribs: instance.node('CanopyRibs'),
    closed: instance.node('CanopyClosed'),
    release: () => instance.release(),
  }
}

function pose(rig: Rig, entity: ParachutistEntity, wind: { readonly x: number; readonly z: number } | null | undefined): void {
  const { state } = entity
  rig.root.visible = true
  rig.root.position.set(state.position.x, state.position.y, state.position.z)
  const speed = Math.hypot(state.velocity.x, state.velocity.z)
  if (speed > 0.2) rig.root.rotation.y = Math.atan2(-state.velocity.z, state.velocity.x)
  const deploying = state.phase === 'deploying'
  const open = state.phase === 'canopy' || state.phase === 'down'
  rig.canopy.visible = deploying || open
  rig.ribs.visible = deploying || open
  rig.closed.visible = !deploying && !open
  const fraction = open ? 1 : deploying ? MathUtils.clamp((state.tick - state.phaseStartedTick) * DT / 1.25, 0.08, 1) : 0.08
  rig.canopy.scale.set(fraction, fraction, fraction)
  rig.ribs.scale.set(fraction, fraction, fraction)
  const sway = canopySway(state.tick, wind === null || wind === undefined ? 0 : Math.hypot(wind.x, wind.z), Math.max(0, -state.velocity.y), state.phase)
  rig.root.rotation.order = 'YXZ'
  rig.root.rotation.x = sway.pitchRad
  rig.root.rotation.z = sway.rollRad
}

export async function loadParachutistView(acquire: Acquire = acquireModel): Promise<ParachutistView> {
  const men = await Promise.all(Array.from({ length: MAX_MEN }, () => loadRig(PARACHUTIST_MODEL_ID, acquire)))
  const bundles = await Promise.all(Array.from({ length: MAX_BUNDLES }, () => loadRig(BUNDLE_MODEL_ID, acquire)))
  const root = new Group()
  root.name = 'parachutists'
  root.visible = false
  for (const rig of [...men, ...bundles]) root.add(rig.root)

  return {
    root,
    sync(entities, wind): void {
      let nextMan = 0
      let nextBundle = 0
      for (const entity of entities) {
        if (inRaft(entity)) continue
        const rig = entity.kind === 'bundle' ? bundles[nextBundle++] : men[nextMan++]
        if (rig !== undefined) pose(rig, entity, wind)
      }
      for (let i = nextMan; i < men.length; i++) men[i]!.root.visible = false
      for (let i = nextBundle; i < bundles.length; i++) bundles[i]!.root.visible = false
      root.visible = nextMan + nextBundle > 0
    },
    dispose(): void {
      for (const rig of [...men, ...bundles]) rig.release()
    },
  }
}
