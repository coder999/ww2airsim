import type { Page } from '@playwright/test'

/** Mean grey and warm/cool of the frame with the DEV readout and the HUD bar cropped (rows 100 to height-60). */
export async function frameStats(page: Page, png: Buffer, rect?: { x: number; y: number; w: number; h: number }): Promise<{ gray: number; r: number; g: number; b: number }> {
  const vp = page.viewportSize()!
  const box = rect ?? { x: 0, y: 100, w: vp.width, h: vp.height - 160 }
  return page.evaluate(async ({ base64, box }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const { data } = ctx.getImageData(box.x, box.y, box.w, box.h)
    let r = 0, g = 0, b = 0
    const n = box.w * box.h
    for (let p = 0; p < n; p++) { r += data[p * 4]!; g += data[p * 4 + 1]!; b += data[p * 4 + 2]! }
    return { r: r / n, g: g / n, b: b / n, gray: (r + g + b) / (3 * n) }
  }, { base64: png.toString('base64'), box })
}

export type Rect = { x: number; y: number; w: number; h: number }

/** Luminance (0..255, Rec. 709 on the sRGB bytes) of every pixel in `rect`, row-major. Shared by night.spec.ts. */
export async function lumaGrid(page: Page, png: Buffer, rect: Rect): Promise<{ w: number; h: number; luma: number[] }> {
  return page.evaluate(async ({ base64, rect }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const { data } = ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
    const luma: number[] = []
    for (let p = 0; p < rect.w * rect.h; p++) luma.push(0.2126 * data[p * 4]! + 0.7152 * data[p * 4 + 1]! + 0.0722 * data[p * 4 + 2]!)
    return { w: rect.w, h: rect.h, luma }
  }, { base64: png.toString('base64'), rect })
}

/** Pixels brighter than their 11x11 neighborhood's mean by `margin`: a point-source (star) detector. */
export function countSpecks(g: { w: number; h: number; luma: number[] }, margin: number): number {
  let n = 0
  const R = 5
  for (let y = R; y < g.h - R; y += 1) {
    for (let x = R; x < g.w - R; x += 1) {
      const v = g.luma[y * g.w + x]!
      if (v < margin) continue
      let s = 0
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) s += g.luma[(y + dy) * g.w + x + dx]!
      if (v - s / ((2 * R + 1) ** 2) > margin) n++
    }
  }
  return n
}
