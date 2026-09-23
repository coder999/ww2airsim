/**
 * The compact combat readout (Plan 6 design, "Content and visible behavior"):
 * ammunition, hits, destroyed targets and damaged systems, in BOTH camera
 * modes -- unlike the follow-view strip, a pilot in the cockpit still needs to
 * know the guns are empty. Split like `paddlesBadge.ts`: a pure label the Node
 * suite asserts on, thin DOM under it. Top center, between the DEV overlay
 * (top left) and the legend (top right).
 *
 * `combatDiagnosticsFor` is the Tier 2 view of the same record, here rather
 * than inline in `main.ts` for the reason `audioInputsFrom` gives: an adapter
 * written inline has no Tier 1 test, and a field read off the wrong record
 * would report a healthy target while the airplane burned.
 */
import type { Damage } from '../sim/damage/model.js'
import type { StructuralStress } from '../sim/damage/overload.js'
import type { AircraftCombat } from '../sim/weapons/combat.js'
import { SYSTEMS, type DamageSystem } from '../sim/weapons/schema.js'
import type { FrameState } from './frame.js'

const SYSTEM_WORDS: Readonly<Record<DamageSystem, string>> = {
  engine: 'ENGINE', roll: 'AILERONS', pitch: 'ELEVATOR', yaw: 'RUDDER', fuel: 'FUEL',
  leftGuns: 'L GUNS', rightGuns: 'R GUNS',
}

/** Every subsystem below full health, in schema order. */
export const damagedSystems = (damage: Damage): readonly DamageSystem[] => SYSTEMS.filter((s) => damage[s] < 1)

/** Rounds remaining across every gun. */
export const ammoRemaining = (rec: AircraftCombat): number => rec.guns.reduce((sum, g) => sum + g.ammo, 0)

/**
 * One line of text, or `null` for an airplane with no guns -- an unarmed
 * fixture, or a scenario whose player flies an unarmed spec, shows nothing
 * rather than a row of zeros.
 */
export function combatReadoutLabel(rec: AircraftCombat | undefined): string | null {
  if (rec === undefined || rec.guns.length === 0) return null
  const parts = [`AMMO ${ammoRemaining(rec)}`]
  // Bomb and rocket stores, beside the gun ammo they are carried alongside --
  // absent for a clean airplane, or once every store is gone (spec §4:
  // "the stores remaining (`B 2  R 6`) in the readout while any are
  // carried").
  if (rec.stores.bombs + rec.stores.rockets > 0) parts.push(`B ${rec.stores.bombs}  R ${rec.stores.rockets}`)
  parts.push(`HITS ${rec.hits}`, `KILLS ${rec.kills}`)
  // Spec: "The readout counts SUNK and RAZED beside KILLS."
  if (rec.shipsSunk > 0) parts.push(`SUNK ${rec.shipsSunk}`)
  if (rec.structuresDestroyed > 0) parts.push(`RAZED ${rec.structuresDestroyed}`)
  parts.push(`HP ${Math.round(rec.damage.structure * 100)}%`)
  if (rec.stress.overG) parts.push(`OVER-G ${rec.stress.loadFactorG.toFixed(1)}`)
  if (rec.stress.overspeed) parts.push(`OVERSPEED ${Math.round(rec.stress.airspeedMps)}`)
  if (rec.damage.destroyedAt !== null) parts.push('DESTROYED')
  else {
    const damaged = damagedSystems(rec.damage)
    if (damaged.length > 0) parts.push(`DMG ${damaged.map((s) => SYSTEM_WORDS[s]).join(', ')}`)
  }
  return parts.join('   ')
}

/** What `window.__ww2.combat()` reports (diagnostics.ts). */
export type CombatDiagnostics = {
  readonly player: {
    readonly shots: number
    readonly hits: number
    readonly kills: number
    readonly ammo: number
    readonly structure: number
    readonly destroyed: boolean
    /** `Controls.fire` as the simulation received it this frame -- proves
     *  Space reached `frame.controls`, which `shots` rising alone cannot
     *  distinguish from a stuck trigger. */
    readonly firing: boolean
    /** Bombs and rockets still on the racks/rails, growing `combatReadoutLabel`'s
     *  `B n  R n` segment (Plan 6b Task 9). */
    readonly stores: { readonly bombs: number; readonly rockets: number }
    readonly shipsSunk: number
    readonly structuresDestroyed: number
    readonly stress: StructuralStress
  }
  readonly aircraft: readonly {
    readonly id: string
    readonly structure: number
    readonly destroyed: boolean
    readonly damaged: readonly DamageSystem[]
  }[]
  readonly projectiles: number
  readonly tracers: number
  readonly poolSaturated: number
}

export function combatDiagnosticsFor(frame: FrameState): CombatDiagnostics {
  const combat = frame.world.combat
  const player = combat.aircraft[frame.world.player]!
  return {
    player: {
      shots: player.shots,
      hits: player.hits,
      kills: player.kills,
      ammo: ammoRemaining(player),
      structure: player.damage.structure,
      destroyed: player.damage.destroyedAt !== null,
      firing: frame.controls.fire === true,
      stores: { bombs: player.stores.bombs, rockets: player.stores.rockets },
      shipsSunk: player.shipsSunk,
      structuresDestroyed: player.structuresDestroyed,
      stress: { ...player.stress },
    },
    aircraft: frame.world.aircraft.map((a) => {
      const rec = combat.aircraft[a.id]!
      return { id: a.id, structure: rec.damage.structure, destroyed: rec.damage.destroyedAt !== null, damaged: damagedSystems(rec.damage) }
    }),
    projectiles: combat.projectiles.length,
    tracers: combat.projectiles.filter((p) => p.tracer).length,
    poolSaturated: combat.poolSaturated,
  }
}

export type CombatReadoutHandle = { setRecord(rec: AircraftCombat | undefined): void }

export function createCombatReadout(root: HTMLElement): CombatReadoutHandle {
  const el = document.createElement('div')
  el.setAttribute('aria-label', 'Combat')
  el.style.cssText =
    'position:fixed;left:50%;top:8px;transform:translateX(-50%);padding:6px 12px;' +
    'border:1px solid #2b3440;border-radius:4px;background:rgba(12,14,18,.72);color:#cfe3ff;' +
    'font:13px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.06em;white-space:pre;' +
    'pointer-events:none;display:none;z-index:9'
  root.appendChild(el)
  let shown: string | null = null
  return {
    setRecord(rec: AircraftCombat | undefined): void {
      const label = combatReadoutLabel(rec)
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
