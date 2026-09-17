import { v3, type Vec3 } from '../sim/math/vec3.js'

/**
 * Where the airplane starts: parked on the runway at Tacloban, Leyte.
 *
 * Mark's decision, 2026-09-16, after review found that Plan 11a's airborne
 * default -- `(0, 600, 0)`, 600 m up and 23 km out over water -- was a
 * take-off nobody could perform: production builds have no URL spawn
 * override, so every real flight started already flying.
 *
 * `(x, z) = (-29666, 47605)`. Taken verbatim from
 * `tests/tools/terrainBuild.test.ts`, sourced independently of this file and
 * cross-checked against the Copernicus source tiles on 2026-09-14 -- do not
 * re-derive it; an equirectangular back-of-envelope lands about 80 m away.
 *
 * `y` here is a PLACEHOLDER, not the truth, and must never be read as if it
 * were the real ground height: that depends on which terrain level happens to
 * load first (measured 2026-09-16: 1.673 m at L4, the level the physics
 * actually gets, versus 1.921 m at L0, the finest tile -- a 0.25 m gap, which
 * is exactly `GROUND_CONTACT_TOLERANCE_M`), and no terrain has even been
 * requested yet when this constant is first read in `main.ts`'s `boot()`. It
 * only has to be close enough not to look broken for the second or so before
 * real data lands -- `settleOnTerrain` (`src/render/frame.ts`) overwrites it
 * with `heightAt` the instant a real heightfield exists, and nothing reads it
 * for PHYSICS before then: `nextFrameState` holds a ground spawn's simulation
 * at zero elapsed time for exactly that gap (`FrameState.groundSpawn`,
 * frame.ts), which is the only reason a placeholder here is safe at all.
 *
 * This is the literal that used to sit inline in `main.ts`'s `createState`
 * call. It moved here because `spawnPositionFromQuery` below has to be able
 * to fall back to it component by component, and a second copy of it in this
 * file would be exactly the two-sources-of-truth problem
 * `coarsestFetchedLevel` was extracted to solve in `lod.ts`.
 */
export const DEFAULT_SPAWN_POSITION: Vec3 = v3(-29666, 1.9, 47605)

/**
 * Whether `DEFAULT_SPAWN_POSITION` is a GROUND spawn -- parked, wheels down,
 * waiting for terrain -- as opposed to Plan 11a's airborne one.
 *
 * A named constant rather than a literal `true` at each of `main.ts`'s call
 * sites, because `hasSpawnOverride` below turns it off for a caller-visible
 * reason: a DEV `?spawnX/Y/Z` override exists so Tier 2 can put the airplane
 * somewhere else entirely -- over Leyte at altitude, or over open water (see
 * `spawnPositionFromQuery`'s own doc comment) -- and none of those spawns are
 * parked, so none of them should hold for terrain or start with the gear
 * down. `main.ts` computes ONE `groundSpawn` boolean
 * (`DEFAULT_SPAWN_IS_GROUND && !hasSpawnOverride(...)`) and passes it to both
 * `initialFrameState`'s `gearDown` and its `groundSpawn` field, so the two
 * can never disagree about whether a flight started parked.
 */
export const DEFAULT_SPAWN_IS_GROUND = true

/** The three query parameters this reads, in x/y/z order. Exported so the
 *  test can assert the names it builds URLs from are the names that are
 *  parsed, rather than restating three strings that could drift. */
export const SPAWN_PARAMS = ['spawnX', 'spawnY', 'spawnZ'] as const

/**
 * The spawn position for this page load: `DEFAULT_SPAWN_POSITION`, with any
 * of `?spawnX=`, `?spawnY=`, `?spawnZ=` (world metres, +x east, +y up,
 * +z north) overriding one component.
 *
 * **Why this exists, since a URL that moves the airplane is otherwise a
 * cheat.** Tier 2 has to fly over Leyte, and Leyte is not where the airplane
 * starts: the nearest land to the world origin is 23.1 km away, which is
 * three minutes at the spawn's 120 m/s and far past any test timeout. The
 * alternatives were worse. A setter on `window.__ww2` would be a second write
 * path into a live `FrameState`, bypassing `nextFrameState` -- the precise
 * thing `diagnostics.ts` argues against for the assists, and there is no
 * keyboard path to fall back on here. A second HTML entry point would be a
 * second copy of `boot`. This is instead an INPUT to the one existing boot
 * path: `initialFrameState` already takes the airplane it is handed, and
 * nothing downstream can tell where the number came from.
 *
 * `main.ts` calls this behind `import.meta.env.DEV`, which Vite replaces with
 * the literal `false` in a production build, so the query string is inert in
 * anything that ships -- the same guard `__ww2` and `stepChecked` use.
 *
 * **A present-but-unparseable parameter throws rather than falling back.** A
 * silent fallback would put the airplane back at `DEFAULT_SPAWN_POSITION` --
 * parked at Tacloban, not wherever the test asked for -- and a terrain test
 * would then report zero validation errors because it never saw the terrain
 * it meant to fly over -- indistinguishable from a passing run, which is the
 * same trap `adapter.spec.ts`'s `KeyC` check exists to close. `main.ts`
 * routes the throw to the failure screen, so it is visible rather than a
 * console line.
 */
export function spawnPositionFromQuery(search: string): Vec3 {
  const params = new URLSearchParams(search)
  const [x, y, z] = SPAWN_PARAMS.map((name, i) => {
    const raw = params.get(name)
    if (raw === null) return [DEFAULT_SPAWN_POSITION.x, DEFAULT_SPAWN_POSITION.y, DEFAULT_SPAWN_POSITION.z][i]!
    const value = Number(raw)
    // `Number('')` is 0 and `Number(' ')` is 0, which would silently accept
    // `?spawnY=` as "sea level" -- so the emptiness check is separate from
    // the finiteness one rather than folded into it.
    if (raw.trim() === '' || !Number.isFinite(value)) {
      throw new Error(`spawn: ${name}=${JSON.stringify(raw)} is not a finite number`)
    }
    return value
  }) as [number, number, number]
  return v3(x, y, z)
}

/**
 * Whether the query string carries any of `SPAWN_PARAMS` -- i.e. whether the
 * page was asked to start somewhere other than `DEFAULT_SPAWN_POSITION`.
 *
 * `main.ts` uses this to compute `groundSpawn`
 * (`DEFAULT_SPAWN_IS_GROUND && !hasSpawnOverride(...)`) without re-parsing
 * the query string a second way that could disagree with
 * `spawnPositionFromQuery`'s own parsing -- reading `SPAWN_PARAMS` here,
 * rather than three string literals, is what keeps a future rename of one of
 * them from silently splitting the two functions' idea of "was this
 * overridden" apart.
 *
 * Deliberately "any of the three", not "all three": a partial override (e.g.
 * `?spawnY=600` alone, `tests/e2e/ocean.spec.ts`) still means the caller
 * wanted something other than the parked default, even though the other two
 * components fall back to `DEFAULT_SPAWN_POSITION`'s.
 */
export function hasSpawnOverride(search: string): boolean {
  const params = new URLSearchParams(search)
  return SPAWN_PARAMS.some((name) => params.has(name))
}
