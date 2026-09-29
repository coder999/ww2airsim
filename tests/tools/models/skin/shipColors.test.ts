// tests/tools/models/skin/shipColors.test.ts
import { describe, expect, it } from 'vitest'
import { hexToSrgb01, withShipColors } from '../../../../tools/models/skin/shipColors.js'
import { SHIP_PALETTES } from '../../../../src/render/scene/shipPalette.js'
import { fixtureSidecar } from './fixture.js'
import type { ShipEntry } from '../../../../tools/models/manifest.js'

const ship = (materials: Record<string, string>): ShipEntry => ({ spec: 'kagero-dd', fit: 'hull', kind: 'full-hull', keelM: -3.76, palette: 'ijn', materials, otherMaterials: 'classify', smokeOrigin: [0, 0, 0], bow: 'narrow-end' } as ShipEntry)

describe('withShipColors (DP2, Ruling S2)', () => {
  const side = fixtureSidecar({ roles: { hull: [0.36, 0.4, 0.44], deck: [0.23, 0.25, 0.27], dark: [0.09, 0.15, 0.14] } })
  it('paints each mapped role in its palette color, and keeps a non-ship role (dark) as the kit wrote it', () => {
    const out = withShipColors(side, ship({ hull: 'hull', deck: 'deck' }))
    expect(out.roles['hull']).toEqual(hexToSrgb01(SHIP_PALETTES.ijn.hull))
    expect(out.roles['deck']).toEqual(hexToSrgb01(SHIP_PALETTES.ijn.deck))
    expect(out.roles['dark']).toEqual([0.09, 0.15, 0.14])
    expect(hexToSrgb01(0x686b69)).toEqual([0x68 / 255, 0x6b / 255, 0x69 / 255])
  })
  it('refuses a ship role the entry leaves unmapped (it would paint the kit\'s authoring gray), and keep or mask', () => {
    expect(() => withShipColors(side, ship({ hull: 'hull' }))).toThrow(/"deck" is a ship role but ship.materials does not map it/)
    expect(() => withShipColors(side, ship({ hull: 'keep', deck: 'deck' }))).toThrow(/keep/)
  })
})
