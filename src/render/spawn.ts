import { v3, type Vec3 } from '../sim/math/vec3.js'

/**
 * Where the airplane starts: over open water, comfortably above the clean,
 * power-off stall (43.8 m/s in `content/aircraft/f6f-hellcat.json`), so the
 * first frame is already flying rather than falling.
 *
 * This is the literal that used to sit inline in `main.ts`'s `createState`
 * call. It moved here because `spawnPositionFromQuery` below has to be able
 * to fall back to it component by component, and a second copy of `(0, 600,
 * 0)` in this file would be exactly the two-sources-of-truth problem
 * `coarsestFetchedLevel` was extracted to solve in `lod.ts`.
 */
export const DEFAULT_SPAWN_POSITION: Vec3 = v3(0, 600, 0)

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
 * silent fallback would put the airplane back over open water and a terrain
 * test would then report zero validation errors because it never saw any
 * terrain -- indistinguishable from a passing run, which is the same trap
 * `adapter.spec.ts`'s `KeyC` check exists to close. `main.ts` routes the
 * throw to the failure screen, so it is visible rather than a console line.
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
