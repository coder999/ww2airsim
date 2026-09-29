// tools/models/skin/shipColors.ts
import { SHIP_PALETTES, SHIP_ROLES } from '../../../src/render/scene/shipPalette.js'
import type { ShipEntry } from '../manifest.js'
import type { Sidecar } from './sidecar.js'

/** An sRGB hex color as sRGB 0-1, the form a sidecar's roles take. */
export const hexToSrgb01 = (hex: number): [number, number, number] => [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255]

/**
 * A skinned ship's sidecar with its palette's colors (DP2, Ruling S2): each role the entry's
 * ship.materials maps to a ship role takes SHIP_PALETTES[palette][that role]; a role that is not a
 * ship role (dark, glazing) keeps the kit's color. kit.py's ship roles are neutral authoring
 * colors, so an unmapped one is refused rather than painted in the wrong gray.
 */
export function withShipColors(side: Sidecar, ship: ShipEntry): Sidecar {
  const roles: Record<string, [number, number, number]> = {}
  for (const r of Object.keys(side.roles).sort()) {
    const rule = ship.materials[r]
    if (rule === 'keep' || rule === 'mask') throw new Error(`${side.model}: ship.materials maps "${r}" to ${rule}, which a skinned ship cannot use: its one skin material replaces every role's`)
    if (rule !== undefined) roles[r] = hexToSrgb01(SHIP_PALETTES[ship.palette][rule])
    else if ((SHIP_ROLES as readonly string[]).includes(r)) throw new Error(`${side.model}: "${r}" is a ship role but ship.materials does not map it, so it would paint the kit's authoring color, not the ${ship.palette} palette's`)
    else roles[r] = side.roles[r]!
  }
  return { ...side, roles }
}
