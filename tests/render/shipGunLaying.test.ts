import { describe, expect, it, vi } from 'vitest'
import { applyShipGunLaying } from '../../src/render/scene/shipGunLaying.js'
import type { ShipMountView } from '../../src/render/scene/ship.js'

const mount = (name: string): ShipMountView => ({
  name,
  kit: 'test',
  maxElevationRad: Math.PI / 2,
  setTraining: vi.fn(),
  setElevation: vi.fn(),
})

describe('ship gun-laying render bridge (Track M, M3)', () => {
  it('applies exact poses and fans one gallery pose out to every rendered gun', () => {
    const turret = mount('Turret1')
    const gun1 = mount('LightAA5_1')
    const gun2 = mount('LightAA5_2')
    applyShipGunLaying('dd', [turret, gun1, gun2], {
      dd: [
        { name: 'Turret1', targetId: 'ship', targetKind: 'ship', trainingRad: 0.4, elevationRad: 0.1 },
        { name: 'LightAA5', targetId: 'plane', targetKind: 'aircraft', trainingRad: -0.7, elevationRad: 0.3 },
      ],
    })
    expect(turret.setTraining).toHaveBeenCalledWith(0.4)
    expect(turret.setElevation).toHaveBeenCalledWith(0.1)
    for (const gun of [gun1, gun2]) {
      expect(gun.setTraining).toHaveBeenCalledWith(-0.7)
      expect(gun.setElevation).toHaveBeenCalledWith(0.3)
    }
  })

  it('returns every unmatched mount to rest, including after a target disappears', () => {
    const turret = mount('Turret1')
    applyShipGunLaying('dd', [turret], {
      dd: [{ name: 'Turret1', targetId: 'ship', targetKind: 'ship', trainingRad: 0.4, elevationRad: 0.1 }],
    })
    applyShipGunLaying('dd', [turret], {})
    expect(turret.setTraining).toHaveBeenLastCalledWith(0)
    expect(turret.setElevation).toHaveBeenLastCalledWith(0)
  })

  it('is harmless for a procedural ship with no mount views', () => {
    expect(() => applyShipGunLaying('boxes', [], {})).not.toThrow()
  })
})
