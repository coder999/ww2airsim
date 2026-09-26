// src/render/hangar/stats.ts
import { pointsForTargetType, targetLabel } from '../debrief.js'
import type { TargetType } from '../../sim/weapons/targetType.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import type { Building } from '../../sim/world/airfields.js'
import type { CatalogEntry } from './catalog.js'

/** One line of an info card. `value` carries its unit; `note` qualifies it. */
export interface Figure { readonly label: string; readonly value: string; readonly note?: string }

const GAMEPLAY_VALUE = 'gameplay value, not a historical figure'
const KN_PER_MPS = 3600 / 1852

const int = (n: number): string => Math.round(n).toLocaleString('en-US')
const one = (n: number): string => n.toFixed(1)

/**
 * Which score row an object's destruction lands in. MIRRORS the sim's own
 * credit rules in src/sim/weapons/combat.ts: aircraft by `spec.role`
 * (`creditAircraftDamage`); ships by role, where only carrier, cruiser and
 * battleship score (the sinking loop); structures `aaa` -> 'aaa', every other
 * kind -> 'building' (`damageStructureAt`). The Hangar spec keeps src/sim/
 * untouched, so this is a copy of those three expressions; if combat.ts
 * changes one, change it here (tests/render/hangar/stats.test.ts pins each case).
 */
export function shipTargetType(role: ShipSpec['role']): TargetType | null {
  return role === 'carrier' || role === 'cruiser' || role === 'battleship' ? role : null
}
export function structureTargetType(kind: Building['kind']): TargetType {
  return kind === 'aaa' ? 'aaa' : 'building'
}

function pointsFigure(label: string, t: TargetType | null): Figure {
  if (t === null) return { label, value: 'none', note: 'this role does not score' }
  return { label, value: `${int(pointsForTargetType(t))}`, note: `scores as ${targetLabel(t)}` }
}

/** "PLACEHOLDER, not F4F-4 data" from a source string that starts "PLACEHOLDER, not F4F-4 data: ...". */
function placeholderNote(source: string): string | undefined {
  return source.startsWith('PLACEHOLDER') ? source.split(':')[0]!.trim() : undefined
}

function withNote(f: Omit<Figure, 'note'>, note: string | undefined): Figure {
  return note === undefined ? f : { ...f, note }
}

/** The card's figures, all read from sim content (Hangar spec §5). [] for "Not yet in service". */
export function figuresFor(entry: CatalogEntry): Figure[] {
  const s = entry.subject
  if (s === null) return []
  if (s.kind === 'aircraft') {
    const a = s.spec
    // The F4F's reference block says it covers aircraft/mass/engine/rates/limits/gear/flap.
    const flight = placeholderNote(a.reference.source)
    const out: Figure[] = []
    if (a.combat) {
      out.push({ label: 'Structure', value: `${int(a.combat.structureHp)} HP`, note: GAMEPLAY_VALUE })
      out.push({ label: 'Each subsystem', value: `${int(a.combat.subsystemHp)} HP`, note: GAMEPLAY_VALUE })
    }
    out.push(withNote({ label: 'Top speed', value: `${int(a.reference.topSpeedMps * 3.6)} km/h at ${int(a.reference.topSpeedAltitudeM)} m` }, flight))
    out.push(withNote({ label: 'Stall speed, clean', value: `${int(a.reference.stallSpeedMps * 3.6)} km/h` }, flight))
    out.push(withNote({ label: 'Load limit', value: `${one(a.limits.gLimit)} g` }, flight))
    if (a.combat) {
      const rounds = a.combat.guns.reduce((sum, g) => sum + g.rounds, 0)
      out.push({ label: 'Guns', value: `${a.combat.guns.length}, ${int(rounds)} rounds` })
    }
    if (a.stores) out.push({ label: 'Stores', value: `${a.stores.racks.length} bomb racks, ${a.stores.rails.length} rocket rails` })
    out.push(pointsFigure('Points when shot down', a.role))
    return out
  }
  if (s.kind === 'ship') {
    const sh = s.spec
    return [
      { label: 'Hull', value: `${int(sh.hullHp)} HP`, note: GAMEPLAY_VALUE },
      { label: 'Length', value: `${one(sh.lengthM)} m` },
      { label: 'Beam', value: `${one(sh.beamM)} m` },
      { label: 'Top speed', value: `${one(sh.maxSpeedMps * KN_PER_MPS)} kn (${one(sh.maxSpeedMps)} m/s)` },
      pointsFigure('Points when sunk', shipTargetType(sh.role)),
    ]
  }
  const hps = s.placements.map((p) => p.building.hp)
  const lo = Math.min(...hps), hi = Math.max(...hps)
  const counts = new Map<string, number>()
  for (const p of s.placements) counts.set(p.airfield.name, (counts.get(p.airfield.name) ?? 0) + 1)
  return [
    { label: 'Hit points', value: lo === hi ? `${int(lo)} HP` : `${int(lo)}–${int(hi)} HP`, note: GAMEPLAY_VALUE },
    { label: 'Where', value: [...counts].map(([name, n]) => `${name} ×${n}`).join(', ') },
    pointsFigure('Points when destroyed', structureTargetType(s.buildingKind)),
  ]
}
