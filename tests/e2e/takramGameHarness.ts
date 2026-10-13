import type { Page } from '@playwright/test'
import { loadAirfield } from '../../tools/content/load.js'
import { spawnUrl, type DiagWindow } from './harness.js'

const tacloban = loadAirfield('tacloban').runway.center

export function takramFlightUrl(y: number, renderer: 'takram' | 'takram-tsl'): string {
  return `${spawnUrl({ x: tacloban.x, y, z: tacloban.z - 8000 })}&launch&cloudRenderer=${renderer}&cloudTier=high`
}

export function cloudOffUrl(y: number): string {
  return `${spawnUrl({ x: tacloban.x, y, z: tacloban.z - 8000 })}&launch&cloudTier=off`
}

export function validationErrors(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
}
