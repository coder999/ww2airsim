/**
 * Where the aeroplane's content lives, as a path and as the URL the browser
 * fetches.
 *
 * One constant rather than two literals because `main.ts` fetches it at
 * runtime and `tests/build/dist.test.ts` asserts the build puts it there.
 * Those two claims are only worth anything if they cannot drift apart, and
 * before Ruling R20 they were separate strings in separate files -- which is
 * precisely how the gap R14 found (a build that exits 0 and then 404s on its
 * own content) survives a green suite.
 */
export const AIRCRAFT_CONTENT_PATH = 'content/aircraft/f6f-hellcat.json'

/** The same file, as the browser asks for it. */
export const AIRCRAFT_CONTENT_URL = `/${AIRCRAFT_CONTENT_PATH}`
