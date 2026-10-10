/**
 * The compact combat readout (Plan 6 design, "Content and visible behavior"):
 * ammunition, hits, destroyed targets and damaged systems, in BOTH camera
 * modes -- unlike the follow-view strip, a pilot in the cockpit still needs to
 * know the guns are empty. Split like `paddlesBadge.ts`: a pure label the Node
 * suite asserts on, thin DOM under it. Top center, between the DEV overlay
 * (top left) and the legend (top right).
 *
 * `combatDiagnosticsFor` is the E2E view of the same record, here rather
 * than inline in `main.ts` for the reason `audioInputsFrom` gives: an adapter
 * written inline has no Deterministic test, and a field read off the wrong record
 * would report a healthy target while the airplane burned.
 */
import type { Damage } from '../sim/damage/model.js'
import type { StructuralStress } from '../sim/damage/overload.js'
import type { AircraftCombat } from '../sim/weapons/combat.js'
import type { FriendlyFire } from '../sim/weapons/friendlyFire.js'
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
export function combatReadoutLabel(rec: AircraftCombat | undefined, racks: 'Bombs' | 'Torpedo' = 'Bombs'): string | null {
  if (rec === undefined || rec.guns.length === 0) return null
  const parts: string[] = []
  // Friendly fire (spec §7, ruling FF-8): a tag from the first friendly hit
  // on, so the pilot knows the sortie is forfeit. The "Cease fire!" call
  // itself plays on M2's radio line (mission/hud.ts `radioFeed`).
  if (rec.friendlyFire !== null) parts.push('FRIENDLY FIRE')
  parts.push(`AMMO ${ammoRemaining(rec)}`)
  // Bomb and rocket stores, beside the gun ammo they are carried alongside --
  // absent for a clean airplane, or once every store is gone (spec §4:
  // "the stores remaining (`B 2  R 6`) in the readout while any are
  // carried").
  // A torpedo airplane's racks count as `T` (D3 T1, Mark 2026-10-09).
  if (rec.stores.bombs + rec.stores.rockets > 0) parts.push(`${racks === 'Torpedo' ? 'T' : 'B'} ${rec.stores.bombs}  R ${rec.stores.rockets}`)
  parts.push(`HITS ${rec.hits}`, `KILLS ${rec.kills}`)
  // Spec: "The readout counts SUNK and RAZED beside KILLS."
  if (rec.shipsSunk > 0) parts.push(`SUNK ${rec.shipsSunk}`)
  if (rec.structuresDestroyed > 0) parts.push(`RAZED ${rec.structuresDestroyed}`)
  parts.push(`HP ${Math.round(rec.damage.structure * 100)}%`)
  if (rec.stress.overG) parts.push(`OVER-G ${rec.stress.loadFactorG.toFixed(1)}`)
  if (rec.stress.overspeed) parts.push(`OVERSPEED ${Math.round(rec.stress.airspeedMps)}`)
  if (rec.damage.destroyedAt !== null) parts.push('DESTROYED')
  else {
    if (rec.damage.burningSince !== null) parts.push('ON FIRE')
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
    /** The player's first friendly damage, or null (friendly-fire spec §4). */
    readonly friendlyFire: FriendlyFire | null
  }
  readonly aircraft: readonly {
    readonly id: string
    readonly structure: number
    readonly destroyed: boolean
    /** On fire (damage stages, 2026-10-09): doomed, not yet destroyed. */
    readonly burning: boolean
    readonly damaged: readonly DamageSystem[]
    /** Plan 7e: kills credited to this aircraft, same-side kills, and who
     *  destroyed it (`damage.attacker`), for the furball's E2E spec. */
    readonly kills: number
    readonly friendlyKills: number
    readonly attacker: string | null
    /** The last aircraft to land a hit (`lastHitBy`); `attacker` is set only once it burns. */
    readonly lastHitBy: string | null
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
      friendlyFire: player.friendlyFire,
    },
    aircraft: frame.world.aircraft.map((a) => {
      const rec = combat.aircraft[a.id]!
      return {
        id: a.id, structure: rec.damage.structure, destroyed: rec.damage.destroyedAt !== null, burning: rec.damage.burningSince !== null, damaged: damagedSystems(rec.damage),
        kills: rec.kills, friendlyKills: rec.friendlyKills, attacker: rec.damage.attacker, lastHitBy: rec.lastHitBy,
      }
    }),
    projectiles: combat.projectiles.length,
    tracers: combat.projectiles.filter((p) => p.tracer).length,
    poolSaturated: combat.poolSaturated,
  }
}

export type CombatReadoutHandle = { setRecord(rec: AircraftCombat | undefined, racks?: 'Bombs' | 'Torpedo'): void }

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
    setRecord(rec: AircraftCombat | undefined, racks: 'Bombs' | 'Torpedo' = 'Bombs'): void {
      const label = combatReadoutLabel(rec, racks)
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
