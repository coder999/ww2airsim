/** Shape and detail volumes (Plan 16a design §3): R8, tileable, committed
 *  under content/sky/. Sizes are here, importable by both the Node build
 *  and the browser loader, so the two cannot disagree about a byte count. */
export const SHAPE_SIZE = 128
export const DETAIL_SIZE = 32
export const shapeByteLength = (): number => SHAPE_SIZE ** 3
export const detailByteLength = (): number => DETAIL_SIZE ** 3
