/** Display formatting shared by every HQ screen and the (old) dossier. Imperial at display only (D9). */
const FT_PER_M = 1 / 0.3048
const KT_PER_MPS = 1.943844

export const formatHours = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}
export const formatFeet = (m: number): string => `${Math.round(m * FT_PER_M).toLocaleString('en-US')} ft`
export const formatKnots = (mps: number): string => `${Math.round(mps * KT_PER_MPS)} kt`
export const formatPoints = (n: number): string => Math.round(n).toLocaleString('en-US')
/** Adjusted score to one decimal (derived, never stored). */
export const formatAdjusted = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
