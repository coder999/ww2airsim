// tools/models/skin/surfaces.ts
/**
 * How each palette role weathers (DP0; model-detail-pass spec §4, §8 Q2: worn). These are the
 * shared look: a change here re-skins every skinned model on its next build (spec §5).
 * Every number is an ESTIMATE, chosen by eye on the DP0 pilots.
 *   scan        the pinned CC0 scan its micro-normal, wear and roughness come from (null: none)
 *   roughness   base roughness before the scan's variation
 *   metallic    0 paint, 1 bare metal
 *   fade        chalking toward a lighter gray on sky-facing surfaces, 0-1
 *   chip        fraction of the scan's brightest texels (its bare-metal flecks) that show bare metal through the paint
 *   rivets      draw rivet rows beside its panel lines
 *   scanNormal  the scan normal's strength, 0-1
 */
export type ScanId = 'painted-metal' | 'corrugated-iron' | 'concrete' | 'deck-planks'
export interface Surface {
  readonly scan: ScanId | null
  readonly roughness: number
  readonly metallic: number
  readonly fade: number
  readonly chip: number
  readonly rivets: boolean
  readonly scanNormal: number
  /** DP2 (Ruling S7): sample the scan at world (x, z) or (z, x) instead of chart (u, v), so planks run
   *  fore and aft on every chart and continue across seams. Its scanNormal must be 0: a world-frame
   *  normal is wrong in a chart's tangent frame. */
  readonly scanSpace?: 'world-xz' | 'world-zx'
}

export const ROLE_SURFACE: Readonly<Record<string, Surface>> = {
  ijaGreen: { scan: 'painted-metal', roughness: 0.62, metallic: 0, fade: 0.18, chip: 0.01, rivets: true, scanNormal: 0.6 },
  underside: { scan: 'painted-metal', roughness: 0.58, metallic: 0, fade: 0.04, chip: 0.005, rivets: true, scanNormal: 0.6 },
  // Ruling (DP1, 2026-09-28): metallic 1 renders near-black in the Hangar (no environment to reflect; check 15
  // measured 0.089x flat on the P-38). Aluminum here is a satin bare-metal paint chip, so metallic 0.25.
  naturalMetal: { scan: 'painted-metal', roughness: 0.4, metallic: 0.25, fade: 0, chip: 0, rivets: true, scanNormal: 0.4 },
  dark: { scan: 'painted-metal', roughness: 0.55, metallic: 0, fade: 0.05, chip: 0.005, rivets: false, scanNormal: 0.5 },
  glazing: { scan: null, roughness: 0.08, metallic: 0, fade: 0, chip: 0, rivets: false, scanNormal: 0 },
  steel: { scan: 'corrugated-iron', roughness: 0.7, metallic: 0, fade: 0.1, chip: 0.04, rivets: false, scanNormal: 1 },
  concrete: { scan: 'concrete', roughness: 0.9, metallic: 0, fade: 0.04, chip: 0, rivets: false, scanNormal: 1 },
  // Ships (DP2). ESTIMATE, set by eye on the Pennsylvania pilot (Task 7). Chips are rare: a ship's skin is
  // metallicFactor 0 (Ruling S1), so a chip reads as a light fleck of primer, not as metal.
  hull: { scan: 'painted-metal', roughness: 0.72, metallic: 0, fade: 0.08, chip: 0.004, rivets: false, scanNormal: 0.5 },
  superstructure: { scan: 'painted-metal', roughness: 0.72, metallic: 0, fade: 0.08, chip: 0.004, rivets: false, scanNormal: 0.5 },
  fitting: { scan: 'painted-metal', roughness: 0.66, metallic: 0, fade: 0.06, chip: 0.004, rivets: false, scanNormal: 0.5 },
  deck: { scan: 'deck-planks', roughness: 0.86, metallic: 0, fade: 0.05, chip: 0, rivets: false, scanNormal: 0, scanSpace: 'world-xz' },
  flightDeck: { scan: 'deck-planks', roughness: 0.86, metallic: 0, fade: 0.05, chip: 0, rivets: false, scanNormal: 0, scanSpace: 'world-xz' },
  // Buildings (DP3, 2026-09-29). ESTIMATE, set by eye in the Hangar. Earth is packed soil on the worn-concrete scan (gritty,
  // no chalking); timber is the pinned weathered planks sampled in world (x, z), so boards run one way across a wall or deck.
  earth: { scan: 'concrete', roughness: 0.95, metallic: 0, fade: 0.02, chip: 0, rivets: false, scanNormal: 0.9 },
  timber: { scan: 'deck-planks', roughness: 0.85, metallic: 0, fade: 0.06, chip: 0, rivets: false, scanNormal: 0, scanSpace: 'world-xz' },
  boot: { scan: 'painted-metal', roughness: 0.75, metallic: 0, fade: 0, chip: 0, rivets: false, scanNormal: 0.3 },
  antifouling: { scan: 'painted-metal', roughness: 0.8, metallic: 0, fade: 0, chip: 0, rivets: false, scanNormal: 0.3 },
}

export function surfaceFor(role: string): Surface {
  // DP2: a download's box-projected roles are its shipMaterials names, `ship:<role>`.
  const key = role.startsWith('ship:') ? role.slice(5) : role
  const s = ROLE_SURFACE[key]
  if (!s) throw new Error(`skin: palette role "${role}" has no surface in tools/models/skin/surfaces.ts (known: ${Object.keys(ROLE_SURFACE).sort().join(', ')})`)
  return s
}
