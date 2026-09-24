/** Shape and detail volumes (Plan 16a design §3), and the cumulus coverage-
 *  modulation field (Plan 16d design §2): R8, tileable, committed under
 *  content/sky/. Sizes are here, importable by both the Node build and the
 *  browser loader, so the two cannot disagree about a byte count. */
export const SHAPE_SIZE = 128
export const DETAIL_SIZE = 32
export const COVERAGE_SIZE = 64
export const shapeByteLength = (): number => SHAPE_SIZE ** 3
export const detailByteLength = (): number => DETAIL_SIZE ** 3
export const coverageByteLength = (): number => COVERAGE_SIZE ** 2
