export const M_PER_FT = 0.3048
export const M_PER_NMI = 1852

const MAX_CONTOUR_LEVELS = 40
const INDEX_EVERY = 5
const NMI_CHOICES = [0.25, 0.5, 1, 2, 5, 10, 20, 50] as const

/** Contour interval, in feet, for a chart whose visible width is `spanM`. */
export function contourIntervalFt(spanM: number): number {
  if (spanM < 12_000) return 50
  if (spanM < 40_000) return 100
  if (spanM < 90_000) return 200
  return 500
}

export type ContourLevel = { readonly levelM: number; readonly levelFt: number; readonly index: boolean }

export function contourLevels(
  maxHeightM: number,
  wantedIntervalFt: number,
): { readonly intervalFt: number; readonly levels: readonly ContourLevel[] } {
  const maxFt = maxHeightM / M_PER_FT
  let intervalFt = wantedIntervalFt
  while (Math.floor(maxFt / intervalFt) > MAX_CONTOUR_LEVELS) intervalFt *= 2
  const levels: ContourLevel[] = []
  for (let n = 1; n * intervalFt <= maxFt; n++) {
    const levelFt = n * intervalFt
    levels.push({ levelM: levelFt * M_PER_FT, levelFt, index: n % INDEX_EVERY === 0 })
  }
  return { intervalFt, levels }
}

/** The longest round nautical-mile bar that stays within 1.4x the target width. */
export function scaleBar(metersPerPixel: number, targetPx = 140): { nmi: number; px: number; label: string } {
  const px = (nmi: number): number => (nmi * M_PER_NMI) / metersPerPixel
  let chosen: number = NMI_CHOICES[0]
  for (const nmi of NMI_CHOICES) if (px(nmi) <= targetPx * 1.4) chosen = nmi
  return { nmi: chosen, px: px(chosen), label: `${chosen} NAUTICAL ${chosen === 1 ? 'MILE' : 'MILES'}` }
}
