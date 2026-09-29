/**
 * The raster's decoding moved to `src/sim/world/cover.ts` when the physics
 * began reading land cover (soft-field landings); `sim/` may not import
 * `render/`, so the pure module lives on the sim side and this re-export keeps
 * every render and tools import path working.
 */
export * from '../../sim/world/cover.js'
