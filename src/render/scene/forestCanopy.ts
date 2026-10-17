/**
 * `?forestCanopy=current|relief` (DEV only; forest canopy rework, 2026-10-16, D7). `current` is the accepted forest and the
 * default until Mark rules: individual crowns and coarse groups for every stand, the flat canopy blend on the ground. `relief`
 * draws stand interiors as part of the terrain shading (height, parallax, crown shadows) and keeps individual crowns only
 * for the stand edge and sparse emergents. Production always runs `current`. Relief needs the long forest's canopy
 * blend, so `forestDistance=off` turns it off.
 */
export type ForestCanopyMode = 'current' | 'relief'

export function forestCanopyMode(search: string | null = typeof location !== 'undefined' ? location.search : null): ForestCanopyMode {
  if (!import.meta.env?.DEV || search === null) return 'current'
  const q = new URLSearchParams(search)
  return q.get('forestCanopy') === 'relief' && q.get('forestDistance') !== 'off' ? 'relief' : 'current'
}
