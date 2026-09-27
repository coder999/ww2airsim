import sharp from 'sharp'

export type Rgba = { readonly data: Uint8Array; readonly width: number; readonly height: number }
export async function decode(png: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), width: info.width, height: info.height }
}
const px = (img: Rgba, x: number, y: number): [number, number, number] => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]
}
export const luma = (img: Rgba, x: number, y: number): number => { const [r, g, b] = px(img, x, y); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
/** Pixels within `radius` of (cx, cy) that pass `test`. */
export function count(img: Rgba, cx: number, cy: number, radius: number, test: (r: number, g: number, b: number) => boolean): number {
  let n = 0
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(img.height, cy + radius); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(img.width, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue
      const [r, g, b] = px(img, x, y)
      if (test(r, g, b)) n++
    }
  }
  return n
}
/** Fire after AgX: bright and clearly warmer than the sky or the sand. */
export const warm = (r: number, _g: number, b: number): boolean => r >= 200 && r - b >= 60
/** Spray and the water column: bright neutral water. Six-way lighting shades
 *  the placeholder below paper white even though it reads white in the frame. */
export const white = (r: number, g: number, b: number): boolean => 0.2126 * r + 0.7152 * g + 0.0722 * b >= 160
/** The 90th-percentile, over columns x0..x1, of each column's largest
 *  adjacent-row luma step between rows y0..y1: "a single-row step" (spec §7). */
export function rowStep(img: Rgba, x0: number, x1: number, y0: number, y1: number): number {
  const steps: number[] = []
  for (let x = x0; x <= x1; x++) {
    let worst = 0
    for (let y = y0; y < y1; y++) worst = Math.max(worst, Math.abs(luma(img, x, y + 1) - luma(img, x, y)))
    steps.push(worst)
  }
  steps.sort((a, b) => a - b)
  return steps[Math.floor(steps.length * 0.9)] ?? 0
}
