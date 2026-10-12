import { describe, expect, it } from 'vitest'
import { takramGameCloudsFragment } from '../../src/render/scene/takramGameShaders.js'

describe('Takram native cloud shader assembly', () => {
  it('adds the dense-FX inputs and march stop only when the pass owns a limit', () => {
    const plain = takramGameCloudsFragment()
    const limited = takramGameCloudsFragment(true)

    expect(plain).not.toContain('fxColourTexture')
    expect(limited).toContain('@group(0) @binding(7) var fxColourTexture')
    expect(limited).toContain('@group(0) @binding(8) var fxDenseTexture')
    expect(limited).toContain('let fxViewZ = 1000.0')
    expect(limited).toContain('farDistance = min(farDistance, fxViewZ')
  })
})
